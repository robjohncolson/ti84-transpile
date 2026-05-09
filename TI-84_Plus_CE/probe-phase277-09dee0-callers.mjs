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
const RAM_START = 0xD00000;

const BOOT_PC = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_STEPS = 50000;
const BOOT_LOOP_LIMIT = 10000;

const TARGET_PC = 0x09DEE0;
const TRACE_STEPS = 500;
const TRACE_LOOP_LIMIT = 512;
const TRACE_LOOKBACK = 16;
const RETURN_SENTINEL = 0x7FFFFE;

const STACK_TOP = 0xD1A87E;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;
const MBASE = 0xD0;

const D02590 = 0xD02590;
const D0259A = 0xD0259A;
const D0259D = 0xD0259D;
const SEED_PTR = 0xD3FFF0;
const TABLE_START = 0xD3FFF0;
const TABLE_END = 0xD3FFFE;

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const CALLER_PATTERNS = [
  { opcode: 0xCD, mnemonic: 'CALL', length: 4 },
  { opcode: 0xC4, mnemonic: 'CALL NZ', length: 4 },
  { opcode: 0xCC, mnemonic: 'CALL Z', length: 4 },
  { opcode: 0xD4, mnemonic: 'CALL NC', length: 4 },
  { opcode: 0xDC, mnemonic: 'CALL C', length: 4 },
  { opcode: 0xE4, mnemonic: 'CALL PO', length: 4 },
  { opcode: 0xEC, mnemonic: 'CALL PE', length: 4 },
  { opcode: 0xF4, mnemonic: 'CALL P', length: 4 },
  { opcode: 0xFC, mnemonic: 'CALL M', length: 4 },
  { opcode: 0xC3, mnemonic: 'JP', length: 4 },
  { opcode: 0xC2, mnemonic: 'JP NZ', length: 4 },
  { opcode: 0xCA, mnemonic: 'JP Z', length: 4 },
  { opcode: 0xD2, mnemonic: 'JP NC', length: 4 },
  { opcode: 0xDA, mnemonic: 'JP C', length: 4 },
  { opcode: 0xE2, mnemonic: 'JP PO', length: 4 },
  { opcode: 0xEA, mnemonic: 'JP PE', length: 4 },
  { opcode: 0xF2, mnemonic: 'JP P', length: 4 },
  { opcode: 0xFA, mnemonic: 'JP M', length: 4 },
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

function formatBytes(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
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

function bytesAt(mem, addr, count) {
  return Array.from({ length: count }, (_, index) => mem[(addr + index) & MEM_MASK] ?? 0);
}

function regionFor(addr) {
  switch ((addr >>> 16) & 0xFF) {
    case 0x00: return 'OS-low';
    case 0x02: return 'OS-core';
    case 0x04: return 'OS-high';
    case 0x05: return 'editor';
    case 0x06: return 'graph';
    case 0x07: return 'graph-2';
    case 0x08: return 'display';
    case 0x09: return 'STAT';
    case 0x0A: return 'display-2';
    case 0x0B: return 'apps';
    default: return 'other';
  }
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
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase277-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
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
    if (!blocks || Object.keys(blocks).length === 0) {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS from transpiled ROM module.');
    }
    return { blocks, assets };
  } catch (error) {
    cleanupTranspiledModule(assets);
    throw error;
  }
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
  return { cpu: snapshotCpu(cpu), memory: new Uint8Array(mem) };
}

function restoreRuntime(cpu, mem, snapshot) {
  mem.set(snapshot.memory);
  restoreCpu(cpu, snapshot.cpu);
}

function safeDecode(buffer, pc, mode = 'adl') {
  try {
    return decodeInstruction(buffer, pc, mode);
  } catch {
    return null;
  }
}

function formatInstruction(ins) {
  if (!ins) return '(decode failed)';
  switch (ins.tag) {
    case 'call':
      return `CALL ${hex(ins.target)}`;
    case 'call-conditional':
      return `CALL ${String(ins.condition).toUpperCase()}, ${hex(ins.target)}`;
    case 'jp':
      return `JP ${hex(ins.target)}`;
    case 'jp-conditional':
      return `JP ${String(ins.condition).toUpperCase()}, ${hex(ins.target)}`;
    case 'ld-pair-imm':
      return `LD ${String(ins.pair).toUpperCase()}, ${hex(ins.value)}`;
    case 'ld-pair-mem':
      return ins.direction === 'to-mem'
        ? `LD (${hex(ins.addr)}), ${String(ins.pair).toUpperCase()}`
        : `LD ${String(ins.pair).toUpperCase()}, (${hex(ins.addr)})`;
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${String(ins.condition).toUpperCase()}`;
    case 'nop':
      return 'NOP';
    default: {
      const fields = { ...ins };
      delete fields.pc;
      delete fields.length;
      delete fields.nextPc;
      delete fields.mode;
      delete fields.modePrefix;
      return `${ins.tag} ${JSON.stringify(fields)}`;
    }
  }
}

function decodeRoutine(rom, startPc, maxInstructions = 32, maxBytes = 0x80) {
  const out = [];
  let pc = startPc;
  const limit = startPc + maxBytes;
  while (pc < limit && out.length < maxInstructions) {
    const ins = safeDecode(rom, pc, 'adl');
    const length = Math.max(1, ins?.length ?? 1);
    out.push({
      pc,
      bytes: rom.subarray(pc, pc + length),
      text: formatInstruction(ins),
      tag: ins?.tag ?? 'db',
    });
    pc += length;
    if (ins?.tag === 'ret') break;
  }
  return out;
}

function scanCallers(rom) {
  const hits = [];
  for (let offset = 0; offset <= rom.length - 4; offset += 1) {
    for (const pattern of CALLER_PATTERNS) {
      if (
        rom[offset] === pattern.opcode &&
        rom[offset + 1] === 0xE0 &&
        rom[offset + 2] === 0xDE &&
        rom[offset + 3] === 0x09
      ) {
        hits.push({
          pc: offset >>> 0,
          mnemonic: pattern.mnemonic,
          region: regionFor(offset),
          bytes: rom.subarray(offset, offset + 16),
          decoded: formatInstruction(safeDecode(rom, offset, 'adl')),
        });
      }
    }
  }
  return hits.sort((left, right) => left.pc - right.pc);
}

function findTraceEntry(blocks, pc, mode = 'adl') {
  for (let delta = 0; delta <= TRACE_LOOKBACK; delta += 1) {
    const candidate = (pc - delta) & 0xFFFFFF;
    const key = `${candidate.toString(16).padStart(6, '0')}:${mode}`;
    if (blocks[key]) {
      return { pc: candidate, delta };
    }
  }
  return { pc, delta: null };
}

function capturePointers(mem) {
  return {
    d02590: read24(mem, D02590),
    d0259a: read24(mem, D0259A),
    d0259d: read24(mem, D0259D),
  };
}

function seedTraceState(cpu, mem, baseline) {
  restoreRuntime(cpu, mem, baseline);
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._ix = IX_BASE;
  cpu._iy = IY_BASE;
  cpu.a = 0;
  cpu.f = 0;
  cpu.bc = 0;
  cpu.de = 0;
  cpu.hl = 0;
  cpu.sp = (STACK_TOP - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, RETURN_SENTINEL);
  write24(mem, D02590, SEED_PTR);
  write24(mem, D0259A, SEED_PTR);
  write24(mem, D0259D, SEED_PTR);
  for (let addr = TABLE_START; addr <= TABLE_END; addr += 1) {
    mem[addr & MEM_MASK] = (0x80 + (addr - TABLE_START)) & 0xFF;
  }
}

function overlap(addr, width, start, end) {
  const first = addr & 0xFFFFFF;
  const last = (first + width - 1) & 0xFFFFFF;
  if (first <= last) {
    return first <= end && last >= start;
  }
  return true;
}

function labelsForWrite(addr, width) {
  const labels = [];
  if (overlap(addr, width, D02590, D02590 + 2)) labels.push('D02590');
  if (overlap(addr, width, D0259A, D0259A + 2)) labels.push('D0259A');
  if (overlap(addr, width, D0259D, D0259D + 2)) labels.push('D0259D');
  if (overlap(addr, width, 0xD3F000, 0xD3FFFF)) labels.push('D3Fxxx');
  if ((addr & 0xFFFFFF) >= RAM_START) labels.push('RAM');
  return labels;
}

function installWriteTracer(cpu, mem, state) {
  const events = [];
  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  function record(kind, addr, width, before, after) {
    const labels = labelsForWrite(addr, width);
    if (labels.length === 0) return;
    events.push({
      step: state.step,
      blockPc: state.blockPc,
      kind,
      addr: addr & 0xFFFFFF,
      width,
      before: before >>> 0,
      after: after >>> 0,
      labels,
    });
  }

  cpu.write8 = (addr, value) => {
    const a = addr & 0xFFFFFF;
    const before = mem[a & MEM_MASK] ?? 0;
    const result = originalWrite8(addr, value);
    record('write8', a, 1, before, value & 0xFF);
    return result;
  };

  cpu.write16 = (addr, value) => {
    const a = addr & 0xFFFFFF;
    const before = (mem[a & MEM_MASK] ?? 0) | ((mem[(a + 1) & MEM_MASK] ?? 0) << 8);
    const result = originalWrite16(addr, value);
    record('write16', a, 2, before, value & 0xFFFF);
    return result;
  };

  cpu.write24 = (addr, value) => {
    const a = addr & 0xFFFFFF;
    const before = read24(mem, a);
    const result = originalWrite24(addr, value);
    record('write24', a, 3, before, value & 0xFFFFFF);
    return result;
  };

  return {
    events,
    restore() {
      cpu.write8 = originalWrite8;
      cpu.write16 = originalWrite16;
      cpu.write24 = originalWrite24;
    },
  };
}

function traceTarget(executor, blocks, cpu, mem, baseline) {
  seedTraceState(cpu, mem, baseline);
  const entry = findTraceEntry(blocks, TARGET_PC, 'adl');
  const beforePointers = capturePointers(mem);
  const beforeTable = bytesAt(mem, TABLE_START, TABLE_END - TABLE_START + 1);
  const state = { step: 0, blockPc: entry.pc };
  const tracer = installWriteTracer(cpu, mem, state);
  const blockTrace = [];
  const uniqueBlocks = [];
  const seenBlocks = new Set();
  const dynamicTargets = [];
  let termination = 'unknown';
  const STOP = '__RETURN_SENTINEL__';

  try {
    try {
      const result = executor.runFrom(entry.pc, 'adl', {
        maxSteps: TRACE_STEPS,
        maxLoopIterations: TRACE_LOOP_LIMIT,
        onBlock(pc, mode, _meta, step) {
          state.step = step;
          state.blockPc = pc & 0xFFFFFF;
          blockTrace.push({ step, pc: pc & 0xFFFFFF, mode });
          const key = `${hex(pc)}:${mode}`;
          if (!seenBlocks.has(key)) {
            seenBlocks.add(key);
            uniqueBlocks.push(key);
          }
        },
        onDynamicTarget(target, mode, pc, step) {
          dynamicTargets.push({ step, from: pc & 0xFFFFFF, mode, target: target & 0xFFFFFF });
        },
        onMissingBlock(pc) {
          if ((pc & 0xFFFFFF) === RETURN_SENTINEL) {
            throw new Error(STOP);
          }
        },
      });
      termination = result.termination;
    } catch (error) {
      if (error?.message === STOP) {
        termination = 'returned-to-sentinel';
      } else {
        throw error;
      }
    }
  } finally {
    tracer.restore();
  }

  const afterPointers = capturePointers(mem);
  const afterTable = bytesAt(mem, TABLE_START, TABLE_END - TABLE_START + 1);
  const pointerWrites = tracer.events.filter((event) => event.labels.some((label) => label.startsWith('D025')));
  const tableWrites = tracer.events.filter((event) => event.labels.includes('D3Fxxx'));
  const otherRamWrites = tracer.events.filter(
    (event) => event.labels.includes('RAM') && !event.labels.some((label) => label.startsWith('D025')) && !event.labels.includes('D3Fxxx')
  );

  return {
    entry,
    termination,
    beforePointers,
    afterPointers,
    beforeTable,
    afterTable,
    blockTrace,
    uniqueBlocks,
    dynamicTargets,
    pointerWrites,
    tableWrites,
    otherRamWrites,
  };
}

function formatPointerSnapshot(snapshot) {
  return `D02590=${hex(snapshot.d02590)} D0259A=${hex(snapshot.d0259a)} D0259D=${hex(snapshot.d0259d)}`;
}

function formatWrite(event) {
  return (
    `step=${String(event.step).padStart(3, ' ')} block=${hex(event.blockPc)} ${event.kind} `
    + `${hex(event.addr)} ${hex(event.before, event.width * 2)} -> ${hex(event.after, event.width * 2)} `
    + `[${event.labels.join(', ')}]`
  );
}

function printWriteSection(title, events) {
  console.log(`${title} (${events.length})`);
  if (events.length === 0) {
    console.log('  (none)');
    return;
  }
  for (const event of events) {
    console.log(`  ${formatWrite(event)}`);
  }
}

async function main() {
  const rom = fs.readFileSync(ROM_PATH);
  const staticCallers = scanCallers(rom);
  const routine = decodeRoutine(rom, TARGET_PC);

  console.log('=== Phase 277: 0x09DEE0 Caller Hunt ===');
  console.log(`ROM=${ROM_PATH} bytes=${rom.length}`);
  console.log('Static patterns checked: CALL, CALL cc, JP, and JP cc with ADL 24-bit target 0x09DEE0.');
  console.log('');

  const { blocks, assets } = await loadBlocks();
  try {
    const mem = new Uint8Array(MEM_SIZE);
    mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));
    const executor = createExecutor(blocks, mem, { peripherals: createPeripheralBus({ timerInterrupt: false }) });
    const cpu = executor.cpu;

    const watchedPcs = new Set([TARGET_PC, ...staticCallers.map((entry) => entry.pc)]);
    const bootHits = new Map();
    const bootResult = executor.runFrom(BOOT_PC, BOOT_MODE, {
      maxSteps: BOOT_STEPS,
      maxLoopIterations: BOOT_LOOP_LIMIT,
      onBlock(pc) {
        const normalized = pc & 0xFFFFFF;
        if (watchedPcs.has(normalized)) {
          bootHits.set(normalized, (bootHits.get(normalized) ?? 0) + 1);
        }
      },
    });
    const baseline = snapshotRuntime(cpu, mem);

    console.log('=== Static Callers ===');
    if (staticCallers.length === 0) {
      console.log('none');
    } else {
      for (const caller of staticCallers) {
        console.log(`${hex(caller.pc)}  ${caller.mnemonic}  region=${caller.region}  bootHits50k=${bootHits.get(caller.pc) ?? 0}`);
        console.log(`  decoded: ${caller.decoded}`);
        console.log(`  bytes16: ${formatBytes(caller.bytes)}`);
      }
    }
    console.log('');

    console.log('=== Boot Summary ===');
    console.log(
      `termination=${bootResult.termination} steps=${bootResult.steps} `
      + `lastPc=${hex(bootResult.lastPc)}:${bootResult.lastMode} loopsForced=${bootResult.loopsForced}`
    );
    console.log(`targetBootHits50k=${bootHits.get(TARGET_PC) ?? 0}`);
    console.log('');

    console.log('=== 0x09DEE0 Disassembly ===');
    for (const item of routine) {
      console.log(`${hex(item.pc)}  ${formatBytes(item.bytes).padEnd(20)}  ${item.text}`);
    }
    console.log('');

    const trace = traceTarget(executor, blocks, cpu, mem, baseline);

    console.log('=== Direct Trace ===');
    console.log(
      `requestedStart=${hex(TARGET_PC)} actualStart=${hex(trace.entry.pc)} `
      + `${trace.entry.delta === 0 ? '(exact)' : `(starts ${trace.entry.delta} byte(s) early)`}`
    );
    console.log(`termination=${trace.termination}`);
    console.log(`seedPointers:  ${formatPointerSnapshot(trace.beforePointers)}`);
    console.log(`finalPointers: ${formatPointerSnapshot(trace.afterPointers)}`);
    console.log(`seedTable ${hex(TABLE_START)}..${hex(TABLE_END)}: ${formatBytes(trace.beforeTable)}`);
    console.log(`finalTable ${hex(TABLE_START)}..${hex(TABLE_END)}: ${formatBytes(trace.afterTable)}`);
    console.log(`uniqueBlocks: ${trace.uniqueBlocks.join(' -> ') || '(none)'}`);
    if (trace.dynamicTargets.length > 0) {
      console.log(`dynamicTargets: ${trace.dynamicTargets.map((entry) => `${hex(entry.from)}->${hex(entry.target)}`).join(', ')}`);
    } else {
      console.log('dynamicTargets: (none)');
    }
    console.log('');

    printWriteSection('Pointer writes', trace.pointerWrites);
    console.log('');
    printWriteSection('D3Fxxx writes', trace.tableWrites);
    console.log('');
    printWriteSection('Other RAM writes', trace.otherRamWrites);
  } finally {
    cleanupTranspiledModule(assets);
  }
}

await main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
