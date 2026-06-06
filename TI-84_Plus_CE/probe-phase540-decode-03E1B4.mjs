#!/usr/bin/env node
// Phase 540: Decode 0x03E1B4 — Main TI-OS Error Processing Routine
//
// Context: The error dispatch table at 0x061D00-0x061DB0 (44 entries) each does
// LD A,<errorCode> then jumps to 0x061DB2, which stores at RAM D008DF and
// CALL 0x03E1B4. This probe statically disassembles 0x03E1B4 to understand
// the full error processing flow.

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(join(__dirname, 'ROM.rom'));

function readByte(addr) { return rom[addr]; }
function readWord(addr) { return rom[addr] | (rom[addr + 1] << 8); }
function readAddr(addr) { return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16); }
function hex(v, w = 6) { return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0'); }
function hexB(v) { return '0x' + v.toString(16).toUpperCase().padStart(2, '0'); }

// =========================================================================
// eZ80 disassembler (ADL mode — 3-byte addresses, 3-byte immediates)
// =========================================================================

const r8Names = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
const r16Names = ['BC', 'DE', 'HL', 'SP'];
const ccNames = ['NZ', 'Z', 'NC', 'C', 'PO', 'PE', 'P', 'M'];
const aluNames = ['ADD A,', 'ADC A,', 'SUB ', 'SBC A,', 'AND ', 'XOR ', 'OR ', 'CP '];

function disasm(startAddr, maxBytes) {
  const instructions = [];
  let pc = startAddr;
  const end = startAddr + maxBytes;
  let retCount = 0;

  while (pc < end && retCount < 3) {
    const instrStart = pc;
    let prefix = null; // 'IX' or 'IY'
    let byte = readByte(pc++);

    // Handle DD/FD prefix
    if (byte === 0xDD || byte === 0xFD) {
      prefix = byte === 0xDD ? 'IX' : 'IY';
      byte = readByte(pc++);
    }

    let mnemonic = '';
    let isRet = false;
    let isJp = false;

    // CB prefix (bit operations)
    if (byte === 0xCB) {
      if (prefix) {
        const disp = readByte(pc++);
        const op = readByte(pc++);
        const dispSigned = disp > 127 ? disp - 256 : disp;
        const target = `(${prefix}${dispSigned >= 0 ? '+' : ''}${dispSigned})`;
        const bit = (op >> 3) & 7;
        if ((op & 0xC0) === 0x00) {
          const shifts = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
          mnemonic = `${shifts[(op >> 3) & 7]} ${target}`;
        } else if ((op & 0xC0) === 0x40) {
          mnemonic = `BIT ${bit},${target}`;
        } else if ((op & 0xC0) === 0x80) {
          mnemonic = `RES ${bit},${target}`;
        } else {
          mnemonic = `SET ${bit},${target}`;
        }
      } else {
        const op = readByte(pc++);
        const r = r8Names[op & 7];
        const bit = (op >> 3) & 7;
        if ((op & 0xC0) === 0x00) {
          const shifts = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
          mnemonic = `${shifts[(op >> 3) & 7]} ${r}`;
        } else if ((op & 0xC0) === 0x40) {
          mnemonic = `BIT ${bit},${r}`;
        } else if ((op & 0xC0) === 0x80) {
          mnemonic = `RES ${bit},${r}`;
        } else {
          mnemonic = `SET ${bit},${r}`;
        }
      }
    }
    // ED prefix (extended operations)
    else if (byte === 0xED) {
      const op = readByte(pc++);
      switch (op) {
        case 0x40: mnemonic = 'IN B,(C)'; break;
        case 0x41: mnemonic = 'OUT (C),B'; break;
        case 0x42: mnemonic = 'SBC HL,BC'; break;
        case 0x43: { const a = readAddr(pc); pc += 3; mnemonic = `LD (${hex(a)}),BC`; break; }
        case 0x44: mnemonic = 'NEG'; break;
        case 0x45: mnemonic = 'RETN'; isRet = true; break;
        case 0x46: mnemonic = 'IM 0'; break;
        case 0x47: mnemonic = 'LD I,A'; break;
        case 0x48: mnemonic = 'IN C,(C)'; break;
        case 0x49: mnemonic = 'OUT (C),C'; break;
        case 0x4A: mnemonic = 'ADC HL,BC'; break;
        case 0x4B: { const a = readAddr(pc); pc += 3; mnemonic = `LD BC,(${hex(a)})`; break; }
        case 0x4D: mnemonic = 'RETI'; isRet = true; break;
        case 0x4F: mnemonic = 'LD R,A'; break;
        case 0x50: mnemonic = 'IN D,(C)'; break;
        case 0x51: mnemonic = 'OUT (C),D'; break;
        case 0x52: mnemonic = 'SBC HL,DE'; break;
        case 0x53: { const a = readAddr(pc); pc += 3; mnemonic = `LD (${hex(a)}),DE`; break; }
        case 0x56: mnemonic = 'IM 1'; break;
        case 0x57: mnemonic = 'LD A,I'; break;
        case 0x58: mnemonic = 'IN E,(C)'; break;
        case 0x59: mnemonic = 'OUT (C),E'; break;
        case 0x5A: mnemonic = 'ADC HL,DE'; break;
        case 0x5B: { const a = readAddr(pc); pc += 3; mnemonic = `LD DE,(${hex(a)})`; break; }
        case 0x5E: mnemonic = 'IM 2'; break;
        case 0x5F: mnemonic = 'LD A,R'; break;
        case 0x60: mnemonic = 'IN H,(C)'; break;
        case 0x61: mnemonic = 'OUT (C),H'; break;
        case 0x62: mnemonic = 'SBC HL,HL'; break;
        case 0x63: { const a = readAddr(pc); pc += 3; mnemonic = `LD (${hex(a)}),HL`; break; }
        case 0x67: mnemonic = 'RRD'; break;
        case 0x68: mnemonic = 'IN L,(C)'; break;
        case 0x69: mnemonic = 'OUT (C),L'; break;
        case 0x6A: mnemonic = 'ADC HL,HL'; break;
        case 0x6B: { const a = readAddr(pc); pc += 3; mnemonic = `LD HL,(${hex(a)})`; break; }
        case 0x6F: mnemonic = 'RLD'; break;
        case 0x72: mnemonic = 'SBC HL,SP'; break;
        case 0x73: { const a = readAddr(pc); pc += 3; mnemonic = `LD (${hex(a)}),SP`; break; }
        case 0x78: mnemonic = 'IN A,(C)'; break;
        case 0x79: mnemonic = 'OUT (C),A'; break;
        case 0x7A: mnemonic = 'ADC HL,SP'; break;
        case 0x7B: { const a = readAddr(pc); pc += 3; mnemonic = `LD SP,(${hex(a)})`; break; }
        case 0xA0: mnemonic = 'LDI'; break;
        case 0xA1: mnemonic = 'CPI'; break;
        case 0xA2: mnemonic = 'INI'; break;
        case 0xA3: mnemonic = 'OUTI'; break;
        case 0xA8: mnemonic = 'LDD'; break;
        case 0xA9: mnemonic = 'CPD'; break;
        case 0xAA: mnemonic = 'IND'; break;
        case 0xAB: mnemonic = 'OUTD'; break;
        case 0xB0: mnemonic = 'LDIR'; break;
        case 0xB1: mnemonic = 'CPIR'; break;
        case 0xB2: mnemonic = 'INIR'; break;
        case 0xB3: mnemonic = 'OTIR'; break;
        case 0xB8: mnemonic = 'LDDR'; break;
        case 0xB9: mnemonic = 'CPDR'; break;
        case 0xBA: mnemonic = 'INDR'; break;
        case 0xBB: mnemonic = 'OTDR'; break;
        default: mnemonic = `ED ${hexB(op)} (unknown)`; break;
      }
    }
    // Main opcode table
    else {
      const hi2 = (byte >> 6) & 3;
      const mid3 = (byte >> 3) & 7;
      const lo3 = byte & 7;

      if (hi2 === 0) {
        switch (lo3) {
          case 0:
            if (mid3 === 0) mnemonic = 'NOP';
            else if (mid3 === 1) mnemonic = "EX AF,AF'";
            else if (mid3 === 2) {
              const disp = readByte(pc++);
              const offset = disp > 127 ? disp - 256 : disp;
              const target = pc + offset;
              mnemonic = `DJNZ ${hex(target)}`;
            } else if (mid3 === 3) {
              const disp = readByte(pc++);
              const offset = disp > 127 ? disp - 256 : disp;
              const target = pc + offset;
              mnemonic = `JR ${hex(target)}`;
              isJp = true;
            } else {
              const disp = readByte(pc++);
              const offset = disp > 127 ? disp - 256 : disp;
              const target = pc + offset;
              mnemonic = `JR ${ccNames[mid3 - 4]},${hex(target)}`;
            }
            break;
          case 1:
            if ((mid3 & 1) === 0) {
              const rp = (mid3 >> 1) & 3;
              const rpName = prefix && rp === 2 ? prefix : r16Names[rp];
              const val = readAddr(pc); pc += 3;
              mnemonic = `LD ${rpName},${hex(val)}`;
            } else {
              const rp = (mid3 >> 1) & 3;
              const rpName = prefix && rp === 2 ? prefix : r16Names[rp];
              const hlName = prefix || 'HL';
              mnemonic = `ADD ${hlName},${rpName}`;
            }
            break;
          case 2:
            if (mid3 === 0) mnemonic = 'LD (BC),A';
            else if (mid3 === 1) mnemonic = 'LD A,(BC)';
            else if (mid3 === 2) mnemonic = 'LD (DE),A';
            else if (mid3 === 3) mnemonic = 'LD A,(DE)';
            else if (mid3 === 4) {
              const a = readAddr(pc); pc += 3;
              mnemonic = `LD (${hex(a)}),${prefix || 'HL'}`;
            } else if (mid3 === 5) {
              const a = readAddr(pc); pc += 3;
              mnemonic = `LD ${prefix || 'HL'},(${hex(a)})`;
            } else if (mid3 === 6) {
              const a = readAddr(pc); pc += 3;
              mnemonic = `LD (${hex(a)}),A`;
            } else {
              const a = readAddr(pc); pc += 3;
              mnemonic = `LD A,(${hex(a)})`;
            }
            break;
          case 3:
            if ((mid3 & 1) === 0) {
              const rp = (mid3 >> 1) & 3;
              const rpName = prefix && rp === 2 ? prefix : r16Names[rp];
              mnemonic = `INC ${rpName}`;
            } else {
              const rp = (mid3 >> 1) & 3;
              const rpName = prefix && rp === 2 ? prefix : r16Names[rp];
              mnemonic = `DEC ${rpName}`;
            }
            break;
          case 4: {
            let rName = r8Names[mid3];
            if (prefix && mid3 === 6) {
              const d = readByte(pc++);
              const ds = d > 127 ? d - 256 : d;
              rName = `(${prefix}${ds >= 0 ? '+' : ''}${ds})`;
            }
            mnemonic = `INC ${rName}`;
            break;
          }
          case 5: {
            let rName = r8Names[mid3];
            if (prefix && mid3 === 6) {
              const d = readByte(pc++);
              const ds = d > 127 ? d - 256 : d;
              rName = `(${prefix}${ds >= 0 ? '+' : ''}${ds})`;
            }
            mnemonic = `DEC ${rName}`;
            break;
          }
          case 6: {
            let rName = r8Names[mid3];
            if (prefix && mid3 === 6) {
              const d = readByte(pc++);
              const ds = d > 127 ? d - 256 : d;
              rName = `(${prefix}${ds >= 0 ? '+' : ''}${ds})`;
            }
            const imm = readByte(pc++);
            mnemonic = `LD ${rName},${hexB(imm)}`;
            break;
          }
          case 7: {
            const misc = ['RLCA', 'RRCA', 'RLA', 'RRA', 'DAA', 'CPL', 'SCF', 'CCF'];
            mnemonic = misc[mid3];
            break;
          }
        }
      } else if (hi2 === 1) {
        if (byte === 0x76) {
          mnemonic = 'HALT';
        } else {
          let dst = r8Names[mid3];
          let src = r8Names[lo3];
          if (prefix) {
            if (mid3 === 6) {
              const d = readByte(pc++);
              const ds = d > 127 ? d - 256 : d;
              dst = `(${prefix}${ds >= 0 ? '+' : ''}${ds})`;
            } else if (lo3 === 6) {
              const d = readByte(pc++);
              const ds = d > 127 ? d - 256 : d;
              src = `(${prefix}${ds >= 0 ? '+' : ''}${ds})`;
            }
          }
          mnemonic = `LD ${dst},${src}`;
        }
      } else if (hi2 === 2) {
        let operand = r8Names[lo3];
        if (prefix && lo3 === 6) {
          const d = readByte(pc++);
          const ds = d > 127 ? d - 256 : d;
          operand = `(${prefix}${ds >= 0 ? '+' : ''}${ds})`;
        }
        mnemonic = `${aluNames[mid3]}${operand}`;
      } else {
        // hi2 === 3
        switch (lo3) {
          case 0:
            mnemonic = `RET ${ccNames[mid3]}`;
            break;
          case 1:
            if ((mid3 & 1) === 0) {
              const rp = (mid3 >> 1) & 3;
              if (rp === 3) mnemonic = prefix ? `POP ${prefix}` : 'POP AF';
              else {
                const rpName = prefix && rp === 2 ? prefix : r16Names[rp];
                mnemonic = `POP ${rpName}`;
              }
            } else {
              const sub = (mid3 >> 1) & 3;
              if (sub === 0) { mnemonic = 'RET'; isRet = true; }
              else if (sub === 1) mnemonic = 'EXX';
              else if (sub === 2) { mnemonic = prefix ? `JP (${prefix})` : 'JP (HL)'; isJp = true; }
              else { mnemonic = prefix ? `LD SP,${prefix}` : 'LD SP,HL'; }
            }
            break;
          case 2: {
            const a = readAddr(pc); pc += 3;
            mnemonic = `JP ${ccNames[mid3]},${hex(a)}`;
            break;
          }
          case 3:
            if (mid3 === 0) {
              const a = readAddr(pc); pc += 3;
              mnemonic = `JP ${hex(a)}`;
              isJp = true;
            } else if (mid3 === 1) {
              // CB prefix handled above
              mnemonic = 'CB (handled above)';
            } else if (mid3 === 2) {
              const port = readByte(pc++);
              mnemonic = `OUT (${hexB(port)}),A`;
            } else if (mid3 === 3) {
              const port = readByte(pc++);
              mnemonic = `IN A,(${hexB(port)})`;
            } else if (mid3 === 4) {
              mnemonic = prefix ? `EX (SP),${prefix}` : 'EX (SP),HL';
            } else if (mid3 === 5) {
              mnemonic = 'EX DE,HL';
            } else if (mid3 === 6) {
              mnemonic = 'DI';
            } else {
              mnemonic = 'EI';
            }
            break;
          case 4: {
            const a = readAddr(pc); pc += 3;
            mnemonic = `CALL ${ccNames[mid3]},${hex(a)}`;
            break;
          }
          case 5:
            if ((mid3 & 1) === 0) {
              const rp = (mid3 >> 1) & 3;
              if (rp === 3) mnemonic = prefix ? `PUSH ${prefix}` : 'PUSH AF';
              else {
                const rpName = prefix && rp === 2 ? prefix : r16Names[rp];
                mnemonic = `PUSH ${rpName}`;
              }
            } else {
              if (mid3 === 1) {
                const a = readAddr(pc); pc += 3;
                mnemonic = `CALL ${hex(a)}`;
              } else {
                mnemonic = `PREFIX ${hexB(byte)}`;
              }
            }
            break;
          case 6: {
            const imm = readByte(pc++);
            mnemonic = `${aluNames[mid3]}${hexB(imm)}`;
            break;
          }
          case 7:
            mnemonic = `RST ${hexB(mid3 * 8)}`;
            break;
        }
      }
    }

    // Collect raw bytes
    const len = pc - instrStart;
    const rawBytes = [];
    for (let i = 0; i < len; i++) rawBytes.push(readByte(instrStart + i).toString(16).padStart(2, '0'));

    instructions.push({
      addr: instrStart,
      bytes: rawBytes.join(' '),
      mnemonic,
      isRet,
      isJp,
    });

    if (isRet) retCount++;
    else retCount = 0;

    // Unconditional JP marks a potential end
    if (isJp && !mnemonic.includes(',') && !mnemonic.includes('(')) {
      retCount++;
    }
  }

  return instructions;
}

// =========================================================================
// Main
// =========================================================================

const START = 0x03E1B4;
const LENGTH = 300;

console.log('='.repeat(70));
console.log(`PHASE 540: DECODE ${hex(START)} - MAIN ERROR PROCESSING ROUTINE`);
console.log('='.repeat(70));

// Raw hex dump
console.log(`\n--- RAW HEX DUMP ${hex(START)} to ${hex(START + LENGTH - 1)} ---`);
for (let i = 0; i < LENGTH; i += 16) {
  const lineAddr = START + i;
  let hexStr = '';
  let ascStr = '';
  for (let j = 0; j < 16 && (i + j) < LENGTH; j++) {
    const b = readByte(lineAddr + j);
    hexStr += b.toString(16).padStart(2, '0') + ' ';
    ascStr += (b >= 0x20 && b < 0x7F) ? String.fromCharCode(b) : '.';
  }
  console.log(`  ${hex(lineAddr)}: ${hexStr.padEnd(48)} ${ascStr}`);
}

// Disassemble
console.log(`\n--- DISASSEMBLY FROM ${hex(START)} ---`);
const instrs = disasm(START, LENGTH);

const callTargets = [];
const jpTargets = [];
const memAccesses = [];

for (const instr of instrs) {
  const tag = instr.isRet ? ' <-- RET' : instr.isJp ? ' <-- JP' : '';
  console.log(`  ${hex(instr.addr)}: ${instr.bytes.padEnd(20)} ${instr.mnemonic}${tag}`);

  // Collect CALL targets
  const callMatch = instr.mnemonic.match(/CALL\s+(?:\w+,)?(0x[0-9A-F]+)/);
  if (callMatch) callTargets.push({ from: instr.addr, target: callMatch[1] });

  // Collect JP targets
  const jpMatch = instr.mnemonic.match(/JP\s+(?:\w+,)?(0x[0-9A-F]+)/);
  if (jpMatch) jpTargets.push({ from: instr.addr, target: jpMatch[1] });

  // Collect memory accesses
  const memMatch = instr.mnemonic.match(/\(0x([0-9A-F]{6})\)/g);
  if (memMatch) {
    for (const m of memMatch) {
      const addr = m.slice(1, -1);
      memAccesses.push({ from: instr.addr, addr, instr: instr.mnemonic });
    }
  }
}

// Summary
console.log('\n--- CALL TARGETS ---');
for (const c of callTargets) {
  console.log(`  ${hex(c.from)} -> ${c.target}`);
}

console.log('\n--- JP TARGETS ---');
for (const j of jpTargets) {
  console.log(`  ${hex(j.from)} -> ${j.target}`);
}

console.log('\n--- MEMORY ACCESSES (RAM D0xxxx+) ---');
for (const m of memAccesses) {
  const addrVal = parseInt(m.addr.replace('0x', ''), 16);
  if (addrVal >= 0xD00000) {
    console.log(`  ${hex(m.from)}: ${m.addr} -- ${m.instr}`);
  }
}

console.log('\n--- ANALYSIS ---');
console.log(`Total instructions decoded: ${instrs.length}`);
const lastInstr = instrs[instrs.length - 1];
const bytesUsed = lastInstr ? (lastInstr.addr - START + lastInstr.bytes.split(' ').length) : 0;
console.log(`Bytes covered: ${bytesUsed}`);
console.log(`CALL targets: ${callTargets.length}`);
console.log(`JP targets: ${jpTargets.length}`);
console.log(`RAM accesses: ${memAccesses.filter(m => parseInt(m.addr.replace('0x', ''), 16) >= 0xD00000).length}`);

// Also decode the caller context at 0x061DB2 for reference
console.log('\n' + '='.repeat(70));
console.log(`BONUS: DECODE ${hex(0x061DB2)} - SHARED ERROR HANDLER STUB`);
console.log('='.repeat(70));
const stubInstrs = disasm(0x061DB2, 40);
for (const instr of stubInstrs) {
  const tag = instr.isRet ? ' <-- RET' : instr.isJp ? ' <-- JP' : '';
  console.log(`  ${hex(instr.addr)}: ${instr.bytes.padEnd(20)} ${instr.mnemonic}${tag}`);
}

// Decode a few more subroutines that 0x03E1B4 calls, if we can identify them
console.log('\n' + '='.repeat(70));
console.log('BONUS: DECODE CALL TARGETS (first 60 bytes each)');
console.log('='.repeat(70));
for (const c of callTargets) {
  const targetAddr = parseInt(c.target.replace('0x', ''), 16);
  // Only decode ROM targets (< 0x400000)
  if (targetAddr < 0x400000 && targetAddr !== START) {
    console.log(`\n  --- ${c.target} (called from ${hex(c.from)}) ---`);
    const subInstrs = disasm(targetAddr, 60);
    for (const instr of subInstrs) {
      const tag = instr.isRet ? ' <-- RET' : instr.isJp ? ' <-- JP' : '';
      console.log(`    ${hex(instr.addr)}: ${instr.bytes.padEnd(20)} ${instr.mnemonic}${tag}`);
    }
  }
}

console.log('\nDone.');
