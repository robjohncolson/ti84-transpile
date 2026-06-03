/**
 * probe-phase510-decode-0B83FD-callees.mjs
 *
 * Decodes the four undecoded callees of 0x0B83FD to find which one
 * calls 0x07D583 (the descriptor populator).
 *
 * Targets: 0x0BA064, 0x0B9473, 0x0BAD56, 0x0B84CA
 */

import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

function read24(buf, off) {
  return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16);
}

function read16(buf, off) {
  return buf[off] | (buf[off + 1] << 8);
}

function hex(v, digits = 6) {
  return '0x' + v.toString(16).toUpperCase().padStart(digits, '0');
}

function disassemble(buf, startAddr, maxBytes) {
  const lines = [];
  let i = 0;
  const calls = [];
  const ramAccesses = [];

  while (i < maxBytes) {
    const addr = startAddr + i;
    let b = buf[startAddr + i];
    let prefix = '';
    let sisMode = false;
    let ixMode = false;
    let iyMode = false;

    // Handle prefix bytes
    if (b === 0x52) { // .SIS
      sisMode = true;
      prefix = '.SIS ';
      i++;
      b = buf[startAddr + i];
    } else if (b === 0x49) { // .LIS
      prefix = '.LIS ';
      i++;
      b = buf[startAddr + i];
    } else if (b === 0xDD) { // IX
      ixMode = true;
      prefix = 'IX: ';
      i++;
      b = buf[startAddr + i];
      if (b === 0xCB) {
        // DD CB dd op — IX bit operation
        const d = buf[startAddr + i + 1];
        const op = buf[startAddr + i + 2];
        lines.push(`  ${hex(addr)}: DD CB ${d.toString(16).padStart(2,'0')} ${op.toString(16).padStart(2,'0')}  IX+${d} bit op ${hex(op,2)}`);
        i += 3;
        continue;
      }
    } else if (b === 0xFD) { // IY
      iyMode = true;
      prefix = 'IY: ';
      i++;
      b = buf[startAddr + i];
      if (b === 0xCB) {
        // FD CB dd op — IY bit operation
        const d = buf[startAddr + i + 1];
        const op = buf[startAddr + i + 2];
        lines.push(`  ${hex(addr)}: FD CB ${d.toString(16).padStart(2,'0')} ${op.toString(16).padStart(2,'0')}  IY+${d} bit op ${hex(op,2)}`);
        i += 3;
        continue;
      }
    }

    const addrSize = sisMode ? 2 : 3;
    const readAddr = sisMode ? read16 : read24;

    // Decode instruction
    switch (b) {
      case 0xCD: { // CALL addr
        const target = readAddr(buf, startAddr + i + 1);
        const label = sisMode ? `CALL ${hex(target, 4)}` : `CALL ${hex(target)}`;
        lines.push(`  ${hex(addr)}: ${prefix}${label}`);
        calls.push({ from: addr, target, type: 'CALL' });
        i += 1 + addrSize;
        break;
      }
      case 0xC3: { // JP addr
        const target = readAddr(buf, startAddr + i + 1);
        const label = sisMode ? `JP ${hex(target, 4)}` : `JP ${hex(target)}`;
        lines.push(`  ${hex(addr)}: ${prefix}${label}`);
        calls.push({ from: addr, target, type: 'JP' });
        i += 1 + addrSize;
        break;
      }
      case 0xCA: { // JP Z,addr
        const target = readAddr(buf, startAddr + i + 1);
        lines.push(`  ${hex(addr)}: ${prefix}JP Z,${hex(target, sisMode ? 4 : 6)}`);
        calls.push({ from: addr, target, type: 'JP Z' });
        i += 1 + addrSize;
        break;
      }
      case 0xC2: { // JP NZ,addr
        const target = readAddr(buf, startAddr + i + 1);
        lines.push(`  ${hex(addr)}: ${prefix}JP NZ,${hex(target, sisMode ? 4 : 6)}`);
        calls.push({ from: addr, target, type: 'JP NZ' });
        i += 1 + addrSize;
        break;
      }
      case 0xCC: { // CALL Z,addr
        const target = readAddr(buf, startAddr + i + 1);
        lines.push(`  ${hex(addr)}: ${prefix}CALL Z,${hex(target, sisMode ? 4 : 6)}`);
        calls.push({ from: addr, target, type: 'CALL Z' });
        i += 1 + addrSize;
        break;
      }
      case 0xC4: { // CALL NZ,addr
        const target = readAddr(buf, startAddr + i + 1);
        lines.push(`  ${hex(addr)}: ${prefix}CALL NZ,${hex(target, sisMode ? 4 : 6)}`);
        calls.push({ from: addr, target, type: 'CALL NZ' });
        i += 1 + addrSize;
        break;
      }
      case 0xD4: { // CALL NC,addr
        const target = readAddr(buf, startAddr + i + 1);
        lines.push(`  ${hex(addr)}: ${prefix}CALL NC,${hex(target, sisMode ? 4 : 6)}`);
        calls.push({ from: addr, target, type: 'CALL NC' });
        i += 1 + addrSize;
        break;
      }
      case 0xDC: { // CALL C,addr
        const target = readAddr(buf, startAddr + i + 1);
        lines.push(`  ${hex(addr)}: ${prefix}CALL C,${hex(target, sisMode ? 4 : 6)}`);
        calls.push({ from: addr, target, type: 'CALL C' });
        i += 1 + addrSize;
        break;
      }
      case 0xC9:
        lines.push(`  ${hex(addr)}: ${prefix}RET`);
        i++;
        break;
      case 0xC0:
        lines.push(`  ${hex(addr)}: ${prefix}RET NZ`);
        i++;
        break;
      case 0xC8:
        lines.push(`  ${hex(addr)}: ${prefix}RET Z`);
        i++;
        break;
      case 0xD0:
        lines.push(`  ${hex(addr)}: ${prefix}RET NC`);
        i++;
        break;
      case 0xD8:
        lines.push(`  ${hex(addr)}: ${prefix}RET C`);
        i++;
        break;
      case 0xAF:
        lines.push(`  ${hex(addr)}: ${prefix}XOR A`);
        i++;
        break;
      case 0xB7:
        lines.push(`  ${hex(addr)}: ${prefix}OR A`);
        i++;
        break;
      case 0xA7:
        lines.push(`  ${hex(addr)}: ${prefix}AND A`);
        i++;
        break;
      case 0x32: { // LD (addr),A
        const target = readAddr(buf, startAddr + i + 1);
        lines.push(`  ${hex(addr)}: ${prefix}LD (${hex(target, sisMode ? 4 : 6)}),A`);
        ramAccesses.push({ addr: target, type: 'write', from: addr });
        i += 1 + addrSize;
        break;
      }
      case 0x3A: { // LD A,(addr)
        const target = readAddr(buf, startAddr + i + 1);
        lines.push(`  ${hex(addr)}: ${prefix}LD A,(${hex(target, sisMode ? 4 : 6)})`);
        ramAccesses.push({ addr: target, type: 'read', from: addr });
        i += 1 + addrSize;
        break;
      }
      case 0x21: { // LD HL,addr
        const target = readAddr(buf, startAddr + i + 1);
        lines.push(`  ${hex(addr)}: ${prefix}LD HL,${hex(target, sisMode ? 4 : 6)}`);
        i += 1 + addrSize;
        break;
      }
      case 0x11: { // LD DE,addr
        const target = readAddr(buf, startAddr + i + 1);
        lines.push(`  ${hex(addr)}: ${prefix}LD DE,${hex(target, sisMode ? 4 : 6)}`);
        i += 1 + addrSize;
        break;
      }
      case 0x01: { // LD BC,addr
        const target = readAddr(buf, startAddr + i + 1);
        lines.push(`  ${hex(addr)}: ${prefix}LD BC,${hex(target, sisMode ? 4 : 6)}`);
        i += 1 + addrSize;
        break;
      }
      case 0x22: { // LD (addr),HL
        const target = readAddr(buf, startAddr + i + 1);
        lines.push(`  ${hex(addr)}: ${prefix}LD (${hex(target, sisMode ? 4 : 6)}),HL`);
        ramAccesses.push({ addr: target, type: 'write', from: addr });
        i += 1 + addrSize;
        break;
      }
      case 0x2A: { // LD HL,(addr)
        const target = readAddr(buf, startAddr + i + 1);
        lines.push(`  ${hex(addr)}: ${prefix}LD HL,(${hex(target, sisMode ? 4 : 6)})`);
        ramAccesses.push({ addr: target, type: 'read', from: addr });
        i += 1 + addrSize;
        break;
      }
      case 0xE5: lines.push(`  ${hex(addr)}: ${prefix}PUSH HL`); i++; break;
      case 0xD5: lines.push(`  ${hex(addr)}: ${prefix}PUSH DE`); i++; break;
      case 0xC5: lines.push(`  ${hex(addr)}: ${prefix}PUSH BC`); i++; break;
      case 0xF5: lines.push(`  ${hex(addr)}: ${prefix}PUSH AF`); i++; break;
      case 0xE1: lines.push(`  ${hex(addr)}: ${prefix}POP HL`); i++; break;
      case 0xD1: lines.push(`  ${hex(addr)}: ${prefix}POP DE`); i++; break;
      case 0xC1: lines.push(`  ${hex(addr)}: ${prefix}POP BC`); i++; break;
      case 0xF1: lines.push(`  ${hex(addr)}: ${prefix}POP AF`); i++; break;
      case 0x18: { // JR d
        const d = buf[startAddr + i + 1];
        const offset = d >= 128 ? d - 256 : d;
        const target = addr + 2 + offset;
        lines.push(`  ${hex(addr)}: ${prefix}JR ${hex(target)} (d=${offset})`);
        i += 2;
        break;
      }
      case 0x20: { // JR NZ,d
        const d = buf[startAddr + i + 1];
        const offset = d >= 128 ? d - 256 : d;
        const target = addr + 2 + offset;
        lines.push(`  ${hex(addr)}: ${prefix}JR NZ,${hex(target)} (d=${offset})`);
        i += 2;
        break;
      }
      case 0x28: { // JR Z,d
        const d = buf[startAddr + i + 1];
        const offset = d >= 128 ? d - 256 : d;
        const target = addr + 2 + offset;
        lines.push(`  ${hex(addr)}: ${prefix}JR Z,${hex(target)} (d=${offset})`);
        i += 2;
        break;
      }
      case 0x30: { // JR NC,d
        const d = buf[startAddr + i + 1];
        const offset = d >= 128 ? d - 256 : d;
        const target = addr + 2 + offset;
        lines.push(`  ${hex(addr)}: ${prefix}JR NC,${hex(target)} (d=${offset})`);
        i += 2;
        break;
      }
      case 0x38: { // JR C,d
        const d = buf[startAddr + i + 1];
        const offset = d >= 128 ? d - 256 : d;
        const target = addr + 2 + offset;
        lines.push(`  ${hex(addr)}: ${prefix}JR C,${hex(target)} (d=${offset})`);
        i += 2;
        break;
      }
      case 0xFE: { // CP n
        const n = buf[startAddr + i + 1];
        lines.push(`  ${hex(addr)}: ${prefix}CP ${hex(n, 2)}`);
        i += 2;
        break;
      }
      case 0x3C: lines.push(`  ${hex(addr)}: ${prefix}INC A`); i++; break;
      case 0x3D: lines.push(`  ${hex(addr)}: ${prefix}DEC A`); i++; break;
      case 0x7E: lines.push(`  ${hex(addr)}: ${prefix}LD A,(HL)`); i++; break;
      case 0x77: lines.push(`  ${hex(addr)}: ${prefix}LD (HL),A`); i++; break;
      case 0x23: lines.push(`  ${hex(addr)}: ${prefix}INC HL`); i++; break;
      case 0x2B: lines.push(`  ${hex(addr)}: ${prefix}DEC HL`); i++; break;
      case 0x00: lines.push(`  ${hex(addr)}: ${prefix}NOP`); i++; break;
      case 0x76: lines.push(`  ${hex(addr)}: ${prefix}HALT`); i++; break;
      case 0xE7: { // RST 28h (BCALL)
        const idx = read16(buf, startAddr + i + 1);
        lines.push(`  ${hex(addr)}: ${prefix}RST 28h / BCALL ${hex(idx, 4)}`);
        i += 3;
        break;
      }
      case 0xED: { // ED prefix
        i++;
        const eb = buf[startAddr + i];
        switch (eb) {
          case 0x73: { // LD (addr),SP
            const target = readAddr(buf, startAddr + i + 1);
            lines.push(`  ${hex(addr)}: ${prefix}ED: LD (${hex(target, sisMode ? 4 : 6)}),SP`);
            ramAccesses.push({ addr: target, type: 'write', from: addr });
            i += 1 + addrSize;
            break;
          }
          case 0x7B: { // LD SP,(addr)
            const target = readAddr(buf, startAddr + i + 1);
            lines.push(`  ${hex(addr)}: ${prefix}ED: LD SP,(${hex(target, sisMode ? 4 : 6)})`);
            ramAccesses.push({ addr: target, type: 'read', from: addr });
            i += 1 + addrSize;
            break;
          }
          case 0x4B: { // LD BC,(addr)
            const target = readAddr(buf, startAddr + i + 1);
            lines.push(`  ${hex(addr)}: ${prefix}ED: LD BC,(${hex(target, sisMode ? 4 : 6)})`);
            ramAccesses.push({ addr: target, type: 'read', from: addr });
            i += 1 + addrSize;
            break;
          }
          case 0x5B: { // LD DE,(addr)
            const target = readAddr(buf, startAddr + i + 1);
            lines.push(`  ${hex(addr)}: ${prefix}ED: LD DE,(${hex(target, sisMode ? 4 : 6)})`);
            ramAccesses.push({ addr: target, type: 'read', from: addr });
            i += 1 + addrSize;
            break;
          }
          case 0x6B: { // LD HL,(addr)
            const target = readAddr(buf, startAddr + i + 1);
            lines.push(`  ${hex(addr)}: ${prefix}ED: LD HL,(${hex(target, sisMode ? 4 : 6)})`);
            ramAccesses.push({ addr: target, type: 'read', from: addr });
            i += 1 + addrSize;
            break;
          }
          case 0xB0: lines.push(`  ${hex(addr)}: ${prefix}ED: LDIR`); i++; break;
          case 0xB8: lines.push(`  ${hex(addr)}: ${prefix}ED: LDDR`); i++; break;
          case 0x52: lines.push(`  ${hex(addr)}: ${prefix}ED: SBC HL,DE`); i++; break;
          case 0x42: lines.push(`  ${hex(addr)}: ${prefix}ED: SBC HL,BC`); i++; break;
          default:
            lines.push(`  ${hex(addr)}: ${prefix}ED ${hex(eb, 2)} (unknown ED op)`);
            i++;
        }
        break;
      }
      case 0xCB: { // CB prefix — bit ops
        i++;
        const cb = buf[startAddr + i];
        const regs = ['B','C','D','E','H','L','(HL)','A'];
        if (cb >= 0x40 && cb <= 0x7F) {
          const bit = (cb >> 3) & 7;
          const reg = regs[cb & 7];
          lines.push(`  ${hex(addr)}: ${prefix}CB: BIT ${bit},${reg}`);
        } else if (cb >= 0x80 && cb <= 0xBF) {
          const bit = (cb >> 3) & 7;
          const reg = regs[cb & 7];
          lines.push(`  ${hex(addr)}: ${prefix}CB: RES ${bit},${reg}`);
        } else if (cb >= 0xC0) {
          const bit = (cb >> 3) & 7;
          const reg = regs[cb & 7];
          lines.push(`  ${hex(addr)}: ${prefix}CB: SET ${bit},${reg}`);
        } else {
          const bitOps = ['RLC','RRC','RL','RR','SLA','SRA','SLL','SRL'];
          const op = bitOps[(cb >> 3) & 7];
          const reg = regs[cb & 7];
          lines.push(`  ${hex(addr)}: ${prefix}CB: ${op} ${reg}`);
        }
        i++;
        break;
      }
      // Common single-byte instructions
      case 0x04: lines.push(`  ${hex(addr)}: ${prefix}INC B`); i++; break;
      case 0x05: lines.push(`  ${hex(addr)}: ${prefix}DEC B`); i++; break;
      case 0x0C: lines.push(`  ${hex(addr)}: ${prefix}INC C`); i++; break;
      case 0x0D: lines.push(`  ${hex(addr)}: ${prefix}DEC C`); i++; break;
      case 0x14: lines.push(`  ${hex(addr)}: ${prefix}INC D`); i++; break;
      case 0x15: lines.push(`  ${hex(addr)}: ${prefix}DEC D`); i++; break;
      case 0x1C: lines.push(`  ${hex(addr)}: ${prefix}INC E`); i++; break;
      case 0x1D: lines.push(`  ${hex(addr)}: ${prefix}DEC E`); i++; break;
      case 0x24: lines.push(`  ${hex(addr)}: ${prefix}INC H`); i++; break;
      case 0x25: lines.push(`  ${hex(addr)}: ${prefix}DEC H`); i++; break;
      case 0x2C: lines.push(`  ${hex(addr)}: ${prefix}INC L`); i++; break;
      case 0x2D: lines.push(`  ${hex(addr)}: ${prefix}DEC L`); i++; break;
      case 0x34: lines.push(`  ${hex(addr)}: ${prefix}INC (HL)`); i++; break;
      case 0x35: lines.push(`  ${hex(addr)}: ${prefix}DEC (HL)`); i++; break;
      case 0x06: lines.push(`  ${hex(addr)}: ${prefix}LD B,${hex(buf[startAddr+i+1],2)}`); i+=2; break;
      case 0x0E: lines.push(`  ${hex(addr)}: ${prefix}LD C,${hex(buf[startAddr+i+1],2)}`); i+=2; break;
      case 0x16: lines.push(`  ${hex(addr)}: ${prefix}LD D,${hex(buf[startAddr+i+1],2)}`); i+=2; break;
      case 0x1E: lines.push(`  ${hex(addr)}: ${prefix}LD E,${hex(buf[startAddr+i+1],2)}`); i+=2; break;
      case 0x26: lines.push(`  ${hex(addr)}: ${prefix}LD H,${hex(buf[startAddr+i+1],2)}`); i+=2; break;
      case 0x2E: lines.push(`  ${hex(addr)}: ${prefix}LD L,${hex(buf[startAddr+i+1],2)}`); i+=2; break;
      case 0x36: lines.push(`  ${hex(addr)}: ${prefix}LD (HL),${hex(buf[startAddr+i+1],2)}`); i+=2; break;
      case 0x3E: lines.push(`  ${hex(addr)}: ${prefix}LD A,${hex(buf[startAddr+i+1],2)}`); i+=2; break;
      case 0x78: lines.push(`  ${hex(addr)}: ${prefix}LD A,B`); i++; break;
      case 0x79: lines.push(`  ${hex(addr)}: ${prefix}LD A,C`); i++; break;
      case 0x7A: lines.push(`  ${hex(addr)}: ${prefix}LD A,D`); i++; break;
      case 0x7B: lines.push(`  ${hex(addr)}: ${prefix}LD A,E`); i++; break;
      case 0x7C: lines.push(`  ${hex(addr)}: ${prefix}LD A,H`); i++; break;
      case 0x7D: lines.push(`  ${hex(addr)}: ${prefix}LD A,L`); i++; break;
      case 0x7F: lines.push(`  ${hex(addr)}: ${prefix}LD A,A`); i++; break;
      case 0x47: lines.push(`  ${hex(addr)}: ${prefix}LD B,A`); i++; break;
      case 0x4F: lines.push(`  ${hex(addr)}: ${prefix}LD C,A`); i++; break;
      case 0x57: lines.push(`  ${hex(addr)}: ${prefix}LD D,A`); i++; break;
      case 0x5F: lines.push(`  ${hex(addr)}: ${prefix}LD E,A`); i++; break;
      case 0x67: lines.push(`  ${hex(addr)}: ${prefix}LD H,A`); i++; break;
      case 0x6F: lines.push(`  ${hex(addr)}: ${prefix}LD L,A`); i++; break;
      case 0x40: lines.push(`  ${hex(addr)}: ${prefix}LD B,B`); i++; break;
      case 0x41: lines.push(`  ${hex(addr)}: ${prefix}LD B,C`); i++; break;
      case 0x42: lines.push(`  ${hex(addr)}: ${prefix}LD B,D`); i++; break;
      case 0x43: lines.push(`  ${hex(addr)}: ${prefix}LD B,E`); i++; break;
      case 0x44: lines.push(`  ${hex(addr)}: ${prefix}LD B,H`); i++; break;
      case 0x45: lines.push(`  ${hex(addr)}: ${prefix}LD B,L`); i++; break;
      case 0x46: lines.push(`  ${hex(addr)}: ${prefix}LD B,(HL)`); i++; break;
      case 0x48: lines.push(`  ${hex(addr)}: ${prefix}LD C,B`); i++; break;
      case 0x4A: lines.push(`  ${hex(addr)}: ${prefix}LD C,D`); i++; break;
      case 0x4B: lines.push(`  ${hex(addr)}: ${prefix}LD C,E`); i++; break;
      case 0x4C: lines.push(`  ${hex(addr)}: ${prefix}LD C,H`); i++; break;
      case 0x4D: lines.push(`  ${hex(addr)}: ${prefix}LD C,L`); i++; break;
      case 0x4E: lines.push(`  ${hex(addr)}: ${prefix}LD C,(HL)`); i++; break;
      case 0x50: lines.push(`  ${hex(addr)}: ${prefix}LD D,B`); i++; break;
      case 0x51: lines.push(`  ${hex(addr)}: ${prefix}LD D,C`); i++; break;
      case 0x53: lines.push(`  ${hex(addr)}: ${prefix}LD D,E`); i++; break;
      case 0x54: lines.push(`  ${hex(addr)}: ${prefix}LD D,H`); i++; break;
      case 0x55: lines.push(`  ${hex(addr)}: ${prefix}LD D,L`); i++; break;
      case 0x56: lines.push(`  ${hex(addr)}: ${prefix}LD D,(HL)`); i++; break;
      case 0x58: lines.push(`  ${hex(addr)}: ${prefix}LD E,B`); i++; break;
      case 0x59: lines.push(`  ${hex(addr)}: ${prefix}LD E,C`); i++; break;
      case 0x5A: lines.push(`  ${hex(addr)}: ${prefix}LD E,D`); i++; break;
      case 0x5C: lines.push(`  ${hex(addr)}: ${prefix}LD E,H`); i++; break;
      case 0x5D: lines.push(`  ${hex(addr)}: ${prefix}LD E,L`); i++; break;
      case 0x5E: lines.push(`  ${hex(addr)}: ${prefix}LD E,(HL)`); i++; break;
      case 0x60: lines.push(`  ${hex(addr)}: ${prefix}LD H,B`); i++; break;
      case 0x61: lines.push(`  ${hex(addr)}: ${prefix}LD H,C`); i++; break;
      case 0x62: lines.push(`  ${hex(addr)}: ${prefix}LD H,D`); i++; break;
      case 0x63: lines.push(`  ${hex(addr)}: ${prefix}LD H,E`); i++; break;
      case 0x64: lines.push(`  ${hex(addr)}: ${prefix}LD H,H`); i++; break;
      case 0x65: lines.push(`  ${hex(addr)}: ${prefix}LD H,L`); i++; break;
      case 0x66: lines.push(`  ${hex(addr)}: ${prefix}LD H,(HL)`); i++; break;
      case 0x68: lines.push(`  ${hex(addr)}: ${prefix}LD L,B`); i++; break;
      case 0x69: lines.push(`  ${hex(addr)}: ${prefix}LD L,C`); i++; break;
      case 0x6A: lines.push(`  ${hex(addr)}: ${prefix}LD L,D`); i++; break;
      case 0x6B: lines.push(`  ${hex(addr)}: ${prefix}LD L,E`); i++; break;
      case 0x6C: lines.push(`  ${hex(addr)}: ${prefix}LD L,H`); i++; break;
      case 0x6D: lines.push(`  ${hex(addr)}: ${prefix}LD L,L`); i++; break;
      case 0x6E: lines.push(`  ${hex(addr)}: ${prefix}LD L,(HL)`); i++; break;
      case 0x70: lines.push(`  ${hex(addr)}: ${prefix}LD (HL),B`); i++; break;
      case 0x71: lines.push(`  ${hex(addr)}: ${prefix}LD (HL),C`); i++; break;
      case 0x72: lines.push(`  ${hex(addr)}: ${prefix}LD (HL),D`); i++; break;
      case 0x73: lines.push(`  ${hex(addr)}: ${prefix}LD (HL),E`); i++; break;
      case 0x74: lines.push(`  ${hex(addr)}: ${prefix}LD (HL),H`); i++; break;
      case 0x75: lines.push(`  ${hex(addr)}: ${prefix}LD (HL),L`); i++; break;
      case 0x80: lines.push(`  ${hex(addr)}: ${prefix}ADD A,B`); i++; break;
      case 0x81: lines.push(`  ${hex(addr)}: ${prefix}ADD A,C`); i++; break;
      case 0x82: lines.push(`  ${hex(addr)}: ${prefix}ADD A,D`); i++; break;
      case 0x83: lines.push(`  ${hex(addr)}: ${prefix}ADD A,E`); i++; break;
      case 0x84: lines.push(`  ${hex(addr)}: ${prefix}ADD A,H`); i++; break;
      case 0x85: lines.push(`  ${hex(addr)}: ${prefix}ADD A,L`); i++; break;
      case 0x86: lines.push(`  ${hex(addr)}: ${prefix}ADD A,(HL)`); i++; break;
      case 0x87: lines.push(`  ${hex(addr)}: ${prefix}ADD A,A`); i++; break;
      case 0x90: lines.push(`  ${hex(addr)}: ${prefix}SUB B`); i++; break;
      case 0x91: lines.push(`  ${hex(addr)}: ${prefix}SUB C`); i++; break;
      case 0x92: lines.push(`  ${hex(addr)}: ${prefix}SUB D`); i++; break;
      case 0x93: lines.push(`  ${hex(addr)}: ${prefix}SUB E`); i++; break;
      case 0x94: lines.push(`  ${hex(addr)}: ${prefix}SUB H`); i++; break;
      case 0x95: lines.push(`  ${hex(addr)}: ${prefix}SUB L`); i++; break;
      case 0x96: lines.push(`  ${hex(addr)}: ${prefix}SUB (HL)`); i++; break;
      case 0x97: lines.push(`  ${hex(addr)}: ${prefix}SUB A`); i++; break;
      case 0xA0: lines.push(`  ${hex(addr)}: ${prefix}AND B`); i++; break;
      case 0xA1: lines.push(`  ${hex(addr)}: ${prefix}AND C`); i++; break;
      case 0xA2: lines.push(`  ${hex(addr)}: ${prefix}AND D`); i++; break;
      case 0xA3: lines.push(`  ${hex(addr)}: ${prefix}AND E`); i++; break;
      case 0xA4: lines.push(`  ${hex(addr)}: ${prefix}AND H`); i++; break;
      case 0xA5: lines.push(`  ${hex(addr)}: ${prefix}AND L`); i++; break;
      case 0xA6: lines.push(`  ${hex(addr)}: ${prefix}AND (HL)`); i++; break;
      case 0xA8: lines.push(`  ${hex(addr)}: ${prefix}XOR B`); i++; break;
      case 0xA9: lines.push(`  ${hex(addr)}: ${prefix}XOR C`); i++; break;
      case 0xAA: lines.push(`  ${hex(addr)}: ${prefix}XOR D`); i++; break;
      case 0xAB: lines.push(`  ${hex(addr)}: ${prefix}XOR E`); i++; break;
      case 0xAC: lines.push(`  ${hex(addr)}: ${prefix}XOR H`); i++; break;
      case 0xAD: lines.push(`  ${hex(addr)}: ${prefix}XOR L`); i++; break;
      case 0xAE: lines.push(`  ${hex(addr)}: ${prefix}XOR (HL)`); i++; break;
      case 0xB0: lines.push(`  ${hex(addr)}: ${prefix}OR B`); i++; break;
      case 0xB1: lines.push(`  ${hex(addr)}: ${prefix}OR C`); i++; break;
      case 0xB2: lines.push(`  ${hex(addr)}: ${prefix}OR D`); i++; break;
      case 0xB3: lines.push(`  ${hex(addr)}: ${prefix}OR E`); i++; break;
      case 0xB4: lines.push(`  ${hex(addr)}: ${prefix}OR H`); i++; break;
      case 0xB5: lines.push(`  ${hex(addr)}: ${prefix}OR L`); i++; break;
      case 0xB6: lines.push(`  ${hex(addr)}: ${prefix}OR (HL)`); i++; break;
      case 0xB8: lines.push(`  ${hex(addr)}: ${prefix}CP B`); i++; break;
      case 0xB9: lines.push(`  ${hex(addr)}: ${prefix}CP C`); i++; break;
      case 0xBA: lines.push(`  ${hex(addr)}: ${prefix}CP D`); i++; break;
      case 0xBB: lines.push(`  ${hex(addr)}: ${prefix}CP E`); i++; break;
      case 0xBC: lines.push(`  ${hex(addr)}: ${prefix}CP H`); i++; break;
      case 0xBD: lines.push(`  ${hex(addr)}: ${prefix}CP L`); i++; break;
      case 0xBE: lines.push(`  ${hex(addr)}: ${prefix}CP (HL)`); i++; break;
      case 0x09: lines.push(`  ${hex(addr)}: ${prefix}ADD HL,BC`); i++; break;
      case 0x19: lines.push(`  ${hex(addr)}: ${prefix}ADD HL,DE`); i++; break;
      case 0x29: lines.push(`  ${hex(addr)}: ${prefix}ADD HL,HL`); i++; break;
      case 0x39: lines.push(`  ${hex(addr)}: ${prefix}ADD HL,SP`); i++; break;
      case 0x03: lines.push(`  ${hex(addr)}: ${prefix}INC BC`); i++; break;
      case 0x13: lines.push(`  ${hex(addr)}: ${prefix}INC DE`); i++; break;
      case 0x33: lines.push(`  ${hex(addr)}: ${prefix}INC SP`); i++; break;
      case 0x0B: lines.push(`  ${hex(addr)}: ${prefix}DEC BC`); i++; break;
      case 0x1B: lines.push(`  ${hex(addr)}: ${prefix}DEC DE`); i++; break;
      case 0x3B: lines.push(`  ${hex(addr)}: ${prefix}DEC SP`); i++; break;
      case 0x02: lines.push(`  ${hex(addr)}: ${prefix}LD (BC),A`); i++; break;
      case 0x0A: lines.push(`  ${hex(addr)}: ${prefix}LD A,(BC)`); i++; break;
      case 0x12: lines.push(`  ${hex(addr)}: ${prefix}LD (DE),A`); i++; break;
      case 0x1A: lines.push(`  ${hex(addr)}: ${prefix}LD A,(DE)`); i++; break;
      case 0xC6: lines.push(`  ${hex(addr)}: ${prefix}ADD A,${hex(buf[startAddr+i+1],2)}`); i+=2; break;
      case 0xD6: lines.push(`  ${hex(addr)}: ${prefix}SUB ${hex(buf[startAddr+i+1],2)}`); i+=2; break;
      case 0xE6: lines.push(`  ${hex(addr)}: ${prefix}AND ${hex(buf[startAddr+i+1],2)}`); i+=2; break;
      case 0xEE: lines.push(`  ${hex(addr)}: ${prefix}XOR ${hex(buf[startAddr+i+1],2)}`); i+=2; break;
      case 0xF6: lines.push(`  ${hex(addr)}: ${prefix}OR ${hex(buf[startAddr+i+1],2)}`); i+=2; break;
      case 0xCE: lines.push(`  ${hex(addr)}: ${prefix}ADC A,${hex(buf[startAddr+i+1],2)}`); i+=2; break;
      case 0xDE: lines.push(`  ${hex(addr)}: ${prefix}SBC A,${hex(buf[startAddr+i+1],2)}`); i+=2; break;
      case 0xF9: lines.push(`  ${hex(addr)}: ${prefix}LD SP,HL`); i++; break;
      case 0xEB: lines.push(`  ${hex(addr)}: ${prefix}EX DE,HL`); i++; break;
      case 0xE3: lines.push(`  ${hex(addr)}: ${prefix}EX (SP),HL`); i++; break;
      case 0x08: lines.push(`  ${hex(addr)}: ${prefix}EX AF,AF'`); i++; break;
      case 0xD9: lines.push(`  ${hex(addr)}: ${prefix}EXX`); i++; break;
      case 0xF3: lines.push(`  ${hex(addr)}: ${prefix}DI`); i++; break;
      case 0xFB: lines.push(`  ${hex(addr)}: ${prefix}EI`); i++; break;
      case 0xE9: lines.push(`  ${hex(addr)}: ${prefix}JP (HL)`); i++; break;
      case 0x10: { // DJNZ
        const d = buf[startAddr + i + 1];
        const offset = d >= 128 ? d - 256 : d;
        const target = addr + 2 + offset;
        lines.push(`  ${hex(addr)}: ${prefix}DJNZ ${hex(target)} (d=${offset})`);
        i += 2;
        break;
      }
      case 0xC7: lines.push(`  ${hex(addr)}: ${prefix}RST 00h`); i++; break;
      case 0xCF: lines.push(`  ${hex(addr)}: ${prefix}RST 08h`); i++; break;
      case 0xD7: lines.push(`  ${hex(addr)}: ${prefix}RST 10h`); i++; break;
      case 0xDF: lines.push(`  ${hex(addr)}: ${prefix}RST 18h`); i++; break;
      case 0xEF: lines.push(`  ${hex(addr)}: ${prefix}RST 28h`); i++; break;
      case 0xF7: lines.push(`  ${hex(addr)}: ${prefix}RST 30h`); i++; break;
      case 0xFF: lines.push(`  ${hex(addr)}: ${prefix}RST 38h`); i++; break;
      default: {
        // For IX/IY prefixed instructions with displacement
        if (ixMode || iyMode) {
          const reg = ixMode ? 'IX' : 'IY';
          if (b === 0x21) {
            const nn = readAddr(buf, startAddr + i + 1);
            lines.push(`  ${hex(addr)}: ${prefix}LD ${reg},${hex(nn, sisMode ? 4 : 6)}`);
            i += 1 + addrSize;
          } else if (b === 0x22) {
            const nn = readAddr(buf, startAddr + i + 1);
            lines.push(`  ${hex(addr)}: ${prefix}LD (${hex(nn, sisMode ? 4 : 6)}),${reg}`);
            ramAccesses.push({ addr: nn, type: 'write', from: addr });
            i += 1 + addrSize;
          } else if (b === 0x2A) {
            const nn = readAddr(buf, startAddr + i + 1);
            lines.push(`  ${hex(addr)}: ${prefix}LD ${reg},(${hex(nn, sisMode ? 4 : 6)})`);
            ramAccesses.push({ addr: nn, type: 'read', from: addr });
            i += 1 + addrSize;
          } else if (b === 0xE5) {
            lines.push(`  ${hex(addr)}: ${prefix}PUSH ${reg}`);
            i++;
          } else if (b === 0xE1) {
            lines.push(`  ${hex(addr)}: ${prefix}POP ${reg}`);
            i++;
          } else if (b === 0x36) {
            const d = buf[startAddr + i + 1];
            const n = buf[startAddr + i + 2];
            lines.push(`  ${hex(addr)}: ${prefix}LD (${reg}+${hex(d,2)}),${hex(n,2)}`);
            i += 3;
          } else if (b === 0x7E) {
            const d = buf[startAddr + i + 1];
            lines.push(`  ${hex(addr)}: ${prefix}LD A,(${reg}+${hex(d,2)})`);
            i += 2;
          } else if (b === 0x77) {
            const d = buf[startAddr + i + 1];
            lines.push(`  ${hex(addr)}: ${prefix}LD (${reg}+${hex(d,2)}),A`);
            i += 2;
          } else if (b === 0x46) {
            const d = buf[startAddr + i + 1];
            lines.push(`  ${hex(addr)}: ${prefix}LD B,(${reg}+${hex(d,2)})`);
            i += 2;
          } else if (b === 0x4E) {
            const d = buf[startAddr + i + 1];
            lines.push(`  ${hex(addr)}: ${prefix}LD C,(${reg}+${hex(d,2)})`);
            i += 2;
          } else if (b === 0x56) {
            const d = buf[startAddr + i + 1];
            lines.push(`  ${hex(addr)}: ${prefix}LD D,(${reg}+${hex(d,2)})`);
            i += 2;
          } else if (b === 0x5E) {
            const d = buf[startAddr + i + 1];
            lines.push(`  ${hex(addr)}: ${prefix}LD E,(${reg}+${hex(d,2)})`);
            i += 2;
          } else if (b === 0x66) {
            const d = buf[startAddr + i + 1];
            lines.push(`  ${hex(addr)}: ${prefix}LD H,(${reg}+${hex(d,2)})`);
            i += 2;
          } else if (b === 0x6E) {
            const d = buf[startAddr + i + 1];
            lines.push(`  ${hex(addr)}: ${prefix}LD L,(${reg}+${hex(d,2)})`);
            i += 2;
          } else if (b === 0xBE) {
            const d = buf[startAddr + i + 1];
            lines.push(`  ${hex(addr)}: ${prefix}CP (${reg}+${hex(d,2)})`);
            i += 2;
          } else if (b === 0x34) {
            const d = buf[startAddr + i + 1];
            lines.push(`  ${hex(addr)}: ${prefix}INC (${reg}+${hex(d,2)})`);
            i += 2;
          } else if (b === 0x35) {
            const d = buf[startAddr + i + 1];
            lines.push(`  ${hex(addr)}: ${prefix}DEC (${reg}+${hex(d,2)})`);
            i += 2;
          } else if (b === 0x23) {
            lines.push(`  ${hex(addr)}: ${prefix}INC ${reg}`);
            i++;
          } else if (b === 0x2B) {
            lines.push(`  ${hex(addr)}: ${prefix}DEC ${reg}`);
            i++;
          } else if (b === 0x09) {
            lines.push(`  ${hex(addr)}: ${prefix}ADD ${reg},BC`);
            i++;
          } else if (b === 0x19) {
            lines.push(`  ${hex(addr)}: ${prefix}ADD ${reg},DE`);
            i++;
          } else if (b === 0x29) {
            lines.push(`  ${hex(addr)}: ${prefix}ADD ${reg},${reg}`);
            i++;
          } else if (b === 0x39) {
            lines.push(`  ${hex(addr)}: ${prefix}ADD ${reg},SP`);
            i++;
          } else if (b === 0xF9) {
            lines.push(`  ${hex(addr)}: ${prefix}LD SP,${reg}`);
            i++;
          } else if (b === 0xE9) {
            lines.push(`  ${hex(addr)}: ${prefix}JP (${reg})`);
            i++;
          } else if (b === 0x86) {
            const d = buf[startAddr + i + 1];
            lines.push(`  ${hex(addr)}: ${prefix}ADD A,(${reg}+${hex(d,2)})`);
            i += 2;
          } else if (b === 0x96) {
            const d = buf[startAddr + i + 1];
            lines.push(`  ${hex(addr)}: ${prefix}SUB (${reg}+${hex(d,2)})`);
            i += 2;
          } else if (b === 0xA6) {
            const d = buf[startAddr + i + 1];
            lines.push(`  ${hex(addr)}: ${prefix}AND (${reg}+${hex(d,2)})`);
            i += 2;
          } else if (b === 0xAE) {
            const d = buf[startAddr + i + 1];
            lines.push(`  ${hex(addr)}: ${prefix}XOR (${reg}+${hex(d,2)})`);
            i += 2;
          } else if (b === 0xB6) {
            const d = buf[startAddr + i + 1];
            lines.push(`  ${hex(addr)}: ${prefix}OR (${reg}+${hex(d,2)})`);
            i += 2;
          } else if (b === 0x70) {
            const d = buf[startAddr + i + 1];
            lines.push(`  ${hex(addr)}: ${prefix}LD (${reg}+${hex(d,2)}),B`);
            i += 2;
          } else if (b === 0x71) {
            const d = buf[startAddr + i + 1];
            lines.push(`  ${hex(addr)}: ${prefix}LD (${reg}+${hex(d,2)}),C`);
            i += 2;
          } else if (b === 0x72) {
            const d = buf[startAddr + i + 1];
            lines.push(`  ${hex(addr)}: ${prefix}LD (${reg}+${hex(d,2)}),D`);
            i += 2;
          } else if (b === 0x73) {
            const d = buf[startAddr + i + 1];
            lines.push(`  ${hex(addr)}: ${prefix}LD (${reg}+${hex(d,2)}),E`);
            i += 2;
          } else if (b === 0x74) {
            const d = buf[startAddr + i + 1];
            lines.push(`  ${hex(addr)}: ${prefix}LD (${reg}+${hex(d,2)}),H`);
            i += 2;
          } else if (b === 0x75) {
            const d = buf[startAddr + i + 1];
            lines.push(`  ${hex(addr)}: ${prefix}LD (${reg}+${hex(d,2)}),L`);
            i += 2;
          } else {
            const rawBytes = [ixMode ? 0xDD : 0xFD, b].map(x => x.toString(16).padStart(2,'0')).join(' ');
            lines.push(`  ${hex(addr)}: ${rawBytes}  (unknown ${reg} op ${hex(b,2)})`);
            i++;
          }
        } else {
          const rawBytes = buf.slice(startAddr + i, startAddr + i + 4);
          const hexStr = [...rawBytes].map(x => x.toString(16).padStart(2,'0')).join(' ');
          lines.push(`  ${hex(addr)}: ${hexStr}  DB ${hex(b, 2)}`);
          i++;
        }
      }
    }

    // Stop after unconditional RET
    if (b === 0xC9) break;
  }

  return { lines, calls, ramAccesses };
}

