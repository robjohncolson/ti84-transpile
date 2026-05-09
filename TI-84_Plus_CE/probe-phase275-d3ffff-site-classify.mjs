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

const KERNEL_INIT_REQUEST_PC = 0x000280;
const KERNEL_INIT_FALLBACK_PC = 0x020028;
const KERNEL_INIT_STEPS = 5000;
const KERNEL_INIT_LOOP_LIMIT = 10000;

const STACK_TOP = 0xD1A87E;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;
const MBASE = 0xD0;
const RETURN_SENTINEL = 0x7FFFFE;

const D3F_START = 0xD3F000;
const D3F_END = 0xD3FFFF;
const TOP_ENTRY_START = 0xD3FFF7;

const D02590 = 0xD02590;
const D02593 = 0xD02593;
const D0259A = 0xD0259A;
const D0259D = 0xD0259D;

const DISASM_BYTES = 16;
const LOOKAHEAD_BYTES = 40;
const TRACE_STEPS = 50;
const TRACE_BLOCK_SEARCH = 16;
const TRACE_LOOP_LIMIT = 512;

const TARGET_SITES = [
  0x028AEF,
  0x029E23,
  0x03F20E,
  0x04A574,
  0x06B728,
  0x06F4FC,
  0x09DEF4,
  0x0A5F91,
  0x0B7CC0,
  0x0B7CF2,
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

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null };
  }

  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase275-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath };
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

function resolveKernelInitEntry(blocks) {
  const candidates = [
    { key: '000280:adl', pc: KERNEL_INIT_REQUEST_PC, mode: 'adl' },
    { key: '000280:z80', pc: KERNEL_INIT_REQUEST_PC, mode: 'z80' },
    { key: '020028:adl', pc: KERNEL_INIT_FALLBACK_PC, mode: 'adl' },
  ];

  for (const candidate of candidates) {
    if (blocks[candidate.key]) {
      return candidate;
    }
  }

  throw new Error('Unable to locate a lifted kernelInit block for 0x000280 or 0x020028.');
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_SNAPSHOT_FIELDS) {
    cpu[field] = snapshot[field];
  }
}

function snapshotRuntime(cpu, mem) {
  return {
    cpu: snapshotCpu(cpu),
    memory: new Uint8Array(mem),
  };
}

function restoreRuntime(cpu, mem, snapshot) {
  mem.set(snapshot.memory);
  restoreCpu(cpu, snapshot.cpu);
}

function reg8(name) {
  if (name === '(hl)') {
    return '(HL)';
  }
  return String(name).toUpperCase();
}

function reg16(name) {
  return String(name).toUpperCase();
}

function indirect(name) {
  return `(${reg16(name)})`;
}

function displacement(value) {
  if (!value) {
    return '';
  }
  return value > 0 ? `+${hexByte(value)}` : `-${hexByte(-value)}`;
}

