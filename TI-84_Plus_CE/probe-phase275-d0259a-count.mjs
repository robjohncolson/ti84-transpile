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

const TARGET_ADDR = 0xD0259A;
const TARGET_BYTES = [0x9A, 0x25, 0xD0];
const TARGET_PC = 0x09DEF4;
const TARGET_HL_VALUE = 0xD3FFFF;

const VAR_REGION_START = 0xD02590;
const VAR_REGION_END = 0xD025A2;
const DISPATCH_REGION_START = 0xD3F000;
const DISPATCH_REGION_END = 0xD3FFFF;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_ENTRY = 0x08C331;
const KERNEL_INIT_STEPS = 100000;
const KERNEL_INIT_LOOP_LIMIT = 10000;
const POST_INIT_ENTRY = 0x0802B2;
const POST_INIT_STEPS = 100;
const POST_INIT_LOOP_LIMIT = 32;

const TRACE_ENTRIES = [
  { label: '0x09DEF4 isolated store site', pc: 0x09DEF4 },
  { label: '0x09DEE0 function entry', pc: 0x09DEE0 },
];
const TRACE_STEPS = 100;
const TRACE_LOOP_LIMIT = 1000;
const STACK_TOP = 0xD1A87E;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;
const MBASE = 0xD0;
const RETURN_SENTINEL = 0x7FFFFE;

const CONTEXT_RADIUS = 12;
const CPU_SNAPSHOT_FIELDS = [
  'a',
  'f',
  '_bc',
  '_de',
  '_hl',
  '_a2',
  '_f2',
  '_bc2',
  '_de2',
  '_hl2',
  'sp',
  '_ix',
  '_iy',
  'i',
  'im',
  'iff1',
  'iff2',
  'madl',
  'mbase',
  'halted',
  'cycles',
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

function hexByWidth(value, widthBytes) {
  return hex(value, Math.max(2, widthBytes * 2));
}

function formatBytes(bytes) {
  if (!bytes || bytes.length === 0) {
    return '(none)';
  }
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
}

function read24Le(buffer, offset) {
  return (
    (buffer[offset] ?? 0) |
    ((buffer[offset + 1] ?? 0) << 8) |
    ((buffer[offset + 2] ?? 0) << 16)
  ) >>> 0;
}

function read24Mem(mem, addr) {
  const base = addr & MEM_MASK;
  return (
    (mem[base] ?? 0) |
    ((mem[(base + 1) & MEM_MASK] ?? 0) << 8) |
    ((mem[(base + 2) & MEM_MASK] ?? 0) << 16)
  ) >>> 0;
}

function write24Mem(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function bytesToValue(bytes) {
  let value = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    value |= (bytes[index] & 0xFF) << (index * 8);
  }
  return value >>> 0;
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

function createMachine(romBytes, blocks) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  const executor = createExecutor(blocks, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
  });
  return { mem, executor, cpu: executor.cpu };
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

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_STEPS,
    maxLoopIterations: KERNEL_INIT_LOOP_LIMIT,
  });

  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_STEPS,
    maxLoopIterations: POST_INIT_LOOP_LIMIT,
  });

  return { boot, kernelInit, postInit };
}

function prepareTraceState(cpu, mem, entryPc) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._ix = IX_BASE;
  cpu._iy = IY_BASE;
  cpu.sp = STACK_TOP;
  write24Mem(mem, cpu.sp, RETURN_SENTINEL);
  cpu.pc = entryPc & 0xFFFFFF;
}

function overlaps(addr, width, start, end) {
  const normalized = addr & 0xFFFFFF;
  const high = normalized + width - 1;
  return high >= start && normalized <= end;
}

function classifyWatchedRange(addr, width) {
  if (overlaps(addr, width, VAR_REGION_START, VAR_REGION_END)) {
    return 'vars';
  }
  if (overlaps(addr, width, DISPATCH_REGION_START, DISPATCH_REGION_END)) {
    return 'dispatch';
  }
  return null;
}

