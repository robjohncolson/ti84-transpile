#!/usr/bin/env node

/**
 * Phase 234: trace the two pre-cascade exit paths that bypass the normal
 * CLEAR/MODE/other-key classifier in 0x02FE89.
 */

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

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

const STAGE_1_ENTRY = 0x0A2B72;
const STAGE_2_ENTRY = 0x0A3301;
const STAGE_3_ENTRY = 0x0A29EC;
const STAGE_4_ENTRY = 0x0A2854;

const CLEAR_GATE_ENTRY = 0x02FFF6;
const MODE_GATE_ENTRY = 0x0300CB;
const LOOKUP_CONTINUATION = 0x02FF0B;
const MAIN_DISPATCH_LOOP = 0x02FD99;
const ALT_EXIT = 0x02FDD8;
const HELPER_0301F6 = 0x0301F6;

const MAIN_DISASM_START = 0x02FFF6;
const MAIN_DISASM_END = 0x030120;
const HELPER_DISASM_START = 0x0301F6;
const HELPER_DISASM_END = 0x030214;

const STACK_TOP = 0xD1A87E;
const MEM_INIT_RET = 0x7FFFF6;
const TRACE_RET = 0x7FFFFE;

const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;
const IY_PLUS_18 = IY_ADDR + 18;

const TRACE_INPUT_A = 0x8F;
const TRACE_STEP_LIMIT = 200;

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const STAGE_SEGMENT_LIMIT = 2000;
const STAGE_LOOP_LIMIT = 500;
const OS_LOOP_LIMIT = 8192;

const IY_WRITE_LIMIT = 128;
const RAM_WRITE_LIMIT = 128;
const STACK_IGNORE_START = STACK_TOP - 0x0200;
const STACK_IGNORE_END = STACK_TOP + 0x0020;

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const CONTROL_FLOW_TAGS = new Set([
  'call',
  'call-conditional',
  'jp',
  'jp-conditional',
  'jp-indirect',
  'jr',
  'jr-conditional',
  'ret',
  'ret-conditional',
  'reti',
  'retn',
]);

const TRACE_STOP_SENTINELS = new Map([
  [LOOKUP_CONTINUATION, 'reached shared lookup continuation 0x02FF0B'],
  [MAIN_DISPATCH_LOOP, 'reached main dispatch loop 0x02FD99'],
  [ALT_EXIT, 'reached alternate exit 0x02FDD8'],
  [TRACE_RET, 'hit synthetic return sentinel'],
]);

const IY_LABELS = new Map([
  [IY_ADDR + 0, 'IY+0'],
  [IY_ADDR + 8, 'IY+8'],
  [IY_ADDR + 13, 'IY+13'],
  [IY_ADDR + 18, 'IY+18'],
  [IY_ADDR + 21, 'IY+21'],
  [IY_ADDR + 31, 'IY+31'],
  [IY_ADDR + 36, 'IY+36'],
  [IY_ADDR + 70, 'IY+70'],
  [IY_ADDR + 81, 'IY+81'],
]);

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesAt(buffer, start, length) {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(buffer.length, safeStart + Math.max(0, length));
  return Array.from(buffer.slice(safeStart, safeEnd), (byte) =>
    byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }
}

function blockKey(pc, mode = 'adl') {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return {
      modulePath: TRANSPILED_JS_PATH,
      tempModulePath: null,
      source: 'js',
    };
  }

  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase234-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return {
    modulePath: tempModulePath,
    tempModulePath,
    source: 'gz',
  };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

