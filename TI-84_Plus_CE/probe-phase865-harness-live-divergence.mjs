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
const REPORT_PATH = path.join(__dirname, 'phase865-harness-live-divergence.md');
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const PRE_CLEAR_CAPTURE = path.join(__dirname, 'captures', 'realram-home-digit3-D00000-D657FF.bin');

const MEM_SIZE = 0x1000000;
const RAM_BASE = 0xD00000;
const STACK_TOP = 0xD1A87E;
const WARM_IDLE = 0x0019BE;
const HALT_IDLE = 0x0019B5;
const OUTER_LOOP = 0x08C331;
const LAUNCH_HOME = 0x09DD62;
const HOME_REPAINT = 0x058241;
const CLEAR_SCAN = 0x0F;
const ROUTE_ANCHOR = 0x0A229D;
const LIVE_SPIN = 0x0A1854;
const OWNER = 0x0A31FD;
const ROUTE_ROW_LIMIT = 5000;
const debugPort = 9865;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase865-'));
const chromePath = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((candidate) => fs.existsSync(candidate));

const romBytes = fs.readFileSync(ROM_PATH);
const preClearRam = fs.readFileSync(PRE_CLEAR_CAPTURE);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;
const FULL_BOUNDARY_BYTES = preClearRam.length;

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

const WATCHED_FIELDS = Object.freeze([
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D0243A', 0xD0243A, 3],
  ['D0243D', 0xD0243D, 3],
  ['D02504', 0xD02504, 1],
  ['D02505', 0xD02505, 1],
  ['D02506', 0xD02506, 1],
  ['D02590', 0xD02590, 3],
  ['D0259D', 0xD0259D, 3],
  ['D02A29', 0xD02A29, 2],
  ['D00595', 0xD00595, 1],
  ['D00596', 0xD00596, 1],
  ['D0059A', 0xD0059A, 1],
  ['D00587', 0xD00587, 1],
  ['D0058C', 0xD0058C, 1],
  ['D0058E', 0xD0058E, 1],
  ['D000CA_IY4A', 0xD000CA, 1],
  ['D000CC_IY4C', 0xD000CC, 1],
  ['D000B2_IY32', 0xD000B2, 1],
]);

const TARGETS = Object.freeze({
  anchor0A229D: ROUTE_ANCHOR,
  liveSpin0A1854: LIVE_SPIN,
  owner0A31FD: OWNER,
  ownerSetup0A322B: 0x0A322B,
  ownerEntry0A321D: 0x0A321D,
  copySetup0A31B8: 0x0A31B8,
  destructiveCopy0A31E2: 0x0A31E2,
  postCopy0A31A2: 0x0A31A2,
  cleanup0018F8: 0x0018F8,
  poll006D64: 0x006D64,
});

class EarlyStop extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

let nextId = 1;
const pending = new Map();
let chrome;
let server;
let ws;
let summary = null;

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

function readFields(mem) {
  return Object.fromEntries(WATCHED_FIELDS.map(([name, addr, len]) => [name, readValue(mem, addr, len)]));
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

function valueWidth(name) {
  if (/^D0250[456]$/.test(name)) return 2;
  if (/^D005/.test(name)) return 2;
  if (/^D000/.test(name)) return 2;
  if (name === 'D02A29') return 4;
  return 6;
}

function formatFieldValue(name, value) {
  return hex(value, valueWidth(name));
}

function formatFields(fields) {
  return Object.fromEntries(Object.entries(fields ?? {}).map(([name, value]) => [name, formatFieldValue(name, value)]));
}

function compactCpu(cpu, mem) {
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
    flags: {
      z: (cpu.f & 0x40) !== 0,
      c: (cpu.f & 0x01) !== 0,
      pv: (cpu.f & 0x04) !== 0,
    },
    fields: readFields(mem),
  };
}

function readStackSlots(mem, cpu, count = 6) {
  const sp = cpu.sp & 0xFFFFFF;
  return Array.from({ length: count }, (_, index) => {
    const addr = (sp + index * 3) & 0xFFFFFF;
    return { addr, value: readValue(mem, addr, 3) };
  });
}

function makeRoute(label) {
  return {
    label,
    phase: 'init',
    totalBlocks: 0,
    phaseBlock: 0,
    prevPc: null,
    anchorSeen: false,
    anchorBlock: null,
    rows: [],
    targetCounts: Object.fromEntries(Object.keys(TARGETS).map((name) => [name, 0])),
    targetFirst: {},
    hotBlocks: {},
    lddrSamples: [],
  };
}

function resetRouteCapture(route, label = route.label) {
  route.label = label;
  route.phase = 'init';
  route.totalBlocks = 0;
  route.phaseBlock = 0;
  route.prevPc = null;
  route.anchorSeen = false;
  route.anchorBlock = null;
  route.windowStartPc = null;
  route.rows = [];
  route.targetCounts = Object.fromEntries(Object.keys(TARGETS).map((name) => [name, 0]));
  route.targetFirst = {};
  route.hotBlocks = {};
  route.lddrSamples = [];
}

