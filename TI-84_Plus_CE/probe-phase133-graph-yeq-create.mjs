#!/usr/bin/env node

/**
 * Phase 133 — Create Y1=X equation VAT entry for DrawCmd.
 *
 * Test 1: CreateEqu — create a Y1 equation variable via OS routine
 * Test 2: Manual VAT construction fallback (if CreateEqu fails)
 * Test 3: GraphPars with Y1=X equation present
 * Test 4: DrawCmd with Y1=X equation present
 *
 * EquObj format from ti84pceg.inc:
 *   EquObj  := 3
 *   tY1     := 0x10
 *   tX      := 0x58
 *
 * OP1 format for equation Y1:
 *   byte 0: type = 0x03 (EquObj)
 *   byte 1: name = 0x10 (tY1)
 *   bytes 2-8: 0x00 padding
 *
 * Equation data format: 2-byte little-endian length prefix + tokenized expression
 *   For Y1=X: length=1, data=[0x58] (tX token)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { writeReal, readReal } from './fp-real.mjs';
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

const FAKE_RET = 0x7ffffe;

// Entry points
const GRAPHPARS_ENTRY = 0x09986C;
const DRAWCMD_ENTRY = 0x05DD96;
const MEMINIT_ENTRY = 0x09DEE0;
const MEMINIT_RET = 0x7FFFF6;
const CREATEEQU_ENTRY = 0x082438;
const CREATEEQU_RET = 0x7FFFFA;

// OP registers
const OP1_ADDR = 0xd005f8;
const OP1_LEN = 9;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

// Pixel dimension addresses
const PIX_WIDE_P_ADDR = 0xD014FE;
const PIX_WIDE_M2_ADDR = 0xD01501;

// Draw state addresses
const DRAW_COLOR_CODE_ADDR = 0xD026AE;
const DRAW_FG_COLOR_ADDR = 0xD026AC;
const DRAW_BG_COLOR_ADDR = 0xD026AA;
const HOOKFLAGS3_ADDR = 0xD000B5;
const MODE_BYTE_ADDR = 0xD02AD4;

// Graph buffer
const PLOTSSCREEN_ADDR = 0xD09466;
const PLOTSSCREEN_SIZE = 21945;

// Graph BCD real addresses
const XMIN_ADDR = 0xD01E33;
const XMAX_ADDR = 0xD01E3C;
const XSCL_ADDR = 0xD01E45;
const YMIN_ADDR = 0xD01E4E;
const YMAX_ADDR = 0xD01E57;
const YSCL_ADDR = 0xD01E60;
const XRES_ADDR = 0xD01E69;

// Graph mode
const GRAPHMODE_ADDR = 0xD01474;

// TI tokens
const EQUOBJ_TYPE = 0x03;
const TY1 = 0x10;
const TX = 0x58;

const STEP_BUDGET = 500000;
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

const write16 = (m, a, v) => {
  m[a] = v & 0xff;
  m[a + 1] = (v >>> 8) & 0xff;
};

const read24 = (m, a) =>
  ((m[a] & 0xff) | ((m[a + 1] & 0xff) << 8) | ((m[a + 2] & 0xff) << 16)) >>> 0;

const read16 = (m, a) =>
  ((m[a] & 0xff) | ((m[a + 1] & 0xff) << 8)) >>> 0;

function hexBytes(m, a, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push((m[a + i] & 0xff).toString(16).toUpperCase().padStart(2, '0'));
  return out.join(' ');
}

function wrapMem(rawMem) {
  return {
    write8(addr, val) { rawMem[addr] = val & 0xff; },
    read8(addr) { return rawMem[addr] & 0xff; },
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

function seedGraphRAM(mem) {
  write16(mem, PIX_WIDE_P_ADDR, 320);
  write16(mem, PIX_WIDE_M2_ADDR, 240);
  write16(mem, DRAW_COLOR_CODE_ADDR, 0x001F);
  write16(mem, DRAW_FG_COLOR_ADDR, 0x001F);
  write16(mem, DRAW_BG_COLOR_ADDR, 0xFFFF);
  mem[HOOKFLAGS3_ADDR] &= ~0x80;
  mem[MODE_BYTE_ADDR] = 1;
  mem[0xD00082] |= (1 << 4); // grfFuncM bit 4
}

function seedGraphWindow(mem) {
  const wrapped = wrapMem(mem);
  writeReal(wrapped, XMIN_ADDR, -10);
  writeReal(wrapped, XMAX_ADDR, 10);
  writeReal(wrapped, XSCL_ADDR, 1);
  writeReal(wrapped, YMIN_ADDR, -10);
  writeReal(wrapped, YMAX_ADDR, 10);
  writeReal(wrapped, YSCL_ADDR, 1);
  writeReal(wrapped, XRES_ADDR, 1);  // Xres=1 for max resolution
  mem[GRAPHMODE_ADDR] = 0; // function mode
}

function seedMinimalErrFrame(cpu, mem, returnAddr) {
  cpu.sp -= 3;
  write24(mem, cpu.sp, returnAddr);

  const errFrameBase = (cpu.sp - 6) & 0xffffff;
  mem.fill(0x00, errFrameBase, errFrameBase + 6);

  write24(mem, ERR_SP_ADDR, errFrameBase);
  mem[ERR_NO_ADDR] = 0x00;

  return {
    mainReturnSp: cpu.sp,
    mainReturnBytes: hexBytes(mem, cpu.sp, 3),
    errFrameBase,
    errFrameBytes: hexBytes(mem, errFrameBase, 6),
  };
}

// ── Disassembler helper ───────────────────────────────────────────────────

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

// ── Count non-zero bytes in plotSScreen ───────────────────────────────────

function countPlotPixels(mem) {
  let count = 0;
  for (let i = 0; i < PLOTSSCREEN_SIZE; i++) {
    if (mem[PLOTSSCREEN_ADDR + i] !== 0) count++;
  }
  return count;
}

function dumpPlotSScreenSample(mem, label) {
  const nonZero = [];
  for (let i = 0; i < PLOTSSCREEN_SIZE && nonZero.length < 30; i++) {
    if (mem[PLOTSSCREEN_ADDR + i] !== 0) {
      nonZero.push({ offset: i, val: mem[PLOTSSCREEN_ADDR + i] });
    }
  }
  if (nonZero.length > 0) {
    console.log(`  ${label} non-zero plotSScreen bytes (first ${nonZero.length}):`);
    for (const { offset, val } of nonZero) {
      const row = Math.floor(offset / 160);
      const col = (offset % 160) * 2;
      console.log(`    offset=${hex(offset, 4)} val=${hex(val, 2)} row=${row} col~=${col}`);
    }
  } else {
    console.log(`  ${label}: no non-zero bytes in plotSScreen`);
  }
}

// ── Generic run helper ────────────────────────────────────────────────────

function runCall(label, entryPC, mem, executor, cpu, budget, opts = {}) {
  console.log(`\n--- ${label} ---`);

  const pcHitCounts = new Map();
  const firstNPcs = [];
  const recentPcs = [];
  const missingBlockPcs = new Set();
  let finalPc = null;
  let returnHit = false;
  let stepCount = 0;
  const returnPc = opts.returnPc || FAKE_RET;

  try {
    executor.runFrom(entryPC, 'adl', {
      maxSteps: budget,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        const norm = pc & 0xffffff;
        finalPc = norm;
        stepCount++;
        pcHitCounts.set(norm, (pcHitCounts.get(norm) || 0) + 1);
        if (firstNPcs.length < 200) firstNPcs.push(norm);
        recentPcs.push(norm);
        if (recentPcs.length > 128) recentPcs.shift();
        if (norm === returnPc || norm === FAKE_RET) throw new Error('__RET__');
      },
      onMissingBlock(pc) {
        const norm = pc & 0xffffff;
        finalPc = norm;
        stepCount++;
        missingBlockPcs.add(norm);
        pcHitCounts.set(norm, (pcHitCounts.get(norm) || 0) + 1);
        if (firstNPcs.length < 200) firstNPcs.push(norm);
        recentPcs.push(norm);
        if (recentPcs.length > 128) recentPcs.shift();
        if (norm === returnPc || norm === FAKE_RET) throw new Error('__RET__');
      },
    });
  } catch (e) {
    if (e?.message === '__RET__') {
      returnHit = true;
      finalPc = finalPc;
    } else throw e;
  }

  console.log(`  Result: returnHit=${returnHit} steps=${stepCount} finalPC=${hex(finalPc)}`);

  // Missing blocks
  if (missingBlockPcs.size > 0) {
    const filtered = [...missingBlockPcs].filter(p => p !== FAKE_RET && p !== returnPc).sort((a, b) => a - b);
    if (filtered.length > 0) {
      console.log(`  Missing blocks (${filtered.length}):`);
      for (const pc of filtered) {
        console.log(`    ${hex(pc)}: ${pcHitCounts.get(pc)} hits`);
        if (pc < 0x400000) {
          const lines = disassembleRange(pc, Math.min(pc + 16, 0x400000));
          for (const line of lines) console.log(`    ${line}`);
        }
      }
    }
  }

  // Top-20 hottest PCs
  const sorted = [...pcHitCounts.entries()].sort((a, b) => b[1] - a[1]);
  console.log('  Top-20 hottest PCs:');
  for (let i = 0; i < Math.min(20, sorted.length); i++) {
    const [pc, hits] = sorted[i];
    const isMissing = missingBlockPcs.has(pc) ? ' [MISSING]' : '';
    console.log(`    ${hex(pc)}: ${hits} hits${isMissing}`);
  }

  // First 60 PCs
  console.log(`  First ${Math.min(firstNPcs.length, 60)} PCs visited:`);
  const showPcs = firstNPcs.slice(0, 60);
  for (let i = 0; i < showPcs.length; i += 8) {
    console.log(`    ${showPcs.slice(i, i + 8).map(p => hex(p)).join(' ')}`);
  }

  // Last 32 PCs
  console.log(`  Last 32 PCs visited:`);
  const lastChunk = recentPcs.slice(-32);
  for (let i = 0; i < lastChunk.length; i += 8) {
    console.log(`    ${lastChunk.slice(i, i + 8).map(p => hex(p)).join(' ')}`);
  }

  return { returnHit, stepCount, finalPc, missingBlockPcs, pcHitCounts };
}

// ── Hex dump helper ──────────────────────────────────────────────────────

function hexDump(mem, start, length, label) {
  console.log(`  ${label} (${hex(start)} - ${hex(start + length - 1)}):`);
  for (let row = 0; row < length; row += 16) {
    const addr = start + row;
    const bytes = [];
    const ascii = [];
    for (let i = 0; i < 16 && (row + i) < length; i++) {
      const b = mem[addr + i] & 0xff;
      bytes.push(b.toString(16).toUpperCase().padStart(2, '0'));
      ascii.push(b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.');
    }
    console.log(`    ${hex(addr)}: ${bytes.join(' ').padEnd(48)} ${ascii.join('')}`);
  }
}

// ── Manual VAT entry construction ────────────────────────────────────────

/**
 * Manually construct a Y1=X equation in the VAT.
 *
 * TI-OS VAT entry format (grows downward from symTable=0xD3FFFF):
 *   Byte offset (from entry start, reading upward):
 *     -6: data pointer low byte
 *     -5: data pointer mid byte
 *     -4: data pointer high byte
 *     -3: name byte 1 (tY1 = 0x10)
 *     -2: name length (always 3 for system vars? or name-specific)
 *     -1: type byte (EquObj = 0x03)
 *
 * Actually the TI-OS VAT entry is 6 bytes stored top-down:
 *   [type][t2][t1][ver][dataLow][dataMid][dataHigh]
 *   where type=EquObj, t2=name2, t1=name1
 *
 * The standard layout for a VAT entry (going from high to low address):
 *   addr+0: type byte (EquObj = 0x03)
 *   addr-1: second name byte (0x00 for single-byte names)
 *   addr-2: first name byte (tY1 = 0x10)
 *   addr-3: version/archive byte (0x00)
 *   addr-4: data pointer byte 0 (low)
 *   addr-5: data pointer byte 1 (mid)
 *   addr-6: data pointer byte 2 (high) -- but not stored, implicit from page
 *
 * Wait — let me just look at what standard TI-84 CE SDK says:
 * VAT entry structure (6 bytes + name, stored top-down from progPtr):
 *   Byte 0: Data pointer low
 *   Byte 1: Data pointer mid
 *   Byte 2: Data pointer high
 *   Byte 3: Type byte
 *   Byte 4: Name length
 *   Byte 5+: Name bytes (name length bytes)
 *
 * For equation variables, the name is exactly 1 byte (e.g., tY1=0x10).
 *
 * Returns the address where equation data should be written.
 */
