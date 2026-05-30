#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const D00595 = 0xD00595;
const D00595_BYTES = [0x95, 0x05, 0xD0];

const EVENT_CLEANUP = 0x0017BC;
const SCHEDULER_TARGET = 0x001900;

function hex(value, width = 2) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function byteHex(value) {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

function bytesHex(bytes) {
  return Array.from(bytes, byteHex).join(' ');
}

function read24(rom, offset) {
  if (offset + 2 >= rom.length) return null;
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function rel8Target(pc, value) {
  const signed = value & 0x80 ? value - 0x100 : value;
  return (pc + 2 + signed) & 0xFFFFFF;
}

function readBytes(rom, offset, length) {
  return rom.subarray(offset, Math.min(rom.length, offset + length));
}

function findPattern(rom, pattern) {
  const hits = [];
  const last = rom.length - pattern.length;

  for (let i = 0; i <= last; i++) {
    let matched = true;
    for (let j = 0; j < pattern.length; j++) {
      if (rom[i + j] !== pattern[j]) {
        matched = false;
        break;
      }
    }
    if (matched) hits.push(i);
  }

  return hits;
}

function hexDump(rom, start, end, markerStart = -1, markerEnd = -1) {
  const lines = [];
  const alignedStart = Math.max(0, start & ~0x0F);
  const clippedEnd = Math.min(rom.length, end);

  for (let lineStart = alignedStart; lineStart < clippedEnd; lineStart += 16) {
    const cells = [];
    const ascii = [];

    for (let i = 0; i < 16; i++) {
      const pos = lineStart + i;
      if (pos < start || pos >= clippedEnd) {
        cells.push('  ');
        ascii.push(' ');
        continue;
      }

      const marked = pos >= markerStart && pos < markerEnd;
      const value = byteHex(rom[pos]);
      cells.push(marked ? `[${value}]` : ` ${value} `);
      const ch = rom[pos];
      ascii.push(ch >= 0x20 && ch <= 0x7E ? String.fromCharCode(ch) : '.');
    }

    lines.push(`${hex(lineStart, 6)}  ${cells.join('')}  ${ascii.join('')}`);
  }

  return lines.join('\n');
}

const REG8_IMM = new Map([
  [0x06, 'B'],
  [0x0E, 'C'],
  [0x16, 'D'],
  [0x1E, 'E'],
  [0x26, 'H'],
  [0x2E, 'L'],
  [0x36, '(HL)'],
  [0x3E, 'A'],
]);

const JP_CC = new Map([
  [0xC2, 'NZ'],
  [0xCA, 'Z'],
  [0xD2, 'NC'],
  [0xDA, 'C'],
  [0xE2, 'PO'],
  [0xEA, 'PE'],
  [0xF2, 'P'],
  [0xFA, 'M'],
]);

const CALL_CC = new Map([
  [0xC4, 'NZ'],
  [0xCC, 'Z'],
  [0xD4, 'NC'],
  [0xDC, 'C'],
  [0xE4, 'PO'],
  [0xEC, 'PE'],
  [0xF4, 'P'],
  [0xFC, 'M'],
]);

const JR_CC = new Map([
  [0x20, 'NZ'],
  [0x28, 'Z'],
  [0x30, 'NC'],
  [0x38, 'C'],
]);

const IMM24_REG = new Map([
  [0x01, 'BC'],
  [0x11, 'DE'],
  [0x21, 'HL'],
  [0x31, 'SP'],
]);

const ED_DIRECT = new Map([
  [0x23, { text: 'LD ({addr}),HL', access: 'write' }],
  [0x2B, { text: 'LD HL,({addr})', access: 'read' }],
  [0x43, { text: 'LD ({addr}),BC', access: 'write' }],
  [0x4B, { text: 'LD BC,({addr})', access: 'read' }],
  [0x53, { text: 'LD ({addr}),DE', access: 'write' }],
  [0x5B, { text: 'LD DE,({addr})', access: 'read' }],
  [0x63, { text: 'LD ({addr}),HL', access: 'write' }],
  [0x6B, { text: 'LD HL,({addr})', access: 'read' }],
  [0x73, { text: 'LD ({addr}),SP', access: 'write' }],
  [0x7B, { text: 'LD SP,({addr})', access: 'read' }],
]);

const ONE_BYTE_DIRECT = new Map([
  [0x22, { text: 'LD ({addr}),HL', access: 'write' }],
  [0x2A, { text: 'LD HL,({addr})', access: 'read' }],
  [0x32, { text: 'LD ({addr}),A', access: 'write' }],
  [0x3A, { text: 'LD A,({addr})', access: 'read' }],
  [0xC3, { text: 'JP {addr}', access: 'control' }],
  [0xCD, { text: 'CALL {addr}', access: 'control' }],
]);

function decodeAt(rom, pc) {
  const op = rom[pc];
  const op2 = rom[pc + 1];

  if (op === undefined) {
    return { length: 1, text: '<out of range>' };
  }

  if (ONE_BYTE_DIRECT.has(op) && pc + 3 < rom.length) {
    const info = ONE_BYTE_DIRECT.get(op);
    return {
      length: 4,
      text: info.text.replace('{addr}', hex(read24(rom, pc + 1), 6)),
      access: info.access,
    };
  }

  if (JP_CC.has(op) && pc + 3 < rom.length) {
    return { length: 4, text: `JP ${JP_CC.get(op)},${hex(read24(rom, pc + 1), 6)}` };
  }

  if (CALL_CC.has(op) && pc + 3 < rom.length) {
    return { length: 4, text: `CALL ${CALL_CC.get(op)},${hex(read24(rom, pc + 1), 6)}` };
  }

  if (IMM24_REG.has(op) && pc + 3 < rom.length) {
    return { length: 4, text: `LD ${IMM24_REG.get(op)},${hex(read24(rom, pc + 1), 6)}` };
  }

  if (REG8_IMM.has(op) && pc + 1 < rom.length) {
    return { length: 2, text: `LD ${REG8_IMM.get(op)},${hex(op2)}` };
  }

  if (JR_CC.has(op) && pc + 1 < rom.length) {
    return { length: 2, text: `JR ${JR_CC.get(op)},${hex(rel8Target(pc, op2), 6)}` };
  }

  if (op === 0x10 && pc + 1 < rom.length) {
    return { length: 2, text: `DJNZ ${hex(rel8Target(pc, op2), 6)}` };
  }

  if (op === 0x18 && pc + 1 < rom.length) {
    return { length: 2, text: `JR ${hex(rel8Target(pc, op2), 6)}` };
  }

  if (op === 0xED && ED_DIRECT.has(op2) && pc + 4 < rom.length) {
    const info = ED_DIRECT.get(op2);
    return {
      length: 5,
      text: info.text.replace('{addr}', hex(read24(rom, pc + 2), 6)),
      access: info.access,
    };
  }

  if ((op === 0xDD || op === 0xFD) && pc + 1 < rom.length) {
    const index = op === 0xDD ? 'IX' : 'IY';

    if (op2 === 0x21 && pc + 4 < rom.length) {
      return { length: 5, text: `LD ${index},${hex(read24(rom, pc + 2), 6)}` };
    }
    if (op2 === 0x22 && pc + 4 < rom.length) {
      return { length: 5, text: `LD (${hex(read24(rom, pc + 2), 6)}),${index}` };
    }
    if (op2 === 0x2A && pc + 4 < rom.length) {
      return { length: 5, text: `LD ${index},(${hex(read24(rom, pc + 2), 6)})` };
    }
    if (op2 === 0x23) return { length: 2, text: `INC ${index}` };
    if (op2 === 0x2B) return { length: 2, text: `DEC ${index}` };
    if (op2 === 0x34 && pc + 2 < rom.length) return { length: 3, text: `INC (${index}${signedDisp(rom[pc + 2])})` };
    if (op2 === 0x35 && pc + 2 < rom.length) return { length: 3, text: `DEC (${index}${signedDisp(rom[pc + 2])})` };
    if (op2 === 0x36 && pc + 3 < rom.length) return { length: 4, text: `LD (${index}${signedDisp(rom[pc + 2])}),${hex(rom[pc + 3])}` };
    if (op2 === 0xE9) return { length: 2, text: `JP (${index})`, access: 'indirect-control' };
  }

  switch (op) {
    case 0x00: return { length: 1, text: 'NOP' };
    case 0x03: return { length: 1, text: 'INC BC' };
    case 0x04: return { length: 1, text: 'INC B' };
    case 0x05: return { length: 1, text: 'DEC B' };
    case 0x0B: return { length: 1, text: 'DEC BC' };
    case 0x0C: return { length: 1, text: 'INC C' };
    case 0x0D: return { length: 1, text: 'DEC C' };
    case 0x13: return { length: 1, text: 'INC DE' };
    case 0x1B: return { length: 1, text: 'DEC DE' };
    case 0x23: return { length: 1, text: 'INC HL' };
    case 0x2B: return { length: 1, text: 'DEC HL' };
    case 0x33: return { length: 1, text: 'INC SP' };
    case 0x3B: return { length: 1, text: 'DEC SP' };
    case 0x76: return { length: 1, text: 'HALT' };
    case 0x77: return { length: 1, text: 'LD (HL),A' };
    case 0x7E: return { length: 1, text: 'LD A,(HL)' };
    case 0x86: return { length: 1, text: 'ADD A,(HL)' };
    case 0xAF: return { length: 1, text: 'XOR A' };
    case 0xC0: return { length: 1, text: 'RET NZ' };
    case 0xC8: return { length: 1, text: 'RET Z' };
    case 0xC9: return { length: 1, text: 'RET' };
    case 0xD0: return { length: 1, text: 'RET NC' };
    case 0xD8: return { length: 1, text: 'RET C' };
    case 0xD9: return { length: 1, text: 'EXX' };
    case 0xE0: return { length: 1, text: 'RET PO' };
    case 0xE8: return { length: 1, text: 'RET PE' };
    case 0xE9: return { length: 1, text: 'JP (HL)', access: 'indirect-control' };
    case 0xF0: return { length: 1, text: 'RET P' };
    case 0xF3: return { length: 1, text: 'DI' };
    case 0xF8: return { length: 1, text: 'RET M' };
    case 0xFB: return { length: 1, text: 'EI' };
    default: return { length: 1, text: `DB ${hex(op)}` };
  }
}

function signedDisp(value) {
  const signed = value & 0x80 ? value - 0x100 : value;
  return signed < 0 ? `${signed}` : `+${signed}`;
}

function disassembleRange(rom, start, length) {
  const end = Math.min(rom.length, start + length);
  const lines = [];
  let pc = start;

  while (pc < end) {
    const decoded = decodeAt(rom, pc);
    const clippedLength = Math.max(1, Math.min(decoded.length, end - pc));
    const raw = bytesHex(readBytes(rom, pc, clippedLength)).padEnd(14, ' ');
    lines.push(`${hex(pc, 6)}  ${raw}  ${decoded.text}`);
    pc += clippedLength;
  }

  return lines.join('\n');
}

function looksLikePointerWriteViaHL(rom, afterImmediate) {
  const next = Array.from(readBytes(rom, afterImmediate, 10));
  const text = bytesHex(next);
  return (
    text.startsWith('36 00 23 36 00 23 36 00') ||
    text.startsWith('AF 77 23 77 23 77') ||
    text.includes('77 23 77 23 77')
  );
}

function classifyHit(rom, hit) {
  const prev1 = hit >= 1 ? rom[hit - 1] : undefined;
  const prev2 = hit >= 2 ? rom[hit - 2] : undefined;
  const prev3 = hit >= 3 ? rom[hit - 3] : undefined;

  if (ONE_BYTE_DIRECT.has(prev1)) {
    const info = ONE_BYTE_DIRECT.get(prev1);
    return {
      pc: hit - 1,
      access: info.access,
      text: info.text.replace('{addr}', hex(D00595, 6)),
    };
  }

  if (prev2 === 0xED && ED_DIRECT.has(prev1)) {
    const info = ED_DIRECT.get(prev1);
    return {
      pc: hit - 2,
      access: info.access,
      text: info.text.replace('{addr}', hex(D00595, 6)),
    };
  }

  if ((prev2 === 0xDD || prev2 === 0xFD) && (prev1 === 0x22 || prev1 === 0x2A)) {
    const index = prev2 === 0xDD ? 'IX' : 'IY';
    const isWrite = prev1 === 0x22;
    return {
      pc: hit - 2,
      access: isWrite ? 'write' : 'read',
      text: isWrite ? `LD (${hex(D00595, 6)}),${index}` : `LD ${index},(${hex(D00595, 6)})`,
    };
  }

  if (prev1 === 0x21 || prev1 === 0x01 || prev1 === 0x11 || prev1 === 0x31) {
    const reg = IMM24_REG.get(prev1);
    const pointerWrite = reg === 'HL' && looksLikePointerWriteViaHL(rom, hit + 3);
    return {
      pc: hit - 1,
      access: pointerWrite ? 'write-via-pointer' : 'address-immediate',
      text: `LD ${reg},${hex(D00595, 6)}${pointerWrite ? ' ; followed by stores through HL' : ''}`,
    };
  }

  if ((prev2 === 0xDD || prev2 === 0xFD) && prev1 === 0x21) {
    const index = prev2 === 0xDD ? 'IX' : 'IY';
    return {
      pc: hit - 2,
      access: 'address-immediate',
      text: `LD ${index},${hex(D00595, 6)}`,
    };
  }

  if (prev3 === 0xDD || prev3 === 0xFD) {
    return {
      pc: hit - 3,
      access: 'unknown-prefixed',
      text: `prefix ${hex(prev3)} near ${hex(D00595, 6)}`,
    };
  }

  return {
    pc: hit,
    access: 'unknown',
    text: `raw occurrence of ${bytesHex(D00595_BYTES)}`,
  };
}

function summarize(records) {
  const counts = new Map();
  for (const record of records) {
    counts.set(record.access, (counts.get(record.access) ?? 0) + 1);
  }

  console.log('\n=== Summary by likely access type ===');
  for (const [access, count] of [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`${access.padEnd(18)} ${count}`);
  }

  console.log('\n=== Summary of all D00595 access candidates ===');
  for (const record of records) {
    console.log(`${hex(record.hit, 6)}  ${record.access.padEnd(18)} ${record.text}  (decoded pc ${hex(record.pc, 6)})`);
  }
}

function analyzeJpTarget(rom, start, length) {
  const end = Math.min(rom.length, start + length);
  const hardcodedJps = [];
  const indirectJps = [];

  for (let pc = start; pc < end; pc++) {
    if (rom[pc] === 0xC3 && pc + 3 < rom.length) {
      hardcodedJps.push({ pc, target: read24(rom, pc + 1) });
    }
    if (rom[pc] === 0xE9) {
      indirectJps.push({ pc, text: 'JP (HL)' });
    }
    if ((rom[pc] === 0xDD || rom[pc] === 0xFD) && rom[pc + 1] === 0xE9) {
      indirectJps.push({ pc, text: rom[pc] === 0xDD ? 'JP (IX)' : 'JP (IY)' });
    }
  }

  console.log('\n=== 0x0017BC JP target analysis ===');

  if (hardcodedJps.length === 0 && indirectJps.length === 0) {
    console.log('No JP opcode found in the requested cleanup window.');
    return;
  }

  for (const jump of hardcodedJps) {
    const marker = jump.target === 0x003A0F ? ' <- hardcoded ERROR handler target' : '';
    console.log(`${hex(jump.pc, 6)}  C3 ${bytesHex(readBytes(rom, jump.pc + 1, 3))}  JP ${hex(jump.target, 6)}${marker}`);
  }

  for (const jump of indirectJps) {
    console.log(`${hex(jump.pc, 6)}  ${jump.text}  <- indirect target`);
  }
}

function printWindow(rom, title, start, length) {
  const end = Math.min(rom.length, start + length);
  console.log(`\n=== ${title} ===`);
  console.log(`Raw bytes ${hex(start, 6)}..${hex(end - 1, 6)}:`);
  console.log(hexDump(rom, start, end));
  console.log('\nManual decode:');
  console.log(disassembleRange(rom, start, length));
}

async function main() {
  const rom = await fs.readFile(ROM_PATH);

  console.log('D00595 investigation probe');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`ROM size: ${rom.length} bytes`);
  console.log(`Search target: ${hex(D00595, 6)} little-endian bytes ${bytesHex(D00595_BYTES)}`);

  const hits = findPattern(rom, D00595_BYTES);
  const records = hits.map((hit) => ({ hit, ...classifyHit(rom, hit) }));

  console.log(`\nFound ${hits.length} raw occurrences of ${bytesHex(D00595_BYTES)}.\n`);

  for (const record of records) {
    const contextStart = Math.max(0, record.hit - 16);
    const contextEnd = Math.min(rom.length, record.hit + D00595_BYTES.length + 16);
    const decodeStart = Math.max(0, record.hit - 10);
    const decodeLength = Math.min(rom.length - decodeStart, 10 + D00595_BYTES.length + 10);

    console.log('---');
    console.log(`Hit at ROM offset/address ${hex(record.hit, 6)}`);
    console.log(`Likely classification: ${record.access} at decoded pc ${hex(record.pc, 6)} - ${record.text}`);
    console.log('Raw context (16 bytes before/after, target bytes bracketed):');
    console.log(hexDump(rom, contextStart, contextEnd, record.hit, record.hit + D00595_BYTES.length));
    console.log('Linear manual decode around hit (10 bytes before/after; may be unaligned):');
    console.log(disassembleRange(rom, decodeStart, decodeLength));
  }

  summarize(records);

  printWindow(rom, 'Event handler cleanup window at 0x0017BC (20 bytes)', EVENT_CLEANUP, 20);
  analyzeJpTarget(rom, EVENT_CLEANUP, 20);

  printWindow(rom, 'Scheduler D00595 value target at 0x001900 (50 bytes)', SCHEDULER_TARGET, 50);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
