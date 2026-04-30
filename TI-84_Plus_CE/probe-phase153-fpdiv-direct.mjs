#!/usr/bin/env node

/**
 * Phase 153 - Direct FPDiv test + FPInt test.
 *
 * Part A: Call FPDiv directly with hand-seeded OP registers.
 *   - FPDiv(12.0 / 8.0) => 1.5
 *   - FPDiv(8.0 / 4.0) => 2.0
 *   - FPDiv(12.0 / 1.0) => 12.0
 *
 * Part B: Call FPInt (integer part) directly.
 *   - FPInt(1.5) => 1.0
 *   - FPInt(12.0) => 12.0
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

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const MEMINIT_BUDGET = 100000;
const MAX_LOOP_ITER = 8192;
const FP_MAX_STEPS = 2000;

const FPS_CLEAN_AREA = 0xd1aa00;

// Jump table slot for FPDiv: 0x020284 contains C3 xx yy zz
const FPDIV_JT_ADDR = 0x020284;

// BCD encodings
const BCD_12 = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_8 = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_4 = Uint8Array.from([0x00, 0x80, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_1 = Uint8Array.from([0x00, 0x80, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_1_5 = Uint8Array.from([0x00, 0x80, 0x15, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_2 = Uint8Array.from([0x00, 0x80, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const ZERO_80 = Uint8Array.from([0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const ZERO_00 = Uint8Array.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

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

function seedDirectFpOperands(mem, op1Bytes, op2Bytes) {
  seedAllocator(mem);
  mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 0x40);
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 11);
  mem.set(op1Bytes, OP1_ADDR);
  mem.fill(0x00, OP2_ADDR, OP2_ADDR + 11);
  mem.set(op2Bytes, OP2_ADDR);
  mem[FP_CATEGORY_ADDR] = 0x00;
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

// --- Resolve FPDiv and FPInt addresses from ROM jump table ---

function resolveJtTarget(jtAddr) {
  // JT entry is C3 xx yy zz (JP target) — read the byte at jtAddr
  const opcode = romBytes[jtAddr] & 0xff;
  if (opcode !== 0xc3) {
    return { opcode, target: null };
  }
  const target = ((romBytes[jtAddr + 1] & 0xff) |
    ((romBytes[jtAddr + 2] & 0xff) << 8) |
    ((romBytes[jtAddr + 3] & 0xff) << 16)) >>> 0;
  return { opcode, target };
}

// Scan for FPInt/Intgr in the jump table area
// From ti84pceg.inc references, _Int is at offset 0x020110
// Let's also try some other common offsets
const FPINT_JT_CANDIDATES = [
  { label: '_Int (0x020110)', addr: 0x020110 },
  { label: '_Intgr (0x020280)', addr: 0x020280 },
  { label: '_Trunc (0x020118)', addr: 0x020118 },
];

function discoverAddresses() {
  console.log('--- Discovering FPDiv address from JT ---');
  const fpdiv = resolveJtTarget(FPDIV_JT_ADDR);
  console.log(`FPDiv JT at ${hex(FPDIV_JT_ADDR)}: opcode=${hexByte(fpdiv.opcode)} target=${fpdiv.target !== null ? hex(fpdiv.target) : 'N/A'}`);
  console.log(`  Raw bytes: ${formatBytes(Array.from(romBytes.subarray(FPDIV_JT_ADDR, FPDIV_JT_ADDR + 4)))}`);

  if (fpdiv.target === null) {
    // Try reading as a 3-byte address starting at jtAddr+1 anyway
    console.log('  WARNING: Expected C3 (JP) opcode at JT slot');
  }

  console.log('');
  console.log('--- Discovering FPInt / Intgr addresses from JT ---');
  const fpintResults = [];
  for (const candidate of FPINT_JT_CANDIDATES) {
    const result = resolveJtTarget(candidate.addr);
    console.log(`${candidate.label} at ${hex(candidate.addr)}: opcode=${hexByte(result.opcode)} target=${result.target !== null ? hex(result.target) : 'N/A'}`);
    console.log(`  Raw bytes: ${formatBytes(Array.from(romBytes.subarray(candidate.addr, candidate.addr + 4)))}`);
    fpintResults.push({ ...candidate, ...result });
  }

  // Also scan nearby JT region for known FP functions for context
  console.log('');
  console.log('--- JT region around FPDiv (0x020274..0x020294) ---');
  for (let addr = 0x020274; addr <= 0x020294; addr += 4) {
    const r = resolveJtTarget(addr);
    const marker = addr === FPDIV_JT_ADDR ? ' <-- FPDiv' : '';
    console.log(`  ${hex(addr)}: ${formatBytes(Array.from(romBytes.subarray(addr, addr + 4)))} -> ${r.target !== null ? hex(r.target) : 'not JP'}${marker}`);
  }

  console.log('');

  return { fpdivTarget: fpdiv.target, fpintResults };
}

function runFpDivCase(testCase, fpdivAddr) {
  const runtime = createPreparedRuntime();
  if (!runtime.memInitOk) {
    return { label: testCase.label, memInitOk: false };
  }

  const { mem, executor, cpu } = runtime;
  prepareCallState(cpu, mem);
  seedDirectFpOperands(mem, testCase.op1, testCase.op2);
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  const hits = [];

  const result = runRoutine(executor, cpu, mem, fpdivAddr, {
    maxSteps: FP_MAX_STEPS,
    onEvent(event) {
      if (hits.length < 30) {
        const snapshot = snapshotOperands(event.mem);
        hits.push({
          step: event.step,
          pc: event.pc,
          kind: event.kind,
          op1Value: snapshot.op1Value,
          op2Value: snapshot.op2Value,
        });
      }
    },
  });

  return {
    label: testCase.label,
    memInitOk: true,
    inputOp1Hex: formatBytes(Array.from(testCase.op1)),
    inputOp2Hex: formatBytes(Array.from(testCase.op2)),
    inputOp1Value: decodeBcdRealBytes(Array.from(testCase.op1)),
    inputOp2Value: decodeBcdRealBytes(Array.from(testCase.op2)),
    expectedVariants: testCase.expectedVariants.map((v) => formatBytes(Array.from(v))),
    expectedLabel: testCase.expectedLabel,
    op1MatchesExpectation: matchesAny(result.op1Bytes, testCase.expectedVariants),
    hits,
    ...result,
  };
}

function printFpCase(result) {
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

function runFpIntCase(testCase, fpintAddr) {
  const runtime = createPreparedRuntime();
  if (!runtime.memInitOk) {
    return { label: testCase.label, memInitOk: false };
  }

  const { mem, executor, cpu } = runtime;
  prepareCallState(cpu, mem);
  // FPInt operates on OP1 only (no OP2 needed)
  seedDirectFpOperands(mem, testCase.op1, ZERO_00);
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  const result = runRoutine(executor, cpu, mem, fpintAddr, {
    maxSteps: FP_MAX_STEPS,
  });

  return {
    label: testCase.label,
    memInitOk: true,
    inputOp1Hex: formatBytes(Array.from(testCase.op1)),
    inputOp1Value: decodeBcdRealBytes(Array.from(testCase.op1)),
    expectedVariants: testCase.expectedVariants.map((v) => formatBytes(Array.from(v))),
    expectedLabel: testCase.expectedLabel,
    op1MatchesExpectation: matchesAny(result.op1Bytes, testCase.expectedVariants),
    ...result,
  };
}

function printFpIntCase(result) {
  console.log('------------------------------------------------------------------------');
  console.log(result.label);
  console.log('------------------------------------------------------------------------');

  if (!result.memInitOk) {
    console.log('MEM_INIT failed; case did not run.');
    console.log('');
    return;
  }

  console.log(`Input OP1: [${result.inputOp1Hex}] => ${result.inputOp1Value}`);
  console.log(`Expected: ${result.expectedLabel}`);
  console.log(`Expected raw bytes: ${result.expectedVariants.join(' OR ')}`);
  console.log('');
  console.log(`Outcome: ${result.outcome}`);
  console.log(`Steps: ${result.stepCount}`);
  console.log(`errNo: ${hex(result.errNo, 2)} (${errName(result.errNo)})`);
  console.log(`Result OP1: [${result.op1Hex}] => ${result.op1Value}`);
  console.log(`Matches expectation: ${result.op1MatchesExpectation ? 'YES' : 'NO'}`);
  if (result.lastMissingBlock !== null) {
    console.log(`Last missing block: ${hex(result.lastMissingBlock)}`);
  }
  if (result.thrownMessage) {
    console.log(`Thrown: ${result.thrownMessage.split('\n')[0]}`);
  }
  console.log('');
}

function main() {
  console.log('=== Phase 153: Direct FPDiv + FPInt test ===');
  console.log('');

  const { fpdivTarget, fpintResults } = discoverAddresses();

  // --- Part A: FPDiv ---
  printHeader('Part A - Direct FPDiv verification');

  if (fpdivTarget === null) {
    console.log('ERROR: Could not resolve FPDiv implementation address from JT.');
    console.log('');
  } else {
    console.log(`FPDiv implementation address: ${hex(fpdivTarget)}`);
    console.log(`FPDiv block disasm: ${blockDisasm(fpdivTarget)}`);
    console.log('');

    const divCases = [
      {
        label: 'Case D1 - FPDiv(12.0 / 8.0) => 1.5',
        op1: BCD_12,
        op2: BCD_8,
        expectedVariants: [BCD_1_5],
        expectedLabel: '1.5',
      },
      {
        label: 'Case D2 - FPDiv(8.0 / 4.0) => 2.0',
        op1: BCD_8,
        op2: BCD_4,
        expectedVariants: [BCD_2],
        expectedLabel: '2.0',
      },
      {
        label: 'Case D3 - FPDiv(12.0 / 1.0) => 12.0',
        op1: BCD_12,
        op2: BCD_1,
        expectedVariants: [BCD_12],
        expectedLabel: '12.0',
      },
    ];

    const divResults = divCases.map((tc) => runFpDivCase(tc, fpdivTarget));
    for (const result of divResults) {
      printFpCase(result);
    }

    // Summary for Part A
    console.log('--- Part A Summary ---');
    for (const result of divResults) {
      if (result.memInitOk) {
        console.log(
          `${result.label}: ${result.op1MatchesExpectation ? 'PASS' : 'FAIL'} ` +
          `[${result.op1Hex}] => ${result.op1Value}`
        );
      } else {
        console.log(`${result.label}: MEM_INIT FAILED`);
      }
    }
    console.log('');
  }

  // --- Part B: FPInt ---
  printHeader('Part B - Direct FPInt verification');

  // Find a valid FPInt address
  const validFpInt = fpintResults.find((r) => r.target !== null);

  if (!validFpInt) {
    console.log('ERROR: Could not resolve any FPInt/Intgr implementation address from JT.');
    console.log('Trying all candidates as raw addresses...');
    console.log('');
  } else {
    console.log(`Using ${validFpInt.label} => implementation at ${hex(validFpInt.target)}`);
    console.log(`Block disasm: ${blockDisasm(validFpInt.target)}`);
    console.log('');

    const intCases = [
      {
        label: 'Case I1 - FPInt(1.5) => 1.0',
        op1: BCD_1_5,
        expectedVariants: [BCD_1],
        expectedLabel: '1.0',
      },
      {
        label: 'Case I2 - FPInt(12.0) => 12.0',
        op1: BCD_12,
        expectedVariants: [BCD_12],
        expectedLabel: '12.0',
      },
    ];

    const intResults = intCases.map((tc) => runFpIntCase(tc, validFpInt.target));
    for (const result of intResults) {
      printFpIntCase(result);
    }

    // If the first candidate didn't work, try others
    if (intResults.some((r) => r.memInitOk && !r.op1MatchesExpectation)) {
      const otherCandidates = fpintResults.filter((r) => r.target !== null && r.target !== validFpInt.target);
      for (const alt of otherCandidates) {
        console.log(`--- Trying alternative: ${alt.label} => ${hex(alt.target)} ---`);
        console.log(`Block disasm: ${blockDisasm(alt.target)}`);
        const altResults = intCases.map((tc) => runFpIntCase(tc, alt.target));
        for (const result of altResults) {
          printFpIntCase(result);
        }
      }
    }

    // Summary for Part B
    console.log('--- Part B Summary ---');
    for (const result of intResults) {
      if (result.memInitOk) {
        console.log(
          `${result.label}: ${result.op1MatchesExpectation ? 'PASS' : 'FAIL'} ` +
          `[${result.op1Hex}] => ${result.op1Value}`
        );
      } else {
        console.log(`${result.label}: MEM_INIT FAILED`);
      }
    }
    console.log('');
  }

  // --- Overall Summary ---
  printHeader('Overall Summary');
  console.log(`FPDiv target: ${fpdivTarget !== null ? hex(fpdivTarget) : 'NOT FOUND'}`);
  console.log(`FPInt target: ${validFpInt ? hex(validFpInt.target) : 'NOT FOUND'}`);
  console.log('');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
