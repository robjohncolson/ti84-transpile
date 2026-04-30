#!/usr/bin/env node

/**
 * Phase 149 - gcd(12,8) OP1/OP2 sign-trace probe.
 *
 * Goal:
 *   - Run the direct gcd handler at 0x068D3D after MEM_INIT.
 *   - Capture OP1[0..8] and OP2[0..8] before every executed block.
 *   - Report every transition where OP1[0] or OP2[0] changes.
 *   - Show the exact state at 0x07F831.
 *   - Summarize how the 0x07F831 comparator treats bit 7 / 0x80.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

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

const FP_CATEGORY_ADDR = 0xd0060e;

const GCD_DIRECT_ADDR = 0x068d3d;
const TYPE_VALIDATOR_ADDR = 0x07f831;
const SIGN_NEG_PATH_ADDR = 0x07f86d;
const SIGN_POS_PATH_ADDR = 0x07f850;
const TYPE_COMPARE_ADDR = 0x080037;
const REAL_FP_POP_ADDR = 0x0828fc;
const FPS_DEC9_ADDR = 0x082912;
const CONST_ONE_LOADER_ADDR = 0x07fa74;

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const MEMINIT_BUDGET = 100000;
const MAX_STEPS = 5000;
const MAX_LOOP_ITER = 8192;

const FPS_CLEAN_AREA = 0xd1aa00;
const FPS_ENTRY_SIZE = 9;
const GCD_CATEGORY = 0x28;

const BCD_12 = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_8 = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_4 = Uint8Array.from([0x00, 0x80, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const formatBlockKey = (pc, mode = 'adl') =>
  `${pc.toString(16).padStart(6, '0')}:${mode}`;

const hex = (v, w = 6) =>
  v === undefined || v === null
    ? 'n/a'
    : `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;

const hexByte = (v) =>
  (v & 0xff).toString(16).toUpperCase().padStart(2, '0');

const read24 = (m, a) =>
  ((m[a] & 0xff) | ((m[a + 1] & 0xff) << 8) | ((m[a + 2] & 0xff) << 16)) >>> 0;

function write24(m, a, v) {
  m[a] = v & 0xff;
  m[a + 1] = (v >>> 8) & 0xff;
  m[a + 2] = (v >>> 16) & 0xff;
}

function readHexArray(mem, addr, len) {
  return Array.from(mem.subarray(addr, addr + len), (byte) => hexByte(byte));
}

function hexBytes(mem, addr, len) {
  return readHexArray(mem, addr, len).join(' ');
}

function decodeBCDFloat(mem, addr) {
  const type = mem[addr] & 0xff;
  const exp = mem[addr + 1] & 0xff;
  const digits = [];
  for (let i = 2; i < 9; i++) {
    const b = mem[addr + i] & 0xff;
    digits.push((b >> 4) & 0xf, b & 0xf);
  }
  const sign = (type & 0x80) ? -1 : 1;
  const exponent = (exp & 0x7f) - 0x40;
  if (digits.every((d) => d === 0)) return '0';
  let mantissa = '';
  for (let i = 0; i < digits.length; i++) {
    if (i === exponent + 1) mantissa += '.';
    mantissa += digits[i];
  }
  return `${sign < 0 ? '-' : ''}${mantissa.replace(/\.?0+$/, '') || '0'} (exp=${exponent})`;
}

function blockDisasm(pc, mode = 'adl') {
  const block = BLOCKS[formatBlockKey(pc, mode)];
  if (!block?.instructions?.length) return '(missing block)';
  return block.instructions
    .map((inst) => `${hex(inst.pc)} ${inst.dasm}`)
    .join(' | ');
}

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
  return base;
}

function seedAllocator(mem) {
  write24(mem, OPBASE_ADDR, EMPTY_VAT_ADDR);
  write24(mem, OPS_ADDR, EMPTY_VAT_ADDR);
  mem.fill(0x00, PTEMPCNT_ADDR, PTEMPCNT_ADDR + 4);
  write24(mem, PTEMP_ADDR, EMPTY_VAT_ADDR);
  write24(mem, PROGPTR_ADDR, EMPTY_VAT_ADDR);
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA);
  write24(mem, NEWDATA_PTR_ADDR, USERMEM_ADDR);
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
  } catch (error) {
    if (error?.message === '__RET__') ok = true;
    else throw error;
  }
  return ok;
}

function createPreparedRuntime() {
  const runtime = createRuntime();
  coldBoot(runtime.executor, runtime.cpu, runtime.mem);
  const memInitOk = runMemInit(runtime.executor, runtime.cpu, runtime.mem);
  return { ...runtime, memInitOk };
}

function seedGcdState(mem) {
  seedAllocator(mem);

  mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 32);
  mem.set(BCD_12, FPS_CLEAN_AREA);
  mem.set(BCD_8, FPS_CLEAN_AREA + FPS_ENTRY_SIZE);
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA + (2 * FPS_ENTRY_SIZE));

  mem.set(BCD_12, OP1_ADDR);
  mem.fill(0x00, OP1_ADDR + 9, OP1_ADDR + 11);
  mem.set(BCD_8, OP2_ADDR);
  mem.fill(0x00, OP2_ADDR + 9, OP2_ADDR + 11);

  write24(mem, OPBASE_ADDR, EMPTY_VAT_ADDR);
  write24(mem, OPS_ADDR, EMPTY_VAT_ADDR);
  write24(mem, PTEMP_ADDR, EMPTY_VAT_ADDR);
  write24(mem, PROGPTR_ADDR, EMPTY_VAT_ADDR);
  write24(mem, NEWDATA_PTR_ADDR, USERMEM_ADDR);

  mem[FP_CATEGORY_ADDR] = GCD_CATEGORY;
}

function makeSnapshot(mem, pc, step) {
  return {
    step,
    pc,
    op1: readHexArray(mem, OP1_ADDR, 9),
    op2: readHexArray(mem, OP2_ADDR, 9),
  };
}

function runGcdTrace() {
  const { mem, executor, cpu, memInitOk } = createPreparedRuntime();
  if (!memInitOk) {
    return {
      memInitOk,
      outcome: 'meminit-failed',
      baseline: null,
      results: [],
      hitCounts: new Map(),
      errNo: null,
    };
  }

  seedGcdState(mem);
  prepareCallState(cpu, mem);
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  const baseline = makeSnapshot(mem, null, 0);
  const results = [];
  const hitCounts = new Map();

  let outcome = 'budget';
  let thrownMessage = null;
  let lastPc = null;

  const record = (pc, step) => {
    const norm = pc & 0xffffff;
    const displayStep = (typeof step === 'number' ? step : results.length) + 1;
    results.push(makeSnapshot(mem, norm, displayStep));
    hitCounts.set(norm, (hitCounts.get(norm) || 0) + 1);
    lastPc = norm;
    if (norm === FAKE_RET) throw new Error('__RET__');
    if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
  };

  try {
    executor.runFrom(GCD_DIRECT_ADDR, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _mode, _meta, step) {
        record(pc, step);
      },
      onMissingBlock(pc, _mode, step) {
        record(pc, step);
      },
    });
  } catch (error) {
    if (error?.message === '__RET__') {
      outcome = 'return';
    } else if (error?.message === '__ERR__') {
      outcome = 'error';
    } else {
      outcome = 'threw';
      thrownMessage = error?.stack || String(error);
    }
  }

  return {
    memInitOk,
    outcome,
    thrownMessage,
    baseline,
    results,
    hitCounts,
    lastPc,
    errNo: mem[ERR_NO_ADDR] & 0xff,
    finalOp1Hex: hexBytes(mem, OP1_ADDR, 9),
    finalOp2Hex: hexBytes(mem, OP2_ADDR, 9),
    finalOp1Value: decodeBCDFloat(mem, OP1_ADDR),
    finalOp2Value: decodeBCDFloat(mem, OP2_ADDR),
    fpsPtr: read24(mem, FPS_ADDR),
    fpsBase: read24(mem, FPSBASE_ADDR),
  };
}

function findTypeTransitions(baseline, results) {
  const transitions = [];
  let prev = baseline;
  for (const snap of results) {
    if (snap.op1[0] !== prev.op1[0] || snap.op2[0] !== prev.op2[0]) {
      transitions.push({
        step: snap.step,
        pc: snap.pc,
        prevStep: prev.step,
        prevPc: prev.pc,
        op1Before: prev.op1[0],
        op1After: snap.op1[0],
        op2Before: prev.op2[0],
        op2After: snap.op2[0],
      });
    }
    prev = snap;
  }
  return transitions;
}

function printTransitions(transitions) {
  console.log('========================================================================');
  console.log('Type-Byte Transitions (OP1[0] / OP2[0])');
  console.log('========================================================================');

  if (transitions.length === 0) {
    console.log('None observed.');
    console.log('');
    return;
  }

  for (const change of transitions) {
    const pieces = [];
    if (change.op1Before !== change.op1After) {
      pieces.push(`OP1[0] ${change.op1Before} -> ${change.op1After}`);
    }
    if (change.op2Before !== change.op2After) {
      pieces.push(`OP2[0] ${change.op2Before} -> ${change.op2After}`);
    }
    console.log(`step ${change.step.toString().padStart(4, ' ')} @ ${hex(change.pc)}: ${pieces.join(', ')}`);
    if (change.prevPc === null) {
      console.log('  prior state: pre-run seed');
    } else {
      console.log(`  prior step ${change.prevStep} @ ${hex(change.prevPc)}: ${blockDisasm(change.prevPc)}`);
    }
    console.log(`  current block ${hex(change.pc)}: ${blockDisasm(change.pc)}`);
  }
  console.log('');
}

function printCorruptionHighlights(transitions) {
  const corruptions = transitions.filter(
    (change) =>
      (change.op1Before === '00' && change.op1After === '80') ||
      (change.op2Before === '00' && change.op2After === '80')
  );

  console.log('========================================================================');
  console.log('0x00 -> 0x80 Highlights');
  console.log('========================================================================');

  if (corruptions.length === 0) {
    console.log('No direct 0x00 -> 0x80 transition observed at block boundaries.');
    console.log('');
    return;
  }

  for (const change of corruptions) {
    console.log(`step ${change.step.toString().padStart(4, ' ')} @ ${hex(change.pc)}`);
    if (change.op1Before === '00' && change.op1After === '80') {
      console.log('  OP1[0] flipped 00 -> 80');
    }
    if (change.op2Before === '00' && change.op2After === '80') {
      console.log('  OP2[0] flipped 00 -> 80');
    }
    console.log(`  likely writer block: ${change.prevPc === null ? 'pre-run seed' : hex(change.prevPc)}`);
    if (change.prevPc !== null) {
      console.log(`  ${blockDisasm(change.prevPc)}`);
    }
  }
  console.log('');
}

function printValidatorHits(results) {
  const validatorHits = results.filter((snap) => snap.pc === TYPE_VALIDATOR_ADDR);

  console.log('========================================================================');
  console.log(`0x07F831 Entry Snapshots (${hex(TYPE_VALIDATOR_ADDR)})`);
  console.log('========================================================================');

  if (validatorHits.length === 0) {
    console.log('The validator entry was not reached.');
    console.log('');
    return;
  }

  for (const snap of validatorHits) {
    console.log(
      `step ${snap.step.toString().padStart(4, ' ')}: OP1[0]=${snap.op1[0]} OP2[0]=${snap.op2[0]} ` +
      `OP1=[${snap.op1.join(' ')}] OP2=[${snap.op2.join(' ')}]`
    );
  }
  console.log('');
}

function printValidatorRegionHits(results) {
  const interesting = new Set([
    TYPE_VALIDATOR_ADDR,
    0x07f843,
    SIGN_NEG_PATH_ADDR,
    SIGN_POS_PATH_ADDR,
    TYPE_COMPARE_ADDR,
    0x07f883,
  ]);
  const hits = results.filter((snap) => interesting.has(snap.pc));

  console.log('========================================================================');
  console.log('Validator Region Path');
  console.log('========================================================================');

  if (hits.length === 0) {
    console.log('No validator-region hits recorded.');
    console.log('');
    return;
  }

  for (const snap of hits) {
    console.log(
      `step ${snap.step.toString().padStart(4, ' ')} @ ${hex(snap.pc)} ` +
      `OP1[0]=${snap.op1[0]} OP2[0]=${snap.op2[0]}`
    );
  }
  console.log('');
}

function printValidatorInterpretation() {
  const evidence = [
    [0x07f843, 'loads OP1[0], preserves its sign flags, then loads OP2[0]'],
    [SIGN_NEG_PATH_ADDR, 'masks with 0x80 after taking the OP1-negative path'],
    [SIGN_POS_PATH_ADDR, 'masks OP2[0] with 0x80 on the OP1-nonnegative path'],
    [TYPE_COMPARE_ADDR, 'compares the following byte after sign handling'],
  ];

  console.log('========================================================================');
  console.log('0x80 Interpretation at 0x07F831 (Inference From ROM Blocks)');
  console.log('========================================================================');

  for (const [pc, note] of evidence) {
    console.log(`${hex(pc)}: ${blockDisasm(pc)}`);
    console.log(`  ${note}`);
  }

  console.log('');
  console.log('Inference:');
  console.log('- The 0x07F831 routine is using bit 7 / 0x80 as sign-state, not as an invalid object-type sentinel.');
  console.log('- `0x07F843` tests OP1[0] sign via `or a` then branches on `jp m`.');
  console.log('- `0x07F850` explicitly does `and 0x80` on OP2[0].');
  console.log('- After the sign checks, the routine continues into byte comparison rather than raising an error itself.');
  console.log('- In this path, E_Domain comes from the caller interpreting the comparator flags, not from 0x07F831 rejecting 0x80 as a bad type code.');
  console.log('');
}

function printSummary(trace) {
  console.log('========================================================================');
  console.log('Run Summary');
  console.log('========================================================================');
  console.log(`Outcome: ${trace.outcome}`);
  console.log(`Snapshots captured: ${trace.results.length}`);
  console.log(`errNo: ${hex(trace.errNo, 2)}`);
  console.log(`Final OP1: [${trace.finalOp1Hex}] => ${trace.finalOp1Value}`);
  console.log(`Final OP2: [${trace.finalOp2Hex}] => ${trace.finalOp2Value}`);
  console.log(`FPS base: ${hex(trace.fpsBase)}`);
  console.log(`FPS ptr:  ${hex(trace.fpsPtr)}`);
  console.log(`Hit count ${hex(REAL_FP_POP_ADDR)}: ${trace.hitCounts.get(REAL_FP_POP_ADDR) || 0}`);
  console.log(`Hit count ${hex(FPS_DEC9_ADDR)}: ${trace.hitCounts.get(FPS_DEC9_ADDR) || 0}`);
  console.log(`Hit count ${hex(CONST_ONE_LOADER_ADDR)}: ${trace.hitCounts.get(CONST_ONE_LOADER_ADDR) || 0}`);
  if (trace.lastPc !== null) {
    console.log(`Last PC observed: ${hex(trace.lastPc)}`);
  }
  if (trace.thrownMessage) {
    console.log(`Thrown: ${trace.thrownMessage.split('\n')[0]}`);
  }
  console.log('');
}

function main() {
  console.log('=== Phase 149: gcd sign trace probe ===');
  console.log('');

  const trace = runGcdTrace();
  if (!trace.memInitOk) {
    console.log('MEM_INIT failed.');
    process.exitCode = 1;
    return;
  }

  console.log('Initial seeded state:');
  console.log(`  OP1: [${trace.baseline.op1.join(' ')}]`);
  console.log(`  OP2: [${trace.baseline.op2.join(' ')}]`);
  console.log(`  Expected gcd(12,8): [${Array.from(BCD_4, (byte) => hexByte(byte)).join(' ')}]`);
  console.log('');

  printSummary(trace);

  const transitions = findTypeTransitions(trace.baseline, trace.results);
  printTransitions(transitions);
  printCorruptionHighlights(transitions);
  printValidatorHits(trace.results);
  printValidatorRegionHits(trace.results);
  printValidatorInterpretation();
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
