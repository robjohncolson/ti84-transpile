#!/usr/bin/env node

/**
 * Phase 137 — OneVar End-to-End Test
 *
 * Pipeline: Cold boot → MEM_INIT → CreateRList(L1, 5 elements) → populate [10,20,30,40,50]
 *           → OneVar(0x0A9325) → check stat var slots (n, mean, sum, etc.)
 *
 * RESULTS (2026-04-29):
 *   - ALL key blocks are MISSING (not yet transpiled):
 *     OneVar (0x0A9325), OneVars0 (0x0AA978), CreateRList (0x082398),
 *     Sto_StatVar (0x09A3BD), stat core range 0x094000-0x096000
 *   - CreateRList: stalled at 0x0019B5 after 31 steps, errNo=0x8F (halted in z80 boot code)
 *     Since block is MISSING, execution fell through to boot-area z80 code
 *   - Fallback: manual list creation at 0xD1A881 with [10,20,30,40,50] — data populated OK
 *   - OneVar: returned after only 32 steps with errNo=0x8A
 *     Flow: 0x0A93E5 -> 0x061D2C (JError) -> unwind -> return
 *     OneVar's entry block is MISSING so execution used the ROM bytes as data,
 *     hit an error path almost immediately
 *   - No stat vars written (all zero) — OneVar never reached its calculation core
 *   - statsValid bit 6 = 0 (not set)
 *   - ROOT CAUSE: The stat functions (OneVar, OneVars0, Sto_StatVar, 0x094xxx-0x096xxx)
 *     have not been lifted/transpiled yet. These ROM address ranges need to be added
 *     to the transpiler's block discovery before OneVar can execute.
 *   - NEXT STEPS: Transpile blocks at 0x0A9325 (OneVar), 0x0AA978 (OneVars0),
 *     0x09A3BD (Sto_StatVar), and the stat core range 0x094000-0x096000
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

const CREATERL_ENTRY = 0x082398;  // CreateRList
const CREATERL_RET = 0x7ffff2;

const ONEVAR_ENTRY = 0x0a9325;
const ONEVAR_RET = 0x7fffee;
const ONEVARS0_ADDR = 0x0aa978;

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

// Stat var addresses
const STAT_VARS_OFFSET_ADDR = 0xd0117f;
const STAT_VARS_ADDR = 0xd01191;
const STATS_VALID_ADDR = 0xd00089;  // IY+0x09, bit 6

// OneVar uses statVars base for its output. Slots are 9 bytes each.
// From ti84pceg.inc / session 72 analysis:
//   statVarsOffset = 0xD0117F
//   slot(token) = statVarsOffset + 9 * token
// Known stat tokens (from ti84pceg.inc):
//   tN = 0x00 (but stat results start at different offsets)
// The actual stat result layout after OneVar:
//   Base = statVars (0xD01191) or statVarsOffset (0xD0117F)
//   The slots are indexed by stat token values.
// From session 72: tMean = 0x21, slot = statVarsOffset + 9*0x21 = 0xD012A8

const TMEAN_SLOT = 0xd012a8;  // statVarsOffset + 9 * 0x21

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const MEMINIT_BUDGET = 100000;
const CREATERL_BUDGET = 50000;
const ONEVAR_BUDGET = 500000;
const MAX_LOOP_ITER = 8192;
const RECENT_PC_LIMIT = 128;

// L1 descriptor for OP1: type=0x01 (RealList), name=0x01
const L1_OP1 = Uint8Array.from([0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

// BCD values for [10, 20, 30, 40, 50]
const BCD_VALUES = [
  Uint8Array.from([0x00, 0x81, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),  // 10.0
  Uint8Array.from([0x00, 0x81, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),  // 20.0
  Uint8Array.from([0x00, 0x81, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),  // 30.0
  Uint8Array.from([0x00, 0x81, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),  // 40.0
  Uint8Array.from([0x00, 0x81, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),  // 50.0
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
  if (code === 0x00) return 'none';
  if (code === 0x80) return 'E_Edit';
  if (code === 0x84) return 'E_Domain';
  if (code === 0x88) return 'E_Syntax';
  if (code === 0x8d) return 'E_Undefined';
  if (code === 0x8e) return 'E_StatPlot';
  return `unknown(${hex(code, 2)})`;
}

const memWrap = (m) => ({
  write8(a, v) { m[a] = v & 0xff; },
  read8(a) { return m[a] & 0xff; },
});

function safeReadReal(m, a) {
  try {
    return readReal(memWrap(m), a);
  } catch (e) {
    return `readReal error: ${e?.message ?? e}`;
  }
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

// ── Generic run-call helper ────────────────────────────────────────────────

function runCall(executor, cpu, mem, { entry, budget, returnPc, label = 'call' }) {
  let finalPc = null;
  let termination = 'unknown';
  let returnHit = false;
  let errCaught = false;
  let stepCount = 0;
  const recentPcs = [];
  const missingBlocks = new Map();

  try {
    const res = executor.runFrom(entry, 'adl', {
      maxSteps: budget,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _m, _meta, step) {
        const norm = pc & 0xffffff;
        finalPc = norm;
        if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
        recentPcs.push(norm);
        if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
        if (norm === returnPc) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, _m, step) {
        const norm = pc & 0xffffff;
        finalPc = norm;
        if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
        recentPcs.push(norm);
        if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
        missingBlocks.set(norm, (missingBlocks.get(norm) || 0) + 1);
        if (norm === returnPc) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
    });
    finalPc = res.lastPc ?? finalPc;
    termination = res.termination ?? termination;
    stepCount = Math.max(stepCount, res.steps ?? 0);
  } catch (e) {
    if (e?.message === '__RET__') { returnHit = true; finalPc = returnPc; termination = 'return_hit'; }
    else if (e?.message === '__ERR__') { errCaught = true; finalPc = ERR_CATCH_ADDR; termination = 'err_caught'; }
    else throw e;
  }

  return {
    returnHit, errCaught, termination, finalPc, stepCount, recentPcs, missingBlocks,
    a: cpu.a & 0xff, f: cpu.f & 0xff,
    hl: cpu.hl & 0xffffff, de: cpu.de & 0xffffff,
    sp: cpu.sp & 0xffffff,
    errNo: mem[ERR_NO_ADDR] & 0xff,
  };
}

function outcome(run) {
  if (run.returnHit) return 'returned';
  if (run.errCaught) return `error caught (errNo=${hex(run.errNo, 2)} ${errName(run.errNo)})`;
  return `stalled (term=${run.termination} finalPc=${hex(run.finalPc)})`;
}

function logMissing(label, run) {
  if (run.missingBlocks.size === 0) return;
  console.log(`  ${label} missing blocks (${run.missingBlocks.size}):`);
  const sorted = [...run.missingBlocks.entries()].sort((a, b) => b[1] - a[1]);
  for (const [addr, count] of sorted.slice(0, 10)) {
    console.log(`    ${hex(addr)}: ${count} hits`);
  }
}

function logLastPcs(label, run, n = 16) {
  const last = run.recentPcs.slice(-n);
  if (last.length === 0) return;
  console.log(`  ${label} last ${last.length} PCs: ${last.map(p => hex(p)).join(' ')}`);
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 137: OneVar End-to-End Test ===');
  console.log('Pipeline: cold boot -> MEM_INIT -> CreateRList(L1,5) -> populate [10,20,30,40,50] -> OneVar -> check stat vars');
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 0: Block coverage checks
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('--- Block coverage checks ---');
  const coverageAddrs = [
    { name: 'OneVar entry', addr: 0x0a9325 },
    { name: 'OneVars0', addr: 0x0aa978 },
    { name: 'CreateRList', addr: 0x082398 },
    { name: 'Sto_StatVar', addr: 0x09a3bd },
    { name: 'Stat core sample 0x094100', addr: 0x094100 },
    { name: 'Stat core sample 0x094500', addr: 0x094500 },
    { name: 'Stat core sample 0x095000', addr: 0x095000 },
  ];
  for (const { name, addr } of coverageAddrs) {
    const hasBlock = BLOCKS[addr] !== undefined;
    console.log(`  ${name} (${hex(addr)}): ${hasBlock ? 'COVERED' : 'MISSING'}`);
  }
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 1: Boot + MEM_INIT
  // ═══════════════════════════════════════════════════════════════════════════

  const { mem, executor, cpu } = createRuntime();
  coldBoot(executor, cpu, mem);

  console.log('--- MEM_INIT ---');
  prepareCallState(cpu, mem);
  seedAllocator(mem);
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
  if (!meminitOk) { console.log('ABORT: MEM_INIT failed'); process.exitCode = 1; return; }

  console.log(`  Post-MEM_INIT: OPS=${hex(read24(mem, OPS_ADDR))} progPtr=${hex(read24(mem, PROGPTR_ADDR))} pTemp=${hex(read24(mem, PTEMP_ADDR))}`);
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 2: CreateRList(L1, 5 elements)
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('--- CreateRList(L1, 5 elements) ---');

  // Set OP1 to L1 descriptor
  mem.set(L1_OP1, OP1_ADDR);
  console.log(`  OP1 = [${hexBytes(mem, OP1_ADDR, 9)}]`);

  // HL = number of elements for CreateRList
  // From SDK: CreateRList expects HL = number of elements
  prepareCallState(cpu, mem);
  cpu._hl = 5;  // 5 elements
  seedErrFrame(cpu, mem, CREATERL_RET, ERR_CATCH_ADDR, 0);

  const createRun = runCall(executor, cpu, mem, {
    entry: CREATERL_ENTRY,
    budget: CREATERL_BUDGET,
    returnPc: CREATERL_RET,
    label: 'CreateRList',
  });

  console.log(`  CreateRList: ${outcome(createRun)}`);
  console.log(`  Steps: ${createRun.stepCount}, errNo: ${hex(createRun.errNo, 2)} (${errName(createRun.errNo)})`);
  console.log(`  DE=${hex(createRun.de)} HL=${hex(createRun.hl)}`);
  logMissing('CreateRList', createRun);
  logLastPcs('CreateRList', createRun);
  console.log('');

  if (!createRun.returnHit) {
    console.log('ABORT: CreateRList did not return cleanly');

    // Try alternative: manually create list in memory
    console.log('');
    console.log('--- Fallback: Manual list creation ---');
    manualListAndOneVar(mem, executor, cpu);
    return;
  }

  // DE should point to the data area of the newly created variable
  const dataPtr = createRun.de;
  console.log(`  Data area pointer: ${hex(dataPtr)}`);

  // Populate: 2-byte LE element count + 5 × 9-byte BCD reals
  populateList(mem, dataPtr);

  // Now run OneVar
  runOneVarTest(mem, executor, cpu);
}

// ── Populate list data ─────────────────────────────────────────────────────

function populateList(mem, dataPtr) {
  console.log('--- Populating L1 with [10, 20, 30, 40, 50] ---');

  // Write element count (2 bytes LE)
  write16(mem, dataPtr, 5);

  // Write 5 BCD reals
  for (let i = 0; i < BCD_VALUES.length; i++) {
    const offset = dataPtr + 2 + i * 9;
    mem.set(BCD_VALUES[i], offset);
  }

  // Verify
  const count = mem[dataPtr] | (mem[dataPtr + 1] << 8);
  console.log(`  Element count: ${count}`);
  for (let i = 0; i < 5; i++) {
    const offset = dataPtr + 2 + i * 9;
    const val = safeReadReal(mem, offset);
    console.log(`  L1[${i + 1}] = ${val} (bytes: [${hexBytes(mem, offset, 9)}])`);
  }
  console.log('');
}

// ── Manual list creation fallback ──────────────────────────────────────────

function manualListAndOneVar(mem, executor, cpu) {
  // If CreateRList fails, we can manually construct the list in RAM
  // and set up the VAT entry ourselves

  // Re-run MEM_INIT to get clean state
  prepareCallState(cpu, mem);
  seedAllocator(mem);
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
  if (!meminitOk) { console.log('ABORT: MEM_INIT failed on retry'); process.exitCode = 1; return; }

  // Data area: 2-byte count + 5*9 = 47 bytes total
  const dataSize = 2 + 5 * 9;  // 47

  // Place data at userMem
  const userMem = read24(mem, NEWDATA_PTR_ADDR);
  console.log(`  userMem/newDataPtr = ${hex(userMem)}`);

  const dataPtr = userMem;

  // Write element count
  write16(mem, dataPtr, 5);

  // Write BCD values
  for (let i = 0; i < BCD_VALUES.length; i++) {
    mem.set(BCD_VALUES[i], dataPtr + 2 + i * 9);
  }

  // Update newDataPtr past the data
  write24(mem, NEWDATA_PTR_ADDR, dataPtr + dataSize);

  // Create VAT entry for L1
  // VAT grows downward from OPS. Each entry:
  //   [type(1)] [name_len(1)] [name(name_len)] [version(1)] [page(1)] [data_ptr(3)]
  // For L1: type=0x01, name=0x01 (single byte name), version=0, page=0
  // Actually TI VAT format for lists is simpler:
  //   byte 0: type (0x01 = RealList)
  //   bytes 1-3: data pointer (LE 24-bit)
  //   byte 4: version (0x00)
  //   byte 5: page (0x00)
  //   byte 6: name length (0x01 for L1)
  //   byte 7: name byte (0x01 for L1)
  // VAT grows downward from symTable
  // OPS points to current top-of-VAT

  const ops = read24(mem, OPS_ADDR);
  console.log(`  OPS before VAT write = ${hex(ops)}`);

  // Write VAT entry growing downward
  // Format: [name_byte] [name_len=1] [page=0] [version=0] [data_ptr_lo] [data_ptr_mid] [data_ptr_hi] [type=0x01]
  // VAT entries are stored in reverse order (top byte first when reading downward)
  // But conventionally the layout from low to high at the VAT pointer is:
  //   ptr-6: type byte
  //   ptr-5..ptr-3: data pointer (3 bytes LE)
  //   ptr-2: version
  //   ptr-1: page (0 for RAM)
  //   ptr-0: name length
  //   then name bytes follow below
  // Actually the TI VAT is more complex. Let me just use the simpler approach:
  // set OP1 to the L1 descriptor and manually populate the data area.
  // Then for OneVar, we need to make sure FindSym can find L1.

  // The safest approach: seed OP1 with L1 descriptor before OneVar,
  // and see if OneVar itself calls FindSym to locate the list data.

  // Actually, OneVar reads from specific system pointers. Let me just
  // populate the list data and set the relevant pointers.

  // Verify the data
  const count = mem[dataPtr] | (mem[dataPtr + 1] << 8);
  console.log(`  Element count: ${count}`);
  for (let i = 0; i < 5; i++) {
    const offset = dataPtr + 2 + i * 9;
    const val = safeReadReal(mem, offset);
    console.log(`  L1[${i + 1}] = ${val} (bytes: [${hexBytes(mem, offset, 9)}])`);
  }
  console.log('');

  // Set OP1 to L1 descriptor for OneVar
  mem.set(L1_OP1, OP1_ADDR);

  runOneVarTest(mem, executor, cpu);
}

// ── Run OneVar and check results ───────────────────────────────────────────

function runOneVarTest(mem, executor, cpu) {
  console.log('--- OneVar (0x0A9325) ---');

  // Set OP1 to L1 descriptor
  mem.set(L1_OP1, OP1_ADDR);
  console.log(`  OP1 = [${hexBytes(mem, OP1_ADDR, 9)}]`);

  // Prepare call state
  prepareCallState(cpu, mem);
  seedErrFrame(cpu, mem, ONEVAR_RET, ERR_CATCH_ADDR, 0);
  mem[ERR_NO_ADDR] = 0x00;

  // Clear stat vars area before call (so we can see what gets written)
  mem.fill(0x00, STAT_VARS_OFFSET_ADDR, STAT_VARS_OFFSET_ADDR + 0x200);

  // Track key addresses
  let hitOneVar = false;
  let hitOneVars0 = false;
  const stoStatVarHits = [];

  const onevarRun = runCall(executor, cpu, mem, {
    entry: ONEVAR_ENTRY,
    budget: ONEVAR_BUDGET,
    returnPc: ONEVAR_RET,
    label: 'OneVar',
  });

  console.log(`  OneVar: ${outcome(onevarRun)}`);
  console.log(`  Steps: ${onevarRun.stepCount}, errNo: ${hex(onevarRun.errNo, 2)} (${errName(onevarRun.errNo)})`);
  console.log(`  DE=${hex(onevarRun.de)} HL=${hex(onevarRun.hl)} A=${hex(onevarRun.a, 2)}`);
  logMissing('OneVar', onevarRun);
  logLastPcs('OneVar', onevarRun);
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // Step 4: Check stat variable slots
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('--- Stat variable slots ---');
  console.log(`  statsValid byte (${hex(STATS_VALID_ADDR)}): ${hex(mem[STATS_VALID_ADDR] & 0xff, 2)} (bit6=${(mem[STATS_VALID_ADDR] >> 6) & 1})`);
  console.log(`  errNo: ${hex(mem[ERR_NO_ADDR] & 0xff, 2)} (${errName(mem[ERR_NO_ADDR] & 0xff)})`);

  // Dump stat var slots around the expected mean location
  // tMean slot = statVarsOffset + 9 * 0x21 = 0xD0117F + 0x129 = 0xD012A8
  console.log('');
  console.log('  Stat slot dump (statVarsOffset = 0xD0117F):');

  // Known stat tokens and their expected values for [10,20,30,40,50]:
  const expectedStats = [
    { name: 'n (count)', token: 0x00, expected: 5.0 },
    { name: 'meanX', token: 0x21, expected: 30.0 },
    { name: 'sumX', token: 0x23, expected: 150.0 },
    { name: 'sumX2', token: 0x25, expected: 5500.0 },
    { name: 'Sx (sample stddev)', token: 0x27, expected: null },  // sqrt(250/4)=sqrt(62.5)≈7.9057
    { name: 'sigmaX (pop stddev)', token: 0x29, expected: null }, // sqrt(200/5)=sqrt(40)≈6.3246
    { name: 'minX', token: 0x2b, expected: 10.0 },
    { name: 'maxX', token: 0x2d, expected: 50.0 },
  ];

  for (const stat of expectedStats) {
    const slotAddr = STAT_VARS_OFFSET_ADDR + 9 * stat.token;
    const val = safeReadReal(mem, slotAddr);
    const bytes = hexBytes(mem, slotAddr, 9);
    const matchStr = stat.expected !== null
      ? (typeof val === 'number' && Math.abs(val - stat.expected) < 0.01 ? 'MATCH' : 'MISMATCH')
      : '';
    console.log(`  ${stat.name} (token=${hex(stat.token, 2)}, addr=${hex(slotAddr)}): ${val} [${bytes}] ${matchStr}`);
  }

  // Also dump a wider range of slots to see if anything got written
  console.log('');
  console.log('  Non-zero stat slots scan (first 64 slots):');
  let nonZeroCount = 0;
  for (let token = 0; token < 64; token++) {
    const slotAddr = STAT_VARS_OFFSET_ADDR + 9 * token;
    let allZero = true;
    for (let b = 0; b < 9; b++) {
      if (mem[slotAddr + b] !== 0) { allZero = false; break; }
    }
    if (!allZero) {
      const val = safeReadReal(mem, slotAddr);
      console.log(`    slot ${token} (${hex(token, 2)}, addr=${hex(slotAddr)}): ${val} [${hexBytes(mem, slotAddr, 9)}]`);
      nonZeroCount++;
    }
  }
  if (nonZeroCount === 0) {
    console.log('    (all zero — no stat vars were written)');
  }

  // Check tMean specifically
  console.log('');
  console.log(`  tMean slot (${hex(TMEAN_SLOT)}): [${hexBytes(mem, TMEAN_SLOT, 9)}]`);
  const meanVal = safeReadReal(mem, TMEAN_SLOT);
  console.log(`  tMean decoded: ${meanVal}`);
  if (typeof meanVal === 'number' && Math.abs(meanVal - 30.0) < 0.01) {
    console.log('  tMean MATCH: 30.0 (mean of 10,20,30,40,50)');
  } else {
    console.log(`  tMean MISMATCH: expected 30.0, got ${meanVal}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('');
  console.log('='.repeat(72));
  console.log('  SUMMARY');
  console.log('='.repeat(72));
  console.log(`  OneVar outcome: ${outcome(onevarRun)}`);
  console.log(`  Steps: ${onevarRun.stepCount}`);
  console.log(`  errNo: ${hex(onevarRun.errNo, 2)} (${errName(onevarRun.errNo)})`);
  console.log(`  tMean: ${meanVal}`);
  console.log(`  Missing blocks: ${onevarRun.missingBlocks.size}`);
  console.log(`  Stats valid bit: ${(mem[STATS_VALID_ADDR] >> 6) & 1}`);
  console.log(`  Non-zero stat slots: ${nonZeroCount}`);
  console.log('');
  console.log('=== Phase 137 probe complete ===');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
