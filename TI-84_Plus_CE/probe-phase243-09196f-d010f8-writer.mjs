#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;
const ROM_SCAN_LIMIT = 0x0C0000;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_ENTRY = 0x08C331;
const MEM_INIT_ENTRY = 0x0802B2;
const STACK_RESET_TOP = 0xD1A87E;

const STAGE_1_ENTRY = 0x0A2B72;
const STAGE_2_ENTRY = 0x0A3301;
const STAGE_3_ENTRY = 0x0A29EC;
const STAGE_4_ENTRY = 0x0A2854;
const STAGE_MAX_LOOP_ITERATIONS = 500;

const MBASE = 0xD0;
const IX_HOME = 0xD1A860;
const IY_HOME = 0xD00080;
const RETURN_SENTINEL = 0x7FFFFE;

const TARGET_PC = 0x09196F;
const TARGET_RAM = 0xD010F8;
const RANGE_SCAN_START = 0x091960;
const RANGE_SCAN_END = 0x091980;
const ROM_CONTEXT_START = 0x091960;
const ROM_CONTEXT_END = 0x0919B0;
const TRACE_A_VALUES = [0x00, 0x01, 0x02, 0xFF];
const TRACE_STEPS = 200;
const FUNCTION_LOOKBACK = 0x200;
const FUNCTION_LOOKAHEAD = 0x120;

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const TRANSFER_OPS = new Map([
  [0xCD, 'CALL'],
  [0xC4, 'CALL NZ'],
  [0xCC, 'CALL Z'],
  [0xD4, 'CALL NC'],
  [0xDC, 'CALL C'],
  [0xE4, 'CALL PO'],
  [0xEC, 'CALL PE'],
  [0xF4, 'CALL P'],
  [0xFC, 'CALL M'],
  [0xC3, 'JP'],
  [0xC2, 'JP NZ'],
  [0xCA, 'JP Z'],
  [0xD2, 'JP NC'],
  [0xDA, 'JP C'],
  [0xE2, 'JP PO'],
  [0xEA, 'JP PE'],
  [0xF2, 'JP P'],
  [0xFA, 'JP M'],
]);

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function regionLabel(addr) {
  const page = (addr >>> 16) & 0xFF;
  if (page <= 0x03) return 'OS-low';
  if (page === 0x04) return 'OS-core';
  if (page === 0x05) return 'editor/cxMain';
  if (page === 0x06) return 'editor2';
  if (page === 0x07) return 'OS-07';
  if (page === 0x08) return 'UI/menu';
  if (page === 0x09) return 'STAT';
  return `apps/${hex(page, 2)}xxxx`;
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

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function ensureTranspiledModule() {
  if (!fs.existsSync(TRANSPILED_JS_PATH)) {
    execFileSync(process.execPath, ['scripts/transpile-ti84-rom.mjs'], {
      cwd: REPO_ROOT,
      stdio: 'inherit',
    });
  }
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null, source: 'js' };
  }
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase243-${process.pid}.mjs`);
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
    case 'inc-reg': return `${prefix}INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg': return `${prefix}DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair': return `${prefix}INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair': return `${prefix}DEC ${String(inst.pair).toUpperCase()}`;
    case 'add-pair': return `${prefix}ADD ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'alu-imm': return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'alu-reg': return `${prefix}${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'push': return `${prefix}PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `${prefix}POP ${String(inst.pair).toUpperCase()}`;
    case 'ldir': return `${prefix}LDIR`;
    case 'lddr': return `${prefix}LDDR`;
    case 'scf': return `${prefix}SCF`;
    case 'ccf': return `${prefix}CCF`;
    case 'di': return `${prefix}DI`;
    case 'ei': return `${prefix}EI`;
    case 'nop': return `${prefix}NOP`;
    case 'halt': return `${prefix}HALT`;
    case 'ex-de-hl': return `${prefix}EX DE, HL`;
    case 'lea': return `${prefix}LEA ${String(inst.dest).toUpperCase()}, ${formatIndexed(inst.base, inst.displacement)}`;
    default: return `${prefix}[${inst.tag}]`;
  }
}

function decodeSafe(rom, pc, mode = 'adl') {
  try {
    return decodeInstruction(rom, pc & 0xFFFFFF, mode);
  } catch {
    return null;
  }
}

