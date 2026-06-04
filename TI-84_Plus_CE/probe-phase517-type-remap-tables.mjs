#!/usr/bin/env node
// probe-phase517-type-remap-tables.mjs
// ROM-read-only probe: Extract and analyze type remapping tables at 0x07FE8A/0x07FE91
// and disassemble the two remapping functions at 0x07FE28 and 0x07FE5E.
//
// Context from session 516:
//   - 0x07FE28: 6-entry CPIR search in table at 0x07FE8A, default B=0x0C
//   - 0x07FE5E: 5-entry CPIR search in table at 0x07FE91
//   - Both called by the dual-buffer type normalizer at 0x07F7FA
//   - They rewrite BCD descriptor type codes (low 6 bits, preserving top 2 flag bits)

import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

// ── Helpers ──────────────────────────────────────────────────────────────────

function rd(offset) { return rom[offset]; }
function rd24(offset) { return rom[offset] | (rom[offset + 1] << 8) | (rom[offset + 2] << 16); }
function signed8(v) { return v >= 128 ? v - 256 : v; }
function hex(v, w) { return '0x' + v.toString(16).toUpperCase().padStart(w || 2, '0'); }

function hexBytes(start, len) {
  let s = '';
  for (let i = 0; i < len; i++) s += rom[start + i].toString(16).toUpperCase().padStart(2, '0') + ' ';
  return s.trimEnd();
}

function hexDump(start, len, label) {
  console.log('\n' + label + ':');
  for (let i = 0; i < len; i += 16) {
    const chunk = Math.min(16, len - i);
    const addr = start + i;
    let line = hex(addr, 6) + ': ';
    for (let j = 0; j < chunk; j++) {
      line += rom[addr + j].toString(16).toUpperCase().padStart(2, '0') + ' ';
    }
    console.log(line.trimEnd());
  }
}

// ── Disassembler (inline eZ80 decoder, 3-byte addresses in ADL mode) ────────

const R8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const CC_NAMES = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const R16 = ['BC', 'DE', 'HL', 'SP'];
const R16AF = ['BC', 'DE', 'HL', 'AF'];

const KNOWN = {
  0x07F7FA: 'dual_buffer_type_normalizer',
  0x07FE28: 'type_remap_6entry',
  0x07FE5E: 'type_remap_5entry',
  0x07FE8A: 'search_table_6 (data)',
  0x07FE91: 'search_table_5 (data)',
  0x07FE9C: 'type_rewriter',
  0x07CFA7: 'standard_text_renderer',
  0x07D233: 'descriptor_filter_router',
};

function annotate(addr) {
  return KNOWN[addr] ? '  ; -> ' + KNOWN[addr] : '';
}

function emit(addr, len, mnemonic) {
  const hx = hexBytes(addr, len).padEnd(20);
  console.log(hex(addr, 6) + ': ' + hx + ' ' + mnemonic);
}

