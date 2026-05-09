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

const CALL_SITE = 0x08237A;
const STATIC_SCAN_START = 0x082200;
const STATIC_SCAN_END = 0x0823E8;
const CALLSITE_CONTEXT_START = 0x08235D;
const CALLSITE_CONTEXT_END = 0x082382;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_STEPS = 50000;
const BOOT_LOOP_LIMIT = 10000;
const KERNEL_INIT_REQUEST_PC = 0x000280;
const KERNEL_INIT_FALLBACK_PC = 0x020028;
const KERNEL_INIT_STEPS = 50000;
const KERNEL_INIT_LOOP_LIMIT = 10000;

const TRACE_STEPS = 200;
const TRACE_LOOP_LIMIT = 256;

const STACK_TOP = 0xD1A87E;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;
const MBASE = 0xD0;
const RETURN_SENTINEL = 0x7FFFFE;

const D3F_START = 0xD3F000;
const D3F_END = 0xD3FFFF;

const CPU_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const ABSOLUTE_TRANSFER_OPS = new Map([
  [0xCD, { kind: 'call', mnemonic: 'CALL' }],
  [0xC4, { kind: 'call', mnemonic: 'CALL NZ' }],
  [0xCC, { kind: 'call', mnemonic: 'CALL Z' }],
  [0xD4, { kind: 'call', mnemonic: 'CALL NC' }],
  [0xDC, { kind: 'call', mnemonic: 'CALL C' }],
  [0xE4, { kind: 'call', mnemonic: 'CALL PO' }],
  [0xEC, { kind: 'call', mnemonic: 'CALL PE' }],
  [0xF4, { kind: 'call', mnemonic: 'CALL P' }],
  [0xFC, { kind: 'call', mnemonic: 'CALL M' }],
  [0xC3, { kind: 'jp', mnemonic: 'JP' }],
  [0xC2, { kind: 'jp', mnemonic: 'JP NZ' }],
  [0xCA, { kind: 'jp', mnemonic: 'JP Z' }],
  [0xD2, { kind: 'jp', mnemonic: 'JP NC' }],
  [0xDA, { kind: 'jp', mnemonic: 'JP C' }],
  [0xE2, { kind: 'jp', mnemonic: 'JP PO' }],
  [0xEA, { kind: 'jp', mnemonic: 'JP PE' }],
  [0xF2, { kind: 'jp', mnemonic: 'JP P' }],
  [0xFA, { kind: 'jp', mnemonic: 'JP M' }],
]);

const KNOWN_FUNCTIONS = new Map([
  [0x0820ED, 'VAT entry wrapper'],
  [0x08267D, 'validator / call-nc target'],
  [0x0846EA, 'FindSym'],
  [0x082BE2, 'helper'],
]);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function formatBytes(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
}

function read24le(bytes, offset) {
  return (
    (bytes[offset] ?? 0)
    | ((bytes[offset + 1] ?? 0) << 8)
    | ((bytes[offset + 2] ?? 0) << 16)
  ) >>> 0;
}

