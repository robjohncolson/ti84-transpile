/**
 * probe-phase509-decode-0B86AB.mjs
 *
 * Disassemble three ROM functions related to cursor activation and D02032 writes:
 *   0x0B86AB..0x0B8750 — Primary cursor activator (writes D02032 in clear/set/clear pattern)
 *   0x0B83FD..0x0B8480 — Key callee (called between D02032 writes, hypothesis: calls populator 0x07D583)
 *   0x0B8590..0x0B8620 — D02032 clearer + D02033=1 setter
 *
 * Raw eZ80 ADL-mode decoding — no external decoder dependency.
 */

import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

// ── Known symbols ──────────────────────────────────────────────────────
const knownAddrs = {
  0x0B83FD: 'cursor_key_callee',
  0x0B86AB: 'cursor_activator_primary',
  0x0B8590: 'cursor_d02032_clearer',
  0x07D583: 'populator (glyph chain)',
  0x082961: 'system_lock',
  0x082902: 'system_unlock?',
  0x082929: 'system_call?',
  0x0B9644: 'cursor_check_type?',
  0x0B95E0: 'cursor_setup?',
  0x0B968E: 'cursor_draw?',
  0x0B96B3: 'cursor_render?',
  0x0B96E3: 'cursor_erase?',
  0x0B852A: 'cursor_state_writer?',
  0x0BA064: 'bit_flag_setup_A',
  0x0BA060: 'bit_flag_setup_B',
  0x0B9473: 'cursor_helper_A',
  0x0B7F70: 'cursor_mask_helper',
  0x0B84CA: 'cursor_callee_sub',
  0x0B9816: 'cursor_render_sub',
  0x0BA9A6: 'cursor_state_check',
  0x0BA9B5: 'cursor_state_alt',
  0x0BBED7: 'cursor_related_call',
  0x0B7548: 'cursor_op_A',
  0x0B7538: 'cursor_op_B',
  0x0B7553: 'cursor_op_C',
  0x0B3A63: 'validator?',
  0x07C78F: 'display_helper',
  0x0BAAB9: 'state_func / lookup_func?',
  0x07F9FB: 'system_util',
  0x083838: 'compare_util?',
  0x08383D: 'compare_util_2?',
  0x0821AB: 'sys_call_AB',
  0x05D163: 'sys_call_D163',
  0x082440: 'sys_call_2440',
  0x0A21F2: 'sys_call_21F2',
  0x0BADAD: 'cursor_sub_ADAD',
  0x0B821C: 'cursor_sub_821C?',
  0x0B8214: 'cursor_sub_8214?',
  0x0B7B1B: 'cursor_return_point',
  0x0B87AF: 'cursor_sub_87AF',
  0x0B87F8: 'cursor_sub_87F8',
  0x0B878E: 'cursor_jp_target',
  0x023AB3: 'sys_util_3AB3',
  0x023B4C: 'sys_util_3B4C',
  0x023B55: 'sys_util_3B55',
  0x0801B9: 'sys_util_01B9',
  0x0B2AA4: 'cursor_sub_2AA4',
  0x0B86AA: 'cursor_activator_entry',
  0x0B8290: 'cursor_sub_8290?',
  0x0B829E: 'cursor_sub_829E?',
};

const knownRam = {
  0xD02032: 'D02032 cursor_type_gate',
  0xD02033: 'D02033 cursor_type_companion',
  0xD027ED: 'D027ED cursor_state?',
  0xD02FE6: 'D02FE6 conditional_gate',
  0xD005F8: 'D005F8 active_cursor_desc',
  0xD006A2: 'D006A2 cursor_pair_ptr?',
  0xD0063A: 'D0063A cursor_data?',
  0xD0069F: 'D0069F cursor_table_ptr?',
  0xD02026: 'D02026 cursor_count?',
  0xD02633: 'D02633 state?',
  0xD026AA: 'D026AA state_16?',
  0xD026AC: 'D026AC state_16b?',
  0xD026AE: 'D026AE state_8?',
  0xD02A98: 'D02A98 state_24?',
};

function ramName(addr) {
  if (knownRam[addr]) return knownRam[addr];
  if (addr >= 0xD00000 && addr < 0xE00000) return `RAM_0x${addr.toString(16).toUpperCase()}`;
  return null;
}

function symName(addr) {
  if (knownAddrs[addr]) return knownAddrs[addr];
  return null;
}

// ── eZ80 ADL-mode disassembler ──────────────────────────────────────

function r8Name(idx) {
  return ['B','C','D','E','H','L','(HL)','A'][idx & 7];
}

function signed8(v) {
  return v >= 128 ? v - 256 : v;
}

