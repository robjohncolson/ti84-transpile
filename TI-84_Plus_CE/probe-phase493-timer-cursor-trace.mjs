#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const ROM_URL = new URL('./ROM.rom', import.meta.url);
const TIMER_ISR_ENTRY = 0x0019be;
const TIMER_ISR_SERVICE = 0x001acf;
const ISR_TRACE_START = 0x001900;
const ISR_TRACE_END = 0x001c00;
const CURSOR_START = 0x060000;
const CURSOR_END = 0x062000;
const IY_BASE = 0xd00080;
const CURSOR_FLAGS_ADDR = IY_BASE + 0x12;
const CURSOR_ROW_ADDR = 0xd00595;
const CURSOR_COL_ADDR = 0xd00596;
const IDLE_PC = 0x03030e;
const TIMER_INTERVAL = 750;
const PER_FLAG_TRACE_LIMIT = 200_000;
const TOTAL_TRACE_LIMIT = 2_000_000;
const TIGHT_LOOP_LIMIT = 10_000;
const TIGHT_LOOP_REGION_SIZE = 0x100;

const BOOT_STAGES = [
  { name: 'stage1', pc: 0x000000, steps: 12_000 },
  { name: 'stage2', pc: 0x0002b0, steps: 5_000 },
  { name: 'stage3', pc: 0x020000, steps: 35_000 },
];

const CURSOR_FLAG_VALUES = [
  0x00, 0x01, 0x02, 0x04, 0x08,
  0x10, 0x20, 0x40, 0x80, 0xff,
];

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function exportFrom(module, name) {
  return module[name] ?? module.default?.[name];
}

function tryCreate(label, candidates) {
  const errors = [];
  for (const candidate of candidates) {
    try {
      const value = candidate.fn();
      if (value !== null && value !== undefined) {
        return { value, via: candidate.name };
      }
      errors.push(`${candidate.name}: returned ${value}`);
    } catch (error) {
      errors.push(`${candidate.name}: ${error.message}`);
    }
  }
  throw new Error(`${label} failed:\n${errors.join('\n')}`);
}

function invokeOptional(target, names, argsVariants) {
  for (const name of names) {
    if (typeof target?.[name] !== 'function') {
      continue;
    }
    for (const args of argsVariants) {
      try {
        target[name](...args);
        return `${name}(${args.length} args)`;
      } catch {
        // Try the next plausible signature.
      }
    }
  }
  return null;
}

function arrayOffsetFor(address, length) {
  const addr = address & 0xffffff;
  if (addr < length) {
    return addr;
  }
  const ramOffset = addr - 0xd00000;
  if (ramOffset >= 0 && ramOffset < length) {
    return ramOffset;
  }
  return null;
}

function directByteArray(target) {
  if (target instanceof Uint8Array) {
    return target;
  }
  if (ArrayBuffer.isView(target) && target.BYTES_PER_ELEMENT === 1) {
    return target;
  }
  return null;
}

function memoryArrays(memory) {
  const arrays = [];
  const topLevel = directByteArray(memory);
  if (topLevel) {
    arrays.push({ name: 'memory', bytes: topLevel });
  }
  for (const name of ['data', 'bytes', 'mem', 'memory', 'ram', 'rom', 'ROM', 'romBytes', 'romData']) {
    const bytes = directByteArray(memory?.[name]);
    if (bytes) {
      arrays.push({ name, bytes });
    }
  }
  return arrays;
}

function readByte(memory, address) {
  const addr = address & 0xffffff;
  for (const name of ['read8', 'readByte', 'read', 'getByte', 'peek', 'memRead']) {
    if (typeof memory?.[name] === 'function') {
      const value = memory[name](addr);
      if (value !== undefined) {
        return value & 0xff;
      }
    }
  }
  for (const { bytes } of memoryArrays(memory)) {
    const offset = arrayOffsetFor(addr, bytes.length);
    if (offset !== null) {
      return bytes[offset] & 0xff;
    }
  }
  throw new Error(`No byte reader for ${hex(addr)}`);
}

