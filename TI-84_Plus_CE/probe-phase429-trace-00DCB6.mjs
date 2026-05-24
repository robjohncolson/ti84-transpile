#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};
const { decodeInstruction } = await import(new URL('./ez80-decoder.js', import.meta.url));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const TARGET = 0x00DCB6;
const SCAN_LIMIT = 0x200;
const RAM_MIN = 0xD00000;
const RAM_MAX = 0xD1FFFF;

const CALL_LABELS = new Map([
  [0x002197, 'stack-frame helper'],
  [0x0021C2, 'HL zero-test helper'],
  [0x002575, 'logical shift-right helper'],
  [0x00DA8C, '0x3010 assert/deassert helper'],
  [0x0123AD, '0x3010 bit1 helper / installer wrapper'],
  [0x014E3F, 'notification installer / wait helper'],
  [0x014FA0, 'short service / delay helper'],
]);

const RAM_LABELS = new Map([
  [0xD141E6, '2-bit mode/status selector for 0x00DE8B'],
  [0xD141E7, 'link status latch byte'],
  [0xD1440E, 'notification lock byte'],
  [0xD1440F, 'notification delivery status'],
  [0xD177B7, 'USB/link initialized sentinel (0x55 when armed)'],
]);

const PORT_LABELS = new Map([
  [0x3031, 'link control/status port'],
  [0x3082, 'controller status port'],
]);

