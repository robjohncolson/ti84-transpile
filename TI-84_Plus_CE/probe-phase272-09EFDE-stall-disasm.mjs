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
const RAM_SNAPSHOT_END = 0xe00000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x020028;
const MEM_INIT_ENTRY = 0x020830;
const HOME_STAGES = [
  { label: 'home_stage_1', entry: 0x021070 },
  { label: 'home_stage_2', entry: 0x0210b4 },
  { label: 'home_stage_3', entry: 0x0210e4 },
  { label: 'home_stage_4', entry: 0x021124 },
];

const CONTEXT_REG_ENTRY = 0x09e2ec;
const TRACE_RETURN_SENTINEL = 0x7ffffe;

const STACK_TOP = 0xd1a87e;
const IX_BASE = 0xd1a860;
const IY_BASE = 0xd00080;
const MBASE = 0xd0;

const D0230F = 0xd0230f;
const D007FA = 0xd007fa;

const BOOT_STAGE_STEPS = 50000;
const BOOT_LOOP_LIMIT = 10000;
const TRACE_STEPS = 5000;
const BYPASS_TRACE_STEPS = 400;

const STALL_RANGE_START = 0x09efd0;
const STALL_RANGE_END = 0x09f010;
const LINEAR_DISASM_START = 0x09efcf;
const LINEAR_DISASM_END = 0x09f010;
const LOOP_HEAD = 0x09efde;
const LOOP_EXIT = 0x09efe8;
const OUTER_LOOP_HEAD = 0x09efcb;
const OUTER_LOOP_EXIT = 0x09f001;

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
  return hex((value ?? 0) & 0xff, 2);
}

function bytesAt(buffer, start, length) {
  const bytes = [];
  for (let index = 0; index < length; index += 1) {
    bytes.push(hexByte(buffer[(start + index) & MEM_MASK]));
  }
  return bytes.join(' ');
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
  mem[base] = value & 0xff;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xff;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xff;
}

function inRange(value, start, end) {
  const normalized = value & 0xffffff;
  return normalized >= start && normalized <= end;
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
    const result = executor.runFrom(cpu.pc & 0xffffff, mode, {
      maxSteps,
      maxLoopIterations: options.maxLoopIterations ?? BOOT_LOOP_LIMIT,
      onBlock: options.onBlock,
      onMissingBlock: options.onMissingBlock,
      onDynamicTarget: options.onDynamicTarget,
    });
    cpu.pc = (result.lastPc ?? cpu.pc) & 0xffffff;
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
  cpu.pc = entry & 0xffffff;
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

function prepareContextCallState(cpu, mem, returnPc) {
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
  cpu._bc = (cpu._bc & 0xff) | (3 << 8);

  mem[D0230F & MEM_MASK] = 0x3f;

  cpu.sp = STACK_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
  cpu.sp = (cpu.sp - 3) & 0xffffff;
  write24(mem, cpu.sp, returnPc & 0xffffff);
  write24(mem, D007FA, cpu.sp);
}

function resolveDecodedAddress(inst) {
  if (!Number.isInteger(inst?.addr)) {
    return null;
  }
  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') {
    return (((MBASE & 0xff) << 16) | (inst.addr & 0xffff)) >>> 0;
  }
  return inst.addr >>> 0;
}

function formatPairImmediate(inst) {
  const width = inst.mode === 'adl' || inst.modePrefix === 'sil' || inst.modePrefix === 'lil' ? 6 : 4;
  return hex(inst.value, width);
}

