import fs from 'node:fs';
import path from 'node:path';

const ROM_PATH = path.join('TI-84_Plus_CE', 'ROM.rom');
const START = 0x069e5e;
const MAIN_LIMIT = 0x200;
const SUB_LIMIT = 0x80;
const rom = fs.readFileSync(ROM_PATH);

const hex2 = n => n.toString(16).toUpperCase().padStart(2, '0');
const hex6 = n => `0x${n.toString(16).toUpperCase().padStart(6, '0')}`;
const rel = n => (n << 24) >> 24;
const b = addr => rom[addr] ?? 0;
const u16 = addr => b(addr) | (b(addr + 1) << 8);
const u24 = addr => b(addr) | (b(addr + 1) << 8) | (b(addr + 2) << 16);
const bytes = (addr, len) => Array.from(rom.slice(addr, addr + len), hex2).join(' ');

const calls = new Set();
const jumps = new Set();
const ramReads = new Set();
const ramWrites = new Set();
const carryEvents = [];

function isLikelyRam(addr) {
  return addr >= 0xD00000 || (addr >= 0xD000 && addr <= 0xFFFF);
}

function noteAddr(kind, addr) {
  if (isLikelyRam(addr)) {
    (kind === 'read' ? ramReads : ramWrites).add(addr);
  }
}

