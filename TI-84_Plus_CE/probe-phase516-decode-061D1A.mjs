#!/usr/bin/env node
// probe-phase516-decode-061D1A.mjs
// Static disassembly of 0x061D1A — Main CLEAR action / unhandled key path
// Destinations:
//   - CLEAR key handler full clear path
//   - Both range dispatchers (0x099BB0, 0x09AF4E) route mismatches here
//   - Default fallthrough from 0x099921 event loop dispatcher
import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

const KNOWN = {
  0x061D1A: 'CLEAR_action_unhandled_key (THIS TARGET)',
  0x099921: 'event_loop_command_dispatcher',
  0x099BB0: 'range_dispatcher_1',
  0x09AF4E: 'range_dispatcher_2',
  0x044DB3: 'home_screen_populator',
  0x0633F6: 'populator_call_site_2',
  0x06DE0E: 'populator_call_site_3',
  0x06E168: 'populator_call_site_4',
  0x0B3540: 'mathprint_mode_guard',
  0x07CFA7: 'standard_text_renderer',
  0x07C8B7: 'BCD_position_calculator',
  0x0A1799: 'glyph_rasterizer',
  0x07D1B4: 'descriptor_list_walker',
  0x07D233: 'descriptor_filter_router',
  0x06868A: 'descriptor_type_dispatcher',
  0x099F49: 'CLEAR_handler',
  0x099F68: 'minus_handler',
  0x07DF6A: 'BCD_formatter',
  0x07FE9C: 'type_rewriter',
  0x0B9032: 'string_renderer',
  0x0B9432: 'cursor_init_setup',
  0x0685DF: 'sign_handler',
};

function annotate(addr) {
  return KNOWN[addr] ? '  ; -> ' + KNOWN[addr] : '';
}

const R8 = ['B','C','D','E','H','L','(HL)','A'];
const CC_NAMES = ['NZ','Z','NC','C','PO','PE','P','M'];
const R16 = ['BC','DE','HL','SP'];
const R16AF = ['BC','DE','HL','AF'];