function read24(buf, off) {
  return buf[off] | (buf[off+1] << 8) | (buf[off+2] << 16);
}

function hex2(v) { return v.toString(16).padStart(2, '0'); }
function hex6(v) { return '0x' + v.toString(16).padStart(6, '0').toUpperCase(); }

function disassemble(rom, startAddr, endAddr) {
  const lines = [];
  let pc = startAddr;

  while (pc < endAddr) {
    const instrStart = pc;
    const op = rom[pc++];
    let mnem = '';
    let comment = '';

    function imm8() { return rom[pc++]; }
    function imm24() { const v = read24(rom, pc); pc += 3; return v; }
    function rel8() {
      const d = signed8(rom[pc++]);
      const target = pc + d;
      return { d, target };
    }
    function addr24Comment(a) {
      const s = symName(a);
      const r = ramName(a);
      if (s) return `; ${s}`;
      if (r) return `; ${r}`;
      return '';
    }
    function iyDisp() {
      const d = signed8(rom[pc++]);
      return d >= 0 ? `+0x${hex2(d)}` : `-0x${hex2(-d)}`;
    }
    function ixDisp() {
      const d = signed8(rom[pc++]);
      return d >= 0 ? `+0x${hex2(d)}` : `-0x${hex2(-d)}`;
    }

    switch (op) {
      case 0x00: mnem = 'NOP'; break;
      case 0x01: { const v = imm24(); mnem = `LD BC,${hex6(v)}`; comment = addr24Comment(v); break; }
      case 0x02: mnem = 'LD (BC),A'; break;
      case 0x03: mnem = 'INC BC'; break;
      case 0x04: mnem = 'INC B'; break;
      case 0x05: mnem = 'DEC B'; break;
      case 0x06: mnem = `LD B,0x${hex2(imm8())}`; break;
      case 0x07: mnem = 'RLCA'; break;
      case 0x08: mnem = "EX AF,AF'"; break;
      case 0x09: mnem = 'ADD HL,BC'; break;
      case 0x0A: mnem = 'LD A,(BC)'; break;
      case 0x0B: mnem = 'DEC BC'; break;
      case 0x0C: mnem = 'INC C'; break;
      case 0x0D: mnem = 'DEC C'; break;
      case 0x0E: mnem = `LD C,0x${hex2(imm8())}`; break;
      case 0x0F: mnem = 'RRCA'; break;
      case 0x10: { const r = rel8(); mnem = `DJNZ ${hex6(r.target)}`; comment = addr24Comment(r.target); break; }
      case 0x11: { const v = imm24(); mnem = `LD DE,${hex6(v)}`; comment = addr24Comment(v); break; }
      case 0x12: mnem = 'LD (DE),A'; break;
      case 0x13: mnem = 'INC DE'; break;
      case 0x14: mnem = 'INC D'; break;
      case 0x15: mnem = 'DEC D'; break;
      case 0x16: mnem = `LD D,0x${hex2(imm8())}`; break;
      case 0x17: mnem = 'RLA'; break;
      case 0x18: { const r = rel8(); mnem = `JR ${hex6(r.target)}`; comment = addr24Comment(r.target); break; }
      case 0x19: mnem = 'ADD HL,DE'; break;
      case 0x1A: mnem = 'LD A,(DE)'; break;
      case 0x1B: mnem = 'DEC DE'; break;
      case 0x1C: mnem = 'INC E'; break;
      case 0x1D: mnem = 'DEC E'; break;
      case 0x1E: mnem = `LD E,0x${hex2(imm8())}`; break;
      case 0x1F: mnem = 'RRA'; break;
      case 0x20: { const r = rel8(); mnem = `JR NZ,${hex6(r.target)}`; comment = addr24Comment(r.target); break; }
      case 0x21: { const v = imm24(); mnem = `LD HL,${hex6(v)}`; comment = addr24Comment(v); break; }
      case 0x22: { const v = imm24(); mnem = `LD (${hex6(v)}),HL`; comment = addr24Comment(v); break; }
      case 0x23: mnem = 'INC HL'; break;
      case 0x24: mnem = 'INC H'; break;
      case 0x25: mnem = 'DEC H'; break;
      case 0x26: mnem = `LD H,0x${hex2(imm8())}`; break;
      case 0x27: mnem = 'DAA'; break;
      case 0x28: { const r = rel8(); mnem = `JR Z,${hex6(r.target)}`; comment = addr24Comment(r.target); break; }
      case 0x29: mnem = 'ADD HL,HL'; break;
      case 0x2A: { const v = imm24(); mnem = `LD HL,(${hex6(v)})`; comment = addr24Comment(v); break; }
      case 0x2B: mnem = 'DEC HL'; break;
      case 0x2C: mnem = 'INC L'; break;
      case 0x2D: mnem = 'DEC L'; break;
      case 0x2E: mnem = `LD L,0x${hex2(imm8())}`; break;
      case 0x2F: mnem = 'CPL'; break;
      case 0x30: { const r = rel8(); mnem = `JR NC,${hex6(r.target)}`; comment = addr24Comment(r.target); break; }
      case 0x31: { const v = imm24(); mnem = `LD SP,${hex6(v)}`; break; }
      case 0x32: { const v = imm24(); mnem = `LD (${hex6(v)}),A`; comment = addr24Comment(v); break; }
      case 0x33: mnem = 'INC SP'; break;
      case 0x34: mnem = 'INC (HL)'; break;
      case 0x35: mnem = 'DEC (HL)'; break;
      case 0x36: mnem = `LD (HL),0x${hex2(imm8())}`; break;
      case 0x37: mnem = 'SCF'; break;
      case 0x38: { const r = rel8(); mnem = `JR C,${hex6(r.target)}`; comment = addr24Comment(r.target); break; }
      case 0x39: mnem = 'ADD HL,SP'; break;
      case 0x3A: { const v = imm24(); mnem = `LD A,(${hex6(v)})`; comment = addr24Comment(v); break; }
      case 0x3B: mnem = 'DEC SP'; break;
      case 0x3C: mnem = 'INC A'; break;
      case 0x3D: mnem = 'DEC A'; break;
      case 0x3E: mnem = `LD A,0x${hex2(imm8())}`; break;
      case 0x3F: mnem = 'CCF'; break;

      case 0x76: mnem = 'HALT'; break;
      default:
        if (op >= 0x40 && op <= 0x7F) {
          const dst = (op >> 3) & 7;
          const src = op & 7;
          mnem = `LD ${r8Name(dst)},${r8Name(src)}`;
          break;
        }
        if (op >= 0x80 && op <= 0xBF) {
          const aluOps = ['ADD A,','ADC A,','SUB ','SBC A,','AND ','XOR ','OR ','CP '];
          const aluIdx = (op >> 3) & 7;
          const src = op & 7;
          mnem = `${aluOps[aluIdx]}${r8Name(src)}`;
          break;
        }
        switch (op) {
          case 0xC0: mnem = 'RET NZ'; break;
          case 0xC1: mnem = 'POP BC'; break;
          case 0xC2: { const v = imm24(); mnem = `JP NZ,${hex6(v)}`; comment = addr24Comment(v); break; }
          case 0xC3: { const v = imm24(); mnem = `JP ${hex6(v)}`; comment = addr24Comment(v); break; }
          case 0xC4: { const v = imm24(); mnem = `CALL NZ,${hex6(v)}`; comment = addr24Comment(v); break; }
          case 0xC5: mnem = 'PUSH BC'; break;
          case 0xC6: mnem = `ADD A,0x${hex2(imm8())}`; break;
          case 0xC7: mnem = 'RST 0x00'; break;
          case 0xC8: mnem = 'RET Z'; break;
          case 0xC9: mnem = 'RET'; break;
          case 0xCA: { const v = imm24(); mnem = `JP Z,${hex6(v)}`; comment = addr24Comment(v); break; }
          case 0xCB: {
            const cb = rom[pc++];
            const bitIdx = (cb >> 3) & 7;
            const reg = cb & 7;
            if (cb < 0x40) {
              const shifts = ['RLC','RRC','RL','RR','SLA','SRA','SLL?','SRL'];
              mnem = `${shifts[bitIdx]} ${r8Name(reg)}`;
            } else if (cb < 0x80) {
              mnem = `BIT ${bitIdx},${r8Name(reg)}`;
            } else if (cb < 0xC0) {
              mnem = `RES ${bitIdx},${r8Name(reg)}`;
            } else {
              mnem = `SET ${bitIdx},${r8Name(reg)}`;
            }
            break;
          }
          case 0xCC: { const v = imm24(); mnem = `CALL Z,${hex6(v)}`; comment = addr24Comment(v); break; }
          case 0xCD: { const v = imm24(); mnem = `CALL ${hex6(v)}`; comment = addr24Comment(v); break; }
          case 0xCE: mnem = `ADC A,0x${hex2(imm8())}`; break;
          case 0xCF: mnem = 'RST 0x08'; break;
          case 0xD0: mnem = 'RET NC'; break;
          case 0xD1: mnem = 'POP DE'; break;
          case 0xD2: { const v = imm24(); mnem = `JP NC,${hex6(v)}`; comment = addr24Comment(v); break; }
          case 0xD3: mnem = `OUT (0x${hex2(imm8())}),A`; break;
          case 0xD4: { const v = imm24(); mnem = `CALL NC,${hex6(v)}`; comment = addr24Comment(v); break; }
          case 0xD5: mnem = 'PUSH DE'; break;
          case 0xD6: mnem = `SUB 0x${hex2(imm8())}`; break;
          case 0xD7: mnem = 'RST 0x10'; break;
          case 0xD8: mnem = 'RET C'; break;
          case 0xD9: mnem = 'EXX'; break;
          case 0xDA: { const v = imm24(); mnem = `JP C,${hex6(v)}`; comment = addr24Comment(v); break; }
          case 0xDB: mnem = `IN A,(0x${hex2(imm8())})`;  break;
          case 0xDC: { const v = imm24(); mnem = `CALL C,${hex6(v)}`; comment = addr24Comment(v); break; }

          case 0xDD: {
            const dd = rom[pc++];
            if (dd === 0xCB) {
              const d = ixDisp();
              const cbop = rom[pc++];
              const bitIdx = (cbop >> 3) & 7;
              if (cbop < 0x40) {
                const shifts = ['RLC','RRC','RL','RR','SLA','SRA','SLL?','SRL'];
                mnem = `${shifts[bitIdx]} (IX${d})`;
              } else if (cbop < 0x80) {
                mnem = `BIT ${bitIdx},(IX${d})`;
              } else if (cbop < 0xC0) {
                mnem = `RES ${bitIdx},(IX${d})`;
              } else {
                mnem = `SET ${bitIdx},(IX${d})`;
              }
            } else if (dd === 0x21) {
              const v = imm24(); mnem = `LD IX,${hex6(v)}`; comment = addr24Comment(v);
            } else if (dd === 0x22) {
              const v = imm24(); mnem = `LD (${hex6(v)}),IX`; comment = addr24Comment(v);
            } else if (dd === 0x2A) {
              const v = imm24(); mnem = `LD IX,(${hex6(v)})`; comment = addr24Comment(v);
            } else if (dd === 0xE1) { mnem = 'POP IX';
            } else if (dd === 0xE5) { mnem = 'PUSH IX';
            } else if (dd === 0xE9) { mnem = 'JP (IX)';
            } else if (dd === 0x23) { mnem = 'INC IX';
            } else if (dd === 0x2B) { mnem = 'DEC IX';
            } else if (dd === 0x09) { mnem = 'ADD IX,BC';
            } else if (dd === 0x19) { mnem = 'ADD IX,DE';
            } else if (dd === 0x29) { mnem = 'ADD IX,IX';
            } else if (dd === 0x39) { mnem = 'ADD IX,SP';
            } else if (dd === 0x36) {
              const d = ixDisp(); const n = rom[pc++];
              mnem = `LD (IX${d}),0x${hex2(n)}`;
            } else if (dd === 0x46) { mnem = `LD B,(IX${ixDisp()})`;
            } else if (dd === 0x4E) { mnem = `LD C,(IX${ixDisp()})`;
            } else if (dd === 0x56) { mnem = `LD D,(IX${ixDisp()})`;
            } else if (dd === 0x5E) { mnem = `LD E,(IX${ixDisp()})`;
            } else if (dd === 0x66) { mnem = `LD H,(IX${ixDisp()})`;
            } else if (dd === 0x6E) { mnem = `LD L,(IX${ixDisp()})`;
            } else if (dd === 0x7E) { mnem = `LD A,(IX${ixDisp()})`;
            } else if (dd === 0x77) { mnem = `LD (IX${ixDisp()}),A`;
            } else if (dd === 0x70) { mnem = `LD (IX${ixDisp()}),B`;
            } else if (dd === 0x71) { mnem = `LD (IX${ixDisp()}),C`;
            } else if (dd === 0x72) { mnem = `LD (IX${ixDisp()}),D`;
            } else if (dd === 0x73) { mnem = `LD (IX${ixDisp()}),E`;
            } else if (dd === 0x74) { mnem = `LD (IX${ixDisp()}),H`;
            } else if (dd === 0x75) { mnem = `LD (IX${ixDisp()}),L`;
            } else if (dd === 0xBE) { mnem = `CP (IX${ixDisp()})`;
            } else if (dd === 0xB6) { mnem = `OR (IX${ixDisp()})`;
            } else if (dd === 0xA6) { mnem = `AND (IX${ixDisp()})`;
            } else if (dd === 0xAE) { mnem = `XOR (IX${ixDisp()})`;
            } else if (dd === 0x86) { mnem = `ADD A,(IX${ixDisp()})`;
            } else if (dd === 0x8E) { mnem = `ADC A,(IX${ixDisp()})`;
            } else if (dd === 0x96) { mnem = `SUB (IX${ixDisp()})`;
            } else if (dd === 0x9E) { mnem = `SBC A,(IX${ixDisp()})`;
            } else if (dd === 0x34) { mnem = `INC (IX${ixDisp()})`;
            } else if (dd === 0x35) { mnem = `DEC (IX${ixDisp()})`;
            } else {
              mnem = `[DD ${hex2(dd)}] ??`;
            }
            break;
          }

          case 0xDE: mnem = `SBC A,0x${hex2(imm8())}`; break;
          case 0xDF: mnem = 'RST 0x18'; break;
          case 0xE0: mnem = 'RET PO'; break;
          case 0xE1: mnem = 'POP HL'; break;
          case 0xE2: { const v = imm24(); mnem = `JP PO,${hex6(v)}`; comment = addr24Comment(v); break; }
          case 0xE3: mnem = 'EX (SP),HL'; break;
          case 0xE4: { const v = imm24(); mnem = `CALL PO,${hex6(v)}`; comment = addr24Comment(v); break; }
          case 0xE5: mnem = 'PUSH HL'; break;
          case 0xE6: mnem = `AND 0x${hex2(imm8())}`; break;
          case 0xE7: mnem = 'RST 0x20'; break;
          case 0xE8: mnem = 'RET PE'; break;
          case 0xE9: mnem = 'JP (HL)'; break;
          case 0xEA: { const v = imm24(); mnem = `JP PE,${hex6(v)}`; comment = addr24Comment(v); break; }
          case 0xEB: mnem = 'EX DE,HL'; break;
          case 0xEC: { const v = imm24(); mnem = `CALL PE,${hex6(v)}`; comment = addr24Comment(v); break; }

          case 0xED: {
            const ed = rom[pc++];
            switch (ed) {
              case 0x42: mnem = 'SBC HL,BC'; break;
              case 0x43: { const v = imm24(); mnem = `LD (${hex6(v)}),BC`; comment = addr24Comment(v); break; }
              case 0x44: mnem = 'NEG'; break;
              case 0x45: mnem = 'RETN'; break;
              case 0x46: mnem = 'IM 0'; break;
              case 0x47: mnem = 'LD I,A'; break;
              case 0x4A: mnem = 'ADC HL,BC'; break;
              case 0x4B: { const v = imm24(); mnem = `LD BC,(${hex6(v)})`; comment = addr24Comment(v); break; }
              case 0x4D: mnem = 'RETI'; break;
              case 0x4F: mnem = 'LD R,A'; break;
              case 0x52: mnem = 'SBC HL,DE'; break;
              case 0x53: { const v = imm24(); mnem = `LD (${hex6(v)}),DE`; comment = addr24Comment(v); break; }
              case 0x56: mnem = 'IM 1'; break;
              case 0x57: mnem = 'LD A,I'; break;
              case 0x5A: mnem = 'ADC HL,DE'; break;
              case 0x5B: { const v = imm24(); mnem = `LD DE,(${hex6(v)})`; comment = addr24Comment(v); break; }
              case 0x5E: mnem = 'IM 2'; break;
              case 0x5F: mnem = 'LD A,R'; break;
              case 0x62: mnem = 'SBC HL,HL'; break;
              case 0x63: { const v = imm24(); mnem = `LD (${hex6(v)}),HL`; comment = addr24Comment(v); break; }
              case 0x6A: mnem = 'ADC HL,HL'; break;
              case 0x6B: { const v = imm24(); mnem = `LD HL,(${hex6(v)})`; comment = addr24Comment(v); break; }
              case 0x72: mnem = 'SBC HL,SP'; break;
              case 0x73: { const v = imm24(); mnem = `LD (${hex6(v)}),SP`; comment = addr24Comment(v); break; }
              case 0x7A: mnem = 'ADC HL,SP'; break;
              case 0x7B: { const v = imm24(); mnem = `LD SP,(${hex6(v)})`; comment = addr24Comment(v); break; }
              case 0xA0: mnem = 'LDI'; break;
              case 0xA1: mnem = 'CPI'; break;
              case 0xA8: mnem = 'LDD'; break;
              case 0xB0: mnem = 'LDIR'; break;
              case 0xB1: mnem = 'CPIR'; break;
              case 0xB8: mnem = 'LDDR'; break;
              default: mnem = `[ED ${hex2(ed)}] ??`; break;
            }
            break;
          }

          case 0xEE: mnem = `XOR 0x${hex2(imm8())}`; break;
          case 0xEF: mnem = 'RST 0x28'; break;
          case 0xF0: mnem = 'RET P'; break;
          case 0xF1: mnem = 'POP AF'; break;
          case 0xF2: { const v = imm24(); mnem = `JP P,${hex6(v)}`; comment = addr24Comment(v); break; }
          case 0xF3: mnem = 'DI'; break;
          case 0xF4: { const v = imm24(); mnem = `CALL P,${hex6(v)}`; comment = addr24Comment(v); break; }
          case 0xF5: mnem = 'PUSH AF'; break;
          case 0xF6: mnem = `OR 0x${hex2(imm8())}`; break;
          case 0xF7: mnem = 'RST 0x30'; break;
          case 0xF8: mnem = 'RET M'; break;
          case 0xF9: mnem = 'LD SP,HL'; break;
          case 0xFA: { const v = imm24(); mnem = `JP M,${hex6(v)}`; comment = addr24Comment(v); break; }
          case 0xFB: mnem = 'EI'; break;
          case 0xFC: { const v = imm24(); mnem = `CALL M,${hex6(v)}`; comment = addr24Comment(v); break; }

          case 0xFD: {
            const fd = rom[pc++];
            if (fd === 0xCB) {
              const dStr = iyDisp();
              const cbop = rom[pc++];
              const bitIdx = (cbop >> 3) & 7;
              if (cbop < 0x40) {
                const shifts = ['RLC','RRC','RL','RR','SLA','SRA','SLL?','SRL'];
                mnem = `${shifts[bitIdx]} (IY${dStr})`;
              } else if (cbop < 0x80) {
                mnem = `BIT ${bitIdx},(IY${dStr})`;
              } else if (cbop < 0xC0) {
                mnem = `RES ${bitIdx},(IY${dStr})`;
              } else {
                mnem = `SET ${bitIdx},(IY${dStr})`;
              }
            } else if (fd === 0x21) {
              const v = imm24(); mnem = `LD IY,${hex6(v)}`; comment = addr24Comment(v);
            } else if (fd === 0x22) {
              const v = imm24(); mnem = `LD (${hex6(v)}),IY`; comment = addr24Comment(v);
            } else if (fd === 0x2A) {
              const v = imm24(); mnem = `LD IY,(${hex6(v)})`; comment = addr24Comment(v);
            } else if (fd === 0xE1) { mnem = 'POP IY';
            } else if (fd === 0xE5) { mnem = 'PUSH IY';
            } else if (fd === 0xE9) { mnem = 'JP (IY)';
            } else if (fd === 0x23) { mnem = 'INC IY';
            } else if (fd === 0x2B) { mnem = 'DEC IY';
            } else if (fd === 0x09) { mnem = 'ADD IY,BC';
            } else if (fd === 0x19) { mnem = 'ADD IY,DE';
            } else if (fd === 0x29) { mnem = 'ADD IY,IY';
            } else if (fd === 0x39) { mnem = 'ADD IY,SP';
            } else if (fd === 0x36) {
              const dStr = iyDisp(); const n = rom[pc++];
              mnem = `LD (IY${dStr}),0x${hex2(n)}`;
            } else if (fd === 0x46) { mnem = `LD B,(IY${iyDisp()})`;
            } else if (fd === 0x4E) { mnem = `LD C,(IY${iyDisp()})`;
            } else if (fd === 0x56) { mnem = `LD D,(IY${iyDisp()})`;
            } else if (fd === 0x5E) { mnem = `LD E,(IY${iyDisp()})`;
            } else if (fd === 0x66) { mnem = `LD H,(IY${iyDisp()})`;
            } else if (fd === 0x6E) { mnem = `LD L,(IY${iyDisp()})`;
            } else if (fd === 0x7E) { mnem = `LD A,(IY${iyDisp()})`;
            } else if (fd === 0x77) { mnem = `LD (IY${iyDisp()}),A`;
            } else if (fd === 0x70) { mnem = `LD (IY${iyDisp()}),B`;
            } else if (fd === 0x71) { mnem = `LD (IY${iyDisp()}),C`;
            } else if (fd === 0x72) { mnem = `LD (IY${iyDisp()}),D`;
            } else if (fd === 0x73) { mnem = `LD (IY${iyDisp()}),E`;
            } else if (fd === 0x74) { mnem = `LD (IY${iyDisp()}),H`;
            } else if (fd === 0x75) { mnem = `LD (IY${iyDisp()}),L`;
            } else if (fd === 0xBE) { mnem = `CP (IY${iyDisp()})`;
            } else if (fd === 0xB6) { mnem = `OR (IY${iyDisp()})`;
            } else if (fd === 0xA6) { mnem = `AND (IY${iyDisp()})`;
            } else if (fd === 0xAE) { mnem = `XOR (IY${iyDisp()})`;
            } else if (fd === 0x86) { mnem = `ADD A,(IY${iyDisp()})`;
            } else if (fd === 0x8E) { mnem = `ADC A,(IY${iyDisp()})`;
            } else if (fd === 0x96) { mnem = `SUB (IY${iyDisp()})`;
            } else if (fd === 0x9E) { mnem = `SBC A,(IY${iyDisp()})`;
            } else if (fd === 0x34) { mnem = `INC (IY${iyDisp()})`;
            } else if (fd === 0x35) { mnem = `DEC (IY${iyDisp()})`;
            } else {
              mnem = `[FD ${hex2(fd)}] ??`;
            }
            break;
          }

          case 0xFE: mnem = `CP 0x${hex2(imm8())}`; break;
          case 0xFF: mnem = 'RST 0x38'; break;

          default:
            mnem = `[${hex2(op)}] ??`;
            break;
        }
        break;
    }

    const instrLen = pc - instrStart;
    const hexBytes = Array.from(rom.slice(instrStart, pc)).map(b => hex2(b).toUpperCase()).join(' ');
    const addrStr = hex6(instrStart);
    const padded = hexBytes.padEnd(20);
    const line = `${addrStr}: ${padded} ${mnem}${comment ? '    ' + comment : ''}`;
    lines.push(line);
  }

  return lines;
}

