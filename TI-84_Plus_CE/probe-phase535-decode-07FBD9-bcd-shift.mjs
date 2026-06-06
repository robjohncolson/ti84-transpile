import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Phase 535 probe: decode BCD multi-nibble shift at 0x07FBD9
 * and BCD ADD routine at 0x07FC0E.
 *
 * Called from the BCD division loop: CALL 0x07FBD9 (shift left B positions).
 * Nearby known routines:
 *   0x07FB48 = BCD left-shift (30B, 8x RLD, shifts ONE nibble)
 *   0x07FBCA = BCD carry propagation (15B)
 *   0x07FC0E = BCD ADD
 *
 * eZ80 ADL mode: 24-bit addresses, 3-byte immediates for LD rr,nn / CALL / JP.
 */

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const START = 0x07fbd9;
const READ_LEN = 0x80; // 128 bytes to capture 0x07FBD9 through 0x07FC0E and beyond

const rom = fs.readFileSync(ROM_PATH);
const bytes = rom.subarray(START, START + READ_LEN);

function hex2(v) { return v.toString(16).toUpperCase().padStart(2, '0'); }
function hex4(v) { return v.toString(16).toUpperCase().padStart(4, '0'); }
function hex6(v) { return v.toString(16).toUpperCase().padStart(6, '0'); }
function s8(v) { return v & 0x80 ? v - 0x100 : v; }
function u24(off) { return bytes[off] | (bytes[off + 1] << 8) | (bytes[off + 2] << 16); }
function u16(off) { return bytes[off] | (bytes[off + 1] << 8); }

const r8Names = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const ccNames = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const aluNames = ['ADD A,', 'ADC A,', 'SUB ', 'SBC A,', 'AND ', 'XOR ', 'OR ', 'CP '];

function decodeCB(off) {
  const op2 = bytes[off + 1];
  const r = r8Names[op2 & 7];
  const y = (op2 >> 3) & 7;
  const group = op2 >> 6;
  if (group === 0) {
    const names = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
    return { len: 2, text: `${names[y]} ${r}` };
  }
  if (group === 1) return { len: 2, text: `BIT ${y},${r}` };
  if (group === 2) return { len: 2, text: `RES ${y},${r}` };
  return { len: 2, text: `SET ${y},${r}` };
}

function decodeED(off) {
  const op2 = bytes[off + 1];
  // Block transfers
  if (op2 === 0xa0) return { len: 2, text: 'LDI' };
  if (op2 === 0xb0) return { len: 2, text: 'LDIR' };
  if (op2 === 0xa8) return { len: 2, text: 'LDD' };
  if (op2 === 0xb8) return { len: 2, text: 'LDDR' };
  // Block compares
  if (op2 === 0xa1) return { len: 2, text: 'CPI' };
  if (op2 === 0xb1) return { len: 2, text: 'CPIR' };
  if (op2 === 0xa9) return { len: 2, text: 'CPD' };
  if (op2 === 0xb9) return { len: 2, text: 'CPDR' };
  // BCD rotate
  if (op2 === 0x6f) return { len: 2, text: 'RLD' };
  if (op2 === 0x67) return { len: 2, text: 'RRD' };
  // LD rr,(nn)
  if (op2 === 0x4b) return { len: 5, text: `LD BC,($${hex6(u24(off + 2))})` };
  if (op2 === 0x5b) return { len: 5, text: `LD DE,($${hex6(u24(off + 2))})` };
  if (op2 === 0x6b) return { len: 5, text: `LD HL,($${hex6(u24(off + 2))})` };
  // LD (nn),rr
  if (op2 === 0x43) return { len: 5, text: `LD ($${hex6(u24(off + 2))}),BC` };
  if (op2 === 0x53) return { len: 5, text: `LD ($${hex6(u24(off + 2))}),DE` };
  if (op2 === 0x63) return { len: 5, text: `LD ($${hex6(u24(off + 2))}),HL` };
  // NEG, RETI, RETN, IM
  if (op2 === 0x44) return { len: 2, text: 'NEG' };
  if (op2 === 0x4d) return { len: 2, text: 'RETI' };
  if (op2 === 0x45) return { len: 2, text: 'RETN' };
  if (op2 === 0x46) return { len: 2, text: 'IM 0' };
  if (op2 === 0x56) return { len: 2, text: 'IM 1' };
  if (op2 === 0x5e) return { len: 2, text: 'IM 2' };
  // IN/OUT
  if (op2 === 0x78) return { len: 2, text: 'IN A,(C)' };
  if (op2 === 0x79) return { len: 2, text: 'OUT (C),A' };
  // ADC/SBC HL,rr
  if (op2 === 0x4a) return { len: 2, text: 'ADC HL,BC' };
  if (op2 === 0x5a) return { len: 2, text: 'ADC HL,DE' };
  if (op2 === 0x6a) return { len: 2, text: 'ADC HL,HL' };
  if (op2 === 0x7a) return { len: 2, text: 'ADC HL,SP' };
  if (op2 === 0x42) return { len: 2, text: 'SBC HL,BC' };
  if (op2 === 0x52) return { len: 2, text: 'SBC HL,DE' };
  if (op2 === 0x62) return { len: 2, text: 'SBC HL,HL' };
  if (op2 === 0x72) return { len: 2, text: 'SBC HL,SP' };
  return { len: 2, text: `ED ${hex2(op2)}` };
}

