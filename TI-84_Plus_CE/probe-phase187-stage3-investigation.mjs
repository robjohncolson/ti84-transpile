#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase187-report.md');

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_BYTE_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;
const STACK_RESET_TOP = 0xD1A87E;
const VRAM_SENTINEL = 0xAAAA;
const WHITE_PIXEL = 0xFFFF;

const STAGE_3_ENTRY = 0x0A29EC;
const STAGE_MAX_LOOP_ITERATIONS = 500;

const MODE_BUF_START = 0xD020A6;
const DISPLAY_BUF_START = 0xD006C0;
const MODE_BUF_TEXT = 'Normal Float Radian       ';
const MODE_BUF_LEN = 26;

const STRIP_ROW_START = 37;
const STRIP_ROW_END = 52;

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function clearVram(mem) {
  mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);
}

function readPixel(mem, row, col) {
  if (row < 0 || row >= VRAM_HEIGHT || col < 0 || col >= VRAM_WIDTH) return VRAM_SENTINEL;
  const offset = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
  return mem[offset] | (mem[offset + 1] << 8);
}

// ── Boot sequence ────────────────────────────────────────────────────

function coldBoot(executor, cpu, mem) {
  const result = executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  return result;
}

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
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
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, 12);
}

function seedModeBuffer(mem) {
  for (let i = 0; i < MODE_BUF_LEN; i++) {
    mem[MODE_BUF_START + i] = MODE_BUF_TEXT.charCodeAt(i);
  }
}

function seedDisplayBuffer(mem) {
  for (let i = 0; i < MODE_BUF_LEN; i++) {
    mem[DISPLAY_BUF_START + i] = MODE_BUF_TEXT.charCodeAt(i);
  }
}

// ── VRAM analysis helpers ────────────────────────────────────────────

function countPixels(mem, rowStart, rowEnd, colStart, colEnd) {
  let total = 0;
  let fg = 0;
  let bg = 0;
  let sentinel = 0;

  for (let row = rowStart; row <= rowEnd; row++) {
    for (let col = colStart; col <= colEnd; col++) {
      const pixel = readPixel(mem, row, col);
      if (pixel === VRAM_SENTINEL) {
        sentinel++;
      } else if (pixel === WHITE_PIXEL) {
        bg++;
        total++;
      } else {
        fg++;
        total++;
      }
    }
  }

  return { total, fg, bg, sentinel };
}

// ── Stage runner ─────────────────────────────────────────────────────

function runStage(executor, label, entry, maxSteps) {
  const result = executor.runFrom(entry, 'adl', {
    maxSteps,
    maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS,
  });

  console.log(`  ${label}: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)} loopsForced=${result.loopsForced}`);
  return result;
}

