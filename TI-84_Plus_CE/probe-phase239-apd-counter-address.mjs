#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as cpuRuntime from './cpu-runtime.js';
import { createPeripheralBus as fallbackCreatePeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const {
  createCPU: runtimeCreateCPU,
  createMemoryBus: runtimeCreateMemoryBus,
  createPeripheralBus: runtimeCreatePeripheralBus,
  createExecutor,
} = cpuRuntime;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const transpiledModule = await import('./ROM.transpiled.js');
const BLOCKS =
  transpiledModule.PRELIFTED_BLOCKS ??
  transpiledModule.default?.PRELIFTED_BLOCKS ??
  transpiledModule.default ??
  null;

if (!BLOCKS || typeof BLOCKS !== 'object') {
  throw new Error('Unable to resolve PRELIFTED_BLOCKS from ROM.transpiled.js.');
}

const rom = fs.readFileSync(ROM_PATH);

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;

const KERNEL_INIT_ENTRY = 0x08C331;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_ENTRY = 0x0802B2;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_ENTRY = 0x09DEE0;
const MEM_INIT_RET = 0x7FFFF6;
const MEM_INIT_MAX_STEPS = 128;
const MAX_LOOP_ITERATIONS = 8192;

const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IY_BASE = 0xD00080;
const IX_BASE = 0xD1A860;

const APD_ENTRY = 0x03030E;
const COMPARE_HELPER = 0x04C979;
const SHORT_COUNTER_OFFSET = 0x0001;
const READ_WATCH_START = 0xD00000;
const READ_WATCH_END = 0xD00400;
const IY_SNAPSHOT_LEN = 0x60;
const TRACE_STEP_LIMIT = 400;

const APD_SUBROUTINES = new Map([
  [0x07F9FB, 'Copy9Bytes / Mov9ToOP1'],
  [0x08383D, 'ChkFindSym'],
  [0x03E141, 'APD-side handler'],
]);

const EXPERIMENTS = [
  { label: 'Experiment A', value: 0x0000, note: 'fresh boot' },
  { label: 'Experiment B', value: 0x7FFF, note: 'mid-range' },
  { label: 'Experiment C', value: 0xFFFD, note: 'near threshold' },
  { label: 'Experiment D', value: 0xFFFF, note: 'at max threshold' },
];

const STATIC_WINDOWS = [
  { title: 'APD compare chain at 0x03030E', addr: 0x03030E, count: 15 },
  { title: 'Compare helper at 0x04C979', addr: 0x04C979, count: 4 },
  { title: '0xFFFF branch at 0x030357', addr: 0x030357, count: 8 },
  { title: '0xFFFE branch at 0x0303BF', addr: 0x0303BF, count: 10 },
  { title: '0xFFFD branch at 0x030388', addr: 0x030388, count: 10 },
];

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

class MissingBlockError extends Error {
  constructor(pc, mode) {
    super(`missing block ${hex(pc)}:${mode}`);
    this.pc = pc & 0xFFFFFF;
    this.mode = mode;
  }
}

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function blockKey(addr, mode = 'adl') {
  return `${(addr >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function blockMethodName(addr, mode = 'adl') {
  return `block_${(addr >>> 0).toString(16).padStart(6, '0')}_${mode === 'adl' ? 1 : 0}`;
}

function effectiveShortAddr(offset, mbase) {
  return ((mbase << 16) | (offset & 0xFFFF)) & MEM_MASK;
}

function write24(mem, addr, value) {
  const a = addr & MEM_MASK;
  mem[a] = value & 0xFF;
  mem[(a + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(a + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }
}

function snapshotRange(mem, start, length) {
  return Uint8Array.from(mem.slice(start, start + length));
}

function diffByteArrays(before, after, baseAddr) {
  const changes = [];
  const length = Math.min(before.length, after.length);

  for (let index = 0; index < length; index++) {
    if (before[index] !== after[index]) {
      changes.push({
        addr: (baseAddr + index) & MEM_MASK,
        offset: index,
        before: before[index],
        after: after[index],
      });
    }
  }

  return changes;
}

function formatIndexed(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${String(indexRegister).toUpperCase()}${sign}${displacement})`;
}

function formatInstruction(inst) {
  if (!inst) return '(decode error)';

  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  let text = inst.tag;

  switch (inst.tag) {
    case 'ld-pair-imm':
      text = `ld ${inst.pair}, ${hex(inst.value)}`;
      break;
    case 'ld-pair-mem':
      text = inst.direction === 'to-mem'
        ? `ld (${hex(inst.addr)}), ${inst.pair}`
        : `ld ${inst.pair}, (${hex(inst.addr)})`;
      break;
    case 'ld-mem-pair':
      text = `ld (${hex(inst.addr)}), ${inst.pair}`;
      break;
    case 'ld-reg-imm':
      text = `ld ${inst.dest}, ${hexByte(inst.value)}`;
      break;
    case 'ld-reg-mem':
      text = `ld ${inst.dest}, (${hex(inst.addr)})`;
      break;
    case 'ld-mem-reg':
      text = `ld (${hex(inst.addr)}), ${inst.src}`;
      break;
    case 'ld-reg-reg':
      text = `ld ${inst.dest}, ${inst.src}`;
      break;
    case 'ld-reg-ind':
      text = `ld ${inst.dest}, (${inst.src})`;
      break;
    case 'ld-ind-reg':
      text = `ld (${inst.dest}), ${inst.src}`;
      break;
    case 'call':
      text = `call ${hex(inst.target)}`;
      break;
    case 'call-conditional':
      text = `call ${inst.condition}, ${hex(inst.target)}`;
      break;
    case 'jp':
      text = `jp ${hex(inst.target)}`;
      break;
    case 'jp-conditional':
      text = `jp ${inst.condition}, ${hex(inst.target)}`;
      break;
    case 'jr':
      text = `jr ${hex(inst.target)}`;
      break;
    case 'jr-conditional':
      text = `jr ${inst.condition}, ${hex(inst.target)}`;
      break;
    case 'ret':
      text = 'ret';
      break;
    case 'ret-conditional':
      text = `ret ${inst.condition}`;
      break;
    case 'push':
      text = `push ${inst.pair}`;
      break;
    case 'pop':
      text = `pop ${inst.pair}`;
      break;
    case 'alu-reg':
      text = `${inst.op} ${inst.src}`;
      break;
    case 'alu-imm':
      text = `${inst.op} ${hexByte(inst.value)}`;
      break;
    case 'adc-pair':
      text = `adc hl, ${inst.src}`;
      break;
    case 'sbc-pair':
      text = `sbc hl, ${inst.src}`;
      break;
    case 'add-pair':
      text = `add ${inst.dest}, ${inst.src}`;
      break;
    case 'inc-pair':
      text = `inc ${inst.pair}`;
      break;
    case 'dec-pair':
      text = `dec ${inst.pair}`;
      break;
    case 'inc-reg':
      text = `inc ${inst.reg}`;
      break;
    case 'dec-reg':
      text = `dec ${inst.reg}`;
      break;
    case 'indexed-cb-bit':
      text = `bit ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
      break;
    case 'indexed-cb-res':
      text = `res ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
      break;
    case 'indexed-cb-set':
      text = `set ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
      break;
    case 'ex-de-hl':
      text = 'ex de, hl';
      break;
    case 'nop':
      text = 'nop';
      break;
    case 'di':
      text = 'di';
      break;
    case 'ei':
      text = 'ei';
      break;
    case 'halt':
      text = 'halt';
      break;
    default: {
      const detail = [];
      for (const [key, value] of Object.entries(inst)) {
        if ([
          'pc', 'length', 'nextPc', 'tag', 'mode', 'modePrefix', 'terminates',
          'fallthrough', 'targetMode', 'direction',
        ].includes(key)) {
          continue;
        }
        detail.push(`${key}=${typeof value === 'number' ? hex(value) : value}`);
      }
      text = detail.length > 0 ? `${inst.tag} ${detail.join(' ')}` : inst.tag;
      break;
    }
  }

  return `${prefix}${text}`;
}

function decodeRow(pc, mode = 'adl') {
  const inst = decodeInstruction(rom, pc, mode);
  const bytes = Array.from(rom.slice(pc, pc + inst.length), (value) => hexByte(value)).join(' ');
  return {
    pc,
    bytes,
    text: formatInstruction(inst),
    length: inst.length,
  };
}

function disassembleCount(addr, count, mode = 'adl') {
  const rows = [];
  let pc = addr;

  for (let index = 0; index < count; index++) {
    const row = decodeRow(pc, mode);
    rows.push(row);
    pc += row.length;
  }

  return rows;
}

function printRows(title, rows) {
  console.log(`--- ${title} ---`);
  for (const row of rows) {
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(28)} ${row.text}`);
  }
  console.log('');
}

