#!/usr/bin/env node

/**
 * Phase 144 — OneVar Full-Entry Divergence Trace
 *
 * Three scenarios to find exactly WHY full entry (0x0A9319) hits E_JError
 * while partial entry (0x0A9325) works:
 *
 *   Scenario A: Partial entry 0x0A9325 (working path) — 100 steps, full PC+reg trace
 *   Scenario B: Full entry 0x0A9319 (failing path) — 100 steps, full PC+reg trace
 *   Scenario C: Full entry 0x0A9319, but manually SET bit 5 of 0xD00089 after RES
 *
 * Also disassembles ROM bytes around the entry, error site, and min/max range.
 *
 * List: L1 = [10, 20, 30, 40, 50]
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

// ── Constants ─────────────────────────────────────────────────────────────

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_ENTRY = 0x09dee0;
const MEMINIT_RET = 0x7ffff6;

const ONEVAR_FULL_ENTRY = 0x0a9319;   // full entry — RES 5,(IY+9)
const ONEVAR_PARTIAL_ENTRY = 0x0a9325; // partial entry — SET 5,(IY+9)
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
const STAT_FLAGS_ADDR = 0xd00089;   // IY+9
const STATS_VALID_BIT = 0x40;
const STAT_FLAGS2_ADDR = 0xd0009a;  // IY+26
const STAT_MODE_ADDR = 0xd01190;

const ERR_CATCH_ADDR = 0x7ffffa;
const MAX_LOOP_ITER = 8192;

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

// ── Stat variable definitions ─────────────────────────────────────────────

const STAT_TOKENS = [
  { name: 'n',      token: 0x02, addr: 0xd01191, expected: 5.0,    tol: 0.01 },
  { name: 'xMean',  token: 0x03, addr: 0xd0119a, expected: 30.0,   tol: 0.01 },
  { name: 'sumX',   token: 0x04, addr: 0xd011a3, expected: 150.0,  tol: 0.01 },
  { name: 'sumX2',  token: 0x05, addr: 0xd011ac, expected: 5500.0, tol: 0.01 },
  { name: 'Sx',     token: 0x06, addr: 0xd011b5, expected: 15.81,  tol: 0.01 },
  { name: 'sigmaX', token: 0x07, addr: 0xd011be, expected: 14.14,  tol: 0.01 },
  { name: 'minX',   token: 0x08, addr: 0xd011c7, expected: 10.0,   tol: 0.01 },
  { name: 'maxX',   token: 0x09, addr: 0xd011d0, expected: 50.0,   tol: 0.01 },
];

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

// ── Runtime setup ─────────────────────────────────────────────────────────

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

// ── Scenario runner ──────────────────────────────────────────────────────

/**
 * Sets up a clean OneVar environment from the post-coldboot state.
 * Returns { mem, executor, cpu } ready for a OneVar run.
 *
 * baseState = { mem, executor, cpu } from after coldBoot
 * We re-create fresh runtime each time to avoid cross-contamination.
 */
function setupOneVarEnvironment() {
  const { mem, executor, cpu } = createRuntime();
  coldBoot(executor, cpu, mem);

  if (!runMemInit(executor, cpu, mem)) {
    throw new Error('MEM_INIT failed');
  }

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

  // Pre-seed stat var RAM
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

  // Zero stat mode byte
  mem[STAT_MODE_ADDR] = 0x00;

  // OP1 = L1
  mem.set(L1_OP1, OP1_ADDR);
  prepareCallState(cpu, mem);
  seedErrFrame(cpu, mem, ONEVAR_RET);
  mem[ERR_NO_ADDR] = 0x00;
  mem.set(L1_OP1, OP1_ADDR);

  // A=1 for single-list mode
  cpu.a = 0x01;

  // Push L1 OP1 onto FP stack
  const fpsPtr = read24(mem, FPS_ADDR);
  mem.set(L1_OP1, fpsPtr);
  write24(mem, FPS_ADDR, fpsPtr + 9);

  return { mem, executor, cpu };
}

