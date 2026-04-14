#!/usr/bin/env node
// Phase 68: find the real parent of the 0x08bc80 / 0x08bc88 MODE helper family.
//
// Workflow:
// 1. Scan lifted blocks and raw ROM for direct callers of 0x08bc80 / 0x08bc88.
// 2. Expand that to the whole 0x08bc00..0x08bd00 helper window.
// 3. Backscan each caller PC to a containing function entry (RET scan, 0x200 bytes).
// 4. Probe each distinct parent entry with:
//      - baseline entry run
//      - prelude-seeded entry run (when a lifted predecessor reaches the parent)
// 5. Write a markdown report and print a machine-readable stdout log.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romPath = path.join(__dirname, 'ROM.rom');
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const reportPath = path.join(__dirname, 'phase68-mode-parent-report.md');

const romBytes = fs.readFileSync(romPath);

const EXACT_TARGETS = [0x08bc80, 0x08bc88];
const RANGE_START = 0x08bc00;
const RANGE_END_EXCLUSIVE = 0x08bd01;

const BOOT_ENTRY = 0x000000;
const OS_INIT_ENTRY = 0x08c331;
const SET_TEXT_FG_ENTRY = 0x0802b2;
const SCREEN_STACK_TOP = 0xd1a87e;
const HELPER_STACK_BYTES = 3;
const PROBE_STACK_BYTES = 12;
const PROBE_IY = 0xd00080;

const RAM_START = 0x400000;
const RAM_END = 0xe00000;

const VRAM_BASE = 0xd40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;
const VRAM_SENTINEL = 0xaaaa;

const FIRST_BLOCKS_LIMIT = 15;
const FIRST_ROW_WORDS = 32;
const MAX_PROBE_STEPS = 10000;
const MAX_PRELUDE_STEPS = 1500;
const FUNCTION_BACKSCAN_BYTES = 0x200;

const CPU_SNAPSHOT_FIELDS = [
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

const DIRECT_OPCODES = new Map([
  [0xcd, 'call'],
  [0xc3, 'jp'],
  [0xca, 'jp z'],
  [0xc2, 'jp nz'],
  [0xda, 'jp c'],
  [0xd2, 'jp nc'],
  [0xfa, 'jp m'],
  [0xf2, 'jp p'],
  [0xea, 'jp pe'],
  [0xe2, 'jp po'],
  [0xcc, 'call z'],
  [0xc4, 'call nz'],
  [0xdc, 'call c'],
  [0xd4, 'call nc'],
]);

const PRELUDE_STOP = Symbol('phase68_prelude_stop');

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function hexWord(value) {
  return (value & 0xffff).toString(16).padStart(4, '0');
}

function formatBbox(bbox) {
  if (!bbox) {
    return 'none';
  }

  return `r${bbox.minRow}-${bbox.maxRow} c${bbox.minCol}-${bbox.maxCol}`;
}

function bboxWidth(bbox) {
  return bbox ? (bbox.maxCol - bbox.minCol + 1) : 0;
}

function bboxHeight(bbox) {
  return bbox ? (bbox.maxRow - bbox.minRow + 1) : 0;
}

function bboxArea(bbox) {
  return bboxWidth(bbox) * bboxHeight(bbox);
}

function formatBlocks(blocks, limit = blocks?.length ?? 0) {
  if (!blocks || blocks.length === 0) {
    return 'none';
  }

  return blocks.slice(0, limit).map((pc) => hex(pc)).join(', ');
}

function formatCallers(rows) {
  if (!rows || rows.length === 0) {
    return 'none';
  }

  return rows.map((row) => `${hex(row.callerPc)} -> ${hex(row.target)}`).join(', ');
}

async function loadBlocks() {
  if (!fs.existsSync(transpiledPath)) {
    throw new Error(
      `Missing ${transpiledPath}. Run node scripts/transpile-ti84-rom.mjs first.`,
    );
  }

  const mod = await import(pathToFileURL(transpiledPath).href);
  return mod.PRELIFTED_BLOCKS;
}

function getBlockValues(blocks) {
  return Array.isArray(blocks) ? blocks : Object.values(blocks);
}

function snapshotCpu(cpu) {
  return Object.fromEntries(
    CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]),
  );
}

function restoreCpu(cpu, snapshot) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }
}

function buildClearedVram() {
  const bytes = new Uint8Array(VRAM_SIZE);

  for (let offset = 0; offset < VRAM_SIZE; offset += 2) {
    bytes[offset] = VRAM_SENTINEL & 0xff;
    bytes[offset + 1] = (VRAM_SENTINEL >> 8) & 0xff;
  }

  return bytes;
}

