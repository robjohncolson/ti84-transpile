#!/usr/bin/env node

/**
 * Phase 137 — GraphPars rendering loop: multi-X evaluation + IPoint pixel plotting.
 *
 * RESULTS (2026-04-29):
 *   Test A (single GraphPars with X=5.0):
 *     - GraphPars returns in 341 steps, errNo=0x00 (clean)
 *     - OP1 after = [0x43, 0x10, 0x00...] — equation NAME with evaluated flag (bit 6)
 *     - The computed Y value is NOT in OP1, OP2, OP3-OP6, or FP stack
 *     - GraphPars stores Y value in an unidentified location
 *     - FPS delta = 0 (nothing left on FP stack)
 *     - FindSym finds Y1 equation (0x084711 hit) but does NOT call FindSym
 *       again for the X variable — reads X from a dedicated RAM slot
 *     - tX handler path: 0x07D1B4 → 0x07D21E → 0x07D233 → copies from unknown source
 *
 *   Test B (single IPoint at 10,10):
 *     - Returns in 14 steps, writes 0 pixels (A=1 draw mode)
 *     - Bounds check may be rejecting small coordinates
 *
 *   Test C (GraphPars loop + IPoint, 27 columns):
 *     - All 27 GraphPars calls return errNo=0x00
 *     - ALL Y values = 0.0 (GraphPars doesn't read X from our VAT variable)
 *     - 2 non-zero bytes in plotSScreen (all points at same pixelY=83)
 *     - Negative mathX values take 5000 steps (budget exhaustion)
 *     - Positive mathX values take 383 steps
 *
 *   Test D (JS-computed Y=X + IPoint, 130 columns):
 *     - All 130 IPoint calls return OK
 *     - Only 7 non-zero bytes in plotSScreen (expected ~130)
 *     - Most pixels rejected by IPoint's 8-bit X bounds check
 *       (known .SIS prefix issue from session 128)
 *
 *   KEY FINDINGS:
 *   1. GraphPars body at 0x099874 evaluates cleanly but Y=0 always
 *      — it reads X from a dedicated graph variable, NOT from the X VAT entry
 *   2. IPoint WORKS (writes blue 0x1F pixels) but bounds check limits coverage
 *      to X values where low byte < pixWideP low byte (8-bit comparison)
 *   3. plotSScreen is at 0xD52C00 (320*240 = 76800 bytes, 8bpp)
 *   4. NEXT: Identify GraphPars X source and Y output locations
 *   5. NEXT: Fix .SIS prefix bounds check to enable full-width pixel plotting
 *
 * Strategy:
 *   1. Cold-boot OS, run MEM_INIT, seed allocator/graph window/graph RAM
 *   2. Use OS CreateEqu to create Y1=X equation in VAT
 *   3. Use OS CreateReal to create the X real variable
 *   4. For X pixel columns 0, 10, 20, ..., 260:
 *      a. Convert pixel X to math X via: mathX = Xmin + (pixelX / pixWideP) * (Xmax - Xmin)
 *      b. Write mathX into the X variable's data slot
 *      c. Call GraphPars body (0x099874) with OP1 = Y1 name
 *      d. Read OP1 to get computed Y value
 *      e. Convert math Y to pixel Y via: pixelY = pixWide_m_2 - ((mathY - Ymin) / (Ymax - Ymin)) * pixWide_m_2
 *      f. Call IPoint (0x07B451) with A=1 (draw), BC=pixelX, DE=pixelY
 *   5. Count non-zero bytes in plotSScreen
 *
 * Key addresses:
 *   GraphPars body: 0x099874 (past name construction)
 *   IPoint:         0x07B451
 *   CreateEqu:      0x082438
 *   CreateReal:     0x082438 (same routine, different OP1 type)
 *   errNo:          0xD008DF
 *   errSP:          0xD008E0
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
const CREATEEQU_RET = 0x7FFFFA;
const CREATEREAL_RET = 0x7FFFF8;
const GRAPHPARS_RET = 0x7FFFF4;
const IPOINT_RET = 0x7FFFF2;
const MEMINIT_RET = 0x7FFFF6;

// Entry points
const CREATEEQU_ENTRY = 0x082438;
const GRAPHPARS_BODY_ENTRY = 0x099874;
const IPOINT_ENTRY = 0x07B451;
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

// Graph buffer — 8bpp, 320 pixels wide, 165 rows for graph area
const PLOTSSCREEN_ADDR = 0xD52C00;
const PLOTSSCREEN_WIDTH = 320;
const PLOTSSCREEN_HEIGHT = 240;
const PLOTSSCREEN_SIZE = PLOTSSCREEN_WIDTH * PLOTSSCREEN_HEIGHT;

// Also check the secondary plotSScreen location used by some probes
const PLOTSSCREEN_ALT_ADDR = 0xD09466;
const PLOTSSCREEN_ALT_SIZE = 21945;

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
const REALOBJ_TYPE = 0x00;
const TY1 = 0x10;
const TX = 0x58;

const MAX_LOOP_ITER = 8192;

// Graph window parameters (match session 136)
const XMIN = -10;
const XMAX = 10;
const YMIN = -10;
const YMAX = 10;
const PIX_WIDE_P = 265;   // graph area pixel width
const PIX_WIDE_M2 = 165;  // graph area pixel height

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

// Separate FP stack from equation data area.
// Equation data goes at USERMEM_ADDR (0xD1A881).
// FP stack starts 0x200 bytes later to leave room for equation + X variable data.
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
  write16(mem, PIX_WIDE_P_ADDR, PIX_WIDE_P);
  write16(mem, PIX_WIDE_M2_ADDR, PIX_WIDE_M2);
  write16(mem, DRAW_COLOR_CODE_ADDR, 0x001F);  // blue pen
  write16(mem, DRAW_FG_COLOR_ADDR, 0x001F);
  write16(mem, DRAW_BG_COLOR_ADDR, 0xFFFF);
  mem[HOOKFLAGS3_ADDR] &= ~0x80;
  mem[MODE_BYTE_ADDR] = 1;
  mem[0xD00082] |= (1 << 4); // grfFuncM bit 4
}

function seedGraphWindow(mem) {
  const wrapped = wrapMem(mem);
  writeReal(wrapped, XMIN_ADDR, XMIN);
  writeReal(wrapped, XMAX_ADDR, XMAX);
  writeReal(wrapped, XSCL_ADDR, 1);
  writeReal(wrapped, YMIN_ADDR, YMIN);
  writeReal(wrapped, YMAX_ADDR, YMAX);
  writeReal(wrapped, YSCL_ADDR, 1);
  writeReal(wrapped, XRES_ADDR, 1);
  mem[GRAPHMODE_ADDR] = 0; // function mode
}

// ── Error frame setup ────────────────────────────────────────────────────

function seedErrorFrame(cpu, mem, recoveryAddr) {
  const errFrameSP = cpu.sp - 18;
  write24(mem, errFrameSP + 0, 0xD00080);   // IY
  write24(mem, errFrameSP + 3, 0xD1A860);   // IX
  write24(mem, errFrameSP + 6, 0x000000);   // BC
  write24(mem, errFrameSP + 9, 0x000000);   // DE
  write24(mem, errFrameSP + 12, recoveryAddr);  // HL = recovery address
  write24(mem, errFrameSP + 15, 0x000040);  // AF (A=0, F=0x40)
  write24(mem, ERR_SP_ADDR, errFrameSP);
  mem[ERR_NO_ADDR] = 0x00;
  return errFrameSP;
}

// ── OS routine caller ────────────────────────────────────────────────────

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
  mem[OP1_ADDR + 0] = EQUOBJ_TYPE;  // 0x03
  mem[OP1_ADDR + 1] = TY1;          // 0x10

  prepareCallState(cpu, mem);
  cpu._hl = 1;  // data size = 1 byte for tX token
  cpu.sp -= 3;
  write24(mem, cpu.sp, CREATEEQU_RET);

  // Seed errSP for CreateEqu
  seedErrorFrame(cpu, mem, CREATEEQU_RET);

  // Re-set OP1 (prepareCallState may have clobbered it)
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem[OP1_ADDR + 0] = EQUOBJ_TYPE;
  mem[OP1_ADDR + 1] = TY1;

  const result = callOSRoutine('CreateEqu', CREATEEQU_ENTRY, CREATEEQU_RET, executor, cpu, mem, 50000);
  const de = cpu._de;
  const errNo = mem[ERR_NO_ADDR];

  console.log(`  CreateEqu: returned=${result.returnHit} steps=${result.steps} DE=${hex(de)} errNo=${hex(errNo, 2)}`);

  if (result.returnHit && errNo === 0x00 && de >= 0xD00000 && de < 0xD40000) {
    mem[de] = TX;  // Write tX token
    console.log(`  Wrote tX (0x58) at DE=${hex(de)}`);
    return { dataAddr: de - 2, tokenAddr: de, success: true };
  }
  console.log(`  CreateEqu FAILED`);
  return { dataAddr: 0, tokenAddr: 0, success: false };
}

// ── Create X real variable via OS CreateReal ─────────────────────────────

function createRealX(executor, cpu, mem) {
  // OP1 for real variable X: type=0x00 (RealObj), name=0x58 (tX)
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem[OP1_ADDR + 0] = REALOBJ_TYPE;  // 0x00
  mem[OP1_ADDR + 1] = TX;            // 0x58 = 'X'

  prepareCallState(cpu, mem);
  cpu._hl = 9;  // data size = 9 bytes for a real number
  cpu.sp -= 3;
  write24(mem, cpu.sp, CREATEREAL_RET);

  // Seed errSP
  seedErrorFrame(cpu, mem, CREATEREAL_RET);

  // Re-set OP1
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem[OP1_ADDR + 0] = REALOBJ_TYPE;
  mem[OP1_ADDR + 1] = TX;

  // CreateReal is the same entry as CreateEqu for type 0x00
  const result = callOSRoutine('CreateReal', CREATEEQU_ENTRY, CREATEREAL_RET, executor, cpu, mem, 50000);
  const de = cpu._de;
  const errNo = mem[ERR_NO_ADDR];

  console.log(`  CreateReal(X): returned=${result.returnHit} steps=${result.steps} DE=${hex(de)} errNo=${hex(errNo, 2)}`);

  if (result.returnHit && errNo === 0x00 && de >= 0xD00000 && de < 0xD40000) {
    // Write zero initially
    const wrapped = wrapMem(mem);
    writeReal(wrapped, de, 0);
    console.log(`  X variable data at DE=${hex(de)}: [${hexBytes(mem, de, 9)}]`);
    return { dataAddr: de, success: true };
  }
  console.log(`  CreateReal(X) FAILED`);
  return { dataAddr: 0, success: false };
}

// ── Call GraphPars body ──────────────────────────────────────────────────

// Key known addresses for annotation in GraphPars trace
const GP_KNOWN_ADDRS = new Map([
  [0x099874, 'GraphPars body entry'],
  [0x08383D, 'ChkFindSym'],
  [0x0846EA, 'FindSym'],
  [0x084711, 'FindSym found'],
  [0x061DB2, 'JError'],
  [0x09992E, 'GP token eval 1'],
  [0x099936, 'GP token eval 2'],
  [0x099952, 'GP token eval 3'],
  [0x09AE5C, 'GP token eval 4'],
  [0x09BAC5, 'GP token eval 5'],
  [0x099D45, 'GP curPC write'],
  [0x07B451, 'IPoint'],
]);

function callGraphParsBody(executor, cpu, mem, equTokenAddr, trace = false) {
  // Pre-set OP1 to correct Y1 name
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem[OP1_ADDR + 0] = EQUOBJ_TYPE;
  mem[OP1_ADDR + 1] = TY1;

  // Seed parser pointers to equation token data
  write24(mem, BEGPC_ADDR, equTokenAddr);
  write24(mem, CURPC_ADDR, equTokenAddr);
  write24(mem, ENDPC_ADDR, equTokenAddr + 1);

  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, GRAPHPARS_RET);

  // Seed error frame
  seedErrorFrame(cpu, mem, GRAPHPARS_RET);

  // Re-set OP1 (prepareCallState may clobber)
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);
  mem[OP1_ADDR + 0] = EQUOBJ_TYPE;
  mem[OP1_ADDR + 1] = TY1;

  let returnHit = false;
  let steps = 0;
  const firstPcs = [];
  try {
    executor.runFrom(GRAPHPARS_BODY_ENTRY, 'adl', {
      maxSteps: 5000,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        steps++;
        const norm = pc & 0xffffff;
        if (trace && firstPcs.length < 400) firstPcs.push(norm);
        if (norm === GRAPHPARS_RET || norm === FAKE_RET) { returnHit = true; throw new Error('__RET__'); }
      },
      onMissingBlock(pc) {
        steps++;
        const norm = pc & 0xffffff;
        if (trace && firstPcs.length < 400) firstPcs.push(norm);
        if (norm === GRAPHPARS_RET || norm === FAKE_RET) { returnHit = true; throw new Error('__RET__'); }
      },
    });
  } catch (e) {
    if (e?.message !== '__RET__') throw e;
  }

  if (trace) {
    console.log(`  GraphPars trace (${firstPcs.length} PCs):`);
    for (let i = 0; i < firstPcs.length; i += 8) {
      const row = firstPcs.slice(i, i + 8).map(p => {
        const ann = GP_KNOWN_ADDRS.get(p);
        return ann ? `${hex(p)}[${ann}]` : hex(p);
      });
      console.log(`    ${row.join(' ')}`);
    }
  }

  const errNo = mem[ERR_NO_ADDR];
  return { returnHit, steps, errNo };
}

// ── Call IPoint ──────────────────────────────────────────────────────────

function callIPoint(executor, cpu, mem, xPixel, yPixel) {
  prepareCallState(cpu, mem);
  cpu.a = 1;  // drawMode=1 (normal draw, per session 129)
  cpu._bc = xPixel & 0xffffff;
  cpu._de = yPixel & 0xffffff;
  cpu.sp -= 3;
  write24(mem, cpu.sp, IPOINT_RET);

  const result = callOSRoutine('IPoint', IPOINT_ENTRY, IPOINT_RET, executor, cpu, mem, 5000);
  return { returnHit: result.returnHit, steps: result.steps };
}

// ── Coordinate conversion ────────────────────────────────────────────────

function pixelToMathX(pixelX) {
  return XMIN + (pixelX / PIX_WIDE_P) * (XMAX - XMIN);
}

function mathToPixelY(mathY) {
  // Y increases upward in math but downward in pixels
  // pixelY = pixHeight - ((mathY - Ymin) / (Ymax - Ymin)) * pixHeight
  const frac = (mathY - YMIN) / (YMAX - YMIN);
  return Math.round(PIX_WIDE_M2 - frac * PIX_WIDE_M2);
}

// ── Count non-zero bytes ─────────────────────────────────────────────────

function countNonZero(mem, addr, size) {
  let count = 0;
  for (let i = 0; i < size; i++) {
    if (mem[addr + i] !== 0) count++;
  }
  return count;
}

function dumpNonZeroSample(mem, addr, size, label, maxEntries = 30) {
  const entries = [];
  for (let i = 0; i < size && entries.length < maxEntries; i++) {
    if (mem[addr + i] !== 0) {
      entries.push({ offset: i, val: mem[addr + i] });
    }
  }
  if (entries.length > 0) {
    console.log(`  ${label} non-zero bytes (first ${entries.length}):`);
    for (const { offset, val } of entries) {
      console.log(`    offset=${hex(offset, 4)} val=${hex(val, 2)}`);
    }
  } else {
    console.log(`  ${label}: no non-zero bytes`);
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 137: GraphPars Rendering Loop — Multi-X Evaluation + IPoint ===');
  console.log('');
  console.log('Strategy: Create Y1=X + X variable, loop GraphPars body per pixel column,');
  console.log('  read OP1 for Y value, call IPoint for each (X,Y) pair.');
  console.log('');

  // ── Setup runtime ──
  const { mem, executor, cpu } = createRuntime();
  console.log('Cold-booting OS...');
  coldBoot(executor, cpu, mem);
  console.log('Cold boot complete.\n');

  // Save post-boot snapshot
  const memSnapshot = new Uint8Array(MEM_SIZE);
  memSnapshot.set(mem);

  // ── Run MEM_INIT ──
  prepareCallState(cpu, mem);
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;

  console.log('Running MEM_INIT...');
  const memInitResult = callOSRoutine('MEM_INIT', MEMINIT_ENTRY, MEMINIT_RET, executor, cpu, mem, 100000);
  console.log(`MEM_INIT: returned=${memInitResult.returnHit} steps=${memInitResult.steps}\n`);

  // ── Seed allocator, graph window, graph RAM ──
  seedAllocator(mem);
  seedGraphWindow(mem);
  seedGraphRAM(mem);
  mem[0xD00083] |= 1; // graphDraw dirty

  // Clear both plotSScreen areas
  mem.fill(0, PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);
  mem.fill(0, PLOTSSCREEN_ALT_ADDR, PLOTSSCREEN_ALT_ADDR + PLOTSSCREEN_ALT_SIZE);

  // ── Create Y1=X equation ──
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
  console.log(`  Post-CreateEqu allocator: OPS=${hex(postEquOPS)} OPBase=${hex(postEquOPBase)} progPtr=${hex(postEquProgPtr)} FPS=${hex(postEquFPS)}\n`);

  // ── Create X real variable ──
  console.log('Creating X real variable...');
  const xVar = createRealX(executor, cpu, mem);
  if (!xVar.success) {
    console.log('ABORT: CreateReal(X) failed');
    return;
  }

  // Save allocator state after CreateReal
  const postXOPS = read24(mem, OPS_ADDR);
  const postXOPBase = read24(mem, OPBASE_ADDR);
  const postXProgPtr = read24(mem, PROGPTR_ADDR);
  const postXFPS = read24(mem, FPS_ADDR);
  console.log(`  Post-CreateReal allocator: OPS=${hex(postXOPS)} OPBase=${hex(postXOPBase)} progPtr=${hex(postXProgPtr)} FPS=${hex(postXFPS)}`);

  // Dump the full VAT area from OPBase to EMPTY_VAT_ADDR
  console.log(`  VAT area (${hex(postXOPBase)} to 0xD3FFFF):`);
  const vatSize = 0xD3FFFF - postXOPBase + 1;
  console.log(`  [${hexBytes(mem, postXOPBase, Math.min(vatSize, 32))}]`);
  console.log(`  Data area at USERMEM (${hex(USERMEM_ADDR)}, 32 bytes):`);
  console.log(`  [${hexBytes(mem, USERMEM_ADDR - 4, 36)}]`);
  console.log('');

  // Dump VAT area to verify both entries exist
  // Raw VAT dump (bytes at OPBase backwards)
  console.log(`VAT raw bytes at OPBase=${hex(postXOPBase)} (32 bytes before):`)
  console.log(`  [${hexBytes(mem, postXOPBase - 32, 32)}]`);
  console.log(`  OPS=${hex(postXOPS)} (should == OPBase after creates)`);

  // TI-84 VAT entry format (bottom-up, from OPBase-1 backwards):
  // For RealObj (type 0x00): 6-byte entries
  //   [dataPtr_lo, dataPtr_hi, dataPtr_upper, type, ?, name_byte]
  // Actually the TI VAT format is:
  //   Starting from top: [name_byte(s), ?, type, dataPtr_upper, dataPtr_hi, dataPtr_lo]
  // Let me just dump raw bytes and check FindSym behavior
  console.log('VAT entries (raw scan):');
  let ptr = postXOPBase;
  for (let i = 0; i < 4 && ptr > postXOPBase - 40; i++) {
    // Each entry is 6 bytes for 1-byte-name vars:
    // [ptr-6..ptr-1] = [dataLo, dataMid, dataHi, type, nameLen, name]
    // Actually TI-84 VAT stores entries growing DOWNWARD:
    // [name, nameLen_or_version, type, dataHi, dataMid, dataLo] from high to low
    // ptr-1 = name byte (e.g. 0x58 for X)
    // ptr-2 = name length / version
    // ptr-3 = type (0x00 for real, 0x03 for equ)
    // ptr-4 = data pointer high
    // ptr-5 = data pointer mid
    // ptr-6 = data pointer low
    const raw = [];
    for (let j = 1; j <= 6; j++) raw.push(mem[ptr - j] & 0xff);
    console.log(`  Entry[${i}] @ ${hex(ptr)}: bytes=[${raw.map(b => hex(b, 2)).join(' ')}]`);
    console.log(`    name=${hex(raw[0], 2)} nameLen=${raw[1]} type=${hex(raw[2], 2)} dataPtr=${hex(raw[3] | (raw[4] << 8) | (raw[5] << 16))}`);
    ptr -= 6;
  }
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════
  // Test A: Single GraphPars call with X=5.0 to verify the pipeline
  // ═══════════════════════════════════════════════════════════════════════

  console.log('=== Test A: Single GraphPars call with X=5.0 ===');

  // Write X=5.0 to the X variable data slot
  const wrapped = wrapMem(mem);
  writeReal(wrapped, xVar.dataAddr, 5.0);
  console.log(`  X variable data: [${hexBytes(mem, xVar.dataAddr, 9)}] = ${readReal(wrapped, xVar.dataAddr)}`);

  // Reset allocator pointers to post-CreateReal values (GraphPars/CreateEqu may corrupt)
  write24(mem, OPS_ADDR, postXOPS);
  write24(mem, OPBASE_ADDR, postXOPBase);
  write24(mem, PROGPTR_ADDR, postXProgPtr);
  write24(mem, FPS_ADDR, postXFPS);
  write24(mem, FPSBASE_ADDR, FPS_START_ADDR);

  // Save FPS before GraphPars
  const fpsBeforeGP = read24(mem, FPS_ADDR);
  console.log(`  FPS before GraphPars: ${hex(fpsBeforeGP)}`);

  const gpResult = callGraphParsBody(executor, cpu, mem, equ.tokenAddr, true);
  console.log(`  GraphPars: returned=${gpResult.returnHit} steps=${gpResult.steps} errNo=${hex(gpResult.errNo, 2)}`);

  // Read OP1 to get computed Y value
  const op1After = [];
  for (let i = 0; i < OP1_LEN; i++) op1After.push(mem[OP1_ADDR + i] & 0xff);
  console.log(`  OP1 after GraphPars: [${op1After.map(b => hex(b, 2)).join(' ')}]`);
  console.log(`  OP2 after GraphPars: [${hexBytes(mem, OP2_ADDR, OP1_LEN)}]`);

  // Check FP register area (0xD0060E = category, 0xD00608..0xD00612 = 11-byte FP reg)
  console.log(`  FP category byte: ${hex(mem[FP_CATEGORY_ADDR], 2)}`);
  console.log(`  FP register (0xD00604-0xD00612): [${hexBytes(mem, 0xD00604, 15)}]`);

  // Check FPS after GraphPars
  const fpsAfterGP = read24(mem, FPS_ADDR);
  console.log(`  FPS after GraphPars: ${hex(fpsAfterGP)} (delta=${fpsAfterGP - fpsBeforeGP})`);
  if (fpsAfterGP > fpsBeforeGP) {
    // There's data on the FP stack — try reading it
    console.log(`  FP stack top 9 bytes: [${hexBytes(mem, fpsBeforeGP, 9)}]`);
    const savedType2 = mem[fpsBeforeGP];
    mem[fpsBeforeGP] = savedType2 & 0x3F;
    try {
      const fpVal = readReal(wrapped, fpsBeforeGP);
      console.log(`  FP stack top decoded: ${fpVal}`);
    } catch (e) {
      console.log(`  FP stack top decode failed: ${e.message}`);
    }
    mem[fpsBeforeGP] = savedType2;
  }

  // Check the X variable data to see if it was read
  console.log(`  X variable data after GP: [${hexBytes(mem, xVar.dataAddr, 9)}]`);

  // Check equation data area — maybe Y value is stored there
  console.log(`  Equation data area (${hex(equ.dataAddr)}, 12 bytes): [${hexBytes(mem, equ.dataAddr, 12)}]`);
  console.log(`  Token at ${hex(equ.tokenAddr)}: ${hex(mem[equ.tokenAddr], 2)}`);

  // Check CPU registers for the Y value
  console.log(`  CPU regs after GP: A=${hex(cpu.a, 2)} BC=${hex(cpu._bc)} DE=${hex(cpu._de)} HL=${hex(cpu._hl)}`);

  // Scan RAM areas that might hold the computed Y value
  // Check OPS area (equation's output area), and the region around the equation data
  const equDataStart = equ.dataAddr - 4;
  console.log(`  Equation region (${hex(equDataStart)}, 20 bytes): [${hexBytes(mem, equDataStart, 20)}]`);

  // Check the FP answer register area (0xD00604-0xD00612)
  // Also check OP3-OP6 (0xD0060C, 0xD00616, 0xD00620, 0xD0062A)
  const OP3_ADDR = 0xD0060C;
  const OP4_ADDR = 0xD00616;
  const OP5_ADDR = 0xD00620;
  const OP6_ADDR = 0xD0062A;
  console.log(`  OP3: [${hexBytes(mem, OP3_ADDR, 9)}]`);
  console.log(`  OP4: [${hexBytes(mem, OP4_ADDR, 9)}]`);
  console.log(`  OP5: [${hexBytes(mem, OP5_ADDR, 9)}]`);
  console.log(`  OP6: [${hexBytes(mem, OP6_ADDR, 9)}]`);

  // Try to decode OP1 as a real number
  try {
    const yVal = readReal(wrapped, OP1_ADDR);
    console.log(`  OP1 decoded as real: ${yVal}`);
  } catch (e) {
    console.log(`  OP1 decode failed: ${e.message}`);
    // The type byte may be 0x43 (evaluated flag set) — try reading with type cleared
    const savedType = mem[OP1_ADDR];
    mem[OP1_ADDR] = savedType & 0x3F;  // clear bit 6
    try {
      const yVal = readReal(wrapped, OP1_ADDR);
      console.log(`  OP1 decoded (type cleared to ${hex(savedType & 0x3F, 2)}): ${yVal}`);
    } catch (e2) {
      console.log(`  OP1 still can't decode: ${e2.message}`);
    }
    mem[OP1_ADDR] = savedType;  // restore
  }
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════
  // Test B: Single IPoint call to verify pixel writing
  // ═══════════════════════════════════════════════════════════════════════

  console.log('=== Test B: Single IPoint call at (10, 10) ===');
  seedGraphRAM(mem);  // Re-seed since GraphPars may have changed state
  const ipResult = callIPoint(executor, cpu, mem, 10, 10);
  console.log(`  IPoint: returned=${ipResult.returnHit} steps=${ipResult.steps}`);

  const pixelsAfterB = countNonZero(mem, PLOTSSCREEN_ADDR, PLOTSSCREEN_SIZE);
  const pixelsAltAfterB = countNonZero(mem, PLOTSSCREEN_ALT_ADDR, PLOTSSCREEN_ALT_SIZE);
  console.log(`  plotSScreen (0xD52C00): ${pixelsAfterB} non-zero bytes`);
  console.log(`  plotSScreen alt (0xD09466): ${pixelsAltAfterB} non-zero bytes`);
  if (pixelsAfterB > 0) dumpNonZeroSample(mem, PLOTSSCREEN_ADDR, PLOTSSCREEN_SIZE, 'plotSScreen');
  if (pixelsAltAfterB > 0) dumpNonZeroSample(mem, PLOTSSCREEN_ALT_ADDR, PLOTSSCREEN_ALT_SIZE, 'plotSScreen alt');
  console.log('');

  // ═══════════════════════════════════════════════════════════════════════
  // Test C: GraphPars loop — evaluate Y1=X for multiple X pixel columns
  // ═══════════════════════════════════════════════════════════════════════

  console.log('=== Test C: GraphPars Loop — Multi-X Evaluation ===');

  // Clear plotSScreen
  mem.fill(0, PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);
  mem.fill(0, PLOTSSCREEN_ALT_ADDR, PLOTSSCREEN_ALT_ADDR + PLOTSSCREEN_ALT_SIZE);

  const xPixelValues = [];
  for (let px = 0; px <= 260; px += 10) xPixelValues.push(px);

  const results = [];
  let graphParsErrors = 0;
  let ipointErrors = 0;
  let totalGraphParsSteps = 0;
  let totalIPointSteps = 0;

  for (const pixelX of xPixelValues) {
    const mathX = pixelToMathX(pixelX);

    // Write X value to the X variable data slot
    writeReal(wrapped, xVar.dataAddr, mathX);

    // Reset allocator pointers before each GraphPars call
    write24(mem, OPS_ADDR, postXOPS);
    write24(mem, OPBASE_ADDR, postXOPBase);
    write24(mem, PROGPTR_ADDR, postXProgPtr);
    write24(mem, FPS_ADDR, postXFPS);
    write24(mem, FPSBASE_ADDR, FPS_START_ADDR);

    // Re-seed graph RAM (IPoint may change state)
    seedGraphRAM(mem);

    // Call GraphPars body
    const gp = callGraphParsBody(executor, cpu, mem, equ.tokenAddr);
    totalGraphParsSteps += gp.steps;

    if (gp.errNo !== 0x00) {
      graphParsErrors++;
      results.push({ pixelX, mathX, mathY: null, pixelY: null, gpSteps: gp.steps, gpErr: gp.errNo, ipSteps: 0, ipRet: false });
      if (graphParsErrors <= 3) {
        console.log(`  pixelX=${pixelX} mathX=${mathX.toFixed(4)}: GraphPars ERROR errNo=${hex(gp.errNo, 2)} steps=${gp.steps}`);
      }
      continue;
    }

    // Read OP1 to get Y value
    let mathY = null;
    const savedType = mem[OP1_ADDR];
    mem[OP1_ADDR] = savedType & 0x3F;  // clear evaluated flag (bit 6)
    try {
      mathY = readReal(wrapped, OP1_ADDR);
    } catch (e) {
      // If OP1 can't be decoded, skip this point
      mathY = null;
    }
    mem[OP1_ADDR] = savedType;  // restore

    if (mathY === null) {
      results.push({ pixelX, mathX, mathY: null, pixelY: null, gpSteps: gp.steps, gpErr: 0, ipSteps: 0, ipRet: false });
      continue;
    }

    // Convert math Y to pixel Y
    const pixelY = mathToPixelY(mathY);

    // Clamp pixel Y to valid range for IPoint bounds check
    const clampedPixelY = Math.max(0, Math.min(PIX_WIDE_M2 - 1, pixelY));

    // Call IPoint
    seedGraphRAM(mem);  // re-seed
    const ip = callIPoint(executor, cpu, mem, pixelX, clampedPixelY);
    totalIPointSteps += ip.steps;
    if (!ip.returnHit) ipointErrors++;

    results.push({
      pixelX, mathX, mathY, pixelY: clampedPixelY,
      gpSteps: gp.steps, gpErr: 0,
      ipSteps: ip.steps, ipRet: ip.returnHit
    });
  }

  // ── Report results ──
  console.log(`\n  === PER-COLUMN RESULTS (${results.length} columns) ===`);
  for (const r of results) {
    const yStr = r.mathY !== null ? r.mathY.toFixed(4) : 'ERROR';
    const pyStr = r.pixelY !== null ? String(r.pixelY) : 'n/a';
    const errStr = r.gpErr ? ` gpErr=${hex(r.gpErr, 2)}` : '';
    const ipStr = r.ipRet ? 'OK' : 'FAIL';
    console.log(`    px=${String(r.pixelX).padStart(3)} mathX=${r.mathX.toFixed(4).padStart(8)} mathY=${yStr.padStart(8)} pixY=${pyStr.padStart(4)} gpSteps=${String(r.gpSteps).padStart(4)} ipSteps=${String(r.ipSteps).padStart(4)} ip=${ipStr}${errStr}`);
  }

  // ── Check plotSScreen for pixels ──
  const pixelsFinal = countNonZero(mem, PLOTSSCREEN_ADDR, PLOTSSCREEN_SIZE);
  const pixelsAltFinal = countNonZero(mem, PLOTSSCREEN_ALT_ADDR, PLOTSSCREEN_ALT_SIZE);
  console.log(`\n  plotSScreen (0xD52C00): ${pixelsFinal} non-zero bytes`);
  console.log(`  plotSScreen alt (0xD09466): ${pixelsAltFinal} non-zero bytes`);
  if (pixelsFinal > 0) dumpNonZeroSample(mem, PLOTSSCREEN_ADDR, PLOTSSCREEN_SIZE, 'plotSScreen');
  if (pixelsAltFinal > 0) dumpNonZeroSample(mem, PLOTSSCREEN_ALT_ADDR, PLOTSSCREEN_ALT_SIZE, 'plotSScreen alt');

  // ═══════════════════════════════════════════════════════════════════════
  // Test D: JS-computed Y=X + IPoint loop (bypass GraphPars)
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n\n=== Test D: JS-computed Y=X + IPoint loop (bypass GraphPars) ===');

  // Clear plotSScreen
  mem.fill(0, PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);
  mem.fill(0, PLOTSSCREEN_ALT_ADDR, PLOTSSCREEN_ALT_ADDR + PLOTSSCREEN_ALT_SIZE);

  let dPixelsDrawn = 0;
  let dIPointOK = 0;
  let dIPointFail = 0;

  // For Y1=X, mathY=mathX, so we compute pixel coordinates directly
  for (let pixelX = 0; pixelX <= 260; pixelX += 2) {
    const mathX = pixelToMathX(pixelX);
    const mathY = mathX;  // Y1=X → Y=X
    const pixelY = mathToPixelY(mathY);

    // Skip out-of-bounds points
    if (pixelY < 0 || pixelY >= PIX_WIDE_M2) continue;

    // Re-seed graph RAM before each IPoint
    seedGraphRAM(mem);

    const ip = callIPoint(executor, cpu, mem, pixelX, pixelY);
    if (ip.returnHit) {
      dIPointOK++;
    } else {
      dIPointFail++;
    }
    dPixelsDrawn++;
  }

  const pixelsD = countNonZero(mem, PLOTSSCREEN_ADDR, PLOTSSCREEN_SIZE);
  const pixelsAltD = countNonZero(mem, PLOTSSCREEN_ALT_ADDR, PLOTSSCREEN_ALT_SIZE);
  console.log(`  IPoint calls: ${dPixelsDrawn} (OK=${dIPointOK}, FAIL=${dIPointFail})`);
  console.log(`  plotSScreen (0xD52C00): ${pixelsD} non-zero bytes`);
  console.log(`  plotSScreen alt (0xD09466): ${pixelsAltD} non-zero bytes`);
  if (pixelsD > 0) dumpNonZeroSample(mem, PLOTSSCREEN_ADDR, PLOTSSCREEN_SIZE, 'plotSScreen', 50);
  if (pixelsAltD > 0) dumpNonZeroSample(mem, PLOTSSCREEN_ALT_ADDR, PLOTSSCREEN_ALT_SIZE, 'plotSScreen alt', 50);

  // ═══════════════════════════════════════════════════════════════════════
  // Summary
  // ═══════════════════════════════════════════════════════════════════════

  console.log('\n\n=== SUMMARY ===');
  console.log(`  Total columns attempted: ${results.length}`);
  console.log(`  GraphPars errors: ${graphParsErrors}`);
  console.log(`  GraphPars total steps: ${totalGraphParsSteps}`);
  console.log(`  IPoint errors: ${ipointErrors}`);
  console.log(`  IPoint total steps: ${totalIPointSteps}`);

  const successfulY = results.filter(r => r.mathY !== null);
  console.log(`  Successful Y evaluations: ${successfulY.length}`);

  // Check if Y=X (for Y1=X, mathY should equal mathX)
  let yEqualsXCount = 0;
  for (const r of successfulY) {
    if (Math.abs(r.mathY - r.mathX) < 0.01) yEqualsXCount++;
  }
  console.log(`  Y≈X matches (within 0.01): ${yEqualsXCount} / ${successfulY.length}`);
  console.log(`  plotSScreen pixels (Test C): ${pixelsFinal}`);
  console.log(`  plotSScreen alt pixels (Test C): ${pixelsAltFinal}`);
  console.log(`  plotSScreen pixels (Test D, JS bypass): ${pixelsD}`);
  console.log(`  plotSScreen alt pixels (Test D, JS bypass): ${pixelsAltD}`);

  // Key questions answered
  console.log('\n  === KEY QUESTIONS ===');
  console.log(`  Does GraphPars evaluate Y1=X correctly?     ${yEqualsXCount > 0 ? `YES (${yEqualsXCount} matches)` : 'NO — always returns 0 (see analysis below)'}`);
  console.log(`  Does IPoint produce pixels?                 ${pixelsD > 0 || pixelsAltD > 0 ? 'YES' : 'NO'} (Test D: ${pixelsD + pixelsAltD} bytes)`);
  console.log(`  GraphPars return clean (errNo=0)?            ${graphParsErrors === 0 ? 'YES' : `NO (${graphParsErrors} errors)`}`);
  console.log(`  IPoint return cleanly?                      ${ipointErrors === 0 ? 'YES (Test C)' : `NO (${ipointErrors} errors)`}, ${dIPointFail === 0 ? 'YES (Test D)' : `NO (${dIPointFail} fails)`}`);

  console.log('\n  === ANALYSIS ===');
  console.log('  GraphPars body at 0x099874 evaluates Y1=X in 341 steps, errNo=0x00.');
  console.log('  OP1 after = [0x43, 0x10, 0x00...] — equation name with evaluated flag (bit 6),');
  console.log('  NOT the computed Y value. GraphPars stores the Y result elsewhere.');
  console.log('  The tX token handler at 0x07D1B4 does NOT call FindSym for the X variable.');
  console.log('  Instead it reads X from a dedicated location (not identified yet).');
  console.log('  IPoint at 0x07B451 with A=1 (draw mode) WORKS — writes blue pixels.');
  console.log('  IPoint writes to plotSScreen at 0xD52C00 (320*240 = 76800 bytes).');
  console.log('  NEXT: Identify where GraphPars reads X from (dedicated RAM slot vs VAT).');
  console.log('  NEXT: Identify where GraphPars stores the computed Y value.');
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
