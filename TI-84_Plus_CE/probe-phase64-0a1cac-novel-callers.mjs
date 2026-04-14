#!/usr/bin/env node
// Phase 64: probe the novel 0x0a1cac caller families discovered in Phase 63.
// This follows the Phase 62 harness shape: full boot, OS init, SetTextFgColor,
// then direct entry probes with VRAM stats and block coverage capture.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romPath = path.join(__dirname, 'ROM.rom');
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const reportPath = path.join(__dirname, 'phase64-novel-callers-report.md');

const romBytes = fs.readFileSync(romPath);

const ENTRIES = [
  { name: 'os_compat', entry: 0x0baa1f, note: '0x0BAA2D caller - OS/App compat warning' },
  { name: 'self_test_hub', entry: 0x04697c, note: '0x046983 caller - Self-Test/Diagnostics hub' },
  { name: 'keyboard_test', entry: 0x046188, note: 'hw diag: Keyboard Test' },
  { name: 'test_halt', entry: 0x046222, note: 'hw diag: Test Halt. Press a key.' },
  { name: 'flash_test', entry: 0x046272, note: 'hw diag: FLASH System Test' },
  { name: 'mode_screen', entry: 0x08bc88, note: 'MODE settings screen (HIGHEST VALUE)' },
  { name: 'solver_prompt', entry: 0x06b004, note: 'Solver: Upper Limit?/Left Bound?/etc' },
];

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

