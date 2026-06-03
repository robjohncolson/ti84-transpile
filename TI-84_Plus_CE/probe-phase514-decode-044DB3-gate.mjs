/**
 * probe-phase514-decode-044DB3-gate.mjs
 *
 * Static disassembly of the home-screen populator function at 0x044D3F.
 * Entry via jump table (address stored at 0x044A6E).
 * Error trampoline at 0x044D3B: JP 0x061D52.
 * Pure ROM byte reading, no CPU execution.
 */

import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

function u8(addr) { return rom[addr]; }
function u24(addr) { return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16); }
function hex(v, w) { return '0x' + v.toString(16).toUpperCase().padStart(w || 6, '0'); }
function signed8(v) { return v > 127 ? v - 256 : v; }

function hexBytes(addr, n) {
  const parts = [];
  for (let i = 0; i < n; i++) parts.push(rom[addr + i].toString(16).padStart(2, '0'));
  return parts.join(' ');
}

const KNOWN = {
  0x08290E: 'init_check (NOT system_lock)',
  0x082961: 'system_lock',
  0x07D583: 'POPULATOR',
  0x06DB4E: 'pre_populator_setup',
  0x06E4BA: 'read_mode_bits',
  0x044FC2: 'post_populator_check',
  0x06E4A0: 'get_render_entry',
  0x07F7BD: 'get_entry_type',
  0x07BDF7: 'get_entry_type_ALT',
  0x0452F5: 'setup_sub',
  0x045357: 'check_status',
  0x028539: 'check_028539',
  0x0450CC: 'render_entry',
  0x0450BE: 'finalize_entry',
  0x0B16E9: 'sub_0B16E9',
  0x045344: 'sub_045344',
  0x04535C: 'sub_04535C',
  0x06E5F7: 'next_entry',
  0x044EC4: 'alt_render',
  0x044F32: 'table_list_render',
  0x044ECE: 'sub_044ECE',
  0x044E85: 'sub_044E85',
  0x07D5D3: 'post_populator_chain',
  0x061E20: 'sub_061E20',
  0x061DEF: 'set_return_addr',
  0x07F9FB: 'save_cursor_state',
  0x07F81D: 'save_display_state',
  0x061D46: 'exit_handler',
  0x0446F2: 'early_exit',
  0x044BD3: 'alt_render_path',
  0x061DB6: 'sub_061DB6',
  0x044DBB: 'loop_outer_top',
  0x03D1BE: 'sub_03D1BE',
  0x03FA09: 'sub_03FA09',
  0x09CECC: 'sub_09CECC',
  0x044708: 'sub_044708',
};

function annotate(addr) {
  if (KNOWN[addr]) return '  ; << ' + KNOWN[addr] + ' >>';
  return '';
}