// ── Disassemble all three functions ─────────────────────────────────

console.log('='.repeat(80));
console.log('FUNCTION 1: 0x0B86AB — Primary Cursor Activator (~165 bytes to 0x0B8750)');
console.log('  Pattern: clear D02032(0) -> CALL 0x0B83FD -> set D02032(1) -> CALL 0x0B83FD -> clear D02032(0)');
console.log('='.repeat(80));
console.log('');

const fn1 = disassemble(rom, 0x0B86AB, 0x0B8750);
fn1.forEach(l => console.log(l));

console.log('');
console.log('='.repeat(80));
console.log('FUNCTION 2: 0x0B83FD — Key Callee (~131 bytes to 0x0B8480)');
console.log('  Called between D02032 gate writes');
console.log('  Hypothesis: calls populator 0x07D583');
console.log('='.repeat(80));
console.log('');

const fn2 = disassemble(rom, 0x0B83FD, 0x0B8480);
fn2.forEach(l => console.log(l));

console.log('');
console.log('='.repeat(80));
console.log('FUNCTION 3: 0x0B8590 — D02032 Clearer / D02033 Setter (~144 bytes to 0x0B8620)');
console.log('  Clears D02032, sets D02033=1');
console.log('='.repeat(80));
console.log('');

const fn3 = disassemble(rom, 0x0B8590, 0x0B8620);
fn3.forEach(l => console.log(l));

