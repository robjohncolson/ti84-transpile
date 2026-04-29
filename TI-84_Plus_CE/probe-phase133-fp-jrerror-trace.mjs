#!/usr/bin/env node

/**
 * Phase 133 — FP JError Trace: Find Upstream Blocker for gcd(12,8)
 *
 * When ParseInp processes gcd(12,8), errNo=0x81 is set and execution
 * stalls at PC=0x001221 (LCD busy-wait after JError). The FP category
 * byte at 0xD0060E is never written — it stays 0x00. The dispatch table
 * at 0x0686EF loads A from 0xD0060E and compares against 16 operation
 * codes. When A=0x00, none match and execution falls through to JError.
 *
 * This probe:
 *   1. Write-watchpoints on errNo (0xD008DF) and FP category (0xD0060E)
 *      to find the exact PC where each is set during gcd(12,8)
 *   2. Traces what happens when A=0x00 falls through the dispatch table
 *   3. Tests manual seeding of 0xD0060E=0x28 before dispatch to see
 *      if the mechanism routes correctly to 0x06859B→0x0689DE
 *   4. Examines callers of the 0xD0060E writers (0x095722, 0x095765,
 *      0x0957FF) to find the missing link
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';
import { decodeInstruction as decodeEz80 } from './ez80-decoder.js';

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

// gcd(12,8): 0xBB 0x18 = gcd(, 0x31 0x32 = "12", 0x2B = comma, 0x38 = "8", 0x11 = ), 0x3F = end
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

function disassembleRange(startAddr, endAddr) {
  let pc = startAddr;
  const lines = [];
  while (pc < endAddr) {
    try {
      const instr = decodeEz80(romBytes, pc, true);
      const bytes = hexBytes(romBytes, pc, instr.length);
      lines.push(`  ${hex(pc)}: ${bytes.padEnd(20)} ${instr.mnemonic || instr.tag || '???'}`);
      pc += instr.length;
    } catch (e) {
      lines.push(`  ${hex(pc)}: ${hexBytes(romBytes, pc, 1).padEnd(20)} ??? (decode error: ${e.message})`);
      pc += 1;
    }
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
  console.log('=== Phase 133: FP JError Trace — gcd(12,8) Upstream Blocker ===');
  console.log('');

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 1: Write-watchpoints on errNo and FP category byte
  // ══════════════════════════════════════════════════════════════════════════

  console.log('--- Test 1: Write-watchpoints on errNo (0xD008DF) and FP category (0xD0060E) ---');
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

    // Seed tokens and allocator
    seedTokens(mem, INPUT_TOKENS);
    seedAllocator(mem);

    // Record initial values
    const errNoBefore = mem[ERR_NO_ADDR] & 0xff;
    const fpCatBefore = mem[FP_CATEGORY_ADDR] & 0xff;
    console.log(`  errNo before: ${hex(errNoBefore, 2)}`);
    console.log(`  FP category (0xD0060E) before: ${hex(fpCatBefore, 2)}`);

    // Install write-watchpoints via a Proxy-like approach:
    // We'll snapshot these addresses every block and detect changes.
    const errNoWrites = [];
    const fpCatWrites = [];
    let prevErrNo = errNoBefore;
    let prevFpCat = fpCatBefore;
    let stepCount = 0;
    const recentPcs = [];
    let finalPc = null;
    let returnHit = false;
    let errCaught = false;

    // Key FP addresses to watch for hits
    const keyAddrHits = new Map();
    const KEY_ADDRS = [
      0x0686ef, // dispatch table entry
      0x066436, // error path
      0x07f95e, // error path
      0x06859b, // FP handler cat 0x28 (gcd)
      0x0689de, // FP handler dispatcher
      0x0689f9, // jump table base
      0x095722, // cat writer
      0x095765, // cat writer
      0x0957ff, // cat writer (0xFF wildcard)
      0x001221, // LCD busy-wait stall
    ];
    for (const a of KEY_ADDRS) keyAddrHits.set(a, 0);

    prepareCallState(cpu, mem);
    seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

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

          // Check errNo write-watchpoint
          const curErrNo = mem[ERR_NO_ADDR] & 0xff;
          if (curErrNo !== prevErrNo) {
            // Get the PCs leading up to this write
            const trail = recentPcs.slice(-8).map(p => hex(p)).join(' -> ');
            errNoWrites.push({ step: stepCount, pc: norm, from: prevErrNo, to: curErrNo, trail });
            prevErrNo = curErrNo;
          }

          // Check FP category write-watchpoint
          const curFpCat = mem[FP_CATEGORY_ADDR] & 0xff;
          if (curFpCat !== prevFpCat) {
            const trail = recentPcs.slice(-8).map(p => hex(p)).join(' -> ');
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

    console.log('');
    console.log(`  ParseInp result: returnHit=${returnHit} errCaught=${errCaught} steps=${stepCount} finalPc=${hex(finalPc)}`);
    console.log(`  Final errNo: ${hex(mem[ERR_NO_ADDR] & 0xff, 2)}`);
    console.log(`  Final FP cat: ${hex(mem[FP_CATEGORY_ADDR] & 0xff, 2)}`);
    console.log('');

    // errNo write log
    console.log(`  errNo writes detected (${errNoWrites.length}):`);
    for (const w of errNoWrites) {
      console.log(`    step=${w.step} PC=${hex(w.pc)} errNo: ${hex(w.from, 2)} -> ${hex(w.to, 2)}`);
      console.log(`      trail: ${w.trail}`);
    }
    console.log('');

    // FP category write log
    console.log(`  FP category (0xD0060E) writes detected (${fpCatWrites.length}):`);
    for (const w of fpCatWrites) {
      console.log(`    step=${w.step} PC=${hex(w.pc)} fpCat: ${hex(w.from, 2)} -> ${hex(w.to, 2)}`);
      console.log(`      trail: ${w.trail}`);
    }
    if (fpCatWrites.length === 0) {
      console.log('    NONE — confirms FP category byte is NEVER written during ParseInp("gcd(12,8)")');
    }
    console.log('');

    // Key address hits
    console.log('  Key address hit counts:');
    for (const [addr, hits] of keyAddrHits) {
      console.log(`    ${hex(addr)}: ${hits} hits`);
    }
    console.log('');

    // Last 32 PCs
    console.log(`  Last 32 PCs before termination:`);
    const lastPcs = recentPcs.slice(-32);
    for (let i = 0; i < lastPcs.length; i += 8) {
      console.log(`    ${lastPcs.slice(i, i + 8).map(p => hex(p)).join(' ')}`);
    }
    console.log('');

    // OP1 result
    const op1val = safeReadReal(wrap, OP1_ADDR);
    console.log(`  OP1: [${hexBytes(mem, OP1_ADDR, 9)}] decoded=${formatValue(op1val)}`);
    console.log('');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 2: Dispatch table fall-through analysis (A=0x00)
  // ══════════════════════════════════════════════════════════════════════════

  console.log('--- Test 2: Dispatch table fall-through when A=0x00 ---');
  console.log('  Disassembly at dispatch table 0x0686EF and surrounding area:');
  console.log('');

  // Disassemble the dispatch table area
  const dispatchLines = disassembleRange(0x0686e0, 0x068780);
  for (const line of dispatchLines) console.log(line);
  console.log('');

  // Disassemble the error path 0x066436 area
  console.log('  Disassembly at error path 0x066430-0x066480:');
  const errPathLines = disassembleRange(0x066430, 0x066480);
  for (const line of errPathLines) console.log(line);
  console.log('');

  // Check what block exists at the fall-through address
  // The dispatch table does CP xx; JR Z, ... for each of 16 values.
  // When none match, execution falls to the instruction AFTER the last JR Z.
  // Let's find that by disassembling further.
  console.log('  Disassembly at 0x068780-0x0687C0 (after dispatch table):');
  const afterDispatch = disassembleRange(0x068780, 0x0687c0);
  for (const line of afterDispatch) console.log(line);
  console.log('');

  // Check if blocks exist at key dispatch addresses
  console.log('  Block coverage at key dispatch addresses:');
  const checkAddrs = [0x0686ef, 0x066436, 0x07f95e, 0x06859b, 0x0689de, 0x0689f9];
  for (const addr of checkAddrs) {
    const exists = !!BLOCKS[addr];
    console.log(`    ${hex(addr)}: ${exists ? 'HAS BLOCK' : 'NO BLOCK'}`);
  }
  console.log('');

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 3: Callers of 0xD0060E writers (ROM disassembly)
  // ══════════════════════════════════════════════════════════════════════════

  console.log('--- Test 3: Disassembly around 0xD0060E writers ---');
  console.log('');

  // Writer at 0x095722
  console.log('  Writer at 0x095722 (context 0x095710-0x095740):');
  const writer1 = disassembleRange(0x095710, 0x095740);
  for (const line of writer1) console.log(line);
  console.log('');

  // Writer at 0x095765
  console.log('  Writer at 0x095765 (context 0x095750-0x095780):');
  const writer2 = disassembleRange(0x095750, 0x095780);
  for (const line of writer2) console.log(line);
  console.log('');

  // Writer at 0x0957FF
  console.log('  Writer at 0x0957FF (context 0x0957F0-0x095820):');
  const writer3 = disassembleRange(0x0957f0, 0x095820);
  for (const line of writer3) console.log(line);
  console.log('');

  // FP handler table at 0x068580
  console.log('  FP handler table at 0x068580-0x0685B0:');
  const fpTable = disassembleRange(0x068580, 0x0685b0);
  for (const line of fpTable) console.log(line);
  console.log('');

  // Check block coverage for writers
  console.log('  Block coverage for writers:');
  const writerAddrs = [0x095722, 0x095765, 0x0957ff, 0x095710, 0x095750, 0x0957f0];
  for (const addr of writerAddrs) {
    const exists = !!BLOCKS[addr];
    console.log(`    ${hex(addr)}: ${exists ? 'HAS BLOCK' : 'NO BLOCK'}`);
  }
  console.log('');

  // Search for CALL instructions targeting the writer subroutines
  // The writers are inside subroutines; find their entry points
  console.log('  Wider context around 0x095700-0x095830 (full subroutine):');
  const widerWriter = disassembleRange(0x095700, 0x095830);
  for (const line of widerWriter) console.log(line);
  console.log('');

  // ══════════════════════════════════════════════════════════════════════════
  // TEST 4: Manual seeding of 0xD0060E=0x28 before dispatch
  // ══════════════════════════════════════════════════════════════════════════

  console.log('--- Test 4: Manual seed 0xD0060E=0x28 before ParseInp ---');
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

    // Seed tokens and allocator
    seedTokens(mem, INPUT_TOKENS);
    seedAllocator(mem);

    // MANUALLY seed 0xD0060E = 0x28 (gcd category)
    mem[FP_CATEGORY_ADDR] = 0x28;
    console.log(`  Manually set 0xD0060E = ${hex(mem[FP_CATEGORY_ADDR] & 0xff, 2)} (gcd category)`);

    // Track whether dispatch routes through the gcd handler
    const keyHits = new Map();
    const gcdKeyAddrs = [
      [0x0686ef, 'dispatch table entry'],
      [0x06859b, 'FP handler cat 0x28'],
      [0x0689de, 'FP handler dispatcher (CALL target)'],
      [0x0689f9, 'jump table base'],
      [0x066436, 'error path'],
      [0x07f95e, 'error path 2'],
      [0x096024, 'common CALL for cat 0x00-0x0F'],
      [0x001221, 'LCD busy-wait stall'],
    ];
    for (const [a] of gcdKeyAddrs) keyHits.set(a, 0);

    const fpCatWrites = [];
    let prevFpCat = 0x28;
    const errNoWrites = [];
    let prevErrNo = 0;
    let stepCount = 0;
    const recentPcs = [];
    let finalPc = null;
    let returnHit = false;
    let errCaught = false;
    const missingBlocks = new Set();

    prepareCallState(cpu, mem);
    seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);
    // Re-seed the category after prepareCallState (in case it was cleared)
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

          if (keyHits.has(norm)) keyHits.set(norm, keyHits.get(norm) + 1);

          // Watch for FP category overwrites
          const curFpCat = mem[FP_CATEGORY_ADDR] & 0xff;
          if (curFpCat !== prevFpCat) {
            const trail = recentPcs.slice(-8).map(p => hex(p)).join(' -> ');
            fpCatWrites.push({ step: stepCount, pc: norm, from: prevFpCat, to: curFpCat, trail });
            prevFpCat = curFpCat;
          }

          // Watch errNo
          const curErrNo = mem[ERR_NO_ADDR] & 0xff;
          if (curErrNo !== prevErrNo) {
            const trail = recentPcs.slice(-8).map(p => hex(p)).join(' -> ');
            errNoWrites.push({ step: stepCount, pc: norm, from: prevErrNo, to: curErrNo, trail });
            prevErrNo = curErrNo;
          }

          if (norm === FAKE_RET) throw new Error('__RET__');
          if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
        },
        onMissingBlock(pc, _m, step) {
          const norm = pc & 0xffffff;
          finalPc = norm;
          missingBlocks.add(norm);
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

    // Key address hits
    console.log('  Key address hit counts (with manual 0x28 seed):');
    for (const [addr, label] of gcdKeyAddrs) {
      const hits = keyHits.get(addr);
      console.log(`    ${hex(addr)}: ${hits} hits  (${label})`);
    }
    console.log('');

    // FP category writes
    console.log(`  FP category writes with seed (${fpCatWrites.length}):`);
    for (const w of fpCatWrites) {
      console.log(`    step=${w.step} PC=${hex(w.pc)} fpCat: ${hex(w.from, 2)} -> ${hex(w.to, 2)}`);
      console.log(`      trail: ${w.trail}`);
    }
    console.log('');

    // errNo writes
    console.log(`  errNo writes with seed (${errNoWrites.length}):`);
    for (const w of errNoWrites) {
      console.log(`    step=${w.step} PC=${hex(w.pc)} errNo: ${hex(w.from, 2)} -> ${hex(w.to, 2)}`);
      console.log(`      trail: ${w.trail}`);
    }
    console.log('');

    // Missing blocks
    if (missingBlocks.size > 0) {
      console.log(`  Missing blocks hit (${missingBlocks.size}):`);
      const sorted = [...missingBlocks].sort((a, b) => a - b);
      for (const addr of sorted) {
        console.log(`    ${hex(addr)}`);
        const lines = disassembleRange(addr, Math.min(addr + 12, 0x400000));
        for (const line of lines) console.log(`      ${line}`);
      }
      console.log('');
    }

    // Last 32 PCs
    console.log(`  Last 32 PCs before termination:`);
    const lastPcs = recentPcs.slice(-32);
    for (let i = 0; i < lastPcs.length; i += 8) {
      console.log(`    ${lastPcs.slice(i, i + 8).map(p => hex(p)).join(' ')}`);
    }
    console.log('');

    // OP1 result
    const op1val = safeReadReal(wrap, OP1_ADDR);
    console.log(`  OP1: [${hexBytes(mem, OP1_ADDR, 9)}] decoded=${formatValue(op1val)}`);

    // Verdict for seeded run
    console.log('');
    const dispatchHits = keyHits.get(0x0686ef);
    const gcdHandlerHits = keyHits.get(0x06859b);
    const gcdDispHits = keyHits.get(0x0689de);
    console.log(`  SEEDED VERDICT:`);
    console.log(`    Dispatch table reached: ${dispatchHits > 0 ? 'YES' : 'NO'} (${dispatchHits} hits)`);
    console.log(`    gcd handler (0x06859B) reached: ${gcdHandlerHits > 0 ? 'YES' : 'NO'} (${gcdHandlerHits} hits)`);
    console.log(`    FP dispatcher (0x0689DE) reached: ${gcdDispHits > 0 ? 'YES' : 'NO'} (${gcdDispHits} hits)`);
    if (gcdHandlerHits > 0 || gcdDispHits > 0) {
      console.log('    => Manual seed WORKS — dispatch mechanism is functional');
      console.log('    => Problem is upstream: code that should write 0xD0060E is not reached');
    } else if (errCaught) {
      console.log(`    => Manual seed did NOT prevent error (errNo=${hex(mem[ERR_NO_ADDR] & 0xff, 2)})`);
      console.log('    => Either seed is overwritten before dispatch, or error is from a different path');
    } else {
      console.log('    => Dispatch table may not have been reached at all');
    }
    console.log('');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════════════════

  console.log('=== SUMMARY ===');
  console.log('Test 1: errNo/FP-category write-watchpoints during gcd(12,8)');
  console.log('Test 2: Dispatch table disassembly (fall-through path for A=0x00)');
  console.log('Test 3: Disassembly of 0xD0060E writer subroutines');
  console.log('Test 4: Manual 0xD0060E=0x28 seed to test dispatch mechanism');
  console.log('See detailed output above for each test.');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
