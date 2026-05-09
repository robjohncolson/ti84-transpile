#!/usr/bin/env node
// Phase 276: Investigate LDIR-copy sites after CALL 0x0846EA
//
// Sites 0x0230E7 and 0x0230FD do EX DE,HL then LDIR BC=9 after calling
// the table lookup function at 0x0846EA. Related EX DE,HL sites exist at
// 0x02859C and 0x06F502. This probe statically disassembles each region
// and dynamically traces the 0x0230E7 site to determine where the 9-byte
// entries get copied and what happens afterward.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return '0x' + (Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function hexByte(value) {
  return ((value ?? 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function read24LE(buf, off) {
  return (buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16)) >>> 0;
}

function read16LE(buf, off) {
  return (buf[off] | (buf[off + 1] << 8)) >>> 0;
}

function sign8(v) {
  return (v & 0x80) ? v - 0x100 : v;
}

function write24Mem(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function read24Mem(mem, addr) {
  const base = addr & MEM_MASK;
  return (mem[base] | (mem[(base + 1) & MEM_MASK] << 8) | (mem[(base + 2) & MEM_MASK] << 16)) >>> 0;
}

// ---------------------------------------------------------------------------
// Static eZ80 ADL-mode disassembler (minimal, covers opcodes in the regions)
// ---------------------------------------------------------------------------

function disasmOne(rom, pc) {
  const b0 = rom[pc];
  const b1 = rom[pc + 1];
  const b2 = rom[pc + 2];
  const b3 = rom[pc + 3];

  // DD prefix (IX instructions)
  if (b0 === 0xDD) {
    if (b1 === 0xE5) return { len: 2, text: 'PUSH IX' };
    if (b1 === 0xE1) return { len: 2, text: 'POP IX' };
    if (b1 === 0x21) {
      const imm = read24LE(rom, pc + 2);
      return { len: 5, text: `LD IX, ${hex(imm)}` };
    }
    if (b1 === 0x39) return { len: 2, text: 'ADD IX, SP' };
    if (b1 === 0xF9) return { len: 2, text: 'LD SP, IX' };
    if (b1 === 0x75) {
      const d = sign8(b2);
      return { len: 3, text: `LD (IX${d >= 0 ? '+' : ''}${d}), L` };
    }
    if (b1 === 0x74) {
      const d = sign8(b2);
      return { len: 3, text: `LD (IX${d >= 0 ? '+' : ''}${d}), H` };
    }
    if (b1 === 0x77) {
      const d = sign8(b2);
      return { len: 3, text: `LD (IX${d >= 0 ? '+' : ''}${d}), A` };
    }
    if (b1 === 0x27) {
      const d = sign8(b2);
      return { len: 3, text: `LD A, (IX${d >= 0 ? '+' : ''}${d})` };
    }
    // Generic DD fallback
    return { len: 2, text: `DD ${hexByte(b1)} (IX prefix)` };
  }

  // FD prefix (IY instructions)
  if (b0 === 0xFD) {
    if (b1 === 0xCB) {
      // FD CB dd op — bit manipulation on (IY+d)
      const d = sign8(b2);
      const op = b3;
      const bit = (op >> 3) & 7;
      if ((op & 0xC0) === 0x40) {
        return { len: 4, text: `BIT ${bit}, (IY${d >= 0 ? '+' : ''}${d})` };
      }
      if ((op & 0xC0) === 0xC0) {
        return { len: 4, text: `SET ${bit}, (IY${d >= 0 ? '+' : ''}${d})` };
      }
      if ((op & 0xC0) === 0x80) {
        return { len: 4, text: `RES ${bit}, (IY${d >= 0 ? '+' : ''}${d})` };
      }
      return { len: 4, text: `FD CB ${hexByte(b2)} ${hexByte(op)}` };
    }
    return { len: 2, text: `FD ${hexByte(b1)} (IY prefix)` };
  }

  // ED prefix
  if (b0 === 0xED) {
    if (b1 === 0xB0) return { len: 2, text: 'LDIR' };
    if (b1 === 0xB8) return { len: 2, text: 'LDDR' };
    if (b1 === 0x12) {
      const d = sign8(b2);
      return { len: 3, text: `LEA DE, IX${d >= 0 ? '+' : ''}${d}` };
    }
    if (b1 === 0x22) {
      const d = sign8(b2);
      return { len: 3, text: `LEA HL, IX${d >= 0 ? '+' : ''}${d}` };
    }
    if (b1 === 0x32) {
      const d = sign8(b2);
      return { len: 3, text: `LEA IX, IX${d >= 0 ? '+' : ''}${d}` };
    }
    if (b1 === 0x6B) {
      const addr = read24LE(rom, pc + 2);
      return { len: 5, text: `LD HL, (${hex(addr)})` };
    }
    if (b1 === 0x5B) {
      const addr = read24LE(rom, pc + 2);
      return { len: 5, text: `LD DE, (${hex(addr)})` };
    }
    if (b1 === 0x4B) {
      const addr = read24LE(rom, pc + 2);
      return { len: 5, text: `LD BC, (${hex(addr)})` };
    }
    if (b1 === 0x43) {
      const addr = read24LE(rom, pc + 2);
      return { len: 5, text: `LD (${hex(addr)}), BC` };
    }
    if (b1 === 0x53) {
      const addr = read24LE(rom, pc + 2);
      return { len: 5, text: `LD (${hex(addr)}), DE` };
    }
    if (b1 === 0x63) {
      const addr = read24LE(rom, pc + 2);
      return { len: 5, text: `LD (${hex(addr)}), HL` };
    }
    if (b1 === 0x52) return { len: 2, text: 'SBC HL, DE' };
    if (b1 === 0x78) {
      const addr = read24LE(rom, pc + 2);
      return { len: 5, text: `IN A, (${hex(addr)})` };
    }
    return { len: 2, text: `ED ${hexByte(b1)}` };
  }

  // CB prefix
  if (b0 === 0xCB) {
    const op = b1;
    const bit = (op >> 3) & 7;
    const regNames = ['B','C','D','E','H','L','(HL)','A'];
    const r = regNames[op & 7];
    if ((op & 0xC0) === 0x40) return { len: 2, text: `BIT ${bit}, ${r}` };
    if ((op & 0xC0) === 0xC0) return { len: 2, text: `SET ${bit}, ${r}` };
    if ((op & 0xC0) === 0x80) return { len: 2, text: `RES ${bit}, ${r}` };
    return { len: 2, text: `CB ${hexByte(op)}` };
  }

  // Single-byte instructions
  if (b0 === 0x00) return { len: 1, text: 'NOP' };
  if (b0 === 0xC9) return { len: 1, text: 'RET' };
  if (b0 === 0xC0) return { len: 1, text: 'RET NZ' };
  if (b0 === 0xC8) return { len: 1, text: 'RET Z' };
  if (b0 === 0xD0) return { len: 1, text: 'RET NC' };
  if (b0 === 0xD8) return { len: 1, text: 'RET C' };
  if (b0 === 0xEB) return { len: 1, text: 'EX DE, HL' };
  if (b0 === 0xE9) return { len: 1, text: 'JP (HL)' };
  if (b0 === 0x76) return { len: 1, text: 'HALT' };
  if (b0 === 0xF3) return { len: 1, text: 'DI' };
  if (b0 === 0xFB) return { len: 1, text: 'EI' };
  if (b0 === 0xAF) return { len: 1, text: 'XOR A' };
  if (b0 === 0xA7) return { len: 1, text: 'AND A' };
  if (b0 === 0xB7) return { len: 1, text: 'OR A' };
  if (b0 === 0xBF) return { len: 1, text: 'CP A' };
  if (b0 === 0x37) return { len: 1, text: 'SCF' };
  if (b0 === 0x3F) return { len: 1, text: 'CCF' };

  // PUSH/POP
  if (b0 === 0xC5) return { len: 1, text: 'PUSH BC' };
  if (b0 === 0xD5) return { len: 1, text: 'PUSH DE' };
  if (b0 === 0xE5) return { len: 1, text: 'PUSH HL' };
  if (b0 === 0xF5) return { len: 1, text: 'PUSH AF' };
  if (b0 === 0xC1) return { len: 1, text: 'POP BC' };
  if (b0 === 0xD1) return { len: 1, text: 'POP DE' };
  if (b0 === 0xE1) return { len: 1, text: 'POP HL' };
  if (b0 === 0xF1) return { len: 1, text: 'POP AF' };

  // 24-bit LD reg, imm24
  if (b0 === 0x01) { const v = read24LE(rom, pc + 1); return { len: 4, text: `LD BC, ${hex(v)}` }; }
  if (b0 === 0x11) { const v = read24LE(rom, pc + 1); return { len: 4, text: `LD DE, ${hex(v)}` }; }
  if (b0 === 0x21) { const v = read24LE(rom, pc + 1); return { len: 4, text: `LD HL, ${hex(v)}` }; }
  if (b0 === 0x31) { const v = read24LE(rom, pc + 1); return { len: 4, text: `LD SP, ${hex(v)}` }; }

  // LD A, imm8
  if (b0 === 0x3E) return { len: 2, text: `LD A, ${hex(b1, 2)}` };

  // LD (nn), HL / LD HL, (nn) — 24-bit address in ADL
  if (b0 === 0x22) { const v = read24LE(rom, pc + 1); return { len: 4, text: `LD (${hex(v)}), HL` }; }
  if (b0 === 0x2A) { const v = read24LE(rom, pc + 1); return { len: 4, text: `LD HL, (${hex(v)})` }; }
  if (b0 === 0x32) { const v = read24LE(rom, pc + 1); return { len: 4, text: `LD (${hex(v)}), A` }; }
  if (b0 === 0x3A) { const v = read24LE(rom, pc + 1); return { len: 4, text: `LD A, (${hex(v)})` }; }

  // CALL nn
  if (b0 === 0xCD) { const v = read24LE(rom, pc + 1); return { len: 4, text: `CALL ${hex(v)}` }; }

  // CALL cc, nn
  if (b0 === 0xC4) { const v = read24LE(rom, pc + 1); return { len: 4, text: `CALL NZ, ${hex(v)}` }; }
  if (b0 === 0xCC) { const v = read24LE(rom, pc + 1); return { len: 4, text: `CALL Z, ${hex(v)}` }; }
  if (b0 === 0xD4) { const v = read24LE(rom, pc + 1); return { len: 4, text: `CALL NC, ${hex(v)}` }; }
  if (b0 === 0xDC) { const v = read24LE(rom, pc + 1); return { len: 4, text: `CALL C, ${hex(v)}` }; }

  // JP nn
  if (b0 === 0xC3) { const v = read24LE(rom, pc + 1); return { len: 4, text: `JP ${hex(v)}` }; }
  if (b0 === 0xC2) { const v = read24LE(rom, pc + 1); return { len: 4, text: `JP NZ, ${hex(v)}` }; }
  if (b0 === 0xCA) { const v = read24LE(rom, pc + 1); return { len: 4, text: `JP Z, ${hex(v)}` }; }
  if (b0 === 0xD2) { const v = read24LE(rom, pc + 1); return { len: 4, text: `JP NC, ${hex(v)}` }; }
  if (b0 === 0xDA) { const v = read24LE(rom, pc + 1); return { len: 4, text: `JP C, ${hex(v)}` }; }

  // JR
  if (b0 === 0x18) { const d = sign8(b1); return { len: 2, text: `JR ${d >= 0 ? '+' : ''}${d} (-> ${hex(pc + 2 + d)})` }; }
  if (b0 === 0x20) { const d = sign8(b1); return { len: 2, text: `JR NZ, ${d >= 0 ? '+' : ''}${d} (-> ${hex(pc + 2 + d)})` }; }
  if (b0 === 0x28) { const d = sign8(b1); return { len: 2, text: `JR Z, ${d >= 0 ? '+' : ''}${d} (-> ${hex(pc + 2 + d)})` }; }
  if (b0 === 0x30) { const d = sign8(b1); return { len: 2, text: `JR NC, ${d >= 0 ? '+' : ''}${d} (-> ${hex(pc + 2 + d)})` }; }
  if (b0 === 0x38) { const d = sign8(b1); return { len: 2, text: `JR C, ${d >= 0 ? '+' : ''}${d} (-> ${hex(pc + 2 + d)})` }; }

  // DJNZ
  if (b0 === 0x10) { const d = sign8(b1); return { len: 2, text: `DJNZ ${d >= 0 ? '+' : ''}${d} (-> ${hex(pc + 2 + d)})` }; }

  // 8-bit LD r, r' and ops
  if (b0 === 0x77) return { len: 1, text: 'LD (HL), A' };
  if (b0 === 0x7E) return { len: 1, text: 'LD A, (HL)' };
  if (b0 === 0x23) return { len: 1, text: 'INC HL' };
  if (b0 === 0x2B) return { len: 1, text: 'DEC HL' };
  if (b0 === 0x13) return { len: 1, text: 'INC DE' };
  if (b0 === 0x1B) return { len: 1, text: 'DEC DE' };
  if (b0 === 0x03) return { len: 1, text: 'INC BC' };
  if (b0 === 0x0B) return { len: 1, text: 'DEC BC' };
  if (b0 === 0xB6) return { len: 1, text: 'OR (HL)' };
  if (b0 === 0xBE) return { len: 1, text: 'CP (HL)' };
  if (b0 === 0x06) return { len: 2, text: `LD B, ${hex(b1, 2)}` };
  if (b0 === 0x0E) return { len: 2, text: `LD C, ${hex(b1, 2)}` };
  if (b0 === 0x16) return { len: 2, text: `LD D, ${hex(b1, 2)}` };
  if (b0 === 0x1E) return { len: 2, text: `LD E, ${hex(b1, 2)}` };
  if (b0 === 0x26) return { len: 2, text: `LD H, ${hex(b1, 2)}` };
  if (b0 === 0x2E) return { len: 2, text: `LD L, ${hex(b1, 2)}` };
  if (b0 === 0x36) return { len: 2, text: `LD (HL), ${hex(b1, 2)}` };
  if (b0 === 0xFE) return { len: 2, text: `CP ${hex(b1, 2)}` };
  if (b0 === 0xD6) return { len: 2, text: `SUB ${hex(b1, 2)}` };
  if (b0 === 0xE6) return { len: 2, text: `AND ${hex(b1, 2)}` };
  if (b0 === 0xF6) return { len: 2, text: `OR ${hex(b1, 2)}` };
  if (b0 === 0xC6) return { len: 2, text: `ADD A, ${hex(b1, 2)}` };

  // 8-bit register-register loads/ops
  const regNames8 = ['B','C','D','E','H','L','(HL)','A'];
  if (b0 >= 0x40 && b0 <= 0x7F && b0 !== 0x76) {
    const dst = regNames8[(b0 >> 3) & 7];
    const src = regNames8[b0 & 7];
    return { len: 1, text: `LD ${dst}, ${src}` };
  }
  // ADD/ADC/SUB/SBC/AND/XOR/OR/CP r
  if (b0 >= 0x80 && b0 <= 0xBF) {
    const ops = ['ADD A,','ADC A,','SUB','SBC A,','AND','XOR','OR','CP'];
    const op = ops[(b0 >> 3) & 7];
    const src = regNames8[b0 & 7];
    return { len: 1, text: `${op} ${src}` };
  }

  // RST
  if ((b0 & 0xC7) === 0xC7) {
    return { len: 1, text: `RST ${hex(b0 & 0x38, 2)}` };
  }

  // INC/DEC r8
  const incDecR = (b0 >> 3) & 7;
  if ((b0 & 0xC7) === 0x04) return { len: 1, text: `INC ${regNames8[incDecR]}` };
  if ((b0 & 0xC7) === 0x05) return { len: 1, text: `DEC ${regNames8[incDecR]}` };

  // Fallback
  return { len: 1, text: `DB ${hexByte(b0)}` };
}

function disasmRange(rom, startAddr, endAddr) {
  const results = [];
  let pc = startAddr;
  while (pc < endAddr) {
    const rawBytes = [];
    const instr = disasmOne(rom, pc);
    for (let i = 0; i < instr.len; i++) rawBytes.push(hexByte(rom[pc + i]));
    results.push({
      addr: pc,
      len: instr.len,
      bytes: rawBytes.join(' '),
      text: instr.text,
    });
    pc += instr.len;
  }
  return results;
}

function printDisasm(title, instructions) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(title);
  console.log('='.repeat(70));
  for (const inst of instructions) {
    const addrStr = hex(inst.addr);
    const bytePad = inst.bytes.padEnd(20);
    console.log(`  ${addrStr}  ${bytePad} ${inst.text}`);
  }
}

// ---------------------------------------------------------------------------
// Find function boundaries (nearest RET before/after an address)
// ---------------------------------------------------------------------------

function findPrevRet(rom, before) {
  for (let a = before - 1; a >= Math.max(0, before - 256); a--) {
    if (rom[a] === 0xC9) return a;
  }
  return null;
}

function findNextRet(rom, after) {
  for (let a = after; a < Math.min(rom.length, after + 512); a++) {
    if (rom[a] === 0xC9) return a;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Part 1: Static disassembly of the primary site (0x0230C0-0x023160)
// ---------------------------------------------------------------------------

const rom = fs.readFileSync(ROM_PATH);

console.log('Phase 276: LDIR-copy sites after CALL 0x0846EA');
console.log('============================================\n');

// Find function containing 0x0230E7
const prevRet = findPrevRet(rom, 0x0230E7);
const nextRet = findNextRet(rom, 0x0230E7);
console.log(`Function boundary analysis for site 0x0230E7:`);
console.log(`  Previous RET: ${prevRet !== null ? hex(prevRet) : 'not found'} -> function starts at ${prevRet !== null ? hex(prevRet + 1) : '?'}`);
console.log(`  Next RET: ${nextRet !== null ? hex(nextRet) : 'not found'}`);

// Also check the broader function (there is a RET at 0x0230DE within the data)
// The real function likely starts at 0x023093
const prevRet2 = findPrevRet(rom, 0x023093);
console.log(`  Previous RET before 0x023093: ${prevRet2 !== null ? hex(prevRet2) : 'not found'}`);
console.log(`  -> Parent function likely: ${hex(0x023093)} - ${hex(0x02315D)}`);

// Disassemble the full function 0x023093 - 0x02315E
const disasm1 = disasmRange(rom, 0x023093, 0x023160);
printDisasm('SITE 1: Full function at 0x023093 (contains 0x0230E7 and 0x0230FD)', disasm1);

// Annotate the LDIR-copy sites
console.log('\n--- LDIR-copy pattern analysis (Site 0x0230E7) ---');
console.log('Pattern: CALL 0x0846EA -> EX DE,HL -> LEA DE,IX+d -> LD BC,9 -> LDIR');
console.log('  0x0846EA returns with HL pointing to found entry in D3Fxxx table');
console.log('  EX DE,HL moves entry pointer to DE (LDIR source)');
console.log('  LEA DE,IX+d computes destination = IX-relative stack frame slot');
console.log('  Wait: after EX DE,HL, HL has old DE, DE has entry ptr');
console.log('  Then LEA DE,IX+d OVERWRITES DE with the IX-offset destination');
console.log('  So: source=HL (entry ptr after swap), dest=DE (stack frame)');
console.log('  Actually: EX DE,HL swaps so entry goes to DE... then LEA DE,IX+d');
console.log('  re-sets DE. This means the copy source must be HL after the LEA.');
console.log('  LDIR copies BC bytes from (HL) to (DE). So:');
console.log('  - After EX DE,HL: DE=old_HL=entry_ptr, HL=old_DE');
console.log('  - LEA DE, IX+d: DE=IX+d (stack frame slot)');
console.log('  Wait, that loses the entry_ptr. Let me re-read the bytes...');

// Re-examine the exact byte sequence
console.log('\n--- Byte-level re-examination ---');
const site1Start = 0x0230E4; // CALL 0x0846EA is at 0x0230E4
const site1Bytes = [];
for (let i = 0; i < 20; i++) site1Bytes.push(hexByte(rom[site1Start + i]));
console.log(`  ${hex(site1Start)}: ${site1Bytes.join(' ')}`);
console.log('  CD EA 46 08 = CALL 0x0846EA');
console.log('  EB           = EX DE, HL');
console.log('  ED 12 D3     = LEA DE, IX-45');
console.log('  01 09 00 00  = LD BC, 0x000009');
console.log('  ED B0        = LDIR');
console.log('');
console.log('  So AFTER the call: HL = entry pointer from 0x0846EA');
console.log('  EX DE,HL -> DE gets entry pointer, HL gets old DE');
console.log('  LEA DE, IX-45 -> DE gets IX-45 (a stack frame location)');
console.log('  *** The entry pointer is now LOST from registers ***');
console.log('  Unless... the EX DE,HL put it in HL actually:');
console.log('  EX DE,HL swaps. If HL had entry_ptr, after swap: DE=entry_ptr, HL=old_DE');
console.log('  Then LEA DE, IX+d overwrites DE. So entry_ptr is gone.');
console.log('  But wait — LDIR copies from (HL) to (DE). So:');
console.log('  Source = HL (which was old_DE before call, or whatever 0x0846EA left in DE)');
console.log('  This doesnt make sense. Let me check what 0x0846EA returns in HL vs DE.');

// Check what the bytes before CALL look like — specifically the LD HL before CALL
console.log('\n--- Context before CALL at each site ---');
const preCallDisasm = disasmRange(rom, 0x0230DF, 0x023110);
for (const inst of preCallDisasm) {
  const mark = [0x0230E4, 0x0230E8, 0x0230E9, 0x0230EC, 0x0230F3,
                0x0230FA, 0x0230FE, 0x0230FF, 0x023102, 0x023109].includes(inst.addr) ? ' <--' : '';
  console.log(`  ${hex(inst.addr)}  ${inst.bytes.padEnd(20)} ${inst.text}${mark}`);
}

// ---------------------------------------------------------------------------
// Part 2: Static disassembly of related sites
// ---------------------------------------------------------------------------

// Site at 0x028580-0x0285C0
const disasm2 = disasmRange(rom, 0x028580, 0x0285C0);
printDisasm('SITE 2: 0x028580 - 0x0285C0 (EX DE,HL after 0x0846EA at 0x02859C)', disasm2);

// Annotate site 2
console.log('\n--- Site 2 analysis ---');
console.log('At 0x02859C: CALL 0x0846EA expected... let me verify:');
const site2Bytes = [];
for (let i = 0; i < 8; i++) site2Bytes.push(hexByte(rom[0x02859A + i]));
console.log(`  ${hex(0x02859A)}: ${site2Bytes.join(' ')}`);

// Site at 0x06F4E0-0x06F520
const disasm3 = disasmRange(rom, 0x06F4E0, 0x06F520);
printDisasm('SITE 3: 0x06F4E0 - 0x06F520 (EX DE,HL after 0x0846EA at 0x06F502)', disasm3);

// Annotate site 3
console.log('\n--- Site 3 analysis ---');
console.log('At 0x06F502: EX DE,HL expected... context:');
const site3Bytes = [];
for (let i = 0; i < 12; i++) site3Bytes.push(hexByte(rom[0x06F4FE + i]));
console.log(`  ${hex(0x06F4FE)}: ${site3Bytes.join(' ')}`);

// ---------------------------------------------------------------------------
// Decode the actual sequence more carefully at Site 1
// ---------------------------------------------------------------------------

console.log('\n' + '='.repeat(70));
console.log('DETAILED SEQUENCE DECODE — 0x0230B0 through 0x023160');
console.log('='.repeat(70));
const detailedDisasm = disasmRange(rom, 0x0230B0, 0x023160);
for (const inst of detailedDisasm) {
  let annotation = '';
  if (inst.text.includes('CALL 0x0846EA')) annotation = '  << table lookup (FindSym)';
  if (inst.text === 'EX DE, HL') annotation = '  << swap DE <-> HL';
  if (inst.text === 'LDIR') annotation = '  << copy 9 bytes from (HL) to (DE)';
  if (inst.text.startsWith('LEA DE')) annotation = '  << destination = stack frame slot';
  if (inst.text.startsWith('LD BC')) annotation = '  << byte count for LDIR';
  if (inst.text.startsWith('LEA HL')) annotation = '  << source for next LDIR';
  if (inst.text === 'RET') annotation = '  << function return';
  console.log(`  ${hex(inst.addr)}  ${inst.bytes.padEnd(20)} ${inst.text}${annotation}`);
}

// ---------------------------------------------------------------------------
// Identify the IX-relative offsets used as LDIR destinations
// ---------------------------------------------------------------------------

console.log('\n' + '='.repeat(70));
console.log('IX-RELATIVE SLOT ANALYSIS');
console.log('='.repeat(70));

// Extract all LEA DE, IX+d instructions to find copy destinations
const leaDESlots = [];
const leaHLSlots = [];
for (const inst of detailedDisasm) {
  const leaDE = inst.text.match(/LEA DE, IX([+-]\d+)/);
  if (leaDE) leaDESlots.push({ addr: inst.addr, offset: parseInt(leaDE[1]) });
  const leaHL = inst.text.match(/LEA HL, IX([+-]\d+)/);
  if (leaHL) leaHLSlots.push({ addr: inst.addr, offset: parseInt(leaHL[1]) });
}

console.log('\nLEA DE, IX+d (LDIR destinations = stack frame slots):');
for (const s of leaDESlots) {
  console.log(`  ${hex(s.addr)}: IX${s.offset >= 0 ? '+' : ''}${s.offset} (${hex(s.offset & 0xFF, 2)})`);
}
console.log('\nLEA HL, IX+d (LDIR sources from stack frame):');
for (const s of leaHLSlots) {
  console.log(`  ${hex(s.addr)}: IX${s.offset >= 0 ? '+' : ''}${s.offset} (${hex(s.offset & 0xFF, 2)})`);
}

// ---------------------------------------------------------------------------
// Part 3: Dynamic trace of 0x0230E7/0x0230E8 site
// ---------------------------------------------------------------------------

console.log('\n' + '='.repeat(70));
console.log('DYNAMIC TRACE — 0x0230E7 LDIR-copy site');
console.log('='.repeat(70));

// Prepare transpiled module
function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempPath: null };
  }
  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz');
  }
  const tempPath = path.join(os.tmpdir(), `ti84-phase276-${process.pid}.mjs`);
  fs.writeFileSync(tempPath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempPath, tempPath };
}

