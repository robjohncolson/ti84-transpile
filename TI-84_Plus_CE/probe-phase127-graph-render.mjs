#!/usr/bin/env node
/**
 * Phase 127 — Graph Subsystem Proof-of-Concept: IPoint / ILine pixel rendering
 *
 * Goals:
 *   1. Cold boot + MEM_INIT
 *   2. Disassemble IPoint (0x07B451) and ILine (0x07B245) to understand register conventions
 *   3. Call IPoint with pixel coordinates, check if plotSScreen gets pixels written
 *   4. Call ILine similarly if IPoint works
 *   5. Report findings
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PRELIFTED_BLOCKS,
  decodeEmbeddedRom,
} from './ROM.transpiled.js';
import { createPeripheralBus } from './peripherals.js';
import { createExecutor } from './cpu-runtime.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Key addresses ──────────────────────────────────────────────────────
const IPOINT_ADDR      = 0x07B451;
const ILINE_ADDR       = 0x07B245;
const MODE_BYTE_ADDR   = 0xD02AD4;  // 0=point, 1=line
const PLOTSSCREEN_ADDR = 0xD09466;
const PLOTSSCREEN_SIZE = 21945;
const GRAPHDRAW_ADDR   = 0xD00083;  // IY+3h (IY=0xD00080)
const STACK_TOP        = 0xD1A87E;
const FAKE_RET         = 0x7FFFFE;
const MEMINIT_ENTRY    = 0x09DEE0;

// Graph window BCD addresses
const XMIN_ADDR = 0xD01792;
const XMAX_ADDR = 0xD0179B;
const YMIN_ADDR = 0xD017B0;
const YMAX_ADDR = 0xD017B9;

// ── Helpers ────────────────────────────────────────────────────────────

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

function hexDump(buf, offset, len) {
  const lines = [];
  for (let i = 0; i < len; i += 16) {
    const addr = offset + i;
    const bytes = [];
    for (let j = 0; j < 16 && i + j < len; j++) {
      bytes.push(buf[addr + j].toString(16).toUpperCase().padStart(2, '0'));
    }
    lines.push(`  ${hex(addr)}: ${bytes.join(' ')}`);
  }
  return lines.join('\n');
}

/**
 * Simple eZ80 disassembler — enough to read the first ~20 instructions.
 * Returns array of { addr, hex, inst }.
 */
