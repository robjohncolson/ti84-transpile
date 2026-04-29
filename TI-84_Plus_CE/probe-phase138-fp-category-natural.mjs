#!/usr/bin/env node

/**
 * Phase 138 — FP Category Byte Natural Write Test + E_Domain Investigation
 *
 * Tests whether the newly-seeded FP eval engine blocks (0x07E111, 0x07E14D,
 * 0x07E16D, 0x07E199) and category writers (0x095722, 0x095765, 0x0957FF)
 * now naturally write the FP category byte at 0xD0060E during gcd(12,8).
 *
 * Also investigates the E_Domain error at 0x068D5D by dumping OP1, OP2,
 * and OPS state when the error is triggered.
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
const FP_INIT_ADDR = 0x07fa5c;

// FP eval engine blocks (category writers from session 134)
const FP_EVAL_BLOCKS = [0x07e111, 0x07e14d, 0x07e16d, 0x07e199];

// Category writers from session 131
const CATEGORY_WRITERS = [0x095722, 0x095765, 0x0957ff];

// FP handler for gcd (category 0x28)
const GCD_HANDLER_ADDR = 0x06859b;
const FP_HANDLER_DISPATCH = 0x0689de;

// E_Domain error trail addresses
const E_DOMAIN_ERROR_ADDR = 0x068d5d;
const E_DOMAIN_TRAIL = [0x07cc1c, 0x0685f0, 0x068d6d, 0x068d5d];

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const MEMINIT_BUDGET = 100000;
const PARSEINP_BUDGET = 50000;
const SEEDED_BUDGET = 200000;
const MAX_LOOP_ITER = 8192;
const RECENT_PC_LIMIT = 128;

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

// ── ADL-mode eZ80 mini-disassembler ────────────────────────────────────────

function disasmOne(buf, pc) {
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

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 138: FP Category Byte Natural Write Test + E_Domain Investigation ===');
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 1: Check block existence at FP eval engine addresses (post-seeding)
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('--- Test 1: Block existence at FP addresses (after new seeds) ---');
  console.log('');

  console.log('  FP eval engine blocks (newly seeded in phase 138):');
  for (const addr of FP_EVAL_BLOCKS) {
    const exists = typeof BLOCKS[addr] === 'function';
    const disasm = disasmOne(romBytes, addr);
    console.log(`    ${hex(addr)}: ${exists ? 'EXISTS' : 'MISSING'} | ${disasm.mnem}`);
  }
  console.log('');

  console.log('  Category writer addresses (seeded in phase 132):');
  for (const addr of CATEGORY_WRITERS) {
    const exists = typeof BLOCKS[addr] === 'function';
    const disasm = disasmOne(romBytes, addr);
    console.log(`    ${hex(addr)}: ${exists ? 'EXISTS' : 'MISSING'} | ${disasm.mnem}`);
  }
  console.log('');

  console.log('  Other key addresses:');
  const otherAddrs = [
    [FP_DISPATCH_ADDR, 'FP dispatch table'],
    [FP_INIT_ADDR, 'FP register init (the clearer)'],
    [GCD_HANDLER_ADDR, 'gcd handler (cat 0x28)'],
    [FP_HANDLER_DISPATCH, 'FP handler dispatcher'],
    [PARSEINP_ENTRY, 'ParseInp entry'],
    [E_DOMAIN_ERROR_ADDR, 'E_Domain error site'],
  ];
  for (const [addr, label] of otherAddrs) {
    const exists = typeof BLOCKS[addr] === 'function';
    console.log(`    ${hex(addr)}: ${exists ? 'EXISTS' : 'MISSING'} | ${label}`);
  }
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 2: Natural gcd(12,8) — do new seeds write category byte?
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('--- Test 2: Natural gcd(12,8) — category byte write test ---');
  console.log(`  Tokens: [${Array.from(GCD_TOKENS, b => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(', ')}]`);
  console.log('');

  {
    const { mem, executor, cpu } = createRuntime();
    coldBoot(executor, cpu, mem);

    console.log('  MEM_INIT...');
    const meminitOk = runMemInit(executor, cpu, mem);
    console.log(`  MEM_INIT: ${meminitOk ? 'OK' : 'FAILED'}`);
    if (!meminitOk) { process.exitCode = 1; return; }

    // Save post-MEM_INIT snapshot for Test 3
    const memSnapshot = new Uint8Array(mem);

    // Seed for gcd(12,8)
    seedTokens(mem, GCD_TOKENS);
    seedAllocator(mem);
    prepareCallState(cpu, mem);
    seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);
    mem[FP_CATEGORY_ADDR] = 0x00;

    // Write-watchpoint state
    const fpCatWrites = [];
    let prevFpCat = 0x00;
    let prevErrNo = mem[ERR_NO_ADDR] & 0xff;
    const errNoWrites = [];

    // Track key address hits
    const keyAddrHits = new Map();
    const allKeyAddrs = [
      ...FP_EVAL_BLOCKS,
      ...CATEGORY_WRITERS,
      FP_DISPATCH_ADDR,
      FP_INIT_ADDR,
      GCD_HANDLER_ADDR,
      FP_HANDLER_DISPATCH,
      ...E_DOMAIN_TRAIL,
    ];
    for (const a of allKeyAddrs) keyAddrHits.set(a, 0);

    let initStep = -1;
    let dispatchStep = -1;
    let fpCatAtDispatch = -1;

    let stepCount = 0;
    const recentPcs = [];
    let finalPc = null;
    let returnHit = false;
    let errCaught = false;
    const missingBlocks = new Map();

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

          if (keyAddrHits.has(norm)) keyAddrHits.set(norm, keyAddrHits.get(norm) + 1);

          if (norm === FP_INIT_ADDR) initStep = stepCount;
          if (norm === FP_DISPATCH_ADDR) {
            dispatchStep = stepCount;
            fpCatAtDispatch = mem[FP_CATEGORY_ADDR] & 0xff;
          }

          // Write-watchpoint on FP category byte
          const curFpCat = mem[FP_CATEGORY_ADDR] & 0xff;
          if (curFpCat !== prevFpCat) {
            fpCatWrites.push({
              step: stepCount, pc: norm,
              from: prevFpCat, to: curFpCat,
              trail: recentPcs.slice(-8).map(p => hex(p)),
            });
            prevFpCat = curFpCat;
          }

          // Write-watchpoint on errNo
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

          const curFpCat = mem[FP_CATEGORY_ADDR] & 0xff;
          if (curFpCat !== prevFpCat) {
            fpCatWrites.push({
              step: stepCount, pc: norm,
              from: prevFpCat, to: curFpCat,
              trail: recentPcs.slice(-8).map(p => hex(p)),
              missing: true,
            });
            prevFpCat = curFpCat;
          }

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

    const finalErrNo = mem[ERR_NO_ADDR] & 0xff;
    const finalFpCat = mem[FP_CATEGORY_ADDR] & 0xff;

    console.log(`  Result: ${returnHit ? 'RETURNED' : errCaught ? 'ERROR CAUGHT' : 'BUDGET EXHAUSTED'}`);
    console.log(`  Steps: ${stepCount}`);
    console.log(`  Final PC: ${hex(finalPc)}`);
    console.log(`  errNo: ${hex(finalErrNo, 2)} (${errName(finalErrNo)})`);
    console.log(`  FP category (0xD0060E): ${hex(finalFpCat, 2)}`);
    console.log(`  OP1: [${hexBytes(mem, OP1_ADDR, 9)}]`);
    console.log(`  OP2: [${hexBytes(mem, OP2_ADDR, 9)}]`);
    console.log('');

    // FP category writes
    console.log(`  FP category (0xD0060E) writes (${fpCatWrites.length}):`);
    if (fpCatWrites.length === 0) {
      console.log('    NONE — category byte is NEVER written during natural gcd(12,8)');
    }
    for (const w of fpCatWrites) {
      const missTag = w.missing ? ' [MISSING BLOCK]' : '';
      console.log(`    step=${w.step} PC=${hex(w.pc)} ${hex(w.from, 2)}->${hex(w.to, 2)}${missTag}`);
      console.log(`      trail: ${w.trail.join(' -> ')}`);
    }
    console.log('');

    // errNo writes
    console.log(`  errNo writes (${errNoWrites.length}):`);
    for (const w of errNoWrites) {
      const missTag = w.missing ? ' [MISSING BLOCK]' : '';
      console.log(`    step=${w.step} PC=${hex(w.pc)} ${hex(w.from, 2)}->${hex(w.to, 2)} (${errName(w.to)})${missTag}`);
      console.log(`      trail: ${w.trail.join(' -> ')}`);
    }
    console.log('');

    // Key address hits
    console.log('  Key address hit counts:');
    console.log('    -- FP eval engine blocks (new seeds) --');
    for (const addr of FP_EVAL_BLOCKS) {
      const hits = keyAddrHits.get(addr);
      console.log(`    ${hex(addr)}: ${hits} hits`);
    }
    console.log('    -- Category writers --');
    for (const addr of CATEGORY_WRITERS) {
      const hits = keyAddrHits.get(addr);
      console.log(`    ${hex(addr)}: ${hits} hits`);
    }
    console.log('    -- Dispatch/handler --');
    for (const addr of [FP_DISPATCH_ADDR, FP_INIT_ADDR, GCD_HANDLER_ADDR, FP_HANDLER_DISPATCH]) {
      const hits = keyAddrHits.get(addr);
      console.log(`    ${hex(addr)}: ${hits} hits`);
    }
    console.log('    -- E_Domain trail --');
    for (const addr of E_DOMAIN_TRAIL) {
      const hits = keyAddrHits.get(addr);
      console.log(`    ${hex(addr)}: ${hits} hits`);
    }
    console.log('');

    // Init vs dispatch
    console.log('  Init (0x07FA5C) vs Dispatch (0x0686EF):');
    console.log(`    Init step: ${initStep === -1 ? 'NEVER REACHED' : initStep}`);
    console.log(`    Dispatch step: ${dispatchStep === -1 ? 'NEVER REACHED' : dispatchStep}`);
    console.log(`    Category at dispatch: ${fpCatAtDispatch === -1 ? 'n/a' : hex(fpCatAtDispatch, 2)}`);
    console.log('');

    // Missing blocks
    if (missingBlocks.size > 0) {
      console.log(`  Missing blocks (${missingBlocks.size}):`);
      const sorted = [...missingBlocks.entries()].sort((a, b) => b[1] - a[1]);
      for (const [addr, count] of sorted.slice(0, 15)) {
        const disasm = (addr < 0x400000) ? disasmOne(romBytes, addr).mnem : '(RAM/sentinel)';
        console.log(`    ${hex(addr)}: ${count} hits | ${disasm}`);
      }
    }
    console.log('');

    // ═══════════════════════════════════════════════════════════════════════════
    // TEST 3: Manual seed + E_Domain investigation
    // ═══════════════════════════════════════════════════════════════════════════

    console.log('--- Test 3: Manual seed + E_Domain investigation ---');
    console.log('  Inject mem[0xD0060E]=0x28 at dispatch, then dump OP1/OP2/OPS at E_Domain');
    console.log('');

    // Restore clean state
    mem.set(memSnapshot);
    seedTokens(mem, GCD_TOKENS);
    seedAllocator(mem);
    prepareCallState(cpu, mem);
    seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);
    mem[FP_CATEGORY_ADDR] = 0x00;

    let seededPrevErrNo = mem[ERR_NO_ADDR] & 0xff;
    const seededErrNoWrites = [];
    let seededStepCount = 0;
    const seededRecentPcs = [];
    let seededFinalPc = null;
    let seededReturnHit = false;
    let seededErrCaught = false;
    let seedInjected = false;
    const seededMissingBlocks = new Map();

    // E_Domain snapshot
    let eDomainSnapshot = null;

    const seededKeyHits = new Map();
    for (const a of allKeyAddrs) seededKeyHits.set(a, 0);

    try {
      executor.runFrom(PARSEINP_ENTRY, 'adl', {
        maxSteps: SEEDED_BUDGET,
        maxLoopIterations: MAX_LOOP_ITER,
        onBlock(pc, _m, _meta, step) {
          const norm = pc & 0xffffff;
          seededFinalPc = norm;
          if (typeof step === 'number') seededStepCount = Math.max(seededStepCount, step + 1);
          seededRecentPcs.push(norm);
          if (seededRecentPcs.length > RECENT_PC_LIMIT) seededRecentPcs.shift();

          if (seededKeyHits.has(norm)) seededKeyHits.set(norm, seededKeyHits.get(norm) + 1);

          // Inject category at dispatch
          if (norm === FP_DISPATCH_ADDR && !seedInjected) {
            mem[FP_CATEGORY_ADDR] = 0x28;
            seedInjected = true;
            console.log(`  ** INJECTED: mem[0xD0060E] = 0x28 at step ${seededStepCount} **`);
          }

          // Capture state at E_Domain error site
          if (norm === E_DOMAIN_ERROR_ADDR && !eDomainSnapshot) {
            const opsPtr = read24(mem, OPS_ADDR);
            const fpsPtr = read24(mem, FPS_ADDR);
            const fpsBase = read24(mem, FPSBASE_ADDR);
            const opBase = read24(mem, OPBASE_ADDR);
            eDomainSnapshot = {
              step: seededStepCount,
              errNo: mem[ERR_NO_ADDR] & 0xff,
              op1: hexBytes(mem, OP1_ADDR, 11),
              op2: hexBytes(mem, OP2_ADDR, 11),
              opsPtr,
              opBase,
              fpsPtr,
              fpsBase,
              // Dump memory around OPS (the operand stack top)
              opsTop: opsPtr > 0xd00000 && opsPtr < 0xd40000
                ? hexBytes(mem, opsPtr - 22, 44)
                : 'out of range',
              // Dump FPS (FP stack)
              fpsTop: fpsPtr > 0xd00000 && fpsPtr < 0xd40000
                ? hexBytes(mem, fpsBase, Math.min(fpsPtr - fpsBase, 44))
                : 'out of range',
              trail: seededRecentPcs.slice(-12).map(p => hex(p)),
              sp: cpu.sp,
              a: cpu.a & 0xff,
              f: cpu.f & 0xff,
              hl: cpu._hl,
              de: cpu._de,
              bc: cpu._bc,
            };
            console.log(`  ** E_Domain at step ${seededStepCount}, PC=${hex(norm)} **`);
          }

          // errNo watchpoint
          const curErrNo = mem[ERR_NO_ADDR] & 0xff;
          if (curErrNo !== seededPrevErrNo) {
            seededErrNoWrites.push({
              step: seededStepCount, pc: norm,
              from: seededPrevErrNo, to: curErrNo,
              trail: seededRecentPcs.slice(-8).map(p => hex(p)),
            });
            seededPrevErrNo = curErrNo;
          }

          if (norm === FAKE_RET) throw new Error('__RET__');
          if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
        },
        onMissingBlock(pc, _m, step) {
          const norm = pc & 0xffffff;
          seededFinalPc = norm;
          if (typeof step === 'number') seededStepCount = Math.max(seededStepCount, step + 1);
          seededRecentPcs.push(norm);
          if (seededRecentPcs.length > RECENT_PC_LIMIT) seededRecentPcs.shift();
          seededMissingBlocks.set(norm, (seededMissingBlocks.get(norm) || 0) + 1);

          const curErrNo = mem[ERR_NO_ADDR] & 0xff;
          if (curErrNo !== seededPrevErrNo) {
            seededErrNoWrites.push({
              step: seededStepCount, pc: norm,
              from: seededPrevErrNo, to: curErrNo,
              trail: seededRecentPcs.slice(-8).map(p => hex(p)),
              missing: true,
            });
            seededPrevErrNo = curErrNo;
          }

          if (norm === FAKE_RET) throw new Error('__RET__');
          if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
        },
      });
    } catch (e) {
      if (e?.message === '__RET__') { seededReturnHit = true; seededFinalPc = FAKE_RET; }
      else if (e?.message === '__ERR__') { seededErrCaught = true; seededFinalPc = ERR_CATCH_ADDR; }
      else throw e;
    }

    const seededFinalErrNo = mem[ERR_NO_ADDR] & 0xff;

    console.log('');
    console.log(`  Seeded result: ${seededReturnHit ? 'RETURNED' : seededErrCaught ? 'ERROR CAUGHT' : 'BUDGET EXHAUSTED'}`);
    console.log(`  Steps: ${seededStepCount}`);
    console.log(`  Final PC: ${hex(seededFinalPc)}`);
    console.log(`  errNo: ${hex(seededFinalErrNo, 2)} (${errName(seededFinalErrNo)})`);
    console.log(`  OP1: [${hexBytes(mem, OP1_ADDR, 11)}]`);
    console.log(`  OP2: [${hexBytes(mem, OP2_ADDR, 11)}]`);
    console.log('');

    // Key address hits
    console.log('  Key address hits (seeded):');
    console.log('    -- FP eval engine blocks --');
    for (const addr of FP_EVAL_BLOCKS) {
      console.log(`    ${hex(addr)}: ${seededKeyHits.get(addr)} hits`);
    }
    console.log('    -- Category writers --');
    for (const addr of CATEGORY_WRITERS) {
      console.log(`    ${hex(addr)}: ${seededKeyHits.get(addr)} hits`);
    }
    console.log('    -- Dispatch/handler --');
    for (const addr of [FP_DISPATCH_ADDR, FP_INIT_ADDR, GCD_HANDLER_ADDR, FP_HANDLER_DISPATCH]) {
      console.log(`    ${hex(addr)}: ${seededKeyHits.get(addr)} hits`);
    }
    console.log('    -- E_Domain trail --');
    for (const addr of E_DOMAIN_TRAIL) {
      console.log(`    ${hex(addr)}: ${seededKeyHits.get(addr)} hits`);
    }
    console.log('');

    // errNo writes
    console.log(`  errNo writes (seeded, ${seededErrNoWrites.length}):`);
    for (const w of seededErrNoWrites) {
      const missTag = w.missing ? ' [MISSING BLOCK]' : '';
      console.log(`    step=${w.step} PC=${hex(w.pc)} ${hex(w.from, 2)}->${hex(w.to, 2)} (${errName(w.to)})${missTag}`);
      console.log(`      trail: ${w.trail.join(' -> ')}`);
    }
    console.log('');

    // E_Domain snapshot
    if (eDomainSnapshot) {
      console.log('  === E_Domain snapshot at 0x068D5D ===');
      console.log(`    Step: ${eDomainSnapshot.step}`);
      console.log(`    errNo at entry: ${hex(eDomainSnapshot.errNo, 2)} (${errName(eDomainSnapshot.errNo)})`);
      console.log(`    OP1 (11 bytes): [${eDomainSnapshot.op1}]`);
      console.log(`    OP2 (11 bytes): [${eDomainSnapshot.op2}]`);
      console.log(`    OPS ptr: ${hex(eDomainSnapshot.opsPtr)} (opBase: ${hex(eDomainSnapshot.opBase)})`);
      console.log(`    FPS ptr: ${hex(eDomainSnapshot.fpsPtr)} (fpsBase: ${hex(eDomainSnapshot.fpsBase)})`);
      const opsDepth = eDomainSnapshot.opBase - eDomainSnapshot.opsPtr;
      const fpsDepth = eDomainSnapshot.fpsPtr - eDomainSnapshot.fpsBase;
      console.log(`    OPS depth: ${opsDepth} bytes (${(opsDepth / 9) | 0} entries)`);
      console.log(`    FPS depth: ${fpsDepth} bytes (${(fpsDepth / 9) | 0} entries)`);
      console.log(`    OPS top area: [${eDomainSnapshot.opsTop}]`);
      console.log(`    FPS data: [${eDomainSnapshot.fpsTop}]`);
      console.log(`    CPU: A=${hex(eDomainSnapshot.a, 2)} F=${hex(eDomainSnapshot.f, 2)} HL=${hex(eDomainSnapshot.hl)} DE=${hex(eDomainSnapshot.de)} BC=${hex(eDomainSnapshot.bc)} SP=${hex(eDomainSnapshot.sp)}`);
      console.log(`    Trail: ${eDomainSnapshot.trail.join(' -> ')}`);
    } else {
      console.log('  E_Domain at 0x068D5D was NOT reached in seeded run');
    }
    console.log('');

    // Missing blocks for seeded run
    if (seededMissingBlocks.size > 0) {
      console.log(`  Missing blocks (seeded, ${seededMissingBlocks.size}):`);
      const sorted = [...seededMissingBlocks.entries()].sort((a, b) => b[1] - a[1]);
      for (const [addr, count] of sorted.slice(0, 15)) {
        const disasm = (addr < 0x400000) ? disasmOne(romBytes, addr).mnem : '(RAM/sentinel)';
        console.log(`    ${hex(addr)}: ${count} hits | ${disasm}`);
      }
    }
    console.log('');

    // Last 20 PCs for seeded run
    console.log('  Last 20 PCs (seeded):');
    const seededLastPcs = seededRecentPcs.slice(-20);
    for (const pc of seededLastPcs) {
      const disasm = (pc < 0x400000) ? disasmOne(romBytes, pc).mnem : '(RAM/sentinel)';
      console.log(`    ${hex(pc)} | ${disasm}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('');
  console.log('='.repeat(72));
  console.log('  SUMMARY');
  console.log('='.repeat(72));
  console.log('');
  console.log('  Test 1: Block existence at FP addresses after phase 138 seeds');
  console.log('  Test 2: Natural gcd(12,8) — category byte write test');
  console.log('  Test 3: Manual seed 0x28 + E_Domain investigation at 0x068D5D');
  console.log('');
  console.log('=== Phase 138 probe complete ===');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
