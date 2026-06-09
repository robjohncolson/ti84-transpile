#!/usr/bin/env node
// Probe MathPrint body populator descriptor sentinel seeds.

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
const STACK_RESET_TOP = 0xD1A87E;
const VRAM_BASE = 0xD40000;
const W = 320;
const H = 240;
const IDLE_LOOP = 0x0019be;
const BOOT_CONTINUATION = 0x08C33D;
const PAINT_ENTRY = 0x058241;

const WATCH = {
  fpValidate: 0x07F81D,
  stallCall: 0x080037,
  popCore: 0x07D583,
  postPop: 0x044FC2,
  walker: 0x07D1B4,
  rasterizer: 0x0A1799,
  bail: 0x044D3B,
  errHandler: 0x061D52,
};

const SNAP_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const variants = [
  {
    label: 'V1 both descriptor markers FF entry 044D3F',
    entry: 0x044D3F,
    seed() {
      mem[0xD005F8] = 0xFF;
      mem[0xD00603] = 0xFF;
    },
  },
  {
    label: 'V2 only shadow marker FF entry 044D3F',
    entry: 0x044D3F,
    seed() {
      mem[0xD00603] = 0xFF;
    },
  },
  {
    label: 'V3 both descriptor markers FF entry 044A69',
    entry: 0x044A69,
    seed() {
      mem[0xD005F8] = 0xFF;
      mem[0xD00603] = 0xFF;
    },
  },
  {
    label: 'V4 full 7-byte sentinel records entry 044D3F',
    entry: 0x044D3F,
    seed() {
      mem.fill(0xFF, 0xD005F8, 0xD005FF);
      mem.fill(0xFF, 0xD00603, 0xD0060A);
    },
  },
];

const hex = (v, w = 6) => v == null ? 'n/a' : `0x${(v >>> 0).toString(16).padStart(w, '0')}`;

function read16(mem, a) {
  return mem[a] | (mem[a + 1] << 8);
}

function read24(mem, a) {
  return mem[a] | (mem[a + 1] << 8) | (mem[a + 2] << 16);
}

function write24(mem, a, v) {
  mem[a] = v & 0xFF;
  mem[a + 1] = (v >> 8) & 0xFF;
  mem[a + 2] = (v >> 16) & 0xFF;
}

function vramNonWhite(mem) {
  let nonWhite = 0;
  for (let i = 0; i < W * H; i++) {
    if (read16(mem, VRAM_BASE + i * 2) !== 0xFFFF) nonWhite++;
  }
  return nonWhite;
}

function bodyNonWhite(mem) {
  let nonWhite = 0;
  for (let y = 30; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (read16(mem, VRAM_BASE + (y * W + x) * 2) !== 0xFFFF) nonWhite++;
    }
  }
  return nonWhite;
}

function byteDump(mem) {
  return {
    D005F8: mem[0xD005F8],
    D005F9: mem[0xD005F9],
    D005FA: mem[0xD005FA],
    D00603: mem[0xD00603],
    D00604: mem[0xD00604],
    D00605: mem[0xD00605],
    D02032: mem[0xD02032],
    D00082: mem[0xD00082],
  };
}

function cursorDump(mem) {
  return {
    D0231A: read24(mem, 0xD0231A),
    D0243A: read24(mem, 0xD0243A),
  };
}

function formatBytes(dump) {
  return Object.entries(dump).map(([k, v]) => `${k}=${hex(v, 2)}`).join(' ');
}

function formatCursors(dump) {
  return Object.entries(dump).map(([k, v]) => `${k}=${hex(v)}`).join(' ');
}

function printBlockList(blocks) {
  for (let i = 0; i < blocks.length; i += 10) {
    console.log(`  ${blocks.slice(i, i + 10).map((pc) => hex(pc)).join(' ')}`);
  }
}

function inPopulatorNeighborhood(pc) {
  return (pc >= 0x044000 && pc <= 0x044FFF) ||
    (pc >= 0x07D000 && pc <= 0x07DFFF) ||
    (pc >= 0x07F000 && pc <= 0x07FFFF);
}