function tryReadByte(memory, address) {
  try {
    return readByte(memory, address);
  } catch {
    return null;
  }
}

function writeByte(memory, address, value) {
  const addr = address & 0xffffff;
  const byte = value & 0xff;
  for (const name of ['write8', 'writeByte', 'write', 'setByte', 'poke', 'memWrite']) {
    if (typeof memory?.[name] === 'function') {
      memory[name](addr, byte);
      return `${name}(${hex(addr)}, ${hex(byte, 2)})`;
    }
  }
  if (typeof memory?.set === 'function' && !(memory instanceof Set)) {
    memory.set(addr, byte);
    return `set(${hex(addr)}, ${hex(byte, 2)})`;
  }
  for (const { name, bytes } of memoryArrays(memory)) {
    const offset = arrayOffsetFor(addr, bytes.length);
    if (offset !== null) {
      bytes[offset] = byte;
      return `${name}[${hex(offset)}]`;
    }
  }
  throw new Error(`No byte writer for ${hex(addr)}`);
}

function read24(memory, address) {
  const lo = readByte(memory, address);
  const mid = readByte(memory, address + 1);
  const hi = readByte(memory, address + 2);
  return (lo | (mid << 8) | (hi << 16)) & 0xffffff;
}

function romLooksLoaded(memory, rom) {
  if (!rom.length) {
    return true;
  }
  const first = tryReadByte(memory, 0);
  const second = tryReadByte(memory, 1);
  return first === rom[0] && second === rom[1];
}

function loadRomIntoMemory(memory, rom) {
  if (romLooksLoaded(memory, rom)) {
    return 'already loaded';
  }

  const method = invokeOptional(
    memory,
    ['loadROM', 'loadRom', 'loadROMImage', 'loadRomImage', 'setROM', 'setRom', 'load'],
    [[rom], [rom, 0], [0, rom]]
  );
  if (method && romLooksLoaded(memory, rom)) {
    return method;
  }

  for (const { name, bytes } of memoryArrays(memory)) {
    if (bytes.length >= rom.length) {
      bytes.set(rom, 0);
      return `${name}.set(rom)`;
    }
  }

  for (let address = 0; address < rom.length; address += 1) {
    writeByte(memory, address, rom[address]);
  }
  return 'byte writer';
}

function setPropertyIn(target, keys, value) {
  if (!target) {
    return null;
  }
  for (const key of keys) {
    if (key in target) {
      target[key] = value;
      return key;
    }
  }
  return null;
}

function getPropertyIn(target, keys) {
  if (!target) {
    return null;
  }
  for (const key of keys) {
    if (typeof target[key] === 'number') {
      return target[key] & 0xffffff;
    }
  }
  return null;
}

function setPC(cpu, value) {
  const pc = value & 0xffffff;
  const method = invokeOptional(cpu, ['setPC', 'setPc'], [[pc]]);
  if (method) {
    return method;
  }
  for (const target of [cpu, cpu?.registers, cpu?.regs, cpu?.state]) {
    const key = setPropertyIn(target, ['pc', 'PC'], pc);
    if (key) {
      return key;
    }
  }
  cpu.pc = pc;
  return 'pc fallback';
}

function getPC(cpu) {
  for (const target of [cpu, cpu?.registers, cpu?.regs, cpu?.state]) {
    const pc = getPropertyIn(target, ['pc', 'PC']);
    if (pc !== null) {
      return pc;
    }
  }
  throw new Error('Unable to read CPU PC');
}

function setRegister(cpu, name, value) {
  const keys = [name, name.toUpperCase()];
  const methods = ['setRegister', 'setReg'];
  for (const method of methods) {
    if (typeof cpu?.[method] === 'function') {
      try {
        cpu[method](name, value);
        return `${method}(${name})`;
      } catch {
        // Fall through to property-based forms.
      }
    }
  }
  for (const target of [cpu, cpu?.registers, cpu?.regs, cpu?.state]) {
    const key = setPropertyIn(target, keys, value & 0xffffff);
    if (key) {
      return key;
    }
  }
  cpu[name] = value & 0xffffff;
  return `${name} fallback`;
}

