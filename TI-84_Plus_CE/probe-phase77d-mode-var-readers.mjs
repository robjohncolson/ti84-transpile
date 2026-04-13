#!/usr/bin/env node
// Phase 77D: probe 0x0a2xxx-0x0a6xxx mode-variable readers that sit near the
// token table at 0x0a0450. This mirrors the Phase 64 boot/init/text-color
// prelude, then runs direct-entry probes across several HL/A/IY variants.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romPath = path.join(__dirname, 'ROM.rom');
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const reportPath = path.join(__dirname, 'phase77d-mode-var-readers-report.md');

if (!fs.existsSync(romPath)) {
  throw new Error(`Missing ${romPath}`);
}

const romBytes = fs.readFileSync(romPath);

const ENTRIES = [
  { entry: 0x0a2812, name: 'read_d00092_a2812', ramByte: 0xd00092 },
  { entry: 0x0a281a, name: 'read_d00085_a281a', ramByte: 0xd00085 },
  { entry: 0x0a29a8, name: 'read_d00092_a29a8', ramByte: 0xd00092 },
  { entry: 0x0a654e, name: 'read_d0008e_a654e', ramByte: 0xd0008e },
];

const VARIANTS = [
  {
    name: 'v1_zero_regs',
    label: 'HL=0 A=0 IY=0xD00080',
    hl: 0x000000,
    a: 0x00,
    iy: 0xd00080,
    ramWrites: [],
  },
  {
    name: 'v2_prgm_token',
    label: 'HL=0x0A0452 A=0x4C IY=0xD00080',
    hl: 0x0a0452,
    a: 0x4c,
    iy: 0xd00080,
    ramWrites: [],
  },
  {
    name: 'v3_normal_token',
    label: 'HL=0x0A0467 A=0x4F IY=0xD00080',
    hl: 0x0a0467,
    a: 0x4f,
    iy: 0xd00080,
    ramWrites: [],
  },
  {
    name: 'v4_seeded_mode_bytes',
    label: 'HL=0 A=0 IY=0xD00080 + [0xD00085]=0x4F [0xD00092]=0x52',
    hl: 0x000000,
    a: 0x00,
    iy: 0xd00080,
    ramWrites: [
      { addr: 0xd00085, value: 0x4f },
      { addr: 0xd00092, value: 0x52 },
    ],
  },
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

const PROBE_MAX_STEPS = 15000;
const PROBE_MAX_LOOP_ITERATIONS = 500;
const FIRST_BLOCKS_LIMIT = 10;
const ASCII_PREVIEW_ROWS = 40;
const ASCII_PREVIEW_COLS = 80;

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
  let drawn = 0;
  let fgCount = 0;
  let bgCount = 0;
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

      drawn += 1;
      if (pixel === 0xffff) {
        bgCount += 1;
      } else {
        fgCount += 1;
      }

      if (row < minRow) minRow = row;
      if (row > maxRow) maxRow = row;
      if (col < minCol) minCol = col;
      if (col > maxCol) maxCol = col;
    }
  }

  return {
    drawn,
    fgCount,
    bgCount,
    bbox: maxRow >= 0 ? { minRow, maxRow, minCol, maxCol } : null,
  };
}

function pixelToAscii(pixel) {
  if (pixel === VRAM_SENTINEL) {
    return ' ';
  }

  if (pixel === 0xffff) {
    return '.';
  }

  return '#';
}

