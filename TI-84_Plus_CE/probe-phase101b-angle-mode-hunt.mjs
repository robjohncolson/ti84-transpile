#!/usr/bin/env node
// Phase 101B — angle mode indicator text hunt in r0-16
// Scans PRELIFTED_BLOCKS 0x0a2b00-0x0a3100 for any function that draws
// to VRAM rows 0-16, especially cols 0-80 where 'RAD'/'DEG' would appear.

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
const REPORT_PATH = path.join(__dirname, 'phase101b-angle-mode-report.md');

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

// ── Boot / stage constants (golden regression pattern from probe-phase99d) ─────
const BOOT_ENTRY               = 0x000000;
const BOOT_MODE                = 'z80';
const BOOT_MAX_STEPS           = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP          = 0xD1A87E;
const KERNEL_INIT_ENTRY        = 0x08C331;
const POST_INIT_ENTRY          = 0x0802B2;
const STAGE_1_ENTRY            = 0x0A2B72;   // status-bar background
const STAGE_3_ENTRY            = 0x0A29EC;   // home row strip
const STAGE_4_ENTRY            = 0x0A2854;   // history area
const STAGE_MAX_LOOP_ITERATIONS = 500;

const MODE_BUF_START = 0xD020A6;
const MODE_BUF_TEXT  = 'Normal Float Radian       ';
const MODE_BUF_LEN   = 26;

const ENTRY_FILL_ROW_START = 220;
const ENTRY_FILL_ROW_END   = 239;

// ── Scan range ─────────────────────────────────────────────────────────────────
const SCAN_LO = 0x0a2b00;
const SCAN_HI = 0x0a3100;

// ── CPU snapshot fields ────────────────────────────────────────────────────────
const CPU_SNAPSHOT_FIELDS = [
  'a','f','_bc','_de','_hl','_a2','_f2','_bc2','_de2','_hl2',
  'sp','_ix','_iy','i','im','iff1','iff2','madl','mbase','halted','cycles',
];

// ── Core helpers (from probe-phase99d-home-verify.mjs) ──────────────────────

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
  cpu.f   = 0x40;
  cpu.sp  = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, 12);
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

// ── VRAM helpers ───────────────────────────────────────────────────────────────

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

/** Count fg pixels in r0-16, cols 0-79 only. */
function fgInLeftZone(mem) {
  let count = 0;
  for (let row = 0; row <= 16; row++) {
    for (let col = 0; col < 80; col++) {
      const px = readPixel(mem, row, col);
      if (px !== VRAM_SENTINEL && px !== WHITE_PIXEL) count++;
    }
  }
  return count;
}

// ── Build baseline composite ───────────────────────────────────────────────────

function buildBaseline(executor, cpu, mem, cpuSnap, ramSnap) {
  mem.set(ramSnap, 0x400000);
  clearVram(mem);
  restoreCpu(cpu, cpuSnap, mem);

  executor.runFrom(STAGE_1_ENTRY, 'adl', { maxSteps: 30000, maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS });

  seedModeBuffer(mem);
  restoreCpu(cpu, cpuSnap, mem);

  executor.runFrom(STAGE_3_ENTRY, 'adl', { maxSteps: 50000, maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS });
  restoreCpu(cpu, cpuSnap, mem);

  executor.runFrom(STAGE_4_ENTRY, 'adl', { maxSteps: 50000, maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS });

  fillEntryLineWhite(mem);
}

// ── ASCII art dump of r0-16, cols 0-119 ───────────────────────────────────────

function asciiArtR016(mem, colEnd = 119) {
  const lines = [];
  for (let row = 0; row <= 16; row++) {
    let line = `r${String(row).padStart(2, '0')}|`;
    for (let col = 0; col <= colEnd; col++) {
      const px = readPixel(mem, row, col);
      if (px === VRAM_SENTINEL) {
        line += '?';
      } else if (px === WHITE_PIXEL) {
        line += '.';
      } else {
        line += '#';
      }
    }
    lines.push(line);
  }
  return lines;
}

// ── Font decode r0-16 with multiple stride/compareWidth variants ───────────────

