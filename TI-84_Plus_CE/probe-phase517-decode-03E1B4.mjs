#!/usr/bin/env node
// probe-phase517-decode-03E1B4.mjs
// Static disassembly + dynamic trace of 0x03E1B4 — token processor
// Called from 0x061DB2 (longjmp common handler) after token byte stored in D008DF
import { readFileSync } from 'fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

// ── Known addresses ──
const KNOWN = {
  0x03E1B4: 'TOKEN_PROCESSOR (THIS TARGET)',
  0x061D1A: 'CLEAR_action_unhandled_key',
  0x061DB2: 'longjmp_common_handler',
  0x099921: 'event_loop_command_dispatcher',
  0x099BB0: 'range_dispatcher_1',
  0x09AF4E: 'range_dispatcher_2',
  0x09AF6F: 'CPIR_key_to_token_table',
  0x044DB3: 'home_screen_populator',
  0x07CFA7: 'standard_text_renderer',
  0x07C8B7: 'BCD_position_calculator',
  0x0A1799: 'glyph_rasterizer',
  0x07D1B4: 'descriptor_list_walker',
  0x07D233: 'descriptor_filter_router',
  0x07DF6A: 'BCD_formatter',
  0x07FE9C: 'type_rewriter',
  0x0B9032: 'string_renderer',
  0x0685DF: 'sign_handler',
  0x099F49: 'CLEAR_handler',
  0x099F68: 'minus_handler',
  0x0B3540: 'mathprint_mode_guard',
};

function annotate(addr) {
  return KNOWN[addr] ? '  ; -> ' + KNOWN[addr] : '';
}

// ── eZ80 disassembler (inline, same pattern as phase516) ──
const R8 = ['B','C','D','E','H','L','(HL)','A'];
const CC_NAMES = ['NZ','Z','NC','C','PO','PE','P','M'];
const R16 = ['BC','DE','HL','SP'];
const R16AF = ['BC','DE','HL','AF'];

function rd(offset) { return rom[offset]; }
function rd16(offset) { return rom[offset] | (rom[offset+1] << 8); }
function rd24(offset) { return rom[offset] | (rom[offset+1] << 8) | (rom[offset+2] << 16); }
function signed8(v) { return v >= 128 ? v - 256 : v; }
function hex(v, w) { return '0x' + v.toString(16).toUpperCase().padStart(w || 2, '0'); }
function hexBytes(start, len) {
  let s = '';
  for (let i = 0; i < len; i++) s += rom[start+i].toString(16).toUpperCase().padStart(2,'0') + ' ';
  return s.trimEnd();
}

function emit(addr, len, mnemonic) {
  const hx = hexBytes(addr, len).padEnd(20);
  console.log(hex(addr,6) + ': ' + hx + ' ' + mnemonic);
}

