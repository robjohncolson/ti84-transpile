#!/usr/bin/env node
// Phase 51.1: retry three string-anchored renderers that drew 0 cells in
// Phase 50 by varying entry point, HL/DE/BC seeds, and stack size.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');

const BOOT_ENTRY = 0x000000;
const OS_INIT_ENTRY = 0x08C331;
const SET_TEXT_FG_ENTRY = 0x0802B2;

const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xE00000;
const SCREEN_STACK_TOP = 0xD1A87E;
const HELPER_STACK_BYTES = 3;
const DEFAULT_STACK_BYTES = 12;
const MENU_MODE_ADDR = 0xD007E0;
const MENU_MODE_DEFAULT = 0x40;

const PROBE_IY = 0xD00080;
const PROBE_FLAGS = 0x40;
const DISP_MESSAGE_DE = 0x000100;
const DISP_MESSAGE_BC = 0x00001B;

const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;
const VRAM_SENTINEL = 0xAAAA;
const TEXT_FG_COLOR = 0x0000;
const TEXT_BG_COLOR = 0xFFFF;

const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOPS = 32;
const OS_INIT_MAX_STEPS = 100000;
const OS_INIT_MAX_LOOPS = 500;
const SET_TEXT_MAX_STEPS = 100;
const SET_TEXT_MAX_LOOPS = 32;
const PROBE_MAX_STEPS = 200000;
const PROBE_MAX_LOOPS = 5000;
const PROBE_TIMEOUT_MS = 30000;
const ASCII_STRIDE = 2;
const PROBE_TIMEOUT_MESSAGE = 'phase51_probe_timeout';

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

const TARGETS = [
  {
    addr: 0x06AF7E,
    label: 'Store Results menu',
    anchor: 0x06AF37,
    anchorText: 'STORE RESULTS?',
    altEntries: [0x06AF40, 0x06AF50, 0x06AF60],
  },
  {
    addr: 0x0BA9DB,
    label: 'OS/App compatibility error',
    anchor: 0x0BAA56,
    anchorText: 'OS and App are not',
    altEntries: [0x0BAA30, 0x0BAA00],
  },
  {
    addr: 0x0B72EC,
    label: 'Press any key prompt',
    anchor: 0x0B7143,
    anchorText: 'PRESS ANY KEY',
    altEntries: [0x0B7100, 0x0B7150],
  },
];

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function formatHex(value, width = 6) {
  return Number.isInteger(value) ? hex(value, width) : 'n/a';
}

function fillSentinel(mem, start, bytes) {
  mem.fill(0xFF, start, start + bytes);
}

function buildClearedVramSnapshot() {
  const bytes = new Uint8Array(VRAM_SIZE);

  for (let offset = 0; offset < VRAM_SIZE; offset += 2) {
    bytes[offset] = VRAM_SENTINEL & 0xFF;
    bytes[offset + 1] = (VRAM_SENTINEL >> 8) & 0xFF;
  }

  return bytes;
}

function snapshotCpu(cpu) {
  const snapshot = {};

  for (const field of CPU_SNAPSHOT_FIELDS) {
    snapshot[field] = cpu[field];
  }

  return snapshot;
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_SNAPSHOT_FIELDS) {
    cpu[field] = snapshot[field];
  }
}

function restoreBaseState(runner) {
  const { mem, cpu, ramSnapshot, cpuSnapshot, clearedVram, lcdMmio, lcdSnapshot } = runner;

  mem.set(ramSnapshot, RAM_SNAPSHOT_START);
  mem.set(clearedVram, VRAM_BASE);
  restoreCpu(cpu, cpuSnapshot);

  if (!lcdMmio || !lcdSnapshot) {
    return;
  }

  lcdMmio.upbase = lcdSnapshot.upbase;
  lcdMmio.control = lcdSnapshot.control;
}

function prepareProbe(cpu, mem, attempt) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = PROBE_IY;
  cpu.f = PROBE_FLAGS;
  cpu.sp = SCREEN_STACK_TOP - attempt.stackBytes;
  fillSentinel(mem, cpu.sp, attempt.stackBytes);
  mem[MENU_MODE_ADDR] = MENU_MODE_DEFAULT;

  if (attempt.regs.a !== undefined) cpu.a = attempt.regs.a;
  if (attempt.regs.bc !== undefined) cpu.bc = attempt.regs.bc;
  if (attempt.regs.de !== undefined) cpu.de = attempt.regs.de;
  if (attempt.regs.hl !== undefined) cpu.hl = attempt.regs.hl;
}