function formatIndexed(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${String(indexRegister).toUpperCase()}${sign}${displacement})`;
}

function formatInstruction(inst) {
  if (!inst) return '(decode error)';

  switch (inst.tag) {
    case 'nop': return 'NOP';
    case 'scf': return 'SCF';
    case 'ccf': return 'CCF';
    case 'cpl': return 'CPL';
    case 'xor-a': return 'XOR A';
    case 'halt': return 'HALT';
    case 'ret': return 'RET';
    case 'reti': return 'RETI';
    case 'retn': return 'RETN';
    case 'ret-conditional': return `RET ${String(inst.condition).toUpperCase()}`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect': return `JP (${String(inst.indirectRegister ?? 'HL').toUpperCase()})`;
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'push': return `PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `POP ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-imm': return `LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-imm': return `LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg': return `LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem': return `LD ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ixd': return `LD ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg': return `LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'ld-sp-pair': return `LD SP, ${String(inst.pair).toUpperCase()}`;
    case 'inc-reg': return `INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg': return `DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair': return `INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair': return `DEC ${String(inst.pair).toUpperCase()}`;
    case 'add-pair': return `ADD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'lea': return `LEA ${String(inst.dest).toUpperCase()}, ${String(inst.base).toUpperCase()}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`;
    case 'indexed-cb-bit': return `BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set': return `SET ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res': return `RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'alu-imm': return `${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-reg': return `${String(inst.op).toUpperCase()} ${String(inst.src === '(hl)' ? '(HL)' : inst.src).toUpperCase()}`;
    case 'bit-test': return `BIT ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-test-ind': return `BIT ${inst.bit}, (HL)`;
    case 'rotate-reg': return `${String(inst.op).toUpperCase()} ${String(inst.reg).toUpperCase()}`;
    case 'in0': return `IN0 ${String(inst.reg).toUpperCase()}, (${hexByte(inst.port)})`;
    case 'out-reg': return `OUT (C), ${String(inst.reg ?? 'A').toUpperCase()}`;
    default: return inst.tag;
  }
}

function decodeRange(rom, startPc, endPc) {
  const rows = [];
  let pc = startPc & 0xFFFFFF;

  while (pc < (endPc & 0xFFFFFF)) {
    try {
      const inst = decodeInstruction(rom, pc, 'adl');
      rows.push({
        pc: inst.pc >>> 0,
        bytes: bytesAt(rom, inst.pc, inst.length),
        text: formatInstruction(inst),
        tag: inst.tag,
        length: inst.length,
      });
      pc = inst.nextPc & 0xFFFFFF;
    } catch (error) {
      rows.push({
        pc,
        bytes: bytesAt(rom, pc, 1),
        text: `decode-error: ${error.message}`,
        tag: 'decode-error',
        length: 1,
      });
      pc = (pc + 1) & 0xFFFFFF;
    }
  }

  return rows;
}

function decodeBlockPreview(rom, startPc, maxInstructions = 5) {
  const rows = [];
  let pc = startPc & 0xFFFFFF;

  for (let i = 0; i < maxInstructions; i += 1) {
    try {
      const inst = decodeInstruction(rom, pc, 'adl');
      rows.push({
        pc: inst.pc >>> 0,
        bytes: bytesAt(rom, inst.pc, inst.length),
        text: formatInstruction(inst),
        tag: inst.tag,
        length: inst.length,
      });
      pc = inst.nextPc & 0xFFFFFF;
      if (CONTROL_FLOW_TAGS.has(inst.tag)) break;
    } catch (error) {
      rows.push({
        pc,
        bytes: bytesAt(rom, pc, 1),
        text: `decode-error: ${error.message}`,
        tag: 'decode-error',
        length: 1,
      });
      break;
    }
  }

  return rows;
}

function formatPreview(rows) {
  return rows.map((row) => row.text).join(' ; ');
}

function printRows(title, rows, markers = new Map()) {
  console.log(title);
  for (const row of rows) {
    const marker = markers.get(row.pc) ?? '';
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(15)}  ${row.text}${marker ? `  ${marker}` : ''}`);
  }
  console.log('');
}

function describeIYAddr(addr) {
  if (IY_LABELS.has(addr)) return `${IY_LABELS.get(addr)} @ ${hex(addr)}`;
  if (addr >= IY_ADDR && addr < IY_ADDR + 0x100) return `IY+${addr - IY_ADDR} @ ${hex(addr)}`;
  return hex(addr);
}

function diffBits(before, after) {
  const setBits = [];
  const clearedBits = [];
  for (let bit = 0; bit < 8; bit += 1) {
    const mask = 1 << bit;
    const beforeSet = (before & mask) !== 0;
    const afterSet = (after & mask) !== 0;
    if (!beforeSet && afterSet) setBits.push(bit);
    if (beforeSet && !afterSet) clearedBits.push(bit);
  }
  return { setBits, clearedBits };
}

function formatBitChange(before, after) {
  const { setBits, clearedBits } = diffBits(before, after);
  const parts = [];
  if (setBits.length) parts.push(`SET bit${setBits.length === 1 ? '' : 's'} ${setBits.join(',')}`);
  if (clearedBits.length) parts.push(`RES bit${clearedBits.length === 1 ? '' : 's'} ${clearedBits.join(',')}`);
  return parts.length ? parts.join('; ') : 'no bit change';
}

function createRuntime(romBytes, blocks) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  return { mem, cpu: executor.cpu, executor };
}

function resetCpuForOsCall(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._iy = IY_ADDR;
  cpu._ix = IX_ADDR;
  cpu._hl = 0;
  cpu._de = 0;
  cpu._bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, Math.min(mem.length, cpu.sp + 12));
}

