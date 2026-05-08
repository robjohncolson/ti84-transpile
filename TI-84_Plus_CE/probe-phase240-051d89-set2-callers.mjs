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

if (!fs.existsSync(ROM_PATH)) {
  throw new Error('ROM.rom is missing.');
}

const rom = fs.readFileSync(ROM_PATH);
const ROM_SCAN_LIMIT = Math.min(rom.length, 0x0C0000);

const TARGET_PC = 0x051D89;
const TARGET_WINDOW_START = 0x051D80;
const TARGET_WINDOW_END = 0x051DA1;
const TARGET_NEAR_START = 0x051D70;
const TARGET_NEAR_END = 0x051DA0;
const RES_SITE = 0x051D52;
const POST_SET_MERGE = 0x051DA6;
const CALLER_CONTEXT_PC = 0x04EA09;

const WIDE_REGION_LOOKBACK = 0x200;
const CALLER_WINDOW_BEFORE = 0x24;
const CALLER_WINDOW_AFTER = 0x14;

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;
const RAM_WATCH_START = 0xD00000;
const RAM_WATCH_END = 0xD10000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;

const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IX_HOME = 0xD1A860;
const IY_HOME = 0xD00080;

const DESCRIPTOR_INDEX = 56;
const DESCRIPTOR_TABLE_ROOT = 0x04F262;

const D00333 = 0xD00333;
const D00337 = 0xD00337;
const D00338 = 0xD00338;
const D0033A = 0xD0033A;
const D003E0 = 0xD003E0;
const D00595 = 0xD00595;
const D00596 = 0xD00596;
const D0059F = 0xD0059F;

const IY_TRACE_OFFSETS = [0x00, 0x0C, 0x12, 0x1D, 0x25, 0x35];
const IY_DIFF_WINDOW = 0x60;

const DIRECT_TRANSFER_OPS = new Map([
  [0xCD, 'CALL'],
  [0xC3, 'JP'],
]);

