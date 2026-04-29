#!/usr/bin/env node

/**
 * Phase 140 — OneVar Pre-Alloc Probe
 *
 * Fix OneVar's error by pre-creating stat result variables before calling
 * OneVar, so it doesn't need to allocate them internally.
 *
 * Strategy:
 *   1. Map stat variable tokens to RAM addresses via ti84pceg.inc
 *   2. Create L1 with data [10,20,30,40,50] using manual VAT entry
 *   3. Pre-create Real VAT entries for all 8 stat result variables
 *   4. Pre-seed the stat var RAM slots with zero values
 *   5. Run OneVar with 100K step budget
 *   6. If error persists, try errSP error recovery frame
 *
 * Stat variable slot formula: 0xD0117F + (token * 9)
 *
 * From ti84pceg.inc:
 *   tStatN   = 0x02  (n)
 *   tSumX    = 0x04  (Σx)
 *   tSumXSqr = 0x05  (Σx²)
 *   tStdX    = 0x06  (Sx, sample std dev)
 *   tStdPX   = 0x07  (σx, population std dev)
 *   tMinX    = 0x08  (min X)
 *   tMaxX    = 0x09  (max X)
 *   tMean    = 0x21  (x̄)
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

// ── Constants ──────────────────────────────────────────────────────────────

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

const ERR_CATCH_ADDR = 0x7ffffa;
const MAX_LOOP_ITER = 8192;

// ── Stat variable tokens (from ti84pceg.inc) ─────────────────────────────

// Token-indexed stat vars (used by Rcl_StatVar/Sto_StatVar):
// addr = statVarsOffset + token * 9 = 0xD0117F + token * 9
const STAT_TOKENS = [
  { name: 'n',      token: 0x02 },  // tStatN → 0xD01191 = StatN
  { name: 'xMean',  token: 0x03 },  // tXMean → 0xD0119A = XMean
  { name: 'sumX',   token: 0x04 },  // tSumX → 0xD011A3 = SumX
  { name: 'sumX2',  token: 0x05 },  // tSumXSqr → 0xD011AC = SumXSqr
  { name: 'Sx',     token: 0x06 },  // tStdX → 0xD011B5 = StdX
  { name: 'sigmaX', token: 0x07 },  // tStdPX → 0xD011BE = StdPX
  { name: 'minX',   token: 0x08 },  // tMinX → 0xD011C7 = MinX
  { name: 'maxX',   token: 0x09 },  // tMaxX → 0xD011D0 = MaxX
  { name: 'meanX',  token: 0x21 },  // tMean → 0xD012A8 (old mean location)
];

// Expected results for [10, 20, 30, 40, 50]
// n=5, mean=30, Σx=150, Σx²=5500
// Sx = √(Σ(x-x̄)²/(n-1)) = √(1000/4) = √250 ≈ 15.8114
// σx = √(Σ(x-x̄)²/n)     = √(1000/5) = √200 ≈ 14.1421
const EXPECTED = {
  0x02: 5.0,       // n
  0x03: 30.0,      // xMean
  0x04: 150.0,     // Σx
  0x05: 5500.0,    // Σx²
  0x06: 15.81,     // Sx ≈ 15.8114 (sample std dev)
  0x07: 14.14,     // σx ≈ 14.1421 (pop std dev)
  0x08: 10.0,      // minX
  0x09: 50.0,      // maxX
  0x21: 30.0,      // mean (old tMean location)
};

// ── List data ────────────────────────────────────────────────────────────

const L1_OP1 = Uint8Array.from([0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const BCD_VALUES = [
  Uint8Array.from([0x00, 0x81, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),  // 10
  Uint8Array.from([0x00, 0x81, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),  // 20
  Uint8Array.from([0x00, 0x81, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),  // 30
  Uint8Array.from([0x00, 0x81, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),  // 40
  Uint8Array.from([0x00, 0x81, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),  // 50
];

const LIST_ELEM_COUNT = 5;
const LIST_DATA_SIZE = 2 + LIST_ELEM_COUNT * 9; // 2-byte count + 5 * 9-byte BCD

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

// ── VAT entry writer ─────────────────────────────────────────────────────

function writeVATEntry(mem, topAddr, typeByte, dataPtr, name1, name2 = 0x00, name3 = 0x00) {
  mem[topAddr]     = typeByte;
  mem[topAddr - 1] = 0x00;                     // version
  mem[topAddr - 2] = 0x00;                     // page
  mem[topAddr - 3] = dataPtr & 0xff;           // ptr low
  mem[topAddr - 4] = (dataPtr >> 8) & 0xff;    // ptr mid
  mem[topAddr - 5] = (dataPtr >> 16) & 0xff;   // ptr high
  mem[topAddr - 6] = name1;
  mem[topAddr - 7] = name2;
  mem[topAddr - 8] = name3;

  const newProgPtr = topAddr - 9;
  write24(mem, PROGPTR_ADDR, newProgPtr);
  return newProgPtr;
}

// ── Run-call helper ────────────────────────────────────────────────────────

function runCall(executor, cpu, mem, { entry, budget, returnPc, traceAll = false }) {
  let finalPc = null;
  let returnHit = false;
  let errCaught = false;
  let stepCount = 0;
  const recentPcs = [];
  const allPcs = [];
  const missingBlocks = new Map();

  try {
    executor.runFrom(entry, 'adl', {
      maxSteps: budget,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _m, _meta, step) {
        const norm = pc & 0xffffff;
        finalPc = norm;
        if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
        recentPcs.push(norm);
        if (recentPcs.length > 128) recentPcs.shift();
        if (traceAll && allPcs.length < 500) allPcs.push(norm);
        if (norm === returnPc) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, _m, step) {
        const norm = pc & 0xffffff;
        finalPc = norm;
        if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
        recentPcs.push(norm);
        if (recentPcs.length > 128) recentPcs.shift();
        if (traceAll && allPcs.length < 500) allPcs.push(norm);
        missingBlocks.set(norm, (missingBlocks.get(norm) || 0) + 1);
        if (norm === returnPc) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
    });
  } catch (e) {
    if (e?.message === '__RET__') { returnHit = true; finalPc = returnPc; }
    else if (e?.message === '__ERR__') { errCaught = true; finalPc = ERR_CATCH_ADDR; }
    else throw e;
  }

  return {
    returnHit, errCaught, finalPc, stepCount, recentPcs, allPcs, missingBlocks,
    a: cpu.a & 0xff, f: cpu.f & 0xff,
    hl: cpu.hl & 0xffffff, de: cpu.de & 0xffffff,
    sp: cpu.sp & 0xffffff,
    errNo: mem[ERR_NO_ADDR] & 0xff,
  };
}

function outcome(run) {
  if (run.returnHit) return 'returned';
  if (run.errCaught) return `error caught (errNo=${hex(run.errNo, 2)} ${errName(run.errNo)})`;
  return `stalled (finalPc=${hex(run.finalPc)})`;
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 140: OneVar Pre-Alloc — Fix E_Memory via Pre-Created Stat Vars ===');
  console.log('');

  const { mem, executor, cpu } = createRuntime();
  console.log('Cold-booting OS...');
  coldBoot(executor, cpu, mem);
  console.log('Cold boot complete.');
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // Part 1: Stat Variable Address Map
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('='.repeat(72));
  console.log('  PART 1: Stat Variable Address Map');
  console.log('='.repeat(72));
  console.log('');
  console.log('  Base: statVarsOffset = 0xD0117F');
  console.log('  Formula: slot_addr = 0xD0117F + (token * 9)');
  console.log('');

  for (const s of STAT_TOKENS) {
    const addr = STAT_VARS_BASE + s.token * 9;
    console.log(`  ${s.name.padEnd(8)} token=0x${s.token.toString(16).padStart(2, '0')}  addr=${hex(addr)}  current=${hexBytes(mem, addr, 9)}`);
  }
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // Part 2: Build L1 + stat var VAT entries
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('='.repeat(72));
  console.log('  PART 2: Pre-Create L1 + Stat Result Variables');
  console.log('='.repeat(72));
  console.log('');

  // Initialize memory allocator
  if (!runMemInit(executor, cpu, mem)) {
    console.log('ABORT: MEM_INIT failed'); process.exitCode = 1; return;
  }
  console.log('  MEM_INIT: OK');

  // --- Place L1 data in user memory ---
  const listDataAddr = USERMEM_ADDR;
  write16(mem, listDataAddr, LIST_ELEM_COUNT);
  for (let i = 0; i < BCD_VALUES.length; i++) {
    mem.set(BCD_VALUES[i], listDataAddr + 2 + i * 9);
  }
  const afterListData = listDataAddr + LIST_DATA_SIZE;

  console.log(`  L1 data at ${hex(listDataAddr)}, ${LIST_ELEM_COUNT} elements, ends at ${hex(afterListData)}`);
  for (let i = 0; i < LIST_ELEM_COUNT; i++) {
    console.log(`    elem[${i}] = ${safeReadReal(mem, listDataAddr + 2 + i * 9)}`);
  }

  // --- Place stat result variable data (9 bytes each, initialized to BCD zero) ---
  // Each Real var needs 9 bytes of data space
  const BCD_ZERO = Uint8Array.from([0x00, 0x80, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  const statDataAddrs = {};
  let dataPtr = afterListData;

  for (const s of STAT_TOKENS) {
    statDataAddrs[s.token] = dataPtr;
    mem.set(BCD_ZERO, dataPtr);
    dataPtr += 9;
  }
  write24(mem, NEWDATA_PTR_ADDR, dataPtr);

  console.log('');
  console.log('  Stat var data locations:');
  for (const s of STAT_TOKENS) {
    console.log(`    ${s.name.padEnd(8)} data at ${hex(statDataAddrs[s.token])}`);
  }

  // --- Build VAT entries (from top of VAT downward) ---
  // First entry: L1 (ListObj = 0x01, name byte = 0x01)
  let vatTop = read24(mem, PROGPTR_ADDR);
  vatTop = writeVATEntry(mem, vatTop, 0x01, listDataAddr, 0x01);

  console.log('');
  console.log(`  L1 VAT entry written, progPtr now ${hex(vatTop)}`);

  // Stat var entries: type = 0x00 (RealObj), name = stat token byte
  // The TI-OS stat variable system uses a special type/name convention.
  // Looking at ti84pceg.inc: stat vars are stored differently from regular
  // vars. They use a dedicated RAM region (statVarsOffset), NOT the VAT.
  // OneVar writes results directly to statVarsOffset + (token * 9).
  //
  // So we DON'T need VAT entries for stat vars — we need to ensure the
  // RAM slots at statVarsOffset are writable and the statsValid flag is set.

  console.log('');
  console.log('  NOTE: Stat vars use dedicated RAM at statVarsOffset, not VAT.');
  console.log('  Pre-seeding stat var RAM slots with BCD zero...');

  for (const s of STAT_TOKENS) {
    const slotAddr = STAT_VARS_BASE + s.token * 9;
    mem.set(BCD_ZERO, slotAddr);
  }

  // Also zero out a wider region around the stat vars for safety
  // The stat var area spans tokens 0x00..0x3F (64 slots * 9 bytes = 576 bytes)
  mem.fill(0x00, STAT_VARS_BASE, STAT_VARS_BASE + 64 * 9);

  // Set statsValid flag
  mem[STAT_FLAGS_ADDR] |= STATS_VALID_BIT;
  console.log(`  statsValid flag set (byte at ${hex(STAT_FLAGS_ADDR)}: ${hex(mem[STAT_FLAGS_ADDR], 2)})`);

  // Update OPS to match progPtr
  write24(mem, OPS_ADDR, vatTop);

  console.log('');

  // --- Verify FindSym finds L1 ---
  console.log('--- Verify FindSym finds L1 ---');
  mem.set(L1_OP1, OP1_ADDR);
  prepareCallState(cpu, mem);
  seedErrFrame(cpu, mem, FINDSYM_RET);
  mem.set(L1_OP1, OP1_ADDR);

  const findL1 = runCall(executor, cpu, mem, {
    entry: FINDSYM_ENTRY, budget: 5000, returnPc: FINDSYM_RET,
  });
  const l1Carry = findL1.f & 1;
  console.log(`  FindSym L1: ${outcome(findL1)} carry=${l1Carry} (${l1Carry === 0 ? 'FOUND' : 'NOT FOUND'})`);
  console.log(`  DE=${hex(findL1.de)} (should point to list data)`);

  if (l1Carry !== 0) {
    console.log('  WARNING: L1 not found! OneVar will likely fail.');
  }
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // Part 3: Run OneVar with pre-created variables (100K steps)
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('='.repeat(72));
  console.log('  PART 3: Run OneVar (100K steps)');
  console.log('='.repeat(72));
  console.log('');

  // Fresh setup for OneVar
  if (!runMemInit(executor, cpu, mem)) {
    console.log('ABORT: MEM_INIT failed'); process.exitCode = 1; return;
  }

  // Rebuild L1 data
  write16(mem, USERMEM_ADDR, LIST_ELEM_COUNT);
  for (let i = 0; i < BCD_VALUES.length; i++) {
    mem.set(BCD_VALUES[i], USERMEM_ADDR + 2 + i * 9);
  }
  write24(mem, NEWDATA_PTR_ADDR, USERMEM_ADDR + LIST_DATA_SIZE);

  // Build L1 VAT entry
  const pp3 = read24(mem, PROGPTR_ADDR);
  const pp3new = writeVATEntry(mem, pp3, 0x01, USERMEM_ADDR, 0x01);
  write24(mem, OPS_ADDR, pp3new);

  // Pre-seed stat var RAM slots
  mem.fill(0x00, STAT_VARS_BASE, STAT_VARS_BASE + 64 * 9);
  for (const s of STAT_TOKENS) {
    const slotAddr = STAT_VARS_BASE + s.token * 9;
    mem.set(BCD_ZERO, slotAddr);
  }

  // Set statsValid
  mem[STAT_FLAGS_ADDR] |= STATS_VALID_BIT;

  // Set up OP1 for OneVar — it expects the list name in OP1
  mem.set(L1_OP1, OP1_ADDR);
  prepareCallState(cpu, mem);
  seedErrFrame(cpu, mem, ONEVAR_RET);
  mem[ERR_NO_ADDR] = 0x00;
  mem.set(L1_OP1, OP1_ADDR);

  console.log(`  L1 data at ${hex(USERMEM_ADDR)}, VAT at ${hex(pp3)}`);
  console.log(`  progPtr=${hex(pp3new)}, OPS=${hex(read24(mem, OPS_ADDR))}`);
  console.log(`  errNo before: ${hex(mem[ERR_NO_ADDR], 2)}`);
  // Part 3a: Run with 100K first to see progress
  console.log(`  Running OneVar (budget=100000)...`);

  const ov1 = runCall(executor, cpu, mem, {
    entry: ONEVAR_ENTRY, budget: 100000, returnPc: ONEVAR_RET,
  });

  console.log(`  OneVar: ${outcome(ov1)}`);
  console.log(`  Steps: ${ov1.stepCount}, errNo: ${hex(ov1.errNo, 2)} (${errName(ov1.errNo)})`);
  console.log(`  DE=${hex(ov1.de)} HL=${hex(ov1.hl)} SP=${hex(ov1.sp)}`);

  if (ov1.missingBlocks.size > 0) {
    const filt = [...ov1.missingBlocks.entries()].filter(([a]) => a !== ONEVAR_RET && a !== ERR_CATCH_ADDR);
    if (filt.length > 0) {
      console.log(`  Missing blocks: ${filt.map(([a, c]) => `${hex(a)}(${c}x)`).join(', ')}`);
    }
  }

  const last20 = ov1.recentPcs.slice(-20);
  console.log(`  Last 20 PCs: ${last20.map(p => hex(p)).join(' ')}`);
  console.log('');

  // Read stat var slots
  console.log('--- Stat variable results (after 100K steps) ---');
  let matchCount1 = 0;
  for (const s of STAT_TOKENS) {
    const slotAddr = STAT_VARS_BASE + s.token * 9;
    const val = safeReadReal(mem, slotAddr);
    const exp = EXPECTED[s.token];
    let tag = '';
    if (exp !== null && typeof val === 'number' && Math.abs(val - exp) < 0.01) {
      tag = ' MATCH';
      matchCount1++;
    } else if (typeof val === 'number' && val !== 0) {
      tag = ' (non-zero)';
    }
    console.log(`  ${s.name.padEnd(8)} slot=${hex(slotAddr)}  val=${val}${tag}  bytes=[${hexBytes(mem, slotAddr, 9)}]`);
  }
  console.log(`  Matches: ${matchCount1}/${STAT_TOKENS.length}`);
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // Part 4: Fix — set statFlags2 bit 2 to skip ZeroStatVars (500K steps)
  // ═══════════════════════════════════════════════════════════════════════════
  //
  // Root cause analysis from Part 3 trace:
  // OneVar calls 0x0AA697 → 0x0AA69B tests bit 2 of (IY+26) = statFlags2.
  // If bit 2 is CLEAR, it calls 0x03E8FB (ZeroStatVars) which:
  //   - Clears statsValid (bit 6 of IY+9)
  //   - Writes 0x0E to OP1[0], overwriting the ListObj type byte
  //   - Loops 53 times writing 0x0E-prefix zeros to stat var area
  //   - After loop, sets OP1 to EquObj type (0x03) for equation lookup
  // Later at 0x0A928F, the code re-checks OP1[0] for ListObj (0x01),
  // finds 0x0E or 0x03 instead, and raises E_DataType (0x89).
  //
  // Fix: set bit 2 of statFlags2 = (IY+26) = 0xD0009A to skip ZeroStatVars.
  // Also pre-seed the stat var RAM slots (since ZeroStatVars won't run).

  const STAT_FLAGS2_ADDR = 0xd0009a; // IY+26 = 0xD00080 + 0x1A

  {
    console.log('='.repeat(72));
    console.log('  PART 4: OneVar with statFlags2 bit 2 set (skip ZeroStatVars)');
    console.log('='.repeat(72));
    console.log('');

    // Fresh setup
    if (!runMemInit(executor, cpu, mem)) {
      console.log('ABORT: MEM_INIT failed'); process.exitCode = 1; return;
    }

    // Separate FPS area from list data:
    // FPS base at USERMEM_ADDR, list data above it (at +0x100)
    const FPS_BASE = USERMEM_ADDR;
    const LIST_DATA_ADDR = USERMEM_ADDR + 0x100;

    write24(mem, FPSBASE_ADDR, FPS_BASE);
    write24(mem, FPS_ADDR, FPS_BASE);

    // Rebuild L1 at LIST_DATA_ADDR (not USERMEM_ADDR)
    write16(mem, LIST_DATA_ADDR, LIST_ELEM_COUNT);
    for (let i = 0; i < BCD_VALUES.length; i++) {
      mem.set(BCD_VALUES[i], LIST_DATA_ADDR + 2 + i * 9);
    }
    write24(mem, NEWDATA_PTR_ADDR, LIST_DATA_ADDR + LIST_DATA_SIZE);

    const pp4 = read24(mem, PROGPTR_ADDR);
    const pp4new = writeVATEntry(mem, pp4, 0x01, LIST_DATA_ADDR, 0x01);
    write24(mem, OPS_ADDR, pp4new);

    // Pre-seed stat var RAM slots with proper BCD zeros
    for (const s of STAT_TOKENS) {
      mem.set(BCD_ZERO, STAT_VARS_BASE + s.token * 9);
    }
    // Zero the wider stat region (tokens 0x00..0x3F)
    // Use 0x0E prefix (same as ZeroStatVars would use) for all 64 slots
    for (let t = 0; t < 64; t++) {
      const addr = STAT_VARS_BASE + t * 9;
      mem[addr] = 0x0e; // type marker ZeroStatVars uses
      mem[addr + 1] = 0x80;
      for (let j = 2; j < 9; j++) mem[addr + j] = 0x00;
    }
    // Also fill the stat ans region (0xD01485..0xD014E9) with 0xFF
    // (same as ZeroStatVars does at 0x03E923)
    mem.fill(0xff, 0xd01485, 0xd014ea);

    // Set statsValid flag
    mem[STAT_FLAGS_ADDR] |= STATS_VALID_BIT;

    // KEY FIX 1: set bit 2 of statFlags2 to skip ZeroStatVars
    mem[STAT_FLAGS2_ADDR] |= 0x04;
    console.log(`  statFlags2 (IY+26) = ${hex(mem[STAT_FLAGS2_ADDR], 2)} (bit 2 set to skip ZeroStatVars)`);

    mem.set(L1_OP1, OP1_ADDR);
    prepareCallState(cpu, mem);
    seedErrFrame(cpu, mem, ONEVAR_RET);
    mem[ERR_NO_ADDR] = 0x00;
    mem.set(L1_OP1, OP1_ADDR);

    // KEY FIX 3: Set A=1 to select single-list mode (no frequency list)
    // At 0x0A9343: pop af → ld b, a → B = original A
    // At 0x0A93D7: cp 0x01 → if B=1, take the single-list path (0x0A93F1)
    cpu.a = 0x01;

    // KEY FIX 2: Push L1 OP1 onto FP stack
    // OneVar at 0x0A9273 → 0x0AA697 calls Mov9ToOP1 (0x082961) which
    // pops 9 bytes from FP stack. The L1 list name must be on the stack.
    {
      const fpsPtr = read24(mem, FPS_ADDR);
      mem.set(L1_OP1, fpsPtr);
      write24(mem, FPS_ADDR, fpsPtr + 9);
      console.log(`  FPS: pushed L1 OP1 at ${hex(fpsPtr)}, FPS now ${hex(fpsPtr + 9)}`);
      console.log(`  List data at ${hex(LIST_DATA_ADDR)} (separate from FPS at ${hex(FPS_BASE)})`);
    }

    console.log(`  Running OneVar with OP1 instrumentation...`);

    // Custom instrumented run to dump OP1 at key PCs
    const WATCH_PCS = new Set([
      0x0A9325, // Entry
      0x0AA697, // Before PushRealO1
      0x0AA6A3, // After ZeroStatVars check, before PopRealO1
      0x0A9277, // After PopRealO1
      0x0A9231, // Before ChkFindSym
      0x0A9235, // After ChkFindSym, before Mov9B
      0x0A928B, // Before PopRealO1 #2
      0x0A928F, // Before type check (the failing point)
      0x07F7BD, // Type check function
      0x0A9293, // After type check
    ]);

    let ov2FinalPc = null;
    let ov2RetHit = false;
    let ov2ErrCaught = false;
    let ov2StepCount = 0;
    const ov2RecentPcs = [];
    const ov2AllPcs = [];
    const ov2Missing = new Map();

    try {
      executor.runFrom(ONEVAR_ENTRY, 'adl', {
        maxSteps: 500000,
        maxLoopIterations: MAX_LOOP_ITER,
        onBlock(pc, _m, _meta, step) {
          const norm = pc & 0xffffff;
          ov2FinalPc = norm;
          if (typeof step === 'number') ov2StepCount = Math.max(ov2StepCount, step + 1);
          ov2RecentPcs.push(norm);
          if (ov2RecentPcs.length > 128) ov2RecentPcs.shift();
          if (ov2AllPcs.length < 500) ov2AllPcs.push(norm);
          if (WATCH_PCS.has(norm)) {
            const fpsVal = read24(mem, FPS_ADDR);
            console.log(`    @${hex(norm)}: OP1=[${hexBytes(mem, OP1_ADDR, 9)}] FPS=${hex(fpsVal)} A=${hex(cpu.a & 0xff, 2)}`);
          }
          if (norm === ONEVAR_RET) throw new Error('__RET__');
          if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
        },
        onMissingBlock(pc, _m, step) {
          const norm = pc & 0xffffff;
          ov2FinalPc = norm;
          if (typeof step === 'number') ov2StepCount = Math.max(ov2StepCount, step + 1);
          ov2RecentPcs.push(norm);
          if (ov2RecentPcs.length > 128) ov2RecentPcs.shift();
          if (ov2AllPcs.length < 500) ov2AllPcs.push(norm);
          ov2Missing.set(norm, (ov2Missing.get(norm) || 0) + 1);
          if (norm === ONEVAR_RET) throw new Error('__RET__');
          if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
        },
      });
    } catch (e) {
      if (e?.message === '__RET__') { ov2RetHit = true; ov2FinalPc = ONEVAR_RET; }
      else if (e?.message === '__ERR__') { ov2ErrCaught = true; ov2FinalPc = ERR_CATCH_ADDR; }
      else throw e;
    }

    const ov2 = {
      returnHit: ov2RetHit, errCaught: ov2ErrCaught, finalPc: ov2FinalPc,
      stepCount: ov2StepCount, recentPcs: ov2RecentPcs, allPcs: ov2AllPcs,
      missingBlocks: ov2Missing,
      a: cpu.a & 0xff, f: cpu.f & 0xff,
      hl: cpu.hl & 0xffffff, de: cpu.de & 0xffffff,
      sp: cpu.sp & 0xffffff,
      errNo: mem[ERR_NO_ADDR] & 0xff,
    };

    console.log(`  OneVar: ${outcome(ov2)}`);
    console.log(`  Steps: ${ov2.stepCount}, errNo: ${hex(ov2.errNo, 2)} (${errName(ov2.errNo)})`);
    console.log(`  DE=${hex(ov2.de)} HL=${hex(ov2.hl)} SP=${hex(ov2.sp)}`);

    if (ov2.missingBlocks.size > 0) {
      const filt = [...ov2.missingBlocks.entries()].filter(([a]) => a !== ONEVAR_RET && a !== ERR_CATCH_ADDR);
      if (filt.length > 0) {
        console.log(`  Missing blocks: ${filt.map(([a, c]) => `${hex(a)}(${c}x)`).join(', ')}`);
      }
    }

    const last20b = ov2.recentPcs.slice(-20);
    console.log(`  Last 20 PCs: ${last20b.map(p => hex(p)).join(' ')}`);
    console.log(`  OP1 after: [${hexBytes(mem, OP1_ADDR, 9)}]`);
    if (ov2.allPcs.length > 0 && ov2.allPcs.length < 200) {
      console.log(`  Full trace (${ov2.allPcs.length} blocks):`);
      console.log(`    ${ov2.allPcs.map(p => hex(p)).join(' ')}`);
    }
    console.log('');

    // Read stat vars — dump all slots from 0x00 to 0x0A
    console.log('--- Stat variable slots (full dump, tokens 0x00 to 0x22) ---');
    const allSlots = [
      { name: 'slot00',  token: 0x00 },
      { name: 'slot01',  token: 0x01 },
      { name: 'n',       token: 0x02 },  // tStatN
      { name: 'xMean',   token: 0x03 },  // tXMean
      { name: 'sumX',    token: 0x04 },  // tSumX
      { name: 'sumX2',   token: 0x05 },  // tSumXSqr
      { name: 'Sx',      token: 0x06 },  // tStdX
      { name: 'sigmaX',  token: 0x07 },  // tStdPX
      { name: 'minX',    token: 0x08 },  // tMinX
      { name: 'maxX',    token: 0x09 },  // tMaxX
      { name: 'minY',    token: 0x0A },
      { name: 'maxY',    token: 0x0B },
      { name: 'yMean',   token: 0x0C },
      { name: 'sumY',    token: 0x0D },
      { name: 'sumYSqr', token: 0x0E },
      { name: 'stdY',    token: 0x0F },
      { name: 'stdPY',   token: 0x10 },
      { name: 'sumXY',   token: 0x11 },
      { name: 'corr',    token: 0x12 },
      { name: 'medX',    token: 0x13 },
      { name: 'Q1',      token: 0x14 },
      { name: 'Q3',      token: 0x15 },
      { name: 'slot16',  token: 0x16 },
      { name: 'slot17',  token: 0x17 },
      { name: 'slot18',  token: 0x18 },
      { name: 'slot19',  token: 0x19 },
      { name: 'slot1A',  token: 0x1A },
      { name: 'slot1B',  token: 0x1B },
      { name: 'slot1C',  token: 0x1C },
      { name: 'slot1D',  token: 0x1D },
      { name: 'slot1E',  token: 0x1E },
      { name: 'slot1F',  token: 0x1F },
      { name: 'slot20',  token: 0x20 },
      { name: 'meanX2',  token: 0x21 },  // tMean (old location)
      { name: 'slot22',  token: 0x22 },
    ];

    let matchCount2 = 0;
    for (const s of allSlots) {
      const slotAddr = STAT_VARS_BASE + s.token * 9;
      const val = safeReadReal(mem, slotAddr);
      const isZero = (typeof val === 'number' && val === 0) ||
                     (mem[slotAddr] === 0x0e && mem[slotAddr+1] === 0x80);
      if (isZero) continue; // skip zero/unwritten slots
      const exp = EXPECTED[s.token];
      let tag = '';
      if (exp !== null && typeof val === 'number' && Math.abs(val - exp) < 0.1) {
        tag = ' MATCH';
        matchCount2++;
      }
      console.log(`  ${s.name.padEnd(8)} token=${hex(s.token, 2)} slot=${hex(slotAddr)}  val=${val}${tag}  bytes=[${hexBytes(mem, slotAddr, 9)}]`);
    }
    console.log(`  Matches: ${matchCount2}/${Object.keys(EXPECTED).length}`);
    console.log('');

    // If still stalled, try 1M steps
    if (!ov2.returnHit && !ov2.errCaught && ov2.errNo === 0x00) {
      console.log('--- OneVar still running, extending to 1M steps ---');

      if (!runMemInit(executor, cpu, mem)) {
        console.log('ABORT'); process.exitCode = 1; return;
      }

      const FPS_BASE2 = USERMEM_ADDR;
      const LIST_DATA_ADDR2 = USERMEM_ADDR + 0x100;
      write24(mem, FPSBASE_ADDR, FPS_BASE2);
      write24(mem, FPS_ADDR, FPS_BASE2);

      write16(mem, LIST_DATA_ADDR2, LIST_ELEM_COUNT);
      for (let i = 0; i < BCD_VALUES.length; i++) {
        mem.set(BCD_VALUES[i], LIST_DATA_ADDR2 + 2 + i * 9);
      }
      write24(mem, NEWDATA_PTR_ADDR, LIST_DATA_ADDR2 + LIST_DATA_SIZE);

      const pp5 = read24(mem, PROGPTR_ADDR);
      const pp5new = writeVATEntry(mem, pp5, 0x01, LIST_DATA_ADDR2, 0x01);
      write24(mem, OPS_ADDR, pp5new);

      for (let t = 0; t < 64; t++) {
        const addr = STAT_VARS_BASE + t * 9;
        mem[addr] = 0x0e;
        mem[addr + 1] = 0x80;
        for (let j = 2; j < 9; j++) mem[addr + j] = 0x00;
      }
      mem.fill(0xff, 0xd01485, 0xd014ea);
      mem[STAT_FLAGS_ADDR] |= STATS_VALID_BIT;
      mem[STAT_FLAGS2_ADDR] |= 0x04;

      mem.set(L1_OP1, OP1_ADDR);
      prepareCallState(cpu, mem);
      seedErrFrame(cpu, mem, ONEVAR_RET);
      mem[ERR_NO_ADDR] = 0x00;
      mem.set(L1_OP1, OP1_ADDR);

      // Push L1 OP1 to FP stack
      {
        const fp = read24(mem, FPS_ADDR);
        mem.set(L1_OP1, fp);
        write24(mem, FPS_ADDR, fp + 9);
      }

      console.log(`  Running OneVar (budget=1000000)...`);

      const ov3 = runCall(executor, cpu, mem, {
        entry: ONEVAR_ENTRY, budget: 1000000, returnPc: ONEVAR_RET,
      });

      console.log(`  OneVar: ${outcome(ov3)}`);
      console.log(`  Steps: ${ov3.stepCount}, errNo: ${hex(ov3.errNo, 2)} (${errName(ov3.errNo)})`);
      console.log(`  DE=${hex(ov3.de)} HL=${hex(ov3.hl)} SP=${hex(ov3.sp)}`);

      if (ov3.missingBlocks.size > 0) {
        const filt = [...ov3.missingBlocks.entries()].filter(([a]) => a !== ONEVAR_RET && a !== ERR_CATCH_ADDR);
        if (filt.length > 0) {
          console.log(`  Missing blocks: ${filt.map(([a, c]) => `${hex(a)}(${c}x)`).join(', ')}`);
        }
      }

      const last20c = ov3.recentPcs.slice(-20);
      console.log(`  Last 20 PCs: ${last20c.map(p => hex(p)).join(' ')}`);
      console.log('');

      console.log('--- Stat variable results (1M steps) ---');
      let matchCount3 = 0;
      for (const s of STAT_TOKENS) {
        const slotAddr = STAT_VARS_BASE + s.token * 9;
        const val = safeReadReal(mem, slotAddr);
        const exp = EXPECTED[s.token];
        let tag = '';
        if (exp !== null && typeof val === 'number' && Math.abs(val - exp) < 0.01) {
          tag = ' MATCH';
          matchCount3++;
        } else if (typeof val === 'number' && val !== 0) {
          tag = ' (non-zero)';
        }
        console.log(`  ${s.name.padEnd(8)} slot=${hex(slotAddr)}  val=${val}${tag}  bytes=[${hexBytes(mem, slotAddr, 9)}]`);
      }
      console.log(`  Matches: ${matchCount3}/${STAT_TOKENS.length}`);
      console.log('');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('='.repeat(72));
  console.log('  SUMMARY');
  console.log('='.repeat(72));
  console.log('');
  console.log('  Stat variable address map:');
  for (const s of STAT_TOKENS) {
    console.log(`    ${s.name.padEnd(8)} token=0x${s.token.toString(16).padStart(2, '0')}  slot=${hex(STAT_VARS_BASE + s.token * 9)}`);
  }
  console.log('');
  console.log(`  Part 3 (100K, RAM-only pre-seed): ${outcome(ov1)}`);
  console.log(`    errNo=${hex(ov1.errNo, 2)} (${errName(ov1.errNo)}), steps=${ov1.stepCount}, matches=${matchCount1}`);
  console.log('');
  console.log('=== Phase 140 probe complete ===');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
