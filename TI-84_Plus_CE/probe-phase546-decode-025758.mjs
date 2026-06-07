import fs from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

const TARGET = 0x025758;
const CALL_PATTERN = [0xcd, 0x58, 0x57, 0x02];
const MAX_INSTRUCTIONS = 80;

const knownRam = new Map([
  [0xd02611, 'D02611 validation target used by 0x02398E'],
  [0xd025cf, 'D025CF nearby validation/token RAM'],
  [0xd000b5, 'D000B5 IY+0x35 flags/status byte'],
  [0xd00080, 'D00080 IY base'],
  [0xd005f8, 'D005F8 OP1'],
  [0xd005ff, 'D005FF OP2'],
  [0xd00606, 'D00606 OP3'],
  [0xd0060d, 'D0060D OP4'],
  [0xd00614, 'D00614 OP5'],
  [0xd0061b, 'D0061B OP6'],
]);

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return value.toString(16).toUpperCase().padStart(2, '0');
}

function rawBytes(address, size) {
  return [...rom.subarray(address, address + size)].map(hexByte).join(' ');
}

function formatValue(value) {
  if (typeof value === 'number') {
    return hex(value, value <= 0xff ? 2 : value <= 0xffff ? 4 : 6);
  }
  if (Array.isArray(value)) {
    return `[${value.map(formatValue).join(', ')}]`;
  }
  return String(value);
}

function formatInstruction(ins) {
  if (ins.text) return ins.text;
  if (ins.mnemonic) {
    const operands = ins.operands ?? ins.args ?? ins.operand;
    if (operands == null) return ins.mnemonic;
    if (Array.isArray(operands)) return `${ins.mnemonic} ${operands.map(formatValue).join(', ')}`;
    return `${ins.mnemonic} ${formatValue(operands)}`;
  }

  const skip = new Set(['tag', 'size', 'bytes', 'raw', 'address']);
  const fields = Object.entries(ins)
    .filter(([key]) => !skip.has(key))
    .map(([key, value]) => `${key}=${formatValue(value)}`);

  return fields.length ? `${ins.tag} ${fields.join(' ')}` : ins.tag;
}

function referencedNumbers(ins, mnemonic) {
  const values = [];
  const seen = new Set();

  function visit(value) {
    if (typeof value === 'number') {
      if (!seen.has(value)) {
        seen.add(value);
        values.push(value);
      }
      return;
    }
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (value && typeof value === 'object') {
      for (const item of Object.values(value)) visit(item);
    }
  }

  visit(ins);

  for (const match of mnemonic.matchAll(/\b(?:0x|&H|\$)?([0-9A-F]{4,6})\b/gi)) {
    const value = Number.parseInt(match[1], 16);
    if (!seen.has(value)) {
      seen.add(value);
      values.push(value);
    }
  }

  return values;
}

function annotationsFor(ins, mnemonic) {
  const notes = [];

  for (const value of referencedNumbers(ins, mnemonic)) {
    const note = knownRam.get(value);
    if (note) notes.push(`${hex(value)}=${note}`);
  }

  if (/\(IY\+0x35\)|\(IY\+\$35\)|\(IY\+35h\)|\(IY\+35\)/i.test(mnemonic)) {
    notes.push('IY+0x35=D000B5 flags/status byte');
  }

  return [...new Set(notes)];
}

function isFunctionTerminator(ins, mnemonic) {
  const tag = String(ins.tag ?? '').toLowerCase();
  const text = mnemonic.trim().toUpperCase();

  if (tag === 'ret' || text === 'RET' || text.startsWith('RET ')) return true;
  if (tag === 'jp' && !/\b(NZ|Z|NC|C|PO|PE|P|M)\b/i.test(text)) return true;
  if (text.startsWith('JP ') && !/^JP\s+(NZ|Z|NC|C|PO|PE|P|M)\s*,/i.test(text)) return true;

  return false;
}

function findCallXrefs() {
  const xrefs = [];
  for (let address = 0; address <= rom.length - CALL_PATTERN.length; address += 1) {
    let matched = true;
    for (let offset = 0; offset < CALL_PATTERN.length; offset += 1) {
      if (rom[address + offset] !== CALL_PATTERN[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) xrefs.push(address);
  }
  return xrefs;
}

console.log('=== Probe Phase 546: Decode validation check at 0x025758 ===');
console.log(`ROM size: ${hex(rom.length, 6)} bytes`);
console.log(`Target: ${hex(TARGET)} called by 0x02398E with HL=${hex(0xd02611)}`);
console.log('');

const xrefs = findCallXrefs();
console.log(`CALL xrefs to ${hex(TARGET)} (pattern CD 58 57 02): ${xrefs.length}`);
for (const address of xrefs) {
  console.log(`  ${hex(address)}`);
}
console.log('');

console.log('Known RAM annotations:');
for (const [address, label] of knownRam) {
  console.log(`  ${hex(address)}  ${label}`);
}
console.log('');

console.log(`Disassembly from ${hex(TARGET)}:`);
let address = TARGET;
for (let count = 0; count < MAX_INSTRUCTIONS && address < rom.length; count += 1) {
  const ins = decodeInstruction(rom, address);
  const size = ins.size || 1;
  const mnemonic = formatInstruction(ins);
  const notes = annotationsFor(ins, mnemonic);
  const suffix = notes.length ? ` ; ${notes.join('; ')}` : '';

  console.log(`${hex(address)}  ${rawBytes(address, size).padEnd(14)}  ${mnemonic}${suffix}`);

  address += size;
  if (isFunctionTerminator(ins, mnemonic)) break;
}
