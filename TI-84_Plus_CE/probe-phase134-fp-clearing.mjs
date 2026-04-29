#!/usr/bin/env node

/**
 * Phase 134 — FP Category Byte Clearing Analysis
 *
 * During gcd(12,8) evaluation via ParseInp, the FP category byte at
 * 0xD0060E follows this lifecycle:
 *   1. Written to 0xFF at step ~1425 (PC=0x07CAEA)
 *   2. Cleared back to 0x00 at step ~1688 (detected at PC=0x07FA7F)
 *   3. Manual seed of 0x28 overwritten to 0x00 at step ~666 (detected at PC=0x0828C0)
 *
 * This probe:
 *   1. Runs gcd(12,8) with fine-grained step logging around steps 660-680
 *      and 1680-1700 to capture the exact PC trail leading to each clear
 *   2. Static ROM disassembly of both clearing regions in proper eZ80 ADL mode
 *   3. Determines whether clears are cleanup (post-op reset) or init (pre-op zero)
 *   4. Recommends fix direction
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';

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

const MEMINIT_ENTRY = 0x09dee0;
const MEMINIT_RET = 0x7ffff6;
const PARSEINP_ENTRY = 0x099914;

const USERMEM_ADDR = 0xd1a881;
const EMPTY_VAT_ADDR = 0xd3ffff;
const TOKEN_BUFFER_ADDR = 0xd00800;
const OP1_ADDR = 0xd005f8;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;
const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;

const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const FP_CATEGORY_ADDR = 0xd0060e;

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

// gcd(12,8): BB 18 = gcd(, 31 32 = "12", 2B = comma, 38 = "8", 11 = ), 3F = end
const INPUT_TOKENS = Uint8Array.from([0xbb, 0x18, 0x31, 0x32, 0x2b, 0x38, 0x11, 0x3f]);

const MEMINIT_BUDGET = 100000;
const PARSEINP_BUDGET = 2000000;
const MAX_LOOP_ITER = 8192;
const RECENT_PC_LIMIT = 128;

// ── Utilities ──────────────────────────────────────────────────────────────

const hex = (v, w = 6) =>
  v === undefined || v === null
    ? 'n/a'
    : `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;

const read24 = (m, a) =>
  ((m[a] & 0xff) | ((m[a + 1] & 0xff) << 8) | ((m[a + 2] & 0xff) << 16)) >>> 0;

function write24(m, a, v) {
  m[a] = v & 0xff;
  m[a + 1] = (v >>> 8) & 0xff;
  m[a + 2] = (v >>> 16) & 0xff;
}

function hexBytes(m, a, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push((m[a + i] & 0xff).toString(16).toUpperCase().padStart(2, '0'));
  return out.join(' ');
}

const memWrap = (m) => ({
  write8(a, v) { m[a] = v & 0xff; },
  read8(a) { return m[a] & 0xff; },
});

function safeReadReal(w, a) {
  try { return readReal(w, a); }
  catch (e) { return `readReal error: ${e?.message ?? e}`; }
}

function formatValue(v) {
  return typeof v === 'number' && Number.isFinite(v)
    ? v.toFixed(6).replace(/\.?0+$/, '')
    : String(v);
}

// ── ADL-mode eZ80 disassembler (manual, correct 3-byte addresses) ─────────

function adlDisasm(buf, start, end) {
  const lines = [];
  let pc = start;
  const hex6 = n => '0x' + n.toString(16).toUpperCase().padStart(6, '0');
  const hex2 = n => '0x' + n.toString(16).toUpperCase().padStart(2, '0');

  while (pc < end) {
    const b0 = buf[pc];
    let len = 1;
    let mnem = 'DB ' + hex2(b0);
    const nn3 = () => buf[pc + 1] | (buf[pc + 2] << 8) | (buf[pc + 3] << 16);
    const rel = () => { const d = buf[pc + 1]; return d < 128 ? d : d - 256; };

    // 4-byte (3-byte address) instructions
    if (b0 === 0x21) { len = 4; mnem = 'LD HL,' + hex6(nn3()); }
    else if (b0 === 0x11) { len = 4; mnem = 'LD DE,' + hex6(nn3()); }
    else if (b0 === 0x01) { len = 4; mnem = 'LD BC,' + hex6(nn3()); }
    else if (b0 === 0x31) { len = 4; mnem = 'LD SP,' + hex6(nn3()); }
    else if (b0 === 0x3A) { len = 4; mnem = 'LD A,(' + hex6(nn3()) + ')'; }
    else if (b0 === 0x32) { len = 4; mnem = 'LD (' + hex6(nn3()) + '),A'; }
    else if (b0 === 0x22) { len = 4; mnem = 'LD (' + hex6(nn3()) + '),HL'; }
    else if (b0 === 0x2A) { len = 4; mnem = 'LD HL,(' + hex6(nn3()) + ')'; }
    else if (b0 === 0xCD) { len = 4; mnem = 'CALL ' + hex6(nn3()); }
    else if (b0 === 0xC3) { len = 4; mnem = 'JP ' + hex6(nn3()); }
    else if (b0 === 0xC2) { len = 4; mnem = 'JP NZ,' + hex6(nn3()); }
    else if (b0 === 0xCA) { len = 4; mnem = 'JP Z,' + hex6(nn3()); }
    else if (b0 === 0xD2) { len = 4; mnem = 'JP NC,' + hex6(nn3()); }
    else if (b0 === 0xDA) { len = 4; mnem = 'JP C,' + hex6(nn3()); }
    else if (b0 === 0xCC) { len = 4; mnem = 'CALL Z,' + hex6(nn3()); }
    else if (b0 === 0xC4) { len = 4; mnem = 'CALL NZ,' + hex6(nn3()); }
    else if (b0 === 0xD4) { len = 4; mnem = 'CALL NC,' + hex6(nn3()); }
    else if (b0 === 0xDC) { len = 4; mnem = 'CALL C,' + hex6(nn3()); }
    // 2-byte instructions
    else if (b0 === 0x3E) { len = 2; mnem = 'LD A,' + hex2(buf[pc + 1]); }
    else if (b0 === 0x06) { len = 2; mnem = 'LD B,' + hex2(buf[pc + 1]); }
    else if (b0 === 0x0E) { len = 2; mnem = 'LD C,' + hex2(buf[pc + 1]); }
    else if (b0 === 0x16) { len = 2; mnem = 'LD D,' + hex2(buf[pc + 1]); }
    else if (b0 === 0x1E) { len = 2; mnem = 'LD E,' + hex2(buf[pc + 1]); }
    else if (b0 === 0x26) { len = 2; mnem = 'LD H,' + hex2(buf[pc + 1]); }
    else if (b0 === 0x2E) { len = 2; mnem = 'LD L,' + hex2(buf[pc + 1]); }
    else if (b0 === 0x36) { len = 2; mnem = 'LD (HL),' + hex2(buf[pc + 1]); }
    else if (b0 === 0x18) { len = 2; mnem = 'JR ' + hex6(pc + 2 + rel()); }
    else if (b0 === 0x20) { len = 2; mnem = 'JR NZ,' + hex6(pc + 2 + rel()); }
    else if (b0 === 0x28) { len = 2; mnem = 'JR Z,' + hex6(pc + 2 + rel()); }
    else if (b0 === 0x30) { len = 2; mnem = 'JR NC,' + hex6(pc + 2 + rel()); }
    else if (b0 === 0x38) { len = 2; mnem = 'JR C,' + hex6(pc + 2 + rel()); }
    else if (b0 === 0xE6) { len = 2; mnem = 'AND ' + hex2(buf[pc + 1]); }
    else if (b0 === 0xF6) { len = 2; mnem = 'OR ' + hex2(buf[pc + 1]); }
    else if (b0 === 0xEE) { len = 2; mnem = 'XOR ' + hex2(buf[pc + 1]); }
    else if (b0 === 0xFE) { len = 2; mnem = 'CP ' + hex2(buf[pc + 1]); }
    else if (b0 === 0xD6) { len = 2; mnem = 'SUB ' + hex2(buf[pc + 1]); }
    else if (b0 === 0xC6) { len = 2; mnem = 'ADD A,' + hex2(buf[pc + 1]); }
    else if (b0 === 0xDE) { len = 2; mnem = 'SBC A,' + hex2(buf[pc + 1]); }
    else if (b0 === 0xCE) { len = 2; mnem = 'ADC A,' + hex2(buf[pc + 1]); }
    // 1-byte instructions
    else if (b0 === 0x23) { mnem = 'INC HL'; }
    else if (b0 === 0x2B) { mnem = 'DEC HL'; }
    else if (b0 === 0x13) { mnem = 'INC DE'; }
    else if (b0 === 0x1B) { mnem = 'DEC DE'; }
    else if (b0 === 0x03) { mnem = 'INC BC'; }
    else if (b0 === 0x0B) { mnem = 'DEC BC'; }
    else if (b0 === 0x77) { mnem = 'LD (HL),A'; }
    else if (b0 === 0x7E) { mnem = 'LD A,(HL)'; }
    else if (b0 === 0x46) { mnem = 'LD B,(HL)'; }
    else if (b0 === 0x4E) { mnem = 'LD C,(HL)'; }
    else if (b0 === 0x56) { mnem = 'LD D,(HL)'; }
    else if (b0 === 0x5E) { mnem = 'LD E,(HL)'; }
    else if (b0 === 0x66) { mnem = 'LD H,(HL)'; }
    else if (b0 === 0x6E) { mnem = 'LD L,(HL)'; }
    else if (b0 === 0x78) { mnem = 'LD A,B'; }
    else if (b0 === 0x79) { mnem = 'LD A,C'; }
    else if (b0 === 0x7A) { mnem = 'LD A,D'; }
    else if (b0 === 0x7B) { mnem = 'LD A,E'; }
    else if (b0 === 0x7C) { mnem = 'LD A,H'; }
    else if (b0 === 0x7D) { mnem = 'LD A,L'; }
    else if (b0 === 0x47) { mnem = 'LD B,A'; }
    else if (b0 === 0x4F) { mnem = 'LD C,A'; }
    else if (b0 === 0x57) { mnem = 'LD D,A'; }
    else if (b0 === 0x5F) { mnem = 'LD E,A'; }
    else if (b0 === 0x67) { mnem = 'LD H,A'; }
    else if (b0 === 0x6F) { mnem = 'LD L,A'; }
    else if (b0 === 0xAF) { mnem = 'XOR A'; }
    else if (b0 === 0xB7) { mnem = 'OR A'; }
    else if (b0 === 0xA7) { mnem = 'AND A'; }
    else if (b0 === 0xC0) { mnem = 'RET NZ'; }
    else if (b0 === 0xC8) { mnem = 'RET Z'; }
    else if (b0 === 0xC9) { mnem = 'RET'; }
    else if (b0 === 0xD0) { mnem = 'RET NC'; }
    else if (b0 === 0xD8) { mnem = 'RET C'; }
    else if (b0 === 0xE1) { mnem = 'POP HL'; }
    else if (b0 === 0xD1) { mnem = 'POP DE'; }
    else if (b0 === 0xC1) { mnem = 'POP BC'; }
    else if (b0 === 0xF1) { mnem = 'POP AF'; }
    else if (b0 === 0xE5) { mnem = 'PUSH HL'; }
    else if (b0 === 0xD5) { mnem = 'PUSH DE'; }
    else if (b0 === 0xC5) { mnem = 'PUSH BC'; }
    else if (b0 === 0xF5) { mnem = 'PUSH AF'; }
    else if (b0 === 0x07) { mnem = 'RLCA'; }
    else if (b0 === 0x08) { mnem = "EX AF,AF'"; }
    else if (b0 === 0xEB) { mnem = 'EX DE,HL'; }
    else if (b0 === 0xE9) { mnem = 'JP (HL)'; }
    else if (b0 === 0x00) { mnem = 'NOP'; }
    else if (b0 === 0x37) { mnem = 'SCF'; }
    else if (b0 === 0x3F) { mnem = 'CCF'; }
    else if (b0 === 0x2F) { mnem = 'CPL'; }
    else if (b0 === 0x3C) { mnem = 'INC A'; }
    else if (b0 === 0x3D) { mnem = 'DEC A'; }
    else if (b0 === 0x04) { mnem = 'INC B'; }
    else if (b0 === 0x05) { mnem = 'DEC B'; }
    else if (b0 === 0x12) { mnem = 'LD (DE),A'; }
    else if (b0 === 0x1A) { mnem = 'LD A,(DE)'; }
    else if (b0 === 0x19) { mnem = 'ADD HL,DE'; }
    else if (b0 === 0x09) { mnem = 'ADD HL,BC'; }
    else if (b0 === 0x29) { mnem = 'ADD HL,HL'; }
    else if (b0 === 0xBF) { mnem = 'CP A'; }
    else if (b0 === 0xED) {
      len = 2;
      const b1 = buf[pc + 1];
      if (b1 === 0xB0) mnem = 'LDIR';
      else if (b1 === 0xB8) mnem = 'LDDR';
      else if (b1 === 0xA0) mnem = 'LDI';
      else if (b1 === 0x42) mnem = 'SBC HL,BC';
      else if (b1 === 0x52) mnem = 'SBC HL,DE';
      else mnem = 'ED ' + hex2(b1);
    }
    else if (b0 === 0xFD && buf[pc + 1] === 0xCB) {
      len = 4;
      const d = buf[pc + 2]; const op = buf[pc + 3];
      const bit = (op >> 3) & 7;
      if ((op & 0xC0) === 0x40) mnem = 'BIT ' + bit + ',(IY+' + d + ')';
      else if ((op & 0xC0) === 0xC0) mnem = 'SET ' + bit + ',(IY+' + d + ')';
      else if ((op & 0xC0) === 0x80) mnem = 'RES ' + bit + ',(IY+' + d + ')';
    }

    const bytes_arr = [];
    for (let i = 0; i < len; i++) bytes_arr.push(buf[pc + i]);
    const bytes_str = bytes_arr.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    lines.push(`  ${hex6(pc)}: ${bytes_str.padEnd(16)} ${mnem}`);
    pc += len;
  }
  return lines;
}

// ── Runtime setup ──────────────────────────────────────────────────────────

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const executor = createExecutor(BLOCKS, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
  });
  return { mem, executor, cpu: executor.cpu, wrap: memWrap(mem) };
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

function seedErrFrame(cpu, mem, ret, errRet = ERR_CATCH_ADDR, prev = 0) {
  cpu.sp -= 3;
  write24(mem, cpu.sp, ret);
  const base = (cpu.sp - 6) & 0xffffff;
  write24(mem, base, errRet);
  write24(mem, base + 3, prev);
  write24(mem, ERR_SP_ADDR, base);
  mem[ERR_NO_ADDR] = 0x00;
  return base;
}

function seedTokens(mem, tokens) {
  mem.fill(0x00, TOKEN_BUFFER_ADDR, TOKEN_BUFFER_ADDR + 0x80);
  mem.set(tokens, TOKEN_BUFFER_ADDR);
  write24(mem, BEGPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, CURPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, ENDPC_ADDR, TOKEN_BUFFER_ADDR + tokens.length);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
}

function seedAllocator(mem) {
  write24(mem, OPBASE_ADDR, EMPTY_VAT_ADDR);
  write24(mem, OPS_ADDR, EMPTY_VAT_ADDR);
  mem.fill(0x00, PTEMPCNT_ADDR, PTEMPCNT_ADDR + 4);
  write24(mem, PTEMP_ADDR, EMPTY_VAT_ADDR);
  write24(mem, PROGPTR_ADDR, EMPTY_VAT_ADDR);
  write24(mem, FPSBASE_ADDR, USERMEM_ADDR);
  write24(mem, FPS_ADDR, USERMEM_ADDR);
  write24(mem, NEWDATA_PTR_ADDR, USERMEM_ADDR);
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 134: FP Category Byte Clearing Analysis ===');
  console.log('');

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 1: Fine-grained step logging around steps 660-680 and 1680-1700
  // ══════════════════════════════════════════════════════════════════════════

  console.log('--- Test 1: Fine-grained PC trail around clearing steps ---');
  console.log(`Input tokens: [${Array.from(INPUT_TOKENS, b => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(', ')}]`);
  console.log('');

  {
    const { mem, executor, cpu, wrap } = createRuntime();
    coldBoot(executor, cpu, mem);

    // MEM_INIT
    prepareCallState(cpu, mem);
    cpu.sp -= 3;
    write24(mem, cpu.sp, MEMINIT_RET);
    let meminitOk = false;
    try {
      executor.runFrom(MEMINIT_ENTRY, 'adl', {
        maxSteps: MEMINIT_BUDGET,
        maxLoopIterations: MAX_LOOP_ITER,
        onBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
        onMissingBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
      });
    } catch (e) {
      if (e?.message === '__RET__') meminitOk = true; else throw e;
    }
    console.log(`  MEM_INIT: ${meminitOk ? 'OK' : 'FAILED'}`);
    if (!meminitOk) { process.exitCode = 1; return; }

    // Seed tokens + allocator
    seedTokens(mem, INPUT_TOKENS);
    seedAllocator(mem);

    // Manually seed 0xD0060E = 0x28 so we can watch it get cleared at step ~666
    mem[FP_CATEGORY_ADDR] = 0x28;

    const fpCatWrites = [];
    let prevFpCat = 0x28;
    let stepCount = 0;
    const recentPcs = [];
    let finalPc = null;
    let returnHit = false;
    let errCaught = false;

    // Detailed step log for windows around clearing events
    const detailedSteps = [];
    const WINDOW1_LO = 650, WINDOW1_HI = 690;
    const WINDOW2_LO = 1670, WINDOW2_HI = 1710;

    prepareCallState(cpu, mem);
    seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);
    // Re-seed after prepareCallState
    mem[FP_CATEGORY_ADDR] = 0x28;

    try {
      executor.runFrom(PARSEINP_ENTRY, 'adl', {
        maxSteps: PARSEINP_BUDGET,
        maxLoopIterations: MAX_LOOP_ITER,
        onBlock(pc, _m, _meta, step) {
          const norm = pc & 0xffffff;
          finalPc = norm;
          if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
          recentPcs.push(norm);
          if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();

          // Detailed logging in windows
          const inW1 = stepCount >= WINDOW1_LO && stepCount <= WINDOW1_HI;
          const inW2 = stepCount >= WINDOW2_LO && stepCount <= WINDOW2_HI;
          if (inW1 || inW2) {
            detailedSteps.push({
              step: stepCount,
              pc: norm,
              fpCat: mem[FP_CATEGORY_ADDR] & 0xff,
              trail: recentPcs.slice(-10).map(p => hex(p)),
            });
          }

          // FP category write watchpoint
          const curFpCat = mem[FP_CATEGORY_ADDR] & 0xff;
          if (curFpCat !== prevFpCat) {
            const trail = recentPcs.slice(-12).map(p => hex(p)).join(' -> ');
            fpCatWrites.push({ step: stepCount, pc: norm, from: prevFpCat, to: curFpCat, trail });
            prevFpCat = curFpCat;
          }

          if (norm === FAKE_RET) throw new Error('__RET__');
          if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
        },
        onMissingBlock(pc, _m, step) {
          const norm = pc & 0xffffff;
          finalPc = norm;
          if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
          recentPcs.push(norm);
          if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
          if (norm === FAKE_RET) throw new Error('__RET__');
          if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
        },
      });
    } catch (e) {
      if (e?.message === '__RET__') { returnHit = true; finalPc = FAKE_RET; }
      else if (e?.message === '__ERR__') { errCaught = true; finalPc = ERR_CATCH_ADDR; }
      else throw e;
    }

    console.log(`  ParseInp result: returnHit=${returnHit} errCaught=${errCaught} steps=${stepCount} finalPc=${hex(finalPc)}`);
    console.log(`  Final errNo: ${hex(mem[ERR_NO_ADDR] & 0xff, 2)}`);
    console.log(`  Final FP cat: ${hex(mem[FP_CATEGORY_ADDR] & 0xff, 2)}`);
    console.log('');

    // FP category write log (ALL writes)
    console.log(`  FP category (0xD0060E) writes detected (${fpCatWrites.length}):`);
    for (const w of fpCatWrites) {
      console.log(`    step=${w.step} PC=${hex(w.pc)} fpCat: ${hex(w.from, 2)} -> ${hex(w.to, 2)}`);
      console.log(`      trail: ${w.trail}`);
    }
    console.log('');

    // Detailed step logs around window 1
    const w1steps = detailedSteps.filter(s => s.step >= WINDOW1_LO && s.step <= WINDOW1_HI);
    console.log(`  Window 1 (steps ${WINDOW1_LO}-${WINDOW1_HI}, around clearing at step ~666):`);
    for (const s of w1steps) {
      console.log(`    step=${s.step} PC=${hex(s.pc)} fpCat=${hex(s.fpCat, 2)} trail=[${s.trail.join(',')}]`);
    }
    console.log('');

    // Detailed step logs around window 2
    const w2steps = detailedSteps.filter(s => s.step >= WINDOW2_LO && s.step <= WINDOW2_HI);
    console.log(`  Window 2 (steps ${WINDOW2_LO}-${WINDOW2_HI}, around clearing at step ~1688):`);
    for (const s of w2steps) {
      console.log(`    step=${s.step} PC=${hex(s.pc)} fpCat=${hex(s.fpCat, 2)} trail=[${s.trail.join(',')}]`);
    }
    console.log('');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 2: Static ROM disassembly — Region 1 (PC=0x07FA7F area)
  // ══════════════════════════════════════════════════════════════════════════

  console.log('--- Test 2: Static ROM disassembly — Region 1 (around 0x07FA5C-0x07FA94) ---');
  console.log('');
  console.log('  This is the "FP register initialization" subroutine.');
  console.log('  Multiple entry points load HL with different FP register addresses.');
  console.log('  Entry at 0x07FA5C loads HL=0xD0060E (the FP category byte address).');
  console.log('');

  const region1 = adlDisasm(romBytes, 0x07FA40, 0x07FA95);
  for (const line of region1) console.log(line);
  console.log('');

  console.log('  ANALYSIS — Region 1 (PC=0x07FA7F):');
  console.log('  Flow when entered at 0x07FA5C:');
  console.log('    0x07FA5C: LD HL,0xD0060E    ; HL points to FP category byte');
  console.log('    0x07FA60: JR 0x07FA6C');
  console.log('    0x07FA6C: LD A,0x20          ; exponent value');
  console.log('    0x07FA6E: JR 0x07FA7A');
  console.log('    0x07FA7A: LD (HL),0x00       ; ** WRITES 0x00 to 0xD0060E **');
  console.log('    0x07FA7C: INC HL             ; HL = 0xD0060F');
  console.log('    0x07FA7D: LD (HL),0x80       ; writes 0x80 to 0xD0060F');
  console.log('    0x07FA7F: INC HL             ; HL = 0xD00610 (PC logged by watchpoint)');
  console.log('    0x07FA80: LD (HL),A          ; writes exponent (0x20) to 0xD00610');
  console.log('    0x07FA81: XOR A              ; A = 0');
  console.log('    0x07FA82: JR 0x07FA86');
  console.log('    0x07FA86-0x07FA93: LD (HL),A; INC HL  x8  ; zeros remaining mantissa');
  console.log('    0x07FA94: RET');
  console.log('');
  console.log('  VERDICT: This initializes the 11-byte FP register at 0xD0060E');
  console.log('  to the constant value [0x00, 0x80, 0x20, 0x00, 0x00, 0x00, ...].');
  console.log('  Byte[0] = 0x00 is the category/type byte. This is an INITIALIZATION');
  console.log('  (setting up a clean FP value), NOT a targeted clear of the category.');
  console.log('');

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 3: Static ROM disassembly — Region 2 (PC=0x0828C0 area)
  // ══════════════════════════════════════════════════════════════════════════

  console.log('--- Test 3: Static ROM disassembly — Region 2 (around 0x082895-0x082930) ---');
  console.log('');
  console.log('  This is the "FP stack push" subsystem.');
  console.log('  Multiple entry points push different FP registers onto the FP stack.');
  console.log('');

  const region2 = adlDisasm(romBytes, 0x082895, 0x082930);
  for (const line of region2) console.log(line);
  console.log('');

  console.log('  ANALYSIS — Region 2 (PC=0x0828C0):');
  console.log('  The instruction at 0x0828C0 is: LD A,(0xD0060E)');
  console.log('  This READS 0xD0060E — it does NOT write to it.');
  console.log('  The write happened in the block that executed BEFORE this PC.');
  console.log('');
  console.log('  Flow entering at 0x0828BC:');
  console.log('    0x0828BC: CALL 0x0828F6       ; pushes FP reg at 0xD0060E onto FP stack');
  console.log('      0x0828F6: LD DE,0xD0060E');
  console.log('      0x0828FA: JR 0x082906');
  console.log('      0x082906: CALL 0x082912     ; adjusts FPS pointer');
  console.log('      0x08290A: JP 0x07F978       ; LDI x11: copies 11 bytes from (HL) to (DE)');
  console.log('    0x0828C0: LD A,(0xD0060E)     ; reads back the category for validation');
  console.log('    0x0828C4: AND 0x3F            ; mask off flags');
  console.log('    0x0828C6: CALL 0x07F7A8       ; checks if value is "valid"');
  console.log('    0x0828CA: RET NZ              ; return if valid (non-zero result)');
  console.log('    0x0828CB: CALL 0x07F898       ; copy FP reg to another location');
  console.log('');
  console.log('  The push at 0x0828F6 copies FROM the FP stack TO 0xD0060E.');
  console.log('  If the FP stack contains 0x00 at that position, 0xD0060E gets cleared.');
  console.log('  The watchpoint fires at the next block boundary (0x0828C0) after the');
  console.log('  LDI chain at 0x07F978 overwrites 0xD0060E with the stacked value.');
  console.log('');

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 4: Trace the LDI copy direction for both regions
  // ══════════════════════════════════════════════════════════════════════════

  console.log('--- Test 4: Subroutine at 0x07F978 (LDI copy chain) ---');
  console.log('');

  const ldiRegion = adlDisasm(romBytes, 0x07F960, 0x07F98B);
  for (const line of ldiRegion) console.log(line);
  console.log('');

  console.log('  ED A0 = LDI: copies (HL) -> (DE), HL++, DE++, BC--');
  console.log('  11 LDI instructions at 0x07F978..0x07F98A = copies 11 bytes');
  console.log('  Entry at 0x07F978: copies from (HL) to (DE) for 11 bytes.');
  console.log('');

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 5: 0x082912 subroutine (FPS adjustment)
  // ══════════════════════════════════════════════════════════════════════════

  console.log('--- Test 5: Subroutine at 0x082912 (FPS stack adjustment) ---');
  console.log('');

  const fpsRegion = adlDisasm(romBytes, 0x082912, 0x082930);
  for (const line of fpsRegion) console.log(line);
  console.log('');

  console.log('  0x082912: LD BC,9');
  console.log('  0x082916: LD HL,(0xD0258D)     ; HL = FPS (FP stack pointer)');
  console.log('  0x08291A: OR A                  ; clear carry');
  console.log('  0x08291B: SBC HL,BC             ; HL = FPS - 9');
  console.log('  ...JR to 0x08292B...');
  console.log('  0x08292B: LD (0xD0258D),HL      ; update FPS');
  console.log('  0x08292F: RET');
  console.log('');
  console.log('  This DECREMENTS FPS by 9 bytes, making room on the FP stack.');
  console.log('  After return, JP 0x07F978 copies 11 bytes from HL (old FPS) to DE.');
  console.log('  Wait — the push flow is:');
  console.log('    LD DE,0xD0060E               ; destination = FP register');
  console.log('    CALL 0x082912                 ; adjust FPS, returns with HL = new FPS');
  console.log('    JP 0x07F978                   ; LDI x11: copy (HL)->0xD0060E');
  console.log('');
  console.log('  So this is NOT a push — it is a POP. It copies FROM the FP stack');
  console.log('  INTO 0xD0060E. The FP stack had 0x00 at that position, so the');
  console.log('  category byte gets overwritten to 0x00.');
  console.log('');

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 6: Validation function at 0x07F7A8
  // ══════════════════════════════════════════════════════════════════════════

  console.log('--- Test 6: Validation function at 0x07F7A8 ---');
  console.log('');

  const valRegion = adlDisasm(romBytes, 0x07F7A4, 0x07F7C4);
  for (const line of valRegion) console.log(line);
  console.log('');

  console.log('  0x07F7A8: AND 0x3F              ; mask to 6-bit category');
  console.log('  0x07F7AA: CP 0x0C               ; check if == 0x0C');
  console.log('  0x07F7AC: RET Z                 ; return if Z (category == 0x0C)');
  console.log('  0x07F7AD: CP 0x1B               ; check if == 0x1B');
  console.log('  0x07F7AF: RET Z                 ; return if Z');
  console.log('  0x07F7B0: CP 0x1D               ; check if >= 0x1D');
  console.log('  0x07F7B2: JR NC,0x07F7B7        ; if >= 0x1D, go to range check');
  console.log('  0x07F7B4: CP 0x0C               ; sets flags: Z if ==0x0C, NZ if not');
  console.log('  0x07F7B6: RET                   ; returns NZ if category is in [0x0D..0x1C] range minus 0x1B');
  console.log('  0x07F7B7: CP 0x20               ; check if >= 0x20');
  console.log('  0x07F7B9: JR NC,0x07F7B4        ; if >= 0x20, always NZ');
  console.log('  0x07F7BB: CP A                   ; Z flag always set (A == A)');
  console.log('  0x07F7BC: RET                   ; returns Z for values 0x1D, 0x1E, 0x1F');
  console.log('');
  console.log('  Returns Z for: 0x0C, 0x1B, 0x1D, 0x1E, 0x1F');
  console.log('  Returns NZ for everything else including 0x00.');
  console.log('  When A=0x00: AND 0x3F -> 0x00; CP 0x0C -> NZ; CP 0x1B -> NZ;');
  console.log('  CP 0x1D -> C (0<0x1D); CP 0x0C -> NZ. Returns NZ.');
  console.log('  So the RET NZ at 0x0828CA fires and we skip the 0x07F898 copy.');
  console.log('');

  // ══════════════════════════════════════════════════════════════════════════
  // SUMMARY AND RECOMMENDATION
  // ══════════════════════════════════════════════════════════════════════════

  console.log('=== SUMMARY ===');
  console.log('');
  console.log('  INSTRUCTION AT PC=0x07FA7F:');
  console.log('    INC HL (opcode 0x23)');
  console.log('    This is NOT the clearing instruction itself.');
  console.log('    The actual clear is at 0x07FA7A: LD (HL),0x00 when HL=0xD0060E.');
  console.log('    The watchpoint detects the change at the next block boundary (0x07FA7F).');
  console.log('    This is part of an FP register initialization subroutine that writes');
  console.log('    [0x00, 0x80, exponent, 0, 0, 0, 0, 0, 0, 0, 0] to the 11-byte FP reg.');
  console.log('    NATURE: INITIALIZATION — writes a clean FP constant value.');
  console.log('');
  console.log('  INSTRUCTION AT PC=0x0828C0:');
  console.log('    LD A,(0xD0060E) (opcode 3A 0E 06 D0)');
  console.log('    This READS 0xD0060E — it does NOT write to it.');
  console.log('    The actual overwrite happened in the LDI chain at 0x07F978,');
  console.log('    called via JP from 0x08290A, which copies 11 bytes from the');
  console.log('    FP stack into the FP register at 0xD0060E.');
  console.log('    The FP stack had 0x00 at that position.');
  console.log('    NATURE: FP STACK POP — restores the FP register from the stack.');
  console.log('');
  console.log('  CLEARING AT STEP ~666 (0x0828C0):');
  console.log('    An FP stack pop overwrites the manually-seeded 0x28 with 0x00');
  console.log('    because the stack had not been properly populated.');
  console.log('    This is NOT a bug — it is normal stack restore behavior.');
  console.log('    The fix is to seed the category byte AFTER the pop, not before.');
  console.log('');
  console.log('  CLEARING AT STEP ~1688 (0x07FA7F):');
  console.log('    The FP register init subroutine writes byte[0]=0x00 as part of');
  console.log('    constructing a clean FP constant. The category byte 0xFF that was');
  console.log('    written at step ~1425 gets cleared by this initialization.');
  console.log('    This IS the root problem: the init subroutine zeros the category');
  console.log('    before the dispatch table reads it.');
  console.log('');
  console.log('  RECOMMENDATION:');
  console.log('    1. The step-666 clear is a normal FP stack pop. Not actionable.');
  console.log('       Do NOT try to prevent it — just seed the category AFTER stack pops.');
  console.log('    2. The step-1688 clear is the real blocker. The init subroutine at');
  console.log('       0x07FA5C zeros the category byte as part of constructing the FP');
  console.log('       constant. The category should be written AFTER this init, not before.');
  console.log('    3. Fix direction: find WHERE the category byte SHOULD be set (the');
  console.log('       writers at 0x095722/0x095765/0x0957FF) and ensure they execute');
  console.log('       AFTER the FP register init at 0x07FA5C, not before. The category');
  console.log('       writers should be called downstream of the init, or the init should');
  console.log('       preserve byte[0] instead of zeroing it.');
  console.log('    4. Alternative quick fix: in the transpiled block for 0x07FA5C,');
  console.log('       skip the LD (HL),0x00 when HL=0xD0060E and the byte is non-zero.');
  console.log('       But this is fragile — the proper fix is ensuring the writer runs');
  console.log('       after the init.');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