function fillSentinel(mem, start, bytes) {
  mem.fill(0xff, start, start + bytes);
}

function readPixel(mem, row, col) {
  const offset = VRAM_BASE + row * VRAM_WIDTH * 2 + col * 2;
  return mem[offset] | (mem[offset + 1] << 8);
}

function collectVramStats(mem) {
  let vramWrites = 0;
  let minRow = VRAM_HEIGHT;
  let maxRow = -1;
  let minCol = VRAM_WIDTH;
  let maxCol = -1;

  for (let row = 0; row < VRAM_HEIGHT; row += 1) {
    for (let col = 0; col < VRAM_WIDTH; col += 1) {
      const pixel = readPixel(mem, row, col);
      if (pixel === VRAM_SENTINEL) {
        continue;
      }

      vramWrites += 1;
      if (row < minRow) minRow = row;
      if (row > maxRow) maxRow = row;
      if (col < minCol) minCol = col;
      if (col > maxCol) maxCol = col;
    }
  }

  return {
    vramWrites,
    bbox: maxRow >= 0 ? { minRow, maxRow, minCol, maxCol } : null,
  };
}

function captureFirstRenderedRow(mem, bbox, wordLimit = FIRST_ROW_WORDS) {
  if (!bbox) {
    return null;
  }

  const row = bbox.minRow;
  const startCol = bbox.minCol;
  const endCol = Math.min(VRAM_WIDTH - 1, startCol + wordLimit - 1);
  const words = [];

  for (let col = startCol; col <= endCol; col += 1) {
    words.push(hexWord(readPixel(mem, row, col)));
  }

  return {
    row,
    startCol,
    endCol,
    words,
  };
}

function findFunctionEntry(callerPc, scanBackBytes = FUNCTION_BACKSCAN_BYTES) {
  const floor = Math.max(0, callerPc - scanBackBytes);

  for (let addr = callerPc - 1; addr >= floor; addr -= 1) {
    if (romBytes[addr] === 0xc9) {
      return { entry: addr + 1, heuristic: 'after_ret', terminator: addr };
    }

    if (
      addr > 0 &&
      romBytes[addr - 1] === 0xed &&
      (romBytes[addr] === 0x4d || romBytes[addr] === 0x5d)
    ) {
      return {
        entry: addr + 1,
        heuristic: romBytes[addr] === 0x4d ? 'after_reti' : 'after_retn',
        terminator: addr - 1,
      };
    }
  }

  return { entry: callerPc, heuristic: 'caller', terminator: null };
}

function isDirectInstructionTag(tag) {
  const text = String(tag || '');
  return text.includes('call') || text.includes('jp') || text.includes('jr');
}

function scanLiftedDirectCallers(blocks, target) {
  const rows = [];

  for (const block of getBlockValues(blocks)) {
    for (const instruction of block.instructions || []) {
      if (instruction.target !== target || !isDirectInstructionTag(instruction.tag)) {
        continue;
      }

      rows.push({
        source: 'lifted',
        callerPc: instruction.pc,
        kind: String(instruction.tag),
        target,
        blockStart: block.startPc,
        blockMode: block.mode,
        dasm: instruction.dasm || String(instruction.tag),
      });
    }
  }

  rows.sort((a, b) => a.callerPc - b.callerPc || a.target - b.target);
  return rows;
}

function scanLiftedRangeCallers(blocks, start, endExclusive) {
  const rows = [];

  for (const block of getBlockValues(blocks)) {
    for (const instruction of block.instructions || []) {
      if (
        typeof instruction.target !== 'number' ||
        instruction.target < start ||
        instruction.target >= endExclusive ||
        !isDirectInstructionTag(instruction.tag)
      ) {
        continue;
      }

      rows.push({
        source: 'lifted',
        callerPc: instruction.pc,
        kind: String(instruction.tag),
        target: instruction.target,
        blockStart: block.startPc,
        blockMode: block.mode,
        dasm: instruction.dasm || String(instruction.tag),
      });
    }
  }

  rows.sort((a, b) => a.callerPc - b.callerPc || a.target - b.target);
  return rows;
}

