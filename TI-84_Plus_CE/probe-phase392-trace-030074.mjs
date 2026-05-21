#!/usr/bin/env node
// probe-phase392-trace-030074.mjs
// Static analysis: find the function containing 0x030074, disassemble it,
// and find all callers (CALL/JP) targeting the 0x030060-0x030080 range.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(ROM_PATH);

const TARGET = 0x030074;
const SEARCH_LO = 0x030060;
const SEARCH_HI = 0x030080;

// ---------- eZ80 ADL-mode mini-disassembler ----------

function read24(buf, off) {
  if (off + 2 >= buf.length) return 0;
  return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16);
}

function hex(v, digits = 6) {
  return '0x' + v.toString(16).toUpperCase().padStart(digits, '0');
}

function hexByte(b) {
  return b.toString(16).toUpperCase().padStart(2, '0');
}

// Returns { mnemonic, length } for the instruction at `off` in ADL mode.
function disasmOne(buf, off) {
  if (off >= buf.length) return { mnemonic: '???', length: 1 };
  const b0 = buf[off];

  // --- prefixes DD / FD (IX / IY) ---
  if (b0 === 0xDD || b0 === 0xFD) {
    const reg = b0 === 0xDD ? 'IX' : 'IY';
    if (off + 1 >= buf.length) return { mnemonic: `${hexByte(b0)}`, length: 1 };
    const b1 = buf[off + 1];

    // DD CB dd xx  (bit ops on (IX+d))
    if (b1 === 0xCB) {
      if (off + 3 >= buf.length) return { mnemonic: `${reg} CB ...`, length: 2 };
      const d = buf[off + 2];
      const op = buf[off + 3];
      return { mnemonic: `${reg} CB+${hexByte(d)} op=${hexByte(op)}`, length: 4 };
    }

    // LD IX,imm24
    if (b1 === 0x21) {
      const imm = read24(buf, off + 2);
      return { mnemonic: `LD ${reg},${hex(imm)}`, length: 5 };
    }

    // Instructions with displacement byte (indexed addressing)
    // For simplicity, detect common ones and default to 2-byte prefix+opcode
    // JP (IX) / JP (IY)
    if (b1 === 0xE9) return { mnemonic: `JP (${reg})`, length: 2 };

    // PUSH/POP IX/IY
    if (b1 === 0xE5) return { mnemonic: `PUSH ${reg}`, length: 2 };
    if (b1 === 0xE1) return { mnemonic: `POP ${reg}`, length: 2 };

    // LD (IX+d),imm8 => DD 36 dd nn
    if (b1 === 0x36) {
      if (off + 3 >= buf.length) return { mnemonic: `LD (${reg}+d),n`, length: 2 };
      return { mnemonic: `LD (${reg}+${hexByte(buf[off+2])}),${hexByte(buf[off+3])}`, length: 4 };
    }

    // LD r,(IX+d) or LD (IX+d),r — opcodes 0x46,0x4E,0x56,0x5E,0x66,0x6E,0x70-0x77,0x7E
    if ((b1 & 0xC0) === 0x40) {
      // These use a displacement byte
      if (off + 2 >= buf.length) return { mnemonic: `${reg} ${hexByte(b1)}`, length: 2 };
      return { mnemonic: `${reg} op=${hexByte(b1)} d=${hexByte(buf[off+2])}`, length: 3 };
    }

    // ADD IX,rr  (b1 = 0x09, 0x19, 0x29, 0x39)
    if ((b1 & 0xCF) === 0x09) {
      const pairs = ['BC','DE',reg,'SP'];
      return { mnemonic: `ADD ${reg},${pairs[(b1>>4)&3]}`, length: 2 };
    }

    // LD (IX+d),r  — covered above in 0x70-0x77 range
    // INC/DEC (IX+d) => DD 34/35 dd
    if (b1 === 0x34 || b1 === 0x35) {
      if (off + 2 >= buf.length) return { mnemonic: `${b1===0x34?'INC':'DEC'} (${reg}+d)`, length: 2 };
      return { mnemonic: `${b1===0x34?'INC':'DEC'} (${reg}+${hexByte(buf[off+2])})`, length: 3 };
    }

    // Default: 2-byte prefix+opcode
    return { mnemonic: `${reg} ${hexByte(b1)}`, length: 2 };
  }

  // --- ED prefix ---
  if (b0 === 0xED) {
    if (off + 1 >= buf.length) return { mnemonic: 'ED ???', length: 1 };
    const b1 = buf[off + 1];
    if (b1 === 0x4D) return { mnemonic: 'RETI', length: 2 };
    if (b1 === 0x45) return { mnemonic: 'RETN', length: 2 };
    if (b1 === 0x46) return { mnemonic: 'IM 0', length: 2 };
    if (b1 === 0x56) return { mnemonic: 'IM 1', length: 2 };
    if (b1 === 0x5E) return { mnemonic: 'IM 2', length: 2 };
    if (b1 === 0xB0) return { mnemonic: 'LDIR', length: 2 };
    if (b1 === 0xB8) return { mnemonic: 'LDDR', length: 2 };
    if (b1 === 0xA0) return { mnemonic: 'LDI', length: 2 };
    if (b1 === 0xA8) return { mnemonic: 'LDD', length: 2 };
    if (b1 === 0x47) return { mnemonic: 'LD I,A', length: 2 };
    if (b1 === 0x57) return { mnemonic: 'LD A,I', length: 2 };
    if (b1 === 0x4F) return { mnemonic: 'LD R,A', length: 2 };
    if (b1 === 0x5F) return { mnemonic: 'LD A,R', length: 2 };
    // SBC HL,rr / ADC HL,rr
    if ((b1 & 0xCF) === 0x42) {
      const pairs = ['BC','DE','HL','SP'];
      return { mnemonic: `SBC HL,${pairs[(b1>>4)&3]}`, length: 2 };
    }
    if ((b1 & 0xCF) === 0x4A) {
      const pairs = ['BC','DE','HL','SP'];
      return { mnemonic: `ADC HL,${pairs[(b1>>4)&3]}`, length: 2 };
    }
    // IN r,(C) / OUT (C),r
    if ((b1 & 0xC7) === 0x40) {
      const regs = ['B','C','D','E','H','L','(HL)','A'];
      return { mnemonic: `IN ${regs[(b1>>3)&7]},(C)`, length: 2 };
    }
    if ((b1 & 0xC7) === 0x41) {
      const regs = ['B','C','D','E','H','L','0','A'];
      return { mnemonic: `OUT (C),${regs[(b1>>3)&7]}`, length: 2 };
    }
    // LD (imm24),rr / LD rr,(imm24) — ED 43/53/63/73 and ED 4B/5B/6B/7B (ADL: 5 bytes)
    if ((b1 & 0xC7) === 0x43) {
      const pairs = ['BC','DE','HL','SP'];
      const addr = read24(buf, off + 2);
      return { mnemonic: `LD (${hex(addr)}),${pairs[(b1>>4)&3]}`, length: 5 };
    }
    if ((b1 & 0xC7) === 0x4B) {
      const pairs = ['BC','DE','HL','SP'];
      const addr = read24(buf, off + 2);
      return { mnemonic: `LD ${pairs[(b1>>4)&3]},(${hex(addr)})`, length: 5 };
    }
    return { mnemonic: `ED ${hexByte(b1)}`, length: 2 };
  }

  // --- CB prefix (bit ops) ---
  if (b0 === 0xCB) {
    if (off + 1 >= buf.length) return { mnemonic: 'CB ???', length: 1 };
    const b1 = buf[off + 1];
    const regs = ['B','C','D','E','H','L','(HL)','A'];
    const r = regs[b1 & 7];
    const bit = (b1 >> 3) & 7;
    if (b1 < 0x08) return { mnemonic: `RLC ${r}`, length: 2 };
    if (b1 < 0x10) return { mnemonic: `RRC ${r}`, length: 2 };
    if (b1 < 0x18) return { mnemonic: `RL ${r}`, length: 2 };
    if (b1 < 0x20) return { mnemonic: `RR ${r}`, length: 2 };
    if (b1 < 0x28) return { mnemonic: `SLA ${r}`, length: 2 };
    if (b1 < 0x30) return { mnemonic: `SRA ${r}`, length: 2 };
    if (b1 < 0x40) return { mnemonic: `SRL ${r}`, length: 2 };
    if (b1 < 0x80) return { mnemonic: `BIT ${bit},${r}`, length: 2 };
    if (b1 < 0xC0) return { mnemonic: `RES ${bit},${r}`, length: 2 };
    return { mnemonic: `SET ${bit},${r}`, length: 2 };
  }

  // --- Main opcodes ---
  // NOP
  if (b0 === 0x00) return { mnemonic: 'NOP', length: 1 };

  // LD rr,imm24 (ADL mode)
  if (b0 === 0x01) { const v = read24(buf, off+1); return { mnemonic: `LD BC,${hex(v)}`, length: 4 }; }
  if (b0 === 0x11) { const v = read24(buf, off+1); return { mnemonic: `LD DE,${hex(v)}`, length: 4 }; }
  if (b0 === 0x21) { const v = read24(buf, off+1); return { mnemonic: `LD HL,${hex(v)}`, length: 4 }; }
  if (b0 === 0x31) { const v = read24(buf, off+1); return { mnemonic: `LD SP,${hex(v)}`, length: 4 }; }

  // LD A,imm8
  if (b0 === 0x3E) return { mnemonic: `LD A,${hexByte(buf[off+1])}`, length: 2 };

  // LD r,imm8 for B,C,D,E,H,L
  if (b0 === 0x06) return { mnemonic: `LD B,${hexByte(buf[off+1])}`, length: 2 };
  if (b0 === 0x0E) return { mnemonic: `LD C,${hexByte(buf[off+1])}`, length: 2 };
  if (b0 === 0x16) return { mnemonic: `LD D,${hexByte(buf[off+1])}`, length: 2 };
  if (b0 === 0x1E) return { mnemonic: `LD E,${hexByte(buf[off+1])}`, length: 2 };
  if (b0 === 0x26) return { mnemonic: `LD H,${hexByte(buf[off+1])}`, length: 2 };
  if (b0 === 0x2E) return { mnemonic: `LD L,${hexByte(buf[off+1])}`, length: 2 };

  // LD (HL),imm8
  if (b0 === 0x36) return { mnemonic: `LD (HL),${hexByte(buf[off+1])}`, length: 2 };

  // LD r,r' (0x40-0x7F except 0x76=HALT)
  if (b0 === 0x76) return { mnemonic: 'HALT', length: 1 };
  if (b0 >= 0x40 && b0 <= 0x7F) {
    const regs = ['B','C','D','E','H','L','(HL)','A'];
    return { mnemonic: `LD ${regs[(b0>>3)&7]},${regs[b0&7]}`, length: 1 };
  }

  // ALU A,r  (0x80-0xBF)
  if (b0 >= 0x80 && b0 <= 0xBF) {
    const ops = ['ADD','ADC','SUB','SBC','AND','XOR','OR','CP'];
    const regs = ['B','C','D','E','H','L','(HL)','A'];
    return { mnemonic: `${ops[(b0>>3)&7]} A,${regs[b0&7]}`, length: 1 };
  }

  // ALU A,imm8
  if (b0 === 0xC6) return { mnemonic: `ADD A,${hexByte(buf[off+1])}`, length: 2 };
  if (b0 === 0xCE) return { mnemonic: `ADC A,${hexByte(buf[off+1])}`, length: 2 };
  if (b0 === 0xD6) return { mnemonic: `SUB A,${hexByte(buf[off+1])}`, length: 2 };
  if (b0 === 0xDE) return { mnemonic: `SBC A,${hexByte(buf[off+1])}`, length: 2 };
  if (b0 === 0xE6) return { mnemonic: `AND A,${hexByte(buf[off+1])}`, length: 2 };
  if (b0 === 0xEE) return { mnemonic: `XOR A,${hexByte(buf[off+1])}`, length: 2 };
  if (b0 === 0xF6) return { mnemonic: `OR A,${hexByte(buf[off+1])}`, length: 2 };
  if (b0 === 0xFE) return { mnemonic: `CP A,${hexByte(buf[off+1])}`, length: 2 };

  // JP / CALL / RET / JR
  if (b0 === 0xC3) { const a = read24(buf, off+1); return { mnemonic: `JP ${hex(a)}`, length: 4 }; }
  if (b0 === 0xCD) { const a = read24(buf, off+1); return { mnemonic: `CALL ${hex(a)}`, length: 4 }; }
  if (b0 === 0xC9) return { mnemonic: 'RET', length: 1 };

  // Conditional JP
  const ccNames = ['NZ','Z','NC','C','PO','PE','P','M'];
  if ((b0 & 0xC7) === 0xC2) {
    const cc = ccNames[(b0 >> 3) & 7];
    const a = read24(buf, off+1);
    return { mnemonic: `JP ${cc},${hex(a)}`, length: 4 };
  }
  // Conditional CALL
  if ((b0 & 0xC7) === 0xC4) {
    const cc = ccNames[(b0 >> 3) & 7];
    const a = read24(buf, off+1);
    return { mnemonic: `CALL ${cc},${hex(a)}`, length: 4 };
  }
  // Conditional RET
  if ((b0 & 0xC7) === 0xC0) {
    const cc = ccNames[(b0 >> 3) & 7];
    return { mnemonic: `RET ${cc}`, length: 1 };
  }

  // JR / conditional JR
  if (b0 === 0x18) {
    const d = buf[off+1];
    const target = off + 2 + ((d & 0x80) ? d - 256 : d);
    return { mnemonic: `JR ${hex(target)}`, length: 2 };
  }
  if (b0 === 0x20 || b0 === 0x28 || b0 === 0x30 || b0 === 0x38) {
    const cc = ['NZ','Z','NC','C'][(b0 - 0x20) >> 3];
    const d = buf[off+1];
    const target = off + 2 + ((d & 0x80) ? d - 256 : d);
    return { mnemonic: `JR ${cc},${hex(target)}`, length: 2 };
  }

  // DJNZ
  if (b0 === 0x10) {
    const d = buf[off+1];
    const target = off + 2 + ((d & 0x80) ? d - 256 : d);
    return { mnemonic: `DJNZ ${hex(target)}`, length: 2 };
  }

  // RST
  if ((b0 & 0xC7) === 0xC7) {
    return { mnemonic: `RST ${hexByte(b0 & 0x38)}`, length: 1 };
  }

  // JP (HL)
  if (b0 === 0xE9) return { mnemonic: 'JP (HL)', length: 1 };

  // PUSH/POP
  const ppRegs = ['BC','DE','HL','AF'];
  if ((b0 & 0xCF) === 0xC5) return { mnemonic: `PUSH ${ppRegs[(b0>>4)&3]}`, length: 1 };
  if ((b0 & 0xCF) === 0xC1) return { mnemonic: `POP ${ppRegs[(b0>>4)&3]}`, length: 1 };

  // INC/DEC r
  if ((b0 & 0xC7) === 0x04) {
    const regs = ['B','C','D','E','H','L','(HL)','A'];
    return { mnemonic: `INC ${regs[(b0>>3)&7]}`, length: 1 };
  }
  if ((b0 & 0xC7) === 0x05) {
    const regs = ['B','C','D','E','H','L','(HL)','A'];
    return { mnemonic: `DEC ${regs[(b0>>3)&7]}`, length: 1 };
  }

  // INC/DEC rr
  if ((b0 & 0xCF) === 0x03) {
    const pairs = ['BC','DE','HL','SP'];
    return { mnemonic: `INC ${pairs[(b0>>4)&3]}`, length: 1 };
  }
  if ((b0 & 0xCF) === 0x0B) {
    const pairs = ['BC','DE','HL','SP'];
    return { mnemonic: `DEC ${pairs[(b0>>4)&3]}`, length: 1 };
  }

  // ADD HL,rr
  if ((b0 & 0xCF) === 0x09) {
    const pairs = ['BC','DE','HL','SP'];
    return { mnemonic: `ADD HL,${pairs[(b0>>4)&3]}`, length: 1 };
  }

  // LD (BC),A / LD (DE),A / LD A,(BC) / LD A,(DE)
  if (b0 === 0x02) return { mnemonic: 'LD (BC),A', length: 1 };
  if (b0 === 0x12) return { mnemonic: 'LD (DE),A', length: 1 };
  if (b0 === 0x0A) return { mnemonic: 'LD A,(BC)', length: 1 };
  if (b0 === 0x1A) return { mnemonic: 'LD A,(DE)', length: 1 };

  // LD (imm24),A / LD A,(imm24) / LD (imm24),HL / LD HL,(imm24)
  if (b0 === 0x32) { const a = read24(buf, off+1); return { mnemonic: `LD (${hex(a)}),A`, length: 4 }; }
  if (b0 === 0x3A) { const a = read24(buf, off+1); return { mnemonic: `LD A,(${hex(a)})`, length: 4 }; }
  if (b0 === 0x22) { const a = read24(buf, off+1); return { mnemonic: `LD (${hex(a)}),HL`, length: 4 }; }
  if (b0 === 0x2A) { const a = read24(buf, off+1); return { mnemonic: `LD HL,(${hex(a)})`, length: 4 }; }

  // EX DE,HL
  if (b0 === 0xEB) return { mnemonic: 'EX DE,HL', length: 1 };
  // EX AF,AF'
  if (b0 === 0x08) return { mnemonic: "EX AF,AF'", length: 1 };
  // EXX
  if (b0 === 0xD9) return { mnemonic: 'EXX', length: 1 };
  // EX (SP),HL
  if (b0 === 0xE3) return { mnemonic: 'EX (SP),HL', length: 1 };

  // DI / EI
  if (b0 === 0xF3) return { mnemonic: 'DI', length: 1 };
  if (b0 === 0xFB) return { mnemonic: 'EI', length: 1 };

  // RLCA, RRCA, RLA, RRA
  if (b0 === 0x07) return { mnemonic: 'RLCA', length: 1 };
  if (b0 === 0x0F) return { mnemonic: 'RRCA', length: 1 };
  if (b0 === 0x17) return { mnemonic: 'RLA', length: 1 };
  if (b0 === 0x1F) return { mnemonic: 'RRA', length: 1 };

  // CPL, SCF, CCF, DAA
  if (b0 === 0x2F) return { mnemonic: 'CPL', length: 1 };
  if (b0 === 0x37) return { mnemonic: 'SCF', length: 1 };
  if (b0 === 0x3F) return { mnemonic: 'CCF', length: 1 };
  if (b0 === 0x27) return { mnemonic: 'DAA', length: 1 };

  // LD SP,HL
  if (b0 === 0xF9) return { mnemonic: 'LD SP,HL', length: 1 };

  // OUT (n),A / IN A,(n)
  if (b0 === 0xD3) return { mnemonic: `OUT (${hexByte(buf[off+1])}),A`, length: 2 };
  if (b0 === 0xDB) return { mnemonic: `IN A,(${hexByte(buf[off+1])})`, length: 2 };

  // Fallback
  return { mnemonic: `db ${hexByte(b0)}`, length: 1 };
}

