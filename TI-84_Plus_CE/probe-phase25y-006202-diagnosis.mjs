#!/usr/bin/env node

/**
 * Phase 25Y: Diagnose the reported 0x006202 loop in the committed ParseInp probe.
 *
 * This mirrors the committed Phase 25X setup:
 *   - cold boot
 *   - MEM_INIT at 0x09DEE0
 *   - token buffer at 0xD00800: 32 70 33 3F
 *   - begPC/curPC/endPC pointed at the token buffer
 *   - minimal 6-byte errSP frame
 *   - ParseInp at 0x099914
 *
 * Diagnostics added here:
 *   - print 32 ROM bytes from 0x006202
 *   - log each unique PC visited in the first 2000 steps
 *   - report the first entry into 0x006xxx, if any
 *   - report whether ERR_CATCH_ADDR is ever visited
 *   - dump the last 100 unique PCs after the run
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
const PARSEINP_ENTRY = 0x099914;

const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;

const TOKEN_BUFFER_ADDR = 0xd00800;
const ROM_DIAG_ADDR = 0x006202;
const ROM_DIAG_LEN = 32;
const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;
const MEMINIT_RET = 0x7ffff6;

const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);

const MEMINIT_BUDGET = 100000;
const PARSE_BUDGET = 10000;
const MAX_LOOP_ITER = 8192;
const FIRST_STEP_WINDOW = 2000;
const LAST_UNIQUE_PC_WINDOW = 100;

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function hexBytes(bytes) {
  return Array.from(bytes, (byte) => (byte & 0xff).toString(16).padStart(2, '0')).join(' ');
}

function read24(mem, addr) {
  return (
    (mem[addr & 0xffffff] & 0xff) |
    ((mem[(addr + 1) & 0xffffff] & 0xff) << 8) |
    ((mem[(addr + 2) & 0xffffff] & 0xff) << 16)
  ) >>> 0;
}

function write24(mem, addr, value) {
  mem[addr & 0xffffff] = value & 0xff;
  mem[(addr + 1) & 0xffffff] = (value >>> 8) & 0xff;
  mem[(addr + 2) & 0xffffff] = (value >>> 16) & 0xff;
}

function coldBoot(executor, cpu, mem) {
  const bootResult = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

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

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return bootResult;
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

async function main() {
  const log = (line = '') => console.log(line);

  log('=== Phase 25Y: 0x006202 diagnosis ===');
  log(`ROM[${hex(ROM_DIAG_ADDR)}..${hex(ROM_DIAG_ADDR + ROM_DIAG_LEN - 1)}]: ${hexBytes(romBytes.subarray(ROM_DIAG_ADDR, ROM_DIAG_ADDR + ROM_DIAG_LEN))}`);

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const bootResult = coldBoot(executor, cpu, mem);
  log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc ?? 0)}`);

  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);

  let meminitReturned = false;
  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: MEMINIT_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__MEMINIT_RET__');
      },
      onMissingBlock(pc) {
        if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__MEMINIT_RET__');
      },
    });
  } catch (error) {
    if (error?.message === '__MEMINIT_RET__') {
      meminitReturned = true;
    } else {
      throw error;
    }
  }

  log(`memInitReturned=${meminitReturned}`);

  mem.fill(0x00, TOKEN_BUFFER_ADDR, TOKEN_BUFFER_ADDR + 0x80);
  mem.set(INPUT_TOKENS, TOKEN_BUFFER_ADDR);
  write24(mem, BEGPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, CURPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, ENDPC_ADDR, TOKEN_BUFFER_ADDR + INPUT_TOKENS.length - 1);

  prepareCallState(cpu, mem);
  write24(mem, cpu.sp, FAKE_RET);
  const errFrameBase = (cpu.sp - 6) & 0xffffff;
  mem.fill(0x00, errFrameBase, errFrameBase + 6);
  write24(mem, errFrameBase + 3, ERR_CATCH_ADDR);
  write24(mem, ERR_SP_ADDR, errFrameBase);
  mem[ERR_NO_ADDR] = 0x00;

  log(`parseinp setup: tokenBuffer=${hex(TOKEN_BUFFER_ADDR)} errSP=${hex(read24(mem, ERR_SP_ADDR))} sp=${hex(cpu.sp)}`);

  const firstStepUniquePcs = [];
  const firstStepSeen = new Set();
  const allUniquePcs = [];
  const allSeen = new Set();

  let first006xxx = null;
  let firstErrCatch = null;
  let sawFakeRet = false;
  let sawErrCatch = false;
  let finalPc = null;
  let stepCount = 0;
  let termination = 'unknown';
  let missingBlock = false;

  const notePc = (pc, step) => {
    const norm = pc & 0xffffff;
    finalPc = norm;

    if (typeof step === 'number') {
      stepCount = Math.max(stepCount, step + 1);
    }

    if (!allSeen.has(norm)) {
      allSeen.add(norm);
      allUniquePcs.push({ step, pc: norm });
    }

    if (typeof step === 'number' && step < FIRST_STEP_WINDOW && !firstStepSeen.has(norm)) {
      firstStepSeen.add(norm);
      firstStepUniquePcs.push({ step, pc: norm });
    }

    if (first006xxx === null && norm >= 0x006000 && norm <= 0x006fff) {
      first006xxx = { step, pc: norm };
    }

    if (norm === ERR_CATCH_ADDR) {
      sawErrCatch = true;
      if (firstErrCatch === null) {
        firstErrCatch = { step, pc: norm };
      }
    }

    if (norm === FAKE_RET) {
      sawFakeRet = true;
    }
  };

  const result = executor.runFrom(PARSEINP_ENTRY, 'adl', {
    maxSteps: PARSE_BUDGET,
    maxLoopIterations: MAX_LOOP_ITER,
    onBlock(pc, mode, meta, step) {
      notePc(pc, step);
    },
    onMissingBlock(pc, mode, step) {
      missingBlock = true;
      notePc(pc, step);
    },
  });

  termination = result.termination;
  finalPc = result.lastPc ?? finalPc;
  stepCount = Math.max(stepCount, result.steps ?? 0);

  log(`parseResult: steps=${stepCount} term=${termination} lastPc=${hex(finalPc ?? 0)} missingBlock=${missingBlock}`);
  log(`errNo=${hex(mem[ERR_NO_ADDR] & 0xff, 2)} errSP=${hex(read24(mem, ERR_SP_ADDR))}`);
  log(`first006xxx=${first006xxx ? `${hex(first006xxx.pc)} @ step ${first006xxx.step}` : 'none'}`);
  log(`firstErrCatch=${firstErrCatch ? `${hex(firstErrCatch.pc)} @ step ${firstErrCatch.step}` : 'none'}`);
  log(`sawErrCatch=${sawErrCatch} sawFakeRet=${sawFakeRet}`);
  log(`uniquePcCount=${allUniquePcs.length}`);

  log('');
  log(`=== Unique PCs visited in first ${FIRST_STEP_WINDOW} steps ===`);
  for (const entry of firstStepUniquePcs) {
    log(`${String(entry.step).padStart(4, ' ')} ${hex(entry.pc)}`);
  }

  log('');
  log(`=== Last ${LAST_UNIQUE_PC_WINDOW} unique PCs ===`);
  for (const entry of allUniquePcs.slice(-LAST_UNIQUE_PC_WINDOW)) {
    log(`${String(entry.step).padStart(4, ' ')} ${hex(entry.pc)}`);
  }
}

try {
  await main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