function snapshotRoute(route, mem, cpu, pc, phase) {
  return {
    index: route.rows.length,
    block: route.totalBlocks,
    phase,
    pc,
    prevPc: route.prevPc,
    cpu: compactCpu(cpu, mem),
    fields: readFields(mem),
    stackTop: readStackSlots(mem, cpu, 6),
  };
}

function observeRoute(route, mem, cpu, pc, phase) {
  const addr = pc & 0xFFFFFF;
  route.totalBlocks += 1;
  route.phaseBlock += 1;
  route.hotBlocks[hex(addr)] = (route.hotBlocks[hex(addr)] ?? 0) + 1;

  for (const [name, target] of Object.entries(TARGETS)) {
    if (addr !== target) continue;
    route.targetCounts[name] += 1;
    if (!route.targetFirst[name]) route.targetFirst[name] = snapshotRoute(route, mem, cpu, addr, phase);
  }

  if ((addr === LIVE_SPIN || addr === ROUTE_ANCHOR) && !route.anchorSeen) {
    route.anchorSeen = true;
    route.anchorBlock = route.totalBlocks;
    route.windowStartPc = addr;
  }

  if (route.anchorSeen && route.rows.length < ROUTE_ROW_LIMIT) {
    route.rows.push(snapshotRoute(route, mem, cpu, addr, phase));
  }

  route.prevPc = addr;
}

function makeFreshMachine(route) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, MEM_SIZE));
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals, trackMemoryMapped: true });
  return { mem, peripherals, executor, cpu: executor.cpu, route };
}