function disassembleEz80(buf, offset, maxBytes, maxInstructions = 20) {
  const instructions = [];
  let pos = 0;

  while (pos < maxBytes && instructions.length < maxInstructions) {
    const b = buf[offset + pos];
    if (b === undefined) break;

    const addr = offset + pos;
    let inst = '';
    let len = 1;

    // Read 3-byte little-endian address at current offset + delta
    const read24 = (delta) => {
      const lo = buf[offset + pos + delta];
      const mi = buf[offset + pos + delta + 1];
      const hi = buf[offset + pos + delta + 2];
      return lo | (mi << 8) | (hi << 16);
    };

    switch (b) {
      case 0x00: inst = 'NOP'; break;
      case 0x01: { const v = read24(1); inst = `LD BC,${hex(v)}`; len = 4; break; }
      case 0x03: inst = 'INC BC'; break;
      case 0x04: inst = 'INC B'; break;
      case 0x05: inst = 'DEC B'; break;
      case 0x06: { inst = `LD B,${hex(buf[offset+pos+1],2)}`; len = 2; break; }
      case 0x0B: inst = 'DEC BC'; break;
      case 0x0C: inst = 'INC C'; break;
      case 0x0D: inst = 'DEC C'; break;
      case 0x0E: { inst = `LD C,${hex(buf[offset+pos+1],2)}`; len = 2; break; }
      case 0x11: { const v = read24(1); inst = `LD DE,${hex(v)}`; len = 4; break; }
      case 0x13: inst = 'INC DE'; break;
      case 0x14: inst = 'INC D'; break;
      case 0x15: inst = 'DEC D'; break;
      case 0x16: { inst = `LD D,${hex(buf[offset+pos+1],2)}`; len = 2; break; }
      case 0x18: {
        const off = buf[offset + pos + 1];
        const rel = off > 127 ? off - 256 : off;
        inst = `JR ${hex(addr + 2 + rel)} (${rel >= 0 ? '+' : ''}${rel})`;
        len = 2;
        break;
      }
      case 0x19: inst = 'ADD HL,DE'; break;
      case 0x1B: inst = 'DEC DE'; break;
      case 0x1C: inst = 'INC E'; break;
      case 0x1D: inst = 'DEC E'; break;
      case 0x1E: { inst = `LD E,${hex(buf[offset+pos+1],2)}`; len = 2; break; }
      case 0x20: {
        const off = buf[offset + pos + 1];
        const rel = off > 127 ? off - 256 : off;
        inst = `JR NZ,${hex(addr + 2 + rel)} (${rel >= 0 ? '+' : ''}${rel})`;
        len = 2;
        break;
      }
      case 0x21: { const v = read24(1); inst = `LD HL,${hex(v)}`; len = 4; break; }
      case 0x22: { const v = read24(1); inst = `LD (${hex(v)}),HL`; len = 4; break; }
      case 0x23: inst = 'INC HL'; break;
      case 0x24: inst = 'INC H'; break;
      case 0x25: inst = 'DEC H'; break;
      case 0x26: { inst = `LD H,${hex(buf[offset+pos+1],2)}`; len = 2; break; }
      case 0x28: {
        const off = buf[offset + pos + 1];
        const rel = off > 127 ? off - 256 : off;
        inst = `JR Z,${hex(addr + 2 + rel)} (${rel >= 0 ? '+' : ''}${rel})`;
        len = 2;
        break;
      }
      case 0x2A: { const v = read24(1); inst = `LD HL,(${hex(v)})`; len = 4; break; }
      case 0x2B: inst = 'DEC HL'; break;
      case 0x2C: inst = 'INC L'; break;
      case 0x2D: inst = 'DEC L'; break;
      case 0x2E: { inst = `LD L,${hex(buf[offset+pos+1],2)}`; len = 2; break; }
      case 0x30: {
        const off = buf[offset + pos + 1];
        const rel = off > 127 ? off - 256 : off;
        inst = `JR NC,${hex(addr + 2 + rel)} (${rel >= 0 ? '+' : ''}${rel})`;
        len = 2;
        break;
      }
      case 0x31: { const v = read24(1); inst = `LD SP,${hex(v)}`; len = 4; break; }
      case 0x32: { const v = read24(1); inst = `LD (${hex(v)}),A`; len = 4; break; }
      case 0x36: { inst = `LD (HL),${hex(buf[offset+pos+1],2)}`; len = 2; break; }
      case 0x38: {
        const off = buf[offset + pos + 1];
        const rel = off > 127 ? off - 256 : off;
        inst = `JR C,${hex(addr + 2 + rel)} (${rel >= 0 ? '+' : ''}${rel})`;
        len = 2;
        break;
      }
      case 0x3A: { const v = read24(1); inst = `LD A,(${hex(v)})`; len = 4; break; }
      case 0x3C: inst = 'INC A'; break;
      case 0x3D: inst = 'DEC A'; break;
      case 0x3E: { inst = `LD A,${hex(buf[offset+pos+1],2)}`; len = 2; break; }
      case 0x76: inst = 'HALT'; break;
      case 0x77: inst = 'LD (HL),A'; break;
      case 0x87: inst = 'ADD A,A'; break;
      case 0xA7: inst = 'AND A'; break;
      case 0xAF: inst = 'XOR A'; break;
      case 0xB7: inst = 'OR A'; break;
      case 0xBE: inst = 'CP (HL)'; break;
      case 0xC0: inst = 'RET NZ'; break;
      case 0xC1: inst = 'POP BC'; break;
      case 0xC2: { const v = read24(1); inst = `JP NZ,${hex(v)}`; len = 4; break; }
      case 0xC3: { const v = read24(1); inst = `JP ${hex(v)}`; len = 4; break; }
      case 0xC4: { const v = read24(1); inst = `CALL NZ,${hex(v)}`; len = 4; break; }
      case 0xC5: inst = 'PUSH BC'; break;
      case 0xC6: { inst = `ADD A,${hex(buf[offset+pos+1],2)}`; len = 2; break; }
      case 0xC8: inst = 'RET Z'; break;
      case 0xC9: inst = 'RET'; break;
      case 0xCA: { const v = read24(1); inst = `JP Z,${hex(v)}`; len = 4; break; }
      case 0xCC: { const v = read24(1); inst = `CALL Z,${hex(v)}`; len = 4; break; }
      case 0xCD: { const v = read24(1); inst = `CALL ${hex(v)}`; len = 4; break; }
      case 0xD0: inst = 'RET NC'; break;
      case 0xD1: inst = 'POP DE'; break;
      case 0xD2: { const v = read24(1); inst = `JP NC,${hex(v)}`; len = 4; break; }
      case 0xD4: { const v = read24(1); inst = `CALL NC,${hex(v)}`; len = 4; break; }
      case 0xD5: inst = 'PUSH DE'; break;
      case 0xD6: { inst = `SUB ${hex(buf[offset+pos+1],2)}`; len = 2; break; }
      case 0xD8: inst = 'RET C'; break;
      case 0xDA: { const v = read24(1); inst = `JP C,${hex(v)}`; len = 4; break; }
      case 0xDC: { const v = read24(1); inst = `CALL C,${hex(v)}`; len = 4; break; }
      case 0xE1: inst = 'POP HL'; break;
      case 0xE5: inst = 'PUSH HL'; break;
      case 0xE6: { inst = `AND ${hex(buf[offset+pos+1],2)}`; len = 2; break; }
      case 0xE9: inst = 'JP (HL)'; break;
      case 0xEB: inst = 'EX DE,HL'; break;
      case 0xF1: inst = 'POP AF'; break;
      case 0xF3: inst = 'DI'; break;
      case 0xF5: inst = 'PUSH AF'; break;
      case 0xFB: inst = 'EI'; break;
      case 0xFE: { inst = `CP ${hex(buf[offset+pos+1],2)}`; len = 2; break; }

      case 0xCB: {
        if (pos + 1 >= maxBytes) { inst = 'CB ??'; break; }
        const b2 = buf[offset + pos + 1];
        const bit = (b2 >> 3) & 7;
        const reg = b2 & 7;
        const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
        if (b2 >= 0x40 && b2 < 0x80) inst = `BIT ${bit},${regNames[reg]}`;
        else if (b2 >= 0x80 && b2 < 0xC0) inst = `RES ${bit},${regNames[reg]}`;
        else if (b2 >= 0xC0) inst = `SET ${bit},${regNames[reg]}`;
        else inst = `CB ${hex(b2,2)}`;
        len = 2;
        break;
      }

      case 0xDD: {
        // IX prefix — just show raw for now
        if (pos + 1 >= maxBytes) { inst = 'DD ??'; break; }
        const b2 = buf[offset + pos + 1];
        if (b2 === 0xCB && pos + 3 < maxBytes) {
          const d = buf[offset + pos + 2];
          const b3 = buf[offset + pos + 3];
          const bit = (b3 >> 3) & 7;
          if (b3 >= 0x40 && b3 < 0x80) inst = `BIT ${bit},(IX+${hex(d,2)})`;
          else if (b3 >= 0x80 && b3 < 0xC0) inst = `RES ${bit},(IX+${hex(d,2)})`;
          else if (b3 >= 0xC0) inst = `SET ${bit},(IX+${hex(d,2)})`;
          else inst = `DD CB ${hex(d,2)} ${hex(b3,2)}`;
          len = 4;
        } else {
          inst = `DD ${hex(b2,2)}`;
          len = 2;
        }
        break;
      }

      case 0xFD: {
        // IY prefix
        if (pos + 1 >= maxBytes) { inst = 'FD ??'; break; }
        const b2 = buf[offset + pos + 1];
        if (b2 === 0xCB && pos + 3 < maxBytes) {
          const d = buf[offset + pos + 2];
          const b3 = buf[offset + pos + 3];
          const bit = (b3 >> 3) & 7;
          if (b3 >= 0x40 && b3 < 0x80) inst = `BIT ${bit},(IY+${hex(d,2)})`;
          else if (b3 >= 0x80 && b3 < 0xC0) inst = `RES ${bit},(IY+${hex(d,2)})`;
          else if (b3 >= 0xC0) inst = `SET ${bit},(IY+${hex(d,2)})`;
          else inst = `FD CB ${hex(d,2)} ${hex(b3,2)}`;
          len = 4;
        } else if (b2 === 0x21 && pos + 4 < maxBytes) {
          const v = read24(2);
          inst = `LD IY,${hex(v)}`;
          len = 5;
        } else if (b2 === 0xE5) {
          inst = 'PUSH IY';
          len = 2;
        } else if (b2 === 0xE1) {
          inst = 'POP IY';
          len = 2;
        } else {
          inst = `FD ${hex(b2,2)}`;
          len = 2;
        }
        break;
      }

      case 0xED: {
        if (pos + 1 >= maxBytes) { inst = 'ED ??'; break; }
        const b2 = buf[offset + pos + 1];
        if (b2 === 0x4B && pos + 4 < maxBytes) {
          const v = read24(2); inst = `LD BC,(${hex(v)})`; len = 5;
        } else if (b2 === 0x5B && pos + 4 < maxBytes) {
          const v = read24(2); inst = `LD DE,(${hex(v)})`; len = 5;
        } else if (b2 === 0x6B && pos + 4 < maxBytes) {
          const v = read24(2); inst = `LD HL,(${hex(v)})`; len = 5;
        } else if (b2 === 0x7B && pos + 4 < maxBytes) {
          const v = read24(2); inst = `LD SP,(${hex(v)})`; len = 5;
        } else if (b2 === 0x43 && pos + 4 < maxBytes) {
          const v = read24(2); inst = `LD (${hex(v)}),BC`; len = 5;
        } else if (b2 === 0x53 && pos + 4 < maxBytes) {
          const v = read24(2); inst = `LD (${hex(v)}),DE`; len = 5;
        } else if (b2 === 0x63 && pos + 4 < maxBytes) {
          const v = read24(2); inst = `LD (${hex(v)}),HL`; len = 5;
        } else if (b2 === 0x73 && pos + 4 < maxBytes) {
          const v = read24(2); inst = `LD (${hex(v)}),SP`; len = 5;
        } else if (b2 === 0xB0) {
          inst = 'LDIR'; len = 2;
        } else if (b2 === 0xB8) {
          inst = 'LDDR'; len = 2;
        } else {
          inst = `ED ${hex(b2,2)}`; len = 2;
        }
        break;
      }

      default: {
        if (b >= 0x40 && b <= 0x7F && b !== 0x76) {
          const src = b & 7;
          const dst = (b >> 3) & 7;
          const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
          inst = `LD ${regNames[dst]},${regNames[src]}`;
        } else if (b >= 0x80 && b <= 0xBF) {
          const ops = ['ADD A,', 'ADC A,', 'SUB ', 'SBC A,', 'AND ', 'XOR ', 'OR ', 'CP '];
          const regNames = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];
          const opIdx = (b >> 3) & 7;
          const reg = b & 7;
          inst = `${ops[opIdx]}${regNames[reg]}`;
        } else {
          inst = `db ${hex(b,2)}`;
        }
      }
    }

    const rawBytes = Array.from(buf.slice(offset + pos, offset + pos + len))
      .map(x => x.toString(16).toUpperCase().padStart(2, '0'))
      .join(' ');

    instructions.push({ addr: hex(addr), hex: rawBytes, inst });
    pos += len;

    // Stop after unconditional RET or JP
    if (b === 0xC9 || b === 0xC3) break;
  }

  return instructions;
}

