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
const WINDOW_BYTES = 64;
const STACK_RESET_TOP = 0xD1A87E;
const EVENT_LOOP_ENTRY = 0x003A73;
const PHASE4_MAX_STEPS = 500000;
const PHASE4_LOOP_LIMIT = 10;

const TARGETS = [
  { addr: 0x00620D, label: 'pre-sleep routine' },
  { addr: 0x0062A8, label: 'bit4=0 branch target' },
  { addr: 0x015834, label: 'callee from 0x00620D' },
  { addr: 0x0158DE, label: 'callee from 0x00620D' },
];

const STOP_TAGS = new Set([
  'ret',
  'reti',
  'retn',
  'jp',
  'jp-indirect',
  'jr',
  'rst',
  'halt',
  'slp',
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

function normalizeBlocks(raw) {
  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.filter((entry) => entry?.id).map((entry) => [entry.id, entry]));
  }
  return raw ?? {};
}

function createMemoryImage(romBytes) {
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes.subarray(0, Math.min(mem.length, romBytes.length)));
  return mem;
}

function hexBytes(buffer, start, length) {
  return Array.from(
    buffer.subarray(start, Math.min(buffer.length, start + Math.max(length, 0))),
    (value) => hexByte(value),
  ).join(' ');
}

function printRawBytes(addr, buffer) {
  for (let offset = 0; offset < buffer.length; offset += 16) {
    const chunk = buffer.subarray(offset, Math.min(buffer.length, offset + 16));
    console.log(`  ${hex(addr + offset)}: ${Array.from(chunk, (value) => hexByte(value)).join(' ')}`);
  }
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
        if ([
          'tag',
          'length',
          'pc',
          'nextPc',
          'mode',
          'modePrefix',
          'nextMode',
          'terminates',
          'fallthrough',
          'kind',
          'decodeError',
        ].includes(key)) {
          continue;
        }
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
    case 'in-imm':
      return [`in a, (0x${hexByte(inst.port)})`];
    case 'out-imm':
      return [`out (0x${hexByte(inst.port)}), a`];
    case 'in0':
      return [`in0 ${inst.reg}, (0x${hexByte(inst.port)})`];
    case 'out0':
      return [`out0 (0x${hexByte(inst.port)}), ${inst.reg}`];
    case 'in-reg':
      return [`in ${inst.reg}, (c)`];
    case 'out-reg':
      return [`out (c), ${inst.reg}`];
    default:
      return [];
  }
}

function extractMemoryLoadsStores(inst) {
  const refs = [];
  const direct = (addr) => `(${formatDirectAddress(addr, usesShortAddressing(inst))})`;

  switch (inst?.tag) {
    case 'ld-reg-mem':
      refs.push(`read  ld ${inst.dest}, ${direct(inst.addr)}`);
      break;
    case 'ld-pair-mem':
      refs.push(`read  ld ${inst.pair}, ${direct(inst.addr)}`);
      break;
    case 'ld-mem-reg':
      refs.push(`write ld ${direct(inst.addr)}, ${inst.src}`);
      break;
    case 'ld-mem-pair':
      refs.push(`write ld ${direct(inst.addr)}, ${inst.pair}`);
      break;
    case 'ld-reg-ind':
      refs.push(`read  ld ${inst.dest}, (${inst.src})`);
      break;
    case 'ld-pair-ind':
      refs.push(`read  ld ${inst.pair}, (${inst.src})`);
      break;
    case 'ld-reg-ixd':
      refs.push(`read  ld ${inst.dest}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
      break;
    case 'ld-pair-indexed':
      refs.push(`read  ld ${inst.pair}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
      break;
    case 'ld-ixiy-indexed':
      refs.push(`read  ld ${inst.dest}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
      break;
    case 'ld-ind-reg':
      refs.push(`write ld (${inst.dest}), ${inst.src}`);
      break;
    case 'ld-ind-pair':
      refs.push(`write ld (${inst.dest}), ${inst.pair}`);
      break;
    case 'ld-ind-imm':
      refs.push(`write ld (hl), 0x${hexByte(inst.value)}`);
      break;
    case 'ld-ixd-reg':
      refs.push(`write ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.src}`);
      break;
    case 'ld-ixd-imm':
      refs.push(`write ld ${formatIndexed(inst.indexRegister, inst.displacement)}, 0x${hexByte(inst.value)}`);
      break;
    case 'ld-indexed-pair':
      refs.push(`write ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.pair}`);
      break;
    case 'ld-indexed-ixiy':
      refs.push(`write ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.src}`);
      break;
    default:
      break;
  }

  return refs;
}

function disassembleWindow(romBytes, start, byteLimit) {
  const rows = [];
  const controlFlow = [];
  const portIo = [];
  const memoryLoadsStores = [];
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

    for (const memText of extractMemoryLoadsStores(inst)) {
      memoryLoadsStores.push({ pc, text: memText });
      notes.push(memText);
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

  return { rows, controlFlow, portIo, memoryLoadsStores, stopReason };
}

function blockKeysForAddress(blockKeys, addr) {
  const prefix = addr.toString(16).padStart(6, '0');
  return blockKeys.filter((key) => key.startsWith(prefix)).sort();
}

function inspectTarget(romBytes, blockKeys, target) {
  const rawBytes = romBytes.subarray(target.addr, Math.min(romBytes.length, target.addr + WINDOW_BYTES));
  const matchingKeys = blockKeysForAddress(blockKeys, target.addr);
  const listing = disassembleWindow(romBytes, target.addr, WINDOW_BYTES);

  console.log(`=== ${hex(target.addr)} ${target.label} ===`);
  console.log(`raw bytes (${rawBytes.length}):`);
  printRawBytes(target.addr, rawBytes);
  console.log(`lifted block keys: ${matchingKeys.length > 0 ? matchingKeys.join(', ') : 'none'}`);
  console.log('disassembly:');
  for (const row of listing.rows) {
    const noteText = row.notes.length > 0 ? `  ; ${row.notes.join(' | ')}` : '';
    const truncated = row.truncated ? '  ; truncated by 64-byte window' : '';
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}${noteText}${truncated}`);
  }
  console.log(`stop reason: ${listing.stopReason ?? '64-byte window exhausted'}`);

  console.log('call/jp/jr targets:');
  if (listing.controlFlow.length === 0) {
    console.log('  none');
  } else {
    for (const entry of listing.controlFlow) {
      console.log(`  ${hex(entry.pc)}  ${entry.text}`);
    }
  }

  console.log('port i/o instructions:');
  if (listing.portIo.length === 0) {
    console.log('  none');
  } else {
    for (const entry of listing.portIo) {
      console.log(`  ${hex(entry.pc)}  ${entry.text}`);
    }
  }

  console.log('memory loads/stores:');
  if (listing.memoryLoadsStores.length === 0) {
    console.log('  none');
  } else {
    for (const entry of listing.memoryLoadsStores) {
      console.log(`  ${hex(entry.pc)}  ${entry.text}`);
    }
  }

  console.log('');
  return {
    ...target,
    blockKeys: matchingKeys,
    controlFlow: listing.controlFlow,
    portIo: listing.portIo,
    memoryLoadsStores: listing.memoryLoadsStores,
  };
}