const ALL_TRANSFER_OPS = new Map([
  [0xCD, 'CALL'],
  [0xC3, 'JP'],
  [0xC4, 'CALL NZ'],
  [0xCC, 'CALL Z'],
  [0xD4, 'CALL NC'],
  [0xDC, 'CALL C'],
  [0xE4, 'CALL PO'],
  [0xEC, 'CALL PE'],
  [0xF4, 'CALL P'],
  [0xFC, 'CALL M'],
  [0xC2, 'JP NZ'],
  [0xCA, 'JP Z'],
  [0xD2, 'JP NC'],
  [0xDA, 'JP C'],
  [0xE2, 'JP PO'],
  [0xEA, 'JP PE'],
  [0xF2, 'JP P'],
  [0xFA, 'JP M'],
]);

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function read24LE(buffer, addr) {
  return (
    (buffer[addr] & 0xFF) |
    ((buffer[addr + 1] & 0xFF) << 8) |
    ((buffer[addr + 2] & 0xFF) << 16)
  ) >>> 0;
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function bytesAt(buffer, start, length) {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(buffer.length, safeStart + Math.max(0, length));
  return Array.from(buffer.slice(safeStart, safeEnd), (byte) =>
    byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function regionLabel(addr) {
  const page = (addr >>> 16) & 0xFF;
  if (page === 0x04) return 'OS core';
  if (page === 0x05) return 'editor/cxMain';
  if (page === 0x06) return 'editor2';
  if (page === 0x07) return 'FP';
  if (page === 0x08) return 'display';
  if (page === 0x09) return 'STAT';
  if (page === 0x0A) return 'apps';
  return `other (${hex(page, 2)}xxxx)`;
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
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz. Generate one before running this probe.');
  }
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase240-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath, source: 'gz' };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

function resolveMemAddr(inst) {
  if (!Number.isInteger(inst?.addr)) return null;
  if (inst.modePrefix === 'sis' || inst.modePrefix === 'lis') {
    return (((MBASE & 0xFF) << 16) | (inst.addr & 0xFFFF)) >>> 0;
  }
  return inst.addr >>> 0;
}

function formatIndexed(indexRegister, displacement) {
  const signed = displacement >= 0 ? `+${displacement}` : `${displacement}`;
  return `(${String(indexRegister).toUpperCase()}${signed})`;
}

function formatInstruction(inst) {
  if (!inst) return 'DB ?';
  const prefix = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';
  switch (inst.tag) {
    case 'call': return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional': return `${prefix}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional': return `${prefix}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp-indirect': return `${prefix}JP (${String(inst.indirectRegister).toUpperCase()})`;
    case 'jr': return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional': return `${prefix}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'ret': return `${prefix}RET`;
    case 'ret-conditional': return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'ld-pair-imm': return `${prefix}LD ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-imm': return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind': return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg': return `${prefix}LD (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem': return `${prefix}LD ${String(inst.dest).toUpperCase()}, (${hex(resolveMemAddr(inst) ?? inst.addr)})`;
    case 'ld-mem-reg': return `${prefix}LD (${hex(resolveMemAddr(inst) ?? inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') return `${prefix}LD (${hex(resolveMemAddr(inst) ?? inst.addr)}), ${String(inst.pair).toUpperCase()}`;
      return `${prefix}LD ${String(inst.pair).toUpperCase()}, (${hex(resolveMemAddr(inst) ?? inst.addr)})`;
    case 'ld-mem-pair': return `${prefix}LD (${hex(resolveMemAddr(inst) ?? inst.addr)}), ${String(inst.pair).toUpperCase()}`;
    case 'ld-ind-imm': return `${prefix}LD (HL), ${hexByte(inst.value)}`;
    case 'ld-reg-ixd': return `${prefix}LD ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg': return `${prefix}LD ${formatIndexed(inst.indexRegister, inst.displacement)}, ${String(inst.src).toUpperCase()}`;
    case 'bit-test': return `${prefix}BIT ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-set': return `${prefix}SET ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-res': return `${prefix}RES ${inst.bit}, ${String(inst.reg).toUpperCase()}`;
    case 'bit-test-ind': return `${prefix}BIT ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-set-ind': return `${prefix}SET ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-res-ind': return `${prefix}RES ${inst.bit}, (${String(inst.indirectRegister).toUpperCase()})`;
    case 'indexed-cb-bit': return `${prefix}BIT ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set': return `${prefix}SET ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res': return `${prefix}RES ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'inc-reg': return `${prefix}INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg': return `${prefix}DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair': return `${prefix}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair': return `${prefix}DEC ${String(inst.pair).toUpperCase()}`;
    case 'add-pair': return `${prefix}ADD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'alu-imm': return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-reg': return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'push': return `${prefix}PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `${prefix}POP ${String(inst.pair).toUpperCase()}`;
    case 'djnz': return `${prefix}DJNZ ${hex(inst.target)}`;
    case 'ldir': return `${prefix}LDIR`;
    case 'lddr': return `${prefix}LDDR`;
    case 'cpir': return `${prefix}CPIR`;
    case 'lea': return `${prefix}LEA ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.base, inst.displacement)}`;
    case 'scf': return `${prefix}SCF`;
    case 'ccf': return `${prefix}CCF`;
    case 'di': return `${prefix}DI`;
    case 'ei': return `${prefix}EI`;
    case 'nop': return `${prefix}NOP`;
    case 'halt': return `${prefix}HALT`;
    case 'ex-de-hl': return `${prefix}EX DE, HL`;
    default: return `${prefix}[${inst.tag}]`;
  }
}

function decodeSafe(pc, mode = 'adl') {
  try {
    return decodeInstruction(rom, pc & 0xFFFFFF, mode);
  } catch {
    return null;
  }
}

function makeRow(inst) {
  const length = Math.max(1, inst?.length ?? 1);
  return { pc: inst.pc, inst, bytes: bytesAt(rom, inst.pc, length), text: formatInstruction(inst) };
}

function rawRow(pc, length = 1) {
  return { pc, inst: null, bytes: bytesAt(rom, pc, length), text: `DB ${hexByte(rom[pc] ?? 0)}` };
}

function decodeLinear(startPc, endPc, mode = 'adl') {
  const rows = [];
  let pc = startPc;
  const limit = Math.min(rom.length, endPc);
  let guard = 0;
  while (pc < limit && guard < 4096) {
    const inst = decodeSafe(pc, mode);
    if (!inst || !inst.length || inst.nextPc <= pc) {
      rows.push(rawRow(pc));
      pc += 1;
      guard += 1;
      continue;
    }
    rows.push(makeRow(inst));
    pc = inst.nextPc;
    guard += 1;
  }
  return rows;
}

function decodeForwardBytes(startPc, byteBudget, mode = 'adl') {
  return decodeLinear(startPc, startPc + byteBudget, mode);
}

function decodeBeforePc(targetPc, lookbackBytes, mode = 'adl') {
  const startBase = Math.max(0, targetPc - lookbackBytes);
  let best = null;
  for (let offset = 0; offset < 8 && startBase + offset < targetPc; offset += 1) {
    const rows = [];
    let pc = startBase + offset;
    let errors = 0;
    let guard = 0;
    while (pc < targetPc && guard < 4096) {
      const inst = decodeSafe(pc, mode);
      if (!inst || !inst.length || inst.nextPc <= pc || inst.nextPc > targetPc) {
        errors += 1;
        pc += 1;
        guard += 1;
        continue;
      }
      rows.push(makeRow(inst));
      pc = inst.nextPc;
      guard += 1;
    }
    const exact = pc === targetPc;
    const score = (exact ? 1000 : 0) - (errors * 100) + rows.length;
    if (!best || score > best.score) best = { exact, score, rows };
  }
  if (best?.exact) return best.rows;
  return decodeForwardBytes(startBase, targetPc - startBase, mode).filter((row) => row.pc < targetPc);
}

function decodeAroundPc(targetPc, beforeBytes, afterBytes, mode = 'adl') {
  const rows = [...decodeBeforePc(targetPc, beforeBytes, mode)];
  const inst = decodeSafe(targetPc, mode);
  if (inst && inst.length && inst.nextPc > targetPc) {
    rows.push(makeRow(inst));
    rows.push(...decodeForwardBytes(inst.nextPc, afterBytes, mode));
  } else {
    rows.push(rawRow(targetPc));
    rows.push(...decodeForwardBytes(targetPc + 1, afterBytes, mode));
  }
  return rows;
}

function printRows(rows, highlightPc = null, indent = '  ') {
  for (const row of rows) {
    const marker = row.pc === highlightPc ? '>>' : '  ';
    console.log(`${indent}${marker} ${hex(row.pc)}  ${row.bytes.padEnd(24)} ${row.text}`);
  }
}

function scanDirectRefsToRange(rangeStart, rangeEnd) {
  const hits = [];
  for (let pc = 0; pc <= ROM_SCAN_LIMIT - 4; pc += 1) {
    const kind = DIRECT_TRANSFER_OPS.get(rom[pc]);
    if (!kind) continue;
    const target = read24LE(rom, pc + 1);
    if (target < rangeStart || target > rangeEnd) continue;
    hits.push({ pc, kind, target });
  }
  return hits;
}

function scanCallersToTarget(target) {
  const hits = [];
  for (let pc = 0; pc <= ROM_SCAN_LIMIT - 4; pc += 1) {
    const kind = ALL_TRANSFER_OPS.get(rom[pc]);
    if (!kind) continue;
    if (read24LE(rom, pc + 1) !== target) continue;
    hits.push({ pc, kind, target, region: regionLabel(pc) });
  }
  return hits;
}

function isSplitTerminator(inst) {
  return ['ret', 'jp', 'jp-indirect', 'halt', 'slp'].includes(inst?.tag);
}

function isLinearTerminator(inst) {
  return ['ret', 'jp', 'jp-indirect', 'jr', 'halt', 'slp'].includes(inst?.tag);
}

function linearlyReaches(entryPc, targetPc) {
  if (entryPc > targetPc) return false;
  if (entryPc === targetPc) return true;
  let pc = entryPc;
  let guard = 0;
  while (pc < targetPc && guard < 4096) {
    const inst = decodeSafe(pc, 'adl');
    if (!inst || !inst.length || inst.nextPc <= pc) return false;
    if (isLinearTerminator(inst)) return inst.nextPc === targetPc;
    pc = inst.nextPc;
    guard += 1;
  }
  return pc === targetPc;
}

function analyzeStatic() {
  const targetRows = decodeLinear(TARGET_WINDOW_START, TARGET_WINDOW_END);
  const nearbyRefs = scanDirectRefsToRange(TARGET_NEAR_START, TARGET_NEAR_END);
  const beforeRows = decodeBeforePc(TARGET_PC, WIDE_REGION_LOOKBACK);

  let nearestRetRow = null;
  for (const row of beforeRows) {
    if (row.inst?.tag === 'ret') nearestRetRow = row;
  }

  const wideRegionStart = nearestRetRow?.inst?.nextPc ?? beforeRows[0]?.pc ?? TARGET_PC;
  const wideRows = decodeLinear(wideRegionStart, TARGET_PC);
  const candidateEntries = [wideRegionStart];

  for (const row of wideRows) {
    if (row.pc >= TARGET_PC) break;
    if (isSplitTerminator(row.inst)) {
      const nextPc = row.inst.nextPc;
      if (nextPc < TARGET_PC) candidateEntries.push(nextPc);
    }
  }

  const splitEntries = [...new Set(candidateEntries)].sort((a, b) => a - b).map((entry) => ({
    entry,
    callers: scanCallersToTarget(entry),
    reachesTarget: linearlyReaches(entry, TARGET_PC),
  }));

  let containing = splitEntries.filter((item) => item.reachesTarget && item.callers.length > 0).sort((a, b) => b.entry - a.entry)[0];
  if (!containing) containing = splitEntries.filter((item) => item.reachesTarget).sort((a, b) => b.entry - a.entry)[0];

  const containingEntry = containing?.entry ?? TARGET_PC;
  const containingCallers = scanCallersToTarget(containingEntry);
  const callerRows = decodeAroundPc(CALLER_CONTEXT_PC, CALLER_WINDOW_BEFORE, CALLER_WINDOW_AFTER);
  const resRows = decodeAroundPc(RES_SITE, 12, 20);
  const sameFunctionAsRes = linearlyReaches(containingEntry, RES_SITE) && linearlyReaches(containingEntry, TARGET_PC);

  return {
    targetRows,
    nearbyRefs,
    nearestRetRow,
    wideRegionStart,
    splitEntries,
    containingEntry,
    containingCallers,
    callerRows,
    resRows,
    sameFunctionAsRes,
  };
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }
}

function createMemoryWithRom() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(rom.length, 0x400000)));
  return mem;
}

