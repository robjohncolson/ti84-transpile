import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const romPath = path.join(__dirname, 'ROM.rom');

const ROM_START = 0x000000;
const ROM_END = 0x3fffff;

const targets = [
  { name: 'D0146E', address: 0xd0146e, note: 'font metric source copied to D02A65' },
  { name: 'D01471', address: 0xd01471, note: 'font metric source copied to D02A68' },
  { name: 'D0146F', address: 0xd0146f, note: 'adjacent byte, possible multi-byte D0146E field' },
  { name: 'D01472', address: 0xd01472, note: 'adjacent byte, possible multi-byte D01471 field' },
];

const rom = fs.readFileSync(romPath);
const scanEnd = Math.min(rom.length - 2, ROM_END - ROM_START - 1);

const hex = (value, width = 6) => `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
const hexByte = (value) => value.toString(16).toUpperCase().padStart(2, '0');

function bytesAt(offset, length) {
  return Array.from(rom.subarray(offset, Math.min(rom.length, offset + length)), hexByte).join(' ');
}

function surroundingBytes(addrOffset) {
  const start = Math.max(0, addrOffset - 8);
  const end = Math.min(rom.length, addrOffset + 3 + 8);
  return Array.from(rom.subarray(start, end), (byte, index) => {
    const pos = start + index;
    const rendered = hexByte(byte);
    return pos >= addrOffset && pos < addrOffset + 3 ? `[${rendered}]` : rendered;
  }).join(' ');
}

function regionFor(address) {
  if (address >= 0x06f000 && address <= 0x06ffff) return '0x06Fxxx font rendering / font params';
  if (address >= 0x070000 && address <= 0x07ffff) return '0x07xxxx display / rendering';
  if (address >= 0x000000 && address <= 0x00ffff) return '0x00xxxx boot / low ROM';
  if (address >= 0x010000 && address <= 0x01ffff) return '0x01xxxx system ROM';
  if (address >= 0x020000 && address <= 0x02ffff) return '0x02xxxx system ROM';
  if (address >= 0x030000 && address <= 0x03ffff) return '0x03xxxx system ROM';
  if (address >= 0x040000 && address <= 0x04ffff) return '0x04xxxx system ROM';
  if (address >= 0x050000 && address <= 0x05ffff) return '0x05xxxx system ROM';
  if (address >= 0x060000 && address <= 0x06ffff) return '0x06xxxx rendering / UI ROM';
  if (address >= 0x080000 && address <= 0x08ffff) return '0x08xxxx app / UI ROM';
  if (address >= 0x090000 && address <= 0x09ffff) return '0x09xxxx app / UI ROM';
  if (address >= 0x0a0000 && address <= 0x0affff) return '0x0Axxxx tables / lookup ROM';
  if (address >= 0x0b0000 && address <= 0x0fffff) return '0x0B-0Fxxxx ROM';
  if (address >= 0x100000 && address <= 0x1fffff) return '0x10-1Fxxxx ROM';
  if (address >= 0x200000 && address <= 0x2fffff) return '0x20-2Fxxxx ROM';
  if (address >= 0x300000 && address <= 0x3fffff) return '0x30-3Fxxxx ROM';
  return 'outside scanned ROM';
}

function decodeInstruction(addrOffset) {
  const p1 = addrOffset - 1 >= 0 ? rom[addrOffset - 1] : undefined;
  const p2 = addrOffset - 2 >= 0 ? rom[addrOffset - 2] : undefined;
  const p3 = addrOffset - 3 >= 0 ? rom[addrOffset - 3] : undefined;
  const n1 = addrOffset + 3 < rom.length ? rom[addrOffset + 3] : undefined;

  if (p1 === 0x3a) return { access: 'READ', instruction: 'LD A,(nn)', opcodeOffset: addrOffset - 1 };
  if (p1 === 0x32) return { access: 'WRITE', instruction: 'LD (nn),A', opcodeOffset: addrOffset - 1 };
  if (p1 === 0x2a) return { access: 'READ', instruction: 'LD HL,(nn)', opcodeOffset: addrOffset - 1 };
  if (p1 === 0x22) return { access: 'WRITE', instruction: 'LD (nn),HL', opcodeOffset: addrOffset - 1 };
  if (p1 === 0xed && n1 === 0x57) return { access: 'READ', instruction: 'LD A,(I) after address bytes? unusual ED pattern', opcodeOffset: addrOffset - 1 };

  if (p1 === 0x21) return { access: 'ADDRESS', instruction: 'LD HL,nn', opcodeOffset: addrOffset - 1 };
  if (p1 === 0x01) return { access: 'ADDRESS', instruction: 'LD BC,nn', opcodeOffset: addrOffset - 1 };
  if (p1 === 0x11) return { access: 'ADDRESS', instruction: 'LD DE,nn', opcodeOffset: addrOffset - 1 };
  if (p1 === 0x31) return { access: 'ADDRESS', instruction: 'LD SP,nn', opcodeOffset: addrOffset - 1 };

  if (p2 === 0xed && p1 === 0x4b) return { access: 'READ', instruction: 'LD BC,(nn)', opcodeOffset: addrOffset - 2 };
  if (p2 === 0xed && p1 === 0x5b) return { access: 'READ', instruction: 'LD DE,(nn)', opcodeOffset: addrOffset - 2 };
  if (p2 === 0xed && p1 === 0x6b) return { access: 'READ', instruction: 'LD HL,(nn)', opcodeOffset: addrOffset - 2 };
  if (p2 === 0xed && p1 === 0x7b) return { access: 'READ', instruction: 'LD SP,(nn)', opcodeOffset: addrOffset - 2 };
  if (p2 === 0xed && p1 === 0x43) return { access: 'WRITE', instruction: 'LD (nn),BC', opcodeOffset: addrOffset - 2 };
  if (p2 === 0xed && p1 === 0x53) return { access: 'WRITE', instruction: 'LD (nn),DE', opcodeOffset: addrOffset - 2 };
  if (p2 === 0xed && p1 === 0x63) return { access: 'WRITE', instruction: 'LD (nn),HL', opcodeOffset: addrOffset - 2 };
  if (p2 === 0xed && p1 === 0x73) return { access: 'WRITE', instruction: 'LD (nn),SP', opcodeOffset: addrOffset - 2 };

  if (p1 === 0xcd) return { access: 'CONTROL', instruction: 'CALL nn', opcodeOffset: addrOffset - 1 };
  if (p1 === 0xc3) return { access: 'CONTROL', instruction: 'JP nn', opcodeOffset: addrOffset - 1 };
  if (p1 === 0xc2) return { access: 'CONTROL', instruction: 'JP NZ,nn', opcodeOffset: addrOffset - 1 };
  if (p1 === 0xca) return { access: 'CONTROL', instruction: 'JP Z,nn', opcodeOffset: addrOffset - 1 };
  if (p1 === 0xd2) return { access: 'CONTROL', instruction: 'JP NC,nn', opcodeOffset: addrOffset - 1 };
  if (p1 === 0xda) return { access: 'CONTROL', instruction: 'JP C,nn', opcodeOffset: addrOffset - 1 };

  if (p3 === 0xfd && p2 === 0x21) return { access: 'ADDRESS', instruction: 'LD IY,nn', opcodeOffset: addrOffset - 2 };
  if (p3 === 0xdd && p2 === 0x21) return { access: 'ADDRESS', instruction: 'LD IX,nn', opcodeOffset: addrOffset - 2 };

  return { access: 'UNKNOWN', instruction: `undecoded; preceding bytes ${bytesAt(Math.max(0, addrOffset - 4), Math.min(4, addrOffset))}`, opcodeOffset: null };
}

function scanTarget(target) {
  const b0 = target.address & 0xff;
  const b1 = (target.address >> 8) & 0xff;
  const b2 = (target.address >> 16) & 0xff;
  const hits = [];

  for (let i = 0; i <= scanEnd; i += 1) {
    if (rom[i] === b0 && rom[i + 1] === b1 && rom[i + 2] === b2) {
      const address = ROM_START + i;
      const decoded = decodeInstruction(i);
      hits.push({
        address,
        offset: i,
        region: regionFor(address),
        context: surroundingBytes(i),
        ...decoded,
      });
    }
  }

  return hits;
}

const allResults = targets.map((target) => ({ target, hits: scanTarget(target) }));

console.log('Phase 576: Map D0146E and D01471 font metric source variable references');
console.log(`ROM: ${romPath}`);
console.log(`ROM bytes: ${rom.length}`);
console.log(`Scan range: ${hex(ROM_START)}-${hex(Math.min(ROM_END, rom.length - 1))}`);
console.log('');

for (const { target, hits } of allResults) {
  const counts = hits.reduce((acc, hit) => {
    acc[hit.access] = (acc[hit.access] ?? 0) + 1;
    return acc;
  }, {});

  console.log(`${target.name} (${hex(target.address)}, ${target.note})`);
  console.log(`  total refs: ${hits.length}`);
  console.log(`  by access: ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(', ') || '(none)'}`);

  const byRegion = new Map();
  for (const hit of hits) {
    if (!byRegion.has(hit.region)) byRegion.set(hit.region, []);
    byRegion.get(hit.region).push(hit);
  }

  for (const [region, regionHits] of byRegion) {
    console.log(`  ${region}: ${regionHits.length}`);
    for (const hit of regionHits) {
      const opcodeText = hit.opcodeOffset == null ? 'opcode ?' : `opcode @ ${hex(hit.opcodeOffset)}`;
      console.log(`    ${hex(hit.address)}  ${hit.access.padEnd(7)}  ${hit.instruction.padEnd(16)}  ${opcodeText}`);
      console.log(`      ${hit.context}`);
    }
  }
  console.log('');
}

const totalRefs = allResults.reduce((sum, result) => sum + result.hits.length, 0);
console.log(`Grand total refs: ${totalRefs}`);