function stepFunction(cpu) {
  for (const name of ['step', 'executeInstruction', 'executeStep', 'tick']) {
    if (typeof cpu?.[name] === 'function') {
      return cpu[name].bind(cpu);
    }
  }
  throw new Error('Unable to find CPU step function');
}

function createMemoryForRom(createMemory, rom) {
  const noArgFirst = createMemory.length === 0;
  const candidates = [
    { name: 'createMemory()', fn: () => createMemory() },
    { name: 'createMemory({ rom })', fn: () => createMemory({ rom }) },
    { name: 'createMemory(rom)', fn: () => createMemory(rom) },
    { name: 'createMemory({ romBytes: rom })', fn: () => createMemory({ romBytes: rom }) },
  ];
  const ordered = noArgFirst ? candidates : [candidates[1], candidates[2], candidates[3], candidates[0]];
  const created = tryCreate('createMemory', ordered);
  const loadVia = loadRomIntoMemory(created.value, rom);
  return { memory: created.value, via: `${created.via}; ROM ${loadVia}` };
}

function createBus(createPeripheralBus, memory) {
  const options = {
    timerInterrupt: true,
    timerEnabled: true,
    timerInterval: TIMER_INTERVAL,
  };
  const candidates = createPeripheralBus.length >= 2
    ? [
        { name: 'createPeripheralBus(memory, options)', fn: () => createPeripheralBus(memory, options) },
        { name: 'createPeripheralBus({ memory, ...options })', fn: () => createPeripheralBus({ memory, ...options }) },
        { name: 'createPeripheralBus(options)', fn: () => createPeripheralBus(options) },
        { name: 'createPeripheralBus()', fn: () => createPeripheralBus() },
      ]
    : [
        { name: 'createPeripheralBus(options)', fn: () => createPeripheralBus(options) },
        { name: 'createPeripheralBus({ memory, ...options })', fn: () => createPeripheralBus({ memory, ...options }) },
        { name: 'createPeripheralBus(memory, options)', fn: () => createPeripheralBus(memory, options) },
        { name: 'createPeripheralBus()', fn: () => createPeripheralBus() },
      ];
  return tryCreate('createPeripheralBus', candidates);
}

function createCpu(createCPU, memory, bus) {
  const options = { trace: false };
  const candidates = createCPU.length >= 2
    ? [
        { name: 'createCPU(memory, bus, options)', fn: () => createCPU(memory, bus, options) },
        { name: 'createCPU(memory, bus)', fn: () => createCPU(memory, bus) },
        { name: 'createCPU({ memory, bus, ...options })', fn: () => createCPU({ memory, bus, ...options }) },
      ]
    : [
        { name: 'createCPU({ memory, bus, ...options })', fn: () => createCPU({ memory, bus, ...options }) },
        { name: 'createCPU(memory, bus, options)', fn: () => createCPU(memory, bus, options) },
        { name: 'createCPU(memory, bus)', fn: () => createCPU(memory, bus) },
      ];
  return tryCreate('createCPU', candidates);
}

function attachCpuAndBus(cpu, bus) {
  const busAttach = invokeOptional(bus, ['attachCPU', 'attachCpu', 'setCPU', 'setCpu'], [[cpu]]);
  const cpuAttach = invokeOptional(cpu, ['attachBus', 'setBus', 'setPeripheralBus'], [[bus]]);
  return [busAttach, cpuAttach].filter(Boolean).join('; ') || 'no explicit attach';
}

