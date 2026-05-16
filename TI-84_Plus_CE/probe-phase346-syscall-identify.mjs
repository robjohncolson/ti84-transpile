#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import process from 'node:process';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const ROM_PATH = new URL('./ROM.rom', import.meta.url);
const rom = new Uint8Array(readFileSync(ROM_PATH));

const TABLE_BASE = 0x000080;
const TABLE_END = 0x000100;
const SLOT_SIZE = 4;
const SLOT_COUNT = (TABLE_END - TABLE_BASE) / SLOT_SIZE;
const PROLOGUE_BYTE_COUNT = 32;
const MAX_PROLOGUE_INSTRUCTIONS = 10;

const PURPOSE_BY_ENTRY = [
  'register-return stub; loads A=5 and B=6 before returning',
  'register-return stub; loads A=7 before returning',
  'table lookup helper; returns a fixed DE pair from the ROM table at 0x003C61',
  'register-return stub; loads A=1 before returning',
  'register-return stub; loads A=0 and B=6 before returning',
  'hardware I/O service / polling loop; calls a setup helper, writes to port C, and spins through RST 0x08',
  'context/frame bridge; shuffles IX/IY/stack state and returns an updated pointer frame',
  'stack-frame memory helper; memchr-like bounded byte search',
  'stack-frame memory helper; memcmp-like bounded compare',
  'stack-frame memory helper; memcpy-like forward block copy',
  'stack-frame memory helper; memmove-like overlap-safe block copy',
  'stack-frame memory helper; memset-like byte fill',
  'stack-frame memory helper; bzero/zero-fill helper',
  'dispatcher wrapper; seeds callback 0x0028D1 and enters shared helper 0x002BED',
  'stack-frame context initializer; rewires saved IX/IY links and clears a result slot',
  'dispatcher wrapper; seeds callback 0x00288A and enters shared helper 0x002BED',
  'C-style string helper; strcat-like append to a NUL-terminated destination',
  'C-style string helper; strchr-like character search',
  'C-style string helper; strcmp-like compare',
  'C-style string helper; strcpy-like copy',
  'C-style string helper; nested set/string scan helper',
  'C-style string helper; strlen-like length scan',
  'C-style string helper; strncat-like bounded append with forced NUL termination',
  'C-style string helper; strncmp-like bounded compare',
  'C-style string helper; strncpy-like bounded copy with NUL fill',
  'C-style string helper; strpbrk-like search for the first haystack char in an accept-set',
  'C-style string helper; strrchr-like reverse character search',
  'C-style string helper; strspn-like prefix span over an accept-set',
  'C-style string helper; strstr-like substring search',
  'complex parser/dispatcher; uses scratch globals and shared string-scan helpers',
  'tail stub / no-op service; immediate RET at the target entry point',
  'indexed byte accessor; returns *(IY + BC) and sits beside sibling load/store helpers',
];