function createPeripheralBusCompat(options) {
  if (typeof runtimeCreatePeripheralBus === 'function') {
    return runtimeCreatePeripheralBus(options);
  }
  return fallbackCreatePeripheralBus(options);
}

function createMemoryBusCompat(romBytes, peripherals) {
  if (typeof runtimeCreateMemoryBus === 'function') {
    const created = runtimeCreateMemoryBus(romBytes, peripherals);
    if (ArrayBuffer.isView(created) && typeof created.set === 'function') {
      return created;
    }
  }

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(mem.length, romBytes.length)));
  return mem;
}

function createCpuCompat(mem, peripherals) {
  if (typeof runtimeCreateCPU === 'function') {
    const created = runtimeCreateCPU(mem, peripherals);
    if (created?.cpu && created?.executor?.compiledBlocks) {
      return { cpu: created.cpu, executor: created.executor };
    }
  }

  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { cpu: executor.cpu, executor };
}

function createRuntime() {
  const peripherals = createPeripheralBusCompat({ pllDelay: 2, timerInterrupt: false });
  const mem = createMemoryBusCompat(rom, peripherals);
  const { cpu, executor } = createCpuCompat(mem, peripherals);
  return { peripherals, mem, cpu, executor };
}

function createRuntimeFromBaseline(baseline) {
  const peripherals = createPeripheralBusCompat({ pllDelay: 2, timerInterrupt: false });
  const mem = new Uint8Array(baseline.mem);
  const { cpu, executor } = createCpuCompat(mem, peripherals);
  restoreCpu(cpu, baseline.cpu);
  installStepShim(cpu, executor);
  return { peripherals, mem, cpu, executor };
}

