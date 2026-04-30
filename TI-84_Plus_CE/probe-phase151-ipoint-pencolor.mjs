#!/usr/bin/env node

/**
 * Phase 151 — IPoint pen color investigation
 *
 * Session 150 confirmed IPoint writes VRAM but A=0x00 at the pixel store
 * instruction (LD (BC),A at 0x07B682). Pen color at 0xD026AE is 0x10.
 *
 * This probe:
 *   Part A: Trace A register at every block through IPoint (0x07B451-0x07B700+)
 *   Part B: Identify where pen color is/isn't loaded into A
 *   Part C: Test 16bpp pen color seeding (2-byte values, various color patterns)
 *   Part D: Audit session 129's probe — did it check LCD VRAM or plotSScreen?
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { writeReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

// ── Constants ─────────────────────────────────────────────────────────────

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_ENTRY = 0x09dee0;
const MEMINIT_RET = 0x7ffff6;
const IPOINT_RET = 0x7ffff2;
const IPOINT_ENTRY = 0x07b451;
const PIXEL_STORE_PC = 0x07b682;
const PIXEL_STORE2_PC = 0x07b68a;

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

const XMIN_ADDR = 0xd01e33;
const XMAX_ADDR = 0xd01e3c;
const XSCL_ADDR = 0xd01e45;
const YMIN_ADDR = 0xd01e4e;
const YMAX_ADDR = 0xd01e57;
const YSCL_ADDR = 0xd01e60;

const XOFFSET_ADDR = 0xd014fa;
const YOFFSET_ADDR = 0xd014fc;
const LCD_TALL_P_ADDR = 0xd014fd;
const PIX_WIDE_P_ADDR = 0xd014fe;
const PIX_WIDE_M2_ADDR = 0xd01501;

const DRAW_BG_COLOR_ADDR = 0xd026aa;
const DRAW_FG_COLOR_ADDR = 0xd026ac;
const DRAW_COLOR_CODE_ADDR = 0xd026ae;
const DRAW_MODE_ADDR = 0xd02ac8;
const PEN_COLOR_SAVE_ADDR = 0xd02a60;

const GRAPH_MODE_ADDR = 0xd01474;
const GRAPH_FLAGS_ADDR = 0xd00083;
const HOOKFLAGS3_ADDR = 0xd000b5;

const IY_PLUS_02_ADDR = 0xd00082;
const IY_PLUS_14_ADDR = 0xd00094;
const IY_PLUS_2B_ADDR = 0xd000ab;
const IY_PLUS_3C_ADDR = 0xd000bc;
const IY_PLUS_4A_ADDR = 0xd000ca;

const LCD_VRAM_ADDR = 0xd40000;
const LCD_VRAM_SIZE = 153600;

const DEFAULT_IY = 0xd00080;
const DEFAULT_IX = 0xd1a860;
const MEMINIT_BUDGET = 100000;
const IPOINT_BUDGET = 500;
const MAX_LOOP_ITER = 8192;

const SENTINEL = 0xaa;

// ── Utilities ─────────────────────────────────────────────────────────────

const hex = (v, w = 6) =>
  v === undefined || v === null
    ? 'n/a'
    : `0x${(Number(v) >>> 0).toString(16).toUpperCase().padStart(w, '0')}`;

const write16 = (m, a, v) => {
  m[a] = v & 0xff;
  m[a + 1] = (v >>> 8) & 0xff;
};

const write24 = (m, a, v) => {
  m[a] = v & 0xff;
  m[a + 1] = (v >>> 8) & 0xff;
  m[a + 2] = (v >>> 16) & 0xff;
};

const read16 = (m, a) =>
  ((m[a] & 0xff) | ((m[a + 1] & 0xff) << 8)) >>> 0;

const read24 = (m, a) =>
  ((m[a] & 0xff) | ((m[a + 1] & 0xff) << 8) | ((m[a + 2] & 0xff) << 16)) >>> 0;

function hexBytes(m, a, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push((m[a + i] & 0xff).toString(16).toUpperCase().padStart(2, '0'));
  return out.join(' ');
}

const memWrap = (m) => ({
  write8(a, v) { m[a] = v & 0xff; },
  read8(a) { return m[a] & 0xff; },
});

// ── Runtime setup ─────────────────────────────────────────────────────────

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
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xd0;
  cpu._iy = DEFAULT_IY;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
}

function prepareCallState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xd0;
  cpu._iy = DEFAULT_IY;
  cpu.f = 0x40;
  cpu._ix = DEFAULT_IX;
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

function runMeminit(executor, cpu, mem) {
  prepareCallState(cpu, mem);
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  cpu._iy = DEFAULT_IY;
  cpu.mbase = 0xd0;

  let returnHit = false;
  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: MEMINIT_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        if ((pc & 0xffffff) === MEMINIT_RET) {
          returnHit = true;
          throw new Error('__RET__');
        }
      },
      onMissingBlock(pc) {
        if ((pc & 0xffffff) === MEMINIT_RET) {
          returnHit = true;
          throw new Error('__RET__');
        }
      },
    });
  } catch (e) {
    if (e?.message !== '__RET__') throw e;
  }
  return returnHit;
}

// ── Seed helpers ──────────────────────────────────────────────────────────

function seedPhase129Style(mem) {
  const w = memWrap(mem);
  writeReal(w, XMIN_ADDR, -10);
  writeReal(w, XMAX_ADDR, 10);
  writeReal(w, XSCL_ADDR, 1);
  writeReal(w, YMIN_ADDR, -10);
  writeReal(w, YMAX_ADDR, 10);
  writeReal(w, YSCL_ADDR, 1);

  write16(mem, XOFFSET_ADDR, 0);
  write16(mem, YOFFSET_ADDR, 0);
  mem[LCD_TALL_P_ADDR] = 240;
  write16(mem, PIX_WIDE_P_ADDR, 320);
  write16(mem, PIX_WIDE_M2_ADDR, 240);

  write16(mem, DRAW_FG_COLOR_ADDR, 0x001f);
  write16(mem, DRAW_COLOR_CODE_ADDR, 0x001f);
  write16(mem, DRAW_BG_COLOR_ADDR, 0xffff);
  mem[0xd02a60] = 0x1f;

  mem[GRAPH_MODE_ADDR] = 0x10;
  mem[GRAPH_FLAGS_ADDR] |= 0x01;
  mem[HOOKFLAGS3_ADDR] &= ~0x80;
  mem[IY_PLUS_02_ADDR] |= (1 << 4);
}

function seedPhase150Style(mem) {
  write16(mem, PIX_WIDE_P_ADDR, 320);
  write24(mem, PIX_WIDE_M2_ADDR, 238);
  mem[HOOKFLAGS3_ADDR] &= ~0x80;
  mem[IY_PLUS_14_ADDR] &= ~0x20;
  // IY+2B bit 2 SET (required for IPoint to work)
  mem[IY_PLUS_2B_ADDR] |= (1 << 2);
}

function sentinelFillVRAM(mem) {
  mem.fill(SENTINEL, LCD_VRAM_ADDR, LCD_VRAM_ADDR + LCD_VRAM_SIZE);
}

// ── IPoint runner with A-register tracing ─────────────────────────────────

function runIPointWithATrace(label, mem, executor, cpu, penColorSetup) {
  console.log(`\n--- ${label} ---`);

  // Apply pen color setup
  penColorSetup(mem);

  // Log pen color state before IPoint
  console.log(`  Pen color state before IPoint:`);
  console.log(`    drawColorCode @ ${hex(DRAW_COLOR_CODE_ADDR)}: ${hexBytes(mem, DRAW_COLOR_CODE_ADDR, 2)} (${hex(read16(mem, DRAW_COLOR_CODE_ADDR), 4)})`);
  console.log(`    drawFGColor   @ ${hex(DRAW_FG_COLOR_ADDR)}: ${hexBytes(mem, DRAW_FG_COLOR_ADDR, 2)} (${hex(read16(mem, DRAW_FG_COLOR_ADDR), 4)})`);
  console.log(`    drawBGColor   @ ${hex(DRAW_BG_COLOR_ADDR)}: ${hexBytes(mem, DRAW_BG_COLOR_ADDR, 2)} (${hex(read16(mem, DRAW_BG_COLOR_ADDR), 4)})`);
  console.log(`    penColorSave  @ ${hex(PEN_COLOR_SAVE_ADDR)}: ${hex(mem[PEN_COLOR_SAVE_ADDR], 2)}`);

  // Sentinel fill VRAM to detect writes
  sentinelFillVRAM(mem);

  // Prepare call state
  prepareCallState(cpu, mem);
  seedAllocator(mem);

  // Registers: A=1 (drawMode=1 = normal draw), C=120 (Y), DE=160 (X)
  cpu.a = 1;
  cpu._bc = 0x000078; // C=120
  cpu._de = 0x0000a0; // DE=160
  cpu._hl = 0;

  // Push return address
  cpu.sp -= 3;
  write24(mem, cpu.sp, IPOINT_RET);

  // A-register trace: log A at every block in the IPoint range
  const aTrace = [];
  let returnHit = false;
  let steps = 0;
  let lastPc = IPOINT_ENTRY;
  const missingBlocks = new Set();

  // Also track reads from pen color address
  const penColorReads = [];

  try {
    executor.runFrom(IPOINT_ENTRY, 'adl', {
      maxSteps: IPOINT_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        steps++;
        const norm = pc & 0xffffff;
        lastPc = norm;

        // Log A register and key state at every block in IPoint range
        if (norm >= 0x07b400 && norm <= 0x07b900) {
          aTrace.push({
            step: steps,
            pc: norm,
            a: cpu.a & 0xff,
            f: cpu.f & 0xff,
            bc: cpu._bc & 0xffffff,
            de: cpu._de & 0xffffff,
            hl: cpu._hl & 0xffffff,
          });
        }

        // Check if pen color RAM was read (snapshot the value)
        if (norm === 0x07b504 || norm === 0x07b510 || norm === 0x07b513 ||
            norm === 0x07b51a || norm === 0x07b520 || norm === 0x07b530 ||
            norm === 0x07b540 || norm === 0x07b550 || norm === 0x07b560 ||
            norm === 0x07b580 || norm === 0x07b5a0 || norm === 0x07b5c0 ||
            norm === 0x07b600 || norm === 0x07b620 || norm === 0x07b62b ||
            norm === 0x07b640 || norm === 0x07b660 || norm === 0x07b670 ||
            norm === 0x07b680 || norm === PIXEL_STORE_PC) {
          penColorReads.push({
            step: steps,
            pc: norm,
            a: cpu.a & 0xff,
            colorCodeRAM: read16(mem, DRAW_COLOR_CODE_ADDR),
            penSaveRAM: mem[PEN_COLOR_SAVE_ADDR],
          });
        }

        if (norm === IPOINT_RET) {
          returnHit = true;
          throw new Error('__RET__');
        }
      },
      onMissingBlock(pc) {
        steps++;
        const norm = pc & 0xffffff;
        lastPc = norm;
        missingBlocks.add(norm);
        if (norm === IPOINT_RET) {
          returnHit = true;
          throw new Error('__RET__');
        }
      },
    });
  } catch (e) {
    if (e?.message !== '__RET__') throw e;
  }

  // Report
  console.log(`  Result: returned=${returnHit} steps=${steps} lastPC=${hex(lastPc)}`);
  if (missingBlocks.size > 0) {
    console.log(`  Missing blocks: ${[...missingBlocks].sort((a, b) => a - b).map(p => hex(p)).join(', ')}`);
  }

  // A-register trace through IPoint
  console.log(`  A-register trace (${aTrace.length} IPoint blocks):`);
  for (const entry of aTrace) {
    const marker =
      entry.pc === IPOINT_ENTRY ? ' <-- ENTRY' :
      entry.pc === PIXEL_STORE_PC ? ' <-- PIXEL STORE LD (BC),A' :
      entry.pc === PIXEL_STORE2_PC ? ' <-- PIXEL STORE 2' :
      entry.pc === 0x07b504 ? ' <-- main path start' :
      entry.pc === 0x07b793 ? ' <-- bounds check' :
      entry.pc === 0x07b580 ? ' <-- VRAM addr computation' :
      '';
    console.log(`    step=${entry.step} PC=${hex(entry.pc)} A=${hex(entry.a, 2)} F=${hex(entry.f, 2)} BC=${hex(entry.bc)} DE=${hex(entry.de)} HL=${hex(entry.hl)}${marker}`);
  }

  // Pen color read checkpoints
  if (penColorReads.length > 0) {
    console.log(`  Pen color checkpoints:`);
    for (const r of penColorReads) {
      console.log(`    step=${r.step} PC=${hex(r.pc)} A=${hex(r.a, 2)} colorCode=${hex(r.colorCodeRAM, 4)} penSave=${hex(r.penSaveRAM, 2)}`);
    }
  }

  // Check VRAM for sentinel changes
  let vramChanged = 0;
  const vramChanges = [];
  for (let i = 0; i < LCD_VRAM_SIZE; i++) {
    if (mem[LCD_VRAM_ADDR + i] !== SENTINEL) {
      vramChanged++;
      if (vramChanges.length < 8) {
        vramChanges.push({
          addr: LCD_VRAM_ADDR + i,
          value: mem[LCD_VRAM_ADDR + i],
        });
      }
    }
  }
  console.log(`  VRAM changed bytes (vs sentinel 0xAA): ${vramChanged}`);
  if (vramChanges.length > 0) {
    console.log(`  First VRAM changes:`);
    for (const c of vramChanges) {
      console.log(`    ${hex(c.addr)}: ${hex(c.value, 2)}`);
    }
  }

  // Check drawMode and pen color after
  console.log(`  After IPoint:`);
  console.log(`    drawMode @ ${hex(DRAW_MODE_ADDR)}: ${hex(mem[DRAW_MODE_ADDR], 2)}`);
  console.log(`    drawColorCode @ ${hex(DRAW_COLOR_CODE_ADDR)}: ${hexBytes(mem, DRAW_COLOR_CODE_ADDR, 2)}`);
  console.log(`    penColorSave  @ ${hex(PEN_COLOR_SAVE_ADDR)}: ${hex(mem[PEN_COLOR_SAVE_ADDR], 2)}`);
  console.log(`    VRAM ptr @ 0xD02A8A: ${hex(read24(mem, 0xd02a8a))}`);

  return { returnHit, steps, lastPc, vramChanged, vramChanges, aTrace };
}

// ── Main ──────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 151: IPoint Pen Color Investigation ===');
  console.log('');

  // ── Part D: Audit session 129 probe ──────────────────────────────────

  console.log('=== Part D: Session 129 probe audit ===');
  console.log('Reviewing probe-phase129-graph-render.mjs for what it actually checks:');
  console.log('');
  console.log('  Buffer checked for pixel writes: plotSScreen (0xD09466, 21945 bytes)');
  console.log('  Detection method: byte-by-byte comparison of plotSScreen before/after IPoint');
  console.log('  LCD VRAM (0xD40000-0xD65800) was NOT checked by session 129');
  console.log('  Session 129 pen color seed: drawColorCode=0x001F, drawFGColor=0x001F (both 2 bytes)');
  console.log('  Session 129 also seeded penColorSave @ 0xD02A60 = 0x1F');
  console.log('  Session 129 used drawMode=1 with X=10, Y=10 (scenario D)');
  console.log('');
  console.log('  CONCLUSION: Session 129 checked plotSScreen (monochrome/8bpp buffer),');
  console.log('  NOT LCD VRAM (16bpp). Its "pen color works" claim was about plotSScreen,');
  console.log('  which uses a different write path (Z path at 0x07B6A6) than LCD VRAM');
  console.log('  (NZ path). The Z path does SLA A x4 to shift pen color to high nibble,');
  console.log('  then OR with existing byte. The NZ path (16bpp) uses LD (BC),A directly.');
  console.log('  Session 129 used IY+02 bit4=1 but NOT IY+2B bit2=1, so it may have');
  console.log('  taken the Z path (plotSScreen write) not the NZ path (LCD VRAM write).');
  console.log('');

  // ── Create runtime ───────────────────────────────────────────────────

  const { mem, executor, cpu } = createRuntime();
  console.log('Cold-booting OS...');
  coldBoot(executor, cpu, mem);
  console.log('Cold boot complete.');

  // Run MEM_INIT
  const memInitOk = runMeminit(executor, cpu, mem);
  console.log(`MEM_INIT: returned=${memInitOk}`);
  console.log('');

  // Save post-init state for reuse
  const postInitSnapshot = new Uint8Array(MEM_SIZE);
  postInitSnapshot.set(mem);

  // ── Part A: A-register trace with phase-150 pen color ────────────────

  console.log('=== Part A: A-register trace through IPoint (phase-150 style, penColor=0x0010) ===');

  const resultA = runIPointWithATrace(
    'Part A: penColor=0x0010 (single byte 0x10)',
    mem, executor, cpu,
    (m) => {
      seedPhase150Style(m);
      m[DRAW_COLOR_CODE_ADDR] = 0x10;
      m[DRAW_COLOR_CODE_ADDR + 1] = 0x00;
    }
  );

  // ── Part B: Identify pen color load ──────────────────────────────────

  console.log('');
  console.log('=== Part B: Pen color analysis ===');

  // Check if any A-trace entry shows A changing to pen color value
  const penColorValue = 0x10;
  const aAtPixelStore = resultA.aTrace.find(e => e.pc === PIXEL_STORE_PC);
  console.log(`  A at pixel store (${hex(PIXEL_STORE_PC)}): ${aAtPixelStore ? hex(aAtPixelStore.a, 2) : 'NOT REACHED'}`);

  // Find where A transitions
  console.log('  A-register transitions:');
  let prevA = -1;
  for (const entry of resultA.aTrace) {
    if (entry.a !== prevA) {
      console.log(`    A changed to ${hex(entry.a, 2)} at step=${entry.step} PC=${hex(entry.pc)}`);
      prevA = entry.a;
    }
  }

  // Scan ROM bytes around the pen color load address
  // Session 128 said pen color is loaded at 0x07B504 area — look for LD A,(nn) with nn=0xD026AE
  console.log('');
  console.log('  Scanning ROM for LD A,(0xD026AE) pattern near IPoint:');
  // LD A,(nn) in ADL mode = ED 3B nn nn nn  (but eZ80 uses 0x3A for LD A,(nn))
  // Actually in eZ80: LD A,(nn) = 3A nn nn nn (ADL) or 3A nn nn (Z80)
  // Let's search for bytes AE 26 D0 (little-endian 0xD026AE) in IPoint range
  for (let pc = 0x07b400; pc < 0x07b900; pc++) {
    if (romBytes[pc] === 0xae && romBytes[pc + 1] === 0x26 &&
        romBytes[pc + 2] === 0xd0) {
      // Check if preceded by LD A,(nn) opcode
      const prevByte = romBytes[pc - 1];
      console.log(`    Found 0xD026AE reference at ${hex(pc)}, preceding byte: ${hex(prevByte, 2)} (3A=LD A,(nn))`);
    }
    // Also check for 2-byte address (MBASE-composed)
    if (romBytes[pc] === 0xae && romBytes[pc + 1] === 0x26) {
      const prevByte = romBytes[pc - 1];
      if (prevByte === 0x3a) {
        console.log(`    Found possible LD A,(0x26AE) at ${hex(pc - 1)} (MBASE-composed with 0xD0 = 0xD026AE)`);
      }
    }
  }

  // Also look for LD A,(IY+nn) or other indirect loads
  console.log('');
  console.log('  Scanning ROM for 0x2A60 (penColorSave) references near IPoint:');
  for (let pc = 0x07b400; pc < 0x07b900; pc++) {
    if (romBytes[pc] === 0x60 && romBytes[pc + 1] === 0x2a) {
      const prevByte = romBytes[pc - 1];
      console.log(`    Found 0x2A60 at ${hex(pc)}, preceding byte: ${hex(prevByte, 2)}`);
    }
  }

  // ── Part C: Test different pen color seedings ────────────────────────

  console.log('');
  console.log('=== Part C: 16bpp pen color seeding tests ===');

  const colorTests = [
    {
      label: 'C1: Session-129 style (0x001F blue, 2 bytes at colorCode + FG + save)',
      setup: (m) => {
        seedPhase129Style(m);
        // Also set IY+2B bit 2 for NZ path (LCD VRAM)
        m[IY_PLUS_2B_ADDR] |= (1 << 2);
      },
    },
    {
      label: 'C2: 16bpp blue 0x001F at colorCode only',
      setup: (m) => {
        seedPhase150Style(m);
        write16(m, DRAW_COLOR_CODE_ADDR, 0x001f);
      },
    },
    {
      label: 'C3: 16bpp red 0xF800 at colorCode',
      setup: (m) => {
        seedPhase150Style(m);
        write16(m, DRAW_COLOR_CODE_ADDR, 0xf800);
      },
    },
    {
      label: 'C4: 16bpp green 0x07E0 at colorCode',
      setup: (m) => {
        seedPhase150Style(m);
        write16(m, DRAW_COLOR_CODE_ADDR, 0x07e0);
      },
    },
    {
      label: 'C5: 0xFF at colorCode byte + penSave + FG',
      setup: (m) => {
        seedPhase150Style(m);
        m[DRAW_COLOR_CODE_ADDR] = 0xff;
        m[DRAW_COLOR_CODE_ADDR + 1] = 0xff;
        m[DRAW_FG_COLOR_ADDR] = 0xff;
        m[DRAW_FG_COLOR_ADDR + 1] = 0xff;
        m[PEN_COLOR_SAVE_ADDR] = 0xff;
      },
    },
    {
      label: 'C6: Session-129 exact (no IY+2B bit2, Z path = plotSScreen)',
      setup: (m) => {
        seedPhase129Style(m);
        // Do NOT set IY+2B bit 2 — use Z path like session 129
        m[IY_PLUS_2B_ADDR] &= ~(1 << 2);
      },
    },
  ];

  const colorResults = [];

  for (const test of colorTests) {
    // Restore post-init state
    mem.set(postInitSnapshot);
    seedAllocator(mem);

    const result = runIPointWithATrace(
      test.label,
      mem, executor, cpu,
      test.setup
    );
    colorResults.push({ label: test.label, result });
  }

  // ── Summary ──────────────────────────────────────────────────────────

  console.log('');
  console.log('=== Summary ===');
  console.log('');

  console.log('Part D (session 129 audit):');
  console.log('  Session 129 checked plotSScreen (0xD09466), NOT LCD VRAM (0xD40000).');
  console.log('  Its "pen color works" claim applies to the Z path (plotSScreen write),');
  console.log('  not the NZ path (16bpp LCD VRAM write at LD (BC),A).');
  console.log('');

  console.log('Part A (A-register trace):');
  const pixelStoreA = resultA.aTrace.find(e => e.pc === PIXEL_STORE_PC);
  console.log(`  A at pixel store: ${pixelStoreA ? hex(pixelStoreA.a, 2) : 'NOT REACHED'}`);
  console.log(`  Pen color in RAM: ${hex(read16(postInitSnapshot, DRAW_COLOR_CODE_ADDR), 4)} (before), was seeded to 0x0010`);
  console.log('');

  console.log('Part C (color seeding comparison):');
  for (const { label, result } of colorResults) {
    const pixA = result.aTrace.find(e => e.pc === PIXEL_STORE_PC);
    const pixA2 = result.aTrace.find(e => e.pc === PIXEL_STORE2_PC);
    console.log(`  ${label}:`);
    console.log(`    A at 0x07B682: ${pixA ? hex(pixA.a, 2) : 'NOT REACHED'}`);
    console.log(`    A at 0x07B68A: ${pixA2 ? hex(pixA2.a, 2) : 'NOT REACHED'}`);
    console.log(`    VRAM changed: ${result.vramChanged}`);
    if (result.vramChanges.length > 0) {
      const vals = result.vramChanges.map(c => hex(c.value, 2)).join(', ');
      console.log(`    VRAM values written: ${vals}`);
    }
  }
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
