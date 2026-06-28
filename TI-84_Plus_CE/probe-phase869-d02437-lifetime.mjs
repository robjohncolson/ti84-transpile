import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const shellRoot = __dirname;
const REPORT_PATH = path.join(__dirname, 'phase869-d02437-lifetime.md');
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const PRE_CLEAR_CAPTURE = path.join(__dirname, 'captures', 'realram-home-digit3-D00000-D657FF.bin');
const AFTER_CLEAR_CAPTURE = path.join(__dirname, 'captures', 'realram-home-afterCLEAR-D00000-D657FF.bin');

const MEM_SIZE = 0x1000000;
const RAM_BASE = 0xD00000;
const STACK_TOP = 0xD1A87E;
const WARM_IDLE = 0x0019BE;
const HALT_IDLE = 0x0019B5;
const OUTER_LOOP = 0x08C331;
const LAUNCH_HOME = 0x09DD62;
const HOME_REPAINT = 0x058241;
const CLEAR_SCAN = 0x0F;
const WATCH_START = 0xD02437;
const WATCH_END = 0xD02443;
const debugPort = 9869;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase869-'));
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const romBytes = fs.readFileSync(ROM_PATH);
const preClearRam = fs.readFileSync(PRE_CLEAR_CAPTURE);
const afterClearRam = fs.readFileSync(AFTER_CLEAR_CAPTURE);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;
const FULL_BOUNDARY_BYTES = preClearRam.length;
let nextId = 1;
const pending = new Map();
let chrome;
let server;
let ws;

