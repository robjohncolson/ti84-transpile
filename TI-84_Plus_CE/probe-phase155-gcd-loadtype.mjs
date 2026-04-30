#!/usr/bin/env node

/**
 * Phase 155 - Investigate gcd_LoadType (0x068ECF) and HL=100 loader (0x0AF8C4).
 *
 * Part A: Disassemble and trace gcd_LoadType during gcd(12,8)
 * Part B: Investigate what type 0x0D means
 * Part C: Test 0x0AF8C4 (HL=100 loader) standalone
 * Part D: Check call chain 0x068ECF -> 0x0AF8A5 -> 0x07F831
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_BIN_PATH = path.join(__dirname, 'ROM.rom');
const ROM_TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

if (!fs.existsSync(ROM_BIN_PATH)) {
  throw new Error(`ROM binary not found: ${ROM_BIN_PATH}`);
}

if (!fs.existsSync(ROM_TRANSPILED_PATH)) {
  throw new Error(
    'ROM.transpiled.js not found. Run `node scripts/transpile-ti84-rom.mjs` first.'
  );
}

const romBytes = fs.readFileSync(ROM_BIN_PATH);
const romModule = await import(pathToFileURL(ROM_TRANSPILED_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS ?? romModule.blocks;

if (!BLOCKS) {
  throw new Error('Unable to locate PRELIFTED_BLOCKS in ROM.transpiled.js');
}

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

const GCD_DIRECT_ADDR = 0x068d3d;
const GCD_CATEGORY = 0x28;

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const MEMINIT_BUDGET = 100000;
const MAX_LOOP_ITER = 8192;
const MAX_STEPS = 5000;

const FPS_CLEAN_AREA = 0xd1aa00;

const GCD_LOADTYPE_ADDR = 0x068ecf;
const HL100_LOADER_ADDR = 0x0af8c4;
const LD_TYPE_IMM_ADDR = 0x0af8a5;
const TYPE_VALIDATOR_ADDR = 0x07f831;

const BCD_12 = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_8 = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const hex = (value, width = 6) =>
  value === undefined || value === null
    ? null
    : `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

function read24(mem, addr) {
  return ((mem[addr] & 0xff) | ((mem[addr + 1] & 0xff) << 8) | ((mem[addr + 2] & 0xff) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

function readBytes(mem, addr, len) {
  return Array.from(mem.subarray(addr, addr + len), (byte) => byte & 0xff);
}

function formatBytes(bytes) {
  return bytes
    .map((byte) => (byte & 0xff).toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function decodeBcdRealBytes(bytes) {
  const type = bytes[0] & 0xff;
  const exponentByte = bytes[1] & 0xff;
  const digits = [];

  for (let i = 2; i < 9; i += 1) {
    const byte = bytes[i] & 0xff;
    digits.push((byte >> 4) & 0x0f, byte & 0x0f);
  }

  if (digits.every((digit) => digit === 0)) {
    return '0';
  }

  if (digits.some((digit) => digit > 9)) {
    return `invalid-bcd(type=${formatBytes([type])},exp=${formatBytes([exponentByte])})`;
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

  if (rendered.startsWith('.')) {
    rendered = `0${rendered}`;
  }

  if (rendered === '') {
    rendered = '0';
  }

  if ((type & 0x80) !== 0 && rendered !== '0') {
    rendered = `-${rendered}`;
  }

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
  if (typeof step === 'number') {
    return Math.max(stepCount, step + 1);
  }
  return stepCount + 1;
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

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

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

function seedGcdFpState(mem) {
  seedAllocator(mem);
  mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 0x40);
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA);
  seedRealRegister(mem, OP1_ADDR, BCD_12);
  seedRealRegister(mem, OP2_ADDR, BCD_8);
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
  } catch (error) {
    if (error?.message === '__RET__') {
      ok = true;
    } else {
      throw error;
    }
  }

  return ok;
}

function createPreparedRuntime() {
  const runtime = createRuntime();
  coldBoot(runtime.executor, runtime.cpu, runtime.mem);
  const memInitOk = runMemInit(runtime.executor, runtime.cpu, runtime.mem);
  return { ...runtime, memInitOk };
}

// ========== Part A: Disassemble ROM bytes ==========

function disassembleRomRegion(startAddr, length, label) {
  console.log(`\n=== ${label}: ROM bytes at ${hex(startAddr)} (${length} bytes) ===`);
  const bytes = [];
  for (let i = 0; i < length; i++) {
    bytes.push(romBytes[startAddr + i] & 0xff);
  }
  // Print raw hex dump in rows of 16
  for (let i = 0; i < bytes.length; i += 16) {
    const row = bytes.slice(i, i + 16);
    const addr = startAddr + i;
    console.log(
      `  ${hex(addr)}: ${row.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}`
    );
  }
  return bytes;
}

function checkBlockExists(addr) {
  const key = `block_0x${addr.toString(16).padStart(6, '0')}`;
  const exists = typeof BLOCKS[key] === 'function';
  console.log(`  Block ${key}: ${exists ? 'EXISTS' : 'MISSING'}`);
  return exists;
}

// ========== Part C: Standalone HL=100 loader test ==========

function testHL100Loader(executor, cpu, mem) {
  console.log('\n=== Part C: Standalone test of 0x0AF8C4 (HL=100 loader) ===');

  prepareCallState(cpu, mem);
  seedAllocator(mem);
  mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 0x40);
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA);

  // Clear OP1
  seedRealRegister(mem, OP1_ADDR, Uint8Array.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));

  // Set HL = 100 (0x64)
  cpu._hl = 0x000064;

  // Push return address
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  let outcome = 'budget';
  let stepCount = 0;
  let lastMissing = null;

  try {
    executor.runFrom(HL100_LOADER_ADDR, 'adl', {
      maxSteps: 500,
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
        lastMissing = norm;
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
    });
  } catch (error) {
    if (error?.message === '__RET__') {
      outcome = 'return';
    } else if (error?.message === '__ERR__') {
      outcome = 'error';
    } else {
      outcome = 'threw';
      console.log(`  Threw: ${error?.message}`);
    }
  }

  const op1 = readBytes(mem, OP1_ADDR, 9);
  const expected100 = [0x00, 0x82, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  const match = op1.every((b, i) => b === expected100[i]);

  console.log(`  Outcome: ${outcome}`);
  console.log(`  Steps: ${stepCount}`);
  console.log(`  OP1 after: ${formatBytes(op1)} = ${decodeBcdRealBytes(op1)}`);
  console.log(`  Expected:  ${formatBytes(expected100)} = 100`);
  console.log(`  Match: ${match}`);
  console.log(`  Last missing block: ${hex(lastMissing)}`);

  return { outcome, op1Hex: formatBytes(op1), op1Value: decodeBcdRealBytes(op1), match, lastMissing };
}

// ========== Main ==========

function main() {
  // ---- Part A + D: Disassembly and block checks ----
  console.log('=== Part A: Disassemble gcd_LoadType (0x068ECF) ===');
  disassembleRomRegion(GCD_LOADTYPE_ADDR, 65, 'gcd_LoadType (0x068ECF)');

  console.log('\n=== Part D: Check call chain block existence ===');
  console.log('  gcd_LoadType (0x068ECF):');
  checkBlockExists(GCD_LOADTYPE_ADDR);
  console.log('  LD_type_imm (0x0AF8A5):');
  checkBlockExists(LD_TYPE_IMM_ADDR);
  console.log('  TypeValidator (0x07F831):');
  checkBlockExists(TYPE_VALIDATOR_ADDR);
  console.log('  HL=100 loader (0x0AF8C4):');
  checkBlockExists(HL100_LOADER_ADDR);

  // Also disassemble the call chain targets
  disassembleRomRegion(LD_TYPE_IMM_ADDR, 40, 'LD_type_imm (0x0AF8A5)');
  disassembleRomRegion(TYPE_VALIDATOR_ADDR, 60, 'TypeValidator (0x07F831)');
  disassembleRomRegion(HL100_LOADER_ADDR, 60, 'HL=100 loader (0x0AF8C4)');

  // ---- Part A (continued) + Part B: Trace gcd_LoadType during gcd(12,8) ----
  console.log('\n=== Part A+B: Trace gcd_LoadType calls during gcd(12,8) ===');

  const runtime = createPreparedRuntime();

  if (!runtime.memInitOk) {
    console.log('ERROR: memInit failed');
    process.exitCode = 1;
    return;
  }

  const { mem, executor, cpu } = runtime;
  prepareCallState(cpu, mem);
  seedGcdFpState(mem);
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  let stepCount = 0;
  let outcome = 'budget';
  let lastMissingBlock = null;
  let thrownMessage = null;

  const loadTypeCalls = [];
  let loadTypeCallIndex = 0;

  try {
    executor.runFrom(GCD_DIRECT_ADDR, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);

        if (norm === GCD_LOADTYPE_ADDR) {
          loadTypeCallIndex++;
          const regA = cpu.a & 0xff;
          const op1 = readBytes(mem, OP1_ADDR, 9);
          const op2 = readBytes(mem, OP2_ADDR, 9);
          const flags = cpu.f & 0xff;
          const carryIn = (flags & 0x01) !== 0;

          console.log(`  gcd_LoadType call #${loadTypeCallIndex} at step ${stepCount}:`);
          console.log(`    A = ${hex(regA, 2)} (${regA} decimal)`);
          console.log(`    OP1 = ${formatBytes(op1)} = ${decodeBcdRealBytes(op1)}`);
          console.log(`    OP1[0] (type byte) = ${hex(op1[0], 2)}`);
          console.log(`    OP2 = ${formatBytes(op2)} = ${decodeBcdRealBytes(op2)}`);
          console.log(`    Flags = ${hex(flags, 2)}, carry_in = ${carryIn}`);

          loadTypeCalls.push({
            callIndex: loadTypeCallIndex,
            step: stepCount,
            regA,
            op1Hex: formatBytes(op1),
            op1Value: decodeBcdRealBytes(op1),
            op1TypeByte: op1[0],
            op2Hex: formatBytes(op2),
            op2Value: decodeBcdRealBytes(op2),
            flags,
            carryIn,
          });
        }

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);
        lastMissingBlock = norm;

        if (norm === GCD_LOADTYPE_ADDR) {
          loadTypeCallIndex++;
          const regA = cpu.a & 0xff;
          const op1 = readBytes(mem, OP1_ADDR, 9);
          const op2 = readBytes(mem, OP2_ADDR, 9);
          const flags = cpu.f & 0xff;
          const carryIn = (flags & 0x01) !== 0;

          console.log(`  gcd_LoadType call #${loadTypeCallIndex} (MISSING BLOCK) at step ${stepCount}:`);
          console.log(`    A = ${hex(regA, 2)} (${regA} decimal)`);
          console.log(`    OP1 = ${formatBytes(op1)} = ${decodeBcdRealBytes(op1)}`);
          console.log(`    OP1[0] (type byte) = ${hex(op1[0], 2)}`);
          console.log(`    OP2 = ${formatBytes(op2)} = ${decodeBcdRealBytes(op2)}`);
          console.log(`    Flags = ${hex(flags, 2)}, carry_in = ${carryIn}`);

          loadTypeCalls.push({
            callIndex: loadTypeCallIndex,
            step: stepCount,
            regA,
            op1Hex: formatBytes(op1),
            op1Value: decodeBcdRealBytes(op1),
            op1TypeByte: op1[0],
            op2Hex: formatBytes(op2),
            op2Value: decodeBcdRealBytes(op2),
            flags,
            carryIn,
            missing: true,
          });
        }

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
    });
  } catch (error) {
    if (error?.message === '__RET__') {
      outcome = 'return';
    } else if (error?.message === '__ERR__') {
      outcome = 'error';
    } else {
      outcome = 'threw';
      thrownMessage = error?.stack || String(error);
    }
  }

  const errNo = mem[ERR_NO_ADDR] & 0xff;
  const finalOp1 = readBytes(mem, OP1_ADDR, 9);
  const finalOp2 = readBytes(mem, OP2_ADDR, 9);

  console.log('\n=== GCD run summary ===');
  console.log(`  Outcome: ${outcome}`);
  console.log(`  Steps: ${stepCount}`);
  console.log(`  errNo: ${hex(errNo, 2)} (${errName(errNo)})`);
  console.log(`  Final OP1: ${formatBytes(finalOp1)} = ${decodeBcdRealBytes(finalOp1)}`);
  console.log(`  Final OP2: ${formatBytes(finalOp2)} = ${decodeBcdRealBytes(finalOp2)}`);
  console.log(`  Last missing block: ${hex(lastMissingBlock)}`);
  console.log(`  gcd_LoadType calls observed: ${loadTypeCalls.length}`);
  if (thrownMessage) {
    console.log(`  Thrown: ${thrownMessage.split('\n')[0]}`);
  }

  // ---- Part C: Standalone HL=100 loader test ----
  // Create a fresh runtime for the standalone test
  const runtime2 = createPreparedRuntime();
  if (!runtime2.memInitOk) {
    console.log('\nERROR: memInit failed for standalone test');
  } else {
    testHL100Loader(runtime2.executor, runtime2.cpu, runtime2.mem);
  }

  // ---- Final JSON summary ----
  const summary = {
    partA_loadTypeCalls: loadTypeCalls,
    partA_gcdOutcome: outcome,
    partA_errNo: hex(errNo, 2),
    partA_errName: errName(errNo),
    partA_totalSteps: stepCount,
    partA_finalOp1: formatBytes(finalOp1),
    partA_finalOp1Value: decodeBcdRealBytes(finalOp1),
    partD_blocks: {
      gcd_LoadType_0x068ECF: checkBlockExists(GCD_LOADTYPE_ADDR),
      LD_type_imm_0x0AF8A5: checkBlockExists(LD_TYPE_IMM_ADDR),
      TypeValidator_0x07F831: checkBlockExists(TYPE_VALIDATOR_ADDR),
      HL100_loader_0x0AF8C4: checkBlockExists(HL100_LOADER_ADDR),
    },
    lastMissingBlock: hex(lastMissingBlock),
  };

  console.log('\n=== Final JSON Summary ===');
  console.log(JSON.stringify(summary, null, 2));

  process.exitCode = 1; // gcd still fails, so exit 1
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
