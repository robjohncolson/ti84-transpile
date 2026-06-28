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
const REPORT_PATH = path.join(__dirname, 'phase868-d02437-ab-adjudication.md');
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
const ROUTE_ANCHOR = 0x0A229D;
const LIVE_SPIN = 0x0A1854;
const OWNER = 0x0A31FD;
const ROUTE_ROW_LIMIT = 5000;
const D02437_HARNESS_VALUE = 0xD1A8A3;
const D02437_LIVE_VALUE = 0xD1A8CC;
const debugPort = 9868;
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-browser-phase868-'));
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
  ['D02317', 0xD02317, 3],
  ['D0231A', 0xD0231A, 3],
  ['D0231D', 0xD0231D, 3],
  ['D02437', 0xD02437, 3],
  ['D0243A', 0xD0243A, 3],
  ['D0243D', 0xD0243D, 3],
  ['D02440', 0xD02440, 3],
  ['D010F4', 0xD010F4, 1],
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
  ['D000C4_IY44', 0xD000C4, 1],
  ['D000CC_IY4C', 0xD000CC, 1],
  ['D000B2_IY32', 0xD000B2, 1],
]);

const TARGETS = Object.freeze({
  flagCaller058A10: 0x058A10,
  flagOwner058212: 0x058212,
  flagGate0800B8: 0x0800B8,
  flagBranch058216: 0x058216,
  flagMode09142B: 0x09142B,
  flagModeCheck090B81: 0x090B81,
  flagCompare05E3E3: 0x05E3E3,
  flagCompareD0243D05E3F5: 0x05E3F5,
  flagCompareD0243A05E3E8: 0x05E3E8,
  flagCompare04C973: 0x04C973,
  flagReturn058A14: 0x058A14,
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

function readCaptureValue(buffer, addr, len) {
  const offset = addr - RAM_BASE;
  if (offset < 0 || offset + len > buffer.length) return null;
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (buffer[offset + i] ?? 0) << (8 * i);
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

function readCaptureFields(buffer) {
  return Object.fromEntries(WATCHED_FIELDS.map(([name, addr, len]) => [name, readCaptureValue(buffer, addr, len)]));
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
  if (name === 'D010F4') return 2;
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
    mutations: [],
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
  route.mutations = [];
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

function runHarnessRoute(options = {}) {
  const route = makeRoute(options.initialLabel ?? 'phase856-harness-carry-d02505-only');
  const machine = makeFreshMachine(route);
  const { mem, peripherals, cpu } = machine;
  const phases = [];
  const forceD02437 = options.forceD02437 ?? null;

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

  resetRouteCapture(route, options.routeLabel ?? 'phase856-harness-clear-route');
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
        if (addr === 0x05E3E8 && forceD02437 != null && route.mutations.length === 0) {
          const before = snapshotRoute(route, mem, cpu, addr, 'mutation-before');
          write24(mem, 0xD02437, forceD02437);
          route.mutations.push({
            pc: addr,
            block: route.totalBlocks,
            forceD02437,
            before,
            after: snapshotRoute(route, mem, cpu, addr, 'mutation-after'),
          });
        }
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
    forceD02437: forceD02437 == null ? null : hex(forceD02437),
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
      window.__phase868BootSnapshot = coldbootVatSnapshot.map(([field, value]) => ({ name: field[0], addr: field[1], len: field[2], value }));`);

  html = html.replace(replayLine, `${replayLine}
    window.__phase868ReplayApplied = true;
    window.__phase868PostReplayFields = Object.fromEntries(COLDBOOT_STABLE_REPLAY_FIELDS.map((field) => [field[0], readColdbootReplayField(field)]));`);

  const injection = String.raw`
const PHASE868_ROUTE_ANCHOR = 0x0A229D;
const PHASE868_ROUTE_LIMIT = 5000;
const PHASE868_TARGETS = Object.freeze({
  flagCaller058A10: 0x058A10,
  flagOwner058212: 0x058212,
  flagGate0800B8: 0x0800B8,
  flagBranch058216: 0x058216,
  flagMode09142B: 0x09142B,
  flagModeCheck090B81: 0x090B81,
  flagCompare05E3E3: 0x05E3E3,
  flagCompareD0243D05E3F5: 0x05E3F5,
  flagCompareD0243A05E3E8: 0x05E3E8,
  flagCompare04C973: 0x04C973,
  flagReturn058A14: 0x058A14,
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
const PHASE868_FIELDS = Object.freeze([
  ['D007CA', 0xD007CA, 3],
  ['D008E0', 0xD008E0, 3],
  ['D02317', 0xD02317, 3],
  ['D0231A', 0xD0231A, 3],
  ['D0231D', 0xD0231D, 3],
  ['D02437', 0xD02437, 3],
  ['D0243A', 0xD0243A, 3],
  ['D0243D', 0xD0243D, 3],
  ['D02440', 0xD02440, 3],
  ['D010F4', 0xD010F4, 1],
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
  ['D000C4_IY44', 0xD000C4, 1],
  ['D000CC_IY4C', 0xD000CC, 1],
  ['D000B2_IY32', 0xD000B2, 1],
]);
function phase868ReadValue(mem, addr, len) {
  let value = 0;
  for (let i = 0; i < len; i += 1) value |= (mem[(addr + i) & 0xFFFFFF] ?? 0) << (8 * i);
  return value >>> 0;
}
function phase868WriteValue(mem, addr, len, value) {
  for (let i = 0; i < len; i += 1) mem[(addr + i) & 0xFFFFFF] = (value >>> (8 * i)) & 0xFF;
}
function phase868Hex(value) {
  return '0x' + ((value ?? 0) >>> 0).toString(16).toUpperCase().padStart(6, '0');
}
function phase868ReadFields() {
  const mem = cpu?.memory;
  if (!mem) return null;
  return Object.fromEntries(PHASE868_FIELDS.map(([name, addr, len]) => [name, phase868ReadValue(mem, addr, len)]));
}
function phase868CpuRaw() {
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
function phase868Stack(count = 6) {
  const mem = cpu?.memory;
  const sp = cpu?.sp ?? 0;
  if (!mem) return [];
  return Array.from({ length: count }, (_, index) => {
    const addr = ((sp & 0xFFFFFF) + index * 3) & 0xFFFFFF;
    return { addr, value: phase868ReadValue(mem, addr, 3) };
  });
}
function phase868Snapshot(record, pc) {
  return {
    index: record.rows.length,
    block: record.totalBlocks,
    pc: pc & 0xFFFFFF,
    prevPc: record.prevPc,
    cpu: phase868CpuRaw(),
    fields: phase868ReadFields(),
    stackTop: phase868Stack(6),
  };
}
function phase868CreateRecord(label) {
  return {
    label,
    start: null,
    end: null,
    totalBlocks: 0,
    prevPc: null,
    anchorSeen: false,
    anchorBlock: null,
    rows: [],
    targetCounts: Object.fromEntries(Object.keys(PHASE868_TARGETS).map((name) => [name, 0])),
    targetFirst: {},
    hotBlocks: {},
    mutations: [],
  };
}
function phase868Read(label = 'read') {
  return {
    label,
    status: document.getElementById('status')?.textContent ?? null,
    runtimeMode,
    lastPc,
    lastMode,
    totalSteps,
    cpu: phase868CpuRaw(),
    fields: phase868ReadFields(),
    bootSnapshot: window.__phase868BootSnapshot ?? null,
    replayApplied: window.__phase868ReplayApplied === true,
    postReplayFields: window.__phase868PostReplayFields ?? null,
    lastKey: window.__coldbootLastKey ?? null,
    pageErrors: [...(window.__phase868PageErrors ?? [])],
  };
}
window.__phase868PageErrors = [];
window.addEventListener('error', (event) => {
  window.__phase868PageErrors.push(String(event.message || event.error || event));
});
window.addEventListener('unhandledrejection', (event) => {
  window.__phase868PageErrors.push(String(event.reason || event));
});
window.__phase868 = {
  records: [],
  config: { forceD02437: null },
  configure(config = {}) {
    this.config = {
      forceD02437: config.forceD02437 == null ? null : config.forceD02437 >>> 0,
    };
    return this.config;
  },
  begin(label) {
    const record = phase868CreateRecord(label);
    this.records.push(record);
    record.start = phase868Read('start');
    return record.start;
  },
  finish() {
    const record = this.records.at(-1) ?? null;
    if (record) {
      record.end = phase868Read('end');
      record.topHotBlocks = Object.entries(record.hotBlocks)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 24)
        .map(([pc, count]) => ({ pc, count }));
    }
    return record;
  },
  read: phase868Read,
};
function phase868MaybeMutate(record, addr) {
  const forceD02437 = window.__phase868.config?.forceD02437;
  const mem = cpu?.memory;
  if (!mem || forceD02437 == null || addr !== 0x05E3E8 || record.mutations.length > 0) return;
  const before = phase868Snapshot(record, addr);
  phase868WriteValue(mem, 0xD02437, 3, forceD02437);
  record.mutations.push({
    pc: addr,
    block: record.totalBlocks,
    forceD02437,
    before,
    after: phase868Snapshot(record, addr),
  });
}
const phase868OriginalObserve = observeColdbootPersistenceBlock;
observeColdbootPersistenceBlock = function phase868ObserveColdbootPersistenceBlock(state, pc) {
  const addr = pc & 0xFFFFFF;
  const record = window.__phase868.records.at(-1) ?? phase868CreateRecord('implicit');
  if (!window.__phase868.records.length) window.__phase868.records.push(record);
  record.totalBlocks += 1;
  const pcHex = phase868Hex(addr);
  record.hotBlocks[pcHex] = (record.hotBlocks[pcHex] || 0) + 1;
  phase868MaybeMutate(record, addr);
  for (const [name, target] of Object.entries(PHASE868_TARGETS)) {
    if (addr !== target) continue;
    record.targetCounts[name] += 1;
    if (!record.targetFirst[name]) record.targetFirst[name] = phase868Snapshot(record, addr);
  }
  if ((addr === 0x0A1854 || addr === PHASE868_ROUTE_ANCHOR) && !record.anchorSeen) {
    record.anchorSeen = true;
    record.anchorBlock = record.totalBlocks;
    record.windowStartPc = addr;
  }
  if (record.anchorSeen && record.rows.length < PHASE868_ROUTE_LIMIT) {
    record.rows.push(phase868Snapshot(record, addr));
  }
  const result = phase868OriginalObserve(state, pc);
  record.prevPc = addr;
  return result;
};
getColdbootControlPreStop = function phase868GetColdbootControlPreStop(code) {
  if (code === 'Escape') return null;
  return COLDBOOT_CONTROL_PRE_STOP_BY_PC_CODE[code] ?? null;
};
const phase868OriginalRunOptions = getColdbootRunOptions;
getColdbootRunOptions = function phase868GetColdbootRunOptions(stepBudget) {
  const opts = phase868OriginalRunOptions(stepBudget);
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

async function runLiveScenario(pageUrl, scenario) {
  await cdp(ws, 'Page.navigate', { url: pageUrl });
  await waitFor(ws, 'document.readyState === "complete"', 'page load', 30000);
  await waitFor(ws, '!!window.__phase868 && !!window.__coldbootReadEditLineState', 'phase868 instrumentation', 30000);
  await sleep(500);

  await evalExpr(ws, `(() => {
    document.getElementById('coldbootMode').checked = true;
    document.getElementById('preserveDisplay').checked = true;
    document.getElementById('btnBoot').click();
    return true;
  })()`);
  await waitFor(ws, `document.getElementById('status').textContent.includes('Coldboot complete')`, 'coldboot completion', 180000);
  await sleep(100);

  const afterBoot = await evalExpr(ws, `window.__phase868.read('afterBoot')`, 30000);
  const config = await evalExpr(ws, `window.__phase868.configure(${JSON.stringify({ forceD02437: scenario.forceD02437 ?? null })})`, 30000);
  await evalExpr(ws, `window.__phase868.begin(${JSON.stringify(scenario.label)})`, 30000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams('keyDown'), 180000);
  await cdp(ws, 'Input.dispatchKeyEvent', keyParams('keyUp'), 30000);
  await waitFor(ws, `window.__coldbootLastKey?.code === 'Escape'`, 'Escape completion', 180000);
  await sleep(150);

  const traceRecord = await evalExpr(ws, `window.__phase868.finish()`, 30000);
  const state = await evalExpr(ws, `(() => ({
    status: document.getElementById('status')?.textContent ?? null,
    keyState: window.__coldbootLastKey ?? null,
    diagnostics: window.__coldbootReadEditLineState?.() ?? null,
    config: window.__phase868.config ?? null,
    pageErrors: window.__phase868PageErrors ?? [],
  }))()`, 30000);

  return {
    routeKind: scenario.routeKind,
    forceD02437: scenario.forceD02437 == null ? null : hex(scenario.forceD02437),
    config,
    afterBoot: formatBrowserRead(afterBoot),
    state,
    route: formatBrowserRoute(traceRecord),
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

  const baseline = await runLiveScenario(pageUrl, {
    routeKind: 'live-browser-baseline',
    label: 'Escape/CLEAR raw route baseline',
    forceD02437: null,
  });
  const forced = await runLiveScenario(pageUrl, {
    routeKind: 'live-browser-force-d02437-harness',
    label: 'Escape/CLEAR force D02437=0xD1A8A3',
    forceD02437: D02437_HARNESS_VALUE,
  });

  return {
    routeKind: 'live-browser-ab',
    chromePath,
    pageUrl,
    baseline,
    forced,
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

function formatMutation(mutation) {
  if (!mutation) return null;
  return {
    ...mutation,
    pc: hex(mutation.pc),
    forceD02437: hex(mutation.forceD02437),
    before: formatRouteRow(mutation.before),
    after: formatRouteRow(mutation.after),
  };
}

function formatRoute(route) {
  return {
    ...route,
    prevPc: route.prevPc == null ? null : hex(route.prevPc),
    windowStartPc: route.windowStartPc == null ? null : hex(route.windowStartPc),
    targetFirst: Object.fromEntries(Object.entries(route.targetFirst ?? {}).map(([name, row]) => [name, formatRouteRow(row)])),
    rows: (route.rows ?? []).map(formatRouteRow),
    mutations: (route.mutations ?? []).map(formatMutation),
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
    mutations: (route.mutations ?? []).map(formatMutation),
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

const FLAG_OWNER_PCS = new Set([
  0x058A10, 0x058212, 0x0800B8, 0x058216, 0x058218, 0x09142B,
  0x090B81, 0x09142F, 0x091430, 0x05E3E3, 0x05E3F5, 0x05E3E7,
  0x05E3E8, 0x04C973, 0x05821C, 0x058221, 0x058A14,
]);

function pcOf(row) {
  return parseHex(row?.pc);
}

function findLastPc(rows, endIndex, pc) {
  for (let index = Math.min(endIndex, rows.length - 1); index >= 0; index -= 1) {
    if (pcOf(rows[index]) === pc) return index;
  }
  return -1;
}

function formatPath(rows) {
  return rows.map((row) => row.pc).join(' -> ');
}

function compareRole(index) {
  return index === 0 ? 'D02440-D0243D' : 'D0243A-D02437';
}

function summarizeCompare(row, nextRow, index) {
  const raw = rawRow(row);
  const next = rawRow(nextRow);
  const f = next?.cpu?.f ?? raw?.cpu?.f ?? 0;
  return {
    role: compareRole(index),
    pc: row?.pc ?? null,
    nextPc: nextRow?.pc ?? null,
    hl: raw?.cpu?.hl ?? null,
    de: raw?.cpu?.de ?? null,
    resultF: f,
    resultZ: (f & 0x40) !== 0,
  };
}

function traceFlagOwner(route, divergenceIndex) {
  const rows = route?.rows ?? [];
  const returnIndex = findLastPc(rows, divergenceIndex, 0x058A14);
  const callIndex = findLastPc(rows, returnIndex, 0x058A10);
  if (returnIndex < 0 || callIndex < 0) {
    return {
      found: false,
      callIndex,
      returnIndex,
      reason: '0x058A10/0x058A14 call-return window not found',
    };
  }

  const window = rows.slice(callIndex, returnIndex + 1);
  const interesting = window.filter((row) => FLAG_OWNER_PCS.has(pcOf(row)));
  const compareRows = [];
  for (let index = 0; index < window.length; index += 1) {
    if (pcOf(window[index]) === 0x04C973) compareRows.push(summarizeCompare(window[index], window[index + 1], compareRows.length));
  }

  const returnRaw = rawRow(rows[returnIndex]);
  const branchRow = interesting.find((row) => pcOf(row) === 0x058216);
  const branchRaw = rawRow(branchRow);
  const fields = returnRaw?.fields ?? {};
  const highEqual = fields.D0243D === fields.D02440;
  const lowEqual = fields.D0243A === fields.D02437;
  const c4Bit5 = ((fields.D000C4_IY44 ?? 0) & 0x20) !== 0;
  const retF = returnRaw?.cpu?.f ?? null;

  return {
    found: true,
    callIndex,
    returnIndex,
    path: formatPath(interesting),
    rows: interesting,
    compareRows,
    branchAfter0800B8: branchRow ?? null,
    gate: {
      D000C4_IY44: fields.D000C4_IY44 ?? null,
      bit5Set: c4Bit5,
      branchF: branchRaw?.cpu?.f ?? null,
      branchZ: ((branchRaw?.cpu?.f ?? 0) & 0x40) !== 0,
      D010F4: fields.D010F4 ?? null,
    },
    pointerState: {
      D02437: fields.D02437 ?? null,
      D0243A: fields.D0243A ?? null,
      D0243D: fields.D0243D ?? null,
      D02440: fields.D02440 ?? null,
      firstCompareEqual: highEqual,
      secondCompareEqual: lowEqual,
    },
    returnState: {
      af: returnRaw?.cpu?.af ?? null,
      f: retF,
      z: retF == null ? null : ((retF & 0x40) !== 0),
      de: returnRaw?.cpu?.de ?? null,
      hl: returnRaw?.cpu?.hl ?? null,
    },
  };
}

function analyzeFlagOwner(harness, live, divergence) {
  const h = traceFlagOwner(harness.route, divergence?.previousIndex ?? 0);
  const l = traceFlagOwner(live.route, divergence?.previousIndex ?? 0);
  const hFinal = h.compareRows.at(-1);
  const lFinal = l.compareRows.at(-1);
  const controller = h.found && l.found
    ? `0x058212 reaches 0x05E3E3 in both routes; the decisive compare is ${hFinal?.role ?? 'unknown'} / ${lFinal?.role ?? 'unknown'} at 0x04C973. Harness compares HL=${hex(hFinal?.hl)} to DE=${hex(hFinal?.de)} and returns F=${hex(h.returnState.f, 2)} (Z=${h.returnState.z ? 1 : 0}); live compares HL=${hex(lFinal?.hl)} to DE=${hex(lFinal?.de)} and returns F=${hex(l.returnState.f, 2)} (Z=${l.returnState.z ? 1 : 0}).`
    : 'flag-owner call-return window not found in one route';
  return { harness: h, live: l, controller };
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

function flagWindowTable(trace) {
  if (!trace?.found) return trace?.reason ?? 'window not found';
  return [
    '| # | PC | Prev | AF | DE | HL | D000C4 | D010F4 | D02437 | D0243A | D0243D | D02440 |',
    '| ---: | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...trace.rows.map((row, index) => (
      `| ${index} | ${row.pc} | ${row.prevPc ?? '-'} | ${row.cpu?.af ?? '-'} | ${row.cpu?.de ?? '-'} | ${row.cpu?.hl ?? '-'} | ${row.fields?.D000C4_IY44 ?? '-'} | ${row.fields?.D010F4 ?? '-'} | ${row.fields?.D02437 ?? '-'} | ${row.fields?.D0243A ?? '-'} | ${row.fields?.D0243D ?? '-'} | ${row.fields?.D02440 ?? '-'} |`
    )),
  ].join('\n');
}

function compareTraceTable(flagOwner) {
  const rows = [];
  const max = Math.max(flagOwner.harness?.compareRows?.length ?? 0, flagOwner.live?.compareRows?.length ?? 0);
  for (let index = 0; index < max; index += 1) {
    const h = flagOwner.harness.compareRows[index];
    const l = flagOwner.live.compareRows[index];
    rows.push(`| ${index + 1} | ${h?.role ?? l?.role ?? '-'} | ${hex(h?.hl)} | ${hex(h?.de)} | ${hex(h?.resultF, 2)} | ${h?.resultZ ? 1 : 0} | ${hex(l?.hl)} | ${hex(l?.de)} | ${hex(l?.resultF, 2)} | ${l?.resultZ ? 1 : 0} |`);
  }
  return [
    '| # | Role | Harness HL | Harness DE | Harness F | Harness Z | Live HL | Live DE | Live F | Live Z |',
    '| ---: | --- | --- | --- | --- | ---: | --- | --- | --- | ---: |',
    ...rows,
  ].join('\n');
}

function routeCountsTable(routes) {
  return [
    '| Route | 0x0A229D | 0x0A1854 | 0x0A31FD | 0x0A31E2 | 0x0018F8 | 0x006D64 | Termination | Mutations |',
    '| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | ---: |',
    ...routes.map(({ label, route, state, clearResult }) => {
      const counts = route?.targetCounts ?? {};
      const termination = state?.keyState?.termination ?? clearResult?.termination ?? '-';
      return `| ${label} | ${counts.anchor0A229D ?? 0} | ${counts.liveSpin0A1854 ?? 0} | ${counts.owner0A31FD ?? 0} | ${counts.destructiveCopy0A31E2 ?? 0} | ${counts.cleanup0018F8 ?? 0} | ${counts.poll006D64 ?? 0} | ${termination} | ${route?.mutations?.length ?? 0} |`;
    }),
  ].join('\n');
}

function mutationTable(routes) {
  const rows = [];
  for (const { label, route } of routes) {
    for (const mutation of route?.mutations ?? []) {
      rows.push(`| ${label} | ${mutation.pc} | ${mutation.forceD02437} | ${mutation.before?.fields?.D02437 ?? '-'} | ${mutation.after?.fields?.D02437 ?? '-'} | ${mutation.after?.fields?.D0243A ?? '-'} | ${mutation.after?.fields?.D0243D ?? '-'} | ${mutation.after?.fields?.D02440 ?? '-'} |`);
    }
  }
  return [
    '| Route | PC | Forced D02437 | Before D02437 | After D02437 | After D0243A | After D0243D | After D02440 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
    ...(rows.length ? rows : ['| - | - | - | - | - | - | - | - |']),
  ].join('\n');
}

function fieldComparisonTable(oracle, variants) {
  const names = ['D007CA', 'D008E0', 'D02437', 'D0243A', 'D0243D', 'D02505', 'D02590', 'D0259D', 'D02A29'];
  return [
    `| Field | Oracle | ${variants.map((variant) => variant.label).join(' | ')} |`,
    `| --- | --- | ${variants.map(() => '---').join(' | ')} |`,
    ...names.map((name) => `| ${name} | ${oracle[name] ?? '-'} | ${variants.map((variant) => variant.fields?.[name] ?? '-').join(' | ')} |`),
  ].join('\n');
}

function decodeTable(rows) {
  return [
    '| PC | Bytes | Instruction |',
    '| --- | --- | --- |',
    ...rows.map((row) => `| ${row.pc} | \`${row.bytes}\` | ${row.instruction} |`),
  ].join('\n');
}

function buildReport(data) {
  if (data.error) {
    return [
      '# Phase 868: D02437 Flag-Owner A/B Adjudication',
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
  const hi = data.inverseHarness;
  const liveBaseline = data.live.baseline;
  const liveForced = data.live.forced;
  const b = data.baseline;
  const f = data.forced;
  const i = data.inverse;
  return [
    '# Phase 868: D02437 Flag-Owner A/B Adjudication',
    '',
    'Probe: `probe-phase868-d02437-ab-adjudication.mjs`  ',
    'Run: `node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase868-d02437-ab-adjudication.mjs`',
    '',
    '## Summary',
    '',
    `- Result: ${data.pass ? 'PASS' : 'FAIL'}.`,
    `- Baseline live reproduces Phase867: ${b.classification.previousCommonPc} -> harness ${b.classification.harnessNextPc}, live ${b.classification.liveNextPc}; live final compare returns F=${hex(b.flagOwner.live.returnState.f, 2)} (Z=${b.flagOwner.live.returnState.z ? 1 : 0}).`,
    `- Forced live A/B wrote D02437=${hex(D02437_HARNESS_VALUE)} at 0x05E3E8; final compare returns F=${hex(f.flagOwner.live.returnState.f, 2)} (Z=${f.flagOwner.live.returnState.z ? 1 : 0}) and route counts owner=${liveForced.route.targetCounts.owner0A31FD}, copy=${liveForced.route.targetCounts.destructiveCopy0A31E2}, anchor=${liveForced.route.targetCounts.anchor0A229D}, wipe=${liveForced.route.targetCounts.cleanup0018F8}.`,
    `- Inverse harness A/B wrote D02437=${hex(D02437_LIVE_VALUE)} at 0x05E3E8; final compare returns F=${hex(i.flagOwner.live.returnState.f, 2)} (Z=${i.flagOwner.live.returnState.z ? 1 : 0}) and route counts owner=${hi.route.targetCounts.owner0A31FD}, anchor=${hi.route.targetCounts.anchor0A229D}, wipe=${hi.route.targetCounts.cleanup0018F8}.`,
    '- Interpretation: `D02437` is adjudicated as the route controller at the `0x058212 -> 0x058A14` window. Forcing the live route to the harness value flips the compare to NZ and reaches the `0x0A31FD`/copy owner chain; forcing the harness to the live value flips it to the live fall-through path. The forced live route still later reaches `0x0A229D` and `0x0018F8`, so this is a controller finding, not a complete live CLEAR fix.',
    '',
    '## Route Counts',
    '',
    routeCountsTable([
      { label: 'harness baseline', route: h.route, clearResult: h.clearResult },
      { label: 'live baseline', route: liveBaseline.route, state: liveBaseline.state },
      { label: 'live forced D02437=0xD1A8A3', route: liveForced.route, state: liveForced.state },
      { label: 'harness forced D02437=0xD1A8CC', route: hi.route, clearResult: hi.clearResult },
    ]),
    '',
    '## Mutation Points',
    '',
    mutationTable([
      { label: 'live forced D02437=0xD1A8A3', route: liveForced.route },
      { label: 'harness forced D02437=0xD1A8CC', route: hi.route },
    ]),
    '',
    '## Baseline Compare Trace',
    '',
    compareTraceTable(b.flagOwner),
    '',
    '## Forced Live Compare Trace',
    '',
    compareTraceTable(f.flagOwner),
    '',
    '## Inverse Harness Compare Trace',
    '',
    compareTraceTable(i.flagOwner),
    '',
    '## Real After-CLEAR Field Comparison',
    '',
    fieldComparisonTable(data.oracleFields, [
      { label: 'live baseline end', fields: liveBaseline.route.end?.fields },
      { label: 'live forced end', fields: liveForced.route.end?.fields },
      { label: 'inverse harness end', fields: hi.finalFields },
    ]),
    '',
    '## Static Decode: 0x058212 Dispatcher',
    '',
    decodeTable(data.decodeFlagOwner),
    '',
    '## Static Decode: Pointer Compare Helpers',
    '',
    decodeTable(data.decodeCompareHelpers),
    '',
    '## Machine JSON',
    '',
    '```json',
    JSON.stringify({
      pass: data.pass,
      baseline: {
        classification: b.classification,
        flagOwner: b.flagOwner,
      },
      forced: {
        classification: f.classification,
        flagOwner: f.flagOwner,
      },
      inverse: {
        classification: i.classification,
        flagOwner: i.flagOwner,
      },
      harness: {
        clearResult: h.clearResult,
        targetCounts: h.route.targetCounts,
      },
      inverseHarness: {
        clearResult: hi.clearResult,
        targetCounts: hi.route.targetCounts,
        mutations: hi.route.mutations,
      },
      live: {
        baseline: {
          status: liveBaseline.state.status,
          keyState: liveBaseline.state.keyState,
          targetCounts: liveBaseline.route.targetCounts,
        },
        forced: {
          status: liveForced.state.status,
          keyState: liveForced.state.keyState,
          targetCounts: liveForced.route.targetCounts,
          mutations: liveForced.route.mutations,
        },
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
  const inverseHarness = runHarnessRoute({
    routeLabel: 'phase868-harness-force-live-d02437',
    forceD02437: D02437_LIVE_VALUE,
  });
  const live = await runLiveBrowserRoute();
  const baselineDivergence = firstDivergence(harness, live.baseline);
  const forcedDivergence = firstDivergence(harness, live.forced);
  const inverseDivergence = firstDivergence(harness, inverseHarness);
  const baseline = {
    classification: classifyDivergence(baselineDivergence),
    flagOwner: analyzeFlagOwner(harness, live.baseline, baselineDivergence),
  };
  const forced = {
    classification: classifyDivergence(forcedDivergence),
    flagOwner: analyzeFlagOwner(harness, live.forced, forcedDivergence),
  };
  const inverse = {
    classification: classifyDivergence(inverseDivergence),
    flagOwner: analyzeFlagOwner(harness, inverseHarness, inverseDivergence),
  };
  const baselineFinal = baseline.flagOwner.live.compareRows.at(-1);
  const forcedFinal = forced.flagOwner.live.compareRows.at(-1);
  const inverseFinal = inverse.flagOwner.live.compareRows.at(-1);
  const forcedMutation = live.forced.route.mutations?.[0] ?? null;
  const inverseMutation = inverseHarness.route.mutations?.[0] ?? null;
  const pass = Boolean(baselineDivergence)
    && baseline.flagOwner.harness.found
    && baseline.flagOwner.live.found
    && baselineFinal?.resultZ === true
    && live.baseline.route.targetCounts.anchor0A229D > 0
    && harness.route.targetCounts.liveSpin0A1854 > 0
    && live.baseline.route.targetCounts.liveSpin0A1854 > 0
    && harness.route.targetCounts.owner0A31FD > 0
    && live.baseline.route.targetCounts.owner0A31FD === 0
    && (live.baseline.state.pageErrors ?? []).length === 0
    && forced.flagOwner.live.found
    && forcedFinal?.de === D02437_HARNESS_VALUE
    && forcedFinal?.resultZ === false
    && live.forced.route.targetCounts.owner0A31FD > 0
    && live.forced.route.targetCounts.destructiveCopy0A31E2 > 0
    && parseHex(forcedMutation?.forceD02437) === D02437_HARNESS_VALUE
    && (live.forced.state.pageErrors ?? []).length === 0
    && inverse.flagOwner.live.found
    && inverseFinal?.de === D02437_LIVE_VALUE
    && inverseFinal?.resultZ === true
    && inverseHarness.route.targetCounts.owner0A31FD === 0
    && inverseHarness.route.targetCounts.anchor0A229D > 0
    && parseHex(inverseMutation?.forceD02437) === D02437_LIVE_VALUE;

  return {
    probe: 'phase868-d02437-ab-adjudication',
    pass,
    harness,
    inverseHarness,
    live,
    baseline,
    forced,
    inverse,
    oracleFields: formatFields(readCaptureFields(afterClearRam)),
    decodeFlagOwner: [
      ...decodeWindow(0x058A10, 0x058A22),
      ...decodeWindow(0x0800B8, 0x0800BC),
      ...decodeWindow(0x09142B, 0x091434),
      ...decodeWindow(0x090B81, 0x090B87),
    ],
    decodeCompareHelpers: [
      ...decodeWindow(0x05E3E3, 0x05E3FE),
      ...decodeWindow(0x04C973, 0x04C978),
    ],
  };
}

try {
  summary = await runProbe();
  console.log(JSON.stringify({
    probe: summary.probe,
    pass: summary.pass,
    baselineClassification: summary.baseline.classification,
    forcedClassification: summary.forced.classification,
    inverseClassification: summary.inverse.classification,
    baselineController: summary.baseline.flagOwner.controller,
    forcedController: summary.forced.flagOwner.controller,
    inverseController: summary.inverse.flagOwner.controller,
    harnessCounts: summary.harness.route.targetCounts,
    inverseHarnessCounts: summary.inverseHarness.route.targetCounts,
    liveBaselineCounts: summary.live.baseline.route.targetCounts,
    liveForcedCounts: summary.live.forced.route.targetCounts,
    liveForcedMutations: summary.live.forced.route.mutations,
    liveBaselineKey: summary.live.baseline.state.keyState,
    liveForcedKey: summary.live.forced.state.keyState,
    report: path.basename(REPORT_PATH),
  }, null, 2));
  if (!summary.pass) process.exitCode = 1;
} catch (error) {
  summary = { probe: 'phase868-d02437-ab-adjudication', pass: false, error: String(error?.stack || error) };
  console.error(summary.error);
  process.exitCode = 1;
} finally {
  try { fs.writeFileSync(REPORT_PATH, `${buildReport(summary)}\n`); } catch {}
  try { ws?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  try { server?.close(); } catch {}
  try { fs.rmSync(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
}
