#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS =
  romModule.PRELIFTED_BLOCKS ??
  romModule.default?.PRELIFTED_BLOCKS ??
  romModule.default ??
  romModule;

if (!BLOCKS || typeof BLOCKS !== 'object') {
  throw new Error('Unable to resolve PRELIFTED_BLOCKS from ROM.transpiled.js.');
}

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
const INNER_LOOP_BODY_PC = 0x09EFDE;
const INNER_LOOP_EXIT_PC = 0x09EFE8;
const OUTER_LOOP_HEADER_PC = 0x09EFCB;
const OUTER_LOOP_TAIL_PC = 0x09EFEF;
const OUTER_LOOP_EXIT_PC = 0x09F001;
const STEP_BUDGET = 150000;
const REG_CHECKPOINT_INTERVAL = 25000;
const POST_FILL_PATH_LIMIT = 16;
const TAIL_LIMIT = 16;

const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_SIZE = VRAM_WIDTH * VRAM_HEIGHT * 2;
const VRAM_LAST = VRAM_BASE + VRAM_SIZE - 1;

const ENTRY_SEEDS = [
  { addr: 0xD0058E, value: 0x00, name: 'D0058E' },
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

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  installStepShim(cpu, executor);
  return { mem, peripherals, executor, cpu };
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

function recordVisit(visitCounts, order, pc) {
  if (!visitCounts.has(pc)) {
    order.push(pc);
  }
  visitCounts.set(pc, (visitCounts.get(pc) ?? 0) + 1);
}

function pushLimitedPath(pathEntries, pc) {
  if (pathEntries.length >= POST_FILL_PATH_LIMIT) {
    return;
  }
  if (pathEntries.length === 0 || pathEntries[pathEntries.length - 1] !== pc) {
    pathEntries.push(pc);
  }
}

function summarizeVramContent(mem) {
  let nonZeroBytes = 0;
  let firstAddr = null;
  let lastAddr = null;

  for (let offset = 0; offset < VRAM_SIZE; offset++) {
    const addr = VRAM_BASE + offset;
    if (mem[addr] !== 0) {
      nonZeroBytes += 1;
      if (firstAddr === null) {
        firstAddr = addr;
      }
      lastAddr = addr;
    }
  }

  return {
    nonZeroBytes,
    firstAddr,
    lastAddr,
  };
}

function checkpointNote(firstLoopHit, outerLoopTermination) {
  if (!firstLoopHit) {
    return 'pre-fill';
  }
  if (!outerLoopTermination) {
    return 'fill-active';
  }
  return 'post-fill';
}

function snapshotRegs(step, cpu, note = '') {
  return {
    step,
    note,
    pc: cpu.pc & 0xFFFFFF,
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    hl: cpu.hl & 0xFFFFFF,
    de: cpu.de & 0xFFFFFF,
    bc: cpu.bc & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    ix: cpu.ix & 0xFFFFFF,
    iy: cpu.iy & 0xFFFFFF,
  };
}

function traceRun(cpu, mem, budget) {
  const visitCounts = new Map();
  const order = [];
  const tail = [];
  const checkpoints = [snapshotRegs(0, cpu, 'entry')];

  let executedSteps = 0;
  let stopReason = 'budget_exhausted';
  let error = null;
  let firstLoopHit = null;
  let innerLoopExitCount = 0;
  let finalInnerLoopExit = null;
  let outerLoopTermination = null;
  let fillCompletionVram = null;
  let returnStep = null;
  const postFillPath = [];

  while (executedSteps < budget) {
    const pc = cpu.pc & 0xFFFFFF;
    recordVisit(visitCounts, order, pc);
    tail.push(pc);
    if (tail.length > TAIL_LIMIT) {
      tail.shift();
    }

    if (outerLoopTermination) {
      pushLimitedPath(postFillPath, pc);
    }

    if (pc === RETURN_SENTINEL) {
      stopReason = 'returned_sentinel';
      returnStep = executedSteps;
      break;
    }

    if (!firstLoopHit && pc === INNER_LOOP_BODY_PC) {
      firstLoopHit = {
        step: executedSteps,
        pc,
      };
    }

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

    if (executedSteps % REG_CHECKPOINT_INTERVAL === 0) {
      checkpoints.push(snapshotRegs(executedSteps, cpu, checkpointNote(firstLoopHit, outerLoopTermination)));
    }

    if (pc === INNER_LOOP_BODY_PC && afterPc === INNER_LOOP_EXIT_PC) {
      innerLoopExitCount += 1;
      finalInnerLoopExit = snapshotRegs(executedSteps, cpu, 'djnz-fallthrough');
      finalInnerLoopExit.fromPc = pc;
      finalInnerLoopExit.pc = afterPc;
      finalInnerLoopExit.exitCount = innerLoopExitCount;
    }

    if (!outerLoopTermination && pc === OUTER_LOOP_TAIL_PC && afterPc === OUTER_LOOP_EXIT_PC) {
      outerLoopTermination = snapshotRegs(executedSteps, cpu, 'fill-complete');
      outerLoopTermination.fromPc = pc;
      outerLoopTermination.headerPc = OUTER_LOOP_HEADER_PC;
      outerLoopTermination.pc = afterPc;
      fillCompletionVram = summarizeVramContent(mem);
      pushLimitedPath(postFillPath, afterPc);
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
      returnStep = executedSteps;
      break;
    }
  }

  if (checkpoints[checkpoints.length - 1].step !== executedSteps) {
    checkpoints.push(snapshotRegs(executedSteps, cpu, 'final'));
  }

  return {
    executedSteps,
    stopReason,
    error,
    firstLoopHit,
    innerLoopExitCount,
    finalInnerLoopExit,
    outerLoopTermination,
    firstPostFillBlock: outerLoopTermination?.pc ?? null,
    postFillPath,
    returnStep,
    totalUniqueBlocks: order.length,
    visitCounts,
    order,
    tail,
    checkpoints,
    fillCompleted: Boolean(outerLoopTermination),
    fillCompletionStep: outerLoopTermination?.step ?? null,
    fillCompletionVram,
    finalVram: summarizeVramContent(mem),
    finalPc: cpu.pc & 0xFFFFFF,
    finalA: cpu.a & 0xFF,
    finalF: cpu.f & 0xFF,
    finalHL: cpu.hl & 0xFFFFFF,
    finalDE: cpu.de & 0xFFFFFF,
    finalBC: cpu.bc & 0xFFFFFF,
    finalSP: cpu.sp & 0xFFFFFF,
    finalIX: cpu.ix & 0xFFFFFF,
    finalIY: cpu.iy & 0xFFFFFF,
  };
}

function printRegs(label, regs) {
  if (!regs) {
    console.log(`${label}: n/a`);
    return;
  }

  console.log(
    `${label}: ` +
    `PC=${hex(regs.pc)} A=${hexByte(regs.a)} F=${hexByte(regs.f)} ` +
    `HL=${hex(regs.hl)} DE=${hex(regs.de)} BC=${hex(regs.bc)} ` +
    `SP=${hex(regs.sp)} IX=${hex(regs.ix)} IY=${hex(regs.iy)}`,
  );
}

function printCheckpoints(checkpoints) {
  console.log('Register checkpoints:');
  for (const checkpoint of checkpoints) {
    const note = checkpoint.note ? ` (${checkpoint.note})` : '';
    console.log(
      `  step ${String(checkpoint.step).padStart(6, ' ')}: ` +
      `PC=${hex(checkpoint.pc)} A=${hexByte(checkpoint.a)} F=${hexByte(checkpoint.f)} ` +
      `HL=${hex(checkpoint.hl)} DE=${hex(checkpoint.de)} BC=${hex(checkpoint.bc)} ` +
      `SP=${hex(checkpoint.sp)} IX=${hex(checkpoint.ix)} IY=${hex(checkpoint.iy)}${note}`,
    );
  }
  console.log('');
}

function printVram(label, vram) {
  if (!vram) {
    console.log(`${label}: n/a`);
    return;
  }

  console.log(
    `${label}: nonZeroBytes=${vram.nonZeroBytes}/${VRAM_SIZE} ` +
    `firstNonZero=${hex(vram.firstAddr)} lastNonZero=${hex(vram.lastAddr)}`,
  );
}

function printTraceSummary(result) {
  console.log('========================================================================');
  console.log('Trace Summary');
  console.log('========================================================================');
  console.log(`Executed steps: ${result.executedSteps}/${STEP_BUDGET}`);
  console.log(`Stop reason:    ${result.stopReason}`);
  console.log(`Final PC:       ${hex(result.finalPc)}`);
  if (result.error) {
    console.log(`Error:          ${result.error}`);
  }
  console.log('');

  console.log(
    `First ${hex(INNER_LOOP_BODY_PC)} hit: ` +
    `${result.firstLoopHit ? `yes at step ${result.firstLoopHit.step}` : 'no'}`,
  );
  console.log(
    `Final DJNZ fallthrough (${hex(INNER_LOOP_BODY_PC)} -> ${hex(INNER_LOOP_EXIT_PC)}): ` +
    `${result.finalInnerLoopExit ? `yes at step ${result.finalInnerLoopExit.step} (count=${result.innerLoopExitCount})` : 'no'}`,
  );
  console.log(
    `Outer loop termination (${hex(OUTER_LOOP_HEADER_PC)} via ${hex(OUTER_LOOP_TAIL_PC)} -> ${hex(OUTER_LOOP_EXIT_PC)}): ` +
    `${result.outerLoopTermination ? `yes at step ${result.outerLoopTermination.step}` : 'no'}`,
  );
  console.log(`Fill completion step: ${result.fillCompletionStep ?? 'n/a'}`);
  console.log(`First post-fill block: ${hex(result.firstPostFillBlock)}`);
  console.log(
    `Post-fill path: ${result.postFillPath.length ? result.postFillPath.map((pc) => hex(pc)).join(' -> ') : '(none)'}`,
  );
  console.log(`Returned via sentinel ${hex(RETURN_SENTINEL)}: ${result.returnStep !== null ? `yes at step ${result.returnStep}` : 'no'}`);
  console.log(`Total unique blocks visited: ${result.totalUniqueBlocks}`);
  console.log('');

  if (result.finalInnerLoopExit) {
    printRegs('Final inner-loop exit regs', result.finalInnerLoopExit);
  }
  if (result.outerLoopTermination) {
    printRegs('Fill-complete regs', result.outerLoopTermination);
  }
  printRegs('Final regs', {
    pc: result.finalPc,
    a: result.finalA,
    f: result.finalF,
    hl: result.finalHL,
    de: result.finalDE,
    bc: result.finalBC,
    sp: result.finalSP,
    ix: result.finalIX,
    iy: result.finalIY,
  });
  console.log('');

  printVram('VRAM at fill completion', result.fillCompletionVram);
  printVram('VRAM at end of trace', result.finalVram);
  console.log('');

  printCheckpoints(result.checkpoints);

  console.log('Tail PCs:');
  console.log(`  ${result.tail.length ? result.tail.map((pc) => hex(pc)).join(' -> ') : '(none)'}`);
  console.log('');
}

function runScenario(runtime, bootMemory, bootCpuSnapshot) {
  runtime.mem.set(bootMemory);
  restoreCpu(runtime.cpu, bootCpuSnapshot);
  seedEntryState(runtime.cpu, runtime.mem);
  return traceRun(runtime.cpu, runtime.mem, STEP_BUDGET);
}

async function main() {
  const runtime = createRuntime();
  const bootSummary = coldBoot(runtime.executor, runtime.cpu, runtime.mem);
  const bootMemory = new Uint8Array(runtime.mem);
  const bootCpuSnapshot = snapshotCpu(runtime.cpu);

  console.log('Phase 241: 0x09EFDE 150K warm-state follow-through probe');
  console.log(`ROM: ${path.basename(ROM_PATH)} (${romBytes.length} bytes)`);
  console.log(`Transpiled blocks: ${path.basename(TRANSPILED_PATH)}`);
  console.log('Peripheral seed: pllDelay=2 timerInterrupt=false');
  console.log(
    `Entry seed: PC=${hex(ENTRY_PC)} A=${hexByte(0x1D)} IX=${hex(IX_BASE)} ` +
    `IY=${hex(IY_BASE)} MBASE=${hexByte(MBASE)}`,
  );
  console.log(`Budget: ${STEP_BUDGET} block steps from ${hex(ENTRY_PC)}`);
  console.log(`VRAM region: ${hex(VRAM_BASE)}..${hex(VRAM_LAST)} (${VRAM_SIZE} bytes)`);
  console.log('');

  console.log(
    `Cold boot summary: boot=${bootSummary.boot.steps}/${bootSummary.boot.termination} ` +
    `kernel=${bootSummary.kernel.steps}/${bootSummary.kernel.termination} ` +
    `post=${bootSummary.post.steps}/${bootSummary.post.termination}`,
  );
  console.log('');

  const result = runScenario(runtime, bootMemory, bootCpuSnapshot);
  printTraceSummary(result);
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
