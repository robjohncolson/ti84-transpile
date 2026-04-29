#!/usr/bin/env node

/**
 * Phase 135 — Trace GraphPars from entry through ERR:UNDEFINED.
 *
 * Goal: Understand what code path GraphPars takes between finding a
 * Y-equation in the VAT and throwing ERR:UNDEFINED (errNo=0x8D).
 * Focus on parser pointer reads, FP table lookups, and error frames.
 *
 * Test A: Full trace with Y1=X + errSP seeded, logging every PC and
 *         memory accesses to key infrastructure addresses.
 * Test B: Same but with begPC/curPC/endPC pre-seeded to point at
 *         the equation tokens — testing whether parser pointers matter.
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
  [0x0998CA, 'GraphPars post-init'],
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
  writeReal(wrapped, XRES_ADDR, 1);
  mem[GRAPHMODE_ADDR] = 0; // function mode
}

// ── Manual VAT entry construction ────────────────────────────────────────

function manualCreateEqu(mem, tokenByte, label) {
  const progPtr = read24(mem, PROGPTR_ADDR);
  const userMem = read24(mem, NEWDATA_PTR_ADDR);

  // Equation data: 2-byte LE length prefix + token
  const equDataSize = 3;
  const dataAddr = userMem;

  write16(mem, dataAddr, 1);     // length = 1 token byte
  mem[dataAddr + 2] = tokenByte; // the token

  write24(mem, NEWDATA_PTR_ADDR, dataAddr + equDataSize);

  // VAT entry (6 bytes): grows downward from progPtr
  const vatEntrySize = 6;
  const newProgPtr = progPtr - vatEntrySize;

  mem[progPtr - 1] = TY1;           // name byte: tY1 = 0x10
  mem[progPtr - 2] = 1;             // name length = 1
  mem[progPtr - 3] = EQUOBJ_TYPE;   // type = EquObj = 0x03
  mem[progPtr - 4] = (dataAddr >> 16) & 0xff;
  mem[progPtr - 5] = (dataAddr >> 8) & 0xff;
  mem[progPtr - 6] = dataAddr & 0xff;

  write24(mem, PROGPTR_ADDR, newProgPtr);
  write24(mem, PTEMP_ADDR, newProgPtr);

  console.log(`  [${label}] VAT entry at ${hex(newProgPtr)}, data at ${hex(dataAddr)}`);
  console.log(`  [${label}] Data bytes: [${hexBytes(mem, dataAddr, equDataSize)}]`);

  return { dataAddr, vatAddr: newProgPtr };
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
  //
  // We set up a frame where HL = FAKE_RET so error recovery jumps
  // to our sentinel.
  const errFrameSP = cpu.sp - 18;
  // Stack layout (low to high addr):
  //   errFrameSP + 0:  saved IY  (3 bytes)
  //   errFrameSP + 3:  saved IX  (3 bytes)
  //   errFrameSP + 6:  saved BC  (3 bytes)
  //   errFrameSP + 9:  saved DE  (3 bytes)
  //   errFrameSP + 12: saved HL  (3 bytes) -- RECOVERY ADDRESS
  //   errFrameSP + 15: saved AF  (3 bytes)
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

// ── Main tracing run ─────────────────────────────────────────────────────

function traceGraphParsDetailed(label, mem, executor, cpu, budget) {
  console.log(`\n=== ${label} ===`);

  const fullTrail = [];
  let stepCount = 0;
  let returnHit = false;
  let prevSnap = snapshotWatched(mem);

  try {
    executor.runFrom(GRAPHPARS_ENTRY, 'adl', {
      maxSteps: budget,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        const norm = pc & 0xffffff;
        stepCount++;

        // Check for watched address changes
        const currSnap = snapshotWatched(mem);
        const changes = diffWatched(prevSnap, currSnap);

        const annotation = KNOWN_ADDRS.get(norm) || '';
        const isMissing = false;

        fullTrail.push({
          step: stepCount,
          pc: norm,
          hl: cpu._hl,
          de: cpu._de,
          bc: cpu._bc,
          a: cpu.a,
          f: cpu.f,
          sp: cpu.sp,
          ix: cpu._ix,
          iy: cpu._iy,
          annotation,
          changes: changes.length > 0 ? changes : null,
          missing: isMissing,
        });

        if (changes.length > 0) prevSnap = currSnap;

        if (norm === FAKE_RET) { returnHit = true; throw new Error('__RET__'); }
        if (norm > 0x3fffff && norm !== FAKE_RET) throw new Error('__CRASH__');
      },
      onMissingBlock(pc) {
        const norm = pc & 0xffffff;
        stepCount++;

        const currSnap = snapshotWatched(mem);
        const changes = diffWatched(prevSnap, currSnap);

        const annotation = KNOWN_ADDRS.get(norm) || '';

        fullTrail.push({
          step: stepCount,
          pc: norm,
          hl: cpu._hl,
          de: cpu._de,
          bc: cpu._bc,
          a: cpu.a,
          f: cpu.f,
          sp: cpu.sp,
          ix: cpu._ix,
          iy: cpu._iy,
          annotation,
          changes: changes.length > 0 ? changes : null,
          missing: true,
        });

        if (changes.length > 0) prevSnap = currSnap;

        if (norm === FAKE_RET) { returnHit = true; throw new Error('__RET__'); }
        if (norm > 0x3fffff && norm !== FAKE_RET) throw new Error('__CRASH__');
      },
    });
  } catch (e) {
    if (e?.message !== '__RET__' && e?.message !== '__CRASH__') throw e;
  }

  console.log(`  Result: returnHit=${returnHit} steps=${stepCount}`);
  console.log(`  errNo after run: ${hex(mem[ERR_NO_ADDR], 2)}`);
  console.log(`  OP1 after run: [${hexBytes(mem, OP1_ADDR, OP1_LEN)}]`);

  // Print full trail
  console.log(`\n  === FULL EXECUTION TRAIL (${fullTrail.length} steps) ===`);
  for (const snap of fullTrail) {
    const miss = snap.missing ? ' [MISSING]' : '';
    const ann = snap.annotation ? ` ; ${snap.annotation}` : '';
    console.log(
      `  step=${String(snap.step).padStart(5)} PC=${hex(snap.pc)}${miss}` +
      ` HL=${hex(snap.hl)} DE=${hex(snap.de)} BC=${hex(snap.bc)}` +
      ` A=${hex(snap.a, 2)} F=${hex(snap.f, 2)} SP=${hex(snap.sp)}${ann}`
    );
    if (snap.changes) {
      for (const c of snap.changes) {
        console.log(`      >>> CHANGED: ${c}`);
      }
    }
  }

  // Disassemble around key PCs
  console.log('\n  === DISASSEMBLY AT KEY POINTS ===');
  const uniquePcs = [...new Set(fullTrail.map(s => s.pc))].filter(p => p < 0x400000).sort((a, b) => a - b);
  for (const pc of uniquePcs) {
    const hits = fullTrail.filter(s => s.pc === pc).length;
    const ann = KNOWN_ADDRS.get(pc) || '';
    console.log(`\n  --- ${hex(pc)} (${hits} hits)${ann ? ` — ${ann}` : ''} ---`);
    const lines = disassembleRange(pc, 8);
    for (const line of lines) console.log(line);
  }

  // Check final state of parser pointers
  console.log('\n  === FINAL PARSER STATE ===');
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

  return { returnHit, stepCount, fullTrail };
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 135: GraphPars Eval Trace ===');
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
  // Test A: Y1=X + errSP seeded, full trace
  // ═══════════════════════════════════════════════════════════════════════

  console.log('=== Test A: Y1=X + errSP, full step-by-step trace ===');

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

  // Seed everything
  seedAllocator(mem);
  seedGraphWindow(mem);
  seedGraphRAM(mem);
  mem[0xD00083] |= 1; // graphDraw dirty

  // Create Y1=X equation
  const equ = manualCreateEqu(mem, TX, 'Y1=X');

  // Log pre-call state
  console.log(`\n  Pre-call parser pointers:`);
  console.log(`    begPC = ${hex(read24(mem, BEGPC_ADDR))}`);
  console.log(`    curPC = ${hex(read24(mem, CURPC_ADDR))}`);
  console.log(`    endPC = ${hex(read24(mem, ENDPC_ADDR))}`);
  console.log(`    parsFlag = ${hex(mem[PARSFLAG_ADDR], 2)}`);
  console.log(`    parsFlag2 = ${hex(mem[PARSFLAG2_ADDR], 2)}`);
  console.log(`    OP1 = [${hexBytes(mem, OP1_ADDR, OP1_LEN)}]`);
  console.log(`    OP2 = [${hexBytes(mem, OP2_ADDR, OP1_LEN)}]`);
  console.log(`    FP_cat = ${hex(mem[FP_CATEGORY_ADDR], 2)}`);
  console.log(`    progPtr = ${hex(read24(mem, PROGPTR_ADDR))}`);
  console.log(`    pTemp = ${hex(read24(mem, PTEMP_ADDR))}`);
  console.log(`    OPS = ${hex(read24(mem, OPS_ADDR))}`);
  console.log(`    FPS = ${hex(read24(mem, FPS_ADDR))}`);

  // Prepare for GraphPars call
  prepareCallState(cpu, mem);

  // Seed error frame
  seedErrorFrame(cpu, mem);

  // Trace with 10,000 step budget
  const testA = traceGraphParsDetailed('Test A: GraphPars Y1=X + errSP', mem, executor, cpu, 10000);

  // ═══════════════════════════════════════════════════════════════════════
  // Test B: Same but also seed begPC/curPC/endPC to equation tokens
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n\n=== Test B: Y1=X + errSP + parser pointers pre-seeded ===');

  mem.set(memSnapshot);
  prepareCallState(cpu, mem);
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;

  // Run MEM_INIT
  console.log('  Running MEM_INIT...');
  let init2Return = false;
  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
      onMissingBlock(pc) { if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__RET__'); },
    });
  } catch (e) { if (e?.message === '__RET__') init2Return = true; else throw e; }
  console.log(`  MEM_INIT done: returned=${init2Return}`);

  seedAllocator(mem);
  seedGraphWindow(mem);
  seedGraphRAM(mem);
  mem[0xD00083] |= 1;

  const equ2 = manualCreateEqu(mem, TX, 'Y1=X (B)');

  // Pre-seed parser pointers to point at the equation token data
  // Equation data is at equ2.dataAddr: [01 00 58] = length 1, token tX
  // The actual token stream starts at dataAddr + 2 (past the 2-byte length)
  const tokenStart = equ2.dataAddr + 2;
  const tokenEnd = tokenStart + 1; // 1 byte token
  write24(mem, BEGPC_ADDR, tokenStart);
  write24(mem, CURPC_ADDR, tokenStart);
  write24(mem, ENDPC_ADDR, tokenEnd);
  console.log(`  Pre-seeded parser pointers: begPC=curPC=${hex(tokenStart)} endPC=${hex(tokenEnd)}`);

  prepareCallState(cpu, mem);
  seedErrorFrame(cpu, mem);

  const testB = traceGraphParsDetailed('Test B: GraphPars Y1=X + errSP + parser ptrs', mem, executor, cpu, 10000);

  // ═══════════════════════════════════════════════════════════════════════
  // Test C: Static disassembly of GraphPars entry region
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n\n=== Static Disassembly: GraphPars entry (0x09986C) ===');
  const lines1 = disassembleRange(0x09986C, 60);
  for (const l of lines1) console.log(l);

  // Also disassemble around 0x099900-0x099960 (the ParseInp / trampoline area)
  console.log('\n=== Static Disassembly: GraphPars body (0x099900-0x099960) ===');
  const lines2 = disassembleRange(0x099900, 40);
  for (const l of lines2) console.log(l);

  // Disassemble around 0x099B00-0x099B40 (ChkFindSym wrapper area)
  console.log('\n=== Static Disassembly: GraphPars ChkFindSym area (0x099B00-0x099B40) ===');
  const lines3 = disassembleRange(0x099B00, 30);
  for (const l of lines3) console.log(l);

  // Disassemble the 0x099D area (curPC write site from phase 134)
  console.log('\n=== Static Disassembly: GraphPars 0x099D30-0x099D70 ===');
  const lines4 = disassembleRange(0x099D30, 30);
  for (const l of lines4) console.log(l);

  // ═══════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n\n=== SUMMARY ===');
  console.log(`Test A (Y1=X + errSP): returnHit=${testA.returnHit} steps=${testA.stepCount} errNo=${hex(mem[ERR_NO_ADDR], 2)}`);
  console.log(`Test B (Y1=X + errSP + parser ptrs): returnHit=${testB.returnHit} steps=${testB.stepCount}`);

  // Analyze: did any test reach ParseInp, ChkFindSym, FP dispatch?
  for (const [name, result] of [['Test A', testA], ['Test B', testB]]) {
    const pcs = new Set(result.fullTrail.map(s => s.pc));
    console.log(`\n  ${name} key PC hits:`);
    console.log(`    GraphPars entry (0x09986C): ${pcs.has(0x09986C)}`);
    console.log(`    GraphPars post-init (0x0998CA): ${pcs.has(0x0998CA)}`);
    console.log(`    ChkFindSym (0x08383D): ${pcs.has(0x08383D)}`);
    console.log(`    FindSym (0x0846EA): ${pcs.has(0x0846EA)}`);
    console.log(`    ParseInp (0x099914): ${pcs.has(0x099914)}`);
    console.log(`    ParseInp trampoline (0x099910): ${pcs.has(0x099910)}`);
    console.log(`    JError entry (0x061DB2): ${pcs.has(0x061DB2)}`);
    console.log(`    JError errSP load (0x061DBA): ${pcs.has(0x061DBA)}`);
    console.log(`    ErrUndefined (0x061D3A): ${pcs.has(0x061D3A)}`);
    console.log(`    errNo write (0x03E1B4): ${pcs.has(0x03E1B4)}`);
    console.log(`    FP dispatch (0x0686EF): ${pcs.has(0x0686EF)}`);
    console.log(`    LDIR loop (0x006202): ${pcs.has(0x006202)}`);
    console.log(`    PushErrorHandler (0x061DEF): ${pcs.has(0x061DEF)}`);
    console.log(`    FAKE_RET (0x7FFFFE): ${pcs.has(FAKE_RET)}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