function makeRow(rom, inst) {
  const length = Math.max(1, inst?.length ?? 1);
  return { pc: inst.pc, inst, bytes: bytesAt(rom, inst.pc, length), text: formatInstruction(inst) };
}

function rawRow(rom, pc, length = 1) {
  return { pc, inst: null, bytes: bytesAt(rom, pc, length), text: `DB ${hexByte(rom[pc] ?? 0)}` };
}

function decodeLinear(rom, startPc, endPc, mode = 'adl') {
  const rows = [];
  let pc = startPc;
  let guard = 0;
  const limit = Math.min(rom.length, endPc);
  while (pc < limit && guard < 4096) {
    const inst = decodeSafe(rom, pc, mode);
    if (!inst || !inst.length || inst.nextPc <= pc) {
      rows.push(rawRow(rom, pc));
      pc += 1;
      guard += 1;
      continue;
    }
    rows.push(makeRow(rom, inst));
    pc = inst.nextPc;
    guard += 1;
  }
  return rows;
}

function decodeForwardBytes(rom, startPc, byteBudget, mode = 'adl') {
  return decodeLinear(rom, startPc, startPc + byteBudget, mode);
}

function decodeBeforePc(rom, targetPc, lookbackBytes, mode = 'adl') {
  const startBase = Math.max(0, targetPc - lookbackBytes);
  let best = null;
  for (let offset = 0; offset < 8 && startBase + offset < targetPc; offset += 1) {
    const rows = [];
    let pc = startBase + offset;
    let errors = 0;
    let guard = 0;
    while (pc < targetPc && guard < 4096) {
      const inst = decodeSafe(rom, pc, mode);
      if (!inst || !inst.length || inst.nextPc <= pc || inst.nextPc > targetPc) {
        errors += 1;
        pc += 1;
        guard += 1;
        continue;
      }
      rows.push(makeRow(rom, inst));
      pc = inst.nextPc;
      guard += 1;
    }
    const exact = pc === targetPc;
    const score = (exact ? 1000 : 0) - (errors * 100) + rows.length;
    if (!best || score > best.score) best = { exact, score, rows };
  }
  if (best?.exact) return best.rows;
  return decodeForwardBytes(rom, startBase, targetPc - startBase, mode).filter((row) => row.pc < targetPc);
}

function printRows(rows, highlightPc = null, indent = '  ') {
  for (const row of rows) {
    const marker = row.pc === highlightPc ? '>>' : '  ';
    console.log(`${indent}${marker} ${hex(row.pc)}  ${row.bytes.padEnd(24)} ${row.text}`);
  }
}

function dumpRawBytes(rom, start, end) {
  console.log(`Raw ROM bytes ${hex(start)}-${hex(end)} (${end - start} bytes):`);
  for (let addr = start; addr < end; addr += 16) {
    console.log(`  ${hex(addr)}: ${bytesAt(rom, addr, Math.min(16, end - addr))}`);
  }
  console.log('');
}

function scanTransfersToRange(rom, rangeStart, rangeEnd) {
  const hits = [];
  for (let pc = 0; pc <= Math.min(rom.length, ROM_SCAN_LIMIT) - 4; pc += 1) {
    const kind = TRANSFER_OPS.get(rom[pc]);
    if (!kind) continue;
    const target = read24LE(rom, pc + 1);
    if (target < rangeStart || target > rangeEnd) continue;
    hits.push({ pc, kind, target, region: regionLabel(pc) });
  }
  return hits;
}

function scanTransfersToTarget(rom, targetPc) {
  const hits = [];
  for (let pc = 0; pc <= Math.min(rom.length, ROM_SCAN_LIMIT) - 4; pc += 1) {
    const kind = TRANSFER_OPS.get(rom[pc]);
    if (!kind) continue;
    if (read24LE(rom, pc + 1) !== targetPc) continue;
    hits.push({ pc, kind, target: targetPc, region: regionLabel(pc) });
  }
  return hits;
}

function isSplitTerminator(inst) {
  return ['ret', 'jp', 'jp-indirect', 'halt', 'slp'].includes(inst?.tag);
}

