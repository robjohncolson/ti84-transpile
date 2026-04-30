#!/usr/bin/env node

/**
 * Phase 165 - Standalone test of compound function 0x07C747 and InvSub 0x07C74F
 *
 * 0x07C747 does: OP1→OP2, normalize OP1, negate OP1 sign, FPAdd(OP1+OP2)
 * 0x07C74F does: negate OP1 sign, FPAdd(OP1+OP2) (InvSub = OP2 - OP1)
 *
 * Test cases:
 *   1. OP1=12, OP2=8   (OP1≠OP2)
 *   2. OP1=100, OP2=7
 *   3. OP1=12, OP2=12  (OP1==OP2, should be no-op)
 *   4. OP1=0.5, OP2=3  (sub-1 exponent)
 *   5. InvSub(OP1=12, OP2=8) directly via 0x07C74F
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_BIN_PATH = path.join(__dirname, 'ROM.rom');
const ROM_TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const ROM_TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

if (!fs.existsSync(ROM_BIN_PATH)) {
  throw new Error(`ROM binary not found: ${ROM_BIN_PATH}`);
}

if (!fs.existsSync(ROM_TRANSPILED_PATH)) {
  if (!fs.existsSync(ROM_TRANSPILED_GZ_PATH)) {
    throw new Error('ROM.transpiled.js and ROM.transpiled.js.gz both missing. Run `node scripts/transpile-ti84-rom.mjs` first.');
  }
  console.log('ROM.transpiled.js not found — gunzipping from ROM.transpiled.js.gz ...');
  const { execSync } = await import('node:child_process');
  execSync(`gunzip -kf "${ROM_TRANSPILED_GZ_PATH}"`, { stdio: 'inherit' });
  console.log('Gunzip done.');
}

const romBytes = fs.readFileSync(ROM_BIN_PATH);
const romModule = await import(pathToFileURL(ROM_TRANSPILED_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS ?? romModule.blocks;

if (!BLOCKS) {
  throw new Error('Unable to locate PRELIFTED_BLOCKS in ROM.transpiled.js');
}

// --- Constants ---

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_ENTRY = 0x09dee0;
const MEMINIT_RET = 0x7ffff6;

const USERMEM_ADDR = 0xd1a881;
const EMPTY_VAT_ADDR = 0xd3ffff;

const OP1_ADDR = 0xd005f8;
const OP2_ADDR = 0xd00603;

const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

const FPS_ADDR = 0xd0258d;
const FPSBASE_ADDR = 0xd0258a;
const OPS_ADDR = 0xd02593;
const OPBASE_ADDR = 0xd02590;
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;
const FPS_CLEAN_AREA = 0xd1aa00;

const MEMINIT_BUDGET = 100000;
const MAX_LOOP_ITER = 8192;
const MAX_STEPS = 500;

// Target addresses
const COMPOUND_FUNC = 0x07C747;
const INVSUB_FUNC = 0x07C74F;

// --- Helpers ---

const hex = (value, width = 6) =>
  value === undefined || value === null
    ? 'n/a'
    : `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

const hexByte = (value) =>
  (value & 0xff).toString(16).toUpperCase().padStart(2, '0');

function read24(mem, addr) {
  return ((mem[addr] & 0xff) | ((mem[addr + 1] & 0xff) << 8) | ((mem[addr + 2] & 0xff) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

function readBytes(mem, addr, len) {
  return Array.from(mem.subarray(addr, addr + len), (b) => b & 0xff);
}

function formatBytes(bytes) {
  return bytes.map((b) => hexByte(b)).join(' ');
}

function decodeBcdRealBytes(bytes) {
  const type = bytes[0] & 0xff;
  const exponentByte = bytes[1] & 0xff;
  const digits = [];

  for (let i = 2; i < 9; i++) {
    const byte = bytes[i] & 0xff;
    digits.push((byte >> 4) & 0x0f, byte & 0x0f);
  }

  if (digits.every((d) => d === 0)) return '0';
  if (digits.some((d) => d > 9)) {
    return `invalid-bcd(type=${hexByte(type)},exp=${hexByte(exponentByte)})`;
  }

  const exponent = exponentByte - 0x80;
  const pointIndex = exponent + 1;
  const rawDigits = digits.join('');
  let rendered;

  if (pointIndex <= 0) {
    rendered = `0.${'0'.repeat(-pointIndex)}${rawDigits}`;
  } else if (pointIndex >= rawDigits.length) {
    rendered = rawDigits + '0'.repeat(pointIndex - rawDigits.length);
  } else {
    rendered = `${rawDigits.slice(0, pointIndex)}.${rawDigits.slice(pointIndex)}`;
  }

  rendered = rendered.replace(/^0+(?=\d)/, '');
  rendered = rendered.replace(/(\.\d*?[1-9])0+$/, '$1');
  rendered = rendered.replace(/\.0*$/, '');
  if (rendered.startsWith('.')) rendered = `0${rendered}`;
  if (rendered === '') rendered = '0';
  if ((type & 0x80) !== 0 && rendered !== '0') rendered = `-${rendered}`;

  return rendered;
}

function errName(code) {
  if (code === 0x00) return 'none';
  if (code === 0x80) return 'E_Edit';
  if (code === 0x81) return 'E_Overflow';
  if (code === 0x84) return 'E_Domain';
  if (code === 0x88) return 'E_Syntax';
  if (code === 0x8d) return 'E_Undefined';
  return `unknown(${hex(code, 2)})`;
}

function noteStep(stepCount, step) {
  if (typeof step === 'number') return Math.max(stepCount, step + 1);
  return stepCount + 1;
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
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });

  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
}

function prepareCallState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;
  cpu.f = 0x40;
  cpu._ix = 0xd1a860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
}

function seedErrFrame(cpu, mem, ret, errRet = ERR_CATCH_ADDR, prev = 0) {
  cpu.sp -= 3;
  write24(mem, cpu.sp, ret);
  const base = (cpu.sp - 6) & 0xffffff;
  write24(mem, base, errRet);
  write24(mem, base + 3, prev);
  write24(mem, ERR_SP_ADDR, base);
  mem[ERR_NO_ADDR] = 0x00;
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

function seedRealRegister(mem, addr, bytes) {
  mem.fill(0x00, addr, addr + 11);
  mem.set(bytes, addr);
}

function seedFpState(mem) {
  seedAllocator(mem);
  mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 0x40);
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA);
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

function createPreparedRuntime() {
  const runtime = createRuntime();
  coldBoot(runtime.executor, runtime.cpu, runtime.mem);
  const memInitOk = runMemInit(runtime.executor, runtime.cpu, runtime.mem);
  return { ...runtime, memInitOk };
}

// ==========================================================================
// Test runner: call a target address with given OP1/OP2 and report results
// ==========================================================================

function runTest(label, runtime, targetAddr, op1Bytes, op2Bytes) {
  const { mem, executor, cpu } = runtime;

  console.log(`  --- ${label} ---`);
  console.log(`  Target: ${hex(targetAddr)}`);

  // Reset state for this call
  prepareCallState(cpu, mem);
  seedFpState(mem);

  // Set OP1 and OP2
  seedRealRegister(mem, OP1_ADDR, Uint8Array.from(op1Bytes));
  seedRealRegister(mem, OP2_ADDR, Uint8Array.from(op2Bytes));

  // Set IY
  cpu._iy = 0xd00080;

  // Set FPS pointer
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA);

  // Push return sentinel
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  // Clear errNo
  mem[ERR_NO_ADDR] = 0x00;

  // Set up error frame
  const base = (cpu.sp - 6) & 0xffffff;
  write24(mem, base, ERR_CATCH_ADDR);
  write24(mem, base + 3, 0);
  write24(mem, ERR_SP_ADDR, base);

  const inputOP1 = readBytes(mem, OP1_ADDR, 9);
  const inputOP2 = readBytes(mem, OP2_ADDR, 9);

  console.log(`  Input  OP1: [${formatBytes(inputOP1)}] = ${decodeBcdRealBytes(inputOP1)}`);
  console.log(`  Input  OP2: [${formatBytes(inputOP2)}] = ${decodeBcdRealBytes(inputOP2)}`);

  let stepCount = 0;
  let outcome = 'budget';

  try {
    executor.runFrom(targetAddr, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,

      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },

      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
    });
  } catch (err) {
    if (err?.message === '__RET__') outcome = 'return';
    else if (err?.message === '__ERR__') outcome = 'error';
    else {
      outcome = 'threw';
      console.log(`  Thrown: ${(err?.stack || String(err)).split('\n')[0]}`);
    }
  }

  const outputOP1 = readBytes(mem, OP1_ADDR, 9);
  const outputOP2 = readBytes(mem, OP2_ADDR, 9);
  const errNo = mem[ERR_NO_ADDR] & 0xff;

  console.log(`  Output OP1: [${formatBytes(outputOP1)}] = ${decodeBcdRealBytes(outputOP1)}`);
  console.log(`  Output OP2: [${formatBytes(outputOP2)}] = ${decodeBcdRealBytes(outputOP2)}`);
  console.log(`  Steps: ${stepCount}  Outcome: ${outcome}  errNo: ${hexByte(errNo)} (${errName(errNo)})`);
  console.log('');

  return { label, inputOP1, inputOP2, outputOP1, outputOP2, stepCount, outcome, errNo };
}

// ==========================================================================
// Main
// ==========================================================================

function main() {
  console.log('=== Phase 165: Standalone Test of 0x07C747 (compound) and 0x07C74F (InvSub) ===');
  console.log('');

  const runtime = createPreparedRuntime();

  if (!runtime.memInitOk) {
    console.log('MEM_INIT failed; aborting.');
    process.exitCode = 1;
    return;
  }

  console.log('Cold boot + MEM_INIT complete.');
  console.log('');

  const results = [];

  // Test 1: OP1=12, OP2=8 via 0x07C747
  results.push(runTest(
    'Test 1: 0x07C747 with OP1=12, OP2=8',
    runtime, COMPOUND_FUNC,
    [0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    [0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
  ));

  // Test 2: OP1=100, OP2=7 via 0x07C747
  results.push(runTest(
    'Test 2: 0x07C747 with OP1=100, OP2=7',
    runtime, COMPOUND_FUNC,
    [0x00, 0x82, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    [0x00, 0x80, 0x70, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
  ));

  // Test 3: OP1=12, OP2=12 via 0x07C747 (same values)
  results.push(runTest(
    'Test 3: 0x07C747 with OP1=12, OP2=12 (same)',
    runtime, COMPOUND_FUNC,
    [0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    [0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
  ));

  // Test 4: OP1=0.5, OP2=3 via 0x07C747 (sub-1 exponent)
  results.push(runTest(
    'Test 4: 0x07C747 with OP1=0.5, OP2=3 (sub-1 exp)',
    runtime, COMPOUND_FUNC,
    [0x00, 0x7F, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    [0x00, 0x80, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
  ));

  // Test 5: InvSub(OP1=12, OP2=8) directly via 0x07C74F
  results.push(runTest(
    'Test 5: 0x07C74F (InvSub) with OP1=12, OP2=8',
    runtime, INVSUB_FUNC,
    [0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    [0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
  ));

  // Summary
  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log('');

  for (const r of results) {
    const inOP1 = decodeBcdRealBytes(r.inputOP1);
    const inOP2 = decodeBcdRealBytes(r.inputOP2);
    const outOP1 = decodeBcdRealBytes(r.outputOP1);
    const outOP2 = decodeBcdRealBytes(r.outputOP2);
    console.log(`  ${r.label}`);
    console.log(`    OP1: ${inOP1} -> ${outOP1}`);
    console.log(`    OP2: ${inOP2} -> ${outOP2}`);
    console.log(`    Steps: ${r.stepCount}  Outcome: ${r.outcome}  errNo: ${hexByte(r.errNo)}`);
    console.log('');
  }

  // Analysis
  console.log('ANALYSIS:');
  console.log('');

  // Check if 0x07C747 computes OP1 = OP1 (no-op when same) or something else
  const t1 = results[0];
  const t3 = results[2];
  const t5 = results[4];

  console.log('  Test 1 (OP1=12, OP2=8): If compound copies OP1->OP2, normalizes OP1, negates, adds:');
  console.log(`    Expected: OP1=12 (copy made OP2=12, norm zeros OP1, add(-0,12)=12), OP2=12`);
  console.log(`    Actual:   OP1=${decodeBcdRealBytes(t1.outputOP1)}, OP2=${decodeBcdRealBytes(t1.outputOP2)}`);
  console.log('');

  console.log('  Test 3 (OP1==OP2==12): Should be no-op on OP1:');
  console.log(`    Expected: OP1=12, OP2=12`);
  console.log(`    Actual:   OP1=${decodeBcdRealBytes(t3.outputOP1)}, OP2=${decodeBcdRealBytes(t3.outputOP2)}`);
  console.log('');

  console.log('  Test 5 (InvSub OP1=12, OP2=8): Negate OP1 then add = OP2 - OP1:');
  console.log(`    Expected: OP1 = 8 - 12 = -4`);
  console.log(`    Actual:   OP1=${decodeBcdRealBytes(t5.outputOP1)}, OP2=${decodeBcdRealBytes(t5.outputOP2)}`);
  console.log('');

  console.log('Done.');
  process.exitCode = 0;
}

try {
  main();
} catch (err) {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
}
