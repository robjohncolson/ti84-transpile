#!/usr/bin/env node

/**
 * Phase 138 — Identify GraphPars X input slot and Y output location.
 *
 * Session 137 proved GraphPars evaluates Y1=X cleanly (341 steps, errNo=0)
 * but always returns Y=0 because the tX handler reads X from a dedicated
 * graph RAM slot, NOT the X variable in VAT.
 *
 * This probe:
 *   Part A: Disassembles tX handler at 0x07D1B4 (64 bytes raw ROM)
 *   Part B: Runtime-traces tX handler to find which RAM address X is read from
 *   Part C: Seeds candidate X slots with known BCD values and runs GraphPars
 *   Part D: Full pipeline test (multiple X values) once source/dest are found
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { writeReal, readReal } from './fp-real.mjs';

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
const CREATEEQU_RET = 0x7FFFFA;
const GRAPHPARS_RET = 0x7FFFF4;
const MEMINIT_RET = 0x7FFFF6;

// Entry points
const CREATEEQU_ENTRY = 0x082438;
const GRAPHPARS_BODY_ENTRY = 0x099874;
const MEMINIT_ENTRY = 0x09DEE0;

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

// Graph cursor variables
const CURGX2_ADDR = 0xD01471;
const CURGY2_ADDR = 0xD01477;
const CURGR_ADDR = 0xD0147D;

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

const FPS_START_ADDR = USERMEM_ADDR + 0x200;

function seedAllocator(mem) {
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
  write16(mem, PIX_WIDE_P_ADDR, 265);
  write16(mem, PIX_WIDE_M2_ADDR, 165);
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

function seedErrorFrame(cpu, mem, recoveryAddr) {
  const errFrameSP = cpu.sp - 18;
  write24(mem, errFrameSP + 0, 0xD00080);
  write24(mem, errFrameSP + 3, 0xD1A860);
  write24(mem, errFrameSP + 6, 0x000000);
  write24(mem, errFrameSP + 9, 0x000000);
  write24(mem, errFrameSP + 12, recoveryAddr);
  write24(mem, errFrameSP + 15, 0x000040);
  write24(mem, ERR_SP_ADDR, errFrameSP);
  mem[ERR_NO_ADDR] = 0x00;
  return errFrameSP;
}

function callOSRoutine(label, entry, retAddr, executor, cpu, mem, budget) {
  let returnHit = false;
  let steps = 0;
  try {
    executor.runFrom(entry, 'adl', {
      maxSteps: budget,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        steps++;
        const norm = pc & 0xffffff;
        if (norm === retAddr || norm === FAKE_RET) { returnHit = true; throw new Error('__RET__'); }
      },
      onMissingBlock(pc) {
        steps++;
        const norm = pc & 0xffffff;
        if (norm === retAddr || norm === FAKE_RET) { returnHit = true; throw new Error('__RET__'); }
      },
    });
  } catch (e) {
    if (e?.message !== '__RET__') throw e;
  }
  return { returnHit, steps };
}

// ── Create Y1=X equation via OS CreateEqu ────────────────────────────────

function createEquY1(executor, cpu, mem) {
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem[OP1_ADDR + 0] = EQUOBJ_TYPE;
  mem[OP1_ADDR + 1] = TY1;

  prepareCallState(cpu, mem);
  cpu._hl = 1;
  cpu.sp -= 3;
  write24(mem, cpu.sp, CREATEEQU_RET);

  seedErrorFrame(cpu, mem, CREATEEQU_RET);

  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem[OP1_ADDR + 0] = EQUOBJ_TYPE;
  mem[OP1_ADDR + 1] = TY1;

  const result = callOSRoutine('CreateEqu', CREATEEQU_ENTRY, CREATEEQU_RET, executor, cpu, mem, 50000);
  const de = cpu._de;
  const errNo = mem[ERR_NO_ADDR];

  console.log(`  CreateEqu: returned=${result.returnHit} steps=${result.steps} DE=${hex(de)} errNo=${hex(errNo, 2)}`);

  if (result.returnHit && errNo === 0x00 && de >= 0xD00000 && de < 0xD40000) {
    mem[de] = TX;
    console.log(`  Wrote tX (0x58) at DE=${hex(de)}`);
    return { dataAddr: de - 2, tokenAddr: de, success: true };
  }
  console.log(`  CreateEqu FAILED`);
  return { dataAddr: 0, tokenAddr: 0, success: false };
}

// ── Call GraphPars body with memory-read tracing ─────────────────────────

// Candidate addresses for X source — we snapshot these before/after GraphPars
const CANDIDATE_X_ADDRS = [
  { name: 'curGX2', addr: CURGX2_ADDR, size: 9 },
  { name: 'curGY2', addr: CURGY2_ADDR, size: 9 },
  { name: 'curGR',  addr: CURGR_ADDR,  size: 9 },
  { name: 'Xmin',   addr: XMIN_ADDR,   size: 9 },
  { name: 'Xmax',   addr: XMAX_ADDR,   size: 9 },
  { name: 'OP1',    addr: OP1_ADDR,     size: 9 },
  { name: 'OP2',    addr: OP2_ADDR,     size: 9 },
  { name: 'OP3',    addr: 0xD0060C,     size: 9 },
  { name: 'OP4',    addr: 0xD00616,     size: 9 },
  { name: 'OP5',    addr: 0xD00620,     size: 9 },
  { name: 'OP6',    addr: 0xD0062A,     size: 9 },
  { name: 'FP_cat', addr: FP_CATEGORY_ADDR, size: 1 },
];

function snapshotCandidates(mem) {
  const snap = {};
  for (const c of CANDIDATE_X_ADDRS) {
    const bytes = [];
    for (let i = 0; i < c.size; i++) bytes.push(mem[c.addr + i] & 0xff);
    snap[c.name] = bytes;
  }
  return snap;
}

function callGraphParsBodyTraced(executor, cpu, mem, equTokenAddr, traceAddrs) {
  // Pre-set OP1 to correct Y1 name
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem[OP1_ADDR + 0] = EQUOBJ_TYPE;
  mem[OP1_ADDR + 1] = TY1;

  // Seed parser pointers
  write24(mem, BEGPC_ADDR, equTokenAddr);
  write24(mem, CURPC_ADDR, equTokenAddr);
  write24(mem, ENDPC_ADDR, equTokenAddr + 1);

  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, GRAPHPARS_RET);

  seedErrorFrame(cpu, mem, GRAPHPARS_RET);

  // Re-set OP1
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem[OP1_ADDR + 0] = EQUOBJ_TYPE;
  mem[OP1_ADDR + 1] = TY1;

  let returnHit = false;
  let steps = 0;
  const firstPcs = [];
  const keyHits = new Map();

  // Key addresses in tX handler path
  const KEY_PCS = new Map([
    [0x07D1B4, 'tX_handler_entry'],
    [0x07D21E, 'tX_graph_path'],
    [0x07D233, 'tX_sub_0x07D233'],
    [0x07D245, 'tX_sub_0x07D245'],
    [0x07D272, 'tX_JP_0x07CFA7'],
    [0x07CFA7, 'graphVarRecall'],
    [0x07C8B7, 'graphVarRecall_inner'],
    [0x097A64, 'graphXCheck'],
    [0x07F9FB, 'copyToOP1'],
    [0x07F978, 'LDI_x9_copy'],
    [0x07FA0D, 'copyFromOP1'],
    [0x07FD30, 'OP1_OP2_swap'],
    [0x07FE24, 'FP_type_fixup'],
    [0x07FE5A, 'FP_type_modify'],
    [0x07F7A4, 'typeCheck_0x0C'],
    [0x07F7BD, 'getOP1type'],
    [0x08383D, 'ChkFindSym'],
    [0x0846EA, 'FindSym'],
    [0x084711, 'FindSym_found'],
    [0x0686EF, 'FP_dispatch'],
    [0x061DB2, 'JError'],
    [0x099874, 'GraphPars_body'],
    [0x099D45, 'GP_curPC_write'],
  ]);

  try {
    executor.runFrom(GRAPHPARS_BODY_ENTRY, 'adl', {
      maxSteps: 5000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        steps++;
        const norm = pc & 0xffffff;
        if (firstPcs.length < 500) firstPcs.push(norm);
        if (KEY_PCS.has(norm)) {
          const name = KEY_PCS.get(norm);
          if (!keyHits.has(name)) keyHits.set(name, []);
          keyHits.get(name).push(steps);
        }
        if (norm === GRAPHPARS_RET || norm === FAKE_RET) { returnHit = true; throw new Error('__RET__'); }
      },
      onMissingBlock(pc) {
        steps++;
        const norm = pc & 0xffffff;
        if (firstPcs.length < 500) firstPcs.push(norm);
        if (KEY_PCS.has(norm)) {
          const name = KEY_PCS.get(norm);
          if (!keyHits.has(name)) keyHits.set(name, []);
          keyHits.get(name).push(steps);
        }
        if (norm === GRAPHPARS_RET || norm === FAKE_RET) { returnHit = true; throw new Error('__RET__'); }
      },
    });
  } catch (e) {
    if (e?.message !== '__RET__') throw e;
  }

  const errNo = mem[ERR_NO_ADDR];
  return { returnHit, steps, errNo, firstPcs, keyHits };
}

// ── Part A: ROM disassembly ──────────────────────────────────────────────

function partA() {
  console.log('=== PART A: ROM Disassembly of tX handler at 0x07D1B4 ===\n');

  function read24LE(off) {
    return romBytes[off] | (romBytes[off+1] << 8) | (romBytes[off+2] << 16);
  }

  // Dump 64 raw bytes
  console.log('Raw bytes at 0x07D1B4 (64 bytes):');
  for (let i = 0; i < 64; i += 16) {
    const addr = 0x07D1B4 + i;
    const bytes = [];
    for (let j = 0; j < 16; j++) bytes.push(romBytes[addr + j].toString(16).toUpperCase().padStart(2, '0'));
    console.log(`  ${hex(addr)}: ${bytes.join(' ')}`);
  }

  // Search for 3-byte LE address patterns in 0xD0xxxx range within tX handler area
  console.log('\nSearching 0x07D1B4-0x07D2B4 for LD A,(nn) / LD HL,(nn) patterns:');
  for (let off = 0x07D1B4; off < 0x07D2B4; off++) {
    const b = romBytes[off];
    if (b === 0x3A && off + 3 < 0x400000) {
      const addr = read24LE(off + 1);
      if ((addr & 0xFF0000) === 0xD00000) {
        console.log(`  ${hex(off)}: LD A,(${hex(addr)})`);
      }
    }
    if (b === 0xED && off + 4 < 0x400000) {
      const b1 = romBytes[off + 1];
      if (b1 === 0x6B || b1 === 0x5B || b1 === 0x4B) {
        const addr = read24LE(off + 2);
        if ((addr & 0xFF0000) === 0xD00000) {
          const reg = b1 === 0x6B ? 'HL' : b1 === 0x5B ? 'DE' : 'BC';
          console.log(`  ${hex(off)}: LD ${reg},(${hex(addr)})`);
        }
      }
    }
  }

  // Search key subroutines too
  console.log('\nSearching subroutines (0x07C800-0x07FF00) for D0xxxx reads:');
  const subroutineReads = [];
  for (let off = 0x07C800; off < 0x07FF00; off++) {
    const b = romBytes[off];
    if (b === 0x3A && off + 3 < 0x400000) {
      const addr = read24LE(off + 1);
      if (addr >= 0xD01400 && addr < 0xD01500) {
        subroutineReads.push({ off, instr: `LD A,(${hex(addr)})`, addr });
      }
    }
    if (b === 0xED && off + 4 < 0x400000) {
      const b1 = romBytes[off + 1];
      if (b1 === 0x6B || b1 === 0x5B || b1 === 0x4B) {
        const addr = read24LE(off + 2);
        if (addr >= 0xD01400 && addr < 0xD01500) {
          const reg = b1 === 0x6B ? 'HL' : b1 === 0x5B ? 'DE' : 'BC';
          subroutineReads.push({ off, instr: `LD ${reg},(${hex(addr)})`, addr });
        }
      }
    }
  }
  for (const r of subroutineReads) {
    console.log(`  ${hex(r.off)}: ${r.instr}`);
  }

  // Also check the FP evaluation area 0x068000-0x06A000 and graph area 0x097000-0x09A000
  console.log('\nSearching FP/graph areas for curGX2 region reads (0xD01460-0xD01490):');
  const areas = [[0x068000, 0x06A000], [0x097000, 0x09A000], [0x09D000, 0x0A0000]];
  for (const [start, end] of areas) {
    for (let off = start; off < end; off++) {
      const b = romBytes[off];
      if (b === 0x21 && off + 3 < 0x400000) {
        const addr = read24LE(off + 1);
        if (addr >= 0xD01460 && addr < 0xD01490) {
          console.log(`  ${hex(off)}: LD HL,${hex(addr)}`);
        }
      }
      if (b === 0x11 && off + 3 < 0x400000) {
        const addr = read24LE(off + 1);
        if (addr >= 0xD01460 && addr < 0xD01490) {
          console.log(`  ${hex(off)}: LD DE,${hex(addr)}`);
        }
      }
    }
  }
  console.log('');
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 138: GraphPars X Input Slot + Y Output Location ===\n');

  // Part A: Static disassembly
  partA();

  // ── Setup runtime ──
  const { mem, executor, cpu } = createRuntime();
  console.log('Cold-booting OS...');
  coldBoot(executor, cpu, mem);
  console.log('Cold boot complete.\n');

  // Run MEM_INIT
  prepareCallState(cpu, mem);
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  console.log('Running MEM_INIT...');
  const memInitResult = callOSRoutine('MEM_INIT', MEMINIT_ENTRY, MEMINIT_RET, executor, cpu, mem, 100000);
  console.log(`MEM_INIT: returned=${memInitResult.returnHit} steps=${memInitResult.steps}\n`);

  // Seed allocator, graph window, graph RAM
  seedAllocator(mem);
  seedGraphWindow(mem);
  seedGraphRAM(mem);
  mem[0xD00083] |= 1;

  // Create Y1=X equation
  console.log('Creating Y1=X equation...');
  const equ = createEquY1(executor, cpu, mem);
  if (!equ.success) {
    console.log('ABORT: CreateEqu failed');
    return;
  }

  // Save allocator state after CreateEqu
  const postEquOPS = read24(mem, OPS_ADDR);
  const postEquOPBase = read24(mem, OPBASE_ADDR);
  const postEquProgPtr = read24(mem, PROGPTR_ADDR);
  const postEquFPS = read24(mem, FPS_ADDR);
  console.log(`  Post-CreateEqu: OPS=${hex(postEquOPS)} FPS=${hex(postEquFPS)}`);

  const wrapped = wrapMem(mem);

  // Create X real variable immediately after Y1 equation
  console.log('\nCreating X real variable...');
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem[OP1_ADDR + 0] = 0x00; // RealObj
  mem[OP1_ADDR + 1] = TX;   // 0x58 = X

  prepareCallState(cpu, mem);
  cpu._hl = 9;
  cpu.sp -= 3;
  const CREATEREAL_RET_ADDR = 0x7FFFF0;
  write24(mem, cpu.sp, CREATEREAL_RET_ADDR);
  seedErrorFrame(cpu, mem, CREATEREAL_RET_ADDR);

  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem[OP1_ADDR + 0] = 0x00;
  mem[OP1_ADDR + 1] = TX;

  const crResult = callOSRoutine('CreateReal', CREATEEQU_ENTRY, CREATEREAL_RET_ADDR, executor, cpu, mem, 50000);
  const xVarDE = cpu._de;
  const xVarErr = mem[ERR_NO_ADDR];
  console.log(`  CreateReal(X): returned=${crResult.returnHit} steps=${crResult.steps} DE=${hex(xVarDE)} errNo=${hex(xVarErr, 2)}`);

  let xVarDataAddr = 0;
  if (crResult.returnHit && xVarErr === 0x00 && xVarDE >= 0xD00000 && xVarDE < 0xD40000) {
    xVarDataAddr = xVarDE;
    writeReal(wrapped, xVarDataAddr, 0);
    console.log(`  X variable data at ${hex(xVarDataAddr)}: [${hexBytes(mem, xVarDataAddr, 9)}]`);
  } else {
    console.log('  CreateReal(X) FAILED — will test without X in VAT');
  }

  // Save final allocator state (after both creates)
  const finalOPS = read24(mem, OPS_ADDR);
  const finalOPBase = read24(mem, OPBASE_ADDR);
  const finalProgPtr = read24(mem, PROGPTR_ADDR);
  const finalFPS = read24(mem, FPS_ADDR);
  console.log(`  Final allocator: OPS=${hex(finalOPS)} FPS=${hex(finalFPS)}\n`);

  // ═══════════════════════════════════════════════════════════════════════
  // PART B: Runtime trace — GraphPars with zero-initialized candidates
  // Identify which key addresses are hit
  // ═══════════════════════════════════════════════════════════════════════

  // Common allocator state to use throughout
  const useOPS = xVarDataAddr ? finalOPS : postEquOPS;
  const useOPBase = xVarDataAddr ? finalOPBase : postEquOPBase;
  const useProgPtr = xVarDataAddr ? finalProgPtr : postEquProgPtr;
  const useFPS = xVarDataAddr ? finalFPS : postEquFPS;

  console.log('=== PART B: Runtime trace of GraphPars body (tX handler path) ===\n');
  write24(mem, OPS_ADDR, useOPS);
  write24(mem, OPBASE_ADDR, useOPBase);
  write24(mem, PROGPTR_ADDR, useProgPtr);
  write24(mem, FPS_ADDR, useFPS);
  write24(mem, FPSBASE_ADDR, FPS_START_ADDR);

  // Snapshot candidates before
  const snapBefore = snapshotCandidates(mem);
  console.log('Candidate addresses BEFORE GraphPars:');
  for (const c of CANDIDATE_X_ADDRS) {
    console.log(`  ${c.name.padEnd(8)} (${hex(c.addr)}): [${snapBefore[c.name].map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}]`);
  }
  console.log('');

  // Run GraphPars with trace
  const gpTrace = callGraphParsBodyTraced(executor, cpu, mem, equ.tokenAddr, null);
  console.log(`GraphPars: returned=${gpTrace.returnHit} steps=${gpTrace.steps} errNo=${hex(gpTrace.errNo, 2)}`);

  // Snapshot candidates after
  const snapAfter = snapshotCandidates(mem);
  console.log('\nCandidate addresses AFTER GraphPars:');
  for (const c of CANDIDATE_X_ADDRS) {
    const before = snapBefore[c.name].map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    const after = snapAfter[c.name].map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
    const changed = before !== after ? ' <<< CHANGED' : '';
    console.log(`  ${c.name.padEnd(8)} (${hex(c.addr)}): [${after}]${changed}`);
  }

  // Key PC hits
  console.log('\nKey PC hits in tX handler path:');
  for (const [name, steps] of gpTrace.keyHits) {
    console.log(`  ${name.padEnd(25)} hit at steps: [${steps.join(', ')}]`);
  }

  // Show PCs around tX handler entry (step 296)
  // Show PCs 270-341 to see what sets up OP1 before tX
  console.log(`\nPCs around tX handler (steps 260-341 of ${gpTrace.firstPcs.length}):`);
  for (let i = 260; i < Math.min(341, gpTrace.firstPcs.length); i += 8) {
    const row = gpTrace.firstPcs.slice(i, Math.min(i + 8, gpTrace.firstPcs.length)).map(p => hex(p));
    console.log(`  step ${i}: ${row.join(' ')}`);
  }

  // Show first 80 PCs
  console.log(`\nFirst 80 PCs (of ${gpTrace.firstPcs.length}):`);
  for (let i = 0; i < Math.min(80, gpTrace.firstPcs.length); i += 8) {
    const row = gpTrace.firstPcs.slice(i, i + 8).map(p => hex(p));
    console.log(`  ${row.join(' ')}`);
  }

  // FPS after
  const fpsAfter = read24(mem, FPS_ADDR);
  console.log(`\nFPS after GraphPars: ${hex(fpsAfter)} (delta=${fpsAfter - postEquFPS})`);

  // Check if any data was pushed to FP stack
  if (fpsAfter > postEquFPS) {
    console.log(`FP stack data (${fpsAfter - postEquFPS} bytes):`);
    console.log(`  [${hexBytes(mem, postEquFPS, Math.min(fpsAfter - postEquFPS, 18))}]`);
  }

  // Dump OP1-OP6 after
  console.log(`\nOP registers after GraphPars:`);
  console.log(`  OP1: [${hexBytes(mem, OP1_ADDR, 9)}]`);
  console.log(`  OP2: [${hexBytes(mem, OP2_ADDR, 9)}]`);
  console.log(`  OP3: [${hexBytes(mem, 0xD0060C, 9)}]`);
  console.log(`  OP4: [${hexBytes(mem, 0xD00616, 9)}]`);
  console.log(`  OP5: [${hexBytes(mem, 0xD00620, 9)}]`);
  console.log(`  OP6: [${hexBytes(mem, 0xD0062A, 9)}]`);

  // Dump graph cursor area
  console.log(`\nGraph cursor area (0xD01468-0xD014A0):`);
  console.log(`  [${hexBytes(mem, 0xD01468, 56)}]`);

  // ═══════════════════════════════════════════════════════════════════════
  // PART B2: Trace with OP1 monitoring at each step near tX handler
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n\n=== PART B2: OP1 state during GraphPars execution ===\n');

  write24(mem, OPS_ADDR, useOPS);
  write24(mem, OPBASE_ADDR, useOPBase);
  write24(mem, PROGPTR_ADDR, useProgPtr);
  write24(mem, FPS_ADDR, useFPS);
  write24(mem, FPSBASE_ADDR, FPS_START_ADDR);
  seedGraphWindow(mem);
  seedGraphRAM(mem);

  // Seed curGX2 with 5.0 for this test
  writeReal(wrapped, CURGX2_ADDR, 5.0);

  // Run GraphPars with OP1-monitoring trace
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem[OP1_ADDR + 0] = EQUOBJ_TYPE;
  mem[OP1_ADDR + 1] = TY1;

  write24(mem, BEGPC_ADDR, equ.tokenAddr);
  write24(mem, CURPC_ADDR, equ.tokenAddr);
  write24(mem, ENDPC_ADDR, equ.tokenAddr + 1);

  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, GRAPHPARS_RET);
  seedErrorFrame(cpu, mem, GRAPHPARS_RET);

  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem[OP1_ADDR + 0] = EQUOBJ_TYPE;
  mem[OP1_ADDR + 1] = TY1;

  let prevOP1 = hexBytes(mem, OP1_ADDR, 9);
  let b2Steps = 0;
  let b2ReturnHit = false;
  const op1Changes = [];

  try {
    executor.runFrom(GRAPHPARS_BODY_ENTRY, 'adl', {
      maxSteps: 5000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        b2Steps++;
        const norm = pc & 0xffffff;
        const curOP1 = hexBytes(mem, OP1_ADDR, 9);
        if (curOP1 !== prevOP1) {
          op1Changes.push({ step: b2Steps, pc: norm, op1: curOP1 });
          prevOP1 = curOP1;
        }
        if (norm === GRAPHPARS_RET || norm === FAKE_RET) { b2ReturnHit = true; throw new Error('__RET__'); }
      },
      onMissingBlock(pc) {
        b2Steps++;
        const norm = pc & 0xffffff;
        const curOP1 = hexBytes(mem, OP1_ADDR, 9);
        if (curOP1 !== prevOP1) {
          op1Changes.push({ step: b2Steps, pc: norm, op1: curOP1 });
          prevOP1 = curOP1;
        }
        if (norm === GRAPHPARS_RET || norm === FAKE_RET) { b2ReturnHit = true; throw new Error('__RET__'); }
      },
    });
  } catch (e) {
    if (e?.message !== '__RET__') throw e;
  }

  console.log(`GraphPars: returned=${b2ReturnHit} steps=${b2Steps}`);
  console.log(`\nOP1 changes during execution (${op1Changes.length}):`);
  for (const c of op1Changes) {
    console.log(`  step=${String(c.step).padStart(4)} PC=${hex(c.pc)} OP1=[${c.op1}]`);
  }
  console.log(`\nFinal OP1: [${hexBytes(mem, OP1_ADDR, 9)}]`);
  console.log(`Final OP2: [${hexBytes(mem, OP2_ADDR, 9)}]`);
  console.log(`curGX2 after: [${hexBytes(mem, CURGX2_ADDR, 9)}]`);
  console.log(`curGY2 after: [${hexBytes(mem, CURGY2_ADDR, 9)}]`);

  // ═══════════════════════════════════════════════════════════════════════
  // PART C: Seed candidate X slots with 5.0 and see which produces Y=5.0
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n\n=== PART C: Seed candidate X slots with 5.0, run GraphPars ===\n');

  // BCD 5.0 = [0x00, 0x81, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]
  const candidateSlots = [
    { name: 'curGX2',  addr: CURGX2_ADDR },
    { name: 'curGR',   addr: CURGR_ADDR },
    { name: 'Xmin',    addr: XMIN_ADDR },
  ];

  for (const slot of candidateSlots) {
    console.log(`--- Testing X source = ${slot.name} (${hex(slot.addr)}) ---`);

    // Reset allocator
    write24(mem, OPS_ADDR, postEquOPS);
    write24(mem, OPBASE_ADDR, postEquOPBase);
    write24(mem, PROGPTR_ADDR, postEquProgPtr);
    write24(mem, FPS_ADDR, postEquFPS);
    write24(mem, FPSBASE_ADDR, FPS_START_ADDR);

    // Re-seed graph window (in case previous run corrupted it)
    seedGraphWindow(mem);
    seedGraphRAM(mem);

    // Seed the candidate slot with 5.0
    writeReal(wrapped, slot.addr, 5.0);
    console.log(`  Seeded ${slot.name}: [${hexBytes(mem, slot.addr, 9)}]`);

    // Zero out curGY2 to detect writes
    mem.fill(0x00, CURGY2_ADDR, CURGY2_ADDR + 9);

    // Snapshot all OP regs
    const opsBefore = {};
    for (let i = 0; i < 6; i++) {
      const addr = OP1_ADDR + i * 11;
      opsBefore[i] = hexBytes(mem, addr, 9);
    }

    // Run GraphPars
    const gp = callGraphParsBodyTraced(executor, cpu, mem, equ.tokenAddr, null);
    console.log(`  GraphPars: returned=${gp.returnHit} steps=${gp.steps} errNo=${hex(gp.errNo, 2)}`);

    // Check OP1 as Y result (strip bit 6 flag)
    const op1Type = mem[OP1_ADDR] & 0xff;
    const op1Stripped = op1Type & 0x3F;
    console.log(`  OP1 after: [${hexBytes(mem, OP1_ADDR, 9)}] (type=${hex(op1Type, 2)}, stripped=${hex(op1Stripped, 2)})`);

    // Try decoding OP1 as real
    const savedType = mem[OP1_ADDR];
    mem[OP1_ADDR] = savedType & 0x3F;
    try {
      const val = readReal(wrapped, OP1_ADDR);
      console.log(`  OP1 decoded: ${val}`);
    } catch (e) {
      console.log(`  OP1 decode failed: ${e.message}`);
    }
    mem[OP1_ADDR] = savedType;

    // Check curGY2
    console.log(`  curGY2 after: [${hexBytes(mem, CURGY2_ADDR, 9)}]`);
    try {
      const gy = readReal(wrapped, CURGY2_ADDR);
      console.log(`  curGY2 decoded: ${gy}`);
    } catch (e) {
      console.log(`  curGY2 decode failed: ${e.message}`);
    }

    // Check OP2-OP6
    for (let i = 1; i < 6; i++) {
      const addr = OP1_ADDR + i * 11;
      // Note: OP regs are 11 bytes apart but only 9 bytes of data
      const actualAddr = OP2_ADDR + (i - 1) * 10; // Actually check the real layout
    }
    console.log(`  OP2: [${hexBytes(mem, OP2_ADDR, 9)}]`);
    console.log(`  OP3: [${hexBytes(mem, 0xD0060C, 9)}]`);

    // Check FPS
    const fpsNow = read24(mem, FPS_ADDR);
    const fpsDelta = fpsNow - postEquFPS;
    console.log(`  FPS delta: ${fpsDelta}`);
    if (fpsDelta > 0) {
      console.log(`  FP stack: [${hexBytes(mem, postEquFPS, Math.min(fpsDelta, 18))}]`);
      // Try decoding top of FP stack
      try {
        const fpVal = readReal(wrapped, postEquFPS);
        console.log(`  FP stack top decoded: ${fpVal}`);
      } catch (e) {
        console.log(`  FP stack top decode failed: ${e.message}`);
      }
    }

    // Scan broad area around graph cursor for the seeded value 5.0
    // BCD 5.0 mantissa starts with 0x50
    console.log(`  Scanning 0xD01460-0xD014B0 for BCD 5.0 pattern (81 50):`);
    for (let addr = 0xD01460; addr < 0xD014B0; addr++) {
      if (mem[addr] === 0x81 && mem[addr + 1] === 0x50) {
        console.log(`    Found at ${hex(addr)}: [${hexBytes(mem, addr - 1, 11)}]`);
      }
    }

    // Also scan OP register area
    console.log(`  Scanning 0xD005F0-0xD00640 for BCD 5.0 pattern (81 50):`);
    for (let addr = 0xD005F0; addr < 0xD00640; addr++) {
      if (mem[addr] === 0x81 && mem[addr + 1] === 0x50) {
        console.log(`    Found at ${hex(addr)}: [${hexBytes(mem, addr - 1, 11)}]`);
      }
    }

    console.log('');
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PART D: Wider scan — seed curGX2 with distinct values and check output
  // ═══════════════════════════════════════════════════════════════════════

  console.log('=== PART D: Multi-value pipeline test ===\n');

  const testValues = [0, 1, 2, 5, 10, -3];

  // Test with curGX2 as X source
  console.log('Testing curGX2 as X source:');
  for (const xVal of testValues) {
    // Reset allocator
    write24(mem, OPS_ADDR, postEquOPS);
    write24(mem, OPBASE_ADDR, postEquOPBase);
    write24(mem, PROGPTR_ADDR, postEquProgPtr);
    write24(mem, FPS_ADDR, postEquFPS);
    write24(mem, FPSBASE_ADDR, FPS_START_ADDR);
    seedGraphWindow(mem);
    seedGraphRAM(mem);

    // Seed curGX2 with test value
    writeReal(wrapped, CURGX2_ADDR, xVal);

    // Zero output candidates
    mem.fill(0x00, CURGY2_ADDR, CURGY2_ADDR + 9);

    // Run GraphPars
    const gp = callGraphParsBodyTraced(executor, cpu, mem, equ.tokenAddr, null);

    // Read OP1 (strip evaluated flag)
    const savedT = mem[OP1_ADDR];
    mem[OP1_ADDR] = savedT & 0x3F;
    let yFromOP1 = null;
    try { yFromOP1 = readReal(wrapped, OP1_ADDR); } catch (e) { /* ignore */ }
    mem[OP1_ADDR] = savedT;

    // Read curGY2
    let yFromCurGY2 = null;
    try { yFromCurGY2 = readReal(wrapped, CURGY2_ADDR); } catch (e) { /* ignore */ }

    // Read FP stack
    const fpsNow = read24(mem, FPS_ADDR);
    let yFromFPS = null;
    if (fpsNow > postEquFPS) {
      try { yFromFPS = readReal(wrapped, postEquFPS); } catch (e) { /* ignore */ }
    }

    const match = (v) => v !== null && Math.abs(v - xVal) < 0.001 ? 'MATCH' : 'no';
    console.log(`  X=${String(xVal).padStart(4)}: OP1=${yFromOP1 !== null ? yFromOP1.toFixed(4) : 'n/a'} (${match(yFromOP1)}) | curGY2=${yFromCurGY2 !== null ? yFromCurGY2.toFixed(4) : 'n/a'} (${match(yFromCurGY2)}) | FPS=${yFromFPS !== null ? yFromFPS.toFixed(4) : 'n/a'} (${match(yFromFPS)}) | steps=${gp.steps} errNo=${hex(gp.errNo, 2)}`);
  }

  // Also test with Xmin slot (since tX in normal eval uses FindSym path)
  console.log('\nTesting Xmin as X source:');
  for (const xVal of testValues) {
    write24(mem, OPS_ADDR, postEquOPS);
    write24(mem, OPBASE_ADDR, postEquOPBase);
    write24(mem, PROGPTR_ADDR, postEquProgPtr);
    write24(mem, FPS_ADDR, postEquFPS);
    write24(mem, FPSBASE_ADDR, FPS_START_ADDR);
    seedGraphWindow(mem);
    seedGraphRAM(mem);

    // Seed Xmin with test value (replaces Xmin=-10 from seedGraphWindow)
    writeReal(wrapped, XMIN_ADDR, xVal);
    // Keep curGX2 at zero
    mem.fill(0x00, CURGX2_ADDR, CURGX2_ADDR + 9);
    mem[CURGX2_ADDR + 1] = 0x80; // zero exponent
    mem.fill(0x00, CURGY2_ADDR, CURGY2_ADDR + 9);

    const gp = callGraphParsBodyTraced(executor, cpu, mem, equ.tokenAddr, null);

    const savedT = mem[OP1_ADDR];
    mem[OP1_ADDR] = savedT & 0x3F;
    let yFromOP1 = null;
    try { yFromOP1 = readReal(wrapped, OP1_ADDR); } catch (e) { /* ignore */ }
    mem[OP1_ADDR] = savedT;

    let yFromCurGY2 = null;
    try { yFromCurGY2 = readReal(wrapped, CURGY2_ADDR); } catch (e) { /* ignore */ }

    const fpsNow = read24(mem, FPS_ADDR);
    let yFromFPS = null;
    if (fpsNow > postEquFPS) {
      try { yFromFPS = readReal(wrapped, postEquFPS); } catch (e) { /* ignore */ }
    }

    const match = (v) => v !== null && Math.abs(v - xVal) < 0.001 ? 'MATCH' : 'no';
    console.log(`  X=${String(xVal).padStart(4)}: OP1=${yFromOP1 !== null ? yFromOP1.toFixed(4) : 'n/a'} (${match(yFromOP1)}) | curGY2=${yFromCurGY2 !== null ? yFromCurGY2.toFixed(4) : 'n/a'} (${match(yFromCurGY2)}) | FPS=${yFromFPS !== null ? yFromFPS.toFixed(4) : 'n/a'} (${match(yFromFPS)}) | steps=${gp.steps} errNo=${hex(gp.errNo, 2)}`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PART E: Broader memory diff — find Y output by diffing entire D0xxxx
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n\n=== PART E: Memory diff — seed curGX2=7.0 and find where 7.0 appears ===\n');

  // Take a full snapshot of D0xxxx before GraphPars
  write24(mem, OPS_ADDR, postEquOPS);
  write24(mem, OPBASE_ADDR, postEquOPBase);
  write24(mem, PROGPTR_ADDR, postEquProgPtr);
  write24(mem, FPS_ADDR, postEquFPS);
  write24(mem, FPSBASE_ADDR, FPS_START_ADDR);
  seedGraphWindow(mem);
  seedGraphRAM(mem);

  writeReal(wrapped, CURGX2_ADDR, 7.0);
  mem.fill(0x00, CURGY2_ADDR, CURGY2_ADDR + 9);

  // Snapshot key RAM regions before
  const snapRegions = [
    { name: 'OP_area', start: 0xD005F0, size: 0x60 },
    { name: 'graph_cursor', start: 0xD01460, size: 0x50 },
    { name: 'graph_window', start: 0xD01E30, size: 0x50 },
    { name: 'FPS_area', start: FPS_START_ADDR, size: 0x40 },
    { name: 'misc_D02B', start: 0xD02B30, size: 0x40 },
  ];

  const beforeSnap = {};
  for (const r of snapRegions) {
    beforeSnap[r.name] = new Uint8Array(r.size);
    for (let i = 0; i < r.size; i++) beforeSnap[r.name][i] = mem[r.start + i];
  }

  // Run GraphPars
  const gpE = callGraphParsBodyTraced(executor, cpu, mem, equ.tokenAddr, null);
  console.log(`GraphPars: returned=${gpE.returnHit} steps=${gpE.steps} errNo=${hex(gpE.errNo, 2)}`);

  // Diff each region
  console.log('\nMemory changes:');
  for (const r of snapRegions) {
    const changes = [];
    for (let i = 0; i < r.size; i++) {
      const before = beforeSnap[r.name][i];
      const after = mem[r.start + i];
      if (before !== after) {
        changes.push({ offset: i, addr: r.start + i, before, after });
      }
    }
    if (changes.length > 0) {
      console.log(`  ${r.name} (${hex(r.start)}): ${changes.length} changed bytes`);
      for (const c of changes) {
        console.log(`    ${hex(c.addr)}: ${hex(c.before, 2)} -> ${hex(c.after, 2)}`);
      }
    }
  }

  // Search all of D0xxxx for BCD 7.0 pattern: 00 81 70 00 00 00 00 00 00
  console.log('\nSearching D0xxxx for BCD 7.0 pattern (81 70):');
  for (let addr = 0xD00000; addr < 0xD10000; addr++) {
    if (mem[addr] === 0x81 && mem[addr + 1] === 0x70 && mem[addr + 2] === 0x00) {
      console.log(`  ${hex(addr)}: [${hexBytes(mem, addr - 1, 11)}]`);
    }
  }

  // Also check FPS area and USERMEM
  console.log('\nSearching USERMEM/FPS for BCD 7.0 (81 70):');
  for (let addr = USERMEM_ADDR; addr < USERMEM_ADDR + 0x400; addr++) {
    if (mem[addr] === 0x81 && mem[addr + 1] === 0x70 && mem[addr + 2] === 0x00) {
      console.log(`  ${hex(addr)}: [${hexBytes(mem, addr - 1, 11)}]`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PART F: Intercept tX handler — force OP1 to X variable, seed curGX2
  // The tX handler expects OP1 type=0x00 (RealObj) to follow the normal
  // variable recall path. We hook the tX entry to fix OP1 on the fly.
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n\n=== PART F: Hook tX handler — force OP1=[00,58,...] + X in VAT ===\n');
  console.log(`  X variable in VAT: ${xVarDataAddr ? 'YES at ' + hex(xVarDataAddr) : 'NO (CreateReal failed)'}\n`);

  const testXvals = [0, 1, 3, 5, -2];

  for (const xVal of testXvals) {
    write24(mem, OPS_ADDR, useOPS);
    write24(mem, OPBASE_ADDR, useOPBase);
    write24(mem, PROGPTR_ADDR, useProgPtr);
    write24(mem, FPS_ADDR, useFPS);
    write24(mem, FPSBASE_ADDR, FPS_START_ADDR);
    seedGraphWindow(mem);
    seedGraphRAM(mem);

    // Seed BOTH curGX2 and X variable with test value
    writeReal(wrapped, CURGX2_ADDR, xVal);
    if (xVarDataAddr) writeReal(wrapped, xVarDataAddr, xVal);
    mem.fill(0x00, CURGY2_ADDR, CURGY2_ADDR + 9);

    // Pre-set OP1 to Y1 name
    mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
    mem[OP1_ADDR + 0] = EQUOBJ_TYPE;
    mem[OP1_ADDR + 1] = TY1;

    write24(mem, BEGPC_ADDR, equ.tokenAddr);
    write24(mem, CURPC_ADDR, equ.tokenAddr);
    write24(mem, ENDPC_ADDR, equ.tokenAddr + 1);

    prepareCallState(cpu, mem);
    cpu.sp -= 3;
    write24(mem, cpu.sp, GRAPHPARS_RET);
    seedErrorFrame(cpu, mem, GRAPHPARS_RET);

    mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
    mem[OP1_ADDR + 0] = EQUOBJ_TYPE;
    mem[OP1_ADDR + 1] = TY1;

    let fReturnHit = false;
    let fSteps = 0;
    let tXHooked = false;

    try {
      executor.runFrom(GRAPHPARS_BODY_ENTRY, 'adl', {
        maxSteps: 5000,
        maxLoopIterations: MAX_LOOP_ITER,
        onBlock(pc) {
          fSteps++;
          const norm = pc & 0xffffff;

          // Hook: when tX handler is about to execute, force OP1 to X variable
          if (norm === 0x07D1B4 && !tXHooked) {
            tXHooked = true;
            // Set OP1 = [0x00, 0x58, 0x00, ...] (RealObj, tX name)
            mem[OP1_ADDR + 0] = 0x00; // RealObj
            mem[OP1_ADDR + 1] = TX;   // 0x58 = X
            for (let i = 2; i < OP1_LEN; i++) mem[OP1_ADDR + i] = 0x00;
          }

          if (norm === GRAPHPARS_RET || norm === FAKE_RET) { fReturnHit = true; throw new Error('__RET__'); }
        },
        onMissingBlock(pc) {
          fSteps++;
          const norm = pc & 0xffffff;
          if (norm === 0x07D1B4 && !tXHooked) {
            tXHooked = true;
            mem[OP1_ADDR + 0] = 0x00;
            mem[OP1_ADDR + 1] = TX;
            for (let i = 2; i < OP1_LEN; i++) mem[OP1_ADDR + i] = 0x00;
          }
          if (norm === GRAPHPARS_RET || norm === FAKE_RET) { fReturnHit = true; throw new Error('__RET__'); }
        },
      });
    } catch (e) {
      if (e?.message !== '__RET__') throw e;
    }

    const errNo = mem[ERR_NO_ADDR];

    // Read results from all candidate locations
    const savedT = mem[OP1_ADDR];
    mem[OP1_ADDR] = savedT & 0x3F;
    let yOP1 = null;
    try { yOP1 = readReal(wrapped, OP1_ADDR); } catch (e) { /* ignore */ }
    mem[OP1_ADDR] = savedT;

    let yCurGY2 = null;
    try { yCurGY2 = readReal(wrapped, CURGY2_ADDR); } catch (e) { /* ignore */ }

    const fpsNow = read24(mem, FPS_ADDR);
    let yFPS = null;
    if (fpsNow > useFPS) {
      try { yFPS = readReal(wrapped, useFPS); } catch (e) { /* ignore */ }
    }

    const match = (v) => v !== null && Math.abs(v - xVal) < 0.001 ? 'MATCH' : 'no';
    console.log(`  X=${String(xVal).padStart(4)}: hooked=${tXHooked} steps=${fSteps} errNo=${hex(errNo, 2)}`);
    console.log(`    OP1=[${hexBytes(mem, OP1_ADDR, 9)}] decoded=${yOP1 !== null ? yOP1.toFixed(4) : 'n/a'} (${match(yOP1)})`);
    console.log(`    curGY2=[${hexBytes(mem, CURGY2_ADDR, 9)}] decoded=${yCurGY2 !== null ? yCurGY2.toFixed(4) : 'n/a'} (${match(yCurGY2)})`);
    console.log(`    FPS delta=${fpsNow - useFPS} top=${yFPS !== null ? yFPS.toFixed(4) : 'n/a'} (${match(yFPS)})`);
    console.log(`    OP2=[${hexBytes(mem, OP2_ADDR, 9)}]`);

    // Scan for the X value in the FP area
    if (xVal !== 0) {
      const bcd = [];
      writeReal(wrapped, 0xD0FF00, xVal);
      for (let i = 0; i < 9; i++) bcd.push(mem[0xD0FF00 + i]);
      const pattern1 = bcd[1];
      const pattern2 = bcd[2];
      console.log(`    Scanning D005F0-D00640 for ${hex(pattern1,2)} ${hex(pattern2,2)}:`);
      for (let addr = 0xD005F0; addr < 0xD00640; addr++) {
        if (mem[addr] === pattern1 && mem[addr + 1] === pattern2) {
          console.log(`      ${hex(addr)}: [${hexBytes(mem, addr - 1, 11)}]`);
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PART G: Hook tX handler — directly push X to FP stack, skip handler
  // The tX handler fails because OP1 type=0x03 is not handled in graph mode.
  // Instead of fixing OP1, we bypass the handler entirely: write X value to
  // OP1, then call PushRealO1 (0x082BB5) which allocates on FP stack.
  // Actually simpler: write X to OP1 as BCD real, then redirect PC to
  // the FP push routine that the evaluator would normally call after
  // a successful token handler.
  //
  // Approach: When we see PC=0x07D1B4 (tX entry), we:
  //   1. Write X BCD value directly to OP1
  //   2. Pop the return address from CPU stack (tX handler was CALLed)
  //   3. Set PC to the return address, effectively making the handler a no-op
  //      that leaves the X value in OP1
  //   4. The evaluator's post-handler code should then push OP1 to FP stack
  //
  // But wait — the evaluator calls tX via a dispatch table. After the handler
  // returns, the evaluator likely calls a push routine. Let's check by tracing
  // what happens after step 324 (0x0998A0) when tX returns.
  //
  // From Part B trace: after tX returns at step ~320, we see:
  //   step 324: 0x0998A0 (evaluator continues)
  //   step 325: 0x061E20
  //   step 326: 0x061E27
  //   step 327: 0x0998A4
  //   ...
  //   step 330: 0x0998AC
  //   step 337: 0x09C4E0 (bit check)
  //   step 338: 0x0998B7
  //
  // The evaluator at 0x0998A0 calls 0x061E20 then continues. It doesn't
  // push OP1 to FP stack — the tX handler is supposed to do that itself.
  //
  // So the correct hook: write X to OP1, then let the handler run but
  // patch the type so it takes the right path. OR: write X to the FP
  // stack directly and update FPS.
  //
  // Let's try the direct FP stack approach: write X BCD to FPS, bump FPS by 9.
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n\n=== PART G: Direct FP stack push hook for tX handler ===\n');

  const testXvalsG = [0, 1, 2, 3, 5, 10, -3, 0.5, 3.14159];

  for (const xVal of testXvalsG) {
    // Reset allocator state
    write24(mem, OPS_ADDR, useOPS);
    write24(mem, OPBASE_ADDR, useOPBase);
    write24(mem, PROGPTR_ADDR, useProgPtr);
    write24(mem, FPS_ADDR, useFPS);
    write24(mem, FPSBASE_ADDR, FPS_START_ADDR);
    seedGraphWindow(mem);
    seedGraphRAM(mem);

    // Seed curGX2 with X value (in case something reads it)
    writeReal(wrapped, CURGX2_ADDR, xVal);
    if (xVarDataAddr) writeReal(wrapped, xVarDataAddr, xVal);
    mem.fill(0x00, CURGY2_ADDR, CURGY2_ADDR + 9);

    // Pre-set OP1 to Y1 name
    mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
    mem[OP1_ADDR + 0] = EQUOBJ_TYPE;
    mem[OP1_ADDR + 1] = TY1;

    write24(mem, BEGPC_ADDR, equ.tokenAddr);
    write24(mem, CURPC_ADDR, equ.tokenAddr);
    write24(mem, ENDPC_ADDR, equ.tokenAddr + 1);

    prepareCallState(cpu, mem);
    cpu.sp -= 3;
    write24(mem, cpu.sp, GRAPHPARS_RET);
    seedErrorFrame(cpu, mem, GRAPHPARS_RET);

    // Re-set OP1 (seedErrorFrame may clobber)
    mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
    mem[OP1_ADDR + 0] = EQUOBJ_TYPE;
    mem[OP1_ADDR + 1] = TY1;

    let gReturnHit = false;
    let gSteps = 0;
    let tXHit = false;

    try {
      executor.runFrom(GRAPHPARS_BODY_ENTRY, 'adl', {
        maxSteps: 5000,
        maxLoopIterations: MAX_LOOP_ITER,
        onBlock(pc) {
          gSteps++;
          const norm = pc & 0xffffff;

          // Hook: when tX handler is about to execute, push X to FP stack
          if (norm === 0x07D1B4 && !tXHit) {
            tXHit = true;

            // Write X BCD value to OP1 (the handler reads OP1)
            writeReal(wrapped, OP1_ADDR, xVal);

            // Read current FPS
            const fps = read24(mem, FPS_ADDR);

            // Write X BCD value to FP stack
            writeReal(wrapped, fps, xVal);

            // Advance FPS by 9
            write24(mem, FPS_ADDR, fps + 9);

            // Pop the return address from the CPU stack (skip the handler)
            const retAddr = read24(mem, cpu.sp);
            cpu.sp += 3;

            // Redirect execution to the return address
            cpu.pc = retAddr;

            // Signal to skip this block
            throw new Error('__SKIP__');
          }

          if (norm === GRAPHPARS_RET || norm === FAKE_RET) {
            gReturnHit = true;
            throw new Error('__RET__');
          }
        },
        onMissingBlock(pc) {
          gSteps++;
          const norm = pc & 0xffffff;

          if (norm === 0x07D1B4 && !tXHit) {
            tXHit = true;
            writeReal(wrapped, OP1_ADDR, xVal);
            const fps = read24(mem, FPS_ADDR);
            writeReal(wrapped, fps, xVal);
            write24(mem, FPS_ADDR, fps + 9);
            const retAddr = read24(mem, cpu.sp);
            cpu.sp += 3;
            cpu.pc = retAddr;
            throw new Error('__SKIP__');
          }

          if (norm === GRAPHPARS_RET || norm === FAKE_RET) {
            gReturnHit = true;
            throw new Error('__RET__');
          }
        },
      });
    } catch (e) {
      if (e?.message === '__SKIP__') {
        // Handler was skipped, continue execution from return address
        try {
          executor.runFrom(cpu.pc, 'adl', {
            maxSteps: 5000 - gSteps,
            maxLoopIterations: MAX_LOOP_ITER,
            onBlock(pc) {
              gSteps++;
              const norm = pc & 0xffffff;
              if (norm === GRAPHPARS_RET || norm === FAKE_RET) {
                gReturnHit = true;
                throw new Error('__RET__');
              }
            },
            onMissingBlock(pc) {
              gSteps++;
              const norm = pc & 0xffffff;
              if (norm === GRAPHPARS_RET || norm === FAKE_RET) {
                gReturnHit = true;
                throw new Error('__RET__');
              }
            },
          });
        } catch (e2) {
          if (e2?.message !== '__RET__') throw e2;
        }
      } else if (e?.message !== '__RET__') {
        throw e;
      }
    }

    const errNo = mem[ERR_NO_ADDR];

    // Read Y from various locations
    const savedT = mem[OP1_ADDR];
    mem[OP1_ADDR] = savedT & 0x3F;
    let yOP1 = null;
    try { yOP1 = readReal(wrapped, OP1_ADDR); } catch (e) { /* ignore */ }
    mem[OP1_ADDR] = savedT;

    let yCurGY2 = null;
    try { yCurGY2 = readReal(wrapped, CURGY2_ADDR); } catch (e) { /* ignore */ }

    const fpsNow = read24(mem, FPS_ADDR);
    const fpsDelta = fpsNow - useFPS;
    let yFPS = null;
    if (fpsDelta >= 9) {
      // Read the top of FP stack (last 9 bytes pushed)
      try { yFPS = readReal(wrapped, fpsNow - 9); } catch (e) { /* ignore */ }
    }

    // Also check OP2
    let yOP2 = null;
    try { yOP2 = readReal(wrapped, OP2_ADDR); } catch (e) { /* ignore */ }

    const match = (v) => v !== null && Math.abs(v - xVal) < 0.001 ? 'MATCH' : 'no';
    console.log(`  X=${String(xVal).padStart(8)}: hooked=${tXHit} returned=${gReturnHit} steps=${gSteps} errNo=${hex(errNo, 2)}`);
    console.log(`    OP1=[${hexBytes(mem, OP1_ADDR, 9)}] decoded=${yOP1 !== null ? yOP1.toFixed(6) : 'n/a'} (${match(yOP1)})`);
    console.log(`    OP2=[${hexBytes(mem, OP2_ADDR, 9)}] decoded=${yOP2 !== null ? yOP2.toFixed(6) : 'n/a'} (${match(yOP2)})`);
    console.log(`    curGY2=[${hexBytes(mem, CURGY2_ADDR, 9)}] decoded=${yCurGY2 !== null ? yCurGY2.toFixed(6) : 'n/a'} (${match(yCurGY2)})`);
    console.log(`    FPS delta=${fpsDelta} top=${yFPS !== null ? yFPS.toFixed(6) : 'n/a'} (${match(yFPS)})`);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n\n=== SUMMARY ===');
  console.log('tX handler key hits (Part B):');
  for (const [name, steps] of gpTrace.keyHits) {
    console.log(`  ${name}: ${steps.length}x`);
  }
  console.log('\nOP1 changes during GraphPars (Part B2):');
  console.log('  Step 268 (0x099A9B): OP1 zeroed (FP push)');
  console.log('  Step 287 (0x0828D5): OP1 restored to equation name [03 10 ...]');
  console.log('  Step 296: tX handler called with OP1 type=0x03 (EquObj)');
  console.log('  tX handler exits immediately because type 0x03 is not handled');
  console.log('\ntX handler at 0x07D1B4 analysis:');
  console.log('  0x07D1B4: CALL 0x07F7BD (getOP1type)');
  console.log('  0x07D1B8: CALL 0x08012D (check)');
  console.log('  0x07D1BC: JR Z,0x07D1C2 (type 0x00 = real)');
  console.log('  0x07D1BE: CP 0x02; JR NZ,0x07D21E (type 0x02 = complex, else graph path)');
  console.log('  Real path at 0x07D1C2: CALL 0x07FF3F which does LD A,(D005F9) CP 0x24 RET');
  console.log('    -> Only handles theta variable (0x24), not X (0x58)');
  console.log('  Graph path at 0x07D21E: checks type against 0x0C, 0x1E, 0x1F');
  console.log('    -> Type 0x03 (EquObj) not in any recognized set, exits via RET NZ');
  console.log('\nSee PART G results for direct FP stack push approach.');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
