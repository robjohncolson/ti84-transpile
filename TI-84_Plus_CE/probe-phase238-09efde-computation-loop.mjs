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
const PRE_LOOP_MAX_STEPS = 5000;
const LOOP_BUDGETS = [2500, 5000];
const REG_CHECKPOINT_INTERVAL = 500;

const VRAM_BASE = 0xD40000;
const VRAM_SIZE = 320 * 240 * 2;
const VRAM_END = VRAM_BASE + VRAM_SIZE;

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

const WATCH_REGIONS = [
  { name: 'OP1_OP6', start: 0xD005F8, length: 0x30 },
  { name: 'D007E0_window', start: 0xD007E0, length: 0x20 },
  { name: 'D003E0_window', start: 0xD003E0, length: 0x20 },
  { name: 'D0058E_window', start: 0xD0058E, length: 0x10 },
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
      let s = inst.tag;
      if (inst.target !== undefined) s += ` ${hex(inst.target)}`;
      if (inst.value !== undefined) s += ` ${hexByte(inst.value)}`;
      return s;
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

function snapshotWatchRegions(mem) {
  const snapshot = {};

  for (const region of WATCH_REGIONS) {
    snapshot[region.name] = {
      start: region.start,
      end: region.start + region.length - 1,
      bytes: mem.slice(region.start, region.start + region.length),
    };
  }

  return snapshot;
}

function diffBytes(beforeBytes, afterBytes, startAddr, limit = 64) {
  const changes = [];

  for (let index = 0; index < beforeBytes.length; index++) {
    if (beforeBytes[index] !== afterBytes[index]) {
      changes.push({
        addr: startAddr + index,
        before: beforeBytes[index],
        after: afterBytes[index],
      });
      if (changes.length >= limit) {
        break;
      }
    }
  }

  return changes;
}

function diffWatchRegions(before, after) {
  const diffs = [];

  for (const region of WATCH_REGIONS) {
    const b = before[region.name];
    const a = after[region.name];
    const changes = diffBytes(b.bytes, a.bytes, region.start);
    let totalChanged = 0;

    for (let index = 0; index < b.bytes.length; index++) {
      if (b.bytes[index] !== a.bytes[index]) {
        totalChanged++;
      }
    }

    diffs.push({
      name: region.name,
      start: region.start,
      end: region.start + region.length - 1,
      totalChanged,
      changes,
    });
  }

  return diffs;
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

function installWriteTrace(cpu, stepRef) {
  const mem = cpu.memory;
  const regionWrites = [];
  const regionWriteCounts = new Map();
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
    if (bytesToHex(before) === bytesToHex(after)) {
      return;
    }

    const pc = cpu._currentBlockPc & 0xFFFFFF;

    for (const region of WATCH_REGIONS) {
      if (rangeOverlaps(addr, width, region.start, region.length)) {
        regionWriteCounts.set(region.name, (regionWriteCounts.get(region.name) ?? 0) + 1);
        if (regionWrites.length < 64) {
          regionWrites.push({
            step: stepRef.current,
            pc,
            region: region.name,
            addr,
            width,
            before: bytesToHex(before),
            after: bytesToHex(after),
          });
        }
      }
    }

    if (rangeOverlaps(addr, width, VRAM_BASE, VRAM_SIZE)) {
      vram.events += 1;
      vram.bytes += width;
      if (vram.firstAddr === null) {
        vram.firstAddr = addr;
      }
      vram.lastAddr = addr + width - 1;
      if (vram.samples.length < 32) {
        vram.samples.push({
          step: stepRef.current,
          pc,
          addr,
          width,
          before: bytesToHex(before),
          after: bytesToHex(after),
        });
      }
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
    return {
      regionWrites,
      regionWriteCounts: Object.fromEntries(regionWriteCounts),
      vram,
    };
  };
}

function recordVisit(visitCounts, order, pc) {
  if (!visitCounts.has(pc)) {
    order.push(pc);
  }
  visitCounts.set(pc, (visitCounts.get(pc) ?? 0) + 1);
}

function traceToLoop(cpu, maxSteps) {
  const visitCounts = new Map();
  const order = [];
  const tail = [];
  let executedSteps = 0;
  let stopReason = 'max_steps';
  let error = null;

  while (executedSteps < maxSteps) {
    const pc = cpu.pc & 0xFFFFFF;
    recordVisit(visitCounts, order, pc);
    tail.push(pc);
    if (tail.length > 32) {
      tail.shift();
    }

    if (pc === LOOP_PC) {
      stopReason = 'arrived_loop';
      break;
    }
    if (pc === RETURN_SENTINEL) {
      stopReason = 'returned_sentinel';
      break;
    }

    try {
      const result = cpu.step();
      executedSteps += 1;

      if (result === -1) {
        stopReason = 'halt';
        break;
      }
      if (result === -2) {
        stopReason = 'sleep';
        break;
      }
    } catch (traceError) {
      stopReason = 'error';
      error = traceError instanceof Error ? traceError.message : String(traceError);
      break;
    }
  }

  return {
    arrived: (cpu.pc & 0xFFFFFF) === LOOP_PC,
    executedSteps,
    stopReason,
    error,
    finalPc: cpu.pc & 0xFFFFFF,
    visitCounts,
    order,
    tail,
  };
}

function inLoopRange(pc) {
  return pc >= LOOP_RANGE_START && pc < LOOP_RANGE_END;
}

function snapshotRegs(step, cpu, note = '') {
  return {
    step,
    a: cpu.a & 0xFF,
    hl: cpu.hl & 0xFFFFFF,
    de: cpu.de & 0xFFFFFF,
    bc: cpu.bc & 0xFFFFFF,
    note,
  };
}

function traceLoop(cpu, mem, budget) {
  const visitCounts = new Map();
  const order = [];
  const checkpoints = [snapshotRegs(0, cpu, 'entry')];
  const hlSamples = [];
  const aTransitions = [];
  const regionBefore = snapshotWatchRegions(mem);
  const stepRef = { current: 0 };
  const uninstall = installWriteTrace(cpu, stepRef);

  let executedSteps = 0;
  let stopReason = 'budget_exhausted';
  let error = null;
  let exit = null;
  let previousA = cpu.a & 0xFF;

  try {
    while (executedSteps < budget) {
      const pc = cpu.pc & 0xFFFFFF;
      recordVisit(visitCounts, order, pc);

      if (pc === RETURN_SENTINEL) {
        stopReason = 'returned_sentinel';
        break;
      }
      if (executedSteps > 0 && !inLoopRange(pc)) {
        stopReason = 'left_09Exxx';
        exit = { step: executedSteps, pc };
        break;
      }

      const beforeA = cpu.a & 0xFF;
      const beforeHL = cpu.hl & 0xFFFFFF;
      const beforeDE = cpu.de & 0xFFFFFF;
      const beforeBC = cpu.bc & 0xFFFFFF;
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
      const afterA = cpu.a & 0xFF;
      const afterHL = cpu.hl & 0xFFFFFF;

      if (hlSamples.length < 64) {
        hlSamples.push({
          step: executedSteps,
          pc,
          nextPc: afterPc,
          hlBefore: beforeHL,
          hlAfter: afterHL,
          deBefore: beforeDE,
          bcBefore: beforeBC,
          aBefore: beforeA,
          aAfter: afterA,
        });
      }

      if (afterA !== previousA && aTransitions.length < 32) {
        aTransitions.push({
          step: executedSteps,
          pc: afterPc,
          before: previousA,
          after: afterA,
        });
        previousA = afterA;
      }

      if (executedSteps % REG_CHECKPOINT_INTERVAL === 0) {
        checkpoints.push(snapshotRegs(executedSteps, cpu));
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
      if (!inLoopRange(afterPc)) {
        stopReason = 'left_09Exxx';
        exit = { step: executedSteps, pc: afterPc };
        break;
      }
    }
  } finally {
    const writeTrace = uninstall();
    const regionAfter = snapshotWatchRegions(mem);
    const regionDiffs = diffWatchRegions(regionBefore, regionAfter);
    const lastCheckpoint = checkpoints[checkpoints.length - 1];

    if (lastCheckpoint.step !== executedSteps) {
      checkpoints.push(snapshotRegs(executedSteps, cpu, 'final'));
    }

    return {
      executedSteps,
      stopReason,
      error,
      exit,
      finalPc: cpu.pc & 0xFFFFFF,
      finalA: cpu.a & 0xFF,
      finalF: cpu.f & 0xFF,
      finalHL: cpu.hl & 0xFFFFFF,
      finalDE: cpu.de & 0xFFFFFF,
      finalBC: cpu.bc & 0xFFFFFF,
      finalSP: cpu.sp & 0xFFFFFF,
      visitCounts,
      order,
      checkpoints,
      hlSamples,
      aTransitions,
      writeTrace,
      regionDiffs,
    };
  }
}

function uniqueDeltas(samples) {
  const values = new Set();

  for (const sample of samples) {
    const delta = (sample.hlAfter - sample.hlBefore) & 0xFFFFFF;
    values.add(delta);
  }

  return [...values].sort((a, b) => a - b);
}

function inferLoopPurpose(result) {
  const hlTouchesVram = result.hlSamples.some(
    (sample) =>
      sample.hlBefore >= VRAM_BASE &&
      sample.hlBefore < VRAM_END,
  );
  const deltas = uniqueDeltas(result.hlSamples.slice(0, 32));
  const opDiff = result.regionDiffs.find((diff) => diff.name === 'OP1_OP6');

  if (
    result.writeTrace.vram.events > 0 &&
    hlTouchesVram &&
    deltas.length === 1 &&
    deltas[0] === 4 &&
    (!opDiff || opDiff.totalChanged === 0)
  ) {
    return 'VRAM fill/clear loop';
  }

  if (opDiff && opDiff.totalChanged > 0) {
    return 'OP register / floating-point setup loop';
  }

  if (result.writeTrace.vram.events > 0 && hlTouchesVram) {
    return 'VRAM write loop';
  }

  return 'unknown';
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

function printVisitCounts(title, order, visitCounts) {
  console.log(title);
  if (order.length === 0) {
    console.log('  (none)');
    console.log('');
    return;
  }

  for (const pc of order) {
    console.log(`  ${hex(pc)}: visits=${visitCounts.get(pc) ?? 0}`);
  }
  console.log('');
}

function printTail(title, tail) {
  console.log(title);
  if (tail.length === 0) {
    console.log('  (none)');
  } else {
    console.log(`  ${tail.map((pc) => hex(pc)).join(' -> ')}`);
  }
  console.log('');
}

function printCheckpoints(checkpoints) {
  console.log('Register checkpoints:');
  for (const checkpoint of checkpoints) {
    const suffix = checkpoint.note ? ` (${checkpoint.note})` : '';
    console.log(
      `  step ${String(checkpoint.step).padStart(4, ' ')}: ` +
      `A=${hexByte(checkpoint.a)} HL=${hex(checkpoint.hl)} ` +
      `DE=${hex(checkpoint.de)} BC=${hex(checkpoint.bc)}${suffix}`,
    );
  }
  console.log('');
}

function printRegionDiffs(regionDiffs) {
  console.log('Watched RAM region diffs:');
  for (const diff of regionDiffs) {
    console.log(
      `  ${diff.name} (${hex(diff.start)}..${hex(diff.end)}): ${diff.totalChanged} changed byte(s)`,
    );
    for (const change of diff.changes) {
      console.log(
        `    ${hex(change.addr)}: ${hexByte(change.before)} -> ${hexByte(change.after)}`,
      );
    }
  }
  console.log('');
}

function printRegionWriteSamples(writeTrace) {
  console.log('Watched region write samples:');
  if (writeTrace.regionWrites.length === 0) {
    console.log('  (none)');
  } else {
    for (const entry of writeTrace.regionWrites) {
      console.log(
        `  step ${String(entry.step).padStart(4, ' ')} ${hex(entry.pc)} ` +
        `${entry.region} ${hex(entry.addr)} width=${entry.width} ` +
        `${entry.before} -> ${entry.after}`,
      );
    }
  }

  console.log('Watched region write counts:');
  const names = Object.keys(writeTrace.regionWriteCounts);
  if (names.length === 0) {
    console.log('  (none)');
  } else {
    for (const name of names) {
      console.log(`  ${name}: ${writeTrace.regionWriteCounts[name]}`);
    }
  }
  console.log('');
}

function printVramSummary(writeTrace) {
  const vram = writeTrace.vram;
  console.log('VRAM write summary:');
  console.log(`  events=${vram.events} bytes=${vram.bytes}`);
  console.log(`  firstAddr=${hex(vram.firstAddr)} lastAddr=${hex(vram.lastAddr)}`);
  if (vram.samples.length === 0) {
    console.log('  samples: (none)');
  } else {
    console.log('  samples:');
    for (const sample of vram.samples) {
      console.log(
        `    step ${String(sample.step).padStart(4, ' ')} ${hex(sample.pc)} ` +
        `${hex(sample.addr)} width=${sample.width} ${sample.before} -> ${sample.after}`,
      );
    }
  }
  console.log('');
}

function printHlSamples(samples) {
  console.log('Early HL / A samples:');
  if (samples.length === 0) {
    console.log('  (none)');
  } else {
    for (const sample of samples) {
      console.log(
        `  step ${String(sample.step).padStart(4, ' ')} ${hex(sample.pc)} -> ${hex(sample.nextPc)} ` +
        `HL ${hex(sample.hlBefore)} -> ${hex(sample.hlAfter)} ` +
        `A ${hexByte(sample.aBefore)} -> ${hexByte(sample.aAfter)}`,
      );
    }
  }
  console.log('');
}

function printATransitions(aTransitions) {
  console.log('A transitions inside loop:');
  if (aTransitions.length === 0) {
    console.log('  (none)');
  } else {
    for (const transition of aTransitions) {
      console.log(
        `  step ${String(transition.step).padStart(4, ' ')} ${hex(transition.pc)} ` +
        `${hexByte(transition.before)} -> ${hexByte(transition.after)}`,
      );
    }
  }
  console.log('');
}

function printScenarioResult(preLoop, loopResult, budget) {
  console.log('========================================================================');
  console.log(`Scenario: ${budget} loop steps from first ${hex(LOOP_PC)} hit`);
  console.log('========================================================================');
  console.log(
    `Pre-loop: arrived=${preLoop.arrived} steps=${preLoop.executedSteps} ` +
    `stop=${preLoop.stopReason} finalPc=${hex(preLoop.finalPc)}`,
  );
  if (preLoop.error) {
    console.log(`Pre-loop error: ${preLoop.error}`);
  }
  console.log('');

  printVisitCounts('Pre-loop unique blocks:', preLoop.order, preLoop.visitCounts);
  printTail('Pre-loop tail:', preLoop.tail);

  console.log(
    `Loop result: executed=${loopResult.executedSteps}/${budget} ` +
    `stop=${loopResult.stopReason} finalPc=${hex(loopResult.finalPc)}`,
  );
  if (loopResult.error) {
    console.log(`Loop error: ${loopResult.error}`);
  }
  console.log(
    `Loop exit from 0x09Exxx: ${loopResult.exit ? `yes at step ${loopResult.exit.step} -> ${hex(loopResult.exit.pc)}` : 'no'}`,
  );
  console.log(
    `Final regs: A=${hexByte(loopResult.finalA)} F=${hexByte(loopResult.finalF)} ` +
    `HL=${hex(loopResult.finalHL)} DE=${hex(loopResult.finalDE)} ` +
    `BC=${hex(loopResult.finalBC)} SP=${hex(loopResult.finalSP)}`,
  );
  console.log(`Inference: ${inferLoopPurpose(loopResult)}`);
  console.log(`HL deltas (first samples): ${uniqueDeltas(loopResult.hlSamples.slice(0, 32)).map((value) => hex(value)).join(', ') || '(none)'}`);
  console.log('');

  printVisitCounts('Loop unique blocks:', loopResult.order, loopResult.visitCounts);
  printCheckpoints(loopResult.checkpoints);
  printRegionDiffs(loopResult.regionDiffs);
  printRegionWriteSamples(loopResult.writeTrace);
  printVramSummary(loopResult.writeTrace);
  printHlSamples(loopResult.hlSamples);
  printATransitions(loopResult.aTransitions);
}

function runScenario(runtime, bootMemory, bootCpuSnapshot, budget) {
  runtime.mem.set(bootMemory);
  restoreCpu(runtime.cpu, bootCpuSnapshot);
  seedEntryState(runtime.cpu, runtime.mem);

  const preLoop = traceToLoop(runtime.cpu, PRE_LOOP_MAX_STEPS);
  if (!preLoop.arrived) {
    return {
      preLoop,
      loopResult: null,
    };
  }

  const loopResult = traceLoop(runtime.cpu, runtime.mem, budget);
  return {
    preLoop,
    loopResult,
  };
}

async function main() {
  const runtime = createRuntime();
  const bootSummary = coldBoot(runtime.executor, runtime.cpu, runtime.mem);
  const bootMemory = new Uint8Array(runtime.mem);
  const bootCpuSnapshot = snapshotCpu(runtime.cpu);

  console.log('Phase 238: Trace 0x09EFDE computation loop');
  console.log(`ROM: ${path.basename(ROM_PATH)} (${romBytes.length} bytes)`);
  console.log(`Transpiled blocks: ${path.basename(TRANSPILED_PATH)}`);
  console.log(`Peripheral seed: pllDelay=2 timerInterrupt=false`);
  console.log(`Entry seed: PC=${hex(ENTRY_PC)} A=${hexByte(0x1D)} IX=${hex(IX_BASE)} IY=${hex(IY_BASE)} MBASE=${hexByte(MBASE)}`);
  console.log('');
  console.log(
    `Cold boot summary: boot=${bootSummary.boot.steps}/${bootSummary.boot.termination} ` +
    `kernel=${bootSummary.kernel.steps}/${bootSummary.kernel.termination} ` +
    `post=${bootSummary.post.steps}/${bootSummary.post.termination}`,
  );
  console.log('');

  printDisassemblySection(
    'Entry disassembly (0x04EDC8..0x04EE10)',
    disassembleRange(0x04EDC8, 0x04EE10),
  );
  printDisassemblySection(
    'Loop disassembly (0x09EF70..0x09F004)',
    disassembleRange(0x09EF70, 0x09F004),
  );

  for (const budget of LOOP_BUDGETS) {
    const scenario = runScenario(runtime, bootMemory, bootCpuSnapshot, budget);
    if (!scenario.preLoop.arrived) {
      console.log('========================================================================');
      console.log(`Scenario: ${budget} loop steps`);
      console.log('========================================================================');
      console.log(
        `Failed to reach ${hex(LOOP_PC)} from ${hex(ENTRY_PC)}: ` +
        `steps=${scenario.preLoop.executedSteps} stop=${scenario.preLoop.stopReason} finalPc=${hex(scenario.preLoop.finalPc)}`,
      );
      if (scenario.preLoop.error) {
        console.log(`Error: ${scenario.preLoop.error}`);
      }
      printVisitCounts('Visited blocks before stop:', scenario.preLoop.order, scenario.preLoop.visitCounts);
      printTail('Tail before stop:', scenario.preLoop.tail);
      continue;
    }

    printScenarioResult(scenario.preLoop, scenario.loopResult, budget);
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