// Check if opcode at offset is a terminator (RET, RETI, RETN, JP abs, JP (HL))
function isTerminator(buf, off) {
  const b = buf[off];
  if (b === 0xC9) return true; // RET
  if (b === 0xC3) return true; // JP (unconditional)
  if (b === 0xE9) return true; // JP (HL)
  if (b === 0xED && off + 1 < buf.length) {
    const b1 = buf[off + 1];
    if (b1 === 0x4D || b1 === 0x45) return true; // RETI / RETN
  }
  // Conditional RETs are NOT terminators (execution continues after them)
  return false;
}

// Check if opcode is an unconditional RET variant
function isRet(buf, off) {
  const b = buf[off];
  if (b === 0xC9) return true;
  if (b === 0xED && off + 1 < buf.length) {
    const b1 = buf[off + 1];
    if (b1 === 0x4D || b1 === 0x45) return true;
  }
  return false;
}

// ---------- 1. Find function boundaries around TARGET ----------

console.log('=== Phase 392: Trace 0x030074 Full Context ===\n');

// Search backward from TARGET for a terminator (RET/JP/RETI/RETN) to find function start.
// The byte AFTER a terminator is likely a function entry.
// Also look for 0xFF padding bytes (erased flash).

let funcStart = TARGET;
// Walk backward byte-by-byte, disassembling forward to check if we hit a terminator
// that ends just before a candidate start. Simplified: scan backward for RET (0xC9)
// or JP (0xC3 xx xx xx) or 0xFF padding.