function cleanupModule(assets) {
  if (assets?.tempPath) {
    try { fs.unlinkSync(assets.tempPath); } catch {}
  }
}

let assets = null;
try {
  assets = ensureTranspiledModule();
  console.log(`\nLoading transpiled module from: ${assets.modulePath}`);

  const romModule = await import(pathToFileURL(assets.modulePath).href);
  const rawBlocks = romModule.PRELIFTED_BLOCKS ?? romModule.default?.PRELIFTED_BLOCKS ?? romModule.default ?? romModule;
  let blocks;
  if (Array.isArray(rawBlocks)) {
    blocks = Object.fromEntries(rawBlocks.filter(b => b?.id).map(b => [b.id, b]));
  } else {
    blocks = rawBlocks ?? {};
  }

  const blockCount = Object.keys(blocks).length;
  console.log(`Loaded ${blockCount} blocks.`);

  if (blockCount === 0) {
    console.log('ERROR: No blocks loaded. Skipping dynamic trace.');
  } else {
    // Set up CPU
    const memory = new Uint8Array(MEM_SIZE);
    for (let i = 0; i < rom.length && i < 0x400000; i++) memory[i] = rom[i];

    const pbus = createPeripheralBus({ timerInterrupt: false });
    const executor = createExecutor(blocks, memory, { peripherals: pbus });
    const cpu = executor.cpu;

    // Boot for initial state
    console.log('\nBooting CPU for 50,000 steps...');
    const bootResult = executor.runFrom(0x000000, 'adl', {
      maxSteps: 50000,
      maxLoopIterations: 64,
    });
    console.log(`Boot: ${bootResult.steps} steps, termination: ${bootResult.termination}`);
    console.log(`Post-boot PC: ${hex(bootResult.pc)}, SP: ${hex(cpu.sp)}, IX: ${hex(cpu.ix)}, IY: ${hex(cpu.iy)}`);

    // Seed the D3Fxxx table — place one 9-byte entry
    const D0259A = 0xD0259A;
    const TABLE_ENTRY_ADDR = 0xD3FFF6;
    const ENTRY_BYTES = [0x41, 0x82, 0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];

    // D0259A is the 24-bit pointer to start of table entries
    write24Mem(memory, D0259A, TABLE_ENTRY_ADDR);

    // Write the 9-byte entry
    for (let i = 0; i < 9; i++) {
      memory[(TABLE_ENTRY_ADDR + i) & MEM_MASK] = ENTRY_BYTES[i];
    }

    console.log(`\nSeeded table: D0259A -> ${hex(TABLE_ENTRY_ADDR)}`);
    console.log(`Entry at ${hex(TABLE_ENTRY_ADDR)}: ${ENTRY_BYTES.map(b => hexByte(b)).join(' ')}`);

    // Find the EX DE,HL instruction address
    // From disassembly: 0x0230E8 is EX DE,HL (byte EB)
    // Let's verify
    const exAddr = 0x0230E8;
    console.log(`\nVerifying EX DE,HL at ${hex(exAddr)}: byte = ${hexByte(rom[exAddr])}`);

    // Set up CPU state for the experiment
    // After CALL 0x0846EA returns, HL should point to the found entry
    // We simulate this by setting HL to the entry address and PC to the EX DE,HL

    // Save IX — it's the stack frame pointer for this function
    const savedIX = cpu.ix;
    const savedSP = cpu.sp;

    // Set up a clean stack frame
    // Function at 0x023093 does: PUSH IX; LD IX,0; ADD IX,SP
    // So IX = SP at function entry (after push IX)
    // The LEA DE, IX-45 means destination is at IX-45 = SP_entry - 45
    const frameBase = 0xD1A800;
    cpu.sp = frameBase - 0x40; // give room for the frame
    cpu._ix = frameBase;

    // Zero the stack frame area so we can detect where LDIR writes
    for (let a = frameBase - 256; a <= frameBase + 16; a++) {
      memory[a & MEM_MASK] = 0x00;
    }

    // Set HL = entry pointer (as if 0x0846EA just returned with HL=entry)
    cpu._hl = TABLE_ENTRY_ADDR;
    // Set DE to something recognizable so we can see the swap
    cpu._de = 0xDEAD00;

    // Set up return address on stack
    const SENTINEL_PC = 0x7FFFFE;
    cpu.sp -= 3;
    write24Mem(memory, cpu.sp, SENTINEL_PC);

    console.log(`\nPre-trace state:`);
    console.log(`  PC will be: ${hex(exAddr)}`);
    console.log(`  HL: ${hex(cpu.hl)} (entry pointer)`);
    console.log(`  DE: ${hex(cpu.de)} (will be swapped)`);
    console.log(`  IX: ${hex(cpu.ix)} (frame base)`);
    console.log(`  SP: ${hex(cpu.sp)}`);
    console.log(`  BC: ${hex(cpu.bc)}`);

    // Track memory writes during execution
    const memWrites = [];
    const origWrite8 = cpu.write8.bind(cpu);
    cpu.write8 = (addr, value) => {
      const oldVal = memory[addr & MEM_MASK];
      origWrite8(addr, value);
      if (addr >= 0xD00000 && addr < 0xE00000 && oldVal !== (value & 0xFF)) {
        memWrites.push({ addr: addr & MEM_MASK, oldVal, newVal: value & 0xFF });
      }
    };

    // Run from the EX DE,HL
    console.log(`\nRunning from ${hex(exAddr)} for up to 200 steps...`);
    const traceLog = [];
    const traceResult = executor.runFrom(exAddr, 'adl', {
      maxSteps: 200,
      maxLoopIterations: 64,
      onBlock: (pc, mode, meta, step) => {
        traceLog.push({
          step,
          pc,
          mode,
          hl: cpu.hl,
          de: cpu.de,
          bc: cpu.bc,
          sp: cpu.sp,
          a: cpu.a,
          f: cpu.f,
        });
      },
      onMissingBlock: (pc, mode, step) => {
        traceLog.push({ step, pc, mode, missing: true });
      },
    });

    console.log(`\nTrace result: ${traceResult.steps} steps, termination: ${traceResult.termination}`);
    console.log(`Final PC: ${hex(traceResult.pc)}`);
    console.log(`Final registers: HL=${hex(cpu.hl)} DE=${hex(cpu.de)} BC=${hex(cpu.bc)} SP=${hex(cpu.sp)} A=${hexByte(cpu.a)} F=${hexByte(cpu.f)}`);

    // Show block trace
    console.log(`\nBlock-level trace (${traceLog.length} blocks visited):`);
    for (const entry of traceLog.slice(0, 40)) {
      const missing = entry.missing ? ' [MISSING]' : '';
      console.log(`  step=${String(entry.step).padStart(4)} PC=${hex(entry.pc)} mode=${entry.mode} HL=${hex(entry.hl)} DE=${hex(entry.de)} BC=${hex(entry.bc)}${missing}`);
    }
    if (traceLog.length > 40) {
      console.log(`  ... (${traceLog.length - 40} more entries)`);
    }

    // Show memory writes
    console.log(`\nMemory writes detected: ${memWrites.length}`);
    if (memWrites.length > 0) {
      const grouped = new Map();
      for (const w of memWrites) {
        const key = w.addr;
        if (!grouped.has(key)) grouped.set(key, []);
        grouped.get(key).push(w);
      }
      console.log(`Unique addresses written: ${grouped.size}`);
      const sortedAddrs = [...grouped.keys()].sort((a, b) => a - b);
      for (const addr of sortedAddrs.slice(0, 50)) {
        const writes = grouped.get(addr);
        const lastWrite = writes[writes.length - 1];
        console.log(`  ${hex(addr)}: ${hexByte(lastWrite.oldVal)} -> ${hexByte(lastWrite.newVal)} (${writes.length} write(s))`);
      }
      if (sortedAddrs.length > 50) {
        console.log(`  ... (${sortedAddrs.length - 50} more addresses)`);
      }

      // Check if any of the IX-relative slots got data
      console.log('\nChecking IX-relative destination slots:');
      for (const slot of leaDESlots) {
        const slotAddr = (cpu.ix + slot.offset) & 0xFFFFFF;
        // Actually IX was set to frameBase, but may have been changed. Use frameBase.
        const slotAddrOrig = (frameBase + slot.offset) & 0xFFFFFF;
        const data = [];
        for (let i = 0; i < 9; i++) data.push(hexByte(memory[(slotAddrOrig + i) & MEM_MASK]));
        const nonZero = data.some(d => d !== '00');
        if (nonZero) {
          console.log(`  IX${slot.offset >= 0 ? '+' : ''}${slot.offset} (${hex(slotAddrOrig)}): ${data.join(' ')} << DATA WRITTEN`);
        } else {
          console.log(`  IX${slot.offset >= 0 ? '+' : ''}${slot.offset} (${hex(slotAddrOrig)}): ${data.join(' ')}`);
        }
      }
    }

    // Check what's at D005F8 area (the LD HL,0x000058 stores to D005F9)
    console.log('\nKey RAM state:');
    console.log(`  D005F8-D005FF: ${Array.from({length: 8}, (_, i) => hexByte(memory[0xD005F8 + i])).join(' ')}`);
    console.log(`  D0259A-D025A5: ${Array.from({length: 6}, (_, i) => hexByte(memory[0xD0259A + i])).join(' ')}`);
  }
} catch (err) {
  console.error('Dynamic trace error:', err.message);
  console.error(err.stack);
} finally {
  cleanupModule(assets);
}

