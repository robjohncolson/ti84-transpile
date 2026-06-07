import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mem = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const IY_OFFSET = 0x4a;
const DIRECT_D000CA = [0xca, 0x00, 0xd0];

const hex = (value, width = 6) => `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
const hexByte = (value) => `0x${value.toString(16).toUpperCase().padStart(2, '0')}`;

const displacementOps = new Map([
  [0x34, 'INC (IY+d)'],
  [0x35, 'DEC (IY+d)'],
  [0x36, 'LD (IY+d),n'],
  [0x46, 'LD B,(IY+d)'],
  [0x4e, 'LD C,(IY+d)'],
  [0x56, 'LD D,(IY+d)'],
  [0x5e, 'LD E,(IY+d)'],
  [0x66, 'LD H,(IY+d)'],
  [0x6e, 'LD L,(IY+d)'],
  [0x70, 'LD (IY+d),B'],
  [0x71, 'LD (IY+d),C'],
  [0x72, 'LD (IY+d),D'],
  [0x73, 'LD (IY+d),E'],
  [0x74, 'LD (IY+d),H'],
  [0x75, 'LD (IY+d),L'],
  [0x77, 'LD (IY+d),A'],
  [0x7e, 'LD A,(IY+d)'],
  [0x86, 'ADD A,(IY+d)'],
  [0x8e, 'ADC A,(IY+d)'],
  [0x96, 'SUB (IY+d)'],
  [0x9e, 'SBC A,(IY+d)'],
  [0xa6, 'AND (IY+d)'],
  [0xae, 'XOR (IY+d)'],
  [0xb6, 'OR (IY+d)'],
  [0xbe, 'CP (IY+d)'],
]);

const registerTargets = ['B', 'C', 'D', 'E', 'H', 'L', '(IY+d)', 'A'];

function decodeFdCb(opcode) {
  const group = opcode & 0xc0;
  const bit = (opcode >> 3) & 0x07;
  const target = registerTargets[opcode & 0x07];

  if (group === 0x40) {
    return { operation: 'BIT', bit, detail: `BIT ${bit},${target}` };
  }

  if (group === 0x80) {
    return { operation: 'RES', bit, detail: `RES ${bit},${target}` };
  }

  if (group === 0xc0) {
    return { operation: 'SET', bit, detail: `SET ${bit},${target}` };
  }

  return null;
}

const bitMap = Array.from({ length: 8 }, () => ({
  BIT: [],
  SET: [],
  RES: [],
}));
const wholeByteHits = [];
const fdCbHits = [];
const directHits = [];

for (let offset = 0; offset < mem.length; offset += 1) {
  if (
    offset + 3 < mem.length &&
    mem[offset] === 0xfd &&
    mem[offset + 1] === 0xcb &&
    mem[offset + 2] === IY_OFFSET
  ) {
    const opcode = mem[offset + 3];
    const decoded = decodeFdCb(opcode);

    if (decoded) {
      const hit = {
        address: offset,
        opcode,
        operation: decoded.operation,
        bit: decoded.bit,
        detail: decoded.detail,
      };
      fdCbHits.push(hit);
      bitMap[decoded.bit][decoded.operation].push(hit);
    }
  }

  if (
    offset + 2 < mem.length &&
    mem[offset] === 0xfd &&
    mem[offset + 2] === IY_OFFSET &&
    displacementOps.has(mem[offset + 1])
  ) {
    wholeByteHits.push({
      address: offset,
      opcode: mem[offset + 1],
      operation: displacementOps.get(mem[offset + 1]),
    });
  }

  if (
    offset + 2 < mem.length &&
    mem[offset] === DIRECT_D000CA[0] &&
    mem[offset + 1] === DIRECT_D000CA[1] &&
    mem[offset + 2] === DIRECT_D000CA[2]
  ) {
    directHits.push({ address: offset });
  }
}

console.log('IY+0x4A / D000CA ROM reference map');
console.log(`ROM bytes scanned: ${mem.length}`);
console.log(`FD CB 4A bit-operation hits: ${fdCbHits.length}`);
console.log(`FD xx 4A whole-byte hits: ${wholeByteHits.length}`);
console.log(`Direct D000CA byte-pattern hits (CA 00 D0): ${directHits.length}`);
console.log('');

console.log('Per-bit FD CB 4A summary');
console.log('Bit | BIT tests | SET writes | RES writes');
console.log('----|-----------|------------|-----------');
for (let bit = 0; bit < bitMap.length; bit += 1) {
  const entry = bitMap[bit];
  const bitTests = entry.BIT.map((hit) => `${hex(hit.address)} ${hit.detail} (${hexByte(hit.opcode)})`).join(', ') || '-';
  const setWrites = entry.SET.map((hit) => `${hex(hit.address)} ${hit.detail} (${hexByte(hit.opcode)})`).join(', ') || '-';
  const resWrites = entry.RES.map((hit) => `${hex(hit.address)} ${hit.detail} (${hexByte(hit.opcode)})`).join(', ') || '-';
  console.log(`${bit}   | ${bitTests} | ${setWrites} | ${resWrites}`);
}
console.log('');

console.log('Whole-byte FD xx 4A hits');
if (wholeByteHits.length === 0) {
  console.log('- none');
} else {
  for (const hit of wholeByteHits) {
    console.log(`- ${hex(hit.address)} ${hit.operation} (${hexByte(hit.opcode)})`);
  }
}
console.log('');

console.log('Direct D000CA byte-pattern hits');
if (directHits.length === 0) {
  console.log('- none');
} else {
  for (const hit of directHits) {
    console.log(`- ${hex(hit.address)} CA 00 D0`);
  }
}
console.log('');

console.log('All FD CB 4A hits');
if (fdCbHits.length === 0) {
  console.log('- none');
} else {
  for (const hit of fdCbHits) {
    console.log(`- ${hex(hit.address)} ${hit.detail} (${hit.operation} bit ${hit.bit}, opcode ${hexByte(hit.opcode)})`);
  }
}
