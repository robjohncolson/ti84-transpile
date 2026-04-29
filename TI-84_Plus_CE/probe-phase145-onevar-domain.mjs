#!/usr/bin/env node

/**
 * Phase 145 — OneVar Full Entry: Trace E_Domain at step ~1521 in Scenario C2
 *
 * Part A: Trace E_Domain in Scenario C2 (full entry + re-SET bit 5 via onBlock)
 *         Snapshot EVERY block for steps 1500-1525: PC, A, OP1, OP2, errNo
 *         Find the exact PC where E_Domain (0x84) is raised.
 *
 * Part B: Same as Part A but also set B=0x00 at the intercept point
 *         (since full entry skips LD B,0x00 at 0x0A9329).
 *         Compare: does B=0 change the outcome?
 *
 * Part C: Run partial entry (0x0A9325), check if L1 list data survives
 *         after OneVar completes (enabling JS-side min/max as pragmatic fix).
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

const ONEVAR_FULL_ENTRY = 0x0a9319;   // RES 5,(IY+9)
const ONEVAR_PARTIAL_ENTRY = 0x0a9325; // SET 5,(IY+9)
const ONEVAR_RET = 0x7fffee;

const OP1_ADDR = 0xd005f8;
const OP2_ADDR = 0xd00603;
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

// ── OneVar environment setup ─────────────────────────────────────────────

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

  // L1 data: 2-byte element count + 5 * 9-byte BCD values
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

  return { mem, executor, cpu, LIST_DATA_ADDR };
}

// ── Part A: Trace E_Domain in Scenario C2 ────────────────────────────────

function runPartA() {
  console.log('');
  console.log('='.repeat(72));
  console.log('  PART A: Trace E_Domain in Scenario C2');
  console.log('  Full entry (0x0A9319) + re-SET bit 5 via onBlock');
  console.log('='.repeat(72));
  console.log('');

  const { mem, executor, cpu } = setupOneVarEnvironment();

  const BUDGET = 200000;
  const SNAPSHOT_START = 1500;
  const SNAPSHOT_END = 1525;
  const snapshots = [];
  const allPcHits = new Map();
  const missingBlocks = new Map();
  let stepCount = 0;
  let finalPc = null;
  let returnHit = false;
  let errCaught = false;
  let patched = false;
  let errFirstSeen = null;

  // Track call/return trail around the error
  const callTrail = [];  // last 30 CALL/RET-like transitions

  try {
    executor.runFrom(ONEVAR_FULL_ENTRY, 'adl', {
      maxSteps: BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _m, _meta, step) {
        const norm = pc & 0xffffff;
        allPcHits.set(norm, (allPcHits.get(norm) || 0) + 1);
        finalPc = norm;
        if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);

        // Re-SET bit 5 after first block (undo RES 5,(IY+9))
        if (!patched && stepCount >= 1) {
          mem[STAT_FLAGS_ADDR] |= 0x20;
          patched = true;
        }

        // Also set B=0 would be Part B — skip here

        // Snapshot range
        if (stepCount >= SNAPSHOT_START && stepCount <= SNAPSHOT_END) {
          const op1 = hexBytes(mem, OP1_ADDR, 9);
          const op2 = hexBytes(mem, OP2_ADDR, 9);
          const errNo = mem[ERR_NO_ADDR] & 0xff;
          snapshots.push({
            step: stepCount,
            pc: norm,
            a: cpu.a & 0xff,
            f: cpu.f & 0xff,
            b: cpu.b & 0xff,
            hl: (cpu._hl ?? 0) & 0xffffff,
            de: (cpu._de ?? 0) & 0xffffff,
            sp: cpu.sp & 0xffffff,
            op1,
            op2,
            errNo,
          });
        }

        // Track call trail (keep last 30)
        if (stepCount >= SNAPSHOT_START - 50 && stepCount <= SNAPSHOT_END + 5) {
          callTrail.push({ step: stepCount, pc: norm, sp: cpu.sp & 0xffffff });
          if (callTrail.length > 60) callTrail.shift();
        }

        // Detect first error
        if (!errFirstSeen) {
          const currentErr = mem[ERR_NO_ADDR] & 0xff;
          if (currentErr !== 0x00) {
            errFirstSeen = {
              step: stepCount,
              pc: norm,
              errNo: currentErr,
              a: cpu.a & 0xff,
              f: cpu.f & 0xff,
              b: cpu.b & 0xff,
              hl: (cpu._hl ?? 0) & 0xffffff,
              de: (cpu._de ?? 0) & 0xffffff,
              bc: (cpu._bc ?? 0) & 0xffffff,
              sp: cpu.sp & 0xffffff,
              op1: hexBytes(mem, OP1_ADDR, 9),
              op2: hexBytes(mem, OP2_ADDR, 9),
              iy9: mem[STAT_FLAGS_ADDR] & 0xff,
            };
          }
        }

        if (norm === ONEVAR_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, _m, step) {
        const norm = pc & 0xffffff;
        allPcHits.set(norm, (allPcHits.get(norm) || 0) + 1);
        finalPc = norm;
        missingBlocks.set(norm, (missingBlocks.get(norm) || 0) + 1);
        if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);

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

  // Print snapshots
  console.log(`  --- Snapshots for steps ${SNAPSHOT_START}-${SNAPSHOT_END} ---`);
  console.log('  Step  PC        A     B     F         HL        DE        SP        errNo  OP1                            OP2');
  for (const s of snapshots) {
    const fBits = s.f.toString(2).padStart(8, '0');
    console.log(
      `  ${String(s.step).padStart(4)}  ${hex(s.pc)}  ${hex(s.a, 2)}  ${hex(s.b, 2)}  ${fBits}  ${hex(s.hl)}  ${hex(s.de)}  ${hex(s.sp)}  ${hex(s.errNo, 2)}   ${s.op1}  ${s.op2}`
    );
  }
  console.log('');

  // Call trail around error
  if (callTrail.length > 0) {
    console.log('  --- Call trail (steps near error) ---');
    console.log('  Step  PC        SP');
    for (const t of callTrail) {
      const marker = (errFirstSeen && t.step === errFirstSeen.step) ? ' <<< ERROR FIRST SEEN' : '';
      console.log(`  ${String(t.step).padStart(4)}  ${hex(t.pc)}  ${hex(t.sp)}${marker}`);
    }
    console.log('');
  }

  // Error details
  if (errFirstSeen) {
    console.log('  ERROR FIRST SEEN:');
    console.log(`    errNo: ${hex(errFirstSeen.errNo, 2)} (${errName(errFirstSeen.errNo)})`);
    console.log(`    At PC: ${hex(errFirstSeen.pc)}, step: ${errFirstSeen.step}`);
    console.log(`    A=${hex(errFirstSeen.a, 2)} B=${hex(errFirstSeen.b, 2)} F=${errFirstSeen.f.toString(2).padStart(8, '0')}`);
    console.log(`    HL=${hex(errFirstSeen.hl)} DE=${hex(errFirstSeen.de)} BC=${hex(errFirstSeen.bc)} SP=${hex(errFirstSeen.sp)}`);
    console.log(`    OP1: ${errFirstSeen.op1}`);
    console.log(`    OP2: ${errFirstSeen.op2}`);
    console.log(`    IY+9: ${hex(errFirstSeen.iy9, 2)} = ${errFirstSeen.iy9.toString(2).padStart(8, '0')}b`);
    console.log('');

    // Disassemble ROM bytes around error PC
    const errPC = errFirstSeen.pc;
    if (errPC < 0x400000) {
      console.log(`  ROM bytes around error PC ${hex(errPC)}:`);
      const start = Math.max(0, errPC - 16);
      const end = Math.min(0x400000, errPC + 32);
      for (let addr = start; addr < end; addr += 16) {
        const rowEnd = Math.min(addr + 16, end);
        const bytes = [];
        for (let i = addr; i < rowEnd; i++) bytes.push((romBytes[i] & 0xff).toString(16).toUpperCase().padStart(2, '0'));
        const marker = (addr <= errPC && errPC < addr + 16) ? ' <<<' : '';
        console.log(`    ${hex(addr)}: ${bytes.join(' ')}${marker}`);
      }
      console.log('');
    }
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
  if (missingBlocks.size > 0) {
    console.log('  Missing block PCs:');
    for (const [addr, count] of [...missingBlocks.entries()].sort((a, b) => a[0] - b[0])) {
      console.log(`    ${hex(addr)}  ${count}x`);
    }
  }
  console.log('');

  // Stat results
  console.log('  Stat results:');
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

  return { errFirstSeen, allPcHits, stepCount };
}

// ── Part B: Same as A but also set B=0 ───────────────────────────────────

function runPartB() {
  console.log('');
  console.log('='.repeat(72));
  console.log('  PART B: Scenario C2 + B=0x00 (testing LD B,0x00 skip effect)');
  console.log('='.repeat(72));
  console.log('');

  const { mem, executor, cpu } = setupOneVarEnvironment();

  const BUDGET = 200000;
  const SNAPSHOT_START = 1500;
  const SNAPSHOT_END = 1525;
  const snapshots = [];
  const allPcHits = new Map();
  let stepCount = 0;
  let finalPc = null;
  let returnHit = false;
  let errCaught = false;
  let patched = false;
  let errFirstSeen = null;

  try {
    executor.runFrom(ONEVAR_FULL_ENTRY, 'adl', {
      maxSteps: BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _m, _meta, step) {
        const norm = pc & 0xffffff;
        allPcHits.set(norm, (allPcHits.get(norm) || 0) + 1);
        finalPc = norm;
        if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);

        // Re-SET bit 5 AND set B=0 after first block
        if (!patched && stepCount >= 1) {
          mem[STAT_FLAGS_ADDR] |= 0x20;
          cpu.b = 0x00;
          patched = true;
          console.log(`  [B] Patched bit 5=1 AND B=0x00 at step ${stepCount}, PC=${hex(norm)}`);
        }

        // Snapshot range
        if (stepCount >= SNAPSHOT_START && stepCount <= SNAPSHOT_END) {
          snapshots.push({
            step: stepCount,
            pc: norm,
            a: cpu.a & 0xff,
            b: cpu.b & 0xff,
            f: cpu.f & 0xff,
            hl: (cpu._hl ?? 0) & 0xffffff,
            de: (cpu._de ?? 0) & 0xffffff,
            sp: cpu.sp & 0xffffff,
            op1: hexBytes(mem, OP1_ADDR, 9),
            op2: hexBytes(mem, OP2_ADDR, 9),
            errNo: mem[ERR_NO_ADDR] & 0xff,
          });
        }

        // Detect first error
        if (!errFirstSeen) {
          const currentErr = mem[ERR_NO_ADDR] & 0xff;
          if (currentErr !== 0x00) {
            errFirstSeen = {
              step: stepCount,
              pc: norm,
              errNo: currentErr,
              a: cpu.a & 0xff,
              b: cpu.b & 0xff,
              hl: (cpu._hl ?? 0) & 0xffffff,
              de: (cpu._de ?? 0) & 0xffffff,
              sp: cpu.sp & 0xffffff,
              op1: hexBytes(mem, OP1_ADDR, 9),
              op2: hexBytes(mem, OP2_ADDR, 9),
            };
          }
        }

        if (norm === ONEVAR_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, _m, step) {
        const norm = pc & 0xffffff;
        allPcHits.set(norm, (allPcHits.get(norm) || 0) + 1);
        finalPc = norm;
        if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
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

  // Print snapshots
  if (snapshots.length > 0) {
    console.log(`  --- Snapshots for steps ${SNAPSHOT_START}-${SNAPSHOT_END} ---`);
    console.log('  Step  PC        A     B     F         HL        DE        SP        errNo  OP1                            OP2');
    for (const s of snapshots) {
      const fBits = s.f.toString(2).padStart(8, '0');
      console.log(
        `  ${String(s.step).padStart(4)}  ${hex(s.pc)}  ${hex(s.a, 2)}  ${hex(s.b, 2)}  ${fBits}  ${hex(s.hl)}  ${hex(s.de)}  ${hex(s.sp)}  ${hex(s.errNo, 2)}   ${s.op1}  ${s.op2}`
      );
    }
    console.log('');
  }

  // Error details
  if (errFirstSeen) {
    console.log('  ERROR FIRST SEEN:');
    console.log(`    errNo: ${hex(errFirstSeen.errNo, 2)} (${errName(errFirstSeen.errNo)})`);
    console.log(`    At PC: ${hex(errFirstSeen.pc)}, step: ${errFirstSeen.step}`);
    console.log(`    A=${hex(errFirstSeen.a, 2)} B=${hex(errFirstSeen.b, 2)}`);
    console.log(`    HL=${hex(errFirstSeen.hl)} DE=${hex(errFirstSeen.de)} SP=${hex(errFirstSeen.sp)}`);
    console.log(`    OP1: ${errFirstSeen.op1}`);
    console.log(`    OP2: ${errFirstSeen.op2}`);
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
  console.log('  Stat results:');
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

  return { errFirstSeen, stepCount };
}

// ── Part C: Partial entry — check if list data survives ──────────────────

function runPartC() {
  console.log('');
  console.log('='.repeat(72));
  console.log('  PART C: Partial entry (0x0A9325) — list data survival check');
  console.log('='.repeat(72));
  console.log('');

  const { mem, executor, cpu, LIST_DATA_ADDR } = setupOneVarEnvironment();

  // Snapshot list data before OneVar
  const listDataBefore = new Uint8Array(LIST_DATA_SIZE);
  listDataBefore.set(mem.subarray(LIST_DATA_ADDR, LIST_DATA_ADDR + LIST_DATA_SIZE));

  console.log(`  List data address: ${hex(LIST_DATA_ADDR)}`);
  console.log(`  List data BEFORE OneVar: ${hexBytes(mem, LIST_DATA_ADDR, LIST_DATA_SIZE)}`);
  console.log('');

  // Read individual elements before
  console.log('  Elements before:');
  const elemCountBefore = mem[LIST_DATA_ADDR] | (mem[LIST_DATA_ADDR + 1] << 8);
  console.log(`    Element count: ${elemCountBefore}`);
  for (let i = 0; i < LIST_ELEM_COUNT; i++) {
    const addr = LIST_DATA_ADDR + 2 + i * 9;
    const val = safeReadReal(mem, addr);
    console.log(`    [${i}] at ${hex(addr)}: ${val}  (bytes: ${hexBytes(mem, addr, 9)})`);
  }
  console.log('');

  // Run partial entry
  const BUDGET = 200000;
  let stepCount = 0;
  let returnHit = false;
  let errCaught = false;
  let finalPc = null;

  try {
    executor.runFrom(ONEVAR_PARTIAL_ENTRY, 'adl', {
      maxSteps: BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _m, _meta, step) {
        const norm = pc & 0xffffff;
        finalPc = norm;
        if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
        if (norm === ONEVAR_RET) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, _m, step) {
        const norm = pc & 0xffffff;
        finalPc = norm;
        if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
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
  const outcomeStr = returnHit
    ? 'returned OK'
    : errCaught
      ? `error caught (errNo=${hex(errNo, 2)} ${errName(errNo)})`
      : `stalled (finalPc=${hex(finalPc)})`;

  console.log(`  Outcome: ${outcomeStr}`);
  console.log(`  Steps: ${stepCount}`);
  console.log(`  errNo: ${hex(errNo, 2)} (${errName(errNo)})`);
  console.log('');

  // Check list data AFTER OneVar
  console.log(`  List data AFTER OneVar: ${hexBytes(mem, LIST_DATA_ADDR, LIST_DATA_SIZE)}`);
  console.log('');

  // Compare before/after
  let intact = true;
  for (let i = 0; i < LIST_DATA_SIZE; i++) {
    if (mem[LIST_DATA_ADDR + i] !== listDataBefore[i]) {
      intact = false;
      break;
    }
  }
  console.log(`  List data intact: ${intact ? 'YES' : 'NO'}`);
  console.log('');

  // Read individual elements after
  console.log('  Elements after:');
  const elemCountAfter = mem[LIST_DATA_ADDR] | (mem[LIST_DATA_ADDR + 1] << 8);
  console.log(`    Element count: ${elemCountAfter}`);
  for (let i = 0; i < LIST_ELEM_COUNT; i++) {
    const addr = LIST_DATA_ADDR + 2 + i * 9;
    const val = safeReadReal(mem, addr);
    console.log(`    [${i}] at ${hex(addr)}: ${val}  (bytes: ${hexBytes(mem, addr, 9)})`);
  }
  console.log('');

  // Stat results
  console.log('  Stat results (partial entry):');
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
  console.log('');

  // Pragmatic assessment
  if (intact && passCount >= 6) {
    console.log('  PRAGMATIC ASSESSMENT: List data SURVIVES partial entry.');
    console.log('  min/max can be trivially computed in JS from the surviving list data.');
    console.log(`  min = ${Math.min(...BCD_VALUES.map((_, i) => {
      const addr = LIST_DATA_ADDR + 2 + i * 9;
      const v = safeReadReal(mem, addr);
      return typeof v === 'number' ? v : Infinity;
    }))}`);
    console.log(`  max = ${Math.max(...BCD_VALUES.map((_, i) => {
      const addr = LIST_DATA_ADDR + 2 + i * 9;
      const v = safeReadReal(mem, addr);
      return typeof v === 'number' ? v : -Infinity;
    }))}`);
  } else if (!intact) {
    console.log('  PRAGMATIC ASSESSMENT: List data was MODIFIED by OneVar.');
    console.log('  JS-side min/max from list data is NOT reliable after OneVar.');
  }

  return { intact, passCount };
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 145: OneVar Full Entry — E_Domain Trace ===');

  const partA = runPartA();
  const partB = runPartB();
  const partC = runPartC();

  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('');
  console.log('='.repeat(72));
  console.log('  SUMMARY');
  console.log('='.repeat(72));
  console.log('');

  console.log('  Part A (E_Domain trace):');
  if (partA.errFirstSeen) {
    console.log(`    Error: ${errName(partA.errFirstSeen.errNo)} at PC=${hex(partA.errFirstSeen.pc)}, step=${partA.errFirstSeen.step}`);
  } else {
    console.log('    No error detected (unexpected)');
  }
  console.log(`    Total steps: ${partA.stepCount}`);
  console.log(`    Unique PCs: ${partA.allPcHits.size}`);

  console.log('');
  console.log('  Part B (B=0 effect):');
  if (partB.errFirstSeen) {
    console.log(`    Error: ${errName(partB.errFirstSeen.errNo)} at PC=${hex(partB.errFirstSeen.pc)}, step=${partB.errFirstSeen.step}`);
    if (partA.errFirstSeen) {
      const sameStep = partA.errFirstSeen.step === partB.errFirstSeen.step;
      const samePC = partA.errFirstSeen.pc === partB.errFirstSeen.pc;
      console.log(`    Same step as Part A: ${sameStep ? 'YES' : 'NO'}`);
      console.log(`    Same PC as Part A: ${samePC ? 'YES' : 'NO'}`);
      console.log(`    B=0 changes outcome: ${(!sameStep || !samePC) ? 'YES' : 'NO'}`);
    }
  } else {
    console.log('    No error detected — B=0 FIXES the issue!');
  }
  console.log(`    Total steps: ${partB.stepCount}`);

  console.log('');
  console.log('  Part C (list data survival):');
  console.log(`    List data intact after partial entry: ${partC.intact ? 'YES' : 'NO'}`);
  console.log(`    Stat score: ${partC.passCount}/8`);
  if (partC.intact && partC.passCount >= 6) {
    console.log('    CONCLUSION: JS-side min/max is viable as pragmatic fix.');
  }

  console.log('');
  console.log('=== Phase 145 probe complete ===');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
