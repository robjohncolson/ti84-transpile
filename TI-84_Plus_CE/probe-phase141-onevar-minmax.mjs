#!/usr/bin/env node

/**
 * Phase 141 — OneVar minX/maxX Investigation
 *
 * Session 140 got 6/8 OneVar stat results correct for L1=[10,20,30,40,50]:
 *   n=5, xMean=30, sumX=150, sumX2=5500, Sx=15.8114, sigmaX=14.1421
 * But minX (0xD011C7) and maxX (0xD011D0) remained zero.
 *
 * This probe investigates WHY by:
 *   1. Running OneVar with 100K step budget
 *   2. Monitoring writes to minX/maxX addresses via snapshot-compare per step
 *   3. Dumping all 8 stat var slots with BCD-to-decimal
 *   4. If minX/maxX still zero, tracing last 1000 PCs to find where OneVar exits
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal, writeReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

// ── Constants (copied from probe-phase140-onevar-prealloc.mjs) ────────────

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_ENTRY = 0x09dee0;
const MEMINIT_RET = 0x7ffff6;

const FINDSYM_ENTRY = 0x0846ea;
const FINDSYM_RET = 0x7fffea;

const ONEVAR_ENTRY = 0x0a9325;
const ONEVAR_RET = 0x7fffee;

const OP1_ADDR = 0xd005f8;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

const USERMEM_ADDR = 0xd1a881;
const EMPTY_VAT_ADDR = 0xd3ffff;

const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const STAT_VARS_BASE = 0xd0117f;
const STAT_FLAGS_ADDR = 0xd00089;
const STATS_VALID_BIT = 0x40;
const STAT_FLAGS2_ADDR = 0xd0009a; // IY+26 = 0xD00080 + 0x1A

const ERR_CATCH_ADDR = 0x7ffffa;
const MAX_LOOP_ITER = 8192;

// ── Stat variable tokens ──────────────────────────────────────────────────

const STAT_TOKENS = [
  { name: 'n',      token: 0x02 },
  { name: 'xMean',  token: 0x03 },
  { name: 'sumX',   token: 0x04 },
  { name: 'sumX2',  token: 0x05 },
  { name: 'Sx',     token: 0x06 },
  { name: 'sigmaX', token: 0x07 },
  { name: 'minX',   token: 0x08 },
  { name: 'maxX',   token: 0x09 },
];

const EXPECTED = {
  0x02: 5.0,
  0x03: 30.0,
  0x04: 150.0,
  0x05: 5500.0,
  0x06: 15.81,
  0x07: 14.14,
  0x08: 10.0,
  0x09: 50.0,
};

// minX/maxX watch addresses
const MINX_ADDR = STAT_VARS_BASE + 0x08 * 9;  // 0xD011C7
const MAXX_ADDR = STAT_VARS_BASE + 0x09 * 9;  // 0xD011D0

// ── List data ─────────────────────────────────────────────────────────────

const L1_OP1 = Uint8Array.from([0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const BCD_VALUES = [
  Uint8Array.from([0x00, 0x81, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),  // 10
  Uint8Array.from([0x00, 0x81, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),  // 20
  Uint8Array.from([0x00, 0x81, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),  // 30
  Uint8Array.from([0x00, 0x81, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),  // 40
  Uint8Array.from([0x00, 0x81, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),  // 50
];

const LIST_ELEM_COUNT = 5;
const LIST_DATA_SIZE = 2 + LIST_ELEM_COUNT * 9;

// ── Utilities ─────────────────────────────────────────────────────────────

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

function write16(m, a, v) {
  m[a] = v & 0xff;
  m[a + 1] = (v >>> 8) & 0xff;
}

function hexBytes(m, a, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push((m[a + i] & 0xff).toString(16).toUpperCase().padStart(2, '0'));
  return out.join(' ');
}

function errName(code) {
  const names = {
    0x00: 'none',
    0x81: 'E_Overflow',
    0x82: 'E_DivBy0',
    0x83: 'E_SingularMat',
    0x84: 'E_Domain',
    0x85: 'E_Increment',
    0x86: 'E_Break',
    0x87: 'E_NonReal',
    0x88: 'E_Syntax',
    0x89: 'E_DataType',
    0x8a: 'E_JError',
    0x8b: 'E_Argument',
    0x8c: 'E_DimMismatch',
    0x8d: 'E_Undefined',
    0x8e: 'E_Memory',
    0x8f: 'E_Halted',
  };
  return names[code] || `unknown(${hex(code, 2)})`;
}

const memWrap = (m) => ({
  write8(a, v) { m[a] = v & 0xff; },
  read8(a) { return m[a] & 0xff; },
});

function safeReadReal(m, a) {
  try { return readReal(memWrap(m), a); }
  catch (e) { return `error: ${e?.message ?? e}`; }
}

// ── Runtime setup (copied exactly from phase 140) ─────────────────────────

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

function seedErrFrame(cpu, mem, ret) {
  cpu.sp -= 3;
  write24(mem, cpu.sp, ret);
  const base = (cpu.sp - 6) & 0xffffff;
  write24(mem, base, ERR_CATCH_ADDR);
  write24(mem, base + 3, 0);
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
  seedAllocator(mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  let ok = false;
  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
      onMissingBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
    });
  } catch (e) {
    if (e?.message === '__RET__') ok = true; else throw e;
  }
  return ok;
}

function writeVATEntry(mem, topAddr, typeByte, dataPtr, name1, name2 = 0x00, name3 = 0x00) {
  mem[topAddr]     = typeByte;
  mem[topAddr - 1] = 0x00;
  mem[topAddr - 2] = 0x00;
  mem[topAddr - 3] = dataPtr & 0xff;
  mem[topAddr - 4] = (dataPtr >> 8) & 0xff;
  mem[topAddr - 5] = (dataPtr >> 16) & 0xff;
  mem[topAddr - 6] = name1;
  mem[topAddr - 7] = name2;
  mem[topAddr - 8] = name3;

  const newProgPtr = topAddr - 9;
  write24(mem, PROGPTR_ADDR, newProgPtr);
  return newProgPtr;
}

function outcome(run) {
  if (run.returnHit) return 'returned';
  if (run.errCaught) return `error caught (errNo=${hex(run.errNo, 2)} ${errName(run.errNo)})`;
  return `stalled (finalPc=${hex(run.finalPc)})`;
}

// ── Snapshot helper for watchpoints ───────────────────────────────────────

function snapshot9(m, addr) {
  const out = new Uint8Array(9);
  for (let i = 0; i < 9; i++) out[i] = m[addr + i];
  return out;
}

function bytes9Equal(a, b) {
  for (let i = 0; i < 9; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 141: OneVar minX/maxX Investigation ===');
  console.log('');
  console.log(`  minX address: ${hex(MINX_ADDR)} (token 0x08, slot = 0xD0117F + 0x08*9 = 0xD011C7)`);
  console.log(`  maxX address: ${hex(MAXX_ADDR)} (token 0x09, slot = 0xD0117F + 0x09*9 = 0xD011D0)`);
  console.log('');

  const { mem, executor, cpu } = createRuntime();
  console.log('Cold-booting OS...');
  coldBoot(executor, cpu, mem);
  console.log('Cold boot complete.');
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // Setup: MEM_INIT + L1 + stat vars + flags (identical to phase 140 Part 4)
  // ═══════════════════════════════════════════════════════════════════════════

  if (!runMemInit(executor, cpu, mem)) {
    console.log('ABORT: MEM_INIT failed'); process.exitCode = 1; return;
  }
  console.log('  MEM_INIT: OK');

  // Separate FPS area from list data
  const FPS_BASE = USERMEM_ADDR;
  const LIST_DATA_ADDR = USERMEM_ADDR + 0x100;

  write24(mem, FPSBASE_ADDR, FPS_BASE);
  write24(mem, FPS_ADDR, FPS_BASE);

  // L1 data
  write16(mem, LIST_DATA_ADDR, LIST_ELEM_COUNT);
  for (let i = 0; i < BCD_VALUES.length; i++) {
    mem.set(BCD_VALUES[i], LIST_DATA_ADDR + 2 + i * 9);
  }
  write24(mem, NEWDATA_PTR_ADDR, LIST_DATA_ADDR + LIST_DATA_SIZE);

  // L1 VAT entry
  const pp = read24(mem, PROGPTR_ADDR);
  const ppNew = writeVATEntry(mem, pp, 0x01, LIST_DATA_ADDR, 0x01);
  write24(mem, OPS_ADDR, ppNew);

  // Pre-seed stat var RAM (0x0E prefix like ZeroStatVars)
  const BCD_ZERO = Uint8Array.from([0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  for (let t = 0; t < 64; t++) {
    const addr = STAT_VARS_BASE + t * 9;
    mem[addr] = 0x0e;
    mem[addr + 1] = 0x80;
    for (let j = 2; j < 9; j++) mem[addr + j] = 0x00;
  }
  // Stat answer region
  mem.fill(0xff, 0xd01485, 0xd014ea);

  // Set flags
  mem[STAT_FLAGS_ADDR] |= STATS_VALID_BIT;
  mem[STAT_FLAGS2_ADDR] |= 0x04; // skip ZeroStatVars

  // OP1 = L1
  mem.set(L1_OP1, OP1_ADDR);
  prepareCallState(cpu, mem);
  seedErrFrame(cpu, mem, ONEVAR_RET);
  mem[ERR_NO_ADDR] = 0x00;
  mem.set(L1_OP1, OP1_ADDR);

  // A=1 for single-list mode
  cpu.a = 0x01;

  // Push L1 OP1 onto FP stack
  {
    const fpsPtr = read24(mem, FPS_ADDR);
    mem.set(L1_OP1, fpsPtr);
    write24(mem, FPS_ADDR, fpsPtr + 9);
    console.log(`  FPS: pushed L1 OP1 at ${hex(fpsPtr)}, FPS now ${hex(fpsPtr + 9)}`);
  }

  console.log(`  List data at ${hex(LIST_DATA_ADDR)}, statFlags2=${hex(mem[STAT_FLAGS2_ADDR], 2)}`);
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // Run OneVar with write-watchpoints on minX/maxX
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('='.repeat(72));
  console.log('  Running OneVar (100K steps) with minX/maxX watchpoints');
  console.log('='.repeat(72));
  console.log('');

  // Snapshot minX/maxX before execution
  let prevMinX = snapshot9(mem, MINX_ADDR);
  let prevMaxX = snapshot9(mem, MAXX_ADDR);
  const watchLog = [];

  let finalPc = null;
  let returnHit = false;
  let errCaught = false;
  let stepCount = 0;
  const recentPcs = [];   // last 1000
  const missingBlocks = new Map();

  // We'll run block-by-block and check after each block for changes
  const BUDGET = 100000;

  try {
    executor.runFrom(ONEVAR_ENTRY, 'adl', {
      maxSteps: BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _m, _meta, step) {
        const norm = pc & 0xffffff;
        finalPc = norm;
        if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
        recentPcs.push(norm);
        if (recentPcs.length > 1000) recentPcs.shift();

        // Check minX watchpoint
        const curMinX = snapshot9(mem, MINX_ADDR);
        if (!bytes9Equal(prevMinX, curMinX)) {
          const val = safeReadReal(mem, MINX_ADDR);
          watchLog.push({
            type: 'minX',
            step: stepCount,
            pc: norm,
            oldBytes: hexBytes(prevMinX, 0, 9),
            newBytes: hexBytes(mem, MINX_ADDR, 9),
            value: val,
          });
          prevMinX = curMinX;
        }

        // Check maxX watchpoint
        const curMaxX = snapshot9(mem, MAXX_ADDR);
        if (!bytes9Equal(prevMaxX, curMaxX)) {
          const val = safeReadReal(mem, MAXX_ADDR);
          watchLog.push({
            type: 'maxX',
            step: stepCount,
            pc: norm,
            oldBytes: hexBytes(prevMaxX, 0, 9),
            newBytes: hexBytes(mem, MAXX_ADDR, 9),
            value: val,
          });
          prevMaxX = curMaxX;
        }

        if (norm === ONEVAR_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, _m, step) {
        const norm = pc & 0xffffff;
        finalPc = norm;
        if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
        recentPcs.push(norm);
        if (recentPcs.length > 1000) recentPcs.shift();
        missingBlocks.set(norm, (missingBlocks.get(norm) || 0) + 1);
        if (norm === ONEVAR_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
    });
  } catch (e) {
    if (e?.message === '__RET__') { returnHit = true; finalPc = ONEVAR_RET; }
    else if (e?.message === '__ERR__') { errCaught = true; finalPc = ERR_CATCH_ADDR; }
    else throw e;
  }

  const run = {
    returnHit, errCaught, finalPc, stepCount, recentPcs, missingBlocks,
    errNo: mem[ERR_NO_ADDR] & 0xff,
  };

  console.log(`  Outcome: ${outcome(run)}`);
  console.log(`  Steps: ${run.stepCount}`);
  console.log(`  errNo: ${hex(run.errNo, 2)} (${errName(run.errNo)})`);
  console.log(`  Final PC: ${hex(run.finalPc)}`);
  console.log('');

  if (missingBlocks.size > 0) {
    const filt = [...missingBlocks.entries()].filter(([a]) => a !== ONEVAR_RET && a !== ERR_CATCH_ADDR);
    if (filt.length > 0) {
      console.log(`  Missing blocks: ${filt.map(([a, c]) => `${hex(a)}(${c}x)`).join(', ')}`);
      console.log('');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Watchpoint results
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('='.repeat(72));
  console.log('  WATCHPOINT LOG: Writes to minX/maxX');
  console.log('='.repeat(72));
  console.log('');

  if (watchLog.length === 0) {
    console.log('  *** NO WRITES to minX or maxX detected during entire execution ***');
  } else {
    for (const entry of watchLog) {
      console.log(`  ${entry.type} written at step=${entry.step} PC=${hex(entry.pc)}`);
      console.log(`    old: [${entry.oldBytes}]`);
      console.log(`    new: [${entry.newBytes}]`);
      console.log(`    value: ${entry.value}`);
      console.log('');
    }
  }
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // All 8 stat var results
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('='.repeat(72));
  console.log('  STAT VARIABLE RESULTS');
  console.log('='.repeat(72));
  console.log('');

  let matchCount = 0;
  for (const s of STAT_TOKENS) {
    const slotAddr = STAT_VARS_BASE + s.token * 9;
    const val = safeReadReal(mem, slotAddr);
    const rawHex = hexBytes(mem, slotAddr, 11);
    const exp = EXPECTED[s.token];
    let tag = '';
    if (exp !== undefined && typeof val === 'number' && Math.abs(val - exp) < 0.1) {
      tag = ' MATCH';
      matchCount++;
    } else if (typeof val === 'number' && val === 0) {
      tag = ' ZERO';
    } else if (typeof val === 'number') {
      tag = ' (non-zero, unexpected)';
    }
    console.log(`  ${s.name.padEnd(8)} slot=${hex(slotAddr)}  val=${val}${tag}`);
    console.log(`           bytes(11)=[${rawHex}]`);
  }
  console.log('');
  console.log(`  Matches: ${matchCount}/${Object.keys(EXPECTED).length}`);
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // minX/maxX raw dump + surrounding region
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('='.repeat(72));
  console.log('  RAW DUMP: minX/maxX slots and surrounding region');
  console.log('='.repeat(72));
  console.log('');

  console.log(`  minX (11 bytes at ${hex(MINX_ADDR)}): [${hexBytes(mem, MINX_ADDR, 11)}]`);
  console.log(`  maxX (11 bytes at ${hex(MAXX_ADDR)}): [${hexBytes(mem, MAXX_ADDR, 11)}]`);
  console.log('');

  // Scan 0xD011D0 - 0xD01200 for non-zero bytes
  console.log('  Scanning 0xD011D0 - 0xD01200 for non-zero bytes:');
  let foundNonZero = false;
  for (let addr = 0xd011d0; addr < 0xd01200; addr++) {
    if (mem[addr] !== 0x00 && mem[addr] !== 0x0e && mem[addr] !== 0x80) {
      console.log(`    ${hex(addr)}: ${hex(mem[addr], 2)}`);
      foundNonZero = true;
    }
  }
  if (!foundNonZero) {
    console.log('    (all zero/0x0E/0x80 — no unexpected writes)');
  }
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // If minX/maxX still zero: trace last 1000 PCs
  // ═══════════════════════════════════════════════════════════════════════════

  const minXVal = safeReadReal(mem, MINX_ADDR);
  const maxXVal = safeReadReal(mem, MAXX_ADDR);
  const minXIsZero = typeof minXVal === 'number' && minXVal === 0;
  const maxXIsZero = typeof maxXVal === 'number' && maxXVal === 0;
  // Also check if the slot is still the 0x0E prefix we seeded
  const minXUnwritten = mem[MINX_ADDR] === 0x0e;
  const maxXUnwritten = mem[MAXX_ADDR] === 0x0e;

  if (minXUnwritten || maxXUnwritten || minXIsZero || maxXIsZero) {
    console.log('='.repeat(72));
    console.log('  TRACE: Last 1000 PCs (minX/maxX not computed)');
    console.log('='.repeat(72));
    console.log('');

    console.log(`  minX unwritten: ${minXUnwritten}, maxX unwritten: ${maxXUnwritten}`);
    console.log(`  minX value: ${minXVal}, maxX value: ${maxXVal}`);
    console.log('');

    // Show last 50 unique PCs to identify where OneVar ended
    const lastPcs = run.recentPcs.slice(-50);
    console.log(`  Last 50 PCs (of ${run.recentPcs.length} tracked):`);
    for (let i = 0; i < lastPcs.length; i += 10) {
      const chunk = lastPcs.slice(i, i + 10);
      console.log(`    ${chunk.map(p => hex(p)).join(' ')}`);
    }
    console.log('');

    // Frequency analysis of the last 1000 PCs — what blocks were hit most?
    const freq = new Map();
    for (const pc of run.recentPcs) {
      freq.set(pc, (freq.get(pc) || 0) + 1);
    }
    const top20 = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
    console.log('  Top 20 most-visited PCs (last 1000 blocks):');
    for (const [pc, count] of top20) {
      console.log(`    ${hex(pc)}: ${count} times`);
    }
    console.log('');

    // Check if OneVar returned or stalled
    if (!run.returnHit && !run.errCaught) {
      console.log('  OneVar did NOT return and did NOT error — it exhausted the step budget.');
      console.log('  This means it is likely stuck in a computation loop that needs more steps,');
      console.log('  or it branches to a subroutine (SortA, min/max scan) that has not been');
      console.log('  transpiled yet (missing blocks).');
    } else if (run.returnHit) {
      console.log('  OneVar RETURNED but did not write minX/maxX.');
      console.log('  This means the min/max computation is either:');
      console.log('    (a) In a separate routine called after the main OneVar computation');
      console.log('    (b) Skipped because of a flag or condition we have not set');
      console.log('    (c) Behind a branch that was not taken');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('');
  console.log('='.repeat(72));
  console.log('  SUMMARY');
  console.log('='.repeat(72));
  console.log('');
  console.log(`  Outcome: ${outcome(run)}`);
  console.log(`  Steps used: ${run.stepCount} / ${BUDGET}`);
  console.log(`  Watchpoint events: ${watchLog.length}`);
  console.log(`  Stat var matches: ${matchCount}/${Object.keys(EXPECTED).length}`);
  console.log(`  minX written: ${!minXUnwritten}`);
  console.log(`  maxX written: ${!maxXUnwritten}`);
  console.log(`  Missing blocks: ${missingBlocks.size}`);
  console.log('');

  if (watchLog.length > 0) {
    console.log('  KEY FINDING: minX/maxX ARE written during execution.');
    console.log('  Check the watchpoint log above for the PC that writes them.');
  } else {
    console.log('  KEY FINDING: minX/maxX are NEVER written during execution.');
    console.log('  Next steps:');
    console.log('    1. Check if OneVar calls SortA (JT slot 0x020674) or a min/max scanner');
    console.log('    2. Check if those routines have transpiled blocks');
    console.log('    3. Look for missing blocks near the end of execution — those may be');
    console.log('       the min/max computation routines');
  }

  console.log('');
  console.log('=== Phase 141 probe complete ===');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