function decode(addr) {
  const op = b(addr);
  const op1 = b(addr + 1);

  if (op === 0x40) {
    const sub = decodeSis(addr);
    return { ...sub, text: `${sub.text}`, sis: true };
  }

  if (op === 0xdd || op === 0xfd) {
    return decodeIndex(addr, op === 0xdd ? 'IX' : 'IY');
  }

  if (op === 0xed) {
    return decodeEd(addr, op1);
  }

  if (op === 0xcb) {
    return decodeCb(addr);
  }

  const imm24 = u24(addr + 1);
  const d8 = b(addr + 1);
  const jrTarget = (addr + 2 + rel(d8)) & 0xffffff;

  switch (op) {
    case 0x00: return { len: 1, text: 'NOP' };
    case 0x01: return { len: 4, text: `LD BC,${hex6(imm24)}` };
    case 0x06: return { len: 2, text: `LD B,0x${hex2(d8)}` };
    case 0x0e: return { len: 2, text: `LD C,0x${hex2(d8)}` };
    case 0x11: return { len: 4, text: `LD DE,${hex6(imm24)}` };
    case 0x16: return { len: 2, text: `LD D,0x${hex2(d8)}` };
    case 0x1e: return { len: 2, text: `LD E,0x${hex2(d8)}` };
    case 0x21: return { len: 4, text: `LD HL,${hex6(imm24)}` };
    case 0x26: return { len: 2, text: `LD H,0x${hex2(d8)}` };
    case 0x2e: return { len: 2, text: `LD L,0x${hex2(d8)}` };
    case 0x31: return { len: 4, text: `LD SP,${hex6(imm24)}` };
    case 0x3e: return { len: 2, text: `LD A,0x${hex2(d8)}` };
    case 0x02: return { len: 1, text: 'LD (BC),A' };
    case 0x0a: return { len: 1, text: 'LD A,(BC)' };
    case 0x12: return { len: 1, text: 'LD (DE),A' };
    case 0x1a: return { len: 1, text: 'LD A,(DE)' };
    case 0x22: noteAddr('write', imm24); return { len: 4, text: `LD (${hex6(imm24)}),HL` };
    case 0x2a: noteAddr('read', imm24); return { len: 4, text: `LD HL,(${hex6(imm24)})` };
    case 0x32: noteAddr('write', imm24); return { len: 4, text: `LD (${hex6(imm24)}),A` };
    case 0x3a: noteAddr('read', imm24); return { len: 4, text: `LD A,(${hex6(imm24)})` };
    case 0x04: return { len: 1, text: 'INC B' };
    case 0x05: return { len: 1, text: 'DEC B' };
    case 0x0c: return { len: 1, text: 'INC C' };
    case 0x0d: return { len: 1, text: 'DEC C' };
    case 0x14: return { len: 1, text: 'INC D' };
    case 0x15: return { len: 1, text: 'DEC D' };
    case 0x1c: return { len: 1, text: 'INC E' };
    case 0x1d: return { len: 1, text: 'DEC E' };
    case 0x24: return { len: 1, text: 'INC H' };
    case 0x25: return { len: 1, text: 'DEC H' };
    case 0x2c: return { len: 1, text: 'INC L' };
    case 0x2d: return { len: 1, text: 'DEC L' };
    case 0x34: return { len: 1, text: 'INC (HL)' };
    case 0x35: return { len: 1, text: 'DEC (HL)' };
    case 0x3c: return { len: 1, text: 'INC A' };
    case 0x3d: return { len: 1, text: 'DEC A' };
    case 0x13: return { len: 1, text: 'INC DE' };
    case 0x1b: return { len: 1, text: 'DEC DE' };
    case 0x23: return { len: 1, text: 'INC HL' };
    case 0x2b: return { len: 1, text: 'DEC HL' };
    case 0x33: return { len: 1, text: 'INC SP' };
    case 0x3b: return { len: 1, text: 'DEC SP' };
    case 0x03: return { len: 1, text: 'INC BC' };
    case 0x0b: return { len: 1, text: 'DEC BC' };
    case 0x09: return { len: 1, text: 'ADD HL,BC' };
    case 0x19: return { len: 1, text: 'ADD HL,DE' };
    case 0x29: return { len: 1, text: 'ADD HL,HL' };
    case 0x39: return { len: 1, text: 'ADD HL,SP' };
    case 0x36: return { len: 2, text: `LD (HL),0x${hex2(d8)}` };
    case 0x76: return { len: 1, text: 'HALT' };
    case 0x7e: return { len: 1, text: 'LD A,(HL)' };
    case 0x77: return { len: 1, text: 'LD (HL),A' };
    case 0x46: return { len: 1, text: 'LD B,(HL)' };
    case 0x4e: return { len: 1, text: 'LD C,(HL)' };
    case 0x56: return { len: 1, text: 'LD D,(HL)' };
    case 0x5e: return { len: 1, text: 'LD E,(HL)' };
    case 0x66: return { len: 1, text: 'LD H,(HL)' };
    case 0x6e: return { len: 1, text: 'LD L,(HL)' };
    case 0x70: return { len: 1, text: 'LD (HL),B' };
    case 0x71: return { len: 1, text: 'LD (HL),C' };
    case 0x72: return { len: 1, text: 'LD (HL),D' };
    case 0x73: return { len: 1, text: 'LD (HL),E' };
    case 0x74: return { len: 1, text: 'LD (HL),H' };
    case 0x75: return { len: 1, text: 'LD (HL),L' };
    case 0xaf: return { len: 1, text: 'XOR A ; clears carry', carry: 'clear' };
    case 0xb7: return { len: 1, text: 'OR A ; clears carry', carry: 'clear' };
    case 0xbf: return { len: 1, text: 'CP A' };
    case 0xc1: return { len: 1, text: 'POP BC' };
    case 0xc5: return { len: 1, text: 'PUSH BC' };
    case 0xc9: return { len: 1, text: 'RET', stop: true };
    case 0xcd: calls.add(imm24); return { len: 4, text: `CALL ${hex6(imm24)}` };
    case 0xd1: return { len: 1, text: 'POP DE' };
    case 0xd5: return { len: 1, text: 'PUSH DE' };
    case 0xe1: return { len: 1, text: 'POP HL' };
    case 0xe5: return { len: 1, text: 'PUSH HL' };
    case 0xf1: return { len: 1, text: 'POP AF' };
    case 0xf5: return { len: 1, text: 'PUSH AF' };
    case 0xf9: return { len: 1, text: 'LD SP,HL' };
    case 0xeb: return { len: 1, text: 'EX DE,HL' };
    case 0xd9: return { len: 1, text: 'EXX' };
    case 0x08: return { len: 1, text: "EX AF,AF'" };
    case 0x07: return { len: 1, text: 'RLCA' };
    case 0x0f: return { len: 1, text: 'RRCA' };
    case 0x17: return { len: 1, text: 'RLA' };
    case 0x1f: return { len: 1, text: 'RRA' };
    case 0x27: return { len: 1, text: 'DAA' };
    case 0x2f: return { len: 1, text: 'CPL' };
    case 0xc3: jumps.add(imm24); return { len: 4, text: `JP ${hex6(imm24)} ; tail/exit`, stop: true };
    case 0xc2: jumps.add(imm24); return { len: 4, text: `JP NZ,${hex6(imm24)}` };
    case 0xca: jumps.add(imm24); return { len: 4, text: `JP Z,${hex6(imm24)}` };
    case 0xd2: jumps.add(imm24); return { len: 4, text: `JP NC,${hex6(imm24)}` };
    case 0xda: jumps.add(imm24); return { len: 4, text: `JP C,${hex6(imm24)}` };
    case 0xe2: jumps.add(imm24); return { len: 4, text: `JP PO,${hex6(imm24)}` };
    case 0xea: jumps.add(imm24); return { len: 4, text: `JP PE,${hex6(imm24)}` };
    case 0xf2: jumps.add(imm24); return { len: 4, text: `JP P,${hex6(imm24)}` };
    case 0xfa: jumps.add(imm24); return { len: 4, text: `JP M,${hex6(imm24)}` };
    case 0x10: jumps.add(jrTarget); return { len: 2, text: `DJNZ ${hex6(jrTarget)}` };
    case 0x18: jumps.add(jrTarget); return { len: 2, text: `JR ${hex6(jrTarget)}` };
    case 0x20: jumps.add(jrTarget); return { len: 2, text: `JR NZ,${hex6(jrTarget)}` };
    case 0x28: jumps.add(jrTarget); return { len: 2, text: `JR Z,${hex6(jrTarget)}` };
    case 0x30: jumps.add(jrTarget); return { len: 2, text: `JR NC,${hex6(jrTarget)}` };
    case 0x38: jumps.add(jrTarget); return { len: 2, text: `JR C,${hex6(jrTarget)}` };
    case 0xc0: return { len: 1, text: 'RET NZ', stop: true };
    case 0xc8: return { len: 1, text: 'RET Z', stop: true };
    case 0xd0: return { len: 1, text: 'RET NC', stop: true };
    case 0xd8: return { len: 1, text: 'RET C', stop: true };
    case 0xe0: return { len: 1, text: 'RET PO', stop: true };
    case 0xe8: return { len: 1, text: 'RET PE', stop: true };
    case 0xf0: return { len: 1, text: 'RET P', stop: true };
    case 0xf8: return { len: 1, text: 'RET M', stop: true };
    case 0xc4: calls.add(imm24); return { len: 4, text: `CALL NZ,${hex6(imm24)}` };
    case 0xcc: calls.add(imm24); return { len: 4, text: `CALL Z,${hex6(imm24)}` };
    case 0xd4: calls.add(imm24); return { len: 4, text: `CALL NC,${hex6(imm24)}` };
    case 0xdc: calls.add(imm24); return { len: 4, text: `CALL C,${hex6(imm24)}` };
    case 0x37: return { len: 1, text: 'SCF ; sets carry', carry: 'set' };
    case 0x3f: return { len: 1, text: 'CCF ; toggles carry', carry: 'toggle' };
    case 0xc6: return { len: 2, text: `ADD A,0x${hex2(d8)}` };
    case 0xce: return { len: 2, text: `ADC A,0x${hex2(d8)}` };
    case 0xd6: return { len: 2, text: `SUB 0x${hex2(d8)}` };
    case 0xde: return { len: 2, text: `SBC A,0x${hex2(d8)}` };
    case 0xe6: return { len: 2, text: `AND 0x${hex2(d8)} ; clears carry`, carry: 'clear' };
    case 0xee: return { len: 2, text: `XOR 0x${hex2(d8)} ; clears carry`, carry: 'clear' };
    case 0xf6: return { len: 2, text: `OR 0x${hex2(d8)} ; clears carry`, carry: 'clear' };
    case 0xfe: return { len: 2, text: `CP 0x${hex2(d8)}` };
    case 0xe3: return { len: 1, text: 'EX (SP),HL' };
    case 0xf3: return { len: 1, text: 'DI' };
    case 0xfb: return { len: 1, text: 'EI' };
    default:
      if (op >= 0x40 && op <= 0x7f) return { len: 1, text: ldRegText(op) };
      if (op >= 0x80 && op <= 0xbf) return { len: 1, text: aluText(op) };
      return { len: 1, text: `DB 0x${hex2(op)} ; unknown` };
  }
}

