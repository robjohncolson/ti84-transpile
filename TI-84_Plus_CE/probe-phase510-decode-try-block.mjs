#!/usr/bin/env node
/**
 * probe-phase510-decode-try-block.mjs
 *
 * Decode the TI-OS structured exception handling (TRY-BLOCK) mechanism.
 *
 * Key functions in the 0x061D80..0x061E50 region:
 *   0x061DEF — enter try-block (called before protected code)
 *   0x061E20 — exit try-block / teardown (called after protected code)
 *   0x061DB6 — related exception handling function
 *
 * Context: 0x07D5D7 saves SP to D008E0, calls 0x061DEF (enter try),
 * calls 0x07D610 (protected work), calls 0x061E20 (exit try).
 * If code inside the try-block errors, SP is restored from D008E0.
 *
 * Pure static disassembly -- no CPU execution, just ROM byte reading.
 * Self-contained eZ80 ADL-mode decoder (does NOT use ez80-decoder.js).
 */

import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

function rd8(addr) { return rom[addr]; }
function rd16(addr) { return rom[addr] | (rom[addr + 1] << 8); }
function rd24(addr) { return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16); }
function hex8(v) { return v.toString(16).padStart(2, '0').toUpperCase(); }
function hex16(v) { return v.toString(16).padStart(4, '0').toUpperCase(); }
function hex24(v) { return v.toString(16).padStart(6, '0').toUpperCase(); }
function hexBytes(addr, len) {
  const parts = [];
  for (let i = 0; i < len; i++) parts.push(hex8(rom[addr + i]));
  return parts.join(' ');
}

// Known RAM/ROM annotations
const knownAddrs = {
  0xD008E0: 'SP_save_for_try_block',
  0xD008E3: 'try_block_handler_ptr?',
  0xD008E6: 'try_block_depth?',
  0xD02FE6: 'conditional_gate_for_chain',
  0xD005F8: 'active_cursor_descriptor',
  0xD02032: 'cursor_type_activation_flags',
  0x07D5D7: 'post_populator_chain(caller)',
  0x07D610: 'protected_work(try_body)',
  0x061DEF: 'enter_try_block',
  0x061E20: 'exit_try_block',
  0x061DB6: 'exception_handler_related',
};

function annotate(addr) {
  if (knownAddrs[addr]) return `  ; ${knownAddrs[addr]}`;
  if (addr >= 0xD008D0 && addr <= 0xD008FF) return `  ; try_block_data+${(addr - 0xD008D0).toString(16)}`;
  return '';
}

// Exception-handling pattern annotations
function exceptionAnnotation(text, pc) {
  const annotations = [];
  if (text.includes('LD (') && text.includes('),SP')) annotations.push('<<< SP SAVE (try-block entry pattern)');
  if (text.includes('LD SP,(')) annotations.push('<<< SP RESTORE (exception recovery pattern)');
  if (text.includes('EX (SP),HL')) annotations.push('<<< HANDLER REGISTRATION via stack swap');
  if (text.includes('EX (SP),IX') || text.includes('EX (SP),IY')) annotations.push('<<< HANDLER REGISTRATION via index stack swap');
  if (text.includes('LD SP,HL')) annotations.push('<<< SP = HL (stack pointer override)');
  if (text.includes('0xD008E0')) annotations.push('<<< D008E0 = try-block SP save location');
  return annotations.length ? '  ' + annotations.join(' | ') : '';
}

/**
 * Disassemble one eZ80 ADL-mode instruction at `pc`.
 * Returns { pc: next_pc, text: "mnemonic", bytes: count, hex: "XX XX ...", calls: [addr,...] }
 */