function runStageInSegments(executor, entry, mode, totalMaxSteps, maxLoopIterations) {
  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastResult = { lastPc: currentPc, lastMode: currentMode, termination: null };

  while (totalSteps < totalMaxSteps) {
    const segmentBudget = Math.min(STAGE_SEGMENT_LIMIT, totalMaxSteps - totalSteps);
    const result = executor.runFrom(currentPc, currentMode, {
      maxSteps: segmentBudget,
      maxLoopIterations,
    });
    totalSteps += result.steps ?? 0;
    lastResult = result;
    currentPc = (result.lastPc ?? currentPc) & 0xFFFFFF;
    currentMode = result.lastMode ?? currentMode;
    if (result.termination !== 'max_steps') break;
  }

  return {
    steps: totalSteps,
    lastPc: (lastResult.lastPc ?? currentPc) & 0xFFFFFF,
    lastMode: lastResult.lastMode ?? currentMode,
    termination: lastResult.termination ?? null,
  };
}

function coldBoot(executor, cpu, mem) {
  const boot = runStageInSegments(executor, BOOT_ENTRY, 'z80', BOOT_MAX_STEPS, 32);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, Math.min(mem.length, cpu.sp + 3));

  const kernelInit = runStageInSegments(executor, KERNEL_INIT_ENTRY, 'adl', KERNEL_INIT_MAX_STEPS, 10000);

  cpu.mbase = MBASE;
  cpu._iy = IY_ADDR;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, Math.min(mem.length, cpu.sp + 3));

  const postInit = runStageInSegments(executor, POST_INIT_ENTRY, 'adl', POST_INIT_MAX_STEPS, 32);

  return {
    boot: { steps: boot.steps, termination: boot.termination, lastPc: hex(boot.lastPc) },
    kernelInit: { steps: kernelInit.steps, termination: kernelInit.termination, lastPc: hex(kernelInit.lastPc) },
    postInit: { steps: postInit.steps, termination: postInit.termination, lastPc: hex(postInit.lastPc) },
  };
}

function runMemInit(executor, cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, MEM_INIT_RET);

  let returned = false;
  let result = null;

  try {
    result = executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: MEM_INIT_MAX_STEPS,
      maxLoopIterations: OS_LOOP_LIMIT,
      onBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__MEM_INIT_RET__');
      },
      onMissingBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__MEM_INIT_RET__');
      },
    });
  } catch (error) {
    if (error?.message === '__MEM_INIT_RET__') {
      returned = true;
    } else {
      throw error;
    }
  }

  return {
    returned,
    steps: result?.steps ?? null,
    termination: returned ? 'sentinel_return' : (result?.termination ?? null),
    lastPc: returned ? hex(MEM_INIT_RET) : hex(result?.lastPc ?? 0),
  };
}

function restoreCpuForHomescreen(cpu, snapshot, mem) {
  restoreCpu(cpu, snapshot);
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = IY_ADDR;
  cpu._ix = IX_ADDR;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, Math.min(mem.length, cpu.sp + 12));
}

function runHomescreenStages(executor, cpu, mem, cpuSnapshot) {
  const stages = [];

  restoreCpuForHomescreen(cpu, cpuSnapshot, mem);
  const s1 = runStageInSegments(executor, STAGE_1_ENTRY, 'adl', 30000, STAGE_LOOP_LIMIT);
  stages.push({ label: 'stage1_statusbar', steps: s1.steps, lastPc: hex(s1.lastPc), termination: s1.termination });

  restoreCpuForHomescreen(cpu, cpuSnapshot, mem);
  mem[0xD0009B] &= ~0x40;
  const s2 = runStageInSegments(executor, STAGE_2_ENTRY, 'adl', 30000, STAGE_LOOP_LIMIT);
  stages.push({ label: 'stage2_statusdots', steps: s2.steps, lastPc: hex(s2.lastPc), termination: s2.termination });

  restoreCpuForHomescreen(cpu, cpuSnapshot, mem);
  const s3 = runStageInSegments(executor, STAGE_3_ENTRY, 'adl', 50000, STAGE_LOOP_LIMIT);
  stages.push({ label: 'stage3_homerow', steps: s3.steps, lastPc: hex(s3.lastPc), termination: s3.termination });

  restoreCpuForHomescreen(cpu, cpuSnapshot, mem);
  const s4 = runStageInSegments(executor, STAGE_4_ENTRY, 'adl', 50000, STAGE_LOOP_LIMIT);
  stages.push({ label: 'stage4_history', steps: s4.steps, lastPc: hex(s4.lastPc), termination: s4.termination });

  return {
    stages,
    finalCpuSnapshot: snapshotCpu(cpu),
  };
}