function readPixel(mem, row, col) {
  const offset = VRAM_BASE + row * VRAM_WIDTH * 2 + col * 2;
  return mem[offset] | (mem[offset + 1] << 8);
}

function readPixelFromVram(vram, row, col) {
  const offset = row * VRAM_WIDTH * 2 + col * 2;
  return vram[offset] | (vram[offset + 1] << 8);
}

function collectVramStats(mem) {
  let drawn = 0;
  let fg = 0;
  let bg = 0;
  let other = 0;
  let minRow = VRAM_HEIGHT;
  let maxRow = -1;
  let minCol = VRAM_WIDTH;
  let maxCol = -1;

  for (let row = 0; row < VRAM_HEIGHT; row++) {
    for (let col = 0; col < VRAM_WIDTH; col++) {
      const pixel = readPixel(mem, row, col);
      if (pixel === VRAM_SENTINEL) {
        continue;
      }

      drawn += 1;

      if (pixel === TEXT_FG_COLOR) fg += 1;
      else if (pixel === TEXT_BG_COLOR) bg += 1;
      else other += 1;

      if (row < minRow) minRow = row;
      if (row > maxRow) maxRow = row;
      if (col < minCol) minCol = col;
      if (col > maxCol) maxCol = col;
    }
  }

  return {
    drawn,
    fg,
    bg,
    other,
    bbox: maxRow >= 0 ? { minRow, maxRow, minCol, maxCol } : null,
  };
}

function formatBbox(bbox) {
  if (!bbox) {
    return 'none';
  }

  return `r${bbox.minRow}-${bbox.maxRow} c${bbox.minCol}-${bbox.maxCol}`;
}

function buildAsciiFromVram(vram, bbox, stride = ASCII_STRIDE) {
  if (!bbox) {
    return null;
  }

  const lines = [];

  for (let row = bbox.minRow; row <= bbox.maxRow; row += 1) {
    let line = `${row.toString().padStart(3, '0')}|`;

    for (let col = bbox.minCol; col <= bbox.maxCol; col += stride) {
      const pixel = readPixelFromVram(vram, row, col);

      if (pixel === VRAM_SENTINEL) line += ' ';
      else if (pixel === TEXT_BG_COLOR) line += '.';
      else if (pixel === TEXT_FG_COLOR) line += '#';
      else line += '+';
    }

    lines.push(line);
  }

  return lines.join('\n');
}

async function loadBlocks() {
  if (!fs.existsSync(transpiledPath)) {
    throw new Error(`Missing ${transpiledPath}; this script will not re-transpile the ROM.`);
  }

  const mod = await import(pathToFileURL(transpiledPath).href);
  return mod.PRELIFTED_BLOCKS;
}

function callExplicitOsInit(ex, cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = SCREEN_STACK_TOP - HELPER_STACK_BYTES;
  fillSentinel(mem, cpu.sp, HELPER_STACK_BYTES);

  return ex.runFrom(OS_INIT_ENTRY, 'adl', {
    maxSteps: OS_INIT_MAX_STEPS,
    maxLoopIterations: OS_INIT_MAX_LOOPS,
  });
}

function callSetTextFgColor(ex, cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.hl = 0x000000;
  cpu.sp = SCREEN_STACK_TOP - HELPER_STACK_BYTES;
  fillSentinel(mem, cpu.sp, HELPER_STACK_BYTES);

  return ex.runFrom(SET_TEXT_FG_ENTRY, 'adl', {
    maxSteps: SET_TEXT_MAX_STEPS,
    maxLoopIterations: SET_TEXT_MAX_LOOPS,
  });
}

function runProbe(ex, entry) {
  const startedAt = Date.now();

  const raw = ex.runFrom(entry, 'adl', {
    maxSteps: PROBE_MAX_STEPS,
    maxLoopIterations: PROBE_MAX_LOOPS,
    onBlock() {
      if (Date.now() - startedAt > PROBE_TIMEOUT_MS) {
        throw new Error(PROBE_TIMEOUT_MESSAGE);
      }
    },
  });

  const ms = Date.now() - startedAt;
  const timedOut =
    raw.termination === 'error' &&
    raw.error instanceof Error &&
    raw.error.message === PROBE_TIMEOUT_MESSAGE;

  return {
    ...raw,
    ms,
    timedOut,
    termination: timedOut ? 'timeout' : raw.termination,
  };
}

