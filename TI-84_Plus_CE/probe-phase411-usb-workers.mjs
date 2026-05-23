// Phase 411: USB/Link receive workers deep decode
//
// Session 409 found a 6-entry dispatch table at 0x0120AA. Three entries
// are USB/Link receive workers:
//   Handler 0: 0x013250 — USB receive worker A (reads D1776D buffer)
//   Handler 1: 0x013377 — USB receive worker B (reads D1776D, frees+re-allocs)
//   Handler 4: 0x0135CF — Extended link worker (validates 4 protocol sigs)
//
// Key RAM: D1776D=link buffer ptr, D17795=protocol state, D1778F=received size
//
// This probe disassembles each worker in full, extracts CALL/JP targets,
// RAM references, I/O ports, CP constants, and searches for callers.

import fs from 'fs';

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

function r8(off) { return rom[off]; }
function r16(off) { return rom[off] | (rom[off + 1] << 8); }
function r24(off) { return rom[off] | (rom[off + 1] << 8) | (rom[off + 2] << 16); }
function hex(n, w = 6) { return '0x' + n.toString(16).padStart(w, '0'); }
function hexByte(b) { return b.toString(16).padStart(2, '0'); }
function rawBytes(start, len) {
  return Array.from(rom.slice(start, start + len)).map(hexByte).join(' ');
}

// ──────────────────────────────────────────────
// eZ80 ADL disassembler (reused from phase 409)
// ──────────────────────────────────────────────

