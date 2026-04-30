#!/usr/bin/env node

/**
 * Phase 169 - Trace OP1 through the _Intgr call at 0x068D69 (target 0x0685DF)
 *
 * Part 1: During gcd(12,8), intercept every call to 0x0685DF and log
 *         OP1/OP2/A/flags/SP at entry and OP1/OP2 at return (0x068D6D).
 *
 * Part 2: Standalone tests of 0x0685DF with OP1=12.0, 1200, 1.5, 100.
 *         Check if it modifies OP2 as a side effect.
 *
 * Part 3: Cross-reference with jump table — 0x0685DF is RndGuard, 0x07C747 is TRunc.
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
    throw new Error('ROM.transpiled.js and ROM.transpiled.js.gz both missing.');
  }
  console.log('ROM.transpiled.js not found — gunzipping...');
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

const GCD_ENTRY = 0x068d3d;
const GCD_CATEGORY = 0x28;
const FP_CATEGORY_ADDR = 0xd0060e;

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
const MAX_STEPS = 5000;

const RNDGUARD_ENTRY = 0x0685df;  // The "intgr" call target — actually RndGuard
const RNDGUARD_RET_SITE = 0x068d6d; // Instruction after CALL 0x0685DF at 0x068D69

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

function seedGcdFpState(mem, op1Bytes, op2Bytes) {
  seedAllocator(mem);
  mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 0x40);
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA);
  seedRealRegister(mem, OP1_ADDR, op1Bytes);
  seedRealRegister(mem, OP2_ADDR, op2Bytes);
  mem[FP_CATEGORY_ADDR] = GCD_CATEGORY;
}

function createPreparedRuntime() {
  const runtime = createRuntime();
  coldBoot(runtime.executor, runtime.cpu, runtime.mem);

  const { executor, cpu, mem } = runtime;
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);

  let memInitOk = false;
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
    if (err?.message === '__RET__') memInitOk = true;
    else throw err;
  }

  return { ...runtime, memInitOk };
}

// ==========================================================================
// Part 1: Trace RndGuard calls during gcd(12,8)
// ==========================================================================

function part1_gcdTrace(runtime) {
  console.log('='.repeat(80));
  console.log('PART 1: Trace RndGuard (0x0685DF) calls during gcd(12,8)');
  console.log('='.repeat(80));
  console.log('');

  const { mem, executor, cpu } = runtime;

  // BCD 12.0: type=0x00, exp=0x81, mantissa=12 00 00 00 00 00 00
  const op1Bytes = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  // BCD 8.0: type=0x00, exp=0x80, mantissa=80 00 00 00 00 00 00
  const op2Bytes = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

  prepareCallState(cpu, mem);
  seedGcdFpState(mem, op1Bytes, op2Bytes);

  // Push OP2 to FPS before gcd entry
  const fpsPtr = read24(mem, FPS_ADDR);
  const op2Copy = readBytes(mem, OP2_ADDR, 9);
  for (let i = 0; i < 9; i++) {
    mem[fpsPtr + i] = op2Copy[i];
  }
  write24(mem, FPS_ADDR, fpsPtr + 9);

  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  console.log(`Entry OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9))}`);
  console.log(`Entry OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9))}`);
  console.log('');

  let stepCount = 0;
  let outcome = 'budget';
  let rndGuardCallNum = 0;

  // Track entry/exit pairs
  const rndGuardCalls = [];
  let pendingEntry = null;

  try {
    executor.runFrom(GCD_ENTRY, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,

      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = step + 1;

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');

        // Entering RndGuard
        if (norm === RNDGUARD_ENTRY) {
          rndGuardCallNum++;
          pendingEntry = {
            callNum: rndGuardCallNum,
            step: stepCount,
            op1Before: readBytes(mem, OP1_ADDR, 9),
            op2Before: readBytes(mem, OP2_ADDR, 9),
            a: cpu.a & 0xff,
            f: cpu.f & 0xff,
            sp: cpu.sp,
            hl: cpu.hl,
            de: cpu.de,
            bc: cpu.bc,
          };
        }

        // Return site after CALL RndGuard (0x068D6D)
        if (norm === RNDGUARD_RET_SITE && pendingEntry !== null) {
          pendingEntry.op1After = readBytes(mem, OP1_ADDR, 9);
          pendingEntry.op2After = readBytes(mem, OP2_ADDR, 9);
          pendingEntry.aAfter = cpu.a & 0xff;
          pendingEntry.fAfter = cpu.f & 0xff;
          pendingEntry.spAfter = cpu.sp;
          rndGuardCalls.push(pendingEntry);
          pendingEntry = null;
        }
      },

      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = step + 1;
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
    });
  } catch (err) {
    if (err?.message === '__RET__') outcome = 'return';
    else if (err?.message === '__ERR__') outcome = 'error';
    else {
      outcome = 'threw';
      console.log(`Thrown: ${(err?.stack || String(err)).split('\n')[0]}`);
    }
  }

  // If there's a pending entry that never returned, capture final state
  if (pendingEntry !== null) {
    pendingEntry.op1After = readBytes(mem, OP1_ADDR, 9);
    pendingEntry.op2After = readBytes(mem, OP2_ADDR, 9);
    pendingEntry.aAfter = cpu.a & 0xff;
    pendingEntry.fAfter = cpu.f & 0xff;
    pendingEntry.spAfter = cpu.sp;
    pendingEntry.noReturn = true;
    rndGuardCalls.push(pendingEntry);
  }

  const errNo = mem[ERR_NO_ADDR] & 0xff;
  console.log(`Outcome: ${outcome}, steps: ${stepCount}, errNo: ${hexByte(errNo)} (${errName(errNo)})`);
  console.log(`Final OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9))}`);
  console.log(`Final OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9))}`);
  console.log('');

  console.log(`RndGuard calls observed: ${rndGuardCalls.length}`);
  console.log('');

  for (const call of rndGuardCalls) {
    const marker = call.noReturn ? ' [DID NOT RETURN TO 0x068D6D]' : '';
    console.log(`--- RndGuard call #${call.callNum} (step ${call.step})${marker} ---`);
    console.log(`  Entry:  A=${hexByte(call.a)} F=${hexByte(call.f)} SP=${hex(call.sp)} HL=${hex(call.hl)} DE=${hex(call.de)} BC=${hex(call.bc)}`);
    console.log(`  OP1 before: [${formatBytes(call.op1Before)}] = ${decodeBcdRealBytes(call.op1Before)}`);
    console.log(`  OP2 before: [${formatBytes(call.op2Before)}] = ${decodeBcdRealBytes(call.op2Before)}`);
    console.log(`  OP1 after:  [${formatBytes(call.op1After)}]  = ${decodeBcdRealBytes(call.op1After)}`);
    console.log(`  OP2 after:  [${formatBytes(call.op2After)}]  = ${decodeBcdRealBytes(call.op2After)}`);

    // Check if OP1 changed
    const op1Changed = !call.op1Before.every((b, i) => b === call.op1After[i]);
    const op2Changed = !call.op2Before.every((b, i) => b === call.op2After[i]);
    console.log(`  OP1 changed: ${op1Changed ? 'YES' : 'no'}`);
    console.log(`  OP2 changed: ${op2Changed ? 'YES (side effect!)' : 'no'}`);
    if (!call.noReturn) {
      console.log(`  Return: A=${hexByte(call.aAfter)} F=${hexByte(call.fAfter)} SP=${hex(call.spAfter)}`);
    }
    console.log('');
  }
}

// ==========================================================================
// Part 2: Standalone RndGuard tests
// ==========================================================================

function part2_standaloneTests(runtime) {
  console.log('='.repeat(80));
  console.log('PART 2: Standalone RndGuard (0x0685DF) tests');
  console.log('='.repeat(80));
  console.log('');

  const testCases = [
    { label: '12.0',  op1: [0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00] },
    { label: '1200',  op1: [0x00, 0x83, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00] },
    { label: '1.5',   op1: [0x00, 0x80, 0x15, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00] },
    { label: '100',   op1: [0x00, 0x82, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00] },
    { label: '0.5',   op1: [0x00, 0x7f, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00] },
    { label: '3.14',  op1: [0x00, 0x80, 0x31, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00] },
  ];

  // Fixed OP2 for side-effect detection
  const op2Sentinel = [0x00, 0x80, 0x99, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]; // 9.9

  for (const tc of testCases) {
    const { mem, executor, cpu } = runtime;

    prepareCallState(cpu, mem);
    seedAllocator(mem);
    mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 0x40);
    write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
    write24(mem, FPS_ADDR, FPS_CLEAN_AREA);
    seedRealRegister(mem, OP1_ADDR, Uint8Array.from(tc.op1));
    seedRealRegister(mem, OP2_ADDR, Uint8Array.from(op2Sentinel));
    mem[ERR_NO_ADDR] = 0x00;

    // Push a return address
    seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

    const op1Before = readBytes(mem, OP1_ADDR, 9);
    const op2Before = readBytes(mem, OP2_ADDR, 9);

    let stepCount = 0;
    let outcome = 'budget';

    try {
      executor.runFrom(RNDGUARD_ENTRY, 'adl', {
        maxSteps: 3000,
        maxLoopIterations: MAX_LOOP_ITER,

        onBlock(pc, mode, meta, step) {
          const norm = pc & 0xffffff;
          stepCount = step + 1;
          if (norm === FAKE_RET) throw new Error('__RET__');
          if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
        },

        onMissingBlock(pc, mode, step) {
          const norm = pc & 0xffffff;
          stepCount = step + 1;
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

    const errNo = mem[ERR_NO_ADDR] & 0xff;
    const op1After = readBytes(mem, OP1_ADDR, 9);
    const op2After = readBytes(mem, OP2_ADDR, 9);

    const op1Changed = !op1Before.every((b, i) => b === op1After[i]);
    const op2Changed = !op2Before.every((b, i) => b === op2After[i]);

    console.log(`Test: OP1 = ${tc.label}`);
    console.log(`  Outcome: ${outcome}, steps: ${stepCount}, errNo: ${hexByte(errNo)} (${errName(errNo)})`);
    console.log(`  OP1 before: [${formatBytes(op1Before)}] = ${decodeBcdRealBytes(op1Before)}`);
    console.log(`  OP1 after:  [${formatBytes(op1After)}]  = ${decodeBcdRealBytes(op1After)}`);
    console.log(`  OP1 changed: ${op1Changed ? 'YES' : 'no'}`);
    console.log(`  OP2 before: [${formatBytes(op2Before)}] = ${decodeBcdRealBytes(op2Before)}`);
    console.log(`  OP2 after:  [${formatBytes(op2After)}]  = ${decodeBcdRealBytes(op2After)}`);
    console.log(`  OP2 changed: ${op2Changed ? 'YES (side effect!)' : 'no'}`);
    console.log('');
  }
}

// ==========================================================================
// Part 3: Jump table cross-reference
// ==========================================================================

function part3_crossReference() {
  console.log('='.repeat(80));
  console.log('PART 3: Jump Table Cross-Reference');
  console.log('='.repeat(80));
  console.log('');
  console.log('From phase25h-a-jump-table-report.md:');
  console.log('  0x0685DF = RndGuard  (JT entry 62, vector 0x0201FC)');
  console.log('  0x07C747 = TRunc     (JT entry 41, vector 0x0201A8)');
  console.log('');
  console.log('The gcd loop at 0x068D69 calls RndGuard, NOT _Intgr/_Int.');
  console.log('RndGuard is a rounding guard — it may round or truncate to integer');
  console.log('for the purpose of ensuring integer-domain operations.');
  console.log('');
  console.log('TRunc at 0x07C747 is the compound function previously identified');
  console.log('as INT(x) in session 168. These are DIFFERENT functions:');
  console.log('  - RndGuard (0x0685DF): called from gcd loop, possibly rounds to nearest int');
  console.log('  - TRunc (0x07C747): compound INT() function with normalize, may truncate toward zero');
  console.log('');
}

// ==========================================================================
// Main
// ==========================================================================

function main() {
  console.log('=== Phase 169: _Intgr (RndGuard) Trace at 0x068D69 ===');
  console.log('');

  const runtime = createPreparedRuntime();

  if (!runtime.memInitOk) {
    console.log('MEM_INIT failed; aborting.');
    process.exitCode = 1;
    return;
  }

  console.log('Cold boot + MEM_INIT complete.');
  console.log('');

  part1_gcdTrace(runtime);
  part2_standaloneTests(runtime);
  part3_crossReference();

  console.log('Done.');
  process.exitCode = 0;
}

try {
  main();
} catch (err) {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
}