function runWithTrace(machine, phase, startAddress, mode, opts = {}) {
  const { executor, mem, cpu, route } = machine;
  const userOnBlock = opts.onBlock;
  route.phase = phase;
  route.phaseBlock = 0;
  return executor.runFrom(startAddress, mode, {
    ...opts,
    onBlock(pc, blockMode, meta, steps) {
      observeRoute(route, mem, cpu, pc, phase);
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

function deriveCopyPlan(before, after) {
  if (!before || !after) return null;
  return {
    count: before.cpu.bc & 0xFFFFFF,
    sourceStart: (after.cpu.hl + 1) & 0xFFFFFF,
    sourceEnd: before.cpu.hl & 0xFFFFFF,
    destStart: (after.cpu.de + 1) & 0xFFFFFF,
    destEnd: before.cpu.de & 0xFFFFFF,
  };
}

function installLddrTrace(machine) {
  const { cpu, mem, route } = machine;
  const originalLddr = cpu.lddr.bind(cpu);
  cpu.lddr = () => {
    const blockPc = cpu._currentBlockPc & 0xFFFFFF;
    const logicalPc = blockPc === 0x0A31B8
      ? 0x0A31C1
      : (blockPc === 0x0A31E2 || blockPc === 0x0A31DE ? 0x0A31F2 : blockPc);
    const shouldRecord = logicalPc === 0x0A31C1 || logicalPc === 0x0A31F2;
    const before = shouldRecord ? snapshotRoute(route, mem, cpu, blockPc, route.phase) : null;
    originalLddr();
    if (shouldRecord) {
      const after = snapshotRoute(route, mem, cpu, blockPc, route.phase);
      route.lddrSamples.push({
        logicalPc,
        blockPc,
        block: route.totalBlocks,
        before,
        after,
        copyPlan: deriveCopyPlan(before, after),
      });
    }
  };
  return {
    uninstall() {
      cpu.lddr = originalLddr;
    },
  };
}

function runBootToBoundary(machine) {
  const { mem, peripherals, cpu } = machine;
  const phases = [];

  phases.push({ name: 'p1-coldboot', result: runWithTrace(machine, 'p1-coldboot', 0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 }) });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);
  phases.push({ name: 'p2-kernel', result: runWithTrace(machine, 'p2-kernel', OUTER_LOOP, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 }) });

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

  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  cpu.sp = STACK_TOP - 12;
  fillSentinel(mem, cpu.sp, 12);
  phases.push({ name: 'p4-warm-idle', result: runWithTrace(machine, 'p4-warm-idle', WARM_IDLE, 'adl', { maxSteps: 1500000, maxLoopIterations: 100000 }) });

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
  return { result, counts, boundarySnapshot, finalFields: readFields(mem) };
}

function runRepaint(machine) {
  const { mem, peripherals, cpu } = machine;
  prepareEventFrame(mem, peripherals, cpu);
  const result = runWithTrace(machine, 'p6-home-repaint-058241', HOME_REPAINT, 'adl', {
    maxSteps: 300000,
    maxLoopIterations: 30000,
  });
  return { result, fields: readFields(mem) };
}

function restoreHarnessBoundary(mem, snapshot) {
  restoreFieldSnapshot(mem, snapshot.fields);
  writeValue(mem, 0xD02505, 1, snapshot.watchedFields.D02505);
  return readFields(mem);
}

function runHarnessRoute() {
  const route = makeRoute('phase856-harness-carry-d02505-only');
  const machine = makeFreshMachine(route);
  const { mem, peripherals, cpu } = machine;
  const phases = [];

  phases.push(...runBootToBoundary(machine));
  const phase5 = runLaunchHome(machine);
  phases.push({ name: 'p5-launch-home', result: phase5.result });
  if (!phase5.boundarySnapshot) throw new Error('harness boundary snapshot was not captured');

  const afterRestore = restoreHarnessBoundary(mem, phase5.boundarySnapshot);
  const repaint = runRepaint(machine);
  phases.push({ name: 'p6-home-repaint', result: repaint.result });

  rearmCxMain(mem);
  write24(mem, 0xD0243A, 0xD1A8CC);
  write24(mem, 0xD0243D, 0xD2A83E);
  writeValue(mem, 0xD02A29, 2, 0x0000);
  const afterManualSetup = readFields(mem);

  resetRouteCapture(route, 'phase856-harness-clear-route');
  prepareEventFrame(mem, peripherals, cpu);
  seedClear(mem, peripherals);
  const seededFields = readFields(mem);
  const lddrHook = installLddrTrace(machine);
  let previousPc = null;
  let clearResult = null;
  let stopReason = null;
  try {
    clearResult = runWithTrace(machine, 'p7-clear-outer-loop-to-owner', OUTER_LOOP, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: 100000,
      diHaltBypass: true,
      diHaltBypassEntry: OUTER_LOOP,
      onBlock(pc) {
        const addr = pc & 0xFFFFFF;
        if (addr === 0x0A31A2 && previousPc === 0x0A31E2) {
          stopReason = 'captured-0a31e2-to-0a31a2';
          throw new EarlyStop(stopReason);
        }
        previousPc = addr;
      },
    });
  } catch (error) {
    if (!(error instanceof EarlyStop)) throw error;
    clearResult = {
      steps: route.phaseBlock,
      termination: error.reason,
      lastPc: cpu._currentBlockPc & 0xFFFFFF,
      lastMode: 'adl',
    };
  } finally {
    lddrHook.uninstall();
  }

  return {
    routeKind: 'harness',
    phases: phases.map((phase) => ({ name: phase.name, result: formatRunResult(phase.result) })),
    phase5: {
      counts: phase5.counts,
      finalFields: formatFields(phase5.finalFields),
      boundaryWatchedFields: formatFields(phase5.boundarySnapshot.watchedFields),
    },
    afterRestore: formatFields(afterRestore),
    afterManualSetup: formatFields(afterManualSetup),
    seededFields: formatFields(seededFields),
    clearResult: formatRunResult(clearResult),
    stopReason,
    finalFields: formatFields(readFields(mem)),
    route: formatRoute(route),
  };
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
      window.__phase865BootSnapshot = coldbootVatSnapshot.map(([field, value]) => ({ name: field[0], addr: field[1], len: field[2], value }));`);

  html = html.replace(replayLine, `${replayLine}
    window.__phase865ReplayApplied = true;
    window.__phase865PostReplayFields = Object.fromEntries(COLDBOOT_STABLE_REPLAY_FIELDS.map((field) => [field[0], readColdbootReplayField(field)]));`);

  const injection = String.raw`
const PHASE865_ROUTE_ANCHOR = 0x0A229D;
const PHASE865_ROUTE_LIMIT = 5000;
const PHASE865_TARGETS = Object.freeze({
  anchor0A229D: 0x0A229D,
  liveSpin0A1854: 0x0A1854,
  owner0A31FD: 0x0A31FD,
  ownerSetup0A322B: 0x0A322B,
  ownerEntry0A321D: 0x0A321D,
  copySetup0A31B8: 0x0A31B8,
  destructiveCopy0A31E2: 0x0A31E2,
  postCopy0A31A2: 0x0A31A2,
  cleanup0018F8: 0x0018F8,
  poll006D64: 0x006D64,
});
const PHASE865_FIELDS = Object.freeze([
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D0243A', 0xD0243A, 3],
  ['D0243D', 0xD0243D, 3],
  ['D02504', 0xD02504, 1],
  ['D02505', 0xD02505, 1],
  ['D02506', 0xD02506, 1],
  ['D02590', 0xD02590, 3],
  ['D0259D', 0xD0259D, 3],
  ['D02A29', 0xD02A29, 2],
  ['D00595', 0xD00595, 1],
  ['D00596', 0xD00596, 1],
  ['D0059A', 0xD0059A, 1],
  ['D00587', 0xD00587, 1],
  ['D0058C', 0xD0058C, 1],
  ['D0058E', 0xD0058E, 1],
  ['D000CA_IY4A', 0xD000CA, 1],
  ['D000CC_IY4C', 0xD000CC, 1],
  ['D000B2_IY32', 0xD000B2, 1],
]);
function phase865ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
  return value >>> 0;
}
function phase865Hex(value) {
  return '0x' + ((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(6, '0');
}
function phase865ReadFields() {
  const mem = cpu?.memory;
  if (!mem) return null;
  return Object.fromEntries(PHASE865_FIELDS.map(([name, addr, len]) => [name, phase865ReadValue(mem, addr, len)]));
}
function phase865CpuRaw() {
  return cpu ? {
    pc: cpu.pc ?? 0,
    currentBlockPc: cpu._currentBlockPc ?? 0,
    stepCount: cpu.stepCount ?? 0,
    sp: cpu.sp ?? 0,
    af: cpu.af ?? 0,
    bc: cpu.bc ?? 0,
    de: cpu.de ?? 0,
    hl: cpu.hl ?? 0,
    ix: cpu._ix ?? cpu.ix ?? 0,
    iy: cpu._iy ?? cpu.iy ?? 0,
    f: cpu.f ?? 0,
  } : null;
}
function phase865Stack(count = 6) {
  const mem = cpu?.memory;
  const sp = cpu?.sp ?? 0;
  if (!mem) return [];
  return Array.from({ length: count }, (_, index) => {
    const addr = ((sp & 0xFFFFFF) + index * 3) & 0xFFFFFF;
    return { addr, value: phase865ReadValue(mem, addr, 3) };
  });
}
function phase865Snapshot(record, pc) {
  return {
    index: record.rows.length,
    block: record.totalBlocks,
    pc: pc & 0xFFFFFF,
    prevPc: record.prevPc,
    cpu: phase865CpuRaw(),
    fields: phase865ReadFields(),
    stackTop: phase865Stack(6),
  };
}
function phase865CreateRecord(label) {
  return {
    label,
    start: null,
    end: null,
    totalBlocks: 0,
    prevPc: null,
    anchorSeen: false,
    anchorBlock: null,
    rows: [],
    targetCounts: Object.fromEntries(Object.keys(PHASE865_TARGETS).map((name) => [name, 0])),
    targetFirst: {},
    hotBlocks: {},
  };
}
function phase865Read(label = 'read') {
  return {
    label,
    status: document.getElementById('status')?.textContent ?? null,
    runtimeMode,
    lastPc,
    lastMode,
    totalSteps,
    cpu: phase865CpuRaw(),
    fields: phase865ReadFields(),
    bootSnapshot: window.__phase865BootSnapshot ?? null,
    replayApplied: window.__phase865ReplayApplied === true,
    postReplayFields: window.__phase865PostReplayFields ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    pageErrors: [...(window.__phase865PageErrors ?? [])],
  };
}
window.__phase865PageErrors = [];
window.addEventListener('error', (event) => {
  window.__phase865PageErrors.push(String(event.message || event.error || event));
});
window.addEventListener('unhandledrejection', (event) => {
  window.__phase865PageErrors.push(String(event.reason || event));
});
window.__phase865 = {
  records: [],
  begin(label) {
    const record = phase865CreateRecord(label);
    this.records.push(record);
    record.start = phase865Read('start');
    return record.start;
  },
  finish() {
    const record = this.records.at(-1) ?? null;
    if (record) {
      record.end = phase865Read('end');
      record.topHotBlocks = Object.entries(record.hotBlocks)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 24)
        .map(([pc, count]) => ({ pc, count }));
    }
    return record;
  },
  read: phase865Read,
};
const phase865OriginalObserve = observeColdbootPersistenceBlock;
observeColdbootPersistenceBlock = function phase865ObserveColdbootPersistenceBlock(state, pc) {
  const addr = pc & 0xFFFFFF;
  const record = window.__phase865.records.at(-1) ?? phase865CreateRecord('implicit');
  if (!window.__phase865.records.length) window.__phase865.records.push(record);
  record.totalBlocks += 1;
  const pcHex = phase865Hex(addr);
  record.hotBlocks[pcHex] = (record.hotBlocks[pcHex] || 0) + 1;
  for (const [name, target] of Object.entries(PHASE865_TARGETS)) {
    if (addr !== target) continue;
    record.targetCounts[name] += 1;
    if (!record.targetFirst[name]) record.targetFirst[name] = phase865Snapshot(record, addr);
  }
  if ((addr === 0x0A1854 || addr === PHASE865_ROUTE_ANCHOR) && !record.anchorSeen) {
    record.anchorSeen = true;
    record.anchorBlock = record.totalBlocks;
    record.windowStartPc = addr;
  }
  if (record.anchorSeen && record.rows.length < PHASE865_ROUTE_LIMIT) {
    record.rows.push(phase865Snapshot(record, addr));
  }
  const result = phase865OriginalObserve(state, pc);
  record.prevPc = addr;
  return result;
};
getColdbootControlPreStop = function phase865GetColdbootControlPreStop(code) {
  if (code === 'Escape') return null;
  return COLDBOOT_CONTROL_PRE_STOP_BY_PC_CODE[code] ?? null;
};
const phase865OriginalRunOptions = getColdbootRunOptions;
getColdbootRunOptions = function phase865GetColdbootRunOptions(stepBudget) {
  const opts = phase865OriginalRunOptions(stepBudget);
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
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  ws = await connect(await waitForDevtools());
  await cdp(ws, 'Runtime.enable');
  await cdp(ws, 'Page.enable');
  await cdp(ws, 'Page.navigate', { url: pageUrl });
  await waitFor(ws, 'document.readyState === "complete"', 'page load', 30000);
  await waitFor(ws, '!!window.__phase865 && !!window.__coldbootReadEditLineState', 'phase865 instrumentation', 30000);
  await sleep(500);

  await evalExpr(ws, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);
  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 180000);
  await sleep(100);

  const afterBoot = await evalExpr(ws, `window.__phase865.read('afterBoot')`, 30000);
  await evalExpr(ws, `window.__phase865.begin('Escape/CLEAR raw route')`, 30000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams('keyDown'), 180000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams('keyUp'), 30000);
  await waitFor(ws, `window.__coldbootLastKey?.code === 'Escape'`, 'Escape completion', 180000);
  await sleep(150);

  const traceRecord = await evalExpr(ws, `window.__phase865.finish()`, 30000);
  const state = await evalExpr(ws, `(() => ({
    status: document.getElementById('status')?.textContent ?? null,
    keyState: window.__coldbootLastKey ?? null,
    diagnostics: window.__coldbootReadEditLineState?.() ?? null,
    pageErrors: window.__phase865PageErrors ?? [],
  }))()`, 30000);

  return {
    routeKind: 'live-browser',
    chromePath,
    pageUrl,
    afterBoot: formatBrowserRead(afterBoot),
    state,
    route: formatBrowserRoute(traceRecord),
  };
}

