#!/usr/bin/env node
// Phase 72: compare the three known OS init entry points from the same boot-only
// snapshot so we can see whether the dispatcher resume entries render more than
// the baseline 0x08c331 path.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romPath = path.join(__dirname, 'ROM.rom');
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const reportPath = path.join(__dirname, 'phase72-os-init-entries-report.md');

const romBytes = fs.readFileSync(romPath);

const BOOT_ENTRY = 0x000000;
const OS_INIT_ENTRY = 0x08c331;
const OS_INIT_RESUME_ENTRY = 0x08c366;
const OS_INIT_PARTIAL_ENTRY = 0x08c33d;
const SET_TEXT_FG_ENTRY = 0x0802b2;
const IY_BASE = 0xd00080;
const INIT_STACK_TOP = 0xd1a87e;
const HELPER_STACK_BYTES = 3;
const PROBE_STACK_BYTES = 12;

const RAM_START = 0x400000;
const RAM_END = 0xe00000;

const VRAM_BASE = 0xd40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;
const VRAM_SENTINEL = 0xaaaa;

const FIRST_BLOCKS_CAPTURE = 20;
const FIRST_BLOCKS_REPORT = 15;
const FIRST_ROW_WORDS = 32;

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

const WATCHES = [
  { label: 'callback', addr: 0xd02ad7, size: 3 },
  { label: 'sysFlag', addr: 0xd0009b, size: 1 },
  { label: 'deepInit', addr: 0xd177ba, size: 1 },
  { label: 'd0058c', addr: 0xd0058c, size: 1 },
];

const VARIANTS = [
  {
    id: 'A',
    shortLabel: 'baseline',
    entry: OS_INIT_ENTRY,
    maxSteps: 10000,
    setup(env) {
      env.cpu.halted = false;
      env.cpu.iff1 = 0;
      env.cpu.iff2 = 0;
      env.cpu.sp = INIT_STACK_TOP - HELPER_STACK_BYTES;
      fillSentinel(env.mem, env.cpu.sp, HELPER_STACK_BYTES);
    },
  },
  {
    id: 'B',
    shortLabel: 'resume_08c366',
    entry: OS_INIT_RESUME_ENTRY,
    maxSteps: 10000,
    setup(env) {
      env.cpu.halted = false;
      env.cpu.iff1 = 0;
      env.cpu.iff2 = 0;
      env.cpu._iy = IY_BASE;
      env.cpu.a = 0;
      env.cpu.hl = 0;
      env.cpu.f = 0x40;
      env.cpu.madl = 1;
      env.cpu.mbase = 0xd0;
      env.mem[IY_BASE + 22] &= 0x7f;
      env.mem[IY_BASE + 29] &= 0xfd;
      env.cpu.sp = INIT_STACK_TOP - PROBE_STACK_BYTES;
      fillSentinel(env.mem, env.cpu.sp, PROBE_STACK_BYTES);
    },
  },
  {
    id: 'C',
    shortLabel: 'partial_08c33d',
    entry: OS_INIT_PARTIAL_ENTRY,
    maxSteps: 10000,
    setup(env) {
      env.cpu.halted = false;
      env.cpu.iff1 = 0;
      env.cpu.iff2 = 0;
      env.cpu._iy = IY_BASE;
      env.cpu.a = 0;
      env.cpu.hl = 0;
      env.cpu.f = 0x40;
      env.cpu.madl = 1;
      env.cpu.mbase = 0xd0;
      env.cpu.sp = INIT_STACK_TOP - PROBE_STACK_BYTES;
      fillSentinel(env.mem, env.cpu.sp, PROBE_STACK_BYTES);
    },
  },
];

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function hexWord(value) {
  return (value & 0xffff).toString(16).padStart(4, '0');
}

function hexSized(value, size) {
  return hex(value, size * 2);
}

function formatBbox(bbox) {
  if (!bbox) {
    return 'none';
  }

  return `r${bbox.minRow}-${bbox.maxRow} c${bbox.minCol}-${bbox.maxCol}`;
}