function scanRawDirectCallers(target) {
  const rows = [];
  const lo = target & 0xff;
  const mid = (target >> 8) & 0xff;
  const hi = (target >> 16) & 0xff;

  for (let callerPc = 0; callerPc <= romBytes.length - 4; callerPc += 1) {
    const kind = DIRECT_OPCODES.get(romBytes[callerPc]);
    if (!kind) {
      continue;
    }

    if (
      romBytes[callerPc + 1] !== lo ||
      romBytes[callerPc + 2] !== mid ||
      romBytes[callerPc + 3] !== hi
    ) {
      continue;
    }

    let decoded = null;
    try {
      decoded = decodeInstruction(romBytes, callerPc, 'adl');
    } catch {
      decoded = null;
    }

    rows.push({
      source: 'raw',
      callerPc,
      kind,
      target,
      blockStart: null,
      blockMode: 'adl?',
      dasm: decoded?.dasm || kind,
    });
  }

  rows.sort((a, b) => a.callerPc - b.callerPc || a.target - b.target);
  return rows;
}

function scanRawRangeCallers(start, endExclusive) {
  const rows = [];

  for (let callerPc = 0; callerPc <= romBytes.length - 4; callerPc += 1) {
    const kind = DIRECT_OPCODES.get(romBytes[callerPc]);
    if (!kind) {
      continue;
    }

    const target =
      romBytes[callerPc + 1] |
      (romBytes[callerPc + 2] << 8) |
      (romBytes[callerPc + 3] << 16);

    if (target < start || target >= endExclusive) {
      continue;
    }

    let decoded = null;
    try {
      decoded = decodeInstruction(romBytes, callerPc, 'adl');
    } catch {
      decoded = null;
    }

    rows.push({
      source: 'raw',
      callerPc,
      kind,
      target,
      blockStart: null,
      blockMode: 'adl?',
      dasm: decoded?.dasm || kind,
    });
  }

  rows.sort((a, b) => a.callerPc - b.callerPc || a.target - b.target);
  return rows;
}

function mergeCallerRows(rows) {
  const merged = new Map();

  for (const row of rows) {
    const key = `${row.callerPc}:${row.kind}:${row.target}`;
    const previous = merged.get(key);

    if (!previous) {
      merged.set(key, row);
      continue;
    }

    if (previous.source === 'raw' && row.source === 'lifted') {
      merged.set(key, { ...previous, ...row, source: 'lifted+raw' });
      continue;
    }

    if (previous.source === 'lifted' && row.source === 'raw') {
      merged.set(key, { ...previous, source: 'lifted+raw' });
    }
  }

  return [...merged.values()].sort((a, b) => {
    if (a.callerPc !== b.callerPc) return a.callerPc - b.callerPc;
    if (a.target !== b.target) return a.target - b.target;
    return a.kind.localeCompare(b.kind);
  });
}

function annotateRowsWithParents(rows) {
  return rows.map((row) => {
    const parent = findFunctionEntry(row.callerPc, FUNCTION_BACKSCAN_BYTES);
    return {
      ...row,
      parentEntry: parent.entry,
      parentHeuristic: parent.heuristic,
    };
  });
}

function findLiftedContainingEntry(blocks, pc) {
  for (const block of getBlockValues(blocks)) {
    if ((block.instructions || []).some((instruction) => instruction.pc === pc)) {
      return block.startPc;
    }
  }

  return null;
}

function buildCandidates(rows) {
  const byEntry = new Map();

  for (const row of rows) {
    const existing = byEntry.get(row.parentEntry);
    if (!existing) {
      byEntry.set(row.parentEntry, {
        name: `fn_${hex(row.parentEntry).slice(2)}`,
        entry: row.parentEntry,
        callerRows: [row],
        callerPcs: new Set([row.callerPc]),
        targets: new Set([row.target]),
        kinds: new Set([row.kind]),
        heuristics: new Set([row.parentHeuristic]),
      });
      continue;
    }

    existing.callerRows.push(row);
    existing.callerPcs.add(row.callerPc);
    existing.targets.add(row.target);
    existing.kinds.add(row.kind);
    existing.heuristics.add(row.parentHeuristic);
  }

  return [...byEntry.values()]
    .map((candidate) => ({
      ...candidate,
      callerRows: candidate.callerRows.sort((a, b) => a.callerPc - b.callerPc),
      callerPcs: [...candidate.callerPcs].sort((a, b) => a - b),
      targets: [...candidate.targets].sort((a, b) => a - b),
      kinds: [...candidate.kinds].sort(),
      heuristics: [...candidate.heuristics].sort(),
    }))
    .sort((a, b) => a.entry - b.entry);
}

