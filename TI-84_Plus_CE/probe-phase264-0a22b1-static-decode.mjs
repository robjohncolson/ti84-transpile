/**
 * probe-phase264-0a22b1-static-decode.mjs
 *
 * Static disassembly of 0x0A22B1 — the display row setup function that
 * reads D00595/D00596 (distinct from 0x0A223A which reads D02504/D02505).
 *
 * Usage: node TI-84_Plus_CE/probe-phase264-0a22b1-static-decode.mjs
 */

import { readFileSync } from 'fs';

const rom = readFileSync('TI-84_Plus_CE/ROM.rom');

// --- Helpers ---

function rd8(addr) { return rom[addr]; }
function rd16(addr) { return rom[addr] | (rom[addr + 1] << 8); }
function rd24(addr) { return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16); }
function hex2(v) { return v.toString(16).padStart(2, '0'); }
function hex4(v) { return v.toString(16).padStart(4, '0'); }
function hex6(v) { return v.toString(16).padStart(6, '0'); }

const ccNames = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const rpNames = ['BC', 'DE', 'HL', 'SP'];
const rNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];

/**
 * Decode one eZ80 ADL-mode instruction at `pc`.
 * Returns { asm, bytes, size, ramReads, ramWrites, calls, jumps, isRet, isUncondJump }
 */