function disasm1(pc) {
  const startPc = pc;
  let b0 = rd8(pc);
  let calls = [];
  let prefix = '';

  // Handle .SIS prefix (0x40)
  let sisMode = false;
  if (b0 === 0x40 && rd8(pc + 1) !== 0x40) {
    const nextB = rd8(pc + 1);
    if (nextB === 0xCD || nextB === 0xC3 || nextB === 0x21 || nextB === 0x11 ||
        nextB === 0x01 || nextB === 0x3A || nextB === 0x32 || nextB === 0x2A ||
        nextB === 0x22 || nextB === 0xC2 || nextB === 0xCA || nextB === 0xD2 ||
        nextB === 0xDA || nextB === 0xE2 || nextB === 0xEA || nextB === 0xF2 ||
        nextB === 0xFA || nextB === 0xC4 || nextB === 0xCC || nextB === 0xD4 ||
        nextB === 0xDC || nextB === 0xE4 || nextB === 0xEC || nextB === 0xF4 ||
        nextB === 0xFC || nextB === 0x31 || nextB === 0xED) {
      sisMode = true;
      prefix = '.SIS ';
      pc++;
      b0 = rd8(pc);
    }
  }

  // Handle .LIS prefix (0x49)
  if (b0 === 0x49 && !sisMode) {
    const nextB = rd8(pc + 1);
    if (nextB === 0xCD || nextB === 0xC3 || nextB === 0x21 || nextB === 0x11 ||
        nextB === 0x01 || nextB === 0x3A || nextB === 0x32 || nextB === 0x2A ||
        nextB === 0x22 || nextB === 0xED) {
      prefix = '.LIS ';
      pc++;
      b0 = rd8(pc);
    }
  }

  // Handle .SIL prefix (0x52)
  if (b0 === 0x52 && !sisMode && prefix === '') {
    const nextB = rd8(pc + 1);
    if (nextB === 0xCD || nextB === 0xC3 || nextB === 0x21 || nextB === 0x11 ||
        nextB === 0x01 || nextB === 0x3A || nextB === 0x32 || nextB === 0x2A ||
        nextB === 0x22 || nextB === 0xED) {
      sisMode = true;
      prefix = '.SIL ';
      pc++;
      b0 = rd8(pc);
    }
  }

  const operandSize = sisMode ? 2 : 3;

  function readAddr() {
    return sisMode ? rd16(pc + 1) : rd24(pc + 1);
  }

  // ED prefix
  if (b0 === 0xED) {
    const b1 = rd8(pc + 1);
    let mnemonic;
    if (b1 === 0xB0) { mnemonic = prefix + 'LDIR'; pc += 2; }
    else if (b1 === 0xA0) { mnemonic = prefix + 'LDI'; pc += 2; }
    else if (b1 === 0xB8) { mnemonic = prefix + 'LDDR'; pc += 2; }
    else if (b1 === 0xA8) { mnemonic = prefix + 'LDD'; pc += 2; }
    else if (b1 === 0x5B) { const a = sisMode?rd16(pc+2):rd24(pc+2); mnemonic = prefix + `LD DE,(0x${hex24(a)})${annotate(a)}`; pc += 2 + operandSize; }
    else if (b1 === 0x53) { const a = sisMode?rd16(pc+2):rd24(pc+2); mnemonic = prefix + `LD (0x${hex24(a)}),DE${annotate(a)}`; pc += 2 + operandSize; }
    else if (b1 === 0x4B) { const a = sisMode?rd16(pc+2):rd24(pc+2); mnemonic = prefix + `LD BC,(0x${hex24(a)})${annotate(a)}`; pc += 2 + operandSize; }
    else if (b1 === 0x43) { const a = sisMode?rd16(pc+2):rd24(pc+2); mnemonic = prefix + `LD (0x${hex24(a)}),BC${annotate(a)}`; pc += 2 + operandSize; }
    else if (b1 === 0x6B) { const a = sisMode?rd16(pc+2):rd24(pc+2); mnemonic = prefix + `LD HL,(0x${hex24(a)})${annotate(a)}`; pc += 2 + operandSize; }
    else if (b1 === 0x63) { const a = sisMode?rd16(pc+2):rd24(pc+2); mnemonic = prefix + `LD (0x${hex24(a)}),HL${annotate(a)}`; pc += 2 + operandSize; }
    else if (b1 === 0x7B) { const a = sisMode?rd16(pc+2):rd24(pc+2); mnemonic = prefix + `LD SP,(0x${hex24(a)})${annotate(a)}`; pc += 2 + operandSize; }
    else if (b1 === 0x73) { const a = sisMode?rd16(pc+2):rd24(pc+2); mnemonic = prefix + `LD (0x${hex24(a)}),SP${annotate(a)}`; pc += 2 + operandSize; }
    else if (b1 === 0x44) { mnemonic = prefix + 'NEG'; pc += 2; }
    else if (b1 === 0x4D) { mnemonic = prefix + 'RETI'; pc += 2; }
    else if (b1 === 0x45) { mnemonic = prefix + 'RETN'; pc += 2; }
    else if (b1 === 0x46) { mnemonic = prefix + 'IM 0'; pc += 2; }
    else if (b1 === 0x56) { mnemonic = prefix + 'IM 1'; pc += 2; }
    else if (b1 === 0x5E) { mnemonic = prefix + 'IM 2'; pc += 2; }
    else if (b1 === 0x47) { mnemonic = prefix + 'LD I,A'; pc += 2; }
    else if (b1 === 0x57) { mnemonic = prefix + 'LD A,I'; pc += 2; }
    else if (b1 === 0x4F) { mnemonic = prefix + 'LD R,A'; pc += 2; }
    else if (b1 === 0x6F) { mnemonic = prefix + 'RLD'; pc += 2; }
    else if (b1 === 0x67) { mnemonic = prefix + 'RRD'; pc += 2; }
    else if (b1 === 0x42) { mnemonic = prefix + 'SBC HL,BC'; pc += 2; }
    else if (b1 === 0x52) { mnemonic = prefix + 'SBC HL,DE'; pc += 2; }
    else if (b1 === 0x62) { mnemonic = prefix + 'SBC HL,HL'; pc += 2; }
    else if (b1 === 0x72) { mnemonic = prefix + 'SBC HL,SP'; pc += 2; }
    else if (b1 === 0x4A) { mnemonic = prefix + 'ADC HL,BC'; pc += 2; }
    else if (b1 === 0x5A) { mnemonic = prefix + 'ADC HL,DE'; pc += 2; }
    else if (b1 === 0x6A) { mnemonic = prefix + 'ADC HL,HL'; pc += 2; }
    else if (b1 === 0x7A) { mnemonic = prefix + 'ADC HL,SP'; pc += 2; }
    else if (b1 === 0xA1) { mnemonic = prefix + 'CPI'; pc += 2; }
    else if (b1 === 0xA9) { mnemonic = prefix + 'CPD'; pc += 2; }
    else if (b1 === 0xB1) { mnemonic = prefix + 'CPIR'; pc += 2; }
    else if (b1 === 0xB9) { mnemonic = prefix + 'CPDR'; pc += 2; }
    else if ((b1 & 0xC7) === 0x40) {
      const r = (b1 >> 3) & 7;
      const rn = ['B','C','D','E','H','L','(HL)','A'][r];
      mnemonic = prefix + `IN ${rn},(C)`; pc += 2;
    }
    else if ((b1 & 0xC7) === 0x41) {
      const r = (b1 >> 3) & 7;
      const rn = ['B','C','D','E','H','L','0','A'][r];
      mnemonic = prefix + `OUT (C),${rn}`; pc += 2;
    }
    else { mnemonic = prefix + `DB 0xED, 0x${hex8(b1)}`; pc += 2; }
    return { pc, text: mnemonic, bytes: pc - startPc, hex: hexBytes(startPc, pc - startPc), calls };
  }

  // DD prefix (IX)
  if (b0 === 0xDD) {
    return disasmIndexed(pc, startPc, 'IX', prefix, sisMode, operandSize);
  }

  // FD prefix (IY)
  if (b0 === 0xFD) {
    return disasmIndexed(pc, startPc, 'IY', prefix, sisMode, operandSize);
  }

  // CB prefix (bit operations)
  if (b0 === 0xCB) {
    const b1 = rd8(pc + 1);
    const r = b1 & 7;
    const rn = ['B','C','D','E','H','L','(HL)','A'][r];
    const op = (b1 >> 6) & 3;
    const bit = (b1 >> 3) & 7;
    let mnemonic;
    if (op === 0) {
      const ops = ['RLC','RRC','RL','RR','SLA','SRA','SLL','SRL'];
      mnemonic = prefix + `${ops[bit]} ${rn}`;
    } else if (op === 1) {
      mnemonic = prefix + `BIT ${bit},${rn}`;
    } else if (op === 2) {
      mnemonic = prefix + `RES ${bit},${rn}`;
    } else {
      mnemonic = prefix + `SET ${bit},${rn}`;
    }
    pc += 2;
    return { pc, text: mnemonic, bytes: pc - startPc, hex: hexBytes(startPc, pc - startPc), calls };
  }

  // Main opcodes
  let mnemonic;
  switch (b0) {
    case 0x00: mnemonic = prefix + 'NOP'; pc += 1; break;
    case 0x01: { const v = readAddr(); mnemonic = prefix + `LD BC,0x${hex24(v)}${annotate(v)}`; pc += 1 + operandSize; break; }
    case 0x02: mnemonic = prefix + 'LD (BC),A'; pc += 1; break;
    case 0x03: mnemonic = prefix + 'INC BC'; pc += 1; break;
    case 0x04: mnemonic = prefix + 'INC B'; pc += 1; break;
    case 0x05: mnemonic = prefix + 'DEC B'; pc += 1; break;
    case 0x06: mnemonic = prefix + `LD B,0x${hex8(rd8(pc+1))}`; pc += 2; break;
    case 0x07: mnemonic = prefix + 'RLCA'; pc += 1; break;
    case 0x08: mnemonic = prefix + "EX AF,AF'"; pc += 1; break;
    case 0x09: mnemonic = prefix + 'ADD HL,BC'; pc += 1; break;
    case 0x0A: mnemonic = prefix + 'LD A,(BC)'; pc += 1; break;
    case 0x0B: mnemonic = prefix + 'DEC BC'; pc += 1; break;
    case 0x0C: mnemonic = prefix + 'INC C'; pc += 1; break;
    case 0x0D: mnemonic = prefix + 'DEC C'; pc += 1; break;
    case 0x0E: mnemonic = prefix + `LD C,0x${hex8(rd8(pc+1))}`; pc += 2; break;
    case 0x0F: mnemonic = prefix + 'RRCA'; pc += 1; break;
    case 0x10: { const rel = rd8(pc+1); const t = pc + 2 + ((rel & 0x80) ? rel - 256 : rel); mnemonic = prefix + `DJNZ 0x${hex24(t)}`; pc += 2; break; }
    case 0x11: { const v = readAddr(); mnemonic = prefix + `LD DE,0x${hex24(v)}${annotate(v)}`; pc += 1 + operandSize; break; }
    case 0x12: mnemonic = prefix + 'LD (DE),A'; pc += 1; break;
    case 0x13: mnemonic = prefix + 'INC DE'; pc += 1; break;
    case 0x14: mnemonic = prefix + 'INC D'; pc += 1; break;
    case 0x15: mnemonic = prefix + 'DEC D'; pc += 1; break;
    case 0x16: mnemonic = prefix + `LD D,0x${hex8(rd8(pc+1))}`; pc += 2; break;
    case 0x17: mnemonic = prefix + 'RLA'; pc += 1; break;
    case 0x18: { const rel = rd8(pc+1); const t = pc + 2 + ((rel & 0x80) ? rel - 256 : rel); mnemonic = prefix + `JR 0x${hex24(t)}`; pc += 2; break; }
    case 0x19: mnemonic = prefix + 'ADD HL,DE'; pc += 1; break;
    case 0x1A: mnemonic = prefix + 'LD A,(DE)'; pc += 1; break;
    case 0x1B: mnemonic = prefix + 'DEC DE'; pc += 1; break;
    case 0x1C: mnemonic = prefix + 'INC E'; pc += 1; break;
    case 0x1D: mnemonic = prefix + 'DEC E'; pc += 1; break;
    case 0x1E: mnemonic = prefix + `LD E,0x${hex8(rd8(pc+1))}`; pc += 2; break;
    case 0x1F: mnemonic = prefix + 'RRA'; pc += 1; break;
    case 0x20: { const rel = rd8(pc+1); const t = pc + 2 + ((rel & 0x80) ? rel - 256 : rel); mnemonic = prefix + `JR NZ,0x${hex24(t)}`; pc += 2; break; }
    case 0x21: { const v = readAddr(); mnemonic = prefix + `LD HL,0x${hex24(v)}${annotate(v)}`; pc += 1 + operandSize; break; }
    case 0x22: { const a = readAddr(); mnemonic = prefix + `LD (0x${hex24(a)}),HL${annotate(a)}`; pc += 1 + operandSize; break; }
    case 0x23: mnemonic = prefix + 'INC HL'; pc += 1; break;
    case 0x24: mnemonic = prefix + 'INC H'; pc += 1; break;
    case 0x25: mnemonic = prefix + 'DEC H'; pc += 1; break;
    case 0x26: mnemonic = prefix + `LD H,0x${hex8(rd8(pc+1))}`; pc += 2; break;
    case 0x27: mnemonic = prefix + 'DAA'; pc += 1; break;
    case 0x28: { const rel = rd8(pc+1); const t = pc + 2 + ((rel & 0x80) ? rel - 256 : rel); mnemonic = prefix + `JR Z,0x${hex24(t)}`; pc += 2; break; }
    case 0x29: mnemonic = prefix + 'ADD HL,HL'; pc += 1; break;
    case 0x2A: { const a = readAddr(); mnemonic = prefix + `LD HL,(0x${hex24(a)})${annotate(a)}`; pc += 1 + operandSize; break; }
    case 0x2B: mnemonic = prefix + 'DEC HL'; pc += 1; break;
    case 0x2C: mnemonic = prefix + 'INC L'; pc += 1; break;
    case 0x2D: mnemonic = prefix + 'DEC L'; pc += 1; break;
    case 0x2E: mnemonic = prefix + `LD L,0x${hex8(rd8(pc+1))}`; pc += 2; break;
    case 0x2F: mnemonic = prefix + 'CPL'; pc += 1; break;
    case 0x30: { const rel = rd8(pc+1); const t = pc + 2 + ((rel & 0x80) ? rel - 256 : rel); mnemonic = prefix + `JR NC,0x${hex24(t)}`; pc += 2; break; }
    case 0x31: { const v = readAddr(); mnemonic = prefix + `LD SP,0x${hex24(v)}`; pc += 1 + operandSize; break; }
    case 0x32: { const a = readAddr(); mnemonic = prefix + `LD (0x${hex24(a)}),A${annotate(a)}`; pc += 1 + operandSize; break; }
    case 0x33: mnemonic = prefix + 'INC SP'; pc += 1; break;
    case 0x34: mnemonic = prefix + 'INC (HL)'; pc += 1; break;
    case 0x35: mnemonic = prefix + 'DEC (HL)'; pc += 1; break;
    case 0x36: mnemonic = prefix + `LD (HL),0x${hex8(rd8(pc+1))}`; pc += 2; break;
    case 0x37: mnemonic = prefix + 'SCF'; pc += 1; break;
    case 0x38: { const rel = rd8(pc+1); const t = pc + 2 + ((rel & 0x80) ? rel - 256 : rel); mnemonic = prefix + `JR C,0x${hex24(t)}`; pc += 2; break; }
    case 0x39: mnemonic = prefix + 'ADD HL,SP'; pc += 1; break;
    case 0x3A: { const a = readAddr(); mnemonic = prefix + `LD A,(0x${hex24(a)})${annotate(a)}`; pc += 1 + operandSize; break; }
    case 0x3B: mnemonic = prefix + 'DEC SP'; pc += 1; break;
    case 0x3C: mnemonic = prefix + 'INC A'; pc += 1; break;
    case 0x3D: mnemonic = prefix + 'DEC A'; pc += 1; break;
    case 0x3E: mnemonic = prefix + `LD A,0x${hex8(rd8(pc+1))}`; pc += 2; break;
    case 0x3F: mnemonic = prefix + 'CCF'; pc += 1; break;
    case 0x76: mnemonic = prefix + 'HALT'; pc += 1; break;
    default:
      if (b0 >= 0x40 && b0 <= 0x7F) {
        const dst = (b0 >> 3) & 7;
        const src = b0 & 7;
        const rn = ['B','C','D','E','H','L','(HL)','A'];
        mnemonic = prefix + `LD ${rn[dst]},${rn[src]}`;
        pc += 1;
      } else if (b0 >= 0x80 && b0 <= 0xBF) {
        const op = (b0 >> 3) & 7;
        const r = b0 & 7;
        const rn = ['B','C','D','E','H','L','(HL)','A'];
        const ops = ['ADD A,','ADC A,','SUB ','SBC A,','AND ','XOR ','OR ','CP '];
        mnemonic = prefix + `${ops[op]}${rn[r]}`;
        pc += 1;
      } else {
        switch (b0) {
          case 0xC0: mnemonic = prefix + 'RET NZ'; pc += 1; break;
          case 0xC1: mnemonic = prefix + 'POP BC'; pc += 1; break;
          case 0xC2: { const a = readAddr(); mnemonic = prefix + `JP NZ,0x${hex24(a)}${annotate(a)}`; pc += 1 + operandSize; break; }
          case 0xC3: { const a = readAddr(); mnemonic = prefix + `JP 0x${hex24(a)}${annotate(a)}`; pc += 1 + operandSize; calls.push(a); break; }
          case 0xC4: { const a = readAddr(); mnemonic = prefix + `CALL NZ,0x${hex24(a)}${annotate(a)}`; pc += 1 + operandSize; calls.push(a); break; }
          case 0xC5: mnemonic = prefix + 'PUSH BC'; pc += 1; break;
          case 0xC6: mnemonic = prefix + `ADD A,0x${hex8(rd8(pc+1))}`; pc += 2; break;
          case 0xC7: mnemonic = prefix + 'RST 00h'; pc += 1; break;
          case 0xC8: mnemonic = prefix + 'RET Z'; pc += 1; break;
          case 0xC9: mnemonic = prefix + 'RET'; pc += 1; break;
          case 0xCA: { const a = readAddr(); mnemonic = prefix + `JP Z,0x${hex24(a)}${annotate(a)}`; pc += 1 + operandSize; break; }
          case 0xCC: { const a = readAddr(); mnemonic = prefix + `CALL Z,0x${hex24(a)}${annotate(a)}`; pc += 1 + operandSize; calls.push(a); break; }
          case 0xCD: { const a = readAddr(); mnemonic = prefix + `CALL 0x${hex24(a)}${annotate(a)}`; pc += 1 + operandSize; calls.push(a); break; }
          case 0xCE: mnemonic = prefix + `ADC A,0x${hex8(rd8(pc+1))}`; pc += 2; break;
          case 0xCF: mnemonic = prefix + 'RST 08h'; pc += 1; break;
          case 0xD0: mnemonic = prefix + 'RET NC'; pc += 1; break;
          case 0xD1: mnemonic = prefix + 'POP DE'; pc += 1; break;
          case 0xD2: { const a = readAddr(); mnemonic = prefix + `JP NC,0x${hex24(a)}${annotate(a)}`; pc += 1 + operandSize; break; }
          case 0xD3: mnemonic = prefix + `OUT (0x${hex8(rd8(pc+1))}),A`; pc += 2; break;
          case 0xD4: { const a = readAddr(); mnemonic = prefix + `CALL NC,0x${hex24(a)}${annotate(a)}`; pc += 1 + operandSize; calls.push(a); break; }
          case 0xD5: mnemonic = prefix + 'PUSH DE'; pc += 1; break;
          case 0xD6: mnemonic = prefix + `SUB 0x${hex8(rd8(pc+1))}`; pc += 2; break;
          case 0xD7: mnemonic = prefix + 'RST 10h'; pc += 1; break;
          case 0xD8: mnemonic = prefix + 'RET C'; pc += 1; break;
          case 0xD9: mnemonic = prefix + 'EXX'; pc += 1; break;
          case 0xDA: { const a = readAddr(); mnemonic = prefix + `JP C,0x${hex24(a)}${annotate(a)}`; pc += 1 + operandSize; break; }
          case 0xDB: mnemonic = prefix + `IN A,(0x${hex8(rd8(pc+1))})`; pc += 2; break;
          case 0xDC: { const a = readAddr(); mnemonic = prefix + `CALL C,0x${hex24(a)}${annotate(a)}`; pc += 1 + operandSize; calls.push(a); break; }
          case 0xDE: mnemonic = prefix + `SBC A,0x${hex8(rd8(pc+1))}`; pc += 2; break;
          case 0xDF: mnemonic = prefix + 'RST 18h'; pc += 1; break;
          case 0xE0: mnemonic = prefix + 'RET PO'; pc += 1; break;
          case 0xE1: mnemonic = prefix + 'POP HL'; pc += 1; break;
          case 0xE2: { const a = readAddr(); mnemonic = prefix + `JP PO,0x${hex24(a)}${annotate(a)}`; pc += 1 + operandSize; break; }
          case 0xE3: mnemonic = prefix + 'EX (SP),HL'; pc += 1; break;
          case 0xE4: { const a = readAddr(); mnemonic = prefix + `CALL PO,0x${hex24(a)}${annotate(a)}`; pc += 1 + operandSize; calls.push(a); break; }
          case 0xE5: mnemonic = prefix + 'PUSH HL'; pc += 1; break;
          case 0xE6: mnemonic = prefix + `AND 0x${hex8(rd8(pc+1))}`; pc += 2; break;
          case 0xE7: mnemonic = prefix + 'RST 20h'; pc += 1; break;
          case 0xE8: mnemonic = prefix + 'RET PE'; pc += 1; break;
          case 0xE9: mnemonic = prefix + 'JP (HL)'; pc += 1; break;
          case 0xEA: { const a = readAddr(); mnemonic = prefix + `JP PE,0x${hex24(a)}${annotate(a)}`; pc += 1 + operandSize; break; }
          case 0xEB: mnemonic = prefix + 'EX DE,HL'; pc += 1; break;
          case 0xEC: { const a = readAddr(); mnemonic = prefix + `CALL PE,0x${hex24(a)}${annotate(a)}`; pc += 1 + operandSize; calls.push(a); break; }
          case 0xEE: mnemonic = prefix + `XOR 0x${hex8(rd8(pc+1))}`; pc += 2; break;
          case 0xEF: mnemonic = prefix + 'RST 28h'; pc += 1; break;
          case 0xF0: mnemonic = prefix + 'RET P'; pc += 1; break;
          case 0xF1: mnemonic = prefix + 'POP AF'; pc += 1; break;
          case 0xF2: { const a = readAddr(); mnemonic = prefix + `JP P,0x${hex24(a)}${annotate(a)}`; pc += 1 + operandSize; break; }
          case 0xF3: mnemonic = prefix + 'DI'; pc += 1; break;
          case 0xF4: { const a = readAddr(); mnemonic = prefix + `CALL P,0x${hex24(a)}${annotate(a)}`; pc += 1 + operandSize; calls.push(a); break; }
          case 0xF5: mnemonic = prefix + 'PUSH AF'; pc += 1; break;
          case 0xF6: mnemonic = prefix + `OR 0x${hex8(rd8(pc+1))}`; pc += 2; break;
          case 0xF7: mnemonic = prefix + 'RST 30h'; pc += 1; break;
          case 0xF8: mnemonic = prefix + 'RET M'; pc += 1; break;
          case 0xF9: mnemonic = prefix + 'LD SP,HL'; pc += 1; break;
          case 0xFA: { const a = readAddr(); mnemonic = prefix + `JP M,0x${hex24(a)}${annotate(a)}`; pc += 1 + operandSize; break; }
          case 0xFB: mnemonic = prefix + 'EI'; pc += 1; break;
          case 0xFC: { const a = readAddr(); mnemonic = prefix + `CALL M,0x${hex24(a)}${annotate(a)}`; pc += 1 + operandSize; calls.push(a); break; }
          case 0xFE: mnemonic = prefix + `CP 0x${hex8(rd8(pc+1))}`; pc += 2; break;
          case 0xFF: mnemonic = prefix + 'RST 38h'; pc += 1; break;
          default:
            mnemonic = prefix + `DB 0x${hex8(b0)}`;
            pc += 1;
            break;
        }
      }
      break;
  }

  return { pc, text: mnemonic, bytes: pc - startPc, hex: hexBytes(startPc, pc - startPc), calls };
}

