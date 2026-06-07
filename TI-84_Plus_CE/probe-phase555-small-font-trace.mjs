import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mem = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const GLYPH_LOOKUP_START = 0x07bf3e;
const GLYPH_LOOKUP_END = 0x07bf8a;
const NEXT_REGION_START = 0x07bf8b;
const NEXT_REGION_END = 0x07c000;
const BLIT_START = 0x0a24c8;
const BLIT_END = 0x0a26c7;
const FONT_START = 0x003d6e;
const FONT_END = 0x00596e;

const hex2 = (n) => (n & 0xff).toString(16).toUpperCase().padStart(2, '0');
const hex4 = (n) => (n & 0xffff).toString(16).toUpperCase().padStart(4, '0');
const hex6 = (n) => (n & 0xffffff).toString(16).toUpperCase().padStart(6, '0');
const b = (addr) => mem[addr] & 0xff;
const le16 = (addr) => b(addr) | (b(addr + 1) << 8);
const le24 = (addr) => b(addr) | (b(addr + 1) << 8) | (b(addr + 2) << 16);
const s8 = (v) => (v & 0x80 ? v - 0x100 : v);

function bytes(addr, len) {
  return Array.from({ length: len }, (_, i) => hex2(b(addr + i))).join(' ');
}

function hexDump(start, end, width = 16) {
  for (let addr = start; addr <= end; addr += width) {
    const len = Math.min(width, end - addr + 1);
    const bs = Array.from({ length: len }, (_, i) => b(addr + i));
    const text = bs.map((x) => (x >= 0x20 && x <= 0x7e ? String.fromCharCode(x) : '.')).join('');
    console.log(`${hex6(addr)}  ${bs.map(hex2).join(' ').padEnd(width * 3 - 1)}  ${text}`);
  }
}

function relTarget(addr, disp, size) {
  return (addr + size + s8(disp)) & 0xffffff;
}

function rrName(op) {
  return ['BC', 'DE', 'HL', 'SP'][(op >> 4) & 3];
}

function rName(id) {
  return ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'][id & 7];
}