function createRuntime(blocks, mem) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  return createExecutor(blocks, mem, { peripherals });
}

function coldBootToMemInit(blocks) {
  const mem = createMemoryWithRom();
  const executor = createRuntime(blocks, mem);
  const cpu = executor.cpu;

  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, Math.min(mem.length, cpu.sp + 3));

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: 10000,
  });

  cpu.mbase = MBASE;
  cpu.iy = IY_HOME;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, Math.min(mem.length, cpu.sp + 3));

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.iy = IY_HOME;
  cpu.ix = IX_HOME;
  cpu.sp = STACK_TOP;
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, MEM_INIT_RET);

  try {
    executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: MEM_INIT_MAX_STEPS,
      maxLoopIterations: 8192,
      onBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__MEM_INIT_RET__');
      },
      onMissingBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__MEM_INIT_RET__');
      },
    });
  } catch (error) {
    if (error?.message !== '__MEM_INIT_RET__') throw error;
  }

  return {
    baselineMem: Uint8Array.from(mem),
    cpuSnapshot: snapshotCpu(cpu),
  };
}

function seedDynamicTrace(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.iy = IY_HOME;
  cpu.ix = IX_HOME;
  cpu.hl = 0x000000;
  cpu.de = 0x000000;
  cpu.bc = 0x000000;
  cpu.a = 0x00;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, Math.min(mem.length, cpu.sp + 12));
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, RETURN_SENTINEL);

  mem[D00337] = 0x00;
  mem[D0033A] = DESCRIPTOR_INDEX;
  mem[D003E0] = 0xFF;
  mem[D00595] = 0x12;
  mem[D00596] = 0x34;
  mem[D0059F] = 0x00;
  mem[IY_HOME + 0x35] &= ~0x02;
}

