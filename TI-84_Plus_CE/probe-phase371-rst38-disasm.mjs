#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MODE = 'adl';
const STACK_RESET_TOP = 0xD1A87E;
const EVENT_LOOP_ENTRY = 0x003A73;

// --- Static disassembly targets ---

const DISASM_TARGETS = [
  { addr: 0x000038, bytes: 20, label: 'RST 38h entry' },
  { addr: 0x0006F3, bytes: 60, label: 'boot init / ISR dispatch' },
  { addr: 0x000704, bytes: 30, label: 'dispatch path A' },
  { addr: 0x000710, bytes: 20, label: 'dispatch path B' },
  { addr: 0x000719, bytes: 20, label: 'timer path' },
  { addr: 0x001713, bytes: 30, label: 'idle/dispatch check' },
  { addr: 0x001717, bytes: 30, label: 'idle/dispatch continuation' },
];

// --- Dynamic trace watch addresses ---

const CHAIN_ADDRESSES = [
  0x000038, 0x0006F3, 0x000704, 0x000710, 0x000719, 0x001713, 0x001717,
];

const STOP_TAGS = new Set([
  'ret', 'reti', 'retn', 'jp', 'jp-indirect', 'jr', 'rst', 'halt', 'slp',
]);

// --- Formatting helpers ---

