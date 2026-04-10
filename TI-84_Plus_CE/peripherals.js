function normalizePort(port) {
  return Number(port) & 0xffff;
}

function normalizeValue(value) {
  return Number(value) & 0xff;
}

function normalizeRange(portOrRange) {
  if (Number.isInteger(portOrRange)) {
    const port = normalizePort(portOrRange);
    return { start: port, end: port };
  }

  if (Array.isArray(portOrRange) && portOrRange.length === 2) {
    const start = normalizePort(portOrRange[0]);
    const end = normalizePort(portOrRange[1]);
    return start <= end ? { start, end } : { start: end, end: start };
  }

  if (portOrRange && typeof portOrRange === 'object') {
    const start = normalizePort(portOrRange.start ?? portOrRange.from);
    const end = normalizePort(portOrRange.end ?? portOrRange.to ?? start);
    return start <= end ? { start, end } : { start: end, end: start };
  }

  throw new TypeError('register() expects a port number or range');
}

function normalizeHandler(handler) {
  if (typeof handler === 'function') {
    return { read: handler };
  }

  if (handler && typeof handler === 'object') {
    return handler;
  }

  throw new TypeError('register() expects a handler object or function');
}

function formatHex(value) {
  return `0x${value.toString(16).padStart(2, '0')}`;
}

function cloneWrites(map) {
  const result = {};

  for (const [port, value] of map.entries()) {
    result[port] = value;
  }

  return result;
}

function createPllHandler(state) {
  return {
    read() {
      if (!state.pll.configured) {
        return 0x00;
      }

      if (state.pll.remainingReads > 0) {
        state.pll.remainingReads--;
        state.pll.locked = false;
        return 0x00;
      }

      state.pll.locked = true;
      return 0x04;
    },

    write(port, value) {
      if (!state.pll.configured || value !== state.pll.lastWrite) {
        state.pll.remainingReads = state.pll.delay;
        state.pll.locked = false;
      }
      state.pll.configured = true;
      state.pll.lastWrite = value;
    },
  };
}

function createCpuControlHandler(state) {
  return {
    read() {
      return state.cpuControl.value;
    },

    write(port, value) {
      state.cpuControl.value = value;
    },
  };
}

function createGpioHandler(state) {
  return {
    read() {
      return state.gpio.readValue;
    },

    write(port, value) {
      state.gpio.lastWrite = value;
    },
  };
}

function createFlashHandler(state) {
  return {
    read() {
      return 0x00;
    },

    write(port, value) {
      state.flash.lastWrite = value;
    },
  };
}

function createTimerHandler(state) {
  return {
    read() {
      return 0x00;
    },

    write(port, value) {
      state.timers.writes.set(port, value);
    },
  };
}