function findImmediatePreludeEntries(blocks, target) {
  const entries = [];

  for (const block of getBlockValues(blocks)) {
    for (const exit of block.exits || []) {
      if (exit.target !== target) {
        continue;
      }

      if (exit.type !== 'call-return' && exit.type !== 'fallthrough') {
        continue;
      }

      entries.push({
        entry: block.startPc,
        exitType: exit.type,
      });
    }
  }

  entries.sort((a, b) => a.entry - b.entry);
  return entries;
}

function findPreludeVariantsForCandidate(blocks, candidateEntry) {
  const variants = [];
  const seen = new Set();

  const pushVariant = (entry, exitType) => {
    if (typeof entry !== 'number' || entry === candidateEntry || seen.has(entry)) {
      return;
    }

    seen.add(entry);
    variants.push({ entry, exitType });
  };

  for (const prelude of findImmediatePreludeEntries(blocks, candidateEntry)) {
    pushVariant(prelude.entry, prelude.exitType);
  }

  const callerRows = mergeCallerRows([
    ...scanLiftedDirectCallers(blocks, candidateEntry),
    ...scanRawDirectCallers(candidateEntry),
  ]);

  for (const row of callerRows) {
    const containingEntry = findLiftedContainingEntry(blocks, row.callerPc);
    if (containingEntry !== null) {
      pushVariant(containingEntry, `callsite_${row.kind}`);
    }
  }

  variants.sort((a, b) => a.entry - b.entry);
  return variants;
}

async function buildProbeEnv(blocks) {
  const peripherals = createPeripheralBus({
    trace: false,
    pllDelay: 2,
    timerInterrupt: false,
  });
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;

  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = SCREEN_STACK_TOP - HELPER_STACK_BYTES;
  fillSentinel(mem, cpu.sp, HELPER_STACK_BYTES);
  executor.runFrom(OS_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 500,
  });

  cpu.mbase = 0xd0;
  cpu._iy = PROBE_IY;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = SCREEN_STACK_TOP - HELPER_STACK_BYTES;
  fillSentinel(mem, cpu.sp, HELPER_STACK_BYTES);
  executor.runFrom(SET_TEXT_FG_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return {
    executor,
    mem,
    cpu,
    ramSnapshot: new Uint8Array(mem.slice(RAM_START, RAM_END)),
    cpuSnapshot: snapshotCpu(cpu),
    clearedVram: buildClearedVram(),
    lcdSnapshot: executor.lcdMmio
      ? {
          upbase: executor.lcdMmio.upbase,
          control: executor.lcdMmio.control,
        }
      : null,
  };
}

function restoreBaseState(env) {
  env.mem.set(env.ramSnapshot, RAM_START);
  env.mem.set(env.clearedVram, VRAM_BASE);
  restoreCpu(env.cpu, env.cpuSnapshot);

  if (env.executor.lcdMmio && env.lcdSnapshot) {
    env.executor.lcdMmio.upbase = env.lcdSnapshot.upbase;
    env.executor.lcdMmio.control = env.lcdSnapshot.control;
  }
}

function primeBaselineState(env) {
  env.cpu.halted = false;
  env.cpu.iff1 = 0;
  env.cpu.iff2 = 0;
  env.cpu._iy = PROBE_IY;
  env.cpu.a = 0;
  env.cpu.hl = 0;
  env.cpu.f = 0x40;
  env.cpu.sp = SCREEN_STACK_TOP - PROBE_STACK_BYTES;
  fillSentinel(env.mem, env.cpu.sp, PROBE_STACK_BYTES);
}

function executeProbe(env, entry) {
  const uniqueBlocks = new Set();
  const firstBlocks = [];

  const raw = env.executor.runFrom(entry, 'adl', {
    maxSteps: MAX_PROBE_STEPS,
    maxLoopIterations: 500,
    onBlock: (pc) => {
      if (uniqueBlocks.has(pc)) {
        return;
      }

      uniqueBlocks.add(pc);
      if (firstBlocks.length < FIRST_BLOCKS_LIMIT) {
        firstBlocks.push(pc);
      }
    },
  });

  const stats = collectVramStats(env.mem);

  return {
    entry,
    steps: raw.steps,
    termination: raw.termination,
    lastPc: raw.lastPc,
    lastMode: raw.lastMode,
    error: raw.error instanceof Error ? raw.error.message : null,
    vramWrites: stats.vramWrites,
    bbox: stats.bbox,
    bboxWidth: bboxWidth(stats.bbox),
    bboxHeight: bboxHeight(stats.bbox),
    bboxArea: bboxArea(stats.bbox),
    uniqueBlocks: uniqueBlocks.size,
    firstBlocks,
    firstRenderedRow: captureFirstRenderedRow(env.mem, stats.bbox),
  };
}

