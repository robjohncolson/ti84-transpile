/**
 * probe-phase263-0a223a-static-decode.mjs
 *
 * Static disassembly of 0x0A223A (VRAM fill function) from ROM bytes.
 * Identifies all RAM pointer reads and cross-references with 0x0A22B1.
 *
 * Usage: node TI-84_Plus_CE/probe-phase263-0a223a-static-decode.mjs
 */

import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

// --- Helpers ---

function rd8(addr) { return rom[addr]; }
function rd16(addr) { return rom[addr] | (rom[addr + 1] << 8); }
function rd24(addr) { return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16); }
function hex2(v) { return v.toString(16).padStart(2, '0'); }
function hex6(v) { return v.toString(16).padStart(6, '0'); }
function hex4(v) { return v.toString(16).padStart(4, '0'); }

// Condition code names
const ccNames = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];

// Register pair names for 16-bit ops
const rpNames = ['BC', 'DE', 'HL', 'SP'];
const rNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];

/**
 * Decode one eZ80 ADL-mode instruction at `pc`.
 * Returns { asm, bytes, size, ramReads: [], ramWrites: [], calls: [], jumps: [] }
 */
function decode(pc) {
  const result = {
    asm: '',
    size: 1,
    ramReads: [],   // addresses read from RAM
    ramWrites: [],  // addresses written to RAM
    calls: [],      // CALL targets
    jumps: [],      // JP/JR targets
    isRet: false,
    isUncondJump: false,
  };

  const b0 = rd8(pc);
  const rawBytes = [];

  function grabBytes(n) {
    for (let i = 0; i < n; i++) rawBytes.push(rd8(pc + rawBytes.length));
  }

  grabBytes(1); // b0

  // Helper: read 24-bit immediate after current position
  function imm24() {
    const off = rawBytes.length;
    grabBytes(3);
    return rd24(pc + off);
  }
  function imm8() {
    const off = rawBytes.length;
    grabBytes(1);
    return rd8(pc + off);
  }
  function simm8() {
    const v = imm8();
    return v >= 128 ? v - 256 : v;
  }

  function classifyAddr(addr, isRead) {
    if (addr >= 0xD00000 && addr < 0xD50000) {
      if (isRead) result.ramReads.push(addr);
      else result.ramWrites.push(addr);
    }
  }

  switch (b0) {
    // NOP
    case 0x00: result.asm = 'NOP'; break;

    // LD rr, nn (24-bit in ADL)
    case 0x01: case 0x11: case 0x21: case 0x31: {
      const rp = (b0 >> 4) & 3;
      const nn = imm24();
      result.asm = `LD ${rpNames[rp]},0x${hex6(nn)}`;
      result.size = rawBytes.length;
      break;
    }

    // LD (BC),A
    case 0x02: result.asm = 'LD (BC),A'; break;
    // INC rr
    case 0x03: case 0x13: case 0x23: case 0x33: {
      result.asm = `INC ${rpNames[(b0 >> 4) & 3]}`;
      break;
    }
    // INC r
    case 0x04: case 0x0C: case 0x14: case 0x1C: case 0x24: case 0x2C: case 0x3C: {
      const r = (b0 >> 3) & 7;
      result.asm = `INC ${rNames[r]}`;
      break;
    }
    // DEC r
    case 0x05: case 0x0D: case 0x15: case 0x1D: case 0x25: case 0x2D: case 0x3D: {
      const r = (b0 >> 3) & 7;
      result.asm = `DEC ${rNames[r]}`;
      break;
    }
    // LD r, n
    case 0x06: case 0x0E: case 0x16: case 0x1E: case 0x26: case 0x2E: case 0x3E: {
      const r = (b0 >> 3) & 7;
      const n = imm8();
      result.asm = `LD ${rNames[r]},0x${hex2(n)}`;
      result.size = rawBytes.length;
      break;
    }
    // RLCA
    case 0x07: result.asm = 'RLCA'; break;
    // EX AF,AF'
    case 0x08: result.asm = "EX AF,AF'"; break;
    // ADD HL,rr
    case 0x09: case 0x19: case 0x29: case 0x39: {
      result.asm = `ADD HL,${rpNames[(b0 >> 4) & 3]}`;
      break;
    }
    // LD A,(BC)
    case 0x0A: result.asm = 'LD A,(BC)'; break;
    // DEC rr
    case 0x0B: case 0x1B: case 0x2B: case 0x3B: {
      result.asm = `DEC ${rpNames[(b0 >> 4) & 3]}`;
      break;
    }
    // RRCA
    case 0x0F: result.asm = 'RRCA'; break;
    // DJNZ
    case 0x10: {
      const off = simm8();
      const target = pc + rawBytes.length + off;
      result.asm = `DJNZ 0x${hex6(target)}`;
      result.jumps.push(target);
      result.size = rawBytes.length;
      break;
    }
    // LD (DE),A
    case 0x12: result.asm = 'LD (DE),A'; break;
    // JR
    case 0x18: {
      const off = simm8();
      const target = pc + rawBytes.length + off;
      result.asm = `JR 0x${hex6(target)}`;
      result.jumps.push(target);
      result.isUncondJump = true;
      result.size = rawBytes.length;
      break;
    }
    // LD A,(DE)
    case 0x1A: result.asm = 'LD A,(DE)'; break;
    // JR NZ / JR Z / JR NC / JR C
    case 0x20: case 0x28: case 0x30: case 0x38: {
      const cc = (b0 >> 3) & 3;
      const ccN = ['NZ', 'Z', 'NC', 'C'][cc];
      const off = simm8();
      const target = pc + rawBytes.length + off;
      result.asm = `JR ${ccN},0x${hex6(target)}`;
      result.jumps.push(target);
      result.size = rawBytes.length;
      break;
    }
    // LD (nn),HL
    case 0x22: {
      const nn = imm24();
      result.asm = `LD (0x${hex6(nn)}),HL`;
      classifyAddr(nn, false);
      result.size = rawBytes.length;
      break;
    }
    // DAA
    case 0x27: result.asm = 'DAA'; break;
    // LD HL,(nn)
    case 0x2A: {
      const nn = imm24();
      result.asm = `LD HL,(0x${hex6(nn)})`;
      classifyAddr(nn, true);
      result.size = rawBytes.length;
      break;
    }
    // CPL
    case 0x2F: result.asm = 'CPL'; break;
    // LD (nn),A
    case 0x32: {
      const nn = imm24();
      result.asm = `LD (0x${hex6(nn)}),A`;
      classifyAddr(nn, false);
      result.size = rawBytes.length;
      break;
    }
    // INC (HL)
    case 0x34: result.asm = 'INC (HL)'; break;
    // DEC (HL)
    case 0x35: result.asm = 'DEC (HL)'; break;
    // LD (HL),n
    case 0x36: {
      const n = imm8();
      result.asm = `LD (HL),0x${hex2(n)}`;
      result.size = rawBytes.length;
      break;
    }
    // SCF
    case 0x37: result.asm = 'SCF'; break;
    // CCF
    case 0x3F: result.asm = 'CCF'; break;
    // LD A,(nn)
    case 0x3A: {
      const nn = imm24();
      result.asm = `LD A,(0x${hex6(nn)})`;
      classifyAddr(nn, true);
      result.size = rawBytes.length;
      break;
    }

    // 0x40-0x7F: LD r,r' (except 0x76 = HALT)
    case 0x76: result.asm = 'HALT'; break;
    default:
      if (b0 >= 0x40 && b0 <= 0x7F) {
        const dst = (b0 >> 3) & 7;
        const src = b0 & 7;
        // eZ80 extension: 0x40 = LD.SIS B,B used as prefix
        // But in pure ADL context 0x40 with same src/dst are NOPs
        if (b0 === 0x40) {
          // eZ80: LD.SIS prefix — next instruction runs in SIS mode
          // For our purposes, decode next instruction and mark it
          result.asm = '.SIS prefix';
          // The next byte is the actual instruction in SIS (16-bit) mode
          // We'll handle common cases
          const b1 = rd8(pc + 1);
          grabBytes(1);
          if (b1 === 0x2A) {
            // LD HL,(nn) in SIS = 16-bit address
            grabBytes(2);
            const nn16 = rd16(pc + 2);
            result.asm = `LD.SIS HL,(0x${hex4(nn16)})`;
          } else if (b1 === 0x22) {
            grabBytes(2);
            const nn16 = rd16(pc + 2);
            result.asm = `LD.SIS (0x${hex4(nn16)}),HL`;
          } else if (b1 === 0xED) {
            grabBytes(1);
            const b2 = rd8(pc + 2);
            if (b2 === 0x5B) {
              grabBytes(2);
              const nn16 = rd16(pc + 3);
              result.asm = `LD.SIS DE,(0x${hex4(nn16)})`;
            } else if (b2 === 0x4B) {
              grabBytes(2);
              const nn16 = rd16(pc + 3);
              result.asm = `LD.SIS BC,(0x${hex4(nn16)})`;
            } else {
              result.asm = `DB 0x40,0xED,0x${hex2(b2)} ; .SIS ED prefix`;
            }
          } else {
            result.asm = `LD ${rNames[dst]},${rNames[src]}`;
            // Back up - it's just LD B,B = NOP-like
            rawBytes.length = 1;
          }
          result.size = rawBytes.length;
          break;
        }
        result.asm = `LD ${rNames[dst]},${rNames[src]}`;
        break;
      }

      // ALU A,r: 0x80-0xBF
      if (b0 >= 0x80 && b0 <= 0xBF) {
        const op = (b0 >> 3) & 7;
        const r = b0 & 7;
        const opNames = ['ADD A,', 'ADC A,', 'SUB ', 'SBC A,', 'AND ', 'XOR ', 'OR ', 'CP '];
        result.asm = `${opNames[op]}${rNames[r]}`;
        break;
      }

      // Conditional returns
      if ((b0 & 0xC7) === 0xC0) {
        const cc = (b0 >> 3) & 7;
        result.asm = `RET ${ccNames[cc]}`;
        break;
      }

      // POP rr
      if ((b0 & 0xCF) === 0xC1) {
        const rp = (b0 >> 4) & 3;
        const names = ['BC', 'DE', 'HL', 'AF'];
        result.asm = `POP ${names[rp]}`;
        break;
      }

      // PUSH rr
      if ((b0 & 0xCF) === 0xC5) {
        const rp = (b0 >> 4) & 3;
        const names = ['BC', 'DE', 'HL', 'AF'];
        result.asm = `PUSH ${names[rp]}`;
        break;
      }

      // JP cc,nn
      if ((b0 & 0xC7) === 0xC2) {
        const cc = (b0 >> 3) & 7;
        const nn = imm24();
        result.asm = `JP ${ccNames[cc]},0x${hex6(nn)}`;
        result.jumps.push(nn);
        result.size = rawBytes.length;
        break;
      }

      // CALL cc,nn
      if ((b0 & 0xC7) === 0xC4) {
        const cc = (b0 >> 3) & 7;
        const nn = imm24();
        result.asm = `CALL ${ccNames[cc]},0x${hex6(nn)}`;
        result.calls.push(nn);
        result.size = rawBytes.length;
        break;
      }

      // ALU A,n
      if ((b0 & 0xC7) === 0xC6) {
        const op = (b0 >> 3) & 7;
        const n = imm8();
        const opNames = ['ADD A,', 'ADC A,', 'SUB ', 'SBC A,', 'AND ', 'XOR ', 'OR ', 'CP '];
        result.asm = `${opNames[op]}0x${hex2(n)}`;
        result.size = rawBytes.length;
        break;
      }

      // RST
      if ((b0 & 0xC7) === 0xC7) {
        const t = b0 & 0x38;
        result.asm = `RST 0x${hex2(t)}`;
        break;
      }

      switch (b0) {
        // JP nn
        case 0xC3: {
          const nn = imm24();
          result.asm = `JP 0x${hex6(nn)}`;
          result.jumps.push(nn);
          result.isUncondJump = true;
          result.size = rawBytes.length;
          break;
        }
        // RET
        case 0xC9:
          result.asm = 'RET';
          result.isRet = true;
          break;
        // CALL nn
        case 0xCD: {
          const nn = imm24();
          result.asm = `CALL 0x${hex6(nn)}`;
          result.calls.push(nn);
          result.size = rawBytes.length;
          break;
        }
        // EXX
        case 0xD9: result.asm = 'EXX'; break;
        // OUT (n),A
        case 0xD3: {
          const n = imm8();
          result.asm = `OUT (0x${hex2(n)}),A`;
          result.size = rawBytes.length;
          break;
        }
        // IN A,(n)
        case 0xDB: {
          const n = imm8();
          result.asm = `IN A,(0x${hex2(n)})`;
          result.size = rawBytes.length;
          break;
        }
        // EX (SP),HL
        case 0xE3: result.asm = 'EX (SP),HL'; break;
        // JP (HL)
        case 0xE9: result.asm = 'JP (HL)'; result.isUncondJump = true; break;
        // EX DE,HL
        case 0xEB: result.asm = 'EX DE,HL'; break;
        // DI
        case 0xF3: result.asm = 'DI'; break;
        // EI
        case 0xFB: result.asm = 'EI'; break;
        // LD SP,HL
        case 0xF9: result.asm = 'LD SP,HL'; break;

        // CB prefix
        case 0xCB: {
          const b1 = imm8();
          const r = b1 & 7;
          const bit = (b1 >> 3) & 7;
          if (b1 < 0x40) {
            const ops = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
            result.asm = `${ops[(b1 >> 3) & 7]} ${rNames[r]}`;
          } else if (b1 < 0x80) {
            result.asm = `BIT ${bit},${rNames[r]}`;
          } else if (b1 < 0xC0) {
            result.asm = `RES ${bit},${rNames[r]}`;
          } else {
            result.asm = `SET ${bit},${rNames[r]}`;
          }
          result.size = rawBytes.length;
          break;
        }

        // ED prefix
        case 0xED: {
          const b1 = imm8();
          switch (b1) {
            case 0x4B: { // LD BC,(nn)
              const nn = imm24();
              result.asm = `LD BC,(0x${hex6(nn)})`;
              classifyAddr(nn, true);
              result.size = rawBytes.length;
              break;
            }
            case 0x5B: { // LD DE,(nn)
              const nn = imm24();
              result.asm = `LD DE,(0x${hex6(nn)})`;
              classifyAddr(nn, true);
              result.size = rawBytes.length;
              break;
            }
            case 0x43: { // LD (nn),BC
              const nn = imm24();
              result.asm = `LD (0x${hex6(nn)}),BC`;
              classifyAddr(nn, false);
              result.size = rawBytes.length;
              break;
            }
            case 0x53: { // LD (nn),DE
              const nn = imm24();
              result.asm = `LD (0x${hex6(nn)}),DE`;
              classifyAddr(nn, false);
              result.size = rawBytes.length;
              break;
            }
            case 0x73: { // LD (nn),SP
              const nn = imm24();
              result.asm = `LD (0x${hex6(nn)}),SP`;
              classifyAddr(nn, false);
              result.size = rawBytes.length;
              break;
            }
            case 0x7B: { // LD SP,(nn)
              const nn = imm24();
              result.asm = `LD SP,(0x${hex6(nn)})`;
              classifyAddr(nn, true);
              result.size = rawBytes.length;
              break;
            }
            case 0xB0: result.asm = 'LDIR'; result.size = rawBytes.length; break;
            case 0xB8: result.asm = 'LDDR'; result.size = rawBytes.length; break;
            case 0xA0: result.asm = 'LDI'; result.size = rawBytes.length; break;
            case 0xA8: result.asm = 'LDD'; result.size = rawBytes.length; break;
            case 0x44: result.asm = 'NEG'; result.size = rawBytes.length; break;
            case 0x4D: result.asm = 'RETI'; result.isRet = true; result.size = rawBytes.length; break;
            case 0x45: result.asm = 'RETN'; result.isRet = true; result.size = rawBytes.length; break;
            case 0x46: result.asm = 'IM 0'; result.size = rawBytes.length; break;
            case 0x56: result.asm = 'IM 1'; result.size = rawBytes.length; break;
            case 0x5E: result.asm = 'IM 2'; result.size = rawBytes.length; break;
            case 0x47: result.asm = 'LD I,A'; result.size = rawBytes.length; break;
            case 0x4F: result.asm = 'LD R,A'; result.size = rawBytes.length; break;
            case 0x57: result.asm = 'LD A,I'; result.size = rawBytes.length; break;
            case 0x5F: result.asm = 'LD A,R'; result.size = rawBytes.length; break;
            // eZ80: ED 39 xx yy zz = LD (nn),IX or other — varies
            default:
              result.asm = `DB 0xED,0x${hex2(b1)}`;
              result.size = rawBytes.length;
              break;
          }
          break;
        }

        // DD prefix (IX)
        case 0xDD: {
          const b1 = imm8();
          if (b1 === 0xCB) {
            const d = simm8();
            const b3 = imm8();
            const bit = (b3 >> 3) & 7;
            if (b3 < 0x40) {
              result.asm = `DD CB: shift (IX+${d})`;
            } else if (b3 < 0x80) {
              result.asm = `BIT ${bit},(IX+${d})`;
            } else if (b3 < 0xC0) {
              result.asm = `RES ${bit},(IX+${d})`;
            } else {
              result.asm = `SET ${bit},(IX+${d})`;
            }
          } else if (b1 === 0x21) {
            const nn = imm24();
            result.asm = `LD IX,0x${hex6(nn)}`;
          } else if (b1 === 0x22) {
            const nn = imm24();
            result.asm = `LD (0x${hex6(nn)}),IX`;
            classifyAddr(nn, false);
          } else if (b1 === 0x2A) {
            const nn = imm24();
            result.asm = `LD IX,(0x${hex6(nn)})`;
            classifyAddr(nn, true);
          } else if (b1 === 0xE5) {
            result.asm = 'PUSH IX';
          } else if (b1 === 0xE1) {
            result.asm = 'POP IX';
          } else if (b1 === 0x36) {
            const d = simm8();
            const n = imm8();
            result.asm = `LD (IX+${d}),0x${hex2(n)}`;
          } else if (b1 >= 0x70 && b1 <= 0x77) {
            const d = simm8();
            result.asm = `LD (IX+${d}),${rNames[b1 & 7]}`;
          } else if (b1 === 0x46 || b1 === 0x4E || b1 === 0x56 || b1 === 0x5E || b1 === 0x66 || b1 === 0x6E || b1 === 0x7E) {
            const r = (b1 >> 3) & 7;
            const d = simm8();
            result.asm = `LD ${rNames[r]},(IX+${d})`;
          } else if (b1 === 0xE9) {
            result.asm = 'JP (IX)';
            result.isUncondJump = true;
          } else if (b1 === 0x09 || b1 === 0x19 || b1 === 0x29 || b1 === 0x39) {
            result.asm = `ADD IX,${rpNames[(b1 >> 4) & 3]}`;
          } else if (b1 === 0x23) {
            result.asm = 'INC IX';
          } else if (b1 === 0x2B) {
            result.asm = 'DEC IX';
          } else {
            result.asm = `DB 0xDD,0x${hex2(b1)}`;
          }
          result.size = rawBytes.length;
          break;
        }

        // FD prefix (IY)
        case 0xFD: {
          const b1 = imm8();
          if (b1 === 0xCB) {
            const d = simm8();
            const b3 = imm8();
            const bit = (b3 >> 3) & 7;
            if (b3 < 0x40) {
              result.asm = `FD CB: shift (IY+${d})`;
            } else if (b3 < 0x80) {
              result.asm = `BIT ${bit},(IY+${d})`;
            } else if (b3 < 0xC0) {
              result.asm = `RES ${bit},(IY+${d})`;
            } else {
              result.asm = `SET ${bit},(IY+${d})`;
            }
          } else if (b1 === 0x21) {
            const nn = imm24();
            result.asm = `LD IY,0x${hex6(nn)}`;
          } else if (b1 === 0x22) {
            const nn = imm24();
            result.asm = `LD (0x${hex6(nn)}),IY`;
            classifyAddr(nn, false);
          } else if (b1 === 0x2A) {
            const nn = imm24();
            result.asm = `LD IY,(0x${hex6(nn)})`;
            classifyAddr(nn, true);
          } else if (b1 === 0xE5) {
            result.asm = 'PUSH IY';
          } else if (b1 === 0xE1) {
            result.asm = 'POP IY';
          } else if (b1 === 0x36) {
            const d = simm8();
            const n = imm8();
            result.asm = `LD (IY+${d}),0x${hex2(n)}`;
          } else if (b1 >= 0x70 && b1 <= 0x77) {
            const d = simm8();
            result.asm = `LD (IY+${d}),${rNames[b1 & 7]}`;
          } else if (b1 === 0x46 || b1 === 0x4E || b1 === 0x56 || b1 === 0x5E || b1 === 0x66 || b1 === 0x6E || b1 === 0x7E) {
            const r = (b1 >> 3) & 7;
            const d = simm8();
            result.asm = `LD ${rNames[r]},(IY+${d})`;
          } else if (b1 === 0xE9) {
            result.asm = 'JP (IY)';
            result.isUncondJump = true;
          } else if (b1 === 0x09 || b1 === 0x19 || b1 === 0x29 || b1 === 0x39) {
            result.asm = `ADD IY,${rpNames[(b1 >> 4) & 3]}`;
          } else if (b1 === 0x23) {
            result.asm = 'INC IY';
          } else if (b1 === 0x2B) {
            result.asm = 'DEC IY';
          } else {
            result.asm = `DB 0xFD,0x${hex2(b1)}`;
          }
          result.size = rawBytes.length;
          break;
        }

        default:
          result.asm = `DB 0x${hex2(b0)}`;
          break;
      }
      break;
  }

  if (result.size === 1 && rawBytes.length > 1) result.size = rawBytes.length;
  if (result.size < rawBytes.length) result.size = rawBytes.length;

  // Build hex bytes string
  const byteStr = [];
  for (let i = 0; i < result.size; i++) byteStr.push(hex2(rd8(pc + i)));
  result.bytesStr = byteStr.join(' ');

  return result;
}


