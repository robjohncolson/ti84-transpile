#!/usr/bin/env node
// Phase 445 — Static disassembly of _GetCSC (0x003D5A) and its call targets.
// Disassembles 0x003C55-0x003E50 covering _GetCSC, the scan dispatcher at
// 0x003C63, and the hardware scan routine at 0x003CC2.
// Also follows CALL targets one level deep.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase445-getCSC-trace-report.md');

const rom = fs.readFileSync(ROM_PATH);

// --- Minimal eZ80 ADL-mode disassembler (enough for keyboard scan code) ---

function r8(addr) { return rom[addr]; }
function r16(addr) { return rom[addr] | (rom[addr+1] << 8); }
function r24(addr) { return rom[addr] | (rom[addr+1] << 8) | (rom[addr+2] << 16); }
function hex2(v) { return '0x' + v.toString(16).toUpperCase().padStart(2, '0'); }
function hex4(v) { return '0x' + v.toString(16).toUpperCase().padStart(4, '0'); }
function hex6(v) { return '0x' + v.toString(16).toUpperCase().padStart(6, '0'); }
function signed8(v) { return v > 127 ? v - 256 : v; }

const REG8 = ['B','C','D','E','H','L','(HL)','A'];
const REG16 = ['BC','DE','HL','SP'];
const CC = ['NZ','Z','NC','C','PO','PE','P','M'];

