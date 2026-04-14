#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import {
  buildFontSignatures,
  decodeTextStrip,
  FONT_BASE,
  GLYPH_WIDTH,
  GLYPH_HEIGHT,
} from './font-decoder.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase99d-report.md');

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;

const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE_1_ENTRY = 0x0A2B72;
const STAGE_3_ENTRY = 0x0A29EC;
const STAGE_4_ENTRY = 0x0A2854;
const STAGE_MAX_LOOP_ITERATIONS = 500;
const DECODE_STRIDE = 12;
const DECODE_COMPARE_WIDTH = 10;

const MODE_BUF_START = 0xD020A6;
const MODE_BUF_TEXT = 'Normal Float Radian       ';
const MODE_BUF_LEN = 26;

const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_BYTE_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;
const VRAM_SENTINEL = 0xAAAA;
const WHITE_PIXEL = 0xFFFF;

const STRIP_ROW_START = 17;
const STRIP_ROW_END = 34;
const DEFAULT_ROW = 20;

const ENTRY_FILL_ROW_START = 220;
const ENTRY_FILL_ROW_END = 239;

function hex(value, width = 6) {
  if (value === undefined || value === null) {
    return 'n/a';
  }

  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function clearVram(mem) {
  mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);
}

function readPixel(mem, row, col) {
  if (row < 0 || row >= VRAM_HEIGHT || col < 0 || col >= VRAM_WIDTH) {
    return VRAM_SENTINEL;
  }

  const offset = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
  return mem[offset] | (mem[offset + 1] << 8);
}

function coldBoot(executor, cpu, mem) {
  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  return result;
}

const CPU_SNAPSHOT_FIELDS = [
  'a','f','_bc','_de','_hl','_a2','_f2','_bc2','_de2','_hl2',
  'sp','_ix','_iy','i','im','iff1','iff2','madl','mbase','halted','cycles',
];

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((f) => [f, cpu[f]]));
}

function restoreCpu(cpu, snapshot, mem) {
  for (const [f, v] of Object.entries(snapshot)) {
    cpu[f] = v;
  }
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, 12);
}

function runStage(executor, label, entry, maxSteps) {
  const result = executor.runFrom(entry, 'adl', {
    maxSteps,
    maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS,
  });

  console.log(`${label}: entry=${hex(entry, 6)} steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc, 6)}`);

  return {
    label,
    entry,
    maxSteps,
    steps: result.steps,
    termination: result.termination,
    lastPc: result.lastPc,
  };
}

function seedModeBuffer(mem) {
  for (let index = 0; index < MODE_BUF_LEN; index++) {
    mem[MODE_BUF_START + index] = MODE_BUF_TEXT.charCodeAt(index);
  }
}

function fillEntryLineWhite(mem) {
  for (let row = ENTRY_FILL_ROW_START; row <= ENTRY_FILL_ROW_END; row++) {
    for (let col = 0; col < VRAM_WIDTH; col++) {
      const offset = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
      mem[offset] = 0xFF;
      mem[offset + 1] = 0xFF;
    }
  }
}

function countComposite(mem) {
  let drawn = 0;
  let fg = 0;
  let bg = 0;
  let rMin = VRAM_HEIGHT;
  let rMax = -1;

  for (let row = 0; row < VRAM_HEIGHT; row++) {
    for (let col = 0; col < VRAM_WIDTH; col++) {
      const pixel = readPixel(mem, row, col);

      if (pixel === VRAM_SENTINEL) {
        continue;
      }

      drawn++;

      if (pixel === WHITE_PIXEL) {
        bg++;
      } else {
        fg++;
      }

      if (row < rMin) {
        rMin = row;
      }

      if (row > rMax) {
        rMax = row;
      }
    }
  }

  return {
    drawn,
    fg,
    bg,
    rMin: rMax < 0 ? null : rMin,
    rMax: rMax < 0 ? null : rMax,
  };
}