function buildAsciiArt(mem, bbox) {
  if (!bbox) {
    return {
      width: 0,
      height: 0,
      lines: [],
      previewLines: [],
      previewWidth: 0,
      clippedRows: false,
      clippedCols: false,
    };
  }

  const lines = [];
  const width = bbox.maxCol - bbox.minCol + 1;
  const height = bbox.maxRow - bbox.minRow + 1;
  const previewLines = [];

  for (let row = bbox.minRow; row <= bbox.maxRow; row += 1) {
    let line = '';

    for (let col = bbox.minCol; col <= bbox.maxCol; col += 1) {
      line += pixelToAscii(readPixel(mem, row, col));
    }

    lines.push(line);

    if (previewLines.length < ASCII_PREVIEW_ROWS) {
      previewLines.push(line.slice(0, ASCII_PREVIEW_COLS));
    }
  }

  return {
    width,
    height,
    lines,
    previewLines,
    previewWidth: Math.min(width, ASCII_PREVIEW_COLS),
    clippedRows: height > ASCII_PREVIEW_ROWS,
    clippedCols: width > ASCII_PREVIEW_COLS,
  };
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

function getBlockValues(blocks) {
  return Array.isArray(blocks) ? blocks : Object.values(blocks);
}

function findContainingBlockStart(blocks, pc) {
  let best = null;

  for (const block of getBlockValues(blocks)) {
    if (!(block.instructions || []).some((instruction) => instruction.pc === pc)) {
      continue;
    }

    if (best === null || block.startPc < best) {
      best = block.startPc;
    }
  }

  return best;
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

function applyVariant(env, variant) {
  env.cpu.halted = false;
  env.cpu.iff1 = 0;
  env.cpu.iff2 = 0;
  env.cpu.mbase = 0xd0;
  env.cpu._iy = variant.iy;
  env.cpu.hl = variant.hl;
  env.cpu.a = variant.a;
  env.cpu.f = 0x40;
  env.cpu.sp = SCREEN_STACK_TOP - PROBE_STACK_BYTES;
  fillSentinel(env.mem, env.cpu.sp, PROBE_STACK_BYTES);

  for (const ramWrite of variant.ramWrites) {
    env.mem[ramWrite.addr] = ramWrite.value;
  }
}

function verdictForProbe(result) {
  if (result.drawn === 0) {
    if (result.termination === 'error') {
      return 'crash-no-draw';
    }

    if (result.termination === 'missing_block') {
      return 'missing-block';
    }

    return 'blank';
  }

  if (!result.bbox) {
    return 'draw-no-bbox';
  }

  const width = result.bbox.maxCol - result.bbox.minCol + 1;
  const height = result.bbox.maxRow - result.bbox.minRow + 1;

  if (result.drawn > 300 && result.bbox.minRow <= 12 && result.bbox.maxRow <= 32 && height <= 24) {
    return 'status-bar-like';
  }

  if (result.drawn > 300 && height <= 32 && width >= 16) {
    return 'text-like';
  }

  if (result.drawn > 300) {
    return 'large-render';
  }

  return 'small-render';
}

function runProbe(env, entryConfig, variant, runEntry) {
  restoreBaseState(env);
  applyVariant(env, variant);

  const firstBlocks = [];
  const raw = env.executor.runFrom(runEntry, 'adl', {
    maxSteps: PROBE_MAX_STEPS,
    maxLoopIterations: PROBE_MAX_LOOP_ITERATIONS,
    onBlock: (pc) => {
      if (firstBlocks.length < FIRST_BLOCKS_LIMIT) {
        firstBlocks.push(pc);
      }
    },
  });
  const stats = collectVramStats(env.mem);
  const ascii = stats.drawn > 300 ? buildAsciiArt(env.mem, stats.bbox) : null;

  const result = {
    entry: entryConfig.entry,
    runEntry,
    entryName: entryConfig.name,
    ramByte: entryConfig.ramByte,
    variant: variant.name,
    variantLabel: variant.label,
    steps: raw.steps,
    termination: raw.termination,
    lastPc: raw.lastPc,
    lastMode: raw.lastMode,
    error: raw.error instanceof Error ? raw.error.message : null,
    drawn: stats.drawn,
    fg: stats.fgCount,
    bg: stats.bgCount,
    bbox: stats.bbox,
    firstBlocks,
    ascii,
  };
  result.verdict = verdictForProbe(result);
  return result;
}

function renderResultsTable(results) {
  const lines = [
    '| entry | variant | drawn | fg | bg | bbox | verdict |',
    '| --- | --- | ---: | ---: | ---: | --- | --- |',
  ];

  for (const result of results) {
    lines.push(
      `| \`${hex(result.entry)}\` | \`${result.variant}\` | ${result.drawn} | ${result.fg} | ${result.bg} | \`${formatBbox(result.bbox)}\` | \`${result.verdict}\` |`,
    );
  }

  return lines.join('\n');
}

function renderRunDetails(results) {
  const lines = [
    '## Run Details',
    '',
  ];

  for (const result of results) {
    lines.push(
      `- ${hex(result.entry)} ${result.variant}: runFrom=${hex(result.runEntry)} steps=${result.steps} termination=${result.termination} lastPc=${hex(result.lastPc ?? 0)} lastMode=${result.lastMode ?? 'n/a'} first10=${formatBlocks(result.firstBlocks)}`,
    );
  }

  return lines.join('\n');
}

function renderAsciiSection(results) {
  const rendered = results.filter((result) => result.drawn > 300 && result.ascii);
  const lines = [
    '## ASCII-Art Previews',
    '',
  ];

  if (rendered.length === 0) {
    lines.push('- No probe crossed the `drawn > 300` threshold.');
    return lines.join('\n');
  }

  for (const result of rendered) {
    lines.push(`### ${hex(result.entry)} ${result.variant}`);
    lines.push('');
    lines.push(`- bbox=${formatBbox(result.bbox)} fullSize=${result.ascii.width}x${result.ascii.height} preview=${result.ascii.previewWidth}x${Math.min(result.ascii.height, ASCII_PREVIEW_ROWS)} first10=${formatBlocks(result.firstBlocks)}`);
    lines.push('');
    lines.push('```text');

    for (const line of result.ascii.previewLines) {
      lines.push(line);
    }

    if (result.ascii.clippedRows) {
      lines.push(`... (${result.ascii.height - ASCII_PREVIEW_ROWS} more rows)`);
    }

    if (result.ascii.clippedCols) {
      lines.push(`... (${result.ascii.width - ASCII_PREVIEW_COLS} more columns clipped on each row)`);
    }

    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}

function buildVerdictSection(results) {
  const lines = [
    '## Verdict',
    '',
  ];
  const statusBarLike = results.filter((result) => result.verdict === 'status-bar-like');
  const textLike = results.filter((result) => result.verdict === 'text-like');
  const largeRenders = results.filter((result) => result.verdict === 'large-render');

  if (statusBarLike.length === 0) {
    lines.push('- No probe produced a compact top-of-screen strip that clearly matches the home status bar layout.');
  } else {
    lines.push(
      `- Status-bar-like candidates: ${statusBarLike.map((result) => `${hex(result.entry)} ${result.variant} (${formatBbox(result.bbox)}, drawn=${result.drawn})`).join('; ')}.`,
    );
  }

  if (textLike.length === 0) {
    lines.push('- No additional text-like render outside the top-strip heuristic stood out.');
  } else {
    lines.push(
      `- Other text-like renders: ${textLike.map((result) => `${hex(result.entry)} ${result.variant} (${formatBbox(result.bbox)}, drawn=${result.drawn})`).join('; ')}.`,
    );
  }

  if (largeRenders.length === 0) {
    lines.push('- Large non-text renders: none.');
  } else {
    lines.push(
      `- Large non-text renders: ${largeRenders.map((result) => `${hex(result.entry)} ${result.variant} (${formatBbox(result.bbox)}, drawn=${result.drawn})`).join('; ')}.`,
    );
  }

  const anyTokenWords =
    results.some((result) =>
      result.ascii?.previewLines.some((line) =>
        /Normal|Float|Radian|Degree|prgm/i.test(line),
      ),
    );

  if (anyTokenWords) {
    lines.push('- A token word appears verbatim in the ASCII preview. Inspect the matching preview above.');
  } else {
    lines.push('- No preview rendered a verbatim `Normal`, `Float`, `Radian`, `Degree`, or `prgm` string in the stride-1 ASCII decode.');
  }

  const byEntry = new Map();
  for (const result of results) {
    if (!byEntry.has(result.entry)) {
      byEntry.set(result.entry, []);
    }

    byEntry.get(result.entry).push(result);
  }

  lines.push('');
  lines.push('### Entry Notes');
  lines.push('');

  for (const [entry, entryResults] of [...byEntry.entries()].sort((a, b) => a[0] - b[0])) {
    const sample = entryResults[0];
    const allDrawBlank = entryResults.every((result) => result.drawn === 0);
    const allMissing = entryResults.every((result) => result.termination === 'missing_block');
    const allSameFirstBlock =
      entryResults.every((result) => result.firstBlocks.length > 0) &&
      new Set(entryResults.map((result) => result.firstBlocks[0])).size === 1;

    if (allDrawBlank && allMissing && allSameFirstBlock) {
      lines.push(
        `- ${hex(entry)}: every variant resolves to ${hex(sample.runEntry)} and exits after the containing block without any VRAM writes. This behaves like a short non-render helper, not a screen/text renderer.`,
      );
      continue;
    }

    const allBlankMaxSteps = entryResults.every(
      (result) => result.drawn === 0 && result.termination === 'max_steps',
    );

    if (allBlankMaxSteps) {
      lines.push(
        `- ${hex(entry)}: every variant resolves to ${hex(sample.runEntry)} and enters a deeper helper chain (${formatBlocks(sample.firstBlocks)}) but still produces zero VRAM writes within ${PROBE_MAX_STEPS} steps.`,
      );
      continue;
    }

    lines.push(
      `- ${hex(entry)}: mixed behavior across variants; inspect the table and run details above.`,
    );
  }

  return lines.join('\n');
}

function buildReport(results) {
  const lines = [
    '# Phase 77D: Mode-Var Reader Probes',
    '',
    '## Summary',
    '',
    `- Probed ${ENTRIES.length} mode-state reader entries near the 0x0A0450 token table.`,
    `- Ran ${VARIANTS.length} register/RAM variants per entry for ${results.length} total probes.`,
    `- Probe budget per run: \`maxSteps=${PROBE_MAX_STEPS}\`, sentinel-filled VRAM at \`${hex(VRAM_BASE)}\`.`,
    '- Direct candidate PCs that were not lifted block starts were executed via the containing lifted block and recorded in the run details.',
    '',
    '## Probe Results',
    '',
    renderResultsTable(results),
    '',
    renderRunDetails(results),
    '',
    renderAsciiSection(results),
    '',
    buildVerdictSection(results),
  ];

  return `${lines.join('\n')}\n`;
}

function printSummary(result) {
  const extra = result.error ? ` error=${result.error}` : '';
  console.log(
    [
      `entry=${hex(result.entry)}`,
      `variant=${result.variant}`,
      `drawn=${result.drawn}`,
      `fg=${result.fg}`,
      `bg=${result.bg}`,
      `bbox=${formatBbox(result.bbox)}`,
      `term=${result.termination}`,
      `verdict=${result.verdict}`,
      `first10=${formatBlocks(result.firstBlocks)}`,
    ].join('  ') + extra,
  );
}

async function main() {
  const blocks = await loadBlocks();
  const env = await buildProbeEnv(blocks);
  const results = [];

  console.log('=== Phase 77D: mode-var reader probes ===');
  console.log(`entry_count=${ENTRIES.length} variant_count=${VARIANTS.length}`);
  console.log('');

  for (const entryConfig of ENTRIES) {
    const runEntry = findContainingBlockStart(blocks, entryConfig.entry) ?? entryConfig.entry;
    console.log(
      `${entryConfig.name} entry=${hex(entryConfig.entry)} runFrom=${hex(runEntry)} ramByte=${hex(entryConfig.ramByte)}`,
    );

    for (const variant of VARIANTS) {
      const result = runProbe(env, entryConfig, variant, runEntry);
      results.push(result);
      printSummary(result);
    }

    console.log('');
  }

  const report = buildReport(results);
  fs.writeFileSync(reportPath, report);

  console.log(`report=${path.basename(reportPath)}`);
}

await main();