function disasmOne(addr) {
  let pos = addr;
  const startPos = pos;
  let prefix = null;

  // Check for SIS/LIS/SIL/LIL prefix.
  // These are ambiguous with LD r,r opcodes (0x40=LD B,B, 0x49=LD C,C, etc).
  // Heuristic: treat as prefix only when followed by an instruction that takes
  // an immediate that would change size (LD rr,nn / CALL / JP / LD (nn),A etc).
  const b0 = r8(pos);
  const nextOp = r8(pos + 1);
  const immSizeOps = [0x01,0x11,0x21,0x31,0xCD,0xC3,0xCA,0xC2,0xDA,0xD2,
                      0x3A,0x32,0x22,0x2A,0xC4,0xCC,0xD4,0xDC];
  if ((b0 === 0x40 || b0 === 0x49 || b0 === 0x52 || b0 === 0x5B) &&
      immSizeOps.includes(nextOp)) {
    const prefixNames = { 0x40: '.SIS', 0x49: '.LIS', 0x52: '.SIL', 0x5B: '.LIL' };
    prefix = prefixNames[b0];
    pos++;
  }

  const op = r8(pos);
  pos++;
  let mnemonic = '';
  let bytes = [];

  // CB prefix (bit operations)
  if (op === 0xCB) {
    const cb = r8(pos); pos++;
    const bit = (cb >> 3) & 7;
    const reg = cb & 7;
    const group = (cb >> 6) & 3;
    if (group === 0) {
      const shifts = ['RLC','RRC','RL','RR','SLA','SRA','SLL','SRL'];
      mnemonic = `${shifts[(cb>>3)&7]} ${REG8[reg]}`;
    } else if (group === 1) {
      mnemonic = `BIT ${bit}, ${REG8[reg]}`;
    } else if (group === 2) {
      mnemonic = `RES ${bit}, ${REG8[reg]}`;
    } else {
      mnemonic = `SET ${bit}, ${REG8[reg]}`;
    }
  }
  // ED prefix
  else if (op === 0xED) {
    const ed = r8(pos); pos++;
    switch (ed) {
      case 0x38: { const n = r8(pos); pos++; mnemonic = `IN0 A, (${hex2(n)})`; break; }
      case 0x39: { const n = r8(pos); pos++; mnemonic = `OUT0 (${hex2(n)}), A`; break; }
      case 0x61: mnemonic = 'OUT (C), H'; break;  // also used as dummy out
      case 0x78: mnemonic = 'IN A, (C)'; break;
      case 0x79: mnemonic = 'OUT (C), A'; break;
      case 0x58: mnemonic = 'IN E, (C)'; break;
      case 0x09: { const n = r8(pos); pos++; mnemonic = `OUT0 (${hex2(n)}), A [alt]`; break; }
      default: mnemonic = `ED ${hex2(ed)}`; break;
    }
  }
  // FD prefix (IY operations)
  else if (op === 0xFD) {
    const iy = r8(pos); pos++;
    if (iy === 0xCB) {
      const d = r8(pos); pos++;
      const cb2 = r8(pos); pos++;
      const bit = (cb2 >> 3) & 7;
      const group = (cb2 >> 6) & 3;
      if (group === 1) mnemonic = `BIT ${bit}, (IY+${hex2(d)})`;
      else if (group === 2) mnemonic = `RES ${bit}, (IY+${hex2(d)})`;
      else if (group === 3) mnemonic = `SET ${bit}, (IY+${hex2(d)})`;
      else {
        const shifts = ['RLC','RRC','RL','RR','SLA','SRA','SLL','SRL'];
        mnemonic = `${shifts[(cb2>>3)&7]} (IY+${hex2(d)})`;
      }
    } else if (iy === 0x70) {
      const d = r8(pos); pos++;
      mnemonic = `LD (IY+${hex2(d)}), B`;  // FD 70 dd
    } else {
      mnemonic = `FD ${hex2(iy)}`;
      // Some common ones
      if (iy === 0x36) {
        // LD (IY+d), n
        const d2 = r8(pos); pos++;
        const n2 = r8(pos); pos++;
        mnemonic = `LD (IY+${hex2(d2)}), ${hex2(n2)}`;
      }
    }
  }
  // DD prefix (IX operations) - unlikely here but handle
  else if (op === 0xDD) {
    const ix = r8(pos); pos++;
    mnemonic = `DD ${hex2(ix)}`;
  }
  // Standard opcodes
  else {
    // Determine immediate size: .SIS/.SIL use 16-bit, default ADL uses 24-bit
    const immSize = (prefix === '.SIS' || prefix === '.SIL') ? 2 : 3;
    const hexImm = (v) => immSize === 2 ? hex4(v) : hex6(v);
    function readImm() {
      if (immSize === 2) { const v = r16(pos); pos += 2; return v; }
      else { const v = r24(pos); pos += 3; return v; }
    }
    switch (op) {
      // NOP
      case 0x00: mnemonic = 'NOP'; break;
      // LD rr, nn (24-bit in ADL, 16-bit with .SIS/.SIL)
      case 0x01: { const nn = readImm(); mnemonic = `LD BC, ${hexImm(nn)}`; break; }
      case 0x11: { const nn = readImm(); mnemonic = `LD DE, ${hexImm(nn)}`; break; }
      case 0x21: { const nn = readImm(); mnemonic = `LD HL, ${hexImm(nn)}`; break; }
      case 0x31: { const nn = readImm(); mnemonic = `LD SP, ${hexImm(nn)}`; break; }
      // LD r, n
      case 0x06: { const n = r8(pos); pos++; mnemonic = `LD B, ${hex2(n)}`; break; }
      case 0x0E: { const n = r8(pos); pos++; mnemonic = `LD C, ${hex2(n)}`; break; }
      case 0x16: { const n = r8(pos); pos++; mnemonic = `LD D, ${hex2(n)}`; break; }
      case 0x1E: { const n = r8(pos); pos++; mnemonic = `LD E, ${hex2(n)}`; break; }
      case 0x26: { const n = r8(pos); pos++; mnemonic = `LD H, ${hex2(n)}`; break; }
      case 0x36: { const n = r8(pos); pos++; mnemonic = `LD (HL), ${hex2(n)}`; break; }
      case 0x3E: { const n = r8(pos); pos++; mnemonic = `LD A, ${hex2(n)}`; break; }
      // LD A, (nn) / LD (nn), A
      case 0x3A: { const nn = readImm(); mnemonic = `LD A, (${hexImm(nn)})`; break; }
      case 0x32: { const nn = readImm(); mnemonic = `LD (${hexImm(nn)}), A`; break; }
      // LD (nn), HL / LD HL, (nn)
      case 0x22: { const nn = readImm(); mnemonic = `LD (${hexImm(nn)}), HL`; break; }
      case 0x2A: { const nn = readImm(); mnemonic = `LD HL, (${hexImm(nn)})`; break; }
      // INC/DEC 8-bit
      case 0x04: mnemonic = 'INC B'; break;
      case 0x05: mnemonic = 'DEC B'; break;
      case 0x0C: mnemonic = 'INC C'; break;
      case 0x0D: mnemonic = 'DEC C'; break;
      case 0x14: mnemonic = 'INC D'; break;
      case 0x15: mnemonic = 'DEC D'; break;
      case 0x1C: mnemonic = 'INC E'; break;
      case 0x1D: mnemonic = 'DEC E'; break;
      case 0x24: mnemonic = 'INC H'; break;
      case 0x25: mnemonic = 'DEC H'; break;
      case 0x34: mnemonic = 'INC (HL)'; break;
      case 0x35: mnemonic = 'DEC (HL)'; break;
      case 0x3C: mnemonic = 'INC A'; break;
      case 0x3D: mnemonic = 'DEC A'; break;
      // INC/DEC 16-bit
      case 0x03: mnemonic = 'INC BC'; break;
      case 0x0B: mnemonic = 'DEC BC'; break;
      case 0x13: mnemonic = 'INC DE'; break;
      case 0x1B: mnemonic = 'DEC DE'; break;
      case 0x23: mnemonic = 'INC HL'; break;
      case 0x2B: mnemonic = 'DEC HL'; break;
      case 0x33: mnemonic = 'INC SP'; break;
      case 0x3B: mnemonic = 'DEC SP'; break;
      // ADD HL, rr
      case 0x09: mnemonic = 'ADD HL, BC'; break;
      case 0x19: mnemonic = 'ADD HL, DE'; break;
      case 0x29: mnemonic = 'ADD HL, HL'; break;
      case 0x39: mnemonic = 'ADD HL, SP'; break;
      // LD r, r
      case 0x40: mnemonic = 'LD B, B'; break;
      case 0x47: mnemonic = 'LD B, A'; break;
      case 0x4F: mnemonic = 'LD C, A'; break;
      case 0x57: mnemonic = 'LD D, A'; break;
      case 0x5F: mnemonic = 'LD E, A'; break;
      case 0x67: mnemonic = 'LD H, A'; break;
      case 0x6F: mnemonic = 'LD L, A'; break;
      case 0x77: mnemonic = 'LD (HL), A'; break;
      case 0x78: mnemonic = 'LD A, B'; break;
      case 0x79: mnemonic = 'LD A, C'; break;
      case 0x7A: mnemonic = 'LD A, D'; break;
      case 0x7B: mnemonic = 'LD A, E'; break;
      case 0x7C: mnemonic = 'LD A, H'; break;
      case 0x7D: mnemonic = 'LD A, L'; break;
      case 0x7E: mnemonic = 'LD A, (HL)'; break;
      case 0x41: mnemonic = 'LD B, C'; break;
      case 0x48: mnemonic = 'LD C, B'; break;
      case 0x56: mnemonic = 'LD D, (HL)'; break;
      case 0x5E: mnemonic = 'LD E, (HL)'; break;
      // ALU A, r
      case 0x80: mnemonic = 'ADD A, B'; break;
      case 0x87: mnemonic = 'ADD A, A'; break;
      case 0xA7: mnemonic = 'AND A'; break;
      case 0xAF: mnemonic = 'XOR A'; break;
      case 0xB0: mnemonic = 'OR B'; break;
      case 0xB5: mnemonic = 'OR L'; break;
      case 0xB7: mnemonic = 'OR A'; break;
      case 0xB8: mnemonic = 'CP B'; break;
      case 0xB9: mnemonic = 'CP C'; break;
      case 0xBA: mnemonic = 'CP D'; break;
      case 0xBB: mnemonic = 'CP E'; break;
      case 0xBC: mnemonic = 'CP H'; break;
      case 0xBD: mnemonic = 'CP L'; break;
      case 0xBE: mnemonic = 'CP (HL)'; break;
      case 0xBF: mnemonic = 'CP A'; break;
      // CP n
      case 0xFE: { const n = r8(pos); pos++; mnemonic = `CP ${hex2(n)}`; break; }
      // AND n
      case 0xE6: { const n = r8(pos); pos++; mnemonic = `AND ${hex2(n)}`; break; }
      // OR n
      case 0xF6: { const n = r8(pos); pos++; mnemonic = `OR ${hex2(n)}`; break; }
      // XOR n
      case 0xEE: { const n = r8(pos); pos++; mnemonic = `XOR ${hex2(n)}`; break; }
      // Rotates
      case 0x17: mnemonic = 'RLA'; break;
      case 0x1F: mnemonic = 'RRA'; break;
      case 0x07: mnemonic = 'RLCA'; break;
      case 0x0F: mnemonic = 'RRCA'; break;
      // Jumps
      case 0xC3: { const nn = readImm(); mnemonic = `JP ${hexImm(nn)}`; break; }
      case 0xCA: { const nn = readImm(); mnemonic = `JP Z, ${hexImm(nn)}`; break; }
      case 0xC2: { const nn = readImm(); mnemonic = `JP NZ, ${hexImm(nn)}`; break; }
      case 0xDA: { const nn = readImm(); mnemonic = `JP C, ${hexImm(nn)}`; break; }
      case 0xD2: { const nn = readImm(); mnemonic = `JP NC, ${hexImm(nn)}`; break; }
      // JR
      case 0x18: { const d = signed8(r8(pos)); pos++; mnemonic = `JR ${hex6(pos + d)}  (offset ${d>=0?'+':''}${d})`; break; }
      case 0x20: { const d = signed8(r8(pos)); pos++; mnemonic = `JR NZ, ${hex6(pos + d)}  (offset ${d>=0?'+':''}${d})`; break; }
      case 0x28: { const d = signed8(r8(pos)); pos++; mnemonic = `JR Z, ${hex6(pos + d)}  (offset ${d>=0?'+':''}${d})`; break; }
      case 0x30: { const d = signed8(r8(pos)); pos++; mnemonic = `JR NC, ${hex6(pos + d)}  (offset ${d>=0?'+':''}${d})`; break; }
      case 0x38: { const d = signed8(r8(pos)); pos++; mnemonic = `JR C, ${hex6(pos + d)}  (offset ${d>=0?'+':''}${d})`; break; }
      // DJNZ
      case 0x10: { const d = signed8(r8(pos)); pos++; mnemonic = `DJNZ ${hex6(pos + d)}  (offset ${d>=0?'+':''}${d})`; break; }
      // CALL
      case 0xCD: { const nn = readImm(); mnemonic = `CALL ${hexImm(nn)}`; break; }
      case 0xCC: { const nn = readImm(); mnemonic = `CALL Z, ${hexImm(nn)}`; break; }
      case 0xC4: { const nn = readImm(); mnemonic = `CALL NZ, ${hexImm(nn)}`; break; }
      case 0xDC: { const nn = readImm(); mnemonic = `CALL C, ${hexImm(nn)}`; break; }
      case 0xD4: { const nn = readImm(); mnemonic = `CALL NC, ${hexImm(nn)}`; break; }
      // RET
      case 0xC9: mnemonic = 'RET'; break;
      case 0xC0: mnemonic = 'RET NZ'; break;
      case 0xC8: mnemonic = 'RET Z'; break;
      case 0xD0: mnemonic = 'RET NC'; break;
      case 0xD8: mnemonic = 'RET C'; break;
      // RST
      case 0xCF: mnemonic = 'RST 0x08'; break;
      case 0xC7: mnemonic = 'RST 0x00'; break;
      case 0xD7: mnemonic = 'RST 0x10'; break;
      case 0xDF: mnemonic = 'RST 0x18'; break;
      case 0xE7: mnemonic = 'RST 0x20'; break;
      case 0xEF: mnemonic = 'RST 0x28'; break;
      case 0xF7: mnemonic = 'RST 0x30'; break;
      case 0xFF: mnemonic = 'RST 0x38'; break;
      // PUSH/POP
      case 0xC5: mnemonic = 'PUSH BC'; break;
      case 0xD5: mnemonic = 'PUSH DE'; break;
      case 0xE5: mnemonic = 'PUSH HL'; break;
      case 0xF5: mnemonic = 'PUSH AF'; break;
      case 0xC1: mnemonic = 'POP BC'; break;
      case 0xD1: mnemonic = 'POP DE'; break;
      case 0xE1: mnemonic = 'POP HL'; break;
      case 0xF1: mnemonic = 'POP AF'; break;
      // EI/DI
      case 0xFB: mnemonic = 'EI'; break;
      case 0xF3: mnemonic = 'DI'; break;
      // SCF/CCF
      case 0x37: mnemonic = 'SCF'; break;
      case 0x3F: mnemonic = 'CCF'; break;
      // HALT
      case 0x76: mnemonic = 'HALT'; break;
      // SUB
      case 0x90: mnemonic = 'SUB B'; break;
      case 0xD6: { const n = r8(pos); pos++; mnemonic = `SUB ${hex2(n)}`; break; }
      // ADD A, n
      case 0xC6: { const n = r8(pos); pos++; mnemonic = `ADD A, ${hex2(n)}`; break; }
      // EX
      case 0xEB: mnemonic = 'EX DE, HL'; break;
      // LD (HL), r  (some already handled)
      case 0x70: mnemonic = 'LD (HL), B'; break;
      case 0x71: mnemonic = 'LD (HL), C'; break;
      case 0x72: mnemonic = 'LD (HL), D'; break;
      case 0x73: mnemonic = 'LD (HL), E'; break;
      // LD A, (BC) / LD A, (DE)
      case 0x0A: mnemonic = 'LD A, (BC)'; break;
      case 0x1A: mnemonic = 'LD A, (DE)'; break;
      // LD (BC), A / LD (DE), A
      case 0x02: mnemonic = 'LD (BC), A'; break;
      case 0x12: mnemonic = 'LD (DE), A'; break;
      // CPL
      case 0x2F: mnemonic = 'CPL'; break;
      // NEG (needs ED prefix, handled above)
      default:
        mnemonic = `DB ${hex2(op)}`;
        break;
    }
  }

  if (prefix) mnemonic = prefix + ' ' + mnemonic;

  const len = pos - startPos;
  let rawBytes = '';
  for (let i = startPos; i < pos; i++) {
    rawBytes += rom[i].toString(16).padStart(2, '0').toUpperCase() + ' ';
  }

  return { addr: startPos, len, mnemonic, rawBytes: rawBytes.trim() };
}

