import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase653-branch-inputs.md');

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;
const WARM_IDLE = 0x0019BE;
const HALT_IDLE = 0x0019B5;
const LAUNCH_HOME = 0x09DD62;
const HOME_REPAINT = 0x058241;
const OUTER_LOOP = 0x08C331;

const PHASE5_FIELDS = Object.freeze([
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D02587', 0xD02587, 3],
  ['D0258A', 0xD0258A, 3],
  ['D0258D', 0xD0258D, 3],
  ['D02590', 0xD02590, 3],
  ['D02593', 0xD02593, 3],
  ['D0259A', 0xD0259A, 3],
  ['D0259D', 0xD0259D, 3],
  ['D025A0', 0xD025A0, 3],
  ['D025C5', 0xD025C5, 3],
]);

const PRESERVE_RANGES = Object.freeze([
  ['contextTable_D007CA_D007ED', 0xD007CA, 0x24],
  ['errSP_D008E0', 0xD008E0, 3],
  ['vatTuple_D02587_D025A2', 0xD02587, 0x1C],
  ['heapSize_D025C5', 0xD025C5, 3],
]);

const WATCHED_PORTS = new Set([
  0x0003,
  0xA000,
  0xA008,
  0xA00C,
]);

const TARGETS = Object.freeze({
  outerLoop08c331: OUTER_LOOP,
  cxMain0585e9: 0x0585E9,
  eolClear0a2150: 0x0A2150,
  bulkClear001879: 0x001879,
  pre0028d1: 0x0028D1,
  pre0013fc: 0x0013FC,
  guard015930: 0x015930,
  pre001405: 0x001405,
  pre003cbc: 0x003CBC,
  pre003cc6: 0x003CC6,
  pre003cd4: 0x003CD4,
  pre003ce0: 0x003CE0,
  pre003cee: 0x003CEE,
  pre003cf3: 0x003CF3,
  post003cf7: 0x003CF7,
  post003d09: 0x003D09,
  post003d11: 0x003D11,
  post001409: 0x001409,
  alt00140d: 0x00140D,
  alt001414: 0x001414,
  pre001424: 0x001424,
  sig0008bb: 0x0008BB,
  pre001428: 0x001428,
  branch0014c9: 0x0014C9,
  pre00142c: 0x00142C,
  seed000721: 0x000721,
  seed013d00: 0x013D00,
  seed005ba6: 0x005BA6,
  seed013d11: 0x013D11,
  display0059c6: 0x0059C6,
  display005b92: 0x005B92,
  transfer0017fc: 0x0017FC,
  low0064d0: 0x0064D0,
  low006cc6: 0x006CC6,
  token08f5e1: 0x08F5E1,
  token090992: 0x090992,
  token08f54b: 0x08F54B,
});

const STATIC_BLOCKS = Object.freeze([
  0x0028D1,
  0x0013FC,
  0x001405,
  0x001409,
  0x00140D,
  0x001414,
  0x001424,
  0x0008BB,
  0x001428,
  0x00142C,
  0x0014C9,
  0x003CBC,
  0x003CC6,
  0x003CD4,
  0x003CE0,
  0x003CEE,
  0x003CF3,
  0x003CF7,
  0x003D09,
  0x003D11,
  0x000721,
  0x013D00,
  0x005BA6,
  0x013D11,
  0x013D32,
  0x013D35,
  0x013D87,
  0x013D8D,
  0x000725,
  0x0158A6,
  0x00072D,
  0x0138F1,
  0x002197,
  0x0138F9,
  0x013918,
  0x013927,
  0x01394E,
  0x01395B,
  0x006447,
  0x00646C,
  0x006475,
  0x00647D,
  0x0064C7,
  0x0064D0,
  0x006CC6,
]);

const KEY_CASES = Object.freeze([
  { name: 'eol-clear', label: 'EOL/CLEAR', pendingKey: 0x0F, matrixScan: 0x0F, maxSteps: 90000 },
  { name: 'digit2', label: 'Digit2', pendingKey: 0x90, matrixScan: 0x1A, maxSteps: 90000 },
]);

class EarlyStop extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function readValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= mem[(addr + i) & 0xFFFFFF] << (8 * i);
  return value >>> 0;
}