function disasmRange(startAddr, endAddr) {
  const result = [];
  let pc = startAddr;

  while (pc < endAddr) {
    const iStart = pc;
    const op = rom[pc++];
    let desc = '';
    let refs = { calls: [], jumps: [], ramReads: [], ramWrites: [], ports: [], compares: [] };

    switch (op) {
      // ── Prefixed DD (IX) ──
      case 0xDD: {
        const op2 = rom[pc++];
        switch (op2) {
          case 0xE5: desc = 'PUSH IX'; break;
          case 0xE1: desc = 'POP IX'; break;
          case 0xF9: desc = 'LD SP,IX'; break;
          case 0xE3: desc = 'EX (SP),IX'; break;
          case 0xE9: desc = 'JP (IX)'; break;
          case 0x21: { const a = r24(pc); pc += 3; desc = `LD IX,${hex(a)}`; break; }
          case 0x22: { const a = r24(pc); pc += 3; desc = `LD (${hex(a)}),IX`; refs.ramWrites.push(a); break; }
          case 0x2A: { const a = r24(pc); pc += 3; desc = `LD IX,(${hex(a)})`; refs.ramReads.push(a); break; }
          case 0x27: { const d = rom[pc++]; desc = `LD HL,(IX+${hexByte(d)})`; break; }
          case 0x31: { const d = rom[pc++]; desc = `LD SP,(IX+${hexByte(d)})`; break; }
          case 0x07: { const d = rom[pc++]; desc = `LD BC,(IX+${hexByte(d)})`; break; }
          case 0x17: { const d = rom[pc++]; desc = `LD DE,(IX+${hexByte(d)})`; break; }
          case 0x0F: { const d = rom[pc++]; desc = `LD (IX+${hexByte(d)}),BC`; break; }
          case 0x1F: { const d = rom[pc++]; desc = `LD (IX+${hexByte(d)}),DE`; break; }
          case 0x3F: { const d = rom[pc++]; desc = `LD (IX+${hexByte(d)}),HL`; break; }
          case 0x36: { const d = rom[pc++]; const v = rom[pc++]; desc = `LD (IX+${hexByte(d)}),${hexByte(v)}`; break; }
          case 0x46: { const d = rom[pc++]; desc = `LD B,(IX+${hexByte(d)})`; break; }
          case 0x4E: { const d = rom[pc++]; desc = `LD C,(IX+${hexByte(d)})`; break; }
          case 0x56: { const d = rom[pc++]; desc = `LD D,(IX+${hexByte(d)})`; break; }
          case 0x5E: { const d = rom[pc++]; desc = `LD E,(IX+${hexByte(d)})`; break; }
          case 0x66: { const d = rom[pc++]; desc = `LD H,(IX+${hexByte(d)})`; break; }
          case 0x6E: { const d = rom[pc++]; desc = `LD L,(IX+${hexByte(d)})`; break; }
          case 0x7E: { const d = rom[pc++]; desc = `LD A,(IX+${hexByte(d)})`; break; }
          case 0x70: { const d = rom[pc++]; desc = `LD (IX+${hexByte(d)}),B`; break; }
          case 0x71: { const d = rom[pc++]; desc = `LD (IX+${hexByte(d)}),C`; break; }
          case 0x72: { const d = rom[pc++]; desc = `LD (IX+${hexByte(d)}),D`; break; }
          case 0x73: { const d = rom[pc++]; desc = `LD (IX+${hexByte(d)}),E`; break; }
          case 0x74: { const d = rom[pc++]; desc = `LD (IX+${hexByte(d)}),H`; break; }
          case 0x75: { const d = rom[pc++]; desc = `LD (IX+${hexByte(d)}),L`; break; }
          case 0x77: { const d = rom[pc++]; desc = `LD (IX+${hexByte(d)}),A`; break; }
          case 0xBE: { const d = rom[pc++]; desc = `CP (IX+${hexByte(d)})`; break; }
          case 0x86: { const d = rom[pc++]; desc = `ADD A,(IX+${hexByte(d)})`; break; }
          case 0x96: { const d = rom[pc++]; desc = `SUB (IX+${hexByte(d)})`; break; }
          case 0xA6: { const d = rom[pc++]; desc = `AND (IX+${hexByte(d)})`; break; }
          case 0xAE: { const d = rom[pc++]; desc = `XOR (IX+${hexByte(d)})`; break; }
          case 0xB6: { const d = rom[pc++]; desc = `OR (IX+${hexByte(d)})`; break; }
          case 0x34: { const d = rom[pc++]; desc = `INC (IX+${hexByte(d)})`; break; }
          case 0x35: { const d = rom[pc++]; desc = `DEC (IX+${hexByte(d)})`; break; }
          case 0x23: desc = 'INC IX'; break;
          case 0x2B: desc = 'DEC IX'; break;
          case 0x09: desc = 'ADD IX,BC'; break;
          case 0x19: desc = 'ADD IX,DE'; break;
          case 0x29: desc = 'ADD IX,IX'; break;
          case 0x39: desc = 'ADD IX,SP'; break;
          case 0xCB: { const d = rom[pc++]; const cb = rom[pc++]; desc = `IX+CB d=${hexByte(d)} op=${hexByte(cb)}`; break; }
          default: desc = `DD ${hexByte(op2)} (unknown IX)`; break;
        }
        break;
      }

      // ── Prefixed FD (IY) ──
      case 0xFD: {
        const op2 = rom[pc++];
        switch (op2) {
          case 0xE5: desc = 'PUSH IY'; break;
          case 0xE1: desc = 'POP IY'; break;
          case 0xF9: desc = 'LD SP,IY'; break;
          case 0xE3: desc = 'EX (SP),IY'; break;
          case 0xE9: desc = 'JP (IY)'; break;
          case 0x21: { const a = r24(pc); pc += 3; desc = `LD IY,${hex(a)}`; break; }
          case 0x22: { const a = r24(pc); pc += 3; desc = `LD (${hex(a)}),IY`; refs.ramWrites.push(a); break; }
          case 0x2A: { const a = r24(pc); pc += 3; desc = `LD IY,(${hex(a)})`; refs.ramReads.push(a); break; }
          case 0x7E: { const d = rom[pc++]; desc = `LD A,(IY+${hexByte(d)})`; break; }
          case 0x77: { const d = rom[pc++]; desc = `LD (IY+${hexByte(d)}),A`; break; }
          case 0x27: { const d = rom[pc++]; desc = `LD HL,(IY+${hexByte(d)})`; break; }
          case 0x07: { const d = rom[pc++]; desc = `LD BC,(IY+${hexByte(d)})`; break; }
          case 0x17: { const d = rom[pc++]; desc = `LD DE,(IY+${hexByte(d)})`; break; }
          case 0x0F: { const d = rom[pc++]; desc = `LD (IY+${hexByte(d)}),BC`; break; }
          case 0x1F: { const d = rom[pc++]; desc = `LD (IY+${hexByte(d)}),DE`; break; }
          case 0x3F: { const d = rom[pc++]; desc = `LD (IY+${hexByte(d)}),HL`; break; }
          case 0x36: { const d = rom[pc++]; const v = rom[pc++]; desc = `LD (IY+${hexByte(d)}),${hexByte(v)}`; break; }
          case 0x46: { const d = rom[pc++]; desc = `LD B,(IY+${hexByte(d)})`; break; }
          case 0x4E: { const d = rom[pc++]; desc = `LD C,(IY+${hexByte(d)})`; break; }
          case 0x56: { const d = rom[pc++]; desc = `LD D,(IY+${hexByte(d)})`; break; }
          case 0x5E: { const d = rom[pc++]; desc = `LD E,(IY+${hexByte(d)})`; break; }
          case 0x66: { const d = rom[pc++]; desc = `LD H,(IY+${hexByte(d)})`; break; }
          case 0x6E: { const d = rom[pc++]; desc = `LD L,(IY+${hexByte(d)})`; break; }
          case 0xBE: { const d = rom[pc++]; desc = `CP (IY+${hexByte(d)})`; break; }
          case 0x34: { const d = rom[pc++]; desc = `INC (IY+${hexByte(d)})`; break; }
          case 0x35: { const d = rom[pc++]; desc = `DEC (IY+${hexByte(d)})`; break; }
          case 0x23: desc = 'INC IY'; break;
          case 0x2B: desc = 'DEC IY'; break;
          default: desc = `FD ${hexByte(op2)} (unknown IY)`; break;
        }
        break;
      }

      // ── Prefixed ED ──
      case 0xED: {
        const op2 = rom[pc++];
        switch (op2) {
          case 0x38: { const p = rom[pc++]; desc = `IN0 A,(${hexByte(p)})`; refs.ports.push({ dir: 'in', port: p }); break; }
          case 0x39: { const p = rom[pc++]; desc = `OUT0 (${hexByte(p)}),A`; refs.ports.push({ dir: 'out', port: p }); break; }
          case 0x00: { const p = rom[pc++]; desc = `IN0 B,(${hexByte(p)})`; refs.ports.push({ dir: 'in', port: p }); break; }
          case 0x01: { const p = rom[pc++]; desc = `OUT0 (${hexByte(p)}),B`; refs.ports.push({ dir: 'out', port: p }); break; }
          case 0x08: { const p = rom[pc++]; desc = `IN0 C,(${hexByte(p)})`; refs.ports.push({ dir: 'in', port: p }); break; }
          case 0x09: { const p = rom[pc++]; desc = `OUT0 (${hexByte(p)}),C`; refs.ports.push({ dir: 'out', port: p }); break; }
          case 0x10: { const p = rom[pc++]; desc = `IN0 D,(${hexByte(p)})`; refs.ports.push({ dir: 'in', port: p }); break; }
          case 0x11: { const p = rom[pc++]; desc = `OUT0 (${hexByte(p)}),D`; refs.ports.push({ dir: 'out', port: p }); break; }
          case 0x18: { const p = rom[pc++]; desc = `IN0 E,(${hexByte(p)})`; refs.ports.push({ dir: 'in', port: p }); break; }
          case 0x19: { const p = rom[pc++]; desc = `OUT0 (${hexByte(p)}),E`; refs.ports.push({ dir: 'out', port: p }); break; }
          case 0x20: { const p = rom[pc++]; desc = `IN0 H,(${hexByte(p)})`; refs.ports.push({ dir: 'in', port: p }); break; }
          case 0x21: { const p = rom[pc++]; desc = `OUT0 (${hexByte(p)}),H`; refs.ports.push({ dir: 'out', port: p }); break; }
          case 0x28: { const p = rom[pc++]; desc = `IN0 L,(${hexByte(p)})`; refs.ports.push({ dir: 'in', port: p }); break; }
          case 0x29: { const p = rom[pc++]; desc = `OUT0 (${hexByte(p)}),L`; refs.ports.push({ dir: 'out', port: p }); break; }
          case 0x42: desc = 'SBC HL,BC'; break;
          case 0x43: { const a = r24(pc); pc += 3; desc = `LD (${hex(a)}),BC`; refs.ramWrites.push(a); break; }
          case 0x4A: desc = 'ADC HL,BC'; break;
          case 0x4B: { const a = r24(pc); pc += 3; desc = `LD BC,(${hex(a)})`; refs.ramReads.push(a); break; }
          case 0x52: desc = 'SBC HL,DE'; break;
          case 0x53: { const a = r24(pc); pc += 3; desc = `LD (${hex(a)}),DE`; refs.ramWrites.push(a); break; }
          case 0x5A: desc = 'ADC HL,DE'; break;
          case 0x5B: { const a = r24(pc); pc += 3; desc = `LD DE,(${hex(a)})`; refs.ramReads.push(a); break; }
          case 0x62: desc = 'SBC HL,HL'; break;
          case 0x63: { const a = r24(pc); pc += 3; desc = `LD (${hex(a)}),HL`; refs.ramWrites.push(a); break; }
          case 0x6A: desc = 'ADC HL,HL'; break;
          case 0x6B: { const a = r24(pc); pc += 3; desc = `LD HL,(${hex(a)})`; refs.ramReads.push(a); break; }
          case 0x72: desc = 'SBC HL,SP'; break;
          case 0x73: { const a = r24(pc); pc += 3; desc = `LD (${hex(a)}),SP`; refs.ramWrites.push(a); break; }
          case 0x7A: desc = 'ADC HL,SP'; break;
          case 0x7B: { const a = r24(pc); pc += 3; desc = `LD SP,(${hex(a)})`; refs.ramReads.push(a); break; }
          case 0xB0: desc = 'LDIR'; break;
          case 0xB1: desc = 'CPIR'; break;
          case 0xB8: desc = 'LDDR'; break;
          case 0x32: { const d = rom[pc++]; desc = `LEA IX,IY+${hexByte(d)}`; break; }
          case 0x33: { const d = rom[pc++]; desc = `LEA IY,IY+${hexByte(d)}`; break; }
          case 0x54: { const d = rom[pc++]; desc = `LEA IX,IX+${hexByte(d)}`; break; }
          case 0x55: { const d = rom[pc++]; desc = `LEA IY,IX+${hexByte(d)}`; break; }
          case 0x65: { const d = rom[pc++]; desc = `PEA IX+${hexByte(d)}`; break; }
          case 0x66: { const d = rom[pc++]; desc = `PEA IY+${hexByte(d)}`; break; }
          case 0x44: desc = 'NEG'; break;
          case 0x4D: desc = 'RETI'; break;
          case 0x45: desc = 'RETN'; break;
          case 0x46: desc = 'IM 0'; break;
          case 0x56: desc = 'IM 1'; break;
          case 0x5E: desc = 'IM 2'; break;
          case 0x47: desc = 'LD I,A'; break;
          case 0x4F: desc = 'LD R,A'; break;
          case 0x57: desc = 'LD A,I'; break;
          case 0x5F: desc = 'LD A,R'; break;
          case 0xA0: desc = 'LDI'; break;
          case 0xA8: desc = 'LDD'; break;
          case 0xA1: desc = 'CPI'; break;
          case 0xA9: desc = 'CPD'; break;
          default: desc = `ED ${hexByte(op2)}`; break;
        }
        break;
      }

      // ── CB prefix ──
      case 0xCB: {
        const op2 = rom[pc++];
        const bit = (op2 >> 3) & 7;
        const reg = op2 & 7;
        const regNames = ['B','C','D','E','H','L','(HL)','A'];
        if (op2 < 0x08) { desc = `RLC ${regNames[reg]}`; }
        else if (op2 < 0x10) { desc = `RRC ${regNames[reg]}`; }
        else if (op2 < 0x18) { desc = `RL ${regNames[reg]}`; }
        else if (op2 < 0x20) { desc = `RR ${regNames[reg]}`; }
        else if (op2 < 0x28) { desc = `SLA ${regNames[reg]}`; }
        else if (op2 < 0x30) { desc = `SRA ${regNames[reg]}`; }
        else if (op2 < 0x38) { desc = `SLL ${regNames[reg]}`; }
        else if (op2 < 0x40) { desc = `SRL ${regNames[reg]}`; }
        else if (op2 < 0x80) { desc = `BIT ${bit},${regNames[reg]}`; }
        else if (op2 < 0xC0) { desc = `RES ${bit},${regNames[reg]}`; }
        else { desc = `SET ${bit},${regNames[reg]}`; }
        break;
      }

      // ── Single-byte and multi-byte ──
      case 0x00: desc = 'NOP'; break;
      case 0x01: { const a = r24(pc); pc += 3; desc = `LD BC,${hex(a)}`; break; }
      case 0x02: desc = 'LD (BC),A'; break;
      case 0x03: desc = 'INC BC'; break;
      case 0x04: desc = 'INC B'; break;
      case 0x05: desc = 'DEC B'; break;
      case 0x06: { desc = `LD B,${hexByte(rom[pc++])}`; break; }
      case 0x07: desc = 'RLCA'; break;
      case 0x08: desc = 'EX AF,AF\''; break;
      case 0x09: desc = 'ADD HL,BC'; break;
      case 0x0A: desc = 'LD A,(BC)'; break;
      case 0x0B: desc = 'DEC BC'; break;
      case 0x0C: desc = 'INC C'; break;
      case 0x0D: desc = 'DEC C'; break;
      case 0x0E: { desc = `LD C,${hexByte(rom[pc++])}`; break; }
      case 0x0F: desc = 'RRCA'; break;
      case 0x10: { const d = rom[pc++]; desc = `DJNZ ${hex(iStart + 2 + ((d < 128) ? d : d - 256))}`; refs.jumps.push(iStart + 2 + ((d < 128) ? d : d - 256)); break; }
      case 0x11: { const a = r24(pc); pc += 3; desc = `LD DE,${hex(a)}`; break; }
      case 0x12: desc = 'LD (DE),A'; break;
      case 0x13: desc = 'INC DE'; break;
      case 0x14: desc = 'INC D'; break;
      case 0x15: desc = 'DEC D'; break;
      case 0x16: { desc = `LD D,${hexByte(rom[pc++])}`; break; }
      case 0x17: desc = 'RLA'; break;
      case 0x18: { const d = rom[pc++]; desc = `JR ${hex(iStart + 2 + ((d < 128) ? d : d - 256))}`; refs.jumps.push(iStart + 2 + ((d < 128) ? d : d - 256)); break; }
      case 0x19: desc = 'ADD HL,DE'; break;
      case 0x1A: desc = 'LD A,(DE)'; break;
      case 0x1B: desc = 'DEC DE'; break;
      case 0x1C: desc = 'INC E'; break;
      case 0x1D: desc = 'DEC E'; break;
      case 0x1E: { desc = `LD E,${hexByte(rom[pc++])}`; break; }
      case 0x1F: desc = 'RRA'; break;
      case 0x20: { const d = rom[pc++]; desc = `JR NZ,${hex(iStart + 2 + ((d < 128) ? d : d - 256))}`; refs.jumps.push(iStart + 2 + ((d < 128) ? d : d - 256)); break; }
      case 0x21: { const a = r24(pc); pc += 3; desc = `LD HL,${hex(a)}`; break; }
      case 0x22: { const a = r24(pc); pc += 3; desc = `LD (${hex(a)}),HL`; refs.ramWrites.push(a); break; }
      case 0x23: desc = 'INC HL'; break;
      case 0x24: desc = 'INC H'; break;
      case 0x25: desc = 'DEC H'; break;
      case 0x26: { desc = `LD H,${hexByte(rom[pc++])}`; break; }
      case 0x27: desc = 'DAA'; break;
      case 0x28: { const d = rom[pc++]; desc = `JR Z,${hex(iStart + 2 + ((d < 128) ? d : d - 256))}`; refs.jumps.push(iStart + 2 + ((d < 128) ? d : d - 256)); break; }
      case 0x29: desc = 'ADD HL,HL'; break;
      case 0x2A: { const a = r24(pc); pc += 3; desc = `LD HL,(${hex(a)})`; refs.ramReads.push(a); break; }
      case 0x2B: desc = 'DEC HL'; break;
      case 0x2C: desc = 'INC L'; break;
      case 0x2D: desc = 'DEC L'; break;
      case 0x2E: { desc = `LD L,${hexByte(rom[pc++])}`; break; }
      case 0x2F: desc = 'CPL'; break;
      case 0x30: { const d = rom[pc++]; desc = `JR NC,${hex(iStart + 2 + ((d < 128) ? d : d - 256))}`; refs.jumps.push(iStart + 2 + ((d < 128) ? d : d - 256)); break; }
      case 0x31: { const a = r24(pc); pc += 3; desc = `LD SP,${hex(a)}`; break; }
      case 0x32: { const a = r24(pc); pc += 3; desc = `LD (${hex(a)}),A`; refs.ramWrites.push(a); break; }
      case 0x33: desc = 'INC SP'; break;
      case 0x34: desc = 'INC (HL)'; break;
      case 0x35: desc = 'DEC (HL)'; break;
      case 0x36: { desc = `LD (HL),${hexByte(rom[pc++])}`; break; }
      case 0x37: desc = 'SCF'; break;
      case 0x38: { const d = rom[pc++]; desc = `JR C,${hex(iStart + 2 + ((d < 128) ? d : d - 256))}`; refs.jumps.push(iStart + 2 + ((d < 128) ? d : d - 256)); break; }
      case 0x39: desc = 'ADD HL,SP'; break;
      case 0x3A: { const a = r24(pc); pc += 3; desc = `LD A,(${hex(a)})`; refs.ramReads.push(a); break; }
      case 0x3B: desc = 'DEC SP'; break;
      case 0x3C: desc = 'INC A'; break;
      case 0x3D: desc = 'DEC A'; break;
      case 0x3E: { desc = `LD A,${hexByte(rom[pc++])}`; break; }
      case 0x3F: desc = 'CCF'; break;

      case 0x40: desc = 'LD B,B'; break;
      case 0x41: desc = 'LD B,C'; break;
      case 0x42: desc = 'LD B,D'; break;
      case 0x43: desc = 'LD B,E'; break;
      case 0x44: desc = 'LD B,H'; break;
      case 0x45: desc = 'LD B,L'; break;
      case 0x46: desc = 'LD B,(HL)'; break;
      case 0x47: desc = 'LD B,A'; break;
      case 0x48: desc = 'LD C,B'; break;
      case 0x49: desc = 'LD C,C'; break;
      case 0x4A: desc = 'LD C,D'; break;
      case 0x4B: desc = 'LD C,E'; break;
      case 0x4C: desc = 'LD C,H'; break;
      case 0x4D: desc = 'LD C,L'; break;
      case 0x4E: desc = 'LD C,(HL)'; break;
      case 0x4F: desc = 'LD C,A'; break;
      case 0x50: desc = 'LD D,B'; break;
      case 0x51: desc = 'LD D,C'; break;
      case 0x52: desc = 'LD D,D'; break;
      case 0x53: desc = 'LD D,E'; break;
      case 0x54: desc = 'LD D,H'; break;
      case 0x55: desc = 'LD D,L'; break;
      case 0x56: desc = 'LD D,(HL)'; break;
      case 0x57: desc = 'LD D,A'; break;
      case 0x58: desc = 'LD E,B'; break;
      case 0x59: desc = 'LD E,C'; break;
      case 0x5A: desc = 'LD E,D'; break;
      case 0x5B: desc = 'LD E,E'; break;
      case 0x5C: desc = 'LD E,H'; break;
      case 0x5D: desc = 'LD E,L'; break;
      case 0x5E: desc = 'LD E,(HL)'; break;
      case 0x5F: desc = 'LD E,A'; break;
      case 0x60: desc = 'LD H,B'; break;
      case 0x61: desc = 'LD H,C'; break;
      case 0x62: desc = 'LD H,D'; break;
      case 0x63: desc = 'LD H,E'; break;
      case 0x64: desc = 'LD H,H'; break;
      case 0x65: desc = 'LD H,L'; break;
      case 0x66: desc = 'LD H,(HL)'; break;
      case 0x67: desc = 'LD H,A'; break;
      case 0x68: desc = 'LD L,B'; break;
      case 0x69: desc = 'LD L,C'; break;
      case 0x6A: desc = 'LD L,D'; break;
      case 0x6B: desc = 'LD L,E'; break;
      case 0x6C: desc = 'LD L,H'; break;
      case 0x6D: desc = 'LD L,L'; break;
      case 0x6E: desc = 'LD L,(HL)'; break;
      case 0x6F: desc = 'LD L,A'; break;
      case 0x70: desc = 'LD (HL),B'; break;
      case 0x71: desc = 'LD (HL),C'; break;
      case 0x72: desc = 'LD (HL),D'; break;
      case 0x73: desc = 'LD (HL),E'; break;
      case 0x74: desc = 'LD (HL),H'; break;
      case 0x75: desc = 'LD (HL),L'; break;
      case 0x76: desc = 'HALT'; break;
      case 0x77: desc = 'LD (HL),A'; break;
      case 0x78: desc = 'LD A,B'; break;
      case 0x79: desc = 'LD A,C'; break;
      case 0x7A: desc = 'LD A,D'; break;
      case 0x7B: desc = 'LD A,E'; break;
      case 0x7C: desc = 'LD A,H'; break;
      case 0x7D: desc = 'LD A,L'; break;
      case 0x7E: desc = 'LD A,(HL)'; break;
      case 0x7F: desc = 'LD A,A'; break;

      case 0x80: desc = 'ADD A,B'; break;
      case 0x81: desc = 'ADD A,C'; break;
      case 0x82: desc = 'ADD A,D'; break;
      case 0x83: desc = 'ADD A,E'; break;
      case 0x84: desc = 'ADD A,H'; break;
      case 0x85: desc = 'ADD A,L'; break;
      case 0x86: desc = 'ADD A,(HL)'; break;
      case 0x87: desc = 'ADD A,A'; break;
      case 0x88: desc = 'ADC A,B'; break;
      case 0x89: desc = 'ADC A,C'; break;
      case 0x8E: desc = 'ADC A,(HL)'; break;
      case 0x90: desc = 'SUB B'; break;
      case 0x91: desc = 'SUB C'; break;
      case 0x92: desc = 'SUB D'; break;
      case 0x93: desc = 'SUB E'; break;
      case 0x94: desc = 'SUB H'; break;
      case 0x95: desc = 'SUB L'; break;
      case 0x96: desc = 'SUB (HL)'; break;
      case 0x97: desc = 'SUB A'; break;
      case 0x98: desc = 'SBC A,B'; break;
      case 0x9C: desc = 'SBC A,H'; break;
      case 0x9F: desc = 'SBC A,A'; break;
      case 0xA0: desc = 'AND B'; break;
      case 0xA1: desc = 'AND C'; break;
      case 0xA6: desc = 'AND (HL)'; break;
      case 0xA7: desc = 'AND A'; break;
      case 0xA8: desc = 'XOR B'; break;
      case 0xAE: desc = 'XOR (HL)'; break;
      case 0xAF: desc = 'XOR A'; break;
      case 0xB0: desc = 'OR B'; break;
      case 0xB1: desc = 'OR C'; break;
      case 0xB2: desc = 'OR D'; break;
      case 0xB3: desc = 'OR E'; break;
      case 0xB4: desc = 'OR H'; break;
      case 0xB5: desc = 'OR L'; break;
      case 0xB6: desc = 'OR (HL)'; break;
      case 0xB7: desc = 'OR A'; break;
      case 0xB8: desc = 'CP B'; break;
      case 0xB9: desc = 'CP C'; break;
      case 0xBA: desc = 'CP D'; break;
      case 0xBB: desc = 'CP E'; break;
      case 0xBC: desc = 'CP H'; break;
      case 0xBD: desc = 'CP L'; break;
      case 0xBE: desc = 'CP (HL)'; break;
      case 0xBF: desc = 'CP A'; break;

      case 0xC0: desc = 'RET NZ'; break;
      case 0xC1: desc = 'POP BC'; break;
      case 0xC2: { const a = r24(pc); pc += 3; desc = `JP NZ,${hex(a)}`; refs.jumps.push(a); break; }
      case 0xC3: { const a = r24(pc); pc += 3; desc = `JP ${hex(a)}`; refs.jumps.push(a); break; }
      case 0xC4: { const a = r24(pc); pc += 3; desc = `CALL NZ,${hex(a)}`; refs.calls.push(a); break; }
      case 0xC5: desc = 'PUSH BC'; break;
      case 0xC6: { desc = `ADD A,${hexByte(rom[pc++])}`; break; }
      case 0xC7: desc = 'RST 00h'; break;
      case 0xC8: desc = 'RET Z'; break;
      case 0xC9: desc = 'RET'; break;
      case 0xCA: { const a = r24(pc); pc += 3; desc = `JP Z,${hex(a)}`; refs.jumps.push(a); break; }
      case 0xCC: { const a = r24(pc); pc += 3; desc = `CALL Z,${hex(a)}`; refs.calls.push(a); break; }
      case 0xCD: { const a = r24(pc); pc += 3; desc = `CALL ${hex(a)}`; refs.calls.push(a); break; }
      case 0xCE: { desc = `ADC A,${hexByte(rom[pc++])}`; break; }
      case 0xCF: desc = 'RST 08h'; break;
      case 0xD0: desc = 'RET NC'; break;
      case 0xD1: desc = 'POP DE'; break;
      case 0xD2: { const a = r24(pc); pc += 3; desc = `JP NC,${hex(a)}`; refs.jumps.push(a); break; }
      case 0xD3: { const p = rom[pc++]; desc = `OUT (${hexByte(p)}),A`; refs.ports.push({ dir: 'out', port: p }); break; }
      case 0xD4: { const a = r24(pc); pc += 3; desc = `CALL NC,${hex(a)}`; refs.calls.push(a); break; }
      case 0xD5: desc = 'PUSH DE'; break;
      case 0xD6: { desc = `SUB ${hexByte(rom[pc++])}`; break; }
      case 0xD7: desc = 'RST 10h'; break;
      case 0xD8: desc = 'RET C'; break;
      case 0xD9: desc = 'EXX'; break;
      case 0xDA: { const a = r24(pc); pc += 3; desc = `JP C,${hex(a)}`; refs.jumps.push(a); break; }
      case 0xDB: { const p = rom[pc++]; desc = `IN A,(${hexByte(p)})`; refs.ports.push({ dir: 'in', port: p }); break; }
      case 0xDC: { const a = r24(pc); pc += 3; desc = `CALL C,${hex(a)}`; refs.calls.push(a); break; }
      case 0xDE: { desc = `SBC A,${hexByte(rom[pc++])}`; break; }
      case 0xDF: desc = 'RST 18h'; break;
      case 0xE0: desc = 'RET PO'; break;
      case 0xE1: desc = 'POP HL'; break;
      case 0xE2: { const a = r24(pc); pc += 3; desc = `JP PO,${hex(a)}`; refs.jumps.push(a); break; }
      case 0xE3: desc = 'EX (SP),HL'; break;
      case 0xE4: { const a = r24(pc); pc += 3; desc = `CALL PO,${hex(a)}`; refs.calls.push(a); break; }
      case 0xE5: desc = 'PUSH HL'; break;
      case 0xE6: { desc = `AND ${hexByte(rom[pc++])}`; break; }
      case 0xE7: desc = 'RST 20h'; break;
      case 0xE8: desc = 'RET PE'; break;
      case 0xE9: desc = 'JP (HL)'; break;
      case 0xEA: { const a = r24(pc); pc += 3; desc = `JP PE,${hex(a)}`; refs.jumps.push(a); break; }
      case 0xEB: desc = 'EX DE,HL'; break;
      case 0xEC: { const a = r24(pc); pc += 3; desc = `CALL PE,${hex(a)}`; refs.calls.push(a); break; }
      case 0xEE: { desc = `XOR ${hexByte(rom[pc++])}`; break; }
      case 0xEF: desc = 'RST 28h'; break;
      case 0xF0: desc = 'RET P'; break;
      case 0xF1: desc = 'POP AF'; break;
      case 0xF2: { const a = r24(pc); pc += 3; desc = `JP P,${hex(a)}`; refs.jumps.push(a); break; }
      case 0xF3: desc = 'DI'; break;
      case 0xF4: { const a = r24(pc); pc += 3; desc = `CALL P,${hex(a)}`; refs.calls.push(a); break; }
      case 0xF5: desc = 'PUSH AF'; break;
      case 0xF6: { desc = `OR ${hexByte(rom[pc++])}`; break; }
      case 0xF7: desc = 'RST 30h'; break;
      case 0xF8: desc = 'RET M'; break;
      case 0xF9: desc = 'LD SP,HL'; break;
      case 0xFA: { const a = r24(pc); pc += 3; desc = `JP M,${hex(a)}`; refs.jumps.push(a); break; }
      case 0xFB: desc = 'EI'; break;
      case 0xFC: { const a = r24(pc); pc += 3; desc = `CALL M,${hex(a)}`; refs.calls.push(a); break; }
      case 0xFE: { const v = rom[pc++]; desc = `CP ${hexByte(v)}`; refs.compares.push(v); break; }
      case 0xFF: desc = 'RST 38h'; break;

      default:
        desc = hexByte(op);
        break;
    }

    const raw = rawBytes(iStart, pc - iStart);
    result.push({ addr: iStart, raw, desc, refs, len: pc - iStart });
  }
  return result;
}

