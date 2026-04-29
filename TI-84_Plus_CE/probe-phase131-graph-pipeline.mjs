#!/usr/bin/env node

/**
 * Phase 131 — Graph pipeline: ILine realistic coords, box rendering,
 * GraphPars + DrawCmd investigation.
 *
 * Test 1: ILine with realistic graph-scale coordinates (X < 64 safe range)
 * Test 2: ILine box outline (4 lines forming a rectangle)
 * Test 3: GraphPars probe with seeded BCD graph window
 * Test 4: DrawCmd probe
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { writeReal, readReal } from './fp-real.mjs';
import { decodeInstruction as decodeEz80 } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

// ── Constants ──────────────────────────────────────────────────────────────

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const USERMEM_ADDR = 0xd1a881;
const EMPTY_VAT_ADDR = 0xd3ffff;

const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const FAKE_RET = 0x7ffffe;

// ILine / IPoint / GraphPars / DrawCmd addresses
const ILINE_ENTRY = 0x07B245;
const IPOINT_ENTRY = 0x07B451;
const GRAPHPARS_ENTRY = 0x09986C;
const DRAWCMD_ENTRY = 0x05DD96;

// MEM_INIT
const MEMINIT_ENTRY = 0x09DEE0;
const MEMINIT_RET = 0x7FFFF6;

// Pixel dimension addresses
const PIX_WIDE_P_ADDR = 0xD014FE;
const PIX_WIDE_M2_ADDR = 0xD01501;

// Draw state addresses
const DRAW_COLOR_CODE_ADDR = 0xD026AE;
const DRAW_FG_COLOR_ADDR = 0xD026AC;
const DRAW_BG_COLOR_ADDR = 0xD026AA;
const HOOKFLAGS3_ADDR = 0xD000B5;
const MODE_BYTE_ADDR = 0xD02AD4;

// Graph buffer
const PLOTSSCREEN_ADDR = 0xD09466;
const PLOTSSCREEN_SIZE = 21945;

// Graph BCD real addresses
const XMIN_ADDR = 0xD01E33;
const XMAX_ADDR = 0xD01E3C;
const XSCL_ADDR = 0xD01E45;
const YMIN_ADDR = 0xD01E4E;
const YMAX_ADDR = 0xD01E57;
const YSCL_ADDR = 0xD01E60;

// Graph mode
const GRAPHMODE_ADDR = 0xD01474;

const STEP_BUDGET = 500000;
const MAX_LOOP_ITER = 8192;

// ── Utilities ──────────────────────────────────────────────────────────────

const hex = (v, w = 6) =>
  v === undefined || v === null
    ? 'n/a'
    : `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;

const write24 = (m, a, v) => {
  m[a] = v & 0xff;
  m[a + 1] = (v >>> 8) & 0xff;
  m[a + 2] = (v >>> 16) & 0xff;
};

const write16 = (m, a, v) => {
  m[a] = v & 0xff;
  m[a + 1] = (v >>> 8) & 0xff;
};

const read24 = (m, a) =>
  ((m[a] & 0xff) | ((m[a + 1] & 0xff) << 8) | ((m[a + 2] & 0xff) << 16)) >>> 0;

const read16 = (m, a) =>
  ((m[a] & 0xff) | ((m[a + 1] & 0xff) << 8)) >>> 0;

function hexBytes(m, a, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push((m[a + i] & 0xff).toString(16).toUpperCase().padStart(2, '0'));
  return out.join(' ');
}

// ── Mem wrapper for fp-real.mjs (needs write8/read8 methods) ─────────────

function wrapMem(rawMem) {
  return {
    write8(addr, val) { rawMem[addr] = val & 0xff; },
    read8(addr) { return rawMem[addr] & 0xff; },
  };
}

// ── Runtime setup ──────────────────────────────────────────────────────────

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const executor = createExecutor(BLOCKS, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
  });
  return { mem, executor, cpu: executor.cpu };
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xd0; cpu._iy = 0xd00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
}

function prepareCallState(cpu, mem) {
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.madl = 1; cpu.mbase = 0xd0; cpu._iy = 0xd00080;
  cpu.f = 0x40; cpu._ix = 0xd1a860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
}

function seedAllocator(mem) {
  write24(mem, OPBASE_ADDR, EMPTY_VAT_ADDR);
  write24(mem, OPS_ADDR, EMPTY_VAT_ADDR);
  mem.fill(0x00, PTEMPCNT_ADDR, PTEMPCNT_ADDR + 4);
  write24(mem, PTEMP_ADDR, EMPTY_VAT_ADDR);
  write24(mem, PROGPTR_ADDR, EMPTY_VAT_ADDR);
  write24(mem, FPSBASE_ADDR, USERMEM_ADDR);
  write24(mem, FPS_ADDR, USERMEM_ADDR);
  write24(mem, NEWDATA_PTR_ADDR, USERMEM_ADDR);
}

function seedGraphRAM(mem) {
  write16(mem, PIX_WIDE_P_ADDR, 320);
  write16(mem, PIX_WIDE_M2_ADDR, 240);
  write16(mem, DRAW_COLOR_CODE_ADDR, 0x001F); // blue
  write16(mem, DRAW_FG_COLOR_ADDR, 0x001F);
  write16(mem, DRAW_BG_COLOR_ADDR, 0xFFFF);
  mem[HOOKFLAGS3_ADDR] &= ~0x80;
  mem[MODE_BYTE_ADDR] = 1; // line mode
  mem[0xD00082] |= (1 << 4); // grfFuncM bit 4
}

function seedGraphWindow(mem) {
  const wrapped = wrapMem(mem);
  writeReal(wrapped, XMIN_ADDR, -10);
  writeReal(wrapped, XMAX_ADDR, 10);
  writeReal(wrapped, XSCL_ADDR, 1);
  writeReal(wrapped, YMIN_ADDR, -10);
  writeReal(wrapped, YMAX_ADDR, 10);
  writeReal(wrapped, YSCL_ADDR, 1);
  mem[GRAPHMODE_ADDR] = 0; // function mode
}

// ── Disassembler helper ───────────────────────────────────────────────────

function disassembleRange(startAddr, endAddr) {
  let pc = startAddr;
  const lines = [];
  while (pc < endAddr) {
    try {
      const instr = decodeEz80(romBytes, pc, true);
      const bytes = hexBytes(romBytes, pc, instr.length);
      lines.push(`  ${hex(pc)}: ${bytes.padEnd(20)} ${instr.mnemonic || instr.tag || '???'}`);
      pc += instr.length;
    } catch (e) {
      lines.push(`  ${hex(pc)}: ${hexBytes(romBytes, pc, 1).padEnd(20)} ??? (decode error: ${e.message})`);
      pc += 1;
    }
  }
  return lines;
}

// ── Count non-zero bytes in plotSScreen ───────────────────────────────────

function countPlotPixels(mem) {
  let count = 0;
  for (let i = 0; i < PLOTSSCREEN_SIZE; i++) {
    if (mem[PLOTSSCREEN_ADDR + i] !== 0) count++;
  }
  return count;
}

function dumpPlotSScreenSample(mem, label) {
  const nonZero = [];
  for (let i = 0; i < PLOTSSCREEN_SIZE && nonZero.length < 30; i++) {
    if (mem[PLOTSSCREEN_ADDR + i] !== 0) {
      nonZero.push({ offset: i, val: mem[PLOTSSCREEN_ADDR + i] });
    }
  }
  if (nonZero.length > 0) {
    console.log(`  ${label} non-zero plotSScreen bytes (first ${nonZero.length}):`);
    for (const { offset, val } of nonZero) {
      const row = Math.floor(offset / 160);
      const col = (offset % 160) * 2;
      console.log(`    offset=${hex(offset, 4)} val=${hex(val, 2)} row=${row} col~=${col}`);
    }
  } else {
    console.log(`  ${label}: no non-zero bytes in plotSScreen`);
  }
}

// ── Generic run helper ────────────────────────────────────────────────────

function runCall(label, entryPC, mem, executor, cpu, budget) {
  console.log(`\n--- ${label} ---`);

  const pcHitCounts = new Map();
  const firstNPcs = [];
  const recentPcs = [];
  const missingBlockPcs = new Set();
  let finalPc = null;
  let returnHit = false;
  let stepCount = 0;

  try {
    executor.runFrom(entryPC, 'adl', {
      maxSteps: budget,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        const norm = pc & 0xffffff;
        finalPc = norm;
        stepCount++;
        pcHitCounts.set(norm, (pcHitCounts.get(norm) || 0) + 1);
        if (firstNPcs.length < 200) firstNPcs.push(norm);
        recentPcs.push(norm);
        if (recentPcs.length > 128) recentPcs.shift();
        if (norm === FAKE_RET) throw new Error('__RET__');
      },
      onMissingBlock(pc) {
        const norm = pc & 0xffffff;
        finalPc = norm;
        stepCount++;
        missingBlockPcs.add(norm);
        pcHitCounts.set(norm, (pcHitCounts.get(norm) || 0) + 1);
        if (firstNPcs.length < 200) firstNPcs.push(norm);
        recentPcs.push(norm);
        if (recentPcs.length > 128) recentPcs.shift();
        if (norm === FAKE_RET) throw new Error('__RET__');
      },
    });
  } catch (e) {
    if (e?.message === '__RET__') { returnHit = true; finalPc = FAKE_RET; }
    else throw e;
  }

  console.log(`  Result: returnHit=${returnHit} steps=${stepCount} finalPC=${hex(finalPc)}`);

  // Missing blocks
  if (missingBlockPcs.size > 0) {
    const filtered = [...missingBlockPcs].filter(p => p !== FAKE_RET).sort((a, b) => a - b);
    if (filtered.length > 0) {
      console.log(`  Missing blocks (${filtered.length}):`);
      for (const pc of filtered) {
        console.log(`    ${hex(pc)}: ${pcHitCounts.get(pc)} hits`);
        if (pc < 0x400000) {
          const lines = disassembleRange(pc, Math.min(pc + 12, 0x400000));
          for (const line of lines) console.log(`    ${line}`);
        }
      }
    }
  }

  // Top-20 hottest PCs
  const sorted = [...pcHitCounts.entries()].sort((a, b) => b[1] - a[1]);
  console.log('  Top-20 hottest PCs:');
  for (let i = 0; i < Math.min(20, sorted.length); i++) {
    const [pc, hits] = sorted[i];
    const isMissing = missingBlockPcs.has(pc) ? ' [MISSING]' : '';
    console.log(`    ${hex(pc)}: ${hits} hits${isMissing}`);
  }

  // First 60 PCs
  console.log(`  First ${Math.min(firstNPcs.length, 60)} PCs visited:`);
  const showPcs = firstNPcs.slice(0, 60);
  for (let i = 0; i < showPcs.length; i += 8) {
    console.log(`    ${showPcs.slice(i, i + 8).map(p => hex(p)).join(' ')}`);
  }

  // Last 32 PCs
  console.log(`  Last 32 PCs visited:`);
  const lastChunk = recentPcs.slice(-32);
  for (let i = 0; i < lastChunk.length; i += 8) {
    console.log(`    ${lastChunk.slice(i, i + 8).map(p => hex(p)).join(' ')}`);
  }

  return { returnHit, stepCount, finalPc, missingBlockPcs, pcHitCounts };
}

// ── ILine helper ──────────────────────────────────────────────────────────

function callILine(mem, executor, cpu, memSnapshot, x1, y1, x2, y2, drawMode, clearPlot) {
  if (clearPlot) {
    mem.fill(0, PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);
  }

  prepareCallState(cpu, mem);
  seedAllocator(mem);

  cpu.a = drawMode;
  cpu._bc = x1 & 0xffffff;
  cpu._de = y1 & 0xffffff;

  // Push fake return address
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  // HL=X2, push Y2 (hl-stack layout — best from phase 130)
  cpu._hl = x2 & 0xffffff;
  cpu.sp -= 3;
  write24(mem, cpu.sp, y2 & 0xffffff);

  let returnHit = false;
  let stepCount = 0;

  try {
    executor.runFrom(ILINE_ENTRY, 'adl', {
      maxSteps: 50000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        stepCount++;
        if ((pc & 0xffffff) === FAKE_RET) throw new Error('__RET__');
      },
      onMissingBlock(pc) {
        stepCount++;
        if ((pc & 0xffffff) === FAKE_RET) throw new Error('__RET__');
      },
    });
  } catch (e) {
    if (e?.message === '__RET__') returnHit = true;
    else throw e;
  }

  return { returnHit, stepCount };
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 131: Graph Pipeline Probe ===');
  console.log('');

  // ── Setup runtime ──
  const { mem, executor, cpu } = createRuntime();
  console.log('Cold-booting OS...');
  coldBoot(executor, cpu, mem);
  console.log('Cold boot complete.');
  console.log('');

  // Save clean post-boot snapshot
  const memSnapshot = new Uint8Array(MEM_SIZE);
  memSnapshot.set(mem);

  // ═══════════════════════════════════════════════════════════════════════
  // Test 1: ILine with realistic graph-scale coordinates
  // ═══════════════════════════════════════════════════════════════════════

  console.log('=== Test 1: ILine realistic coords (5,5)->(50,50) ===');
  console.log('  pixWideP=320 (0x0140), pixWide_m_2=240 (0x00F0)');
  console.log('  X bounds use 8-bit CP L — coordinates >= 64 fail');
  console.log('  Using safe range: X < 64');

  mem.set(memSnapshot);
  seedGraphRAM(mem);
  mem.fill(0, PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);

  const t1 = callILine(mem, executor, cpu, memSnapshot, 5, 5, 50, 50, 1, false);

  const t1pixels = countPlotPixels(mem);
  console.log(`  ILine (5,5)->(50,50): returnHit=${t1.returnHit} steps=${t1.stepCount} pixels=${t1pixels}`);
  dumpPlotSScreenSample(mem, 'Test 1');

  // ═══════════════════════════════════════════════════════════════════════
  // Test 2: ILine box outline — 4 lines forming a rectangle
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n=== Test 2: ILine box outline (10,10)-(50,10)-(50,50)-(10,50)-(10,10) ===');

  mem.set(memSnapshot);
  seedGraphRAM(mem);
  mem.fill(0, PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);

  // Line 1: top edge (10,10) -> (50,10)
  const box1 = callILine(mem, executor, cpu, memSnapshot, 10, 10, 50, 10, 1, false);
  const box1px = countPlotPixels(mem);
  console.log(`  Line 1 top (10,10)->(50,10): returnHit=${box1.returnHit} steps=${box1.stepCount} pixels=${box1px}`);

  // Reseed graph RAM (registers get clobbered) but keep plotSScreen
  seedGraphRAM(mem);

  // Line 2: right edge (50,10) -> (50,50)
  const box2 = callILine(mem, executor, cpu, memSnapshot, 50, 10, 50, 50, 1, false);
  const box2px = countPlotPixels(mem);
  console.log(`  Line 2 right (50,10)->(50,50): returnHit=${box2.returnHit} steps=${box2.stepCount} pixels=${box2px}`);

  seedGraphRAM(mem);

  // Line 3: bottom edge (50,50) -> (10,50)
  const box3 = callILine(mem, executor, cpu, memSnapshot, 50, 50, 10, 50, 1, false);
  const box3px = countPlotPixels(mem);
  console.log(`  Line 3 bottom (50,50)->(10,50): returnHit=${box3.returnHit} steps=${box3.stepCount} pixels=${box3px}`);

  seedGraphRAM(mem);

  // Line 4: left edge (10,50) -> (10,10)
  const box4 = callILine(mem, executor, cpu, memSnapshot, 10, 50, 10, 10, 1, false);
  const box4px = countPlotPixels(mem);
  console.log(`  Line 4 left (10,50)->(10,10): returnHit=${box4.returnHit} steps=${box4.stepCount} pixels=${box4px}`);

  console.log(`  Total non-zero bytes after box: ${box4px}`);
  dumpPlotSScreenSample(mem, 'Test 2 box');

  // ═══════════════════════════════════════════════════════════════════════
  // Test 3: GraphPars with seeded BCD graph window
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n=== Test 3: GraphPars (0x09986C) with seeded graph window ===');

  // Run MEM_INIT first
  mem.set(memSnapshot);
  prepareCallState(cpu, mem);
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;

  console.log('  Running MEM_INIT (0x09DEE0)...');
  let memInitReturn = false;
  let memInitSteps = 0;
  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        memInitSteps++;
        if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__');
      },
      onMissingBlock(pc) {
        memInitSteps++;
        if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__');
      },
    });
  } catch (e) {
    if (e?.message === '__RET__') memInitReturn = true;
    else throw e;
  }
  console.log(`  MEM_INIT: returnHit=${memInitReturn} steps=${memInitSteps}`);

  // Now seed graph window
  seedGraphWindow(mem);
  seedGraphRAM(mem);
  seedAllocator(mem);
  mem.fill(0, PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);

  // Verify BCD values written
  const wrapped = wrapMem(mem);
  console.log(`  Xmin=${readReal(wrapped, XMIN_ADDR)} Xmax=${readReal(wrapped, XMAX_ADDR)}`);
  console.log(`  Ymin=${readReal(wrapped, YMIN_ADDR)} Ymax=${readReal(wrapped, YMAX_ADDR)}`);
  console.log(`  graphMode=${mem[GRAPHMODE_ADDR]}`);

  // Prepare for GraphPars call
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  console.log('  Calling GraphPars (0x09986C)...');
  const t3 = runCall('Test 3: GraphPars', GRAPHPARS_ENTRY, mem, executor, cpu, STEP_BUDGET);

  const t3pixels = countPlotPixels(mem);
  console.log(`  plotSScreen non-zero bytes after GraphPars: ${t3pixels}`);
  if (t3pixels > 0) {
    dumpPlotSScreenSample(mem, 'Test 3 GraphPars');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Test 4: DrawCmd probe
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n=== Test 4: DrawCmd (0x05DD96) probe ===');

  // Re-init from snapshot
  mem.set(memSnapshot);
  prepareCallState(cpu, mem);
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;

  console.log('  Running MEM_INIT (0x09DEE0)...');
  let memInit2Return = false;
  let memInit2Steps = 0;
  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        memInit2Steps++;
        if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__');
      },
      onMissingBlock(pc) {
        memInit2Steps++;
        if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__');
      },
    });
  } catch (e) {
    if (e?.message === '__RET__') memInit2Return = true;
    else throw e;
  }
  console.log(`  MEM_INIT: returnHit=${memInit2Return} steps=${memInit2Steps}`);

  // Seed graph window + RAM
  seedGraphWindow(mem);
  seedGraphRAM(mem);
  seedAllocator(mem);
  mem.fill(0, PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);

  // Prepare for DrawCmd call
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  console.log('  Calling DrawCmd (0x05DD96)...');
  const t4 = runCall('Test 4: DrawCmd', DRAWCMD_ENTRY, mem, executor, cpu, STEP_BUDGET);

  const t4pixels = countPlotPixels(mem);
  console.log(`  plotSScreen non-zero bytes after DrawCmd: ${t4pixels}`);
  if (t4pixels > 0) {
    dumpPlotSScreenSample(mem, 'Test 4 DrawCmd');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n=== Summary ===');
  console.log('');
  console.log(`Test 1 — ILine (5,5)->(50,50): returnHit=${t1.returnHit} pixels=${t1pixels}`);
  console.log(`Test 2 — Box outline: final pixel count=${box4px}`);
  console.log(`  Line 1 (top):    ret=${box1.returnHit} px=${box1px}`);
  console.log(`  Line 2 (right):  ret=${box2.returnHit} px=${box2px}`);
  console.log(`  Line 3 (bottom): ret=${box3.returnHit} px=${box3px}`);
  console.log(`  Line 4 (left):   ret=${box4.returnHit} px=${box4px}`);
  console.log(`Test 3 — GraphPars: returnHit=${t3.returnHit} steps=${t3.stepCount} pixels=${t3pixels} missingBlocks=${t3.missingBlockPcs.size}`);
  console.log(`Test 4 — DrawCmd:   returnHit=${t4.returnHit} steps=${t4.stepCount} pixels=${t4pixels} missingBlocks=${t4.missingBlockPcs.size}`);
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
