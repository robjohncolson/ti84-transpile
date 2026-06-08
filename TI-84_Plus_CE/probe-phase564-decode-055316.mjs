#!/usr/bin/env node
/**
 * probe-phase564-decode-055316.mjs
 * Decode function at 0x055316 - called by 0x05519F (BPP INIT, session 559).
 * Part of BPP subsystem: controls 1BPP vs 16BPP rendering on TI-84 CE LCD.
 * Read-only probe: no modifications to any existing files.
 *
 * Context:
 *   0x05519F = "BPP INIT" (SET 1 D000C6, inits D005EC-D02FD9, LDIR 13B from ROM)
 *   0x08C308 = BIT 2,(0xD000C6) -- BPP mode check
 *   D000C6   = BPP mode flag (bit 2 = BPP mode active)
 *   D005EC-D02FD9 = BPP workspace
 *   LCD SPI ports: 0x4000-0x401F (TI-84 CE uses port-mapped, 16-bit port addresses)
 *   VRAM: 0xD40000+
 *
 * Template: probe-phase563-decode-0800A0.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const PRIMARY  = 0x055316;
const DUMP_END = 0x0553C0;   // 176+ bytes past start
const DUMP_LEN = DUMP_END - PRIMARY;

// ---------------------------------------------------------------------------
// Hex dump
// ---------------------------------------------------------------------------
console.log(`\n=== HEX DUMP: 0x${PRIMARY.toString(16).toUpperCase()} - 0x${DUMP_END.toString(16).toUpperCase()} (${DUMP_LEN} bytes) ===`);
for (let i = 0; i < DUMP_LEN; i += 16) {
  const addr = PRIMARY + i;
  const hexParts = [];
  const ascii = [];
  for (let j = 0; j < 16 && i + j < DUMP_LEN; j++) {
    const b = romBytes[addr + j];
    hexParts.push(b.toString(16).padStart(2, '0'));
    ascii.push(b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.');
  }
  console.log(`  ${addr.toString(16).padStart(6, '0')}  ${hexParts.join(' ').padEnd(48)}  ${ascii.join('')}`);
}

// ---------------------------------------------------------------------------
// eZ80 ADL-mode disassembler
// Supports: IX/IY prefixes (DD/FD), SIS prefix (0x40), CB/ED extended ops,
//           IN/OUT (single-byte port -- eZ80 uses 8-bit port numbers with
//           OUT (n),A  = D3 nn and IN A,(n) = DB nn where nn is 1 byte),
//           plus the full set of registers needed for this function.
// ---------------------------------------------------------------------------

function read24(off) {
  return romBytes[off] | (romBytes[off + 1] << 8) | (romBytes[off + 2] << 16);
}

function read16(off) {
  return romBytes[off] | (romBytes[off + 1] << 8);
}

function signedByte(b) {
  return b < 128 ? b : b - 256;
}

function hex(v, digits) {
  return '0x' + v.toString(16).toUpperCase().padStart(digits || 2, '0');
}

const r8  = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const rp  = ['BC', 'DE', 'HL', 'SP'];
const ccN = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const alu = ['ADD A,', 'ADC A,', 'SUB', 'SBC A,', 'AND', 'XOR', 'OR', 'CP'];
const rot = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];

// Annotate well-known RAM / workspace addresses
function describeAddr(addr) {
  if (addr === 0xD000C6) return '[BPP mode flag D000C6]';
  if (addr >= 0xD005EC && addr <= 0xD02FD9) return `[BPP workspace ${hex(addr, 6)}]`;
  if (addr >= 0xD40000) return `[VRAM ${hex(addr, 6)}]`;
  if (addr >= 0xD00080 && addr < 0xD00180) return `[IY+${hex(addr - 0xD00080)} OS flag]`;
  if (addr >= 0xD00000) return `[RAM ${hex(addr, 6)}]`;
  return '';
}

function describePort(port) {
  if (port >= 0x4000 && port <= 0x401F) return '[LCD SPI controller]';
  return '';
}

function trackAddr(addr, ramAddrs, ioAddrs) {
  if (addr >= 0xE30000 && addr <= 0xE3FFFF) ioAddrs.push(addr);
  else if (addr >= 0xD00000) ramAddrs.push(addr);
}

// Decode IY or IX prefix group (prefix = 0xDD for IX, 0xFD for IY)
function decodeIndexed(pc, prefix, sisStr, romBytes, callTargets, ramAddrs, ioAddrs) {
  const indexReg = prefix === 0xDD ? 'IX' : 'IY';
  const indexH   = prefix === 0xDD ? 'IXH' : 'IYH';
  const indexL   = prefix === 0xDD ? 'IXL' : 'IYL';
  const op = romBytes[pc++];
  let mnemonic = '';
  let comment = '';

  if (op === 0xCB) {
    // DDCB or FDCB: displacement then CB opcode
    const disp   = signedByte(romBytes[pc++]);
    const cbOp   = romBytes[pc++];
    const bitNum = (cbOp >> 3) & 7;
    const dispStr = disp >= 0 ? `+${hex(disp)}` : `-${hex(-disp)}`;
    if ((cbOp & 0xC0) === 0x40) {
      mnemonic = `${sisStr}BIT ${bitNum}, (${indexReg}${dispStr})`;
      if (prefix === 0xFD) {
        const ramAddr = 0xD00080 + (disp & 0xFF);
        comment = `bit ${bitNum} of IY+${hex(disp & 0xFF)} = ${hex(ramAddr, 6)}`;
        ramAddrs.push(ramAddr);
      }
    } else if ((cbOp & 0xC0) === 0x80) {
      mnemonic = `${sisStr}RES ${bitNum}, (${indexReg}${dispStr})`;
      if (prefix === 0xFD) { const r = 0xD00080 + (disp & 0xFF); comment = `clear bit ${bitNum} @ ${hex(r, 6)}`; ramAddrs.push(r); }
    } else if ((cbOp & 0xC0) === 0xC0) {
      mnemonic = `${sisStr}SET ${bitNum}, (${indexReg}${dispStr})`;
      if (prefix === 0xFD) { const r = 0xD00080 + (disp & 0xFF); comment = `set bit ${bitNum} @ ${hex(r, 6)}`; ramAddrs.push(r); }
    } else {
      mnemonic = `${sisStr}${rot[(cbOp >> 3) & 7]} (${indexReg}${dispStr})`;
    }
    return { pc, mnemonic, comment };
  }

  // Indexed LD / ALU with displacement
  const needDisp = new Set([
    0x34, 0x35, 0x36,
    0x46, 0x4E, 0x56, 0x5E, 0x66, 0x6E,
    0x70, 0x71, 0x72, 0x73, 0x74, 0x75, 0x77,
    0x7E,
    0x86, 0x8E, 0x96, 0x9E, 0xA6, 0xAE, 0xB6, 0xBE,
  ]);

  if (needDisp.has(op)) {
    const disp    = signedByte(romBytes[pc++]);
    const dispStr = disp >= 0 ? `+${hex(disp)}` : `-${hex(-disp)}`;
    const ref = `(${indexReg}${dispStr})`;

    if (op === 0x34) mnemonic = `${sisStr}INC ${ref}`;
    else if (op === 0x35) mnemonic = `${sisStr}DEC ${ref}`;
    else if (op === 0x36) { const n = romBytes[pc++]; mnemonic = `${sisStr}LD ${ref}, ${hex(n)}`; }
    else if (op >= 0x70 && op <= 0x77 && op !== 0x76) mnemonic = `${sisStr}LD ${ref}, ${r8[op & 7]}`;
    else if (op === 0x7E) mnemonic = `${sisStr}LD A, ${ref}`;
    else if (op === 0x46) mnemonic = `${sisStr}LD B, ${ref}`;
    else if (op === 0x4E) mnemonic = `${sisStr}LD C, ${ref}`;
    else if (op === 0x56) mnemonic = `${sisStr}LD D, ${ref}`;
    else if (op === 0x5E) mnemonic = `${sisStr}LD E, ${ref}`;
    else if (op === 0x66) mnemonic = `${sisStr}LD H, ${ref}`;
    else if (op === 0x6E) mnemonic = `${sisStr}LD L, ${ref}`;
    else {
      // ALU ops
      const aluIdx = (op >> 3) & 7;
      mnemonic = `${sisStr}${alu[aluIdx]} ${ref}`;
    }
    return { pc, mnemonic, comment };
  }

  // Non-displacement indexed ops
  switch (op) {
    case 0x21: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD ${indexReg}, ${hex(a, 6)}`; break; }
    case 0x22: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD (${hex(a, 6)}), ${indexReg}`; trackAddr(a, ramAddrs, ioAddrs); comment = describeAddr(a); break; }
    case 0x2A: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD ${indexReg}, (${hex(a, 6)})`; trackAddr(a, ramAddrs, ioAddrs); comment = describeAddr(a); break; }
    case 0x23: mnemonic = `${sisStr}INC ${indexReg}`; break;
    case 0x2B: mnemonic = `${sisStr}DEC ${indexReg}`; break;
    case 0x29: mnemonic = `${sisStr}ADD ${indexReg}, ${indexReg}`; break;
    case 0x09: mnemonic = `${sisStr}ADD ${indexReg}, BC`; break;
    case 0x19: mnemonic = `${sisStr}ADD ${indexReg}, DE`; break;
    case 0x39: mnemonic = `${sisStr}ADD ${indexReg}, SP`; break;
    case 0xE5: mnemonic = `${sisStr}PUSH ${indexReg}`; break;
    case 0xE1: mnemonic = `${sisStr}POP ${indexReg}`; break;
    case 0xE9: mnemonic = `${sisStr}JP (${indexReg})`; break;
    case 0x24: mnemonic = `${sisStr}INC ${indexH}`; break;
    case 0x25: mnemonic = `${sisStr}DEC ${indexH}`; break;
    case 0x2C: mnemonic = `${sisStr}INC ${indexL}`; break;
    case 0x2D: mnemonic = `${sisStr}DEC ${indexL}`; break;
    case 0x26: { const n = romBytes[pc++]; mnemonic = `${sisStr}LD ${indexH}, ${hex(n)}`; break; }
    case 0x2E: { const n = romBytes[pc++]; mnemonic = `${sisStr}LD ${indexL}, ${hex(n)}`; break; }
    default:
      // In Z80/eZ80, a DD or FD prefix before an opcode that doesn't use
      // the index register is silently ignored; the opcode executes as plain.
      // Back up pc and fall through to plain decode by returning a sentinel.
      pc--;  // un-consume the opcode
      return { pc, mnemonic: null, comment: '' };  // null = caller should decode plain
  }
  return { pc, mnemonic, comment };
}

function disassemble(startAddr, maxBytes) {
  const instructions = [];
  const callTargets  = [];
  const ramAddrs     = [];
  const ioAddrs      = [];
  const ports        = [];
  let pc  = startAddr;
  const end = startAddr + maxBytes;

  while (pc < end) {
    const instrStart = pc;
    let sisMode = false;
    let op = romBytes[pc++];

    // SIS mode prefix 0x40 -- switches to 16-bit addressing for one instruction
    if (op === 0x40) {
      const next = romBytes[pc];
      // Only treat as SIS if followed by a 'meaningful' instruction byte
      const sisTriggers = new Set([
        0xDD, 0xFD, 0xED, 0xCB,
        0xCD, 0xC3, 0xC9,
        0x21, 0x01, 0x11, 0x31,
        0x3A, 0x32, 0x2A, 0x22,
        0xE5, 0xE1,
      ]);
      if (sisTriggers.has(next) || (next >= 0xC0 && next <= 0xFF)) {
        sisMode = true;
        op = romBytes[pc++];
      } else {
        // Actual LD B,B
        instructions.push({ addr: instrStart, bytes: '40', mnemonic: 'LD B, B', comment: '' });
        continue;
      }
    }

    const sisStr = sisMode ? '.SIS ' : '';
    let mnemonic = '';
    let comment  = '';

    // IX prefix (DD)
    if (op === 0xDD) {
      const decoded = decodeIndexed(pc, 0xDD, sisStr, romBytes, callTargets, ramAddrs, ioAddrs);
      pc = decoded.pc;
      if (decoded.mnemonic === null) {
        // DD prefix was ignored — fall through to plain decode of the next byte
        op = romBytes[pc++];
        // (falls into the main opcode switch below by setting mnemonic via goto-equivalent)
        // We handle this by recursing into the plain decode path inline:
        mnemonic = `[DD-ignored] DB ${hex(op)}`;  // placeholder, overwritten below
        comment  = 'DD prefix ignored, plain opcode follows';
        // Actually re-decode: reset op and jump to plain switch
        // Simplest: just label it with the plain mnemonic by doing a mini-decode
        const plainMnemonics = {
          0x07: 'RLCA', 0x0F: 'RRCA', 0x17: 'RLA', 0x1F: 'RRA',
          0x00: 'NOP', 0x76: 'HALT', 0xF3: 'DI', 0xFB: 'EI',
          0xC9: 'RET', 0xD9: 'EXX', 0xEB: 'EX DE, HL', 0x37: 'SCF', 0x3F: 'CCF',
          0x2F: 'CPL', 0x08: "EX AF, AF'", 0x27: 'DAA', 0x3F: 'CCF',
        };
        mnemonic = `${sisStr}${plainMnemonics[op] ?? `DB ${hex(op)}`}`;
        comment  = 'DD prefix was ignored (no IX operand)';
      } else {
        mnemonic = decoded.mnemonic;
        comment  = decoded.comment;
      }
    }
    // IY prefix (FD)
    else if (op === 0xFD) {
      const decoded = decodeIndexed(pc, 0xFD, sisStr, romBytes, callTargets, ramAddrs, ioAddrs);
      pc = decoded.pc;
      if (decoded.mnemonic === null) {
        op = romBytes[pc++];
        const plainMnemonics = {
          0x07: 'RLCA', 0x0F: 'RRCA', 0x17: 'RLA', 0x1F: 'RRA',
          0x00: 'NOP', 0x76: 'HALT', 0xF3: 'DI', 0xFB: 'EI',
          0xC9: 'RET', 0xD9: 'EXX', 0xEB: 'EX DE, HL', 0x37: 'SCF', 0x3F: 'CCF',
          0x2F: 'CPL', 0x08: "EX AF, AF'", 0x27: 'DAA',
        };
        mnemonic = `${sisStr}${plainMnemonics[op] ?? `DB ${hex(op)}`}`;
        comment  = 'FD prefix was ignored (no IY operand)';
      } else {
        mnemonic = decoded.mnemonic;
        comment  = decoded.comment;
      }
    }
    // CB prefix (bit operations without IX/IY)
    else if (op === 0xCB) {
      const cbOp   = romBytes[pc++];
      const bitNum = (cbOp >> 3) & 7;
      const reg    = r8[cbOp & 7];
      if ((cbOp & 0xC0) === 0x00) mnemonic = `${sisStr}${rot[bitNum]} ${reg}`;
      else if ((cbOp & 0xC0) === 0x40) mnemonic = `${sisStr}BIT ${bitNum}, ${reg}`;
      else if ((cbOp & 0xC0) === 0x80) mnemonic = `${sisStr}RES ${bitNum}, ${reg}`;
      else mnemonic = `${sisStr}SET ${bitNum}, ${reg}`;
    }
    // ED prefix (extended)
    else if (op === 0xED) {
      const edOp = romBytes[pc++];
      switch (edOp) {
        case 0x43: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD (${hex(a,6)}), BC`; trackAddr(a, ramAddrs, ioAddrs); comment = describeAddr(a); break; }
        case 0x53: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD (${hex(a,6)}), DE`; trackAddr(a, ramAddrs, ioAddrs); comment = describeAddr(a); break; }
        case 0x63: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD (${hex(a,6)}), HL`; trackAddr(a, ramAddrs, ioAddrs); comment = describeAddr(a); break; }
        case 0x73: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD (${hex(a,6)}), SP`; trackAddr(a, ramAddrs, ioAddrs); comment = describeAddr(a); break; }
        case 0x4B: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD BC, (${hex(a,6)})`; trackAddr(a, ramAddrs, ioAddrs); comment = describeAddr(a); break; }
        case 0x5B: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD DE, (${hex(a,6)})`; trackAddr(a, ramAddrs, ioAddrs); comment = describeAddr(a); break; }
        case 0x6B: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD HL, (${hex(a,6)})`; trackAddr(a, ramAddrs, ioAddrs); comment = describeAddr(a); break; }
        case 0x7B: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD SP, (${hex(a,6)})`; trackAddr(a, ramAddrs, ioAddrs); comment = describeAddr(a); break; }
        case 0xB0: mnemonic = `${sisStr}LDIR`; break;
        case 0xB8: mnemonic = `${sisStr}LDDR`; break;
        case 0xA0: mnemonic = `${sisStr}LDI`; break;
        case 0xA8: mnemonic = `${sisStr}LDD`; break;
        case 0xB1: mnemonic = `${sisStr}CPIR`; break;
        case 0xA1: mnemonic = `${sisStr}CPI`; break;
        case 0x56: mnemonic = `${sisStr}IM 1`; break;
        case 0x5E: mnemonic = `${sisStr}IM 2`; break;
        case 0x46: mnemonic = `${sisStr}IM 0`; break;
        case 0x57: mnemonic = `${sisStr}LD A, I`; break;
        case 0x5F: mnemonic = `${sisStr}LD A, R`; break;
        case 0x47: mnemonic = `${sisStr}LD I, A`; break;
        case 0x4F: mnemonic = `${sisStr}LD R, A`; break;
        case 0x42: mnemonic = `${sisStr}SBC HL, BC`; break;
        case 0x52: mnemonic = `${sisStr}SBC HL, DE`; break;
        case 0x62: mnemonic = `${sisStr}SBC HL, HL`; break;
        case 0x72: mnemonic = `${sisStr}SBC HL, SP`; break;
        case 0x4A: mnemonic = `${sisStr}ADC HL, BC`; break;
        case 0x5A: mnemonic = `${sisStr}ADC HL, DE`; break;
        case 0x6A: mnemonic = `${sisStr}ADC HL, HL`; break;
        case 0x7A: mnemonic = `${sisStr}ADC HL, SP`; break;
        case 0x44: mnemonic = `${sisStr}NEG`; break;
        case 0x4D: mnemonic = `${sisStr}RETI`; break;
        case 0x45: mnemonic = `${sisStr}RETN`; break;
        case 0x5C: mnemonic = `${sisStr}NEG`; break; // alternate NEG
        default:   mnemonic = `${sisStr}ED ${hex(edOp)}`; break;
      }
    }
    // Main opcode table
    else {
      switch (op) {
        case 0x00: mnemonic = `${sisStr}NOP`; break;
        case 0x76: mnemonic = `${sisStr}HALT`; break;
        case 0xF3: mnemonic = `${sisStr}DI`; break;
        case 0xFB: mnemonic = `${sisStr}EI`; break;
        case 0xC9: mnemonic = `${sisStr}RET`; break;
        case 0xD9: mnemonic = `${sisStr}EXX`; break;
        case 0xEB: mnemonic = `${sisStr}EX DE, HL`; break;
        case 0xE9: mnemonic = `${sisStr}JP (HL)`; break;
        case 0x37: mnemonic = `${sisStr}SCF`; break;
        case 0x3F: mnemonic = `${sisStr}CCF`; break;
        case 0x2F: mnemonic = `${sisStr}CPL`; break;
        case 0x08: mnemonic = `${sisStr}EX AF, AF'`; break;
        case 0xE3: mnemonic = `${sisStr}EX (SP), HL`; break;
        case 0x27: mnemonic = `${sisStr}DAA`; break;

        case 0x3D: mnemonic = `${sisStr}DEC A`; break;
        case 0x3C: mnemonic = `${sisStr}INC A`; break;
        case 0x05: mnemonic = `${sisStr}DEC B`; break;
        case 0x04: mnemonic = `${sisStr}INC B`; break;
        case 0x0D: mnemonic = `${sisStr}DEC C`; break;
        case 0x0C: mnemonic = `${sisStr}INC C`; break;
        case 0x15: mnemonic = `${sisStr}DEC D`; break;
        case 0x14: mnemonic = `${sisStr}INC D`; break;
        case 0x1D: mnemonic = `${sisStr}DEC E`; break;
        case 0x1C: mnemonic = `${sisStr}INC E`; break;
        case 0x25: mnemonic = `${sisStr}DEC H`; break;
        case 0x24: mnemonic = `${sisStr}INC H`; break;
        case 0x2D: mnemonic = `${sisStr}DEC L`; break;
        case 0x2C: mnemonic = `${sisStr}INC L`; break;
        case 0x35: mnemonic = `${sisStr}DEC (HL)`; break;
        case 0x34: mnemonic = `${sisStr}INC (HL)`; break;

        // ADD HL, rr
        case 0x09: mnemonic = `${sisStr}ADD HL, BC`; break;
        case 0x19: mnemonic = `${sisStr}ADD HL, DE`; break;
        case 0x29: mnemonic = `${sisStr}ADD HL, HL`; break;
        case 0x39: mnemonic = `${sisStr}ADD HL, SP`; break;

        // LD r, r
        case 0x41: case 0x42: case 0x43: case 0x44: case 0x45: case 0x46: case 0x47:
        case 0x48: case 0x49: case 0x4A: case 0x4B: case 0x4C: case 0x4D: case 0x4E: case 0x4F:
        case 0x50: case 0x51: case 0x52: case 0x53: case 0x54: case 0x55: case 0x56: case 0x57:
        case 0x58: case 0x59: case 0x5A: case 0x5B: case 0x5C: case 0x5D: case 0x5E: case 0x5F:
        case 0x60: case 0x61: case 0x62: case 0x63: case 0x64: case 0x65: case 0x66: case 0x67:
        case 0x68: case 0x69: case 0x6A: case 0x6B: case 0x6C: case 0x6D: case 0x6E: case 0x6F:
        case 0x70: case 0x71: case 0x72: case 0x73: case 0x74: case 0x75: case 0x77:
        case 0x78: case 0x79: case 0x7A: case 0x7B: case 0x7C: case 0x7D: case 0x7E: case 0x7F:
          mnemonic = `${sisStr}LD ${r8[(op >> 3) & 7]}, ${r8[op & 7]}`;
          break;

        // ALU r
        case 0x80: case 0x81: case 0x82: case 0x83: case 0x84: case 0x85: case 0x86: case 0x87:
        case 0x88: case 0x89: case 0x8A: case 0x8B: case 0x8C: case 0x8D: case 0x8E: case 0x8F:
        case 0x90: case 0x91: case 0x92: case 0x93: case 0x94: case 0x95: case 0x96: case 0x97:
        case 0x98: case 0x99: case 0x9A: case 0x9B: case 0x9C: case 0x9D: case 0x9E: case 0x9F:
        case 0xA0: case 0xA1: case 0xA2: case 0xA3: case 0xA4: case 0xA5: case 0xA6: case 0xA7:
        case 0xA8: case 0xA9: case 0xAA: case 0xAB: case 0xAC: case 0xAD: case 0xAE: case 0xAF:
        case 0xB0: case 0xB1: case 0xB2: case 0xB3: case 0xB4: case 0xB5: case 0xB6: case 0xB7:
        case 0xB8: case 0xB9: case 0xBA: case 0xBB: case 0xBC: case 0xBD: case 0xBE: case 0xBF:
          mnemonic = `${sisStr}${alu[(op >> 3) & 7]} ${r8[op & 7]}`;
          break;

        // ALU immediate
        case 0xC6: { const n = romBytes[pc++]; mnemonic = `${sisStr}ADD A, ${hex(n)}`; break; }
        case 0xCE: { const n = romBytes[pc++]; mnemonic = `${sisStr}ADC A, ${hex(n)}`; break; }
        case 0xD6: { const n = romBytes[pc++]; mnemonic = `${sisStr}SUB ${hex(n)}`; break; }
        case 0xDE: { const n = romBytes[pc++]; mnemonic = `${sisStr}SBC A, ${hex(n)}`; break; }
        case 0xE6: { const n = romBytes[pc++]; mnemonic = `${sisStr}AND ${hex(n)}`; break; }
        case 0xEE: { const n = romBytes[pc++]; mnemonic = `${sisStr}XOR ${hex(n)}`; break; }
        case 0xF6: { const n = romBytes[pc++]; mnemonic = `${sisStr}OR ${hex(n)}`; break; }
        case 0xFE: { const n = romBytes[pc++]; mnemonic = `${sisStr}CP ${hex(n)}`; break; }

        // LD r, n
        case 0x06: { const n = romBytes[pc++]; mnemonic = `${sisStr}LD B, ${hex(n)}`; break; }
        case 0x0E: { const n = romBytes[pc++]; mnemonic = `${sisStr}LD C, ${hex(n)}`; break; }
        case 0x16: { const n = romBytes[pc++]; mnemonic = `${sisStr}LD D, ${hex(n)}`; break; }
        case 0x1E: { const n = romBytes[pc++]; mnemonic = `${sisStr}LD E, ${hex(n)}`; break; }
        case 0x26: { const n = romBytes[pc++]; mnemonic = `${sisStr}LD H, ${hex(n)}`; break; }
        case 0x2E: { const n = romBytes[pc++]; mnemonic = `${sisStr}LD L, ${hex(n)}`; break; }
        case 0x36: { const n = romBytes[pc++]; mnemonic = `${sisStr}LD (HL), ${hex(n)}`; break; }
        case 0x3E: { const n = romBytes[pc++]; mnemonic = `${sisStr}LD A, ${hex(n)}`; break; }

        // LD rr, nn (24-bit in ADL mode)
        case 0x01: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD BC, ${hex(a,6)}`; break; }
        case 0x11: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD DE, ${hex(a,6)}`; break; }
        case 0x21: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD HL, ${hex(a,6)}`; break; }
        case 0x31: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD SP, ${hex(a,6)}`; break; }

        // INC / DEC rr
        case 0x03: mnemonic = `${sisStr}INC BC`; break;
        case 0x13: mnemonic = `${sisStr}INC DE`; break;
        case 0x23: mnemonic = `${sisStr}INC HL`; break;
        case 0x33: mnemonic = `${sisStr}INC SP`; break;
        case 0x0B: mnemonic = `${sisStr}DEC BC`; break;
        case 0x1B: mnemonic = `${sisStr}DEC DE`; break;
        case 0x2B: mnemonic = `${sisStr}DEC HL`; break;
        case 0x3B: mnemonic = `${sisStr}DEC SP`; break;

        // PUSH / POP
        case 0xC5: mnemonic = `${sisStr}PUSH BC`; break;
        case 0xD5: mnemonic = `${sisStr}PUSH DE`; break;
        case 0xE5: mnemonic = `${sisStr}PUSH HL`; break;
        case 0xF5: mnemonic = `${sisStr}PUSH AF`; break;
        case 0xC1: mnemonic = `${sisStr}POP BC`; break;
        case 0xD1: mnemonic = `${sisStr}POP DE`; break;
        case 0xE1: mnemonic = `${sisStr}POP HL`; break;
        case 0xF1: mnemonic = `${sisStr}POP AF`; break;

        // Absolute jumps / calls (24-bit in ADL)
        case 0xC3: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}JP ${hex(a,6)}`; callTargets.push({addr: a, type: 'JP'}); break; }
        case 0xCD: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}CALL ${hex(a,6)}`; callTargets.push({addr: a, type: 'CALL'}); break; }

        case 0xC2: case 0xCA: case 0xD2: case 0xDA: case 0xE2: case 0xEA: case 0xF2: case 0xFA: {
          const c = ccN[(op >> 3) & 7];
          const a = read24(pc); pc += 3;
          mnemonic = `${sisStr}JP ${c}, ${hex(a,6)}`;
          callTargets.push({addr: a, type: `JP ${c}`});
          break;
        }

        case 0xC4: case 0xCC: case 0xD4: case 0xDC: case 0xE4: case 0xEC: case 0xF4: case 0xFC: {
          const c = ccN[(op >> 3) & 7];
          const a = read24(pc); pc += 3;
          mnemonic = `${sisStr}CALL ${c}, ${hex(a,6)}`;
          callTargets.push({addr: a, type: `CALL ${c}`});
          break;
        }

        // Conditional RET
        case 0xC0: mnemonic = `${sisStr}RET NZ`; break;
        case 0xC8: mnemonic = `${sisStr}RET Z`; break;
        case 0xD0: mnemonic = `${sisStr}RET NC`; break;
        case 0xD8: mnemonic = `${sisStr}RET C`; break;
        case 0xE0: mnemonic = `${sisStr}RET PO`; break;
        case 0xE8: mnemonic = `${sisStr}RET PE`; break;
        case 0xF0: mnemonic = `${sisStr}RET P`; break;
        case 0xF8: mnemonic = `${sisStr}RET M`; break;

        // JR (signed byte offset)
        case 0x18: { const d = signedByte(romBytes[pc++]); const t = pc + d; mnemonic = `${sisStr}JR ${hex(t,6)}`; callTargets.push({addr: t, type: 'JR'}); break; }
        case 0x20: { const d = signedByte(romBytes[pc++]); const t = pc + d; mnemonic = `${sisStr}JR NZ, ${hex(t,6)}`; callTargets.push({addr: t, type: 'JR NZ'}); break; }
        case 0x28: { const d = signedByte(romBytes[pc++]); const t = pc + d; mnemonic = `${sisStr}JR Z, ${hex(t,6)}`; callTargets.push({addr: t, type: 'JR Z'}); break; }
        case 0x30: { const d = signedByte(romBytes[pc++]); const t = pc + d; mnemonic = `${sisStr}JR NC, ${hex(t,6)}`; callTargets.push({addr: t, type: 'JR NC'}); break; }
        case 0x38: { const d = signedByte(romBytes[pc++]); const t = pc + d; mnemonic = `${sisStr}JR C, ${hex(t,6)}`; callTargets.push({addr: t, type: 'JR C'}); break; }

        // DJNZ
        case 0x10: { const d = signedByte(romBytes[pc++]); const t = pc + d; mnemonic = `${sisStr}DJNZ ${hex(t,6)}`; callTargets.push({addr: t, type: 'DJNZ'}); break; }

        // Direct memory loads/stores (24-bit addr in ADL)
        case 0x3A: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD A, (${hex(a,6)})`; trackAddr(a, ramAddrs, ioAddrs); comment = describeAddr(a); break; }
        case 0x32: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD (${hex(a,6)}), A`; trackAddr(a, ramAddrs, ioAddrs); comment = describeAddr(a); break; }
        case 0x2A: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD HL, (${hex(a,6)})`; trackAddr(a, ramAddrs, ioAddrs); comment = describeAddr(a); break; }
        case 0x22: { const a = read24(pc); pc += 3; mnemonic = `${sisStr}LD (${hex(a,6)}), HL`; trackAddr(a, ramAddrs, ioAddrs); comment = describeAddr(a); break; }

        case 0x02: mnemonic = `${sisStr}LD (BC), A`; break;
        case 0x12: mnemonic = `${sisStr}LD (DE), A`; break;
        case 0x0A: mnemonic = `${sisStr}LD A, (BC)`; break;
        case 0x1A: mnemonic = `${sisStr}LD A, (DE)`; break;

        // Port I/O -- eZ80: OUT (n),A = D3 n (1-byte port); OUT (nn),A = D3 nn nn (uncommon)
        // TI-84 CE LCD SPI is at 16-bit ports 0x4000-0x401F
        // The eZ80 OUT instruction is D3 followed by 1 byte (8-bit port) in standard Z80 mode.
        // In eZ80 mode, port addresses can be 16-bit: instruction is D3 lo hi.
        // We read 2 bytes to catch both conventions and report what we see.
        case 0xD3: {
          const portLo = romBytes[pc++];
          const portHi = romBytes[pc];  // peek -- may or may not be part of addr
          // Heuristic: if portLo is 0x00 and portHi looks like upper byte of 0x4000, it's 16-bit
          // eZ80 OUT (C),r / OUT0 are via ED prefix so D3 is always OUT (n),A
          // Use 1-byte port: portLo
          mnemonic = `${sisStr}OUT (${hex(portLo)}), A`;
          comment = `write port ${hex(portLo)} ${describePort(portLo)}`;
          ports.push({ dir: 'OUT', port: portLo });
          break;
        }
        case 0xDB: {
          const portLo = romBytes[pc++];
          mnemonic = `${sisStr}IN A, (${hex(portLo)})`;
          comment = `read port ${hex(portLo)} ${describePort(portLo)}`;
          ports.push({ dir: 'IN', port: portLo });
          break;
        }

        // Rotates
        case 0x07: mnemonic = `${sisStr}RLCA`; break;
        case 0x0F: mnemonic = `${sisStr}RRCA`; break;
        case 0x17: mnemonic = `${sisStr}RLA`; break;
        case 0x1F: mnemonic = `${sisStr}RRA`; break;

        // RST
        case 0xC7: case 0xCF: case 0xD7: case 0xDF:
        case 0xE7: case 0xEF: case 0xF7: case 0xFF:
          mnemonic = `${sisStr}RST ${hex(op & 0x38)}`;
          break;

        default:
          mnemonic = `${sisStr}DB ${hex(op)}  ; unknown`;
          break;
      }
    }

    const bytes = [];
    for (let i = instrStart; i < pc; i++) bytes.push(romBytes[i].toString(16).padStart(2, '0'));
    instructions.push({ addr: instrStart, bytes: bytes.join(' '), mnemonic, comment });

    // Track function boundaries but DON'T stop — we want the full range decoded.
    // Mark RET / unconditional JP as function-ending for boundary annotation.
    const isRet = mnemonic === 'RET' || mnemonic === '.SIS RET';
    const isUncondJP = /^(\.SIS )?JP 0x[0-9A-F]+$/.test(mnemonic);
    if (isRet || isUncondJP) {
      instructions[instructions.length - 1].funcEnd = true;
    }
  }

  return { instructions, callTargets, ramAddrs, ioAddrs, ports, length: pc - startAddr };
}

// ---------------------------------------------------------------------------
// Run disassembly — decode the full range PRIMARY..DUMP_END without stopping
// ---------------------------------------------------------------------------
console.log(`\n=== DISASSEMBLY: 0x${PRIMARY.toString(16).toUpperCase()} - 0x${DUMP_END.toString(16).toUpperCase()} (ADL mode) ===`);
const result = disassemble(PRIMARY, DUMP_LEN + 64);  // a bit past dump end to catch trailing instructions

for (const instr of result.instructions) {
  if (instr.addr >= DUMP_END) break;  // stop printing past the dump window
  const addrStr  = instr.addr.toString(16).padStart(6, '0');
  const bytesStr = instr.bytes.padEnd(20);
  const funcBoundary = instr.funcEnd ? '  <-- function end' : '';
  console.log(`  ${addrStr}  ${bytesStr}  ${instr.mnemonic}${instr.comment ? '  ; ' + instr.comment : ''}${funcBoundary}`);
}

// ---------------------------------------------------------------------------
// Analysis summary — covers entire decoded range PRIMARY..DUMP_END
// ---------------------------------------------------------------------------
console.log(`\n=== ANALYSIS: Full range 0x${PRIMARY.toString(16).toUpperCase()} - 0x${DUMP_END.toString(16).toUpperCase()} ===`);
const instrInRange = result.instructions.filter(i => i.addr < DUMP_END);
console.log(`  Bytes decoded  : ${DUMP_LEN}`);
console.log(`  Instructions   : ${instrInRange.length}`);

// RAM addresses
if (result.ramAddrs.length > 0) {
  const unique = [...new Set(result.ramAddrs)].sort((a, b) => a - b);
  console.log(`\n  RAM addresses (${unique.length}):`);
  for (const a of unique) {
    const isBppFlag = a === 0xD000C6;
    const isBppWS   = a >= 0xD005EC && a <= 0xD02FD9;
    const isVRAM    = a >= 0xD40000;
    const tag = isBppFlag ? ' *** BPP MODE FLAG ***'
               : isBppWS  ? ' [BPP workspace]'
               : isVRAM   ? ' [VRAM]'
               : '';
    console.log(`    ${hex(a, 6)} ${describeAddr(a)}${tag}`);
  }
} else {
  console.log(`\n  No RAM addresses decoded directly.`);
}

// Port I/O
if (result.ports.length > 0) {
  const uniqPorts = [];
  const seen = new Set();
  for (const p of result.ports) {
    const k = `${p.dir}:${p.port}`;
    if (!seen.has(k)) { seen.add(k); uniqPorts.push(p); }
  }
  console.log(`\n  Port I/O (${uniqPorts.length}):`);
  for (const p of uniqPorts) {
    console.log(`    ${p.dir} port ${hex(p.port)} ${describePort(p.port)}`);
  }
} else {
  console.log(`\n  Port I/O: none.`);
}

// CALL / JP targets
if (result.callTargets.length > 0) {
  const uniq = [];
  const seen = new Set();
  for (const t of result.callTargets) {
    const k = `${t.type}:${t.addr}`;
    if (!seen.has(k)) { seen.add(k); uniq.push(t); }
  }
  console.log(`\n  Branch/call targets (${uniq.length}):`);
  for (const t of uniq) {
    const inFunc = t.addr >= PRIMARY && t.addr < PRIMARY + result.length;
    const tag = inFunc ? '(local)' : '(external)';
    console.log(`    ${t.type.padEnd(10)} -> ${hex(t.addr, 6)}  ${tag}`);
  }
} else {
  console.log(`\n  No CALL/JP targets found.`);
}

// ---------------------------------------------------------------------------
// BPP-specific interpretation
// ---------------------------------------------------------------------------
console.log(`\n=== BPP INTERPRETATION ===`);
const mnemonics = result.instructions.map(i => i.mnemonic);

const hasBppFlag = result.ramAddrs.some(a => a === 0xD000C6);
console.log(`  D000C6 BPP flag accessed   : ${hasBppFlag ? 'YES ***' : 'no'}`);

const bppWSHits = result.ramAddrs.filter(a => a >= 0xD005EC && a <= 0xD02FD9);
console.log(`  BPP workspace accesses     : ${bppWSHits.length > 0 ? bppWSHits.map(a => hex(a, 6)).join(', ') : 'none'}`);

const hasLDIR = mnemonics.some(m => m.includes('LDIR'));
console.log(`  LDIR (block copy)          : ${hasLDIR ? 'YES' : 'no'}`);

const lcdPorts = result.ports.filter(p => p.port >= 0x40 && p.port <= 0x5F);
console.log(`  LCD SPI port I/O           : ${lcdPorts.length > 0 ? lcdPorts.map(p => `${p.dir} ${hex(p.port)}`).join(', ') : 'none'}`);

const hasVRAM = result.ramAddrs.some(a => a >= 0xD40000);
console.log(`  VRAM access                : ${hasVRAM ? 'YES' : 'no'}`);

const externalCalls = result.callTargets.filter(t => {
  const inFunc = t.addr >= PRIMARY && t.addr < PRIMARY + result.length;
  return !inFunc && (t.type === 'CALL' || t.type.startsWith('CALL '));
});
if (externalCalls.length > 0) {
  console.log(`\n  External CALL sub-functions:`);
  for (const t of externalCalls) {
    console.log(`    ${hex(t.addr, 6)}  (${t.type})`);
  }
}

console.log(`\nDone.`);
