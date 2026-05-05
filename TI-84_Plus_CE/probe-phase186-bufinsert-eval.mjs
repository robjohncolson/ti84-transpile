#!/usr/bin/env node

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
const STACK_TOP = 0xD1A87E;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const BUFINSERT_ENTRY = 0x05E2A0;

const OP1_ADDR = 0xD005F8;
const REQUESTED_OP2_ADDR = 0xD00601;
const OP2_ADDR = 0xD00603;

const LEGACY_ARITH_TABLE_ADDR = 0x020000;
const FPADD_JT_SLOT = 0x0201C0;

const EDIT_TOP = 0xD02437;
const EDIT_CURSOR = 0xD0243A;
const EDIT_TAIL = 0xD0243D;
const EDIT_BTM = 0xD02440;

const BUF_START = 0xD00A00;
const BUF_END = 0xD00B00;

const FAKE_RET = 0x7FFFFE;

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const BUFINSERT_MAX_STEPS = 10000;
const FPADD_MAX_STEPS = 200000;

const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_MAX_LOOP_ITERATIONS = 10000;
const POST_INIT_MAX_LOOP_ITERATIONS = 32;
const OS_MAX_LOOP_ITERATIONS = 8192;

const INSERT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33]);
const REAL_2 = Uint8Array.from([0x00, 0x80, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const REAL_3 = Uint8Array.from([0x00, 0x80, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const REAL_5 = Uint8Array.from([0x00, 0x80, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function read24(mem, addr) {
  return ((mem[addr] & 0xFF) | ((mem[addr + 1] & 0xFF) << 8) | ((mem[addr + 2] & 0xFF) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xFF;
  mem[addr + 1] = (value >>> 8) & 0xFF;
  mem[addr + 2] = (value >>> 16) & 0xFF;
}

function writeBytes(mem, addr, bytes) {
  mem.set(bytes, addr);
}

function exactMatch(mem, addr, expected) {
  for (let i = 0; i < expected.length; i += 1) {
    if ((mem[addr + i] & 0xFF) !== expected[i]) return false;
  }
  return true;
}

function bytesToHexArray(bytes) {
  return Array.from(bytes, (value) => hex(value, 2));
}

function readHexArray(mem, addr, length) {
  return bytesToHexArray(mem.slice(addr, addr + length));
}

function decodeBcdFloat(bytesLike) {
  const bytes = Uint8Array.from(bytesLike);
  const negative = (bytes[0] & 0x80) !== 0;
  const exponent = (bytes[1] & 0xFF) - 0x80;

  let mantissa = 0;
  for (let index = 2; index < 9; index += 1) {
    const hi = (bytes[index] >> 4) & 0x0F;
    const lo = bytes[index] & 0x0F;
    mantissa = (mantissa * 100) + (hi * 10) + lo;
  }

  const value = mantissa * Math.pow(10, exponent - 13);
  return negative ? -value : value;
}

function formatFloat(value) {
  if (!Number.isFinite(value)) return String(value);
  const abs = Math.abs(value);
  const rendered = abs !== 0 && (abs >= 1e12 || abs < 1e-6)
    ? value.toExponential(12)
    : value.toFixed(12).replace(/\.?0+$/, '');
  return rendered.includes('.') ? rendered : `${rendered}.0`;
}

function resolveJpTarget(mem, addr) {
  if ((mem[addr] & 0xFF) !== 0xC3) return null;
  return ((mem[addr + 1] & 0xFF) | ((mem[addr + 2] & 0xFF) << 8) | ((mem[addr + 3] & 0xFF) << 16)) >>> 0;
}

function resetCpuForOsCall(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function runUntilHit(executor, entry, mode, sentinels, maxSteps, maxLoopIterations) {
  const stopMessage = '__STOP__';
  let hit = null;
  let steps = 0;
  let lastPc = entry & 0xFFFFFF;
  let termination = null;

  const notePc = (pc, step) => {
    const norm = pc & 0xFFFFFF;
    lastPc = norm;
    if (typeof step === 'number') steps = Math.max(steps, step + 1);
    for (const [name, target] of Object.entries(sentinels)) {
      if (norm === target) {
        hit = name;
        throw new Error(stopMessage);
      }
    }
  };

  try {
    const result = executor.runFrom(entry, mode, {
      maxSteps,
      maxLoopIterations,
      onBlock(pc, _mode, _meta, step) {
        notePc(pc, step);
      },
      onMissingBlock(pc, _mode, step) {
        notePc(pc, step);
      },
    });

    steps = Math.max(steps, result?.steps ?? 0);
    if (result?.lastPc !== undefined && result?.lastPc !== null) {
      lastPc = result.lastPc & 0xFFFFFF;
    }
    termination = result?.termination ?? null;
    return { hit, steps, lastPc, termination, error: null };
  } catch (error) {
    if (error?.message === stopMessage) {
      return { hit, steps, lastPc, termination: 'sentinel', error: null };
    }
    return { hit, steps, lastPc, termination: 'exception', error };
  }
}

function requireHit(label, result, expectedHit) {
  if (result.error) {
    throw new Error(`${label} threw ${result.error?.message ?? result.error}`);
  }
  if (result.hit !== expectedHit) {
    throw new Error(
      `${label} expected ${expectedHit}, saw ${result.hit ?? 'none'} (lastPc=${hex(result.lastPc)})`,
    );
  }
}

function bootRuntime(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: KERNEL_INIT_MAX_LOOP_ITERATIONS,
  });

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: POST_INIT_MAX_LOOP_ITERATIONS,
  });
}

function runMemInit(executor, cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);
  return runUntilHit(
    executor,
    MEM_INIT_ENTRY,
    'adl',
    { ret: FAKE_RET },
    MEM_INIT_MAX_STEPS,
    OS_MAX_LOOP_ITERATIONS,
  );
}

function configureEditBuffer(mem) {
  write24(mem, EDIT_TOP, BUF_START);
  write24(mem, EDIT_CURSOR, BUF_START);
  write24(mem, EDIT_TAIL, BUF_END);
  write24(mem, EDIT_BTM, BUF_END);
  mem.fill(0x00, BUF_START, BUF_END);
}

function runBufInsertToken(executor, cpu, mem, token) {
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);
  cpu._de = token & 0xFF;
  return runUntilHit(
    executor,
    BUFINSERT_ENTRY,
    'adl',
    { ret: FAKE_RET },
    BUFINSERT_MAX_STEPS,
    OS_MAX_LOOP_ITERATIONS,
  );
}

function runFpAdd(executor, cpu, mem, entry) {
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);
  return runUntilHit(
    executor,
    entry,
    'adl',
    { ret: FAKE_RET },
    FPADD_MAX_STEPS,
    OS_MAX_LOOP_ITERATIONS,
  );
}

function buildBaseReport() {
  return {
    probe: 'phase186-bufinsert-eval',
    timerInterrupt: false,
    requestedExpression: '2+3',
    tokenSequence: bytesToHexArray(INSERT_TOKENS),
    notes: [
      'BufInsert uses the edit-buffer path; expression evaluation uses direct FP primitives instead of ParseInp.',
      'OP2 is written at 0xD00603, the ROM-correct base address. 0xD00601 is a stale probe address inside OP1 extended storage.',
    ],
  };
}

function main() {
  const report = buildBaseReport();

  try {
    const mem = new Uint8Array(MEM_SIZE);
    mem.set(romBytes);

    const legacyArithBytes = readHexArray(mem, LEGACY_ARITH_TABLE_ADDR, 4);
    const fpAddSlotBytes = readHexArray(mem, FPADD_JT_SLOT, 4);
    const fpAddEntry = resolveJpTarget(mem, FPADD_JT_SLOT);
    if (fpAddEntry === null) {
      throw new Error(`FPAdd slot ${hex(FPADD_JT_SLOT)} is not a JP entry`);
    }

    report.jumpTable = {
      requestedArithmeticSlot: hex(LEGACY_ARITH_TABLE_ADDR),
      requestedArithmeticSlotBytes: legacyArithBytes,
      requestedArithmeticSlotIsJp: (mem[LEGACY_ARITH_TABLE_ADDR] & 0xFF) === 0xC3,
      fpAddSlot: hex(FPADD_JT_SLOT),
      fpAddSlotBytes,
      fpAddEntry: hex(fpAddEntry),
    };

    const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
    const executor = createExecutor(BLOCKS, mem, { peripherals });
    const cpu = executor.cpu;

    bootRuntime(executor, cpu, mem);

    const memInit = runMemInit(executor, cpu, mem);
    requireHit('MEM_INIT', memInit, 'ret');
    report.memInit = {
      returned: true,
      steps: memInit.steps,
      ix: hex(cpu._ix),
    };

    configureEditBuffer(mem);

    const insertRuns = [];
    for (const token of INSERT_TOKENS) {
      const result = runBufInsertToken(executor, cpu, mem, token);
      requireHit(`BufInsert(${hex(token, 2)})`, result, 'ret');
      insertRuns.push({
        token: hex(token, 2),
        steps: result.steps,
      });
    }

    const cursor = read24(mem, EDIT_CURSOR);
    const editMatches = exactMatch(mem, BUF_START, INSERT_TOKENS) && cursor === (BUF_START + INSERT_TOKENS.length);

    report.editBuffer = {
      start: hex(BUF_START),
      expectedTokenAddresses: INSERT_TOKENS.map((_, index) => hex(BUF_START + index)),
      observedTokenBytes: readHexArray(mem, BUF_START, INSERT_TOKENS.length),
      expectedTokenBytes: bytesToHexArray(INSERT_TOKENS),
      first16Bytes: readHexArray(mem, BUF_START, 16),
      cursor: hex(cursor),
      expectedCursor: hex(BUF_START + INSERT_TOKENS.length),
      top: hex(read24(mem, EDIT_TOP)),
      tail: hex(read24(mem, EDIT_TAIL)),
      bottom: hex(read24(mem, EDIT_BTM)),
      insertRuns,
      pass: editMatches,
    };

    writeBytes(mem, OP1_ADDR, REAL_2);
    writeBytes(mem, OP2_ADDR, REAL_3);

    const op1Before = mem.slice(OP1_ADDR, OP1_ADDR + 9);
    const op2Before = mem.slice(OP2_ADDR, OP2_ADDR + 9);

    const fpAddRun = runFpAdd(executor, cpu, mem, fpAddEntry);
    requireHit('FPAdd', fpAddRun, 'ret');

    const op1After = mem.slice(OP1_ADDR, OP1_ADDR + 9);
    const fpMatches = exactMatch(mem, OP1_ADDR, REAL_5);

    report.fpAdd = {
      op1Address: hex(OP1_ADDR),
      requestedOp2Address: hex(REQUESTED_OP2_ADDR),
      op2Address: hex(OP2_ADDR),
      op1Before: bytesToHexArray(op1Before),
      op2Before: bytesToHexArray(op2Before),
      op1BeforeDecoded: formatFloat(decodeBcdFloat(op1Before)),
      op2BeforeDecoded: formatFloat(decodeBcdFloat(op2Before)),
      steps: fpAddRun.steps,
      returned: true,
      op1After: bytesToHexArray(op1After),
      op1AfterDecoded: formatFloat(decodeBcdFloat(op1After)),
      expectedOp1After: bytesToHexArray(REAL_5),
      pass: fpMatches,
    };

    report.pass = report.editBuffer.pass && report.fpAdd.pass;
    report.verdict = report.pass ? 'PASS' : 'FAIL';

    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.pass ? 0 : 1;
  } catch (error) {
    report.pass = false;
    report.verdict = 'FAIL';
    report.error = error?.stack ?? String(error);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = 1;
  }
}

main();