// ============================================================
// Main: decode each target function
// ============================================================

const targets = [
  { addr: 0x0BA064, name: '0x0BA064 (callee #1 of 0x0B83FD)' },
  { addr: 0x0B9473, name: '0x0B9473 (callee #2 of 0x0B83FD)' },
  { addr: 0x0BAD56, name: '0x0BAD56 (callee #3 of 0x0B83FD)' },
  { addr: 0x0B84CA, name: '0x0B84CA (conditional callee of 0x0B83FD)' },
];

console.log('='.repeat(72));
console.log('probe-phase510: Decode callees of 0x0B83FD');
console.log('  Looking for which callee calls 0x07D583 (descriptor populator)');
console.log('='.repeat(72));

let found07D583 = false;

for (const { addr, name } of targets) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`FUNCTION: ${name}`);
  console.log(`${'─'.repeat(60)}`);

  // Show raw bytes first
  const rawSlice = rom.slice(addr, addr + 150);
  const hexDump = [...rawSlice].map(x => x.toString(16).padStart(2, '0')).join(' ');
  console.log(`  Raw (150 bytes): ${hexDump}`);
  console.log('');

  const { lines, calls, ramAccesses } = disassemble(rom, addr, 150);

  for (const line of lines) {
    console.log(line);
  }

  if (calls.length > 0) {
    console.log('\n  CALL/JP targets:');
    for (const c of calls) {
      const marker = c.target === 0x07D583 ? ' <<<< CALLS 0x07D583!' : '';
      console.log(`    ${c.type} ${hex(c.target)} (from ${hex(c.from)})${marker}`);
      if (c.target === 0x07D583) found07D583 = true;
    }
  }

  if (ramAccesses.length > 0) {
    console.log('\n  RAM accesses:');
    for (const r of ramAccesses) {
      console.log(`    ${r.type} ${hex(r.addr)} (from ${hex(r.from)})`);
    }
  }
}

// Also decode 0x0B83FD itself for reference
console.log(`\n${'─'.repeat(60)}`);
console.log('REFERENCE: 0x0B83FD (the caller function, 38 bytes)');
console.log(`${'─'.repeat(60)}`);
const { lines: refLines, calls: refCalls } = disassemble(rom, 0x0B83FD, 50);
for (const line of refLines) console.log(line);
if (refCalls.length > 0) {
  console.log('\n  CALL/JP targets:');
  for (const c of refCalls) {
    console.log(`    ${c.type} ${hex(c.target)} (from ${hex(c.from)})`);
  }
}

// Summary
console.log(`\n${'='.repeat(72)}`);
console.log('SUMMARY');
console.log(`${'='.repeat(72)}`);
if (found07D583) {
  console.log('  ** Found call(s) to 0x07D583 in one or more callees! See markers above.');
} else {
  console.log('  ** 0x07D583 NOT found in any of the four direct callees.');
  console.log('  ** It may be called indirectly (callee calls another fn that calls 0x07D583).');
}

process.exit(0);
