#!/usr/bin/env node
// Phase 28 Option B: boot → run OS init 0x08C331 → call draw routine.
//
// Strategy: boot establishes cold state. Then OS init at 0x08C331 initializes
// RAM (callback pointer, system vars, cursor position, font table, etc).
// Then we call the character-print routine and check VRAM.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const hex = (v, w = 6) => '0x' + (v >>> 0).toString(16).padStart(w, '0');

const p = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
const mem = new Uint8Array(0x1000000);
mem.set(romBytes);
const ex = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals: p });
const cpu = ex.cpu;

// ============================================================================
// Stage 1: Cold boot
// ============================================================================
console.log('=== Stage 1: Boot ===');
const bootResult = ex.runFrom(0x000000, 'z80', { maxSteps: 5000, maxLoopIterations: 32 });
console.log(`Boot: ${bootResult.steps} steps → ${bootResult.termination} at ${hex(bootResult.lastPc)}`);
console.log(`  SP=${hex(cpu.sp)} IY=${hex(cpu._iy)} madl=${cpu.madl} halted=${cpu.halted}`);

// Snapshot critical RAM
const ramBefore = {
  callback: (mem[0xD02AD7] | (mem[0xD02AD8] << 8) | (mem[0xD02AD9] << 16)),
  sysFlag: mem[0xD0009B],
  initFlag: mem[0xD177BA],
};
console.log(`  callback=${hex(ramBefore.callback)} sysFlag=${hex(ramBefore.sysFlag, 2)} initFlag=${hex(ramBefore.initFlag, 2)}`);

// ============================================================================
// Stage 2: Run OS init handler 0x08C331
// ============================================================================
console.log('\n=== Stage 2: OS Init Handler (0x08C331) ===');

cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = 0xD1A87E;
cpu.sp -= 3;
mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;

let initBlocks = 0;
let initRamWrites = 0;
let initVramWrites = 0;
const initRegionHits = new Map();
const initTrail = [];
let firstTrapAt = -1;
let vramAtTrap = 0;
const origWrite8 = cpu.write8.bind(cpu);
cpu.write8 = function(addr, value) {
  if (addr >= 0xD00000 && addr < 0xE00000) initRamWrites++;
  if (addr >= 0xD40000 && addr < 0xD40000 + 320*240*2) initVramWrites++;
  return origWrite8(addr, value);
};

const initResult = ex.runFrom(0x08C331, 'adl', {
  maxSteps: 100000,
  maxLoopIterations: 500,
  onBlock: (pc, mode) => {
    initBlocks++;
    const region = (pc >> 16) & 0xFF;
    initRegionHits.set(region, (initRegionHits.get(region) || 0) + 1);
    // Capture first 30 blocks and 20 blocks leading into trap
    if (firstTrapAt < 0) {
      initTrail.push(`${hex(pc)} A=${hex(cpu.a, 2)} HL=${hex(cpu.hl)} DE=${hex(cpu.de)} BC=${hex(cpu.bc)} IX=${hex(cpu._ix)}`);
      if (initTrail.length > 25) initTrail.shift();
    }
    if (pc === 0x001c33 && firstTrapAt < 0) {
      firstTrapAt = initBlocks;
      vramAtTrap = initVramWrites;
    }
  },
  onMissingBlock: (pc, mode) => {
    // silence — we'll report count
  },
});

console.log(`First 0x001c33 entry at block #${firstTrapAt}, VRAM writes at trap: ${vramAtTrap}`);
console.log(`Total init VRAM writes: ${initVramWrites}`);
{
  let nz = 0;
  for (let i = 0xD40000; i < 0xD40000 + 320 * 240 * 2; i++) if (mem[i] !== 0) nz++;
  console.log(`VRAM non-zero after init: ${nz} bytes`);
}
console.log(`\nLast 20 blocks (rolling window at end of run):`);
for (const t of initTrail) console.log(`  ${t}`);

