import fs from 'fs';

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

const START = 0x04e640;
const END = 0x04e680;
const ENTRIES = [
  { name: '0x04E640', addr: 0x04e640, call: [0xcd, 0x40, 0xe6, 0x04], jp: [0xc3, 0x40, 0xe6, 0x04] },
  { name: '0x04E645', addr: 0x04e645, call: [0xcd, 0x45, 0xe6, 0x04], jp: [0xc3, 0x45, 0xe6, 0x04] },
];

const REGIONS = [
  { name: 'expression parser/evaluator', start: 0x045000, end: 0x046fff },
  { name: 'math utility library', start: 0x04c900, end: 0x04c9ff },
  { name: 'BPP/LCD cluster', start: 0x052a00, end: 0x0554ff },
  { name: 'rendering/cursor management', start: 0x06c000, end: 0x07bfff },
  { name: 'text renderer', start: 0x0a2000, end: 0x0a2fff },
];

function hexByte(n) {
  return n.toString(16).toUpperCase().padStart(2, '0');
}

function hexAddr(n) {
  return `0x${n.toString(16).toUpperCase().padStart(6, '0')}`;
}

function bytesToHex(bytes) {
  return Array.from(bytes, hexByte).join(' ');
}

function read24(pos) {
  return rom[pos] | (rom[pos + 1] << 8) | (rom[pos + 2] << 16);
}

function signed8(n) {
  return n > 0x7f ? n - 0x100 : n;
}

function dumpRange(start, length, width = 16) {
  const lines = [];
  for (let off = 0; off < length; off += width) {
    const chunk = rom.subarray(start + off, Math.min(start + off + width, start + length));
    lines.push(`  ${hexAddr(start + off)}: ${bytesToHex(chunk)}`);
  }
  return lines.join('\n');
}

function decodeInstruction(pc) {
  const op = rom[pc];
  const b1 = rom[pc + 1];
  const b2 = rom[pc + 2];
  const b3 = rom[pc + 3];

  if (op === 0xcd) return { size: 4, text: `CALL ${hexAddr(read24(pc + 1))}` };
  if (op === 0xc3) return { size: 4, text: `JP ${hexAddr(read24(pc + 1))}` };
  if (op === 0xc9) return { size: 1, text: 'RET' };
  if (op === 0xed && b1 === 0x6f) return { size: 5, text: `LD (${hexAddr(read24(pc + 2))}),HL` };
  if (op === 0x3a) return { size: 4, text: `LD A,(${hexAddr(read24(pc + 1))})` };
  if (op === 0x32) return { size: 4, text: `LD (${hexAddr(read24(pc + 1))}),A` };
  if (op === 0xfd && b1 === 0xcb) {
    const disp = signed8(b2);
    const bit = (b3 >> 3) & 0x07;
    const target = ['B', 'C', 'D', 'E', 'H', 'L', '(IY+d)', 'A'][b3 & 0x07];
    const dispText = disp < 0 ? `-${hexByte(-disp)}` : `+${hexByte(disp)}`;
    if ((b3 & 0xc0) === 0x40) return { size: 4, text: `BIT ${bit},(IY${dispText})` };
    if ((b3 & 0xc0) === 0x80) return { size: 4, text: `RES ${bit},(IY${dispText})${target === '(IY+d)' ? '' : ` -> ${target}`}` };
    if ((b3 & 0xc0) === 0xc0) return { size: 4, text: `SET ${bit},(IY${dispText})${target === '(IY+d)' ? '' : ` -> ${target}`}` };
    return { size: 4, text: `IY bit-op ${hexByte(b3)} d=${dispText}` };
  }

  const oneByte = {
    0x00: 'NOP',
    0x02: 'LD (BC),A',
    0x03: 'INC BC',
    0x04: 'INC B',
    0x05: 'DEC B',
    0x07: 'RLCA',
    0x08: 'EX AF,AF\'',
    0x09: 'ADD HL,BC',
    0x0a: 'LD A,(BC)',
    0x0b: 'DEC BC',
    0x0c: 'INC C',
    0x0d: 'DEC C',
    0x0f: 'RRCA',
    0x12: 'LD (DE),A',
    0x13: 'INC DE',
    0x17: 'RLA',
    0x19: 'ADD HL,DE',
    0x1a: 'LD A,(DE)',
    0x1b: 'DEC DE',
    0x1f: 'RRA',
    0x23: 'INC HL',
    0x29: 'ADD HL,HL',
    0x2b: 'DEC HL',
    0x37: 'SCF',
    0x3c: 'INC A',
    0x3d: 'DEC A',
    0x76: 'HALT',
    0xaf: 'XOR A',
    0xb7: 'OR A',
    0xc0: 'RET NZ',
    0xc8: 'RET Z',
    0xd0: 'RET NC',
    0xd8: 'RET C',
    0xe5: 'PUSH HL',
    0xe1: 'POP HL',
    0xf5: 'PUSH AF',
    0xf1: 'POP AF',
  };
  if (oneByte[op]) return { size: 1, text: oneByte[op] };

  const imm8 = {
    0x06: 'LD B',
    0x0e: 'LD C',
    0x16: 'LD D',
    0x1e: 'LD E',
    0x26: 'LD H',
    0x2e: 'LD L',
    0x3e: 'LD A',
    0xc6: 'ADD A',
    0xd6: 'SUB',
    0xe6: 'AND',
    0xf6: 'OR',
    0xfe: 'CP',
  };
  if (imm8[op]) return { size: 2, text: `${imm8[op]},${hexByte(b1)}` };

  const rel = {
    0x10: 'DJNZ',
    0x18: 'JR',
    0x20: 'JR NZ',
    0x28: 'JR Z',
    0x30: 'JR NC',
    0x38: 'JR C',
  };
  if (rel[op]) return { size: 2, text: `${rel[op]} ${hexAddr(pc + 2 + signed8(b1))}` };

  const imm24 = {
    0x01: 'LD BC',
    0x11: 'LD DE',
    0x21: 'LD HL',
    0x22: 'LD',
    0x2a: 'LD HL',
    0x31: 'LD SP',
  };
  if (imm24[op]) {
    if (op === 0x22) return { size: 4, text: `LD (${hexAddr(read24(pc + 1))}),HL` };
    if (op === 0x2a) return { size: 4, text: `LD HL,(${hexAddr(read24(pc + 1))})` };
    return { size: 4, text: `${imm24[op]},${hexAddr(read24(pc + 1))}` };
  }

  return { size: 1, text: `DB ${hexByte(op)}` };
}