function printDisasm(label, instrs) {
  console.log(`\n-- ${label} --`);
  for (const i of instrs) {
    console.log(`  ${hex(i.addr)}: ${i.raw.padEnd(24)} ${i.desc}`);
  }
}

// Collect all refs from an instruction list
function collectRefs(instrs) {
  const calls = [];
  const jumps = [];
  const ramReads = [];
  const ramWrites = [];
  const ports = [];
  const compares = [];
  for (const i of instrs) {
    calls.push(...i.refs.calls);
    jumps.push(...i.refs.jumps);
    ramReads.push(...i.refs.ramReads);
    ramWrites.push(...i.refs.ramWrites);
    ports.push(...i.refs.ports);
    compares.push(...i.refs.compares);
  }
  return { calls, jumps, ramReads, ramWrites, ports, compares };
}

// ──────────────────────────────────────────────
// ROM caller search
// ──────────────────────────────────────────────

function findCallers(targetAddr, searchStart = 0, searchEnd = 0x400000) {
  const lo = targetAddr & 0xFF;
  const mid = (targetAddr >> 8) & 0xFF;
  const hi = (targetAddr >> 16) & 0xFF;
  const results = [];

  for (let i = searchStart; i < searchEnd - 3; i++) {
    const op = rom[i];
    // CALL nn (CD) or JP nn (C3)
    if ((op === 0xCD || op === 0xC3) && rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      results.push({ addr: i, type: op === 0xCD ? 'CALL' : 'JP', target: targetAddr });
    }
    // Conditional CALL: C4, CC, D4, DC, E4, EC, F4, FC
    if ((op === 0xC4 || op === 0xCC || op === 0xD4 || op === 0xDC ||
         op === 0xE4 || op === 0xEC || op === 0xF4 || op === 0xFC) &&
        rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      results.push({ addr: i, type: `COND ${hexByte(op)}`, target: targetAddr });
    }
    // Conditional JP: C2, CA, D2, DA, E2, EA, F2, FA
    if ((op === 0xC2 || op === 0xCA || op === 0xD2 || op === 0xDA ||
         op === 0xE2 || op === 0xEA || op === 0xF2 || op === 0xFA) &&
        rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      results.push({ addr: i, type: `COND JP ${hexByte(op)}`, target: targetAddr });
    }
  }
  return results;
}

