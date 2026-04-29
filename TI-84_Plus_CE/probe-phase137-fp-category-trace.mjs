#!/usr/bin/env node

/**
 * Phase 137 — FP Category Byte 0xD0060E: Trace Eval Engine Blocks During gcd(12,8)
 *
 * RESULTS (2026-04-29):
 *
 * Test 1 — Block existence: ALL eval engine blocks MISSING from transpiled ROM:
 *   0x07E111, 0x07E14D, 0x07E16D, 0x07E199 (category writers) — all MISSING
 *   0x095722, 0x095765, 0x0957FF (category store instructions) — all MISSING
 *   0x07FA5C (FP register init / the clearer) — MISSING
 *   0x0686EF (FP dispatch), 0x06859B (gcd handler), 0x0689DE (FP dispatcher) — all MISSING
 *   NOTE: "MISSING" means no transpiled block starts at that address; the code
 *   may still execute if it's in the middle of a larger transpiled block.
 *   Evidence: dispatch (0x0686EF), gcd handler (0x06859B), and FP dispatcher
 *   (0x0689DE) all got 1 hit despite being "MISSING" — they execute as part
 *   of larger blocks.
 *
 * Test 2 — Write-watchpoints on 0xD0060E during gcd(12,8):
 *   FP category byte writes: ZERO — never written during entire ParseInp run.
 *   errNo writes: 2 transitions:
 *     step=28: 0x00->0x8D (E_Undefined) at PC=0x03E1B4
 *     step=918: 0x8D->0x84 (E_Domain) at PC=0x03E1B4
 *   Key address hits: dispatch(0x0686EF)=1, gcd handler(0x06859B)=1,
 *     FP dispatcher(0x0689DE)=1. Init(0x07FA5C)=0. All eval engine blocks=0.
 *   Final state: errNo=0x84(E_Domain), stalled at 0x001221 (LCD busy-wait).
 *
 * Test 3 — Init vs dispatch ordering:
 *   Init (0x07FA5C) was NEVER REACHED. Dispatch (0x0686EF) reached at step 776.
 *   Category at dispatch = 0x00. Init is NOT the problem — it never fires.
 *   The eval engine category writers (0x07E111 etc.) also never fire (0 hits).
 *   CONCLUSION: The category byte is never set because the code path that
 *   writes it is never reached.
 *
 * Test 4 — Manual category seed at dispatch time:
 *   Injected mem[0xD0060E]=0x28 when dispatch (0x0686EF) was hit at step 776.
 *   Result: gcd handler (0x06859B) reached, FP dispatcher (0x0689DE) reached.
 *   BUT still got E_Domain (0x84) at step 918 via trail:
 *     0x07CC1C -> 0x0685F0 -> 0x068D6D -> 0x068D5D -> 0x061D0E -> ...
 *   Stalled at 0x001221 (LCD busy-wait after JError).
 *   VERDICT: Manual seed WORKS — dispatch routes correctly to gcd handler.
 *   The gcd handler itself then fails with E_Domain, suggesting the gcd
 *   computation logic encounters an error (possibly missing operands on
 *   the FP stack, or a domain check fails).
 *
 * KEY FINDINGS:
 *   1. Category byte is never written — none of the 22 ROM writers execute.
 *   2. Init (0x07FA5C) never runs — it's NOT clearing the category.
 *   3. Manual seed proves dispatch mechanism works — gcd handler IS reachable.
 *   4. Even with correct dispatch, gcd fails with E_Domain (0x84).
 *   5. The E_Undefined (0x8D) at step 28 (before dispatch) may be related
 *      to the two-byte token lookup for 0xBB07 failing to find gcd's
 *      category in the token-to-category mapping.
 *
 * Session 136 confirmed: with correct close-paren token 0x11, gcd/min/max pass
 * syntax and reach FP dispatch at 0x0686EF. BUT FP category byte at 0xD0060E
 * is 0x00 at dispatch time, so dispatch fails.
 *
 * Session 134 found: FP register INIT subroutine at 0x07FA5C writes
 * [0x00, 0x80, exponent, 0*8] to the 11-byte FP register. Byte[0]=0x00
 * unconditionally zeros the category. The FP eval engine builds category
 * via 0x07E111/0x07E14D/0x07E16D/0x07E199, then init wipes it.
 *
 * This probe:
 *   1. Checks block existence at eval engine addresses 0x07E111, 0x07E14D,
 *      0x07E16D, 0x07E199 (category writers from session 134)
 *   2. Traces gcd(12,8) through ParseInp with write-watchpoints on 0xD0060E,
 *      logging EVERY write with step number, PC, and value written
 *   3. Checks if category byte gets set BETWEEN init at 0x07FA5C and dispatch
 *      at 0x0686EF
 *   4. Tests manual category seed: set mem[0xD0060E] = 0x28 before FP dispatch
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
const FP_INIT_ADDR = 0x07fa5c;

// FP eval engine blocks (category writers from session 134)
const FP_EVAL_BLOCKS = [0x07e111, 0x07e14d, 0x07e16d, 0x07e199];

// Category writers from session 131
const CATEGORY_WRITERS = [0x095722, 0x095765, 0x0957ff];

// FP handler for gcd (category 0x28)
const GCD_HANDLER_ADDR = 0x06859b;
const FP_HANDLER_DISPATCH = 0x0689de;

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const MEMINIT_BUDGET = 100000;
const PARSEINP_BUDGET = 50000;
const SEEDED_BUDGET = 200000;
const MAX_LOOP_ITER = 8192;
const RECENT_PC_LIMIT = 128;

// gcd(12,8) tokens with correct close-paren 0x11
const GCD_TOKENS = Uint8Array.from([0xbb, 0x07, 0x31, 0x32, 0x2b, 0x38, 0x11, 0x3f]);

// Error codes
const E_SYNTAX = 0x88;

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
  console.log('=== Phase 137: FP Category Byte 0xD0060E — Trace Eval Engine Blocks ===');
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 1: Check block existence at FP eval engine addresses
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('--- Test 1: Block existence at FP eval engine addresses ---');
  console.log('');

  console.log('  FP eval engine blocks (category writers from session 134):');
  for (const addr of FP_EVAL_BLOCKS) {
    const exists = typeof BLOCKS[addr] === 'function';
    const disasm = disasmOne(romBytes, addr);
    console.log(`    ${hex(addr)}: ${exists ? 'EXISTS' : 'MISSING'} | ${disasm.mnem}`);
  }
  console.log('');

  console.log('  Category writer addresses from session 131:');
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
  ];
  for (const [addr, label] of otherAddrs) {
    const exists = typeof BLOCKS[addr] === 'function';
    console.log(`    ${hex(addr)}: ${exists ? 'EXISTS' : 'MISSING'} | ${label}`);
  }
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // TEST 2: Trace gcd(12,8) with write-watchpoints on 0xD0060E
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('--- Test 2: gcd(12,8) write-watchpoints on 0xD0060E ---');
  console.log(`  Tokens: [${Array.from(GCD_TOKENS, b => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(', ')}]`);
  console.log('');

  {
    const { mem, executor, cpu } = createRuntime();
    coldBoot(executor, cpu, mem);

    console.log('  MEM_INIT...');
    const meminitOk = runMemInit(executor, cpu, mem);
    console.log(`  MEM_INIT: ${meminitOk ? 'OK' : 'FAILED'}`);
    if (!meminitOk) { process.exitCode = 1; return; }

    // Save post-MEM_INIT snapshot
    const memSnapshot = new Uint8Array(mem);

    // Seed for gcd(12,8)
    seedTokens(mem, GCD_TOKENS);
    seedAllocator(mem);
    prepareCallState(cpu, mem);
    seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

    // Clear FP category
    mem[FP_CATEGORY_ADDR] = 0x00;

    // Write-watchpoint state
    const fpCatWrites = [];
    let prevFpCat = 0x00;
    let prevErrNo = mem[ERR_NO_ADDR] & 0xff;
    const errNoWrites = [];

    // Track key address hits
    const keyAddrHits = new Map();
    const keyAddrs = [
      ...FP_EVAL_BLOCKS,
      ...CATEGORY_WRITERS,
      FP_DISPATCH_ADDR,
      FP_INIT_ADDR,
      GCD_HANDLER_ADDR,
      FP_HANDLER_DISPATCH,
    ];
    for (const a of keyAddrs) keyAddrHits.set(a, 0);

    // Track ordering: when does init fire vs dispatch?
    let initStep = -1;
    let dispatchStep = -1;
    let fpCatAtInit = -1;
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

          // Track key addresses
          if (keyAddrHits.has(norm)) keyAddrHits.set(norm, keyAddrHits.get(norm) + 1);

          // Track init and dispatch ordering
          if (norm === FP_INIT_ADDR) {
            initStep = stepCount;
            fpCatAtInit = mem[FP_CATEGORY_ADDR] & 0xff;
          }
          if (norm === FP_DISPATCH_ADDR) {
            dispatchStep = stepCount;
            fpCatAtDispatch = mem[FP_CATEGORY_ADDR] & 0xff;
          }

          // Write-watchpoint on FP category byte
          const curFpCat = mem[FP_CATEGORY_ADDR] & 0xff;
          if (curFpCat !== prevFpCat) {
            const trail = recentPcs.slice(-8).map(p => hex(p));
            fpCatWrites.push({
              step: stepCount,
              pc: norm,
              from: prevFpCat,
              to: curFpCat,
              trail,
            });
            prevFpCat = curFpCat;
          }

          // Write-watchpoint on errNo
          const curErrNo = mem[ERR_NO_ADDR] & 0xff;
          if (curErrNo !== prevErrNo) {
            const trail = recentPcs.slice(-8).map(p => hex(p));
            errNoWrites.push({
              step: stepCount,
              pc: norm,
              from: prevErrNo,
              to: curErrNo,
              trail,
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

          // Watchpoints on missing blocks too
          const curFpCat = mem[FP_CATEGORY_ADDR] & 0xff;
          if (curFpCat !== prevFpCat) {
            const trail = recentPcs.slice(-8).map(p => hex(p));
            fpCatWrites.push({
              step: stepCount,
              pc: norm,
              from: prevFpCat,
              to: curFpCat,
              trail,
              missing: true,
            });
            prevFpCat = curFpCat;
          }

          const curErrNo = mem[ERR_NO_ADDR] & 0xff;
          if (curErrNo !== prevErrNo) {
            const trail = recentPcs.slice(-8).map(p => hex(p));
            errNoWrites.push({
              step: stepCount,
              pc: norm,
              from: prevErrNo,
              to: curErrNo,
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

    // Results
    const finalErrNo = mem[ERR_NO_ADDR] & 0xff;
    const finalFpCat = mem[FP_CATEGORY_ADDR] & 0xff;

    console.log(`  Result: ${returnHit ? 'RETURNED' : errCaught ? 'ERROR CAUGHT' : 'BUDGET EXHAUSTED'}`);
    console.log(`  Steps: ${stepCount}`);
    console.log(`  Final PC: ${hex(finalPc)}`);
    console.log(`  errNo: ${hex(finalErrNo, 2)} (${errName(finalErrNo)})`);
    console.log(`  FP category (0xD0060E): ${hex(finalFpCat, 2)}`);
    console.log(`  OP1: [${hexBytes(mem, OP1_ADDR, 9)}]`);
    console.log('');

    // FP category writes log
    console.log(`  FP category (0xD0060E) writes (${fpCatWrites.length}):`);
    if (fpCatWrites.length === 0) {
      console.log('    NONE — category byte is NEVER written during gcd(12,8)');
    }
    for (const w of fpCatWrites) {
      const missTag = w.missing ? ' [MISSING BLOCK]' : '';
      console.log(`    step=${w.step} PC=${hex(w.pc)} ${hex(w.from, 2)}->${hex(w.to, 2)}${missTag}`);
      console.log(`      trail: ${w.trail.join(' -> ')}`);
    }
    console.log('');

    // errNo writes log
    console.log(`  errNo writes (${errNoWrites.length}):`);
    for (const w of errNoWrites) {
      const missTag = w.missing ? ' [MISSING BLOCK]' : '';
      console.log(`    step=${w.step} PC=${hex(w.pc)} ${hex(w.from, 2)}->${hex(w.to, 2)} (${errName(w.to)})${missTag}`);
      console.log(`      trail: ${w.trail.join(' -> ')}`);
    }
    console.log('');

    // Key address hits
    console.log('  Key address hit counts:');
    for (const [addr, count] of keyAddrHits) {
      const disasm = disasmOne(romBytes, addr);
      console.log(`    ${hex(addr)}: ${count} hits | ${disasm.mnem}`);
    }
    console.log('');

    // Init vs dispatch ordering
    console.log('  Init (0x07FA5C) vs Dispatch (0x0686EF) ordering:');
    console.log(`    Init step: ${initStep === -1 ? 'NEVER REACHED' : initStep} (cat at init: ${fpCatAtInit === -1 ? 'n/a' : hex(fpCatAtInit, 2)})`);
    console.log(`    Dispatch step: ${dispatchStep === -1 ? 'NEVER REACHED' : dispatchStep} (cat at dispatch: ${fpCatAtDispatch === -1 ? 'n/a' : hex(fpCatAtDispatch, 2)})`);
    if (initStep >= 0 && dispatchStep >= 0) {
      if (initStep < dispatchStep) {
        console.log('    => Init fires BEFORE dispatch');
        // Check if any fpCatWrites happened between init and dispatch
        const writesBetween = fpCatWrites.filter(w => w.step > initStep && w.step < dispatchStep);
        console.log(`    => Writes between init and dispatch: ${writesBetween.length}`);
        for (const w of writesBetween) {
          console.log(`       step=${w.step} PC=${hex(w.pc)} ${hex(w.from, 2)}->${hex(w.to, 2)}`);
        }
        if (writesBetween.length === 0) {
          console.log('    => CONCLUSION: Category writers are NOT executing between init and dispatch');
        }
      } else {
        console.log('    => Dispatch fires BEFORE init (unexpected!)');
      }
    } else if (initStep === -1 && dispatchStep >= 0) {
      console.log('    => Init never reached but dispatch was — category not being cleared by init');
    } else if (initStep >= 0 && dispatchStep === -1) {
      console.log('    => Init reached but dispatch never was — execution stops before dispatch');
    } else {
      console.log('    => Neither init nor dispatch was reached');
    }
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

    // Last 20 PCs
    console.log('  Last 20 PCs:');
    const lastPcs = recentPcs.slice(-20);
    for (const pc of lastPcs) {
      const disasm = (pc < 0x400000) ? disasmOne(romBytes, pc).mnem : '(RAM/sentinel)';
      console.log(`    ${hex(pc)} | ${disasm}`);
    }
    console.log('');

    // ═══════════════════════════════════════════════════════════════════════════
    // TEST 3: Check category byte between init and dispatch
    //   (Already handled above in the init/dispatch ordering analysis)
    // ═══════════════════════════════════════════════════════════════════════════

    console.log('--- Test 3: Category byte lifecycle (init -> dispatch) ---');
    console.log('  (See Test 2 init/dispatch ordering results above)');
    console.log('');

    // ═══════════════════════════════════════════════════════════════════════════
    // TEST 4: Manual category seed — set 0xD0060E = 0x28 before dispatch
    // ═══════════════════════════════════════════════════════════════════════════

    console.log('--- Test 4: Manual category seed 0xD0060E = 0x28 (gcd) ---');
    console.log('  Strategy: Run ParseInp, and when FP dispatch (0x0686EF) is hit,');
    console.log('  inject mem[0xD0060E] = 0x28 so the dispatch table finds gcd category.');
    console.log('');

    // Restore clean state
    mem.set(memSnapshot);
    seedTokens(mem, GCD_TOKENS);
    seedAllocator(mem);
    prepareCallState(cpu, mem);
    seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);
    mem[FP_CATEGORY_ADDR] = 0x00;

    // Tracking for seeded run
    const seededFpCatWrites = [];
    let seededPrevFpCat = 0x00;
    let seededPrevErrNo = mem[ERR_NO_ADDR] & 0xff;
    const seededErrNoWrites = [];
    let seededStepCount = 0;
    const seededRecentPcs = [];
    let seededFinalPc = null;
    let seededReturnHit = false;
    let seededErrCaught = false;
    const seededMissingBlocks = new Map();
    let seedInjected = false;

    const seededKeyHits = new Map();
    const seededKeyAddrs = [
      [FP_DISPATCH_ADDR, 'FP dispatch table'],
      [GCD_HANDLER_ADDR, 'gcd handler (cat 0x28)'],
      [FP_HANDLER_DISPATCH, 'FP handler dispatcher'],
      [FP_INIT_ADDR, 'FP register init'],
      [0x066436, 'error path'],
    ];
    for (const [a] of seededKeyAddrs) seededKeyHits.set(a, 0);

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

          // INJECT: when we hit dispatch, set category = 0x28
          if (norm === FP_DISPATCH_ADDR && !seedInjected) {
            mem[FP_CATEGORY_ADDR] = 0x28;
            seededPrevFpCat = 0x28;
            seedInjected = true;
            console.log(`  ** INJECTED: mem[0xD0060E] = 0x28 at step ${seededStepCount}, PC=${hex(norm)} **`);
          }

          // Write-watchpoint on FP category
          const curFpCat = mem[FP_CATEGORY_ADDR] & 0xff;
          if (curFpCat !== seededPrevFpCat) {
            const trail = seededRecentPcs.slice(-8).map(p => hex(p));
            seededFpCatWrites.push({
              step: seededStepCount,
              pc: norm,
              from: seededPrevFpCat,
              to: curFpCat,
              trail,
            });
            seededPrevFpCat = curFpCat;
          }

          // Write-watchpoint on errNo
          const curErrNo = mem[ERR_NO_ADDR] & 0xff;
          if (curErrNo !== seededPrevErrNo) {
            const trail = seededRecentPcs.slice(-8).map(p => hex(p));
            seededErrNoWrites.push({
              step: seededStepCount,
              pc: norm,
              from: seededPrevErrNo,
              to: curErrNo,
              trail,
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

          // Watchpoints on missing blocks too
          const curFpCat = mem[FP_CATEGORY_ADDR] & 0xff;
          if (curFpCat !== seededPrevFpCat) {
            const trail = seededRecentPcs.slice(-8).map(p => hex(p));
            seededFpCatWrites.push({
              step: seededStepCount,
              pc: norm,
              from: seededPrevFpCat,
              to: curFpCat,
              trail,
              missing: true,
            });
            seededPrevFpCat = curFpCat;
          }

          const curErrNo = mem[ERR_NO_ADDR] & 0xff;
          if (curErrNo !== seededPrevErrNo) {
            const trail = seededRecentPcs.slice(-8).map(p => hex(p));
            seededErrNoWrites.push({
              step: seededStepCount,
              pc: norm,
              from: seededPrevErrNo,
              to: curErrNo,
              trail,
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

    // Seeded results
    const seededFinalErrNo = mem[ERR_NO_ADDR] & 0xff;
    const seededFinalFpCat = mem[FP_CATEGORY_ADDR] & 0xff;

    console.log('');
    console.log(`  Seeded result: ${seededReturnHit ? 'RETURNED' : seededErrCaught ? 'ERROR CAUGHT' : 'BUDGET EXHAUSTED'}`);
    console.log(`  Steps: ${seededStepCount}`);
    console.log(`  Final PC: ${hex(seededFinalPc)}`);
    console.log(`  Seed injected: ${seedInjected}`);
    console.log(`  errNo: ${hex(seededFinalErrNo, 2)} (${errName(seededFinalErrNo)})`);
    console.log(`  FP category (0xD0060E): ${hex(seededFinalFpCat, 2)}`);
    console.log(`  OP1: [${hexBytes(mem, OP1_ADDR, 9)}]`);
    console.log('');

    // Key address hits
    console.log('  Key address hits (seeded run):');
    for (const [addr, label] of seededKeyAddrs) {
      const hits = seededKeyHits.get(addr);
      console.log(`    ${hex(addr)}: ${hits} hits | ${label}`);
    }
    console.log('');

    // FP category writes after seed
    console.log(`  FP category writes after seed (${seededFpCatWrites.length}):`);
    for (const w of seededFpCatWrites) {
      const missTag = w.missing ? ' [MISSING BLOCK]' : '';
      console.log(`    step=${w.step} PC=${hex(w.pc)} ${hex(w.from, 2)}->${hex(w.to, 2)}${missTag}`);
      console.log(`      trail: ${w.trail.join(' -> ')}`);
    }
    console.log('');

    // errNo writes
    console.log(`  errNo writes (seeded) (${seededErrNoWrites.length}):`);
    for (const w of seededErrNoWrites) {
      const missTag = w.missing ? ' [MISSING BLOCK]' : '';
      console.log(`    step=${w.step} PC=${hex(w.pc)} ${hex(w.from, 2)}->${hex(w.to, 2)} (${errName(w.to)})${missTag}`);
      console.log(`      trail: ${w.trail.join(' -> ')}`);
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
    console.log('');

    // Verdict
    console.log('  SEEDED VERDICT:');
    const dispHits = seededKeyHits.get(FP_DISPATCH_ADDR);
    const gcdHits = seededKeyHits.get(GCD_HANDLER_ADDR);
    const fpDispHits = seededKeyHits.get(FP_HANDLER_DISPATCH);
    console.log(`    Dispatch table reached: ${dispHits > 0 ? 'YES' : 'NO'} (${dispHits} hits)`);
    console.log(`    gcd handler (0x06859B) reached: ${gcdHits > 0 ? 'YES' : 'NO'} (${gcdHits} hits)`);
    console.log(`    FP dispatcher (0x0689DE) reached: ${fpDispHits > 0 ? 'YES' : 'NO'} (${fpDispHits} hits)`);
    if (gcdHits > 0 || fpDispHits > 0) {
      console.log('    => Manual seed WORKS — dispatch mechanism is functional');
      console.log('    => Problem is upstream: code that should write 0xD0060E is not executing');
    } else if (seededErrCaught) {
      console.log(`    => Manual seed did NOT prevent error (errNo=${hex(seededFinalErrNo, 2)})`);
      if (seededFpCatWrites.length > 0) {
        console.log('    => Category was OVERWRITTEN after injection — something clears it');
      }
    } else {
      console.log('    => Dispatch table may not have been reached');
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
  console.log('  Test 1: Block existence at FP eval engine addresses');
  console.log('  Test 2: Write-watchpoint trace on 0xD0060E during gcd(12,8)');
  console.log('  Test 3: Category byte lifecycle between init(0x07FA5C) and dispatch(0x0686EF)');
  console.log('  Test 4: Manual category seed 0x28 injected at dispatch time');
  console.log('');
  console.log('=== Phase 137 probe complete ===');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
