#!/usr/bin/env node

/**
 * Phase 167 — Simple Copy Test
 *
 * Tests replacing the compound function 0x07C747 with simpler alternatives
 * in the gcd handler. The compound function copies OP1→OP2, normalizes OP1,
 * negates zero, and FPAdds — effectively a no-op for OP1's value but it
 * destroys the original OP2 value.
 *
 * Four variants tested on gcd(12,8):
 *   A: Control — no intervention
 *   B: Intercept — replace 0x07C747 call with simple 9-byte OP1→OP2 copy
 *   C: Intercept — skip the CALL entirely (preserve OP2)
 *   D: Intercept — load OP2 from FPS (the pushed 8.0) then skip the CALL
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
  console.log('ROM.transpiled.js not found — gunzipping ...');
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

const GCD_ENTRY = 0x068d61;
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
const MAX_STEPS = 2000;

// The compound function entry point
const COMPOUND_FUNC_PC = 0x07c747;
// The simple OP1→OP2 copy function
const SIMPLE_COPY_PC = 0x07f8fa;

// --- FP encodings ---

const FP12 = [0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
const FP8  = [0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];

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

function seedGcdFpState(mem, op1Bytes, op2Bytes) {
  seedAllocator(mem);
  mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 0x40);
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA);
  seedRealRegister(mem, OP1_ADDR, op1Bytes);
  seedRealRegister(mem, OP2_ADDR, op2Bytes);
  mem[FP_CATEGORY_ADDR] = GCD_CATEGORY;
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

// --- Push OP2 to FPS (matches existing probe setup) ---

function pushOp2ToFps(mem) {
  const fpsPtr = read24(mem, FPS_ADDR);
  const op2Copy = readBytes(mem, OP2_ADDR, 9);
  for (let i = 0; i < 9; i++) {
    mem[fpsPtr + i] = op2Copy[i];
  }
  write24(mem, FPS_ADDR, fpsPtr + 9);
  return fpsPtr; // return where OP2 was pushed
}

// --- Test variants ---

function runVariantA(runtime) {
  const { mem, executor, cpu } = runtime;
  console.log('=== Part A: Control — gcd(12,8) with NO intervention ===');

  prepareCallState(cpu, mem);
  seedGcdFpState(mem, FP12, FP8);
  const fpsPushAddr = pushOp2ToFps(mem);
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  console.log(`  Entry OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9))}`);
  console.log(`  Entry OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9))}`);

  let stepCount = 0;
  let callCount07C747 = 0;
  let outcome = 'budget';

  try {
    executor.runFrom(GCD_ENTRY, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);
        if (norm === 0x07c747) {
          callCount07C747++;
          const retAddr = read24(mem, cpu.sp);
          console.log(`    0x07C747 call #${callCount07C747} at step ${stepCount}, return addr=${hex(retAddr)}, OP1=${decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9))}, OP2=${decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9))}`);
        }
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

  const finalOP1 = readBytes(mem, OP1_ADDR, 9);
  const finalOP2 = readBytes(mem, OP2_ADDR, 9);
  const errNo = mem[ERR_NO_ADDR] & 0xff;

  console.log(`  Outcome:    ${outcome}`);
  console.log(`  Steps:      ${stepCount}`);
  console.log(`  0x07C747 calls: ${callCount07C747}`);
  console.log(`  errNo:      ${hexByte(errNo)} (${errName(errNo)})`);
  console.log(`  Final OP1:  [${formatBytes(finalOP1)}] = ${decodeBcdRealBytes(finalOP1)}`);
  console.log(`  Final OP2:  [${formatBytes(finalOP2)}] = ${decodeBcdRealBytes(finalOP2)}`);
  console.log('');

  return { label: 'A: Control', outcome, stepCount, errNo, op1: decodeBcdRealBytes(finalOP1), op2: decodeBcdRealBytes(finalOP2), callCount07C747 };
}

function runVariantB(runtime) {
  const { mem, executor, cpu } = runtime;
  console.log('=== Part B: Intercept — replace 0x07C747 with simple OP1->OP2 copy ===');

  prepareCallState(cpu, mem);
  seedGcdFpState(mem, FP12, FP8);
  const fpsPushAddr = pushOp2ToFps(mem);
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  console.log(`  Entry OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9))}`);
  console.log(`  Entry OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9))}`);

  let stepCount = 0;
  let interceptCount = 0;
  let outcome = 'budget';
  const interceptLog = [];

  try {
    executor.runFrom(GCD_ENTRY, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);

        if (norm === COMPOUND_FUNC_PC) {
          // Intercept: do simple 9-byte OP1→OP2 copy instead
          for (let i = 0; i < 9; i++) {
            mem[OP2_ADDR + i] = mem[OP1_ADDR + i];
          }
          interceptCount++;
          interceptLog.push({
            step: stepCount,
            op1: decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9)),
            op2: decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9)),
          });
          // Simulate RET: pop return address from stack
          const retAddr = read24(mem, cpu.sp);
          cpu.sp += 3;
          cpu.pc = retAddr;
          return;
        }

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

  const finalOP1 = readBytes(mem, OP1_ADDR, 9);
  const finalOP2 = readBytes(mem, OP2_ADDR, 9);
  const errNo = mem[ERR_NO_ADDR] & 0xff;

  console.log(`  Outcome:     ${outcome}`);
  console.log(`  Steps:       ${stepCount}`);
  console.log(`  Intercepts:  ${interceptCount}`);
  for (const log of interceptLog) {
    console.log(`    step ${log.step}: OP1=${log.op1}, OP2=${log.op2} (after copy)`);
  }
  console.log(`  errNo:       ${hexByte(errNo)} (${errName(errNo)})`);
  console.log(`  Final OP1:   [${formatBytes(finalOP1)}] = ${decodeBcdRealBytes(finalOP1)}`);
  console.log(`  Final OP2:   [${formatBytes(finalOP2)}] = ${decodeBcdRealBytes(finalOP2)}`);
  console.log('');

  return { label: 'B: Simple OP1->OP2 copy', outcome, stepCount, errNo, op1: decodeBcdRealBytes(finalOP1), op2: decodeBcdRealBytes(finalOP2), interceptCount };
}

function runVariantC(runtime) {
  const { mem, executor, cpu } = runtime;
  console.log('=== Part C: Intercept — skip 0x07C747 entirely (preserve OP2) ===');

  prepareCallState(cpu, mem);
  seedGcdFpState(mem, FP12, FP8);
  const fpsPushAddr = pushOp2ToFps(mem);
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  console.log(`  Entry OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9))}`);
  console.log(`  Entry OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9))}`);

  let stepCount = 0;
  let interceptCount = 0;
  let outcome = 'budget';
  const interceptLog = [];

  try {
    executor.runFrom(GCD_ENTRY, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);

        if (norm === COMPOUND_FUNC_PC) {
          // Don't do anything — just RET immediately (preserve OP2)
          interceptCount++;
          interceptLog.push({
            step: stepCount,
            op1: decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9)),
            op2: decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9)),
          });
          // Simulate RET
          const retAddr = read24(mem, cpu.sp);
          cpu.sp += 3;
          cpu.pc = retAddr;
          return;
        }

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

  const finalOP1 = readBytes(mem, OP1_ADDR, 9);
  const finalOP2 = readBytes(mem, OP2_ADDR, 9);
  const errNo = mem[ERR_NO_ADDR] & 0xff;

  console.log(`  Outcome:     ${outcome}`);
  console.log(`  Steps:       ${stepCount}`);
  console.log(`  Intercepts:  ${interceptCount}`);
  for (const log of interceptLog) {
    console.log(`    step ${log.step}: OP1=${log.op1}, OP2=${log.op2} (preserved)`);
  }
  console.log(`  errNo:       ${hexByte(errNo)} (${errName(errNo)})`);
  console.log(`  Final OP1:   [${formatBytes(finalOP1)}] = ${decodeBcdRealBytes(finalOP1)}`);
  console.log(`  Final OP2:   [${formatBytes(finalOP2)}] = ${decodeBcdRealBytes(finalOP2)}`);
  console.log('');

  return { label: 'C: Skip (preserve OP2)', outcome, stepCount, errNo, op1: decodeBcdRealBytes(finalOP1), op2: decodeBcdRealBytes(finalOP2), interceptCount };
}

function runVariantD(runtime) {
  const { mem, executor, cpu } = runtime;
  console.log('=== Part D: Intercept — load OP2 from FPS (pushed 8.0) at 0x07C747 entry ===');

  prepareCallState(cpu, mem);
  seedGcdFpState(mem, FP12, FP8);
  const fpsPushAddr = pushOp2ToFps(mem);
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  console.log(`  Entry OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9))}`);
  console.log(`  Entry OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9))}`);
  console.log(`  FPS push addr: ${hex(fpsPushAddr)}`);

  let stepCount = 0;
  let interceptCount = 0;
  let outcome = 'budget';
  const interceptLog = [];

  try {
    executor.runFrom(GCD_ENTRY, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);

        if (norm === COMPOUND_FUNC_PC) {
          // Read OP2 from FPS (peek, don't pop)
          const fpsPtr = read24(mem, FPS_ADDR);
          const fpsTop = fpsPtr - 9;
          const fpsBytes = readBytes(mem, fpsTop, 9);

          // Copy FPS top into OP2
          for (let i = 0; i < 9; i++) {
            mem[OP2_ADDR + i] = mem[fpsTop + i];
          }

          interceptCount++;
          interceptLog.push({
            step: stepCount,
            op1: decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9)),
            op2: decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9)),
            fpsValue: decodeBcdRealBytes(fpsBytes),
            fpsAddr: hex(fpsTop),
          });
          // Simulate RET
          const retAddr = read24(mem, cpu.sp);
          cpu.sp += 3;
          cpu.pc = retAddr;
          return;
        }

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

  const finalOP1 = readBytes(mem, OP1_ADDR, 9);
  const finalOP2 = readBytes(mem, OP2_ADDR, 9);
  const errNo = mem[ERR_NO_ADDR] & 0xff;

  console.log(`  Outcome:     ${outcome}`);
  console.log(`  Steps:       ${stepCount}`);
  console.log(`  Intercepts:  ${interceptCount}`);
  for (const log of interceptLog) {
    console.log(`    step ${log.step}: OP1=${log.op1}, OP2=${log.op2} (from FPS@${log.fpsAddr}=${log.fpsValue})`);
  }
  console.log(`  errNo:       ${hexByte(errNo)} (${errName(errNo)})`);
  console.log(`  Final OP1:   [${formatBytes(finalOP1)}] = ${decodeBcdRealBytes(finalOP1)}`);
  console.log(`  Final OP2:   [${formatBytes(finalOP2)}] = ${decodeBcdRealBytes(finalOP2)}`);
  console.log('');

  return { label: 'D: FPS->OP2 + RET', outcome, stepCount, errNo, op1: decodeBcdRealBytes(finalOP1), op2: decodeBcdRealBytes(finalOP2), interceptCount };
}

// --- Main ---

function main() {
  console.log('=== Phase 167: Simple Copy Test — 0x07C747 replacement variants ===');
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
  results.push(runVariantA(runtime));
  results.push(runVariantB(runtime));
  results.push(runVariantC(runtime));
  results.push(runVariantD(runtime));

  // Summary table
  console.log('='.repeat(70));
  console.log('COMPARISON TABLE');
  console.log('='.repeat(70));
  console.log('');
  console.log('Variant                        | Outcome | Steps | errNo        | OP1      | OP2');
  console.log('-------------------------------|---------|-------|--------------|----------|--------');

  for (const r of results) {
    const label = r.label.padEnd(30);
    const outcome = r.outcome.padEnd(7);
    const steps = String(r.stepCount).padEnd(5);
    const err = errName(r.errNo).padEnd(12);
    const op1 = r.op1.padEnd(8);
    const op2 = r.op2;
    console.log(`${label} | ${outcome} | ${steps} | ${err}  | ${op1} | ${op2}`);
  }

  console.log('');

  // Highlight differences
  const baseline = results[0];
  let anyDifferent = false;

  for (let i = 1; i < results.length; i++) {
    const r = results[i];
    const diffs = [];
    if (r.errNo !== baseline.errNo) diffs.push(`errNo: ${errName(baseline.errNo)} -> ${errName(r.errNo)}`);
    if (r.op1 !== baseline.op1) diffs.push(`OP1: ${baseline.op1} -> ${r.op1}`);
    if (r.op2 !== baseline.op2) diffs.push(`OP2: ${baseline.op2} -> ${r.op2}`);
    if (r.outcome !== baseline.outcome) diffs.push(`outcome: ${baseline.outcome} -> ${r.outcome}`);
    if (r.stepCount !== baseline.stepCount) diffs.push(`steps: ${baseline.stepCount} -> ${r.stepCount}`);

    if (diffs.length > 0) {
      anyDifferent = true;
      console.log(`  ${r.label} differs from control:`);
      for (const d of diffs) {
        console.log(`    - ${d}`);
      }
    } else {
      console.log(`  ${r.label}: SAME as control`);
    }
  }

  console.log('');
  if (!anyDifferent) {
    console.log('CONCLUSION: All variants produce the same result. The 0x07C747 compound');
    console.log('function is NOT the root cause of the E_Domain bug — the problem is elsewhere.');
  } else {
    console.log('CONCLUSION: At least one variant produced a different result.');
    console.log('See differences above for details on which intervention changed the outcome.');
  }

  console.log('');
  console.log('Done.');
}

try {
  main();
} catch (err) {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
}
