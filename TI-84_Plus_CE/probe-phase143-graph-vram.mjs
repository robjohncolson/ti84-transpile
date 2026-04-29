#!/usr/bin/env node

/**
 * Phase 143 — Graph VRAM investigation: where do pixels go when BIT 2 is set?
 *
 * Session 142 showed that BIT 2 of IY+43 enables full 24-bit bounds checks,
 * allowing 160 successful IPoint calls. But plotSScreen had 0 non-zero bytes.
 * Hypothesis: the NZ path writes to LCD VRAM at 0xD40000 instead.
 *
 * This probe:
 *   1. Runs graph pipeline with BIT 2 set (Test B from session 142)
 *   2. Takes a baseline memory snapshot BEFORE rendering
 *   3. After render loop, scans memory regions for pixel data
 *   4. Reports first 20 non-zero addresses in each region
 *   5. Scans 0xD00000-0xD60000 in 4KB chunks for new non-zero bytes
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

// IY+43 address (IY=0xD00080, offset 0x2B)
const IY_PLUS_43_ADDR = 0xD000AB;

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
const LCD_VRAM_8BPP_SIZE = 76800;    // 320*240
const LCD_VRAM_16BPP_SIZE = 153600;  // 320*240*2

// Scan range
const SCAN_START = 0xD00000;
const SCAN_END = 0xD60000;
const CHUNK_SIZE = 4096;

const MAX_LOOP_ITER = 8192;

// Graph screen dimensions (full-width mode)
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
  // Full-width: pixWideP=320, pixWide_m_2=238
  write16(mem, PIX_WIDE_P_ADDR, 320);
  write16(mem, PIX_WIDE_M2_ADDR, 238);
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
  cpu._hl = 1; // 1 byte for tX token
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

// ── Call IPoint (with optional write tracking) ──────────────────────────

function callIPoint(executor, cpu, mem, px, py, writeLog) {
  prepareCallState(cpu, mem);
  cpu.a = 1;         // drawMode = 1 (normal draw)
  cpu._de = px;      // pixel X in DE
  cpu._hl = py;      // pixel Y in HL (full 24-bit register)
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

// ── Memory scanning utilities ──────────────────────────────────────────

function takeSnapshot(mem, start, end) {
  return mem.slice(start, end);
}

function countNewNonZero(mem, snapshot, start, size) {
  let count = 0;
  for (let i = 0; i < size; i++) {
    if (mem[start + i] !== 0 && snapshot[i] === 0) count++;
  }
  return count;
}

function findNewNonZeroAddrs(mem, snapshot, start, size, maxResults) {
  const results = [];
  for (let i = 0; i < size && results.length < maxResults; i++) {
    if (mem[start + i] !== 0 && snapshot[i] === 0) {
      results.push({ addr: start + i, val: mem[start + i] });
    }
  }
  return results;
}

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
      results.push({ addr: start + i, val: mem[start + i] });
    }
  }
  return results;
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 143: Graph VRAM Investigation (where do pixels go?) ===\n');

  // ── Setup runtime ──
  const { mem, executor, cpu } = createRuntime();
  const wrapped = wrapMem(mem);

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

  // Seed allocator + graph state
  seedAllocator(mem);
  seedGraphWindow(mem);
  seedGraphRAM(mem);
  mem[0xD00083] |= 1; // graphDraw dirty

  // Create Y1=X equation
  console.log('Creating Y1=X equation...');
  const equ = createEquY1(executor, cpu, mem);
  if (!equ.success) {
    console.log('ABORT: CreateEqu failed');
    return;
  }

  // Save allocator state
  const savedOPS = read24(mem, OPS_ADDR);
  const savedOPBase = read24(mem, OPBASE_ADDR);
  const savedProgPtr = read24(mem, PROGPTR_ADDR);
  const savedFPS = read24(mem, FPS_ADDR);
  console.log(`  Post-CreateEqu: OPS=${hex(savedOPS)} FPS=${hex(savedFPS)}\n`);

  // ══════════════════════════════════════════════════════════════════════
  // Set BIT 2 of IY+43 for full-width mode
  // ══════════════════════════════════════════════════════════════════════

  mem[IY_PLUS_43_ADDR] |= 0x04;
  console.log(`IY+43 (${hex(IY_PLUS_43_ADDR)}): ${hex(mem[IY_PLUS_43_ADDR], 2)} — BIT 2 SET`);
  console.log(`pixWideP (${hex(PIX_WIDE_P_ADDR)}): ${read16(mem, PIX_WIDE_P_ADDR)}`);
  console.log(`pixWide_m_2 (${hex(PIX_WIDE_M2_ADDR)}): ${read16(mem, PIX_WIDE_M2_ADDR)}`);

  // Clear plotSScreen and LCD VRAM before baseline snapshot
  mem.fill(0, PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);
  mem.fill(0, LCD_VRAM_ADDR, LCD_VRAM_ADDR + LCD_VRAM_16BPP_SIZE);

  // ══════════════════════════════════════════════════════════════════════
  // BASELINE SNAPSHOT: capture memory state BEFORE rendering
  // ══════════════════════════════════════════════════════════════════════

  console.log('\nTaking baseline memory snapshot (0xD00000-0xD60000)...');
  const baselineSnapshot = takeSnapshot(mem, SCAN_START, SCAN_END);
  console.log(`  Baseline snapshot: ${SCAN_END - SCAN_START} bytes captured`);

  // Count pre-existing non-zero in key regions
  const baselinePlotSScreen = countNonZero(mem, PLOTSSCREEN_ADDR, PLOTSSCREEN_SIZE);
  const baselineLCDVram8 = countNonZero(mem, LCD_VRAM_ADDR, LCD_VRAM_8BPP_SIZE);
  const baselineLCDVram16 = countNonZero(mem, LCD_VRAM_ADDR, LCD_VRAM_16BPP_SIZE);
  console.log(`  Baseline plotSScreen non-zero: ${baselinePlotSScreen}`);
  console.log(`  Baseline LCD VRAM 8bpp non-zero: ${baselineLCDVram8}`);
  console.log(`  Baseline LCD VRAM 16bpp non-zero: ${baselineLCDVram16}`);

  // ══════════════════════════════════════════════════════════════════════
  // RENDER LOOP: GraphPars + IPoint for positive X values
  // ══════════════════════════════════════════════════════════════════════

  const Xmin = -10;
  const Xmax = 10;
  const Ymin = -10;
  const Ymax = 10;
  const graphW = GRAPH_WIDTH;
  const graphH = GRAPH_HEIGHT;
  const xStep = (Xmax - Xmin) / graphW;
  const xStart = 0;
  const xEnd = 10;

  console.log(`\nRender loop: X=${xStart} to ${xEnd}, step=${xStep.toFixed(6)}`);
  console.log(`Graph dims: ${graphW}x${graphH}\n`);

  let gpSuccess = 0;
  let gpFail = 0;
  let ipointSuccess = 0;
  let ipointFail = 0;
  let pixelsAttempted = 0;
  const errors = [];
  const samples = [];

  // Track writes to LCD VRAM by comparing before/after each IPoint call
  const vramWriteLog = [];

  for (let x = xStart; x <= xEnd; x += xStep) {
    // Restore allocator state
    write24(mem, OPS_ADDR, savedOPS);
    write24(mem, OPBASE_ADDR, savedOPBase);
    write24(mem, PROGPTR_ADDR, savedProgPtr);
    write24(mem, FPSBASE_ADDR, FPS_START_ADDR);

    // Re-seed graph window + RAM
    seedGraphWindow(mem);
    seedGraphRAM(mem);
    mem[IY_PLUS_43_ADDR] |= 0x04;

    const gp = callGraphParsWithIntercept(
      executor, cpu, mem, equ.tokenAddr, x, wrapped, savedFPS
    );

    if (gp.returnHit && gp.tXHit && gp.errNo === 0x00 && gp.yVal !== null) {
      gpSuccess++;

      const px = Math.round((x - Xmin) / (Xmax - Xmin) * graphW);
      const py = Math.round(graphH - (gp.yVal - Ymin) / (Ymax - Ymin) * graphH);

      if (px >= 0 && px < graphW && py >= 0 && py < graphH) {
        // Snapshot LCD VRAM before IPoint for write detection
        const preIPointVram = mem.slice(LCD_VRAM_ADDR, LCD_VRAM_ADDR + LCD_VRAM_8BPP_SIZE);

        const ip = callIPoint(executor, cpu, mem, px, py, vramWriteLog);
        if (ip.returnHit) {
          ipointSuccess++;

          // Check if LCD VRAM changed
          if (vramWriteLog.length < 50) {
            for (let i = 0; i < LCD_VRAM_8BPP_SIZE; i++) {
              if (mem[LCD_VRAM_ADDR + i] !== preIPointVram[i]) {
                vramWriteLog.push({
                  addr: LCD_VRAM_ADDR + i,
                  before: preIPointVram[i],
                  after: mem[LCD_VRAM_ADDR + i],
                  px, py,
                  x: x.toFixed(4),
                });
              }
            }
          }
        } else {
          ipointFail++;
        }
        pixelsAttempted++;
      }

      if (samples.length < 5 || gpSuccess % 20 === 0) {
        samples.push({
          x: x.toFixed(4),
          y: gp.yVal.toFixed(4),
          px: Math.round((x - Xmin) / (Xmax - Xmin) * graphW),
          py: Math.round(graphH - (gp.yVal - Ymin) / (Ymax - Ymin) * graphH),
          steps: gp.steps,
        });
      }
    } else {
      gpFail++;
      if (errors.length < 5) {
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

  // ══════════════════════════════════════════════════════════════════════
  // POST-RENDER ANALYSIS
  // ══════════════════════════════════════════════════════════════════════

  console.log(`\n${'='.repeat(70)}`);
  console.log('RENDER LOOP RESULTS');
  console.log(`${'='.repeat(70)}\n`);

  console.log(`GraphPars: ${gpSuccess} succeeded, ${gpFail} failed`);
  console.log(`IPoint: ${ipointSuccess} succeeded, ${ipointFail} failed`);
  console.log(`Pixels attempted: ${pixelsAttempted}`);

  if (samples.length > 0) {
    console.log(`\nSample (X, Y) -> (px, py):`);
    for (const s of samples) {
      console.log(`  X=${s.x} Y=${s.y} -> px=${s.px} py=${s.py} (${s.steps} steps)`);
    }
  }

  if (errors.length > 0) {
    console.log(`\nFirst ${errors.length} errors:`);
    for (const e of errors) {
      console.log(`  X=${e.x}: returned=${e.returnHit} tXHit=${e.tXHit} errNo=${e.errNo} Y=${e.yVal} steps=${e.steps}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // MEMORY REGION SCAN
  // ══════════════════════════════════════════════════════════════════════

  console.log(`\n${'='.repeat(70)}`);
  console.log('MEMORY REGION SCAN (post-render vs baseline)');
  console.log(`${'='.repeat(70)}\n`);

  // Region 1: plotSScreen
  const plotNonZero = countNonZero(mem, PLOTSSCREEN_ADDR, PLOTSSCREEN_SIZE);
  const plotNewNonZero = countNewNonZero(mem, baselineSnapshot.subarray(PLOTSSCREEN_ADDR - SCAN_START, PLOTSSCREEN_ADDR - SCAN_START + PLOTSSCREEN_SIZE), PLOTSSCREEN_ADDR, PLOTSSCREEN_SIZE);
  console.log(`[plotSScreen] ${hex(PLOTSSCREEN_ADDR)} - ${hex(PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE)}`);
  console.log(`  Total non-zero: ${plotNonZero}`);
  console.log(`  NEW non-zero (vs baseline): ${plotNewNonZero}`);
  if (plotNewNonZero > 0) {
    const addrs = findNewNonZeroAddrs(mem, baselineSnapshot.subarray(PLOTSSCREEN_ADDR - SCAN_START, PLOTSSCREEN_ADDR - SCAN_START + PLOTSSCREEN_SIZE), PLOTSSCREEN_ADDR, PLOTSSCREEN_SIZE, 20);
    console.log(`  First ${addrs.length} new non-zero addresses:`);
    for (const a of addrs) {
      console.log(`    ${hex(a.addr)} = ${hex(a.val, 2)}`);
    }
  }

  // Region 2: LCD VRAM (8bpp)
  const vram8NonZero = countNonZero(mem, LCD_VRAM_ADDR, LCD_VRAM_8BPP_SIZE);
  const vram8Snap = baselineSnapshot.subarray(LCD_VRAM_ADDR - SCAN_START, LCD_VRAM_ADDR - SCAN_START + LCD_VRAM_8BPP_SIZE);
  const vram8NewNonZero = countNewNonZero(mem, vram8Snap, LCD_VRAM_ADDR, LCD_VRAM_8BPP_SIZE);
  console.log(`\n[LCD VRAM 8bpp] ${hex(LCD_VRAM_ADDR)} - ${hex(LCD_VRAM_ADDR + LCD_VRAM_8BPP_SIZE)}`);
  console.log(`  Total non-zero: ${vram8NonZero}`);
  console.log(`  NEW non-zero (vs baseline): ${vram8NewNonZero}`);
  if (vram8NewNonZero > 0) {
    const addrs = findNewNonZeroAddrs(mem, vram8Snap, LCD_VRAM_ADDR, LCD_VRAM_8BPP_SIZE, 20);
    console.log(`  First ${addrs.length} new non-zero addresses:`);
    for (const a of addrs) {
      console.log(`    ${hex(a.addr)} = ${hex(a.val, 2)}`);
    }
  }

  // Region 3: LCD VRAM (16bpp extension beyond 8bpp)
  const vram16Start = LCD_VRAM_ADDR + LCD_VRAM_8BPP_SIZE;
  const vram16ExtSize = LCD_VRAM_16BPP_SIZE - LCD_VRAM_8BPP_SIZE;
  const vram16ExtNonZero = countNonZero(mem, vram16Start, vram16ExtSize);
  const vram16ExtSnap = baselineSnapshot.subarray(vram16Start - SCAN_START, vram16Start - SCAN_START + vram16ExtSize);
  const vram16ExtNew = countNewNonZero(mem, vram16ExtSnap, vram16Start, vram16ExtSize);
  console.log(`\n[LCD VRAM 16bpp extension] ${hex(vram16Start)} - ${hex(LCD_VRAM_ADDR + LCD_VRAM_16BPP_SIZE)}`);
  console.log(`  Total non-zero: ${vram16ExtNonZero}`);
  console.log(`  NEW non-zero (vs baseline): ${vram16ExtNew}`);
  if (vram16ExtNew > 0) {
    const addrs = findNewNonZeroAddrs(mem, vram16ExtSnap, vram16Start, vram16ExtSize, 20);
    console.log(`  First ${addrs.length} new non-zero addresses:`);
    for (const a of addrs) {
      console.log(`    ${hex(a.addr)} = ${hex(a.val, 2)}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // 4KB CHUNK SCAN: 0xD00000 - 0xD60000
  // ══════════════════════════════════════════════════════════════════════

  console.log(`\n${'='.repeat(70)}`);
  console.log('4KB CHUNK SCAN: 0xD00000 - 0xD60000 (new non-zero bytes vs baseline)');
  console.log(`${'='.repeat(70)}\n`);

  const changedChunks = [];
  for (let addr = SCAN_START; addr < SCAN_END; addr += CHUNK_SIZE) {
    const chunkSnap = baselineSnapshot.subarray(addr - SCAN_START, addr - SCAN_START + CHUNK_SIZE);
    const newCount = countNewNonZero(mem, chunkSnap, addr, CHUNK_SIZE);
    if (newCount > 0) {
      changedChunks.push({ addr, newCount });
    }
  }

  if (changedChunks.length === 0) {
    console.log('  NO chunks with new non-zero bytes found!');
  } else {
    console.log(`  ${changedChunks.length} chunks with new non-zero bytes:\n`);
    for (const c of changedChunks) {
      console.log(`  ${hex(c.addr)} - ${hex(c.addr + CHUNK_SIZE - 1)}: +${c.newCount} new non-zero bytes`);
      // Show first 5 new non-zero addresses in this chunk
      const chunkSnap = baselineSnapshot.subarray(c.addr - SCAN_START, c.addr - SCAN_START + CHUNK_SIZE);
      const addrs = findNewNonZeroAddrs(mem, chunkSnap, c.addr, CHUNK_SIZE, 5);
      for (const a of addrs) {
        console.log(`      ${hex(a.addr)} = ${hex(a.val, 2)}`);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // LCD VRAM WRITE LOG (per-IPoint tracking)
  // ══════════════════════════════════════════════════════════════════════

  console.log(`\n${'='.repeat(70)}`);
  console.log('LCD VRAM WRITE LOG (per-IPoint change detection)');
  console.log(`${'='.repeat(70)}\n`);

  if (vramWriteLog.length === 0) {
    console.log('  NO writes to LCD VRAM detected during IPoint calls');
  } else {
    console.log(`  ${vramWriteLog.length} VRAM changes detected:\n`);
    for (const w of vramWriteLog.slice(0, 20)) {
      console.log(`  ${hex(w.addr)}: ${hex(w.before, 2)} -> ${hex(w.after, 2)} (px=${w.px} py=${w.py} X=${w.x})`);
    }
    if (vramWriteLog.length > 20) {
      console.log(`  ... and ${vramWriteLog.length - 20} more`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // PIXEL DATA PATTERN ANALYSIS
  // ══════════════════════════════════════════════════════════════════════

  console.log(`\n${'='.repeat(70)}`);
  console.log('PIXEL DATA PATTERN ANALYSIS');
  console.log(`${'='.repeat(70)}\n`);

  // Check for contiguous runs in any changed region
  for (const c of changedChunks) {
    if (c.newCount >= 5) {
      const chunkSnap = baselineSnapshot.subarray(c.addr - SCAN_START, c.addr - SCAN_START + CHUNK_SIZE);
      let maxRun = 0;
      let currentRun = 0;
      let runStart = 0;
      let bestRunStart = 0;
      const valueCounts = {};

      for (let i = 0; i < CHUNK_SIZE; i++) {
        if (mem[c.addr + i] !== 0 && chunkSnap[i] === 0) {
          if (currentRun === 0) runStart = c.addr + i;
          currentRun++;
          const val = mem[c.addr + i];
          valueCounts[val] = (valueCounts[val] || 0) + 1;
          if (currentRun > maxRun) {
            maxRun = currentRun;
            bestRunStart = runStart;
          }
        } else {
          currentRun = 0;
        }
      }

      if (maxRun > 0) {
        console.log(`  Chunk ${hex(c.addr)}: longest contiguous new run = ${maxRun} bytes at ${hex(bestRunStart)}`);
        const topValues = Object.entries(valueCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5);
        console.log(`    Top values: ${topValues.map(([v, n]) => `${hex(Number(v), 2)}x${n}`).join(', ')}`);
      }
    }
  }

  // Summary
  console.log(`\n${'='.repeat(70)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(70)}\n`);

  console.log(`  IPoint calls: ${ipointSuccess} succeeded, ${ipointFail} failed`);
  console.log(`  plotSScreen new non-zero: ${plotNewNonZero}`);
  console.log(`  LCD VRAM 8bpp new non-zero: ${vram8NewNonZero}`);
  console.log(`  LCD VRAM 16bpp ext new non-zero: ${vram16ExtNew}`);
  console.log(`  Total changed 4KB chunks: ${changedChunks.length}`);
  console.log(`  LCD VRAM writes detected per-IPoint: ${vramWriteLog.length}`);

  const totalNewBytes = changedChunks.reduce((sum, c) => sum + c.newCount, 0);
  console.log(`  Total new non-zero bytes in 0xD00000-0xD60000: ${totalNewBytes}`);

  if (totalNewBytes === 0) {
    console.log('\n  CONCLUSION: IPoint returns successfully but writes ZERO pixels anywhere in RAM.');
    console.log('  The pixel-write instruction may be conditional on additional state not yet seeded.');
  } else if (vram8NewNonZero > 0 || vram16ExtNew > 0) {
    console.log('\n  CONCLUSION: Pixels ARE being written to LCD VRAM!');
  } else if (plotNewNonZero > 0) {
    console.log('\n  CONCLUSION: Pixels ARE being written to plotSScreen!');
  } else {
    console.log('\n  CONCLUSION: Pixels written to an unexpected region. Check chunk scan above.');
  }

  console.log('\n=== Phase 143 complete ===');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
