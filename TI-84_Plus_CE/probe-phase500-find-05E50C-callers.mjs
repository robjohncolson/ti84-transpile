#!/usr/bin/env node
/**
 * probe-phase500-find-05E50C-callers.mjs
 *
 * Searches the entire 4MB ROM for CALL 0x05E50C (CD 0C E5 05) to find
 * who computes the VRAM address before calling the 16-byte store function.
 * Then disassembles the surrounding context of each caller.
 *
 * Run via: node scripts/run-probe.mjs --max-time 180 TI-84_Plus_CE/probe-phase500-find-05E50C-callers.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

// ── Helpers ────────────────────────────────────────────────────────────
function hex6(v) { return '0x' + v.toString(16).toUpperCase().padStart(6, '0'); }
function hex4(v) { return '0x' + v.toString(16).toUpperCase().padStart(4, '0'); }
function hex2(v) { return '0x' + v.toString(16).toUpperCase().padStart(2, '0'); }

function addr24At(pc) { return rom[pc] | (rom[pc+1] << 8) | (rom[pc+2] << 16); }
function signed8(v) { return v < 128 ? v : v - 256; }

// ── Target: CALL 0x05E50C -> CD 0C E5 05 ──────────────────────────────
const TARGET = [0xCD, 0x0C, 0xE5, 0x05];

console.log('=== Phase 500: Find callers of 0x05E50C (VRAM store) ===\n');
console.log(`ROM size: ${rom.length} bytes (${hex6(rom.length)})`);
console.log(`Searching for byte pattern: CD 0C E5 05 (CALL 0x05E50C)\n`);

// ── Step 1: Find all CALL matches ──────────────────────────────────────
const matches = [];
for (let i = 0; i <= rom.length - 4; i++) {
  if (rom[i] === TARGET[0] && rom[i+1] === TARGET[1] &&
      rom[i+2] === TARGET[2] && rom[i+3] === TARGET[3]) {
    matches.push(i);
  }
}

console.log(`Found ${matches.length} CALL 0x05E50C instruction(s):\n`);

// ── Step 2: Dump raw context around each match ─────────────────────────
for (const offset of matches) {
  const before = Math.max(0, offset - 40);
  const after = Math.min(rom.length, offset + 4 + 40);

  console.log(`--- Match at ROM offset ${hex6(offset)} ---`);
  let line = '  ';
  for (let i = before; i < after; i++) {
    if (i === offset) line += '[';
    line += rom[i].toString(16).toUpperCase().padStart(2, '0');
    if (i === offset + 3) line += ']';
    else if (i !== offset && i !== offset + 1 && i !== offset + 2) line += ' ';
  }
  console.log(line);
  console.log();
}

// ── Step 3: Minimal eZ80 disassembler ──────────────────────────────────
function disasmOne(pc) {
  const b0 = rom[pc];
  if (b0 === undefined) return { len: 1, text: '???' };

  const a24 = (off) => rom[pc+off] | (rom[pc+off+1] << 8) | (rom[pc+off+2] << 16);

  // Single-byte
  const singles = {
    0x00:'NOP',0x09:'ADD HL,BC',0x19:'ADD HL,DE',0x29:'ADD HL,HL',0x39:'ADD HL,SP',
    0x76:'HALT',0xC9:'RET',
    0xE5:'PUSH HL',0xD5:'PUSH DE',0xC5:'PUSH BC',0xF5:'PUSH AF',
    0xE1:'POP HL',0xD1:'POP DE',0xC1:'POP BC',0xF1:'POP AF',
    0xAF:'XOR A,A',0xA7:'AND A,A',0xB7:'OR A,A',
    0x7C:'LD A,H',0x7D:'LD A,L',0x7B:'LD A,E',0x7A:'LD A,D',
    0x78:'LD A,B',0x79:'LD A,C',
    0x67:'LD H,A',0x6F:'LD L,A',0x57:'LD D,A',0x5F:'LD E,A',
    0x47:'LD B,A',0x4F:'LD C,A',
    0x60:'LD H,B',0x61:'LD H,C',0x62:'LD H,D',0x63:'LD H,E',
    0x64:'LD H,H',0x65:'LD H,L',
    0x68:'LD L,B',0x69:'LD L,C',0x6A:'LD L,D',0x6B:'LD L,E',
    0x6C:'LD L,H',0x6D:'LD L,L',
    0x44:'LD B,H',0x45:'LD B,L',0x4C:'LD C,H',0x4D:'LD C,L',
    0x54:'LD D,H',0x55:'LD D,L',0x5C:'LD E,H',0x5D:'LD E,L',
    0x77:'LD (HL),A',0x70:'LD (HL),B',0x71:'LD (HL),C',0x72:'LD (HL),D',
    0x73:'LD (HL),E',0x74:'LD (HL),H',0x75:'LD (HL),L',
    0x7E:'LD A,(HL)',0x46:'LD B,(HL)',0x4E:'LD C,(HL)',0x56:'LD D,(HL)',
    0x5E:'LD E,(HL)',0x66:'LD H,(HL)',0x6E:'LD L,(HL)',
    0x23:'INC HL',0x2B:'DEC HL',0x13:'INC DE',0x1B:'DEC DE',
    0x03:'INC BC',0x0B:'DEC BC',
    0x3C:'INC A',0x3D:'DEC A',0x04:'INC B',0x05:'DEC B',
    0x0C:'INC C',0x0D:'DEC C',0x14:'INC D',0x15:'DEC D',
    0x1C:'INC E',0x1D:'DEC E',0x24:'INC H',0x25:'DEC H',
    0x2C:'INC L',0x2D:'DEC L',
    0x37:'SCF',0x3F:'CCF',0x17:'RLA',0x1F:'RRA',0x07:'RLCA',0x0F:'RRCA',
    0x2F:'CPL',0x27:'DAA',0xEB:'EX DE,HL',0xE3:'EX (SP),HL',
    0xD9:'EXX',0x08:'EX AF,AF\'',0xFB:'EI',0xF3:'DI',
    0x80:'ADD A,B',0x81:'ADD A,C',0x82:'ADD A,D',0x83:'ADD A,E',
    0x84:'ADD A,H',0x85:'ADD A,L',0x87:'ADD A,A',
    0x90:'SUB A,B',0x91:'SUB A,C',0x92:'SUB A,D',0x93:'SUB A,E',0x97:'SUB A,A',
    0xB8:'CP A,B',0xB9:'CP A,C',0xBA:'CP A,D',0xBB:'CP A,E',0xBE:'CP A,(HL)',
    0x0A:'LD A,(BC)',0x1A:'LD A,(DE)',0x02:'LD (BC),A',0x12:'LD (DE),A',
    0xC0:'RET NZ',0xC8:'RET Z',0xD0:'RET NC',0xD8:'RET C',
    0xC7:'RST 0x00',0xCF:'RST 0x08',0xD7:'RST 0x10',0xDF:'RST 0x18',
    0xE7:'RST 0x20',0xEF:'RST 0x28',0xF7:'RST 0x30',0xFF:'RST 0x38',
    0xE9:'JP (HL)',
  };
  if (singles[b0] !== undefined) return { len: 1, text: singles[b0] };

  // 2-byte immediate
  const imm8map = {
    0x3E:'LD A,',0x06:'LD B,',0x0E:'LD C,',0x16:'LD D,',
    0x1E:'LD E,',0x26:'LD H,',0x2E:'LD L,',
    0xC6:'ADD A,',0xD6:'SUB A,',0xE6:'AND A,',0xF6:'OR A,',
    0xEE:'XOR A,',0xFE:'CP A,',0xDB:'IN A,(',0xD3:'OUT (',
  };
  if (imm8map[b0] !== undefined) {
    if (b0 === 0xDB) return { len: 2, text: `IN A,(${hex2(rom[pc+1])})` };
    if (b0 === 0xD3) return { len: 2, text: `OUT (${hex2(rom[pc+1])}),A` };
    return { len: 2, text: `${imm8map[b0]}${hex2(rom[pc+1])}` };
  }
  if (b0 === 0x36) return { len: 2, text: `LD (HL),${hex2(rom[pc+1])}` };

  // Relative jumps
  const jrMap = { 0x18:'JR',0x20:'JR NZ,',0x28:'JR Z,',0x30:'JR NC,',0x38:'JR C,',0x10:'DJNZ' };
  if (jrMap[b0] !== undefined) {
    const d = signed8(rom[pc+1]);
    const target = pc + 2 + d;
    return { len: 2, text: `${jrMap[b0]} ${hex6(target)}` };
  }

  // 4-byte: LD rr,imm24
  if (b0 === 0x21) return { len: 4, text: `LD HL,${hex6(a24(1))}` };
  if (b0 === 0x11) return { len: 4, text: `LD DE,${hex6(a24(1))}` };
  if (b0 === 0x01) return { len: 4, text: `LD BC,${hex6(a24(1))}` };
  if (b0 === 0x31) return { len: 4, text: `LD SP,${hex6(a24(1))}` };

  // 4-byte: LD HL,(addr24) / LD (addr24),HL / LD A,(addr24) / LD (addr24),A
  if (b0 === 0x2A) return { len: 4, text: `LD HL,(${hex6(a24(1))})` };
  if (b0 === 0x22) return { len: 4, text: `LD (${hex6(a24(1))}),HL` };
  if (b0 === 0x3A) return { len: 4, text: `LD A,(${hex6(a24(1))})` };
  if (b0 === 0x32) return { len: 4, text: `LD (${hex6(a24(1))}),A` };

  // 4-byte: CALL/JP addr24
  if (b0 === 0xCD) return { len: 4, text: `CALL ${hex6(a24(1))}` };
  if (b0 === 0xC3) return { len: 4, text: `JP ${hex6(a24(1))}` };
  if (b0 === 0xC2) return { len: 4, text: `JP NZ,${hex6(a24(1))}` };
  if (b0 === 0xCA) return { len: 4, text: `JP Z,${hex6(a24(1))}` };
  if (b0 === 0xD2) return { len: 4, text: `JP NC,${hex6(a24(1))}` };
  if (b0 === 0xDA) return { len: 4, text: `JP C,${hex6(a24(1))}` };
  if (b0 === 0xC4) return { len: 4, text: `CALL NZ,${hex6(a24(1))}` };
  if (b0 === 0xCC) return { len: 4, text: `CALL Z,${hex6(a24(1))}` };
  if (b0 === 0xD4) return { len: 4, text: `CALL NC,${hex6(a24(1))}` };
  if (b0 === 0xDC) return { len: 4, text: `CALL C,${hex6(a24(1))}` };

  // CB prefix
  if (b0 === 0xCB) {
    const b1 = rom[pc+1];
    const regs = ['B','C','D','E','H','L','(HL)','A'];
    const r = regs[b1 & 7];
    if ((b1 & 0xF8) === 0x20) return { len: 2, text: `SLA ${r}` };
    if ((b1 & 0xF8) === 0x28) return { len: 2, text: `SRA ${r}` };
    if ((b1 & 0xF8) === 0x38) return { len: 2, text: `SRL ${r}` };
    if ((b1 & 0xF8) === 0x10) return { len: 2, text: `RL ${r}` };
    if ((b1 & 0xF8) === 0x18) return { len: 2, text: `RR ${r}` };
    if ((b1 & 0xF8) === 0x00) return { len: 2, text: `RLC ${r}` };
    if ((b1 & 0xF8) === 0x08) return { len: 2, text: `RRC ${r}` };
    if ((b1 & 0xC0) === 0x40) return { len: 2, text: `BIT ${(b1>>3)&7},${r}` };
    if ((b1 & 0xC0) === 0xC0) return { len: 2, text: `SET ${(b1>>3)&7},${r}` };
    if ((b1 & 0xC0) === 0x80) return { len: 2, text: `RES ${(b1>>3)&7},${r}` };
    return { len: 2, text: `CB ${hex2(b1)}` };
  }

  // ED prefix
  if (b0 === 0xED) {
    const b1 = rom[pc+1];
    const edSimple = {
      0x6C:'MLT HL',0x4C:'MLT BC',0x5C:'MLT DE',0x7C:'MLT SP',
      0x44:'NEG',0x4D:'RETI',0x45:'RETN',
      0xB0:'LDIR',0xB8:'LDDR',0xA0:'LDI',0xA8:'LDD',
      0xB1:'CPIR',0xB9:'CPDR',
      0x46:'IM 0',0x56:'IM 1',0x5E:'IM 2',
      0x47:'LD I,A',0x57:'LD A,I',0x4F:'LD R,A',0x5F:'LD A,R',
      0x67:'RRD',0x6F:'RLD',
      0x42:'SBC HL,BC',0x52:'SBC HL,DE',0x62:'SBC HL,HL',0x72:'SBC HL,SP',
      0x4A:'ADC HL,BC',0x5A:'ADC HL,DE',0x6A:'ADC HL,HL',0x7A:'ADC HL,SP',
    };
    if (edSimple[b1] !== undefined) return { len: 2, text: edSimple[b1] };
    // 5-byte ED with addr24
    if (b1 === 0x5B) return { len: 5, text: `LD DE,(${hex6(a24(2))})` };
    if (b1 === 0x4B) return { len: 5, text: `LD BC,(${hex6(a24(2))})` };
    if (b1 === 0x7B) return { len: 5, text: `LD SP,(${hex6(a24(2))})` };
    if (b1 === 0x53) return { len: 5, text: `LD (${hex6(a24(2))}),DE` };
    if (b1 === 0x43) return { len: 5, text: `LD (${hex6(a24(2))}),BC` };
    if (b1 === 0x73) return { len: 5, text: `LD (${hex6(a24(2))}),SP` };
    // IN/OUT with C
    const inRegs = {0x78:'A',0x40:'B',0x48:'C',0x50:'D',0x58:'E',0x60:'H',0x68:'L'};
    if (inRegs[b1]) return { len: 2, text: `IN ${inRegs[b1]},(C)` };
    const outRegs = {0x79:'A',0x41:'B',0x49:'C',0x51:'D',0x59:'E',0x61:'H',0x69:'L'};
    if (outRegs[b1]) return { len: 2, text: `OUT (C),${outRegs[b1]}` };
    // TST A,imm8
    if (b1 === 0x64) return { len: 3, text: `TST A,${hex2(rom[pc+2])}` };
    return { len: 2, text: `ED ${hex2(b1)}` };
  }

  // DD prefix (IX)
  if (b0 === 0xDD) {
    const b1 = rom[pc+1];
    if (b1 === 0x21) return { len: 5, text: `LD IX,${hex6(a24(2))}` };
    if (b1 === 0x2A) return { len: 5, text: `LD IX,(${hex6(a24(2))})` };
    if (b1 === 0x22) return { len: 5, text: `LD (${hex6(a24(2))}),IX` };
    if (b1 === 0xE5) return { len: 2, text: 'PUSH IX' };
    if (b1 === 0xE1) return { len: 2, text: 'POP IX' };
    if (b1 === 0x23) return { len: 2, text: 'INC IX' };
    if (b1 === 0x2B) return { len: 2, text: 'DEC IX' };
    if (b1 === 0x09) return { len: 2, text: 'ADD IX,BC' };
    if (b1 === 0x19) return { len: 2, text: 'ADD IX,DE' };
    if (b1 === 0x29) return { len: 2, text: 'ADD IX,IX' };
    if (b1 === 0x39) return { len: 2, text: 'ADD IX,SP' };
    if (b1 === 0xE9) return { len: 2, text: 'JP (IX)' };
    if (b1 === 0xF9) return { len: 2, text: 'LD SP,IX' };
    // IX+d addressing
    const ixdLoad = {0x7E:'A',0x46:'B',0x4E:'C',0x56:'D',0x5E:'E',0x66:'H',0x6E:'L'};
    if (ixdLoad[b1]) return { len: 3, text: `LD ${ixdLoad[b1]},(IX+${hex2(rom[pc+2])})` };
    const ixdStore = {0x77:'A',0x70:'B',0x71:'C',0x72:'D',0x73:'E',0x74:'H',0x75:'L'};
    if (ixdStore[b1]) return { len: 3, text: `LD (IX+${hex2(rom[pc+2])}),${ixdStore[b1]}` };
    if (b1 === 0x36) return { len: 4, text: `LD (IX+${hex2(rom[pc+2])}),${hex2(rom[pc+3])}` };
    if (b1 === 0xBE) return { len: 3, text: `CP A,(IX+${hex2(rom[pc+2])})` };
    if (b1 === 0x86) return { len: 3, text: `ADD A,(IX+${hex2(rom[pc+2])})` };
    if (b1 === 0x96) return { len: 3, text: `SUB A,(IX+${hex2(rom[pc+2])})` };
    if (b1 === 0xCB) {
      const d = rom[pc+2], b3 = rom[pc+3];
      if ((b3&0xC0)===0x40) return { len:4, text:`BIT ${(b3>>3)&7},(IX+${hex2(d)})` };
      if ((b3&0xC0)===0xC0) return { len:4, text:`SET ${(b3>>3)&7},(IX+${hex2(d)})` };
      if ((b3&0xC0)===0x80) return { len:4, text:`RES ${(b3>>3)&7},(IX+${hex2(d)})` };
      return { len: 4, text: `DD CB ${hex2(d)} ${hex2(b3)}` };
    }
    return { len: 2, text: `DD ${hex2(b1)}` };
  }

  // FD prefix (IY)
  if (b0 === 0xFD) {
    const b1 = rom[pc+1];
    if (b1 === 0x21) return { len: 5, text: `LD IY,${hex6(a24(2))}` };
    if (b1 === 0x2A) return { len: 5, text: `LD IY,(${hex6(a24(2))})` };
    if (b1 === 0x22) return { len: 5, text: `LD (${hex6(a24(2))}),IY` };
    if (b1 === 0xE5) return { len: 2, text: 'PUSH IY' };
    if (b1 === 0xE1) return { len: 2, text: 'POP IY' };
    if (b1 === 0x23) return { len: 2, text: 'INC IY' };
    if (b1 === 0x2B) return { len: 2, text: 'DEC IY' };
    if (b1 === 0x09) return { len: 2, text: 'ADD IY,BC' };
    if (b1 === 0x19) return { len: 2, text: 'ADD IY,DE' };
    if (b1 === 0x29) return { len: 2, text: 'ADD IY,IY' };
    if (b1 === 0x39) return { len: 2, text: 'ADD IY,SP' };
    if (b1 === 0xE9) return { len: 2, text: 'JP (IY)' };
    if (b1 === 0xF9) return { len: 2, text: 'LD SP,IY' };
    const iydLoad = {0x7E:'A',0x46:'B',0x4E:'C',0x56:'D',0x5E:'E',0x66:'H',0x6E:'L'};
    if (iydLoad[b1]) return { len: 3, text: `LD ${iydLoad[b1]},(IY+${hex2(rom[pc+2])})` };
    const iydStore = {0x77:'A',0x70:'B',0x71:'C',0x72:'D',0x73:'E',0x74:'H',0x75:'L'};
    if (iydStore[b1]) return { len: 3, text: `LD (IY+${hex2(rom[pc+2])}),${iydStore[b1]}` };
    if (b1 === 0x36) return { len: 4, text: `LD (IY+${hex2(rom[pc+2])}),${hex2(rom[pc+3])}` };
    return { len: 2, text: `FD ${hex2(b1)}` };
  }

  return { len: 1, text: `DB ${hex2(b0)}` };
}

/** Disassemble a range and print. Returns array of {pc, len, text}. */
function disasmRange(start, end, label) {
  console.log(`\n--- Disassembly: ${label} [${hex6(start)} .. ${hex6(end)}] ---`);
  const instrs = [];
  let pc = start;
  while (pc < end && pc < rom.length) {
    const { len, text } = disasmOne(pc);
    const bytes = [];
    for (let i = 0; i < len && pc + i < rom.length; i++) {
      bytes.push(rom[pc+i].toString(16).toUpperCase().padStart(2, '0'));
    }
    const line = `  ${hex6(pc)}  ${bytes.join(' ').padEnd(16)} ${text}`;
    console.log(line);
    instrs.push({ pc, len, text });
    pc += len;
  }
  return instrs;
}