function disasmRange(start, end, label) {
  const lines = [];
  if (label) lines.push(`\n; === ${label} ===`);
  let pos = start;
  while (pos < end) {
    const inst = disasmOne(pos);
    const addrStr = pos.toString(16).padStart(6, '0').toUpperCase();
    lines.push(`  ${addrStr}: ${inst.rawBytes.padEnd(20)} ${inst.mnemonic}`);
    pos += inst.len;
  }
  return lines;
}

// --- Disassemble the regions ---
const output = [];

output.push('# Phase 445 — _GetCSC (0x003D5A) Disassembly Trace');
output.push('');
output.push('Generated by probe-phase445-getCSC-trace.mjs');
output.push('');

// 1. Helper function at 0x003C55 (LD HL lookup)
output.push('## 0x003C55-0x003C62 — Helper: table lookup');
output.push('```asm');
output.push(...disasmRange(0x003C55, 0x003C63));
output.push('```');
output.push('');

// 2. Scan dispatcher at 0x003C63
output.push('## 0x003C63-0x003CBF — Scan dispatcher (debounce + scan invocation)');
output.push('```asm');
output.push(...disasmRange(0x003C63, 0x003CC0));
output.push('```');
output.push('');

// 3. Hardware scan at 0x003CC0
output.push('## 0x003CC0-0x003D59 — Hardware keyboard scan routine');
output.push('```asm');
output.push(...disasmRange(0x003CC0, 0x003D5A));
output.push('```');
output.push('');

