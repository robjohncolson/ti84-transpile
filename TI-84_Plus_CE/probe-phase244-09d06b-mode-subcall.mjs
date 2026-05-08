#!/usr/bin/env node

/**
 * Phase 244: trace 0x09D06B, the sub-call used by the 0x051ADC mode filter.
 *
 * Deliverables:
 *   1. Hex dump + static disassembly of 0x09D06B..0x09D0D0.
 *   2. Direct traces of 0x09D06B for mode bytes 0x00 / 0x40 / 0x5B.
 *   3. Caller traces of 0x051ADC to show how 0x09D06B's Z/NZ return steers the filter.
 *   4. A short report section that summarizes the check and the caller effect.
 *
 * Notes from the lifted ROM:
 *   - 0x051AE5 calls 0x09D06B directly.
 *   - 0x09D086 is a separate wrapper that calls 0x09D06B and then performs
 *     additional mode-byte checks; 0x051ADC does not enter through 0x09D086.
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

const FLAG_C = 0x01;
const FLAG_PV = 0x04;
const FLAG_H = 0x10;
const FLAG_Z = 0x40;
const FLAG_S = 0x80;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

const BOOT_STACK_TOP = 0xD1A87E;
const ENTRY_SP = 0xD1987E;
const RETURN_SENTINEL = 0x7FFFFE;
const MBASE = 0xD0;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;

const TARGET_SUBCALL = 0x09D06B;
const TARGET_FILTER = 0x051ADC;
const FILTER_SUBCALL_SITE = 0x051AE5;
const FILTER_AFTER_SUBCALL = 0x051AE9;
const FILTER_FALLTHROUGH = 0x051AEB;
const FILTER_RET_Z = 0x051B28;
const FILTER_SECOND_CALL = 0x088772;

const CX_MAIN_ADDR = 0xD007CA;
const MODE_ADDR = 0xD007E0;
const D00824_ADDR = 0xD00824;
const CX_MAIN_MATCH_A = 0x09D22C;
const CX_MAIN_MATCH_B = 0x09D32D;

const DUMP_START = 0x09D06B;
const DUMP_LAST = 0x09D0D0;

const DIRECT_BUDGET = 200;
const CALLER_BUDGET = 500;

const EDIT_BUFFER_START = 0xD00A00;
const EDIT_CURSOR_PTR = 0xD0243A;

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles', 'pc',
];

const COMMON_ENTRY_SEEDS = [
  { addr: 0xD0058E, value: 0x8F, name: 'D0058E (key press)' },
  { addr: 0xD0058D, value: 0x00, name: 'D0058D' },
  { addr: 0xD0059F, value: 0x00, name: 'D0059F' },
  { addr: 0xD003E0, value: 0x00, name: 'D003E0' },
  { addr: 0xD003DA, value: 0x00, name: 'D003DA' },
  { addr: 0xD00000, value: 0x00, name: 'D00000' },
];

const DIRECT_SCENARIOS = [
  { label: 'RUN 1', note: 'direct 0x09D06B, home-screen mode', mode: 0x00, d00824: 0x00, entry: TARGET_SUBCALL, entryA: 0x00 },
  { label: 'RUN 2', note: 'direct 0x09D06B, mode 0x40', mode: 0x40, d00824: 0x00, entry: TARGET_SUBCALL, entryA: 0x40 },
  { label: 'RUN 3', note: 'direct 0x09D06B, mode 0x5B', mode: 0x5B, d00824: 0x00, entry: TARGET_SUBCALL, entryA: 0x5B },
];

const CALLER_SCENARIOS = [
  { label: 'RUN 4A', note: '0x051ADC, mode 0x00, baseline cxMain', mode: 0x00, d00824: 0x00, entry: TARGET_FILTER, entryA: 0x1D },
  { label: 'RUN 4B', note: '0x051ADC, mode 0x40, baseline cxMain', mode: 0x40, d00824: 0x00, entry: TARGET_FILTER, entryA: 0x1D },
  { label: 'RUN 4C', note: '0x051ADC, mode 0x5B, baseline cxMain', mode: 0x5B, d00824: 0x00, entry: TARGET_FILTER, entryA: 0x1D },
  { label: 'RUN 4D', note: '0x051ADC, force cxMain = 0x09D22C', mode: 0x00, d00824: 0x00, entry: TARGET_FILTER, entryA: 0x1D, cxMain: CX_MAIN_MATCH_A },
  { label: 'RUN 4E', note: '0x051ADC, force cxMain = 0x09D32D', mode: 0x00, d00824: 0x00, entry: TARGET_FILTER, entryA: 0x1D, cxMain: CX_MAIN_MATCH_B },
];

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

function read24(mem, addr) {
  const base = addr & MEM_MASK;
  return (
    (mem[base] & 0xFF) |
    ((mem[(base + 1) & MEM_MASK] & 0xFF) << 8) |
    ((mem[(base + 2) & MEM_MASK] & 0xFF) << 16)
  ) >>> 0;
}

function readValueFromMem(mem, addr, width) {
  const base = addr & MEM_MASK;
  let value = 0;
  for (let i = 0; i < width; i++) {
    value |= (mem[(base + i) & MEM_MASK] & 0xFF) << (i * 8);
  }
  return value >>> 0;
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

function snapshotRegs(cpu) {
  return {
    pc: cpu.pc & 0xFFFFFF,
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    bc: (cpu._bc ?? 0) & 0xFFFFFF,
    de: (cpu._de ?? 0) & 0xFFFFFF,
    hl: (cpu._hl ?? 0) & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    ix: (cpu._ix ?? 0) & 0xFFFFFF,
    iy: (cpu._iy ?? 0) & 0xFFFFFF,
  };
}

function formatFlags(flags) {
  const names = [
    [FLAG_S, 'S'],
    [FLAG_Z, 'Z'],
    [FLAG_H, 'H'],
    [FLAG_PV, 'PV'],
    [FLAG_C, 'C'],
  ];
  const set = names.filter(([mask]) => (flags & mask) !== 0).map(([, name]) => name);
  return set.length > 0 ? set.join(' ') : '(none)';
}

function blockKey(addr, mode) {
  return `${(addr >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function resolveNextMode(executor, key, returnedPc, currentMode) {
  const meta = executor.blockMeta?.[key];
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

function formatInstruction(inst) {
  if (!inst) return '(decode error)';
  switch (inst.tag) {
    case 'alu-reg':
      return `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
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
      const addrWidth = (inst.addr ?? 0) <= 0xFFFF ? 4 : 6;
      if (inst.direction === 'to-mem') {
        return `LD (${hex(inst.addr, addrWidth)}), ${String(inst.pair).toUpperCase()}`;
      }
      return `LD ${String(inst.pair).toUpperCase()}, (${hex(inst.addr, addrWidth)})`;
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
    default: {
      let text = inst.tag;
      if (inst.target !== undefined) text += ` ${hex(inst.target)}`;
      if (inst.value !== undefined) text += ` ${hex(inst.value)}`;
      return text;
    }
  }
}

function disassembleInclusive(start, lastInclusive) {
  const rows = [];
  for (let pc = start; pc <= lastInclusive;) {
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

function seedRunState(cpu, mem, scenario) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.pc = scenario.entry;
  cpu.sp = ENTRY_SP;
  cpu._iy = IY_BASE;
  cpu._ix = IX_BASE;
  cpu._hl = 0;
  cpu._de = 0;
  cpu._bc = 0;
  cpu._a2 = 0;
  cpu._f2 = 0;
  cpu._bc2 = 0;
  cpu._de2 = 0;
  cpu._hl2 = 0;
  cpu.i = 0;
  cpu.im = 0;
  cpu.a = scenario.entryA & 0xFF;
  cpu.f = 0x00;

  const stackStart = Math.max(0, ENTRY_SP - 0x40);
  const stackEnd = Math.min(mem.length, ENTRY_SP + 0x10);
  mem.fill(0xFF, stackStart, stackEnd);

  for (let offset = 0; offset < 128; offset++) {
    mem[(IY_BASE + offset) & MEM_MASK] = 0x00;
  }

  for (const seed of COMMON_ENTRY_SEEDS) {
    mem[seed.addr & MEM_MASK] = seed.value & 0xFF;
  }

  mem[MODE_ADDR & MEM_MASK] = scenario.mode & 0xFF;
  mem[D00824_ADDR & MEM_MASK] = scenario.d00824 & 0xFF;
  if (scenario.cxMain !== undefined) {
    write24(mem, CX_MAIN_ADDR, scenario.cxMain);
  }

  mem[EDIT_BUFFER_START & MEM_MASK] = 0x00;
  write24(mem, EDIT_CURSOR_PTR, EDIT_BUFFER_START);

  push24(cpu, mem, RETURN_SENTINEL);
}

function isRamAddr(addr) {
  return addr >= 0xD00000 && addr < 0xE00000;
}

function installMemoryTrace(cpu, mem, stepRef, reads, writes) {
  const original = {
    read8: cpu.read8.bind(cpu),
    read16: cpu.read16.bind(cpu),
    read24: cpu.read24.bind(cpu),
    write8: cpu.write8.bind(cpu),
    write16: cpu.write16.bind(cpu),
    write24: cpu.write24.bind(cpu),
  };

  function logRead(addr, width, value) {
    const normalized = addr & 0xFFFFFF;
    if (!isRamAddr(normalized)) return;
    reads.push({
      step: stepRef.current,
      pc: cpu._currentBlockPc ?? cpu.pc ?? 0,
      addr: normalized,
      width,
      value: value >>> 0,
    });
  }

  function logWrite(addr, width, before, after) {
    const normalized = addr & 0xFFFFFF;
    if (!isRamAddr(normalized)) return;
    writes.push({
      step: stepRef.current,
      pc: cpu._currentBlockPc ?? cpu.pc ?? 0,
      addr: normalized,
      width,
      before: before >>> 0,
      after: after >>> 0,
    });
  }

  cpu.read8 = (addr) => {
    const value = original.read8(addr);
    logRead(addr, 1, value & 0xFF);
    return value;
  };

  cpu.read16 = (addr) => {
    const value = original.read16(addr);
    logRead(addr, 2, value & 0xFFFF);
    return value;
  };

  cpu.read24 = (addr) => {
    const value = original.read24(addr);
    logRead(addr, 3, value & 0xFFFFFF);
    return value;
  };

  cpu.write8 = (addr, value) => {
    const before = readValueFromMem(mem, addr, 1);
    original.write8(addr, value);
    const after = readValueFromMem(mem, addr, 1);
    if (before !== after) logWrite(addr, 1, before, after);
  };

  cpu.write16 = (addr, value) => {
    const before = readValueFromMem(mem, addr, 2);
    original.write16(addr, value);
    const after = readValueFromMem(mem, addr, 2);
    if (before !== after) logWrite(addr, 2, before, after);
  };

  cpu.write24 = (addr, value) => {
    const before = readValueFromMem(mem, addr, 3);
    original.write24(addr, value);
    const after = readValueFromMem(mem, addr, 3);
    if (before !== after) logWrite(addr, 3, before, after);
  };

  return () => {
    cpu.read8 = original.read8;
    cpu.read16 = original.read16;
    cpu.read24 = original.read24;
    cpu.write8 = original.write8;
    cpu.write16 = original.write16;
    cpu.write24 = original.write24;
  };
}

function traceExecution(cpu, mem, budget, options = {}) {
  const {
    captureMemory = false,
    captureControl = false,
    watches = new Map(),
  } = options;

  const visitOrder = [];
  const visitCounts = new Map();
  const callTargets = [];
  const jumpTargets = [];
  const hits = new Map();
  const ramReads = [];
  const ramWrites = [];
  const tail = [];
  const tailLimit = 32;
  const stepRef = { current: 0 };

  const entryRegs = snapshotRegs(cpu);
  let executedSteps = 0;
  let stopReason = 'budget_exhausted';
  let error = null;

  const restoreMemoryTrace = captureMemory
    ? installMemoryTrace(cpu, mem, stepRef, ramReads, ramWrites)
    : () => {};

  try {
    while (executedSteps < budget) {
      const pc = cpu.pc & 0xFFFFFF;

      if (!visitCounts.has(pc)) {
        visitOrder.push(pc);
      }
      visitCounts.set(pc, (visitCounts.get(pc) ?? 0) + 1);

      tail.push(pc);
      if (tail.length > tailLimit) tail.shift();

      if (watches.has(pc)) {
        const label = watches.get(pc);
        if (!hits.has(label)) hits.set(label, []);
        hits.get(label).push(executedSteps);
      }

      if (pc === RETURN_SENTINEL) {
        stopReason = 'returned_sentinel';
        break;
      }

      if (captureControl) {
        const mode = cpu.madl ? 'adl' : 'z80';
        try {
          const inst = decodeInstruction(romBytes, pc, mode);
          if (inst && (inst.tag === 'call' || inst.tag === 'call-conditional')) {
            callTargets.push({
              step: executedSteps,
              from: pc,
              target: inst.target & 0xFFFFFF,
              tag: inst.tag,
              condition: inst.condition ?? null,
            });
          }
          if (
            inst &&
            (inst.tag === 'jp' || inst.tag === 'jp-conditional' || inst.tag === 'jr' || inst.tag === 'jr-conditional')
          ) {
            jumpTargets.push({
              step: executedSteps,
              from: pc,
              target: inst.target & 0xFFFFFF,
              tag: inst.tag,
              condition: inst.condition ?? null,
            });
          }
        } catch {}
      }

      stepRef.current = executedSteps;

      let result;
      try {
        result = cpu.step();
      } catch (traceError) {
        stopReason = 'error';
        error = traceError instanceof Error ? traceError.message : String(traceError);
        break;
      }

      executedSteps += 1;

      if (result === -1) {
        stopReason = 'halt';
        break;
      }
      if (result === -2) {
        stopReason = 'sleep';
        break;
      }
      if ((cpu.pc & 0xFFFFFF) === RETURN_SENTINEL) {
        stopReason = 'returned_sentinel';
        break;
      }
    }
  } finally {
    restoreMemoryTrace();
  }

  const finalRegs = snapshotRegs(cpu);

  return {
    executedSteps,
    stopReason,
    error,
    entryRegs,
    finalRegs,
    finalA: cpu.a & 0xFF,
    finalF: cpu.f & 0xFF,
    visitOrder,
    visitSorted: [...visitOrder].sort((a, b) => a - b),
    visitCounts,
    callTargets,
    jumpTargets,
    hits,
    ramReads,
    ramWrites,
    tail,
  };
}

function formatWidthValue(width, value) {
  return hex(value, width * 2);
}

function printHexDump(start, lastInclusive) {
  const byteCount = (lastInclusive - start) + 1;
  console.log('========================================================================');
  console.log(`HEX DUMP ${hex(start)}..${hex(lastInclusive)} (inclusive, ${byteCount} bytes)`);
  console.log('========================================================================');
  for (let addr = start; addr <= lastInclusive; addr += 16) {
    const end = Math.min(addr + 15, lastInclusive);
    const slice = romBytes.subarray(addr, end + 1);
    const hexStr = Array.from(slice, (b) => (b & 0xFF).toString(16).toUpperCase().padStart(2, '0')).join(' ');
    console.log(`  ${hex(addr)}: ${hexStr}`);
  }
  console.log('');
}

function printDisassembly(start, lastInclusive) {
  console.log('========================================================================');
  console.log(`STATIC DISASSEMBLY ${hex(start)}..${hex(lastInclusive)} (inclusive)`);
  console.log('========================================================================');
  const rows = disassembleInclusive(start, lastInclusive);
  for (const row of rows) {
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(24)} ${row.text}`);
  }
  console.log('');
}

function printTargets(title, rows) {
  if (rows.length === 0) {
    console.log(`  ${title}: (none)`);
    console.log('');
    return;
  }

  console.log(`  ${title}:`);
  const grouped = new Map();
  for (const row of rows) {
    const key = `${row.tag}:${row.from}->${row.target}:${row.condition ?? ''}`;
    const entry = grouped.get(key) ?? { ...row, count: 0 };
    entry.count += 1;
    grouped.set(key, entry);
  }
  for (const entry of grouped.values()) {
    const cond = entry.condition ? ` ${String(entry.condition).toUpperCase()}` : '';
    console.log(
      `    step ${String(entry.step).padStart(3)}: ${hex(entry.from)} ${entry.tag.toUpperCase()}${cond} -> ${hex(entry.target)} (x${entry.count})`
    );
  }
  console.log('');
}

function printMemoryEvents(reads, writes) {
  if (reads.length === 0) {
    console.log('  RAM reads: (none)');
  } else {
    console.log(`  RAM reads (${reads.length}):`);
    for (const event of reads) {
      console.log(
        `    step ${String(event.step).padStart(3)} @${hex(event.pc)} READ${event.width * 8} ${hex(event.addr)} => ${formatWidthValue(event.width, event.value)}`
      );
    }
  }
  console.log('');

  if (writes.length === 0) {
    console.log('  RAM writes: (none)');
  } else {
    console.log(`  RAM writes (${writes.length}):`);
    for (const event of writes) {
      console.log(
        `    step ${String(event.step).padStart(3)} @${hex(event.pc)} WRITE${event.width * 8} ${hex(event.addr)}: ` +
        `${formatWidthValue(event.width, event.before)} -> ${formatWidthValue(event.width, event.after)}`
      );
    }
  }
  console.log('');
}

function printRegisterPair(label, regs) {
  console.log(
    `  ${label}: PC=${hex(regs.pc)} A=${hexByte(regs.a)} F=${hexByte(regs.f)} [${formatFlags(regs.f)}] ` +
    `BC=${hex(regs.bc)} DE=${hex(regs.de)} HL=${hex(regs.hl)} SP=${hex(regs.sp)} IX=${hex(regs.ix)} IY=${hex(regs.iy)}`
  );
}

function printDirectRun(scenario, result, effectiveCxMain) {
  console.log('========================================================================');
  console.log(`${scenario.label}: ${scenario.note}`);
  console.log(
    `  Entry: PC=${hex(scenario.entry)} A=${hexByte(scenario.entryA)} D007E0=${hexByte(scenario.mode)} ` +
    `D00824=${hexByte(scenario.d00824)} cxMain=${hex(effectiveCxMain)} SP=${hex(ENTRY_SP)}`
  );
  console.log('========================================================================');
  console.log(
    `  Steps: ${result.executedSteps} | Stop: ${result.stopReason} | Final PC: ${hex(result.finalRegs.pc)} | ` +
    `Return A=${hexByte(result.finalA)} F=${hexByte(result.finalF)} [${formatFlags(result.finalF)}]`
  );
  if (result.error) console.log(`  Error: ${result.error}`);
  console.log(`  Unique blocks visited (${result.visitOrder.length}): ${result.visitOrder.map((pc) => hex(pc)).join(' -> ')}`);
  console.log(`  Unique blocks (sorted): ${result.visitSorted.map((pc) => hex(pc)).join(', ')}`);
  console.log('');
  printRegisterPair('Entry regs', result.entryRegs);
  printRegisterPair('Final regs', result.finalRegs);
  console.log('');
  printMemoryEvents(result.ramReads, result.ramWrites);
}

function printCallerRun(scenario, result, effectiveCxMain) {
  const hitSubcall = (result.hits.get('subcall') ?? []).length > 0;
  const hitFilterRet = (result.hits.get('filter_ret') ?? []).length > 0;
  const hitFallthrough = (result.hits.get('after_subcall_fallthrough') ?? []).length > 0;
  const hitSecondCall = (result.hits.get('second_call') ?? []).length > 0;

  console.log('========================================================================');
  console.log(`${scenario.label}: ${scenario.note}`);
  console.log(
    `  Entry: PC=${hex(scenario.entry)} A=${hexByte(scenario.entryA)} D007E0=${hexByte(scenario.mode)} ` +
    `D00824=${hexByte(scenario.d00824)} cxMain=${hex(effectiveCxMain)} SP=${hex(ENTRY_SP)}`
  );
  console.log('========================================================================');
  console.log(
    `  Steps: ${result.executedSteps} | Stop: ${result.stopReason} | Final PC: ${hex(result.finalRegs.pc)} | ` +
    `Final A=${hexByte(result.finalA)} F=${hexByte(result.finalF)} [${formatFlags(result.finalF)}]`
  );
  if (result.error) console.log(`  Error: ${result.error}`);
  console.log(`  Hit 0x09D06B: ${hitSubcall}`);
  console.log(`  Hit 0x051AE9 (post-subcall branch site): ${(result.hits.get('after_subcall') ?? []).length > 0}`);
  console.log(`  Hit 0x051AEB (fell through after NZ from 0x09D06B): ${hitFallthrough}`);
  console.log(`  Hit 0x051B28 (filter return/Z path): ${hitFilterRet}`);
  console.log(`  Hit 0x088772 (next call after NZ): ${hitSecondCall}`);
  console.log(`  Unique blocks visited (${result.visitOrder.length}): ${result.visitOrder.map((pc) => hex(pc)).join(' -> ')}`);
  console.log('');
  printRegisterPair('Entry regs', result.entryRegs);
  printRegisterPair('Final regs', result.finalRegs);
  console.log('');
  printTargets('CALL destinations', result.callTargets);
  printTargets('JP/JR destinations', result.jumpTargets);
  console.log(`  Tail: ${result.tail.map((pc) => hex(pc)).join(' -> ')}`);
  console.log('');
}

function summarizeReport(warmSnapshot, directRuns, callerRuns) {
  const baselineDirect = directRuns[0];
  const directSignature = (run) => `${run.visitOrder.join(',')}|${run.finalF & 0xFF}`;
  const directModeIndependent = directRuns.every((run) => directSignature(run) === directSignature(baselineDirect));
  const directReadsMode = directRuns.some(
    (run) => run.ramReads.some((event) => event.addr === MODE_ADDR || event.addr === D00824_ADDR)
  );
  const aPreserved = directRuns.every((run, index) => run.finalA === DIRECT_SCENARIOS[index].entryA);

  const run4A = callerRuns.find((run) => run.label === 'RUN 4A');
  const run4B = callerRuns.find((run) => run.label === 'RUN 4B');
  const run4C = callerRuns.find((run) => run.label === 'RUN 4C');
  const run4D = callerRuns.find((run) => run.label === 'RUN 4D');
  const run4E = callerRuns.find((run) => run.label === 'RUN 4E');

  const run4CHitSubcall = (run4C?.hits.get('subcall') ?? []).length > 0;
  const run4CHitFilterRet = (run4C?.hits.get('filter_ret') ?? []).length > 0;
  const run4DHitFilterRet = (run4D?.hits.get('filter_ret') ?? []).length > 0;
  const run4EHitFilterRet = (run4E?.hits.get('filter_ret') ?? []).length > 0;

  console.log('========================================================================');
  console.log('REPORT');
  console.log('========================================================================');
  console.log(
    `- Warm post-init snapshot before seeding: cxMain=${hex(warmSnapshot.cxMain)} ` +
    `D007E0=${hexByte(warmSnapshot.mode)} D00824=${hexByte(warmSnapshot.d00824)}.`
  );
  console.log(
    `- Static disassembly shows 0x09D06B itself is only the pointer test at 0x09D06B..0x09D085: ` +
    `it compares cxMain (0xD007CA) against ${hex(CX_MAIN_MATCH_A)} and, if that fails, against ${hex(CX_MAIN_MATCH_B)}.`
  );
  console.log(
    `- The later D007E0 checks at 0x09D08C..0x09D0A1 belong to the separate entry 0x09D086, ` +
    `which first does "LD B,A / CALL 0x09D06B". 0x051ADC does not enter there; it calls 0x09D06B directly from ${hex(FILTER_SUBCALL_SITE)}.`
  );
  if (!directReadsMode) {
    console.log('- The direct 0x09D06B traces never read D007E0 or D00824; they only touch cxMain and the stack.');
  }
  if (directModeIndependent) {
    console.log(
      '- Changing the seeded mode byte between 0x00, 0x40, and 0x5B did not change 0x09D06B control flow or flags. ' +
      'That matches the static decode: 0x09D06B does not consult the mode byte at all.'
    );
  }
  if (aPreserved) {
    console.log('- 0x09D06B preserves A. It returns with A unchanged and with the compare flags from the cxMain pointer match.');
  }
  console.log(
    `- Return convention: Z=set when cxMain equals ${hex(CX_MAIN_MATCH_A)} or ${hex(CX_MAIN_MATCH_B)}; ` +
    'otherwise Z=clear.'
  );
  console.log(
    `- In 0x051ADC, the instruction immediately after the sub-call is "JR Z, ${hex(FILTER_RET_Z)}". ` +
    'So a Z result from 0x09D06B directly forces the filter-return path.'
  );
  if (run4A && run4B) {
    console.log(
      `- Baseline caller runs: mode 0x00 hit 0x09D06B=${(run4A.hits.get('subcall') ?? []).length > 0}, ` +
      `mode 0x40 hit 0x09D06B=${(run4B.hits.get('subcall') ?? []).length > 0}.`
    );
  }
  if (!run4CHitSubcall && run4CHitFilterRet) {
    console.log('- Mode 0x5B short-circuits inside 0x051ADC before the sub-call: it jumps straight to 0x051B28 and never enters 0x09D06B.');
  }
  if (run4DHitFilterRet && run4EHitFilterRet) {
    console.log(
      `- Forcing cxMain to ${hex(CX_MAIN_MATCH_A)} or ${hex(CX_MAIN_MATCH_B)} makes the caller take the 0x051B28 Z-path, ` +
      'which demonstrates the direct caller effect of the 0x09D06B return flags.'
    );
  }
  console.log('');
}

async function main() {
  console.log('Phase 244: Trace 0x09D06B (sub-call from 0x051ADC)');
  console.log('='.repeat(72));
  console.log('');

  printHexDump(DUMP_START, DUMP_LAST);
  printDisassembly(DUMP_START, DUMP_LAST);

  const runtime = createRuntime();
  const bootSummary = coldBoot(runtime.executor, runtime.cpu, runtime.mem);
  const bootMemory = new Uint8Array(runtime.mem);
  const bootCpuSnapshot = snapshotCpu(runtime.cpu);
  const warmSnapshot = {
    cxMain: read24(runtime.mem, CX_MAIN_ADDR),
    mode: runtime.mem[MODE_ADDR & MEM_MASK],
    d00824: runtime.mem[D00824_ADDR & MEM_MASK],
  };

  console.log('========================================================================');
  console.log('COLD BOOT');
  console.log('========================================================================');
  console.log(`  boot:   steps=${bootSummary.boot.steps}/${bootSummary.boot.termination}`);
  console.log(`  kernel: steps=${bootSummary.kernel.steps}/${bootSummary.kernel.termination}`);
  console.log(`  post:   steps=${bootSummary.post.steps}/${bootSummary.post.termination}`);
  console.log(
    `  warm snapshot: cxMain=${hex(warmSnapshot.cxMain)} D007E0=${hexByte(warmSnapshot.mode)} ` +
    `D00824=${hexByte(warmSnapshot.d00824)}`
  );
  console.log('');

  const directResults = [];
  for (const scenario of DIRECT_SCENARIOS) {
    runtime.mem.set(bootMemory);
    restoreCpu(runtime.cpu, bootCpuSnapshot);
    seedRunState(runtime.cpu, runtime.mem, scenario);
    const result = traceExecution(runtime.cpu, runtime.mem, DIRECT_BUDGET, {
      captureMemory: true,
    });
    const effectiveCxMain = scenario.cxMain !== undefined ? scenario.cxMain : read24(runtime.mem, CX_MAIN_ADDR);
    printDirectRun(scenario, result, effectiveCxMain);
    directResults.push({ label: scenario.label, ...result });
  }

  const watches = new Map([
    [TARGET_SUBCALL, 'subcall'],
    [FILTER_AFTER_SUBCALL, 'after_subcall'],
    [FILTER_FALLTHROUGH, 'after_subcall_fallthrough'],
    [FILTER_RET_Z, 'filter_ret'],
    [FILTER_SECOND_CALL, 'second_call'],
  ]);

  const callerResults = [];
  for (const scenario of CALLER_SCENARIOS) {
    runtime.mem.set(bootMemory);
    restoreCpu(runtime.cpu, bootCpuSnapshot);
    seedRunState(runtime.cpu, runtime.mem, scenario);
    const result = traceExecution(runtime.cpu, runtime.mem, CALLER_BUDGET, {
      captureControl: true,
      watches,
    });
    const effectiveCxMain = scenario.cxMain !== undefined ? scenario.cxMain : read24(runtime.mem, CX_MAIN_ADDR);
    printCallerRun(scenario, result, effectiveCxMain);
    callerResults.push({ label: scenario.label, ...result });
  }

  summarizeReport(warmSnapshot, directResults, callerResults);
  console.log('Phase 244 complete.');
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