// ── Step 4: Disassemble 0x05E50C itself for reference ──────────────────
disasmRange(0x05E50C, 0x05E50C + 20, '0x05E50C (VRAM store function)');

// ── Step 5: Disassemble context around each caller ─────────────────────
console.log('\n\n========================================================');
console.log('=== Detailed caller analysis ===');
console.log('========================================================\n');

for (const offset of matches) {
  // Disassemble 100 bytes before and 40 bytes after the CALL
  const funcStart = Math.max(0, offset - 100);
  const funcEnd = Math.min(rom.length, offset + 4 + 40);

  const instrs = disasmRange(funcStart, funcEnd, `Caller at ${hex6(offset)}`);

  // Annotate interesting patterns
  console.log(`\n  --- Pattern analysis for caller at ${hex6(offset)} ---`);

  // Check for references to key addresses in the wider region
  const searchStart = Math.max(0, offset - 300);
  const searchEnd = Math.min(rom.length, offset + 100);

  const addrPatterns = [
    { bytes: [0x95, 0x05, 0xD0], name: 'D00595 (cursor row)' },
    { bytes: [0x96, 0x05, 0xD0], name: 'D00596 (cursor col)' },
    { bytes: [0xD2, 0x08, 0xD0], name: 'D008D2 (VRAM base store)' },
    { bytes: [0xD5, 0x08, 0xD0], name: 'D008D5 (VRAM high byte)' },
    { bytes: [0xA8, 0x01, 0xD0], name: 'D001A8 (another byte)' },
    { bytes: [0x00, 0x00, 0xD4], name: 'D40000 (VRAM base)' },
    { bytes: [0x97, 0x05, 0xD0], name: 'D00597' },
    { bytes: [0x98, 0x05, 0xD0], name: 'D00598' },
    { bytes: [0x99, 0x05, 0xD0], name: 'D00599' },
    { bytes: [0xC0, 0x06, 0xD0], name: 'D006C0 (display buf)' },
  ];

  for (const pat of addrPatterns) {
    for (let i = searchStart; i < searchEnd - 2; i++) {
      if (rom[i] === pat.bytes[0] && rom[i+1] === pat.bytes[1] && rom[i+2] === pat.bytes[2]) {
        console.log(`  ** Found ${pat.name} reference at ${hex6(i)}`);
      }
    }
  }

  // Search for MLT, ADD HL,HL, ADD HL,DE nearby
  for (let i = searchStart; i < searchEnd - 1; i++) {
    if (rom[i] === 0xED && rom[i+1] === 0x6C) console.log(`  ** MLT HL at ${hex6(i)}`);
    if (rom[i] === 0xED && rom[i+1] === 0x5C) console.log(`  ** MLT DE at ${hex6(i)}`);
    if (rom[i] === 0xED && rom[i+1] === 0x4C) console.log(`  ** MLT BC at ${hex6(i)}`);
  }
  for (let i = searchStart; i < searchEnd; i++) {
    if (rom[i] === 0x29) console.log(`  ** ADD HL,HL at ${hex6(i)} (doubling)`);
  }

  console.log();
}

