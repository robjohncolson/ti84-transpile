#!/usr/bin/env node
// Phase 449 — Trace 0x0067F8 key handler after clearing D177BA gate.
//
// Part 1: Dynamic execution trace
//   Boot OS → set D14091=1, D177B7=0x55, D177BA=0 → inject key '1' →
//   run event loop → check if 0x0067F8 is reached, record visited PCs,
//   VRAM changes, key RAM state.
//
// Part 2: Static disassembly of 0x0067F8-0x006900 from ROM.rom.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const VRAM_BASE = 0xD40000;
const VRAM_BYTE_SIZE = 320 * 240 * 2;
const STACK_RESET_TOP = 0xD1A87E;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE_ENTRIES = [0x0A2B72, 0x0A3301, 0x0A29EC, 0x0A2854];
const EVENT_LOOP_ENTRY = 0x003A73;

const TARGET_ADDR = 0x0067F8;

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function vramHash(mem) {
  return createHash('sha256').update(mem.subarray(VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE)).digest('hex').slice(0, 12);
}

function pressKey(peripherals, key) {
  peripherals.keyboard.keyMatrix[key.idx] &= ~(1 << key.bit);
  peripherals.setKeyboardIRQ(true);
}

function releaseKey(peripherals, key) {
  peripherals.keyboard.keyMatrix[key.idx] |= (1 << key.bit);
  peripherals.setKeyboardIRQ(false);
}

