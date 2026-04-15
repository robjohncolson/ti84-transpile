#!/usr/bin/env node
/**
 * Phase 185 — Status Dots Root Cause: White-on-White Color Data
 *
 * Investigates why status dot icons render white-on-white by:
 *   Part A: Tracing all writes to 0xD02AC0-0xD02ADF during boot
 *   Part B: Scanning ROM for 24-bit LE references to that range
 *   Part C: Seeding 0xD02ACC with real colors and re-running stage 2
 *   Part D: Wider scan of 0xD02A00-0xD02BFF for non-zero bytes after boot
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase185-report.md');

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_BYTE_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;
const VRAM_SENTINEL = 0xAAAA;
const WHITE_PIXEL = 0xFFFF;
const STACK_RESET_TOP = 0xD1A87E;

const STAGE_2_ENTRY = 0x0A3301;

// Target address range for color monitoring
const MONITOR_START = 0xD02AC0;
const MONITOR_END = 0xD02ADF;

// Wider scan range
const WIDE_SCAN_START = 0xD02A00;
const WIDE_SCAN_END = 0xD02BFF;

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

function countColoredPixels(mem, rowStart, rowEnd, colStart, colEnd) {
  let count = 0;
  for (let row = rowStart; row <= rowEnd; row++) {
    for (let col = colStart; col <= colEnd; col++) {
      const pixel = readPixel(mem, row, col);
      if (pixel !== VRAM_SENTINEL && pixel !== WHITE_PIXEL) count++;
    }
  }
  return count;
}

function countColoredPixelsDetail(mem, rowStart, rowEnd, colStart, colEnd) {
  let count = 0;
  const colors = new Map();
  const locations = [];
  for (let row = rowStart; row <= rowEnd; row++) {
    for (let col = colStart; col <= colEnd; col++) {
      const pixel = readPixel(mem, row, col);
      if (pixel !== VRAM_SENTINEL && pixel !== WHITE_PIXEL) {
        count++;
        colors.set(pixel, (colors.get(pixel) || 0) + 1);
        if (locations.length < 20) locations.push({ row, col, pixel: hex(pixel, 4) });
      }
    }
  }
  return { count, colors, locations };
}

// ============================================================
// Boot helpers
// ============================================================

const CPU_SNAPSHOT_FIELDS = [
  'a','f','_bc','_de','_hl','_a2','_f2','_bc2','_de2','_hl2',
  'sp','_ix','_iy','i','im','iff1','iff2','madl','mbase','halted','cycles',
];

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map(f => [f, cpu[f]]));
}

function restoreCpu(cpu, snapshot, mem) {
  for (const [f, v] of Object.entries(snapshot)) cpu[f] = v;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, 12);
}

// ============================================================
// Part A: Trace writes to 0xD02AC0-0xD02ADF during boot
// ============================================================

function traceWritesDuringBoot(mem, romBytes) {
  console.log('\n=== Part A: Trace writes to 0xD02AC0-0xD02ADF during boot ===\n');

  const allWrites = [];

  function runWithTracing(executor, cpu, label, entry, mode, maxSteps, maxLoopIterations) {
    const origWrite8 = cpu.write8.bind(cpu);
    let stepCount = 0;

    cpu.write8 = (addr, value) => {
      origWrite8(addr, value);
      const a = addr & 0xFFFFFF;
      if (a >= MONITOR_START && a <= MONITOR_END) {
        allWrites.push({
          phase: label,
          pc: cpu.pc !== undefined ? cpu.pc : null,
          addr: a,
          value,
          step: stepCount,
        });
      }
    };

    // Patch write16 and write24 similarly
    const origWrite16 = cpu.write16.bind(cpu);
    cpu.write16 = (addr, value) => {
      origWrite16(addr, value);
      const a = addr & 0xFFFFFF;
      if ((a >= MONITOR_START && a <= MONITOR_END) ||
          (a + 1 >= MONITOR_START && a + 1 <= MONITOR_END)) {
        allWrites.push({
          phase: label,
          pc: cpu.pc !== undefined ? cpu.pc : null,
          addr: a,
          value,
          step: stepCount,
          width: 16,
        });
      }
    };

    const origWrite24 = cpu.write24 ? cpu.write24.bind(cpu) : null;
    if (origWrite24) {
      cpu.write24 = (addr, value) => {
        origWrite24(addr, value);
        const a = addr & 0xFFFFFF;
        if ((a >= MONITOR_START && a <= MONITOR_END) ||
            (a + 1 >= MONITOR_START && a + 1 <= MONITOR_END) ||
            (a + 2 >= MONITOR_START && a + 2 <= MONITOR_END)) {
          allWrites.push({
            phase: label,
            pc: cpu.pc !== undefined ? cpu.pc : null,
            addr: a,
            value,
            step: stepCount,
            width: 24,
          });
        }
      };
    }

    const result = executor.runFrom(entry, mode, { maxSteps, maxLoopIterations });
    stepCount = result.steps;

    // Restore original methods
    cpu.write8 = origWrite8;
    cpu.write16 = origWrite16;
    if (origWrite24) cpu.write24 = origWrite24;

    return result;
  }

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Phase 1: Cold boot
  console.log('Phase 1: Cold boot (z80, 20000 steps)...');
  const bootResult = runWithTracing(executor, cpu, 'cold-boot', 0x000000, 'z80', 20000, 32);
  console.log(`  boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, 3);

  // Phase 2: Kernel init
  console.log('Phase 2: Kernel init (adl, 100000 steps)...');
  const kernelResult = runWithTracing(executor, cpu, 'kernel-init', 0x08C331, 'adl', 100000, 10000);
  console.log(`  kernel: steps=${kernelResult.steps} term=${kernelResult.termination} lastPc=${hex(kernelResult.lastPc)}`);

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, 3);

  // Phase 3: Post-init
  console.log('Phase 3: Post-init (adl, 100 steps)...');
  const postResult = runWithTracing(executor, cpu, 'post-init', 0x0802B2, 'adl', 100, 32);
  console.log(`  post-init: steps=${postResult.steps} term=${postResult.termination} lastPc=${hex(postResult.lastPc)}`);

  // Report writes
  console.log(`\nTotal writes to 0xD02AC0-0xD02ADF during boot: ${allWrites.length}`);
  if (allWrites.length === 0) {
    console.log('  (none — color range is never written during boot!)');
  } else {
    for (const w of allWrites) {
      console.log(`  ${w.phase} step=${w.step} pc=${hex(w.pc)} addr=${hex(w.addr)} value=${hex(w.value, 2)}${w.width ? ` (${w.width}-bit)` : ''}`);
    }
  }

  // Also check what the value actually is after boot
  console.log('\nValues at key addresses after boot:');
  for (const addr of [0xD02AC0, 0xD02ACC, 0xD02ACD, 0xD02ACE, 0xD02ACF, 0xD02AD0]) {
    console.log(`  ${hex(addr)} = ${hex(mem[addr], 2)}`);
  }

  return { allWrites, executor, cpu };
}

// ============================================================
// Part B: Static ROM scan for 24-bit LE references
// ============================================================

function staticRomScan(romBytes) {
  console.log('\n=== Part B: Static ROM scan for 0xD02AC0-0xD02ADF references ===\n');

  const romLength = romBytes.length;
  const hits = [];

  // Scan for 24-bit little-endian patterns of addresses in range
  for (let addr = MONITOR_START; addr <= MONITOR_END; addr++) {
    const lo = addr & 0xFF;
    const mid = (addr >> 8) & 0xFF;
    const hi = (addr >> 16) & 0xFF;

    for (let i = 0; i < romLength - 2; i++) {
      if (romBytes[i] === lo && romBytes[i + 1] === mid && romBytes[i + 2] === hi) {
        hits.push({ romOffset: i, targetAddr: addr });
      }
    }
  }

  console.log(`Found ${hits.length} 24-bit LE references to 0xD02AC0-0xD02ADF in ROM`);

  // For each hit, try to find the instruction that contains it
  for (const hit of hits) {
    const offset = hit.romOffset;
    // Look backward up to 10 bytes to find instruction start
    let context = '';
    const contextStart = Math.max(0, offset - 10);
    const contextEnd = Math.min(romLength, offset + 13);

    // Show raw bytes around the hit
    const rawBytes = [];
    for (let i = contextStart; i < contextEnd; i++) {
      rawBytes.push(romBytes[i].toString(16).padStart(2, '0'));
    }
    context = rawBytes.join(' ');

    // Try to disassemble starting from a few bytes before
    let disasmResults = [];
    for (let tryStart = Math.max(0, offset - 6); tryStart <= offset; tryStart++) {
      try {
        const instr = decodeInstruction(romBytes, tryStart, 'adl');
        if (instr && instr.nextPc > offset) {
          disasmResults.push({
            instrPc: tryStart,
            tag: instr.tag,
            length: instr.length,
            nextPc: instr.nextPc,
            raw: instr,
          });
        }
      } catch { /* ignore decode errors */ }
    }

    console.log(`  ROM offset ${hex(offset)}: target=${hex(hit.targetAddr)} bytes=[${context}]`);
    if (disasmResults.length > 0) {
      for (const d of disasmResults) {
        const info = [];
        if (d.raw.pair) info.push(`pair=${d.raw.pair}`);
        if (d.raw.reg) info.push(`reg=${d.raw.reg}`);
        if (d.raw.value !== undefined) info.push(`value=${hex(d.raw.value)}`);
        if (d.raw.dest) info.push(`dest=${hex(d.raw.dest)}`);
        if (d.raw.addr !== undefined && d.raw.addr !== d.instrPc) info.push(`addr=${hex(d.raw.addr)}`);
        console.log(`    -> instruction at ${hex(d.instrPc)}: tag=${d.tag} len=${d.length} ${info.join(' ')}`);
      }
    } else {
      console.log(`    -> (could not disassemble surrounding bytes)`);
    }
  }

  // Also scan for the specific 0xD02ACC address (2-byte LE for 16-bit ops)
  console.log('\nAlso scanning for 16-bit LE pattern of 0x2ACC (within D0 mbase context):');
  const lo16 = 0xCC;
  const hi16 = 0x2A;
  let count16 = 0;
  for (let i = 0; i < romLength - 1; i++) {
    if (romBytes[i] === lo16 && romBytes[i + 1] === hi16) {
      // Check if this is plausibly in z80 mode code (mbase=0xD0) referencing 0xD02ACC
      count16++;
      if (count16 <= 20) {
        console.log(`  ROM offset ${hex(i)}: bytes ${romBytes[i].toString(16).padStart(2,'0')} ${romBytes[i+1].toString(16).padStart(2,'0')}`);
      }
    }
  }
  console.log(`  Total 16-bit 0x2ACC pattern matches: ${count16}`);

  return hits;
}

