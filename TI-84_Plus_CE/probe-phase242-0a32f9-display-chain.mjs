#!/usr/bin/env node

/**
 * Phase 242: trace post-fill display setup chain 0x0A32F9 -> 0x0A3408/0x0A3404 loop
 *
 * Session 241 traced the 0x09EFDE VRAM fill lifecycle (102K steps, 429 unique blocks).
 * The post-fill return chain goes:
 *   0x09F001 -> 0x09F736 -> 0x08BFC5 -> 0x0A32F9 -> 0x0A32FF -> 0x08C308
 *   -> 0x0A331E -> 0x0A336F -> 0x0A3383 -> 0x0A338A -> 0x0A33FB
 *   -> 0x0A3408 -> 0x0A3404
 *
 * The tail loops between 0x0A3404 and 0x0A3408 extensively. This probe:
 *   1. Cold-boots to warm state (boot -> kernelInit -> memInit).
 *   2. Seeds entry at 0x04EDD0 with digit-1 keypress (D0058E=0x8F).
 *   3. Runs ~110K steps to get past the VRAM fill.
 *   4. Tracks all blocks in the 0x0A3200-0x0A3500 range with register snapshots
 *      and ROM hex dumps.
 *   5. Counts visits to 0x0A3404 and 0x0A3408.
 *   6. Reports what PC the loop exits to.
 *   7. Budget: 150,000 total steps.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

const STACK_TOP = 0xD1A87E;
const RETURN_SENTINEL = 0x7FFFFE;
const MBASE = 0xD0;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;

const ENTRY_PC = 0x04EDD0;
const STEP_BUDGET = 150000;

// Display chain tracking range
const CHAIN_RANGE_START = 0x0A3200;
const CHAIN_RANGE_END = 0x0A3500;

// Key loop PCs
const LOOP_PC_A = 0x0A3404;
const LOOP_PC_B = 0x0A3408;

// Post-fill chain entry points of interest
const CHAIN_PCS = [
  0x0A32F9, 0x0A32FF, 0x0A331E, 0x0A336F,
  0x0A3383, 0x0A338A, 0x0A33FB, 0x0A3408, 0x0A3404,
];

const ENTRY_SEEDS = [
  { addr: 0xD0058E, value: 0x8F, name: 'D0058E (digit 1 keypress)' },
  { addr: 0xD0058D, value: 0x00, name: 'D0058D' },
  { addr: 0xD0059F, value: 0x00, name: 'D0059F' },
  { addr: 0xD003E0, value: 0x00, name: 'D003E0' },
  { addr: 0xD00824, value: 0x00, name: 'D00824' },
  { addr: 0xD003DA, value: 0x00, name: 'D003DA' },
  { addr: 0xD007E0, value: 0x40, name: 'D007E0' },
  { addr: 0xD00000, value: 0x00, name: 'D00000' },
];

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }
}

function blockKey(addr, mode) {
  return `${(addr >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function resolveNextMode(executor, key, returnedPc, currentMode) {
  const meta = executor.blockMeta?.[key];
  if (!meta?.exits) {
    return currentMode;
  }

  for (const exit of meta.exits) {
    if (exit.target === returnedPc && exit.targetMode) {
      return exit.targetMode;
    }
  }

  return currentMode;
}

function installStepShim(cpu, executor) {
  if (!executor?.compiledBlocks) {
    throw new Error('Executor compiledBlocks are required for manual stepping.');
  }

  cpu.step = function step() {
    const mode = this.madl ? 'adl' : 'z80';
    const pc = this.pc & 0xFFFFFF;
    const key = blockKey(pc, mode);
    const fn = executor.compiledBlocks[key];

    if (typeof fn !== 'function') {
      throw new Error(`Missing block function for ${hex(pc)} (${key})`);
    }

    const result = fn(this);

    if (typeof result !== 'number') {
      throw new Error(`Unexpected step result from ${hex(pc)}: ${String(result)}`);
    }

    if (result >= 0) {
      const nextMode = resolveNextMode(executor, key, result, mode);
      this.pc = result & 0xFFFFFF;
      this.madl = nextMode === 'adl' ? 1 : 0;
    }

    return result;
  };
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null, source: 'js' };
  }
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase242-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath, source: 'gz' };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

function createRuntime(blocks) {
  const romBytes = fs.readFileSync(ROM_PATH);
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;
  installStepShim(cpu, executor);
  return { mem, peripherals, executor, cpu, romBytes };
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernel = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const post = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return { boot, kernel, post };
}

function seedEntryState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.pc = ENTRY_PC;
  cpu.sp = STACK_TOP;
  cpu.iy = IY_BASE;
  cpu.ix = IX_BASE;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0x1D;
  cpu.f = 0x00;

  for (let offset = 0; offset < 128; offset++) {
    mem[(IY_BASE + offset) & MEM_MASK] = 0x00;
  }

  for (const seed of ENTRY_SEEDS) {
    mem[seed.addr & MEM_MASK] = seed.value & 0xFF;
  }

  push24(cpu, mem, RETURN_SENTINEL);
}

function romHexDump(romBytes, addr, count) {
  const bytes = [];
  for (let i = 0; i < count; i++) {
    if (addr + i < romBytes.length) {
      bytes.push(hexByte(romBytes[addr + i]));
    } else {
      bytes.push('??');
    }
  }
  return bytes.join(' ');
}

function regsString(cpu) {
  return (
    `A=${hexByte(cpu.a)} F=${hexByte(cpu.f)} ` +
    `BC=${hex(cpu.bc)} DE=${hex(cpu.de)} HL=${hex(cpu.hl)} ` +
    `SP=${hex(cpu.sp)} IX=${hex(cpu.ix)} IY=${hex(cpu.iy)}`
  );
}

function traceRun(cpu, mem, romBytes, budget) {
  // Global tracking
  const visitCounts = new Map();
  const visitOrder = [];
  let executedSteps = 0;
  let stopReason = 'budget_exhausted';
  let error = null;

  // Display chain tracking (0x0A3200-0x0A3500)
  const chainBlocks = new Map(); // PC -> { firstStep, lastStep, count, firstRegs, romHex }
  let chainEntryStep = null;
  let chainExitPc = null;
  let chainExitStep = null;
  let inChainRange = false;
  let lastChainPc = null;

  // Loop tracking for 0x0A3404 and 0x0A3408
  let loopA_count = 0;
  let loopB_count = 0;
  let loopSequence = []; // track last N transitions between the two
  const LOOP_SEQ_LIMIT = 32;

  // Periodic register snapshots
  const checkpoints = [];
  const CHECKPOINT_INTERVAL = 25000;

  // Tail buffer
  const tail = [];
  const TAIL_LIMIT = 32;

  checkpoints.push({
    step: 0,
    pc: cpu.pc & 0xFFFFFF,
    regs: regsString(cpu),
    note: 'entry',
  });

  while (executedSteps < budget) {
    const pc = cpu.pc & 0xFFFFFF;

    // Track visit counts
    if (!visitCounts.has(pc)) {
      visitOrder.push(pc);
    }
    visitCounts.set(pc, (visitCounts.get(pc) ?? 0) + 1);

    // Tail buffer
    tail.push(pc);
    if (tail.length > TAIL_LIMIT) {
      tail.shift();
    }

    // Check for sentinel return
    if (pc === RETURN_SENTINEL) {
      stopReason = 'returned_sentinel';
      break;
    }

    // Track display chain range
    const pcInChain = pc >= CHAIN_RANGE_START && pc < CHAIN_RANGE_END;

    if (pcInChain) {
      if (!inChainRange) {
        chainEntryStep = executedSteps;
        inChainRange = true;
      }

      if (!chainBlocks.has(pc)) {
        chainBlocks.set(pc, {
          firstStep: executedSteps,
          lastStep: executedSteps,
          count: 1,
          firstRegs: regsString(cpu),
          romHex: romHexDump(romBytes, pc, 8),
        });
      } else {
        const entry = chainBlocks.get(pc);
        entry.lastStep = executedSteps;
        entry.count += 1;
      }

      lastChainPc = pc;

      // Track loop PCs
      if (pc === LOOP_PC_A) {
        loopA_count += 1;
        if (loopSequence.length < LOOP_SEQ_LIMIT) {
          loopSequence.push('A');
        }
      }
      if (pc === LOOP_PC_B) {
        loopB_count += 1;
        if (loopSequence.length < LOOP_SEQ_LIMIT) {
          loopSequence.push('B');
        }
      }
    } else if (inChainRange) {
      // We just left the chain range
      chainExitPc = pc;
      chainExitStep = executedSteps;
      // Don't clear inChainRange — we might re-enter. Track the first exit.
    }

    // Step
    let result;
    try {
      result = cpu.step();
    } catch (traceError) {
      stopReason = 'error';
      error = traceError instanceof Error ? traceError.message : String(traceError);
      break;
    }

    executedSteps += 1;
    const afterPc = cpu.pc & 0xFFFFFF;

    // Periodic checkpoint
    if (executedSteps % CHECKPOINT_INTERVAL === 0) {
      checkpoints.push({
        step: executedSteps,
        pc: afterPc,
        regs: regsString(cpu),
        note: inChainRange ? 'in-chain' : 'outside-chain',
      });
    }

    if (result === -1) {
      stopReason = 'halt';
      break;
    }
    if (result === -2) {
      stopReason = 'sleep';
      break;
    }
    if (afterPc === RETURN_SENTINEL) {
      stopReason = 'returned_sentinel';
      break;
    }
  }

  // Final checkpoint
  checkpoints.push({
    step: executedSteps,
    pc: cpu.pc & 0xFFFFFF,
    regs: regsString(cpu),
    note: 'final',
  });

  return {
    executedSteps,
    stopReason,
    error,
    totalUniqueBlocks: visitOrder.length,
    chainBlocks,
    chainEntryStep,
    chainExitPc,
    chainExitStep,
    loopA_count,
    loopB_count,
    loopSequence,
    lastChainPc,
    checkpoints,
    tail,
    finalPc: cpu.pc & 0xFFFFFF,
    finalRegs: regsString(cpu),
  };
}

function printResults(result) {
  console.log('========================================================================');
  console.log('Phase 242: Post-fill display setup chain 0x0A32F9 trace');
  console.log('========================================================================');
  console.log(`Executed steps: ${result.executedSteps}/${STEP_BUDGET}`);
  console.log(`Stop reason:    ${result.stopReason}`);
  console.log(`Final PC:       ${hex(result.finalPc)}`);
  console.log(`Final regs:     ${result.finalRegs}`);
  if (result.error) {
    console.log(`Error:          ${result.error}`);
  }
  console.log(`Total unique blocks: ${result.totalUniqueBlocks}`);
  console.log('');

  // Display chain summary
  console.log('------------------------------------------------------------------------');
  console.log('Display chain range (0x0A3200-0x0A3500)');
  console.log('------------------------------------------------------------------------');
  console.log(`Chain entry step:    ${result.chainEntryStep ?? 'never entered'}`);
  console.log(`Chain exit PC:       ${hex(result.chainExitPc)}`);
  console.log(`Chain exit step:     ${result.chainExitStep ?? 'n/a'}`);
  console.log(`Last chain PC seen:  ${hex(result.lastChainPc)}`);
  console.log(`Unique blocks in range: ${result.chainBlocks.size}`);
  console.log('');

  // Loop analysis
  console.log('------------------------------------------------------------------------');
  console.log(`Loop analysis: ${hex(LOOP_PC_A)} / ${hex(LOOP_PC_B)}`);
  console.log('------------------------------------------------------------------------');
  console.log(`${hex(LOOP_PC_A)} visits: ${result.loopA_count}`);
  console.log(`${hex(LOOP_PC_B)} visits: ${result.loopB_count}`);
  console.log(`Loop sequence (first ${LOOP_SEQ_LIMIT}): ${result.loopSequence.join(' ')}`);
  console.log(`  (A = ${hex(LOOP_PC_A)}, B = ${hex(LOOP_PC_B)})`);
  console.log('');

  // Per-block detail
  console.log('------------------------------------------------------------------------');
  console.log('Per-block detail (0x0A3200-0x0A3500 range, in visit order)');
  console.log('------------------------------------------------------------------------');

  // Sort by firstStep
  const sortedBlocks = [...result.chainBlocks.entries()].sort(
    ([, a], [, b]) => a.firstStep - b.firstStep,
  );

  for (const [pc, info] of sortedBlocks) {
    const isLoop = pc === LOOP_PC_A || pc === LOOP_PC_B;
    const marker = isLoop ? ' <<<LOOP>>>' : '';
    console.log(`  ${hex(pc)}${marker}`);
    console.log(`    ROM bytes: ${info.romHex}`);
    console.log(`    Visits: ${info.count} (first: step ${info.firstStep}, last: step ${info.lastStep})`);
    console.log(`    First-visit regs: ${info.firstRegs}`);
  }
  console.log('');

  // Checkpoints
  console.log('------------------------------------------------------------------------');
  console.log('Register checkpoints');
  console.log('------------------------------------------------------------------------');
  for (const cp of result.checkpoints) {
    const note = cp.note ? ` (${cp.note})` : '';
    console.log(`  step ${String(cp.step).padStart(6, ' ')}: PC=${hex(cp.pc)} ${cp.regs}${note}`);
  }
  console.log('');

  // Tail
  console.log('------------------------------------------------------------------------');
  console.log(`Tail PCs (last ${result.tail.length})`);
  console.log('------------------------------------------------------------------------');
  console.log(`  ${result.tail.map((pc) => hex(pc)).join(' -> ')}`);
  console.log('');
}

async function main() {
  const assets = ensureTranspiledModule();

  try {
    const romModule = await import(pathToFileURL(assets.modulePath).href);
    const BLOCKS =
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      romModule;

    if (!BLOCKS || typeof BLOCKS !== 'object') {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS from ROM.transpiled.js.');
    }

    const romBytes = fs.readFileSync(ROM_PATH);
    const runtime = createRuntime(BLOCKS);

    console.log('Phase 242: 0x0A32F9 post-fill display setup chain probe');
    console.log(`ROM: ${path.basename(ROM_PATH)} (${romBytes.length} bytes)`);
    console.log(`Transpiled source: ${assets.source === 'js' ? 'ROM.transpiled.js' : 'ROM.transpiled.js.gz'}`);
    console.log('Peripheral seed: pllDelay=2 timerInterrupt=false');
    console.log(
      `Entry: PC=${hex(ENTRY_PC)} A=${hexByte(0x1D)} IX=${hex(IX_BASE)} ` +
      `IY=${hex(IY_BASE)} MBASE=${hexByte(MBASE)} D0058E=0x8F (digit 1)`,
    );
    console.log(`Budget: ${STEP_BUDGET} steps`);
    console.log(`Tracking range: ${hex(CHAIN_RANGE_START)}-${hex(CHAIN_RANGE_END)}`);
    console.log(`Loop PCs: ${hex(LOOP_PC_A)}, ${hex(LOOP_PC_B)}`);
    console.log('');

    // Cold boot
    const bootSummary = coldBoot(runtime.executor, runtime.cpu, runtime.mem);
    console.log(
      `Cold boot: boot=${bootSummary.boot.steps}/${bootSummary.boot.termination} ` +
      `kernel=${bootSummary.kernel.steps}/${bootSummary.kernel.termination} ` +
      `post=${bootSummary.post.steps}/${bootSummary.post.termination}`,
    );

    // Snapshot warm state
    const bootMemory = new Uint8Array(runtime.mem);
    const bootCpuSnapshot = snapshotCpu(runtime.cpu);

    // Restore warm state and seed entry
    runtime.mem.set(bootMemory);
    restoreCpu(runtime.cpu, bootCpuSnapshot);
    seedEntryState(runtime.cpu, runtime.mem);

    console.log(`Entry state seeded. Starting trace from ${hex(ENTRY_PC)}...`);
    console.log('');

    // Run the trace
    const result = traceRun(runtime.cpu, runtime.mem, romBytes, STEP_BUDGET);
    printResults(result);
  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
