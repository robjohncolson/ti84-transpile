#!/usr/bin/env node

/**
 * Phase 280: Trace 0x09EDC3 — shared post-init function for STAT subsystem
 *
 * Both STAT dispatcher paths (0x09E0A1 and 0x09E0D9) call 0x09DD14 (STAT init),
 * and AFTER that call, both paths call 0x09EDC3. This probe:
 *   1. Static disassembly of 0x09EDC3 until RET or unconditional JP
 *   2. Dynamic trace with CPU (500 steps, RAM write tracking)
 *   3. Analysis: function boundaries, call targets, RAM writes
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const rom = fs.readFileSync(ROM_PATH);

// --- Helpers ---

function hex(v, w = 6) {
  if (v === undefined || v === null || Number.isNaN(v)) return 'n/a';
  return '0x' + (Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

function read24LE(offset) {
  return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16);
}

function write24Mem(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

// --- Static Disassembler ---

function manualDisasm(start, maxLen = 256) {
  const lines = [];
  let pc = start;
  const end = start + maxLen;

  while (pc < end) {
    const b = rom[pc];
    let line = '';
    let advance = 1;
    let isRet = false;
    let isUncondJp = false;

    if (b === 0xCD) { const addr = read24LE(pc + 1); line = `CALL ${hex(addr)}`; advance = 4; }
    else if (b === 0xC3) { const addr = read24LE(pc + 1); line = `JP ${hex(addr)}`; advance = 4; isUncondJp = true; }
    else if (b === 0xC9) { line = 'RET'; isRet = true; }
    else if (b === 0xC0) { line = 'RET NZ'; }
    else if (b === 0xC8) { line = 'RET Z'; }
    else if (b === 0xD0) { line = 'RET NC'; }
    else if (b === 0xD8) { line = 'RET C'; }
    else if (b === 0xE0) { line = 'RET PO'; }
    else if (b === 0xE8) { line = 'RET PE'; }
    else if (b === 0xF0) { line = 'RET P'; }
    else if (b === 0xF8) { line = 'RET M'; }
    else if (b === 0xC4) { const a = read24LE(pc+1); line = `CALL NZ,${hex(a)}`; advance = 4; }
    else if (b === 0xCC) { const a = read24LE(pc+1); line = `CALL Z,${hex(a)}`; advance = 4; }
    else if (b === 0xD4) { const a = read24LE(pc+1); line = `CALL NC,${hex(a)}`; advance = 4; }
    else if (b === 0xDC) { const a = read24LE(pc+1); line = `CALL C,${hex(a)}`; advance = 4; }
    else if (b === 0xC2) { const a = read24LE(pc+1); line = `JP NZ,${hex(a)}`; advance = 4; }
    else if (b === 0xCA) { const a = read24LE(pc+1); line = `JP Z,${hex(a)}`; advance = 4; }
    else if (b === 0xD2) { const a = read24LE(pc+1); line = `JP NC,${hex(a)}`; advance = 4; }
    else if (b === 0xDA) { const a = read24LE(pc+1); line = `JP C,${hex(a)}`; advance = 4; }
    else if (b === 0x18) { const off = rom[pc+1]; const rel = off > 127 ? off - 256 : off; line = `JR ${hex(pc + 2 + rel)} (${rel >= 0 ? '+' : ''}${rel})`; advance = 2; }
    else if (b === 0x20) { const off = rom[pc+1]; const rel = off > 127 ? off - 256 : off; line = `JR NZ,${hex(pc + 2 + rel)} (${rel >= 0 ? '+' : ''}${rel})`; advance = 2; }
    else if (b === 0x28) { const off = rom[pc+1]; const rel = off > 127 ? off - 256 : off; line = `JR Z,${hex(pc + 2 + rel)} (${rel >= 0 ? '+' : ''}${rel})`; advance = 2; }
    else if (b === 0x30) { const off = rom[pc+1]; const rel = off > 127 ? off - 256 : off; line = `JR NC,${hex(pc + 2 + rel)} (${rel >= 0 ? '+' : ''}${rel})`; advance = 2; }
    else if (b === 0x38) { const off = rom[pc+1]; const rel = off > 127 ? off - 256 : off; line = `JR C,${hex(pc + 2 + rel)} (${rel >= 0 ? '+' : ''}${rel})`; advance = 2; }
    else if (b === 0x10) { const off = rom[pc+1]; const rel = off > 127 ? off - 256 : off; line = `DJNZ ${hex(pc + 2 + rel)} (${rel >= 0 ? '+' : ''}${rel})`; advance = 2; }
    // LD r,imm8
    else if (b === 0x3E) { line = `LD A,${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0x06) { line = `LD B,${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0x0E) { line = `LD C,${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0x16) { line = `LD D,${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0x1E) { line = `LD E,${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0x26) { line = `LD H,${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0x2E) { line = `LD L,${hex(rom[pc+1], 2)}`; advance = 2; }
    // LD rr,imm24
    else if (b === 0x01) { line = `LD BC,${hex(read24LE(pc+1))}`; advance = 4; }
    else if (b === 0x11) { line = `LD DE,${hex(read24LE(pc+1))}`; advance = 4; }
    else if (b === 0x21) { line = `LD HL,${hex(read24LE(pc+1))}`; advance = 4; }
    else if (b === 0x31) { line = `LD SP,${hex(read24LE(pc+1))}`; advance = 4; }
    // LD (HL),r and LD r,(HL)
    else if (b === 0x77) { line = 'LD (HL),A'; }
    else if (b === 0x70) { line = 'LD (HL),B'; }
    else if (b === 0x71) { line = 'LD (HL),C'; }
    else if (b === 0x72) { line = 'LD (HL),D'; }
    else if (b === 0x73) { line = 'LD (HL),E'; }
    else if (b === 0x74) { line = 'LD (HL),H'; }
    else if (b === 0x75) { line = 'LD (HL),L'; }
    else if (b === 0x7E) { line = 'LD A,(HL)'; }
    else if (b === 0x46) { line = 'LD B,(HL)'; }
    else if (b === 0x4E) { line = 'LD C,(HL)'; }
    else if (b === 0x56) { line = 'LD D,(HL)'; }
    else if (b === 0x5E) { line = 'LD E,(HL)'; }
    else if (b === 0x66) { line = 'LD H,(HL)'; }
    else if (b === 0x6E) { line = 'LD L,(HL)'; }
    // LD (nn),A and LD A,(nn)
    else if (b === 0x32) { line = `LD (${hex(read24LE(pc+1))}),A`; advance = 4; }
    else if (b === 0x3A) { line = `LD A,(${hex(read24LE(pc+1))})`; advance = 4; }
    // LD (nn),HL and LD HL,(nn) - direct encoding
    else if (b === 0x22) { line = `LD (${hex(read24LE(pc+1))}),HL`; advance = 4; }
    else if (b === 0x2A) { line = `LD HL,(${hex(read24LE(pc+1))})`; advance = 4; }
    // PUSH/POP
    else if (b === 0xC5) { line = 'PUSH BC'; }
    else if (b === 0xD5) { line = 'PUSH DE'; }
    else if (b === 0xE5) { line = 'PUSH HL'; }
    else if (b === 0xF5) { line = 'PUSH AF'; }
    else if (b === 0xC1) { line = 'POP BC'; }
    else if (b === 0xD1) { line = 'POP DE'; }
    else if (b === 0xE1) { line = 'POP HL'; }
    else if (b === 0xF1) { line = 'POP AF'; }
    // INC/DEC
    else if (b === 0x3C) { line = 'INC A'; }
    else if (b === 0x3D) { line = 'DEC A'; }
    else if (b === 0x04) { line = 'INC B'; }
    else if (b === 0x05) { line = 'DEC B'; }
    else if (b === 0x0C) { line = 'INC C'; }
    else if (b === 0x0D) { line = 'DEC C'; }
    else if (b === 0x14) { line = 'INC D'; }
    else if (b === 0x15) { line = 'DEC D'; }
    else if (b === 0x1C) { line = 'INC E'; }
    else if (b === 0x1D) { line = 'DEC E'; }
    else if (b === 0x24) { line = 'INC H'; }
    else if (b === 0x25) { line = 'DEC H'; }
    else if (b === 0x2C) { line = 'INC L'; }
    else if (b === 0x2D) { line = 'DEC L'; }
    else if (b === 0x34) { line = 'INC (HL)'; }
    else if (b === 0x35) { line = 'DEC (HL)'; }
    else if (b === 0x23) { line = 'INC HL'; }
    else if (b === 0x2B) { line = 'DEC HL'; }
    else if (b === 0x03) { line = 'INC BC'; }
    else if (b === 0x0B) { line = 'DEC BC'; }
    else if (b === 0x13) { line = 'INC DE'; }
    else if (b === 0x1B) { line = 'DEC DE'; }
    else if (b === 0x33) { line = 'INC SP'; }
    else if (b === 0x3B) { line = 'DEC SP'; }
    // CP
    else if (b === 0xFE) { line = `CP ${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0xBF) { line = 'CP A'; }
    else if (b === 0xB8) { line = 'CP B'; }
    else if (b === 0xB9) { line = 'CP C'; }
    else if (b === 0xBA) { line = 'CP D'; }
    else if (b === 0xBB) { line = 'CP E'; }
    else if (b === 0xBC) { line = 'CP H'; }
    else if (b === 0xBD) { line = 'CP L'; }
    else if (b === 0xBE) { line = 'CP (HL)'; }
    // OR/AND/XOR
    else if (b === 0xB7) { line = 'OR A'; }
    else if (b === 0xA7) { line = 'AND A'; }
    else if (b === 0xAF) { line = 'XOR A'; }
    else if (b === 0xF6) { line = `OR ${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0xE6) { line = `AND ${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0xEE) { line = `XOR ${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0xB0) { line = 'OR B'; }
    else if (b === 0xB1) { line = 'OR C'; }
    else if (b === 0xB2) { line = 'OR D'; }
    else if (b === 0xB3) { line = 'OR E'; }
    else if (b === 0xB4) { line = 'OR H'; }
    else if (b === 0xB5) { line = 'OR L'; }
    else if (b === 0xB6) { line = 'OR (HL)'; }
    else if (b === 0xA0) { line = 'AND B'; }
    else if (b === 0xA1) { line = 'AND C'; }
    else if (b === 0xA2) { line = 'AND D'; }
    else if (b === 0xA3) { line = 'AND E'; }
    else if (b === 0xA4) { line = 'AND H'; }
    else if (b === 0xA5) { line = 'AND L'; }
    else if (b === 0xA6) { line = 'AND (HL)'; }
    else if (b === 0xA8) { line = 'XOR B'; }
    else if (b === 0xA9) { line = 'XOR C'; }
    else if (b === 0xAA) { line = 'XOR D'; }
    else if (b === 0xAB) { line = 'XOR E'; }
    else if (b === 0xAC) { line = 'XOR H'; }
    else if (b === 0xAD) { line = 'XOR L'; }
    else if (b === 0xAE) { line = 'XOR (HL)'; }
    // ADD/SUB/ADC/SBC
    else if (b === 0x87) { line = 'ADD A,A'; }
    else if (b === 0x80) { line = 'ADD A,B'; }
    else if (b === 0x81) { line = 'ADD A,C'; }
    else if (b === 0x82) { line = 'ADD A,D'; }
    else if (b === 0x83) { line = 'ADD A,E'; }
    else if (b === 0x84) { line = 'ADD A,H'; }
    else if (b === 0x85) { line = 'ADD A,L'; }
    else if (b === 0x86) { line = 'ADD A,(HL)'; }
    else if (b === 0xC6) { line = `ADD A,${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0x90) { line = 'SUB B'; }
    else if (b === 0x91) { line = 'SUB C'; }
    else if (b === 0x97) { line = 'SUB A'; }
    else if (b === 0xD6) { line = `SUB ${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0x09) { line = 'ADD HL,BC'; }
    else if (b === 0x19) { line = 'ADD HL,DE'; }
    else if (b === 0x29) { line = 'ADD HL,HL'; }
    else if (b === 0x39) { line = 'ADD HL,SP'; }
    // NOP
    else if (b === 0x00) { line = 'NOP'; }
    // EX DE,HL
    else if (b === 0xEB) { line = 'EX DE,HL'; }
    // LD r,r
    else if (b === 0x7F) { line = 'LD A,A'; }
    else if (b === 0x78) { line = 'LD A,B'; }
    else if (b === 0x79) { line = 'LD A,C'; }
    else if (b === 0x7A) { line = 'LD A,D'; }
    else if (b === 0x7B) { line = 'LD A,E'; }
    else if (b === 0x7C) { line = 'LD A,H'; }
    else if (b === 0x7D) { line = 'LD A,L'; }
    else if (b === 0x47) { line = 'LD B,A'; }
    else if (b === 0x40) { line = 'LD B,B'; }
    else if (b === 0x41) { line = 'LD B,C'; }
    else if (b === 0x48) { line = 'LD C,B'; }
    else if (b === 0x4F) { line = 'LD C,A'; }
    else if (b === 0x50) { line = 'LD D,B'; }
    else if (b === 0x51) { line = 'LD D,C'; }
    else if (b === 0x57) { line = 'LD D,A'; }
    else if (b === 0x58) { line = 'LD E,B'; }
    else if (b === 0x59) { line = 'LD E,C'; }
    else if (b === 0x5F) { line = 'LD E,A'; }
    else if (b === 0x60) { line = 'LD H,B'; }
    else if (b === 0x61) { line = 'LD H,C'; }
    else if (b === 0x67) { line = 'LD H,A'; }
    else if (b === 0x68) { line = 'LD L,B'; }
    else if (b === 0x69) { line = 'LD L,C'; }
    else if (b === 0x6F) { line = 'LD L,A'; }
    // RLCA/RRCA/RLA/RRA
    else if (b === 0x07) { line = 'RLCA'; }
    else if (b === 0x0F) { line = 'RRCA'; }
    else if (b === 0x17) { line = 'RLA'; }
    else if (b === 0x1F) { line = 'RRA'; }
    // SCF/CCF
    else if (b === 0x37) { line = 'SCF'; }
    else if (b === 0x3F) { line = 'CCF'; }
    // CPL
    else if (b === 0x2F) { line = 'CPL'; }
    // DI/EI
    else if (b === 0xF3) { line = 'DI'; }
    else if (b === 0xFB) { line = 'EI'; }
    // LD (BC),A / LD (DE),A / LD A,(BC) / LD A,(DE)
    else if (b === 0x02) { line = 'LD (BC),A'; }
    else if (b === 0x12) { line = 'LD (DE),A'; }
    else if (b === 0x0A) { line = 'LD A,(BC)'; }
    else if (b === 0x1A) { line = 'LD A,(DE)'; }
    // DD prefix (IX)
    else if (b === 0xDD) {
      const b2 = rom[pc+1];
      if (b2 === 0x21) { line = `LD IX,${hex(read24LE(pc+2))}`; advance = 5; }
      else if (b2 === 0xE5) { line = 'PUSH IX'; advance = 2; }
      else if (b2 === 0xE1) { line = 'POP IX'; advance = 2; }
      else if (b2 === 0xE9) { line = 'JP (IX)'; advance = 2; }
      else if (b2 === 0x7E) { const d = rom[pc+2]; line = `LD A,(IX+${d})`; advance = 3; }
      else if (b2 === 0x77) { const d = rom[pc+2]; line = `LD (IX+${d}),A`; advance = 3; }
      else if (b2 === 0x36) { const d = rom[pc+2]; const v = rom[pc+3]; line = `LD (IX+${d}),${hex(v,2)}`; advance = 4; }
      else if (b2 === 0xBE) { const d = rom[pc+2]; line = `CP (IX+${d})`; advance = 3; }
      else if (b2 === 0x46) { const d = rom[pc+2]; line = `LD B,(IX+${d})`; advance = 3; }
      else if (b2 === 0x4E) { const d = rom[pc+2]; line = `LD C,(IX+${d})`; advance = 3; }
      else if (b2 === 0x56) { const d = rom[pc+2]; line = `LD D,(IX+${d})`; advance = 3; }
      else if (b2 === 0x5E) { const d = rom[pc+2]; line = `LD E,(IX+${d})`; advance = 3; }
      else if (b2 === 0x66) { const d = rom[pc+2]; line = `LD H,(IX+${d})`; advance = 3; }
      else if (b2 === 0x6E) { const d = rom[pc+2]; line = `LD L,(IX+${d})`; advance = 3; }
      else if (b2 === 0x34) { const d = rom[pc+2]; line = `INC (IX+${d})`; advance = 3; }
      else if (b2 === 0x35) { const d = rom[pc+2]; line = `DEC (IX+${d})`; advance = 3; }
      else if (b2 === 0x86) { const d = rom[pc+2]; line = `ADD A,(IX+${d})`; advance = 3; }
      else if (b2 === 0x96) { const d = rom[pc+2]; line = `SUB (IX+${d})`; advance = 3; }
      else if (b2 === 0xA6) { const d = rom[pc+2]; line = `AND (IX+${d})`; advance = 3; }
      else if (b2 === 0xB6) { const d = rom[pc+2]; line = `OR (IX+${d})`; advance = 3; }
      else if (b2 === 0xAE) { const d = rom[pc+2]; line = `XOR (IX+${d})`; advance = 3; }
      else if (b2 === 0x09) { line = 'ADD IX,BC'; advance = 2; }
      else if (b2 === 0x19) { line = 'ADD IX,DE'; advance = 2; }
      else if (b2 === 0x29) { line = 'ADD IX,IX'; advance = 2; }
      else if (b2 === 0x39) { line = 'ADD IX,SP'; advance = 2; }
      else if (b2 === 0x23) { line = 'INC IX'; advance = 2; }
      else if (b2 === 0x2B) { line = 'DEC IX'; advance = 2; }
      else if (b2 === 0xCB) {
        const d = rom[pc+2]; const op = rom[pc+3];
        const bit = (op >> 3) & 7;
        if ((op & 0xC7) === 0x46) { line = `BIT ${bit},(IX+${d})`; advance = 4; }
        else if ((op & 0xC7) === 0xC6) { line = `SET ${bit},(IX+${d})`; advance = 4; }
        else if ((op & 0xC7) === 0x86) { line = `RES ${bit},(IX+${d})`; advance = 4; }
        else { line = `DB DD CB ${hex(d,2)} ${hex(op,2)}`; advance = 4; }
      }
      else { line = `DB DD ${hex(b2,2)}`; advance = 2; }
    }
    // FD prefix (IY)
    else if (b === 0xFD) {
      const b2 = rom[pc+1];
      if (b2 === 0x21) { line = `LD IY,${hex(read24LE(pc+2))}`; advance = 5; }
      else if (b2 === 0xE5) { line = 'PUSH IY'; advance = 2; }
      else if (b2 === 0xE1) { line = 'POP IY'; advance = 2; }
      else if (b2 === 0xE9) { line = 'JP (IY)'; advance = 2; }
      else if (b2 === 0x7E) { const d = rom[pc+2]; line = `LD A,(IY+${d})`; advance = 3; }
      else if (b2 === 0x77) { const d = rom[pc+2]; line = `LD (IY+${d}),A`; advance = 3; }
      else if (b2 === 0x36) { const d = rom[pc+2]; const v = rom[pc+3]; line = `LD (IY+${d}),${hex(v,2)}`; advance = 4; }
      else if (b2 === 0xBE) { const d = rom[pc+2]; line = `CP (IY+${d})`; advance = 3; }
      else if (b2 === 0x46) { const d = rom[pc+2]; line = `LD B,(IY+${d})`; advance = 3; }
      else if (b2 === 0x4E) { const d = rom[pc+2]; line = `LD C,(IY+${d})`; advance = 3; }
      else if (b2 === 0x56) { const d = rom[pc+2]; line = `LD D,(IY+${d})`; advance = 3; }
      else if (b2 === 0x5E) { const d = rom[pc+2]; line = `LD E,(IY+${d})`; advance = 3; }
      else if (b2 === 0x66) { const d = rom[pc+2]; line = `LD H,(IY+${d})`; advance = 3; }
      else if (b2 === 0x6E) { const d = rom[pc+2]; line = `LD L,(IY+${d})`; advance = 3; }
      else if (b2 === 0x34) { const d = rom[pc+2]; line = `INC (IY+${d})`; advance = 3; }
      else if (b2 === 0x35) { const d = rom[pc+2]; line = `DEC (IY+${d})`; advance = 3; }
      else if (b2 === 0x86) { const d = rom[pc+2]; line = `ADD A,(IY+${d})`; advance = 3; }
      else if (b2 === 0x96) { const d = rom[pc+2]; line = `SUB (IY+${d})`; advance = 3; }
      else if (b2 === 0xA6) { const d = rom[pc+2]; line = `AND (IY+${d})`; advance = 3; }
      else if (b2 === 0xB6) { const d = rom[pc+2]; line = `OR (IY+${d})`; advance = 3; }
      else if (b2 === 0xAE) { const d = rom[pc+2]; line = `XOR (IY+${d})`; advance = 3; }
      else if (b2 === 0x09) { line = 'ADD IY,BC'; advance = 2; }
      else if (b2 === 0x19) { line = 'ADD IY,DE'; advance = 2; }
      else if (b2 === 0x29) { line = 'ADD IY,IY'; advance = 2; }
      else if (b2 === 0x39) { line = 'ADD IY,SP'; advance = 2; }
      else if (b2 === 0x23) { line = 'INC IY'; advance = 2; }
      else if (b2 === 0x2B) { line = 'DEC IY'; advance = 2; }
      else if (b2 === 0xCB) {
        const d = rom[pc+2]; const op = rom[pc+3];
        const bit = (op >> 3) & 7;
        if ((op & 0xC7) === 0x46) { line = `BIT ${bit},(IY+${d})`; advance = 4; }
        else if ((op & 0xC7) === 0xC6) { line = `SET ${bit},(IY+${d})`; advance = 4; }
        else if ((op & 0xC7) === 0x86) { line = `RES ${bit},(IY+${d})`; advance = 4; }
        else { line = `DB FD CB ${hex(d,2)} ${hex(op,2)}`; advance = 4; }
      }
      else { line = `DB FD ${hex(b2,2)}`; advance = 2; }
    }
    // CB prefix (bit ops)
    else if (b === 0xCB) {
      const b2 = rom[pc+1];
      const bit = (b2 >> 3) & 7;
      const reg = ['B','C','D','E','H','L','(HL)','A'][b2 & 7];
      if ((b2 & 0xC0) === 0x00) {
        const ops = ['RLC','RRC','RL','RR','SLA','SRA','SLL','SRL'];
        line = `${ops[(b2 >> 3) & 7]} ${reg}`; advance = 2;
      }
      else if ((b2 & 0xC0) === 0x40) { line = `BIT ${bit},${reg}`; advance = 2; }
      else if ((b2 & 0xC0) === 0xC0) { line = `SET ${bit},${reg}`; advance = 2; }
      else if ((b2 & 0xC0) === 0x80) { line = `RES ${bit},${reg}`; advance = 2; }
      else { line = `CB ${hex(b2,2)}`; advance = 2; }
    }
    // ED prefix
    else if (b === 0xED) {
      const b2 = rom[pc+1];
      if (b2 === 0xB0) { line = 'LDIR'; advance = 2; }
      else if (b2 === 0xB8) { line = 'LDDR'; advance = 2; }
      else if (b2 === 0xA0) { line = 'LDI'; advance = 2; }
      else if (b2 === 0xA8) { line = 'LDD'; advance = 2; }
      else if (b2 === 0xB1) { line = 'CPIR'; advance = 2; }
      else if (b2 === 0xB9) { line = 'CPDR'; advance = 2; }
      else if (b2 === 0x43) { line = `LD (${hex(read24LE(pc+2))}),BC`; advance = 5; }
      else if (b2 === 0x53) { line = `LD (${hex(read24LE(pc+2))}),DE`; advance = 5; }
      else if (b2 === 0x63) { line = `LD (${hex(read24LE(pc+2))}),HL`; advance = 5; }
      else if (b2 === 0x73) { line = `LD (${hex(read24LE(pc+2))}),SP`; advance = 5; }
      else if (b2 === 0x4B) { line = `LD BC,(${hex(read24LE(pc+2))})`; advance = 5; }
      else if (b2 === 0x5B) { line = `LD DE,(${hex(read24LE(pc+2))})`; advance = 5; }
      else if (b2 === 0x6B) { line = `LD HL,(${hex(read24LE(pc+2))})`; advance = 5; }
      else if (b2 === 0x7B) { line = `LD SP,(${hex(read24LE(pc+2))})`; advance = 5; }
      else if (b2 === 0x44) { line = 'NEG'; advance = 2; }
      else if (b2 === 0x4D) { line = 'RETI'; advance = 2; }
      else if (b2 === 0x45) { line = 'RETN'; advance = 2; }
      else if (b2 === 0x46) { line = 'IM 0'; advance = 2; }
      else if (b2 === 0x56) { line = 'IM 1'; advance = 2; }
      else if (b2 === 0x5E) { line = 'IM 2'; advance = 2; }
      else if (b2 === 0x47) { line = 'LD I,A'; advance = 2; }
      else if (b2 === 0x57) { line = 'LD A,I'; advance = 2; }
      else if (b2 === 0x4F) { line = 'LD R,A'; advance = 2; }
      else if (b2 === 0x5F) { line = 'LD A,R'; advance = 2; }
      else if (b2 === 0x42) { line = 'SBC HL,BC'; advance = 2; }
      else if (b2 === 0x52) { line = 'SBC HL,DE'; advance = 2; }
      else if (b2 === 0x62) { line = 'SBC HL,HL'; advance = 2; }
      else if (b2 === 0x72) { line = 'SBC HL,SP'; advance = 2; }
      else if (b2 === 0x4A) { line = 'ADC HL,BC'; advance = 2; }
      else if (b2 === 0x5A) { line = 'ADC HL,DE'; advance = 2; }
      else if (b2 === 0x6A) { line = 'ADC HL,HL'; advance = 2; }
      else if (b2 === 0x7A) { line = 'ADC HL,SP'; advance = 2; }
      else { line = `ED ${hex(b2,2)}`; advance = 2; }
    }
    // RST
    else if ((b & 0xC7) === 0xC7) { line = `RST ${hex(b & 0x38, 2)}`; }
    // Catch-all
    else {
      line = `DB ${hex(b, 2)}`;
    }

    const bytes = [];
    for (let i = 0; i < advance; i++) bytes.push(rom[pc + i].toString(16).padStart(2, '0'));
    const byteStr = bytes.join(' ').padEnd(20);

    lines.push({ addr: pc, text: `  ${hex(pc)}: ${byteStr} ${line}`, isRet, isUncondJp });
    pc += advance;

    if (isRet || isUncondJp) break;
  }
  return lines;
}

/** Extended disassembly that follows JR/JP targets within the function range */
function disasmFull(start, maxBytes = 512) {
  const lines = [];
  let pc = start;
  const end = start + maxBytes;

  while (pc < end) {
    const b = rom[pc];
    let line = '';
    let advance = 1;

    // Use the same decoding as manualDisasm but don't stop at RET/JP
    if (b === 0xCD) { const addr = read24LE(pc + 1); line = `CALL ${hex(addr)}`; advance = 4; }
    else if (b === 0xC3) { const addr = read24LE(pc + 1); line = `JP ${hex(addr)}`; advance = 4; }
    else if (b === 0xC9) { line = 'RET'; }
    else if (b === 0xC0) { line = 'RET NZ'; }
    else if (b === 0xC8) { line = 'RET Z'; }
    else if (b === 0xD0) { line = 'RET NC'; }
    else if (b === 0xD8) { line = 'RET C'; }
    else if (b === 0x18) { const off = rom[pc+1]; const rel = off > 127 ? off - 256 : off; line = `JR ${hex(pc + 2 + rel)} (${rel >= 0 ? '+' : ''}${rel})`; advance = 2; }
    else if (b === 0x20) { const off = rom[pc+1]; const rel = off > 127 ? off - 256 : off; line = `JR NZ,${hex(pc + 2 + rel)} (${rel >= 0 ? '+' : ''}${rel})`; advance = 2; }
    else if (b === 0x28) { const off = rom[pc+1]; const rel = off > 127 ? off - 256 : off; line = `JR Z,${hex(pc + 2 + rel)} (${rel >= 0 ? '+' : ''}${rel})`; advance = 2; }
    else if (b === 0x30) { const off = rom[pc+1]; const rel = off > 127 ? off - 256 : off; line = `JR NC,${hex(pc + 2 + rel)} (${rel >= 0 ? '+' : ''}${rel})`; advance = 2; }
    else if (b === 0x38) { const off = rom[pc+1]; const rel = off > 127 ? off - 256 : off; line = `JR C,${hex(pc + 2 + rel)} (${rel >= 0 ? '+' : ''}${rel})`; advance = 2; }
    else if (b === 0x10) { const off = rom[pc+1]; const rel = off > 127 ? off - 256 : off; line = `DJNZ ${hex(pc + 2 + rel)} (${rel >= 0 ? '+' : ''}${rel})`; advance = 2; }
    else if (b === 0x3E) { line = `LD A,${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0x06) { line = `LD B,${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0x0E) { line = `LD C,${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0x21) { line = `LD HL,${hex(read24LE(pc+1))}`; advance = 4; }
    else if (b === 0x11) { line = `LD DE,${hex(read24LE(pc+1))}`; advance = 4; }
    else if (b === 0x01) { line = `LD BC,${hex(read24LE(pc+1))}`; advance = 4; }
    else if (b === 0xFE) { line = `CP ${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0x32) { line = `LD (${hex(read24LE(pc+1))}),A`; advance = 4; }
    else if (b === 0x3A) { line = `LD A,(${hex(read24LE(pc+1))})`; advance = 4; }
    else if (b === 0x22) { line = `LD (${hex(read24LE(pc+1))}),HL`; advance = 4; }
    else if (b === 0x2A) { line = `LD HL,(${hex(read24LE(pc+1))})`; advance = 4; }
    else if (b === 0xF5) { line = 'PUSH AF'; }
    else if (b === 0xC5) { line = 'PUSH BC'; }
    else if (b === 0xD5) { line = 'PUSH DE'; }
    else if (b === 0xE5) { line = 'PUSH HL'; }
    else if (b === 0xF1) { line = 'POP AF'; }
    else if (b === 0xC1) { line = 'POP BC'; }
    else if (b === 0xD1) { line = 'POP DE'; }
    else if (b === 0xE1) { line = 'POP HL'; }
    else if (b === 0xC4) { const a = read24LE(pc+1); line = `CALL NZ,${hex(a)}`; advance = 4; }
    else if (b === 0xCC) { const a = read24LE(pc+1); line = `CALL Z,${hex(a)}`; advance = 4; }
    else if (b === 0xD4) { const a = read24LE(pc+1); line = `CALL NC,${hex(a)}`; advance = 4; }
    else if (b === 0xDC) { const a = read24LE(pc+1); line = `CALL C,${hex(a)}`; advance = 4; }
    else if (b === 0xDD) {
      const b2 = rom[pc+1];
      if (b2 === 0x21) { line = `LD IX,${hex(read24LE(pc+2))}`; advance = 5; }
      else if (b2 === 0xE5) { line = 'PUSH IX'; advance = 2; }
      else if (b2 === 0xE1) { line = 'POP IX'; advance = 2; }
      else { line = `DB DD ${hex(b2,2)}`; advance = 2; }
    }
    else if (b === 0xFD) {
      const b2 = rom[pc+1];
      if (b2 === 0x21) { line = `LD IY,${hex(read24LE(pc+2))}`; advance = 5; }
      else if (b2 === 0xE5) { line = 'PUSH IY'; advance = 2; }
      else if (b2 === 0xE1) { line = 'POP IY'; advance = 2; }
      else if (b2 === 0x7E) { const d = rom[pc+2]; line = `LD A,(IY+${d})`; advance = 3; }
      else if (b2 === 0x77) { const d = rom[pc+2]; line = `LD (IY+${d}),A`; advance = 3; }
      else if (b2 === 0x36) { const d = rom[pc+2]; const v = rom[pc+3]; line = `LD (IY+${d}),${hex(v,2)}`; advance = 4; }
      else if (b2 === 0xCB) {
        const d = rom[pc+2]; const op = rom[pc+3];
        const bit = (op >> 3) & 7;
        if ((op & 0xC7) === 0x46) { line = `BIT ${bit},(IY+${d})`; advance = 4; }
        else if ((op & 0xC7) === 0xC6) { line = `SET ${bit},(IY+${d})`; advance = 4; }
        else if ((op & 0xC7) === 0x86) { line = `RES ${bit},(IY+${d})`; advance = 4; }
        else { line = `DB FD CB ${hex(d,2)} ${hex(op,2)}`; advance = 4; }
      }
      else { line = `DB FD ${hex(b2,2)}`; advance = 2; }
    }
    else if (b === 0xCB) {
      const b2 = rom[pc+1];
      const bit = (b2 >> 3) & 7;
      const reg = ['B','C','D','E','H','L','(HL)','A'][b2 & 7];
      if ((b2 & 0xC0) === 0x40) { line = `BIT ${bit},${reg}`; advance = 2; }
      else if ((b2 & 0xC0) === 0xC0) { line = `SET ${bit},${reg}`; advance = 2; }
      else if ((b2 & 0xC0) === 0x80) { line = `RES ${bit},${reg}`; advance = 2; }
      else { line = `CB ${hex(b2,2)}`; advance = 2; }
    }
    else if (b === 0xED) {
      const b2 = rom[pc+1];
      if (b2 === 0xB0) { line = 'LDIR'; advance = 2; }
      else if (b2 === 0xB8) { line = 'LDDR'; advance = 2; }
      else if (b2 === 0x43) { line = `LD (${hex(read24LE(pc+2))}),BC`; advance = 5; }
      else if (b2 === 0x53) { line = `LD (${hex(read24LE(pc+2))}),DE`; advance = 5; }
      else if (b2 === 0x63) { line = `LD (${hex(read24LE(pc+2))}),HL`; advance = 5; }
      else if (b2 === 0x4B) { line = `LD BC,(${hex(read24LE(pc+2))})`; advance = 5; }
      else if (b2 === 0x5B) { line = `LD DE,(${hex(read24LE(pc+2))})`; advance = 5; }
      else if (b2 === 0x6B) { line = `LD HL,(${hex(read24LE(pc+2))})`; advance = 5; }
      else if (b2 === 0x42) { line = 'SBC HL,BC'; advance = 2; }
      else if (b2 === 0x52) { line = 'SBC HL,DE'; advance = 2; }
      else if (b2 === 0x4A) { line = 'ADC HL,BC'; advance = 2; }
      else if (b2 === 0x5A) { line = 'ADC HL,DE'; advance = 2; }
      else { line = `ED ${hex(b2,2)}`; advance = 2; }
    }
    else if (b === 0xB7) { line = 'OR A'; }
    else if (b === 0xA7) { line = 'AND A'; }
    else if (b === 0xAF) { line = 'XOR A'; }
    else if (b === 0xE6) { line = `AND ${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0xF6) { line = `OR ${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0xEE) { line = `XOR ${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0xEB) { line = 'EX DE,HL'; }
    else if (b === 0x77) { line = 'LD (HL),A'; }
    else if (b === 0x7E) { line = 'LD A,(HL)'; }
    else if (b === 0x23) { line = 'INC HL'; }
    else if (b === 0x2B) { line = 'DEC HL'; }
    else if (b === 0x3C) { line = 'INC A'; }
    else if (b === 0x3D) { line = 'DEC A'; }
    else if (b === 0x00) { line = 'NOP'; }
    else if (b === 0x78) { line = 'LD A,B'; }
    else if (b === 0x79) { line = 'LD A,C'; }
    else if (b === 0x7A) { line = 'LD A,D'; }
    else if (b === 0x7B) { line = 'LD A,E'; }
    else if (b === 0x7C) { line = 'LD A,H'; }
    else if (b === 0x7D) { line = 'LD A,L'; }
    else if (b === 0x47) { line = 'LD B,A'; }
    else if (b === 0x4F) { line = 'LD C,A'; }
    else if (b === 0x57) { line = 'LD D,A'; }
    else if (b === 0x5F) { line = 'LD E,A'; }
    else if (b === 0x67) { line = 'LD H,A'; }
    else if (b === 0x6F) { line = 'LD L,A'; }
    else if (b === 0x1A) { line = 'LD A,(DE)'; }
    else if (b === 0x12) { line = 'LD (DE),A'; }
    else if (b === 0x0A) { line = 'LD A,(BC)'; }
    else if (b === 0x02) { line = 'LD (BC),A'; }
    else if (b === 0xC6) { line = `ADD A,${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0xD6) { line = `SUB ${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0x09) { line = 'ADD HL,BC'; }
    else if (b === 0x19) { line = 'ADD HL,DE'; }
    else if (b === 0x29) { line = 'ADD HL,HL'; }
    else if (b === 0x39) { line = 'ADD HL,SP'; }
    else if (b === 0x37) { line = 'SCF'; }
    else if (b === 0x3F) { line = 'CCF'; }
    else if (b === 0xF3) { line = 'DI'; }
    else if (b === 0xFB) { line = 'EI'; }
    else if ((b & 0xC7) === 0xC7) { line = `RST ${hex(b & 0x38, 2)}`; }
    else { line = `DB ${hex(b, 2)}`; }

    const bytes = [];
    for (let i = 0; i < advance; i++) bytes.push(rom[pc + i].toString(16).padStart(2, '0'));
    const byteStr = bytes.join(' ').padEnd(20);

    lines.push(`  ${hex(pc)}: ${byteStr} ${line}`);
    pc += advance;

    // Stop at unconditional RET or JP outside function range
    if (b === 0xC9) break;
    if (b === 0xC3) {
      const target = read24LE(pc - 3);
      if (target < start || target > start + maxBytes) break;
    }
  }
  return lines;
}

/** Search ROM for CALL/JP to target */
function findCallersOf(targetAddr) {
  const callers = [];
  const t0 = targetAddr & 0xFF;
  const t1 = (targetAddr >> 8) & 0xFF;
  const t2 = (targetAddr >> 16) & 0xFF;

  const opcodeNames = {
    0xCD: 'CALL', 0xC4: 'CALL NZ', 0xCC: 'CALL Z', 0xD4: 'CALL NC', 0xDC: 'CALL C',
    0xC3: 'JP', 0xC2: 'JP NZ', 0xCA: 'JP Z', 0xD2: 'JP NC', 0xDA: 'JP C',
  };
  const allOpcodes = Object.keys(opcodeNames).map(Number);

  const searchEnd = Math.min(rom.length - 3, 0x400000);
  for (let i = 0; i < searchEnd; i++) {
    if (allOpcodes.includes(rom[i]) && rom[i+1] === t0 && rom[i+2] === t1 && rom[i+3] === t2) {
      callers.push({ addr: i, type: opcodeNames[rom[i]] });
    }
  }
  return callers;
}

// --- Transpiled module loader ---

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null };
  }
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }
  const tempModulePath = path.join(os.tmpdir(), `ti84-phase280-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath };
}

function cleanupTemp(assets) {
  if (assets?.tempModulePath) {
    try { fs.unlinkSync(assets.tempModulePath); } catch {}
  }
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter(b => b?.id).map(b => [b.id, b]));
  }
  return rawBlocks ?? {};
}

async function loadBlocks() {
  const assets = ensureTranspiledModule();
  try {
    const romModule = await import(pathToFileURL(assets.modulePath).href);
    const rawBlocks =
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      romModule;
    const blocks = normalizeBlocks(rawBlocks);
    if (!blocks || typeof blocks !== 'object' || Object.keys(blocks).length === 0) {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS.');
    }
    return { blocks, assets };
  } catch (error) {
    cleanupTemp(assets);
    throw error;
  }
}

// ============================================================
// MAIN
// ============================================================

const TARGET = 0x09EDC3;
const RETURN_SENTINEL = 0x7FFFFE;
const KNOWN_FUNCS = {
  0x09DD14: 'STAT init',
  0x082BE2: 'OS vector / display',
  0x04C885: 'jump table dispatch',
  0x0846EA: 'FindSym',
  0x09DEE0: 'dispatch table reset',
  0x09E0A1: 'STAT dispatcher path A',
  0x09E0D9: 'STAT dispatcher path B',
};

console.log('='.repeat(80));
console.log(`Phase 280: Trace ${hex(TARGET)} — shared STAT post-init function`);
console.log('='.repeat(80));

// ============================================================
// PART 1: Static disassembly from 0x09EDC3
// ============================================================

console.log('\n' + '='.repeat(80));
console.log('PART 1: Static disassembly from 0x09EDC3 (until RET/JP)');
console.log('='.repeat(80));

const mainDisasm = manualDisasm(TARGET, 512);
for (const entry of mainDisasm) {
  const knownLabel = '';
  console.log(entry.text);
}

const lastEntry = mainDisasm[mainDisasm.length - 1];
const funcEnd = lastEntry.addr;
const funcSize = funcEnd - TARGET + 1;
console.log(`\n  Function boundary: ${hex(TARGET)} - ${hex(funcEnd)} (${funcSize} bytes)`);

// Identify all CALL targets in the disassembly
const callTargets = [];
for (const entry of mainDisasm) {
  const callMatch = entry.text.match(/CALL\s+(0x[0-9A-F]+)/);
  if (callMatch) {
    const addr = parseInt(callMatch[1], 16);
    const label = KNOWN_FUNCS[addr] || '(unknown)';
    callTargets.push({ addr, label, site: entry.addr });
  }
}

if (callTargets.length > 0) {
  console.log('\n  CALL targets found:');
  for (const ct of callTargets) {
    console.log(`    ${hex(ct.site)} -> CALL ${hex(ct.addr)} ${ct.label}`);
  }
}

// ============================================================
// PART 2: Extended disassembly (continue past first RET to find
//         full function including branches)
// ============================================================

console.log('\n' + '='.repeat(80));
console.log('PART 2: Extended region disassembly (0x09EDC3 + 256 bytes)');
console.log('='.repeat(80));

const extLines = disasmFull(TARGET, 256);
for (const l of extLines) console.log(l);

// ============================================================
// PART 3: Callers of 0x09EDC3
// ============================================================

console.log('\n' + '='.repeat(80));
console.log('PART 3: Who calls 0x09EDC3?');
console.log('='.repeat(80));

const callers = findCallersOf(TARGET);
console.log(`\n  Found ${callers.length} direct callers:`);
for (const c of callers) {
  console.log(`    ${hex(c.addr)}: ${c.type} ${hex(TARGET)}`);
}

// ============================================================
// PART 4: Dynamic trace
// ============================================================

console.log('\n' + '='.repeat(80));
console.log('PART 4: Dynamic trace (500 steps from PC=0x09EDC3)');
console.log('='.repeat(80));

let dynamicAssets = null;

try {
  const { blocks, assets } = await loadBlocks();
  dynamicAssets = assets;

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));

  const pBus = createPeripheralBus({ timerInterrupt: false });
  const exec = createExecutor(blocks, mem, { peripherals: pBus });
  const cpu = exec.cpu;

  // Set up CPU state
  cpu.sp = 0xD1987F;
  cpu._ix = 0xD1A860;
  cpu._iy = 0xD1A860;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu.a = 0;
  cpu.f = 0;

  // Set up STAT mode selector
  mem[0xD1A880] = 0x01;

  // Push return sentinel on stack so RET returns to known address
  cpu.sp -= 3;
  write24Mem(mem, cpu.sp, RETURN_SENTINEL);

  // Snapshot RAM before execution to detect writes after
  const ramSnapshotD0 = new Uint8Array(0x10000);
  ramSnapshotD0.set(mem.subarray(0xD00000, 0xD10000));
  const ramSnapshotD1 = new Uint8Array(0x10000);
  ramSnapshotD1.set(mem.subarray(0xD10000, 0xD20000));
  const ramSnapshotD3 = new Uint8Array(0x10000);
  ramSnapshotD3.set(mem.subarray(0xD30000, 0xD40000));

  const blockTrace = [];
  const missingBlocks = [];

  console.log(`\n  Initial state: SP=${hex(cpu.sp)} IX=${hex(cpu._ix)} IY=${hex(cpu._iy)}`);
  console.log(`  Return sentinel at SP: ${hex(RETURN_SENTINEL)}`);

  const result = exec.runFrom(TARGET, 'adl', {
    maxSteps: 500,
    maxLoopIterations: 100,
    onBlock: (pc, mode) => {
      const label = KNOWN_FUNCS[pc] || '';
      blockTrace.push({ pc, mode, label });
    },
    onMissingBlock: (pc, mode, step) => {
      missingBlocks.push({ pc, mode, step });
    },
  });

  console.log(`\n  runFrom result: steps=${result.steps} termination=${result.termination} lastPc=${hex(result.lastPc)}`);

  // Block trace summary
  console.log(`\n  Blocks visited (${blockTrace.length} total):`);
  for (const b of blockTrace) {
    const label = b.label ? ` [${b.label}]` : '';
    console.log(`    ${hex(b.pc)}:${b.mode}${label}`);
  }

  if (missingBlocks.length > 0) {
    console.log(`\n  Missing blocks (${missingBlocks.length}):`);
    for (const mb of missingBlocks) {
      console.log(`    ${hex(mb.pc)}:${mb.mode} at step ${mb.step}`);
    }
  }

  // Unique block PCs
  const uniquePCs = new Set(blockTrace.map(b => b.pc));
  console.log(`\n  Unique block addresses: ${uniquePCs.size}`);

  // Detect RAM writes by comparing snapshots
  const d0Writes = [];
  for (let i = 0; i < 0x10000; i++) {
    if (mem[0xD00000 + i] !== ramSnapshotD0[i]) {
      d0Writes.push({ addr: 0xD00000 + i, before: ramSnapshotD0[i], after: mem[0xD00000 + i] });
    }
  }
  const d1Writes = [];
  for (let i = 0; i < 0x10000; i++) {
    if (mem[0xD10000 + i] !== ramSnapshotD1[i]) {
      d1Writes.push({ addr: 0xD10000 + i, before: ramSnapshotD1[i], after: mem[0xD10000 + i] });
    }
  }
  const d3Writes = [];
  for (let i = 0; i < 0x10000; i++) {
    if (mem[0xD30000 + i] !== ramSnapshotD3[i]) {
      d3Writes.push({ addr: 0xD30000 + i, before: ramSnapshotD3[i], after: mem[0xD30000 + i] });
    }
  }

  if (d0Writes.length > 0) {
    console.log(`\n  D0xxxx RAM writes (${d0Writes.length}):`);
    for (const w of d0Writes.slice(0, 50)) {
      console.log(`    ${hex(w.addr)}: ${hex(w.before, 2)} -> ${hex(w.after, 2)}`);
    }
  }
  if (d1Writes.length > 0) {
    console.log(`\n  D1xxxx RAM writes (${d1Writes.length}):`);
    for (const w of d1Writes.slice(0, 50)) {
      console.log(`    ${hex(w.addr)}: ${hex(w.before, 2)} -> ${hex(w.after, 2)}`);
    }
  }
  if (d3Writes.length > 0) {
    console.log(`\n  D3xxxx RAM writes (${d3Writes.length}):`);
    for (const w of d3Writes.slice(0, 50)) {
      console.log(`    ${hex(w.addr)}: ${hex(w.before, 2)} -> ${hex(w.after, 2)}`);
    }
  }
  if (d0Writes.length === 0 && d1Writes.length === 0 && d3Writes.length === 0) {
    console.log('\n  No RAM writes detected in D0xxxx, D1xxxx, or D3xxxx regions.');
  }

  // Check RAM regions for writes
  console.log('\n  RAM state check (key STAT regions):');

  // Check D1A860-D1A8FF (IY/IX area)
  const iyRegionChanges = [];
  for (let addr = 0xD1A860; addr < 0xD1A900; addr++) {
    const val = mem[addr];
    if (val !== 0 && addr !== 0xD1A880) { // D1A880 was pre-set to 0x01
      iyRegionChanges.push({ addr, val });
    }
  }
  if (iyRegionChanges.length > 0) {
    console.log('  IY region (D1A860-D1A8FF) non-zero bytes:');
    for (const { addr, val } of iyRegionChanges) {
      console.log(`    ${hex(addr)}: ${hex(val, 2)}`);
    }
  } else {
    console.log('  IY region (D1A860-D1A8FF): all zeros (except D1A880=0x01)');
  }

  // Check D0xxxx region
  const d0Changes = [];
  for (let addr = 0xD00000; addr < 0xD0FFFF; addr += 1) {
    const val = mem[addr];
    if (val !== 0) {
      d0Changes.push({ addr, val });
      if (d0Changes.length >= 50) break;
    }
  }
  if (d0Changes.length > 0) {
    console.log(`\n  D0xxxx region non-zero bytes (first ${d0Changes.length}):`);
    for (const { addr, val } of d0Changes) {
      console.log(`    ${hex(addr)}: ${hex(val, 2)}`);
    }
  }

  // Check D1xxxx region (excluding IY area and stack)
  const d1Changes = [];
  for (let addr = 0xD10000; addr < 0xD1A860; addr += 1) {
    const val = mem[addr];
    if (val !== 0) {
      d1Changes.push({ addr, val });
      if (d1Changes.length >= 50) break;
    }
  }
  if (d1Changes.length > 0) {
    console.log(`\n  D1xxxx region non-zero bytes (first ${d1Changes.length}, excluding IY area):`);
    for (const { addr, val } of d1Changes) {
      console.log(`    ${hex(addr)}: ${hex(val, 2)}`);
    }
  }

  // Check D3FFxx region (dispatch table area)
  const d3Changes = [];
  for (let addr = 0xD3F000; addr <= 0xD3FFFF; addr++) {
    const val = mem[addr];
    if (val !== 0) {
      d3Changes.push({ addr, val });
      if (d3Changes.length >= 50) break;
    }
  }
  if (d3Changes.length > 0) {
    console.log(`\n  D3Fxxx region non-zero bytes (first ${d3Changes.length}):`);
    for (const { addr, val } of d3Changes) {
      console.log(`    ${hex(addr)}: ${hex(val, 2)}`);
    }
  } else {
    console.log('\n  D3Fxxx region: all zeros');
  }

  // Final CPU state
  console.log('\n  Final CPU state:');
  console.log(`    PC=${hex(cpu.pc)} SP=${hex(cpu.sp)} A=${hex(cpu.a,2)} F=${hex(cpu.f,2)}`);
  console.log(`    BC=${hex(cpu._bc)} DE=${hex(cpu._de)} HL=${hex(cpu._hl)}`);
  console.log(`    IX=${hex(cpu._ix)} IY=${hex(cpu._iy)}`);

} catch (e) {
  console.log(`\n  Dynamic trace error: ${e.message}`);
  console.log(`  Stack: ${e.stack}`);
} finally {
  cleanupTemp(dynamicAssets);
}

// ============================================================
// PART 5: Cross-reference with known functions
// ============================================================

console.log('\n' + '='.repeat(80));
console.log('PART 5: Cross-reference analysis');
console.log('='.repeat(80));

// Does 0x09EDC3 call any known functions?
console.log('\n  Known function references from 0x09EDC3:');
for (const ct of callTargets) {
  if (KNOWN_FUNCS[ct.addr]) {
    console.log(`    CALLS ${hex(ct.addr)} = ${KNOWN_FUNCS[ct.addr]} (at ${hex(ct.site)})`);
  }
}

// Check if 0x09EDC3 appears as a pointer in ROM tables
console.log('\n  Searching for 0x09EDC3 as raw pointer in ROM:');
const tLo = TARGET & 0xFF;
const tMi = (TARGET >> 8) & 0xFF;
const tHi = (TARGET >> 16) & 0xFF;
let ptrCount = 0;
for (let i = 0; i < Math.min(rom.length - 2, 0x400000); i++) {
  if (rom[i] === tLo && rom[i+1] === tMi && rom[i+2] === tHi) {
    if (i > 0 && [0xCD, 0xC3, 0xC4, 0xCC, 0xD4, 0xDC, 0xC2, 0xCA, 0xD2, 0xDA].includes(rom[i-1])) {
      continue;
    }
    console.log(`    Pointer at ${hex(i)}: context [${hex(rom[Math.max(0,i-2)],2)} ${hex(rom[Math.max(0,i-1)],2)} | ${hex(tLo,2)} ${hex(tMi,2)} ${hex(tHi,2)} | ${hex(rom[i+3],2)} ${hex(rom[i+4],2)}]`);
    ptrCount++;
    if (ptrCount >= 10) break;
  }
}
if (ptrCount === 0) console.log('    No raw pointer references found.');

// Verify it is called after 0x09DD14 in both dispatcher paths
console.log('\n  Verifying 0x09EDC3 is called after 0x09DD14 in both dispatcher paths:');

for (const callerAddr of [0x09E0A1, 0x09E0D9]) {
  console.log(`\n  Dispatcher path containing call site near ${hex(callerAddr)}:`);
  // Disassemble from the CALL 0x09DD14 site for 40 bytes to see what follows
  const postDisasm = disasmFull(callerAddr, 60);
  for (const l of postDisasm) console.log(l);
}

console.log('\n' + '='.repeat(80));
console.log('Phase 280 probe complete.');
console.log('='.repeat(80));
