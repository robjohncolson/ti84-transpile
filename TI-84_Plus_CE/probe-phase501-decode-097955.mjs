import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const START = 0x097955;
const MAX_BYTES = 400; // decode up to 400 bytes or first unconditional RET

const rom = fs.readFileSync(ROM_PATH);

// Known addresses for annotation
const KNOWN = {
  0x061061: 'cursor_draw',
  0x061003: 'cursor_erase',
  0x061980: 'putchar',
  0x096BEE: 'blink_toggle',
  0x096CCF: 'draw_erase_sub',
  0x096F56: 'visibility_check',
  0x096F67: 'visibility_gate',
  0x06002D: 'cursor_fn',
};

// Cursor RAM addresses
const CURSOR_RAM = [0xD00595, 0xD00596, 0xD02575, 0xD007E0, 0xD008D2, 0xD008D5];
const CURSOR_RAM_NAMES = {
  0xD00595: 'cursorRow',
  0xD00596: 'cursorCol',
  0xD02575: 'cursor_related',
  0xD007E0: 'screenMode',
  0xD008D2: 'vramWriter1',
  0xD008D5: 'vramWriter2',
};

function hex(value, width = 6) {
  return `0x${value.toString(16).toUpperCase().padStart(width, '0')}`;
}

function byte(addr) {
  return rom[addr] ?? 0;
}

function word24(addr) {
  return byte(addr) | (byte(addr + 1) << 8) | (byte(addr + 2) << 16);
}

function rel8(addr) {
  const v = byte(addr);
  return v < 0x80 ? v : v - 0x100;
}

