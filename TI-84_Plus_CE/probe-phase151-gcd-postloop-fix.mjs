#!/usr/bin/env node

/**
 * Phase 151 - gcd post-loop sign-byte cleanup probe.
 *
 * Goal:
 *   A. Intercept the late return path at 0x082912 after the last validator
 *      check and clear the stray sign bits on OP1[0] / OP2[0].
 *   B. Run the broken path for exactly 1442 steps (or until it naturally
 *      returns/errors), then apply the same mask as a diagnostic.
 *   C. Log the exact blocks around steps 1440-1445 to show where the final
 *      return path runs after the gcd core at 0x068D3D.
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
const GCD_DISPATCH_ADDR = 0x06859b;
const GCD_CATEGORY = 0x28;

const TYPE_VALIDATOR_ADDR = 0x07f831;
const FPS_DEC9_ADDR = 0x082912;
const FPS_DEC9_RET_ADDR = 0x08292b;
const GCD_TAIL_JP_ADDR = 0x068d59;

const FAKE_RET = 0x7eedf3;
const ERR_CATCH_ADDR = 0x7ffffa;

const MEMINIT_BUDGET = 100000;
const MAX_STEPS = 2000;
const MAX_LOOP_ITER = 8192;

const APPROACH_A_ARM_STEP = 1400;
const APPROACH_B_STEPS = 1442;
const TRACE_WINDOW_START = 1440;
const TRACE_WINDOW_END = 1445;

const FPS_CLEAN_AREA = 0xd1aa00;
const FPS_ENTRY_SIZE = 9;

const BCD_12 = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_8 = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_4 = Uint8Array.from([0x00, 0x80, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const EXPECTED_GCD_HEX = Array.from(
  BCD_4,
  (byte) => byte.toString(16).toUpperCase().padStart(2, '0')
).join(' ');

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

function hexBytes(mem, addr, len) {
  const out = [];
  for (let i = 0; i < len; i++) {
    out.push(hexByte(mem[addr + i]));
  }
  return out.join(' ');
}

function readByteVector(mem, addr, len) {
  return Array.from(mem.subarray(addr, addr + len), (byte) => byte & 0xff);
}

function decodeBCDFloat(mem, addr) {
  const type = mem[addr] & 0xff;
  const exp = mem[addr + 1] & 0xff;
  const digits = [];
  for (let i = 2; i < 9; i++) {
    const b = mem[addr + i] & 0xff;
    digits.push((b >> 4) & 0x0f, b & 0x0f);
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

function errName(code) {
  if (code === 0x00) return 'none';
  if (code === 0x84) return 'E_Domain';
  if (code === 0x88) return 'E_Syntax';
  if (code === 0x8d) return 'E_Undefined';
  if (code === 0x80) return 'E_Edit';
  if (code === 0x81) return 'E_Overflow';
  return `unknown(${hex(code, 2)})`;
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

  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 32);
  mem.set(BCD_12, FPS_CLEAN_AREA);
  mem.set(BCD_8, FPS_CLEAN_AREA + FPS_ENTRY_SIZE);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA + (2 * FPS_ENTRY_SIZE));

  mem.set(BCD_12, OP1_ADDR);
  mem.fill(0x00, OP1_ADDR + 9, OP1_ADDR + 11);
  mem.set(BCD_8, OP2_ADDR);
  mem.fill(0x00, OP2_ADDR + 9, OP2_ADDR + 11);
  mem[FP_CATEGORY_ADDR] = GCD_CATEGORY;
}

function noteStep(stepCount, step) {
  if (typeof step === 'number') {
    return Math.max(stepCount, step + 1);
  }
  return stepCount + 1;
}

function snapshotOpState(mem) {
  return {
    op1Type: mem[OP1_ADDR] & 0xff,
    op2Type: mem[OP2_ADDR] & 0xff,
    op1Hex: hexBytes(mem, OP1_ADDR, 9),
    op2Hex: hexBytes(mem, OP2_ADDR, 9),
    op1Value: decodeBCDFloat(mem, OP1_ADDR),
    op2Value: decodeBCDFloat(mem, OP2_ADDR),
  };
}

function maskOpSigns(mem) {
  mem[OP1_ADDR] &= 0x3f;
  mem[OP2_ADDR] &= 0x3f;
}

function looksLikeRealTypes(mem) {
  return ((mem[OP1_ADDR] & 0x3f) === 0x00) && ((mem[OP2_ADDR] & 0x3f) === 0x00);
}

function buildBaseRunResult(runtime) {
  return {
    ...runtime,
    outcome: 'meminit-failed',
    success: false,
    errNo: null,
    op1Hex: null,
    op2Hex: null,
    op1Value: null,
    op2Value: null,
    stepCount: 0,
    lastMissingBlock: null,
    thrownMessage: null,
    seededOp1Hex: null,
    seededOp2Hex: null,
  };
}

function finalizeRunResult(result, mem) {
  result.errNo = mem[ERR_NO_ADDR] & 0xff;
  result.op1Hex = hexBytes(mem, OP1_ADDR, 9);
  result.op2Hex = hexBytes(mem, OP2_ADDR, 9);
  result.op1Value = decodeBCDFloat(mem, OP1_ADDR);
  result.op2Value = decodeBCDFloat(mem, OP2_ADDR);
  result.finalFpsBase = read24(mem, FPSBASE_ADDR);
  result.finalFpsPtr = read24(mem, FPS_ADDR);
  result.success =
    result.outcome === 'return' &&
    result.errNo === 0x00 &&
    result.op1Hex === EXPECTED_GCD_HEX;
}

function runGcdWithHooks({ maxSteps = MAX_STEPS, onEvent = null, entryPc = GCD_DIRECT_ADDR, configureCpu = null } = {}) {
  const runtime = createPreparedRuntime();
  const { mem, executor, cpu, memInitOk } = runtime;

  const result = buildBaseRunResult(runtime);
  if (!memInitOk) return result;

  seedGcdState(mem);
  prepareCallState(cpu, mem);
  if (configureCpu) configureCpu(cpu, mem);
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  result.seededOp1Hex = hexBytes(mem, OP1_ADDR, 9);
  result.seededOp2Hex = hexBytes(mem, OP2_ADDR, 9);

  try {
    executor.runFrom(entryPc, 'adl', {
      maxSteps,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        result.stepCount = noteStep(result.stepCount, step);
        onEvent?.({
          kind: 'block',
          pc: norm,
          mode,
          meta,
          step: result.stepCount,
          mem,
          cpu,
          result,
        });
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        result.stepCount = noteStep(result.stepCount, step);
        result.lastMissingBlock = norm;
        onEvent?.({
          kind: 'missing',
          pc: norm,
          mode,
          meta: null,
          step: result.stepCount,
          mem,
          cpu,
          result,
        });
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
    });
    result.outcome = 'budget';
  } catch (error) {
    if (error?.message === '__RET__') {
      result.outcome = 'return';
    } else if (error?.message === '__ERR__') {
      result.outcome = 'error';
    } else {
      result.outcome = 'threw';
      result.thrownMessage = error?.stack || String(error);
    }
  }

  finalizeRunResult(result, mem);
  return result;
}

function runApproachA() {
  const maskHits = [];

  const result = runGcdWithHooks({
    maxSteps: MAX_STEPS,
    onEvent(event) {
      if (event.kind !== 'block') return;
      if (event.pc !== FPS_DEC9_ADDR) return;
      if (event.step <= APPROACH_A_ARM_STEP) return;

      const before = snapshotOpState(event.mem);
      maskOpSigns(event.mem);
      const after = snapshotOpState(event.mem);
      maskHits.push({
        step: event.step,
        pc: event.pc,
        before,
        after,
      });
    },
  });

  result.maskHits = maskHits;
  result.approachWorked = result.success;
  return result;
}

function runApproachB() {
  const result = runGcdWithHooks({
    maxSteps: APPROACH_B_STEPS,
  });

  if (!result.memInitOk) return result;

  const beforeMask = snapshotOpState(result.mem);
  maskOpSigns(result.mem);
  const afterMask = snapshotOpState(result.mem);

  result.beforeMask = beforeMask;
  result.afterMask = afterMask;
  result.postMaskRealTypes = looksLikeRealTypes(result.mem);
  result.postMaskExpectedOp1 = afterMask.op1Hex === EXPECTED_GCD_HEX;
  result.postMaskErrNo = result.mem[ERR_NO_ADDR] & 0xff;
  result.approachWorked = result.postMaskRealTypes && result.postMaskExpectedOp1 && result.postMaskErrNo === 0x00;

  return result;
}

function makeTraceEvent(event) {
  return {
    step: event.step,
    kind: event.kind,
    pc: event.pc,
    mode: event.mode,
    block: blockDisasm(event.pc, event.mode),
    op1Type: hexByte(event.mem[OP1_ADDR]),
    op2Type: hexByte(event.mem[OP2_ADDR]),
    op1Hex: hexBytes(event.mem, OP1_ADDR, 9),
    op2Hex: hexBytes(event.mem, OP2_ADDR, 9),
  };
}

function runApproachC() {
  const trace = [];

  const result = runGcdWithHooks({
    maxSteps: MAX_STEPS,
    onEvent(event) {
      if (event.step < TRACE_WINDOW_START || event.step > TRACE_WINDOW_END) return;
      trace.push(makeTraceEvent(event));
    },
  });

  result.trace = trace;
  result.returnPathCandidate =
    trace.find((entry) => entry.pc === FPS_DEC9_ADDR || entry.pc === FPS_DEC9_RET_ADDR || entry.pc === GCD_TAIL_JP_ADDR) ??
    trace[0] ??
    null;
  result.approachWorked = false;
  return result;
}

function printHeader(title) {
  console.log('========================================================================');
  console.log(title);
  console.log('========================================================================');
}

function printCommonSeedInfo(result) {
  console.log(`Entry: ${hex(GCD_DIRECT_ADDR)}`);
  console.log(`Seeded OP1: [${result.seededOp1Hex}]`);
  console.log(`Seeded OP2: [${result.seededOp2Hex}]`);
  console.log(`Expected gcd OP1: [${EXPECTED_GCD_HEX}]`);
  console.log('');
}

function printOutcome(result) {
  console.log(`Outcome: ${result.outcome}`);
  console.log(`Steps: ${result.stepCount}`);
  console.log(`errNo: ${hex(result.errNo, 2)} (${errName(result.errNo)})`);
  console.log(`Final OP1: [${result.op1Hex}] => ${result.op1Value}`);
  console.log(`Final OP2: [${result.op2Hex}] => ${result.op2Value}`);
  if (result.lastMissingBlock !== null) {
    console.log(`Last missing block: ${hex(result.lastMissingBlock)}`);
  }
  if (result.thrownMessage) {
    console.log(`Thrown: ${result.thrownMessage.split('\n')[0]}`);
  }
}

function printApproachA(result) {
  printHeader('Approach A - Late onBlock mask at 0x082912');

  if (!result.memInitOk) {
    console.log('MEM_INIT failed; gcd scenario did not run.');
    console.log('');
    return;
  }

  printCommonSeedInfo(result);
  console.log(`Armed after step: ${APPROACH_A_ARM_STEP}`);
  console.log(`Mask site: ${hex(FPS_DEC9_ADDR)} (${blockDisasm(FPS_DEC9_ADDR)})`);
  console.log('');

  if (result.maskHits.length === 0) {
    console.log('No late 0x082912 hit was observed.');
  } else {
    console.log(`Late 0x082912 mask hits: ${result.maskHits.length}`);
    for (const hit of result.maskHits) {
      console.log(
        `  step ${String(hit.step).padStart(4, ' ')} @ ${hex(hit.pc)}: ` +
        `OP1[0] ${hex(hit.before.op1Type, 2)} -> ${hex(hit.after.op1Type, 2)}, ` +
        `OP2[0] ${hex(hit.before.op2Type, 2)} -> ${hex(hit.after.op2Type, 2)}`
      );
      console.log(`    before OP1=[${hit.before.op1Hex}] OP2=[${hit.before.op2Hex}]`);
      console.log(`    after  OP1=[${hit.after.op1Hex}] OP2=[${hit.after.op2Hex}]`);
    }
  }
  console.log('');

  printOutcome(result);
  console.log(`Approach A worked: ${result.approachWorked ? 'YES' : 'NO'}`);
  console.log('');
}

function printApproachB(result) {
  printHeader('Approach B - 1442-step diagnostic post-mask');

  if (!result.memInitOk) {
    console.log('MEM_INIT failed; gcd scenario did not run.');
    console.log('');
    return;
  }

  printCommonSeedInfo(result);
  console.log(`Step cap: ${APPROACH_B_STEPS}`);
  console.log('');

  printOutcome(result);
  console.log('');
  console.log(`Before mask OP1[0]/OP2[0]: ${hex(result.beforeMask.op1Type, 2)} / ${hex(result.beforeMask.op2Type, 2)}`);
  console.log(`Before mask OP1: [${result.beforeMask.op1Hex}] => ${result.beforeMask.op1Value}`);
  console.log(`Before mask OP2: [${result.beforeMask.op2Hex}] => ${result.beforeMask.op2Value}`);
  console.log(`After mask OP1[0]/OP2[0]: ${hex(result.afterMask.op1Type, 2)} / ${hex(result.afterMask.op2Type, 2)}`);
  console.log(`After mask OP1: [${result.afterMask.op1Hex}] => ${result.afterMask.op1Value}`);
  console.log(`After mask OP2: [${result.afterMask.op2Hex}] => ${result.afterMask.op2Value}`);
  console.log(`Masked bytes look like real descriptors: ${result.postMaskRealTypes ? 'YES' : 'NO'}`);
  console.log(`Masked OP1 matches 4.0: ${result.postMaskExpectedOp1 ? 'YES' : 'NO'}`);
  console.log(`errNo after diagnostic mask: ${hex(result.postMaskErrNo, 2)} (${errName(result.postMaskErrNo)})`);
  console.log(`Approach B worked as a runtime fix: ${result.approachWorked ? 'YES' : 'NO'}`);
  console.log('');
}

function printApproachC(result) {
  printHeader('Approach C - Return-path block trace at steps 1440-1445');

  if (!result.memInitOk) {
    console.log('MEM_INIT failed; gcd scenario did not run.');
    console.log('');
    return;
  }

  printCommonSeedInfo(result);
  console.log(`Trace window: steps ${TRACE_WINDOW_START}-${TRACE_WINDOW_END}`);
  console.log('');

  if (result.trace.length === 0) {
    console.log('No blocks were captured in the requested step window.');
  } else {
    for (const entry of result.trace) {
      console.log(
        `step ${String(entry.step).padStart(4, ' ')} ` +
        `[${entry.kind}] ${hex(entry.pc)} ${entry.block}`
      );
      console.log(
        `  OP1[0]=${entry.op1Type} OP2[0]=${entry.op2Type} ` +
        `OP1=[${entry.op1Hex}] OP2=[${entry.op2Hex}]`
      );
    }
  }
  console.log('');

  printOutcome(result);
  if (result.returnPathCandidate) {
    console.log('');
    console.log(
      `Return-path candidate: step ${result.returnPathCandidate.step} ` +
      `${hex(result.returnPathCandidate.pc)} ${result.returnPathCandidate.block}`
    );
  }
  console.log('');
}

function printSummary(resultA, resultB, resultC) {
  printHeader('Summary');

  const winner = resultA.approachWorked
    ? 'Approach A'
    : resultB.approachWorked
      ? 'Approach B'
      : 'none';

  console.log(`Working approach: ${winner}`);
  console.log(`Approach A success criterion: ${resultA.approachWorked ? 'PASS' : 'FAIL'}`);
  console.log(`Approach B diagnostic mask: ${resultB.postMaskExpectedOp1 ? 'OP1=4.0' : 'OP1!=4.0'}, errNo=${hex(resultB.postMaskErrNo ?? 0, 2)}`);
  console.log(
    `Approach C return window: ${resultC.trace.length > 0 ? `${hex(resultC.trace[0].pc)} .. ${hex(resultC.trace[resultC.trace.length - 1].pc)}` : 'empty'}`
  );
  console.log('');
  console.log(`Key blocks: tail ${hex(GCD_TAIL_JP_ADDR)} -> FPS dec-9 ${hex(FPS_DEC9_ADDR)} -> ret ${hex(FPS_DEC9_RET_ADDR)} -> sentinel ${hex(FAKE_RET)}`);
  console.log(`Last validator site (for reference): ${hex(TYPE_VALIDATOR_ADDR)}`);
  console.log('');
}

function main() {
  console.log('=== Phase 151: gcd post-loop sign-byte cleanup probe ===');
  console.log('');

  const resultA = runApproachA();
  const resultB = runApproachB();
  const resultC = runApproachC();

  printApproachA(resultA);
  printApproachB(resultB);
  printApproachC(resultC);
  printSummary(resultA, resultB, resultC);

  if (resultA.approachWorked) {
    process.exitCode = 0;
    return;
  }

  process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