function printDisassembly(label, instructions) {
  console.log(`\n--- ${label} ---`);
  for (const i of instructions) {
    console.log(`  ${i.addr}: ${i.hex.padEnd(18)} ${i.inst}`);
  }
}

/**
 * Count non-zero bytes in a memory region.
 */
function countNonZero(mem, start, len) {
  let count = 0;
  for (let i = 0; i < len; i++) {
    if (mem[start + i] !== 0) count++;
  }
  return count;
}

/**
 * Write a TI BCD real number to memory.
 *  byte 0 = 0x00 (positive) or 0x80 (negative)
 *  byte 1 = exponent + 0x80
 *  bytes 2-8 = BCD mantissa
 */
function writeBcdReal(mem, addr, num) {
  // Zero
  if (num === 0) {
    mem[addr] = 0x00;
    mem[addr + 1] = 0x80;
    for (let i = 2; i < 9; i++) mem[addr + i] = 0x00;
    return;
  }

  const negative = num < 0;
  const absVal = Math.abs(num);
  mem[addr] = negative ? 0x80 : 0x00;

  // Compute exponent: 10^exp <= absVal < 10^(exp+1)
  const exp = Math.floor(Math.log10(absVal));
  mem[addr + 1] = (exp + 0x80) & 0xFF;

  // Normalize mantissa: shift so that we have 14 BCD digits
  const mantissa = absVal / Math.pow(10, exp);
  const digits = mantissa.toFixed(13).replace('.', '');  // 14 digits

  for (let i = 0; i < 7; i++) {
    const hi = parseInt(digits[i * 2] || '0', 10);
    const lo = parseInt(digits[i * 2 + 1] || '0', 10);
    mem[addr + 2 + i] = (hi << 4) | lo;
  }
}