function divergence(blocks) {
  for (let i = 0; i < blocks.length - 1; i++) {
    if (inPopulatorNeighborhood(blocks[i]) && !inPopulatorNeighborhood(blocks[i + 1])) {
      return { from: blocks[i], to: blocks[i + 1] };
    }
  }
  return null;
}

function lastNeighborhoodTransition(blocks) {
  let hit = null;
  for (let i = 0; i < blocks.length - 1; i++) {
    if (inPopulatorNeighborhood(blocks[i])) hit = { from: blocks[i], to: blocks[i + 1] };
  }
  return hit;
}

function firstAfter(blocks, target) {
  const idx = blocks.indexOf(target);
  return idx >= 0 && idx + 1 < blocks.length ? blocks[idx + 1] : null;
}

function runSafe(executor, entry, opts) {
  try {
    return executor.runFrom(entry, 'adl', opts);
  } catch (e) {
    const msg = String(e && e.message || e);
    const m = msg.match(/missing[_ -]?block[^0-9a-f]*(0x[0-9a-f]+)/i) || msg.match(/\b(0x[0-9a-f]{1,6})\b/i);
    return { steps: -1, termination: 'threw', lastPc: null, error: msg, missingBlock: m ? m[1] : null };
  }
}

const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes);
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('=== MathPrint populator sentinel probe ===');

executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(BOOT_CONTINUATION - 0x0C, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
cpu.mbase = 0xD0;
cpu._iy = 0xD00080;
cpu._hl = 0;
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
cpu.halted = false;
cpu.iff1 = 1;
cpu.iff2 = 1;
cpu._iy = 0xD00080;
cpu.mbase = 0xD0;
cpu.sp = STACK_RESET_TOP - 12;
mem.fill(0xFF, cpu.sp, cpu.sp + 12);
executor.runFrom(IDLE_LOOP, 'adl', { maxSteps: 1_500_000, maxLoopIterations: 100000 });

const ramSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
const cpuSnap = Object.fromEntries(SNAP_FIELDS.map((f) => [f, cpu[f]]));

function restoreIdle() {
  mem.set(ramSnap, 0x400000);
  for (const [f, v] of Object.entries(cpuSnap)) cpu[f] = v;
  peripherals.setTimerEnabled(false);
}

function seedVat() {
  write24(mem, 0xD02587, 0xD1A881);
  write24(mem, 0xD0258A, 0xD1A881);
  write24(mem, 0xD0258D, 0xD1A881);
  write24(mem, 0xD025A0, 0xD1A881);
  write24(mem, 0xD0259A, 0xD3FFFF);
  write24(mem, 0xD02590, 0xD3FFFF);
  write24(mem, 0xD02593, 0xD3FFFF);
  write24(mem, 0xD0259D, 0xD3FFFF);
  write24(mem, 0xD025C5, 0xD3FFFF - 0xD1A881);
}

function setupCallFrame(returnPc) {
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = 0xD00080;
  cpu.mbase = 0xD0;
  cpu.sp = STACK_RESET_TOP - 24;
  cpu.push(returnPc & 0xFFFFFF);
  write24(mem, 0xD008E0, cpu.sp & 0xFFFFFF);
}

function prepareVariant(variant) {
  restoreIdle();
  seedVat();
  mem[0xD007E0] = 0x40;

  setupCallFrame(BOOT_CONTINUATION);
  peripherals.setTimerEnabled(true);
  const paintResult = runSafe(executor, PAINT_ENTRY, { maxSteps: 1_200_000, maxLoopIterations: 60000 });
  mem[0xD00082] |= 0x80;
  variant.seed();
  setupCallFrame(IDLE_LOOP);
  peripherals.setTimerEnabled(true);
  return paintResult;
}

function runVariant(variant) {
  console.log(`\n--- ${variant.label} ---`);
  const paintResult = prepareVariant(variant);
  const beforeBytes = byteDump(mem);
  const beforeCursors = cursorDump(mem);
  const beforeVram = vramNonWhite(mem);
  const beforeBody = bodyNonWhite(mem);
  const hits = Object.fromEntries(Object.keys(WATCH).map((k) => [k, 0]));
  const blocks = [];

  console.log(`paint steps=${paintResult.steps} term=${paintResult.termination} lastPc=${hex(paintResult.lastPc)}${paintResult.error ? ` err=${paintResult.error}` : ''}`);
  console.log(`BEFORE bytes ${formatBytes(beforeBytes)} cursors ${formatCursors(beforeCursors)} VRAM_nonWhite=${beforeVram} BODY_nonWhite=${beforeBody}`);

  const result = runSafe(executor, variant.entry, {
    maxSteps: 1_500_000,
    maxLoopIterations: 60000,
    onBlock(pc) {
      if (blocks.length < 300) blocks.push(pc);
      for (const [name, addr] of Object.entries(WATCH)) {
        if (pc === addr) hits[name]++;
      }
    },
  });

  const afterBytes = byteDump(mem);
  const afterCursors = cursorDump(mem);
  const afterVram = vramNonWhite(mem);
  const afterBody = bodyNonWhite(mem);
  const div = divergence(blocks);
  const lastPop = lastNeighborhoodTransition(blocks);
  const afterStallCall = firstAfter(blocks, WATCH.stallCall);
  const cursorNonzero = afterCursors.D0231A !== 0 || afterCursors.D0243A !== 0;
  const success = hits.popCore > 0 || hits.walker > 0 || hits.rasterizer > 0 || cursorNonzero || afterBody > 0;

  console.log(`AFTER  bytes ${formatBytes(afterBytes)} cursors ${formatCursors(afterCursors)} VRAM_nonWhite=${afterVram} BODY_nonWhite=${afterBody}`);
  console.log(`run steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}${result.error ? ` err=${result.error}` : ''}`);
  if (result.missingBlock) console.log(`missing_block=${result.missingBlock}`);
  console.log(`watch ${Object.entries(hits).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  console.log(`success=${success ? 'YES' : 'NO'} cursorNonzero=${cursorNonzero ? 'YES' : 'NO'}`);
  console.log(`DIVERGENCE firstExit=${div ? `${hex(div.from)} -> ${hex(div.to)}` : 'n/a'} lastPopNeighborhood=${lastPop ? `${hex(lastPop.from)} -> ${hex(lastPop.to)}` : 'n/a'}`);
  console.log(`STALL_CALL next=${afterStallCall == null ? 'n/a' : hex(afterStallCall)}`);
  console.log(`FIRST_300_BLOCKS count=${blocks.length}`);
  printBlockList(blocks);

  return {
    label: variant.label,
    entry: variant.entry,
    paintResult,
    result,
    hits,
    beforeBytes,
    afterBytes,
    beforeCursors,
    afterCursors,
    beforeVram,
    afterVram,
    beforeBody,
    afterBody,
    success,
    divergence: div,
    lastPopNeighborhood: lastPop,
    afterStallCall,
    blocks,
  };
}

const results = variants.map(runVariant);

console.log('\n=== SUMMARY ===');
for (const r of results) {
  console.log(`${r.success ? 'SUCCESS' : 'fail   '} ${r.label}: steps=${r.result.steps} term=${r.result.termination} lastPc=${hex(r.result.lastPc)} watches=${Object.entries(r.hits).map(([k, v]) => `${k}:${v}`).join(',')} bytes=${formatBytes(r.afterBytes)} cursors=${formatCursors(r.afterCursors)} vram=${r.afterVram} body=${r.afterBody} lastPop=${r.lastPopNeighborhood ? `${hex(r.lastPopNeighborhood.from)}->${hex(r.lastPopNeighborhood.to)}` : 'n/a'} stallNext=${r.afterStallCall == null ? 'n/a' : hex(r.afterStallCall)}`);
}