function seedPreludeState(env, preludeEntry, targetEntry) {
  primeBaselineState(env);

  let reached = false;
  let reachedMode = 'adl';
  let preludeSteps = 0;

  try {
    env.executor.runFrom(preludeEntry, 'adl', {
      maxSteps: MAX_PRELUDE_STEPS,
      maxLoopIterations: 128,
      onBlock: (pc, mode, _meta, step) => {
        preludeSteps = step;
        if (pc === targetEntry) {
          reached = true;
          reachedMode = mode;
          throw PRELUDE_STOP;
        }
      },
    });
  } catch (error) {
    if (error !== PRELUDE_STOP) {
      return {
        reached: false,
        termination: 'prelude_error',
        error: error instanceof Error ? error.message : String(error),
        preludeSteps,
      };
    }
  }

  return {
    reached,
    reachedMode,
    termination: reached ? 'target_reached' : 'prelude_miss',
    error: null,
    preludeSteps,
  };
}

function runBaselineVariant(env, candidate) {
  restoreBaseState(env);
  primeBaselineState(env);

  return {
    candidateName: candidate.name,
    candidateEntry: candidate.entry,
    variant: 'baseline',
    preludeEntry: null,
    preludeExitType: null,
    preludeSteps: 0,
    ...executeProbe(env, candidate.entry),
  };
}

function runPreludeVariant(env, candidate, prelude) {
  restoreBaseState(env);
  const seed = seedPreludeState(env, prelude.entry, candidate.entry);

  if (!seed.reached) {
    return {
      candidateName: candidate.name,
      candidateEntry: candidate.entry,
      variant: 'prelude_call-return',
      preludeEntry: prelude.entry,
      preludeExitType: prelude.exitType,
      preludeSteps: seed.preludeSteps,
      entry: candidate.entry,
      steps: seed.preludeSteps,
      termination: seed.termination,
      lastPc: prelude.entry,
      lastMode: 'adl',
      error: seed.error,
      vramWrites: 0,
      bbox: null,
      bboxWidth: 0,
      bboxHeight: 0,
      bboxArea: 0,
      uniqueBlocks: 0,
      firstBlocks: [],
      firstRenderedRow: null,
    };
  }

  env.mem.set(env.clearedVram, VRAM_BASE);
  env.cpu.halted = false;
  env.cpu.iff1 = 0;
  env.cpu.iff2 = 0;

  return {
    candidateName: candidate.name,
    candidateEntry: candidate.entry,
    variant: 'prelude_call-return',
    preludeEntry: prelude.entry,
    preludeExitType: prelude.exitType,
    preludeSteps: seed.preludeSteps,
    ...executeProbe(env, candidate.entry),
  };
}

function verdictForProbe(result) {
  if (result.vramWrites > 1000 && result.bboxArea > 300) {
    return 'strong';
  }

  if (result.vramWrites > 200) {
    return 'legible';
  }

  if (result.vramWrites > 0) {
    return 'partial';
  }

  if (result.termination === 'error' || result.termination === 'prelude_error') {
    return 'crashes';
  }

  if (result.termination === 'missing_block') {
    return 'missing_block';
  }

  return 'blank';
}

function compareResults(a, b) {
  const aEligible = a.bboxArea > 300;
  const bEligible = b.bboxArea > 300;
  if (aEligible !== bEligible) {
    return bEligible - aEligible;
  }

  if (aEligible && bEligible && a.vramWrites !== b.vramWrites) {
    return b.vramWrites - a.vramWrites;
  }

  if (a.bboxArea !== b.bboxArea) {
    return b.bboxArea - a.bboxArea;
  }

  if (a.vramWrites !== b.vramWrites) {
    return b.vramWrites - a.vramWrites;
  }

  if (a.uniqueBlocks !== b.uniqueBlocks) {
    return b.uniqueBlocks - a.uniqueBlocks;
  }

  if (a.termination !== b.termination) {
    if (a.termination === 'error') return 1;
    if (b.termination === 'error') return -1;
  }

  return a.entry - b.entry;
}

function pickBestResult(results) {
  return [...results].sort(compareResults)[0] ?? null;
}