function formatInstruction(ins) {
  switch (ins.tag) {
    case 'ld-pair-imm':
      return `LD ${reg16(ins.pair)}, ${hex(ins.value)}`;
    case 'ld-pair-mem':
      if (ins.direction === 'to-mem') {
        return `LD (${hex(ins.addr)}), ${reg16(ins.pair)}`;
      }
      return `LD ${reg16(ins.pair)}, (${hex(ins.addr)})`;
    case 'ld-reg-ind':
      return `LD ${reg8(ins.dest)}, ${indirect(ins.src)}`;
    case 'ld-ind-reg':
      return `LD ${indirect(ins.dest)}, ${reg8(ins.src)}`;
    case 'ld-reg-imm':
      return `LD ${reg8(ins.dest)}, ${hexByte(ins.value)}`;
    case 'ld-reg-reg':
      return `LD ${reg8(ins.dest)}, ${reg8(ins.src)}`;
    case 'alu-reg':
      return `${String(ins.op).toUpperCase()} ${reg8(ins.src)}`;
    case 'alu-imm':
      return `${String(ins.op).toUpperCase()} ${hexByte(ins.value)}`;
    case 'bit-test':
      return `BIT ${ins.bit}, ${reg8(ins.reg)}`;
    case 'bit-test-ind':
      return `BIT ${ins.bit}, ${indirect(ins.indirectRegister)}`;
    case 'bit-set-ind':
      return `SET ${ins.bit}, ${indirect(ins.indirectRegister)}`;
    case 'bit-res-ind':
      return `RES ${ins.bit}, ${indirect(ins.indirectRegister)}`;
    case 'call':
      return `CALL ${hex(ins.target)}`;
    case 'call-conditional':
      return `CALL ${String(ins.condition).toUpperCase()}, ${hex(ins.target)}`;
    case 'jp':
      return `JP ${hex(ins.target)}`;
    case 'jp-conditional':
      return `JP ${String(ins.condition).toUpperCase()}, ${hex(ins.target)}`;
    case 'jp-indirect':
      return `JP ${indirect(ins.indirectRegister)}`;
    case 'jr':
      return `JR ${hex(ins.target)}`;
    case 'jr-conditional':
      return `JR ${String(ins.condition).toUpperCase()}, ${hex(ins.target)}`;
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${String(ins.condition).toUpperCase()}`;
    case 'push':
      return `PUSH ${reg16(ins.pair)}`;
    case 'pop':
      return `POP ${reg16(ins.pair)}`;
    case 'inc-pair':
      return `INC ${reg16(ins.pair)}`;
    case 'dec-pair':
      return `DEC ${reg16(ins.pair)}`;
    case 'inc-reg':
      return `INC ${reg8(ins.reg)}`;
    case 'dec-reg':
      return `DEC ${reg8(ins.reg)}`;
    case 'add-pair':
      return `ADD ${reg16(ins.dest)}, ${reg16(ins.src)}`;
    case 'sbc-pair':
      return `SBC HL, ${reg16(ins.src)}`;
    case 'adc-pair':
      return `ADC HL, ${reg16(ins.src)}`;
    case 'ex-de-hl':
      return 'EX DE, HL';
    case 'ld-ixd-imm':
      return `LD (${reg16(ins.indexRegister)}${displacement(ins.displacement)}), ${hexByte(ins.value)}`;
    case 'ld-ixd-reg':
      return `LD (${reg16(ins.indexRegister)}${displacement(ins.displacement)}), ${reg8(ins.src)}`;
    case 'ld-reg-ixd':
      return `LD ${reg8(ins.dest)}, (${reg16(ins.indexRegister)}${displacement(ins.displacement)})`;
    case 'alu-ixd':
      return `${String(ins.op).toUpperCase()} (${reg16(ins.indexRegister)}${displacement(ins.displacement)})`;
    case 'nop':
      return 'NOP';
    case 'halt':
      return 'HALT';
    default: {
      const fields = { ...ins };
      delete fields.mode;
      delete fields.modePrefix;
      delete fields.nextPc;
      delete fields.length;
      delete fields.pc;
      return `${ins.tag} ${JSON.stringify(fields)}`;
    }
  }
}

function decodeWindow(rom, startPc, byteCount) {
  const items = [];
  const limit = startPc + byteCount;
  let pc = startPc;

  while (pc < limit) {
    try {
      const decoded = decodeInstruction(rom, pc, 'adl');
      const length = Math.max(1, decoded.length || 1);
      items.push({
        pc,
        length,
        bytes: rom.subarray(pc, pc + length),
        raw: decoded,
        text: formatInstruction(decoded),
      });
      pc += length;
    } catch (error) {
      items.push({
        pc,
        length: 1,
        bytes: rom.subarray(pc, pc + 1),
        raw: { tag: 'db' },
        text: `DB ${hexByte(rom[pc] ?? 0)} ; ${error.message}`,
      });
      pc += 1;
    }
  }

  return items;
}

function firstMeaningfulInstruction(disassembly) {
  return disassembly.slice(1).find((item) => item.raw.tag !== 'nop') ?? disassembly[1] ?? null;
}

function isDirectHlRead(ins) {
  if (!ins) {
    return false;
  }

  if (ins.tag === 'ld-reg-ind' && ins.src === 'hl') {
    return true;
  }
  if (ins.tag === 'bit-test-ind' && ins.indirectRegister === 'hl') {
    return true;
  }
  if (ins.tag === 'alu-reg' && ins.src === '(hl)') {
    return true;
  }
  if (ins.tag === 'ld-pair-ind' && ins.src === 'hl') {
    return true;
  }
  return ['cpi', 'cpir', 'cpd', 'cpdr'].includes(ins.tag);
}

function isDirectHlWrite(ins) {
  if (!ins) {
    return false;
  }

  if (ins.tag === 'ld-ind-reg' && ins.dest === 'hl') {
    return true;
  }
  if (ins.tag === 'ld-ind-imm') {
    return true;
  }
  if (ins.tag === 'ld-ind-pair' && ins.dest === 'hl') {
    return true;
  }
  if ((ins.tag === 'bit-set-ind' || ins.tag === 'bit-res-ind') && ins.indirectRegister === 'hl') {
    return true;
  }
  return ['ldi', 'ldir', 'ldd', 'lddr'].includes(ins.tag);
}

function classifyImmediate(ins) {
  if (!ins) {
    return 'UNKNOWN';
  }
  if (isDirectHlWrite(ins)) {
    return 'REGISTRATION';
  }
  if (isDirectHlRead(ins)) {
    return 'READER';
  }
  if (
    ins.tag === 'push' ||
    ins.tag === 'ex-de-hl' ||
    ins.tag === 'ld-pair-mem' ||
    ins.tag === 'ld-reg-imm' ||
    ins.tag === 'ld-pair-imm' ||
    ins.tag === 'inc-pair' ||
    ins.tag === 'dec-pair' ||
    ins.tag === 'add-pair' ||
    ins.tag === 'call' ||
    ins.tag === 'call-conditional' ||
    ins.tag === 'jp' ||
    ins.tag === 'jp-conditional' ||
    ins.tag === 'jr' ||
    ins.tag === 'jr-conditional'
  ) {
    return 'POINTER-LOAD';
  }
  return 'UNKNOWN';
}

function analyzeLookahead(rom, site) {
  const disassembly = decodeWindow(rom, site, LOOKAHEAD_BYTES);
  let firstRead = null;
  let firstWrite = null;

  for (const item of disassembly.slice(1)) {
    if (!firstRead && isDirectHlRead(item.raw)) {
      firstRead = item;
    }
    if (!firstWrite && isDirectHlWrite(item.raw)) {
      firstWrite = item;
    }
    if (firstRead && firstWrite) {
      break;
    }
  }

  return {
    disassembly,
    firstRead,
    firstWrite,
    hasRead: Boolean(firstRead),
    hasWrite: Boolean(firstWrite),
  };
}

function formatBytes(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
}

function formatNextOpcode(rom, site) {
  const start = site + 4;
  const first = rom[start] ?? 0;
  if ([0x40, 0x49, 0x52, 0x5B, 0xCB, 0xDD, 0xED, 0xFD].includes(first)) {
    return `${hexByte(first)} ${hexByte(rom[start + 1] ?? 0)}`;
  }
  return hexByte(first);
}

function seedSyntheticDispatchState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._ix = IX_BASE;
  cpu._iy = IY_BASE;
  cpu.a = 0x00;
  cpu.f = 0x00;
  cpu.bc = 0x000000;
  cpu.de = 0x000000;
  cpu.hl = 0x000000;
  cpu.sp = (STACK_TOP - 3) & 0xFFFFFF;

  write24(mem, cpu.sp, RETURN_SENTINEL);
  mem.fill(0x00, D3F_START, D3F_END + 1);

  const syntheticTopEntry = [0x12, 0x34, 0x56, 0x78, 0x9A, 0xBC, 0xDE, 0xF0, 0x08];
  for (let index = 0; index < syntheticTopEntry.length; index += 1) {
    mem[(TOP_ENTRY_START + index) & MEM_MASK] = syntheticTopEntry[index];
  }

  write24(mem, D02590, 0xD3FFFF);
  write24(mem, D02593, 0xD3FFFF);
  write24(mem, D0259A, TOP_ENTRY_START);
  write24(mem, D0259D, TOP_ENTRY_START);
}

function isD3FAddress(addr) {
  return addr >= D3F_START && addr <= D3F_END;
}

function findTraceEntry(blocks, site) {
  for (let delta = 0; delta <= TRACE_BLOCK_SEARCH; delta += 1) {
    const pc = (site - delta) & 0xFFFFFF;
    const key = `${pc.toString(16).padStart(6, '0')}:adl`;
    if (blocks[key]) {
      return { pc, delta };
    }
  }
  return { pc: site, delta: null };
}

function traceSite(executor, runtimeSnapshot, blocks, site) {
  const cpu = executor.cpu;
  const mem = cpu.memory;
  restoreRuntime(cpu, mem, runtimeSnapshot);
  seedSyntheticDispatchState(cpu, mem);

  const entry = findTraceEntry(blocks, site);
  const reads = [];
  const writes = [];
  const uniqueBlocks = [];
  const seenBlocks = new Set();
  const dynamicTargets = [];
  const seenTargets = new Set();
  let currentStep = 0;
  let currentBlockPc = entry.pc;
  let currentMode = 'adl';
  let termination = null;

  const originalRead8 = cpu.read8.bind(cpu);
  const originalRead16 = cpu.read16.bind(cpu);
  const originalRead24 = cpu.read24.bind(cpu);
  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  function recordRead(kind, addr, bytes) {
    for (let index = 0; index < bytes.length; index += 1) {
      const byteAddr = (addr + index) & 0xFFFFFF;
      if (!isD3FAddress(byteAddr)) {
        continue;
      }
      reads.push({
        step: currentStep,
        blockPc: currentBlockPc,
        mode: currentMode,
        kind,
        addr: byteAddr,
        value: bytes[index] & 0xFF,
      });
    }
  }

  function recordWrite(kind, addr, beforeBytes, afterBytes) {
    for (let index = 0; index < afterBytes.length; index += 1) {
      const byteAddr = (addr + index) & 0xFFFFFF;
      if (!isD3FAddress(byteAddr)) {
        continue;
      }
      writes.push({
        step: currentStep,
        blockPc: currentBlockPc,
        mode: currentMode,
        kind,
        addr: byteAddr,
        before: beforeBytes[index] & 0xFF,
        after: afterBytes[index] & 0xFF,
      });
    }
  }

  cpu.read8 = (addr) => {
    const value = originalRead8(addr);
    recordRead('read8', addr, [value]);
    return value;
  };

  cpu.read16 = (addr) => {
    const a = addr & 0xFFFFFF;
    const bytes = [mem[a & MEM_MASK] ?? 0, mem[(a + 1) & MEM_MASK] ?? 0];
    const value = originalRead16(addr);
    recordRead('read16', a, bytes);
    return value;
  };

  cpu.read24 = (addr) => {
    const a = addr & 0xFFFFFF;
    const bytes = [
      mem[a & MEM_MASK] ?? 0,
      mem[(a + 1) & MEM_MASK] ?? 0,
      mem[(a + 2) & MEM_MASK] ?? 0,
    ];
    const value = originalRead24(addr);
    recordRead('read24', a, bytes);
    return value;
  };

  cpu.write8 = (addr, value) => {
    const a = addr & 0xFFFFFF;
    const before = [mem[a & MEM_MASK] ?? 0];
    const result = originalWrite8(addr, value);
    recordWrite('write8', a, before, [value & 0xFF]);
    return result;
  };

  cpu.write16 = (addr, value) => {
    const a = addr & 0xFFFFFF;
    const before = [mem[a & MEM_MASK] ?? 0, mem[(a + 1) & MEM_MASK] ?? 0];
    const result = originalWrite16(addr, value);
    recordWrite('write16', a, before, [value & 0xFF, (value >>> 8) & 0xFF]);
    return result;
  };

  cpu.write24 = (addr, value) => {
    const a = addr & 0xFFFFFF;
    const before = [
      mem[a & MEM_MASK] ?? 0,
      mem[(a + 1) & MEM_MASK] ?? 0,
      mem[(a + 2) & MEM_MASK] ?? 0,
    ];
    const result = originalWrite24(addr, value);
    recordWrite('write24', a, before, [
      value & 0xFF,
      (value >>> 8) & 0xFF,
      (value >>> 16) & 0xFF,
    ]);
    return result;
  };

  try {
    const STOP = '__PHASE275_RETURN__';
    try {
      const result = executor.runFrom(entry.pc, 'adl', {
        maxSteps: TRACE_STEPS,
        maxLoopIterations: TRACE_LOOP_LIMIT,
        onBlock(pc, mode, _meta, step) {
          currentStep = step;
          currentBlockPc = pc & 0xFFFFFF;
          currentMode = mode ?? currentMode;
          const key = `${hex(currentBlockPc)}:${currentMode}`;
          if (!seenBlocks.has(key)) {
            seenBlocks.add(key);
            uniqueBlocks.push(key);
          }
        },
        onMissingBlock(pc, mode, step) {
          currentStep = step;
          currentBlockPc = pc & 0xFFFFFF;
          currentMode = mode ?? currentMode;
          if ((pc & 0xFFFFFF) === RETURN_SENTINEL) {
            const stop = new Error(STOP);
            throw stop;
          }
        },
        onDynamicTarget(target) {
          const normalized = target & 0xFFFFFF;
          if (!seenTargets.has(normalized)) {
            seenTargets.add(normalized);
            dynamicTargets.push(normalized);
          }
        },
      });
      termination = result.termination ?? 'unknown';
    } catch (error) {
      if (error?.message === STOP) {
        termination = 'return';
      } else {
        throw error;
      }
    }
  } finally {
    cpu.read8 = originalRead8;
    cpu.read16 = originalRead16;
    cpu.read24 = originalRead24;
    cpu.write8 = originalWrite8;
    cpu.write16 = originalWrite16;
    cpu.write24 = originalWrite24;
  }

  return {
    entry,
    termination,
    reads,
    writes,
    uniqueBlocks,
    dynamicTargets,
  };
}

function chooseClassification(immediateClass, lookahead, trace) {
  if (trace.writes.length > 0 || lookahead.hasWrite || immediateClass === 'REGISTRATION') {
    return 'REGISTRATION';
  }
  if (trace.reads.length > 0 || lookahead.hasRead || immediateClass === 'READER') {
    return 'READER';
  }
  if (immediateClass === 'POINTER-LOAD') {
    return 'POINTER-LOAD';
  }
  return 'UNKNOWN';
}

function summarizeLookahead(lookahead) {
  const parts = [];
  if (lookahead.firstRead) {
    parts.push(`read=${lookahead.firstRead.text}`);
  }
  if (lookahead.firstWrite) {
    parts.push(`write=${lookahead.firstWrite.text}`);
  }
  return parts.length ? parts.join('; ') : 'no direct (HL) access in +0x28 bytes';
}

function summarizeTrace(trace) {
  const pieces = [];
  pieces.push(trace.entry.delta === 0 ? 'trace=exact' : `trace=block-${hex(trace.entry.pc)}(+${trace.entry.delta})`);
  pieces.push(`term=${trace.termination}`);
  pieces.push(`reads=${trace.reads.length}`);
  pieces.push(`writes=${trace.writes.length}`);

  if (trace.writes.length > 0) {
    const first = trace.writes[0];
    pieces.push(`${hex(first.addr)}:${hexByte(first.before)}->${hexByte(first.after)}`);
  } else if (trace.reads.length > 0) {
    const first = trace.reads[0];
    pieces.push(`${hex(first.addr)}=${hexByte(first.value)}`);
  }

  return pieces.join(', ');
}

function printTable(results, rom) {
  console.log('| address | next_opcode | classification | notes |');
  console.log('|---|---|---|---|');
  for (const result of results) {
    console.log(
      `| ${hex(result.site)} | ${formatNextOpcode(rom, result.site)} | ${result.classification} | ` +
      `${result.note.replace(/\|/g, '\\|')} |`,
    );
  }
  console.log('');
}

function printDisassembly(disassembly) {
  for (const item of disassembly) {
    console.log(`  ${hex(item.pc)}  ${formatBytes(item.bytes).padEnd(18)}  ${item.text}`);
  }
}

function printAccesses(title, events, formatter) {
  console.log(`${title}:`);
  if (events.length === 0) {
    console.log('  (none)');
    return;
  }
  for (const event of events.slice(0, 12)) {
    console.log(`  ${formatter(event)}`);
  }
  if (events.length > 12) {
    console.log(`  ... ${events.length - 12} more`);
  }
}

async function main() {
  const rom = fs.readFileSync(ROM_PATH);
  const { blocks, assets } = await loadBlocks();

  try {
    const mem = new Uint8Array(MEM_SIZE);
    mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));

    const peripherals = createPeripheralBus({ timerInterrupt: false });
    const executor = createExecutor(blocks, mem, { peripherals });
    const cpu = executor.cpu;

    const kernelInit = resolveKernelInitEntry(blocks);
    const bootResult = executor.runFrom(kernelInit.pc, kernelInit.mode, {
      maxSteps: KERNEL_INIT_STEPS,
      maxLoopIterations: KERNEL_INIT_LOOP_LIMIT,
    });
    const runtimeSnapshot = snapshotRuntime(cpu, mem);

    console.log('Phase 275 probe: classify LD HL,0xD3FFFF sites as registration vs reader');
    console.log('');
    console.log(`ROM=${path.basename(ROM_PATH)} bytes=${rom.length}`);
    console.log(
      `boot=${hex(kernelInit.pc)}:${kernelInit.mode} steps=${bootResult.steps} ` +
      `term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}:${bootResult.lastMode}`,
    );
    console.log('dynamic seed: D0259A/D0259D=0xD3FFF7, D02590/D02593=0xD3FFFF, top-slot tail byte=0x08');
    console.log(`trace budget: ${TRACE_STEPS} lifted blocks/site using createPeripheralBus({ timerInterrupt: false })`);
    console.log('');

    const results = TARGET_SITES.map((site) => {
      const disassembly = decodeWindow(rom, site, DISASM_BYTES);
      const immediate = firstMeaningfulInstruction(disassembly);
      const immediateClass = classifyImmediate(immediate?.raw ?? null);
      const lookahead = analyzeLookahead(rom, site);
      const trace = traceSite(executor, runtimeSnapshot, blocks, site);
      const classification = chooseClassification(immediateClass, lookahead, trace);
      const note =
        `after=${immediate ? immediate.text : 'n/a'}; ` +
        `${summarizeLookahead(lookahead)}; ${summarizeTrace(trace)}`;

      return {
        site,
        disassembly,
        immediate,
        immediateClass,
        lookahead,
        trace,
        classification,
        note,
      };
    });

    printTable(results, rom);

    for (const result of results) {
      console.log(`## ${hex(result.site)}  ${result.classification}`);
      console.log('');
      console.log('disassembly (+0x10 bytes):');
      printDisassembly(result.disassembly);
      console.log('');
      console.log(`static heuristic: immediate=${result.immediateClass}; ${summarizeLookahead(result.lookahead)}`);
      console.log(
        `dynamic trace: entry=${hex(result.trace.entry.pc)} ` +
        `${result.trace.entry.delta === 0 ? '(exact)' : `(nearest lifted block, starts ${result.trace.entry.delta} byte(s) early)`} ` +
        `termination=${result.trace.termination}`,
      );
      if (result.trace.dynamicTargets.length > 0) {
        console.log(`dynamic targets: ${result.trace.dynamicTargets.map((value) => hex(value)).join(', ')}`);
      } else {
        console.log('dynamic targets: (none)');
      }
      printAccesses(
        'D3F reads',
        result.trace.reads,
        (event) =>
          `step=${String(event.step).padStart(3, ' ')} block=${hex(event.blockPc)} ` +
          `${event.kind} ${hex(event.addr)} => ${hexByte(event.value)}`,
      );
      printAccesses(
        'D3F writes',
        result.trace.writes,
        (event) =>
          `step=${String(event.step).padStart(3, ' ')} block=${hex(event.blockPc)} ` +
          `${event.kind} ${hex(event.addr)}: ${hexByte(event.before)} -> ${hexByte(event.after)}`,
      );
      console.log(`blocks: ${result.trace.uniqueBlocks.length ? result.trace.uniqueBlocks.join(' -> ') : '(none)'}`);
      console.log('');
    }
  } finally {
    cleanupTranspiledModule(assets);
  }
}

await main();
