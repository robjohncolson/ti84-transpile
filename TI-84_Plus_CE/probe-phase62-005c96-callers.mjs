#!/usr/bin/env node
// Phase 62: probe the lifted 0x0059c6 caller family directly after full boot
// and OS init, using the Phase 60 explicit-init harness.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romPath = path.join(__dirname, 'ROM.rom');
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const reportPath = path.join(__dirname, 'phase62-005c96-callers-report.md');

const romBytes = fs.readFileSync(romPath);

const CALLER_PCS = [
  0x0015c7,
  0x0015e1,
  0x0017dd,
  0x0059f3,
  0x005a35,
  0x00ee88,
  0x012f56,
  0x013d11,
  0x015864,
  0x0158fa,
];

const VARIANTS = [
  { id: 'baseline', label: 'baseline' },
  { id: 'hl0', label: 'HL=0', hl: 0x000000 },
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

const FIRST_BLOCKS_LIMIT = 10;
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

function formatBlocks(blocks) {
  if (!blocks || blocks.length === 0) {
    return 'none';
  }

  return blocks.map((pc) => hex(pc)).join(', ');
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

function runProbe(env, entry, options = {}) {
  restoreBaseState(env);

  env.cpu.halted = false;
  env.cpu.iff1 = 0;
  env.cpu.iff2 = 0;
  env.cpu._iy = PROBE_IY;
  env.cpu.f = 0x40;
  env.cpu.sp = SCREEN_STACK_TOP - PROBE_STACK_BYTES;
  fillSentinel(env.mem, env.cpu.sp, PROBE_STACK_BYTES);

  if (Object.hasOwn(options, 'hl')) {
    env.cpu.hl = options.hl;
  }

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

function verdictForProbe(result) {
  if (result.vramWrites > 0) {
    return 'renders something';
  }

  if (result.termination === 'error') {
    return 'crashes';
  }

  return 'noop';
}

function compareRuns(a, b) {
  const aRenders = Number(a.vramWrites > 0);
  const bRenders = Number(b.vramWrites > 0);
  if (bRenders !== aRenders) {
    return bRenders - aRenders;
  }

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

  return a.callerPc - b.callerPc;
}

function summarizeHighlight(result) {
  const tags = [];

  if (result.vramWrites > 0) {
    tags.push('render');
  }

  if (result.uniqueBlocks > 20) {
    tags.push('deep');
  }

  return tags.length > 0 ? tags.join(', ') : '-';
}

function formatMarkdownCode(value) {
  return `\`${value}\``;
}

function formatTableCaller(result) {
  const label = formatMarkdownCode(hex(result.callerPc));
  if (result.vramWrites > 0 || result.uniqueBlocks > 20) {
    return `**${label}**`;
  }

  return label;
}

function buildOverviewTable(results) {
  const lines = [
    '| Caller PC | Variant | Function Entry | Steps | Termination | VRAM writes | BBox | Unique blocks | Verdict | Highlight |',
    '| --- | --- | --- | ---: | --- | ---: | --- | ---: | --- | --- |',
  ];

  for (const result of results) {
    lines.push(
      `| ${[
        formatTableCaller(result),
        formatMarkdownCode(result.variantLabel),
        formatMarkdownCode(hex(result.functionEntry)),
        result.steps,
        formatMarkdownCode(result.termination),
        result.vramWrites,
        formatMarkdownCode(formatBbox(result.bbox)),
        result.uniqueBlocks,
        formatMarkdownCode(result.verdict),
        formatMarkdownCode(summarizeHighlight(result)),
      ].join(' | ')} |`,
    );
  }

  return lines.join('\n');
}

function buildBlocksTable(results) {
  const lines = [
    '| Caller PC | Variant | First 10 blocks |',
    '| --- | --- | --- |',
  ];

  for (const result of results) {
    lines.push(
      `| ${[
        formatMarkdownCode(hex(result.callerPc)),
        formatMarkdownCode(result.variantLabel),
        formatMarkdownCode(formatBlocks(result.firstBlocks)),
      ].join(' | ')} |`,
    );
  }

  return lines.join('\n');
}

function explainRank(result) {
  const reasons = [];

  if (result.vramWrites > 0) {
    reasons.push(`${result.vramWrites} VRAM writes`);
  } else {
    reasons.push('no VRAM writes');
  }

  reasons.push(`${result.uniqueBlocks} unique blocks`);

  if (result.variantId === 'hl0') {
    reasons.push('best result only after HL=0 seeding');
  }

  if (result.termination === 'error' && result.error) {
    reasons.push(`error=${result.error}`);
  } else {
    reasons.push(`term=${result.termination}`);
  }

  return reasons.join('; ');
}

function buildRankingSection(bestByCaller) {
  const ranked = [...bestByCaller].sort(compareRuns);
  const lines = [
    '| Rank | Caller PC | Best variant | Function entry | Why it ranks here |',
    '| ---: | --- | --- | --- | --- |',
  ];

  for (let index = 0; index < ranked.length; index += 1) {
    const result = ranked[index];
    lines.push(
      `| ${[
        index + 1,
        formatMarkdownCode(hex(result.callerPc)),
        formatMarkdownCode(result.variantLabel),
        formatMarkdownCode(hex(result.functionEntry)),
        explainRank(result),
      ].join(' | ')} |`,
    );
  }

  return {
    ranked,
    table: lines.join('\n'),
  };
}

function buildRenderedRowsSection(bestByCaller) {
  const rendered = [...bestByCaller.values()].filter(
    (result) => result.vramWrites > 0 && result.firstRenderedRow,
  );
  if (rendered.length === 0) {
    return null;
  }

  const lines = [
    '## First Rendered VRAM Row Hex Dumps',
    '',
    'These are the first rendered rows (`bbox.minRow`) for any probe that wrote pixels.',
    '',
  ];

  for (const result of rendered) {
    const row = result.firstRenderedRow;
    lines.push(
      `- ${hex(result.callerPc)} ${result.variantLabel} entry=${hex(result.functionEntry)} row=${row.row} cols=${row.startCol}-${row.endCol}`,
    );
    lines.push('');
    lines.push('```text');
    lines.push(row.words.join(' '));
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}

function buildCallerNotes(results, bestByCaller, ranking) {
  const lines = [
    '## Notes',
    '',
  ];

  const rendered = results.filter((result) => result.vramWrites > 0);
  if (rendered.length === 0) {
    lines.push('- No variant produced any non-sentinel VRAM cells.');
  } else {
    lines.push(
      `- ${rendered.length} probe variant(s) produced VRAM writes: ${rendered.map((result) => `${hex(result.callerPc)} ${result.variantLabel}`).join(', ')}.`,
    );
  }

  const deep = results.filter((result) => result.uniqueBlocks > 20);
  if (deep.length === 0) {
    lines.push('- No variant crossed the `uniqueBlocks > 20` deep-execution bar.');
  } else {
    lines.push(
      `- ${deep.length} probe variant(s) crossed the deep-execution bar: ${deep.map((result) => `${hex(result.callerPc)} ${result.variantLabel} (${result.uniqueBlocks})`).join(', ')}.`,
    );
  }

  const nearby = [0x0015c7, 0x0015e1, 0x0017dd]
    .map((callerPc) => bestByCaller.get(callerPc))
    .filter(Boolean);
  lines.push(
    `- The near-event-loop 0x0015xx trio is ${nearby.map((result) => `${hex(result.callerPc)} -> ${result.variantLabel}, vram=${result.vramWrites}, blocks=${result.uniqueBlocks}, term=${result.termination}`).join('; ')}.`,
  );

  const hlChanged = [];
  for (const callerPc of CALLER_PCS) {
    const baseline = results.find(
      (result) => result.callerPc === callerPc && result.variantId === 'baseline',
    );
    const hl0 = results.find(
      (result) => result.callerPc === callerPc && result.variantId === 'hl0',
    );

    if (!baseline || !hl0) {
      continue;
    }

    const bboxChanged = JSON.stringify(baseline.bbox) !== JSON.stringify(hl0.bbox);
    if (
      baseline.vramWrites !== hl0.vramWrites ||
      baseline.uniqueBlocks !== hl0.uniqueBlocks ||
      baseline.termination !== hl0.termination ||
      bboxChanged
    ) {
      hlChanged.push(callerPc);
    }
  }

  if (hlChanged.length === 0) {
    lines.push('- HL=0 seeding made no observable difference for any caller.');
  } else {
    lines.push(
      `- HL=0 changed behavior for: ${hlChanged.map((callerPc) => hex(callerPc)).join(', ')}.`,
    );
  }

  if (ranking.length > 0) {
    const top = ranking[0];
    lines.push(
      `- Most render-adjacent overall: ${hex(top.callerPc)} via ${top.variantLabel} (vram=${top.vramWrites}, blocks=${top.uniqueBlocks}, term=${top.termination}).`,
    );
  }

  return lines.join('\n');
}

function buildReport(results) {
  const sortedResults = [...results].sort((a, b) => {
    if (a.callerPc !== b.callerPc) {
      return a.callerPc - b.callerPc;
    }

    return a.variantLabel.localeCompare(b.variantLabel);
  });

  const bestByCaller = new Map();
  for (const result of sortedResults) {
    const previous = bestByCaller.get(result.callerPc);
    if (!previous || compareRuns(result, previous) < 0) {
      bestByCaller.set(result.callerPc, result);
    }
  }

  const rankingSection = buildRankingSection([...bestByCaller.values()]);
  const entryFallbacks = sortedResults.filter(
    (result) => result.functionEntry === result.callerPc && result.entryHeuristic === 'caller',
  ).length;
  const renderedCount = sortedResults.filter((result) => result.vramWrites > 0).length;

  const lines = [
    '# Phase 62: 0x0059c6 Caller Probe',
    '',
    '## Summary',
    '',
    `- Probed ${CALLER_PCS.length} caller anchors from the Phase 60 0x0059c6 family.`,
    `- Each caller was run twice: \`baseline\` and \`HL=0\`.`,
    `- ${renderedCount} probe variant(s) wrote to VRAM.`,
    `- ${entryFallbacks} probe variant(s) used the caller PC directly because \`findFunctionEntry()\` fell back to the supplied address.`,
    '',
    '## Per-Caller Results',
    '',
    buildOverviewTable(sortedResults),
    '',
    '## First 10 Executed Blocks',
    '',
    buildBlocksTable(sortedResults),
    '',
    '## Most Render-Adjacent Ranking',
    '',
    rankingSection.table,
    '',
    buildCallerNotes(sortedResults, bestByCaller, rankingSection.ranked),
  ];

  const renderedRowsSection = buildRenderedRowsSection(bestByCaller);
  if (renderedRowsSection) {
    lines.push('');
    lines.push(renderedRowsSection);
  }

  return `${lines.join('\n')}\n`;
}

function printRunSummary(result) {
  const extra = result.error ? ` error=${result.error}` : '';
  console.log(
    [
      `${hex(result.callerPc)} [${result.variantLabel}]`,
      `functionEntry=${hex(result.functionEntry)}`,
      `heuristic=${result.entryHeuristic}`,
      `steps=${result.steps}`,
      `term=${result.termination}`,
      `vram=${result.vramWrites}`,
      `bbox=${formatBbox(result.bbox)}`,
      `blocks=${result.uniqueBlocks}`,
      `verdict=${result.verdict}`,
      `first10=${formatBlocks(result.firstBlocks)}`,
    ].join('  ') + extra,
  );
}

async function main() {
  const blocks = await loadBlocks();

  console.log('=== Phase 62: direct probes for 0x0059c6 caller family ===');
  console.log(`caller_count=${CALLER_PCS.length} variants=${VARIANTS.length}`);
  console.log('');

  const env = await buildProbeEnv(blocks);
  const results = [];

  for (const callerPc of CALLER_PCS) {
    const entryInfo = findFunctionEntry(callerPc);
    const functionEntry = entryInfo.entry;

    for (const variant of VARIANTS) {
      const probe = runProbe(env, functionEntry, variant);
      const result = {
        callerPc,
        functionEntry,
        entryHeuristic: entryInfo.heuristic,
        entryTerminator: entryInfo.terminator,
        variantId: variant.id,
        variantLabel: variant.label,
        ...probe,
      };
      result.verdict = verdictForProbe(result);
      results.push(result);
      printRunSummary(result);
    }
  }

  const bestByCaller = [];
  for (const callerPc of CALLER_PCS) {
    const callerResults = results.filter((result) => result.callerPc === callerPc);
    const best = [...callerResults].sort(compareRuns)[0];
    bestByCaller.push(best);
  }

  console.log('');
  console.log('=== Best variant per caller ===');
  for (const result of bestByCaller.sort(compareRuns)) {
    console.log(
      `${hex(result.callerPc)}  best=${result.variantLabel}  entry=${hex(result.functionEntry)}  vram=${result.vramWrites}  bbox=${formatBbox(result.bbox)}  blocks=${result.uniqueBlocks}  verdict=${result.verdict}`,
    );
  }

  const report = buildReport(results);
  fs.writeFileSync(reportPath, report);

  console.log('');
  console.log(`report=${path.basename(reportPath)}`);
}

await main();
