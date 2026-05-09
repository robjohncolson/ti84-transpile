#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;
const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xE00000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x020028;
const MEM_INIT_ENTRY = 0x020830;
const HOME_STAGES = [
  { label: 'home_stage_1', entry: 0x021070 },
  { label: 'home_stage_2', entry: 0x0210B4 },
  { label: 'home_stage_3', entry: 0x0210E4 },
  { label: 'home_stage_4', entry: 0x021124 },
];

const HOME_BODY_ENTRY = 0x0582BC;
const STACK_TOP = 0xD1A87E;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;
const MBASE = 0xD0;

const D007E0 = 0xD007E0;
const D007E8 = 0xD007E8;
const D007FA = 0xD007FA;
const D0230F = 0xD0230F;

const TRACE_RETURN_SENTINEL = 0x7FFFFE;
const TRACE_STEPS = 15000;
const BOOT_STAGE_STEPS = 50000;
const BOOT_LOOP_LIMIT = 10000;

const TARGET_09CE10 = 0x09CE10;
const TARGET_058322 = 0x058322;
const TARGET_0A2854 = 0x0A2854;

const POLLING_BLOCKS = new Set([
  0x082BE2,
  0x084716,
  0x08471B,
  0x084723,
  0x084711,
]);

const DISASM_RANGES = [
  { label: '0x09CE10..0x09CE80', start: 0x09CE10, end: 0x09CE80 },
  { label: '0x058322..0x058380', start: 0x058322, end: 0x058380 },
  { label: '0x0A2854..0x0A28D0', start: 0x0A2854, end: 0x0A28D0 },
];

const TABLE_TOP = 0xD3FFFF;
const TABLE_ENTRY_SIZE = 9;
const TABLE_ENTRY_COUNT = 20;

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