// ── Step 6: Search for JP 0x05E50C (C3 0C E5 05) — tail calls ─────────
console.log('\n========================================================');
console.log('=== Searching for JP 0x05E50C (tail calls) ===');
console.log('========================================================\n');

const jpTarget = [0xC3, 0x0C, 0xE5, 0x05];
const jpMatches = [];
for (let i = 0; i <= rom.length - 4; i++) {
  if (rom[i] === jpTarget[0] && rom[i+1] === jpTarget[1] &&
      rom[i+2] === jpTarget[2] && rom[i+3] === jpTarget[3]) {
    jpMatches.push(i);
  }
}
console.log(`Found ${jpMatches.length} JP 0x05E50C instruction(s):\n`);
for (const offset of jpMatches) {
  const start = Math.max(0, offset - 80);
  const end = Math.min(rom.length, offset + 4 + 20);
  disasmRange(start, end, `JP tail-call at ${hex6(offset)}`);
  console.log();
}

// ── Step 7: Wider search — who references the callers? ─────────────────
// For each direct caller, see if THAT address is itself called from somewhere
console.log('\n========================================================');
console.log('=== Tracing back: who calls the callers? ===');
console.log('========================================================\n');

const allCallSites = [...matches, ...jpMatches];
for (const site of allCallSites) {
  // Find the function start by scanning backward for a RET/RETI/RETN or known boundary
  let funcStart = site;
  for (let i = site - 1; i >= Math.max(0, site - 200); i--) {
    if (rom[i] === 0xC9) { funcStart = i + 1; break; }
    if (rom[i] === 0xED && rom[i+1] === 0x4D) { funcStart = i + 2; break; }  // RETI
    if (rom[i] === 0xED && rom[i+1] === 0x45) { funcStart = i + 2; break; }  // RETN
  }

  // Search ROM for CALL <funcStart>
  const target = [0xCD, funcStart & 0xFF, (funcStart >> 8) & 0xFF, (funcStart >> 16) & 0xFF];
  const callers = [];
  for (let i = 0; i <= rom.length - 4; i++) {
    if (rom[i] === target[0] && rom[i+1] === target[1] &&
        rom[i+2] === target[2] && rom[i+3] === target[3]) {
      callers.push(i);
    }
  }

  if (callers.length > 0) {
    console.log(`Function at ${hex6(funcStart)} (contains ${site === matches[0] ? 'CALL' : 'JP'} 0x05E50C at ${hex6(site)}):`);
    console.log(`  Called from ${callers.length} site(s): ${callers.map(hex6).join(', ')}`);

    // For each parent caller, disassemble a small window
    for (const parentCall of callers.slice(0, 5)) {  // limit to first 5
      disasmRange(Math.max(0, parentCall - 40), Math.min(rom.length, parentCall + 4 + 20),
        `Parent caller at ${hex6(parentCall)} -> CALL ${hex6(funcStart)}`);
    }
    console.log();
  }
}