function disasmIndexed(pc, startPc, reg, prefix, sisMode, operandSize) {
  const calls = [];
  pc++; // skip DD/FD
  const b1 = rd8(pc);

  // IX/IY CB prefix: DD CB dd xx
  if (b1 === 0xCB) {
    const d = rd8(pc + 1);
    const disp = (d & 0x80) ? d - 256 : d;
    const b3 = rd8(pc + 2);
    const op = (b3 >> 6) & 3;
    const bit = (b3 >> 3) & 7;
    const dispStr = disp >= 0 ? `+${disp}` : `${disp}`;
    let mnemonic;
    if (op === 1) mnemonic = prefix + `BIT ${bit},(${reg}${dispStr})`;
    else if (op === 2) mnemonic = prefix + `RES ${bit},(${reg}${dispStr})`;
    else if (op === 3) mnemonic = prefix + `SET ${bit},(${reg}${dispStr})`;
    else {
      const ops = ['RLC','RRC','RL','RR','SLA','SRA','SLL','SRL'];
      mnemonic = prefix + `${ops[bit]} (${reg}${dispStr})`;
    }
    pc += 3;
    return { pc, text: mnemonic, bytes: pc - startPc, hex: hexBytes(startPc, pc - startPc), calls };
  }

  let mnemonic;
  switch (b1) {
    case 0x09: mnemonic = prefix + `ADD ${reg},BC`; pc += 1; break;
    case 0x19: mnemonic = prefix + `ADD ${reg},DE`; pc += 1; break;
    case 0x21: { const v = sisMode?rd16(pc+1):rd24(pc+1); mnemonic = prefix + `LD ${reg},0x${hex24(v)}${annotate(v)}`; pc += 1 + operandSize; break; }
    case 0x22: { const a = sisMode?rd16(pc+1):rd24(pc+1); mnemonic = prefix + `LD (0x${hex24(a)}),${reg}${annotate(a)}`; pc += 1 + operandSize; break; }
    case 0x23: mnemonic = prefix + `INC ${reg}`; pc += 1; break;
    case 0x29: mnemonic = prefix + `ADD ${reg},${reg}`; pc += 1; break;
    case 0x2A: { const a = sisMode?rd16(pc+1):rd24(pc+1); mnemonic = prefix + `LD ${reg},(0x${hex24(a)})${annotate(a)}`; pc += 1 + operandSize; break; }
    case 0x2B: mnemonic = prefix + `DEC ${reg}`; pc += 1; break;
    case 0x34: { const d = rd8(pc+1); const disp = (d&0x80)?d-256:d; mnemonic = prefix + `INC (${reg}${disp>=0?'+':''}${disp})`; pc += 2; break; }
    case 0x35: { const d = rd8(pc+1); const disp = (d&0x80)?d-256:d; mnemonic = prefix + `DEC (${reg}${disp>=0?'+':''}${disp})`; pc += 2; break; }
    case 0x36: { const d = rd8(pc+1); const disp = (d&0x80)?d-256:d; const n = rd8(pc+2); mnemonic = prefix + `LD (${reg}${disp>=0?'+':''}${disp}),0x${hex8(n)}`; pc += 3; break; }
    case 0x39: mnemonic = prefix + `ADD ${reg},SP`; pc += 1; break;
    case 0x46: case 0x4E: case 0x56: case 0x5E: case 0x66: case 0x6E: case 0x7E: {
      const d = rd8(pc+1); const disp = (d&0x80)?d-256:d;
      const dst = (b1 >> 3) & 7;
      const rn = ['B','C','D','E','H','L','(HL)','A'];
      mnemonic = prefix + `LD ${rn[dst]},(${reg}${disp>=0?'+':''}${disp})`;
      pc += 2; break;
    }
    case 0x70: case 0x71: case 0x72: case 0x73: case 0x74: case 0x75: case 0x77: {
      const d = rd8(pc+1); const disp = (d&0x80)?d-256:d;
      const src = b1 & 7;
      const rn = ['B','C','D','E','H','L','(HL)','A'];
      mnemonic = prefix + `LD (${reg}${disp>=0?'+':''}${disp}),${rn[src]}`;
      pc += 2; break;
    }
    case 0x86: { const d = rd8(pc+1); const disp = (d&0x80)?d-256:d; mnemonic = prefix + `ADD A,(${reg}${disp>=0?'+':''}${disp})`; pc += 2; break; }
    case 0x8E: { const d = rd8(pc+1); const disp = (d&0x80)?d-256:d; mnemonic = prefix + `ADC A,(${reg}${disp>=0?'+':''}${disp})`; pc += 2; break; }
    case 0x96: { const d = rd8(pc+1); const disp = (d&0x80)?d-256:d; mnemonic = prefix + `SUB (${reg}${disp>=0?'+':''}${disp})`; pc += 2; break; }
    case 0x9E: { const d = rd8(pc+1); const disp = (d&0x80)?d-256:d; mnemonic = prefix + `SBC A,(${reg}${disp>=0?'+':''}${disp})`; pc += 2; break; }
    case 0xA6: { const d = rd8(pc+1); const disp = (d&0x80)?d-256:d; mnemonic = prefix + `AND (${reg}${disp>=0?'+':''}${disp})`; pc += 2; break; }
    case 0xAE: { const d = rd8(pc+1); const disp = (d&0x80)?d-256:d; mnemonic = prefix + `XOR (${reg}${disp>=0?'+':''}${disp})`; pc += 2; break; }
    case 0xB6: { const d = rd8(pc+1); const disp = (d&0x80)?d-256:d; mnemonic = prefix + `OR (${reg}${disp>=0?'+':''}${disp})`; pc += 2; break; }
    case 0xBE: { const d = rd8(pc+1); const disp = (d&0x80)?d-256:d; mnemonic = prefix + `CP (${reg}${disp>=0?'+':''}${disp})`; pc += 2; break; }
    case 0xE1: mnemonic = prefix + `POP ${reg}`; pc += 1; break;
    case 0xE3: mnemonic = prefix + `EX (SP),${reg}`; pc += 1; break;
    case 0xE5: mnemonic = prefix + `PUSH ${reg}`; pc += 1; break;
    case 0xE9: mnemonic = prefix + `JP (${reg})`; pc += 1; break;
    case 0xF9: mnemonic = prefix + `LD SP,${reg}`; pc += 1; break;
    default:
      mnemonic = prefix + `DB 0x${hex8(rd8(startPc))}, 0x${hex8(b1)}`;
      pc += 1;
      break;
  }
  return { pc, text: mnemonic, bytes: pc - startPc, hex: hexBytes(startPc, pc - startPc), calls };
}