// ──────────────────────────────────────────────
// Main analysis
// ──────────────────────────────────────────────

const workers = [
  { name: 'Worker A (USB receive A)', handler: 0, start: 0x013250, end: 0x013377 },
  { name: 'Worker B (USB receive B)', handler: 1, start: 0x013377, end: 0x0135CF },
  { name: 'Extended Link Worker',     handler: 4, start: 0x0135CF, end: 0x0136BF },
];

const report = [];
function log(s) { console.log(s); report.push(s); }

log('='.repeat(70));
log('Phase 411: USB/Link Receive Workers Deep Decode');
log('='.repeat(70));
log('');
log('Workers from dispatch table at 0x0120AA (session 409):');
log('  Handler 0: 0x013250 -- USB receive worker A');
log('  Handler 1: 0x013377 -- USB receive worker B');
log('  Handler 4: 0x0135CF -- Extended link worker');
log(`  Key RAM: D1776D=link buf ptr, D17795=protocol state, D1778F=recv size`);
log('');

const allSubcalls = new Set();

for (const w of workers) {
  log('');
  log('='.repeat(70));
  log(`[${w.name}] ${hex(w.start)}-${hex(w.end - 1)} (${w.end - w.start} bytes, handler ${w.handler})`);
  log('='.repeat(70));

  // Disassemble full range
  const instrs = disasmRange(w.start, w.end);
  log(`\nDisassembly (${instrs.length} instructions):`);
  for (const i of instrs) {
    log(`  ${hex(i.addr)}: ${i.raw.padEnd(24)} ${i.desc}`);
  }

  // Collect refs
  const refs = collectRefs(instrs);

  log(`\n  CALL targets: ${[...new Set(refs.calls)].map(hex).join(', ') || 'none'}`);
  log(`  JP targets:   ${[...new Set(refs.jumps)].map(hex).join(', ') || 'none'}`);
  log(`  RAM reads:    ${[...new Set(refs.ramReads)].map(hex).join(', ') || 'none'}`);
  log(`  RAM writes:   ${[...new Set(refs.ramWrites)].map(hex).join(', ') || 'none'}`);
  log(`  I/O ports:    ${refs.ports.map(p => `${p.dir.toUpperCase()} port ${hexByte(p.port)}`).join(', ') || 'none'}`);
  log(`  CP constants: ${[...new Set(refs.compares)].map(v => hexByte(v)).join(', ') || 'none'}`);

  for (const c of refs.calls) allSubcalls.add(c);
}