// ── Step 8: Summary ────────────────────────────────────────────────────
console.log('\n========================================================');
console.log('=== SUMMARY ===');
console.log('========================================================\n');
console.log(`Total CALL 0x05E50C: ${matches.length}`);
console.log(`Total JP 0x05E50C:   ${jpMatches.length}`);
for (const m of matches) console.log(`  CALL at ${hex6(m)}`);
for (const m of jpMatches) console.log(`  JP   at ${hex6(m)}`);
console.log('\nKey question: which caller reads D00595/D00596 (cursor row/col)');
console.log('and computes HL = VRAM_BASE + row*stride + col*glyphWidth*2 ?');

// ── Step 9: No direct CALL/JP found — check fall-through ──────────────
// 0x05E50C pops HL twice, so it's reached after someone PUSHes values
// and falls through or jumps into it. Disassemble a wide region before it.
console.log('\n========================================================');
console.log('=== Fall-through analysis: code BEFORE 0x05E50C ===');
console.log('========================================================\n');
console.log('0x05E50C has no CALL/JP references — it is reached by fall-through.');
console.log('Disassembling 300 bytes before 0x05E50C to find the function that falls into it:\n');

disasmRange(0x05E50C - 300, 0x05E50C + 30, 'Region leading into 0x05E50C');

