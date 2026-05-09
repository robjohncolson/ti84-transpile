#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;
const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xE00000;

const BOOT_ENTRY = 0x000000;
const REQUESTED_KERNEL_INIT_ENTRY = 0x000280;
const FALLBACK_KERNEL_INIT_ENTRY = 0x020028;
const TARGET_ENTRY = 0x09F736;
const STATIC_INSTRUCTION_COUNT = 48;
const TRACE_STEPS = 500;

const STACK_TOP = 0xD1A87E;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;
const MBASE = 0xD0;
const TRACE_RETURN_SENTINEL = 0x7FFFFE;

const D3FF_RANGE_START = 0xD3FF00;
const D3FF_RANGE_END = 0xD3FFFF;

const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_MAX_STEPS = 5000;
const KERNEL_INIT_MAX_LOOP_ITERATIONS = 10000;

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles', 'pc',
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

function signed(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function blockKey(pc, mode) {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function bytesAt(buffer, addr, length) {
  const bytes = [];
  for (let index = 0; index < length; index += 1) {
    bytes.push(hexByte(buffer[(addr + index) & MEM_MASK]));
  }
  return bytes.join(' ');
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null, source: 'js' };
  }

  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase273-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath, source: 'gz' };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) {
    return;
  }
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

async function loadBlocks() {
  const assets = ensureTranspiledModule();
  try {
    const romModule = await import(pathToFileURL(assets.modulePath).href);
    const rawBlocks =
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      romModule;
    const blocks = normalizeBlocks(rawBlocks);
    if (!blocks || typeof blocks !== 'object' || Object.keys(blocks).length === 0) {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS from transpiled ROM module.');
    }
    return { blocks, assets };
  } catch (error) {
    cleanupTranspiledModule(assets);
    throw error;
  }
}

function createRuntime(rom, blocks) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  return { mem, peripherals, executor, cpu: executor.cpu };
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_SNAPSHOT_FIELDS) {
    cpu[field] = snapshot[field];
  }
}

function snapshotBootState(cpu, mem) {
  return {
    cpu: snapshotCpu(cpu),
    ram: new Uint8Array(mem.slice(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END)),
  };
}

function restoreBootState(cpu, mem, snapshot) {
  mem.set(snapshot.ram, RAM_SNAPSHOT_START);
  restoreCpu(cpu, snapshot.cpu);
}

function resolveKernelInitEntry(blocks) {
  if (blocks[blockKey(REQUESTED_KERNEL_INIT_ENTRY, 'adl')]) {
    return {
      requested: REQUESTED_KERNEL_INIT_ENTRY,
      resolved: REQUESTED_KERNEL_INIT_ENTRY,
      note: 'lifted block exists at requested 0x000280',
    };
  }

  if (blocks[blockKey(FALLBACK_KERNEL_INIT_ENTRY, 'adl')]) {
    return {
      requested: REQUESTED_KERNEL_INIT_ENTRY,
      resolved: FALLBACK_KERNEL_INIT_ENTRY,
      note: 'no lifted 0x000280:adl block; using lifted 0x020028:adl kernel-init entry',
    };
  }

  return {
    requested: REQUESTED_KERNEL_INIT_ENTRY,
    resolved: null,
    note: 'no lifted block found for either 0x000280:adl or 0x020028:adl',
  };
}

function coldBootAndKernelInit(runtime, kernelInfo) {
  const { cpu, mem, executor } = runtime;

  cpu.pc = BOOT_ENTRY;
  cpu.sp = STACK_TOP;
  cpu.ix = IX_BASE;
  cpu.iy = IY_BASE;
  cpu.mbase = MBASE;
  cpu.madl = 0;

  const coldBoot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  let kernelInit = null;
  if (kernelInfo.resolved !== null) {
    kernelInit = executor.runFrom(kernelInfo.resolved, 'adl', {
      maxSteps: KERNEL_INIT_MAX_STEPS,
      maxLoopIterations: KERNEL_INIT_MAX_LOOP_ITERATIONS,
    });
  }

  return { coldBoot, kernelInit };
}

