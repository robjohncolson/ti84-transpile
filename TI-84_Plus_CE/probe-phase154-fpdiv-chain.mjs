#!/usr/bin/env node

/**
 * Phase 154 - Suspect FPDiv jump-table chain trace.
 *
 * This probe follows the jump-table slot at 0x020284. The stub itself is not
 * lifted as a standalone transpiled block, so the probe resolves the target
 * from ROM bytes and traces the target block directly.
 *
 * It also prints the real FPDiv slot for comparison:
 *   0x0201F4 -> 0x07CAB9
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_BIN_PATH = path.join(__dirname, 'ROM.rom');
const ROM_TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const romBytes = fs.readFileSync(ROM_BIN_PATH);
const romModule = await import(pathToFileURL(ROM_TRANSPILED_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS ?? romModule.blocks;

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

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const MAX_LOOP_ITER = 8192;
const FPS_CLEAN_AREA = 0xd1aa00;

const SUSPECT_JT_ADDR = 0x020284;
const REAL_FPDIV_JT_ADDR = 0x0201f4;

const BCD_12 = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_8 = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const hex = (value, width = 6) =>
  `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

const hexByte = (value) =>
  (value & 0xff).toString(16).toUpperCase().padStart(2, '0');

const formatBytes = (bytes) =>
  bytes.map((byte) => hexByte(byte)).join(' ');

function read24(mem, addr) {
  return ((mem[addr] & 0xff) |
    ((mem[addr + 1] & 0xff) << 8) |
    ((mem[addr + 2] & 0xff) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

function readBytes(mem, addr, len) {
  return Array.from(mem.subarray(addr, addr + len), (byte) => byte & 0xff);
}

function resolveJtTarget(jtAddr) {
  const opcode = romBytes[jtAddr] & 0xff;
  const target = opcode === 0xc3
    ? ((romBytes[jtAddr + 1] & 0xff) |
      ((romBytes[jtAddr + 2] & 0xff) << 8) |
      ((romBytes[jtAddr + 3] & 0xff) << 16)) >>> 0
    : null;

  return {
    opcode,
    target,
    raw: formatBytes(Array.from(romBytes.subarray(jtAddr, jtAddr + 4))),
  };
}

function hasBlock(pc) {
  return Boolean(BLOCKS[`${pc.toString(16).padStart(6, '0')}:adl`]);
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

function seedOperands(mem) {
  seedAllocator(mem);
  mem.fill(0x00, FPS_CLEAN_AREA, FPS_CLEAN_AREA + 0x40);
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA);

  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 11);
  mem.fill(0x00, OP2_ADDR, OP2_ADDR + 11);
  mem.set(BCD_12, OP1_ADDR);
  mem.set(BCD_8, OP2_ADDR);
}

function main() {
  const suspect = resolveJtTarget(SUSPECT_JT_ADDR);
  const actual = resolveJtTarget(REAL_FPDIV_JT_ADDR);
  const traceEntry = hasBlock(SUSPECT_JT_ADDR) ? SUSPECT_JT_ADDR : suspect.target;

  const { mem, executor, cpu } = createRuntime();
  coldBoot(executor, cpu, mem);
  if (!runMemInit(executor, cpu, mem)) {
    throw new Error('MEM_INIT failed');
  }

  prepareCallState(cpu, mem);
  seedOperands(mem);
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  console.log(`Suspect JT slot: ${hex(SUSPECT_JT_ADDR)} raw=[${suspect.raw}] target=${hex(suspect.target)}`);
  console.log(`Actual FPDiv slot: ${hex(REAL_FPDIV_JT_ADDR)} raw=[${actual.raw}] target=${hex(actual.target)}`);
  console.log(`JT block present: ${hasBlock(SUSPECT_JT_ADDR) ? 'yes' : 'no'}`);
  if (!hasBlock(SUSPECT_JT_ADDR)) {
    console.log(`Tracing resolved target ${hex(traceEntry)} because the JT stub is not lifted as a standalone block.`);
  }
  console.log(`Initial OP1=[${formatBytes(readBytes(mem, OP1_ADDR, 9))}] OP2=[${formatBytes(readBytes(mem, OP2_ADDR, 9))}]`);

  const trace = [];
  let outcome = 'budget';
  let stepCount = 0;
  let prevOp1_0 = mem[OP1_ADDR] & 0xff;
  let prevOp2_0 = mem[OP2_ADDR] & 0xff;

  try {
    executor.runFrom(traceEntry, 'adl', {
      maxSteps: 200,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        stepCount = Math.max(stepCount, typeof step === 'number' ? step + 1 : stepCount + 1);

        const op1 = readBytes(mem, OP1_ADDR, 9);
        const op2 = readBytes(mem, OP2_ADDR, 9);
        const notes = [];

        if (op1[0] !== prevOp1_0) {
          notes.push(`OP1[0] ${hexByte(prevOp1_0)}->${hexByte(op1[0])}`);
        }
        if (op2[0] !== prevOp2_0) {
          notes.push(`OP2[0] ${hexByte(prevOp2_0)}->${hexByte(op2[0])}`);
        }

        trace.push({
          step: stepCount,
          pc: norm,
          op1: formatBytes(op1),
          op2: formatBytes(op2),
          note: notes.join(', '),
        });

        prevOp1_0 = op1[0];
        prevOp2_0 = op2[0];

        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        stepCount = Math.max(stepCount, typeof step === 'number' ? step + 1 : stepCount + 1);

        if (norm === FAKE_RET) {
          trace.push({
            step: stepCount,
            pc: norm,
            op1: formatBytes(readBytes(mem, OP1_ADDR, 9)),
            op2: formatBytes(readBytes(mem, OP2_ADDR, 9)),
            note: 'RET sentinel',
          });
          throw new Error('__RET__');
        }

        if (norm === ERR_CATCH_ADDR) {
          trace.push({
            step: stepCount,
            pc: norm,
            op1: formatBytes(readBytes(mem, OP1_ADDR, 9)),
            op2: formatBytes(readBytes(mem, OP2_ADDR, 9)),
            note: 'ERR sentinel',
          });
          throw new Error('__ERR__');
        }

        trace.push({
          step: stepCount,
          pc: norm,
          op1: formatBytes(readBytes(mem, OP1_ADDR, 9)),
          op2: formatBytes(readBytes(mem, OP2_ADDR, 9)),
          note: 'MISSING BLOCK',
        });
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

  console.log(`Outcome=${outcome} steps=${stepCount} errNo=${hexByte(mem[ERR_NO_ADDR])}`);
  for (const row of trace) {
    const note = row.note ? `  ${row.note}` : '';
    console.log(
      `[${String(row.step).padStart(2, '0')}] PC=${hex(row.pc)} OP1=[${row.op1}] OP2=[${row.op2}]${note}`,
    );
  }
  console.log(
    `Final OP1=[${formatBytes(readBytes(mem, OP1_ADDR, 9))}] ` +
    `OP2=[${formatBytes(readBytes(mem, OP2_ADDR, 9))}] FPS=${hex(read24(mem, FPS_ADDR))}`,
  );
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