// ── Step 10: Find who CALLs the function that CONTAINS 0x05E50C ────────
// Scan backward from 0x05E50C to find the function entry (after a RET)
console.log('\n\n========================================================');
console.log('=== Finding the enclosing function of 0x05E50C ===');
console.log('========================================================\n');

let enclosingStart = 0x05E50C;
for (let i = 0x05E50C - 1; i >= Math.max(0, 0x05E50C - 500); i--) {
  if (rom[i] === 0xC9) {
    enclosingStart = i + 1;
    break;
  }
}
console.log(`Enclosing function likely starts at: ${hex6(enclosingStart)}`);
console.log('(First byte after previous RET)\n');

// Disassemble from function start through 0x05E50C
disasmRange(enclosingStart, 0x05E50C + 30, `Enclosing function ${hex6(enclosingStart)}`);

// Now search for CALL/JP to the enclosing function
console.log(`\nSearching for CALL ${hex6(enclosingStart)}...`);
const encTarget = [0xCD, enclosingStart & 0xFF, (enclosingStart >> 8) & 0xFF, (enclosingStart >> 16) & 0xFF];
const encCallMatches = [];
for (let i = 0; i <= rom.length - 4; i++) {
  if (rom[i] === encTarget[0] && rom[i+1] === encTarget[1] &&
      rom[i+2] === encTarget[2] && rom[i+3] === encTarget[3]) {
    encCallMatches.push(i);
  }
}
console.log(`Found ${encCallMatches.length} CALL ${hex6(enclosingStart)} site(s)`);
for (const site of encCallMatches.slice(0, 10)) {
  disasmRange(Math.max(0, site - 60), Math.min(rom.length, site + 4 + 20),
    `Caller of ${hex6(enclosingStart)} at ${hex6(site)}`);
}