function installRamWriteWatch(cpu, mem) {
  const events = [];
  let currentPc = 0;
  let currentStep = 0;

  const originals = {
    write8: cpu.write8.bind(cpu),
    write16: cpu.write16.bind(cpu),
    write24: cpu.write24.bind(cpu),
  };

  function recordByte(addr, nextValue, source) {
    const masked = addr & MEM_MASK;
    if (masked < RAM_WATCH_START || masked >= RAM_WATCH_END) return;
    const before = mem[masked] & 0xFF;
    const after = nextValue & 0xFF;
    if (before === after) return;
    events.push({ step: currentStep, pc: currentPc, addr: masked, before, after, source });
  }

  cpu.write8 = (addr, value) => {
    recordByte(addr, value, 'write8');
    return originals.write8(addr, value);
  };

  cpu.write16 = (addr, value) => {
    recordByte(addr, value & 0xFF, 'write16');
    recordByte(addr + 1, (value >>> 8) & 0xFF, 'write16');
    return originals.write16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    recordByte(addr, value & 0xFF, 'write24');
    recordByte(addr + 1, (value >>> 8) & 0xFF, 'write24');
    recordByte(addr + 2, (value >>> 16) & 0xFF, 'write24');
    return originals.write24(addr, value);
  };

  return {
    events,
    updateContext(pc, step) {
      currentPc = pc & 0xFFFFFF;
      currentStep = (step ?? 0) + 1;
    },
    dispose() {
      cpu.write8 = originals.write8;
      cpu.write16 = originals.write16;
      cpu.write24 = originals.write24;
    },
  };
}