function hex(value, width = 6) {
  if (value == null || Number.isNaN(Number(value))) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return ((value ?? 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function hexWord(value) {
  return ((value ?? 0) & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

function formatDisp(value) {
  return value >= 0
    ? `+0x${value.toString(16).toUpperCase()}`
    : `-0x${(-value).toString(16).toUpperCase()}`;
}

function count(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

// --- Decoder wrappers ---

function hexBytes(buffer, start, length) {
  return Array.from(
    buffer.subarray(start, Math.min(buffer.length, start + Math.max(length, 0))),
    (v) => hexByte(v),
  ).join(' ');
}

function printRawBytes(addr, buffer) {
  for (let offset = 0; offset < buffer.length; offset += 16) {
    const chunk = buffer.subarray(offset, Math.min(buffer.length, offset + 16));
    console.log(`  ${hex(addr + offset)}: ${Array.from(chunk, (v) => hexByte(v)).join(' ')}`);
  }
}

function withPrefix(inst, text) {
  return inst?.modePrefix ? `${inst.modePrefix} ${text}` : text;
}

function usesShortAddressing(inst) {
  return inst?.modePrefix === 'sis' || inst?.modePrefix === 'lis';
}

function formatDirectAddress(addr, shortAddr) {
  return shortAddr ? `0x${hexWord(addr)} [short/MBASE]` : hex(addr);
}

function formatIndexed(indexReg, disp) {
  return `(${indexReg}${formatDisp(disp)})`;
}

function formatInstruction(inst) {
  if (!inst) return 'db ??';

  switch (inst.tag) {
    case 'nop': return withPrefix(inst, 'nop');
    case 'halt': return withPrefix(inst, 'halt');
    case 'slp': return withPrefix(inst, 'slp');
    case 'di': return withPrefix(inst, 'di');
    case 'ei': return withPrefix(inst, 'ei');
    case 'ret': return withPrefix(inst, 'ret');
    case 'reti': return withPrefix(inst, 'reti');
    case 'retn': return withPrefix(inst, 'retn');
    case 'ret-conditional': return withPrefix(inst, `ret ${inst.condition}`);
    case 'jp': return withPrefix(inst, `jp ${hex(inst.target)}`);
    case 'jp-conditional': return withPrefix(inst, `jp ${inst.condition}, ${hex(inst.target)}`);
    case 'jp-indirect': return withPrefix(inst, `jp (${inst.indirectRegister})`);
    case 'jr': return withPrefix(inst, `jr ${hex(inst.target)}`);
    case 'jr-conditional': return withPrefix(inst, `jr ${inst.condition}, ${hex(inst.target)}`);
    case 'djnz': return withPrefix(inst, `djnz ${hex(inst.target)}`);
    case 'call': return withPrefix(inst, `call ${hex(inst.target)}`);
    case 'call-conditional': return withPrefix(inst, `call ${inst.condition}, ${hex(inst.target)}`);
    case 'rst': return withPrefix(inst, `rst 0x${hexByte(inst.target)}`);
    case 'push': return withPrefix(inst, `push ${inst.pair}`);
    case 'pop': return withPrefix(inst, `pop ${inst.pair}`);
    case 'inc-pair': return withPrefix(inst, `inc ${inst.pair}`);
    case 'dec-pair': return withPrefix(inst, `dec ${inst.pair}`);
    case 'inc-reg': return withPrefix(inst, `inc ${inst.reg}`);
    case 'dec-reg': return withPrefix(inst, `dec ${inst.reg}`);
    case 'inc-ixd': return withPrefix(inst, `inc ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'dec-ixd': return withPrefix(inst, `dec ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'add-pair': return withPrefix(inst, `add ${inst.dest}, ${inst.src}`);
    case 'adc-pair': return withPrefix(inst, `adc hl, ${inst.src}`);
    case 'sbc-pair': return withPrefix(inst, `sbc hl, ${inst.src}`);
    case 'ld-pair-imm': return withPrefix(inst, `ld ${inst.pair}, ${hex(inst.value)}`);
    case 'ld-pair-mem':
      return withPrefix(inst, `ld ${inst.pair}, (${formatDirectAddress(inst.addr, usesShortAddressing(inst))})`);
    case 'ld-mem-pair':
      return withPrefix(inst, `ld (${formatDirectAddress(inst.addr, usesShortAddressing(inst))}), ${inst.pair}`);
    case 'ld-pair-indexed':
      return withPrefix(inst, `ld ${inst.pair}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-indexed-pair':
      return withPrefix(inst, `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.pair}`);
    case 'ld-pair-ind':
      return withPrefix(inst, `ld ${inst.pair}, (${inst.src})`);
    case 'ld-ind-pair':
      return withPrefix(inst, `ld (${inst.dest}), ${inst.pair}`);
    case 'ld-reg-imm': return withPrefix(inst, `ld ${inst.dest}, 0x${hexByte(inst.value)}`);
    case 'ld-reg-reg': return withPrefix(inst, `ld ${inst.dest}, ${inst.src}`);
    case 'ld-reg-ind': return withPrefix(inst, `ld ${inst.dest}, (${inst.src})`);
    case 'ld-ind-reg': return withPrefix(inst, `ld (${inst.dest}), ${inst.src}`);
    case 'ld-ind-imm': return withPrefix(inst, `ld (hl), 0x${hexByte(inst.value)}`);
    case 'ld-reg-mem':
      return withPrefix(inst, `ld ${inst.dest}, (${formatDirectAddress(inst.addr, usesShortAddressing(inst))})`);
    case 'ld-mem-reg':
      return withPrefix(inst, `ld (${formatDirectAddress(inst.addr, usesShortAddressing(inst))}), ${inst.src}`);
    case 'ld-reg-ixd':
      return withPrefix(inst, `ld ${inst.dest}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-ixd-reg':
      return withPrefix(inst, `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.src}`);
    case 'ld-ixd-imm':
      return withPrefix(inst, `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, 0x${hexByte(inst.value)}`);
    case 'ld-ixiy-indexed':
      return withPrefix(inst, `ld ${inst.dest}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-indexed-ixiy':
      return withPrefix(inst, `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.src}`);
    case 'ld-sp-hl': return withPrefix(inst, 'ld sp, hl');
    case 'ld-sp-pair': return withPrefix(inst, `ld sp, ${inst.pair}`);
    case 'ld-special': return withPrefix(inst, `ld ${inst.dest}, ${inst.src}`);
    case 'ld-mb-a': return withPrefix(inst, 'ld mb, a');
    case 'ld-a-mb': return withPrefix(inst, 'ld a, mb');
    case 'alu-imm': return withPrefix(inst, `${inst.op} 0x${hexByte(inst.value)}`);
    case 'alu-reg': return withPrefix(inst, `${inst.op} ${inst.src}`);
    case 'alu-ixd': return withPrefix(inst, `${inst.op} ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'bit-test': return withPrefix(inst, `bit ${inst.bit}, ${inst.reg}`);
    case 'bit-test-ind': return withPrefix(inst, `bit ${inst.bit}, (${inst.indirectRegister})`);
    case 'bit-res': return withPrefix(inst, `res ${inst.bit}, ${inst.reg}`);
    case 'bit-res-ind': return withPrefix(inst, `res ${inst.bit}, (${inst.indirectRegister})`);
    case 'bit-set': return withPrefix(inst, `set ${inst.bit}, ${inst.reg}`);
    case 'bit-set-ind': return withPrefix(inst, `set ${inst.bit}, (${inst.indirectRegister})`);
    case 'indexed-cb-bit':
      return withPrefix(inst, `bit ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-res':
      return withPrefix(inst, `res ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-set':
      return withPrefix(inst, `set ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-rotate':
      return withPrefix(inst, `${inst.operation ?? inst.op ?? 'rotate'} ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'rotate-reg': return withPrefix(inst, `${inst.op} ${inst.reg}`);
    case 'rotate-ind': return withPrefix(inst, `${inst.op} (${inst.indirectRegister})`);
    case 'out-imm': return withPrefix(inst, `out (0x${hexByte(inst.port)}), a`);
    case 'in-imm': return withPrefix(inst, `in a, (0x${hexByte(inst.port)})`);
    case 'out-reg': return withPrefix(inst, `out (c), ${inst.reg}`);
    case 'in-reg': return withPrefix(inst, `in ${inst.reg}, (c)`);
    case 'out0': return withPrefix(inst, `out0 (0x${hexByte(inst.port)}), ${inst.reg}`);
    case 'in0': return withPrefix(inst, `in0 ${inst.reg}, (0x${hexByte(inst.port)})`);
    case 'tst-reg': return withPrefix(inst, `tst a, ${inst.reg}`);
    case 'tst-ind': return withPrefix(inst, 'tst a, (hl)');
    case 'tst-imm': return withPrefix(inst, `tst a, 0x${hexByte(inst.value)}`);
    case 'tstio': return withPrefix(inst, `tstio 0x${hexByte(inst.value)}`);
    case 'lea': return withPrefix(inst, `lea ${inst.dest}, ${inst.base}${formatDisp(inst.displacement)}`);
    case 'pea': return withPrefix(inst, `pea (${inst.base}${formatDisp(inst.displacement)})`);
    case 'neg': return withPrefix(inst, 'neg');
    case 'ex-af': return withPrefix(inst, "ex af, af'");
    case 'exx': return withPrefix(inst, 'exx');
    case 'ex-de-hl': return withPrefix(inst, 'ex de, hl');
    case 'ex-sp-hl': return withPrefix(inst, 'ex (sp), hl');
    case 'db': return withPrefix(inst, `db 0x${hexByte(inst.value ?? 0)}`);
    default: {
      const parts = [];
      for (const [key, value] of Object.entries(inst)) {
        if (['tag', 'length', 'pc', 'nextPc', 'mode', 'modePrefix', 'nextMode', 'terminates', 'fallthrough', 'kind', 'decodeError'].includes(key)) continue;
        if (value === undefined || value === null) continue;
        parts.push(typeof value === 'number' ? `${key}=${hex(value)}` : `${key}=${value}`);
      }
      return withPrefix(inst, parts.length > 0 ? `${inst.tag} ${parts.join(' ')}` : (inst.tag ?? 'unknown'));
    }
  }
}

function decodeAt(romBytes, pc) {
  try {
    const inst = decodeInstruction(romBytes, pc, MODE);
    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
      throw new Error('decoder returned invalid length');
    }
    return inst;
  } catch (error) {
    return {
      tag: 'db',
      value: romBytes[pc] ?? 0,
      length: 1,
      pc,
      nextPc: pc + 1,
      mode: MODE,
      decodeError: error instanceof Error ? error.message : String(error),
    };
  }
}

function extractTargets(inst) {
  switch (inst?.tag) {
    case 'call':
      return [{ kind: 'call', target: inst.target, text: `call -> ${hex(inst.target)}` }];
    case 'call-conditional':
      return [{ kind: `call ${inst.condition}`, target: inst.target, text: `call ${inst.condition} -> ${hex(inst.target)}` }];
    case 'jp':
      return [{ kind: 'jp', target: inst.target, text: `jp -> ${hex(inst.target)}` }];
    case 'jp-conditional':
      return [{ kind: `jp ${inst.condition}`, target: inst.target, text: `jp ${inst.condition} -> ${hex(inst.target)}` }];
    case 'jp-indirect':
      return [{ kind: 'jp indirect', target: null, text: `jp -> (${inst.indirectRegister})` }];
    case 'jr':
      return [{ kind: 'jr', target: inst.target, text: `jr -> ${hex(inst.target)}` }];
    case 'jr-conditional':
      return [{ kind: `jr ${inst.condition}`, target: inst.target, text: `jr ${inst.condition} -> ${hex(inst.target)}` }];
    case 'djnz':
      return [{ kind: 'djnz', target: inst.target, text: `djnz -> ${hex(inst.target)}` }];
    case 'rst':
      return [{ kind: 'rst', target: inst.target, text: `rst -> ${hex(inst.target, 2)}` }];
    default:
      return [];
  }
}

function extractPortAccesses(inst) {
  switch (inst?.tag) {
    case 'in-imm': return [`in a, (0x${hexByte(inst.port)})`];
    case 'out-imm': return [`out (0x${hexByte(inst.port)}), a`];
    case 'in0': return [`in0 ${inst.reg}, (0x${hexByte(inst.port)})`];
    case 'out0': return [`out0 (0x${hexByte(inst.port)}), ${inst.reg}`];
    case 'in-reg': return [`in ${inst.reg}, (c)`];
    case 'out-reg': return [`out (c), ${inst.reg}`];
    default: return [];
  }
}

function disassembleWindow(romBytes, start, byteLimit) {
  const rows = [];
  const controlFlow = [];
  const portIo = [];
  const end = Math.min(romBytes.length, start + byteLimit);
  let pc = start >>> 0;
  let stopReason = null;

  while (pc < end) {
    const inst = decodeAt(romBytes, pc);
    const fullLength = Math.max(inst.length ?? 1, 1);
    const available = end - pc;
    const shownLength = Math.max(1, Math.min(fullLength, available));
    const text = formatInstruction(inst);
    const notes = [];

    for (const target of extractTargets(inst)) {
      controlFlow.push({ pc, ...target });
      notes.push(target.text);
    }

    for (const ioText of extractPortAccesses(inst)) {
      portIo.push({ pc, text: ioText });
      notes.push(ioText);
    }

    if (inst.decodeError) {
      notes.push(`decode fallback: ${inst.decodeError}`);
    }

    rows.push({
      pc,
      bytes: hexBytes(romBytes, pc, shownLength),
      text,
      notes,
      tag: inst.tag,
      truncated: fullLength > available,
    });

    if (fullLength > available) {
      stopReason = `window ended mid-instruction at ${hex(pc)}`;
      break;
    }

    pc += fullLength;

    if (STOP_TAGS.has(inst.tag)) {
      stopReason = `stopped after ${inst.tag} at ${hex(rows[rows.length - 1].pc)}`;
      break;
    }
  }

  return { rows, controlFlow, portIo, stopReason };
}

function normalizeBlocks(raw) {
  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.filter((e) => e?.id).map((e) => [e.id, e]));
  }
  return raw ?? {};
}

function createMemoryImage(romBytes) {
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes.subarray(0, Math.min(mem.length, romBytes.length)));
  return mem;
}

function visitCountForAddress(result, addr) {
  const prefix = `${addr.toString(16).padStart(6, '0')}:`;
  let total = 0;
  for (const key of Object.keys(result.blockVisits ?? {})) {
    if (key.startsWith(prefix)) {
      total += result.blockVisits[key] ?? 0;
    }
  }
  return total;
}

// --- Main ---

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error(`ROM not found: ${ROM_PATH}`);
  }
  if (!fs.existsSync(TRANSPILED_PATH)) {
    throw new Error(`Transpiled blocks not found: ${TRANSPILED_PATH}`);
  }

  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));
  const transpiledModule = await import(pathToFileURL(TRANSPILED_PATH).href);
  const blocks = normalizeBlocks(
    transpiledModule.PRELIFTED_BLOCKS
    ?? transpiledModule.default?.PRELIFTED_BLOCKS
    ?? transpiledModule.default
    ?? transpiledModule,
  );
  const blockKeys = Object.keys(blocks);

  if (blockKeys.length === 0) {
    throw new Error('Unable to locate PRELIFTED_BLOCKS in ROM.transpiled.js.');
  }

  console.log('=== Phase 371 - RST 38h Dispatch Chain Disassembly ===');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`transpiled blocks: ${count(blockKeys.length)}`);
  console.log(`mode: ${MODE}`);
  console.log('');

  // =========================================================
  // PART 1: Boot phases 1-3
  // =========================================================

  console.log('--- Boot Phases 1-3 ---');
  const mem = createMemoryImage(romBytes);
  const bootPeripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const bootExecutor = createExecutor(blocks, mem, { peripherals: bootPeripherals });
  const bootCpu = bootExecutor.cpu;

  const r1 = bootExecutor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  console.log(`Phase 1 (Z80 cold boot): steps=${count(r1.steps)} term=${r1.termination} lastPc=${hex(r1.lastPc)}`);

  bootCpu.halted = false;
  bootCpu.iff1 = 0;
  bootCpu.iff2 = 0;
  bootCpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, bootCpu.sp, bootCpu.sp + 3);

  const r2 = bootExecutor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  console.log(`Phase 2 (ADL kernel init): steps=${count(r2.steps)} term=${r2.termination} lastPc=${hex(r2.lastPc)}`);

  bootCpu.mbase = 0xD0;
  bootCpu._iy = 0xD00080;
  bootCpu._hl = 0;
  bootCpu.halted = false;
  bootCpu.iff1 = 0;
  bootCpu.iff2 = 0;
  bootCpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, bootCpu.sp, bootCpu.sp + 3);

  const r3 = bootExecutor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  console.log(`Phase 3 (ADL post-init): steps=${count(r3.steps)} term=${r3.termination} lastPc=${hex(r3.lastPc)}`);
  console.log('');

  // =========================================================
  // PART 2: Static disassembly of the RST 38h chain
  // =========================================================

  console.log('============================================================');
  console.log('  STATIC DISASSEMBLY — RST 38h dispatch chain');
  console.log('============================================================\n');

  for (const target of DISASM_TARGETS) {
    const rawSlice = romBytes.subarray(target.addr, Math.min(romBytes.length, target.addr + target.bytes));

    console.log(`=== ${hex(target.addr)} ${target.label} (${target.bytes} bytes) ===`);
    console.log('raw bytes:');
    printRawBytes(target.addr, rawSlice);

    // Check if a lifted block exists
    const prefix = target.addr.toString(16).padStart(6, '0');
    const matchingKeys = blockKeys.filter((k) => k.startsWith(prefix)).sort();
    console.log(`lifted block keys: ${matchingKeys.length > 0 ? matchingKeys.join(', ') : 'none'}`);

    const listing = disassembleWindow(romBytes, target.addr, target.bytes);

    console.log('disassembly:');
    for (const row of listing.rows) {
      const noteText = row.notes.length > 0 ? `  ; ${row.notes.join(' | ')}` : '';
      const truncated = row.truncated ? '  ; truncated by window' : '';
      console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}${noteText}${truncated}`);
    }
    console.log(`stop reason: ${listing.stopReason ?? 'byte window exhausted'}`);

    if (listing.controlFlow.length > 0) {
      console.log('control flow targets:');
      for (const entry of listing.controlFlow) {
        console.log(`  ${hex(entry.pc)}  ${entry.text}`);
      }
    }

    if (listing.portIo.length > 0) {
      console.log('port i/o:');
      for (const entry of listing.portIo) {
        console.log(`  ${hex(entry.pc)}  ${entry.text}`);
      }
    }

    console.log('');
  }

  // =========================================================
  // PART 3: Dynamic trace with timerInterrupt:true, 50K steps
  // =========================================================

  console.log('============================================================');
  console.log('  DYNAMIC TRACE — timer interrupt, 50K steps from 0x003A73');
  console.log('============================================================\n');

  const eventPeripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: true });
  const eventExecutor = createExecutor(blocks, mem, { peripherals: eventPeripherals });
  const eventCpu = eventExecutor.cpu;

  // Copy post-boot state
  for (const field of ['a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
    'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles']) {
    eventCpu[field] = bootCpu[field];
  }

  // Configure for event loop with timer
  eventCpu.halted = false;
  eventCpu.iff1 = 1;
  eventCpu.iff2 = 1;
  eventCpu.f = 0x40;
  eventCpu._ix = 0xD1A860;
  eventCpu._iy = 0xD00080;
  eventCpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, eventCpu.sp, eventCpu.sp + 12);

  // Track first 5 RST 38h dispatch sequences
  const MAX_DISPATCH_SEQUENCES = 5;
  const dispatchSequences = [];   // array of arrays: each inner array = sequence of PCs for one RST 38h
  let currentSequence = null;
  let aValueAtRst38 = [];         // A register value when entering 0x000038
  let aValueAt06F3FromBoot = null; // captured during boot (not applicable here, but we track cold vs interrupt)
  const interruptLog = [];
  const chainVisitCounts = new Map();

  for (const addr of CHAIN_ADDRESSES) {
    chainVisitCounts.set(addr, 0);
  }

  const r4 = eventExecutor.runFrom(EVENT_LOOP_ENTRY, 'adl', {
    maxSteps: 50000,
    maxLoopIterations: 10,
    onBlock(pc, mode, _meta, step) {
      const npc = pc & 0xFFFFFF;

      // Track chain visits
      if (chainVisitCounts.has(npc)) {
        chainVisitCounts.set(npc, chainVisitCounts.get(npc) + 1);
      }

      // Track dispatch sequences for the first N RST 38h events
      if (npc === 0x000038) {
        // Start a new sequence
        if (dispatchSequences.length < MAX_DISPATCH_SEQUENCES) {
          currentSequence = [npc];
          aValueAtRst38.push(eventCpu.a);
        } else {
          currentSequence = null;
        }
      } else if (currentSequence !== null && CHAIN_ADDRESSES.includes(npc)) {
        currentSequence.push(npc);
      }

      // End sequence on ret/reti/jp that leaves the chain
      if (currentSequence !== null && !CHAIN_ADDRESSES.includes(npc) && currentSequence.length > 1) {
        dispatchSequences.push([...currentSequence]);
        currentSequence = null;
      }
    },
    onInterrupt(type, returnPc, vector, step) {
      interruptLog.push({ type, returnPc: returnPc & 0xFFFFFF, vector: vector & 0xFFFFFF, step });
    },
  });

  // Flush any pending sequence
  if (currentSequence !== null && currentSequence.length > 0) {
    dispatchSequences.push([...currentSequence]);
  }

  console.log(`Phase 4 (event loop + timer): steps=${count(r4.steps)} term=${r4.termination} lastPc=${hex(r4.lastPc)}`);
  console.log(`  interrupts fired: ${count(interruptLog.length)}`);
  console.log('');

  // Visit counts for the RST 38h chain
  console.log('--- RST 38h Chain Visit Counts ---');
  for (const [addr, visits] of chainVisitCounts.entries()) {
    console.log(`  ${hex(addr)}: ${count(visits)} visits`);
  }
  console.log('');

  // First 5 dispatch sequences
  console.log(`--- First ${MAX_DISPATCH_SEQUENCES} RST 38h Dispatch Sequences ---`);
  if (dispatchSequences.length === 0) {
    console.log('  none recorded');
  } else {
    for (let i = 0; i < dispatchSequences.length; i++) {
      const seq = dispatchSequences[i];
      const aVal = i < aValueAtRst38.length ? `A=0x${hexByte(aValueAtRst38[i])}` : 'A=?';
      console.log(`  dispatch #${i + 1} (${aVal}): ${seq.map((a) => hex(a)).join(' -> ')}`);
    }
  }
  console.log('');

  // A register analysis
  console.log('--- A Register at RST 38h Entry ---');
  if (aValueAtRst38.length === 0) {
    console.log('  no RST 38h entries recorded');
  } else {
    const unique = [...new Set(aValueAtRst38)];
    console.log(`  total entries: ${count(aValueAtRst38.length)}`);
    console.log(`  unique A values: ${unique.map((v) => `0x${hexByte(v)}`).join(', ')}`);
    const histogram = new Map();
    for (const v of aValueAtRst38) {
      histogram.set(v, (histogram.get(v) ?? 0) + 1);
    }
    for (const [v, c] of [...histogram.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`    A=0x${hexByte(v)}: ${count(c)} times`);
    }
  }
  console.log('');

  // Interrupt log summary
  console.log('--- Interrupt Log Summary ---');
  if (interruptLog.length === 0) {
    console.log('  no interrupts');
  } else {
    const byVector = new Map();
    for (const entry of interruptLog) {
      const key = `${entry.type}@${hex(entry.vector)}`;
      byVector.set(key, (byVector.get(key) ?? 0) + 1);
    }
    for (const [key, c] of byVector.entries()) {
      console.log(`  ${key}: ${count(c)} times`);
    }
    // First 5 interrupt events
    console.log('  first 5 interrupts:');
    for (const entry of interruptLog.slice(0, 5)) {
      console.log(`    step=${count(entry.step)} type=${entry.type} vector=${hex(entry.vector)} returnPc=${hex(entry.returnPc)}`);
    }
  }
  console.log('');

  // Top 20 hottest blocks in phase 4
  const phase4Entries = Object.entries(r4.blockVisits ?? {}).sort((a, b) => b[1] - a[1]);
  console.log(`--- Top 20 Hottest Blocks (Phase 4) ---`);
  for (const [key, visits] of phase4Entries.slice(0, 20)) {
    console.log(`  ${key}: ${count(visits)}`);
  }
  console.log('');

  // Final CPU state
  console.log('--- Final CPU State ---');
  console.log(`  PC=${hex(eventCpu.pc)} SP=${hex(eventCpu.sp)} IX=${hex(eventCpu._ix)} IY=${hex(eventCpu._iy)}`);
  console.log(`  A=${hex(eventCpu.a, 2)} F=${hex(eventCpu.f, 2)} IM=${eventCpu.im} I=${hex(eventCpu.i, 2)}`);
  console.log(`  IFF1=${eventCpu.iff1} IFF2=${eventCpu.iff2} MBASE=${hex(eventCpu.mbase, 2)} halted=${eventCpu.halted}`);
}

await main();