function manualCreateEquY1(mem) {
  // Read current pointers
  const progPtr = read24(mem, PROGPTR_ADDR);
  const userMem = read24(mem, NEWDATA_PTR_ADDR);

  console.log(`  Pre-create: progPtr=${hex(progPtr)} userMem/newDataPtr=${hex(userMem)}`);

  // Equation data: 2-byte LE length prefix + token stream
  // For Y1=X: length=1, tokens=[0x58 (tX)]
  const equDataSize = 3; // 2 bytes length + 1 byte token
  const dataAddr = userMem;

  // Write equation data at userMem
  write16(mem, dataAddr, 1);  // length = 1 token byte
  mem[dataAddr + 2] = TX;    // tX token (0x58)

  // Update newDataPtr past our equation data
  write24(mem, NEWDATA_PTR_ADDR, dataAddr + equDataSize);

  // VAT entry (6 bytes): grows downward from progPtr
  // Standard TI-OS VAT format: stored at progPtr going down
  //   progPtr - 1: name byte 0 (tY1)
  //   progPtr - 2: name length (1)
  //   progPtr - 3: type (EquObj = 0x03)
  //   progPtr - 4: data pointer high byte
  //   progPtr - 5: data pointer mid byte
  //   progPtr - 6: data pointer low byte
  const vatEntrySize = 6;
  const newProgPtr = progPtr - vatEntrySize;

  mem[progPtr - 1] = TY1;           // name byte: tY1 = 0x10
  mem[progPtr - 2] = 1;             // name length = 1
  mem[progPtr - 3] = EQUOBJ_TYPE;   // type = EquObj = 0x03
  mem[progPtr - 4] = (dataAddr >> 16) & 0xff;  // data ptr high
  mem[progPtr - 5] = (dataAddr >> 8) & 0xff;   // data ptr mid
  mem[progPtr - 6] = dataAddr & 0xff;           // data ptr low

  // Update progPtr
  write24(mem, PROGPTR_ADDR, newProgPtr);

  // Also update pTemp to match (used by some routines)
  write24(mem, PTEMP_ADDR, newProgPtr);

  console.log(`  Created VAT entry: type=0x03(EquObj) name=[0x10(tY1)] namelen=1`);
  console.log(`  Data at ${hex(dataAddr)}: len=1 tokens=[${hex(TX, 2)}(tX)]`);
  console.log(`  VAT entry at ${hex(newProgPtr)}: [${hexBytes(mem, newProgPtr, vatEntrySize)}]`);
  console.log(`  Post-create: progPtr=${hex(newProgPtr)} newDataPtr=${hex(dataAddr + equDataSize)}`);

  // Dump the VAT entry bytes for verification
  hexDump(mem, newProgPtr, vatEntrySize + 4, 'VAT entry region');

  // Dump the equation data
  hexDump(mem, dataAddr, equDataSize + 4, 'Equation data region');

  return { dataAddr, vatAddr: newProgPtr, equDataSize };
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 133: Create Y1=X Equation for DrawCmd ===');
  console.log('');
  console.log('EquObj format: type=0x03, tY1=0x10, tX=0x58');
  console.log('');

  // ── Setup runtime ──
  const { mem, executor, cpu } = createRuntime();
  console.log('Cold-booting OS...');
  coldBoot(executor, cpu, mem);
  console.log('Cold boot complete.');
  console.log('');

  // Save clean post-boot snapshot
  const memSnapshot = new Uint8Array(MEM_SIZE);
  memSnapshot.set(mem);

  // ═══════════════════════════════════════════════════════════════════════
  // Test 1: CreateEqu via OS routine
  // ═══════════════════════════════════════════════════════════════════════

  console.log('=== Test 1: CreateEqu via OS routine (0x082438) ===');

  // Run MEM_INIT first
  mem.set(memSnapshot);
  prepareCallState(cpu, mem);
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;

  console.log('  Running MEM_INIT (0x09DEE0)...');
  let memInitReturn = false;
  let memInitSteps = 0;
  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        memInitSteps++;
        if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__');
      },
      onMissingBlock(pc) {
        memInitSteps++;
        if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__');
      },
    });
  } catch (e) {
    if (e?.message === '__RET__') memInitReturn = true;
    else throw e;
  }
  console.log(`  MEM_INIT: returnHit=${memInitReturn} steps=${memInitSteps}`);

  // Seed allocator
  seedAllocator(mem);

  // Set up OP1 with Y1 equation name: [EquObj, tY1, 0, 0, 0, 0, 0, 0, 0]
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem[OP1_ADDR + 0] = EQUOBJ_TYPE;  // 0x03 = EquObj
  mem[OP1_ADDR + 1] = TY1;          // 0x10 = tY1

  console.log(`  OP1 seeded: [${hexBytes(mem, OP1_ADDR, OP1_LEN)}]`);
  console.log(`  Pointers before CreateEqu:`);
  console.log(`    progPtr=${hex(read24(mem, PROGPTR_ADDR))}`);
  console.log(`    newDataPtr=${hex(read24(mem, NEWDATA_PTR_ADDR))}`);
  console.log(`    pTemp=${hex(read24(mem, PTEMP_ADDR))}`);

  // Call CreateEqu with HL = data size (1 byte for tX token)
  prepareCallState(cpu, mem);
  cpu._hl = 1;  // size of equation data (just the tX token, 1 byte)
  cpu.a = 0x00;

  const createEquFrame = seedMinimalErrFrame(cpu, mem, CREATEEQU_RET);
  // Re-seed OP1 after prepareCallState (it may have been clobbered)
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem[OP1_ADDR + 0] = EQUOBJ_TYPE;
  mem[OP1_ADDR + 1] = TY1;

  console.log(`  OP1 before CreateEqu: [${hexBytes(mem, OP1_ADDR, OP1_LEN)}]`);
  console.log(`  HL=${hex(cpu._hl)} (data size)`);
  console.log(`  Calling CreateEqu at ${hex(CREATEEQU_ENTRY)}...`);

  const t1 = runCall('Test 1: CreateEqu', CREATEEQU_ENTRY, mem, executor, cpu, 50000, { returnPc: CREATEEQU_RET });

  const createEquDE = cpu._de;
  const createEquErrNo = mem[ERR_NO_ADDR];
  console.log(`  CreateEqu result: DE=${hex(createEquDE)} errNo=${hex(createEquErrNo, 2)}`);
  console.log(`  OP1 after CreateEqu: [${hexBytes(mem, OP1_ADDR, OP1_LEN)}]`);
  console.log(`  Pointers after CreateEqu:`);
  console.log(`    progPtr=${hex(read24(mem, PROGPTR_ADDR))}`);
  console.log(`    newDataPtr=${hex(read24(mem, NEWDATA_PTR_ADDR))}`);
  console.log(`    pTemp=${hex(read24(mem, PTEMP_ADDR))}`);

  let createEquSucceeded = t1.returnHit && createEquErrNo === 0x00;

  if (createEquSucceeded && createEquDE >= 0xD00000 && createEquDE < 0xD40000) {
    // Write the tX token at the data pointer
    // The data area should already have the 2-byte length prefix from CreateEqu
    // Write our token after it
    console.log(`  Writing tX token (0x58) at DE=${hex(createEquDE)}...`);
    console.log(`  Data area before write: [${hexBytes(mem, createEquDE - 2, 8)}]`);
    mem[createEquDE] = TX;
    console.log(`  Data area after write: [${hexBytes(mem, createEquDE - 2, 8)}]`);
    console.log('  CreateEqu: SUCCESS — Y1=X equation created via OS');
  } else {
    console.log(`  CreateEqu: ${t1.returnHit ? 'returned but' : 'did NOT return,'} errNo=${hex(createEquErrNo, 2)}`);
    console.log('  Will fall back to manual VAT construction in Test 2.');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Test 2: Manual VAT construction (always run for comparison)
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n=== Test 2: Manual VAT construction ===');

  // Re-init from snapshot
  mem.set(memSnapshot);
  prepareCallState(cpu, mem);
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;

  console.log('  Running MEM_INIT...');
  let memInit2Return = false;
  let memInit2Steps = 0;
  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        memInit2Steps++;
        if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__');
      },
      onMissingBlock(pc) {
        memInit2Steps++;
        if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__');
      },
    });
  } catch (e) {
    if (e?.message === '__RET__') memInit2Return = true;
    else throw e;
  }
  console.log(`  MEM_INIT: returnHit=${memInit2Return} steps=${memInit2Steps}`);

  // Seed allocator + graph
  seedAllocator(mem);
  seedGraphWindow(mem);
  seedGraphRAM(mem);
  mem.fill(0, PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);

  // Set graphDraw dirty bit at IY+3h (graphFlags)
  mem[0xD00083] |= 1;  // graphDraw bit 0 = dirty

  // Manually create Y1=X equation
  const manualResult = manualCreateEquY1(mem);

  // Verify BCD values
  const wrapped = wrapMem(mem);
  console.log(`  Xmin=${readReal(wrapped, XMIN_ADDR)} Xmax=${readReal(wrapped, XMAX_ADDR)}`);
  console.log(`  Ymin=${readReal(wrapped, YMIN_ADDR)} Ymax=${readReal(wrapped, YMAX_ADDR)}`);
  console.log(`  graphMode=${mem[GRAPHMODE_ADDR]}`);
  console.log(`  graphFlags(IY+3)=${hex(mem[0xD00083], 2)}`);
  console.log(`  plotFlags(IY+2)=${hex(mem[0xD00082], 2)}`);
  console.log(`  grfDBFlags(IY+4)=${hex(mem[0xD00084], 2)}`);

  // Dump the area around progPtr to verify VAT entry
  const newProgPtr = read24(mem, PROGPTR_ADDR);
  console.log(`\n  --- VAT area around progPtr (${hex(newProgPtr)}) ---`);
  hexDump(mem, newProgPtr - 4, 16, 'VAT area');

  // ═══════════════════════════════════════════════════════════════════════
  // Test 3: GraphPars with Y1=X equation present
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n=== Test 3: GraphPars with Y1=X (manual VAT) ===');

  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  console.log('  Calling GraphPars (0x09986C) with 50,000 step budget...');
  const t3 = runCall('Test 3: GraphPars with Y1=X', GRAPHPARS_ENTRY, mem, executor, cpu, 50000);

  const t3pixels = countPlotPixels(mem);
  console.log(`  plotSScreen non-zero bytes after GraphPars: ${t3pixels}`);
  if (t3pixels > 0) {
    dumpPlotSScreenSample(mem, 'Test 3 GraphPars');
  }

  // Check if GraphPars modified any equation-related state
  console.log(`  Post-GraphPars progPtr=${hex(read24(mem, PROGPTR_ADDR))}`);
  console.log(`  Post-GraphPars graphFlags(IY+3)=${hex(mem[0xD00083], 2)}`);

  // ═══════════════════════════════════════════════════════════════════════
  // Test 4: DrawCmd with Y1=X equation present
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n=== Test 4: DrawCmd with Y1=X (manual VAT) ===');

  // Re-init from snapshot for a clean DrawCmd run
  mem.set(memSnapshot);
  prepareCallState(cpu, mem);
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;

  console.log('  Running MEM_INIT...');
  let memInit4Return = false;
  let memInit4Steps = 0;
  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        memInit4Steps++;
        if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__');
      },
      onMissingBlock(pc) {
        memInit4Steps++;
        if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__');
      },
    });
  } catch (e) {
    if (e?.message === '__RET__') memInit4Return = true;
    else throw e;
  }
  console.log(`  MEM_INIT: returnHit=${memInit4Return} steps=${memInit4Steps}`);

  // Seed everything
  seedAllocator(mem);
  seedGraphWindow(mem);
  seedGraphRAM(mem);
  mem.fill(0, PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);
  mem[0xD00083] |= 1;  // graphDraw dirty

  // Create Y1=X equation manually
  const manualResult4 = manualCreateEquY1(mem);

  // First run GraphPars to parse the equation
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  console.log('  Running GraphPars first to parse equation...');
  let gpReturn = false;
  let gpSteps = 0;
  try {
    executor.runFrom(GRAPHPARS_ENTRY, 'adl', {
      maxSteps: 50000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        gpSteps++;
        if ((pc & 0xffffff) === FAKE_RET) throw new Error('__RET__');
      },
      onMissingBlock(pc) {
        gpSteps++;
        if ((pc & 0xffffff) === FAKE_RET) throw new Error('__RET__');
      },
    });
  } catch (e) {
    if (e?.message === '__RET__') gpReturn = true;
    else throw e;
  }
  console.log(`  GraphPars: returnHit=${gpReturn} steps=${gpSteps}`);

  // Re-clear plotSScreen for DrawCmd
  mem.fill(0, PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);

  // Now run DrawCmd
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  console.log('  Calling DrawCmd (0x05DD96) with 500,000 step budget...');
  const t4 = runCall('Test 4: DrawCmd with Y1=X', DRAWCMD_ENTRY, mem, executor, cpu, STEP_BUDGET);

  const t4pixels = countPlotPixels(mem);
  console.log(`  plotSScreen non-zero bytes after DrawCmd: ${t4pixels}`);
  if (t4pixels > 0) {
    dumpPlotSScreenSample(mem, 'Test 4 DrawCmd');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Test 5: DrawCmd without GraphPars (direct run)
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n=== Test 5: DrawCmd directly with Y1=X (skip GraphPars) ===');

  // Re-init from snapshot
  mem.set(memSnapshot);
  prepareCallState(cpu, mem);
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;

  console.log('  Running MEM_INIT...');
  let memInit5Return = false;
  let memInit5Steps = 0;
  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        memInit5Steps++;
        if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__');
      },
      onMissingBlock(pc) {
        memInit5Steps++;
        if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__');
      },
    });
  } catch (e) {
    if (e?.message === '__RET__') memInit5Return = true;
    else throw e;
  }
  console.log(`  MEM_INIT: returnHit=${memInit5Return} steps=${memInit5Steps}`);

  // Seed everything
  seedAllocator(mem);
  seedGraphWindow(mem);
  seedGraphRAM(mem);
  mem.fill(0, PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);
  mem[0xD00083] |= 1;  // graphDraw dirty

  // Create Y1=X equation manually
  manualCreateEquY1(mem);

  // Run DrawCmd directly
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  console.log('  Calling DrawCmd (0x05DD96) directly with 500,000 step budget...');
  const t5 = runCall('Test 5: DrawCmd direct', DRAWCMD_ENTRY, mem, executor, cpu, STEP_BUDGET);

  const t5pixels = countPlotPixels(mem);
  console.log(`  plotSScreen non-zero bytes after DrawCmd: ${t5pixels}`);
  if (t5pixels > 0) {
    dumpPlotSScreenSample(mem, 'Test 5 DrawCmd direct');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n=== Summary ===');
  console.log('');
  console.log('Equation format discovered:');
  console.log(`  EquObj type = 0x03 (not 0x12 as originally suspected)`);
  console.log(`  OP1 for Y1: [0x03, 0x10, 0x00, ...]`);
  console.log(`  tY1 = 0x10, tX = 0x58`);
  console.log(`  Equation data: 2-byte LE length + token bytes`);
  console.log('');
  console.log(`Test 1 — CreateEqu(OS): returnHit=${t1.returnHit} steps=${t1.stepCount} errNo=${hex(mem[ERR_NO_ADDR], 2)} missingBlocks=${t1.missingBlockPcs.size}`);
  console.log(`Test 2 — Manual VAT: entry created at ${hex(manualResult.vatAddr)}, data at ${hex(manualResult.dataAddr)}`);
  console.log(`Test 3 — GraphPars with Y1=X: returnHit=${t3.returnHit} steps=${t3.stepCount} pixels=${t3pixels}`);
  console.log(`Test 4 — DrawCmd after GraphPars: returnHit=${t4.returnHit} steps=${t4.stepCount} pixels=${t4pixels}`);
  console.log(`Test 5 — DrawCmd direct: returnHit=${t5.returnHit} steps=${t5.stepCount} pixels=${t5pixels}`);
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
