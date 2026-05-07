#!/usr/bin/env node
/**
 * Phase 207 Probe: 0x058D54 return values by token class
 *
 * Measured output on 2026-05-07 with the cold-boot direct-entry probe below:
 *
 * Common path:
 *   0x058D54 -> 0x058EC6 -> 0x058D58 -> 0x0800A8 -> 0x0800AE
 *   -> 0x080259 -> 0x0800B2 -> 0x058D60 -> 0x058D89 -> RET
 *
 * class  A_ret  =09  =0B  =0C  =0D  >=5A  BufInsert
 * 0x00   0x00   no   no   no   no   no    no
 * 0x01   0x01   no   no   no   no   no    no
 * 0x02   0x02   no   no   no   no   no    no
 * 0x03   0x03   no   no   no   no   no    no
 * 0x04   0x04   no   no   no   no   no    no
 * 0x05   0x05   no   no   no   no   no    no
 * 0x06   0x06   no   no   no   no   no    no
 * 0x07   0x07   no   no   no   no   no    no
 * 0x08   0x08   no   no   no   no   no    no
 * 0x09   0x09   yes  no   no   no   no    no
 * 0x0A   0x0A   no   no   no   no   no    no
 * 0x0B   0x0B   no   yes  no   no   no    no
 * 0x0C   0x0C   no   no   yes  no   no    no
 * 0x0D   0x0D   no   no   no   yes  no    no
 * 0x0E   0x0E   no   no   no   no   no    no
 * 0x0F   0x0F   no   no   no   no   no    no
 *
 * Conclusion:
 *   0x058D54 returned A unchanged for every tested class input 0x00..0x0F.
 *   None of those inputs can pass the 0x0802C4 `CP 0x5A ; RET C` gate.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const transpiledGzipPath = `${transpiledPath}.gz`;
const romPath = path.join(__dirname, 'ROM.rom');

if (!existsSync(transpiledPath)) {
  const hint = existsSync(transpiledGzipPath)
    ? 'Gunzip ROM.transpiled.js.gz first so the probe can import ROM.transpiled.js.'
    : 'ROM.transpiled.js is missing.';
  throw new Error(hint);
}

if (!existsSync(romPath)) {
  throw new Error('ROM.rom is missing.');
}

const romModule = await import('./ROM.transpiled.js');
const { PRELIFTED_BLOCKS } = romModule;
const romBytes = readFileSync(romPath);

const MEM_SIZE = 0x1000000;

const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;
const REQUESTED_SP = 0xD1A860;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;

const PROBE_ENTRY = 0x058D54;
const OP1_ADDR = 0xD005F8;
const TOKEN_STAGING_ADDR = 0xD0230E;

const STEP_LIMIT = 5000;
const MAX_LOOP_ITERATIONS = 8192;

const CLASS_INPUTS = Array.from({ length: 16 }, (_, index) => index);
const CP_09 = 0x09;
const CP_0B = 0x0B;
const CP_0C = 0x0C;
const CP_0D = 0x0D;
const CP_5A = 0x5A;

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xFF;
  mem[addr + 1] = (value >>> 8) & 0xFF;
  mem[addr + 2] = (value >>> 16) & 0xFF;
}

function createMemory() {
  return new Uint8Array(MEM_SIZE);
}

function createCPU(mem) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  return { cpu: executor.cpu, executor };
}

function resetOsState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.ix = IX_ADDR;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP;
  mem.fill(0xFF, Math.max(0, STACK_TOP - 0x80), Math.min(mem.length, STACK_TOP + 0x20));
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });
}

function runMemInit(executor, cpu, mem) {
  resetOsState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);
  let returned = false;

  try {
    executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__RET__');
      },
      onMissingBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__RET__');
      },
    });
  } catch (error) {
    if (error?.message === '__RET__') returned = true;
    else throw error;
  }

  return { returned };
}

function createBaseline() {
  const mem = createMemory();
  mem.set(romBytes.subarray(0, Math.min(mem.length, romBytes.length)));
  const { cpu, executor } = createCPU(mem);
  coldBoot(executor, cpu, mem);
  const memInit = runMemInit(executor, cpu, mem);
  return {
    mem: new Uint8Array(mem),
    memInitReturned: memInit.returned,
  };
}

function seedCase(cpu, mem, classInput) {
  resetOsState(cpu, mem);

  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
  mem.fill(0x00, TOKEN_STAGING_ADDR, TOKEN_STAGING_ADDR + 9);
  mem[OP1_ADDR] = classInput & 0xFF;
  mem[TOKEN_STAGING_ADDR] = classInput & 0xFF;

  cpu.a = classInput & 0xFF;
  cpu.b = classInput & 0xFF;
  cpu.ix = IX_ADDR;
  cpu.iy = IY_ADDR;

  mem.fill(0xFF, Math.max(0, REQUESTED_SP - 0x40), Math.min(mem.length, REQUESTED_SP + 0x10));
  cpu.sp = REQUESTED_SP;
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, RETURN_SENTINEL);
}

function traceSignature(blocks) {
  return blocks.map((pc) => hex(pc)).join(' -> ');
}

function cpSummary(aReturn) {
  const eq09 = aReturn === CP_09;
  const eq0B = aReturn === CP_0B;
  const eq0C = aReturn === CP_0C;
  const eq0D = aReturn === CP_0D;
  const passes5AGate = aReturn >= CP_5A;
  return {
    eq09,
    eq0B,
    eq0C,
    eq0D,
    passes5AGate,
    bufInsertReachable: passes5AGate && !eq09 && !eq0B && !eq0C && !eq0D,
  };
}

function runCase(baselineMem, classInput) {
  const mem = new Uint8Array(baselineMem);
  const { cpu, executor } = createCPU(mem);
  seedCase(cpu, mem, classInput);

  const visitedBlocks = [];
  const visitedSet = new Set();
  let termination = 'max_steps';

  try {
    executor.runFrom(PROBE_ENTRY, 'adl', {
      maxSteps: STEP_LIMIT,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc) {
        const normalized = pc & 0xFFFFFF;
        if (!visitedSet.has(normalized)) {
          visitedSet.add(normalized);
          visitedBlocks.push(normalized);
        }
        if (normalized === RETURN_SENTINEL) throw new Error('__RET__');
      },
      onMissingBlock(pc) {
        const normalized = pc & 0xFFFFFF;
        if (!visitedSet.has(normalized)) {
          visitedSet.add(normalized);
          visitedBlocks.push(normalized);
        }
        if (normalized === RETURN_SENTINEL) throw new Error('__RET__');
      },
    });
  } catch (error) {
    if (error?.message === '__RET__') termination = 'return';
    else throw error;
  }

  const aReturn = cpu.a & 0xFF;
  return {
    classInput: hexByte(classInput),
    aReturn: hexByte(aReturn),
    cpChain: cpSummary(aReturn),
    path: visitedBlocks.map((pc) => hex(pc)),
    termination,
  };
}

function buildSummaryLines(table) {
  const lines = [
    'class  A_ret  =09  =0B  =0C  =0D  >=5A  BufInsert',
  ];

  for (const row of table) {
    const { cpChain } = row;
    lines.push(
      [
        row.classInput.padEnd(6, ' '),
        row.aReturn.padEnd(6, ' '),
        String(cpChain.eq09 ? 'yes' : 'no').padEnd(4, ' '),
        String(cpChain.eq0B ? 'yes' : 'no').padEnd(4, ' '),
        String(cpChain.eq0C ? 'yes' : 'no').padEnd(4, ' '),
        String(cpChain.eq0D ? 'yes' : 'no').padEnd(4, ' '),
        String(cpChain.passes5AGate ? 'yes' : 'no').padEnd(5, ' '),
        String(cpChain.bufInsertReachable ? 'yes' : 'no'),
      ].join(' ')
    );
  }

  return lines;
}

function main() {
  const baseline = createBaseline();
  const table = CLASS_INPUTS.map((classInput) => runCase(baseline.mem, classInput));
  const commonPath = table[0]?.path ?? [];
  const identityForAllTested = table.every(
    (row) => parseInt(row.classInput.slice(2), 16) === parseInt(row.aReturn.slice(2), 16)
  );
  const sharedPathForAllTested = table.every(
    (row) => JSON.stringify(row.path) === JSON.stringify(commonPath)
  );

  return {
    probe: 'probe-phase207-058d54-class-returns.mjs',
    generatedAt: new Date().toISOString(),
    runtime: {
      timerInterrupt: false,
      baselineMemInitReturned: baseline.memInitReturned,
      directEntry: hex(PROBE_ENTRY),
      classInputs: CLASS_INPUTS.map((value) => hexByte(value)),
    },
    conclusions: {
      identityForAllTested,
      sharedPathForAllTested,
      commonPathSignature: traceSignature(commonPath.map((pc) => parseInt(pc.slice(2), 16))),
      note: '0x058D54 preserved A for every tested input 0x00..0x0F.',
    },
    summaryLines: buildSummaryLines(table),
    table,
  };
}

try {
  console.log(JSON.stringify(main(), null, 2));
} catch (error) {
  console.log(JSON.stringify({
    probe: 'probe-phase207-058d54-class-returns.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