function linearlyReaches(rom, entryPc, targetPc) {
  if (entryPc > targetPc) return false;
  if (entryPc === targetPc) return true;
  let pc = entryPc;
  let guard = 0;
  while (pc < targetPc && guard < 4096) {
    const inst = decodeSafe(rom, pc, 'adl');
    if (!inst || !inst.length || inst.nextPc <= pc) return false;
    if (['ret', 'jp', 'jp-indirect', 'jr', 'halt', 'slp'].includes(inst.tag)) {
      return inst.nextPc === targetPc;
    }
    pc = inst.nextPc;
    guard += 1;
  }
  return pc === targetPc;
}

function decodeFunctionRows(rom, entryPc, targetPc) {
  const rows = [];
  let pc = entryPc;
  let seenTarget = false;
  let guard = 0;
  const limit = Math.min(rom.length, entryPc + FUNCTION_LOOKAHEAD);
  while (pc < limit && guard < 4096) {
    const inst = decodeSafe(rom, pc, 'adl');
    if (!inst || !inst.length || inst.nextPc <= pc) {
      rows.push(rawRow(rom, pc));
      pc += 1;
      guard += 1;
      continue;
    }
    rows.push(makeRow(rom, inst));
    if (pc === targetPc) seenTarget = true;
    pc = inst.nextPc;
    if (seenTarget && inst.tag === 'ret') break;
    guard += 1;
  }
  return rows;
}

function analyzeStatic(rom) {
  const contextRows = decodeLinear(rom, ROM_CONTEXT_START, ROM_CONTEXT_END);
  const beforeRows = decodeBeforePc(rom, TARGET_PC, FUNCTION_LOOKBACK);
  let nearestRetRow = null;
  for (const row of beforeRows) {
    if (row.inst?.tag === 'ret') nearestRetRow = row;
  }

  const wideRegionStart = nearestRetRow?.inst?.nextPc ?? beforeRows[0]?.pc ?? TARGET_PC;
  const wideRows = decodeLinear(rom, wideRegionStart, TARGET_PC);
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
    reachesTarget: linearlyReaches(rom, entry, TARGET_PC),
    callers: scanTransfersToTarget(rom, entry),
  }));

  let containing = splitEntries.filter((item) => item.reachesTarget && item.callers.length > 0).sort((a, b) => b.entry - a.entry)[0];
  if (!containing) containing = splitEntries.filter((item) => item.reachesTarget).sort((a, b) => b.entry - a.entry)[0];

  const containingEntry = containing?.entry ?? TARGET_PC;
  const functionRows = decodeFunctionRows(rom, containingEntry, TARGET_PC);
  const lastFunctionRow = functionRows[functionRows.length - 1] ?? null;
  const functionEnd = lastFunctionRow?.inst?.nextPc ?? ((lastFunctionRow?.pc ?? containingEntry) + 1);

  return {
    contextRows,
    nearestRetRow,
    wideRegionStart,
    splitEntries,
    containingEntry,
    functionRows,
    functionEnd,
    rangeHits: scanTransfersToRange(rom, RANGE_SCAN_START, RANGE_SCAN_END),
    entryHits: scanTransfersToTarget(rom, containingEntry),
  };
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = MBASE;
  cpu._iy = IY_HOME;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const memInit = executor.runFrom(MEM_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return { boot, kernelInit, memInit };
}

function runHomeScreenStages(executor, cpu, mem) {
  const cpuSnap = snapshotCpu(cpu);
  const stages = [];
  for (const entry of [STAGE_1_ENTRY, STAGE_2_ENTRY, STAGE_3_ENTRY, STAGE_4_ENTRY]) {
    restoreCpu(cpu, cpuSnap);
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu._ix = IX_HOME;
    cpu._iy = IY_HOME;
    cpu.f = 0x40;
    cpu.sp = STACK_RESET_TOP - 12;
    mem.fill(0xFF, cpu.sp, cpu.sp + 12);
    if (entry === STAGE_2_ENTRY) mem[0xD0009B] &= ~0x40;
    stages.push(executor.runFrom(entry, 'adl', {
      maxSteps: entry <= STAGE_2_ENTRY ? 30000 : 50000,
      maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS,
    }));
  }
  return stages;
}

function installRamWriteWatch(cpu, mem, start = 0xD00000, end = 0xE00000) {
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
    if (masked < start || masked >= end) return;
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

function prepareDirectTrace(cpu, mem, warmCpu, aValue) {
  restoreCpu(cpu, warmCpu);
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._ix = IX_HOME;
  cpu._iy = IY_HOME;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
  cpu.a = aValue & 0xFF;
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, RETURN_SENTINEL);
  mem[TARGET_RAM] = 0xEE;
}