function decodeR016Multi(mem, signatures) {
  const results = [];

  // stride=12 compareWidth=10 (standard large font)
  // stride=8 compareWidth=8 (condensed large font or small font)
  // stride=7 compareWidth=7 (possible small font variant for status bar)
  const variants = [
    { stride: 12, compareWidth: 10, numCells: 10 },
    { stride: 8,  compareWidth:  8, numCells: 12 },
    { stride: 7,  compareWidth:  7, numCells: 12 },
  ];

  for (const v of variants) {
    for (let startRow = 0; startRow <= 10; startRow++) {
      for (let startCol = 0; startCol <= 5; startCol++) {
        const text = decodeTextStrip(
          mem, startRow, startCol,
          v.numCells,
          signatures,
          40,
          'auto',
          v.stride,
          v.compareWidth,
        );
        const alphaCount = [...text].filter(c => /[A-Za-z0-9]/.test(c)).length;
        if (alphaCount >= 2) {
          results.push({ startRow, startCol, stride: v.stride, compareWidth: v.compareWidth, text, alphaCount });
        }
      }
    }
  }

  results.sort((a, b) => b.alphaCount - a.alphaCount);
  return results;
}

// ── Snapshot / restore VRAM ────────────────────────────────────────────────────

function snapshotVram(mem) {
  return new Uint8Array(mem.slice(VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE));
}

function restoreVram(mem, snap) {
  mem.set(snap, VRAM_BASE);
}

// ── Report builder ─────────────────────────────────────────────────────────────

