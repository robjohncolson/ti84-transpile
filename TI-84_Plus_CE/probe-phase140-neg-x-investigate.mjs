#!/usr/bin/env node

/**
 * Phase 140 — Negative X infinite loop investigation.
 *
 * Tests the GraphPars pipeline with X=-1 to identify where the infinite
 * loop occurs and whether seeding graph window variables fixes it.
 *
 * Approach:
 *   1. Same setup as probe-phase139 (cold boot, MEM_INIT, CreateEqu Y1=X)
 *   2. Call GraphPars body with tX intercept for X=-1
 *   3. Trace up to 5000 steps, recording every PC visited
 *   4. Identify repeating PC ranges (loop detection)
 *   5. Test with and without graph window seeding
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { writeReal, readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

// ── Constants ──────────────────────────────────────────────────────────────

const MEM_SIZE       = 0x1000000;
const STACK_RESET_TOP = 0xd1a87e;
const USERMEM_ADDR   = 0xd1a881;
const EMPTY_VAT_ADDR = 0xd3ffff;

const OPBASE_ADDR    = 0xd02590;
const OPS_ADDR       = 0xd02593;
const FPSBASE_ADDR   = 0xd0258a;
const FPS_ADDR       = 0xd0258d;
const PTEMPCNT_ADDR  = 0xd02596;
const PTEMP_ADDR     = 0xd0259a;
const PROGPTR_ADDR   = 0xd0259d;
const NEWDATA_PTR    = 0xd025a0;

const FAKE_RET          = 0x7ffffe;
const CREATEEQU_RET     = 0x7FFFFA;
const GRAPHPARS_RET     = 0x7FFFF4;
const MEMINIT_RET       = 0x7FFFF6;

const CREATEEQU_ENTRY     = 0x082438;
const GRAPHPARS_BODY_ENTRY = 0x099874;
const MEMINIT_ENTRY       = 0x09DEE0;

const OP1_ADDR    = 0xd005f8;
const OP1_LEN     = 9;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

const BEGPC_ADDR  = 0xD02317;
const CURPC_ADDR  = 0xD0231A;
const ENDPC_ADDR  = 0xD0231D;

const PIX_WIDE_P_ADDR  = 0xD014FE;
const PIX_WIDE_M2_ADDR = 0xD01501;
const DRAW_COLOR_CODE   = 0xD026AE;
const DRAW_FG_COLOR     = 0xD026AC;
const DRAW_BG_COLOR     = 0xD026AA;
const HOOKFLAGS3_ADDR   = 0xD000B5;
const MODE_BYTE_ADDR    = 0xD02AD4;

const XMIN_ADDR   = 0xD01E33;
const XMAX_ADDR   = 0xD01E3C;
const XSCL_ADDR   = 0xD01E45;
const YMIN_ADDR   = 0xD01E4E;
const YMAX_ADDR   = 0xD01E57;
const YSCL_ADDR   = 0xD01E60;
const XRES_ADDR   = 0xD01E69;
const GRAPHMODE_ADDR = 0xD01474;

const EQUOBJ_TYPE = 0x03;
const TY1 = 0x10;
const TX = 0x58;
const TX_HANDLER_PC = 0x07D1B4;

const FPS_START_ADDR = USERMEM_ADDR + 0x200;
const MAX_LOOP_ITER = 8192;

// ── Helpers ───────────────────────────────────────────────────────────────

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

function wrapMem(rawMem) {
  return {
    write8(addr, val) { rawMem[addr] = val & 0xff; },
    read8(addr) { return rawMem[addr] & 0xff; },
  };
}

// ── Runtime setup ─────────────────────────────────────────────────────────

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const executor = createExecutor(BLOCKS, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
  });
  return { mem, executor, cpu: executor.cpu };
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(0x08c331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xd0; cpu._iy = 0xd00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(0x0802b2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
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
  write24(mem, FPSBASE_ADDR, FPS_START_ADDR);
  write24(mem, FPS_ADDR, FPS_START_ADDR);
  write24(mem, NEWDATA_PTR, USERMEM_ADDR);
}

function seedGraphRAM(mem) {
  write16(mem, PIX_WIDE_P_ADDR, 265);
  write16(mem, PIX_WIDE_M2_ADDR, 165);
  write16(mem, DRAW_COLOR_CODE, 0x001F);
  write16(mem, DRAW_FG_COLOR, 0x001F);
  write16(mem, DRAW_BG_COLOR, 0xFFFF);
  mem[HOOKFLAGS3_ADDR] &= ~0x80;
  mem[MODE_BYTE_ADDR] = 1;
  mem[0xD00082] |= (1 << 4);
}

function seedGraphWindow(mem) {
  const wrapped = wrapMem(mem);
  writeReal(wrapped, XMIN_ADDR, -10);
  writeReal(wrapped, XMAX_ADDR, 10);
  writeReal(wrapped, XSCL_ADDR, 1);
  writeReal(wrapped, YMIN_ADDR, -10);
  writeReal(wrapped, YMAX_ADDR, 10);
  writeReal(wrapped, YSCL_ADDR, 1);
  writeReal(wrapped, XRES_ADDR, 1);
  mem[GRAPHMODE_ADDR] = 0;
}

function seedErrorFrame(cpu, mem, recoveryAddr) {
  const errFrameSP = cpu.sp - 18;
  write24(mem, errFrameSP + 0, 0xD00080);
  write24(mem, errFrameSP + 3, 0xD1A860);
  write24(mem, errFrameSP + 6, 0x000000);
  write24(mem, errFrameSP + 9, 0x000000);
  write24(mem, errFrameSP + 12, recoveryAddr);
  write24(mem, errFrameSP + 15, 0x000040);
  write24(mem, ERR_SP_ADDR, errFrameSP);
  mem[ERR_NO_ADDR] = 0x00;
  return errFrameSP;
}

function callOSRoutine(label, entry, retAddr, executor, cpu, mem, budget) {
  let returnHit = false;
  try {
    executor.runFrom(entry, 'adl', {
      maxSteps: budget,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        const n = pc & 0xffffff;
        if (n === retAddr || n === FAKE_RET) { returnHit = true; throw new Error('__RET__'); }
      },
      onMissingBlock(pc) {
        const n = pc & 0xffffff;
        if (n === retAddr || n === FAKE_RET) { returnHit = true; throw new Error('__RET__'); }
      },
    });
  } catch (e) {
    if (e?.message !== '__RET__') throw e;
  }
  return { returnHit };
}

function createEquY1(executor, cpu, mem) {
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem[OP1_ADDR + 0] = EQUOBJ_TYPE;
  mem[OP1_ADDR + 1] = TY1;

  prepareCallState(cpu, mem);
  cpu._hl = 1;
  cpu.sp -= 3;
  write24(mem, cpu.sp, CREATEEQU_RET);
  seedErrorFrame(cpu, mem, CREATEEQU_RET);

  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem[OP1_ADDR + 0] = EQUOBJ_TYPE;
  mem[OP1_ADDR + 1] = TY1;

  const result = callOSRoutine('CreateEqu', CREATEEQU_ENTRY, CREATEEQU_RET, executor, cpu, mem, 50000);
  const de = cpu._de;
  const errNo = mem[ERR_NO_ADDR];

  if (result.returnHit && errNo === 0x00 && de >= 0xD00000 && de < 0xD40000) {
    mem[de] = TX;
    return { tokenAddr: de, success: true };
  }
  return { tokenAddr: 0, success: false };
}

// ── Traced GraphPars call ─────────────────────────────────────────────────

function callGraphParsTraced(executor, cpu, mem, tokenAddr, xVal, wrapped, savedFPS, maxSteps) {
  // Reset FPS
  write24(mem, FPS_ADDR, savedFPS);

  // OP1 = Y1
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem[OP1_ADDR + 0] = EQUOBJ_TYPE;
  mem[OP1_ADDR + 1] = TY1;

  // Parser pointers
  write24(mem, BEGPC_ADDR, tokenAddr);
  write24(mem, CURPC_ADDR, tokenAddr);
  write24(mem, ENDPC_ADDR, tokenAddr + 1);

  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, GRAPHPARS_RET);
  seedErrorFrame(cpu, mem, GRAPHPARS_RET);

  // Re-set OP1
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem[OP1_ADDR + 0] = EQUOBJ_TYPE;
  mem[OP1_ADDR + 1] = TY1;

  let returnHit = false;
  let tXHit = false;
  let steps = 0;
  const pcTrace = [];     // ordered list of PCs
  const pcFrequency = new Map();  // PC -> count

  function recordPC(pc) {
    const n = pc & 0xffffff;
    pcTrace.push(n);
    pcFrequency.set(n, (pcFrequency.get(n) || 0) + 1);
  }

  function handleBlock(pc) {
    steps++;
    const n = pc & 0xffffff;
    recordPC(n);

    if (n === TX_HANDLER_PC && !tXHit) {
      tXHit = true;
      const fps = read24(mem, FPS_ADDR);
      writeReal(wrapped, fps, xVal);
      write24(mem, FPS_ADDR, fps + 9);
      writeReal(wrapped, OP1_ADDR, xVal);
      const retAddr = read24(mem, cpu.sp);
      cpu.sp += 3;
      cpu.pc = retAddr;
      throw new Error('__SKIP__');
    }

    if (n === GRAPHPARS_RET || n === FAKE_RET) {
      returnHit = true;
      throw new Error('__RET__');
    }
  }

  // Phase 1
  try {
    executor.runFrom(GRAPHPARS_BODY_ENTRY, 'adl', {
      maxSteps: maxSteps,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock: handleBlock,
      onMissingBlock: handleBlock,
    });
  } catch (e) {
    if (e?.message === '__SKIP__') {
      // Phase 2
      try {
        executor.runFrom(cpu.pc, 'adl', {
          maxSteps: maxSteps - steps,
          maxLoopIterations: MAX_LOOP_ITER,
          onBlock(pc) {
            steps++;
            const n = pc & 0xffffff;
            recordPC(n);
            if (n === GRAPHPARS_RET || n === FAKE_RET) { returnHit = true; throw new Error('__RET__'); }
          },
          onMissingBlock(pc) {
            steps++;
            const n = pc & 0xffffff;
            recordPC(n);
            if (n === GRAPHPARS_RET || n === FAKE_RET) { returnHit = true; throw new Error('__RET__'); }
          },
        });
      } catch (e2) {
        if (e2?.message !== '__RET__') throw e2;
      }
    } else if (e?.message !== '__RET__') {
      throw e;
    }
  }

  const errNo = mem[ERR_NO_ADDR];
  // Strip evaluated flag (bit 6) but preserve sign bit (bit 7)
  const savedType = mem[OP1_ADDR];
  mem[OP1_ADDR] = savedType & 0xBF;
  let yVal = null;
  try { yVal = readReal(wrapped, OP1_ADDR); } catch (e) { /* decode fail */ }
  mem[OP1_ADDR] = savedType;

  return { returnHit, tXHit, errNo, yVal, steps, pcTrace, pcFrequency };
}

