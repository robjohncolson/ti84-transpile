#!/usr/bin/env node

/**
 * Phase 166 - Trace BIT 0,B + PUSH AF / POP AF flag usage in gcd(12,8)
 *
 * Tracks register B and flags register F at every block during gcd execution.
 * Specifically watches:
 *   - 0x068D82: BIT 0,B instruction — what is B? What is Z after?
 *   - Every PUSH AF (F5): Log when flags are pushed and what values
 *   - Every POP AF (F1): Log when flags are popped and what values
 *   - 0x068D75: LD B,0 + CP 0x82 sequence (sets B=0 or B=1)
 *   - Conditional branches after POP AF
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
const MAX_STEPS = 1500;

// Key addresses in the gcd body
const ADDR_LOOP_TOP = 0x068d5d;
const ADDR_LD_B_0 = 0x068d75;
const ADDR_CP_82 = 0x068d77;
const ADDR_JR_C = 0x068d79;
const ADDR_INC_B = 0x068d7b;
const ADDR_JR_BODY = 0x068d7c;
const ADDR_BIT_0_B = 0x068d82;
const ADDR_PUSH_AF = 0x068d84;

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

function flagsString(f) {
  const s = (f & 0x80) ? 'S' : '-';
  const z = (f & 0x40) ? 'Z' : '-';
  const h = (f & 0x10) ? 'H' : '-';
  const p = (f & 0x04) ? 'P' : '-';
  const n = (f & 0x02) ? 'N' : '-';
  const c = (f & 0x01) ? 'C' : '-';
  return `${s}${z}${h}${p}${n}${c}`;
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

// ==========================================================================
// Main probe
// ==========================================================================

function main() {
  console.log('=== Phase 166: BIT 0,B + PUSH AF / POP AF Flag Trace in gcd(12,8) ===');
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

  // Set up gcd(12,8)
  const op1Bytes = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]); // 12.0
  const op2Bytes = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]); // 8.0

  prepareCallState(cpu, mem);
  seedGcdFpState(mem, op1Bytes, op2Bytes);

  // Push OP2 to FPS before gcd entry (matches existing probe setup)
  const fpsPtr = read24(mem, FPS_ADDR);
  const op2Copy = readBytes(mem, OP2_ADDR, 9);
  for (let i = 0; i < 9; i++) {
    mem[fpsPtr + i] = op2Copy[i];
  }
  write24(mem, FPS_ADDR, fpsPtr + 9);

  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  console.log(`Entry OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9))}`);
  console.log(`Entry OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9))}`);
  console.log(`Entry SP: ${hex(cpu.sp)}`);
  console.log('');

  // Tracking state
  let stepCount = 0;
  let outcome = 'budget';
  let lastPC = 0;
  let iterationCount = 0;

  // Collected events
  const bit0bHits = [];
  const pushAfHits = [];
  const popAfHits = [];
  const loopTopHits = [];
  const ldB0Hits = [];
  const cpHits = [];
  const incBHits = [];

  // Track all blocks in the gcd range for full trace
  const gcdBlocks = [];

  try {
    executor.runFrom(GCD_ENTRY, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,

      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);
        lastPC = norm;

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');

        // Track all blocks in the gcd handler range (0x068D00 - 0x068E00)
        if (norm >= 0x068d00 && norm <= 0x068e00) {
          const entry = {
            step: stepCount,
            pc: norm,
            a: cpu.a & 0xff,
            f: cpu.f & 0xff,
            b: cpu.b & 0xff,
            sp: cpu.sp,
          };
          gcdBlocks.push(entry);
        }

        // 0x068D5D: loop top
        if (norm === ADDR_LOOP_TOP) {
          iterationCount++;
          loopTopHits.push({
            step: stepCount,
            iteration: iterationCount,
            b: cpu.b & 0xff,
            a: cpu.a & 0xff,
            f: cpu.f & 0xff,
            flags: flagsString(cpu.f),
            op1: decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9)),
            op2: decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9)),
          });
        }

        // 0x068D75: LD B,0
        if (norm === ADDR_LD_B_0) {
          ldB0Hits.push({
            step: stepCount,
            b_before: cpu.b & 0xff,
            a: cpu.a & 0xff,
            f: cpu.f & 0xff,
            flags: flagsString(cpu.f),
          });
        }

        // 0x068D77: CP 0x82
        if (norm === ADDR_CP_82) {
          cpHits.push({
            step: stepCount,
            a: cpu.a & 0xff,
            b: cpu.b & 0xff,
            f: cpu.f & 0xff,
            flags: flagsString(cpu.f),
          });
        }

        // 0x068D7B: INC B
        if (norm === ADDR_INC_B) {
          incBHits.push({
            step: stepCount,
            b_before: cpu.b & 0xff,
            a: cpu.a & 0xff,
            f: cpu.f & 0xff,
            flags: flagsString(cpu.f),
          });
        }

        // 0x068D82: BIT 0,B block
        if (norm === ADDR_BIT_0_B) {
          bit0bHits.push({
            step: stepCount,
            b: cpu.b & 0xff,
            a: cpu.a & 0xff,
            f: cpu.f & 0xff,
            flags: flagsString(cpu.f),
            z: (cpu.f & 0x40) ? 1 : 0,
            sp: cpu.sp,
          });
        }

        // 0x068D84: PUSH AF
        if (norm === ADDR_PUSH_AF) {
          pushAfHits.push({
            step: stepCount,
            a: cpu.a & 0xff,
            f: cpu.f & 0xff,
            flags: flagsString(cpu.f),
            b: cpu.b & 0xff,
            sp: cpu.sp,
          });
        }

        // Detect PUSH AF (F5) and POP AF (F1) at ANY address by checking the opcode
        // We check the ROM byte at the current PC
        if (norm < 0x400000) {
          const opcode = romBytes[norm] & 0xff;
          if (opcode === 0xf5 && norm !== ADDR_PUSH_AF) {
            // PUSH AF at unexpected address
            pushAfHits.push({
              step: stepCount,
              pc: norm,
              a: cpu.a & 0xff,
              f: cpu.f & 0xff,
              flags: flagsString(cpu.f),
              b: cpu.b & 0xff,
              sp: cpu.sp,
              note: 'other-push-af',
            });
          }
          if (opcode === 0xf1) {
            popAfHits.push({
              step: stepCount,
              pc: norm,
              a: cpu.a & 0xff,
              f: cpu.f & 0xff,
              flags: flagsString(cpu.f),
              b: cpu.b & 0xff,
              sp: cpu.sp,
              note: 'pre-pop',
            });
          }
        }
      },

      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);
        lastPC = norm;
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

  const finalOP1 = readBytes(mem, OP1_ADDR, 9);
  const finalOP2 = readBytes(mem, OP2_ADDR, 9);
  const errNo = mem[ERR_NO_ADDR] & 0xff;

  console.log('='.repeat(80));
  console.log('EXECUTION RESULT');
  console.log('='.repeat(80));
  console.log(`  Outcome:   ${outcome}`);
  console.log(`  Steps:     ${stepCount}`);
  console.log(`  Last PC:   ${hex(lastPC)}`);
  console.log(`  errNo:     ${hexByte(errNo)} (${errName(errNo)})`);
  console.log(`  Final OP1: [${formatBytes(finalOP1)}] = ${decodeBcdRealBytes(finalOP1)}`);
  console.log(`  Final OP2: [${formatBytes(finalOP2)}] = ${decodeBcdRealBytes(finalOP2)}`);
  console.log('');

  // --- Report: Loop top hits ---
  console.log('='.repeat(80));
  console.log('LOOP TOP HITS (0x068D5D)');
  console.log('='.repeat(80));
  for (const h of loopTopHits) {
    console.log(`  iter=${h.iteration} step=${h.step} B=${hexByte(h.b)} A=${hexByte(h.a)} F=${hexByte(h.f)} [${h.flags}] OP1=${h.op1} OP2=${h.op2}`);
  }
  console.log(`  Total loop iterations: ${loopTopHits.length}`);
  console.log('');

  // --- Report: LD B,0 hits ---
  console.log('='.repeat(80));
  console.log('LD B,0 HITS (0x068D75)');
  console.log('='.repeat(80));
  for (const h of ldB0Hits) {
    console.log(`  step=${h.step} B_before=${hexByte(h.b_before)} A=${hexByte(h.a)} F=${hexByte(h.f)} [${h.flags}]`);
  }
  console.log('');

  // --- Report: CP 0x82 hits ---
  console.log('='.repeat(80));
  console.log('CP 0x82 HITS (0x068D77)');
  console.log('='.repeat(80));
  for (const h of cpHits) {
    const aVal = h.a;
    const comparison = aVal < 0x82 ? 'A<0x82 (C=1)' : aVal === 0x82 ? 'A==0x82 (Z=1)' : 'A>0x82 (C=0)';
    console.log(`  step=${h.step} A=${hexByte(h.a)} B=${hexByte(h.b)} F=${hexByte(h.f)} [${h.flags}] => ${comparison}`);
  }
  console.log('');

  // --- Report: INC B hits ---
  console.log('='.repeat(80));
  console.log('INC B HITS (0x068D7B)');
  console.log('='.repeat(80));
  for (const h of incBHits) {
    console.log(`  step=${h.step} B_before=${hexByte(h.b_before)} A=${hexByte(h.a)} F=${hexByte(h.f)} [${h.flags}]`);
  }
  console.log('');

  // --- Report: BIT 0,B hits ---
  console.log('='.repeat(80));
  console.log('BIT 0,B HITS (0x068D82)');
  console.log('='.repeat(80));
  for (const h of bit0bHits) {
    const bit0 = h.b & 1;
    const zAfterBit = bit0 === 0 ? 'Z=1 (bit0 is 0)' : 'Z=0 (bit0 is 1)';
    console.log(`  step=${h.step} B=${hexByte(h.b)} A=${hexByte(h.a)} F=${hexByte(h.f)} [${h.flags}] SP=${hex(h.sp)}`);
    console.log(`    bit0 of B = ${bit0} => after BIT 0,B: ${zAfterBit}`);
  }
  console.log(`  Total BIT 0,B hits: ${bit0bHits.length}`);
  console.log('');

  // --- Report: PUSH AF hits ---
  console.log('='.repeat(80));
  console.log('PUSH AF HITS');
  console.log('='.repeat(80));
  for (const h of pushAfHits) {
    const pcStr = h.pc ? hex(h.pc) : hex(ADDR_PUSH_AF);
    const note = h.note ? ` (${h.note})` : '';
    console.log(`  step=${h.step} PC=${pcStr} A=${hexByte(h.a)} F=${hexByte(h.f)} [${h.flags}] B=${hexByte(h.b)} SP=${hex(h.sp)}${note}`);
  }
  console.log(`  Total PUSH AF hits: ${pushAfHits.length}`);
  console.log('');

  // --- Report: POP AF hits ---
  console.log('='.repeat(80));
  console.log('POP AF HITS');
  console.log('='.repeat(80));
  for (const h of popAfHits) {
    console.log(`  step=${h.step} PC=${hex(h.pc)} A=${hexByte(h.a)} F=${hexByte(h.f)} [${h.flags}] B=${hexByte(h.b)} SP=${hex(h.sp)} (${h.note})`);
  }
  console.log(`  Total POP AF hits: ${popAfHits.length}`);
  console.log('');

  // --- Report: All gcd-range blocks (full trace) ---
  console.log('='.repeat(80));
  console.log('FULL GCD-RANGE BLOCK TRACE (0x068D00 - 0x068E00)');
  console.log('='.repeat(80));
  for (const e of gcdBlocks) {
    console.log(`  step=${String(e.step).padStart(4)} PC=${hex(e.pc)} A=${hexByte(e.a)} F=${hexByte(e.f)} [${flagsString(e.f)}] B=${hexByte(e.b)} SP=${hex(e.sp)}`);
  }
  console.log(`  Total gcd-range blocks: ${gcdBlocks.length}`);
  console.log('');

  // --- Analysis ---
  console.log('='.repeat(80));
  console.log('ANALYSIS');
  console.log('='.repeat(80));
  console.log('');

  if (bit0bHits.length > 0) {
    console.log('BIT 0,B analysis:');
    for (let i = 0; i < bit0bHits.length; i++) {
      const h = bit0bHits[i];
      const bit0 = h.b & 1;
      console.log(`  Hit ${i + 1}: B=${hexByte(h.b)}, bit0=${bit0}`);
      console.log(`    Before BIT: F=${hexByte(h.f)} [${h.flags}]`);
      console.log(`    After BIT 0,B: Z=${bit0 === 0 ? '1' : '0'} (${bit0 === 0 ? 'bit is clear' : 'bit is set'})`);
      console.log(`    This means the subsequent PUSH AF saves ${bit0 === 0 ? 'Z=1' : 'Z=0'} to the stack.`);
    }
    console.log('');
  }

  if (popAfHits.length > 0) {
    console.log('POP AF analysis:');
    for (const h of popAfHits) {
      console.log(`  PC=${hex(h.pc)}: A=${hexByte(h.a)} F=${hexByte(h.f)} [${h.flags}]`);
      console.log(`    This restores the Z flag from the earlier PUSH AF.`);
      console.log(`    The next conditional branch will use this Z flag.`);
    }
    console.log('');
  }

  if (popAfHits.length === 0 && pushAfHits.length > 0) {
    console.log('WARNING: PUSH AF found but NO POP AF detected in the gcd execution!');
    console.log('  The flags pushed at 0x068D84 are never popped during the observed execution.');
    console.log('  This might mean the execution was cut short (error/budget) before reaching POP AF.');
    console.log('');
  }

  console.log('Done.');
  process.exitCode = 0;
}

try {
  main();
} catch (err) {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
}
