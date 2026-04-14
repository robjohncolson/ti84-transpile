#!/usr/bin/env node
// Phase 56: scan the 0x061f00-0x062300 window for error-banner entry points.
//
// Heuristic:
// - aligned direct call/jp targets into the window
// - aligned starts immediately after an unconditional ret (0xc9)
//
// Probe state:
//   boot -> explicit OS init -> cpu.mbase = 0xd0 -> set text fg helper ->
//   direct call entry with a sentinel stack and 5000-step cap.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const RANGE_START = 0x061f00;
const RANGE_END = 0x062300;

const BOOT_ENTRY = 0x000000;
const OS_INIT_ENTRY = 0x08c331;
const SET_TEXT_FG_ENTRY = 0x0802b2;

const SCREEN_STACK_TOP = 0xd1a87e;
const HELPER_STACK_BYTES = 3;
const PROBE_STACK_BYTES = 12;
const PROBE_IY = 0xd00080;

const RAM_START = 0x400000;
const RAM_END = 0xe00000;
const RAM_SIZE = RAM_END - RAM_START;

const VRAM_BASE = 0xd40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;
const VRAM_SENTINEL = 0xaaaa;

const ENTRY_START_OPS = new Set([
  0xf5, 0xc5, 0xd5, 0xe5, 0xdd, 0xfd, 0x78, 0x3a, 0x97,
  0xcd, 0x21, 0x11, 0x01, 0xaf, 0xed, 0x40, 0x2a, 0x32, 0x3e,
]);

const QUERY_STRINGS = [
  { label: 'OVERFLOW', needle: 'OVERFLOW' },
  { label: 'DIVIDE BY 0', needle: 'DIVIDE BY 0' },
  { label: 'SINGULAR MAT', needle: 'SINGULAR MATRIX' },
  { label: 'DOMAIN', needle: 'DOMAIN' },
  { label: 'DIM MISMATCH', needle: 'DIMENSION MISMATCH' },
  { label: 'INVALID DIM', needle: 'INVALID DIMENSION' },
  { label: 'BREAK', needle: 'BREAK' },
  { label: 'ERR:', needle: 'ERR:' },
];

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function blockKey(addr) {
  return `${addr.toString(16).padStart(6, '0')}:adl`;
}

function formatBbox(bbox) {
  if (!bbox) {
    return 'none';
  }

  return `r${bbox.minRow}-${bbox.maxRow} c${bbox.minCol}-${bbox.maxCol}`;
}

function fillSentinel(mem, start, bytes) {
  mem.fill(0xff, start, start + bytes);
}

function buildClearedVram() {
  const bytes = new Uint8Array(VRAM_SIZE);

  for (let offset = 0; offset < VRAM_SIZE; offset += 2) {
    bytes[offset] = VRAM_SENTINEL & 0xff;
    bytes[offset + 1] = (VRAM_SENTINEL >> 8) & 0xff;
  }

  return bytes;
}

function snapshotCpu(cpu) {
  const fields = [
    'a',
    'f',
    '_bc',
    '_de',
    '_hl',
    '_a2',
    '_f2',
    '_bc2',
    '_de2',
    '_hl2',
    'sp',
    '_ix',
    '_iy',
    'i',
    'im',
    'iff1',
    'iff2',
    'madl',
    'mbase',
    'halted',
    'cycles',
  ];

  return Object.fromEntries(fields.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }
}

function readPixel(mem, row, col) {
  const offset = VRAM_BASE + row * VRAM_WIDTH * 2 + col * 2;
  return mem[offset] | (mem[offset + 1] << 8);
}

function collectVramStats(mem) {
  let changedPixels = 0;
  let minRow = VRAM_HEIGHT;
  let maxRow = -1;
  let minCol = VRAM_WIDTH;
  let maxCol = -1;
  const colorCounts = new Map();

  for (let row = 0; row < VRAM_HEIGHT; row += 1) {
    for (let col = 0; col < VRAM_WIDTH; col += 1) {
      const pixel = readPixel(mem, row, col);
      if (pixel === VRAM_SENTINEL) {
        continue;
      }

      changedPixels += 1;
      colorCounts.set(pixel, (colorCounts.get(pixel) || 0) + 1);

      if (row < minRow) minRow = row;
      if (row > maxRow) maxRow = row;
      if (col < minCol) minCol = col;
      if (col > maxCol) maxCol = col;
    }
  }

  const topColors = [...colorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([color, count]) => ({ color: hex(color, 4), count }));

  return {
    vramWrites: changedPixels,
    bbox: maxRow >= 0 ? { minRow, maxRow, minCol, maxCol } : null,
    topColors,
  };
}

