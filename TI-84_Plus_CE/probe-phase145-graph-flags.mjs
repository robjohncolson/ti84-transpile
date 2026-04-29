#!/usr/bin/env node

/**
 * Phase 145 — Graph NZ path: verify 16bpp LCD VRAM writes + test IY+43/IY+74 flag combination.
 *
 * Part A: Verify 16bpp VRAM writes in NZ path (IY+43 bit2 SET, IY+74 bit2 SET)
 * Part B: Test optimal flag combo (IY+43 bit2 SET, IY+74 bit2 CLEAR) for plotSScreen writes
 * Part C: Full GraphPars render with optimal flags — compare pixel count to session 139's 17
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
const IPOINT_RET = 0x7FFFF2;

// Entry points
const CREATEEQU_ENTRY = 0x082438;
const GRAPHPARS_BODY_ENTRY = 0x099874;
const MEMINIT_ENTRY = 0x09DEE0;
const IPOINT_ENTRY = 0x07B451;

// OP registers
const OP1_ADDR = 0xd005f8;
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
const DRAW_MODE_ADDR = 0xD02AC8;

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

// IY flag addresses (IY=0xD00080)
const IY_PLUS_43_ADDR = 0xD000AB;  // IY+0x2B: bounds check path
const IY_PLUS_74_ADDR = 0xD000CA;  // IY+0x4A: pixel write path

// Framebuffer address register
const FRAMEBUF_ADDR_REG = 0xD02A8A;

// TI tokens
const EQUOBJ_TYPE = 0x03;
const TY1 = 0x10;
const TX = 0x58;

// tX handler intercept PC
const TX_HANDLER_PC = 0x07D1B4;

// plotSScreen
const PLOTSSCREEN_ADDR = 0xD09466;
const PLOTSSCREEN_SIZE = 76800;  // 320x240 monochrome

// LCD VRAM
const LCD_VRAM_ADDR = 0xD40000;
const LCD_VRAM_SIZE = 153600;  // 320x240x16bpp

const MAX_LOOP_ITER = 8192;

// Graph dimensions (full width with 24-bit bounds)
const GRAPH_WIDTH = 320;
const GRAPH_HEIGHT = 238;

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
  write16(mem, PIX_WIDE_P_ADDR, 320);      // full width
  write16(mem, PIX_WIDE_M2_ADDR, 238);     // 240-2
  write16(mem, DRAW_COLOR_CODE_ADDR, 0x0010);  // visible pen color
  write16(mem, DRAW_FG_COLOR_ADDR, 0x0010);
  write16(mem, DRAW_BG_COLOR_ADDR, 0xFFFF);
  mem[HOOKFLAGS3_ADDR] &= ~0x80;
  mem[MODE_BYTE_ADDR] = 1;
  mem[0xD00082] |= (1 << 4);  // grfFuncM bit 4
  mem[DRAW_MODE_ADDR] = 1;     // normal draw mode
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
  mem[GRAPHMODE_ADDR] = 0;  // function mode
}

function seedErrorFrame(cpu, mem, recoveryAddr) {
  const errFrameSP = cpu.sp - 18;
  write24(mem, errFrameSP + 0, 0xD00080);   // IY
  write24(mem, errFrameSP + 3, 0xD1A860);   // IX
  write24(mem, errFrameSP + 6, 0x000000);   // BC
  write24(mem, errFrameSP + 9, 0x000000);   // DE
  write24(mem, errFrameSP + 12, recoveryAddr); // HL = recovery
  write24(mem, errFrameSP + 15, 0x000040);  // AF
  write24(mem, ERR_SP_ADDR, errFrameSP);
  mem[ERR_NO_ADDR] = 0x00;
  return errFrameSP;
}

function setIYFlags(mem, bit2_43, bit2_74) {
  if (bit2_43) {
    mem[IY_PLUS_43_ADDR] |= 0x04;
  } else {
    mem[IY_PLUS_43_ADDR] &= ~0x04;
  }
  if (bit2_74) {
    mem[IY_PLUS_74_ADDR] |= 0x04;
  } else {
    mem[IY_PLUS_74_ADDR] &= ~0x04;
  }
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
  cpu._hl = 1;  // 1 byte for tX token
  cpu.sp -= 3;
  write24(mem, cpu.sp, CREATEEQU_RET);
  seedErrorFrame(cpu, mem, CREATEEQU_RET);

  // Re-set OP1 after seedErrorFrame
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
    return { tokenAddr: de, success: true };
  }
  console.log(`  CreateEqu FAILED`);
  return { tokenAddr: 0, success: false };
}

// ── Call IPoint ──────────────────────────────────────────────────────────

function callIPoint(executor, cpu, mem, px, py) {
  prepareCallState(cpu, mem);
  cpu.a = 1;         // drawMode = 1 (normal draw)
  cpu._de = px;      // pixel X in DE
  cpu._hl = py;      // pixel Y in HL
  cpu.sp -= 3;
  write24(mem, cpu.sp, IPOINT_RET);

  let returnHit = false;
  let steps = 0;
  try {
    executor.runFrom(IPOINT_ENTRY, 'adl', {
      maxSteps: 5000,
      maxLoopIterations: 500,
      onBlock(pc) {
        steps++;
        if ((pc & 0xffffff) === IPOINT_RET || (pc & 0xffffff) === FAKE_RET) {
          returnHit = true;
          throw new Error('__RET__');
        }
      },
      onMissingBlock(pc) {
        steps++;
        if ((pc & 0xffffff) === IPOINT_RET || (pc & 0xffffff) === FAKE_RET) {
          returnHit = true;
          throw new Error('__RET__');
        }
      },
    });
  } catch (e) {
    if (e?.message !== '__RET__') throw e;
  }
  return { returnHit, steps };
}

// ── Call GraphPars with tX intercept ─────────────────────────────────────

function callGraphParsWithIntercept(executor, cpu, mem, tokenAddr, xVal, wrapped, savedFPS) {
  write24(mem, FPS_ADDR, savedFPS);

  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem[OP1_ADDR + 0] = EQUOBJ_TYPE;
  mem[OP1_ADDR + 1] = TY1;

  write24(mem, BEGPC_ADDR, tokenAddr);
  write24(mem, CURPC_ADDR, tokenAddr);
  write24(mem, ENDPC_ADDR, tokenAddr + 1);

  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, GRAPHPARS_RET);
  seedErrorFrame(cpu, mem, GRAPHPARS_RET);

  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem[OP1_ADDR + 0] = EQUOBJ_TYPE;
  mem[OP1_ADDR + 1] = TY1;

  let returnHit = false;
  let steps = 0;
  let tXHit = false;

  try {
    executor.runFrom(GRAPHPARS_BODY_ENTRY, 'adl', {
      maxSteps: 2000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        steps++;
        const norm = pc & 0xffffff;
        if (norm === TX_HANDLER_PC && !tXHit) {
          tXHit = true;
          const fps = read24(mem, FPS_ADDR);
          writeReal(wrapped, fps, xVal);
          write24(mem, FPS_ADDR, fps + 9);
          writeReal(wrapped, OP1_ADDR, xVal);
          const retAddr = read24(mem, cpu.sp);
          cpu.sp += 3;
          cpu.pc = retAddr;
          throw new Error('__SKIP__');
        }
        if (norm === GRAPHPARS_RET || norm === FAKE_RET) {
          returnHit = true;
          throw new Error('__RET__');
        }
      },
      onMissingBlock(pc) {
        steps++;
        const norm = pc & 0xffffff;
        if (norm === TX_HANDLER_PC && !tXHit) {
          tXHit = true;
          const fps = read24(mem, FPS_ADDR);
          writeReal(wrapped, fps, xVal);
          write24(mem, FPS_ADDR, fps + 9);
          writeReal(wrapped, OP1_ADDR, xVal);
          const retAddr = read24(mem, cpu.sp);
          cpu.sp += 3;
          cpu.pc = retAddr;
          throw new Error('__SKIP__');
        }
        if (norm === GRAPHPARS_RET || norm === FAKE_RET) {
          returnHit = true;
          throw new Error('__RET__');
        }
      },
    });
  } catch (e) {
    if (e?.message === '__SKIP__') {
      try {
        executor.runFrom(cpu.pc, 'adl', {
          maxSteps: 2000 - steps,
          maxLoopIterations: MAX_LOOP_ITER,
          onBlock(pc) {
            steps++;
            const norm = pc & 0xffffff;
            if (norm === GRAPHPARS_RET || norm === FAKE_RET) {
              returnHit = true;
              throw new Error('__RET__');
            }
          },
          onMissingBlock(pc) {
            steps++;
            const norm = pc & 0xffffff;
            if (norm === GRAPHPARS_RET || norm === FAKE_RET) {
              returnHit = true;
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
  const savedType = mem[OP1_ADDR];
  mem[OP1_ADDR] = savedType & 0x3F;
  let yVal = null;
  try { yVal = readReal(wrapped, OP1_ADDR); } catch (e) { /* decode failed */ }
  mem[OP1_ADDR] = savedType;

  return { returnHit, steps, tXHit, errNo, yVal };
}

