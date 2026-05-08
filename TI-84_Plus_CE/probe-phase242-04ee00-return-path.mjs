#!/usr/bin/env node

/**
 * Phase 242: Trace the 0x04EE00 return path — D003E0 writer tail.
 *
 * Session 241 found that the 0x04EDD0 handler returns through
 * 0x04EE0A -> 0x04EE1B -> 0x04EE00 at step ~102,297.
 *
 * Goals:
 *   1. Hex dump ROM bytes at 0x04EE00-0x04EE40 for static disassembly.
 *   2. Boot to warm state (cold boot + kernel + post-init).
 *   3. Seed key press (D0058E=0x8F) and run from 0x04EDD0.
 *   4. Capture D003E0 at checkpoints: before key press, at 0x04EDD0 entry,
 *      at 0x04EE00 entry, after 0x04EE00 exits.
 *   5. Track register state at 0x04EE00 and subsequent blocks.
 *   6. Report where execution goes after the 0x04EExx tail (final RET destination).
 *   7. Run up to 110,000 total steps.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

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
const STEP_BUDGET = 110000;

// Region of interest
const ROI_START = 0x04EE00;
const ROI_END = 0x04EE40;

// Disassembly range
const DISASM_START = 0x04EE00;
const DISASM_END = 0x04EE42;

// D003E0 address
const D003E0_ADDR = 0xD003E0;

// Key press seed
const KEY_PRESS_ADDR = 0xD0058E;
const KEY_PRESS_VALUE = 0x8F;

// Entry state seeds (same as phase 241 warm state)
const ENTRY_SEEDS = [
  { addr: 0xD0058E, value: KEY_PRESS_VALUE, name: 'D0058E (key press)' },
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

// Addresses to capture detailed register snapshots
const CHECKPOINT_PCS = new Set([
  0x04EDD0, // handler entry
  0x04EE00, // target of interest
  0x04EE0A, // known predecessor
  0x04EE1B, // JR to 0x04EE00
  0x04EE33, // real D003E0 writer
  0x04EE3E, // JR Z target from 0x04EE33 block
]);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (b) => hexByte(b)).join(' ');
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

function formatInstruction(inst) {
  if (!inst) return '(decode error)';

  switch (inst.tag) {
    case 'alu-reg':
      return `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'bit-test-ind':
      return `BIT ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'indexed-cb-res':
      return `RES ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, (${String(inst.indexRegister).toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ld-pair-imm':
      return `LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-mem': {
      const suffix = inst.modePrefix ? `.${String(inst.modePrefix).toUpperCase()}` : '';
      const addrWidth = (inst.addr ?? 0) <= 0xFFFF ? 4 : 6;
      if (inst.direction === 'to-mem') {
        return `LD${suffix} (${hex(inst.addr, addrWidth)}), ${String(inst.pair).toUpperCase()}`;
      }
      return `LD${suffix} ${String(inst.pair).toUpperCase()}, (${hex(inst.addr, addrWidth)})`;
    }
    case 'ld-reg-imm':
      return `LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-mem':
      return `LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'nop':
      return 'NOP';
    case 'pop':
      return `POP ${String(inst.pair ?? inst.dest ?? inst.reg).toUpperCase()}`;
    case 'push':
      return `PUSH ${String(inst.pair ?? inst.src ?? inst.reg).toUpperCase()}`;
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${String(inst.condition).toUpperCase()}`;
    case 'djnz':
      return `DJNZ ${hex(inst.target)}`;
    default: {
      let text = inst.tag;
      if (inst.bit !== undefined) text += ` bit=${inst.bit}`;
      if (inst.target !== undefined) text += ` ${hex(inst.target)}`;
      if (inst.value !== undefined) text += ` ${hex(inst.value)}`;
      return text;
    }
  }
}

function disassembleRange(start, end) {
  const rows = [];
  for (let pc = start; pc < end;) {
    try {
      const inst = decodeInstruction(romBytes, pc, 'adl');
      const length = inst.length || 1;
      rows.push({
        pc,
        length,
        bytes: bytesToHex(romBytes.subarray(pc, pc + length)),
        text: formatInstruction(inst),
      });
      pc += length;
    } catch (error) {
      rows.push({
        pc,
        length: 1,
        bytes: hexByte(romBytes[pc]),
        text: `DB ${hexByte(romBytes[pc])} ; ${error?.message ?? 'decode error'}`,
      });
      pc += 1;
    }
  }
  return rows;
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
  const checkpoints = [];
  const d003e0Log = [];
  const roiSnapshots = [];
  const postRoiPath = [];

  let executedSteps = 0;
  let stopReason = 'budget_exhausted';
  let error = null;
  let returnStep = null;
  let enteredRoi = false;
  let exitedRoi = false;
  let roiEntryStep = null;
  let roiExitStep = null;
  let roiExitPc = null;
  let entryHit = false;

  // Capture D003E0 before any execution
  d003e0Log.push({
    step: 0,
    note: 'initial (after seed)',
    value: mem[D003E0_ADDR & MEM_MASK],
  });

  checkpoints.push(snapshotRegs(0, cpu, 'entry'));

  const TAIL_LIMIT = 24;
  const POST_ROI_PATH_LIMIT = 32;

  while (executedSteps < budget) {
    const pc = cpu.pc & 0xFFFFFF;

    // Track visits
    if (!visitCounts.has(pc)) {
      order.push(pc);
    }
    visitCounts.set(pc, (visitCounts.get(pc) ?? 0) + 1);

    // Tail buffer
    tail.push(pc);
    if (tail.length > TAIL_LIMIT) {
      tail.shift();
    }

    // Track post-ROI path
    if (exitedRoi && postRoiPath.length < POST_ROI_PATH_LIMIT) {
      if (postRoiPath.length === 0 || postRoiPath[postRoiPath.length - 1] !== pc) {
        postRoiPath.push(pc);
      }
    }

    // Return sentinel check
    if (pc === RETURN_SENTINEL) {
      stopReason = 'returned_sentinel';
      returnStep = executedSteps;
      break;
    }

    // Checkpoint at handler entry
    if (!entryHit && pc === ENTRY_PC) {
      entryHit = true;
      d003e0Log.push({
        step: executedSteps,
        note: '0x04EDD0 handler entry',
        value: mem[D003E0_ADDR & MEM_MASK],
      });
    }

    // ROI entry detection (0x04EE00-0x04EE40)
    if (!enteredRoi && pc >= ROI_START && pc < ROI_END) {
      enteredRoi = true;
      roiEntryStep = executedSteps;
      d003e0Log.push({
        step: executedSteps,
        note: `ROI entry at ${hex(pc)}`,
        value: mem[D003E0_ADDR & MEM_MASK],
      });
    }

    // Capture register snapshots at checkpoint PCs
    if (CHECKPOINT_PCS.has(pc)) {
      roiSnapshots.push(snapshotRegs(executedSteps, cpu, `checkpoint ${hex(pc)}`));
      d003e0Log.push({
        step: executedSteps,
        note: `at ${hex(pc)}`,
        value: mem[D003E0_ADDR & MEM_MASK],
      });
    }

    // Capture all blocks in ROI range
    if (pc >= ROI_START && pc < ROI_END) {
      // Already captured above via CHECKPOINT_PCS, but ensure all ROI blocks get a snapshot
      if (!CHECKPOINT_PCS.has(pc)) {
        roiSnapshots.push(snapshotRegs(executedSteps, cpu, `ROI block ${hex(pc)}`));
        d003e0Log.push({
          step: executedSteps,
          note: `ROI block ${hex(pc)}`,
          value: mem[D003E0_ADDR & MEM_MASK],
        });
      }
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

    // ROI exit detection: was in ROI, now outside
    if (enteredRoi && !exitedRoi && (afterPc < ROI_START || afterPc >= ROI_END)) {
      exitedRoi = true;
      roiExitStep = executedSteps;
      roiExitPc = afterPc;
      d003e0Log.push({
        step: executedSteps,
        note: `ROI exit -> ${hex(afterPc)}`,
        value: mem[D003E0_ADDR & MEM_MASK],
      });
      roiSnapshots.push(snapshotRegs(executedSteps, cpu, `ROI exit -> ${hex(afterPc)}`));
    }

    // Periodic checkpoints every 25000 steps
    if (executedSteps % 25000 === 0) {
      checkpoints.push(snapshotRegs(executedSteps, cpu, 'periodic'));
      d003e0Log.push({
        step: executedSteps,
        note: 'periodic',
        value: mem[D003E0_ADDR & MEM_MASK],
      });
    }

    // Also capture D003E0 whenever it changes
    if (d003e0Log.length > 0) {
      const lastVal = d003e0Log[d003e0Log.length - 1].value;
      const curVal = mem[D003E0_ADDR & MEM_MASK];
      if (curVal !== lastVal) {
        d003e0Log.push({
          step: executedSteps,
          note: `D003E0 changed ${hexByte(lastVal)} -> ${hexByte(curVal)} after block ${hex(pc)}`,
          value: curVal,
        });
      }
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

  // Final checkpoint
  checkpoints.push(snapshotRegs(executedSteps, cpu, 'final'));
  d003e0Log.push({
    step: executedSteps,
    note: 'final',
    value: mem[D003E0_ADDR & MEM_MASK],
  });

  return {
    executedSteps,
    stopReason,
    error,
    returnStep,
    totalUniqueBlocks: order.length,
    visitCounts,
    order,
    tail,
    checkpoints,
    d003e0Log,
    roiSnapshots,
    enteredRoi,
    roiEntryStep,
    exitedRoi,
    roiExitStep,
    roiExitPc,
    postRoiPath,
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

async function main() {
  const runtime = createRuntime();

  console.log('Phase 242: 0x04EE00 return path — D003E0 writer tail');
  console.log(`ROM: ${path.basename(ROM_PATH)} (${romBytes.length} bytes)`);
  console.log(`Transpiled blocks: ${path.basename(TRANSPILED_PATH)}`);
  console.log('Peripheral seed: pllDelay=2 timerInterrupt=false');
  console.log(
    `Entry seed: PC=${hex(ENTRY_PC)} A=${hexByte(0x1D)} IX=${hex(IX_BASE)} ` +
    `IY=${hex(IY_BASE)} MBASE=${hexByte(MBASE)}`,
  );
  console.log(`Key press seed: (${hex(KEY_PRESS_ADDR)})=${hexByte(KEY_PRESS_VALUE)}`);
  console.log(`Budget: ${STEP_BUDGET} block steps from ${hex(ENTRY_PC)}`);
  console.log(`Region of interest: ${hex(ROI_START)}..${hex(ROI_END)}`);
  console.log('');

  // ---- Static disassembly ----
  console.log('========================================================================');
  console.log(`STATIC DISASSEMBLY ${hex(DISASM_START)}..${hex(DISASM_END)}`);
  console.log('========================================================================');

  const disasm = disassembleRange(DISASM_START, DISASM_END);
  for (const row of disasm) {
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(22)} ${row.text}`);
  }
  console.log('');

  // ---- Hex dump ----
  console.log('========================================================================');
  console.log(`HEX DUMP ${hex(DISASM_START)}..${hex(DISASM_END)}`);
  console.log('========================================================================');

  for (let addr = DISASM_START; addr < DISASM_END; addr += 16) {
    const end = Math.min(addr + 16, DISASM_END);
    const slice = romBytes.subarray(addr, end);
    const hexStr = Array.from(slice, (b) => (b & 0xFF).toString(16).toUpperCase().padStart(2, '0')).join(' ');
    console.log(`  ${hex(addr)}: ${hexStr}`);
  }
  console.log('');

  // ---- Cold boot ----
  const bootSummary = coldBoot(runtime.executor, runtime.cpu, runtime.mem);
  const bootMemory = new Uint8Array(runtime.mem);
  const bootCpuSnapshot = snapshotCpu(runtime.cpu);

  console.log('========================================================================');
  console.log('COLD BOOT');
  console.log('========================================================================');
  console.log(
    `  boot:   steps=${bootSummary.boot.steps}/${bootSummary.boot.termination}`,
  );
  console.log(
    `  kernel: steps=${bootSummary.kernel.steps}/${bootSummary.kernel.termination}`,
  );
  console.log(
    `  post:   steps=${bootSummary.post.steps}/${bootSummary.post.termination}`,
  );
  console.log(`  D003E0 after boot: ${hexByte(bootMemory[D003E0_ADDR & MEM_MASK])}`);
  console.log('');

  // ---- Trace ----
  runtime.mem.set(bootMemory);
  restoreCpu(runtime.cpu, bootCpuSnapshot);
  seedEntryState(runtime.cpu, runtime.mem);

  const result = traceRun(runtime.cpu, runtime.mem, STEP_BUDGET);

  // ---- Summary ----
  console.log('========================================================================');
  console.log('TRACE SUMMARY');
  console.log('========================================================================');
  console.log(`Executed steps:       ${result.executedSteps}/${STEP_BUDGET}`);
  console.log(`Stop reason:          ${result.stopReason}`);
  console.log(`Final PC:             ${hex(result.finalPc)}`);
  if (result.error) {
    console.log(`Error:                ${result.error}`);
  }
  console.log(`Return via sentinel:  ${result.returnStep !== null ? `yes at step ${result.returnStep}` : 'no'}`);
  console.log(`Total unique blocks:  ${result.totalUniqueBlocks}`);
  console.log('');

  // ---- ROI analysis ----
  console.log('========================================================================');
  console.log('ROI ANALYSIS (0x04EE00..0x04EE40)');
  console.log('========================================================================');
  console.log(`Entered ROI:     ${result.enteredRoi ? `yes at step ${result.roiEntryStep}` : 'no'}`);
  console.log(`Exited ROI:      ${result.exitedRoi ? `yes at step ${result.roiExitStep} -> ${hex(result.roiExitPc)}` : 'no'}`);
  console.log('');

  if (result.roiSnapshots.length > 0) {
    console.log('Register snapshots in/around ROI:');
    for (const snap of result.roiSnapshots) {
      const note = snap.note ? ` (${snap.note})` : '';
      console.log(
        `  step ${String(snap.step).padStart(6, ' ')}: ` +
        `PC=${hex(snap.pc)} A=${hexByte(snap.a)} F=${hexByte(snap.f)} ` +
        `HL=${hex(snap.hl)} DE=${hex(snap.de)} BC=${hex(snap.bc)} ` +
        `SP=${hex(snap.sp)} IX=${hex(snap.ix)} IY=${hex(snap.iy)}${note}`,
      );
    }
    console.log('');
  }

  // ---- D003E0 log ----
  console.log('========================================================================');
  console.log('D003E0 LOG');
  console.log('========================================================================');
  for (const entry of result.d003e0Log) {
    console.log(
      `  step ${String(entry.step).padStart(6, ' ')}: ${hexByte(entry.value)}  ${entry.note}`,
    );
  }
  console.log('');

  // ---- Post-ROI path ----
  console.log('========================================================================');
  console.log('POST-ROI EXECUTION PATH');
  console.log('========================================================================');
  if (result.postRoiPath.length > 0) {
    console.log(`  ${result.postRoiPath.map((pc) => hex(pc)).join(' -> ')}`);
  } else {
    console.log('  (no post-ROI blocks captured)');
  }
  console.log('');

  // ---- Final registers ----
  console.log('========================================================================');
  console.log('FINAL STATE');
  console.log('========================================================================');
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

  // ---- Periodic checkpoints ----
  console.log('========================================================================');
  console.log('PERIODIC CHECKPOINTS');
  console.log('========================================================================');
  for (const cp of result.checkpoints) {
    const note = cp.note ? ` (${cp.note})` : '';
    console.log(
      `  step ${String(cp.step).padStart(6, ' ')}: ` +
      `PC=${hex(cp.pc)} A=${hexByte(cp.a)} F=${hexByte(cp.f)} ` +
      `HL=${hex(cp.hl)} DE=${hex(cp.de)} BC=${hex(cp.bc)} ` +
      `SP=${hex(cp.sp)}${note}`,
    );
  }
  console.log('');

  // ---- Tail ----
  console.log('========================================================================');
  console.log('TAIL PCs (last 24 blocks)');
  console.log('========================================================================');
  if (result.tail.length > 0) {
    console.log(`  ${result.tail.map((pc) => hex(pc)).join(' -> ')}`);
  } else {
    console.log('  (none)');
  }
  console.log('');

  // ---- Blocks in 0x04EExx range ----
  console.log('========================================================================');
  console.log('BLOCKS VISITED IN 0x04EE00..0x04EE40 RANGE');
  console.log('========================================================================');
  const roiBlocks = result.order.filter((pc) => pc >= ROI_START && pc < ROI_END);
  if (roiBlocks.length > 0) {
    for (const pc of roiBlocks) {
      const count = result.visitCounts.get(pc) ?? 0;
      console.log(`  ${hex(pc)}: visited ${count} time(s)`);
    }
  } else {
    console.log('  (none)');
  }
  console.log('');
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
