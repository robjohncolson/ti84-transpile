#!/usr/bin/env node

/**
 * Phase 155 Extended - Dense OP1/OP2 trace through gcd algorithm body (steps 80-340).
 *
 * Same setup as probe-phase155-gcd-algo-trace.mjs but extends the trace window
 * to steps 80-340 and labels key algorithm addresses when they appear.
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

const TRACE_START = 80;
const TRACE_END = 340;

// Key algorithm addresses with labels
const KEY_ADDRS = new Map([
  [0x068d82, 'algorithm body entry'],
  [0x068d89, 'OP1toOP2'],
  [0x068d8d, 'FPDiv'],
  [0x068d95, 'OP2toOP1'],
  [0x068d99, 'gcd_helper'],
  [0x068d9d, 'CkOP2Pos'],
  [0x068da1, 'E_Domain check NZ'],
  [0x068da5, 'LD A, 0x50'],
  [0x068daf, 'HL=100 loader'],
  [0x068db3, 'FPSub'],
  [0x068db7, 'FpPush_OP1'],
  [0x068dbb, 'FPCompare'],
  [0x068dbf, 'FPTrunc'],
  [0x068dc3, 'OP1toOP2'],
  [0x068dc7, 'JmpThru #1'],
  [0x068dcb, 'FPAdd'],
  [0x068dd7, 'OP2toOP1'],
  [0x068ddb, 'JmpThru #2'],
  [0x068ddf, 'POP AF'],
  [0x068de4, 'LD A, 0x0D'],
  [0x068de6, 'gcd_LoadType'],
  [0x068dea, 'E_Domain JP NC'],
  [0x068dee, 'FPDiv #2'],
  [0x068ecf, 'gcd_LoadType impl'],
]);

const WATCH_PCS = new Set(KEY_ADDRS.keys());

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
  const label = KEY_ADDRS.get(entry.pc);
  const labelTag = label ? ` <${label}>` : '';
  return (
    `Step ${entry.step}: PC=${hex(entry.pc)} A=${hex(entry.a, 2)} ` +
    `B=${hex(entry.b, 2)} FPS=${hex(entry.fps)} ` +
    `OP1=[${entry.op1Hex}] OP2=[${entry.op2Hex}]${missing}${labelTag}${suffix}`
  );
}

function describeChanges(previous, current) {
  if (!previous) {
    return '';
  }

  const changes = [];
  if (previous.op1Hex !== current.op1Hex) changes.push('OP1');
  if (previous.op2Hex !== current.op2Hex) changes.push('OP2');
  if (previous.a !== current.a) changes.push('A');
  if (previous.b !== current.b) changes.push('B');
  if (previous.fps !== current.fps) changes.push('FPS');
  if (changes.length === 0) return '';
  return ` << changed ${changes.join('+')}`;
}

function main() {
  console.log('=== Phase 155 Extended: Dense gcd algorithm-body trace (steps 80-340) ===');
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
  console.log(`Key addresses watched: ${KEY_ADDRS.size}`);
  console.log('');
  console.log('--- Step-by-step trace (steps 80-340) ---');

  let previous = null;
  for (const entry of rangeHits) {
    console.log(formatTraceEntry(entry, describeChanges(previous, entry)));
    previous = entry;
  }

  console.log('');
  console.log('--- Key address hits (all steps) ---');

  if (watchHits.length === 0) {
    console.log('(none)');
  } else {
    for (const entry of watchHits) {
      console.log(formatTraceEntry(entry));
    }
  }

  console.log('');
  console.log('--- Key address hit counts ---');
  const hitCounts = new Map();
  for (const entry of watchHits) {
    const label = KEY_ADDRS.get(entry.pc) || hex(entry.pc);
    hitCounts.set(label, (hitCounts.get(label) || 0) + 1);
  }
  for (const [label, count] of hitCounts) {
    console.log(`  ${label}: ${count}x`);
  }

  console.log('');
  console.log('--- Run summary ---');
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