function summarizeUniqueRamWrites(events) {
  const byAddr = new Map();
  for (const event of events) {
    if (!byAddr.has(event.addr)) {
      byAddr.set(event.addr, {
        addr: event.addr,
        firstBefore: event.before,
        lastAfter: event.after,
        count: 1,
        firstPc: event.pc,
        lastPc: event.pc,
      });
      continue;
    }
    const current = byAddr.get(event.addr);
    current.lastAfter = event.after;
    current.count += 1;
    current.lastPc = event.pc;
  }
  return [...byAddr.values()].sort((a, b) => a.addr - b.addr);
}

function diffIyWindow(beforeSlice, afterSlice) {
  const diffs = [];
  for (let offset = 0; offset < Math.min(beforeSlice.length, afterSlice.length); offset += 1) {
    if (beforeSlice[offset] === afterSlice[offset]) continue;
    diffs.push({
      offset,
      addr: IY_HOME + offset,
      before: beforeSlice[offset],
      after: afterSlice[offset],
    });
  }
  return diffs;
}

function readDescriptorInfo(index) {
  const slotAddr = DESCRIPTOR_TABLE_ROOT + (index * 3);
  const pointer = read24LE(rom, slotAddr);
  const bytes = Array.from(rom.slice(pointer, pointer + 4));
  return { index, slotAddr, pointer, bytes };
}

