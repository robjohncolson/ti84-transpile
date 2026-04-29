#!/usr/bin/env node

/**
 * Phase 139 P3 — CreateRList Investigation + Alternative List Creation
 *
 * Part 1: Trace CreateRList (0x082398) to find the missing block
 * Part 2: Learn VAT format from CreateEqu, manually construct list entry
 * Part 3: OneVar test with the manually created list
 *
 * Key discovery: VAT entries are 9 bytes, stored from HIGH addr to LOW.
 * Layout (from highest to lowest address):
 *   +0: type byte
 *   -1: version/flags
 *   -2: page/archive
 *   -3: data_ptr[0] (low byte)
 *   -4: data_ptr[1] (mid byte)
 *   -5: data_ptr[2] (high byte)
 *   -6: name byte 1
 *   -7: name byte 2 (or 0x00)
 *   -8: name byte 3 (or 0x00)
 * progPtr = address of byte just below the lowest entry.
 *
 * FindSym reads from HL=OPBase-1 downward:
 *   1. Read type at (HL), mask with AND 0x3F
 *   2. DEC HL * 6 → lands at name byte 1 position
 *   3. Compare OP1[1] with (HL) = name byte 1
 *   4. On mismatch: SBC HL, 3 → skip to next entry's type byte
 *   5. On match: verify more name bytes, then extract data pointer
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

const CREATERL_ENTRY = 0x082398;
const CREATERL_RET = 0x7ffff2;

const CREATEEQU_ENTRY = 0x082438;
const CREATEEQU_RET = 0x7ffff4;

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

const STAT_VARS_OFFSET_ADDR = 0xd0117f;

const ERR_CATCH_ADDR = 0x7ffffa;
const MAX_LOOP_ITER = 8192;

const L1_OP1 = Uint8Array.from([0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const BCD_VALUES = [
  Uint8Array.from([0x00, 0x81, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),  // 10
  Uint8Array.from([0x00, 0x81, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),  // 20
  Uint8Array.from([0x00, 0x81, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),  // 30
  Uint8Array.from([0x00, 0x81, 0x40, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),  // 40
  Uint8Array.from([0x00, 0x81, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),  // 50
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
  if (code === 0x84) return 'E_Domain';
  if (code === 0x88) return 'E_Syntax';
  if (code === 0x8a) return 'E_JError';
  if (code === 0x8d) return 'E_Undefined';
  if (code === 0x8f) return 'E_Halted';
  return `unknown(${hex(code, 2)})`;
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

// ── Write a VAT entry in TI-84 CE format ──────────────────────────────────
// Writes entry at the TOP of VAT (just below current highest entry).
// Entry occupies 9 bytes from vatTop down to vatTop-8.
// progPtr is updated to point below the entry.
//
// Parameters:
//   topAddr: the highest address for this entry (e.g. D3FFFF for first entry)
//   typeByte: 0x01=ListObj, 0x03=EquObj, etc.
//   dataPtr: 24-bit pointer to variable data
//   name1: first name byte (e.g. 0x01 for L1, 0x10 for Y1)
//   name2: second name byte (0x00 if unused)
//   name3: third name byte (0x00 if unused)

function writeVATEntry(mem, topAddr, typeByte, dataPtr, name1, name2 = 0x00, name3 = 0x00) {
  // From topAddr going DOWN:
  // +0: type
  // -1: version (0x00)
  // -2: page (0x00)
  // -3: data_ptr low
  // -4: data_ptr mid
  // -5: data_ptr high
  // -6: name byte 1
  // -7: name byte 2
  // -8: name byte 3

  mem[topAddr]     = typeByte;
  mem[topAddr - 1] = 0x00;                     // version
  mem[topAddr - 2] = 0x00;                     // page
  mem[topAddr - 3] = dataPtr & 0xff;           // ptr low
  mem[topAddr - 4] = (dataPtr >> 8) & 0xff;    // ptr mid
  mem[topAddr - 5] = (dataPtr >> 16) & 0xff;   // ptr high
  mem[topAddr - 6] = name1;
  mem[topAddr - 7] = name2;
  mem[topAddr - 8] = name3;

  // progPtr = topAddr - 9 (one byte below the entry)
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
        if (traceAll && allPcs.length < 300) allPcs.push(norm);
        if (norm === returnPc) throw new Error('__RET__');
        if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
      },
      onMissingBlock(pc, _m, step) {
        const norm = pc & 0xffffff;
        finalPc = norm;
        if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
        recentPcs.push(norm);
        if (recentPcs.length > 128) recentPcs.shift();
        if (traceAll && allPcs.length < 300) allPcs.push(norm);
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
  console.log('=== Phase 139 P3: CreateRList Investigation + Alternative List Creation ===');
  console.log('');

  const { mem, executor, cpu } = createRuntime();
  console.log('Cold-booting OS...');
  coldBoot(executor, cpu, mem);
  console.log('Cold boot complete.');
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // Part 1: CreateRList detailed trace
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('='.repeat(72));
  console.log('  PART 1: CreateRList Detailed Trace');
  console.log('='.repeat(72));
  console.log('');

  if (!runMemInit(executor, cpu, mem)) {
    console.log('ABORT: MEM_INIT failed'); process.exitCode = 1; return;
  }
  console.log('  MEM_INIT: OK');

  mem.set(L1_OP1, OP1_ADDR);
  prepareCallState(cpu, mem);
  cpu._hl = 5;
  seedErrFrame(cpu, mem, CREATERL_RET);
  mem.set(L1_OP1, OP1_ADDR);

  const createRun = runCall(executor, cpu, mem, {
    entry: CREATERL_ENTRY, budget: 500, returnPc: CREATERL_RET, traceAll: true,
  });

  console.log(`  Result: ${outcome(createRun)}`);
  console.log(`  Steps: ${createRun.stepCount}, errNo: ${hex(createRun.errNo, 2)} (${errName(createRun.errNo)})`);

  if (createRun.missingBlocks.size > 0) {
    console.log(`  Missing blocks:`);
    for (const [addr, count] of createRun.missingBlocks) {
      console.log(`    ${hex(addr)}: ${count} hits`);
    }
  }

  console.log(`  Trace (${createRun.allPcs.length} PCs):`);
  for (let i = 0; i < createRun.allPcs.length; i++) {
    const pc = createRun.allPcs[i];
    const miss = createRun.missingBlocks.has(pc) ? ' [MISSING]' : '';
    console.log(`    step ${String(i).padStart(3)}: ${hex(pc)}${miss}`);
  }
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // Part 2: Verify VAT format, then build manual list entry
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('='.repeat(72));
  console.log('  PART 2: Manual List VAT Entry');
  console.log('='.repeat(72));
  console.log('');

  // 2a: Verify our VAT format understanding with CreateEqu
  console.log('--- 2a: CreateEqu Y1 to verify VAT format ---');

  if (!runMemInit(executor, cpu, mem)) {
    console.log('ABORT: MEM_INIT failed'); process.exitCode = 1; return;
  }

  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
  mem[OP1_ADDR] = 0x03; // EquObj
  mem[OP1_ADDR + 1] = 0x10; // tY1

  prepareCallState(cpu, mem);
  cpu._hl = 1;
  seedErrFrame(cpu, mem, CREATEEQU_RET);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
  mem[OP1_ADDR] = 0x03;
  mem[OP1_ADDR + 1] = 0x10;

  const equRun = runCall(executor, cpu, mem, {
    entry: CREATEEQU_ENTRY, budget: 50000, returnPc: CREATEEQU_RET,
  });

  console.log(`  CreateEqu: ${outcome(equRun)} DE=${hex(equRun.de)}`);
  const ppAfterEqu = read24(mem, PROGPTR_ADDR);
  console.log(`  progPtr: 0xD3FFFF → ${hex(ppAfterEqu)} (moved ${0xD3FFFF - ppAfterEqu} bytes)`);

  // Dump VAT entry
  console.log('  VAT entry (high to low):');
  for (let a = 0xD3FFFF; a >= ppAfterEqu; a--) {
    console.log(`    ${hex(a)}: ${hex(mem[a] & 0xff, 2)}`);
  }

  // Verify FindSym can find Y1
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
  mem[OP1_ADDR] = 0x03;
  mem[OP1_ADDR + 1] = 0x10;
  prepareCallState(cpu, mem);
  seedErrFrame(cpu, mem, FINDSYM_RET);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
  mem[OP1_ADDR] = 0x03;
  mem[OP1_ADDR + 1] = 0x10;

  const findEquRun = runCall(executor, cpu, mem, {
    entry: FINDSYM_ENTRY, budget: 5000, returnPc: FINDSYM_RET, traceAll: true,
  });
  const equCarry = findEquRun.f & 1;
  console.log(`  FindSym Y1: ${outcome(findEquRun)} carry=${equCarry} (${equCarry === 0 ? 'FOUND' : 'NOT FOUND'})`);
  console.log(`  Trace: ${findEquRun.allPcs.map(p => hex(p)).join(' ')}`);
  console.log('');

  // 2b: Build manual list entry at progPtr
  console.log('--- 2b: Build list L1 entry and data ---');

  // Place list data after equation data
  const ndp = read24(mem, NEWDATA_PTR_ADDR);
  const listDataAddr = ndp;
  const LIST_ELEM_COUNT = 5;
  const LIST_DATA_SIZE = 2 + LIST_ELEM_COUNT * 9;

  write16(mem, listDataAddr, LIST_ELEM_COUNT);
  for (let i = 0; i < BCD_VALUES.length; i++) {
    mem.set(BCD_VALUES[i], listDataAddr + 2 + i * 9);
  }
  write24(mem, NEWDATA_PTR_ADDR, listDataAddr + LIST_DATA_SIZE);

  console.log(`  List data at ${hex(listDataAddr)}, ${LIST_ELEM_COUNT} elements`);
  for (let i = 0; i < LIST_ELEM_COUNT; i++) {
    console.log(`    elem[${i}] = ${safeReadReal(mem, listDataAddr + 2 + i * 9)}`);
  }

  // Write list VAT entry. The entry goes from ppAfterEqu-1 downward (9 bytes).
  // Top of list entry = ppAfterEqu - 1 (just below equEntry at D3FFF6).
  // Wait — ppAfterEqu IS progPtr, and progPtr points to the byte BELOW the
  // lowest entry. So ppAfterEqu is free space. The first free address for a
  // new entry's top is ppAfterEqu (not ppAfterEqu-1).
  //
  // But actually, looking at the equation entry: type at D3FFFF, and progPtr
  // at D3FFF6. The entry spans D3FFF7..D3FFFF (9 bytes from D3FFFF-8 to D3FFFF).
  // progPtr = D3FFF6 = D3FFFF - 9. So entry top = D3FFFF, and progPtr = top - 9.
  //
  // For the next entry: top = progPtr (the byte just below the previous entry).
  // But we need to check: does FindSym iterate from D3FFFF downward counting
  // every 9 bytes? No — it reads the type byte, skips 6, then on mismatch
  // skips 3 more. 6 + 3 = 9 per entry. So it expects entries to be contiguous.
  //
  // Next entry top = ppAfterEqu. Entry spans ppAfterEqu down to ppAfterEqu-8.
  // New progPtr = ppAfterEqu - 9.

  const listEntryTop = ppAfterEqu;
  const newPP = writeVATEntry(mem, listEntryTop, 0x01, listDataAddr, 0x01);
  // Also update OPS and OPBase to match
  write24(mem, OPS_ADDR, newPP);

  console.log(`  List entry top: ${hex(listEntryTop)}, progPtr: ${hex(newPP)}`);
  console.log(`  List entry bytes (high to low):`);
  for (let a = listEntryTop; a >= listEntryTop - 8; a--) {
    console.log(`    ${hex(a)}: ${hex(mem[a] & 0xff, 2)}`);
  }
  console.log('');

  // Dump full VAT
  console.log('  Full VAT (high to low):');
  for (let a = 0xD3FFFF; a >= newPP; a--) {
    console.log(`    ${hex(a)}: ${hex(mem[a] & 0xff, 2)}`);
  }
  console.log('');

  // 2c: Test FindSym for L1
  console.log('--- 2c: FindSym for L1 ---');

  mem.set(L1_OP1, OP1_ADDR);
  prepareCallState(cpu, mem);
  seedErrFrame(cpu, mem, FINDSYM_RET);
  mem.set(L1_OP1, OP1_ADDR);

  const findListRun = runCall(executor, cpu, mem, {
    entry: FINDSYM_ENTRY, budget: 5000, returnPc: FINDSYM_RET, traceAll: true,
  });

  const listCarry = findListRun.f & 1;
  console.log(`  FindSym L1: ${outcome(findListRun)} carry=${listCarry} (${listCarry === 0 ? 'FOUND' : 'NOT FOUND'})`);
  console.log(`  A=${hex(findListRun.a, 2)} DE=${hex(findListRun.de)} HL=${hex(findListRun.hl)}`);
  console.log(`  Steps: ${findListRun.stepCount}`);
  console.log(`  Trace: ${findListRun.allPcs.map(p => hex(p)).join(' ')}`);

  if (findListRun.missingBlocks.size > 0) {
    const filt = [...findListRun.missingBlocks.entries()].filter(([a]) => a !== FINDSYM_RET);
    if (filt.length > 0) {
      console.log(`  Missing: ${filt.map(([a, c]) => `${hex(a)}(${c}x)`).join(', ')}`);
    }
  }

  const findListOk = findListRun.returnHit && listCarry === 0;
  console.log('');

  // If still not found, try different name bytes
  let foundName = null;
  if (!findListOk) {
    console.log('--- 2d: Try different name byte values ---');

    // Try name=0x00 (tL1=0x00 from SDK) in both VAT and OP1
    for (const nameByte of [0x00, 0x02, 0x5D]) {
      // Rewrite the name byte in the VAT entry
      mem[listEntryTop - 6] = nameByte;

      const testOp1 = Uint8Array.from([0x01, nameByte, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      mem.set(testOp1, OP1_ADDR);
      prepareCallState(cpu, mem);
      seedErrFrame(cpu, mem, FINDSYM_RET);
      mem.set(testOp1, OP1_ADDR);

      const findTest = runCall(executor, cpu, mem, {
        entry: FINDSYM_ENTRY, budget: 5000, returnPc: FINDSYM_RET,
      });

      const tc = findTest.f & 1;
      const found = findTest.returnHit && tc === 0;
      console.log(`    name=0x${nameByte.toString(16).padStart(2, '0')}: carry=${tc} ${found ? 'FOUND' : 'NOT FOUND'} steps=${findTest.stepCount}`);

      if (found) {
        foundName = nameByte;
        break;
      }
    }
    console.log('');

    // If still not found, let me trace what FindSym actually reads
    if (foundName === null) {
      console.log('--- 2e: Deep trace of FindSym iteration ---');

      // Restore name to 0x01
      mem[listEntryTop - 6] = 0x01;
      mem.set(L1_OP1, OP1_ADDR);
      prepareCallState(cpu, mem);
      seedErrFrame(cpu, mem, FINDSYM_RET);
      mem.set(L1_OP1, OP1_ADDR);

      // Before FindSym, check what it will read at each step
      console.log(`  HL will start at 0xD3FFFF`);
      console.log(`  DE will load from progPtr = ${hex(read24(mem, PROGPTR_ADDR))}`);
      console.log(`  OP1[1] = ${hex(mem[OP1_ADDR + 1] & 0xff, 2)}`);
      console.log('');

      // Simulate FindSym's iteration:
      let hl = 0xD3FFFF;
      const de = read24(mem, PROGPTR_ADDR) + 1; // FindSym does INC DE
      const op1_1 = mem[OP1_ADDR + 1] & 0xff;

      for (let iter = 0; iter < 5; iter++) {
        if (hl < read24(mem, PROGPTR_ADDR)) {
          console.log(`  iter ${iter}: HL=${hex(hl)} < progPtr → done (not found)`);
          break;
        }

        const typeB = mem[hl] & 0xff;
        console.log(`  iter ${iter}: HL=${hex(hl)}`);
        console.log(`    type byte at (HL): ${hex(typeB, 2)} (AND 0x3F = ${hex(typeB & 0x3F, 2)})`);

        // DEC HL * 6
        hl -= 6;
        console.log(`    after DEC*6: HL=${hex(hl)}`);

        // Bounds check: HL - DE
        const diff = hl - de;
        const carry = diff < 0;
        console.log(`    SBC HL,DE: HL=${hex(hl)}-DE=${hex(de)} = ${diff} carry=${carry}`);

        if (carry) {
          console.log(`    → past end, return NOT FOUND`);
          break;
        }

        // ADD HL, DE restores HL
        // (No, SBC already subtracted, ADD restores)
        // Actually SBC HL, DE modifies HL. HL = HL - DE. Then ADD HL, DE: HL = HL + DE.
        // So HL is restored to its pre-SBC value.

        // Compare OP1[1] with (HL) = byte at HL (which is hl before SBC)
        // Wait — after SBC, HL = old_HL - DE. Then ADD HL, DE: HL = old_HL.
        // So HL is back to old_HL (the -6 position).
        const nameAtHL = mem[hl] & 0xff;
        console.log(`    byte at HL (name pos): ${hex(nameAtHL, 2)}`);
        console.log(`    CP OP1[1] (${hex(op1_1, 2)}) vs (HL) (${hex(nameAtHL, 2)}): ${op1_1 === nameAtHL ? 'MATCH' : 'MISMATCH'}`);

        if (op1_1 !== nameAtHL) {
          // Mismatch: HL -= 3
          hl -= 3;
          console.log(`    mismatch → HL -= 3 → ${hex(hl)}`);
        } else {
          console.log(`    MATCH! Would proceed to verify more name bytes`);
          break;
        }
      }
      console.log('');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Part 3: OneVar test
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('='.repeat(72));
  console.log('  PART 3: OneVar Test');
  console.log('='.repeat(72));
  console.log('');

  // Fresh start for OneVar
  if (!runMemInit(executor, cpu, mem)) {
    console.log('ABORT: MEM_INIT failed'); process.exitCode = 1; return;
  }

  // Build list data
  const dp3 = USERMEM_ADDR;
  write16(mem, dp3, LIST_ELEM_COUNT);
  for (let i = 0; i < BCD_VALUES.length; i++) {
    mem.set(BCD_VALUES[i], dp3 + 2 + i * 9);
  }
  write24(mem, NEWDATA_PTR_ADDR, dp3 + LIST_DATA_SIZE);

  // Build list VAT entry
  const pp3top = read24(mem, PROGPTR_ADDR);
  const useName = foundName !== null ? foundName : 0x01;
  const pp3new = writeVATEntry(mem, pp3top, 0x01, dp3, useName);
  write24(mem, OPS_ADDR, pp3new);

  console.log(`  List data at ${hex(dp3)}, VAT at ${hex(pp3top)}, progPtr=${hex(pp3new)}`);
  console.log(`  Name byte: ${hex(useName, 2)}`);

  // Verify FindSym finds it
  const op1Name = Uint8Array.from([0x01, useName, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  mem.set(op1Name, OP1_ADDR);
  prepareCallState(cpu, mem);
  seedErrFrame(cpu, mem, FINDSYM_RET);
  mem.set(op1Name, OP1_ADDR);

  const findVerify = runCall(executor, cpu, mem, {
    entry: FINDSYM_ENTRY, budget: 5000, returnPc: FINDSYM_RET,
  });
  const vCarry = findVerify.f & 1;
  console.log(`  FindSym verify: carry=${vCarry} (${vCarry === 0 ? 'FOUND' : 'NOT FOUND'})`);
  console.log('');

  // Run OneVar
  mem.set(op1Name, OP1_ADDR);
  prepareCallState(cpu, mem);
  seedErrFrame(cpu, mem, ONEVAR_RET);
  mem[ERR_NO_ADDR] = 0x00;
  mem.set(op1Name, OP1_ADDR);
  mem.fill(0x00, STAT_VARS_OFFSET_ADDR, STAT_VARS_OFFSET_ADDR + 0x200);

  console.log(`  Running OneVar (budget=5000)...`);
  const onevarRun = runCall(executor, cpu, mem, {
    entry: ONEVAR_ENTRY, budget: 5000, returnPc: ONEVAR_RET,
  });

  console.log(`  OneVar: ${outcome(onevarRun)}`);
  console.log(`  Steps: ${onevarRun.stepCount}, errNo: ${hex(onevarRun.errNo, 2)} (${errName(onevarRun.errNo)})`);
  console.log(`  DE=${hex(onevarRun.de)} HL=${hex(onevarRun.hl)}`);

  if (onevarRun.missingBlocks.size > 0) {
    const filt = [...onevarRun.missingBlocks.entries()].filter(([a]) => a !== ONEVAR_RET);
    if (filt.length > 0) {
      console.log(`  Missing: ${filt.map(([a, c]) => `${hex(a)}(${c}x)`).join(', ')}`);
    }
  }

  const lastPcs = onevarRun.recentPcs.slice(-20);
  console.log(`  Last 20 PCs: ${lastPcs.map(p => hex(p)).join(' ')}`);
  console.log('');

  // If OneVar ran more than 100 steps, try with bigger budget
  if (onevarRun.stepCount > 100 && !onevarRun.returnHit) {
    console.log('--- OneVar extended (50000 steps) ---');

    if (!runMemInit(executor, cpu, mem)) {
      console.log('ABORT'); process.exitCode = 1; return;
    }

    write16(mem, USERMEM_ADDR, LIST_ELEM_COUNT);
    for (let i = 0; i < BCD_VALUES.length; i++) {
      mem.set(BCD_VALUES[i], USERMEM_ADDR + 2 + i * 9);
    }
    write24(mem, NEWDATA_PTR_ADDR, USERMEM_ADDR + LIST_DATA_SIZE);

    const t2 = read24(mem, PROGPTR_ADDR);
    const p2 = writeVATEntry(mem, t2, 0x01, USERMEM_ADDR, useName);
    write24(mem, OPS_ADDR, p2);

    mem.set(op1Name, OP1_ADDR);
    prepareCallState(cpu, mem);
    seedErrFrame(cpu, mem, ONEVAR_RET);
    mem[ERR_NO_ADDR] = 0x00;
    mem.set(op1Name, OP1_ADDR);
    mem.fill(0x00, STAT_VARS_OFFSET_ADDR, STAT_VARS_OFFSET_ADDR + 0x200);

    const ov2 = runCall(executor, cpu, mem, {
      entry: ONEVAR_ENTRY, budget: 50000, returnPc: ONEVAR_RET,
    });

    console.log(`  OneVar ext: ${outcome(ov2)}`);
    console.log(`  Steps: ${ov2.stepCount}, errNo: ${hex(ov2.errNo, 2)}`);

    if (ov2.missingBlocks.size > 0) {
      const filt = [...ov2.missingBlocks.entries()].filter(([a]) => a !== ONEVAR_RET);
      if (filt.length > 0) {
        console.log(`  Missing: ${filt.map(([a, c]) => `${hex(a)}(${c}x)`).join(', ')}`);
      }
    }

    const last2 = ov2.recentPcs.slice(-20);
    console.log(`  Last 20 PCs: ${last2.map(p => hex(p)).join(' ')}`);
    console.log('');
  }

  // Check stat slots
  console.log('--- Stat variable slots ---');
  const expectedStats = [
    { name: 'n', token: 0x00, expected: 5.0 },
    { name: 'meanX', token: 0x21, expected: 30.0 },
    { name: 'sumX', token: 0x23, expected: 150.0 },
    { name: 'sumX2', token: 0x25, expected: 5500.0 },
    { name: 'Sx', token: 0x27, expected: null },
    { name: 'sigmaX', token: 0x29, expected: null },
    { name: 'minX', token: 0x2b, expected: 10.0 },
    { name: 'maxX', token: 0x2d, expected: 50.0 },
  ];

  let statMatchCount = 0;
  for (const s of expectedStats) {
    const addr = STAT_VARS_OFFSET_ADDR + 9 * s.token;
    const val = safeReadReal(mem, addr);
    let tag = '';
    if (s.expected !== null && typeof val === 'number' && Math.abs(val - s.expected) < 0.01) {
      tag = ' MATCH';
      statMatchCount++;
    }
    console.log(`  ${s.name} (0x${s.token.toString(16).padStart(2, '0')}): ${val}${tag}`);
  }
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════════

  console.log('='.repeat(72));
  console.log('  SUMMARY');
  console.log('='.repeat(72));
  console.log(`  Part 1 — CreateRList: ${outcome(createRun)}`);
  console.log(`    Missing block: ${[...createRun.missingBlocks.keys()].map(a => hex(a)).join(', ') || 'none'}`);
  console.log(`    Chain: 0x082398 → 0x0823AC → 0x061D46 (error raise) → errSP → 0x000005 (boot)`);
  console.log(`  Part 2 — VAT format: 9-byte entries, HIGH to LOW`);
  console.log(`    FindSym found Y1 via CreateEqu: ${equCarry === 0 ? 'YES' : 'NO'}`);
  console.log(`    FindSym found L1 (manual): ${findListOk || foundName !== null ? 'YES' : 'NO'}`);
  console.log(`  Part 3 — OneVar: ${outcome(onevarRun)}`);
  console.log(`    Steps: ${onevarRun.stepCount}, stat matches: ${statMatchCount}/${expectedStats.length}`);
  console.log('');
  console.log('=== Phase 139 P3 probe complete ===');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