// ── Main ─────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Phase 187 — Stage 3 Max-Steps Investigation ===\n');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  clearVram(mem);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Boot
  console.log('[boot] cold boot + kernel init + post-init...');
  const bootResult = coldBoot(executor, cpu, mem);
  console.log(`[boot] done: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}\n`);

  // Snapshot
  const ramSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
  const cpuSnap = snapshotCpu(cpu);

  const report = [];
  report.push('# Phase 187 — Stage 3 Max-Steps Investigation');
  report.push('');
  report.push('Generated by `probe-phase187-stage3-investigation.mjs`.');
  report.push('');

  // ── Part A: Baseline at 50k steps ──────────────────────────────────

  console.log('=== Part A: Baseline verification (maxSteps=50000) ===');

  mem.set(ramSnap, 0x400000);
  clearVram(mem);
  restoreCpu(cpu, cpuSnap, mem);
  seedModeBuffer(mem);
  seedDisplayBuffer(mem);

  const resultA = runStage(executor, 'stage3 @50k', STAGE_3_ENTRY, 50000);

  const haltedAtExpected = resultA.termination === 'halt' && resultA.lastPc === 0x0019b5;
  const hitMaxSteps = resultA.termination === 'max_steps';

  report.push('## Part A — Baseline (maxSteps=50000)');
  report.push('');
  report.push(`- Entry: \`${hex(STAGE_3_ENTRY)}\``);
  report.push(`- IX: \`0xD1A860\``);
  report.push(`- Steps: **${resultA.steps}**`);
  report.push(`- Termination: \`${resultA.termination}\``);
  report.push(`- Last PC: \`${hex(resultA.lastPc)}\``);
  report.push(`- Loops forced: ${resultA.loopsForced}`);
  report.push(`- Halted at 0x0019b5: **${haltedAtExpected ? 'YES' : 'NO'}**`);
  report.push('');

  if (haltedAtExpected) {
    console.log(`\n  ** Stage 3 HALTED cleanly at ${hex(resultA.lastPc)} in ${resultA.steps} steps **`);
    console.log('  Priority is RESOLVED — stage 3 no longer hits maxSteps.\n');
    report.push('> **RESOLVED** — Stage 3 now halts naturally before the 50k limit.');
    report.push('');
  } else if (hitMaxSteps) {
    console.log(`\n  Stage 3 hit max_steps at ${hex(resultA.lastPc)} — needs extended run.\n`);
  } else {
    console.log(`\n  Stage 3 terminated with "${resultA.termination}" at ${hex(resultA.lastPc)}\n`);
  }

  // ── Part B: Extended runs (if needed) ──────────────────────────────

  let resultB100 = null;
  let resultB200 = null;

  if (hitMaxSteps) {
    console.log('=== Part B: Extended runs ===');

    // 100k run
    mem.set(ramSnap, 0x400000);
    clearVram(mem);
    restoreCpu(cpu, cpuSnap, mem);
    seedModeBuffer(mem);
    seedDisplayBuffer(mem);

    resultB100 = runStage(executor, 'stage3 @100k', STAGE_3_ENTRY, 100000);

    const vram100 = countPixels(mem, 0, VRAM_HEIGHT - 1, 0, VRAM_WIDTH - 1);
    const strip100 = countPixels(mem, STRIP_ROW_START, STRIP_ROW_END, 0, VRAM_WIDTH - 1);
    console.log(`  VRAM total: drawn=${vram100.total} fg=${vram100.fg} bg=${vram100.bg}`);
    console.log(`  Strip rows ${STRIP_ROW_START}-${STRIP_ROW_END}: fg=${strip100.fg}\n`);

    // 200k run
    mem.set(ramSnap, 0x400000);
    clearVram(mem);
    restoreCpu(cpu, cpuSnap, mem);
    seedModeBuffer(mem);
    seedDisplayBuffer(mem);

    resultB200 = runStage(executor, 'stage3 @200k', STAGE_3_ENTRY, 200000);

    const vram200 = countPixels(mem, 0, VRAM_HEIGHT - 1, 0, VRAM_WIDTH - 1);
    const strip200 = countPixels(mem, STRIP_ROW_START, STRIP_ROW_END, 0, VRAM_WIDTH - 1);
    console.log(`  VRAM total: drawn=${vram200.total} fg=${vram200.fg} bg=${vram200.bg}`);
    console.log(`  Strip rows ${STRIP_ROW_START}-${STRIP_ROW_END}: fg=${strip200.fg}\n`);

    report.push('## Part B — Extended Runs');
    report.push('');
    report.push('| Run | maxSteps | steps | termination | lastPc | loopsForced | VRAM fg | strip fg |');
    report.push('|-----|----------|-------|-------------|--------|-------------|---------|----------|');
    report.push(`| 100k | 100000 | ${resultB100.steps} | \`${resultB100.termination}\` | \`${hex(resultB100.lastPc)}\` | ${resultB100.loopsForced} | ${vram100.fg} | ${strip100.fg} |`);
    report.push(`| 200k | 200000 | ${resultB200.steps} | \`${resultB200.termination}\` | \`${hex(resultB200.lastPc)}\` | ${resultB200.loopsForced} | ${vram200.fg} | ${strip200.fg} |`);
    report.push('');

    if (resultB100.termination === 'halt') {
      console.log(`  ** Stage 3 halted at ${hex(resultB100.lastPc)} with 100k steps — needed more runway. **\n`);
      report.push(`> Stage 3 halts at \`${hex(resultB100.lastPc)}\` with 100k-step limit (${resultB100.steps} steps used).`);
      report.push('');
    } else if (resultB200.termination === 'halt') {
      console.log(`  ** Stage 3 halted at ${hex(resultB200.lastPc)} with 200k steps — needed more runway. **\n`);
      report.push(`> Stage 3 halts at \`${hex(resultB200.lastPc)}\` with 200k-step limit (${resultB200.steps} steps used).`);
      report.push('');
    } else {
      console.log('  Stage 3 still hitting max_steps at 200k — likely stuck in a loop.\n');
      report.push('> Stage 3 still hitting max_steps at 200k — loop detection needed.');
      report.push('');
    }
  }

  // ── Part C: Loop detection (if stuck) ──────────────────────────────

  const needsLoopDetection = hitMaxSteps &&
    resultB200 && resultB200.termination === 'max_steps';

  if (needsLoopDetection) {
    console.log('=== Part C: Loop detection (100k run with PC tracking) ===');

    mem.set(ramSnap, 0x400000);
    clearVram(mem);
    restoreCpu(cpu, cpuSnap, mem);
    seedModeBuffer(mem);
    seedDisplayBuffer(mem);

    const pcVisits = new Map();
    const resultC = executor.runFrom(STAGE_3_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS,
      onBlock(pc, mode, meta, step) {
        const addr = pc;
        pcVisits.set(addr, (pcVisits.get(addr) || 0) + 1);
      },
    });

    console.log(`  stage3 @100k (tracked): steps=${resultC.steps} term=${resultC.termination} lastPc=${hex(resultC.lastPc)}\n`);

    // Sort by visit count descending
    const sorted = [...pcVisits.entries()].sort((a, b) => b[1] - a[1]);
    const top20 = sorted.slice(0, 20);

    console.log('  Top 20 most-visited PCs:');
    for (const [pc, count] of top20) {
      // Read a few ROM bytes at this address for disassembly hints
      const bytes = [];
      for (let i = 0; i < 8; i++) {
        bytes.push(mem[pc + i]);
      }
      const byteStr = bytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
      console.log(`    ${hex(pc)}: ${count} visits  [${byteStr}]`);
    }

    // Identify the likely loop: top PC with > 1000 visits
    const loopCandidates = sorted.filter(([, count]) => count > 1000);
    console.log(`\n  Loop candidates (>1000 visits): ${loopCandidates.length}`);
    for (const [pc, count] of loopCandidates) {
      const bytes = [];
      for (let i = 0; i < 16; i++) {
        bytes.push(mem[pc + i]);
      }
      const byteStr = bytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
      console.log(`    ${hex(pc)}: ${count} visits  [${byteStr}]`);
    }

    // Also report blockVisits from the result
    const bvSorted = Object.entries(resultC.blockVisits).sort((a, b) => b[1] - a[1]);
    const bvTop10 = bvSorted.slice(0, 10);
    console.log('\n  Top 10 block visits (from executor):');
    for (const [key, count] of bvTop10) {
      console.log(`    ${key}: ${count}`);
    }

    report.push('## Part C — Loop Detection');
    report.push('');
    report.push('### Top 20 Most-Visited PCs');
    report.push('');
    report.push('| PC | Visits | Bytes (first 8) |');
    report.push('|---:|-------:|-----------------|');
    for (const [pc, count] of top20) {
      const bytes = [];
      for (let i = 0; i < 8; i++) bytes.push(mem[pc + i]);
      const byteStr = bytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
      report.push(`| \`${hex(pc)}\` | ${count} | \`${byteStr}\` |`);
    }
    report.push('');

    if (loopCandidates.length > 0) {
      report.push('### Loop Candidates (>1000 visits)');
      report.push('');
      for (const [pc, count] of loopCandidates) {
        const bytes = [];
        for (let i = 0; i < 16; i++) bytes.push(mem[pc + i]);
        const byteStr = bytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
        report.push(`- \`${hex(pc)}\`: ${count} visits — bytes: \`${byteStr}\``);
      }
      report.push('');
    }

    report.push('### Top 10 Block Visits');
    report.push('');
    report.push('| Block Key | Visits |');
    report.push('|-----------|-------:|');
    for (const [key, count] of bvTop10) {
      report.push(`| \`${key}\` | ${count} |`);
    }
    report.push('');
    console.log('');
  }

  // ── Part D: VRAM analysis ──────────────────────────────────────────

  console.log('=== Part D: VRAM analysis (after Part A run) ===');

  // Re-run Part A to get the VRAM state for analysis
  mem.set(ramSnap, 0x400000);
  clearVram(mem);
  restoreCpu(cpu, cpuSnap, mem);
  seedModeBuffer(mem);
  seedDisplayBuffer(mem);

  runStage(executor, 'stage3 @50k (for VRAM)', STAGE_3_ENTRY, 50000);

  const vramAll = countPixels(mem, 0, VRAM_HEIGHT - 1, 0, VRAM_WIDTH - 1);
  const vramStrip = countPixels(mem, STRIP_ROW_START, STRIP_ROW_END, 0, VRAM_WIDTH - 1);
  const vramStatusBar = countPixels(mem, 0, 36, 0, VRAM_WIDTH - 1);

  console.log(`  Full VRAM:    total=${vramAll.total} fg=${vramAll.fg} bg=${vramAll.bg} sentinel=${vramAll.sentinel}`);
  console.log(`  Status bar (rows 0-36):  fg=${vramStatusBar.fg} bg=${vramStatusBar.bg}`);
  console.log(`  Text strip (rows ${STRIP_ROW_START}-${STRIP_ROW_END}): fg=${vramStrip.fg} bg=${vramStrip.bg}`);
  console.log(`  Baselines: ~936 fg (no seed) vs ~968 fg (with seed)`);
  console.log('');

  report.push('## Part D — VRAM Analysis');
  report.push('');
  report.push('After stage 3 run with maxSteps=50000:');
  report.push('');
  report.push('| Region | Rows | Total drawn | FG (non-white) | BG (white) | Sentinel |');
  report.push('|--------|------|-------------|----------------|------------|----------|');
  report.push(`| Full VRAM | 0-239 | ${vramAll.total} | ${vramAll.fg} | ${vramAll.bg} | ${vramAll.sentinel} |`);
  report.push(`| Status bar | 0-36 | ${vramStatusBar.total} | ${vramStatusBar.fg} | ${vramStatusBar.bg} | ${vramStatusBar.sentinel} |`);
  report.push(`| Text strip | ${STRIP_ROW_START}-${STRIP_ROW_END} | ${vramStrip.total} | ${vramStrip.fg} | ${vramStrip.bg} | ${vramStrip.sentinel} |`);
  report.push('');
  report.push('Known baselines: ~936 fg pixels (no display buf seed), ~968 fg pixels (with seed).');
  report.push('');

  // ── Summary ────────────────────────────────────────────────────────

  console.log('=== Summary ===');

  let conclusion;
  if (haltedAtExpected) {
    conclusion = `RESOLVED: Stage 3 halts at ${hex(resultA.lastPc)} in ${resultA.steps} steps (well under the 50k limit).`;
  } else if (hitMaxSteps && resultB100 && resultB100.termination === 'halt') {
    conclusion = `NEEDS MORE RUNWAY: Stage 3 halts at ${hex(resultB100.lastPc)} in ${resultB100.steps} steps — increase maxSteps from 50k to at least ${Math.ceil(resultB100.steps / 10000) * 10000 + 10000}.`;
  } else if (hitMaxSteps && resultB200 && resultB200.termination === 'halt') {
    conclusion = `NEEDS MORE RUNWAY: Stage 3 halts at ${hex(resultB200.lastPc)} in ${resultB200.steps} steps — increase maxSteps to at least ${Math.ceil(resultB200.steps / 10000) * 10000 + 10000}.`;
  } else if (needsLoopDetection) {
    conclusion = 'STUCK IN LOOP: Stage 3 does not halt even at 200k steps. Loop detection data collected — see Part C.';
  } else {
    conclusion = `UNKNOWN: Stage 3 terminated with "${resultA.termination}" at ${hex(resultA.lastPc)}.`;
  }

  console.log(`  ${conclusion}`);
  console.log(`  Text strip fg pixels: ${vramStrip.fg}`);
  console.log('');

  report.push('## Summary');
  report.push('');
  report.push(`**${conclusion}**`);
  report.push('');
  report.push(`Text strip foreground pixels: ${vramStrip.fg}`);
  report.push('');

  // Write report
  const reportText = report.join('\n') + '\n';
  fs.writeFileSync(REPORT_PATH, reportText);
  console.log(`Report written to: ${REPORT_PATH}`);
}

try {
  await main();
} catch (error) {
  console.error('FATAL ERROR:', error.stack || error);
  const failReport = [
    '# Phase 187 — Stage 3 Max-Steps Investigation',
    '',
    'Generated by `probe-phase187-stage3-investigation.mjs`.',
    '',
    '## Failure',
    '',
    '```text',
    error.stack || String(error),
    '```',
    '',
  ].join('\n');
  fs.writeFileSync(REPORT_PATH, failReport);
  process.exitCode = 1;
}