function disassemble(start, end) {
  const lines = [];
  for (let pc = start; pc < end;) {
    const decoded = decodeInstruction(pc);
    const raw = bytesToHex(rom.subarray(pc, Math.min(pc + decoded.size, end))).padEnd(14);
    lines.push(`  ${hexAddr(pc)}: ${raw} ${decoded.text}`);
    pc += decoded.size;
  }
  return lines.join('\n');
}

function findPattern(pattern) {
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

function regionName(addr) {
  const region = REGIONS.find(({ start, end }) => addr >= start && addr <= end);
  return region ? region.name : 'unknown/other';
}

function formatHit(addr, pattern) {
  const before = rom.subarray(Math.max(0, addr - 32), addr);
  const after = rom.subarray(addr + pattern.length, Math.min(rom.length, addr + pattern.length + 16));
  return `  ${hexAddr(addr)} [${regionName(addr)}]: ${bytesToHex(before)} | ${bytesToHex(pattern)} | ${bytesToHex(after)}`;
}

function printHits(title, hits, pattern) {
  console.log(`${title}: ${hits.length}`);
  for (const hit of hits) console.log(formatHit(hit, pattern));
  console.log('');
}

function summarize(label, callHits, jpHits) {
  const counts = new Map();
  for (const hit of [...callHits, ...jpHits]) {
    const name = regionName(hit);
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  const regions = [...counts.entries()]
    .map(([name, count]) => `${name} (${count})`)
    .join(', ') || 'none';
  console.log(`  ${label}: ${callHits.length + jpHits.length} callers in regions: ${regions}`);
}

const results = new Map();

console.log('=== 0x04E640 / 0x04E645 CALLERS ===');
console.log('');
console.log('Function at 0x04E640 (hex dump):');
console.log(dumpRange(START, END - START));
console.log('Disassembly:');
console.log(disassemble(START, END));
console.log('');

for (const entry of ENTRIES) {
  const callHits = findPattern(entry.call);
  const jpHits = findPattern(entry.jp);
  results.set(entry.name, { callHits, jpHits });
  printHits(`CALL ${entry.name} callers`, callHits, entry.call);
  printHits(`JP ${entry.name} callers`, jpHits, entry.jp);
}

console.log('Summary:');
for (const entry of ENTRIES) {
  const { callHits, jpHits } = results.get(entry.name);
  summarize(entry.name, callHits, jpHits);
}
