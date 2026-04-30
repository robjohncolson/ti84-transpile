#!/usr/bin/env node

/**
 * Phase 150 - IPoint session-129 vs session-149 comparison probe.
 *
 * Note:
 *   The prompt references `probe-phase129-ipoint.mjs`, but that file does not
 *   exist in this repo. The concrete session-129 IPoint probe here is
 *   `probe-phase129-graph-render.mjs`, so this script uses that as the
 *   session-129 baseline and reports the filename mismatch up front.
 *
 * Part A:
 *   Print a field-by-field setup comparison between the session-129 baseline
 *   and `probe-phase149-ipoint-flags.mjs`.
 *
 * Part B:
 *   Recreate the session-129 success path exactly as it exists in the repo,
 *   then change one axis at a time toward the phase-149 setup:
 *     1. Session-129 actual baseline
 *     2. Only register input changed to the phase-149 values
 *     3. Only IY flags changed to the phase-148/149 reference combo
 *     4. Only memory seeding changed to the phase-149 seed set
 *     5. Full phase-149 reference case
 *
 *   All IPoint runs are capped at 500 steps. Cold boot and MEM_INIT keep their
 *   historical budgets because they are setup, not the per-case IPoint run.
 *
 * Part C:
 *   Print the cpu-runtime.js write-path conclusions relevant to VRAM.
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

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_ENTRY = 0x09dee0;
const MEMINIT_RET = 0x7ffff6;
const FAKE_RET = 0x7ffffe;
const IPOINT_RET = 0x7ffff2;
const IPOINT_ENTRY = 0x07b451;

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
const PLOTSSCREEN_ADDR = 0xd09466;
const PLOTSSCREEN_SIZE_129 = 21945;
const PLOTSSCREEN_SIZE_149 = 76800;

const DEFAULT_IY = 0xd00080;
const DEFAULT_IX = 0xd1a860;
const MEMINIT_BUDGET = 100000;
const IPOINT_BUDGET = 500;
const MAX_LOOP_ITER = 8192;

const REQUESTED_PHASE129_SOURCE = 'probe-phase129-ipoint.mjs';
const ACTUAL_PHASE129_SOURCE = 'probe-phase129-graph-render.mjs';
const PHASE149_SOURCE = 'probe-phase149-ipoint-flags.mjs';

const WATCHED_PCS = [
  0x07b541,
  0x07b55a,
  0x07b682,
  0x07b6a6,
  0x07b7cc,
  0x07b7f5,
];

const PHASE148_149_REFERENCE_FLAGS = {
  label: '3C.0=0 02.1=0 2B.2=1 4A.2=0',
  flag3c: false,
  flag02: false,
  flag2b: true,
  flag4a: false,
};

const PART_A_ROWS = [
  {
    field: 'Concrete source file',
    phase129: 'requested path missing; using probe-phase129-graph-render.mjs',
    phase149: 'probe-phase149-ipoint-flags.mjs',
  },
  {
    field: 'Executor creation',
    phase129: 'createExecutor(BLOCKS, mem, { peripherals: createPeripheralBus({ timerInterrupt: false }) })',
    phase149: 'same executor and peripheral bus construction',
  },
  {
    field: 'Boot / memory init',
    phase129: 'coldBoot only; no MEM_INIT call before IPoint',
    phase149: 'coldBoot plus MEM_INIT at 0x09DEE0 before every IPoint case',
  },
  {
    field: 'Allocator seed',
    phase129: 'OPBASE/OPS/PTEMP/PROGPTR/FPSBASE/FPS/NEWDATA_PTR seeded inside runIPoint',
    phase149: 'same allocator addresses seeded before probe-state setup',
  },
  {
    field: 'Graph/window RAM seed',
    phase129: 'Xmin/Xmax/Ymin/Ymax/XScl/YScl set to -10/10/1; offsets zeroed; lcdTallP=240',
    phase149: 'none',
  },
  {
    field: 'Pixel dimension seed',
    phase129: 'write16 pixWideP=320, pixWide_m_2=240',
    phase149: 'write24 pixWideP=320, pixWide_m_2=238',
  },
  {
    field: 'Draw-state seed',
    phase129: 'drawFG=0x001F, drawColorCode=0x001F, drawBG=0xFFFF, 0xD02A60=0x1F, graphMode=0x10, graphFlags bit0=1, IY+02 bit4=1',
    phase149: 'drawColorCode=0x0010 only; no FG/BG/graphMode/graphFlags/0xD02A60 seed',
  },
  {
    field: 'Explicit flag writes',
    phase129: 'IY+35 bit7 cleared; IY+02 bit4 set; IY+03 bit0 set',
    phase149: 'IY+35 bit7 cleared; IY+14 bit5 cleared; sweep IY+3C bit0, IY+02 bit1, IY+2B bit2, IY+4A bit2',
  },
  {
    field: 'Buffer clearing',
    phase129: 'none',
    phase149: 'zero LCD VRAM (153600 bytes) and plotSScreen window (76800 bytes)',
  },
  {
    field: 'IY / IX / SP base state',
    phase129: 'IY=0xD00080, IX=0xD1A860, SP=STACK_RESET_TOP-12 then fake return pushed',
    phase149: 'same IY/IX/SP pattern after prepareCallState',
  },
  {
    field: 'IPoint registers at entry',
    phase129: 'success case D uses A=1, BC=10, DE=10, HL left at 0/default',
    phase149: 'A=1, BC=0x000078 (C=120), DE=0x0000A0 (160), HL=0',
  },
  {
    field: 'Register convention assumed by probe',
    phase129: 'comments and setup treat BC as X and DE as Y',
    phase149: 'uses session-148 convention: C=Y and DE=X',
  },
  {
    field: 'IPoint call style',
    phase129: 'direct executor.runFrom(IPOINT_ENTRY, "adl") with FAKE_RET sentinel',
    phase149: 'callOSRoutine helper with IPOINT_RET sentinel',
  },
  {
    field: 'IPoint step budget',
    phase129: '50000',
    phase149: '2000',
  },
  {
    field: 'onBlock / tracing',
    phase129: 'heavy tracing: PC counts, missing blocks, MBASE log, first/last PCs',
    phase149: 'light tracing: step count and return detection only',
  },
  {
    field: 'Observed target buffer',
    phase129: 'probe report documents plotSScreen writes',
    phase149: 'probe scans LCD VRAM and plotSScreen for non-zero bytes',
  },
];

const CASES = [
  {
    id: 'T1',
    name: 'Session 129 actual baseline',
    note: 'Exact repo success path from phase129 scenario D: drawMode=1, X=10, Y=10, no MEM_INIT, graph-window seed.',
    runMemInit: false,
    allocatorTiming: 'afterPrepare',
    memoryProfile: 'phase129',
    flagCombo: null,
    registers: { a: 1, bc: 10, de: 10, hl: 0 },
    retAddr: FAKE_RET,
  },
  {
    id: 'T2',
    name: 'Only registers -> phase149 values',
    note: 'Keep session-129 memory and call flow; swap BC/DE to the phase149 C=120, DE=160 input.',
    runMemInit: false,
    allocatorTiming: 'afterPrepare',
    memoryProfile: 'phase129',
    flagCombo: null,
    registers: { a: 1, bc: 120, de: 160, hl: 0 },
    retAddr: FAKE_RET,
  },
  {
    id: 'T3',
    name: 'Only IY flags -> phase148/149 reference combo',
    note: 'Keep session-129 memory and registers; apply 3C.0=0, 02.1=0, 2B.2=1, 4A.2=0.',
    runMemInit: false,
    allocatorTiming: 'afterPrepare',
    memoryProfile: 'phase129',
    flagCombo: PHASE148_149_REFERENCE_FLAGS,
    registers: { a: 1, bc: 10, de: 10, hl: 0 },
    retAddr: FAKE_RET,
  },
  {
    id: 'T4',
    name: 'Only memory seeding -> phase149 seed set',
    note: 'Keep session-129 registers and call flow; replace graph-window seed with the phase149 pixel-state seed.',
    runMemInit: false,
    allocatorTiming: 'afterPrepare',
    memoryProfile: 'phase149',
    flagCombo: null,
    registers: { a: 1, bc: 10, de: 10, hl: 0 },
    retAddr: FAKE_RET,
  },
  {
    id: 'T5',
    name: 'Full phase149 reference case',
    note: 'Cold boot + MEM_INIT + phase149 seed state + phase148/149 reference flags + BC=120, DE=160.',
    runMemInit: true,
    allocatorTiming: 'beforeMemory',
    memoryProfile: 'phase149',
    flagCombo: PHASE148_149_REFERENCE_FLAGS,
    registers: { a: 1, bc: 120, de: 160, hl: 0 },
    retAddr: IPOINT_RET,
  },
];

const hex = (value, width = 6) =>
  value === undefined || value === null
    ? 'n/a'
    : `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;

const write16 = (mem, addr, value) => {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
};

const write24 = (mem, addr, value) => {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
};

const inRange = (addr, start, size) => addr >= start && addr < start + size;

function memWrap(mem) {
  return {
    write8(addr, value) {
      mem[addr] = value & 0xff;
    },
    read8(addr) {
      return mem[addr] & 0xff;
    },
  };
}

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

function seedPhase129Memory(mem) {
  const wrapper = memWrap(mem);

  writeReal(wrapper, XMIN_ADDR, -10);
  writeReal(wrapper, XMAX_ADDR, 10);
  writeReal(wrapper, XSCL_ADDR, 1);
  writeReal(wrapper, YMIN_ADDR, -10);
  writeReal(wrapper, YMAX_ADDR, 10);
  writeReal(wrapper, YSCL_ADDR, 1);

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

function seedPhase149Memory(mem) {
  write24(mem, PIX_WIDE_P_ADDR, 320);
  write24(mem, PIX_WIDE_M2_ADDR, 238);
  mem[DRAW_COLOR_CODE_ADDR] = 0x10;
  mem[DRAW_COLOR_CODE_ADDR + 1] = 0x00;
  mem[HOOKFLAGS3_ADDR] &= ~0x80;
  mem[IY_PLUS_14_ADDR] &= ~0x20;
  mem.fill(0x00, LCD_VRAM_ADDR, LCD_VRAM_ADDR + LCD_VRAM_SIZE);
  mem.fill(0x00, PLOTSSCREEN_ADDR, PLOTSSCREEN_ADDR + PLOTSSCREEN_SIZE_149);
}

function applyMemoryProfile(mem, profile) {
  if (profile === 'phase129') {
    seedPhase129Memory(mem);
    return;
  }
  if (profile === 'phase149') {
    seedPhase149Memory(mem);
    return;
  }
  throw new Error(`Unknown memory profile: ${profile}`);
}

function setBitValue(mem, addr, bit, enabled) {
  const mask = 1 << bit;
  if (enabled) {
    mem[addr] |= mask;
  } else {
    mem[addr] &= ~mask;
  }
}

function applyFlagCombo(mem, combo) {
  if (!combo) return;
  setBitValue(mem, IY_PLUS_3C_ADDR, 0, combo.flag3c);
  setBitValue(mem, IY_PLUS_02_ADDR, 1, combo.flag02);
  setBitValue(mem, IY_PLUS_2B_ADDR, 2, combo.flag2b);
  setBitValue(mem, IY_PLUS_4A_ADDR, 2, combo.flag4a);
}

function installWriteTracer(cpu, mem) {
  const entries = [];
  const origWrite8 = cpu.write8.bind(cpu);

  cpu.write8 = (addr, value) => {
    const a = addr & 0xffffff;
    const before = mem[a];
    origWrite8(addr, value);
    const after = mem[a];

    if (
      inRange(a, LCD_VRAM_ADDR, LCD_VRAM_SIZE) ||
      inRange(a, PLOTSSCREEN_ADDR, PLOTSSCREEN_SIZE_149)
    ) {
      if (entries.length < 128) {
        entries.push({
          pc: cpu._currentBlockPc ?? cpu.pc ?? 0,
          addr: a,
          before,
          after,
          value: value & 0xff,
        });
      }
    }
  };

  return entries;
}

function runRoutine(entry, retAddr, executor, cpu, budget) {
  let returnHit = false;
  let steps = 0;
  let lastPc = entry;
  const watchedHits = new Map();
  const missingBlocks = new Set();

  try {
    executor.runFrom(entry, 'adl', {
      maxSteps: budget,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        steps++;
        const norm = pc & 0xffffff;
        lastPc = norm;
        if (WATCHED_PCS.includes(norm)) {
          watchedHits.set(norm, (watchedHits.get(norm) || 0) + 1);
        }
        if (norm === retAddr || norm === FAKE_RET) {
          returnHit = true;
          throw new Error('__RET__');
        }
      },
      onMissingBlock(pc) {
        steps++;
        const norm = pc & 0xffffff;
        lastPc = norm;
        missingBlocks.add(norm);
        if (WATCHED_PCS.includes(norm)) {
          watchedHits.set(norm, (watchedHits.get(norm) || 0) + 1);
        }
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

  return {
    returnHit,
    steps,
    lastPc,
    watchedHits,
    missingBlocks: [...missingBlocks].sort((a, b) => a - b),
  };
}

function snapshotRange(mem, start, size) {
  return Uint8Array.from(mem.subarray(start, start + size));
}

function diffSnapshot(snapshot, mem, start, size, limit = 8) {
  let count = 0;
  const hits = [];

  for (let offset = 0; offset < size; offset++) {
    const before = snapshot[offset];
    const after = mem[start + offset];
    if (before !== after) {
      count++;
      if (hits.length < limit) {
        hits.push({
          addr: start + offset,
          before,
          after,
        });
      }
    }
  }

  return { count, hits };
}

function filterWrites(entries, start, size) {
  return entries.filter((entry) => inRange(entry.addr, start, size));
}

function getFlagState(mem) {
  return {
    iy02: mem[IY_PLUS_02_ADDR],
    iy14: mem[IY_PLUS_14_ADDR],
    iy2b: mem[IY_PLUS_2B_ADDR],
    iy3c: mem[IY_PLUS_3C_ADDR],
    iy4a: mem[IY_PLUS_4A_ADDR],
    hookflags3: mem[HOOKFLAGS3_ADDR],
  };
}

function formatFlagState(state) {
  return [
    `IY+02=${hex(state.iy02, 2)}`,
    `IY+14=${hex(state.iy14, 2)}`,
    `IY+2B=${hex(state.iy2b, 2)}`,
    `IY+3C=${hex(state.iy3c, 2)}`,
    `IY+4A=${hex(state.iy4a, 2)}`,
    `hookflags3=${hex(state.hookflags3, 2)}`,
  ].join(' ');
}

function formatDiffHits(hits) {
  if (hits.length === 0) return 'none';
  return hits
    .map((hit) => `${hex(hit.addr)}:${hex(hit.before, 2)}->${hex(hit.after, 2)}`)
    .join(', ');
}

function formatWriteHits(entries) {
  if (entries.length === 0) return 'none';
  return entries
    .slice(0, 8)
    .map((entry) => `${hex(entry.addr)}<=${hex(entry.value, 2)} @${hex(entry.pc)}`)
    .join(', ');
}

function formatWatchedHits(watchedHits) {
  const entries = [...watchedHits.entries()].sort((a, b) => a[0] - b[0]);
  if (entries.length === 0) return 'none';
  return entries.map(([pc, hits]) => `${hex(pc)} x${hits}`).join(', ');
}

function hasObservedWrite(result) {
  return (
    result.vramDiff.count > 0 ||
    result.plot129Diff.count > 0 ||
    result.plot149Diff.count > 0 ||
    result.vramWrites.length > 0 ||
    result.plotWrites.length > 0
  );
}

function describeObservedWrite(result) {
  if (result.vramDiff.count > 0 || result.vramWrites.length > 0) {
    return `VRAM delta=${result.vramDiff.count}, VRAM writes=${result.vramWrites.length}`;
  }
  if (result.plot129Diff.count > 0 || result.plotWrites.length > 0) {
    return `plot delta=${result.plot129Diff.count}/${result.plot149Diff.count}, plot writes=${result.plotWrites.length}`;
  }
  return 'no tracked writes';
}

function printPartA() {
  const requestedPath = path.join(__dirname, REQUESTED_PHASE129_SOURCE);
  const actualPath = path.join(__dirname, ACTUAL_PHASE129_SOURCE);

  console.log('=== Part A: Session 129 vs Session 149 Setup Comparison ===');
  console.log(`Requested phase-129 file exists: ${fs.existsSync(requestedPath) ? 'yes' : 'no'}`);
  console.log(`Using phase-129 baseline file: ${fs.existsSync(actualPath) ? ACTUAL_PHASE129_SOURCE : 'missing'}`);
  console.log('');

  for (const row of PART_A_ROWS) {
    console.log(`${row.field}:`);
    console.log(`  129: ${row.phase129}`);
    console.log(`  149: ${row.phase149}`);
  }
}

function runConfiguredCase(config) {
  const { mem, executor, cpu } = createRuntime();

  coldBoot(executor, cpu, mem);

  let memInit = null;
  if (config.runMemInit) {
    prepareCallState(cpu, mem);
    cpu.sp = STACK_RESET_TOP;
    cpu.sp -= 3;
    write24(mem, cpu.sp, MEMINIT_RET);
    cpu._iy = DEFAULT_IY;
    cpu.mbase = 0xd0;
    memInit = runRoutine(MEMINIT_ENTRY, MEMINIT_RET, executor, cpu, MEMINIT_BUDGET);
  }

  if (config.allocatorTiming === 'beforeMemory') {
    seedAllocator(mem);
  }

  applyMemoryProfile(mem, config.memoryProfile);
  applyFlagCombo(mem, config.flagCombo);

  const flagState = getFlagState(mem);
  const vramBefore = snapshotRange(mem, LCD_VRAM_ADDR, LCD_VRAM_SIZE);
  const plot129Before = snapshotRange(mem, PLOTSSCREEN_ADDR, PLOTSSCREEN_SIZE_129);
  const plot149Before = snapshotRange(mem, PLOTSSCREEN_ADDR, PLOTSSCREEN_SIZE_149);

  const writeTrace = installWriteTracer(cpu, mem);

  prepareCallState(cpu, mem);
  if (config.allocatorTiming === 'afterPrepare') {
    seedAllocator(mem);
  }

  cpu.a = config.registers.a;
  cpu._bc = config.registers.bc;
  cpu._de = config.registers.de;
  cpu._hl = config.registers.hl;

  cpu.sp -= 3;
  write24(mem, cpu.sp, config.retAddr);

  const ipoint = runRoutine(IPOINT_ENTRY, config.retAddr, executor, cpu, IPOINT_BUDGET);
  const vramDiff = diffSnapshot(vramBefore, mem, LCD_VRAM_ADDR, LCD_VRAM_SIZE);
  const plot129Diff = diffSnapshot(plot129Before, mem, PLOTSSCREEN_ADDR, PLOTSSCREEN_SIZE_129);
  const plot149Diff = diffSnapshot(plot149Before, mem, PLOTSSCREEN_ADDR, PLOTSSCREEN_SIZE_149);
  const vramWrites = filterWrites(writeTrace, LCD_VRAM_ADDR, LCD_VRAM_SIZE);
  const plotWrites = filterWrites(writeTrace, PLOTSSCREEN_ADDR, PLOTSSCREEN_SIZE_149);

  return {
    config,
    memInit,
    flagState,
    ipoint,
    vramDiff,
    plot129Diff,
    plot149Diff,
    vramWrites,
    plotWrites,
  };
}

function printCaseResult(result) {
  console.log(`\n[${result.config.id}] ${result.config.name}`);
  console.log(`  ${result.config.note}`);
  console.log(`  Flags before IPoint: ${formatFlagState(result.flagState)}`);
  if (result.memInit) {
    console.log(
      `  MEM_INIT: returned=${result.memInit.returnHit} steps=${result.memInit.steps} lastPC=${hex(result.memInit.lastPc)}`
    );
  } else {
    console.log('  MEM_INIT: not run');
  }
  console.log(
    `  IPoint: returned=${result.ipoint.returnHit} steps=${result.ipoint.steps} lastPC=${hex(result.ipoint.lastPc)}`
  );
  console.log(`  Watched PCs: ${formatWatchedHits(result.ipoint.watchedHits)}`);
  console.log(`  Missing blocks: ${result.ipoint.missingBlocks.length > 0 ? result.ipoint.missingBlocks.map((pc) => hex(pc)).join(', ') : 'none'}`);
  console.log(`  VRAM delta: ${result.vramDiff.count} (${formatDiffHits(result.vramDiff.hits)})`);
  console.log(`  plotSScreen delta (21945): ${result.plot129Diff.count} (${formatDiffHits(result.plot129Diff.hits)})`);
  console.log(`  plotSScreen delta (76800): ${result.plot149Diff.count} (${formatDiffHits(result.plot149Diff.hits)})`);
  console.log(`  Traced VRAM writes: ${result.vramWrites.length} (${formatWriteHits(result.vramWrites)})`);
  console.log(`  Traced plot writes: ${result.plotWrites.length} (${formatWriteHits(result.plotWrites)})`);
}

function printPartBSummary(results) {
  console.log('\n=== Part B Summary ===');

  const baseline = results[0];
  console.log(`Baseline (${baseline.config.id}) observed signal: ${describeObservedWrite(baseline)}`);

  if (!hasObservedWrite(baseline)) {
    console.log(
      'The concrete session-129 probe in this repo does not reproduce the prompt\'s VRAM-write claim by itself. If you expect VRAM activity here, the source-file mismatch is the first thing to resolve.'
    );
  }

  for (const result of results.slice(1)) {
    const changed = hasObservedWrite(result) ? describeObservedWrite(result) : 'no tracked writes';
    console.log(`  ${result.config.id}: ${changed}`);
  }

  const killers = results
    .slice(1, 4)
    .filter((result) => hasObservedWrite(baseline) && !hasObservedWrite(result))
    .map((result) => result.config.id);

  if (killers.length === 1) {
    console.log(`Single-axis failure candidate: ${killers[0]} is the only isolated change that kills the baseline write path.`);
  } else if (killers.length > 1) {
    console.log(`Multiple isolated changes kill the baseline write path: ${killers.join(', ')}.`);
  } else if (hasObservedWrite(baseline)) {
    console.log('No single isolated change fully kills the baseline write path; compare T5 against T1-T4 for the combined effect.');
  }
}

function printPartC() {
  console.log('\n=== Part C: cpu-runtime.js VRAM Write Check ===');
  console.log('write8/write16/write24 only block writes when addr < 0x400000.');
  console.log('0xD40000-0xD65800 is above that ROM fence, so the base write helpers do not reject VRAM writes.');
  console.log('The only special write hooks are MMIO handling for 0xE00000/0xF80000 LCD regs and 0xE00800 keyboard regs.');
  console.log('There is no VRAM-specific drop path and no separate VRAM write handler in cpu-runtime.js.');
}

function main() {
  console.log('=== Phase 150: IPoint Session 129 vs 149 Compare ===');
  console.log(`Session-129 requested file: ${REQUESTED_PHASE129_SOURCE}`);
  console.log(`Session-129 concrete file used: ${ACTUAL_PHASE129_SOURCE}`);
  console.log(`Session-149 file: ${PHASE149_SOURCE}`);
  console.log('');

  printPartA();

  console.log('\n=== Part B: Axis Isolation Cases ===');
  const results = CASES.map((config) => runConfiguredCase(config));
  for (const result of results) {
    printCaseResult(result);
  }
  printPartBSummary(results);

  printPartC();
}

try {
  main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