// Also search for JP to enclosing start
console.log(`\nSearching for JP ${hex6(enclosingStart)}...`);
const encJpTarget = [0xC3, enclosingStart & 0xFF, (enclosingStart >> 8) & 0xFF, (enclosingStart >> 16) & 0xFF];
const encJpMatches = [];
for (let i = 0; i <= rom.length - 4; i++) {
  if (rom[i] === encJpTarget[0] && rom[i+1] === encJpTarget[1] &&
      rom[i+2] === encJpTarget[2] && rom[i+3] === encJpTarget[3]) {
    encJpMatches.push(i);
  }
}
console.log(`Found ${encJpMatches.length} JP ${hex6(enclosingStart)} site(s)`);
for (const site of encJpMatches.slice(0, 10)) {
  disasmRange(Math.max(0, site - 60), Math.min(rom.length, site + 4 + 20),
    `JP-caller of ${hex6(enclosingStart)} at ${hex6(site)}`);
}

// ── Step 11: Also check addresses that reference D008D2 directly ───────
console.log('\n\n========================================================');
console.log('=== Who else reads D008D2 (VRAM base address)? ===');
console.log('========================================================\n');
console.log('Looking for LD HL,(D008D2) = 2A D2 08 D0...\n');
const readD2 = [0x2A, 0xD2, 0x08, 0xD0];
for (let i = 0; i <= rom.length - 4; i++) {
  if (rom[i] === readD2[0] && rom[i+1] === readD2[1] &&
      rom[i+2] === readD2[2] && rom[i+3] === readD2[3]) {
    console.log(`LD HL,(D008D2) at ${hex6(i)}`);
    disasmRange(Math.max(0, i - 20), Math.min(rom.length, i + 30), `Reader of D008D2 at ${hex6(i)}`);
  }
}