function decodeBase(addr) {
  const op = b(addr);
  const x = op >> 6;
  const y = (op >> 3) & 7;
  const z = op & 7;

  if (op === 0x00) return [1, 'NOP'];
  if (op === 0x01 || op === 0x11 || op === 0x21 || op === 0x31) return [3, `LD ${rrName(op)},$${hex4(le16(addr + 1))}`];
  if (op === 0x02) return [1, 'LD (BC),A'];
  if (op === 0x03 || op === 0x13 || op === 0x23 || op === 0x33) return [1, `INC ${rrName(op)}`];
  if (op === 0x04 || op === 0x0c || op === 0x14 || op === 0x1c || op === 0x24 || op === 0x2c || op === 0x34 || op === 0x3c) return [1, `INC ${rName(y)}`];
  if (op === 0x05 || op === 0x0d || op === 0x15 || op === 0x1d || op === 0x25 || op === 0x2d || op === 0x35 || op === 0x3d) return [1, `DEC ${rName(y)}`];
  if (op === 0x06 || op === 0x0e || op === 0x16 || op === 0x1e || op === 0x26 || op === 0x2e || op === 0x36 || op === 0x3e) return [2, `LD ${rName(y)},$${hex2(b(addr + 1))}`];
  if (op === 0x07) return [1, 'RLCA'];
  if (op === 0x08) return [1, 'EX AF,AF\''];
  if (op === 0x09 || op === 0x19 || op === 0x29 || op === 0x39) return [1, `ADD HL,${rrName(op)}`];
  if (op === 0x0a) return [1, 'LD A,(BC)'];
  if (op === 0x0b || op === 0x1b || op === 0x2b || op === 0x3b) return [1, `DEC ${rrName(op)}`];
  if (op === 0x0f) return [1, 'RRCA'];
  if (op === 0x10) return [2, `DJNZ $${hex6(relTarget(addr, b(addr + 1), 2))}`];
  if (op === 0x12) return [1, 'LD (DE),A'];
  if (op === 0x17) return [1, 'RLA'];
  if (op === 0x18) return [2, `JR $${hex6(relTarget(addr, b(addr + 1), 2))}`];
  if (op === 0x1a) return [1, 'LD A,(DE)'];
  if (op === 0x1f) return [1, 'RRA'];
  if (op === 0x20 || op === 0x28 || op === 0x30 || op === 0x38) return [2, `JR ${['NZ', 'Z', 'NC', 'C'][(op >> 3) & 3]},$${hex6(relTarget(addr, b(addr + 1), 2))}`];
  if (op === 0x22) return [3, `LD ($${hex4(le16(addr + 1))}),HL`];
  if (op === 0x27) return [1, 'DAA'];
  if (op === 0x2a) return [3, `LD HL,($${hex4(le16(addr + 1))})`];
  if (op === 0x2f) return [1, 'CPL'];
  if (op === 0x32) return [3, `LD ($${hex4(le16(addr + 1))}),A`];
  if (op === 0x37) return [1, 'SCF'];
  if (op === 0x3a) return [3, `LD A,($${hex4(le16(addr + 1))})`];
  if (op === 0x3f) return [1, 'CCF'];
  if (x === 1) return [1, op === 0x76 ? 'HALT' : `LD ${rName(y)},${rName(z)}`];

  const alu = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'][y];
  if (x === 2) return [1, `${alu},${rName(z)}`.replace('SUB,', 'SUB ')];

  if (op === 0xc0 || op === 0xc8 || op === 0xd0 || op === 0xd8 || op === 0xe0 || op === 0xe8 || op === 0xf0 || op === 0xf8) return [1, `RET ${['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'][(op >> 3) & 7]}`];
  if (op === 0xc1 || op === 0xd1 || op === 0xe1 || op === 0xf1) return [1, `POP ${['BC', 'DE', 'HL', 'AF'][(op >> 4) & 3]}`];
  if (op === 0xc2 || op === 0xca || op === 0xd2 || op === 0xda || op === 0xe2 || op === 0xea || op === 0xf2 || op === 0xfa) return [3, `JP ${['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'][(op >> 3) & 7]},$${hex4(le16(addr + 1))}`];
  if (op === 0xc3) return [3, `JP $${hex4(le16(addr + 1))}`];
  if (op === 0xc4 || op === 0xcc || op === 0xd4 || op === 0xdc || op === 0xe4 || op === 0xec || op === 0xf4 || op === 0xfc) return [3, `CALL ${['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'][(op >> 3) & 7]},$${hex4(le16(addr + 1))}`];
  if (op === 0xc5 || op === 0xd5 || op === 0xe5 || op === 0xf5) return [1, `PUSH ${['BC', 'DE', 'HL', 'AF'][(op >> 4) & 3]}`];
  if (op === 0xc6 || op === 0xce || op === 0xd6 || op === 0xde || op === 0xe6 || op === 0xee || op === 0xf6 || op === 0xfe) return [2, `${['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'][(op >> 3) & 7]} $${hex2(b(addr + 1))}`];
  if (op === 0xc7 || op === 0xcf || op === 0xd7 || op === 0xdf || op === 0xe7 || op === 0xef || op === 0xf7 || op === 0xff) return [1, `RST $${hex2(op & 0x38)}`];
  if (op === 0xc9) return [1, 'RET'];
  if (op === 0xcd) return [3, `CALL $${hex4(le16(addr + 1))}`];
  if (op === 0xd3) return [2, `OUT ($${hex2(b(addr + 1))}),A`];
  if (op === 0xd9) return [1, 'EXX'];
  if (op === 0xdb) return [2, `IN A,($${hex2(b(addr + 1))})`];
  if (op === 0xe3) return [1, 'EX (SP),HL'];
  if (op === 0xe9) return [1, 'JP (HL)'];
  if (op === 0xeb) return [1, 'EX DE,HL'];
  if (op === 0xf3) return [1, 'DI'];
  if (op === 0xf9) return [1, 'LD SP,HL'];
  if (op === 0xfb) return [1, 'EI'];

  return [1, `DB $${hex2(op)}`];
}