function runScenario(label, entryPoint, opts = {}) {
  console.log('');
  console.log('='.repeat(72));
  console.log(`  SCENARIO ${label}`);
  console.log('='.repeat(72));
  console.log('');

  const { mem, executor, cpu } = setupOneVarEnvironment();

  // Apply any pre-run patches
  if (opts.preRun) opts.preRun(mem, cpu);

  const statFlagsBefore = mem[STAT_FLAGS_ADDR] & 0xff;
  console.log(`  Entry: ${hex(entryPoint)}`);
  console.log(`  Stat flags (0xD00089) before: ${hex(statFlagsBefore, 2)} = ${statFlagsBefore.toString(2).padStart(8, '0')}b`);
  console.log(`    bit 5 = ${(statFlagsBefore >> 5) & 1}`);
  console.log('');

  // Step-by-step trace
  const TRACE_STEPS = 60;
  const BUDGET = 200000;
  const pcTrace = [];          // { step, pc, a, f, hl, sp, errNo }
  const allPcHits = new Map();
  const missingBlocks = new Map();
  let stepCount = 0;
  let finalPc = null;
  let returnHit = false;
  let errCaught = false;
  let errSnapshot = null;

  // Watch for the RES/SET instruction effect
  let bit5AfterStep1 = null;

  function trackPC(norm, step) {
    allPcHits.set(norm, (allPcHits.get(norm) || 0) + 1);
    finalPc = norm;
    if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);

    // Capture detailed trace for first TRACE_STEPS
    if (stepCount <= TRACE_STEPS) {
      pcTrace.push({
        step: stepCount,
        pc: norm,
        a: cpu.a & 0xff,
        f: cpu.f & 0xff,
        hl: (cpu._hl ?? 0) & 0xffffff,
        bc: (cpu._bc ?? 0) & 0xffffff,
        de: (cpu._de ?? 0) & 0xffffff,
        sp: cpu.sp & 0xffffff,
        iy9: mem[STAT_FLAGS_ADDR] & 0xff,
        errNo: mem[ERR_NO_ADDR] & 0xff,
      });
    }

    // Capture bit 5 after step 1
    if (stepCount === 2 && bit5AfterStep1 === null) {
      bit5AfterStep1 = mem[STAT_FLAGS_ADDR] & 0xff;
    }

    // Error snapshot
    if (!errSnapshot) {
      const currentErr = mem[ERR_NO_ADDR] & 0xff;
      if (currentErr !== 0x00) {
        errSnapshot = {
          pc: norm,
          step: stepCount,
          errNo: currentErr,
          a: cpu.a & 0xff,
          f: cpu.f & 0xff,
          hl: (cpu._hl ?? 0) & 0xffffff,
          sp: cpu.sp & 0xffffff,
        };
      }
    }
  }

  try {
    executor.runFrom(entryPoint, 'adl', {
      maxSteps: BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _m, _meta, step) {
        const norm = pc & 0xffffff;
        trackPC(norm, step);
        if (norm === ONEVAR_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, _m, step) {
        const norm = pc & 0xffffff;
        trackPC(norm, step);
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

  const errNo = mem[ERR_NO_ADDR] & 0xff;

  // Print step-by-step trace
  console.log(`  --- Step-by-step trace (first ${TRACE_STEPS} steps) ---`);
  console.log('  Step  PC        A     F         HL        BC        DE        SP        IY+9      errNo');
  for (const t of pcTrace) {
    const fBits = t.f.toString(2).padStart(8, '0');
    console.log(
      `  ${String(t.step).padStart(4)}  ${hex(t.pc)}  ${hex(t.a, 2)}  ${fBits}  ${hex(t.hl)}  ${hex(t.bc)}  ${hex(t.de)}  ${hex(t.sp)}  ${hex(t.iy9, 2)}  ${hex(t.errNo, 2)}`
    );
  }
  console.log('');

  // Bit 5 after first instruction
  if (bit5AfterStep1 !== null) {
    console.log(`  IY+9 (0xD00089) after step 1: ${hex(bit5AfterStep1, 2)} = ${bit5AfterStep1.toString(2).padStart(8, '0')}b`);
    console.log(`    bit 5 = ${(bit5AfterStep1 >> 5) & 1}`);
    console.log('');
  }

  // Error snapshot
  if (errSnapshot) {
    console.log(`  ERROR SNAPSHOT:`);
    console.log(`    errNo: ${hex(errSnapshot.errNo, 2)} (${errName(errSnapshot.errNo)})`);
    console.log(`    At PC: ${hex(errSnapshot.pc)}, step: ${errSnapshot.step}`);
    console.log(`    A=${hex(errSnapshot.a, 2)} F=${errSnapshot.f.toString(2).padStart(8, '0')} HL=${hex(errSnapshot.hl)} SP=${hex(errSnapshot.sp)}`);
    console.log('');
  }

  // Summary
  const outcomeStr = returnHit
    ? 'returned OK'
    : errCaught
      ? `error caught (errNo=${hex(errNo, 2)} ${errName(errNo)})`
      : `stalled (finalPc=${hex(finalPc)})`;

  console.log(`  Outcome: ${outcomeStr}`);
  console.log(`  Steps: ${stepCount} / ${BUDGET}`);
  console.log(`  Unique PCs: ${allPcHits.size}`);
  console.log(`  Missing blocks: ${missingBlocks.size}`);
  console.log('');

  // PCs in min/max range
  const minMaxPCs = [...allPcHits.entries()]
    .filter(([a]) => a >= 0x0aa690 && a <= 0x0aa710)
    .sort((a, b) => a[0] - b[0]);

  if (minMaxPCs.length > 0) {
    console.log(`  PCs hit in min/max range (0x0AA690-0x0AA710):`);
    for (const [addr, count] of minMaxPCs) {
      console.log(`    ${hex(addr)}  ${count}x`);
    }
    console.log('');
  } else {
    console.log(`  (no PCs hit in min/max range 0x0AA690-0x0AA710)`);
    console.log('');
  }

  // Stat results
  console.log(`  Stat results:`);
  let passCount = 0;
  for (const s of STAT_TOKENS) {
    const slotAddr = STAT_VARS_BASE + s.token * 9;
    const val = safeReadReal(mem, slotAddr);
    let pass = false;
    if (typeof val === 'number' && Math.abs(val - s.expected) <= s.tol) {
      pass = true;
      passCount++;
    }
    const tag = pass ? 'PASS' : 'FAIL';
    console.log(`    ${tag}  ${s.name.padEnd(8)} = ${val}  (expected ${s.expected})`);
  }
  console.log(`  Score: ${passCount}/8`);

  return { pcTrace, allPcHits, errNo, returnHit, errCaught, stepCount };
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 144: OneVar Full-Entry Divergence Trace ===');

  // ═══════════════════════════════════════════════════════════════════════════
  // Part 1: ROM disassembly of key regions
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('');
  console.log('='.repeat(72));
  console.log('  ROM BYTES: 0x0A9319-0x0A9360 (entry region)');
  console.log('='.repeat(72));
  console.log('');

  for (let addr = 0x0a9319; addr < 0x0a9360; addr += 16) {
    const end = Math.min(addr + 16, 0x0a9360);
    const bytes = [];
    for (let i = addr; i < end; i++) bytes.push((romBytes[i] & 0xff).toString(16).toUpperCase().padStart(2, '0'));
    console.log(`  ${hex(addr)}: ${bytes.join(' ')}`);
  }

  console.log('');
  console.log('='.repeat(72));
  console.log('  ROM BYTES: 0x0AA690-0x0AA710 (sort/min-max region around 0x0AA6FA)');
  console.log('='.repeat(72));
  console.log('');

  for (let addr = 0x0aa690; addr < 0x0aa710; addr += 16) {
    const end = Math.min(addr + 16, 0x0aa710);
    const bytes = [];
    for (let i = addr; i < end; i++) bytes.push((romBytes[i] & 0xff).toString(16).toUpperCase().padStart(2, '0'));
    console.log(`  ${hex(addr)}: ${bytes.join(' ')}`);
  }

  console.log('');
  console.log('='.repeat(72));
  console.log('  ROM BYTES: 0x03E1A0-0x03E1D0 (JError call site region)');
  console.log('='.repeat(72));
  console.log('');

  for (let addr = 0x03e1a0; addr < 0x03e1d0; addr += 16) {
    const end = Math.min(addr + 16, 0x03e1d0);
    const bytes = [];
    for (let i = addr; i < end; i++) bytes.push((romBytes[i] & 0xff).toString(16).toUpperCase().padStart(2, '0'));
    console.log(`  ${hex(addr)}: ${bytes.join(' ')}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Part 2: Run all three scenarios
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('');
  console.log('Running Scenario A: Partial entry 0x0A9325 (working path)...');
  const resultA = runScenario('A — Partial entry (0x0A9325, SET 5)', ONEVAR_PARTIAL_ENTRY);

  console.log('');
  console.log('Running Scenario B: Full entry 0x0A9319 (failing path)...');
  const resultB = runScenario('B — Full entry (0x0A9319, RES 5)', ONEVAR_FULL_ENTRY);

  console.log('');
  console.log('Running Scenario C: Full entry + manual SET bit 5 after RES...');
  const resultC = runScenario('C — Full entry + manual SET bit 5', ONEVAR_FULL_ENTRY, {
    preRun(mem, _cpu) {
      // The RES 5,(IY+9) at 0x0A9319 will clear bit 5 of 0xD00089.
      // We can't intercept AFTER it runs but BEFORE the next instruction in this model.
      // Instead, we pre-SET bit 5 so that even after RES clears it, we check if
      // something ELSE reads it differently.
      // Actually: let's just SET it directly — the entry will RES it, but we'll
      // hook onBlock to re-SET it after the first block.
    },
  });

  // Also run a Scenario C2 where we directly set bit 5 before entry
  // and also patch it in onBlock at step 2
  console.log('');
  console.log('Running Scenario C2: Full entry, but onBlock patches bit 5 back to 1 at step 2...');

  {
    console.log('');
    console.log('='.repeat(72));
    console.log('  SCENARIO C2 — Full entry + onBlock re-SET bit 5 after step 1');
    console.log('='.repeat(72));
    console.log('');

    const { mem, executor, cpu } = setupOneVarEnvironment();

    const TRACE_STEPS = 60;
    const BUDGET = 200000;
    const pcTrace = [];
    const allPcHits = new Map();
    const missingBlocks = new Map();
    let stepCount = 0;
    let finalPc = null;
    let returnHit = false;
    let errCaught = false;
    let errSnapshot = null;
    let patched = false;

    function trackPC(norm, step) {
      allPcHits.set(norm, (allPcHits.get(norm) || 0) + 1);
      finalPc = norm;
      if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);

      if (stepCount <= TRACE_STEPS) {
        pcTrace.push({
          step: stepCount,
          pc: norm,
          a: cpu.a & 0xff,
          f: cpu.f & 0xff,
          hl: (cpu._hl ?? 0) & 0xffffff,
          sp: cpu.sp & 0xffffff,
          iy9: mem[STAT_FLAGS_ADDR] & 0xff,
          errNo: mem[ERR_NO_ADDR] & 0xff,
        });
      }

      if (!errSnapshot) {
        const currentErr = mem[ERR_NO_ADDR] & 0xff;
        if (currentErr !== 0x00) {
          errSnapshot = { pc: norm, step: stepCount, errNo: currentErr };
        }
      }
    }

    try {
      executor.runFrom(ONEVAR_FULL_ENTRY, 'adl', {
        maxSteps: BUDGET,
        maxLoopIterations: MAX_LOOP_ITER,
        onBlock(pc, _m, _meta, step) {
          const norm = pc & 0xffffff;

          // After the first block (which does RES 5), re-SET bit 5
          if (!patched && stepCount >= 1) {
            mem[STAT_FLAGS_ADDR] |= 0x20; // SET bit 5
            patched = true;
            console.log(`  [C2] Patched bit 5 back to 1 at step ${stepCount}, PC=${hex(norm)}`);
          }

          trackPC(norm, step);
          if (norm === ONEVAR_RET) throw new Error('__RET__');
          if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
        },
        onMissingBlock(pc, _m, step) {
          const norm = pc & 0xffffff;
          trackPC(norm, step);
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

    const errNo = mem[ERR_NO_ADDR] & 0xff;

    // Print first 60 steps
    console.log(`  --- Step-by-step trace (first ${TRACE_STEPS} steps) ---`);
    console.log('  Step  PC        A     F         HL        SP        IY+9      errNo');
    for (const t of pcTrace) {
      const fBits = t.f.toString(2).padStart(8, '0');
      console.log(
        `  ${String(t.step).padStart(4)}  ${hex(t.pc)}  ${hex(t.a, 2)}  ${fBits}  ${hex(t.hl)}  ${hex(t.sp)}  ${hex(t.iy9, 2)}  ${hex(t.errNo, 2)}`
      );
    }
    console.log('');

    if (errSnapshot) {
      console.log(`  ERROR SNAPSHOT:`);
      console.log(`    errNo: ${hex(errSnapshot.errNo, 2)} (${errName(errSnapshot.errNo)})`);
      console.log(`    At PC: ${hex(errSnapshot.pc)}, step: ${errSnapshot.step}`);
      console.log('');
    }

    const outcomeStr = returnHit
      ? 'returned OK'
      : errCaught
        ? `error caught (errNo=${hex(errNo, 2)} ${errName(errNo)})`
        : `stalled (finalPc=${hex(finalPc)})`;

    console.log(`  Outcome: ${outcomeStr}`);
    console.log(`  Steps: ${stepCount} / ${BUDGET}`);
    console.log(`  Unique PCs: ${allPcHits.size}`);
    console.log('');

    // Stat results
    console.log(`  Stat results:`);
    let passCount = 0;
    for (const s of STAT_TOKENS) {
      const slotAddr = STAT_VARS_BASE + s.token * 9;
      const val = safeReadReal(mem, slotAddr);
      let pass = false;
      if (typeof val === 'number' && Math.abs(val - s.expected) <= s.tol) {
        pass = true;
        passCount++;
      }
      const tag = pass ? 'PASS' : 'FAIL';
      console.log(`    ${tag}  ${s.name.padEnd(8)} = ${val}  (expected ${s.expected})`);
    }
    console.log(`  Score: ${passCount}/8`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Part 3: Side-by-side divergence analysis
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('');
  console.log('='.repeat(72));
  console.log('  DIVERGENCE ANALYSIS: Scenario A vs Scenario B');
  console.log('='.repeat(72));
  console.log('');

  const traceA = resultA.pcTrace;
  const traceB = resultB.pcTrace;
  const maxLen = Math.max(traceA.length, traceB.length);

  let firstDivergence = -1;
  for (let i = 0; i < maxLen; i++) {
    const a = traceA[i];
    const b = traceB[i];
    if (!a || !b || a.pc !== b.pc) {
      firstDivergence = i;
      break;
    }
  }

  if (firstDivergence === -1) {
    console.log('  No divergence found in the first 60 steps — PCs are identical!');
    console.log('  (Divergence must happen later)');
  } else {
    console.log(`  FIRST DIVERGENCE at step index ${firstDivergence}:`);
    const a = traceA[firstDivergence];
    const b = traceB[firstDivergence];
    if (a) console.log(`    A: step=${a.step} PC=${hex(a.pc)} A=${hex(a.a, 2)} F=${a.f.toString(2).padStart(8, '0')} HL=${hex(a.hl)} IY+9=${hex(a.iy9, 2)} errNo=${hex(a.errNo, 2)}`);
    else   console.log(`    A: (no more steps)`);
    if (b) console.log(`    B: step=${b.step} PC=${hex(b.pc)} A=${hex(b.a, 2)} F=${b.f.toString(2).padStart(8, '0')} HL=${hex(b.hl)} IY+9=${hex(b.iy9, 2)} errNo=${hex(b.errNo, 2)}`);
    else   console.log(`    B: (no more steps)`);
    console.log('');

    // Show context: 3 steps before and after
    const start = Math.max(0, firstDivergence - 3);
    const end = Math.min(maxLen, firstDivergence + 4);
    console.log('  Context (3 steps before/after):');
    console.log('  Step  A_PC       A_IY9   B_PC       B_IY9   Match?');
    for (let i = start; i < end; i++) {
      const a = traceA[i];
      const b = traceB[i];
      const aPC = a ? hex(a.pc) : '------';
      const bPC = b ? hex(b.pc) : '------';
      const aIY9 = a ? hex(a.iy9, 2) : '--';
      const bIY9 = b ? hex(b.iy9, 2) : '--';
      const match = a && b && a.pc === b.pc ? 'YES' : 'NO <<<';
      const marker = i === firstDivergence ? ' *** DIVERGE ***' : '';
      console.log(`  ${String(i).padStart(4)}  ${aPC}  ${aIY9}    ${bPC}  ${bIY9}    ${match}${marker}`);
    }
  }

  console.log('');
  console.log('=== Phase 144 probe complete ===');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
