#!/usr/bin/env node

/**
 * Phase 280: Trace 0x040BE4-0x040C89 — Full STAT Dispatcher
 *
 * Goals:
 *   1. Static disassembly of the full dispatch region 0x040BE4..0x040C89+
 *   2. Dynamic traces with different D1A880 values (0x00, 0x01, 0x02, 0x04, 0x08)
 *      to map which STAT sub-mode each bit dispatches to
 *   3. Summary: D1A880 bit → target address
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const DISPATCH_START = 0x040BE4;
const DISPATCH_END = 0x040C90; // slightly past 0x040C89 for full coverage
const D1A880 = 0xD1A880;      // STAT mode selector byte

const RETURN_SENTINEL = 0x7FFFFE;
const TRACE_STEPS = 200;
const TRACE_LOOP_LIMIT = 512;
const TRACE_LOOKBACK = 16;

const STACK_TOP = 0xD1987F;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD1A860;

const KNOWN_FNS = {
  0x09E0A1: 'STAT_bit1_handler',
  0x09E0D9: 'STAT_bit0_handler',
  0x09DD14: 'STAT_init',
  0x09DD1C: 'STAT_partial_init',
  0x09DEE0: 'dispatch_table_reset',
  0x0846EA: 'FindSym',
  0x08267D: 'VAT_cache_builder',
};

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function formatBytes(bytes) {
  return Array.from(bytes, (v) => hexByte(v)).join(' ');
}

function read24(mem, addr) {
  const base = addr & MEM_MASK;
  return ((mem[base] ?? 0) | ((mem[(base + 1) & MEM_MASK] ?? 0) << 8) | ((mem[(base + 2) & MEM_MASK] ?? 0) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function read24LE(buf, offset) {
  return (buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16)) >>> 0;
}

function knownLabel(addr) {
  return KNOWN_FNS[addr] ? ` ; ${KNOWN_FNS[addr]}` : '';
}

// ============================================================
// Manual disassembler (comprehensive eZ80 ADL subset)
// ============================================================

function manualDisasm(rom, start, length) {
  const lines = [];
  let pc = start;
  const end = start + length;

  while (pc < end) {
    const b = rom[pc];
    let line = '';
    let advance = 1;

    if (b === 0xCD) { const addr = read24LE(rom, pc + 1); line = `CALL ${hex(addr)}${knownLabel(addr)}`; advance = 4; }
    else if (b === 0xC3) { const addr = read24LE(rom, pc + 1); line = `JP ${hex(addr)}${knownLabel(addr)}`; advance = 4; }
    else if (b === 0xC9) { line = 'RET'; }
    else if (b === 0xC0) { line = 'RET NZ'; }
    else if (b === 0xC8) { line = 'RET Z'; }
    else if (b === 0xD0) { line = 'RET NC'; }
    else if (b === 0xD8) { line = 'RET C'; }
    else if (b === 0xE0) { line = 'RET PO'; }
    else if (b === 0xE8) { line = 'RET PE'; }
    else if (b === 0xF0) { line = 'RET P'; }
    else if (b === 0xF8) { line = 'RET M'; }
    else if (b === 0xC4) { const a = read24LE(rom, pc+1); line = `CALL NZ,${hex(a)}${knownLabel(a)}`; advance = 4; }
    else if (b === 0xCC) { const a = read24LE(rom, pc+1); line = `CALL Z,${hex(a)}${knownLabel(a)}`; advance = 4; }
    else if (b === 0xD4) { const a = read24LE(rom, pc+1); line = `CALL NC,${hex(a)}${knownLabel(a)}`; advance = 4; }
    else if (b === 0xDC) { const a = read24LE(rom, pc+1); line = `CALL C,${hex(a)}${knownLabel(a)}`; advance = 4; }
    else if (b === 0xC2) { const a = read24LE(rom, pc+1); line = `JP NZ,${hex(a)}${knownLabel(a)}`; advance = 4; }
    else if (b === 0xCA) { const a = read24LE(rom, pc+1); line = `JP Z,${hex(a)}${knownLabel(a)}`; advance = 4; }
    else if (b === 0xD2) { const a = read24LE(rom, pc+1); line = `JP NC,${hex(a)}${knownLabel(a)}`; advance = 4; }
    else if (b === 0xDA) { const a = read24LE(rom, pc+1); line = `JP C,${hex(a)}${knownLabel(a)}`; advance = 4; }
    else if (b === 0xE2) { const a = read24LE(rom, pc+1); line = `JP PO,${hex(a)}${knownLabel(a)}`; advance = 4; }
    else if (b === 0xEA) { const a = read24LE(rom, pc+1); line = `JP PE,${hex(a)}${knownLabel(a)}`; advance = 4; }
    // JR
    else if (b === 0x18) { const off = rom[pc+1]; const rel = off > 127 ? off - 256 : off; line = `JR ${hex(pc + 2 + rel)} (${rel >= 0 ? '+' : ''}${rel})`; advance = 2; }
    else if (b === 0x20) { const off = rom[pc+1]; const rel = off > 127 ? off - 256 : off; line = `JR NZ,${hex(pc + 2 + rel)} (${rel >= 0 ? '+' : ''}${rel})`; advance = 2; }
    else if (b === 0x28) { const off = rom[pc+1]; const rel = off > 127 ? off - 256 : off; line = `JR Z,${hex(pc + 2 + rel)} (${rel >= 0 ? '+' : ''}${rel})`; advance = 2; }
    else if (b === 0x30) { const off = rom[pc+1]; const rel = off > 127 ? off - 256 : off; line = `JR NC,${hex(pc + 2 + rel)} (${rel >= 0 ? '+' : ''}${rel})`; advance = 2; }
    else if (b === 0x38) { const off = rom[pc+1]; const rel = off > 127 ? off - 256 : off; line = `JR C,${hex(pc + 2 + rel)} (${rel >= 0 ? '+' : ''}${rel})`; advance = 2; }
    // LD r,imm8
    else if (b === 0x3E) { line = `LD A,${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0x06) { line = `LD B,${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0x0E) { line = `LD C,${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0x16) { line = `LD D,${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0x1E) { line = `LD E,${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0x26) { line = `LD H,${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0x2E) { line = `LD L,${hex(rom[pc+1], 2)}`; advance = 2; }
    // LD rr,imm24
    else if (b === 0x01) { line = `LD BC,${hex(read24LE(rom, pc+1))}`; advance = 4; }
    else if (b === 0x11) { line = `LD DE,${hex(read24LE(rom, pc+1))}`; advance = 4; }
    else if (b === 0x21) { line = `LD HL,${hex(read24LE(rom, pc+1))}`; advance = 4; }
    else if (b === 0x31) { line = `LD SP,${hex(read24LE(rom, pc+1))}`; advance = 4; }
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
    else if (b === 0x32) { line = `LD (${hex(read24LE(rom, pc+1))}),A`; advance = 4; }
    else if (b === 0x3A) { line = `LD A,(${hex(read24LE(rom, pc+1))})`; advance = 4; }
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
    else if (b === 0x23) { line = 'INC HL'; }
    else if (b === 0x2B) { line = 'DEC HL'; }
    else if (b === 0x03) { line = 'INC BC'; }
    else if (b === 0x0B) { line = 'DEC BC'; }
    else if (b === 0x13) { line = 'INC DE'; }
    else if (b === 0x1B) { line = 'DEC DE'; }
    else if (b === 0x33) { line = 'INC SP'; }
    else if (b === 0x34) { line = 'INC (HL)'; }
    else if (b === 0x35) { line = 'DEC (HL)'; }
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
    // ADD/SUB/ADC/SBC imm8
    else if (b === 0xC6) { line = `ADD A,${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0xD6) { line = `SUB ${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0xCE) { line = `ADC A,${hex(rom[pc+1], 2)}`; advance = 2; }
    else if (b === 0xDE) { line = `SBC A,${hex(rom[pc+1], 2)}`; advance = 2; }
    // ADD/SUB r
    else if (b === 0x87) { line = 'ADD A,A'; }
    else if (b === 0x80) { line = 'ADD A,B'; }
    else if (b === 0x81) { line = 'ADD A,C'; }
    else if (b === 0x82) { line = 'ADD A,D'; }
    else if (b === 0x83) { line = 'ADD A,E'; }
    else if (b === 0x84) { line = 'ADD A,H'; }
    else if (b === 0x85) { line = 'ADD A,L'; }
    else if (b === 0x90) { line = 'SUB B'; }
    else if (b === 0x91) { line = 'SUB C'; }
    else if (b === 0x97) { line = 'SUB A'; }
    // ADD HL,rr
    else if (b === 0x09) { line = 'ADD HL,BC'; }
    else if (b === 0x19) { line = 'ADD HL,DE'; }
    else if (b === 0x29) { line = 'ADD HL,HL'; }
    else if (b === 0x39) { line = 'ADD HL,SP'; }
    // LD r,r
    else if (b === 0x7F) { line = 'LD A,A'; }
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
    else if (b === 0x40) { line = 'LD B,B'; }
    else if (b === 0x41) { line = 'LD B,C'; }
    else if (b === 0x48) { line = 'LD C,B'; }
    else if (b === 0x49) { line = 'LD C,C'; }
    else if (b === 0x50) { line = 'LD D,B'; }
    else if (b === 0x51) { line = 'LD D,C'; }
    else if (b === 0x52) { line = 'LD D,D'; }
    else if (b === 0x53) { line = 'LD D,E'; }
    else if (b === 0x54) { line = 'LD D,H'; }
    else if (b === 0x55) { line = 'LD D,L'; }
    else if (b === 0x58) { line = 'LD E,B'; }
    else if (b === 0x59) { line = 'LD E,C'; }
    else if (b === 0x5A) { line = 'LD E,D'; }
    else if (b === 0x5B) { line = 'LD E,E'; }
    else if (b === 0x5C) { line = 'LD E,H'; }
    else if (b === 0x5D) { line = 'LD E,L'; }
    else if (b === 0x60) { line = 'LD H,B'; }
    else if (b === 0x61) { line = 'LD H,C'; }
    else if (b === 0x62) { line = 'LD H,D'; }
    else if (b === 0x63) { line = 'LD H,E'; }
    else if (b === 0x64) { line = 'LD H,H'; }
    else if (b === 0x65) { line = 'LD H,L'; }
    else if (b === 0x68) { line = 'LD L,B'; }
    else if (b === 0x69) { line = 'LD L,C'; }
    else if (b === 0x6A) { line = 'LD L,D'; }
    else if (b === 0x6B) { line = 'LD L,E'; }
    else if (b === 0x6C) { line = 'LD L,H'; }
    else if (b === 0x6D) { line = 'LD L,L'; }
    // LD (BC/DE),A  and  LD A,(BC/DE)
    else if (b === 0x02) { line = 'LD (BC),A'; }
    else if (b === 0x12) { line = 'LD (DE),A'; }
    else if (b === 0x0A) { line = 'LD A,(BC)'; }
    else if (b === 0x1A) { line = 'LD A,(DE)'; }
    // LD (nn),HL  / LD HL,(nn) (22/2A are eZ80 ADL forms)
    else if (b === 0x22) { line = `LD (${hex(read24LE(rom, pc+1))}),HL`; advance = 4; }
    else if (b === 0x2A) { line = `LD HL,(${hex(read24LE(rom, pc+1))})`; advance = 4; }
    // NOP
    else if (b === 0x00) { line = 'NOP'; }
    // EX DE,HL
    else if (b === 0xEB) { line = 'EX DE,HL'; }
    // DI/EI
    else if (b === 0xF3) { line = 'DI'; }
    else if (b === 0xFB) { line = 'EI'; }
    // SCF/CCF
    else if (b === 0x37) { line = 'SCF'; }
    else if (b === 0x3F) { line = 'CCF'; }
    // DJNZ
    else if (b === 0x10) { const off = rom[pc+1]; const rel = off > 127 ? off - 256 : off; line = `DJNZ ${hex(pc + 2 + rel)} (${rel >= 0 ? '+' : ''}${rel})`; advance = 2; }
    // RLCA/RRCA/RLA/RRA
    else if (b === 0x07) { line = 'RLCA'; }
    else if (b === 0x0F) { line = 'RRCA'; }
    else if (b === 0x17) { line = 'RLA'; }
    else if (b === 0x1F) { line = 'RRA'; }
    // CPL
    else if (b === 0x2F) { line = 'CPL'; }
    // EX AF,AF'
    else if (b === 0x08) { line = "EX AF,AF'"; }
    // EXX
    else if (b === 0xD9) { line = 'EXX'; }
    // HALT
    else if (b === 0x76) { line = 'HALT'; }
    // LD (imm16+),A (36 in eZ80 = LD (HL+d),n  but just handle as DB if not already caught)
    else if (b === 0x36) { line = `LD (HL),${hex(rom[pc+1], 2)}`; advance = 2; }
    // DD prefix (IX)
    else if (b === 0xDD) {
      const b2 = rom[pc+1];
      if (b2 === 0x21) { line = `LD IX,${hex(read24LE(rom, pc+2))}`; advance = 5; }
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
      if (b2 === 0x21) { line = `LD IY,${hex(read24LE(rom, pc+2))}`; advance = 5; }
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
    // CB prefix (bit ops on registers)
    else if (b === 0xCB) {
      const b2 = rom[pc+1];
      const bit = (b2 >> 3) & 7;
      const reg = ['B','C','D','E','H','L','(HL)','A'][b2 & 7];
      if ((b2 & 0xC0) === 0x40) { line = `BIT ${bit},${reg}`; advance = 2; }
      else if ((b2 & 0xC0) === 0xC0) { line = `SET ${bit},${reg}`; advance = 2; }
      else if ((b2 & 0xC0) === 0x80) { line = `RES ${bit},${reg}`; advance = 2; }
      else {
        // Rotate/shift operations
        const ops = ['RLC','RRC','RL','RR','SLA','SRA','SLL','SRL'];
        const opIdx = (b2 >> 3) & 7;
        line = `${ops[opIdx]} ${reg}`;
        advance = 2;
      }
    }
    // ED prefix
    else if (b === 0xED) {
      const b2 = rom[pc+1];
      if (b2 === 0xB0) { line = 'LDIR'; advance = 2; }
      else if (b2 === 0xB8) { line = 'LDDR'; advance = 2; }
      else if (b2 === 0xA0) { line = 'LDI'; advance = 2; }
      else if (b2 === 0xA8) { line = 'LDD'; advance = 2; }
      else if (b2 === 0x43) { line = `LD (${hex(read24LE(rom, pc+2))}),BC`; advance = 5; }
      else if (b2 === 0x53) { line = `LD (${hex(read24LE(rom, pc+2))}),DE`; advance = 5; }
      else if (b2 === 0x63) { line = `LD (${hex(read24LE(rom, pc+2))}),HL`; advance = 5; }
      else if (b2 === 0x73) { line = `LD (${hex(read24LE(rom, pc+2))}),SP`; advance = 5; }
      else if (b2 === 0x4B) { line = `LD BC,(${hex(read24LE(rom, pc+2))})`; advance = 5; }
      else if (b2 === 0x5B) { line = `LD DE,(${hex(read24LE(rom, pc+2))})`; advance = 5; }
      else if (b2 === 0x6B) { line = `LD HL,(${hex(read24LE(rom, pc+2))})`; advance = 5; }
      else if (b2 === 0x7B) { line = `LD SP,(${hex(read24LE(rom, pc+2))})`; advance = 5; }
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

    const marker = (b === 0xC9) ? ' <--- RET' : '';
    lines.push(`  ${hex(pc)}: ${byteStr} ${line}${marker}`);
    pc += advance;
  }
  return lines;
}

// ============================================================
// Transpiled module loader
// ============================================================

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

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try { fs.unlinkSync(assets.tempModulePath); } catch {}
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((b) => b?.id).map((b) => [b.id, b]));
  }
  return rawBlocks ?? {};
}

async function loadBlocks() {
  const assets = ensureTranspiledModule();
  try {
    const romModule = await import(pathToFileURL(assets.modulePath).href);
    const rawBlocks = romModule.PRELIFTED_BLOCKS ?? romModule.default?.PRELIFTED_BLOCKS ?? romModule.default ?? romModule;
    const blocks = normalizeBlocks(rawBlocks);
    if (!blocks || Object.keys(blocks).length === 0) {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS from transpiled ROM module.');
    }
    return { blocks, assets };
  } catch (error) {
    cleanupTranspiledModule(assets);
    throw error;
  }
}

function findTraceEntry(blocks, pc) {
  for (let delta = 0; delta <= TRACE_LOOKBACK; delta++) {
    const candidate = (pc - delta) & 0xFFFFFF;
    const key = `${candidate.toString(16).padStart(6, '0')}:adl`;
    if (blocks[key]) return { pc: candidate, delta };
  }
  return { pc, delta: null };
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  const rom = fs.readFileSync(ROM_PATH);
  console.log('='.repeat(80));
  console.log('Phase 280: Trace 0x040BE4-0x040C89 — Full STAT Dispatcher');
  console.log('='.repeat(80));
  console.log(`ROM=${ROM_PATH} bytes=${rom.length}`);
  console.log('');

  // ============================================================
  // PART 1: Static disassembly of 0x040BE4 through 0x040C90
  // ============================================================

  console.log('='.repeat(80));
  console.log('PART 1: Static Disassembly (0x040BE4 — 0x040C90)');
  console.log('='.repeat(80));

  const disasmLines = manualDisasm(rom, DISPATCH_START, DISPATCH_END - DISPATCH_START);
  for (const l of disasmLines) console.log(l);
  console.log('');

  // Also disassemble a little before 0x040BE4 for caller context
  console.log('--- Context: 32 bytes before 0x040BE4 ---');
  const beforeLines = manualDisasm(rom, DISPATCH_START - 32, 32);
  for (const l of beforeLines) console.log(l);
  console.log('');

  // ============================================================
  // PART 2: Dynamic traces with different D1A880 values
  // ============================================================

  console.log('='.repeat(80));
  console.log('PART 2: Dynamic Traces — D1A880 bit dispatch mapping');
  console.log('='.repeat(80));
  console.log('');

  const { blocks, assets } = await loadBlocks();

  // We start execution from 0x040BFF where LD A,(D1A880) reloads A
  // for the bit tests. Starting from 0x040BE4 doesn't work because
  // CALL 0x04572C at 0x040BEC is a deep cleanup function that consumes
  // all trace steps. The actual dispatch logic begins at 0x040BFF.
  const BIT_TEST_START = 0x040BFF;

  const testCases = [
    { label: 'D1A880=0x00 (no bits set)', value: 0x00 },
    { label: 'D1A880=0x01 (bit 0)',       value: 0x01 },
    { label: 'D1A880=0x02 (bit 1)',       value: 0x02 },
    { label: 'D1A880=0x04 (bit 2)',       value: 0x04 },
    { label: 'D1A880=0x08 (bit 3)',       value: 0x08 },
    { label: 'D1A880=0x10 (bit 4)',       value: 0x10 },
    { label: 'D1A880=0x03 (bits 0+1)',    value: 0x03 },
    { label: 'D1A880=0x05 (bits 0+2)',    value: 0x05 },
    { label: 'D1A880=0x07 (bits 0+1+2)',  value: 0x07 },
    { label: 'D1A880=0xFF (all bits)',    value: 0xFF },
  ];

  const dispatchMap = [];

  try {
    // Create baseline memory once
    const baseMem = new Uint8Array(MEM_SIZE);
    baseMem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));

    for (const tc of testCases) {
      console.log(`--- ${tc.label} ---`);

      const mem = new Uint8Array(baseMem);
      const executor = createExecutor(blocks, mem, { peripherals: createPeripheralBus({ timerInterrupt: false }) });
      const cpu = executor.cpu;

      // Set up CPU state for dispatch entry at 0x040BFF
      // (after the CALL 0x04572C returns, with SP already reset to D1A87E)
      cpu.halted = false;
      cpu.iff1 = 0;
      cpu.iff2 = 0;
      cpu.im = 0;
      cpu.i = 0;
      cpu.madl = 1;
      cpu.mbase = 0xD0;
      cpu._ix = IX_BASE;
      cpu._iy = IY_BASE;
      cpu.a = 0;
      cpu.f = 0;
      cpu._bc = 0;
      cpu._de = 0;
      cpu._hl = 0;
      // The code at 0x040BFB sets SP=0xD1A87E, so we start with that
      cpu.sp = 0xD1A87E;

      // Push return sentinel onto stack (the dispatcher uses JP not RET
      // for the bit-0 and bit-1 paths, but the fallthrough path may RET)
      write24(mem, cpu.sp - 3, RETURN_SENTINEL);

      // Set the STAT mode selector byte in RAM
      mem[D1A880 & MEM_MASK] = tc.value;

      // Set D0301B to the magic value (done by code before 0x040BFF)
      mem[0xD0301B & MEM_MASK] = 0x5A;
      mem[0xD0301C & MEM_MASK] = 0xA5;
      mem[0xD0301D & MEM_MASK] = 0x5A;

      const traceEntry = findTraceEntry(blocks, BIT_TEST_START);
      console.log(`  Trace entry: requested=${hex(BIT_TEST_START)} actual=${hex(traceEntry.pc)} delta=${traceEntry.delta}`);
      console.log(`  D1A880 = ${hex(tc.value, 2)}`);

      const blockTrace = [];
      let termination = 'unknown';
      const STOP = '__RETURN_SENTINEL__';

      try {
        try {
          const result = executor.runFrom(traceEntry.pc, 'adl', {
            maxSteps: TRACE_STEPS,
            maxLoopIterations: TRACE_LOOP_LIMIT,
            onBlock(pc, mode, _meta, step) {
              blockTrace.push({ step, pc: pc & 0xFFFFFF, mode });
            },
            onDynamicTarget(target, mode, pc, step) {
              blockTrace.push({ step, pc: pc & 0xFFFFFF, mode, dynamic: true, target: target & 0xFFFFFF });
            },
            onMissingBlock(pc) {
              if ((pc & 0xFFFFFF) === RETURN_SENTINEL) throw new Error(STOP);
            },
          });
          termination = result.termination;
        } catch (error) {
          if (error?.message === STOP) termination = 'returned-to-sentinel';
          else termination = `error: ${error?.message ?? error}`;
        }
      } catch (outerError) {
        termination = `outer-error: ${outerError?.message ?? outerError}`;
      }

      console.log(`  Termination: ${termination}`);
      console.log(`  Blocks visited: ${blockTrace.length}`);

      // Print first 40 blocks of the trace
      const showCount = Math.min(40, blockTrace.length);
      for (let i = 0; i < showCount; i++) {
        const b = blockTrace[i];
        const label = KNOWN_FNS[b.pc] ? ` ; ${KNOWN_FNS[b.pc]}` : '';
        const dyn = b.dynamic ? ` -> dynamic ${hex(b.target)}` : '';
        console.log(`    step=${String(b.step).padStart(3)} pc=${hex(b.pc)} ${b.mode}${label}${dyn}`);
      }
      if (blockTrace.length > showCount) console.log(`    ... (${blockTrace.length - showCount} more)`);

      // Identify the first STAT-region jump (0x09xxxx) or the dispatch target
      // after the initial setup call. The bit-test dispatches to 0x09E0D9,
      // 0x09E0A1, or falls through to 0x040C16+.
      // Strategy: find first block in 0x09xxxx region (STAT handlers)
      // or first block after 0x040C10 that's outside the dispatcher
      let firstExternalJump = null;
      for (const b of blockTrace) {
        const region = (b.pc >>> 16) & 0xFF;
        // STAT region handlers
        if (region === 0x09) {
          firstExternalJump = b.pc;
          break;
        }
        // Fallthrough path calls (0x061DEF, 0x05xxxx, etc.)
        if (b.pc >= 0x040C16 && b.pc < 0x040C90) {
          // Still in the dispatcher fallthrough — keep looking
          continue;
        }
        if (region === 0x05 || region === 0x06) {
          firstExternalJump = b.pc;
          break;
        }
      }

      if (firstExternalJump !== null) {
        console.log(`  => First external jump: ${hex(firstExternalJump)}${knownLabel(firstExternalJump)}`);
        dispatchMap.push({ value: tc.value, label: tc.label, target: firstExternalJump });
      } else {
        console.log(`  => No external jump detected (stayed within dispatcher)`);
        dispatchMap.push({ value: tc.value, label: tc.label, target: null });
      }

      console.log('');
    }
  } finally {
    cleanupTranspiledModule(assets);
  }

  // ============================================================
  // PART 3: Summary — D1A880 bit → dispatch target
  // ============================================================

  console.log('='.repeat(80));
  console.log('PART 3: SUMMARY — STAT Dispatch Map');
  console.log('='.repeat(80));
  console.log('');
  console.log('  D1A880 value  | Description       | Dispatch target');
  console.log('  --------------|-------------------|------------------');
  for (const entry of dispatchMap) {
    const targetStr = entry.target !== null ? `${hex(entry.target)}${knownLabel(entry.target)}` : '(no external jump)';
    console.log(`  ${hex(entry.value, 2).padEnd(14)} | ${entry.label.padEnd(17)} | ${targetStr}`);
  }
  console.log('');

  // Group by unique targets
  const targetGroups = new Map();
  for (const entry of dispatchMap) {
    const key = entry.target ?? 'none';
    if (!targetGroups.has(key)) targetGroups.set(key, []);
    targetGroups.get(key).push(entry);
  }

  console.log('  Unique dispatch targets:');
  for (const [target, entries] of targetGroups) {
    const values = entries.map(e => hex(e.value, 2)).join(', ');
    const targetStr = target !== 'none' ? `${hex(target)}${knownLabel(target)}` : '(no external jump)';
    console.log(`    ${targetStr} <- D1A880 values: ${values}`);
  }

  console.log('');
  console.log('='.repeat(80));
  console.log('Phase 280 probe complete.');
  console.log('='.repeat(80));
}

await main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