function decode(pc) {
  const result = {
    asm: '',
    size: 1,
    ramReads: [],
    ramWrites: [],
    calls: [],
    jumps: [],
    isRet: false,
    isUncondJump: false,
  };

  const b0 = rd8(pc);
  const rawBytes = [];

  function grabBytes(n) {
    for (let i = 0; i < n; i++) rawBytes.push(rd8(pc + rawBytes.length));
  }

  grabBytes(1);

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
    case 0x00: result.asm = 'NOP'; break;

    // LD rr, nn (24-bit in ADL)
    case 0x01: case 0x11: case 0x21: case 0x31: {
      const rp = (b0 >> 4) & 3;
      const nn = imm24();
      result.asm = `LD ${rpNames[rp]},0x${hex6(nn)}`;
      result.size = rawBytes.length;
      break;
    }

    case 0x02: result.asm = 'LD (BC),A'; break;
    case 0x03: case 0x13: case 0x23: case 0x33: {
      result.asm = `INC ${rpNames[(b0 >> 4) & 3]}`;
      break;
    }
    case 0x04: case 0x0C: case 0x14: case 0x1C: case 0x24: case 0x2C: case 0x3C: {
      const r = (b0 >> 3) & 7;
      result.asm = `INC ${rNames[r]}`;
      break;
    }
    case 0x05: case 0x0D: case 0x15: case 0x1D: case 0x25: case 0x2D: case 0x3D: {
      const r = (b0 >> 3) & 7;
      result.asm = `DEC ${rNames[r]}`;
      break;
    }
    case 0x06: case 0x0E: case 0x16: case 0x1E: case 0x26: case 0x2E: case 0x3E: {
      const r = (b0 >> 3) & 7;
      const n = imm8();
      result.asm = `LD ${rNames[r]},0x${hex2(n)}`;
      result.size = rawBytes.length;
      break;
    }
    case 0x07: result.asm = 'RLCA'; break;
    case 0x08: result.asm = "EX AF,AF'"; break;
    case 0x09: case 0x19: case 0x29: case 0x39: {
      result.asm = `ADD HL,${rpNames[(b0 >> 4) & 3]}`;
      break;
    }
    case 0x0A: result.asm = 'LD A,(BC)'; break;
    case 0x0B: case 0x1B: case 0x2B: case 0x3B: {
      result.asm = `DEC ${rpNames[(b0 >> 4) & 3]}`;
      break;
    }
    case 0x0F: result.asm = 'RRCA'; break;
    case 0x10: {
      const off = simm8();
      const target = pc + rawBytes.length + off;
      result.asm = `DJNZ 0x${hex6(target)}`;
      result.jumps.push(target);
      result.size = rawBytes.length;
      break;
    }
    case 0x12: result.asm = 'LD (DE),A'; break;
    case 0x18: {
      const off = simm8();
      const target = pc + rawBytes.length + off;
      result.asm = `JR 0x${hex6(target)}`;
      result.jumps.push(target);
      result.isUncondJump = true;
      result.size = rawBytes.length;
      break;
    }
    case 0x1A: result.asm = 'LD A,(DE)'; break;
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
    case 0x22: {
      const nn = imm24();
      result.asm = `LD (0x${hex6(nn)}),HL`;
      classifyAddr(nn, false);
      result.size = rawBytes.length;
      break;
    }
    case 0x27: result.asm = 'DAA'; break;
    case 0x2A: {
      const nn = imm24();
      result.asm = `LD HL,(0x${hex6(nn)})`;
      classifyAddr(nn, true);
      result.size = rawBytes.length;
      break;
    }
    case 0x2F: result.asm = 'CPL'; break;
    case 0x32: {
      const nn = imm24();
      result.asm = `LD (0x${hex6(nn)}),A`;
      classifyAddr(nn, false);
      result.size = rawBytes.length;
      break;
    }
    case 0x34: result.asm = 'INC (HL)'; break;
    case 0x35: result.asm = 'DEC (HL)'; break;
    case 0x36: {
      const n = imm8();
      result.asm = `LD (HL),0x${hex2(n)}`;
      result.size = rawBytes.length;
      break;
    }
    case 0x37: result.asm = 'SCF'; break;
    case 0x3F: result.asm = 'CCF'; break;
    case 0x3A: {
      const nn = imm24();
      result.asm = `LD A,(0x${hex6(nn)})`;
      classifyAddr(nn, true);
      result.size = rawBytes.length;
      break;
    }

    case 0x76: result.asm = 'HALT'; break;
    default:
      if (b0 >= 0x40 && b0 <= 0x7F) {
        const dst = (b0 >> 3) & 7;
        const src = b0 & 7;
        if (b0 === 0x40) {
          result.asm = '.SIS prefix';
          const b1 = rd8(pc + 1);
          grabBytes(1);
          if (b1 === 0x2A) {
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
          } else if (b1 === 0x3A) {
            // LD.SIS A,(nn) — 16-bit address
            grabBytes(2);
            const nn16 = rd16(pc + 2);
            result.asm = `LD.SIS A,(0x${hex4(nn16)})`;
            classifyAddr(0xD00000 | nn16, true); // SIS addresses are low 16 bits of D0xxxx
          } else if (b1 === 0x32) {
            // LD.SIS (nn),A — 16-bit address
            grabBytes(2);
            const nn16 = rd16(pc + 2);
            result.asm = `LD.SIS (0x${hex4(nn16)}),A`;
            classifyAddr(0xD00000 | nn16, false);
          } else {
            result.asm = `LD ${rNames[dst]},${rNames[src]}`;
            rawBytes.length = 1;
          }
          result.size = rawBytes.length;
          break;
        }
        result.asm = `LD ${rNames[dst]},${rNames[src]}`;
        break;
      }

      if (b0 >= 0x80 && b0 <= 0xBF) {
        const op = (b0 >> 3) & 7;
        const r = b0 & 7;
        const opNames = ['ADD A,', 'ADC A,', 'SUB ', 'SBC A,', 'AND ', 'XOR ', 'OR ', 'CP '];
        result.asm = `${opNames[op]}${rNames[r]}`;
        break;
      }

      if ((b0 & 0xC7) === 0xC0) {
        const cc = (b0 >> 3) & 7;
        result.asm = `RET ${ccNames[cc]}`;
        break;
      }

      if ((b0 & 0xCF) === 0xC1) {
        const rp = (b0 >> 4) & 3;
        const names = ['BC', 'DE', 'HL', 'AF'];
        result.asm = `POP ${names[rp]}`;
        break;
      }

      if ((b0 & 0xCF) === 0xC5) {
        const rp = (b0 >> 4) & 3;
        const names = ['BC', 'DE', 'HL', 'AF'];
        result.asm = `PUSH ${names[rp]}`;
        break;
      }

      if ((b0 & 0xC7) === 0xC2) {
        const cc = (b0 >> 3) & 7;
        const nn = imm24();
        result.asm = `JP ${ccNames[cc]},0x${hex6(nn)}`;
        result.jumps.push(nn);
        result.size = rawBytes.length;
        break;
      }

      if ((b0 & 0xC7) === 0xC4) {
        const cc = (b0 >> 3) & 7;
        const nn = imm24();
        result.asm = `CALL ${ccNames[cc]},0x${hex6(nn)}`;
        result.calls.push(nn);
        result.size = rawBytes.length;
        break;
      }

      if ((b0 & 0xC7) === 0xC6) {
        const op = (b0 >> 3) & 7;
        const n = imm8();
        const opNames = ['ADD A,', 'ADC A,', 'SUB ', 'SBC A,', 'AND ', 'XOR ', 'OR ', 'CP '];
        result.asm = `${opNames[op]}0x${hex2(n)}`;
        result.size = rawBytes.length;
        break;
      }

      if ((b0 & 0xC7) === 0xC7) {
        const t = b0 & 0x38;
        result.asm = `RST 0x${hex2(t)}`;
        break;
      }

      switch (b0) {
        case 0xC3: {
          const nn = imm24();
          result.asm = `JP 0x${hex6(nn)}`;
          result.jumps.push(nn);
          result.isUncondJump = true;
          result.size = rawBytes.length;
          break;
        }
        case 0xC9:
          result.asm = 'RET';
          result.isRet = true;
          break;
        case 0xCD: {
          const nn = imm24();
          result.asm = `CALL 0x${hex6(nn)}`;
          result.calls.push(nn);
          result.size = rawBytes.length;
          break;
        }
        case 0xD9: result.asm = 'EXX'; break;
        case 0xD3: {
          const n = imm8();
          result.asm = `OUT (0x${hex2(n)}),A`;
          result.size = rawBytes.length;
          break;
        }
        case 0xDB: {
          const n = imm8();
          result.asm = `IN A,(0x${hex2(n)})`;
          result.size = rawBytes.length;
          break;
        }
        case 0xE3: result.asm = 'EX (SP),HL'; break;
        case 0xE9: result.asm = 'JP (HL)'; result.isUncondJump = true; break;
        case 0xEB: result.asm = 'EX DE,HL'; break;
        case 0xF3: result.asm = 'DI'; break;
        case 0xFB: result.asm = 'EI'; break;
        case 0xF9: result.asm = 'LD SP,HL'; break;

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

        case 0xED: {
          const b1 = imm8();
          switch (b1) {
            case 0x4B: {
              const nn = imm24();
              result.asm = `LD BC,(0x${hex6(nn)})`;
              classifyAddr(nn, true);
              result.size = rawBytes.length;
              break;
            }
            case 0x5B: {
              const nn = imm24();
              result.asm = `LD DE,(0x${hex6(nn)})`;
              classifyAddr(nn, true);
              result.size = rawBytes.length;
              break;
            }
            case 0x43: {
              const nn = imm24();
              result.asm = `LD (0x${hex6(nn)}),BC`;
              classifyAddr(nn, false);
              result.size = rawBytes.length;
              break;
            }
            case 0x53: {
              const nn = imm24();
              result.asm = `LD (0x${hex6(nn)}),DE`;
              classifyAddr(nn, false);
              result.size = rawBytes.length;
              break;
            }
            case 0x73: {
              const nn = imm24();
              result.asm = `LD (0x${hex6(nn)}),SP`;
              classifyAddr(nn, false);
              result.size = rawBytes.length;
              break;
            }
            case 0x7B: {
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
            default:
              result.asm = `DB 0xED,0x${hex2(b1)}`;
              result.size = rawBytes.length;
              break;
          }
          break;
        }

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

  const byteStr = [];
  for (let i = 0; i < result.size; i++) byteStr.push(hex2(rd8(pc + i)));
  result.bytesStr = byteStr.join(' ');

  return result;
}


// --- Main disassembly ---

function disassembleRange(startAddr, maxBytes) {
  console.log(`\n${'='.repeat(72)}`);
  console.log(`  Static Disassembly: fn_0A22B1 (0x${hex6(startAddr)})`);
  console.log(`${'='.repeat(72)}\n`);

  const allRamReads = [];
  const allRamWrites = [];
  const allCalls = [];
  const allJumps = [];
  const iyOps = [];

  let pc = startAddr;
  const endAddr = startAddr + maxBytes;
  let terminatorCount = 0;

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
    if (inst.asm.includes('IY')) {
      iyOps.push({ pc, asm: inst.asm });
    }

    console.log(`  ${addrStr}:  ${padBytes} ${inst.asm}${annotation}`);

    const prevPc = pc;
    pc += inst.size;

    if (inst.isRet || inst.isUncondJump) {
      terminatorCount++;
      if (terminatorCount >= 2) {
        console.log(`\n  --- Hit second terminator at 0x${hex6(prevPc)}, stopping ---`);
        break;
      }
    } else {
      terminatorCount = 0;
    }
  }

  const fnLength = pc - startAddr;
  console.log(`\n  Function length: ${fnLength} bytes (0x${hex6(startAddr)} - 0x${hex6(pc - 1)})`);

  return { allRamReads, allRamWrites, allCalls, allJumps, iyOps, fnLength, endAddr: pc };
}

// ============================================================
// Disassemble 0x0A22B1
// ============================================================

const info = disassembleRange(0x0A22B1, 256);

// ============================================================
// Summary
// ============================================================

console.log(`\n${'='.repeat(72)}`);
console.log('  SUMMARY: fn_0A22B1');
console.log(`${'='.repeat(72)}\n`);

console.log(`Function length: ${info.fnLength} bytes`);

console.log('\n--- CALL targets ---');
for (const { target, pc } of info.allCalls) {
  console.log(`  CALL 0x${hex6(target)}  from PC=0x${hex6(pc)}`);
}

console.log('\n--- Jump targets ---');
for (const { target, pc } of info.allJumps) {
  console.log(`  -> 0x${hex6(target)}  from PC=0x${hex6(pc)}`);
}

console.log('\n--- RAM reads ---');
for (const { addr, pc } of info.allRamReads) {
  console.log(`  0x${hex6(addr)}  read at PC=0x${hex6(pc)}`);
}

console.log('\n--- RAM writes ---');
for (const { addr, pc } of info.allRamWrites) {
  console.log(`  0x${hex6(addr)}  written at PC=0x${hex6(pc)}`);
}

console.log('\n--- IY-indexed operations ---');
for (const { pc, asm } of info.iyOps) {
  console.log(`  0x${hex6(pc)}: ${asm}`);
}

// Check for D00595, D00596, D006C0 references
console.log('\n--- Key address cross-reference ---');
const keyAddrs = {
  'D00595': 0xD00595,
  'D00596': 0xD00596,
  'D006C0': 0xD006C0,
  'D02504': 0xD02504,
  'D02505': 0xD02505,
};
for (const [name, addr] of Object.entries(keyAddrs)) {
  const reads = info.allRamReads.filter(r => r.addr === addr);
  const writes = info.allRamWrites.filter(r => r.addr === addr);
  if (reads.length || writes.length) {
    console.log(`  ${name}:`);
    for (const r of reads) console.log(`    READ at PC=0x${hex6(r.pc)}`);
    for (const w of writes) console.log(`    WRITE at PC=0x${hex6(w.pc)}`);
  } else {
    console.log(`  ${name}: not referenced directly (may use .SIS 16-bit form)`);
  }
}

// All unique RAM addresses
const allAddrs = new Set();
for (const { addr } of [...info.allRamReads, ...info.allRamWrites]) {
  allAddrs.add(addr);
}
console.log('\n--- All unique RAM addresses ---');
for (const addr of [...allAddrs].sort((a, b) => a - b)) {
  console.log(`  0x${hex6(addr)}`);
}

console.log('\nDone.');
