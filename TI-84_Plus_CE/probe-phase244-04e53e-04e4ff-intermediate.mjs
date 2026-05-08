#!/usr/bin/env node

/**
 * Phase 244: Investigate 0x04E4FF / 0x04E53E in the
 * 0x04E447 -> ... -> 0x051ADC -> ... -> 0x0A1B5B path.
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
const BLOCKS = normalizeBlocks(
  romModule.PRELIFTED_BLOCKS ??
  romModule.default?.PRELIFTED_BLOCKS ??
  romModule.default ??
  romModule,
);

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

const BOOT_STACK_TOP = 0xD1A87E;
const RUN_STACK_TOP = 0xD1987E;
const RETURN_SENTINEL = 0x7FFFFE;
const MBASE = 0xD0;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;

const TARGET_04E4FF = 0x04E4FF;
const TARGET_04E53E = 0x04E53E;
const COMP_PATH_ENTRY = 0x04E447;
const MODE_FILTER = 0x051ADC;
const DISPLAY_REFRESH = 0x0A1B5B;

const DUMP_START = 0x04E4FF;
const DUMP_END = 0x04E560;

const RUN1_BUDGET = 500;
const RUN2_BUDGET = 500;
const RUN3_BUDGET = 2000;

const D003E0_ADDR = 0xD003E0;
const D007E0_ADDR = 0xD007E0;
const D0081D_ADDR = 0xD0081D; // catalogCurrent per references/ti84pceg.inc
const D00824_ADDR = 0xD00824;

const ENTRY_SEEDS = [
  { addr: 0xD00000, value: 0x00, name: 'D00000' },
  { addr: 0xD003DA, value: 0x00, name: 'D003DA' },
  { addr: D003E0_ADDR, value: 0x00, name: 'D003E0' },
  { addr: 0xD0058D, value: 0x00, name: 'D0058D' },
  { addr: 0xD0058E, value: 0x00, name: 'D0058E' },
  { addr: 0xD0059F, value: 0x00, name: 'D0059F' },
  { addr: D007E0_ADDR, value: 0x00, name: 'D007E0' },
  { addr: D00824_ADDR, value: 0x00, name: 'D00824' },
];

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const CONTROL_TRANSFER_TAGS = new Set([
  'call',
  'call-conditional',
  'jp',
  'jp-conditional',
  'jr',
  'jr-conditional',
  'djnz',
]);

const HIGHLIGHT_BLOCKS = new Map([
  [COMP_PATH_ENTRY, 'entry 0x04E447'],
  [MODE_FILTER, 'mode filter 0x051ADC'],
  [TARGET_04E4FF, 'intermediate 0x04E4FF'],
  [TARGET_04E53E, 'intermediate 0x04E53E'],
  [DISPLAY_REFRESH, 'display refresh 0x0A1B5B'],
]);

const MAX_RAM_WRITE_EVENTS = 4096;
const MAX_CONTROL_EVENTS = 2048;

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
}

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
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

function snapshotRegs(step, cpu, note = '') {
  return {
    step,
    note,
    pc: cpu.pc & 0xFFFFFF,
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    hl: (cpu._hl ?? 0) & 0xFFFFFF,
    de: (cpu._de ?? 0) & 0xFFFFFF,
    bc: (cpu._bc ?? 0) & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    ix: (cpu._ix ?? 0) & 0xFFFFFF,
    iy: (cpu._iy ?? 0) & 0xFFFFFF,
  };
}

function blockKey(addr, mode) {
  return `${(addr >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function getBlock(pc, mode) {
  return BLOCKS[blockKey(pc, mode)] ?? null;
}

function resolveNextMode(key, returnedPc, currentMode) {
  const meta = BLOCKS[key];
  if (!meta?.exits) return currentMode;
  for (const exit of meta.exits) {
    if (exit.target === returnedPc && exit.targetMode) return exit.targetMode;
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
      const nextMode = resolveNextMode(key, result, mode);
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
  const peripherals = createPeripheralBus({ timerInterrupt: false });
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
  cpu.sp = BOOT_STACK_TOP - 3;
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
  cpu.sp = BOOT_STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const post = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return { boot, kernel, post };
}

function seedHomeScreenState(cpu, mem, entryPc) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.pc = entryPc;
  cpu.sp = RUN_STACK_TOP;
  cpu._iy = IY_BASE;
  cpu._ix = IX_BASE;
  cpu._hl = 0;
  cpu._de = 0;
  cpu._bc = 0;
  cpu.a = 0x1D;
  cpu.f = 0x00;

  for (let offset = 0; offset < 128; offset++) {
    mem[(IY_BASE + offset) & MEM_MASK] = 0x00;
  }

  for (const seed of ENTRY_SEEDS) {
    mem[seed.addr & MEM_MASK] = seed.value & 0xFF;
  }

  mem.fill(0xFF, RUN_STACK_TOP - 32, RUN_STACK_TOP);
  push24(cpu, mem, RETURN_SENTINEL);
}

function readBytes(mem, addr, width) {
  const bytes = new Uint8Array(width);
  for (let i = 0; i < width; i++) {
    bytes[i] = mem[(addr + i) & MEM_MASK];
  }
  return bytes;
}

function sameBytes(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function installWriteTrace(cpu, stepRef, blockRef) {
  const mem = cpu.memory;
  const ramWrites = [];
  let totalWriteCount = 0;
  let truncated = false;

  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  function captureWrite(addr, width, before, after) {
    if (sameBytes(before, after)) return;
    totalWriteCount += 1;
    if (ramWrites.length >= MAX_RAM_WRITE_EVENTS) {
      truncated = true;
      return;
    }
    ramWrites.push({
      step: stepRef.current,
      afterBlock: blockRef.current,
      addr: addr & MEM_MASK,
      width,
      before: bytesToHex(before),
      after: bytesToHex(after),
    });
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
    return { ramWrites, totalWriteCount, truncated };
  };
}

function traceScenario(cpu, mem, budget, label) {
  const visitOrder = [];
  const visitCounts = new Map();
  const firstHits = new Map();
  const controlEvents = [];
  const transitions = [];
  const iyChanges = [];
  const snapshots = [snapshotRegs(0, cpu, 'entry')];

  const iyBefore = new Uint8Array(128);
  for (let i = 0; i < 128; i++) {
    iyBefore[i] = mem[(IY_BASE + i) & MEM_MASK];
  }

  const stepRef = { current: 0 };
  const blockRef = { current: cpu.pc & 0xFFFFFF };
  const uninstallWriteTrace = installWriteTrace(cpu, stepRef, blockRef);

  let executedSteps = 0;
  let stopReason = 'budget_exhausted';
  let error = null;
  let controlEventsTruncated = false;

  while (executedSteps < budget) {
    const pc = cpu.pc & 0xFFFFFF;
    const mode = cpu.madl ? 'adl' : 'z80';
    const block = getBlock(pc, mode);

    if (!visitCounts.has(pc)) {
      visitOrder.push(pc);
      firstHits.set(pc, executedSteps);
    }
    visitCounts.set(pc, (visitCounts.get(pc) ?? 0) + 1);

    if (pc === RETURN_SENTINEL) {
      stopReason = 'returned_sentinel';
      break;
    }

    stepRef.current = executedSteps + 1;
    blockRef.current = pc;

    let result;
    try {
      result = cpu.step();
    } catch (traceError) {
      stopReason = 'error';
      error = traceError instanceof Error ? traceError.message : String(traceError);
      break;
    }

    executedSteps += 1;
    const nextPc = cpu.pc & 0xFFFFFF;
    const nextMode = cpu.madl ? 'adl' : 'z80';

    if (block?.instructions) {
      for (const inst of block.instructions) {
        if (!CONTROL_TRANSFER_TAGS.has(inst.tag) || inst.target === undefined) continue;
        if (controlEvents.length >= MAX_CONTROL_EVENTS) {
          controlEventsTruncated = true;
          continue;
        }
        controlEvents.push({
          step: executedSteps,
          blockPc: pc,
          pc: inst.pc,
          tag: inst.tag,
          dasm: inst.dasm ?? formatInstruction(inst),
          target: inst.target,
          fallthrough: inst.fallthrough ?? null,
          actualNextPc: nextPc,
          taken:
            nextPc === inst.target ? true :
            inst.fallthrough !== undefined && nextPc === inst.fallthrough ? false :
            null,
        });
      }
    }

    transitions.push({
      step: executedSteps,
      from: pc,
      to: nextPc,
      modeFrom: mode,
      modeTo: nextMode,
    });

    for (let i = 0; i < 128; i++) {
      const cur = mem[(IY_BASE + i) & MEM_MASK];
      if (cur !== iyBefore[i]) {
        iyChanges.push({
          step: executedSteps,
          afterBlock: pc,
          offset: i,
          addr: IY_BASE + i,
          oldVal: iyBefore[i],
          newVal: cur,
        });
        iyBefore[i] = cur;
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
    if (nextPc === RETURN_SENTINEL) {
      stopReason = 'returned_sentinel';
      break;
    }
  }

  const writeTrace = uninstallWriteTrace();
  snapshots.push(snapshotRegs(executedSteps, cpu, 'final'));

  return {
    label,
    entryPc: snapshots[0].pc,
    executedSteps,
    stopReason,
    error,
    visitOrder,
    visitCounts,
    sortedUniqueBlocks: [...visitCounts.keys()].sort((a, b) => a - b),
    firstHits,
    controlEvents,
    controlEventsTruncated,
    ramWrites: writeTrace.ramWrites,
    totalWriteCount: writeTrace.totalWriteCount,
    ramWritesTruncated: writeTrace.truncated,
    iyChanges,
    transitions,
    snapshots,
    finalPc: cpu.pc & 0xFFFFFF,
  };
}

function noteForBlock(pc) {
  return HIGHLIGHT_BLOCKS.has(pc) ? `  ; ${HIGHLIGHT_BLOCKS.get(pc)}` : '';
}

function printHexDump(start, end) {
  console.log('========================================================================');
  console.log(`HEX DUMP ${hex(start)}..${hex(end)} (${end - start} bytes)`);
  console.log('========================================================================');
  for (let addr = start; addr < end; addr += 16) {
    const slice = romBytes.subarray(addr, Math.min(addr + 16, end));
    const hexStr = Array.from(slice, (b) => (b & 0xFF).toString(16).toUpperCase().padStart(2, '0')).join(' ');
    console.log(`  ${hex(addr)}: ${hexStr}`);
  }
  console.log('');
}

function printDisassembly(start, end) {
  console.log('========================================================================');
  console.log(`STATIC DISASSEMBLY ${hex(start)}..${hex(end)}`);
  console.log('========================================================================');
  const disasm = disassembleRange(start, end);
  for (const row of disasm) {
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(24)} ${row.text}`);
  }
  console.log('');
}

function printRegisters(label, regs) {
  console.log(
    `  ${label}: PC=${hex(regs.pc)} A=${hexByte(regs.a)} F=${hexByte(regs.f)} ` +
    `HL=${hex(regs.hl)} DE=${hex(regs.de)} BC=${hex(regs.bc)} ` +
    `SP=${hex(regs.sp)} IX=${hex(regs.ix)} IY=${hex(regs.iy)}` +
    (regs.note ? ` (${regs.note})` : ''),
  );
}

function printControlEvents(events, truncated) {
  console.log('  CALL/JP/JR destinations:');
  if (events.length === 0) {
    console.log('    (none)');
    console.log('');
    return;
  }

  const grouped = new Map();
  for (const event of events) {
    const key = `${event.blockPc}:${event.pc}:${event.tag}:${event.target}:${event.taken}`;
    if (!grouped.has(key)) {
      grouped.set(key, { ...event, count: 1 });
    } else {
      grouped.get(key).count += 1;
    }
  }

  for (const event of grouped.values()) {
    const takenText =
      event.taken === true ? 'taken' :
      event.taken === false ? 'fallthrough' :
      'observed';
    console.log(
      `    step ${String(event.step).padStart(4)}: ${hex(event.pc)} in ${hex(event.blockPc)} ` +
      `-> ${hex(event.target)} [${event.tag}, ${takenText}, x${event.count}] ${event.dasm}`,
    );
  }
  if (truncated) {
    console.log(`    ... truncated after ${MAX_CONTROL_EVENTS} control-transfer events`);
  }
  console.log('');
}

function printRamWrites(result) {
  console.log(`  RAM writes (${result.totalWriteCount} total):`);
  if (result.ramWrites.length === 0) {
    console.log('    (none)');
    console.log('');
    return;
  }
  for (const write of result.ramWrites) {
    console.log(
      `    step ${String(write.step).padStart(4)} after ${hex(write.afterBlock)}: ` +
      `${hex(write.addr)} width=${write.width} ${write.before} -> ${write.after}`,
    );
  }
  if (result.ramWritesTruncated) {
    console.log(`    ... truncated after ${MAX_RAM_WRITE_EVENTS} write events`);
  }
  console.log('');
}

function printIyChanges(result) {
  console.log(`  IY flag changes (${result.iyChanges.length} total):`);
  if (result.iyChanges.length === 0) {
    console.log('    (none)');
    console.log('');
    return;
  }
  for (const change of result.iyChanges) {
    console.log(
      `    step ${String(change.step).padStart(4)} after ${hex(change.afterBlock)}: ` +
      `IY+${hex(change.offset, 2)} (${hex(change.addr)}) ${hexByte(change.oldVal)} -> ${hexByte(change.newVal)}`,
    );
  }
  console.log('');
}

function printTraceResult(result, title) {
  console.log('========================================================================');
  console.log(title);
  console.log('========================================================================');
  console.log(`  Steps: ${result.executedSteps}`);
  console.log(`  Stop:  ${result.stopReason}`);
  console.log(`  Final PC: ${hex(result.finalPc)}`);
  if (result.error) console.log(`  Error: ${result.error}`);
  console.log(`  Unique blocks: ${result.sortedUniqueBlocks.length}`);
  printRegisters('Entry regs', result.snapshots[0]);
  printRegisters('Final regs', result.snapshots[result.snapshots.length - 1]);
  console.log('');

  console.log('  Unique blocks visited (sorted):');
  for (const pc of result.sortedUniqueBlocks) {
    const count = result.visitCounts.get(pc) ?? 0;
    console.log(`    ${hex(pc)} (x${count})${noteForBlock(pc)}`);
  }
  console.log('');

  printControlEvents(result.controlEvents, result.controlEventsTruncated);
  printRamWrites(result);
  printIyChanges(result);
}

function buildPathToTarget(result, targetPc) {
  const path = [result.entryPc];
  const pathTransitions = [];

  if (result.entryPc === targetPc) {
    return { reached: true, path, pathTransitions };
  }

  for (const transition of result.transitions) {
    pathTransitions.push(transition);
    path.push(transition.to);
    if (transition.to === targetPc) {
      return { reached: true, path, pathTransitions };
    }
  }

  return { reached: false, path, pathTransitions };
}

function firstHitStep(result, targetPc) {
  return result.firstHits.has(targetPc) ? result.firstHits.get(targetPc) : null;
}

function getWritesTouching(result, addr) {
  return result.ramWrites.filter((write) => addr >= write.addr && addr < write.addr + write.width);
}

function printPathTrace(result) {
  console.log('========================================================================');
  console.log(`RUN 3: Path trace from ${hex(COMP_PATH_ENTRY)} (${RUN3_BUDGET} steps)`);
  console.log('========================================================================');
  console.log(`  Steps: ${result.executedSteps}`);
  console.log(`  Stop:  ${result.stopReason}`);
  console.log(`  Final PC: ${hex(result.finalPc)}`);
  if (result.error) console.log(`  Error: ${result.error}`);
  console.log('');

  const targets = [MODE_FILTER, TARGET_04E4FF, TARGET_04E53E, DISPLAY_REFRESH];
  console.log('  First-hit steps:');
  for (const target of targets) {
    const step = firstHitStep(result, target);
    console.log(`    ${hex(target)}: ${step === null ? 'not reached' : `step ${step}`}${noteForBlock(target)}`);
  }
  console.log('');

  const pathInfo = buildPathToTarget(result, DISPLAY_REFRESH);
  const intermediateOrder = [];
  for (const pc of pathInfo.path) {
    if ((pc === TARGET_04E4FF || pc === TARGET_04E53E) && !intermediateOrder.includes(pc)) {
      intermediateOrder.push(pc);
    }
  }

  console.log(`  Hit display refresh: ${pathInfo.reached ? 'yes' : 'no'}`);
  console.log(`  Intermediate visit order before display refresh: ${intermediateOrder.length > 0 ? intermediateOrder.map((pc) => hex(pc)).join(' -> ') : '(none)'}`);
  console.log('');

  console.log('  Block path to display refresh:');
  if (pathInfo.path.length === 0) {
    console.log('    (none)');
  } else {
    for (let i = 0; i < pathInfo.path.length; i++) {
      console.log(`    [${String(i).padStart(3)}] ${hex(pathInfo.path[i])}${noteForBlock(pathInfo.path[i])}`);
    }
  }
  console.log('');

  console.log('  Exact block transitions to display refresh:');
  if (pathInfo.pathTransitions.length === 0) {
    console.log('    (none)');
  } else {
    for (const transition of pathInfo.pathTransitions) {
      console.log(
        `    step ${String(transition.step).padStart(4)}: ${hex(transition.from)} -> ${hex(transition.to)}` +
        `${noteForBlock(transition.to)}`,
      );
    }
  }
  console.log('');
}

function formatWriteSummary(result, addr, label) {
  const writes = getWritesTouching(result, addr);
  if (writes.length === 0) return `${label}: none`;
  return `${label}: ` + writes.map((write) => `step ${write.step} ${write.before} -> ${write.after} after ${hex(write.afterBlock)}`).join('; ');
}

function printReport(run1, run2, run3) {
  const pathInfo = buildPathToTarget(run3, DISPLAY_REFRESH);

  console.log('========================================================================');
  console.log('REPORT');
  console.log('========================================================================');
  console.log('  0x04E4FF static shape:');
  console.log(`    - Reads ${hex(D0081D_ADDR)} (catalogCurrent) into DE, seeds HL with 0x04E64C, and tests BIT 6 of IY+0x34.`);
  console.log('    - Uses 0x04E4BE and 0x04C973 (CpHLDE) for pointer comparison, and conditionally calls 0x04E5FE.');
  console.log(`    - On one path it stores HL back to ${hex(D0081D_ADDR)} and returns with carry set.`);
  console.log('');

  console.log('  0x04E53E static shape:');
  console.log('    - Thin wrapper around CALL 0x04E4FF.');
  console.log('    - If 0x04E4FF returns NC, it returns immediately.');
  console.log(`    - If carry is set, it backs HL up by 2 or 3 bytes, stores it to ${hex(D0081D_ADDR)}, sets carry, and returns.`);
  console.log('');

  console.log('  Direct-run write summary:');
  console.log(`    RUN 1 ${formatWriteSummary(run1, D003E0_ADDR, 'D003E0')}`);
  console.log(`    RUN 1 ${formatWriteSummary(run1, D007E0_ADDR, 'D007E0')}`);
  console.log(`    RUN 1 ${formatWriteSummary(run1, D00824_ADDR, 'D00824')}`);
  console.log(`    RUN 1 ${formatWriteSummary(run1, D0081D_ADDR, 'D0081D/catalogCurrent')}`);
  console.log(`    RUN 2 ${formatWriteSummary(run2, D003E0_ADDR, 'D003E0')}`);
  console.log(`    RUN 2 ${formatWriteSummary(run2, D007E0_ADDR, 'D007E0')}`);
  console.log(`    RUN 2 ${formatWriteSummary(run2, D00824_ADDR, 'D00824')}`);
  console.log(`    RUN 2 ${formatWriteSummary(run2, D0081D_ADDR, 'D0081D/catalogCurrent')}`);
  console.log('');

  const touchedModeBytes =
    getWritesTouching(run1, D003E0_ADDR).length +
    getWritesTouching(run1, D007E0_ADDR).length +
    getWritesTouching(run1, D00824_ADDR).length +
    getWritesTouching(run2, D003E0_ADDR).length +
    getWritesTouching(run2, D007E0_ADDR).length +
    getWritesTouching(run2, D00824_ADDR).length;

  console.log('  Conclusion:');
  if (touchedModeBytes === 0) {
    console.log('    - In the home-screen direct traces, 0x04E4FF and 0x04E53E do not modify D003E0, D007E0, or D00824.');
  } else {
    console.log('    - These routines touched at least one mode byte directly; inspect the write log above.');
  }
  console.log(`    - Their static writes center on ${hex(D0081D_ADDR)} (catalogCurrent), so they look like pointer/selection adjustment helpers, not direct display-refresh setup.`);
  console.log(`    - The display refresh still occurs later in the ${hex(COMP_PATH_ENTRY)} chain; these blocks are upstream helpers inside that path, not the refresh entry itself.`);
  if (pathInfo.reached) {
    console.log(`    - Path to ${hex(DISPLAY_REFRESH)}: ${pathInfo.path.map((pc) => hex(pc)).join(' -> ')}`);
  } else {
    console.log(`    - ${hex(DISPLAY_REFRESH)} was not reached within ${RUN3_BUDGET} steps from ${hex(COMP_PATH_ENTRY)}.`);
  }
  console.log('');
}

async function main() {
  console.log('Phase 244: Investigate 0x04E4FF / 0x04E53E intermediates');
  console.log('='.repeat(72));
  console.log('');
  console.log(`ROM: ${path.basename(ROM_PATH)} (${romBytes.length} bytes)`);
  console.log(`State seed: D007E0=${hexByte(0x00)} D00824=${hexByte(0x00)} D003E0=${hexByte(0x00)}`);
  console.log(`Registers: IX=${hex(IX_BASE)} IY=${hex(IY_BASE)} SP=${hex(RUN_STACK_TOP)} MBASE=${hexByte(MBASE)}`);
  console.log(`Return sentinel: ${hex(RETURN_SENTINEL)}`);
  console.log('');

  printHexDump(DUMP_START, DUMP_END);
  printDisassembly(DUMP_START, DUMP_END);

  const runtime = createRuntime();
  const bootSummary = coldBoot(runtime.executor, runtime.cpu, runtime.mem);
  const bootMemory = new Uint8Array(runtime.mem);
  const bootCpuSnapshot = snapshotCpu(runtime.cpu);

  console.log('========================================================================');
  console.log('COLD BOOT');
  console.log('========================================================================');
  console.log(`  boot:   steps=${bootSummary.boot.steps}/${bootSummary.boot.termination}`);
  console.log(`  kernel: steps=${bootSummary.kernel.steps}/${bootSummary.kernel.termination}`);
  console.log(`  post:   steps=${bootSummary.post.steps}/${bootSummary.post.termination}`);
  console.log(`  Preserved ${hex(D0081D_ADDR)} after boot: ${bytesToHex(runtime.mem.subarray(D0081D_ADDR, D0081D_ADDR + 3))}`);
  console.log('');

  runtime.mem.set(bootMemory);
  restoreCpu(runtime.cpu, bootCpuSnapshot);
  seedHomeScreenState(runtime.cpu, runtime.mem, TARGET_04E4FF);
  const run1 = traceScenario(runtime.cpu, runtime.mem, RUN1_BUDGET, 'run1-direct-04E4FF');
  printTraceResult(run1, `RUN 1: Direct call to ${hex(TARGET_04E4FF)} (${RUN1_BUDGET} steps)`);

  runtime.mem.set(bootMemory);
  restoreCpu(runtime.cpu, bootCpuSnapshot);
  seedHomeScreenState(runtime.cpu, runtime.mem, TARGET_04E53E);
  const run2 = traceScenario(runtime.cpu, runtime.mem, RUN2_BUDGET, 'run2-direct-04E53E');
  printTraceResult(run2, `RUN 2: Direct call to ${hex(TARGET_04E53E)} (${RUN2_BUDGET} steps)`);

  runtime.mem.set(bootMemory);
  restoreCpu(runtime.cpu, bootCpuSnapshot);
  seedHomeScreenState(runtime.cpu, runtime.mem, COMP_PATH_ENTRY);
  const run3 = traceScenario(runtime.cpu, runtime.mem, RUN3_BUDGET, 'run3-path-04E447');
  printPathTrace(run3);

  printReport(run1, run2, run3);
  console.log('Phase 244 complete.');
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