function decodeEd(addr, op1) {
  const edOps = {
    0x42: 'SBC HL,BC', 0x52: 'SBC HL,DE', 0x62: 'SBC HL,HL', 0x72: 'SBC HL,SP',
    0x4a: 'ADC HL,BC', 0x5a: 'ADC HL,DE', 0x6a: 'ADC HL,HL', 0x7a: 'ADC HL,SP',
    0x44: 'NEG', 0x4d: 'RETI', 0x45: 'RETN',
    0x46: 'IM 0', 0x56: 'IM 1', 0x5e: 'IM 2',
    0x47: 'LD I,A', 0x4f: 'LD R,A', 0x57: 'LD A,I', 0x5f: 'LD A,R',
    0x67: 'RRD', 0x6f: 'RLD',
    0xa0: 'LDI', 0xa8: 'LDD', 0xb0: 'LDIR', 0xb8: 'LDDR',
    0xa1: 'CPI', 0xa9: 'CPD', 0xb1: 'CPIR', 0xb9: 'CPDR',
    0xa2: 'INI', 0xaa: 'IND', 0xb2: 'INIR', 0xba: 'INDR',
    0xa3: 'OUTI', 0xab: 'OUTD', 0xb3: 'OTIR', 0xbb: 'OTDR',
  };
  if (op1 === 0x43) { const a = u24(addr + 2); noteAddr('write', a); return { len: 5, text: `LD (${hex6(a)}),BC` }; }
  if (op1 === 0x4b) { const a = u24(addr + 2); noteAddr('read', a); return { len: 5, text: `LD BC,(${hex6(a)})` }; }
  if (op1 === 0x53) { const a = u24(addr + 2); noteAddr('write', a); return { len: 5, text: `LD (${hex6(a)}),DE` }; }
  if (op1 === 0x5b) { const a = u24(addr + 2); noteAddr('read', a); return { len: 5, text: `LD DE,(${hex6(a)})` }; }
  if (op1 === 0x63) { const a = u24(addr + 2); noteAddr('write', a); return { len: 5, text: `LD (${hex6(a)}),HL` }; }
  if (op1 === 0x6b) { const a = u24(addr + 2); noteAddr('read', a); return { len: 5, text: `LD HL,(${hex6(a)})` }; }
  if (op1 === 0x73) { const a = u24(addr + 2); noteAddr('write', a); return { len: 5, text: `LD (${hex6(a)}),SP` }; }
  if (op1 === 0x7b) { const a = u24(addr + 2); noteAddr('read', a); return { len: 5, text: `LD SP,(${hex6(a)})` }; }
  if (op1 === 0x78) return { len: 2, text: 'IN A,(C)' };
  if (op1 === 0x40) return { len: 2, text: 'IN B,(C)' };
  if (op1 === 0x48) return { len: 2, text: 'IN C,(C)' };
  if (op1 === 0x50) return { len: 2, text: 'IN D,(C)' };
  if (op1 === 0x58) return { len: 2, text: 'IN E,(C)' };
  if (op1 === 0x60) return { len: 2, text: 'IN H,(C)' };
  if (op1 === 0x68) return { len: 2, text: 'IN L,(C)' };
  if (op1 === 0x79) return { len: 2, text: 'OUT (C),A' };
  if (op1 === 0x41) return { len: 2, text: 'OUT (C),B' };
  if (op1 === 0x49) return { len: 2, text: 'OUT (C),C' };
  if (op1 === 0x51) return { len: 2, text: 'OUT (C),D' };
  if (op1 === 0x59) return { len: 2, text: 'OUT (C),E' };
  if (op1 === 0x61) return { len: 2, text: 'OUT (C),H' };
  if (op1 === 0x69) return { len: 2, text: 'OUT (C),L' };
  if (op1 === 0x4c) return { len: 2, text: 'MLT BC' };
  if (op1 === 0x5c) return { len: 2, text: 'MLT DE' };
  if (op1 === 0x6c) return { len: 2, text: 'MLT HL' };
  if (op1 === 0x7c) return { len: 2, text: 'MLT SP' };
  const text = edOps[op1];
  if (text) {
    const result = { len: 2, text };
    if (op1 === 0x45 || op1 === 0x4d) result.stop = true;
    return result;
  }
  return { len: 2, text: `ED ${hex2(op1)}` };
}