function buildCandidateResults(env, blocks, candidates) {
  const allResults = [];

  for (const candidate of candidates) {
    allResults.push(runBaselineVariant(env, candidate));

    const preludes = findPreludeVariantsForCandidate(blocks, candidate.entry);
    for (const prelude of preludes) {
      allResults.push(runPreludeVariant(env, candidate, prelude));
    }
  }

  for (const result of allResults) {
    result.verdict = verdictForProbe(result);
  }

  return allResults;
}

function buildBestByCandidate(results) {
  const bestByCandidate = new Map();

  for (const result of results) {
    const previous = bestByCandidate.get(result.candidateEntry);
    if (!previous || compareResults(result, previous) < 0) {
      bestByCandidate.set(result.candidateEntry, result);
    }
  }

  return [...bestByCandidate.values()].sort((a, b) => a.entry - b.entry);
}

function formatMarkdownCode(value) {
  return `\`${value}\``;
}

function renderCallerTable(rows) {
  const lines = [
    '| Caller PC | Kind | Target | Parent entry | Source | Disassembly |',
    '| --- | --- | --- | --- | --- | --- |',
  ];

  if (rows.length === 0) {
    lines.push('| `none` | `-` | `-` | `-` | `-` | `-` |');
    return lines.join('\n');
  }

  for (const row of rows) {
    lines.push(
      `| ${[
        formatMarkdownCode(hex(row.callerPc)),
        formatMarkdownCode(row.kind),
        formatMarkdownCode(hex(row.target)),
        formatMarkdownCode(hex(row.parentEntry)),
        formatMarkdownCode(row.source),
        row.dasm ? `\`${String(row.dasm).replaceAll('`', '\\`')}\`` : '`-`',
      ].join(' | ')} |`,
    );
  }

  return lines.join('\n');
}

function renderCandidateTable(candidates) {
  const lines = [
    '| Name | Entry | Caller count | Targets | Callers | Heuristic |',
    '| --- | --- | ---: | --- | --- | --- |',
  ];

  for (const candidate of candidates) {
    lines.push(
      `| ${[
        formatMarkdownCode(candidate.name),
        formatMarkdownCode(hex(candidate.entry)),
        candidate.callerRows.length,
        formatMarkdownCode(candidate.targets.map((target) => hex(target)).join(', ')),
        formatMarkdownCode(candidate.callerPcs.map((pc) => hex(pc)).join(', ')),
        formatMarkdownCode(candidate.heuristics.join(', ')),
      ].join(' | ')} |`,
    );
  }

  return lines.join('\n');
}

function renderProbeTable(results) {
  const lines = [
    '| Name | Variant | Entry | Prelude | Steps | Termination | VRAM writes | BBox | Unique blocks | Verdict |',
    '| --- | --- | --- | --- | ---: | --- | ---: | --- | ---: | --- |',
  ];

  for (const result of results) {
    const preludeText = result.preludeEntry
      ? `${hex(result.preludeEntry)} (${result.preludeExitType})`
      : 'none';
    lines.push(
      `| ${[
        formatMarkdownCode(result.candidateName),
        formatMarkdownCode(result.variant),
        formatMarkdownCode(hex(result.entry)),
        formatMarkdownCode(preludeText),
        result.steps,
        formatMarkdownCode(result.termination),
        result.vramWrites,
        formatMarkdownCode(formatBbox(result.bbox)),
        result.uniqueBlocks,
        formatMarkdownCode(result.verdict),
      ].join(' | ')} |`,
    );
  }

  return lines.join('\n');
}

function renderBestCandidateTable(results) {
  const lines = [
    '| Name | Entry | Best variant | Steps | Termination | VRAM writes | BBox | Area | Unique blocks | Verdict |',
    '| --- | --- | --- | ---: | --- | ---: | --- | ---: | ---: | --- |',
  ];

  for (const result of results) {
    lines.push(
      `| ${[
        formatMarkdownCode(result.candidateName),
        formatMarkdownCode(hex(result.entry)),
        formatMarkdownCode(result.variant),
        result.steps,
        formatMarkdownCode(result.termination),
        result.vramWrites,
        formatMarkdownCode(formatBbox(result.bbox)),
        result.bboxArea,
        result.uniqueBlocks,
        formatMarkdownCode(result.verdict),
      ].join(' | ')} |`,
    );
  }

  return lines.join('\n');
}

function buildFirstBlocksSection(results) {
  const lines = [
    '## First 15 Unique Blocks',
    '',
  ];

  for (const result of results) {
    lines.push(
      `- ${result.candidateName} ${result.variant} entry=${hex(result.entry)}: ${formatBlocks(result.firstBlocks, FIRST_BLOCKS_LIMIT)}`,
    );
  }

  return lines.join('\n');
}

function buildWinnerSection(winner) {
  const lines = [
    '## Winner',
    '',
  ];

  if (!winner) {
    lines.push('- No probe result produced any usable VRAM evidence.');
    return lines.join('\n');
  }

  lines.push(
    `- Winner: ${winner.candidateName} at ${hex(winner.entry)} via ${winner.variant} (${winner.vramWrites} VRAM writes, ${formatBbox(winner.bbox)}, area=${winner.bboxArea}).`,
  );
  lines.push(
    `- Selection rule: prefer candidates with bbox area > 300, then rank by VRAM writes, bbox area, and block coverage.`,
  );

  if (winner.firstRenderedRow) {
    const row = winner.firstRenderedRow;
    lines.push(
      `- First rendered row: row ${row.row}, cols ${row.startCol}-${row.endCol}.`,
    );
    lines.push('');
    lines.push('```text');
    lines.push(row.words.join(' '));
    lines.push('```');
  } else {
    lines.push('- First rendered row: none.');
  }

  return lines.join('\n');
}