function decodeIXIY(off, reg) {
  const op2 = bytes[off + 1];
  // LD IX/IY,nn
  if (op2 === 0x21) return { len: 5, text: `LD ${reg},$${hex6(u24(off + 2))}` };
  // LD IX/IY,(nn)
  if (op2 === 0x2a) return { len: 5, text: `LD ${reg},($${hex6(u24(off + 2))})` };
  // LD (nn),IX/IY
  if (op2 === 0x22) return { len: 5, text: `LD ($${hex6(u24(off + 2))}),${reg}` };
  // PUSH/POP
  if (op2 === 0xe5) return { len: 2, text: `PUSH ${reg}` };
  if (op2 === 0xe1) return { len: 2, text: `POP ${reg}` };
  // ADD IX/IY,rr
  if (op2 === 0x09) return { len: 2, text: `ADD ${reg},BC` };
  if (op2 === 0x19) return { len: 2, text: `ADD ${reg},DE` };
  if (op2 === 0x29) return { len: 2, text: `ADD ${reg},${reg}` };
  if (op2 === 0x39) return { len: 2, text: `ADD ${reg},SP` };
  // INC/DEC IX/IY
  if (op2 === 0x23) return { len: 2, text: `INC ${reg}` };
  if (op2 === 0x2b) return { len: 2, text: `DEC ${reg}` };
  // LD r,(IX/IY+d) and LD (IX/IY+d),r
  if (op2 === 0x36) {
    const d = s8(bytes[off + 2]);
    const n = bytes[off + 3];
    const sign = d >= 0 ? '+' : '';
    return { len: 4, text: `LD (${reg}${sign}${d}),$${hex2(n)}` };
  }
  if ((op2 & 0xc7) === 0x46) {
    const d = s8(bytes[off + 2]);
    const r = r8Names[(op2 >> 3) & 7];
    const sign = d >= 0 ? '+' : '';
    return { len: 3, text: `LD ${r},(${reg}${sign}${d})` };
  }
  if ((op2 & 0xf8) === 0x70) {
    const d = s8(bytes[off + 2]);
    const r = r8Names[op2 & 7];
    const sign = d >= 0 ? '+' : '';
    return { len: 3, text: `LD (${reg}${sign}${d}),${r}` };
  }
  // JP (IX/IY)
  if (op2 === 0xe9) return { len: 2, text: `JP (${reg})` };
  // LD SP,IX/IY
  if (op2 === 0xf9) return { len: 2, text: `LD SP,${reg}` };
  // EX (SP),IX/IY
  if (op2 === 0xe3) return { len: 2, text: `EX (SP),${reg}` };
  return { len: 2, text: `${reg} ${hex2(op2)}` };
}