const BRANCH_NOTES = new Map([
  [0x00DD1B, 'if 0x3031 bit0 is already low, set the local completion flag'],
  [0x00DD29, 'nonzero D1440F aborts the wait and returns failure'],
  [0x00DD31, 'only D177B7 == 0x55 keeps the wait loop alive'],
  [0x00DD4C, 'local completion flag still zero: loop back to poll 0x3031 bit0 again'],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function signedByte(value) {
  return value < 0x80 ? value : value - 0x100;
}

function upper(value) {
  return value == null ? '' : String(value).toUpperCase();
}

function formatBytes(addr, length) {
  return Array.from(rom.subarray(addr, addr + length), (byte) => hexByte(byte)).join(' ');
}

function withPrefix(inst, text) {
  return inst.modePrefix ? `${upper(inst.modePrefix)} ${text}` : text;
}

function formatDisp(value) {
  return value >= 0 ? `+${hex(value, 2)}` : `-${hex(-value, 2)}`;
}

function formatIndexed(base, displacement) {
  return `(${upper(base)}${formatDisp(displacement)})`;
}

function isTrackedRam(addr) {
  return typeof addr === 'number' && addr >= RAM_MIN && addr <= RAM_MAX;
}

function safeDecode(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch (error) {
    return {
      pc,
      length: 1,
      nextPc: pc + 1,
      tag: 'db',
      value: rom[pc] ?? 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function formatInstructionParts(inst) {
  switch (inst.tag) {
    case 'call':
      return { mnemonic: 'CALL', operands: hex(inst.target) };
    case 'call-conditional':
      return { mnemonic: 'CALL', operands: `${upper(inst.condition)},${hex(inst.target)}` };
    case 'jp':
      return { mnemonic: 'JP', operands: hex(inst.target) };
    case 'jp-conditional':
      return { mnemonic: 'JP', operands: `${upper(inst.condition)},${hex(inst.target)}` };
    case 'jp-indirect':
      return { mnemonic: 'JP', operands: `(${upper(inst.indirectRegister)})` };
    case 'jr':
      return { mnemonic: 'JR', operands: hex(inst.target) };
    case 'jr-conditional':
      return { mnemonic: 'JR', operands: `${upper(inst.condition)},${hex(inst.target)}` };
    case 'djnz':
      return { mnemonic: 'DJNZ', operands: hex(inst.target) };
    case 'ret':
      return { mnemonic: 'RET', operands: '' };
    case 'ret-conditional':
      return { mnemonic: 'RET', operands: upper(inst.condition) };
    case 'push':
      return { mnemonic: 'PUSH', operands: upper(inst.pair) };
    case 'pop':
      return { mnemonic: 'POP', operands: upper(inst.pair) };
    case 'ld-pair-imm':
      return { mnemonic: 'LD', operands: `${upper(inst.pair)},${hex(inst.value)}` };
    case 'ld-pair-mem':
      return {
        mnemonic: 'LD',
        operands: inst.direction === 'to-mem'
          ? `(${hex(inst.addr)}),${upper(inst.pair)}`
          : `${upper(inst.pair)},(${hex(inst.addr)})`,
      };
    case 'ld-mem-pair':
      return { mnemonic: 'LD', operands: `(${hex(inst.addr)}),${upper(inst.pair)}` };
    case 'ld-reg-mem':
      return { mnemonic: 'LD', operands: `${upper(inst.dest)},(${hex(inst.addr)})` };
    case 'ld-mem-reg':
      return { mnemonic: 'LD', operands: `(${hex(inst.addr)}),${upper(inst.src)}` };
    case 'ld-reg-imm':
      return { mnemonic: 'LD', operands: `${upper(inst.dest)},${hex(inst.value, 2)}` };
    case 'ld-reg-reg':
      return { mnemonic: 'LD', operands: `${upper(inst.dest)},${upper(inst.src)}` };
    case 'ld-reg-ind':
      return { mnemonic: 'LD', operands: `${upper(inst.dest)},(${upper(inst.src)})` };
    case 'ld-ind-reg':
      return { mnemonic: 'LD', operands: `(${upper(inst.dest)}),${upper(inst.src)}` };
    case 'ld-reg-ixd':
      return { mnemonic: 'LD', operands: `${upper(inst.dest)},${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'ld-ixd-reg':
      return { mnemonic: 'LD', operands: `${formatIndexed(inst.indexRegister, inst.displacement)},${upper(inst.src)}` };
    case 'ld-ixd-imm':
      return { mnemonic: 'LD', operands: `${formatIndexed(inst.indexRegister, inst.displacement)},${hex(inst.value, 2)}` };
    case 'ld-pair-indexed':
      return { mnemonic: 'LD', operands: `${upper(inst.pair)},${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'ld-indexed-pair':
      return { mnemonic: 'LD', operands: `${formatIndexed(inst.indexRegister, inst.displacement)},${upper(inst.pair)}` };
    case 'inc-pair':
      return { mnemonic: 'INC', operands: upper(inst.pair) };
    case 'dec-pair':
      return { mnemonic: 'DEC', operands: upper(inst.pair) };
    case 'inc-reg':
      return { mnemonic: 'INC', operands: upper(inst.reg) };
    case 'dec-reg':
      return { mnemonic: 'DEC', operands: upper(inst.reg) };
    case 'add-pair':
      return { mnemonic: 'ADD', operands: `${upper(inst.dest)},${upper(inst.src)}` };
    case 'sbc-pair':
      return { mnemonic: 'SBC', operands: `HL,${upper(inst.src)}` };
    case 'alu-reg':
      return { mnemonic: upper(inst.op), operands: upper(inst.src) };
    case 'alu-imm':
      return { mnemonic: upper(inst.op), operands: hex(inst.value, 2) };
    case 'rotate-reg':
      return { mnemonic: upper(inst.op), operands: upper(inst.reg) };
    case 'bit-set':
      return { mnemonic: 'SET', operands: `${inst.bit},${upper(inst.reg)}` };
    case 'bit-res':
      return { mnemonic: 'RES', operands: `${inst.bit},${upper(inst.reg)}` };
    case 'bit-test':
      return { mnemonic: 'BIT', operands: `${inst.bit},${upper(inst.reg)}` };
    case 'in-reg':
      return { mnemonic: 'IN', operands: `${upper(inst.reg)},(C)` };
    case 'out-reg':
      return { mnemonic: 'OUT', operands: `(C),${upper(inst.reg)}` };
    case 'rst':
      return { mnemonic: 'RST', operands: hex(inst.target, 2) };
    case 'ld-sp-pair':
      return { mnemonic: 'LD', operands: `SP,${upper(inst.pair)}` };
    case 'db':
      return { mnemonic: 'DB', operands: hex(inst.value, 2) };
    default:
      return { mnemonic: `[${inst.tag}]`, operands: JSON.stringify(inst) };
  }
}

function localNote(inst) {
  if (inst.indexRegister !== 'ix' || inst.displacement !== -3) {
    return null;
  }
  if (inst.tag === 'ld-indexed-pair') {
    return 'local completion flag write (IX-3..IX-1)';
  }
  if (inst.tag === 'ld-pair-indexed') {
    return 'local completion flag read (IX-3..IX-1)';
  }
  return null;
}

function trackBcMutation(state, inst) {
  if (inst.tag === 'ld-pair-imm' && inst.pair === 'bc') {
    state.bc = inst.value;
    return;
  }

  if (inst.tag === 'push' && inst.pair === 'bc') {
    state.bcStack.push(state.bc);
    return;
  }

  if (inst.tag === 'pop' && inst.pair === 'bc') {
    state.bc = state.bcStack.length ? state.bcStack.pop() : null;
    return;
  }

  if (
    (inst.tag === 'ld-reg-imm' && (inst.dest === 'b' || inst.dest === 'c')) ||
    (inst.tag === 'ld-reg-reg' && (inst.dest === 'b' || inst.dest === 'c')) ||
    (inst.tag === 'ld-reg-ixd' && (inst.dest === 'b' || inst.dest === 'c'))
  ) {
    state.bc = null;
  }
}

function scanFunction(start, maxBytes = SCAN_LIMIT) {
  const rows = [];
  const summary = {
    callSites: [],
    ramReads: [],
    ramWrites: [],
    portIo: [],
    branches: [],
  };
  const pendingForwardTargets = new Set();
  const state = { bc: null, bcStack: [] };

  let pc = start;
  while (pc < rom.length && pc < start + maxBytes) {
    const inst = safeDecode(pc);
    const annotations = [];

    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      summary.callSites.push({ pc, target: inst.target, conditional: inst.tag === 'call-conditional' });
      if (CALL_LABELS.has(inst.target)) {
        annotations.push(CALL_LABELS.get(inst.target));
      }
    }

    if (inst.tag === 'jr' || inst.tag === 'jr-conditional' || inst.tag === 'jp' || inst.tag === 'jp-conditional' || inst.tag === 'djnz') {
      summary.branches.push({ pc, target: inst.target, tag: inst.tag });
      if (BRANCH_NOTES.has(pc)) {
        annotations.push(BRANCH_NOTES.get(pc));
      }
    }

    if (inst.tag === 'ld-reg-mem' && isTrackedRam(inst.addr)) {
      summary.ramReads.push({ pc, addr: inst.addr });
      annotations.push(`RAM read ${hex(inst.addr)}${RAM_LABELS.has(inst.addr) ? ` (${RAM_LABELS.get(inst.addr)})` : ''}`);
    }
    if (inst.tag === 'ld-mem-reg' && isTrackedRam(inst.addr)) {
      summary.ramWrites.push({ pc, addr: inst.addr });
      annotations.push(`RAM write ${hex(inst.addr)}${RAM_LABELS.has(inst.addr) ? ` (${RAM_LABELS.get(inst.addr)})` : ''}`);
    }

    if (inst.tag === 'in-reg' || inst.tag === 'out-reg') {
      const port = typeof state.bc === 'number' ? (state.bc & 0xFFFF) : null;
      const direction = inst.tag === 'in-reg' ? 'read' : 'write';
      summary.portIo.push({ pc, tag: inst.tag, port, direction });
      if (port != null) {
        annotations.push(`port ${hex(port, 4)}${PORT_LABELS.has(port) ? ` (${PORT_LABELS.get(port)})` : ''} ${direction}`);
      } else {
        annotations.push(`port ${direction} with BC unknown`);
      }
    }

    const ixNote = localNote(inst);
    if (ixNote) {
      annotations.push(ixNote);
    }

    const { mnemonic, operands } = formatInstructionParts(inst);
    rows.push({
      pc,
      bytes: formatBytes(pc, inst.length),
      text: withPrefix(inst, `${mnemonic}${operands ? ` ${operands}` : ''}`),
      annotation: annotations.join(' | '),
      inst,
    });

    if (
      (inst.tag === 'jr-conditional' || inst.tag === 'jp-conditional' || inst.tag === 'djnz') &&
      typeof inst.target === 'number' &&
      inst.target > pc &&
      inst.target < start + maxBytes
    ) {
      pendingForwardTargets.add(inst.target);
    }

    for (const target of [...pendingForwardTargets]) {
      if (target <= pc) {
        pendingForwardTargets.delete(target);
      }
    }

    trackBcMutation(state, inst);

    const noPendingForwardTargets = ![...pendingForwardTargets].some((target) => target > pc);
    if (inst.tag === 'ret' && noPendingForwardTargets) {
      return { rows, summary, end: pc, complete: true };
    }

    pc = inst.nextPc;
  }

  return { rows, summary, end: pc - 1, complete: false };
}

const decoded = scanFunction(TARGET);
const lines = [];

lines.push('Phase 429 - Trace 0x00DCB6: Link-Ready Gate / 0x3031 Handshake Wrapper');
lines.push(`ROM: ${path.join(__dirname, 'ROM.rom')}`);
lines.push('');
lines.push('=== DISASSEMBLY ===');

for (const row of decoded.rows) {
  const note = row.annotation ? ` ; ${row.annotation}` : '';
  lines.push(`${hex(row.pc)}  ${row.bytes.padEnd(20, ' ')} ${row.text.padEnd(34, ' ')}${note}`);
}

lines.push(`Span: ${hex(TARGET)}..${hex(decoded.end)} (${decoded.end - TARGET + 1} bytes, ${decoded.rows.length} instructions)`);
lines.push(`Complete (ended at RET): ${decoded.complete}`);

lines.push('');
lines.push('=== CALL TARGETS ===');
if (decoded.summary.callSites.length === 0) {
  lines.push('- none');
} else {
  const targets = [...new Set(decoded.summary.callSites.map((entry) => entry.target))].sort((a, b) => a - b);
  for (const target of targets) {
    const sites = decoded.summary.callSites
      .filter((entry) => entry.target === target)
      .map((entry) => `${hex(entry.pc)}${entry.conditional ? ' (cond)' : ''}`)
      .join(', ');
    lines.push(`- ${hex(target)}${CALL_LABELS.has(target) ? ` (${CALL_LABELS.get(target)})` : ''} <- ${sites}`);
  }
}

lines.push('');
lines.push('=== PORT I/O ===');
if (decoded.summary.portIo.length === 0) {
  lines.push('- none');
} else {
  for (const entry of decoded.summary.portIo) {
    const portText = entry.port == null
      ? 'BC unknown'
      : `${hex(entry.port, 4)}${PORT_LABELS.has(entry.port) ? ` (${PORT_LABELS.get(entry.port)})` : ''}`;
    lines.push(`- ${hex(entry.pc)} ${entry.direction} ${portText}`);
  }
  lines.push('- 0x3031 bit0 is asserted at 0x00DCCB/0x00DCCD, deasserted at 0x00DCFA/0x00DCFC, and polled via AND 0x01 at 0x00DD17/0x00DD19.');
  lines.push('- 0x3082 is sampled at 0x00DD57, then 0x002575 shifts right by 6 and AND 0x03 keeps bits 7:6.');
}

lines.push('');
lines.push('=== RAM READS (D00000-D1FFFF) ===');
if (decoded.summary.ramReads.length === 0) {
  lines.push('- none');
} else {
  for (const entry of decoded.summary.ramReads) {
    lines.push(`- ${hex(entry.pc)} ${hex(entry.addr)}${RAM_LABELS.has(entry.addr) ? ` (${RAM_LABELS.get(entry.addr)})` : ''}`);
  }
}

lines.push('');
lines.push('=== RAM WRITES (D00000-D1FFFF) ===');
if (decoded.summary.ramWrites.length === 0) {
  lines.push('- none');
} else {
  for (const entry of decoded.summary.ramWrites) {
    lines.push(`- ${hex(entry.pc)} ${hex(entry.addr)}${RAM_LABELS.has(entry.addr) ? ` (${RAM_LABELS.get(entry.addr)})` : ''}`);
  }
}

lines.push('');
lines.push('=== SUMMARY ===');
lines.push('- Prologue allocates a 3-byte local flag at IX-3 and clears it.');
lines.push('- The function pulses 0x3031 bit0 high, waits via 0x014FA0(0x16), calls 0x00DA8C(1), marks D141E7 = 1, then drops 0x3031 bit0 low again.');
lines.push('- It waits for 0x3031 bit0 to read back low. While waiting, any nonzero D1440F or D177B7 != 0x55 aborts the handshake.');
lines.push('- Failure path: clear D1440E, call 0x0123AD(0x32), zero D141E6, return A = 0.');
lines.push('- Success path: clear D1440E, sample ((IN 0x3082) >> 6) & 0x03 into D141E6, return A = 1.');
lines.push('- 0x00CC71 uses CALL 0x00DCB6 / OR A / JR NZ to decide whether to continue into 0x00E2EB. Zero means partial init only; nonzero means full bootstrap.');

console.log(lines.join('\n'));