function extractSubCalls(meta, fallbackPc) {
  const calls = [];
  for (const inst of meta?.instructions ?? []) {
    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      calls.push({ pc: inst.pc ?? fallbackPc, target: inst.target, dasm: inst.dasm ?? formatInstruction(inst) });
    }
  }
  return calls;
}

function summarizeBehavior(results) {
  const mirrored = results.every((trace) => {
    const lastWrite = trace.d010f8Events[trace.d010f8Events.length - 1];
    return !!lastWrite && lastWrite.after === trace.aValue;
  });
  if (mirrored) {
    return 'Direct-entry traces show 0x09196F behaves as a passthrough byte setter: D010F8 <- A.';
  }
  const ones = results.filter((trace) => trace.finalD010F8 === 0x01).map((trace) => hexByte(trace.aValue));
  if (ones.length > 0) {
    return `Only these direct A seeds ended with D010F8==0x01: ${ones.join(', ')}.`;
  }
  return 'No direct-entry seed produced D010F8==0x01 in the direct write-site traces.';
}

function printTransferHits(label, hits) {
  console.log(label);
  if (hits.length === 0) {
    console.log('  (none found)');
    console.log('');
    return;
  }
  for (const hit of hits) {
    console.log(`  ${hit.kind.padEnd(10)} ${hex(hit.target)} at ${hex(hit.pc)}  ${hit.region}`);
  }
  console.log('');
}

function printRegisterSummary(label, cpuSnapshot) {
  console.log(label);
  console.log(`  A=${hexByte(cpuSnapshot.a)} F=${hexByte(cpuSnapshot.f)} BC=${hex(cpuSnapshot._bc)} DE=${hex(cpuSnapshot._de)} HL=${hex(cpuSnapshot._hl)}`);
  console.log(`  SP=${hex(cpuSnapshot.sp)} IX=${hex(cpuSnapshot._ix)} IY=${hex(cpuSnapshot._iy)} MBASE=${hexByte(cpuSnapshot.mbase)} ADL=${cpuSnapshot.madl ? '1' : '0'}`);
  console.log('');
}

function runDirectTrace(executor, cpu, mem, warmMem, warmCpu, aValue) {
  mem.set(warmMem);
  prepareDirectTrace(cpu, mem, warmCpu, aValue);

  const entryCpu = snapshotCpu(cpu);
  const watch = installRamWriteWatch(cpu, mem);
  const blockPath = [];
  const uniqueBlocks = new Map();
  const subCalls = new Map();
  let stopReason = 'max_steps';
  let runResult = null;

  try {
    runResult = executor.runFrom(TARGET_PC, 'adl', {
      maxSteps: TRACE_STEPS,
      maxLoopIterations: 256,
      onBlock(pc, mode, meta, step) {
        watch.updateContext(pc, step);
        const normalizedPc = pc & 0xFFFFFF;
        const key = `${hex(normalizedPc)}:${mode}`;
        const firstDasm = meta?.instructions?.[0]?.dasm ?? formatInstruction(meta?.instructions?.[0]);
        blockPath.push({ step: (step ?? 0) + 1, pc: normalizedPc, dasm: firstDasm });
        if (!uniqueBlocks.has(key)) uniqueBlocks.set(key, { pc: normalizedPc, mode, dasm: firstDasm });
        for (const call of extractSubCalls(meta, normalizedPc)) {
          const callKey = `${call.pc}:${call.target}`;
          if (!subCalls.has(callKey)) subCalls.set(callKey, call);
        }
        if (normalizedPc === RETURN_SENTINEL) throw new Error('__RETURN_SENTINEL__');
      },
      onMissingBlock(pc, _mode, step) {
        watch.updateContext(pc, step);
        if ((pc & 0xFFFFFF) === RETURN_SENTINEL) throw new Error('__RETURN_SENTINEL__');
      },
    });
    stopReason = runResult.termination;
  } catch (error) {
    if (error?.message === '__RETURN_SENTINEL__') {
      stopReason = 'return_sentinel';
    } else {
      throw error;
    }
  } finally {
    watch.dispose();
  }

  return {
    aValue,
    beforeD010F8: 0xEE,
    finalD010F8: mem[TARGET_RAM] & 0xFF,
    stopReason,
    steps: runResult?.steps ?? blockPath.length,
    lastPc: runResult?.lastPc ?? blockPath[blockPath.length - 1]?.pc ?? TARGET_PC,
    blockPath,
    uniqueBlocks: [...uniqueBlocks.values()],
    subCalls: [...subCalls.values()],
    allRamWrites: watch.events,
    uniqueRamWrites: summarizeUniqueRamWrites(watch.events),
    d010f8Events: watch.events.filter((event) => event.addr === TARGET_RAM),
    entryCpu,
    exitCpu: snapshotCpu(cpu),
  };
}