function isRendered(stats) {
  return stats.drawn > 100 && stats.fg > 0 && stats.bg > 0;
}

function terminationRank(termination) {
  switch (termination) {
    case 'halt':
      return 5;
    case 'max_steps':
      return 4;
    case 'missing_block':
      return 3;
    case 'return':
      return 2;
    case 'timeout':
      return 1;
    default:
      return 0;
  }
}

function compareAttempts(a, b) {
  const aRendered = Number(isRendered(a.stats));
  const bRendered = Number(isRendered(b.stats));
  if (bRendered !== aRendered) {
    return bRendered - aRendered;
  }

  const aTextish = Number(a.stats.fg > 0 && a.stats.bg > 0);
  const bTextish = Number(b.stats.fg > 0 && b.stats.bg > 0);
  if (bTextish !== aTextish) {
    return bTextish - aTextish;
  }

  if (b.stats.drawn !== a.stats.drawn) {
    return b.stats.drawn - a.stats.drawn;
  }

  if (b.stats.fg !== a.stats.fg) {
    return b.stats.fg - a.stats.fg;
  }

  if (b.stats.bg !== a.stats.bg) {
    return b.stats.bg - a.stats.bg;
  }

  if (b.stats.other !== a.stats.other) {
    return b.stats.other - a.stats.other;
  }

  const bTerm = terminationRank(b.run.termination);
  const aTerm = terminationRank(a.run.termination);
  if (bTerm !== aTerm) {
    return bTerm - aTerm;
  }

  if (a.run.ms !== b.run.ms) {
    return a.run.ms - b.run.ms;
  }

  return a.entry - b.entry;
}

function pickBest(results) {
  return [...results].sort(compareAttempts)[0] ?? null;
}

function buildStageDefinitions(target) {
  return [
    {
      id: 'A',
      description: 'default state',
      attempts: [
        {
          label: `entry=${hex(target.addr)}`,
          entry: target.addr,
          stackBytes: DEFAULT_STACK_BYTES,
          regs: {},
        },
      ],
    },
    {
      id: 'B',
      description: `HL=${hex(target.anchor)} "${target.anchorText}"`,
      attempts: [
        {
          label: `entry=${hex(target.addr)}`,
          entry: target.addr,
          stackBytes: DEFAULT_STACK_BYTES,
          regs: { hl: target.anchor },
        },
      ],
    },
    {
      id: 'C',
      description: `HL=${hex(target.anchor)} DE=${hex(DISP_MESSAGE_DE)} BC=${hex(DISP_MESSAGE_BC)}`,
      attempts: [
        {
          label: `entry=${hex(target.addr)}`,
          entry: target.addr,
          stackBytes: DEFAULT_STACK_BYTES,
          regs: {
            hl: target.anchor,
            de: DISP_MESSAGE_DE,
            bc: DISP_MESSAGE_BC,
          },
        },
      ],
    },
    {
      id: 'D',
      description: 'alternate entry sweep',
      attempts: target.altEntries.map((entry) => ({
        label: `entry=${hex(entry)}`,
        entry,
        stackBytes: DEFAULT_STACK_BYTES,
        regs: {},
      })),
    },
    {
      id: 'E',
      description: 'stack sweep',
      attempts: [
        {
          label: 'sp=top-6',
          entry: target.addr,
          stackBytes: 6,
          regs: {},
        },
        {
          label: 'sp=top-24',
          entry: target.addr,
          stackBytes: 24,
          regs: {},
        },
      ],
    },
  ];
}

function runAttempt(runner, target, stage, attempt) {
  restoreBaseState(runner);
  prepareProbe(runner.cpu, runner.mem, attempt);

  const run = runProbe(runner.ex, attempt.entry);
  const stats = collectVramStats(runner.mem);
  const rendered = isRendered(stats);

  return {
    target,
    stageId: stage.id,
    stageDescription: stage.description,
    label: attempt.label,
    entry: attempt.entry,
    stackBytes: attempt.stackBytes,
    regs: attempt.regs,
    run,
    stats,
    vram: rendered ? runner.mem.slice(VRAM_BASE, VRAM_BASE + VRAM_SIZE) : null,
  };
}