for (let addr = TARGET - 1; addr >= Math.max(0, TARGET - 256); addr--) {
  const b = rom[addr];

  // 0xFF padding = erased flash; function starts after this
  if (b === 0xFF) {
    funcStart = addr + 1;
    break;
  }

  // RET at addr
  if (b === 0xC9) {
    funcStart = addr + 1;
    break;
  }

  // RETI (ED 4D) or RETN (ED 45)
  if (b === 0x4D || b === 0x45) {
    if (addr > 0 && rom[addr - 1] === 0xED) {
      funcStart = addr + 1;
      break;
    }
  }

  // Unconditional JP: C3 xx xx xx — the 4 bytes starting at addr-3
  // Check if there's a JP that ends at addr (JP is 4 bytes, so JP at addr-3 ends at addr)
  // Actually the JP instruction occupies bytes [a, a+1, a+2, a+3]. If the last addr
  // of a JP is addr, then JP started at addr-3.
  // But we can also just check: does a RET or JP exist at addr? For JP we need context.
}

// Refine: try disassembling forward from funcStart to verify
// Search for the function end (unconditional terminator after TARGET)
let funcEnd = TARGET;
{
  let pc = funcStart;
  let lastTerminator = -1;
  while (pc < Math.min(rom.length, funcStart + 512)) {
    const inst = disasmOne(rom, pc);
    if (isTerminator(rom, pc)) {
      if (pc >= TARGET) {
        funcEnd = pc + inst.length;
        break;
      }
      lastTerminator = pc + inst.length;
    }
    pc += inst.length;
  }
  if (funcEnd <= TARGET) funcEnd = Math.min(funcStart + 512, rom.length);
}

