#!/usr/bin/env node

/**
 * Phase 170 - Full F Register Deep Trace at Every Block Boundary During gcd(12,8)
 *
 * Traces the complete F register (all 8 bits decoded) at every block boundary,
 * with special attention to conditional jumps/calls to find the flag-level bug
 * causing systemic E_Domain in gcd.
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
const OP1_EXP_ADDR = 0xd005f9;
const OP1_MANT_START = 0xd005fa;

const GCD_ENTRY = 0x068d3d;
const GCD_HELPER = 0x068d20;
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

// Key conditional jump addresses in gcd
const COND_JUMP_PCS = new Set([
  0x068d65, // JR Z
  0x068d67, // JR C
  0x068d73, // JR NC
  0x068da1, // JR NZ
]);

// Key GCD addresses for reference
const GCD_RANGE_START = 0x068d00;
const GCD_RANGE_END = 0x068dff;
const COMPOUND_INT = 0x07c747;
const INVSUB = 0x07c74f;

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

function decodeFlags(f) {
  const S  = (f >> 7) & 1;
  const Z  = (f >> 6) & 1;
  const Y  = (f >> 5) & 1; // undocumented bit 5
  const H  = (f >> 4) & 1;
  const X  = (f >> 3) & 1; // undocumented bit 3
  const PV = (f >> 2) & 1;
  const N  = (f >> 1) & 1;
  const C  = f & 1;
  return { S, Z, Y, H, X, PV, N, C };
}

function flagsStr(f) {
  const fl = decodeFlags(f);
  const parts = [];
  if (fl.S) parts.push('S');
  if (fl.Z) parts.push('Z');
  if (fl.Y) parts.push('Y');
  if (fl.H) parts.push('H');
  if (fl.X) parts.push('X');
  if (fl.PV) parts.push('P/V');
  if (fl.N) parts.push('N');
  if (fl.C) parts.push('C');
  return parts.length ? parts.join(' ') : 'none';
}

function condLabel(pc) {
  if (pc === 0x068d65) return 'JR Z';
  if (pc === 0x068d67) return 'JR C';
  if (pc === 0x068d73) return 'JR NC';
  if (pc === 0x068da1) return 'JR NZ';
  return '???';
}

// --- Runtime setup (same as phase 169) ---

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
// MAIN PROBE: Full F Register Deep Trace
// ==========================================================================

function runFlagDeepTrace(runtime) {
  console.log('='.repeat(80));
  console.log('PHASE 170: FULL F REGISTER DEEP TRACE DURING gcd(12,8)');
  console.log('='.repeat(80));
  console.log('');

  const { mem, executor, cpu } = runtime;

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

  console.log(`Entry OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9))}`);
  console.log(`Entry OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9))}`);
  console.log(`Entry F: ${hexByte(cpu.f)} (${flagsStr(cpu.f)})`);
  console.log(`Entry SP: ${hex(cpu.sp)}`);
  console.log('');

  // Collect every block entry
  const allBlocks = [];
  // Collect conditional jump encounters
  const condJumps = [];
  let stepCount = 0;
  let outcome = 'budget';
  let prevPC = GCD_ENTRY;

  try {
    executor.runFrom(GCD_ENTRY, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,

      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = step + 1;

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');

        const fVal = cpu.f & 0xff;
        const entry = {
          step: stepCount,
          pc: norm,
          f: fVal,
          a: cpu.a & 0xff,
          sp: cpu.sp,
          prevPC,
        };

        allBlocks.push(entry);

        // Check if the PREVIOUS block was at a conditional jump address.
        // The "next PC" tells us whether the jump was taken.
        if (COND_JUMP_PCS.has(prevPC)) {
          condJumps.push({
            step: stepCount - 1,
            jumpPC: prevPC,
            cond: condLabel(prevPC),
            f: allBlocks.length >= 2 ? allBlocks[allBlocks.length - 2].f : 0,
            nextPC: norm,
          });
        }

        prevPC = norm;
      },

      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = step + 1;
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
        prevPC = norm;
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

  const errNo = mem[ERR_NO_ADDR] & 0xff;
  const finalOP1 = readBytes(mem, OP1_ADDR, 9);
  const finalOP2 = readBytes(mem, OP2_ADDR, 9);

  // --- Section 1: Full block trace ---
  console.log('--- SECTION 1: FULL BLOCK-BOUNDARY TRACE ---');
  console.log(`Total blocks visited: ${allBlocks.length}`);
  console.log('');
  console.log('  step | PC       | F    | Flags            | A  | SP');
  console.log('  ' + '-'.repeat(70));

  for (const entry of allBlocks) {
    const fl = flagsStr(entry.f);
    const inGcd = (entry.pc >= GCD_RANGE_START && entry.pc <= GCD_RANGE_END) ? ' *GCD*' : '';
    const isCompound = entry.pc === COMPOUND_INT ? ' *INT*' : '';
    const isInvSub = entry.pc === INVSUB ? ' *InvSub*' : '';
    const tag = inGcd || isCompound || isInvSub || '';
    console.log(
      `  ${String(entry.step).padStart(4)} | ${hex(entry.pc)} | ${hexByte(entry.f)} ` +
      `| ${fl.padEnd(17)}| ${hexByte(entry.a)} | ${hex(entry.sp)}${tag}`
    );
  }

  console.log('');

  // --- Section 2: Conditional jump analysis ---
  console.log('--- SECTION 2: CONDITIONAL JUMPS/BRANCHES ---');
  console.log(`Total conditional branches detected: ${condJumps.length}`);
  console.log('');

  if (condJumps.length > 0) {
    console.log('  step | Jump PC  | Cond   | F    | Flags            | Next PC  | Taken?');
    console.log('  ' + '-'.repeat(80));

    for (const cj of condJumps) {
      const fl = flagsStr(cj.f);
      const flags = decodeFlags(cj.f);

      // Determine if the jump was taken based on condition and flag
      let taken = '?';
      if (cj.cond === 'JR Z') {
        taken = flags.Z ? 'YES' : 'NO';
      } else if (cj.cond === 'JR C') {
        taken = flags.C ? 'YES' : 'NO';
      } else if (cj.cond === 'JR NC') {
        taken = !flags.C ? 'YES' : 'NO';
      } else if (cj.cond === 'JR NZ') {
        taken = !flags.Z ? 'YES' : 'NO';
      }

      console.log(
        `  ${String(cj.step).padStart(4)} | ${hex(cj.jumpPC)} | ${cj.cond.padEnd(7)}` +
        `| ${hexByte(cj.f)} | ${fl.padEnd(17)}| ${hex(cj.nextPC)} | ${taken}`
      );
    }
  }

  console.log('');

  // --- Section 3: GCD-range-only trace with flag deltas ---
  console.log('--- SECTION 3: GCD-RANGE BLOCKS (0x068D00-0x068DFF) WITH FLAG CHANGES ---');
  const gcdBlocks = allBlocks.filter(e => e.pc >= GCD_RANGE_START && e.pc <= GCD_RANGE_END);
  console.log(`GCD-range blocks: ${gcdBlocks.length}`);
  console.log('');

  if (gcdBlocks.length > 0) {
    let prevF = null;
    console.log('  step | PC       | F    | Flags            | A  | F-changed?');
    console.log('  ' + '-'.repeat(70));

    for (const entry of gcdBlocks) {
      const fl = flagsStr(entry.f);
      const changed = (prevF !== null && prevF !== entry.f) ? `  CHANGED from ${hexByte(prevF)}` : '';
      console.log(
        `  ${String(entry.step).padStart(4)} | ${hex(entry.pc)} | ${hexByte(entry.f)} ` +
        `| ${fl.padEnd(17)}| ${hexByte(entry.a)}${changed}`
      );
      prevF = entry.f;
    }
  }

  console.log('');

  // --- Section 4: Results ---
  console.log('--- SECTION 4: RESULTS ---');
  console.log(`Outcome: ${outcome}`);
  console.log(`Steps: ${stepCount}`);
  console.log(`Error: ${hexByte(errNo)} (${errName(errNo)})`);
  console.log(`Final OP1: [${formatBytes(finalOP1)}] = ${decodeBcdRealBytes(finalOP1)}`);
  console.log(`Final OP2: [${formatBytes(finalOP2)}] = ${decodeBcdRealBytes(finalOP2)}`);
  console.log('');

  // --- Section 5: Analysis ---
  console.log('--- SECTION 5: ANALYSIS ---');
  console.log('');

  // Look for flag anomalies near conditional jumps
  let anomalyCount = 0;

  for (const cj of condJumps) {
    const flags = decodeFlags(cj.f);

    // Check: JR Z taken when Z is clear or vice versa
    if (cj.cond === 'JR Z') {
      // If Z flag says taken, nextPC should be the branch target (not fallthrough)
      // We can't know the target without disassembly, but we can flag for review
      console.log(`  [${hex(cj.jumpPC)}] JR Z: Z=${flags.Z}, next=${hex(cj.nextPC)}, taken=${flags.Z ? 'YES' : 'NO'}`);
      if (flags.Z) {
        anomalyCount++;
        console.log(`    ** Z flag IS set — this branch IS taken. Check if this is expected.`);
      }
    }

    if (cj.cond === 'JR C') {
      console.log(`  [${hex(cj.jumpPC)}] JR C: C=${flags.C}, next=${hex(cj.nextPC)}, taken=${flags.C ? 'YES' : 'NO'}`);
    }

    if (cj.cond === 'JR NC') {
      console.log(`  [${hex(cj.jumpPC)}] JR NC: C=${flags.C}, next=${hex(cj.nextPC)}, taken=${!flags.C ? 'YES' : 'NO'}`);
    }

    if (cj.cond === 'JR NZ') {
      console.log(`  [${hex(cj.jumpPC)}] JR NZ: Z=${flags.Z}, next=${hex(cj.nextPC)}, taken=${!flags.Z ? 'YES' : 'NO'}`);
    }
  }

  if (anomalyCount === 0 && condJumps.length > 0) {
    console.log('');
    console.log('  No obvious anomalies detected from flag values alone.');
    console.log('  The flag values need to be cross-referenced with the preceding');
    console.log('  instruction to determine if they are correct.');
  }

  console.log('');

  // Summary of unique PCs visited
  const uniquePCs = new Set(allBlocks.map(e => e.pc));
  console.log(`Unique block PCs visited: ${uniquePCs.size}`);
  const sortedPCs = [...uniquePCs].sort((a, b) => a - b);
  console.log('  ' + sortedPCs.map(pc => hex(pc)).join(', '));
  console.log('');
}

// ==========================================================================
// Main
// ==========================================================================

function main() {
  console.log('=== Phase 170: F Register Deep Trace During gcd(12,8) ===');
  console.log('');

  const runtime = createPreparedRuntime();

  if (!runtime.memInitOk) {
    console.log('MEM_INIT failed; aborting.');
    process.exitCode = 1;
    return;
  }

  console.log('Cold boot + MEM_INIT complete.');
  console.log('');

  runFlagDeepTrace(runtime);

  console.log('Done.');
  process.exitCode = 0;
}

try {
  main();
} catch (err) {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
}
