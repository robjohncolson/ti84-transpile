#!/usr/bin/env node

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
const LOOP_PC = 0x09EFDE;
const LOOP_RANGE_START = 0x09E000;
const LOOP_RANGE_END = 0x09F000;
const STEP_BUDGET = 80000;
const REG_CHECKPOINT_INTERVAL = 10000;
const POST_EXIT_PATH_LIMIT = 16;

const VRAM_BASE = 0xD40000;
const VRAM_SIZE = 320 * 240 * 2;
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

const DISASM_ENTRY_START = 0x04EDC8;
const DISASM_ENTRY_END = 0x04EE10;
const DISASM_LOOP_START = 0x09EF70;
const DISASM_LOOP_END = 0x09F010;

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

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
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

    this._currentBlockPc = pc;
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

function formatIndexed(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${String(indexRegister).toUpperCase()}${sign}${displacement})`;
}

function formatInstruction(inst) {
  if (!inst) return '(decode error)';

  switch (inst.tag) {
    case 'alu-reg':
      return `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${String(inst.condition).toUpperCase()}`;
    case 'indexed-cb-res':
      return `RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-reg-mem':
      return `LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-imm':
      return `LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg16-imm':
      return `LD ${String(inst.dest).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg16-mem':
      return `LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg16':
      return `LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-indexed':
      return `LD ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-reg':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'push':
      return `PUSH ${String(inst.reg ?? inst.src ?? inst.pair).toUpperCase()}`;
    case 'pop':
      return `POP ${String(inst.reg ?? inst.dest ?? inst.pair).toUpperCase()}`;
    case 'nop':
      return 'NOP';
    case 'di':
      return 'DI';
    case 'ei':
      return 'EI';
    case 'halt':
      return 'HALT';
    case 'or-reg':
      return `OR ${String(inst.src).toUpperCase()}`;
    case 'and-reg':
      return `AND ${String(inst.src).toUpperCase()}`;
    case 'xor-reg':
      return `XOR ${String(inst.src).toUpperCase()}`;
    case 'inc-reg':
      return `INC ${String(inst.reg ?? inst.dest).toUpperCase()}`;
    case 'dec-reg':
      return `DEC ${String(inst.reg ?? inst.dest).toUpperCase()}`;
    case 'inc-reg16':
      return `INC ${String(inst.dest).toUpperCase()}`;
    case 'dec-reg16':
      return `DEC ${String(inst.dest).toUpperCase()}`;
    case 'cp-reg':
      return `CP ${String(inst.src).toUpperCase()}`;
    case 'cp-imm':
      return `CP ${hexByte(inst.value)}`;
    default: {
      let text = inst.tag;
      if (inst.target !== undefined) text += ` ${hex(inst.target)}`;
      if (inst.value !== undefined) text += ` ${hexByte(inst.value)}`;
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
        bytes: bytesToHex(romBytes.subarray(pc, pc + length)),
        text: formatInstruction(inst),
      });
      pc += length;
    } catch (error) {
      rows.push({
        pc,
        bytes: hexByte(romBytes[pc]),
        text: `DB ${hexByte(romBytes[pc])} ; ${error?.message ?? 'decode error'}`,
      });
      pc += 1;
    }
  }

  return rows;
}

