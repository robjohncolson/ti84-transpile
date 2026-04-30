#!/usr/bin/env node

/**
 * Phase 166 - Trace register A through normalization loop at 0x07CA48
 *
 * Calls compound function 0x07C747 with OP1=12, OP2=8 and logs register A
 * at EVERY block step from entry to return. Focus on:
 *   - A's value at each Shl14 exit
 *   - A's value when normalization returns
 *   - Whether post-loop code reads/uses A
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

// Key addresses for annotation
const COMPOUND_FUNC = 0x07C747;
const NORM_FUNC = 0x07CA48;
const SHL14_A = 0x07FB33;
const SHL14_B = 0x07FB50;
const LOOP_EXIT = 0x07C9AF;
const POST_LOOP_EXP = 0x07CA73;
const NORM_RET = 0x07CA9F;
const INVSUB_FUNC = 0x07C74F;
const FPADD_ENTRY = 0x07C77F;

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

function annotatePC(pc) {
  const labels = {
    0x07C747: 'COMPOUND_ENTRY',
    0x07C74F: 'INVSUB/negate+FPAdd',
    0x07C77F: 'FPAdd_ENTRY',
    0x07CA48: 'NORM_ENTRY',
    0x07C9AF: 'LOOP_EXIT_PATH',
    0x07CA73: 'POST_LOOP_EXP',
    0x07CA9F: 'NORM_RET',
    0x07FB33: 'Shl14_A',
    0x07FB50: 'Shl14_B',
    0x7FFFFE: 'FAKE_RET',
    0x7FFFFA: 'ERR_CATCH',
  };
  return labels[pc] || '';
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
// Main: Trace register A through compound function 0x07C747
// ==========================================================================

function main() {
  console.log('=== Phase 166: Trace Register A Through Normalization Loop ===');
  console.log('  Call: 0x07C747 (compound) with OP1=12, OP2=8');
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

  // Reset state
  prepareCallState(cpu, mem);
  seedFpState(mem);

  // Set OP1=12 and OP2=8
  seedRealRegister(mem, OP1_ADDR, Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));
  seedRealRegister(mem, OP2_ADDR, Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));

  cpu._iy = 0xd00080;
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

  console.log(`Input  OP1: [${formatBytes(inputOP1)}] = ${decodeBcdRealBytes(inputOP1)}`);
  console.log(`Input  OP2: [${formatBytes(inputOP2)}] = ${decodeBcdRealBytes(inputOP2)}`);
  console.log('');

  // Trace table
  console.log('STEP  PC          A     F     B     HL          DE          BC          SP          ANNOTATION');
  console.log('-'.repeat(120));

  const traceLog = [];
  let stepCount = 0;
  let outcome = 'budget';

  // Track Shl14 exits and normalization events
  const shl14Exits = [];
  let lastWasShl14 = false;
  let inNormLoop = false;

  try {
    executor.runFrom(COMPOUND_FUNC, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,

      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');

        const a = cpu.a & 0xff;
        const f = cpu.f & 0xff;
        const b = cpu.b & 0xff;
        const hl = cpu._hl;
        const de = cpu._de;
        const bc = cpu._bc;
        const sp = cpu.sp;
        const annotation = annotatePC(norm);

        const entry = {
          step: stepCount,
          pc: norm,
          a, f, b, hl, de, bc, sp,
          annotation,
        };
        traceLog.push(entry);

        // Track normalization zone
        if (norm === NORM_FUNC) inNormLoop = true;
        if (norm === NORM_RET) inNormLoop = false;

        // Track Shl14 entries/exits
        if (norm === SHL14_A || norm === SHL14_B) {
          lastWasShl14 = true;
        } else if (lastWasShl14) {
          // This block follows a Shl14 call — A holds the shifted-out digit
          shl14Exits.push({ step: stepCount, pc: norm, a, annotation });
          lastWasShl14 = false;
        }

        // Print the row
        const pcStr = hex(norm).padEnd(12);
        const aStr = hexByte(a).padEnd(6);
        const fStr = hexByte(f).padEnd(6);
        const bStr = hexByte(b).padEnd(6);
        const hlStr = hex(hl).padEnd(12);
        const deStr = hex(de).padEnd(12);
        const bcStr = hex(bc).padEnd(12);
        const spStr = hex(sp).padEnd(12);

        console.log(
          `${String(stepCount).padStart(4)}  ${pcStr}${aStr}${fStr}${bStr}${hlStr}${deStr}${bcStr}${spStr}${annotation}`
        );
      },

      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');

        const a = cpu.a & 0xff;
        const f = cpu.f & 0xff;
        console.log(
          `${String(stepCount).padStart(4)}  ${hex(norm).padEnd(12)}${hexByte(a).padEnd(6)}${hexByte(f).padEnd(6)}${'??'.padEnd(6)}${'MISSING BLOCK'}`
        );
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

  console.log('-'.repeat(120));
  console.log('');

  // Final state
  const outputOP1 = readBytes(mem, OP1_ADDR, 9);
  const outputOP2 = readBytes(mem, OP2_ADDR, 9);
  const errNo = mem[ERR_NO_ADDR] & 0xff;

  console.log(`Output OP1: [${formatBytes(outputOP1)}] = ${decodeBcdRealBytes(outputOP1)}`);
  console.log(`Output OP2: [${formatBytes(outputOP2)}] = ${decodeBcdRealBytes(outputOP2)}`);
  console.log(`Steps: ${stepCount}  Outcome: ${outcome}  errNo: ${hexByte(errNo)} (${errName(errNo)})`);
  console.log('');

  // OP1/OP2 snapshots at key moments
  console.log('=== OP1/OP2 at Key PCs ===');
  const keyPCs = [COMPOUND_FUNC, NORM_FUNC, SHL14_A, SHL14_B, LOOP_EXIT, POST_LOOP_EXP, NORM_RET, INVSUB_FUNC, FPADD_ENTRY];
  for (const entry of traceLog) {
    if (keyPCs.includes(entry.pc)) {
      const op1 = readBytes(mem, OP1_ADDR, 9); // Note: this is final state, not snapshot
      console.log(`  Step ${entry.step} @ ${hex(entry.pc)} (${entry.annotation}): A=${hexByte(entry.a)} F=${hexByte(entry.f)}`);
    }
  }
  console.log('');

  // Shl14 exit analysis
  console.log('=== Shl14 Exit Analysis (A value after each Shl14 call) ===');
  if (shl14Exits.length === 0) {
    console.log('  No Shl14 exits detected.');
  } else {
    for (const e of shl14Exits) {
      console.log(`  Step ${e.step} @ ${hex(e.pc)}: A=${hexByte(e.a)} (${e.annotation || 'continuation'})`);
    }
  }
  console.log('');

  // Normalization return analysis
  console.log('=== Normalization Analysis ===');
  const normEntries = traceLog.filter((e) => e.pc === NORM_FUNC);
  const normReturns = traceLog.filter((e) => e.pc === NORM_RET);
  const loopExits = traceLog.filter((e) => e.pc === LOOP_EXIT);
  const postLoopExps = traceLog.filter((e) => e.pc === POST_LOOP_EXP);

  console.log(`  Norm entries (0x07CA48): ${normEntries.length}`);
  for (const e of normEntries) {
    console.log(`    Step ${e.step}: A=${hexByte(e.a)} F=${hexByte(e.f)}`);
  }

  console.log(`  Loop exit path (0x07C9AF): ${loopExits.length}`);
  for (const e of loopExits) {
    console.log(`    Step ${e.step}: A=${hexByte(e.a)} F=${hexByte(e.f)}`);
  }

  console.log(`  Post-loop exponent (0x07CA73): ${postLoopExps.length}`);
  for (const e of postLoopExps) {
    console.log(`    Step ${e.step}: A=${hexByte(e.a)} F=${hexByte(e.f)}`);
  }

  console.log(`  Norm returns (0x07CA9F): ${normReturns.length}`);
  for (const e of normReturns) {
    console.log(`    Step ${e.step}: A=${hexByte(e.a)} F=${hexByte(e.f)}`);
  }
  console.log('');

  // Full register A timeline for normalization zone
  console.log('=== Register A Timeline (all steps) ===');
  let prevA = -1;
  for (const entry of traceLog) {
    if (entry.a !== prevA || entry.annotation) {
      console.log(`  Step ${String(entry.step).padStart(4)} @ ${hex(entry.pc)}: A=${hexByte(entry.a)}${entry.annotation ? '  <-- ' + entry.annotation : ''}`);
    }
    prevA = entry.a;
  }
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