console.log(`Function boundaries: ${hex(funcStart)} - ${hex(funcEnd)}`);
console.log(`Target 0x030074 is ${funcStart === TARGET ? 'a function ENTRY POINT' : `at offset +${(TARGET - funcStart).toString()} from function start`}\n`);

// ---------- 2. Disassemble the function ----------

console.log('--- Full disassembly ---');
{
  let pc = funcStart;
  while (pc < funcEnd) {
    const inst = disasmOne(rom, pc);
    const bytes = [];
    for (let i = 0; i < inst.length && pc + i < rom.length; i++) {
      bytes.push(hexByte(rom[pc + i]));
    }
    const marker = pc === TARGET ? ' <<<' : '';
    console.log(`  ${hex(pc)}  ${bytes.join(' ').padEnd(15)} ${inst.mnemonic}${marker}`);
    pc += inst.length;
  }
}

// ---------- 3. Extended disassembly context (wider window) ----------

console.log('\n--- Extended context: 0x030040 - 0x0300C0 ---');
{
  let pc = 0x030040;
  while (pc < 0x0300C0 && pc < rom.length) {
    const inst = disasmOne(rom, pc);
    const bytes = [];
    for (let i = 0; i < inst.length && pc + i < rom.length; i++) {
      bytes.push(hexByte(rom[pc + i]));
    }
    const marker = pc === TARGET ? ' <<<' : '';
    console.log(`  ${hex(pc)}  ${bytes.join(' ').padEnd(15)} ${inst.mnemonic}${marker}`);
    pc += inst.length;
  }
}