function setTimerControls(bus, enabled) {
  const intervalMethod = invokeOptional(bus, ['setTimerInterval', 'setTimerPeriod'], [[TIMER_INTERVAL]]);
  let intervalVia = intervalMethod;
  if (!intervalVia) {
    const key = setPropertyIn(bus, ['timerInterval', 'timerPeriod'], TIMER_INTERVAL);
    intervalVia = key || 'timer interval from create options';
  }

  const enabledMethod = invokeOptional(bus, ['setTimerEnabled', 'enableTimer', 'setTimerInterrupt'], [[enabled]]);
  let enabledVia = enabledMethod;
  if (!enabledVia) {
    const key = setPropertyIn(bus, ['timerEnabled', 'timerInterrupt', 'timerInterruptEnabled'], enabled);
    enabledVia = key || 'timer enabled from create options';
  }

  return { intervalVia, enabledVia };
}

function setupCursorState(cpu, memory, flagValue) {
  const iyVia = setRegister(cpu, 'iy', IY_BASE);
  const rowVia = writeByte(memory, CURSOR_ROW_ADDR, 5);
  const colVia = writeByte(memory, CURSOR_COL_ADDR, 13);
  const flagVia = writeByte(memory, CURSOR_FLAGS_ADDR, flagValue);
  return {
    iyVia,
    rowVia,
    colVia,
    flagVia,
    readback: {
      row: tryReadByte(memory, CURSOR_ROW_ADDR),
      col: tryReadByte(memory, CURSOR_COL_ADDR),
      flags: tryReadByte(memory, CURSOR_FLAGS_ADDR),
    },
  };
}

function decodeDirectBranch(memory, pc) {
  const op = tryReadByte(memory, pc);
  if (op === null) {
    return null;
  }

  const callOps = new Set([0xcd, 0xc4, 0xcc, 0xd4, 0xdc, 0xe4, 0xec, 0xf4, 0xfc]);
  const jpOps = new Set([0xc3, 0xc2, 0xca, 0xd2, 0xda, 0xe2, 0xea, 0xf2, 0xfa]);
  if (callOps.has(op)) {
    return { kind: op === 0xcd ? 'CALL' : 'CALLcc', target: read24(memory, pc + 1) };
  }
  if (jpOps.has(op)) {
    return { kind: op === 0xc3 ? 'JP' : 'JPcc', target: read24(memory, pc + 1) };
  }
  if (op === 0xe9) {
    return { kind: 'JP (HL)', target: null };
  }

  const next = tryReadByte(memory, pc + 1);
  if (op === 0xed && next !== null) {
    if (callOps.has(next)) {
      return { kind: next === 0xcd ? 'ED CALL' : 'ED CALLcc', target: read24(memory, pc + 2) };
    }
    if (jpOps.has(next)) {
      return { kind: next === 0xc3 ? 'ED JP' : 'ED JPcc', target: read24(memory, pc + 2) };
    }
  }

  return null;
}

function addAddress(set, value) {
  if (typeof value === 'number') {
    set.add(value & 0xffffff);
  }
}

function compactAddresses(set) {
  const values = [...set].sort((a, b) => a - b);
  return values.length ? values.map((value) => hex(value)).join(', ') : 'none';
}

function collectTimerStats(bus) {
  const stats = {};
  const targets = [
    { name: 'bus', value: bus },
    { name: 'timer', value: bus?.timer },
    { name: 'state', value: bus?.state },
  ];
  const keys = [
    'timerFireCount',
    'timerFires',
    'timerInterruptCount',
    'timerIRQCount',
    'timerIrqCount',
    'interruptCount',
    'irqCount',
    'timerTicks',
    'ticks',
  ];
  for (const target of targets) {
    for (const key of keys) {
      if (typeof target.value?.[key] === 'number') {
        stats[`${target.name}.${key}`] = target.value[key];
      }
    }
  }
  return stats;
}

function formatObject(object) {
  const entries = Object.entries(object);
  return entries.length
    ? entries.map(([key, value]) => `${key}=${value}`).join(', ')
    : 'none exposed';
}

function bootCpu(cpu) {
  const step = stepFunction(cpu);
  for (const stage of BOOT_STAGES) {
    setPC(cpu, stage.pc);
    for (let index = 0; index < stage.steps; index += 1) {
      step();
    }
    console.log(`  boot ${stage.name}: PC=${hex(getPC(cpu))} after ${stage.steps} steps`);
  }
}

