import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const START = 0x07cf8e;
const MAX_BYTES = 64;

const RAM_NAMES = new Map([
  [0xd005f8, 'primaryDescriptorBuffer'],
  [0xd00603, 'shadowDescriptorBuffer'],
  [0xd0063a, 'secondaryShadowBuffer'],
  [0xd02b39, 'resolverScratchBuffer'],
]);

const CC = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const RP = ['BC', 'DE', 'HL', 'SP'];
const RP2 = ['BC', 'DE', 'HL', 'AF'];
const R = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const ALU = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];

const rom = fs.readFileSync(ROM_PATH);

function hex(value, width) {
  return value.toString(16).toUpperCase().padStart(width, '0');
}

function romOffset(addr) {
  return addr & 0x3fffff;
}

function readU24(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function readS8(offset) {
  const value = rom[offset];
  return value & 0x80 ? value - 0x100 : value;
}

function bytesAt(offset, len) {
  return Array.from(rom.subarray(offset, offset + len), (b) => hex(b, 2)).join(' ');
}

function annotateAddress(value) {
  const name = RAM_NAMES.get(value);
  return name ? `$${hex(value, 6)} <${name}>` : `$${hex(value, 6)}`;
}

function relTarget(addr, offset, len) {
  return (addr + len + readS8(offset + len - 1)) & 0xffffff;
}

function decodeEd(offset, addr, sis) {
  const op = rom[offset + 1];
  const immBytes = sis ? 2 : 3;
  const readAddr = () => (sis
    ? rom[offset + 2] | (rom[offset + 3] << 8)
    : readU24(offset + 2));

  const block = {
    0x40: 'IN B,(C)',
    0x41: 'OUT (C),B',
    0x42: 'SBC HL,BC',
    0x43: `LD (${annotateAddress(readAddr())}),BC`,
    0x44: 'NEG',
    0x45: 'RETN',
    0x46: 'IM 0',
    0x47: 'LD I,A',
    0x48: 'IN C,(C)',
    0x49: 'OUT (C),C',
    0x4a: 'ADC HL,BC',
    0x4b: `LD BC,(${annotateAddress(readAddr())})`,
    0x4d: 'RETI',
    0x4f: 'LD R,A',
    0x50: 'IN D,(C)',
    0x51: 'OUT (C),D',
    0x52: 'SBC HL,DE',
    0x53: `LD (${annotateAddress(readAddr())}),DE`,
    0x56: 'IM 1',
    0x57: 'LD A,I',
    0x58: 'IN E,(C)',
    0x59: 'OUT (C),E',
    0x5a: 'ADC HL,DE',
    0x5b: `LD DE,(${annotateAddress(readAddr())})`,
    0x5e: 'IM 2',
    0x5f: 'LD A,R',
    0x60: 'IN H,(C)',
    0x61: 'OUT (C),H',
    0x62: 'SBC HL,HL',
    0x67: 'RRD',
    0x68: 'IN L,(C)',
    0x69: 'OUT (C),L',
    0x6a: 'ADC HL,HL',
    0x6f: 'RLD',
    0x72: 'SBC HL,SP',
    0x73: `LD (${annotateAddress(readAddr())}),SP`,
    0x78: 'IN A,(C)',
    0x79: 'OUT (C),A',
    0x7a: 'ADC HL,SP',
    0x7b: `LD SP,(${annotateAddress(readAddr())})`,
    0xa0: 'LDI',
    0xa1: 'CPI',
    0xa2: 'INI',
    0xa3: 'OUTI',
    0xa8: 'LDD',
    0xa9: 'CPD',
    0xaa: 'IND',
    0xab: 'OUTD',
    0xb0: 'LDIR',
    0xb1: 'CPIR',
    0xb2: 'INIR',
    0xb3: 'OTIR',
    0xb8: 'LDDR',
    0xb9: 'CPDR',
    0xba: 'INDR',
    0xbb: 'OTDR',
  };

  const len = [0x43, 0x4b, 0x53, 0x5b, 0x73, 0x7b].includes(op) ? 2 + immBytes : 2;
  return { len, text: block[op] ?? `ED $${hex(op, 2)}` };
}

function decode(offset, addr) {
  let prefix = '';
  let sis = false;
  let consumedPrefix = 0;
  const first = rom[offset];

  if ([0x40, 0x49, 0x52, 0x5b].includes(first)) {
    sis = true;
    prefix = '.SIS ';
    consumedPrefix = 1;
  }

  const base = offset + consumedPrefix;
  const op = rom[base];
  const immBytes = sis ? 2 : 3;
  const readAddr = (at) => (sis
    ? rom[at] | (rom[at + 1] << 8)
    : readU24(at));

  const withPrefix = (decoded) => ({
    ...decoded,
    len: decoded.len + consumedPrefix,
    text: `${prefix}${decoded.text}`,
  });

  if (op === 0xed) return withPrefix(decodeEd(base, addr + consumedPrefix, sis));
  if (op === 0xcb) return withPrefix({ len: 2, text: `CB $${hex(rom[base + 1], 2)}` });
  if (op === 0xdd || op === 0xfd) {
    const ix = op === 0xdd ? 'IX' : 'IY';
    const next = rom[base + 1];
    if (next === 0x21) return withPrefix({ len: 2 + immBytes, text: `LD ${ix},${annotateAddress(readAddr(base + 2))}` });
    if (next === 0x22) return withPrefix({ len: 2 + immBytes, text: `LD (${annotateAddress(readAddr(base + 2))}),${ix}` });
    if (next === 0x2a) return withPrefix({ len: 2 + immBytes, text: `LD ${ix},(${annotateAddress(readAddr(base + 2))})` });
    if (next === 0xe5) return withPrefix({ len: 2, text: `PUSH ${ix}` });
    if (next === 0xe1) return withPrefix({ len: 2, text: `POP ${ix}` });
    return withPrefix({ len: 2, text: `${ix} $${hex(next, 2)}` });
  }

  if (op === 0x00) return withPrefix({ len: 1, text: 'NOP' });
  if (op === 0x02) return withPrefix({ len: 1, text: 'LD (BC),A' });
  if (op === 0x0a) return withPrefix({ len: 1, text: 'LD A,(BC)' });
  if (op === 0x12) return withPrefix({ len: 1, text: 'LD (DE),A' });
  if (op === 0x1a) return withPrefix({ len: 1, text: 'LD A,(DE)' });
  if (op === 0x22) return withPrefix({ len: 1 + immBytes, text: `LD (${annotateAddress(readAddr(base + 1))}),HL` });
  if (op === 0x2a) return withPrefix({ len: 1 + immBytes, text: `LD HL,(${annotateAddress(readAddr(base + 1))})` });
  if (op === 0x32) return withPrefix({ len: 1 + immBytes, text: `LD (${annotateAddress(readAddr(base + 1))}),A` });
  if (op === 0x3a) return withPrefix({ len: 1 + immBytes, text: `LD A,(${annotateAddress(readAddr(base + 1))})` });

  if ((op & 0xcf) === 0x01) return withPrefix({ len: 1 + immBytes, text: `LD ${RP[(op >> 4) & 3]},${annotateAddress(readAddr(base + 1))}` });
  if ((op & 0xcf) === 0x03) return withPrefix({ len: 1, text: `INC ${RP[(op >> 4) & 3]}` });
  if ((op & 0xcf) === 0x0b) return withPrefix({ len: 1, text: `DEC ${RP[(op >> 4) & 3]}` });
  if ((op & 0xcf) === 0x09) return withPrefix({ len: 1, text: `ADD HL,${RP[(op >> 4) & 3]}` });

  if ((op & 0xc7) === 0x04) return withPrefix({ len: 1, text: `INC ${R[(op >> 3) & 7]}` });
  if ((op & 0xc7) === 0x05) return withPrefix({ len: 1, text: `DEC ${R[(op >> 3) & 7]}` });
  if ((op & 0xc7) === 0x06) return withPrefix({ len: 2, text: `LD ${R[(op >> 3) & 7]},$${hex(rom[base + 1], 2)}` });

  if (op >= 0x40 && op <= 0x7f) {
    if (op === 0x76) return withPrefix({ len: 1, text: 'HALT' });
    return withPrefix({ len: 1, text: `LD ${R[(op >> 3) & 7]},${R[op & 7]}` });
  }

  if (op >= 0x80 && op <= 0xbf) return withPrefix({ len: 1, text: `${ALU[(op >> 3) & 7]},${R[op & 7]}` });

  if ((op & 0xc7) === 0xc0) return withPrefix({ len: 1, text: `RET ${CC[(op >> 3) & 7]}`, terminal: true });
  if ((op & 0xc7) === 0xc2) return withPrefix({ len: 1 + immBytes, text: `JP ${CC[(op >> 3) & 7]},${annotateAddress(readAddr(base + 1))}` });
  if ((op & 0xc7) === 0xc4) return withPrefix({ len: 1 + immBytes, text: `CALL ${CC[(op >> 3) & 7]},${annotateAddress(readAddr(base + 1))}` });
  if ((op & 0xc7) === 0xc6) return withPrefix({ len: 2, text: `${ALU[(op >> 3) & 7]} $${hex(rom[base + 1], 2)}` });

  if ((op & 0xcf) === 0xc1) return withPrefix({ len: 1, text: `POP ${RP2[(op >> 4) & 3]}` });
  if ((op & 0xcf) === 0xc5) return withPrefix({ len: 1, text: `PUSH ${RP2[(op >> 4) & 3]}` });

  const simple = {
    0x07: 'RLCA',
    0x08: 'EX AF,AF\'',
    0x0f: 'RRCA',
    0x10: `DJNZ $${hex(relTarget(addr, base, 2), 6)}`,
    0x17: 'RLA',
    0x18: `JR $${hex(relTarget(addr, base, 2), 6)}`,
    0x1f: 'RRA',
    0x20: `JR NZ,$${hex(relTarget(addr, base, 2), 6)}`,
    0x27: 'DAA',
    0x28: `JR Z,$${hex(relTarget(addr, base, 2), 6)}`,
    0x2f: 'CPL',
    0x30: `JR NC,$${hex(relTarget(addr, base, 2), 6)}`,
    0x37: 'SCF',
    0x38: `JR C,$${hex(relTarget(addr, base, 2), 6)}`,
    0x3f: 'CCF',
    0xc3: `JP ${annotateAddress(readAddr(base + 1))}`,
    0xc9: 'RET',
    0xcd: `CALL ${annotateAddress(readAddr(base + 1))}`,
    0xd3: `OUT ($${hex(rom[base + 1], 2)}),A`,
    0xd9: 'EXX',
    0xdb: `IN A,($${hex(rom[base + 1], 2)})`,
    0xe3: 'EX (SP),HL',
    0xe9: 'JP (HL)',
    0xeb: 'EX DE,HL',
    0xf3: 'DI',
    0xf9: 'LD SP,HL',
    0xfb: 'EI',
  };

  if (Object.hasOwn(simple, op)) {
    const len = [0x10, 0x18, 0x20, 0x28, 0x30, 0x38, 0xd3, 0xdb].includes(op)
      ? 2
      : [0xc3, 0xcd].includes(op)
        ? 1 + immBytes
        : 1;
    return withPrefix({ len, text: simple[op], terminal: [0x18, 0xc3, 0xc9, 0xe9].includes(op) });
  }

  return withPrefix({ len: 1, text: `DB $${hex(op, 2)}` });
}

function scanXrefs(pattern) {
  const refs = [];
  for (let i = 0; i <= rom.length - pattern.length; i++) {
    let match = true;
    for (let j = 0; j < pattern.length; j++) {
      if (rom[i + j] !== pattern[j]) {
        match = false;
        break;
      }
    }
    if (match) refs.push(i);
  }
  return refs;
}

const rows = [];
const ramRefs = new Set();
let offset = romOffset(START);
let addr = START;
const end = Math.min(offset + MAX_BYTES, rom.length);

while (offset < end) {
  const decoded = decode(offset, addr);
  const raw = bytesAt(offset, decoded.len);
  rows.push({ addr, raw, ...decoded });
  for (const [ram, name] of RAM_NAMES) {
    if (decoded.text.includes(name) || decoded.text.includes(hex(ram, 6))) ramRefs.add(`${hex(ram, 6)} ${name}`);
  }
  offset += decoded.len;
  addr += decoded.len;
  if (decoded.terminal) break;
}

const callRefs = scanXrefs([0xcd, 0x8e, 0xcf, 0x07]);
const jpRefs = scanXrefs([0xc3, 0x8e, 0xcf, 0x07]);
const functionSize = offset - romOffset(START);

console.log(`Probe phase594: static decode of ROM function $${hex(START, 6)}`);
console.log(`ROM: ${ROM_PATH}`);
console.log('');
console.log('Disassembly:');
for (const row of rows) {
  console.log(`${hex(row.addr, 6)}  ${row.raw.padEnd(14)}  ${row.text}`);
}

console.log('');
console.log('Cross-references:');
for (const ref of callRefs) console.log(`${hex(ref, 6)}  CALL $${hex(START, 6)}`);
for (const ref of jpRefs) console.log(`${hex(ref, 6)}  JP   $${hex(START, 6)}`);
if (callRefs.length + jpRefs.length === 0) console.log('(none found)');

console.log('');
console.log('Summary:');
console.log(`Function start: $${hex(START, 6)}`);
console.log(`Function size: ${functionSize} bytes`);
console.log(`Boundary: ${rows.at(-1)?.terminal ? `${rows.at(-1).text} at $${hex(rows.at(-1).addr, 6)}` : `max decode window (${MAX_BYTES} bytes)`}`);
console.log(`RAM refs: ${ramRefs.size ? Array.from(ramRefs).join(', ') : '(none decoded)'}`);
console.log(`Caller count: ${callRefs.length + jpRefs.length} (${callRefs.length} CALL, ${jpRefs.length} JP)`);
console.log('Purpose hypothesis: resolve epilogue — LDIR copies 55 (0x37) bytes from D02B39 scratch RAM back to D00603 shadow descriptor region, restoring state saved by setup function 0x07CF9D before the resolve orchestrator\'s type transformation sequence.');