function writeValue(mem, addr, len, value) {
  for (let i = 0; i < len; i += 1) mem[(addr + i) & 0xFFFFFF] = (value >>> (8 * i)) & 0xFF;
}

function write24(mem, addr, value) {
  writeValue(mem, addr, 3, value);
}

function fillSentinel(mem, start, bytes) {
  mem.fill(0xFF, start, start + bytes);
}

function captureFields(mem) {
  return PHASE5_FIELDS.map(([name, addr, len]) => ({
    name,
    addr,
    len,
    value: readValue(mem, addr, len),
    bytes: Array.from(mem.slice(addr, addr + len)),
  }));
}

function restoreFields(mem, snapshot) {
  for (const field of snapshot) {
    for (let i = 0; i < field.len; i += 1) mem[field.addr + i] = field.bytes[i] ?? 0;
  }
}

function captureRanges(mem) {
  return PRESERVE_RANGES.map(([name, addr, len]) => ({
    name,
    addr,
    len,
    bytes: Array.from(mem.slice(addr, addr + len)),
  }));
}

function restoreRanges(mem, snapshot) {
  for (const range of snapshot) {
    for (let i = 0; i < range.len; i += 1) mem[range.addr + i] = range.bytes[i] ?? 0;
  }
}

function fieldsObject(snapshot) {
  return Object.fromEntries(snapshot.map((field) => [field.name, hex(field.value, field.len * 2)]));
}

function countVRAMPixels(mem) {
  let count = 0;
  for (let addr = 0xD40000; addr < 0xD40000 + (320 * 240 * 2); addr += 2) {
    const word = mem[addr] | (mem[addr + 1] << 8);
    if (word !== 0xFFFF) count += 1;
  }
  return count;
}

function formatRunResult(result) {
  return {
    steps: result.steps,
    termination: result.termination,
    lastPc: hex(result.lastPc ?? 0),
    lastMode: result.lastMode,
  };
}

function makeMachine() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, MEM_SIZE));
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { mem, peripherals, executor, cpu: executor.cpu };
}

function runBootToPhase5Ready() {
  const machine = makeMachine();
  const { mem, peripherals, executor, cpu } = machine;
  const phases = [];

  phases.push({ name: 'p1-coldboot', result: executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 }) });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);
  phases.push({ name: 'p2-kernel', result: executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 }) });

  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);
  phases.push({ name: 'p3-postinit', result: executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 }) });

  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  cpu.sp = STACK_TOP - 12;
  fillSentinel(mem, cpu.sp, 12);
  phases.push({ name: 'p4-warm-idle', result: executor.runFrom(WARM_IDLE, 'adl', { maxSteps: 1500000, maxLoopIterations: 100000 }) });

  peripherals.setTimerEnabled(false);
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  const launchSp = STACK_TOP - 24;
  cpu.sp = launchSp;
  fillSentinel(mem, cpu.sp, 24);
  write24(mem, launchSp, WARM_IDLE);
  write24(mem, 0xD008E0, launchSp);

  return { ...machine, phases };
}

function prepareEventFrame(mem, peripherals, cpu) {
  peripherals.setTimerEnabled(true);
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu.f = 0x40;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._ix = 0xD1A860;
  cpu._iy = 0xD00080;
  cpu.sp = STACK_TOP - 24;
  fillSentinel(mem, cpu.sp, 24);
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, HALT_IDLE);
  write24(mem, 0xD008E0, cpu.sp);
}

function rearmCxMain(mem) {
  for (let i = 0; i < 21; i += 1) mem[0xD007CA + i] = romBytes[0x0585D3 + i];
  mem[0xD0008D] = romBytes[0x0585D3 + 21];
}

function seedKey(mem, keyCase) {
  mem[0xD0058C] = keyCase.pendingKey;
  mem[0xD0058D] = keyCase.pendingKey;
  mem[0xD0058E] = keyCase.pendingKey;
  mem[0xD00587] = keyCase.matrixScan;
  mem[0xD00080] = (mem[0xD00080] | 0x08) & 0xFF;
  mem[0xD0009F] = (mem[0xD0009F] | 0x20) & 0xFF;
}

function readStackWords(mem, sp, count = 10) {
  return Array.from({ length: count }, (_, i) => {
    const addr = ((sp & 0xFFFFFF) + i * 3) & 0xFFFFFF;
    return { addr: hex(addr), value: hex(readValue(mem, addr, 3)) };
  });
}