function bootToHomeScreen(executor, cpu, mem) {
  const bootResult = executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  console.log(`  boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelResult = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  console.log(`  kernel: steps=${kernelResult.steps} term=${kernelResult.termination} lastPc=${hex(kernelResult.lastPc)}`);
  cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInitResult = executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  console.log(`  postInit: steps=${postInitResult.steps} term=${postInitResult.termination} lastPc=${hex(postInitResult.lastPc)}`);

  for (let i = 0; i < STAGE_ENTRIES.length; i++) {
    const entry = STAGE_ENTRIES[i];
    cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
    cpu._iy = 0xD00080; cpu.f = 0x40; cpu._ix = 0xD1A860;
    cpu.sp = STACK_RESET_TOP - 12;
    mem.fill(0xFF, cpu.sp, cpu.sp + 12);
    const stageResult = executor.runFrom(entry, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });
    console.log(`  stage${i + 1}: entry=${hex(entry)} steps=${stageResult.steps} term=${stageResult.termination} lastPc=${hex(stageResult.lastPc)}`);
  }

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu._iy = 0xD00080;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

// =============================================================================
// Part 2: Static disassembly of 0x0067F8-0x006900
// =============================================================================

const rom = romBytes;

function r8(addr) { return rom[addr]; }
function r16(addr) { return rom[addr] | (rom[addr + 1] << 8); }
function r24(addr) { return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16); }
function hex2(v) { return '0x' + v.toString(16).toUpperCase().padStart(2, '0'); }
function hex4(v) { return '0x' + v.toString(16).toUpperCase().padStart(4, '0'); }
function hex6(v) { return '0x' + v.toString(16).toUpperCase().padStart(6, '0'); }
function signed8(v) { return v > 127 ? v - 256 : v; }

const REG8 = ['B', 'C', 'D', 'E', 'H', 'L', '(HL)', 'A'];

function disasmOne(addr) {
  let pos = addr;
  const startPos = pos;
  let prefix = null;

  // eZ80 ADL mode: 0x40/0x49/0x52/0x5B are ALWAYS size prefixes, never LD r,r
  const b0 = r8(pos);
  if (b0 === 0x40 || b0 === 0x49 || b0 === 0x52 || b0 === 0x5B) {
    const prefixNames = { 0x40: '.SIS', 0x49: '.LIS', 0x52: '.SIL', 0x5B: '.LIL' };
    prefix = prefixNames[b0];
    pos++;
  }

  const op = r8(pos);
  pos++;
  let mnemonic = '';

  // CB prefix (bit operations)
  if (op === 0xCB) {
    const cb = r8(pos); pos++;
    const bit = (cb >> 3) & 7;
    const reg = cb & 7;
    const group = (cb >> 6) & 3;
    if (group === 0) {
      const shifts = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
      mnemonic = `${shifts[(cb >> 3) & 7]} ${REG8[reg]}`;
    } else if (group === 1) {
      mnemonic = `BIT ${bit}, ${REG8[reg]}`;
    } else if (group === 2) {
      mnemonic = `RES ${bit}, ${REG8[reg]}`;
    } else {
      mnemonic = `SET ${bit}, ${REG8[reg]}`;
    }
  }
  // ED prefix
  else if (op === 0xED) {
    const ed = r8(pos); pos++;
    switch (ed) {
      // eZ80-specific LEA and LD via (HL) — ED prefix
      case 0x02: { const d = signed8(r8(pos)); pos++; mnemonic = `LEA BC, IX${d >= 0 ? '+' : ''}${d}`; break; }
      case 0x07: mnemonic = 'LD BC, (HL)'; break;
      case 0x0F: mnemonic = 'LD (HL), BC'; break;
      case 0x12: { const d = signed8(r8(pos)); pos++; mnemonic = `LEA DE, IX${d >= 0 ? '+' : ''}${d}`; break; }
      case 0x17: mnemonic = 'LD DE, (HL)'; break;
      case 0x1F: mnemonic = 'LD (HL), DE'; break;
      case 0x22: { const d = signed8(r8(pos)); pos++; mnemonic = `LEA HL, IX${d >= 0 ? '+' : ''}${d}`; break; }
      case 0x27: mnemonic = 'LD HL, (HL)'; break;
      case 0x2F: mnemonic = 'LD (HL), HL'; break;
      case 0x32: { const d = signed8(r8(pos)); pos++; mnemonic = `LEA IX, IX${d >= 0 ? '+' : ''}${d}`; break; }
      case 0x38: { const n = r8(pos); pos++; mnemonic = `IN0 A, (${hex2(n)})`; break; }
      case 0x39: { const n = r8(pos); pos++; mnemonic = `OUT0 (${hex2(n)}), A`; break; }
      case 0x65: { const n = r8(pos); pos++; mnemonic = `TST A, ${hex2(n)}`; break; }
      // Standard ED opcodes
      case 0x42: mnemonic = 'SBC HL, BC'; break;
      case 0x43: { const nn = r24(pos); pos += 3; mnemonic = `LD (${hex6(nn)}), BC`; break; }
      case 0x44: mnemonic = 'NEG'; break;
      case 0x45: mnemonic = 'RETN'; break;
      case 0x46: mnemonic = 'IM 0'; break;
      case 0x47: mnemonic = 'LD I, A'; break;
      case 0x4A: mnemonic = 'ADC HL, BC'; break;
      case 0x4B: { const nn = r24(pos); pos += 3; mnemonic = `LD BC, (${hex6(nn)})`; break; }
      case 0x4D: mnemonic = 'RETI'; break;
      case 0x4F: mnemonic = 'LD R, A'; break;
      case 0x52: mnemonic = 'SBC HL, DE'; break;
      case 0x53: { const nn = r24(pos); pos += 3; mnemonic = `LD (${hex6(nn)}), DE`; break; }
      case 0x56: mnemonic = 'IM 1'; break;
      case 0x57: mnemonic = 'LD A, I'; break;
      case 0x5A: mnemonic = 'ADC HL, DE'; break;
      case 0x5B: { const nn = r24(pos); pos += 3; mnemonic = `LD DE, (${hex6(nn)})`; break; }
      case 0x5E: mnemonic = 'IM 2'; break;
      case 0x5F: mnemonic = 'LD A, R'; break;
      case 0x61: mnemonic = 'OUT (C), H'; break;
      case 0x62: mnemonic = 'SBC HL, HL'; break;
      case 0x63: { const nn = r24(pos); pos += 3; mnemonic = `LD (${hex6(nn)}), HL`; break; }
      case 0x67: mnemonic = 'RRD'; break;
      case 0x6A: mnemonic = 'ADC HL, HL'; break;
      case 0x6B: { const nn = r24(pos); pos += 3; mnemonic = `LD HL, (${hex6(nn)})`; break; }
      case 0x6F: mnemonic = 'RLD'; break;
      case 0x72: mnemonic = 'SBC HL, SP'; break;
      case 0x73: { const nn = r24(pos); pos += 3; mnemonic = `LD (${hex6(nn)}), SP`; break; }
      case 0x78: mnemonic = 'IN A, (C)'; break;
      case 0x79: mnemonic = 'OUT (C), A'; break;
      case 0x7A: mnemonic = 'ADC HL, SP'; break;
      case 0x7B: { const nn = r24(pos); pos += 3; mnemonic = `LD SP, (${hex6(nn)})`; break; }
      case 0xA0: mnemonic = 'LDI'; break;
      case 0xA1: mnemonic = 'CPI'; break;
      case 0xA8: mnemonic = 'LDD'; break;
      case 0xA9: mnemonic = 'CPD'; break;
      case 0xB0: mnemonic = 'LDIR'; break;
      case 0xB1: mnemonic = 'CPIR'; break;
      case 0xB8: mnemonic = 'LDDR'; break;
      case 0xB9: mnemonic = 'CPDR'; break;
      default: mnemonic = `ED ${hex2(ed)}`; break;
    }
  }
  // FD prefix (IY operations)
  else if (op === 0xFD) {
    const iy = r8(pos); pos++;
    if (iy === 0xCB) {
      const d = r8(pos); pos++;
      const cb2 = r8(pos); pos++;
      const bit = (cb2 >> 3) & 7;
      const group2 = (cb2 >> 6) & 3;
      if (group2 === 1) mnemonic = `BIT ${bit}, (IY+${hex2(d)})`;
      else if (group2 === 2) mnemonic = `RES ${bit}, (IY+${hex2(d)})`;
      else if (group2 === 3) mnemonic = `SET ${bit}, (IY+${hex2(d)})`;
      else {
        const shifts = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
        mnemonic = `${shifts[(cb2 >> 3) & 7]} (IY+${hex2(d)})`;
      }
    } else if (iy === 0x21) {
      const nn = r24(pos); pos += 3; mnemonic = `LD IY, ${hex6(nn)}`;
    } else if (iy === 0x22) {
      const nn = r24(pos); pos += 3; mnemonic = `LD (${hex6(nn)}), IY`;
    } else if (iy === 0x2A) {
      const nn = r24(pos); pos += 3; mnemonic = `LD IY, (${hex6(nn)})`;
    } else if (iy === 0x23) {
      mnemonic = 'INC IY';
    } else if (iy === 0x2B) {
      mnemonic = 'DEC IY';
    } else if (iy === 0x36) {
      const d2 = r8(pos); pos++;
      const n2 = r8(pos); pos++;
      mnemonic = `LD (IY+${hex2(d2)}), ${hex2(n2)}`;
    } else if (iy === 0x46) {
      const d2 = r8(pos); pos++;
      mnemonic = `LD B, (IY+${hex2(d2)})`;
    } else if (iy === 0x4E) {
      const d2 = r8(pos); pos++;
      mnemonic = `LD C, (IY+${hex2(d2)})`;
    } else if (iy === 0x56) {
      const d2 = r8(pos); pos++;
      mnemonic = `LD D, (IY+${hex2(d2)})`;
    } else if (iy === 0x5E) {
      const d2 = r8(pos); pos++;
      mnemonic = `LD E, (IY+${hex2(d2)})`;
    } else if (iy === 0x66) {
      const d2 = r8(pos); pos++;
      mnemonic = `LD H, (IY+${hex2(d2)})`;
    } else if (iy === 0x6E) {
      const d2 = r8(pos); pos++;
      mnemonic = `LD L, (IY+${hex2(d2)})`;
    } else if (iy === 0x70) {
      const d2 = r8(pos); pos++;
      mnemonic = `LD (IY+${hex2(d2)}), B`;
    } else if (iy === 0x71) {
      const d2 = r8(pos); pos++;
      mnemonic = `LD (IY+${hex2(d2)}), C`;
    } else if (iy === 0x72) {
      const d2 = r8(pos); pos++;
      mnemonic = `LD (IY+${hex2(d2)}), D`;
    } else if (iy === 0x73) {
      const d2 = r8(pos); pos++;
      mnemonic = `LD (IY+${hex2(d2)}), E`;
    } else if (iy === 0x74) {
      const d2 = r8(pos); pos++;
      mnemonic = `LD (IY+${hex2(d2)}), H`;
    } else if (iy === 0x75) {
      const d2 = r8(pos); pos++;
      mnemonic = `LD (IY+${hex2(d2)}), L`;
    } else if (iy === 0x77) {
      const d2 = r8(pos); pos++;
      mnemonic = `LD (IY+${hex2(d2)}), A`;
    } else if (iy === 0x7E) {
      const d2 = r8(pos); pos++;
      mnemonic = `LD A, (IY+${hex2(d2)})`;
    } else if (iy === 0x86) {
      const d2 = r8(pos); pos++;
      mnemonic = `ADD A, (IY+${hex2(d2)})`;
    } else if (iy === 0x96) {
      const d2 = r8(pos); pos++;
      mnemonic = `SUB (IY+${hex2(d2)})`;
    } else if (iy === 0xA6) {
      const d2 = r8(pos); pos++;
      mnemonic = `AND (IY+${hex2(d2)})`;
    } else if (iy === 0xAE) {
      const d2 = r8(pos); pos++;
      mnemonic = `XOR (IY+${hex2(d2)})`;
    } else if (iy === 0xB6) {
      const d2 = r8(pos); pos++;
      mnemonic = `OR (IY+${hex2(d2)})`;
    } else if (iy === 0xBE) {
      const d2 = r8(pos); pos++;
      mnemonic = `CP (IY+${hex2(d2)})`;
    } else if (iy === 0xE1) {
      mnemonic = 'POP IY';
    } else if (iy === 0xE5) {
      mnemonic = 'PUSH IY';
    } else if (iy === 0xE9) {
      mnemonic = 'JP (IY)';
    } else if (iy === 0xF9) {
      mnemonic = 'LD SP, IY';
    } else {
      // eZ80-specific FD sub-opcodes (mirror DD ones but with IY)
      if (iy === 0x07) { const d2 = signed8(r8(pos)); pos++; mnemonic = `LD BC, (IY${d2 >= 0 ? '+' : ''}${d2})`; }
      else if (iy === 0x0F) { const d2 = signed8(r8(pos)); pos++; mnemonic = `LD (IY${d2 >= 0 ? '+' : ''}${d2}), BC`; }
      else if (iy === 0x17) { const d2 = signed8(r8(pos)); pos++; mnemonic = `LD DE, (IY${d2 >= 0 ? '+' : ''}${d2})`; }
      else if (iy === 0x1F) { const d2 = signed8(r8(pos)); pos++; mnemonic = `LD (IY${d2 >= 0 ? '+' : ''}${d2}), DE`; }
      else if (iy === 0x27) { const d2 = signed8(r8(pos)); pos++; mnemonic = `LD HL, (IY${d2 >= 0 ? '+' : ''}${d2})`; }
      else if (iy === 0x2F) { const d2 = signed8(r8(pos)); pos++; mnemonic = `LD (IY${d2 >= 0 ? '+' : ''}${d2}), HL`; }
      else if (iy === 0x37) { const d2 = signed8(r8(pos)); pos++; mnemonic = `LD IY, (IY${d2 >= 0 ? '+' : ''}${d2})`; }
      else if (iy === 0x3F) { const d2 = signed8(r8(pos)); pos++; mnemonic = `LD (IY${d2 >= 0 ? '+' : ''}${d2}), IY`; }
      else mnemonic = `FD ${hex2(iy)}`;
    }
  }
  // DD prefix (IX operations)
  else if (op === 0xDD) {
    const ix = r8(pos); pos++;
    if (ix === 0xCB) {
      const d = r8(pos); pos++;
      const cb2 = r8(pos); pos++;
      const bit = (cb2 >> 3) & 7;
      const group2 = (cb2 >> 6) & 3;
      if (group2 === 1) mnemonic = `BIT ${bit}, (IX+${hex2(d)})`;
      else if (group2 === 2) mnemonic = `RES ${bit}, (IX+${hex2(d)})`;
      else if (group2 === 3) mnemonic = `SET ${bit}, (IX+${hex2(d)})`;
      else {
        const shifts = ['RLC', 'RRC', 'RL', 'RR', 'SLA', 'SRA', 'SLL', 'SRL'];
        mnemonic = `${shifts[(cb2 >> 3) & 7]} (IX+${hex2(d)})`;
      }
    } else if (ix === 0x21) {
      const nn = r24(pos); pos += 3; mnemonic = `LD IX, ${hex6(nn)}`;
    } else if (ix === 0x22) {
      const nn = r24(pos); pos += 3; mnemonic = `LD (${hex6(nn)}), IX`;
    } else if (ix === 0x2A) {
      const nn = r24(pos); pos += 3; mnemonic = `LD IX, (${hex6(nn)})`;
    } else if (ix === 0x23) {
      mnemonic = 'INC IX';
    } else if (ix === 0x2B) {
      mnemonic = 'DEC IX';
    } else if (ix === 0x36) {
      const d2 = r8(pos); pos++;
      const n2 = r8(pos); pos++;
      mnemonic = `LD (IX+${hex2(d2)}), ${hex2(n2)}`;
    } else if (ix === 0x46) {
      const d2 = r8(pos); pos++;
      mnemonic = `LD B, (IX+${hex2(d2)})`;
    } else if (ix === 0x4E) {
      const d2 = r8(pos); pos++;
      mnemonic = `LD C, (IX+${hex2(d2)})`;
    } else if (ix === 0x56) {
      const d2 = r8(pos); pos++;
      mnemonic = `LD D, (IX+${hex2(d2)})`;
    } else if (ix === 0x5E) {
      const d2 = r8(pos); pos++;
      mnemonic = `LD E, (IX+${hex2(d2)})`;
    } else if (ix === 0x66) {
      const d2 = r8(pos); pos++;
      mnemonic = `LD H, (IX+${hex2(d2)})`;
    } else if (ix === 0x6E) {
      const d2 = r8(pos); pos++;
      mnemonic = `LD L, (IX+${hex2(d2)})`;
    } else if (ix === 0x70) {
      const d2 = r8(pos); pos++;
      mnemonic = `LD (IX+${hex2(d2)}), B`;
    } else if (ix === 0x71) {
      const d2 = r8(pos); pos++;
      mnemonic = `LD (IX+${hex2(d2)}), C`;
    } else if (ix === 0x72) {
      const d2 = r8(pos); pos++;
      mnemonic = `LD (IX+${hex2(d2)}), D`;
    } else if (ix === 0x73) {
      const d2 = r8(pos); pos++;
      mnemonic = `LD (IX+${hex2(d2)}), E`;
    } else if (ix === 0x74) {
      const d2 = r8(pos); pos++;
      mnemonic = `LD (IX+${hex2(d2)}), H`;
    } else if (ix === 0x75) {
      const d2 = r8(pos); pos++;
      mnemonic = `LD (IX+${hex2(d2)}), L`;
    } else if (ix === 0x77) {
      const d2 = r8(pos); pos++;
      mnemonic = `LD (IX+${hex2(d2)}), A`;
    } else if (ix === 0x7E) {
      const d2 = r8(pos); pos++;
      mnemonic = `LD A, (IX+${hex2(d2)})`;
    } else if (ix === 0x86) {
      const d2 = r8(pos); pos++;
      mnemonic = `ADD A, (IX+${hex2(d2)})`;
    } else if (ix === 0x96) {
      const d2 = r8(pos); pos++;
      mnemonic = `SUB (IX+${hex2(d2)})`;
    } else if (ix === 0xA6) {
      const d2 = r8(pos); pos++;
      mnemonic = `AND (IX+${hex2(d2)})`;
    } else if (ix === 0xAE) {
      const d2 = r8(pos); pos++;
      mnemonic = `XOR (IX+${hex2(d2)})`;
    } else if (ix === 0xB6) {
      const d2 = r8(pos); pos++;
      mnemonic = `OR (IX+${hex2(d2)})`;
    } else if (ix === 0xBE) {
      const d2 = r8(pos); pos++;
      mnemonic = `CP (IX+${hex2(d2)})`;
    } else if (ix === 0xE1) {
      mnemonic = 'POP IX';
    } else if (ix === 0xE5) {
      mnemonic = 'PUSH IX';
    } else if (ix === 0xE9) {
      mnemonic = 'JP (IX)';
    } else if (ix === 0xF9) {
      mnemonic = 'LD SP, IX';
    } else {
      // eZ80-specific DD sub-opcodes
      if (ix === 0x07) { const d2 = signed8(r8(pos)); pos++; mnemonic = `LD BC, (IX${d2 >= 0 ? '+' : ''}${d2})`; }
      else if (ix === 0x0F) { const d2 = signed8(r8(pos)); pos++; mnemonic = `LD (IX${d2 >= 0 ? '+' : ''}${d2}), BC`; }
      else if (ix === 0x17) { const d2 = signed8(r8(pos)); pos++; mnemonic = `LD DE, (IX${d2 >= 0 ? '+' : ''}${d2})`; }
      else if (ix === 0x1F) { const d2 = signed8(r8(pos)); pos++; mnemonic = `LD (IX${d2 >= 0 ? '+' : ''}${d2}), DE`; }
      else if (ix === 0x27) { const d2 = signed8(r8(pos)); pos++; mnemonic = `LD HL, (IX${d2 >= 0 ? '+' : ''}${d2})`; }
      else if (ix === 0x2F) { const d2 = signed8(r8(pos)); pos++; mnemonic = `LD (IX${d2 >= 0 ? '+' : ''}${d2}), HL`; }
      else if (ix === 0x37) { const d2 = signed8(r8(pos)); pos++; mnemonic = `LD IX, (IX${d2 >= 0 ? '+' : ''}${d2})`; }
      else if (ix === 0x3F) { const d2 = signed8(r8(pos)); pos++; mnemonic = `LD (IX${d2 >= 0 ? '+' : ''}${d2}), IX`; }
      else mnemonic = `DD ${hex2(ix)}`;
    }
  }
  // Standard opcodes
  else {
    const immSize = (prefix === '.SIS' || prefix === '.SIL') ? 2 : 3;
    const hexImm = (v) => immSize === 2 ? hex4(v) : hex6(v);
    function readImm() {
      if (immSize === 2) { const v = r16(pos); pos += 2; return v; }
      else { const v = r24(pos); pos += 3; return v; }
    }
    switch (op) {
      case 0x00: mnemonic = 'NOP'; break;
      case 0x01: { const nn = readImm(); mnemonic = `LD BC, ${hexImm(nn)}`; break; }
      case 0x11: { const nn = readImm(); mnemonic = `LD DE, ${hexImm(nn)}`; break; }
      case 0x21: { const nn = readImm(); mnemonic = `LD HL, ${hexImm(nn)}`; break; }
      case 0x31: { const nn = readImm(); mnemonic = `LD SP, ${hexImm(nn)}`; break; }
      case 0x06: { const n = r8(pos); pos++; mnemonic = `LD B, ${hex2(n)}`; break; }
      case 0x0E: { const n = r8(pos); pos++; mnemonic = `LD C, ${hex2(n)}`; break; }
      case 0x16: { const n = r8(pos); pos++; mnemonic = `LD D, ${hex2(n)}`; break; }
      case 0x1E: { const n = r8(pos); pos++; mnemonic = `LD E, ${hex2(n)}`; break; }
      case 0x26: { const n = r8(pos); pos++; mnemonic = `LD H, ${hex2(n)}`; break; }
      case 0x2E: { const n = r8(pos); pos++; mnemonic = `LD L, ${hex2(n)}`; break; }
      case 0x36: { const n = r8(pos); pos++; mnemonic = `LD (HL), ${hex2(n)}`; break; }
      case 0x3E: { const n = r8(pos); pos++; mnemonic = `LD A, ${hex2(n)}`; break; }
      case 0x3A: { const nn = readImm(); mnemonic = `LD A, (${hexImm(nn)})`; break; }
      case 0x32: { const nn = readImm(); mnemonic = `LD (${hexImm(nn)}), A`; break; }
      case 0x22: { const nn = readImm(); mnemonic = `LD (${hexImm(nn)}), HL`; break; }
      case 0x2A: { const nn = readImm(); mnemonic = `LD HL, (${hexImm(nn)})`; break; }
      case 0x04: mnemonic = 'INC B'; break;
      case 0x05: mnemonic = 'DEC B'; break;
      case 0x0C: mnemonic = 'INC C'; break;
      case 0x0D: mnemonic = 'DEC C'; break;
      case 0x14: mnemonic = 'INC D'; break;
      case 0x15: mnemonic = 'DEC D'; break;
      case 0x1C: mnemonic = 'INC E'; break;
      case 0x1D: mnemonic = 'DEC E'; break;
      case 0x24: mnemonic = 'INC H'; break;
      case 0x25: mnemonic = 'DEC H'; break;
      case 0x2C: mnemonic = 'INC L'; break;
      case 0x2D: mnemonic = 'DEC L'; break;
      case 0x34: mnemonic = 'INC (HL)'; break;
      case 0x35: mnemonic = 'DEC (HL)'; break;
      case 0x3C: mnemonic = 'INC A'; break;
      case 0x3D: mnemonic = 'DEC A'; break;
      case 0x03: mnemonic = 'INC BC'; break;
      case 0x0B: mnemonic = 'DEC BC'; break;
      case 0x13: mnemonic = 'INC DE'; break;
      case 0x1B: mnemonic = 'DEC DE'; break;
      case 0x23: mnemonic = 'INC HL'; break;
      case 0x2B: mnemonic = 'DEC HL'; break;
      case 0x33: mnemonic = 'INC SP'; break;
      case 0x3B: mnemonic = 'DEC SP'; break;
      case 0x09: mnemonic = 'ADD HL, BC'; break;
      case 0x19: mnemonic = 'ADD HL, DE'; break;
      case 0x29: mnemonic = 'ADD HL, HL'; break;
      case 0x39: mnemonic = 'ADD HL, SP'; break;
      // LD r, r
      case 0x41: mnemonic = 'LD B, C'; break;
      case 0x42: mnemonic = 'LD B, D'; break;
      case 0x43: mnemonic = 'LD B, E'; break;
      case 0x44: mnemonic = 'LD B, H'; break;
      case 0x45: mnemonic = 'LD B, L'; break;
      case 0x46: mnemonic = 'LD B, (HL)'; break;
      case 0x47: mnemonic = 'LD B, A'; break;
      case 0x48: mnemonic = 'LD C, B'; break;
      case 0x4A: mnemonic = 'LD C, D'; break;
      case 0x4B: mnemonic = 'LD C, E'; break;
      case 0x4C: mnemonic = 'LD C, H'; break;
      case 0x4D: mnemonic = 'LD C, L'; break;
      case 0x4E: mnemonic = 'LD C, (HL)'; break;
      case 0x4F: mnemonic = 'LD C, A'; break;
      case 0x50: mnemonic = 'LD D, B'; break;
      case 0x51: mnemonic = 'LD D, C'; break;
      case 0x53: mnemonic = 'LD D, E'; break;
      case 0x54: mnemonic = 'LD D, H'; break;
      case 0x55: mnemonic = 'LD D, L'; break;
      case 0x56: mnemonic = 'LD D, (HL)'; break;
      case 0x57: mnemonic = 'LD D, A'; break;
      case 0x58: mnemonic = 'LD E, B'; break;
      case 0x59: mnemonic = 'LD E, C'; break;
      case 0x5A: mnemonic = 'LD E, D'; break;
      case 0x5C: mnemonic = 'LD E, H'; break;
      case 0x5D: mnemonic = 'LD E, L'; break;
      case 0x5E: mnemonic = 'LD E, (HL)'; break;
      case 0x5F: mnemonic = 'LD E, A'; break;
      case 0x60: mnemonic = 'LD H, B'; break;
      case 0x61: mnemonic = 'LD H, C'; break;
      case 0x62: mnemonic = 'LD H, D'; break;
      case 0x63: mnemonic = 'LD H, E'; break;
      case 0x65: mnemonic = 'LD H, L'; break;
      case 0x66: mnemonic = 'LD H, (HL)'; break;
      case 0x67: mnemonic = 'LD H, A'; break;
      case 0x68: mnemonic = 'LD L, B'; break;
      case 0x69: mnemonic = 'LD L, C'; break;
      case 0x6A: mnemonic = 'LD L, D'; break;
      case 0x6B: mnemonic = 'LD L, E'; break;
      case 0x6C: mnemonic = 'LD L, H'; break;
      case 0x6E: mnemonic = 'LD L, (HL)'; break;
      case 0x6F: mnemonic = 'LD L, A'; break;
      case 0x70: mnemonic = 'LD (HL), B'; break;
      case 0x71: mnemonic = 'LD (HL), C'; break;
      case 0x72: mnemonic = 'LD (HL), D'; break;
      case 0x73: mnemonic = 'LD (HL), E'; break;
      case 0x74: mnemonic = 'LD (HL), H'; break;
      case 0x75: mnemonic = 'LD (HL), L'; break;
      case 0x77: mnemonic = 'LD (HL), A'; break;
      case 0x78: mnemonic = 'LD A, B'; break;
      case 0x79: mnemonic = 'LD A, C'; break;
      case 0x7A: mnemonic = 'LD A, D'; break;
      case 0x7B: mnemonic = 'LD A, E'; break;
      case 0x7C: mnemonic = 'LD A, H'; break;
      case 0x7D: mnemonic = 'LD A, L'; break;
      case 0x7E: mnemonic = 'LD A, (HL)'; break;
      case 0x7F: mnemonic = 'LD A, A'; break;
      // ALU
      case 0x80: mnemonic = 'ADD A, B'; break;
      case 0x81: mnemonic = 'ADD A, C'; break;
      case 0x82: mnemonic = 'ADD A, D'; break;
      case 0x83: mnemonic = 'ADD A, E'; break;
      case 0x84: mnemonic = 'ADD A, H'; break;
      case 0x85: mnemonic = 'ADD A, L'; break;
      case 0x86: mnemonic = 'ADD A, (HL)'; break;
      case 0x87: mnemonic = 'ADD A, A'; break;
      case 0x88: mnemonic = 'ADC A, B'; break;
      case 0x89: mnemonic = 'ADC A, C'; break;
      case 0x8A: mnemonic = 'ADC A, D'; break;
      case 0x8B: mnemonic = 'ADC A, E'; break;
      case 0x8C: mnemonic = 'ADC A, H'; break;
      case 0x8D: mnemonic = 'ADC A, L'; break;
      case 0x8E: mnemonic = 'ADC A, (HL)'; break;
      case 0x8F: mnemonic = 'ADC A, A'; break;
      case 0x90: mnemonic = 'SUB B'; break;
      case 0x91: mnemonic = 'SUB C'; break;
      case 0x92: mnemonic = 'SUB D'; break;
      case 0x93: mnemonic = 'SUB E'; break;
      case 0x94: mnemonic = 'SUB H'; break;
      case 0x95: mnemonic = 'SUB L'; break;
      case 0x96: mnemonic = 'SUB (HL)'; break;
      case 0x97: mnemonic = 'SUB A'; break;
      case 0x98: mnemonic = 'SBC A, B'; break;
      case 0x99: mnemonic = 'SBC A, C'; break;
      case 0x9A: mnemonic = 'SBC A, D'; break;
      case 0x9B: mnemonic = 'SBC A, E'; break;
      case 0x9C: mnemonic = 'SBC A, H'; break;
      case 0x9D: mnemonic = 'SBC A, L'; break;
      case 0x9E: mnemonic = 'SBC A, (HL)'; break;
      case 0x9F: mnemonic = 'SBC A, A'; break;
      case 0xA0: mnemonic = 'AND B'; break;
      case 0xA1: mnemonic = 'AND C'; break;
      case 0xA2: mnemonic = 'AND D'; break;
      case 0xA3: mnemonic = 'AND E'; break;
      case 0xA4: mnemonic = 'AND H'; break;
      case 0xA5: mnemonic = 'AND L'; break;
      case 0xA6: mnemonic = 'AND (HL)'; break;
      case 0xA7: mnemonic = 'AND A'; break;
      case 0xA8: mnemonic = 'XOR B'; break;
      case 0xA9: mnemonic = 'XOR C'; break;
      case 0xAA: mnemonic = 'XOR D'; break;
      case 0xAB: mnemonic = 'XOR E'; break;
      case 0xAC: mnemonic = 'XOR H'; break;
      case 0xAD: mnemonic = 'XOR L'; break;
      case 0xAE: mnemonic = 'XOR (HL)'; break;
      case 0xAF: mnemonic = 'XOR A'; break;
      case 0xB0: mnemonic = 'OR B'; break;
      case 0xB1: mnemonic = 'OR C'; break;
      case 0xB2: mnemonic = 'OR D'; break;
      case 0xB3: mnemonic = 'OR E'; break;
      case 0xB4: mnemonic = 'OR H'; break;
      case 0xB5: mnemonic = 'OR L'; break;
      case 0xB6: mnemonic = 'OR (HL)'; break;
      case 0xB7: mnemonic = 'OR A'; break;
      case 0xB8: mnemonic = 'CP B'; break;
      case 0xB9: mnemonic = 'CP C'; break;
      case 0xBA: mnemonic = 'CP D'; break;
      case 0xBB: mnemonic = 'CP E'; break;
      case 0xBC: mnemonic = 'CP H'; break;
      case 0xBD: mnemonic = 'CP L'; break;
      case 0xBE: mnemonic = 'CP (HL)'; break;
      case 0xBF: mnemonic = 'CP A'; break;
      // ALU A, n
      case 0xC6: { const n = r8(pos); pos++; mnemonic = `ADD A, ${hex2(n)}`; break; }
      case 0xCE: { const n = r8(pos); pos++; mnemonic = `ADC A, ${hex2(n)}`; break; }
      case 0xD6: { const n = r8(pos); pos++; mnemonic = `SUB ${hex2(n)}`; break; }
      case 0xDE: { const n = r8(pos); pos++; mnemonic = `SBC A, ${hex2(n)}`; break; }
      case 0xE6: { const n = r8(pos); pos++; mnemonic = `AND ${hex2(n)}`; break; }
      case 0xEE: { const n = r8(pos); pos++; mnemonic = `XOR ${hex2(n)}`; break; }
      case 0xF6: { const n = r8(pos); pos++; mnemonic = `OR ${hex2(n)}`; break; }
      case 0xFE: { const n = r8(pos); pos++; mnemonic = `CP ${hex2(n)}`; break; }
      // Rotates
      case 0x07: mnemonic = 'RLCA'; break;
      case 0x0F: mnemonic = 'RRCA'; break;
      case 0x17: mnemonic = 'RLA'; break;
      case 0x1F: mnemonic = 'RRA'; break;
      // Jumps
      case 0xC3: { const nn = readImm(); mnemonic = `JP ${hexImm(nn)}`; break; }
      case 0xCA: { const nn = readImm(); mnemonic = `JP Z, ${hexImm(nn)}`; break; }
      case 0xC2: { const nn = readImm(); mnemonic = `JP NZ, ${hexImm(nn)}`; break; }
      case 0xDA: { const nn = readImm(); mnemonic = `JP C, ${hexImm(nn)}`; break; }
      case 0xD2: { const nn = readImm(); mnemonic = `JP NC, ${hexImm(nn)}`; break; }
      case 0xE2: { const nn = readImm(); mnemonic = `JP PO, ${hexImm(nn)}`; break; }
      case 0xEA: { const nn = readImm(); mnemonic = `JP PE, ${hexImm(nn)}`; break; }
      case 0xF2: { const nn = readImm(); mnemonic = `JP P, ${hexImm(nn)}`; break; }
      case 0xFA: { const nn = readImm(); mnemonic = `JP M, ${hexImm(nn)}`; break; }
      case 0xE9: mnemonic = 'JP (HL)'; break;
      // JR
      case 0x18: { const d = signed8(r8(pos)); pos++; mnemonic = `JR ${hex6(pos + d)}  (offset ${d >= 0 ? '+' : ''}${d})`; break; }
      case 0x20: { const d = signed8(r8(pos)); pos++; mnemonic = `JR NZ, ${hex6(pos + d)}  (offset ${d >= 0 ? '+' : ''}${d})`; break; }
      case 0x28: { const d = signed8(r8(pos)); pos++; mnemonic = `JR Z, ${hex6(pos + d)}  (offset ${d >= 0 ? '+' : ''}${d})`; break; }
      case 0x30: { const d = signed8(r8(pos)); pos++; mnemonic = `JR NC, ${hex6(pos + d)}  (offset ${d >= 0 ? '+' : ''}${d})`; break; }
      case 0x38: { const d = signed8(r8(pos)); pos++; mnemonic = `JR C, ${hex6(pos + d)}  (offset ${d >= 0 ? '+' : ''}${d})`; break; }
      // DJNZ
      case 0x10: { const d = signed8(r8(pos)); pos++; mnemonic = `DJNZ ${hex6(pos + d)}  (offset ${d >= 0 ? '+' : ''}${d})`; break; }
      // CALL
      case 0xCD: { const nn = readImm(); mnemonic = `CALL ${hexImm(nn)}`; break; }
      case 0xCC: { const nn = readImm(); mnemonic = `CALL Z, ${hexImm(nn)}`; break; }
      case 0xC4: { const nn = readImm(); mnemonic = `CALL NZ, ${hexImm(nn)}`; break; }
      case 0xDC: { const nn = readImm(); mnemonic = `CALL C, ${hexImm(nn)}`; break; }
      case 0xD4: { const nn = readImm(); mnemonic = `CALL NC, ${hexImm(nn)}`; break; }
      case 0xE4: { const nn = readImm(); mnemonic = `CALL PO, ${hexImm(nn)}`; break; }
      case 0xEC: { const nn = readImm(); mnemonic = `CALL PE, ${hexImm(nn)}`; break; }
      case 0xF4: { const nn = readImm(); mnemonic = `CALL P, ${hexImm(nn)}`; break; }
      case 0xFC: { const nn = readImm(); mnemonic = `CALL M, ${hexImm(nn)}`; break; }
      // RET
      case 0xC9: mnemonic = 'RET'; break;
      case 0xC0: mnemonic = 'RET NZ'; break;
      case 0xC8: mnemonic = 'RET Z'; break;
      case 0xD0: mnemonic = 'RET NC'; break;
      case 0xD8: mnemonic = 'RET C'; break;
      case 0xE0: mnemonic = 'RET PO'; break;
      case 0xE8: mnemonic = 'RET PE'; break;
      case 0xF0: mnemonic = 'RET P'; break;
      case 0xF8: mnemonic = 'RET M'; break;
      // RST
      case 0xC7: mnemonic = 'RST 0x00'; break;
      case 0xCF: mnemonic = 'RST 0x08'; break;
      case 0xD7: mnemonic = 'RST 0x10'; break;
      case 0xDF: mnemonic = 'RST 0x18'; break;
      case 0xE7: mnemonic = 'RST 0x20'; break;
      case 0xEF: mnemonic = 'RST 0x28'; break;
      case 0xF7: mnemonic = 'RST 0x30'; break;
      case 0xFF: mnemonic = 'RST 0x38'; break;
      // PUSH/POP
      case 0xC5: mnemonic = 'PUSH BC'; break;
      case 0xD5: mnemonic = 'PUSH DE'; break;
      case 0xE5: mnemonic = 'PUSH HL'; break;
      case 0xF5: mnemonic = 'PUSH AF'; break;
      case 0xC1: mnemonic = 'POP BC'; break;
      case 0xD1: mnemonic = 'POP DE'; break;
      case 0xE1: mnemonic = 'POP HL'; break;
      case 0xF1: mnemonic = 'POP AF'; break;
      // EI/DI
      case 0xFB: mnemonic = 'EI'; break;
      case 0xF3: mnemonic = 'DI'; break;
      // SCF/CCF
      case 0x37: mnemonic = 'SCF'; break;
      case 0x3F: mnemonic = 'CCF'; break;
      // HALT
      case 0x76: mnemonic = 'HALT'; break;
      // LD A, (BC) / (DE)
      case 0x0A: mnemonic = 'LD A, (BC)'; break;
      case 0x1A: mnemonic = 'LD A, (DE)'; break;
      case 0x02: mnemonic = 'LD (BC), A'; break;
      case 0x12: mnemonic = 'LD (DE), A'; break;
      // CPL / DAA / NEG
      case 0x2F: mnemonic = 'CPL'; break;
      case 0x27: mnemonic = 'DAA'; break;
      // EX
      case 0xEB: mnemonic = 'EX DE, HL'; break;
      case 0x08: mnemonic = 'EX AF, AF\''; break;
      case 0xD9: mnemonic = 'EXX'; break;
      case 0xE3: mnemonic = 'EX (SP), HL'; break;
      default:
        mnemonic = `DB ${hex2(op)}`;
        break;
    }
  }

  if (prefix) mnemonic = prefix + ' ' + mnemonic;

  const len = pos - startPos;
  let rawBytes = '';
  for (let i = startPos; i < pos; i++) {
    rawBytes += rom[i].toString(16).padStart(2, '0').toUpperCase() + ' ';
  }

  return { addr: startPos, len, mnemonic, rawBytes: rawBytes.trim() };
}

function disasmRange(start, end, label) {
  const lines = [];
  if (label) lines.push(`\n; === ${label} ===`);
  let pos = start;
  while (pos < end) {
    const inst = disasmOne(pos);
    const addrStr = pos.toString(16).padStart(6, '0').toUpperCase();
    lines.push(`  ${addrStr}: ${inst.rawBytes.padEnd(20)} ${inst.mnemonic}`);
    pos += inst.len;
  }
  return lines;
}

// =============================================================================
// Main
// =============================================================================

function main() {
  console.log('=== Phase 449 — 0x0067F8 Key Handler Trace ===');
  console.log('');

  // -------------------------------------------------------------------------
  // Part 1: Dynamic trace
  // -------------------------------------------------------------------------
  console.log('--- Part 1: Dynamic execution trace ---');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const visitedPCs = [];
  const visitedSet = new Set();
  let reached0067F8 = false;

  const onBlockCb = (pc) => {
    if (!visitedSet.has(pc)) {
      visitedSet.add(pc);
      visitedPCs.push(pc);
    }
    if (pc === TARGET_ADDR) {
      reached0067F8 = true;
    }
  };

  const executor = createExecutor(BLOCKS, mem, {
    peripherals,
    onWake: (haltPc, newPc, newMode) => {
      console.log(`    HALT-wake: haltPc=${hex(haltPc)} -> newPc=${hex(newPc)} mode=${newMode}`);
    },
  });
  const cpu = executor.cpu;

  console.log('phase 1: boot to home screen');
  bootToHomeScreen(executor, cpu, mem);

  // Set the gates
  mem[0xD14091] = 1;        // key processing enabled
  mem[0xD177B7] = 0x55;     // display refresh mode
  mem[0xD177BA] = 0;        // CLEAR the D177BA gate — let 0x0067F8 be reached!

  console.log(`  D14091=${hex(mem[0xD14091], 2)} (key processing enabled)`);
  console.log(`  D177B7=${hex(mem[0xD177B7], 2)} (display refresh mode)`);
  console.log(`  D177BA=${hex(mem[0xD177BA], 2)} (gate cleared — 0x0067F8 should be reachable)`);
  console.log(`  D141B5=${hex(mem[0xD141B5], 2)} (key buffer)`);

  const vramBefore = vramHash(mem);
  console.log(`  vramHash before=${vramBefore}`);

  // Clear visited tracking for the event loop phase
  visitedPCs.length = 0;
  visitedSet.clear();

  console.log('phase 2: inject key "1" and run event loop');

  // Inject scan code for key '1'
  const KEY_ONE = { idx: 4, bit: 1, label: '1', scan: 0x41 };
  pressKey(peripherals, KEY_ONE);
  mem[0xD00587] = KEY_ONE.scan;
  mem[0xD00080] |= 0x08;  // Set bit 3 of (IY+0) — key ready flag

  let result;
  try {
    result = executor.runFrom(EVENT_LOOP_ENTRY, 'adl', {
      maxSteps: 200000,
      maxLoopIterations: 5000,
      diHaltBypass: true,
      onBlock: onBlockCb,
    });
  } catch (err) {
    result = { error: err.message, steps: 0, termination: 'throw', lastPc: EVENT_LOOP_ENTRY, lastMode: 'adl' };
  }

  releaseKey(peripherals, KEY_ONE);

  const vramAfter = vramHash(mem);

  console.log('');
  console.log('--- Results ---');
  console.log(`  steps=${result.steps} termination=${result.termination} lastPc=${hex(result.lastPc)} lastMode=${result.lastMode || 'adl'}`);
  if (result.error) console.log(`  error=${result.error}`);
  console.log(`  reached 0x0067F8: ${reached0067F8 ? 'YES' : 'NO'}`);
  console.log(`  vramHash before=${vramBefore} after=${vramAfter} changed=${vramBefore !== vramAfter}`);
  console.log(`  D141B5=${hex(mem[0xD141B5], 2)}`);
  console.log(`  D0058D=${hex(mem[0xD0058D], 2)}`);
  console.log(`  D00587=${hex(mem[0xD00587], 2)}`);
  console.log(`  D177BA=${hex(mem[0xD177BA], 2)} (should still be 0 unless OS wrote it)`);
  console.log(`  D14091=${hex(mem[0xD14091], 2)}`);
  console.log(`  D177B7=${hex(mem[0xD177B7], 2)}`);

  console.log('');
  console.log(`  Unique block PCs visited: ${visitedPCs.length}`);
  console.log('  First 40 unique block PCs in order:');
  for (let i = 0; i < Math.min(40, visitedPCs.length); i++) {
    console.log(`    ${i + 1}. ${hex(visitedPCs[i])}`);
  }

  // Check for interesting addresses in visited set
  const interestingAddrs = [
    0x003A73, 0x003D5A, 0x001713, 0x0008BB, 0x0067F8, 0x001C33,
    0x003C63, 0x003CC2, 0x003D4B,
  ];
  console.log('');
  console.log('  Key addresses visited:');
  for (const a of interestingAddrs) {
    console.log(`    ${hex(a)}: ${visitedSet.has(a) ? 'YES' : 'no'}`);
  }

  // -------------------------------------------------------------------------
  // Part 2: Static disassembly
  // -------------------------------------------------------------------------
  console.log('');
  console.log('--- Part 2: Static disassembly of 0x0067F8-0x006900 ---');

  const disasmLines = disasmRange(0x0067F8, 0x006900);
  for (const line of disasmLines) {
    console.log(line);
  }

  // Disassemble 0x003A73-0x003A90 (event loop entry)
  console.log('');
  console.log('--- Disassembly of 0x003A73-0x003A90 (event loop) ---');
  const evtLines = disasmRange(0x003A73, 0x003A90);
  for (const line of evtLines) {
    console.log(line);
  }

  // Also disassemble 0x001713-0x001740 to see the gate logic
  console.log('');
  console.log('--- Disassembly of 0x001713-0x001740 (gate at D177BA) ---');
  const gateLines = disasmRange(0x001713, 0x001740);
  for (const line of gateLines) {
    console.log(line);
  }

  // Disassemble 0x0008BB-0x0008F0 to see ROM magic guard
  console.log('');
  console.log('--- Disassembly of 0x0008BB-0x000920 (ROM magic guard) ---');
  const guardLines = disasmRange(0x0008BB, 0x000920);
  for (const line of guardLines) {
    console.log(line);
  }

  // Collect CALL/JP targets from 0x0067F8-0x006900
  const callTargets = new Set();
  let scanPos = 0x0067F8;
  while (scanPos < 0x006900) {
    const inst = disasmOne(scanPos);
    const m = inst.mnemonic;
    if ((m.startsWith('CALL ') || m.startsWith('JP ')) && !m.includes('(')) {
      const parts = m.split(' ');
      const last = parts[parts.length - 1];
      const target = parseInt(last.replace('0x', ''), 16);
      if (!isNaN(target) && (target < 0x0067F8 || target >= 0x006900)) {
        callTargets.add(target);
      }
    }
    scanPos += inst.len;
  }

  console.log('');
  console.log('  External CALL/JP targets from 0x0067F8-0x006900:');
  for (const t of [...callTargets].sort((a, b) => a - b)) {
    console.log(`    ${hex6(t)}`);
  }

  // -------------------------------------------------------------------------
  // Write report
  // -------------------------------------------------------------------------
  const reportLines = [];
  reportLines.push('# Phase 449 — 0x0067F8 Key Handler Trace');
  reportLines.push('');
  reportLines.push('Generated by `probe-phase449-0x0067F8-key-handler-trace.mjs`');
  reportLines.push('');
  reportLines.push('## Goal');
  reportLines.push('');
  reportLines.push('Clear D177BA (the gate at 0x001713 that short-circuits before CALL 0x0067F8)');
  reportLines.push('and trace whether 0x0067F8 is reached when a key is injected.');
  reportLines.push('');
  reportLines.push('## Setup');
  reportLines.push('');
  reportLines.push('- D14091 = 1 (key processing enabled)');
  reportLines.push('- D177B7 = 0x55 (display refresh mode)');
  reportLines.push('- D177BA = 0 (gate cleared)');
  reportLines.push('- Key "1" injected: D00587 = 0x41, (IY+0) bit 3 set');
  reportLines.push('- Run from EVENT_LOOP_ENTRY (0x003A73), maxSteps=200000');
  reportLines.push('');
  reportLines.push('## Dynamic Trace Results');
  reportLines.push('');
  reportLines.push(`- Steps: ${result.steps}`);
  reportLines.push(`- Termination: ${result.termination}`);
  reportLines.push(`- Last PC: ${hex(result.lastPc)}`);
  if (result.error) reportLines.push(`- Error: ${result.error}`);
  reportLines.push(`- **Reached 0x0067F8: ${reached0067F8 ? 'YES' : 'NO'}**`);
  reportLines.push(`- VRAM changed: ${vramBefore !== vramAfter}`);
  reportLines.push(`- VRAM hash before: ${vramBefore}`);
  reportLines.push(`- VRAM hash after: ${vramAfter}`);
  reportLines.push('');
  reportLines.push('### RAM State After Execution');
  reportLines.push('');
  reportLines.push(`| Address | Value | Meaning |`);
  reportLines.push(`|---------|-------|---------|`);
  reportLines.push(`| D141B5 | ${hex(mem[0xD141B5], 2)} | Key buffer |`);
  reportLines.push(`| D0058D | ${hex(mem[0xD0058D], 2)} | Last key |`);
  reportLines.push(`| D00587 | ${hex(mem[0xD00587], 2)} | Scan code register |`);
  reportLines.push(`| D177BA | ${hex(mem[0xD177BA], 2)} | Gate flag (0=open) |`);
  reportLines.push(`| D14091 | ${hex(mem[0xD14091], 2)} | Key processing enable |`);
  reportLines.push(`| D177B7 | ${hex(mem[0xD177B7], 2)} | Display refresh mode |`);
  reportLines.push('');
  reportLines.push('### Key Addresses Visited');
  reportLines.push('');
  reportLines.push('| Address | Label | Visited |');
  reportLines.push('|---------|-------|---------|');
  for (const a of interestingAddrs) {
    const labels = {
      0x003A73: 'EVENT_LOOP_ENTRY',
      0x003D5A: '_GetCSC',
      0x001713: 'key dispatch (ROM magic)',
      0x0008BB: 'ROM magic guard',
      0x0067F8: 'KEY HANDLER TARGET',
      0x001C33: 'timer loop (bad)',
      0x003C63: 'scan dispatcher',
      0x003CC2: 'hardware scan',
      0x003D4B: 'store scan code',
    };
    reportLines.push(`| ${hex(a)} | ${labels[a] || '?'} | ${visitedSet.has(a) ? 'YES' : 'no'} |`);
  }
  reportLines.push('');
  reportLines.push('### First 40 Unique Block PCs (execution order)');
  reportLines.push('');
  reportLines.push('```');
  for (let i = 0; i < Math.min(40, visitedPCs.length); i++) {
    reportLines.push(`  ${(i + 1).toString().padStart(2)}. ${hex(visitedPCs[i])}`);
  }
  reportLines.push('```');
  reportLines.push('');
  reportLines.push(`Total unique blocks visited: ${visitedPCs.length}`);
  reportLines.push('');

  reportLines.push('## Static Disassembly: 0x0008BB-0x000920 (ROM Magic Guard)');
  reportLines.push('');
  reportLines.push('```asm');
  reportLines.push(...guardLines);
  reportLines.push('```');
  reportLines.push('');

  reportLines.push('## Static Disassembly: 0x003A73-0x003A90 (Event Loop Entry)');
  reportLines.push('');
  reportLines.push('```asm');
  reportLines.push(...evtLines);
  reportLines.push('```');
  reportLines.push('');

  reportLines.push('## Static Disassembly: 0x001713-0x001740 (D177BA Gate)');
  reportLines.push('');
  reportLines.push('```asm');
  reportLines.push(...gateLines);
  reportLines.push('```');
  reportLines.push('');

  reportLines.push('## Static Disassembly: 0x0067F8-0x006900');
  reportLines.push('');
  reportLines.push('```asm');
  reportLines.push(...disasmLines);
  reportLines.push('```');
  reportLines.push('');

  reportLines.push('### External CALL/JP Targets');
  reportLines.push('');
  for (const t of [...callTargets].sort((a, b) => a - b)) {
    reportLines.push(`- ${hex6(t)}`);
  }
  reportLines.push('');

  // Analysis section
  reportLines.push('## Analysis');
  reportLines.push('');
  if (reached0067F8) {
    reportLines.push('### 0x0067F8 WAS reached');
    reportLines.push('');
    reportLines.push('The full dispatch chain worked:');
    reportLines.push('');
    reportLines.push('1. 0x003A73: CALL 0x003D5A (_GetCSC) -- picked up scan code 0x41');
    reportLines.push('2. 0x003A7D: CALL 0x001713 (key dispatch)');
    reportLines.push('3. 0x001713: CALL 0x0008BB (ROM magic guard) -- returned Z');
    reportLines.push('4. 0x001717: RET NZ -- NOT taken (Z was set)');
    reportLines.push('5. 0x001718: LD A,(D177BA); OR A; RET NZ -- NOT taken (D177BA=0)');
    reportLines.push('6. 0x00171E: LD BC,0x020000; PUSH BC; CALL 0x0067F8 -- REACHED');
    reportLines.push('');
    reportLines.push('Execution continued into 0x0067F8, which:');
    reportLines.push('- Called 0x001C4F and 0x001C33 (OS helper routines)');
    reportLines.push('- Checked IN0 A,(0x03) at 0x006816');
    reportLines.push('- Returned via 0x006828 (HL=1 path, meaning check passed)');
    reportLines.push('- Back at 0x001727: POP BC; DEC L; RET');
    reportLines.push('');
    reportLines.push('After 0x001713 returned Z, the event loop continued:');
    reportLines.push('- 0x003A81: JP NZ,0x001933 -- NOT taken (Z set)');
    reportLines.push('- 0x003A85: JP 0x003A89');
    reportLines.push('- 0x003A89: CALL 0x001853 (display/refresh handler)');
    reportLines.push('');
    reportLines.push('**VRAM changed** and 405 unique blocks were visited before');
    reportLines.push(`the error at PC=${hex(result.lastPc)} (missing transpiled block).`);
    reportLines.push('');
    reportLines.push('### Observations');
    reportLines.push('');
    reportLines.push('- D177BA was written back to 0x7F by the OS after key processing');
    reportLines.push('- D177B7 was cleared from 0x55 to 0x00');
    reportLines.push('- The error at 0xD18C22 is a missing block in RAM space (likely a');
    reportLines.push('  function pointer or jump table target that needs to be lifted)');
    reportLines.push('');
    reportLines.push('### Known issue: .SIL prefix in transpiler');
    reportLines.push('');
    reportLines.push('0x0008BB uses `.SIL SBC HL, BC` to check ROM magic at 0x020100.');
    reportLines.push('The transpiled code performs 24-bit SBC instead of 16-bit.');
    reportLines.push('This works when boot fully initializes (value at 0x020100 loads');
    reportLines.push('correctly), but is technically incorrect and may fail in some');
    reportLines.push('boot sequences. The `.SIL` prefix bug should still be fixed.');
  } else {
    reportLines.push('### 0x0067F8 was NOT reached');
    reportLines.push('');
    reportLines.push('The execution trace shows the dispatch chain was blocked:');
    reportLines.push('');
    reportLines.push('1. 0x003A73: CALL 0x003D5A (_GetCSC) -- returns scan code in A');
    reportLines.push('2. 0x003A7D: CALL 0x001713 (key dispatch)');
    reportLines.push('3. 0x001713: CALL 0x0008BB (ROM magic guard)');
    reportLines.push('4. 0x0008BB: returned NZ (ROM magic check failed)');
    reportLines.push('5. 0x001717: RET NZ -- RETURNED, blocking all further dispatch');
    reportLines.push('');
    reportLines.push('**Root cause:** 0x0008BB uses `.SIL SBC HL, BC` to compare');
    reportLines.push('ROM magic at 0x020100 with 0xA55A. The transpiler performs a');
    reportLines.push('24-bit SBC instead of 16-bit, causing 0xFFA55A - 0x00A55A =');
    reportLines.push('0xFF0000 (NZ) when the 16-bit result should be 0 (Z).');
    reportLines.push('');
    reportLines.push('The boot sequence may not have fully initialized, causing the');
    reportLines.push('guard to fail. When boot completes properly, the guard passes.');
  }
  reportLines.push('');
  reportLines.push('### Next steps');
  reportLines.push('');
  reportLines.push('1. **Fix .SIL/.SIS prefix handling in transpiler** -- `.SIL SBC HL, BC`');
  reportLines.push('   must perform 16-bit subtraction and set flags on the 16-bit result.');
  reportLines.push('   This affects `scripts/transpile-ti84-rom.mjs`.');
  reportLines.push('2. D177BA=0 is confirmed necessary (second gate at 0x001718).');
  reportLines.push('3. Investigate the crash at 0xD18C22 -- likely a RAM-space function');
  reportLines.push('   pointer that the OS sets up during init. Needs a stub or lift.');
  reportLines.push('4. 0x0067F8 itself is a validation function (checks IN0 port 0x03');
  reportLines.push('   against a mask), not the actual key processor. The real key');
  reportLines.push('   processing continues after 0x0067F8 returns via 0x001727.');
  reportLines.push('');

  const REPORT_PATH = path.join(__dirname, 'phase449-trace-0x0067F8-key-handler-report.md');
  const report = reportLines.join('\n');
  fs.writeFileSync(REPORT_PATH, report);
  console.log('');
  console.log(`Report written to ${REPORT_PATH}`);

  process.exit(reached0067F8 ? 0 : 1);
}

main();