// ── Counting helpers ────────────────────────────────────────────────────

function countNonZero(mem, start, size) {
  let count = 0;
  for (let i = 0; i < size; i++) {
    if (mem[start + i] !== 0) count++;
  }
  return count;
}

function findNonZeroAddrs(mem, start, size, maxResults) {
  const results = [];
  for (let i = 0; i < size && results.length < maxResults; i++) {
    if (mem[start + i] !== 0) {
      results.push({ offset: i, addr: start + i, val: mem[start + i] });
    }
  }
  return results;
}

function diffRegion(memBefore, memAfter, start, size, maxResults) {
  const diffs = [];
  for (let i = 0; i < size && diffs.length < maxResults; i++) {
    if (memBefore[i] !== memAfter[start + i]) {
      diffs.push({ offset: i, addr: start + i, before: memBefore[i], after: memAfter[start + i] });
    }
  }
  let totalDiffs = 0;
  for (let i = 0; i < size; i++) {
    if (memBefore[i] !== memAfter[start + i]) totalDiffs++;
  }
  return { diffs, totalDiffs };
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 145: Graph NZ Path — VRAM Writes + IY+43/IY+74 Flag Combination ===\n');

  const { mem, executor, cpu } = createRuntime();
  const wrapped = wrapMem(mem);

  // ── Cold boot ──
  console.log('Cold-booting OS...');
  coldBoot(executor, cpu, mem);
  console.log('Cold boot complete.\n');

  // ── MEM_INIT ──
  prepareCallState(cpu, mem);
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  console.log('Running MEM_INIT...');
  const memInitResult = callOSRoutine('MEM_INIT', MEMINIT_ENTRY, MEMINIT_RET, executor, cpu, mem, 100000);
  console.log(`MEM_INIT: returned=${memInitResult.returnHit} steps=${memInitResult.steps}\n`);

  // ── Seed allocator + graph state ──
  seedAllocator(mem);
  seedGraphWindow(mem);
  seedGraphRAM(mem);
  mem[0xD00083] |= 1;  // graphDraw dirty

  // ══════════════════════════════════════════════════════════════════════
  // PART A — Verify 16bpp VRAM writes in NZ path
  // IY+43 bit2 SET (24-bit bounds), IY+74 bit2 SET (NZ pixel write path)
  // ══════════════════════════════════════════════════════════════════════

  console.log(`${'='.repeat(70)}`);
  console.log('PART A: Verify 16bpp VRAM writes (IY+43 bit2 SET, IY+74 bit2 SET)');
  console.log(`${'='.repeat(70)}\n`);

  // Clear pixel regions
  mem.fill(0, PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);
  mem.fill(0, LCD_VRAM_ADDR, LCD_VRAM_ADDR + LCD_VRAM_SIZE);

  // Set flags: both bit 2 SET
  setIYFlags(mem, true, true);
  seedGraphRAM(mem);

  console.log(`  IY+43 (${hex(IY_PLUS_43_ADDR)}): ${hex(mem[IY_PLUS_43_ADDR], 2)} — BIT 2 = ${(mem[IY_PLUS_43_ADDR] & 0x04) ? 'SET' : 'CLEAR'}`);
  console.log(`  IY+74 (${hex(IY_PLUS_74_ADDR)}): ${hex(mem[IY_PLUS_74_ADDR], 2)} — BIT 2 = ${(mem[IY_PLUS_74_ADDR] & 0x04) ? 'SET' : 'CLEAR'}`);
  console.log(`  pixWideP: ${read16(mem, PIX_WIDE_P_ADDR)}`);
  console.log(`  pixWide_m_2: ${read16(mem, PIX_WIDE_M2_ADDR)}`);
  console.log(`  penColor: ${hex(read16(mem, DRAW_COLOR_CODE_ADDR), 4)}`);
  console.log(`  framebufAddr (${hex(FRAMEBUF_ADDR_REG)}): ${hex(read24(mem, FRAMEBUF_ADDR_REG))}`);

  // Snapshot before
  const preA_plotSScreen = mem.slice(PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);
  const preA_lcdVram = mem.slice(LCD_VRAM_ADDR, LCD_VRAM_ADDR + LCD_VRAM_SIZE);
  const preA_fullSnap = mem.slice(0xD00000, 0xD60000);

  // Call IPoint for X=160, Y=60
  console.log(`\n  Calling IPoint(X=160, Y=60)...`);
  const ipA = callIPoint(executor, cpu, mem, 160, 60);
  console.log(`  Result: returned=${ipA.returnHit} steps=${ipA.steps}`);

  // Check framebuffer address
  const framebufAddr = read24(mem, FRAMEBUF_ADDR_REG);
  console.log(`  framebufAddr after IPoint: ${hex(framebufAddr)}`);

  // Diff plotSScreen
  const plotA = diffRegion(preA_plotSScreen, mem, PLOTSSCREEN_ADDR, PLOTSSCREEN_SIZE, 10);
  console.log(`\n  plotSScreen changes: ${plotA.totalDiffs} bytes`);
  for (const d of plotA.diffs) {
    console.log(`    ${hex(d.addr)}: ${hex(d.before, 2)} -> ${hex(d.after, 2)}`);
  }

  // Diff LCD VRAM
  const vramA = diffRegion(preA_lcdVram, mem, LCD_VRAM_ADDR, LCD_VRAM_SIZE, 10);
  console.log(`  LCD VRAM changes: ${vramA.totalDiffs} bytes`);
  for (const d of vramA.diffs) {
    console.log(`    ${hex(d.addr)}: ${hex(d.before, 2)} -> ${hex(d.after, 2)}`);
  }

  // Full memory diff 0xD00000-0xD60000
  const fullA = diffRegion(preA_fullSnap, mem, 0xD00000, 0x60000, 30);
  console.log(`  Full RAM changes (0xD00000-0xD60000): ${fullA.totalDiffs} bytes`);
  for (const d of fullA.diffs) {
    const region =
      d.addr >= PLOTSSCREEN_ADDR && d.addr < PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE ? 'plotSScreen' :
      d.addr >= LCD_VRAM_ADDR && d.addr < LCD_VRAM_ADDR + LCD_VRAM_SIZE ? 'LCD_VRAM' :
      'other';
    console.log(`    ${hex(d.addr)} [${region}]: ${hex(d.before, 2)} -> ${hex(d.after, 2)}`);
  }

  // ══════════════════════════════════════════════════════════════════════
  // PART B — Test optimal flag combination
  // IY+43 bit2 SET (24-bit bounds), IY+74 bit2 CLEAR (plotSScreen write path)
  // ══════════════════════════════════════════════════════════════════════

  console.log(`\n${'='.repeat(70)}`);
  console.log('PART B: Optimal flags (IY+43 bit2 SET, IY+74 bit2 CLEAR)');
  console.log(`${'='.repeat(70)}\n`);

  // Clear pixel regions
  mem.fill(0, PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);
  mem.fill(0, LCD_VRAM_ADDR, LCD_VRAM_ADDR + LCD_VRAM_SIZE);

  // Set flags: IY+43 bit2 SET, IY+74 bit2 CLEAR
  setIYFlags(mem, true, false);
  seedGraphRAM(mem);

  console.log(`  IY+43 (${hex(IY_PLUS_43_ADDR)}): ${hex(mem[IY_PLUS_43_ADDR], 2)} — BIT 2 = ${(mem[IY_PLUS_43_ADDR] & 0x04) ? 'SET' : 'CLEAR'}`);
  console.log(`  IY+74 (${hex(IY_PLUS_74_ADDR)}): ${hex(mem[IY_PLUS_74_ADDR], 2)} — BIT 2 = ${(mem[IY_PLUS_74_ADDR] & 0x04) ? 'SET' : 'CLEAR'}`);

  // Single point test: X=160, Y=60
  console.log(`\n  --- Single point test: IPoint(X=160, Y=60) ---`);
  const preB1_plot = mem.slice(PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);
  const preB1_vram = mem.slice(LCD_VRAM_ADDR, LCD_VRAM_ADDR + LCD_VRAM_SIZE);

  const ipB1 = callIPoint(executor, cpu, mem, 160, 60);
  console.log(`  Result: returned=${ipB1.returnHit} steps=${ipB1.steps}`);

  const plotB1 = diffRegion(preB1_plot, mem, PLOTSSCREEN_ADDR, PLOTSSCREEN_SIZE, 10);
  const vramB1 = diffRegion(preB1_vram, mem, LCD_VRAM_ADDR, LCD_VRAM_SIZE, 10);
  console.log(`  plotSScreen changes: ${plotB1.totalDiffs} bytes`);
  for (const d of plotB1.diffs) {
    console.log(`    ${hex(d.addr)}: ${hex(d.before, 2)} -> ${hex(d.after, 2)}`);
  }
  console.log(`  LCD VRAM changes: ${vramB1.totalDiffs} bytes`);
  for (const d of vramB1.diffs) {
    console.log(`    ${hex(d.addr)}: ${hex(d.before, 2)} -> ${hex(d.after, 2)}`);
  }

  // Multi-point test: 10 coordinates spanning full 320-pixel width
  console.log(`\n  --- Multi-point test: 10 coordinates across 320-pixel width ---`);

  // Reset pixel regions
  mem.fill(0, PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);
  mem.fill(0, LCD_VRAM_ADDR, LCD_VRAM_ADDR + LCD_VRAM_SIZE);
  setIYFlags(mem, true, false);
  seedGraphRAM(mem);

  const testCoords = [
    { x: 0, y: 60 },
    { x: 32, y: 50 },
    { x: 64, y: 80 },
    { x: 96, y: 100 },
    { x: 128, y: 120 },
    { x: 160, y: 60 },
    { x: 192, y: 40 },
    { x: 224, y: 100 },
    { x: 256, y: 70 },
    { x: 300, y: 90 },
  ];

  let ipointOk = 0;
  let ipointFail = 0;

  for (const coord of testCoords) {
    // Re-set flags each time (IPoint may corrupt them)
    setIYFlags(mem, true, false);
    seedGraphRAM(mem);

    const ip = callIPoint(executor, cpu, mem, coord.x, coord.y);
    if (ip.returnHit) {
      ipointOk++;
    } else {
      ipointFail++;
    }
    console.log(`    IPoint(${String(coord.x).padStart(3)}, ${String(coord.y).padStart(3)}): returned=${ip.returnHit} steps=${ip.steps}`);
  }

  const plotBTotal = countNonZero(mem, PLOTSSCREEN_ADDR, PLOTSSCREEN_SIZE);
  const vramBTotal = countNonZero(mem, LCD_VRAM_ADDR, LCD_VRAM_SIZE);

  console.log(`\n  After 10 IPoint calls:`);
  console.log(`    IPoint: ${ipointOk} OK, ${ipointFail} failed`);
  console.log(`    plotSScreen non-zero bytes: ${plotBTotal}`);
  console.log(`    LCD VRAM non-zero bytes: ${vramBTotal}`);

  if (plotBTotal > 0) {
    console.log(`    First plotSScreen non-zero bytes:`);
    const plotNZ = findNonZeroAddrs(mem, PLOTSSCREEN_ADDR, PLOTSSCREEN_SIZE, 15);
    for (const nz of plotNZ) {
      console.log(`      offset=${nz.offset} (${hex(nz.addr)}) val=${hex(nz.val, 2)}`);
    }
  }

  if (vramBTotal > 0) {
    console.log(`    First LCD VRAM non-zero bytes:`);
    const vramNZ = findNonZeroAddrs(mem, LCD_VRAM_ADDR, LCD_VRAM_SIZE, 15);
    for (const nz of vramNZ) {
      console.log(`      offset=${nz.offset} (${hex(nz.addr)}) val=${hex(nz.val, 2)}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // PART C — Full GraphPars render with optimal flags
  // ══════════════════════════════════════════════════════════════════════

  console.log(`\n${'='.repeat(70)}`);
  console.log('PART C: Full GraphPars render (Y1=X, optimal flags, -10 to +10)');
  console.log(`${'='.repeat(70)}\n`);

  // Clear pixel regions
  mem.fill(0, PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);
  mem.fill(0, LCD_VRAM_ADDR, LCD_VRAM_ADDR + LCD_VRAM_SIZE);

  // Re-seed everything
  seedAllocator(mem);
  seedGraphWindow(mem);
  seedGraphRAM(mem);
  mem[0xD00083] |= 1;

  // Set optimal flags
  setIYFlags(mem, true, false);

  // Create Y1=X equation
  console.log('  Creating Y1=X equation...');
  const equ = createEquY1(executor, cpu, mem);
  if (!equ.success) {
    console.log('  ABORT: CreateEqu failed');
    return;
  }

  // Save allocator state
  const savedOPS = read24(mem, OPS_ADDR);
  const savedOPBase = read24(mem, OPBASE_ADDR);
  const savedProgPtr = read24(mem, PROGPTR_ADDR);
  const savedFPS = read24(mem, FPS_ADDR);
  console.log(`  Post-CreateEqu: OPS=${hex(savedOPS)} FPS=${hex(savedFPS)}\n`);

  const Xmin = -10;
  const Xmax = 10;
  const Ymin = -10;
  const Ymax = 10;
  const xStep = (Xmax - Xmin) / GRAPH_WIDTH;

  // Full range: -10 to +10 (negative X fixed per session 140)
  const xStart = -10;
  const xEnd = 10;

  console.log(`  Graph dims: ${GRAPH_WIDTH}x${GRAPH_HEIGHT}`);
  console.log(`  X range: ${xStart} to ${xEnd}, step=${xStep.toFixed(6)}`);
  console.log(`  Flags: IY+43 bit2 SET (24-bit bounds), IY+74 bit2 CLEAR (plotSScreen writes)`);

  let gpSuccess = 0;
  let gpFail = 0;
  let ipSuccess = 0;
  let ipFail = 0;
  let pixelsAttempted = 0;
  const errors = [];
  const samples = [];

  for (let x = xStart; x <= xEnd; x += xStep) {
    // Restore allocator state
    write24(mem, OPS_ADDR, savedOPS);
    write24(mem, OPBASE_ADDR, savedOPBase);
    write24(mem, PROGPTR_ADDR, savedProgPtr);
    write24(mem, FPSBASE_ADDR, FPS_START_ADDR);

    // Re-seed state
    seedGraphWindow(mem);
    seedGraphRAM(mem);
    setIYFlags(mem, true, false);

    const gp = callGraphParsWithIntercept(
      executor, cpu, mem, equ.tokenAddr, x, wrapped, savedFPS
    );

    if (gp.returnHit && gp.tXHit && gp.errNo === 0x00 && gp.yVal !== null) {
      gpSuccess++;

      const px = Math.round((x - Xmin) / (Xmax - Xmin) * GRAPH_WIDTH);
      const py = Math.round(GRAPH_HEIGHT - (gp.yVal - Ymin) / (Ymax - Ymin) * GRAPH_HEIGHT);

      if (px >= 0 && px < GRAPH_WIDTH && py >= 0 && py < GRAPH_HEIGHT) {
        // Re-set flags before IPoint
        setIYFlags(mem, true, false);
        seedGraphRAM(mem);

        const ip = callIPoint(executor, cpu, mem, px, py);
        if (ip.returnHit) {
          ipSuccess++;
        } else {
          ipFail++;
        }
        pixelsAttempted++;
      }

      if (samples.length < 10 || gpSuccess % 40 === 0) {
        samples.push({
          x: x.toFixed(4),
          y: gp.yVal.toFixed(4),
          px: Math.round((x - Xmin) / (Xmax - Xmin) * GRAPH_WIDTH),
          py: Math.round(GRAPH_HEIGHT - (gp.yVal - Ymin) / (Ymax - Ymin) * GRAPH_HEIGHT),
          steps: gp.steps,
        });
      }
    } else {
      gpFail++;
      if (errors.length < 10) {
        errors.push({
          x: x.toFixed(4),
          returnHit: gp.returnHit,
          tXHit: gp.tXHit,
          errNo: hex(gp.errNo, 2),
          yVal: gp.yVal,
          steps: gp.steps,
        });
      }
    }
  }

  // Count final pixel output
  const plotCTotal = countNonZero(mem, PLOTSSCREEN_ADDR, PLOTSSCREEN_SIZE);
  const vramCTotal = countNonZero(mem, LCD_VRAM_ADDR, LCD_VRAM_SIZE);

  console.log(`\n  --- PART C RESULTS ---`);
  console.log(`  GraphPars: ${gpSuccess} succeeded, ${gpFail} failed`);
  console.log(`  IPoint: ${ipSuccess} succeeded, ${ipFail} failed`);
  console.log(`  Pixels attempted: ${pixelsAttempted}`);
  console.log(`  plotSScreen non-zero bytes: ${plotCTotal}`);
  console.log(`  LCD VRAM non-zero bytes: ${vramCTotal}`);

  if (samples.length > 0) {
    console.log(`\n  Sample (X, Y) -> (px, py):`);
    for (const s of samples) {
      console.log(`    X=${s.x} Y=${s.y} -> px=${s.px} py=${s.py} (${s.steps} steps)`);
    }
  }

  if (errors.length > 0) {
    console.log(`\n  First ${errors.length} errors:`);
    for (const e of errors) {
      console.log(`    X=${e.x}: returned=${e.returnHit} tXHit=${e.tXHit} errNo=${e.errNo} Y=${e.yVal} steps=${e.steps}`);
    }
  }

  if (plotCTotal > 0) {
    console.log(`\n  First non-zero plotSScreen bytes:`);
    const plotNZ = findNonZeroAddrs(mem, PLOTSSCREEN_ADDR, PLOTSSCREEN_SIZE, 20);
    for (const nz of plotNZ) {
      const row = Math.floor(nz.offset / 42);  // 320/8 = 40 bytes per row, padded
      const bitCol = (nz.offset % 42) * 8;
      console.log(`    offset=${nz.offset} (${hex(nz.addr)}) val=${hex(nz.val, 2)} row~=${row} col~=${bitCol}`);
    }
  }

  if (vramCTotal > 0) {
    console.log(`\n  First non-zero LCD VRAM bytes:`);
    const vramNZ = findNonZeroAddrs(mem, LCD_VRAM_ADDR, LCD_VRAM_SIZE, 20);
    for (const nz of vramNZ) {
      const row = Math.floor(nz.offset / 640);  // 320 pixels * 2 bytes/pixel = 640 bytes/row
      const col = Math.floor((nz.offset % 640) / 2);
      console.log(`    offset=${nz.offset} (${hex(nz.addr)}) val=${hex(nz.val, 2)} row~=${row} col~=${col}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════════════

  console.log(`\n${'='.repeat(70)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(70)}\n`);

  console.log(`  Part A (NZ path VRAM verify): IPoint returned=${ipA.returnHit}`);
  console.log(`    plotSScreen changes: ${plotA.totalDiffs}`);
  console.log(`    LCD VRAM changes: ${vramA.totalDiffs}`);
  console.log(`    Full RAM changes: ${fullA.totalDiffs}`);

  console.log(`\n  Part B (optimal flags, 10 points):`);
  console.log(`    IPoint: ${ipointOk}/${testCoords.length} OK`);
  console.log(`    plotSScreen non-zero: ${plotBTotal}`);
  console.log(`    LCD VRAM non-zero: ${vramBTotal}`);

  console.log(`\n  Part C (full GraphPars Y1=X, -10 to +10):`);
  console.log(`    GraphPars: ${gpSuccess} OK, ${gpFail} failed`);
  console.log(`    IPoint: ${ipSuccess} OK, ${ipFail} failed`);
  console.log(`    plotSScreen non-zero bytes: ${plotCTotal}`);
  console.log(`    LCD VRAM non-zero bytes: ${vramCTotal}`);
  console.log(`    vs session 139 baseline: 17 plotSScreen bytes`);

  const improvement = plotCTotal > 17 ? `+${plotCTotal - 17} bytes (${(plotCTotal / 17 * 100).toFixed(0)}% of baseline)` :
                      plotCTotal === 17 ? 'NO CHANGE' :
                      `REGRESSION: ${plotCTotal - 17} bytes`;
  console.log(`    Improvement: ${improvement}`);

  console.log('\n=== Phase 145 complete ===');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