// ──────────────────────────────────────────────
// Extended link worker: signature analysis
// ──────────────────────────────────────────────

log('');
log('='.repeat(70));
log('[Extended Link Worker Signature Analysis]');
log('='.repeat(70));
log('');
log('Looking for 16-bit signature constants: 0xCCCC, 0xCCCD, 0x0CCC, 0x0CCD');

// Search the extended worker range for the signature bytes
const extStart = 0x0135CF;
const extEnd = 0x0136BF;
for (let i = extStart; i < extEnd - 1; i++) {
  const w16 = rom[i] | (rom[i + 1] << 8);
  if (w16 === 0xCCCC || w16 === 0xCCCD || w16 === 0x0CCC || w16 === 0x0CCD) {
    log(`  Found ${hex(w16, 4)} at ROM offset ${hex(i)} (bytes: ${hexByte(rom[i])} ${hexByte(rom[i + 1])})`);
  }
}

// Also look for LD HL,0xCCCC etc patterns (21 CC CC 00) in a wider range
log('');
log('Searching for LD reg,signature patterns in 0x013500-0x0136C0:');
for (let i = 0x013500; i < 0x0136C0; i++) {
  const op = rom[i];
  if (op === 0x21 || op === 0x11 || op === 0x01) { // LD HL/DE/BC,nn
    const val = r24(i + 1);
    const low16 = val & 0xFFFF;
    if (low16 === 0xCCCC || low16 === 0xCCCD || low16 === 0x0CCC || low16 === 0x0CCD) {
      const regName = op === 0x21 ? 'HL' : op === 0x11 ? 'DE' : 'BC';
      log(`  ${hex(i)}: LD ${regName},${hex(val)} -- signature ${hex(low16, 4)}`);
    }
  }
  // Also check FE (CP n) for single-byte 0xCC/0xCD
  if (op === 0xFE) {
    const v = rom[i + 1];
    if (v === 0xCC || v === 0xCD || v === 0x0C) {
      log(`  ${hex(i)}: CP ${hexByte(v)} -- possible signature byte`);
    }
  }
}