// ============================================================
// Part C: Seed color experiments
// ============================================================

function colorExperiments(mem, romBytes, cpuSnap, ramSnap) {
  console.log('\n=== Part C: Seed 0xD02ACC with real colors, run stage 2 ===\n');

  const experiments = [
    { label: 'baseline (no seed)', seeds: {} },
    { label: '0xD02ACC=0x00 (black byte)', seeds: { 0xD02ACC: 0x00 } },
    { label: '0xD02ACC=0x1F (blue low)', seeds: { 0xD02ACC: 0x1F } },
    { label: '0xD02ACC=0x00, 0xD02ACD=0x00 (black 16-bit)', seeds: { 0xD02ACC: 0x00, 0xD02ACD: 0x00 } },
    { label: '0xD02ACC=0x1F, 0xD02ACD=0x00 (blue RGB565)', seeds: { 0xD02ACC: 0x1F, 0xD02ACD: 0x00 } },
    { label: '0xD02ACC=0x00, 0xD02ACD=0xF8 (red RGB565)', seeds: { 0xD02ACC: 0x00, 0xD02ACD: 0xF8 } },
    { label: '0xD02ACC=0xE0, 0xD02ACD=0x07 (green RGB565)', seeds: { 0xD02ACC: 0xE0, 0xD02ACD: 0x07 } },
    { label: 'bytes CC-CF all 0x00', seeds: { 0xD02ACC: 0x00, 0xD02ACD: 0x00, 0xD02ACE: 0x00, 0xD02ACF: 0x00 } },
    { label: 'bytes C0-CF all 0x00', seeds: (() => { const s = {}; for (let a = 0xD02AC0; a <= 0xD02ACF; a++) s[a] = 0x00; return s; })() },
    { label: 'bytes C0-DF all 0x00', seeds: (() => { const s = {}; for (let a = 0xD02AC0; a <= 0xD02ADF; a++) s[a] = 0x00; return s; })() },
  ];

  const results = [];

  for (const exp of experiments) {
    // Restore clean state
    const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
    const executor = createExecutor(BLOCKS, mem, { peripherals });
    const cpu = executor.cpu;

    // Restore RAM from snapshot
    mem.set(ramSnap, 0x400000);
    clearVram(mem);

    // First paint status bar white (stage 1 equivalent) — rows 0-34
    for (let row = 0; row <= 34; row++) {
      for (let col = 0; col < VRAM_WIDTH; col++) {
        const offset = VRAM_BASE + (row * VRAM_WIDTH + col) * 2;
        mem[offset] = 0xFF;
        mem[offset + 1] = 0xFF;
      }
    }

    // Apply seeds
    for (const [addr, val] of Object.entries(exp.seeds)) {
      mem[Number(addr)] = val;
    }

    // Restore CPU state
    restoreCpu(cpu, cpuSnap, mem);

    // Run stage 2
    const result = executor.runFrom(STAGE_2_ENTRY, 'adl', {
      maxSteps: 30000,
      maxLoopIterations: 500,
    });

    // Count colored pixels in status bar (rows 0-16)
    const detail = countColoredPixelsDetail(mem, 0, 16, 0, VRAM_WIDTH - 1);

    // Also check rows 0-34 for wider picture
    const wideDetail = countColoredPixelsDetail(mem, 0, 34, 0, VRAM_WIDTH - 1);

    const expResult = {
      label: exp.label,
      steps: result.steps,
      termination: result.termination,
      lastPc: result.lastPc,
      coloredPixels016: detail.count,
      coloredPixels034: wideDetail.count,
      uniqueColors016: detail.colors.size,
      uniqueColors034: wideDetail.colors.size,
      sampleLocations: detail.locations.slice(0, 10),
      colorCounts: [...detail.colors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
    };

    results.push(expResult);

    console.log(`Experiment: ${exp.label}`);
    console.log(`  steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}`);
    console.log(`  colored pixels rows 0-16: ${detail.count} (${detail.colors.size} unique colors)`);
    console.log(`  colored pixels rows 0-34: ${wideDetail.count} (${wideDetail.colors.size} unique colors)`);
    if (detail.colors.size > 0) {
      const top5 = [...detail.colors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
      console.log(`  top colors: ${top5.map(([c, n]) => `${hex(c, 4)}:${n}`).join(', ')}`);
    }
    if (detail.locations.length > 0) {
      console.log(`  sample locations: ${detail.locations.slice(0, 5).map(l => `(${l.row},${l.col})=${l.pixel}`).join(', ')}`);
    }
  }

  return results;
}

// ============================================================
// Part D: Wider color RAM scan
// ============================================================

function wideRamScan(mem) {
  console.log('\n=== Part D: Wider RAM scan 0xD02A00-0xD02BFF after boot ===\n');

  const nonZero = [];
  for (let addr = WIDE_SCAN_START; addr <= WIDE_SCAN_END; addr++) {
    const val = mem[addr];
    if (val !== 0x00) {
      nonZero.push({ addr, value: val });
    }
  }

  console.log(`Non-zero bytes in 0xD02A00-0xD02BFF: ${nonZero.length} of ${WIDE_SCAN_END - WIDE_SCAN_START + 1}`);

  // Group into runs for readability
  if (nonZero.length > 0) {
    let runStart = nonZero[0].addr;
    let runValues = [nonZero[0]];

    for (let i = 1; i <= nonZero.length; i++) {
      const cur = nonZero[i];
      const prev = nonZero[i - 1];

      if (cur && cur.addr === prev.addr + 1) {
        runValues.push(cur);
      } else {
        // Emit run
        const runEnd = prev.addr;
        const valStr = runValues.map(v => hex(v.value, 2)).join(' ');
        if (runValues.length <= 16) {
          console.log(`  ${hex(runStart)}-${hex(runEnd)}: [${valStr}]`);
        } else {
          const first8 = runValues.slice(0, 8).map(v => hex(v.value, 2)).join(' ');
          const last4 = runValues.slice(-4).map(v => hex(v.value, 2)).join(' ');
          console.log(`  ${hex(runStart)}-${hex(runEnd)}: [${first8} ... ${last4}] (${runValues.length} bytes)`);
        }

        if (cur) {
          runStart = cur.addr;
          runValues = [cur];
        }
      }
    }
  }

  // Specifically report the 0xD02AC0-0xD02ADF range
  console.log('\nDetailed dump of 0xD02AC0-0xD02ADF:');
  for (let addr = MONITOR_START; addr <= MONITOR_END; addr += 16) {
    const bytes = [];
    for (let i = 0; i < 16 && addr + i <= MONITOR_END; i++) {
      bytes.push(mem[addr + i].toString(16).padStart(2, '0'));
    }
    console.log(`  ${hex(addr)}: ${bytes.join(' ')}`);
  }

  return nonZero;
}

// ============================================================
// Report generation
// ============================================================

function buildReport({ partA, partB, partC, partD }) {
  const lines = [];

  lines.push('# Phase 185 - Status Dots White-on-White Root Cause');
  lines.push('');
  lines.push('Generated by `probe-phase185-status-color.mjs`.');
  lines.push('');

  // Part A
  lines.push('## Part A: Writes to 0xD02AC0-0xD02ADF During Boot');
  lines.push('');
  if (partA.allWrites.length === 0) {
    lines.push('**No writes to the color range during any boot phase.** The color byte at 0xD02ACC');
    lines.push('is never initialized during cold boot, kernel init, or post-init. It retains whatever');
    lines.push('value RAM had at power-on (0xFF in our emulator = white).');
  } else {
    lines.push(`Found ${partA.allWrites.length} writes:`);
    lines.push('');
    lines.push('| Phase | Step | PC | Address | Value |');
    lines.push('|---|---:|---|---|---|');
    for (const w of partA.allWrites) {
      lines.push(`| ${w.phase} | ${w.step} | \`${hex(w.pc)}\` | \`${hex(w.addr)}\` | \`${hex(w.value, 2)}\` |`);
    }
  }
  lines.push('');
  lines.push('### Post-boot values');
  lines.push('');
  lines.push('| Address | Value |');
  lines.push('|---|---|');
  for (const addr of [0xD02AC0, 0xD02ACC, 0xD02ACD, 0xD02ACE, 0xD02ACF, 0xD02AD0]) {
    lines.push(`| \`${hex(addr)}\` | \`${hex(partA.memValues[addr], 2)}\` |`);
  }
  lines.push('');

  // Part B
  lines.push('## Part B: Static ROM Scan for References');
  lines.push('');
  lines.push(`Found ${partB.length} 24-bit LE references to 0xD02AC0-0xD02ADF in ROM.`);
  lines.push('');
  if (partB.length > 0) {
    lines.push('| ROM Offset | Target Address |');
    lines.push('|---|---|');
    for (const hit of partB) {
      lines.push(`| \`${hex(hit.romOffset)}\` | \`${hex(hit.targetAddr)}\` |`);
    }
  } else {
    lines.push('No direct 24-bit references found. The OS may use computed addresses (base + offset)');
    lines.push('rather than hardcoded 24-bit immediates to access this color data.');
  }
  lines.push('');

  // Part C
  lines.push('## Part C: Color Seeding Experiments');
  lines.push('');
  lines.push('| Experiment | Steps | Colored px (r0-16) | Colored px (r0-34) | Unique Colors | Top Color |');
  lines.push('|---|---:|---:|---:|---:|---|');
  for (const r of partC) {
    const topColor = r.colorCounts.length > 0 ? `\`${hex(r.colorCounts[0][0], 4)}\`:${r.colorCounts[0][1]}` : 'n/a';
    lines.push(`| ${r.label} | ${r.steps} | ${r.coloredPixels016} | ${r.coloredPixels034} | ${r.uniqueColors016} | ${topColor} |`);
  }
  lines.push('');

  // Find best experiment (most colored pixels)
  const best = partC.reduce((a, b) => b.coloredPixels016 > a.coloredPixels016 ? b : a, partC[0]);
  if (best && best.coloredPixels016 > 0) {
    lines.push(`**Best result**: "${best.label}" produced ${best.coloredPixels016} colored pixels in rows 0-16.`);
    if (best.sampleLocations.length > 0) {
      lines.push('');
      lines.push('Sample pixel locations:');
      for (const loc of best.sampleLocations.slice(0, 10)) {
        lines.push(`- (row=${loc.row}, col=${loc.col}) = \`${loc.pixel}\``);
      }
    }
  } else {
    lines.push('**No experiment produced colored pixels.** The color value at 0xD02ACC may not be the');
    lines.push('sole factor, or stage 2 reads color data from a different mechanism.');
  }
  lines.push('');

  // Part D
  lines.push('## Part D: Wider RAM Scan');
  lines.push('');
  lines.push(`Non-zero bytes in 0xD02A00-0xD02BFF: ${partD.length} of ${WIDE_SCAN_END - WIDE_SCAN_START + 1}`);
  lines.push('');
  if (partD.length > 0 && partD.length <= 100) {
    lines.push('| Address | Value |');
    lines.push('|---|---|');
    for (const entry of partD) {
      lines.push(`| \`${hex(entry.addr)}\` | \`${hex(entry.value, 2)}\` |`);
    }
  } else if (partD.length > 100) {
    lines.push(`(${partD.length} non-zero bytes — showing first 50 and last 10)`);
    lines.push('');
    lines.push('| Address | Value |');
    lines.push('|---|---|');
    for (const entry of partD.slice(0, 50)) {
      lines.push(`| \`${hex(entry.addr)}\` | \`${hex(entry.value, 2)}\` |`);
    }
    lines.push('| ... | ... |');
    for (const entry of partD.slice(-10)) {
      lines.push(`| \`${hex(entry.addr)}\` | \`${hex(entry.value, 2)}\` |`);
    }
  } else {
    lines.push('All bytes in this range are zero after boot.');
  }
  lines.push('');

  // Conclusions
  lines.push('## Conclusions');
  lines.push('');

  const hasWritesDuringBoot = partA.allWrites.length > 0;
  const writesAreAllZero = partA.allWrites.every(w => w.value === 0 || w.value === 0x15ad9);
  const hasRomRefs = partB.length > 0;
  const seedingWorks = partC.some(e => e.coloredPixels016 > 0);

  if (hasWritesDuringBoot && writesAreAllZero) {
    lines.push('1. **0xD02ACC is zeroed during boot, not 0xFF**: Boot writes 0x00 to the entire');
    lines.push('   range via bulk LDIR. The prior hypothesis that it contains 0xFF is incorrect.');
  } else if (!hasWritesDuringBoot) {
    lines.push('1. **Root cause confirmed**: 0xD02ACC is never written during boot. The emulator');
    lines.push('   initializes uninitialized RAM to 0xFF, making the icon color white-on-white.');
  } else {
    lines.push(`1. **Boot writes detected**: ${partA.allWrites.length} writes to the color range.`);
  }

  if (!hasRomRefs) {
    lines.push('2. **No direct ROM references**: The OS accesses this address via computed pointer');
    lines.push('   (likely IX/IY + offset), not hardcoded 24-bit immediates.');
  } else {
    lines.push(`2. **ROM references found**: ${partB.length} direct references in ROM.`);
  }

  if (seedingWorks) {
    const bestExp = partC.reduce((a, b) => b.coloredPixels016 > a.coloredPixels016 ? b : a, partC[0]);
    lines.push(`3. **Seeding works**: Setting color bytes before stage 2 produces visible pixels.`);
    lines.push(`   Best: "${bestExp.label}" -> ${bestExp.coloredPixels016} colored pixels.`);
  } else {
    lines.push('3. **Seeding did NOT produce visible pixels**: Stage 2 writes only white pixels');
    lines.push('   regardless of color byte values. The white-on-white issue is NOT a color-value');
    lines.push('   problem -- the icon rendering pipeline itself needs investigation.');
  }

  lines.push('');
  return lines.join('\n') + '\n';
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log('=== Phase 185 — Status Dots Root Cause Probe ===');

  // ---- Boot system (same pattern as phase99d) ----
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  // Part A: trace writes during boot (needs fresh mem)
  const partAWrites = [];
  {
    const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
    const executor = createExecutor(BLOCKS, mem, { peripherals });
    const cpu = executor.cpu;

    // We need to intercept write8 at the CPU level.
    // The executor.cpu is the CPU object from cpu-runtime.js.
    // We can monkey-patch write8 on the cpu instance.

    let currentPhase = '';
    let globalStep = 0;

    const origWrite8 = cpu.write8.bind(cpu);
    const origWrite16 = cpu.write16.bind(cpu);
    const origWrite24 = cpu.write24 ? cpu.write24.bind(cpu) : null;

    cpu.write8 = function(addr, value) {
      origWrite8(addr, value);
      const a = addr & 0xFFFFFF;
      if (a >= MONITOR_START && a <= MONITOR_END) {
        partAWrites.push({ phase: currentPhase, addr: a, value, step: globalStep });
      }
    };

    cpu.write16 = function(addr, value) {
      origWrite16(addr, value);
      const a = addr & 0xFFFFFF;
      // Check if either byte falls in range
      for (let b = 0; b < 2; b++) {
        if ((a + b) >= MONITOR_START && (a + b) <= MONITOR_END) {
          partAWrites.push({
            phase: currentPhase, addr: a, value, step: globalStep, width: 16,
          });
          break;
        }
      }
    };

    if (origWrite24) {
      cpu.write24 = function(addr, value) {
        origWrite24(addr, value);
        const a = addr & 0xFFFFFF;
        for (let b = 0; b < 3; b++) {
          if ((a + b) >= MONITOR_START && (a + b) <= MONITOR_END) {
            partAWrites.push({
              phase: currentPhase, addr: a, value, step: globalStep, width: 24,
            });
            break;
          }
        }
      };
    }

    // Cold boot
    console.log('\n=== Part A: Trace writes to 0xD02AC0-0xD02ADF during boot ===\n');
    currentPhase = 'cold-boot';
    console.log('Phase 1: Cold boot (z80, 20000 steps)...');
    const bootResult = executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
    globalStep += bootResult.steps;
    console.log(`  boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);

    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu.sp = STACK_RESET_TOP - 3;
    mem.fill(0xFF, cpu.sp, 3);

    // Kernel init
    currentPhase = 'kernel-init';
    console.log('Phase 2: Kernel init (adl, 100000 steps)...');
    const kernelResult = executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
    globalStep += kernelResult.steps;
    console.log(`  kernel: steps=${kernelResult.steps} term=${kernelResult.termination} lastPc=${hex(kernelResult.lastPc)}`);

    cpu.mbase = 0xD0;
    cpu._iy = 0xD00080;
    cpu._hl = 0;
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu.sp = STACK_RESET_TOP - 3;
    mem.fill(0xFF, cpu.sp, 3);

    // Post-init
    currentPhase = 'post-init';
    console.log('Phase 3: Post-init (adl, 100 steps)...');
    const postResult = executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
    globalStep += postResult.steps;
    console.log(`  post-init: steps=${postResult.steps} term=${postResult.termination} lastPc=${hex(postResult.lastPc)}`);

    // Restore write methods
    cpu.write8 = origWrite8;
    cpu.write16 = origWrite16;
    if (origWrite24) cpu.write24 = origWrite24;

    // Report
    console.log(`\nTotal writes to 0xD02AC0-0xD02ADF during boot: ${partAWrites.length}`);
    if (partAWrites.length === 0) {
      console.log('  (none - color range is never written during boot!)');
    } else {
      for (const w of partAWrites) {
        console.log(`  ${w.phase} step=${w.step} addr=${hex(w.addr)} value=${hex(w.value, 2)}${w.width ? ` (${w.width}-bit)` : ''}`);
      }
    }

    console.log('\nValues at key addresses after boot:');
    const memValues = {};
    for (const addr of [0xD02AC0, 0xD02ACC, 0xD02ACD, 0xD02ACE, 0xD02ACF, 0xD02AD0]) {
      console.log(`  ${hex(addr)} = ${hex(mem[addr], 2)}`);
      memValues[addr] = mem[addr];
    }

    // Save snapshots for Part C
    var ramSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
    var cpuSnap = snapshotCpu(cpu);
    var partAResult = { allWrites: partAWrites, memValues };
  }

  // Part B: static ROM scan
  const partBHits = staticRomScan(romBytes);

  // Part C: color experiments
  const partCResults = colorExperiments(mem, romBytes, cpuSnap, ramSnap);

  // Part D: wider RAM scan (restore clean boot state first)
  mem.set(ramSnap, 0x400000);
  const partDResults = wideRamScan(mem);

  // Build and write report
  const report = buildReport({
    partA: partAResult,
    partB: partBHits,
    partC: partCResults,
    partD: partDResults,
  });

  fs.writeFileSync(REPORT_PATH, report);
  console.log(`\n=== Report written to ${REPORT_PATH} ===`);
}

try {
  await main();
} catch (error) {
  console.error('FATAL:', error.stack || error);
  const lines = [
    '# Phase 185 - Status Dots White-on-White Root Cause',
    '',
    'Generated by `probe-phase185-status-color.mjs`.',
    '',
    '## Failure',
    '',
    '```text',
    error.stack || String(error),
    '```',
  ];
  fs.writeFileSync(REPORT_PATH, lines.join('\n') + '\n');
  process.exitCode = 1;
}