// ---------- 4. Find ALL callers in the ROM ----------

console.log('\n--- Scanning entire ROM for CALL/JP to 0x030060-0x030080 ---');

const callers = [];
for (let addr = 0; addr < rom.length - 3; addr++) {
  const b = rom[addr];

  // CALL imm24: CD xx xx xx
  // JP imm24: C3 xx xx xx
  // Conditional CALL: C4,CC,D4,DC,E4,EC,F4,FC
  // Conditional JP: C2,CA,D2,DA,E2,EA,F2,FA

  let isCall = false;
  let isJp = false;
  let instrLen = 4;

  if (b === 0xCD) isCall = true;
  else if (b === 0xC3) isJp = true;
  else if ((b & 0xC7) === 0xC4) isCall = true;  // conditional CALL
  else if ((b & 0xC7) === 0xC2) isJp = true;    // conditional JP
  else continue;

  const target = read24(rom, addr + 1);
  if (target >= SEARCH_LO && target <= SEARCH_HI) {
    const ccNames = ['NZ','Z','NC','C','PO','PE','P','M'];
    let mnemonic;
    if (b === 0xCD) mnemonic = `CALL ${hex(target)}`;
    else if (b === 0xC3) mnemonic = `JP ${hex(target)}`;
    else if ((b & 0xC7) === 0xC4) mnemonic = `CALL ${ccNames[(b>>3)&7]},${hex(target)}`;
    else mnemonic = `JP ${ccNames[(b>>3)&7]},${hex(target)}`;

    callers.push({ addr, mnemonic, target });
  }
}

