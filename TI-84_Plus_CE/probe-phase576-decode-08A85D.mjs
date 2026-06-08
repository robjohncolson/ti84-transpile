/**
 * probe-phase576-decode-08A85D.mjs
 *
 * Decode the region around 0x08A85D which contains a CALL NZ,0x0A1FB5
 * (conditional call to scroll buffer swap — 8400 bytes LDIR D07396->D031F6).
 * Disassembles 0x08A820..0x08A8C0, finds the function entry point,
 * identifies the Z flag source before the conditional CALL NZ, and
 * scans ROM for all callers of the identified function.
 */
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(join(__dirname, 'ROM.rom'));

// -- Helpers --

function hex(v, w = 6) {
  return '0x' + v.toString(16).toUpperCase().padStart(w, '0');
}

function read24LE(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function hexBytesArr(start, len) {
  const out = [];
  for (let i = 0; i < len; i++) {
    out.push(rom[start + i].toString(16).toUpperCase().padStart(2, '0'));
  }
  return out.join(' ');
}

// -- Simple eZ80 ADL-mode disassembler --

function disasmOne(addr) {
  const b0 = rom[addr];
  const b1 = rom[addr + 1];

  // DD/FD prefix
  if (b0 === 0xDD || b0 === 0xFD) {
    const reg = b0 === 0xDD ? 'IX' : 'IY';

    if (b1 === 0xCB) {
      const disp = rom[addr + 2];
      const op = rom[addr + 3];
      const dispHex = '0x' + disp.toString(16).toUpperCase().padStart(2, '0');
      if ((op & 0xC0) === 0x40) {
        const bit = (op >> 3) & 7;
        return { mnemonic: `BIT ${bit},(${reg}+${dispHex})`, size: 4 };
      }
      if ((op & 0xC0) === 0xC0) {
        const bit = (op >> 3) & 7;
        return { mnemonic: `SET ${bit},(${reg}+${dispHex})`, size: 4 };
      }
      if ((op & 0xC0) === 0x80) {
        const bit = (op >> 3) & 7;
        return { mnemonic: `RES ${bit},(${reg}+${dispHex})`, size: 4 };
      }
      return { mnemonic: `${reg} CB ${dispHex} ${hex(op, 2)}`, size: 4 };
    }
    if (b1 === 0x21) { const imm = read24LE(addr + 2); return { mnemonic: `LD ${reg},${hex(imm)}`, size: 5 }; }
    if (b1 === 0x36) {
      const d = rom[addr + 2]; const v = rom[addr + 3];
      return { mnemonic: `LD (${reg}+0x${d.toString(16).toUpperCase().padStart(2,'0')}),0x${v.toString(16).toUpperCase().padStart(2,'0')}`, size: 4 };
    }
    if (b1 === 0xE5) return { mnemonic: `PUSH ${reg}`, size: 2 };
    if (b1 === 0xE1) return { mnemonic: `POP ${reg}`, size: 2 };
    // LD r,(IX/IY+d)
    const ldRegs = {0x7E:'A',0x46:'B',0x4E:'C',0x56:'D',0x5E:'E',0x66:'H',0x6E:'L'};
    if (ldRegs[b1]) {
      const d = rom[addr + 2];
      return { mnemonic: `LD ${ldRegs[b1]},(${reg}+0x${d.toString(16).toUpperCase().padStart(2,'0')})`, size: 3 };
    }
    // LD (IX/IY+d),r
    const stRegs = {0x77:'A',0x70:'B',0x71:'C',0x72:'D',0x73:'E',0x74:'H',0x75:'L'};
    if (stRegs[b1]) {
      const d = rom[addr + 2];
      return { mnemonic: `LD (${reg}+0x${d.toString(16).toUpperCase().padStart(2,'0')}),${stRegs[b1]}`, size: 3 };
    }
    if (b1 === 0xE9) return { mnemonic: `JP (${reg})`, size: 2 };
    if (b1 === 0x23) return { mnemonic: `INC ${reg}`, size: 2 };
    if (b1 === 0x2B) return { mnemonic: `DEC ${reg}`, size: 2 };
    if (b1 === 0x09) return { mnemonic: `ADD ${reg},BC`, size: 2 };
    if (b1 === 0x19) return { mnemonic: `ADD ${reg},DE`, size: 2 };
    if (b1 === 0x29) return { mnemonic: `ADD ${reg},${reg}`, size: 2 };
    if (b1 === 0x39) return { mnemonic: `ADD ${reg},SP`, size: 2 };
    if (b1 === 0x34) {
      const d = rom[addr + 2];
      return { mnemonic: `INC (${reg}+0x${d.toString(16).toUpperCase().padStart(2,'0')})`, size: 3 };
    }
    if (b1 === 0x35) {
      const d = rom[addr + 2];
      return { mnemonic: `DEC (${reg}+0x${d.toString(16).toUpperCase().padStart(2,'0')})`, size: 3 };
    }
    if (b1 === 0xBE) {
      const d = rom[addr + 2];
      return { mnemonic: `CP (${reg}+0x${d.toString(16).toUpperCase().padStart(2,'0')})`, size: 3 };
    }
    return { mnemonic: `DB 0x${b0.toString(16).toUpperCase().padStart(2,'0')} 0x${b1.toString(16).toUpperCase().padStart(2,'0')}`, size: 2 };
  }

  // ED prefix
  if (b0 === 0xED) {
    if (b1 === 0xB0) return { mnemonic: 'LDIR', size: 2 };
    if (b1 === 0xB8) return { mnemonic: 'LDDR', size: 2 };
    if (b1 === 0x43) { const a = read24LE(addr+2); return { mnemonic: `LD (${hex(a)}),BC`, size: 5 }; }
    if (b1 === 0x53) { const a = read24LE(addr+2); return { mnemonic: `LD (${hex(a)}),DE`, size: 5 }; }
    if (b1 === 0x73) { const a = read24LE(addr+2); return { mnemonic: `LD (${hex(a)}),SP`, size: 5 }; }
    if (b1 === 0x4B) { const a = read24LE(addr+2); return { mnemonic: `LD BC,(${hex(a)})`, size: 5 }; }
    if (b1 === 0x5B) { const a = read24LE(addr+2); return { mnemonic: `LD DE,(${hex(a)})`, size: 5 }; }
    if (b1 === 0x7B) { const a = read24LE(addr+2); return { mnemonic: `LD SP,(${hex(a)})`, size: 5 }; }
    if (b1 === 0x44) return { mnemonic: 'NEG', size: 2 };
    if (b1 === 0x4D) return { mnemonic: 'RETI', size: 2 };
    if (b1 === 0x45) return { mnemonic: 'RETN', size: 2 };
    if (b1 === 0x46) return { mnemonic: 'IM 0', size: 2 };
    if (b1 === 0x56) return { mnemonic: 'IM 1', size: 2 };
    if (b1 === 0x5E) return { mnemonic: 'IM 2', size: 2 };
    if (b1 === 0x57) return { mnemonic: 'LD A,I', size: 2 };
    if (b1 === 0x47) return { mnemonic: 'LD I,A', size: 2 };
    if (b1 === 0xA0) return { mnemonic: 'LDI', size: 2 };
    if (b1 === 0xA8) return { mnemonic: 'LDD', size: 2 };
    return { mnemonic: `DB ED ${b1.toString(16).toUpperCase().padStart(2,'0')}`, size: 2 };
  }

  // CB prefix
  if (b0 === 0xCB) {
    const op = b1;
    const regNames = ['B','C','D','E','H','L','(HL)','A'];
    const r = regNames[op & 7];
    if ((op & 0xC0) === 0x40) { const bit = (op >> 3) & 7; return { mnemonic: `BIT ${bit},${r}`, size: 2 }; }
    if ((op & 0xC0) === 0xC0) { const bit = (op >> 3) & 7; return { mnemonic: `SET ${bit},${r}`, size: 2 }; }
    if ((op & 0xC0) === 0x80) { const bit = (op >> 3) & 7; return { mnemonic: `RES ${bit},${r}`, size: 2 }; }
    const ops = ['RLC','RRC','RL','RR','SLA','SRA','SLL','SRL'];
    const idx = (op >> 3) & 7;
    return { mnemonic: `${ops[idx]} ${r}`, size: 2 };
  }

  // Single-byte
  if (b0 === 0x00) return { mnemonic: 'NOP', size: 1 };
  if (b0 === 0x76) return { mnemonic: 'HALT', size: 1 };
  if (b0 === 0xC9) return { mnemonic: 'RET', size: 1 };
  if (b0 === 0xC0) return { mnemonic: 'RET NZ', size: 1 };
  if (b0 === 0xC8) return { mnemonic: 'RET Z', size: 1 };
  if (b0 === 0xD0) return { mnemonic: 'RET NC', size: 1 };
  if (b0 === 0xD8) return { mnemonic: 'RET C', size: 1 };
  if (b0 === 0xE0) return { mnemonic: 'RET PO', size: 1 };
  if (b0 === 0xE8) return { mnemonic: 'RET PE', size: 1 };
  if (b0 === 0xF0) return { mnemonic: 'RET P', size: 1 };
  if (b0 === 0xF8) return { mnemonic: 'RET M', size: 1 };
  if (b0 === 0xF3) return { mnemonic: 'DI', size: 1 };
  if (b0 === 0xFB) return { mnemonic: 'EI', size: 1 };
  if (b0 === 0xF9) return { mnemonic: 'LD SP,HL', size: 1 };
  if (b0 === 0xEB) return { mnemonic: 'EX DE,HL', size: 1 };
  if (b0 === 0xD9) return { mnemonic: 'EXX', size: 1 };
  if (b0 === 0x08) return { mnemonic: "EX AF,AF
