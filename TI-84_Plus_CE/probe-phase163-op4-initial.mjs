#!/usr/bin/env node

/**
 * Phase 163 - OP4 Initial State Probe
 *
 * Part A: Track OP4 changes from gcd entry to step 185
 * Part B: Check if OP1→OP4 and OP4→OP2 are in the same block
 * Part C: Test with OP4 pre-loaded to 8.0 (raw divisor)
 * Part D: Test with OP4 pre-loaded to 800 (scaled divisor)
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
const OP3_ADDR = 0xd0060e;
const OP4_ADDR = 0xd00619;
const OP5_ADDR = 0xd00624;

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
const MAX_STEPS = 2000;

const BCD_12 = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_8  = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_800 = Uint8Array.from([0x00, 0x83, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const SENTINEL = Uint8Array.from([0xAA, 0xBB, 0xCC, 0xDD, 0xEE, 0xFF, 0x11, 0x22, 0x33]);

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

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
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

// --- Address labels ---

const ADDR_LABELS = new Map([
  [0x07c747, 'OP1toOP2_entry'],
  [0x07c771, 'FPSub'],
  [0x07c77f, 'FPAdd'],
  [0x07ca06, 'InvOP1S'],
  [0x07ca48, 'Normalize'],
  [0x07cab9, 'FPDiv_entry'],
  [0x07cc36, 'FPAddSub_core'],
  [0x07f8a2, 'OP1toOP4'],
  [0x07f8b6, 'OP4toOP2'],
  [0x07f8fa, 'Mov9_OP1toOP2'],
  [0x07f95e, 'OP1toOP3'],
  [0x07fa86, 'ConstLoader_1.0'],
  [0x07fb33, 'Shl14'],
  [0x07fd4a, 'ValidityCheck_OP1'],
  [0x07fdf1, 'DecExp'],
  [0x080188, 'JmpThru'],
  [0x068d3d, 'gcd_entry'],
  [0x068d61, 'gcd_call_OP1toOP2'],
  [0x068d82, 'gcd_algo_body'],
  [0x068d8d, 'gcd_OP1toOP3'],
  [0x068d91, 'gcd_OP1toOP5'],
  [0x068d95, 'gcd_after_OP1toOP5'],
  [0x068da1, 'gcd_error_check'],
  [0x068dea, 'gcd_JP_NC_ErrDomain'],
]);

function addrLabel(addr) {
  const label = ADDR_LABELS.get(addr);
  return label ? ` [${label}]` : '';
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

function pushOp2ToFps(mem) {
  const fpsPtr = read24(mem, FPS_ADDR);
  const op2Bytes = readBytes(mem, OP2_ADDR, 9);
  for (let i = 0; i < 9; i++) {
    mem[fpsPtr + i] = op2Bytes[i];
  }
  write24(mem, FPS_ADDR, fpsPtr + 9);
}

// ==========================================================================
// Part A: OP4 state monitoring from gcd entry to step 185
// ==========================================================================

function partA(runtime) {
  const { mem, executor, cpu } = runtime;

  console.log(`\n${'='.repeat(70)}`);
  console.log('PART A: OP4 state at gcd entry and changes before step 185');
  console.log(`${'='.repeat(70)}`);

  prepareCallState(cpu, mem);
  seedGcdFpState(mem);

  // Set OP4 to sentinel value
  mem.set(SENTINEL, OP4_ADDR);

  pushOp2ToFps(mem);
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  const initialOp4 = readBytes(mem, OP4_ADDR, 9);
  console.log(`  Initial OP4 (sentinel): [${formatBytes(initialOp4)}]`);
  console.log(`  OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9))}`);
  console.log(`  OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9))}`);
  console.log('');

  let stepCount = 0;
  let prevOp4 = [...initialOp4];
  const op4Changes = [];
  let outcome = 'budget';

  try {
    executor.runFrom(GCD_ENTRY, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,

      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);

        // Check OP4 for changes
        const currentOp4 = readBytes(mem, OP4_ADDR, 9);
        if (!bytesEqual(currentOp4, prevOp4)) {
          const decoded = decodeBcdRealBytes(currentOp4);
          op4Changes.push({
            step: stepCount,
            pc: norm,
            bytes: [...currentOp4],
            decoded,
          });
          console.log(`  OP4 CHANGED at step ${stepCount}, PC=${hex(norm)}${addrLabel(norm)}: [${formatBytes(currentOp4)}] = ${decoded}`);
          prevOp4 = [...currentOp4];
        }

        // Also log OP1, OP2, OP4 at key addresses
        if (norm === 0x07f8a2 || norm === 0x07f8b6) {
          const op1 = readBytes(mem, OP1_ADDR, 9);
          const op2 = readBytes(mem, OP2_ADDR, 9);
          const op4 = readBytes(mem, OP4_ADDR, 9);
          console.log(`  Step ${stepCount}: PC=${hex(norm)}${addrLabel(norm)}`);
          console.log(`    OP1=[${formatBytes(op1)}] = ${decodeBcdRealBytes(op1)}`);
          console.log(`    OP2=[${formatBytes(op2)}] = ${decodeBcdRealBytes(op2)}`);
          console.log(`    OP4=[${formatBytes(op4)}] = ${decodeBcdRealBytes(op4)}`);
        }

        // Stop at step 186 (after step 185 OP1→OP4 and step 186 OP4→OP2)
        if (stepCount > 190) throw new Error('__STOP__');

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },

      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);

        const currentOp4 = readBytes(mem, OP4_ADDR, 9);
        if (!bytesEqual(currentOp4, prevOp4)) {
          const decoded = decodeBcdRealBytes(currentOp4);
          op4Changes.push({
            step: stepCount,
            pc: norm,
            bytes: [...currentOp4],
            decoded,
          });
          console.log(`  OP4 CHANGED at step ${stepCount}, PC=${hex(norm)}${addrLabel(norm)} [MISSING]: [${formatBytes(currentOp4)}] = ${decoded}`);
          prevOp4 = [...currentOp4];
        }

        if (stepCount > 190) throw new Error('__STOP__');

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
    });
  } catch (err) {
    if (err?.message === '__RET__') outcome = 'return';
    else if (err?.message === '__ERR__') outcome = 'error';
    else if (err?.message === '__STOP__') outcome = 'stopped at step ~190';
    else {
      outcome = 'threw';
      console.log(`  Thrown: ${(err?.stack || String(err)).split('\n')[0]}`);
    }
  }

  const finalOp4 = readBytes(mem, OP4_ADDR, 9);
  console.log('');
  console.log(`  PART A SUMMARY:`);
  console.log(`  Outcome: ${outcome}`);
  console.log(`  Steps executed: ${stepCount}`);
  console.log(`  OP4 changes detected: ${op4Changes.length}`);
  for (const change of op4Changes) {
    console.log(`    Step ${change.step}, PC=${hex(change.pc)}${addrLabel(change.pc)}: [${formatBytes(change.bytes)}] = ${change.decoded}`);
  }
  console.log(`  Final OP4: [${formatBytes(finalOp4)}] = ${decodeBcdRealBytes(finalOp4)}`);
  console.log(`  Final OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9))}`);
  console.log(`  Final OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9))}`);
  console.log(`  errNo: ${hexByte(mem[ERR_NO_ADDR] & 0xff)} (${errName(mem[ERR_NO_ADDR] & 0xff)})`);
}

// ==========================================================================
// Part B: Check ROM bytes at 0x068D8D for CALL structure
// ==========================================================================

function partB() {
  console.log(`\n${'='.repeat(70)}`);
  console.log('PART B: ROM bytes at 0x068D8D — block structure around OP1→OP4 / OP4→OP2 calls');
  console.log(`${'='.repeat(70)}`);

  // Dump ROM bytes around 0x068D8D to see what instructions are there
  // Also check 0x07F8A2 (OP1→OP4) and 0x07F8B6 (OP4→OP2)
  const regions = [
    { label: 'gcd block 0x068D82-0x068DB0', start: 0x068D82, len: 0x2E },
    { label: 'OP1toOP4 @ 0x07F8A2-0x07F8C0', start: 0x07F8A2, len: 0x1E },
    { label: 'OP4toOP2 @ 0x07F8B6-0x07F8D0', start: 0x07F8B6, len: 0x1A },
  ];

  for (const { label, start, len } of regions) {
    const bytes = Array.from(romBytes.subarray(start, start + len), (b) => b & 0xff);
    console.log(`\n  ${label}:`);
    // Print in rows of 16
    for (let i = 0; i < bytes.length; i += 16) {
      const chunk = bytes.slice(i, Math.min(i + 16, bytes.length));
      const addr = start + i;
      console.log(`    ${hex(addr)}: ${formatBytes(chunk)}`);
    }
  }

  // Specifically look for CALL instructions (0xCD = CALL nn in eZ80 ADL)
  // In eZ80 ADL mode: CD xx xx xx = CALL addr24
  console.log('\n  Looking for CALL instructions in gcd block 0x068D82-0x068DB0:');
  for (let i = 0x068D82; i < 0x068DB0; i++) {
    if ((romBytes[i] & 0xff) === 0xCD) {
      const target = ((romBytes[i + 1] & 0xff) | ((romBytes[i + 2] & 0xff) << 8) | ((romBytes[i + 3] & 0xff) << 16)) >>> 0;
      console.log(`    ${hex(i)}: CALL ${hex(target)}${addrLabel(target)}`);
    }
  }

  // Check if 0x07F8A2 and 0x07F8B6 are called from the same block
  console.log('\n  Key question: are OP1→OP4 (0x07F8A2) and OP4→OP2 (0x07F8B6) called from the SAME block?');
  console.log('  (If same block, the transpiled JS executes both sequentially in one step.)');
  console.log('  (If separate blocks, they are separate steps and OP4 is read AFTER OP1→OP4 writes it.)');
}

// ==========================================================================
// Part C: Test with OP4 pre-loaded to 8.0
// ==========================================================================

function partC(runtime) {
  const { mem, executor, cpu } = runtime;

  console.log(`\n${'='.repeat(70)}`);
  console.log('PART C: gcd(12,8) with OP4 pre-loaded to 8.0');
  console.log(`${'='.repeat(70)}`);

  prepareCallState(cpu, mem);
  seedGcdFpState(mem);

  // Pre-load OP4 = 8.0
  seedRealRegister(mem, OP4_ADDR, BCD_8);

  pushOp2ToFps(mem);
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  console.log(`  OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9))}`);
  console.log(`  OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9))}`);
  console.log(`  OP4: [${formatBytes(readBytes(mem, OP4_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP4_ADDR, 9))}`);
  console.log('');

  let stepCount = 0;
  let outcome = 'budget';

  try {
    executor.runFrom(GCD_ENTRY, 'adl', {
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

  console.log(`  PART C SUMMARY:`);
  console.log(`  Outcome: ${outcome}`);
  console.log(`  Steps: ${stepCount}`);
  console.log(`  Final OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9))}`);
  console.log(`  Final OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9))}`);
  console.log(`  Final OP4: [${formatBytes(readBytes(mem, OP4_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP4_ADDR, 9))}`);
  console.log(`  errNo: ${hexByte(mem[ERR_NO_ADDR] & 0xff)} (${errName(mem[ERR_NO_ADDR] & 0xff)})`);

  if (outcome === 'error') {
    console.log(`  >>> Pre-loading OP4=8.0 did NOT fix the gcd algorithm (still errors) <<<`);
  } else if (outcome === 'return') {
    const result = decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9));
    console.log(`  >>> Pre-loading OP4=8.0 CHANGED the outcome! Result in OP1: ${result} <<<`);
    if (result === '4') {
      console.log(`  >>> CORRECT! gcd(12,8) = 4. Pre-loading OP4 FIXES the algorithm! <<<`);
    }
  }
}

// ==========================================================================
// Part D: Test with OP4 pre-loaded to 800 (scaled divisor)
// ==========================================================================

function partD(runtime) {
  const { mem, executor, cpu } = runtime;

  console.log(`\n${'='.repeat(70)}`);
  console.log('PART D: gcd(12,8) with OP4 pre-loaded to 800 (scaled divisor)');
  console.log(`${'='.repeat(70)}`);

  prepareCallState(cpu, mem);
  seedGcdFpState(mem);

  // Pre-load OP4 = 800
  seedRealRegister(mem, OP4_ADDR, BCD_800);

  pushOp2ToFps(mem);
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  console.log(`  OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9))}`);
  console.log(`  OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9))}`);
  console.log(`  OP4: [${formatBytes(readBytes(mem, OP4_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP4_ADDR, 9))}`);
  console.log('');

  let stepCount = 0;
  let outcome = 'budget';

  try {
    executor.runFrom(GCD_ENTRY, 'adl', {
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

  console.log(`  PART D SUMMARY:`);
  console.log(`  Outcome: ${outcome}`);
  console.log(`  Steps: ${stepCount}`);
  console.log(`  Final OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9))}`);
  console.log(`  Final OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9))}`);
  console.log(`  Final OP4: [${formatBytes(readBytes(mem, OP4_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP4_ADDR, 9))}`);
  console.log(`  errNo: ${hexByte(mem[ERR_NO_ADDR] & 0xff)} (${errName(mem[ERR_NO_ADDR] & 0xff)})`);

  if (outcome === 'error') {
    console.log(`  >>> Pre-loading OP4=800 did NOT fix the gcd algorithm (still errors) <<<`);
  } else if (outcome === 'return') {
    const result = decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9));
    console.log(`  >>> Pre-loading OP4=800 CHANGED the outcome! Result in OP1: ${result} <<<`);
    if (result === '4') {
      console.log(`  >>> CORRECT! gcd(12,8) = 4. Pre-loading OP4=800 FIXES the algorithm! <<<`);
    }
  }
}

// --- Main ---

function main() {
  console.log('=== Phase 163: OP4 Initial State Probe ===');
  console.log('');

  const runtime = createPreparedRuntime();

  if (!runtime.memInitOk) {
    console.log('MEM_INIT failed; aborting.');
    process.exitCode = 1;
    return;
  }

  console.log('Cold boot + MEM_INIT complete.');

  partA(runtime);
  partB();
  partC(runtime);
  partD(runtime);

  console.log('\nDone.');
  process.exitCode = 0;
}

try {
  main();
} catch (err) {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
}
