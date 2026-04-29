#!/usr/bin/env node

/**
 * Phase 142 — OneVar Full Entry (0x0A9319)
 *
 * Session 141 found the root cause of minX/maxX = 0:
 *   Entry 0x0A9325 does SET 5,(IY+9) which makes the min/max routine
 *   at 0x0AA6FA return immediately (BIT 5,(IY+9); RET NZ).
 *
 * The FULL entry at 0x0A9319 does RES 5,(IY+9) first, enabling min/max.
 *
 * Expected results for L1=[10,20,30,40,50]:
 *   n=5, xMean=30, sumX=150, sumX2=5500,
 *   Sx~15.81, sigmaX~14.14, minX=10, maxX=50
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal, writeReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

// ── Constants ─────────────────────────────────────────────────────────────

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_ENTRY = 0x09dee0;
const MEMINIT_RET = 0x7ffff6;

const ONEVAR_ENTRY = 0x0a9319;   // FULL entry (was 0x0A9325)
const ONEVAR_RET = 0x7fffee;

const OP1_ADDR = 0xd005f8;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

const USERMEM_ADDR = 0xd1a881;
const EMPTY_VAT_ADDR = 0xd3ffff;

const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const STAT_VARS_BASE = 0xd0117f;
const STAT_FLAGS_ADDR = 0xd00089;
const STATS_VALID_BIT = 0x40;
const STAT_FLAGS2_ADDR = 0xd0009a; // IY+26 = 0xD00080 + 0x1A
const STAT_MODE_ADDR = 0xd01190;   // stat mode byte — zero before calling

const ERR_CATCH_ADDR = 0x7ffffa;
const MAX_LOOP_ITER = 8192;

// ── Stat variable definitions ─────────────────────────────────────────────

const STAT_TOKENS = [
  { name: 'n',      token: 0x02, addr: 0xd01191, expected: 5.0,    tol: 0.01 },
  { name: 'xMean',  token: 0x03, addr: 0xd0119a, expected: 30.0,   tol: 0.01 },
  { name: 'sumX',   token: 0x04, addr: 0xd011a3, expected: 150.0,  tol: 0.01 },
  { name: 'sumX2',  token: 0x05, addr: 0xd011ac, expected: 5500.0, tol: 0.01 },
  { name: 'Sx',     token: 0x06, addr: 0xd011b5, expected: 15.81,  tol: 0.01 },
  { name: 'sigmaX', token: 0x07, addr: 0xd011be, expected: 14.14,  tol: 0.01 },
  { name: 'minX',   token: 0x08, addr: 0xd011c7, expected: 10.0,   tol: 0.01 },
  { name: 'maxX',   token: 0x09, addr: 0xd011d0, expected: 50.0,   tol: 0.01 },
];

// ── List data ─────────────────────────────────────────────────────────────

const L1_OP1 = Uint8Array.from([0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const BCD_VALUES = [
  Uint8Array.from([0x00, 0x81, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),  // 10
  Uint8Array.from([0x00, 0x81, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),  // 20
  Uint8Array.from([0x00, 0x81, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),  // 30
  Uint8Array.from([0x00, 0x81, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),  // 40
  Uint8Array.from([0x00, 0x81, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),  // 50
];

const LIST_ELEM_COUNT = 5;
const LIST_DATA_SIZE = 2 + LIST_ELEM_COUNT * 9;

// ── Utilities ─────────────────────────────────────────────────────────────

const hex = (v, w = 6) =>
  v === undefined || v === null
    ? 'n/a'
    : `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;

const read24 = (m, a) =>
  ((m[a] & 0xff) | ((m[a + 1] & 0xff) << 8) | ((m[a + 2] & 0xff) << 16)) >>> 0;

function write24(m, a, v) {
  m[a] = v & 0xff;
  m[a + 1] = (v >>> 8) & 0xff;
  m[a + 2] = (v >>> 16) & 0xff;
}

function write16(m, a, v) {
  m[a] = v & 0xff;
  m[a + 1] = (v >>> 8) & 0xff;
}

function hexBytes(m, a, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push((m[a + i] & 0xff).toString(16).toUpperCase().padStart(2, '0'));
  return out.join(' ');
}

function errName(code) {
  const names = {
    0x00: 'none',
    0x81: 'E_Overflow',
    0x82: 'E_DivBy0',
    0x83: 'E_SingularMat',
    0x84: 'E_Domain',
    0x85: 'E_Increment',
    0x86: 'E_Break',
    0x87: 'E_NonReal',
    0x88: 'E_Syntax',
    0x89: 'E_DataType',
    0x8a: 'E_JError',
    0x8b: 'E_Argument',
    0x8c: 'E_DimMismatch',
    0x8d: 'E_Undefined',
    0x8e: 'E_Memory',
    0x8f: 'E_Halted',
  };
  return names[code] || `unknown(${hex(code, 2)})`;
}

const memWrap = (m) => ({
  write8(a, v) { m[a] = v & 0xff; },
  read8(a) { return m[a] & 0xff; },
});

function safeReadReal(m, a) {
  try { return readReal(memWrap(m), a); }
  catch (e) { return `error: ${e?.message ?? e}`; }
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

function seedErrFrame(cpu, mem, ret) {
  cpu.sp -= 3;
  write24(mem, cpu.sp, ret);
  const base = (cpu.sp - 6) & 0xffffff;
  write24(mem, base, ERR_CATCH_ADDR);
  write24(mem, base + 3, 0);
  write24(mem, ERR_SP_ADDR, base);
  mem[ERR_NO_ADDR] = 0x00;
  return base;
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

function runMemInit(executor, cpu, mem) {
  prepareCallState(cpu, mem);
  seedAllocator(mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  let ok = false;
  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
      onMissingBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
    });
  } catch (e) {
    if (e?.message === '__RET__') ok = true; else throw e;
  }
  return ok;
}

function writeVATEntry(mem, topAddr, typeByte, dataPtr, name1, name2 = 0x00, name3 = 0x00) {
  mem[topAddr]     = typeByte;
  mem[topAddr - 1] = 0x00;
  mem[topAddr - 2] = 0x00;
  mem[topAddr - 3] = dataPtr & 0xff;
  mem[topAddr - 4] = (dataPtr >> 8) & 0xff;
  mem[topAddr - 5] = (dataPtr >> 16) & 0xff;
  mem[topAddr - 6] = name1;
  mem[topAddr - 7] = name2;
  mem[topAddr - 8] = name3;

  const newProgPtr = topAddr - 9;
  write24(mem, PROGPTR_ADDR, newProgPtr);
  return newProgPtr;
}

function outcome(run) {
  if (run.returnHit) return 'returned';
  if (run.errCaught) return `error caught (errNo=${hex(run.errNo, 2)} ${errName(run.errNo)})`;
  return `stalled (finalPc=${hex(run.finalPc)})`;
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 142: OneVar Full Entry (0x0A9319) — All 8 Stats ===');
  console.log('');

  const { mem, executor, cpu } = createRuntime();
  console.log('Cold-booting OS...');
  coldBoot(executor, cpu, mem);
  console.log('Cold boot complete.');
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // Setup: MEM_INIT + L1 + stat vars + flags
  // ═══════════════════════════════════════════════════════════════════════════

  if (!runMemInit(executor, cpu, mem)) {
    console.log('ABORT: MEM_INIT failed'); process.exitCode = 1; return;
  }
  console.log('  MEM_INIT: OK');

  // Separate FPS area from list data
  const FPS_BASE = USERMEM_ADDR;
  const LIST_DATA_ADDR = USERMEM_ADDR + 0x100;

  write24(mem, FPSBASE_ADDR, FPS_BASE);
  write24(mem, FPS_ADDR, FPS_BASE);

  // L1 data
  write16(mem, LIST_DATA_ADDR, LIST_ELEM_COUNT);
  for (let i = 0; i < BCD_VALUES.length; i++) {
    mem.set(BCD_VALUES[i], LIST_DATA_ADDR + 2 + i * 9);
  }
  write24(mem, NEWDATA_PTR_ADDR, LIST_DATA_ADDR + LIST_DATA_SIZE);

  // L1 VAT entry
  const pp = read24(mem, PROGPTR_ADDR);
  const ppNew = writeVATEntry(mem, pp, 0x01, LIST_DATA_ADDR, 0x01);
  write24(mem, OPS_ADDR, ppNew);

  // Pre-seed stat var RAM (0x0E prefix like ZeroStatVars)
  for (let t = 0; t < 64; t++) {
    const addr = STAT_VARS_BASE + t * 9;
    mem[addr] = 0x0e;
    mem[addr + 1] = 0x80;
    for (let j = 2; j < 9; j++) mem[addr + j] = 0x00;
  }
  // Stat answer region
  mem.fill(0xff, 0xd01485, 0xd014ea);

  // Set flags
  mem[STAT_FLAGS_ADDR] |= STATS_VALID_BIT;
  mem[STAT_FLAGS2_ADDR] |= 0x04; // skip ZeroStatVars

  // Zero stat mode byte (0xD01190)
  mem[STAT_MODE_ADDR] = 0x00;

  // OP1 = L1
  mem.set(L1_OP1, OP1_ADDR);
  prepareCallState(cpu, mem);
  seedErrFrame(cpu, mem, ONEVAR_RET);
  mem[ERR_NO_ADDR] = 0x00;
  mem.set(L1_OP1, OP1_ADDR);

  // A=1 for single-list mode
  cpu.a = 0x01;

  // Push L1 OP1 onto FP stack
  {
    const fpsPtr = read24(mem, FPS_ADDR);
    mem.set(L1_OP1, fpsPtr);
    write24(mem, FPS_ADDR, fpsPtr + 9);
    console.log(`  FPS: pushed L1 OP1 at ${hex(fpsPtr)}, FPS now ${hex(fpsPtr + 9)}`);
  }

  console.log(`  List data at ${hex(LIST_DATA_ADDR)}`);
  console.log(`  Entry point: ${hex(ONEVAR_ENTRY)} (full entry, clears bit 5 of statFlags)`);
  console.log(`  Stat mode byte (0xD01190): ${hex(mem[STAT_MODE_ADDR], 2)}`);
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // Run OneVar (200K steps)
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('='.repeat(72));
  console.log('  Running OneVar from 0x0A9319 (200K step budget)');
  console.log('='.repeat(72));
  console.log('');

  let finalPc = null;
  let returnHit = false;
  let errCaught = false;
  let stepCount = 0;
  const recentPcs = [];
  const missingBlocks = new Map();
  const BUDGET = 200000;

  try {
    executor.runFrom(ONEVAR_ENTRY, 'adl', {
      maxSteps: BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _m, _meta, step) {
        const norm = pc & 0xffffff;
        finalPc = norm;
        if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
        recentPcs.push(norm);
        if (recentPcs.length > 1000) recentPcs.shift();
        if (norm === ONEVAR_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, _m, step) {
        const norm = pc & 0xffffff;
        finalPc = norm;
        if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
        recentPcs.push(norm);
        if (recentPcs.length > 1000) recentPcs.shift();
        missingBlocks.set(norm, (missingBlocks.get(norm) || 0) + 1);
        if (norm === ONEVAR_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
    });
  } catch (e) {
    if (e?.message === '__RET__') { returnHit = true; finalPc = ONEVAR_RET; }
    else if (e?.message === '__ERR__') { errCaught = true; finalPc = ERR_CATCH_ADDR; }
    else throw e;
  }

  const errNo = mem[ERR_NO_ADDR] & 0xff;

  console.log(`  Outcome: ${outcome({ returnHit, errCaught, finalPc, errNo })}`);
  console.log(`  Steps: ${stepCount} / ${BUDGET}`);
  console.log(`  errNo: ${hex(errNo, 2)} (${errName(errNo)})`);
  console.log(`  Final PC: ${hex(finalPc)}`);
  console.log('');

  if (missingBlocks.size > 0) {
    const filt = [...missingBlocks.entries()].filter(([a]) => a !== ONEVAR_RET && a !== ERR_CATCH_ADDR);
    if (filt.length > 0) {
      console.log(`  Missing blocks: ${filt.map(([a, c]) => `${hex(a)}(${c}x)`).join(', ')}`);
      console.log('');
    }
  }

  if (!returnHit) {
    const last30 = recentPcs.slice(-30);
    console.log(`  Last 30 PCs: ${last30.map(p => hex(p)).join(' ')}`);
    console.log('');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Stat variable results
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('='.repeat(72));
  console.log('  STAT VARIABLE RESULTS');
  console.log('='.repeat(72));
  console.log('');

  let passCount = 0;
  let failCount = 0;

  for (const s of STAT_TOKENS) {
    const slotAddr = STAT_VARS_BASE + s.token * 9;
    const val = safeReadReal(mem, slotAddr);
    const rawHex = hexBytes(mem, slotAddr, 9);

    let pass = false;
    if (typeof val === 'number' && Math.abs(val - s.expected) <= s.tol) {
      pass = true;
      passCount++;
    } else {
      failCount++;
    }

    const tag = pass ? 'PASS' : 'FAIL';
    console.log(`  ${tag}  ${s.name.padEnd(8)} = ${val}  (expected ${s.expected})`);
    console.log(`         slot=${hex(slotAddr)}  bytes=[${rawHex}]`);
  }

  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('='.repeat(72));
  console.log('  SUMMARY');
  console.log('='.repeat(72));
  console.log('');
  console.log(`  Entry point: ${hex(ONEVAR_ENTRY)} (full entry)`);
  console.log(`  errNo: ${hex(errNo, 2)} (${errName(errNo)})`);
  console.log(`  Steps: ${stepCount} / ${BUDGET}`);
  console.log(`  PASS: ${passCount}/8`);
  console.log(`  FAIL: ${failCount}/8`);
  console.log('');

  if (passCount === 8 && errNo === 0x00) {
    console.log('  *** ALL 8 STAT VARIABLES CORRECT — OneVar 8/8 ***');
  } else {
    if (errNo !== 0x00) {
      console.log(`  ERROR: OneVar raised ${errName(errNo)}`);
    }
    if (failCount > 0) {
      console.log(`  ${failCount} stat variable(s) did not match expected values.`);
    }
  }

  console.log('');
  console.log('=== Phase 142 probe complete ===');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