console.log(`Found ${callers.length} callers:\n`);
for (const c of callers) {
  // Show a few instructions of context around the caller
  console.log(`  ${hex(c.addr)}  ${c.mnemonic}`);

  // Show 3 instructions before and 3 after for context
  let contextStart = Math.max(0, c.addr - 12);
  let pc = contextStart;
  const contextLines = [];
  while (pc < c.addr + 16 && pc < rom.length) {
    const inst = disasmOne(rom, pc);
    const bytes = [];
    for (let i = 0; i < inst.length && pc + i < rom.length; i++) {
      bytes.push(hexByte(rom[pc + i]));
    }
    const marker = pc === c.addr ? ' <<<' : '';
    contextLines.push(`    ${hex(pc)}  ${bytes.join(' ').padEnd(15)} ${inst.mnemonic}${marker}`);
    pc += inst.length;
  }
  for (const line of contextLines) console.log(line);
  console.log();
}

// ---------- 5. Search for indirect references (3-byte LE address patterns) ----------

console.log('--- Searching for indirect references (little-endian address patterns) ---');

const indirectRefs = [];
// Search for addresses in range 0x030060-0x030080 as 3-byte LE
for (let targetAddr = SEARCH_LO; targetAddr <= SEARCH_HI; targetAddr++) {
  const lo = targetAddr & 0xFF;
  const mid = (targetAddr >> 8) & 0xFF;
  const hi = (targetAddr >> 16) & 0xFF;

  for (let addr = 0; addr < rom.length - 2; addr++) {
    if (rom[addr] === lo && rom[addr + 1] === mid && rom[addr + 2] === hi) {
      // Skip if this is part of a CALL/JP we already found
      const isCallJp = callers.some(c => addr >= c.addr && addr < c.addr + 4);
      // Also skip if this IS the instruction at the target itself
      if (addr >= SEARCH_LO - 4 && addr <= SEARCH_HI + 4) continue;
      if (!isCallJp) {
        indirectRefs.push({ addr, targetAddr });
      }
    }
  }
}

