#!/usr/bin/env node
// Phase 69: batch-probe the first 25 unique containing functions for the
// remaining 0x0a1cac caller inventory and harvest the best rendering screens.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romPath = path.join(__dirname, 'ROM.rom');
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const entryListPath = path.join(__dirname, 'phase69-entry-list.json');
const browserShellPath = path.join(__dirname, 'browser-shell.html');
const reportPath = path.join(__dirname, 'phase69-batch-report.md');

const romBytes = fs.readFileSync(romPath);

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

const FIRST_BLOCKS_LIMIT = 10;
const LEGIBLE_WRITES_THRESHOLD = 200;
const LEGIBLE_AREA_THRESHOLD = 400;

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

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function parseHex(value) {
  return Number.parseInt(String(value), 16);
}

function formatBbox(bbox) {
  if (!bbox) {
    return 'none';
  }

  return `r${bbox.minRow}-${bbox.maxRow} c${bbox.minCol}-${bbox.maxCol}`;
}

function bboxArea(bbox) {
  if (!bbox) {
    return 0;
  }

  return (bbox.maxRow - bbox.minRow + 1) * (bbox.maxCol - bbox.minCol + 1);
}

function formatBlocks(blocks, limit = blocks?.length ?? 0) {
  if (!blocks || blocks.length === 0) {
    return 'none';
  }

  return blocks.slice(0, limit).map((pc) => hex(pc)).join(', ');
}

function loadEntryList() {
  const rows = JSON.parse(fs.readFileSync(entryListPath, 'utf8'));
  return rows.map((row) => ({
    callerPc: parseHex(row.callerPc),
    functionEntry: parseHex(row.functionEntry),
    heuristic: row.heuristic,
  }));
}