// ──────────────────────────────────────────────
// Branch structure of extended link worker
// ──────────────────────────────────────────────

log('');
log('Branch structure (conditional jumps in extended worker):');
const extInstrs = disasmRange(extStart, extEnd);
for (const i of extInstrs) {
  if (i.refs.jumps.length > 0 || i.desc.includes('RET')) {
    log(`  ${hex(i.addr)}: ${i.raw.padEnd(24)} ${i.desc}`);
  }
}

// ──────────────────────────────────────────────
// Caller search for all 3 workers
// ──────────────────────────────────────────────

log('');
log('='.repeat(70));
log('[Caller Search]');
log('='.repeat(70));

const targets = [0x013250, 0x013377, 0x0135CF];
for (const t of targets) {
  log(`\nCallers of ${hex(t)}:`);
  const callers = findCallers(t);
  if (callers.length === 0) {
    log('  (none found in ROM -- called only from dispatch table)');
  } else {
    for (const c of callers) {
      log(`  ${hex(c.addr)}: ${c.type} ${hex(c.target)} [raw: ${rawBytes(c.addr, 4)}]`);
    }
  }
}

// ──────────────────────────────────────────────
// Subcall deep-dives (first 30 instructions of each unique CALL target)
// ──────────────────────────────────────────────

log('');
log('='.repeat(70));
log('[Subcall Deep Dives]');
log('='.repeat(70));

