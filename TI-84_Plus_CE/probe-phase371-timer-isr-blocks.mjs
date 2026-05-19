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
const MEM_SIZE = 0x1000000;
const STACK_RESET_TOP = 0xD1A87B;
const EVENT_LOOP_ENTRY = 0x003A73;

// Disassembly targets: address + byte count
const DISASM_TARGETS = [
  { addr: 0x0019BE, bytes: 40, label: 'timer ISR block 0x0019BE' },
  { addr: 0x0019EF, bytes: 40, label: 'timer ISR block 0x0019EF' },
  { addr: 0x001A17, bytes: 20, label: 'timer ISR block 0x001A17' },
  { addr: 0x001A23, bytes: 20, label: 'timer ISR block 0x001A23' },
  { addr: 0x001A2D, bytes: 10, label: 'timer ISR block 0x001A2D' },
  { addr: 0x001A32, bytes: 20, label: 'timer ISR block 0x001A32' },
];

// All timer path blocks to track dynamically
const TIMER_PATH_BLOCKS = [
  0x000038, 0x0006F3, 0x000704, 0x000710, 0x000719,
  0x001713, 0x001717,
  0x0019BE, 0x0019EF, 0x001A17, 0x001A23, 0x001A2D, 0x001A32,
];

const LCD_RANGE_START = 0xD40000;
const LCD_RANGE_END = 0xD53F00;

const STOP_TAGS = new Set([
  'ret', 'reti', 'retn', 'jp', 'jp-indirect', 'jr', 'rst', 'halt', 'slp',
]);

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

function hexBytes(buffer, start, length) {
  return Array.from(
    buffer.subarray(start, Math.min(buffer.length, start + Math.max(length, 0))),
    (v) => hexByte(v),
  ).join(' ');
}

function withPrefix(inst, text) {
  return inst?.modePrefix ? `${inst.modePrefix} ${text}` : text;
}

function usesShortAddressing(inst) {
  return inst?.modePrefix === 'sis' || inst?.modePrefix === 'lis';
}

function formatDirectAddress(addr, shortAddress) {
  return shortAddress ? `0x${hexWord(addr)} [short/MBASE]` : hex(addr);
}