function runDynamicTrace(blocks, containingEntry) {
  const bootState = coldBootToMemInit(blocks);
  const mem = Uint8Array.from(bootState.baselineMem);
  const executor = createRuntime(blocks, mem);
  const cpu = executor.cpu;

  restoreCpu(cpu, bootState.cpuSnapshot);

  const iyBefore = Uint8Array.from(mem.subarray(IY_HOME, IY_HOME + IY_DIFF_WINDOW));
  seedDynamicTrace(cpu, mem);
  const descriptor = readDescriptorInfo(DESCRIPTOR_INDEX);

  const watch = installRamWriteWatch(cpu, mem);
  const blockPath = [];
  let steps = 0;
  let lastPc = containingEntry;
  let stopReason = 'max_steps';
  let hitTarget = false;

  try {
    executor.runFrom(containingEntry, 'adl', {
      maxSteps: 200,
      maxLoopIterations: 128,
      onBlock(pc, _mode, _meta, step) {
        watch.updateContext(pc, step);
        const masked = pc & 0xFFFFFF;
        blockPath.push(masked);
        lastPc = masked;
        steps = Math.max(steps, (step ?? 0) + 1);
        if (masked === TARGET_PC) hitTarget = true;
        if (hitTarget && masked === POST_SET_MERGE) throw new Error('__POST_SET_MERGE__');
        if (masked === RETURN_SENTINEL) throw new Error('__RETURN_SENTINEL__');
      },
      onMissingBlock(pc, _mode, step) {
        watch.updateContext(pc, step);
        const masked = pc & 0xFFFFFF;
        lastPc = masked;
        steps = Math.max(steps, (step ?? 0) + 1);
        if (masked === RETURN_SENTINEL) throw new Error('__RETURN_SENTINEL__');
      },
    });
  } catch (error) {
    if (error?.message === '__POST_SET_MERGE__') {
      stopReason = 'post_set_merge';
    } else if (error?.message === '__RETURN_SENTINEL__') {
      stopReason = 'return_sentinel';
    } else {
      stopReason = `error: ${error?.message ?? String(error)}`;
    }
  } finally {
    watch.dispose();
  }

  const iyAfter = Uint8Array.from(mem.subarray(IY_HOME, IY_HOME + IY_DIFF_WINDOW));
  const iyDiffs = diffIyWindow(iyBefore, iyAfter);
  const d003e0Events = watch.events.filter((event) => event.addr === D003E0);
  const setEvent = d003e0Events.find(
    (event) => event.pc === TARGET_PC && (event.before & 0x04) === 0 && (event.after & 0x04) !== 0,
  ) ?? null;

  return {
    descriptor,
    steps,
    lastPc,
    stopReason,
    blockPath,
    hitTarget,
    setEvent,
    d003e0Final: mem[D003E0],
    d0059fFinal: mem[D0059F],
    d00333Final: read24LE(mem, D00333),
    d00338Final: read24LE(mem, D00338),
    allEvents: watch.events,
    d003e0Events,
    uniqueRamWrites: summarizeUniqueRamWrites(watch.events),
    iyDiffs,
    iyBeforeOffsets: IY_TRACE_OFFSETS.map((offset) => ({ offset, value: iyBefore[offset] })),
    iyAfterOffsets: IY_TRACE_OFFSETS.map((offset) => ({ offset, value: iyAfter[offset] })),
  };
}

// ===========================================================================
// Main
// ===========================================================================

console.log('=== Phase 240: 0x051D89 SET 2,(HL) — Caller Chain for D003E0 Bit 2 Writer ===\n');