function read24(mem, addr) {
  const base = addr & MEM_MASK;
  return (
    (mem[base] ?? 0) |
    ((mem[(base + 1) & MEM_MASK] ?? 0) << 8) |
    ((mem[(base + 2) & MEM_MASK] ?? 0) << 16)
  ) >>> 0;
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function bytesAt(buffer, addr, length) {
  const bytes = [];
  for (let index = 0; index < length; index += 1) {
    bytes.push(hexByte(buffer[(addr + index) & MEM_MASK]));
  }
  return bytes.join(' ');
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

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase272-${process.pid}.mjs`);
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

function createCPU(rom, blocks, peripherals) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));

  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;

  cpu.run = (maxSteps, options = {}) => {
    const mode = options.mode ?? (cpu.madl ? 'adl' : 'z80');
    const result = executor.runFrom(cpu.pc & 0xFFFFFF, mode, {
      maxSteps,
      maxLoopIterations: options.maxLoopIterations ?? BOOT_LOOP_LIMIT,
      onBlock: options.onBlock,
      onMissingBlock: options.onMissingBlock,
      onDynamicTarget: options.onDynamicTarget,
      onInterrupt: options.onInterrupt,
      onWake: options.onWake,
    });
    cpu.pc = (result.lastPc ?? cpu.pc) & 0xFFFFFF;
    cpu.madl = result.lastMode === 'adl' ? 1 : 0;
    return result;
  };

  return { cpu, mem, executor };
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

function sanitizeForManualStage(cpu) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
}

function runBootStage(cpu, label, entry, mode, maxSteps, maxLoopIterations) {
  sanitizeForManualStage(cpu);
  cpu.pc = entry & 0xFFFFFF;
  cpu.madl = mode === 'adl' ? 1 : 0;
  const result = cpu.run(maxSteps, {
    mode,
    maxLoopIterations,
  });
  return {
    label,
    entry,
    mode,
    steps: result.steps,
    termination: result.termination,
    lastPc: result.lastPc,
    lastMode: result.lastMode,
    loopsForced: result.loopsForced,
    missingBlocks: result.missingBlocks,
  };
}

function bootSystem(runtime) {
  const { cpu } = runtime;
  const stages = [];

  cpu.pc = BOOT_ENTRY;
  cpu.sp = STACK_TOP;
  cpu.ix = IX_BASE;
  cpu.iy = IY_BASE;
  cpu.mbase = MBASE;
  cpu.madl = 0;
  stages.push(runBootStage(cpu, 'cold_boot', BOOT_ENTRY, 'z80', BOOT_STAGE_STEPS, 32));

  stages.push(runBootStage(cpu, 'kernel_init', KERNEL_INIT_ENTRY, 'adl', BOOT_STAGE_STEPS, BOOT_LOOP_LIMIT));
  stages.push(runBootStage(cpu, 'mem_init', MEM_INIT_ENTRY, 'adl', BOOT_STAGE_STEPS, BOOT_LOOP_LIMIT));

  for (const stage of HOME_STAGES) {
    cpu.ix = IX_BASE;
    stages.push(runBootStage(cpu, stage.label, stage.entry, 'adl', BOOT_STAGE_STEPS, BOOT_LOOP_LIMIT));
  }

  return stages;
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

function formatMnemonic(inst) {
  if (!inst) {
    return 'decode-error';
  }

  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  const addr = resolveImmediateMemoryAddress(inst);
  const indexed = (register, displacement) => `(${register}${signed(displacement)})`;

  switch (inst.tag) {
    case 'nop': return `${prefix}nop`;
    case 'call': return `${prefix}call ${hex(inst.target)}`;
    case 'call-conditional': return `${prefix}call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp': return `${prefix}jp ${hex(inst.target)}`;
    case 'jp-conditional': return `${prefix}jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${prefix}jp (${inst.indirectRegister})`;
    case 'jr': return `${prefix}jr ${hex(inst.target)}`;
    case 'jr-conditional': return `${prefix}jr ${inst.condition}, ${hex(inst.target)}`;
    case 'djnz': return `${prefix}djnz ${hex(inst.target)}`;
    case 'ret': return `${prefix}ret`;
    case 'ret-conditional': return `${prefix}ret ${inst.condition}`;
    case 'reti': return `${prefix}reti`;
    case 'retn': return `${prefix}retn`;
    case 'push': return `${prefix}push ${inst.pair}`;
    case 'pop': return `${prefix}pop ${inst.pair}`;
    case 'inc-pair': return `${prefix}inc ${inst.pair}`;
    case 'dec-pair': return `${prefix}dec ${inst.pair}`;
    case 'inc-reg': return `${prefix}inc ${inst.reg}`;
    case 'dec-reg': return `${prefix}dec ${inst.reg}`;
    case 'add-pair': return `${prefix}add ${inst.dest}, ${inst.src}`;
    case 'adc-pair': return `${prefix}adc hl, ${inst.src}`;
    case 'sbc-pair': return `${prefix}sbc hl, ${inst.src}`;
    case 'alu-reg': return `${prefix}${inst.op} ${inst.src}`;
    case 'alu-imm': return `${prefix}${inst.op} ${hex(inst.value, 2)}`;
    case 'ld-pair-imm': return `${prefix}ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `${prefix}ld (${hex(addr ?? inst.addr)}), ${inst.pair}`
        : `${prefix}ld ${inst.pair}, (${hex(addr ?? inst.addr)})`;
    case 'ld-mem-pair': return `${prefix}ld (${hex(addr ?? inst.addr)}), ${inst.pair}`;
    case 'ld-reg-imm': return `${prefix}ld ${inst.dest}, ${hex(inst.value, 2)}`;
    case 'ld-reg-reg': return `${prefix}ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind': return `${prefix}ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `${prefix}ld (${inst.dest}), ${inst.src}`;
    case 'ld-reg-mem': return `${prefix}ld ${inst.dest}, (${hex(addr ?? inst.addr)})`;
    case 'ld-mem-reg': return `${prefix}ld (${hex(addr ?? inst.addr)}), ${inst.src}`;
    case 'ld-ind-imm': return `${prefix}ld (hl), ${hex(inst.value, 2)}`;
    case 'ld-reg-ixd': return `${prefix}ld ${inst.dest}, ${indexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg': return `${prefix}ld ${indexed(inst.indexRegister, inst.displacement)}, ${inst.src}`;
    case 'ld-ixd-imm': return `${prefix}ld ${indexed(inst.indexRegister, inst.displacement)}, ${hex(inst.value, 2)}`;
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
    case 'di': return `${prefix}di`;
    case 'ei': return `${prefix}ei`;
    case 'halt': return `${prefix}halt`;
    case 'slp': return `${prefix}slp`;
    case 'rst': return `${prefix}rst ${hex(inst.target, 2)}`;
    case 'in-imm': return `${prefix}in a, (${hex(inst.port, 2)})`;
    case 'out-imm': return `${prefix}out (${hex(inst.port, 2)}), a`;
    case 'in-reg': return `${prefix}in ${inst.reg}, (c)`;
    case 'out-reg': return `${prefix}out (c), ${inst.reg}`;
    case 'in0': return `${prefix}in0 ${inst.reg}, (${hex(inst.port, 2)})`;
    case 'out0': return `${prefix}out0 (${hex(inst.port, 2)}), ${inst.reg}`;
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
    case 'tst-imm': return `${prefix}tst a, ${hex(inst.value, 2)}`;
    case 'tstio': return `${prefix}tstio ${hex(inst.value, 2)}`;
    case 'stmix': return `${prefix}stmix`;
    case 'rsmix': return `${prefix}rsmix`;
    default: return `${prefix}${fallbackMnemonic(inst)}`;
  }
}

function decodeRange(rom, start, end, mode = 'adl') {
  const rows = [];
  for (let pc = start; pc <= end;) {
    try {
      const inst = decodeInstruction(rom, pc, mode);
      const length = Math.max(inst.length ?? 1, 1);
      rows.push({
        pc,
        bytes: bytesAt(rom, pc, length),
        text: formatMnemonic(inst),
      });
      pc += length;
    } catch (error) {
      rows.push({
        pc,
        bytes: bytesAt(rom, pc, 1),
        text: `db ${bytesAt(rom, pc, 1)}  [decode error: ${error instanceof Error ? error.message : String(error)}]`,
      });
      pc += 1;
    }
  }
  return rows;
}

function printDisassembly(rom) {
  console.log('=== Disassembly ===');
  for (const range of DISASM_RANGES) {
    console.log(`${range.label}`);
    for (const row of decodeRange(rom, range.start, range.end, 'adl')) {
      console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}`);
    }
    console.log('');
  }
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

