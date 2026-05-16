#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import process from 'node:process';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const ROM_PATH = new URL('./ROM.rom', import.meta.url);
const rom = new Uint8Array(readFileSync(ROM_PATH));

const RST_HANDLER = 0x000038;
const RST_BODY = 0x0006F3;
const TABLE_BASE = 0x000080;
const TABLE_END = 0x000100;
const TABLE_BYTES = TABLE_END - TABLE_BASE;
const SLOT_SIZE = 4;
const SLOT_COUNT = TABLE_BYTES / SLOT_SIZE;
const TARGET_TO_FIND = 0x001768;

function readROM(addr, len) {
  return rom.slice(addr, addr + len);
}

function read24LE(addr) {
  return (
    (rom[addr] ?? 0) |
    ((rom[addr + 1] ?? 0) << 8) |
    ((rom[addr + 2] ?? 0) << 16)
  ) >>> 0;
}

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => (value ?? 0).toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function padRight(text, width) {
  return String(text).padEnd(width);
}

function upper(value) {
  return String(value ?? '').toUpperCase();
}

function signedByte(value) {
  const byte = (value ?? 0) & 0xFF;
  return byte < 0x80 ? byte : byte - 0x100;
}

function signedDisp(value) {
  const signed = signedByte(value);
  const magnitude = hex(Math.abs(signed), 2);
  return signed < 0 ? `-${magnitude}` : `+${magnitude}`;
}

function withPrefix(inst, text) {
  return inst?.modePrefix ? `${inst.modePrefix.toUpperCase()} ${text}` : text;
}

function safeDecode(pc) {
  try {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (inst && Number.isInteger(inst.length) && inst.length > 0) {
      return inst;
    }
  } catch {
    // Fall through to a raw-byte placeholder.
  }

  return {
    pc,
    length: 1,
    tag: 'db',
    value: rom[pc] ?? 0,
    modePrefix: null,
  };
}