function formatAttemptLine(result) {
  const missingNote =
    result.run.termination === 'missing_block' ? `  missing_seed=${formatHex(result.run.lastPc)}` : '';

  return [
    `${result.label}`.padEnd(18, ' '),
    `drawn=${String(result.stats.drawn).padStart(6, ' ')}`,
    `fg=${String(result.stats.fg).padStart(5, ' ')}`,
    `bg=${String(result.stats.bg).padStart(5, ' ')}`,
    `bbox=${formatBbox(result.stats.bbox).padEnd(20, ' ')}`,
    `term=${`${result.run.termination}@${formatHex(result.run.lastPc)}`.padEnd(24, ' ')}`,
    `ms=${String(result.run.ms).padStart(5, ' ')}`,
    missingNote,
  ].join('  ').trimEnd();
}

function formatBestStageLabel(result) {
  if (!result) {
    return 'n/a';
  }

  if (result.label.startsWith('entry=') && result.entry === result.target.addr) {
    return result.stageId;
  }

  return `${result.stageId} (${result.label})`;
}

function verdictForResult(result) {
  if (!result) {
    return 'failed';
  }

  if (isRendered(result.stats)) {
    return 'rendered';
  }

  if (result.stats.drawn > 0 || result.stats.fg > 0 || result.stats.bg > 0 || result.stats.other > 0) {
    return 'partial';
  }

  return 'failed';
}

function collectSeedSuggestions(attempts) {
  const seeds = new Map();

  for (const attempt of attempts) {
    if (attempt.run.termination !== 'missing_block' || !Number.isInteger(attempt.run.lastPc)) {
      continue;
    }

    const key = attempt.run.lastPc >>> 0;
    let bucket = seeds.get(key);
    if (!bucket) {
      bucket = { addr: key, hits: 0, labels: new Set() };
      seeds.set(key, bucket);
    }

    bucket.hits += 1;
    bucket.labels.add(`${attempt.stageId}:${attempt.label}`);
  }

  return [...seeds.values()].sort((a, b) => {
    if (b.hits !== a.hits) {
      return b.hits - a.hits;
    }

    return a.addr - b.addr;
  });
}

function writeAsciiDump(target, stageResult) {
  const best = stageResult.best;
  if (!best || !best.vram || !best.stats.bbox) {
    return null;
  }

  const ascii = buildAsciiFromVram(best.vram, best.stats.bbox, ASCII_STRIDE);
  if (!ascii) {
    return null;
  }

  const outPath = path.join(
    __dirname,
    `phase51-anchored-${target.addr.toString(16).padStart(6, '0')}-stage${stageResult.id}.txt`,
  );

  const lines = [
    `function=${hex(target.addr)} ${target.label}`,
    `anchor=${hex(target.anchor)} "${target.anchorText}"`,
    `stage=${stageResult.id} ${stageResult.description}`,
    `best_attempt=${best.label}`,
    `entry=${hex(best.entry)}`,
    `stack_bytes=${best.stackBytes}`,
    `steps=${best.run.steps}`,
    `ms=${best.run.ms}`,
    `termination=${best.run.termination}@${formatHex(best.run.lastPc)}`,
    `drawn=${best.stats.drawn} fg=${best.stats.fg} bg=${best.stats.bg} other=${best.stats.other}`,
    `bbox=${formatBbox(best.stats.bbox)}`,
    'legend: " " = sentinel 0xAAAA, "." = bg 0xFFFF, "#" = fg 0x0000, "+" = other',
    '',
    ascii,
    '',
  ];

  fs.writeFileSync(outPath, `${lines.join('\n')}\n`);
  return outPath;
}

async function buildRunner(blocks) {
  const peripherals = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const ex = createExecutor(blocks, mem, { peripherals });
  const cpu = ex.cpu;

  const boot = ex.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOPS,
  });

  const osInit = callExplicitOsInit(ex, cpu, mem);
  const setTextFg = callSetTextFgColor(ex, cpu, mem);

  return {
    mem,
    ex,
    cpu,
    lcdMmio: ex.lcdMmio,
    lcdSnapshot: ex.lcdMmio
      ? { upbase: ex.lcdMmio.upbase, control: ex.lcdMmio.control }
      : null,
    ramSnapshot: new Uint8Array(mem.subarray(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END)),
    cpuSnapshot: snapshotCpu(cpu),
    clearedVram: buildClearedVramSnapshot(),
    setup: {
      boot,
      osInit,
      setTextFg,
    },
  };
}