function prepareHomeTraceState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
  cpu._ix = IX_BASE;
  cpu.f = 0x40;
  cpu._bc = (cpu._bc & 0xFF) | (3 << 8);

  mem[D0230F & MEM_MASK] = 0x3F;
  mem[D007E0 & MEM_MASK] = 0x49;
  write24(mem, D007E8, 0x06C546);

  cpu.sp = STACK_TOP;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  write24(mem, cpu.sp, TRACE_RETURN_SENTINEL);
  write24(mem, D007FA, cpu.sp);
  cpu.pc = HOME_BODY_ENTRY;
}

function snapshotTraceHit(cpu, mem, step, withHlBytes) {
  const hit = {
    step,
    mode: cpu.madl ? 'adl' : 'z80',
    a: cpu.a & 0xFF,
    hl: cpu.hl >>> 0,
    de: cpu.de >>> 0,
    bc: cpu.bc >>> 0,
  };
  if (withHlBytes) {
    hit.hlBytes = bytesAt(mem, cpu.hl, 16);
  }
  return hit;
}

function runEventTrace(runtime, bootSnapshot) {
  const { cpu, mem, executor } = runtime;
  restoreBootState(cpu, mem, bootSnapshot);
  prepareHomeTraceState(cpu, mem);

  let pc = HOME_BODY_ENTRY;
  let mode = 'adl';
  let steps = 0;
  let termination = 'max_steps';
  let error = null;
  let lastPc = pc;

  const blockCounts = new Map();
  const missingBlocks = [];
  const hits = {
    [TARGET_09CE10]: [],
    [TARGET_058322]: [],
    [TARGET_0A2854]: [],
  };

  while (steps < TRACE_STEPS) {
    cpu.madl = mode === 'adl' ? 1 : 0;
    cpu.pc = pc;
    cpu._currentBlockPc = pc;

    const key = blockKey(pc, mode);
    const fn = executor.compiledBlocks[key];
    const meta = executor.blockMeta[key];

    if (!fn) {
      termination = 'missing_block';
      missingBlocks.push({ step: steps + 1, pc, mode });
      break;
    }

    const stepNumber = steps + 1;
    blockCounts.set(key, (blockCounts.get(key) ?? 0) + 1);

    if (pc === TARGET_09CE10) {
      hits[TARGET_09CE10].push(snapshotTraceHit(cpu, mem, stepNumber, true));
    } else if (pc === TARGET_058322) {
      hits[TARGET_058322].push(snapshotTraceHit(cpu, mem, stepNumber, true));
    } else if (pc === TARGET_0A2854) {
      hits[TARGET_0A2854].push(snapshotTraceHit(cpu, mem, stepNumber, false));
    }

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
    mode = resolveNextMode(meta, result, mode);
    pc = nextPc;
    lastPc = nextPc;
  }

  cpu.pc = lastPc & 0xFFFFFF;
  cpu.madl = mode === 'adl' ? 1 : 0;

  return {
    steps,
    termination,
    lastPc,
    lastMode: mode,
    error,
    missingBlocks,
    blockCounts,
    hits,
  };
}