function readROM(addr, len) {
  return rom.slice(addr, Math.min(addr + len, rom.length));
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

function formatLoadPairIndirect(inst) {
  return `LD ${upper(inst.pair)}, (${upper(inst.src)})`;
}

function formatStorePairIndirect(inst) {
  return `LD (${upper(inst.dest)}), ${upper(inst.pair)}`;
}

function formatInstruction(inst) {
  switch (inst?.tag) {
    case 'db':
      return `DB ${hex(inst.value, 2)}`;
    case 'push':
      return `PUSH ${upper(inst.pair)}`;
    case 'pop':
      return `POP ${upper(inst.pair)}`;
    case 'ld-pair-imm':
      return `LD ${upper(inst.pair)}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `LD (${hex(inst.addr)}), ${upper(inst.pair)}`
        : `LD ${upper(inst.pair)}, (${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `LD (${hex(inst.addr)}), ${upper(inst.pair)}`;
    case 'ld-pair-indexed':
      return `LD ${upper(inst.pair)}, (${upper(inst.indexRegister)}${signedDisp(inst.displacement)})`;
    case 'ld-indexed-pair':
      return `LD (${upper(inst.indexRegister)}${signedDisp(inst.displacement)}), ${upper(inst.pair)}`;
    case 'ld-pair-ind':
      return formatLoadPairIndirect(inst);
    case 'ld-ind-pair':
      return formatStorePairIndirect(inst);
    case 'ld-ixiy-indexed':
      return `LD ${upper(inst.dest)}, (${upper(inst.indexRegister)}${signedDisp(inst.displacement)})`;
    case 'ld-indexed-ixiy':
      return `LD (${upper(inst.indexRegister)}${signedDisp(inst.displacement)}), ${upper(inst.src)}`;
    case 'ld-reg-ind':
      return `LD ${upper(inst.dest)}, (${upper(inst.src)})`;
    case 'ld-ind-reg':
      return `LD (${upper(inst.dest)}), ${upper(inst.src)}`;
    case 'ld-reg-ixd':
      return `LD ${upper(inst.dest)}, (${upper(inst.indexRegister)}${signedDisp(inst.displacement)})`;
    case 'ld-ixd-reg':
      return `LD (${upper(inst.indexRegister)}${signedDisp(inst.displacement)}), ${upper(inst.src)}`;
    case 'ld-reg-imm':
      return `LD ${upper(inst.dest)}, ${hex(inst.value, 2)}`;
    case 'ld-reg-reg':
      return `LD ${upper(inst.dest)}, ${upper(inst.src)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${upper(inst.condition)}, ${hex(inst.target)}`;
    case 'jp-indirect':
      return `JP (${upper(inst.indirectRegister)})`;
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
    case 'rst':
      return `RST ${hex(inst.target, 2)}`;
    case 'out-reg':
      return `OUT (C), ${upper(inst.reg)}`;
    case 'in-reg':
      return `IN ${upper(inst.reg)}, (C)`;
    case 'in0':
      return `IN0 ${upper(inst.reg)}, (${hex(inst.port, 2)})`;
    case 'out0':
      return `OUT0 (${hex(inst.port, 2)}), ${upper(inst.reg)}`;
    case 'ldir':
      return 'LDIR';
    case 'lddr':
      return 'LDDR';
    case 'ldi':
      return 'LDI';
    case 'cpi':
      return 'CPI';
    case 'cpir':
      return 'CPIR';
    case 'cpdr':
      return 'CPDR';
    case 'scf':
      return 'SCF';
    case 'ccf':
      return 'CCF';
    case 'di':
      return 'DI';
    case 'ei':
      return 'EI';
    case 'halt':
      return 'HALT';
    case 'nop':
      return 'NOP';
    case 'ex-de-hl':
      return 'EX DE, HL';
    case 'ex-sp-hl':
      return 'EX (SP), HL';
    case 'ex-af':
      return "EX AF, AF'";
    case 'exx':
      return 'EXX';
    case 'add-pair':
      return `ADD ${upper(inst.dest)}, ${upper(inst.src)}`;
    case 'adc-pair':
      return withPrefix(inst, `ADC HL, ${upper(inst.src)}`);
    case 'sbc-pair':
      return withPrefix(inst, `SBC HL, ${upper(inst.src)}`);
    case 'inc-pair':
      return `INC ${upper(inst.pair)}`;
    case 'dec-pair':
      return `DEC ${upper(inst.pair)}`;
    case 'inc-reg':
      return `INC ${upper(inst.reg)}`;
    case 'dec-reg':
      return `DEC ${upper(inst.reg)}`;
    case 'alu-reg':
      return `${upper(inst.op)} ${upper(inst.src)}`;
    case 'alu-imm':
      return `${upper(inst.op)} ${hex(inst.value, 2)}`;
    case 'lea':
      return `LEA ${upper(inst.dest)}, ${upper(inst.base)}${signedDisp(inst.displacement)}`;
    case 'pea':
      return `PEA ${upper(inst.base)}${signedDisp(inst.displacement)}`;
    case 'ld-sp-pair':
      return `LD SP, ${upper(inst.pair)}`;
    case 'rla':
      return 'RLA';
    default:
      return fallbackInstructionText(inst);
  }
}

function fallbackInstructionText(inst) {
  const details = Object.entries(inst ?? {})
    .filter(([key]) => !['pc', 'nextPc', 'length', 'mode', 'modePrefix', 'tag', 'terminates', 'fallthrough'].includes(key))
    .map(([key, value]) => `${key}=${formatFallbackValue(value)}`)
    .join(', ');

  return details.length > 0 ? `${upper(inst.tag)} ${details}` : upper(inst.tag);
}

function formatFallbackValue(value) {
  if (typeof value === 'number') {
    return hex(value);
  }

  if (typeof value === 'string') {
    return upper(value);
  }

  return JSON.stringify(value);
}

function decodePrologue(start) {
  const instructions = [];
  const limit = Math.min(start + PROLOGUE_BYTE_COUNT, rom.length);
  let pc = start;

  while (pc < limit && instructions.length < MAX_PROLOGUE_INSTRUCTIONS) {
    const inst = safeDecode(pc);
    instructions.push({
      ...inst,
      bytes: readROM(pc, inst.length),
    });
    pc += Math.max(inst.length, 1);
  }

  return instructions;
}

function classifyEntry(entryIndex, instructions) {
  const exact = PURPOSE_BY_ENTRY[entryIndex];
  if (exact) {
    return exact;
  }

  const tags = instructions.map((inst) => inst.tag);
  const first = instructions[0];
  const second = instructions[1];

  if (first?.tag === 'jp') {
    return 'redirect/alias helper';
  }

  if (first?.tag === 'ret') {
    return 'tail stub / no-op service';
  }

  if (first?.tag === 'ld-reg-imm' && tags.includes('ret')) {
    return 'register-return stub';
  }

  if (tags.slice(0, 5).includes('out-reg') || tags.slice(0, 5).includes('rst')) {
    return 'hardware I/O or interrupt-facing service';
  }

  if (
    first?.tag === 'push' &&
    first.pair === 'iy' &&
    second?.tag === 'ld-pair-imm' &&
    second.pair === 'iy'
  ) {
    return 'stack-frame syscall helper';
  }

  if (tags.slice(0, 4).includes('call')) {
    return 'dispatcher/helper wrapper';
  }

  return 'unclassified helper';
}

function printEntry(entryIndex) {
  const slotAddr = TABLE_BASE + entryIndex * SLOT_SIZE;
  const opcode = rom[slotAddr] ?? 0;
  const target = read24LE(slotAddr + 1);
  const targetBytes = readROM(target, PROLOGUE_BYTE_COUNT);
  const instructions = decodePrologue(target);
  const purpose = classifyEntry(entryIndex, instructions);
  const slotNote = opcode === 0xC3 ? '' : `  ; unexpected opcode ${hex(opcode, 2)}`;

  console.log(`Entry [${String(entryIndex).padStart(2, '0')}] @ ${hex(slotAddr)} -> JP ${hex(target)}${slotNote}`);
  console.log(`  Head32: ${bytesToHex(targetBytes)}`);
  console.log('  Prologue:');

  for (const inst of instructions) {
    console.log(`    ${hex(inst.pc)}  ${padRight(bytesToHex(inst.bytes), 20)}  ${formatInstruction(inst)}`);
  }

  console.log(`  Purpose: ${purpose}`);
  console.log('');
}

console.log('=== Phase 346: Syscall Table Entry Identification ===');
console.log(`ROM size: ${rom.length} bytes`);
console.log(`Syscall vector table: ${hex(TABLE_BASE)}..${hex(TABLE_END - 1)} (${SLOT_COUNT} entries x ${SLOT_SIZE} bytes)`);
console.log('RST 0x28 is the bcall dispatcher; this 0x000080 bank is the RST 0x38 OS service table.');
console.log('The 0x0027xx..0x002Bxx cluster mostly looks like libc-style memory/string helpers wrapped as OS services.\n');

for (let entryIndex = 0; entryIndex < SLOT_COUNT; entryIndex += 1) {
  printEntry(entryIndex);
}