function decodeCb(addr) {
  const op1 = b(addr + 1);
  const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  const r = regs[op1 & 7];
  const bit = (op1 >> 3) & 7;
  if (op1 < 0x08) return { len: 2, text: `RLC ${r}` };
  if (op1 < 0x10) return { len: 2, text: `RRC ${r}` };
  if (op1 < 0x18) return { len: 2, text: `RL ${r}` };
  if (op1 < 0x20) return { len: 2, text: `RR ${r}` };
  if (op1 < 0x28) return { len: 2, text: `SLA ${r}` };
  if (op1 < 0x30) return { len: 2, text: `SRA ${r}` };
  if (op1 < 0x38) return { len: 2, text: `SLL ${r}` };
  if (op1 < 0x40) return { len: 2, text: `SRL ${r}` };
  if (op1 < 0x80) return { len: 2, text: `BIT ${bit},${r}` };
  if (op1 < 0xc0) return { len: 2, text: `RES ${bit},${r}` };
  return { len: 2, text: `SET ${bit},${r}` };
}

function decodeSis(addr) {
  const op = b(addr + 1);
  const imm = u16(addr + 2);
  if (op === 0x21) return { len: 4, text: `.SIS LD HL,0x${imm.toString(16).toUpperCase().padStart(4, '0')}` };
  if (op === 0x11) return { len: 4, text: `.SIS LD DE,0x${imm.toString(16).toUpperCase().padStart(4, '0')}` };
  if (op === 0x01) return { len: 4, text: `.SIS LD BC,0x${imm.toString(16).toUpperCase().padStart(4, '0')}` };
  if (op === 0x2a) return { len: 4, text: `.SIS LD HL,(0x${imm.toString(16).toUpperCase().padStart(4, '0')})` };
  if (op === 0x22) return { len: 4, text: `.SIS LD (0x${imm.toString(16).toUpperCase().padStart(4, '0')}),HL` };
  if (op === 0xcd) { const t = u16(addr + 2); calls.add(t); return { len: 4, text: `.SIS CALL 0x${t.toString(16).toUpperCase().padStart(4, '0')}` }; }
  if (op === 0xc3) { const t = u16(addr + 2); jumps.add(t); return { len: 4, text: `.SIS JP 0x${t.toString(16).toUpperCase().padStart(4, '0')}`, stop: true }; }
  return { len: 2, text: `.SIS ${hex2(op)}` };
}