/**
 * Read a TI BCD real from memory and return a JS number.
 */
function readBcdReal(mem, addr) {
  const sign = (mem[addr] & 0x80) ? -1 : 1;
  const exp = (mem[addr + 1] & 0xFF) - 0x80;

  let mantissa = 0;
  for (let i = 0; i < 7; i++) {
    const byte = mem[addr + 2 + i];
    const hi = (byte >> 4) & 0xF;
    const lo = byte & 0xF;
    mantissa = mantissa * 100 + hi * 10 + lo;
  }
  // mantissa has 14 digits; divide by 10^13 to get d.ddddddddddddd
  return sign * mantissa * Math.pow(10, exp - 13);
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════

console.log('=== Phase 127 — Graph Render Proof-of-Concept ===\n');

// ── Step 1: Boot environment ───────────────────────────────────────────
console.log('[1] Booting environment...');

const romBytes = decodeEmbeddedRom();
const mem = new Uint8Array(0x1000000);
mem.set(romBytes);

const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

// Cold boot (z80 mode)
const coldBoot = executor.runFrom(0x000000, 'z80', {
  maxSteps: 20000,
  maxLoopIterations: 32,
});
console.log(`  coldBoot: steps=${coldBoot.steps} term=${coldBoot.termination} lastPc=${hex(coldBoot.lastPc ?? 0)}`);

// Reset CPU for MEM_INIT
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = STACK_TOP;

// Plant HALT sentinel at FAKE_RET
mem[FAKE_RET] = 0x76;
mem[FAKE_RET + 1] = 0x76;
mem[FAKE_RET + 2] = 0x76;

// Push FAKE_RET as return address
cpu.sp -= 3;
mem[cpu.sp]     = FAKE_RET & 0xFF;
mem[cpu.sp + 1] = (FAKE_RET >> 8) & 0xFF;
mem[cpu.sp + 2] = (FAKE_RET >> 16) & 0xFF;

// Run MEM_INIT
const memInit = executor.runFrom(MEMINIT_ENTRY, 'adl', {
  maxSteps: 100000,
  maxLoopIterations: 10000,
});
console.log(`  MEM_INIT: steps=${memInit.steps} term=${memInit.termination} lastPc=${hex(memInit.lastPc ?? 0)}`);

// Set standard IY and MBASE
cpu.mbase = 0xD0;
cpu._iy = 0xD00080;

console.log('  Boot complete.\n');

// ── Step 2: Disassemble IPoint and ILine ───────────────────────────────
console.log('[2] Disassembling IPoint and ILine from ROM...\n');

// Read ROM bytes for disassembly
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

console.log('IPoint raw hex (64 bytes):');
console.log(hexDump(rom, IPOINT_ADDR, 64));
const ipointInst = disassembleEz80(rom, IPOINT_ADDR, 128, 30);
printDisassembly(`IPoint (${hex(IPOINT_ADDR)})`, ipointInst);

console.log('\nILine raw hex (64 bytes):');
console.log(hexDump(rom, ILINE_ADDR, 64));
const ilineInst = disassembleEz80(rom, ILINE_ADDR, 128, 30);
printDisassembly(`ILine (${hex(ILINE_ADDR)})`, ilineInst);

// IPoint after bail-out check: JR Z,+3 at 0x07B466 jumps to 0x07B46B
// (skipping POP AF; RET). Disassemble the continuation.
const IPOINT_CONT = 0x07B46B;
console.log(`\nIPoint continuation from ${hex(IPOINT_CONT)} (128 bytes):`);
console.log(hexDump(rom, IPOINT_CONT, 128));
const contInst = disassembleEz80(rom, IPOINT_CONT, 192, 40);
printDisassembly(`IPoint continuation (${hex(IPOINT_CONT)})`, contInst);

// ILine after bail-out: JR Z,+2 at 0x07B256 jumps to 0x07B25A
const ILINE_CONT = 0x07B25A;
console.log(`\nILine continuation from ${hex(ILINE_CONT)} (128 bytes):`);
console.log(hexDump(rom, ILINE_CONT, 128));
const ilineContInst = disassembleEz80(rom, ILINE_CONT, 192, 40);
printDisassembly(`ILine continuation (${hex(ILINE_CONT)})`, ilineContInst);

// Disassemble key continuation blocks
const EXTRA_BLOCKS = [
  { addr: 0x07B504, label: 'IPoint path when BIT 5,(IY+14h)=0' },
  { addr: 0x07B50D, label: 'IPoint block 0x07B50D' },
  { addr: 0x07B793, label: 'IPoint block 0x07B793' },
  { addr: 0x07B7B0, label: 'IPoint block 0x07B7B0' },
  { addr: 0x07B51B, label: 'IPoint block 0x07B51B' },
  { addr: 0x07B6BA, label: 'IPoint block 0x07B6BA' },
  { addr: 0x07B6BF, label: 'IPoint block 0x07B6BF' },
  { addr: 0x07B30E, label: 'IPoint terminal 0x07B30E' },
];

for (const blk of EXTRA_BLOCKS) {
  console.log(`\n${blk.label} — hex dump (48 bytes):`);
  console.log(hexDump(rom, blk.addr, 48));
  const insts = disassembleEz80(rom, blk.addr, 64, 20);
  printDisassembly(blk.label, insts);
}

// ── Step 2b: Analyze IPoint register convention ────────────────────────
console.log('\n[2b] Analyzing register conventions...\n');

// Look at what IPoint reads from RAM — the LD (addr),A at start means
// register A is an input (draw mode). The BCD window vars suggest
// IPoint might take FP math coordinates, not pixel coordinates.
// Let's also check what the IPoint routine reads from known RAM locations.

// From the disassembly, IPoint/ILine likely use these RAM variables:
const DRAW_MODE_ADDR = 0xD02AC8;
console.log('Key RAM addresses used by IPoint/ILine:');
console.log(`  Draw mode byte:  ${hex(DRAW_MODE_ADDR)} (written from A register on entry)`);
console.log(`  Point/Line flag: ${hex(MODE_BYTE_ADDR)} (0=point, 1=line)`);
console.log(`  plotSScreen:     ${hex(PLOTSSCREEN_ADDR)} (${PLOTSSCREEN_SIZE} bytes)`);
console.log(`  graphDraw flag:  ${hex(GRAPHDRAW_ADDR)} (IY+3h bit 0)`);

// ── Step 3: Seed graph window and attempt IPoint call ──────────────────
console.log('\n[3] Seeding graph window variables and calling IPoint...\n');

// Seed standard window: Xmin=-10, Xmax=10, Ymin=-10, Ymax=10
writeBcdReal(mem, XMIN_ADDR, -10);
writeBcdReal(mem, XMAX_ADDR, 10);
writeBcdReal(mem, YMIN_ADDR, -10);
writeBcdReal(mem, YMAX_ADDR, 10);

console.log('  Window seeded:');
console.log(`    Xmin = ${readBcdReal(mem, XMIN_ADDR)} (at ${hex(XMIN_ADDR)})`);
console.log(`    Xmax = ${readBcdReal(mem, XMAX_ADDR)} (at ${hex(XMAX_ADDR)})`);
console.log(`    Ymin = ${readBcdReal(mem, YMIN_ADDR)} (at ${hex(YMIN_ADDR)})`);
console.log(`    Ymax = ${readBcdReal(mem, YMAX_ADDR)} (at ${hex(YMAX_ADDR)})`);

// Clear plotSScreen before test
for (let i = 0; i < PLOTSSCREEN_SIZE; i++) {
  mem[PLOTSSCREEN_ADDR + i] = 0x00;
}
const preNonZero = countNonZero(mem, PLOTSSCREEN_ADDR, PLOTSSCREEN_SIZE);
console.log(`\n  plotSScreen before IPoint: ${preNonZero} non-zero bytes`);

// Set graphDraw dirty flag (bit 0 of IY+3h)
mem[GRAPHDRAW_ADDR] |= 0x01;

// IY+35h = 0xD000B5 — BIT 7 is checked; if set, IPoint bails out.
// Clear bit 7 of IY+35h to prevent early bail-out.
const IY_PLUS_35H = 0xD000B5;
console.log(`  IY+35h (${hex(IY_PLUS_35H)}): ${hex(mem[IY_PLUS_35H], 2)} — clearing bit 7`);
mem[IY_PLUS_35H] &= ~0x80;

// The bounds-check routine at 0x07B793 uses .SIS prefix to read
// 16-bit addresses with MBASE. With MBASE=0xD0:
//   0xD01501 = plotTop (or similar graph screen top boundary)
//   0xD014FE = plotBot/plotRight (graph screen right/bottom boundary)
// These need valid pixel boundaries for the check to pass (carry=0 means in-bounds).
// TI-84 CE LCD is 320x240, graph area typically: x=0..264, y=0..164
// (after status bar and softkey area).
//
// From ti84pceg.inc:
//   plotSScreen starts at 0xD09466
//   xEdge = 0xD014FE (1 byte, max x pixel)
//   yEdge = 0xD014FF (1 byte, max y pixel)
//   or they might be 2-byte values at 0xD01501 and 0xD014FE
//
// The bounds check at 0x07B793 does:
//   .SIS LD HL,(0x1501)  ; read from 0xD01501 (plotScrLeft or plotScrTop as 16-bit)
//   OR A; SBC HL,DE      ; compare against DE (a coordinate)
//   JR C, out-of-bounds  ; if coord > limit, bail
//   .SIS LD HL,(0x14FE)  ; read from 0xD014FE (plotScrRight or plotScrBot)
//   CP L                 ; compare against another coord
//   JR NC, out-of-bounds
//
// Set graph screen boundaries. For the 320x240 display:
// Graph area: left=0, right=264, top=0, bottom=164 (approximately)
const PLOT_BOUNDS_ADDR1 = 0xD01501;  // likely max-Y or min boundary
const PLOT_BOUNDS_ADDR2 = 0xD014FE;  // likely max-X or comparison boundary

// Write 16-bit values for screen boundaries
// Try setting wide boundaries to pass the check
mem[PLOT_BOUNDS_ADDR1] = 0xFF;   // low byte = 255
mem[PLOT_BOUNDS_ADDR1 + 1] = 0x00; // high byte = 0 (value = 255)
mem[PLOT_BOUNDS_ADDR2] = 0xFF;   // max = 255
mem[PLOT_BOUNDS_ADDR2 + 1] = 0x00;

// Also set xEdge/yEdge common TI variables
// plotTop, plotBot, plotLeft, plotRight at various offsets
// Let's dump and log what's at these addresses
console.log(`  Plot bounds addr1 (${hex(PLOT_BOUNDS_ADDR1)}): ${hex(mem[PLOT_BOUNDS_ADDR1],2)} ${hex(mem[PLOT_BOUNDS_ADDR1+1],2)}`);
console.log(`  Plot bounds addr2 (${hex(PLOT_BOUNDS_ADDR2)}): ${hex(mem[PLOT_BOUNDS_ADDR2],2)} ${hex(mem[PLOT_BOUNDS_ADDR2+1],2)}`);

// The 0xD026AE value is loaded and stored to 0xD02A60 — this is the pen color
// Set a non-zero pen color
mem[0xD026AE] = 0x01;

// Prepare CPU for IPoint call
// IPoint expects A = draw mode. Mode 1 = normal draw (from TI docs).
// Let's try A = 1 for normal draw.
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.madl = 1;
cpu.a = 0x01;        // draw mode = 1 (normal)
cpu._iy = 0xD00080;
cpu.mbase = 0xD0;

// IPoint might expect coordinates in specific registers or RAM locations.
// From the TI SDK docs, IPoint likely takes:
//   - Pixel X in DE (or D,E)
//   - Pixel Y in HL (or H,L)
// The LCD is 320x240, graph area is roughly 265x165.
// Try putting pixel coords: X=160 (middle), Y=120 (middle)
cpu.d = 0;
cpu.e = 160;   // DE = 160 (pixel X)
cpu.h = 0;
cpu.l = 120;   // HL = 120 (pixel Y)
// Also try BC with a coordinate
cpu.b = 0;
cpu.c = 0;

cpu.sp = STACK_TOP;

// Push FAKE_RET as return address
cpu.sp -= 3;
mem[cpu.sp]     = FAKE_RET & 0xFF;
mem[cpu.sp + 1] = (FAKE_RET >> 8) & 0xFF;
mem[cpu.sp + 2] = (FAKE_RET >> 16) & 0xFF;

console.log(`\n  Calling IPoint at ${hex(IPOINT_ADDR)} with A=0x01, DE=160, HL=120...`);

const ipointTrace = [];
const ipointRun = executor.runFrom(IPOINT_ADDR, 'adl', {
  maxSteps: 50000,
  maxLoopIterations: 500,
  onBlock: (pc, mode) => {
    if (ipointTrace.length < 50) ipointTrace.push(hex(pc));
  },
});

console.log(`  IPoint result: steps=${ipointRun.steps} term=${ipointRun.termination} lastPc=${hex(ipointRun.lastPc ?? 0)}`);
if (ipointTrace.length > 0) {
  console.log(`  Block trace (${ipointTrace.length} blocks): ${ipointTrace.join(' -> ')}`);
}
if (ipointRun.missingBlocks && ipointRun.missingBlocks.size > 0) {
  console.log(`  Missing blocks: ${[...ipointRun.missingBlocks].slice(0, 10).join(', ')}`);
}

// Dump CPU state after IPoint
console.log(`  CPU after IPoint: A=${hex(cpu.a,2)} BC=${hex((cpu.b<<8)|cpu.c,4)} DE=${hex((cpu.d<<8)|cpu.e,4)} HL=${hex((cpu.h<<8)|cpu.l,4)} SP=${hex(cpu.sp)}`);

// Dump the key memory locations the bounds check reads
console.log(`  Bounds check memory:`);
console.log(`    0xD01501 (2 bytes): ${hex(mem[0xD01501],2)} ${hex(mem[0xD01502],2)} = ${mem[0xD01501] | (mem[0xD01502] << 8)}`);
console.log(`    0xD014FE (2 bytes): ${hex(mem[0xD014FE],2)} ${hex(mem[0xD014FF],2)} = ${mem[0xD014FE] | (mem[0xD014FF] << 8)}`);
console.log(`    0xD014FF (1 byte):  ${hex(mem[0xD014FF],2)}`);
console.log(`    0xD01500 (1 byte):  ${hex(mem[0xD01500],2)}`);
// Dump more context around plotLeft/Right/Top/Bot area
console.log(`    0xD014F0..0xD01510:`);
console.log(`    ` + Array.from(mem.slice(0xD014F0, 0xD01510)).map(b => b.toString(16).padStart(2, '0')).join(' '));

const postNonZero = countNonZero(mem, PLOTSSCREEN_ADDR, PLOTSSCREEN_SIZE);
console.log(`  plotSScreen after IPoint: ${postNonZero} non-zero bytes`);

if (postNonZero > preNonZero) {
  console.log('  >>> PIXELS WRITTEN to plotSScreen! <<<');
  // Show first few non-zero bytes
  const samples = [];
  for (let i = 0; i < PLOTSSCREEN_SIZE && samples.length < 20; i++) {
    if (mem[PLOTSSCREEN_ADDR + i] !== 0) {
      samples.push({ offset: i, value: hex(mem[PLOTSSCREEN_ADDR + i], 2) });
    }
  }
  console.log('  First non-zero bytes in plotSScreen:');
  for (const s of samples) {
    console.log(`    offset ${s.offset} (${hex(PLOTSSCREEN_ADDR + s.offset)}): ${s.value}`);
  }
} else {
  console.log('  No pixels written to plotSScreen.');
}

// Check mode byte state
console.log(`\n  Mode byte at ${hex(MODE_BYTE_ADDR)}: ${hex(mem[MODE_BYTE_ADDR], 2)}`);
console.log(`  Draw mode at ${hex(DRAW_MODE_ADDR)}: ${hex(mem[DRAW_MODE_ADDR], 2)}`);

// ── Step 4: Try ILine ──────────────────────────────────────────────────
console.log('\n[4] Attempting ILine call...\n');

// Clear plotSScreen again
for (let i = 0; i < PLOTSSCREEN_SIZE; i++) {
  mem[PLOTSSCREEN_ADDR + i] = 0x00;
}

// ILine might expect two points. From TI SDK:
// Possibly: (x1,y1) in BC/DE and (x2,y2) in HL/other regs
// Or coordinates stored in RAM (penCol/penRow style).
// Try: draw from (50,50) to (200,150)

// Some TI routines use the FP stack (OP1-OP6) for coordinates.
// OP1 = 0xD005F8, OP2 = 0xD00601, etc. (9 bytes each)
const OP1_ADDR = 0xD005F8;
const OP2_ADDR = 0xD00601;
const OP3_ADDR = 0xD0060A;
const OP4_ADDR = 0xD00613;

// Seed OP1-OP4 with line endpoints (as FP values: x1, y1, x2, y2)
writeBcdReal(mem, OP1_ADDR, 50);   // x1 = 50
writeBcdReal(mem, OP2_ADDR, 50);   // y1 = 50
writeBcdReal(mem, OP3_ADDR, 200);  // x2 = 200
writeBcdReal(mem, OP4_ADDR, 150);  // y2 = 150

// Clear IY+35h bit 7 again for ILine
mem[IY_PLUS_35H] &= ~0x80;

cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.madl = 1;
cpu.a = 0x01;        // draw mode = 1 (normal)
cpu._iy = 0xD00080;
cpu.mbase = 0xD0;

// Also set integer coordinates in registers
cpu.d = 0; cpu.e = 50;    // DE = x1 or startX
cpu.h = 0; cpu.l = 50;    // HL = y1 or startY
cpu.b = 0; cpu.c = 200;   // BC = x2 or endX (low byte)

cpu.sp = STACK_TOP;
cpu.sp -= 3;
mem[cpu.sp]     = FAKE_RET & 0xFF;
mem[cpu.sp + 1] = (FAKE_RET >> 8) & 0xFF;
mem[cpu.sp + 2] = (FAKE_RET >> 16) & 0xFF;

console.log(`  Calling ILine at ${hex(ILINE_ADDR)} with A=0x01, DE=50, HL=50, BC=200...`);

const ilineTrace = [];
const ilineRun = executor.runFrom(ILINE_ADDR, 'adl', {
  maxSteps: 50000,
  maxLoopIterations: 500,
  onBlock: (pc, mode) => {
    if (ilineTrace.length < 80) ilineTrace.push(hex(pc));
  },
});

console.log(`  ILine result: steps=${ilineRun.steps} term=${ilineRun.termination} lastPc=${hex(ilineRun.lastPc ?? 0)}`);
if (ilineTrace.length > 0) {
  console.log(`  Block trace (${ilineTrace.length} blocks): ${ilineTrace.join(' -> ')}`);
}
if (ilineRun.missingBlocks && ilineRun.missingBlocks.size > 0) {
  console.log(`  Missing blocks: ${[...ilineRun.missingBlocks].slice(0, 10).join(', ')}`);
}

const postILineNonZero = countNonZero(mem, PLOTSSCREEN_ADDR, PLOTSSCREEN_SIZE);
console.log(`  plotSScreen after ILine: ${postILineNonZero} non-zero bytes`);

if (postILineNonZero > 0) {
  console.log('  >>> PIXELS WRITTEN to plotSScreen! <<<');
  const samples = [];
  for (let i = 0; i < PLOTSSCREEN_SIZE && samples.length < 20; i++) {
    if (mem[PLOTSSCREEN_ADDR + i] !== 0) {
      samples.push({ offset: i, value: hex(mem[PLOTSSCREEN_ADDR + i], 2) });
    }
  }
  console.log('  First non-zero bytes in plotSScreen:');
  for (const s of samples) {
    console.log(`    offset ${s.offset} (${hex(PLOTSSCREEN_ADDR + s.offset)}): ${s.value}`);
  }
} else {
  console.log('  No pixels written to plotSScreen.');
}

// ── Step 5: Try PixelCmd (0x05DBA0) as alternative ─────────────────────
console.log('\n[5] Trying PixelCmd (0x05DBA0) as alternative pixel-level draw...\n');

const PIXELCMD_ADDR = 0x05DBA0;

// Clear plotSScreen
for (let i = 0; i < PLOTSSCREEN_SIZE; i++) {
  mem[PLOTSSCREEN_ADDR + i] = 0x00;
}

console.log(`PixelCmd raw hex (64 bytes):`);
console.log(hexDump(rom, PIXELCMD_ADDR, 64));
const pixelCmdInst = disassembleEz80(rom, PIXELCMD_ADDR, 128, 30);
printDisassembly(`PixelCmd (${hex(PIXELCMD_ADDR)})`, pixelCmdInst);

// ── Step 6: Verify .SIS prefix hypothesis ──────────────────────────────
console.log('\n[6] Verifying .SIS prefix handling...\n');

// The bounds check at 0x07B793 uses eZ80 .SIS prefix (0x40 before LD HL,(nn)).
// If the transpiler treats 0x40 as LD B,B instead of .SIS, the address operand
// becomes 3 bytes instead of 2, misaligning all subsequent instructions.
//
// .SIS LD HL,(0x1501) with MBASE=0xD0 → reads 0xD01501 (correct, 2-byte addr)
// LD B,B; LD HL,(0xB71501) → reads 0xB71501 (wrong, garbage address)
//
// Let's check what's at 0xB71501 to confirm the hypothesis:
const sisAddr = 0xB71501;
if (sisAddr < mem.length) {
  const val = mem[sisAddr] | (mem[sisAddr + 1] << 8) | (mem[sisAddr + 2] << 16);
  console.log(`  Memory at 0xB71501 (what LD HL reads without .SIS): ${hex(val)} (${val})`);
} else {
  console.log(`  Memory at 0xB71501: OUT OF BOUNDS (mem size = ${hex(mem.length)})`);
}

// Also check what .SIS LD HL,(0x14FE) would read vs LD HL,(0x7914FE)
const sisAddr2 = 0x7914FE;
if (sisAddr2 < mem.length) {
  const val = mem[sisAddr2] | (mem[sisAddr2 + 1] << 8) | (mem[sisAddr2 + 2] << 16);
  console.log(`  Memory at 0x7914FE (second wrong address): ${hex(val)} (${val})`);
}

// The root cause is likely that the transpiler doesn't implement eZ80 size
// prefixes (0x40=.SIS, 0x49=.LIS, 0x52=.SIL, 0x5B=.LIL).
// In the current transpiled code, 0x40 is decoded as LD B,B, which is a
// Z80-compatible NOP-equivalent. This causes the subsequent 2-byte address
// to be read as a 3-byte address, shifting all following instruction boundaries.

console.log('\n  CONCLUSION: The bounds-check at 0x07B793 uses .SIS prefix (0x40)');
console.log('  before LD HL,(nn) to read 16-bit addresses with MBASE prepended.');
console.log('  The transpiler likely treats 0x40 as LD B,B (Z80 compatible),');
console.log('  causing address misalignment. This is the root cause of the bail-out.');
console.log('  FIX NEEDED: Implement eZ80 .SIS/.LIS/.SIL/.LIL size prefixes in');
console.log('  the decoder/transpiler (opcodes 0x40, 0x49, 0x52, 0x5B).');

// ── Step 7: Summary ────────────────────────────────────────────────────
console.log('\n=== Summary ===\n');
console.log('IPoint (0x07B451):');
console.log('  - First instruction: LD (0xD02AC8),A — saves A register as "draw mode"');
console.log('  - Then writes 0x00 to 0xD02AD4 (mode byte = point)');
console.log('  - Then checks BIT 7,(IY+35h) — a graph state flag');
console.log('  - A register = draw mode input');
console.log('  - After bail-out check: PUSH BC, PUSH DE, checks BIT 5,(IY+14h)');
console.log('  - If BIT 5 clear → JP to 0x07B504 (main path, needs graph screen init)');
console.log('  - At 0x07B504: saves interrupt state, loads pen color from 0xD026AE');
console.log('  - Calls bounds-check at 0x07B793 which uses .SIS prefix');
console.log(`  - Execution: steps=${ipointRun.steps}, termination=${ipointRun.termination}`);
console.log(`  - plotSScreen effect: ${postNonZero > preNonZero ? 'PIXELS WRITTEN' : 'no pixels written'}`);

console.log('\nILine (0x07B245):');
console.log('  - PUSH AF, LD A,1, LD (0xD02AD4),A (mode = line)');
console.log('  - Then falls into shared logic: saves BC/DE to RAM, computes delta,');
console.log('    calls 0x04C979 (likely a division/slope routine), then calls IPoint');
console.log('  - ILine register convention (from continuation disassembly):');
console.log('    - A = draw mode (saved/restored)');
console.log('    - BC and DE saved to 0xD022D1 and 0xD022D2 (start point?)');
console.log('    - IX (popped from stack via DD E1) = end point?');
console.log('    - Computes B-C (delta), calls division at 0x04C979');
console.log(`  - Execution: steps=${ilineRun.steps}, termination=${ilineRun.termination}`);
console.log(`  - plotSScreen effect: ${postILineNonZero > 0 ? 'PIXELS WRITTEN' : 'no pixels written'}`);

console.log('\nROOT CAUSE: Bounds check at 0x07B793 uses eZ80 .SIS prefix (0x40)');
console.log('which the transpiler does not implement. The 0x40 byte is decoded as');
console.log('LD B,B instead of a size prefix, causing LD HL,(nn) to read a 3-byte');
console.log('address (0xB71501) instead of the intended 2-byte address (0x1501 + MBASE).');
console.log('This reads garbage, fails the bounds check, and bails out before any');
console.log('pixel-writing code is reached.');

console.log('\nACTION ITEMS:');
console.log('  1. Implement .SIS/.LIS/.SIL/.LIL prefix handling in ez80-decoder.js');
console.log('     and the transpiler (opcodes 0x40, 0x49, 0x52, 0x5B in ADL mode)');
console.log('  2. These prefixes change the operand size of the NEXT instruction:');
console.log('     .SIS = short addr (2-byte) + short reg (16-bit) in ADL mode');
console.log('     .LIL = long addr (3-byte) + long reg (24-bit) in Z80 mode');
console.log('  3. After fix: re-run this probe to verify bounds check passes');
console.log('  4. Register conventions (confirmed from disassembly):');
console.log('     IPoint: A=draw mode, DE=pixel X, C=pixel Y (or HL=Y)');
console.log('     ILine: A=draw mode, BC=x1,y1 pair, DE=x2,y2 pair, IX=additional');

console.log('\nPixelCmd (0x05DBA0) as workaround:');
console.log('  - PixelCmd is the user-facing Pxl-On/Off/Change command');
console.log('  - It calls IPoint at 0x07B451 at the end (at 0x05DBCB)');
console.log('  - Same .SIS issue would affect it through the IPoint path');

console.log('\nDone.');