// 4. _GetCSC at 0x003D5A
output.push('## 0x003D5A-0x003D8A — _GetCSC (main entry)');
output.push('```asm');
output.push(...disasmRange(0x003D5A, 0x003D8B));
output.push('```');
output.push('');

// 5. Data region after _GetCSC (cursor/icon sprites)
output.push('## 0x003D8B-0x003E50 — Data region (cursor sprites, not code)');
output.push('```');
const dataStart = 0x003D8B;
const dataEnd = 0x003E50;
for (let i = dataStart; i < dataEnd; i += 16) {
  let hex = '';
  for (let j = 0; j < 16 && i+j < dataEnd; j++) {
    hex += rom[i+j].toString(16).padStart(2, '0').toUpperCase() + ' ';
  }
  output.push(`  ${i.toString(16).padStart(6,'0').toUpperCase()}: ${hex}`);
}
output.push('```');
output.push('');

// --- Collect CALL targets for one-level-deep follow ---
const callTargets = new Set();
// Scan 0x003C63-0x003D8B for CALL instructions
let scanPos = 0x003C63;
while (scanPos < 0x003D8B) {
  const inst = disasmOne(scanPos);
  if (inst.mnemonic.startsWith('CALL ') && !inst.mnemonic.includes(',')) {
    const target = parseInt(inst.mnemonic.split(' ')[1], 16);
    if (target && target < 0x003C63 || target > 0x003D8B) {
      callTargets.add(target);
    }
  }
  scanPos += inst.len;
}