// Exclude targets that are within the workers themselves
const externalCalls = [...allSubcalls].filter(a => a < 0x013250 || a >= 0x0136BF).sort((a, b) => a - b);
log(`\nExternal CALL targets: ${externalCalls.map(hex).join(', ')}`);

for (const target of externalCalls) {
  log(`\n-- Subroutine ${hex(target)} --`);
  // Disassemble up to 30 instructions or RET
  const instrs = [];
  let pc = target;
  for (let n = 0; n < 30; n++) {
    const chunk = disasmRange(pc, pc + 10);
    if (chunk.length === 0) break;
    const instr = chunk[0];
    instrs.push(instr);
    pc = instr.addr + instr.len;
    if (instr.desc === 'RET' || instr.desc.startsWith('JP 0x') || instr.desc === 'JP (HL)') break;
  }
  for (const i of instrs) {
    log(`  ${hex(i.addr)}: ${i.raw.padEnd(24)} ${i.desc}`);
  }
  const refs = collectRefs(instrs);
  if (refs.calls.length) log(`  Calls: ${refs.calls.map(hex).join(', ')}`);
  if (refs.ramReads.length) log(`  RAM reads: ${[...new Set(refs.ramReads)].map(hex).join(', ')}`);
  if (refs.ramWrites.length) log(`  RAM writes: ${[...new Set(refs.ramWrites)].map(hex).join(', ')}`);
  if (refs.ports.length) log(`  Ports: ${refs.ports.map(p => `${p.dir} ${hexByte(p.port)}`).join(', ')}`);
}