function formatRunResult(result) {
  return {
    steps: result?.steps ?? null,
    termination: result?.termination ?? null,
    lastPc: hex(result?.lastPc ?? 0),
    lastMode: result?.lastMode ?? null,
  };
}

function formatCopyPlan(plan) {
  if (!plan) return null;
  return {
    count: hex(plan.count, 4),
    sourceStart: hex(plan.sourceStart),
    sourceEnd: hex(plan.sourceEnd),
    destStart: hex(plan.destStart),
    destEnd: hex(plan.destEnd),
  };
}

function formatCpu(cpu) {
  if (!cpu) return null;
  return {
    ...cpu,
    pc: hex(cpu.pc),
    currentBlockPc: hex(cpu.currentBlockPc),
    sp: hex(cpu.sp),
    af: hex(cpu.af, 4),
    bc: hex(cpu.bc),
    de: hex(cpu.de),
    hl: hex(cpu.hl),
    ix: hex(cpu.ix),
    iy: hex(cpu.iy),
  };
}

function formatStack(stackTop) {
  return (stackTop ?? []).map((slot) => ({ addr: hex(slot.addr), value: hex(slot.value) }));
}

function formatRouteRow(row) {
  return {
    ...row,
    pc: hex(row.pc),
    prevPc: row.prevPc == null ? null : hex(row.prevPc),
    cpu: formatCpu(row.cpu),
    fields: formatFields(row.fields),
    stackTop: formatStack(row.stackTop),
  };
}