// --- Main disassembly ---

function disassembleRange(startAddr, maxBytes, label) {
  console.log(`\n${'='.repeat(72)}`);
  console.log(`  Disassembly: ${label} (0x${hex6(startAddr)})`);
  console.log(`${'='.repeat(72)}\n`);

  const allRamReads = [];
  const allRamWrites = [];
  const allCalls = [];
  const allJumps = [];
  const lines = [];

  let pc = startAddr;
  const endAddr = startAddr + maxBytes;
  let stopped = false;

  while (pc < endAddr) {
    const inst = decode(pc);
    const addrStr = hex6(pc);
    const padBytes = inst.bytesStr.padEnd(20);

    let annotation = '';
    if (inst.ramReads.length) {
      annotation += `  ; RAM READ: ${inst.ramReads.map(a => '0x' + hex6(a)).join(', ')}`;
      allRamReads.push(...inst.ramReads.map(a => ({ addr: a, pc })));
    }
    if (inst.ramWrites.length) {
      annotation += `  ; RAM WRITE: ${inst.ramWrites.map(a => '0x' + hex6(a)).join(', ')}`;
      allRamWrites.push(...inst.ramWrites.map(a => ({ addr: a, pc })));
    }
    if (inst.calls.length) {
      allCalls.push(...inst.calls.map(a => ({ target: a, pc })));
    }
    if (inst.jumps.length) {
      allJumps.push(...inst.jumps.map(a => ({ target: a, pc })));
    }

    lines.push(`  ${addrStr}:  ${padBytes} ${inst.asm}${annotation}`);

    pc += inst.size;

    if (inst.isRet || inst.isUncondJump) {
      // Check if next bytes might be a continuation (conditional paths jump past)
      // We'll keep going a few more bytes to catch fall-through after conditional jumps
      // But mark we hit a terminator
      if (stopped) break; // second terminator = done
      stopped = true;
    } else {
      stopped = false;
    }
  }

  for (const line of lines) console.log(line);

  return { allRamReads, allRamWrites, allCalls, allJumps };
}

