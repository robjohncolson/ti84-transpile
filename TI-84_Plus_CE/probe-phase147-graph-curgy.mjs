#!/usr/bin/env node

/**
 * Phase 147 — Seed curGY/curGX for correct Y1=X graph rendering.
 *
 * Part A: Verify that writing curGY changes IPoint's VRAM write row
 * Part B: Full GraphPars Y1=X with curGY/curGX seeding — expect diagonal
 * Part C: Verify curGX affects X positioning (center-point test)
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
const IY_PLUS_43_ADDR = 0xD000AB;
const IY_PLUS_74_ADDR = 0xD000CA;

// TI tokens
const EQUOBJ_TYPE = 0x03;
const TY1 = 0x10;
const TX = 0x58;

// tX handler intercept PC
const TX_HANDLER_PC = 0x07D1B4;

// plotSScreen
const PLOTSSCREEN_ADDR = 0xD09466;
const PLOTSSCREEN_SIZE = 76800;

// LCD VRAM
const LCD_VRAM_ADDR = 0xD40000;
const LCD_VRAM_SIZE = 153600;  // 320x240x16bpp

const MAX_LOOP_ITER = 8192;

// Graph dimensions
const GRAPH_WIDTH = 320;
const GRAPH_HEIGHT = 238;

// curGY and curGX addresses (from session 146 findings)
const CUR_GY_ADDR = 0xD022D1;  // 2 bytes LE, pixel Y coordinate
const CUR_GX_ADDR = 0xD022CF;  // 2 bytes LE, pixel X coordinate (hypothesis)

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
  write16(mem, PIX_WIDE_P_ADDR, 320);
  write16(mem, PIX_WIDE_M2_ADDR, 238);
  write16(mem, DRAW_COLOR_CODE_ADDR, 0x0010);
  write16(mem, DRAW_FG_COLOR_ADDR, 0x0010);
  write16(mem, DRAW_BG_COLOR_ADDR, 0xFFFF);
  mem[HOOKFLAGS3_ADDR] &= ~0x80;
  mem[MODE_BYTE_ADDR] = 1;
  mem[0xD00082] |= (1 << 4);
  mem[DRAW_MODE_ADDR] = 1;
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
  mem[GRAPHMODE_ADDR] = 0;
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

// ── Create Y1=X equation ──────────────────────────────────────────────────

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
    return { tokenAddr: de, success: true };
  }
  console.log(`  CreateEqu FAILED`);
  return { tokenAddr: 0, success: false };
}

// ── Call IPoint ──────────────────────────────────────────────────────────

function callIPoint(executor, cpu, mem, px, py) {
  prepareCallState(cpu, mem);
  cpu.a = 1;
  cpu._de = px;
  cpu._hl = py;
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

// ── Call GraphPars with tX intercept ────────────────────────────────────

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
  mem[OP1_ADDR] = savedType & 0xBF;  // strip bit 6 evaluated flag, preserve bit 7 sign
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

function getUniqueRowsPlotSScreen(mem) {
  // plotSScreen is 1bpp, 320 pixels wide = 40 bytes per row, 240 rows
  const bytesPerRow = 40;
  const rows = new Set();
  for (let row = 0; row < 240; row++) {
    const rowStart = PLOTSSCREEN_ADDR + row * bytesPerRow;
    for (let b = 0; b < bytesPerRow; b++) {
      if (mem[rowStart + b] !== 0) {
        rows.add(row);
        break;
      }
    }
  }
  return rows;
}

function getUniqueRowsVRAM(mem) {
  // LCD VRAM is 16bpp, 320 pixels wide = 640 bytes per row, 240 rows
  const bytesPerRow = 640;
  const rows = new Set();
  for (let row = 0; row < 240; row++) {
    const rowStart = LCD_VRAM_ADDR + row * bytesPerRow;
    for (let b = 0; b < bytesPerRow; b++) {
      if (mem[rowStart + b] !== 0) {
        rows.add(row);
        break;
      }
    }
  }
  return rows;
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 147: Graph — Seed curGY for Correct Y Rendering ===\n');

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
  mem[0xD00083] |= 1;

  // ══════════════════════════════════════════════════════════════════════════
  // PART A: Verify curGY seeding changes IPoint's VRAM write row
  // ══════════════════════════════════════════════════════════════════════════

  console.log(`${'='.repeat(70)}`);
  console.log('PART A: Verify curGY seeding changes IPoint VRAM write row');
  console.log(`${'='.repeat(70)}\n`);

  // Optimal IPoint flags: IY+43 bit2 SET, IY+74 bit2 CLEAR (plotSScreen writes)
  setIYFlags(mem, true, false);
  seedGraphRAM(mem);

  const testYValues = [0, 60, 120, 180, 238];

  console.log('  Testing curGY seeding with fixed X=160, varying Y:\n');

  for (const curGYVal of testYValues) {
    // Clear pixel regions
    mem.fill(0, PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);
    mem.fill(0, LCD_VRAM_ADDR, LCD_VRAM_ADDR + LCD_VRAM_SIZE);

    // Reset flags
    setIYFlags(mem, true, false);
    seedGraphRAM(mem);

    // Seed curGY
    write16(mem, CUR_GY_ADDR, curGYVal);
    // Seed curGX to 160
    write16(mem, CUR_GX_ADDR, 160);

    const curGYBefore = read16(mem, CUR_GY_ADDR);
    const curGXBefore = read16(mem, CUR_GX_ADDR);

    // Call IPoint with X=160, Y=curGYVal in registers too
    const ip = callIPoint(executor, cpu, mem, 160, curGYVal);

    const curGYAfter = read16(mem, CUR_GY_ADDR);
    const curGXAfter = read16(mem, CUR_GX_ADDR);

    // Check plotSScreen for pixel writes
    const plotRows = getUniqueRowsPlotSScreen(mem);
    const plotNZ = countNonZero(mem, PLOTSSCREEN_ADDR, PLOTSSCREEN_SIZE);

    // Check LCD VRAM for pixel writes
    const vramRows = getUniqueRowsVRAM(mem);
    const vramNZ = countNonZero(mem, LCD_VRAM_ADDR, LCD_VRAM_SIZE);

    console.log(`  curGY=${String(curGYVal).padStart(3)} curGX=160:`);
    console.log(`    IPoint: returned=${ip.returnHit} steps=${ip.steps}`);
    console.log(`    curGY before=${curGYBefore} after=${curGYAfter}`);
    console.log(`    curGX before=${curGXBefore} after=${curGXAfter}`);
    console.log(`    plotSScreen: ${plotNZ} non-zero bytes, rows=[${[...plotRows].sort((a,b)=>a-b).join(',')}]`);
    console.log(`    LCD VRAM: ${vramNZ} non-zero bytes, rows=[${[...vramRows].sort((a,b)=>a-b).join(',')}]`);
    console.log('');
  }

  // Also test curGX variation
  console.log('  Testing curGX seeding with fixed curGY=120, varying X:\n');

  const testXValues = [0, 80, 160, 240, 319];

  for (const curGXVal of testXValues) {
    mem.fill(0, PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);
    mem.fill(0, LCD_VRAM_ADDR, LCD_VRAM_ADDR + LCD_VRAM_SIZE);

    setIYFlags(mem, true, false);
    seedGraphRAM(mem);

    write16(mem, CUR_GY_ADDR, 120);
    write16(mem, CUR_GX_ADDR, curGXVal);

    // Pass the same values in registers
    const ip = callIPoint(executor, cpu, mem, curGXVal, 120);

    const plotNZ = countNonZero(mem, PLOTSSCREEN_ADDR, PLOTSSCREEN_SIZE);
    const vramNZ = countNonZero(mem, LCD_VRAM_ADDR, LCD_VRAM_SIZE);

    // Find exact plotSScreen write location
    let firstPlotOffset = -1;
    for (let i = 0; i < PLOTSSCREEN_SIZE; i++) {
      if (mem[PLOTSSCREEN_ADDR + i] !== 0) {
        firstPlotOffset = i;
        break;
      }
    }
    const plotRow = firstPlotOffset >= 0 ? Math.floor(firstPlotOffset / 40) : -1;
    const plotByteCol = firstPlotOffset >= 0 ? firstPlotOffset % 40 : -1;

    console.log(`  curGX=${String(curGXVal).padStart(3)} curGY=120:`);
    console.log(`    IPoint: returned=${ip.returnHit} steps=${ip.steps}`);
    console.log(`    plotSScreen: ${plotNZ} non-zero bytes, first at offset=${firstPlotOffset} (row=${plotRow}, byteCol=${plotByteCol})`);
    console.log(`    LCD VRAM: ${vramNZ} non-zero bytes`);
    console.log('');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PART B: Full GraphPars Y1=X with curGY/curGX seeding
  // ══════════════════════════════════════════════════════════════════════════

  console.log(`${'='.repeat(70)}`);
  console.log('PART B: Full GraphPars Y1=X with curGY/curGX seeding');
  console.log(`${'='.repeat(70)}\n`);

  // Clear pixel regions
  mem.fill(0, PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);
  mem.fill(0, LCD_VRAM_ADDR, LCD_VRAM_ADDR + LCD_VRAM_SIZE);

  // Re-seed everything
  seedAllocator(mem);
  seedGraphWindow(mem);
  seedGraphRAM(mem);
  mem[0xD00083] |= 1;
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

  console.log(`  Graph: ${GRAPH_WIDTH}x${GRAPH_HEIGHT}, X=[${Xmin},${Xmax}], Y=[${Ymin},${Ymax}]`);
  console.log(`  xStep=${xStep.toFixed(6)}`);
  console.log(`  Flags: IY+43 bit2 SET, IY+74 bit2 CLEAR (plotSScreen writes)`);
  console.log(`  Seeding curGY and curGX before each IPoint call\n`);

  let gpSuccess = 0;
  let gpFail = 0;
  let ipSuccess = 0;
  let ipFail = 0;
  let pixelsAttempted = 0;
  let pixelsClipped = 0;
  const errors = [];
  const samples = [];

  for (let col = 0; col < GRAPH_WIDTH; col++) {
    const x = Xmin + col * xStep;

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

      const px = col;
      const py = Math.round((Ymax - gp.yVal) / (Ymax - Ymin) * GRAPH_HEIGHT);

      if (px >= 0 && px < GRAPH_WIDTH && py >= 0 && py <= GRAPH_HEIGHT) {
        const clampedPY = Math.min(py, GRAPH_HEIGHT);

        // Seed curGY and curGX
        write16(mem, CUR_GY_ADDR, clampedPY);
        write16(mem, CUR_GX_ADDR, px);

        // Re-set flags before IPoint
        setIYFlags(mem, true, false);
        seedGraphRAM(mem);

        const ip = callIPoint(executor, cpu, mem, px, clampedPY);
        if (ip.returnHit) {
          ipSuccess++;
        } else {
          ipFail++;
        }
        pixelsAttempted++;

        // Sample some points
        if (samples.length < 10 || col % 40 === 0) {
          samples.push({
            col,
            x: x.toFixed(4),
            y: gp.yVal.toFixed(4),
            px, py: clampedPY,
            steps: gp.steps,
            ipOk: ip.returnHit,
          });
        }
      } else {
        pixelsClipped++;
      }
    } else {
      gpFail++;
      if (errors.length < 5) {
        errors.push({
          col,
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

  // Count pixel output
  const plotTotal = countNonZero(mem, PLOTSSCREEN_ADDR, PLOTSSCREEN_SIZE);
  const vramTotal = countNonZero(mem, LCD_VRAM_ADDR, LCD_VRAM_SIZE);
  const plotRows = getUniqueRowsPlotSScreen(mem);
  const vramRows = getUniqueRowsVRAM(mem);

  console.log(`  --- PART B RESULTS ---`);
  console.log(`  GraphPars: ${gpSuccess} succeeded, ${gpFail} failed`);
  console.log(`  IPoint: ${ipSuccess} succeeded, ${ipFail} failed`);
  console.log(`  Pixels attempted: ${pixelsAttempted}, clipped: ${pixelsClipped}`);
  console.log(`  plotSScreen: ${plotTotal} non-zero bytes, ${plotRows.size} unique rows`);
  console.log(`  LCD VRAM: ${vramTotal} non-zero bytes, ${vramRows.size} unique rows`);

  if (plotRows.size > 0) {
    const sorted = [...plotRows].sort((a, b) => a - b);
    console.log(`  plotSScreen row range: ${sorted[0]} to ${sorted[sorted.length - 1]}`);
    if (sorted.length <= 30) {
      console.log(`  plotSScreen rows: [${sorted.join(',')}]`);
    } else {
      console.log(`  plotSScreen rows (first 15): [${sorted.slice(0, 15).join(',')}]`);
      console.log(`  plotSScreen rows (last 15): [${sorted.slice(-15).join(',')}]`);
    }
  }

  if (vramRows.size > 0) {
    const sorted = [...vramRows].sort((a, b) => a - b);
    console.log(`  LCD VRAM row range: ${sorted[0]} to ${sorted[sorted.length - 1]}`);
  }

  if (samples.length > 0) {
    console.log(`\n  Sample points (col, X, Y -> px, py):`);
    for (const s of samples) {
      console.log(`    col=${String(s.col).padStart(3)} X=${s.x.padStart(8)} Y=${s.y.padStart(8)} -> px=${String(s.px).padStart(3)} py=${String(s.py).padStart(3)} ipOk=${s.ipOk}`);
    }
  }

  if (errors.length > 0) {
    console.log(`\n  First ${errors.length} errors:`);
    for (const e of errors) {
      console.log(`    col=${e.col} X=${e.x}: returned=${e.returnHit} tXHit=${e.tXHit} errNo=${e.errNo} Y=${e.yVal} steps=${e.steps}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PART C: Verify curGX affects X positioning (center-point test)
  // ══════════════════════════════════════════════════════════════════════════

  console.log(`\n${'='.repeat(70)}`);
  console.log('PART C: Verify curGX affects X positioning (center-point test)');
  console.log(`${'='.repeat(70)}\n`);

  // Clear pixel regions
  mem.fill(0, PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);
  mem.fill(0, LCD_VRAM_ADDR, LCD_VRAM_ADDR + LCD_VRAM_SIZE);

  setIYFlags(mem, true, false);
  seedGraphRAM(mem);

  // For center: X=0, Y=0 -> pixel (160, 119)
  const centerPX = 160;
  const centerPY = 119;

  // Seed curGX=160, curGY=119
  write16(mem, CUR_GX_ADDR, centerPX);
  write16(mem, CUR_GY_ADDR, centerPY);

  console.log(`  Test: center point (X=0, Y=0 -> px=${centerPX}, py=${centerPY})`);
  console.log(`  curGX=${read16(mem, CUR_GX_ADDR)} curGY=${read16(mem, CUR_GY_ADDR)}`);

  const ipCenter = callIPoint(executor, cpu, mem, centerPX, centerPY);
  console.log(`  IPoint: returned=${ipCenter.returnHit} steps=${ipCenter.steps}`);

  const centerPlotNZ = countNonZero(mem, PLOTSSCREEN_ADDR, PLOTSSCREEN_SIZE);
  const centerVramNZ = countNonZero(mem, LCD_VRAM_ADDR, LCD_VRAM_SIZE);
  const centerPlotRows = getUniqueRowsPlotSScreen(mem);

  console.log(`  plotSScreen: ${centerPlotNZ} non-zero bytes, rows=[${[...centerPlotRows].sort((a,b)=>a-b).join(',')}]`);
  console.log(`  LCD VRAM: ${centerVramNZ} non-zero bytes`);

  // Find exact plotSScreen pixel position
  for (let i = 0; i < PLOTSSCREEN_SIZE; i++) {
    if (mem[PLOTSSCREEN_ADDR + i] !== 0) {
      const row = Math.floor(i / 40);
      const byteCol = i % 40;
      const val = mem[PLOTSSCREEN_ADDR + i];
      // Find which bit is set
      for (let bit = 7; bit >= 0; bit--) {
        if (val & (1 << bit)) {
          const pixelX = byteCol * 8 + (7 - bit);
          console.log(`  Pixel found at plotSScreen row=${row} col=${pixelX} (byte ${byteCol}, bit ${bit})`);
        }
      }
    }
  }

  // Now test WITHOUT curGX seeding (leave curGX=0)
  console.log(`\n  Comparison: same IPoint call but curGX=0, curGY=119`);
  mem.fill(0, PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);
  mem.fill(0, LCD_VRAM_ADDR, LCD_VRAM_ADDR + LCD_VRAM_SIZE);

  setIYFlags(mem, true, false);
  seedGraphRAM(mem);

  write16(mem, CUR_GX_ADDR, 0);
  write16(mem, CUR_GY_ADDR, centerPY);

  const ipNoGX = callIPoint(executor, cpu, mem, centerPX, centerPY);
  console.log(`  IPoint: returned=${ipNoGX.returnHit} steps=${ipNoGX.steps}`);

  for (let i = 0; i < PLOTSSCREEN_SIZE; i++) {
    if (mem[PLOTSSCREEN_ADDR + i] !== 0) {
      const row = Math.floor(i / 40);
      const byteCol = i % 40;
      const val = mem[PLOTSSCREEN_ADDR + i];
      for (let bit = 7; bit >= 0; bit--) {
        if (val & (1 << bit)) {
          const pixelX = byteCol * 8 + (7 - bit);
          console.log(`  Pixel found at plotSScreen row=${row} col=${pixelX} (curGX=0)`);
        }
      }
    }
  }

  // And test WITHOUT curGY seeding (leave curGY=0, curGX=160)
  console.log(`\n  Comparison: same IPoint call but curGX=160, curGY=0`);
  mem.fill(0, PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);
  mem.fill(0, LCD_VRAM_ADDR, LCD_VRAM_ADDR + LCD_VRAM_SIZE);

  setIYFlags(mem, true, false);
  seedGraphRAM(mem);

  write16(mem, CUR_GX_ADDR, centerPX);
  write16(mem, CUR_GY_ADDR, 0);

  const ipNoGY = callIPoint(executor, cpu, mem, centerPX, centerPY);
  console.log(`  IPoint: returned=${ipNoGY.returnHit} steps=${ipNoGY.steps}`);

  const noGYPlotRows = getUniqueRowsPlotSScreen(mem);
  for (let i = 0; i < PLOTSSCREEN_SIZE; i++) {
    if (mem[PLOTSSCREEN_ADDR + i] !== 0) {
      const row = Math.floor(i / 40);
      const byteCol = i % 40;
      const val = mem[PLOTSSCREEN_ADDR + i];
      for (let bit = 7; bit >= 0; bit--) {
        if (val & (1 << bit)) {
          const pixelX = byteCol * 8 + (7 - bit);
          console.log(`  Pixel found at plotSScreen row=${row} col=${pixelX} (curGY=0)`);
        }
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════════════════

  console.log(`\n${'='.repeat(70)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(70)}\n`);

  console.log(`  Part A: curGY seeding test`);
  console.log(`    Does curGY change the VRAM write row? Check results above.`);
  console.log(`    Does curGX change the X position? Check results above.\n`);

  console.log(`  Part B: Full Y1=X diagonal rendering`);
  console.log(`    GraphPars: ${gpSuccess}/${GRAPH_WIDTH} succeeded`);
  console.log(`    IPoint: ${ipSuccess}/${pixelsAttempted} succeeded`);
  console.log(`    plotSScreen: ${plotTotal} non-zero bytes across ${plotRows.size} unique rows`);
  console.log(`    LCD VRAM: ${vramTotal} non-zero bytes across ${vramRows.size} unique rows`);
  if (plotRows.size > 1) {
    console.log(`    SUCCESS: Pixels distributed across ${plotRows.size} rows (not all row 239)`);
  } else {
    console.log(`    FAILURE: All pixels on ${plotRows.size === 1 ? [...plotRows][0] : 'no'} row(s)`);
  }

  console.log(`\n  Part C: Center-point verification`);
  console.log(`    See pixel positions above for curGX/curGY effect.\n`);

  console.log('=== Phase 147 complete ===');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