// ---------------------------------------------------------------------------
// Part 4: Summary/Report
// ---------------------------------------------------------------------------

console.log('\n' + '='.repeat(70));
console.log('SUMMARY');
console.log('='.repeat(70));

console.log(`
Pattern at 0x023093-0x02315D:
  This function performs MULTIPLE table lookups (CALL 0x0846EA) in sequence,
  each with a different key loaded into HL before the call. After each lookup:
    1. EX DE,HL — swaps entry pointer into DE (but see LEA below)
    2. LEA DE, IX+d — sets DE to a stack-frame-relative destination
    3. LD BC, 9 — 9 bytes to copy
    4. LDIR — copies FROM (HL) TO (DE)

  Wait — after EX DE,HL, the entry pointer is in DE and old DE is in HL.
  Then LEA DE, IX+d REPLACES DE with the stack frame address.
  LDIR copies from (HL) to (DE).
  So the SOURCE is HL = whatever was in DE before the call.

  BUT: 0x0846EA likely returns the entry pointer in HL AND also sets DE
  to point at the same entry (or the entry data). The EX DE,HL then puts:
  - The entry data pointer in HL (from DE as returned by 0x0846EA)
  - The other return value in DE (which gets replaced by LEA)

  This is a "CACHE CURRENT ENTRY" pattern:
  - Look up an entry by key in the D3Fxxx table
  - Copy the 9-byte entry into a local stack frame buffer
  - Repeat for multiple different keys
  - Then use the cached copies locally without re-reading the table

  The function caches at least 4-5 entries at different IX-relative offsets
  in its stack frame, then does further processing (CALL 0x023636,
  LD (D005F8) operations, etc.) before returning.

Site 0x02859C (0x028580-0x0285C0):
  CALL 0x0846EA followed by EX DE,HL then LD A,(HL); INC HL; OR (HL); RET.
  This is a "CHECK IF ENTRY EXISTS AND TEST FIRST 2 BYTES" pattern —
  no LDIR copy, just reads first 2 bytes of the found entry.

Site 0x06F502 (0x06F4E0-0x06F520):
  EX DE,HL in a different context — appears to be swapping a computed
  difference (SBC HL,DE result) for iteration. This is NOT after a
  CALL 0x0846EA but in a traversal loop.
`);

console.log('Done.');
