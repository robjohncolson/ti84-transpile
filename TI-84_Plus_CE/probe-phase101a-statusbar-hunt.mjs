#!/usr/bin/env node
// Phase 101A — status bar r0-16 hunt
// Probes Phase 95 candidates + unprobed 0a3300-0a34ff blocks to find
// which functions actually render into VRAM rows 0-16.

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
const REPORT_PATH = path.join(__dirname, 'phase101a-statusbar-report.md');

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

// ── Memory layout ──────────────────────────────────────────────────────────────
const MEM_SIZE       = 0x1000000;
const VRAM_BASE      = 0xD40000;
const VRAM_WIDTH     = 320;
const VRAM_HEIGHT    = 240;
const VRAM_BYTE_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;
const VRAM_SENTINEL  = 0xAAAA;
const WHITE_PIXEL    = 0xFFFF;

// ── Boot constants (mirrored from probe-phase99d-home-verify.mjs) ───────────────
const BOOT_ENTRY              = 0x000000;
const BOOT_MODE               = 'z80';
const BOOT_MAX_STEPS          = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP         = 0xD1A87E;
const KERNEL_INIT_ENTRY       = 0x08C331;
const POST_INIT_ENTRY         = 0x0802B2;
const STAGE_1_ENTRY           = 0x0A2B72;   // status-bar background
const STAGE_3_ENTRY           = 0x0A29EC;   // home row strip
const STAGE_4_ENTRY           = 0x0A2854;   // history area
const STAGE_MAX_LOOP_ITERATIONS = 500;

const MODE_BUF_START = 0xD020A6;
const MODE_BUF_TEXT  = 'Normal Float Radian       ';
const MODE_BUF_LEN   = 26;

const ENTRY_FILL_ROW_START = 220;
const ENTRY_FILL_ROW_END   = 239;

// ── Phase 95 known candidates ──────────────────────────────────────────────────
const PHASE95_CANDIDATES = [0x0a3320, 0x0a3365, 0x0a336f, 0x0a3408];

// ── CPU snapshot fields ────────────────────────────────────────────────────────
const CPU_SNAPSHOT_FIELDS = [
  'a','f','_bc','_de','_hl','_a2','_f2','_bc2','_de2','_hl2',
  'sp','_ix','_iy','i','im','iff1','iff2','madl','mbase','halted','cycles',
];

// ── Helpers (copied from probe-phase99d-home-verify.mjs) ──────────────────────

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function clearVram(mem) {
  mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);
}

function readPixel(mem, row, col) {
  if (row < 0 || row >= VRAM_HEIGHT || col < 0 || col >= VRAM_WIDTH) return VRAM_SENTINEL;
  const off = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
  return mem[off] | (mem[off + 1] << 8);
}

function coldBoot(executor, cpu, mem) {
  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  return result;
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((f) => [f, cpu[f]]));
}