function isBannerLike(result) {
  const bbox = result.bbox;
  if (!bbox) {
    return false;
  }

  if (result.vramWrites < 100 || result.vramWrites > 2000) {
    return false;
  }

  return bbox.minRow <= 60 && bbox.maxRow <= 120;
}

function classify(result) {
  if (result.blocks > 2000 || result.termination === 'max_steps') {
    return 'deep';
  }

  if (result.termination === 'error') {
    return 'crash';
  }

  if (result.vramWrites === 0) {
    return 'noop';
  }

  if (isBannerLike(result)) {
    return 'banner';
  }

  return 'other';
}

function collectAlignedRefs() {
  const refs = new Map();

  for (const block of Object.values(PRELIFTED_BLOCKS)) {
    for (const instruction of block.instructions || []) {
      if (typeof instruction.target !== 'number') {
        continue;
      }

      if (instruction.target < RANGE_START || instruction.target >= RANGE_END) {
        continue;
      }

      const tag = String(instruction.tag || '');
      if (!tag.includes('call') && !tag.includes('jp')) {
        continue;
      }

      const row = refs.get(instruction.target) || {
        callCount: 0,
        jpCount: 0,
        sites: [],
      };

      if (tag.includes('call')) row.callCount += 1;
      if (tag.includes('jp')) row.jpCount += 1;
      if (row.sites.length < 6) {
        row.sites.push(`${hex(block.startPc)} ${instruction.dasm}`);
      }

      refs.set(instruction.target, row);
    }
  }

  return refs;
}

function collectPostRetStarts() {
  const starts = [];

  for (let addr = RANGE_START + 1; addr < RANGE_END; addr += 1) {
    if (romBytes[addr - 1] !== 0xc9) {
      continue;
    }

    if (!PRELIFTED_BLOCKS[blockKey(addr)]) {
      continue;
    }

    if (!ENTRY_START_OPS.has(romBytes[addr])) {
      continue;
    }

    starts.push(addr);
  }

  return starts;
}

function buildCandidates() {
  const directRefs = collectAlignedRefs();
  const postRetStarts = new Set(collectPostRetStarts());
  const candidateSet = new Set([...directRefs.keys(), ...postRetStarts]);

  return [...candidateSet]
    .filter((addr) => {
      const ref = directRefs.get(addr);
      if (!ref) {
        return true;
      }

      if (ref.callCount > 0) {
        return true;
      }

      if (postRetStarts.has(addr)) {
        return true;
      }

      return false;
    })
    .sort((a, b) => a - b)
    .map((addr) => ({
      addr,
      firstBytes: Array.from(romBytes.slice(addr, addr + 8))
        .map((byte) => byte.toString(16).padStart(2, '0'))
        .join(' '),
      reasons: [
        postRetStarts.has(addr) ? 'post-ret' : null,
        directRefs.has(addr)
          ? `aligned-ref calls=${directRefs.get(addr).callCount} jps=${directRefs.get(addr).jpCount}`
          : null,
      ].filter(Boolean),
      refs: directRefs.get(addr) || null,
    }));
}

function read24(addr) {
  return romBytes[addr] | (romBytes[addr + 1] << 8) | (romBytes[addr + 2] << 16);
}

function readCString(addr) {
  let end = addr;

  while (end < romBytes.length && romBytes[end] !== 0x00) {
    end += 1;
  }

  return Buffer.from(romBytes.slice(addr, end)).toString('ascii');
}

function decodeErrorPointerTable() {
  const tableStart = 0x062290;
  const firstString = read24(tableStart);
  const entries = [];

  for (let ptrAddr = tableStart; ptrAddr + 2 < firstString; ptrAddr += 3) {
    const strAddr = read24(ptrAddr);
    entries.push({
      index: (ptrAddr - tableStart) / 3,
      ptrAddr,
      strAddr,
      text: readCString(strAddr),
    });
  }

  return entries;
}

function scanStrings(pointerEntries) {
  const pointerIndexByAddr = new Map(pointerEntries.map((entry) => [entry.strAddr, entry.index]));

  return QUERY_STRINGS.map(({ label, needle }) => {
    const addr = romBytes.indexOf(Buffer.from(needle, 'ascii'));
    return {
      label,
      needle,
      addr,
      tableIndex: pointerIndexByAddr.get(addr) ?? null,
      text: addr >= 0 ? readCString(addr) : null,
    };
  });
}