function rd(offset) { return rom[offset]; }
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
  let retCount = 0;
  stopOnRet = stopOnRet || 0;

  console.log('=== Disassembly of ' + label + ' at 0x' + startAddr.toString(16).toUpperCase() + ' (' + maxBytes + ' bytes max) ===\n');

  while (pc < endAddr && instrCount < 500) {
    const addr = pc;
    const b0 = rd(pc);

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
      if (b1 === 0xA0) { emit(addr, 2, 'LDI'); pc += 2; instrCount++; continue; }
      if (b1 === 0xA1) { emit(addr, 2, 'CPI'); pc += 2; instrCount++; continue; }
      if (b1 === 0x46) { emit(addr, 2, 'IM 0'); pc += 2; instrCount++; continue; }
      if (b1 === 0x56) { emit(addr, 2, 'IM 1'); pc += 2; instrCount++; continue; }
      if (b1 === 0x5E) { emit(addr, 2, 'IM 2'); pc += 2; instrCount++; continue; }
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

    // CALL nn
    if (b0 === 0xCD) {
      const nn = rd24(pc+1);
      allTargets.push({addr, type: 'CALL', target: nn});
      emit(addr, 4, 'CALL ' + hex(nn,6) + annotate(nn));
      pc += 4; instrCount++; continue;
    }

    // CALL cc,nn
    if ((b0 & 0xC7) === 0xC4) {
      const cc = (b0 >> 3) & 7;
      const nn = rd24(pc+1);
      allTargets.push({addr, type: 'CALL ' + CC_NAMES[cc], target: nn});
      emit(addr, 4, 'CALL ' + CC_NAMES[cc] + ',' + hex(nn,6) + annotate(nn));
      pc += 4; instrCount++; continue;
    }

    // JP nn
    if (b0 === 0xC3) {
      const nn = rd24(pc+1);
      allTargets.push({addr, type: 'JP', target: nn});
      emit(addr, 4, 'JP ' + hex(nn,6) + annotate(nn));
      pc += 4; instrCount++; continue;
    }

    // JP cc,nn
    if ((b0 & 0xC7) === 0xC2) {
      const cc = (b0 >> 3) & 7;
      const nn = rd24(pc+1);
      allTargets.push({addr, type: 'JP ' + CC_NAMES[cc], target: nn});
      emit(addr, 4, 'JP ' + CC_NAMES[cc] + ',' + hex(nn,6) + annotate(nn));
      pc += 4; instrCount++; continue;
    }

    // JR e
    if (b0 === 0x18) {
      const e = signed8(rd(pc+1));
      const target = pc + 2 + e;
      emit(addr, 2, 'JR ' + hex(target,6) + ' (offset ' + (e >= 0 ? '+' : '') + e + ')');
      pc += 2; instrCount++; continue;
    }

    // JR cc,e
    if (b0 === 0x20 || b0 === 0x28 || b0 === 0x30 || b0 === 0x38) {
      const ccIdx = (b0 >> 3) & 3;
      const ccN = ['NZ','Z','NC','C'];
      const e = signed8(rd(pc+1));
      const target = pc + 2 + e;
      emit(addr, 2, 'JR ' + ccN[ccIdx] + ',' + hex(target,6) + ' (offset ' + (e >= 0 ? '+' : '') + e + ')');
      pc += 2; instrCount++; continue;
    }

    // DJNZ e
    if (b0 === 0x10) {
      const e = signed8(rd(pc+1));
      const target = pc + 2 + e;
      emit(addr, 2, 'DJNZ ' + hex(target,6) + ' (offset ' + (e >= 0 ? '+' : '') + e + ')');
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

    if (b0 === 0x3A) { const nn = rd24(pc+1); emit(addr, 4, 'LD A,(' + hex(nn,6) + ')'); pc += 4; instrCount++; continue; }
    if (b0 === 0x32) { const nn = rd24(pc+1); emit(addr, 4, 'LD (' + hex(nn,6) + '),A'); pc += 4; instrCount++; continue; }
    if (b0 === 0x2A) { const nn = rd24(pc+1); emit(addr, 4, 'LD HL,(' + hex(nn,6) + ')'); pc += 4; instrCount++; continue; }
    if (b0 === 0x22) { const nn = rd24(pc+1); emit(addr, 4, 'LD (' + hex(nn,6) + '),HL'); pc += 4; instrCount++; continue; }

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

  // Summary
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

  console.log('');
  return { instrCount, bytes: pc - startAddr, targets: allTargets };
}

// === Main disassembly ===

console.log('================================================================');
console.log('  DECODE 0x061D1A: CLEAR Action / Unhandled Key Path');
console.log('  Routed from: CLEAR handler, range dispatchers, event loop');
console.log('================================================================\n');

// Primary: 400 bytes from 0x061D1A, stop after 3 RETs to capture multiple exit paths
const result = disassemble(0x061D1A, 400, 'CLEAR_action_0x061D1A', 3);

// Follow interesting CALL/JP targets that are nearby (likely subroutines of this function)
const followed = new Set();
for (const t of result.targets) {
  // Only follow targets within a reasonable range that are not already known
  if (t.target >= 0x061C00 && t.target <= 0x062500 && !KNOWN[t.target] && !followed.has(t.target)) {
    followed.add(t.target);
    console.log('\n================================================================');
    console.log('  FOLLOWING ' + t.type + ' TARGET: ' + hex(t.target, 6));
    console.log('  Called from: ' + hex(t.addr, 6));
    console.log('================================================================\n');
    disassemble(t.target, 200, 'sub_' + hex(t.target, 6), 1);
  }
}

// Also check what is just before 0x061D1A for context (the preceding function tail)
console.log('\n================================================================');
console.log('  CONTEXT: 32 bytes BEFORE 0x061D1A (preceding code tail)');
console.log('================================================================\n');
disassemble(0x061CFA, 32, 'context_before_061D1A', 1);

console.log('\n================================================================');
console.log('  ANALYSIS');
console.log('================================================================');
console.log('0x061D1A is the target for:');
console.log('  - CLEAR key handler (0x099F49) full clear path');
console.log('  - Range dispatcher 1 (0x099BB0) mismatch fallthrough');
console.log('  - Range dispatcher 2 (0x09AF4E) mismatch fallthrough');
console.log('  - Event loop (0x099921) default/unhandled key fallthrough');
console.log('');
console.log('Look for patterns indicating:');
console.log('  1. Screen clear (LCD buffer fill, cursor reset)');
console.log('  2. State reset (RAM flag clears)');
console.log('  3. Return to event loop (JP back to 0x099921 or similar)');
console.log('  4. Home screen repaint (CALL to populator chain)');