function formatSummaryRow(row) {
  return [
    hex(row.target.addr).padEnd(10, ' '),
    formatBestStageLabel(row.best).padEnd(20, ' '),
    String(row.best?.stats.drawn ?? 0).padStart(10, ' '),
    String(row.best?.stats.fg ?? 0).padStart(8, ' '),
    formatBbox(row.best?.stats.bbox ?? null).padEnd(20, ' '),
    row.verdict,
  ].join('  ');
}

async function main() {
  console.log('=== Phase 51.1: anchored reachability probes ===');

  const blocks = await loadBlocks();
  const runner = await buildRunner(blocks);

  console.log(
    `boot:        ${runner.setup.boot.steps} steps -> ${runner.setup.boot.termination}@${formatHex(runner.setup.boot.lastPc)}`,
  );
  console.log(
    `os init:     ${runner.setup.osInit.steps} steps -> ${runner.setup.osInit.termination}@${formatHex(runner.setup.osInit.lastPc)}`,
  );
  console.log(
    `set text fg: ${runner.setup.setTextFg.steps} steps -> ${runner.setup.setTextFg.termination}@${formatHex(runner.setup.setTextFg.lastPc)}`,
  );

  const summaries = [];

  for (const target of TARGETS) {
    console.log('');
    console.log(`=== ${hex(target.addr)} ${target.label} ===`);
    console.log(`anchor=${hex(target.anchor)} "${target.anchorText}"`);

    const stageDefinitions = buildStageDefinitions(target);
    const stageResults = [];

    for (const stage of stageDefinitions) {
      console.log(`Stage ${stage.id}: ${stage.description}`);

      const attempts = stage.attempts.map((attempt) => runAttempt(runner, target, stage, attempt));
      for (const result of attempts) {
        console.log(`  ${formatAttemptLine(result)}`);
      }

      const best = pickBest(attempts);
      const asciiPath = best && isRendered(best.stats)
        ? writeAsciiDump(target, { id: stage.id, description: stage.description, best })
        : null;

      if (asciiPath) {
        console.log(`  ascii=${path.basename(asciiPath)} via ${best.label}`);
      }

      stageResults.push({
        id: stage.id,
        description: stage.description,
        attempts,
        best,
        asciiPath,
      });
    }

    const allAttempts = stageResults.flatMap((stage) => stage.attempts);
    const best = pickBest(allAttempts);
    const verdict = verdictForResult(best);

    console.log(
      `Best overall: ${formatBestStageLabel(best)}  drawn=${best?.stats.drawn ?? 0}  fg=${best?.stats.fg ?? 0}  bbox=${formatBbox(best?.stats.bbox ?? null)}  verdict=${verdict}`,
    );

    summaries.push({
      target,
      stageResults,
      allAttempts,
      best,
      verdict,
      seeds: collectSeedSuggestions(allAttempts),
    });
  }

  console.log('');
  console.log('=== Final Summary ===');
  console.log(
    [
      'Function'.padEnd(10, ' '),
      'Best stage'.padEnd(20, ' '),
      'Best drawn'.padStart(10, ' '),
      'Best fg'.padStart(8, ' '),
      'Bbox'.padEnd(20, ' '),
      'Verdict',
    ].join('  '),
  );

  for (const row of summaries) {
    console.log(formatSummaryRow(row));
  }

  const failedTargets = summaries.filter((row) => row.verdict !== 'rendered');
  console.log('');
  console.log('=== Seed Suggestions ===');

  if (failedTargets.length === 0) {
    console.log('All three targets rendered with at least one stage.');
    return;
  }

  for (const row of failedTargets) {
    if (row.seeds.length === 0) {
      console.log(`${hex(row.target.addr)} ${row.target.label}: no missing_block lastPc values captured.`);
      continue;
    }

    const suggestionText = row.seeds
      .map((seed) => `${hex(seed.addr)} [${[...seed.labels].join(', ')}]`)
      .join('  ');

    console.log(`${hex(row.target.addr)} ${row.target.label}: ${suggestionText}`);
  }
}

await main();