// =========================================================
// Disassemble a region with exception-handling annotations
// =========================================================
function disasmRegion(startAddr, length, label) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`  ${label} -- 0x${hex24(startAddr)}..0x${hex24(startAddr + length - 1)} (${length} bytes)`);
  console.log('='.repeat(80));

  let pc = startAddr;
  const end = startAddr + length;
  const allCalls = [];
  const spSaves = [];
  const spRestores = [];
  const exSpSwaps = [];

  while (pc < end) {
    const addr = pc;
    const r = disasm1(pc);
    const addrStr = `0x${hex24(pc)}`;
    const hexStr = r.hex.padEnd(20);

    // Check for exception-handling patterns
    const ehAnnotation = exceptionAnnotation(r.text, addr);

    // Track specific patterns
    if (r.text.includes('LD (') && r.text.includes('),SP')) spSaves.push(addr);
    if (r.text.includes('LD SP,(')) spRestores.push(addr);
    if (r.text.includes('EX (SP),')) exSpSwaps.push(addr);

    // Add function entry markers for the three key addresses
    let marker = '';
    if (addr === 0x061DEF) marker = '\n  >>> ENTRY: enter_try_block (0x061DEF) <<<';
    if (addr === 0x061E20) marker = '\n  >>> ENTRY: exit_try_block (0x061E20) <<<';
    if (addr === 0x061DB6) marker = '\n  >>> ENTRY: exception_handler_related (0x061DB6) <<<';

    if (marker) console.log(marker);
    console.log(`  ${addrStr}  ${hexStr}  ${r.text}${ehAnnotation}`);
    allCalls.push(...r.calls);
    pc = r.pc;
  }

  return { allCalls, spSaves, spRestores, exSpSwaps };
}