function disassemble(startAddr, maxBytes, label, stopOnRet) {
  let pc = startAddr;
  const endAddr = startAddr + maxBytes;
  let instrCount = 0;
  const allTargets = [];
  const ramRefs = [];
  const condBranches = [];
  let retCount = 0;
  stopOnRet = stopOnRet || 0;

  console.log('=== Disassembly of ' + label + ' at ' + hex(startAddr,6) + ' (' + maxBytes + ' bytes max) ===\n');

  while (pc < endAddr && instrCount < 500) {
    const addr = pc;
    const b0 = rd(pc);

    // eZ80 suffix prefixes
    if (b0 === 0x40 || b0 === 0x49 || b0 === 0x52 || b0 === 0x5B) {
      const suffixes = {0x40: '.SIS', 0x49: '.LIS', 0x52: '.SIL', 0x5B: '.LIL'};
      const suffix = suffixes[b0];
      emit(addr, 1, 'PREFIX ' + suffix);
      pc += 1; instrCount++; continue;
    }

    // DD prefix (IX)
    if (b0 === 0xDD) {
      const b1 = rd(pc+1);
      if (b1 === 0xCB) {
        const d = rd(pc+2); const op = rd(pc+3); const bit = (op >> 3) & 7;
        if ((op & 0xC7) === 0x46) { emit(addr, 4, 'BIT ' + bit + ',(IX+' + hex(d) + ')'); pc += 4; instrCount++; continue; }
        if ((op & 0xC7) === 0xC6) { emit(addr, 4, 'SET ' + bit + ',(IX+' + hex(d) + ')'); pc += 4; instrCount++; continue; }
        if ((op & 0xC7) === 0x86) { emit(addr, 4, 'RES ' + bit + ',(IX+' + hex(d) + ')'); pc += 4; instrCount++; continue; }
        emit(addr, 4, 'DD CB ' + hex(d) + ' ' + hex(op) + ' ; ???'); pc += 4; instrCount++; continue;
      }
      if (b1 === 0x21) { const nn = rd24(pc+2); emit(addr, 5, 'LD IX,' + hex(nn,6)); pc += 5; instrCount++; continue; }
      if (b1 === 0xE5) { emit(addr, 2, 'PUSH IX'); pc += 2; instrCount++; continue; }
      if (b1 === 0xE1) { emit(addr, 2, 'POP IX'); pc += 2; instrCount++; continue; }
      if ((b1 & 0xC7) === 0x46) { const r = (b1 >> 3) & 7; const d = rd(pc+2); emit(addr, 3, 'LD ' + R8[r] + ',(IX+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if ((b1 & 0xF8) === 0x70) { const r = b1 & 7; const d = rd(pc+2); emit(addr, 3, 'LD (IX+' + hex(d) + '),' + R8[r]); pc += 3; instrCount++; continue; }
      if (b1 === 0x36) { const d = rd(pc+2); const n = rd(pc+3); emit(addr, 4, 'LD (IX+' + hex(d) + '),' + hex(n)); pc += 4; instrCount++; continue; }
      if (b1 === 0x23) { emit(addr, 2, 'INC IX'); pc += 2; instrCount++; continue; }
      if (b1 === 0x2B) { emit(addr, 2, 'DEC IX'); pc += 2; instrCount++; continue; }
      if (b1 === 0x09) { emit(addr, 2, 'ADD IX,BC'); pc += 2; instrCount++; continue; }
      if (b1 === 0x19) { emit(addr, 2, 'ADD IX,DE'); pc += 2; instrCount++; continue; }
      if (b1 === 0x29) { emit(addr, 2, 'ADD IX,IX'); pc += 2; instrCount++; continue; }
      if (b1 === 0x39) { emit(addr, 2, 'ADD IX,SP'); pc += 2; instrCount++; continue; }
      if (b1 === 0xE9) { emit(addr, 2, 'JP (IX)'); pc += 2; instrCount++; continue; }
      if (b1 === 0xBE) { const d = rd(pc+2); emit(addr, 3, 'CP (IX+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0xB6) { const d = rd(pc+2); emit(addr, 3, 'OR (IX+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0xA6) { const d = rd(pc+2); emit(addr, 3, 'AND (IX+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0xAE) { const d = rd(pc+2); emit(addr, 3, 'XOR (IX+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0x86) { const d = rd(pc+2); emit(addr, 3, 'ADD A,(IX+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0x8E) { const d = rd(pc+2); emit(addr, 3, 'ADC A,(IX+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0x96) { const d = rd(pc+2); emit(addr, 3, 'SUB (IX+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0x9E) { const d = rd(pc+2); emit(addr, 3, 'SBC A,(IX+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0x34) { const d = rd(pc+2); emit(addr, 3, 'INC (IX+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0x35) { const d = rd(pc+2); emit(addr, 3, 'DEC (IX+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0xF9) { emit(addr, 2, 'LD SP,IX'); pc += 2; instrCount++; continue; }
      if (b1 === 0x22) { const nn = rd24(pc+2); emit(addr, 5, 'LD (' + hex(nn,6) + '),IX'); pc += 5; instrCount++; continue; }
      if (b1 === 0x2A) { const nn = rd24(pc+2); emit(addr, 5, 'LD IX,(' + hex(nn,6) + ')'); pc += 5; instrCount++; continue; }
      emit(addr, 2, 'DD ' + hex(b1) + ' ; unhandled IX prefix'); pc += 2; instrCount++; continue;
    }

    // FD prefix (IY)
    if (b0 === 0xFD) {
      const b1 = rd(pc+1);
      if (b1 === 0xCB) {
        const d = rd(pc+2); const op = rd(pc+3); const bit = (op >> 3) & 7;
        if ((op & 0xC7) === 0x46) { emit(addr, 4, 'BIT ' + bit + ',(IY+' + hex(d) + ')'); pc += 4; instrCount++; continue; }
        if ((op & 0xC7) === 0xC6) { emit(addr, 4, 'SET ' + bit + ',(IY+' + hex(d) + ')'); pc += 4; instrCount++; continue; }
        if ((op & 0xC7) === 0x86) { emit(addr, 4, 'RES ' + bit + ',(IY+' + hex(d) + ')'); pc += 4; instrCount++; continue; }
        emit(addr, 4, 'FD CB ' + hex(d) + ' ' + hex(op) + ' ; ???'); pc += 4; instrCount++; continue;
      }
      if (b1 === 0x21) { const nn = rd24(pc+2); emit(addr, 5, 'LD IY,' + hex(nn,6)); pc += 5; instrCount++; continue; }
      if (b1 === 0xE5) { emit(addr, 2, 'PUSH IY'); pc += 2; instrCount++; continue; }
      if (b1 === 0xE1) { emit(addr, 2, 'POP IY'); pc += 2; instrCount++; continue; }
      if ((b1 & 0xC7) === 0x46) { const r = (b1 >> 3) & 7; const d = rd(pc+2); emit(addr, 3, 'LD ' + R8[r] + ',(IY+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if ((b1 & 0xF8) === 0x70) { const r = b1 & 7; const d = rd(pc+2); emit(addr, 3, 'LD (IY+' + hex(d) + '),' + R8[r]); pc += 3; instrCount++; continue; }
      if (b1 === 0x36) { const d = rd(pc+2); const n = rd(pc+3); emit(addr, 4, 'LD (IY+' + hex(d) + '),' + hex(n)); pc += 4; instrCount++; continue; }
      if (b1 === 0x23) { emit(addr, 2, 'INC IY'); pc += 2; instrCount++; continue; }
      if (b1 === 0x2B) { emit(addr, 2, 'DEC IY'); pc += 2; instrCount++; continue; }
      if (b1 === 0x09) { emit(addr, 2, 'ADD IY,BC'); pc += 2; instrCount++; continue; }
      if (b1 === 0x19) { emit(addr, 2, 'ADD IY,DE'); pc += 2; instrCount++; continue; }
      if (b1 === 0x29) { emit(addr, 2, 'ADD IY,IY'); pc += 2; instrCount++; continue; }
      if (b1 === 0x39) { emit(addr, 2, 'ADD IY,SP'); pc += 2; instrCount++; continue; }
      if (b1 === 0xE9) { emit(addr, 2, 'JP (IY)'); pc += 2; instrCount++; continue; }
      if (b1 === 0xBE) { const d = rd(pc+2); emit(addr, 3, 'CP (IY+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0xB6) { const d = rd(pc+2); emit(addr, 3, 'OR (IY+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0xA6) { const d = rd(pc+2); emit(addr, 3, 'AND (IY+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0xAE) { const d = rd(pc+2); emit(addr, 3, 'XOR (IY+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0x86) { const d = rd(pc+2); emit(addr, 3, 'ADD A,(IY+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0x96) { const d = rd(pc+2); emit(addr, 3, 'SUB (IY+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0x34) { const d = rd(pc+2); emit(addr, 3, 'INC (IY+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0x35) { const d = rd(pc+2); emit(addr, 3, 'DEC (IY+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0xF9) { emit(addr, 2, 'LD SP,IY'); pc += 2; instrCount++; continue; }
      if (b1 === 0x22) { const nn = rd24(pc+2); emit(addr, 5, 'LD (' + hex(nn,6) + '),IY'); pc += 5; instrCount++; continue; }
      if (b1 === 0x2A) { const nn = rd24(pc+2); emit(addr, 5, 'LD IY,(' + hex(nn,6) + ')'); pc += 5; instrCount++; continue; }
      emit(addr, 2, 'FD ' + hex(b1) + ' ; unhandled IY prefix'); pc += 2; instrCount++; continue;
    }

    // CB prefix - bit/shift ops
    if (b0 === 0xCB) {
      const b1 = rd(pc+1);
      if ((b1 & 0xC0) === 0x00) {
        const ops = ['RLC','RRC','RL','RR','SLA','SRA','SLL','SRL'];
        emit(addr, 2, ops[(b1>>3)&7] + ' ' + R8[b1&7]); pc += 2; instrCount++; continue;
      }
      if ((b1 & 0xC0) === 0x40) { emit(addr, 2, 'BIT ' + ((b1>>3)&7) + ',' + R8[b1&7]); pc += 2; instrCount++; continue; }
      if ((b1 & 0xC0) === 0x80) { emit(addr, 2, 'RES ' + ((b1>>3)&7) + ',' + R8[b1&7]); pc += 2; instrCount++; continue; }
      if ((b1 & 0xC0) === 0xC0) { emit(addr, 2, 'SET ' + ((b1>>3)&7) + ',' + R8[b1&7]); pc += 2; instrCount++; continue; }
    }

    // ED prefix
    if (b0 === 0xED) {
      const b1 = rd(pc+1);
      if (b1 === 0xB0) { emit(addr, 2, 'LDIR'); pc += 2; instrCount++; continue; }
      if (b1 === 0xB8) { emit(addr, 2, 'LDDR'); pc += 2; instrCount++; continue; }
      if (b1 === 0xB1) { emit(addr, 2, 'CPIR'); pc += 2; instrCount++; continue; }
      if (b1 === 0xB9) { emit(addr, 2, 'CPDR'); pc += 2; instrCount++; continue; }
      if (b1 === 0xA0) { emit(addr, 2, 'LDI'); pc += 2; instrCount++; continue; }
      if (b1 === 0xA1) { emit(addr, 2, 'CPI'); pc += 2; instrCount++; continue; }
      if (b1 === 0x46) { emit(addr, 2, 'IM 0'); pc += 2; instrCount++; continue; }
      if (b1 === 0x56) { emit(addr, 2, 'IM 1'); pc += 2; instrCount++; continue; }
      if (b1 === 0x5E) { emit(addr, 2, 'IM 2'); pc += 2; instrCount++; continue; }
      if (b1 === 0x47) { emit(addr, 2, 'LD I,A'); pc += 2; instrCount++; continue; }
      if (b1 === 0x57) { emit(addr, 2, 'LD A,I'); pc += 2; instrCount++; continue; }
      if (b1 === 0x4F) { emit(addr, 2, 'LD R,A'); pc += 2; instrCount++; continue; }
      if (b1 === 0x5F) { emit(addr, 2, 'LD A,R'); pc += 2; instrCount++; continue; }
      if (b1 === 0x27) { emit(addr, 2, 'LD HL,(HL)  ; eZ80 ED27'); pc += 2; instrCount++; continue; }
      if ((b1 & 0xC7) === 0x40) { emit(addr, 2, 'IN ' + R8[(b1>>3)&7] + ',(C)'); pc += 2; instrCount++; continue; }
      if ((b1 & 0xC7) === 0x41) { emit(addr, 2, 'OUT (C),' + R8[(b1>>3)&7]); pc += 2; instrCount++; continue; }
      if ((b1 & 0xCF) === 0x42) { emit(addr, 2, 'SBC HL,' + R16[(b1>>4)&3]); pc += 2; instrCount++; continue; }
      if ((b1 & 0xCF) === 0x4A) { emit(addr, 2, 'ADC HL,' + R16[(b1>>4)&3]); pc += 2; instrCount++; continue; }
      if ((b1 & 0xCF) === 0x43) { const nn = rd24(pc+2); emit(addr, 5, 'LD (' + hex(nn,6) + '),' + R16[(b1>>4)&3]); pc += 5; instrCount++; continue; }
      if ((b1 & 0xCF) === 0x4B) { const nn = rd24(pc+2); emit(addr, 5, 'LD ' + R16[(b1>>4)&3] + ',(' + hex(nn,6) + ')'); pc += 5; instrCount++; continue; }
      if (b1 === 0x44) { emit(addr, 2, 'NEG'); pc += 2; instrCount++; continue; }
      if (b1 === 0x4D) { emit(addr, 2, 'RETI'); pc += 2; instrCount++; continue; }
      if (b1 === 0x45) { emit(addr, 2, 'RETN'); pc += 2; instrCount++; continue; }
      if (b1 === 0x67) { emit(addr, 2, 'RRD'); pc += 2; instrCount++; continue; }
      if (b1 === 0x6F) { emit(addr, 2, 'RLD'); pc += 2; instrCount++; continue; }
      if ((b1 & 0xCF) === 0x4C) { emit(addr, 2, 'MLT ' + R16[(b1>>4)&3]); pc += 2; instrCount++; continue; }
      if (b1 === 0x32) { const d = signed8(rd(pc+2)); emit(addr, 3, 'LEA IX,IX+' + d); pc += 3; instrCount++; continue; }
      if (b1 === 0x33) { const d = signed8(rd(pc+2)); emit(addr, 3, 'LEA IY,IY+' + d); pc += 3; instrCount++; continue; }
      if (b1 === 0x02) { const d = signed8(rd(pc+2)); emit(addr, 3, 'LEA BC,IX+' + d); pc += 3; instrCount++; continue; }
      if (b1 === 0x12) { const d = signed8(rd(pc+2)); emit(addr, 3, 'LEA DE,IX+' + d); pc += 3; instrCount++; continue; }
      if (b1 === 0x22) { const d = signed8(rd(pc+2)); emit(addr, 3, 'LEA HL,IX+' + d); pc += 3; instrCount++; continue; }
      if (b1 === 0x03) { const d = signed8(rd(pc+2)); emit(addr, 3, 'LEA BC,IY+' + d); pc += 3; instrCount++; continue; }
      if (b1 === 0x13) { const d = signed8(rd(pc+2)); emit(addr, 3, 'LEA DE,IY+' + d); pc += 3; instrCount++; continue; }
      if (b1 === 0x23) { const d = signed8(rd(pc+2)); emit(addr, 3, 'LEA HL,IY+' + d); pc += 3; instrCount++; continue; }
      if ((b1 & 0xC7) === 0x04 && b1 !== 0x44) { emit(addr, 2, 'TST A,' + R8[(b1>>3)&7]); pc += 2; instrCount++; continue; }
      emit(addr, 2, 'ED ' + hex(b1) + ' ; unhandled ED prefix'); pc += 2; instrCount++; continue;
    }

    // Single-byte
    if (b0 === 0x00) { emit(addr, 1, 'NOP'); pc += 1; instrCount++; continue; }
    if (b0 === 0x76) { emit(addr, 1, 'HALT'); pc += 1; instrCount++; continue; }
    if (b0 === 0xC9) {
      emit(addr, 1, 'RET');
      pc += 1; instrCount++; retCount++;
      console.log('  --- RET #' + retCount + ' at ' + hex(addr,6) + ' ---');
      if (stopOnRet && retCount >= stopOnRet) break;
      continue;
    }
    if (b0 === 0xF3) { emit(addr, 1, 'DI'); pc += 1; instrCount++; continue; }
    if (b0 === 0xFB) { emit(addr, 1, 'EI'); pc += 1; instrCount++; continue; }
    if (b0 === 0x37) { emit(addr, 1, 'SCF'); pc += 1; instrCount++; continue; }
    if (b0 === 0x3F) { emit(addr, 1, 'CCF'); pc += 1; instrCount++; continue; }
    if (b0 === 0x2F) { emit(addr, 1, 'CPL'); pc += 1; instrCount++; continue; }
    if (b0 === 0x27) { emit(addr, 1, 'DAA'); pc += 1; instrCount++; continue; }
    if (b0 === 0x07) { emit(addr, 1, 'RLCA'); pc += 1; instrCount++; continue; }
    if (b0 === 0x0F) { emit(addr, 1, 'RRCA'); pc += 1; instrCount++; continue; }
    if (b0 === 0x17) { emit(addr, 1, 'RLA'); pc += 1; instrCount++; continue; }
    if (b0 === 0x1F) { emit(addr, 1, 'RRA'); pc += 1; instrCount++; continue; }
    if (b0 === 0xD9) { emit(addr, 1, 'EXX'); pc += 1; instrCount++; continue; }
    if (b0 === 0x08) { emit(addr, 1, 'EX AF,AF\''); pc += 1; instrCount++; continue; }
    if (b0 === 0xEB) { emit(addr, 1, 'EX DE,HL'); pc += 1; instrCount++; continue; }
    if (b0 === 0xE3) { emit(addr, 1, 'EX (SP),HL'); pc += 1; instrCount++; continue; }
    if (b0 === 0xE9) { emit(addr, 1, 'JP (HL)'); pc += 1; instrCount++; continue; }
    if (b0 === 0xF9) { emit(addr, 1, 'LD SP,HL'); pc += 1; instrCount++; continue; }

    // RET cc
    if ((b0 & 0xC7) === 0xC0) {
      const cc = (b0 >> 3) & 7;
      const mn = 'RET ' + CC_NAMES[cc];
      emit(addr, 1, mn);
      condBranches.push({ addr, mnemonic: mn });
      pc += 1; instrCount++; continue;
    }

    // CALL nn
    if (b0 === 0xCD) {
      const nn = rd24(pc+1);
      allTargets.push({addr, type: 'CALL', target: nn});
      if (nn >= 0xD00000) ramRefs.push({addr, type: 'CALL', target: nn});
      emit(addr, 4, 'CALL ' + hex(nn,6) + annotate(nn));
      pc += 4; instrCount++; continue;
    }

    // CALL cc,nn
    if ((b0 & 0xC7) === 0xC4) {
      const cc = (b0 >> 3) & 7;
      const nn = rd24(pc+1);
      const mn = 'CALL ' + CC_NAMES[cc];
      allTargets.push({addr, type: mn, target: nn});
      condBranches.push({ addr, mnemonic: mn + ',' + hex(nn,6) });
      emit(addr, 4, mn + ',' + hex(nn,6) + annotate(nn));
      pc += 4; instrCount++; continue;
    }

    // JP nn
    if (b0 === 0xC3) {
      const nn = rd24(pc+1);
      allTargets.push({addr, type: 'JP', target: nn});
      if (nn >= 0xD00000) ramRefs.push({addr, type: 'JP', target: nn});
      emit(addr, 4, 'JP ' + hex(nn,6) + annotate(nn));
      pc += 4; instrCount++; continue;
    }

    // JP cc,nn
    if ((b0 & 0xC7) === 0xC2) {
      const cc = (b0 >> 3) & 7;
      const nn = rd24(pc+1);
      const mn = 'JP ' + CC_NAMES[cc];
      allTargets.push({addr, type: mn, target: nn});
      condBranches.push({ addr, mnemonic: mn + ',' + hex(nn,6) });
      emit(addr, 4, mn + ',' + hex(nn,6) + annotate(nn));
      pc += 4; instrCount++; continue;
    }

    // JR e
    if (b0 === 0x18) {
      const e = signed8(rd(pc+1));
      const target = pc + 2 + e;
      allTargets.push({addr, type: 'JR', target});
      emit(addr, 2, 'JR ' + hex(target,6) + ' (offset ' + (e >= 0 ? '+' : '') + e + ')');
      pc += 2; instrCount++; continue;
    }

    // JR cc,e
    if (b0 === 0x20 || b0 === 0x28 || b0 === 0x30 || b0 === 0x38) {
      const ccIdx = (b0 >> 3) & 3;
      const ccN = ['NZ','Z','NC','C'];
      const e = signed8(rd(pc+1));
      const target = pc + 2 + e;
      const mn = 'JR ' + ccN[ccIdx];
      allTargets.push({addr, type: mn, target});
      condBranches.push({ addr, mnemonic: mn + ',' + hex(target,6) });
      emit(addr, 2, mn + ',' + hex(target,6) + ' (offset ' + (e >= 0 ? '+' : '') + e + ')');
      pc += 2; instrCount++; continue;
    }

    // DJNZ e
    if (b0 === 0x10) {
      const e = signed8(rd(pc+1));
      const target = pc + 2 + e;
      allTargets.push({addr, type: 'DJNZ', target});
      condBranches.push({ addr, mnemonic: 'DJNZ ' + hex(target,6) });
      emit(addr, 2, 'DJNZ ' + hex(target,6) + ' (offset ' + (e >= 0 ? '+' : '') + e + ')');
      pc += 2; instrCount++; continue;
    }

    // RST n
    if ((b0 & 0xC7) === 0xC7) {
      const n = b0 & 0x38;
      allTargets.push({addr, type: 'RST', target: n});
      emit(addr, 1, 'RST ' + hex(n));
      pc += 1; instrCount++; continue;
    }

    // LD r,r
    if ((b0 & 0xC0) === 0x40) {
      const dst = (b0 >> 3) & 7;
      const src = b0 & 7;
      emit(addr, 1, 'LD ' + R8[dst] + ',' + R8[src]);
      pc += 1; instrCount++; continue;
    }

    // ALU A,r
    if ((b0 & 0xC0) === 0x80) {
      const ops = ['ADD A,','ADC A,','SUB ','SBC A,','AND ','XOR ','OR ','CP '];
      emit(addr, 1, ops[(b0>>3)&7] + R8[b0&7]);
      pc += 1; instrCount++; continue;
    }

    // LD r,n
    if ((b0 & 0xC7) === 0x06) {
      const r = (b0 >> 3) & 7;
      const n = rd(pc+1);
      emit(addr, 2, 'LD ' + R8[r] + ',' + hex(n));
      pc += 2; instrCount++; continue;
    }

    // ALU A,n
    if ((b0 & 0xC7) === 0xC6) {
      const ops = ['ADD A,','ADC A,','SUB ','SBC A,','AND ','XOR ','OR ','CP '];
      const n = rd(pc+1);
      emit(addr, 2, ops[(b0>>3)&7] + hex(n));
      pc += 2; instrCount++; continue;
    }

    // LD rr,nn
    if ((b0 & 0xCF) === 0x01) {
      const rr = (b0 >> 4) & 3;
      const nn = rd24(pc+1);
      emit(addr, 4, 'LD ' + R16[rr] + ',' + hex(nn,6));
      if (nn >= 0xD00000) ramRefs.push({addr, type: 'LD', target: nn});
      pc += 4; instrCount++; continue;
    }

    // INC/DEC rr
    if ((b0 & 0xCF) === 0x03) { emit(addr, 1, 'INC ' + R16[(b0>>4)&3]); pc += 1; instrCount++; continue; }
    if ((b0 & 0xCF) === 0x0B) { emit(addr, 1, 'DEC ' + R16[(b0>>4)&3]); pc += 1; instrCount++; continue; }
    // INC/DEC r
    if ((b0 & 0xC7) === 0x04) { emit(addr, 1, 'INC ' + R8[(b0>>3)&7]); pc += 1; instrCount++; continue; }
    if ((b0 & 0xC7) === 0x05) { emit(addr, 1, 'DEC ' + R8[(b0>>3)&7]); pc += 1; instrCount++; continue; }
    // PUSH/POP rr
    if ((b0 & 0xCF) === 0xC5) { emit(addr, 1, 'PUSH ' + R16AF[(b0>>4)&3]); pc += 1; instrCount++; continue; }
    if ((b0 & 0xCF) === 0xC1) { emit(addr, 1, 'POP ' + R16AF[(b0>>4)&3]); pc += 1; instrCount++; continue; }
    // ADD HL,rr
    if ((b0 & 0xCF) === 0x09) { emit(addr, 1, 'ADD HL,' + R16[(b0>>4)&3]); pc += 1; instrCount++; continue; }

    if (b0 === 0x0A) { emit(addr, 1, 'LD A,(BC)'); pc += 1; instrCount++; continue; }
    if (b0 === 0x1A) { emit(addr, 1, 'LD A,(DE)'); pc += 1; instrCount++; continue; }
    if (b0 === 0x02) { emit(addr, 1, 'LD (BC),A'); pc += 1; instrCount++; continue; }
    if (b0 === 0x12) { emit(addr, 1, 'LD (DE),A'); pc += 1; instrCount++; continue; }

    if (b0 === 0x3A) { const nn = rd24(pc+1); emit(addr, 4, 'LD A,(' + hex(nn,6) + ')'); if (nn >= 0xD00000) ramRefs.push({addr, type: 'LD A,()', target: nn}); pc += 4; instrCount++; continue; }
    if (b0 === 0x32) { const nn = rd24(pc+1); emit(addr, 4, 'LD (' + hex(nn,6) + '),A'); if (nn >= 0xD00000) ramRefs.push({addr, type: 'LD (),A', target: nn}); pc += 4; instrCount++; continue; }
    if (b0 === 0x2A) { const nn = rd24(pc+1); emit(addr, 4, 'LD HL,(' + hex(nn,6) + ')'); if (nn >= 0xD00000) ramRefs.push({addr, type: 'LD HL,()', target: nn}); pc += 4; instrCount++; continue; }
    if (b0 === 0x22) { const nn = rd24(pc+1); emit(addr, 4, 'LD (' + hex(nn,6) + '),HL'); if (nn >= 0xD00000) ramRefs.push({addr, type: 'LD (),HL', target: nn}); pc += 4; instrCount++; continue; }

    if (b0 === 0xD3) { const n = rd(pc+1); emit(addr, 2, 'OUT (' + hex(n) + '),A'); pc += 2; instrCount++; continue; }
    if (b0 === 0xDB) { const n = rd(pc+1); emit(addr, 2, 'IN A,(' + hex(n) + ')'); pc += 2; instrCount++; continue; }

    // Fallthrough
    emit(addr, 1, 'DB ' + hex(b0) + ' ; unknown opcode');
    pc += 1; instrCount++;
  }

  if (pc >= endAddr && (!stopOnRet || retCount < stopOnRet)) {
    console.log('\n--- Reached ' + maxBytes + '-byte limit ---');
  }

  console.log('\n=== ' + instrCount + ' instructions decoded, ' + (pc - startAddr) + ' bytes ===');

  // CALL/JP targets summary
  console.log('\n=== CALL/JP targets summary ===');
  const seen = new Map();
  for (const t of allTargets) {
    const key = t.type + ' ' + hex(t.target,6);
    if (!seen.has(key)) seen.set(key, []);
    seen.get(key).push(hex(t.addr,6));
  }
  for (const [key, addrs] of [...seen.entries()].sort()) {
    const target = parseInt(key.split(' ').pop().substring(2), 16);
    console.log('  ' + key + ' from [' + addrs.join(', ') + ']' + annotate(target));
  }

  // RAM references summary
  if (ramRefs.length > 0) {
    console.log('\n=== RAM address references ===');
    for (const r of ramRefs) {
      console.log('  ' + hex(r.addr,6) + ': ' + r.type + ' ' + hex(r.target,6));
    }
  }

  // Conditional branches summary
  if (condBranches.length > 0) {
    console.log('\n=== Conditional branches ===');
    for (const c of condBranches) {
      console.log('  ' + hex(c.addr,6) + ': ' + c.mnemonic);
    }
  }

  console.log('');
  return { instrCount, bytes: pc - startAddr, targets: allTargets, ramRefs, condBranches };
}


// ══════════════════════════════════════════════════════════════
//  PART 1: Static disassembly of 0x03E1B4
// ══════════════════════════════════════════════════════════════

console.log('================================================================');
console.log('  DECODE 0x03E1B4: Token Processor');
console.log('  Called from 0x061DB2 (longjmp common handler)');
console.log('  Token byte pre-stored in D008DF');
console.log('================================================================\n');

// Primary: 300 bytes, stop after 4 RETs to see multiple exit paths
const result = disassemble(0x03E1B4, 300, 'TOKEN_PROCESSOR_0x03E1B4', 4);

// Follow interesting CALL/JP targets that are nearby
const followed = new Set();
for (const t of result.targets) {
  if (t.target >= 0x03E000 && t.target <= 0x03F000 && !KNOWN[t.target] && !followed.has(t.target)) {
    followed.add(t.target);
    console.log('\n================================================================');
    console.log('  FOLLOWING ' + t.type + ' TARGET: ' + hex(t.target, 6));
    console.log('  Called from: ' + hex(t.addr, 6));
    console.log('================================================================\n');
    disassemble(t.target, 200, 'sub_' + hex(t.target, 6), 2);
  }
}

// ══════════════════════════════════════════════════════════════
//  PART 2: Dynamic trace — boot OS then call 0x03E1B4 with token 0x88 (CLEAR)
// ══════════════════════════════════════════════════════════════

console.log('\n================================================================');
console.log('  PART 2: Dynamic trace of 0x03E1B4 with token=0x88 (CLEAR)');
console.log('================================================================\n');

try {
  const romModule2 = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
  const BLOCKS = romModule2.PRELIFTED_BLOCKS;

  const MEM_SIZE = 0x1000000;
  const periph = createPeripheralBus({ timerInterrupt: false });
  const { cpu, executor, memory } = createExecutor(MEM_SIZE, BLOCKS, periph);

  // Copy ROM into memory
  memory.set(rom.slice(0, 0x400000), 0);

  // Cold boot (same pattern as golden regression)
  const BOOT_ENTRY = 0x000000;
  const KERNEL_INIT_ENTRY = 0x08C331;
  const POST_INIT_ENTRY = 0x0802B2;
  const STACK_RESET_TOP = 0xD1A87E;

  // Stage 0: Z80 boot
  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  memory.fill(0xFF, cpu.sp, cpu.sp + 3);

  // Kernel init
  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  memory.fill(0xFF, cpu.sp, cpu.sp + 3);

  // Post init
  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  console.log('Boot complete. Setting up dynamic trace...\n');

  // Snapshot memory regions of interest BEFORE the call
  function snapRegion(mem, start, len) {
    const buf = Buffer.alloc(len);
    for (let i = 0; i < len; i++) buf[i] = mem[start + i];
    return buf;
  }

  const regions = [
    { name: 'IY flags (D00080-D00100)', start: 0xD00080, len: 0x80 },
    { name: 'Token area (D008D0-D008F0)', start: 0xD008D0, len: 0x20 },
    { name: 'Display buf (D005F0-D00610)', start: 0xD005F0, len: 0x20 },
  ];

  const beforeSnaps = regions.map(r => ({ ...r, data: snapRegion(memory, r.start, r.len) }));

  // Store token 0x88 (CLEAR) into D008DF
  memory[0xD008DF] = 0x88;
  console.log('Stored token 0x88 at D008DF');

  // Set up CPU state for calling 0x03E1B4
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.sp = STACK_RESET_TOP - 12;
  memory.fill(0xFF, cpu.sp, cpu.sp + 12);

  // Purge RAM blocks to catch RAM jumps
  const blocks = executor.compiledBlocks;
  for (const key of Object.keys(blocks)) {
    const addr = parseInt(key.split(':')[0], 16);
    if (addr >= 0xD00000) delete blocks[key];
  }

  // Track execution
  let dynamicResult;
  class RamHalt extends Error {
    constructor(pc, steps) { super('ram_halt'); this.haltPc = pc; this.haltSteps = steps; }
  }

  try {
    dynamicResult = executor.runFrom(0x03E1B4, 'adl', {
      maxSteps: 2000,
      maxLoopIterations: 500,
      onMissingBlock(pc, _mode, steps) {
        if (pc >= 0xD00000) throw new RamHalt(pc, steps);
      },
    });
  } catch (err) {
    if (err.message === 'ram_halt') {
      dynamicResult = { steps: err.haltSteps, termination: 'ram_halt', lastPc: err.haltPc };
    } else {
      dynamicResult = { steps: 0, termination: 'error: ' + err.message, lastPc: 0 };
    }
  }

  console.log('\nDynamic trace result:');
  console.log('  Steps executed: ' + dynamicResult.steps);
  console.log('  Termination: ' + dynamicResult.termination);
  console.log('  Final PC: ' + hex(dynamicResult.lastPc, 6));
  console.log('  Final SP: ' + hex(cpu.sp, 6));
  console.log('  A=' + hex(cpu.a, 2) + ' F=' + hex(cpu.f, 2) + ' BC=' + hex(cpu._bc, 6) + ' DE=' + hex(cpu._de, 6) + ' HL=' + hex(cpu._hl, 6));
  console.log('  IX=' + hex(cpu._ix, 6) + ' IY=' + hex(cpu._iy, 6));

  // Compare memory regions
  console.log('\nMemory changes:');
  for (let ri = 0; ri < regions.length; ri++) {
    const r = regions[ri];
    const before = beforeSnaps[ri].data;
    const changes = [];
    for (let i = 0; i < r.len; i++) {
      const afterVal = memory[r.start + i];
      if (before[i] !== afterVal) {
        changes.push({ offset: i, addr: r.start + i, before: before[i], after: afterVal });
      }
    }
    if (changes.length > 0) {
      console.log('\n  ' + r.name + ' (' + changes.length + ' changes):');
      for (const c of changes) {
        console.log('    ' + hex(c.addr, 6) + ': ' + hex(c.before) + ' -> ' + hex(c.after));
      }
    } else {
      console.log('  ' + r.name + ': no changes');
    }
  }

  // Check token byte
  console.log('\n  D008DF (token byte): ' + hex(memory[0xD008DF]));

} catch (err) {
  console.log('Dynamic trace failed: ' + err.message);
  console.log('(This is expected if ROM.transpiled.js is not available)');
  if (err.stack) console.log(err.stack.split('\n').slice(0,5).join('\n'));
}

// ══════════════════════════════════════════════════════════════
//  PART 3: Summary / Analysis
// ══════════════════════════════════════════════════════════════

console.log('\n================================================================');
console.log('  PART 3: ANALYSIS SUMMARY');
console.log('================================================================');
console.log('');
console.log('0x03E1B4 is the TOKEN PROCESSOR — the central routine called');
console.log('after a key press is converted to a token code (stored at D008DF).');
console.log('');
console.log('Call chain: key press -> 0x099921 event loop -> key handler');
console.log('  -> 0x09AF6F CPIR table -> 0x061D1A longjmp entries');
console.log('  -> 0x061DB2 common handler -> LD (D008DF),A -> CALL 0x03E1B4');
console.log('');
console.log('Examine the static disassembly above to determine:');
console.log('  1. Whether it dispatches based on token value (CP/JR/JP chains)');
console.log('  2. What subroutines it calls (CALL targets)');
console.log('  3. What RAM state it reads/writes (D0xxxx references)');
console.log('  4. How it returns control (RET vs longjmp via SP restore)');