function buildReport({
  candidateList,
  probeResults,
  shortList,
  detailedResults,
  combinedDecodes,
  combinedAscii,
}) {
  const lines = [];

  lines.push('# Phase 101B — Angle Mode Indicator Hunt');
  lines.push('');
  lines.push('Generated by `probe-phase101b-angle-mode-hunt.mjs`.');
  lines.push('');
  lines.push(`- Font: base=\`${hex(FONT_BASE, 6)}\` glyph=\`${GLYPH_WIDTH}x${GLYPH_HEIGHT}\``);
  lines.push(`- Scan range: \`${hex(SCAN_LO)}\` – \`${hex(SCAN_HI)}\``);
  lines.push(`- Candidates tested: ${candidateList.length}`);
  lines.push('');

  lines.push('## Candidate Probe Results');
  lines.push('');
  lines.push('| entry | steps | term | r016_fg | leftZone_fg | cMin | cMax | shortListed |');
  lines.push('|---|---:|---|---:|---:|---:|---:|---|');

  for (const r of probeResults) {
    const sl = shortList.includes(r.addr) ? '**YES**' : '';
    lines.push(
      `| \`${hex(r.addr)}\` | ${r.steps} | \`${r.termination}\` ` +
      `| ${r.r016_fg} | ${r.leftZoneFg} ` +
      `| ${r.cMin ?? 'n/a'} | ${r.cMax ?? 'n/a'} | ${sl} |`
    );
  }

  lines.push('');
  lines.push('## Short-Listed Detailed Results');
  lines.push('');

  if (detailedResults.length === 0) {
    lines.push('No short-listed candidates (none drew ≥10 fg pixels in r0-16 with cMin<80).');
  }

  for (const dr of detailedResults) {
    lines.push(`### ${hex(dr.addr)}`);
    lines.push('');
    lines.push(`- r016_fg: ${dr.r016_fg}, leftZone_fg: ${dr.leftZoneFg}`);
    lines.push(`- bbox: r[${dr.rMin}-${dr.rMax}] c[${dr.cMin}-${dr.cMax}]`);
    lines.push('');
    lines.push('**ASCII art (r0-16, cols 0-99):**');
    lines.push('');
    lines.push('```');
    for (const line of dr.ascii) lines.push(line);
    lines.push('```');
    lines.push('');

    if (dr.decodes.length === 0) {
      lines.push('No decode attempts with ≥2 alpha chars found.');
    } else {
      lines.push('**Decode attempts (top 10):**');
      lines.push('');
      lines.push('| startRow | startCol | stride | cmpW | alphaCount | text |');
      lines.push('|---:|---:|---:|---:|---:|---|');
      for (const d of dr.decodes.slice(0, 10)) {
        lines.push(
          `| ${d.startRow} | ${d.startCol} | ${d.stride} | ${d.compareWidth} | ${d.alphaCount} | \`${d.text}\` |`
        );
      }
    }
    lines.push('');
  }

  lines.push('## Combined Composite r0-16 Decode');
  lines.push('');
  lines.push('All short-listed candidates chained after baseline:');
  lines.push('');
  lines.push('**ASCII art (r0-16, cols 0-119):**');
  lines.push('');
  lines.push('```');
  for (const line of combinedAscii) lines.push(line);
  lines.push('```');
  lines.push('');

  if (combinedDecodes.length === 0) {
    lines.push('No recognizable ASCII found in combined r0-16.');
  } else {
    lines.push('| startRow | startCol | stride | cmpW | alphaCount | text |');
    lines.push('|---:|---:|---:|---:|---:|---|');
    for (const d of combinedDecodes.slice(0, 20)) {
      lines.push(
        `| ${d.startRow} | ${d.startCol} | ${d.stride} | ${d.compareWidth} | ${d.alphaCount} | \`${d.text}\` |`
      );
    }
  }

  lines.push('');
  lines.push('## Recommendation');
  lines.push('');

  const textHits = combinedDecodes.filter(d => /RAD|DEG|Rad|Deg|rad|deg/i.test(d.text));
  if (textHits.length > 0) {
    lines.push(`- **SUCCESS**: Decoded angle mode text in r0-16: \`${textHits[0].text}\``);
    lines.push(`  at row=${textHits[0].startRow} col=${textHits[0].startCol} stride=${textHits[0].stride}`);
  } else if (shortList.length > 0) {
    lines.push(`- Short-listed ${shortList.length} candidate(s) drew fg pixels to r0-16 cols<80.`);
    lines.push(`- Best candidate: \`${hex(shortList[0])}\``);
    lines.push('- No RAD/DEG text decoded yet — try extending combinedComposite with status-bar entry points');
    lines.push('  in range 0x0a2b72 callers, or check if angle mode indicator requires separate RAM state setup.');
  } else {
    lines.push('- No candidate in 0x0a2b00-0x0a3100 drew fg pixels to r0-16 cols 0-79.');
    lines.push('- Fallback: check 0x0a3100-0x0a2bff gap (overlap scan) or look for angle mode in status bar');
    lines.push('  renderer called by a higher-level function that chains: status bg → mode text → icons.');
    lines.push('- Consider tracing from 0x0a2b72 caller (who calls stage 1) to find angle mode renderer sibling.');
  }

  return `${lines.join('\n')}\n`;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Phase 101B — Angle Mode Indicator Hunt ===');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  clearVram(mem);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor    = createExecutor(BLOCKS, mem, { peripherals });
  const cpu         = executor.cpu;

  // Cold boot + post-init snapshot
  console.log('coldBoot...');
  const bootResult = coldBoot(executor, cpu, mem);
  console.log(`  steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc, 6)}`);

  const ramSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
  const cpuSnap = snapshotCpu(cpu);

  // Build baseline composite once and snapshot VRAM
  console.log('buildBaseline...');
  buildBaseline(executor, cpu, mem, cpuSnap, ramSnap);
  const baselineVramSnap = snapshotVram(mem);
  const baselineR016 = analyzeVramRows(mem, 0, 16);
  console.log(`  baseline r0-16: drawn=${baselineR016.drawn} fg=${baselineR016.fg} bg=${baselineR016.bg}`);

  // ── Collect candidates in 0x0a2b00-0x0a3100 ─────────────────────────────────
  const allKeys = Object.keys(BLOCKS);
  const candidateKeys = allKeys
    .filter(k => {
      const parts = k.split(':');
      if (parts.length < 1) return false;
      const addr = parseInt(parts[0], 16);
      return addr >= SCAN_LO && addr < SCAN_HI;
    })
    .sort();

  // Cap at 150 to stay within time budget
  const cappedKeys = candidateKeys.slice(0, 150);
  const candidateAddrs = cappedKeys.map(k => parseInt(k.split(':')[0], 16));

  console.log(`Candidates in range: ${candidateKeys.length}, probing: ${candidateAddrs.length}`);

  // ── Probe each candidate ─────────────────────────────────────────────────────
  const probeResults = [];
  const signatures = buildFontSignatures(romBytes);

  for (const addr of candidateAddrs) {
    // Restore baseline VRAM and CPU state
    restoreVram(mem, baselineVramSnap);
    restoreCpu(cpu, cpuSnap, mem);

    let result;
    let err = null;
    try {
      result = executor.runFrom(addr, 'adl', { maxSteps: 20000, maxLoopIterations: 500 });
    } catch (e) {
      result = { steps: 0, termination: 'error', lastPc: null };
      err = e.message ?? String(e);
    }

    const r016 = analyzeVramRows(mem, 0, 16);
    const leftFg = fgInLeftZone(mem);

    probeResults.push({
      addr,
      termination: result.termination,
      steps: result.steps,
      lastPc: result.lastPc,
      err,
      r016_fg: r016.fg,
      leftZoneFg: leftFg,
      cMin: r016.cMin,
      cMax: r016.cMax,
      rMin: r016.rMin,
      rMax: r016.rMax,
    });

    if (leftFg > 0) {
      console.log(`  [LEFTZONE] ${hex(addr)}: steps=${result.steps} r016_fg=${r016.fg} leftFg=${leftFg} cMin=${r016.cMin}`);
    }
  }

  // ── Short-list: ≥10 fg pixels in r0-16 AND cMin < 80 ────────────────────────
  const shortList = probeResults
    .filter(r => r.r016_fg >= 10 && r.cMin != null && r.cMin < 80)
    .map(r => r.addr);

  console.log(`Short-listed: ${shortList.length} candidates`);
  shortList.forEach(a => console.log(`  ${hex(a)}`));

  // ── Detailed probe for short-listed candidates ───────────────────────────────
  const detailedResults = [];

  for (const addr of shortList) {
    console.log(`detailing ${hex(addr)}...`);

    restoreVram(mem, baselineVramSnap);
    restoreCpu(cpu, cpuSnap, mem);

    let result;
    try {
      result = executor.runFrom(addr, 'adl', { maxSteps: 20000, maxLoopIterations: 500 });
    } catch (e) {
      result = { steps: 0, termination: 'error', lastPc: null };
    }

    const r016 = analyzeVramRows(mem, 0, 16);
    const leftFg = fgInLeftZone(mem);
    const ascii = asciiArtR016(mem, 99);
    const decodes = decodeR016Multi(mem, signatures);

    detailedResults.push({
      addr,
      r016_fg: r016.fg,
      leftZoneFg: leftFg,
      rMin: r016.rMin,
      rMax: r016.rMax,
      cMin: r016.cMin,
      cMax: r016.cMax,
      ascii,
      decodes,
    });

    if (decodes.length > 0) {
      console.log(`  best decode: row=${decodes[0].startRow} col=${decodes[0].startCol} stride=${decodes[0].stride} text="${decodes[0].text}"`);
    }
  }

  // ── Combined composite: chain all short-listed after baseline ────────────────
  console.log('Building combined composite...');
  restoreVram(mem, baselineVramSnap);
  restoreCpu(cpu, cpuSnap, mem);

  for (const addr of shortList) {
    restoreCpu(cpu, cpuSnap, mem);
    try {
      executor.runFrom(addr, 'adl', { maxSteps: 20000, maxLoopIterations: 500 });
    } catch (_) { /* skip */ }
  }

  const combinedR016 = analyzeVramRows(mem, 0, 16);
  console.log(`combined r0-16: drawn=${combinedR016.drawn} fg=${combinedR016.fg}`);

  const combinedAscii = asciiArtR016(mem, 119);
  const combinedDecodes = shortList.length > 0 ? decodeR016Multi(mem, signatures) : [];

  if (combinedDecodes.length > 0) {
    console.log(`combined best: row=${combinedDecodes[0].startRow} col=${combinedDecodes[0].startCol} text="${combinedDecodes[0].text}"`);
  }

  // Check for RAD/DEG hits
  const textHits = combinedDecodes.filter(d => /RAD|DEG|Rad|Deg|rad|deg/i.test(d.text));
  if (textHits.length > 0) {
    console.log(`*** ANGLE MODE TEXT FOUND: "${textHits[0].text}" at row=${textHits[0].startRow} col=${textHits[0].startCol} stride=${textHits[0].stride} ***`);
  }

  // ── Write report ─────────────────────────────────────────────────────────────
  const report = buildReport({
    candidateList: candidateAddrs,
    probeResults,
    shortList,
    detailedResults,
    combinedDecodes,
    combinedAscii,
  });

  fs.writeFileSync(REPORT_PATH, report);
  console.log(`report written: ${REPORT_PATH}`);

  // ── Summary ──────────────────────────────────────────────────────────────────
  const leftHitters = probeResults.filter(r => r.leftZoneFg > 0);
  console.log(`\nSummary:`);
  console.log(`  Candidates tested: ${candidateAddrs.length}`);
  console.log(`  Drew fg to r0-16: ${probeResults.filter(r => r.r016_fg > 0).length}`);
  console.log(`  Drew fg to r0-16 cols<80: ${leftHitters.length}`);
  console.log(`  Short-listed (≥10 fg + cMin<80): ${shortList.length}`);
  if (textHits.length > 0) {
    console.log(`  RAD/DEG text decoded: YES — "${textHits[0].text}"`);
  } else {
    console.log(`  RAD/DEG text decoded: NO`);
  }
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error);
  fs.writeFileSync(REPORT_PATH, `# Phase 101B — Angle Mode Indicator Hunt\n\n## Fatal Error\n\n\`\`\`\n${error.stack || error}\n\`\`\`\n`);
  process.exitCode = 1;
}
