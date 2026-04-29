#!/usr/bin/env node

/**
 * Phase 136 — FP Paren Fix: Test gcd(12,8), min(3,7), max(3,7) with corrected close-paren 0x11
 *
 * Session 135 found that gcd(12,8) hits ERR:SYNTAX because the token sequence
 * used 0x29 for close-paren. ParseInp's dispatch at 0x0999AE does:
 *   CP 0x29 → JP Z,0x099A7A → JP 0x061D1A → errNo=0x88
 *
 * The CORRECT close-paren token is 0x11, which routes to 0x099A7E (normal handler).
 * This probe tests all three functions with the corrected token.
 *
 * Token sequences (0x29 replaced by 0x11):
 *   gcd(12,8): [0xBB, 0x07, 0x31, 0x32, 0x2B, 0x38, 0x11, 0x3F]
 *   min(3,7):  [0xBB, 0x01, 0x33, 0x2B, 0x37, 0x11, 0x3F]
 *   max(3,7):  [0xBB, 0x02, 0x33, 0x2B, 0x37, 0x11, 0x3F]
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

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const MEMINIT_BUDGET = 100000;
const PARSEINP_BUDGET = 10000;
const MAX_LOOP_ITER = 8192;
const RECENT_PC_LIMIT = 128;

// Error codes
const E_EDIT = 0x80;
const E_SYNTAX = 0x88;
const E_UNDEFINED = 0x8d;
const E_DOMAIN = 0x84;

// Test cases with corrected close-paren token 0x11
const TEST_CASES = [
  {
    name: 'gcd(12,8)',
    tokens: Uint8Array.from([0xbb, 0x07, 0x31, 0x32, 0x2b, 0x38, 0x11, 0x3f]),
    expectedResult: 4,
  },
  {
    name: 'min(3,7)',
    tokens: Uint8Array.from([0xbb, 0x01, 0x33, 0x2b, 0x37, 0x11, 0x3f]),
    expectedResult: 3,
  },
  {
    name: 'max(3,7)',
    tokens: Uint8Array.from([0xbb, 0x02, 0x33, 0x2b, 0x37, 0x11, 0x3f]),
    expectedResult: 7,
  },
];

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
  if (code === E_SYNTAX) return 'E_Syntax';
  if (code === E_UNDEFINED) return 'E_Undefined';
  if (code === E_DOMAIN) return 'E_Domain';
  if (code === E_EDIT) return 'E_Edit';
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

// ── Run one test case ──────────────────────────────────────────────────────

function runTestCase(testCase, executor, cpu, mem) {
  const { name, tokens } = testCase;

  console.log(`\n${'='.repeat(72)}`);
  console.log(`  Testing: ${name}`);
  console.log(`  Tokens: [${Array.from(tokens, b => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(', ')}]`);
  console.log(`${'='.repeat(72)}`);

  // Reset state for this test
  seedTokens(mem, tokens);
  seedAllocator(mem);
  prepareCallState(cpu, mem);
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  // Clear FP category byte
  mem[FP_CATEGORY_ADDR] = 0x00;

  // Watchpoint state
  let prevErrNo = mem[ERR_NO_ADDR] & 0xff;
  const errNoWrites = [];

  // Track FP dispatch hit
  let fpDispatchHit = false;
  let fpCategoryAtDispatch = 0;

  // General state
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

        // Watchpoint: errNo
        const curErrNo = mem[ERR_NO_ADDR] & 0xff;
        if (curErrNo !== prevErrNo) {
          const trail = recentPcs.slice(-6).map(p => hex(p));
          errNoWrites.push({
            step: stepCount,
            pc: norm,
            from: prevErrNo,
            to: curErrNo,
            a: cpu.a & 0xff,
            sp: cpu.sp,
            trail,
          });
          prevErrNo = curErrNo;
        }

        // Track FP dispatch
        if (norm === FP_DISPATCH_ADDR) {
          fpDispatchHit = true;
          fpCategoryAtDispatch = mem[FP_CATEGORY_ADDR] & 0xff;
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

        // Watchpoint on missing blocks too
        const curErrNo = mem[ERR_NO_ADDR] & 0xff;
        if (curErrNo !== prevErrNo) {
          const trail = recentPcs.slice(-6).map(p => hex(p));
          errNoWrites.push({
            step: stepCount,
            pc: norm,
            from: prevErrNo,
            to: curErrNo,
            a: cpu.a & 0xff,
            sp: cpu.sp,
            trail,
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

  // ── Results ──────────────────────────────────────────────────────────────

  const finalErrNo = mem[ERR_NO_ADDR] & 0xff;
  const fpCategory = mem[FP_CATEGORY_ADDR] & 0xff;
  const op1Bytes = hexBytes(mem, OP1_ADDR, 9);

  console.log('');
  console.log(`  Result: ${returnHit ? 'RETURNED (no error)' : errCaught ? 'ERROR CAUGHT' : 'BUDGET EXHAUSTED / STALLED'}`);
  console.log(`  Steps: ${stepCount}`);
  console.log(`  Final PC: ${hex(finalPc)}`);
  console.log(`  errNo: ${hex(finalErrNo, 2)} (${errName(finalErrNo)})`);
  console.log(`  Syntax check: ${finalErrNo === E_SYNTAX ? 'FAILED (ERR:SYNTAX)' : finalErrNo === 0 ? 'PASSED' : 'OTHER ERROR'}`);
  console.log(`  FP category (0xD0060E): ${hex(fpCategory, 2)}`);
  console.log(`  FP dispatch (0x0686EF) hit: ${fpDispatchHit}${fpDispatchHit ? ' (category=' + hex(fpCategoryAtDispatch, 2) + ')' : ''}`);
  console.log(`  OP1: [${op1Bytes}]`);
  console.log(`  curPC: ${hex(read24(mem, CURPC_ADDR))}`);
  console.log(`  OPS: ${hex(read24(mem, OPS_ADDR))}`);
  console.log(`  FPS: ${hex(read24(mem, FPS_ADDR))}`);

  // errNo writes
  if (errNoWrites.length > 0) {
    console.log(`  errNo writes (${errNoWrites.length}):`);
    for (const w of errNoWrites) {
      const missTag = w.missing ? ' [MISSING]' : '';
      console.log(`    step=${w.step} PC=${hex(w.pc)} ${hex(w.from, 2)}->${hex(w.to, 2)} (${errName(w.to)}) A=${hex(w.a, 2)}${missTag}`);
      console.log(`      trail: ${w.trail.join(' -> ')}`);
    }
  }

  // Missing blocks
  if (missingBlocks.size > 0) {
    console.log(`  Missing blocks (${missingBlocks.size}):`);
    const sorted = [...missingBlocks.entries()].sort((a, b) => b[1] - a[1]);
    for (const [addr, count] of sorted.slice(0, 10)) {
      const disasm = (addr < 0x400000) ? disasmOne(romBytes, addr).mnem : '(RAM/sentinel)';
      console.log(`    ${hex(addr)}: ${count} hits | ${disasm}`);
    }
  }

  // Last 16 PCs
  console.log('  Last 16 PCs:');
  const lastPcs = recentPcs.slice(-16);
  for (const pc of lastPcs) {
    const disasm = (pc < 0x400000) ? disasmOne(romBytes, pc).mnem : '(RAM/sentinel)';
    console.log(`    ${hex(pc)} | ${disasm}`);
  }

  return {
    name,
    returnHit,
    errCaught,
    finalErrNo,
    fpCategory,
    fpDispatchHit,
    fpCategoryAtDispatch,
    op1Bytes,
    stepCount,
    missingBlockCount: missingBlocks.size,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 136: FP Paren Fix — gcd/min/max with corrected close-paren 0x11 ===');
  console.log('');
  console.log('Background: Session 135 found close-paren 0x29 triggers ERR:SYNTAX.');
  console.log('Correct close-paren token is 0x11, which routes to normal handler at 0x099A7E.');
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // Boot + MEM_INIT (shared across all tests)
  // ═══════════════════════════════════════════════════════════════════════════

  const { mem, executor, cpu } = createRuntime();
  coldBoot(executor, cpu, mem);

  console.log('--- MEM_INIT ---');
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Run all test cases
  // ═══════════════════════════════════════════════════════════════════════════

  // Save post-MEM_INIT memory snapshot for clean state between tests
  const memSnapshot = new Uint8Array(mem);
  const results = [];

  for (const testCase of TEST_CASES) {
    // Restore clean post-MEM_INIT state
    mem.set(memSnapshot);
    results.push(runTestCase(testCase, executor, cpu, mem));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('');
  console.log('='.repeat(72));
  console.log('  SUMMARY');
  console.log('='.repeat(72));
  console.log('');

  let passedSyntax = 0;
  for (const r of results) {
    const syntaxStatus = r.finalErrNo === E_SYNTAX ? 'FAIL (ERR:SYNTAX)'
      : r.finalErrNo === 0 ? 'PASS (no error)'
      : `OTHER (errNo=${hex(r.finalErrNo, 2)}, ${errName(r.finalErrNo)})`;
    if (r.finalErrNo !== E_SYNTAX) passedSyntax++;

    console.log(`  ${r.name}:`);
    console.log(`    Syntax check: ${syntaxStatus}`);
    console.log(`    Return/Error: ${r.returnHit ? 'returned' : r.errCaught ? 'error caught' : 'stalled'}`);
    console.log(`    FP category: ${hex(r.fpCategory, 2)}`);
    console.log(`    FP dispatch hit: ${r.fpDispatchHit}`);
    console.log(`    OP1: [${r.op1Bytes}]`);
    console.log(`    Steps: ${r.stepCount}, Missing blocks: ${r.missingBlockCount}`);
    console.log('');
  }

  console.log(`  Passed syntax check: ${passedSyntax}/${results.length}`);
  console.log('');
  console.log('=== Phase 136 probe complete ===');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