function matchingVisitKeys(result, addr) {
  const prefix = `${addr.toString(16).padStart(6, '0')}:`;
  return Object.keys(result.blockVisits ?? {}).filter((key) => key.startsWith(prefix)).sort();
}

function visitCountForAddress(result, addr) {
  return matchingVisitKeys(result, addr).reduce((sum, key) => sum + (result.blockVisits?.[key] ?? 0), 0);
}

function runPhaseSequence(romBytes, blocks) {
  const mem = createMemoryImage(romBytes);
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;

  const phase1 = executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const phase2 = executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const phase3 = executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu._iy = 0xD00080;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);

  const phase4 = executor.runFrom(EVENT_LOOP_ENTRY, 'adl', {
    maxSteps: PHASE4_MAX_STEPS,
    maxLoopIterations: PHASE4_LOOP_LIMIT,
  });

  return [
    { label: 'Phase 1 (Z80 cold boot)', result: phase1 },
    { label: 'Phase 2 (Kernel init)', result: phase2 },
    { label: 'Phase 3 (Post-init)', result: phase3 },
    { label: `Phase 4 (event loop, maxLoopIterations=${PHASE4_LOOP_LIMIT})`, result: phase4 },
  ];
}

function printCallTreeSummary(reports) {
  console.log('=== Call Tree Summary ===');
  for (const report of reports) {
    const targets = report.controlFlow.map((entry) => entry.text);
    console.log(`  ${hex(report.addr)} ${report.label}: ${targets.length > 0 ? targets.join(', ') : 'no call/jp/jr targets in 64-byte window'}`);
  }
  console.log('');
}

function printVisitSummary(phaseRuns) {
  console.log('=== Phase 369-style Visit Counts ===');
  for (const phase of phaseRuns) {
    console.log(`  ${phase.label}: steps=${phase.result.steps} term=${phase.result.termination} lastPc=${hex(phase.result.lastPc)}`);
  }
  console.log('');

  for (const target of TARGETS) {
    const counts = phaseRuns.map((phase) => visitCountForAddress(phase.result, target.addr));
    const total = counts.reduce((sum, value) => sum + value, 0);
    const aggregateKeys = new Set();

    for (const phase of phaseRuns) {
      for (const key of matchingVisitKeys(phase.result, target.addr)) {
        aggregateKeys.add(key);
      }
    }

    console.log(`${hex(target.addr)} ${target.label}`);
    console.log(`  total visits: ${total}`);
    console.log(`  phase1=${counts[0]} phase2=${counts[1]} phase3=${counts[2]} phase4=${counts[3]}`);
    console.log(`  matching visited block keys: ${aggregateKeys.size > 0 ? [...aggregateKeys].join(', ') : 'none'}`);
  }
}

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

  console.log('Phase 370: disassemble 0x00620D call tree');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`transpiled blocks: ${blockKeys.length}`);
  console.log(`mode: ${MODE}`);
  console.log('');

  const reports = TARGETS.map((target) => inspectTarget(romBytes, blockKeys, target));
  printCallTreeSummary(reports);

  const phaseRuns = runPhaseSequence(romBytes, blocks);
  printVisitSummary(phaseRuns);
}

await main();
