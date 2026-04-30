#!/usr/bin/env node

/**
 * Phase 152 - FPSub verification + gcd FP trace.
 *
 * Part A:
 *   Directly call FPSub at 0x07C771 with hand-seeded OP registers.
 *
 * Part B:
 *   Run gcd(12,8) through 0x068D3D and log OP1/OP2 at key FP blocks.
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
const GCD_CATEGORY = 0x28;

const FPSUB_ADDR = 0x07c771;
const FPADD_ADDR = 0x07c77f;
const FPSUB_CORE_ADDR = 0x07cc36;
const TYPE_VALIDATOR_ADDR = 0x07f831;
const CONST_ONE_LOADER_ADDR = 0x07fa74;

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const MEMINIT_BUDGET = 100000;
const MAX_LOOP_ITER = 8192;
const PART_A_MAX_STEPS = 1000;
const PART_B_MAX_STEPS = 5000;

const FPS_CLEAN_AREA = 0xd1aa00;
const FPS_ENTRY_SIZE = 9;

const BCD_12 = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_8 = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_4 = Uint8Array.from([0x00, 0x80, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const ZERO_80 = Uint8Array.from([0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const ZERO_00 = Uint8Array.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const WATCH_POINTS = new Map([
  [TYPE_VALIDATOR_ADDR, 'type validator'],
  [FPSUB_ADDR, 'FPSub entry'],
  [FPADD_ADDR, 'FPAdd entry'],
  [CONST_ONE_LOADER_ADDR, 'const 1.0 loader'],
  [FPSUB_CORE_ADDR, 'FP subtraction core'],
]);

const hex = (value, width = 6) =>
  value === undefined || value === null
    ? 'n/a'
    : `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

const hexByte = (value) =>
  (value & 0xff).toString(16).toUpperCase().padStart(2, '0');

const formatBlockKey = (pc, mode = 'adl') =>
  `${pc.toString(16).padStart(6, '0')}:${mode}`;

function read24(mem, addr) {
  return ((mem[addr] & 0xff) | ((mem[addr + 1] & 0xff) << 8) | ((mem[addr + 2] & 0xff) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

function readBytes(mem, addr, len) {
  return Array.from(mem.subarray(addr, addr + len), (byte) => byte & 0xff);
}

function formatBytes(bytes) {
  return bytes.map((byte) => hexByte(byte)).join(' ');
}

function readHex(mem, addr, len) {
  return formatBytes(readBytes(mem, addr, len));
}

function decodeBcdRealBytes(bytes) {
  const type = bytes[0] & 0xff;
  const exponentByte = bytes[1] & 0xff;
  const digits = [];

  for (let i = 2; i < 9; i++) {
    const byte = bytes[i] & 0xff;
    digits.push((byte >> 4) & 0x0f, byte & 0x0f);
  }

  if (digits.every((digit) => digit === 0)) {
    return '0';
  }

  if (digits.some((digit) => digit > 9)) {
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

  if (rendered.startsWith('.')) {
    rendered = `0${rendered}`;
  }

  if (rendered === '') {
    rendered = '0';
  }

  if ((type & 0x80) !== 0 && rendered !== '0') {
    rendered = `-${rendered}`;
  }

  return rendered;
}

function decodeBcdReal(mem, addr) {
  return decodeBcdRealBytes(readBytes(mem, addr, 9));
}

function sameBytes(actual, expected) {
  if (actual.length !== expected.length) return false;
  for (let i = 0; i < actual.length; i++) {
    if ((actual[i] & 0xff) !== (expected[i] & 0xff)) return false;
  }
  return true;
}

function matchesAny(actual, variants) {
  return variants.some((variant) => sameBytes(actual, variant));
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

function blockDisasm(pc, mode = 'adl') {
  const block = BLOCKS[formatBlockKey(pc, mode)];
  if (!block?.instructions?.length) {
    return '(missing block)';
  }
  return block.instructions
    .map((instruction) => `${hex(instruction.pc)} ${instruction.dasm}`)
    .join(' | ');
}

function noteStep(stepCount, step) {
  if (typeof step === 'number') {
    return Math.max(stepCount, step + 1);
  }
  return stepCount + 1;
}

function snapshotOperands(mem) {
  const op1Bytes = readBytes(mem, OP1_ADDR, 9);
  const op2Bytes = readBytes(mem, OP2_ADDR, 9);
  return {
    op1Bytes,
    op2Bytes,
    op1Hex: formatBytes(op1Bytes),
    op2Hex: formatBytes(op2Bytes),
    op1Value: decodeBcdRealBytes(op1Bytes),
    op2Value: decodeBcdRealBytes(op2Bytes),
  };
}

function printHeader(title) {
  console.log('========================================================================');
  console.log(title);
  console.log('========================================================================');
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

function seedRealRegister(mem, addr, bytes) {
  mem.fill(0x00, addr, addr + 11);
  mem.set(bytes, addr);
}

function seedDirectFpOperands(mem, op1Bytes, op2Bytes) {
  seedAllocator(mem);
  mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 0x40);
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA);
  seedRealRegister(mem, OP1_ADDR, op1Bytes);
  seedRealRegister(mem, OP2_ADDR, op2Bytes);
  mem[FP_CATEGORY_ADDR] = 0x00;
}

function seedGcdFpState(mem) {
  seedAllocator(mem);
  mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 0x40);
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  mem.set(BCD_12, FPS_CLEAN_AREA);
  mem.set(BCD_8, FPS_CLEAN_AREA + FPS_ENTRY_SIZE);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA + (2 * FPS_ENTRY_SIZE));
  seedRealRegister(mem, OP1_ADDR, BCD_12);
  seedRealRegister(mem, OP2_ADDR, BCD_8);
  mem[FP_CATEGORY_ADDR] = GCD_CATEGORY;
}

function runRoutine(executor, cpu, mem, entryPc, { maxSteps, onEvent } = {}) {
  let outcome = 'budget';
  let stepCount = 0;
  let lastMissingBlock = null;
  let thrownMessage = null;

  try {
    executor.runFrom(entryPc, 'adl', {
      maxSteps,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);
        onEvent?.({ kind: 'block', pc: norm, mode, meta, step: stepCount, mem, cpu });
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);
        lastMissingBlock = norm;
        onEvent?.({ kind: 'missing', pc: norm, mode, meta: null, step: stepCount, mem, cpu });
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
      outcome = 'threw';
      thrownMessage = error?.stack || String(error);
    }
  }

  return {
    outcome,
    stepCount,
    lastMissingBlock,
    thrownMessage,
    errNo: mem[ERR_NO_ADDR] & 0xff,
    fpsBase: read24(mem, FPSBASE_ADDR),
    fpsPtr: read24(mem, FPS_ADDR),
    ...snapshotOperands(mem),
  };
}

function printBlockCoverage() {
  printHeader('Block Coverage');

  const required = [
    [GCD_DIRECT_ADDR, 'gcd handler'],
    [FPSUB_ADDR, 'FPSub entry'],
    [FPADD_ADDR, 'FPAdd entry'],
    [FPSUB_CORE_ADDR, 'FP subtraction core'],
    [TYPE_VALIDATOR_ADDR, 'type validator'],
    [CONST_ONE_LOADER_ADDR, 'const 1.0 loader'],
  ];

  for (const [pc, label] of required) {
    const present = BLOCKS[formatBlockKey(pc)] !== undefined;
    console.log(`${hex(pc)} ${label}: ${present ? 'PRESENT' : 'MISSING'}`);
  }

  console.log('');
}

function runFpSubCase(testCase) {
  const runtime = createPreparedRuntime();
  if (!runtime.memInitOk) {
    return {
      label: testCase.label,
      memInitOk: false,
    };
  }

  const { mem, executor, cpu } = runtime;
  prepareCallState(cpu, mem);
  seedDirectFpOperands(mem, testCase.op1, testCase.op2);
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  const result = runRoutine(executor, cpu, mem, FPSUB_ADDR, {
    maxSteps: PART_A_MAX_STEPS,
  });

  return {
    label: testCase.label,
    memInitOk: true,
    inputOp1Hex: formatBytes(Array.from(testCase.op1)),
    inputOp2Hex: formatBytes(Array.from(testCase.op2)),
    inputOp1Value: decodeBcdRealBytes(Array.from(testCase.op1)),
    inputOp2Value: decodeBcdRealBytes(Array.from(testCase.op2)),
    expectedVariants: testCase.expectedVariants.map((variant) => formatBytes(Array.from(variant))),
    expectedLabel: testCase.expectedLabel,
    op1MatchesExpectation: matchesAny(result.op1Bytes, testCase.expectedVariants),
    ...result,
  };
}

function printFpSubCase(result) {
  console.log('------------------------------------------------------------------------');
  console.log(result.label);
  console.log('------------------------------------------------------------------------');

  if (!result.memInitOk) {
    console.log('MEM_INIT failed; case did not run.');
    console.log('');
    return;
  }

  console.log(`Input OP1: [${result.inputOp1Hex}] => ${result.inputOp1Value}`);
  console.log(`Input OP2: [${result.inputOp2Hex}] => ${result.inputOp2Value}`);
  console.log(`Expected: ${result.expectedLabel}`);
  console.log(`Expected raw bytes: ${result.expectedVariants.join(' OR ')}`);
  console.log('');
  console.log(`Outcome: ${result.outcome}`);
  console.log(`Steps: ${result.stepCount}`);
  console.log(`errNo: ${hex(result.errNo, 2)} (${errName(result.errNo)})`);
  console.log(`Result OP1: [${result.op1Hex}] => ${result.op1Value}`);
  console.log(`Result OP2: [${result.op2Hex}] => ${result.op2Value}`);
  console.log(`Matches expectation: ${result.op1MatchesExpectation ? 'YES' : 'NO'}`);
  if (result.lastMissingBlock !== null) {
    console.log(`Last missing block: ${hex(result.lastMissingBlock)}`);
  }
  if (result.thrownMessage) {
    console.log(`Thrown: ${result.thrownMessage.split('\n')[0]}`);
  }
  console.log('');
}

function runPartA() {
  const cases = [
    {
      label: 'Case A1 - FPSub(12.0, 8.0) => 4.0',
      op1: BCD_12,
      op2: BCD_8,
      expectedVariants: [BCD_4],
      expectedLabel: '4.0',
    },
    {
      label: 'Case A2 - FPSub(8.0, 4.0) => 4.0',
      op1: BCD_8,
      op2: BCD_4,
      expectedVariants: [BCD_4],
      expectedLabel: '4.0',
    },
    {
      label: 'Case A3 - FPSub(4.0, 4.0) => 0.0',
      op1: BCD_4,
      op2: BCD_4,
      expectedVariants: [ZERO_80, ZERO_00],
      expectedLabel: '0.0',
    },
  ];

  return cases.map(runFpSubCase);
}

function printPartA(results) {
  printHeader('Part A - Independent FPSub verification');
  console.log(`Entry: ${hex(FPSUB_ADDR)} ${blockDisasm(FPSUB_ADDR)}`);
  console.log('');

  for (const result of results) {
    printFpSubCase(result);
  }
}

function runPartB() {
  const runtime = createPreparedRuntime();
  if (!runtime.memInitOk) {
    return {
      memInitOk: false,
      hits: [],
    };
  }

  const { mem, executor, cpu } = runtime;
  prepareCallState(cpu, mem);
  seedGcdFpState(mem);
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  const hits = [];

  const result = runRoutine(executor, cpu, mem, GCD_DIRECT_ADDR, {
    maxSteps: PART_B_MAX_STEPS,
    onEvent(event) {
      if (!WATCH_POINTS.has(event.pc)) return;
      const snapshot = snapshotOperands(event.mem);
      hits.push({
        step: event.step,
        pc: event.pc,
        label: WATCH_POINTS.get(event.pc),
        hitKind: event.kind,
        op1Hex: snapshot.op1Hex,
        op2Hex: snapshot.op2Hex,
        op1Value: snapshot.op1Value,
        op2Value: snapshot.op2Value,
      });
    },
  });

  return {
    memInitOk: true,
    initialFpsBase: FPS_CLEAN_AREA,
    initialFpsPtr: FPS_CLEAN_AREA + (2 * FPS_ENTRY_SIZE),
    hits,
    ...result,
  };
}

function printPartB(result) {
  printHeader('Part B - gcd(12,8) intermediate FP trace');

  if (!result.memInitOk) {
    console.log('MEM_INIT failed; gcd trace did not run.');
    console.log('');
    return;
  }

  console.log(`Entry: ${hex(GCD_DIRECT_ADDR)} ${blockDisasm(GCD_DIRECT_ADDR)}`);
  console.log('Seeded FPS entries (9 bytes each):');
  console.log(`  FPS base: ${hex(result.initialFpsBase)}`);
  console.log(`  FPS ptr:  ${hex(result.initialFpsPtr)}`);
  console.log(`  Entry 0: [${formatBytes(Array.from(BCD_12))}] => ${decodeBcdRealBytes(Array.from(BCD_12))}`);
  console.log(`  Entry 1: [${formatBytes(Array.from(BCD_8))}] => ${decodeBcdRealBytes(Array.from(BCD_8))}`);
  console.log('Expected Euclidean path: 12 mod 8 = 4 -> 8 mod 4 = 0 -> return 4');
  console.log('');

  if (result.hits.length === 0) {
    console.log('No watched FP blocks were hit.');
  } else {
    for (const hit of result.hits) {
      console.log(
        `step ${String(hit.step).padStart(4, ' ')} ` +
        `${hex(hit.pc)} ${hit.label}${hit.hitKind === 'missing' ? ' [missing]' : ''}`
      );
      console.log(`  OP1: [${hit.op1Hex}] => ${hit.op1Value}`);
      console.log(`  OP2: [${hit.op2Hex}] => ${hit.op2Value}`);
    }
  }

  console.log('');
  console.log(`Outcome: ${result.outcome}`);
  console.log(`Steps: ${result.stepCount}`);
  console.log(`errNo: ${hex(result.errNo, 2)} (${errName(result.errNo)})`);
  console.log(`Final OP1: [${result.op1Hex}] => ${result.op1Value}`);
  console.log(`Final OP2: [${result.op2Hex}] => ${result.op2Value}`);
  console.log(`Final FPS ptr: ${hex(result.fpsPtr)}`);
  if (result.lastMissingBlock !== null) {
    console.log(`Last missing block: ${hex(result.lastMissingBlock)}`);
  }
  if (result.thrownMessage) {
    console.log(`Thrown: ${result.thrownMessage.split('\n')[0]}`);
  }
  console.log('');
}

function printSummary(partA, partB) {
  printHeader('Summary');

  if (partA.every((entry) => entry.memInitOk)) {
    console.log(
      `FPSub 12.0 - 8.0 -> 4.0: ${partA[0].op1MatchesExpectation ? 'MATCH' : 'MISMATCH'} ` +
      `[${partA[0].op1Hex}] => ${partA[0].op1Value}`
    );
    console.log(
      `FPSub 8.0 - 4.0 -> 4.0: ${partA[1].op1MatchesExpectation ? 'MATCH' : 'MISMATCH'} ` +
      `[${partA[1].op1Hex}] => ${partA[1].op1Value}`
    );
    console.log(
      `FPSub 4.0 - 4.0 -> 0.0: ${partA[2].op1MatchesExpectation ? 'MATCH' : 'MISMATCH'} ` +
      `[${partA[2].op1Hex}] => ${partA[2].op1Value}`
    );
  } else {
    console.log('Part A did not complete because MEM_INIT failed in at least one case.');
  }

  console.log('');

  if (partB.memInitOk) {
    console.log(`gcd trace hits captured: ${partB.hits.length}`);
    console.log(`gcd final OP1: [${partB.op1Hex}] => ${partB.op1Value}`);
    console.log(`gcd final OP2: [${partB.op2Hex}] => ${partB.op2Value}`);
  } else {
    console.log('Part B did not complete because MEM_INIT failed.');
  }

  console.log('');
}

function main() {
  console.log('=== Phase 152: FPSub verification + gcd FP trace ===');
  console.log('');

  printBlockCoverage();

  const partA = runPartA();
  const partB = runPartB();

  printPartA(partA);
  printPartB(partB);
  printSummary(partA, partB);
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