function formatBlocks(blocks, limit = blocks?.length ?? 0) {
  if (!blocks || blocks.length === 0) {
    return 'none';
  }

  return blocks.slice(0, limit).map((pc) => hex(pc)).join(', ');
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

function readWatchValue(mem, watch) {
  if (watch.size === 1) {
    return mem[watch.addr];
  }

  if (watch.size === 3) {
    return mem[watch.addr] | (mem[watch.addr + 1] << 8) | (mem[watch.addr + 2] << 16);
  }

  throw new Error(`Unsupported watch size: ${watch.size}`);
}

function captureWatchSnapshot(mem) {
  return Object.fromEntries(
    WATCHES.map((watch) => {
      const value = readWatchValue(mem, watch);
      return [
        watch.label,
        {
          addr: watch.addr,
          size: watch.size,
          value,
          hex: hexSized(value, watch.size),
        },
      ];
    }),
  );
}

function diffWatchSnapshots(before, after) {
  return WATCHES.map((watch) => ({
    label: watch.label,
    addr: watch.addr,
    size: watch.size,
    before: before[watch.label].value,
    beforeHex: before[watch.label].hex,
    after: after[watch.label].value,
    afterHex: after[watch.label].hex,
    changed: before[watch.label].value !== after[watch.label].value,
  }));
}

function captureFinalCpu(cpu) {
  return {
    a: cpu.a,
    hl: cpu.hl,
    bc: cpu.bc,
    de: cpu.de,
    ix: cpu.ix,
    iy: cpu.iy,
    sp: cpu.sp,
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

  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  return {
    executor,
    mem,
    cpu,
    boot,
    ramSnapshot: new Uint8Array(mem.slice(RAM_START, RAM_END)),
    cpuSnapshot: snapshotCpu(cpu),
    clearedVram: buildClearedVram(),
    lcdSnapshot: executor.lcdMmio
      ? {
          upbase: executor.lcdMmio.upbase,
          control: executor.lcdMmio.control,
        }
      : null,
    watchAfterBoot: captureWatchSnapshot(mem),
    cpuAfterBoot: captureFinalCpu(cpu),
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

function runVariant(env, variant) {
  restoreBaseState(env);

  const watchBefore = captureWatchSnapshot(env.mem);
  variant.setup(env);

  const uniqueBlocks = new Set();
  const firstBlocks = [];

  const raw = env.executor.runFrom(variant.entry, 'adl', {
    maxSteps: variant.maxSteps,
    maxLoopIterations: 500,
    onBlock: (pc) => {
      if (uniqueBlocks.has(pc)) {
        return;
      }

      uniqueBlocks.add(pc);
      if (firstBlocks.length < FIRST_BLOCKS_CAPTURE) {
        firstBlocks.push(pc);
      }
    },
  });

  const vram = collectVramStats(env.mem);
  const watchAfter = captureWatchSnapshot(env.mem);

  return {
    id: variant.id,
    shortLabel: variant.shortLabel,
    entry: variant.entry,
    steps: raw.steps,
    termination: raw.termination,
    lastPc: raw.lastPc,
    lastMode: raw.lastMode,
    error: raw.error instanceof Error ? raw.error.message : null,
    vramWrites: vram.vramWrites,
    bbox: vram.bbox,
    uniqueBlocks: uniqueBlocks.size,
    firstBlocks,
    firstRenderedRow: captureFirstRenderedRow(env.mem, vram.bbox),
    finalCpu: captureFinalCpu(env.cpu),
    watchBefore,
    watchAfter,
    watchDiffs: diffWatchSnapshots(watchBefore, watchAfter),
  };
}

function compareByVram(a, b) {
  if (b.vramWrites !== a.vramWrites) {
    return b.vramWrites - a.vramWrites;
  }

  if (b.uniqueBlocks !== a.uniqueBlocks) {
    return b.uniqueBlocks - a.uniqueBlocks;
  }

  if (a.termination !== b.termination) {
    if (a.termination === 'error') return 1;
    if (b.termination === 'error') return -1;
  }

  return a.id.localeCompare(b.id);
}

function formatMarkdownCode(value) {
  return `\`${value}\``;
}

function formatWatchDiffs(diffs) {
  return diffs
    .map((diff) => `${diff.label} ${diff.beforeHex} -> ${diff.afterHex}${diff.changed ? '' : ' (same)'}`)
    .join('; ');
}

function buildComparisonTable(results) {
  const lines = [
    '| Variant | Entry | Steps | Termination | Last PC | VRAM writes | BBox | Unique blocks | callback | sysFlag | deepInit | D0058C |',
    '| --- | --- | ---: | --- | --- | ---: | --- | ---: | --- | --- | --- | --- |',
  ];

  for (const result of results) {
    lines.push(
      `| ${[
        formatMarkdownCode(result.id),
        formatMarkdownCode(hex(result.entry)),
        result.steps,
        formatMarkdownCode(result.termination),
        formatMarkdownCode(hex(result.lastPc ?? 0)),
        result.vramWrites,
        formatMarkdownCode(formatBbox(result.bbox)),
        result.uniqueBlocks,
        formatMarkdownCode(result.watchAfter.callback.hex),
        formatMarkdownCode(result.watchAfter.sysFlag.hex),
        formatMarkdownCode(result.watchAfter.deepInit.hex),
        formatMarkdownCode(result.watchAfter.d0058c.hex),
      ].join(' | ')} |`,
    );
  }

  return lines.join('\n');
}

function buildPerVariantSection(results) {
  const lines = [
    '## Per-Variant Summary',
    '',
  ];

  for (const result of results) {
    lines.push(`### Variant ${result.id}`);
    lines.push('');
    lines.push(
      `- Entry ${hex(result.entry)} ran ${result.steps} steps and terminated as ${formatMarkdownCode(result.termination)} at ${formatMarkdownCode(hex(result.lastPc ?? 0))}.`,
    );
    lines.push(
      `- VRAM writes: ${result.vramWrites}. Bounding box: ${formatMarkdownCode(formatBbox(result.bbox))}. Unique blocks: ${result.uniqueBlocks}.`,
    );
    lines.push(
      `- Final CPU: A=${hex(result.finalCpu.a, 2)} HL=${hex(result.finalCpu.hl)} BC=${hex(result.finalCpu.bc)} DE=${hex(result.finalCpu.de)} IX=${hex(result.finalCpu.ix)} IY=${hex(result.finalCpu.iy)} SP=${hex(result.finalCpu.sp)}.`,
    );
    lines.push(`- Watched RAM: ${formatWatchDiffs(result.watchDiffs)}.`);
    lines.push('');
  }

  return lines.join('\n');
}

function buildFirstBlocksSection(results) {
  const lines = [
    '## First 15 Blocks',
    '',
  ];

  for (const result of results) {
    lines.push(`- ${result.id}: ${formatBlocks(result.firstBlocks, FIRST_BLOCKS_REPORT)}`);
  }

  return lines.join('\n');
}

function buildRankingSection(results) {
  const ranked = [...results].sort(compareByVram);
  const lines = [
    '## Rank By VRAM Writes',
    '',
    '| Rank | Variant | Entry | VRAM writes | BBox | Unique blocks | Termination |',
    '| ---: | --- | --- | ---: | --- | ---: | --- |',
  ];

  for (let index = 0; index < ranked.length; index += 1) {
    const result = ranked[index];
    lines.push(
      `| ${[
        index + 1,
        formatMarkdownCode(result.id),
        formatMarkdownCode(hex(result.entry)),
        result.vramWrites,
        formatMarkdownCode(formatBbox(result.bbox)),
        result.uniqueBlocks,
        formatMarkdownCode(result.termination),
      ].join(' | ')} |`,
    );
  }

  return {
    ranked,
    markdown: lines.join('\n'),
  };
}

function buildRenderedRowSection(results) {
  const rendered = results.filter(
    (result) => result.vramWrites > 0 && result.firstRenderedRow,
  );

  const lines = [
    '## First Rendered Row Hex Dump',
    '',
  ];

  if (rendered.length === 0) {
    lines.push('- No variant wrote any non-sentinel VRAM cells.');
    return lines.join('\n');
  }

  for (const result of rendered) {
    const row = result.firstRenderedRow;
    lines.push(
      `- Variant ${result.id}: row ${row.row}, cols ${row.startCol}-${row.endCol}.`,
    );
    lines.push('');
    lines.push('```text');
    lines.push(row.words.join(' '));
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}

function buildVerdictSection(results) {
  const baseline = results.find((result) => result.id === 'A');
  const unlocks = results.filter(
    (result) => result.id !== 'A' && result.vramWrites > (baseline?.vramWrites ?? 0),
  );
  const buttonCandidates = results.filter((result) => result.vramWrites > 1000);

  const lines = [
    '## Verdict',
    '',
  ];

  if (!baseline) {
    lines.push('- Baseline A result is missing.');
  } else {
    lines.push(
      `- Baseline A (${hex(baseline.entry)}) produced ${baseline.vramWrites} VRAM writes and ${baseline.uniqueBlocks} unique blocks.`,
    );
  }

  if (unlocks.length === 0) {
    lines.push('- Neither Variant B nor Variant C unlocked rendering beyond Variant A.');
  } else {
    lines.push(
      `- Rendering beyond A: ${unlocks.map((result) => `Variant ${result.id} (${hex(result.entry)}) -> ${result.vramWrites} writes`).join('; ')}.`,
    );
  }

  if (buttonCandidates.length === 0) {
    lines.push('- No variant crossed the `> 1000` VRAM-write browser-shell threshold.');
  } else {
    lines.push(
      `- Browser-shell button recommendation: ${buttonCandidates.map((result) => `btnP72_${result.id} -> showScreen(${hex(result.entry)}, 'adl', 'P72 ${result.id} ${hex(result.entry).slice(2)}', 200000)`).join('; ')}.`,
    );
  }

  return lines.join('\n');
}

function buildReport(env, results) {
  const ranking = buildRankingSection(results);

  const lines = [
    '# Phase 72: OS Init Dispatch Entry Probes',
    '',
    '## Summary',
    '',
    `- Boot baseline captured immediately after \`${hex(BOOT_ENTRY)}\` and before any manual OS init rerun.`,
    `- Boot result: ${env.boot.steps} steps, ${formatMarkdownCode(env.boot.termination)} at ${formatMarkdownCode(hex(env.boot.lastPc ?? 0))}.`,
    `- Boot watch state: callback=${formatMarkdownCode(env.watchAfterBoot.callback.hex)}, sysFlag=${formatMarkdownCode(env.watchAfterBoot.sysFlag.hex)}, deepInit=${formatMarkdownCode(env.watchAfterBoot.deepInit.hex)}, D0058C=${formatMarkdownCode(env.watchAfterBoot.d0058c.hex)}.`,
    '',
    buildPerVariantSection(results),
    '',
    '## Comparison Table',
    '',
    buildComparisonTable(results),
    '',
    buildFirstBlocksSection(results),
    '',
    ranking.markdown,
    '',
    buildRenderedRowSection(results),
    '',
    buildVerdictSection(results),
  ];

  return `${lines.join('\n')}\n`;
}

function printVariantSummary(result) {
  const row =
    result.firstRenderedRow
      ? `row=${result.firstRenderedRow.row} cols=${result.firstRenderedRow.startCol}-${result.firstRenderedRow.endCol}`
      : 'row=none';
  const extra = result.error ? ` error=${result.error}` : '';

  console.log(
    [
      `VARIANT ${result.id}`,
      `entry=${hex(result.entry)}`,
      `steps=${result.steps}`,
      `term=${result.termination}`,
      `lastPc=${hex(result.lastPc ?? 0)}`,
      `vram=${result.vramWrites}`,
      `bbox=${formatBbox(result.bbox)}`,
      `blocks=${result.uniqueBlocks}`,
      row,
      `first20=${formatBlocks(result.firstBlocks, FIRST_BLOCKS_CAPTURE)}`,
    ].join('  ') + extra,
  );

  console.log(
    [
      `CPU ${result.id}`,
      `A=${hex(result.finalCpu.a, 2)}`,
      `HL=${hex(result.finalCpu.hl)}`,
      `BC=${hex(result.finalCpu.bc)}`,
      `DE=${hex(result.finalCpu.de)}`,
      `IX=${hex(result.finalCpu.ix)}`,
      `IY=${hex(result.finalCpu.iy)}`,
      `SP=${hex(result.finalCpu.sp)}`,
    ].join('  '),
  );

  console.log(
    `WATCH ${result.id} ${formatWatchDiffs(result.watchDiffs)}`,
  );

  if (result.firstRenderedRow) {
    console.log(
      `ROW ${result.id} ${result.firstRenderedRow.words.join(' ')}`,
    );
  }
}

async function main() {
  const blocks = await loadBlocks();
  const env = await buildProbeEnv(blocks);
  const results = VARIANTS.map((variant) => runVariant(env, variant));
  const report = buildReport(env, results);
  fs.writeFileSync(reportPath, report);

  console.log('=== Phase 72: OS init entry probes ===');
  console.log(
    `BOOT steps=${env.boot.steps} term=${env.boot.termination} lastPc=${hex(env.boot.lastPc ?? 0)} callback=${env.watchAfterBoot.callback.hex} sysFlag=${env.watchAfterBoot.sysFlag.hex} deepInit=${env.watchAfterBoot.deepInit.hex} d0058c=${env.watchAfterBoot.d0058c.hex}`,
  );
  console.log('');

  for (const result of results) {
    printVariantSummary(result);
    console.log('');
  }

  console.log('=== Rank by VRAM writes ===');
  for (const result of [...results].sort(compareByVram)) {
    console.log(
      `${result.id}  entry=${hex(result.entry)}  vram=${result.vramWrites}  bbox=${formatBbox(result.bbox)}  blocks=${result.uniqueBlocks}  term=${result.termination}`,
    );
  }
  console.log('');

  const buttonCandidates = results.filter((result) => result.vramWrites > 1000);
  console.log('=== Browser-shell candidates (>1000 VRAM writes) ===');
  if (buttonCandidates.length === 0) {
    console.log('none');
  } else {
    for (const result of buttonCandidates) {
      console.log(
        `btnP72_${result.id} -> showScreen(${hex(result.entry)}, 'adl', 'P72 ${result.id} ${hex(result.entry).slice(2)}', 200000)`,
      );
    }
  }
  console.log('');
  console.log(`report=${path.basename(reportPath)}`);
}

await main();