const BOOT_SNAPSHOT_FIELDS = Object.freeze([
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D02505', 0xD02505, 1],
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

const FIELD_SPECS = Object.freeze([
  ['D00359_SAVE_D02437', 0xD00359, 3],
  ['D0035C_SAVE_D0243A', 0xD0035C, 3],
  ['D0035F_SAVE_D0243D', 0xD0035F, 3],
  ['D00362_SAVE_D02440', 0xD00362, 3],
  ['D0066F', 0xD0066F, 3],
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D010EF', 0xD010EF, 3],
  ['D010FE', 0xD010FE, 3],
  ['D02317', 0xD02317, 3],
  ['D0231A', 0xD0231A, 3],
  ['D0231D', 0xD0231D, 3],
  ['D02437', 0xD02437, 3],
  ['D0243A', 0xD0243A, 3],
  ['D0243D', 0xD0243D, 3],
  ['D02440', 0xD02440, 3],
  ['D02505', 0xD02505, 1],
  ['D02590', 0xD02590, 3],
  ['D0259D', 0xD0259D, 3],
  ['D02A29', 0xD02A29, 2],
]);

const TARGETS = Object.freeze({
  initEditPtrs0562e2: 0x0562E2,
  initEditPtrs0562e6: 0x0562E6,
  restoreContext04ed11: 0x04ED11,
  saveContext04eeb4: 0x04EEB4,
  copyD0243AToD0243704ef6f: 0x04EF6F,
  writeFromD0066F05e83a: 0x05E83A,
  writeFromD0066F05e844: 0x05E844,
  flagOwner058212: 0x058212,
  flagReturn058A14: 0x058A14,
  owner0A31FD: 0x0A31FD,
  anchor0A229D: 0x0A229D,
  cleanup0018F8: 0x0018F8,
  poll006D64: 0x006D64,
});

class EarlyStop extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function hex(value, width = 6) {
  return `0x${((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function readValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
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

function readCaptureValue(buffer, addr, len) {
  const offset = addr - RAM_BASE;
  if (offset < 0 || offset + len > buffer.length) return null;
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (buffer[offset + i] ?? 0) << (8 * i);
  return value >>> 0;
}

function readFields(mem) {
  return Object.fromEntries(FIELD_SPECS.map(([name, addr, len]) => [name, readValue(mem, addr, len)]));
}

function readCaptureFields(buffer) {
  return Object.fromEntries(FIELD_SPECS.map(([name, addr, len]) => [name, readCaptureValue(buffer, addr, len)]));
}

function formatFieldValue(name, value) {
  if (value == null) return null;
  if (name === 'D02505' || name.startsWith('D005') || name.startsWith('D000')) return hex(value, 2);
  if (name === 'D02A29') return hex(value, 4);
  return hex(value, 6);
}

function formatFields(fields) {
  return Object.fromEntries(Object.entries(fields ?? {}).map(([name, value]) => [name, formatFieldValue(name, value)]));
}

function captureFieldSnapshot(mem, fields) {
  return fields.map(([name, addr, len]) => ({
    name,
    addr,
    len,
    value: readValue(mem, addr, len),
    bytes: Array.from(mem.slice(addr, addr + len)),
  }));
}

function restoreFieldSnapshot(mem, snapshot) {
  for (const field of snapshot) {
    for (let i = 0; i < field.len; i += 1) mem[field.addr + i] = field.bytes[i] ?? 0;
  }
}

function compactCpu(cpu) {
  return {
    pc: cpu.pc & 0xFFFFFF,
    currentBlockPc: cpu._currentBlockPc & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    af: cpu.af & 0xFFFF,
    bc: cpu.bc & 0xFFFFFF,
    de: cpu.de & 0xFFFFFF,
    hl: cpu.hl & 0xFFFFFF,
    ix: (cpu._ix ?? cpu.ix ?? 0) & 0xFFFFFF,
    iy: (cpu._iy ?? cpu.iy ?? 0) & 0xFFFFFF,
    f: cpu.f & 0xFF,
  };
}

function makeRoute(label) {
  return {
    label,
    phase: 'init',
    totalBlocks: 0,
    phaseBlocks: 0,
    targetCounts: Object.fromEntries(Object.keys(TARGETS).map((name) => [name, 0])),
    targetFirst: {},
    writes: [],
    snapshots: {},
  };
}

function overlapsWatched(addr, len) {
  const start = addr & 0xFFFFFF;
  const end = start + len;
  return start < WATCH_END && end > WATCH_START;
}

function formatRunResult(result) {
  if (!result) return null;
  return {
    steps: result.steps ?? null,
    termination: result.termination ?? null,
    lastPc: result.lastPc == null ? null : hex(result.lastPc),
    lastMode: result.lastMode ?? null,
  };
}

function formatWrite(write) {
  return {
    ...write,
    pc: hex(write.pc),
    addr: hex(write.addr),
    value: hex(write.value, write.len * 2),
    beforeValue: hex(write.beforeValue, write.len * 2),
    afterValue: hex(write.afterValue, write.len * 2),
    beforeFields: formatFields(write.beforeFields),
    afterFields: formatFields(write.afterFields),
    cpu: {
      ...write.cpu,
      pc: hex(write.cpu.pc),
      currentBlockPc: hex(write.cpu.currentBlockPc),
      sp: hex(write.cpu.sp),
      af: hex(write.cpu.af, 4),
      bc: hex(write.cpu.bc),
      de: hex(write.cpu.de),
      hl: hex(write.cpu.hl),
      ix: hex(write.cpu.ix),
      iy: hex(write.cpu.iy),
      f: hex(write.cpu.f, 2),
    },
  };
}

function attachWriteTrace(machine) {
  const { cpu, mem, route } = machine;
  const originals = {
    write8: cpu.write8.bind(cpu),
    write16: cpu.write16.bind(cpu),
    write24: cpu.write24.bind(cpu),
  };

  function record(kind, addr, len, value, fn) {
    const a = addr & 0xFFFFFF;
    const shouldRecord = overlapsWatched(a, len);
    const beforeFields = shouldRecord ? readFields(mem) : null;
    const beforeValue = shouldRecord ? readValue(mem, a, len) : null;
    fn();
    if (!shouldRecord) return;
    route.writes.push({
      index: route.writes.length,
      phase: route.phase,
      block: route.totalBlocks,
      pc: cpu._currentBlockPc & 0xFFFFFF,
      kind,
      addr: a,
      len,
      value: value >>> 0,
      beforeValue,
      afterValue: readValue(mem, a, len),
      beforeFields,
      afterFields: readFields(mem),
      cpu: compactCpu(cpu),
    });
  }

  cpu.write8 = (addr, value) => record('write8', addr, 1, value, () => originals.write8(addr, value));
  cpu.write16 = (addr, value) => record('write16', addr, 2, value, () => originals.write16(addr, value));
  cpu.write24 = (addr, value) => record('write24', addr, 3, value, () => originals.write24(addr, value));
}

function makeMachine(label) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, MEM_SIZE));
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals, trackMemoryMapped: true });
  const machine = { label, mem, peripherals, executor, cpu: executor.cpu, route: makeRoute(label) };
  attachWriteTrace(machine);
  return machine;
}

function snapshot(machine, name) {
  machine.route.snapshots[name] = formatFields(readFields(machine.mem));
}

function runWithTrace(machine, phase, startAddress, mode, opts = {}) {
  const { executor, cpu, route } = machine;
  const userOnBlock = opts.onBlock;
  route.phase = phase;
  route.phaseBlocks = 0;
  return executor.runFrom(startAddress, mode, {
    ...opts,
    onBlock(pc, blockMode, meta, steps) {
      const addr = pc & 0xFFFFFF;
      route.totalBlocks += 1;
      route.phaseBlocks += 1;
      for (const [name, target] of Object.entries(TARGETS)) {
        if (addr !== target) continue;
        route.targetCounts[name] += 1;
        route.targetFirst[name] ??= {
          phase,
          block: route.totalBlocks,
          pc: hex(addr),
          fields: formatFields(readFields(machine.mem)),
          cpu: compactCpu(cpu),
        };
      }
      userOnBlock?.(pc, blockMode, meta, steps);
    },
  });
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

function seedClear(mem, peripherals) {
  mem[0xD00587] = CLEAR_SCAN;
  mem[0xD0058C] = CLEAR_SCAN;
  mem[0xD0058D] = CLEAR_SCAN;
  mem[0xD0058E] = CLEAR_SCAN;
  mem[0xD00080] = (mem[0xD00080] | 0x08) & 0xFF;
  mem[0xD0009F] = (mem[0xD0009F] | 0x20) & 0xFF;
  peripherals.setKeyPressed(mem, CLEAR_SCAN);
}

function rearmCxMain(mem) {
  for (let i = 0; i < 21; i += 1) mem[0xD007CA + i] = romBytes[0x0585D3 + i];
  mem[0xD0008D] = romBytes[0x0585D3 + 21];
}

function runBootToBoundary(machine) {
  const { mem, peripherals, cpu } = machine;
  const phases = [];

  phases.push({ name: 'p1-coldboot', result: runWithTrace(machine, 'p1-coldboot', 0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 }) });
  snapshot(machine, 'after-p1-coldboot');

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);
  phases.push({ name: 'p2-kernel', result: runWithTrace(machine, 'p2-kernel', OUTER_LOOP, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 }) });
  snapshot(machine, 'after-p2-kernel');

  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);
  phases.push({ name: 'p3-postinit', result: runWithTrace(machine, 'p3-postinit', 0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 }) });
  snapshot(machine, 'after-p3-postinit');

  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  cpu.sp = STACK_TOP - 12;
  fillSentinel(mem, cpu.sp, 12);
  phases.push({ name: 'p4-warm-idle', result: runWithTrace(machine, 'p4-warm-idle', WARM_IDLE, 'adl', { maxSteps: 1500000, maxLoopIterations: 100000 }) });
  snapshot(machine, 'after-p4-warm-idle');

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

  return phases;
}

function runLaunchHome(machine) {
  const { mem } = machine;
  let boundarySnapshot = null;
  const counts = { launchHome09dd62: 0, clear001879: 0, cleanup0018f8: 0, halt0019b5: 0 };
  const result = runWithTrace(machine, 'p5-launch-home-09dd62', LAUNCH_HOME, 'adl', {
    maxSteps: 300000,
    maxLoopIterations: 30000,
    onBlock(pc) {
      const addr = pc & 0xFFFFFF;
      if (addr === LAUNCH_HOME) counts.launchHome09dd62 += 1;
      if (addr === 0x001879) {
        counts.clear001879 += 1;
        if (!boundarySnapshot && readValue(mem, 0xD02590, 3) !== 0) {
          boundarySnapshot = {
            block: machine.route.totalBlocks,
            pc: addr,
            fields: captureFieldSnapshot(mem, BOOT_SNAPSHOT_FIELDS),
            fullRam: mem.slice(RAM_BASE, RAM_BASE + FULL_BOUNDARY_BYTES),
            watchedFields: readFields(mem),
          };
        }
      }
      if (addr === 0x0018F8) counts.cleanup0018f8 += 1;
      if (addr === HALT_IDLE) counts.halt0019b5 += 1;
    },
  });
  snapshot(machine, 'after-p5-launch-home');
  return { result, counts, boundarySnapshot, finalFields: readFields(mem) };
}

function runRepaint(machine) {
  const { mem, peripherals, cpu } = machine;
  prepareEventFrame(mem, peripherals, cpu);
  const result = runWithTrace(machine, 'p6-home-repaint-058241', HOME_REPAINT, 'adl', {
    maxSteps: 300000,
    maxLoopIterations: 30000,
  });
  snapshot(machine, 'after-p6-repaint');
  return { result, fields: readFields(mem) };
}

function runClear(machine, options = {}) {
  const { mem, peripherals, cpu } = machine;
  prepareEventFrame(mem, peripherals, cpu);
  seedClear(mem, peripherals);
  snapshot(machine, 'before-p7-clear');
  let previousPc = null;
  let stopReason = null;
  let result = null;
  try {
    result = runWithTrace(machine, options.phase ?? 'p7-clear', OUTER_LOOP, 'adl', {
      maxSteps: options.maxSteps ?? 160000,
      maxLoopIterations: options.maxLoopIterations ?? 160000,
      diHaltBypass: true,
      diHaltBypassEntry: OUTER_LOOP,
      onBlock(pc) {
        const addr = pc & 0xFFFFFF;
        if (options.stopAtOwnerCopy && addr === 0x0A31A2 && previousPc === 0x0A31E2) {
          stopReason = 'captured-0a31e2-to-0a31a2';
          throw new EarlyStop(stopReason);
        }
        previousPc = addr;
      },
    });
  } catch (error) {
    if (!(error instanceof EarlyStop)) throw error;
    result = {
      steps: machine.route.phaseBlocks,
      termination: error.reason,
      lastPc: cpu._currentBlockPc & 0xFFFFFF,
      lastMode: 'adl',
    };
  }
  snapshot(machine, 'after-p7-clear');
  return { result, stopReason, fields: readFields(mem) };
}

function restoreHarnessBoundary(mem, snapshotData) {
  restoreFieldSnapshot(mem, snapshotData.fields);
  writeValue(mem, 0xD02505, 1, snapshotData.watchedFields.D02505);
  return readFields(mem);
}

function runLiveRoute() {
  const machine = makeMachine('live-direct-clear-route');
  const phases = [];
  phases.push(...runBootToBoundary(machine));
  const launch = runLaunchHome(machine);
  phases.push({ name: 'p5-launch-home', result: launch.result });
  const repaint = runRepaint(machine);
  phases.push({ name: 'p6-home-repaint', result: repaint.result });
  const clear = runClear(machine, { phase: 'p7-live-clear', maxSteps: 160000 });
  phases.push({ name: 'p7-live-clear', result: clear.result });
  return summarizeRoute(machine, { phases, launch, repaint, clear });
}

function runHarnessRoute() {
  const machine = makeMachine('phase856-style-harness-clear-route');
  const phases = [];
  phases.push(...runBootToBoundary(machine));
  const launch = runLaunchHome(machine);
  phases.push({ name: 'p5-launch-home', result: launch.result });
  if (!launch.boundarySnapshot) throw new Error('harness boundary snapshot was not captured');
  const afterRestore = restoreHarnessBoundary(machine.mem, launch.boundarySnapshot);
  snapshot(machine, 'after-harness-boundary-restore');
  const repaint = runRepaint(machine);
  phases.push({ name: 'p6-home-repaint', result: repaint.result });

  rearmCxMain(machine.mem);
  write24(machine.mem, 0xD0243A, 0xD1A8CC);
  write24(machine.mem, 0xD0243D, 0xD2A83E);
  writeValue(machine.mem, 0xD02A29, 2, 0x0000);
  snapshot(machine, 'after-harness-manual-setup');

  const clear = runClear(machine, { phase: 'p7-harness-clear', maxSteps: 100000, stopAtOwnerCopy: true });
  phases.push({ name: 'p7-harness-clear', result: clear.result });
  return summarizeRoute(machine, { phases, launch, repaint, clear, afterRestore: formatFields(afterRestore) });
}

function summarizeRoute(machine, extras) {
  return {
    label: machine.label,
    phases: extras.phases.map((phase) => ({ name: phase.name, result: formatRunResult(phase.result) })),
    snapshots: machine.route.snapshots,
    launch: {
      counts: extras.launch.counts,
      boundaryWatchedFields: extras.launch.boundarySnapshot ? formatFields(extras.launch.boundarySnapshot.watchedFields) : null,
      finalFields: formatFields(extras.launch.finalFields),
    },
    afterRestore: extras.afterRestore ?? null,
    repaint: {
      result: formatRunResult(extras.repaint.result),
      fields: formatFields(extras.repaint.fields),
    },
    clear: {
      result: formatRunResult(extras.clear.result),
      stopReason: extras.clear.stopReason ?? null,
      fields: formatFields(extras.clear.fields),
    },
    targetCounts: machine.route.targetCounts,
    targetFirst: machine.route.targetFirst,
    writes: machine.route.writes.map(formatWrite),
  };
}

function scanPattern(bytes) {
  const hits = [];
  for (let pc = 0; pc <= romBytes.length - bytes.length; pc += 1) {
    let ok = true;
    for (let i = 0; i < bytes.length; i += 1) {
      if (romBytes[pc + i] !== bytes[i]) {
        ok = false;
        break;
      }
    }
    if (ok) hits.push(pc);
  }
  return hits;
}

function formatInst(inst) {
  if (!inst) return '(decode failed)';
  const upper = (value) => String(value ?? '?').toUpperCase();
  if (inst.tag === 'ret') return 'RET';
  if (inst.tag === 'call') return `CALL ${hex(inst.target)}`;
  if (inst.tag === 'jp') return `JP ${hex(inst.target)}`;
  if (inst.tag === 'jr') return `JR ${hex(inst.target)}`;
  if (inst.tag === 'jr-conditional') return `JR ${upper(inst.condition)}, ${hex(inst.target)}`;
  if (inst.tag === 'ld-pair-imm') return `LD ${upper(inst.pair ?? inst.dest)}, ${hex(inst.value)}`;
  if (inst.tag === 'ld-reg-mem') return `LD ${upper(inst.dest)}, (${hex(inst.addr)})`;
  if (inst.tag === 'ld-mem-reg') return `LD (${hex(inst.addr)}), ${upper(inst.src)}`;
  if (inst.tag === 'ldir') return 'LDIR';
  if (inst.tag === 'lddr') return 'LDDR';
  return `${inst.tag} ${JSON.stringify(Object.fromEntries(Object.entries(inst).filter(([key]) => !['tag', 'pc', 'length', 'nextPc'].includes(key))))}`;
}

function decodeLinear(start, end) {
  const rows = [];
  let pc = start;
  while (pc <= end) {
    const inst = decodeInstruction(romBytes, pc, 'adl');
    const bytes = Array.from(romBytes.subarray(pc, pc + inst.length), (byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    rows.push({ pc: hex(pc), bytes, instruction: formatInst(inst) });
    pc += Math.max(1, inst.length);
  }
  return rows;
}

function staticWriterCandidates() {
  const directHl = scanPattern([0x22, 0x37, 0x24, 0xD0]).map((pc) => ({ pc, kind: 'LD (D02437),HL', decodeStart: Math.max(0, pc - 8), decodeEnd: pc + 12 }));
  const directDe = scanPattern([0xED, 0x53, 0x37, 0x24, 0xD0]).map((pc) => ({ pc, kind: 'LD (D02437),DE', decodeStart: Math.max(0, pc - 8), decodeEnd: pc + 12 }));
  const ldirRestore = scanPattern([0x11, 0x37, 0x24, 0xD0]).map((pc) => ({ pc, kind: 'LD DE,D02437 (possible LDIR restore destination)', decodeStart: Math.max(0, pc - 12), decodeEnd: pc + 16 }));
  const ldirSave = scanPattern([0x21, 0x37, 0x24, 0xD0]).map((pc) => ({ pc, kind: 'LD HL,D02437 (possible LDIR save source)', decodeStart: Math.max(0, pc - 12), decodeEnd: pc + 16 }));
  return [...directHl, ...directDe, ...ldirRestore, ...ldirSave]
    .filter((hit) => hit.pc < 0x400000)
    .map((hit) => ({
      ...hit,
      pc: hex(hit.pc),
      decode: decodeLinear(hit.decodeStart, hit.decodeEnd),
    }));
}

function contentTypeFor(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.gz')) return 'application/gzip';
  if (filePath.endsWith('.wasm')) return 'application/wasm';
  if (filePath.endsWith('.rom')) return 'application/octet-stream';
  return 'application/octet-stream';
}

function instrumentBrowserShell(sourceHtml) {
  let html = sourceHtml;
  const snapshotLine = '      coldbootVatSnapshot = COLDBOOT_STABLE_REPLAY_FIELDS.map((field) => [field, readColdbootReplayField(field)]);';
  const replayLine = '    for (const [field, value] of coldbootVatSnapshot) writeColdbootReplayField(field, value);';
  const marker = 'function finalizeColdbootPersistenceState(state) {';
  if (!html.includes(snapshotLine)) throw new Error('snapshot capture marker not found');
  if (!html.includes(replayLine)) throw new Error('snapshot replay marker not found');
  if (!html.includes(marker)) throw new Error('persistence marker not found');

  html = html.replace(snapshotLine, `${snapshotLine}
      window.__phase869BootSnapshot = coldbootVatSnapshot.map(([field, value]) => ({ name: field[0], addr: field[1], len: field[2], value }));`);

  html = html.replace(replayLine, `${replayLine}
    window.__phase869ReplayApplied = true;
    window.__phase869PostReplayFields = Object.fromEntries(COLDBOOT_STABLE_REPLAY_FIELDS.map((field) => [field[0], readColdbootReplayField(field)]));`);

  const injection = String.raw`
const PHASE869_ROUTE_LIMIT = 5000;
const PHASE869_TARGETS = Object.freeze({
  initEditPtrs0562e2: 0x0562E2,
  initEditPtrs0562e6: 0x0562E6,
  restoreContext04ed11: 0x04ED11,
  saveContext04eeb4: 0x04EEB4,
  copyD0243AToD0243704ef6f: 0x04EF6F,
  writeFromD0066F05e83a: 0x05E83A,
  writeFromD0066F05e844: 0x05E844,
  flagOwner058212: 0x058212,
  flagReturn058A14: 0x058A14,
  owner0A31FD: 0x0A31FD,
  anchor0A229D: 0x0A229D,
  cleanup0018F8: 0x0018F8,
  poll006D64: 0x006D64,
});
const PHASE869_FIELDS = Object.freeze([
  ['D00359_SAVE_D02437', 0xD00359, 3],
  ['D0035C_SAVE_D0243A', 0xD0035C, 3],
  ['D0035F_SAVE_D0243D', 0xD0035F, 3],
  ['D00362_SAVE_D02440', 0xD00362, 3],
  ['D0066F', 0xD0066F, 3],
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D010EF', 0xD010EF, 3],
  ['D010FE', 0xD010FE, 3],
  ['D02317', 0xD02317, 3],
  ['D0231A', 0xD0231A, 3],
  ['D0231D', 0xD0231D, 3],
  ['D02437', 0xD02437, 3],
  ['D0243A', 0xD0243A, 3],
  ['D0243D', 0xD0243D, 3],
  ['D02440', 0xD02440, 3],
  ['D02505', 0xD02505, 1],
  ['D02590', 0xD02590, 3],
  ['D0259D', 0xD0259D, 3],
  ['D02A29', 0xD02A29, 2],
]);
const PHASE869_CHANGE_FIELDS = ['D02437', 'D0243A', 'D0243D', 'D02440', 'D0066F', 'D010FE', 'D010EF'];
function phase869ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
  return value >>> 0;
}
function phase869Hex(value, width = 6) {
  return '0x' + ((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}
function phase869FieldWidth(name) {
  if (name === 'D02505') return 2;
  if (name === 'D02A29') return 4;
  return 6;
}
function phase869ReadFieldsRaw() {
  const mem = cpu?.memory;
  if (!mem) return null;
  return Object.fromEntries(PHASE869_FIELDS.map(([name, addr, len]) => [name, phase869ReadValue(mem, addr, len)]));
}
function phase869FormatFields(fields) {
  if (!fields) return null;
  return Object.fromEntries(Object.entries(fields).map(([name, value]) => [name, phase869Hex(value, phase869FieldWidth(name))]));
}
function phase869CpuRaw() {
  return cpu ? {
    pc: phase869Hex(cpu.pc ?? 0),
    currentBlockPc: phase869Hex(cpu._currentBlockPc ?? 0),
    stepCount: cpu.stepCount ?? 0,
    sp: phase869Hex(cpu.sp ?? 0),
    af: phase869Hex(cpu.af ?? 0, 4),
    bc: phase869Hex(cpu.bc ?? 0),
    de: phase869Hex(cpu.de ?? 0),
    hl: phase869Hex(cpu.hl ?? 0),
    ix: phase869Hex(cpu._ix ?? cpu.ix ?? 0),
    iy: phase869Hex(cpu._iy ?? cpu.iy ?? 0),
    f: phase869Hex(cpu.f ?? 0, 2),
  } : null;
}
function phase869Read(label = 'read') {
  return {
    label,
    status: document.getElementById('status')?.textContent ?? null,
    runtimeMode,
    lastPc,
    lastMode,
    totalSteps,
    cpu: phase869CpuRaw(),
    fields: phase869FormatFields(phase869ReadFieldsRaw()),
    bootSnapshot: window.__phase869BootSnapshot ?? null,
    replayApplied: window.__phase869ReplayApplied === true,
    postReplayFields: window.__phase869PostReplayFields ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    pageErrors: [...(window.__phase869PageErrors ?? [])],
  };
}
function phase869CreateRecord(label) {
  return {
    label,
    start: null,
    end: null,
    totalBlocks: 0,
    prevPc: null,
    prevFields: null,
    rows: [],
    changes: [],
    targetCounts: Object.fromEntries(Object.keys(PHASE869_TARGETS).map((name) => [name, 0])),
    targetFirst: {},
    hotBlocks: {},
  };
}
function phase869Snapshot(record, pc, fieldsRaw = phase869ReadFieldsRaw()) {
  return {
    index: record.rows.length,
    block: record.totalBlocks,
    pc: phase869Hex(pc & 0xFFFFFF),
    prevPc: record.prevPc == null ? null : phase869Hex(record.prevPc),
    cpu: phase869CpuRaw(),
    fields: phase869FormatFields(fieldsRaw),
  };
}
function phase869MaybeRecordChange(record, addr) {
  const fields = phase869ReadFieldsRaw();
  if (!fields) return;
  if (!record.prevFields) {
    record.prevFields = fields;
    return;
  }
  const changed = PHASE869_CHANGE_FIELDS.filter((name) => record.prevFields[name] !== fields[name]);
  if (changed.length && record.changes.length < 200) {
    record.changes.push({
      block: record.totalBlocks,
      writerPc: record.prevPc == null ? null : phase869Hex(record.prevPc),
      observedAtPc: phase869Hex(addr),
      changed,
      beforeFields: phase869FormatFields(record.prevFields),
      afterFields: phase869FormatFields(fields),
      cpu: phase869CpuRaw(),
    });
  }
  record.prevFields = fields;
}
window.__phase869PageErrors = [];
window.addEventListener('error', (event) => {
  window.__phase869PageErrors.push(String(event.message || event.error || event));
});
window.addEventListener('unhandledrejection', (event) => {
  window.__phase869PageErrors.push(String(event.reason || event));
});
window.__phase869 = {
  records: [],
  begin(label) {
    const record = phase869CreateRecord(label);
    this.records.push(record);
    record.start = phase869Read('start');
    record.prevFields = phase869ReadFieldsRaw();
    return record.start;
  },
  finish() {
    const record = this.records.at(-1) ?? null;
    if (record) {
      record.end = phase869Read('end');
      record.topHotBlocks = Object.entries(record.hotBlocks)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 24)
        .map(([pc, count]) => ({ pc, count }));
    }
    return record;
  },
  read: phase869Read,
};
const phase869OriginalObserve = observeColdbootPersistenceBlock;
observeColdbootPersistenceBlock = function phase869ObserveColdbootPersistenceBlock(state, pc) {
  const addr = pc & 0xFFFFFF;
  const record = window.__phase869.records.at(-1) ?? phase869CreateRecord('implicit');
  if (!window.__phase869.records.length) window.__phase869.records.push(record);
  record.totalBlocks += 1;
  const pcHex = phase869Hex(addr);
  record.hotBlocks[pcHex] = (record.hotBlocks[pcHex] || 0) + 1;
  phase869MaybeRecordChange(record, addr);
  for (const [name, target] of Object.entries(PHASE869_TARGETS)) {
    if (addr !== target) continue;
    record.targetCounts[name] += 1;
    if (!record.targetFirst[name]) record.targetFirst[name] = phase869Snapshot(record, addr);
  }
  if (record.rows.length < PHASE869_ROUTE_LIMIT) record.rows.push(phase869Snapshot(record, addr));
  const result = phase869OriginalObserve(state, pc);
  record.prevPc = addr;
  return result;
};
getColdbootControlPreStop = function phase869GetColdbootControlPreStop(code) {
  if (code === 'Escape') return null;
  return COLDBOOT_CONTROL_PRE_STOP_BY_PC_CODE[code] ?? null;
};
const phase869OriginalRunOptions = getColdbootRunOptions;
getColdbootRunOptions = function phase869GetColdbootRunOptions(stepBudget) {
  const opts = phase869OriginalRunOptions(stepBudget);
  opts.maxSteps = 160000;
  return opts;
};
`;

  return html.replace(marker, `${injection}\n\n${marker}`);
}

function startStaticServer() {
  const serverInstance = http.createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const rel = decodeURIComponent(url.pathname.replace(/^\/+/, '')) || 'browser-shell.html';
      const fullPath = path.resolve(shellRoot, rel);
      if (fullPath !== shellRoot && !fullPath.startsWith(`${shellRoot}${path.sep}`)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      if (!fs.existsSync(fullPath) || fs.statSync(fullPath).isDirectory()) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      res.writeHead(200, { 'content-type': contentTypeFor(fullPath), 'cache-control': 'no-store' });
      if (rel === 'browser-shell.html') {
        res.end(instrumentBrowserShell(fs.readFileSync(fullPath, 'utf8')));
        return;
      }
      fs.createReadStream(fullPath).pipe(res);
    } catch (error) {
      if (!res.headersSent) res.writeHead(500);
      res.end(String(error?.stack || error));
    }
  });
  return new Promise((resolve, reject) => {
    serverInstance.once('error', reject);
    serverInstance.listen(0, '127.0.0.1', () => resolve(serverInstance));
  });
}

function httpJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
      });
    }).on('error', reject);
  });
}

async function waitForDevtools() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const pages = await httpJson(`http://127.0.0.1:${debugPort}/json/list`);
      const page = pages.find((entry) => entry.type === 'page' && entry.webSocketDebuggerUrl);
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(200);
  }
  throw new Error('Timed out waiting for Chrome DevTools endpoint');
}

function connect(wsUrl) {
  const socket = new WebSocket(wsUrl);
  socket.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject, timer } = pending.get(msg.id);
      pending.delete(msg.id);
      clearTimeout(timer);
      if (msg.error) reject(new Error(JSON.stringify(msg.error)));
      else resolve(msg.result);
    }
  });
  return new Promise((resolve, reject) => {
    socket.addEventListener('open', () => resolve(socket), { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
}

function cdp(socket, method, params = {}, timeout = 120000) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`CDP timeout: ${method}`));
    }, timeout);
    timer.unref?.();
    pending.set(id, { resolve, reject, timer });
  });
}