function disassemble(startAddr, maxBytes, label, stopOnRet) {
  let pc = startAddr;
  const endAddr = startAddr + maxBytes;
  let instrCount = 0;
  const allTargets = [];
  let retCount = 0;
  stopOnRet = stopOnRet || 0;

  console.log('\n=== Disassembly: ' + label + ' at ' + hex(startAddr, 6) + ' (' + maxBytes + ' bytes max) ===\n');

  while (pc < endAddr && instrCount < 500) {
    const addr = pc;
    const b0 = rd(pc);

    // eZ80 ADL mode suffixes
    if (b0 === 0x40 || b0 === 0x49 || b0 === 0x52 || b0 === 0x5B) {
      const suffixes = { 0x40: '.SIS', 0x49: '.LIS', 0x52: '.SIL', 0x5B: '.LIL' };
      emit(addr, 1, 'PREFIX ' + suffixes[b0]);
      pc += 1; instrCount++; continue;
    }

    // DD prefix (IX)
    if (b0 === 0xDD) {
      const b1 = rd(pc + 1);
      if (b1 === 0xCB) {
        const d = rd(pc + 2); const op = rd(pc + 3); const bit = (op >> 3) & 7;
        if ((op & 0xC7) === 0x46) { emit(addr, 4, 'BIT ' + bit + ',(IX+' + hex(d) + ')'); pc += 4; instrCount++; continue; }
        if ((op & 0xC7) === 0xC6) { emit(addr, 4, 'SET ' + bit + ',(IX+' + hex(d) + ')'); pc += 4; instrCount++; continue; }
        if ((op & 0xC7) === 0x86) { emit(addr, 4, 'RES ' + bit + ',(IX+' + hex(d) + ')'); pc += 4; instrCount++; continue; }
        emit(addr, 4, 'DD CB ' + hex(d) + ' ' + hex(op) + ' ; ???'); pc += 4; instrCount++; continue;
      }
      if (b1 === 0x21) { const nn = rd24(pc + 2); emit(addr, 5, 'LD IX,' + hex(nn, 6)); pc += 5; instrCount++; continue; }
      if (b1 === 0xE5) { emit(addr, 2, 'PUSH IX'); pc += 2; instrCount++; continue; }
      if (b1 === 0xE1) { emit(addr, 2, 'POP IX'); pc += 2; instrCount++; continue; }
      if ((b1 & 0xC7) === 0x46) { const r = (b1 >> 3) & 7; const d = rd(pc + 2); emit(addr, 3, 'LD ' + R8[r] + ',(IX+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if ((b1 & 0xF8) === 0x70) { const r = b1 & 7; const d = rd(pc + 2); emit(addr, 3, 'LD (IX+' + hex(d) + '),' + R8[r]); pc += 3; instrCount++; continue; }
      if (b1 === 0x36) { const d = rd(pc + 2); const n = rd(pc + 3); emit(addr, 4, 'LD (IX+' + hex(d) + '),' + hex(n)); pc += 4; instrCount++; continue; }
      if (b1 === 0x23) { emit(addr, 2, 'INC IX'); pc += 2; instrCount++; continue; }
      if (b1 === 0x2B) { emit(addr, 2, 'DEC IX'); pc += 2; instrCount++; continue; }
      if (b1 === 0x09) { emit(addr, 2, 'ADD IX,BC'); pc += 2; instrCount++; continue; }
      if (b1 === 0x19) { emit(addr, 2, 'ADD IX,DE'); pc += 2; instrCount++; continue; }
      if (b1 === 0x29) { emit(addr, 2, 'ADD IX,IX'); pc += 2; instrCount++; continue; }
      if (b1 === 0x39) { emit(addr, 2, 'ADD IX,SP'); pc += 2; instrCount++; continue; }
      if (b1 === 0xE9) { emit(addr, 2, 'JP (IX)'); pc += 2; instrCount++; continue; }
      if (b1 === 0xBE) { const d = rd(pc + 2); emit(addr, 3, 'CP (IX+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0xB6) { const d = rd(pc + 2); emit(addr, 3, 'OR (IX+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0xA6) { const d = rd(pc + 2); emit(addr, 3, 'AND (IX+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0xAE) { const d = rd(pc + 2); emit(addr, 3, 'XOR (IX+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0x86) { const d = rd(pc + 2); emit(addr, 3, 'ADD A,(IX+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0x8E) { const d = rd(pc + 2); emit(addr, 3, 'ADC A,(IX+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0x96) { const d = rd(pc + 2); emit(addr, 3, 'SUB (IX+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0x9E) { const d = rd(pc + 2); emit(addr, 3, 'SBC A,(IX+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0x34) { const d = rd(pc + 2); emit(addr, 3, 'INC (IX+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0x35) { const d = rd(pc + 2); emit(addr, 3, 'DEC (IX+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0xF9) { emit(addr, 2, 'LD SP,IX'); pc += 2; instrCount++; continue; }
      if (b1 === 0x22) { const nn = rd24(pc + 2); emit(addr, 5, 'LD (' + hex(nn, 6) + '),IX'); pc += 5; instrCount++; continue; }
      if (b1 === 0x2A) { const nn = rd24(pc + 2); emit(addr, 5, 'LD IX,(' + hex(nn, 6) + ')'); pc += 5; instrCount++; continue; }
      emit(addr, 2, 'DD ' + hex(b1) + ' ; unhandled IX prefix'); pc += 2; instrCount++; continue;
    }

    // FD prefix (IY)
    if (b0 === 0xFD) {
      const b1 = rd(pc + 1);
      if (b1 === 0xCB) {
        const d = rd(pc + 2); const op = rd(pc + 3); const bit = (op >> 3) & 7;
        if ((op & 0xC7) === 0x46) { emit(addr, 4, 'BIT ' + bit + ',(IY+' + hex(d) + ')'); pc += 4; instrCount++; continue; }
        if ((op & 0xC7) === 0xC6) { emit(addr, 4, 'SET ' + bit + ',(IY+' + hex(d) + ')'); pc += 4; instrCount++; continue; }
        if ((op & 0xC7) === 0x86) { emit(addr, 4, 'RES ' + bit + ',(IY+' + hex(d) + ')'); pc += 4; instrCount++; continue; }
        emit(addr, 4, 'FD CB ' + hex(d) + ' ' + hex(op) + ' ; ???'); pc += 4; instrCount++; continue;
      }
      if (b1 === 0x21) { const nn = rd24(pc + 2); emit(addr, 5, 'LD IY,' + hex(nn, 6)); pc += 5; instrCount++; continue; }
      if (b1 === 0xE5) { emit(addr, 2, 'PUSH IY'); pc += 2; instrCount++; continue; }
      if (b1 === 0xE1) { emit(addr, 2, 'POP IY'); pc += 2; instrCount++; continue; }
      if ((b1 & 0xC7) === 0x46) { const r = (b1 >> 3) & 7; const d = rd(pc + 2); emit(addr, 3, 'LD ' + R8[r] + ',(IY+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if ((b1 & 0xF8) === 0x70) { const r = b1 & 7; const d = rd(pc + 2); emit(addr, 3, 'LD (IY+' + hex(d) + '),' + R8[r]); pc += 3; instrCount++; continue; }
      if (b1 === 0x36) { const d = rd(pc + 2); const n = rd(pc + 3); emit(addr, 4, 'LD (IY+' + hex(d) + '),' + hex(n)); pc += 4; instrCount++; continue; }
      if (b1 === 0x23) { emit(addr, 2, 'INC IY'); pc += 2; instrCount++; continue; }
      if (b1 === 0x2B) { emit(addr, 2, 'DEC IY'); pc += 2; instrCount++; continue; }
      if (b1 === 0x09) { emit(addr, 2, 'ADD IY,BC'); pc += 2; instrCount++; continue; }
      if (b1 === 0x19) { emit(addr, 2, 'ADD IY,DE'); pc += 2; instrCount++; continue; }
      if (b1 === 0x29) { emit(addr, 2, 'ADD IY,IY'); pc += 2; instrCount++; continue; }
      if (b1 === 0x39) { emit(addr, 2, 'ADD IY,SP'); pc += 2; instrCount++; continue; }
      if (b1 === 0xE9) { emit(addr, 2, 'JP (IY)'); pc += 2; instrCount++; continue; }
      if (b1 === 0xBE) { const d = rd(pc + 2); emit(addr, 3, 'CP (IY+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0xB6) { const d = rd(pc + 2); emit(addr, 3, 'OR (IY+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0xA6) { const d = rd(pc + 2); emit(addr, 3, 'AND (IY+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0xAE) { const d = rd(pc + 2); emit(addr, 3, 'XOR (IY+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0x86) { const d = rd(pc + 2); emit(addr, 3, 'ADD A,(IY+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0x96) { const d = rd(pc + 2); emit(addr, 3, 'SUB (IY+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0x34) { const d = rd(pc + 2); emit(addr, 3, 'INC (IY+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0x35) { const d = rd(pc + 2); emit(addr, 3, 'DEC (IY+' + hex(d) + ')'); pc += 3; instrCount++; continue; }
      if (b1 === 0xF9) { emit(addr, 2, 'LD SP,IY'); pc += 2; instrCount++; continue; }
      if (b1 === 0x22) { const nn = rd24(pc + 2); emit(addr, 5, 'LD (' + hex(nn, 6) + '),IY'); pc += 5; instrCount++; continue; }
      if (b1 === 0x2A) { const nn = rd24(pc + 2); emit(addr, 5, 'LD IY,(' + hex(nn, 6) + ')'); pc += 5; instrCount++; continue; }
      emit(addr, 2, 'FD ' + hex(b1) + ' ; unhandled IY prefix'); pc += 2; instrCount++; continue;
    }

    // CB prefix - bit/shift ops
    if (b0 === 0xCB) {
      const b1 = rd(pc + 1);
      if ((b1 & 0xC0) === 0x00) {
        const ops = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
        emit(addr, 2, ops[(b1 >> 3) & 7] + ' ' + R8[b1 & 7]); pc += 2; instrCount++; continue;
      }
      if ((b1 & 0xC0) === 0x40) { emit(addr, 2, 'BIT ' + ((b1 >> 3) & 7) + ',' + R8[b1 & 7]); pc += 2; instrCount++; continue; }
      if ((b1 & 0xC0) === 0x80) { emit(addr, 2, 'RES ' + ((b1 >> 3) & 7) + ',' + R8[b1 & 7]); pc += 2; instrCount++; continue; }
      if ((b1 & 0xC0) === 0xC0) { emit(addr, 2, 'SET ' + ((b1 >> 3) & 7) + ',' + R8[b1 & 7]); pc += 2; instrCount++; continue; }
    }

    // ED prefix
    if (b0 === 0xED) {
      const b1 = rd(pc + 1);
      if (b1 === 0xB0) { emit(addr, 2, 'LDIR'); pc += 2; instrCount++; continue; }
      if (b1 === 0xB8) { emit(addr, 2, 'LDDR'); pc += 2; instrCount++; continue; }
      if (b1 === 0xB1) { emit(addr, 2, 'CPIR'); pc += 2; instrCount++; continue; }
      if (b1 === 0xB9) { emit(addr, 2, 'CPDR'); pc += 2; instrCount++; continue; }
      if (b1 === 0xA0) { emit(addr, 2, 'LDI'); pc += 2; instrCount++; continue; }
      if (b1 === 0xA1) { emit(addr, 2, 'CPI'); pc += 2; instrCount++; continue; }
      if (b1 === 0x46) { emit(addr, 2, 'IM 0'); pc += 2; instrCount++; continue; }
      if (b1 === 0x56) { emit(addr, 2, 'IM 1'); pc += 2; instrCount++; continue; }
      if (b1 === 0x5E) { emit(addr, 2, 'IM 2'); pc += 2; instrCount++; continue; }
      if ((b1 & 0xC7) === 0x40) { emit(addr, 2, 'IN ' + R8[(b1 >> 3) & 7] + ',(C)'); pc += 2; instrCount++; continue; }
      if ((b1 & 0xC7) === 0x41) { emit(addr, 2, 'OUT (C),' + R8[(b1 >> 3) & 7]); pc += 2; instrCount++; continue; }
      if ((b1 & 0xCF) === 0x42) { emit(addr, 2, 'SBC HL,' + R16[(b1 >> 4) & 3]); pc += 2; instrCount++; continue; }
      if ((b1 & 0xCF) === 0x4A) { emit(addr, 2, 'ADC HL,' + R16[(b1 >> 4) & 3]); pc += 2; instrCount++; continue; }
      if ((b1 & 0xCF) === 0x43) { const nn = rd24(pc + 2); emit(addr, 5, 'LD (' + hex(nn, 6) + '),' + R16[(b1 >> 4) & 3]); pc += 5; instrCount++; continue; }
      if ((b1 & 0xCF) === 0x4B) { const nn = rd24(pc + 2); emit(addr, 5, 'LD ' + R16[(b1 >> 4) & 3] + ',(' + hex(nn, 6) + ')'); pc += 5; instrCount++; continue; }
      if (b1 === 0x44) { emit(addr, 2, 'NEG'); pc += 2; instrCount++; continue; }
      if (b1 === 0x4D) { emit(addr, 2, 'RETI'); pc += 2; instrCount++; continue; }
      if (b1 === 0x45) { emit(addr, 2, 'RETN'); pc += 2; instrCount++; continue; }
      if (b1 === 0x67) { emit(addr, 2, 'RRD'); pc += 2; instrCount++; continue; }
      if (b1 === 0x6F) { emit(addr, 2, 'RLD'); pc += 2; instrCount++; continue; }
      if ((b1 & 0xCF) === 0x4C) { emit(addr, 2, 'MLT ' + R16[(b1 >> 4) & 3]); pc += 2; instrCount++; continue; }
      if (b1 === 0x32) { const d = signed8(rd(pc + 2)); emit(addr, 3, 'LEA IX,IX+' + d); pc += 3; instrCount++; continue; }
      if (b1 === 0x33) { const d = signed8(rd(pc + 2)); emit(addr, 3, 'LEA IY,IY+' + d); pc += 3; instrCount++; continue; }
      if (b1 === 0x02) { const d = signed8(rd(pc + 2)); emit(addr, 3, 'LEA BC,IX+' + d); pc += 3; instrCount++; continue; }
      if (b1 === 0x12) { const d = signed8(rd(pc + 2)); emit(addr, 3, 'LEA DE,IX+' + d); pc += 3; instrCount++; continue; }
      if (b1 === 0x22) { const d = signed8(rd(pc + 2)); emit(addr, 3, 'LEA HL,IX+' + d); pc += 3; instrCount++; continue; }
      if (b1 === 0x03) { const d = signed8(rd(pc + 2)); emit(addr, 3, 'LEA BC,IY+' + d); pc += 3; instrCount++; continue; }
      if (b1 === 0x13) { const d = signed8(rd(pc + 2)); emit(addr, 3, 'LEA DE,IY+' + d); pc += 3; instrCount++; continue; }
      if (b1 === 0x23) { const d = signed8(rd(pc + 2)); emit(addr, 3, 'LEA HL,IY+' + d); pc += 3; instrCount++; continue; }
      if ((b1 & 0xC7) === 0x04 && b1 !== 0x44) { emit(addr, 2, 'TST A,' + R8[(b1 >> 3) & 7]); pc += 2; instrCount++; continue; }
      emit(addr, 2, 'ED ' + hex(b1) + ' ; unhandled ED prefix'); pc += 2; instrCount++; continue;
    }

    // Single-byte
    if (b0 === 0x00) { emit(addr, 1, 'NOP'); pc += 1; instrCount++; continue; }
    if (b0 === 0x76) { emit(addr, 1, 'HALT'); pc += 1; instrCount++; continue; }
    if (b0 === 0xC9) {
      emit(addr, 1, 'RET');
      pc += 1; instrCount++; retCount++;
      console.log('  --- RET #' + retCount + ' at ' + hex(addr, 6) + ' ---');
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
    if (b0 === 0x08) { emit(addr, 1, 'EX AF,AF'); pc += 1; instrCount++; continue; }
    if (b0 === 0xEB) { emit(addr, 1, 'EX DE,HL'); pc += 1; instrCount++; continue; }
    if (b0 === 0xE3) { emit(addr, 1, 'EX (SP),HL'); pc += 1; instrCount++; continue; }
    if (b0 === 0xE9) { emit(addr, 1, 'JP (HL)'); pc += 1; instrCount++; continue; }
    if (b0 === 0xF9) { emit(addr, 1, 'LD SP,HL'); pc += 1; instrCount++; continue; }

    // RET cc
    if ((b0 & 0xC7) === 0xC0) {
      const cc = (b0 >> 3) & 7;
      emit(addr, 1, 'RET ' + CC_NAMES[cc]);
      pc += 1; instrCount++; continue;
    }

    // CALL nn (3-byte address in ADL mode)
    if (b0 === 0xCD) {
      const nn = rd24(pc + 1);
      allTargets.push({ addr, type: 'CALL', target: nn });
      emit(addr, 4, 'CALL ' + hex(nn, 6) + annotate(nn));
      pc += 4; instrCount++; continue;
    }

    // CALL cc,nn
    if ((b0 & 0xC7) === 0xC4) {
      const cc = (b0 >> 3) & 7;
      const nn = rd24(pc + 1);
      allTargets.push({ addr, type: 'CALL ' + CC_NAMES[cc], target: nn });
      emit(addr, 4, 'CALL ' + CC_NAMES[cc] + ',' + hex(nn, 6) + annotate(nn));
      pc += 4; instrCount++; continue;
    }

    // JP nn
    if (b0 === 0xC3) {
      const nn = rd24(pc + 1);
      allTargets.push({ addr, type: 'JP', target: nn });
      emit(addr, 4, 'JP ' + hex(nn, 6) + annotate(nn));
      pc += 4; instrCount++; continue;
    }

    // JP cc,nn
    if ((b0 & 0xC7) === 0xC2) {
      const cc = (b0 >> 3) & 7;
      const nn = rd24(pc + 1);
      allTargets.push({ addr, type: 'JP ' + CC_NAMES[cc], target: nn });
      emit(addr, 4, 'JP ' + CC_NAMES[cc] + ',' + hex(nn, 6) + annotate(nn));
      pc += 4; instrCount++; continue;
    }

    // JR e
    if (b0 === 0x18) {
      const e = signed8(rd(pc + 1));
      const target = pc + 2 + e;
      emit(addr, 2, 'JR ' + hex(target, 6) + ' (offset ' + (e >= 0 ? '+' : '') + e + ')');
      pc += 2; instrCount++; continue;
    }

    // JR cc,e
    if (b0 === 0x20 || b0 === 0x28 || b0 === 0x30 || b0 === 0x38) {
      const ccIdx = (b0 >> 3) & 3;
      const ccN = ['NZ', 'Z', 'NC', 'C'];
      const e = signed8(rd(pc + 1));
      const target = pc + 2 + e;
      emit(addr, 2, 'JR ' + ccN[ccIdx] + ',' + hex(target, 6) + ' (offset ' + (e >= 0 ? '+' : '') + e + ')');
      pc += 2; instrCount++; continue;
    }

    // DJNZ e
    if (b0 === 0x10) {
      const e = signed8(rd(pc + 1));
      const target = pc + 2 + e;
      emit(addr, 2, 'DJNZ ' + hex(target, 6) + ' (offset ' + (e >= 0 ? '+' : '') + e + ')');
      pc += 2; instrCount++; continue;
    }

    // RST n
    if ((b0 & 0xC7) === 0xC7) {
      const n = b0 & 0x38;
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
      const ops = ['ADD A,', 'ADC A,', 'SUB ', 'SBC A,', 'AND ', 'XOR ', 'OR ', 'CP '];
      emit(addr, 1, ops[(b0 >> 3) & 7] + R8[b0 & 7]);
      pc += 1; instrCount++; continue;
    }

    // LD r,n
    if ((b0 & 0xC7) === 0x06) {
      const r = (b0 >> 3) & 7;
      const n = rd(pc + 1);
      emit(addr, 2, 'LD ' + R8[r] + ',' + hex(n));
      pc += 2; instrCount++; continue;
    }

    // ALU A,n
    if ((b0 & 0xC7) === 0xC6) {
      const ops = ['ADD A,', 'ADC A,', 'SUB ', 'SBC A,', 'AND ', 'XOR ', 'OR ', 'CP '];
      const n = rd(pc + 1);
      emit(addr, 2, ops[(b0 >> 3) & 7] + hex(n));
      pc += 2; instrCount++; continue;
    }

    // LD rr,nn (3-byte immediate in ADL mode)
    if ((b0 & 0xCF) === 0x01) {
      const rr = (b0 >> 4) & 3;
      const nn = rd24(pc + 1);
      emit(addr, 4, 'LD ' + R16[rr] + ',' + hex(nn, 6));
      pc += 4; instrCount++; continue;
    }

    // INC/DEC rr
    if ((b0 & 0xCF) === 0x03) { emit(addr, 1, 'INC ' + R16[(b0 >> 4) & 3]); pc += 1; instrCount++; continue; }
    if ((b0 & 0xCF) === 0x0B) { emit(addr, 1, 'DEC ' + R16[(b0 >> 4) & 3]); pc += 1; instrCount++; continue; }
    // INC/DEC r
    if ((b0 & 0xC7) === 0x04) { emit(addr, 1, 'INC ' + R8[(b0 >> 3) & 7]); pc += 1; instrCount++; continue; }
    if ((b0 & 0xC7) === 0x05) { emit(addr, 1, 'DEC ' + R8[(b0 >> 3) & 7]); pc += 1; instrCount++; continue; }
    // PUSH/POP rr
    if ((b0 & 0xCF) === 0xC5) { emit(addr, 1, 'PUSH ' + R16AF[(b0 >> 4) & 3]); pc += 1; instrCount++; continue; }
    if ((b0 & 0xCF) === 0xC1) { emit(addr, 1, 'POP ' + R16AF[(b0 >> 4) & 3]); pc += 1; instrCount++; continue; }
    // ADD HL,rr
    if ((b0 & 0xCF) === 0x09) { emit(addr, 1, 'ADD HL,' + R16[(b0 >> 4) & 3]); pc += 1; instrCount++; continue; }

    if (b0 === 0x0A) { emit(addr, 1, 'LD A,(BC)'); pc += 1; instrCount++; continue; }
    if (b0 === 0x1A) { emit(addr, 1, 'LD A,(DE)'); pc += 1; instrCount++; continue; }
    if (b0 === 0x02) { emit(addr, 1, 'LD (BC),A'); pc += 1; instrCount++; continue; }
    if (b0 === 0x12) { emit(addr, 1, 'LD (DE),A'); pc += 1; instrCount++; continue; }

    if (b0 === 0x3A) { const nn = rd24(pc + 1); emit(addr, 4, 'LD A,(' + hex(nn, 6) + ')'); pc += 4; instrCount++; continue; }
    if (b0 === 0x32) { const nn = rd24(pc + 1); emit(addr, 4, 'LD (' + hex(nn, 6) + '),A'); pc += 4; instrCount++; continue; }
    if (b0 === 0x2A) { const nn = rd24(pc + 1); emit(addr, 4, 'LD HL,(' + hex(nn, 6) + ')'); pc += 4; instrCount++; continue; }
    if (b0 === 0x22) { const nn = rd24(pc + 1); emit(addr, 4, 'LD (' + hex(nn, 6) + '),HL'); pc += 4; instrCount++; continue; }

    if (b0 === 0xD3) { const n = rd(pc + 1); emit(addr, 2, 'OUT (' + hex(n) + '),A'); pc += 2; instrCount++; continue; }
    if (b0 === 0xDB) { const n = rd(pc + 1); emit(addr, 2, 'IN A,(' + hex(n) + ')'); pc += 2; instrCount++; continue; }

    // Fallthrough
    emit(addr, 1, 'DB ' + hex(b0) + ' ; unknown opcode');
    pc += 1; instrCount++;
  }

  if (pc >= endAddr && (!stopOnRet || retCount < stopOnRet)) {
    console.log('\n--- Reached ' + maxBytes + '-byte limit ---');
  }

  console.log('\n=== ' + instrCount + ' instructions decoded, ' + (pc - startAddr) + ' bytes ===');
  return { instrCount, bytes: pc - startAddr, targets: allTargets, endPC: pc };
}

// ══════════════════════════════════════════════════════════════════════════════
//  PART 1: Extract raw table bytes and surrounding context
// ══════════════════════════════════════════════════════════════════════════════

console.log('================================================================');
console.log('  PHASE 517: Type Remapping Tables at 0x07FE8A / 0x07FE91');
console.log('  ROM-read-only analysis (no CPU execution)');
console.log('================================================================');

// Wide hex dump to see everything in the region
hexDump(0x07FE20, 160, 'Raw bytes 0x07FE20-0x07FEBF (both functions + all tables + context)');

console.log('\n── Table 1: 6-entry CPIR search table at 0x07FE8A (used by 0x07FE28) ──');
const table1Search = [];
for (let i = 0; i < 6; i++) {
  const b = rd(0x07FE8A + i);
  table1Search.push(b);
  console.log('  [' + i + '] ' + hex(b) + ' (low6=' + hex(b & 0x3F) + ')');
}

console.log('\n── Table 2: 5-entry CPIR search table at 0x07FE91 (used by 0x07FE5E) ──');
const table2Search = [];
for (let i = 0; i < 5; i++) {
  const b = rd(0x07FE91 + i);
  table2Search.push(b);
  console.log('  [' + i + '] ' + hex(b) + ' (low6=' + hex(b & 0x3F) + ')');
}

// ══════════════════════════════════════════════════════════════════════════════
//  PART 2: Static disassembly of both remapping functions
// ══════════════════════════════════════════════════════════════════════════════

console.log('\n================================================================');
console.log('  PART 2A: Function 1 - type_remap_6entry @ 0x07FE28');
console.log('  (6-entry CPIR search in table at 0x07FE8A, default B=0x0C)');
console.log('================================================================');

const res1 = disassemble(0x07FE28, 0x38, 'type_remap_6entry @ 0x07FE28', 2);

console.log('\n================================================================');
console.log('  PART 2B: Function 2 - type_remap_5entry @ 0x07FE5E');
console.log('  (5-entry CPIR search in table at 0x07FE91)');
console.log('================================================================');

const res2 = disassemble(0x07FE5E, 0x40, 'type_remap_5entry @ 0x07FE5E', 2);

console.log('\n================================================================');
console.log('  PART 2C: type_rewriter @ 0x07FE9C (for cross-reference)');
console.log('================================================================');

const res3 = disassemble(0x07FE9C, 0x30, 'type_rewriter @ 0x07FE9C', 1);

// ══════════════════════════════════════════════════════════════════════════════
//  PART 3: Cross-reference analysis - find replacement tables from disassembly
// ══════════════════════════════════════════════════════════════════════════════

console.log('\n================================================================');
console.log('  PART 3: Cross-Reference Analysis');
console.log('================================================================');

// CPIR mechanics:
//   - Searches for A in memory starting at HL, incrementing HL and decrementing BC each step
//   - After MATCH: HL points ONE PAST the matched byte. Z flag set. BC decremented.
//   - After NO MATCH (BC=0): Z flag clear.
//
// Common pattern for parallel lookup:
//   The displacement from search table start to match position gives the index.
//   A second table at a known offset contains the replacement values.
//   OR: the code uses HL directly (which now points past the match) to read from
//   a replacement table that immediately follows the search table.

console.log('\n── CPIR analysis ──');
console.log('After CPIR on table1 (6 entries at 0x07FE8A):');
console.log('  If match at [0]: HL=0x07FE8B, If match at [5]: HL=0x07FE90');
console.log('  Table ends at 0x07FE90 (exclusive)');
console.log('');
console.log('After CPIR on table2 (5 entries at 0x07FE91):');
console.log('  If match at [0]: HL=0x07FE92, If match at [5]: HL=0x07FE96');
console.log('  Table ends at 0x07FE96 (exclusive)');

// The replacement table is likely at the byte that HL will point to after CPIR.
// If search table is immediately followed by replacement table:
//   search[0] at 0x07FE8A -> CPIR leaves HL=0x07FE8B
//   replacement[0] would need to be at 0x07FE8B + offset
// But more commonly: HL is used to read from a parallel table that follows.
// If replacement table starts right after search table:
//   For table1: search=0x07FE8A-0x07FE8F, replacement=0x07FE90-0x07FE95
//     After match at [i], HL=0x07FE8A+i+1. Reading (HL+5) gives replacement[i].
//   For table2: search=0x07FE91-0x07FE95, replacement=0x07FE96-0x07FE9A
//     After match at [i], HL=0x07FE91+i+1. Reading (HL+4) gives replacement[i].

// Let's try the simplest hypothesis: replacement table immediately follows search table
console.log('\n── Hypothesis: Replacement tables follow search tables ──');

console.log('\nTable 1 search at 0x07FE8A (6 entries), potential replacement at 0x07FE90:');
const replace1Addr = 0x07FE90;
for (let i = 0; i < 6; i++) {
  const s = table1Search[i];
  const r = rd(replace1Addr + i);
  console.log('  search=' + hex(s) + ' (low6=' + hex(s & 0x3F) + ') -> replace=' + hex(r) + ' (low6=' + hex(r & 0x3F) + ')');
}

// But table2 starts at 0x07FE91, only 1 byte after table1 replacement candidate.
// That means the tables overlap! Table1 replacement at 0x07FE90 = byte just before table2 search.
// Let's check: byte at 0x07FE90 is the first byte of table1's replacement AND
// the byte before table2's search.
console.log('\nNote: 0x07FE90 = ' + hex(rd(0x07FE90)) + ' (this is between table1 end and table2 start)');
console.log('Table2 search starts at 0x07FE91, so table1 replacement at 0x07FE90 would be just 1 byte.');
console.log('This layout seems unlikely for a 6-entry replacement table.');

// Alternative: The code may compute the index differently.
// Let's look at what addresses are referenced in the disassembly.
// From the disasm, we can see what LD HL,xxxx instructions load.

console.log('\n── Searching for address references in disassembly region ──');
// Scan for LD HL,nn (opcode 0x21) in both functions
for (let pc = 0x07FE28; pc < 0x07FEB0; pc++) {
  if (rd(pc) === 0x21) {
    const nn = rd24(pc + 1);
    if (nn >= 0x07FE00 && nn <= 0x07FF00) {
      console.log('  ' + hex(pc, 6) + ': LD HL,' + hex(nn, 6) + ' (potential table pointer)');
    }
  }
  // Also check LD BC,nn (opcode 0x01)
  if (rd(pc) === 0x01) {
    const nn = rd24(pc + 1);
    if (nn <= 0x20) {
      console.log('  ' + hex(pc, 6) + ': LD BC,' + hex(nn, 6) + ' (potential count)');
    }
  }
}

// ── Final mapping ──
console.log('\n══════════════════════════════════════════════════════════════');
console.log('  FINAL CROSS-REFERENCE MAPPING');
console.log('══════════════════════════════════════════════════════════════');

// Known type meanings
const TYPE_NAMES = {
  0x00: 'empty/cleared',
  0x01: 'standard_text',
  0x0C: 'default_BCD_display (func1 default)',
  0x18: 'normalized_0x21_target',
  0x20: 'special_20 (rewriter: ->0x00)',
  0x21: 'special_21 (rewriter: ->0x18)',
};

function typeName(v) {
  return TYPE_NAMES[v & 0x3F] || ('type_' + hex(v & 0x3F));
}

// Output tables with both hypotheses
console.log('\nTable 1 (0x07FE8A, 6 entries, used by type_remap_6entry @ 0x07FE28):');
console.log('  Default if no match: B=0x0C');
console.log('  Idx | Search | low6 | Replace@+6 | Replace meaning');
console.log('  ----+--------+------+------------+----------------');
for (let i = 0; i < 6; i++) {
  const s = table1Search[i];
  const r = rd(0x07FE90 + i);
  console.log('  ' + i + '   | ' + hex(s) + '   | ' + hex(s & 0x3F) + '   | ' + hex(r) + '         | ' + typeName(r));
}

console.log('\nTable 2 (0x07FE91, 5 entries, used by type_remap_5entry @ 0x07FE5E):');
console.log('  Idx | Search | low6 | Replace@+5 | Replace meaning');
console.log('  ----+--------+------+------------+----------------');
for (let i = 0; i < 5; i++) {
  const s = table2Search[i];
  const r = rd(0x07FE96 + i);
  console.log('  ' + i + '   | ' + hex(s) + '   | ' + hex(s & 0x3F) + '   | ' + hex(r) + '         | ' + typeName(r));
}

console.log('\n── Annotated byte map 0x07FE80-0x07FEB0 ──');
for (let addr = 0x07FE80; addr < 0x07FEB0; addr++) {
  let annotation = '';
  if (addr >= 0x07FE8A && addr < 0x07FE90) annotation = ' <- TABLE1 search[' + (addr - 0x07FE8A) + ']';
  else if (addr >= 0x07FE90 && addr < 0x07FE91) annotation = ' <- TABLE1 replace[' + (addr - 0x07FE90) + '] (hypothesis)';
  else if (addr >= 0x07FE91 && addr < 0x07FE96) annotation = ' <- TABLE2 search[' + (addr - 0x07FE91) + ']';
  else if (addr >= 0x07FE96 && addr < 0x07FE9B) annotation = ' <- TABLE2 replace[' + (addr - 0x07FE96) + '] (hypothesis)';
  else if (addr === 0x07FE9C) annotation = ' <- type_rewriter function start';
  console.log('  ' + hex(addr, 6) + ': ' + hex(rd(addr)) + annotation);
}

console.log('\n── CPIR Mechanics Reminder ──');
console.log('CPIR: Compare A with (HL), increment HL, decrement BC. Repeat until match or BC=0.');
console.log('After match: HL points ONE PAST matched byte. Z flag set.');
console.log('After no match (BC=0): Z flag clear.');
console.log('');
console.log('The function reads the replacement value by using HL (which advanced');
console.log('past the search table into the replacement table on a match).');
console.log('If the replacement table immediately follows the search table, then');
console.log('for a match at index i, HL will be at searchTable + i + 1.');
console.log('Reading (HL + tableLen - 1) gives replacement[i].');

console.log('\nDone.');