function decodeIndex(addr, reg) {
  const op = b(addr + 1);
  if (op === 0xe5) return { len: 2, text: `PUSH ${reg}` };
  if (op === 0xe1) return { len: 2, text: `POP ${reg}` };
  if (op === 0x21) return { len: 5, text: `LD ${reg},${hex6(u24(addr + 2))}` };
  if (op === 0x22) {
    const a = u24(addr + 2);
    noteAddr('write', a);
    return { len: 5, text: `LD (${hex6(a)}),${reg}` };
  }
  if (op === 0x2a) {
    const a = u24(addr + 2);
    noteAddr('read', a);
    return { len: 5, text: `LD ${reg},(${hex6(a)})` };
  }
  if (op === 0x09) return { len: 2, text: `ADD ${reg},BC` };
  if (op === 0x19) return { len: 2, text: `ADD ${reg},DE` };
  if (op === 0x29) return { len: 2, text: `ADD ${reg},${reg}` };
  if (op === 0x39) return { len: 2, text: `ADD ${reg},SP` };
  if (op === 0x23) return { len: 2, text: `INC ${reg}` };
  if (op === 0x2b) return { len: 2, text: `DEC ${reg}` };
  if (op === 0xcb) {
    const disp = rel(b(addr + 2));
    const cb = b(addr + 3);
    const bit = (cb >> 3) & 7;
    if ((cb & 0xc7) === 0x46) return { len: 4, text: `BIT ${bit},(${reg}${dispText(disp)})` };
    if ((cb & 0xc7) === 0x86) return { len: 4, text: `RES ${bit},(${reg}${dispText(disp)})` };
    if ((cb & 0xc7) === 0xc6) return { len: 4, text: `SET ${bit},(${reg}${dispText(disp)})` };
    return { len: 4, text: `${reg}+CB ${hex2(cb)} disp=${disp}` };
  }
  if (op === 0x7e) return { len: 3, text: `LD A,(${reg}${dispText(rel(b(addr + 2)))})` };
  if (op === 0x77) return { len: 3, text: `LD (${reg}${dispText(rel(b(addr + 2)))}),A` };
  if (op === 0x46) return { len: 3, text: `LD B,(${reg}${dispText(rel(b(addr + 2)))})` };
  if (op === 0x4e) return { len: 3, text: `LD C,(${reg}${dispText(rel(b(addr + 2)))})` };
  if (op === 0x56) return { len: 3, text: `LD D,(${reg}${dispText(rel(b(addr + 2)))})` };
  if (op === 0x5e) return { len: 3, text: `LD E,(${reg}${dispText(rel(b(addr + 2)))})` };
  if (op === 0x66) return { len: 3, text: `LD H,(${reg}${dispText(rel(b(addr + 2)))})` };
  if (op === 0x6e) return { len: 3, text: `LD L,(${reg}${dispText(rel(b(addr + 2)))})` };
  if (op === 0x70) return { len: 3, text: `LD (${reg}${dispText(rel(b(addr + 2)))}),B` };
  if (op === 0x71) return { len: 3, text: `LD (${reg}${dispText(rel(b(addr + 2)))}),C` };
  if (op === 0x72) return { len: 3, text: `LD (${reg}${dispText(rel(b(addr + 2)))}),D` };
  if (op === 0x73) return { len: 3, text: `LD (${reg}${dispText(rel(b(addr + 2)))}),E` };
  if (op === 0x74) return { len: 3, text: `LD (${reg}${dispText(rel(b(addr + 2)))}),H` };
  if (op === 0x75) return { len: 3, text: `LD (${reg}${dispText(rel(b(addr + 2)))}),L` };
  if (op === 0x36) return { len: 4, text: `LD (${reg}${dispText(rel(b(addr + 2)))}),0x${hex2(b(addr + 3))}` };
  if (op === 0x34) return { len: 3, text: `INC (${reg}${dispText(rel(b(addr + 2)))})` };
  if (op === 0x35) return { len: 3, text: `DEC (${reg}${dispText(rel(b(addr + 2)))})` };
  if (op === 0x86) return { len: 3, text: `ADD A,(${reg}${dispText(rel(b(addr + 2)))})` };
  if (op === 0x8e) return { len: 3, text: `ADC A,(${reg}${dispText(rel(b(addr + 2)))})` };
  if (op === 0x96) return { len: 3, text: `SUB (${reg}${dispText(rel(b(addr + 2)))})` };
  if (op === 0x9e) return { len: 3, text: `SBC A,(${reg}${dispText(rel(b(addr + 2)))})` };
  if (op === 0xa6) return { len: 3, text: `AND (${reg}${dispText(rel(b(addr + 2)))})` };
  if (op === 0xae) return { len: 3, text: `XOR (${reg}${dispText(rel(b(addr + 2)))})` };
  if (op === 0xb6) return { len: 3, text: `OR (${reg}${dispText(rel(b(addr + 2)))})` };
  if (op === 0xbe) return { len: 3, text: `CP (${reg}${dispText(rel(b(addr + 2)))})` };
  if (op === 0xf9) return { len: 2, text: `LD SP,${reg}` };
  if (op === 0xe9) return { len: 2, text: `JP (${reg})`, stop: true };
  return { len: 2, text: `${reg} prefix ${hex2(op)}` };
}