function formatInstruction(inst) {
  if (!inst) {
    return 'decode-error';
  }

  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  const disp = (value) => (value >= 0 ? `+${value}` : `${value}`);
  const memAddr = resolveDecodedAddress(inst);

  switch (inst.tag) {
    case 'nop': return `${prefix}nop`;
    case 'di': return `${prefix}di`;
    case 'ei': return `${prefix}ei`;
    case 'halt': return `${prefix}halt`;
    case 'ret': return `${prefix}ret`;
    case 'ret-conditional': return `${prefix}ret ${inst.condition}`;
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
    case 'ld-pair-imm': return `${prefix}ld ${inst.pair}, ${formatPairImmediate(inst)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return `${prefix}ld (${hex(memAddr)}), ${inst.pair}`;
      }
      return `${prefix}ld ${inst.pair}, (${hex(memAddr)})`;
    case 'ld-mem-pair': return `${prefix}ld (${hex(memAddr)}), ${inst.pair}`;
    case 'ld-reg-imm': return `${prefix}ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `${prefix}ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind': return `${prefix}ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `${prefix}ld (${inst.dest}), ${inst.src}`;
    case 'ld-reg-mem': return `${prefix}ld ${inst.dest}, (${hex(memAddr)})`;
    case 'ld-mem-reg': return `${prefix}ld (${hex(memAddr)}), ${inst.src}`;
    case 'bit-test': return `${prefix}bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind': return `${prefix}bit ${inst.bit}, (${inst.indirectRegister})`;
    case 'rotate-reg': return `${prefix}${inst.op} ${inst.reg}`;
    case 'rotate-ind': return `${prefix}${inst.op} (${inst.indirectRegister})`;
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
    case 'ld-special': return `${prefix}ld ${inst.dest}, ${inst.src}`;
    case 'indexed-cb-set': return `${prefix}set ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'indexed-cb-res': return `${prefix}res ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    case 'indexed-cb-bit': return `${prefix}bit ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`;
    default: return `${prefix}${inst.tag}`;
  }
}

function decodeRow(rom, addr) {
  const inst = decodeInstruction(rom, addr, 'adl');
  return {
    pc: inst.pc >>> 0,
    bytes: bytesAt(rom, inst.pc, inst.length),
    text: formatInstruction(inst),
    length: inst.length,
    tag: inst.tag,
    target: inst.target ?? null,
  };
}

function decodeLinearRange(rom, start, endInclusive) {
  const rows = [];
  let pc = start & 0xffffff;
  while (pc <= endInclusive) {
    const row = decodeRow(rom, pc);
    rows.push(row);
    pc = (pc + Math.max(row.length, 1)) & 0xffffff;
  }
  return rows;
}

function decodeEveryAddress(rom, start, endInclusive) {
  const rows = [];
  for (let addr = start; addr <= endInclusive; addr += 1) {
    try {
      rows.push({ addr, ...decodeRow(rom, addr) });
    } catch (error) {
      rows.push({
        addr,
        pc: addr,
        bytes: bytesAt(rom, addr, 1),
        text: `decode error: ${error.message}`,
        length: 1,
        tag: 'decode-error',
        target: null,
      });
    }
  }
  return rows;
}

function printDisassembly(title, rows, includeStartAddress = false) {
  console.log(`=== ${title} ===`);
  for (const row of rows) {
    const address = includeStartAddress ? row.addr : row.pc;
    console.log(`${hex(address)}  ${row.bytes.padEnd(15)}  ${row.text}`);
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

function printStaticLoopAnalysis() {
  console.log('=== Static Loop Analysis ===');
  console.log(`Entry gate:  0x09EFD4  jr nz, ${hex(LOOP_HEAD)}   enters the inner loop when Z=0 after 'rr c'.`);
  console.log(`Inner loop:  0x09EFDE..0x09EFE6 writes E,D,E,D to (HL..HL+3), then 'djnz ${hex(LOOP_HEAD)}'.`);
  console.log(`Exit test:   register B only. There is no memory flag poll, I/O port read, HALT, or self-jump at 0x09EFDE.`);
  console.log(`Tail copy:   0x09EFEA  jr z, 0x09EFEF   restores flags from 'bit 0, c'; fallthrough writes one extra E,D pair.`);
  console.log(`Outer loop:  0x09EFFF  jr nz, ${hex(OUTER_LOOP_HEAD)}   repeats the whole copy chunk while A != 0 after 'dec a'.`);
  console.log(`Pointer read: 0x09EFF0  ld hl, (0xD0059C) reads the destination base between outer-loop iterations.`);
  console.log(`Source read:  0x09EFC6  sis ld de, (0xD02AC0) refreshes the two-byte pattern loaded into D/E.`);
  console.log('');
}

function snapshotFocusState(cpu) {
  return {
    a: cpu.a & 0xff,
    b: cpu.b & 0xff,
    c: cpu.c & 0xff,
    bc: cpu.bc & 0xffffff,
    de: cpu.de & 0xffffff,
    hl: cpu.hl & 0xffffff,
    sp: cpu.sp & 0xffffff,
    f: cpu.f & 0xff,
  };
}

function formatFocusState(state) {
  return `A=${hexByte(state.a)} B=${hexByte(state.b)} C=${hexByte(state.c)} BC=${hex(state.bc)} DE=${hex(state.de)} HL=${hex(state.hl)} SP=${hex(state.sp)} F=${hexByte(state.f)}`;
}

function maskForWidth(width) {
  if (width <= 1) return 0xff;
  if (width === 2) return 0xffff;
  return 0xffffff;
}

function bytesForWidth(mem, addr, width) {
  const bytes = [];
  for (let offset = 0; offset < width; offset += 1) {
    bytes.push(mem[(addr + offset) & MEM_MASK] & 0xff);
  }
  return bytes;
}

function bytesFromValue(value, width) {
  const bytes = [];
  for (let offset = 0; offset < width; offset += 1) {
    bytes.push((value >>> (offset * 8)) & 0xff);
  }
  return bytes;
}

function overlapsRange(addr, width, start, end) {
  for (let offset = 0; offset < width; offset += 1) {
    if (inRange((addr + offset) & 0xffffff, start, end)) {
      return true;
    }
  }
  return false;
}

function installMemoryWatcher(cpu, mem) {
  const readEventsByExecPc = [];
  const readEventsByAddr = [];
  const writeEventsByExecPc = [];
  const writeEventsByAddr = [];

  let currentStep = 0;
  let currentPc = 0;
  let currentMode = 'adl';

  const originalRead8 = cpu.read8.bind(cpu);
  const originalRead16 = cpu.read16.bind(cpu);
  const originalRead24 = cpu.read24.bind(cpu);
  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  function makeEvent(kind, addr, width, value) {
    const normalizedAddr = addr & 0xffffff;
    return {
      step: currentStep,
      pc: currentPc & 0xffffff,
      mode: currentMode,
      kind,
      addr: normalizedAddr,
      width,
      value: value & maskForWidth(width),
      bytes: bytesForWidth(mem, normalizedAddr, width),
    };
  }

  function recordRead(kind, addr, width, value) {
    const event = makeEvent(kind, addr, width, value);
    if (inRange(currentPc, STALL_RANGE_START, STALL_RANGE_END)) {
      readEventsByExecPc.push(event);
    }
    if (overlapsRange(addr, width, STALL_RANGE_START, STALL_RANGE_END)) {
      readEventsByAddr.push(event);
    }
  }

  function recordWrite(kind, addr, width, value) {
    const event = makeEvent(kind, addr, width, value);
    event.bytes = bytesFromValue(value, width);
    if (inRange(currentPc, STALL_RANGE_START, STALL_RANGE_END)) {
      writeEventsByExecPc.push(event);
    }
    if (overlapsRange(addr, width, STALL_RANGE_START, STALL_RANGE_END)) {
      writeEventsByAddr.push(event);
    }
  }

  cpu.read8 = (addr) => {
    const value = originalRead8(addr);
    recordRead('read8', addr, 1, value);
    return value;
  };

  cpu.read16 = (addr) => {
    const value = originalRead16(addr);
    recordRead('read16', addr, 2, value);
    return value;
  };

  cpu.read24 = (addr) => {
    const value = originalRead24(addr);
    recordRead('read24', addr, 3, value);
    return value;
  };

  cpu.write8 = (addr, value) => {
    recordWrite('write8', addr, 1, value);
    return originalWrite8(addr, value);
  };

  cpu.write16 = (addr, value) => {
    recordWrite('write16', addr, 2, value);
    return originalWrite16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    recordWrite('write24', addr, 3, value);
    return originalWrite24(addr, value);
  };

  return {
    readEventsByExecPc,
    readEventsByAddr,
    writeEventsByExecPc,
    writeEventsByAddr,
    setContext({ step, pc, mode }) {
      currentStep = step;
      currentPc = pc;
      currentMode = mode;
    },
    restore() {
      cpu.read8 = originalRead8;
      cpu.read16 = originalRead16;
      cpu.read24 = originalRead24;
      cpu.write8 = originalWrite8;
      cpu.write16 = originalWrite16;
      cpu.write24 = originalWrite24;
    },
  };
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

function runTrace(executor, cpu, options) {
  const {
    entry,
    mode = 'adl',
    maxSteps,
    stopPc = null,
    watcher = null,
    onStepStart = null,
  } = options;

  let pc = entry & 0xffffff;
  let currentMode = mode;
  let steps = 0;
  let termination = 'max_steps';
  let lastPc = pc;
  let error = null;

  const visitedSequence = [];
  const focusVisits = [];
  const uniqueMap = new Map();
  const missingBlocks = [];

  while (steps < maxSteps) {
    cpu.madl = currentMode === 'adl' ? 1 : 0;
    cpu.pc = pc;
    cpu._currentBlockPc = pc;

    const key = `${pc.toString(16).padStart(6, '0')}:${currentMode}`;
    const fn = executor.compiledBlocks[key];
    const meta = executor.blockMeta[key];

    if (!fn) {
      termination = 'missing_block';
      missingBlocks.push({ step: steps + 1, pc, mode: currentMode });
      break;
    }

    const step = steps + 1;
    const beforeState = snapshotFocusState(cpu);
    onStepStart?.({ step, pc, mode: currentMode, cpu, meta, beforeState });
    watcher?.setContext({ step, pc, mode: currentMode });

    let result;
    try {
      result = fn(cpu);
    } catch (caught) {
      termination = 'error';
      error = caught;
      break;
    }

    steps += 1;

    const nextPc = typeof result === 'number' && result >= 0 ? (result & 0xffffff) : null;
    visitedSequence.push({ step, pc, mode: currentMode, nextPc });

    const unique = uniqueMap.get(key) ?? {
      pc,
      mode: currentMode,
      firstStep: step,
      visits: 0,
    };
    unique.visits += 1;
    uniqueMap.set(key, unique);

    if (inRange(pc, STALL_RANGE_START, STALL_RANGE_END)) {
      focusVisits.push({
        step,
        pc,
        mode: currentMode,
        before: beforeState,
        after: snapshotFocusState(cpu),
        nextPc,
      });
    }

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

    if (stopPc !== null && nextPc === (stopPc & 0xffffff)) {
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
    visitedSequence,
    focusVisits,
    uniqueBlocks: [...uniqueMap.values()].sort((left, right) => left.firstStep - right.firstStep),
    missingBlocks,
  };
}

function aggregateEventsByAddress(events) {
  const map = new Map();
  for (const event of events) {
    const key = `${event.addr.toString(16)}:${event.width}`;
    if (!map.has(key)) {
      map.set(key, {
        addr: event.addr,
        width: event.width,
        count: 0,
        values: new Set(),
        pcs: new Set(),
      });
    }
    const bucket = map.get(key);
    bucket.count += 1;
    bucket.values.add(hex(event.value, event.width === 1 ? 2 : event.width === 2 ? 4 : 6));
    bucket.pcs.add(hex(event.pc));
  }
  return [...map.values()].sort((left, right) => right.count - left.count || left.addr - right.addr);
}

function printAggregatedEvents(title, events) {
  console.log(`${title} (${events.length})`);
  if (events.length === 0) {
    console.log('  none');
    console.log('');
    return;
  }
  for (const bucket of aggregateEventsByAddress(events)) {
    console.log(
      `  addr=${hex(bucket.addr)} width=${bucket.width} count=${bucket.count} ` +
      `values=[${[...bucket.values].join(', ')}] pcs=[${[...bucket.pcs].join(', ')}]`
    );
  }
  console.log('');
}

function printRawEvents(title, events, limit = 24) {
  console.log(`${title} (${events.length})`);
  if (events.length === 0) {
    console.log('  none');
    console.log('');
    return;
  }
  for (const event of events.slice(0, limit)) {
    const valueWidth = event.width === 1 ? 2 : event.width === 2 ? 4 : 6;
    console.log(
      `  step=${String(event.step).padStart(4, '0')} pc=${hex(event.pc)}:${event.mode} ` +
      `${event.kind} addr=${hex(event.addr)} width=${event.width} value=${hex(event.value, valueWidth)} ` +
      `bytes=[${event.bytes.map((byte) => hexByte(byte)).join(' ')}]`
    );
  }
  if (events.length > limit) {
    console.log(`  ... ${events.length - limit} more`);
  }
  console.log('');
}

function printFocusVisits(title, visits, limit = 32) {
  console.log(`${title} (${visits.length})`);
  if (visits.length === 0) {
    console.log('  none');
    console.log('');
    return;
  }
  for (const visit of visits.slice(0, limit)) {
    console.log(
      `  step=${String(visit.step).padStart(4, '0')} pc=${hex(visit.pc)} next=${visit.nextPc === null ? 'n/a' : hex(visit.nextPc)} ` +
      `before=[${formatFocusState(visit.before)}] after=[${formatFocusState(visit.after)}]`
    );
  }
  if (visits.length > limit) {
    console.log(`  ... ${visits.length - limit} more`);
  }
  console.log('');
}

function printFocusBlockCounts(visits) {
  const counts = new Map();
  for (const visit of visits) {
    counts.set(visit.pc, (counts.get(visit.pc) ?? 0) + 1);
  }
  const rows = [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0] - right[0]);

  console.log(`Focused block counts (${rows.length})`);
  if (rows.length === 0) {
    console.log('  none');
    console.log('');
    return;
  }
  for (const [pc, count] of rows) {
    console.log(`  ${hex(pc)} visits=${count}`);
  }
  console.log('');
}

function summarizeStall(trace) {
  const lastFocus = [...trace.focusVisits].reverse().find((visit) => inRange(visit.pc, STALL_RANGE_START, STALL_RANGE_END));
  const loopHeadVisits = trace.focusVisits.filter((visit) => visit.pc === LOOP_HEAD).length;
  const outerHeadVisits = trace.focusVisits.filter((visit) => visit.pc === OUTER_LOOP_HEAD).length;

  console.log('=== Dynamic Stall Summary ===');
  console.log(`Steps executed: ${trace.steps}`);
  console.log(`Termination: ${trace.termination}`);
  console.log(`Last PC: ${hex(trace.lastPc)}:${trace.lastMode}`);
  console.log(`Inner loop head hits (${hex(LOOP_HEAD)}): ${loopHeadVisits}`);
  console.log(`Outer loop head hits (${hex(OUTER_LOOP_HEAD)}): ${outerHeadVisits}`);
  if (lastFocus) {
    console.log(`Last focused block: ${hex(lastFocus.pc)} next=${lastFocus.nextPc === null ? 'n/a' : hex(lastFocus.nextPc)}`);
    console.log(`Last focused state: ${formatFocusState(lastFocus.after)}`);
  } else {
    console.log('Last focused block: none');
  }
  console.log('');
}

function summarizeBypass(trace, patchInfo) {
  console.log('=== Bypass Summary ===');
  if (!patchInfo.applied) {
    console.log('Patch was never applied because 0x09EFDE was not reached.');
    console.log('');
    return;
  }

  console.log(
    `Patch applied at step=${patchInfo.step} pc=${hex(patchInfo.pc)} ` +
    `original=[${formatFocusState(patchInfo.before)}] forced B=${hexByte(patchInfo.forcedB)} A=${hexByte(patchInfo.forcedA)}`
  );
  console.log(`Termination: ${trace.termination}`);
  console.log(`Last PC: ${hex(trace.lastPc)}:${trace.lastMode}`);

  const afterPatchVisits = trace.visitedSequence.filter((visit) => visit.step >= patchInfo.step).slice(0, 24);
  console.log('Blocks after patch:');
  if (afterPatchVisits.length === 0) {
    console.log('  none');
  } else {
    for (const visit of afterPatchVisits) {
      console.log(`  step=${String(visit.step).padStart(4, '0')} pc=${hex(visit.pc)} next=${visit.nextPc === null ? 'n/a' : hex(visit.nextPc)}`);
    }
  }
  console.log('');
}

async function main() {
  console.log('Phase 272 probe: disassemble and trace the 0x09EFDE copy-loop region');
  console.log('');

  const rom = fs.readFileSync(ROM_PATH);
  const { blocks, assets } = await loadBlocks();

  try {
    console.log(`ROM bytes=${rom.length}`);
    console.log(`Transpiled source=${assets.source}`);
    console.log(`Block count=${Object.keys(blocks).length}`);
    console.log('');

    console.log('Note: 0x09EFD0 is in the middle of the CB-prefixed instruction at 0x09EFCF.');
    console.log('The script prints both a linear decode from 0x09EFCF and an overlapping decode starting at every address in 0x09EFD0..0x09F010.');
    console.log('');

    const linearRows = decodeLinearRange(rom, LINEAR_DISASM_START, LINEAR_DISASM_END);
    const perAddressRows = decodeEveryAddress(rom, STALL_RANGE_START, STALL_RANGE_END);

    printDisassembly('Linear ADL Decode (0x09EFCF..0x09F010)', linearRows);
    printDisassembly('Per-Address ADL Decode (start at every address 0x09EFD0..0x09F010)', perAddressRows, true);
    printStaticLoopAnalysis();

    const peripherals = createPeripheralBus({ timerInterrupt: false });
    const runtime = createCPU(rom, blocks, peripherals);
    const { cpu, mem, executor } = runtime;

    const bootStages = bootSystem(runtime);
    printBootSummary(bootStages);

    const bootSnapshot = snapshotBootState(cpu, mem);

    restoreBootState(cpu, mem, bootSnapshot);
    prepareContextCallState(cpu, mem, TRACE_RETURN_SENTINEL);
    cpu.a = 0x49;

    const watcher = installMemoryWatcher(cpu, mem);
    let trace;
    try {
      trace = runTrace(executor, cpu, {
        entry: CONTEXT_REG_ENTRY,
        mode: 'adl',
        maxSteps: TRACE_STEPS,
        watcher,
      });
    } finally {
      watcher.restore();
    }

    summarizeStall(trace);
    printFocusVisits('Focused execution trace inside 0x09EFD0..0x09F010', trace.focusVisits);
    printFocusBlockCounts(trace.focusVisits);
    printAggregatedEvents('Memory reads while executing inside 0x09EFD0..0x09F010', watcher.readEventsByExecPc);
    printRawEvents('Raw memory reads while executing inside 0x09EFD0..0x09F010', watcher.readEventsByExecPc);
    printAggregatedEvents('Memory reads whose addresses land in 0x09EFD0..0x09F010', watcher.readEventsByAddr);
    printRawEvents('Writes while executing inside 0x09EFD0..0x09F010', watcher.writeEventsByExecPc);
    printAggregatedEvents('Writes whose addresses land in 0x09EFD0..0x09F010', watcher.writeEventsByAddr);

    restoreBootState(cpu, mem, bootSnapshot);
    prepareContextCallState(cpu, mem, TRACE_RETURN_SENTINEL);
    cpu.a = 0x49;

    const patchInfo = {
      applied: false,
      step: null,
      pc: null,
      before: null,
      forcedB: 0x01,
      forcedA: 0x01,
    };

    const bypassTrace = runTrace(executor, cpu, {
      entry: CONTEXT_REG_ENTRY,
      mode: 'adl',
      maxSteps: BYPASS_TRACE_STEPS,
      stopPc: TRACE_RETURN_SENTINEL,
      onStepStart({ step, pc, cpu: currentCpu, beforeState }) {
        if (patchInfo.applied || pc !== LOOP_HEAD) {
          return;
        }
        patchInfo.applied = true;
        patchInfo.step = step;
        patchInfo.pc = pc;
        patchInfo.before = beforeState;
        currentCpu.b = patchInfo.forcedB;
        currentCpu.a = patchInfo.forcedA;
      },
    });

    summarizeBypass(bypassTrace, patchInfo);
  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