function decodeAt(off) {
  const addr = START + off;
  const op = bytes[off];

  // .SIL prefix (0x52 in ADL mode)
  if (op === 0x52) {
    const inner = decodeAt(off + 1);
    // Adjust immediates to 16-bit for .SIL context where needed
    return { len: inner.len + 1, text: `.SIL ${inner.text}` };
  }

  // CB prefix
  if (op === 0xcb) return decodeCB(off);
  // ED prefix
  if (op === 0xed) return decodeED(off);
  // DD/FD prefix
  if (op === 0xdd) return decodeIXIY(off, 'IX');
  if (op === 0xfd) return decodeIXIY(off, 'IY');

  // LD rr,nn (16/24-bit)
  if (op === 0x01) return { len: 4, text: `LD BC,$${hex6(u24(off + 1))}` };
  if (op === 0x11) return { len: 4, text: `LD DE,$${hex6(u24(off + 1))}` };
  if (op === 0x21) return { len: 4, text: `LD HL,$${hex6(u24(off + 1))}` };
  if (op === 0x31) return { len: 4, text: `LD SP,$${hex6(u24(off + 1))}` };

  // LD r,n
  if (op === 0x06) return { len: 2, text: `LD B,$${hex2(bytes[off + 1])}` };
  if (op === 0x0e) return { len: 2, text: `LD C,$${hex2(bytes[off + 1])}` };
  if (op === 0x16) return { len: 2, text: `LD D,$${hex2(bytes[off + 1])}` };
  if (op === 0x1e) return { len: 2, text: `LD E,$${hex2(bytes[off + 1])}` };
  if (op === 0x26) return { len: 2, text: `LD H,$${hex2(bytes[off + 1])}` };
  if (op === 0x2e) return { len: 2, text: `LD L,$${hex2(bytes[off + 1])}` };
  if (op === 0x36) return { len: 2, text: `LD (HL),$${hex2(bytes[off + 1])}` };
  if (op === 0x3e) return { len: 2, text: `LD A,$${hex2(bytes[off + 1])}` };

  // LD A,(nn) — the opcode Codex missed!
  if (op === 0x3a) return { len: 4, text: `LD A,($${hex6(u24(off + 1))})` };
  // LD (nn),A
  if (op === 0x32) return { len: 4, text: `LD ($${hex6(u24(off + 1))}),A` };
  // LD A,(BC)/(DE)
  if (op === 0x0a) return { len: 1, text: 'LD A,(BC)' };
  if (op === 0x1a) return { len: 1, text: 'LD A,(DE)' };
  // LD (BC),A / LD (DE),A
  if (op === 0x02) return { len: 1, text: 'LD (BC),A' };
  if (op === 0x12) return { len: 1, text: 'LD (DE),A' };

  // LD (nn),HL / LD HL,(nn)
  if (op === 0x22) return { len: 4, text: `LD ($${hex6(u24(off + 1))}),HL` };
  if (op === 0x2a) return { len: 4, text: `LD HL,($${hex6(u24(off + 1))})` };

  // LD r,r (0x40-0x7F except 0x76=HALT)
  if (op === 0x76) return { len: 1, text: 'HALT' };
  if (op >= 0x40 && op <= 0x7f) {
    const dst = r8Names[(op >> 3) & 7];
    const src = r8Names[op & 7];
    return { len: 1, text: `LD ${dst},${src}` };
  }

  // ALU A,r (0x80-0xBF)
  if (op >= 0x80 && op <= 0xbf) {
    const alu = aluNames[(op >> 3) & 7];
    const r = r8Names[op & 7];
    return { len: 1, text: `${alu}${r}` };
  }

  // ALU A,n immediates
  if (op === 0xc6) return { len: 2, text: `ADD A,$${hex2(bytes[off + 1])}` };
  if (op === 0xce) return { len: 2, text: `ADC A,$${hex2(bytes[off + 1])}` };
  if (op === 0xd6) return { len: 2, text: `SUB $${hex2(bytes[off + 1])}` };
  if (op === 0xde) return { len: 2, text: `SBC A,$${hex2(bytes[off + 1])}` };
  if (op === 0xe6) return { len: 2, text: `AND $${hex2(bytes[off + 1])}` };
  if (op === 0xee) return { len: 2, text: `XOR $${hex2(bytes[off + 1])}` };
  if (op === 0xf6) return { len: 2, text: `OR $${hex2(bytes[off + 1])}` };
  if (op === 0xfe) return { len: 2, text: `CP $${hex2(bytes[off + 1])}` };

  // JR / DJNZ
  if (op === 0x18) {
    const target = (addr + 2 + s8(bytes[off + 1])) & 0xffffff;
    return { len: 2, text: `JR $${hex6(target)}` };
  }
  if (op === 0x10) {
    const target = (addr + 2 + s8(bytes[off + 1])) & 0xffffff;
    return { len: 2, text: `DJNZ $${hex6(target)}` };
  }
  // JR cc,d
  if (op === 0x20) { const t = (addr + 2 + s8(bytes[off + 1])) & 0xffffff; return { len: 2, text: `JR NZ,$${hex6(t)}` }; }
  if (op === 0x28) { const t = (addr + 2 + s8(bytes[off + 1])) & 0xffffff; return { len: 2, text: `JR Z,$${hex6(t)}` }; }
  if (op === 0x30) { const t = (addr + 2 + s8(bytes[off + 1])) & 0xffffff; return { len: 2, text: `JR NC,$${hex6(t)}` }; }
  if (op === 0x38) { const t = (addr + 2 + s8(bytes[off + 1])) & 0xffffff; return { len: 2, text: `JR C,$${hex6(t)}` }; }

  // JP nn
  if (op === 0xc3) return { len: 4, text: `JP $${hex6(u24(off + 1))}` };
  // JP cc,nn
  if (op === 0xc2) return { len: 4, text: `JP NZ,$${hex6(u24(off + 1))}` };
  if (op === 0xca) return { len: 4, text: `JP Z,$${hex6(u24(off + 1))}` };
  if (op === 0xd2) return { len: 4, text: `JP NC,$${hex6(u24(off + 1))}` };
  if (op === 0xda) return { len: 4, text: `JP C,$${hex6(u24(off + 1))}` };
  if (op === 0xe2) return { len: 4, text: `JP PO,$${hex6(u24(off + 1))}` };
  if (op === 0xea) return { len: 4, text: `JP PE,$${hex6(u24(off + 1))}` };
  if (op === 0xf2) return { len: 4, text: `JP P,$${hex6(u24(off + 1))}` };
  if (op === 0xfa) return { len: 4, text: `JP M,$${hex6(u24(off + 1))}` };
  // JP (HL)
  if (op === 0xe9) return { len: 1, text: 'JP (HL)' };

  // CALL nn
  if (op === 0xcd) return { len: 4, text: `CALL $${hex6(u24(off + 1))}` };
  // CALL cc,nn
  if (op === 0xc4) return { len: 4, text: `CALL NZ,$${hex6(u24(off + 1))}` };
  if (op === 0xcc) return { len: 4, text: `CALL Z,$${hex6(u24(off + 1))}` };
  if (op === 0xd4) return { len: 4, text: `CALL NC,$${hex6(u24(off + 1))}` };
  if (op === 0xdc) return { len: 4, text: `CALL C,$${hex6(u24(off + 1))}` };
  if (op === 0xe4) return { len: 4, text: `CALL PO,$${hex6(u24(off + 1))}` };
  if (op === 0xec) return { len: 4, text: `CALL PE,$${hex6(u24(off + 1))}` };
  if (op === 0xf4) return { len: 4, text: `CALL P,$${hex6(u24(off + 1))}` };
  if (op === 0xfc) return { len: 4, text: `CALL M,$${hex6(u24(off + 1))}` };

  // RET
  if (op === 0xc9) return { len: 1, text: 'RET' };
  // RET cc
  if (op === 0xc0) return { len: 1, text: 'RET NZ' };
  if (op === 0xc8) return { len: 1, text: 'RET Z' };
  if (op === 0xd0) return { len: 1, text: 'RET NC' };
  if (op === 0xd8) return { len: 1, text: 'RET C' };
  if (op === 0xe0) return { len: 1, text: 'RET PO' };
  if (op === 0xe8) return { len: 1, text: 'RET PE' };
  if (op === 0xf0) return { len: 1, text: 'RET P' };
  if (op === 0xf8) return { len: 1, text: 'RET M' };

  // RST
  if ((op & 0xc7) === 0xc7) return { len: 1, text: `RST $${hex2(op & 0x38)}` };

  // PUSH/POP
  if (op === 0xc5) return { len: 1, text: 'PUSH BC' };
  if (op === 0xd5) return { len: 1, text: 'PUSH DE' };
  if (op === 0xe5) return { len: 1, text: 'PUSH HL' };
  if (op === 0xf5) return { len: 1, text: 'PUSH AF' };
  if (op === 0xc1) return { len: 1, text: 'POP BC' };
  if (op === 0xd1) return { len: 1, text: 'POP DE' };
  if (op === 0xe1) return { len: 1, text: 'POP HL' };
  if (op === 0xf1) return { len: 1, text: 'POP AF' };

  // INC/DEC r
  const incDecR = { 0x04: 'INC B', 0x0c: 'INC C', 0x14: 'INC D', 0x1c: 'INC E',
                    0x24: 'INC H', 0x2c: 'INC L', 0x34: 'INC (HL)', 0x3c: 'INC A',
                    0x05: 'DEC B', 0x0d: 'DEC C', 0x15: 'DEC D', 0x1d: 'DEC E',
                    0x25: 'DEC H', 0x2d: 'DEC L', 0x35: 'DEC (HL)', 0x3d: 'DEC A' };
  if (incDecR[op]) return { len: 1, text: incDecR[op] };

  // INC/DEC rr
  if (op === 0x03) return { len: 1, text: 'INC BC' };
  if (op === 0x13) return { len: 1, text: 'INC DE' };
  if (op === 0x23) return { len: 1, text: 'INC HL' };
  if (op === 0x33) return { len: 1, text: 'INC SP' };
  if (op === 0x0b) return { len: 1, text: 'DEC BC' };
  if (op === 0x1b) return { len: 1, text: 'DEC DE' };
  if (op === 0x2b) return { len: 1, text: 'DEC HL' };
  if (op === 0x3b) return { len: 1, text: 'DEC SP' };

  // ADD HL,rr
  if (op === 0x09) return { len: 1, text: 'ADD HL,BC' };
  if (op === 0x19) return { len: 1, text: 'ADD HL,DE' };
  if (op === 0x29) return { len: 1, text: 'ADD HL,HL' };
  if (op === 0x39) return { len: 1, text: 'ADD HL,SP' };

  // Misc single-byte
  if (op === 0x00) return { len: 1, text: 'NOP' };
  if (op === 0x07) return { len: 1, text: 'RLCA' };
  if (op === 0x0f) return { len: 1, text: 'RRCA' };
  if (op === 0x17) return { len: 1, text: 'RLA' };
  if (op === 0x1f) return { len: 1, text: 'RRA' };
  if (op === 0x27) return { len: 1, text: 'DAA' };
  if (op === 0x2f) return { len: 1, text: 'CPL' };
  if (op === 0x37) return { len: 1, text: 'SCF' };
  if (op === 0x3f) return { len: 1, text: 'CCF' };
  if (op === 0x08) return { len: 1, text: "EX AF,AF'" };
  if (op === 0xd9) return { len: 1, text: 'EXX' };
  if (op === 0xeb) return { len: 1, text: 'EX DE,HL' };
  if (op === 0xe3) return { len: 1, text: 'EX (SP),HL' };
  if (op === 0xf3) return { len: 1, text: 'DI' };
  if (op === 0xfb) return { len: 1, text: 'EI' };

  // I/O
  if (op === 0xdb) return { len: 2, text: `IN A,($${hex2(bytes[off + 1])})` };
  if (op === 0xd3) return { len: 2, text: `OUT ($${hex2(bytes[off + 1])}),A` };

  // OUT (n),A / IN A,(n) in ADL mode are 2 bytes
  return { len: 1, text: `DB $${hex2(op)}` };
}

