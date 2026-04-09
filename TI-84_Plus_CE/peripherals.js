function normalizePort(port) {
  return Number(port) & 0xff;
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

  register(0x00, createCpuControlHandler(state));
  register(0x03, createGpioHandler(state));
  register(0x06, createFlashHandler(state));
  register([0x10, 0x18], createTimerHandler(state));
  register(0x28, createPllHandler(state));

  return {
    read,
    write,
    register,
    getState,
  };
}
