#!/usr/bin/env node

/**
 * Phase 141 P1 — gcd Probe with FpPop Seed
 *
 * Tests whether adding the FpPop seed (0x082957) unblocks the gcd dispatch.
 * Seeds the FP stack with 12.0 and 8.0, calls the gcd handler at 0x06859B,
 * and checks whether OP1 = gcd(12, 8) = 4.0.
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

const USERMEM_ADDR = 0xd1a881;
const EMPTY_VAT_ADDR = 0xd3ffff;
const OP1_ADDR = 0xd005f8;
const OP2_ADDR = 0xd00603;  // ROM-correct OP2 base (OP1 + 11 bytes)

const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const FP_CATEGORY_ADDR = 0xd0060e;
const GCD_HANDLER_ADDR = 0x06859b;
const GCD_DIRECT_ADDR = 0x068d3d;

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const MEMINIT_BUDGET = 100000;
const MAX_LOOP_ITER = 8192;

const FPS_CLEAN_AREA = 0xd1a900;

// BCD values
const BCD_12 = Uint8Array.from([0x00, 0x81, 0x12, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_8  = Uint8Array.from([0x00, 0x80, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const BCD_4  = Uint8Array.from([0x00, 0x80, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

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
  if (code === 0x84) return 'E_Domain';
  if (code === 0x88) return 'E_Syntax';
  if (code === 0x8d) return 'E_Undefined';
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
  // Use a clean area separate from userMem for FPS
  write24(mem, FPSBASE_ADDR, FPS_CLEAN_AREA);
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA);
  // Push 12.0 first (deeper on stack)
  mem.set(BCD_12, FPS_CLEAN_AREA);
  // Push 8.0 second (top of stack)
  mem.set(BCD_8, FPS_CLEAN_AREA + 9);
  // FPS points past both entries
  write24(mem, FPS_ADDR, FPS_CLEAN_AREA + 18);
  // Also seed OP1 and OP2 at ROM-correct addresses
  mem.set(BCD_12, OP1_ADDR);
  mem.set(BCD_8, OP2_ADDR);
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 141 P1: gcd Test with FpPop Seed (0x082957) ===');
  console.log('');

  const { mem, executor, cpu } = createRuntime();

  // Check that 0x082957 is now a known block (keys are "addr:mode" format)
  const hasFpPop = BLOCKS['082957:adl'] !== undefined;
  const hasGcdHandler = BLOCKS['068d3d:adl'] !== undefined;
  console.log(`  FpPop block at 0x082957: ${hasFpPop ? 'PRESENT' : 'MISSING'}`);
  console.log(`  gcd handler block at 0x068D3D: ${hasGcdHandler ? 'PRESENT' : 'MISSING'}`);

  // Cold boot
  console.log('  Cold-booting OS...');
  coldBoot(executor, cpu, mem);
  console.log('  Cold boot complete.');
  console.log('');

  // MEM_INIT
  console.log('  Running MEM_INIT...');
  const meminitOk = runMemInit(executor, cpu, mem);
  console.log(`  MEM_INIT: ${meminitOk ? 'OK' : 'FAILED'}`);
  if (!meminitOk) { process.exitCode = 1; return; }
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // Test A: Call gcd dispatch entry (0x06859B) with corrected OP2 address
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('='.repeat(72));
  console.log('  TEST A: gcd via dispatch entry 0x06859B');
  console.log('='.repeat(72));
  console.log('');

  prepareCallState(cpu, mem);
  seedFPSOperands(mem);
  seedAllocator(mem);
  mem[FP_CATEGORY_ADDR] = 0x28;  // gcd operation code
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  console.log(`  OP1 at 0xD005F8: [${hexBytes(mem, OP1_ADDR, 9)}]`);
  console.log(`  OP2 at 0xD00603: [${hexBytes(mem, OP2_ADDR, 9)}]`);
  console.log(`  FPS base: ${hex(read24(mem, FPSBASE_ADDR))}`);
  console.log(`  FPS ptr:  ${hex(read24(mem, FPS_ADDR))}`);
  console.log(`  FP category (0xD0060E): ${hex(mem[FP_CATEGORY_ADDR], 2)}`);
  console.log('');

  let stepCountA = 0;
  let finalPcA = null;
  let returnHitA = false;
  let errCaughtA = false;
  const recentPcsA = [];
  const missingBlocksA = new Map();

  try {
    executor.runFrom(GCD_HANDLER_ADDR, 'adl', {
      maxSteps: 50000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _m, _meta, step) {
        const norm = pc & 0xffffff;
        finalPcA = norm;
        if (typeof step === 'number') stepCountA = Math.max(stepCountA, step + 1);
        recentPcsA.push(norm);
        if (recentPcsA.length > 128) recentPcsA.shift();
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, _m, step) {
        const norm = pc & 0xffffff;
        finalPcA = norm;
        if (typeof step === 'number') stepCountA = Math.max(stepCountA, step + 1);
        recentPcsA.push(norm);
        if (recentPcsA.length > 128) recentPcsA.shift();
        missingBlocksA.set(norm, (missingBlocksA.get(norm) || 0) + 1);
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
    });
  } catch (e) {
    if (e?.message === '__RET__') { returnHitA = true; finalPcA = FAKE_RET; }
    else if (e?.message === '__ERR__') { errCaughtA = true; finalPcA = ERR_CATCH_ADDR; }
    else throw e;
  }

  const errNoA = mem[ERR_NO_ADDR] & 0xff;
  const is4A = matchesBCD4(mem, OP1_ADDR);

  console.log(`  Result: ${returnHitA ? 'RETURNED' : errCaughtA ? 'ERROR CAUGHT' : 'BUDGET EXHAUSTED'}`);
  console.log(`  Steps: ${stepCountA}`);
  console.log(`  errNo: ${hex(errNoA, 2)} (${errName(errNoA)})`);
  console.log(`  OP1: [${hexBytes(mem, OP1_ADDR, 9)}]`);
  console.log(`  OP1 = 4.0 (gcd(12,8)): ${is4A ? 'YES' : 'NO'}`);
  console.log(`  E_Domain hit: ${errNoA === 0x84 ? 'YES' : 'NO'}`);
  console.log('');

  if (missingBlocksA.size > 0) {
    const filt = [...missingBlocksA.entries()].filter(([a]) => a !== FAKE_RET && a !== ERR_CATCH_ADDR);
    if (filt.length > 0) {
      console.log(`  Missing blocks: ${filt.map(([a, c]) => `${hex(a)}(${c}x)`).join(', ')}`);
      console.log('');
    }
  }

  if (!returnHitA && !errCaughtA) {
    console.log('  Last 20 PCs:');
    for (const pc of recentPcsA.slice(-20)) {
      console.log(`    ${hex(pc)}`);
    }
    console.log('');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Test B: Call gcd handler directly (0x068D3D)
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('='.repeat(72));
  console.log('  TEST B: gcd via direct handler 0x068D3D');
  console.log('='.repeat(72));
  console.log('');

  prepareCallState(cpu, mem);
  seedFPSOperands(mem);
  seedAllocator(mem);
  mem[FP_CATEGORY_ADDR] = 0x28;
  seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  console.log(`  OP1 at 0xD005F8: [${hexBytes(mem, OP1_ADDR, 9)}]`);
  console.log(`  OP2 at 0xD00603: [${hexBytes(mem, OP2_ADDR, 9)}]`);
  console.log('');

  let stepCountB = 0;
  let finalPcB = null;
  let returnHitB = false;
  let errCaughtB = false;
  const recentPcsB = [];
  const missingBlocksB = new Map();

  try {
    executor.runFrom(GCD_DIRECT_ADDR, 'adl', {
      maxSteps: 50000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _m, _meta, step) {
        const norm = pc & 0xffffff;
        finalPcB = norm;
        if (typeof step === 'number') stepCountB = Math.max(stepCountB, step + 1);
        recentPcsB.push(norm);
        if (recentPcsB.length > 128) recentPcsB.shift();
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, _m, step) {
        const norm = pc & 0xffffff;
        finalPcB = norm;
        if (typeof step === 'number') stepCountB = Math.max(stepCountB, step + 1);
        recentPcsB.push(norm);
        if (recentPcsB.length > 128) recentPcsB.shift();
        missingBlocksB.set(norm, (missingBlocksB.get(norm) || 0) + 1);
        if (norm === FAKE_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
    });
  } catch (e) {
    if (e?.message === '__RET__') { returnHitB = true; finalPcB = FAKE_RET; }
    else if (e?.message === '__ERR__') { errCaughtB = true; finalPcB = ERR_CATCH_ADDR; }
    else throw e;
  }

  const errNoB = mem[ERR_NO_ADDR] & 0xff;
  const is4B = matchesBCD4(mem, OP1_ADDR);

  console.log(`  Result: ${returnHitB ? 'RETURNED' : errCaughtB ? 'ERROR CAUGHT' : 'BUDGET EXHAUSTED'}`);
  console.log(`  Steps: ${stepCountB}`);
  console.log(`  errNo: ${hex(errNoB, 2)} (${errName(errNoB)})`);
  console.log(`  OP1: [${hexBytes(mem, OP1_ADDR, 9)}]`);
  console.log(`  OP1 = 4.0 (gcd(12,8)): ${is4B ? 'YES' : 'NO'}`);
  console.log(`  E_Domain hit: ${errNoB === 0x84 ? 'YES' : 'NO'}`);
  console.log('');

  if (missingBlocksB.size > 0) {
    const filt = [...missingBlocksB.entries()].filter(([a]) => a !== FAKE_RET && a !== ERR_CATCH_ADDR);
    if (filt.length > 0) {
      console.log(`  Missing blocks: ${filt.map(([a, c]) => `${hex(a)}(${c}x)`).join(', ')}`);
      console.log('');
    }
  }

  if (!returnHitB && !errCaughtB) {
    console.log('  Last 20 PCs:');
    for (const pc of recentPcsB.slice(-20)) {
      console.log(`    ${hex(pc)}`);
    }
    console.log('');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('='.repeat(72));
  console.log('  SUMMARY');
  console.log('='.repeat(72));
  console.log('');
  console.log(`  FpPop block (0x082957): ${hasFpPop ? 'PRESENT' : 'MISSING'}`);
  console.log(`  gcd handler (0x068D3D): ${hasGcdHandler ? 'PRESENT' : 'MISSING'}`);
  console.log('');
  console.log('  Test A (dispatch 0x06859B):');
  console.log(`    Status:   ${returnHitA ? 'RETURNED' : errCaughtA ? 'ERROR' : 'STALLED'}`);
  console.log(`    errNo:    ${hex(errNoA, 2)} (${errName(errNoA)})`);
  console.log(`    OP1=4.0:  ${is4A ? 'YES' : 'NO'}`);
  console.log(`    Steps:    ${stepCountA}`);
  console.log('');
  console.log('  Test B (direct 0x068D3D):');
  console.log(`    Status:   ${returnHitB ? 'RETURNED' : errCaughtB ? 'ERROR' : 'STALLED'}`);
  console.log(`    errNo:    ${hex(errNoB, 2)} (${errName(errNoB)})`);
  console.log(`    OP1=4.0:  ${is4B ? 'YES' : 'NO'}`);
  console.log(`    Steps:    ${stepCountB}`);
  console.log('');

  const success = (is4A || is4B) && (errNoA === 0x00 || errNoB === 0x00);
  if (success) {
    console.log('  RESULT: gcd(12,8) = 4.0 COMPUTED SUCCESSFULLY');
  } else if (errNoA !== 0x84 && errNoB !== 0x84) {
    console.log('  RESULT: E_Domain no longer raised (progress!), but gcd not yet correct');
  } else {
    console.log('  RESULT: E_Domain still raised — FpPop seed alone does not fix gcd');
  }
  console.log('');
  console.log('=== Phase 141 P1 probe complete ===');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
