#!/usr/bin/env node

/**
 * Phase 131 — Edit Buffer Disassembly Deep Dive
 *
 * Part A: Disassemble room-check subroutine at 0x05E3D6
 * Part B: Deep disassemble CreateNumEditBuf at 0x096E09
 * Part C: Disassemble BufInsert at 0x05E2A0
 * Part D: Test with correctly initialized buffer
 * Part E: Key-to-token conversion investigation
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

// OS routine addresses
const CREATE_NUM_EDIT_BUF = 0x096e09;
const BUF_INSERT           = 0x05e2a0;
const BUF_CLR              = 0x0adac3;

// Room-check subroutine
const ROOM_CHECK           = 0x05e3d6;

// Key-to-token table search
const SCAN_TO_KEY_TABLE    = 0x09f79b;

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

function disassembleRange(startAddr, count) {
  let pc = startAddr;
  const lines = [];
  let instrCount = 0;
  while (instrCount < count) {
    try {
      const instr = decodeEz80(romBytes, pc, true);
      const bytes = hexBytes(romBytes, pc, instr.length);
      const mnem = instr.mnemonic || instr.tag || '???';
      lines.push(`  ${hex(pc)}: ${bytes.padEnd(24)} ${mnem}`);
      pc += instr.length;
      instrCount++;
      // Stop at RET (but still include it)
      if (mnem === 'ret' || mnem === 'RET') break;
    } catch (e) {
      lines.push(`  ${hex(pc)}: ${hexBytes(romBytes, pc, 1).padEnd(24)} ??? (decode error: ${e.message})`);
      pc += 1;
      instrCount++;
    }
  }
  return { lines, endPc: pc };
}

function disassembleUntilRet(startAddr, maxInstr = 80) {
  let pc = startAddr;
  const lines = [];
  let instrCount = 0;
  while (instrCount < maxInstr) {
    try {
      const instr = decodeEz80(romBytes, pc, true);
      const bytes = hexBytes(romBytes, pc, instr.length);
      const mnem = instr.mnemonic || instr.tag || '???';
      lines.push(`  ${hex(pc)}: ${bytes.padEnd(24)} ${mnem}`);
      pc += instr.length;
      instrCount++;
      if (mnem === 'ret') break;
    } catch (e) {
      lines.push(`  ${hex(pc)}: ${hexBytes(romBytes, pc, 1).padEnd(24)} ??? (decode error: ${e.message})`);
      pc += 1;
      instrCount++;
    }
  }
  return { lines, endPc: pc, instrCount };
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
  console.log('=== Phase 131: Edit Buffer Disassembly Deep Dive ===');
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

  // ════════════════════════════════════════════════════════════════════════
  // Part A: Disassemble room-check subroutine at 0x05E3D6
  // ════════════════════════════════════════════════════════════════════════

  console.log('══════════════════════════════════════════════════════');
  console.log('Part A: Room-check subroutine at 0x05E3D6');
  console.log('══════════════════════════════════════════════════════');
  console.log('');

  const roomCheckDisasm = disassembleUntilRet(ROOM_CHECK, 60);
  console.log('  Disassembly:');
  for (const line of roomCheckDisasm.lines) console.log(line);
  console.log(`  (${roomCheckDisasm.instrCount} instructions, ended at ${hex(roomCheckDisasm.endPc)})`);
  console.log('');

  // Check for references to edit buffer addresses in nearby ROM
  console.log('  Scanning for edit buffer address references near room-check...');
  const editAddrs = [
    { addr: EDIT_TOP, name: 'editTop' },
    { addr: EDIT_CURSOR, name: 'editCursor' },
    { addr: EDIT_TAIL, name: 'editTail' },
    { addr: EDIT_BTM, name: 'editBtm' },
  ];
  for (const { addr, name } of editAddrs) {
    const lo = addr & 0xff;
    const mid = (addr >>> 8) & 0xff;
    const hi = (addr >>> 16) & 0xff;
    // Scan ROM region around room-check for 3-byte LE address references
    for (let scan = ROOM_CHECK - 0x100; scan < roomCheckDisasm.endPc + 0x100; scan++) {
      if (romBytes[scan] === lo && romBytes[scan + 1] === mid && romBytes[scan + 2] === hi) {
        console.log(`    Found ${name} (${hex(addr)}) reference at ROM offset ${hex(scan)}`);
      }
    }
  }
  console.log('');

  // ════════════════════════════════════════════════════════════════════════
  // Part B: Deep disassemble CreateNumEditBuf at 0x096E09
  // ════════════════════════════════════════════════════════════════════════

  console.log('══════════════════════════════════════════════════════');
  console.log('Part B: CreateNumEditBuf at 0x096E09');
  console.log('══════════════════════════════════════════════════════');
  console.log('');

  const cnebDisasm = disassembleRange(CREATE_NUM_EDIT_BUF, 80);
  console.log('  Disassembly (first 80 instructions or until RET):');
  for (const line of cnebDisasm.lines) console.log(line);
  console.log('');

  // Look for CALL instructions in the disassembly to trace subroutine calls
  console.log('  Subroutine calls found in CreateNumEditBuf:');
  {
    let pc = CREATE_NUM_EDIT_BUF;
    let count = 0;
    while (count < 80) {
      try {
        const instr = decodeEz80(romBytes, pc, true);
        const mnem = instr.mnemonic || instr.tag || '';
        if (mnem.startsWith('call ') || mnem.startsWith('CALL ')) {
          console.log(`    ${hex(pc)}: ${mnem}`);
          // Try to disassemble the target too
          const targetMatch = mnem.match(/0x([0-9a-fA-F]+)/);
          if (targetMatch) {
            const target = parseInt(targetMatch[1], 16);
            if (target < 0x400000) {
              const subDisasm = disassembleRange(target, 10);
              console.log(`      -> First 10 instructions of target ${hex(target)}:`);
              for (const sl of subDisasm.lines) console.log(`      ${sl}`);
            }
          }
        }
        pc += instr.length;
        count++;
        if (mnem === 'ret') break;
      } catch (e) {
        pc++;
        count++;
      }
    }
  }
  console.log('');

  // Scan CreateNumEditBuf for edit buffer address references
  console.log('  Scanning CreateNumEditBuf for edit buffer address references...');
  for (const { addr, name } of editAddrs) {
    const lo = addr & 0xff;
    const mid = (addr >>> 8) & 0xff;
    const hi = (addr >>> 16) & 0xff;
    for (let scan = CREATE_NUM_EDIT_BUF; scan < CREATE_NUM_EDIT_BUF + 0x200; scan++) {
      if (romBytes[scan] === lo && romBytes[scan + 1] === mid && romBytes[scan + 2] === hi) {
        console.log(`    Found ${name} (${hex(addr)}) reference at ROM offset ${hex(scan)}`);
      }
    }
  }
  console.log('');

  // ════════════════════════════════════════════════════════════════════════
  // Part C: Disassemble BufInsert at 0x05E2A0
  // ════════════════════════════════════════════════════════════════════════

  console.log('══════════════════════════════════════════════════════');
  console.log('Part C: BufInsert at 0x05E2A0');
  console.log('══════════════════════════════════════════════════════');
  console.log('');

  const biDisasm = disassembleUntilRet(BUF_INSERT, 60);
  console.log('  Disassembly:');
  for (const line of biDisasm.lines) console.log(line);
  console.log(`  (${biDisasm.instrCount} instructions, ended at ${hex(biDisasm.endPc)})`);
  console.log('');

  // Scan BufInsert for edit buffer address references
  console.log('  Scanning BufInsert for edit buffer address references...');
  for (const { addr, name } of editAddrs) {
    const lo = addr & 0xff;
    const mid = (addr >>> 8) & 0xff;
    const hi = (addr >>> 16) & 0xff;
    for (let scan = BUF_INSERT; scan < biDisasm.endPc + 0x40; scan++) {
      if (romBytes[scan] === lo && romBytes[scan + 1] === mid && romBytes[scan + 2] === hi) {
        console.log(`    Found ${name} (${hex(addr)}) reference at ROM offset ${hex(scan)}`);
      }
    }
  }
  console.log('');

  // Also disassemble what's between BufInsert end and room-check
  if (biDisasm.endPc < ROOM_CHECK) {
    console.log(`  Code between BufInsert end (${hex(biDisasm.endPc)}) and room-check (${hex(ROOM_CHECK)}):`);
    const gapDisasm = disassembleRange(biDisasm.endPc, 40);
    for (const line of gapDisasm.lines) console.log(line);
    console.log('');
  }

  // ════════════════════════════════════════════════════════════════════════
  // Part D: Test with correctly initialized buffer
  // ════════════════════════════════════════════════════════════════════════

  console.log('══════════════════════════════════════════════════════');
  console.log('Part D: Correctly initialized buffer test');
  console.log('══════════════════════════════════════════════════════');
  console.log('');

  const MANUAL_BUF_START = 0xd00a00;
  const MANUAL_BUF_SIZE  = 256;
  const MANUAL_BUF_END   = MANUAL_BUF_START + MANUAL_BUF_SIZE;

  // Initialize gap buffer: empty buffer with full gap
  write24(mem, EDIT_TOP,    MANUAL_BUF_START);
  write24(mem, EDIT_CURSOR, MANUAL_BUF_START);  // cursor at top = empty pre-gap
  write24(mem, EDIT_TAIL,   MANUAL_BUF_END);    // tail at end = full gap
  write24(mem, EDIT_BTM,    MANUAL_BUF_END);    // bottom at end

  // Clear buffer region
  mem.fill(0x00, MANUAL_BUF_START, MANUAL_BUF_END);

  dumpEditPointers(mem, 'After manual gap-buffer init');
  console.log('');

  // BufInsert calling convention discovery:
  // Disassembly shows: PUSH DE, CALL room-check, POP BC, LD A,B, OR A, ...
  // The POP BC overwrites whatever was in BC. The token comes from the OLD DE value.
  // So: token byte goes in E register, two-byte flag in D register.
  // For single-byte tokens: D=0, E=token byte.

  console.log('  NOTE: BufInsert uses DE for token (not BC as previously assumed)');
  console.log('    PUSH DE saves token, CALL room-check, POP BC recovers it');
  console.log('    B = two-byte flag (old D), C = token byte (old E)');
  console.log('');

  const tokens = [
    { byte: 0x32, label: '0x32 (digit "2")' },
    { byte: 0x70, label: '0x70 ("+")' },
    { byte: 0x33, label: '0x33 (digit "3")' },
  ];

  let allInsertsOk = true;

  for (const tok of tokens) {
    const prevCursor = read24(mem, EDIT_CURSOR);
    const prevTail   = read24(mem, EDIT_TAIL);

    prepareCallState(cpu, mem);
    cpu.sp -= 3;
    write24(mem, cpu.sp, FAKE_RET);
    cpu._de = tok.byte;  // E = token byte, D = 0 (single-byte token)

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
    const newTail   = read24(mem, EDIT_TAIL);
    const status = returned ? 'RETURNED' : `STALLED (pc=${hex(cpu.pc & 0xffffff)})`;

    console.log(`  BufInsert(${tok.label}): ${status}, steps=${steps}`);
    console.log(`    editCursor: ${hex(prevCursor)} -> ${hex(newCursor)} (delta=${newCursor - prevCursor})`);
    console.log(`    editTail:   ${hex(prevTail)} -> ${hex(newTail)} (delta=${newTail - prevTail})`);
    if (missing.size > 0) {
      console.log(`    Missing blocks: ${[...missing].sort((a, b) => a - b).map(hex).join(', ')}`);
    }

    // Dump the first 16 bytes of pre-gap after each insert
    const preGapLen = newCursor - MANUAL_BUF_START;
    if (preGapLen > 0) {
      console.log(`    Pre-gap bytes (${preGapLen}): ${hexBytes(mem, MANUAL_BUF_START, Math.min(preGapLen, 32))}`);
    }

    if (!returned) allInsertsOk = false;
  }

  console.log('');
  dumpEditPointers(mem, 'After all 3 inserts');

  const finalCursor = read24(mem, EDIT_CURSOR);
  const finalTop    = read24(mem, EDIT_TOP);
  const preGapLen = finalCursor - finalTop;

  if (preGapLen > 0) {
    console.log(`  Full pre-gap dump (${preGapLen} bytes): ${hexBytes(mem, finalTop, preGapLen)}`);

    // Check for expected token bytes
    const expected = [0x32, 0x70, 0x33];
    const found = [];
    for (let i = 0; i < preGapLen && i < 16; i++) {
      found.push(mem[finalTop + i]);
    }
    console.log(`  Expected token bytes: ${expected.map(b => hex(b, 2)).join(' ')}`);
    console.log(`  Found bytes:          ${found.map(b => hex(b, 2)).join(' ')}`);

    const exactMatch = expected.every((b, i) => found[i] === b);
    console.log(`  Exact match: ${exactMatch ? 'YES' : 'NO'}`);

    // Check if tokens are present but with extra bytes
    const foundTokens = [];
    for (let i = 0; i < preGapLen; i++) {
      if (expected.includes(mem[finalTop + i])) {
        foundTokens.push({ offset: i, byte: mem[finalTop + i] });
      }
    }
    if (foundTokens.length > 0) {
      console.log(`  Token bytes found at offsets: ${foundTokens.map(t => `${t.offset}:${hex(t.byte, 2)}`).join(', ')}`);
    }
  }
  console.log('');

  // ════════════════════════════════════════════════════════════════════════
  // Part E: Key-to-token conversion
  // ════════════════════════════════════════════════════════════════════════

  console.log('══════════════════════════════════════════════════════');
  console.log('Part E: Key-to-token conversion');
  console.log('══════════════════════════════════════════════════════');
  console.log('');

  // Strategy 1: Search ROM for a direct k*-to-token mapping table
  // k0=0x8E -> t0=0x30, k1=0x8F -> t1=0x31, ..., k9=0x97 -> t9=0x39
  // Look for the byte sequence 0x30 0x31 0x32 0x33 0x34 0x35 0x36 0x37 0x38 0x39
  // indexed somehow by the offset from 0x8E

  console.log('  Strategy 1: Search for t0-t9 byte sequence (0x30..0x39) in ROM...');
  const tokenSeq = [0x30, 0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39];
  const seqMatches = [];
  for (let scan = 0; scan < 0x400000 - 10; scan++) {
    let match = true;
    for (let i = 0; i < 10; i++) {
      if (romBytes[scan + i] !== tokenSeq[i]) { match = false; break; }
    }
    if (match) {
      seqMatches.push(scan);
    }
  }
  console.log(`    Found ${seqMatches.length} matches for 0x30..0x39 sequence:`);
  for (const m of seqMatches.slice(0, 20)) {
    // Show context: 4 bytes before and 4 after
    console.log(`    ${hex(m)}: ...${hexBytes(romBytes, Math.max(0, m - 4), 4)} [${hexBytes(romBytes, m, 10)}] ${hexBytes(romBytes, m + 10, 4)}...`);
  }
  console.log('');

  // Strategy 2: Look for a table indexed by k* code
  // k0=0x8E. If there's a 256-byte lookup table, ROM[table + 0x8E] = 0x30
  // Search for addresses where ROM[addr + 0x8E] = 0x30 AND ROM[addr + 0x8F] = 0x31 etc.
  console.log('  Strategy 2: Search for 256-byte lookup table where tbl[0x8E]=0x30...');
  const tblMatches = [];
  for (let base = 0; base < 0x400000 - 0x100; base++) {
    let match = true;
    for (let k = 0; k < 10; k++) {
      if (romBytes[base + 0x8e + k] !== (0x30 + k)) { match = false; break; }
    }
    if (match) {
      tblMatches.push(base);
    }
  }
  console.log(`    Found ${tblMatches.length} candidate tables:`);
  for (const t of tblMatches.slice(0, 10)) {
    // Check what else maps sensibly
    console.log(`    Base ${hex(t)}:`);
    console.log(`      tbl[0x8E..0x97] (k0..k9) = ${hexBytes(romBytes, t + 0x8e, 10)}`);
    // Check kAdd=0x9B -> tAdd=0x70?
    console.log(`      tbl[0x9B] (kAdd) = ${hex(romBytes[t + 0x9b], 2)} (expected: 0x70 for tAdd)`);
    console.log(`      tbl[0x9C] (kSub) = ${hex(romBytes[t + 0x9c], 2)} (expected: 0x71 for tSub)`);
    console.log(`      tbl[0x9D] (kMul) = ${hex(romBytes[t + 0x9d], 2)} (expected: 0x82 for tMul)`);
    console.log(`      tbl[0x9E] (kDiv) = ${hex(romBytes[t + 0x9e], 2)} (expected: 0x83 for tDiv)`);
    console.log(`      tbl[0x85] (kEnter) = ${hex(romBytes[t + 0x85], 2)} (expected: 0x04/0x3F for tEnter/tNewLine)`);
  }
  console.log('');

  // Strategy 3: Disassemble the area after the scan-to-key table for conversion logic
  console.log('  Strategy 3: Disassemble near scan-to-key table at 0x09F79B...');
  // The scan-to-key table is 64 bytes (8x8 matrix). After it there may be more tables.
  console.log('  Scan-to-key table bytes (64 bytes):');
  console.log(`    ${hexBytes(romBytes, SCAN_TO_KEY_TABLE, 64)}`);
  console.log('');

  // Check what follows the scan-to-key table
  const afterScanTable = SCAN_TO_KEY_TABLE + 64;
  console.log(`  Bytes after scan-to-key table (at ${hex(afterScanTable)}, 128 bytes):`);
  for (let row = 0; row < 8; row++) {
    const addr = afterScanTable + row * 16;
    console.log(`    ${hex(addr)}: ${hexBytes(romBytes, addr, 16)}`);
  }
  console.log('');

  // Strategy 4: Search for the k* code values in ROM context
  // The conversion may happen in a routine that loads from a table.
  // Search for instructions referencing common k* -> token conversion addresses
  // Look for LD A, (HL) patterns near subtraction of 0x8E
  console.log('  Strategy 4: Search ROM for SUB 0x8E or CP 0x8E patterns...');
  // SUB n = 0xD6 nn, CP n = 0xFE nn
  const sub8E_matches = [];
  const cp8E_matches = [];
  for (let scan = 0; scan < 0x400000 - 2; scan++) {
    if (romBytes[scan] === 0xd6 && romBytes[scan + 1] === 0x8e) {
      sub8E_matches.push(scan);
    }
    if (romBytes[scan] === 0xfe && romBytes[scan + 1] === 0x8e) {
      cp8E_matches.push(scan);
    }
  }
  console.log(`    SUB 0x8E found at: ${sub8E_matches.map(hex).join(', ') || 'none'}`);
  console.log(`    CP 0x8E found at: ${cp8E_matches.map(hex).join(', ') || 'none'}`);
  console.log('');

  // For each match, disassemble context around it
  for (const matchAddr of [...sub8E_matches, ...cp8E_matches].slice(0, 5)) {
    const ctxStart = Math.max(0, matchAddr - 8);
    console.log(`  Context around ${hex(matchAddr)}:`);
    const ctx = disassembleRange(ctxStart, 12);
    for (const line of ctx.lines) console.log(`  ${line}`);
    console.log('');
  }

  // Strategy 5: Search for SUB 0x30 pattern (add 0x30 offset to get ASCII digit)
  // or ADD A, 0x30
  console.log('  Strategy 5: Search ROM for ADD A,0x30 near k* code handling...');
  // ADD A, n = 0xC6 nn
  const addMatches = [];
  for (let scan = 0; scan < 0x400000 - 2; scan++) {
    if (romBytes[scan] === 0xc6 && romBytes[scan + 1] === 0x30) {
      addMatches.push(scan);
    }
  }
  console.log(`    ADD A,0x30 found at ${addMatches.length} locations`);
  for (const m of addMatches.slice(0, 5)) {
    console.log(`    ${hex(m)}: context...`);
    const ctx = disassembleRange(Math.max(0, m - 6), 8);
    for (const line of ctx.lines) console.log(`    ${line}`);
    console.log('');
  }

  // Strategy 6: Known k*-to-token conversion approach on TI-84 CE
  // The OS uses a KeyToTok table. Search for it.
  // On TI-84 CE, the key handler GetKey returns a k* code. The editor then
  // uses a dispatch table to convert k* to token. Let's search near known
  // editor routines for indirect table loads.
  console.log('  Strategy 6: Search near BufInsert caller region for key-token table...');
  // The edit buffer routines are at 0x05E2A0-0x05E4xx.
  // Search the broader editor region 0x05D000 - 0x060000 for table references
  const editorRegionStart = 0x05d000;
  const editorRegionEnd   = 0x060000;

  // Look for LD HL, imm24 pointing to known table regions (0x09xxxx)
  console.log(`  Searching ${hex(editorRegionStart)}-${hex(editorRegionEnd)} for LD HL,0x09xxxx patterns...`);
  const ldHLMatches = [];
  for (let scan = editorRegionStart; scan < editorRegionEnd - 4; scan++) {
    // LD HL, imm24 in ADL = 0x21 lo mid hi
    if (romBytes[scan] === 0x21 && romBytes[scan + 3] === 0x09) {
      const target = romBytes[scan + 1] | (romBytes[scan + 2] << 8) | (romBytes[scan + 3] << 16);
      ldHLMatches.push({ addr: scan, target });
    }
  }
  for (const m of ldHLMatches.slice(0, 10)) {
    console.log(`    ${hex(m.addr)}: LD HL, ${hex(m.target)}`);
  }
  console.log('');

  // ── Summary ──

  console.log('══════════════════════════════════════════════════════');
  console.log('Summary');
  console.log('══════════════════════════════════════════════════════');
  console.log('');
  console.log(`  Part A: Room-check disassembled (${roomCheckDisasm.instrCount} instructions)`);
  console.log(`  Part B: CreateNumEditBuf disassembled`);
  console.log(`  Part C: BufInsert disassembled (${biDisasm.instrCount} instructions)`);
  console.log(`  Part D: Manual buffer test — inserts ${allInsertsOk ? 'ALL OK' : 'FAILED'}`);
  console.log(`  Part E: Key-to-token — ${tblMatches.length} candidate tables, ${sub8E_matches.length + cp8E_matches.length} sub/cp 0x8E refs`);
  console.log('');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
