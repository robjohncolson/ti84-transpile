#!/usr/bin/env node

/**
 * Phase 129 — Graph subsystem re-investigation: IPoint direct call
 *
 * Tests IPoint (0x07B451) with fully seeded graph RAM to determine
 * why it fails to write pixels to plotSScreen. Two scenarios:
 *   A) Fully seeded RAM (graph window, pixel dims, pen color, etc.)
 *   B) Unseeded RAM — compare to find which RAM read causes bail-out
 *
 * Key questions:
 *   - Is MBASE 0xD0 at bounds-check (0x07B793)?
 *   - Which branch bails out?
 *   - What RAM values does IPoint read before writing pixels?
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

// IPoint entry address (actual implementation, not jump table)
const IPOINT_ENTRY = 0x07B451;
const BOUNDS_CHECK_ADDR = 0x07B793;

// Graph RAM addresses from ti84pceg.inc
const XMIN_ADDR   = 0xD01E33;
const XMAX_ADDR   = 0xD01E3C;
const XSCL_ADDR   = 0xD01E45;
const YMIN_ADDR   = 0xD01E4E;
const YMAX_ADDR   = 0xD01E57;
const YSCL_ADDR   = 0xD01E60;

// Pixel dimension addresses
const XOFFSET_ADDR    = 0xD014FA;
const YOFFSET_ADDR    = 0xD014FC;
const LCD_TALL_P_ADDR = 0xD014FD;
const PIX_WIDE_P_ADDR = 0xD014FE;
const PIX_WIDE_M1_ADDR = 0xD014FF;  // pixWide - 1 (16-bit)
const PIX_WIDE_M2_ADDR = 0xD01501;  // pixWide - 2 (16-bit)

// Draw state addresses
const DRAW_MODE_ADDR   = 0xD02AC8;
const MODE_BYTE_ADDR   = 0xD02AD4;
const DRAW_FG_COLOR_ADDR = 0xD026AC;
const DRAW_COLOR_CODE_ADDR = 0xD026AE;
const DRAW_BG_COLOR_ADDR = 0xD026AA;

// Graph buffer
const PLOTSSCREEN_ADDR = 0xD09466;
const PLOTSSCREEN_SIZE = 21945;

// Graph mode / flags
const GRAPH_MODE_ADDR  = 0xD01474;   // freeSaveX, also graph mode in session 126
const GRAPH_FLAGS_ADDR = 0xD00083;   // IY+3h = graphFlags
const HOOKFLAGS3_ADDR  = 0xD000B5;   // IY+35h = hookflags3

// ILine save locations from task spec
const SAVE_BC_ADDR = 0xD022D1;
const SAVE_DE_ADDR = 0xD022D2;

const STEP_BUDGET = 50000;
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

const memWrap = (m) => ({
  write8(a, v) { m[a] = v & 0xff; },
  read8(a) { return m[a] & 0xff; },
});

function safeReadReal(w, a) {
  try { return readReal(w, a); }
  catch (e) { return `readReal error: ${e?.message ?? e}`; }
}

// ── Runtime setup ──────────────────────────────────────────────────────────

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const executor = createExecutor(BLOCKS, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
  });
  return { mem, executor, cpu: executor.cpu, wrap: memWrap(mem) };
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

// ── Disassembler helper ───────────────────────────────────────────────────

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

// ── Seed graph window with BCD reals ──────────────────────────────────────

function seedGraphWindow(mem) {
  const w = memWrap(mem);
  // Xmin = -10, Xmax = 10, Ymin = -10, Ymax = 10
  writeReal(w, XMIN_ADDR, -10);
  writeReal(w, XMAX_ADDR,  10);
  writeReal(w, XSCL_ADDR,   1);
  writeReal(w, YMIN_ADDR, -10);
  writeReal(w, YMAX_ADDR,  10);
  writeReal(w, YSCL_ADDR,   1);
}

function seedPixelDimensions(mem) {
  // Standard TI-84 CE graph area dimensions
  // LCD is 320x240, graph area is roughly 265 wide x 165 tall
  // The bounds-check at 0x07B793 does .SIS LD HL,(0x1501) (16-bit read at 0xD01501)
  // and .SIS LD HL,(0x14FE) (16-bit read at 0xD014FE).
  //
  // Key: these are 16-bit values read with .SIS prefix, stored little-endian.
  // pixWideP at 0xD014FE (2 bytes) = full pixel width (used for X bounds)
  // pixWide_m_2 at 0xD01501 (2 bytes) = pixel height or similar (used for Y bounds)
  //
  // The bounds check logic:
  //   HL = read16(0xD01501)  ; pixWide_m_2
  //   SBC HL, DE             ; compare against Y pixel coord
  //   if carry: bail         ; Y > pixWide_m_2 means out of bounds
  //   HL = read16(0xD014FE)  ; pixWideP
  //   A = C                  ; X low byte
  //   CP L                   ; compare X low with pixWideP low
  //   JR NC: bail            ; X >= pixWideP means out of bounds
  //
  // For a 320x240 LCD: pixWideP=320, pixWide_m_2=240 (or maybe 238?)
  // BUT CP L only compares low bytes! For X=160, L=0x40 (320 & 0xFF),
  // 160 > 64 so it bails. This must mean pixWideP stores something different.
  //
  // Actually, re-reading: maybe the CP is 16-bit via a different mechanism.
  // Let me try setting pixWideP to the graph area width (265 pixels = 0x109).
  // Or maybe the code at 0x07B7A4-0x07B7AA is checking differently.
  //
  // Actually: the code does LD A,C; CP L — that's comparing C (low byte of BC=X)
  // with L (low byte of pixel width). For 8-bit comparison, with X=160 and
  // width=320 (L=0x40), 160 >= 64 so NC, bail. This seems like a real issue.
  // Unless BC/DE aren't raw pixel coords but something else by this point.
  //
  // Let's just set reasonable values and trace what happens.
  write16(mem, XOFFSET_ADDR, 0);
  write16(mem, YOFFSET_ADDR, 0);
  mem[LCD_TALL_P_ADDR] = 240;        // lcdTallP (byte)
  // Write 16-bit values carefully to avoid overlap clobbering
  write16(mem, PIX_WIDE_P_ADDR, 320);   // 0xD014FE-0xD014FF = 0x40, 0x01
  // pixWide_m_1 overlaps with high byte of pixWideP — skip explicit write
  write16(mem, PIX_WIDE_M2_ADDR, 240);  // 0xD01501-0xD01502 = 0xF0, 0x00
}

function seedDrawState(mem) {
  // Draw foreground color = blue (0x001F in RGB565)
  write16(mem, DRAW_FG_COLOR_ADDR, 0x001F);
  write16(mem, DRAW_COLOR_CODE_ADDR, 0x001F);
  write16(mem, DRAW_BG_COLOR_ADDR, 0xFFFF); // white background

  // Also seed the saved pen color location directly (0xD02A60)
  // IPoint copies drawColorCode here at 0x07B513, but let's ensure it
  mem[0xD02A60] = 0x1F;

  // Graph mode = Function mode
  // freeSaveX = 0x10 means function mode per session 126
  mem[GRAPH_MODE_ADDR] = 0x10;

  // graphFlags (IY+3h): bit 0 = graphDraw (dirty), set to 1
  mem[GRAPH_FLAGS_ADDR] |= 0x01;

  // hookflags3 (IY+35h): clear bit 7 so IPoint doesn't bail via hook check
  mem[HOOKFLAGS3_ADDR] &= ~0x80;

  // grfModeFlags (IY+2h = 0xD00082): set bit 4 = grfFuncM (function graph)
  mem[0xD00082] |= (1 << 4);
}

// ── Run IPoint scenario ───────────────────────────────────────────────────

function runIPoint(label, mem, executor, cpu, xPixel, yPixel, drawMode) {
  console.log(`\n--- ${label} ---`);

  prepareCallState(cpu, mem);
  seedAllocator(mem);

  // Set up registers for IPoint:
  // A = draw mode (0 = normal point)
  // BC = X pixel coordinate
  // DE = Y pixel coordinate
  cpu.a = drawMode;
  cpu._bc = xPixel & 0xffffff;
  cpu._de = yPixel & 0xffffff;

  // Push fake return address
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  // Snapshot plotSScreen before
  const plotBefore = new Uint8Array(PLOTSSCREEN_SIZE);
  plotBefore.set(mem.subarray(PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE));

  // Trace data
  const pcHitCounts = new Map();
  const pcOrder = [];
  const recentPcs = [];
  const RECENT_PC_LIMIT = 128;
  const firstNPcs = [];
  const FIRST_N_LIMIT = 500;
  let finalPc = null;
  let returnHit = false;
  let stepCount = 0;
  const missingBlockPcs = new Set();
  const mbaseLog = [];           // MBASE at key addresses
  const ramReads = [];           // notable RAM reads logged

  // Interesting addresses to log MBASE at
  const MBASE_LOG_PCS = new Set([
    IPOINT_ENTRY,     // 0x07B451
    BOUNDS_CHECK_ADDR, // 0x07B793
    0x07B466,          // JR Z after hook check
    0x07B468,          // POP AF (bail path)
    0x07B469,          // RET (bail path)
    0x07B46A,          // instruction after bail (continue path)
    0x07B46B,
    0x07B46C,
    0x07B470,
    0x07B475,
    0x07B480,
    0x07B490,
    0x07B4A0,
    0x07B4B0,
  ]);

  try {
    executor.runFrom(IPOINT_ENTRY, 'adl', {
      maxSteps: STEP_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        const norm = pc & 0xffffff;
        finalPc = norm;
        stepCount++;
        pcHitCounts.set(norm, (pcHitCounts.get(norm) || 0) + 1);
        if (pcHitCounts.get(norm) === 1) pcOrder.push(norm);
        recentPcs.push(norm);
        if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
        if (firstNPcs.length < FIRST_N_LIMIT) firstNPcs.push(norm);

        // Log MBASE at key addresses
        if (MBASE_LOG_PCS.has(norm) || (norm >= 0x07B451 && norm <= 0x07B800)) {
          mbaseLog.push({ pc: norm, mbase: cpu.mbase, a: cpu.a, bc: cpu._bc, de: cpu._de, hl: cpu._hl, f: cpu.f, sp: cpu.sp });
        }

        if (norm === FAKE_RET) throw new Error('__RET__');
      },
      onMissingBlock(pc) {
        const norm = pc & 0xffffff;
        finalPc = norm;
        stepCount++;
        missingBlockPcs.add(norm);
        pcHitCounts.set(norm, (pcHitCounts.get(norm) || 0) + 1);
        recentPcs.push(norm);
        if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
        if (firstNPcs.length < FIRST_N_LIMIT) firstNPcs.push(norm);
        if (norm === FAKE_RET) throw new Error('__RET__');
      },
    });
  } catch (e) {
    if (e?.message === '__RET__') { returnHit = true; finalPc = FAKE_RET; }
    else throw e;
  }

  console.log(`  Result: returnHit=${returnHit} steps=${stepCount} finalPC=${hex(finalPc)}`);

  // Check plotSScreen for changes
  let changedPixels = 0;
  for (let i = 0; i < PLOTSSCREEN_SIZE; i++) {
    if (mem[PLOTSSCREEN_ADDR + i] !== plotBefore[i]) changedPixels++;
  }
  console.log(`  plotSScreen changed bytes: ${changedPixels}`);

  // Dump MBASE log
  if (mbaseLog.length > 0) {
    console.log(`  MBASE log (${mbaseLog.length} entries, showing first 40):`);
    for (let i = 0; i < Math.min(40, mbaseLog.length); i++) {
      const e = mbaseLog[i];
      console.log(`    PC=${hex(e.pc)} MBASE=${hex(e.mbase, 2)} A=${hex(e.a, 2)} BC=${hex(e.bc)} DE=${hex(e.de)} HL=${hex(e.hl)} F=${hex(e.f, 2)} SP=${hex(e.sp)}`);
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

  // Missing blocks
  if (missingBlockPcs.size > 0) {
    console.log(`  Missing blocks (${missingBlockPcs.size}):`);
    const sortedMissing = [...missingBlockPcs].sort((a, b) => a - b);
    for (const pc of sortedMissing) {
      const hits = pcHitCounts.get(pc) || 0;
      console.log(`    ${hex(pc)}: ${hits} hits`);
      if (pc < 0x400000) {
        const instrLines = disassembleRange(pc, Math.min(pc + 16, 0x400000));
        for (const line of instrLines) console.log(`      ${line}`);
      }
    }
  }

  // First N PCs
  console.log(`  First ${Math.min(firstNPcs.length, 100)} PCs visited:`);
  const showPcs = firstNPcs.slice(0, 100);
  for (let i = 0; i < showPcs.length; i += 8) {
    console.log(`    ${showPcs.slice(i, i + 8).map(p => hex(p)).join(' ')}`);
  }

  // Last 64 PCs
  console.log(`  Last 64 PCs visited:`);
  const lastChunk = recentPcs.slice(-64);
  for (let i = 0; i < lastChunk.length; i += 8) {
    console.log(`    ${lastChunk.slice(i, i + 8).map(p => hex(p)).join(' ')}`);
  }

  // RAM state after execution
  console.log('  RAM state after IPoint:');
  console.log(`    drawMode @ ${hex(DRAW_MODE_ADDR)}: ${hex(mem[DRAW_MODE_ADDR], 2)}`);
  console.log(`    modeByte @ ${hex(MODE_BYTE_ADDR)}: ${hex(mem[MODE_BYTE_ADDR], 2)}`);
  console.log(`    drawColorCode @ ${hex(DRAW_COLOR_CODE_ADDR)}: ${hexBytes(mem, DRAW_COLOR_CODE_ADDR, 2)}`);
  console.log(`    penColorSaved @ 0xD02A60: ${hex(mem[0xD02A60], 2)}`);
  console.log(`    hookflags3 @ ${hex(HOOKFLAGS3_ADDR)}: ${hex(mem[HOOKFLAGS3_ADDR], 2)} (bit7=${(mem[HOOKFLAGS3_ADDR] >> 7) & 1})`);

  // Check the actual plotSScreen write location
  if (changedPixels === 0) {
    // Scan plotSScreen for ANY non-zero byte that wasn't there before
    let firstNonZero = -1;
    for (let i = 0; i < PLOTSSCREEN_SIZE; i++) {
      if (mem[PLOTSSCREEN_ADDR + i] !== plotBefore[i]) {
        firstNonZero = i;
        break;
      }
    }
    if (firstNonZero >= 0) {
      console.log(`    First changed plotSScreen byte at offset ${firstNonZero}: ${hex(plotBefore[firstNonZero], 2)} -> ${hex(mem[PLOTSSCREEN_ADDR + firstNonZero], 2)}`);
    } else {
      console.log('    No plotSScreen bytes changed');
    }
  }

  // Check specific plotSScreen offset from trace
  const expectedOffset = 0x1B8E; // HL value from trace
  console.log(`    plotSScreen[0x${expectedOffset.toString(16)}] = ${hex(mem[PLOTSSCREEN_ADDR + expectedOffset], 2)} (this is where trace showed HL pointing)`);

  return { returnHit, stepCount, changedPixels, finalPc, mbaseLog, pcOrder, missingBlockPcs };
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 129: Graph Subsystem Re-Investigation — IPoint Direct Call ===');
  console.log('');

  // ── Task 0: Disassemble IPoint region ──

  console.log('--- Task 0: IPoint disassembly (0x07B451 - 0x07B500) ---');
  const disasm1 = disassembleRange(0x07B451, 0x07B500);
  for (const line of disasm1) console.log(line);
  console.log('');

  console.log('--- IPoint continuation (0x07B500 - 0x07B530) ---');
  const disasm1b = disassembleRange(0x07B500, 0x07B530);
  for (const line of disasm1b) console.log(line);
  console.log('');

  console.log('--- Bounds-check region disassembly (0x07B780 - 0x07B820) ---');
  const disasm2 = disassembleRange(0x07B780, 0x07B820);
  for (const line of disasm2) console.log(line);
  console.log('');

  console.log('--- IPoint post-bounds (0x07B500 - 0x07B6D0) ---');
  const disasm3 = disassembleRange(0x07B500, 0x07B6D0);
  for (const line of disasm3) console.log(line);
  console.log('');

  // ── Setup runtime ──

  const { mem, executor, cpu, wrap } = createRuntime();
  console.log('Cold-booting OS...');
  coldBoot(executor, cpu, mem);
  console.log('Cold boot complete.');
  console.log('');

  // ── Task 1: Dump RAM state BEFORE seeding ──

  console.log('--- Task 1: RAM state before seeding ---');
  console.log(`  pixWide_m_2 @ ${hex(PIX_WIDE_M2_ADDR)}: ${hexBytes(mem, PIX_WIDE_M2_ADDR, 2)} (${read16(mem, PIX_WIDE_M2_ADDR)})`);
  console.log(`  pixWide_m_1 @ ${hex(PIX_WIDE_M1_ADDR)}: ${hexBytes(mem, PIX_WIDE_M1_ADDR, 2)} (${read16(mem, PIX_WIDE_M1_ADDR)})`);
  console.log(`  pixWideP @ ${hex(PIX_WIDE_P_ADDR)}: ${hexBytes(mem, PIX_WIDE_P_ADDR, 2)} (${read16(mem, PIX_WIDE_P_ADDR)})`);
  console.log(`  lcdTallP @ ${hex(LCD_TALL_P_ADDR)}: ${hex(mem[LCD_TALL_P_ADDR], 2)} (${mem[LCD_TALL_P_ADDR]})`);
  console.log(`  XOffset @ ${hex(XOFFSET_ADDR)}: ${hexBytes(mem, XOFFSET_ADDR, 2)} (${read16(mem, XOFFSET_ADDR)})`);
  console.log(`  YOffset @ ${hex(YOFFSET_ADDR)}: ${hexBytes(mem, YOFFSET_ADDR, 2)} (${read16(mem, YOFFSET_ADDR)})`);
  console.log(`  drawColorCode @ ${hex(DRAW_COLOR_CODE_ADDR)}: ${hexBytes(mem, DRAW_COLOR_CODE_ADDR, 2)}`);
  console.log(`  drawFGColor @ ${hex(DRAW_FG_COLOR_ADDR)}: ${hexBytes(mem, DRAW_FG_COLOR_ADDR, 2)}`);
  console.log(`  drawBGColor @ ${hex(DRAW_BG_COLOR_ADDR)}: ${hexBytes(mem, DRAW_BG_COLOR_ADDR, 2)}`);
  console.log(`  drawMode @ ${hex(DRAW_MODE_ADDR)}: ${hex(mem[DRAW_MODE_ADDR], 2)}`);
  console.log(`  modeByte @ ${hex(MODE_BYTE_ADDR)}: ${hex(mem[MODE_BYTE_ADDR], 2)}`);
  console.log(`  graphMode @ ${hex(GRAPH_MODE_ADDR)}: ${hex(mem[GRAPH_MODE_ADDR], 2)}`);
  console.log(`  graphFlags @ ${hex(GRAPH_FLAGS_ADDR)}: ${hex(mem[GRAPH_FLAGS_ADDR], 2)} (graphDraw bit0=${mem[GRAPH_FLAGS_ADDR] & 1})`);
  console.log(`  hookflags3 @ ${hex(HOOKFLAGS3_ADDR)}: ${hex(mem[HOOKFLAGS3_ADDR], 2)} (bit7=${(mem[HOOKFLAGS3_ADDR] >> 7) & 1})`);
  console.log(`  grfModeFlags @ 0xD00082: ${hex(mem[0xD00082], 2)} (grfFuncM bit4=${(mem[0xD00082] >> 4) & 1})`);
  console.log(`  saveBC @ ${hex(SAVE_BC_ADDR)}: ${hexBytes(mem, SAVE_BC_ADDR, 3)}`);
  console.log(`  saveDE @ ${hex(SAVE_DE_ADDR)}: ${hexBytes(mem, SAVE_DE_ADDR, 3)}`);

  // Xmin/Xmax/Ymin/Ymax
  console.log(`  Xmin @ ${hex(XMIN_ADDR)}: [${hexBytes(mem, XMIN_ADDR, 9)}] = ${safeReadReal(wrap, XMIN_ADDR)}`);
  console.log(`  Xmax @ ${hex(XMAX_ADDR)}: [${hexBytes(mem, XMAX_ADDR, 9)}] = ${safeReadReal(wrap, XMAX_ADDR)}`);
  console.log(`  Ymin @ ${hex(YMIN_ADDR)}: [${hexBytes(mem, YMIN_ADDR, 9)}] = ${safeReadReal(wrap, YMIN_ADDR)}`);
  console.log(`  Ymax @ ${hex(YMAX_ADDR)}: [${hexBytes(mem, YMAX_ADDR, 9)}] = ${safeReadReal(wrap, YMAX_ADDR)}`);

  // plotSScreen state
  let nonZeroPlot = 0;
  for (let i = 0; i < PLOTSSCREEN_SIZE; i++) {
    if (mem[PLOTSSCREEN_ADDR + i] !== 0) nonZeroPlot++;
  }
  console.log(`  plotSScreen non-zero bytes: ${nonZeroPlot} / ${PLOTSSCREEN_SIZE}`);
  console.log('');

  // ── Scenario B: IPoint WITHOUT seeding graph RAM ──

  // Save mem snapshot for scenario B (run it first to see unseeded behavior)
  const memSnapshotB = new Uint8Array(MEM_SIZE);
  memSnapshotB.set(mem);

  console.log('=== Scenario B: IPoint WITHOUT graph RAM seeding ===');
  console.log('  (Run first so we see default post-coldboot behavior)');
  const resultB = runIPoint(
    'Scenario B (unseeded)',
    mem, executor, cpu,
    160, 120, 0  // center pixel, draw mode = point
  );

  // Restore mem for Scenario A
  mem.set(memSnapshotB);
  console.log('');

  // ── Seed graph RAM ──

  console.log('--- Seeding graph RAM for Scenario A ---');
  seedGraphWindow(mem);
  seedPixelDimensions(mem);
  seedDrawState(mem);

  // Verify seeding
  console.log(`  Xmin = ${safeReadReal(wrap, XMIN_ADDR)}`);
  console.log(`  Xmax = ${safeReadReal(wrap, XMAX_ADDR)}`);
  console.log(`  Ymin = ${safeReadReal(wrap, YMIN_ADDR)}`);
  console.log(`  Ymax = ${safeReadReal(wrap, YMAX_ADDR)}`);
  console.log(`  pixWide_m_2 = ${read16(mem, PIX_WIDE_M2_ADDR)}`);
  console.log(`  pixWide_m_1 = ${read16(mem, PIX_WIDE_M1_ADDR)}`);
  console.log(`  pixWideP = ${read16(mem, PIX_WIDE_P_ADDR)}`);
  console.log(`  lcdTallP = ${mem[LCD_TALL_P_ADDR]}`);
  console.log(`  drawColorCode = ${hexBytes(mem, DRAW_COLOR_CODE_ADDR, 2)}`);
  console.log(`  hookflags3 bit7 = ${(mem[HOOKFLAGS3_ADDR] >> 7) & 1}`);
  console.log('');

  // ── Scenario A: IPoint WITH fully seeded RAM ──

  console.log('=== Scenario A: IPoint WITH fully seeded graph RAM ===');
  const resultA = runIPoint(
    'Scenario A (seeded)',
    mem, executor, cpu,
    160, 120, 0  // center pixel, draw mode = point
  );
  console.log('');

  // ── Scenario C: IPoint with small coordinates to pass bounds check ──

  console.log('=== Scenario C: IPoint with small coordinates (X=10, Y=10, drawMode=0) ===');
  mem.set(memSnapshotB);
  seedGraphWindow(mem);
  seedPixelDimensions(mem);
  seedDrawState(mem);
  const resultC = runIPoint(
    'Scenario C (seeded, small coords, drawMode=0)',
    mem, executor, cpu,
    10, 10, 0  // small pixel coords, drawMode=0 (normal)
  );
  console.log('');

  // ── Scenario D: IPoint with drawMode=1 ──

  console.log('=== Scenario D: IPoint with drawMode=1 (X=10, Y=10) ===');
  mem.set(memSnapshotB);
  seedGraphWindow(mem);
  seedPixelDimensions(mem);
  seedDrawState(mem);
  const resultD = runIPoint(
    'Scenario D (seeded, small coords, drawMode=1)',
    mem, executor, cpu,
    10, 10, 1  // drawMode=1
  );
  console.log('');

  // ── Scenario E: IPoint with drawMode=2 ──

  console.log('=== Scenario E: IPoint with drawMode=2 (X=10, Y=10) ===');
  mem.set(memSnapshotB);
  seedGraphWindow(mem);
  seedPixelDimensions(mem);
  seedDrawState(mem);
  const resultE = runIPoint(
    'Scenario E (seeded, small coords, drawMode=2)',
    mem, executor, cpu,
    10, 10, 2  // drawMode=2
  );
  console.log('');

  // ── Task 3: Dump MBASE-composited addresses ──

  console.log('--- Task 3: MBASE-composited address reads ---');
  console.log(`  0xD01501 (pixWide_m_2): ${hexBytes(mem, 0xD01501, 2)} (${read16(mem, 0xD01501)})`);
  console.log(`  0xD022D1 (saveBC): ${hexBytes(mem, 0xD022D1, 3)}`);
  console.log(`  0xD022D2 (saveDE): ${hexBytes(mem, 0xD022D2, 3)}`);
  console.log(`  0xD02AC8 (drawMode): ${hex(mem[0xD02AC8], 2)}`);
  console.log(`  0xD02AD4 (modeByte): ${hex(mem[0xD02AD4], 2)}`);
  console.log(`  0xD026AE (drawColorCode): ${hexBytes(mem, 0xD026AE, 2)}`);
  console.log('');

  // ── Task 4: Compare scenarios ──

  console.log('=== Comparison ===');
  console.log(`  Scenario B (unseeded, 160,120, dm=0): returnHit=${resultB.returnHit}, steps=${resultB.stepCount}, pixelsChanged=${resultB.changedPixels}, finalPC=${hex(resultB.finalPc)}`);
  console.log(`  Scenario A (seeded, 160,120, dm=0):   returnHit=${resultA.returnHit}, steps=${resultA.stepCount}, pixelsChanged=${resultA.changedPixels}, finalPC=${hex(resultA.finalPc)}`);
  console.log(`  Scenario C (seeded, 10,10, dm=0):     returnHit=${resultC.returnHit}, steps=${resultC.stepCount}, pixelsChanged=${resultC.changedPixels}, finalPC=${hex(resultC.finalPc)}`);
  console.log(`  Scenario D (seeded, 10,10, dm=1):     returnHit=${resultD.returnHit}, steps=${resultD.stepCount}, pixelsChanged=${resultD.changedPixels}, finalPC=${hex(resultD.finalPc)}`);
  console.log(`  Scenario E (seeded, 10,10, dm=2):     returnHit=${resultE.returnHit}, steps=${resultE.stepCount}, pixelsChanged=${resultE.changedPixels}, finalPC=${hex(resultE.finalPc)}`);
  console.log('');

  // ── Summary ──

  console.log('=== Summary ===');
  for (const [label, result] of [['A (seeded, 160,120, dm=0)', resultA], ['B (unseeded, 160,120, dm=0)', resultB], ['C (seeded, 10,10, dm=0)', resultC], ['D (seeded, 10,10, dm=1)', resultD], ['E (seeded, 10,10, dm=2)', resultE]]) {
    const boundsHit = result.mbaseLog.find(e => e.pc === BOUNDS_CHECK_ADDR);
    console.log(`  Scenario ${label}:`);
    console.log(`    Bounds-check reached: ${boundsHit ? 'YES, MBASE=' + hex(boundsHit.mbase, 2) : 'NO'}`);
    console.log(`    Pixels changed: ${result.changedPixels}`);
    console.log(`    Return: ${result.returnHit ? 'normal' : 'stalled at ' + hex(result.finalPc)}`);
    if (result.missingBlockPcs.size > 0) {
      console.log(`    Missing blocks: ${[...result.missingBlockPcs].filter(p => p !== FAKE_RET).sort((a, b) => a - b).map(hex).join(', ') || 'none (only FAKE_RET)'}`);
    }
  }
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
