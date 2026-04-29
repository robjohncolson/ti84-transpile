#!/usr/bin/env node

/**
 * Phase 130 — Edit Buffer Integration: CreateNumEditBuf + Direct BufInsert
 *
 * 1. Call CreateNumEditBuf (0x096E09) to init the gap buffer, dump all 6 pointers
 * 2. Call BufInsert (0x05E2A0) with tokens 0x32 ('2'), 0x70 ('+'), 0x33 ('3')
 * 3. Test BufClr (0x0ADAC3) — verify it resets editCursor to editTop
 * 4. Fallback: manually seed buffer if CreateNumEditBuf fails
 * 5. Test ParseInp reading from the real edit buffer
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
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

const USERMEM_ADDR = 0xd1a881;
const EMPTY_VAT_ADDR = 0xd3ffff;
const OP1_ADDR = 0xd005f8;

const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const FAKE_RET = 0x7ffffe;

// Edit buffer addresses
const EDIT_TOP      = 0xd02437;
const EDIT_CURSOR   = 0xd0243a;
const EDIT_TAIL     = 0xd0243d;
const EDIT_BTM      = 0xd02440;
const EDIT_SYM      = 0xd0244e;
const EDIT_DAT      = 0xd02451;

// OS routine real targets (resolved from jump table in session 129)
const CREATE_NUM_EDIT_BUF = 0x096e09;
const BUF_INSERT           = 0x05e2a0;
const BUF_CLR              = 0x0adac3;

// Parser pointers
const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;

// ParseInp entry
const PARSEINP_ENTRY = 0x099914;

const MEMINIT_BUDGET = 100000;
const MAX_LOOP_ITER = 8192;

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
  console.log(`    editSym    = ${hex(read24(mem, EDIT_SYM))}`);
  console.log(`    editDat    = ${hex(read24(mem, EDIT_DAT))}`);
}

/**
 * Call an OS routine. Returns { returned, steps, missingBlocks }.
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

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 130: Edit Buffer Integration ===');
  console.log('');

  // ── Boot + MEM_INIT ──

  const { mem, executor, cpu } = createRuntime();
  coldBoot(executor, cpu, mem);

  // Run MEM_INIT
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

  dumpEditPointers(mem, 'Edit buffer pointers BEFORE CreateNumEditBuf');
  console.log('');

  // ── Task 1: CreateNumEditBuf (0x096E09) ──

  console.log('--- Task 1: CreateNumEditBuf (0x096E09) ---');
  console.log('');

  // Disassemble first 64 bytes of CreateNumEditBuf
  console.log('  Disassembly of CreateNumEditBuf:');
  const cnebDisasm = disassembleRange(CREATE_NUM_EDIT_BUF, CREATE_NUM_EDIT_BUF + 64);
  for (const line of cnebDisasm) console.log(line);
  console.log('');

  const task1 = callOsRoutine(executor, cpu, mem, CREATE_NUM_EDIT_BUF, 'CreateNumEditBuf', 10000);

  dumpEditPointers(mem, 'Edit buffer pointers AFTER CreateNumEditBuf');
  console.log('');

  const createBufOk = task1.returned;
  let editTopVal = read24(mem, EDIT_TOP);
  let editCursorVal = read24(mem, EDIT_CURSOR);
  let editTailVal = read24(mem, EDIT_TAIL);
  let editBtmVal = read24(mem, EDIT_BTM);
  const createBufInitialized = (editTopVal !== 0 && editBtmVal !== 0 && editTopVal < MEM_SIZE && editBtmVal < MEM_SIZE);

  if (createBufInitialized) {
    console.log(`  Buffer region: ${hex(editTopVal)} to ${hex(editBtmVal)} (${editBtmVal - editTopVal} bytes)`);
    console.log(`  Gap: ${hex(editCursorVal)} to ${hex(editTailVal)} (${editTailVal - editCursorVal} bytes)`);
    console.log(`  First 32 bytes of buffer: ${hexBytes(mem, editTopVal, Math.min(32, editBtmVal - editTopVal))}`);
  } else {
    console.log('  CreateNumEditBuf did NOT initialize pointers. Checking if it stalled...');
  }
  console.log('');

  // ── Task 4 (fallback): Manual buffer init if CreateNumEditBuf failed ──

  let useManualBuffer = false;
  const MANUAL_BUF_START = 0xd00a00;
  const MANUAL_BUF_END   = 0xd00aff;

  if (!createBufInitialized) {
    console.log('--- Task 4 (fallback): Manual Gap Buffer Initialization ---');
    console.log('');

    // Seed the gap buffer pointers manually
    write24(mem, EDIT_TOP,    MANUAL_BUF_START);
    write24(mem, EDIT_CURSOR, MANUAL_BUF_START); // empty: cursor at top
    write24(mem, EDIT_TAIL,   MANUAL_BUF_END);   // gap fills entire buffer
    write24(mem, EDIT_BTM,    MANUAL_BUF_END);

    // Clear the buffer region
    mem.fill(0x00, MANUAL_BUF_START, MANUAL_BUF_END + 1);

    dumpEditPointers(mem, 'Edit buffer pointers AFTER manual init');
    console.log('');

    editTopVal = read24(mem, EDIT_TOP);
    editCursorVal = read24(mem, EDIT_CURSOR);
    editTailVal = read24(mem, EDIT_TAIL);
    editBtmVal = read24(mem, EDIT_BTM);
    useManualBuffer = true;
  }

  // ── Task 2: BufInsert tokens ──

  console.log('--- Task 2: BufInsert tokens (0x32="2", 0x70="+", 0x33="3") ---');
  console.log('');

  // Disassemble first 64 bytes of BufInsert
  console.log('  Disassembly of BufInsert:');
  const biDisasm = disassembleRange(BUF_INSERT, BUF_INSERT + 64);
  for (const line of biDisasm) console.log(line);
  console.log('');

  const tokens = [
    { byte: 0x32, label: '0x32 (digit "2")' },
    { byte: 0x70, label: '0x70 ("+")' },
    { byte: 0x33, label: '0x33 (digit "3")' },
  ];

  let allInsertsOk = true;

  for (const tok of tokens) {
    const prevCursor = read24(mem, EDIT_CURSOR);

    // Set token in C register (BC low byte)
    prepareCallState(cpu, mem);
    cpu.sp -= 3;
    write24(mem, cpu.sp, FAKE_RET);
    cpu._bc = tok.byte; // C = token byte

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
    const cursorAdvanced = newCursor > prevCursor;
    const status = returned ? 'RETURNED' : `STALLED (pc=${hex(cpu.pc & 0xffffff)})`;

    console.log(`  BufInsert(${tok.label}): ${status}, steps=${steps}`);
    console.log(`    editCursor: ${hex(prevCursor)} -> ${hex(newCursor)} (${cursorAdvanced ? 'ADVANCED' : 'NO CHANGE'})`);
    if (missing.size > 0) {
      console.log(`    Missing blocks: ${[...missing].sort((a, b) => a - b).map(hex).join(', ')}`);
    }

    if (!returned) allInsertsOk = false;
  }

  console.log('');

  // Dump buffer state after all inserts
  dumpEditPointers(mem, 'Edit buffer pointers AFTER all inserts');

  editTopVal = read24(mem, EDIT_TOP);
  editCursorVal = read24(mem, EDIT_CURSOR);
  editTailVal = read24(mem, EDIT_TAIL);
  editBtmVal = read24(mem, EDIT_BTM);

  if (editTopVal > 0 && editTopVal < MEM_SIZE && editCursorVal > editTopVal) {
    const preGapLen = editCursorVal - editTopVal;
    console.log(`  Pre-gap data (${preGapLen} bytes): ${hexBytes(mem, editTopVal, Math.min(preGapLen, 32))}`);

    // Check for expected tokens
    const expected = [0x32, 0x70, 0x33];
    const found = [];
    for (let i = 0; i < preGapLen && i < 16; i++) {
      found.push(mem[editTopVal + i]);
    }
    console.log(`  Expected token sequence: ${expected.map(b => hex(b, 2)).join(' ')}`);
    console.log(`  Found bytes:             ${found.map(b => hex(b, 2)).join(' ')}`);
    const match = expected.every((b, i) => found[i] === b);
    console.log(`  Token match: ${match ? 'YES — "2+3" in buffer!' : 'NO'}`);
  }

  if (editTailVal > 0 && editBtmVal > editTailVal) {
    const postGapLen = editBtmVal - editTailVal;
    console.log(`  Post-gap data (${postGapLen} bytes): ${hexBytes(mem, editTailVal, Math.min(postGapLen, 32))}`);
  }
  console.log('');

  // ── Task 3: BufClr ──

  console.log('--- Task 3: BufClr (0x0ADAC3) ---');
  console.log('');

  const preClearCursor = read24(mem, EDIT_CURSOR);
  const preClearTop = read24(mem, EDIT_TOP);
  console.log(`  Before BufClr: editTop=${hex(preClearTop)}, editCursor=${hex(preClearCursor)}`);

  const task3 = callOsRoutine(executor, cpu, mem, BUF_CLR, 'BufClr', 10000);

  const postClearCursor = read24(mem, EDIT_CURSOR);
  const postClearTop = read24(mem, EDIT_TOP);
  console.log(`  After BufClr:  editTop=${hex(postClearTop)}, editCursor=${hex(postClearCursor)}`);
  const cursorReset = (postClearCursor === postClearTop);
  console.log(`  editCursor == editTop? ${cursorReset ? 'YES — buffer cleared!' : 'NO'}`);
  dumpEditPointers(mem, 'Edit buffer pointers AFTER BufClr');
  console.log('');

  // ── Task 5: ParseInp from edit buffer ──

  console.log('--- Task 5: ParseInp reading from edit buffer ---');
  console.log('');

  // Re-insert "2+3" into the buffer for ParseInp test
  if (allInsertsOk) {
    console.log('  Re-inserting "2+3" tokens into buffer...');

    // First clear
    if (task3.returned) {
      callOsRoutine(executor, cpu, mem, BUF_CLR, 'BufClr (pre-ParseInp)', 10000);
    } else {
      // Manual clear
      write24(mem, EDIT_CURSOR, read24(mem, EDIT_TOP));
    }

    for (const tok of tokens) {
      prepareCallState(cpu, mem);
      cpu.sp -= 3;
      write24(mem, cpu.sp, FAKE_RET);
      cpu._bc = tok.byte;

      try {
        executor.runFrom(BUF_INSERT, 'adl', {
          maxSteps: 10000,
          maxLoopIterations: MAX_LOOP_ITER,
          onBlock(pc) {
            if ((pc & 0xffffff) === FAKE_RET) throw new Error('__RET__');
          },
          onMissingBlock(pc) {
            if ((pc & 0xffffff) === FAKE_RET) throw new Error('__RET__');
          },
        });
      } catch (e) {
        if (e?.message !== '__RET__') throw e;
      }
    }

    const reEditTop = read24(mem, EDIT_TOP);
    const reEditCursor = read24(mem, EDIT_CURSOR);
    console.log(`  After re-insert: editTop=${hex(reEditTop)}, editCursor=${hex(reEditCursor)}`);
    const preGap = reEditCursor - reEditTop;
    if (preGap > 0) {
      console.log(`  Buffer contents: ${hexBytes(mem, reEditTop, Math.min(preGap, 16))}`);
    }
    console.log('');

    // Set parser pointers to read from the edit buffer's pre-gap region
    // begPC and curPC point to editTop, endPC points to editCursor
    // Also need to append end token 0x3F at editCursor position for ParseInp
    console.log('  Setting up ParseInp to read from edit buffer...');

    // Write end-of-expression token (0x3F = tEnter) at the cursor position
    // so ParseInp knows where the expression ends
    mem[reEditCursor] = 0x3f;

    write24(mem, BEGPC_ADDR, reEditTop);
    write24(mem, CURPC_ADDR, reEditTop);
    write24(mem, ENDPC_ADDR, reEditCursor + 1); // past the 0x3F sentinel

    console.log(`  begPC = ${hex(reEditTop)}`);
    console.log(`  curPC = ${hex(reEditTop)}`);
    console.log(`  endPC = ${hex(reEditCursor + 1)}`);
    console.log(`  Token stream: ${hexBytes(mem, reEditTop, preGap + 1)}`);
    console.log('');

    // Re-seed allocator (ParseInp corrupts OPS)
    seedAllocator(mem);

    // Clear OP1
    mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);

    // Set up error frame (same as session 84 pattern)
    prepareCallState(cpu, mem);
    cpu.sp -= 3;
    write24(mem, cpu.sp, FAKE_RET);

    // Push error handler frame
    const errSP_ADDR = 0xd02597; // errSP from ti84pceg.inc — actually 0xD025A3
    // Actually errSP is at IY+0x00 offset area... let me use the known working pattern
    // from the probes: just push FAKE_RET and set errSP to SP
    // The known pattern from session 84: push error frame, set (iy+0) related flag
    // Simplest: just call ParseInp directly with FAKE_RET on stack

    let parseReturned = false;
    let parseSteps = 0;
    const parseMissing = new Set();

    try {
      executor.runFrom(PARSEINP_ENTRY, 'adl', {
        maxSteps: 50000,
        maxLoopIterations: MAX_LOOP_ITER,
        onBlock(pc) {
          parseSteps++;
          if ((pc & 0xffffff) === FAKE_RET) throw new Error('__RET__');
        },
        onMissingBlock(pc) {
          parseSteps++;
          parseMissing.add(pc & 0xffffff);
          if ((pc & 0xffffff) === FAKE_RET) throw new Error('__RET__');
        },
      });
    } catch (e) {
      if (e?.message === '__RET__') parseReturned = true;
      else throw e;
    }

    console.log(`  ParseInp: ${parseReturned ? 'RETURNED' : `STALLED (pc=${hex(cpu.pc & 0xffffff)})`}, steps=${parseSteps}`);
    if (parseMissing.size > 0) {
      console.log(`    Missing blocks: ${[...parseMissing].sort((a, b) => a - b).map(hex).join(', ')}`);
    }

    // Read OP1 result
    const op1 = [];
    for (let i = 0; i < 9; i++) op1.push(mem[OP1_ADDR + i]);
    console.log(`  OP1 after ParseInp: ${op1.map(b => hex(b, 2)).join(' ')}`);

    // Decode BCD if it looks like a real number
    if (op1[0] === 0x00 && op1[1] !== 0x00) {
      const exp = ((op1[1] & 0x7f) - 0x80);
      let mantissa = '';
      for (let i = 2; i < 9; i++) {
        mantissa += ((op1[i] >> 4) & 0xf).toString();
        mantissa += (op1[i] & 0xf).toString();
      }
      const sign = (op1[1] & 0x80) ? -1 : 1;
      const value = sign * parseFloat(mantissa[0] + '.' + mantissa.slice(1)) * Math.pow(10, exp);
      console.log(`  Decoded OP1: ${value}`);
    }

    // Check curPC advancement
    const postCurPC = read24(mem, CURPC_ADDR);
    console.log(`  curPC after ParseInp: ${hex(postCurPC)} (started at ${hex(reEditTop)})`);
    console.log('');
  } else {
    console.log('  SKIPPED — BufInsert failed, cannot test ParseInp from edit buffer.');
    console.log('');

    // Try ParseInp with manually-seeded tokens in the buffer region anyway
    if (useManualBuffer) {
      console.log('  Attempting ParseInp with manually-seeded tokens in manual buffer region...');

      // Write "2+3" + end token directly into the manual buffer
      mem[MANUAL_BUF_START] = 0x32; // '2'
      mem[MANUAL_BUF_START + 1] = 0x70; // '+'
      mem[MANUAL_BUF_START + 2] = 0x33; // '3'
      mem[MANUAL_BUF_START + 3] = 0x3f; // end token

      write24(mem, BEGPC_ADDR, MANUAL_BUF_START);
      write24(mem, CURPC_ADDR, MANUAL_BUF_START);
      write24(mem, ENDPC_ADDR, MANUAL_BUF_START + 4);

      console.log(`  begPC = ${hex(MANUAL_BUF_START)}`);
      console.log(`  curPC = ${hex(MANUAL_BUF_START)}`);
      console.log(`  endPC = ${hex(MANUAL_BUF_START + 4)}`);
      console.log(`  Token stream: ${hexBytes(mem, MANUAL_BUF_START, 4)}`);

      seedAllocator(mem);
      mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);

      prepareCallState(cpu, mem);
      cpu.sp -= 3;
      write24(mem, cpu.sp, FAKE_RET);

      let parseReturned = false;
      let parseSteps = 0;

      try {
        executor.runFrom(PARSEINP_ENTRY, 'adl', {
          maxSteps: 50000,
          maxLoopIterations: MAX_LOOP_ITER,
          onBlock(pc) {
            parseSteps++;
            if ((pc & 0xffffff) === FAKE_RET) throw new Error('__RET__');
          },
          onMissingBlock(pc) {
            parseSteps++;
            if ((pc & 0xffffff) === FAKE_RET) throw new Error('__RET__');
          },
        });
      } catch (e) {
        if (e?.message === '__RET__') parseReturned = true;
        else throw e;
      }

      console.log(`  ParseInp: ${parseReturned ? 'RETURNED' : `STALLED (pc=${hex(cpu.pc & 0xffffff)})`}, steps=${parseSteps}`);

      const op1 = [];
      for (let i = 0; i < 9; i++) op1.push(mem[OP1_ADDR + i]);
      console.log(`  OP1 after ParseInp: ${op1.map(b => hex(b, 2)).join(' ')}`);

      if (op1[0] === 0x00 && op1[1] !== 0x00) {
        const exp = ((op1[1] & 0x7f) - 0x80);
        let mantissa = '';
        for (let i = 2; i < 9; i++) {
          mantissa += ((op1[i] >> 4) & 0xf).toString();
          mantissa += (op1[i] & 0xf).toString();
        }
        const sign = (op1[1] & 0x80) ? -1 : 1;
        const value = sign * parseFloat(mantissa[0] + '.' + mantissa.slice(1)) * Math.pow(10, exp);
        console.log(`  Decoded OP1: ${value}`);
      }
      console.log('');
    }
  }

  // ── Summary ──

  console.log('=== Summary ===');
  console.log('');
  console.log(`  CreateNumEditBuf: ${createBufOk ? 'RETURNED' : 'FAILED/STALLED'}${createBufInitialized ? ', pointers initialized' : ', pointers NOT initialized'}`);
  console.log(`  Manual buffer fallback: ${useManualBuffer ? 'USED' : 'not needed'}`);
  console.log(`  BufInsert: ${allInsertsOk ? 'ALL 3 RETURNED' : 'FAILED/STALLED'}`);
  console.log(`  BufClr: ${task3.returned ? 'RETURNED' : 'FAILED/STALLED'}, cursor reset: ${cursorReset ? 'YES' : 'NO'}`);
  console.log('');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