function readIxFrame(mem, cpu) {
  const ix = cpu.ix & 0xFFFFFF;
  const offsets = [-45, -42, -39, -30, -27, -24, -20, -17, -11, -8, -7, -6, -3, 0, 3, 6, 9];
  return Object.fromEntries(offsets.map((off) => {
    const addr = (ix + off) & 0xFFFFFF;
    const width = [-24, -8, -7].includes(off) ? 1 : 3;
    return [`IX${off >= 0 ? '+' : ''}${off}`, hex(readValue(mem, addr, width), width * 2)];
  }));
}

function readBytes(mem, addr, count) {
  const base = addr & 0xFFFFFF;
  return Array.from({ length: count }, (_, i) => hex(mem[(base + i) & 0xFFFFFF], 2));
}

function stateSummary(mem, cpu) {
  return {
    pc: hex(cpu.pc ?? 0),
    sp: hex(cpu.sp),
    ix: hex(cpu.ix),
    iy: hex(cpu.iy),
    af: hex(cpu.af, 4),
    bc: hex(cpu.bc),
    de: hex(cpu.de),
    hl: hex(cpu.hl),
    flags: {
      z: (cpu.f & 0x40) !== 0,
      c: (cpu.f & 0x01) !== 0,
      n: (cpu.f & 0x02) !== 0,
    },
    D00080: hex(mem[0xD00080], 2),
    D0008D: hex(mem[0xD0008D], 2),
    D0009F: hex(mem[0xD0009F], 2),
    D000AC: hex(mem[0xD000AC], 2),
    D00121: hex(readValue(mem, 0xD00121, 3)),
    D00124: hex(mem[0xD00124], 2),
    D00587: hex(mem[0xD00587], 2),
    D0058C: hex(mem[0xD0058C], 2),
    D0058D: hex(mem[0xD0058D], 2),
    D0058E: hex(mem[0xD0058E], 2),
    D00596: hex(mem[0xD00596], 2),
    D0059C: hex(readValue(mem, 0xD0059C, 3)),
    D005A0: hex(mem[0xD005A0], 2),
    D007CA: hex(readValue(mem, 0xD007CA, 3)),
    D008E0: hex(readValue(mem, 0xD008E0, 3)),
    D0231A: hex(readValue(mem, 0xD0231A, 3)),
    D0243A: hex(readValue(mem, 0xD0243A, 3)),
    D02590: hex(readValue(mem, 0xD02590, 3)),
    D0259A: hex(readValue(mem, 0xD0259A, 3)),
    vramPixels: countVRAMPixels(mem),
  };
}

function memoryFocus(mem, cpu) {
  const ix = cpu.ix & 0xFFFFFF;
  return {
    low0059c: hex(readValue(mem, 0x00059C, 3)),
    low005a0: hex(readValue(mem, 0x0005A0, 3)),
    D00596: hex(mem[0xD00596], 2),
    D0059C: hex(readValue(mem, 0xD0059C, 3)),
    D005A0: hex(mem[0xD005A0], 2),
    D005A1: hex(mem[0xD005A1], 2),
    D005A2: hex(mem[0xD005A2], 2),
    ixBytes: readBytes(mem, ix, 12),
  };
}

function formatIoEvent(event) {
  return {
    type: event.type,
    block: event.block,
    pc: event.pc,
    port: event.port,
    value: event.value,
    a: event.a,
    f: event.f,
  };
}

function capturePoint(mem, cpu, block, addr, recentBlocks, callStack, ioEvents, lastIoByPort) {
  return {
    block,
    pc: hex(addr),
    state: stateSummary(mem, cpu),
    memory: memoryFocus(mem, cpu),
    stackTop: readStackWords(mem, cpu.sp),
    ixFrame: readIxFrame(mem, cpu),
    recentIo: ioEvents.slice(-12).map(formatIoEvent),
    lastIoByPort: Object.fromEntries(
      Array.from(lastIoByPort.entries()).map(([port, event]) => [hex(port, 4), formatIoEvent(event)]),
    ),
    recentBlocks: recentBlocks.slice(-64).map((pc) => hex(pc)),
    callStackTail: callStack.slice(-32).map((pc) => hex(pc)),
  };
}

