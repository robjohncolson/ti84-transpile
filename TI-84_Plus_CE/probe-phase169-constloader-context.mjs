#!/usr/bin/env node

/**
 * Phase 169 - ConstLoader at 0x07FA74 — Context-Dependency Check
 *
 * 1. Dump and disassemble ROM bytes at 0x07FA74-0x07FAA5.
 * 2. During gcd(12,8), intercept every call to 0x07FA74 and log registers + OP state.
 * 3. Standalone tests: call 0x07FA74 with HL pointing to OP1 vs OP2,
 *    and test alternate entry points 0x07FA95, 0x07FA9A, 0x07FA9F.
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
const OP3_ADDR = 0xd0060e; // 9 bytes after OP2

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

const CONSTLOADER_ADDR = 0x07fa74;
const CONSTLOADER_ALT1 = 0x07fa95;
const CONSTLOADER_ALT2 = 0x07fa9a;
const CONSTLOADER_ALT3 = 0x07fa9f;
const CONSTLOADER_END = 0x07faa5;

const MEMINIT_BUDGET = 100000;
const MAX_LOOP_ITER = 8192;
const MAX_STEPS = 5000;

// --- FP encodings ---

const FP = {
  12: [0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  8:  [0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
};

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

// ==============================================================
// Part 1: ROM byte dump and disassembly of 0x07FA74-0x07FAA5
// ==============================================================

function part1_romDump() {
  console.log('='.repeat(70));
  console.log('PART 1: ROM byte dump at 0x07FA74-0x07FAA5 (50 bytes)');
  console.log('='.repeat(70));
  console.log('');

  const start = CONSTLOADER_ADDR;
  const end = CONSTLOADER_END + 1; // inclusive
  const bytes = Array.from(romBytes.subarray(start, end), (b) => b & 0xff);

  // Hex dump in rows of 16
  for (let i = 0; i < bytes.length; i += 16) {
    const slice = bytes.slice(i, Math.min(i + 16, bytes.length));
    const addr = start + i;
    console.log(`  ${hex(addr)}: ${slice.map(b => hexByte(b)).join(' ')}`);
  }
  console.log('');

  // Known entry points
  console.log('  Known entry points:');
  console.log(`    0x07FA74 — main ConstLoader entry`);
  console.log(`    0x07FA95 — alternate entry 1`);
  console.log(`    0x07FA9A — alternate entry 2`);
  console.log(`    0x07FA9F — alternate entry 3`);
  console.log('');

  // Identify what each byte offset means relative to the entry points
  const offsets = [
    { addr: 0x07FA74, label: 'main' },
    { addr: 0x07FA95, label: 'alt1' },
    { addr: 0x07FA9A, label: 'alt2' },
    { addr: 0x07FA9F, label: 'alt3' },
  ];

  for (const { addr, label } of offsets) {
    const offset = addr - start;
    const localBytes = bytes.slice(offset, Math.min(offset + 10, bytes.length));
    console.log(`  Bytes at ${hex(addr)} (${label}): ${localBytes.map(b => hexByte(b)).join(' ')}`);
  }
  console.log('');

  return bytes;
}

// ==============================================================
// Part 2: Dynamic intercept during gcd(12,8)
// ==============================================================

function part2_gcdIntercept(runtime) {
  console.log('='.repeat(70));
  console.log('PART 2: Intercept ConstLoader during gcd(12,8)');
  console.log('='.repeat(70));
  console.log('');

  const { mem, executor, cpu } = runtime;

  prepareCallState(cpu, mem);
  seedGcdFpState(mem, FP[12], FP[8]);

  // Push OP2 to FPS
  const fpsPtr = read24(mem, FPS_ADDR);
  const op2Copy = readBytes(mem, OP2_ADDR, 9);
  for (let i = 0; i < 9; i++) {
    mem[fpsPtr + i] = op2Copy[i];
  }
  write24(mem, FPS_ADDR, fpsPtr + 9);

  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  console.log(`  Entry OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9))}`);
  console.log(`  Entry OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9))}`);
  console.log('');

  const constLoaderAddrs = new Set([
    CONSTLOADER_ADDR,
    CONSTLOADER_ALT1,
    CONSTLOADER_ALT2,
    CONSTLOADER_ALT3,
  ]);

  const interceptLog = [];
  let stepCount = 0;
  let outcome = 'budget';

  try {
    executor.runFrom(GCD_ENTRY, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,

      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);

        if (constLoaderAddrs.has(norm)) {
          const entry = {
            step: stepCount,
            pc: norm,
            hl: cpu._hl & 0xffffff,
            a: cpu.a & 0xff,
            de: (typeof cpu._de === 'number' ? cpu._de : 0) & 0xffffff,
            bc: (typeof cpu._bc === 'number' ? cpu._bc : 0) & 0xffffff,
            op1_before: readBytes(mem, OP1_ADDR, 9),
            op2_before: readBytes(mem, OP2_ADDR, 9),
          };
          interceptLog.push(entry);
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

  const errNo = mem[ERR_NO_ADDR] & 0xff;
  console.log(`  Outcome: ${outcome}, steps: ${stepCount}, errNo: ${hexByte(errNo)} (${errName(errNo)})`);
  console.log(`  Final OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9))}`);
  console.log(`  Final OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9))}`);
  console.log('');

  console.log(`  ConstLoader intercepts: ${interceptLog.length}`);
  for (let i = 0; i < interceptLog.length; i++) {
    const e = interceptLog[i];
    const hlTarget = e.hl === OP1_ADDR ? 'OP1' :
                     e.hl === OP2_ADDR ? 'OP2' :
                     e.hl === OP3_ADDR ? 'OP3' :
                     `unknown(${hex(e.hl)})`;
    console.log(`    [${i}] step=${e.step} PC=${hex(e.pc)} HL=${hex(e.hl)} (${hlTarget}) A=${hexByte(e.a)} DE=${hex(e.de)} BC=${hex(e.bc)}`);
    console.log(`        OP1 before: [${formatBytes(e.op1_before)}] = ${decodeBcdRealBytes(e.op1_before)}`);
    console.log(`        OP2 before: [${formatBytes(e.op2_before)}] = ${decodeBcdRealBytes(e.op2_before)}`);
  }
  console.log('');

  return interceptLog;
}

// ==============================================================
// Part 3: Standalone ConstLoader tests
// ==============================================================

function part3_standaloneTests(runtime) {
  console.log('='.repeat(70));
  console.log('PART 3: Standalone ConstLoader calls');
  console.log('='.repeat(70));
  console.log('');

  const { mem, executor, cpu } = runtime;

  const tests = [
    { label: '0x07FA74 with HL=OP2', entry: CONSTLOADER_ADDR, hl: OP2_ADDR },
    { label: '0x07FA74 with HL=OP1', entry: CONSTLOADER_ADDR, hl: OP1_ADDR },
    { label: '0x07FA95 (alt1)',      entry: CONSTLOADER_ALT1, hl: null },
    { label: '0x07FA9A (alt2)',      entry: CONSTLOADER_ALT2, hl: null },
    { label: '0x07FA9F (alt3)',      entry: CONSTLOADER_ALT3, hl: null },
  ];

  const STANDALONE_RET = 0x7ffff0;

  for (const t of tests) {
    console.log(`  --- ${t.label} ---`);

    prepareCallState(cpu, mem);
    seedAllocator(mem);

    // Clear OP1 and OP2 to all zeros
    mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
    mem.fill(0x00, OP2_ADDR, OP2_ADDR + 9);

    // Set HL if specified
    if (t.hl !== null) {
      cpu._hl = t.hl;
    }

    // Set some distinctive register values to check context sensitivity
    cpu.a = 0x42;
    cpu._de = 0xd00700;
    cpu._bc = 0x001234;

    // Push return address
    cpu.sp -= 3;
    write24(mem, cpu.sp, STANDALONE_RET);

    console.log(`    Entry: HL=${hex(cpu._hl)} A=${hexByte(cpu.a)} DE=${hex(cpu._de)} BC=${hex(cpu._bc)}`);
    console.log(`    OP1 before: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}]`);
    console.log(`    OP2 before: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}]`);

    let stepCount = 0;
    let outcome = 'budget';

    try {
      executor.runFrom(t.entry, 'adl', {
        maxSteps: 200,
        maxLoopIterations: 100,

        onBlock(pc, mode, meta, step) {
          const norm = pc & 0xffffff;
          stepCount = noteStep(stepCount, step);
          if (norm === STANDALONE_RET) throw new Error('__RET__');
        },

        onMissingBlock(pc, mode, step) {
          const norm = pc & 0xffffff;
          stepCount = noteStep(stepCount, step);
          if (norm === STANDALONE_RET) throw new Error('__RET__');
        },
      });
    } catch (err) {
      if (err?.message === '__RET__') outcome = 'return';
      else {
        outcome = 'threw';
        console.log(`    Thrown: ${(err?.stack || String(err)).split('\n')[0]}`);
      }
    }

    const op1After = readBytes(mem, OP1_ADDR, 9);
    const op2After = readBytes(mem, OP2_ADDR, 9);

    console.log(`    Outcome: ${outcome}, steps: ${stepCount}`);
    console.log(`    HL after: ${hex(cpu._hl)}`);
    console.log(`    OP1 after: [${formatBytes(op1After)}] = ${decodeBcdRealBytes(op1After)}`);
    console.log(`    OP2 after: [${formatBytes(op2After)}] = ${decodeBcdRealBytes(op2After)}`);

    // Check what was written where
    const op1Changed = !op1After.every(b => b === 0);
    const op2Changed = !op2After.every(b => b === 0);
    console.log(`    OP1 changed: ${op1Changed}`);
    console.log(`    OP2 changed: ${op2Changed}`);

    if (op1Changed) {
      console.log(`    OP1 value: ${decodeBcdRealBytes(op1After)}`);
    }
    if (op2Changed) {
      console.log(`    OP2 value: ${decodeBcdRealBytes(op2After)}`);
    }

    console.log('');
  }
}

// --- Main ---

function main() {
  console.log('=== Phase 169: ConstLoader Context-Dependency Check ===');
  console.log('');

  // Part 1: ROM dump (no runtime needed)
  part1_romDump();

  // Part 2 & 3: need runtime
  const runtime = createPreparedRuntime();

  if (!runtime.memInitOk) {
    console.log('MEM_INIT failed; aborting.');
    process.exitCode = 1;
    return;
  }

  console.log('Cold boot + MEM_INIT complete.');
  console.log('');

  part2_gcdIntercept(runtime);
  part3_standaloneTests(runtime);

  console.log('='.repeat(70));
  console.log('Done.');
  console.log('='.repeat(70));
}

try {
  main();
} catch (err) {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
}