// ── Summary: collect targets ─────────────────────────────────────────

function collectTargets(rom, start, end) {
  const calls = [];
  const jps = [];
  const ramReads = [];
  const ramWrites = [];
  let pc = start;
  while (pc < end) {
    const op = rom[pc];
    if (op === 0xCD) {
      calls.push({ addr: pc, target: read24(rom, pc+1) });
      pc += 4;
    } else if (op === 0xC3) {
      jps.push({ addr: pc, target: read24(rom, pc+1) });
      pc += 4;
    } else if ([0xC2,0xCA,0xD2,0xDA,0xE2,0xEA,0xF2,0xFA].includes(op)) {
      jps.push({ addr: pc, target: read24(rom, pc+1), cond: true });
      pc += 4;
    } else if ([0xC4,0xCC,0xD4,0xDC,0xE4,0xEC,0xF4,0xFC].includes(op)) {
      calls.push({ addr: pc, target: read24(rom, pc+1), cond: true });
      pc += 4;
    } else if (op === 0x3A) {
      ramReads.push({ addr: pc, target: read24(rom, pc+1) });
      pc += 4;
    } else if (op === 0x32) {
      ramWrites.push({ addr: pc, target: read24(rom, pc+1) });
      pc += 4;
    } else if (op === 0x2A) {
      ramReads.push({ addr: pc, target: read24(rom, pc+1), reg: 'HL' });
      pc += 4;
    } else if (op === 0x22) {
      ramWrites.push({ addr: pc, target: read24(rom, pc+1), reg: 'HL' });
      pc += 4;
    } else if (op === 0xED) {
      const ed = rom[pc+1];
      if (ed === 0x4B) { ramReads.push({ addr: pc, target: read24(rom, pc+2), reg: 'BC' }); pc += 5; }
      else if (ed === 0x5B) { ramReads.push({ addr: pc, target: read24(rom, pc+2), reg: 'DE' }); pc += 5; }
      else if (ed === 0x6B) { ramReads.push({ addr: pc, target: read24(rom, pc+2), reg: 'HL' }); pc += 5; }
      else if (ed === 0x43) { ramWrites.push({ addr: pc, target: read24(rom, pc+2), reg: 'BC' }); pc += 5; }
      else if (ed === 0x53) { ramWrites.push({ addr: pc, target: read24(rom, pc+2), reg: 'DE' }); pc += 5; }
      else if (ed === 0x63) { ramWrites.push({ addr: pc, target: read24(rom, pc+2), reg: 'HL' }); pc += 5; }
      else { pc += 2; }
    } else {
      pc++;
    }
  }
  return { calls, jps, ramReads, ramWrites };
}