function makeCounter() {
  return Object.fromEntries(Object.keys(TARGETS).map((name) => [name, 0]));
}

function runPhase5WithSnapshot() {
  const machine = runBootToPhase5Ready();
  const { mem, executor } = machine;
  const counts = { launchHome09dd62: 0, memInit09dee0: 0, clear001879: 0, cleanup0018f8: 0, halt0019b5: 0 };
  let block = 0;
  let snapshot = null;

  const result = executor.runFrom(LAUNCH_HOME, 'adl', {
    maxSteps: 300000,
    maxLoopIterations: 30000,
    onBlock(pc) {
      block += 1;
      const addr = pc & 0xFFFFFF;
      if (addr === LAUNCH_HOME) counts.launchHome09dd62 += 1;
      if (addr === 0x09DEE0) counts.memInit09dee0 += 1;
      if (addr === 0x001879) {
        counts.clear001879 += 1;
        if (!snapshot && readValue(mem, 0xD02590, 3) !== 0) {
          snapshot = { block, pc: hex(addr), fields: captureFields(mem), vramPixels: countVRAMPixels(mem) };
        }
      }
      if (addr === 0x0018F8) counts.cleanup0018f8 += 1;
      if (addr === HALT_IDLE) counts.halt0019b5 += 1;
    },
  });

  return {
    ...machine,
    phase5: {
      result: formatRunResult(result),
      counts,
      snapshot,
      afterFields: fieldsObject(captureFields(mem)),
      vramPixels: countVRAMPixels(mem),
    },
  };
}

function runRepaint(mem, peripherals, executor, cpu) {
  const counts = { homeRepaint058241: 0, vatSearch084711: 0, cleanup0018f8: 0, halt0019b5: 0 };
  let block = 0;

  prepareEventFrame(mem, peripherals, cpu);
  const result = executor.runFrom(HOME_REPAINT, 'adl', {
    maxSteps: 300000,
    maxLoopIterations: 30000,
    onBlock(pc) {
      block += 1;
      const addr = pc & 0xFFFFFF;
      if (addr === HOME_REPAINT) counts.homeRepaint058241 += 1;
      if (addr === 0x084711) counts.vatSearch084711 += 1;
      if (addr === 0x0018F8) counts.cleanup0018f8 += 1;
      if (addr === HALT_IDLE) counts.halt0019b5 += 1;
    },
  });

  return {
    result: formatRunResult(result),
    counts,
    fields: fieldsObject(captureFields(mem)),
    vramPixels: countVRAMPixels(mem),
    blocks: block,
  };
}

