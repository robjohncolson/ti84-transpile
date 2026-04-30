#!/usr/bin/env node

/**
 * Phase 159 - FPDiv Context Divergence Probe
 *
 * Investigates why FPDiv(1200,1200) returns 1.0 when called directly at
 * 0x07CAB9 but returns 1199 when reached via bypass (intercept 0x07CA48
 * -> redirect to 0x07CAB9).
 *
 * Part A: Capture CPU+memory state at FPDiv entry in DIRECT call
 * Part B: Capture CPU+memory state at FPDiv entry in BYPASS call
 * Part C: Diff the two states
 * Part D: Isolate causal state by fixing one register at a time
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

const NORM_ADDR = 0x07ca48;
const FPDIV_ADDR = 0x07cab9;

const FAKE_RET = 0xffffff;
const ERR_CATCH_ADDR = 0x7ffffa;

const MAX_LOOP_ITER = 8192;
const MAX_STEPS = 500;
const FPS_CLEAN_AREA = 0xd1aa00;

const BCD_1200 = Uint8Array.from([0x00, 0x83, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

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
  return `unknown(${hexByte(code)})`;
}

function formatFlags(f) {
  const bits = [];
  if (f & 0x80) bits.push('S');
  if (f & 0x40) bits.push('Z');
  if (f & 0x20) bits.push('5');
  if (f & 0x10) bits.push('H');
  if (f & 0x08) bits.push('3');
  if (f & 0x04) bits.push('P/V');
  if (f & 0x02) bits.push('N');
  if (f & 0x01) bits.push('C');
  return bits.length > 0 ? bits.join('|') : 'none';
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

function seedFpState(mem) {
  seedAllocator(mem);
  mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 0x40);
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA);

  // Seed OP1 and OP2 with BCD 1200
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 11);
  mem.fill(0x00, OP2_ADDR, OP2_ADDR + 11);
  mem.set(BCD_1200, OP1_ADDR);
  mem.set(BCD_1200, OP2_ADDR);
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

function createPreparedRuntime() {
  const runtime = createRuntime();
  coldBoot(runtime.executor, runtime.cpu, runtime.mem);
  const memInitOk = runMemInit(runtime.executor, runtime.cpu, runtime.mem);
  return { ...runtime, memInitOk };
}

// --- State capture ---

function captureState(cpu, mem) {
  return {
    a: cpu.a & 0xff,
    f: cpu.f & 0xff,
    b: cpu.b & 0xff,
    c: cpu.c & 0xff,
    d: cpu.d & 0xff,
    e: cpu.e & 0xff,
    h: cpu.h & 0xff,
    l: cpu.l & 0xff,
    ix: cpu._ix >>> 0,
    iy: cpu._iy >>> 0,
    sp: cpu.sp >>> 0,
    op1: readBytes(mem, OP1_ADDR, 9),
    op2: readBytes(mem, OP2_ADDR, 9),
    fps: read24(mem, FPS_ADDR),
    mem_d00604: mem[0xd00604] & 0xff,
    mem_d02ac8: mem[0xd02ac8] & 0xff,
  };
}

function stateEntries(state) {
  const entries = [];
  entries.push({ name: 'A', val: state.a, fmt: (v) => hex(v, 2) });
  entries.push({ name: 'F', val: state.f, fmt: (v) => `${hex(v, 2)} (${formatFlags(v)})` });
  entries.push({ name: 'B', val: state.b, fmt: (v) => hex(v, 2) });
  entries.push({ name: 'C', val: state.c, fmt: (v) => hex(v, 2) });
  entries.push({ name: 'D', val: state.d, fmt: (v) => hex(v, 2) });
  entries.push({ name: 'E', val: state.e, fmt: (v) => hex(v, 2) });
  entries.push({ name: 'H', val: state.h, fmt: (v) => hex(v, 2) });
  entries.push({ name: 'L', val: state.l, fmt: (v) => hex(v, 2) });
  entries.push({ name: 'IX', val: state.ix, fmt: (v) => hex(v, 6) });
  entries.push({ name: 'IY', val: state.iy, fmt: (v) => hex(v, 6) });
  entries.push({ name: 'SP', val: state.sp, fmt: (v) => hex(v, 6) });
  entries.push({ name: 'OP1', val: state.op1, fmt: (v) => `[${formatBytes(v)}] => ${decodeBcdRealBytes(v)}` });
  entries.push({ name: 'OP2', val: state.op2, fmt: (v) => `[${formatBytes(v)}] => ${decodeBcdRealBytes(v)}` });
  entries.push({ name: 'FPS ptr', val: state.fps, fmt: (v) => hex(v, 6) });
  entries.push({ name: '[D00604]', val: state.mem_d00604, fmt: (v) => hex(v, 2) });
  entries.push({ name: '[D02AC8]', val: state.mem_d02ac8, fmt: (v) => hex(v, 2) });
  return entries;
}

function valuesEqual(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}

// --- Run FPDiv with state capture at entry ---

function runFPDivDirect(executor, cpu, mem) {
  prepareCallState(cpu, mem);
  seedFpState(mem);
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  let entryState = null;
  let stepCount = 0;
  let outcome = 'budget';
  let capturedOnFirst = false;

  try {
    executor.runFrom(FPDIV_ADDR, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = typeof step === 'number' ? Math.max(stepCount, step + 1) : stepCount + 1;

        // Capture state at the very first block (FPDiv entry)
        if (!capturedOnFirst) {
          capturedOnFirst = true;
          entryState = captureState(cpu, mem);
        }

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = typeof step === 'number' ? Math.max(stepCount, step + 1) : stepCount + 1;
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
  const errNo = mem[ERR_NO_ADDR] & 0xff;
  return { entryState, outcome, stepCount, finalOp1, errNo };
}

function runFPDivBypass(executor, cpu, mem) {
  prepareCallState(cpu, mem);
  seedFpState(mem);
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  let entryState = null;
  let stepCount = 0;
  let outcome = 'budget';

  // Inject bypass block: when PC=0x07CA48, redirect to 0x07CAB9
  const normKey = '07ca48:adl';
  const origBlock = executor.compiledBlocks[normKey];
  executor.compiledBlocks[normKey] = function bypassNormalization(cpu) {
    return FPDIV_ADDR;
  };

  let capturedAtFPDiv = false;

  try {
    executor.runFrom(NORM_ADDR, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = typeof step === 'number' ? Math.max(stepCount, step + 1) : stepCount + 1;

        // Capture state when we first hit FPDiv entry after bypass
        if (norm === FPDIV_ADDR && !capturedAtFPDiv) {
          capturedAtFPDiv = true;
          entryState = captureState(cpu, mem);
        }

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = typeof step === 'number' ? Math.max(stepCount, step + 1) : stepCount + 1;
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

  // Restore original block
  if (origBlock) {
    executor.compiledBlocks[normKey] = origBlock;
  } else {
    delete executor.compiledBlocks[normKey];
  }

  const finalOp1 = readBytes(mem, OP1_ADDR, 9);
  const errNo = mem[ERR_NO_ADDR] & 0xff;
  return { entryState, outcome, stepCount, finalOp1, errNo };
}

// --- Part D: Isolate causal state ---

function runFPDivWithFix(executor, cpu, mem, fixName, applyFix) {
  prepareCallState(cpu, mem);
  seedFpState(mem);
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  // Inject bypass block
  const normKey = '07ca48:adl';
  const origBlock = executor.compiledBlocks[normKey];
  executor.compiledBlocks[normKey] = function bypassNormalization(cpu) {
    return FPDIV_ADDR;
  };

  let stepCount = 0;
  let outcome = 'budget';
  let fixApplied = false;

  try {
    executor.runFrom(NORM_ADDR, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = typeof step === 'number' ? Math.max(stepCount, step + 1) : stepCount + 1;

        // Apply fix just before FPDiv runs
        if (norm === FPDIV_ADDR && !fixApplied) {
          fixApplied = true;
          applyFix(cpu, mem);
        }

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = typeof step === 'number' ? Math.max(stepCount, step + 1) : stepCount + 1;
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

  // Restore
  if (origBlock) {
    executor.compiledBlocks[normKey] = origBlock;
  } else {
    delete executor.compiledBlocks[normKey];
  }

  const finalOp1 = readBytes(mem, OP1_ADDR, 9);
  const errNo = mem[ERR_NO_ADDR] & 0xff;
  return { outcome, stepCount, finalOp1, errNo, result: decodeBcdRealBytes(finalOp1) };
}

// --- Main ---

function main() {
  console.log('=== Phase 159: FPDiv Context Divergence Probe ===');
  console.log('Why does FPDiv(1200/1200) return 1.0 directly but 1199 via bypass?');
  console.log('');

  const runtime = createPreparedRuntime();

  if (!runtime.memInitOk) {
    console.log('MEM_INIT failed; aborting.');
    process.exitCode = 1;
    return;
  }

  const { mem, executor, cpu } = runtime;

  // ==================== Part A: Direct FPDiv call ====================
  console.log('========================================');
  console.log('PART A: Direct FPDiv(1200,1200) at 0x07CAB9');
  console.log('========================================');

  const partA = runFPDivDirect(executor, cpu, mem);
  const resultA = decodeBcdRealBytes(partA.finalOp1);

  console.log(`Outcome: ${partA.outcome}`);
  console.log(`Steps: ${partA.stepCount}`);
  console.log(`errNo: ${hex(partA.errNo, 2)} (${errName(partA.errNo)})`);
  console.log(`Result OP1: [${formatBytes(partA.finalOp1)}] => ${resultA}`);
  console.log('');

  if (partA.entryState) {
    console.log('Entry state at FPDiv:');
    for (const e of stateEntries(partA.entryState)) {
      console.log(`  ${e.name.padEnd(12)}: ${e.fmt(e.val)}`);
    }
  } else {
    console.log('WARNING: Failed to capture entry state for Part A');
  }
  console.log('');

  // ==================== Part B: Bypass FPDiv call ====================
  console.log('========================================');
  console.log('PART B: Bypass FPDiv(1200,1200) via 0x07CA48->0x07CAB9');
  console.log('========================================');

  const partB = runFPDivBypass(executor, cpu, mem);
  const resultB = decodeBcdRealBytes(partB.finalOp1);

  console.log(`Outcome: ${partB.outcome}`);
  console.log(`Steps: ${partB.stepCount}`);
  console.log(`errNo: ${hex(partB.errNo, 2)} (${errName(partB.errNo)})`);
  console.log(`Result OP1: [${formatBytes(partB.finalOp1)}] => ${resultB}`);
  console.log('');

  if (partB.entryState) {
    console.log('Entry state at FPDiv:');
    for (const e of stateEntries(partB.entryState)) {
      console.log(`  ${e.name.padEnd(12)}: ${e.fmt(e.val)}`);
    }
  } else {
    console.log('WARNING: Failed to capture entry state for Part B');
  }
  console.log('');

  // ==================== Part C: Diff ====================
  console.log('========================================');
  console.log('PART C: State Diff at FPDiv Entry');
  console.log('========================================');

  if (!partA.entryState || !partB.entryState) {
    console.log('Cannot diff: missing entry state from Part A or Part B.');
    return;
  }

  const entriesA = stateEntries(partA.entryState);
  const entriesB = stateEntries(partB.entryState);
  const diffs = [];

  console.log('');
  console.log(`${'Register'.padEnd(12)} | ${'Part A (direct)'.padEnd(40)} | ${'Part B (bypass)'.padEnd(40)} | Status`);
  console.log(`${'-'.repeat(12)} | ${'-'.repeat(40)} | ${'-'.repeat(40)} | ------`);

  for (let i = 0; i < entriesA.length; i++) {
    const a = entriesA[i];
    const b = entriesB[i];
    const match = valuesEqual(a.val, b.val);
    const status = match ? 'MATCH' : 'DIFFER';
    const aStr = a.fmt(a.val);
    const bStr = b.fmt(b.val);
    console.log(`${a.name.padEnd(12)} | ${aStr.padEnd(40)} | ${bStr.padEnd(40)} | ${status}`);

    if (!match) {
      diffs.push({ name: a.name, valA: a.val, valB: b.val });
    }
  }

  console.log('');
  console.log(`Total differences: ${diffs.length}`);
  if (diffs.length > 0) {
    console.log('Differing items: ' + diffs.map((d) => d.name).join(', '));
  }
  console.log('');

  // ==================== Part D: Isolate causal state ====================
  console.log('========================================');
  console.log('PART D: Isolate Causal State');
  console.log('========================================');

  if (diffs.length === 0) {
    console.log('No differences found! States are identical at FPDiv entry.');
    console.log('The divergence must come from something NOT captured (shadow regs, stack contents, etc.).');
    return;
  }

  console.log(`Testing ${diffs.length} differing register(s)/value(s)...`);
  console.log('For each: run bypass, fix ONE value to match direct, check result.');
  console.log('');

  for (const diff of diffs) {
    const fixFn = buildFixFn(diff.name, diff.valA, partA.entryState);
    if (!fixFn) {
      console.log(`  ${diff.name}: SKIP (no fix function available)`);
      continue;
    }

    const result = runFPDivWithFix(executor, cpu, mem, diff.name, fixFn);
    const isFixed = result.result === '1';
    console.log(
      `  Fix ${diff.name.padEnd(12)} => result=${result.result.padEnd(12)} ` +
      `outcome=${result.outcome} errNo=${hex(result.errNo, 2)} ` +
      `${isFixed ? '*** FIXES IT ***' : ''}`
    );
  }

  // Also try fixing ALL diffs at once
  console.log('');
  console.log('  Fixing ALL differing values at once:');
  const allFixFn = (cpu, mem) => {
    for (const diff of diffs) {
      const fn = buildFixFn(diff.name, diff.valA, partA.entryState);
      if (fn) fn(cpu, mem);
    }
  };
  const allResult = runFPDivWithFix(executor, cpu, mem, 'ALL', allFixFn);
  const allFixed = allResult.result === '1';
  console.log(
    `  Fix ALL              => result=${allResult.result.padEnd(12)} ` +
    `outcome=${allResult.outcome} errNo=${hex(allResult.errNo, 2)} ` +
    `${allFixed ? '*** FIXES IT ***' : ''}`
  );

  // ==================== Summary ====================
  console.log('');
  console.log('========================================');
  console.log('SUMMARY');
  console.log('========================================');
  console.log(`Part A (direct):  ${resultA} (${partA.outcome})`);
  console.log(`Part B (bypass):  ${resultB} (${partB.outcome})`);
  console.log(`Diffs at entry:   ${diffs.length} — ${diffs.map((d) => d.name).join(', ')}`);
}

function buildFixFn(name, targetVal, directState) {
  switch (name) {
    case 'A': return (cpu) => { cpu.a = targetVal; };
    case 'F': return (cpu) => { cpu.f = targetVal; };
    case 'B': return (cpu) => { cpu.b = targetVal; };
    case 'C': return (cpu) => { cpu.c = targetVal; };
    case 'D': return (cpu) => { cpu.d = targetVal; };
    case 'E': return (cpu) => { cpu.e = targetVal; };
    case 'H': return (cpu) => { cpu.h = targetVal; };
    case 'L': return (cpu) => { cpu.l = targetVal; };
    case 'IX': return (cpu) => { cpu._ix = targetVal; };
    case 'IY': return (cpu) => { cpu._iy = targetVal; };
    case 'SP': return (cpu) => { cpu.sp = targetVal; };
    case 'OP1': return (cpu, mem) => { mem.set(targetVal, OP1_ADDR); };
    case 'OP2': return (cpu, mem) => { mem.set(targetVal, OP2_ADDR); };
    case 'FPS ptr': return (cpu, mem) => { write24(mem, FPS_ADDR, targetVal); };
    case '[D00604]': return (cpu, mem) => { mem[0xd00604] = targetVal; };
    case '[D02AC8]': return (cpu, mem) => { mem[0xd02ac8] = targetVal; };
    default: return null;
  }
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
