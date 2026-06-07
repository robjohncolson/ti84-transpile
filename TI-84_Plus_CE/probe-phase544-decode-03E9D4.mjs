import fs from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

const START = 0x03e9d4;
const MAX_INSTRUCTIONS = 60;

const known = new Map([
  [0xd005f8, 'OP1'],
  [0xd00603, 'OP2'],
  [0xd00596, 'display counter'],
  [0xd00813, 'error context'],
  [0xd0081c, 'error display type'],
  [0xd00080, 'IY base'],
  [0x0a1b5b, 'char output'],
  [0x0a1c8a, 'text output'],
  [0x0a2a68, 'cursor'],
  [0x0a1cec, 'text draw'],
  [0x0a22b1, 'screen refresh'],
]);

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function byteHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function renderValue(value) {
  if (typeof value === 'number') {
    return hex(value, value <= 0xffff ? 4 : 6);
  }

  if (Array.isArray(value)) {
    return `[${value.map(renderValue).join(', ')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value).map(([key, item]) => `${key}: ${renderValue(item)}`).join(', ')}}`;
  }

  return String(value);
}

function asmText(inst) {
  for (const key of ['asm', 'assembly', 'mnemonic', 'disasm', 'text']) {
    if (typeof inst[key] === 'string' && inst[key].length > 0) {
      return inst[key];
    }
  }

  const operands = Object.entries(inst)
    .filter(([key]) => !['tag', 'size', 'bytes', 'prefixes'].includes(key))
    .map(([key, value]) => `${key}=${renderValue(value)}`);

  return operands.length > 0 ? `${inst.tag} ${operands.join(', ')}` : inst.tag;
}

function collectNumbers(value, out = []) {
  if (typeof value === 'number') {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectNumbers(item, out);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectNumbers(item, out);
  }

  return out;
}

function notesFor(inst, asm) {
  const notes = [];
  const lowerTag = String(inst.tag ?? '').toLowerCase();
  const lowerAsm = asm.toLowerCase();
  const numbers = collectNumbers(inst);

  for (const value of numbers) {
    const label = known.get(value);
    if (label) {
      const kind = lowerTag.includes('call') || lowerAsm.startsWith('call') ? 'CALL target' : 'reference';
      notes.push(`${kind}: ${hex(value)} ${label}`);
    }
  }

  for (const [addr, label] of known) {
    const bare = addr.toString(16);
    if (lowerAsm.includes(bare) && !notes.some((note) => note.includes(hex(addr)))) {
      const kind = lowerAsm.startsWith('call') ? 'CALL target' : 'reference';
      notes.push(`${kind}: ${hex(addr)} ${label}`);
    }
  }

  const unique = [...new Set(notes)];
  return unique.length > 0 ? ` ; ${unique.join('; ')}` : '';
}

function isFunctionEnd(inst, asm) {
  const tag = String(inst.tag ?? '').toLowerCase();
  const text = asm.trim().toLowerCase();
  return tag === 'ret' || tag.startsWith('ret ') || text === 'ret' || text.startsWith('ret ');
}

function findSequence(sequence) {
  const hits = [];
  for (let offset = 0; offset <= rom.length - sequence.length; offset += 1) {
    let matched = true;
    for (let i = 0; i < sequence.length; i += 1) {
      if (rom[offset + i] !== sequence[i]) {
        matched = false;
        break;
      }
    }
    if (matched) hits.push(offset);
  }
  return hits;
}

console.log('Decode probe for extended error detail handler 0x03E9D4');
console.log(`ROM size: ${rom.length} bytes`);
console.log('');
console.log('Known references:');
for (const [addr, label] of known) {
  console.log(`  ${hex(addr)} ${label}`);
}

console.log('');
console.log('Xrefs to 0x03E9D4:');
const unconditional = findSequence([0xcd, 0xd4, 0xe9, 0x03]);
const callNz = findSequence([0xc4, 0xd4, 0xe9, 0x03]);
console.log(`  CALL 0x03E9D4 (CD D4 E9 03): ${unconditional.length === 0 ? 'none' : unconditional.map((addr) => hex(addr)).join(', ')}`);
console.log(`  CALL NZ,0x03E9D4 (C4 D4 E9 03): ${callNz.length === 0 ? 'none' : callNz.map((addr) => hex(addr)).join(', ')}`);

console.log('');
console.log(`Instruction listing from ${hex(START)}:`);

let address = START;
for (let count = 0; count < MAX_INSTRUCTIONS && address < rom.length; count += 1) {
  const inst = decodeInstruction(rom, address, 'adl');
  const size = inst?.size ?? 1;
  const bytes = rom.slice(address, address + size);
  const asm = asmText(inst);
  console.log(`${hex(address)}  ${byteHex(bytes).padEnd(15)}  ${asm}${notesFor(inst, asm)}`);

  address += size;

  if (isFunctionEnd(inst, asm)) {
    console.log(`Stopped after RET at ${hex(address - size)}.`);
    break;
  }
}
