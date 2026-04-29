#!/usr/bin/env node

/**
 * Phase 139 — FP gcd Manual Operand Seeding Test
 *
 * Tests whether the gcd handler at 0x06859B computes gcd(12, 8) correctly
 * when given properly-formatted FP stack operands, bypassing the broken
 * eval engine dispatch path.
 *
 * Test A: Direct gcd call with manually seeded FPS + OP1 + OP2
 * Test B: Dispatch entry (0x0686EF) with manual category + operands
 * Test C: ParseInp with operand intercept at dispatch
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

const MEMINIT_ENTRY = 0x09dee0;
const MEMINIT_RET = 0x7ffff6;
const PARSEINP_ENTRY = 0x099914;

const USERMEM_ADDR = 0xd1a881;
const EMPTY_VAT_ADDR = 0xd3ffff;
const TOKEN_BUFFER_ADDR = 0xd00800;
const OP1_ADDR = 0xd005f8;
const OP2_ADDR = 0xd00601;

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
const FP_DISPATCH_ADDR = 0x0686ef;
const GCD_HANDLER_ADDR = 0x06859b;
const FP_HANDLER_DISPATCH = 0x0689de;

const E_DOMAIN_ERROR_ADDR = 0x068d5d;

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const MEMINIT_BUDGET = 100000;
const MAX_LOOP_ITER = 8192;
const RECENT_PC_LIMIT = 128;

// FPS clean area for manual seeding
const FPS_CLEAN_AREA = 0xd1a900;

// BCD values
const BCD_12 = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_8  = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_4  = Uint8Array.from([0x00, 0x80, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

// gcd(12,8) tokens with correct close-paren 0x11
const GCD_TOKENS = Uint8Array.from([0xbb, 0x07, 0x31, 0x32, 0x2b, 0x38, 0x11, 0x3f]);

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

function errName(code) {
  if (code === 0x00) return 'none';
  if (code === 0x88) return 'E_Syntax';
  if (code === 0x8d) return 'E_Undefined';
  if (code === 0x84) return 'E_Domain';
  if (code === 0x80) return 'E_Edit';
  if (code === 0x81) return 'E_Overflow';
  return `unknown(${hex(code, 2)})`;
}

function matchesBCD4(mem, addr) {
  for (let i = 0; i < 9; i++) {
    if ((mem[addr + i] & 0xff) !== BCD_4[i]) return false;
  }
  return true;
}

// ── ADL-mode eZ80 mini-disassembler ────────────────────────────────────────

function disasmOne(buf, pc) {
  if (pc >= buf.length) return { len: 1, mnem: '(out of range)' };
  const b0 = buf[pc];
  let len = 1;
  let mnem = 'DB ' + hex(b0, 2);
  const nn3 = () => buf[pc + 1] | (buf[pc + 2] << 8) | (buf[pc + 3] << 16);

  if (b0 === 0x21) { len = 4; mnem = 'LD HL,' + hex(nn3()); }
  else if (b0 === 0x11) { len = 4; mnem = 'LD DE,' + hex(nn3()); }
  else if (b0 === 0x01) { len = 4; mnem = 'LD BC,' + hex(nn3()); }
  else if (b0 === 0x31) { len = 4; mnem = 'LD SP,' + hex(nn3()); }
  else if (b0 === 0x3A) { len = 4; mnem = 'LD A,(' + hex(nn3()) + ')'; }
  else if (b0 === 0x32) { len = 4; mnem = 'LD (' + hex(nn3()) + '),A'; }
  else if (b0 === 0x22) { len = 4; mnem = 'LD (' + hex(nn3()) + '),HL'; }
  else if (b0 === 0x2A) { len = 4; mnem = 'LD HL,(' + hex(nn3()) + ')'; }
  else if (b0 === 0xCD) { len = 4; mnem = 'CALL ' + hex(nn3()); }
  else if (b0 === 0xC3) { len = 4; mnem = 'JP ' + hex(nn3()); }
  else if (b0 === 0xC2) { len = 4; mnem = 'JP NZ,' + hex(nn3()); }
  else if (b0 === 0xCA) { len = 4; mnem = 'JP Z,' + hex(nn3()); }
  else if (b0 === 0xD2) { len = 4; mnem = 'JP NC,' + hex(nn3()); }
  else if (b0 === 0xDA) { len = 4; mnem = 'JP C,' + hex(nn3()); }
  else if (b0 === 0xCC) { len = 4; mnem = 'CALL Z,' + hex(nn3()); }
  else if (b0 === 0xC4) { len = 4; mnem = 'CALL NZ,' + hex(nn3()); }
  else if (b0 === 0xD4) { len = 4; mnem = 'CALL NC,' + hex(nn3()); }
  else if (b0 === 0xDC) { len = 4; mnem = 'CALL C,' + hex(nn3()); }
  else if (b0 === 0x3E) { len = 2; mnem = 'LD A,' + hex(buf[pc + 1], 2); }
  else if (b0 === 0x06) { len = 2; mnem = 'LD B,' + hex(buf[pc + 1], 2); }
  else if (b0 === 0x0E) { len = 2; mnem = 'LD C,' + hex(buf[pc + 1], 2); }
  else if (b0 === 0x16) { len = 2; mnem = 'LD D,' + hex(buf[pc + 1], 2); }
  else if (b0 === 0x1E) { len = 2; mnem = 'LD E,' + hex(buf[pc + 1], 2); }
  else if (b0 === 0x26) { len = 2; mnem = 'LD H,' + hex(buf[pc + 1], 2); }
  else if (b0 === 0x2E) { len = 2; mnem = 'LD L,' + hex(buf[pc + 1], 2); }
  else if (b0 === 0x36) { len = 2; mnem = 'LD (HL),' + hex(buf[pc + 1], 2); }
  else if (b0 === 0x18) { const d = buf[pc+1]; const rel = d < 128 ? d : d-256; len = 2; mnem = 'JR ' + hex(pc + 2 + rel); }
  else if (b0 === 0x20) { const d = buf[pc+1]; const rel = d < 128 ? d : d-256; len = 2; mnem = 'JR NZ,' + hex(pc + 2 + rel); }
  else if (b0 === 0x28) { const d = buf[pc+1]; const rel = d < 128 ? d : d-256; len = 2; mnem = 'JR Z,' + hex(pc + 2 + rel); }
  else if (b0 === 0x30) { const d = buf[pc+1]; const rel = d < 128 ? d : d-256; len = 2; mnem = 'JR NC,' + hex(pc + 2 + rel); }
  else if (b0 === 0x38) { const d = buf[pc+1]; const rel = d < 128 ? d : d-256; len = 2; mnem = 'JR C,' + hex(pc + 2 + rel); }
  else if (b0 === 0xE6) { len = 2; mnem = 'AND ' + hex(buf[pc + 1], 2); }
  else if (b0 === 0xF6) { len = 2; mnem = 'OR ' + hex(buf[pc + 1], 2); }
  else if (b0 === 0xEE) { len = 2; mnem = 'XOR ' + hex(buf[pc + 1], 2); }
  else if (b0 === 0xFE) { len = 2; mnem = 'CP ' + hex(buf[pc + 1], 2); }
  else if (b0 === 0xD6) { len = 2; mnem = 'SUB ' + hex(buf[pc + 1], 2); }
  else if (b0 === 0xC6) { len = 2; mnem = 'ADD A,' + hex(buf[pc + 1], 2); }
  else if (b0 === 0x23) { mnem = 'INC HL'; }
  else if (b0 === 0x2B) { mnem = 'DEC HL'; }
  else if (b0 === 0x13) { mnem = 'INC DE'; }
  else if (b0 === 0x1B) { mnem = 'DEC DE'; }
  else if (b0 === 0x03) { mnem = 'INC BC'; }
  else if (b0 === 0x0B) { mnem = 'DEC BC'; }
  else if (b0 === 0x77) { mnem = 'LD (HL),A'; }
  else if (b0 === 0x7E) { mnem = 'LD A,(HL)'; }
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
  else if (b0 === 0xE9) { mnem = 'JP (HL)'; }
  else if (b0 === 0x00) { mnem = 'NOP'; }
  else if (b0 === 0x37) { mnem = 'SCF'; }
  else if (b0 === 0x3F) { mnem = 'CCF'; }
  else if (b0 === 0x3C) { mnem = 'INC A'; }
  else if (b0 === 0x3D) { mnem = 'DEC A'; }
  else if (b0 === 0x12) { mnem = 'LD (DE),A'; }
  else if (b0 === 0x1A) { mnem = 'LD A,(DE)'; }
  else if (b0 === 0xEB) { mnem = 'EX DE,HL'; }
  else if (b0 === 0xED) {
    len = 2;
    const b1 = buf[pc + 1];
    if (b1 === 0xB0) mnem = 'LDIR';
    else if (b1 === 0xB8) mnem = 'LDDR';
    else if (b1 === 0xA0) mnem = 'LDI';
    else mnem = 'ED ' + hex(b1, 2);
  }

  return { len, mnem };
}

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

function runMemInit(executor, cpu, mem) {
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  let ok = false;
  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: MEMINIT_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
      onMissingBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
    });
  } catch (e) {
    if (e?.message === '__RET__') ok = true; else throw e;
  }
  return ok;
}

function seedFPSOperands(mem) {
  // Set FPS base and pointer to clean area
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA);

  // Push 12.0 (first operand) onto FPS
  mem.set(BCD_12, FPS_CLEAN_AREA);

  // Push 8.0 (second operand) onto FPS
  mem.set(BCD_8, FPS_CLEAN_AREA + 9);

  // Advance FPS pointer by 18 (two 9-byte entries)
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA + 18);

  // Also seed OP1 with 12.0 and OP2 with 8.0
  mem.set(BCD_12, OP1_ADDR);
  mem.set(BCD_8, OP2_ADDR);
}

function reportState(label, mem, cpu, opts = {}) {
  const errNo = mem[ERR_NO_ADDR] & 0xff;
  const fpCat = mem[FP_CATEGORY_ADDR] & 0xff;
  const fpsPtr = read24(mem, FPS_ADDR);
  const fpsBase = read24(mem, FPSBASE_ADDR);
  const fpsDepth = fpsPtr - fpsBase;

  console.log(`  ${label}:`);
  console.log(`    errNo: ${hex(errNo, 2)} (${errName(errNo)})`);
  console.log(`    FP category: ${hex(fpCat, 2)}`);
  console.log(`    OP1 (9 bytes): [${hexBytes(mem, OP1_ADDR, 9)}]`);
  console.log(`    OP2 (9 bytes): [${hexBytes(mem, OP2_ADDR, 9)}]`);
  console.log(`    FPS ptr: ${hex(fpsPtr)} (base: ${hex(fpsBase)}, depth: ${fpsDepth} bytes = ${(fpsDepth / 9) | 0} entries)`);
  if (fpsDepth > 0 && fpsDepth <= 90) {
    console.log(`    FPS data: [${hexBytes(mem, fpsBase, Math.min(fpsDepth, 45))}]`);
  }
  console.log(`    OP1 matches 4.0: ${matchesBCD4(mem, OP1_ADDR) ? 'YES' : 'NO'}`);

  if (opts.cpu) {
    console.log(`    CPU: A=${hex(cpu.a & 0xff, 2)} F=${hex(cpu.f & 0xff, 2)} HL=${hex(cpu._hl)} DE=${hex(cpu._de)} BC=${hex(cpu._bc)} SP=${hex(cpu.sp)}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 139: FP gcd Manual Operand Seeding Test ===');
  console.log('  Goal: gcd(12, 8) = 4.0');
  console.log('  BCD 12.0 = [00 81 12 00 00 00 00 00 00]');
  console.log('  BCD  8.0 = [00 80 80 00 00 00 00 00 00]');
  console.log('  BCD  4.0 = [00 80 40 00 00 00 00 00 00]');
  console.log('');

  const { mem, executor, cpu } = createRuntime();
  coldBoot(executor, cpu, mem);

  console.log('  MEM_INIT...');
  const meminitOk = runMemInit(executor, cpu, mem);
  console.log(`  MEM_INIT: ${meminitOk ? 'OK' : 'FAILED'}`);
  if (!meminitOk) { process.exitCode = 1; return; }
  console.log('');

  // Save post-MEM_INIT snapshot
  const memSnapshot = new Uint8Array(mem);
  const cpuSnapshot = {
    sp: cpu.sp, f: cpu.f, a: cpu.a,
    _hl: cpu._hl, _de: cpu._de, _bc: cpu._bc,
    _ix: cpu._ix, _iy: cpu._iy,
    mbase: cpu.mbase, madl: cpu.madl,
    iff1: cpu.iff1, iff2: cpu.iff2, halted: cpu.halted,
  };

  function restoreSnapshot() {
    mem.set(memSnapshot);
    Object.assign(cpu, cpuSnapshot);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST A: Direct gcd call with manually seeded FPS + OP1 + OP2
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('='.repeat(72));
  console.log('  TEST A: Direct gcd handler call (0x06859B) with manual operands');
  console.log('='.repeat(72));
  console.log('');

  {
    restoreSnapshot();
    prepareCallState(cpu, mem);

    // Seed operands
    seedFPSOperands(mem);
    seedAllocator(mem);

    // Set category = 0x28
    mem[FP_CATEGORY_ADDR] = 0x28;

    // Seed error frame
    seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

    reportState('Pre-call state', mem, cpu, { cpu: true });
    console.log('');

    // Track execution
    let stepCount = 0;
    const recentPcs = [];
    let finalPc = null;
    let returnHit = false;
    let errCaught = false;
    const missingBlocks = new Map();
    const keyHits = new Map([
      [GCD_HANDLER_ADDR, 0],
      [FP_HANDLER_DISPATCH, 0],
      [E_DOMAIN_ERROR_ADDR, 0],
      [FP_DISPATCH_ADDR, 0],
    ]);

    try {
      executor.runFrom(GCD_HANDLER_ADDR, 'adl', {
        maxSteps: 5000,
        maxLoopIterations: MAX_LOOP_ITER,
        onBlock(pc, _m, _meta, step) {
          const norm = pc & 0xffffff;
          finalPc = norm;
          if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
          recentPcs.push(norm);
          if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
          if (keyHits.has(norm)) keyHits.set(norm, keyHits.get(norm) + 1);
          if (norm === FAKE_RET) throw new Error('__RET__');
          if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
        },
        onMissingBlock(pc, _m, step) {
          const norm = pc & 0xffffff;
          finalPc = norm;
          if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
          recentPcs.push(norm);
          if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
          missingBlocks.set(norm, (missingBlocks.get(norm) || 0) + 1);
          if (norm === FAKE_RET) throw new Error('__RET__');
          if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
        },
      });
    } catch (e) {
      if (e?.message === '__RET__') { returnHit = true; finalPc = FAKE_RET; }
      else if (e?.message === '__ERR__') { errCaught = true; finalPc = ERR_CATCH_ADDR; }
      else throw e;
    }

    console.log(`  Result: ${returnHit ? 'RETURNED' : errCaught ? 'ERROR CAUGHT' : 'BUDGET EXHAUSTED'}`);
    console.log(`  Steps: ${stepCount}`);
    console.log(`  Final PC: ${hex(finalPc)}`);
    reportState('Post-call state', mem, cpu, { cpu: true });
    console.log('');

    console.log('  Key address hits:');
    for (const [addr, count] of keyHits) {
      console.log(`    ${hex(addr)}: ${count} hits`);
    }
    console.log('');

    if (missingBlocks.size > 0) {
      console.log(`  Missing blocks (${missingBlocks.size}):`);
      const sorted = [...missingBlocks.entries()].sort((a, b) => b[1] - a[1]);
      for (const [addr, count] of sorted.slice(0, 15)) {
        const disasm = (addr < 0x400000) ? disasmOne(romBytes, addr).mnem : '(RAM/sentinel)';
        console.log(`    ${hex(addr)}: ${count} hits | ${disasm}`);
      }
      console.log('');
    }

    console.log('  Last 20 PCs:');
    for (const pc of recentPcs.slice(-20)) {
      const disasm = (pc < 0x400000) ? disasmOne(romBytes, pc).mnem : '(RAM/sentinel)';
      console.log(`    ${hex(pc)} | ${disasm}`);
    }
    console.log('');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST B: Dispatch entry (0x0686EF) with manual category + operands
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('='.repeat(72));
  console.log('  TEST B: Dispatch entry (0x0686EF) with category=0x28 + manual operands');
  console.log('='.repeat(72));
  console.log('');

  {
    restoreSnapshot();
    prepareCallState(cpu, mem);

    // Seed operands
    seedFPSOperands(mem);
    seedAllocator(mem);

    // Set category = 0x28 (gcd)
    mem[FP_CATEGORY_ADDR] = 0x28;

    // Seed error frame
    seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

    reportState('Pre-dispatch state', mem, cpu, { cpu: true });
    console.log('');

    let stepCount = 0;
    const recentPcs = [];
    let finalPc = null;
    let returnHit = false;
    let errCaught = false;
    const missingBlocks = new Map();
    const keyHits = new Map([
      [GCD_HANDLER_ADDR, 0],
      [FP_HANDLER_DISPATCH, 0],
      [FP_DISPATCH_ADDR, 0],
      [E_DOMAIN_ERROR_ADDR, 0],
    ]);

    try {
      executor.runFrom(FP_DISPATCH_ADDR, 'adl', {
        maxSteps: 5000,
        maxLoopIterations: MAX_LOOP_ITER,
        onBlock(pc, _m, _meta, step) {
          const norm = pc & 0xffffff;
          finalPc = norm;
          if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
          recentPcs.push(norm);
          if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
          if (keyHits.has(norm)) keyHits.set(norm, keyHits.get(norm) + 1);
          if (norm === FAKE_RET) throw new Error('__RET__');
          if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
        },
        onMissingBlock(pc, _m, step) {
          const norm = pc & 0xffffff;
          finalPc = norm;
          if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
          recentPcs.push(norm);
          if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
          missingBlocks.set(norm, (missingBlocks.get(norm) || 0) + 1);
          if (norm === FAKE_RET) throw new Error('__RET__');
          if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
        },
      });
    } catch (e) {
      if (e?.message === '__RET__') { returnHit = true; finalPc = FAKE_RET; }
      else if (e?.message === '__ERR__') { errCaught = true; finalPc = ERR_CATCH_ADDR; }
      else throw e;
    }

    console.log(`  Result: ${returnHit ? 'RETURNED' : errCaught ? 'ERROR CAUGHT' : 'BUDGET EXHAUSTED'}`);
    console.log(`  Steps: ${stepCount}`);
    console.log(`  Final PC: ${hex(finalPc)}`);
    reportState('Post-dispatch state', mem, cpu, { cpu: true });
    console.log('');

    console.log('  Key address hits:');
    for (const [addr, count] of keyHits) {
      console.log(`    ${hex(addr)}: ${count} hits`);
    }
    console.log('');

    if (missingBlocks.size > 0) {
      console.log(`  Missing blocks (${missingBlocks.size}):`);
      const sorted = [...missingBlocks.entries()].sort((a, b) => b[1] - a[1]);
      for (const [addr, count] of sorted.slice(0, 15)) {
        const disasm = (addr < 0x400000) ? disasmOne(romBytes, addr).mnem : '(RAM/sentinel)';
        console.log(`    ${hex(addr)}: ${count} hits | ${disasm}`);
      }
      console.log('');
    }

    console.log('  Last 20 PCs:');
    for (const pc of recentPcs.slice(-20)) {
      const disasm = (pc < 0x400000) ? disasmOne(romBytes, pc).mnem : '(RAM/sentinel)';
      console.log(`    ${hex(pc)} | ${disasm}`);
    }
    console.log('');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST C: ParseInp path with operand pre-seeding at dispatch intercept
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('='.repeat(72));
  console.log('  TEST C: ParseInp with operand intercept at dispatch (0x0686EF)');
  console.log('='.repeat(72));
  console.log('');

  {
    restoreSnapshot();
    seedTokens(mem, GCD_TOKENS);
    seedAllocator(mem);
    prepareCallState(cpu, mem);
    seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);
    mem[FP_CATEGORY_ADDR] = 0x00;

    let stepCount = 0;
    const recentPcs = [];
    let finalPc = null;
    let returnHit = false;
    let errCaught = false;
    const missingBlocks = new Map();
    let intercepted = false;
    const keyHits = new Map([
      [GCD_HANDLER_ADDR, 0],
      [FP_HANDLER_DISPATCH, 0],
      [FP_DISPATCH_ADDR, 0],
      [E_DOMAIN_ERROR_ADDR, 0],
    ]);

    // errNo tracking
    let prevErrNo = mem[ERR_NO_ADDR] & 0xff;
    const errNoWrites = [];

    try {
      executor.runFrom(PARSEINP_ENTRY, 'adl', {
        maxSteps: 50000,
        maxLoopIterations: MAX_LOOP_ITER,
        onBlock(pc, _m, _meta, step) {
          const norm = pc & 0xffffff;
          finalPc = norm;
          if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
          recentPcs.push(norm);
          if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
          if (keyHits.has(norm)) keyHits.set(norm, keyHits.get(norm) + 1);

          // Intercept at FP dispatch: seed operands + category
          if (norm === FP_DISPATCH_ADDR && !intercepted) {
            intercepted = true;
            console.log(`  ** INTERCEPT at step ${stepCount}: seeding FPS + OP1 + OP2 + category **`);

            // Seed FPS with 12.0 and 8.0
            seedFPSOperands(mem);

            // Set category = 0x28
            mem[FP_CATEGORY_ADDR] = 0x28;

            console.log(`    FPS ptr now: ${hex(read24(mem, FPS_ADDR))}`);
            console.log(`    OP1: [${hexBytes(mem, OP1_ADDR, 9)}]`);
            console.log(`    OP2: [${hexBytes(mem, OP2_ADDR, 9)}]`);
            console.log(`    Category: ${hex(mem[FP_CATEGORY_ADDR], 2)}`);
            console.log('');
          }

          // Track errNo changes
          const curErrNo = mem[ERR_NO_ADDR] & 0xff;
          if (curErrNo !== prevErrNo) {
            errNoWrites.push({
              step: stepCount, pc: norm,
              from: prevErrNo, to: curErrNo,
              trail: recentPcs.slice(-8).map(p => hex(p)),
            });
            prevErrNo = curErrNo;
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
          missingBlocks.set(norm, (missingBlocks.get(norm) || 0) + 1);

          const curErrNo = mem[ERR_NO_ADDR] & 0xff;
          if (curErrNo !== prevErrNo) {
            errNoWrites.push({
              step: stepCount, pc: norm,
              from: prevErrNo, to: curErrNo,
              trail: recentPcs.slice(-8).map(p => hex(p)),
              missing: true,
            });
            prevErrNo = curErrNo;
          }

          if (norm === FAKE_RET) throw new Error('__RET__');
          if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
        },
      });
    } catch (e) {
      if (e?.message === '__RET__') { returnHit = true; finalPc = FAKE_RET; }
      else if (e?.message === '__ERR__') { errCaught = true; finalPc = ERR_CATCH_ADDR; }
      else throw e;
    }

    console.log(`  Result: ${returnHit ? 'RETURNED' : errCaught ? 'ERROR CAUGHT' : 'BUDGET EXHAUSTED'}`);
    console.log(`  Steps: ${stepCount}`);
    console.log(`  Final PC: ${hex(finalPc)}`);
    console.log(`  Intercepted: ${intercepted}`);
    reportState('Post-ParseInp state', mem, cpu, { cpu: true });
    console.log('');

    console.log('  Key address hits:');
    for (const [addr, count] of keyHits) {
      console.log(`    ${hex(addr)}: ${count} hits`);
    }
    console.log('');

    console.log(`  errNo transitions (${errNoWrites.length}):`);
    for (const w of errNoWrites) {
      const missTag = w.missing ? ' [MISSING BLOCK]' : '';
      console.log(`    step=${w.step} PC=${hex(w.pc)} ${hex(w.from, 2)}->${hex(w.to, 2)} (${errName(w.to)})${missTag}`);
      console.log(`      trail: ${w.trail.join(' -> ')}`);
    }
    console.log('');

    if (missingBlocks.size > 0) {
      console.log(`  Missing blocks (${missingBlocks.size}):`);
      const sorted = [...missingBlocks.entries()].sort((a, b) => b[1] - a[1]);
      for (const [addr, count] of sorted.slice(0, 15)) {
        const disasm = (addr < 0x400000) ? disasmOne(romBytes, addr).mnem : '(RAM/sentinel)';
        console.log(`    ${hex(addr)}: ${count} hits | ${disasm}`);
      }
      console.log('');
    }

    console.log('  Last 20 PCs:');
    for (const pc of recentPcs.slice(-20)) {
      const disasm = (pc < 0x400000) ? disasmOne(romBytes, pc).mnem : '(RAM/sentinel)';
      console.log(`    ${hex(pc)} | ${disasm}`);
    }
    console.log('');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('');
  console.log('='.repeat(72));
  console.log('  SUMMARY');
  console.log('='.repeat(72));
  console.log('');
  console.log('  Test A: Direct gcd handler (0x06859B) with manual FPS/OP1/OP2 seeding');
  console.log('  Test B: Dispatch entry (0x0686EF) with category=0x28 + manual operands');
  console.log('  Test C: ParseInp with operand intercept at dispatch point');
  console.log('  Expected result: OP1 = [00 80 40 00 00 00 00 00 00] = 4.0');
  console.log('');
  console.log('=== Phase 139 probe complete ===');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