function bytesAt(addr, len) {
  return Array.from(rom.subarray(addr, addr + len), (b) =>
    b.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function annotate(target) {
  if (KNOWN[target]) return `  ; ${KNOWN[target]}`;
  if (CURSOR_RAM_NAMES[target]) return `  ; ${CURSOR_RAM_NAMES[target]}`;
  return '';
}

// IY+offset -> absolute address (IY = 0xD00080)
function iyComment(offset) {
  const signed = offset < 0x80 ? offset : offset - 0x100;
  const abs = 0xD00080 + signed;
  const prefix = offset < 0x80 ? `+${hex(offset, 2)}` : `-${hex(0x100 - offset, 2)}`;
  return `(IY${prefix}) = ${hex(abs)}`;
}

function decodeED(addr) {
  const op2 = byte(addr + 1);
  const edPairs = { 0x4B: 'BC', 0x5B: 'DE', 0x6B: 'HL', 0x7B: 'SP' };
  const edStores = { 0x43: 'BC', 0x53: 'DE', 0x63: 'HL', 0x73: 'SP' };

  if (edPairs[op2]) {
    const target = word24(addr + 2);
    return { size: 5, mnemonic: `LD ${edPairs[op2]},(${hex(target)})${annotate(target)}`, target };
  }
  if (edStores[op2]) {
    const target = word24(addr + 2);
    return { size: 5, mnemonic: `LD (${hex(target)}),${edStores[op2]}${annotate(target)}`, target };
  }

  const edSimple = {
    0x44: 'NEG', 0x45: 'RETN', 0x4D: 'RETI',
    0xA0: 'LDI', 0xA1: 'CPI', 0xA8: 'LDD', 0xA9: 'CPD',
    0xB0: 'LDIR', 0xB1: 'CPIR', 0xB8: 'LDDR', 0xB9: 'CPDR',
    0x46: 'IM 0', 0x56: 'IM 1', 0x5E: 'IM 2',
    0x47: 'LD I,A', 0x4F: 'LD R,A', 0x57: 'LD A,I', 0x5F: 'LD A,R',
    0x67: 'RRD', 0x6F: 'RLD',
    0x42: 'SBC HL,BC', 0x52: 'SBC HL,DE', 0x62: 'SBC HL,HL', 0x72: 'SBC HL,SP',
    0x4A: 'ADC HL,BC', 0x5A: 'ADC HL,DE', 0x6A: 'ADC HL,HL', 0x7A: 'ADC HL,SP',
  };

  if (edSimple[op2]) return { size: 2, mnemonic: edSimple[op2] };

  if (op2 === 0x78) return { size: 2, mnemonic: 'IN A,(C)' };
  if (op2 === 0x79) return { size: 2, mnemonic: 'OUT (C),A' };
  if (op2 === 0x40) return { size: 2, mnemonic: 'IN B,(C)' };
  if (op2 === 0x41) return { size: 2, mnemonic: 'OUT (C),B' };

  return { size: 2, mnemonic: `ED ${hex(op2, 2)}` };
}

function decodeCB(addr) {
  const op2 = byte(addr + 1);
  const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
  const reg = regNames[op2 & 0x07];
  const bit = (op2 >> 3) & 7;
  const group = op2 & 0xC0;

  if (group === 0x00) {
    const ops = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
    return { size: 2, mnemonic: `${ops[bit]} ${reg}` };
  }
  if (group === 0x40) return { size: 2, mnemonic: `BIT ${bit},${reg}` };
  if (group === 0x80) return { size: 2, mnemonic: `RES ${bit},${reg}` };
  if (group === 0xC0) return { size: 2, mnemonic: `SET ${bit},${reg}` };

  return { size: 2, mnemonic: `CB ${hex(op2, 2)}` };
}

function decodeDD(addr) {
  const op2 = byte(addr + 1);

  if (op2 === 0xCB) {
    const disp = byte(addr + 2);
    const bitop = byte(addr + 3);
    const signed = disp < 0x80 ? `+${hex(disp, 2)}` : `-${hex(0x100 - disp, 2)}`;
    const group = bitop & 0xC0;
    const bit = (bitop >> 3) & 7;
    if (group === 0x40) return { size: 4, mnemonic: `BIT ${bit},(IX${signed})` };
    if (group === 0x80) return { size: 4, mnemonic: `RES ${bit},(IX${signed})` };
    if (group === 0xC0) return { size: 4, mnemonic: `SET ${bit},(IX${signed})` };
    return { size: 4, mnemonic: `DD CB ${hex(disp, 2)} ${hex(bitop, 2)}` };
  }

  const ixLoadR = { 0x46: 'B', 0x4E: 'C', 0x56: 'D', 0x5E: 'E', 0x66: 'H', 0x6E: 'L', 0x7E: 'A' };
  if (ixLoadR[op2]) {
    const disp = byte(addr + 2);
    const signed = disp < 0x80 ? `+${hex(disp, 2)}` : `-${hex(0x100 - disp, 2)}`;
    return { size: 3, mnemonic: `LD ${ixLoadR[op2]},(IX${signed})` };
  }

  const ixStoreR = { 0x70: 'B', 0x71: 'C', 0x72: 'D', 0x73: 'E', 0x74: 'H', 0x75: 'L', 0x77: 'A' };
  if (ixStoreR[op2]) {
    const disp = byte(addr + 2);
    const signed = disp < 0x80 ? `+${hex(disp, 2)}` : `-${hex(0x100 - disp, 2)}`;
    return { size: 3, mnemonic: `LD (IX${signed}),${ixStoreR[op2]}` };
  }

  if (op2 === 0x36) {
    const disp = byte(addr + 2);
    const imm = byte(addr + 3);
    const signed = disp < 0x80 ? `+${hex(disp, 2)}` : `-${hex(0x100 - disp, 2)}`;
    return { size: 4, mnemonic: `LD (IX${signed}),${hex(imm, 2)}` };
  }

  if (op2 === 0x21) { const v = word24(addr + 2); return { size: 5, mnemonic: `LD IX,${hex(v)}`, target: v }; }
  if (op2 === 0x22) { const v = word24(addr + 2); return { size: 5, mnemonic: `LD (${hex(v)}),IX`, target: v }; }
  if (op2 === 0x2A) { const v = word24(addr + 2); return { size: 5, mnemonic: `LD IX,(${hex(v)})`, target: v }; }
  if (op2 === 0xE5) return { size: 2, mnemonic: 'PUSH IX' };
  if (op2 === 0xE1) return { size: 2, mnemonic: 'POP IX' };
  if (op2 === 0xE9) return { size: 2, mnemonic: 'JP (IX)' };
  if (op2 === 0x23) return { size: 2, mnemonic: 'INC IX' };
  if (op2 === 0x2B) return { size: 2, mnemonic: 'DEC IX' };
  if (op2 === 0x09) return { size: 2, mnemonic: 'ADD IX,BC' };
  if (op2 === 0x19) return { size: 2, mnemonic: 'ADD IX,DE' };
  if (op2 === 0x29) return { size: 2, mnemonic: 'ADD IX,IX' };
  if (op2 === 0x39) return { size: 2, mnemonic: 'ADD IX,SP' };
  if (op2 === 0xF9) return { size: 2, mnemonic: 'LD SP,IX' };

  const ixAlu = { 0x86: 'ADD A', 0x8E: 'ADC A', 0x96: 'SUB', 0x9E: 'SBC A', 0xA6: 'AND', 0xAE: 'XOR', 0xB6: 'OR', 0xBE: 'CP' };
  if (ixAlu[op2]) {
    const disp = byte(addr + 2);
    const signed = disp < 0x80 ? `+${hex(disp, 2)}` : `-${hex(0x100 - disp, 2)}`;
    return { size: 3, mnemonic: `${ixAlu[op2]},(IX${signed})` };
  }

  if (op2 === 0x34) {
    const disp = byte(addr + 2);
    const signed = disp < 0x80 ? `+${hex(disp, 2)}` : `-${hex(0x100 - disp, 2)}`;
    return { size: 3, mnemonic: `INC (IX${signed})` };
  }
  if (op2 === 0x35) {
    const disp = byte(addr + 2);
    const signed = disp < 0x80 ? `+${hex(disp, 2)}` : `-${hex(0x100 - disp, 2)}`;
    return { size: 3, mnemonic: `DEC (IX${signed})` };
  }

  return { size: 2, mnemonic: `DD ${hex(op2, 2)}` };
}

function decodeFD(addr) {
  const op2 = byte(addr + 1);

  if (op2 === 0xCB) {
    const disp = byte(addr + 2);
    const bitop = byte(addr + 3);
    const signed = disp < 0x80 ? `+${hex(disp, 2)}` : `-${hex(0x100 - disp, 2)}`;
    const group = bitop & 0xC0;
    const bit = (bitop >> 3) & 7;
    if (group === 0x40) return { size: 4, mnemonic: `BIT ${bit},(IY${signed})  ; ${iyComment(disp)}` };
    if (group === 0x80) return { size: 4, mnemonic: `RES ${bit},(IY${signed})  ; ${iyComment(disp)}` };
    if (group === 0xC0) return { size: 4, mnemonic: `SET ${bit},(IY${signed})  ; ${iyComment(disp)}` };
    return { size: 4, mnemonic: `FD CB ${hex(disp, 2)} ${hex(bitop, 2)}` };
  }

  const iyLoadR = { 0x46: 'B', 0x4E: 'C', 0x56: 'D', 0x5E: 'E', 0x66: 'H', 0x6E: 'L', 0x7E: 'A' };
  if (iyLoadR[op2]) {
    const disp = byte(addr + 2);
    const signed = disp < 0x80 ? `+${hex(disp, 2)}` : `-${hex(0x100 - disp, 2)}`;
    return { size: 3, mnemonic: `LD ${iyLoadR[op2]},(IY${signed})  ; ${iyComment(disp)}` };
  }

  const iyStoreR = { 0x70: 'B', 0x71: 'C', 0x72: 'D', 0x73: 'E', 0x74: 'H', 0x75: 'L', 0x77: 'A' };
  if (iyStoreR[op2]) {
    const disp = byte(addr + 2);
    const signed = disp < 0x80 ? `+${hex(disp, 2)}` : `-${hex(0x100 - disp, 2)}`;
    return { size: 3, mnemonic: `LD (IY${signed}),${iyStoreR[op2]}  ; ${iyComment(disp)}` };
  }

  if (op2 === 0x36) {
    const disp = byte(addr + 2);
    const imm = byte(addr + 3);
    const signed = disp < 0x80 ? `+${hex(disp, 2)}` : `-${hex(0x100 - disp, 2)}`;
    return { size: 4, mnemonic: `LD (IY${signed}),${hex(imm, 2)}  ; ${iyComment(disp)}` };
  }

  if (op2 === 0x21) { const v = word24(addr + 2); return { size: 5, mnemonic: `LD IY,${hex(v)}`, target: v }; }
  if (op2 === 0x22) { const v = word24(addr + 2); return { size: 5, mnemonic: `LD (${hex(v)}),IY`, target: v }; }
  if (op2 === 0x2A) { const v = word24(addr + 2); return { size: 5, mnemonic: `LD IY,(${hex(v)})`, target: v }; }
  if (op2 === 0xE5) return { size: 2, mnemonic: 'PUSH IY' };
  if (op2 === 0xE1) return { size: 2, mnemonic: 'POP IY' };
  if (op2 === 0xE9) return { size: 2, mnemonic: 'JP (IY)' };
  if (op2 === 0x23) return { size: 2, mnemonic: 'INC IY' };
  if (op2 === 0x2B) return { size: 2, mnemonic: 'DEC IY' };
  if (op2 === 0x09) return { size: 2, mnemonic: 'ADD IY,BC' };
  if (op2 === 0x19) return { size: 2, mnemonic: 'ADD IY,DE' };
  if (op2 === 0x29) return { size: 2, mnemonic: 'ADD IY,IY' };
  if (op2 === 0x39) return { size: 2, mnemonic: 'ADD IY,SP' };
  if (op2 === 0xF9) return { size: 2, mnemonic: 'LD SP,IY' };

  const iyAlu = { 0x86: 'ADD A', 0x8E: 'ADC A', 0x96: 'SUB', 0x9E: 'SBC A', 0xA6: 'AND', 0xAE: 'XOR', 0xB6: 'OR', 0xBE: 'CP' };
  if (iyAlu[op2]) {
    const disp = byte(addr + 2);
    const signed = disp < 0x80 ? `+${hex(disp, 2)}` : `-${hex(0x100 - disp, 2)}`;
    return { size: 3, mnemonic: `${iyAlu[op2]},(IY${signed})  ; ${iyComment(disp)}` };
  }

  if (op2 === 0x34) {
    const disp = byte(addr + 2);
    const signed = disp < 0x80 ? `+${hex(disp, 2)}` : `-${hex(0x100 - disp, 2)}`;
    return { size: 3, mnemonic: `INC (IY${signed})  ; ${iyComment(disp)}` };
  }
  if (op2 === 0x35) {
    const disp = byte(addr + 2);
    const signed = disp < 0x80 ? `+${hex(disp, 2)}` : `-${hex(0x100 - disp, 2)}`;
    return { size: 3, mnemonic: `DEC (IY${signed})  ; ${iyComment(disp)}` };
  }

  return { size: 2, mnemonic: `FD ${hex(op2, 2)}` };
}

// eZ80 suffix bytes change operand size for the NEXT instruction.
// In ADL mode (default for TI-84 CE), addresses are 24-bit.
// .SIS (0x40) and .LIS (0x49) force 16-bit addresses for next instruction.
// .SIL (0x52) and .LIL (0x5B) force 24-bit (no-op in ADL mode).
// When .SIS is active, 16-bit addresses are sign-extended with MBASE (0xD0).
const SUFFIX_NAMES = { 0x40: '.SIS', 0x49: '.LIS', 0x52: '.SIL', 0x5B: '.LIL' };
const SUFFIX_SHORT = new Set([0x40, 0x49]); // 16-bit address mode
const MBASE = 0xD0; // Memory base register for .SIS address expansion

// Opcodes whose operand size changes with suffix prefix
const ADDR_OPCODES = new Set([
  0x01, 0x11, 0x21, 0x31, // LD rr,nn
  0x22, 0x2A, 0x32, 0x3A, // LD (nn),HL etc.
  0xC3, 0xCA, 0xC2, 0xDA, 0xD2, // JP
  0xCD, 0xCC, 0xC4, 0xDC, 0xD4, // CALL
  0xED, // ED-prefixed (some sub-ops have addresses)
]);

function readAddrN(base, n) {
  // Read n-byte address (2 or 3)
  if (n === 2) return byte(base) | (byte(base + 1) << 8);
  return byte(base) | (byte(base + 1) << 8) | (byte(base + 2) << 16);
}

function expandSIS(addr16) {
  // In .SIS mode, 16-bit address is expanded with MBASE in high byte
  return (MBASE << 16) | addr16;
}

function decode(addr) {
  const op = byte(addr);

  // Check for eZ80 suffix prefix
  let suffixByte = 0;
  let suffixName = '';
  let addrLen = 3; // default ADL = 24-bit
  let extraSize = 0;
  let baseAddr = addr;

  if (SUFFIX_NAMES[op] && ADDR_OPCODES.has(byte(addr + 1))) {
    suffixByte = op;
    suffixName = SUFFIX_NAMES[op] + ' ';
    addrLen = SUFFIX_SHORT.has(op) ? 2 : 3;
    extraSize = 1;
    addr += 1; // skip suffix byte, decode next instruction
  }

  const sop = byte(addr); // the actual opcode (after possible suffix)

  // Prefixed instructions (not affected by suffix in most cases, except ED)
  if (sop === 0xED && extraSize > 0) {
    // ED-prefixed with suffix
    const op2 = byte(addr + 1);
    const edPairs = { 0x4B: 'BC', 0x5B: 'DE', 0x6B: 'HL', 0x7B: 'SP' };
    const edStores = { 0x43: 'BC', 0x53: 'DE', 0x63: 'HL', 0x73: 'SP' };
    if (edPairs[op2]) {
      const t = readAddrN(addr + 2, addrLen);
      const expanded = addrLen === 2 ? expandSIS(t) : t;
      return { size: 2 + addrLen + extraSize, mnemonic: `${suffixName}LD ${edPairs[op2]},(${hex(expanded)})${annotate(expanded)}`, target: expanded };
    }
    if (edStores[op2]) {
      const t = readAddrN(addr + 2, addrLen);
      const expanded = addrLen === 2 ? expandSIS(t) : t;
      return { size: 2 + addrLen + extraSize, mnemonic: `${suffixName}LD (${hex(expanded)}),${edStores[op2]}${annotate(expanded)}`, target: expanded };
    }
  }

  if (sop === 0xED && extraSize === 0) return decodeED(addr);
  if (sop === 0xCB && extraSize === 0) return decodeCB(addr);
  if (sop === 0xDD && extraSize === 0) return decodeDD(addr);
  if (sop === 0xFD && extraSize === 0) return decodeFD(addr);

  // If suffix is active, we need to use addrLen for address-bearing instructions
  function readAddr(off) {
    const raw = readAddrN(addr + off, addrLen);
    return addrLen === 2 ? expandSIS(raw) : raw;
  }

  // CALL/JP
  if (sop === 0xCD) { const t = readAddr(1); return { size: 1 + addrLen + extraSize, mnemonic: `${suffixName}CALL ${hex(t)}${annotate(t)}`, kind: 'CALL', target: t }; }
  if (sop === 0xC3) { const t = readAddr(1); return { size: 1 + addrLen + extraSize, mnemonic: `${suffixName}JP ${hex(t)}${annotate(t)}`, kind: 'JP', target: t }; }

  // Conditional JP
  if (sop === 0xCA) { const t = readAddr(1); return { size: 1 + addrLen + extraSize, mnemonic: `${suffixName}JP Z,${hex(t)}${annotate(t)}`, kind: 'JP', target: t }; }
  if (sop === 0xC2) { const t = readAddr(1); return { size: 1 + addrLen + extraSize, mnemonic: `${suffixName}JP NZ,${hex(t)}${annotate(t)}`, kind: 'JP', target: t }; }
  if (sop === 0xDA) { const t = readAddr(1); return { size: 1 + addrLen + extraSize, mnemonic: `${suffixName}JP C,${hex(t)}${annotate(t)}`, kind: 'JP', target: t }; }
  if (sop === 0xD2) { const t = readAddr(1); return { size: 1 + addrLen + extraSize, mnemonic: `${suffixName}JP NC,${hex(t)}${annotate(t)}`, kind: 'JP', target: t }; }

  // Conditional CALL
  if (sop === 0xCC) { const t = readAddr(1); return { size: 1 + addrLen + extraSize, mnemonic: `${suffixName}CALL Z,${hex(t)}${annotate(t)}`, kind: 'CALL', target: t }; }
  if (sop === 0xC4) { const t = readAddr(1); return { size: 1 + addrLen + extraSize, mnemonic: `${suffixName}CALL NZ,${hex(t)}${annotate(t)}`, kind: 'CALL', target: t }; }
  if (sop === 0xDC) { const t = readAddr(1); return { size: 1 + addrLen + extraSize, mnemonic: `${suffixName}CALL C,${hex(t)}${annotate(t)}`, kind: 'CALL', target: t }; }
  if (sop === 0xD4) { const t = readAddr(1); return { size: 1 + addrLen + extraSize, mnemonic: `${suffixName}CALL NC,${hex(t)}${annotate(t)}`, kind: 'CALL', target: t }; }

  // JR (not affected by suffix — always 1-byte relative offset)
  if (sop === 0x18 || sop === 0x20 || sop === 0x28 || sop === 0x30 || sop === 0x38) {
    const t = addr + 2 + rel8(addr + 1);
    const names = { 0x18: 'JR', 0x20: 'JR NZ', 0x28: 'JR Z', 0x30: 'JR NC', 0x38: 'JR C' };
    return { size: 2 + extraSize, mnemonic: `${suffixName}${names[sop]} ${hex(t)}`, kind: 'JR', target: t };
  }

  // DJNZ
  if (sop === 0x10) {
    const t = addr + 2 + rel8(addr + 1);
    return { size: 2 + extraSize, mnemonic: `${suffixName}DJNZ ${hex(t)}`, kind: 'JR', target: t };
  }

  // LD with addresses (size depends on suffix)
  if (sop === 0x3A) { const t = readAddr(1); return { size: 1 + addrLen + extraSize, mnemonic: `${suffixName}LD A,(${hex(t)})${annotate(t)}`, target: t }; }
  if (sop === 0x32) { const t = readAddr(1); return { size: 1 + addrLen + extraSize, mnemonic: `${suffixName}LD (${hex(t)}),A${annotate(t)}`, target: t }; }
  if (sop === 0x2A) { const t = readAddr(1); return { size: 1 + addrLen + extraSize, mnemonic: `${suffixName}LD HL,(${hex(t)})${annotate(t)}`, target: t }; }
  if (sop === 0x22) { const t = readAddr(1); return { size: 1 + addrLen + extraSize, mnemonic: `${suffixName}LD (${hex(t)}),HL${annotate(t)}`, target: t }; }

  // LD r,imm (immediate size also changes with suffix for 16/24-bit regs)
  if (sop === 0x01) { const t = readAddrN(addr + 1, addrLen); return { size: 1 + addrLen + extraSize, mnemonic: `${suffixName}LD BC,${hex(t)}` }; }
  if (sop === 0x11) { const t = readAddrN(addr + 1, addrLen); return { size: 1 + addrLen + extraSize, mnemonic: `${suffixName}LD DE,${hex(t)}` }; }
  if (sop === 0x21) { const t = readAddrN(addr + 1, addrLen); return { size: 1 + addrLen + extraSize, mnemonic: `${suffixName}LD HL,${hex(t)}` }; }
  if (sop === 0x31) { const t = readAddrN(addr + 1, addrLen); return { size: 1 + addrLen + extraSize, mnemonic: `${suffixName}LD SP,${hex(t)}` }; }

  // LD r,imm8 (not affected by suffix)
  if (sop === 0x3E) return { size: 2 + extraSize, mnemonic: `${suffixName}LD A,${hex(byte(addr + 1), 2)}` };
  if (sop === 0x06) return { size: 2 + extraSize, mnemonic: `${suffixName}LD B,${hex(byte(addr + 1), 2)}` };
  if (sop === 0x0E) return { size: 2 + extraSize, mnemonic: `${suffixName}LD C,${hex(byte(addr + 1), 2)}` };
  if (sop === 0x16) return { size: 2 + extraSize, mnemonic: `${suffixName}LD D,${hex(byte(addr + 1), 2)}` };
  if (sop === 0x1E) return { size: 2 + extraSize, mnemonic: `${suffixName}LD E,${hex(byte(addr + 1), 2)}` };
  if (sop === 0x26) return { size: 2 + extraSize, mnemonic: `${suffixName}LD H,${hex(byte(addr + 1), 2)}` };
  if (sop === 0x2E) return { size: 2 + extraSize, mnemonic: `${suffixName}LD L,${hex(byte(addr + 1), 2)}` };
  if (sop === 0x36) return { size: 2 + extraSize, mnemonic: `${suffixName}LD (HL),${hex(byte(addr + 1), 2)}` };

  // ALU imm8 (not affected by suffix)
  if (sop === 0xFE) return { size: 2 + extraSize, mnemonic: `${suffixName}CP ${hex(byte(addr + 1), 2)}` };
  if (sop === 0xE6) return { size: 2 + extraSize, mnemonic: `${suffixName}AND ${hex(byte(addr + 1), 2)}` };
  if (sop === 0xF6) return { size: 2 + extraSize, mnemonic: `${suffixName}OR ${hex(byte(addr + 1), 2)}` };
  if (sop === 0xEE) return { size: 2 + extraSize, mnemonic: `${suffixName}XOR ${hex(byte(addr + 1), 2)}` };
  if (sop === 0xC6) return { size: 2 + extraSize, mnemonic: `${suffixName}ADD A,${hex(byte(addr + 1), 2)}` };
  if (sop === 0xCE) return { size: 2 + extraSize, mnemonic: `${suffixName}ADC A,${hex(byte(addr + 1), 2)}` };
  if (sop === 0xD6) return { size: 2 + extraSize, mnemonic: `${suffixName}SUB ${hex(byte(addr + 1), 2)}` };
  if (sop === 0xDE) return { size: 2 + extraSize, mnemonic: `${suffixName}SBC A,${hex(byte(addr + 1), 2)}` };

  // RST
  if ((sop & 0xC7) === 0xC7) {
    const vec = sop & 0x38;
    return { size: 1 + extraSize, mnemonic: `${suffixName}RST ${hex(vec, 2)}` };
  }

  // Single-byte instructions
  const oneByte = {
    0x00: 'NOP', 0x02: 'LD (BC),A', 0x03: 'INC BC', 0x04: 'INC B', 0x05: 'DEC B',
    0x07: 'RLCA', 0x08: "EX AF,AF'", 0x09: 'ADD HL,BC', 0x0A: 'LD A,(BC)',
    0x0B: 'DEC BC', 0x0C: 'INC C', 0x0D: 'DEC C', 0x0F: 'RRCA',
    0x12: 'LD (DE),A', 0x13: 'INC DE', 0x14: 'INC D', 0x15: 'DEC D',
    0x17: 'RLA', 0x19: 'ADD HL,DE', 0x1A: 'LD A,(DE)',
    0x1B: 'DEC DE', 0x1C: 'INC E', 0x1D: 'DEC E', 0x1F: 'RRA',
    0x23: 'INC HL', 0x24: 'INC H', 0x25: 'DEC H',
    0x27: 'DAA', 0x29: 'ADD HL,HL', 0x2B: 'DEC HL', 0x2C: 'INC L', 0x2D: 'DEC L',
    0x2F: 'CPL', 0x33: 'INC SP', 0x34: 'INC (HL)', 0x35: 'DEC (HL)',
    0x37: 'SCF', 0x39: 'ADD HL,SP', 0x3B: 'DEC SP', 0x3C: 'INC A', 0x3D: 'DEC A',
    0x3F: 'CCF',
    0x40: 'LD B,B', 0x41: 'LD B,C', 0x42: 'LD B,D', 0x43: 'LD B,E', 0x44: 'LD B,H', 0x45: 'LD B,L', 0x46: 'LD B,(HL)', 0x47: 'LD B,A',
    0x48: 'LD C,B', 0x49: 'LD C,C', 0x4A: 'LD C,D', 0x4B: 'LD C,E', 0x4C: 'LD C,H', 0x4D: 'LD C,L', 0x4E: 'LD C,(HL)', 0x4F: 'LD C,A',
    0x50: 'LD D,B', 0x51: 'LD D,C', 0x52: 'LD D,D', 0x53: 'LD D,E', 0x54: 'LD D,H', 0x55: 'LD D,L', 0x56: 'LD D,(HL)', 0x57: 'LD D,A',
    0x58: 'LD E,B', 0x59: 'LD E,C', 0x5A: 'LD E,D', 0x5B: 'LD E,E', 0x5C: 'LD E,H', 0x5D: 'LD E,L', 0x5E: 'LD E,(HL)', 0x5F: 'LD E,A',
    0x60: 'LD H,B', 0x61: 'LD H,C', 0x62: 'LD H,D', 0x63: 'LD H,E', 0x64: 'LD H,H', 0x65: 'LD H,L', 0x66: 'LD H,(HL)', 0x67: 'LD H,A',
    0x68: 'LD L,B', 0x69: 'LD L,C', 0x6A: 'LD L,D', 0x6B: 'LD L,E', 0x6C: 'LD L,H', 0x6D: 'LD L,L', 0x6E: 'LD L,(HL)', 0x6F: 'LD L,A',
    0x70: 'LD (HL),B', 0x71: 'LD (HL),C', 0x72: 'LD (HL),D', 0x73: 'LD (HL),E', 0x74: 'LD (HL),H', 0x75: 'LD (HL),L', 0x76: 'HALT', 0x77: 'LD (HL),A',
    0x78: 'LD A,B', 0x79: 'LD A,C', 0x7A: 'LD A,D', 0x7B: 'LD A,E', 0x7C: 'LD A,H', 0x7D: 'LD A,L', 0x7E: 'LD A,(HL)', 0x7F: 'LD A,A',
    0x80: 'ADD A,B', 0x81: 'ADD A,C', 0x82: 'ADD A,D', 0x83: 'ADD A,E', 0x84: 'ADD A,H', 0x85: 'ADD A,L', 0x86: 'ADD A,(HL)', 0x87: 'ADD A,A',
    0x88: 'ADC A,B', 0x89: 'ADC A,C', 0x8A: 'ADC A,D', 0x8B: 'ADC A,E', 0x8C: 'ADC A,H', 0x8D: 'ADC A,L', 0x8E: 'ADC A,(HL)', 0x8F: 'ADC A,A',
    0x90: 'SUB B', 0x91: 'SUB C', 0x92: 'SUB D', 0x93: 'SUB E', 0x94: 'SUB H', 0x95: 'SUB L', 0x96: 'SUB (HL)', 0x97: 'SUB A',
    0x98: 'SBC A,B', 0x99: 'SBC A,C', 0x9A: 'SBC A,D', 0x9B: 'SBC A,E', 0x9C: 'SBC A,H', 0x9D: 'SBC A,L', 0x9E: 'SBC A,(HL)', 0x9F: 'SBC A,A',
    0xA0: 'AND B', 0xA1: 'AND C', 0xA2: 'AND D', 0xA3: 'AND E', 0xA4: 'AND H', 0xA5: 'AND L', 0xA6: 'AND (HL)', 0xA7: 'AND A',
    0xA8: 'XOR B', 0xA9: 'XOR C', 0xAA: 'XOR D', 0xAB: 'XOR E', 0xAC: 'XOR H', 0xAD: 'XOR L', 0xAE: 'XOR (HL)', 0xAF: 'XOR A',
    0xB0: 'OR B', 0xB1: 'OR C', 0xB2: 'OR D', 0xB3: 'OR E', 0xB4: 'OR H', 0xB5: 'OR L', 0xB6: 'OR (HL)', 0xB7: 'OR A',
    0xB8: 'CP B', 0xB9: 'CP C', 0xBA: 'CP D', 0xBB: 'CP E', 0xBC: 'CP H', 0xBD: 'CP L', 0xBE: 'CP (HL)', 0xBF: 'CP A',
    0xC0: 'RET NZ', 0xC1: 'POP BC', 0xC5: 'PUSH BC', 0xC8: 'RET Z', 0xC9: 'RET',
    0xD0: 'RET NC', 0xD1: 'POP DE', 0xD5: 'PUSH DE', 0xD8: 'RET C', 0xD9: 'EXX',
    0xE0: 'RET PO', 0xE1: 'POP HL', 0xE3: 'EX (SP),HL', 0xE5: 'PUSH HL', 0xE8: 'RET PE', 0xE9: 'JP (HL)',
    0xEB: 'EX DE,HL', 0xF0: 'RET P', 0xF1: 'POP AF', 0xF3: 'DI', 0xF5: 'PUSH AF', 0xF8: 'RET M', 0xF9: 'LD SP,HL', 0xFB: 'EI',
  };

  if (oneByte[sop]) return { size: 1 + extraSize, mnemonic: `${suffixName}${oneByte[sop]}` };

  // OUT/IN
  if (sop === 0xD3) return { size: 2 + extraSize, mnemonic: `${suffixName}OUT (${hex(byte(addr + 1), 2)}),A` };
  if (sop === 0xDB) return { size: 2 + extraSize, mnemonic: `${suffixName}IN A,(${hex(byte(addr + 1), 2)})` };

  return { size: 1 + extraSize, mnemonic: `DB ${hex(sop, 2)}` };
}

// ---------------------------------------------------------------
// Disassemble starting at 0x097955
// ---------------------------------------------------------------

console.log(`ROM: ${ROM_PATH}`);
console.log(`ROM size: ${rom.length.toLocaleString()} bytes`);
console.log('');
console.log(`=== Disassembly of 0x097955 (cursor draw path) ===`);
console.log('');

const rows = [];
const callTargets = new Map();
const jpTargets = new Map();
const ramRefs = new Map();
let addr = START;
let hitRet = false;

while (addr < START + MAX_BYTES) {
  const decoded = decode(addr);
  rows.push({ addr, ...decoded, raw: bytesAt(addr, decoded.size) });

  // Track targets
  if (decoded.kind === 'CALL') {
    if (!callTargets.has(decoded.target)) callTargets.set(decoded.target, []);
    callTargets.get(decoded.target).push(addr);
  }
  if (decoded.kind === 'JP' || decoded.kind === 'JR') {
    if (!jpTargets.has(decoded.target)) jpTargets.set(decoded.target, []);
    jpTargets.get(decoded.target).push(addr);
  }

  // Track RAM references
  if (decoded.target && decoded.target >= 0xD00000 && decoded.target <= 0xDFFFFF) {
    if (!ramRefs.has(decoded.target)) ramRefs.set(decoded.target, []);
    ramRefs.get(decoded.target).push(addr);
  }

  // Check for unconditional RET (only if we've decoded at least 4 bytes)
  if (decoded.mnemonic === 'RET' && addr > START + 4) {
    hitRet = true;
    addr += decoded.size;
    break;
  }

  // Unconditional JP to far-away address is also a function end
  if (decoded.kind === 'JP' && decoded.mnemonic.match(/^JP 0x/) && decoded.target !== undefined) {
    if ((decoded.target < START || decoded.target >= START + MAX_BYTES) && addr > START + 4) {
      // Tail call — but there might be more code after (jumped-over blocks)
      // Continue decoding to catch fall-through blocks
    }
  }

  addr += decoded.size;
}

const totalBytes = addr - START;

// Print disassembly
for (const row of rows) {
  console.log(`  ${hex(row.addr)}  ${row.raw.padEnd(16)}  ${row.mnemonic}`);
}

console.log('');
console.log(`Total decoded: ${totalBytes} bytes (${hex(START)} - ${hex(addr - 1)})`);
console.log(`Ended at: ${hitRet ? 'unconditional RET' : 'max bytes limit'}`);

// ---------------------------------------------------------------
// CALL targets
// ---------------------------------------------------------------
console.log('');
console.log('=== CALL targets ===');
if (callTargets.size === 0) {
  console.log('  none');
} else {
  for (const [target, froms] of [...callTargets.entries()].sort((a, b) => a[0] - b[0])) {
    const name = KNOWN[target] ? ` (${KNOWN[target]})` : '';
    console.log(`  ${hex(target)}${name} called from: ${froms.map(f => hex(f)).join(', ')}`);
  }
}

// ---------------------------------------------------------------
// JP/JR targets
// ---------------------------------------------------------------
console.log('');
console.log('=== JP/JR targets ===');
if (jpTargets.size === 0) {
  console.log('  none');
} else {
  for (const [target, froms] of [...jpTargets.entries()].sort((a, b) => a[0] - b[0])) {
    const name = KNOWN[target] ? ` (${KNOWN[target]})` : '';
    const inRange = (target >= START && target < addr) ? ' [in-range]' : ' [out-of-range]';
    console.log(`  ${hex(target)}${name}${inRange} from: ${froms.map(f => hex(f)).join(', ')}`);
  }
}

// ---------------------------------------------------------------
// Cursor RAM references
// ---------------------------------------------------------------
console.log('');
console.log('=== Cursor RAM references ===');
const cursorHits = [];
for (const ramAddr of CURSOR_RAM) {
  if (ramRefs.has(ramAddr)) {
    cursorHits.push({ addr: ramAddr, name: CURSOR_RAM_NAMES[ramAddr], froms: ramRefs.get(ramAddr) });
  }
}
if (cursorHits.length === 0) {
  console.log('  none of the known cursor RAM addresses referenced directly');
} else {
  for (const hit of cursorHits) {
    console.log(`  ${hex(hit.addr)} (${hit.name}) referenced from: ${hit.froms.map(f => hex(f)).join(', ')}`);
  }
}

// All RAM references
console.log('');
console.log('=== All RAM references (0xDxxxxx) ===');
if (ramRefs.size === 0) {
  console.log('  none');
} else {
  for (const [target, froms] of [...ramRefs.entries()].sort((a, b) => a[0] - b[0])) {
    const name = CURSOR_RAM_NAMES[target] ? ` (${CURSOR_RAM_NAMES[target]})` : '';
    console.log(`  ${hex(target)}${name} from: ${froms.map(f => hex(f)).join(', ')}`);
  }
}

// ---------------------------------------------------------------
// References to 0x06xxxx range
// ---------------------------------------------------------------
console.log('');
console.log('=== References to 0x06xxxx range ===');
const os06refs = [];
for (const [target, froms] of callTargets) {
  if (target >= 0x060000 && target <= 0x06FFFF) {
    os06refs.push({ target, froms, kind: 'CALL' });
  }
}
for (const [target, froms] of jpTargets) {
  if (target >= 0x060000 && target <= 0x06FFFF) {
    os06refs.push({ target, froms, kind: 'JP/JR' });
  }
}
if (os06refs.length === 0) {
  console.log('  none');
} else {
  for (const ref of os06refs.sort((a, b) => a.target - b.target)) {
    const name = KNOWN[ref.target] ? ` (${KNOWN[ref.target]})` : '';
    console.log(`  ${ref.kind} ${hex(ref.target)}${name} from: ${ref.froms.map(f => hex(f)).join(', ')}`);
  }
}

// ---------------------------------------------------------------
// Context: 20 bytes before 0x097955
// ---------------------------------------------------------------
console.log('');
console.log('=== Context: 20 bytes before 0x097955 ===');
let preAddr = START - 20;
while (preAddr < START) {
  const d = decode(preAddr);
  console.log(`  ${hex(preAddr)}  ${bytesAt(preAddr, d.size).padEnd(16)}  ${d.mnemonic}`);
  preAddr += d.size;
}

// ---------------------------------------------------------------
// Peek after RET
// ---------------------------------------------------------------
if (hitRet) {
  console.log('');
  console.log(`=== Peek: 30 bytes after RET (${hex(addr)}) ===`);
  let peekAddr = addr;
  while (peekAddr < addr + 30) {
    const d = decode(peekAddr);
    console.log(`  ${hex(peekAddr)}  ${bytesAt(peekAddr, d.size).padEnd(16)}  ${d.mnemonic}`);
    peekAddr += d.size;
  }
}

// ---------------------------------------------------------------
// Summary
// ---------------------------------------------------------------
console.log('');
console.log('=== SUMMARY ===');
console.log(`Function at 0x097955: ${totalBytes} bytes`);
console.log(`CALL targets: ${[...callTargets.keys()].map(t => hex(t) + (KNOWN[t] ? ` (${KNOWN[t]})` : '')).join(', ') || 'none'}`);
console.log(`JP/JR targets: ${[...jpTargets.keys()].map(t => hex(t) + (KNOWN[t] ? ` (${KNOWN[t]})` : '')).join(', ') || 'none'}`);
console.log(`Calls cursor_draw (0x061061): ${callTargets.has(0x061061) ? 'YES' : 'NO'}`);
console.log(`Calls cursor_erase (0x061003): ${callTargets.has(0x061003) ? 'YES' : 'NO'}`);
console.log(`Calls putchar (0x061980): ${callTargets.has(0x061980) ? 'YES' : 'NO'}`);
console.log(`Cursor RAM refs: ${cursorHits.length > 0 ? cursorHits.map(h => `${hex(h.addr)} (${h.name})`).join(', ') : 'none'}`);
console.log(`All RAM refs: ${[...ramRefs.keys()].map(a => hex(a) + (CURSOR_RAM_NAMES[a] ? ` (${CURSOR_RAM_NAMES[a]})` : '')).join(', ') || 'none'}`);