// ---- Part 1: Static Analysis ----

console.log('--- Part 1: Disassembly around 0x051D89 (SET 2,(HL) site) ---\n');
const staticResult = analyzeStatic();

printRows(staticResult.targetRows, TARGET_PC);

console.log(`\n--- Part 1b: Disassembly around 0x051D52 (RES 2,(HL) site) ---\n`);
printRows(staticResult.resRows, RES_SITE);

// ---- Part 2: Function Boundary ----

console.log('\n--- Part 2: Function Boundary ---\n');

if (staticResult.nearestRetRow) {
  console.log(`  Nearest RET before 0x051D89: at ${hex(staticResult.nearestRetRow.pc)}`);
}
console.log(`  Wide region start (likely function entry): ${hex(staticResult.wideRegionStart)}`);
console.log(`  Containing entry (best match): ${hex(staticResult.containingEntry)}`);
console.log(`  RES 2,(HL) at 0x051D52 in same function? ${staticResult.sameFunctionAsRes ? 'YES' : 'NO'}`);

console.log('\n  Split entries scanned:');
for (const entry of staticResult.splitEntries) {
  const reachStr = entry.reachesTarget ? 'reaches 0x051D89' : 'does NOT reach 0x051D89';
  console.log(`    ${hex(entry.entry)}  callers=${entry.callers.length}  ${reachStr}`);
}

// Full function disassembly from containing entry to past the SET site
console.log(`\n--- Full Function: ${hex(staticResult.containingEntry)} ---\n`);
const fullFuncRows = decodeLinear(staticResult.containingEntry, TARGET_PC + 0x30);
printRows(fullFuncRows, TARGET_PC);

// ---- Part 3: Caller Identification ----

console.log('\n--- Part 3: Caller Identification ---\n');

// Direct refs into the 0x051D70-0x051DA0 range
console.log('  CALL/JP references into 0x051D70-0x051DA0:');
if (staticResult.nearbyRefs.length === 0) {
  console.log('    (none found)');
} else {
  for (const ref of staticResult.nearbyRefs) {
    console.log(`    ${ref.kind.padEnd(6)} ${hex(ref.target)} at ${hex(ref.pc)}  ${regionLabel(ref.pc)}`);
  }
}

// Callers to the containing function entry
console.log(`\n  Callers to containing entry ${hex(staticResult.containingEntry)}:`);
if (staticResult.containingCallers.length === 0) {
  console.log('    (none found — may be entered via fallthrough or JP)');
} else {
  // Group by region
  const byRegion = {};
  for (const caller of staticResult.containingCallers) {
    if (!byRegion[caller.region]) byRegion[caller.region] = [];
    byRegion[caller.region].push(caller);
  }
  for (const [region, callers] of Object.entries(byRegion).sort()) {
    console.log(`\n    ${region}: ${callers.length} caller(s)`);
    for (const c of callers) {
      console.log(`      ${c.kind.padEnd(10)} at ${hex(c.pc)}`);
    }
  }
}

// Context around one known caller
if (staticResult.callerRows.length > 0) {
  console.log(`\n  Context around caller at ${hex(CALLER_CONTEXT_PC)}:\n`);
  printRows(staticResult.callerRows, CALLER_CONTEXT_PC);
}

// ---- Part 4: Dynamic Trace ----

console.log('\n--- Part 4: Dynamic Trace ---\n');

