#!/usr/bin/env node

/**
 * Phase 132 — BufInsert (corrected DE convention) + ParseInp from edit buffer
 *
 * Test 1: BufInsert with token in DE (E=token, D=0 for single-byte)
 * Test 2: ParseInp reading from edit buffer filled by BufInsert
 * Test 3: Compare with direct-token-at-RAM approach
 * Test 4: CreateNumEditBuf investigation
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

const OP1_ADDR = 0xd005f8;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

const USERMEM_ADDR = 0xd1a881;
const EMPTY_VAT_ADDR = 0xd3ffff;

const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;

// Edit buffer gap-buffer pointers
const EDIT_TOP = 0xd02437;
const EDIT_CURSOR = 0xd0243a;
const EDIT_TAIL = 0xd0243d;
const EDIT_BTM = 0xd02440;

const BUF_INSERT = 0x05e2a0;
const CREATE_NUM_EDIT_BUF = 0x096e09;

const FAKE_RET = 0x7fffff;
const ERR_CATCH_ADDR = 0x7ffffa;

const TOKEN_BUFFER_ADDR = 0xd00800;
const EDIT_BUF_START = 0xd00a00;
const EDIT_BUF_END = 0xd00b00;

const MEMINIT_BUDGET = 100000;
const PARSEINP_BUDGET = 50000;
const MAX_LOOP_ITER = 8192;

// "2+3\n" tokens
const INPUT_TOKENS = [0x32, 0x70, 0x33, 0x3f];
const EXPECTED = 5.0;
const TOLERANCE = 1e-6;

// ── Utilities ──────────────────────────────────────────────────────────────

const hex = (v, w = 6) =>
  v === undefined || v === null
    ? 'n/a'
    : `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;

const write24 = (m, a, v) => {
  m[a] = v & 0xff;
  m[a + 1] = (v >>> 8) & 0xff;
  m[a + 2] = (v >>> 16) & 0xff;
};

const read24 = (m, a) =>
  ((m[a] & 0xff) | ((m[a + 1] & 0xff) << 8) | ((m[a + 2] & 0xff) << 16)) >>> 0;

function hexBytes(m, a, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push((m[a + i] & 0xff).toString(16).toUpperCase().padStart(2, '0'));
  return out.join(' ');
}

function wrapMem(mem) {
  return {
    write8(addr, val) { mem[addr] = val & 0xff; },
    read8(addr) { return mem[addr] & 0xff; },
  };
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

function dumpEditPointers(mem, label) {
  console.log(`  ${label}:`);
  console.log(`    editTop    = ${hex(read24(mem, EDIT_TOP))}`);
  console.log(`    editCursor = ${hex(read24(mem, EDIT_CURSOR))}`);
  console.log(`    editTail   = ${hex(read24(mem, EDIT_TAIL))}`);
  console.log(`    editBtm    = ${hex(read24(mem, EDIT_BTM))}`);
}

/**
 * Run an OS routine, returning when it hits FAKE_RET sentinel.
 */
function callOsRoutine(executor, cpu, mem, entryAddr, label, budget = 10000) {
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  let returned = false;
  let steps = 0;
  const missingBlocks = new Set();

  try {
    executor.runFrom(entryAddr, 'adl', {
      maxSteps: budget,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        steps++;
        if ((pc & 0xffffff) === FAKE_RET) throw new Error('__RET__');
      },
      onMissingBlock(pc) {
        steps++;
        missingBlocks.add(pc & 0xffffff);
        if ((pc & 0xffffff) === FAKE_RET) throw new Error('__RET__');
      },
    });
  } catch (e) {
    if (e?.message === '__RET__') returned = true;
    else throw e;
  }

  const status = returned ? 'RETURNED' : `STALLED (pc=${hex(cpu.pc & 0xffffff)})`;
  console.log(`  ${label}: ${status}, steps=${steps}`);
  if (missingBlocks.size > 0) {
    console.log(`    Missing blocks: ${[...missingBlocks].sort((a, b) => a - b).map(hex).join(', ')}`);
  }

  return { returned, steps, missingBlocks };
}

/**
 * Run ParseInp with error handler frame. Returns { returned, errCaught, errNo, steps, op1Value }.
 */
