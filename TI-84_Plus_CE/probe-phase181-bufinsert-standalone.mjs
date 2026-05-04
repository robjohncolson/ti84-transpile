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
const PARSEINP_ENTRY = 0x099914;
const COMMON_TAIL_ENTRY = 0x0586CE;
const BUFINSERT_ENTRY = 0x05E2A0;

// The browser-shell's working CreateReal helper enters the implementation here.
const CREATE_REAL_ENTRY = 0x08238A;

const OP1_ADDR = 0xD005F8;
const ERRNO_ADDR = 0xD008DF;
const ERRSP_ADDR = 0xD008E0;
const FPSBASE_ADDR = 0xD0258A;
const FPS_ADDR = 0xD0258D;
const OPS_ADDR = 0xD02593;

const BEGPC_ADDR = 0xD02317;
const CURPC_ADDR = 0xD0231A;
const ENDPC_ADDR = 0xD0231D;

const EDIT_TOP = 0xD02437;
const EDIT_CURSOR = 0xD0243A;
const EDIT_TAIL = 0xD0243D;
const EDIT_BTM = 0xD02440;

const BUF_START = 0xD00A00;
const BUF_END = 0xD00B00;

const FAKE_RET = 0x7FFFFE;
const ERR_CATCH = 0x7FFFFA;

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const CREATE_REAL_MAX_STEPS = 50000;
const BUFINSERT_MAX_STEPS = 10000;
const COMMON_TAIL_MAX_STEPS = 1700000;
const PARSEINP_MAX_STEPS = 1500000;

const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_MAX_LOOP_ITERATIONS = 10000;
const POST_INIT_MAX_LOOP_ITERATIONS = 32;
const OS_MAX_LOOP_ITERATIONS = 8192;