function formatInstruction(inst) {
  switch (inst?.tag) {
    case 'db':
      return `DB ${hex(inst.value, 2)}`;
    case 'ex-af':
      return "EX AF, AF'";
    case 'exx':
      return 'EXX';
    case 'push':
      return `PUSH ${upper(inst.pair)}`;
    case 'pop':
      return `POP ${upper(inst.pair)}`;
    case 'ld-pair-imm':
      return `LD ${upper(inst.pair)}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      return inst.direction === 'from-mem'
        ? `LD ${upper(inst.pair)}, (${hex(inst.addr)})`
        : `LD (${hex(inst.addr)}), ${upper(inst.pair)}`;
    case 'ld-reg-mem':
      return `LD ${upper(inst.dest)}, (${hex(inst.addr)})`;
    case 'ld-reg-imm':
      return `LD ${upper(inst.dest)}, ${hex(inst.value, 2)}`;
    case 'ld-reg-reg':
      return `LD ${upper(inst.dest)}, ${upper(inst.src)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${upper(inst.condition)}`;
    case 'bit-test':
      return `BIT ${inst.bit}, ${upper(inst.reg)}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, (${upper(inst.indexRegister)}${signedDisp(inst.displacement)})`;
    case 'ld-a-mb':
      return 'LD A, MB';
    case 'alu-imm':
      return `${upper(inst.op)} ${hex(inst.value, 2)}`;
    case 'alu-reg':
      return `${upper(inst.op)} ${upper(inst.src)}`;
    case 'in0':
      return `IN0 ${upper(inst.reg)}, (${hex(inst.port, 2)})`;
    case 'out0':
      return `OUT0 (${hex(inst.port, 2)}), ${upper(inst.reg)}`;
    case 'rst':
      return `RST ${hex(inst.target, 2)}`;
    case 'add-pair':
      return `ADD ${upper(inst.dest)}, ${upper(inst.src)}`;
    case 'sbc-pair':
      return withPrefix(inst, `SBC HL, ${upper(inst.src)}`);
    case 'dec-reg':
      return `DEC ${upper(inst.reg)}`;
    case 'ldir':
      return 'LDIR';
    case 'di':
      return 'DI';
    case 'ei':
      return 'EI';
    case 'rla':
      return 'RLA';
    case 'nop':
      return 'NOP';
    case 'halt':
      return 'HALT';
    default:
      return JSON.stringify(inst);
  }
}

function printDisassembly(title, start, count) {
  console.log(`\n=== ${title} ===`);

  let pc = start;
  for (let index = 0; index < count && pc < rom.length; index += 1) {
    const inst = safeDecode(pc);
    const bytes = bytesToHex(readROM(pc, inst.length));
    console.log(`${hex(pc)}  ${padRight(bytes, 20)}  ${formatInstruction(inst)}`);
    pc += inst.length;
  }
}

function printRawTableBytes() {
  console.log(`\n=== Raw Bytes ${hex(TABLE_BASE)}..${hex(TABLE_END - 1)} ===`);

  for (let addr = TABLE_BASE; addr < TABLE_END; addr += 16) {
    console.log(`${hex(addr)}  ${bytesToHex(readROM(addr, 16))}`);
  }
}

function printTripletView() {
  const tripletCount = Math.floor(TABLE_BYTES / 3);
  const trailing = TABLE_BYTES % 3;

  console.log(`\n=== Raw 24-bit Triplet View (${tripletCount} entries, ${trailing} trailing byte(s)) ===`);
  console.log('This is the literal 3-byte LE interpretation requested, even though the bytes are interleaved with JP opcodes.');

  for (let index = 0; index < tripletCount; index += 1) {
    const addr = TABLE_BASE + index * 3;
    const bytes = bytesToHex(readROM(addr, 3));
    const value = read24LE(addr);
    const notes = [];

    if ((rom[addr] ?? 0) === 0xC3) {
      notes.push('starts with JP opcode');
    }

    console.log(
      `[${String(index).padStart(2, '0')}] ${hex(addr)}  ${padRight(bytes, 8)}  ${hex(value)}${notes.length > 0 ? `  ; ${notes.join(', ')}` : ''}`
    );
  }

  if (trailing > 0) {
    const addr = TABLE_BASE + tripletCount * 3;
    console.log(`Trailing bytes at ${hex(addr)}: ${bytesToHex(readROM(addr, trailing))}`);
  }
}

function printSlotView() {
  console.log(`\n=== Decoded Trampoline Slots (${SLOT_COUNT} x ${SLOT_SIZE}-byte JP slots) ===`);
  console.log('This is the meaningful structural view of 0x000080..0x0000FF: each slot is `C3 <24-bit target>`.');

  let matchIndex = -1;

  for (let index = 0; index < SLOT_COUNT; index += 1) {
    const slotAddr = TABLE_BASE + index * SLOT_SIZE;
    const opcode = rom[slotAddr] ?? 0;
    const target = read24LE(slotAddr + 1);
    const slotBytes = bytesToHex(readROM(slotAddr, SLOT_SIZE));
    const headBytes = target !== 0 ? bytesToHex(readROM(target, 8)) : '(zero target)';
    const notes = [];

    if (opcode !== 0xC3) {
      notes.push(`unexpected opcode ${hex(opcode, 2)}`);
    }

    if (target === TARGET_TO_FIND) {
      notes.push('boot target');
      matchIndex = index;
    }

    console.log(
      `[${String(index).padStart(2, '0')}] ${hex(slotAddr)}  ${slotBytes}  -> ${hex(target)}  head=${headBytes}${notes.length > 0 ? `  ; ${notes.join(', ')}` : ''}`
    );
  }

  return matchIndex;
}

function findRaw24Matches(target) {
  const matches = [];

  for (let addr = TABLE_BASE; addr <= TABLE_END - 3; addr += 1) {
    if (read24LE(addr) === target) {
      matches.push(addr);
    }
  }

  return matches;
}

console.log('=== Phase 345: Syscall Trampoline Cross-Reference ===');
console.log(`ROM size: ${rom.length} bytes`);
console.log(`RST handler: ${hex(RST_HANDLER)}`);
console.log(`Trampoline window: ${hex(TABLE_BASE)}..${hex(TABLE_END - 1)} (${TABLE_BYTES} bytes)`);
console.log(`Target to find: ${hex(TARGET_TO_FIND)}`);

printDisassembly('RST 0x38 Linear Decode (20 instructions)', RST_HANDLER, 20);
printDisassembly('Jump Target Body at 0x0006F3 (16 instructions)', RST_BODY, 16);
printRawTableBytes();
printTripletView();

const matchIndex = printSlotView();
const rawMatches = findRaw24Matches(TARGET_TO_FIND);

console.log('\n=== 0x001768 Match ===');

if (matchIndex >= 0) {
  const slotAddr = TABLE_BASE + matchIndex * SLOT_SIZE;
  console.log(`Decoded slot match: entry ${matchIndex} at ${hex(slotAddr)} = ${bytesToHex(readROM(slotAddr, SLOT_SIZE))} -> JP ${hex(TARGET_TO_FIND)}`);
} else {
  console.log('Decoded slot match: not found');
}

if (rawMatches.length > 0) {
  console.log(`Raw 24-bit byte match(es) inside the 0x000080..0x0000FF window: ${rawMatches.map((addr) => hex(addr)).join(', ')}`);
} else {
  console.log('Raw 24-bit byte matches inside the 0x000080..0x0000FF window: none');
}

console.log('\n=== Notes ===');
console.log(`- ${hex(RST_HANDLER)} immediately saves state, loads IY=${hex(0xD00080)}, and jumps to ${hex(RST_BODY)}.`);
console.log('- The requested 3-byte LE view mostly produces nonsense because every fourth byte is the JP opcode 0xC3.');
console.log(`- The actual structure is a ${SLOT_COUNT}-entry trampoline bank of 4-byte JP slots.`);
console.log(`- ${hex(TARGET_TO_FIND)} is the first trampoline target: slot 0 at ${hex(TABLE_BASE)} uses operand bytes at ${hex(TABLE_BASE + 1)}..${hex(TABLE_BASE + 3)}.`);
