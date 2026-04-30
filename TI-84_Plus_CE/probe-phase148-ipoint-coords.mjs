#!/usr/bin/env node

/**
 * Phase 148 — Disassemble IPoint's actual coordinate input mechanism.
 *
 * Part A: Disassemble IPoint entry to VRAM computation (0x07B451–0x07B5B0)
 * Part B: Register-input test — vary BC/DE to find which controls pixel position
 * Part C: Trace register flow inside IPoint (onBlock logging)
 * Part D: Disassemble bounds-check subroutine at 0x07B793
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

// ── Constants ──────────────────────────────────────────────────────────────

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const USERMEM_ADDR = 0xd1a881;
const EMPTY_VAT_ADDR = 0xd3ffff;

const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const FAKE_RET = 0x7ffffe;
const IPOINT_RET = 0x7FFFF2;
const MEMINIT_RET = 0x7FFFF6;

const MEMINIT_ENTRY = 0x09DEE0;
const IPOINT_ENTRY = 0x07B451;

const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

const PIX_WIDE_P_ADDR = 0xD014FE;
const PIX_WIDE_M2_ADDR = 0xD01501;

const DRAW_COLOR_CODE_ADDR = 0xD026AE;
const HOOKFLAGS3_ADDR = 0xD000B5;

const IY_PLUS_43_ADDR = 0xD000AB;
const IY_PLUS_74_ADDR = 0xD000CA;

const LCD_VRAM_ADDR = 0xD40000;
const LCD_VRAM_SIZE = 153600;

const MAX_LOOP_ITER = 8192;

// ── Utilities ──────────────────────────────────────────────────────────────

const hex = (v, w = 6) =>
  v === undefined || v === null
    ? 'n/a'
    : `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;

const write24 = (m, a, v) => {
  m[a] = v & 0xff;
  m[a + 1] = (v >>> 8) & 0xff;
  m[a + 2] = (v >>> 16) & 0xff;
};

const write16 = (m, a, v) => {
  m[a] = v & 0xff;
  m[a + 1] = (v >>> 8) & 0xff;
};

const read24 = (m, a) =>
  ((m[a] & 0xff) | ((m[a + 1] & 0xff) << 8) | ((m[a + 2] & 0xff) << 16)) >>> 0;

const read16 = (m, a) =>
  ((m[a] & 0xff) | ((m[a + 1] & 0xff) << 8)) >>> 0;

// ── Runtime setup ──────────────────────────────────────────────────────────

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const executor = createExecutor(BLOCKS, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
  });
  return { mem, executor, cpu: executor.cpu };
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xd0; cpu._iy = 0xd00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xff, cpu.sp, cpu.sp + 3);
  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
}

function prepareCallState(cpu, mem) {
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.madl = 1; cpu.mbase = 0xd0; cpu._iy = 0xd00080;
  cpu.f = 0x40; cpu._ix = 0xd1a860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
}

const FPS_START_ADDR = USERMEM_ADDR + 0x200;

function seedAllocator(mem) {
  write24(mem, OPBASE_ADDR, EMPTY_VAT_ADDR);
  write24(mem, OPS_ADDR, EMPTY_VAT_ADDR);
  mem.fill(0x00, PTEMPCNT_ADDR, PTEMPCNT_ADDR + 4);
  write24(mem, PTEMP_ADDR, EMPTY_VAT_ADDR);
  write24(mem, PROGPTR_ADDR, EMPTY_VAT_ADDR);
  write24(mem, FPSBASE_ADDR, FPS_START_ADDR);
  write24(mem, FPS_ADDR, FPS_START_ADDR);
  write24(mem, NEWDATA_PTR_ADDR, USERMEM_ADDR);
}

function seedErrorFrame(cpu, mem, recoveryAddr) {
  const errFrameSP = cpu.sp - 18;
  write24(mem, errFrameSP + 0, 0xD00080);
  write24(mem, errFrameSP + 3, 0xD1A860);
  write24(mem, errFrameSP + 6, 0x000000);
  write24(mem, errFrameSP + 9, 0x000000);
  write24(mem, errFrameSP + 12, recoveryAddr);
  write24(mem, errFrameSP + 15, 0x000040);
  write24(mem, ERR_SP_ADDR, errFrameSP);
  mem[ERR_NO_ADDR] = 0x00;
  return errFrameSP;
}

function callOSRoutine(label, entry, retAddr, executor, cpu, mem, budget) {
  let returnHit = false;
  let steps = 0;
  try {
    executor.runFrom(entry, 'adl', {
      maxSteps: budget,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        steps++;
        const norm = pc & 0xffffff;
        if (norm === retAddr || norm === FAKE_RET) { returnHit = true; throw new Error('__RET__'); }
      },
      onMissingBlock(pc) {
        steps++;
        const norm = pc & 0xffffff;
        if (norm === retAddr || norm === FAKE_RET) { returnHit = true; throw new Error('__RET__'); }
      },
    });
  } catch (e) {
    if (e?.message !== '__RET__') throw e;
  }
  return { returnHit, steps };
}

// ── Disassembly helper ─────────────────────────────────────────────────────

function disasmRange(label, startAddr, endAddr) {
  console.log(`\n  --- ${label}: ${hex(startAddr)} to ${hex(endAddr)} ---`);
  let pc = startAddr;
  while (pc < endAddr) {
    const b0 = romBytes[pc];
    const b1 = romBytes[pc + 1];
    const b2 = romBytes[pc + 2];
    const b3 = romBytes[pc + 3];
    const b4 = romBytes[pc + 4];
    const b5 = romBytes[pc + 5];

    const rawHex = [];
    for (let i = 0; i < 6 && (pc + i) < endAddr + 6; i++) {
      rawHex.push(romBytes[pc + i].toString(16).padStart(2, '0'));
    }

    let instr = '';
    let len = 1;

    // Attempt basic eZ80 ADL decode
    if (b0 === 0x00) { instr = 'NOP'; len = 1; }
    else if (b0 === 0xC9) { instr = 'RET'; len = 1; }
    else if (b0 === 0xC0) { instr = 'RET NZ'; len = 1; }
    else if (b0 === 0xC8) { instr = 'RET Z'; len = 1; }
    else if (b0 === 0xD0) { instr = 'RET NC'; len = 1; }
    else if (b0 === 0xD8) { instr = 'RET C'; len = 1; }
    else if (b0 === 0xE0) { instr = 'RET PO'; len = 1; }
    else if (b0 === 0xE8) { instr = 'RET PE'; len = 1; }
    else if (b0 === 0xF0) { instr = 'RET P'; len = 1; }
    else if (b0 === 0xF8) { instr = 'RET M'; len = 1; }
    else if (b0 === 0x76) { instr = 'HALT'; len = 1; }
    else if (b0 === 0xF3) { instr = 'DI'; len = 1; }
    else if (b0 === 0xFB) { instr = 'EI'; len = 1; }

    // 8-bit LD r,r and LD r,n
    else if (b0 === 0x3E) { instr = `LD A, ${hex(b1, 2)}`; len = 2; }
    else if (b0 === 0x06) { instr = `LD B, ${hex(b1, 2)}`; len = 2; }
    else if (b0 === 0x0E) { instr = `LD C, ${hex(b1, 2)}`; len = 2; }
    else if (b0 === 0x16) { instr = `LD D, ${hex(b1, 2)}`; len = 2; }
    else if (b0 === 0x1E) { instr = `LD E, ${hex(b1, 2)}`; len = 2; }
    else if (b0 === 0x26) { instr = `LD H, ${hex(b1, 2)}`; len = 2; }
    else if (b0 === 0x2E) { instr = `LD L, ${hex(b1, 2)}`; len = 2; }

    // Common LD r,r
    else if (b0 === 0x78) { instr = 'LD A, B'; len = 1; }
    else if (b0 === 0x79) { instr = 'LD A, C'; len = 1; }
    else if (b0 === 0x7A) { instr = 'LD A, D'; len = 1; }
    else if (b0 === 0x7B) { instr = 'LD A, E'; len = 1; }
    else if (b0 === 0x7C) { instr = 'LD A, H'; len = 1; }
    else if (b0 === 0x7D) { instr = 'LD A, L'; len = 1; }
    else if (b0 === 0x7E) { instr = 'LD A, (HL)'; len = 1; }
    else if (b0 === 0x7F) { instr = 'LD A, A'; len = 1; }
    else if (b0 === 0x47) { instr = 'LD B, A'; len = 1; }
    else if (b0 === 0x4F) { instr = 'LD C, A'; len = 1; }
    else if (b0 === 0x57) { instr = 'LD D, A'; len = 1; }
    else if (b0 === 0x5F) { instr = 'LD E, A'; len = 1; }
    else if (b0 === 0x67) { instr = 'LD H, A'; len = 1; }
    else if (b0 === 0x6F) { instr = 'LD L, A'; len = 1; }
    else if (b0 === 0x40) { instr = 'LD B, B'; len = 1; }
    else if (b0 === 0x41) { instr = 'LD B, C'; len = 1; }
    else if (b0 === 0x42) { instr = 'LD B, D'; len = 1; }
    else if (b0 === 0x43) { instr = 'LD B, E'; len = 1; }
    else if (b0 === 0x44) { instr = 'LD B, H'; len = 1; }
    else if (b0 === 0x45) { instr = 'LD B, L'; len = 1; }
    else if (b0 === 0x46) { instr = 'LD B, (HL)'; len = 1; }
    else if (b0 === 0x48) { instr = 'LD C, B'; len = 1; }
    else if (b0 === 0x49) { instr = 'LD C, C'; len = 1; }
    else if (b0 === 0x4A) { instr = 'LD C, D'; len = 1; }
    else if (b0 === 0x4B) { instr = 'LD C, E'; len = 1; }
    else if (b0 === 0x4C) { instr = 'LD C, H'; len = 1; }
    else if (b0 === 0x4D) { instr = 'LD C, L'; len = 1; }
    else if (b0 === 0x4E) { instr = 'LD C, (HL)'; len = 1; }
    else if (b0 === 0x50) { instr = 'LD D, B'; len = 1; }
    else if (b0 === 0x51) { instr = 'LD D, C'; len = 1; }
    else if (b0 === 0x52) { instr = 'LD D, D'; len = 1; }
    else if (b0 === 0x53) { instr = 'LD D, E'; len = 1; }
    else if (b0 === 0x54) { instr = 'LD D, H'; len = 1; }
    else if (b0 === 0x55) { instr = 'LD D, L'; len = 1; }
    else if (b0 === 0x56) { instr = 'LD D, (HL)'; len = 1; }
    else if (b0 === 0x58) { instr = 'LD E, B'; len = 1; }
    else if (b0 === 0x59) { instr = 'LD E, C'; len = 1; }
    else if (b0 === 0x5A) { instr = 'LD E, D'; len = 1; }
    else if (b0 === 0x5B) { instr = 'LD E, E'; len = 1; }
    else if (b0 === 0x5C) { instr = 'LD E, H'; len = 1; }
    else if (b0 === 0x5D) { instr = 'LD E, L'; len = 1; }
    else if (b0 === 0x5E) { instr = 'LD E, (HL)'; len = 1; }
    else if (b0 === 0x60) { instr = 'LD H, B'; len = 1; }
    else if (b0 === 0x61) { instr = 'LD H, C'; len = 1; }
    else if (b0 === 0x62) { instr = 'LD H, D'; len = 1; }
    else if (b0 === 0x63) { instr = 'LD H, E'; len = 1; }
    else if (b0 === 0x64) { instr = 'LD H, H'; len = 1; }
    else if (b0 === 0x65) { instr = 'LD H, L'; len = 1; }
    else if (b0 === 0x66) { instr = 'LD H, (HL)'; len = 1; }
    else if (b0 === 0x68) { instr = 'LD L, B'; len = 1; }
    else if (b0 === 0x69) { instr = 'LD L, C'; len = 1; }
    else if (b0 === 0x6A) { instr = 'LD L, D'; len = 1; }
    else if (b0 === 0x6B) { instr = 'LD L, E'; len = 1; }
    else if (b0 === 0x6C) { instr = 'LD L, H'; len = 1; }
    else if (b0 === 0x6D) { instr = 'LD L, L'; len = 1; }
    else if (b0 === 0x6E) { instr = 'LD L, (HL)'; len = 1; }
    else if (b0 === 0x77) { instr = 'LD (HL), A'; len = 1; }
    else if (b0 === 0x70) { instr = 'LD (HL), B'; len = 1; }
    else if (b0 === 0x71) { instr = 'LD (HL), C'; len = 1; }
    else if (b0 === 0x72) { instr = 'LD (HL), D'; len = 1; }
    else if (b0 === 0x73) { instr = 'LD (HL), E'; len = 1; }
    else if (b0 === 0x74) { instr = 'LD (HL), H'; len = 1; }
    else if (b0 === 0x75) { instr = 'LD (HL), L'; len = 1; }

    // 24-bit LD rr, imm24 (ADL)
    else if (b0 === 0x01) { const v = b1 | (b2 << 8) | (b3 << 16); instr = `LD BC, ${hex(v)}`; len = 4; }
    else if (b0 === 0x11) { const v = b1 | (b2 << 8) | (b3 << 16); instr = `LD DE, ${hex(v)}`; len = 4; }
    else if (b0 === 0x21) { const v = b1 | (b2 << 8) | (b3 << 16); instr = `LD HL, ${hex(v)}`; len = 4; }
    else if (b0 === 0x31) { const v = b1 | (b2 << 8) | (b3 << 16); instr = `LD SP, ${hex(v)}`; len = 4; }

    // LD A, (BC/DE)
    else if (b0 === 0x0A) { instr = 'LD A, (BC)'; len = 1; }
    else if (b0 === 0x1A) { instr = 'LD A, (DE)'; len = 1; }
    else if (b0 === 0x02) { instr = 'LD (BC), A'; len = 1; }
    else if (b0 === 0x12) { instr = 'LD (DE), A'; len = 1; }

    // LD A, (imm24) / LD (imm24), A
    else if (b0 === 0x3A) { const v = b1 | (b2 << 8) | (b3 << 16); instr = `LD A, (${hex(v)})`; len = 4; }
    else if (b0 === 0x32) { const v = b1 | (b2 << 8) | (b3 << 16); instr = `LD (${hex(v)}), A`; len = 4; }

    // LD HL, (imm24) / LD (imm24), HL
    else if (b0 === 0x2A) { const v = b1 | (b2 << 8) | (b3 << 16); instr = `LD HL, (${hex(v)})`; len = 4; }
    else if (b0 === 0x22) { const v = b1 | (b2 << 8) | (b3 << 16); instr = `LD (${hex(v)}), HL`; len = 4; }

    // PUSH/POP
    else if (b0 === 0xC5) { instr = 'PUSH BC'; len = 1; }
    else if (b0 === 0xD5) { instr = 'PUSH DE'; len = 1; }
    else if (b0 === 0xE5) { instr = 'PUSH HL'; len = 1; }
    else if (b0 === 0xF5) { instr = 'PUSH AF'; len = 1; }
    else if (b0 === 0xC1) { instr = 'POP BC'; len = 1; }
    else if (b0 === 0xD1) { instr = 'POP DE'; len = 1; }
    else if (b0 === 0xE1) { instr = 'POP HL'; len = 1; }
    else if (b0 === 0xF1) { instr = 'POP AF'; len = 1; }

    // ALU with A
    else if (b0 === 0xA7) { instr = 'AND A'; len = 1; }
    else if (b0 === 0xAF) { instr = 'XOR A'; len = 1; }
    else if (b0 === 0xB7) { instr = 'OR A'; len = 1; }
    else if (b0 === 0xBF) { instr = 'CP A'; len = 1; }
    else if (b0 === 0xFE) { instr = `CP ${hex(b1, 2)}`; len = 2; }
    else if (b0 === 0xE6) { instr = `AND ${hex(b1, 2)}`; len = 2; }
    else if (b0 === 0xF6) { instr = `OR ${hex(b1, 2)}`; len = 2; }
    else if (b0 === 0xEE) { instr = `XOR ${hex(b1, 2)}`; len = 2; }
    else if (b0 === 0xC6) { instr = `ADD A, ${hex(b1, 2)}`; len = 2; }
    else if (b0 === 0xD6) { instr = `SUB ${hex(b1, 2)}`; len = 2; }
    else if (b0 === 0xDE) { instr = `SBC A, ${hex(b1, 2)}`; len = 2; }
    else if (b0 === 0xCE) { instr = `ADC A, ${hex(b1, 2)}`; len = 2; }

    // ALU A, r
    else if (b0 >= 0x80 && b0 <= 0x87) { const r = ['B','C','D','E','H','L','(HL)','A'][b0-0x80]; instr = `ADD A, ${r}`; len = 1; }
    else if (b0 >= 0x88 && b0 <= 0x8F) { const r = ['B','C','D','E','H','L','(HL)','A'][b0-0x88]; instr = `ADC A, ${r}`; len = 1; }
    else if (b0 >= 0x90 && b0 <= 0x97) { const r = ['B','C','D','E','H','L','(HL)','A'][b0-0x90]; instr = `SUB ${r}`; len = 1; }
    else if (b0 >= 0x98 && b0 <= 0x9F) { const r = ['B','C','D','E','H','L','(HL)','A'][b0-0x98]; instr = `SBC A, ${r}`; len = 1; }
    else if (b0 >= 0xA0 && b0 <= 0xA7) { const r = ['B','C','D','E','H','L','(HL)','A'][b0-0xA0]; instr = `AND ${r}`; len = 1; }
    else if (b0 >= 0xA8 && b0 <= 0xAF) { const r = ['B','C','D','E','H','L','(HL)','A'][b0-0xA8]; instr = `XOR ${r}`; len = 1; }
    else if (b0 >= 0xB0 && b0 <= 0xB7) { const r = ['B','C','D','E','H','L','(HL)','A'][b0-0xB0]; instr = `OR ${r}`; len = 1; }
    else if (b0 >= 0xB8 && b0 <= 0xBF) { const r = ['B','C','D','E','H','L','(HL)','A'][b0-0xB8]; instr = `CP ${r}`; len = 1; }

    // INC/DEC r
    else if (b0 === 0x3C) { instr = 'INC A'; len = 1; }
    else if (b0 === 0x3D) { instr = 'DEC A'; len = 1; }
    else if (b0 === 0x04) { instr = 'INC B'; len = 1; }
    else if (b0 === 0x05) { instr = 'DEC B'; len = 1; }
    else if (b0 === 0x0C) { instr = 'INC C'; len = 1; }
    else if (b0 === 0x0D) { instr = 'DEC C'; len = 1; }
    else if (b0 === 0x14) { instr = 'INC D'; len = 1; }
    else if (b0 === 0x15) { instr = 'DEC D'; len = 1; }
    else if (b0 === 0x1C) { instr = 'INC E'; len = 1; }
    else if (b0 === 0x1D) { instr = 'DEC E'; len = 1; }
    else if (b0 === 0x24) { instr = 'INC H'; len = 1; }
    else if (b0 === 0x25) { instr = 'DEC H'; len = 1; }
    else if (b0 === 0x2C) { instr = 'INC L'; len = 1; }
    else if (b0 === 0x2D) { instr = 'DEC L'; len = 1; }
    else if (b0 === 0x34) { instr = 'INC (HL)'; len = 1; }
    else if (b0 === 0x35) { instr = 'DEC (HL)'; len = 1; }

    // INC/DEC rr (24-bit)
    else if (b0 === 0x03) { instr = 'INC BC'; len = 1; }
    else if (b0 === 0x0B) { instr = 'DEC BC'; len = 1; }
    else if (b0 === 0x13) { instr = 'INC DE'; len = 1; }
    else if (b0 === 0x1B) { instr = 'DEC DE'; len = 1; }
    else if (b0 === 0x23) { instr = 'INC HL'; len = 1; }
    else if (b0 === 0x2B) { instr = 'DEC HL'; len = 1; }
    else if (b0 === 0x33) { instr = 'INC SP'; len = 1; }
    else if (b0 === 0x3B) { instr = 'DEC SP'; len = 1; }

    // ADD HL, rr
    else if (b0 === 0x09) { instr = 'ADD HL, BC'; len = 1; }
    else if (b0 === 0x19) { instr = 'ADD HL, DE'; len = 1; }
    else if (b0 === 0x29) { instr = 'ADD HL, HL'; len = 1; }
    else if (b0 === 0x39) { instr = 'ADD HL, SP'; len = 1; }

    // Rotates
    else if (b0 === 0x07) { instr = 'RLCA'; len = 1; }
    else if (b0 === 0x0F) { instr = 'RRCA'; len = 1; }
    else if (b0 === 0x17) { instr = 'RLA'; len = 1; }
    else if (b0 === 0x1F) { instr = 'RRA'; len = 1; }

    // EX
    else if (b0 === 0xEB) { instr = 'EX DE, HL'; len = 1; }
    else if (b0 === 0x08) { instr = 'EX AF, AF\''; len = 1; }
    else if (b0 === 0xD9) { instr = 'EXX'; len = 1; }
    else if (b0 === 0xE3) { instr = 'EX (SP), HL'; len = 1; }

    // JP/JR/CALL/RST
    else if (b0 === 0xC3) { const v = b1 | (b2 << 8) | (b3 << 16); instr = `JP ${hex(v)}`; len = 4; }
    else if (b0 === 0xCA) { const v = b1 | (b2 << 8) | (b3 << 16); instr = `JP Z, ${hex(v)}`; len = 4; }
    else if (b0 === 0xC2) { const v = b1 | (b2 << 8) | (b3 << 16); instr = `JP NZ, ${hex(v)}`; len = 4; }
    else if (b0 === 0xDA) { const v = b1 | (b2 << 8) | (b3 << 16); instr = `JP C, ${hex(v)}`; len = 4; }
    else if (b0 === 0xD2) { const v = b1 | (b2 << 8) | (b3 << 16); instr = `JP NC, ${hex(v)}`; len = 4; }
    else if (b0 === 0xE9) { instr = 'JP (HL)'; len = 1; }

    else if (b0 === 0x18) { const off = (b1 > 127 ? b1 - 256 : b1); instr = `JR ${hex(pc + 2 + off)} (${off >= 0 ? '+' : ''}${off})`; len = 2; }
    else if (b0 === 0x28) { const off = (b1 > 127 ? b1 - 256 : b1); instr = `JR Z, ${hex(pc + 2 + off)} (${off >= 0 ? '+' : ''}${off})`; len = 2; }
    else if (b0 === 0x20) { const off = (b1 > 127 ? b1 - 256 : b1); instr = `JR NZ, ${hex(pc + 2 + off)} (${off >= 0 ? '+' : ''}${off})`; len = 2; }
    else if (b0 === 0x38) { const off = (b1 > 127 ? b1 - 256 : b1); instr = `JR C, ${hex(pc + 2 + off)} (${off >= 0 ? '+' : ''}${off})`; len = 2; }
    else if (b0 === 0x30) { const off = (b1 > 127 ? b1 - 256 : b1); instr = `JR NC, ${hex(pc + 2 + off)} (${off >= 0 ? '+' : ''}${off})`; len = 2; }
    else if (b0 === 0x10) { const off = (b1 > 127 ? b1 - 256 : b1); instr = `DJNZ ${hex(pc + 2 + off)} (${off >= 0 ? '+' : ''}${off})`; len = 2; }

    else if (b0 === 0xCD) { const v = b1 | (b2 << 8) | (b3 << 16); instr = `CALL ${hex(v)}`; len = 4; }
    else if (b0 === 0xCC) { const v = b1 | (b2 << 8) | (b3 << 16); instr = `CALL Z, ${hex(v)}`; len = 4; }
    else if (b0 === 0xC4) { const v = b1 | (b2 << 8) | (b3 << 16); instr = `CALL NZ, ${hex(v)}`; len = 4; }
    else if (b0 === 0xDC) { const v = b1 | (b2 << 8) | (b3 << 16); instr = `CALL C, ${hex(v)}`; len = 4; }
    else if (b0 === 0xD4) { const v = b1 | (b2 << 8) | (b3 << 16); instr = `CALL NC, ${hex(v)}`; len = 4; }

    else if (b0 === 0xC7) { instr = 'RST 0x00'; len = 1; }
    else if (b0 === 0xCF) { instr = 'RST 0x08'; len = 1; }
    else if (b0 === 0xD7) { instr = 'RST 0x10'; len = 1; }
    else if (b0 === 0xDF) { instr = 'RST 0x18'; len = 1; }
    else if (b0 === 0xE7) { instr = 'RST 0x20'; len = 1; }
    else if (b0 === 0xEF) { instr = 'RST 0x28'; len = 1; }
    else if (b0 === 0xF7) { instr = 'RST 0x30'; len = 1; }
    else if (b0 === 0xFF) { instr = 'RST 0x38'; len = 1; }

    // SCF, CCF, CPL, NEG(ED44), DAA
    else if (b0 === 0x37) { instr = 'SCF'; len = 1; }
    else if (b0 === 0x3F) { instr = 'CCF'; len = 1; }
    else if (b0 === 0x2F) { instr = 'CPL'; len = 1; }
    else if (b0 === 0x27) { instr = 'DAA'; len = 1; }

    // CB prefix
    else if (b0 === 0xCB) {
      const rName = ['B','C','D','E','H','L','(HL)','A'][b1 & 7];
      const op = (b1 >> 3) & 0x1f;
      if (b1 < 0x08) { instr = `RLC ${rName}`; }
      else if (b1 < 0x10) { instr = `RRC ${rName}`; }
      else if (b1 < 0x18) { instr = `RL ${rName}`; }
      else if (b1 < 0x20) { instr = `RR ${rName}`; }
      else if (b1 < 0x28) { instr = `SLA ${rName}`; }
      else if (b1 < 0x30) { instr = `SRA ${rName}`; }
      else if (b1 < 0x38) { instr = `SRL ${rName}`; } // Note: actually SWAP on some, but SRL on Z80
      else if (b1 < 0x40) { instr = `SRL ${rName}`; }
      else if (b1 < 0x80) { const bit = (b1 >> 3) & 7; instr = `BIT ${bit}, ${rName}`; }
      else if (b1 < 0xC0) { const bit = (b1 >> 3) & 7; instr = `RES ${bit}, ${rName}`; }
      else { const bit = (b1 >> 3) & 7; instr = `SET ${bit}, ${rName}`; }
      len = 2;
    }

    // ED prefix
    else if (b0 === 0xED) {
      if (b1 === 0xB0) { instr = 'LDIR'; len = 2; }
      else if (b1 === 0xB8) { instr = 'LDDR'; len = 2; }
      else if (b1 === 0xA0) { instr = 'LDI'; len = 2; }
      else if (b1 === 0xA8) { instr = 'LDD'; len = 2; }
      else if (b1 === 0xB1) { instr = 'CPIR'; len = 2; }
      else if (b1 === 0xB9) { instr = 'CPDR'; len = 2; }
      else if (b1 === 0x44) { instr = 'NEG'; len = 2; }
      else if (b1 === 0x4D) { instr = 'RETI'; len = 2; }
      else if (b1 === 0x45) { instr = 'RETN'; len = 2; }
      else if (b1 === 0x46) { instr = 'IM 0'; len = 2; }
      else if (b1 === 0x56) { instr = 'IM 1'; len = 2; }
      else if (b1 === 0x5E) { instr = 'IM 2'; len = 2; }
      else if (b1 === 0x47) { instr = 'LD I, A'; len = 2; }
      else if (b1 === 0x4F) { instr = 'LD R, A'; len = 2; }
      else if (b1 === 0x57) { instr = 'LD A, I'; len = 2; }
      else if (b1 === 0x5F) { instr = 'LD A, R'; len = 2; }
      else if (b1 === 0x67) { instr = 'RRD'; len = 2; }
      else if (b1 === 0x6F) { instr = 'RLD'; len = 2; }
      // ED LD rr, (imm24)
      else if (b1 === 0x4B) { const v = b2 | (b3 << 8) | (b4 << 16); instr = `LD BC, (${hex(v)})`; len = 5; }
      else if (b1 === 0x5B) { const v = b2 | (b3 << 8) | (b4 << 16); instr = `LD DE, (${hex(v)})`; len = 5; }
      else if (b1 === 0x6B) { const v = b2 | (b3 << 8) | (b4 << 16); instr = `LD HL, (${hex(v)})`; len = 5; }
      else if (b1 === 0x7B) { const v = b2 | (b3 << 8) | (b4 << 16); instr = `LD SP, (${hex(v)})`; len = 5; }
      // ED LD (imm24), rr
      else if (b1 === 0x43) { const v = b2 | (b3 << 8) | (b4 << 16); instr = `LD (${hex(v)}), BC`; len = 5; }
      else if (b1 === 0x53) { const v = b2 | (b3 << 8) | (b4 << 16); instr = `LD (${hex(v)}), DE`; len = 5; }
      else if (b1 === 0x63) { const v = b2 | (b3 << 8) | (b4 << 16); instr = `LD (${hex(v)}), HL`; len = 5; }
      else if (b1 === 0x73) { const v = b2 | (b3 << 8) | (b4 << 16); instr = `LD (${hex(v)}), SP`; len = 5; }
      // SBC/ADC HL, rr
      else if (b1 === 0x42) { instr = 'SBC HL, BC'; len = 2; }
      else if (b1 === 0x52) { instr = 'SBC HL, DE'; len = 2; }
      else if (b1 === 0x62) { instr = 'SBC HL, HL'; len = 2; }
      else if (b1 === 0x72) { instr = 'SBC HL, SP'; len = 2; }
      else if (b1 === 0x4A) { instr = 'ADC HL, BC'; len = 2; }
      else if (b1 === 0x5A) { instr = 'ADC HL, DE'; len = 2; }
      else if (b1 === 0x6A) { instr = 'ADC HL, HL'; len = 2; }
      else if (b1 === 0x7A) { instr = 'ADC HL, SP'; len = 2; }
      // IN/OUT
      else if (b1 === 0x78) { instr = 'IN A, (C)'; len = 2; }
      else if (b1 === 0x79) { instr = 'OUT (C), A'; len = 2; }
      // MLT (eZ80 specific)
      else if (b1 === 0x4C) { instr = 'MLT BC'; len = 2; }
      else if (b1 === 0x5C) { instr = 'MLT DE'; len = 2; }
      else if (b1 === 0x6C) { instr = 'MLT HL'; len = 2; }
      else if (b1 === 0x7C) { instr = 'MLT SP'; len = 2; }
      // TST A, n (eZ80)
      else if (b1 === 0x64) { instr = `TST A, ${hex(b2, 2)}`; len = 3; }
      else { instr = `ED ${hex(b1, 2)}`; len = 2; }
    }

    // DD prefix (IX)
    else if (b0 === 0xDD) {
      if (b1 === 0x21) { const v = b2 | (b3 << 8) | (b4 << 16); instr = `LD IX, ${hex(v)}`; len = 5; }
      else if (b1 === 0xE5) { instr = 'PUSH IX'; len = 2; }
      else if (b1 === 0xE1) { instr = 'POP IX'; len = 2; }
      else if (b1 === 0xE9) { instr = 'JP (IX)'; len = 2; }
      else if (b1 === 0x7E) { instr = `LD A, (IX+${hex(b2, 2)})`; len = 3; }
      else if (b1 === 0x46) { instr = `LD B, (IX+${hex(b2, 2)})`; len = 3; }
      else if (b1 === 0x4E) { instr = `LD C, (IX+${hex(b2, 2)})`; len = 3; }
      else if (b1 === 0x56) { instr = `LD D, (IX+${hex(b2, 2)})`; len = 3; }
      else if (b1 === 0x5E) { instr = `LD E, (IX+${hex(b2, 2)})`; len = 3; }
      else if (b1 === 0x66) { instr = `LD H, (IX+${hex(b2, 2)})`; len = 3; }
      else if (b1 === 0x6E) { instr = `LD L, (IX+${hex(b2, 2)})`; len = 3; }
      else if (b1 === 0x77) { instr = `LD (IX+${hex(b2, 2)}), A`; len = 3; }
      else if (b1 === 0x70) { instr = `LD (IX+${hex(b2, 2)}), B`; len = 3; }
      else if (b1 === 0x71) { instr = `LD (IX+${hex(b2, 2)}), C`; len = 3; }
      else if (b1 === 0x72) { instr = `LD (IX+${hex(b2, 2)}), D`; len = 3; }
      else if (b1 === 0x73) { instr = `LD (IX+${hex(b2, 2)}), E`; len = 3; }
      else if (b1 === 0x74) { instr = `LD (IX+${hex(b2, 2)}), H`; len = 3; }
      else if (b1 === 0x75) { instr = `LD (IX+${hex(b2, 2)}), L`; len = 3; }
      else if (b1 === 0x36) { instr = `LD (IX+${hex(b2, 2)}), ${hex(b3, 2)}`; len = 4; }
      else if (b1 === 0x09) { instr = 'ADD IX, BC'; len = 2; }
      else if (b1 === 0x19) { instr = 'ADD IX, DE'; len = 2; }
      else if (b1 === 0x29) { instr = 'ADD IX, IX'; len = 2; }
      else if (b1 === 0x39) { instr = 'ADD IX, SP'; len = 2; }
      else if (b1 === 0x23) { instr = 'INC IX'; len = 2; }
      else if (b1 === 0x2B) { instr = 'DEC IX'; len = 2; }
      else if (b1 === 0xBE) { instr = `CP (IX+${hex(b2, 2)})`; len = 3; }
      else if (b1 === 0xCB) { const bit = (b3 >> 3) & 7; const rN = ['B','C','D','E','H','L','(IX+d)','A'][b3 & 7]; if (b3 >= 0x40 && b3 < 0x80) instr = `BIT ${bit}, (IX+${hex(b2, 2)})`; else if (b3 >= 0xC0) instr = `SET ${bit}, (IX+${hex(b2, 2)})`; else if (b3 >= 0x80) instr = `RES ${bit}, (IX+${hex(b2, 2)})`; else instr = `DD CB ${hex(b2,2)} ${hex(b3,2)}`; len = 4; }
      else { instr = `DD ${hex(b1, 2)}`; len = 2; }
    }

    // FD prefix (IY)
    else if (b0 === 0xFD) {
      if (b1 === 0x21) { const v = b2 | (b3 << 8) | (b4 << 16); instr = `LD IY, ${hex(v)}`; len = 5; }
      else if (b1 === 0xE5) { instr = 'PUSH IY'; len = 2; }
      else if (b1 === 0xE1) { instr = 'POP IY'; len = 2; }
      else if (b1 === 0xE9) { instr = 'JP (IY)'; len = 2; }
      else if (b1 === 0x7E) { instr = `LD A, (IY+${hex(b2, 2)})`; len = 3; }
      else if (b1 === 0x46) { instr = `LD B, (IY+${hex(b2, 2)})`; len = 3; }
      else if (b1 === 0x4E) { instr = `LD C, (IY+${hex(b2, 2)})`; len = 3; }
      else if (b1 === 0x56) { instr = `LD D, (IY+${hex(b2, 2)})`; len = 3; }
      else if (b1 === 0x5E) { instr = `LD E, (IY+${hex(b2, 2)})`; len = 3; }
      else if (b1 === 0x66) { instr = `LD H, (IY+${hex(b2, 2)})`; len = 3; }
      else if (b1 === 0x6E) { instr = `LD L, (IY+${hex(b2, 2)})`; len = 3; }
      else if (b1 === 0x77) { instr = `LD (IY+${hex(b2, 2)}), A`; len = 3; }
      else if (b1 === 0x70) { instr = `LD (IY+${hex(b2, 2)}), B`; len = 3; }
      else if (b1 === 0x71) { instr = `LD (IY+${hex(b2, 2)}), C`; len = 3; }
      else if (b1 === 0x72) { instr = `LD (IY+${hex(b2, 2)}), D`; len = 3; }
      else if (b1 === 0x73) { instr = `LD (IY+${hex(b2, 2)}), E`; len = 3; }
      else if (b1 === 0x74) { instr = `LD (IY+${hex(b2, 2)}), H`; len = 3; }
      else if (b1 === 0x75) { instr = `LD (IY+${hex(b2, 2)}), L`; len = 3; }
      else if (b1 === 0x36) { instr = `LD (IY+${hex(b2, 2)}), ${hex(b3, 2)}`; len = 4; }
      else if (b1 === 0x09) { instr = 'ADD IY, BC'; len = 2; }
      else if (b1 === 0x19) { instr = 'ADD IY, DE'; len = 2; }
      else if (b1 === 0x29) { instr = 'ADD IY, IY'; len = 2; }
      else if (b1 === 0x39) { instr = 'ADD IY, SP'; len = 2; }
      else if (b1 === 0xCB) { const bit = (b3 >> 3) & 7; if (b3 >= 0x40 && b3 < 0x80) instr = `BIT ${bit}, (IY+${hex(b2, 2)})`; else if (b3 >= 0xC0) instr = `SET ${bit}, (IY+${hex(b2, 2)})`; else if (b3 >= 0x80) instr = `RES ${bit}, (IY+${hex(b2, 2)})`; else instr = `FD CB ${hex(b2,2)} ${hex(b3,2)}`; len = 4; }
      else { instr = `FD ${hex(b1, 2)}`; len = 2; }
    }

    // OUT (n), A / IN A, (n)
    else if (b0 === 0xD3) { instr = `OUT (${hex(b1, 2)}), A`; len = 2; }
    else if (b0 === 0xDB) { instr = `IN A, (${hex(b1, 2)})`; len = 2; }

    else { instr = `DB ${hex(b0, 2)}`; len = 1; }

    const addrStr = hex(pc);
    const bytesStr = rawHex.slice(0, len).join(' ');
    console.log(`    ${addrStr}  ${bytesStr.padEnd(18)} ${instr}`);
    pc += len;
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 148: IPoint Coordinate Input Mechanism ===\n');

  // ══════════════════════════════════════════════════════════════════════════
  // PART A: Disassemble IPoint entry to VRAM computation
  // ══════════════════════════════════════════════════════════════════════════

  console.log(`${'='.repeat(70)}`);
  console.log('PART A: Disassemble IPoint 0x07B451 to 0x07B5B0');
  console.log(`${'='.repeat(70)}`);

  disasmRange('IPoint entry -> VRAM compute', 0x07B451, 0x07B5B0);

  // ══════════════════════════════════════════════════════════════════════════
  // PART B: Register-input test
  // ══════════════════════════════════════════════════════════════════════════

  console.log(`\n${'='.repeat(70)}`);
  console.log('PART B: Register-input test — vary BC and DE');
  console.log(`${'='.repeat(70)}\n`);

  const testCases = [
    { label: 'BC=0x50(C=80), DE=0xA0(E=160)', bc: 0x000050, de: 0x0000A0 },
    { label: 'BC=0x14(C=20), DE=0xA0(E=160)', bc: 0x000014, de: 0x0000A0 },
    { label: 'BC=0x50(C=80), DE=0x32(E=50)',  bc: 0x000050, de: 0x000032 },
    { label: 'BC=0x50(C=80), DE=0xC8(E=200)', bc: 0x000050, de: 0x0000C8 },
  ];

  for (const tc of testCases) {
    console.log(`  Test: ${tc.label}`);

    const { mem, executor, cpu } = createRuntime();
    coldBoot(executor, cpu, mem);

    // MEM_INIT
    prepareCallState(cpu, mem);
    cpu.sp = STACK_RESET_TOP;
    cpu.sp -= 3;
    write24(mem, cpu.sp, MEMINIT_RET);
    cpu._iy = 0xD00080; cpu.mbase = 0xD0;
    callOSRoutine('MEM_INIT', MEMINIT_ENTRY, MEMINIT_RET, executor, cpu, mem, 100000);

    seedAllocator(mem);

    // Seed pixel dims
    write16(mem, PIX_WIDE_P_ADDR, 320);
    write16(mem, PIX_WIDE_M2_ADDR, 238);

    // Pen color
    mem[DRAW_COLOR_CODE_ADDR] = 0x10;
    mem[DRAW_COLOR_CODE_ADDR + 1] = 0x00;

    // Clear VRAM
    mem.fill(0, LCD_VRAM_ADDR, LCD_VRAM_ADDR + LCD_VRAM_SIZE);

    // IY flags
    mem[IY_PLUS_43_ADDR] |= 0x04;        // SET bit 2 of IY+43
    mem[IY_PLUS_74_ADDR] &= ~0x04;       // CLEAR bit 2 of IY+74
    mem[HOOKFLAGS3_ADDR] &= ~0x80;       // Clear bit 7
    mem[0xD00094] &= ~0x20;              // Clear bit 5 of IY+14

    // Prepare call
    prepareCallState(cpu, mem);
    cpu.a = 1;

    // Push return address
    cpu.sp -= 3;
    write24(mem, cpu.sp, IPOINT_RET);

    // Set BC and DE AFTER prepareCallState
    cpu._bc = tc.bc;
    cpu._de = tc.de;

    let returnHit = false;
    let steps = 0;
    try {
      executor.runFrom(IPOINT_ENTRY, 'adl', {
        maxSteps: 200,
        maxLoopIterations: 100,
        onBlock(pc) {
          steps++;
          const norm = pc & 0xffffff;
          if (norm === IPOINT_RET || norm === FAKE_RET) {
            returnHit = true;
            throw new Error('__RET__');
          }
        },
        onMissingBlock(pc) {
          steps++;
          const norm = pc & 0xffffff;
          if (norm === IPOINT_RET || norm === FAKE_RET) {
            returnHit = true;
            throw new Error('__RET__');
          }
        },
      });
    } catch (e) {
      if (e?.message !== '__RET__') throw e;
    }

    // Read VRAM addr from 0xD02A8A
    const vramAddr = read24(mem, 0xD02A8A);

    // Scan VRAM for changed bytes
    const changedAddrs = [];
    for (let i = 0; i < LCD_VRAM_SIZE && changedAddrs.length < 20; i++) {
      if (mem[LCD_VRAM_ADDR + i] !== 0) {
        changedAddrs.push(LCD_VRAM_ADDR + i);
      }
    }

    // Compute row/col from changed addresses
    const rows = new Set();
    const cols = new Set();
    for (const addr of changedAddrs) {
      const offset = addr - LCD_VRAM_ADDR;
      const row = Math.floor(offset / 640);  // 320 pixels * 2 bytes
      const pixelX = Math.floor((offset % 640) / 2);
      rows.add(row);
      cols.add(pixelX);
    }

    console.log(`    returned=${returnHit} steps=${steps}`);
    console.log(`    VRAM addr at 0xD02A8A: ${hex(vramAddr)}`);
    console.log(`    Changed VRAM bytes: ${changedAddrs.length}`);
    if (changedAddrs.length > 0) {
      console.log(`    First 5 changed: ${changedAddrs.slice(0, 5).map(a => hex(a)).join(', ')}`);
      console.log(`    VRAM rows: [${[...rows].sort((a,b)=>a-b).join(',')}]`);
      console.log(`    VRAM pixel X: [${[...cols].sort((a,b)=>a-b).join(',')}]`);
    }
    console.log('');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PART C: Trace register flow inside IPoint
  // ══════════════════════════════════════════════════════════════════════════

  console.log(`${'='.repeat(70)}`);
  console.log('PART C: Trace register flow — BC=0x50, DE=0xA0');
  console.log(`${'='.repeat(70)}\n`);

  {
    const { mem, executor, cpu } = createRuntime();
    coldBoot(executor, cpu, mem);

    prepareCallState(cpu, mem);
    cpu.sp = STACK_RESET_TOP;
    cpu.sp -= 3;
    write24(mem, cpu.sp, MEMINIT_RET);
    cpu._iy = 0xD00080; cpu.mbase = 0xD0;
    callOSRoutine('MEM_INIT', MEMINIT_ENTRY, MEMINIT_RET, executor, cpu, mem, 100000);

    seedAllocator(mem);
    write16(mem, PIX_WIDE_P_ADDR, 320);
    write16(mem, PIX_WIDE_M2_ADDR, 238);
    mem[DRAW_COLOR_CODE_ADDR] = 0x10;
    mem[DRAW_COLOR_CODE_ADDR + 1] = 0x00;
    mem.fill(0, LCD_VRAM_ADDR, LCD_VRAM_ADDR + LCD_VRAM_SIZE);
    mem[IY_PLUS_43_ADDR] |= 0x04;
    mem[IY_PLUS_74_ADDR] &= ~0x04;
    mem[HOOKFLAGS3_ADDR] &= ~0x80;
    mem[0xD00094] &= ~0x20;

    prepareCallState(cpu, mem);
    cpu.a = 1;
    cpu.sp -= 3;
    write24(mem, cpu.sp, IPOINT_RET);
    cpu._bc = 0x000050;
    cpu._de = 0x0000A0;

    let blockCount = 0;
    const traceLog = [];

    try {
      executor.runFrom(IPOINT_ENTRY, 'adl', {
        maxSteps: 200,
        maxLoopIterations: 100,
        onBlock(pc) {
          blockCount++;
          const norm = pc & 0xffffff;
          if (blockCount <= 80) {
            traceLog.push({
              pc: norm,
              a: cpu.a,
              b: cpu.b, c: cpu.c,
              d: cpu.d, e: cpu.e,
              h: cpu.h, l: cpu.l,
              f: cpu.f,
              bc: cpu._bc, de: cpu._de, hl: cpu._hl,
              ix: cpu._ix, sp: cpu.sp,
            });
          }
          if (norm === IPOINT_RET || norm === FAKE_RET) {
            throw new Error('__RET__');
          }
        },
        onMissingBlock(pc) {
          blockCount++;
          const norm = pc & 0xffffff;
          if (blockCount <= 80) {
            traceLog.push({
              pc: norm,
              a: cpu.a,
              b: cpu.b, c: cpu.c,
              d: cpu.d, e: cpu.e,
              h: cpu.h, l: cpu.l,
              f: cpu.f,
              bc: cpu._bc, de: cpu._de, hl: cpu._hl,
              ix: cpu._ix, sp: cpu.sp,
            });
          }
          if (norm === IPOINT_RET || norm === FAKE_RET) {
            throw new Error('__RET__');
          }
        },
      });
    } catch (e) {
      if (e?.message !== '__RET__') throw e;
    }

    console.log(`  Total blocks: ${blockCount}`);
    console.log(`  Trace (first ${traceLog.length} blocks):\n`);
    console.log(`  ${'PC'.padEnd(10)} ${'A'.padStart(4)} ${'F'.padStart(4)} ${'B'.padStart(4)} ${'C'.padStart(4)} ${'D'.padStart(4)} ${'E'.padStart(4)} ${'H'.padStart(4)} ${'L'.padStart(4)} ${'BC'.padEnd(10)} ${'DE'.padEnd(10)} ${'HL'.padEnd(10)}`);
    for (const t of traceLog) {
      console.log(`  ${hex(t.pc).padEnd(10)} ${String(t.a).padStart(4)} ${hex(t.f, 2).padStart(4)} ${String(t.b).padStart(4)} ${String(t.c).padStart(4)} ${String(t.d).padStart(4)} ${String(t.e).padStart(4)} ${String(t.h).padStart(4)} ${String(t.l).padStart(4)} ${hex(t.bc).padEnd(10)} ${hex(t.de).padEnd(10)} ${hex(t.hl).padEnd(10)}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PART D: Disassemble bounds-check subroutine at 0x07B793
  // ══════════════════════════════════════════════════════════════════════════

  console.log(`\n${'='.repeat(70)}`);
  console.log('PART D: Disassemble bounds-check 0x07B793 to 0x07B7E0');
  console.log(`${'='.repeat(70)}`);

  disasmRange('Bounds check subroutine', 0x07B793, 0x07B7E0);

  // Also dump any LD from RAM in the VRAM computation area 0x07B560-0x07B5B0
  console.log('\n  --- Extra: ROM bytes around VRAM computation 0x07B560-0x07B5B0 ---');
  for (let addr = 0x07B560; addr < 0x07B5B0; addr++) {
    // Look for 3A (LD A,(imm24)) or ED 4B/5B/6B (LD rr,(imm24))
    const b = romBytes[addr];
    if (b === 0x3A && addr + 3 < 0x07B5B0) {
      const target = romBytes[addr+1] | (romBytes[addr+2] << 8) | (romBytes[addr+3] << 16);
      if (target >= 0xD00000) {
        console.log(`    ${hex(addr)}: LD A, (${hex(target)})  <-- RAM read`);
      }
    }
    if (b === 0xED && addr + 4 < 0x07B5B0) {
      const b1 = romBytes[addr+1];
      if (b1 === 0x4B || b1 === 0x5B || b1 === 0x6B || b1 === 0x7B) {
        const target = romBytes[addr+2] | (romBytes[addr+3] << 8) | (romBytes[addr+4] << 16);
        if (target >= 0xD00000) {
          const rr = ['BC','DE','HL','SP'][(b1 >> 4) - 4];
          console.log(`    ${hex(addr)}: LD ${rr}, (${hex(target)})  <-- RAM read`);
        }
      }
    }
  }

  // Also scan the entire IPoint range 0x07B451-0x07B7E0 for any LD from RAM addresses
  console.log('\n  --- Full scan: all RAM reads (LD from 0xD0xxxx) in IPoint 0x07B451-0x07B7E0 ---');
  for (let addr = 0x07B451; addr < 0x07B7E0; addr++) {
    const b = romBytes[addr];

    // LD A, (imm24) = 0x3A xx xx xx
    if (b === 0x3A && addr + 3 < 0x07B7E0) {
      const target = romBytes[addr+1] | (romBytes[addr+2] << 8) | (romBytes[addr+3] << 16);
      if (target >= 0xD00000 && target < 0xD80000) {
        console.log(`    ${hex(addr)}: LD A, (${hex(target)})`);
      }
    }

    // LD HL, (imm24) = 0x2A xx xx xx
    if (b === 0x2A && addr + 3 < 0x07B7E0) {
      const target = romBytes[addr+1] | (romBytes[addr+2] << 8) | (romBytes[addr+3] << 16);
      if (target >= 0xD00000 && target < 0xD80000) {
        console.log(`    ${hex(addr)}: LD HL, (${hex(target)})`);
      }
    }

    // LD (imm24), A = 0x32 xx xx xx
    if (b === 0x32 && addr + 3 < 0x07B7E0) {
      const target = romBytes[addr+1] | (romBytes[addr+2] << 8) | (romBytes[addr+3] << 16);
      if (target >= 0xD00000 && target < 0xD80000) {
        console.log(`    ${hex(addr)}: LD (${hex(target)}), A`);
      }
    }

    // LD (imm24), HL = 0x22 xx xx xx
    if (b === 0x22 && addr + 3 < 0x07B7E0) {
      const target = romBytes[addr+1] | (romBytes[addr+2] << 8) | (romBytes[addr+3] << 16);
      if (target >= 0xD00000 && target < 0xD80000) {
        console.log(`    ${hex(addr)}: LD (${hex(target)}), HL`);
      }
    }

    // ED-prefixed LD rr, (imm24) — ED 4B/5B/6B/7B xx xx xx
    if (b === 0xED && addr + 4 < 0x07B7E0) {
      const b1 = romBytes[addr+1];
      if (b1 === 0x4B || b1 === 0x5B || b1 === 0x6B || b1 === 0x7B) {
        const target = romBytes[addr+2] | (romBytes[addr+3] << 8) | (romBytes[addr+4] << 16);
        if (target >= 0xD00000 && target < 0xD80000) {
          const rr = { 0x4B: 'BC', 0x5B: 'DE', 0x6B: 'HL', 0x7B: 'SP' }[b1];
          console.log(`    ${hex(addr)}: LD ${rr}, (${hex(target)})`);
        }
      }
      // ED-prefixed LD (imm24), rr — ED 43/53/63/73 xx xx xx
      if (b1 === 0x43 || b1 === 0x53 || b1 === 0x63 || b1 === 0x73) {
        const target = romBytes[addr+2] | (romBytes[addr+3] << 8) | (romBytes[addr+4] << 16);
        if (target >= 0xD00000 && target < 0xD80000) {
          const rr = { 0x43: 'BC', 0x53: 'DE', 0x63: 'HL', 0x73: 'SP' }[b1];
          console.log(`    ${hex(addr)}: LD (${hex(target)}), ${rr}`);
        }
      }
    }

    // FD CB xx xx — BIT/SET/RES (IY+d)
    if (b === 0xFD && addr + 3 < 0x07B7E0) {
      const b1 = romBytes[addr+1];
      if (b1 === 0xCB) {
        const d = romBytes[addr+2];
        const op = romBytes[addr+3];
        const bit = (op >> 3) & 7;
        const iyAddr = 0xD00080 + d;
        if (op >= 0x40 && op < 0x80) {
          console.log(`    ${hex(addr)}: BIT ${bit}, (IY+${hex(d,2)}) = BIT ${bit}, (${hex(iyAddr)})`);
        } else if (op >= 0x80 && op < 0xC0) {
          console.log(`    ${hex(addr)}: RES ${bit}, (IY+${hex(d,2)}) = RES ${bit}, (${hex(iyAddr)})`);
        } else if (op >= 0xC0) {
          console.log(`    ${hex(addr)}: SET ${bit}, (IY+${hex(d,2)}) = SET ${bit}, (${hex(iyAddr)})`);
        }
      }
    }
  }

  console.log('\n=== Phase 148 complete ===');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