// ── Loop detection ────────────────────────────────────────────────────────

function detectLoops(pcTrace, pcFrequency) {
  // Find PCs that appear many times — these are the loop body
  const sorted = [...pcFrequency.entries()]
    .filter(([_, count]) => count > 5)
    .sort((a, b) => b[1] - a[1]);

  // Find the repeating cycle: look at the last N PCs and find the period
  if (pcTrace.length < 20) return { loopPCs: sorted, period: 0, loopRange: null };

  const tail = pcTrace.slice(-200);
  let bestPeriod = 0;
  for (let p = 2; p <= 50; p++) {
    let match = true;
    for (let i = 0; i < Math.min(p * 3, tail.length - p); i++) {
      if (tail[tail.length - 1 - i] !== tail[tail.length - 1 - i - p]) {
        match = false;
        break;
      }
    }
    if (match) { bestPeriod = p; break; }
  }

  // Find the range of addresses in the loop
  let loopRange = null;
  if (bestPeriod > 0) {
    const loopCycle = tail.slice(-bestPeriod);
    const minPC = Math.min(...loopCycle);
    const maxPC = Math.max(...loopCycle);
    loopRange = { min: minPC, max: maxPC, cycle: loopCycle };
  }

  return { loopPCs: sorted, period: bestPeriod, loopRange };
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 140: Negative X Infinite Loop Investigation ===\n');

  const { mem, executor, cpu } = createRuntime();
  const wrapped = wrapMem(mem);

  console.log('Cold-booting OS...');
  coldBoot(executor, cpu, mem);
  console.log('Cold boot complete.\n');

  // MEM_INIT
  prepareCallState(cpu, mem);
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  const miResult = callOSRoutine('MEM_INIT', MEMINIT_ENTRY, MEMINIT_RET, executor, cpu, mem, 100000);
  console.log(`MEM_INIT: returned=${miResult.returnHit}\n`);

  seedAllocator(mem);
  seedGraphWindow(mem);
  seedGraphRAM(mem);
  mem[0xD00083] |= 1;

  // Create Y1=X
  console.log('Creating Y1=X equation...');
  const equ = createEquY1(executor, cpu, mem);
  if (!equ.success) { console.log('ABORT: CreateEqu failed'); return; }
  console.log(`  Y1=X created at tokenAddr=${hex(equ.tokenAddr)}\n`);

  const savedOPS = read24(mem, OPS_ADDR);
  const savedOPBase = read24(mem, OPBASE_ADDR);
  const savedProgPtr = read24(mem, PROGPTR_ADDR);
  const savedFPS = read24(mem, FPS_ADDR);

  // ═══════════════════════════════════════════════════════════════════════
  // Test 1: Positive X=1 (baseline — should succeed)
  // ═══════════════════════════════════════════════════════════════════════

  console.log('=== Test 1: X=+1 (baseline) ===');
  write24(mem, OPS_ADDR, savedOPS);
  write24(mem, OPBASE_ADDR, savedOPBase);
  write24(mem, PROGPTR_ADDR, savedProgPtr);
  write24(mem, FPSBASE_ADDR, FPS_START_ADDR);
  seedGraphWindow(mem);
  seedGraphRAM(mem);

  const t1 = callGraphParsTraced(executor, cpu, mem, equ.tokenAddr, 1, wrapped, savedFPS, 5000);
  console.log(`  returned=${t1.returnHit} tXHit=${t1.tXHit} errNo=${hex(t1.errNo, 2)} Y=${t1.yVal} steps=${t1.steps}`);
  console.log(`  Unique PCs: ${t1.pcFrequency.size}`);
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════
  // Test 2: Negative X=-1 (expect infinite loop)
  // ═══════════════════════════════════════════════════════════════════════

  console.log('=== Test 2: X=-1 (negative, 5000 steps) ===');
  write24(mem, OPS_ADDR, savedOPS);
  write24(mem, OPBASE_ADDR, savedOPBase);
  write24(mem, PROGPTR_ADDR, savedProgPtr);
  write24(mem, FPSBASE_ADDR, FPS_START_ADDR);
  seedGraphWindow(mem);
  seedGraphRAM(mem);

  const t2 = callGraphParsTraced(executor, cpu, mem, equ.tokenAddr, -1, wrapped, savedFPS, 5000);
  console.log(`  returned=${t2.returnHit} tXHit=${t2.tXHit} errNo=${hex(t2.errNo, 2)} Y=${t2.yVal} steps=${t2.steps}`);
  console.log(`  Unique PCs: ${t2.pcFrequency.size}`);

  if (!t2.returnHit) {
    const loops = detectLoops(t2.pcTrace, t2.pcFrequency);
    console.log(`  Loop period: ${loops.period}`);
    if (loops.loopRange) {
      console.log(`  Loop PC range: ${hex(loops.loopRange.min)} - ${hex(loops.loopRange.max)}`);
      console.log(`  Loop cycle (${loops.loopRange.cycle.length} PCs): ${loops.loopRange.cycle.map(p => hex(p)).join(' -> ')}`);
    }
    console.log(`  Top 20 most-visited PCs:`);
    for (const [pc, count] of loops.loopPCs.slice(0, 20)) {
      console.log(`    ${hex(pc)}: ${count} hits`);
    }

    // Show the last 30 PCs in trace
    console.log(`  Last 30 PCs in trace:`);
    const last30 = t2.pcTrace.slice(-30);
    console.log(`    ${last30.map(p => hex(p)).join(' ')}`);
  }
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════
  // Test 3: X=-1 with extra graph window seeding
  // ═══════════════════════════════════════════════════════════════════════

  console.log('=== Test 3: X=-1 with extra graph window seeding (task-specified addresses) ===');
  write24(mem, OPS_ADDR, savedOPS);
  write24(mem, OPBASE_ADDR, savedOPBase);
  write24(mem, PROGPTR_ADDR, savedProgPtr);
  write24(mem, FPSBASE_ADDR, FPS_START_ADDR);
  seedGraphWindow(mem);
  seedGraphRAM(mem);

  // Also seed the alternate graph window addresses from the task spec
  writeReal(wrapped, 0xD01478, -10); // Xmin (alt)
  writeReal(wrapped, 0xD01481, 10);  // Xmax (alt)
  writeReal(wrapped, 0xD0148A, -10); // Ymin (alt)
  writeReal(wrapped, 0xD01493, 10);  // Ymax (alt)

  const t3 = callGraphParsTraced(executor, cpu, mem, equ.tokenAddr, -1, wrapped, savedFPS, 5000);
  console.log(`  returned=${t3.returnHit} tXHit=${t3.tXHit} errNo=${hex(t3.errNo, 2)} Y=${t3.yVal} steps=${t3.steps}`);
  console.log(`  Unique PCs: ${t3.pcFrequency.size}`);

  if (!t3.returnHit) {
    const loops = detectLoops(t3.pcTrace, t3.pcFrequency);
    console.log(`  Loop period: ${loops.period}`);
    if (loops.loopRange) {
      console.log(`  Loop PC range: ${hex(loops.loopRange.min)} - ${hex(loops.loopRange.max)}`);
      console.log(`  Loop cycle: ${loops.loopRange.cycle.map(p => hex(p)).join(' -> ')}`);
    }
    console.log(`  Top 10 most-visited PCs:`);
    for (const [pc, count] of loops.loopPCs.slice(0, 10)) {
      console.log(`    ${hex(pc)}: ${count} hits`);
    }
  }
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════
  // Test 4: X=-1 with much higher maxLoopIterations
  // ═══════════════════════════════════════════════════════════════════════

  console.log('=== Test 4: X=-1 with maxSteps=10000 (see if it terminates) ===');
  write24(mem, OPS_ADDR, savedOPS);
  write24(mem, OPBASE_ADDR, savedOPBase);
  write24(mem, PROGPTR_ADDR, savedProgPtr);
  write24(mem, FPSBASE_ADDR, FPS_START_ADDR);
  seedGraphWindow(mem);
  seedGraphRAM(mem);

  const t4 = callGraphParsTraced(executor, cpu, mem, equ.tokenAddr, -1, wrapped, savedFPS, 10000);
  console.log(`  returned=${t4.returnHit} tXHit=${t4.tXHit} errNo=${hex(t4.errNo, 2)} Y=${t4.yVal} steps=${t4.steps}`);
  console.log(`  Unique PCs: ${t4.pcFrequency.size}`);

  if (!t4.returnHit && t4.pcTrace.length > 0) {
    // Check if it's the SAME loop as Test 2
    const loops2 = detectLoops(t2.pcTrace, t2.pcFrequency);
    const loops4 = detectLoops(t4.pcTrace, t4.pcFrequency);
    const sameLoop = loops2.loopRange && loops4.loopRange &&
      loops2.loopRange.min === loops4.loopRange.min &&
      loops2.loopRange.max === loops4.loopRange.max;
    console.log(`  Same loop as Test 2: ${sameLoop}`);
    if (loops4.loopRange) {
      console.log(`  Loop PC range: ${hex(loops4.loopRange.min)} - ${hex(loops4.loopRange.max)}`);
    }
  }
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════
  // Test 5: X=-0.001 (very small negative)
  // ═══════════════════════════════════════════════════════════════════════

  console.log('=== Test 5: X=-0.001 (small negative) ===');
  write24(mem, OPS_ADDR, savedOPS);
  write24(mem, OPBASE_ADDR, savedOPBase);
  write24(mem, PROGPTR_ADDR, savedProgPtr);
  write24(mem, FPSBASE_ADDR, FPS_START_ADDR);
  seedGraphWindow(mem);
  seedGraphRAM(mem);

  const t5 = callGraphParsTraced(executor, cpu, mem, equ.tokenAddr, -0.001, wrapped, savedFPS, 5000);
  console.log(`  returned=${t5.returnHit} tXHit=${t5.tXHit} errNo=${hex(t5.errNo, 2)} Y=${t5.yVal} steps=${t5.steps}`);
  if (!t5.returnHit) {
    const loops5 = detectLoops(t5.pcTrace, t5.pcFrequency);
    console.log(`  Loop period: ${loops5.period}`);
    if (loops5.loopRange) {
      console.log(`  Loop PC range: ${hex(loops5.loopRange.min)} - ${hex(loops5.loopRange.max)}`);
    }
  }
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════

  console.log('=== SUMMARY ===');
  console.log(`Test 1 (X=+1):     returned=${t1.returnHit} Y=${t1.yVal} steps=${t1.steps}`);
  console.log(`Test 2 (X=-1):     returned=${t2.returnHit} Y=${t2.yVal} steps=${t2.steps}`);
  console.log(`Test 3 (X=-1 alt): returned=${t3.returnHit} Y=${t3.yVal} steps=${t3.steps}`);
  console.log(`Test 4 (X=-1 10K): returned=${t4.returnHit} Y=${t4.yVal} steps=${t4.steps}`);
  console.log(`Test 5 (X=-0.001): returned=${t5.returnHit} Y=${t5.yVal} steps=${t5.steps}`);
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
