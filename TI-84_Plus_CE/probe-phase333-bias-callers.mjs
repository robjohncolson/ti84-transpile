#!/usr/bin/env node
/**
 * Phase 333 — Map the 5 Callers of glyph_add_bias (0x053396)
 *
 * Callers: 0x052569, 0x0546BD, 0x0546E3, 0x054770, 0x054796
 * For each caller:
 *   1. Find the CALL 0x053396 instruction (CD 96 33 05) in the ROM near the caller
 *   2. Dump context bytes around the CALL
 *   3. Disassemble before/after
 *   4. Trace execution from caller to see what blocks are hit
 *   5. Check what VRAM region is targeted (row 0-9 = status bar, 10+ = main area)
 *   6. Categorize: home screen text, status bar, menu, graph, cursor, or other
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase333-report.md');
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STACK_RESET_TOP = 0xD1A87E;
const STAGE_ENTRIES = [0x0A2B72, 0x0A3301, 0x0A29EC, 0x0A2854];

const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;

const CALLERS = [
  { addr: 0x052569, name: 'caller_052569' },
  { addr: 0x0546BD, name: 'caller_0546BD' },
  { addr: 0x0546E3, name: 'caller_0546E3' },
  { addr: 0x054770, name: 'caller_054770' },
  { addr: 0x054796, name: 'caller_054796' },
];

const TARGET_CALL = 0x053396; // glyph_add_bias
const CALL_BYTES = [0xCD, 0x96, 0x33, 0x05]; // CALL 0x053396 in ADL mode

function hex(v, w = 6) {
  if (v === undefined || v === null) return 'n/a';
  return `0x${(v >>> 0).toString(16).padStart(w, '0')}`;
}

function read24(buf, off) {
  return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16);
}

// ─── Find CALL instruction near each caller address ─────────────────
function findCallNear(addr, searchRange = 64) {
  const start = Math.max(0, addr - searchRange);
  const end = Math.min(romBytes.length - 4, addr + searchRange);

  for (let i = start; i <= end; i++) {
    if (romBytes[i] === CALL_BYTES[0] &&
        romBytes[i + 1] === CALL_BYTES[1] &&
        romBytes[i + 2] === CALL_BYTES[2] &&
        romBytes[i + 3] === CALL_BYTES[3]) {
      return i;
    }
  }
  return null;
}

// ─── Simple eZ80 disassembler for context ───────────────────────────
function disasmContext(startAddr, count) {
  const lines = [];
  let pc = startAddr;

  for (let i = 0; i < count && pc < romBytes.length - 4; i++) {
    const b0 = romBytes[pc];
    const b1 = romBytes[pc + 1];
    const b2 = romBytes[pc + 2];
    const b3 = romBytes[pc + 3];

    // Recognize common patterns
    if (b0 === 0xCD) {
      // CALL nn (4 bytes in ADL)
      const target = b1 | (b2 << 8) | (b3 << 16);
      lines.push(`${hex(pc)}  CALL ${hex(target)}  [${[b0,b1,b2,b3].map(x=>x.toString(16).padStart(2,'0')).join(' ')}]`);
      pc += 4;
    } else if (b0 === 0xC9) {
      lines.push(`${hex(pc)}  RET  [c9]`);
      pc += 1;
    } else if (b0 === 0xC5) {
      lines.push(`${hex(pc)}  PUSH BC  [c5]`);
      pc += 1;
    } else if (b0 === 0xD5) {
      lines.push(`${hex(pc)}  PUSH DE  [d5]`);
      pc += 1;
    } else if (b0 === 0xE5) {
      lines.push(`${hex(pc)}  PUSH HL  [e5]`);
      pc += 1;
    } else if (b0 === 0xF5) {
      lines.push(`${hex(pc)}  PUSH AF  [f5]`);
      pc += 1;
    } else if (b0 === 0xC1) {
      lines.push(`${hex(pc)}  POP BC  [c1]`);
      pc += 1;
    } else if (b0 === 0xD1) {
      lines.push(`${hex(pc)}  POP DE  [d1]`);
      pc += 1;
    } else if (b0 === 0xE1) {
      lines.push(`${hex(pc)}  POP HL  [e1]`);
      pc += 1;
    } else if (b0 === 0xF1) {
      lines.push(`${hex(pc)}  POP AF  [f1]`);
      pc += 1;
    } else if (b0 === 0xDD && b1 === 0xE5) {
      lines.push(`${hex(pc)}  PUSH IX  [dd e5]`);
      pc += 2;
    } else if (b0 === 0xDD && b1 === 0xE1) {
      lines.push(`${hex(pc)}  POP IX  [dd e1]`);
      pc += 2;
    } else if (b0 === 0xFD && b1 === 0xE5) {
      lines.push(`${hex(pc)}  PUSH IY  [fd e5]`);
      pc += 2;
    } else if (b0 === 0xFD && b1 === 0xE1) {
      lines.push(`${hex(pc)}  POP IY  [fd e1]`);
      pc += 2;
    } else if (b0 === 0x01) {
      // LD BC, nn (4 bytes in ADL)
      const val = b1 | (b2 << 8) | (b3 << 16);
      lines.push(`${hex(pc)}  LD BC, ${hex(val)}  [${[b0,b1,b2,b3].map(x=>x.toString(16).padStart(2,'0')).join(' ')}]`);
      pc += 4;
    } else if (b0 === 0x11) {
      const val = b1 | (b2 << 8) | (b3 << 16);
      lines.push(`${hex(pc)}  LD DE, ${hex(val)}  [${[b0,b1,b2,b3].map(x=>x.toString(16).padStart(2,'0')).join(' ')}]`);
      pc += 4;
    } else if (b0 === 0x21) {
      const val = b1 | (b2 << 8) | (b3 << 16);
      lines.push(`${hex(pc)}  LD HL, ${hex(val)}  [${[b0,b1,b2,b3].map(x=>x.toString(16).padStart(2,'0')).join(' ')}]`);
      pc += 4;
    } else if (b0 === 0xDD && b1 === 0x21) {
      const val = b2 | (b3 << 8) | (romBytes[pc + 4] << 16);
      lines.push(`${hex(pc)}  LD IX, ${hex(val)}  [dd 21 ${b2.toString(16).padStart(2,'0')} ${b3.toString(16).padStart(2,'0')} ${romBytes[pc+4].toString(16).padStart(2,'0')}]`);
      pc += 5;
    } else if (b0 === 0x3A) {
      const addr = b1 | (b2 << 8) | (b3 << 16);
      lines.push(`${hex(pc)}  LD A, (${hex(addr)})  [${[b0,b1,b2,b3].map(x=>x.toString(16).padStart(2,'0')).join(' ')}]`);
      pc += 4;
    } else if (b0 === 0x2A) {
      const addr = b1 | (b2 << 8) | (b3 << 16);
      lines.push(`${hex(pc)}  LD HL, (${hex(addr)})  [${[b0,b1,b2,b3].map(x=>x.toString(16).padStart(2,'0')).join(' ')}]`);
      pc += 4;
    } else if (b0 === 0xC3) {
      const target = b1 | (b2 << 8) | (b3 << 16);
      lines.push(`${hex(pc)}  JP ${hex(target)}  [${[b0,b1,b2,b3].map(x=>x.toString(16).padStart(2,'0')).join(' ')}]`);
      pc += 4;
    } else if (b0 === 0xCA) {
      const target = b1 | (b2 << 8) | (b3 << 16);
      lines.push(`${hex(pc)}  JP Z, ${hex(target)}  [${[b0,b1,b2,b3].map(x=>x.toString(16).padStart(2,'0')).join(' ')}]`);
      pc += 4;
    } else if (b0 === 0xC2) {
      const target = b1 | (b2 << 8) | (b3 << 16);
      lines.push(`${hex(pc)}  JP NZ, ${hex(target)}  [${[b0,b1,b2,b3].map(x=>x.toString(16).padStart(2,'0')).join(' ')}]`);
      pc += 4;
    } else if (b0 === 0xDD && b1 === 0x46) {
      // LD B, (IX+d)
      lines.push(`${hex(pc)}  LD B, (IX+${b2})  [dd 46 ${b2.toString(16).padStart(2,'0')}]`);
      pc += 3;
    } else if (b0 === 0xDD && b1 === 0x4E) {
      lines.push(`${hex(pc)}  LD C, (IX+${b2})  [dd 4e ${b2.toString(16).padStart(2,'0')}]`);
      pc += 3;
    } else if (b0 === 0xDD && b1 === 0x56) {
      lines.push(`${hex(pc)}  LD D, (IX+${b2})  [dd 56 ${b2.toString(16).padStart(2,'0')}]`);
      pc += 3;
    } else if (b0 === 0xDD && b1 === 0x5E) {
      lines.push(`${hex(pc)}  LD E, (IX+${b2})  [dd 5e ${b2.toString(16).padStart(2,'0')}]`);
      pc += 3;
    } else if (b0 === 0xDD && b1 === 0x66) {
      lines.push(`${hex(pc)}  LD H, (IX+${b2})  [dd 66 ${b2.toString(16).padStart(2,'0')}]`);
      pc += 3;
    } else if (b0 === 0xDD && b1 === 0x6E) {
      lines.push(`${hex(pc)}  LD L, (IX+${b2})  [dd 6e ${b2.toString(16).padStart(2,'0')}]`);
      pc += 3;
    } else if (b0 === 0xDD && b1 === 0x7E) {
      lines.push(`${hex(pc)}  LD A, (IX+${b2})  [dd 7e ${b2.toString(16).padStart(2,'0')}]`);
      pc += 3;
    } else if (b0 === 0xDD && b1 === 0x77) {
      lines.push(`${hex(pc)}  LD (IX+${b2}), A  [dd 77 ${b2.toString(16).padStart(2,'0')}]`);
      pc += 3;
    } else if (b0 === 0xDD && b1 === 0x75) {
      lines.push(`${hex(pc)}  LD (IX+${b2}), L  [dd 75 ${b2.toString(16).padStart(2,'0')}]`);
      pc += 3;
    } else if (b0 === 0xDD && b1 === 0x74) {
      lines.push(`${hex(pc)}  LD (IX+${b2}), H  [dd 74 ${b2.toString(16).padStart(2,'0')}]`);
      pc += 3;
    } else if (b0 === 0xDD && b1 === 0x71) {
      lines.push(`${hex(pc)}  LD (IX+${b2}), C  [dd 71 ${b2.toString(16).padStart(2,'0')}]`);
      pc += 3;
    } else if (b0 === 0xDD && b1 === 0x70) {
      lines.push(`${hex(pc)}  LD (IX+${b2}), B  [dd 70 ${b2.toString(16).padStart(2,'0')}]`);
      pc += 3;
    } else if (b0 === 0xED && b1 === 0x65) {
      lines.push(`${hex(pc)}  NOP(ed65)  [ed 65]`);
      pc += 2;
    } else if (b0 === 0xFB) {
      lines.push(`${hex(pc)}  EI  [fb]`);
      pc += 1;
    } else if (b0 === 0x00) {
      lines.push(`${hex(pc)}  NOP  [00]`);
      pc += 1;
    } else if (b0 === 0xB7) {
      lines.push(`${hex(pc)}  OR A  [b7]`);
      pc += 1;
    } else if (b0 === 0xAF) {
      lines.push(`${hex(pc)}  XOR A  [af]`);
      pc += 1;
    } else if (b0 === 0xED && b1 === 0x42) {
      lines.push(`${hex(pc)}  SBC HL, BC  [ed 42]`);
      pc += 2;
    } else if (b0 === 0xED && b1 === 0x52) {
      lines.push(`${hex(pc)}  SBC HL, DE  [ed 52]`);
      pc += 2;
    } else if (b0 === 0x09) {
      lines.push(`${hex(pc)}  ADD HL, BC  [09]`);
      pc += 1;
    } else if (b0 === 0x19) {
      lines.push(`${hex(pc)}  ADD HL, DE  [19]`);
      pc += 1;
    } else if (b0 === 0x29) {
      lines.push(`${hex(pc)}  ADD HL, HL  [29]`);
      pc += 1;
    } else if (b0 === 0xDD && b1 === 0x09) {
      lines.push(`${hex(pc)}  ADD IX, BC  [dd 09]`);
      pc += 2;
    } else if (b0 === 0xDD && b1 === 0x19) {
      lines.push(`${hex(pc)}  ADD IX, DE  [dd 19]`);
      pc += 2;
    } else if (b0 === 0xDD && b1 === 0x39) {
      lines.push(`${hex(pc)}  ADD IX, SP  [dd 39]`);
      pc += 2;
    } else if (b0 === 0x18) {
      const offset = b1 >= 128 ? b1 - 256 : b1;
      const target = pc + 2 + offset;
      lines.push(`${hex(pc)}  JR ${hex(target)}  [18 ${b1.toString(16).padStart(2,'0')}]  ; offset=${offset}`);
      pc += 2;
    } else if (b0 === 0x20) {
      const offset = b1 >= 128 ? b1 - 256 : b1;
      const target = pc + 2 + offset;
      lines.push(`${hex(pc)}  JR NZ, ${hex(target)}  [20 ${b1.toString(16).padStart(2,'0')}]  ; offset=${offset}`);
      pc += 2;
    } else if (b0 === 0x28) {
      const offset = b1 >= 128 ? b1 - 256 : b1;
      const target = pc + 2 + offset;
      lines.push(`${hex(pc)}  JR Z, ${hex(target)}  [28 ${b1.toString(16).padStart(2,'0')}]  ; offset=${offset}`);
      pc += 2;
    } else if (b0 === 0x38) {
      const offset = b1 >= 128 ? b1 - 256 : b1;
      const target = pc + 2 + offset;
      lines.push(`${hex(pc)}  JR C, ${hex(target)}  [38 ${b1.toString(16).padStart(2,'0')}]  ; offset=${offset}`);
      pc += 2;
    } else if (b0 === 0x30) {
      const offset = b1 >= 128 ? b1 - 256 : b1;
      const target = pc + 2 + offset;
      lines.push(`${hex(pc)}  JR NC, ${hex(target)}  [30 ${b1.toString(16).padStart(2,'0')}]  ; offset=${offset}`);
      pc += 2;
    } else if (b0 === 0xFE) {
      lines.push(`${hex(pc)}  CP ${hex(b1, 2)}  [fe ${b1.toString(16).padStart(2,'0')}]`);
      pc += 2;
    } else if (b0 === 0x3E) {
      lines.push(`${hex(pc)}  LD A, ${hex(b1, 2)}  [3e ${b1.toString(16).padStart(2,'0')}]`);
      pc += 2;
    } else if (b0 === 0x06) {
      lines.push(`${hex(pc)}  LD B, ${hex(b1, 2)}  [06 ${b1.toString(16).padStart(2,'0')}]`);
      pc += 2;
    } else if (b0 === 0x0E) {
      lines.push(`${hex(pc)}  LD C, ${hex(b1, 2)}  [0e ${b1.toString(16).padStart(2,'0')}]`);
      pc += 2;
    } else if (b0 === 0x32) {
      const addr = b1 | (b2 << 8) | (b3 << 16);
      lines.push(`${hex(pc)}  LD (${hex(addr)}), A  [${[b0,b1,b2,b3].map(x=>x.toString(16).padStart(2,'0')).join(' ')}]`);
      pc += 4;
    } else if (b0 === 0x22) {
      const addr = b1 | (b2 << 8) | (b3 << 16);
      lines.push(`${hex(pc)}  LD (${hex(addr)}), HL  [${[b0,b1,b2,b3].map(x=>x.toString(16).padStart(2,'0')).join(' ')}]`);
      pc += 4;
    } else if (b0 === 0xED && b1 === 0x43) {
      const addr = b2 | (b3 << 8) | (romBytes[pc + 4] << 16);
      lines.push(`${hex(pc)}  LD (${hex(addr)}), BC  [ed 43 ${b2.toString(16).padStart(2,'0')} ${b3.toString(16).padStart(2,'0')} ${romBytes[pc+4].toString(16).padStart(2,'0')}]`);
      pc += 5;
    } else if (b0 === 0xED && b1 === 0x4B) {
      const addr = b2 | (b3 << 8) | (romBytes[pc + 4] << 16);
      lines.push(`${hex(pc)}  LD BC, (${hex(addr)})  [ed 4b ${b2.toString(16).padStart(2,'0')} ${b3.toString(16).padStart(2,'0')} ${romBytes[pc+4].toString(16).padStart(2,'0')}]`);
      pc += 5;
    } else if (b0 === 0xED && b1 === 0x5B) {
      const addr = b2 | (b3 << 8) | (romBytes[pc + 4] << 16);
      lines.push(`${hex(pc)}  LD DE, (${hex(addr)})  [ed 5b ${b2.toString(16).padStart(2,'0')} ${b3.toString(16).padStart(2,'0')} ${romBytes[pc+4].toString(16).padStart(2,'0')}]`);
      pc += 5;
    } else if (b0 === 0xDD && b1 === 0x2A) {
      const addr = b2 | (b3 << 8) | (romBytes[pc + 4] << 16);
      lines.push(`${hex(pc)}  LD IX, (${hex(addr)})  [dd 2a ${b2.toString(16).padStart(2,'0')} ${b3.toString(16).padStart(2,'0')} ${romBytes[pc+4].toString(16).padStart(2,'0')}]`);
      pc += 5;
    } else {
      // Unknown - just dump the byte
      lines.push(`${hex(pc)}  DB ${hex(b0, 2)}  [${b0.toString(16).padStart(2,'0')}]`);
      pc += 1;
    }
  }

  return { lines, endPc: pc };
}

// ─── Dump raw ROM bytes ─────────────────────────────────────────────
function dumpRomBytes(addr, count) {
  const bytes = [];
  for (let i = 0; i < count; i++) {
    bytes.push(romBytes[addr + i]);
  }
  return bytes.map(b => b.toString(16).padStart(2, '0')).join(' ');
}

// ─── Boot to home screen ────────────────────────────────────────────
function bootToHomeScreen() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Cold boot
  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  // Kernel init
  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  // Post init
  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  // Run all 4 stages
  for (const entry of STAGE_ENTRIES) {
    cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
    cpu._iy = 0xD00080; cpu.f = 0x40; cpu._ix = 0xD1A860;
    cpu.sp = STACK_RESET_TOP - 12;
    mem.fill(0xFF, cpu.sp, cpu.sp + 12);
    executor.runFrom(entry, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });
  }

  return { mem, executor, cpu, peripherals };
}

// ─── Trace a caller with onBlock ────────────────────────────────────
function traceCaller(executor, cpu, mem, callerAddr, label) {
  const blocks = [];
  const vramWrites = [];

  // Save VRAM state before trace
  const vramBefore = new Uint8Array(VRAM_WIDTH * 240 * 2);
  vramBefore.set(mem.slice(VRAM_BASE, VRAM_BASE + VRAM_WIDTH * 240 * 2));

  // Set up clean call frame
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu._iy = 0xD00080; cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - 3;
  mem[cpu.sp] = 0xFE; mem[cpu.sp + 1] = 0xFE; mem[cpu.sp + 2] = 0xFE;

  const result = executor.runFrom(callerAddr, 'adl', {
    maxSteps: 5000,
    onBlock: (pc, mode, meta, steps) => {
      blocks.push({ pc, mode, steps });
    },
  });

  // Check VRAM changes after trace
  const vramAfter = mem.slice(VRAM_BASE, VRAM_BASE + VRAM_WIDTH * 240 * 2);
  let minRow = 240, maxRow = -1, minCol = 320, maxCol = -1;
  let changedPixels = 0;

  for (let row = 0; row < 240; row++) {
    for (let col = 0; col < VRAM_WIDTH; col++) {
      const offset = (row * VRAM_WIDTH + col) * 2;
      const before = vramBefore[offset] | (vramBefore[offset + 1] << 8);
      const after = vramAfter[offset] | (vramAfter[offset + 1] << 8);
      if (before !== after) {
        changedPixels++;
        if (row < minRow) minRow = row;
        if (row > maxRow) maxRow = row;
        if (col < minCol) minCol = col;
        if (col > maxCol) maxCol = col;
      }
    }
  }

  return {
    label,
    callerAddr,
    result,
    blocks,
    vram: {
      changedPixels,
      minRow: maxRow >= 0 ? minRow : null,
      maxRow: maxRow >= 0 ? maxRow : null,
      minCol: maxCol >= 0 ? minCol : null,
      maxCol: maxCol >= 0 ? maxCol : null,
    },
  };
}

// ─── Categorize based on VRAM region and call context ───────────────
function categorize(vram, blocks, callContext) {
  if (vram.changedPixels === 0) {
    // No VRAM changes — likely a measurement/layout helper
    return 'measurement/layout (no VRAM writes)';
  }

  if (vram.minRow !== null && vram.maxRow !== null) {
    if (vram.maxRow <= 35) {
      return 'status bar renderer';
    }
    if (vram.minRow >= 220) {
      return 'entry line / cursor';
    }
    if (vram.minRow >= 36 && vram.maxRow <= 219) {
      return 'home screen main area';
    }
    return `mixed region (rows ${vram.minRow}-${vram.maxRow})`;
  }

  return 'unknown';
}

// ─── Scan surrounding function for RAM address references ───────────
function scanForRAMRefs(addr, range = 128) {
  const refs = [];
  const start = Math.max(0, addr - range);
  const end = Math.min(romBytes.length - 4, addr + range);

  for (let i = start; i <= end; i++) {
    // Look for 3-byte addresses in the D0xxxx-D4xxxx range
    if (i + 2 < romBytes.length) {
      const val = romBytes[i] | (romBytes[i + 1] << 8) | (romBytes[i + 2] << 16);
      if (val >= 0xD00000 && val < 0xD50000) {
        // Check if preceded by a load/store opcode
        if (i > 0) {
          const prevByte = romBytes[i - 1];
          if ([0x3A, 0x2A, 0x32, 0x22, 0x01, 0x11, 0x21].includes(prevByte)) {
            refs.push({ offset: i - 1, addr: val, opcode: hex(prevByte, 2) });
          }
          // ED-prefixed loads
          if (i > 1 && romBytes[i - 2] === 0xED) {
            refs.push({ offset: i - 2, addr: val, opcode: `ed ${hex(romBytes[i-1], 2)}` });
          }
        }
      }
    }
  }

  return refs;
}

// ─── Main ───────────────────────────────────────────────────────────
async function main() {
  console.log('=== Phase 333 — Map the 5 Callers of glyph_add_bias (0x053396) ===');
  console.log('');

  const reportLines = [];
  reportLines.push('# Phase 333 — Map the 5 Callers of glyph_add_bias (0x053396)');
  reportLines.push('');
  reportLines.push('Generated by `probe-phase333-bias-callers.mjs`.');
  reportLines.push('');

  // ── Step 1: Find CALL instructions and dump context ──────────────
  console.log('--- Step 1: Locate CALL 0x053396 (CD 96 33 05) near each caller ---');
  reportLines.push('## 1. CALL Instruction Locations');
  reportLines.push('');

  for (const caller of CALLERS) {
    const callOffset = findCallNear(caller.addr, 64);
    caller.callOffset = callOffset;

    if (callOffset !== null) {
      console.log(`  ${caller.name} (${hex(caller.addr)}): CALL found at ${hex(callOffset)}, delta=${callOffset - caller.addr}`);
      reportLines.push(`### ${caller.name} — ${hex(caller.addr)}`);
      reportLines.push('');
      reportLines.push(`CALL 0x053396 found at: ${hex(callOffset)} (delta from caller addr: ${callOffset - caller.addr})`);
      reportLines.push('');

      // Dump 50 bytes before and 50 after the CALL
      const dumpStart = Math.max(0, callOffset - 50);
      const dumpEnd = Math.min(romBytes.length, callOffset + 54);
      reportLines.push(`Raw bytes [${hex(dumpStart)}..${hex(dumpEnd)}]:`);
      reportLines.push('```');
      for (let off = dumpStart; off < dumpEnd; off += 16) {
        const chunk = Math.min(16, dumpEnd - off);
        const bytes = [];
        for (let j = 0; j < chunk; j++) bytes.push(romBytes[off + j].toString(16).padStart(2, '0'));
        reportLines.push(`${hex(off)}  ${bytes.join(' ')}`);
      }
      reportLines.push('```');
      reportLines.push('');

      // Disassemble context before CALL
      const beforeStart = Math.max(0, callOffset - 30);
      reportLines.push(`Disassembly before CALL (from ${hex(beforeStart)}):`);
      reportLines.push('```');
      const beforeDisasm = disasmContext(beforeStart, 20);
      for (const line of beforeDisasm.lines) {
        if (parseInt(line.substring(2, 8), 16) >= callOffset) break;
        reportLines.push(line);
      }
      reportLines.push(`>>> ${hex(callOffset)}  CALL 0x053396  [cd 96 33 05]  <<<`);
      reportLines.push('```');
      reportLines.push('');

      // Disassemble context after CALL
      const afterStart = callOffset + 4;
      reportLines.push(`Disassembly after CALL (from ${hex(afterStart)}):`);
      reportLines.push('```');
      const afterDisasm = disasmContext(afterStart, 15);
      for (const line of afterDisasm.lines) reportLines.push(line);
      reportLines.push('```');
      reportLines.push('');

      // Scan for RAM references in the surrounding function
      const ramRefs = scanForRAMRefs(callOffset, 80);
      if (ramRefs.length > 0) {
        reportLines.push('RAM references within +/-80 bytes:');
        for (const ref of ramRefs) {
          let label = '';
          if (ref.addr === 0xD005E9) label = ' (DrawChar vtable)';
          else if (ref.addr === 0xD005EC) label = ' (scale_level)';
          else if (ref.addr === 0xD005ED) label = ' (font_metric_config)';
          else if (ref.addr === 0xD005F0) label = ' (scale_record_ptr)';
          else if (ref.addr >= 0xD40000) label = ' (VRAM)';
          else if (ref.addr === 0xD000C6) label = ' (bpp_flag)';
          else if (ref.addr === 0xD006C0) label = ' (display buffer)';
          reportLines.push(`  ${hex(ref.offset)}: ${ref.opcode} → ${hex(ref.addr)}${label}`);
        }
        reportLines.push('');
      }
    } else {
      console.log(`  ${caller.name} (${hex(caller.addr)}): CALL NOT FOUND within +/-64 bytes!`);
      reportLines.push(`### ${caller.name} — ${hex(caller.addr)}`);
      reportLines.push('');
      reportLines.push('**CALL 0x053396 not found within search range!**');
      reportLines.push('');

      // Dump raw bytes around the address anyway
      reportLines.push(`Raw bytes [${hex(caller.addr - 16)}..${hex(caller.addr + 48)}]:`);
      reportLines.push('```');
      reportLines.push(dumpRomBytes(caller.addr - 16, 64));
      reportLines.push('```');
      reportLines.push('');

      // Disassemble from the address
      reportLines.push(`Disassembly from ${hex(caller.addr)}:`);
      reportLines.push('```');
      const disasm = disasmContext(caller.addr, 20);
      for (const line of disasm.lines) reportLines.push(line);
      reportLines.push('```');
      reportLines.push('');
    }
  }

  console.log('');

  // ── Step 2: Boot to home screen ──────────────────────────────────
  console.log('--- Step 2: Boot to home screen ---');
  const { mem, executor, cpu, peripherals } = bootToHomeScreen();
  console.log('  Home screen boot complete');
  console.log('');

  // ── Step 3: Trace each caller ────────────────────────────────────
  console.log('--- Step 3: Trace each caller with onBlock ---');
  reportLines.push('## 2. Execution Traces');
  reportLines.push('');

  // Save full state for restoration between traces
  const savedRam = new Uint8Array(mem.slice(0x400000, 0xE00000));
  const savedCpuFields = [
    'a','f','_bc','_de','_hl','_a2','_f2','_bc2','_de2','_hl2',
    'sp','_ix','_iy','i','im','iff1','iff2','madl','mbase','halted','cycles',
  ];

  function saveCpu() {
    return Object.fromEntries(savedCpuFields.map(f => [f, cpu[f]]));
  }
  function restoreCpuState(snap) {
    for (const [f, v] of Object.entries(snap)) cpu[f] = v;
  }

  const cpuSnap = saveCpu();

  for (const caller of CALLERS) {
    // Restore state before each trace
    mem.set(savedRam, 0x400000);
    restoreCpuState(cpuSnap);

    console.log(`  Tracing ${caller.name} (${hex(caller.addr)})...`);
    const trace = traceCaller(executor, cpu, mem, caller.addr, caller.name);

    // Categorize
    const category = categorize(trace.vram, trace.blocks, null);
    caller.trace = trace;
    caller.category = category;

    console.log(`    steps=${trace.result.steps} term=${trace.result.termination} lastPc=${hex(trace.result.lastPc)}`);
    console.log(`    VRAM: ${trace.vram.changedPixels} changed pixels, rows ${trace.vram.minRow ?? 'n/a'}-${trace.vram.maxRow ?? 'n/a'}, cols ${trace.vram.minCol ?? 'n/a'}-${trace.vram.maxCol ?? 'n/a'}`);
    console.log(`    Category: ${category}`);

    // Check which key blocks were hit
    const keyBlocks = trace.blocks.filter(b =>
      b.pc === 0x053396 || b.pc === 0x0522B2 || b.pc === 0x0533BD ||
      b.pc === 0x053573 || b.pc === 0x0536A0 || b.pc === 0x053540 ||
      b.pc === 0x05354C || b.pc === 0x055191
    );

    console.log(`    Key blocks hit: ${keyBlocks.map(b => hex(b.pc)).join(', ') || 'none'}`);

    reportLines.push(`### ${caller.name} — ${hex(caller.addr)}`);
    reportLines.push('');
    reportLines.push(`- Steps: ${trace.result.steps}`);
    reportLines.push(`- Termination: ${trace.result.termination}`);
    reportLines.push(`- Last PC: ${hex(trace.result.lastPc)}`);
    reportLines.push(`- VRAM changes: ${trace.vram.changedPixels} pixels`);
    if (trace.vram.minRow !== null) {
      reportLines.push(`- VRAM region: rows ${trace.vram.minRow}-${trace.vram.maxRow}, cols ${trace.vram.minCol}-${trace.vram.maxCol}`);
    }
    reportLines.push(`- **Category: ${category}**`);
    reportLines.push('');

    // Block trace (first 30 unique PCs)
    const seenPcs = new Set();
    const uniqueBlocks = [];
    for (const b of trace.blocks) {
      if (!seenPcs.has(b.pc)) {
        seenPcs.add(b.pc);
        uniqueBlocks.push(b);
      }
    }

    reportLines.push('Block trace (unique PCs, first 30):');
    reportLines.push('```');
    for (const b of uniqueBlocks.slice(0, 30)) {
      let label = '';
      if (b.pc === 0x053396) label = ' ← glyph_add_bias';
      else if (b.pc === 0x0522B2) label = ' ← add_5bytes_adc';
      else if (b.pc === 0x0533BD) label = ' ← scaler_validate_and_setup';
      else if (b.pc === 0x053573) label = ' ← scale_kernel_dispatch';
      else if (b.pc === 0x0536A0) label = ' ← output_row_loop';
      else if (b.pc === 0x053540) label = ' ← scale_config_store';
      else if (b.pc === 0x05354C) label = ' ← scale_config_load';
      else if (b.pc === 0x055191) label = ' ← lazy_init';
      reportLines.push(`  ${hex(b.pc)} (${b.mode})${label}`);
    }
    reportLines.push('```');
    reportLines.push('');

    if (keyBlocks.length > 0) {
      reportLines.push('Key glyph pipeline blocks hit:');
      for (const b of keyBlocks) {
        reportLines.push(`  - ${hex(b.pc)}`);
      }
      reportLines.push('');
    }
  }

  // ── Step 4: Summary categorization ───────────────────────────────
  console.log('');
  console.log('--- Step 4: Summary ---');
  reportLines.push('## 3. Summary Categorization');
  reportLines.push('');
  reportLines.push('| Caller | Address | VRAM Rows | Pixels Changed | Category |');
  reportLines.push('|--------|---------|-----------|----------------|----------|');

  for (const caller of CALLERS) {
    const t = caller.trace;
    const rowRange = t.vram.minRow !== null ? `${t.vram.minRow}-${t.vram.maxRow}` : 'none';
    console.log(`  ${caller.name} (${hex(caller.addr)}): ${caller.category}`);
    reportLines.push(`| ${caller.name} | ${hex(caller.addr)} | ${rowRange} | ${t.vram.changedPixels} | ${caller.category} |`);
  }

  reportLines.push('');

  // ── Step 5: Cross-reference analysis ─────────────────────────────
  reportLines.push('## 4. Cross-Reference Analysis');
  reportLines.push('');

  // Check what function each caller is inside by looking for PUSH IX (DD E5) before
  for (const caller of CALLERS) {
    const searchStart = Math.max(0, caller.addr - 128);
    let funcStart = null;
    for (let i = caller.addr; i >= searchStart; i--) {
      if (romBytes[i] === 0xDD && romBytes[i + 1] === 0xE5) {
        funcStart = i;
        break;
      }
    }

    reportLines.push(`### ${caller.name} (${hex(caller.addr)})`);
    reportLines.push('');
    if (funcStart !== null) {
      reportLines.push(`Likely function start (PUSH IX): ${hex(funcStart)} (${caller.addr - funcStart} bytes before caller)`);
    }

    // Look for what the caller does with the return value
    if (caller.callOffset !== null) {
      const afterCall = caller.callOffset + 4;
      reportLines.push('');
      reportLines.push('Post-CALL context (what does the caller do with the biased glyph pointer?):');
      reportLines.push('```');
      const disasm = disasmContext(afterCall, 10);
      for (const line of disasm.lines) reportLines.push(line);
      reportLines.push('```');
    }
    reportLines.push('');
  }

  // ── Step 6: Broader context — check what calls each of these callers ──
  reportLines.push('## 5. Who Calls the Callers?');
  reportLines.push('');
  reportLines.push('Scanning ROM for CALL instructions targeting each caller address...');
  reportLines.push('');

  for (const caller of CALLERS) {
    const targetBytes = [
      0xCD,
      caller.addr & 0xFF,
      (caller.addr >> 8) & 0xFF,
      (caller.addr >> 16) & 0xFF,
    ];

    const upstreamCallers = [];
    for (let i = 0; i < romBytes.length - 4; i++) {
      if (romBytes[i] === targetBytes[0] &&
          romBytes[i + 1] === targetBytes[1] &&
          romBytes[i + 2] === targetBytes[2] &&
          romBytes[i + 3] === targetBytes[3]) {
        upstreamCallers.push(i);
      }
    }

    // Also check for JP instructions
    const jpTargetBytes = [
      0xC3,
      caller.addr & 0xFF,
      (caller.addr >> 8) & 0xFF,
      (caller.addr >> 16) & 0xFF,
    ];

    for (let i = 0; i < romBytes.length - 4; i++) {
      if (romBytes[i] === jpTargetBytes[0] &&
          romBytes[i + 1] === jpTargetBytes[1] &&
          romBytes[i + 2] === jpTargetBytes[2] &&
          romBytes[i + 3] === jpTargetBytes[3]) {
        upstreamCallers.push(i);
      }
    }

    upstreamCallers.sort((a, b) => a - b);

    reportLines.push(`### ${caller.name} (${hex(caller.addr)})`);
    reportLines.push('');
    if (upstreamCallers.length > 0) {
      reportLines.push(`Found ${upstreamCallers.length} upstream caller(s):`);
      for (const uc of upstreamCallers) {
        const opcode = romBytes[uc] === 0xCD ? 'CALL' : 'JP';
        reportLines.push(`  - ${hex(uc)}: ${opcode} ${hex(caller.addr)}`);
      }
    } else {
      reportLines.push('No direct CALL/JP found — may be reached via computed jump or fall-through.');
    }
    reportLines.push('');
  }

  // Write report
  const report = reportLines.join('\n') + '\n';
  fs.writeFileSync(REPORT_PATH, report);
  console.log('');
  console.log(`Report written to ${REPORT_PATH}`);
  console.log('');
  console.log('=== Phase 333 complete ===');
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}