const ANS_NAME_OP1 = Uint8Array.from([0x00, 0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const INSERT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33]);
const EXPECTED_OP1 = Uint8Array.from([0x00, 0x80, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

function hex(value, width = 6) {
  if (value === null || value === undefined) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexBytes(mem, start, length) {
  return Array.from(mem.slice(start, start + length), (value) =>
    (value & 0xFF).toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xFF;
  mem[addr + 1] = (value >>> 8) & 0xFF;
  mem[addr + 2] = (value >>> 16) & 0xFF;
}

function read24(mem, addr) {
  return ((mem[addr] & 0xFF) | ((mem[addr + 1] & 0xFF) << 8) | ((mem[addr + 2] & 0xFF) << 16)) >>> 0;
}

function exactMatch(mem, addr, expected) {
  for (let i = 0; i < expected.length; i += 1) {
    if ((mem[addr + i] & 0xFF) !== expected[i]) return false;
  }
  return true;
}

function decodeBcdFloat(bytes) {
  const negative = (bytes[0] & 0x80) !== 0;
  const exponent = (bytes[1] & 0xFF) - 0x80;

  let mantissa = 0;
  for (let index = 2; index < 9; index += 1) {
    const hi = (bytes[index] >> 4) & 0xF;
    const lo = bytes[index] & 0xF;
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
  let lastPc = null;
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

function runCreateRealAns(executor, cpu, mem) {
  mem.set(ANS_NAME_OP1, OP1_ADDR);
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);
  const errBase = (cpu.sp - 6) & 0xFFFFFF;
  write24(mem, errBase, ERR_CATCH);
  write24(mem, errBase + 3, 0);
  write24(mem, ERRSP_ADDR, errBase);
  mem[ERRNO_ADDR] = 0x00;
  cpu.a = 0x00;
  cpu._hl = 0x000009;
  const result = runUntilHit(
    executor,
    CREATE_REAL_ENTRY,
    'adl',
    { ret: FAKE_RET, err: ERR_CATCH },
    CREATE_REAL_MAX_STEPS,
    OS_MAX_LOOP_ITERATIONS,
  );
  return { ...result, errBase };
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

function runParseInp(executor, cpu, mem) {
  // Save state before attempt 1 so we can restore on fallback
  const savedOps = read24(mem, OPS_ADDR);
  const savedFps = read24(mem, FPS_ADDR);
  const savedFpsBase = read24(mem, FPSBASE_ADDR);
  const savedOp1 = mem.slice(OP1_ADDR, OP1_ADDR + 9);
  const savedBuf = mem.slice(BUF_START, BUF_END);
  const savedBegPC = read24(mem, BEGPC_ADDR);
  const savedCurPC = read24(mem, CURPC_ADDR);
  const savedEndPC = read24(mem, ENDPC_ADDR);

  // === Attempt 1: Common-tail entry (0x0586CE) ===
  console.log('Trying common-tail entry at 0x0586CE...');
  resetCpuForOsCall(cpu, mem);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);
  const errBase1 = (cpu.sp - 6) & 0xFFFFFF;
  write24(mem, errBase1, ERR_CATCH);
  write24(mem, errBase1 + 3, 0);
  write24(mem, ERRSP_ADDR, errBase1);
  mem[ERRNO_ADDR] = 0x00;

  const result1 = runUntilHit(
    executor,
    COMMON_TAIL_ENTRY,
    'adl',
    { ret: FAKE_RET, err: ERR_CATCH },
    COMMON_TAIL_MAX_STEPS,
    OS_MAX_LOOP_ITERATIONS,
  );

  if (result1.hit === 'ret' || result1.hit === 'err') {
    return { ...result1, parseEntry: 'common-tail' };
  }

  // Common-tail stalled — restore state and try direct ParseInp
  console.log('Common-tail stalled, falling back to direct ParseInp at 0x099914...');

  // Restore allocator and parse pointers
  write24(mem, OPS_ADDR, savedOps);
  write24(mem, FPS_ADDR, savedFps);
  write24(mem, FPSBASE_ADDR, savedFpsBase);
  mem.set(savedOp1, OP1_ADDR);
  mem.set(savedBuf, BUF_START);
  write24(mem, BEGPC_ADDR, savedBegPC);
  write24(mem, CURPC_ADDR, savedCurPC);
  write24(mem, ENDPC_ADDR, savedEndPC);

  // Reset CPU and error frame for attempt 2
  resetCpuForOsCall(cpu, mem);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);
  const errBase2 = (cpu.sp - 6) & 0xFFFFFF;
  write24(mem, errBase2, ERR_CATCH);
  write24(mem, errBase2 + 3, 0);
  write24(mem, ERRSP_ADDR, errBase2);
  mem[ERRNO_ADDR] = 0x00;

  const result2 = runUntilHit(
    executor,
    PARSEINP_ENTRY,
    'adl',
    { ret: FAKE_RET, err: ERR_CATCH },
    PARSEINP_MAX_STEPS,
    OS_MAX_LOOP_ITERATIONS,
  );

  return { ...result2, parseEntry: 'direct' };
}

function main() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const perph = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals: perph });
  const cpu = executor.cpu;

  console.log('Phase 181 standalone BufInsert probe');
  console.log(`CreateReal entry: ${hex(CREATE_REAL_ENTRY)}`);

  bootRuntime(executor, cpu, mem);
  console.log('Boot sequence: complete');

  const memInit = runMemInit(executor, cpu, mem);
  requireHit('MEM_INIT', memInit, 'ret');
  console.log(`MEM_INIT: returned via ${hex(FAKE_RET)} in ${memInit.steps} steps`);

  const createReal = runCreateRealAns(executor, cpu, mem);
  if (createReal.hit === 'err') {
    throw new Error(`CreateReal hit ERR_CATCH with errNo=${hex(mem[ERRNO_ADDR], 2)}`);
  }
  requireHit('CreateReal(Ans)', createReal, 'ret');

  const postCreateOps = read24(mem, OPS_ADDR);
  const postCreateFps = read24(mem, FPS_ADDR);
  const postCreateFpsBase = read24(mem, FPSBASE_ADDR);

  console.log(`CreateReal(Ans): returned via ${hex(FAKE_RET)} in ${createReal.steps} steps`);
  console.log(
    `Saved post-CreateReal pointers: OPS=${hex(postCreateOps)} FPS=${hex(postCreateFps)} FPSBASE=${hex(postCreateFpsBase)}`,
  );

  write24(mem, EDIT_TOP, BUF_START);
  write24(mem, EDIT_CURSOR, BUF_START);
  write24(mem, EDIT_TAIL, BUF_END);
  write24(mem, EDIT_BTM, BUF_END);
  mem.fill(0x00, BUF_START, BUF_END);

  for (const token of INSERT_TOKENS) {
    const result = runBufInsertToken(executor, cpu, mem, token);
    requireHit(`BufInsert(${hex(token, 2)})`, result, 'ret');
  }

  const cursor = read24(mem, EDIT_CURSOR);
  const preGapLen = cursor - BUF_START;

  write24(mem, BEGPC_ADDR, BUF_START);
  write24(mem, CURPC_ADDR, BUF_START);
  write24(mem, ENDPC_ADDR, BUF_START + preGapLen - 1);

  write24(mem, OPS_ADDR, postCreateOps);
  write24(mem, FPS_ADDR, postCreateFps);
  write24(mem, FPSBASE_ADDR, postCreateFpsBase);

  const parseResult = runParseInp(executor, cpu, mem);
  const op1Bytes = mem.slice(OP1_ADDR, OP1_ADDR + 9);
  const parsedValue = decodeBcdFloat(op1Bytes);
  const pass = exactMatch(mem, OP1_ADDR, EXPECTED_OP1);

  console.log(`Buffer contents after BufInsert: ${hexBytes(mem, BUF_START, 16)}`);
  console.log(`Cursor position after BufInsert: ${hex(cursor)}`);
  console.log(
    `Parse pointers: begPC=${hex(read24(mem, BEGPC_ADDR))} curPC=${hex(read24(mem, CURPC_ADDR))} endPC=${hex(read24(mem, ENDPC_ADDR))}`,
  );

  const entryLabel = parseResult.parseEntry ?? 'unknown';
  if (parseResult.error) {
    console.log(`Parse via ${entryLabel}: exception (${parseResult.error?.message ?? parseResult.error})`);
  } else if (parseResult.hit === 'ret') {
    console.log(`Parse via ${entryLabel}: FAKE_RET in ${parseResult.steps} steps`);
  } else if (parseResult.hit === 'err') {
    console.log(`Parse via ${entryLabel}: ERR_CATCH in ${parseResult.steps} steps`);
  } else {
    console.log(`Parse via ${entryLabel}: ${parseResult.termination ?? 'none'} lastPc=${hex(parseResult.lastPc)}`);
  }

  console.log(`errNo: ${hex(mem[ERRNO_ADDR], 2)}`);
  console.log(`OP1 hex dump: ${Array.from(op1Bytes, (value) => (value & 0xFF).toString(16).toUpperCase().padStart(2, '0')).join(' ')}`);
  console.log(`Parsed value as float: ${formatFloat(parsedValue)}`);
  console.log(pass ? 'PASS' : 'FAIL');

  process.exitCode = pass ? 0 : 1;
}

try {
  main();
} catch (error) {
  console.error(`FAIL: ${error?.stack ?? error}`);
  process.exitCode = 1;
}
