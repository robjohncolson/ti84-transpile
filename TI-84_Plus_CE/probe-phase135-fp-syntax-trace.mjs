#!/usr/bin/env node

/**
 * Phase 135 — FP Syntax Error Trace: Where Does ERR:SYNTAX Fire During gcd(12,8)?
 *
 * Traces the ERR:SYNTAX (errNo=0x88) error during gcd(12,8) via ParseInp.
 * Instruments:
 *   1. Write-watchpoint on REAL errNo at 0xD008DF
 *   2. Write-watchpoint on OPS high byte at 0xD02595 (previously misidentified as errNo)
 *   3. Step-by-step trace from step 540 to step 580
 *   4. Post-errNo-write PC trail (30 PCs after errNo gets 0x88)
 *
 * Key question: What specific PC/instruction triggers ERR:SYNTAX?
 * Is it a comma-parsing issue, a missing block in the 0xBB dispatch chain, or something else?
 *
 * CRITICAL BUG NOTE: 0xD02595 is NOT errNo — it's the HIGH BYTE of OPS
 * (OPS is a 3-byte pointer at 0xD02593/4/5). The REAL errNo per ti84pceg.inc
 * is at 0xD008DF.
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

// REAL errNo per ti84pceg.inc — NOT 0xD02595 (that's the OPS high byte)
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;

const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const OPS_HI_ADDR = 0xd02595; // high byte of OPS — NOT errNo!
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

// gcd(12,8): 0xBB 0x07 = gcd(, 0x31 0x32 = "12", 0x2B = comma, 0x38 = "8", 0x29 = ), 0x3F = end
const INPUT_TOKENS = Uint8Array.from([0xbb, 0x07, 0x31, 0x32, 0x2b, 0x38, 0x29, 0x3f]);

const MEMINIT_BUDGET = 100000;
const PARSEINP_BUDGET = 5000;
const MAX_LOOP_ITER = 8192;
const RECENT_PC_LIMIT = 128;

// Error codes
const E_EDIT = 0x80;
const E_SYNTAX = 0x88;  // 8 + E_EDIT
const E_UNDEFINED = 0x8d;
const E_DOMAIN = 0x84;

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
  const rel = () => { const d = buf[pc + 1]; return d < 128 ? d : d - 256; };

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
  else if (b0 === 0x18) { len = 2; mnem = 'JR ' + hex(pc + 2 + rel()); }
  else if (b0 === 0x20) { len = 2; mnem = 'JR NZ,' + hex(pc + 2 + rel()); }
  else if (b0 === 0x28) { len = 2; mnem = 'JR Z,' + hex(pc + 2 + rel()); }
  else if (b0 === 0x30) { len = 2; mnem = 'JR NC,' + hex(pc + 2 + rel()); }
  else if (b0 === 0x38) { len = 2; mnem = 'JR C,' + hex(pc + 2 + rel()); }
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

function disasmRange(buf, start, end) {
  const lines = [];
  let pc = start;
  while (pc < end) {
    const { len, mnem } = disasmOne(buf, pc);
    const bytes = [];
    for (let i = 0; i < len; i++) bytes.push(buf[pc + i]);
    lines.push(`  ${hex(pc)}: ${bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ').padEnd(16)} ${mnem}`);
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

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 135: FP Syntax Error Trace — gcd(12,8) via ParseInp ===');
  console.log('');
  console.log('Key addresses:');
  console.log(`  REAL errNo:    ${hex(ERR_NO_ADDR)} (ti84pceg.inc)`);
  console.log(`  OPS high byte: ${hex(OPS_HI_ADDR)} (NOT errNo — part of 3-byte OPS pointer)`);
  console.log(`  errSP:         ${hex(ERR_SP_ADDR)}`);
  console.log(`  E_Syntax:      ${hex(E_SYNTAX, 2)} (0x88)`);
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // Boot + MEM_INIT
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
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // Seed tokens + allocator
  // ═══════════════════════════════════════════════════════════════════════════

  seedTokens(mem, INPUT_TOKENS);
  seedAllocator(mem);
  prepareCallState(cpu, mem);
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  console.log('--- Pre-run state ---');
  console.log(`  Input tokens: [${Array.from(INPUT_TOKENS, b => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(', ')}]`);
  console.log(`  errNo before: ${hex(mem[ERR_NO_ADDR], 2)}`);
  console.log(`  OPS high byte before: ${hex(mem[OPS_HI_ADDR], 2)}`);
  console.log(`  OPS (3-byte): ${hex(read24(mem, OPS_ADDR))}`);
  console.log(`  errSP: ${hex(read24(mem, ERR_SP_ADDR))}`);
  console.log(`  SP: ${hex(cpu.sp)}`);
  console.log(`  begPC: ${hex(read24(mem, BEGPC_ADDR))}`);
  console.log(`  curPC: ${hex(read24(mem, CURPC_ADDR))}`);
  console.log(`  endPC: ${hex(read24(mem, ENDPC_ADDR))}`);
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // ParseInp with instrumentation
  // ═══════════════════════════════════════════════════════════════════════════

  // Watchpoint state
  let prevErrNo = mem[ERR_NO_ADDR] & 0xff;
  let prevOpsHi = mem[OPS_HI_ADDR] & 0xff;
  const errNoWrites = [];
  const opsHiWrites = [];

  // Step-by-step trace state
  const TRACE_LO = 540;
  const TRACE_HI = 580;
  const traceSteps = [];

  // Post-errNo-write PC trail
  let errNoWriteStep = null;
  const postErrNoPcs = [];
  const POST_ERR_PC_COUNT = 30;

  // General state
  let stepCount = 0;
  const recentPcs = [];
  let finalPc = null;
  let returnHit = false;
  let errCaught = false;
  const missingBlocks = new Map();

  console.log(`--- ParseInp("gcd(12,8)") with ${PARSEINP_BUDGET} step budget ---`);
  console.log('');

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

        // ── Watchpoint: errNo at 0xD008DF ──
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

          // If errNo just got set to E_Syntax, start collecting post-write PCs
          if (curErrNo === E_SYNTAX && errNoWriteStep === null) {
            errNoWriteStep = stepCount;
          }
        }

        // ── Watchpoint: OPS high byte at 0xD02595 ──
        const curOpsHi = mem[OPS_HI_ADDR] & 0xff;
        if (curOpsHi !== prevOpsHi) {
          const trail = recentPcs.slice(-6).map(p => hex(p));
          opsHiWrites.push({
            step: stepCount,
            pc: norm,
            from: prevOpsHi,
            to: curOpsHi,
            ops3: hex(read24(mem, OPS_ADDR)),
          });
          prevOpsHi = curOpsHi;
        }

        // ── Step-by-step trace from step 540 to 580 ──
        if (stepCount >= TRACE_LO && stepCount <= TRACE_HI) {
          traceSteps.push({
            step: stepCount,
            pc: norm,
            a: cpu.a & 0xff,
            f: cpu.f & 0xff,
            sp: cpu.sp,
            hl: cpu._hl,
            de: cpu._de,
            bc: cpu._bc,
            errNo: mem[ERR_NO_ADDR] & 0xff,
            curPC: read24(mem, CURPC_ADDR),
          });
        }

        // ── Post-errNo-write PC trail ──
        if (errNoWriteStep !== null && postErrNoPcs.length < POST_ERR_PC_COUNT) {
          postErrNoPcs.push({
            step: stepCount,
            pc: norm,
            a: cpu.a & 0xff,
            sp: cpu.sp,
          });
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

        // Also check watchpoints on missing blocks
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
          if (curErrNo === E_SYNTAX && errNoWriteStep === null) {
            errNoWriteStep = stepCount;
          }
        }

        if (errNoWriteStep !== null && postErrNoPcs.length < POST_ERR_PC_COUNT) {
          postErrNoPcs.push({
            step: stepCount,
            pc: norm,
            a: cpu.a & 0xff,
            sp: cpu.sp,
            missing: true,
          });
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Results
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('--- Execution result ---');
  console.log(`  returnHit: ${returnHit}`);
  console.log(`  errCaught: ${errCaught}`);
  console.log(`  steps: ${stepCount}`);
  console.log(`  finalPc: ${hex(finalPc)}`);
  console.log(`  Final errNo: ${hex(mem[ERR_NO_ADDR], 2)} (${errName(mem[ERR_NO_ADDR])})`);
  console.log(`  Final OPS (3-byte): ${hex(read24(mem, OPS_ADDR))}`);
  console.log(`  Final OPS high byte: ${hex(mem[OPS_HI_ADDR], 2)}`);
  console.log(`  Final curPC: ${hex(read24(mem, CURPC_ADDR))}`);
  console.log(`  OP1: [${hexBytes(mem, OP1_ADDR, 9)}]`);
  console.log('');

  // ── errNo write watchpoint results ──
  console.log(`--- errNo (${hex(ERR_NO_ADDR)}) write watchpoint — ${errNoWrites.length} writes ---`);
  for (const w of errNoWrites) {
    const missTag = w.missing ? ' [MISSING BLOCK]' : '';
    console.log(`  step=${w.step} PC=${hex(w.pc)} errNo: ${hex(w.from, 2)} -> ${hex(w.to, 2)} (${errName(w.to)}) A=${hex(w.a, 2)} SP=${hex(w.sp)}${missTag}`);
    console.log(`    trail: ${w.trail.join(' -> ')}`);
  }
  if (errNoWrites.length === 0) {
    console.log('  (no writes detected — errNo stayed at 0x00)');
  }
  console.log('');

  // ── OPS high byte watchpoint results ──
  console.log(`--- OPS high byte (${hex(OPS_HI_ADDR)}) write watchpoint — ${opsHiWrites.length} writes ---`);
  for (const w of opsHiWrites) {
    console.log(`  step=${w.step} PC=${hex(w.pc)} OPS_HI: ${hex(w.from, 2)} -> ${hex(w.to, 2)}  OPS(3)=${w.ops3}`);
  }
  if (opsHiWrites.length === 0) {
    console.log('  (no writes detected)');
  }
  console.log('');

  // ── Step-by-step trace ──
  console.log(`--- Step-by-step trace (steps ${TRACE_LO}-${TRACE_HI}) ---`);
  for (const s of traceSteps) {
    const disasm = (s.pc < 0x400000) ? disasmOne(romBytes, s.pc).mnem : '(RAM/sentinel)';
    console.log(`  step=${s.step} PC=${hex(s.pc)} A=${hex(s.a, 2)} F=${hex(s.f, 2)} SP=${hex(s.sp)} HL=${hex(s.hl)} DE=${hex(s.de)} BC=${hex(s.bc)} errNo=${hex(s.errNo, 2)} curPC=${hex(s.curPC)} | ${disasm}`);
  }
  if (traceSteps.length === 0) {
    console.log('  (no steps in range — execution may not have reached step 540)');
  }
  console.log('');

  // ── Post-errNo-write PC trail ──
  if (errNoWriteStep !== null) {
    console.log(`--- Post-errNo-write PC trail (${postErrNoPcs.length} PCs after errNo=0x88 at step ${errNoWriteStep}) ---`);
    for (const p of postErrNoPcs) {
      const missTag = p.missing ? ' [MISSING]' : '';
      const disasm = (p.pc < 0x400000) ? disasmOne(romBytes, p.pc).mnem : '(RAM/sentinel)';
      console.log(`  step=${p.step} PC=${hex(p.pc)} A=${hex(p.a, 2)} SP=${hex(p.sp)} | ${disasm}${missTag}`);
    }
  } else {
    console.log('--- Post-errNo-write PC trail ---');
    console.log('  (errNo never got set to E_Syntax 0x88)');
  }
  console.log('');

  // ── Missing blocks ──
  if (missingBlocks.size > 0) {
    console.log(`--- Missing blocks encountered (${missingBlocks.size}) ---`);
    const sorted = [...missingBlocks.entries()].sort((a, b) => b[1] - a[1]);
    for (const [addr, count] of sorted.slice(0, 20)) {
      const disasm = (addr < 0x400000) ? disasmOne(romBytes, addr).mnem : '(RAM/sentinel)';
      console.log(`  ${hex(addr)}: ${count} hits | ${disasm}`);
    }
  } else {
    console.log('--- No missing blocks ---');
  }
  console.log('');

  // ── Last 32 PCs ──
  console.log('--- Last 32 PCs before termination ---');
  const lastPcs = recentPcs.slice(-32);
  for (let i = 0; i < lastPcs.length; i++) {
    const pc = lastPcs[i];
    const disasm = (pc < 0x400000) ? disasmOne(romBytes, pc).mnem : '(RAM/sentinel)';
    console.log(`  ${hex(pc)} | ${disasm}`);
  }
  console.log('');

  // ── ROM disassembly around key addresses if errNo was written ──
  if (errNoWrites.length > 0) {
    const writerPc = errNoWrites.find(w => w.to === E_SYNTAX)?.pc;
    if (writerPc && writerPc < 0x400000) {
      console.log(`--- ROM disassembly around errNo writer PC ${hex(writerPc)} ---`);
      const start = Math.max(0, writerPc - 16);
      const end = Math.min(0x400000, writerPc + 32);
      const lines = disasmRange(romBytes, start, end);
      for (const line of lines) console.log(line);
      console.log('');
    }
  }

  // ── JError handler disassembly ──
  const JERROR_ADDR = 0x09b544;
  console.log(`--- ROM disassembly: JError at ${hex(JERROR_ADDR)} ---`);
  const jeLines = disasmRange(romBytes, JERROR_ADDR, JERROR_ADDR + 48);
  for (const line of jeLines) console.log(line);
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('=== SUMMARY ===');
  console.log('');
  if (errCaught) {
    console.log('  ParseInp terminated via error catch (errCaught=true).');
    console.log(`  Final errNo: ${hex(mem[ERR_NO_ADDR], 2)} (${errName(mem[ERR_NO_ADDR])})`);
    if (errNoWrites.length > 0) {
      const syntaxWrite = errNoWrites.find(w => w.to === E_SYNTAX);
      if (syntaxWrite) {
        console.log(`  ERR:SYNTAX was written at step ${syntaxWrite.step}, PC=${hex(syntaxWrite.pc)}`);
        console.log(`  PC trail leading to the write: ${syntaxWrite.trail.join(' -> ')}`);
      }
    }
  } else if (returnHit) {
    console.log('  ParseInp returned normally (no error).');
  } else {
    console.log('  ParseInp exhausted step budget or hit missing block.');
    console.log(`  Final PC: ${hex(finalPc)}`);
  }
  console.log('');
  console.log('=== Phase 135 probe complete ===');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