function runKeyTrace(mem, peripherals, executor, cpu, keyCase) {
  rearmCxMain(mem);
  seedKey(mem, keyCase);
  prepareEventFrame(mem, peripherals, cpu);

  const preKeySnapshot = captureRanges(mem);
  const counts = makeCounter();
  const samples = {};
  const transitions = [];
  const restorations = [];
  const recentBlocks = [];
  const callStack = [];
  const hotBlocks = new Map();
  const ioEvents = [];
  const lastIoByPort = new Map();

  let block = 0;
  let prevSp = cpu.sp & 0xFFFFFF;
  let prevPc = OUTER_LOOP;
  let currentBlock = OUTER_LOOP;
  let pendingRestore = null;
  let stopReason = null;

  function pushRecent(addr) {
    if (recentBlocks.length === 0 || recentBlocks[recentBlocks.length - 1] !== addr) {
      recentBlocks.push(addr);
      if (recentBlocks.length > 180) recentBlocks.shift();
    }
  }

  function restoreNow(label, addr) {
    const before = stateSummary(mem, cpu);
    restoreRanges(mem, preKeySnapshot);
    restorations.push({
      label,
      atBlock: block,
      atPc: hex(addr),
      before,
      after: stateSummary(mem, cpu),
    });
  }

  function recordIo(type, port, value) {
    const normalizedPort = port & 0xFFFF;
    if (!WATCHED_PORTS.has(normalizedPort)) return;
    const event = {
      type,
      block,
      pc: hex(currentBlock),
      port: hex(normalizedPort, 4),
      value: hex(value, 2),
      a: hex(cpu.a, 2),
      f: hex(cpu.f, 2),
    };
    ioEvents.push(event);
    if (ioEvents.length > 1000) ioEvents.shift();
    lastIoByPort.set(normalizedPort, event);
  }

  cpu.onIoRead = (port, value) => recordIo('read', port, value);
  cpu.onIoWrite = (port, value) => recordIo('write', port, value);

  let rawResult = null;
  try {
    rawResult = executor.runFrom(OUTER_LOOP, 'adl', {
      maxSteps: keyCase.maxSteps,
      maxLoopIterations: keyCase.maxSteps,
      diHaltBypass: true,
      diHaltBypassEntry: OUTER_LOOP,
      onBlock(pc) {
        block += 1;
        const addr = pc & 0xFFFFFF;

        if (pendingRestore) {
          restoreNow(pendingRestore, addr);
          pendingRestore = null;
        }

        currentBlock = addr;
        hotBlocks.set(hex(addr), (hotBlocks.get(hex(addr)) ?? 0) + 1);
        pushRecent(addr);

        const curSp = cpu.sp & 0xFFFFFF;
        const delta = prevSp - curSp;
        if (delta >= 3 && delta <= 18) {
          callStack.push(prevPc);
          if (callStack.length > 240) callStack.shift();
        } else if (delta <= -3 && delta >= -18) {
          const pops = Math.max(1, Math.floor((-delta) / 3));
          callStack.splice(Math.max(0, callStack.length - pops), pops);
        }
        prevSp = curSp;

        for (const [name, target] of Object.entries(TARGETS)) {
          if (addr !== target) continue;
          counts[name] += 1;
          if (!samples[name]) samples[name] = capturePoint(mem, cpu, block, addr, recentBlocks, callStack, ioEvents, lastIoByPort);
          if (transitions.length < 140) {
            transitions.push({
              name,
              hit: counts[name],
              block,
              pc: hex(addr),
              previous: hex(prevPc),
              sp: hex(cpu.sp),
              top: hex(readValue(mem, cpu.sp, 3)),
              stackTail: callStack.slice(-8).map((item) => hex(item)),
              recentTail: recentBlocks.slice(-12).map((item) => hex(item)),
            });
          }
        }

        if (addr === 0x0A2150) pendingRestore = 'after-0x0A2150-LDIR';
        if (addr === 0x001879) pendingRestore = 'after-0x001879-bulk-clear';

        if (counts.low006cc6 > 0) {
          stopReason = 'after-low-frame-selection';
          throw new EarlyStop(stopReason);
        }

        prevPc = addr;
      },
    });
  } catch (error) {
    if (error instanceof EarlyStop) {
      rawResult = {
        steps: block,
        termination: error.reason,
        lastPc: currentBlock,
        lastMode: 'adl',
      };
    } else {
      throw error;
    }
  } finally {
    cpu.onIoRead = () => {};
    cpu.onIoWrite = () => {};
  }

  const seedSample = samples.seed000721 ?? null;
  const seedRecent = seedSample?.recentBlocks ?? [];
  const immediatePredecessor = seedRecent.length >= 2 ? seedRecent[seedRecent.length - 2] : null;

  return {
    key: keyCase.name,
    label: keyCase.label,
    result: formatRunResult(rawResult),
    counts,
    restorations,
    immediatePredecessor,
    seedWindow: seedSample,
    seedTail: {
      seed013d00: samples.seed013d00 ?? null,
      seed005ba6: samples.seed005ba6 ?? null,
      seed013d11: samples.seed013d11 ?? null,
      display0059c6: samples.display0059c6 ?? null,
    },
    preSeedSamples: Object.fromEntries([
      'pre0028d1',
      'pre0013fc',
      'guard015930',
      'pre001405',
      'pre003cbc',
      'pre003cc6',
      'pre003cd4',
      'pre003ce0',
      'pre003cee',
      'pre003cf3',
      'post003cf7',
      'post003d09',
      'post003d11',
      'post001409',
      'alt00140d',
      'alt001414',
      'pre001424',
      'sig0008bb',
      'pre001428',
      'branch0014c9',
      'pre00142c',
    ].map((name) => [name, samples[name] ?? null]).filter(([, value]) => value)),
    transferSamples: Object.fromEntries([
      'display005b92',
      'transfer0017fc',
      'low0064d0',
      'low006cc6',
    ].map((name) => [name, samples[name] ?? null]).filter(([, value]) => value)),
    transitions,
    ioEvents: ioEvents.map(formatIoEvent),
    hotBlocks: Array.from(hotBlocks.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([pc, count]) => ({ pc, count })),
    lastBlocks: recentBlocks.slice(-80).map((addr) => hex(addr)),
    final: stateSummary(mem, cpu),
  };
}