function decodeIndexed(addr, prefix, reg) {
  const op = b(addr + 1);
  if (op === 0xcb) {
    const disp = b(addr + 2);
    const cb = b(addr + 3);
    const bitOp = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][(cb >> 3) & 7];
    const bitKind = ['BIT', 'RES', 'SET'][((cb >> 6) & 3) - 1];
    if ((cb >> 6) === 0) return [4, `${bitOp} (${reg}+$${hex2(disp)})`];
    return [4, `${bitKind} ${(cb >> 3) & 7},(${reg}+$${hex2(disp)})`];
  }

  const dispOps = new Set([0x34, 0x35, 0x36, 0x46, 0x4e, 0x56, 0x5e, 0x66, 0x6e, 0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x77, 0x7e, 0x86, 0x8e, 0x96, 0x9e, 0xa6, 0xae, 0xb6, 0xbe]);
  const rr = prefix === 0xdd ? 'IX' : 'IY';
  if (op === 0x21) return [4, `LD ${rr},$${hex4(le16(addr + 2))}`];
  if (op === 0x22) return [4, `LD ($${hex4(le16(addr + 2))}),${rr}`];
  if (op === 0x2a) return [4, `LD ${rr},($${hex4(le16(addr + 2))})`];
  if (op === 0x23) return [2, `INC ${rr}`];
  if (op === 0x2b) return [2, `DEC ${rr}`];
  if (op === 0x36) return [4, `LD (${rr}+$${hex2(b(addr + 2))}),$${hex2(b(addr + 3))}`];
  if (dispOps.has(op)) {
    const disp = b(addr + 2);
    const replaced = decodeBase(addr + 1)[1].replaceAll('(HL)', `(${rr}+$${hex2(disp)})`).replaceAll('HL', rr).replaceAll('H', `${rr}H`).replaceAll('L', `${rr}L`);
    return [3, replaced];
  }
  const base = decodeBase(addr + 1);
  return [base[0] + 1, base[1].replaceAll('HL', rr).replaceAll('H', `${rr}H`).replaceAll('L', `${rr}L`)];
}

function decodeEd(addr) {
  const op = b(addr + 1);
  if (op === 0x5b) return [4, `LD DE,($${hex4(le16(addr + 2))})`];
  if (op === 0x6b) return [4, `LD HL,($${hex4(le16(addr + 2))})`];
  if (op === 0x73) return [4, `LD ($${hex4(le16(addr + 2))}),SP`];
  if (op === 0x7b) return [4, `LD SP,($${hex4(le16(addr + 2))})`];
  if (op === 0xa0) return [2, 'LDI'];
  if (op === 0xa1) return [2, 'CPI'];
  if (op === 0xa8) return [2, 'LDD'];
  if (op === 0xa9) return [2, 'CPD'];
  if (op === 0xb0) return [2, 'LDIR'];
  if (op === 0xb1) return [2, 'CPIR'];
  if (op === 0xb8) return [2, 'LDDR'];
  if (op === 0xb9) return [2, 'CPDR'];
  return [2, `ED $${hex2(op)}`];
}

function decode(addr) {
  const op = b(addr);
  if (op === 0xdd) return decodeIndexed(addr, op, 'IX');
  if (op === 0xfd) return decodeIndexed(addr, op, 'IY');
  if (op === 0xed) return decodeEd(addr);
  if (op === 0xcb) {
    const cb = b(addr + 1);
    if ((cb >> 6) === 1) return [2, `BIT ${(cb >> 3) & 7},${rName(cb & 7)}`];
    if ((cb >> 6) === 2) return [2, `RES ${(cb >> 3) & 7},${rName(cb & 7)}`];
    if ((cb >> 6) === 3) return [2, `SET ${(cb >> 3) & 7},${rName(cb & 7)}`];
    return [2, `${['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'][(cb >> 3) & 7]} ${rName(cb & 7)}`];
  }
  return decodeBase(addr);
}

function annotate(addr, asm) {
  const notes = [];
  if (/IY\+\$14/.test(asm)) notes.push('global font-size flag byte; BIT 1 set means small font mode');
  if (/IY\+\$20/.test(asm)) notes.push('renderer/font-related state byte; requested small-font probe target');
  if (/BIT 1,\(IY\+\$14\)/.test(asm)) notes.push('direct small-font branch condition');
  if (/CALL \$0380/.test(asm)) notes.push('known font-base helper, returns base $003D6E');
  if (addr >= GLYPH_LOOKUP_START && addr <= GLYPH_LOOKUP_END && /\$003D|\$3D6E|\$0380/.test(asm)) notes.push('watch for base pointer/table offset behavior');
  return notes.length ? ` ; ${notes.join(' | ')}` : '';
}

function disasm(start, end) {
  let addr = start;
  while (addr <= end) {
    const [len, asm] = decode(addr);
    console.log(`${hex6(addr)}  ${bytes(addr, Math.min(len, end - addr + 1)).padEnd(14)} ${asm}${annotate(addr, asm)}`);
    addr += Math.max(1, len);
  }
}

function findIyReferences(start, end) {
  const refs = [];
  for (let addr = start; addr <= end - 3; addr++) {
    if (b(addr) !== 0xfd) continue;
    const op = b(addr + 1);
    const disp = b(addr + 2);
    if (disp !== 0x14 && disp !== 0x20) continue;
    const isIYDisp =
      op === 0xcb ||
      new Set([0x34, 0x35, 0x36, 0x46, 0x4e, 0x56, 0x5e, 0x66, 0x6e, 0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x77, 0x7e, 0x86, 0x8e, 0x96, 0x9e, 0xa6, 0xae, 0xb6, 0xbe]).has(op);
    if (isIYDisp) refs.push(addr);
  }
  return refs;
}