function describeBlock(blocks, rom, pc, mode) {
  const block = blocks[blockKey(pc, mode)];
  const dasm = block?.instructions?.[0]?.dasm;
  if (typeof dasm === 'string' && dasm.length > 0) {
    return dasm;
  }
  try {
    return formatMnemonic(decodeInstruction(rom, pc, mode));
  } catch {
    return '';
  }
}

function topVisitedBlocks(trace, blocks, rom) {
  const rows = [];
  for (const [key, visits] of trace.blockCounts.entries()) {
    const [pcHex, mode] = key.split(':');
    const pc = parseInt(pcHex, 16) >>> 0;
    if (POLLING_BLOCKS.has(pc)) {
      continue;
    }
    rows.push({
      key,
      pc,
      mode,
      visits,
      label: describeBlock(blocks, rom, pc, mode),
    });
  }
  rows.sort((left, right) => {
    if (right.visits !== left.visits) {
      return right.visits - left.visits;
    }
    if (left.pc !== right.pc) {
      return left.pc - right.pc;
    }
    return left.mode.localeCompare(right.mode);
  });
  return rows.slice(0, 20);
}

function printTargetHits(title, hits, includeHlBytes) {
  console.log(`=== ${title} (${hits.length}) ===`);
  if (hits.length === 0) {
    console.log('  none');
    console.log('');
    return;
  }
  for (const hit of hits) {
    const base =
      `  step=${String(hit.step).padStart(5, '0')} mode=${hit.mode} ` +
      `A=${hexByte(hit.a)} HL=${hex(hit.hl)} DE=${hex(hit.de)} BC=${hex(hit.bc)}`;
    console.log(includeHlBytes ? `${base} [HL]=${hit.hlBytes}` : base);
  }
  console.log('');
}

function dumpDispatchTable(mem) {
  const entries = [];
  const matches = {
    [TARGET_09CE10]: [],
    [TARGET_058322]: [],
  };

  for (let index = 0; index < TABLE_ENTRY_COUNT; index += 1) {
    const end = (TABLE_TOP - (index * TABLE_ENTRY_SIZE)) & 0xFFFFFF;
    const start = (end - (TABLE_ENTRY_SIZE - 1)) & 0xFFFFFF;
    const raw = [];
    for (let offset = 0; offset < TABLE_ENTRY_SIZE; offset += 1) {
      raw.push(mem[(start + offset) & MEM_MASK] & 0xFF);
    }

    const keyBytes = raw.slice(0, 3);
    const handler =
      (raw[3] & 0xFF) |
      ((raw[4] & 0xFF) << 8) |
      ((raw[5] & 0xFF) << 16);
    const tailBytes = raw.slice(6, 9);

    const entry = {
      index,
      start,
      end,
      raw,
      keyBytes,
      handler: handler >>> 0,
      tailBytes,
    };
    entries.push(entry);

    if (handler === TARGET_09CE10) {
      matches[TARGET_09CE10].push(entry);
    }
    if (handler === TARGET_058322) {
      matches[TARGET_058322].push(entry);
    }
  }

  return { entries, matches };
}