function hexWord(value) {
  return (value & 0xffff).toString(16).padStart(4, '0');
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

function getBlockValues(blocks) {
  return Array.isArray(blocks) ? blocks : Object.values(blocks);
}

// Same raw backscan heuristic used in probe-caller-hunt.mjs.
function findFunctionEntry(callerPc, scanBackBytes = 0x100) {
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

function findLiftedContainingEntry(blocks, pc) {
  for (const block of getBlockValues(blocks)) {
    if ((block.instructions || []).some((instruction) => instruction.pc === pc)) {
      return block.startPc;
    }
  }

  return null;
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

function runProbe(env, entry) {
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

  const raw = env.executor.runFrom(entry, 'adl', {
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
    entry,
    steps: raw.steps,
    termination: raw.termination,
    lastPc: raw.lastPc,
    lastMode: raw.lastMode,
    error: raw.error instanceof Error ? raw.error.message : null,
    vramWrites: stats.vramWrites,
    bbox: stats.bbox,
    uniqueBlocks: uniqueBlocks.size,
    firstBlocks,
    firstRenderedRow: captureFirstRenderedRow(env.mem, stats.bbox),
  };
}

function compareRuns(a, b) {
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

  return a.entry - b.entry;
}

function verdictForProbe(result) {
  if (result.vramWrites > 200) {
    return 'legible';
  }

  if (result.vramWrites > 0) {
    return 'partial';
  }

  if (result.termination === 'error') {
    return 'crashes';
  }

  if (result.termination === 'missing_block') {
    return 'missing_block';
  }

  return 'blank';
}

function buildVariants(blocks, family) {
  const variants = [];
  const seen = new Set();

  const pushVariant = (kind, entry, note) => {
    if (typeof entry !== 'number' || seen.has(entry)) {
      return;
    }

    seen.add(entry);
    variants.push({ kind, entry, note });
  };

  pushVariant('anchor', family.entry, 'probe the supplied anchor directly');

  const backscan = findFunctionEntry(family.entry);
  if (backscan.entry !== family.entry) {
    pushVariant(
      'backscan',
      backscan.entry,
      `raw RET backscan (${backscan.heuristic}) from ${hex(family.entry)}`,
    );
  }

  const liftedEntry = findLiftedContainingEntry(blocks, family.entry);
  if (liftedEntry !== null && liftedEntry !== family.entry) {
    pushVariant(
      'lifted_block',
      liftedEntry,
      `lifted block containing ${hex(family.entry)}`,
    );
  }

  for (const pred of findImmediatePreludeEntries(blocks, family.entry)) {
    pushVariant(
      `prelude_${pred.exitType}`,
      pred.entry,
      `${pred.exitType} predecessor into ${hex(family.entry)}`,
    );
  }

  return variants;
}

function formatMarkdownCode(value) {
  return `\`${value}\``;
}

function renderEntryTable(results) {
  const lines = [
    '| Name | Variant | Entry | Steps | Termination | VRAM writes | BBox | Unique blocks | Verdict |',
    '| --- | --- | --- | ---: | --- | ---: | --- | ---: | --- |',
  ];

  for (const result of results) {
    lines.push(
      `| ${[
        formatMarkdownCode(result.name),
        formatMarkdownCode(result.variantKind),
        formatMarkdownCode(hex(result.entry)),
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

function buildRanking(bestByFamily) {
  const ranked = [...bestByFamily.values()].sort(compareRuns);
  const lines = [
    '| Rank | Name | Best variant | Entry | VRAM writes | BBox | Unique blocks | Termination |',
    '| ---: | --- | --- | --- | ---: | --- | ---: | --- |',
  ];

  for (let index = 0; index < ranked.length; index += 1) {
    const result = ranked[index];
    lines.push(
      `| ${[
        index + 1,
        formatMarkdownCode(result.name),
        formatMarkdownCode(result.variantKind),
        formatMarkdownCode(hex(result.entry)),
        result.vramWrites,
        formatMarkdownCode(formatBbox(result.bbox)),
        result.uniqueBlocks,
        formatMarkdownCode(result.termination),
      ].join(' | ')} |`,
    );
  }

  return { ranked, table: lines.join('\n') };
}

function buildTopBlocksSection(ranked) {
  const topThree = ranked.slice(0, 3);
  const lines = [
    '## First 10 Blocks For Top 3 Rankers',
    '',
  ];

  if (topThree.length === 0) {
    lines.push('- No rankers.');
    return lines.join('\n');
  }

  for (const result of topThree) {
    lines.push(
      `- ${result.name} ${result.variantKind} entry=${hex(result.entry)}: ${formatBlocks(result.firstBlocks, 10)}`,
    );
  }

  return lines.join('\n');
}

function buildRenderedRowsSection(bestByFamily) {
  const rendered = [...bestByFamily.values()].filter(
    (result) => result.vramWrites > 0 && result.firstRenderedRow,
  );

  const lines = [
    '## First Rendered VRAM Row Hex Dumps',
    '',
  ];

  if (rendered.length === 0) {
    lines.push('- No family produced any rendered VRAM row.');
    return lines.join('\n');
  }

  for (const result of rendered) {
    const row = result.firstRenderedRow;
    lines.push(
      `- ${result.name} ${result.variantKind} entry=${hex(result.entry)} row=${row.row} cols=${row.startCol}-${row.endCol}`,
    );
    lines.push('');
    lines.push('```text');
    lines.push(row.words.join(' '));
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}

function buildVerdictSection(bestByFamily) {
  const bestResults = [...bestByFamily.values()].sort(compareRuns);
  const legible = bestResults.filter((result) => result.vramWrites > 200);
  const partial = bestResults.filter(
    (result) => result.vramWrites > 0 && result.vramWrites <= 200,
  );
  const missed = bestResults.filter((result) => result.vramWrites === 0);

  const lines = [
    '## Verdict',
    '',
  ];

  if (legible.length === 0) {
    lines.push('- Legible screens: none.');
  } else {
    lines.push(
      `- Legible screens: ${legible.map((result) => `${result.name} -> ${hex(result.entry)} (${result.vramWrites} writes, ${result.variantKind})`).join('; ')}.`,
    );
  }

  if (partial.length === 0) {
    lines.push('- Small / partial renders: none.');
  } else {
    lines.push(
      `- Small / partial renders: ${partial.map((result) => `${result.name} -> ${hex(result.entry)} (${result.vramWrites} writes, ${result.variantKind})`).join('; ')}.`,
    );
  }

  if (missed.length === 0) {
    lines.push('- Misses / blanks: none.');
  } else {
    lines.push(
      `- Misses / blanks: ${missed.map((result) => `${result.name} -> ${hex(result.entry)} (${result.termination}, ${result.variantKind})`).join('; ')}.`,
    );
  }

  if (legible.length > 0) {
    lines.push(
      `- Recommended next step: wire browser-shell buttons for ${legible.map((result) => result.name).join(', ')} using the best-rendering entries above.`,
    );
  } else {
    lines.push('- Recommended next step: keep the report-only evidence and escalate to wider predecessor-chain probes.');
  }

  if (missed.length > 0) {
    lines.push(
      '- Families that still miss likely need a larger function root or extra register / stack priming beyond the Phase 62 harness.',
    );
  }

  return lines.join('\n');
}

function buildReport(results) {
  const sortedResults = [...results].sort((a, b) => {
    const nameOrder = a.name.localeCompare(b.name);
    if (nameOrder !== 0) {
      return nameOrder;
    }

    return a.entry - b.entry || a.variantKind.localeCompare(b.variantKind);
  });

  const bestByFamily = new Map();
  for (const result of sortedResults) {
    const previous = bestByFamily.get(result.name);
    if (!previous || compareRuns(result, previous) < 0) {
      bestByFamily.set(result.name, result);
    }
  }

  const ranking = buildRanking(bestByFamily);
  const totalRendered = sortedResults.filter((result) => result.vramWrites > 0).length;
  const buttonCandidates = ranking.ranked.filter((result) => result.vramWrites > 200);

  const lines = [
    '# Phase 64: Novel 0x0a1cac Caller Probes',
    '',
    '## Summary',
    '',
    `- Probed ${ENTRIES.length} high-value caller families from the Phase 63 0x0a1cac inventory.`,
    `- Captured ${sortedResults.length} total probe variants across direct anchors, RET backscans, lifted containing blocks, and immediate preludes.`,
    `- ${totalRendered} probe variant(s) wrote to VRAM.`,
    `- ${buttonCandidates.length} family best-result(s) crossed the Phase 64 browser-shell button threshold (\`vramWrites > 200\`).`,
    '',
    '## Per-Entry Results',
    '',
    renderEntryTable(sortedResults),
    '',
    '## Largest VRAM Renders',
    '',
    ranking.table,
    '',
    buildTopBlocksSection(ranking.ranked),
    '',
    buildRenderedRowsSection(bestByFamily),
    '',
    buildVerdictSection(bestByFamily),
  ];

  return `${lines.join('\n')}\n`;
}

function printRunSummary(result) {
  const extra = result.error ? ` error=${result.error}` : '';
  console.log(
    [
      `${result.name} [${result.variantKind}]`,
      `entry=${hex(result.entry)}`,
      `steps=${result.steps}`,
      `term=${result.termination}`,
      `vram=${result.vramWrites}`,
      `bbox=${formatBbox(result.bbox)}`,
      `blocks=${result.uniqueBlocks}`,
      `verdict=${result.verdict}`,
      `first15=${formatBlocks(result.firstBlocks)}`,
    ].join('  ') + extra,
  );
}

async function main() {
  const blocks = await loadBlocks();
  const env = await buildProbeEnv(blocks);
  const results = [];

  console.log('=== Phase 64: probes for novel 0x0a1cac caller families ===');
  console.log(`family_count=${ENTRIES.length}`);
  console.log('');

  for (const family of ENTRIES) {
    const variants = buildVariants(blocks, family);

    console.log(`${family.name} anchor=${hex(family.entry)} variants=${variants.length}`);
    console.log(`note=${family.note}`);

    for (const variant of variants) {
      const probe = runProbe(env, variant.entry);
      const result = {
        name: family.name,
        anchor: family.entry,
        note: family.note,
        variantKind: variant.kind,
        variantNote: variant.note,
        ...probe,
      };
      result.verdict = verdictForProbe(result);
      results.push(result);
      printRunSummary(result);
    }

    console.log('');
  }

  const bestByFamily = new Map();
  for (const result of results) {
    const previous = bestByFamily.get(result.name);
    if (!previous || compareRuns(result, previous) < 0) {
      bestByFamily.set(result.name, result);
    }
  }

  console.log('=== Best result per family ===');
  for (const result of [...bestByFamily.values()].sort(compareRuns)) {
    console.log(
      `${result.name}  best=${result.variantKind}  entry=${hex(result.entry)}  vram=${result.vramWrites}  bbox=${formatBbox(result.bbox)}  blocks=${result.uniqueBlocks}  verdict=${result.verdict}`,
    );
  }

  console.log('');
  console.log('=== Browser-shell candidates (vram > 200) ===');
  for (const result of [...bestByFamily.values()].sort(compareRuns)) {
    if (result.vramWrites <= 200) {
      continue;
    }

    console.log(`${result.name} -> ${hex(result.entry)} (${result.vramWrites} writes, ${result.variantKind})`);
  }

  const report = buildReport(results);
  fs.writeFileSync(reportPath, report);

  console.log('');
  console.log(`report=${path.basename(reportPath)}`);
}

await main();