function scanTextStrip(mem) {
  const rows = [];
  let firstDrawnCol = null;
  let firstFgCol = null;
  let densestRow = DEFAULT_ROW;
  let densestFg = -1;

  for (let row = STRIP_ROW_START; row <= STRIP_ROW_END; row++) {
    let drawn = 0;
    let fg = 0;
    let bg = 0;
    let rowFirstDrawnCol = null;
    let rowFirstFgCol = null;
    let rowLastDrawnCol = null;
    let rowLastFgCol = null;

    for (let col = 0; col < VRAM_WIDTH; col++) {
      const pixel = readPixel(mem, row, col);

      if (pixel === VRAM_SENTINEL) {
        continue;
      }

      drawn++;
      rowLastDrawnCol = col;

      if (rowFirstDrawnCol === null) {
        rowFirstDrawnCol = col;
      }

      if (pixel === WHITE_PIXEL) {
        bg++;
        continue;
      }

      fg++;
      rowLastFgCol = col;

      if (rowFirstFgCol === null) {
        rowFirstFgCol = col;
      }
    }

    if (firstDrawnCol === null && rowFirstDrawnCol !== null) {
      firstDrawnCol = rowFirstDrawnCol;
    }

    if (firstFgCol === null && rowFirstFgCol !== null) {
      firstFgCol = rowFirstFgCol;
    }

    if (fg > densestFg) {
      densestFg = fg;
      densestRow = row;
    }

    rows.push({
      row,
      drawn,
      fg,
      bg,
      firstDrawnCol: rowFirstDrawnCol,
      firstFgCol: rowFirstFgCol,
      lastDrawnCol: rowLastDrawnCol,
      lastFgCol: rowLastFgCol,
    });
  }

  return {
    rows,
    firstDrawnCol: firstDrawnCol ?? 0,
    firstFgCol: firstFgCol ?? 0,
    densestRow,
  };
}

function uniqueInts(values) {
  return [...new Set(values.filter((value) => Number.isInteger(value)))].sort((a, b) => a - b);
}

function analyzeAttempt(startRow, startCol, text) {
  const assertions = {
    normal: text.includes('Normal'),
    float: text.includes('Float'),
    radian: text.includes('Radian'),
  };

  let exactMatches = 0;
  let alphaCount = 0;

  for (let index = 0; index < MODE_BUF_TEXT.length; index++) {
    if (text[index] === MODE_BUF_TEXT[index]) {
      exactMatches++;
    }
  }

  for (const char of text) {
    if ((char >= 'A' && char <= 'Z') || (char >= 'a' && char <= 'z')) {
      alphaCount++;
    }
  }

  const questionCount = (text.match(/\?/g) || []).length;
  const nonQuestionCount = text.length - questionCount;
  const passCount = Number(assertions.normal) + Number(assertions.float) + Number(assertions.radian);

  return {
    startRow,
    startCol,
    text,
    assertions,
    passCount,
    exactMatches,
    alphaCount,
    questionCount,
    nonQuestionCount,
  };
}

function compareAttempts(a, b) {
  if (b.passCount !== a.passCount) {
    return b.passCount - a.passCount;
  }

  if (b.exactMatches !== a.exactMatches) {
    return b.exactMatches - a.exactMatches;
  }

  if (b.nonQuestionCount !== a.nonQuestionCount) {
    return b.nonQuestionCount - a.nonQuestionCount;
  }

  if (b.alphaCount !== a.alphaCount) {
    return b.alphaCount - a.alphaCount;
  }

  const aRowBias = Math.abs(a.startRow - DEFAULT_ROW);
  const bRowBias = Math.abs(b.startRow - DEFAULT_ROW);

  if (aRowBias !== bRowBias) {
    return aRowBias - bRowBias;
  }

  return a.startCol - b.startCol;
}

function formatPass(value) {
  return value ? 'PASS' : 'FAIL';
}

function buildIssues({ totals, best }) {
  const issues = [];

  if (totals.drawn === 0 || totals.drawn >= 40000) {
    issues.push('Harness broken: composite drawn count is outside the expected operating range.');
  }

  if (best && best.passCount === 0 && best.questionCount >= Math.floor(MODE_BUF_LEN / 2)) {
    issues.push('Decode is mostly unknown characters; likely blocked on Phase 99A.');
  }

  if (best && best.passCount > 0 && best.passCount < 3) {
    issues.push('Decode is partially aligned but not yet a full seed-text match.');
  }

  if (best && best.passCount === 3 && best.questionCount > 0) {
    issues.push('Leading words decode cleanly, but some trailing cells still decode as unknown.');
  }

  if (issues.length === 0) {
    issues.push('None.');
  }

  return issues;
}

