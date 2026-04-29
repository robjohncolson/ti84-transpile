#!/usr/bin/env node

/**
 * Phase 130 — Graph subsystem: ILine rendering probe
 *
 * Tests ILine (0x07B245) which draws a line by iteratively calling IPoint.
 * ILine shares the IPoint core but sets modeByte=1 at 0xD02AD4.
 *
 * Session 129 proved IPoint works with drawMode=1, small coords (<60),
 * seeded RAM. This probe calls ILine with start/end points to render
 * diagonal, horizontal, and vertical lines.
 *
 * ILine register convention (from disassembly + session 127):
 *   A  = draw mode (1 = normal draw)
 *   BC = X1 (start X)
 *   DE = Y1 (start Y)
 *   End coords: investigation needed — try HL=X2, stack=Y2,
 *   then try pushing both on stack, then try other combos.
 *
 * Fallback: if ILine fails, call IPoint in a loop for 10 pixels.
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

// ILine / IPoint addresses
const ILINE_ENTRY = 0x07B245;
const IPOINT_ENTRY = 0x07B451;

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

const STEP_BUDGET = 50000;
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
  write16(mem, PIX_WIDE_P_ADDR, 320);    // pixWideP
  write16(mem, PIX_WIDE_M2_ADDR, 240);   // pixWide_m_2
  write16(mem, DRAW_COLOR_CODE_ADDR, 0x001F); // pen color (blue, non-zero so pixels are visible)
  write16(mem, DRAW_FG_COLOR_ADDR, 0x001F);
  write16(mem, DRAW_BG_COLOR_ADDR, 0xFFFF);
  mem[HOOKFLAGS3_ADDR] &= ~0x80;         // hookflags3 bit 7 = 0
  mem[MODE_BYTE_ADDR] = 1;               // mode byte = line mode
  mem[0xD00082] |= (1 << 4);             // grfFuncM bit 4
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
  // Show first few non-zero byte locations
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
      const col = (offset % 160) * 2; // 4bpp = 2 pixels per byte
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

// ── ILine test ────────────────────────────────────────────────────────────

function testILine(label, mem, executor, cpu, memSnapshot, x1, y1, x2, y2, drawMode, stackLayout) {
  // Restore clean state
  mem.set(memSnapshot);
  seedGraphRAM(mem);
  prepareCallState(cpu, mem);
  seedAllocator(mem);

  // Clear plotSScreen
  mem.fill(0, PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);

  // Set registers for ILine
  cpu.a = drawMode;
  cpu._bc = x1 & 0xffffff;
  cpu._de = y1 & 0xffffff;

  // Push fake return address
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  // Set up end coordinates based on stackLayout strategy
  if (stackLayout === 'hl-stack') {
    // HL = X2, push Y2 before FAKE_RET
    cpu._hl = x2 & 0xffffff;
    cpu.sp -= 3;
    write24(mem, cpu.sp, y2 & 0xffffff);
  } else if (stackLayout === 'stack-both') {
    // Push X2 then Y2 (Y2 on top)
    cpu.sp -= 3;
    write24(mem, cpu.sp, x2 & 0xffffff);
    cpu.sp -= 3;
    write24(mem, cpu.sp, y2 & 0xffffff);
  } else if (stackLayout === 'stack-both-reverse') {
    // Push Y2 then X2 (X2 on top)
    cpu.sp -= 3;
    write24(mem, cpu.sp, y2 & 0xffffff);
    cpu.sp -= 3;
    write24(mem, cpu.sp, x2 & 0xffffff);
  } else if (stackLayout === 'hl-y2-only') {
    // HL = Y2, no extra stack
    cpu._hl = y2 & 0xffffff;
  } else if (stackLayout === 'hl-x2-bc-de-swap') {
    // BC=X2, DE=Y2, HL=X1, stack has Y1
    // (try swapping: BC/DE = end, HL/stack = start)
    cpu._bc = x2 & 0xffffff;
    cpu._de = y2 & 0xffffff;
    cpu._hl = x1 & 0xffffff;
    cpu.sp -= 3;
    write24(mem, cpu.sp, y1 & 0xffffff);
  } else if (stackLayout === 'ram-direct') {
    // Write end coords directly to ILine save locations
    // ILine saves BC→0xD022D1, DE→0xD022D2, then reads them later
    // Try pre-writing end coords to nearby RAM
    cpu._hl = x2 & 0xffffff;
    write24(mem, 0xD022D1, x2 & 0xffffff);
    write24(mem, 0xD022D4, y2 & 0xffffff);
  }

  console.log(`\n  Stack layout: ${stackLayout}`);
  console.log(`  Registers: A=${hex(cpu.a, 2)} BC=${hex(cpu._bc)} DE=${hex(cpu._de)} HL=${hex(cpu._hl)} SP=${hex(cpu.sp)}`);
  if (stackLayout !== 'hl-y2-only' && stackLayout !== 'ram-direct') {
    console.log(`  Stack top: ${hexBytes(mem, cpu.sp, 12)}`);
  }

  const result = runCall(label, ILINE_ENTRY, mem, executor, cpu, STEP_BUDGET);

  const pixels = countPlotPixels(mem);
  console.log(`  plotSScreen non-zero bytes: ${pixels}`);
  dumpPlotSScreenSample(mem, label);

  return { ...result, pixels };
}

// ── IPoint loop fallback ──────────────────────────────────────────────────

function testIPointLoop(label, mem, executor, cpu, memSnapshot, coords, drawMode) {
  console.log(`\n=== ${label} ===`);

  mem.set(memSnapshot);
  seedGraphRAM(mem);

  // Clear plotSScreen
  mem.fill(0, PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);

  let totalPixels = 0;
  let successCount = 0;

  for (const [x, y] of coords) {
    prepareCallState(cpu, mem);
    seedAllocator(mem);

    cpu.a = drawMode;
    cpu._bc = x & 0xffffff;
    cpu._de = y & 0xffffff;
    cpu.sp -= 3;
    write24(mem, cpu.sp, FAKE_RET);

    const beforeCount = countPlotPixels(mem);

    let returnHit = false;
    let stepCount = 0;
    try {
      executor.runFrom(IPOINT_ENTRY, 'adl', {
        maxSteps: 500,
        maxLoopIterations: 256,
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

    const afterCount = countPlotPixels(mem);
    const newPixels = afterCount - beforeCount;
    if (newPixels > 0) successCount++;
    totalPixels = afterCount;

    console.log(`  IPoint(${x},${y}): returnHit=${returnHit} steps=${stepCount} newPixels=${newPixels}`);
  }

  console.log(`  Total non-zero plotSScreen bytes: ${totalPixels}`);
  console.log(`  Successful pixel writes: ${successCount} / ${coords.length}`);
  dumpPlotSScreenSample(mem, label);

  return { totalPixels, successCount };
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 130: ILine Rendering Probe ===');
  console.log('');

  // ── Task 0: Disassemble ILine entry ──

  console.log('--- Task 0: ILine disassembly (0x07B245 - 0x07B320) ---');
  const disasm = disassembleRange(0x07B245, 0x07B320);
  for (const line of disasm) console.log(line);
  console.log('');

  // Also disassemble 0x07B320-0x07B451 to see the loop body
  console.log('--- ILine body (0x07B320 - 0x07B451) ---');
  const disasm2 = disassembleRange(0x07B320, 0x07B451);
  for (const line of disasm2) console.log(line);
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

  // ── Test 1: ILine diagonal (10,10)→(50,50), try HL=X2 + push Y2 ──

  console.log('=== Test 1: ILine diagonal (10,10)→(50,50) — HL=X2, stack=Y2 ===');
  const t1 = testILine('Test 1 (hl-stack)', mem, executor, cpu, memSnapshot,
    10, 10, 50, 50, 1, 'hl-stack');

  // ── Test 2: ILine diagonal — push both X2,Y2 on stack ──

  console.log('\n=== Test 2: ILine diagonal (10,10)→(50,50) — stack both (X2 first) ===');
  const t2 = testILine('Test 2 (stack-both)', mem, executor, cpu, memSnapshot,
    10, 10, 50, 50, 1, 'stack-both');

  // ── Test 3: ILine diagonal — push both reversed ──

  console.log('\n=== Test 3: ILine diagonal (10,10)→(50,50) — stack both (Y2 first) ===');
  const t3 = testILine('Test 3 (stack-both-reverse)', mem, executor, cpu, memSnapshot,
    10, 10, 50, 50, 1, 'stack-both-reverse');

  // ── Test 4: ILine — HL=Y2 only ──

  console.log('\n=== Test 4: ILine diagonal (10,10)→(50,50) — HL=Y2 only ===');
  const t4 = testILine('Test 4 (hl-y2-only)', mem, executor, cpu, memSnapshot,
    10, 10, 50, 50, 1, 'hl-y2-only');

  // ── Test 5: ILine horizontal (10,20)→(50,20) — best layout from above ──

  // Find which layout worked best
  const bestTest = [
    { name: 'hl-stack', t: t1 },
    { name: 'stack-both', t: t2 },
    { name: 'stack-both-reverse', t: t3 },
    { name: 'hl-y2-only', t: t4 },
  ].sort((a, b) => b.t.pixels - a.t.pixels)[0];

  console.log(`\n=== Best layout so far: ${bestTest.name} (${bestTest.t.pixels} pixels) ===`);
  const bestLayout = bestTest.name;

  console.log('\n=== Test 5: ILine horizontal (10,20)→(50,20) ===');
  const t5 = testILine('Test 5 (horizontal)', mem, executor, cpu, memSnapshot,
    10, 20, 50, 20, 1, bestLayout);

  // ── Test 6: ILine vertical (20,10)→(20,50) ──

  console.log('\n=== Test 6: ILine vertical (20,10)→(20,50) ===');
  const t6 = testILine('Test 6 (vertical)', mem, executor, cpu, memSnapshot,
    20, 10, 20, 50, 1, bestLayout);

  // ── Test 7: ILine with ram-direct layout ──

  console.log('\n=== Test 7: ILine diagonal (10,10)→(50,50) — RAM direct ===');
  const t7 = testILine('Test 7 (ram-direct)', mem, executor, cpu, memSnapshot,
    10, 10, 50, 50, 1, 'ram-direct');

  // ── Test 8 (Fallback): IPoint loop — 10 pixels along a diagonal ──

  const diagCoords = [];
  for (let i = 0; i < 10; i++) {
    diagCoords.push([10 + i * 4, 10 + i * 4]);
  }
  const t8 = testIPointLoop('Test 8: IPoint loop — 10 diagonal pixels', mem, executor, cpu, memSnapshot, diagCoords, 1);

  // ── Test 9 (Fallback): IPoint loop — horizontal line ──

  const horizCoords = [];
  for (let i = 0; i < 10; i++) {
    horizCoords.push([10 + i * 4, 20]);
  }
  const t9 = testIPointLoop('Test 9: IPoint loop — 10 horizontal pixels', mem, executor, cpu, memSnapshot, horizCoords, 1);

  // ── Test 10 (Fallback): IPoint loop — vertical line ──

  const vertCoords = [];
  for (let i = 0; i < 10; i++) {
    vertCoords.push([20, 10 + i * 4]);
  }
  const t10 = testIPointLoop('Test 10: IPoint loop — 10 vertical pixels', mem, executor, cpu, memSnapshot, vertCoords, 1);

  // ── Summary ──

  console.log('\n=== Summary ===');
  console.log('');
  console.log('ILine tests:');
  for (const [name, t] of [
    ['Test 1 (hl-stack, diagonal)', t1],
    ['Test 2 (stack-both, diagonal)', t2],
    ['Test 3 (stack-both-reverse, diagonal)', t3],
    ['Test 4 (hl-y2-only, diagonal)', t4],
    ['Test 5 (horizontal, ' + bestLayout + ')', t5],
    ['Test 6 (vertical, ' + bestLayout + ')', t6],
    ['Test 7 (ram-direct, diagonal)', t7],
  ]) {
    console.log(`  ${name}: returnHit=${t.returnHit} steps=${t.stepCount} pixels=${t.pixels} finalPC=${hex(t.finalPc)}`);
  }

  console.log('');
  console.log('IPoint fallback tests:');
  console.log(`  Test 8 (diagonal loop):   ${t8.successCount}/10 pixels, total=${t8.totalPixels}`);
  console.log(`  Test 9 (horizontal loop):  ${t9.successCount}/10 pixels, total=${t9.totalPixels}`);
  console.log(`  Test 10 (vertical loop):   ${t10.successCount}/10 pixels, total=${t10.totalPixels}`);
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