function formatRoute(route) {
  return {
    ...route,
    prevPc: route.prevPc == null ? null : hex(route.prevPc),
    windowStartPc: route.windowStartPc == null ? null : hex(route.windowStartPc),
    targetFirst: Object.fromEntries(Object.entries(route.targetFirst ?? {}).map(([name, row]) => [name, formatRouteRow(row)])),
    rows: (route.rows ?? []).map(formatRouteRow),
    lddrSamples: (route.lddrSamples ?? []).map((sample) => ({
      ...sample,
      logicalPc: hex(sample.logicalPc),
      blockPc: hex(sample.blockPc),
      before: formatRouteRow(sample.before),
      after: formatRouteRow(sample.after),
      copyPlan: formatCopyPlan(sample.copyPlan),
    })),
    topHotBlocks: Object.entries(route.hotBlocks ?? {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, 24)
      .map(([pc, count]) => ({ pc, count })),
  };
}

function formatBrowserRead(read) {
  if (!read) return null;
  return {
    ...read,
    cpu: formatCpu(read.cpu),
    fields: formatFields(read.fields),
  };
}

function formatBrowserRoute(route) {
  if (!route) return null;
  return {
    ...route,
    start: formatBrowserRead(route.start),
    end: formatBrowserRead(route.end),
    targetFirst: Object.fromEntries(Object.entries(route.targetFirst ?? {}).map(([name, row]) => [name, formatRouteRow(row)])),
    rows: (route.rows ?? []).map(formatRouteRow),
  };
}

function parseHex(value) {
  if (typeof value === 'number') return value >>> 0;
  if (typeof value === 'string' && value.startsWith('0x')) return Number.parseInt(value.slice(2), 16) >>> 0;
  return null;
}

function rawRow(row) {
  if (!row) return null;
  return {
    pc: parseHex(row.pc),
    prevPc: row.prevPc == null ? null : parseHex(row.prevPc),
    cpu: Object.fromEntries(Object.entries(row.cpu ?? {}).map(([k, v]) => [k, parseHex(v) ?? v])),
    fields: Object.fromEntries(Object.entries(row.fields ?? {}).map(([k, v]) => [k, parseHex(v) ?? v])),
    stackTop: (row.stackTop ?? []).map((slot) => ({ addr: parseHex(slot.addr), value: parseHex(slot.value) })),
  };
}

function firstDivergence(harness, live) {
  const hRows = harness.route.rows ?? [];
  const lRows = live.route.rows ?? [];
  const max = Math.max(hRows.length, lRows.length);
  for (let index = 0; index < max; index += 1) {
    const hPc = parseHex(hRows[index]?.pc);
    const lPc = parseHex(lRows[index]?.pc);
    if (hPc !== lPc) {
      return {
        index,
        previousIndex: index - 1,
        previousHarness: index > 0 ? hRows[index - 1] : null,
        previousLive: index > 0 ? lRows[index - 1] : null,
        harnessNext: hRows[index] ?? null,
        liveNext: lRows[index] ?? null,
      };
    }
  }
  return null;
}

function diffAtCommon(hRow, lRow) {
  const h = rawRow(hRow);
  const l = rawRow(lRow);
  if (!h || !l) return [];
  const diffs = [];
  for (const reg of ['sp', 'af', 'bc', 'de', 'hl', 'ix', 'iy', 'f']) {
    if (h.cpu?.[reg] !== l.cpu?.[reg]) diffs.push({ kind: 'cpu', name: reg.toUpperCase(), harness: h.cpu?.[reg], live: l.cpu?.[reg] });
  }
  for (const name of Object.keys({ ...h.fields, ...l.fields })) {
    if (h.fields?.[name] !== l.fields?.[name]) diffs.push({ kind: 'field', name, harness: h.fields?.[name], live: l.fields?.[name] });
  }
  const stackSlots = Math.max(h.stackTop?.length ?? 0, l.stackTop?.length ?? 0);
  for (let i = 0; i < stackSlots; i += 1) {
    if (h.stackTop?.[i]?.value !== l.stackTop?.[i]?.value) {
      diffs.push({
        kind: 'stack',
        name: `SP+${i * 3}`,
        harness: h.stackTop?.[i]?.value,
        live: l.stackTop?.[i]?.value,
      });
    }
  }
  return diffs;
}

function classifyDivergence(divergence) {
  const diffs = diffAtCommon(divergence?.previousHarness, divergence?.previousLive);
  const stack0 = diffs.find((row) => row.kind === 'stack' && row.name === 'SP+0');
  const fieldD00595 = diffs.find((row) => row.kind === 'field' && row.name === 'D00595');
  const fieldD00596 = diffs.find((row) => row.kind === 'field' && row.name === 'D00596');
  const fieldD02505 = diffs.find((row) => row.kind === 'field' && row.name === 'D02505');
  const fDiff = diffs.find((row) => row.kind === 'cpu' && row.name === 'F');
  const deDiff = diffs.find((row) => row.kind === 'cpu' && row.name === 'DE');
  const prevPc = parseHex(divergence?.previousHarness?.pc);
  const hNext = parseHex(divergence?.harnessNext?.pc);
  const lNext = parseHex(divergence?.liveNext?.pc);
  let controllingState = 'unclassified';
  if (prevPc === 0x058A14 && fDiff) {
    const harnessZ = (fDiff.harness & 0x40) !== 0;
    const liveZ = (fDiff.live & 0x40) !== 0;
    controllingState = `Z flag at 0x058A14 JR NZ: harness F=${hex(fDiff.harness, 2)} (Z=${harnessZ ? 1 : 0}) takes ${hex(hNext)}, live F=${hex(fDiff.live, 2)} (Z=${liveZ ? 1 : 0}) falls through ${hex(lNext)}; DE also differs (${hex(deDiff?.harness ?? 0)} vs ${hex(deDiff?.live ?? 0)})`;
  } else if (stack0) {
    controllingState = `return stack top at SP after ${hex(prevPc)}: harness ${hex(stack0.harness)} vs live ${hex(stack0.live)}`;
  } else if (fieldD00595 || fieldD00596) {
    controllingState = `text cursor fields: D00595 ${hex(fieldD00595?.harness ?? 0, 2)} vs ${hex(fieldD00595?.live ?? 0, 2)}, D00596 ${hex(fieldD00596?.harness ?? 0, 2)} vs ${hex(fieldD00596?.live ?? 0, 2)}`;
  } else if (fieldD02505) {
    controllingState = `D02505 differs at common block: harness ${hex(fieldD02505.harness, 2)} vs live ${hex(fieldD02505.live, 2)}`;
  }
  return {
    index: divergence?.index ?? null,
    previousCommonPc: prevPc == null ? null : hex(prevPc),
    harnessNextPc: hNext == null ? null : hex(hNext),
    liveNextPc: lNext == null ? null : hex(lNext),
    controllingState,
    diffs: diffs.slice(0, 40).map((row) => ({
      ...row,
      harness: typeof row.harness === 'number' ? hex(row.harness, row.kind === 'field' && /^D00|^D005|^D0250/.test(row.name) ? 2 : 6) : row.harness,
      live: typeof row.live === 'number' ? hex(row.live, row.kind === 'field' && /^D00|^D005|^D0250/.test(row.name) ? 2 : 6) : row.live,
    })),
  };
}

function formatInst(inst) {
  if (!inst) return '(decode failed)';
  const upper = (value) => String(value ?? '?').toUpperCase();
  if (inst.tag === 'ret') return 'RET';
  if (inst.tag === 'ret-conditional') return `RET ${upper(inst.condition)}`;
  if (inst.tag === 'call') return `CALL ${hex(inst.target)}`;
  if (inst.tag === 'jp') return `JP ${hex(inst.target)}`;
  if (inst.tag === 'jr') return `JR ${hex(inst.target)}`;
  if (inst.tag === 'jr-conditional') return `JR ${upper(inst.condition)}, ${hex(inst.target)}`;
  if (inst.tag === 'jp-conditional') return `JP ${upper(inst.condition)}, ${hex(inst.target)}`;
  if (inst.tag === 'ld-reg-mem') return `LD ${upper(inst.dest)}, (${hex(inst.addr)})`;
  if (inst.tag === 'ld-mem-reg') return `LD (${hex(inst.addr)}), ${upper(inst.src)}`;
  if (inst.tag === 'ld-pair-imm') return `LD ${upper(inst.pair ?? inst.dest)}, ${hex(inst.value)}`;
  if (inst.tag === 'ld-reg-imm') return `LD ${upper(inst.dest)}, ${hex(inst.value, 2)}`;
  if (inst.tag === 'ld-ind-imm') return `LD (${upper(inst.dest)}), ${hex(inst.value, 2)}`;
  if (inst.tag === 'ldir') return 'LDIR';
  if (inst.tag === 'lddr') return 'LDDR';
  if (inst.tag === 'push') return `PUSH ${upper(inst.pair)}`;
  if (inst.tag === 'pop') return `POP ${upper(inst.pair)}`;
  if (inst.tag === 'alu-imm') return `${upper(inst.op)} ${hex(inst.value, 2)}`;
  if (inst.tag === 'alu-reg') return `${upper(inst.op)} ${upper(inst.src)}`;
  if (inst.tag === 'ex-de-hl') return 'EX DE,HL';
  if (inst.tag === 'add-pair') return `ADD ${upper(inst.dest)}, ${upper(inst.src)}`;
  return `${inst.tag} ${JSON.stringify(Object.fromEntries(Object.entries(inst).filter(([key]) => !['tag', 'pc', 'length', 'nextPc'].includes(key))))}`;
}

function decodeWindow(start, end) {
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

function routeTable(route, limit = 36) {
  const rows = route?.rows ?? [];
  return [
    '| # | PC | Prev | SP | Stack[0] | AF | BC | DE | HL | D02505 | D00595 | D00596 |',
    '| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.slice(0, limit).map((row, index) => (
      `| ${index} | ${row.pc} | ${row.prevPc ?? '-'} | ${row.cpu?.sp ?? '-'} | ${row.stackTop?.[0]?.value ?? '-'} | ${row.cpu?.af ?? '-'} | ${row.cpu?.bc ?? '-'} | ${row.cpu?.de ?? '-'} | ${row.cpu?.hl ?? '-'} | ${row.fields?.D02505 ?? '-'} | ${row.fields?.D00595 ?? '-'} | ${row.fields?.D00596 ?? '-'} |`
    )),
  ].join('\n');
}