function extractExistingShowScreenEntries() {
  const html = fs.readFileSync(browserShellPath, 'utf8');
  const seen = new Set();

  for (const match of html.matchAll(/showScreen\((0x[0-9a-fA-F]+)/g)) {
    seen.add(parseHex(match[1]));
  }

  return seen;
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

function runProbe(env, functionEntry) {
  restoreBaseState(env);

  env.cpu.halted = false;
  env.cpu.iff1 = 0;
  env.cpu.iff2 = 0;
  env.cpu._iy = PROBE_IY;
  env.cpu.f = 0x40;
  env.cpu.sp = SCREEN_STACK_TOP - PROBE_STACK_BYTES;
  fillSentinel(env.mem, env.cpu.sp, PROBE_STACK_BYTES);

  const uniqueBlocks = new Set();
  const firstBlocks = [];

  const raw = env.executor.runFrom(functionEntry, 'adl', {
    maxSteps: 5000,
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
    functionEntry,
    steps: raw.steps,
    termination: raw.termination,
    lastPc: raw.lastPc,
    lastMode: raw.lastMode,
    error: raw.error instanceof Error ? raw.error.message : null,
    vramWrites: stats.vramWrites,
    bbox: stats.bbox,
    bboxArea: bboxArea(stats.bbox),
    uniqueBlocks: uniqueBlocks.size,
    firstBlocks,
  };
}

function compareRuns(a, b) {
  if (b.vramWrites !== a.vramWrites) {
    return b.vramWrites - a.vramWrites;
  }

  if (b.bboxArea !== a.bboxArea) {
    return b.bboxArea - a.bboxArea;
  }

  if (b.uniqueBlocks !== a.uniqueBlocks) {
    return b.uniqueBlocks - a.uniqueBlocks;
  }

  if (a.termination !== b.termination) {
    if (a.termination === 'error') return 1;
    if (b.termination === 'error') return -1;
  }

  return a.functionEntry - b.functionEntry;
}

function verdictForProbe(result, existingEntries) {
  if (result.vramWrites === 0) {
    if (result.termination === 'error') {
      return 'crashes';
    }

    if (result.termination === 'missing_block') {
      return 'missing_block';
    }

    return 'blank';
  }

  if (result.vramWrites > LEGIBLE_WRITES_THRESHOLD && result.bboxArea > LEGIBLE_AREA_THRESHOLD) {
    return existingEntries.has(result.functionEntry) ? 'legible_known' : 'legible_new';
  }

  return 'partial';
}

function formatMarkdownCode(value) {
  return `\`${value}\``;
}

function renderEntryTable(results) {
  const lines = [
    '| Rank | Caller PC | Function entry | Heuristic | Steps | Termination | VRAM writes | BBox | Area | Unique blocks | Verdict |',
    '| ---: | --- | --- | --- | ---: | --- | ---: | --- | ---: | ---: | --- |',
  ];

  for (let index = 0; index < results.length; index += 1) {
    const result = results[index];
    lines.push(
      `| ${[
        index + 1,
        formatMarkdownCode(hex(result.callerPc)),
        formatMarkdownCode(hex(result.functionEntry)),
        formatMarkdownCode(result.heuristic),
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

function buildTopRankersSection(results) {
  const topRankers = results.slice(0, 10);
  const lines = [
    '## Top 10 Rankers',
    '',
  ];

  if (topRankers.length === 0) {
    lines.push('- No probe results.');
    return lines.join('\n');
  }

  for (const result of topRankers) {
    lines.push(
      `- caller=${hex(result.callerPc)} function=${hex(result.functionEntry)} vram=${result.vramWrites} bbox=${formatBbox(result.bbox)} area=${result.bboxArea} first10=${formatBlocks(result.firstBlocks, 10)}`,
    );
  }

  return lines.join('\n');
}

function makeButtonId(result) {
  return `btnP69_${hex(result.functionEntry).slice(2)}`;
}

function makeButtonLabel(result) {
  return `P69 ${hex(result.functionEntry).slice(2)}`;
}

function buildRecommendationSection(candidates) {
  const lines = [
    '## Recommended Browser-Shell Wiring',
    '',
  ];

  if (candidates.length === 0) {
    lines.push('- No new legible screens cleared the wiring threshold.');
    return lines.join('\n');
  }

  for (const result of candidates) {
    lines.push(
      `- ${makeButtonId(result)}: label="${makeButtonLabel(result)}", showScreen(${hex(result.functionEntry)}, 'adl', 'P69 ${hex(result.functionEntry).slice(2)}', 200000)`,
    );
  }

  return lines.join('\n');
}

function buildReport(results, candidates, existingEntries) {
  const legible = results.filter(
    (result) =>
      result.vramWrites > LEGIBLE_WRITES_THRESHOLD &&
      result.bboxArea > LEGIBLE_AREA_THRESHOLD,
  );
  const newLegible = legible.filter((result) => !existingEntries.has(result.functionEntry));

  const lines = [
    '# Phase 69: Batch Probes For Untested 0x0a1cac Callers',
    '',
    '## Summary',
    '',
    `- Probed ${results.length} distinct containing-function entries harvested from the Phase 63 caller inventory.`,
    `- Legible threshold: \`vramWrites > ${LEGIBLE_WRITES_THRESHOLD}\` and \`bbox area > ${LEGIBLE_AREA_THRESHOLD}\`.`,
    `- Legible results: ${legible.length}.`,
    `- New legible results not already wired in the current browser shell: ${newLegible.length}.`,
    '',
    '## Per-Entry Results',
    '',
    renderEntryTable(results),
    '',
    buildTopRankersSection(results),
    '',
    '## Legible Screens',
    '',
    newLegible.length === 0
      ? '- None.'
      : newLegible
          .map(
            (result) =>
              `- caller=${hex(result.callerPc)} function=${hex(result.functionEntry)} writes=${result.vramWrites} bbox=${formatBbox(result.bbox)} area=${result.bboxArea}`,
          )
          .join('\n'),
    '',
    buildRecommendationSection(candidates),
  ];

  return `${lines.join('\n')}\n`;
}

function printRunSummary(result) {
  const extra = result.error ? ` error=${result.error}` : '';
  console.log(
    [
      `caller=${hex(result.callerPc)}`,
      `entry=${hex(result.functionEntry)}`,
      `heuristic=${result.heuristic}`,
      `steps=${result.steps}`,
      `term=${result.termination}`,
      `vram=${result.vramWrites}`,
      `bbox=${formatBbox(result.bbox)}`,
      `area=${result.bboxArea}`,
      `blocks=${result.uniqueBlocks}`,
      `verdict=${result.verdict}`,
      `first10=${formatBlocks(result.firstBlocks, 10)}`,
    ].join('  ') + extra,
  );
}

async function main() {
  const entries = loadEntryList();
  const existingEntries = extractExistingShowScreenEntries();
  const blocks = await loadBlocks();
  const env = await buildProbeEnv(blocks);
  const results = [];

  console.log('=== Phase 69: batch probes for untested 0x0a1cac callers ===');
  console.log(`entry_count=${entries.length}`);
  console.log('');

  for (const row of entries) {
    const probe = runProbe(env, row.functionEntry);
    const result = {
      ...row,
      ...probe,
    };
    result.verdict = verdictForProbe(result, existingEntries);
    results.push(result);
    printRunSummary(result);
  }

  results.sort(compareRuns);

  const candidates = results
    .filter(
      (result) =>
        result.vramWrites > LEGIBLE_WRITES_THRESHOLD &&
        result.bboxArea > LEGIBLE_AREA_THRESHOLD &&
        !existingEntries.has(result.functionEntry),
    )
    .slice(0, 5);

  console.log('');
  console.log('=== Top 5 new legible candidates ===');
  for (const result of candidates) {
    console.log(
      `${makeButtonId(result)}  entry=${hex(result.functionEntry)}  caller=${hex(result.callerPc)}  vram=${result.vramWrites}  bbox=${formatBbox(result.bbox)}  area=${result.bboxArea}`,
    );
  }

  fs.writeFileSync(reportPath, buildReport(results, candidates, existingEntries));

  console.log('');
  console.log(`report=${path.basename(reportPath)}`);
}

await main();