function runParseInp(executor, cpu, mem, label, budget = PARSEINP_BUDGET) {
  // Clear OP1
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);

  prepareCallState(cpu, mem);

  // Set up error handler frame
  write24(mem, cpu.sp, FAKE_RET);
  const errFrameBase = (cpu.sp - 6) & 0xffffff;
  mem.fill(0x00, errFrameBase, errFrameBase + 6);
  write24(mem, errFrameBase + 3, ERR_CATCH_ADDR);
  write24(mem, ERR_SP_ADDR, errFrameBase);
  mem[ERR_NO_ADDR] = 0x00;

  let returned = false;
  let errCaught = false;
  let steps = 0;
  let finalPc = null;
  const missingBlocks = new Set();

  const notePc = (pc) => {
    const norm = pc & 0xffffff;
    finalPc = norm;
    steps++;
    if (norm === FAKE_RET) throw new Error('__RETURN__');
    if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
  };

  try {
    executor.runFrom(PARSEINP_ENTRY, 'adl', {
      maxSteps: budget,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) { notePc(pc); },
      onMissingBlock(pc) {
        missingBlocks.add(pc & 0xffffff);
        notePc(pc);
      },
    });
  } catch (e) {
    if (e?.message === '__RETURN__') returned = true;
    else if (e?.message === '__ERR__') errCaught = true;
    else throw e;
  }

  const errNo = mem[ERR_NO_ADDR] & 0xff;
  const op1Bytes = hexBytes(mem, OP1_ADDR, 9);
  let op1Value = NaN;
  try {
    op1Value = readReal(wrapMem(mem), OP1_ADDR);
  } catch (_) { /* ignore decode errors */ }

  const status = returned ? 'RETURNED' : errCaught ? `ERR_CAUGHT (errNo=${hex(errNo, 2)})` : `STALLED (pc=${hex(finalPc)})`;
  console.log(`  ${label}: ${status}, steps=${steps}`);
  console.log(`    OP1 = [${op1Bytes}] => ${op1Value}`);
  console.log(`    errNo = ${hex(errNo, 2)}`);
  if (missingBlocks.size > 0) {
    console.log(`    Missing blocks: ${[...missingBlocks].sort((a, b) => a - b).map(hex).join(', ')}`);
  }

  return { returned, errCaught, errNo, steps, op1Value, op1Bytes, missingBlocks, finalPc };
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 132: BufInsert (DE convention) + ParseInp from Edit Buffer ===');
  console.log('');

  // ── Boot + MEM_INIT ──

  const { mem, executor, cpu } = createRuntime();
  coldBoot(executor, cpu, mem);

  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  let meminitDone = false;
  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: MEMINIT_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__');
      },
      onMissingBlock(pc) {
        if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__');
      },
    });
  } catch (e) {
    if (e?.message === '__RET__') meminitDone = true;
    else throw e;
  }
  console.log(`MEM_INIT: ${meminitDone ? 'returned OK' : 'FAILED'}`);
  seedAllocator(mem);
  console.log('Allocator seeded.');
  console.log('');

  // Save a snapshot of RAM so we can reset for Test 3
  const ramSnapshot = new Uint8Array(mem.slice(0x400000));

  let totalPass = 0;
  let totalFail = 0;

  // ════════════════════════════════════════════════════════════════════════
  // Test 1: BufInsert correctness verification (DE convention)
  // ════════════════════════════════════════════════════════════════════════

  console.log('══════════════════════════════════════════════════════');
  console.log('Test 1: BufInsert correctness (token in DE register)');
  console.log('══════════════════════════════════════════════════════');
  console.log('');

  // Initialize gap-buffer pointers
  write24(mem, EDIT_TOP, EDIT_BUF_START);
  write24(mem, EDIT_CURSOR, EDIT_BUF_START);
  write24(mem, EDIT_TAIL, EDIT_BUF_END);
  write24(mem, EDIT_BTM, EDIT_BUF_END);

  // Clear buffer region
  mem.fill(0x00, EDIT_BUF_START, EDIT_BUF_END);

  dumpEditPointers(mem, 'Initial gap-buffer state');
  console.log('');

  let allInsertsOk = true;

  for (let i = 0; i < INPUT_TOKENS.length; i++) {
    const tok = INPUT_TOKENS[i];
    const prevCursor = read24(mem, EDIT_CURSOR);

    prepareCallState(cpu, mem);
    cpu.sp -= 3;
    write24(mem, cpu.sp, FAKE_RET);
    cpu._de = tok; // E = token byte, D = 0 (single-byte token)

    let returned = false;
    let steps = 0;
    const missing = new Set();
    try {
      executor.runFrom(BUF_INSERT, 'adl', {
        maxSteps: 10000,
        maxLoopIterations: MAX_LOOP_ITER,
        onBlock(pc) {
          steps++;
          if ((pc & 0xffffff) === FAKE_RET) throw new Error('__RET__');
        },
        onMissingBlock(pc) {
          steps++;
          missing.add(pc & 0xffffff);
          if ((pc & 0xffffff) === FAKE_RET) throw new Error('__RET__');
        },
      });
    } catch (e) {
      if (e?.message === '__RET__') returned = true;
      else throw e;
    }

    const newCursor = read24(mem, EDIT_CURSOR);
    const delta = newCursor - prevCursor;
    const status = returned ? 'OK' : `STALLED (pc=${hex(cpu.pc & 0xffffff)})`;

    console.log(`  BufInsert(0x${tok.toString(16).toUpperCase().padStart(2, '0')}): ${status}, steps=${steps}, cursor delta=${delta}`);
    if (missing.size > 0) {
      console.log(`    Missing blocks: ${[...missing].sort((a, b) => a - b).map(hex).join(', ')}`);
    }

    if (!returned || delta !== 1) allInsertsOk = false;
  }

  console.log('');
  dumpEditPointers(mem, 'After all 4 inserts');

  // Dump buffer contents
  const finalCursor = read24(mem, EDIT_CURSOR);
  const preGapLen = finalCursor - EDIT_BUF_START;
  console.log(`  Pre-gap bytes (${preGapLen}): ${hexBytes(mem, EDIT_BUF_START, Math.min(preGapLen, 16))}`);

  // Check if raw token bytes match expected
  const expectedBytes = INPUT_TOKENS;
  const foundBytes = [];
  for (let i = 0; i < preGapLen && i < 16; i++) foundBytes.push(mem[EDIT_BUF_START + i]);

  const bytesMatch = expectedBytes.length === foundBytes.length &&
    expectedBytes.every((b, i) => foundBytes[i] === b);
  console.log(`  Expected: ${expectedBytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}`);
  console.log(`  Found:    ${foundBytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}`);
  console.log(`  Bytes match: ${bytesMatch ? 'YES' : 'NO'}`);

  if (allInsertsOk && bytesMatch) {
    console.log('  >>> Test 1: PASS');
    totalPass++;
  } else {
    console.log(`  >>> Test 1: FAIL (inserts=${allInsertsOk}, bytes=${bytesMatch})`);
    totalFail++;
  }
  console.log('');

  // ════════════════════════════════════════════════════════════════════════
  // Test 2: ParseInp reading from edit buffer
  // ════════════════════════════════════════════════════════════════════════

  console.log('══════════════════════════════════════════════════════');
  console.log('Test 2: ParseInp from edit buffer (BufInsert-filled)');
  console.log('══════════════════════════════════════════════════════');
  console.log('');

  // Re-seed allocator since BufInsert calls may have modified pointers
  seedAllocator(mem);

  // Set parser pointers to read from the edit buffer
  write24(mem, BEGPC_ADDR, EDIT_BUF_START);
  write24(mem, CURPC_ADDR, EDIT_BUF_START);
  // endPC points at the last token (inclusive), which is preGapLen - 1 from start
  write24(mem, ENDPC_ADDR, EDIT_BUF_START + preGapLen - 1);

  console.log(`  begPC=${hex(read24(mem, BEGPC_ADDR))} curPC=${hex(read24(mem, CURPC_ADDR))} endPC=${hex(read24(mem, ENDPC_ADDR))}`);
  console.log(`  Buffer tokens: ${hexBytes(mem, EDIT_BUF_START, preGapLen)}`);

  const t2 = runParseInp(executor, cpu, mem, 'ParseInp (edit buffer)');

  const t2Pass = t2.returned && typeof t2.op1Value === 'number' &&
    Math.abs(t2.op1Value - EXPECTED) < TOLERANCE;
  if (t2Pass) {
    console.log(`  >>> Test 2: PASS (OP1=${t2.op1Value})`);
    totalPass++;
  } else {
    console.log(`  >>> Test 2: FAIL (returned=${t2.returned}, OP1=${t2.op1Value})`);
    totalFail++;
  }
  console.log('');

  // ════════════════════════════════════════════════════════════════════════
  // Test 3: Direct-token-at-RAM approach (control)
  // ════════════════════════════════════════════════════════════════════════

  console.log('══════════════════════════════════════════════════════');
  console.log('Test 3: ParseInp from direct token buffer (control)');
  console.log('══════════════════════════════════════════════════════');
  console.log('');

  // Restore RAM to post-MEM_INIT state for clean comparison
  mem.set(ramSnapshot, 0x400000);
  seedAllocator(mem);

  // Write tokens directly at 0xD00800
  mem.fill(0x00, TOKEN_BUFFER_ADDR, TOKEN_BUFFER_ADDR + 0x80);
  for (let i = 0; i < INPUT_TOKENS.length; i++) {
    mem[TOKEN_BUFFER_ADDR + i] = INPUT_TOKENS[i];
  }

  write24(mem, BEGPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, CURPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, ENDPC_ADDR, TOKEN_BUFFER_ADDR + INPUT_TOKENS.length - 1);

  console.log(`  begPC=${hex(read24(mem, BEGPC_ADDR))} curPC=${hex(read24(mem, CURPC_ADDR))} endPC=${hex(read24(mem, ENDPC_ADDR))}`);
  console.log(`  Buffer tokens: ${hexBytes(mem, TOKEN_BUFFER_ADDR, INPUT_TOKENS.length)}`);

  const t3 = runParseInp(executor, cpu, mem, 'ParseInp (direct buffer)');

  const t3Pass = t3.returned && typeof t3.op1Value === 'number' &&
    Math.abs(t3.op1Value - EXPECTED) < TOLERANCE;
  if (t3Pass) {
    console.log(`  >>> Test 3: PASS (OP1=${t3.op1Value})`);
    totalPass++;
  } else {
    console.log(`  >>> Test 3: FAIL (returned=${t3.returned}, OP1=${t3.op1Value})`);
    totalFail++;
  }

  // Compare Test 2 vs Test 3
  console.log('');
  console.log('  Comparison (edit buffer vs direct):');
  console.log(`    Steps: ${t2.steps} vs ${t3.steps}`);
  console.log(`    OP1:   ${t2.op1Value} vs ${t3.op1Value}`);
  console.log(`    errNo: ${hex(t2.errNo, 2)} vs ${hex(t3.errNo, 2)}`);
  const resultsMatch = t2Pass === t3Pass &&
    (t2Pass ? Math.abs(t2.op1Value - t3.op1Value) < TOLERANCE : true);
  console.log(`    Results match: ${resultsMatch ? 'YES' : 'NO'}`);
  console.log('');

  // ════════════════════════════════════════════════════════════════════════
  // Test 4: CreateNumEditBuf investigation
  // ════════════════════════════════════════════════════════════════════════

  console.log('══════════════════════════════════════════════════════');
  console.log('Test 4: CreateNumEditBuf investigation');
  console.log('══════════════════════════════════════════════════════');
  console.log('');

  // Restore RAM again
  mem.set(ramSnapshot, 0x400000);
  seedAllocator(mem);

  // Clear edit pointers to a known state
  write24(mem, EDIT_TOP, 0x000000);
  write24(mem, EDIT_CURSOR, 0x000000);
  write24(mem, EDIT_TAIL, 0x000000);
  write24(mem, EDIT_BTM, 0x000000);

  dumpEditPointers(mem, 'Before CreateNumEditBuf (zeroed)');
  console.log('');

  // Test 4a: Call CreateNumEditBuf with HL = buffer address
  console.log('  Test 4a: CreateNumEditBuf with HL=0xD00A00');
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);
  cpu._hl = EDIT_BUF_START;

  let t4aReturned = false;
  let t4aSteps = 0;
  const t4aMissing = new Set();
  try {
    executor.runFrom(CREATE_NUM_EDIT_BUF, 'adl', {
      maxSteps: 10000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        t4aSteps++;
        if ((pc & 0xffffff) === FAKE_RET) throw new Error('__RET__');
      },
      onMissingBlock(pc) {
        t4aSteps++;
        t4aMissing.add(pc & 0xffffff);
        if ((pc & 0xffffff) === FAKE_RET) throw new Error('__RET__');
      },
    });
  } catch (e) {
    if (e?.message === '__RET__') t4aReturned = true;
    else throw e;
  }

  const t4aStatus = t4aReturned ? 'RETURNED' : `STALLED (pc=${hex(cpu.pc & 0xffffff)})`;
  console.log(`    ${t4aStatus}, steps=${t4aSteps}`);
  if (t4aMissing.size > 0) {
    console.log(`    Missing blocks: ${[...t4aMissing].sort((a, b) => a - b).map(hex).join(', ')}`);
  }
  dumpEditPointers(mem, 'After CreateNumEditBuf (HL=0xD00A00)');
  console.log('');

  // Test 4b: Call CreateNumEditBuf with HL = 0x100 (size value)
  console.log('  Test 4b: CreateNumEditBuf with HL=0x100 (size)');
  // Reset pointers
  write24(mem, EDIT_TOP, 0x000000);
  write24(mem, EDIT_CURSOR, 0x000000);
  write24(mem, EDIT_TAIL, 0x000000);
  write24(mem, EDIT_BTM, 0x000000);

  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);
  cpu._hl = 0x100;

  let t4bReturned = false;
  let t4bSteps = 0;
  const t4bMissing = new Set();
  try {
    executor.runFrom(CREATE_NUM_EDIT_BUF, 'adl', {
      maxSteps: 10000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        t4bSteps++;
        if ((pc & 0xffffff) === FAKE_RET) throw new Error('__RET__');
      },
      onMissingBlock(pc) {
        t4bSteps++;
        t4bMissing.add(pc & 0xffffff);
        if ((pc & 0xffffff) === FAKE_RET) throw new Error('__RET__');
      },
    });
  } catch (e) {
    if (e?.message === '__RET__') t4bReturned = true;
    else throw e;
  }

  const t4bStatus = t4bReturned ? 'RETURNED' : `STALLED (pc=${hex(cpu.pc & 0xffffff)})`;
  console.log(`    ${t4bStatus}, steps=${t4bSteps}`);
  if (t4bMissing.size > 0) {
    console.log(`    Missing blocks: ${[...t4bMissing].sort((a, b) => a - b).map(hex).join(', ')}`);
  }
  dumpEditPointers(mem, 'After CreateNumEditBuf (HL=0x100)');

  // Dump some nearby RAM to see if CreateNumEditBuf wrote anything interesting
  console.log('');
  console.log('  RAM near edit pointers after Test 4b:');
  console.log(`    0xD02430..0xD02450: ${hexBytes(mem, 0xd02430, 32)}`);
  console.log('');

  // Test 4c: Call with DE = buffer address (some OS routines use DE)
  console.log('  Test 4c: CreateNumEditBuf with DE=0xD00A00, HL=0x100');
  write24(mem, EDIT_TOP, 0x000000);
  write24(mem, EDIT_CURSOR, 0x000000);
  write24(mem, EDIT_TAIL, 0x000000);
  write24(mem, EDIT_BTM, 0x000000);

  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);
  cpu._hl = 0x100;
  cpu._de = EDIT_BUF_START;

  let t4cReturned = false;
  let t4cSteps = 0;
  const t4cMissing = new Set();
  try {
    executor.runFrom(CREATE_NUM_EDIT_BUF, 'adl', {
      maxSteps: 10000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        t4cSteps++;
        if ((pc & 0xffffff) === FAKE_RET) throw new Error('__RET__');
      },
      onMissingBlock(pc) {
        t4cSteps++;
        t4cMissing.add(pc & 0xffffff);
        if ((pc & 0xffffff) === FAKE_RET) throw new Error('__RET__');
      },
    });
  } catch (e) {
    if (e?.message === '__RET__') t4cReturned = true;
    else throw e;
  }

  const t4cStatus = t4cReturned ? 'RETURNED' : `STALLED (pc=${hex(cpu.pc & 0xffffff)})`;
  console.log(`    ${t4cStatus}, steps=${t4cSteps}`);
  if (t4cMissing.size > 0) {
    console.log(`    Missing blocks: ${[...t4cMissing].sort((a, b) => a - b).map(hex).join(', ')}`);
  }
  dumpEditPointers(mem, 'After CreateNumEditBuf (DE=buf, HL=0x100)');
  console.log('');

  // ════════════════════════════════════════════════════════════════════════
  // Summary
  // ════════════════════════════════════════════════════════════════════════

  console.log('══════════════════════════════════════════════════════');
  console.log('Summary');
  console.log('══════════════════════════════════════════════════════');
  console.log('');
  console.log(`  Test 1 (BufInsert DE convention): ${allInsertsOk && bytesMatch ? 'PASS' : 'FAIL'}`);
  console.log(`  Test 2 (ParseInp from edit buf):  ${t2Pass ? 'PASS' : 'FAIL'} (OP1=${t2.op1Value}, steps=${t2.steps})`);
  console.log(`  Test 3 (ParseInp direct control): ${t3Pass ? 'PASS' : 'FAIL'} (OP1=${t3.op1Value}, steps=${t3.steps})`);
  console.log(`  Test 4 (CreateNumEditBuf):        ${t4aReturned ? 'returned' : 'stalled'} / ${t4bReturned ? 'returned' : 'stalled'} / ${t4cReturned ? 'returned' : 'stalled'}`);
  console.log(`  Results match (T2 vs T3):         ${resultsMatch ? 'YES' : 'NO'}`);
  console.log('');
  console.log(`  Total: ${totalPass} PASS, ${totalFail} FAIL`);
  console.log('');

  if (totalFail > 0) process.exitCode = 1;
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