function disasm(startAddr, length, label) {
  const lines = [];
  lines.push('');
  lines.push('=' .repeat(76));
  lines.push('  ' + label);
  lines.push('  Range: ' + hex(startAddr) + ' .. ' + hex(startAddr + length - 1));
  lines.push('='.repeat(76));

  let pc = startAddr;
  const end = startAddr + length;

  while (pc < end) {
    const lineAddr = pc;
    let mnemonic = '';
    let comment = '';
    let bytes = 0;
    const op = u8(pc);

    if (op === 0xFD) {
      const op2 = u8(pc + 1);
      if (op2 === 0xCB) {
        const d = u8(pc + 2);
        const xx = u8(pc + 3);
        bytes = 4;
        const bitN = (xx >> 3) & 7;
        const dSigned = signed8(d);
        const iyAddr = 0xD00080 + dSigned;
        if ((xx & 0xC7) === 0x46)       mnemonic = 'BIT ' + bitN + ',(IY+' + hex(d, 2) + ')';
        else if ((xx & 0xC7) === 0xC6)  mnemonic = 'SET ' + bitN + ',(IY+' + hex(d, 2) + ')';
        else if ((xx & 0xC7) === 0x86)  mnemonic = 'RES ' + bitN + ',(IY+' + hex(d, 2) + ')';
        else                             mnemonic = 'FD CB ' + hex(d, 2) + ' ' + hex(xx, 2);
        comment = '  ; [' + hex(iyAddr) + ']';
        if (d === 0x0F) comment += ' *** D0008F MODE BITS ***';
        if (d === 0x03) comment += ' (D00083 sys flags)';
        if (d === 0x04) comment += ' (D00084)';
        if (d === 0x14) comment += ' (D00094)';
        if (d === 0xF8) comment += ' (' + hex(iyAddr) + ')';
      } else if (op2 === 0x7E) {
        const d = u8(pc + 2);
        bytes = 3;
        const iyAddr = 0xD00080 + signed8(d);
        mnemonic = 'LD A,(IY+' + hex(d, 2) + ')';
        comment = '  ; [' + hex(iyAddr) + ']';
        if (d === 0x0F) comment += ' *** D0008F MODE BITS ***';
      } else {
        bytes = 2;
        mnemonic = 'FD ' + hex(op2, 2);
      }
    }
    else if (op === 0xCD) { const t = u24(pc+1); bytes = 4; mnemonic = 'CALL ' + hex(t); comment = annotate(t); }
    else if (op === 0xC3) { const t = u24(pc+1); bytes = 4; mnemonic = 'JP ' + hex(t); comment = annotate(t); }
    else if (op === 0xC2 || op === 0xCA || op === 0xD2 || op === 0xDA) {
      const ccMap = { 0xC2: 'NZ', 0xCA: 'Z', 0xD2: 'NC', 0xDA: 'C' };
      const t = u24(pc+1); bytes = 4;
      mnemonic = 'JP ' + ccMap[op] + ',' + hex(t); comment = annotate(t);
    }
    else if (op === 0x18) { const d = signed8(u8(pc+1)); bytes = 2; mnemonic = 'JR ' + hex(pc+2+d); comment = '  ; off=' + d; }
    else if (op === 0x20 || op === 0x28 || op === 0x30 || op === 0x38) {
      const ccMap = { 0x20: 'NZ', 0x28: 'Z', 0x30: 'NC', 0x38: 'C' };
      const d = signed8(u8(pc+1)); bytes = 2;
      mnemonic = 'JR ' + ccMap[op] + ',' + hex(pc+2+d); comment = '  ; off=' + d;
    }
    else if (op === 0x3A) { const a = u24(pc+1); bytes = 4; mnemonic = 'LD A,(' + hex(a) + ')'; if (a===0xD02032) comment = '  ; *** GATE BYTE ***'; else if (a===0xD00603) comment = '  ; D00603 flag'; }
    else if (op === 0x32) { const a = u24(pc+1); bytes = 4; mnemonic = 'LD (' + hex(a) + '),A'; if (a===0xD005F8) comment = '  ; *** D005F8 full-redraw ***'; else if (a===0xD02032) comment = '  ; *** GATE BYTE ***'; }
    else if (op === 0x2A) { const a = u24(pc+1); bytes = 4; mnemonic = 'LD HL,(' + hex(a) + ')'; }
    else if (op === 0x21) { const n = u24(pc+1); bytes = 4; mnemonic = 'LD HL,' + hex(n); if (n===0xD02032) comment = '  ; *** GATE addr ***'; else if (n===0xD005F8) comment = '  ; *** D005F8 ***'; }
    else if (op === 0x11) { const n = u24(pc+1); bytes = 4; mnemonic = 'LD DE,' + hex(n); }
    else if (op === 0xE6) { bytes = 2; mnemonic = 'AND ' + hex(u8(pc+1),2); }
    else if (op === 0xF6) { bytes = 2; mnemonic = 'OR ' + hex(u8(pc+1),2); }
    else if (op === 0xFE) { bytes = 2; mnemonic = 'CP ' + hex(u8(pc+1),2); }
    else if (op === 0xAF) { bytes = 1; mnemonic = 'XOR A'; }
    else if (op === 0xC9) { bytes = 1; mnemonic = 'RET'; }
    else if (op === 0xC0) { bytes = 1; mnemonic = 'RET NZ'; }
    else if (op === 0xC8) { bytes = 1; mnemonic = 'RET Z'; }
    else if (op === 0xD0) { bytes = 1; mnemonic = 'RET NC'; }
    else if (op === 0xD8) { bytes = 1; mnemonic = 'RET C'; }
    else if (op === 0xC5) { bytes = 1; mnemonic = 'PUSH BC'; }
    else if (op === 0xD5) { bytes = 1; mnemonic = 'PUSH DE'; }
    else if (op === 0xE5) { bytes = 1; mnemonic = 'PUSH HL'; }
    else if (op === 0xF5) { bytes = 1; mnemonic = 'PUSH AF'; }
    else if (op === 0xC1) { bytes = 1; mnemonic = 'POP BC'; }
    else if (op === 0xD1) { bytes = 1; mnemonic = 'POP DE'; }
    else if (op === 0xE1) { bytes = 1; mnemonic = 'POP HL'; }
    else if (op === 0xF1) { bytes = 1; mnemonic = 'POP AF'; }
    else if (op === 0x3E) { bytes = 2; mnemonic = 'LD A,' + hex(u8(pc+1),2); }
    else if (op === 0x06) { bytes = 2; mnemonic = 'LD B,' + hex(u8(pc+1),2); }
    else if (op === 0x0E) { bytes = 2; mnemonic = 'LD C,' + hex(u8(pc+1),2); }
    else if (op === 0x16) { bytes = 2; mnemonic = 'LD D,' + hex(u8(pc+1),2); }
    else if (op === 0x1E) { bytes = 2; mnemonic = 'LD E,' + hex(u8(pc+1),2); }
    else if (op === 0x47) { bytes = 1; mnemonic = 'LD B,A'; }
    else if (op === 0x4F) { bytes = 1; mnemonic = 'LD C,A'; }
    else if (op === 0x57) { bytes = 1; mnemonic = 'LD D,A'; }
    else if (op === 0x5F) { bytes = 1; mnemonic = 'LD E,A'; }
    else if (op === 0x78) { bytes = 1; mnemonic = 'LD A,B'; }
    else if (op === 0x79) { bytes = 1; mnemonic = 'LD A,C'; }
    else if (op === 0x7A) { bytes = 1; mnemonic = 'LD A,D'; }
    else if (op === 0x7B) { bytes = 1; mnemonic = 'LD A,E'; }
    else if (op === 0x7E) { bytes = 1; mnemonic = 'LD A,(HL)'; }
    else if (op === 0x48) { bytes = 1; mnemonic = 'LD C,B'; }
    else if (op === 0xA0) { bytes = 1; mnemonic = 'AND B'; }
    else if (op === 0xA1) { bytes = 1; mnemonic = 'AND C'; }
    else if (op === 0xA6) { bytes = 1; mnemonic = 'AND (HL)'; }
    else if (op === 0xB0) { bytes = 1; mnemonic = 'OR B'; }
    else if (op === 0xB7) { bytes = 1; mnemonic = 'OR A'; comment = '  ; set flags'; }
    else if (op === 0xB8) { bytes = 1; mnemonic = 'CP B'; }
    else if (op === 0x87) { bytes = 1; mnemonic = 'ADD A,A'; comment = '  ; bit <<= 1'; }
    else if (op === 0x14) { bytes = 1; mnemonic = 'INC D'; }
    else if (op === 0x23) { bytes = 1; mnemonic = 'INC HL'; }
    else if (op === 0x3D) { bytes = 1; mnemonic = 'DEC A'; }
    else if (op === 0x19) { bytes = 1; mnemonic = 'ADD HL,DE'; }
    else if (op === 0xCB) {
      const op2 = u8(pc+1); bytes = 2;
      const bitN = (op2 >> 3) & 7;
      const regMap = ['B','C','D','E','H','L','(HL)','A'];
      const r = regMap[op2 & 7];
      if ((op2 & 0xC0) === 0x40)      mnemonic = 'BIT ' + bitN + ',' + r;
      else if ((op2 & 0xC0) === 0xC0) mnemonic = 'SET ' + bitN + ',' + r;
      else if ((op2 & 0xC0) === 0x80) mnemonic = 'RES ' + bitN + ',' + r;
      else                             mnemonic = 'CB ' + hex(op2, 2);
    }
    else if (op === 0xC4) { const t = u24(pc+1); bytes = 4; mnemonic = 'CALL NZ,' + hex(t); comment = annotate(t); }
    else if (op === 0xCC) { const t = u24(pc+1); bytes = 4; mnemonic = 'CALL Z,' + hex(t); comment = annotate(t); }
    else if (op === 0xD4) { const t = u24(pc+1); bytes = 4; mnemonic = 'CALL NC,' + hex(t); comment = annotate(t); }
    else if (op === 0xDC) { const t = u24(pc+1); bytes = 4; mnemonic = 'CALL C,' + hex(t); comment = annotate(t); }
    else if (op === 0xED) {
      const op2 = u8(pc+1); bytes = 2;
      if (op2 === 0x52) mnemonic = 'SBC HL,DE';
      else mnemonic = 'ED ' + hex(op2, 2);
    }
    else if (op === 0x00) { bytes = 1; mnemonic = 'NOP'; }
    else if (op === 0x36) { bytes = 2; mnemonic = 'LD (HL),' + hex(u8(pc+1),2); }
    else if (op === 0xC6) { bytes = 2; mnemonic = 'ADD A,' + hex(u8(pc+1),2); }
    else { bytes = 1; mnemonic = 'DB ' + hex(op, 2); }

    const rawHex = hexBytes(lineAddr, bytes);
    lines.push('  ' + hex(lineAddr) + ':  ' + rawHex.padEnd(14) + '  ' + mnemonic + comment);
    pc += bytes;
  }

  return lines.join('\n');
}