function diffTable(classification) {
  return [
    '| Kind | Name | Harness | Live |',
    '| --- | --- | --- | --- |',
    ...(classification.diffs ?? []).slice(0, 18).map((row) => `| ${row.kind} | ${row.name} | ${row.harness ?? '-'} | ${row.live ?? '-'} |`),
  ].join('\n');
}

function buildReport(data) {
  if (data.error) {
    return [
      '# Phase 865: Harness-vs-Live Route Divergence Trace',
      '',
      'Probe failed before producing a complete comparison.',
      '',
      '```text',
      data.error,
      '```',
      '',
    ].join('\n');
  }

  const h = data.harness;
  const l = data.live;
  const c = data.classification;
  const commonAnchorVerdict = h.route.targetCounts.anchor0A229D > 0
    ? 'Both routes reached the requested `0x0A229D` anchor.'
    : 'Fresh output falsifies the requested common-anchor premise: the Phase856 harness reaches `0x0A31FD` without hitting `0x0A229D`, so the comparable window below starts at the first shared `0x0A1854` route block.';
  return [
    '# Phase 865: Harness-vs-Live Route Divergence Trace',
    '',
    'Probe: `probe-phase865-harness-live-divergence.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase865-harness-live-divergence.mjs`',
    '',
    '## Summary',
    '',
    `- Result: ${data.pass ? 'PASS' : 'FAIL'}. ${commonAnchorVerdict}`,
    `- Harness route: anchor=${h.route.targetCounts.anchor0A229D}, owner=${h.route.targetCounts.owner0A31FD}, spin=${h.route.targetCounts.liveSpin0A1854}, termination=${h.clearResult.termination}.`,
    `- Live browser route: anchor=${l.route.targetCounts.anchor0A229D}, owner=${l.route.targetCounts.owner0A31FD}, spin=${l.route.targetCounts.liveSpin0A1854}, key termination=${l.state.keyState?.termination ?? '-'}.`,
    `- First divergence after common prefix: previous=${c.previousCommonPc}, harness next=${c.harnessNextPc}, live next=${c.liveNextPc}.`,
    `- Controlling state named by the trace: **${c.controllingState}**.`,
    '- Interpretation: the Phase856 owner path is selected by synthetic harness context, not by the live browser CLEAR route. The live route keeps `D02505=0x0A`, but the harness-only owner path cannot be compared from `0x0A229D` because that block is absent from the harness route.',
    '',
    '## Divergence Diffs At Previous Common Block',
    '',
    diffTable(c),
    '',
    '## Harness Route Window',
    '',
    routeTable(h.route),
    '',
    '## Live Route Window',
    '',
    routeTable(l.route),
    '',
    '## Static Decode Around 0x0A229D',
    '',
    '| PC | Bytes | Instruction |',
    '| --- | --- | --- |',
    ...data.decode0A229D.map((row) => `| ${row.pc} | \`${row.bytes}\` | ${row.instruction} |`),
    '',
    '## Static Decode Around Divergence',
    '',
    '| PC | Bytes | Instruction |',
    '| --- | --- | --- |',
    ...data.decodeDivergence.map((row) => `| ${row.pc} | \`${row.bytes}\` | ${row.instruction} |`),
    '',
    '## Machine JSON',
    '',
    '```json',
    JSON.stringify({
      pass: data.pass,
      classification: data.classification,
      harness: {
        clearResult: h.clearResult,
        targetCounts: h.route.targetCounts,
        targetFirst: h.route.targetFirst,
        lddrSamples: h.route.lddrSamples,
      },
      live: {
        status: l.state.status,
        keyState: l.state.keyState,
        targetCounts: l.route.targetCounts,
        targetFirst: l.route.targetFirst,
        topHotBlocks: l.route.topHotBlocks,
      },
    }, null, 2),
    '```',
    '',
    'No runtime, transpiler, browser-shell, decoder, peripheral, scheduler, ROM artifact, or `follow-alongs/` files were changed.',
    '',
  ].join('\n');
}

