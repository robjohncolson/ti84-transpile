#!/usr/bin/env node

/**
 * Phase 144 — Trace IPoint's NZ path (BIT 2 of IY+43 set) vs Z path.
 *
 * IPoint returns successfully 160 times on the NZ path but writes ZERO pixels.
 * This probe:
 *   1. Disassembles ROM bytes from IPoint entry (0x07B451 - 0x07B850)
 *   2. Step-traces a SINGLE IPoint call on the NZ path (BIT 2 set, X=160, Y=60)
 *   3. Step-traces a SINGLE IPoint call on the Z path (BIT 2 clear, X=50, Y=60)
 *   4. Compares the two traces to find where the NZ path diverges
 *   5. Identifies missing seeds for the NZ path to write pixels
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
const IPOINT_RET = 0x7FFFF2;
const MEMINIT_RET = 0x7FFFF6;

// Entry points
const MEMINIT_ENTRY = 0x09DEE0;
const IPOINT_ENTRY = 0x07B451;

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
const DRAW_MODE_ADDR = 0xD02AC8;

// IY+43 address (IY=0xD00080, offset 0x2B)
const IY_PLUS_43_ADDR = 0xD000AB;

// plotSScreen
const PLOTSSCREEN_ADDR = 0xD09466;
const PLOTSSCREEN_SIZE = 76800;

// LCD VRAM
const LCD_VRAM_ADDR = 0xD40000;
const LCD_VRAM_SIZE = 153600;

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
  write16(mem, DRAW_COLOR_CODE_ADDR, 0x0010);  // visible pen color
  write16(mem, DRAW_FG_COLOR_ADDR, 0x0010);
  write16(mem, DRAW_BG_COLOR_ADDR, 0xFFFF);
  mem[HOOKFLAGS3_ADDR] &= ~0x80;
  mem[MODE_BYTE_ADDR] = 1;
  mem[0xD00082] |= (1 << 4); // grfFuncM bit 4
  mem[DRAW_MODE_ADDR] = 1;   // normal draw mode
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

// ── Disassemble ROM bytes ──────────────────────────────────────────────────

function disassembleROMRange(start, end) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`ROM BYTE DUMP: ${hex(start)} - ${hex(end)} (${end - start} bytes)`);
  console.log(`${'='.repeat(70)}\n`);

  // Dump in rows of 16 bytes with both hex and basic decode
  for (let addr = start; addr < end; addr += 16) {
    const bytes = [];
    const ascii = [];
    for (let i = 0; i < 16 && addr + i < end; i++) {
      const b = romBytes[addr + i];
      bytes.push(b.toString(16).padStart(2, '0'));
      ascii.push(b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.');
    }
    console.log(`  ${hex(addr)}: ${bytes.join(' ').padEnd(48)} ${ascii.join('')}`);
  }
}

// ── IPoint with detailed block-level step trace ───────────────────────────

function callIPointTraced(executor, cpu, mem, px, py, label, bit2Set) {
  prepareCallState(cpu, mem);

  // Set or clear BIT 2 of IY+43
  if (bit2Set) {
    mem[IY_PLUS_43_ADDR] |= 0x04;
  } else {
    mem[IY_PLUS_43_ADDR] &= ~0x04;
  }

  cpu.a = 1;         // drawMode = 1 (normal draw)
  cpu._de = px;      // pixel X in DE
  cpu._hl = py;      // pixel Y in HL
  cpu.sp -= 3;
  write24(mem, cpu.sp, IPOINT_RET);

  const trace = [];
  let returnHit = false;
  let steps = 0;

  try {
    executor.runFrom(IPOINT_ENTRY, 'adl', {
      maxSteps: 500,
      maxLoopIterations: 200,
      onBlock(pc, mode, meta, stepNum) {
        steps++;
        const norm = pc & 0xffffff;

        // Capture register state at each block
        trace.push({
          step: steps,
          pc: norm,
          a: cpu.a,
          f: cpu.f,
          bc: cpu._bc,
          de: cpu._de,
          hl: cpu._hl,
          ix: cpu._ix,
          iy: cpu._iy,
          sp: cpu.sp,
          mode,
          flags: formatFlags(cpu.f),
        });

        if (norm === IPOINT_RET || norm === FAKE_RET) {
          returnHit = true;
          throw new Error('__RET__');
        }
      },
      onMissingBlock(pc, mode, stepNum) {
        steps++;
        const norm = pc & 0xffffff;
        trace.push({
          step: steps,
          pc: norm,
          a: cpu.a,
          f: cpu.f,
          bc: cpu._bc,
          de: cpu._de,
          hl: cpu._hl,
          ix: cpu._ix,
          iy: cpu._iy,
          sp: cpu.sp,
          mode,
          flags: formatFlags(cpu.f),
          missing: true,
        });

        if (norm === IPOINT_RET || norm === FAKE_RET) {
          returnHit = true;
          throw new Error('__RET__');
        }
      },
    });
  } catch (e) {
    if (e?.message !== '__RET__') throw e;
  }

  return { returnHit, steps, trace };
}

function formatFlags(f) {
  const flags = [];
  if (f & 0x80) flags.push('S');
  if (f & 0x40) flags.push('Z');
  if (f & 0x10) flags.push('H');
  if (f & 0x04) flags.push('PV');
  if (f & 0x02) flags.push('N');
  if (f & 0x01) flags.push('C');
  return flags.join('|') || 'none';
}

// ── Snapshot helpers ──────────────────────────────────────────────────────

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

// ── Dump RAM reads during IPoint execution ────────────────────────────────

function dumpKeyRAMState(mem, label) {
  console.log(`  RAM state (${label}):`);
  console.log(`    IY+43 (${hex(IY_PLUS_43_ADDR)}): ${hex(mem[IY_PLUS_43_ADDR], 2)} — BIT 2 = ${(mem[IY_PLUS_43_ADDR] & 0x04) ? 'SET' : 'CLEAR'}`);
  console.log(`    pixWideP (${hex(PIX_WIDE_P_ADDR)}): ${read16(mem, PIX_WIDE_P_ADDR)}`);
  console.log(`    pixWide_m_2 (${hex(PIX_WIDE_M2_ADDR)}): ${read16(mem, PIX_WIDE_M2_ADDR)}`);
  console.log(`    drawMode (${hex(DRAW_MODE_ADDR)}): ${hex(mem[DRAW_MODE_ADDR], 2)}`);
  console.log(`    penColor (${hex(DRAW_COLOR_CODE_ADDR)}): ${hex(read16(mem, DRAW_COLOR_CODE_ADDR), 4)}`);
  console.log(`    fgColor (${hex(DRAW_FG_COLOR_ADDR)}): ${hex(read16(mem, DRAW_FG_COLOR_ADDR), 4)}`);

  // Check some potential framebuffer pointers / LCD control registers
  // Common TI-84 CE LCD addresses
  const lcdAddrs = [
    { name: 'lcdUpbase', addr: 0xE30010 },   // LCD upper panel base
    { name: 'lcdLpbase', addr: 0xE30014 },   // LCD lower panel base
    { name: 'lcdCtrl', addr: 0xE30018 },      // LCD control register
    { name: 'lcdTiming0', addr: 0xE30000 },   // LCD timing
    { name: 'lcdTiming1', addr: 0xE30004 },   // LCD timing
    { name: 'lcdTiming2', addr: 0xE30008 },   // LCD timing
  ];

  // These are MMIO so we read from mem directly (they may be 0 without peripheral setup)
  for (const la of lcdAddrs) {
    if (la.addr < mem.length) {
      const val = read24(mem, la.addr);
      console.log(`    ${la.name} (${hex(la.addr)}): ${hex(val)}`);
    }
  }

  // Check some graph-related RAM addresses that IPoint might read
  const graphAddrs = [
    { name: 'plotSScreenBase?', addr: 0xD02B00 },
    { name: 'graphBufPtr?', addr: 0xD02B03 },
    { name: 'lcdBufPtr?', addr: 0xD024B4 },
    { name: 'unknown_D024B7', addr: 0xD024B7 },
    { name: 'unknown_D024BA', addr: 0xD024BA },
    { name: 'unknown_D024BD', addr: 0xD024BD },
    { name: 'graphFlags', addr: 0xD00083 },
    { name: 'IY+0', addr: 0xD00080 },
    { name: 'IY+1', addr: 0xD00081 },
    { name: 'IY+2', addr: 0xD00082 },
    { name: 'IY+3', addr: 0xD00083 },
    { name: 'drawScrn?', addr: 0xD02604 },
  ];

  for (const ga of graphAddrs) {
    const val = read24(mem, ga.addr);
    console.log(`    ${ga.name} (${hex(ga.addr)}): ${hex(val)}`);
  }
}

// ── Check which block keys exist around IPoint ────────────────────────────

function listBlocksInRange(executor, start, end) {
  const found = [];
  for (const key of Object.keys(executor.compiledBlocks)) {
    const [addrStr, mode] = key.split(':');
    const addr = parseInt(addrStr, 16);
    if (addr >= start && addr < end) {
      found.push({ addr, mode, key });
    }
  }
  found.sort((a, b) => a.addr - b.addr);
  return found;
}

// ── Main ───────────────────────────────────────────────────────────────────

function main() {
  console.log('=== Phase 144: IPoint NZ Path Trace (BIT 2 set vs clear) ===\n');

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
  seedGraphRAM(mem);

  // ══════════════════════════════════════════════════════════════════════
  // 1. DISASSEMBLE IPoint ROM bytes
  // ══════════════════════════════════════════════════════════════════════

  disassembleROMRange(0x07B451, 0x07B550);  // First 256 bytes - the entry

  // Also dump the range around the bounds check at 0x07B7B6
  disassembleROMRange(0x07B780, 0x07B850);

  // ══════════════════════════════════════════════════════════════════════
  // 2. LIST TRANSPILED BLOCKS IN IPOINT RANGE
  // ══════════════════════════════════════════════════════════════════════

  console.log(`\n${'='.repeat(70)}`);
  console.log('TRANSPILED BLOCKS IN IPOINT RANGE (0x07B400 - 0x07B900)');
  console.log(`${'='.repeat(70)}\n`);

  const blocks = listBlocksInRange(executor, 0x07B400, 0x07B900);
  for (const b of blocks) {
    // Get the block meta for exit info
    const meta = executor.blockMeta[b.key];
    const exits = meta?.exits?.map(e => `${hex(e.target)}(${e.type}${e.targetMode ? ':' + e.targetMode : ''})`).join(', ') || 'none';
    console.log(`  ${hex(b.addr)} [${b.mode}] exits: ${exits}`);
  }

  // Also check blocks around 0x04C979 (the 24-bit compare call)
  console.log(`\n  Blocks around 24-bit compare (0x04C970 - 0x04C9B0):`);
  const cmpBlocks = listBlocksInRange(executor, 0x04C970, 0x04C9B0);
  for (const b of cmpBlocks) {
    const meta = executor.blockMeta[b.key];
    const exits = meta?.exits?.map(e => `${hex(e.target)}(${e.type}${e.targetMode ? ':' + e.targetMode : ''})`).join(', ') || 'none';
    console.log(`  ${hex(b.addr)} [${b.mode}] exits: ${exits}`);
  }

  // ══════════════════════════════════════════════════════════════════════
  // 3. TRACE NZ PATH (BIT 2 SET, X=160, Y=60)
  // ══════════════════════════════════════════════════════════════════════

  console.log(`\n${'='.repeat(70)}`);
  console.log('TRACE: NZ PATH (BIT 2 SET) — X=160, Y=60');
  console.log(`${'='.repeat(70)}\n`);

  // Clear pixel regions
  mem.fill(0, PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);
  mem.fill(0, LCD_VRAM_ADDR, LCD_VRAM_ADDR + LCD_VRAM_SIZE);

  dumpKeyRAMState(mem, 'before NZ IPoint');

  // Snapshot before
  const preNZ_plotSScreen = mem.slice(PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);
  const preNZ_lcdVram = mem.slice(LCD_VRAM_ADDR, LCD_VRAM_ADDR + LCD_VRAM_SIZE);

  const nzResult = callIPointTraced(executor, cpu, mem, 160, 60, 'NZ', true);

  console.log(`\n  NZ path result: returned=${nzResult.returnHit} steps=${nzResult.steps}`);
  console.log(`  Trace (${nzResult.trace.length} blocks):\n`);

  for (const t of nzResult.trace) {
    const miss = t.missing ? ' [MISSING]' : '';
    console.log(`    #${String(t.step).padStart(3)} PC=${hex(t.pc)} A=${hex(t.a, 2)} F=${hex(t.f, 2)}(${t.flags}) BC=${hex(t.bc)} DE=${hex(t.de)} HL=${hex(t.hl)} SP=${hex(t.sp)}${miss}`);
  }

  // Check for pixel writes
  let nzPlotNew = 0;
  for (let i = 0; i < PLOTSSCREEN_SIZE; i++) {
    if (mem[PLOTSSCREEN_ADDR + i] !== preNZ_plotSScreen[i]) nzPlotNew++;
  }
  let nzVramNew = 0;
  for (let i = 0; i < LCD_VRAM_SIZE; i++) {
    if (mem[LCD_VRAM_ADDR + i] !== preNZ_lcdVram[i]) nzVramNew++;
  }

  console.log(`\n  NZ pixel writes: plotSScreen changed=${nzPlotNew}, LCD VRAM changed=${nzVramNew}`);

  // Scan 0xD00000-0xD60000 for any changes
  let nzAnyChanges = 0;
  const nzChangedAddrs = [];
  for (let addr = 0xD00000; addr < 0xD60000; addr++) {
    // We can't do a full pre-snapshot of 384KB, but we can check known-zero regions
    // Just check plotSScreen and LCD VRAM (already done above)
  }

  // ══════════════════════════════════════════════════════════════════════
  // 4. TRACE Z PATH (BIT 2 CLEAR, X=50, Y=60)
  // ══════════════════════════════════════════════════════════════════════

  console.log(`\n${'='.repeat(70)}`);
  console.log('TRACE: Z PATH (BIT 2 CLEAR) — X=50, Y=60');
  console.log(`${'='.repeat(70)}\n`);

  // Clear pixel regions
  mem.fill(0, PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);
  mem.fill(0, LCD_VRAM_ADDR, LCD_VRAM_ADDR + LCD_VRAM_SIZE);

  // Re-seed graph RAM (prepareCallState resets some state)
  seedGraphRAM(mem);

  dumpKeyRAMState(mem, 'before Z IPoint');

  // Snapshot before
  const preZ_plotSScreen = mem.slice(PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);
  const preZ_lcdVram = mem.slice(LCD_VRAM_ADDR, LCD_VRAM_ADDR + LCD_VRAM_SIZE);

  const zResult = callIPointTraced(executor, cpu, mem, 50, 60, 'Z', false);

  console.log(`\n  Z path result: returned=${zResult.returnHit} steps=${zResult.steps}`);
  console.log(`  Trace (${zResult.trace.length} blocks):\n`);

  for (const t of zResult.trace) {
    const miss = t.missing ? ' [MISSING]' : '';
    console.log(`    #${String(t.step).padStart(3)} PC=${hex(t.pc)} A=${hex(t.a, 2)} F=${hex(t.f, 2)}(${t.flags}) BC=${hex(t.bc)} DE=${hex(t.de)} HL=${hex(t.hl)} SP=${hex(t.sp)}${miss}`);
  }

  // Check for pixel writes
  let zPlotNew = 0;
  const zPlotChangedAddrs = [];
  for (let i = 0; i < PLOTSSCREEN_SIZE; i++) {
    if (mem[PLOTSSCREEN_ADDR + i] !== preZ_plotSScreen[i]) {
      zPlotNew++;
      if (zPlotChangedAddrs.length < 10) {
        zPlotChangedAddrs.push({ addr: PLOTSSCREEN_ADDR + i, val: mem[PLOTSSCREEN_ADDR + i] });
      }
    }
  }
  let zVramNew = 0;
  const zVramChangedAddrs = [];
  for (let i = 0; i < LCD_VRAM_SIZE; i++) {
    if (mem[LCD_VRAM_ADDR + i] !== preZ_lcdVram[i]) {
      zVramNew++;
      if (zVramChangedAddrs.length < 10) {
        zVramChangedAddrs.push({ addr: LCD_VRAM_ADDR + i, val: mem[LCD_VRAM_ADDR + i] });
      }
    }
  }

  console.log(`\n  Z pixel writes: plotSScreen changed=${zPlotNew}, LCD VRAM changed=${zVramNew}`);
  if (zPlotNew > 0) {
    console.log(`  First plotSScreen changes:`);
    for (const a of zPlotChangedAddrs) {
      console.log(`    ${hex(a.addr)} = ${hex(a.val, 2)}`);
    }
  }
  if (zVramNew > 0) {
    console.log(`  First LCD VRAM changes:`);
    for (const a of zVramChangedAddrs) {
      console.log(`    ${hex(a.addr)} = ${hex(a.val, 2)}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // 5. COMPARE TRACES
  // ══════════════════════════════════════════════════════════════════════

  console.log(`\n${'='.repeat(70)}`);
  console.log('TRACE COMPARISON: NZ vs Z');
  console.log(`${'='.repeat(70)}\n`);

  const maxLen = Math.max(nzResult.trace.length, zResult.trace.length);
  let divergeStep = -1;

  console.log('  Step  NZ_PC       Z_PC        Match?');
  console.log('  ' + '-'.repeat(60));

  for (let i = 0; i < maxLen; i++) {
    const nzPC = i < nzResult.trace.length ? hex(nzResult.trace[i].pc) : '------';
    const zPC = i < zResult.trace.length ? hex(zResult.trace[i].pc) : '------';
    const match = (i < nzResult.trace.length && i < zResult.trace.length &&
                   nzResult.trace[i].pc === zResult.trace[i].pc) ? 'YES' : 'DIVERGE';

    if (match === 'DIVERGE' && divergeStep === -1) {
      divergeStep = i;
    }

    console.log(`  ${String(i + 1).padStart(4)}  ${nzPC}     ${zPC}     ${match}`);
  }

  if (divergeStep >= 0) {
    console.log(`\n  FIRST DIVERGENCE at step ${divergeStep + 1}`);
    if (divergeStep < nzResult.trace.length) {
      const t = nzResult.trace[divergeStep];
      console.log(`    NZ: PC=${hex(t.pc)} A=${hex(t.a, 2)} F=${hex(t.f, 2)}(${t.flags}) DE=${hex(t.de)} HL=${hex(t.hl)}`);
    }
    if (divergeStep < zResult.trace.length) {
      const t = zResult.trace[divergeStep];
      console.log(`    Z:  PC=${hex(t.pc)} A=${hex(t.a, 2)} F=${hex(t.f, 2)}(${t.flags}) DE=${hex(t.de)} HL=${hex(t.hl)}`);
    }

    // Dump ROM bytes around both divergence PCs
    if (divergeStep < nzResult.trace.length) {
      const nzPC = nzResult.trace[divergeStep].pc;
      console.log(`\n  ROM bytes around NZ divergence (${hex(nzPC)}):`);
      const start = Math.max(0, nzPC - 8);
      const end = Math.min(romBytes.length, nzPC + 32);
      const bytes = [];
      for (let i = start; i < end; i++) {
        bytes.push(romBytes[i].toString(16).padStart(2, '0'));
      }
      console.log(`    ${hex(start)}: ${bytes.join(' ')}`);
    }
    if (divergeStep < zResult.trace.length) {
      const zPC = zResult.trace[divergeStep].pc;
      console.log(`\n  ROM bytes around Z divergence (${hex(zPC)}):`);
      const start = Math.max(0, zPC - 8);
      const end = Math.min(romBytes.length, zPC + 32);
      const bytes = [];
      for (let i = start; i < end; i++) {
        bytes.push(romBytes[i].toString(16).padStart(2, '0'));
      }
      console.log(`    ${hex(start)}: ${bytes.join(' ')}`);
    }
  } else {
    console.log('\n  NO DIVERGENCE — both paths took identical block sequences!');
  }

  // ══════════════════════════════════════════════════════════════════════
  // 6. DEEP ANALYSIS: Dump block source for key divergence blocks
  // ══════════════════════════════════════════════════════════════════════

  console.log(`\n${'='.repeat(70)}`);
  console.log('BLOCK SOURCE ANALYSIS (key blocks in NZ path)');
  console.log(`${'='.repeat(70)}\n`);

  // Dump block source for each unique PC in the NZ trace
  const nzUniquePCs = [...new Set(nzResult.trace.map(t => t.pc))];
  for (const pc of nzUniquePCs) {
    const key = pc.toString(16).padStart(6, '0') + ':adl';
    const block = BLOCKS[key];
    if (block) {
      const src = block.source;
      // Truncate to first 500 chars for readability
      const truncSrc = src.length > 500 ? src.substring(0, 500) + '...' : src;
      console.log(`  Block ${hex(pc)} [adl]:`);
      console.log(`    exits: ${JSON.stringify(block.exits || [])}`);
      console.log(`    source (${src.length} chars):`);
      for (const line of truncSrc.split('\n').slice(0, 25)) {
        console.log(`      ${line}`);
      }
      console.log('');
    }
  }

  // Also dump Z-path blocks that NZ doesn't visit
  const zUniquePCs = [...new Set(zResult.trace.map(t => t.pc))];
  const zOnlyPCs = zUniquePCs.filter(pc => !nzUniquePCs.includes(pc));
  if (zOnlyPCs.length > 0) {
    console.log(`\n  Z-ONLY BLOCKS (visited by Z path but NOT NZ path):\n`);
    for (const pc of zOnlyPCs) {
      const key = pc.toString(16).padStart(6, '0') + ':adl';
      const block = BLOCKS[key];
      if (block) {
        const src = block.source;
        const truncSrc = src.length > 500 ? src.substring(0, 500) + '...' : src;
        console.log(`  Block ${hex(pc)} [adl]:`);
        console.log(`    exits: ${JSON.stringify(block.exits || [])}`);
        console.log(`    source (${src.length} chars):`);
        for (const line of truncSrc.split('\n').slice(0, 25)) {
          console.log(`      ${line}`);
        }
        console.log('');
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // 7. SCAN FOR RAM READS IN NZ PATH — check addresses read by IPoint
  // ══════════════════════════════════════════════════════════════════════

  console.log(`\n${'='.repeat(70)}`);
  console.log('RAM STATE AFTER TRACES');
  console.log(`${'='.repeat(70)}\n`);

  dumpKeyRAMState(mem, 'after all traces');

  // ══════════════════════════════════════════════════════════════════════
  // 8. BROADER MEMORY SCAN after NZ path
  // ══════════════════════════════════════════════════════════════════════

  // Re-run NZ path with full memory snapshot to find ANY writes
  console.log(`\n${'='.repeat(70)}`);
  console.log('NZ PATH: FULL MEMORY CHANGE SCAN (0xD00000 - 0xD60000)');
  console.log(`${'='.repeat(70)}\n`);

  // Take full snapshot, run IPoint, compare
  mem.fill(0, PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);
  mem.fill(0, LCD_VRAM_ADDR, LCD_VRAM_ADDR + LCD_VRAM_SIZE);
  seedGraphRAM(mem);

  const fullSnap = mem.slice(0xD00000, 0xD60000);

  const nz2 = callIPointTraced(executor, cpu, mem, 160, 60, 'NZ-rescan', true);

  let totalChanges = 0;
  const changedRegions = [];
  for (let addr = 0xD00000; addr < 0xD60000; addr++) {
    const snapIdx = addr - 0xD00000;
    if (mem[addr] !== fullSnap[snapIdx]) {
      totalChanges++;
      if (changedRegions.length < 30) {
        changedRegions.push({ addr, before: fullSnap[snapIdx], after: mem[addr] });
      }
    }
  }

  console.log(`  Total bytes changed in 0xD00000-0xD60000: ${totalChanges}`);
  if (changedRegions.length > 0) {
    console.log(`  Changed addresses:`);
    for (const c of changedRegions) {
      console.log(`    ${hex(c.addr)}: ${hex(c.before, 2)} -> ${hex(c.after, 2)}`);
    }
  }

  // ══════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════════════

  console.log(`\n${'='.repeat(70)}`);
  console.log('SUMMARY');
  console.log(`${'='.repeat(70)}\n`);

  console.log(`  NZ path (BIT 2 set, X=160, Y=60):`);
  console.log(`    returned: ${nzResult.returnHit}`);
  console.log(`    blocks traversed: ${nzResult.trace.length}`);
  console.log(`    plotSScreen changes: ${nzPlotNew}`);
  console.log(`    LCD VRAM changes: ${nzVramNew}`);

  console.log(`  Z path (BIT 2 clear, X=50, Y=60):`);
  console.log(`    returned: ${zResult.returnHit}`);
  console.log(`    blocks traversed: ${zResult.trace.length}`);
  console.log(`    plotSScreen changes: ${zPlotNew}`);
  console.log(`    LCD VRAM changes: ${zVramNew}`);

  if (divergeStep >= 0) {
    console.log(`  First divergence at step ${divergeStep + 1}`);
  } else {
    console.log(`  No divergence in block PCs`);
  }

  console.log(`\n  Full-scan NZ path memory changes: ${totalChanges}`);

  console.log('\n=== Phase 144 complete ===');
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

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