// =========================================================
// Main
// =========================================================
console.log('probe-phase510-decode-try-block.mjs');
console.log('TI-OS Structured Exception Handling (TRY-BLOCK) Decoder');
console.log(`ROM size: ${rom.length} bytes`);

// 1. Raw hex dump of the region first
console.log(`\n${'='.repeat(80)}`);
console.log('  RAW HEX: 0x061D80..0x061E4F (208 bytes)');
console.log('='.repeat(80));
for (let offset = 0; offset < 208; offset += 16) {
  const addr = 0x061D80 + offset;
  const bytes = [];
  for (let i = 0; i < 16 && (offset + i) < 208; i++) {
    bytes.push(hex8(rom[addr + i]));
  }
  console.log(`  0x${hex24(addr)}  ${bytes.join(' ')}`);
}

// 2. Full region disassembly with exception-handling annotations
const region = disasmRegion(0x061D80, 0x061E50 - 0x061D80, 'FULL REGION: Exception Handling Block 0x061D80..0x061E4F');

// 3. Specific function analysis
console.log(`\n${'='.repeat(80)}`);
console.log('  SPECIFIC FUNCTION ANALYSIS');
console.log('='.repeat(80));

// 3a. 0x061DB6
console.log('\n--- 0x061DB6: Exception handler related ---');
let pc = 0x061DB6;
let instrCount = 0;
while (pc < 0x061DEF && instrCount < 40) {
  const r = disasm1(pc);
  const eh = exceptionAnnotation(r.text, pc);
  console.log(`  0x${hex24(pc)}  ${r.hex.padEnd(20)}  ${r.text}${eh}`);
  if (r.text === 'RET' || r.text === 'RETI' || r.text === 'RETN') {
    console.log('  --- (end of function) ---');
    break;
  }
  // Unconditional JP (not JP (HL)) ends function
  if (r.text.match(/^JP 0x/) && !r.text.includes('JP (')) {
    console.log('  --- (tail jump, possible end of function) ---');
    break;
  }
  pc = r.pc;
  instrCount++;
}