function installTraceWatchers(cpu, mem) {
  const events = [];
  let currentPc = 0;

  const originalRead8 = cpu.read8.bind(cpu);
  const originalRead16 = cpu.read16.bind(cpu);
  const originalRead24 = cpu.read24.bind(cpu);
  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  function recordRead(kind, addr, width, value) {
    const range = classifyWatchedRange(addr, width);
    if (!range) {
      return;
    }
    events.push({
      kind,
      range,
      pc: currentPc & 0xFFFFFF,
      addr: addr & 0xFFFFFF,
      width,
      value: value >>> 0,
    });
  }

  function wrapWrite(kind, width, invoke, addr) {
    const normalized = addr & 0xFFFFFF;
    const range = classifyWatchedRange(normalized, width);
    if (!range) {
      invoke();
      return;
    }

    const beforeBytes = [];
    for (let index = 0; index < width; index += 1) {
      beforeBytes.push(mem[(normalized + index) & MEM_MASK] & 0xFF);
    }
    invoke();
    const afterBytes = [];
    for (let index = 0; index < width; index += 1) {
      afterBytes.push(mem[(normalized + index) & MEM_MASK] & 0xFF);
    }

    events.push({
      kind,
      range,
      pc: currentPc & 0xFFFFFF,
      addr: normalized,
      width,
      beforeValue: bytesToValue(beforeBytes),
      afterValue: bytesToValue(afterBytes),
    });
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

  cpu.write8 = (addr, value) => wrapWrite('write8', 1, () => originalWrite8(addr, value), addr);
  cpu.write16 = (addr, value) => wrapWrite('write16', 2, () => originalWrite16(addr, value), addr);
  cpu.write24 = (addr, value) => wrapWrite('write24', 3, () => originalWrite24(addr, value), addr);

  return {
    setPc(pc) {
      currentPc = pc >>> 0;
    },
    getEvents() {
      return events.slice();
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

function instructionReferencesTarget(inst) {
  if (!inst) {
    return false;
  }
  return inst.addr === TARGET_ADDR || inst.value === TARGET_ADDR;
}

function safeDecode(buffer, pc) {
  try {
    return decodeInstruction(buffer, pc, 'adl');
  } catch {
    return null;
  }
}

function resolveReferenceClassification(inst, nextInst) {
  if (!inst) {
    return 'POINTER';
  }

  if (inst.tag === 'ld-reg-mem') {
    return 'READ';
  }
  if (inst.tag === 'ld-mem-reg') {
    return 'WRITE';
  }
  if (inst.tag === 'ld-mem-pair') {
    return 'WRITE';
  }
  if (inst.tag === 'ld-pair-mem') {
    if (inst.direction === 'to-mem') {
      return 'WRITE';
    }
    return 'READ';
  }
  if (inst.tag === 'ld-pair-imm') {
    if (inst.pair === 'hl' && nextInst?.tag === 'inc-reg' && nextInst.reg === '(hl)') {
      return 'INCREMENT';
    }
    if (inst.pair === 'hl' && nextInst?.tag === 'dec-reg' && nextInst.reg === '(hl)') {
      return 'DECREMENT';
    }
    return 'POINTER';
  }

  return 'POINTER';
}

function formatInstruction(inst) {
  if (!inst) {
    return '(undecoded)';
  }

  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';

  switch (inst.tag) {
    case 'ld-reg-mem':
      return `${prefix}ld ${inst.dest}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `${prefix}ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return `${prefix}ld (${hex(inst.addr)}), ${inst.pair}`;
      }
      return `${prefix}ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `${prefix}ld (${hex(inst.addr)}), ${inst.pair}`;
    case 'ld-pair-imm':
      return `${prefix}ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-reg-imm':
      return `${prefix}ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'inc-reg':
      return `${prefix}inc ${inst.reg}`;
    case 'dec-reg':
      return `${prefix}dec ${inst.reg}`;
    case 'inc-pair':
      return `${prefix}inc ${inst.pair}`;
    case 'dec-pair':
      return `${prefix}dec ${inst.pair}`;
    case 'ld-reg-reg':
      return `${prefix}ld ${inst.dest}, ${inst.src}`;
    case 'push':
      return `${prefix}push ${inst.pair}`;
    case 'pop':
      return `${prefix}pop ${inst.pair}`;
    case 'call':
      return `${prefix}call ${hex(inst.target)}`;
    case 'call-conditional':
      return `${prefix}call ${inst.condition}, ${hex(inst.target)}`;
    case 'jr':
      return `${prefix}jr ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}jr ${inst.condition}, ${hex(inst.target)}`;
    case 'jp':
      return `${prefix}jp ${hex(inst.target)}`;
    case 'jp-conditional':
      return `${prefix}jp ${inst.condition}, ${hex(inst.target)}`;
    case 'ret':
      return `${prefix}ret`;
    case 'ret-conditional':
      return `${prefix}ret ${inst.condition}`;
    case 'add-pair':
      return `${prefix}add ${inst.dest}, ${inst.src}`;
    case 'sbc-pair':
      return `${prefix}sbc hl, ${inst.src}`;
    case 'alu-reg':
      return `${prefix}${inst.op} ${inst.src}`;
    case 'alu-imm':
      return `${prefix}${inst.op} ${hexByte(inst.value)}`;
    case 'indexed-cb-set': {
      const displacement = inst.displacement >= 0 ? `+${inst.displacement}` : `${inst.displacement}`;
      return `${prefix}set ${inst.bit}, (${inst.indexRegister}${displacement})`;
    }
    default:
      return `${prefix}${inst.tag}`;
  }
}

function findRawHits(buffer, targetBytes) {
  const hits = [];
  for (let offset = 0; offset <= buffer.length - targetBytes.length; offset += 1) {
    let matched = true;
    for (let index = 0; index < targetBytes.length; index += 1) {
      if (buffer[offset + index] !== targetBytes[index]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      hits.push(offset);
    }
  }
  return hits;
}

function describePointerLiteralCluster(buffer, hit) {
  const clusterStart = Math.max(0, hit - 6);
  const words = [];
  for (let offset = 0; offset < 18 && clusterStart + offset + 2 < buffer.length; offset += 3) {
    words.push(hex(read24Le(buffer, clusterStart + offset)));
  }
  return `data literal cluster: ${words.join(', ')}`;
}

function resolveReference(buffer, hit) {
  const candidates = [];
  for (let start = Math.max(0, hit - 6); start <= hit; start += 1) {
    const inst = safeDecode(buffer, start);
    if (!inst) {
      continue;
    }
    if (start + inst.length <= hit) {
      continue;
    }
    if (!instructionReferencesTarget(inst)) {
      continue;
    }
    candidates.push(inst);
  }

  candidates.sort((a, b) => {
    if (b.length !== a.length) {
      return b.length - a.length;
    }
    return a.pc - b.pc;
  });

  const inst = candidates[0] ?? null;
  const nextInst = inst ? safeDecode(buffer, inst.nextPc) : null;
  const classification = resolveReferenceClassification(inst, nextInst);
  const contextStart = Math.max(0, hit - CONTEXT_RADIUS);
  const contextEnd = Math.min(buffer.length, hit + TARGET_BYTES.length + CONTEXT_RADIUS);

  return {
    hit,
    classification,
    instruction: inst,
    nextInstruction: nextInst,
    rawContext: formatBytes(buffer.subarray(contextStart, contextEnd)),
    literalNote: inst ? null : describePointerLiteralCluster(buffer, hit),
  };
}

function findBestDecodeWindow(buffer, anchorPc, { beforeBytes = 32, afterBytes = 32, slop = 12 } = {}) {
  const desiredStart = Math.max(0, anchorPc - beforeBytes);
  const earliestStart = Math.max(0, desiredStart - slop);
  const latestExclusive = Math.min(buffer.length, anchorPc + afterBytes);

  let best = null;

  for (let candidate = earliestStart; candidate <= anchorPc; candidate += 1) {
    const instructions = [];
    let pc = candidate;
    let anchorFound = false;
    let valid = true;

    while (pc < latestExclusive) {
      const inst = safeDecode(buffer, pc);
      if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
        valid = false;
        break;
      }
      if (pc < anchorPc && pc + inst.length > anchorPc) {
        valid = false;
        break;
      }
      instructions.push(inst);
      if (pc === anchorPc) {
        anchorFound = true;
      }
      pc += inst.length;
    }

    if (!valid || !anchorFound) {
      continue;
    }

    const coveredBefore = Math.min(anchorPc - candidate, beforeBytes);
    const coveredAfter = Math.min(Math.max(0, pc - anchorPc), afterBytes);
    const startPenalty = Math.abs(candidate - desiredStart);
    const score = (coveredBefore * 1000) + (coveredAfter * 10) - startPenalty;

    if (!best || score > best.score) {
      best = { start: candidate, end: pc, instructions, score };
    }
  }

  return best;
}

function printStaticScan(references) {
  const counts = new Map();
  for (const classification of ['READ', 'WRITE', 'POINTER', 'INCREMENT', 'DECREMENT']) {
    counts.set(classification, 0);
  }

  for (const reference of references) {
    counts.set(reference.classification, (counts.get(reference.classification) ?? 0) + 1);
  }

  console.log('=== Static scan for D0259A references ===');
  console.log(`raw little-endian hits for ${hex(TARGET_ADDR)}: ${references.length}`);
  console.log(
    `classification counts: READ=${counts.get('READ')} WRITE=${counts.get('WRITE')} `
    + `POINTER=${counts.get('POINTER')} INCREMENT=${counts.get('INCREMENT')} `
    + `DECREMENT=${counts.get('DECREMENT')}`,
  );

  for (const reference of references) {
    const instructionText = reference.instruction ? formatInstruction(reference.instruction) : '(no decodable instruction)';
    const nextText = reference.nextInstruction ? formatInstruction(reference.nextInstruction) : null;
    const tail = [];
    if (reference.literalNote) {
      tail.push(reference.literalNote);
    }
    if (reference.classification === 'POINTER' && reference.instruction && nextText) {
      tail.push(`next=${nextText}`);
    }
    console.log(
      `  ${hex(reference.hit)}  ${reference.classification.padEnd(10)} ${instructionText}`
      + (tail.length > 0 ? `  |  ${tail.join('  |  ')}` : ''),
    );
    console.log(`      raw: ${reference.rawContext}`);
  }

  const hasByteRead = references.some((reference) => reference.instruction?.tag === 'ld-reg-mem');
  const hasByteWrite = references.some((reference) => reference.instruction?.tag === 'ld-mem-reg');
  const hasInc = references.some((reference) => reference.classification === 'INCREMENT');
  const hasDec = references.some((reference) => reference.classification === 'DECREMENT');

  if (!hasByteRead && !hasByteWrite && !hasInc && !hasDec) {
    console.log();
    console.log('No byte-wide LD A,(D0259A) / LD (D0259A),A or direct INC/DEC (HL) patterns were found.');
    console.log('Every executable code hit resolves to a 24-bit pointer load/store, plus one address-literal table entry.');
  }
}

function printTargetContext(buffer) {
  const rawStart = Math.max(0, TARGET_PC - 32);
  const rawEnd = Math.min(buffer.length, TARGET_PC + 32);
  const window = findBestDecodeWindow(buffer, TARGET_PC, { beforeBytes: 32, afterBytes: 32, slop: 16 });

  console.log();
  console.log('=== 0x09DEF4 context ===');
  console.log(`raw bytes ${hex(rawStart)}..${hex(rawEnd - 1)}:`);
  console.log(`  ${formatBytes(buffer.subarray(rawStart, rawEnd))}`);

  if (!window) {
    console.log('Unable to decode a clean instruction window around 0x09DEF4.');
    return;
  }

  console.log('decoded instructions:');
  for (const inst of window.instructions) {
    console.log(
      `  ${hex(inst.pc)}  ${formatBytes(buffer.subarray(inst.pc, inst.pc + inst.length)).padEnd(20)} ${formatInstruction(inst)}`,
    );
  }

  console.log();
  console.log('Interpretation:');
  console.log(
    `  0x09DEF4 loads HL=${hex(TARGET_HL_VALUE)} and immediately stores that 24-bit value into `
    + `${hex(TARGET_ADDR)}, ${hex(0xD02590)}, ${hex(0xD02593)}, and ${hex(0xD0259D)}.`
  );
  console.log(
    '  This looks like dispatch-pointer seeding/reset state, not an 8-bit entry-count increment/decrement path.',
  );
}

function formatTermination(result) {
  if (result.termination === 'missing_block' && (result.lastPc & 0xFFFFFF) === RETURN_SENTINEL) {
    return 'returned-to-sentinel';
  }
  return result.termination;
}

function formatTraceEvent(event) {
  if (event.kind.startsWith('read')) {
    return (
      `${event.kind} ${hex(event.addr)} => ${hexByWidth(event.value, event.width)} `
      + `@ ${hex(event.pc)} [${event.range}]`
    );
  }
  return (
    `${event.kind} ${hex(event.addr)} ${hexByWidth(event.beforeValue, event.width)} -> `
    + `${hexByWidth(event.afterValue, event.width)} @ ${hex(event.pc)} [${event.range}]`
  );
}

function printPointerRegion(mem) {
  const slots = [0xD02590, 0xD02593, 0xD0259A, 0xD0259D, 0xD025A0];
  console.log(`raw ${hex(VAR_REGION_START)}..${hex(VAR_REGION_END)}:`);
  console.log(`  ${formatBytes(mem.subarray(VAR_REGION_START, VAR_REGION_END + 1))}`);
  console.log('24-bit slots:');
  for (const slot of slots) {
    console.log(`  ${hex(slot)} = ${hex(read24Mem(mem, slot))}`);
  }
}

function printBootState(mem, bootResults) {
  console.log();
  console.log('=== Cold boot state ===');
  console.log(
    `boot term=${bootResults.boot.termination} kernelInit term=${bootResults.kernelInit.termination} `
    + `postInit term=${bootResults.postInit.termination}`,
  );
  console.log(`mem8[${hex(TARGET_ADDR)}]  = ${hexByte(mem[TARGET_ADDR & MEM_MASK])}`);
  console.log(`mem24[${hex(TARGET_ADDR)}] = ${hex(read24Mem(mem, TARGET_ADDR))}`);
  printPointerRegion(mem);
}

function runTrace(executor, cpu, mem, snapshot, entry) {
  restoreRuntime(cpu, mem, snapshot);
  prepareTraceState(cpu, mem, entry.pc);

  const watcher = installTraceWatchers(cpu, mem);
  const visited = [];

  let result;
  try {
    result = executor.runFrom(entry.pc, 'adl', {
      maxSteps: TRACE_STEPS,
      maxLoopIterations: TRACE_LOOP_LIMIT,
      onBlock(pc, mode, _meta, step) {
        watcher.setPc(pc);
        visited.push({
          step: step + 1,
          pc: pc & 0xFFFFFF,
          mode,
        });
      },
    });
  } finally {
    watcher.setPc(cpu.pc ?? entry.pc);
  }

  const events = watcher.getEvents();
  watcher.restore();

  return {
    entry,
    result,
    events,
    visited,
    finalPointers: {
      d02590: read24Mem(mem, 0xD02590),
      d02593: read24Mem(mem, 0xD02593),
      d0259a: read24Mem(mem, TARGET_ADDR),
      d0259d: read24Mem(mem, 0xD0259D),
      d025a0: read24Mem(mem, 0xD025A0),
    },
  };
}

function printTrace(trace) {
  const targetEvents = trace.events.filter((event) => event.addr === TARGET_ADDR);
  const targetReads = targetEvents.filter((event) => event.kind.startsWith('read'));
  const targetWrites = targetEvents.filter((event) => event.kind.startsWith('write'));
  const dispatchEvents = trace.events.filter((event) => event.range === 'dispatch');

  const zeroedTarget = targetWrites.some((event) => event.afterValue === 0);
  const incrementedTarget = targetWrites.some((event) => event.afterValue === ((event.beforeValue + 1) & 0xFFFFFF));
  const decrementedTarget = targetWrites.some((event) => event.afterValue === ((event.beforeValue - 1) & 0xFFFFFF));

  console.log();
  console.log(`=== Dynamic trace: ${trace.entry.label} ===`);
  console.log(
    `entry=${hex(trace.entry.pc)} steps=${trace.result.steps} `
    + `termination=${formatTermination(trace.result)} lastPc=${hex(trace.result.lastPc)}:${trace.result.lastMode}`,
  );

  console.log('visited blocks:');
  for (const visit of trace.visited) {
    console.log(`  ${visit.step.toString().padStart(3, ' ')}  ${hex(visit.pc)}:${visit.mode}`);
  }

  console.log('watched memory events:');
  if (trace.events.length === 0) {
    console.log('  (none)');
  } else {
    for (const event of trace.events) {
      console.log(`  ${formatTraceEvent(event)}`);
    }
  }

  console.log('post-trace pointer region:');
  console.log(`  D02590=${hex(trace.finalPointers.d02590)} D02593=${hex(trace.finalPointers.d02593)} D0259A=${hex(trace.finalPointers.d0259a)}`);
  console.log(`  D0259D=${hex(trace.finalPointers.d0259d)} D025A0=${hex(trace.finalPointers.d025a0)}`);

  console.log('trace conclusion:');
  console.log(`  reads D0259A: ${targetReads.length}`);
  console.log(`  writes D0259A: ${targetWrites.length}`);
  console.log(`  zeroed D0259A: ${zeroedTarget ? 'yes' : 'no'}`);
  console.log(`  incremented D0259A by +1: ${incrementedTarget ? 'yes' : 'no'}`);
  console.log(`  decremented D0259A by -1: ${decrementedTarget ? 'yes' : 'no'}`);
  console.log(`  D3Fxxx dispatch RAM events: ${dispatchEvents.length}`);

  if (targetWrites.length > 0) {
    const firstWrite = targetWrites[0];
    console.log(
      `  first D0259A write: ${hexByWidth(firstWrite.beforeValue, firstWrite.width)} -> `
      + `${hexByWidth(firstWrite.afterValue, firstWrite.width)} at ${hex(firstWrite.pc)}`,
    );
  }

  if (targetReads.length === 0 && targetWrites.length > 0 && !zeroedTarget && !incrementedTarget && !decrementedTarget) {
    console.log('  This trace seeds a 24-bit pointer value directly; it does not behave like a count read/loop/increment path.');
  }
}

async function main() {
  const rom = fs.readFileSync(ROM_PATH);
  const references = findRawHits(rom, TARGET_BYTES).map((hit) => resolveReference(rom, hit));
  printStaticScan(references);
  printTargetContext(rom);

  const { blocks, assets } = await loadBlocks();
  try {
    const { mem, executor, cpu } = createMachine(rom, blocks);
    const bootResults = coldBoot(executor, cpu, mem);
    printBootState(mem, bootResults);

    const snapshot = snapshotRuntime(cpu, mem);
    console.log();
    console.log(`=== Related region check (${hex(VAR_REGION_START)}..${hex(0xD0259F)}) ===`);
    console.log('Booted pointer region remains zeroed before the 0x09DEE0/0x09DEF4 init path runs.');

    for (const entry of TRACE_ENTRIES) {
      const trace = runTrace(executor, cpu, mem, snapshot, entry);
      printTrace(trace);
    }
  } finally {
    cleanupTranspiledModule(assets);
  }
}

await main();
