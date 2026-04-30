#!/usr/bin/env node

/**
 * Phase 160 - Normalization 0x07CA48 with gcd-relevant inputs.
 *
 * Tests four inputs to understand what happens when gcd values (with and
 * without the +2 exponent bump) enter normalization:
 *
 *   Part A: OP1 = 12.0  (exp=0x81, mantissa=[12 00 00 00 00 00 00])
 *   Part B: OP1 =  8.0  (exp=0x80, mantissa=[80 00 00 00 00 00 00])
 *   Part C: OP1 = 1200  (exp=0x83, mantissa=[12 00 00 00 00 00 00])  — actual gcd input after +2 bump
 *   Part D: OP1 =  1.0  (exp=0x80, mantissa=[10 00 00 00 00 00 00])  — session 158 reference
 *
 * For each test logs: input bytes, steps, output bytes, Shl14 hit count,
 * exponent transition, and key block events.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// --- Gunzip transpiled JS if needed ---

const ROM_TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const ROM_TRANSPILED_GZ   = path.join(__dirname, 'ROM.transpiled.js.gz');
const ROM_BIN_PATH        = path.join(__dirname, 'ROM.rom');

if (!existsSync(ROM_TRANSPILED_PATH)) {
  if (!existsSync(ROM_TRANSPILED_GZ)) {
    throw new Error(`Neither ROM.transpiled.js nor ROM.transpiled.js.gz found in ${__dirname}`);
  }
  console.log('ROM.transpiled.js not found — gunzipping from .gz …');
  execSync(`cd "${__dirname}" && gzip -dk ROM.transpiled.js.gz`);
  console.log('Gunzip done.');
}

if (!existsSync(ROM_BIN_PATH)) {
  throw new Error(`ROM binary not found: ${ROM_BIN_PATH}`);
}

const romBytes  = readFileSync(ROM_BIN_PATH);
const romModule = await import(pathToFileURL(ROM_TRANSPILED_PATH).href);
const BLOCKS    = romModule.PRELIFTED_BLOCKS ?? romModule.blocks;

if (!BLOCKS) {
  throw new Error('Unable to locate PRELIFTED_BLOCKS in ROM.transpiled.js');
}

// --- Constants ---

const MEM_SIZE         = 0x1000000;
const BOOT_ENTRY       = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY  = 0x0802b2;
const STACK_RESET_TOP  = 0xd1a87e;

const MEMINIT_ENTRY    = 0x09dee0;
const MEMINIT_RET      = 0x7ffff6;
const FAKE_RET         = 0x7ffffe;
const ERR_CATCH_ADDR   = 0x7ffffa;

const USERMEM_ADDR     = 0xd1a881;
const EMPTY_VAT_ADDR   = 0xd3ffff;
const FPS_CLEAN_AREA   = 0xd1aa00;

const OP1_ADDR         = 0xd005f8;   // 9 bytes
const OP2_ADDR         = 0xd00603;   // 9 bytes
const FP_CATEGORY_ADDR = 0xd0060e;
const ERR_NO_ADDR      = 0xd008df;
const ERR_SP_ADDR      = 0xd008e0;

const FPSBASE_ADDR     = 0xd0258a;
const FPS_ADDR         = 0xd0258d;
const OPBASE_ADDR      = 0xd02590;
const OPS_ADDR         = 0xd02593;
const PTEMPCNT_ADDR    = 0xd02596;
const PTEMP_ADDR       = 0xd0259a;
const PROGPTR_ADDR     = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const NORM_ENTRY       = 0x07ca48;   // normalization function
const SHL14_ADDR       = 0x07fb33;   // Shl14 — mantissa left-shift
const DEC_EXP_ADDR     = 0x07fdf1;   // exponent decrement
const LOOP_EXIT_ADDR   = 0x07c9af;   // LoopExit
const BIG_SHIFT_ADDR   = 0x07fac2;   // BigShift — exponent reset

const MEMINIT_BUDGET   = 100000;
const MAX_LOOP_ITER    = 8192;
const MAX_STEPS        = 500;

// --- Helpers ---

const hexByte = (v) => (v & 0xff).toString(16).toUpperCase().padStart(2, '0');
const hex24   = (v) => `0x${(v >>> 0).toString(16).toUpperCase().padStart(6, '0')}`;

function write24(mem, addr, value) {
  mem[addr]     =  value        & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

function readBytes(mem, addr, len) {
  return Array.from(mem.subarray(addr, addr + len), (b) => b & 0xff);
}

function formatBytes(bytes) {
  return bytes.map(hexByte).join(' ');
}

function errName(code) {
  if (code === 0x00) return 'none';
  if (code === 0x80) return 'E_Edit';
  if (code === 0x81) return 'E_Overflow';
  if (code === 0x84) return 'E_Domain';
  if (code === 0x88) return 'E_Syntax';
  if (code === 0x8d) return 'E_Undefined';
  return `unknown(${hexByte(code)})`;
}

// --- Runtime setup ---

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

  cpu.halted = false;
  cpu.iff1   = 0;
  cpu.iff2   = 0;
  cpu.sp     = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase  = 0xd0;
  cpu._iy    = 0xd00080;
  cpu._hl    = 0;
  cpu.halted = false;
  cpu.iff1   = 0;
  cpu.iff2   = 0;
  cpu.sp     = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
}

function prepareCallState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1   = 0;
  cpu.iff2   = 0;
  cpu.madl   = 1;
  cpu.mbase  = 0xd0;
  cpu._iy    = 0xd00080;
  cpu.f      = 0x40;
  cpu._ix    = 0xd1a860;
  cpu.sp     = STACK_RESET_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
}

function seedErrFrame(cpu, mem, ret, errRet = ERR_CATCH_ADDR, prev = 0) {
  cpu.sp -= 3;
  write24(mem, cpu.sp, ret);
  const base = (cpu.sp - 6) & 0xffffff;
  write24(mem, base,     errRet);
  write24(mem, base + 3, prev);
  write24(mem, ERR_SP_ADDR, base);
  mem[ERR_NO_ADDR] = 0x00;
}

function seedAllocator(mem) {
  write24(mem, OPBASE_ADDR,      EMPTY_VAT_ADDR);
  write24(mem, OPS_ADDR,         EMPTY_VAT_ADDR);
  mem.fill(0x00, PTEMPCNT_ADDR, PTEMPCNT_ADDR + 4);
  write24(mem, PTEMP_ADDR,       EMPTY_VAT_ADDR);
  write24(mem, PROGPTR_ADDR,     EMPTY_VAT_ADDR);
  write24(mem, FPSBASE_ADDR,     USERMEM_ADDR);
  write24(mem, FPS_ADDR,         USERMEM_ADDR);
  write24(mem, NEWDATA_PTR_ADDR, USERMEM_ADDR);
}

function seedRegister(mem, addr, bytes) {
  mem.fill(0x00, addr, addr + 11);
  mem.set(bytes, addr);
}

function runMemInit(executor, cpu, mem) {
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);

  let ok = false;

  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: MEMINIT_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__');
      },
      onMissingBlock(pc) {
        if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__');
      },
    });
  } catch (err) {
    if (err?.message === '__RET__') ok = true;
    else throw err;
  }

  return ok;
}

// --- Single test runner ---

function runTest(runtime, label, op1Bytes, op2Bytes) {
  const { mem, executor, cpu } = runtime;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`${label}`);
  console.log(`${'='.repeat(70)}`);

  // Reset call state each test
  prepareCallState(cpu, mem);
  seedAllocator(mem);
  mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 0x40);
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  write24(mem, FPS_ADDR,     FPS_CLEAN_AREA);

  seedRegister(mem, OP1_ADDR, op1Bytes);
  seedRegister(mem, OP2_ADDR, op2Bytes);
  mem[FP_CATEGORY_ADDR] = 0x00;

  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  const initOp1 = readBytes(mem, OP1_ADDR, 9);
  const initOp2 = readBytes(mem, OP2_ADDR, 9);
  const initExp = initOp1[1];

  console.log(`  Input  OP1: [${formatBytes(initOp1)}]  exp=0x${hexByte(initExp)}`);
  console.log(`  Input  OP2: [${formatBytes(initOp2)}]  exp=0x${hexByte(initOp2[1])}`);

  let stepCount      = 0;
  let shl14Hits      = 0;
  let decExpHits     = 0;
  let loopExitHits   = 0;
  let bigShiftHits   = 0;
  let outcome        = 'budget';
  let lastMissing    = null;

  const events = [];

  try {
    executor.runFrom(NORM_ENTRY, 'adl', {
      maxSteps:          MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,

      onBlock(pc, mode, meta, step) {
        const addr = pc & 0xffffff;
        if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
        else stepCount++;

        if (addr === SHL14_ADDR) {
          shl14Hits++;
          events.push(`step ${stepCount}: Shl14      exp=0x${hexByte(mem[OP1_ADDR + 1])}`);
        }
        if (addr === DEC_EXP_ADDR) {
          decExpHits++;
          events.push(`step ${stepCount}: DecExp     exp=0x${hexByte(mem[OP1_ADDR + 1])}`);
        }
        if (addr === LOOP_EXIT_ADDR) {
          loopExitHits++;
          events.push(`step ${stepCount}: LoopExit   exp=0x${hexByte(mem[OP1_ADDR + 1])}`);
        }
        if (addr === BIG_SHIFT_ADDR) {
          bigShiftHits++;
          events.push(`step ${stepCount}: BigShift   exp=0x${hexByte(mem[OP1_ADDR + 1])}`);
        }

        if (addr === FAKE_RET)      throw new Error('__RET__');
        if (addr === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },

      onMissingBlock(pc, mode, step) {
        const addr = pc & 0xffffff;
        if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
        else stepCount++;
        lastMissing = addr;

        if (addr === FAKE_RET)       throw new Error('__RET__');
        if (addr === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
    });
  } catch (err) {
    if      (err?.message === '__RET__') outcome = 'return';
    else if (err?.message === '__ERR__') outcome = 'error';
    else { outcome = 'threw'; console.error(err?.stack || String(err)); }
  }

  const finalOp1    = readBytes(mem, OP1_ADDR, 9);
  const finalOp2    = readBytes(mem, OP2_ADDR, 9);
  const finalExp    = finalOp1[1];
  const mantNonZero = finalOp1.slice(2).some((b) => b !== 0);
  const errCode     = mem[ERR_NO_ADDR] & 0xff;

  console.log(`  Output OP1: [${formatBytes(finalOp1)}]  exp=0x${hexByte(finalExp)}`);
  console.log(`  Output OP2: [${formatBytes(finalOp2)}]  exp=0x${hexByte(finalOp2[1])}`);
  console.log(`  Outcome: ${outcome}  steps: ${stepCount}`);
  console.log(`  Shl14 hits: ${shl14Hits}  DecExp hits: ${decExpHits}  LoopExit hits: ${loopExitHits}  BigShift hits: ${bigShiftHits}`);
  console.log(`  Exp transition: 0x${hexByte(initExp)} → 0x${hexByte(finalExp)}`);
  console.log(`  Mantissa non-zero: ${mantNonZero}`);
  console.log(`  errNo: 0x${hexByte(errCode)} (${errName(errCode)})`);

  if (lastMissing !== null) {
    console.log(`  Last missing block: ${hex24(lastMissing)}`);
  }

  if (events.length > 0) {
    console.log('  Event log:');
    for (const ev of events) {
      console.log(`    ${ev}`);
    }
  }

  return { shl14Hits, decExpHits, loopExitHits, bigShiftHits, outcome, stepCount,
           initExp, finalExp, mantNonZero, errCode };
}

// --- Main ---

async function main() {
  console.log('=== Phase 160: 0x07CA48 Normalization with gcd-relevant inputs ===');
  console.log('');

  const runtime = createRuntime();
  coldBoot(runtime.executor, runtime.cpu, runtime.mem);

  const memInitOk = runMemInit(runtime.executor, runtime.cpu, runtime.mem);
  if (!memInitOk) {
    console.error('MEM_INIT did not return cleanly. Aborting.');
    process.exitCode = 1;
    return;
  }
  console.log('Cold boot + MEM_INIT complete.');

  // Part A: 12.0 — exp=0x81, what gcd feeds WITHOUT +2 bump
  const partA = runTest(
    runtime,
    'Part A: OP1 = 12.0 (exp=0x81, mantissa=[12 00 ...]) — gcd input without bump',
    Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  );

  // Part B: 8.0 — exp=0x80, mantissa=[80 00 ...]
  const partB = runTest(
    runtime,
    'Part B: OP1 =  8.0 (exp=0x80, mantissa=[80 00 ...]) — gcd input without bump',
    Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  );

  // Part C: 1200 — exp=0x83, ACTUAL gcd input after +2 exponent bump
  const partC = runTest(
    runtime,
    'Part C: OP1 = 1200  (exp=0x83, mantissa=[12 00 ...]) — ACTUAL gcd input after +2 bump',
    Uint8Array.from([0x00, 0x83, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    Uint8Array.from([0x00, 0x83, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  );

  // Part D: 1.0 — session 158 reference case
  const partD = runTest(
    runtime,
    'Part D: OP1 =  1.0  (exp=0x80, mantissa=[10 00 ...]) — session 158 reference',
    Uint8Array.from([0x00, 0x80, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    Uint8Array.from([0x00, 0x80, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  );

  // --- Summary ---
  console.log(`\n${'='.repeat(70)}`);
  console.log('=== SUMMARY ===');
  console.log(`${'='.repeat(70)}`);

  const parts = [
    { label: 'A  12.0  (exp=0x81)', r: partA },
    { label: 'B   8.0  (exp=0x80)', r: partB },
    { label: 'C  1200  (exp=0x83)', r: partC },
    { label: 'D   1.0  (exp=0x80)', r: partD },
  ];

  for (const { label, r } of parts) {
    console.log(
      `  Part ${label}` +
      `  Shl14=${r.shl14Hits}` +
      `  exp: 0x${hexByte(r.initExp)} → 0x${hexByte(r.finalExp)}` +
      `  mant_ok=${r.mantNonZero}` +
      `  outcome=${r.outcome}` +
      `  err=${errName(r.errCode)}`,
    );
  }

  console.log('');
  console.log('=== Analysis ===');
  console.log('Q: Does exp=0x81 (12.0 without bump) get over-shifted like exp=0x83?');
  const aOk = partA.mantNonZero;
  console.log(`   Part A mantissa non-zero after norm: ${aOk} (Shl14=${partA.shl14Hits})`);

  console.log('Q: Does exp=0x80 (8.0) survive normalization with mantissa intact?');
  const bOk = partB.mantNonZero;
  console.log(`   Part B mantissa non-zero after norm: ${bOk} (Shl14=${partB.shl14Hits})`);

  console.log('Q: Does 1200 (exp=0x83) reproduce the known mantissa destruction?');
  const cOk = !partC.mantNonZero;
  console.log(`   Part C mantissa destroyed: ${cOk} (Shl14=${partC.shl14Hits})`);

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
});