// 3b. 0x061DEF
console.log('\n--- 0x061DEF: Enter try-block ---');
pc = 0x061DEF;
instrCount = 0;
while (pc < 0x061E20 && instrCount < 40) {
  const r = disasm1(pc);
  const eh = exceptionAnnotation(r.text, pc);
  console.log(`  0x${hex24(pc)}  ${r.hex.padEnd(20)}  ${r.text}${eh}`);
  if (r.text === 'RET' || r.text === 'RETI' || r.text === 'RETN') {
    console.log('  --- (end of function) ---');
    break;
  }
  if (r.text.match(/^JP 0x/) && !r.text.includes('JP (')) {
    console.log('  --- (tail jump, possible end of function) ---');
    break;
  }
  pc = r.pc;
  instrCount++;
}

// 3c. 0x061E20
console.log('\n--- 0x061E20: Exit try-block / teardown ---');
pc = 0x061E20;
instrCount = 0;
while (pc < 0x061E50 && instrCount < 40) {
  const r = disasm1(pc);
  const eh = exceptionAnnotation(r.text, pc);
  console.log(`  0x${hex24(pc)}  ${r.hex.padEnd(20)}  ${r.text}${eh}`);
  if (r.text === 'RET' || r.text === 'RETI' || r.text === 'RETN') {
    console.log('  --- (end of function) ---');
    break;
  }
  if (r.text.match(/^JP 0x/) && !r.text.includes('JP (')) {
    console.log('  --- (tail jump, possible end of function) ---');
    break;
  }
  pc = r.pc;
  instrCount++;
}