function buildReport(scan, candidates, allResults, bestResults, winner) {
  const exact80Rows = scan.exactRowsByTarget.get(0x08bc80) || [];
  const exact88Rows = scan.exactRowsByTarget.get(0x08bc88) || [];

  const lines = [
    '# Phase 68: MODE Parent Hunt',
    '',
    '## Summary',
    '',
    `- Exact target 0x08bc80 callers: lifted=${scan.exactCounts.get(0x08bc80)?.lifted ?? 0}, raw=${scan.exactCounts.get(0x08bc80)?.raw ?? 0}, merged=${exact80Rows.length}.`,
    `- Exact target 0x08bc88 callers: lifted=${scan.exactCounts.get(0x08bc88)?.lifted ?? 0}, raw=${scan.exactCounts.get(0x08bc88)?.raw ?? 0}, merged=${exact88Rows.length}.`,
    `- Range ${hex(RANGE_START)}..${hex(RANGE_END_EXCLUSIVE - 1)} direct callers: lifted=${scan.rangeCounts.lifted}, raw=${scan.rangeCounts.raw}, merged=${scan.rangeRows.length}.`,
    `- Distinct containing function entries: ${candidates.length}.`,
    winner
      ? `- Winning parent: ${hex(winner.entry)} (${winner.candidateName}) with ${winner.vramWrites} VRAM writes and bbox ${formatBbox(winner.bbox)}.`
      : '- Winning parent: none.',
    '',
    '## Exact Callers: 0x08bc80',
    '',
    renderCallerTable(exact80Rows),
    '',
    '## Exact Callers: 0x08bc88',
    '',
    renderCallerTable(exact88Rows),
    '',
    `## Range Callers: ${hex(RANGE_START)}..${hex(RANGE_END_EXCLUSIVE - 1)}`,
    '',
    renderCallerTable(scan.rangeRows),
    '',
    '## Candidate Parents',
    '',
    renderCandidateTable(candidates),
    '',
    '## Probe Variants',
    '',
    renderProbeTable(allResults),
    '',
    '## Best Result Per Candidate',
    '',
    renderBestCandidateTable(bestResults),
    '',
    buildFirstBlocksSection(bestResults),
    '',
    buildWinnerSection(winner),
  ];

  return `${lines.join('\n')}\n`;
}

function printCallerSummary(label, rows) {
  console.log(`${label}: count=${rows.length}`);
  for (const row of rows) {
    console.log(
      [
        `  caller=${hex(row.callerPc)}`,
        `kind=${row.kind}`,
        `target=${hex(row.target)}`,
        `parent=${hex(row.parentEntry)}`,
        `source=${row.source}`,
      ].join('  '),
    );
  }
}

function printProbeSummary(result) {
  const prelude = result.preludeEntry
    ? `prelude=${hex(result.preludeEntry)}(${result.preludeExitType})`
    : 'prelude=none';
  const extra = result.error ? `  error=${result.error}` : '';

  console.log(
    [
      `${result.candidateName}`,
      `variant=${result.variant}`,
      `entry=${hex(result.entry)}`,
      prelude,
      `steps=${result.steps}`,
      `term=${result.termination}`,
      `vram=${result.vramWrites}`,
      `bbox=${formatBbox(result.bbox)}`,
      `area=${result.bboxArea}`,
      `blocks=${result.uniqueBlocks}`,
      `verdict=${result.verdict}`,
      `first15=${formatBlocks(result.firstBlocks, FIRST_BLOCKS_LIMIT)}`,
    ].join('  ') + extra,
  );
}