function buildReport({
  bootResult,
  stages,
  totals,
  strip,
  attempts,
  best,
  issues,
  compositeBroken,
}) {
  const lines = [];

  lines.push('# Phase 99D - Home Screen Verification Probe');
  lines.push('');
  lines.push('Generated by `probe-phase99d-home-verify.mjs`.');
  lines.push('');
  lines.push('## Setup');
  lines.push('');
  lines.push(`- Font decoder base: \`${hex(FONT_BASE, 6)}\``);
  lines.push(`- Font decoder glyph size: \`${GLYPH_WIDTH}x${GLYPH_HEIGHT}\``);
  lines.push(`- Boot result: \`steps=${bootResult.steps} termination=${bootResult.termination} lastPc=${hex(bootResult.lastPc, 6)}\``);
  lines.push(`- Seed text: \`${MODE_BUF_TEXT}\``);
  lines.push('');
  lines.push('## Composite Summary');
  lines.push('');
  lines.push(`- Totals: \`drawn=${totals.drawn} fg=${totals.fg} bg=${totals.bg} rMin=${totals.rMin ?? 'n/a'} rMax=${totals.rMax ?? 'n/a'}\``);
  lines.push(`- Composite sanity: \`${compositeBroken ? 'broken' : 'usable'}\``);
  lines.push('');
  lines.push('| stage | entry | maxSteps | steps | termination | lastPc |');
  lines.push('|---|---|---:|---:|---|---|');

  for (const stage of stages) {
    lines.push(
      `| ${stage.label} | \`${hex(stage.entry, 6)}\` | ${stage.maxSteps} | ${stage.steps} | \`${stage.termination}\` | \`${hex(stage.lastPc, 6)}\` |`,
    );
  }

  lines.push('');
  lines.push('## Mode Strip Scan');
  lines.push('');
  lines.push(`- First drawn column: \`${strip.firstDrawnCol}\``);
  lines.push(`- First fg column: \`${strip.firstFgCol}\``);
  lines.push(`- FG-densest row: \`${strip.densestRow}\``);
  lines.push('');
  lines.push('| row | drawn | fg | bg | first drawn | first fg | last drawn | last fg |');
  lines.push('|---:|---:|---:|---:|---:|---:|---:|---:|');

  for (const row of strip.rows) {
    lines.push(
      `| ${row.row} | ${row.drawn} | ${row.fg} | ${row.bg} | ${row.firstDrawnCol ?? 'n/a'} | ${row.firstFgCol ?? 'n/a'} | ${row.lastDrawnCol ?? 'n/a'} | ${row.lastFgCol ?? 'n/a'} |`,
    );
  }

  lines.push('');
  lines.push('## Decode Attempts');
  lines.push('');
  lines.push('| row | col | passCount | exactMatches | knownChars | unknowns | decoded |');
  lines.push('|---:|---:|---:|---:|---:|---:|---|');

  for (const attempt of attempts) {
    lines.push(
      `| ${attempt.startRow} | ${attempt.startCol} | ${attempt.passCount} | ${attempt.exactMatches} | ${attempt.nonQuestionCount} | ${attempt.questionCount} | \`${attempt.text}\` |`,
    );
  }

  lines.push('');
  lines.push('## Best Match');
  lines.push('');

  if (!best) {
    lines.push('- Best-match (row, col): `(none)`');
    lines.push('- Decoded text: `(skipped)`');
    lines.push('- `Normal`: FAIL');
    lines.push('- `Float`: FAIL');
    lines.push('- `Radian`: FAIL');
  } else {
    lines.push(`- Best-match (row, col): \`(${best.startRow}, ${best.startCol})\``);
    lines.push(`- Decoded text: \`${best.text}\``);
    lines.push(`- \`Normal\`: ${formatPass(best.assertions.normal)}`);
    lines.push(`- \`Float\`: ${formatPass(best.assertions.float)}`);
    lines.push(`- \`Radian\`: ${formatPass(best.assertions.radian)}`);
  }

  lines.push('');
  lines.push('## Glyph Alignment Issues');
  lines.push('');

  for (const issue of issues) {
    lines.push(`- ${issue}`);
  }

  return `${lines.join('\n')}\n`;
}

function buildFailureReport(error) {
  const lines = [];
  lines.push('# Phase 99D - Home Screen Verification Probe');
  lines.push('');
  lines.push('Generated by `probe-phase99d-home-verify.mjs`.');
  lines.push('');
  lines.push('## Failure');
  lines.push('');
  lines.push('```text');
  lines.push(error.stack || String(error));
  lines.push('```');
  return `${lines.join('\n')}\n`;
}

