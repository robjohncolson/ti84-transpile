#!/usr/bin/env node

/**
 * Phase 163 - Dense trace of gcd(12,8) second iteration (steps 330-600).
 *
 * Traces EVERY block executed between steps 330 and 600, covering the
 * second iteration of the Euclidean loop after the JR NZ jump-back at ~step 333.
 *
 * Part A: Dense block trace steps 330-600 with OP1/OP2/OP4/OP5 state
 * Part B: OP2 state at key moments (loop jump, body re-entry, copy ops, InvSub)
 * Part C: Summary — is the second iteration different? OP5→OP2 timing analysis
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
  [0x07f8a2, 'OP1toOP4'],
  [0x07f8b6, 'Mov9_OP4toOP2'],
  [0x07f8d8, 'OP5toOP2'],
  [0x07f8fa, 'Mov9_OP1toOP2'],
  [0x07f95e, 'OP1toOP3'],
  [0x07fa86, 'ConstLoader_1.0'],
  [0x07fb33, 'Shl14'],
  [0x07fb50, 'Shl14_alt'],
  [0x07fac2, 'BigShift'],
  [0x07fd4a, 'ValidityCheck_OP1'],
  [0x07fdf1, 'DecExp'],
  [0x080188, 'JmpThru'],
  [0x068d3d, 'gcd_entry'],
  [0x068d5d, 'gcd_loop_top'],
  [0x068d61, 'gcd_call_OP1toOP2'],
  [0x068d82, 'gcd_algo_body'],
  [0x068d8d, 'gcd_OP1toOP3'],
  [0x068d91, 'gcd_OP1toOP5'],
  [0x068d95, 'gcd_InvSub_call'],
  [0x068da1, 'gcd_JR_NZ_loop'],
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

// ==========================================================================
// Part A: Dense block trace steps 330-600
// ==========================================================================

function denseTrace(runtime) {
  const { mem, executor, cpu } = runtime;

  console.log(`\n${'='.repeat(70)}`);
  console.log('PART A: Dense trace gcd(12,8) — every block at steps 330-600');
  console.log(`${'='.repeat(70)}`);

  prepareCallState(cpu, mem);
  seedGcdFpState(mem);

  // Push OP2 (8.0) to FPS before gcd entry (same as phase 157/160)
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
  console.log(`  OP4: [${formatBytes(readBytes(mem, OP4_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP4_ADDR, 9))}`);
  console.log(`  OP5: [${formatBytes(readBytes(mem, OP5_ADDR, 9))}] = ${decodeBcdRealBytes(readBytes(mem, OP5_ADDR, 9))}`);
  console.log(`  FPS ptr: ${hex(read24(mem, FPS_ADDR))}`);
  console.log(`  SP: ${hex(cpu.sp)}`);
  console.log('');

  let stepCount = 0;
  let outcome = 'budget';

  const TRACE_LO = 330;
  const TRACE_HI = 600;

  // Part B tracking: OP2 at key moments
  const partB = {
    atStep333: null,
    firstLoopTop: null,      // first block in 0x068D5D-0x068D81 after step 333
    firstBodyReentry: null,  // first block in 0x068D82-0x068DEA after step 333
    beforeOP1toOP4: null,    // just before 0x07F8A2 in iteration 2 (after step 333)
    beforeOP4toOP2: null,    // just before 0x07F8B6 in iteration 2 (after step 333)
    beforeOP5toOP2: null,    // just before 0x07F8D8 in iteration 2 (after step 333)
    atInvSub: null,          // at 0x07C74F in iteration 2 (after step 333)
  };

  // Track iteration 2 detection
  let passedStep333 = false;
  let seenLoopTopAfter333 = false;
  let seenBodyReentryAfter333 = false;
  let seenOP1toOP4After333 = false;
  let seenOP4toOP2After333 = false;
  let seenOP5toOP2After333 = false;
  let seenInvSubAfter333 = false;

  // Part C tracking: ordering of OP copy ops in iteration 2
  const partC = {
    op4toOP2Step: null,
    op5toOP2Step: null,
    invSubStep: null,
    op1toOP4Step: null,
  };

  function captureOP2(label) {
    const op2 = readBytes(mem, OP2_ADDR, 9);
    return {
      label,
      step: stepCount,
      bytes: formatBytes(op2),
      decoded: decodeBcdRealBytes(op2),
    };
  }

  function logBlock(norm, isMissing) {
    const op1 = readBytes(mem, OP1_ADDR, 9);
    const op2 = readBytes(mem, OP2_ADDR, 9);
    const op4 = readBytes(mem, OP4_ADDR, 9);
    const op5 = readBytes(mem, OP5_ADDR, 9);
    const op1Dec = decodeBcdRealBytes(op1);
    const op2Dec = decodeBcdRealBytes(op2);
    const op4Dec = decodeBcdRealBytes(op4);
    const op5Dec = decodeBcdRealBytes(op5);
    const fpsVal = read24(mem, FPS_ADDR);
    const aReg = cpu.a & 0xff;
    const sp = cpu.sp;
    const label = addrLabel(norm);
    const missing = isMissing ? ' [MISSING]' : '';

    console.log(
      `  Step ${String(stepCount).padStart(4)}: PC=${hex(norm)}${label}${missing}` +
      `  A=${hexByte(aReg)}  SP=${hex(sp)}  FPS=${hex(fpsVal)}`
    );
    console.log(
      `    OP1=[${formatBytes(op1)}] = ${op1Dec}`
    );
    console.log(
      `    OP2=[${formatBytes(op2)}] = ${op2Dec}`
    );
    console.log(
      `    OP4=[${formatBytes(op4)}] = ${op4Dec}`
    );
    console.log(
      `    OP5=[${formatBytes(op5)}] = ${op5Dec}`
    );
  }

  function trackPartB(norm) {
    // Detect crossing step 333
    if (stepCount >= 333 && !passedStep333) {
      passedStep333 = true;
      partB.atStep333 = captureOP2('at_step_333');
    }

    if (!passedStep333) return;

    // First block in loop top range after step 333
    if (!seenLoopTopAfter333 && norm >= 0x068d5d && norm <= 0x068d81) {
      seenLoopTopAfter333 = true;
      partB.firstLoopTop = captureOP2(`loop_top_${hex(norm)}`);
    }

    // First block in body range after step 333
    if (!seenBodyReentryAfter333 && norm >= 0x068d82 && norm <= 0x068dea) {
      seenBodyReentryAfter333 = true;
      partB.firstBodyReentry = captureOP2(`body_reentry_${hex(norm)}`);
    }

    // OP1→OP4 in iteration 2
    if (!seenOP1toOP4After333 && norm === 0x07f8a2) {
      seenOP1toOP4After333 = true;
      partB.beforeOP1toOP4 = captureOP2('before_OP1toOP4_iter2');
      partC.op1toOP4Step = stepCount;
    }

    // OP4→OP2 (Mov9) in iteration 2
    if (!seenOP4toOP2After333 && norm === 0x07f8b6) {
      seenOP4toOP2After333 = true;
      partB.beforeOP4toOP2 = captureOP2('before_OP4toOP2_iter2');
      partC.op4toOP2Step = stepCount;
    }

    // OP5→OP2 in iteration 2
    if (!seenOP5toOP2After333 && norm === 0x07f8d8) {
      seenOP5toOP2After333 = true;
      partB.beforeOP5toOP2 = captureOP2('before_OP5toOP2_iter2');
      partC.op5toOP2Step = stepCount;
    }

    // InvSub entry in iteration 2
    if (!seenInvSubAfter333 && norm === 0x07c74f) {
      seenInvSubAfter333 = true;
      partB.atInvSub = captureOP2('at_InvSub_iter2');
      partC.invSubStep = stepCount;
    }
  }

  try {
    executor.runFrom(GCD_ENTRY, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,

      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);

        // Track Part B events
        trackPartB(norm);

        // Log every block in the trace window
        if (stepCount >= TRACE_LO && stepCount <= TRACE_HI) {
          logBlock(norm, false);
        }

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },

      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);

        trackPartB(norm);

        if (stepCount >= TRACE_LO && stepCount <= TRACE_HI) {
          logBlock(norm, true);
        }

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
  const finalOp4 = readBytes(mem, OP4_ADDR, 9);
  const finalOp5 = readBytes(mem, OP5_ADDR, 9);

  console.log('');
  console.log(`  ${'='.repeat(60)}`);
  console.log('  TRACE SUMMARY');
  console.log(`  ${'='.repeat(60)}`);
  console.log(`  Outcome: ${outcome}`);
  console.log(`  Total steps: ${stepCount}`);
  console.log(`  Final OP1: [${formatBytes(finalOp1)}] = ${decodeBcdRealBytes(finalOp1)}`);
  console.log(`  Final OP2: [${formatBytes(finalOp2)}] = ${decodeBcdRealBytes(finalOp2)}`);
  console.log(`  Final OP4: [${formatBytes(finalOp4)}] = ${decodeBcdRealBytes(finalOp4)}`);
  console.log(`  Final OP5: [${formatBytes(finalOp5)}] = ${decodeBcdRealBytes(finalOp5)}`);
  console.log(`  errNo: ${hexByte(mem[ERR_NO_ADDR] & 0xff)} (${errName(mem[ERR_NO_ADDR] & 0xff)})`);

  // === Part B ===
  console.log('');
  console.log(`${'='.repeat(70)}`);
  console.log('PART B: OP2 state at key moments in iteration 2');
  console.log(`${'='.repeat(70)}`);

  const moments = [
    ['At step 333 (loop jump back)', partB.atStep333],
    ['First loop-top block (0x068D5D-0x068D81) after step 333', partB.firstLoopTop],
    ['First body block (0x068D82-0x068DEA) after step 333', partB.firstBodyReentry],
    ['Before OP1->OP4 (0x07F8A2) in iter 2', partB.beforeOP1toOP4],
    ['Before OP4->OP2 (0x07F8B6) in iter 2', partB.beforeOP4toOP2],
    ['Before OP5->OP2 (0x07F8D8) in iter 2', partB.beforeOP5toOP2],
    ['At InvSub entry (0x07C74F) in iter 2', partB.atInvSub],
  ];

  for (const [desc, data] of moments) {
    if (data) {
      console.log(`  ${desc}:`);
      console.log(`    Step ${data.step}: OP2=[${data.bytes}] = ${data.decoded}`);
    } else {
      console.log(`  ${desc}: NOT REACHED`);
    }
  }

  // === Part C ===
  console.log('');
  console.log(`${'='.repeat(70)}`);
  console.log('PART C: Summary — Second iteration analysis');
  console.log(`${'='.repeat(70)}`);

  console.log('');
  console.log('  Copy operation ordering in iteration 2:');
  const ops = [
    ['OP1->OP4 (0x07F8A2)', partC.op1toOP4Step],
    ['OP4->OP2 (0x07F8B6)', partC.op4toOP2Step],
    ['OP5->OP2 (0x07F8D8)', partC.op5toOP2Step],
    ['InvSub  (0x07C74F)', partC.invSubStep],
  ];

  // Sort by step to show execution order
  const reachedOps = ops.filter(([, s]) => s !== null).sort((a, b) => a[1] - b[1]);
  const unreachedOps = ops.filter(([, s]) => s === null);

  for (const [name, step] of reachedOps) {
    console.log(`    Step ${String(step).padStart(4)}: ${name}`);
  }
  for (const [name] of unreachedOps) {
    console.log(`    NOT REACHED: ${name}`);
  }

  console.log('');
  if (partC.op4toOP2Step !== null && partC.op5toOP2Step !== null) {
    if (partC.op5toOP2Step < partC.op4toOP2Step) {
      console.log('  FINDING: OP5->OP2 fires BEFORE OP4->OP2 in iteration 2.');
      console.log('  => OP5 restore happens first, then OP4->OP2 OVERWRITES it.');
      console.log('  => This means OP2 at InvSub entry contains OP4 (=OP1), not the original OP2.');
    } else {
      console.log('  FINDING: OP4->OP2 fires BEFORE OP5->OP2 in iteration 2.');
      console.log('  => OP4->OP2 fires first, then OP5->OP2 restores the correct value.');
      if (partC.invSubStep !== null) {
        if (partC.invSubStep > partC.op5toOP2Step) {
          console.log('  => InvSub sees the restored OP2 from OP5. This should be correct.');
        } else {
          console.log('  => BUT InvSub fires BEFORE OP5->OP2! OP2 is still wrong at InvSub entry.');
        }
      }
    }
  } else if (partC.op5toOP2Step === null) {
    console.log('  FINDING: OP5->OP2 (0x07F8D8) was NOT reached in iteration 2 (within budget).');
    if (partC.op4toOP2Step !== null) {
      console.log('  => OP4->OP2 DID fire, so OP2 gets overwritten with OP4 (=OP1).');
      console.log('  => Without OP5 restore, OP2 = OP1 at InvSub entry -> subtraction gives 0.');
    }
  } else {
    console.log('  FINDING: Neither OP4->OP2 nor OP5->OP2 reached. Unexpected.');
  }

  // Compare OP2 at InvSub in iter 1 vs iter 2
  console.log('');
  if (partB.atInvSub) {
    console.log(`  OP2 at InvSub in iteration 2: [${partB.atInvSub.bytes}] = ${partB.atInvSub.decoded}`);
    console.log('  (Compare with iteration 1 from session 162 to see if OP2 differs)');
  }
}

// --- Main ---

function main() {
  console.log('=== Phase 163: Dense gcd(12,8) trace — steps 330-600, second iteration ===');
  console.log('');

  const runtime = createPreparedRuntime();

  if (!runtime.memInitOk) {
    console.log('MEM_INIT failed; aborting.');
    process.exitCode = 1;
    return;
  }

  console.log('Cold boot + MEM_INIT complete.');

  denseTrace(runtime);

  console.log('\nDone.');
  process.exitCode = 0;
}

try {
  main();
} catch (err) {
  console.error(err?.stack || String(err));
  process.exitCode = 1;
}