let assets = null;
try {
  assets = ensureTranspiledModule();
  console.log(`  Transpiled module source: ${assets.source}`);

  const romModule = await import(pathToFileURL(assets.modulePath).href);
  const rawBlocks =
    romModule.PRELIFTED_BLOCKS ??
    romModule.default?.PRELIFTED_BLOCKS ??
    romModule.blocks ??
    romModule.default ??
    romModule;
  const blocks = normalizeBlocks(rawBlocks);
  console.log(`  Loaded ${Object.keys(blocks).length} blocks.`);

  console.log('  Cold-booting + mem-init...');
  const traceResult = runDynamicTrace(blocks, staticResult.containingEntry);

  console.log('  Boot complete. Trace result:\n');
  console.log(`    Entry:       ${hex(staticResult.containingEntry)}`);
  console.log(`    Steps:       ${traceResult.steps}`);
  console.log(`    Stop reason: ${traceResult.stopReason}`);
  console.log(`    Last PC:     ${hex(traceResult.lastPc)}`);
  console.log(`    Hit target (0x051D89)? ${traceResult.hitTarget ? 'YES' : 'NO'}`);

  // SET 2,(HL) confirmation
  if (traceResult.setEvent) {
    console.log(`\n    SET 2,(HL) CONFIRMED at step ${traceResult.setEvent.step}:`);
    console.log(`      PC = ${hex(traceResult.setEvent.pc)}`);
    console.log(`      D003E0: ${hexByte(traceResult.setEvent.before)} -> ${hexByte(traceResult.setEvent.after)}`);
    console.log(`      Bit 2 toggled: ${(traceResult.setEvent.before & 0x04) === 0 ? 'clear' : 'set'} -> ${(traceResult.setEvent.after & 0x04) !== 0 ? 'set' : 'clear'}`);
  } else {
    console.log('\n    SET 2,(HL) NOT confirmed in this trace path.');
    console.log(`    D003E0 final value: ${hexByte(traceResult.d003e0Final)}`);
  }

  // D003E0 events
  if (traceResult.d003e0Events.length > 0) {
    console.log('\n    All D003E0 write events:');
    for (const event of traceResult.d003e0Events) {
      console.log(`      step=${event.step} pc=${hex(event.pc)} ${hexByte(event.before)}->${hexByte(event.after)} (${event.source})`);
    }
  }

  // Descriptor info
  console.log(`\n    Descriptor ${traceResult.descriptor.index}:`);
  console.log(`      Slot addr: ${hex(traceResult.descriptor.slotAddr)}`);
  console.log(`      Pointer:   ${hex(traceResult.descriptor.pointer)}`);
  console.log(`      Bytes:     ${traceResult.descriptor.bytes.map((b) => hexByte(b)).join(' ')}`);

  // RAM writes summary
  console.log('\n    Unique RAM writes (D00000-D10000):');
  if (traceResult.uniqueRamWrites.length === 0) {
    console.log('      (none)');
  } else {
    for (const w of traceResult.uniqueRamWrites) {
      console.log(`      ${hex(w.addr)}: ${hexByte(w.firstBefore)}->${hexByte(w.lastAfter)} (x${w.count}, first@${hex(w.firstPc)}, last@${hex(w.lastPc)})`);
    }
  }

  // IY changes
  if (traceResult.iyDiffs.length > 0) {
    console.log('\n    IY region changes (IY+offset):');
    for (const diff of traceResult.iyDiffs) {
      console.log(`      IY+${hex(diff.offset, 2)} (${hex(diff.addr)}): ${hexByte(diff.before)}->${hexByte(diff.after)}`);
    }
  } else {
    console.log('\n    IY region: no changes.');
  }

  // Block path
  console.log(`\n    Block path (${traceResult.blockPath.length} entries):`);
  for (let i = 0; i < traceResult.blockPath.length; i++) {
    const pc = traceResult.blockPath[i];
    const marker = pc === TARGET_PC ? ' <<<< SET 2,(HL)' : '';
    console.log(`      [${String(i).padStart(3)}] ${hex(pc)}  ${regionLabel(pc)}${marker}`);
  }

} catch (err) {
  console.error('Dynamic trace failed:', err.message);
  if (err.stack) console.error(err.stack);
} finally {
  cleanupTranspiledModule(assets);
}

console.log('\n=== Phase 240 probe complete ===');