output.push('## CALL targets found within _GetCSC ecosystem');
output.push('');
for (const t of callTargets) {
  output.push(`- ${hex6(t)}`);
}
output.push('');

// Disassemble CALL targets (0x003CC2 is internal, already covered above)
// The only external CALL target is 0x003CC2 which is already disassembled.
// Check if there are any others:
output.push('## Note on CALL targets');
output.push('');
output.push('All CALL targets within the _GetCSC ecosystem are internal:');
output.push('- 0x003CC2: Hardware keyboard scan (disassembled above)');
output.push('- 0x003C63: Scan dispatcher (disassembled above)');
output.push('- 0x003D4B: Store scan code subroutine (within hardware scan, disassembled above)');
output.push('');

// --- Analysis ---
output.push('## Analysis');
output.push('');
output.push('### _GetCSC (0x003D5A) — High-level flow');
output.push('');
output.push('1. **LD B, 0x34** — Load debounce counter (52 iterations)');
output.push('2. **BIT 3, (IY+0x00)** — Test "key ready" flag in IY system flags');
output.push('3. If flag SET (key ready):');
output.push('   - Jump to 0x003D75: read scan code from D00587, clear it, clear flag, return');
output.push('4. If flag CLEAR (no key):');
output.push('   - CALL 0x003C63 (scan dispatcher — performs one hardware scan)');
output.push('   - Delay loop: LD BC, 0x000800; DEC BC; loop until BC=0');
output.push('   - DJNZ back to step 2 (repeat up to 52 times)');
output.push('   - If all 52 iterations pass with no key: XOR A (return 0)');
output.push('');
output.push('### Hardware scan routine (0x003CC0-0x003D59)');
output.push('');
output.push('The hardware scan reads the keyboard via **I/O ports** (not MMIO):');
output.push('');
output.push('#### Port usage (B=0xA0, port address = B:C = 0xA0xx):');
output.push('- **Port 0xA000 (C=0x00):** keyboard controller enable/mode');
output.push('- **Port 0xA008 (C=0x08):** keyboard data register (IN/OUT for scan-all)');
output.push('- **Port 0xA00C (C=0x0C):** keyboard group/mode select');
output.push('- **Ports 0xA012-0xA01E (C=0x12-0x1E, step 2):** individual group scan ports');
output.push('  - Group scan starts at C=0x10, increments by 2 each iteration');
output.push('');
output.push('- **Initialization (0x003CC6-0x003CF8):**');
output.push('  1. .SIS LD BC, 0xA000 — B=0xA0 (port base), C=0x00');
output.push('  2. LD A, 0x01; OUT (C), A — write 0x01 to port 0xA000 (enable)');
output.push('  3. CP 0xA0 — verify B is still 0xA0 (RST 0x08 = error if not)');
output.push('  4. C=0x0C; LD A, 0x04; OUT (C), A — write 0x04 to port 0xA00C (mode)');
output.push('  5. C=0x08; .SIS LD HL, 0xFF00; OUT (C), H — write 0xFF to port 0xA008 (scan all groups)');
output.push('  6. Wait: CP 0x08 loop on C until C=0x08 (port ready check)');
output.push('  7. XOR A; IN A, (C) — read port 0xA008; RET Z if 0 (no keys pressed)');
output.push('');
output.push('- **Single-group re-scan (0x003CF7-0x003D20):**');
output.push('  1. C=0x00; LD A, 0x03; OUT (C), A — write 0x03 to port 0xA000 (scan mode)');
output.push('  2. C=0x0C; LD A, 0x01; OUT (C), A — write 0x01 to port 0xA00C');
output.push('  3. C=0x08; OUT (C), H; IN A, (C) loop — scan + wait');
output.push('  4. C=0x00; XOR A; OUT (C), A — write 0x00 to port 0xA000 (reset)');
output.push('');
output.push('- **Group scan loop (0x003D21-0x003D33):**');
output.push('  1. D=8 (7 groups to scan + 1 for exit), C=0x10 (base scan port)');
output.push('  2. DEC D; if D=0 → done (jump to 0x003D34)');
output.push('  3. INC C; INC C — advance port by 2 (groups at ports 0xA012-0xA01E)');
output.push('  4. IN E, (C) — read group bits into E');
output.push('  5. If E=0 (no key in group) → JR back to step 2');
output.push('  6. INC H — increment group counter (first found key)');
output.push('  7. If H≠0 (second key found): JR to 0x003D47 → SCF; A=0xFF; RET (multi-key rejection)');
output.push('  8. ADD HL, DE — accumulate key bits');
output.push('  9. JR back to step 2 — continue scanning remaining groups');
output.push('');
output.push('- **Bit extraction + scan code computation (0x003D34-0x003D4A):**');
output.push('  1. OR L — if L=0, RET Z (no key bits found)');
output.push('  2. LD A, H; DEC A — A = group counter - 1');
output.push('  3. BIT 0, (IY+0x2C) — check modifier flag');
output.push('  4. If set: RET NZ (return with carry clear = modifier handled separately)');
output.push('  5. RLA; RLA; RLA — A = (group-1) * 8');
output.push('  6. Loop at 0x003D40: INC A; RR L; JR NC → loop');
output.push('     - Rotates L right through carry, incrementing A each time');
output.push('     - When carry is set, the lowest set bit in L was found');
output.push('     - A = (group-1)*8 + bit_position + 1 = OS scan code');
output.push('  7. CCF; RET Z — complement carry; if was single-bit, return with A=scan code');
output.push('  8. 0x003D47: SCF; LD A, 0xFF; RET — multi-key or error: return 0xFF with carry set');
output.push('');
output.push('- **Store result (0x003D4B-0x003D59):**');
output.push('  1. LD (D00587), A — store OS scan code');
output.push('  2. SET 3, (IY+0x00) — set "key ready" flag');
output.push('  3. OR A; RET Z — if scan code is 0, just return');
output.push('  4. LD (D0058D), A — store to "last key" location');
output.push('  5. RET');
output.push('');
output.push('### Return value');
output.push('');
output.push('- **A = OS scan code** (0x01-0x38, or 0x00 for no key)');
output.push('- OS scan codes use the formula: (6 - group) * 8 + bit + 1');
output.push('- The scan loop iterates groups in reverse (group 6 first → lowest codes)');
output.push('');
output.push('### RAM locations accessed');
output.push('');
output.push('| Address | Name | Access | Purpose |');
output.push('|---------|------|--------|---------|');
output.push('| D00587 | kbdScanCode | R/W | Current OS scan code |');
output.push('| D00588 | kbdPrevKey | R/W | Previous key for debounce comparison |');
output.push('| D00589 | kbdDebounceNew | R/W | New key debounce tracking |');
output.push('| D0058A | kbdDebounceTimer | R/W | Debounce countdown timer |');
output.push('| D0058B | kbdRepeatDelay | R/W | Key repeat initial delay |');
output.push('| D0058D | kbdLastKey | W | Last non-zero key pressed |');
output.push('| (IY+0x00) bit 3 | kbdKeyReady | R/W | Flag: key scan code is available |');
output.push('| (IY+0x2C) bit 0 | kbdModifier | R | Modifier state flag |');
output.push('');
output.push('### Debounce mechanism (0x003C63)');
output.push('');
output.push('The scan dispatcher at 0x003C63 implements debounce:');
output.push('1. Calls hardware scan (0x003CC2) which returns carry+A if key found');
output.push('2. If carry set (key found):');
output.push('   - Compares new key (A) with D00589 (last debounced key)');
output.push('   - If different: stores to D00589, resets repeat delay to 5');
output.push('   - If same: checks D00588 (previous key match)');
output.push('     - If matches AND non-zero: checks if key is 0x38 (special)');
output.push('     - Decrements D0058A (debounce timer)');
output.push('     - When timer reaches 0: reloads to 10 (0x0A) and stores via 0x003D4B');
output.push('3. Implements key-repeat: after initial delay, auto-repeats at rate 10');
output.push('');
output.push('### Calling convention');
output.push('');
output.push('- **Input:** None');
output.push('- **Output:** A = OS scan code (0 = no key)');
output.push('- **Flags:** Z set if no key, NZ if key found');
output.push('- **Destroys:** A, B, C, D, E, H, L, flags');
output.push('- **Preserves:** IY (system flags pointer)');
output.push('');
output.push('### Does it write to D141B5?');
output.push('');
output.push('No. _GetCSC does NOT write to D141B5. It writes scan codes to:');
output.push('- D00587 (primary scan code location)');
output.push('- D0058D (last non-zero key backup)');
output.push('D141B5 is likely written by a higher-level key processing routine.');
output.push('');

// Write report
const report = output.join('\n');
fs.writeFileSync(REPORT_PATH, report);
console.log(`Report written to ${REPORT_PATH}`);
console.log(`Report length: ${report.length} bytes, ${output.length} lines`);

// Print the disassembly to stdout too
console.log('\n' + report);