async function main() {
  console.log('=== Phase 243: Trace 0x09196F -- sole D010F8 writer in STAT region ===');
  console.log('');

  const rom = fs.readFileSync(ROM_PATH);
  console.log(`ROM: ${path.basename(ROM_PATH)} (${rom.length} bytes)`);
  console.log('');

  console.log('--- Part 1: Raw ROM window and disassembly ---');
  console.log('');
  dumpRawBytes(rom, ROM_CONTEXT_START, ROM_CONTEXT_END);
  const staticResult = analyzeStatic(rom);
  printRows(staticResult.contextRows, TARGET_PC);
  console.log('');

  console.log('--- Part 2: Function boundary containing 0x09196F ---');
  console.log('');
  console.log(`Nearest RET before target: ${staticResult.nearestRetRow ? hex(staticResult.nearestRetRow.pc) : 'none found'}`);
  console.log(`Wide scan start:           ${hex(staticResult.wideRegionStart)}`);
  console.log(`Chosen containing entry:   ${hex(staticResult.containingEntry)}`);
  console.log(`Approx function end:       ${hex(staticResult.functionEnd)}`);
  console.log(`Approx function size:      ${staticResult.functionEnd - staticResult.containingEntry} bytes`);
  console.log('');
  console.log('Candidate entries:');
  for (const entry of staticResult.splitEntries) {
    console.log(`  ${hex(entry.entry)}  callers=${entry.callers.length}  reaches_target=${entry.reachesTarget ? 'yes' : 'no'}`);
  }
  console.log('');
  printRows(staticResult.functionRows, TARGET_PC);
  console.log('');

  console.log('--- Part 3: Static caller scan ---');
  console.log('');
  printTransferHits(`CALL/JP into ${hex(RANGE_SCAN_START)}-${hex(RANGE_SCAN_END)}:`, staticResult.rangeHits);
  printTransferHits(`CALL/JP to containing entry ${hex(staticResult.containingEntry)}:`, staticResult.entryHits);

  const assets = ensureTranspiledModule();
  try {
    console.log('--- Part 4: Dynamic direct-entry traces ---');
    console.log('');
    console.log(`Transpiled blocks source: ${assets.source}`);
    console.log('');

    const romModule = await import(pathToFileURL(assets.modulePath).href);
    const blocks = normalizeBlocks(
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      romModule,
    );

    const mem = new Uint8Array(MEM_SIZE);
    mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));

    const peripherals = createPeripheralBus({ timerInterrupt: false });
    const executor = createExecutor(blocks, mem, { peripherals });
    const cpu = executor.cpu;

    const bootSummary = coldBoot(executor, cpu, mem);
    const stages = runHomeScreenStages(executor, cpu, mem);
    const warmCpu = snapshotCpu(cpu);
    const warmMem = new Uint8Array(mem);

    console.log(`boot:       steps=${bootSummary.boot.steps} term=${bootSummary.boot.termination} lastPc=${hex(bootSummary.boot.lastPc)}`);
    console.log(`kernelInit: steps=${bootSummary.kernelInit.steps} term=${bootSummary.kernelInit.termination} lastPc=${hex(bootSummary.kernelInit.lastPc)}`);
    console.log(`memInit:    steps=${bootSummary.memInit.steps} term=${bootSummary.memInit.termination} lastPc=${hex(bootSummary.memInit.lastPc)}`);
    for (let i = 0; i < stages.length; i += 1) {
      console.log(`stage${i + 1}:     steps=${stages[i].steps} term=${stages[i].termination} lastPc=${hex(stages[i].lastPc)}`);
    }
    console.log('');

    const traces = [];
    for (const aValue of TRACE_A_VALUES) {
      const trace = runDirectTrace(executor, cpu, mem, warmMem, warmCpu, aValue);
      traces.push(trace);

      console.log(`Trace A=${hexByte(aValue)}`);
      printRegisterSummary('Entry registers:', trace.entryCpu);
      console.log(`Result: steps=${trace.steps} stop=${trace.stopReason} lastPc=${hex(trace.lastPc)}`);
      console.log(`D010F8: before=${hexByte(trace.beforeD010F8)} after=${hexByte(trace.finalD010F8)}`);
      console.log('');

      console.log(`Unique blocks (${trace.uniqueBlocks.length}):`);
      for (const block of trace.uniqueBlocks) {
        console.log(`  ${hex(block.pc)}:${block.mode}  ${block.dasm}`);
      }
      console.log('');

      console.log(`Sub-calls (${trace.subCalls.length}):`);
      if (trace.subCalls.length === 0) {
        console.log('  (none)');
      } else {
        for (const call of trace.subCalls) {
          console.log(`  ${hex(call.pc)} -> ${hex(call.target)}  ${call.dasm}`);
        }
      }
      console.log('');

      console.log(`RAM writes (${trace.allRamWrites.length} total):`);
      if (trace.allRamWrites.length === 0) {
        console.log('  (none)');
      } else {
        for (const event of trace.allRamWrites.slice(0, 32)) {
          const marker = event.addr === TARGET_RAM ? ' <== D010F8' : '';
          console.log(`  step=${String(event.step).padStart(3)} pc=${hex(event.pc)} ${hex(event.addr)} ${hexByte(event.before)}->${hexByte(event.after)} ${event.source}${marker}`);
        }
        if (trace.allRamWrites.length > 32) {
          console.log(`  ... ${trace.allRamWrites.length - 32} more`);
        }
      }
      console.log('');

      console.log(`Unique RAM writes (${trace.uniqueRamWrites.length}):`);
      if (trace.uniqueRamWrites.length === 0) {
        console.log('  (none)');
      } else {
        for (const write of trace.uniqueRamWrites) {
          const marker = write.addr === TARGET_RAM ? ' <== D010F8' : '';
          console.log(`  ${hex(write.addr)} ${hexByte(write.firstBefore)}->${hexByte(write.lastAfter)} x${write.count} first@${hex(write.firstPc)} last@${hex(write.lastPc)}${marker}`);
        }
      }
      console.log('');

      console.log(`D010F8 events (${trace.d010f8Events.length}):`);
      if (trace.d010f8Events.length === 0) {
        console.log('  (none)');
      } else {
        for (const event of trace.d010f8Events) {
          console.log(`  step=${event.step} pc=${hex(event.pc)} ${hexByte(event.before)}->${hexByte(event.after)}`);
        }
      }
      console.log('');

      printRegisterSummary('Exit registers:', trace.exitCpu);
      console.log('Block path:');
      for (const step of trace.blockPath) {
        console.log(`  [${String(step.step).padStart(3)}] ${hex(step.pc)}  ${step.dasm}`);
      }
      console.log('');
    }

    console.log('--- Part 5: Report ---');
    console.log('');
    console.log(`Containing function: ${hex(staticResult.containingEntry)} .. ${hex(staticResult.functionEnd)} (${staticResult.functionEnd - staticResult.containingEntry} bytes)`);
    console.log('Structure:');
    for (const row of staticResult.functionRows) {
      console.log(`  ${hex(row.pc)}  ${row.text}`);
    }
    console.log('');

    const d010f8EqualsOne = traces.filter((trace) => trace.finalD010F8 === 0x01).map((trace) => hexByte(trace.aValue));
    console.log(`A values producing D010F8==0x01: ${d010f8EqualsOne.length > 0 ? d010f8EqualsOne.join(', ') : '(none)'}`);
    console.log(summarizeBehavior(traces));
    console.log('');

    printTransferHits('Caller sites to the 0x091960-0x091980 STAT writer window:', staticResult.rangeHits);
    printTransferHits(`Caller sites to inferred function entry ${hex(staticResult.containingEntry)}:`, staticResult.entryHits);

    console.log('Purpose inference:');
    console.log('  The containing slice stores HL -> D01104, DE -> D010F6, and A -> D010F8, then returns.');
    console.log('  In direct-entry mode, 0x09196F isolates the byte store/return tail that controls the D010F8 STAT sub-mode flag.');
  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