// 4. Pattern summary
console.log(`\n${'='.repeat(80)}`);
console.log('  EXCEPTION HANDLING PATTERN SUMMARY');
console.log('='.repeat(80));

console.log(`\n  SP save sites (LD (addr),SP):`);
if (region.spSaves.length === 0) console.log('    (none found in full region)');
for (const addr of region.spSaves) {
  const r = disasm1(addr);
  console.log(`    0x${hex24(addr)}: ${r.text}`);
}

console.log(`\n  SP restore sites (LD SP,(addr)):`);
if (region.spRestores.length === 0) console.log('    (none found in full region)');
for (const addr of region.spRestores) {
  const r = disasm1(addr);
  console.log(`    0x${hex24(addr)}: ${r.text}`);
}

console.log(`\n  EX (SP),HL / EX (SP),IX / EX (SP),IY sites:`);
if (region.exSpSwaps.length === 0) console.log('    (none found in full region)');
for (const addr of region.exSpSwaps) {
  const r = disasm1(addr);
  console.log(`    0x${hex24(addr)}: ${r.text}`);
}

// 5. Scan for D008E0 references in the region
console.log(`\n  D008E0 references (known SP save location):`);
const d008e0Refs = [];
for (let scanAddr = 0x061D80; scanAddr < 0x061E50; ) {
  const r = disasm1(scanAddr);
  if (r.text.includes('D008E0')) {
    d008e0Refs.push({ addr: scanAddr, text: r.text });
    console.log(`    0x${hex24(scanAddr)}: ${r.text}`);
  }
  scanAddr = r.pc;
}
if (d008e0Refs.length === 0) console.log('    (none found -- D008E0 is used by the CALLER 0x07D5D7, not by this region)');