function dispText(disp) {
  return disp < 0 ? `${disp}` : `+${disp}`;
}

function ldRegText(op) {
  const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  return `LD ${regs[(op >> 3) & 7]},${regs[op & 7]}`;
}

function aluText(op) {
  const ops = ['ADD A', 'ADC A', 'SUB', 'SBC A', 'AND', 'XOR', 'OR', 'CP'];
  const regs = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  const text = `${ops[(op >> 3) & 7]} ${regs[op & 7]}`;
  if ((op & 0xf8) === 0xb0) return `${text} ; OR clears carry`;
  if ((op & 0xf8) === 0xa8) return `${text} ; XOR clears carry`;
  if ((op & 0xf8) === 0xa0) return `${text} ; AND clears carry`;
  return text;
}

function disassemble(start, limit) {
  const lines = [];
  let pc = start;
  const end = Math.min(rom.length, start + limit);
  while (pc < end) {
    const ins = decode(pc);
    if (ins.carry) carryEvents.push({ addr: pc, effect: ins.carry, text: ins.text });
    lines.push({ addr: pc, len: ins.len, text: ins.text, raw: bytes(pc, ins.len) });
    pc += ins.len;
    if (ins.stop) break;
  }
  return lines;
}

function printBlock(title, lines) {
  console.log(`\n## ${title}`);
  for (const line of lines) {
    console.log(`${hex6(line.addr)}  ${line.raw.padEnd(15)}  ${line.text}`);
  }
}

