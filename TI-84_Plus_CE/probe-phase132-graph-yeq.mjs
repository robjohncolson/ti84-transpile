#!/usr/bin/env node

/**
 * Phase 132 — GraphPars with new seed at 0x0998CA + Y-equation storage investigation.
 *
 * Test 1: GraphPars with new seed — should get past step 84 (previously stalled at missing 0x0998CA)
 * Test 2: Y-equation storage investigation — read equation area, flags, VAT
 * Test 3: DrawCmd with seeded Y=X equation (exploratory)
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

// Entry points
const GRAPHPARS_ENTRY = 0x09986C;
const DRAWCMD_ENTRY = 0x05DD96;
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
  write16(mem, DRAW_COLOR_CODE_ADDR, 0x001F);
  write16(mem, DRAW_FG_COLOR_ADDR, 0x001F);
  write16(mem, DRAW_BG_COLOR_ADDR, 0xFFFF);
  mem[HOOKFLAGS3_ADDR] &= ~0x80;
  mem[MODE_BYTE_ADDR] = 1;
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
          const lines = disassembleRange(pc, Math.min(pc + 16, 0x400000));
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

// ── Hex dump helper ──────────────────────────────────────────────────────

function hexDump(mem, start, length, label) {
  console.log(`  ${label} (${hex(start)} - ${hex(start + length - 1)}):`);
  for (let row = 0; row < length; row += 16) {
    const addr = start + row;
    const bytes = [];
    const ascii = [];
    for (let i = 0; i < 16 && (row + i) < length; i++) {
      const b = mem[addr + i] & 0xff;
      bytes.push(b.toString(16).toUpperCase().padStart(2, '0'));
      ascii.push(b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.');
    }
    console.log(`    ${hex(addr)}: ${bytes.join(' ').padEnd(48)} ${ascii.join('')}`);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 132: GraphPars Seed + Y-Equation Investigation ===');
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
  // Test 1: GraphPars with new seed at 0x0998CA
  // ═══════════════════════════════════════════════════════════════════════

  console.log('=== Test 1: GraphPars (0x09986C) with new seed — should pass step 84 ===');

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

  // Seed graph window + RAM
  seedGraphWindow(mem);
  seedGraphRAM(mem);
  seedAllocator(mem);
  mem.fill(0, PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);

  // Verify BCD values
  const wrapped = wrapMem(mem);
  console.log(`  Xmin=${readReal(wrapped, XMIN_ADDR)} Xmax=${readReal(wrapped, XMAX_ADDR)}`);
  console.log(`  Ymin=${readReal(wrapped, YMIN_ADDR)} Ymax=${readReal(wrapped, YMAX_ADDR)}`);
  console.log(`  graphMode=${mem[GRAPHMODE_ADDR]}`);

  // Prepare for GraphPars call
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  console.log('  Calling GraphPars (0x09986C) with 50,000 step budget...');
  const t1 = runCall('Test 1: GraphPars', GRAPHPARS_ENTRY, mem, executor, cpu, 50000);

  const t1pixels = countPlotPixels(mem);
  console.log(`  plotSScreen non-zero bytes after GraphPars: ${t1pixels}`);
  if (t1pixels > 0) {
    dumpPlotSScreenSample(mem, 'Test 1 GraphPars');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Test 2: Y-equation storage investigation
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n=== Test 2: Y-equation storage investigation ===');

  // Read the equation area after MEM_INIT
  console.log('\n  --- Graph equation area (0xD01E00-0xD01F00) ---');
  hexDump(mem, 0xD01E00, 0x100, 'Equation area');

  // Read equation flags region (0xD023B0-0xD02400)
  console.log('\n  --- Equation flags region (0xD023B0-0xD02400) ---');
  hexDump(mem, 0xD023B0, 0x50, 'Equation flags');

  // Check IY-relative graph flags
  const iyBase = 0xD00080;
  console.log(`\n  --- IY-relative graph flags (IY=0x${iyBase.toString(16).toUpperCase()}) ---`);
  console.log(`  (IY+0x14) = ${hex(mem[iyBase + 0x14], 2)} — graph-related flags`);
  console.log(`  (IY+0x48) = ${hex(mem[iyBase + 0x48], 2)} — graph-related flags`);
  console.log(`  (IY+0x49) = ${hex(mem[iyBase + 0x49], 2)}`);
  console.log(`  (IY+0x4A) = ${hex(mem[iyBase + 0x4A], 2)}`);
  console.log(`  (IY+0x09) = ${hex(mem[iyBase + 0x09], 2)} — graph mode flags`);

  // Dump ROM bytes around graph variable area
  // TI-OS Y= equation pointers — check if there's a table near equAddr area
  // Standard: Y1-Y0 equation data starts around 0xD02688
  console.log('\n  --- Equation data pointers area (0xD02680-0xD026F0) ---');
  hexDump(mem, 0xD02680, 0x70, 'Eq data ptrs');

  // Look for Y-var type bytes (0x12 = EquObj) in the VAT area
  // VAT starts at end of RAM and grows downward from 0xD3FFFF
  console.log('\n  --- Searching for EquObj (0x12) entries in VAT area ---');
  let equObjCount = 0;
  for (let addr = 0xD3FF00; addr < 0xD40000; addr++) {
    if (mem[addr] === 0x12) {
      console.log(`    Found 0x12 at ${hex(addr)}: context=${hexBytes(mem, addr - 2, 10)}`);
      equObjCount++;
      if (equObjCount >= 10) break;
    }
  }
  if (equObjCount === 0) {
    console.log('    No EquObj (0x12) entries found in VAT tail region');
  }

  // Check equation enable/disable flags
  // grfDBFlags area is at IY+0x04 through IY+0x08
  console.log('\n  --- Graph DB flags (IY+0x00 to IY+0x0F) ---');
  hexDump(mem, iyBase, 0x10, 'IY base flags');

  // Dump the graph format (grfFmt) area
  console.log('\n  --- grfFmt flags area (IY+0x40 to IY+0x60) ---');
  hexDump(mem, iyBase + 0x40, 0x20, 'grfFmt flags');

  // Disassemble around 0x0998CA to understand what GraphPars does there
  console.log('\n  --- Disassembly around 0x0998CA (the previously-missing block) ---');
  const lines = disassembleRange(0x0998B0, 0x099920);
  for (const line of lines) console.log(line);

  // ═══════════════════════════════════════════════════════════════════════
  // Test 3: DrawCmd with larger budget (exploratory)
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n=== Test 3: DrawCmd (0x05DD96) after GraphPars ===');

  // Re-init from snapshot
  mem.set(memSnapshot);
  prepareCallState(cpu, mem);
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;

  console.log('  Running MEM_INIT...');
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

  // Run GraphPars first so DrawCmd has parsed graph params
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  console.log('  Running GraphPars first...');
  let gpReturn = false;
  let gpSteps = 0;
  try {
    executor.runFrom(GRAPHPARS_ENTRY, 'adl', {
      maxSteps: 50000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        gpSteps++;
        if ((pc & 0xffffff) === FAKE_RET) throw new Error('__RET__');
      },
      onMissingBlock(pc) {
        gpSteps++;
        if ((pc & 0xffffff) === FAKE_RET) throw new Error('__RET__');
      },
    });
  } catch (e) {
    if (e?.message === '__RET__') gpReturn = true;
    else throw e;
  }
  console.log(`  GraphPars: returnHit=${gpReturn} steps=${gpSteps}`);

  // Now run DrawCmd
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  console.log('  Calling DrawCmd (0x05DD96)...');
  const t3 = runCall('Test 3: DrawCmd', DRAWCMD_ENTRY, mem, executor, cpu, STEP_BUDGET);

  const t3pixels = countPlotPixels(mem);
  console.log(`  plotSScreen non-zero bytes after DrawCmd: ${t3pixels}`);
  if (t3pixels > 0) {
    dumpPlotSScreenSample(mem, 'Test 3 DrawCmd');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n=== Summary ===');
  console.log('');
  console.log(`Test 1 — GraphPars: returnHit=${t1.returnHit} steps=${t1.stepCount} pixels=${t1pixels} missingBlocks=${t1.missingBlockPcs.size}`);
  console.log(`  Previous session 131: stalled at step 84 with missing block 0x0998CA`);
  console.log(`  Now: ${t1.stepCount > 84 ? 'PASSED step 84 barrier' : 'STILL stalled at step 84'}`);
  console.log(`Test 2 — Y-equation storage: see dump output above`);
  console.log(`Test 3 — DrawCmd after GraphPars: returnHit=${t3.returnHit} steps=${t3.stepCount} pixels=${t3pixels} missingBlocks=${t3.missingBlockPcs.size}`);
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