function printDispatchTableDump(tableDump) {
  console.log('=== Dispatch Table Dump (post-trace memory) ===');
  console.log(`Interpreting entry 0 as ${hex(TABLE_TOP - (TABLE_ENTRY_SIZE - 1))}..${hex(TABLE_TOP)} (9-byte descending slots).`);
  for (const entry of tableDump.entries) {
    console.log(
      `  entry#${String(entry.index).padStart(2, '0')} ` +
      `start=${hex(entry.start)} end=${hex(entry.end)} ` +
      `raw=[${entry.raw.map(hexByte).join(' ')}] ` +
      `key=[${entry.keyBytes.map(hexByte).join(' ')}] ` +
      `handler=${hex(entry.handler)} ` +
      `tail=[${entry.tailBytes.map(hexByte).join(' ')}]`
    );
  }
  console.log('');

  for (const target of [TARGET_09CE10, TARGET_058322]) {
    const matches = tableDump.matches[target];
    if (matches.length === 0) {
      console.log(`${hex(target)} appears in first ${TABLE_ENTRY_COUNT} entries: no`);
      continue;
    }
    console.log(
      `${hex(target)} appears in first ${TABLE_ENTRY_COUNT} entries: yes -> ` +
      matches.map((entry) => `entry#${String(entry.index).padStart(2, '0')}@${hex(entry.start)}`).join(', ')
    );
  }
  console.log('');
}

function printBootSummary(bootStages) {
  console.log('=== Boot Summary ===');
  for (const stage of bootStages) {
    console.log(
      `${stage.label.padEnd(14)} entry=${hex(stage.entry)}:${stage.mode} ` +
      `steps=${stage.steps} term=${stage.termination} lastPc=${hex(stage.lastPc)} lastMode=${stage.lastMode}`
    );
  }
  console.log('');
}

function printTraceSummary(trace, blocks, rom) {
  console.log('=== Dynamic Trace ===');
  console.log(`Entry=${hex(HOME_BODY_ENTRY)} maxSteps=${TRACE_STEPS}`);
  console.log(`Seeded D007E0=${hexByte(0x49)} D007E8=${hex(0x06C546)} SP=${hex(STACK_TOP)} IX=${hex(IX_BASE)}`);
  console.log(`Termination=${trace.termination} steps=${trace.steps} lastPc=${hex(trace.lastPc)}:${trace.lastMode}`);
  console.log(`Unique blocks=${trace.blockCounts.size}`);
  if (trace.error) {
    console.log(`Error=${trace.error?.stack ?? String(trace.error)}`);
  }
  if (trace.missingBlocks.length > 0) {
    console.log('Missing blocks:');
    for (const missing of trace.missingBlocks) {
      console.log(`  step=${missing.step} pc=${hex(missing.pc)}:${missing.mode}`);
    }
  }
  console.log('');

  printTargetHits('Entries Into 0x09CE10', trace.hits[TARGET_09CE10], true);
  printTargetHits('Entries Into 0x058322', trace.hits[TARGET_058322], true);
  printTargetHits('Entries Into 0x0A2854', trace.hits[TARGET_0A2854], false);

  console.log('=== Top 20 Most-Visited Blocks (excluding polling set) ===');
  const topBlocks = topVisitedBlocks(trace, blocks, rom);
  if (topBlocks.length === 0) {
    console.log('  none');
  } else {
    topBlocks.forEach((row, index) => {
      const suffix = row.label ? `  ${row.label}` : '';
      console.log(
        `  ${String(index + 1).padStart(2, '0')}. ${hex(row.pc)}:${row.mode} visits=${row.visits}${suffix}`
      );
    });
  }
  console.log('');
}

async function main() {
  console.log('Phase 272 probe: event-loop dispatch targets');
  console.log('');

  const rom = fs.readFileSync(ROM_PATH);
  const { blocks, assets } = await loadBlocks();

  try {
    console.log(`ROM bytes=${rom.length}`);
    console.log(`Transpiled source=${assets.source}`);
    console.log(`Block count=${Object.keys(blocks).length}`);
    console.log('');

    const peripherals = createPeripheralBus({ timerInterrupt: false });
    const runtime = createCPU(rom, blocks, peripherals);

    const bootStages = bootSystem(runtime);
    printBootSummary(bootStages);

    printDisassembly(rom);

    const bootSnapshot = snapshotBootState(runtime.cpu, runtime.mem);
    const trace = runEventTrace(runtime, bootSnapshot);
    printTraceSummary(trace, blocks, rom);

    const tableDump = dumpDispatchTable(runtime.mem);
    printDispatchTableDump(tableDump);
  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
