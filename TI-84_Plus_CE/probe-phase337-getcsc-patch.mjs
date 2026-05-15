#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const CPU_RUNTIME_PATH = path.join(__dirname, 'cpu-runtime.js');
const PERIPHERALS_PATH = path.join(__dirname, 'peripherals.js');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const STACK_RESET_TOP = 0xD1A87E;
const IY_BASE = 0xD00080;
const RETURN_SENTINEL = 0xFFFFFF;

const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_MAX_STEPS = 100000;
const KERNEL_INIT_MAX_LOOP_ITERATIONS = 10000;

const CXMAIN_PTR = 0xD007CA;
const HOME_HANDLER = 0x058241;
const COORMON_ENTRY = 0x08BF22;
const COORMON_BRANCH_POINT = 0x08BF3C;
const COORMON_KEY_PRESENT_TARGET = 0x08BF68;

const GETCSC_ENTRY = 0x042366;
const GETCSC_READ_BLOCK = 0x04236E;
const GETCSC_CERT_ADDR = 0x3B0033;
const ENTER_SCAN = 0x09;

const EVENT_LOOP_MAX_STEPS = 50000;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hex8(value) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(value & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`;
}

function write24(buffer, addr, value) {
  const base = addr >>> 0;
  const normalized = value >>> 0;
  buffer[base] = normalized & 0xFF;
  buffer[base + 1] = (normalized >>> 8) & 0xFF;
  buffer[base + 2] = (normalized >>> 16) & 0xFF;
}

function chunk(items, width) {
  const rows = [];
  for (let index = 0; index < items.length; index += width) {
    rows.push(items.slice(index, index + width));
  }
  return rows;
}

function createMemoryBus(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return mem;
}

function resetStack(cpu, mem) {
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, RETURN_SENTINEL);
}

function installHomeHandler(mem) {
  write24(mem, CXMAIN_PTR, HOME_HANDLER);
}

function blockContainsAddress(meta, address) {
  if (!meta) {
    return false;
  }
  if ((meta.address ?? meta.start ?? null) === address) {
    return true;
  }
  if (!Array.isArray(meta.instructions)) {
    return false;
  }
  return meta.instructions.some((instruction) => (
    (instruction.address ?? instruction.addr ?? instruction.pc ?? null) === address
  ));
}

function formatPcLines(pcs) {
  if (!pcs.length) {
    return '  (none)';
  }
  return chunk(pcs, 8)
    .map((row) => `  ${row.map((pc) => hex(pc)).join(' ')}`)
    .join('\n');
}

function formatLabelList(labels) {
  return labels.length ? labels.join(', ') : 'none';
}

if (!fs.existsSync(ROM_PATH)) {
  throw new Error('ROM.rom is missing.');
}
if (!fs.existsSync(TRANSPILED_PATH)) {
  throw new Error('ROM.transpiled.js is missing.');
}

const romBytes = fs.readFileSync(ROM_PATH);
const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
const { PRELIFTED_BLOCKS } = await import(pathToFileURL(TRANSPILED_PATH).href);

function createBootedEnvironment() {
  const mem = createMemoryBus(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const phase1 = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStack(cpu, mem);

  const phase2 = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: KERNEL_INIT_MAX_LOOP_ITERATIONS,
  });

  cpu.mbase = 0xD0;
  cpu.iy = IY_BASE;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStack(cpu, mem);

  return { mem, peripherals, executor, cpu, phase1, phase2 };
}

function runApproach(name, setup) {
  const env = createBootedEnvironment();
  const { mem, executor, cpu } = env;
  installHomeHandler(mem);

  const state = {
    uniqueBlocks: new Set(),
    hitBranchPoint: false,
    aAtBranchPoint: null,
    hitKeyPresentTarget: false,
    extras: [],
  };

  const hooks = setup({ mem, executor, cpu, state }) ?? {};

  const result = executor.runFrom(COORMON_ENTRY, 'adl', {
    maxSteps: EVENT_LOOP_MAX_STEPS,
    maxLoopIterations: EVENT_LOOP_MAX_STEPS,
    onBlock(pc, mode, meta, steps) {
      const blockPc = pc & 0xFFFFFF;

      if (typeof hooks.onBlock === 'function') {
        hooks.onBlock(blockPc, mode, meta, steps);
      }

      state.uniqueBlocks.add(blockPc);

      if (blockPc === COORMON_BRANCH_POINT) {
        state.hitBranchPoint = true;
        state.aAtBranchPoint = cpu.a & 0xFF;
      }
      if (blockPc === COORMON_KEY_PRESENT_TARGET) {
        state.hitKeyPresentTarget = true;
      }
    },
  });

  if (typeof hooks.cleanup === 'function') {
    hooks.cleanup();
  }

  return {
    name,
    result,
    hitBranchPoint: state.hitBranchPoint,
    aAtBranchPoint: state.aAtBranchPoint,
    hitKeyPresentTarget: state.hitKeyPresentTarget,
    uniqueBlocks: [...state.uniqueBlocks],
    extras: state.extras,
  };
}

function printRun(run) {
  console.log(`\n=== ${run.name} ===`);
  for (const line of run.extras) {
    console.log(line);
  }
  console.log(`Hit ${hex(COORMON_BRANCH_POINT)}: ${run.hitBranchPoint ? 'yes' : 'no'}`);
  console.log(`A at ${hex(COORMON_BRANCH_POINT)}: ${hex8(run.aAtBranchPoint)}`);
  console.log(`Hit ${hex(COORMON_KEY_PRESENT_TARGET)}: ${run.hitKeyPresentTarget ? 'yes' : 'no'}`);
  console.log(`Termination: ${run.result.termination}`);
  console.log(`Last PC: ${hex(run.result.lastPc)}`);
  console.log(`Steps: ${run.result.steps}`);
  console.log(`Unique blocks visited (${run.uniqueBlocks.length}):`);
  console.log(formatPcLines(run.uniqueBlocks));
}

console.log('Phase 337: GetCSC return-value patch experiments');
console.log('='.repeat(65));
console.log(`CoorMon entry: ${hex(COORMON_ENTRY)}`);
console.log(`GetCSC entry: ${hex(GETCSC_ENTRY)}`);
console.log(`Certificate descriptor byte: ${hex(GETCSC_CERT_ADDR)}`);
console.log(`Injected scan code: ${hex8(ENTER_SCAN)} (ENTER)`);

const testA = runApproach('TEST A - Direct mem write approach', ({ mem, state }) => {
  mem[GETCSC_CERT_ADDR] = ENTER_SCAN;
  state.extras.push(`Seeded mem[${hex(GETCSC_CERT_ADDR)}] = ${hex8(mem[GETCSC_CERT_ADDR])}`);
});

const testB = runApproach('TEST B - Intercepted read8 approach', ({ cpu, state }) => {
  const originalRead8 = cpu.read8.bind(cpu);
  let interceptCount = 0;

  cpu.read8 = (addr) => {
    const normalized = addr & 0xFFFFFF;
    if (normalized === GETCSC_CERT_ADDR) {
      interceptCount++;
      return ENTER_SCAN;
    }
    return originalRead8(addr);
  };

  return {
    cleanup() {
      cpu.read8 = originalRead8;
      state.extras.push(`Intercepted cpu.read8(${hex(GETCSC_CERT_ADDR)}) ${interceptCount} time(s)`);
    },
  };
});

const testC = runApproach('TEST C - Post-block A register override', ({ cpu, state }) => {
  let pendingOverride = false;
  let sawGetCSCReadBlock = false;
  const overrideTargets = [];

  return {
    onBlock(blockPc, mode, meta) {
      if (pendingOverride) {
        cpu.a = ENTER_SCAN;
        overrideTargets.push(blockPc);
        pendingOverride = false;
      }

      if (blockPc === GETCSC_READ_BLOCK || blockContainsAddress(meta, GETCSC_READ_BLOCK)) {
        sawGetCSCReadBlock = true;
        pendingOverride = true;
      }
    },
    cleanup() {
      state.extras.push(`Saw block containing ${hex(GETCSC_READ_BLOCK)}: ${sawGetCSCReadBlock ? 'yes' : 'no'}`);
      state.extras.push(`Applied post-read A override before block(s): ${overrideTargets.length ? overrideTargets.map((pc) => hex(pc)).join(', ') : 'none'}`);
    },
  };
});

for (const run of [testA, testB, testC]) {
  printRun(run);
}

const runs = [testA, testB, testC];
const nonZeroReturnRuns = runs
  .filter((run) => run.hitBranchPoint && (run.aAtBranchPoint ?? 0) !== 0)
  .map((run) => run.name);
const branchTakenRuns = runs
  .filter((run) => run.hitKeyPresentTarget)
  .map((run) => run.name);

console.log('\n=== Summary ===');
console.log(`GetCSC returned a non-zero scan code at ${hex(COORMON_BRANCH_POINT)}: ${formatLabelList(nonZeroReturnRuns)}`);
console.log(`Reached ${hex(COORMON_BRANCH_POINT)} with A != 0: ${formatLabelList(nonZeroReturnRuns)}`);
console.log(`Took ${hex(COORMON_KEY_PRESENT_TARGET)} (JR NZ key-present target): ${formatLabelList(branchTakenRuns)}`);

for (const run of runs) {
  console.log(
    `${run.name}: ` +
    `A@${hex(COORMON_BRANCH_POINT)}=${hex8(run.aAtBranchPoint)}, ` +
    `hit${hex(COORMON_KEY_PRESENT_TARGET)}=${run.hitKeyPresentTarget ? 'yes' : 'no'}, ` +
    `uniqueBlocks=${run.uniqueBlocks.length}, ` +
    `lastPc=${hex(run.result.lastPc)}, ` +
    `steps=${run.result.steps}, ` +
    `termination=${run.result.termination}`,
  );
}
