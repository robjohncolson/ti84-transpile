#!/usr/bin/env node

/**
 * Phase 156 v2 - FPDiv comparison: FPDiv(12,8) vs FPDiv(1200,1200)
 *
 * CORRECTED: enters FPDiv implementation directly at 0x07CAB9
 * instead of JT slot 0x0201F4 (which fell through to SqRoot at 0x0201F8).
 *
 * Logs OP1 and OP2 at every block, compares the two traces
 * side-by-side to find the divergence point and track exponent byte
 * trajectories.
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

// CORRECTED: use FPDiv implementation address, not JT slot
const FPDIV_IMPL_ADDR = 0x07cab9;
const FAKE_RET = 0x7eedf3;
const ERR_CATCH_ADDR = 0x7ffffa;

const MAX_LOOP_ITER = 8192;
const MAX_STEPS = 2000;
const FPS_CLEAN_AREA = 0xd1aa00;

// BCD operands
const BCD_12   = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_8    = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_1200 = Uint8Array.from([0x00, 0x83, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

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

// --- Run FPDiv and collect trace ---

function runFPDiv(executor, cpu, mem, op1Bytes, op2Bytes, label) {
  prepareCallState(cpu, mem);

  // Seed allocator and FPS
  seedAllocator(mem);
  mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 0x40);
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA);

  // Seed OP1 and OP2
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 11);
  mem.fill(0x00, OP2_ADDR, OP2_ADDR + 11);
  mem.set(op1Bytes, OP1_ADDR);
  mem.set(op2Bytes, OP2_ADDR);

  // Push FAKE_RET on stack so RET from FPDiv returns to our sentinel
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  // Error frame
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  const trace = [];
  let stepCount = 0;
  let outcome = 'budget';

  try {
    executor.runFrom(FPDIV_IMPL_ADDR, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = typeof step === 'number' ? Math.max(stepCount, step + 1) : stepCount + 1;

        const op1 = readBytes(mem, OP1_ADDR, 9);
        const op2 = readBytes(mem, OP2_ADDR, 9);
        trace.push({ step: stepCount, pc: norm, op1, op2 });

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = typeof step === 'number' ? Math.max(stepCount, step + 1) : stepCount + 1;

        const op1 = readBytes(mem, OP1_ADDR, 9);
        const op2 = readBytes(mem, OP2_ADDR, 9);
        trace.push({ step: stepCount, pc: norm, op1, op2, missing: true });

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
  const fps = read24(mem, FPS_ADDR);

  return { label, trace, outcome, stepCount, finalOp1, finalOp2, errNo, fps };
}

// --- Comparison and output ---

function main() {
  console.log('=== Phase 156 v2: FPDiv comparison — entry at 0x07CAB9 (impl, not JT slot) ===');
  console.log('=== FPDiv(12,8) vs FPDiv(1200,1200) ===');
  console.log('');

  const { mem, executor, cpu } = createRuntime();
  coldBoot(executor, cpu, mem);

  if (!runMemInit(executor, cpu, mem)) {
    console.log('ERROR: MEM_INIT failed');
    process.exitCode = 1;
    return;
  }

  // Run both divisions
  const run12_8 = runFPDiv(executor, cpu, mem, BCD_12, BCD_8, 'FPDiv(12,8)');
  const run1200 = runFPDiv(executor, cpu, mem, BCD_1200, BCD_1200, 'FPDiv(1200,1200)');

  // Print individual summaries
  for (const run of [run12_8, run1200]) {
    console.log(`--- ${run.label} ---`);
    console.log(`Outcome: ${run.outcome}  Steps: ${run.stepCount}  errNo: ${hexByte(run.errNo)} (${errName(run.errNo)})`);
    console.log(`Final OP1: [${formatBytes(run.finalOp1)}]`);
    console.log(`Final OP2: [${formatBytes(run.finalOp2)}]`);
    console.log(`Final FPS: ${hex(run.fps)}`);

    // Interpret result
    const sign = run.finalOp1[0];
    const exp = run.finalOp1[1];
    const mantissa = run.finalOp1.slice(2).map(b => hexByte(b)).join('');
    const expVal = exp - 0x80;
    console.log(`  -> sign=${hexByte(sign)} exp=${hexByte(exp)} (10^${expVal}) mantissa=${mantissa}`);
    console.log('');
  }

  // Full trace dump for both
  for (const run of [run12_8, run1200]) {
    console.log(`=== Full trace: ${run.label} (${run.trace.length} entries) ===`);
    for (const entry of run.trace) {
      const miss = entry.missing ? ' [MISSING]' : '';
      console.log(
        `  [${String(entry.step).padStart(3)}] PC=${hex(entry.pc)} ` +
        `OP1=[${formatBytes(entry.op1)}] OP2=[${formatBytes(entry.op2)}]${miss}`
      );
    }
    console.log('');
  }

  // Side-by-side comparison: find first divergence
  const traceA = run12_8.trace;
  const traceB = run1200.trace;
  const minLen = Math.min(traceA.length, traceB.length);

  console.log('=== Side-by-side comparison ===');
  console.log('');

  let firstDivergenceStep = -1;
  let firstPcDivergence = -1;
  let firstOp1Divergence = -1;
  let firstExpDivergence = -1;

  for (let i = 0; i < minLen; i++) {
    const a = traceA[i];
    const b = traceB[i];
    const pcMatch = a.pc === b.pc;
    const op1Match = formatBytes(a.op1) === formatBytes(b.op1);
    const op2Match = formatBytes(a.op2) === formatBytes(b.op2);
    const expMatch = a.op1[1] === b.op1[1];

    if (!pcMatch && firstPcDivergence < 0) firstPcDivergence = i;
    if (!op1Match && firstOp1Divergence < 0) firstOp1Divergence = i;
    if (!expMatch && firstExpDivergence < 0) firstExpDivergence = i;
    if ((!pcMatch || !op1Match || !op2Match) && firstDivergenceStep < 0) {
      firstDivergenceStep = i;
    }
  }

  if (firstDivergenceStep < 0 && traceA.length !== traceB.length) {
    firstDivergenceStep = minLen;
  }

  if (firstDivergenceStep < 0) {
    console.log('Traces are IDENTICAL (no divergence found).');
  } else {
    console.log(`First divergence at trace index ${firstDivergenceStep}`);
    if (firstPcDivergence >= 0) console.log(`  First PC divergence at index ${firstPcDivergence}`);
    if (firstOp1Divergence >= 0) console.log(`  First OP1 divergence at index ${firstOp1Divergence}`);
    if (firstExpDivergence >= 0) console.log(`  First exponent divergence at index ${firstExpDivergence}`);
    console.log('');

    // Print context: 3 steps before divergence through 10 steps after
    const startIdx = Math.max(0, firstDivergenceStep - 3);
    const endIdx = Math.min(minLen, firstDivergenceStep + 10);

    console.log('Context around first divergence:');
    console.log('');

    for (let i = startIdx; i < endIdx; i++) {
      const a = traceA[i];
      const b = traceB[i];
      const pcMatch = a.pc === b.pc;
      const op1Match = formatBytes(a.op1) === formatBytes(b.op1);
      const op2Match = formatBytes(a.op2) === formatBytes(b.op2);
      const marker = (pcMatch && op1Match && op2Match) ? '  ' : '>>';

      console.log(`${marker} [idx ${String(i).padStart(3)}]`);
      console.log(`   A: step=${String(a.step).padStart(3)} PC=${hex(a.pc)} OP1=[${formatBytes(a.op1)}] OP2=[${formatBytes(a.op2)}]`);
      console.log(`   B: step=${String(b.step).padStart(3)} PC=${hex(b.pc)} OP1=[${formatBytes(b.op1)}] OP2=[${formatBytes(b.op2)}]`);
    }
  }

  // Exponent byte trajectory
  console.log('');
  console.log('=== Exponent byte (OP1[1]) trajectory ===');
  console.log('');

  const maxTraceLen = Math.max(traceA.length, traceB.length);
  let lastExpA = -1;
  let lastExpB = -1;

  console.log('Step  |  A: OP1[1]  PC          |  B: OP1[1]  PC          |  Match');
  console.log('------+-------------------------+-------------------------+------');

  for (let i = 0; i < maxTraceLen; i++) {
    const a = i < traceA.length ? traceA[i] : null;
    const b = i < traceB.length ? traceB[i] : null;
    const expA = a ? a.op1[1] : -1;
    const expB = b ? b.op1[1] : -1;

    // Only print when exponent changes or at key moments
    const expAChanged = expA !== lastExpA;
    const expBChanged = expB !== lastExpB;
    const isFirst5 = i < 5;
    const isDivergence = firstDivergenceStep >= 0 && i >= firstDivergenceStep - 1 && i <= firstDivergenceStep + 5;
    const isLast = i === maxTraceLen - 1;

    if (expAChanged || expBChanged || isFirst5 || isDivergence || isLast) {
      const aStr = a ? `${hexByte(expA)}      ${hex(a.pc)}` : '(end)                ';
      const bStr = b ? `${hexByte(expB)}      ${hex(b.pc)}` : '(end)                ';
      const match = (a && b && expA === expB) ? 'yes' : ' NO';
      const changeNote = [];
      if (expAChanged && i > 0) changeNote.push('A changed');
      if (expBChanged && i > 0) changeNote.push('B changed');
      const note = changeNote.length > 0 ? `  << ${changeNote.join(', ')}` : '';
      console.log(
        `${String(i).padStart(5)} |  ${aStr} |  ${bStr} |  ${match}${note}`
      );
    }

    lastExpA = expA;
    lastExpB = expB;
  }

  // Print OP2 exponent trajectory too for completeness
  console.log('');
  console.log('=== Exponent byte (OP2[1]) trajectory ===');
  console.log('');

  let lastExp2A = -1;
  let lastExp2B = -1;

  console.log('Step  |  A: OP2[1]  PC          |  B: OP2[1]  PC          |  Match');
  console.log('------+-------------------------+-------------------------+------');

  for (let i = 0; i < maxTraceLen; i++) {
    const a = i < traceA.length ? traceA[i] : null;
    const b = i < traceB.length ? traceB[i] : null;
    const exp2A = a ? a.op2[1] : -1;
    const exp2B = b ? b.op2[1] : -1;

    const changed = exp2A !== lastExp2A || exp2B !== lastExp2B;
    const isFirst5 = i < 5;
    const isLast = i === maxTraceLen - 1;

    if (changed || isFirst5 || isLast) {
      const aStr = a ? `${hexByte(exp2A)}      ${hex(a.pc)}` : '(end)                ';
      const bStr = b ? `${hexByte(exp2B)}      ${hex(b.pc)}` : '(end)                ';
      const match = (a && b && exp2A === exp2B) ? 'yes' : ' NO';
      const changeNote = [];
      if (exp2A !== lastExp2A && i > 0) changeNote.push('A changed');
      if (exp2B !== lastExp2B && i > 0) changeNote.push('B changed');
      const note = changeNote.length > 0 ? `  << ${changeNote.join(', ')}` : '';
      console.log(
        `${String(i).padStart(5)} |  ${aStr} |  ${bStr} |  ${match}${note}`
      );
    }

    lastExp2A = exp2A;
    lastExp2B = exp2B;
  }

  // Trace length summary
  console.log('');
  console.log(`Trace lengths: A=${traceA.length}, B=${traceB.length}`);

  // Expected results check
  console.log('');
  console.log('=== Expected results check ===');
  const exp12_8 = run12_8.finalOp1;
  const exp1200 = run1200.finalOp1;

  // 1.5 = [00, 80, 15, 00, 00, 00, 00, 00, 00]
  const expected_1_5 = [0x00, 0x80, 0x15, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  // 1.0 = [00, 80, 10, 00, 00, 00, 00, 00, 00]
  const expected_1_0 = [0x00, 0x80, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];

  const match12_8 = formatBytes(exp12_8) === formatBytes(expected_1_5);
  const match1200 = formatBytes(exp1200) === formatBytes(expected_1_0);

  console.log(`12/8 = 1.5?  ${match12_8 ? 'PASS' : 'FAIL'}  got=[${formatBytes(exp12_8)}]  expected=[${formatBytes(expected_1_5)}]`);
  console.log(`1200/1200 = 1.0?  ${match1200 ? 'PASS' : 'FAIL'}  got=[${formatBytes(exp1200)}]  expected=[${formatBytes(expected_1_0)}]`);
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