console.log(`OS init: ${initResult.steps} steps → ${initResult.termination} at ${hex(initResult.lastPc)}`);
console.log(`  blocks visited: ${initBlocks}`);
console.log(`  RAM writes (0xD00000-0xDFFFFF): ${initRamWrites}`);
console.log(`  regions:`);
for (const [region, count] of [...initRegionHits.entries()].sort((a,b) => b[1]-a[1]).slice(0, 8)) {
  console.log(`    0x${region.toString(16).padStart(2,'0')}xxxx: ${count}`);
}
console.log(`  missing blocks: ${initResult.missingBlocks?.length ?? 0}`);

// Snapshot critical RAM after init
const ramAfter = {
  callback: (mem[0xD02AD7] | (mem[0xD02AD8] << 8) | (mem[0xD02AD9] << 16)),
  sysFlag: mem[0xD0009B],
  initFlag: mem[0xD177BA],
  curCol: mem[0xD00595],
  curRow: mem[0xD00596],
};
console.log(`  post-init: callback=${hex(ramAfter.callback)} sysFlag=${hex(ramAfter.sysFlag, 2)} initFlag=${hex(ramAfter.initFlag, 2)}`);
console.log(`  cursor: curCol=${hex(ramAfter.curCol, 2)} curRow=${hex(ramAfter.curRow, 2)}`);

// ============================================================================
// Stage 3: Attempt character draw
// ============================================================================
console.log('\n=== Stage 3: Print \'H\' via 0x0059c6 ===');

cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = 0xD1A87E;
cpu.a = 0x48; // 'H'
cpu.sp -= 3;
mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;

// OS init filled VRAM to 0xff (white). Clear it so the draw is visible.
for (let i = 0xD40000; i < 0xD40000 + 320 * 240 * 2; i++) mem[i] = 0x00;
// Reset cursor position to (0, 0)
mem[0xD00595] = 0;
mem[0xD00596] = 0;
console.log(`After clear: cursor=(${mem[0xD00595]}, ${mem[0xD00596]})`);

// Snapshot VRAM state right before the draw call
const vramBeforeDraw = new Uint8Array(mem.slice(0xD40000, 0xD40000 + 320 * 240 * 2));
const uniqueBefore = new Set();
for (const v of vramBeforeDraw) uniqueBefore.add(v);
console.log(`VRAM before draw: ${uniqueBefore.size} unique byte values: ${[...uniqueBefore].map(v => '0x'+v.toString(16).padStart(2,'0')).join(', ')}`);

let drawBlocks = 0;
let vramWrites = 0;
const drawWriteSamples = [];
const origWrite8b = cpu.write8.bind(cpu);
cpu.write8 = function(addr, value) {
  if (addr >= 0xD40000 && addr < 0xD40000 + 320*240*2) {
    vramWrites++;
    if (drawWriteSamples.length < 20) drawWriteSamples.push(`${hex(addr)}=${hex(value,2)}`);
  }
  return origWrite8b(addr, value);
};

const drawResult = ex.runFrom(0x0059c6, 'adl', {
  maxSteps: 100000,
  maxLoopIterations: 500,
  onBlock: (pc, mode) => { drawBlocks++; },
});

console.log(`Draw: ${drawResult.steps} steps → ${drawResult.termination} at ${hex(drawResult.lastPc)}`);
console.log(`  blocks visited: ${drawBlocks}`);
console.log(`  VRAM writes: ${vramWrites}`);
console.log(`  First 20 VRAM writes:`);
for (const s of drawWriteSamples.slice(0, 20)) console.log(`    ${s}`);

// Count changed cells vs before-draw snapshot
let changed = 0;
for (let i = 0; i < vramBeforeDraw.length; i++) {
  if (mem[0xD40000 + i] !== vramBeforeDraw[i]) changed++;
}
console.log(`  Changed cells (differs from before-draw): ${changed}`);

