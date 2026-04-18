#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MEM_SIZE = 0x1000000;
const ROM_LIMIT = 0x400000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xE00000;
const VRAM_BASE = 0xD40000;
const VRAM_BYTE_SIZE = 320 * 240 * 2;
const MODE_BUF_START = 0xD020A6;
const MODE_BUF_TEXT = 'Normal Float Radian       ';

const STAGE3_ENTRY = 0x0A29EC;
const STAGE3_MODE = 'adl';
const STAGE3_MAX_STEPS = 50000;
const STAGE3_MAX_LOOP_ITERATIONS = 500;

const FONT_TABLE_START = 0x0040EE;
const FONT_TABLE_END = 0x004FFF;
const FONT_POINTER_START = 0xD00580;
const FONT_POINTER_END = 0xD005FF;
const FONT_POINTER_ADDR = 0xD00585;

const STATIC_CHAIN_BLOCK_LIMIT = 10;
const ACCESS_PREVIEW_LIMIT = 8;
const PATH_LOOKBACK = 10;

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;
const ADL_BLOCK_STARTS = buildBlockStarts(BLOCKS);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function read24(mem, addr) {
  return mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16);
}

function clearVram(mem) {
  mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);
}

function seedModeBuffer(mem) {
  for (let index = 0; index < MODE_BUF_TEXT.length; index += 1) {
    mem[MODE_BUF_START + index] = MODE_BUF_TEXT.charCodeAt(index);
  }
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot, mem) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, 12);
}

function snapshotRegisters(cpu, pc) {
  return {
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    bc: cpu.bc & 0xFFFFFF,
    de: cpu.de & 0xFFFFFF,
    hl: cpu.hl & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    ix: cpu.ix & 0xFFFFFF,
    iy: cpu.iy & 0xFFFFFF,
    pc: pc & 0xFFFFFF,
  };
}

function formatRegisters(registers) {
  return [
    `HL=${hex(registers.hl)}`,
    `DE=${hex(registers.de)}`,
    `BC=${hex(registers.bc)}`,
    `SP=${hex(registers.sp)}`,
    `IX=${hex(registers.ix)}`,
    `IY=${hex(registers.iy)}`,
    `A=${hex(registers.a, 2)}`,
    `F=${hex(registers.f, 2)}`,
    `PC=${hex(registers.pc)}`,
  ].join(' ');
}

function buildBlockStarts(blocks) {
  return Object.keys(blocks)
    .map((key) => key.split(':'))
    .filter((parts) => parts.length === 2 && parts[1] === 'adl')
    .map((parts) => parseInt(parts[0], 16))
    .filter((value) => Number.isFinite(value))
    .sort((left, right) => left - right);
}

function findNextBlockStart(pc) {
  let low = 0;
  let high = ADL_BLOCK_STARTS.length;

  while (low < high) {
    const mid = (low + high) >> 1;
    if (ADL_BLOCK_STARTS[mid] <= pc) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }

  return ADL_BLOCK_STARTS[low] ?? Number.POSITIVE_INFINITY;
}

function blockKey(pc, mode = 'adl') {
  return `${pc.toString(16).padStart(6, '0')}:${mode}`;
}

function getBlockMeta(pc, mode = 'adl') {
  return BLOCKS[blockKey(pc, mode)] ?? null;
}