function restoreBaseState(env) {
  env.mem.set(env.ramSnapshot, RAM_START);
  env.mem.set(env.clearedVram, VRAM_BASE);
  restoreCpu(env.cpu, env.cpuSnapshot);

  if (!env.lcdSnapshot || !env.executor.lcdMmio) {
    return;
  }

  env.executor.lcdMmio.upbase = env.lcdSnapshot.upbase;
  env.executor.lcdMmio.control = env.lcdSnapshot.control;
}

function prepareProbe(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = PROBE_IY;
  cpu.f = 0x40;
  cpu.sp = SCREEN_STACK_TOP - PROBE_STACK_BYTES;
  fillSentinel(mem, cpu.sp, PROBE_STACK_BYTES);
}

function buildProbeEnv() {
  const peripherals = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = SCREEN_STACK_TOP - HELPER_STACK_BYTES;
  fillSentinel(mem, cpu.sp, HELPER_STACK_BYTES);

  executor.runFrom(OS_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });
  cpu.mbase = 0xd0;

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = PROBE_IY;
  cpu.hl = 0;
  cpu.sp = SCREEN_STACK_TOP - HELPER_STACK_BYTES;
  fillSentinel(mem, cpu.sp, HELPER_STACK_BYTES);

  executor.runFrom(SET_TEXT_FG_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  return {
    executor,
    mem,
    cpu,
    ramSnapshot: new Uint8Array(mem.slice(RAM_START, RAM_END)),
    cpuSnapshot: snapshotCpu(cpu),
    clearedVram: buildClearedVram(),
    lcdSnapshot: executor.lcdMmio
      ? { upbase: executor.lcdMmio.upbase, control: executor.lcdMmio.control }
      : null,
  };
}

function runCandidate(env, candidate) {
  restoreBaseState(env);
  prepareProbe(env.cpu, env.mem);

  let raw;
  let blocks = 0;

  try {
    raw = env.executor.runFrom(candidate.addr, 'adl', {
      maxSteps: 5000,
      maxLoopIterations: 5000,
      onBlock() {
        blocks += 1;
      },
    });
  } catch (error) {
    raw = {
      termination: 'error',
      lastPc: env.cpu.pc,
      steps: 0,
      error,
    };
  }

  const vram = collectVramStats(env.mem);
  const result = {
    addr: candidate.addr,
    reasons: candidate.reasons,
    termination: raw.termination,
    lastPc: raw.lastPc ?? null,
    steps: raw.steps ?? 0,
    blocks,
    vramWrites: vram.vramWrites,
    bbox: vram.bbox,
    topColors: vram.topColors,
  };

  result.bannerLike = isBannerLike(result);
  result.classification = classify(result);
  return result;
}

const candidates = buildCandidates();
const pointerEntries = decodeErrorPointerTable();
const stringHits = scanStrings(pointerEntries);
const env = buildProbeEnv();
const results = candidates.map((candidate) => runCandidate(env, candidate));

console.log('=== Candidate Entries ===');
for (const candidate of candidates) {
  console.log(
    [
      hex(candidate.addr),
      candidate.reasons.join(', '),
      candidate.firstBytes,
    ].join('  '),
  );

  if (!candidate.refs) {
    continue;
  }

  for (const site of candidate.refs.sites) {
    console.log(`  ref ${site}`);
  }
}

console.log('\n=== Probe Results ===');
for (const result of results) {
  const colorSummary = result.topColors
    .map((entry) => `${entry.color}:${entry.count}`)
    .join(', ') || 'none';

  console.log(
    [
      hex(result.addr),
      `class=${result.classification}`,
      `bannerLike=${result.bannerLike}`,
      `term=${result.termination}@${hex(result.lastPc ?? 0)}`,
      `steps=${result.steps}`,
      `blocks=${result.blocks}`,
      `vramWrites=${result.vramWrites}`,
      `bbox=${formatBbox(result.bbox)}`,
      `colors=${colorSummary}`,
    ].join(' '),
  );
}

console.log('\n=== Error Table Head ===');
for (const entry of pointerEntries.slice(0, 16)) {
  console.log(`${entry.index.toString().padStart(2, '0')} ${hex(entry.ptrAddr)} -> ${hex(entry.strAddr)} ${entry.text}`);
}

console.log('\n=== String Hits ===');
for (const hit of stringHits) {
  const location = hit.addr >= 0 ? hex(hit.addr) : 'not-found';
  const tableRef = hit.tableIndex === null ? 'table=none' : `tableIndex=${hit.tableIndex}`;
  const text = hit.text ?? hit.needle;
  console.log(`${hit.label.padEnd(13, ' ')} ${location} ${tableRef} ${text}`);
}