function bytesAt(bytes, start, length) {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(bytes.length, safeStart + Math.max(0, length));
  return bytes.subarray(safeStart, safeEnd);
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

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase278-${process.pid}.mjs`);
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

function decodeSafe(romBytes, pc, mode = 'adl') {
  try {
    return decodeInstruction(romBytes, pc, mode);
  } catch (error) {
    return {
      pc,
      length: 1,
      tag: 'decode-error',
      errorMessage: error?.message ?? String(error),
      mode,
    };
  }
}

function instructionLength(inst) {
  return Math.max(1, inst?.length ?? 1);
}

function up(name) {
  return name === '(hl)' ? '(HL)' : String(name ?? '').toUpperCase();
}

function formatInstruction(inst) {
  if (!inst) return 'decode-error';
  const prefix = inst.modePrefix ? `${String(inst.modePrefix).toUpperCase()} ` : '';
  switch (inst.tag) {
    case 'call':
      return `${prefix}CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `${prefix}CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `${prefix}JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `${prefix}JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'jr':
      return `${prefix}JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`;
    case 'djnz':
      return `${prefix}DJNZ ${hex(inst.target)}`;
    case 'ret':
      return `${prefix}RET`;
    case 'ret-conditional':
      return `${prefix}RET ${String(inst.condition).toUpperCase()}`;
    case 'reti':
      return `${prefix}RETI`;
    case 'retn':
      return `${prefix}RETN`;
    case 'jp-indirect':
      return `${prefix}JP (${up(inst.indirectRegister ?? 'hl')})`;
    case 'push':
      return `${prefix}PUSH ${up(inst.pair)}`;
    case 'pop':
      return `${prefix}POP ${up(inst.pair)}`;
    case 'ld-pair-imm':
      return `${prefix}LD ${up(inst.pair)}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      return `${prefix}LD ${up(inst.pair)}, (${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `${prefix}LD (${hex(inst.addr)}), ${up(inst.pair)}`;
    case 'ld-reg-mem':
      return `${prefix}LD ${up(inst.dest)}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `${prefix}LD (${hex(inst.addr)}), ${up(inst.src)}`;
    case 'ld-reg-imm':
      return `${prefix}LD ${up(inst.dest)}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg':
      return `${prefix}LD ${up(inst.dest)}, ${up(inst.src)}`;
    case 'ld-reg-ind':
      return `${prefix}LD ${up(inst.dest)}, (${up(inst.src)})`;
    case 'ld-ind-reg':
      return `${prefix}LD (${up(inst.dest)}), ${up(inst.src)}`;
    case 'ld-ind-imm':
      return `${prefix}LD (HL), ${hexByte(inst.value)}`;
    case 'inc-pair':
      return `${prefix}INC ${up(inst.pair)}`;
    case 'dec-pair':
      return `${prefix}DEC ${up(inst.pair)}`;
    case 'inc-reg':
      return `${prefix}INC ${up(inst.reg)}`;
    case 'dec-reg':
      return `${prefix}DEC ${up(inst.reg)}`;
    case 'alu-reg':
      return `${prefix}${String(inst.op).toUpperCase()} ${up(inst.src)}`;
    case 'alu-imm':
      return `${prefix}${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`;
    case 'add-pair':
      return `${prefix}ADD ${up(inst.dest)}, ${up(inst.src)}`;
    case 'sbc-pair':
      return `${prefix}SBC HL, ${up(inst.src)}`;
    case 'adc-pair':
      return `${prefix}ADC HL, ${up(inst.src)}`;
    case 'ex-de-hl':
      return `${prefix}EX DE, HL`;
    case 'bit-test':
      return `${prefix}BIT ${inst.bit}, ${up(inst.reg)}`;
    case 'lddr':
      return `${prefix}LDDR`;
    case 'ldir':
      return `${prefix}LDIR`;
    case 'ldd':
      return `${prefix}LDD`;
    case 'ldi':
      return `${prefix}LDI`;
    case 'xor-a':
      return `${prefix}XOR A`;
    case 'nop':
      return `${prefix}NOP`;
    default:
      return `${prefix}${String(inst.tag)}`;
  }
}

function findPreviousInstructionStart(romBytes, currentPc, mode = 'adl') {
  const floor = Math.max(0, currentPc - 8);
  for (let candidate = currentPc - 1; candidate >= floor; candidate -= 1) {
    const inst = decodeSafe(romBytes, candidate, mode);
    if (candidate + instructionLength(inst) === currentPc) return candidate;
  }
  return null;
}

function recoverBackwardPath(romBytes, targetPc, floorPc, mode = 'adl') {
  const starts = [targetPc];
  let cursor = targetPc;
  while (cursor > floorPc) {
    const prev = findPreviousInstructionStart(romBytes, cursor, mode);
    if (prev === null || prev < floorPc) break;
    starts.unshift(prev);
    cursor = prev;
  }
  return starts.map((pc) => {
    const inst = decodeSafe(romBytes, pc, mode);
    const length = instructionLength(inst);
    return {
      pc,
      inst,
      bytes: bytesAt(romBytes, pc, length),
      text: formatInstruction(inst),
    };
  });
}

function disassembleRange(romBytes, start, endExclusive, mode = 'adl') {
  const rows = [];
  let pc = start;
  while (pc < endExclusive) {
    const inst = decodeSafe(romBytes, pc, mode);
    const len = instructionLength(inst);
    rows.push({
      pc,
      inst,
      bytes: bytesAt(romBytes, pc, len),
      text: formatInstruction(inst),
    });
    pc += len;
  }
  return rows;
}

function isUnconditionalBoundary(inst) {
  if (!inst) return false;
  return (
    inst.tag === 'ret'
    || inst.tag === 'jp'
    || inst.tag === 'jr'
    || inst.tag === 'jp-indirect'
    || inst.tag === 'reti'
    || inst.tag === 'retn'
  );
}

function isTargetingTransfer(inst) {
  if (!inst || !Number.isInteger(inst.target)) return false;
  return (
    inst.tag === 'call'
    || inst.tag === 'call-conditional'
    || inst.tag === 'jp'
    || inst.tag === 'jp-conditional'
    || inst.tag === 'jr'
    || inst.tag === 'jr-conditional'
    || inst.tag === 'djnz'
  );
}

function findEntryCandidates(pathRows, targetPc) {
  const candidates = [];
  for (let index = 1; index < pathRows.length; index += 1) {
    const row = pathRows[index];
    const prev = pathRows[index - 1];
    if (row.pc > targetPc) continue;
    if (!isUnconditionalBoundary(prev.inst)) continue;
    const localIncoming = pathRows
      .filter((probe) => probe.pc < row.pc && isTargetingTransfer(probe.inst) && (probe.inst.target & 0xFFFFFF) === row.pc)
      .map((probe) => ({
        pc: probe.pc,
        text: probe.text,
      }));
    candidates.push({
      entryPc: row.pc,
      afterPc: prev.pc,
      afterText: prev.text,
      localIncoming,
    });
  }
  return candidates;
}

function selectEntryCandidate(candidates, fallbackPc) {
  if (candidates.length === 0) {
    return {
      entryPc: fallbackPc,
      afterPc: null,
      afterText: 'fallback',
      localIncoming: [],
      selectionReason: 'No post-terminator candidate was recovered; falling back to the earliest recovered row.',
    };
  }

  const clean = candidates.filter((candidate) => candidate.localIncoming.length === 0);
  const selected = clean.length > 0
    ? clean[0]
    : [...candidates].sort((left, right) => (
      left.localIncoming.length - right.localIncoming.length
      || left.entryPc - right.entryPc
    ))[0];

  return {
    ...selected,
    selectionReason:
      selected.localIncoming.length === 0
        ? 'Earliest post-terminator candidate with no earlier incoming branch on the recovered path.'
        : 'No perfectly clean candidate was found; picked the candidate with the fewest earlier incoming branches.',
  };
}

function scanAbsoluteTransferHits(romBytes, targetPc) {
  const hits = [];
  for (let pc = 0; pc <= romBytes.length - 4; pc += 1) {
    const meta = ABSOLUTE_TRANSFER_OPS.get(romBytes[pc]);
    if (!meta) continue;
    if (read24le(romBytes, pc + 1) !== targetPc) continue;
    hits.push({
      pc,
      ...meta,
      bytes: bytesAt(romBytes, pc, 4),
    });
  }
  return hits;
}

function resolveKernelInitEntry(blocks) {
  const candidates = [
    { key: '000280:adl', pc: KERNEL_INIT_REQUEST_PC, mode: 'adl' },
    { key: '000280:z80', pc: KERNEL_INIT_REQUEST_PC, mode: 'z80' },
    { key: '020028:adl', pc: KERNEL_INIT_FALLBACK_PC, mode: 'adl' },
  ];

  for (const candidate of candidates) {
    if (blocks[candidate.key]) return candidate;
  }

  throw new Error('Unable to locate a lifted kernel-init block at 0x000280 or 0x020028.');
}

function createRuntime(romBytes, blocks) {
  const memory = new Uint8Array(MEM_SIZE);
  memory.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, memory, { peripherals });
  return {
    mem: memory,
    cpu: executor.cpu,
    executor,
  };
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function readWidth(mem, addr, width) {
  const base = addr & MEM_MASK;
  if (width === 1) return mem[base] ?? 0;
  if (width === 2) {
    return ((mem[base] ?? 0) | ((mem[(base + 1) & MEM_MASK] ?? 0) << 8)) >>> 0;
  }
  return (
    (mem[base] ?? 0)
    | ((mem[(base + 1) & MEM_MASK] ?? 0) << 8)
    | ((mem[(base + 2) & MEM_MASK] ?? 0) << 16)
  ) >>> 0;
}

function captureRegs(cpu) {
  return {
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    bc: cpu.bc & 0xFFFFFF,
    de: cpu.de & 0xFFFFFF,
    hl: cpu.hl & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    ix: cpu._ix & 0xFFFFFF,
    iy: cpu._iy & 0xFFFFFF,
    madl: cpu.madl & 0x1,
    mbase: cpu.mbase & 0xFF,
  };
}

function formatRegs(regs) {
  return [
    `A=${hexByte(regs.a)}`,
    `F=${hexByte(regs.f)}`,
    `BC=${hex(regs.bc)}`,
    `DE=${hex(regs.de)}`,
    `HL=${hex(regs.hl)}`,
    `SP=${hex(regs.sp)}`,
    `IX=${hex(regs.ix)}`,
    `IY=${hex(regs.iy)}`,
    `MADL=${regs.madl}`,
    `MBASE=${hexByte(regs.mbase)}`,
  ].join(' ');
}

function bootRuntime(runtime, kernelInfo) {
  const { executor, cpu } = runtime;

  const bootResult = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_STEPS,
    maxLoopIterations: BOOT_LOOP_LIMIT,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._ix = IX_BASE;
  cpu._iy = IY_BASE;
  cpu.sp = (STACK_TOP - 3) & 0xFFFFFF;

  const kernelResult = executor.runFrom(kernelInfo.pc, kernelInfo.mode, {
    maxSteps: KERNEL_INIT_STEPS,
    maxLoopIterations: KERNEL_INIT_LOOP_LIMIT,
  });

  return { bootResult, kernelResult };
}

function prepareTraceState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  if ((cpu._ix & 0xFFFFFF) === 0) cpu._ix = IX_BASE;
  if ((cpu._iy & 0xFFFFFF) === 0) cpu._iy = IY_BASE;

  const nextSp = (((cpu.sp & 0xFFFFFF) || STACK_TOP) - 3) & 0xFFFFFF;
  cpu.sp = nextSp;
  write24(mem, cpu.sp, RETURN_SENTINEL);
}

function installD3fWriteWatch(cpu, mem, state) {
  const events = [];
  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  function record(kind, addr, width, afterValue) {
    const base = addr & 0xFFFFFF;
    for (let offset = 0; offset < width; offset += 1) {
      const byteAddr = (base + offset) & 0xFFFFFF;
      if (byteAddr < D3F_START || byteAddr > D3F_END) continue;
      events.push({
        step: state.step,
        blockPc: state.blockPc,
        kind,
        addr: byteAddr,
        before: mem[byteAddr & MEM_MASK] ?? 0,
        after: (afterValue >>> (offset * 8)) & 0xFF,
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
    events,
    restore() {
      cpu.write8 = originalWrite8;
      cpu.write16 = originalWrite16;
      cpu.write24 = originalWrite24;
    },
  };
}

function collectKnownCalls(meta, step, blockPc) {
  const events = [];
  for (const inst of meta?.instructions ?? []) {
    const target = Number.isInteger(inst.target) ? (inst.target & 0xFFFFFF) : null;
    if (target === null || !KNOWN_FUNCTIONS.has(target)) continue;
    const tag = String(inst.tag ?? '');
    if (!tag.startsWith('call') && !tag.startsWith('jp')) continue;
    events.push({
      step,
      blockPc: blockPc & 0xFFFFFF,
      pc: Number.isInteger(inst.pc) ? (inst.pc & 0xFFFFFF) : (blockPc & 0xFFFFFF),
      tag,
      target,
      text: inst.dasm ?? formatInstruction(inst),
    });
  }
  return events;
}

function traceFromEntry(runtime, entryPc) {
  const { cpu, mem, executor } = runtime;
  prepareTraceState(cpu, mem);

  const state = { step: 0, blockPc: entryPc & 0xFFFFFF };
  const watcher = installD3fWriteWatch(cpu, mem, state);
  const startRegs = captureRegs(cpu);
  const blocksVisited = [];
  const knownCalls = [];

  let result;
  try {
    result = executor.runFrom(entryPc, 'adl', {
      maxSteps: TRACE_STEPS,
      maxLoopIterations: TRACE_LOOP_LIMIT,
      onBlock(pc, mode, meta, step) {
        state.step = step;
        state.blockPc = pc & 0xFFFFFF;

        const instructions = (meta?.instructions ?? []).map((inst) => ({
          pc: Number.isInteger(inst.pc) ? (inst.pc & 0xFFFFFF) : (pc & 0xFFFFFF),
          dasm: inst.dasm ?? formatInstruction(inst),
        }));

        const localCalls = collectKnownCalls(meta, step, pc);
        knownCalls.push(...localCalls);

        blocksVisited.push({
          step,
          pc: pc & 0xFFFFFF,
          mode,
          containsCallSite: instructions.some((inst) => inst.pc === CALL_SITE),
          instructions: instructions.map((inst) => inst.dasm),
        });
      },
    });
  } finally {
    watcher.restore();
  }

  return {
    result,
    startRegs,
    endRegs: captureRegs(cpu),
    blocksVisited,
    knownCalls,
    d3fWrites: watcher.events,
  };
}

function printRows(title, rows) {
  console.log(`=== ${title} ===`);
  for (const row of rows) {
    console.log(`${hex(row.pc)}  ${formatBytes(row.bytes).padEnd(23)}  ${row.text}`);
  }
  console.log('');
}

function printCandidateReport(candidates, selected) {
  console.log('=== Candidate Entry Points ===');
  if (candidates.length === 0) {
    console.log('  (none recovered from the backward path)');
    console.log('');
    return;
  }

  for (const candidate of candidates) {
    const selectedMark = candidate.entryPc === selected.entryPc ? ' <== selected' : '';
    console.log(
      `- entry=${hex(candidate.entryPc)} after=${hex(candidate.afterPc)} ${candidate.afterText}`
      + ` localIncoming=${candidate.localIncoming.length}${selectedMark}`
    );
    for (const incoming of candidate.localIncoming) {
      console.log(`    incoming ${hex(incoming.pc)} ${incoming.text}`);
    }
  }
  console.log('');
  console.log(`Selection: ${hex(selected.entryPc)}`);
  console.log(`Reason: ${selected.selectionReason}`);
  console.log('');
}

function printCallerHits(targetPc, hits) {
  console.log(`=== ROM-wide CALL/JP Scan for ${hex(targetPc)} ===`);
  console.log(`Total hits: ${hits.length}`);
  if (hits.length === 0) {
    console.log('  (none)');
  } else {
    for (const hit of hits) {
      console.log(`- ${hex(hit.pc)} ${hit.mnemonic} ${hex(targetPc)} bytes=${formatBytes(hit.bytes)}`);
    }
  }
  console.log('');
}

function printDynamicTrace(entryPc, trace, liftedEntryPresent) {
  console.log(`=== Dynamic Trace from ${hex(entryPc)} ===`);
  console.log(`Lifted ADL entry present: ${liftedEntryPresent ? 'yes' : 'no'}`);
  console.log(`Start regs: ${formatRegs(trace.startRegs)}`);
  console.log(
    `Trace result: termination=${trace.result.termination}`
    + ` steps=${trace.result.steps}`
    + ` lastPc=${hex(trace.result.lastPc)}:${trace.result.lastMode}`
  );
  console.log(`End regs: ${formatRegs(trace.endRegs)}`);
  console.log('');

  console.log('Blocks visited:');
  if (trace.blocksVisited.length === 0) {
    console.log('  (none)');
  } else {
    for (const block of trace.blocksVisited) {
      const marker = block.containsCallSite ? ' [contains 0x08237A]' : '';
      const instructionText = block.instructions.join(' | ') || '(no instructions)';
      console.log(
        `- step=${String(block.step).padStart(3, ' ')} ${hex(block.pc)}:${block.mode}${marker}`
        + ` :: ${instructionText}`
      );
    }
  }
  console.log('');

  console.log('Known function calls / jumps:');
  if (trace.knownCalls.length === 0) {
    console.log('  (none)');
  } else {
    for (const call of trace.knownCalls) {
      console.log(
        `- step=${String(call.step).padStart(3, ' ')} block=${hex(call.blockPc)}`
        + ` pc=${hex(call.pc)} ${call.text} ; ${KNOWN_FUNCTIONS.get(call.target)}`
      );
    }
  }
  console.log('');

  console.log('D3Fxxx writes:');
  if (trace.d3fWrites.length === 0) {
    console.log('  (none)');
  } else {
    for (const write of trace.d3fWrites) {
      console.log(
        `- step=${String(write.step).padStart(3, ' ')} block=${hex(write.blockPc)}`
        + ` ${write.kind} ${hex(write.addr)} ${hexByte(write.before)} -> ${hexByte(write.after)}`
      );
    }
  }
  console.log('');
}

async function main() {
  const romBytes = fs.readFileSync(ROM_PATH);
  const { blocks, assets } = await loadBlocks();

  try {
    console.log('Phase 278: 0x08237A parent function probe');
    console.log(`ROM: ${ROM_PATH}`);
    console.log(`Target call site: ${hex(CALL_SITE)}`);
    console.log('');

    const backwardRows = recoverBackwardPath(romBytes, CALL_SITE, STATIC_SCAN_START, 'adl');
    const candidates = findEntryCandidates(backwardRows, CALL_SITE);
    const selectedEntry = selectEntryCandidate(candidates, backwardRows[0]?.pc ?? CALL_SITE);
    const selectedDisasm = disassembleRange(romBytes, selectedEntry.entryPc, Math.min(STATIC_SCAN_END, CALL_SITE + 0x10), 'adl');
    const callsiteDisasm = disassembleRange(romBytes, CALLSITE_CONTEXT_START, CALLSITE_CONTEXT_END, 'adl');

    console.log('=== Part 1: Static backward recovery ===');
    console.log(`Recovered path rows: ${backwardRows.length}`);
    console.log(`Recovered path floor: ${hex(backwardRows[0]?.pc ?? CALL_SITE)}`);
    console.log(`No stack-frame prologue was required; selection is based on post-terminator boundaries and local incoming-branch checks.`);
    console.log('');

    printCandidateReport(candidates, selectedEntry);
    printRows(`Selected entry window ${hex(selectedEntry.entryPc)}..${hex(Math.min(STATIC_SCAN_END, CALL_SITE + 0x10))}`, selectedDisasm);
    printRows(`Call-site setup window ${hex(CALLSITE_CONTEXT_START)}..${hex(CALLSITE_CONTEXT_END)}`, callsiteDisasm);

    const callerHits = scanAbsoluteTransferHits(romBytes, selectedEntry.entryPc);
    printCallerHits(selectedEntry.entryPc, callerHits);

    const runtime = createRuntime(romBytes, blocks);
    const kernelInfo = resolveKernelInitEntry(blocks);
    const boot = bootRuntime(runtime, kernelInfo);
    const liftedEntryKey = `${selectedEntry.entryPc.toString(16).padStart(6, '0')}:adl`;
    const trace = traceFromEntry(runtime, selectedEntry.entryPc);

    console.log('=== Boot summary ===');
    console.log(
      `coldBoot termination=${boot.bootResult.termination} steps=${boot.bootResult.steps}`
      + ` lastPc=${hex(boot.bootResult.lastPc)}:${boot.bootResult.lastMode}`
    );
    console.log(
      `kernelInit entry=${hex(kernelInfo.pc)}:${kernelInfo.mode}`
      + ` termination=${boot.kernelResult.termination}`
      + ` steps=${boot.kernelResult.steps}`
      + ` lastPc=${hex(boot.kernelResult.lastPc)}:${boot.kernelResult.lastMode}`
    );
    console.log('');

    printDynamicTrace(selectedEntry.entryPc, trace, Boolean(blocks[liftedEntryKey]));

    const summary = {
      phase: 278,
      callSite: hex(CALL_SITE),
      selectedEntry: hex(selectedEntry.entryPc),
      candidateCount: candidates.length,
      callerHitCount: callerHits.length,
      callerHits: callerHits.map((hit) => ({
        pc: hex(hit.pc),
        mnemonic: hit.mnemonic,
        bytes: formatBytes(hit.bytes),
      })),
      trace: {
        liftedEntryPresent: Boolean(blocks[liftedEntryKey]),
        termination: trace.result.termination,
        steps: trace.result.steps,
        lastPc: hex(trace.result.lastPc),
        lastMode: trace.result.lastMode,
        blockVisitCount: trace.blocksVisited.length,
        knownCallCount: trace.knownCalls.length,
        d3fWriteCount: trace.d3fWrites.length,
      },
    };

    console.log('=== Summary JSON ===');
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