function installStepShim(cpu, executor) {
  if (!executor?.compiledBlocks) {
    throw new Error('Executor compiledBlocks are required for cpu.step() tracing.');
  }

  cpu.step = function step() {
    const mode = this.madl ? 'adl' : 'z80';
    const pc = this.pc & 0xFFFFFF;
    const key = blockKey(pc, mode);
    const method = blockMethodName(pc, mode);

    if (typeof this[method] !== 'function') {
      const fn = executor.compiledBlocks[key];
      if (typeof fn === 'function') {
        this[method] = fn;
      }
    }

    const fn = this[method];
    if (typeof fn !== 'function') {
      throw new MissingBlockError(pc, mode);
    }

    const result = fn(this);
    if (typeof result !== 'number') {
      throw new Error(`Unexpected step result from ${hex(pc)}: ${String(result)}`);
    }

    if (result >= 0) {
      this.pc = result & 0xFFFFFF;
    }

    return result;
  };
}

function prepareCallState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
  cpu._ix = IX_BASE;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
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

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: 32,
  });
}

function runMemInit(executor, cpu, mem) {
  prepareCallState(cpu, mem);
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, MEM_INIT_RET);

  let lastPc = MEM_INIT_ENTRY;
  let steps = 0;

  try {
    const result = executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: MEM_INIT_MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pc, _mode, _meta, step) {
        lastPc = pc & 0xFFFFFF;
        steps = Math.max(steps, step + 1);
        if (lastPc === MEM_INIT_RET) throw new Error('__MEMINIT_RET__');
      },
      onMissingBlock(pc, _mode, step) {
        lastPc = pc & 0xFFFFFF;
        steps = Math.max(steps, step + 1);
        if (lastPc === MEM_INIT_RET) throw new Error('__MEMINIT_RET__');
      },
    });

    lastPc = result.lastPc ?? lastPc;
    steps = Math.max(steps, result.steps ?? 0);
    return {
      ok: false,
      steps,
      lastPc,
      termination: result.termination ?? 'unknown',
    };
  } catch (error) {
    if (error?.message === '__MEMINIT_RET__') {
      return {
        ok: true,
        steps,
        lastPc,
        termination: 'return_hit',
      };
    }
    throw error;
  }
}

