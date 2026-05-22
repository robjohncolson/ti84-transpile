#!/usr/bin/env node

import { readFileSync } from 'fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = readFileSync(ROM_PATH);

const FUNCTION_START = 0x0027E8;
const FUNCTION_END = 0x002808;
const WINDOW_START = FUNCTION_START;
const WINDOW_LENGTH = 0x40;
const WINDOW_END = WINDOW_START + WINDOW_LENGTH;
const TRAMPOLINE_START = 0x0000A4;
const TRAMPOLINE_LENGTH = 0x10;
const CALLSITE_START = 0x05D59D;
const CALLSITE_END = 0x05D5BA;

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xFF, 2);
}

function readU24LE(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function readI8(offset) {
  const value = rom[offset];
  return value >= 0x80 ? value - 0x100 : value;
}

function formatDisp(byteValue) {
  const signed = byteValue >= 0x80 ? byteValue - 0x100 : byteValue;
  const mag = Math.abs(signed);
  return `${signed < 0 ? '-' : '+'}${hex(mag, 2)}`;
}

function formatBytes(offset, length) {
  return Array.from(
    rom.subarray(offset, offset + length),
    (byte) => byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function dumpRange(start, length) {
  for (let offset = 0; offset < length; offset += 16) {
    const addr = start + offset;
    const lineLength = Math.min(16, length - offset);
    console.log(`${hex(addr)}: ${formatBytes(addr, lineLength)}`);
  }
}

function decodeIndexed(prefix, opcode, displacement, pc) {
  const reg = prefix === 0xDD ? 'IX' : 'IY';

  switch (opcode) {
    case 0x07:
      return { length: 3, text: `LD BC,(${reg}${formatDisp(displacement)})` };
    case 0x17:
      return { length: 3, text: `LD DE,(${reg}${formatDisp(displacement)})` };
    case 0x21:
      return { length: 5, text: `LD ${reg},${hex(readU24LE(pc + 2))}` };
    case 0x27:
      return { length: 3, text: `LD HL,(${reg}${formatDisp(displacement)})` };
    case 0x39:
      return { length: 2, text: `ADD ${reg},SP` };
    case 0x7E:
      return { length: 3, text: `LD A,(${reg}${formatDisp(displacement)})` };
    case 0xE1:
      return { length: 2, text: `POP ${reg}` };
    case 0xE5:
      return { length: 2, text: `PUSH ${reg}` };
    case 0xF9:
      return { length: 2, text: `LD SP,${reg}` };
    default:
      return { length: 1, text: `DB ${hexByte(prefix)}` };
  }
}

function decodeExtended(opcode, pc) {
  switch (opcode) {
    case 0x42:
      return { length: 2, text: 'SBC HL,BC' };
    case 0x4B:
      return { length: 5, text: `LD BC,(${hex(readU24LE(pc + 2))})` };
    case 0x52:
      return { length: 2, text: 'SBC HL,DE' };
    case 0x62:
      return { length: 2, text: 'SBC HL,HL' };
    case 0xB0:
      return { length: 2, text: 'LDIR' };
    case 0xB8:
      return { length: 2, text: 'LDDR' };
    default:
      return { length: 1, text: `DB ${hexByte(0xED)}` };
  }
}

function decodeInstruction(pc) {
  const opcode = rom[pc];
  const next = rom[pc + 1];
  const third = rom[pc + 2];

  if (opcode === 0xDD || opcode === 0xFD) {
    return decodeIndexed(opcode, next, third, pc);
  }

  if (opcode === 0xED) {
    return decodeExtended(next, pc);
  }

  switch (opcode) {
    case 0x01:
      return { length: 4, text: `LD BC,${hex(readU24LE(pc + 1))}` };
    case 0x09:
      return { length: 1, text: 'ADD HL,BC' };
    case 0x12:
      return { length: 1, text: 'LD (DE),A' };
    case 0x13:
      return { length: 1, text: 'INC DE' };
    case 0x18:
      return { length: 2, text: `JR ${hex(pc + 2 + readI8(pc + 1))}` };
    case 0x20:
      return { length: 2, text: `JR NZ,${hex(pc + 2 + readI8(pc + 1))}` };
    case 0x28:
      return { length: 2, text: `JR Z,${hex(pc + 2 + readI8(pc + 1))}` };
    case 0x29:
      return { length: 1, text: 'ADD HL,HL' };
    case 0x2A:
      return { length: 4, text: `LD HL,(${hex(readU24LE(pc + 1))})` };
    case 0x2B:
      return { length: 1, text: 'DEC HL' };
    case 0x32:
      return { length: 4, text: `LD (${hex(readU24LE(pc + 1))}),A` };
    case 0x38:
      return { length: 2, text: `JR C,${hex(pc + 2 + readI8(pc + 1))}` };
    case 0x6F:
      return { length: 1, text: 'LD L,A' };
    case 0xAF:
      return { length: 1, text: 'XOR A' };
    case 0xB7:
      return { length: 1, text: 'OR A' };
    case 0xC1:
      return { length: 1, text: 'POP BC' };
    case 0xC3:
      return { length: 4, text: `JP ${hex(readU24LE(pc + 1))}` };
    case 0xC5:
      return { length: 1, text: 'PUSH BC' };
    case 0xC9:
      return { length: 1, text: 'RET' };
    case 0xCD:
      return { length: 4, text: `CALL ${hex(readU24LE(pc + 1))}` };
    case 0xE5:
      return { length: 1, text: 'PUSH HL' };
    case 0xEB:
      return { length: 1, text: 'EX DE,HL' };
    default:
      return { length: 1, text: `DB ${hexByte(opcode)}` };
  }
}

function printDisassembly(title, start, end, notes = new Map()) {
  console.log(`\n=== ${title} ===`);
  for (let pc = start; pc < end;) {
    const inst = decodeInstruction(pc);
    const note = notes.get(pc);
    const line = `${hex(pc)}  ${formatBytes(pc, inst.length).padEnd(14)} ${inst.text}`;
    console.log(note ? `${line}    ; ${note}` : line);
    pc += inst.length;
  }
}

function findPattern(pattern) {
  const hits = [];
  for (let pc = 0; pc <= rom.length - pattern.length; pc += 1) {
    let match = true;
    for (let i = 0; i < pattern.length; i += 1) {
      if (rom[pc + i] !== pattern[i]) {
        match = false;
        break;
      }
    }
    if (match) {
      hits.push(pc);
    }
  }
  return hits;
}

const primaryNotes = new Map([
  [0x0027E8, 'Preserve IY before building a stack frame pointer.'],
  [0x0027EA, 'IY := 3 so ADD IY,SP points at the caller return address.'],
  [0x0027F1, 'Load the 3rd stack argument into BC: byte count.'],
  [0x0027F4, 'Compiler idiom for comparing BC against zero.'],
  [0x0027F8, 'If len == 0, skip the copy loop.'],
  [0x0027FA, 'Load the 1st stack argument into DE: destination pointer.'],
  [0x0027FD, 'Load the 2nd stack argument into HL: source pointer.'],
  [0x002800, 'Copy BC bytes from HL to DE.'],
  [0x002802, 'Return the original destination pointer in HL.'],
]);

const siblingNotes = new Map([
  [0x002808, 'Adjacent sibling helper reached from trampoline 0x0000A8.'],
  [0x002818, 'Zero-length fast exit.'],
  [0x002821, 'Compare source and destination to choose forward vs backward copy.'],
  [0x002828, 'Forward copy path.'],
  [0x00282C, 'Backward-copy setup for overlap case.'],
  [0x002832, 'Backward copy loop.'],
  [0x002834, 'Return destination pointer.'],
]);

const trampolineNotes = new Map([
  [0x0000A4, 'Boot-call trampoline entry that jumps straight to 0x0027E8.'],
  [0x0000A8, 'Next trampoline targets the overlap-aware sibling at 0x002808.'],
  [0x0000AC, 'Next trampoline targets the byte-fill helper at 0x00283A.'],
  [0x0000B0, 'Next trampoline targets the clear helper at 0x00285F.'],
]);

const callsiteNotes = new Map([
  [0x05D59D, 'Load constant length 4.'],
  [0x05D5A1, 'Push arg3 = len.'],
  [0x05D5A2, 'Load key code from (IX+6).'],
  [0x05D5A6, 'Clear HL before turning A into a 24-bit index.'],
  [0x05D5A9, 'Scale key index by 4 bytes per table entry.'],
  [0x05D5AB, 'Reload table base pointer from RAM[0xD1441D].'],
  [0x05D5B0, 'HL now points at table_base + 4*key.'],
  [0x05D5B1, 'Push arg2 = source pointer.'],
  [0x05D5B2, 'Load arg1 = destination pointer from caller frame.'],
  [0x05D5B5, 'Push arg1 = destination pointer.'],
  [0x05D5B6, 'Call trampoline at 0x0000A4, which jumps to 0x0027E8.'],
]);

const callPattern = [0xCD, 0xE8, 0x27, 0x00];
const jumpPattern = [0xC3, 0xE8, 0x27, 0x00];
const directCalls = findPattern(callPattern).map((address) => ({ kind: 'CALL', address }));
const directJumps = findPattern(jumpPattern).map((address) => ({ kind: 'JP', address }));
const directRefs = [...directCalls, ...directJumps].sort((a, b) => a.address - b.address);

console.log('=== Phase 401: trace 0x0027E8 ===');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Size: ${hex(rom.length, 8)} bytes`);

console.log(`\n=== Raw Hex Dump: ${hex(WINDOW_START)}..${hex(WINDOW_END - 1)} ===`);
dumpRange(WINDOW_START, WINDOW_LENGTH);
printDisassembly('Manual Decode: 0x0027E8 primary routine', FUNCTION_START, FUNCTION_END, primaryNotes);
printDisassembly('Manual Decode: remainder of the 64-byte window', FUNCTION_END, WINDOW_END, siblingNotes);

console.log(`\n=== Raw Hex Dump: trampoline ${hex(TRAMPOLINE_START)}..${hex(TRAMPOLINE_START + TRAMPOLINE_LENGTH - 1)} ===`);
dumpRange(TRAMPOLINE_START, TRAMPOLINE_LENGTH);
printDisassembly('Manual Decode: trampoline block at 0x0000A4', TRAMPOLINE_START, TRAMPOLINE_START + TRAMPOLINE_LENGTH, trampolineNotes);

printDisassembly('Relevant caller context at 0x05D58F', CALLSITE_START, CALLSITE_END, callsiteNotes);

console.log('\n=== Direct References To 0x0027E8 ===');
console.log(`CALL 0x0027E8 count: ${directCalls.length}`);
console.log(`JP   0x0027E8 count: ${directJumps.length}`);
console.log(`Combined direct references: ${directRefs.length}`);
console.log('First 10 direct references:');
for (const ref of directRefs.slice(0, 10)) {
  console.log(`  ${hex(ref.address)}  ${ref.kind}`);
}

console.log('\n=== Findings ===');
console.log(`1. ${hex(TRAMPOLINE_START)} is a direct trampoline: the bytes are "C3 E8 27 00", which is JP ${hex(FUNCTION_START)}.`);
console.log(`2. ${hex(FUNCTION_START)} is not an indirect dispatcher. It never reads a 24-bit target from the 4-byte entry, and it never executes JP (HL), JP (IY), or CALL-through-table logic.`);
console.log('3. The stack frame layout at 0x0027E8 is:');
console.log('   [IY+3] = arg1 = destination pointer');
console.log('   [IY+6] = arg2 = source pointer');
console.log('   [IY+9] = arg3 = byte count');
console.log('4. The body performs a zero-length check, then LDIR copies BC bytes from HL to DE, and finally returns the destination pointer in HL.');
console.log('5. In other words, the 4-byte table entry is treated as raw data, not as a callable record. The routine is a forward copy helper with the exact shape of memcpy(dst, src, len).');
console.log(`6. The known ${hex(0x05D58F)} caller path pushes len = 4, computes src = table_base + 4 * key, loads dst from (IX+9), and then calls ${hex(TRAMPOLINE_START)}.`);
console.log('7. Therefore the key-dispatch code copies a 4-byte table entry into a caller-provided buffer. It does not dispatch through that entry at 0x0027E8.');
console.log(`8. Direct byte-pattern search found ${directCalls.length} CALL site(s) and ${directJumps.length} JP site(s) to ${hex(FUNCTION_START)}. The single JP site is the trampoline itself at ${hex(TRAMPOLINE_START)}.`);
console.log(`9. ${hex(0x05D58F)} is not in the direct-reference list because it calls ${hex(TRAMPOLINE_START)}, not ${hex(FUNCTION_START)} directly.`);