function resolveImmediateMemoryAddress(inst) {
  if (!Number.isInteger(inst?.addr)) {
    return null;
  }
  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') {
    return ((MBASE << 16) | (inst.addr & 0xFFFF)) >>> 0;
  }
  return inst.addr >>> 0;
}

function fallbackMnemonic(inst) {
  const ignored = new Set([
    'pc',
    'length',
    'nextPc',
    'mode',
    'modePrefix',
    'terminates',
    'fallthrough',
    'kind',
    'nextMode',
    'tag',
  ]);
  const parts = [];
  for (const [key, value] of Object.entries(inst)) {
    if (ignored.has(key) || value === undefined || value === null) {
      continue;
    }
    if (typeof value === 'number') {
      parts.push(`${key}=${hex(value)}`);
    } else {
      parts.push(`${key}=${value}`);
    }
  }
  return parts.length > 0 ? `${inst.tag} ${parts.join(', ')}` : inst.tag;
}

function formatInstruction(inst) {
  if (!inst) {
    return 'decode-error';
  }

  if (inst.tag === 'decode-error') {
    return `db ${hexByte(inst.byte)} ; ${inst.error}`;
  }

  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  const addr = resolveImmediateMemoryAddress(inst);
  const indexed = (register, displacement) => `(${register}${signed(displacement)})`;

  switch (inst.tag) {
    case 'nop': return `${prefix}nop`;
    case 'di': return `${prefix}di`;
    case 'ei': return `${prefix}ei`;
    case 'halt': return `${prefix}halt`;
    case 'slp': return `${prefix}slp`;
    case 'ret': return `${prefix}ret`;
    case 'ret-conditional': return `${prefix}ret ${inst.condition}`;
    case 'reti': return `${prefix}reti`;
    case 'retn': return `${prefix}retn`;
    case 'call': return `${prefix}call ${hex(inst.target)}`;
    case 'call-conditional': return `${prefix}call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp': return `${prefix}jp ${hex(inst.target)}`;
    case 'jp-conditional': return `${prefix}jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${prefix}jp (${inst.indirectRegister})`;
    case 'jr': return `${prefix}jr ${hex(inst.target)}`;
    case 'jr-conditional': return `${prefix}jr ${inst.condition}, ${hex(inst.target)}`;
    case 'djnz': return `${prefix}djnz ${hex(inst.target)}`;
    case 'push': return `${prefix}push ${inst.pair}`;
    case 'pop': return `${prefix}pop ${inst.pair}`;
    case 'inc-pair': return `${prefix}inc ${inst.pair}`;
    case 'dec-pair': return `${prefix}dec ${inst.pair}`;
    case 'inc-reg': return `${prefix}inc ${inst.reg}`;
    case 'dec-reg': return `${prefix}dec ${inst.reg}`;
    case 'add-pair': return `${prefix}add ${inst.dest}, ${inst.src}`;
    case 'adc-pair': return `${prefix}adc hl, ${inst.src}`;
    case 'sbc-pair': return `${prefix}sbc hl, ${inst.src}`;
    case 'alu-reg':
      if (inst.op === 'sub' || inst.op === 'and' || inst.op === 'xor' || inst.op === 'or' || inst.op === 'cp') {
        return `${prefix}${inst.op} ${inst.src}`;
      }
      return `${prefix}${inst.op} a, ${inst.src}`;
    case 'alu-imm':
      if (inst.op === 'sub' || inst.op === 'and' || inst.op === 'xor' || inst.op === 'or' || inst.op === 'cp') {
        return `${prefix}${inst.op} ${hexByte(inst.value)}`;
      }
      return `${prefix}${inst.op} a, ${hexByte(inst.value)}`;
    case 'ld-pair-imm': return `${prefix}ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `${prefix}ld (${hex(addr ?? inst.addr)}), ${inst.pair}`
        : `${prefix}ld ${inst.pair}, (${hex(addr ?? inst.addr)})`;
    case 'ld-mem-pair': return `${prefix}ld (${hex(addr ?? inst.addr)}), ${inst.pair}`;
    case 'ld-reg-imm': return `${prefix}ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `${prefix}ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind': return `${prefix}ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `${prefix}ld (${inst.dest}), ${inst.src}`;
    case 'ld-reg-mem': return `${prefix}ld ${inst.dest}, (${hex(addr ?? inst.addr)})`;
    case 'ld-mem-reg': return `${prefix}ld (${hex(addr ?? inst.addr)}), ${inst.src}`;
    case 'ld-ind-imm': return `${prefix}ld (hl), ${hexByte(inst.value)}`;
    case 'ld-reg-ixd': return `${prefix}ld ${inst.dest}, ${indexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg': return `${prefix}ld ${indexed(inst.indexRegister, inst.displacement)}, ${inst.src}`;
    case 'ld-ixd-imm': return `${prefix}ld ${indexed(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}`;
    case 'ld-pair-indexed': return `${prefix}ld ${inst.pair}, ${indexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair': return `${prefix}ld ${indexed(inst.indexRegister, inst.displacement)}, ${inst.pair}`;
    case 'ld-ixiy-indexed': return `${prefix}ld ${inst.dest}, ${indexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-ixiy': return `${prefix}ld ${indexed(inst.indexRegister, inst.displacement)}, ${inst.src}`;
    case 'ld-pair-ind': return `${prefix}ld ${inst.pair}, (${inst.src})`;
    case 'ld-ind-pair': return `${prefix}ld (${inst.dest}), ${inst.pair}`;
    case 'ld-sp-hl': return `${prefix}ld sp, hl`;
    case 'ld-sp-pair': return `${prefix}ld sp, ${inst.pair}`;
    case 'ld-special': return `${prefix}ld ${inst.dest}, ${inst.src}`;
    case 'ld-mb-a': return `${prefix}ld mb, a`;
    case 'ld-a-mb': return `${prefix}ld a, mb`;
    case 'bit-test': return `${prefix}bit ${inst.bit}, ${inst.reg}`;
    case 'bit-res': return `${prefix}res ${inst.bit}, ${inst.reg}`;
    case 'bit-set': return `${prefix}set ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind': return `${prefix}bit ${inst.bit}, (${inst.indirectRegister})`;
    case 'bit-res-ind': return `${prefix}res ${inst.bit}, (${inst.indirectRegister})`;
    case 'bit-set-ind': return `${prefix}set ${inst.bit}, (${inst.indirectRegister})`;
    case 'indexed-cb-bit': return `${prefix}bit ${inst.bit}, ${indexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res': return `${prefix}res ${inst.bit}, ${indexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set': return `${prefix}set ${inst.bit}, ${indexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-rotate': return `${prefix}${inst.operation} ${indexed(inst.indexRegister, inst.displacement)}`;
    case 'rotate-reg': return `${prefix}${inst.op} ${inst.reg}`;
    case 'rotate-ind': return `${prefix}${inst.op} (${inst.indirectRegister})`;
    case 'rlca': return `${prefix}rlca`;
    case 'rrca': return `${prefix}rrca`;
    case 'rla': return `${prefix}rla`;
    case 'rra': return `${prefix}rra`;
    case 'ldi': return `${prefix}ldi`;
    case 'ldir': return `${prefix}ldir`;
    case 'ldd': return `${prefix}ldd`;
    case 'lddr': return `${prefix}lddr`;
    case 'cpi': return `${prefix}cpi`;
    case 'cpir': return `${prefix}cpir`;
    case 'cpd': return `${prefix}cpd`;
    case 'cpdr': return `${prefix}cpdr`;
    case 'rst': return `${prefix}rst ${hex(inst.target, 2)}`;
    case 'neg': return `${prefix}neg`;
    case 'scf': return `${prefix}scf`;
    case 'ccf': return `${prefix}ccf`;
    case 'cpl': return `${prefix}cpl`;
    case 'daa': return `${prefix}daa`;
    case 'ex-af': return `${prefix}ex af, af'`;
    case 'ex-de-hl': return `${prefix}ex de, hl`;
    case 'exx': return `${prefix}exx`;
    case 'ex-sp-hl': return `${prefix}ex (sp), hl`;
    case 'ex-sp-pair': return `${prefix}ex (sp), ${inst.pair}`;
    case 'im': return `${prefix}im ${inst.value}`;
    case 'rrd': return `${prefix}rrd`;
    case 'rld': return `${prefix}rld`;
    case 'mlt': return `${prefix}mlt ${inst.reg}`;
    case 'lea': return `${prefix}lea ${inst.dest}, ${indexed(inst.base, inst.displacement)}`;
    case 'tst-reg': return `${prefix}tst a, ${inst.reg}`;
    case 'tst-ind': return `${prefix}tst a, (hl)`;
    case 'tst-imm': return `${prefix}tst a, ${hexByte(inst.value)}`;
    case 'tstio': return `${prefix}tstio ${hexByte(inst.value)}`;
    case 'stmix': return `${prefix}stmix`;
    case 'rsmix': return `${prefix}rsmix`;
    default: return `${prefix}${fallbackMnemonic(inst)}`;
  }
}

function decodeSafe(buffer, pc, mode = 'adl') {
  try {
    return decodeInstruction(buffer, pc & MEM_MASK, mode);
  } catch (error) {
    return {
      pc: pc & MEM_MASK,
      length: 1,
      tag: 'decode-error',
      byte: buffer[pc & MEM_MASK] ?? 0,
      error: error?.message ?? String(error),
    };
  }
}

function decodeLinearInstructions(buffer, startAddr, count, mode = 'adl') {
  const rows = [];
  let pc = startAddr & MEM_MASK;

  while (rows.length < count) {
    const inst = decodeSafe(buffer, pc, mode);
    const length = Math.max(inst.length ?? 1, 1);
    rows.push({
      pc,
      bytes: bytesAt(buffer, pc, length),
      text: formatInstruction(inst),
      inst,
    });
    pc = (pc + length) & MEM_MASK;
  }

  return rows;
}

function collectStaticCalls(rows) {
  return rows
    .filter((row) => row.inst?.tag === 'call' || row.inst?.tag === 'call-conditional')
    .map((row) => ({
      pc: row.pc,
      conditional: row.inst.tag === 'call-conditional',
      condition: row.inst.condition ?? null,
      target: row.inst.target ?? null,
      text: row.text,
    }));
}

function collectStaticBranches(rows) {
  const branchTags = new Set(['jp', 'jp-conditional', 'jr', 'jr-conditional', 'djnz', 'ret-conditional']);
  return rows
    .filter((row) => branchTags.has(row.inst?.tag))
    .map((row) => ({
      pc: row.pc,
      tag: row.inst.tag,
      target: Number.isInteger(row.inst.target) ? (row.inst.target & 0xFFFFFF) : null,
      isLoop: Number.isInteger(row.inst.target) ? ((row.inst.target & 0xFFFFFF) < (row.pc & 0xFFFFFF)) : false,
      text: row.text,
    }));
}

function collectStaticD3ffRefs(rows) {
  const refs = [];

  for (const row of rows) {
    const addr = resolveImmediateMemoryAddress(row.inst);
    if (addr === null) {
      continue;
    }
    if (addr < D3FF_RANGE_START || addr > D3FF_RANGE_END) {
      continue;
    }
    refs.push({
      pc: row.pc,
      addr,
      text: row.text,
    });
  }

  return refs;
}

function resolveNextMode(meta, returnedPc, currentMode) {
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

function extractCallTargets(meta, blockPc, step) {
  const calls = [];
  for (const inst of meta?.instructions ?? []) {
    if (inst?.tag !== 'call' && inst?.tag !== 'call-conditional') {
      continue;
    }
    calls.push({
      step,
      blockPc,
      instPc: inst.pc & 0xFFFFFF,
      target: (inst.target ?? 0) & 0xFFFFFF,
      conditional: inst.tag === 'call-conditional',
      condition: inst.condition ?? null,
      dasm: inst.dasm ?? '',
    });
  }
  return calls;
}

function installD3ffWriteWatcher(cpu, mem) {
  const writes = [];
  let currentStep = 0;
  let currentPc = 0;
  let currentMode = 'adl';

  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  function record(kind, startAddr, width, value) {
    for (let offset = 0; offset < width; offset += 1) {
      const addr = (startAddr + offset) & 0xFFFFFF;
      if (addr < D3FF_RANGE_START || addr > D3FF_RANGE_END) {
        continue;
      }
      writes.push({
        step: currentStep,
        pc: currentPc,
        mode: currentMode,
        kind,
        startAddr: startAddr & 0xFFFFFF,
        addr,
        oldValue: mem[addr & MEM_MASK] & 0xFF,
        newValue: (value >>> (offset * 8)) & 0xFF,
      });
    }
  }

  cpu.write8 = (addr, value) => {
    record('write8', addr, 1, value & 0xFF);
    return originalWrite8(addr, value);
  };

  cpu.write16 = (addr, value) => {
    record('write16', addr, 2, value & 0xFFFF);
    return originalWrite16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    record('write24', addr, 3, value & 0xFFFFFF);
    return originalWrite24(addr, value);
  };

  return {
    writes,
    setContext({ step, pc, mode }) {
      currentStep = step;
      currentPc = pc & 0xFFFFFF;
      currentMode = mode;
    },
    restore() {
      cpu.write8 = originalWrite8;
      cpu.write16 = originalWrite16;
      cpu.write24 = originalWrite24;
    },
  };
}

function prepareTraceState(cpu, mem, options) {
  const {
    afValue,
    ixValue = IX_BASE,
    returnPc = TRACE_RETURN_SENTINEL,
  } = options;

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
  cpu._ix = IX_BASE;
  cpu.pc = TARGET_ENTRY;

  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
  write24(mem, cpu.sp + 0, afValue & 0xFFFFFF);
  write24(mem, cpu.sp + 3, ixValue & 0xFFFFFF);
  write24(mem, cpu.sp + 6, returnPc & 0xFFFFFF);
}

function runTrace(executor, cpu, options) {
  const {
    entry,
    mode = 'adl',
    maxSteps,
    stopPc = null,
    watcher = null,
  } = options;

  let pc = entry & 0xFFFFFF;
  let currentMode = mode;
  let steps = 0;
  let termination = 'max_steps';
  let lastPc = pc;
  let error = null;

  const visitedBlocks = [];
  const callTargets = [];
  const missingBlocks = [];

  while (steps < maxSteps) {
    cpu.madl = currentMode === 'adl' ? 1 : 0;
    cpu.pc = pc;
    cpu._currentBlockPc = pc;

    const key = blockKey(pc, currentMode);
    const fn = executor.compiledBlocks[key];
    const meta = executor.blockMeta[key];

    if (!fn) {
      termination = 'missing_block';
      missingBlocks.push({ step: steps + 1, pc, mode: currentMode });
      break;
    }

    const step = steps + 1;
    visitedBlocks.push({ step, pc, mode: currentMode });
    watcher?.setContext({ step, pc, mode: currentMode });
    callTargets.push(...extractCallTargets(meta, pc, step));

    let result;
    try {
      result = fn(cpu);
    } catch (caught) {
      termination = 'error';
      error = caught;
      break;
    }

    steps += 1;

    if (result === undefined || result === null) {
      termination = 'no_return';
      break;
    }

    if (typeof result !== 'number') {
      termination = 'non_numeric_return';
      break;
    }

    if (result < 0) {
      termination = result === -1 ? 'halt' : 'sleep';
      break;
    }

    const nextPc = result & 0xFFFFFF;
    if (stopPc !== null && nextPc === (stopPc & 0xFFFFFF)) {
      termination = 'stop_pc';
      lastPc = nextPc;
      break;
    }

    currentMode = resolveNextMode(meta, result, currentMode);
    pc = nextPc;
    lastPc = pc;
  }

  return {
    steps,
    termination,
    lastPc,
    lastMode: currentMode,
    error,
    visitedBlocks,
    callTargets,
    missingBlocks,
  };
}

function printStaticDisassembly(rows) {
  console.log(`=== Static ADL Disassembly (${rows.length} instructions from ${hex(TARGET_ENTRY)}) ===`);
  for (const row of rows) {
    console.log(`${hex(row.pc)}  ${row.bytes.padEnd(20)}  ${row.text}`);
  }
  console.log('');
}

function printStaticSummary(rows) {
  const calls = collectStaticCalls(rows);
  const branches = collectStaticBranches(rows);
  const loops = branches.filter((branch) => branch.isLoop);
  const d3ffRefs = collectStaticD3ffRefs(rows);

  console.log('=== Static Summary ===');
  console.log(`CALL targets in window: ${calls.length}`);
  if (calls.length === 0) {
    console.log('  none');
  } else {
    for (const call of calls) {
      console.log(`  ${hex(call.pc)} -> ${hex(call.target)}  ${call.text}`);
    }
  }

  console.log(`Conditional branches / returns in window: ${branches.length}`);
  if (branches.length === 0) {
    console.log('  none');
  } else {
    for (const branch of branches) {
      const loopNote = branch.isLoop ? ' [backward/loop]' : '';
      console.log(`  ${hex(branch.pc)} -> ${branch.target === null ? 'return' : hex(branch.target)}  ${branch.text}${loopNote}`);
    }
  }

  console.log(`Backward branches / loops in window: ${loops.length}`);
  if (loops.length === 0) {
    console.log('  none');
  } else {
    for (const loop of loops) {
      console.log(`  ${hex(loop.pc)} -> ${hex(loop.target)}  ${loop.text}`);
    }
  }

  console.log(`Direct D3FFxx immediate refs in window: ${d3ffRefs.length}`);
  if (d3ffRefs.length === 0) {
    console.log('  none');
  } else {
    for (const ref of d3ffRefs) {
      console.log(`  ${hex(ref.pc)} -> ${hex(ref.addr)}  ${ref.text}`);
    }
  }
  console.log('');
}

function printBootSummary(kernelInfo, bootSummary) {
  console.log('=== Boot / KernelInit ===');
  console.log(`requestedKernelInit=${hex(kernelInfo.requested)}`);
  console.log(`resolvedKernelInit=${kernelInfo.resolved === null ? 'n/a' : hex(kernelInfo.resolved)}`);
  console.log(`resolutionNote=${kernelInfo.note}`);
  console.log(
    `coldBoot: steps=${bootSummary.coldBoot.steps} term=${bootSummary.coldBoot.termination} ` +
    `lastPc=${hex(bootSummary.coldBoot.lastPc)} lastMode=${bootSummary.coldBoot.lastMode}`
  );
  if (bootSummary.kernelInit) {
    console.log(
      `kernelInit: steps=${bootSummary.kernelInit.steps} term=${bootSummary.kernelInit.termination} ` +
      `lastPc=${hex(bootSummary.kernelInit.lastPc)} lastMode=${bootSummary.kernelInit.lastMode}`
    );
  } else {
    console.log('kernelInit: skipped (no resolved lifted entry)');
  }
  console.log('');
}

function printTrace(traceLabel, trace, writes, afValue) {
  console.log(`=== Dynamic Trace: ${traceLabel} ===`);
  console.log(`seededAF=${hex(afValue, 6)} A=${hexByte((afValue >>> 8) & 0xFF)} F=${hexByte(afValue & 0xFF)}`);
  console.log(`steps=${trace.steps} termination=${trace.termination} lastPc=${hex(trace.lastPc)} lastMode=${trace.lastMode}`);
  if (trace.error) {
    console.log(`error=${trace.error?.stack ?? String(trace.error)}`);
  }

  console.log(`visitedBlocks (${trace.visitedBlocks.length})`);
  if (trace.visitedBlocks.length === 0) {
    console.log('  none');
  } else {
    for (const block of trace.visitedBlocks) {
      console.log(`  step=${String(block.step).padStart(4, '0')} pc=${hex(block.pc)}:${block.mode}`);
    }
  }

  console.log(`CALL targets (${trace.callTargets.length})`);
  if (trace.callTargets.length === 0) {
    console.log('  none');
  } else {
    for (const call of trace.callTargets) {
      console.log(
        `  step=${String(call.step).padStart(4, '0')} block=${hex(call.blockPc)} inst=${hex(call.instPc)} ` +
        `target=${hex(call.target)}${call.conditional ? ` if ${call.condition}` : ''}  ${call.dasm}`
      );
    }
  }

  console.log(`D3FFxx writes (${writes.length})`);
  if (writes.length === 0) {
    console.log('  none');
  } else {
    for (const write of writes) {
      console.log(
        `  step=${String(write.step).padStart(4, '0')} pc=${hex(write.pc)}:${write.mode} ` +
        `${write.kind} addr=${hex(write.addr)} old=${hexByte(write.oldValue)} new=${hexByte(write.newValue)} ` +
        `start=${hex(write.startAddr)}`
      );
    }
  }

  if (trace.missingBlocks.length > 0) {
    console.log(`missingBlocks (${trace.missingBlocks.length})`);
    for (const missing of trace.missingBlocks) {
      console.log(`  step=${String(missing.step).padStart(4, '0')} pc=${hex(missing.pc)}:${missing.mode}`);
    }
  }
  console.log('');
}

async function main() {
  console.log('Phase 273 probe: disassemble 0x09F736 post-VRAM-fill continuation');
  console.log('');

  const rom = fs.readFileSync(ROM_PATH);
  const { blocks, assets } = await loadBlocks();

  try {
    console.log(`ROM bytes=${rom.length}`);
    console.log(`Transpiled source=${assets.source}`);
    console.log(`Block count=${Object.keys(blocks).length}`);
    console.log('');

    const staticRows = decodeLinearInstructions(rom, TARGET_ENTRY, STATIC_INSTRUCTION_COUNT, 'adl');
    printStaticDisassembly(staticRows);
    printStaticSummary(staticRows);

    const kernelInfo = resolveKernelInitEntry(blocks);
    const runtime = createRuntime(rom, blocks);
    const bootSummary = coldBootAndKernelInit(runtime, kernelInfo);
    printBootSummary(kernelInfo, bootSummary);

    if (kernelInfo.resolved === null) {
      console.log('No lifted kernel-init entry was available, so dynamic tracing is skipped.');
      return;
    }

    const bootSnapshot = snapshotBootState(runtime.cpu, runtime.mem);

    const traces = [
      {
        label: 'PV clear -> RET PO taken immediately',
        afValue: (0x55 << 8) | 0x00,
      },
      {
        label: 'PV set -> fallthrough to EI / RET',
        afValue: (0x55 << 8) | 0x04,
      },
    ];

    let totalD3ffWrites = 0;

    for (const traceSpec of traces) {
      restoreBootState(runtime.cpu, runtime.mem, bootSnapshot);
      prepareTraceState(runtime.cpu, runtime.mem, {
        afValue: traceSpec.afValue,
        ixValue: IX_BASE,
        returnPc: TRACE_RETURN_SENTINEL,
      });

      const watcher = installD3ffWriteWatcher(runtime.cpu, runtime.mem);
      let trace;
      try {
        trace = runTrace(runtime.executor, runtime.cpu, {
          entry: TARGET_ENTRY,
          mode: 'adl',
          maxSteps: TRACE_STEPS,
          stopPc: TRACE_RETURN_SENTINEL,
          watcher,
        });
      } finally {
        watcher.restore();
      }

      totalD3ffWrites += watcher.writes.length;
      printTrace(traceSpec.label, trace, watcher.writes, traceSpec.afValue);
    }

    console.log('=== Conclusion ===');
    console.log(`${hex(TARGET_ENTRY)} is a short epilogue path: pop af; pop ix; ret po; ei; ret.`);
    console.log(`Static D3FFxx refs in first ${STATIC_INSTRUCTION_COUNT} instructions: ${collectStaticD3ffRefs(staticRows).length}.`);
    console.log(`Dynamic D3FFxx writes across both traces: ${totalD3ffWrites}.`);
    console.log('No CALL targets were reached from the 0x09F736 entry in either controlled trace.');
    console.log('Nothing in this continuation looks like dispatch-table registration.');
  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