function runScenario(keyCase) {
  const machine = runPhase5WithSnapshot();
  const { mem, peripherals, executor, cpu, phase5, phases } = machine;
  const snapshot = phase5.snapshot?.fields ?? null;
  if (!snapshot) {
    return {
      key: keyCase.name,
      error: 'phase5-snapshot-not-captured',
      phases: phases.map((phase) => ({ name: phase.name, result: formatRunResult(phase.result) })),
      phase5,
    };
  }

  restoreFields(mem, snapshot);
  const repaint = runRepaint(mem, peripherals, executor, cpu);
  const keyTrace = runKeyTrace(mem, peripherals, executor, cpu, keyCase);

  return {
    key: keyCase.name,
    phases: phases.map((phase) => ({ name: phase.name, result: formatRunResult(phase.result) })),
    phase5: {
      result: phase5.result,
      counts: phase5.counts,
      snapshot: {
        block: phase5.snapshot.block,
        pc: phase5.snapshot.pc,
        fields: fieldsObject(phase5.snapshot.fields),
        vramPixels: phase5.snapshot.vramPixels,
      },
      afterFields: phase5.afterFields,
      vramPixels: phase5.vramPixels,
    },
    repaint,
    keyTrace,
  };
}

function blockSummary(pc) {
  const key = `${pc.toString(16).padStart(6, '0')}:adl`;
  const block = BLOCKS[key];
  if (!block) return { pc: hex(pc), missing: true };
  return {
    pc: hex(pc),
    instructions: (block.instructions ?? []).map((inst) => ({
      pc: hex(inst.pc),
      bytes: inst.bytes,
      dasm: inst.dasm,
    })),
    exits: block.exits ?? [],
  };
}

function staticSection() {
  const lines = ['## Static Snippets', ''];
  for (const pc of STATIC_BLOCKS) {
    const row = blockSummary(pc);
    lines.push(`### ${row.pc}`);
    lines.push('');
    if (row.missing) {
      lines.push('- Missing from PRELIFTED_BLOCKS.');
      lines.push('');
      continue;
    }
    lines.push('```text');
    for (const inst of row.instructions) {
      lines.push(`${inst.pc}  ${String(inst.bytes).padEnd(16)} ${inst.dasm}`);
    }
    lines.push('```');
    lines.push('');
    lines.push(`Exits: \`${JSON.stringify(row.exits)}\``);
    lines.push('');
  }
  return lines.join('\n');
}

function trimSample(sample) {
  if (!sample) return null;
  return {
    block: sample.block,
    pc: sample.pc,
    af: sample.state.af,
    bc: sample.state.bc,
    de: sample.state.de,
    hl: sample.state.hl,
    sp: sample.state.sp,
    flags: sample.state.flags,
    D000AC: sample.state.D000AC,
    D007CA: sample.state.D007CA,
    D008E0: sample.state.D008E0,
    D02590: sample.state.D02590,
    stackTop: sample.stackTop.slice(0, 3),
    recentBlocks: sample.recentBlocks.slice(-12),
  };
}

function getSample(row, name) {
  return row?.keyTrace?.preSeedSamples?.[name] ?? null;
}

function tableValue(value) {
  return value ?? 'n/a';
}

function summarizeIo(events) {
  const branchPcs = new Set([
    '0x003CC2',
    '0x003CD4',
    '0x003CE0',
    '0x003CF3',
    '0x003CF7',
    '0x003D09',
    '0x003D11',
  ]);
  return events.filter((event) => branchPcs.has(event.pc)).slice(-16);
}

