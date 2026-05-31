#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MEM_SIZE = 0x1000000;
const STACK_RESET_TOP = 0xD1A87E;
const VRAM_START = 0xD40000;
const VRAM_END = 0xD65800;

const mem = new Uint8Array(MEM_SIZE);
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
mem.set(rom.subarray(0, MEM_SIZE), 0);

const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;
const peripherals = createPeripheralBus({ timerInterrupt: true, timerInterval: 500 });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

function hex(v, w = 2) { return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0'); }

function hexBytes(bytes) {
  return Array.from(bytes, b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function snapshotRange(start, end) {
  return mem.slice(start, end);
}

function fnv1a(bytes) {
  let hash = 0x811C9DC5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function diffRange(name, start, end, before, options = {}) {
  const { limit = 64, includeSnapshots = false } = options;
  const after = snapshotRange(start, end);
  const firstChanges = [];
  const changedPages = new Set();
  let changedBytes = 0;
  let firstChanged = null;
  let lastChanged = null;

  for (let i = 0; i < before.length; i++) {
    if (before[i] === after[i]) continue;

    const addr = start + i;
    changedBytes++;
    changedPages.add(addr >>> 8);
    if (firstChanged === null) firstChanged = addr;
    lastChanged = addr;

    if (firstChanges.length < limit) {
      firstChanges.push({
        addr: hex(addr, 6),
        before: hex(before[i]),
        after: hex(after[i]),
      });
    }
  }

  const report = {
    name,
    start: hex(start, 6),
    endExclusive: hex(end, 6),
    size: before.length,
    changedBytes,
    changedPages: changedPages.size,
    firstChanged: firstChanged === null ? null : hex(firstChanged, 6),
    lastChanged: lastChanged === null ? null : hex(lastChanged, 6),
    checksumBefore: hex(fnv1a(before), 8),
    checksumAfter: hex(fnv1a(after), 8),
    firstChanges,
  };

  if (includeSnapshots) {
    report.beforeHex = hexBytes(before);
    report.afterHex = hexBytes(after);
  } else if (after.length <= 64) {
    report.afterHex = hexBytes(after);
  }

  return report;
}

function runResultSummary(result) {
  if (!result || typeof result !== 'object') return result;

  const summary = {};
  for (const [key, value] of Object.entries(result)) {
    if (value === null || value === undefined) {
      summary[key] = value;
    } else if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
      summary[key] = value;
    } else if (typeof value === 'bigint') {
      summary[key] = value.toString();
    } else if (Array.isArray(value)) {
      summary[key] = value.slice(0, 20);
    }
  }
  return summary;
}

function cpuState() {
  return {
    a: hex((cpu._a >>> 24) & 0xFF),
    f: hex(cpu.f & 0xFF),
    bc: hex(cpu._bc & 0xFFFFFF, 6),
    de: hex(cpu._de & 0xFFFFFF, 6),
    hl: hex(cpu._hl & 0xFFFFFF, 6),
    iy: hex(cpu._iy & 0xFFFFFF, 6),
    sp: hex(cpu.sp & 0xFFFFFF, 6),
    mbase: hex(cpu.mbase & 0xFF),
    halted: Boolean(cpu.halted),
    iff1: cpu.iff1,
    iff2: cpu.iff2,
  };
}

const romDumps = {
  '0x08BFA6': hexBytes(mem.subarray(0x08BFA6, 0x08BFA6 + 32)),
  '0x09EF44': hexBytes(mem.subarray(0x09EF44, 0x09EF44 + 32)),
};

// Stage 1: z80 boot
const bootResult = executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

// Stage 2: kernel init
cpu.mbase = 0xD0; cpu._iy = 0xD00080;
const kernelResult = executor.runFrom(0x08C331, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

// Stage 3: post-init
const postInitResult = executor.runFrom(0x0802B2, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });

cpu.mbase = 0xD0;
cpu._iy = 0xD00080;
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);
mem[0xD177BA] = 0x7F;
mem[0xD177B7] = 0x00;

const RAM_RANGES = [
  {
    key: 'osState',
    name: 'D00000-D00100 OS state variables',
    start: 0xD00000,
    end: 0xD00100,
    includeSnapshots: true,
  },
  {
    key: 'cursorDisplayState',
    name: 'D00580-D005A0 cursor/display state',
    start: 0xD00580,
    end: 0xD005A0,
    includeSnapshots: true,
  },
  {
    key: 'modeVariables',
    name: 'D007E0-D007F0 mode variables',
    start: 0xD007E0,
    end: 0xD007F0,
    includeSnapshots: true,
  },
  {
    key: 'modeState',
    name: 'D00824-D00830 mode state',
    start: 0xD00824,
    end: 0xD00830,
    includeSnapshots: true,
  },
  {
    key: 'keyBuffer',
    name: 'D14000-D14200 key buffer area',
    start: 0xD14000,
    end: 0xD14200,
    includeSnapshots: false,
  },
];

const beforeVram = snapshotRange(VRAM_START, VRAM_END);
const beforeRanges = new Map(RAM_RANGES.map(range => [range.key, snapshotRange(range.start, range.end)]));
const initialCpu = cpuState();
const initialKeyState = {
  D177B7: hex(mem[0xD177B7]),
  D177BA: hex(mem[0xD177BA]),
  stackSentinel: hexBytes(mem.subarray(cpu.sp, cpu.sp + 3)),
};

const WATCH_PCS = [
  { addr: 0x09EF44, name: 'heavy loop entry' },
  { addr: 0x0059C6, name: 'display output' },
  { addr: 0x005A75, name: 'display helper' },
  { addr: 0x042366, name: 'certificate check' },
  { addr: 0x022346, name: 'table lookup' },
];

const pcHits = new Map();
const uniquePcs = [];
const watchStats = new Map(WATCH_PCS.map(({ addr, name }) => [addr, {
  name,
  pc: hex(addr, 6),
  hits: 0,
  firstStep: null,
  lastStep: null,
  samples: [],
}]));

function onBlock(pc, mode, meta, steps) {
  const pc24 = Number(pc) & 0xFFFFFF;
  const previousHits = pcHits.get(pc24) || 0;
  if (previousHits === 0 && uniquePcs.length < 500) {
    uniquePcs.push(pc24);
  }
  pcHits.set(pc24, previousHits + 1);

  const watched = watchStats.get(pc24);
  if (!watched) return;

  const stepValue = typeof steps === 'bigint' ? Number(steps) : steps;
  watched.hits++;
  if (watched.firstStep === null) watched.firstStep = stepValue;
  watched.lastStep = stepValue;
  if (watched.samples.length < 12) {
    watched.samples.push({
      step: stepValue,
      mode,
      cpu: cpuState(),
    });
  }
}

let traceResult = null;
let traceError = null;
try {
  traceResult = executor.runFrom(0x08BFA6, 'adl', {
    maxSteps: 500000,
    maxLoopIterations: 50000,
    diHaltBypass: true,
    onBlock,
  });
} catch (error) {
  traceError = {
    name: error?.name || 'Error',
    message: error?.message || String(error),
    stack: error?.stack || null,
  };
}

const topPcs = Array.from(pcHits.entries())
  .sort((a, b) => (b[1] - a[1]) || (a[0] - b[0]))
  .slice(0, 30)
  .map(([pc, hits]) => ({ pc: hex(pc, 6), hits }));

const ramChanges = {};
for (const range of RAM_RANGES) {
  ramChanges[range.key] = diffRange(range.name, range.start, range.end, beforeRanges.get(range.key), {
    limit: 96,
    includeSnapshots: range.includeSnapshots,
  });
}

const finalCpu = cpuState();
const finalKeyState = {
  D177B7: hex(mem[0xD177B7]),
  D177BA: hex(mem[0xD177BA]),
  stackSentinel: hexBytes(mem.subarray((cpu.sp & 0xFFFFFF), (cpu.sp & 0xFFFFFF) + 3)),
  cursorDisplayState: hexBytes(mem.subarray(0xD00580, 0xD005A0)),
  modeVariables: hexBytes(mem.subarray(0xD007E0, 0xD007F0)),
  modeState: hexBytes(mem.subarray(0xD00824, 0xD00830)),
};

const report = {
  probe: 'phase476-trace-08BFA6',
  entry: hex(0x08BFA6, 6),
  options: {
    maxSteps: 500000,
    maxLoopIterations: 50000,
    diHaltBypass: true,
  },
  bootStages: {
    bootResult: runResultSummary(bootResult),
    kernelResult: runResultSummary(kernelResult),
    postInitResult: runResultSummary(postInitResult),
  },
  romDumps,
  initialCpu,
  initialKeyState,
  traceResult: runResultSummary(traceResult),
  traceError,
  blockCoverage: {
    uniquePcCount: pcHits.size,
    capturedUniquePcLimit: 500,
    capturedUniquePcCount: uniquePcs.length,
    uniquePcsTruncated: pcHits.size > uniquePcs.length,
    uniquePcs: uniquePcs.map(pc => hex(pc, 6)),
  },
  watchedPcs: Object.fromEntries(Array.from(watchStats.values()).map(stats => [stats.pc, stats])),
  top30PcsByHitCount: topPcs,
  vramChanges: diffRange('D40000-D65800 VRAM', VRAM_START, VRAM_END, beforeVram, { limit: 128 }),
  ramChanges,
  finalCpu,
  finalKeyState,
};

console.log(JSON.stringify(report, null, 2));

if (traceError) {
  process.exitCode = 1;
}
