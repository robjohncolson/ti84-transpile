#!/usr/bin/env node

/**
 * Phase 129 — Edit Buffer Investigation
 *
 * Research probe to understand the TI-84 Plus CE OS edit buffer system:
 *   1. Map edit buffer pointer addresses from ti84pceg.inc
 *   2. Trace the home-screen digit key handler (0x058241)
 *   3. Disassemble the digit-key dispatch path
 *   4. Map the edit buffer data area (where tokens are stored)
 *   5. Document the key code → token pipeline
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

// Edit buffer addresses (from ti84pceg.inc)
const EDIT_TOP      = 0xd02437;
const EDIT_CURSOR   = 0xd0243a;
const EDIT_TAIL     = 0xd0243d;
const EDIT_BTM      = 0xd02440;
const EDIT_SYM      = 0xd0244e;
const EDIT_DAT      = 0xd02451;

// Key-related addresses
const KBD_SCAN_CODE = 0xd00587;
const KBD_KEY       = 0xd0058c;
const KBD_GETKY     = 0xd0058d;

// App context addresses
const CX_CUR_APP    = 0xd007e0;
const CX_MAIN       = 0xd007ca;

// Home-screen handler entry
const HOME_HANDLER  = 0x058241;

// OS routines (jump table entries)
const JT_BUF_CLR        = 0x021504;
const JT_BUF_INSERT     = 0x020d00;
const JT_BUF_DELETE     = 0x020d0c;
const JT_BUF_LEFT       = 0x020cf8;
const JT_BUF_RIGHT      = 0x020cfc;
const JT_BUF_PEEK       = 0x020d10;
const JT_PARSE_EDIT_BUF = 0x020cbc;
const JT_CLOSE_EDIT_BUF = 0x020cb8;
const JT_CREATE_NUM_EDIT = 0x020abc;
const JT_SET_KBD_KEY    = 0x021ed0;

// Key codes (from ti84pceg.inc)
const KEY_CODES = {
  kRight: 0x01, kLeft: 0x02, kUp: 0x03, kDown: 0x04,
  kEnter: 0x05, kClear: 0x09, kDel: 0x0a,
  k0: 0x8e, k1: 0x8f, k2: 0x90, k3: 0x91, k4: 0x92,
  k5: 0x93, k6: 0x94, k7: 0x95, k8: 0x96, k9: 0x97,
};

const MEMINIT_BUDGET = 100000;
const MAX_LOOP_ITER = 8192;
const TRACE_BUDGET = 50000;

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
      const instr = decodeEz80(romBytes, pc, true); // ADL mode
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

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 129: Edit Buffer Investigation ===');
  console.log('');

  // ── Task 1: Map edit buffer addresses from ti84pceg.inc ──

  console.log('--- Task 1: Edit Buffer Address Map ---');
  console.log('  Edit buffer pointer addresses (24-bit pointers):');
  console.log(`    editTop    = ${hex(EDIT_TOP)}   — start of buffer (before cursor)`);
  console.log(`    editCursor = ${hex(EDIT_CURSOR)}   — cursor position`);
  console.log(`    editTail   = ${hex(EDIT_TAIL)}   — end of pre-cursor data (gap start)`);
  console.log(`    editBtm    = ${hex(EDIT_BTM)}   — bottom of buffer (end of post-cursor data)`);
  console.log(`    editSym    = ${hex(EDIT_SYM)}   — pointer to VAT of variable being edited`);
  console.log(`    editDat    = ${hex(EDIT_DAT)}   — pointer to data of variable being edited`);
  console.log('');
  console.log('  Key-related addresses:');
  console.log(`    kbdScanCode = ${hex(KBD_SCAN_CODE)}   — scan code from GetCSC`);
  console.log(`    kbdKey      = ${hex(KBD_KEY)}   — key code (1 byte)`);
  console.log(`    kbdGetKy    = ${hex(KBD_GETKY)}   — GetKey result`);
  console.log('');
  console.log('  OS edit buffer routines (jump table entries):');
  console.log(`    BufClr         = ${hex(JT_BUF_CLR)}`);
  console.log(`    BufInsert      = ${hex(JT_BUF_INSERT)}`);
  console.log(`    BufDelete      = ${hex(JT_BUF_DELETE)}`);
  console.log(`    BufLeft        = ${hex(JT_BUF_LEFT)}`);
  console.log(`    BufRight       = ${hex(JT_BUF_RIGHT)}`);
  console.log(`    BufPeek        = ${hex(JT_BUF_PEEK)}`);
  console.log(`    ParseEditBuf   = ${hex(JT_PARSE_EDIT_BUF)}`);
  console.log(`    CloseEditBuf   = ${hex(JT_CLOSE_EDIT_BUF)}`);
  console.log(`    CreateNumEditBuf = ${hex(JT_CREATE_NUM_EDIT)}`);
  console.log(`    os.SetKbdKey   = ${hex(JT_SET_KBD_KEY)}`);
  console.log('');
  console.log('  Key codes for digits (from ti84pceg.inc):');
  for (const [name, val] of Object.entries(KEY_CODES)) {
    console.log(`    ${name.padEnd(12)} = ${hex(val, 2)}`);
  }
  console.log('');

  // Resolve jump table targets for edit buffer routines
  console.log('  Jump table target resolution:');
  const jtEntries = [
    ['BufClr', JT_BUF_CLR],
    ['BufInsert', JT_BUF_INSERT],
    ['BufDelete', JT_BUF_DELETE],
    ['BufLeft', JT_BUF_LEFT],
    ['BufRight', JT_BUF_RIGHT],
    ['BufPeek', JT_BUF_PEEK],
    ['ParseEditBuf', JT_PARSE_EDIT_BUF],
    ['CloseEditBuf', JT_CLOSE_EDIT_BUF],
    ['CreateNumEditBuf', JT_CREATE_NUM_EDIT],
    ['SetKbdKey', JT_SET_KBD_KEY],
  ];
  for (const [name, addr] of jtEntries) {
    // Jump table entries are JP instructions — decode them
    const byte0 = romBytes[addr];
    if (byte0 === 0xc3) {
      // JP nn — 3 byte target in ADL mode
      const target = read24(romBytes, addr + 1);
      console.log(`    ${name.padEnd(18)} @ ${hex(addr)} -> JP ${hex(target)}`);
    } else {
      console.log(`    ${name.padEnd(18)} @ ${hex(addr)}: opcode=${hex(byte0, 2)} (not JP)`);
      const disasm = disassembleRange(addr, addr + 6);
      for (const line of disasm) console.log(`      ${line}`);
    }
  }
  console.log('');

  // ── Task 2: Read edit buffer pointers after boot ──

  console.log('--- Task 2: Edit Buffer State After Boot ---');
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
  console.log(`  MEM_INIT: ${meminitDone ? 'returned OK' : 'FAILED'}`);

  seedAllocator(mem);

  // Read edit buffer pointers after boot/MEM_INIT
  const editTopVal = read24(mem, EDIT_TOP);
  const editCursorVal = read24(mem, EDIT_CURSOR);
  const editTailVal = read24(mem, EDIT_TAIL);
  const editBtmVal = read24(mem, EDIT_BTM);
  const editSymVal = read24(mem, EDIT_SYM);
  const editDatVal = read24(mem, EDIT_DAT);

  console.log(`  After boot + MEM_INIT:`);
  console.log(`    editTop    = ${hex(editTopVal)}`);
  console.log(`    editCursor = ${hex(editCursorVal)}`);
  console.log(`    editTail   = ${hex(editTailVal)}`);
  console.log(`    editBtm    = ${hex(editBtmVal)}`);
  console.log(`    editSym    = ${hex(editSymVal)}`);
  console.log(`    editDat    = ${hex(editDatVal)}`);
  console.log('');

  // Check if edit buffer pointers are initialized
  const editPointersZero = (editTopVal === 0 && editCursorVal === 0 && editTailVal === 0 && editBtmVal === 0);
  if (editPointersZero) {
    console.log('  Edit buffer pointers are all zero — buffer not yet initialized.');
    console.log('  Need to call an init routine (BufClr or CreateNumEditBuf) first.');
  } else {
    console.log('  Edit buffer pointers are initialized!');
    if (editTopVal > 0 && editTopVal < MEM_SIZE) {
      console.log(`  Buffer data region: ${hex(editTopVal)} to ${hex(editBtmVal)}`);
      console.log(`  Buffer size: ${editBtmVal - editTopVal} bytes`);
      console.log(`  First 32 bytes of buffer data:`);
      console.log(`    ${hexBytes(mem, editTopVal, Math.min(32, editBtmVal - editTopVal))}`);
    }
  }
  console.log('');

  // ── Task 3: Disassemble home-screen handler ──

  console.log('--- Task 3: Disassembly of Home-Screen Handler (0x058241) ---');
  console.log('  First 128 bytes:');
  const homeDisasm = disassembleRange(HOME_HANDLER, HOME_HANDLER + 128);
  for (const line of homeDisasm) console.log(line);
  console.log('');

  // Also check the dispatch table referenced in CONTINUATION_PROMPT (0x058693+)
  console.log('  Disassembly at 0x058693 (potential dispatch table area):');
  const dispatchDisasm = disassembleRange(0x058693, 0x058693 + 64);
  for (const line of dispatchDisasm) console.log(line);
  console.log('');

  // ── Task 4: Trace home-screen handler with digit key ──

  console.log('--- Task 4: Trace Home-Screen Handler with k2 (0x90) ---');

  // Set up home-screen context
  mem[CX_CUR_APP] = 0x40; // home screen

  // Set LCD ready flag
  mem[0xd00098] |= 0x01;

  // Set kbdKey to k2 = 0x90
  mem[KBD_KEY] = KEY_CODES.k2;
  console.log(`  kbdKey set to ${hex(KEY_CODES.k2, 2)} (k2)`);

  // Prepare call state
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  // Track writes to the edit buffer region
  const editWrites = [];
  const callTrace = [];
  const missingBlocks = new Set();
  let stepCount = 0;
  let finalPc = null;
  let returnHit = false;
  const pcHitCounts = new Map();
  const recentPcs = [];
  const firstPcs = [];

  // Track which OS routines are called
  const osRoutineHits = new Map();
  const osRoutineNames = new Map([
    [JT_BUF_CLR, 'BufClr'],
    [JT_BUF_INSERT, 'BufInsert'],
    [JT_BUF_DELETE, 'BufDelete'],
    [JT_BUF_LEFT, 'BufLeft'],
    [JT_BUF_RIGHT, 'BufRight'],
    [JT_BUF_PEEK, 'BufPeek'],
    [JT_PARSE_EDIT_BUF, 'ParseEditBuf'],
    [JT_CLOSE_EDIT_BUF, 'CloseEditBuf'],
    [JT_CREATE_NUM_EDIT, 'CreateNumEditBuf'],
    [JT_SET_KBD_KEY, 'SetKbdKey'],
  ]);

  // Intercept writes to edit buffer region by periodically sampling
  const editRegionSnapshots = [];
  let lastEditSnapshot = null;

  function snapshotEditRegion() {
    const snap = {
      editTop: read24(mem, EDIT_TOP),
      editCursor: read24(mem, EDIT_CURSOR),
      editTail: read24(mem, EDIT_TAIL),
      editBtm: read24(mem, EDIT_BTM),
    };
    const key = `${snap.editTop}:${snap.editCursor}:${snap.editTail}:${snap.editBtm}`;
    if (key !== lastEditSnapshot) {
      editRegionSnapshots.push({ step: stepCount, pc: finalPc, ...snap });
      lastEditSnapshot = key;
    }
    return snap;
  }

  try {
    executor.runFrom(HOME_HANDLER, 'adl', {
      maxSteps: TRACE_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        const norm = pc & 0xffffff;
        finalPc = norm;
        stepCount++;
        pcHitCounts.set(norm, (pcHitCounts.get(norm) || 0) + 1);
        recentPcs.push(norm);
        if (recentPcs.length > 128) recentPcs.shift();
        if (firstPcs.length < 2000) firstPcs.push(norm);

        // Check for OS routine hits
        if (osRoutineNames.has(norm)) {
          const name = osRoutineNames.get(norm);
          osRoutineHits.set(name, (osRoutineHits.get(name) || 0) + 1);
          console.log(`    [step ${stepCount}] OS routine hit: ${name} @ ${hex(norm)}`);
          snapshotEditRegion();
        }

        // Sample edit region every 500 steps
        if (stepCount % 500 === 0) snapshotEditRegion();

        if (norm === FAKE_RET) throw new Error('__RET__');
      },
      onMissingBlock(pc) {
        const norm = pc & 0xffffff;
        finalPc = norm;
        stepCount++;
        missingBlocks.add(norm);
        pcHitCounts.set(norm, (pcHitCounts.get(norm) || 0) + 1);
        recentPcs.push(norm);
        if (recentPcs.length > 128) recentPcs.shift();
        if (firstPcs.length < 2000) firstPcs.push(norm);
        if (norm === FAKE_RET) throw new Error('__RET__');
      },
    });
  } catch (e) {
    if (e?.message === '__RET__') {
      returnHit = true;
      finalPc = FAKE_RET;
    } else throw e;
  }

  console.log(`  Home handler result: returnHit=${returnHit} steps=${stepCount}`);
  console.log(`  Final PC: ${hex(finalPc)}`);
  console.log('');

  // Post-trace edit buffer state
  const postEditTop = read24(mem, EDIT_TOP);
  const postEditCursor = read24(mem, EDIT_CURSOR);
  const postEditTail = read24(mem, EDIT_TAIL);
  const postEditBtm = read24(mem, EDIT_BTM);
  console.log('  Edit buffer state AFTER handler:');
  console.log(`    editTop    = ${hex(postEditTop)}`);
  console.log(`    editCursor = ${hex(postEditCursor)}`);
  console.log(`    editTail   = ${hex(postEditTail)}`);
  console.log(`    editBtm    = ${hex(postEditBtm)}`);
  if (postEditTop > 0 && postEditTop < MEM_SIZE && postEditBtm > postEditTop) {
    const bufSize = postEditBtm - postEditTop;
    console.log(`    Buffer data (${bufSize} bytes, showing first 64):`);
    console.log(`      ${hexBytes(mem, postEditTop, Math.min(64, bufSize))}`);
  }
  console.log('');

  // Edit region snapshots
  if (editRegionSnapshots.length > 0) {
    console.log('  Edit buffer pointer transitions:');
    for (const snap of editRegionSnapshots) {
      console.log(`    step ${snap.step}: PC=${hex(snap.pc)} top=${hex(snap.editTop)} cursor=${hex(snap.editCursor)} tail=${hex(snap.editTail)} btm=${hex(snap.editBtm)}`);
    }
    console.log('');
  }

  // OS routine hit summary
  if (osRoutineHits.size > 0) {
    console.log('  OS edit routines called:');
    for (const [name, count] of osRoutineHits) {
      console.log(`    ${name}: ${count} times`);
    }
    console.log('');
  }

  // Top-20 hottest PCs
  const sorted = [...pcHitCounts.entries()].sort((a, b) => b[1] - a[1]);
  console.log('  Top-20 hottest PCs:');
  for (let i = 0; i < Math.min(20, sorted.length); i++) {
    const [pc, hits] = sorted[i];
    const isMissing = missingBlocks.has(pc) ? ' [MISSING BLOCK]' : '';
    console.log(`    ${hex(pc)}: ${hits} hits${isMissing}`);
  }
  console.log('');

  // Missing blocks
  if (missingBlocks.size > 0) {
    console.log(`  Missing block addresses (${missingBlocks.size} unique):`);
    const sortedMissing = [...missingBlocks].sort((a, b) => a - b);
    for (const pc of sortedMissing) {
      const hits = pcHitCounts.get(pc) || 0;
      console.log(`    ${hex(pc)}: ${hits} hits`);
      if (pc < 0x400000) {
        const instrLines = disassembleRange(pc, Math.min(pc + 16, 0x400000));
        for (const line of instrLines) console.log(`      ${line}`);
      }
    }
    console.log('');
  }

  // Last 64 PCs visited
  console.log('  Last 64 PCs visited:');
  const lastChunk = recentPcs.slice(-64);
  for (let i = 0; i < lastChunk.length; i += 8) {
    console.log(`    ${lastChunk.slice(i, i + 8).map(p => hex(p)).join(' ')}`);
  }
  console.log('');

  // First 200 PCs (to trace the dispatch path)
  console.log('  First 200 PCs visited (dispatch path trace):');
  const showPcs = firstPcs.slice(0, 200);
  for (let i = 0; i < showPcs.length; i += 8) {
    console.log(`    ${showPcs.slice(i, i + 8).map(p => hex(p)).join(' ')}`);
  }
  console.log('');

  // ── Task 5: Try BufClr initialization + BufInsert ──

  console.log('--- Task 5: Direct BufClr + BufInsert Test ---');

  // Resolve BufClr target
  const bufClrTarget = (romBytes[JT_BUF_CLR] === 0xc3) ? read24(romBytes, JT_BUF_CLR + 1) : null;
  const bufInsertTarget = (romBytes[JT_BUF_INSERT] === 0xc3) ? read24(romBytes, JT_BUF_INSERT + 1) : null;

  if (bufClrTarget) {
    console.log(`  BufClr resolved to ${hex(bufClrTarget)}`);
    console.log(`  Disassembly of BufClr target:`);
    const bufClrDisasm = disassembleRange(bufClrTarget, bufClrTarget + 64);
    for (const line of bufClrDisasm) console.log(line);
    console.log('');

    // Try calling BufClr
    prepareCallState(cpu, mem);
    cpu.sp -= 3;
    write24(mem, cpu.sp, FAKE_RET);

    // Set LCD ready
    mem[0xd00098] |= 0x01;

    let bufClrDone = false;
    let bufClrSteps = 0;
    const bufClrMissing = new Set();
    try {
      executor.runFrom(bufClrTarget, 'adl', {
        maxSteps: 10000,
        maxLoopIterations: MAX_LOOP_ITER,
        onBlock(pc) {
          bufClrSteps++;
          if ((pc & 0xffffff) === FAKE_RET) throw new Error('__RET__');
        },
        onMissingBlock(pc) {
          bufClrSteps++;
          bufClrMissing.add(pc & 0xffffff);
          if ((pc & 0xffffff) === FAKE_RET) throw new Error('__RET__');
        },
      });
    } catch (e) {
      if (e?.message === '__RET__') bufClrDone = true;
      else throw e;
    }

    console.log(`  BufClr result: returned=${bufClrDone} steps=${bufClrSteps}`);
    if (bufClrMissing.size > 0) {
      console.log(`  BufClr missing blocks: ${[...bufClrMissing].map(hex).join(', ')}`);
    }

    const afterBufClrTop = read24(mem, EDIT_TOP);
    const afterBufClrCursor = read24(mem, EDIT_CURSOR);
    const afterBufClrTail = read24(mem, EDIT_TAIL);
    const afterBufClrBtm = read24(mem, EDIT_BTM);
    console.log(`  After BufClr:`);
    console.log(`    editTop    = ${hex(afterBufClrTop)}`);
    console.log(`    editCursor = ${hex(afterBufClrCursor)}`);
    console.log(`    editTail   = ${hex(afterBufClrTail)}`);
    console.log(`    editBtm    = ${hex(afterBufClrBtm)}`);
    console.log('');
  }

  if (bufInsertTarget) {
    console.log(`  BufInsert resolved to ${hex(bufInsertTarget)}`);
    console.log(`  Disassembly of BufInsert target:`);
    const bufInsDisasm = disassembleRange(bufInsertTarget, bufInsertTarget + 64);
    for (const line of bufInsDisasm) console.log(line);
    console.log('');
  }

  // ── Task 6: Investigate key-to-token pipeline ──

  console.log('--- Task 6: Key-to-Token Pipeline Investigation ---');
  console.log('');
  console.log('  Pipeline stages (from documentation):');
  console.log('    1. Physical key press → scan code (hardware matrix)');
  console.log('    2. GetCSC (0x03FA09) → kbdScanCode (0xD00587)');
  console.log('    3. Scan-to-keycode table (0x09F79B) → kbdKey (0xD0058C)');
  console.log('    4. CoorMon (0x08C331) dispatches to app handler');
  console.log('    5. App handler (home: 0x058241) processes key code');
  console.log('    6. Key code → token mapping → BufInsert into edit buffer');
  console.log('');

  // Dump the scan-to-keycode table region
  console.log('  Scan-to-keycode table at 0x09F79B (first 64 bytes):');
  for (let row = 0x09f79b; row < 0x09f79b + 64; row += 16) {
    console.log(`    ${hex(row)}: ${hexBytes(romBytes, row, 16)}`);
  }
  console.log('');

  // Look at what the home handler reads from kbdKey
  // Disassemble a bit further into the handler to find the key dispatch
  console.log('  Extended home handler disassembly (0x058241 to 0x058341):');
  const extDisasm = disassembleRange(HOME_HANDLER, HOME_HANDLER + 256);
  for (const line of extDisasm) console.log(line);
  console.log('');

  // ── Task 7: Disassemble around cxMain/dispatch area ──

  console.log('--- Task 7: cxMain and Dispatch Context ---');
  const cxMainVal = read24(mem, CX_MAIN);
  console.log(`  cxMain pointer: ${hex(cxMainVal)}`);
  console.log(`  cxCurApp: ${hex(mem[CX_CUR_APP], 2)}`);
  console.log('');

  if (cxMainVal > 0 && cxMainVal < 0x400000) {
    console.log(`  Disassembly at cxMain target (${hex(cxMainVal)}):`);
    const cxDisasm = disassembleRange(cxMainVal, cxMainVal + 32);
    for (const line of cxDisasm) console.log(line);
    console.log('');
  }

  // ── Task 8: Attempt trace with kbdKey as scan code (per task spec kNum2=0x22) ──

  console.log('--- Task 8: Trace Home Handler with kbdKey=0x22 (task spec value) ---');

  // Reset edit buffer pointers
  write24(mem, EDIT_TOP, 0);
  write24(mem, EDIT_CURSOR, 0);
  write24(mem, EDIT_TAIL, 0);
  write24(mem, EDIT_BTM, 0);

  mem[KBD_KEY] = 0x22;
  console.log(`  kbdKey set to 0x22`);

  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);
  mem[0xd00098] |= 0x01;

  const editWrites2 = [];
  const missingBlocks2 = new Set();
  let stepCount2 = 0;
  let finalPc2 = null;
  let returnHit2 = false;
  const firstPcs2 = [];
  const pcHitCounts2 = new Map();
  const osHits2 = new Map();

  try {
    executor.runFrom(HOME_HANDLER, 'adl', {
      maxSteps: TRACE_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        const norm = pc & 0xffffff;
        finalPc2 = norm;
        stepCount2++;
        pcHitCounts2.set(norm, (pcHitCounts2.get(norm) || 0) + 1);
        if (firstPcs2.length < 2000) firstPcs2.push(norm);

        if (osRoutineNames.has(norm)) {
          const name = osRoutineNames.get(norm);
          osHits2.set(name, (osHits2.get(name) || 0) + 1);
          console.log(`    [step ${stepCount2}] OS routine: ${name} @ ${hex(norm)}`);
        }

        if (norm === FAKE_RET) throw new Error('__RET__');
      },
      onMissingBlock(pc) {
        const norm = pc & 0xffffff;
        finalPc2 = norm;
        stepCount2++;
        missingBlocks2.add(norm);
        if (firstPcs2.length < 2000) firstPcs2.push(norm);
        if (norm === FAKE_RET) throw new Error('__RET__');
      },
    });
  } catch (e) {
    if (e?.message === '__RET__') {
      returnHit2 = true;
      finalPc2 = FAKE_RET;
    } else throw e;
  }

  console.log(`  Handler result: returnHit=${returnHit2} steps=${stepCount2}`);
  console.log(`  Final PC: ${hex(finalPc2)}`);

  // Post-trace edit buffer state
  const post2EditTop = read24(mem, EDIT_TOP);
  const post2EditCursor = read24(mem, EDIT_CURSOR);
  const post2EditTail = read24(mem, EDIT_TAIL);
  const post2EditBtm = read24(mem, EDIT_BTM);
  console.log(`  Edit buffer after handler:`);
  console.log(`    editTop    = ${hex(post2EditTop)}`);
  console.log(`    editCursor = ${hex(post2EditCursor)}`);
  console.log(`    editTail   = ${hex(post2EditTail)}`);
  console.log(`    editBtm    = ${hex(post2EditBtm)}`);
  if (post2EditTop > 0 && post2EditTop < MEM_SIZE && post2EditBtm > post2EditTop) {
    console.log(`    Buffer data: ${hexBytes(mem, post2EditTop, Math.min(32, post2EditBtm - post2EditTop))}`);
  }
  console.log('');

  if (osHits2.size > 0) {
    console.log('  OS routines called:');
    for (const [name, count] of osHits2) {
      console.log(`    ${name}: ${count} times`);
    }
    console.log('');
  }

  if (missingBlocks2.size > 0) {
    console.log(`  Missing blocks: ${[...missingBlocks2].sort((a,b) => a-b).map(hex).join(', ')}`);
    console.log('');
  }

  // First 100 PCs
  console.log('  First 100 PCs:');
  const show2 = firstPcs2.slice(0, 100);
  for (let i = 0; i < show2.length; i += 8) {
    console.log(`    ${show2.slice(i, i + 8).map(p => hex(p)).join(' ')}`);
  }
  console.log('');

  // Top-20 hottest
  const sorted2 = [...pcHitCounts2.entries()].sort((a, b) => b[1] - a[1]);
  console.log('  Top-20 hottest PCs:');
  for (let i = 0; i < Math.min(20, sorted2.length); i++) {
    const [pc, hits] = sorted2[i];
    const isMissing = missingBlocks2.has(pc) ? ' [MISSING]' : '';
    console.log(`    ${hex(pc)}: ${hits} hits${isMissing}`);
  }
  console.log('');

  // ── Summary ──

  console.log('=== Summary ===');
  console.log('');
  console.log('Edit buffer pointer addresses:');
  console.log(`  editTop=${hex(EDIT_TOP)} editCursor=${hex(EDIT_CURSOR)} editTail=${hex(EDIT_TAIL)} editBtm=${hex(EDIT_BTM)}`);
  console.log(`  editSym=${hex(EDIT_SYM)} editDat=${hex(EDIT_DAT)}`);
  console.log('');
  console.log('Key codes for digits: k0=0x8E through k9=0x97');
  console.log('Edit buffer routines: BufClr, BufInsert, BufDelete, BufLeft, BufRight, BufPeek');
  console.log('');
  console.log('Key-to-Token Pipeline:');
  console.log('  GetCSC → kbdScanCode → scan-to-keycode(0x09F79B) → kbdKey → CoorMon → app handler → BufInsert');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