function traceFlag(cpu, memory, bus, flagValue, maxSteps) {
  const step = stepFunction(cpu);
  const result = {
    flagValue,
    steps: 0,
    breakReason: 'step limit reached',
    cursorAddresses: new Set(),
    cursorRegions: new Set(),
    isrAddresses: new Set(),
    isrDispatches: new Set(),
    isrFireCount: 0,
    timerServiceHits: 0,
  };

  let lastLoopRegion = null;
  let regionRun = 0;
  let atIsrEntry = false;
  let atTimerService = false;

  function observePC(pc) {
    if (pc >= CURSOR_START && pc < CURSOR_END) {
      addAddress(result.cursorAddresses, pc);
      addAddress(result.cursorRegions, pc & 0xffff00);
    }

    if (pc >= ISR_TRACE_START && pc < ISR_TRACE_END) {
      addAddress(result.isrAddresses, pc);
    }

    if (pc === TIMER_ISR_ENTRY) {
      if (!atIsrEntry) {
        result.isrFireCount += 1;
      }
      atIsrEntry = true;
    } else {
      atIsrEntry = false;
    }

    if (pc === TIMER_ISR_SERVICE) {
      if (!atTimerService) {
        result.timerServiceHits += 1;
      }
      atTimerService = true;
    } else {
      atTimerService = false;
    }
  }

  setPC(cpu, IDLE_PC);
  console.log(`  trace flag ${hex(flagValue, 2)}: start PC=${hex(getPC(cpu))}, limit=${maxSteps}`);

  for (let index = 0; index < maxSteps; index += 1) {
    const beforePC = getPC(cpu);
    observePC(beforePC);

    if (beforePC >= ISR_TRACE_START && beforePC < ISR_TRACE_END) {
      const branch = decodeDirectBranch(memory, beforePC);
      if (branch) {
        const target = branch.target === null ? 'indirect' : hex(branch.target);
        result.isrDispatches.add(`${branch.kind} ${hex(beforePC)} -> ${target}`);
      }
    }

    step();
    result.steps += 1;

    const afterPC = getPC(cpu);
    observePC(afterPC);

    const loopRegion = Math.floor(afterPC / TIGHT_LOOP_REGION_SIZE) * TIGHT_LOOP_REGION_SIZE;
    if (loopRegion === lastLoopRegion) {
      regionRun += 1;
    } else {
      lastLoopRegion = loopRegion;
      regionRun = 1;
    }

    if (regionRun > TIGHT_LOOP_LIMIT) {
      result.breakReason = `tight loop: ${hex(loopRegion)} region for ${regionRun} consecutive steps`;
      break;
    }
  }

  result.timerStats = collectTimerStats(bus);
  return result;
}

function createEnvironment(createMemory, createPeripheralBus, createCPU, rom) {
  const { memory, via: memoryVia } = createMemoryForRom(createMemory, rom);
  const { value: bus, via: busVia } = createBus(createPeripheralBus, memory);
  const disabledTimer = setTimerControls(bus, false);
  const { value: cpu, via: cpuVia } = createCpu(createCPU, memory, bus);
  const attachVia = attachCpuAndBus(cpu, bus);
  return { cpu, memory, bus, memoryVia, busVia, cpuVia, attachVia, disabledTimer };
}