function printDisassemblySection(title, rows) {
  console.log('========================================================================');
  console.log(title);
  console.log('========================================================================');
  for (const row of rows) {
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(22)} ${row.text}`);
  }
  console.log('');
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

function inLoopRange(pc) {
  return pc >= LOOP_RANGE_START && pc < LOOP_RANGE_END;
}

function rangeOverlaps(startA, lengthA, startB, lengthB) {
  const endA = startA + lengthA;
  const endB = startB + lengthB;
  return startA < endB && startB < endA;
}

function readBytes(mem, addr, width) {
  const bytes = new Uint8Array(width);
  for (let index = 0; index < width; index++) {
    bytes[index] = mem[(addr + index) & MEM_MASK];
  }
  return bytes;
}

function installVramWriteTrace(cpu, stepRef) {
  const mem = cpu.memory;
  const vram = {
    events: 0,
    bytes: 0,
    firstAddr: null,
    lastAddr: null,
    samples: [],
  };

  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  function captureWrite(addr, width, before, after) {
    let changed = false;
    for (let index = 0; index < before.length; index++) {
      if (before[index] !== after[index]) {
        changed = true;
        break;
      }
    }
    if (!changed) {
      return;
    }

    if (!rangeOverlaps(addr, width, VRAM_BASE, VRAM_SIZE)) {
      return;
    }

    vram.events += 1;
    vram.bytes += width;
    if (vram.firstAddr === null) {
      vram.firstAddr = addr;
    }
    vram.lastAddr = addr + width - 1;

    if (vram.samples.length < 24) {
      vram.samples.push({
        step: stepRef.current,
        pc: cpu._currentBlockPc & 0xFFFFFF,
        addr,
        width,
        before: bytesToHex(before),
        after: bytesToHex(after),
      });
    }
  }

  cpu.write8 = (addr, value) => {
    const base = addr & MEM_MASK;
    const before = readBytes(mem, base, 1);
    originalWrite8(base, value);
    const after = readBytes(mem, base, 1);
    captureWrite(base, 1, before, after);
  };

  cpu.write16 = (addr, value) => {
    const base = addr & MEM_MASK;
    const before = readBytes(mem, base, 2);
    originalWrite16(base, value);
    const after = readBytes(mem, base, 2);
    captureWrite(base, 2, before, after);
  };

  cpu.write24 = (addr, value) => {
    const base = addr & MEM_MASK;
    const before = readBytes(mem, base, 3);
    originalWrite24(base, value);
    const after = readBytes(mem, base, 3);
    captureWrite(base, 3, before, after);
  };

  return () => {
    cpu.write8 = originalWrite8;
    cpu.write16 = originalWrite16;
    cpu.write24 = originalWrite24;
    return vram;
  };
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
    head32: bytesToHex(mem.subarray(VRAM_BASE, VRAM_BASE + 32)),
    tail32: bytesToHex(mem.subarray(VRAM_LAST - 31, VRAM_LAST + 1)),
  };
}

function checkpointNote(loopFirstHit, loopExit) {
  if (!loopFirstHit) return 'pre-loop';
  if (!loopExit) return 'in-loop';
  return 'post-exit';
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

function pushLimitedPath(pathEntries, pc) {
  if (pathEntries.length >= POST_EXIT_PATH_LIMIT) {
    return;
  }
  if (pathEntries.length === 0 || pathEntries[pathEntries.length - 1] !== pc) {
    pathEntries.push(pc);
  }
}

function traceRun(cpu, mem, budget) {
  const visitCounts = new Map();
  const order = [];
  const tail = [];
  const checkpoints = [snapshotRegs(0, cpu, 'entry')];
  const stepRef = { current: 0 };
  const uninstall = installVramWriteTrace(cpu, stepRef);

  let executedSteps = 0;
  let stopReason = 'budget_exhausted';
  let error = null;
  let loopFirstHit = null;
  let loopExit = null;
  let returnStep = null;
  let vramWrites = null;
  const postExitPath = [];

  try {
    while (executedSteps < budget) {
      const pc = cpu.pc & 0xFFFFFF;
      recordVisit(visitCounts, order, pc);
      tail.push(pc);
      if (tail.length > 16) {
        tail.shift();
      }

      if (pc === RETURN_SENTINEL) {
        stopReason = 'returned_sentinel';
        returnStep = executedSteps;
        break;
      }

      if (!loopFirstHit && pc === LOOP_PC) {
        loopFirstHit = { step: executedSteps, pc };
      }

      if (loopExit) {
        pushLimitedPath(postExitPath, pc);
      }

      stepRef.current = executedSteps + 1;
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
        checkpoints.push(snapshotRegs(executedSteps, cpu, checkpointNote(loopFirstHit, loopExit)));
      }

      if (loopFirstHit && !loopExit && !inLoopRange(afterPc)) {
        loopExit = {
          step: executedSteps,
          fromPc: pc,
          pc: afterPc,
        };
        pushLimitedPath(postExitPath, afterPc);
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
  } finally {
    vramWrites = uninstall();
  }

  if (checkpoints[checkpoints.length - 1].step !== executedSteps) {
    checkpoints.push(snapshotRegs(executedSteps, cpu, 'final'));
  }

  const loopRangeUnique = order.filter((pc) => inLoopRange(pc));
  const loopRangeVisits = [...visitCounts.entries()].reduce(
    (sum, [pc, visits]) => (inLoopRange(pc) ? sum + visits : sum),
    0,
  );

  return {
    executedSteps,
    stopReason,
    error,
    loopFirstHit,
    loopExit,
    postExitPath,
    returnStep,
    finalPc: cpu.pc & 0xFFFFFF,
    finalA: cpu.a & 0xFF,
    finalF: cpu.f & 0xFF,
    finalHL: cpu.hl & 0xFFFFFF,
    finalDE: cpu.de & 0xFFFFFF,
    finalBC: cpu.bc & 0xFFFFFF,
    finalSP: cpu.sp & 0xFFFFFF,
    visitCounts,
    order,
    tail,
    checkpoints,
    fillCompleted: Boolean(loopExit),
    totalUniqueBlocks: order.length,
    loopRangeUnique,
    loopRangeVisits,
    loopPcVisits: visitCounts.get(LOOP_PC) ?? 0,
    vramWrites,
    vramContent: summarizeVramContent(mem),
  };
}

function topVisits(visitCounts, limit = 12) {
  return [...visitCounts.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return left[0] - right[0];
    })
    .slice(0, limit);
}

function printCheckpoints(checkpoints) {
  console.log('Register checkpoints:');
  for (const checkpoint of checkpoints) {
    const note = checkpoint.note ? ` (${checkpoint.note})` : '';
    console.log(
      `  step ${String(checkpoint.step).padStart(5, ' ')}: ` +
      `PC=${hex(checkpoint.pc)} A=${hexByte(checkpoint.a)} F=${hexByte(checkpoint.f)} ` +
      `HL=${hex(checkpoint.hl)} DE=${hex(checkpoint.de)} BC=${hex(checkpoint.bc)} ` +
      `SP=${hex(checkpoint.sp)} IX=${hex(checkpoint.ix)} IY=${hex(checkpoint.iy)}${note}`,
    );
  }
  console.log('');
}

function printTopVisits(visitCounts) {
  console.log('Top visited blocks:');
  for (const [pc, visits] of topVisits(visitCounts)) {
    console.log(`  ${hex(pc)}: visits=${visits}`);
  }
  console.log('');
}

function printVramSummary(result) {
  const { vramContent, vramWrites } = result;
  console.log('VRAM content summary:');
  console.log(`  region=${hex(VRAM_BASE)}..${hex(VRAM_LAST)} (${VRAM_SIZE} bytes)`);
  console.log(`  nonZeroBytes=${vramContent.nonZeroBytes}/${VRAM_SIZE}`);
  console.log(`  firstNonZero=${hex(vramContent.firstAddr)} lastNonZero=${hex(vramContent.lastAddr)}`);
  console.log(`  head32=${vramContent.head32}`);
  console.log(`  tail32=${vramContent.tail32}`);
  console.log('');

  console.log('VRAM write trace summary:');
  console.log(`  events=${vramWrites.events} bytes=${vramWrites.bytes}`);
  console.log(`  firstAddr=${hex(vramWrites.firstAddr)} lastAddr=${hex(vramWrites.lastAddr)}`);
  if (vramWrites.samples.length === 0) {
    console.log('  samples: (none)');
  } else {
    console.log('  samples:');
    for (const sample of vramWrites.samples) {
      console.log(
        `    step ${String(sample.step).padStart(5, ' ')} ${hex(sample.pc)} ` +
        `${hex(sample.addr)} width=${sample.width} ${sample.before} -> ${sample.after}`,
      );
    }
  }
  console.log('');
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
    `First ${hex(LOOP_PC)} hit: ` +
    `${result.loopFirstHit ? `yes at step ${result.loopFirstHit.step}` : 'no'}`,
  );
  console.log(
    `Left ${hex(LOOP_RANGE_START)}..${hex(LOOP_RANGE_END - 1)}: ` +
    `${result.loopExit ? `yes at step ${result.loopExit.step} -> ${hex(result.loopExit.pc)} (from ${hex(result.loopExit.fromPc)})` : 'no'}`,
  );
  console.log(
    `Returned via sentinel ${hex(RETURN_SENTINEL)}: ` +
    `${result.returnStep !== null ? `yes at step ${result.returnStep}` : 'no'}`,
  );
  console.log(`0x09EFDE visits: ${result.loopPcVisits}`);
  console.log(
    `Unique blocks: total=${result.totalUniqueBlocks} ` +
    `loopRange=${result.loopRangeUnique.length} loopVisits=${result.loopRangeVisits}`,
  );
  console.log(
    `Loop-range blocks: ` +
    `${result.loopRangeUnique.length ? result.loopRangeUnique.map((pc) => hex(pc)).join(' -> ') : '(none)'}`,
  );
  console.log(
    `Post-exit path: ${result.postExitPath.length ? result.postExitPath.map((pc) => hex(pc)).join(' -> ') : '(none)'}`,
  );
  console.log(
    `Final regs: A=${hexByte(result.finalA)} F=${hexByte(result.finalF)} ` +
    `HL=${hex(result.finalHL)} DE=${hex(result.finalDE)} BC=${hex(result.finalBC)} ` +
    `SP=${hex(result.finalSP)}`,
  );
  console.log('');

  printTopVisits(result.visitCounts);
  printCheckpoints(result.checkpoints);
  printVramSummary(result);

  console.log('Tail PCs:');
  console.log(`  ${result.tail.map((pc) => hex(pc)).join(' -> ') || '(none)'}`);
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

  console.log('Phase 239: Run 0x09EFDE VRAM fill to completion');
  console.log(`ROM: ${path.basename(ROM_PATH)} (${romBytes.length} bytes)`);
  console.log(`Transpiled blocks: ${path.basename(TRANSPILED_PATH)}`);
  console.log('Peripheral seed: pllDelay=2 timerInterrupt=false');
  console.log(
    `Entry seed: PC=${hex(ENTRY_PC)} A=${hexByte(0x1D)} IX=${hex(IX_BASE)} ` +
    `IY=${hex(IY_BASE)} MBASE=${hexByte(MBASE)}`,
  );
  console.log(`Budget: ${STEP_BUDGET} block steps from ${hex(ENTRY_PC)}`);
  console.log('');

  console.log(
    `Cold boot summary: boot=${bootSummary.boot.steps}/${bootSummary.boot.termination} ` +
    `kernel=${bootSummary.kernel.steps}/${bootSummary.kernel.termination} ` +
    `post=${bootSummary.post.steps}/${bootSummary.post.termination}`,
  );
  console.log('');

  printDisassemblySection(
    'Entry disassembly (0x04EDC8..0x04EE10)',
    disassembleRange(DISASM_ENTRY_START, DISASM_ENTRY_END),
  );
  printDisassemblySection(
    'Loop disassembly (0x09EF70..0x09F010)',
    disassembleRange(DISASM_LOOP_START, DISASM_LOOP_END),
  );

  const result = runScenario(runtime, bootMemory, bootCpuSnapshot);
  printTraceSummary(result);
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
