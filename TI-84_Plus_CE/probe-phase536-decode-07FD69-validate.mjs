import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const base = 0x07fd4a;
const length = 0x90;
const focus = new Set([0x07fd4a, 0x07fd62, 0x07fd69, 0x07fdc9]);

const rom = fs.readFileSync(romPath);
const bytes = rom.subarray(base, base + length);

const hex2 = (n) => n.toString(16).toUpperCase().padStart(2, '0');
const hex4 = (n) => n.toString(16).toUpperCase().padStart(4, '0');
const hex6 = (n) => n.toString(16).toUpperCase().padStart(6, '0');
const s8 = (n) => (n & 0x80 ? n - 0x100 : n);
const u16 = (off) => bytes[off] | (bytes[off + 1] << 8);
const inWindow = (addr) => addr >= base && addr < base + length;
const isRam = (addr) => addr >= 0xd00000 || (addr >= 0xd000 && addr <= 0xffff);
const ramName = (addr) => {
  if (addr === 0xd005f8 || addr === 0x05f8) return 'OP1 type';
  if (addr === 0xd005f9 || addr === 0x05f9) return 'OP1 exponent';
  if (addr >= 0xd005f8 && addr <= 0xd00602) return `OP1+${hex2(addr - 0xd005f8)}`;
  if (addr === 0xd00603 || addr === 0x0603) return 'OP2 type';
  if (addr === 0xd00604 || addr === 0x0604) return 'OP2 exponent';
  if (addr >= 0xd00603 && addr <= 0xd0060d) return `OP2+${hex2(addr - 0xd00603)}`;
  if (addr >= 0xd00000) return `RAM ${hex6(addr)}`;
  return `RAM? ${hex4(addr)}`;
};

const reg16 = ['BC', 'DE', 'HL', 'SP'];
const reg8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const cc = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];

