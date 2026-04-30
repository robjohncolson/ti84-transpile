#!/usr/bin/env node

/**
 * Phase 155 - Dense OP1/OP2 trace through the gcd algorithm body.
 *
 * Reuses the phase154 gcd(12,8) direct-call setup and records OP1, OP2,
 * registers A/B, and the FPS pointer for every block hit in steps 21-80.
 * It also captures the same state for each visit to the known E_Domain
 * decision PCs so the failing path can be reviewed in one run.
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

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const MEMINIT_BUDGET = 100000;
const MAX_LOOP_ITER = 8192;
const MAX_STEPS = 5000;

const FPS_CLEAN_AREA = 0xd1aa00;

const TRACE_START = 21;
const TRACE_END = 80;
const WATCH_PCS = new Set([0x068dea, 0x068da1, 0x068d65, 0x068d67]);

const BCD_12 = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_8 = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const hex = (value, width = 6) =>
  value === undefined || value === null
    ? null
    : `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

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
  return bytes
    .map((byte) => (byte & 0xff).toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
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
  if (typeof step === 'number') {
    return Math.max(stepCount, step + 1);
  }
  return stepCount + 1;
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

function captureTraceEntry(mem, cpu, step, pc, kind) {
  const op1 = readBytes(mem, OP1_ADDR, 9);
  const op2 = readBytes(mem, OP2_ADDR, 9);
  const fps = read24(mem, FPS_ADDR);

  return {
    step,
    pc: pc & 0xffffff,
    kind,
    a: cpu.a & 0xff,
    b: cpu.b & 0xff,
    fps,
    op1Hex: formatBytes(op1),
    op2Hex: formatBytes(op2),
  };
}

function formatTraceEntry(entry, suffix = '') {
  const missing = entry.kind === 'missing' ? ' [MISSING]' : '';
  return (
    `Step ${entry.step}: PC=${hex(entry.pc)} A=${hex(entry.a, 2)} ` +
    `B=${hex(entry.b, 2)} FPS=${hex(entry.fps)} ` +
    `OP1=[${entry.op1Hex}] OP2=[${entry.op2Hex}]${missing}${suffix}`
  );
}

function describeChanges(previous, current) {
  if (!previous) {
    return '';
  }

  const changes = [];
  if (previous.op1Hex !== current.op1Hex) changes.push('OP1');
  if (previous.op2Hex !== current.op2Hex) changes.push('OP2');
  if (changes.length === 0) return '';
  return ` << changed ${changes.join('+')}`;
}

function main() {
  console.log('=== Phase 155: Dense gcd algorithm-body trace (steps 21-80) ===');
  console.log('');

  const runtime = createPreparedRuntime();

  if (!runtime.memInitOk) {
    console.log(JSON.stringify({ memInitOk: false }, null, 2));
    process.exitCode = 1;
    return;
  }

  const { mem, executor, cpu } = runtime;
  prepareCallState(cpu, mem);
  seedGcdFpState(mem);
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  const rangeHits = [];
  const watchHits = [];

  let stepCount = 0;
  let outcome = 'budget';
  let lastMissingBlock = null;
  let thrownMessage = null;

  try {
    executor.runFrom(GCD_DIRECT_ADDR, 'adl', {
      maxSteps: MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);

        if (stepCount >= TRACE_START && stepCount <= TRACE_END) {
          rangeHits.push(captureTraceEntry(mem, cpu, stepCount, norm, 'block'));
        }

        if (WATCH_PCS.has(norm)) {
          watchHits.push(captureTraceEntry(mem, cpu, stepCount, norm, 'block'));
        }

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = noteStep(stepCount, step);
        lastMissingBlock = norm;

        if (stepCount >= TRACE_START && stepCount <= TRACE_END) {
          rangeHits.push(captureTraceEntry(mem, cpu, stepCount, norm, 'missing'));
        }

        if (WATCH_PCS.has(norm)) {
          watchHits.push(captureTraceEntry(mem, cpu, stepCount, norm, 'missing'));
        }

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

  console.log(`Entry: ${hex(GCD_DIRECT_ADDR)}`);
  console.log(`Trace window: steps ${TRACE_START}-${TRACE_END}`);
  console.log(`Watch PCs: ${Array.from(WATCH_PCS).map((pc) => hex(pc)).join(', ')}`);
  console.log('');
  console.log('Step-by-step trace:');

  for (const entry of rangeHits) {
    console.log(formatTraceEntry(entry));
  }

  console.log('');
  console.log('Watch-PC hits:');

  if (watchHits.length === 0) {
    console.log('(none)');
  } else {
    for (const entry of watchHits) {
      console.log(formatTraceEntry(entry));
    }
  }

  console.log('');
  console.log('Summary by step (21-80):');

  let previous = null;
  for (const entry of rangeHits) {
    console.log(formatTraceEntry(entry, describeChanges(previous, entry)));
    previous = entry;
  }

  console.log('');
  console.log('Run summary:');
  console.log(`Outcome: ${outcome}`);
  console.log(`Total steps: ${stepCount}`);
  console.log(`errNo: ${hex(mem[ERR_NO_ADDR] & 0xff, 2)} (${errName(mem[ERR_NO_ADDR] & 0xff)})`);
  console.log(`Final OP1: [${formatBytes(readBytes(mem, OP1_ADDR, 9))}]`);
  console.log(`Final OP2: [${formatBytes(readBytes(mem, OP2_ADDR, 9))}]`);
  console.log(`Final FPS ptr: ${hex(read24(mem, FPS_ADDR))}`);

  if (lastMissingBlock !== null) {
    console.log(`Last missing block: ${hex(lastMissingBlock)}`);
  }
  if (thrownMessage) {
    console.log(`Thrown: ${thrownMessage.split('\n')[0]}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}

/*
Captured output (`node --no-warnings TI-84_Plus_CE/probe-phase155-gcd-algo-trace.mjs`):

=== Phase 155: Dense gcd algorithm-body trace (steps 21-80) ===

Entry: 0x068D3D
Trace window: steps 21-80
Watch PCs: 0x068DEA, 0x068DA1, 0x068D65, 0x068D67

Step-by-step trace:
Step 21: PC=0x07F831 A=0x00 B=0xA9 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 22: PC=0x07F83A A=0x12 B=0xA9 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 23: PC=0x07F843 A=0x10 B=0xA9 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 24: PC=0x07F850 A=0x00 B=0xA9 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 25: PC=0x07F854 A=0x00 B=0xA9 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 26: PC=0x080037 A=0x00 B=0xA9 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 27: PC=0x07F858 A=0x01 B=0xA9 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 28: PC=0x07F883 A=0x01 B=0xA9 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 29: PC=0x07F88D A=0x81 B=0xA9 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 30: PC=0x07F896 A=0x80 B=0xA9 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 31: PC=0x068D65 A=0x01 B=0xA9 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 32: PC=0x068D67 A=0x01 B=0xA9 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 33: PC=0x068D69 A=0x01 B=0xA9 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 34: PC=0x0685DF A=0x01 B=0xA9 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 35: PC=0x07CBB5 A=0x80 B=0xA9 FPS=0xD1AA09 OP1=[00 80 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 36: PC=0x07FF38 A=0x80 B=0xA9 FPS=0xD1AA09 OP1=[00 80 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 37: PC=0x07CBB9 A=0x80 B=0xA9 FPS=0xD1AA09 OP1=[00 80 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 38: PC=0x07CBDB A=0x80 B=0xA9 FPS=0xD1AA09 OP1=[00 80 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 39: PC=0x07CBE3 A=0x04 B=0xA9 FPS=0xD1AA09 OP1=[00 80 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 40: PC=0x07CBEB A=0x02 B=0xA9 FPS=0xD1AA09 OP1=[00 80 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 41: PC=0x07CBEC A=0x00 B=0x01 FPS=0xD1AA09 OP1=[00 80 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 42: PC=0x07CBF2 A=0x00 B=0x00 FPS=0xD1AA09 OP1=[00 80 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 43: PC=0x07CC02 A=0x00 B=0x00 FPS=0xD1AA09 OP1=[00 80 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 44: PC=0x07CBCF A=0x00 B=0x01 FPS=0xD1AA09 OP1=[00 80 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 45: PC=0x07FD4A A=0x00 B=0x01 FPS=0xD1AA09 OP1=[00 80 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 46: PC=0x07CBD3 A=0x12 B=0x01 FPS=0xD1AA09 OP1=[00 80 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 47: PC=0x07F7D6 A=0x12 B=0x01 FPS=0xD1AA09 OP1=[00 80 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 48: PC=0x0685F0 A=0x00 B=0x01 FPS=0xD1AA09 OP1=[00 80 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 49: PC=0x068D6D A=0x80 B=0x81 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 50: PC=0x068D75 A=0x81 B=0x81 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 51: PC=0x068D7E A=0x81 B=0x00 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 52: PC=0x068D20 A=0x81 B=0x00 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 53: PC=0x068D82 A=0x81 B=0x00 FPS=0xD1AA09 OP1=[00 83 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 54: PC=0x07F8A2 A=0x81 B=0x00 FPS=0xD1AA09 OP1=[00 83 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 55: PC=0x07F8C8 A=0x81 B=0x00 FPS=0xD1AA09 OP1=[00 83 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 56: PC=0x07F974 A=0x81 B=0x00 FPS=0xD1AA09 OP1=[00 83 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 57: PC=0x068D89 A=0x81 B=0xFF FPS=0xD1AA09 OP1=[00 83 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 58: PC=0x07C747 A=0x81 B=0xFF FPS=0xD1AA09 OP1=[00 83 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 59: PC=0x07F8FA A=0x81 B=0xFF FPS=0xD1AA09 OP1=[00 83 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 60: PC=0x07F974 A=0x81 B=0xFF FPS=0xD1AA09 OP1=[00 83 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 61: PC=0x07C74B A=0x81 B=0xFF FPS=0xD1AA09 OP1=[00 83 12 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]
Step 62: PC=0x07CA48 A=0x81 B=0xFF FPS=0xD1AA09 OP1=[00 83 12 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]
Step 63: PC=0x07FD4A A=0x81 B=0xFF FPS=0xD1AA09 OP1=[00 83 12 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]
Step 64: PC=0x07CA4C A=0x12 B=0xFF FPS=0xD1AA09 OP1=[00 83 12 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]
Step 65: PC=0x07CA4D A=0x12 B=0xFF FPS=0xD1AA09 OP1=[00 83 12 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]
Step 66: PC=0x07CA59 A=0x03 B=0xFF FPS=0xD1AA09 OP1=[00 83 12 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]
Step 67: PC=0x07CA69 A=0x03 B=0xFF FPS=0xD1AA09 OP1=[00 83 12 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]
Step 68: PC=0x07FB33 A=0x03 B=0xFF FPS=0xD1AA09 OP1=[00 83 12 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]
Step 69: PC=0x07FB50 A=0x00 B=0xFF FPS=0xD1AA09 OP1=[00 83 12 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]
Step 70: PC=0x07CA6D A=0x01 B=0xFF FPS=0xD1AA09 OP1=[00 83 20 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]
Step 71: PC=0x07FDF1 A=0x01 B=0xFF FPS=0xD1AA09 OP1=[00 83 20 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]
Step 72: PC=0x07CA71 A=0x82 B=0xFF FPS=0xD1AA09 OP1=[00 82 20 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]
Step 73: PC=0x07CA5F A=0x82 B=0xFF FPS=0xD1AA09 OP1=[00 82 20 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]
Step 74: PC=0x07CA69 A=0x82 B=0xFF FPS=0xD1AA09 OP1=[00 82 20 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]
Step 75: PC=0x07FB33 A=0x82 B=0xFF FPS=0xD1AA09 OP1=[00 82 20 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]
Step 76: PC=0x07FB50 A=0x00 B=0xFF FPS=0xD1AA09 OP1=[00 82 20 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]
Step 77: PC=0x07CA6D A=0x02 B=0xFF FPS=0xD1AA09 OP1=[00 82 00 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]
Step 78: PC=0x07FDF1 A=0x02 B=0xFF FPS=0xD1AA09 OP1=[00 82 00 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]
Step 79: PC=0x07CA71 A=0x81 B=0xFF FPS=0xD1AA09 OP1=[00 81 00 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]
Step 80: PC=0x07CA5F A=0x81 B=0xFF FPS=0xD1AA09 OP1=[00 81 00 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]

Watch-PC hits:
Step 31: PC=0x068D65 A=0x01 B=0xA9 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 32: PC=0x068D67 A=0x01 B=0xA9 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 332: PC=0x068DA1 A=0x00 B=0x00 FPS=0xD1AA09 OP1=[00 82 00 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]
Step 750: PC=0x068D65 A=0x02 B=0x00 FPS=0xD1AA1B OP1=[00 82 10 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 751: PC=0x068D67 A=0x02 B=0x00 FPS=0xD1AA1B OP1=[00 82 10 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 1043: PC=0x068DA1 A=0x00 B=0x00 FPS=0xD1AA1B OP1=[00 82 00 00 00 00 00 00 00] OP2=[00 82 10 00 00 00 00 00 00]

Summary by step (21-80):
Step 21: PC=0x07F831 A=0x00 B=0xA9 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 22: PC=0x07F83A A=0x12 B=0xA9 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 23: PC=0x07F843 A=0x10 B=0xA9 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 24: PC=0x07F850 A=0x00 B=0xA9 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 25: PC=0x07F854 A=0x00 B=0xA9 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 26: PC=0x080037 A=0x00 B=0xA9 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 27: PC=0x07F858 A=0x01 B=0xA9 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 28: PC=0x07F883 A=0x01 B=0xA9 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 29: PC=0x07F88D A=0x81 B=0xA9 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 30: PC=0x07F896 A=0x80 B=0xA9 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 31: PC=0x068D65 A=0x01 B=0xA9 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 32: PC=0x068D67 A=0x01 B=0xA9 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 33: PC=0x068D69 A=0x01 B=0xA9 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 34: PC=0x0685DF A=0x01 B=0xA9 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 35: PC=0x07CBB5 A=0x80 B=0xA9 FPS=0xD1AA09 OP1=[00 80 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00] << changed OP1
Step 36: PC=0x07FF38 A=0x80 B=0xA9 FPS=0xD1AA09 OP1=[00 80 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 37: PC=0x07CBB9 A=0x80 B=0xA9 FPS=0xD1AA09 OP1=[00 80 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 38: PC=0x07CBDB A=0x80 B=0xA9 FPS=0xD1AA09 OP1=[00 80 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 39: PC=0x07CBE3 A=0x04 B=0xA9 FPS=0xD1AA09 OP1=[00 80 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 40: PC=0x07CBEB A=0x02 B=0xA9 FPS=0xD1AA09 OP1=[00 80 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 41: PC=0x07CBEC A=0x00 B=0x01 FPS=0xD1AA09 OP1=[00 80 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 42: PC=0x07CBF2 A=0x00 B=0x00 FPS=0xD1AA09 OP1=[00 80 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 43: PC=0x07CC02 A=0x00 B=0x00 FPS=0xD1AA09 OP1=[00 80 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 44: PC=0x07CBCF A=0x00 B=0x01 FPS=0xD1AA09 OP1=[00 80 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 45: PC=0x07FD4A A=0x00 B=0x01 FPS=0xD1AA09 OP1=[00 80 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 46: PC=0x07CBD3 A=0x12 B=0x01 FPS=0xD1AA09 OP1=[00 80 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 47: PC=0x07F7D6 A=0x12 B=0x01 FPS=0xD1AA09 OP1=[00 80 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 48: PC=0x0685F0 A=0x00 B=0x01 FPS=0xD1AA09 OP1=[00 80 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 49: PC=0x068D6D A=0x80 B=0x81 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00] << changed OP1
Step 50: PC=0x068D75 A=0x81 B=0x81 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 51: PC=0x068D7E A=0x81 B=0x00 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 52: PC=0x068D20 A=0x81 B=0x00 FPS=0xD1AA09 OP1=[00 81 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 53: PC=0x068D82 A=0x81 B=0x00 FPS=0xD1AA09 OP1=[00 83 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00] << changed OP1
Step 54: PC=0x07F8A2 A=0x81 B=0x00 FPS=0xD1AA09 OP1=[00 83 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 55: PC=0x07F8C8 A=0x81 B=0x00 FPS=0xD1AA09 OP1=[00 83 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 56: PC=0x07F974 A=0x81 B=0x00 FPS=0xD1AA09 OP1=[00 83 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 57: PC=0x068D89 A=0x81 B=0xFF FPS=0xD1AA09 OP1=[00 83 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 58: PC=0x07C747 A=0x81 B=0xFF FPS=0xD1AA09 OP1=[00 83 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 59: PC=0x07F8FA A=0x81 B=0xFF FPS=0xD1AA09 OP1=[00 83 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 60: PC=0x07F974 A=0x81 B=0xFF FPS=0xD1AA09 OP1=[00 83 12 00 00 00 00 00 00] OP2=[00 80 10 00 00 00 00 00 00]
Step 61: PC=0x07C74B A=0x81 B=0xFF FPS=0xD1AA09 OP1=[00 83 12 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00] << changed OP2
Step 62: PC=0x07CA48 A=0x81 B=0xFF FPS=0xD1AA09 OP1=[00 83 12 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]
Step 63: PC=0x07FD4A A=0x81 B=0xFF FPS=0xD1AA09 OP1=[00 83 12 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]
Step 64: PC=0x07CA4C A=0x12 B=0xFF FPS=0xD1AA09 OP1=[00 83 12 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]
Step 65: PC=0x07CA4D A=0x12 B=0xFF FPS=0xD1AA09 OP1=[00 83 12 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]
Step 66: PC=0x07CA59 A=0x03 B=0xFF FPS=0xD1AA09 OP1=[00 83 12 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]
Step 67: PC=0x07CA69 A=0x03 B=0xFF FPS=0xD1AA09 OP1=[00 83 12 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]
Step 68: PC=0x07FB33 A=0x03 B=0xFF FPS=0xD1AA09 OP1=[00 83 12 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]
Step 69: PC=0x07FB50 A=0x00 B=0xFF FPS=0xD1AA09 OP1=[00 83 12 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]
Step 70: PC=0x07CA6D A=0x01 B=0xFF FPS=0xD1AA09 OP1=[00 83 20 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00] << changed OP1
Step 71: PC=0x07FDF1 A=0x01 B=0xFF FPS=0xD1AA09 OP1=[00 83 20 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]
Step 72: PC=0x07CA71 A=0x82 B=0xFF FPS=0xD1AA09 OP1=[00 82 20 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00] << changed OP1
Step 73: PC=0x07CA5F A=0x82 B=0xFF FPS=0xD1AA09 OP1=[00 82 20 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]
Step 74: PC=0x07CA69 A=0x82 B=0xFF FPS=0xD1AA09 OP1=[00 82 20 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]
Step 75: PC=0x07FB33 A=0x82 B=0xFF FPS=0xD1AA09 OP1=[00 82 20 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]
Step 76: PC=0x07FB50 A=0x00 B=0xFF FPS=0xD1AA09 OP1=[00 82 20 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]
Step 77: PC=0x07CA6D A=0x02 B=0xFF FPS=0xD1AA09 OP1=[00 82 00 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00] << changed OP1
Step 78: PC=0x07FDF1 A=0x02 B=0xFF FPS=0xD1AA09 OP1=[00 82 00 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]
Step 79: PC=0x07CA71 A=0x81 B=0xFF FPS=0xD1AA09 OP1=[00 81 00 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00] << changed OP1
Step 80: PC=0x07CA5F A=0x81 B=0xFF FPS=0xD1AA09 OP1=[00 81 00 00 00 00 00 00 00] OP2=[00 83 12 00 00 00 00 00 00]

Run summary:
Outcome: return
Total steps: 1442
errNo: 0x84 (E_Domain)
Final OP1: [80 82 10 00 00 00 00 00 00]
Final OP2: [80 82 10 00 00 00 00 00 00]
Final FPS ptr: 0xD1AA12
Last missing block: 0x7FFFFE
*/