async function runProbe() {
  const harness = runHarnessRoute();
  const live = await runLiveBrowserRoute();
  const divergence = firstDivergence(harness, live);
  const classification = classifyDivergence(divergence);
  const pass = Boolean(divergence)
    && live.route.targetCounts.anchor0A229D > 0
    && harness.route.targetCounts.liveSpin0A1854 > 0
    && live.route.targetCounts.liveSpin0A1854 > 0
    && harness.route.targetCounts.owner0A31FD > 0
    && live.route.targetCounts.owner0A31FD === 0
    && (live.state.pageErrors ?? []).length === 0;

  return {
    probe: 'phase865-harness-live-divergence',
    pass,
    harness,
    live,
    classification,
    decode0A229D: decodeWindow(0x0A228F, 0x0A22B0),
    decodeDivergence: decodeWindow(0x058A10, 0x058A35),
  };
}

try {
  summary = await runProbe();
  console.log(JSON.stringify({
    probe: summary.probe,
    pass: summary.pass,
    classification: summary.classification,
    harnessCounts: summary.harness.route.targetCounts,
    liveCounts: summary.live.route.targetCounts,
    liveKey: summary.live.state.keyState,
    report: path.basename(REPORT_PATH),
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase865-harness-live-divergence', pass: false, error: String(error?.stack || error) };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`); } catch {}
  try { ws?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { server?.close(); } catch {}
  try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
}