// ============================================================
// Disassemble 0x0A223A — the main VRAM fill function
// ============================================================

const main = disassembleRange(0x0A223A, 200, 'fn_0A223A (VRAM fill / home-screen row renderer)');

// ============================================================
// Disassemble 0x0A22B1 — the display setup sub-function
// ============================================================

const sub = disassembleRange(0x0A22B1, 160, 'fn_0A22B1 (display setup / row fill caller)');

// ============================================================
// Summary: RAM pointer analysis
// ============================================================

console.log(`\n${'='.repeat(72)}`);
console.log('  RAM POINTER ANALYSIS');
console.log(`${'='.repeat(72)}\n`);

console.log('--- RAM reads in fn_0A223A ---');
for (const { addr, pc } of main.allRamReads) {
  console.log(`  0x${hex6(addr)}  read at PC=0x${hex6(pc)}`);
}

console.log('\n--- RAM writes in fn_0A223A ---');
for (const { addr, pc } of main.allRamWrites) {
  console.log(`  0x${hex6(addr)}  written at PC=0x${hex6(pc)}`);
}

console.log('\n--- RAM reads in fn_0A22B1 ---');
for (const { addr, pc } of sub.allRamReads) {
  console.log(`  0x${hex6(addr)}  read at PC=0x${hex6(pc)}`);
}

