#!/usr/bin/env node

/**
 * Phase 134 — FP Seed Verification: Do New Seeds Enable gcd(12,8) Dispatch?
 *
 * Session 134 added 3 new seeds (0x068581, 0x0011E6, 0x093FAE) plus 4
 * already-present seeds (0x06859B, 0x0689DE, 0x0689F9, 0x066436) to the
 * transpiler. This probe boots MEM_INIT, feeds gcd(12,8) tokens into
 * ParseInp, and checks whether any of the 7 target addresses now get hit
 * during execution.
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

// gcd(12,8): 0xBB 0x07 = gcd(, 0x31 0x32 = "12", 0x2B = comma, 0x38 = "8", 0x29 = ), 0x3F = end
const INPUT_TOKENS = Uint8Array.from([0xbb, 0x07, 0x31, 0x32, 0x2b, 0x38, 0x29, 0x3f]);

const MEMINIT_BUDGET = 100000;
const PARSEINP_BUDGET = 50000;
const MAX_LOOP_ITER = 8192;
const RECENT_PC_LIMIT = 128;

// The 7 target addresses from session 134
const TARGET_ADDRS = [
  { addr: 0x068581, label: 'FP handler table interior' },
  { addr: 0x06859b, label: 'gcd category handler (LD A,0x28; CALL 0x0689DE; RET)' },
  { addr: 0x0689de, label: 'FP handler dispatch (SUB 0x20; index jump table)' },
  { addr: 0x0689f9, label: 'FP handler jump table target' },
  { addr: 0x066436, label: 'FP evaluation chain' },
  { addr: 0x0011e6, label: 'missing block in FP path' },
  { addr: 0x093fae, label: 'missing block in FP path' },
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
  console.log('=== Phase 134: FP Seed Verification — gcd(12,8) New Block Hits ===');
  console.log('');

  // Check block coverage for all 7 target addresses
  console.log('--- Block coverage check for target addresses ---');
  let allPresent = true;
  for (const { addr, label } of TARGET_ADDRS) {
    const key = `${addr.toString(16).padStart(6, '0')}:adl`;
    const exists = !!BLOCKS[key];
    console.log(`  ${hex(addr)}: ${exists ? 'HAS BLOCK' : 'NO BLOCK'}  (${label})`);
    if (!exists) allPresent = false;
  }
  console.log(`  All 7 have blocks: ${allPresent}`);
  console.log('');

  // Boot and run MEM_INIT
  const { mem, executor, cpu, wrap } = createRuntime();
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

  // Seed tokens and allocator
  seedTokens(mem, INPUT_TOKENS);
  seedAllocator(mem);

  // Build hit counter for target addresses
  const hitCounts = new Map();
  for (const { addr } of TARGET_ADDRS) hitCounts.set(addr, 0);

  // Also track missing blocks encountered
  const missingBlocks = new Map();

  let stepCount = 0;
  const recentPcs = [];
  let finalPc = null;
  let returnHit = false;
  let errCaught = false;

  prepareCallState(cpu, mem);
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  console.log('--- ParseInp("gcd(12,8)") with 50K step budget ---');
  console.log(`  Input tokens: [${Array.from(INPUT_TOKENS, b => '0x' + b.toString(16).toUpperCase().padStart(2, '0')).join(', ')}]`);
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

        if (hitCounts.has(norm)) hitCounts.set(norm, hitCounts.get(norm) + 1);

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

  // Results
  console.log(`  Result: returnHit=${returnHit} errCaught=${errCaught} steps=${stepCount} finalPc=${hex(finalPc)}`);
  console.log(`  errNo: ${hex(mem[ERR_NO_ADDR] & 0xff, 2)}`);
  console.log(`  FP category (0xD0060E): ${hex(mem[FP_CATEGORY_ADDR] & 0xff, 2)}`);
  console.log('');

  // OP1 result
  const op1val = safeReadReal(wrap, OP1_ADDR);
  console.log(`  OP1: [${hexBytes(mem, OP1_ADDR, 9)}] decoded=${formatValue(op1val)}`);
  console.log('');

  // Hit counts for target addresses
  console.log('--- Target address hit counts ---');
  let totalHits = 0;
  for (const { addr, label } of TARGET_ADDRS) {
    const hits = hitCounts.get(addr);
    totalHits += hits;
    const status = hits > 0 ? 'HIT' : 'miss';
    console.log(`  ${hex(addr)}: ${hits} hits  [${status}]  (${label})`);
  }
  console.log(`  Total target hits: ${totalHits} / 7 addresses`);
  console.log('');

  // Missing blocks encountered
  if (missingBlocks.size > 0) {
    console.log('--- Missing blocks encountered ---');
    const sorted = [...missingBlocks.entries()].sort((a, b) => b[1] - a[1]);
    for (const [addr, count] of sorted.slice(0, 20)) {
      console.log(`  ${hex(addr)}: ${count} hits`);
    }
    console.log('');
  }

  // Last 32 PCs
  console.log('--- Last 32 PCs before termination ---');
  const lastPcs = recentPcs.slice(-32);
  for (let i = 0; i < lastPcs.length; i += 8) {
    console.log(`  ${lastPcs.slice(i, i + 8).map(p => hex(p)).join(' ')}`);
  }
  console.log('');

  console.log('=== Phase 134 probe complete ===');
}

main();