// Also check LD DE,(D008D2) = ED 5B D2 08 D0
console.log('\nLooking for LD DE,(D008D2) = ED 5B D2 08 D0...\n');
for (let i = 0; i <= rom.length - 5; i++) {
  if (rom[i] === 0xED && rom[i+1] === 0x5B && rom[i+2] === 0xD2 &&
      rom[i+3] === 0x08 && rom[i+4] === 0xD0) {
    console.log(`LD DE,(D008D2) at ${hex6(i)}`);
    disasmRange(Math.max(0, i - 20), Math.min(rom.length, i + 30), `Reader of D008D2 at ${hex6(i)}`);
  }
}

// ── Step 12: Who writes D008D2 besides 0x05E50C? ──────────────────────
console.log('\n\n========================================================');
console.log('=== Who writes LD (D008D2),HL = 22 D2 08 D0? ===');
console.log('========================================================\n');
const writeD2 = [0x22, 0xD2, 0x08, 0xD0];
for (let i = 0; i <= rom.length - 4; i++) {
  if (rom[i] === writeD2[0] && rom[i+1] === writeD2[1] &&
      rom[i+2] === writeD2[2] && rom[i+3] === writeD2[3]) {
    console.log(`LD (D008D2),HL at ${hex6(i)}`);
    if (i !== 0x05E50C) {
      disasmRange(Math.max(0, i - 40), Math.min(rom.length, i + 30),
        `ANOTHER writer of D008D2 at ${hex6(i)}`);
    } else {
      console.log('  (this is 0x05E50C itself)');
    }
  }
}

// ── Step 13: Disassemble 0x0264B1 — the function called right before fall-through ──
console.log('\n\n========================================================');
console.log('=== 0x0264B1 — called at 0x05E507, right before 0x05E50C ===');
console.log('=== This is likely where cursor row/col -> VRAM addr happens ===');
console.log('========================================================\n');