console.log('\n--- RAM writes in fn_0A22B1 ---');
for (const { addr, pc } of sub.allRamWrites) {
  console.log(`  0x${hex6(addr)}  written at PC=0x${hex6(pc)}`);
}

console.log('\n--- CALL targets in fn_0A223A ---');
for (const { target, pc } of main.allCalls) {
  console.log(`  CALL 0x${hex6(target)}  from PC=0x${hex6(pc)}`);
}

console.log('\n--- CALL targets in fn_0A22B1 ---');
for (const { target, pc } of sub.allCalls) {
  console.log(`  CALL 0x${hex6(target)}  from PC=0x${hex6(pc)}`);
}

// ============================================================
// Cross-reference analysis
// ============================================================

console.log(`\n${'='.repeat(72)}`);
console.log('  CROSS-REFERENCE: How does 0x0A223A receive parameters?');
console.log(`${'='.repeat(72)}\n`);

console.log('Key observations:');
console.log('');
console.log('  fn_0A223A (0x0A223A-0x0A22B0):');
console.log('    - Starts with CALL 0x0A235E (setup/init sub)');
console.log('    - Reads D02504 (row param) at 0x0A223E, pushes AF');
console.log('    - Reads D02505 (column param) at 0x0A225B and 0x0A2294');
console.log('    - CALL 0x0800A0 decides a mode branch (Z flag → 0x0A2251, ==6 → 0x9B)');
console.log('    - Pixel coordinate computed via CALL 0x0A2D4C (multiply helper)');
console.log('    - CALL 0x09EF20 = VRAM fill (HL=0, DE=0x13F=319, B/C = row range)');
console.log('    - After RET Z at 0x0A227F: second half fills text buffer at D006C0');
console.log('    -   CALL 0x0A2A37 twice computes text buffer offset');
console.log('    -   LD DE,0xD006C0, ADD HL,DE → text buffer address');
console.log('    -   LD (HL),0x20 + LDIR fills with spaces');
console.log('    - RET at 0x0A22B0');
console.log('');
console.log('  fn_0A22B1 (0x0A22B1-0x0A232C+):');
console.log('    - Separate function, NOT called from fn_0A223A');
console.log('    - Called from fn_0A2330 (the row-iterator at 0x0A2346)');
console.log('    - Reads D00596 at 0x0A22C2 (display page/color?)');
console.log('    - Reads D00595 at 0x0A22CE and 0x0A230C (cursor row?)');
console.log('    - Calls 0x00038C (multiply A by DE=0x139=313)');
console.log('    - Uses .SIS prefix loads for 16-bit RAM reads (0x0595, 0x0596)');
console.log('    - Same VRAM fill via 0x09EF20/0x09EF44');
console.log('    - Fills text buffer at D006C0 with spaces (DJNZ loop)');
console.log('    - Exits via JP 0x0A1A36');
console.log('');
console.log('  Parameter passing:');
console.log('    - Both functions use RAM-based parameters, NOT registers');
console.log('    - D02504 = row index for fn_0A223A');
console.log('    - D02505 = column count / limit');
console.log('    - D00595 = cursor row position (fn_0A22B1)');
console.log('    - D00596 = display state byte (fn_0A22B1)');
console.log('    - D006C0 = text buffer base (26 cols x 10 rows)');

// Collect unique RAM addresses across both functions
const allAddrs = new Set();
for (const { addr } of [...main.allRamReads, ...main.allRamWrites, ...sub.allRamReads, ...sub.allRamWrites]) {
  allAddrs.add(addr);
}
console.log('\n--- All unique RAM addresses referenced ---');
for (const addr of [...allAddrs].sort((a, b) => a - b)) {
  console.log(`  0x${hex6(addr)}`);
}

console.log('\nDone.');
