#!/usr/bin/env node

/**
 * Phase 148 - gcd real pop seed verification.
 *
 * Test A: verify PRELIFTED_BLOCKS includes the real FP pop block at 0x0828FC.
 * Test B: run gcd(12,8) from the direct handler entry at 0x068D3D.
 * Test C: run gcd(12,8) through the dispatch entry at 0x06859B with A=0x28.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

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

const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const FP_CATEGORY_ADDR = 0xd0060e;
const GCD_DISPATCH_ADDR = 0x06859b;
const GCD_DIRECT_ADDR = 0x068d3d;

const REAL_FP_POP_ADDR = 0x0828fc;
const REAL_FP_POP_HELPER_ADDR = 0x082912;
const FP_SWAP_ADDR = 0x082bce;

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const MEMINIT_BUDGET = 100000;
const MAX_STEPS = 5000;
const MAX_LOOP_ITER = 8192;

const FPS_CLEAN_AREA = 0xd1aa00;
const FPS_ENTRY_SIZE = 9;
const GCD_CATEGORY = 0x28;

const BCD_12 = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_8 = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_4 = Uint8Array.from([0x00, 0x80, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const EXPECTED_GCD_HEX = Array.from(
  BCD_4,
  (byte) => byte.toString(16).toUpperCase().padStart(2, '0')
).join(' ');

const formatBlockKey = (pc, mode = 'adl') =>
  `${pc.toString(16).padStart(6, '0')}:${mode}`;

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

function hexBytes(m, a, n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push((m[a + i] & 0xff).toString(16).toUpperCase().padStart(2, '0'));
  }
  return out.join(' ');
}

function decodeBCDFloat(mem, addr) {
  const type = mem[addr] & 0xff;
  const exp = mem[addr + 1] & 0xff;
  const digits = [];
  for (let i = 2; i < 9; i++) {
    const b = mem[addr + i] & 0xff;
    digits.push((b >> 4) & 0xf, b & 0xf);
  }
  const sign = (type & 0x80) ? -1 : 1;
  const exponent = (exp & 0x7f) - 0x40;
  if (digits.every((d) => d === 0)) return '0';
  let mantissa = '';
  for (let i = 0; i < digits.length; i++) {
    if (i === exponent + 1) mantissa += '.';
    mantissa += digits[i];
  }
  return `${sign < 0 ? '-' : ''}${mantissa.replace(/\.?0+$/, '') || '0'} (exp=${exponent})`;
}

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
  } catch (e) {
    if (e?.message === '__RET__') ok = true;
    else throw e;
  }
  return ok;
}

function createPreparedRuntime() {
  const runtime = createRuntime();
  coldBoot(runtime.executor, runtime.cpu, runtime.mem);
  const memInitOk = runMemInit(runtime.executor, runtime.cpu, runtime.mem);
  return { ...runtime, memInitOk };
}

function seedGcdState(mem) {
  seedAllocator(mem);

  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 32);
  mem.set(BCD_12, FPS_CLEAN_AREA);
  mem.set(BCD_8, FPS_CLEAN_AREA + FPS_ENTRY_SIZE);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA + (2 * FPS_ENTRY_SIZE));

  mem.set(BCD_12, OP1_ADDR);
  mem.fill(0x00, OP1_ADDR + 9, OP1_ADDR + 11);
  mem.set(BCD_8, OP2_ADDR);
  mem.fill(0x00, OP2_ADDR + 9, OP2_ADDR + 11);
  mem[FP_CATEGORY_ADDR] = GCD_CATEGORY;
}

function runGcdScenario(label, entryPc, configureCpu) {
  const { mem, executor, cpu, memInitOk } = createPreparedRuntime();
  if (!memInitOk) {
    return {
      label,
      entryPc,
      memInitOk,
      outcome: 'meminit-failed',
      pass: false,
      errNo: null,
      op1Hex: null,
      op2Hex: null,
      op1Value: null,
      op2Value: null,
      fpsPtr: null,
      fpsBase: null,
      stepCount: 0,
      lastMissingBlock: null,
      thrownMessage: null,
    };
  }

  seedGcdState(mem);
  prepareCallState(cpu, mem);
  if (configureCpu) configureCpu(cpu, mem);
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  let stepCount = 0;
  let outcome = 'budget';
  let lastMissingBlock = null;
  let thrownMessage = null;

  try {
    executor.runFrom(entryPc, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        const norm = pc & 0xffffff;
        stepCount++;
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc) {
        const norm = pc & 0xffffff;
        stepCount++;
        lastMissingBlock = norm;
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
    });
  } catch (e) {
    if (e?.message === '__RET__') {
      outcome = 'return';
    } else if (e?.message === '__ERR__') {
      outcome = 'error';
    } else {
      outcome = 'threw';
      thrownMessage = e?.stack || String(e);
    }
  }

  const op1Hex = hexBytes(mem, OP1_ADDR, 9);
  const errNo = mem[ERR_NO_ADDR] & 0xff;
  const pass = outcome === 'return' && errNo === 0x00 && op1Hex === EXPECTED_GCD_HEX;

  return {
    label,
    entryPc,
    memInitOk,
    outcome,
    pass,
    errNo,
    op1Hex,
    op2Hex: hexBytes(mem, OP2_ADDR, 9),
    op1Value: decodeBCDFloat(mem, OP1_ADDR),
    op2Value: decodeBCDFloat(mem, OP2_ADDR),
    fpsPtr: read24(mem, FPS_ADDR),
    fpsBase: read24(mem, FPSBASE_ADDR),
    stepCount,
    lastMissingBlock,
    thrownMessage,
  };
}

function printBlockCheck() {
  const realPopKey = formatBlockKey(REAL_FP_POP_ADDR);
  const helperKey = formatBlockKey(REAL_FP_POP_HELPER_ADDR);
  const swapKey = formatBlockKey(FP_SWAP_ADDR);

  const realPopExists = BLOCKS[realPopKey] !== undefined;
  const helperExists = BLOCKS[helperKey] !== undefined;
  const swapExists = BLOCKS[swapKey] !== undefined;

  console.log('========================================================================');
  console.log('Test A - PRELIFTED_BLOCKS coverage');
  console.log('========================================================================');
  console.log(`0x0828FC (${realPopKey}): ${realPopExists ? 'PRESENT' : 'MISSING'}`);
  console.log(`0x082912 (${helperKey}): ${helperExists ? 'PRESENT' : 'MISSING'}`);
  console.log(`0x082BCE (${swapKey}): ${swapExists ? 'PRESENT' : 'MISSING'}`);
  console.log('');

  return {
    pass: realPopExists,
    realPopExists,
    helperExists,
    swapExists,
  };
}

function printScenario(result) {
  console.log('------------------------------------------------------------------------');
  console.log(result.label);
  console.log('------------------------------------------------------------------------');
  console.log(`Entry: ${hex(result.entryPc)}`);
  console.log(`Outcome: ${result.outcome}`);
  console.log(`Pass: ${result.pass ? 'YES' : 'NO'}`);
  console.log(`errNo: ${hex(result.errNo, 2)}`);
  console.log(`OP1 bytes: [${result.op1Hex}]`);
  console.log(`OP1 decode: ${result.op1Value}`);
  console.log(`OP2 bytes: [${result.op2Hex}]`);
  console.log(`OP2 decode: ${result.op2Value}`);
  console.log(`FPS ptr: ${hex(result.fpsPtr)}`);
  console.log(`FPS base: ${hex(result.fpsBase)}`);
  console.log(`Steps: ${result.stepCount}`);
  console.log(`Expected gcd(12,8) OP1: [${EXPECTED_GCD_HEX}]`);
  if (result.lastMissingBlock !== null) {
    console.log(`Last missing block: ${hex(result.lastMissingBlock)}`);
  }
  if (result.thrownMessage) {
    console.log(`Thrown: ${result.thrownMessage.split('\n')[0]}`);
  }
  console.log('');
}

function main() {
  console.log('=== Phase 148: gcd real pop probe ===');
  console.log('');

  const testA = printBlockCheck();
  const testB = runGcdScenario(
    'Test B - gcd(12,8) direct handler at 0x068D3D',
    GCD_DIRECT_ADDR
  );
  const testC = runGcdScenario(
    'Test C - gcd(12,8) dispatch at 0x06859B with A=0x28',
    GCD_DISPATCH_ADDR,
    (cpu) => {
      cpu.a = GCD_CATEGORY;
    }
  );

  printScenario(testB);
  printScenario(testC);

  const overallPass = testA.pass && testB.pass && testC.pass;

  console.log('========================================================================');
  console.log('Summary');
  console.log('========================================================================');
  console.log(`Test A: ${testA.pass ? 'PASS' : 'FAIL'}`);
  console.log(`Test B: ${testB.pass ? 'PASS' : 'FAIL'}`);
  console.log(`Test C: ${testC.pass ? 'PASS' : 'FAIL'}`);
  console.log(`Overall: ${overallPass ? 'PASS' : 'FAIL'}`);

  process.exitCode = overallPass ? 0 : 1;
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
