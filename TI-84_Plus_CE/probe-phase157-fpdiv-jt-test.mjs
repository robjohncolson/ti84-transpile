#!/usr/bin/env node

/**
 * Phase 157 - FPDiv JT slot test
 *
 * Tests FPDiv(12, 8) = 1.5 via the JT slot at 0x0201F4
 * (not the implementation address 0x07CAB9).
 *
 * Session 156 discovered that 0x0201F4 was a missing block
 * that fell through to SqRoot at 0x0201F8. Session 157 P4
 * added the seed so the JT slot gets its own block (JP 0x07CAB9).
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

// JT slot address (the seed we just added)
const FPDIV_JT_ADDR = 0x0201f4;
const FAKE_RET = 0x7eedf3;
const ERR_CATCH_ADDR = 0x7ffffa;

const MAX_LOOP_ITER = 8192;
const MAX_STEPS = 2000;
const FPS_CLEAN_AREA = 0xd1aa00;

// BCD operands: 12.0 and 8.0
const BCD_12 = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_8  = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

// Expected result: 1.5
const EXPECTED_1_5 = [0x00, 0x80, 0x15, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];

// --- Helpers ---

const hex = (value, width = 6) =>
  value === undefined || value === null
    ? 'null'
    : `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

const hexByte = (value) =>
  (value & 0xff).toString(16).toUpperCase().padStart(2, '0');

function formatBytes(bytes) {
  return bytes.map((b) => hexByte(b)).join(' ');
}

function read24(mem, addr) {
  return ((mem[addr] & 0xff) |
    ((mem[addr + 1] & 0xff) << 8) |
    ((mem[addr + 2] & 0xff) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

function readBytes(mem, addr, len) {
  return Array.from(mem.subarray(addr, addr + len), (b) => b & 0xff);
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

function runMemInit(executor, cpu, mem) {
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);

  let ok = false;
  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: 100000,
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

// --- Main ---

function main() {
  console.log('=== Phase 157: FPDiv JT slot test — entry at 0x0201F4 ===');
  console.log('Test: FPDiv(12, 8) via JT slot should return 1.5');
  console.log('');

  const { mem, executor, cpu } = createRuntime();

  // Verify the JT slot block exists
  const jtKey = '0201f4:adl';
  const hasBlock = jtKey in BLOCKS;
  console.log(`JT slot block "${jtKey}" exists: ${hasBlock}`);

  if (!hasBlock) {
    console.log('FAIL: JT slot block not found. The seed was not transpiled.');
    process.exitCode = 1;
    return;
  }

  // Check ROM bytes at 0x0201F4 (should be JP nn = C3 xx xx xx)
  const romAt = readBytes(romBytes, 0x0201f4, 4);
  console.log(`ROM bytes at 0x0201F4: [${formatBytes(romAt)}]`);
  console.log('');

  coldBoot(executor, cpu, mem);

  if (!runMemInit(executor, cpu, mem)) {
    console.log('FAIL: MEM_INIT failed');
    process.exitCode = 1;
    return;
  }

  // Prepare for FPDiv call
  prepareCallState(cpu, mem);

  // Seed allocator and FPS
  seedAllocator(mem);
  mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 0x40);
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA);

  // Seed OP1=12.0 and OP2=8.0
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 11);
  mem.fill(0x00, OP2_ADDR, OP2_ADDR + 11);
  mem.set(BCD_12, OP1_ADDR);
  mem.set(BCD_8, OP2_ADDR);

  // Push FAKE_RET on stack
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  // Seed error frame
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  console.log(`OP1 before: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}]  (12.0)`);
  console.log(`OP2 before: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}]  (8.0)`);
  console.log(`Entry: ${hex(FPDIV_JT_ADDR)} (JT slot)`);
  console.log('');

  // Run FPDiv via JT slot
  let outcome = 'budget';
  let stepCount = 0;
  const visitedPCs = [];

  try {
    executor.runFrom(FPDIV_JT_ADDR, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = typeof step === 'number' ? Math.max(stepCount, step + 1) : stepCount + 1;
        if (visitedPCs.length < 10) visitedPCs.push(norm);
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = typeof step === 'number' ? Math.max(stepCount, step + 1) : stepCount + 1;
        if (visitedPCs.length < 10) visitedPCs.push(norm);
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
      throw error;
    }
  }

  const finalOp1 = readBytes(mem, OP1_ADDR, 9);
  const finalOp2 = readBytes(mem, OP2_ADDR, 9);
  const errNo = mem[ERR_NO_ADDR] & 0xff;

  console.log(`Outcome: ${outcome}  Steps: ${stepCount}  errNo: ${hexByte(errNo)} (${errName(errNo)})`);
  console.log(`First PCs visited: ${visitedPCs.map(pc => hex(pc)).join(' -> ')}`);
  console.log('');
  console.log(`OP1 after:  [${formatBytes(finalOp1)}]`);
  console.log(`OP2 after:  [${formatBytes(finalOp2)}]`);
  console.log(`Expected:   [${formatBytes(EXPECTED_1_5)}]  (1.5)`);
  console.log('');

  // Check result
  const match = formatBytes(finalOp1) === formatBytes(EXPECTED_1_5);
  const noError = errNo === 0x00;
  const returned = outcome === 'return';

  console.log('=== Results ===');
  console.log(`FPDiv returned cleanly:  ${returned ? 'PASS' : 'FAIL'} (outcome=${outcome})`);
  console.log(`No error raised:         ${noError ? 'PASS' : 'FAIL'} (errNo=${hexByte(errNo)})`);
  console.log(`OP1 = 1.5:               ${match ? 'PASS' : 'FAIL'}`);
  console.log('');

  if (returned && noError && match) {
    console.log('ALL PASS: FPDiv via JT slot 0x0201F4 works correctly.');
  } else {
    console.log('SOME TESTS FAILED.');
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