async function main() {
  const blocks = await loadBlocks();

  const exactCounts = new Map();
  const exactRowsByTarget = new Map();
  for (const target of EXACT_TARGETS) {
    const lifted = scanLiftedDirectCallers(blocks, target);
    const raw = scanRawDirectCallers(target);
    exactCounts.set(target, { lifted: lifted.length, raw: raw.length });
    exactRowsByTarget.set(target, annotateRowsWithParents(mergeCallerRows([...lifted, ...raw])));
  }

  const rangeLifted = scanLiftedRangeCallers(blocks, RANGE_START, RANGE_END_EXCLUSIVE);
  const rangeRaw = scanRawRangeCallers(RANGE_START, RANGE_END_EXCLUSIVE);
  const rangeRows = annotateRowsWithParents(mergeCallerRows([...rangeLifted, ...rangeRaw]));

  const allCallerRows = annotateRowsWithParents(
    mergeCallerRows([
      ...rangeLifted,
      ...rangeRaw,
      ...EXACT_TARGETS.flatMap((target) => scanLiftedDirectCallers(blocks, target)),
      ...EXACT_TARGETS.flatMap((target) => scanRawDirectCallers(target)),
    ]),
  );

  const candidates = buildCandidates(allCallerRows);
  const env = await buildProbeEnv(blocks);
  const allResults = buildCandidateResults(env, blocks, candidates);
  const bestResults = buildBestByCandidate(allResults);
  const winner = pickBestResult(bestResults);

  const scan = {
    exactCounts,
    exactRowsByTarget,
    rangeCounts: {
      lifted: rangeLifted.length,
      raw: rangeRaw.length,
    },
    rangeRows,
  };

  const report = buildReport(scan, candidates, allResults, bestResults, winner);
  fs.writeFileSync(reportPath, report);

  console.log('=== Phase 68: MODE parent hunt ===');
  console.log(`range=${hex(RANGE_START)}..${hex(RANGE_END_EXCLUSIVE - 1)}`);
  console.log(`candidate_count=${candidates.length}`);
  console.log('');

  for (const target of EXACT_TARGETS) {
    printCallerSummary(`exact ${hex(target)}`, exactRowsByTarget.get(target) || []);
    console.log('');
  }

  printCallerSummary(`range ${hex(RANGE_START)}..${hex(RANGE_END_EXCLUSIVE - 1)}`, rangeRows);
  console.log('');

  console.log('=== Candidate parents ===');
  for (const candidate of candidates) {
    console.log(
      [
        `${candidate.name}`,
        `entry=${hex(candidate.entry)}`,
        `targets=${candidate.targets.map((target) => hex(target)).join(',')}`,
        `callers=${candidate.callerPcs.map((pc) => hex(pc)).join(',')}`,
        `heuristic=${candidate.heuristics.join(',')}`,
      ].join('  '),
    );
  }
  console.log('');

  console.log('=== Probe results ===');
  for (const result of allResults) {
    printProbeSummary(result);
  }
  console.log('');

  console.log('=== Best per candidate ===');
  for (const result of bestResults) {
    console.log(
      [
        `${result.candidateName}`,
        `entry=${hex(result.entry)}`,
        `best=${result.variant}`,
        `vram=${result.vramWrites}`,
        `bbox=${formatBbox(result.bbox)}`,
        `area=${result.bboxArea}`,
        `blocks=${result.uniqueBlocks}`,
        `verdict=${result.verdict}`,
      ].join('  '),
    );
  }
  console.log('');

  if (winner) {
    console.log(
      `WINNER entry=${hex(winner.entry)} name=${winner.candidateName} variant=${winner.variant} vram=${winner.vramWrites} bbox=${formatBbox(winner.bbox)} area=${winner.bboxArea}`,
    );
    if (winner.firstRenderedRow) {
      console.log(
        `WINNER_ROW row=${winner.firstRenderedRow.row} cols=${winner.firstRenderedRow.startCol}-${winner.firstRenderedRow.endCol} data=${winner.firstRenderedRow.words.join(' ')}`,
      );
    }
  } else {
    console.log('WINNER none');
  }

  console.log(`report_path=${reportPath}`);
}

await main();