async function main() {
  console.log('=== Phase 99D - Home Screen Verification Probe ===');
  console.log(`fontDecoder: base=${hex(FONT_BASE, 6)} glyph=${GLYPH_WIDTH}x${GLYPH_HEIGHT}`);

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  clearVram(mem);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const bootResult = coldBoot(executor, cpu, mem);
  console.log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc, 6)}`);

  const ramSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
  const cpuSnap = snapshotCpu(cpu);

  mem.set(ramSnap, 0x400000);
  clearVram(mem);
  restoreCpu(cpu, cpuSnap, mem);

  const stages = [];
  stages.push(runStage(executor, 'stage 1 status bar background', STAGE_1_ENTRY, 30000));

  seedModeBuffer(mem);
  console.log(`stage 2 seed mode buffer: "${MODE_BUF_TEXT}"`);

  restoreCpu(cpu, cpuSnap, mem);
  stages.push(runStage(executor, 'stage 3 home row strip', STAGE_3_ENTRY, 50000));

  restoreCpu(cpu, cpuSnap, mem);
  stages.push(runStage(executor, 'stage 4 history area', STAGE_4_ENTRY, 50000));

  fillEntryLineWhite(mem);
  console.log(`stage 5 entry line fill: rows ${ENTRY_FILL_ROW_START}-${ENTRY_FILL_ROW_END} -> 0xFFFF`);

  const totals = countComposite(mem);
  console.log(`drawn=${totals.drawn} fg=${totals.fg} bg=${totals.bg} rMin=${totals.rMin ?? 'n/a'} rMax=${totals.rMax ?? 'n/a'}`);

  const strip = scanTextStrip(mem);
  console.log('stripScan:');

  for (const row of strip.rows) {
    console.log(
      `  r${row.row}: drawn=${row.drawn} fg=${row.fg} bg=${row.bg} firstDrawn=${row.firstDrawnCol ?? 'n/a'} firstFg=${row.firstFgCol ?? 'n/a'}`,
    );
  }

  console.log(`stripHints: firstDrawnCol=${strip.firstDrawnCol} firstFgCol=${strip.firstFgCol} densestRow=${strip.densestRow}`);

  const compositeBroken = totals.drawn === 0 || totals.drawn >= 40000;
  let attempts = [];
  let best = null;

  if (!compositeBroken) {
    const signatures = buildFontSignatures(romBytes);
    console.log(`signatures=${signatures.length}`);

    const rowCandidates = uniqueInts([18, 19, 20, 21, 22, strip.densestRow]);
    const colCandidates = uniqueInts([0, 1, 2, 3, 4, strip.firstDrawnCol, strip.firstFgCol]);

    console.log(`decodeAttempts (stride=${DECODE_STRIDE} compareWidth=${DECODE_COMPARE_WIDTH}):`);

    for (const startRow of rowCandidates) {
      for (const startCol of colCandidates) {
        const text = decodeTextStrip(
          mem,
          startRow,
          startCol,
          MODE_BUF_LEN,
          signatures,
          40,
          'auto',
          DECODE_STRIDE,
          DECODE_COMPARE_WIDTH,
        );
        const attempt = analyzeAttempt(startRow, startCol, text);
        attempts.push(attempt);
        console.log(
          `  r${startRow} c${startCol}: passCount=${attempt.passCount} exactMatches=${attempt.exactMatches} knownChars=${attempt.nonQuestionCount} unknowns=${attempt.questionCount} text="${attempt.text}"`,
        );
      }
    }

    attempts.sort(compareAttempts);
    best = attempts[0] ?? null;
  } else {
    console.log('decodeAttempts: skipped because the composite sanity check failed.');
  }

  const issues = buildIssues({ totals, best });
  const report = buildReport({
    bootResult,
    stages,
    totals,
    strip,
    attempts,
    best,
    issues,
    compositeBroken,
  });

  fs.writeFileSync(REPORT_PATH, report);

  if (best) {
    console.log(`bestMatch=row${best.startRow} col${best.startCol}`);
    console.log(`decoded="${best.text}"`);
    console.log(`assert Normal: ${formatPass(best.assertions.normal)}`);
    console.log(`assert Float: ${formatPass(best.assertions.float)}`);
    console.log(`assert Radian: ${formatPass(best.assertions.radian)}`);
    process.exitCode = best.assertions.normal && best.assertions.float && best.assertions.radian ? 0 : 1;
  } else {
    console.log('decoded="(skipped)"');
    console.log('assert Normal: FAIL');
    console.log('assert Float: FAIL');
    console.log('assert Radian: FAIL');
    process.exitCode = 1;
  }

  console.log(`report=${REPORT_PATH}`);
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error);
  fs.writeFileSync(REPORT_PATH, buildFailureReport(error));
  process.exitCode = 1;
}