// Decode a function starting at a given offset, stopping at RET
function decodeFunction(startOff, label) {
  const insns = [];
  let off = startOff;
  const maxOff = Math.min(startOff + 80, bytes.length); // safety limit

  while (off < maxOff) {
    const addr = START + off;
    const result = decodeAt(off);
    const rawBytes = Array.from(bytes.subarray(off, off + result.len), hex2).join(' ');
    insns.push({ addr, off, len: result.len, text: result.text, raw: rawBytes });
    off += result.len;
    if (result.text === 'RET' || result.text.startsWith('JP $') || result.text.startsWith('JP (')) break;
  }

  return insns;
}

// ---- Decode the region ----

// First: dump raw hex for reference
console.log('Probe phase 535: decode 0x07FBD9 BCD shift + 0x07FC0E BCD ADD');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Read: $${hex6(START)}..$${hex6(START + READ_LEN - 1)} (${READ_LEN} bytes)`);
console.log('');

// Raw hex dump
console.log('Raw hex dump:');
for (let i = 0; i < READ_LEN; i += 16) {
  const addr = START + i;
  const chunk = Array.from(bytes.subarray(i, Math.min(i + 16, READ_LEN)), hex2).join(' ');
  console.log(`  ${hex6(addr)}: ${chunk}`);
}
console.log('');

// Decode everything linearly from START through the buffer
// We'll mark known function boundaries
const allInsns = [];
let off = 0;
const knownEntries = new Map();
knownEntries.set(0x07fbd9, '0x07FBD9 — BCD multi-shift?');
knownEntries.set(0x07fbe8, '0x07FBE8 — entry point?');
knownEntries.set(0x07fbf2, '0x07FBF2 — entry point?');
knownEntries.set(0x07fbfc, '0x07FBFC — entry point?');
knownEntries.set(0x07fc06, '0x07FC06 — entry point?');
knownEntries.set(0x07fc0e, '0x07FC0E — BCD ADD');

console.log('Full linear disassembly:');
console.log('Address  Raw bytes          Instruction');
console.log('-------  -----------------  -----------');

while (off < READ_LEN) {
  const addr = START + off;

  // Mark known entry points
  if (knownEntries.has(addr)) {
    console.log(`; --- ${knownEntries.get(addr)} ---`);
  }

  const result = decodeAt(off);
  const rawBytes = Array.from(bytes.subarray(off, off + result.len), hex2).join(' ');
  const line = `${hex6(addr)}   ${rawBytes.padEnd(17)}  ${result.text}`;
  console.log(line);

  allInsns.push({ addr, off, len: result.len, text: result.text, raw: rawBytes });
  off += result.len;
}

// ---- Analysis ----
console.log('');
console.log('=== Analysis ===');

// Collect CALL targets
const calls = allInsns.filter(i => i.text.startsWith('CALL ') || i.text.startsWith('CALL Z,') || i.text.startsWith('CALL NZ,') || i.text.startsWith('CALL C,') || i.text.startsWith('CALL NC,'));
console.log(`CALL targets: ${calls.map(i => i.text).join(', ') || '(none)'}`);

// Collect JR/JP targets
const jumps = allInsns.filter(i => i.text.startsWith('JR ') || i.text.startsWith('JP ') || i.text.startsWith('DJNZ '));
console.log(`Jump targets: ${jumps.map(i => `${hex6(i.addr)}: ${i.text}`).join('; ') || '(none)'}`);

// Collect RETs
const rets = allInsns.filter(i => i.text === 'RET' || i.text.startsWith('RET '));
console.log(`RET instructions: ${rets.map(i => `${hex6(i.addr)}: ${i.text}`).join('; ') || '(none)'}`);

// Look for BCD patterns
const hasDaa = allInsns.some(i => i.text === 'DAA');
const hasRld = allInsns.some(i => i.text === 'RLD');
const hasRrd = allInsns.some(i => i.text === 'RRD');
console.log(`BCD indicators: DAA=${hasDaa}, RLD=${hasRld}, RRD=${hasRrd}`);

// Identify the 0x07FBD9 function boundary
console.log('');
console.log('=== Function at 0x07FBD9 ===');
const fn1Start = 0;
let fn1End = 0;
for (const ins of allInsns) {
  if (ins.addr >= 0x07fbd9) {
    fn1End = ins.addr + ins.len;
    if (ins.text === 'RET' || ins.text.match(/^JP \$/)) {
      console.log(`  Ends at ${hex6(ins.addr)} (${ins.text}), size = ${fn1End - START} bytes`);
      break;
    }
  }
}

// Check what 0x07FC0E looks like
console.log('');
console.log('=== Function at 0x07FC0E (BCD ADD) ===');
const fc0eInsns = allInsns.filter(i => i.addr >= 0x07fc0e);
let bcdAddSize = 0;
for (const ins of fc0eInsns) {
  bcdAddSize = ins.addr + ins.len - 0x07fc0e;
  if (ins.text === 'RET') {
    console.log(`  Ends at ${hex6(ins.addr)} (RET), size = ${bcdAddSize} bytes`);
    break;
  }
}

console.log('');
console.log('PROBE COMPLETE');
