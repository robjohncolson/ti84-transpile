#!/usr/bin/env node

/**
 * Phase 136 — Call GraphPars body at 0x099874 (past buggy name construction).
 *
 * Session 135 found GraphPars at 0x09986C reads graphMode=0 as equation index,
 * producing wrong equation name (0x0F instead of 0x10=tY1). GraphPars never
 * reaches token evaluation.
 *
 * This probe bypasses the name construction by entering at 0x099874 with:
 *   - OP1 pre-set to correct Y1 name: [0x03, 0x10, 0x00...]
 *   - Y1=X equation created in VAT
 *   - errSP seeded (session 134 found uninitialized errSP crashes at 0x061DBA)
 *   - Graph window BCD seeded (Xmin=-10..Xmax=10, Ymin=-10..Ymax=10)
 *   - Pixel dimensions seeded (pixWideP=265, pixWide_m_2=165)
 *   - Pen color seeded (0x001F = blue)
 *   - Parser pointers (begPC/curPC/endPC) seeded to equation token data
 *
 * Goal: Does GraphPars now find the equation and begin token evaluation?
 *       Does it reach ParseInp or a graph expression evaluator?
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
const CREATEEQU_ENTRY = 0x082438;
const CREATEEQU_RET = 0x7FFFFA;

// Entry points
const GRAPHPARS_BODY_ENTRY = 0x099874;  // Past the graphMode→name construction
const GRAPHPARS_ENTRY = 0x09986C;       // Normal entry (for reference)
const MEMINIT_ENTRY = 0x09DEE0;
const MEMINIT_RET = 0x7FFFF6;

// OP registers
const OP1_ADDR = 0xd005f8;
const OP2_ADDR = 0xd00602;
const OP1_LEN = 9;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

// Parser pointers
const BEGPC_ADDR = 0xD02317;
const CURPC_ADDR = 0xD0231A;
const ENDPC_ADDR = 0xD0231D;

// Parser flags
const PARSFLAG_ADDR = 0xD02322;
const PARSFLAG2_ADDR = 0xD02323;

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

// FP category byte
const FP_CATEGORY_ADDR = 0xD0060E;

// TI tokens
const EQUOBJ_TYPE = 0x03;
const TY1 = 0x10;
const TX = 0x58;

const MAX_LOOP_ITER = 8192;

// Key known addresses for annotation
const KNOWN_ADDRS = new Map([
  [0x09986C, 'GraphPars entry'],
  [0x099874, 'GraphPars body (past name construction)'],
  [0x0998CA, 'GraphPars post-init / error recovery'],
  [0x08383D, 'ChkFindSym'],
  [0x0846EA, 'FindSym'],
  [0x084711, 'FindSym found path'],
  [0x08471B, 'FindSym found-cont'],
  [0x082C54, 'FindSym not-found'],
  [0x099914, 'ParseInp'],
  [0x099910, 'ParseInp trampoline (CALL 07FF81)'],
  [0x07FF81, 'List type pre-seeder'],
  [0x061DB2, 'JError entry'],
  [0x061DBA, 'JError LD SP,(errSP)'],
  [0x061D3A, 'ErrUndefined'],
  [0x061D3E, 'ErrMemory'],
  [0x061D02, 'error dispatch'],
  [0x061D24, 'error dispatch cont'],
  [0x03E1B4, 'JError flash unlock (errNo write)'],
  [0x006202, 'LDIR memory copy/clear'],
  [0x099B18, 'ChkFindSym wrapper (in GraphPars)'],
  [0x099B1C, 'ChkFindSym return point'],
  [0x099929, 'ParseInp error catch point'],
  [0x0686EF, 'FP dispatch table'],
  [0x06859B, 'FP category handler 0x28+'],
  [0x0689DE, 'FP dispatch SUB 0x20'],
  [0x096024, 'FP dispatch CALL target'],
  [0x061DEF, 'PushErrorHandler'],
  [0x061DD1, 'PopErrorHandler'],
  [0x09DEE0, 'MEM_INIT'],
  [0x099D45, 'GraphPars curPC write'],
  [0x07B451, 'IPoint'],
  [0x07B245, 'ILine'],
  [0x091DD9, 'Equation name builder'],
]);

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

// ── Disassembler helper ───────────────────────────────────────────────────

function disassembleAt(addr) {
  if (addr >= 0x400000) return { mnemonic: '??? (outside ROM)', length: 1 };
  try {
    return decodeEz80(romBytes, addr, true);
  } catch (e) {
    return { mnemonic: `??? (decode error: ${e.message})`, length: 1 };
  }
}

function disassembleRange(startAddr, count) {
  let pc = startAddr;
  const lines = [];
  for (let i = 0; i < count && pc < 0x400000; i++) {
    const instr = disassembleAt(pc);
    const bytes = hexBytes(romBytes, pc, instr.length);
    const label = KNOWN_ADDRS.get(pc) ? ` ; <<< ${KNOWN_ADDRS.get(pc)}` : '';
    lines.push(`  ${hex(pc)}: ${bytes.padEnd(20)} ${instr.mnemonic || instr.tag || '???'}${label}`);
    pc += instr.length;
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

// Separate FP stack from equation data area to prevent overlap.
// Equation data goes at USERMEM_ADDR (0xD1A881).
// FP stack starts 256 bytes later at 0xD1A981 — enough room for equation data.
const FPS_START_ADDR = USERMEM_ADDR + 0x100;

function seedAllocator(mem) {
  // Match MEM_INIT's real values:
  // OPBase/OPS/progPtr/pTemp all start at 0xD3FFFF (empty symbol table)
  // FPS/FPSbase start at userMem+0x100 (separate from equation data)
  // newDataPtr starts at userMem (equation data goes here)
  write24(mem, OPBASE_ADDR, EMPTY_VAT_ADDR);
  write24(mem, OPS_ADDR, EMPTY_VAT_ADDR);
  mem.fill(0x00, PTEMPCNT_ADDR, PTEMPCNT_ADDR + 4);
  write24(mem, PTEMP_ADDR, EMPTY_VAT_ADDR);
  write24(mem, PROGPTR_ADDR, EMPTY_VAT_ADDR);
  write24(mem, FPSBASE_ADDR, FPS_START_ADDR);
  write24(mem, FPS_ADDR, FPS_START_ADDR);
  write24(mem, NEWDATA_PTR_ADDR, USERMEM_ADDR);
}

function seedGraphRAM(mem) {
  // Per task spec: pixWideP=265, pixWide_m_2=165
  write16(mem, PIX_WIDE_P_ADDR, 265);
  write16(mem, PIX_WIDE_M2_ADDR, 165);
  write16(mem, DRAW_COLOR_CODE_ADDR, 0x001F);  // blue pen
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
  writeReal(wrapped, XRES_ADDR, 1);
  mem[GRAPHMODE_ADDR] = 0; // function mode
}

// ── Manual VAT entry construction ────────────────────────────────────────

// ── CreateEqu via OS routine ─────────────────────────────────────────────

function createEquY1(executor, cpu, mem, label) {
  // Use the OS CreateEqu routine (0x082438) which correctly manages all
  // pointer relationships (OPS, OPBase, progPtr, data pointers).
  //
  // Input: OP1 = [type, name, 0...], HL = data size
  // Output: DE = pointer to data area, carry = error

  // Set OP1 to Y1 equation name
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem[OP1_ADDR + 0] = EQUOBJ_TYPE;  // 0x03
  mem[OP1_ADDR + 1] = TY1;          // 0x10

  // Save and prepare CPU state
  prepareCallState(cpu, mem);
  cpu._hl = 1;  // data size = 1 byte for tX token
  cpu.a = 0x00;

  // Push return sentinel
  cpu.sp -= 3;
  write24(mem, cpu.sp, CREATEEQU_RET);

  // Seed errSP for CreateEqu (it may throw errors)
  const errFrame = cpu.sp - 18;
  write24(mem, errFrame + 0, 0xD00080);
  write24(mem, errFrame + 3, 0xD1A860);
  write24(mem, errFrame + 6, 0x000000);
  write24(mem, errFrame + 9, 0x000000);
  write24(mem, errFrame + 12, CREATEEQU_RET);
  write24(mem, errFrame + 15, 0x000040);
  write24(mem, ERR_SP_ADDR, errFrame);
  mem[ERR_NO_ADDR] = 0x00;

  // Re-set OP1 (prepareCallState may have clobbered it)
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem[OP1_ADDR + 0] = EQUOBJ_TYPE;
  mem[OP1_ADDR + 1] = TY1;

  console.log(`  [${label}] Calling CreateEqu with OP1=[${hexBytes(mem, OP1_ADDR, OP1_LEN)}] HL=${cpu._hl}`);

  let returnHit = false;
  let steps = 0;
  try {
    executor.runFrom(CREATEEQU_ENTRY, 'adl', {
      maxSteps: 50000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        steps++;
        const norm = pc & 0xffffff;
        if (norm === CREATEEQU_RET || norm === FAKE_RET) { returnHit = true; throw new Error('__RET__'); }
      },
      onMissingBlock(pc) {
        steps++;
        const norm = pc & 0xffffff;
        if (norm === CREATEEQU_RET || norm === FAKE_RET) { returnHit = true; throw new Error('__RET__'); }
      },
    });
  } catch (e) {
    if (e?.message !== '__RET__') throw e;
  }

  const de = cpu._de;
  const errNo = mem[ERR_NO_ADDR];
  console.log(`  [${label}] CreateEqu: returned=${returnHit} steps=${steps} DE=${hex(de)} errNo=${hex(errNo, 2)}`);
  console.log(`  [${label}] OP1 after: [${hexBytes(mem, OP1_ADDR, OP1_LEN)}]`);
  console.log(`  [${label}] progPtr=${hex(read24(mem, PROGPTR_ADDR))} OPS=${hex(read24(mem, OPS_ADDR))} OPBase=${hex(read24(mem, OPBASE_ADDR))}`);

  if (returnHit && errNo === 0x00 && de >= 0xD00000 && de < 0xD40000) {
    // Write tX token at the data pointer returned by CreateEqu
    mem[de] = TX;
    console.log(`  [${label}] Wrote tX (0x58) at DE=${hex(de)}`);
    console.log(`  [${label}] Data area: [${hexBytes(mem, de - 2, 6)}]`);
    return { dataAddr: de - 2, tokenAddr: de, success: true };
  } else {
    console.log(`  [${label}] CreateEqu FAILED`);
    return { dataAddr: 0, tokenAddr: 0, success: false };
  }
}

// ── Error frame setup ────────────────────────────────────────────────────

function seedErrorFrame(cpu, mem) {
  // Push FAKE_RET as main return address
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  // Build a proper PushErrorHandler frame at errSP.
  // PushErrorHandler pushes: AF, HL (=recovery addr), DE, BC, IX, IY
  // = 6 * 3 = 18 bytes on the error stack.
  // When JError fires, it does LD SP,(errSP), then POPs these in
  // reverse: POP IY, POP IX, POP BC, POP DE, POP HL, POP AF
  // then JP (HL) to the recovery address.
  const errFrameSP = cpu.sp - 18;
  write24(mem, errFrameSP + 0, 0xD00080);   // IY
  write24(mem, errFrameSP + 3, 0xD1A860);   // IX
  write24(mem, errFrameSP + 6, 0x000000);   // BC
  write24(mem, errFrameSP + 9, 0x000000);   // DE
  write24(mem, errFrameSP + 12, FAKE_RET);  // HL = recovery address
  write24(mem, errFrameSP + 15, 0x000040);  // AF (A=0, F=0x40)

  write24(mem, ERR_SP_ADDR, errFrameSP);
  mem[ERR_NO_ADDR] = 0x00;

  console.log(`  errSP seeded: ${hex(errFrameSP)} (frame: [${hexBytes(mem, errFrameSP, 18)}])`);
  console.log(`  Recovery HL at +12: ${hex(read24(mem, errFrameSP + 12))}`);
  return errFrameSP;
}

// ── Watched address ranges ───────────────────────────────────────────────

const WATCHED_ADDRS = [
  { name: 'begPC',      addr: BEGPC_ADDR,     size: 3 },
  { name: 'curPC',      addr: CURPC_ADDR,     size: 3 },
  { name: 'endPC',      addr: ENDPC_ADDR,     size: 3 },
  { name: 'parsFlag',   addr: PARSFLAG_ADDR,  size: 1 },
  { name: 'parsFlag2',  addr: PARSFLAG2_ADDR, size: 1 },
  { name: 'errNo',      addr: ERR_NO_ADDR,    size: 1 },
  { name: 'errSP',      addr: ERR_SP_ADDR,    size: 3 },
  { name: 'OP1',        addr: OP1_ADDR,       size: 9 },
  { name: 'FP_cat',     addr: FP_CATEGORY_ADDR, size: 1 },
  { name: 'FPS',        addr: FPS_ADDR,       size: 3 },
  { name: 'OPS',        addr: OPS_ADDR,       size: 3 },
];

function snapshotWatched(mem) {
  const snap = {};
  for (const w of WATCHED_ADDRS) {
    const bytes = [];
    for (let i = 0; i < w.size; i++) bytes.push(mem[w.addr + i] & 0xff);
    snap[w.name] = bytes.slice();
  }
  return snap;
}

function diffWatched(prev, curr) {
  const changes = [];
  for (const w of WATCHED_ADDRS) {
    const p = prev[w.name];
    const c = curr[w.name];
    let changed = false;
    for (let i = 0; i < w.size; i++) {
      if (p[i] !== c[i]) { changed = true; break; }
    }
    if (changed) {
      const pStr = p.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
      const cStr = c.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
      changes.push(`${w.name}: [${pStr}] -> [${cStr}]`);
    }
  }
  return changes;
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

// ── Main tracing run ─────────────────────────────────────────────────────

function traceRun(label, entryPC, mem, executor, cpu, budget) {
  console.log(`\n=== ${label} ===`);

  const pcHitCounts = new Map();
  const firstNPcs = [];
  const recentPcs = [];
  const missingBlockPcs = new Set();
  let stepCount = 0;
  let returnHit = false;
  let prevSnap = snapshotWatched(mem);
  const watchChanges = [];

  try {
    executor.runFrom(entryPC, 'adl', {
      maxSteps: budget,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        const norm = pc & 0xffffff;
        stepCount++;
        pcHitCounts.set(norm, (pcHitCounts.get(norm) || 0) + 1);
        if (firstNPcs.length < 300) firstNPcs.push(norm);
        recentPcs.push(norm);
        if (recentPcs.length > 128) recentPcs.shift();

        // Check watched address changes
        const currSnap = snapshotWatched(mem);
        const changes = diffWatched(prevSnap, currSnap);
        if (changes.length > 0) {
          watchChanges.push({ step: stepCount, pc: norm, changes });
          prevSnap = currSnap;
        }

        if (norm === FAKE_RET) { returnHit = true; throw new Error('__RET__'); }
        if (norm > 0x3fffff && norm !== FAKE_RET) throw new Error('__CRASH__');
      },
      onMissingBlock(pc) {
        const norm = pc & 0xffffff;
        stepCount++;
        missingBlockPcs.add(norm);
        pcHitCounts.set(norm, (pcHitCounts.get(norm) || 0) + 1);
        if (firstNPcs.length < 300) firstNPcs.push(norm);
        recentPcs.push(norm);
        if (recentPcs.length > 128) recentPcs.shift();

        const currSnap = snapshotWatched(mem);
        const changes = diffWatched(prevSnap, currSnap);
        if (changes.length > 0) {
          watchChanges.push({ step: stepCount, pc: norm, changes });
          prevSnap = currSnap;
        }

        if (norm === FAKE_RET) { returnHit = true; throw new Error('__RET__'); }
        if (norm > 0x3fffff && norm !== FAKE_RET) throw new Error('__CRASH__');
      },
    });
  } catch (e) {
    if (e?.message !== '__RET__' && e?.message !== '__CRASH__') throw e;
  }

  // Report results
  console.log(`  Result: returnHit=${returnHit} steps=${stepCount}`);
  console.log(`  errNo after run: ${hex(mem[ERR_NO_ADDR], 2)}`);
  console.log(`  OP1 after run: [${hexBytes(mem, OP1_ADDR, OP1_LEN)}]`);

  // Watched address change log
  if (watchChanges.length > 0) {
    console.log(`\n  === WATCHED ADDRESS CHANGES (${watchChanges.length} events) ===`);
    for (const evt of watchChanges) {
      const ann = KNOWN_ADDRS.get(evt.pc) ? ` ; ${KNOWN_ADDRS.get(evt.pc)}` : '';
      console.log(`  step=${String(evt.step).padStart(6)} PC=${hex(evt.pc)}${ann}`);
      for (const c of evt.changes) {
        console.log(`      >>> ${c}`);
      }
    }
  }

  // Missing blocks
  if (missingBlockPcs.size > 0) {
    const filtered = [...missingBlockPcs].filter(p => p !== FAKE_RET).sort((a, b) => a - b);
    if (filtered.length > 0) {
      console.log(`\n  Missing blocks (${filtered.length}):`);
      for (const pc of filtered) {
        console.log(`    ${hex(pc)}: ${pcHitCounts.get(pc)} hits`);
        if (pc < 0x400000) {
          const lines = disassembleRange(pc, 6);
          for (const line of lines) console.log(`    ${line}`);
        }
      }
    }
  }

  // Top-30 hottest PCs
  const sorted = [...pcHitCounts.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`\n  Top-30 hottest PCs:`);
  for (let i = 0; i < Math.min(30, sorted.length); i++) {
    const [pc, hits] = sorted[i];
    const isMissing = missingBlockPcs.has(pc) ? ' [MISSING]' : '';
    const ann = KNOWN_ADDRS.get(pc) ? ` ; ${KNOWN_ADDRS.get(pc)}` : '';
    console.log(`    ${hex(pc)}: ${hits} hits${isMissing}${ann}`);
  }

  // First 80 PCs
  console.log(`\n  First ${Math.min(firstNPcs.length, 80)} PCs visited:`);
  const showPcs = firstNPcs.slice(0, 80);
  for (let i = 0; i < showPcs.length; i += 8) {
    const row = showPcs.slice(i, i + 8).map(p => {
      const ann = KNOWN_ADDRS.get(p);
      return ann ? `${hex(p)}[${ann}]` : hex(p);
    });
    console.log(`    ${row.join(' ')}`);
  }

  // Last 32 PCs
  console.log(`\n  Last 32 PCs visited:`);
  const lastChunk = recentPcs.slice(-32);
  for (let i = 0; i < lastChunk.length; i += 8) {
    const row = lastChunk.slice(i, i + 8).map(p => {
      const ann = KNOWN_ADDRS.get(p);
      return ann ? `${hex(p)}[${ann}]` : hex(p);
    });
    console.log(`    ${row.join(' ')}`);
  }

  // Key PC hit analysis
  console.log(`\n  === KEY PC HIT ANALYSIS ===`);
  const keyPCs = [
    [0x099874, 'GraphPars body entry'],
    [0x0998CA, 'GraphPars post-init / error recovery'],
    [0x08383D, 'ChkFindSym'],
    [0x0846EA, 'FindSym'],
    [0x084711, 'FindSym found path'],
    [0x08471B, 'FindSym found-cont'],
    [0x082C54, 'FindSym not-found'],
    [0x099914, 'ParseInp'],
    [0x099910, 'ParseInp trampoline'],
    [0x07FF81, 'List type pre-seeder'],
    [0x061DB2, 'JError entry'],
    [0x061DBA, 'JError LD SP,(errSP)'],
    [0x061D3A, 'ErrUndefined'],
    [0x061D3E, 'ErrMemory'],
    [0x03E1B4, 'errNo write (flash unlock)'],
    [0x061DEF, 'PushErrorHandler'],
    [0x061DD1, 'PopErrorHandler'],
    [0x0686EF, 'FP dispatch table'],
    [0x06859B, 'FP category handler 0x28+'],
    [0x096024, 'FP dispatch CALL target'],
    [0x006202, 'LDIR memory copy/clear'],
    [0x099B18, 'ChkFindSym wrapper'],
    [0x099B1C, 'ChkFindSym return point'],
    [0x099929, 'ParseInp error catch point'],
    [0x099D45, 'GraphPars curPC write'],
    [0x07B451, 'IPoint'],
    [0x07B245, 'ILine'],
  ];
  for (const [pc, name] of keyPCs) {
    const hits = pcHitCounts.get(pc) || 0;
    const miss = missingBlockPcs.has(pc) ? ' [MISSING]' : '';
    if (hits > 0) {
      console.log(`    HIT  ${hex(pc)}: ${hits}x — ${name}${miss}`);
    }
  }
  // Also report misses for key ones
  const noHitPcs = keyPCs.filter(([pc]) => !pcHitCounts.has(pc));
  if (noHitPcs.length > 0) {
    console.log(`  Not reached:`);
    for (const [pc, name] of noHitPcs) {
      console.log(`    MISS ${hex(pc)} — ${name}`);
    }
  }

  // Final parser state
  console.log(`\n  === FINAL STATE ===`);
  console.log(`  begPC = ${hex(read24(mem, BEGPC_ADDR))}`);
  console.log(`  curPC = ${hex(read24(mem, CURPC_ADDR))}`);
  console.log(`  endPC = ${hex(read24(mem, ENDPC_ADDR))}`);
  console.log(`  parsFlag = ${hex(mem[PARSFLAG_ADDR], 2)}`);
  console.log(`  parsFlag2 = ${hex(mem[PARSFLAG2_ADDR], 2)}`);
  console.log(`  FP_cat = ${hex(mem[FP_CATEGORY_ADDR], 2)}`);
  console.log(`  FPS = ${hex(read24(mem, FPS_ADDR))}`);
  console.log(`  OPS = ${hex(read24(mem, OPS_ADDR))}`);
  console.log(`  errSP = ${hex(read24(mem, ERR_SP_ADDR))}`);
  console.log(`  errNo = ${hex(mem[ERR_NO_ADDR], 2)}`);
  console.log(`  OP1 = [${hexBytes(mem, OP1_ADDR, OP1_LEN)}]`);
  console.log(`  OP2 = [${hexBytes(mem, OP2_ADDR, OP1_LEN)}]`);

  return { returnHit, stepCount, pcHitCounts, missingBlockPcs, watchChanges };
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 136: GraphPars Body Entry (past name construction) ===');
  console.log('');
  console.log('Strategy: Enter at 0x099874 with OP1 pre-set to correct Y1 name');
  console.log('  [0x03, 0x10, 0x00...] (EquObj type, tY1 token)');
  console.log('');

  // ── Setup runtime ──
  const { mem, executor, cpu } = createRuntime();
  console.log('Cold-booting OS...');
  coldBoot(executor, cpu, mem);
  console.log('Cold boot complete.\n');

  // Save post-boot snapshot
  const memSnapshot = new Uint8Array(MEM_SIZE);
  memSnapshot.set(mem);

  // ═══════════════════════════════════════════════════════════════════════
  // Test A: GraphPars body (0x099874) with OP1 pre-set, 500K steps
  // ═══════════════════════════════════════════════════════════════════════

  console.log('=== Test A: GraphPars body (0x099874) with OP1=[03,10,...], 500K budget ===');

  mem.set(memSnapshot);
  prepareCallState(cpu, mem);
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;

  // Run MEM_INIT
  console.log('  Running MEM_INIT...');
  let initReturn = false;
  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
      onMissingBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
    });
  } catch (e) { if (e?.message === '__RET__') initReturn = true; else throw e; }
  console.log(`  MEM_INIT done: returned=${initReturn}`);

  // Seed allocator, graph window, graph RAM
  seedAllocator(mem);
  seedGraphWindow(mem);
  seedGraphRAM(mem);
  mem[0xD00083] |= 1; // graphDraw dirty
  mem.fill(0, PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);

  // Create Y1=X equation using OS CreateEqu (correct pointer management)
  const equ = createEquY1(executor, cpu, mem, 'Y1=X');
  if (!equ.success) {
    console.log('  ABORT: CreateEqu failed, cannot proceed with Test A');
    return;
  }

  // Pre-set OP1 to correct Y1 name: [0x03, 0x10, 0x00, ...]
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem[OP1_ADDR + 0] = EQUOBJ_TYPE;  // 0x03 = EquObj
  mem[OP1_ADDR + 1] = TY1;          // 0x10 = tY1
  console.log(`  OP1 seeded: [${hexBytes(mem, OP1_ADDR, OP1_LEN)}]`);

  // Seed parser pointers to point at equation token data
  const tokenStart = equ.tokenAddr;     // the tX token byte
  const tokenEnd = tokenStart + 1;       // past the 1-byte token
  write24(mem, BEGPC_ADDR, tokenStart);
  write24(mem, CURPC_ADDR, tokenStart);
  write24(mem, ENDPC_ADDR, tokenEnd);
  console.log(`  Parser pointers: begPC=curPC=${hex(tokenStart)} endPC=${hex(tokenEnd)}`);
  console.log(`  Token data at ${hex(tokenStart)}: [${hexBytes(mem, tokenStart, 1)}]`);

  // Log pre-call state
  console.log(`\n  Pre-call state:`);
  console.log(`    OP1 = [${hexBytes(mem, OP1_ADDR, OP1_LEN)}]`);
  console.log(`    progPtr = ${hex(read24(mem, PROGPTR_ADDR))}`);
  console.log(`    pTemp = ${hex(read24(mem, PTEMP_ADDR))}`);
  console.log(`    OPBase = ${hex(read24(mem, OPBASE_ADDR))}`);
  console.log(`    OPS = ${hex(read24(mem, OPS_ADDR))}`);
  console.log(`    FPS = ${hex(read24(mem, FPS_ADDR))}`);
  console.log(`    graphMode = ${mem[GRAPHMODE_ADDR]}`);
  console.log(`    pixWideP = ${read16(mem, PIX_WIDE_P_ADDR)}`);
  console.log(`    pixWide_m_2 = ${read16(mem, PIX_WIDE_M2_ADDR)}`);
  console.log(`    penColor = ${hex(read16(mem, DRAW_COLOR_CODE_ADDR), 4)}`);

  // Prepare CPU state for the call
  prepareCallState(cpu, mem);

  // Seed error frame
  seedErrorFrame(cpu, mem);

  // Run GraphPars body with 500K step budget
  const testA = traceRun('Test A: GraphPars body 0x099874', GRAPHPARS_BODY_ENTRY, mem, executor, cpu, 500000);

  // Check plotSScreen for pixel activity
  const pixelsA = countPlotPixels(mem);
  console.log(`\n  plotSScreen non-zero bytes: ${pixelsA}`);
  if (pixelsA > 0) {
    dumpPlotSScreenSample(mem, 'Test A');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Test B: Same but with smaller budget (10K) for detailed first-pass trace
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n\n=== Test B: GraphPars body (0x099874) — short trace (10K steps) ===');

  mem.set(memSnapshot);
  prepareCallState(cpu, mem);
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;

  // Run MEM_INIT
  let init2Return = false;
  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
      onMissingBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
    });
  } catch (e) { if (e?.message === '__RET__') init2Return = true; else throw e; }

  seedAllocator(mem);
  seedGraphWindow(mem);
  seedGraphRAM(mem);
  mem[0xD00083] |= 1;
  mem.fill(0, PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);

  const equ2 = createEquY1(executor, cpu, mem, 'Y1=X (B)');
  if (!equ2.success) {
    console.log('  ABORT: CreateEqu failed for Test B');
  }

  // Pre-set OP1
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem[OP1_ADDR + 0] = EQUOBJ_TYPE;
  mem[OP1_ADDR + 1] = TY1;

  // Seed parser pointers
  const tokenStart2 = equ2.tokenAddr;
  const tokenEnd2 = tokenStart2 + 1;
  write24(mem, BEGPC_ADDR, tokenStart2);
  write24(mem, CURPC_ADDR, tokenStart2);
  write24(mem, ENDPC_ADDR, tokenEnd2);

  prepareCallState(cpu, mem);
  seedErrorFrame(cpu, mem);

  const testB = traceRun('Test B: GraphPars body 0x099874 (short)', GRAPHPARS_BODY_ENTRY, mem, executor, cpu, 10000);

  const pixelsB = countPlotPixels(mem);
  console.log(`\n  plotSScreen non-zero bytes: ${pixelsB}`);

  // ═══════════════════════════════════════════════════════════════════════
  // Test C: Static disassembly around 0x099874
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n\n=== Static Disassembly: GraphPars body entry (0x099874) ===');
  const lines1 = disassembleRange(0x099874, 40);
  for (const l of lines1) console.log(l);

  console.log('\n=== Static Disassembly: GraphPars 0x0998B0-0x099930 ===');
  const lines2 = disassembleRange(0x0998B0, 50);
  for (const l of lines2) console.log(l);

  console.log('\n=== Static Disassembly: GraphPars ChkFindSym area (0x099B10-0x099B40) ===');
  const lines3 = disassembleRange(0x099B10, 20);
  for (const l of lines3) console.log(l);

  // ═══════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n\n=== SUMMARY ===');
  console.log(`Test A (500K budget): returnHit=${testA.returnHit} steps=${testA.stepCount} errNo=${hex(mem[ERR_NO_ADDR], 2)} pixels=${pixelsA}`);
  console.log(`Test B (10K budget):  returnHit=${testB.returnHit} steps=${testB.stepCount} pixels=${pixelsB}`);
  console.log('');
  console.log('Key questions:');
  console.log(`  Did ChkFindSym FIND the equation? ${testA.pcHitCounts.has(0x084711) ? 'YES (0x084711 hit)' : 'NO (FindSym found-path not hit)'}`);
  console.log(`  Did GraphPars reach ParseInp?     ${testA.pcHitCounts.has(0x099914) ? 'YES' : 'NO'}`);
  console.log(`  Did GraphPars reach FP dispatch?   ${testA.pcHitCounts.has(0x0686EF) ? 'YES' : 'NO'}`);
  console.log(`  Did GraphPars reach error recovery? ${testA.pcHitCounts.has(0x0998CA) ? 'YES' : 'NO'}`);
  console.log(`  Did GraphPars hit JError?          ${testA.pcHitCounts.has(0x061DB2) ? 'YES' : 'NO'}`);
  console.log(`  Did GraphPars reach LDIR loop?     ${testA.pcHitCounts.has(0x006202) ? 'YES' : 'NO'}`);
  console.log(`  Did GraphPars reach IPoint?        ${testA.pcHitCounts.has(0x07B451) ? 'YES' : 'NO'}`);
  console.log(`  Any pixels written?                ${pixelsA > 0 ? `YES (${pixelsA} bytes)` : 'NO'}`);
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