// 6. Scan for ALL unique addresses referenced in the region
console.log(`\n  All RAM addresses referenced in 0x061D80..0x061E4F:`);
const ramRefs = new Set();
const romRefs = new Set();
for (let scanAddr = 0x061D80; scanAddr < 0x061E50; ) {
  const r = disasm1(scanAddr);
  const matches = r.text.matchAll(/0x([0-9A-F]{6})/g);
  for (const m of matches) {
    const addr = parseInt(m[1], 16);
    if (addr >= 0xD00000 && addr < 0xE00000) ramRefs.add(addr);
    else if (addr < 0x400000 && addr !== scanAddr) romRefs.add(addr);
  }
  scanAddr = r.pc;
}
for (const addr of [...ramRefs].sort((a, b) => a - b)) {
  console.log(`    RAM 0x${hex24(addr)}${annotate(addr)}`);
}
for (const addr of [...romRefs].sort((a, b) => a - b)) {
  console.log(`    ROM 0x${hex24(addr)}${annotate(addr)}`);
}

// 7. Call targets found
console.log(`\n  Call/jump targets from region:`);
const uniqueCalls = [...new Set(region.allCalls)].sort((a, b) => a - b);
if (uniqueCalls.length === 0) console.log('    (none)');
for (const addr of uniqueCalls) {
  const loc = addr < 0x400000 ? 'ROM' : (addr >= 0xD00000 ? 'RAM' : '???');
  console.log(`    ${loc} 0x${hex24(addr)}${annotate(addr)}`);
}

// 8. Also decode callees briefly (first ~32 bytes)
if (uniqueCalls.length > 0) {
  console.log(`\n${'='.repeat(80)}`);
  console.log('  CALLEE PREVIEW (first ~32 bytes each)');
  console.log('='.repeat(80));
  for (const target of uniqueCalls) {
    if (target < rom.length && target >= 0) {
      disasmRegion(target, 32, `CALLEE: 0x${hex24(target)}`);
    } else {
      console.log(`\n  CALLEE 0x${hex24(target)} -- beyond ROM (RAM or unmapped)`);
    }
  }
}

// 9. Interpretation
console.log(`\n${'='.repeat(80)}`);
console.log('  INTERPRETATION');
console.log('='.repeat(80));
console.log(`
  TI-OS TRY-BLOCK mechanism (structured exception handling):

  Usage pattern (from caller 0x07D5D7):
    LD (D008E0),SP          ; save stack pointer
    CALL 0x061DEF            ; enter_try_block -- register exception handler
    CALL 0x07D610            ; protected code (the "try body")
    CALL 0x061E20            ; exit_try_block -- deregister handler

  If protected code throws (via some error path):
    SP is restored from D008E0 (or handler chain on stack)
    Execution resumes at the catch/cleanup point

  0x061DEF (enter_try_block):
    Likely pushes a handler frame onto the stack or a linked list.
    EX (SP),HL is the classic Z80 idiom for handler registration:
      - HL = handler address, PUSH HL, then EX (SP),HL swaps
        the return address with the handler address

  0x061E20 (exit_try_block):
    Tears down the handler frame (pops or unlinks it)

  0x061DB6 (related):
    May be the actual exception dispatch / throw mechanism
`);

console.log('Done.');
process.exit(0);