function formatIndexedOperand(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${indexRegister}${sign}${displacement})`;
}

function formatDecodedInstruction(inst) {
  if (!inst) {
    return 'decode failed';
  }

  switch (inst.tag) {
    case 'call':
      return `call ${hex(inst.target)}`;
    case 'call-conditional':
      return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp':
      return `jp ${hex(inst.target)}`;
    case 'jp-conditional':
      return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `jp (${inst.indirectRegister ?? 'hl'})`;
    case 'jr':
      return `jr ${hex(inst.target)}`;
    case 'jr-conditional':
      return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'ret':
      return 'ret';
    case 'ret-conditional':
      return `ret ${inst.condition}`;
    case 'ld-pair-imm':
      return `ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return `ld (${hex(inst.addr)}), ${inst.pair}`;
      }
      return `ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `ld (${hex(inst.addr)}), ${inst.pair}`;
    case 'ld-reg-mem':
      return `ld ${inst.dest}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-reg-imm':
      return `ld ${inst.dest}, ${hex(inst.value, 2)}`;
    case 'ld-reg-reg':
      return `ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind':
      return `ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg':
      return `ld (${inst.dest}), ${inst.src}`;
    case 'ld-reg-ixd':
      return `ld ${inst.dest}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `ld ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${inst.src}`;
    case 'ld-ixd-imm':
      return `ld ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${hex(inst.value, 2)}`;
    case 'ld-pair-indexed':
      return `ld ${inst.pair}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair':
      return `ld ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${inst.pair}`;
    case 'ld-ixiy-indexed':
      return `ld ${inst.dest}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-ixiy':
      return `ld ${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${inst.src}`;
    case 'ld-pair-ind':
      return `ld ${inst.pair}, (${inst.src})`;
    case 'ld-ind-pair':
      return `ld (${inst.dest}), ${inst.pair}`;
    case 'push':
      return `push ${inst.pair}`;
    case 'pop':
      return `pop ${inst.pair}`;
    case 'inc-pair':
      return `inc ${inst.pair}`;
    case 'dec-pair':
      return `dec ${inst.pair}`;
    case 'inc-reg':
      return `inc ${inst.reg}`;
    case 'dec-reg':
      return `dec ${inst.reg}`;
    case 'inc-ixd':
      return `inc ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'dec-ixd':
      return `dec ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'add-pair':
      return `add ${inst.dest}, ${inst.src}`;
    case 'alu-imm':
      return `${inst.op} ${hex(inst.value, 2)}`;
    case 'alu-reg':
      return `${inst.op} ${inst.src}`;
    case 'alu-ind':
      return `${inst.op} (${inst.src ?? inst.indirectRegister ?? 'hl'})`;
    case 'alu-ixd':
      return `${inst.op} ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'bit-test':
      return `bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind':
      return `bit ${inst.bit}, (${inst.indirectRegister})`;
    case 'indexed-cb-bit':
      return `bit ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `res ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `set ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-rotate':
      return `${inst.operation} ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'rotate-ind':
      return `${inst.op} (${inst.indirectRegister})`;
    case 'rotate-reg':
      return `${inst.op} ${inst.reg}`;
    case 'ldir':
    case 'lddr':
    case 'cpi':
    case 'cpir':
    case 'cpd':
    case 'cpdr':
    case 'di':
    case 'ei':
    case 'halt':
    case 'nop':
    case 'ex-de-hl':
    case 'exx':
    case 'scf':
    case 'ccf':
    case 'cpl':
    case 'daa':
    case 'neg':
      return inst.tag;
    case 'rst':
      return `rst ${hex(inst.target, 2)}`;
    case 'djnz':
      return `djnz ${hex(inst.target)}`;
    default:
      return inst.tag;
  }
}

function decodeLinearBlock(startPc, mode = 'adl', maxInstructions = 32) {
  const rows = [];
  const nextBlockStart = findNextBlockStart(startPc);
  let pc = startPc;

  while (rows.length < maxInstructions && pc < romBytes.length) {
    let inst;

    try {
      inst = decodeInstruction(romBytes, pc, mode);
    } catch {
      break;
    }

    rows.push({
      ...inst,
      mode,
      bytes: bytesToHex(romBytes.slice(inst.pc, inst.pc + inst.length)),
      dasm: formatDecodedInstruction(inst),
    });

    pc += inst.length;

    if (inst.terminates) {
      break;
    }

    if (pc >= nextBlockStart && nextBlockStart !== Number.POSITIVE_INFINITY) {
      break;
    }
  }

  return rows;
}

function getBlockInstructions(meta, pc, mode = 'adl') {
  if (Array.isArray(meta?.instructions) && meta.instructions.length > 0) {
    return meta.instructions;
  }

  return decodeLinearBlock(pc, mode);
}

function rangeOverlaps(start, width, rangeStart, rangeEnd) {
  const end = start + width - 1;
  return start <= rangeEnd && end >= rangeStart;
}

function createAccessRecord(addr, width, value) {
  const start = addr & 0xFFFFFF;
  const bytes = [];

  for (let index = 0; index < width; index += 1) {
    bytes.push((value >> (index * 8)) & 0xFF);
  }

  return {
    start,
    end: start + width - 1,
    width,
    value: Number(value) >>> 0,
    bytes,
  };
}

function formatAccess(record) {
  const range = record.width === 1
    ? hex(record.start)
    : `${hex(record.start)}-${hex(record.end)}`;

  return `${range} value=${hex(record.value, record.width * 2)} bytes=${bytesToHex(record.bytes)}`;
}

function summarizeAccesses(accesses, limit = ACCESS_PREVIEW_LIMIT) {
  if (accesses.length === 0) {
    return ['(none)'];
  }

  const lines = accesses.slice(0, limit).map(formatAccess);

  if (accesses.length > limit) {
    lines.push(`... ${accesses.length - limit} more access(es)`);
  }

  return lines;
}

function createTraceRecorder(cpu) {
  const blocks = [];
  let currentBlock = null;

  return {
    blocks,
    onBlock(pc, mode, meta, steps) {
      currentBlock = {
        step: steps + 1,
        pc: pc & 0xFFFFFF,
        mode,
        entryRegisters: snapshotRegisters(cpu, pc),
        instructions: getBlockInstructions(meta, pc, mode),
        fontTableReads: [],
        fontPointerReads: [],
      };

      blocks.push(currentBlock);
    },
    onRead(addr, width, value) {
      if (!currentBlock) {
        return;
      }

      const start = addr & 0xFFFFFF;

      if (start < ROM_LIMIT && rangeOverlaps(start, width, FONT_TABLE_START, FONT_TABLE_END)) {
        currentBlock.fontTableReads.push(createAccessRecord(start, width, value));
      }

      if (rangeOverlaps(start, width, FONT_POINTER_START, FONT_POINTER_END)) {
        currentBlock.fontPointerReads.push(createAccessRecord(start, width, value));
      }
    },
  };
}

function installMemoryReadProbe(cpu, recorder) {
  const origRead8 = cpu.read8.bind(cpu);
  const origRead16 = cpu.read16.bind(cpu);
  const origRead24 = cpu.read24.bind(cpu);

  cpu.read8 = (addr) => {
    const value = origRead8(addr);
    recorder.onRead(addr, 1, value);
    return value;
  };

  cpu.read16 = (addr) => {
    const value = origRead16(addr);
    recorder.onRead(addr, 2, value);
    return value;
  };

  cpu.read24 = (addr) => {
    const value = origRead24(addr);
    recorder.onRead(addr, 3, value);
    return value;
  };

  return () => {
    cpu.read8 = origRead8;
    cpu.read16 = origRead16;
    cpu.read24 = origRead24;
  };
}

function getInstructionReadAddress(inst) {
  if (inst.tag === 'ld-pair-mem') {
    if (inst.direction === 'to-mem') {
      return null;
    }
    return typeof inst.addr === 'number' ? inst.addr : null;
  }

  if (inst.tag === 'ld-reg-mem') {
    return typeof inst.addr === 'number' ? inst.addr : null;
  }

  return null;
}

function pointerSourceRegister(inst) {
  switch (inst.tag) {
    case 'ld-reg-ind':
      return inst.src ?? null;
    case 'ld-pair-ind':
      return inst.src ?? null;
    case 'alu-ind':
      return inst.src ?? inst.indirectRegister ?? 'hl';
    case 'bit-test-ind':
    case 'rotate-ind':
      return inst.indirectRegister ?? null;
    case 'ld-reg-ixd':
    case 'ld-pair-indexed':
    case 'ld-ixiy-indexed':
    case 'alu-ixd':
    case 'indexed-cb-bit':
    case 'indexed-cb-res':
    case 'indexed-cb-set':
    case 'indexed-cb-rotate':
      return inst.indexRegister ?? null;
    case 'ldir':
    case 'lddr':
    case 'cpi':
    case 'cpir':
    case 'cpd':
    case 'cpdr':
      return 'hl';
    default:
      return null;
  }
}

function inferLikelyPointerRegisters(block) {
  const firstAccess = block.fontTableReads[0];
  if (!firstAccess) {
    return [];
  }

  const matches = new Set();

  for (const registerName of ['hl', 'de', 'bc', 'ix', 'iy']) {
    const value = block.entryRegisters[registerName];
    if (!Number.isFinite(value)) {
      continue;
    }

    if (value >= firstAccess.start && value <= firstAccess.end) {
      matches.add(registerName.toUpperCase());
      continue;
    }

    if (firstAccess.start >= value && firstAccess.start < value + firstAccess.width) {
      matches.add(registerName.toUpperCase());
    }
  }

  if (matches.size > 0) {
    return [...matches];
  }

  for (const inst of block.instructions) {
    const source = pointerSourceRegister(inst);
    if (source) {
      matches.add(source.toUpperCase());
    }
  }

  return [...matches];
}

function describePointerCandidateInstruction(inst) {
  const addr = getInstructionReadAddress(inst);

  if (typeof addr === 'number' && addr >= FONT_POINTER_START && addr <= FONT_POINTER_END) {
    const dest = inst.pair ?? inst.dest ?? '?';

    if (addr === FONT_POINTER_ADDR) {
      return `direct read from ${hex(addr)} into ${dest}`;
    }

    return `direct read from pointer region ${hex(addr)} into ${dest}`;
  }

  if (
    inst.tag === 'ld-pair-imm' &&
    typeof inst.value === 'number' &&
    inst.value >= FONT_TABLE_START &&
    inst.value <= FONT_TABLE_END
  ) {
    return `loads font-table constant ${hex(inst.value)} into ${inst.pair}`;
  }

  return null;
}

function collectPointerCandidates(blocks, endIndex) {
  const results = [];

  for (let index = 0; index <= endIndex; index += 1) {
    const block = blocks[index];
    const notes = [];

    for (const inst of block.instructions) {
      const note = describePointerCandidateInstruction(inst);
      if (note) {
        notes.push({ inst, note });
      }
    }

    if (notes.length === 0 && block.fontPointerReads.length > 0) {
      const runtimeRegisters = new Set();

      for (const inst of block.instructions) {
        const source = pointerSourceRegister(inst);
        if (source) {
          runtimeRegisters.add(source.toUpperCase());
        }
      }

      if (runtimeRegisters.size > 0) {
        notes.push({
          inst: null,
          note: `runtime pointer-region read via ${[...runtimeRegisters].join(', ')}`,
        });
      }
    }

    if (notes.length > 0 || block.fontPointerReads.length > 0) {
      results.push({ block, notes });
    }
  }

  return results;
}

function collectCallTargets(instructions) {
  return instructions
    .filter((inst) => (inst.tag === 'call' || inst.tag === 'call-conditional') && Number.isFinite(inst.target))
    .map((inst) => inst.target);
}

function findContinuationTarget(meta, instructions) {
  const exits = meta?.exits ?? [];

  for (const type of ['call-return', 'fallthrough', 'branch']) {
    const exit = exits.find((candidate) => candidate.type === type && Number.isFinite(candidate.target));
    if (exit) {
      return exit.target;
    }
  }

  const last = instructions[instructions.length - 1] ?? null;

  if (last && Number.isFinite(last.fallthrough)) {
    return last.fallthrough;
  }

  if (last && (last.tag === 'jp' || last.tag === 'jr') && Number.isFinite(last.target)) {
    return last.target;
  }

  return null;
}

function buildStaticCallChain(entryPc, maxBlocks = STATIC_CHAIN_BLOCK_LIMIT) {
  const chain = [];
  const seen = new Set();

  function visit(pc, reason) {
    if (!Number.isFinite(pc) || chain.length >= maxBlocks || seen.has(pc)) {
      return;
    }

    seen.add(pc);

    const meta = getBlockMeta(pc, 'adl');
    const instructions = getBlockInstructions(meta, pc, 'adl');

    chain.push({
      pc,
      reason,
      meta,
      instructions,
    });

    if (chain.length >= maxBlocks) {
      return;
    }

    for (const target of collectCallTargets(instructions)) {
      visit(target, `call from ${hex(pc)}`);
      if (chain.length >= maxBlocks) {
        return;
      }
    }

    const continuation = findContinuationTarget(meta, instructions);
    if (Number.isFinite(continuation)) {
      visit(continuation, `continue from ${hex(pc)}`);
    }
  }

  visit(entryPc, 'entry');
  return chain;
}

function describeStaticCandidate(inst) {
  const addr = getInstructionReadAddress(inst);

  if (typeof addr === 'number' && addr >= FONT_POINTER_START && addr <= FONT_POINTER_END) {
    const dest = inst.pair ?? inst.dest ?? '?';

    if (addr === FONT_POINTER_ADDR) {
      return `possible font-pointer load into ${dest} from ${hex(addr)}`;
    }

    return `possible pointer-region load into ${dest} from ${hex(addr)}`;
  }

  if (typeof addr === 'number' && addr >= FONT_TABLE_START && addr <= FONT_TABLE_END) {
    const dest = inst.pair ?? inst.dest ?? '?';
    return `possible direct font-table read into ${dest} from ${hex(addr)}`;
  }

  if (
    inst.tag === 'ld-pair-imm' &&
    typeof inst.value === 'number' &&
    inst.value >= FONT_TABLE_START &&
    inst.value <= FONT_TABLE_END
  ) {
    return `loads font-table constant ${hex(inst.value)} into ${inst.pair}`;
  }

  const source = pointerSourceRegister(inst);
  if (source) {
    return `indirect read via ${source.toUpperCase()}`;
  }

  return null;
}

function printDisassembly(instructions, indent = '  ') {
  for (const inst of instructions) {
    const bytes = String(inst.bytes ?? '').padEnd(18, ' ');
    const dasm = inst.dasm ?? formatDecodedInstruction(inst);
    console.log(`${indent}${hex(inst.pc)}  ${bytes} ${dasm}`);
  }
}

function printBlockHits(title, blocks, fieldName) {
  console.log(`=== ${title} ===`);

  if (blocks.length === 0) {
    console.log('  (none)');
    return;
  }

  for (const block of blocks) {
    const lastInst = block.instructions[block.instructions.length - 1] ?? null;
    console.log(
      `  step ${String(block.step).padStart(5, ' ')} PC=${hex(block.pc)} last=${lastInst?.dasm ?? formatDecodedInstruction(lastInst)}`,
    );

    for (const line of summarizeAccesses(block[fieldName])) {
      console.log(`    ${line}`);
    }
  }
}

function printPathToBlock(blocks, targetIndex) {
  console.log('=== Path to First Font Data Read ===');

  const start = Math.max(0, targetIndex - PATH_LOOKBACK);

  for (let index = start; index <= targetIndex; index += 1) {
    const block = blocks[index];
    const marker = index === targetIndex ? ' <font read>' : '';
    const lastInst = block.instructions[block.instructions.length - 1] ?? null;
    console.log(
      `  step ${String(block.step).padStart(5, ' ')} PC=${hex(block.pc)} last=${lastInst?.dasm ?? formatDecodedInstruction(lastInst)}${marker}`,
    );
  }
}

function printPointerCandidates(candidates) {
  console.log('=== Pointer Load Candidates Before First Font Read ===');

  if (candidates.length === 0) {
    console.log('  (none)');
    return;
  }

  for (const entry of candidates) {
    console.log(`  step ${String(entry.block.step).padStart(5, ' ')} PC=${hex(entry.block.pc)}`);

    if (entry.block.fontPointerReads.length > 0) {
      for (const line of summarizeAccesses(entry.block.fontPointerReads, 4)) {
        console.log(`    runtime: ${line}`);
      }
    }

    for (const note of entry.notes) {
      if (note.inst) {
        console.log(
          `    ${hex(note.inst.pc)} ${note.inst.dasm ?? formatDecodedInstruction(note.inst)}  [${note.note}]`,
        );
      } else {
        console.log(`    ${note.note}`);
      }
    }
  }
}

function printStaticFallback() {
  console.log('');
  console.log('=== Static Fallback: Call Chain from 0x0A29EC ===');

  const chain = buildStaticCallChain(STAGE3_ENTRY, STATIC_CHAIN_BLOCK_LIMIT);

  if (chain.length === 0) {
    console.log('  No static blocks found.');
    return;
  }

  chain.forEach((block, index) => {
    console.log(`Block ${index + 1}: ${hex(block.pc)} (${block.reason})`);

    const candidates = block.instructions
      .map((inst) => ({ inst, note: describeStaticCandidate(inst) }))
      .filter((entry) => entry.note);

    if (candidates.length > 0) {
      console.log('  Candidate instructions:');
      for (const candidate of candidates) {
        console.log(
          `    ${hex(candidate.inst.pc)} ${candidate.inst.dasm ?? formatDecodedInstruction(candidate.inst)}  [${candidate.note}]`,
        );
      }
    }

    printDisassembly(block.instructions, '  ');
    console.log('');
  });
}

async function main() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  clearVram(mem);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  console.log('=== Phase 155B: Font Path Probe ===');
  console.log(`Stage 3 entry: ${hex(STAGE3_ENTRY)}`);
  console.log('');

  coldBoot(executor, cpu, mem);
  const ramSnapshot = new Uint8Array(mem.slice(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END));
  const cpuSnapshot = snapshotCpu(cpu);

  mem.set(ramSnapshot, RAM_SNAPSHOT_START);
  clearVram(mem);
  restoreCpu(cpu, cpuSnapshot, mem);
  seedModeBuffer(mem);

  console.log(`Mode buffer seeded at ${hex(MODE_BUF_START)} with "${MODE_BUF_TEXT}"`);
  console.log(
    `Font pointer slot ${hex(FONT_POINTER_ADDR)} before stage: ${hex(read24(mem, FONT_POINTER_ADDR))} bytes=${bytesToHex(mem.slice(FONT_POINTER_ADDR, FONT_POINTER_ADDR + 3))}`,
  );
  console.log('');

  const trace = createTraceRecorder(cpu);
  const uninstallProbe = installMemoryReadProbe(cpu, trace);

  let result;
  try {
    result = executor.runFrom(STAGE3_ENTRY, STAGE3_MODE, {
      maxSteps: STAGE3_MAX_STEPS,
      maxLoopIterations: STAGE3_MAX_LOOP_ITERATIONS,
      onBlock: trace.onBlock,
    });
  } finally {
    uninstallProbe();
  }

  console.log(
    `Run result: steps=${result.steps} termination=${result.termination} lastPc=${hex(result.lastPc)} lastMode=${result.lastMode ?? STAGE3_MODE}`,
  );
  console.log(`Blocks executed: ${trace.blocks.length}`);
  console.log('');

  const fontTableBlocks = trace.blocks.filter((block) => block.fontTableReads.length > 0);
  const pointerBlocks = trace.blocks.filter((block) => block.fontPointerReads.length > 0);

  printBlockHits(
    'Blocks Reading Font Table Region 0x0040EE-0x004FFF',
    fontTableBlocks,
    'fontTableReads',
  );
  console.log('');
  printBlockHits(
    'Blocks Reading Font Pointer Region 0xD00580-0xD005FF',
    pointerBlocks,
    'fontPointerReads',
  );

  let needStaticFallback = fontTableBlocks.length === 0;
  const firstFontIndex = trace.blocks.findIndex((block) => block.fontTableReads.length > 0);

  if (firstFontIndex >= 0) {
    const firstFontBlock = trace.blocks[firstFontIndex];
    const likelyRegisters = inferLikelyPointerRegisters(firstFontBlock);
    const pointerCandidates = collectPointerCandidates(trace.blocks, firstFontIndex);

    console.log('');
    printPathToBlock(trace.blocks, firstFontIndex);
    console.log('');
    console.log(`=== First Font Data Block ===`);
    console.log(`step=${firstFontBlock.step} PC=${hex(firstFontBlock.pc)} mode=${firstFontBlock.mode}`);
    console.log(`Entry registers: ${formatRegisters(firstFontBlock.entryRegisters)}`);
    console.log(
      `Likely font pointer register(s): ${likelyRegisters.length > 0 ? likelyRegisters.join(', ') : 'unknown'}`,
    );
    console.log(`First font-table access: ${formatAccess(firstFontBlock.fontTableReads[0])}`);
    printDisassembly(firstFontBlock.instructions);
    console.log('');
    printPointerCandidates(pointerCandidates);

    if (pointerCandidates.length === 0 || likelyRegisters.length === 0) {
      needStaticFallback = true;
    }
  } else {
    console.log('');
    console.log('No dynamic font-table reads were captured.');
  }

  if (needStaticFallback) {
    printStaticFallback();
  }
}

await main();