console.log('');
console.log('='.repeat(80));
console.log('TARGET SUMMARY');
console.log('='.repeat(80));

for (const [label, start, end] of [
  ['0x0B86AB (Primary Cursor Activator)', 0x0B86AB, 0x0B8750],
  ['0x0B83FD (Key Callee)', 0x0B83FD, 0x0B8480],
  ['0x0B8590 (D02032 Clearer)', 0x0B8590, 0x0B8620],
]) {
  console.log('');
  console.log(`--- ${label} ---`);
  const t = collectTargets(rom, start, end);
  console.log('CALLs:');
  t.calls.forEach(c => console.log(`  ${hex6(c.addr)}: CALL${c.cond?' cond':''} ${hex6(c.target)}  ${symName(c.target) || ''}`));
  console.log('JPs:');
  t.jps.forEach(j => console.log(`  ${hex6(j.addr)}: JP${j.cond?' cond':''} ${hex6(j.target)}  ${symName(j.target) || ''}`));
  console.log('RAM reads:');
  t.ramReads.forEach(r => console.log(`  ${hex6(r.addr)}: LD ${r.reg||'A'},(${hex6(r.target)})  ${ramName(r.target) || ''}`));
  console.log('RAM writes:');
  t.ramWrites.forEach(w => console.log(`  ${hex6(w.addr)}: LD (${hex6(w.target)}),${w.reg||'A'}  ${ramName(w.target) || ''}`));
}