async function main() {
  const runtime = await import('./cpu-runtime.js');
  const peripherals = await import('./peripherals.js');

  try {
    await import('./ez80-decoder.js');
  } catch {
    // The trace only needs raw direct-branch decoding; this import is optional.
  }

  const createMemory = exportFrom(runtime, 'createMemory');
  const createCPU = exportFrom(runtime, 'createCPU');
  const createPeripheralBus = exportFrom(peripherals, 'createPeripheralBus');

  if (typeof createMemory !== 'function' || typeof createCPU !== 'function' || typeof createPeripheralBus !== 'function') {
    throw new Error('Missing createMemory, createCPU, or createPeripheralBus export');
  }

  const rom = readFileSync(ROM_URL);
  let totalTraceSteps = 0;
  const results = [];

  console.log('Phase 493 timer IRQ cursor trace');
  console.log(`ROM: ${ROM_URL.pathname}`);
  console.log(`Timer interval: ${TIMER_INTERVAL}`);
  console.log(`Cursor range: ${hex(CURSOR_START)}-${hex(CURSOR_END - 1)}`);
  console.log(`Idle entry: ${hex(IDLE_PC)}`);

  for (const flagValue of CURSOR_FLAG_VALUES) {
    if (totalTraceSteps >= TOTAL_TRACE_LIMIT) {
      console.log(`Total trace step limit reached: ${totalTraceSteps}/${TOTAL_TRACE_LIMIT}`);
      break;
    }

    console.log('');
    console.log(`Flag ${hex(flagValue, 2)}`);
    const env = createEnvironment(createMemory, createPeripheralBus, createCPU, rom);
    console.log(`  memory: ${env.memoryVia}`);
    console.log(`  bus: ${env.busVia}`);
    console.log(`  cpu: ${env.cpuVia}`);
    console.log(`  attach: ${env.attachVia}`);
    console.log(`  timer disabled for boot: interval=${env.disabledTimer.intervalVia}, enabled=${env.disabledTimer.enabledVia}`);

    bootCpu(env.cpu);

    const cursorSetup = setupCursorState(env.cpu, env.memory, flagValue);
    const enabledTimer = setTimerControls(env.bus, true);
    console.log(`  cursor setup: IY=${cursorSetup.iyVia}, row=${cursorSetup.rowVia}, col=${cursorSetup.colVia}, flags=${cursorSetup.flagVia}`);
    console.log(
      `  cursor readback: row=${hex(cursorSetup.readback.row, 2)}, col=${hex(cursorSetup.readback.col, 2)}, flags=${hex(cursorSetup.readback.flags, 2)}`
    );
    console.log(`  timer enabled: interval=${enabledTimer.intervalVia}, enabled=${enabledTimer.enabledVia}`);

    const remaining = TOTAL_TRACE_LIMIT - totalTraceSteps;
    const maxSteps = Math.min(PER_FLAG_TRACE_LIMIT, remaining);
    const result = traceFlag(env.cpu, env.memory, env.bus, flagValue, maxSteps);
    totalTraceSteps += result.steps;
    results.push(result);

    console.log(`  result: ${result.cursorAddresses.size ? 'cursor range reached' : 'no cursor range hit'}`);
    console.log(`  steps: ${result.steps}, break: ${result.breakReason}`);
    console.log(`  cursor regions: ${compactAddresses(result.cursorRegions)}`);
    console.log(`  cursor addresses: ${compactAddresses(result.cursorAddresses)}`);
    console.log(`  observed ISR entries: ${result.isrFireCount}`);
    console.log(`  timer service hits at ${hex(TIMER_ISR_SERVICE)}: ${result.timerServiceHits}`);
    console.log(`  ISR PCs: ${compactAddresses(result.isrAddresses)}`);
    console.log(`  ISR dispatches: ${result.isrDispatches.size ? [...result.isrDispatches].sort().join('; ') : 'none observed'}`);
    console.log(`  bus timer stats: ${formatObject(result.timerStats)}`);
  }

  const triggered = results.filter((result) => result.cursorAddresses.size > 0);
  console.log('');
  console.log('Phase 493 summary');
  console.log(`Total trace steps: ${totalTraceSteps}/${TOTAL_TRACE_LIMIT}`);
  console.log(
    `Flags that reached ${hex(CURSOR_START)}-${hex(CURSOR_END - 1)}: ${
      triggered.length ? triggered.map((result) => hex(result.flagValue, 2)).join(', ') : 'none'
    }`
  );
  for (const result of triggered) {
    console.log(`  ${hex(result.flagValue, 2)}: ${compactAddresses(result.cursorAddresses)}`);
  }
}

main().catch((error) => {
  console.error('Phase 493 probe failed');
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