console.log('Phase 514: Full decode of home-screen populator function at 0x044D3F');
console.log('Entry via jump table (addr at 0x044A6E). Trampoline at 0x044D3B.');
console.log('ROM size: ' + rom.length + ' bytes');

console.log(disasm(0x044D3B, 335, 'HOME-SCREEN POPULATOR CALLER @ 0x044D3F (trampoline at 044D3B)'));
console.log(disasm(0x044E85, 64, 'SUB 044E85 (post-render path)'));
console.log(disasm(0x044EC5, 80, 'ENTRY POST-RENDER @ 0x044EC5'));
console.log(disasm(0x044FC2, 48, 'POST-POPULATOR CHECK @ 0x044FC2'));
console.log(disasm(0x06E4BA, 6, 'READ MODE BITS @ 0x06E4BA'));

console.log('\n' + '='.repeat(76));
console.log('  ANALYSIS: D02032 GATE BYTE + MODE SELECTION');
console.log('='.repeat(76));

console.log('');
console.log('FUNCTION STRUCTURE (entry 0x044D3F, trampoline 0x044D3B, ~330 bytes):');
console.log('  Address 0x044D3F stored at 0x044A6E (jump table entry).');
console.log('  0x044D3B: JP 0x061D52 — error exit trampoline.');
console.log('');
console.log('1. SETUP (044D3F-044D58):');
console.log('   - LD HL,D01EA8; CALL 07F9FB (save cursor state)');
console.log('   - LD HL,D01EC3; CALL 07F81D (save display state)');
console.log('   - JR C,044D3B (error -> JP 061D52)');
console.log('   - CALL 0452F5 (init), CALL 08290E (init check, NOT system_lock)');
console.log('');
console.log('2. CONDITIONAL REDRAW (044D59-044D7A):');
console.log('   - CALL 045357 check -> if NZ: set D005F8=0xFF, 4x CALL 082961 (system_lock)');
console.log('   - CALL 028539 -> JR Z skips mode selection');
console.log('');
console.log('3. MODE SELECTION via IY+0F (044D7C-044D9F):');
console.log('   bit 2 set -> mode=3 (graph)');
console.log('   bit 3 set -> mode=6 (table)');
console.log('   bit 4 set -> mode=5 (other)');
console.log('   none set  -> fall through to D00603 check');
console.log('   Mode value tested against gate: AND (HL) / CP B');
console.log('   If gate lacks mode bits -> JP 061D46 (exit)');
console.log('');
console.log('4. D00603 / BIT 0 CHECKS (044D9F-044DAE):');
console.log('   D00603=0 -> early exit (0446F2)');
console.log('   IY+0F bit 0 set -> alternate path (044BD3)');
console.log('');
console.log('5. POPULATOR (044DB0-044DB6):');
console.log('   CALL 06DB4E (pre-setup)');
console.log('   CALL 07D583 (THE POPULATOR - builds display list)');
console.log('');
console.log('6. POST-POP FLAGS (044DB8-044DBF):');
console.log('   SET 5,(IY+03) = D00083 bit 5 (list valid)');
console.log('   CALL 044FC2 (post check)');
console.log('');
console.log('7. RENDER LOOP (044DC0-044E5A):');
console.log('   3 passes: bit=1,2,4 (terminates at 8)');
console.log('   Each pass:');
console.log('     - CALL 06E4BA: if mode bits set, BYPASS gate check');
console.log('     - LD A,(D02032): gate & bit -> skip if zero');
console.log('     - Render: get entry, check type, render, finalize');
console.log('     - Type 0x0E sets D005F8 bit 6');
console.log('     - ADD A,A shifts bit left for next pass');
console.log('');
console.log('8. CLEANUP (044E5E-044E7C):');
console.log('   RES 5,(IY+03) clear list-valid flag');
console.log('   CALL 07D5D3 post-populator chain');
console.log('   JP 044DBB -> outer loop re-entry');
console.log('');
console.log('KEY: D02032 is a 3-bit render-pass mask (bits 0-2).');
console.log('     Mode bits in D0008F override it (force all passes).');
console.log('     D005F8=0xFF signals full redraw; bit 6 marks type-14 entries.');
console.log('');
console.log('Phase 514 decode complete.');