function buildBaseline() {
  const runtime = createRuntime();
  const { mem, cpu, executor } = runtime;

  coldBoot(executor, cpu, mem);
  const memInit = runMemInit(executor, cpu, mem);

  if (!memInit.ok) {
    throw new Error(`MEM_INIT did not return cleanly (termination=${memInit.termination}, lastPc=${hex(memInit.lastPc)})`);
  }

  installStepShim(cpu, executor);

  return {
    mem: new Uint8Array(mem),
    cpu: snapshotCpu(cpu),
    memInit,
    mbase: cpu.mbase & 0xFF,
  };
}

function resetExperimentCpu(cpu, mem, entryAddr) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.pc = entryAddr & 0xFFFFFF;
  cpu.sp = (STACK_TOP - 0x40) & 0xFFFFFF;
  cpu.ix = IX_BASE;
  cpu.iy = IY_BASE;
  cpu.a = 0x00;
  cpu.f = 0x40;
  cpu.bc = 0x000000;
  cpu.de = 0x000000;
  cpu.hl = 0x000000;
  cpu.cycles = 0;

  mem.fill(0xFF, cpu.sp, cpu.sp + 0x40);
}

function installReadWatch(cpu, start, end, maxEvents = 48) {
  const counts = new Map();
  const events = [];

  const originals = {
    read8: cpu.read8.bind(cpu),
    read16: cpu.read16.bind(cpu),
    read24: cpu.read24.bind(cpu),
  };

  const record = (kind, addr, size, value) => {
    const base = addr & MEM_MASK;
    let overlaps = false;

    for (let index = 0; index < size; index++) {
      const byteAddr = (base + index) & MEM_MASK;
      if (byteAddr >= start && byteAddr < end) {
        overlaps = true;
        counts.set(byteAddr, (counts.get(byteAddr) || 0) + 1);
      }
    }

    if (overlaps && events.length < maxEvents) {
      events.push({ kind, addr: base, size, value });
    }
  };

  cpu.read8 = (addr) => {
    const value = originals.read8(addr);
    record('read8', addr, 1, value);
    return value;
  };

  cpu.read16 = (addr) => {
    const value = originals.read16(addr);
    record('read16', addr, 2, value);
    return value;
  };

  cpu.read24 = (addr) => {
    const value = originals.read24(addr);
    record('read24', addr, 3, value);
    return value;
  };

  return {
    counts,
    events,
    restore() {
      cpu.read8 = originals.read8;
      cpu.read16 = originals.read16;
      cpu.read24 = originals.read24;
    },
  };
}

function stopReasonForPc(pc, step) {
  if (step <= 0) return null;
  if (pc === 0x02FE73) return 'reached 0x02FE73 tail';
  if (pc === 0x02FCB3) return 'reached 0x02FCB3 warning tail';
  if (pc === 0x02FD99) return 'reached 0x02FD99 event-loop entry';
  return null;
}

function classifyPath(sequence) {
  const seen = new Set(sequence.map((item) => item.pc));

  if (seen.has(0x030357)) return 'threshold hit: counter == 0xFFFF -> 0x030357';
  if (seen.has(0x0303BF)) return 'threshold hit: counter == 0xFFFE -> 0x0303BF';
  if (seen.has(0x030388)) return 'threshold hit: counter == 0xFFFD -> 0x030388';
  if (seen.has(0x03033B)) return 'below thresholds: nonzero high-byte swap path';
  if (seen.has(0x03034F)) return 'below thresholds: zero high-byte fast path';
  return 'unclassified path';
}

function summarizeReadCounts(counts) {
  return [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([addr, count]) => ({ addr, count }));
}

function formatReadCounts(summary) {
  if (!summary.length) return 'none';
  return summary.map((item) => `${hex(item.addr)} x${item.count}`).join(', ');
}

function formatReadEvents(events) {
  if (!events.length) return 'none';
  return events
    .map((event) => `${event.kind}@${hex(event.addr)} size=${event.size} value=${hex(event.value, Math.max(2, event.size * 2))}`)
    .join(' | ');
}