// --- Main ---
console.log('=== Probe: Decode 0x069E5E (FP Result Finalizer) ===');
console.log('Context: Called from 0x07DBEF FP conversion chain after 0x07D306 succeeds.');
console.log('Chain: 0x07DBEF -> CALL 0x07DC4A -> CALL 0x07CC36 -> CALL 0x07D306 -> [if no carry] CALL 0x069E5E -> CCF -> RET NC');
console.log('Also called by 0x07DBF3 (FP comparison sub) and 0x09953F (conditional FP validation).');
console.log('Carry semantics: if 0x069E5E returns carry, CCF flips to no-carry = success.');
console.log('Known RAM: D005F8=OP1 (11B), D00603=OP2 (11B), D0060E=OP3 (11B)\n');

const main = disassemble(START, MAIN_LIMIT);
printBlock(`Main function at ${hex6(START)}`, main);

// Follow one level of sub-calls
const subCalls = [...calls].sort((a, b) => a - b);
for (const target of subCalls) {
  printBlock(`CALL target preview ${hex6(target)}`, disassemble(target, SUB_LIMIT));
}

console.log('\n## Summary');
console.log(`Start: ${hex6(START)}`);
console.log(`Decoded main bytes: ${main.reduce((sum, line) => sum + line.len, 0)}`);
console.log(`CALL targets: ${[...calls].sort((a, b) => a - b).map(hex6).join(', ') || '(none)'}`);
console.log(`JP/JR targets: ${[...jumps].sort((a, b) => a - b).map(hex6).join(', ') || '(none)'}`);
console.log(`RAM reads: ${[...ramReads].sort((a, b) => a - b).map(hex6).join(', ') || '(none detected by absolute addressing)'}`);
console.log(`RAM writes: ${[...ramWrites].sort((a, b) => a - b).map(hex6).join(', ') || '(none detected by absolute addressing)'}`);
console.log('Carry flag events:');
if (carryEvents.length === 0) {
  console.log('  (none decoded directly; inspect called helpers and arithmetic/compare paths)');
} else {
  for (const event of carryEvents) console.log(`  ${hex6(event.addr)} ${event.effect}: ${event.text}`);
}
console.log('\nPurpose: FP result finalizer at 0x069E5E, called after FP conversion (0x07D306) succeeds in the FP type-check-and-convert chain. Carry output is inverted by CCF before returning to caller.');