// Stage 4: draw multiple characters to confirm they render differently
console.log('\n=== Stage 4: Draw "HELLO" ===');
// Clear VRAM + reset cursor
for (let i = 0xD40000; i < 0xD40000 + 320 * 240 * 2; i++) mem[i] = 0x00;
mem[0xD00595] = 0;
mem[0xD00596] = 0;

const chars = ['H', 'E', 'L', 'L', 'O'];
let totalWrites = 0;
const perCharWrites = [];

for (const ch of chars) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = 0xD1A87E;
  cpu.a = ch.charCodeAt(0);
  cpu.sp -= 3;
  mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;

  let writes = 0;
  const origW = cpu.write8.bind(cpu);
  cpu.write8 = function(addr, value) {
    if (addr >= 0xD40000 && addr < 0xD40000 + 320*240*2) writes++;
    return origW(addr, value);
  };
  const result = ex.runFrom(0x0059c6, 'adl', { maxSteps: 10000, maxLoopIterations: 500 });
  console.log(`  '${ch}': ${result.steps} steps → ${result.termination}, ${writes} VRAM writes, cursor=(${mem[0xD00595]}, ${mem[0xD00596]})`);
  totalWrites += writes;
  perCharWrites.push(writes);
}

// Count unique changed cells and bounding box
let allNonZero = 0;
let minAddr = -1, maxAddr = -1;
for (let i = 0xD40000; i < 0xD40000 + 320 * 240 * 2; i++) {
  if (mem[i] !== 0) {
    allNonZero++;
    if (minAddr < 0) minAddr = i;
    maxAddr = i;
  }
}
console.log(`\nTotal VRAM writes across 'HELLO': ${totalWrites}`);
console.log(`Non-zero cells: ${allNonZero}`);
if (allNonZero > 0) {
  const firstOff = minAddr - 0xD40000;
  const lastOff = maxAddr - 0xD40000;
  console.log(`Span: ${hex(minAddr)} → ${hex(maxAddr)}`);
  console.log(`  First pixel: row=${Math.floor(firstOff/640)}, col=${Math.floor((firstOff%640)/2)}`);
  console.log(`  Last pixel:  row=${Math.floor(lastOff/640)}, col=${Math.floor((lastOff%640)/2)}`);
}

// ASCII render of the text region (rows 35-55, cols 0-80)
console.log('\nText-art render of VRAM (rows 35-55, cols 0-80), # = pixel on:');
for (let row = 35; row <= 55; row++) {
  let line = '';
  for (let col = 0; col < 80; col++) {
    const off = row * 640 + col * 2;
    // Pixel is 2 bytes BGR565. "On" if any byte non-zero
    const pixelOn = mem[0xD40000 + off] !== 0 || mem[0xD40000 + off + 1] !== 0;
    line += pixelOn ? '#' : '.';
  }
  console.log('  ' + line);
}

// Check VRAM
let vramNz = 0;
let firstNz = -1, lastNz = -1;
const byteCounts = new Map();
for (let i = 0xD40000; i < 0xD40000 + 320 * 240 * 2; i++) {
  if (mem[i] !== 0) {
    vramNz++;
    if (firstNz < 0) firstNz = i;
    lastNz = i;
    byteCounts.set(mem[i], (byteCounts.get(mem[i]) || 0) + 1);
  }
}
console.log(`  VRAM non-zero: ${vramNz} bytes`);
if (vramNz > 0) {
  const off = firstNz - 0xD40000;
  console.log(`  First: ${hex(firstNz)} (row=${Math.floor(off / 640)}, col=${Math.floor((off % 640) / 2)})`);
  console.log(`  Last:  ${hex(lastNz)}`);
  console.log(`  Unique values: ${byteCounts.size}`);
}
console.log(`  CPU: A=${hex(cpu.a, 2)} HL=${hex(cpu.hl)} DE=${hex(cpu.de)} IX=${hex(cpu._ix)}`);
