#!/usr/bin/env node

/**
 * Phase 168 - IY Flags Check + Normalization Path Analysis
 *
 * Investigates whether IY system flags (especially bit 3 of IY+0x48) affect
 * the normalization path in the gcd algorithm. The normalization at 0x07CA48
 * always zeros OP1 via the BigShift path (0x07C9AF) in our transpilation,
 * but there's an alternative path through 0x07CA87 that preserves the mantissa.
 *
 * Part A: Dump all IY system flags (IY+0x00 through IY+0x60)
 * Part B: Trace normalization path decisions
 * Part C: Flip IY+0x48 bit 3 and re-run to see if path changes
 * Part D: Boot to homescreen, capture real IY flags, re-run gcd
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
const OP3_ADDR = 0xd0060e;
const OP4_ADDR = 0xd00619;

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

// IY base address
const IY_BASE = 0xd00080;
const IY_FLAGS_LEN = 0x61; // dump IY+0x00 through IY+0x60 inclusive

// Normalization addresses of interest
const NORM_ENTRY = 0x07ca48;     // normalize entry
const NORM_BIGSHIFT = 0x07c9af;  // BigShift path (zeros OP1)
const NORM_ALT_PATH = 0x07ca87;  // exponent combination path (preserves mantissa)
const NORM_SECONDARY = 0x07c9bf; // secondary normalization (checks IY+0x48 bit 3)
const BIGSHIFT_ADDR = 0x07fac2;  // BigShift subroutine

// Boot stages (from probe-phase99d)
const STAGE_1_ENTRY = 0x0a2b72;
const STAGE_2_ENTRY = 0x0a3301;
const STAGE_3_ENTRY = 0x0a29ec;
const STAGE_4_ENTRY = 0x0a2854;
const STAGE_MAX_LOOP_ITERATIONS = 500;

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

// --- Dump IY flags ---

function dumpIyFlags(mem, iyBase, label) {
  console.log(`--- ${label} ---`);
  console.log(`IY base: ${hex(iyBase)}`);
  console.log('');

  // Dump in rows of 16
  for (let offset = 0; offset < IY_FLAGS_LEN; offset += 16) {
    const end = Math.min(offset + 16, IY_FLAGS_LEN);
    const bytes = readBytes(mem, iyBase + offset, end - offset);
    const addr = hex(iyBase + offset);
    const offsetStr = `+${hexByte(offset)}`;
    const byteStr = formatBytes(bytes);
    console.log(`  ${addr} (IY${offsetStr}): ${byteStr}`);
  }
  console.log('');

  // Key flags
  const iy48 = mem[iyBase + 0x48] & 0xff;
  const iy0e = mem[iyBase + 0x0e] & 0xff;
  const iy59 = mem[iyBase + 0x59] & 0xff;

  console.log(`  Key flags:`);
  console.log(`    (IY+0x48) = ${hexByte(iy48)} = ${iy48.toString(2).padStart(8, '0')}b`);
  console.log(`      bit 3 = ${(iy48 >> 3) & 1}  (normalization control?)`);
  console.log(`      bit 0 = ${iy48 & 1}`);
  console.log(`    (IY+0x0E) = ${hexByte(iy0e)} = ${iy0e.toString(2).padStart(8, '0')}b  (FPAdd RES bit)`);
  console.log(`    (IY+0x59) = ${hexByte(iy59)} = ${iy59.toString(2).padStart(8, '0')}b  (FPAdd SET bit)`);
  console.log('');

  return { iy48, iy0e, iy59 };
}

// --- Run gcd with normalization trace ---

function runGcdWithNormTrace(mem, executor, cpu, label, extraSetup) {
  const op1Bytes = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]); // 12.0
  const op2Bytes = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]); // 8.0

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

  // Apply extra setup (e.g., flip IY flags)
  if (extraSetup) extraSetup(mem, cpu);

  console.log(`--- ${label} ---`);
  console.log(`  Entry OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9))}`);
  console.log(`  Entry OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9))}`);
  console.log(`  IY = ${hex(cpu._iy)}`);
  console.log(`  (IY+0x48) = ${hexByte(mem[cpu._iy + 0x48] & 0xff)} = ${(mem[cpu._iy + 0x48] & 0xff).toString(2).padStart(8, '0')}b`);
  console.log('');

  let stepCount = 0;
  let outcome = 'budget';
  let lastPC = 0;

  // Normalization path tracking
  const normEvents = [];
  let normEntryCount = 0;
  let inNormalize = false;
  let currentNormEvent = null;

  // Track all blocks visited for path analysis
  const blockTrace = [];

  // Track register A at key points
  const registerSnapshots = [];

  try {
    executor.runFrom(GCD_ENTRY, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,

      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = step + 1;
        lastPC = norm;

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');

        blockTrace.push({
          step: stepCount,
          pc: norm,
          a: cpu.a & 0xff,
          f: cpu.f & 0xff,
          sp: cpu.sp,
        });

        // Detect normalize entry at 0x07CA48
        if (norm === NORM_ENTRY) {
          normEntryCount++;
          inNormalize = true;
          const iy48Val = mem[cpu._iy + 0x48] & 0xff;
          currentNormEvent = {
            entryNumber: normEntryCount,
            step: stepCount,
            a_at_entry: cpu.a & 0xff,
            f_at_entry: cpu.f & 0xff,
            iy48_at_entry: iy48Val,
            iy48_bit3: (iy48Val >> 3) & 1,
            op1_at_entry: readBytes(mem, OP1_ADDR, 9).slice(),
            visitedBigShift: false,
            visitedAltPath: false,
            visitedSecondary: false,
            a_at_secondary: null,
            branchDecisions: [],
            op1_at_exit: null,
          };
          normEvents.push(currentNormEvent);
        }

        // Track within normalization
        if (inNormalize && currentNormEvent) {
          if (norm === NORM_BIGSHIFT || norm === BIGSHIFT_ADDR) {
            currentNormEvent.visitedBigShift = true;
            currentNormEvent.branchDecisions.push({
              step: stepCount,
              pc: norm,
              desc: 'BigShift path (zeros OP1)',
              a: cpu.a & 0xff,
              f: cpu.f & 0xff,
            });
          }

          if (norm === NORM_ALT_PATH) {
            currentNormEvent.visitedAltPath = true;
            currentNormEvent.branchDecisions.push({
              step: stepCount,
              pc: norm,
              desc: 'Alt path (exponent combination, preserves mantissa)',
              a: cpu.a & 0xff,
              f: cpu.f & 0xff,
            });
          }

          if (norm === NORM_SECONDARY) {
            currentNormEvent.visitedSecondary = true;
            currentNormEvent.a_at_secondary = cpu.a & 0xff;
            const iy48Now = mem[cpu._iy + 0x48] & 0xff;
            currentNormEvent.branchDecisions.push({
              step: stepCount,
              pc: norm,
              desc: `Secondary normalization (IY+0x48=${hexByte(iy48Now)}, bit3=${(iy48Now >> 3) & 1})`,
              a: cpu.a & 0xff,
              f: cpu.f & 0xff,
              iy48: iy48Now,
            });
          }
        }

        // Detect exit from normalization range
        // The normalization code is roughly 0x07C900 - 0x07CB00
        if (inNormalize && currentNormEvent) {
          if (norm < 0x07c900 || norm > 0x07cb00) {
            // Might be a CALL to BigShift or similar - check
            if (norm !== BIGSHIFT_ADDR && norm < 0x07f000) {
              currentNormEvent.op1_at_exit = readBytes(mem, OP1_ADDR, 9).slice();
              inNormalize = false;
            }
          }
        }
      },

      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = step + 1;
        lastPC = norm;
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');

        blockTrace.push({ step: stepCount, pc: norm, missing: true });
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

  // Close any open norm event
  if (inNormalize && currentNormEvent && !currentNormEvent.op1_at_exit) {
    currentNormEvent.op1_at_exit = readBytes(mem, OP1_ADDR, 9).slice();
  }

  const finalOP1 = readBytes(mem, OP1_ADDR, 9);
  const finalOP2 = readBytes(mem, OP2_ADDR, 9);
  const errNo = mem[ERR_NO_ADDR] & 0xff;

  console.log(`  Outcome: ${outcome}`);
  console.log(`  Steps: ${stepCount}, Last PC: ${hex(lastPC)}`);
  console.log(`  errNo: ${hexByte(errNo)} (${errName(errNo)})`);
  console.log(`  Final OP1: [${formatBytes(finalOP1)}] = ${decodeBcdRealBytes(finalOP1)}`);
  console.log(`  Final OP2: [${formatBytes(finalOP2)}] = ${decodeBcdRealBytes(finalOP2)}`);
  console.log('');

  // Normalization events report
  console.log(`  Normalization entries: ${normEntryCount}`);
  for (const ev of normEvents) {
    console.log(`  --- Normalize #${ev.entryNumber} (step ${ev.step}) ---`);
    console.log(`    A at entry: ${hexByte(ev.a_at_entry)} (after SUB 0x80 this would be ${hexByte((ev.a_at_entry - 0x80) & 0xff)})`);
    console.log(`    F at entry: ${hexByte(ev.f_at_entry)} = ${ev.f_at_entry.toString(2).padStart(8, '0')}b`);
    console.log(`    (IY+0x48) at entry: ${hexByte(ev.iy48_at_entry)} bit3=${ev.iy48_bit3}`);
    console.log(`    OP1 at entry: [${formatBytes(ev.op1_at_entry)}] = ${decodeBcdRealBytes(ev.op1_at_entry)}`);
    console.log(`    Visited BigShift path: ${ev.visitedBigShift ? 'YES' : 'no'}`);
    console.log(`    Visited alt path (0x07CA87): ${ev.visitedAltPath ? 'YES' : 'no'}`);
    console.log(`    Visited secondary norm (0x07C9BF): ${ev.visitedSecondary ? 'YES' : 'no'}`);
    if (ev.a_at_secondary !== null) {
      console.log(`    A at secondary: ${hexByte(ev.a_at_secondary)}`);
    }
    if (ev.op1_at_exit) {
      console.log(`    OP1 at exit: [${formatBytes(ev.op1_at_exit)}] = ${decodeBcdRealBytes(ev.op1_at_exit)}`);
    }
    for (const bd of ev.branchDecisions) {
      console.log(`    Branch @ step ${bd.step} PC=${hex(bd.pc)}: ${bd.desc} (A=${hexByte(bd.a)} F=${hexByte(bd.f)})`);
    }
    console.log('');
  }

  // Show blocks in the normalization range (0x07C900 - 0x07CB00) and BigShift
  const normBlocks = blockTrace.filter(
    (t) => (t.pc >= 0x07c900 && t.pc <= 0x07cb00) || t.pc === BIGSHIFT_ADDR
  );
  if (normBlocks.length > 0) {
    console.log('  Blocks visited in normalization range (0x07C900-0x07CB00) + BigShift:');
    for (const t of normBlocks) {
      let marker = '';
      if (t.pc === NORM_ENTRY) marker = ' <-- NORMALIZE ENTRY';
      else if (t.pc === NORM_BIGSHIFT) marker = ' <-- BigShift jump';
      else if (t.pc === NORM_ALT_PATH) marker = ' <-- ALT PATH (preserves mantissa)';
      else if (t.pc === NORM_SECONDARY) marker = ' <-- SECONDARY NORM (checks IY+0x48 bit3)';
      else if (t.pc === BIGSHIFT_ADDR) marker = ' <-- BIGSHIFT SUBROUTINE';
      console.log(`    step=${String(t.step).padStart(4)} PC=${hex(t.pc)} A=${hexByte(t.a)} F=${hexByte(t.f)} SP=${hex(t.sp)}${marker}`);
    }
    console.log('');
  }

  return { outcome, errNo, finalOP1, finalOP2, normEvents, blockTrace };
}

// ==========================================================================
// Main probe
// ==========================================================================

function main() {
  console.log('='.repeat(80));
  console.log('Phase 168: IY Flags Check + Normalization Path Analysis');
  console.log('='.repeat(80));
  console.log('');

  // ======================================================================
  // PART A: IY and System Flags Dump (after cold boot + MEM_INIT)
  // ======================================================================

  console.log('='.repeat(80));
  console.log('PART A: IY System Flags Dump (after cold boot + MEM_INIT)');
  console.log('='.repeat(80));
  console.log('');

  const runtime = createPreparedRuntime();

  if (!runtime.memInitOk) {
    console.log('MEM_INIT failed; aborting.');
    process.exitCode = 1;
    return;
  }

  console.log('Cold boot + MEM_INIT complete.');
  console.log('');

  const { mem, executor, cpu } = runtime;

  const coldBootFlags = dumpIyFlags(mem, IY_BASE, 'IY flags after cold boot + MEM_INIT');

  // Save a copy for comparison
  const coldBootFlagsBytes = readBytes(mem, IY_BASE, IY_FLAGS_LEN);

  // ======================================================================
  // PART B: Normalization Path Trace (default flags)
  // ======================================================================

  console.log('='.repeat(80));
  console.log('PART B: Normalization Path Trace (default IY flags)');
  console.log('='.repeat(80));
  console.log('');

  const resultB = runGcdWithNormTrace(mem, executor, cpu, 'gcd(12,8) with default IY flags');

  // ======================================================================
  // PART C: Force Alternative Path (flip IY+0x48 bit 3)
  // ======================================================================

  console.log('='.repeat(80));
  console.log('PART C: Flip IY+0x48 bit 3, re-run gcd(12,8)');
  console.log('='.repeat(80));
  console.log('');

  // Restore the cold boot flags first
  for (let i = 0; i < coldBootFlagsBytes.length; i++) {
    mem[IY_BASE + i] = coldBootFlagsBytes[i];
  }

  const originalBit3 = (coldBootFlags.iy48 >> 3) & 1;
  console.log(`Original (IY+0x48) = ${hexByte(coldBootFlags.iy48)}, bit 3 = ${originalBit3}`);
  console.log(`Flipping bit 3 to ${1 - originalBit3}`);
  console.log('');

  const resultC = runGcdWithNormTrace(mem, executor, cpu, 'gcd(12,8) with IY+0x48 bit 3 FLIPPED', (m, c) => {
    const addr = c._iy + 0x48;
    const current = m[addr] & 0xff;
    m[addr] = current ^ 0x08; // flip bit 3
  });

  // Compare results
  console.log('--- Part C Comparison ---');
  console.log(`  Default flags result: outcome=${resultB.outcome}, errNo=${hexByte(resultB.errNo)}, OP1=[${formatBytes(resultB.finalOP1)}]`);
  console.log(`  Flipped bit3 result:  outcome=${resultC.outcome}, errNo=${hexByte(resultC.errNo)}, OP1=[${formatBytes(resultC.finalOP1)}]`);

  const b_bigshift = resultB.normEvents.some((e) => e.visitedBigShift);
  const c_bigshift = resultC.normEvents.some((e) => e.visitedBigShift);
  const b_alt = resultB.normEvents.some((e) => e.visitedAltPath);
  const c_alt = resultC.normEvents.some((e) => e.visitedAltPath);
  console.log(`  Default: BigShift=${b_bigshift}, AltPath=${b_alt}`);
  console.log(`  Flipped: BigShift=${c_bigshift}, AltPath=${c_alt}`);

  if (resultB.finalOP1.join(',') !== resultC.finalOP1.join(',')) {
    console.log('  *** DIFFERENT OP1 RESULT! Flipping bit 3 changed normalization behavior! ***');
  } else {
    console.log('  Same OP1 result — bit 3 flip did not change outcome.');
  }
  if (resultB.outcome !== resultC.outcome || resultB.errNo !== resultC.errNo) {
    console.log('  *** DIFFERENT OUTCOME/ERROR! ***');
  }
  console.log('');

  // ======================================================================
  // PART D: Boot to homescreen, capture real IY flags, re-run gcd
  // ======================================================================

  console.log('='.repeat(80));
  console.log('PART D: Full boot sequence IY flags + gcd test');
  console.log('='.repeat(80));
  console.log('');

  // Create a fresh runtime for full boot
  const runtime2 = createRuntime();
  const mem2 = runtime2.mem;
  const executor2 = runtime2.executor;
  const cpu2 = runtime2.cpu;

  // Cold boot
  coldBoot(executor2, cpu2, mem2);
  console.log('Cold boot complete.');

  // Run OS init stages (same as probe-phase99d)
  const stages = [
    { label: 'Stage1', entry: STAGE_1_ENTRY, maxSteps: 500000 },
    { label: 'Stage2', entry: STAGE_2_ENTRY, maxSteps: 500000 },
    { label: 'Stage3', entry: STAGE_3_ENTRY, maxSteps: 500000 },
    { label: 'Stage4', entry: STAGE_4_ENTRY, maxSteps: 500000 },
  ];

  for (const stage of stages) {
    try {
      const result = executor2.runFrom(stage.entry, 'adl', {
        maxSteps: stage.maxSteps,
        maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS,
      });
      console.log(`${stage.label}: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}`);
    } catch (err) {
      console.log(`${stage.label}: threw ${(err?.stack || String(err)).split('\n')[0]}`);
    }
  }
  console.log('');

  // Dump IY flags after full boot
  const bootFlags = dumpIyFlags(mem2, IY_BASE, 'IY flags after full boot sequence');
  const bootFlagsBytes = readBytes(mem2, IY_BASE, IY_FLAGS_LEN);

  // Compare cold boot vs full boot flags
  console.log('--- Comparison: cold boot vs full boot flags ---');
  let diffCount = 0;
  for (let i = 0; i < IY_FLAGS_LEN; i++) {
    if (coldBootFlagsBytes[i] !== bootFlagsBytes[i]) {
      diffCount++;
      console.log(`  IY+${hexByte(i)}: cold=${hexByte(coldBootFlagsBytes[i])} boot=${hexByte(bootFlagsBytes[i])}`);
    }
  }
  if (diffCount === 0) {
    console.log('  No differences — cold boot and full boot produce identical IY flags.');
  } else {
    console.log(`  ${diffCount} byte(s) differ.`);
  }
  console.log('');

  // Now run MEM_INIT on runtime2
  prepareCallState(cpu2, mem2);
  cpu2.sp -= 3;
  write24(mem2, cpu2.sp, MEMINIT_RET);

  let memInit2Ok = false;
  try {
    executor2.runFrom(MEMINIT_ENTRY, 'adl', {
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
    if (err?.message === '__RET__') memInit2Ok = true;
    else console.log(`  MEM_INIT threw: ${(err?.stack || String(err)).split('\n')[0]}`);
  }

  if (!memInit2Ok) {
    console.log('  MEM_INIT failed for boot runtime — running gcd anyway.');
  } else {
    console.log('  MEM_INIT complete for boot runtime.');
  }
  console.log('');

  // Restore the boot IY flags (MEM_INIT may have changed them)
  for (let i = 0; i < bootFlagsBytes.length; i++) {
    mem2[IY_BASE + i] = bootFlagsBytes[i];
  }

  const resultD = runGcdWithNormTrace(mem2, executor2, cpu2, 'gcd(12,8) with full-boot IY flags');

  // Compare Part B vs Part D
  console.log('--- Part D Comparison (cold boot vs full boot flags) ---');
  console.log(`  Cold boot gcd result: outcome=${resultB.outcome}, errNo=${hexByte(resultB.errNo)}, OP1=[${formatBytes(resultB.finalOP1)}]`);
  console.log(`  Full boot gcd result: outcome=${resultD.outcome}, errNo=${hexByte(resultD.errNo)}, OP1=[${formatBytes(resultD.finalOP1)}]`);

  if (resultB.finalOP1.join(',') !== resultD.finalOP1.join(',')) {
    console.log('  *** DIFFERENT OP1 RESULT! Boot-initialized flags change normalization! ***');
  } else {
    console.log('  Same OP1 result.');
  }
  if (resultB.outcome !== resultD.outcome || resultB.errNo !== resultD.errNo) {
    console.log('  *** DIFFERENT OUTCOME/ERROR! ***');
  }
  console.log('');

  // ======================================================================
  // SUMMARY
  // ======================================================================

  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log('');
  console.log(`IY base: ${hex(IY_BASE)}`);
  console.log(`(IY+0x48) after cold boot: ${hexByte(coldBootFlags.iy48)} (bit3=${(coldBootFlags.iy48 >> 3) & 1})`);
  console.log(`(IY+0x48) after full boot: ${hexByte(bootFlags.iy48)} (bit3=${(bootFlags.iy48 >> 3) & 1})`);
  console.log('');
  console.log('Normalization path analysis:');
  console.log(`  Part B (default):     ${resultB.normEvents.length} norm entries, BigShift=${b_bigshift}, AltPath=${b_alt}, result=[${formatBytes(resultB.finalOP1)}] = ${decodeBcdRealBytes(resultB.finalOP1)}`);
  console.log(`  Part C (bit3 flip):   ${resultC.normEvents.length} norm entries, BigShift=${c_bigshift}, AltPath=${c_alt}, result=[${formatBytes(resultC.finalOP1)}] = ${decodeBcdRealBytes(resultC.finalOP1)}`);
  console.log(`  Part D (full boot):   ${resultD.normEvents.length} norm entries, result=[${formatBytes(resultD.finalOP1)}] = ${decodeBcdRealBytes(resultD.finalOP1)}`);
  console.log('');

  const anyBreakthrough =
    resultB.finalOP1.join(',') !== resultC.finalOP1.join(',') ||
    resultB.finalOP1.join(',') !== resultD.finalOP1.join(',');

  if (anyBreakthrough) {
    console.log('*** BREAKTHROUGH: IY flags change normalization behavior! ***');
    console.log('The gcd failure may be caused by incorrect IY flag initialization.');
  } else {
    console.log('IY flags do NOT appear to change the normalization path.');
    console.log('The gcd failure is caused by something else.');
  }
  console.log('');

  // Check if normalization ever visited secondary or alt path
  const allNormEvents = [...resultB.normEvents, ...resultC.normEvents, ...resultD.normEvents];
  const anySecondary = allNormEvents.some((e) => e.visitedSecondary);
  const anyAlt = allNormEvents.some((e) => e.visitedAltPath);
  console.log(`Secondary normalization (0x07C9BF) ever reached: ${anySecondary ? 'YES' : 'NO'}`);
  console.log(`Alt path (0x07CA87) ever reached: ${anyAlt ? 'YES' : 'NO'}`);
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
