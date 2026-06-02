#!/usr/bin/env node
/**
 * probe-phase500-decode-09AD2E.mjs
 *
 * Static disassembly of the function at 0x09AD2E in the TI-84 Plus CE ROM.
 * Called from 0x096CC8 with A=(IX+0) — believed to be multi-line cursor setup.
 *
 * Pure ROM-read probe: no CPU execution, no transpiled JS needed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const START = 0x09AD2E;
const IY_BASE = 0xD00080;

// Known cursor/display RAM addresses
const KNOWN_ADDRS = {
  0xD00595: 'cursorRow',
  0xD00596: 'cursorCol',
  0xD02575: 'cursorType',
  0xD008D2: 'VRAM_base_lo',
  0xD008D5: 'VRAM_base_hi',
  0xD007E0: 'modeVariable',
  0xD006C0: 'displayBuf',
  0xD020A6: 'modeBuf',
  0xD00080: 'IY_base',
};

function r8(off)  { return rom[off]; }
function r16(off) { return rom[off] | (rom[off+1] << 8); }
function r24(off) { return rom[off] | (rom[off+1] << 8) | (rom[off+2] << 16); }
function hex(v, w) { return '0x' + v.toString(16).toUpperCase().padStart(w || 6, '0'); }
function hexBytes(off, n) {
  const parts = [];
  for (let i = 0; i < n; i++) parts.push(rom[off + i].toString(16).padStart(2, '0'));
  return parts.join(' ');
}

function labelAddr(addr) {
  if (KNOWN_ADDRS[addr]) return `  ; ${KNOWN_ADDRS[addr]}`;
  return '';
}

// Registers for CB prefix bit operations
const REG8 = ['B','C','D','E','H','L','(HL)','A'];
const CC_NAMES = ['NZ','Z','NC','C','PO','PE','P','M'];

// Collect analysis results
const callTargets = [];
const jpTargets = [];
const addrRefs = [];
const iyRefs = [];
const instructions = [];

let pc = START;
const MAX_BYTES = 4096; // safety limit
let done = false;
let retCount = 0;

while (!done && (pc - START) < MAX_BYTES) {
  const instrStart = pc;
  const b0 = r8(pc);

  let mnemonic = '';
  let bytes = 1;

  // ---- DD prefix (IX operations) ----
  if (b0 === 0xDD) {
    const b1 = r8(pc + 1);

    if (b1 === 0xCB) {
      // DD CB dd op — IX bit operations
      const dd = r8(pc + 2);
      const op = r8(pc + 3);
      bytes = 4;
      const bit = (op >> 3) & 7;
      if ((op & 0xC0) === 0x40) {
        mnemonic = `BIT ${bit},(IX+${hex(dd,2)})`;
      } else if ((op & 0xC0) === 0x80) {
        mnemonic = `RES ${bit},(IX+${hex(dd,2)})`;
      } else if ((op & 0xC0) === 0xC0) {
        mnemonic = `SET ${bit},(IX+${hex(dd,2)})`;
      } else {
        const ops = ['RLC','RRC','RL','RR','SLA','SRA','SLL','SRL'];
        mnemonic = `${ops[(op>>3)&7]} (IX+${hex(dd,2)})`;
      }
    } else if (b1 === 0x21) {
      const imm = r24(pc + 2);
      bytes = 5;
      mnemonic = `LD IX,${hex(imm)}`;
      addrRefs.push({ addr: instrStart, target: imm, type: 'LD IX,imm24' });
    } else if (b1 === 0x36) {
      const dd = r8(pc + 2);
      const nn = r8(pc + 3);
      bytes = 4;
      mnemonic = `LD (IX+${hex(dd,2)}),${hex(nn,2)}`;
    } else if (b1 === 0x46 || b1 === 0x4E || b1 === 0x56 || b1 === 0x5E || b1 === 0x66 || b1 === 0x6E || b1 === 0x7E) {
      const regNames = { 0x46:'B', 0x4E:'C', 0x56:'D', 0x5E:'E', 0x66:'H', 0x6E:'L', 0x7E:'A' };
      const dd = r8(pc + 2);
      bytes = 3;
      mnemonic = `LD ${regNames[b1]},(IX+${hex(dd,2)})`;
    } else if (b1 === 0x70 || b1 === 0x71 || b1 === 0x72 || b1 === 0x73 || b1 === 0x74 || b1 === 0x75 || b1 === 0x77) {
      const regNames = { 0x70:'B', 0x71:'C', 0x72:'D', 0x73:'E', 0x74:'H', 0x75:'L', 0x77:'A' };
      const dd = r8(pc + 2);
      bytes = 3;
      mnemonic = `LD (IX+${hex(dd,2)}),${regNames[b1]}`;
    } else if (b1 === 0xE5) { bytes = 2; mnemonic = 'PUSH IX'; }
    else if (b1 === 0xE1) { bytes = 2; mnemonic = 'POP IX'; }
    else if (b1 === 0x23) { bytes = 2; mnemonic = 'INC IX'; }
    else if (b1 === 0x2B) { bytes = 2; mnemonic = 'DEC IX'; }
    else if (b1 === 0x34) { const dd = r8(pc + 2); bytes = 3; mnemonic = `INC (IX+${hex(dd,2)})`; }
    else if (b1 === 0x35) { const dd = r8(pc + 2); bytes = 3; mnemonic = `DEC (IX+${hex(dd,2)})`; }
    else if (b1 === 0xBE) { const dd = r8(pc + 2); bytes = 3; mnemonic = `CP A,(IX+${hex(dd,2)})`; }
    else if (b1 === 0x86) { const dd = r8(pc + 2); bytes = 3; mnemonic = `ADD A,(IX+${hex(dd,2)})`; }
    else if (b1 === 0x96) { const dd = r8(pc + 2); bytes = 3; mnemonic = `SUB A,(IX+${hex(dd,2)})`; }
    else if (b1 === 0xA6) { const dd = r8(pc + 2); bytes = 3; mnemonic = `AND A,(IX+${hex(dd,2)})`; }
    else if (b1 === 0xAE) { const dd = r8(pc + 2); bytes = 3; mnemonic = `XOR A,(IX+${hex(dd,2)})`; }
    else if (b1 === 0xB6) { const dd = r8(pc + 2); bytes = 3; mnemonic = `OR A,(IX+${hex(dd,2)})`; }
    else if (b1 === 0xE9) { bytes = 2; mnemonic = 'JP (IX)'; done = true; }
    else if (b1 === 0x09) { bytes = 2; mnemonic = 'ADD IX,BC'; }
    else if (b1 === 0x19) { bytes = 2; mnemonic = 'ADD IX,DE'; }
    else if (b1 === 0x29) { bytes = 2; mnemonic = 'ADD IX,IX'; }
    else if (b1 === 0x39) { bytes = 2; mnemonic = 'ADD IX,SP'; }
    else {
      bytes = 2;
      mnemonic = `DD-prefix: DD ${hex(b1,2)} (unknown)`;
    }
  }
  // ---- FD prefix (IY operations) ----
  else if (b0 === 0xFD) {
    const b1 = r8(pc + 1);

    if (b1 === 0xCB) {
      const dd = r8(pc + 2);
      const op = r8(pc + 3);
      bytes = 4;
      const bit = (op >> 3) & 7;
      const iyAddr = IY_BASE + dd;
      if ((op & 0xC0) === 0x40) {
        mnemonic = `BIT ${bit},(IY+${hex(dd,2)})`;
      } else if ((op & 0xC0) === 0x80) {
        mnemonic = `RES ${bit},(IY+${hex(dd,2)})`;
      } else if ((op & 0xC0) === 0xC0) {
        mnemonic = `SET ${bit},(IY+${hex(dd,2)})`;
      } else {
        const ops = ['RLC','RRC','RL','RR','SLA','SRA','SLL','SRL'];
        mnemonic = `${ops[(op>>3)&7]} (IY+${hex(dd,2)})`;
      }
      iyRefs.push({ addr: instrStart, offset: dd, resolved: iyAddr, mnemonic });
      if (KNOWN_ADDRS[iyAddr]) mnemonic += `  ; IY+${hex(dd,2)} = ${hex(iyAddr)} ${KNOWN_ADDRS[iyAddr]}`;
    } else if (b1 === 0x7E) {
      const dd = r8(pc + 2); bytes = 3;
      const iyAddr = IY_BASE + dd;
      mnemonic = `LD A,(IY+${hex(dd,2)})`;
      iyRefs.push({ addr: instrStart, offset: dd, resolved: iyAddr, mnemonic });
      if (KNOWN_ADDRS[iyAddr]) mnemonic += `  ; ${hex(iyAddr)} ${KNOWN_ADDRS[iyAddr]}`;
    } else if (b1 === 0x77) {
      const dd = r8(pc + 2); bytes = 3;
      const iyAddr = IY_BASE + dd;
      mnemonic = `LD (IY+${hex(dd,2)}),A`;
      iyRefs.push({ addr: instrStart, offset: dd, resolved: iyAddr, mnemonic });
      if (KNOWN_ADDRS[iyAddr]) mnemonic += `  ; ${hex(iyAddr)} ${KNOWN_ADDRS[iyAddr]}`;
    } else if (b1 === 0x46 || b1 === 0x4E || b1 === 0x56 || b1 === 0x5E || b1 === 0x66 || b1 === 0x6E) {
      const regNames = { 0x46:'B', 0x4E:'C', 0x56:'D', 0x5E:'E', 0x66:'H', 0x6E:'L' };
      const dd = r8(pc + 2); bytes = 3;
      const iyAddr = IY_BASE + dd;
      mnemonic = `LD ${regNames[b1]},(IY+${hex(dd,2)})`;
      iyRefs.push({ addr: instrStart, offset: dd, resolved: iyAddr, mnemonic });
      if (KNOWN_ADDRS[iyAddr]) mnemonic += `  ; ${hex(iyAddr)} ${KNOWN_ADDRS[iyAddr]}`;
    } else if (b1 === 0xE5) { bytes = 2; mnemonic = 'PUSH IY'; }
    else if (b1 === 0xE1) { bytes = 2; mnemonic = 'POP IY'; }
    else {
      bytes = 2;
      mnemonic = `FD-prefix: FD ${hex(b1,2)} (unknown)`;
    }
  }
  // ---- ED prefix ----
  else if (b0 === 0xED) {
    const b1 = r8(pc + 1);

    if (b1 === 0x5B) {
      const addr = r24(pc + 2); bytes = 5;
      mnemonic = `LD DE,(${hex(addr)})${labelAddr(addr)}`;
      addrRefs.push({ addr: instrStart, target: addr, type: 'LD DE,(addr24)' });
    } else if (b1 === 0x4B) {
      const addr = r24(pc + 2); bytes = 5;
      mnemonic = `LD BC,(${hex(addr)})${labelAddr(addr)}`;
      addrRefs.push({ addr: instrStart, target: addr, type: 'LD BC,(addr24)' });
    } else if (b1 === 0x53) {
      const addr = r24(pc + 2); bytes = 5;
      mnemonic = `LD (${hex(addr)}),DE${labelAddr(addr)}`;
      addrRefs.push({ addr: instrStart, target: addr, type: 'LD (addr24),DE' });
    } else if (b1 === 0x43) {
      const addr = r24(pc + 2); bytes = 5;
      mnemonic = `LD (${hex(addr)}),BC${labelAddr(addr)}`;
      addrRefs.push({ addr: instrStart, target: addr, type: 'LD (addr24),BC' });
    } else if (b1 === 0x63) {
      const addr = r24(pc + 2); bytes = 5;
      mnemonic = `LD (${hex(addr)}),HL${labelAddr(addr)}`;
      addrRefs.push({ addr: instrStart, target: addr, type: 'LD (addr24),HL' });
    } else if (b1 === 0x6B) {
      const addr = r24(pc + 2); bytes = 5;
      mnemonic = `LD HL,(${hex(addr)})${labelAddr(addr)}`;
      addrRefs.push({ addr: instrStart, target: addr, type: 'LD HL,(addr24)' });
    } else if (b1 === 0x6C) { bytes = 2; mnemonic = 'MLT HL'; }
    else if (b1 === 0x44) { bytes = 2; mnemonic = 'NEG'; }
    else if (b1 === 0x4C) { bytes = 2; mnemonic = 'MLT BC'; }
    else if (b1 === 0x5C) { bytes = 2; mnemonic = 'MLT DE'; }
    else if (b1 === 0x7C) { bytes = 2; mnemonic = 'MLT SP'; }
    else if (b1 === 0xB0) { bytes = 2; mnemonic = 'LDIR'; }
    else if (b1 === 0xB8) { bytes = 2; mnemonic = 'LDDR'; }
    else if (b1 === 0xA0) { bytes = 2; mnemonic = 'LDI'; }
    else if (b1 === 0xA8) { bytes = 2; mnemonic = 'LDD'; }
    else if (b1 === 0xA1) { bytes = 2; mnemonic = 'CPI'; }
    else if (b1 === 0xB1) { bytes = 2; mnemonic = 'CPIR'; }
    else if (b1 === 0x42) { bytes = 2; mnemonic = 'SBC HL,BC'; }
    else if (b1 === 0x52) { bytes = 2; mnemonic = 'SBC HL,DE'; }
    else if (b1 === 0x62) { bytes = 2; mnemonic = 'SBC HL,HL'; }
    else if (b1 === 0x72) { bytes = 2; mnemonic = 'SBC HL,SP'; }
    else if (b1 === 0x4A) { bytes = 2; mnemonic = 'ADC HL,BC'; }
    else if (b1 === 0x5A) { bytes = 2; mnemonic = 'ADC HL,DE'; }
    else if (b1 === 0x6A) { bytes = 2; mnemonic = 'ADC HL,HL'; }
    else if (b1 === 0x7A) { bytes = 2; mnemonic = 'ADC HL,SP'; }
    else if (b1 === 0x57) { bytes = 2; mnemonic = 'LD A,I'; }
    else if (b1 === 0x5F) { bytes = 2; mnemonic = 'LD A,R'; }
    else if (b1 === 0x47) { bytes = 2; mnemonic = 'LD I,A'; }
    else if (b1 === 0x4F) { bytes = 2; mnemonic = 'LD R,A'; }
    else if (b1 === 0x45) { bytes = 2; mnemonic = 'RETN'; done = true; }
    else if (b1 === 0x4D) { bytes = 2; mnemonic = 'RETI'; done = true; }
    else {
      bytes = 2;
      mnemonic = `ED-prefix: ED ${hex(b1,2)} (unknown)`;
    }
  }
  // ---- CB prefix (bit operations) ----
  else if (b0 === 0xCB) {
    const b1 = r8(pc + 1);
    bytes = 2;
    const reg = REG8[b1 & 7];
    const bit = (b1 >> 3) & 7;
    if ((b1 & 0xC0) === 0x00) {
      const ops = ['RLC','RRC','RL','RR','SLA','SRA','SLL','SRL'];
      mnemonic = `${ops[bit]} ${reg}`;
    } else if ((b1 & 0xC0) === 0x40) {
      mnemonic = `BIT ${bit},${reg}`;
    } else if ((b1 & 0xC0) === 0x80) {
      mnemonic = `RES ${bit},${reg}`;
    } else {
      mnemonic = `SET ${bit},${reg}`;
    }
  }
  // ---- Single-byte and multi-byte instructions ----
  else {
    switch (b0) {
      case 0xC9: mnemonic = 'RET'; bytes = 1; done = true; break;
      case 0xC8: mnemonic = 'RET Z'; bytes = 1; retCount++; break;
      case 0xC0: mnemonic = 'RET NZ'; bytes = 1; retCount++; break;
      case 0xD8: mnemonic = 'RET C'; bytes = 1; retCount++; break;
      case 0xD0: mnemonic = 'RET NC'; bytes = 1; retCount++; break;
      case 0xE8: mnemonic = 'RET PE'; bytes = 1; retCount++; break;
      case 0xE0: mnemonic = 'RET PO'; bytes = 1; retCount++; break;
      case 0xF8: mnemonic = 'RET M'; bytes = 1; retCount++; break;
      case 0xF0: mnemonic = 'RET P'; bytes = 1; retCount++; break;

      case 0xCD: {
        const addr = r24(pc + 1); bytes = 4;
        mnemonic = `CALL ${hex(addr)}${labelAddr(addr)}`;
        callTargets.push({ addr: instrStart, target: addr });
        break;
      }
      case 0xC4: case 0xCC: case 0xD4: case 0xDC:
      case 0xE4: case 0xEC: case 0xF4: case 0xFC: {
        const ccIdx = (b0 >> 3) & 7;
        const addr = r24(pc + 1); bytes = 4;
        mnemonic = `CALL ${CC_NAMES[ccIdx]},${hex(addr)}${labelAddr(addr)}`;
        callTargets.push({ addr: instrStart, target: addr, condition: CC_NAMES[ccIdx] });
        break;
      }

      case 0xC3: {
        const addr = r24(pc + 1); bytes = 4;
        mnemonic = `JP ${hex(addr)}${labelAddr(addr)}`;
        jpTargets.push({ addr: instrStart, target: addr });
        break;
      }
      case 0xC2: case 0xCA: case 0xD2: case 0xDA:
      case 0xE2: case 0xEA: case 0xF2: case 0xFA: {
        const ccIdx = (b0 >> 3) & 7;
        const addr = r24(pc + 1); bytes = 4;
        mnemonic = `JP ${CC_NAMES[ccIdx]},${hex(addr)}${labelAddr(addr)}`;
        jpTargets.push({ addr: instrStart, target: addr, condition: CC_NAMES[ccIdx] });
        break;
      }

      case 0xE9: mnemonic = 'JP (HL)'; bytes = 1; done = true; break;

      case 0x18: { const rel = r8(pc+1); const t = pc+2+((rel&0x80)?rel-256:rel); bytes = 2; mnemonic = `JR ${hex(t)}`; break; }
      case 0x20: { const rel = r8(pc+1); const t = pc+2+((rel&0x80)?rel-256:rel); bytes = 2; mnemonic = `JR NZ,${hex(t)}`; break; }
      case 0x28: { const rel = r8(pc+1); const t = pc+2+((rel&0x80)?rel-256:rel); bytes = 2; mnemonic = `JR Z,${hex(t)}`; break; }
      case 0x30: { const rel = r8(pc+1); const t = pc+2+((rel&0x80)?rel-256:rel); bytes = 2; mnemonic = `JR NC,${hex(t)}`; break; }
      case 0x38: { const rel = r8(pc+1); const t = pc+2+((rel&0x80)?rel-256:rel); bytes = 2; mnemonic = `JR C,${hex(t)}`; break; }
      case 0x10: { const rel = r8(pc+1); const t = pc+2+((rel&0x80)?rel-256:rel); bytes = 2; mnemonic = `DJNZ ${hex(t)}`; break; }

      case 0x3E: { bytes = 2; mnemonic = `LD A,${hex(r8(pc+1),2)}`; break; }
      case 0x06: { bytes = 2; mnemonic = `LD B,${hex(r8(pc+1),2)}`; break; }
      case 0x0E: { bytes = 2; mnemonic = `LD C,${hex(r8(pc+1),2)}`; break; }
      case 0x16: { bytes = 2; mnemonic = `LD D,${hex(r8(pc+1),2)}`; break; }
      case 0x1E: { bytes = 2; mnemonic = `LD E,${hex(r8(pc+1),2)}`; break; }
      case 0x26: { bytes = 2; mnemonic = `LD H,${hex(r8(pc+1),2)}`; break; }
      case 0x2E: { bytes = 2; mnemonic = `LD L,${hex(r8(pc+1),2)}`; break; }
      case 0x36: { bytes = 2; mnemonic = `LD (HL),${hex(r8(pc+1),2)}`; break; }

      case 0x3A: { const addr = r24(pc+1); bytes = 4; mnemonic = `LD A,(${hex(addr)})${labelAddr(addr)}`; addrRefs.push({ addr: instrStart, target: addr, type: 'LD A,(addr24)' }); break; }
      case 0x32: { const addr = r24(pc+1); bytes = 4; mnemonic = `LD (${hex(addr)}),A${labelAddr(addr)}`; addrRefs.push({ addr: instrStart, target: addr, type: 'LD (addr24),A' }); break; }
      case 0x2A: { const addr = r24(pc+1); bytes = 4; mnemonic = `LD HL,(${hex(addr)})${labelAddr(addr)}`; addrRefs.push({ addr: instrStart, target: addr, type: 'LD HL,(addr24)' }); break; }
      case 0x22: { const addr = r24(pc+1); bytes = 4; mnemonic = `LD (${hex(addr)}),HL${labelAddr(addr)}`; addrRefs.push({ addr: instrStart, target: addr, type: 'LD (addr24),HL' }); break; }

      case 0x21: { const imm = r24(pc+1); bytes = 4; mnemonic = `LD HL,${hex(imm)}`; addrRefs.push({ addr: instrStart, target: imm, type: 'LD HL,imm24' }); break; }
      case 0x01: { const imm = r24(pc+1); bytes = 4; mnemonic = `LD BC,${hex(imm)}`; addrRefs.push({ addr: instrStart, target: imm, type: 'LD BC,imm24' }); break; }
      case 0x11: { const imm = r24(pc+1); bytes = 4; mnemonic = `LD DE,${hex(imm)}`; addrRefs.push({ addr: instrStart, target: imm, type: 'LD DE,imm24' }); break; }
      case 0x31: { const imm = r24(pc+1); bytes = 4; mnemonic = `LD SP,${hex(imm)}`; addrRefs.push({ addr: instrStart, target: imm, type: 'LD SP,imm24' }); break; }

      case 0xFE: { bytes = 2; mnemonic = `CP A,${hex(r8(pc+1),2)}`; break; }
      case 0xC6: { bytes = 2; mnemonic = `ADD A,${hex(r8(pc+1),2)}`; break; }
      case 0xCE: { bytes = 2; mnemonic = `ADC A,${hex(r8(pc+1),2)}`; break; }
      case 0xD6: { bytes = 2; mnemonic = `SUB A,${hex(r8(pc+1),2)}`; break; }
      case 0xDE: { bytes = 2; mnemonic = `SBC A,${hex(r8(pc+1),2)}`; break; }
      case 0xE6: { bytes = 2; mnemonic = `AND A,${hex(r8(pc+1),2)}`; break; }
      case 0xEE: { bytes = 2; mnemonic = `XOR A,${hex(r8(pc+1),2)}`; break; }
      case 0xF6: { bytes = 2; mnemonic = `OR A,${hex(r8(pc+1),2)}`; break; }

      case 0xC5: mnemonic = 'PUSH BC'; break;
      case 0xD5: mnemonic = 'PUSH DE'; break;
      case 0xE5: mnemonic = 'PUSH HL'; break;
      case 0xF5: mnemonic = 'PUSH AF'; break;
      case 0xC1: mnemonic = 'POP BC'; break;
      case 0xD1: mnemonic = 'POP DE'; break;
      case 0xE1: mnemonic = 'POP HL'; break;
      case 0xF1: mnemonic = 'POP AF'; break;

      case 0x3C: mnemonic = 'INC A'; break;
      case 0x04: mnemonic = 'INC B'; break;
      case 0x0C: mnemonic = 'INC C'; break;
      case 0x14: mnemonic = 'INC D'; break;
      case 0x1C: mnemonic = 'INC E'; break;
      case 0x24: mnemonic = 'INC H'; break;
      case 0x2C: mnemonic = 'INC L'; break;
      case 0x34: mnemonic = 'INC (HL)'; break;
      case 0x3D: mnemonic = 'DEC A'; break;
      case 0x05: mnemonic = 'DEC B'; break;
      case 0x0D: mnemonic = 'DEC C'; break;
      case 0x15: mnemonic = 'DEC D'; break;
      case 0x1D: mnemonic = 'DEC E'; break;
      case 0x25: mnemonic = 'DEC H'; break;
      case 0x2D: mnemonic = 'DEC L'; break;
      case 0x35: mnemonic = 'DEC (HL)'; break;

      case 0x03: mnemonic = 'INC BC'; break;
      case 0x13: mnemonic = 'INC DE'; break;
      case 0x23: mnemonic = 'INC HL'; break;
      case 0x33: mnemonic = 'INC SP'; break;
      case 0x0B: mnemonic = 'DEC BC'; break;
      case 0x1B: mnemonic = 'DEC DE'; break;
      case 0x2B: mnemonic = 'DEC HL'; break;
      case 0x3B: mnemonic = 'DEC SP'; break;

      case 0x09: mnemonic = 'ADD HL,BC'; break;
      case 0x19: mnemonic = 'ADD HL,DE'; break;
      case 0x29: mnemonic = 'ADD HL,HL'; break;
      case 0x39: mnemonic = 'ADD HL,SP'; break;

      case 0x40: mnemonic = 'LD B,B'; break;  case 0x41: mnemonic = 'LD B,C'; break;
      case 0x42: mnemonic = 'LD B,D'; break;  case 0x43: mnemonic = 'LD B,E'; break;
      case 0x44: mnemonic = 'LD B,H'; break;  case 0x45: mnemonic = 'LD B,L'; break;
      case 0x46: mnemonic = 'LD B,(HL)'; break; case 0x47: mnemonic = 'LD B,A'; break;
      case 0x48: mnemonic = 'LD C,B'; break;  case 0x49: mnemonic = 'LD C,C'; break;
      case 0x4A: mnemonic = 'LD C,D'; break;  case 0x4B: mnemonic = 'LD C,E'; break;
      case 0x4C: mnemonic = 'LD C,H'; break;  case 0x4D: mnemonic = 'LD C,L'; break;
      case 0x4E: mnemonic = 'LD C,(HL)'; break; case 0x4F: mnemonic = 'LD C,A'; break;
      case 0x50: mnemonic = 'LD D,B'; break;  case 0x51: mnemonic = 'LD D,C'; break;
      case 0x52: mnemonic = 'LD D,D'; break;  case 0x53: mnemonic = 'LD D,E'; break;
      case 0x54: mnemonic = 'LD D,H'; break;  case 0x55: mnemonic = 'LD D,L'; break;
      case 0x56: mnemonic = 'LD D,(HL)'; break; case 0x57: mnemonic = 'LD D,A'; break;
      case 0x58: mnemonic = 'LD E,B'; break;  case 0x59: mnemonic = 'LD E,C'; break;
      case 0x5A: mnemonic = 'LD E,D'; break;  case 0x5B: mnemonic = 'LD E,E'; break;
      case 0x5C: mnemonic = 'LD E,H'; break;  case 0x5D: mnemonic = 'LD E,L'; break;
      case 0x5E: mnemonic = 'LD E,(HL)'; break; case 0x5F: mnemonic = 'LD E,A'; break;
      case 0x60: mnemonic = 'LD H,B'; break;  case 0x61: mnemonic = 'LD H,C'; break;
      case 0x62: mnemonic = 'LD H,D'; break;  case 0x63: mnemonic = 'LD H,E'; break;
      case 0x64: mnemonic = 'LD H,H'; break;  case 0x65: mnemonic = 'LD H,L'; break;
      case 0x66: mnemonic = 'LD H,(HL)'; break; case 0x67: mnemonic = 'LD H,A'; break;
      case 0x68: mnemonic = 'LD L,B'; break;  case 0x69: mnemonic = 'LD L,C'; break;
      case 0x6A: mnemonic = 'LD L,D'; break;  case 0x6B: mnemonic = 'LD L,E'; break;
      case 0x6C: mnemonic = 'LD L,H'; break;  case 0x6D: mnemonic = 'LD L,L'; break;
      case 0x6E: mnemonic = 'LD L,(HL)'; break; case 0x6F: mnemonic = 'LD L,A'; break;
      case 0x70: mnemonic = 'LD (HL),B'; break; case 0x71: mnemonic = 'LD (HL),C'; break;
      case 0x72: mnemonic = 'LD (HL),D'; break; case 0x73: mnemonic = 'LD (HL),E'; break;
      case 0x74: mnemonic = 'LD (HL),H'; break; case 0x75: mnemonic = 'LD (HL),L'; break;
      case 0x77: mnemonic = 'LD (HL),A'; break;
      case 0x78: mnemonic = 'LD A,B'; break;  case 0x79: mnemonic = 'LD A,C'; break;
      case 0x7A: mnemonic = 'LD A,D'; break;  case 0x7B: mnemonic = 'LD A,E'; break;
      case 0x7C: mnemonic = 'LD A,H'; break;  case 0x7D: mnemonic = 'LD A,L'; break;
      case 0x7E: mnemonic = 'LD A,(HL)'; break; case 0x7F: mnemonic = 'LD A,A'; break;

      case 0x80: mnemonic = 'ADD A,B'; break; case 0x81: mnemonic = 'ADD A,C'; break;
      case 0x82: mnemonic = 'ADD A,D'; break; case 0x83: mnemonic = 'ADD A,E'; break;
      case 0x84: mnemonic = 'ADD A,H'; break; case 0x85: mnemonic = 'ADD A,L'; break;
      case 0x86: mnemonic = 'ADD A,(HL)'; break; case 0x87: mnemonic = 'ADD A,A'; break;
      case 0x88: mnemonic = 'ADC A,B'; break; case 0x89: mnemonic = 'ADC A,C'; break;
      case 0x8A: mnemonic = 'ADC A,D'; break; case 0x8B: mnemonic = 'ADC A,E'; break;
      case 0x8C: mnemonic = 'ADC A,H'; break; case 0x8D: mnemonic = 'ADC A,L'; break;
      case 0x8E: mnemonic = 'ADC A,(HL)'; break; case 0x8F: mnemonic = 'ADC A,A'; break;
      case 0x90: mnemonic = 'SUB A,B'; break; case 0x91: mnemonic = 'SUB A,C'; break;
      case 0x92: mnemonic = 'SUB A,D'; break; case 0x93: mnemonic = 'SUB A,E'; break;
      case 0x94: mnemonic = 'SUB A,H'; break; case 0x95: mnemonic = 'SUB A,L'; break;
      case 0x96: mnemonic = 'SUB A,(HL)'; break; case 0x97: mnemonic = 'SUB A,A'; break;
      case 0x98: mnemonic = 'SBC A,B'; break; case 0x99: mnemonic = 'SBC A,C'; break;
      case 0x9A: mnemonic = 'SBC A,D'; break; case 0x9B: mnemonic = 'SBC A,E'; break;
      case 0x9C: mnemonic = 'SBC A,H'; break; case 0x9D: mnemonic = 'SBC A,L'; break;
      case 0x9E: mnemonic = 'SBC A,(HL)'; break; case 0x9F: mnemonic = 'SBC A,A'; break;
      case 0xA0: mnemonic = 'AND A,B'; break; case 0xA1: mnemonic = 'AND A,C'; break;
      case 0xA2: mnemonic = 'AND A,D'; break; case 0xA3: mnemonic = 'AND A,E'; break;
      case 0xA4: mnemonic = 'AND A,H'; break; case 0xA5: mnemonic = 'AND A,L'; break;
      case 0xA6: mnemonic = 'AND A,(HL)'; break; case 0xA7: mnemonic = 'AND A,A'; break;
      case 0xA8: mnemonic = 'XOR A,B'; break; case 0xA9: mnemonic = 'XOR A,C'; break;
      case 0xAA: mnemonic = 'XOR A,D'; break; case 0xAB: mnemonic = 'XOR A,E'; break;
      case 0xAC: mnemonic = 'XOR A,H'; break; case 0xAD: mnemonic = 'XOR A,L'; break;
      case 0xAE: mnemonic = 'XOR A,(HL)'; break; case 0xAF: mnemonic = 'XOR A,A'; break;
      case 0xB0: mnemonic = 'OR A,B'; break;  case 0xB1: mnemonic = 'OR A,C'; break;
      case 0xB2: mnemonic = 'OR A,D'; break;  case 0xB3: mnemonic = 'OR A,E'; break;
      case 0xB4: mnemonic = 'OR A,H'; break;  case 0xB5: mnemonic = 'OR A,L'; break;
      case 0xB6: mnemonic = 'OR A,(HL)'; break; case 0xB7: mnemonic = 'OR A,A'; break;
      case 0xB8: mnemonic = 'CP A,B'; break;  case 0xB9: mnemonic = 'CP A,C'; break;
      case 0xBA: mnemonic = 'CP A,D'; break;  case 0xBB: mnemonic = 'CP A,E'; break;
      case 0xBC: mnemonic = 'CP A,H'; break;  case 0xBD: mnemonic = 'CP A,L'; break;
      case 0xBE: mnemonic = 'CP A,(HL)'; break; case 0xBF: mnemonic = 'CP A,A'; break;

      case 0xC7: mnemonic = 'RST 00H'; break;
      case 0xCF: mnemonic = 'RST 08H'; break;
      case 0xD7: mnemonic = 'RST 10H'; break;
      case 0xDF: mnemonic = 'RST 18H'; break;
      case 0xE7: mnemonic = 'RST 20H'; break;
      case 0xEF: mnemonic = 'RST 28H'; break;
      case 0xF7: mnemonic = 'RST 30H'; break;
      case 0xFF: mnemonic = 'RST 38H'; break;

      case 0x0A: mnemonic = 'LD A,(BC)'; break;
      case 0x1A: mnemonic = 'LD A,(DE)'; break;
      case 0x02: mnemonic = 'LD (BC),A'; break;
      case 0x12: mnemonic = 'LD (DE),A'; break;

      case 0x00: mnemonic = 'NOP'; break;
      case 0x76: mnemonic = 'HALT'; done = true; break;
      case 0xF3: mnemonic = 'DI'; break;
      case 0xFB: mnemonic = 'EI'; break;
      case 0x37: mnemonic = 'SCF'; break;
      case 0x3F: mnemonic = 'CCF'; break;
      case 0x2F: mnemonic = 'CPL'; break;
      case 0x27: mnemonic = 'DAA'; break;
      case 0x17: mnemonic = 'RLA'; break;
      case 0x1F: mnemonic = 'RRA'; break;
      case 0x07: mnemonic = 'RLCA'; break;
      case 0x0F: mnemonic = 'RRCA'; break;
      case 0xD9: mnemonic = 'EXX'; break;
      case 0x08: mnemonic = 'EX AF,AF\''; break;
      case 0xEB: mnemonic = 'EX DE,HL'; break;
      case 0xE3: mnemonic = 'EX (SP),HL'; break;
      case 0xF9: mnemonic = 'LD SP,HL'; break;

      case 0xD3: { bytes = 2; mnemonic = `OUT (${hex(r8(pc+1),2)}),A`; break; }
      case 0xDB: { bytes = 2; mnemonic = `IN A,(${hex(r8(pc+1),2)})`; break; }

      default:
        mnemonic = `??? (${hex(b0,2)})`;
        break;
    }
  }

  instructions.push({
    addr: instrStart,
    bytes: hexBytes(instrStart, bytes),
    mnemonic,
    size: bytes,
  });

  pc += bytes;
}

// ============================================================
// Output
// ============================================================

const funcSize = pc - START;

console.log('='.repeat(72));
console.log(`DISASSEMBLY OF 0x${START.toString(16).toUpperCase()}`);
console.log(`Function size: ${funcSize} bytes (${hex(START)} - ${hex(pc - 1)})`);
console.log('='.repeat(72));
console.log('');

for (const instr of instructions) {
  const addrStr = hex(instr.addr).padEnd(10);
  const bytesStr = instr.bytes.padEnd(18);
  console.log(`${addrStr} ${bytesStr} ${instr.mnemonic}`);
}

console.log('');
console.log('='.repeat(72));
console.log('CALL TARGETS');
console.log('='.repeat(72));
if (callTargets.length === 0) {
  console.log('  (none)');
} else {
  for (const ct of callTargets) {
    const cond = ct.condition ? ` (${ct.condition})` : '';
    console.log(`  ${hex(ct.addr)} -> CALL ${hex(ct.target)}${cond}${labelAddr(ct.target)}`);
  }
}

console.log('');
console.log('='.repeat(72));
console.log('JP TARGETS');
console.log('='.repeat(72));
if (jpTargets.length === 0) {
  console.log('  (none)');
} else {
  for (const jt of jpTargets) {
    const cond = jt.condition ? ` (${jt.condition})` : '';
    const internal = (jt.target >= START && jt.target < pc) ? ' [INTERNAL]' : ' [EXTERNAL]';
    console.log(`  ${hex(jt.addr)} -> JP ${hex(jt.target)}${cond}${internal}${labelAddr(jt.target)}`);
  }
}

console.log('');
console.log('='.repeat(72));
console.log('MEMORY ADDRESS REFERENCES');
console.log('='.repeat(72));
if (addrRefs.length === 0) {
  console.log('  (none)');
} else {
  for (const ar of addrRefs) {
    const known = KNOWN_ADDRS[ar.target] ? ` *** ${KNOWN_ADDRS[ar.target]} ***` : '';
    console.log(`  ${hex(ar.addr)} : ${ar.type} -> ${hex(ar.target)}${known}`);
  }
}

console.log('');
console.log('='.repeat(72));
console.log('IY+OFFSET REFERENCES (IY = 0xD00080)');
console.log('='.repeat(72));
if (iyRefs.length === 0) {
  console.log('  (none)');
} else {
  for (const ir of iyRefs) {
    const known = KNOWN_ADDRS[ir.resolved] ? ` *** ${KNOWN_ADDRS[ir.resolved]} ***` : '';
    console.log(`  ${hex(ir.addr)} : IY+${hex(ir.offset,2)} = ${hex(ir.resolved)}${known}`);
  }
}

console.log('');
console.log('='.repeat(72));
console.log('CURSOR RAM REFERENCE SUMMARY');
console.log('='.repeat(72));
const cursorAddrs = [0xD00595, 0xD00596, 0xD02575, 0xD008D2, 0xD008D5, 0xD007E0];
for (const ca of cursorAddrs) {
  const name = KNOWN_ADDRS[ca];
  const directHits = addrRefs.filter(r => r.target === ca);
  const iyHits = iyRefs.filter(r => r.resolved === ca);
  const total = directHits.length + iyHits.length;
  if (total > 0) {
    console.log(`  ${hex(ca)} (${name}): ${total} reference(s)`);
    for (const h of directHits) console.log(`    direct @ ${hex(h.addr)} : ${h.type}`);
    for (const h of iyHits) console.log(`    IY+${hex(h.offset,2)} @ ${hex(h.addr)}`);
  } else {
    console.log(`  ${hex(ca)} (${name}): no references`);
  }
}

console.log('');
console.log(`Total instructions: ${instructions.length}`);
console.log(`Function bytes: ${funcSize}`);
console.log(`Conditional RETs: ${retCount}`);
console.log(`CALL targets: ${callTargets.length}`);
console.log(`JP targets: ${jpTargets.length}`);
console.log(`Memory refs: ${addrRefs.length}`);
console.log(`IY refs: ${iyRefs.length}`);

if (!done) {
  console.log('\nWARNING: Disassembly hit safety limit without finding unconditional RET/JP (HL)/HALT');
  console.log(`Last PC: ${hex(pc)}`);
}

console.log('\nDone.');