async function evalExpr(socket, expression, timeout = 120000) {
  const result = await cdp(socket, 'Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout,
  }, timeout + 5000);
  if (result.exceptionDetails) {
    const d = result.exceptionDetails;
    throw new Error(`${d.exception?.description || d.exception?.value || d.text || 'evaluate exception'}`);
  }
  return result.result.value;
}

async function waitFor(socket, expression, label, timeout = 150000) {
  const deadline = Date.now() + timeout;
  let lastValue;
  while (Date.now() < deadline) {
    lastValue = await evalExpr(socket, expression, 10000);
    if (lastValue) return lastValue;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${label}; lastValue=${JSON.stringify(lastValue)}`);
}

function keyParams(type) {
  return {
    type,
    windowsVirtualKeyCode: 27,
    nativeVirtualKeyCode: 27,
    code: 'Escape',
    key: 'Escape',
  };
}

function browserChangesToWrites(changes) {
  return (changes ?? []).map((change, index) => ({
    index,
    phase: 'browser-live-clear',
    pc: change.writerPc ?? change.observedAtPc,
    kind: `block-diff:${(change.changed ?? []).join(',')}`,
    addr: '0xD02437',
    len: 3,
    value: change.afterFields?.D02437 ?? '0x000000',
    beforeValue: change.beforeFields?.D02437 ?? '0x000000',
    afterValue: change.afterFields?.D02437 ?? '0x000000',
    beforeFields: change.beforeFields,
    afterFields: change.afterFields,
    cpu: change.cpu,
  }));
}

async function runLiveBrowserRoute() {
  if (!chromePath) throw new Error('No Chrome/Edge executable found for headless browser test');
  server = await startStaticServer();
  const pageUrl = `http://127.0.0.1:${server.address().port}/browser-shell.html`;
  chrome = spawn(chromePath, [
    '--headless=new',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${userDataDir}`,
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank',
  ], { stdio: 'ignore', windowsHide: true });

  ws = await connect(await waitForDevtools());
  await cdp(ws, 'Page.enable');
  await cdp(ws, 'Runtime.enable');
  await cdp(ws, 'Page.navigate', { url: pageUrl });
  await waitFor(ws, 'document.readyState === "complete"', 'page load', 30000);
  await waitFor(ws, '!!window.__phase869 && !!window.__coldbootReadEditLineState', 'phase869 instrumentation', 30000);
  await sleep(500);

  await evalExpr(ws, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);
  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 180000);
  await sleep(100);

  const afterBoot = await evalExpr(ws, `window.__phase869.read('afterBoot')`, 30000);
  await evalExpr(ws, `window.__phase869.begin('browser-live-clear-route')`, 30000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams('keyDown'), 180000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams('keyUp'), 30000);
  await waitFor(ws, `window.__coldbootLastKey?.code === 'Escape'`, 'Escape completion', 180000);
  await sleep(150);
  const record = await evalExpr(ws, `window.__phase869.finish()`, 30000);
  const state = await evalExpr(ws, `(() => ({
    status: document.getElementById('status')?.textContent ?? null,
    keyState: window.__coldbootLastKey ?? null,
    diagnostics: window.__coldbootReadEditLineState?.() ?? null,
    pageErrors: window.__phase869PageErrors ?? [],
  }))()`, 30000);

  return {
    label: 'browser-live-clear-route',
    phases: [
      { name: 'coldboot-browser', result: { termination: 'coldboot-complete', steps: afterBoot.totalSteps ?? null, lastPc: null, lastMode: null } },
      { name: 'p7-browser-live-clear', result: { termination: state.keyState?.termination ?? null, steps: state.keyState?.steps ?? null, lastPc: null, lastMode: null } },
    ],
    snapshots: {
      'after-browser-coldboot': afterBoot.fields,
      'before-p7-clear': record.start?.fields,
      'after-p7-clear': record.end?.fields,
    },
    launch: {
      counts: {},
      boundaryWatchedFields: null,
      finalFields: afterBoot.fields,
    },
    repaint: {
      result: null,
      fields: afterBoot.fields,
    },
    clear: {
      result: { termination: state.keyState?.termination ?? null, steps: state.keyState?.steps ?? null, lastPc: null, lastMode: null },
      stopReason: null,
      fields: record.end?.fields,
      state,
    },
    targetCounts: record.targetCounts ?? {},
    targetFirst: record.targetFirst ?? {},
    writes: browserChangesToWrites(record.changes),
    browser: { afterBoot, record, state },
  };
}

function keyWriteSummary(route) {
  return route.writes
    .filter((write) => write.afterFields?.D02437 !== write.beforeFields?.D02437)
    .map((write) => ({
      phase: write.phase,
      pc: write.pc,
      kind: write.kind,
      addr: write.addr,
      beforeD02437: write.beforeFields?.D02437,
      afterD02437: write.afterFields?.D02437,
      beforeD0243A: write.beforeFields?.D0243A,
      afterD0243A: write.afterFields?.D0243A,
      beforeD0243D: write.beforeFields?.D0243D,
      afterD0243D: write.afterFields?.D0243D,
      hl: write.cpu?.hl,
      de: write.cpu?.de,
      bc: write.cpu?.bc,
      sourceD0066F: write.afterFields?.D0066F,
      sourceD010FE: write.afterFields?.D010FE,
      sourceD010EF: write.afterFields?.D010EF,
    }));
}

function table(rows, columns) {
  return [
    `| ${columns.map((col) => col.label).join(' | ')} |`,
    `| ${columns.map((col) => col.align ?? '---').join(' | ')} |`,
    ...rows.map((row) => `| ${columns.map((col) => row[col.key] ?? '-').join(' | ')} |`),
  ].join('\n');
}

function snapshotTable(label, route) {
  const names = ['after-p5-launch-home', 'after-p6-repaint', 'after-harness-boundary-restore', 'after-harness-manual-setup', 'before-p7-clear', 'after-p7-clear'];
  const rows = names
    .filter((name) => route.snapshots[name])
    .map((name) => ({
      point: name,
      D02437: route.snapshots[name].D02437,
      D0243A: route.snapshots[name].D0243A,
      D0243D: route.snapshots[name].D0243D,
      D02440: route.snapshots[name].D02440,
      D0066F: route.snapshots[name].D0066F,
      D010FE: route.snapshots[name].D010FE,
      D010EF: route.snapshots[name].D010EF,
    }));
  return [
    `### ${label}`,
    '',
    table(rows, [
      { key: 'point', label: 'Point' },
      { key: 'D02437', label: 'D02437' },
      { key: 'D0243A', label: 'D0243A' },
      { key: 'D0243D', label: 'D0243D' },
      { key: 'D02440', label: 'D02440' },
      { key: 'D0066F', label: 'D0066F' },
      { key: 'D010FE', label: 'D010FE' },
      { key: 'D010EF', label: 'D010EF' },
    ]),
  ].join('\n');
}

function buildReport(data) {
  if (data.error) {
    return [
      '# Phase 869: D02437 Owner/Lifetime Trace',
      '',
      'Probe failed before producing a complete comparison.',
      '',
      '```text',
      data.error,
      '```',
      '',
    ].join('\n');
  }

  const liveWrites = keyWriteSummary(data.live);
  const bootstrapWrites = keyWriteSummary(data.liveBootstrap ?? { writes: [] });
  const harnessWrites = keyWriteSummary(data.harness);
  const bootstrapD1A8CC = bootstrapWrites.find((write) => write.afterD02437 === '0xD1A8CC') ?? null;
  const harnessD1A8A3 = harnessWrites.find((write) => write.afterD02437 === '0xD1A8A3') ?? null;
  const captureRows = ['D02437', 'D0243A', 'D0243D', 'D02440', 'D0066F', 'D010FE', 'D010EF', 'D02590', 'D0259D'].map((name) => ({
    field: name,
    beforeClear: data.captureFields.pre[name],
    afterClear: data.captureFields.after[name],
    liveBeforeClear: data.live.snapshots['before-p7-clear']?.[name],
    harnessBeforeClear: data.harness.snapshots['before-p7-clear']?.[name],
  }));
  const summary = [
    `- Result: ${data.pass ? 'PASS' : 'FAIL'}.`,
    `- Browser live route starts CLEAR with D02437=${data.live.snapshots['before-p7-clear']?.D02437}; raw CEmu before/after CLEAR captures both report ${data.captureFields.pre.D02437} -> ${data.captureFields.after.D02437}.`,
    `- Harness route carries D02437=${data.harness.snapshots['before-p7-clear']?.D02437} before CLEAR while D0243A=${data.harness.snapshots['before-p7-clear']?.D0243A}; that reproduces the Phase867/868 branch-controller mismatch.`,
    `- OS boot/lifetime writer for the live value: ${bootstrapD1A8CC?.pc ?? 'none'} in ${bootstrapD1A8CC?.phase ?? 'n/a'} (${bootstrapD1A8CC?.beforeD02437 ?? '-'} -> ${bootstrapD1A8CC?.afterD02437 ?? '-'}), with D010FE=${bootstrapD1A8CC?.sourceD010FE ?? '-'}.`,
    `- Harness value writer: ${harnessD1A8A3?.pc ?? 'none'} in ${harnessD1A8A3?.phase ?? 'n/a'} (${harnessD1A8A3?.beforeD02437 ?? '-'} -> ${harnessD1A8A3?.afterD02437 ?? '-'}), with D0066F=${harnessD1A8A3?.sourceD0066F ?? '-'}.`,
    '- Interpretation: the live route matches the real after-CLEAR oracle for this pointer before the bad wipe; the harness-only owner path inherits a different low edit pointer before CLEAR, so it is still diagnostic rather than hardware-authoritative.',
  ];

  return [
    '# Phase 869: D02437 Owner/Lifetime Trace',
    '',
    'Probe: `probe-phase869-d02437-lifetime.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase869-d02437-lifetime.mjs`',
    '',
    '## Summary',
    '',
    ...summary,
    '',
    '## D02437-Changing Writes',
    '',
    '### Live Boot/Lifetime Writer Evidence',
    '',
    table(bootstrapWrites, [
      { key: 'phase', label: 'Phase' },
      { key: 'pc', label: 'PC' },
      { key: 'kind', label: 'Kind' },
      { key: 'beforeD02437', label: 'Before D02437' },
      { key: 'afterD02437', label: 'After D02437' },
      { key: 'afterD0243A', label: 'After D0243A' },
      { key: 'afterD0243D', label: 'After D0243D' },
      { key: 'hl', label: 'HL' },
      { key: 'de', label: 'DE' },
      { key: 'sourceD0066F', label: 'D0066F' },
      { key: 'sourceD010FE', label: 'D010FE' },
    ]),
    '',
    '### Browser Live CLEAR Route Changes',
    '',
    table(liveWrites, [
      { key: 'phase', label: 'Phase' },
      { key: 'pc', label: 'PC' },
      { key: 'kind', label: 'Kind' },
      { key: 'beforeD02437', label: 'Before D02437' },
      { key: 'afterD02437', label: 'After D02437' },
      { key: 'afterD0243A', label: 'After D0243A' },
      { key: 'afterD0243D', label: 'After D0243D' },
      { key: 'hl', label: 'HL' },
      { key: 'de', label: 'DE' },
      { key: 'sourceD0066F', label: 'D0066F' },
      { key: 'sourceD010FE', label: 'D010FE' },
    ]),
    '',
    '### Harness Route',
    '',
    table(harnessWrites, [
      { key: 'phase', label: 'Phase' },
      { key: 'pc', label: 'PC' },
      { key: 'kind', label: 'Kind' },
      { key: 'beforeD02437', label: 'Before D02437' },
      { key: 'afterD02437', label: 'After D02437' },
      { key: 'afterD0243A', label: 'After D0243A' },
      { key: 'afterD0243D', label: 'After D0243D' },
      { key: 'hl', label: 'HL' },
      { key: 'de', label: 'DE' },
      { key: 'sourceD0066F', label: 'D0066F' },
      { key: 'sourceD010FE', label: 'D010FE' },
    ]),
    '',
    '## Lifetime Snapshots',
    '',
    snapshotTable('Browser Live Route', data.live),
    '',
    snapshotTable('Direct Runtime Boot Writer Route', data.liveBootstrap),
    '',
    snapshotTable('Harness Route', data.harness),
    '',
    '## Raw Capture Cross-Check',
    '',
    table(captureRows, [
      { key: 'field', label: 'Field' },
      { key: 'beforeClear', label: 'CEmu before CLEAR' },
      { key: 'afterClear', label: 'CEmu after CLEAR' },
      { key: 'liveBeforeClear', label: 'Live before CLEAR' },
      { key: 'harnessBeforeClear', label: 'Harness before CLEAR' },
    ]),
    '',
    '## Route Counts',
    '',
    table([
      { route: 'live-style', ...data.live.targetCounts, termination: data.live.clear.result.termination },
      { route: 'harness', ...data.harness.targetCounts, termination: data.harness.clear.result.termination },
    ], [
      { key: 'route', label: 'Route' },
      { key: 'initEditPtrs0562e2', label: '0x0562E2', align: '---:' },
      { key: 'writeFromD0066F05e83a', label: '0x05E83A', align: '---:' },
      { key: 'writeFromD0066F05e844', label: '0x05E844', align: '---:' },
      { key: 'restoreContext04ed11', label: '0x04ED11', align: '---:' },
      { key: 'copyD0243AToD0243704ef6f', label: '0x04EF6F', align: '---:' },
      { key: 'flagReturn058A14', label: '0x058A14', align: '---:' },
      { key: 'owner0A31FD', label: '0x0A31FD', align: '---:' },
      { key: 'anchor0A229D', label: '0x0A229D', align: '---:' },
      { key: 'cleanup0018F8', label: '0x0018F8', align: '---:' },
      { key: 'termination', label: 'Termination' },
    ]),
    '',
    '## Static Writer Candidates',
    '',
    'The dynamic rows above identify which candidates actually wrote this run. Static scan found these direct or LDIR-style references:',
    '',
    '```json',
    JSON.stringify(data.staticWriters.map((hit) => ({ pc: hit.pc, kind: hit.kind })), null, 2),
    '```',
    '',
    '## Machine JSON',
    '',
    '```json',
    JSON.stringify({
      pass: data.pass,
      live: {
        clear: data.live.clear,
        targetCounts: data.live.targetCounts,
        keyWrites: liveWrites,
      },
      liveBootstrap: {
        clear: data.liveBootstrap?.clear,
        targetCounts: data.liveBootstrap?.targetCounts,
        keyWrites: bootstrapWrites,
      },
      harness: {
        clear: data.harness.clear,
        targetCounts: data.harness.targetCounts,
        keyWrites: harnessWrites,
      },
      captureFields: data.captureFields,
    }, null, 2),
    '```',
    '',
    'No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.',
    '',
  ].join('\n');
}

async function runProbe() {
  const liveBootstrap = runLiveRoute();
  const live = await runLiveBrowserRoute();
  const harness = runHarnessRoute();
  const captureFields = {
    pre: formatFields(readCaptureFields(preClearRam)),
    after: formatFields(readCaptureFields(afterClearRam)),
  };
  const staticWriters = staticWriterCandidates();
  const liveWrites = keyWriteSummary(live);
  const bootstrapWrites = keyWriteSummary(liveBootstrap);
  const harnessWrites = keyWriteSummary(harness);
  const pass = live.snapshots['before-p7-clear']?.D02437 === '0xD1A8CC'
    && captureFields.after.D02437 === '0xD1A8CC'
    && harness.snapshots['before-p7-clear']?.D02437 === '0xD1A8A3'
    && bootstrapWrites.some((write) => write.pc === '0x0A2DCF' && write.afterD02437 === '0xD1A8CC')
    && harnessWrites.some((write) => write.pc === '0x05E83A' && write.afterD02437 === '0xD1A8A3')
    && liveWrites.length > 0
    && harnessWrites.length > 0
    && harness.targetCounts.owner0A31FD > 0
    && live.targetCounts.anchor0A229D > 0;

  return {
    probe: 'phase869-d02437-lifetime',
    pass,
    live,
    liveBootstrap,
    harness,
    captureFields,
    staticWriters,
  };
}

let summary = null;
try {
  summary = await runProbe();
  console.log(JSON.stringify({
    probe: summary.probe,
    pass: summary.pass,
    liveBeforeClear: summary.live.snapshots['before-p7-clear'],
    liveBootstrapBeforeClear: summary.liveBootstrap.snapshots['before-p7-clear'],
    harnessBeforeClear: summary.harness.snapshots['before-p7-clear'],
    liveKeyWrites: keyWriteSummary(summary.live),
    liveBootstrapKeyWrites: keyWriteSummary(summary.liveBootstrap),
    harnessKeyWrites: keyWriteSummary(summary.harness),
    liveCounts: summary.live.targetCounts,
    harnessCounts: summary.harness.targetCounts,
    report: path.basename(REPORT_PATH),
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase869-d02437-lifetime', pass: false, error: String(error?.stack || error) };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`); } catch {}
  try { ws?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { server?.close(); } catch {}
  try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
}