function formatIndexed(indexRegister, displacement) {
  return `(${indexRegister}${formatDisp(displacement)})`;
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

function disassembleWindow(romBytes, start, byteLimit) {
  const rows = [];
  const controlFlow = [];
  const portIo = [];
  const memRefs = [];
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

    // Extract control flow targets
    switch (inst.tag) {
      case 'call':
        controlFlow.push({ pc, kind: 'call', target: inst.target, text: `call -> ${hex(inst.target)}` });
        break;
      case 'call-conditional':
        controlFlow.push({ pc, kind: `call ${inst.condition}`, target: inst.target, text: `call ${inst.condition} -> ${hex(inst.target)}` });
        break;
      case 'jp':
        controlFlow.push({ pc, kind: 'jp', target: inst.target, text: `jp -> ${hex(inst.target)}` });
        break;
      case 'jp-conditional':
        controlFlow.push({ pc, kind: `jp ${inst.condition}`, target: inst.target, text: `jp ${inst.condition} -> ${hex(inst.target)}` });
        break;
      case 'jp-indirect':
        controlFlow.push({ pc, kind: 'jp indirect', target: null, text: `jp -> (${inst.indirectRegister})` });
        break;
      case 'jr':
        controlFlow.push({ pc, kind: 'jr', target: inst.target, text: `jr -> ${hex(inst.target)}` });
        break;
      case 'jr-conditional':
        controlFlow.push({ pc, kind: `jr ${inst.condition}`, target: inst.target, text: `jr ${inst.condition} -> ${hex(inst.target)}` });
        break;
      case 'djnz':
        controlFlow.push({ pc, kind: 'djnz', target: inst.target, text: `djnz -> ${hex(inst.target)}` });
        break;
      case 'rst':
        controlFlow.push({ pc, kind: 'rst', target: inst.target, text: `rst -> ${hex(inst.target, 2)}` });
        break;
    }

    // Extract port I/O
    switch (inst.tag) {
      case 'in-imm': portIo.push({ pc, text: `in a, (0x${hexByte(inst.port)})` }); break;
      case 'out-imm': portIo.push({ pc, text: `out (0x${hexByte(inst.port)}), a` }); break;
      case 'in0': portIo.push({ pc, text: `in0 ${inst.reg}, (0x${hexByte(inst.port)})` }); break;
      case 'out0': portIo.push({ pc, text: `out0 (0x${hexByte(inst.port)}), ${inst.reg}` }); break;
      case 'in-reg': portIo.push({ pc, text: `in ${inst.reg}, (c)` }); break;
      case 'out-reg': portIo.push({ pc, text: `out (c), ${inst.reg}` }); break;
    }

    // Extract memory references
    const shortAddr = usesShortAddressing(inst);
    switch (inst.tag) {
      case 'ld-reg-mem': memRefs.push({ pc, text: `read ld ${inst.dest}, (${formatDirectAddress(inst.addr, shortAddr)})` }); break;
      case 'ld-pair-mem': memRefs.push({ pc, text: `read ld ${inst.pair}, (${formatDirectAddress(inst.addr, shortAddr)})` }); break;
      case 'ld-mem-reg': memRefs.push({ pc, text: `write ld (${formatDirectAddress(inst.addr, shortAddr)}), ${inst.src}` }); break;
      case 'ld-mem-pair': memRefs.push({ pc, text: `write ld (${formatDirectAddress(inst.addr, shortAddr)}), ${inst.pair}` }); break;
      case 'ld-reg-ixd': memRefs.push({ pc, text: `read ld ${inst.dest}, ${formatIndexed(inst.indexRegister, inst.displacement)}` }); break;
      case 'ld-ixd-reg': memRefs.push({ pc, text: `write ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.src}` }); break;
      case 'ld-ixd-imm': memRefs.push({ pc, text: `write ld ${formatIndexed(inst.indexRegister, inst.displacement)}, 0x${hexByte(inst.value)}` }); break;
      case 'ld-pair-indexed': memRefs.push({ pc, text: `read ld ${inst.pair}, ${formatIndexed(inst.indexRegister, inst.displacement)}` }); break;
      case 'ld-indexed-pair': memRefs.push({ pc, text: `write ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.pair}` }); break;
      case 'ld-reg-ind': memRefs.push({ pc, text: `read ld ${inst.dest}, (${inst.src})` }); break;
      case 'ld-ind-reg': memRefs.push({ pc, text: `write ld (${inst.dest}), ${inst.src}` }); break;
      case 'ld-ind-imm': memRefs.push({ pc, text: `write ld (hl), 0x${hexByte(inst.value)}` }); break;
    }

    if (inst.decodeError) notes.push(`decode fallback: ${inst.decodeError}`);

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

  return { rows, controlFlow, portIo, memRefs, stopReason };
}

function matchingVisitKeys(result, addr) {
  const prefix = `${addr.toString(16).padStart(6, '0')}:`;
  return Object.keys(result.blockVisits ?? {}).filter((key) => key.startsWith(prefix)).sort();
}

function visitCountForAddress(result, addr) {
  return matchingVisitKeys(result, addr).reduce((sum, key) => sum + (result.blockVisits?.[key] ?? 0), 0);
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) throw new Error(`ROM not found: ${ROM_PATH}`);
  if (!fs.existsSync(TRANSPILED_PATH)) throw new Error(`Transpiled blocks not found: ${TRANSPILED_PATH}`);

  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));
  const transpiledModule = await import(pathToFileURL(TRANSPILED_PATH).href);
  const BLOCKS = transpiledModule.PRELIFTED_BLOCKS
    ?? transpiledModule.default?.PRELIFTED_BLOCKS
    ?? transpiledModule.default
    ?? transpiledModule;

  console.log('=== Phase 371: Timer ISR Blocks Disassembly + Dynamic Trace ===\n');

  // -----------------------------------------------------------------------
  // Part 1: Static disassembly of each target block
  // -----------------------------------------------------------------------
  console.log('--- PART 1: Static Disassembly ---\n');

  for (const target of DISASM_TARGETS) {
    const listing = disassembleWindow(romBytes, target.addr, target.bytes);

    console.log(`=== ${hex(target.addr)} ${target.label} (${target.bytes} bytes) ===`);
    console.log('disassembly:');
    for (const row of listing.rows) {
      const noteText = row.notes.length > 0 ? `  ; ${row.notes.join(' | ')}` : '';
      const truncated = row.truncated ? '  ; truncated' : '';
      console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}${noteText}${truncated}`);
    }
    console.log(`stop reason: ${listing.stopReason ?? 'byte window exhausted'}`);

    if (listing.controlFlow.length > 0) {
      console.log('control flow:');
      for (const cf of listing.controlFlow) console.log(`  ${hex(cf.pc)}  ${cf.text}`);
    }

    if (listing.portIo.length > 0) {
      console.log('port i/o:');
      for (const io of listing.portIo) console.log(`  ${hex(io.pc)}  ${io.text}`);
    }

    if (listing.memRefs.length > 0) {
      console.log('memory refs:');
      for (const mr of listing.memRefs) console.log(`  ${hex(mr.pc)}  ${mr.text}`);
    }

    console.log('');
  }

  // -----------------------------------------------------------------------
  // Part 2: Boot phases 1-3
  // -----------------------------------------------------------------------
  console.log('--- PART 2: Boot Phases 1-3 ---\n');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));

  const bootPeripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const bootExecutor = createExecutor(BLOCKS, mem, { peripherals: bootPeripherals });
  const cpu = bootExecutor.cpu;

  // Phase 1
  const r1 = bootExecutor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  console.log(`Phase 1: steps=${r1.steps} term=${r1.termination} lastPc=${hex(r1.lastPc)}`);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  // Phase 2
  const r2 = bootExecutor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  console.log(`Phase 2: steps=${r2.steps} term=${r2.termination} lastPc=${hex(r2.lastPc)}`);

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  // Phase 3
  const r3 = bootExecutor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  console.log(`Phase 3: steps=${r3.steps} term=${r3.termination} lastPc=${hex(r3.lastPc)}`);

  console.log('');

  // -----------------------------------------------------------------------
  // Part 3: Dynamic trace with timer interrupt
  // -----------------------------------------------------------------------
  console.log('--- PART 3: Dynamic Trace (10K steps, timerInterrupt:true, iff1=1) ---\n');

  const eventPeripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: true });
  const eventExecutor = createExecutor(BLOCKS, mem, { peripherals: eventPeripherals });
  const eventCpu = eventExecutor.cpu;

  // Copy boot CPU state
  for (const field of ['a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
    'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles']) {
    eventCpu[field] = cpu[field];
  }

  // Timer event loop setup
  eventCpu.halted = false;
  eventCpu.iff1 = 1;
  eventCpu.iff2 = 1;
  eventCpu.f = 0x40;
  eventCpu._ix = 0xD1A860;
  eventCpu._iy = 0xD00080;
  eventCpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, eventCpu.sp, eventCpu.sp + 12);

  // Track block visit order for first 3 interrupts
  const timerPathSet = new Set(TIMER_PATH_BLOCKS);
  const blockSequences = [];  // array of arrays — one per interrupt
  let currentInterruptBlocks = null;
  let interruptCount = 0;
  const MAX_TRACKED_INTERRUPTS = 3;
  let lcdWrites = [];

  const interruptLog = [];

  const r4 = eventExecutor.runFrom(EVENT_LOOP_ENTRY, 'adl', {
    maxSteps: 10000,
    maxLoopIterations: 10,
    onBlock(pc, mode, _meta, step) {
      const normalizedPc = pc & 0xFFFFFF;

      // Track sequence for current interrupt if we're recording
      if (currentInterruptBlocks !== null && interruptCount <= MAX_TRACKED_INTERRUPTS) {
        if (timerPathSet.has(normalizedPc)) {
          currentInterruptBlocks.push({ pc: normalizedPc, step });
        }
      }

      // Check for LCD writes (rough: any block in LCD range)
      if (normalizedPc >= LCD_RANGE_START && normalizedPc < LCD_RANGE_END) {
        lcdWrites.push({ pc: normalizedPc, step });
      }
    },
    onInterrupt(type, returnPc, vector, step) {
      interruptLog.push({ type, returnPc: returnPc & 0xFFFFFF, vector: vector & 0xFFFFFF, step });

      // Save previous interrupt's block sequence
      if (currentInterruptBlocks !== null && currentInterruptBlocks.length > 0) {
        blockSequences.push(currentInterruptBlocks);
      }

      interruptCount++;
      if (interruptCount <= MAX_TRACKED_INTERRUPTS) {
        currentInterruptBlocks = [{ pc: vector & 0xFFFFFF, step }];
      }
    },
  });

  // Save the last interrupt's sequence
  if (currentInterruptBlocks !== null && currentInterruptBlocks.length > 0) {
    blockSequences.push(currentInterruptBlocks);
  }

  console.log(`Event loop: steps=${r4.steps} term=${r4.termination} lastPc=${hex(r4.lastPc)}`);
  console.log(`Total interrupts fired: ${interruptLog.length}`);
  console.log('');

  // Visit counts for all timer path blocks
  console.log('Timer path block visit counts:');
  for (const addr of TIMER_PATH_BLOCKS) {
    const visits = visitCountForAddress(r4, addr);
    const keys = matchingVisitKeys(r4, addr);
    console.log(`  ${hex(addr)}: visits=${visits}${keys.length > 0 ? ` keys=[${keys.join(', ')}]` : ' (not visited)'}`);
  }
  console.log('');

  // Block execution sequence for first N interrupts
  console.log(`Block execution sequence for first ${Math.min(blockSequences.length, MAX_TRACKED_INTERRUPTS)} interrupts:`);
  for (let i = 0; i < Math.min(blockSequences.length, MAX_TRACKED_INTERRUPTS); i++) {
    const seq = blockSequences[i];
    console.log(`  Interrupt ${i + 1}:`);
    for (const entry of seq) {
      console.log(`    step=${entry.step} -> ${hex(entry.pc)}`);
    }
  }
  console.log('');

  // LCD writes
  if (lcdWrites.length > 0) {
    console.log(`LCD buffer block executions: ${lcdWrites.length}`);
    for (const lw of lcdWrites.slice(0, 20)) {
      console.log(`  step=${lw.step} pc=${hex(lw.pc)}`);
    }
  } else {
    console.log('LCD buffer block executions: none');
  }
  console.log('');

  // Interrupt log
  console.log('Interrupt log:');
  for (const entry of interruptLog.slice(0, 10)) {
    console.log(`  step=${entry.step} type=${entry.type} returnPc=${hex(entry.returnPc)} vector=${hex(entry.vector)}`);
  }
  if (interruptLog.length > 10) {
    console.log(`  ... (${interruptLog.length - 10} more)`);
  }
  console.log('');

  // Top 20 hottest blocks
  const sortedBlocks = Object.entries(r4.blockVisits ?? {}).sort((a, b) => b[1] - a[1]);
  console.log('Top 20 hottest blocks in 10K-step run:');
  for (const [key, visits] of sortedBlocks.slice(0, 20)) {
    console.log(`  ${key} visits=${visits}`);
  }
  console.log('');

  // -----------------------------------------------------------------------
  // Part 4: RAM state analysis
  // -----------------------------------------------------------------------
  console.log('--- PART 4: RAM State Analysis ---\n');

  // System flags area (IY-relative): 0xD00080-0xD000C0
  console.log('RAM 0xD00080-0xD000C0 (IY-relative system flags, 64 bytes):');
  for (let offset = 0; offset < 64; offset += 16) {
    const addr = 0xD00080 + offset;
    const bytes = [];
    for (let i = 0; i < 16; i++) {
      bytes.push(hexByte(mem[addr + i]));
    }
    console.log(`  ${hex(addr)}: ${bytes.join(' ')}`);
  }
  console.log('');

  // Magic check address
  const magicVal = mem[0xD177BA];
  console.log(`RAM 0xD177BA (ROM magic check): 0x${hexByte(magicVal)} (${magicVal === 0 ? 'ZERO' : 'non-zero'})`);
  console.log('');

  // Final CPU state
  console.log('Final CPU state:');
  console.log(`  PC=${hex(eventCpu.pc)} SP=${hex(eventCpu.sp)} IX=${hex(eventCpu._ix)} IY=${hex(eventCpu._iy)}`);
  console.log(`  A=${hex(eventCpu.a, 2)} F=${hex(eventCpu.f, 2)} IM=${eventCpu.im} I=${hex(eventCpu.i, 2)}`);
  console.log(`  IFF1=${eventCpu.iff1} IFF2=${eventCpu.iff2} MBASE=${hex(eventCpu.mbase, 2)} halted=${eventCpu.halted}`);
  console.log(`  BC=${hex(eventCpu._bc)} DE=${hex(eventCpu._de)} HL=${hex(eventCpu._hl)}`);
  console.log('');

  console.log('=== Phase 371 Complete ===');
}

await main();