// ── D02032 / D02033 write site detail ───────────────────────────────

console.log('');
console.log('='.repeat(80));
console.log('D02032 / D02033 WRITE SITES (all three functions)');
console.log('='.repeat(80));

for (const [label, start, end] of [
  ['0x0B86AB', 0x0B86AB, 0x0B8750],
  ['0x0B83FD', 0x0B83FD, 0x0B8480],
  ['0x0B8590', 0x0B8590, 0x0B8620],
]) {
  const t = collectTargets(rom, start, end);
  for (const w of t.ramWrites) {
    if (w.target === 0xD02032 || w.target === 0xD02033) {
      const prev2 = rom[w.addr - 2];
      const prev1 = rom[w.addr - 1];
      let valueNote = '';
      if (prev1 === 0xAF) valueNote = 'A=0 (XOR A)';
      else if (prev2 === 0x3E) valueNote = `A=0x${hex2(prev1)} (LD A,imm)`;
      console.log(`  ${label} @ ${hex6(w.addr)}: LD (${hex6(w.target)}),A  ${valueNote}`);
    }
  }
}

// ── Analysis ─────────────────────────────────────────────────────────

console.log('');
console.log('='.repeat(80));
console.log('ANALYSIS');
console.log('='.repeat(80));
console.log('');
console.log('0x0B86AB (Primary Cursor Activator):');
console.log('  - Orchestrator function (~165 bytes)');
console.log('  - Pattern: clear D02032(=0) -> CALL 0x0B83FD -> set D02032(=1) -> CALL 0x0B83FD -> clear D02032(=0)');
console.log('  - The D02032 gate brackets calls to the key callee, controlling populator behavior');
console.log('');
console.log('0x0B83FD (Key Callee):');
console.log('  - Called between D02032 gate writes');
console.log('  - Check output for CALL to 0x07D583 (populator) to confirm hypothesis');
console.log('');
console.log('0x0B8590 (D02032 Clearer):');
console.log('  - Clears D02032 and sets D02033=1');
console.log('  - Handles cursor type switching');

console.log('');
console.log('PROBE COMPLETE');
