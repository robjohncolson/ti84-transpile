#!/usr/bin/env node

/**
 * Phase 149 - IPoint flag sweep.
 *
 * Goal:
 *   Find which combination of the known IY-gated flags actually enables
 *   IPoint to write a center-screen pixel to LCD VRAM.
 *
 * Sweep:
 *   - BIT 0 of IY+0x3C (0xD000BC)
 *   - BIT 1 of IY+0x02 (0xD00082)
 *   - BIT 2 of IY+0x2B (0xD000AB)
 *   - BIT 2 of IY+0x4A (0xD000CA)
 *
 * For each of the 16 combinations:
 *   1. Cold boot and run MEM_INIT
 *   2. Seed allocator + pixel state
 *   3. Zero LCD VRAM and plotSScreen window
 *   4. Call IPoint with C=120, DE=160, A=1
 *   5. Scan LCD VRAM and plotSScreen for non-zero bytes
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

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
const IPOINT_RET = 0x7ffff2;
const MEMINIT_RET = 0x7ffff6;

const MEMINIT_ENTRY = 0x09dee0;
const IPOINT_ENTRY = 0x07b451;

const PIX_WIDE_P_ADDR = 0xd014fe;
const PIX_WIDE_M2_ADDR = 0xd01501;
const DRAW_COLOR_CODE_ADDR = 0xd026ae;
const HOOKFLAGS3_ADDR = 0xd000b5;

const IY_PLUS_02_ADDR = 0xd00082;
const IY_PLUS_14_ADDR = 0xd00094;
const IY_PLUS_2B_ADDR = 0xd000ab;
const IY_PLUS_3C_ADDR = 0xd000bc;
const IY_PLUS_4A_ADDR = 0xd000ca;

const LCD_VRAM_ADDR = 0xd40000;
const LCD_VRAM_SIZE = 153600;

const PLOTSSCREEN_ADDR = 0xd09466;
const PLOTSSCREEN_SIZE = 76800;

const MAX_LOOP_ITER = 8192;
const MEMINIT_BUDGET = 100000;
const IPOINT_BUDGET = 2000;

const PIXEL_X = 160;
const PIXEL_Y = 120;
const DRAW_MODE = 1;

const EXPECTED_VRAM_ADDR =
  LCD_VRAM_ADDR + ((239 - PIXEL_Y) * 320 * 2) + (PIXEL_X * 2);

const hex = (value, width = 6) =>
  value === undefined || value === null
    ? 'n/a'
    : `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

const write24 = (mem, addr, value) => {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
};

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
  cpu._iy = 0xd00080;
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
  cpu._iy = 0xd00080;
  cpu.f = 0x40;
  cpu._ix = 0xd1a860;
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

function callOSRoutine(entry, retAddr, executor, cpu, mem, budget) {
  let returnHit = false;
  let steps = 0;
  try {
    executor.runFrom(entry, 'adl', {
      maxSteps: budget,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        steps++;
        const norm = pc & 0xffffff;
        if (norm === retAddr || norm === FAKE_RET) {
          returnHit = true;
          throw new Error('__RET__');
        }
      },
      onMissingBlock(pc) {
        steps++;
        const norm = pc & 0xffffff;
        if (norm === retAddr || norm === FAKE_RET) {
          returnHit = true;
          throw new Error('__RET__');
        }
      },
    });
  } catch (error) {
    if (error?.message !== '__RET__') {
      throw error;
    }
  }
  return { returnHit, steps };
}

function setBitValue(mem, addr, bit, enabled) {
  const mask = 1 << bit;
  if (enabled) {
    mem[addr] |= mask;
  } else {
    mem[addr] &= ~mask;
  }
}

function seedProbeState(mem) {
  write24(mem, PIX_WIDE_P_ADDR, 320);
  write24(mem, PIX_WIDE_M2_ADDR, 238);
  mem[DRAW_COLOR_CODE_ADDR] = 0x10;
  mem[DRAW_COLOR_CODE_ADDR + 1] = 0x00;
  mem[HOOKFLAGS3_ADDR] &= ~0x80;
  mem[IY_PLUS_14_ADDR] &= ~0x20;
  mem.fill(0x00, LCD_VRAM_ADDR, LCD_VRAM_ADDR + LCD_VRAM_SIZE);
  mem.fill(0x00, PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE);
}

function scanNonZero(mem, start, size, limit = 16) {
  let count = 0;
  const hits = [];
  for (let offset = 0; offset < size; offset++) {
    const value = mem[start + offset];
    if (value !== 0) {
      count++;
      if (hits.length < limit) {
        hits.push({
          offset,
          addr: start + offset,
          value,
        });
      }
    }
  }
  return { count, hits };
}

function formatHitList(hits) {
  if (hits.length === 0) {
    return 'none';
  }
  return hits.map((hit) => `${hex(hit.addr)}=${hex(hit.value, 2)}`).join(', ');
}

function makeComboLabel(result) {
  return `3C.0=${result.flag3c ? 1 : 0} 02.1=${result.flag02 ? 1 : 0} 2B.2=${result.flag2b ? 1 : 0} 4A.2=${result.flag4a ? 1 : 0}`;
}

function runCase(flag3c, flag02, flag2b, flag4a) {
  const { mem, executor, cpu } = createRuntime();

  coldBoot(executor, cpu, mem);

  prepareCallState(cpu, mem);
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  cpu._iy = 0xd00080;
  cpu.mbase = 0xd0;
  const memInit = callOSRoutine(MEMINIT_ENTRY, MEMINIT_RET, executor, cpu, mem, MEMINIT_BUDGET);

  seedAllocator(mem);
  seedProbeState(mem);

  setBitValue(mem, IY_PLUS_3C_ADDR, 0, flag3c);
  setBitValue(mem, IY_PLUS_02_ADDR, 1, flag02);
  setBitValue(mem, IY_PLUS_2B_ADDR, 2, flag2b);
  setBitValue(mem, IY_PLUS_4A_ADDR, 2, flag4a);

  prepareCallState(cpu, mem);
  cpu.a = DRAW_MODE;
  cpu._bc = PIXEL_Y & 0xff;
  cpu._de = PIXEL_X;
  cpu._hl = 0;
  cpu.sp -= 3;
  write24(mem, cpu.sp, IPOINT_RET);

  const ipoint = callOSRoutine(IPOINT_ENTRY, IPOINT_RET, executor, cpu, mem, IPOINT_BUDGET);
  const vram = scanNonZero(mem, LCD_VRAM_ADDR, LCD_VRAM_SIZE);
  const plot = scanNonZero(mem, PLOTSSCREEN_ADDR, PLOTSSCREEN_SIZE);

  return {
    flag3c,
    flag02,
    flag2b,
    flag4a,
    memInitReturned: memInit.returnHit,
    memInitSteps: memInit.steps,
    ipointReturned: ipoint.returnHit,
    ipointSteps: ipoint.steps,
    vram,
    plot,
  };
}

function printCase(result, index) {
  console.log(
    `[${String(index).padStart(2, '0')}] ${makeComboLabel(result)} ` +
    `| IPoint returned=${result.ipointReturned} steps=${result.ipointSteps} ` +
    `| VRAM=${result.vram.count} | plotSScreen=${result.plot.count}`
  );
  if (result.vram.count > 0) {
    console.log(`     VRAM hits: ${formatHitList(result.vram.hits)}`);
  }
  if (result.plot.count > 0) {
    console.log(`     plot hits: ${formatHitList(result.plot.hits)}`);
  }
}

function printSummaryTable(results) {
  console.log('\n=== Summary Table ===');
  console.log('idx  3C.0  02.1  2B.2  4A.2  ret   steps  vram   plot   first VRAM hit');
  for (let index = 0; index < results.length; index++) {
    const result = results[index];
    const firstVram = result.vram.hits[0]
      ? `${hex(result.vram.hits[0].addr)}=${hex(result.vram.hits[0].value, 2)}`
      : '-';
    const row =
      `${String(index + 1).padStart(2, '0')}   ` +
      `${String(result.flag3c ? 1 : 0).padEnd(4)} ` +
      `${String(result.flag02 ? 1 : 0).padEnd(5)} ` +
      `${String(result.flag2b ? 1 : 0).padEnd(5)} ` +
      `${String(result.flag4a ? 1 : 0).padEnd(5)} ` +
      `${String(result.ipointReturned ? 'yes' : 'no').padEnd(5)} ` +
      `${String(result.ipointSteps).padEnd(6)} ` +
      `${String(result.vram.count).padEnd(6)} ` +
      `${String(result.plot.count).padEnd(6)} ` +
      `${firstVram}`;
    console.log(row);
  }
}

function printWinningCombos(results) {
  const vramWriters = results.filter((result) => result.vram.count > 0);
  const plotWriters = results.filter((result) => result.plot.count > 0);

  console.log('\n=== VRAM Writers ===');
  if (vramWriters.length === 0) {
    console.log('No flag combination produced non-zero LCD VRAM bytes.');
  } else {
    for (const result of vramWriters) {
      console.log(`${makeComboLabel(result)} -> ${result.vram.count} VRAM bytes`);
      console.log(`  VRAM addresses: ${formatHitList(result.vram.hits)}`);
    }
  }

  console.log('\n=== plotSScreen Writers ===');
  if (plotWriters.length === 0) {
    console.log('No flag combination produced non-zero plotSScreen bytes.');
  } else {
    for (const result of plotWriters) {
      console.log(`${makeComboLabel(result)} -> ${result.plot.count} plotSScreen bytes`);
      console.log(`  plotSScreen addresses: ${formatHitList(result.plot.hits)}`);
    }
  }
}

function main() {
  console.log('=== Phase 149: IPoint Flag Sweep ===');
  console.log(`Center pixel: X=${PIXEL_X}, Y=${PIXEL_Y}, drawMode=${DRAW_MODE}`);
  console.log(`Expected LCD VRAM byte address: ${hex(EXPECTED_VRAM_ADDR)}`);
  console.log(
    `Sweeping IY+0x3C bit0, IY+0x02 bit1, IY+0x2B bit2, and IY+0x4A bit2 ` +
    `(16 total combinations)\n`
  );

  const results = [];

  for (const flag3c of [false, true]) {
    for (const flag02 of [false, true]) {
      for (const flag2b of [false, true]) {
        for (const flag4a of [false, true]) {
          const result = runCase(flag3c, flag02, flag2b, flag4a);
          results.push(result);
          printCase(result, results.length);
        }
      }
    }
  }

  printSummaryTable(results);
  printWinningCombos(results);
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