function restoreCpu(cpu, snapshot, mem) {
  for (const [f, v] of Object.entries(snapshot)) cpu[f] = v;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f  = 0x40;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function seedModeBuffer(mem) {
  for (let i = 0; i < MODE_BUF_LEN; i++) {
    mem[MODE_BUF_START + i] = MODE_BUF_TEXT.charCodeAt(i);
  }
}

function fillEntryLineWhite(mem) {
  for (let row = ENTRY_FILL_ROW_START; row <= ENTRY_FILL_ROW_END; row++) {
    for (let col = 0; col < VRAM_WIDTH; col++) {
      const off = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
      mem[off] = 0xFF; mem[off + 1] = 0xFF;
    }
  }
}

// ── VRAM analysis helpers ──────────────────────────────────────────────────────

/** Count pixels changed from sentinel in a row range.  Returns counts + bbox. */
function analyzeVramRows(mem, rowStart, rowEnd) {
  let drawn = 0, fg = 0, bg = 0;
  let rMin = rowEnd + 1, rMax = rowStart - 1;
  let cMin = VRAM_WIDTH, cMax = -1;

  for (let row = rowStart; row <= rowEnd; row++) {
    for (let col = 0; col < VRAM_WIDTH; col++) {
      const px = readPixel(mem, row, col);
      if (px === VRAM_SENTINEL) continue;
      drawn++;
      if (px === WHITE_PIXEL) { bg++; } else { fg++; }
      if (row < rMin) rMin = row;
      if (row > rMax) rMax = row;
      if (col < cMin) cMin = col;
      if (col > cMax) cMax = col;
    }
  }

  return {
    drawn, fg, bg,
    rMin: rMax < rowStart ? null : rMin,
    rMax: rMax < rowStart ? null : rMax,
    cMin: cMax < 0 ? null : cMin,
    cMax: cMax < 0 ? null : cMax,
  };
}

/** Check whether any VRAM write in r0-16 occurred since before (compares to sentinel baseline). */
function hitsR0_16(mem) {
  const stats = analyzeVramRows(mem, 0, 16);
  return stats.drawn > 0;
}

// ── Build baseline composite (matches probe-phase99d-home-verify.mjs stages) ──

function buildBaseline(executor, cpu, mem, cpuSnap, ramSnap) {
  mem.set(ramSnap, 0x400000);
  clearVram(mem);
  restoreCpu(cpu, cpuSnap, mem);

  // stage 1: status-bar background (fills r0-16 white)
  executor.runFrom(STAGE_1_ENTRY, 'adl', { maxSteps: 30000, maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS });

  // stage 2: seed mode buffer
  seedModeBuffer(mem);
  restoreCpu(cpu, cpuSnap, mem);

  // stage 3: home row strip
  executor.runFrom(STAGE_3_ENTRY, 'adl', { maxSteps: 50000, maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS });
  restoreCpu(cpu, cpuSnap, mem);

  // stage 4: history area
  executor.runFrom(STAGE_4_ENTRY, 'adl', { maxSteps: 50000, maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS });

  // stage 5: direct fill entry rows
  fillEntryLineWhite(mem);
}

// ── Probe one candidate ────────────────────────────────────────────────────────

function probeCandidate(addr, executor, cpu, mem, cpuSnap, ramSnap) {
  // Restore baseline + fresh snapshot for this probe
  buildBaseline(executor, cpu, mem, cpuSnap, ramSnap);

  // Count r0-16 pixels BEFORE calling candidate (should all be white from stage1)
  const before = analyzeVramRows(mem, 0, 16);

  // Restore CPU and call candidate
  restoreCpu(cpu, cpuSnap, mem);

  let result;
  let err = null;
  try {
    result = executor.runFrom(addr, 'adl', { maxSteps: 30000, maxLoopIterations: 500 });
  } catch (e) {
    result = { steps: 0, termination: 'error', lastPc: null };
    err = e.message ?? String(e);
  }

  // Count r0-16 pixels AFTER
  const after = analyzeVramRows(mem, 0, 16);

  // New pixels in r0-16 = pixels that changed from white to non-white (or from sentinel to anything)
  // Actually: count fg pixels after (white background was already set, fg = new colored marks)
  const newFg = after.fg - before.fg;
  const newBg = after.bg - before.bg;    // new white pixels on top of existing white = 0 net
  const newDrawn = after.drawn - before.drawn;

  // Also count ALL drawn in full VRAM to gauge scope
  const fullStats = analyzeVramRows(mem, 0, VRAM_HEIGHT - 1);

  return {
    addr,
    termination: result.termination,
    steps: result.steps,
    lastPc: result.lastPc,
    err,
    // Full VRAM counts
    drawn: fullStats.drawn,
    fg:    fullStats.fg,
    bg:    fullStats.bg,
    // r0-16 specific
    r016_drawn: after.drawn,
    r016_fg:    after.fg,
    r016_bg:    after.bg,
    r016_rMin:  after.rMin,
    r016_rMax:  after.rMax,
    r016_cMin:  after.cMin,
    r016_cMax:  after.cMax,
    hits_r0_16: after.fg > before.fg,  // true if candidate added fg pixels to r0-16
    new_fg: newFg,
  };
}

// ── Decode r0-16 text in current VRAM state ────────────────────────────────────

function decodeR016(mem, signatures) {
  const results = [];
  // Try multiple start rows (0-14) and start cols (0-8), stride=12, compareWidth=10
  for (let startRow = 0; startRow <= 14; startRow++) {
    for (let startCol = 0; startCol <= 8; startCol++) {
      const text = decodeTextStrip(
        mem, startRow, startCol,
        10,           // decode ~10 cells (fits within 320px at stride=12)
        signatures,
        40,
        'auto',
        12,           // stride
        10,           // compareWidth
      );
      // Only report if we see recognizable ASCII (letters or digits, not all '?')
      const alphaCount = [...text].filter(c => /[A-Za-z0-9]/.test(c)).length;
      if (alphaCount >= 2) {
        results.push({ startRow, startCol, text, alphaCount });
      }
    }
  }
  results.sort((a, b) => b.alphaCount - a.alphaCount);
  return results;
}

// ── Report builder ─────────────────────────────────────────────────────────────

function buildReport({ probeResults, preblockedKeys, combinedDecodes, r016BaselineIsWhite }) {
  const lines = [];

  lines.push('# Phase 101A — Status Bar r0-16 Hunt');
  lines.push('');
  lines.push('Generated by `probe-phase101a-statusbar-hunt.mjs`.');
  lines.push('');
  lines.push(`- Font: base=\`${hex(FONT_BASE, 6)}\` glyph=\`${GLYPH_WIDTH}x${GLYPH_HEIGHT}\``);
  lines.push(`- r0-16 baseline all-white: \`${r016BaselineIsWhite}\``);
  lines.push('');

  lines.push('## Candidate Probe Results');
  lines.push('');
  lines.push('| entry | steps | term | err | drawn(all) | fg(all) | r016_drawn | r016_fg | r016_rMin | r016_rMax | r016_cMin | r016_cMax | hits_r0_16 |');
  lines.push('|---|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---|');

  for (const r of probeResults) {
    const errStr = r.err ? r.err.slice(0, 40) : '';
    lines.push(
      `| \`${hex(r.addr)}\` | ${r.steps} | \`${r.termination}\` | ${errStr} ` +
      `| ${r.drawn} | ${r.fg} ` +
      `| ${r.r016_drawn} | ${r.r016_fg} ` +
      `| ${r.r016_rMin ?? 'n/a'} | ${r.r016_rMax ?? 'n/a'} ` +
      `| ${r.r016_cMin ?? 'n/a'} | ${r.r016_cMax ?? 'n/a'} ` +
      `| **${r.hits_r0_16}** |`
    );
  }

  lines.push('');
  lines.push('## PRELIFTED_BLOCKS Keys in 0a3300-0a34ff');
  lines.push('');
  lines.push(`Total: ${preblockedKeys.length} keys`);
  lines.push('');
  lines.push('```');
  for (const k of preblockedKeys) lines.push(`  ${k}`);
  lines.push('```');

  lines.push('');
  lines.push('## Combined Composite r0-16 Decode');
  lines.push('');

  if (combinedDecodes.length === 0) {
    lines.push('No recognizable ASCII found in r0-16 after combined composite.');
  } else {
    lines.push('| startRow | startCol | alphaCount | text |');
    lines.push('|---:|---:|---:|---|');
    for (const d of combinedDecodes.slice(0, 20)) {
      lines.push(`| ${d.startRow} | ${d.startCol} | ${d.alphaCount} | \`${d.text}\` |`);
    }
  }

  lines.push('');
  lines.push('## Summary & Next Steps');
  lines.push('');

  const hitters = probeResults.filter(r => r.hits_r0_16);
  if (hitters.length === 0) {
    lines.push('- **No Phase 95 candidate drew fg pixels to r0-16.**');
    lines.push('- r0-16 remains white after all probed functions run on top of baseline.');
    lines.push('- Recommendation: scan ROM for VRAM writes targeting byte offsets');
    lines.push('  `D40000` – `D48BFE` (rows 0-16 * 320 * 2 bytes = byte offset < 0x88BF).');
    lines.push('  Grep `PRELIFTED_BLOCKS` src or use a VRAM-trace run from a broader entry point.');
  } else {
    lines.push('- **Candidates that drew to r0-16:**');
    for (const h of hitters) {
      lines.push(`  - \`${hex(h.addr)}\`: new_fg=${h.new_fg} bbox r[${h.r016_rMin}-${h.r016_rMax}] c[${h.r016_cMin}-${h.r016_cMax}]`);
    }
    if (combinedDecodes.length > 0) {
      lines.push(`- Best decode attempt: row=${combinedDecodes[0].startRow} col=${combinedDecodes[0].startCol} text=\`${combinedDecodes[0].text}\``);
    }
    lines.push('- Recommendation: promote top hitter to stage 0 in composite and re-run golden regression.');
  }

  return `${lines.join('\n')}\n`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Phase 101A — Status Bar r0-16 Hunt ===');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  clearVram(mem);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor    = createExecutor(BLOCKS, mem, { peripherals });
  const cpu         = executor.cpu;

  // Cold boot
  console.log('coldBoot...');
  const bootResult = coldBoot(executor, cpu, mem);
  console.log(`  boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc, 6)}`);

  // Snapshot post-boot state
  const ramSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
  const cpuSnap = snapshotCpu(cpu);

  // Build baseline once to check r0-16 is white
  console.log('buildBaseline for whiteness check...');
  buildBaseline(executor, cpu, mem, cpuSnap, ramSnap);
  const baselineR016 = analyzeVramRows(mem, 0, 16);
  const r016BaselineIsWhite = baselineR016.fg === 0 && baselineR016.drawn > 0;
  console.log(`  r0-16 baseline: drawn=${baselineR016.drawn} fg=${baselineR016.fg} bg=${baselineR016.bg} allWhite=${r016BaselineIsWhite}`);

  // ── Enumerate unprobed keys in 0a3300-0a34ff ────────────────────────────────
  const allBlockKeys = Object.keys(BLOCKS);
  const preblockedKeys = allBlockKeys
    .filter(k => k >= '0a3300:adl' && k <= '0a34ff:zzz')
    .sort();

  // Already-probed set (Phase 95 candidates)
  const probedSet = new Set(PHASE95_CANDIDATES.map(a => `${a.toString(16).padStart(6,'0')}:adl`));

  // Additional unprobed entries (up to 10)
  const unprobedAddrs = preblockedKeys
    .filter(k => !probedSet.has(k))
    .slice(0, 10)
    .map(k => parseInt(k.split(':')[0], 16));

  console.log(`PRELIFTED_BLOCKS in 0a3300-0a34ff: ${preblockedKeys.length} total, probing ${unprobedAddrs.length} extra`);

  const candidateAddrs = [...PHASE95_CANDIDATES, ...unprobedAddrs];
  console.log(`Total candidates: ${candidateAddrs.length}`);

  // ── Probe each candidate ────────────────────────────────────────────────────
  const probeResults = [];
  for (const addr of candidateAddrs) {
    console.log(`  probe ${hex(addr)}...`);
    const r = probeCandidate(addr, executor, cpu, mem, cpuSnap, ramSnap);
    probeResults.push(r);
    console.log(`    term=${r.termination} steps=${r.steps} hits_r0_16=${r.hits_r0_16} r016_fg=${r.r016_fg} new_fg=${r.new_fg} err=${r.err ?? 'none'}`);
  }

  // ── Combined composite: run ALL candidates in sequence on top of baseline ──
  console.log('Building combined composite...');
  buildBaseline(executor, cpu, mem, cpuSnap, ramSnap);

  for (const addr of candidateAddrs) {
    restoreCpu(cpu, cpuSnap, mem);
    try {
      executor.runFrom(addr, 'adl', { maxSteps: 30000, maxLoopIterations: 500 });
    } catch (_) {
      // skip errors silently in combined run
    }
  }

  const combinedR016 = analyzeVramRows(mem, 0, 16);
  console.log(`combined r0-16: drawn=${combinedR016.drawn} fg=${combinedR016.fg} bg=${combinedR016.bg}`);

  // ── Decode r0-16 of combined composite ──────────────────────────────────────
  let combinedDecodes = [];
  if (combinedR016.fg > 0) {
    console.log('Decoding r0-16 text...');
    const signatures = buildFontSignatures(romBytes);
    combinedDecodes = decodeR016(mem, signatures);
    console.log(`  decode attempts with alpha: ${combinedDecodes.length}`);
    if (combinedDecodes.length > 0) {
      console.log(`  best: row=${combinedDecodes[0].startRow} col=${combinedDecodes[0].startCol} text="${combinedDecodes[0].text}"`);
    }
  } else {
    console.log('Skipping decode (no fg pixels in r0-16 after combined composite)');
  }

  // ── Write report ────────────────────────────────────────────────────────────
  const report = buildReport({ probeResults, preblockedKeys, combinedDecodes, r016BaselineIsWhite });
  fs.writeFileSync(REPORT_PATH, report);
  console.log(`report written: ${REPORT_PATH}`);

  // ── Exit summary ────────────────────────────────────────────────────────────
  const hitters = probeResults.filter(r => r.hits_r0_16);
  console.log(`\nhitters (drew fg to r0-16): ${hitters.length}`);
  hitters.forEach(h => console.log(`  ${hex(h.addr)}: new_fg=${h.new_fg}`));
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}