function formatIyChanges(changes) {
  if (!changes.length) return 'none';
  return changes
    .map((change) => `IY+${change.offset}:${hexByte(change.before)}->${hexByte(change.after)}`)
    .join(', ');
}

function formatSubroutineHits(hits) {
  if (!hits.length) return 'none';
  return hits.map((hit) => `${hex(hit.addr)} (${hit.name})`).join(', ');
}

function formatBlockSequence(sequence, limit = 48) {
  if (!sequence.length) return 'none';
  const head = sequence.slice(0, limit).map((item) => `${hex(item.pc)}:${item.mode}`);
  if (sequence.length > limit) {
    head.push(`... (+${sequence.length - limit} more)`);
  }
  return head.join(' -> ');
}

function traceExperiment(baseline, experiment) {
  const runtime = createRuntimeFromBaseline(baseline);
  const { mem, cpu } = runtime;

  const counterAddr = effectiveShortAddr(SHORT_COUNTER_OFFSET, baseline.mbase);

  resetExperimentCpu(cpu, mem, APD_ENTRY);
  mem[counterAddr] = experiment.value & 0xFF;
  mem[(counterAddr + 1) & MEM_MASK] = (experiment.value >>> 8) & 0xFF;

  const iyBefore = snapshotRange(mem, IY_BASE, IY_SNAPSHOT_LEN);
  const readWatch = installReadWatch(cpu, READ_WATCH_START, READ_WATCH_END);

  const blockSequence = [];
  const subroutineHits = [];
  const subHitSet = new Set();

  let stopReason = 'step limit';
  let finalPc = cpu.pc & 0xFFFFFF;

  try {
    for (let step = 0; step < TRACE_STEP_LIMIT; step++) {
      const pc = cpu.pc & 0xFFFFFF;
      const mode = cpu.madl ? 'adl' : 'z80';
      finalPc = pc;

      blockSequence.push({ pc, mode });

      if (APD_SUBROUTINES.has(pc) && !subHitSet.has(pc)) {
        subHitSet.add(pc);
        subroutineHits.push({ addr: pc, name: APD_SUBROUTINES.get(pc) });
      }

      const externalStop = stopReasonForPc(pc, step);
      if (externalStop) {
        stopReason = externalStop;
        break;
      }

      const result = cpu.step();
      if (result < 0) {
        stopReason = result === -1 ? 'halt' : 'sleep';
        break;
      }
    }
  } catch (error) {
    if (error instanceof MissingBlockError) {
      stopReason = `missing block ${hex(error.pc)}:${error.mode}`;
    } else {
      stopReason = `exception ${error?.message ?? String(error)}`;
    }
  } finally {
    readWatch.restore();
  }

  const iyAfter = snapshotRange(mem, IY_BASE, IY_SNAPSHOT_LEN);

  return {
    label: experiment.label,
    note: experiment.note,
    value: experiment.value,
    counterAddr,
    stopReason,
    finalPc,
    pathSummary: classifyPath(blockSequence),
    blockSequence,
    readCounts: summarizeReadCounts(readWatch.counts),
    readEvents: readWatch.events,
    iyChanges: diffByteArrays(iyBefore, iyAfter, IY_BASE),
    subroutineHits,
  };
}

function extractTranspiledReadLine() {
  const source = BLOCKS['03030e:adl']?.source ?? '';
  return source
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.includes('cpu.read16')) ?? 'n/a';
}