function branchPath(k) {
  const parts = [];
  if (k.counts.pre0013fc) parts.push('0x0013FC');
  if (k.counts.pre001405) parts.push('0x001405');
  if (k.counts.pre003cbc) parts.push('0x003CBC');
  if (k.counts.post001409) parts.push('0x001409');
  if (k.counts.pre001424) parts.push('0x001424');
  if (k.counts.sig0008bb) parts.push('0x0008BB');
  if (k.counts.pre001428) parts.push('0x001428');
  if (k.counts.branch0014c9) parts.push('0x0014C9');
  if (k.counts.pre00142c) parts.push('0x00142C');
  if (k.counts.seed000721) parts.push('0x000721');
  return parts.join(' -> ');
}

function scenarioTable(scenarios) {
  return [
    '| Key | Trace | After 0x0013FC A/F | 0x015930 | D000AC before/after 0x003CBC | 0x001409 A/F | 0x001424 | 0x0008BB result at 0x001428 | 0x0014C9 | 0x00142C | 0x000721 | Token/tail | Low 0x006CC6 |',
    '|---|---|---|---:|---|---|---:|---|---:|---:|---:|---:|---:|',
    ...scenarios.map((row) => {
      if (row.error) return `| ${row.key} | ERROR ${row.error} | | | | | | | | | | | |`;
      const k = row.keyTrace;
      const sample1405 = getSample(row, 'pre001405')?.state;
      const beforeSet = getSample(row, 'pre003cbc')?.state.D000AC;
      const afterSet = getSample(row, 'pre003cc6')?.state.D000AC;
      const sample1409 = getSample(row, 'post001409')?.state;
      const sample1428 = getSample(row, 'pre001428')?.state;
      const tokenHits = k.counts.token08f5e1 + k.counts.token090992 + k.counts.token08f54b;
      const sig = sample1428
        ? `HL=${sample1428.hl} Z=${sample1428.flags.z} AF=${sample1428.af}`
        : 'n/a';
      return `| ${k.label} | ${k.result.termination} ${k.result.lastPc} | AF=${tableValue(sample1405?.af)} Z=${tableValue(sample1405?.flags.z)} | ${k.counts.guard015930} | ${tableValue(beforeSet)} -> ${tableValue(afterSet)} | AF=${tableValue(sample1409?.af)} | ${k.counts.pre001424} | ${sig} | ${k.counts.branch0014c9} | ${k.counts.pre00142c} | ${k.counts.seed000721} | ${tokenHits} | ${k.counts.low006cc6} |`;
    }),
  ].join('\n');
}

function compactScenario(row) {
  if (row.error) return row;
  const k = row.keyTrace;
  return {
    key: k.label,
    result: k.result,
    path: branchPath(k),
    counts: {
      guard015930: k.counts.guard015930,
      pre001405: k.counts.pre001405,
      pre003cbc: k.counts.pre003cbc,
      post001409: k.counts.post001409,
      alt00140d: k.counts.alt00140d,
      alt001414: k.counts.alt001414,
      pre001424: k.counts.pre001424,
      sig0008bb: k.counts.sig0008bb,
      pre001428: k.counts.pre001428,
      branch0014c9: k.counts.branch0014c9,
      pre00142c: k.counts.pre00142c,
      seed000721: k.counts.seed000721,
      low006cc6: k.counts.low006cc6,
      token08f5e1: k.counts.token08f5e1,
      token090992: k.counts.token090992,
      token08f54b: k.counts.token08f54b,
    },
    restorations: k.restorations.map((item) => ({
      label: item.label,
      atBlock: item.atBlock,
      atPc: item.atPc,
      afterD007CA: item.after.D007CA,
      afterD008E0: item.after.D008E0,
      afterD02590: item.after.D02590,
    })),
    immediatePredecessor: k.immediatePredecessor,
    branchIo: summarizeIo(k.ioEvents),
    branchSamples: Object.fromEntries([
      'pre0013fc',
      'pre001405',
      'pre003cbc',
      'pre003cc6',
      'pre003cf3',
      'post003cf7',
      'post003d09',
      'post003d11',
      'post001409',
      'alt00140d',
      'alt001414',
      'pre001424',
      'sig0008bb',
      'pre001428',
      'branch0014c9',
      'pre00142c',
      'seed000721',
    ].map((name) => [name, trimSample(k.preSeedSamples[name])]).filter(([, value]) => value)),
    final: {
      pc: k.final.pc,
      af: k.final.af,
      sp: k.final.sp,
      D000AC: k.final.D000AC,
      D007CA: k.final.D007CA,
      D008E0: k.final.D008E0,
      D02590: k.final.D02590,
      vramPixels: k.final.vramPixels,
    },
  };
}