console.log(`Found ${indirectRefs.length} indirect references:\n`);
for (const ref of indirectRefs) {
  console.log(`  ${hex(ref.addr)} -> references ${hex(ref.targetAddr)}`);
  // Show context
  let pc = Math.max(0, ref.addr - 8);
  while (pc < ref.addr + 12 && pc < rom.length) {
    const inst = disasmOne(rom, pc);
    const bytes = [];
    for (let i = 0; i < inst.length && pc + i < rom.length; i++) {
      bytes.push(hexByte(rom[pc + i]));
    }
    const marker = (pc <= ref.addr && pc + inst.length > ref.addr) ? ' <<<' : '';
    console.log(`    ${hex(pc)}  ${bytes.join(' ').padEnd(15)} ${inst.mnemonic}${marker}`);
    pc += inst.length;
  }
  console.log();
}

// ---------- 6. Summary ----------

console.log('=== SUMMARY ===');
console.log(`Function containing 0x030074: ${hex(funcStart)} - ${hex(funcEnd)}`);
console.log(`0x030074 is ${funcStart === TARGET ? 'a function ENTRY POINT' : `mid-function (offset +${TARGET - funcStart} from ${hex(funcStart)})`}`);
console.log(`Total CALL/JP callers found: ${callers.length}`);
console.log(`Total indirect references found: ${indirectRefs.length}`);

// Group callers by target
const byTarget = {};
for (const c of callers) {
  const key = hex(c.target);
  if (!byTarget[key]) byTarget[key] = [];
  byTarget[key].push(c);
}
console.log('\nCallers grouped by target:');
for (const [target, list] of Object.entries(byTarget)) {
  console.log(`  ${target}: ${list.length} callers from [${list.map(c => hex(c.addr)).join(', ')}]`);
}

console.log('\nDone.');