function printStaticAnalysis(baselineMbase) {
  console.log('========================================================================');
  console.log('STATIC ANALYSIS');
  console.log('========================================================================');
  console.log('');

  for (const window of STATIC_WINDOWS) {
    printRows(window.title, disassembleCount(window.addr, window.count));
  }

  const effectiveAddr = effectiveShortAddr(SHORT_COUNTER_OFFSET, baselineMbase);
  const transpiledReadLine = extractTranspiledReadLine();

  console.log('Counter source proof:');
  console.log(`  ROM disassembly: ${hex(APD_ENTRY)} begins with "sis ld hl, (0x000001)".`);
  console.log(`  Transpiled block: ${transpiledReadLine}`);
  console.log(`  Baseline MBASE: ${hex(baselineMbase, 2)}`);
  console.log(`  Effective APD counter word: ${hex(effectiveAddr)} low byte, ${hex(effectiveAddr + 1)} high byte.`);
  console.log('');

  console.log('Comparison chain:');
  console.log(`  ${hex(APD_ENTRY)} loads HL from short RAM offset ${hex(SHORT_COUNTER_OFFSET, 4)}.`);
  console.log(`  ${hex(0x030312)} seeds DE = 0xFFFF.`);
  console.log(`  ${hex(COMPARE_HELPER)} preserves HL and does "or a; sbc hl, de; ret", so Z reflects HL == DE.`);
  console.log(`  ${hex(0x03031A)} branches to ${hex(0x030357)} when counter == 0xFFFF.`);
  console.log(`  ${hex(0x030321)} branches to ${hex(0x0303BF)} when counter == 0xFFFE.`);
  console.log(`  ${hex(0x03032A)} branches to ${hex(0x030388)} when counter == 0xFFFD.`);
  console.log(`  Otherwise control falls through to ${hex(0x03032C)} and rereads ${hex(effectiveAddr)} / ${hex(effectiveAddr + 1)} bytewise.`);
  console.log('');
}

function printExperiment(trace) {
  console.log(`--- ${trace.label}: counter=${hex(trace.value, 4)} (${trace.note}) ---`);
  console.log(`  Path: ${trace.pathSummary}`);
  console.log(`  Stop: ${trace.stopReason}`);
  console.log(`  Final PC: ${hex(trace.finalPc)}`);
  console.log(`  Blocks visited: ${formatBlockSequence(trace.blockSequence)}`);
  console.log(`  Read addresses (${hex(READ_WATCH_START)}-${hex(READ_WATCH_END - 1)}): ${formatReadCounts(trace.readCounts)}`);
  console.log(`  First read events: ${formatReadEvents(trace.readEvents)}`);
  console.log(`  IY changes: ${formatIyChanges(trace.iyChanges)}`);
  console.log(`  APD subroutines: ${formatSubroutineHits(trace.subroutineHits)}`);
  console.log('');
}

function printConclusion(baselineMbase, traces) {
  const effectiveAddr = effectiveShortAddr(SHORT_COUNTER_OFFSET, baselineMbase);
  const firstReads = traces
    .map((trace) => trace.readEvents[0])
    .filter(Boolean)
    .map((event) => `${event.kind}@${hex(event.addr)}=${hex(event.value, Math.max(2, event.size * 2))}`);

  console.log('========================================================================');
  console.log('CONCLUSION');
  console.log('========================================================================');
  console.log('');
  console.log(`APD idle counter address: ${hex(effectiveAddr)}-${hex(effectiveAddr + 1)} (little-endian 16-bit short-RAM word at offset ${hex(SHORT_COUNTER_OFFSET, 4)}).`);
  console.log(`Static proof: 0x03030E executes "sis ld hl, (0x000001)", and the transpiled runtime resolves that as "cpu.read16(((cpu.mbase << 16) | 0x0001))".`);
  console.log(`Dynamic proof: every experiment starts with ${firstReads.join(', ')}, and changing that word selects the 0xFFFF / 0xFFFD / below-threshold branches.`);
  console.log(`The 0xFFFE branch still exists statically at ${hex(0x0303BF)} even though the requested dynamic matrix only seeds 0x0000, 0x7FFF, 0xFFFD, and 0xFFFF.`);
  console.log('');
}

async function main() {
  console.log('Phase 239: APD counter address probe');
  console.log(`ROM: ${path.basename(ROM_PATH)} (${rom.length} bytes)`);
  console.log('Timer interrupt: disabled');
  console.log('');

  const baseline = buildBaseline();
  console.log(`Baseline: cold boot -> kernelInit -> postInit -> MEM_INIT completed; MBASE=${hex(baseline.mbase, 2)}.`);
  console.log('');

  printStaticAnalysis(baseline.mbase);

  console.log('========================================================================');
  console.log('DYNAMIC EXPERIMENTS');
  console.log('========================================================================');
  console.log('');

  const traces = EXPERIMENTS.map((experiment) => traceExperiment(baseline, experiment));
  for (const trace of traces) {
    printExperiment(trace);
  }

  printConclusion(baseline.mbase, traces);
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