disasmRange(0x0264B1, 0x0264B1 + 200, '0x0264B1 (VRAM address computation?)');

// Also disassemble 0x0262C0 and 0x02622C which are called nearby
console.log('\n--- 0x0262C0 (called at 0x05E476) ---');
disasmRange(0x0262C0, 0x0262C0 + 100, '0x0262C0');

console.log('\n--- 0x02622C (called at 0x05E47B) ---');
disasmRange(0x02622C, 0x02622C + 100, '0x02622C');

// ── Step 14: Search for who CALLs 0x0264B1 ────────────────────────────
console.log('\n\n========================================================');
console.log('=== Who calls 0x0264B1? ===');
console.log('========================================================\n');
const call64B1 = [0xCD, 0xB1, 0x64, 0x02];
for (let i = 0; i <= rom.length - 4; i++) {
  if (rom[i] === call64B1[0] && rom[i+1] === call64B1[1] &&
      rom[i+2] === call64B1[2] && rom[i+3] === call64B1[3]) {
    console.log(`CALL 0x0264B1 at ${hex6(i)}`);
    disasmRange(Math.max(0, i - 30), Math.min(rom.length, i + 4 + 20),
      `Caller of 0x0264B1 at ${hex6(i)}`);
  }
}

// ── Step 15: Full picture of the 0x05E4F2 function ────────────────────
console.log('\n\n========================================================');
console.log('=== ANALYSIS: The 0x05E4F2 function (save/restore around 0x0264B1) ===');
console.log('========================================================\n');
console.log('0x05E4F2:');
console.log('  FD CB ...         ; (prefix bytes, likely BIT test on IY flags)');
console.log('  LD A,(D001A8)     ; save current value of D001A8');
console.log('  PUSH AF           ; push old D001A8 on stack');
console.log('  LD HL,(D008D2)    ; save current VRAM base');
console.log('  LD A,(D008D5)     ; save current VRAM high byte');
console.log('  PUSH AF           ; push old D008D5');
console.log('  PUSH HL           ; push old D008D2');
console.log('  CALL 0x0264B1     ; <-- THE KEY FUNCTION: recomputes VRAM address');
console.log('  POP HL            ; restore old D008D2');
console.log('  LD (D008D2),HL    ; <-- THIS IS 0x05E50C: writes it back');
console.log('  POP HL            ; restore old D008D5 (in H)');
console.log('  LD A,H');
console.log('  LD (D008D5),A     ; write it back');
console.log('  POP HL            ; restore old D001A8 (in H)');
console.log('  LD A,H');
console.log('  LD (D001A8),A     ; write it back');
console.log('  RET');
console.log('');
console.log('CONCLUSION: 0x05E50C is NOT a "store pre-computed VRAM address" function.');
console.log('It is the RESTORE portion of a save/restore wrapper around CALL 0x0264B1.');
console.log('The ACTUAL VRAM address computation is in 0x0264B1.');
console.log('');
console.log('The function at 0x05E4F2 saves D008D2/D008D5/D001A8, calls 0x0264B1');
console.log('(which presumably updates those locations with new values), then');
console.log('restores the old values. This is a "temporarily change VRAM state" pattern.');

// ── Step 16: Check the D008D2 writers in 0x081F34 region ──────────────
console.log('\n\n========================================================');
console.log('=== 0x081F34 — direct VRAM address setup ===');
console.log('========================================================\n');
console.log('At 0x081F34: LD HL,0x000006 then LD (D008D2),HL');
console.log('This sets D008D2 = 6. Combined with D008D5 = 0x38 (set at 0x081F3C)');
console.log('This means VRAM offset = D008D5 * 0x10000 + D008D2');
console.log('= 0x38 * 0x10000 + 0x06 = 0x380006');
console.log('But wait — D008D5 is stored as a single byte (high byte).');
console.log('So the full VRAM address might be constructed as:');
console.log('  addr = (D008D5 << 16) | (D008D2 & 0xFFFF)  — NO, D008D2 is 24-bit via LD HL,(...)');
console.log('Actually D008D2 holds a 24-bit value (3 bytes at D008D2,D008D3,D008D4)');
console.log('and D008D5 holds just one more byte.');
console.log('');
console.log('In 0x087FB1: LD HL,0x0000EC; LD (D008D2),HL -> D008D2 = 0x0000EC');
console.log('  with D008D5 = 0xA4 (set at 0x087FA9)');
console.log('In 0x087FC7: LD HL,0x0000EC; LD (D008D2),HL -> D008D2 = 0x0000EC');
console.log('  with D008D5 = 0xB8 (set at 0x087FBD)');

console.log('\nDone.');
