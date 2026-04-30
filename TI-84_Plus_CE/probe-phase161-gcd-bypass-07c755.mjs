#!/usr/bin/env node

/**
 * Phase 161 - Intercept gcd to use 0x07C755 instead of 0x07C747.
 *
 * Tests whether redirecting OP1toOP2 from the compound entry (0x07C747,
 * which calls normalization that zeros mantissa) to the simpler copy+add
 * entry (0x07C755) fixes gcd for integer inputs.
 *
 * Test A: Intercepted gcd(12,8) — expect result = 4
 * Test B: Control gcd(12,8) without intercept — expect E_Domain
 * Test C: Intercepted gcd(1200,8) — expect result = 8
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

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

const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const FP_CATEGORY_ADDR = 0xd0060e;

const GCD_ENTRY = 0x068d3d;
const GCD_CATEGORY = 0x28;

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const MEMINIT_BUDGET = 100000;
const MAX_LOOP_ITER = 8192;
const GCD_BUDGET = 5000;

const FPS_CLEAN_AREA = 0xd1aa00;

// OP1toOP2 entry points
const OP1TOOP2_COMPOUND = 0x07c747;  // compound: copy + normalize + negate + FPAdd
const OP1TOOP2_SIMPLE   = 0x07c755;  // simple: copy + FPAdd (no normalize, no negate)

// BCD encodings
const BCD_12   = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_8    = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_1200 = Uint8Array.from([0x00, 0x83, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_4    = Uint8Array.from([0x00, 0x80, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_GCD8 = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

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

function seedGcdFpState(mem, op1Bcd, op2Bcd) {
  seedAllocator(mem);
  mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 0x40);
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA);
  seedRealRegister(mem, OP1_ADDR, op1Bcd);
  seedRealRegister(mem, OP2_ADDR, op2Bcd);
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

// ==========================================================================
// Run gcd with optional intercept
// ==========================================================================

function runGcd(runtime, op1Bcd, op2Bcd, intercept, label) {
  const { mem, executor, cpu } = runtime;

  prepareCallState(cpu, mem);
  seedGcdFpState(mem, op1Bcd, op2Bcd);

  // Push OP2 to FPS before gcd entry (same as phase 157/160)
  const fpsPtr = read24(mem, FPS_ADDR);
  const op2Bytes = readBytes(mem, OP2_ADDR, 9);
  for (let i = 0; i < 9; i++) {
    mem[fpsPtr + i] = op2Bytes[i];
  }
  write24(mem, FPS_ADDR, fpsPtr + 9);

  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  const op1Val = decodeBcdRealBytes(Array.from(op1Bcd));
  const op2Val = decodeBcdRealBytes(Array.from(op2Bcd));

  console.log(`  Entry: gcd at ${hex(GCD_ENTRY)}`);
  console.log(`  OP1: [${formatBytes(Array.from(op1Bcd))}] = ${op1Val}`);
  console.log(`  OP2: [${formatBytes(Array.from(op2Bcd))}] = ${op2Val}`);
  console.log(`  Intercept: ${intercept ? 'YES (0x07C747 -> 0x07C755)' : 'NO (control)'}`);
  console.log(`  SP: ${hex(cpu.sp)}`);

  let stepCount = 0;
  let interceptCount = 0;
  let outcome = 'budget';

  // Resolve the alternate block key
  const altBlockKey = '07c755:adl';
  const altBlock = BLOCKS[altBlockKey];
  if (intercept && !altBlock) {
    // Try alternate key formats
    const altKey2 = '07c755:z80';
    const altBlock2 = BLOCKS[altKey2];
    if (altBlock2) {
      console.log(`  NOTE: block '${altBlockKey}' not found, using '${altKey2}'`);
    } else {
      console.log(`  WARNING: block '${altBlockKey}' not found in BLOCKS! Intercept will not fire.`);
    }
  }

  try {
    executor.runFrom(GCD_ENTRY, 'adl', {
      maxSteps: GCD_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,

      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);

        // Intercept: redirect compound OP1toOP2 to simple variant
        if (intercept && norm === OP1TOOP2_COMPOUND) {
          const target = BLOCKS[altBlockKey];
          if (target) {
            interceptCount++;
            console.log(`  [INTERCEPT] step ${stepCount}: redirecting 0x07C747 -> 0x07C755`);
            return target;
          }
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

  const finalOp1 = readBytes(mem, OP1_ADDR, 9);
  const finalOp2 = readBytes(mem, OP2_ADDR, 9);
  const errNo = mem[ERR_NO_ADDR] & 0xff;

  console.log('');
  console.log('  --- Result ---');
  console.log(`  Outcome: ${outcome}`);
  console.log(`  Steps: ${stepCount}`);
  console.log(`  Intercepts fired: ${interceptCount}`);
  console.log(`  Final OP1: [${formatBytes(finalOp1)}] = ${decodeBcdRealBytes(finalOp1)}`);
  console.log(`  Final OP2: [${formatBytes(finalOp2)}] = ${decodeBcdRealBytes(finalOp2)}`);
  console.log(`  errNo: ${hexByte(errNo)} (${errName(errNo)})`);

  return { finalOp1, finalOp2, errNo, stepCount, interceptCount, outcome };
}

// ==========================================================================
// Main
// ==========================================================================

function main() {
  console.log('=== Phase 161: Intercept gcd to bypass 0x07C747 -> 0x07C755 ===');
  console.log('');

  const runtime = createPreparedRuntime();

  if (!runtime.memInitOk) {
    console.log('MEM_INIT failed; aborting.');
    process.exitCode = 1;
    return;
  }

  console.log('Cold boot + MEM_INIT complete.');

  // Check if the alternate block exists
  const altExists = !!BLOCKS['07c755:adl'];
  console.log(`Block '07c755:adl' exists in BLOCKS: ${altExists}`);
  if (!altExists) {
    // Check alternate key formats
    const z80Exists = !!BLOCKS['07c755:z80'];
    console.log(`Block '07c755:z80' exists in BLOCKS: ${z80Exists}`);
  }
  console.log('');

  // =============================================
  // Test A: Intercepted gcd(12, 8)
  // =============================================
  console.log(`${'='.repeat(70)}`);
  console.log('TEST A: Intercepted gcd(12, 8) — expect result = 4');
  console.log(`${'='.repeat(70)}`);

  const resultA = runGcd(runtime, BCD_12, BCD_8, true, 'Test A');

  const op1MatchesExpected_A =
    resultA.finalOp1[0] === BCD_4[0] &&
    resultA.finalOp1[1] === BCD_4[1] &&
    resultA.finalOp1[2] === BCD_4[2] &&
    resultA.finalOp1.slice(3, 9).every((b) => b === 0);

  console.log(`  OP1 == 4.0: ${op1MatchesExpected_A ? 'YES' : 'NO'}`);
  console.log(`  Intercept worked: ${resultA.interceptCount > 0 ? 'YES' : 'NO'}`);
  console.log('');

  // =============================================
  // Test B: Control gcd(12, 8) — no intercept
  // =============================================
  console.log(`${'='.repeat(70)}`);
  console.log('TEST B: Control gcd(12, 8) — no intercept, expect E_Domain');
  console.log(`${'='.repeat(70)}`);

  const resultB = runGcd(runtime, BCD_12, BCD_8, false, 'Test B');

  const isEDomain_B = resultB.errNo === 0x84;
  console.log(`  errNo == E_Domain (0x84): ${isEDomain_B ? 'YES' : 'NO'}`);
  console.log('');

  // =============================================
  // Test C: Intercepted gcd(1200, 8)
  // =============================================
  console.log(`${'='.repeat(70)}`);
  console.log('TEST C: Intercepted gcd(1200, 8) — expect result = 8');
  console.log(`${'='.repeat(70)}`);

  const resultC = runGcd(runtime, BCD_1200, BCD_8, true, 'Test C');

  const op1MatchesExpected_C =
    resultC.finalOp1[0] === BCD_GCD8[0] &&
    resultC.finalOp1[1] === BCD_GCD8[1] &&
    resultC.finalOp1[2] === BCD_GCD8[2] &&
    resultC.finalOp1.slice(3, 9).every((b) => b === 0);

  console.log(`  OP1 == 8.0: ${op1MatchesExpected_C ? 'YES' : 'NO'}`);
  console.log(`  Intercept worked: ${resultC.interceptCount > 0 ? 'YES' : 'NO'}`);
  console.log('');

  // =============================================
  // Summary
  // =============================================
  console.log(`${'='.repeat(70)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(70)}`);
  console.log(`  Test A (intercepted gcd(12,8)):   OP1=${decodeBcdRealBytes(resultA.finalOp1)}, errNo=${errName(resultA.errNo)}, outcome=${resultA.outcome}, intercepts=${resultA.interceptCount}, steps=${resultA.stepCount}`);
  console.log(`  Test B (control gcd(12,8)):       OP1=${decodeBcdRealBytes(resultB.finalOp1)}, errNo=${errName(resultB.errNo)}, outcome=${resultB.outcome}, intercepts=${resultB.interceptCount}, steps=${resultB.stepCount}`);
  console.log(`  Test C (intercepted gcd(1200,8)): OP1=${decodeBcdRealBytes(resultC.finalOp1)}, errNo=${errName(resultC.errNo)}, outcome=${resultC.outcome}, intercepts=${resultC.interceptCount}, steps=${resultC.stepCount}`);
  console.log('');

  if (op1MatchesExpected_A) {
    console.log('  VERDICT: Test A PASSED — bypassing normalization via 0x07C755 fixes gcd(12,8).');
    process.exitCode = 0;
  } else {
    console.log(`  VERDICT: Test A FAILED — gcd(12,8) did not produce 4.0 (got ${decodeBcdRealBytes(resultA.finalOp1)}, errNo=${errName(resultA.errNo)}).`);
    process.exitCode = 1;
  }

  if (isEDomain_B) {
    console.log('  Control B confirms: unmodified gcd(12,8) still hits E_Domain.');
  } else {
    console.log(`  Control B surprise: unmodified gcd(12,8) did NOT hit E_Domain (errNo=${errName(resultB.errNo)}).`);
  }

  if (op1MatchesExpected_C) {
    console.log('  Test C PASSED — intercepted gcd(1200,8) = 8.');
  } else {
    console.log(`  Test C: gcd(1200,8) produced ${decodeBcdRealBytes(resultC.finalOp1)} (errNo=${errName(resultC.errNo)}).`);
  }

  console.log('\nDone.');
}

try {
  main();
} catch (err) {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
}