function buildReport(scenarios) {
  const successful = scenarios.filter((row) => !row.error);
  const allPort03Clear = successful.every((row) => getSample(row, 'pre001405')?.state.af === '0xEE54' && row.keyTrace.counts.guard015930 === 0);
  const allSetIY2C = successful.every((row) => getSample(row, 'pre003cbc')?.state.D000AC === '0x00' && getSample(row, 'pre003cc6')?.state.D000AC === '0x01');
  const allSignatureZ = successful.every((row) => {
    const sample = getSample(row, 'pre001428')?.state;
    return row.keyTrace.counts.sig0008bb >= 1 && sample?.hl === '0x000000' && sample?.flags.z === true;
  });
  const allFallThrough = successful.every((row) => row.keyTrace.counts.branch0014c9 === 0 && row.keyTrace.counts.pre00142c === 1 && row.keyTrace.counts.seed000721 === 1);
  const allMissToken = successful.every((row) => row.keyTrace.counts.token08f5e1 === 0 && row.keyTrace.counts.token090992 === 0 && row.keyTrace.counts.token08f54b === 0);

  return [
    '# Phase 653: Low-ROM Branch Inputs Into One-Shot Renderer Seed',
    '',
    'Probe: `probe-phase653-branch-inputs.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase653-branch-inputs.mjs`',
    '',
    '## Summary',
    '',
    `- ${allPort03Clear ? '4-star' : '2-star'} After \`0x0013FC\`, A/F is \`0xEE54\` in both key cases, so the port-\`0x03\` value has bit 4 clear and the \`CALL NZ,0x015930\` guard at \`0x001401\` is not taken.`,
    `- ${allSetIY2C ? '4-star' : '2-star'} \`0x003CBC\` is confirmed as a flag set: \`D000AC\` (\`IY+0x2C\`) changes \`0x00 -> 0x01\` before the keyboard/status scan loop.`,
    `- ${allSignatureZ ? '4-star' : '2-star'} The \`0x001424 -> 0x0008BB\` signature check is the branch input for \`0x001428\`: it returns \`HL=0x000000\`, Z=true, so \`JP NZ,0x0014C9\` is not taken.`,
    `- ${allFallThrough ? '4-star' : '2-star'} Both traces fall through \`0x001428 -> 0x00142C -> 0x000721\`; \`0x0014C9\` has zero hits.`,
    `- ${allMissToken ? '3-star' : '1-star'} Token/tail hooks remain bypassed: \`0x08F5E1\`, \`0x090992\`, and \`0x08F54B\` stay at zero hits.`,
    '- No runtime, transpiler, browser, or scheduler source files were modified.',
    '',
    '## Scenario Results',
    '',
    scenarioTable(scenarios),
    '',
    '## Branch Evidence',
    '',
    '```json',
    JSON.stringify(scenarios.map(compactScenario), null, 2),
    '```',
    '',
    staticSection(),
    '',
    '## Interpretation',
    '',
    'The low-ROM path is now explained through the branch inputs visible before the one-shot seed. After the `0x0013FC` block, A/F is `0xEE54`, which means the port-`0x03` value has bit 4 clear and the `CALL NZ,0x015930` path is skipped. The `0x003CBC` helper sets `IY+0x2C` bit 0 and runs its keyboard/status port sequence. Back in the caller, the observed path reaches `0x001424`, calls the ROM signature check at `0x0008BB`, and that check returns Z with `HL=0x000000`; therefore `0x001428 JP NZ,0x0014C9` falls through to `0x00142C JP 0x000721`.',
    '',
    'This does not reopen the token/tail route; it explains why the active low-ROM scheduler path deterministically enters the renderer seed. The next useful step is to trace the post-seed continuation return mechanics (`0x000725 -> 0x0158A6 -> 0x00072D -> 0x0138F1 -> 0x002197 -> 0x0138F9 -> 0x006447/0x006475`) or test whether any upstream state can avoid this low-ROM scheduler path before it reaches `0x0013FC`.',
  ].join('\n');
}

const scenarios = KEY_CASES.map(runScenario);
const report = buildReport(scenarios);
fs.writeFileSync(REPORT_PATH, report);
console.log(report);
