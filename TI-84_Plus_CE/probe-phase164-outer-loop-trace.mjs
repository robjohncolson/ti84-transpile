#!/usr/bin/env node

/**
 * Phase 164 - Outer loop trace of gcd(12,8) — steps 330-740.
 *
 * Part A: Dense PC trace every block from step 330 to 740 with OP1/OP2/A state
 * Part B: Unique CALL targets mapped to known function names
 * Part C: Identify the exact re-entry mechanism back to 0x068D5D at step ~735
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

// --- Address labels ---

const ADDR_LABELS = new Map([
  // gcd handler addresses
  [0x068d3d, 'gcd_entry'],
  [0x068d5d, 'gcd_loop_top'],
  [0x068d61, 'gcd_call_OP1toOP2'],
  [0x068d82, 'gcd_algo_body'],
  [0x068d8d, 'gcd_OP1toOP3'],
  [0x068d91, 'gcd_OP1toOP5'],
  [0x068d95, 'gcd_InvSub_call'],
  [0x068da1, 'gcd_JR_NZ_loop'],
  [0x068da3, 'gcd_post_inner_loop'],
  [0x068dea, 'gcd_JP_NC_ErrDomain'],
  [0x068d20, 'gcd_helper'],
  [0x068ecf, 'gcd_LoadType'],

  // FP library
  [0x07c747, 'OP1toOP2_entry'],
  [0x07c74b, 'OP1toOP2+4(CALL_NORM)'],
  [0x07c74f, 'InvSub_entry'],
  [0x07c755, 'OP1toOP2_no_norm'],
  [0x07c771, 'FPSub'],
  [0x07c77f, 'FPAdd'],
  [0x07c783, 'FPAdd+4'],
  [0x07ca06, 'InvOP1S'],
  [0x07ca48, 'Normalize'],
  [0x07ca9f, 'Normalize_RET'],
  [0x07cab9, 'FPDiv_entry'],
  [0x07cc36, 'FPAddSub_core'],

  // OP register copy functions
  [0x07f8a2, 'OP1toOP4'],
  [0x07f8b6, 'Mov9_OP4toOP2'],
  [0x07f8c0, 'Mov9_OP3toOP2'],
  [0x07f8cc, 'Mov9_OP1toOP3'],
  [0x07f8d8, 'Mov9_OP5toOP2'],
  [0x07f8fa, 'Mov9_OP1toOP2'],
  [0x07f914, 'OP4toOP1'],
  [0x07f954, 'OP1toOP6'],
  [0x07f95e, 'OP1toOP3'],

  // Other FP library
  [0x07fa86, 'ConstLoader_1.0'],
  [0x07fab4, 'FDiv100'],
  [0x07fb33, 'Shl14'],
  [0x07fb50, 'Shl14_alt'],
  [0x07fac2, 'BigShift'],
  [0x07fd4a, 'ValidityCheck_OP1'],
  [0x07fdf1, 'DecExp'],
  [0x080188, 'JmpThru'],
  [0x0af8c4, 'SetxxxxOP2(100)'],
  [0x082961, 'PushRealO1'],

  // Sentinel addresses
  [FAKE_RET, 'FAKE_RET'],
  [ERR_CATCH_ADDR, 'ERR_CATCH'],
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

// ==========================================================================
// Main probe
// ==========================================================================

function runProbe(runtime) {
  const { mem, executor, cpu } = runtime;

  // --- Part A: Dense PC trace steps 330-740 ---

  console.log(`\n${'='.repeat(70)}`);
  console.log('PART A: Dense trace gcd(12,8) — every block at steps 330-740');
  console.log(`${'='.repeat(70)}`);

  prepareCallState(cpu, mem);
  seedGcdFpState(mem);

  // Push OP2 (8.0) to FPS before gcd entry (same as phase 157/160/163)
  const fpsPtr = read24(mem, FPS_ADDR);
  const op2Bytes = readBytes(mem, OP2_ADDR, 9);
  for (let i = 0; i < 9; i++) {
    mem[fpsPtr + i] = op2Bytes[i];
  }
  write24(mem, FPS_ADDR, fpsPtr + 9);

  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  console.log(`  Entry: gcd at ${hex(GCD_ENTRY)}`);
  console.log(`  OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP1_ADDR, 9))}`);
  console.log(`  OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP2_ADDR, 9))}`);
  console.log(`  SP: ${hex(cpu.sp)}`);
  console.log('');

  const TRACE_LO = 330;
  const TRACE_HI = 740;

  let stepCount = 0;
  let outcome = 'budget';

  // Part B: collect unique CALL targets
  const callTargets = new Map(); // addr -> { count, firstStep }

  // Part C: track re-entry to 0x068D5D
  let reentryInfo = null;
  let prevPC = null;
  let prevStep = null;
  // Track the last few PCs to understand the mechanism
  const recentPCs = []; // rolling window of last 5 PCs

  function handleBlock(pc, isMissing) {
    const norm = pc & 0xffffff;

    // Track CALL targets: any block entry in the FP library or gcd helper range
    // that is NOT sequential from the previous block is likely a CALL target.
    // We track all unique PCs visited in the range of interest.
    if (stepCount >= 332 && stepCount <= 740) {
      if (!callTargets.has(norm)) {
        callTargets.set(norm, { count: 0, firstStep: stepCount });
      }
      callTargets.get(norm).count++;
    }

    // Track re-entry to loop top
    if (norm === 0x068d5d && stepCount > 400) {
      if (!reentryInfo) {
        reentryInfo = {
          step: stepCount,
          prevPC: prevPC,
          prevStep: prevStep,
          sp: cpu.sp,
          recentPCs: [...recentPCs],
        };
      }
    }

    // Maintain rolling window
    recentPCs.push({ step: stepCount, pc: norm });
    if (recentPCs.length > 10) recentPCs.shift();

    // Log every block in the trace window
    if (stepCount >= TRACE_LO && stepCount <= TRACE_HI) {
      const op1First4 = formatBytes(readBytes(mem, OP1_ADDR, 4));
      const op2First4 = formatBytes(readBytes(mem, OP2_ADDR, 4));
      const aReg = cpu.a & 0xff;
      const sp = cpu.sp;
      const label = addrLabel(norm);
      const missing = isMissing ? ' [MISSING]' : '';

      console.log(
        `  Step ${String(stepCount).padStart(4)}: PC=${hex(norm)}${label}${missing}` +
        `  A=${hexByte(aReg)}  SP=${hex(sp)}` +
        `  OP1=${op1First4}  OP2=${op2First4}`
      );
    }

    prevPC = norm;
    prevStep = stepCount;

    if (norm === FAKE_RET) throw new Error('__RET__');
    if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
  }

  try {
    executor.runFrom(GCD_ENTRY, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,

      onBlock(pc, mode, meta, step) {
        stepCount = noteStep(stepCount, step);
        handleBlock(pc, false);
      },

      onMissingBlock(pc, mode, step) {
        stepCount = noteStep(stepCount, step);
        handleBlock(pc, true);
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

  console.log('');
  console.log(`  ${'='.repeat(60)}`);
  console.log('  TRACE SUMMARY');
  console.log(`  ${'='.repeat(60)}`);
  console.log(`  Outcome: ${outcome}`);
  console.log(`  Total steps: ${stepCount}`);
  console.log(`  Final OP1: [${formatBytes(finalOp1)}] = ${decodeBcdRealBytes(finalOp1)}`);
  console.log(`  Final OP2: [${formatBytes(finalOp2)}] = ${decodeBcdRealBytes(finalOp2)}`);
  console.log(`  errNo: ${hexByte(mem[ERR_NO_ADDR] & 0xff)} (${errName(mem[ERR_NO_ADDR] & 0xff)})`);

  // --- Part B: Function call map ---

  console.log('');
  console.log(`${'='.repeat(70)}`);
  console.log('PART B: Unique block entries (steps 332-740), sorted by first step');
  console.log(`${'='.repeat(70)}`);
  console.log('');

  // Sort by first step
  const sortedTargets = [...callTargets.entries()]
    .sort((a, b) => a[1].firstStep - b[1].firstStep);

  for (const [addr, info] of sortedTargets) {
    const label = ADDR_LABELS.get(addr);
    const name = label ? label : '(unknown)';
    console.log(
      `  ${hex(addr)}  ${name.padEnd(30)}  first=step ${String(info.firstStep).padStart(4)}  count=${info.count}`
    );
  }

  // Also show just the unique addresses sorted by address for easier lookup
  console.log('');
  console.log('  --- Sorted by address ---');
  const byAddr = [...callTargets.entries()].sort((a, b) => a[0] - b[0]);
  for (const [addr, info] of byAddr) {
    const label = ADDR_LABELS.get(addr);
    const name = label ? label : '(unknown)';
    console.log(
      `  ${hex(addr)}  ${name.padEnd(30)}  hits=${info.count}`
    );
  }

  // --- Part C: Re-entry mechanism ---

  console.log('');
  console.log(`${'='.repeat(70)}`);
  console.log('PART C: Re-entry mechanism to 0x068D5D');
  console.log(`${'='.repeat(70)}`);
  console.log('');

  if (reentryInfo) {
    console.log(`  Re-entry to 0x068D5D detected at step ${reentryInfo.step}`);
    console.log(`  Previous block PC: ${hex(reentryInfo.prevPC)}${addrLabel(reentryInfo.prevPC)} (step ${reentryInfo.prevStep})`);
    console.log(`  SP at re-entry: ${hex(reentryInfo.sp)}`);
    console.log('');
    console.log('  Recent PC history leading to re-entry:');
    for (const entry of reentryInfo.recentPCs) {
      console.log(`    Step ${String(entry.step).padStart(4)}: PC=${hex(entry.pc)}${addrLabel(entry.pc)}`);
    }

    // Analyze the mechanism
    console.log('');
    const prev = reentryInfo.prevPC;
    if (prev >= 0x068d3d && prev <= 0x068dea) {
      console.log('  MECHANISM: Direct fall-through or jump from within gcd handler.');
    } else if (prev === 0x080188 || ADDR_LABELS.get(prev)?.includes('JmpThru')) {
      console.log('  MECHANISM: Indirect jump via JmpThru at 0x080188.');
    } else {
      console.log(`  MECHANISM: Block at ${hex(prev)} transitions to 0x068D5D.`);
      console.log('  This could be: RET from a CALL, JP/JR, or fall-through.');
    }

    // Check ROM bytes at prevPC to see what instruction is there
    if (prev < 0x400000) {
      const instrBytes = [];
      for (let i = 0; i < 6; i++) {
        instrBytes.push(hexByte(romBytes[prev + i] & 0xff));
      }
      console.log(`  ROM bytes at ${hex(prev)}: ${instrBytes.join(' ')}`);
    }
  } else {
    console.log('  Re-entry to 0x068D5D NOT detected within the step budget.');
    console.log('  The outer loop may require more than 2000 steps, or the');
    console.log('  re-entry address may differ from 0x068D5D.');

    // Show last few PCs to understand where execution ended
    console.log('');
    console.log('  Last PCs before budget/exit:');
    for (const entry of recentPCs) {
      console.log(`    Step ${String(entry.step).padStart(4)}: PC=${hex(entry.pc)}${addrLabel(entry.pc)}`);
    }
  }
}

// --- Main ---

function main() {
  console.log('=== Phase 164: Outer loop trace gcd(12,8) — steps 330-740 ===');
  console.log('');

  const runtime = createPreparedRuntime();

  if (!runtime.memInitOk) {
    console.log('MEM_INIT failed; aborting.');
    process.exitCode = 1;
    return;
  }

  console.log('Cold boot + MEM_INIT complete.');

  runProbe(runtime);

  console.log('\nDone.');
  process.exitCode = 0;
}

try {
  main();
} catch (err) {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
}
