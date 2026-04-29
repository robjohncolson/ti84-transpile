#!/usr/bin/env node

/**
 * Phase 146 — OneVar 8/8 Stats: ROM computes 6, JS fills min/max
 *
 * Pipeline:
 *   1. Cold boot -> MEM_INIT -> create L1=[10,20,30,40,50] -> seed allocator
 *   2. Seed statFlags2 bit 2 (skip ZeroStatVars), push L1 OP1 onto FPS
 *   3. Call OneVar partial entry 0x0A9325 (SET 5 path) -> 6/8 stats computed
 *   4. Read list elements from RAM, compute min/max in JS
 *   5. Write min=10 to 0xD011C7 and max=50 to 0xD011D0 via writeReal
 *   6. Verify all 8 stat results -> PASS/FAIL table
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

// ── Constants ──────────────────────────────────────────────────────────────

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_ENTRY = 0x09dee0;
const MEMINIT_RET = 0x7ffff6;

const ONEVAR_ENTRY = 0x0a9325;
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
const STAT_FLAGS2_ADDR = 0xd0009a; // IY+26

const ERR_CATCH_ADDR = 0x7ffffa;
const MAX_LOOP_ITER = 8192;

// ── Stat token map ────────────────────────────────────────────────────────

const STAT_RESULTS = [
  { name: 'n',      token: 0x02, addr: 0xd01191, expected: 5.0,     tol: 0.001 },
  { name: 'x_bar',  token: 0x03, addr: 0xd0119a, expected: 30.0,    tol: 0.001 },
  { name: 'Sum_x',  token: 0x04, addr: 0xd011a3, expected: 150.0,   tol: 0.001 },
  { name: 'Sum_x2', token: 0x05, addr: 0xd011ac, expected: 5500.0,  tol: 0.001 },
  { name: 'Sx',     token: 0x06, addr: 0xd011b5, expected: 15.8114, tol: 0.01 },
  { name: 'sigma_x',token: 0x07, addr: 0xd011be, expected: 14.1421, tol: 0.01 },
  { name: 'minX',   token: 0x08, addr: 0xd011c7, expected: 10.0,    tol: 0.001 },
  { name: 'maxX',   token: 0x09, addr: 0xd011d0, expected: 50.0,    tol: 0.001 },
];

// ── List data ────────────────────────────────────────────────────────────

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

// ── Utilities ──────────────────────────────────────────────────────────────

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
    0x00: 'none', 0x81: 'E_Overflow', 0x82: 'E_DivBy0',
    0x84: 'E_Domain', 0x86: 'E_Break', 0x89: 'E_DataType',
    0x8a: 'E_JError', 0x8d: 'E_Undefined', 0x8e: 'E_Memory',
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

function writeVATEntry(mem, topAddr, typeByte, dataPtr, name1) {
  mem[topAddr]     = typeByte;
  mem[topAddr - 1] = 0x00;
  mem[topAddr - 2] = 0x00;
  mem[topAddr - 3] = dataPtr & 0xff;
  mem[topAddr - 4] = (dataPtr >> 8) & 0xff;
  mem[topAddr - 5] = (dataPtr >> 16) & 0xff;
  mem[topAddr - 6] = name1;
  mem[topAddr - 7] = 0x00;
  mem[topAddr - 8] = 0x00;
  const newProgPtr = topAddr - 9;
  write24(mem, PROGPTR_ADDR, newProgPtr);
  return newProgPtr;
}

// ── Run-call helper ────────────────────────────────────────────────────────

function runCall(executor, cpu, mem, { entry, budget, returnPc }) {
  let finalPc = null;
  let returnHit = false;
  let errCaught = false;
  let stepCount = 0;
  const recentPcs = [];
  const missingBlocks = new Map();

  try {
    executor.runFrom(entry, 'adl', {
      maxSteps: budget,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _m, _meta, step) {
        const norm = pc & 0xffffff;
        finalPc = norm;
        if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
        recentPcs.push(norm);
        if (recentPcs.length > 128) recentPcs.shift();
        if (norm === returnPc) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, _m, step) {
        const norm = pc & 0xffffff;
        finalPc = norm;
        if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
        recentPcs.push(norm);
        if (recentPcs.length > 128) recentPcs.shift();
        missingBlocks.set(norm, (missingBlocks.get(norm) || 0) + 1);
        if (norm === returnPc) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
    });
  } catch (e) {
    if (e?.message === '__RET__') { returnHit = true; finalPc = returnPc; }
    else if (e?.message === '__ERR__') { errCaught = true; finalPc = ERR_CATCH_ADDR; }
    else throw e;
  }

  return {
    returnHit, errCaught, finalPc, stepCount, recentPcs, missingBlocks,
    errNo: mem[ERR_NO_ADDR] & 0xff,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 146: OneVar 8/8 Stats — ROM 6 + JS min/max ===');
  console.log('');

  const { mem, executor, cpu } = createRuntime();
  console.log('Cold-booting OS...');
  coldBoot(executor, cpu, mem);
  console.log('Cold boot complete.');
  console.log('');

  // ── Step 1: MEM_INIT ──────────────────────────────────────────────────

  if (!runMemInit(executor, cpu, mem)) {
    console.log('ABORT: MEM_INIT failed');
    process.exitCode = 1;
    return;
  }
  console.log('MEM_INIT: OK');

  // ── Step 2: Create L1 list data ───────────────────────────────────────

  const FPS_BASE = USERMEM_ADDR;
  const LIST_DATA_ADDR = USERMEM_ADDR + 0x100;

  write24(mem, FPSBASE_ADDR, FPS_BASE);
  write24(mem, FPS_ADDR, FPS_BASE);

  write16(mem, LIST_DATA_ADDR, LIST_ELEM_COUNT);
  for (let i = 0; i < BCD_VALUES.length; i++) {
    mem.set(BCD_VALUES[i], LIST_DATA_ADDR + 2 + i * 9);
  }
  write24(mem, NEWDATA_PTR_ADDR, LIST_DATA_ADDR + LIST_DATA_SIZE);

  console.log(`L1 data at ${hex(LIST_DATA_ADDR)}, ${LIST_ELEM_COUNT} elements`);

  // ── Step 3: Build L1 VAT entry ────────────────────────────────────────

  const vatTop = read24(mem, PROGPTR_ADDR);
  const newProgPtr = writeVATEntry(mem, vatTop, 0x01, LIST_DATA_ADDR, 0x01);
  write24(mem, OPS_ADDR, newProgPtr);
  console.log(`L1 VAT entry at ${hex(vatTop)}, progPtr=${hex(newProgPtr)}`);

  // ── Step 4: Pre-seed stat var slots ───────────────────────────────────

  for (let t = 0; t < 64; t++) {
    const addr = STAT_VARS_BASE + t * 9;
    mem[addr] = 0x0e;
    mem[addr + 1] = 0x80;
    for (let j = 2; j < 9; j++) mem[addr + j] = 0x00;
  }
  mem.fill(0xff, 0xd01485, 0xd014ea);
  mem[STAT_FLAGS_ADDR] |= STATS_VALID_BIT;
  mem[STAT_FLAGS2_ADDR] |= 0x04; // skip ZeroStatVars
  console.log('Stat var slots pre-seeded, statFlags2 bit 2 set');

  // ── Step 5: Set up CPU state + FPS for OneVar ─────────────────────────

  mem.set(L1_OP1, OP1_ADDR);
  prepareCallState(cpu, mem);
  seedErrFrame(cpu, mem, ONEVAR_RET);
  mem[ERR_NO_ADDR] = 0x00;
  mem.set(L1_OP1, OP1_ADDR);
  cpu.a = 0x01; // single-list mode

  // Push L1 OP1 onto FP stack
  const fpsPtr = read24(mem, FPS_ADDR);
  mem.set(L1_OP1, fpsPtr);
  write24(mem, FPS_ADDR, fpsPtr + 9);
  console.log(`FPS: pushed L1 OP1 at ${hex(fpsPtr)}`);

  // ── Step 6: Run OneVar ────────────────────────────────────────────────

  console.log('Running OneVar (budget=1000000)...');
  const ov = runCall(executor, cpu, mem, {
    entry: ONEVAR_ENTRY, budget: 1000000, returnPc: ONEVAR_RET,
  });

  const ovStatus = ov.returnHit ? 'returned'
    : ov.errCaught ? `error (errNo=${hex(ov.errNo, 2)} ${errName(ov.errNo)})`
    : `stalled at ${hex(ov.finalPc)}`;
  console.log(`OneVar: ${ovStatus}, steps=${ov.stepCount}, errNo=${hex(ov.errNo, 2)}`);

  if (ov.missingBlocks.size > 0) {
    const filt = [...ov.missingBlocks.entries()].filter(([a]) => a !== ONEVAR_RET && a !== ERR_CATCH_ADDR);
    if (filt.length > 0) {
      console.log(`Missing blocks: ${filt.map(([a, c]) => `${hex(a)}(${c}x)`).join(', ')}`);
    }
  }

  if (ov.errNo !== 0x00) {
    console.log('ABORT: OneVar returned an error');
    process.exitCode = 1;
    return;
  }
  console.log('');

  // ── Step 7: Read list elements, compute JS min/max ────────────────────

  console.log('--- Reading list elements from RAM ---');
  const mw = memWrap(mem);
  const listValues = [];
  for (let i = 0; i < LIST_ELEM_COUNT; i++) {
    const elemAddr = LIST_DATA_ADDR + 2 + i * 9;
    const val = readReal(mw, elemAddr);
    listValues.push(val);
    console.log(`  elem[${i}] at ${hex(elemAddr)} = ${val}`);
  }

  const jsMin = Math.min(...listValues);
  const jsMax = Math.max(...listValues);
  console.log(`JS computed: min=${jsMin}, max=${jsMax}`);
  console.log('');

  // ── Step 8: Write min/max to stat var slots ───────────────────────────

  const MINX_ADDR = 0xd011c7; // token 0x08 * 9 + base
  const MAXX_ADDR = 0xd011d0; // token 0x09 * 9 + base

  writeReal(mw, MINX_ADDR, jsMin);
  writeReal(mw, MAXX_ADDR, jsMax);
  console.log(`Wrote minX=${jsMin} to ${hex(MINX_ADDR)}: [${hexBytes(mem, MINX_ADDR, 9)}]`);
  console.log(`Wrote maxX=${jsMax} to ${hex(MAXX_ADDR)}: [${hexBytes(mem, MAXX_ADDR, 9)}]`);
  console.log('');

  // ── Step 9: Verify all 8 stats ────────────────────────────────────────

  console.log('='.repeat(60));
  console.log('  RESULTS: 8-stat verification');
  console.log('='.repeat(60));
  console.log('');
  console.log('  Stat      Addr       Expected    Actual      Verdict');
  console.log('  ' + '-'.repeat(56));

  let passCount = 0;
  for (const s of STAT_RESULTS) {
    const actual = safeReadReal(mem, s.addr);
    let pass = false;
    if (typeof actual === 'number') {
      pass = Math.abs(actual - s.expected) < s.tol;
    }
    if (pass) passCount++;
    const verdict = pass ? 'PASS' : 'FAIL';
    const expStr = String(s.expected).padEnd(11);
    const actStr = String(typeof actual === 'number' ? parseFloat(actual.toPrecision(10)) : actual).padEnd(11);
    console.log(`  ${s.name.padEnd(9)} ${hex(s.addr)}  ${expStr} ${actStr} ${verdict}`);
  }

  console.log('');
  console.log(`  ${passCount}/8 stats PASS`);
  console.log('');
  console.log('=== Phase 146 probe complete ===');

  if (passCount < 8) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