function pointerSearch() {
  const hits = [];
  for (let addr = 0; addr <= mem.length - 3; addr++) {
    const value = le24(addr);
    if (value >= FONT_START && value < FONT_END) {
      hits.push({ addr, value, order: 'little-endian 24-bit' });
    }
  }
  return hits;
}

function exactPatternSearch(pattern) {
  const hits = [];
  for (let addr = 0; addr <= mem.length - pattern.length; addr++) {
    let ok = true;
    for (let i = 0; i < pattern.length; i++) {
      if (b(addr + i) !== pattern[i]) {
        ok = false;
        break;
      }
    }
    if (ok) hits.push(addr);
  }
  return hits;
}

console.log('=== Probe phase 555: small-font code-path trace ===');
console.log(`ROM bytes visible through memory: ${mem.length}`);
console.log(`Font table candidate range: $${hex6(FONT_START)}-$${hex6(FONT_END)} (exclusive end for pointer scan)`);

console.log('\n=== Hex dump: glyph lookup $07BF3E-$07BF8A ===');
hexDump(GLYPH_LOOKUP_START, GLYPH_LOOKUP_END);
console.log('\n=== Disassembly: glyph lookup $07BF3E-$07BF8A ===');
disasm(GLYPH_LOOKUP_START, GLYPH_LOOKUP_END);

console.log('\n=== Hex dump: next region $07BF8B-$07C000 ===');
hexDump(NEXT_REGION_START, NEXT_REGION_END);
console.log('\n=== Disassembly: next region $07BF8B-$07C000 ===');
disasm(NEXT_REGION_START, NEXT_REGION_END);

console.log('\n=== IY+$14 / IY+$20 references in renderer region $0A24C8-$0A26C7 ===');
const iyRefs = findIyReferences(BLIT_START, BLIT_END);
if (!iyRefs.length) {
  console.log('No direct indexed IY+$14 or IY+$20 references found in this range.');
} else {
  for (const addr of iyRefs) {
    const contextStart = Math.max(BLIT_START, addr - 8);
    const contextEnd = Math.min(BLIT_END, addr + 16);
    console.log(`\n-- Context around $${hex6(addr)} --`);
    disasm(contextStart, contextEnd);
  }
}

console.log('\n=== Search: exact known byte patterns ===');
const patterns = [
  { label: '6E 3D 00 ($003D6E little-endian)', bytes: [0x6e, 0x3d, 0x00] },
  { label: '00 3D 6E ($003D6E big-endian-ish)', bytes: [0x00, 0x3d, 0x6e] },
  { label: '3D 6E 00 (middle order)', bytes: [0x3d, 0x6e, 0x00] },
  { label: '85 3D 00 ($003D85 little-endian)', bytes: [0x85, 0x3d, 0x00] },
  { label: '00 3D 85 ($003D85 big-endian-ish)', bytes: [0x00, 0x3d, 0x85] },
  { label: '3D 85 00 (middle order)', bytes: [0x3d, 0x85, 0x00] },
];
for (const pattern of patterns) {
  const hits = exactPatternSearch(pattern.bytes);
  console.log(`${pattern.label}: ${hits.length} hit(s)${hits.length ? ` at ${hits.slice(0, 40).map((x) => `$${hex6(x)}`).join(', ')}${hits.length > 40 ? ' ...' : ''}` : ''}`);
}

console.log('\n=== Search: all little-endian 24-bit pointers into font range ===');
const ptrHits = pointerSearch();
if (!ptrHits.length) {
  console.log('No 24-bit little-endian pointers into the font table range were found.');
} else {
  for (const hit of ptrHits) {
    const isExactBase = hit.value === FONT_START;
    console.log(`$${hex6(hit.addr)} -> $${hex6(hit.value)}${isExactBase ? ' (exact known base)' : ' (alternate/offset into font range)'}`);
  }
}

console.log('\n=== Analysis prompts ===');
console.log('- In glyph lookup, compare any BIT 1,(IY+$14) branch targets against pointer setup instructions and CALL $0380.');
console.log('- If $07BF3E always uses CALL $0380 / $003D6E and only changes arithmetic, small font is render-path behavior, not a second table.');
console.log('- Renderer IY references above show whether $0A24C8-$0A26C7 checks $14/$20 directly for row height, row skipping, or stride changes.');