// ──────────────────────────────────────────────
// Summary
// ──────────────────────────────────────────────

log('');
log('='.repeat(70));
log('[Summary]');
log('='.repeat(70));
log('');

// Collect all unique RAM addresses
const allRamR = new Set();
const allRamW = new Set();
for (const w of workers) {
  const instrs = disasmRange(w.start, w.end);
  const refs = collectRefs(instrs);
  for (const r of refs.ramReads) allRamR.add(r);
  for (const w2 of refs.ramWrites) allRamW.add(w2);
}

log('All RAM addresses read:');
for (const r of [...allRamR].sort((a, b) => a - b)) {
  log(`  ${hex(r)}`);
}
log('');
log('All RAM addresses written:');
for (const w2 of [...allRamW].sort((a, b) => a - b)) {
  log(`  ${hex(w2)}`);
}
log('');
log('All external CALL targets:');
for (const c of externalCalls) {
  log(`  ${hex(c)}`);
}

// Write report
const reportPath = 'TI-84_Plus_CE/phase411-usb-workers-report.md';
const md = [
  '# Phase 411: USB/Link Receive Workers Report',
  '',
  '## Overview',
  '',
  'Deep decode of 3 USB/Link receive workers from the notification dispatch table at 0x0120AA.',
  '',
  '| Worker | Handler | Address Range | Size |',
  '|--------|---------|---------------|------|',
  '| USB Receive A | 0 | 0x013250-0x013376 | 294 bytes |',
  '| USB Receive B | 1 | 0x013377-0x0135CE | 599 bytes |',
  '| Extended Link | 4 | 0x0135CF-0x0136BE | 239 bytes |',
  '',
  '## Probe Output',
  '',
  '```',
  ...report,
  '```',
  '',
  '## Key Findings',
  '',
  '(Filled by probe output analysis)',
  '',
  `Generated: ${new Date().toISOString()}`,
];

fs.writeFileSync(reportPath, md.join('\n'));
log('');
log(`Report written to ${reportPath}`);