function decodeAt(off) {
  const addr = base + off;
  const op = bytes[off];
  const b1 = bytes[off + 1] ?? 0;
  const b2 = bytes[off + 2] ?? 0;
  const b3 = bytes[off + 3] ?? 0;
  const notes = [];
  let size = 1;
  let text = `DB $${hex2(op)}`;
  let boundary = false;

  const imm16 = () => b1 | (b2 << 8);
  const targetNote = (kind, target) => {
    notes.push(`${kind} 0x${hex6(target)}`);
    if (inWindow(target)) notes.push('target in decoded window');
  };
  const ramNote = (target) => {
    if (isRam(target)) notes.push(ramName(target));
  };

  if (op === 0x00) text = 'NOP';
  else if (op === 0x76) {
    text = 'HALT';
    boundary = true;
  } else if (op === 0xc9) {
    text = 'RET';
    size = 1;
    boundary = true;
  } else if ((op & 0xc7) === 0xc0) {
    text = `RET ${cc[(op >> 3) & 7]}`;
    boundary = true;
  } else if (op === 0xcd) {
    const t = imm16();
    text = `CALL 0x${hex6(t)}`;
    size = 3;
    targetNote('CALL', t);
  } else if ((op & 0xc7) === 0xc4) {
    const t = imm16();
    text = `CALL ${cc[(op >> 3) & 7]},0x${hex6(t)}`;
    size = 3;
    targetNote('CALL', t);
  } else if (op === 0xc3) {
    const t = imm16();
    text = `JP 0x${hex6(t)}`;
    size = 3;
    boundary = true;
    targetNote('JP', t);
  } else if ((op & 0xc7) === 0xc2) {
    const t = imm16();
    text = `JP ${cc[(op >> 3) & 7]},0x${hex6(t)}`;
    size = 3;
    targetNote('JP', t);
  } else if (op === 0x18 || op === 0x10 || (op >= 0x20 && op <= 0x38 && (op & 7) === 0)) {
    const t = addr + 2 + s8(b1);
    const cond = op === 0x18 ? '' : op === 0x10 ? 'DJNZ ' : `${['NZ', 'Z', 'NC', 'C'][(op - 0x20) >> 3]},`;
    text = op === 0x10 ? `DJNZ 0x${hex6(t)}` : `JR ${cond}0x${hex6(t)}`;
    size = 2;
    targetNote(op === 0x10 ? 'DJNZ' : 'JR', t);
  } else if ((op & 0xcf) === 0x01) {
    text = `LD ${reg16[(op >> 4) & 3]},0x${hex4(imm16())}`;
    size = 3;
  } else if ((op & 0xc7) === 0x06) {
    text = `LD ${reg8[(op >> 3) & 7]},0x${hex2(b1)}`;
    size = 2;
  } else if ((op & 0xc0) === 0x40) {
    text = `LD ${reg8[(op >> 3) & 7]},${reg8[op & 7]}`;
  } else if (op === 0x3a || op === 0x32 || op === 0x2a || op === 0x22) {
    const t = imm16();
    const m = op === 0x3a ? `LD A,(0x${hex6(t)})` : op === 0x32 ? `LD (0x${hex6(t)}),A` : op === 0x2a ? `LD HL,(0x${hex6(t)})` : `LD (0x${hex6(t)}),HL`;
    text = m;
    size = 3;
    ramNote(t);
  } else if (op === 0xdb || op === 0xd3) {
    text = op === 0xdb ? `IN A,(0x${hex2(b1)})` : `OUT (0x${hex2(b1)}),A`;
    size = 2;
  } else if (op === 0xe6 || op === 0xf6 || op === 0xee || op === 0xfe || op === 0xc6 || op === 0xce || op === 0xd6 || op === 0xde) {
    const names = { 0xe6: 'AND', 0xf6: 'OR', 0xee: 'XOR', 0xfe: 'CP', 0xc6: 'ADD A,', 0xce: 'ADC A,', 0xd6: 'SUB', 0xde: 'SBC A,' };
    text = `${names[op]}0x${hex2(b1)}`;
    size = 2;
  } else if ([0x04,0x0c,0x14,0x1c,0x24,0x2c,0x34,0x3c].includes(op)) text = `INC ${reg8[(op >> 3) & 7]}`;
  else if ([0x05,0x0d,0x15,0x1d,0x25,0x2d,0x35,0x3d].includes(op)) text = `DEC ${reg8[(op >> 3) & 7]}`;
  else if ([0x03,0x13,0x23,0x33].includes(op)) text = `INC ${reg16[(op >> 4) & 3]}`;
  else if ([0x0b,0x1b,0x2b,0x3b].includes(op)) text = `DEC ${reg16[(op >> 4) & 3]}`;
  else if ([0x02,0x12].includes(op)) text = `LD (${op === 0x02 ? 'BC' : 'DE'}),A`;
  else if ([0x0a,0x1a].includes(op)) text = `LD A,(${op === 0x0a ? 'BC' : 'DE'})`;
  else if (op === 0xeb) text = 'EX DE,HL';
  else if (op === 0xe5 || op === 0xc5 || op === 0xd5 || op === 0xf5) text = `PUSH ${['BC','DE','HL','AF'][(op >> 4) & 3]}`;
  else if (op === 0xe1 || op === 0xc1 || op === 0xd1 || op === 0xf1) text = `POP ${['BC','DE','HL','AF'][(op >> 4) & 3]}`;
  else if (op === 0xaf) text = 'XOR A';
  else if (op === 0xb7) text = 'OR A';
  else if ((op & 0xf8) === 0xb0) text = `OR ${reg8[op & 7]}`;
  else if ((op & 0xf8) === 0xa0) text = `AND ${reg8[op & 7]}`;
  else if ((op & 0xf8) === 0xb8) text = `CP ${reg8[op & 7]}`;
  else if (op === 0xed) {
    size = 2;
    const ed = b1;
    if (ed === 0xb0) text = 'LDIR';
    else if (ed === 0xb8) text = 'LDDR';
    else if (ed === 0xa0) text = 'LDI';
    else if (ed === 0xa8) text = 'LDD';
    else if (ed === 0x44) text = 'NEG';
    else text = `ED $${hex2(ed)}`;
  } else if (op === 0xcb) {
    size = 2;
    const x = b1 >> 6, y = (b1 >> 3) & 7, z = b1 & 7;
    text = x === 1 ? `BIT ${y},${reg8[z]}` : x === 2 ? `RES ${y},${reg8[z]}` : x === 3 ? `SET ${y},${reg8[z]}` : `CB $${hex2(b1)}`;
  } else if (op === 0xdd || op === 0xfd) {
    const ix = op === 0xdd ? 'IX' : 'IY';
    if (b1 === 0xcb) {
      size = 4;
      const x = b3 >> 6, y = (b3 >> 3) & 7;
      const opn = x === 1 ? 'BIT' : x === 2 ? 'RES' : x === 3 ? 'SET' : 'CB';
      text = `${opn} ${y},(${ix}${s8(b2) < 0 ? '' : '+'}${s8(b2)})`;
      if (ix === 'IY') notes.push(`IY flag byte displacement 0x${hex2(b2)}`);
    } else if (b1 === 0x21) {
      size = 4;
      text = `LD ${ix},0x${hex4(b2 | (b3 << 8))}`;
    } else {
      size = 2;
      text = `${ix} prefix $${hex2(b1)}`;
    }
  }

  return { addr, size, text, notes, boundary, raw: Array.from(bytes.subarray(off, off + size)).map(hex2).join(' ') };
}

console.log('Phase 536 decode probe: OP validation cluster around 0x07FD69');
console.log(`ROM: ${romPath}`);
console.log(`Window: 0x${hex6(base)}..0x${hex6(base + length - 1)} (${length} bytes)`);
console.log('');
console.log('Known entry points:');
console.log('  0x07FD4A  zero-check gate / related OP utility');
console.log('  0x07FD62  nearby utility called from 0x080182');
console.log('  0x07FD69  target OP validation routine, caller tests Z/NZ');
console.log('  0x07FDC9  result-check / validation if reached in this window');
console.log('');
console.log('Disassembly:');

for (let off = 0; off < bytes.length;) {
  const decoded = decodeAt(off);
  const mark = focus.has(decoded.addr) ? '>>' : '  ';
  const annotation = decoded.notes.length ? ` ; ${decoded.notes.join('; ')}` : '';
  const boundary = decoded.boundary ? ' ; possible function boundary' : '';
  console.log(`${mark} ${hex6(decoded.addr)}  ${decoded.raw.padEnd(11)} ${decoded.text}${annotation}${boundary}`);
  off += Math.max(decoded.size, 1);
}

console.log('');
console.log('Analysis notes:');
console.log('- 0x07FD69 is the primary entry to inspect for flag behavior. Instructions that end in RET/JP mark candidate function boundaries.');
console.log('- CALL/JP/JR targets are annotated and in-window targets are flagged to show local control flow.');
console.log('- Absolute loads/stores into OP1/OP2 or D0xxxx RAM are annotated as RAM references.');
console.log('- A validation routine that returns Z for invalid/zero should contain a flag-producing test (OR/CP/AND/BIT/CALL result) immediately before RET or conditional RET.');