export function createPeripheralBus(options = {}) {
  const trace = options.trace === true;
  const handlers = new Map();
  const state = {
    cpuControl: {
      value: 0x00,
    },
    gpio: {
      readValue: normalizeValue(options.gpioValue ?? 0xff),
      lastWrite: 0x00,
    },
    flash: {
      lastWrite: 0x00,
    },
    timers: {
      writes: new Map(),
    },
    pll: {
      configured: false,
      delay: Math.max(0, Number(options.pllDelay ?? 2) | 0),
      remainingReads: 0,
      locked: false,
      lastWrite: 0x00,
    },
  };

  function logTrace(message) {
    if (!trace || typeof console === 'undefined') {
      return;
    }

    console.log(message);
  }

  function register(portOrRange, handler) {
    const range = normalizeRange(portOrRange);
    const normalizedHandler = normalizeHandler(handler);

    for (let port = range.start; port <= range.end; port++) {
      handlers.set(port, normalizedHandler);
    }
  }

  function read(port) {
    const normalizedPort = normalizePort(port);
    const handler = handlers.get(normalizedPort);

    if (!handler || typeof handler.read !== 'function') {
      logTrace(`[peripherals] read ${formatHex(normalizedPort)} => 0xff`);
      return 0xff;
    }

    const value = normalizeValue(handler.read(normalizedPort, state));
    logTrace(`[peripherals] read ${formatHex(normalizedPort)} => ${formatHex(value)}`);
    return value;
  }

  function write(port, value) {
    const normalizedPort = normalizePort(port);
    const normalizedValue = normalizeValue(value);
    const handler = handlers.get(normalizedPort);

    if (handler && typeof handler.write === 'function') {
      handler.write(normalizedPort, normalizedValue, state);
    }

    logTrace(`[peripherals] write ${formatHex(normalizedPort)} <= ${formatHex(normalizedValue)}`);
  }

  function getState() {
    return {
      cpuControl: {
        value: state.cpuControl.value,
      },
      gpio: {
        readValue: state.gpio.readValue,
        lastWrite: state.gpio.lastWrite,
      },
      flash: {
        lastWrite: state.flash.lastWrite,
      },
      timers: {
        writes: cloneWrites(state.timers.writes),
      },
      pll: {
        configured: state.pll.configured,
        delay: state.pll.delay,
        remainingReads: state.pll.remainingReads,
        locked: state.pll.locked,
        lastWrite: state.pll.lastWrite,
      },
    };
  }

  // Interrupt controller state
  const interruptState = {
    irqPending: false,
    nmiPending: false,
    timerEnabled: options.timerInterrupt !== false,
    timerInterval: Math.max(1, Number(options.timerInterval ?? 200) | 0),
    timerCounter: 0,
    timerMode: options.timerMode ?? 'irq', // 'irq' or 'nmi'
    totalTicks: 0,
  };

  function tick() {
    interruptState.totalTicks++;

    if (!interruptState.timerEnabled) return;

    interruptState.timerCounter++;

    if (interruptState.timerCounter >= interruptState.timerInterval) {
      if (interruptState.timerMode === 'nmi') {
        interruptState.nmiPending = true;
      } else {
        interruptState.irqPending = true;
      }
      // Set OS timer bit (bit 4) in interrupt controller raw status
      if (state.intc) {
        state.intc.rawStatus |= (1 << 4);
      }
      interruptState.timerCounter = 0;
    }
  }

  function hasPendingIRQ() {
    return interruptState.irqPending;
  }

  function hasPendingNMI() {
    return interruptState.nmiPending;
  }

  function acknowledgeIRQ() {
    interruptState.irqPending = false;
  }

  function acknowledgeNMI() {
    interruptState.nmiPending = false;
  }

  function triggerNMI() {
    interruptState.nmiPending = true;
  }

  function triggerIRQ() {
    interruptState.irqPending = true;
  }

  // Interrupt status/acknowledge registers (ports 0x3D-0x3E)
  // The NMI handler reads 0x3D to determine interrupt source.
  // Returning 0x00 means "no recognized interrupt" → NMI handler takes the
  // alternate path (0x000047 → call 0x0008BB).
  register(0x3d, {
    read() { return 0x00; },
    write() {},
  });
  register(0x3e, {
    read() { return 0x00; },
    write() {},
  });

  // Interrupt controller (FTINTC010) at ports 0x5000-0x5014
  // Bit mapping: 0=ON, 1-3=timers, 4=OS timer, 10=keyboard, 11=LCD, 12=RTC, 13=USB
  const intcState = {
    rawStatus: 0x00000000,    // port 0x5000: raw interrupt status
    enableMask: 0x00000000,   // port 0x5004: interrupt enable mask
    latchMode: 0x00000000,    // port 0x500C: latch mode control
    inversion: 0x00000000,    // port 0x5010: signal inversion
  };

  // Expose intcState so tick() can set raw status bits
  state.intc = intcState;

  function createIntcHandler() {
    return {
      read(port) {
        const reg = port & 0x1f;
        if (reg === 0x00) return intcState.rawStatus & 0xff;        // raw status (low byte)
        if (reg === 0x01) return (intcState.rawStatus >> 8) & 0xff;
        if (reg === 0x02) return (intcState.rawStatus >> 16) & 0xff;
        if (reg === 0x04) return intcState.enableMask & 0xff;       // enable mask (low byte)
        if (reg === 0x05) return (intcState.enableMask >> 8) & 0xff;
        if (reg === 0x06) return (intcState.enableMask >> 16) & 0xff;
        if (reg === 0x14) return (intcState.rawStatus & intcState.enableMask) & 0xff;  // masked status
        if (reg === 0x15) return ((intcState.rawStatus & intcState.enableMask) >> 8) & 0xff;
        if (reg === 0x16) return ((intcState.rawStatus & intcState.enableMask) >> 16) & 0xff;
        return 0x00;
      },
      write(port, value) {
        const reg = port & 0x1f;
        if (reg === 0x04) intcState.enableMask = (intcState.enableMask & 0xffff00) | value;
        if (reg === 0x05) intcState.enableMask = (intcState.enableMask & 0xff00ff) | (value << 8);
        if (reg === 0x06) intcState.enableMask = (intcState.enableMask & 0x00ffff) | (value << 16);
        if (reg === 0x08) intcState.rawStatus &= ~value;             // acknowledge low byte
        if (reg === 0x09) intcState.rawStatus &= ~(value << 8);
        if (reg === 0x0a) intcState.rawStatus &= ~(value << 16);
        if (reg === 0x0c) intcState.latchMode = (intcState.latchMode & 0xffff00) | value;
        if (reg === 0x0d) intcState.latchMode = (intcState.latchMode & 0xff00ff) | (value << 8);
        if (reg === 0x10) intcState.inversion = (intcState.inversion & 0xffff00) | value;
        if (reg === 0x11) intcState.inversion = (intcState.inversion & 0xff00ff) | (value << 8);
      },
    };
  }

  register(0x00, createCpuControlHandler(state));
  register(0x03, createGpioHandler(state));
  register(0x06, createFlashHandler(state));
  register([0x10, 0x18], createTimerHandler(state));
  register(0x28, createPllHandler(state));
  // Memory controller / flash wait states (ports 0x1000-0x1005)
  // Port 0x1005: flash wait states (OS default 0x04 → 9 wait states per flash read)
  const memCtrlState = { waitStates: 0x04, bankCtrl: 0x00 };
  register({ start: 0x1000, end: 0x1005 }, {
    read(port) {
      if ((port & 0xffff) === 0x1005) return memCtrlState.waitStates;
      if ((port & 0xffff) === 0x1002) return memCtrlState.bankCtrl;
      return 0x00;
    },
    write(port, value) {
      if ((port & 0xffff) === 0x1005) memCtrlState.waitStates = value;
      if ((port & 0xffff) === 0x1002) memCtrlState.bankCtrl = value;
    },
  });

  register({ start: 0x5000, end: 0x501f }, createIntcHandler());

  return {
    read,
    write,
    register,
    getState,
    tick,
    hasPendingIRQ,
    hasPendingNMI,
    acknowledgeIRQ,
    acknowledgeNMI,
    triggerNMI,
    triggerIRQ,
  };
}
