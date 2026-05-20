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

const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_AVAILABLE_FLAG_ADDR = 0xD00080;
const KEY_AVAILABLE_FLAG_MASK = 0x08;

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
      return 0x0C;
    },

    write(port, value) {
      // Only reset the lock countdown when the PLL config actually changes.
      // Real hardware doesn't re-trigger a relock when the same value is
      // written again — the boot loop writes 0x04 repeatedly and reads back
      // immediately, so an unconditional reset would prevent lock from ever
      // being reported. A genuinely new config value does need fresh lock time.
      state.pll.configured = true;
      if (value !== state.pll.lastWrite) {
        state.pll.remainingReads = state.pll.delay;
        state.pll.locked = false;
      }
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
      return state.pll.locked ? 0xD4 : 0xD0;
    },

    write(port, value) {
      state.flash.lastWrite = value;
    },
  };
}

function createFlashControllerHandler(state) {
  return {
    read(port) {
      if (port === 0x2001) {
        return 0x00;
      }

      return 0x00;
    },

    write(port, value) {
      state.flashController.lastCommand = port === 0x2000 ? value : state.flashController.lastCommand;
      state.flashController.writes.set(port, value);
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

function createCsBaseHandler(state) {
  return {
    read(port) {
      return state.csBase[port] ?? 0xFF;
    },

    write(port, value) {
      state.csBase[port] = value;
    },
  };
}

function createPhase99CPollUnlockHandler(readValue = 0x00) {
  const normalizedReadValue = normalizeValue(readValue);

  return {
    read() {
      return normalizedReadValue;
    },

    write() {},
  };
}

// CE keyboard controller ports (0xA000-0xA01E).
//
// The OS scan routine at 0x003C63 uses two read modes:
//   1. Combined read (port 0xA008 / 0xA010): returns the OR of inverted
//      key data across ALL matrix groups (active-HIGH: 0x00 = no key,
//      non-zero = at least one key pressed somewhere). The group-select
//      register is ignored for this read — it always scans everything.
//   2. Per-group read (ports 0xA012, 0xA014, … 0xA01E): each port reads
//      a single matrix group, active-HIGH. Port 0xA012 = keyMatrix[0],
//      0xA014 = keyMatrix[1], … 0xA01E = keyMatrix[6].
//
// The OS algorithm:
//   a) Writes 0x01 to 0xA000, reads 0xA008: quick "any key?" check.
//   b) If non-zero, writes 0x00 to 0xA000 (clear group select).
//   c) Reads ports 0xA012..0xA01E individually to find WHICH group(s)
//      have a pressed key and to detect multi-key (error path at 0x003D47).
//
// Active-HIGH convention: the scan routine uses JR Z (skip if zero = no key)
// for both the combined read and the per-group reads.
function createKeyboardControllerHandler(state, keyboardState) {
  // Combined "any key pressed?" — OR of all inverted groups.
  function readAnyKeyPressed() {
    let result = 0x00;

    for (let group = 0; group < keyboardState.keyMatrix.length; group++) {
      result |= (~keyboardState.keyMatrix[group] & 0xFF);
    }

    return result;
  }

  // Per-group read, active-HIGH (inverted from the active-low matrix).
  function readSingleGroup(group) {
    if (group < 0 || group >= keyboardState.keyMatrix.length) {
      return 0x00;
    }

    return ~keyboardState.keyMatrix[group] & 0xFF;
  }

  return {
    read(port) {
      if (port === 0xA000) {
        return state.keyboardController.groupSelect & 0xFF;
      }

      // Combined key-detect reads (active-HIGH).
      if (port === 0xA008 || port === 0xA010) {
        return readAnyKeyPressed();
      }

      // Per-group reads: port 0xA012 = group 0, 0xA014 = group 1, …
      if (port >= 0xA012 && port <= 0xA01E && (port & 1) === 0) {
        const group = (port - 0xA012) >> 1;
        return readSingleGroup(group);
      }

      return 0x00;
    },

    write(port, value) {
      if (port === 0xA000) {
        state.keyboardController.groupSelect = (state.keyboardController.groupSelect & 0xFF00) | value;
        keyboardState.groupSelect = state.keyboardController.groupSelect & 0xFF;
        return;
      }

      if (port === 0xA001) {
        state.keyboardController.groupSelect = (state.keyboardController.groupSelect & 0x00FF) | (value << 8);
      }
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
      readValue: normalizeValue(options.gpioValue ?? 0xee),
      lastWrite: 0x00,
    },
    flash: {
      lastWrite: 0x00,
    },
    flashController: {
      lastCommand: 0x00,
      writes: new Map(),
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
    keyboardController: {
      groupSelect: 0xFFFF,
    },
    csBase: { 0x1D: 0xFF, 0x1E: 0xFF, 0x1F: 0xFF },
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
      flashController: {
        lastCommand: state.flashController.lastCommand,
        writes: cloneWrites(state.flashController.writes),
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
      keyboardController: {
        groupSelect: state.keyboardController.groupSelect,
      },
      csBase: { ...state.csBase },
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
  // The boot-side NMI stub masks bits 0-1 from port 0x3D, mirrors them to
  // port 0x3E, and only loops back to 0x000047 when the masked value is zero.
  // Returning a non-zero default keeps the emulator on the forward recovery
  // path instead of forcing the signature-check retry loop every time NMI
  // fires during early boot.
  // The NMI handler reads 0x3D to determine interrupt source.
  // Returning 0x00 means "no recognized interrupt" → NMI handler takes the
  // alternate path (0x000047 → call 0x0008BB).
  register(0x3d, {
    read() { return 0x01; },
    write() {},
  });
  register(0x3e, {
    read() { return 0x00; },
    write() {},
  });

  // Interrupt controller (FTINTC010) at ports 0x5000-0x501F.
  // The post-HALT ISR currently relies on:
  //   0x5014-0x5016: masked status bytes 0..2 (read)
  //   0x5008-0x500A: acknowledge bytes 0..2 (write)
  //   0x5004-0x5006: enable-mask bytes 0..2 (read/write)
  // Keyboard input injection is poll-driven via RAM state, not FTINTC010 bits.
  const intcState = {
    rawStatus: 0x00000000,    // port 0x5000: raw interrupt status
    enableMask: 0x00000000,   // port 0x5004: interrupt enable mask
    latchMode: 0x00000000,    // port 0x500C: latch mode control
    inversion: 0x00000000,    // port 0x5010: signal inversion
  };

  function setKeyPressed(mem, scanCode) {
    if (!mem) {
      return;
    }

    mem[KEY_SCAN_CODE_ADDR] = scanCode & 0xFF;
    mem[KEY_AVAILABLE_FLAG_ADDR] = (mem[KEY_AVAILABLE_FLAG_ADDR] | KEY_AVAILABLE_FLAG_MASK) & 0xFF;
  }

  function clearKeyPressed(mem) {
    if (!mem) {
      return;
    }

    mem[KEY_SCAN_CODE_ADDR] = 0x00;
    mem[KEY_AVAILABLE_FLAG_ADDR] = mem[KEY_AVAILABLE_FLAG_ADDR] & ~KEY_AVAILABLE_FLAG_MASK;
  }

  function setKeyboardIRQ(active) {
    // Deprecated: keyboard input on the CE is poll-driven, not interrupt-driven.
    // Keep the legacy API surface for older browser shell code paths.
  }

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

  // Keyboard scan port 0x01
  // Write: selects key group (active low bit pattern)
  // Read: returns key status for selected group(s) (0xFF = no keys pressed)
  const keyboardState = { groupSelect: 0xFF, keyMatrix: new Uint8Array(8).fill(0xFF) };

  register(0x01, {
    read() {
      let result = 0xFF;
      for (let g = 0; g < 8; g++) {
        if (((keyboardState.groupSelect >> g) & 1) === 0) {
          result &= keyboardState.keyMatrix[g];
        }
      }
      return result;
    },
    write(port, value) {
      keyboardState.groupSelect = value;
    },
  });
  register({ start: 0xa000, end: 0xa01e }, createKeyboardControllerHandler(state, keyboardState));

  register(0x00, createCpuControlHandler(state));
  register([0x1D, 0x1F], createCsBaseHandler(state));
  register(0x03, createGpioHandler(state));
  register(0x06, createFlashHandler(state));
  register([0x10, 0x18], createTimerHandler(state));
  register(0x28, createPllHandler(state));
  // Flash/NAND controller ports (0x2000-0x200F).
  // ROM analysis:
  //   - 0x006D42 is the only observed direct flash-port handshake in ROM bytes:
  //     LD BC,0x002000 ; OUT (C),A ; INC BC ; IN A,(C) ; BIT 3,A ; JR NZ,0x006D57
  //   - probe-phase365-disasm-006D57.mjs documents that loop as a busy-poll on bit 3.
  //   - Literal LD BC,0x002001 also appears at 0x001899 and 0x04574C, but both sites
  //     feed LDIR setup and do not issue IN/OUT against the port.
  // Returning 0x00 from 0x2001 keeps bit 3 clear so the boot poll can complete.
  register({ start: 0x2000, end: 0x200f }, createFlashControllerHandler(state));
  // Phase 103 report: TI-84_Plus_CE/phase103-port-d00c-d00d-report.md says idle SPI status is D00C=0x02 and D00D=0x00.
  register(0xd00c, createPhase99CPollUnlockHandler(0x02));
  register(0xd00d, createPhase99CPollUnlockHandler(0x00));
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

  // LCD DMA controller ports (0x8000-0x8041).
  const lcdDmaState = {
    timing: [0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    control: 0x00,
    hStart: 0x00,
    hEnd: 0x00,
    vStart: 0x00,
    vEnd: 0x00,
    misc: 0x00,
  };

  register({ start: 0x8000, end: 0x8041 }, {
    read(port) {
      switch (port & 0xffff) {
        case 0x8000: return lcdDmaState.timing[0];
        case 0x8004: return lcdDmaState.timing[1];
        case 0x8008: return lcdDmaState.timing[2];
        case 0x800c: return lcdDmaState.timing[3];
        case 0x800d: return lcdDmaState.timing[4];
        case 0x8010: return lcdDmaState.timing[5];
        case 0x8014: return lcdDmaState.timing[6];
        case 0x8018: return lcdDmaState.timing[7];
        case 0x8020: return lcdDmaState.control;
        case 0x8024: return lcdDmaState.hStart;
        case 0x8028: return lcdDmaState.hEnd;
        case 0x802c: return lcdDmaState.vStart;
        case 0x8030: return lcdDmaState.vEnd;
        case 0x8034: return lcdDmaState.misc;
        case 0x8040: return 0x00;
        case 0x8041: return 0x01;
        default: return 0x00;
      }
    },

    write(port, value) {
      switch (port & 0xffff) {
        case 0x8010:
          lcdDmaState.timing[5] = value;
          return;
        case 0x8014:
          lcdDmaState.timing[6] = value;
          return;
        case 0x8018:
          lcdDmaState.timing[7] = value;
          return;
        case 0x8020:
          lcdDmaState.control = value;
          return;
        case 0x8024:
          lcdDmaState.hStart = value;
          return;
        case 0x8028:
          lcdDmaState.hEnd = value;
          return;
        case 0x802c:
          lcdDmaState.vStart = value;
          return;
        case 0x8030:
          lcdDmaState.vEnd = value;
          return;
        case 0x8034:
          lcdDmaState.misc = value;
          return;
        default:
          return;
      }
    },
  });

  // LCD backlight / power control ports (0xB020, 0xB024).
  // Boot code writes to both during init. Default 0xFF = full power / max brightness.
  const backlightState = { power: 0xFF, brightness: 0xFF };

  register(0xB020, {
    read() { return backlightState.power; },
    write(port, value) { backlightState.power = value; },
  });

  register(0xB024, {
    read() { return backlightState.brightness; },
    write(port, value) { backlightState.brightness = value; },
  });

  const lcdSpiState = {
    panel3160: [0, 0, 0, 0],
    panel3180: [0, 0, 0, 0],
    panelWrite: [0, 0, 0, 0],
  };

  register({ start: 0x3161, end: 0x316d }, {
    read(port) {
      const offset = port - 0x3161;
      if (offset % 4 !== 0) {
        return 0x00;
      }

      return lcdSpiState.panel3160[Math.floor(offset / 4)] ?? 0x00;
    },
    write(port, value) {
      const offset = port - 0x3161;
      if (offset % 4 !== 0) {
        return;
      }

      lcdSpiState.panel3160[Math.floor(offset / 4)] = value;
    },
  });

  register({ start: 0x3181, end: 0x318d }, {
    read(port) {
      const offset = port - 0x3181;
      if (offset % 4 !== 0) {
        return 0x00;
      }

      return lcdSpiState.panel3180[Math.floor(offset / 4)] ?? 0x00;
    },
    write(port, value) {
      const offset = port - 0x3181;
      if (offset % 4 !== 0) {
        return;
      }

      lcdSpiState.panel3180[Math.floor(offset / 4)] = value;
    },
  });

  register({ start: 0x31a8, end: 0x31ab }, {
    read(port) {
      return lcdSpiState.panelWrite[port - 0x31a8] ?? 0x00;
    },
    write(port, value) {
      lcdSpiState.panelWrite[port - 0x31a8] = value;
    },
  });

  // USB controller ports - values chosen for the shortest success path through the 0x006EDA health check.
  register(0x0f, {
    read() { return 0x80; }, // bit 7 = USB power present
    write() {},
  });
  register(0x3030, {
    read() { return 0x01; }, // bit 0 = VBUS detected
    write() {},
  });
  register(0x3031, {
    read() { return 0x0c; }, // bits 3:2 = D+/D- line state
    write() {},
  });
  register(0x3082, {
    read() { return 0x30; }, // bit 4 = PLL locked, bit 5 = port status OK
    write() {},
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
    setKeyPressed,
    clearKeyPressed,
    setKeyboardIRQ,
    keyboard: keyboardState,
    keyboardController: state.keyboardController,
    setMatrixKey(group, bit, pressed) {
      if (pressed) {
        keyboardState.keyMatrix[group] &= ~(1 << bit);
      } else {
        keyboardState.keyMatrix[group] |= (1 << bit);
      }
    },
  };
}
