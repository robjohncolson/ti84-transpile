#!/usr/bin/env node
// Phase 86: Trace 0x09c000 forward to see if/when it reaches 0x09cb14 (Y= renderer)
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romMod = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romMod.PRELIFTED_BLOCKS;
console.log(`Loaded ${Object.keys(BLOCKS).length} blocks`);

const romBytes = romMod.decodeEmbeddedRom();
const { createExecutor } = await import(pathToFileURL(path.join(__dirname, 'cpu-runtime.js')).href);
const { createPeripheralBus } = await import(pathToFileURL(path.join(__dirname, 'peripherals.js')).href);

// Boot snapshot
const snapMem = new Uint8Array(0x1000000);
snapMem.set(romBytes);
const snapP = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const snapEx = createExecutor(BLOCKS, snapMem, { peripherals: snapP });
const snapCpu = snapEx.cpu;
snapEx.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
snapCpu.halted = false; snapCpu.iff1 = 0; snapCpu.iff2 = 0;
snapCpu.sp = 0xD1A87E - 3;
snapMem.fill(0xFF, snapCpu.sp, snapCpu.sp + 3);
snapEx.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });
snapCpu.halted = false; snapCpu.iff1 = 0; snapCpu.iff2 = 0;
snapCpu._iy = 0xD00080; snapCpu.hl = 0x000000;
snapEx.runFrom(0x0802b2, 'adl', { maxSteps: 100 });
const snapCpuState = JSON.parse(JSON.stringify(snapCpu));
const snapMemCopy = new Uint8Array(snapMem);
console.log('Snapshot ready.');

// Run 0x09c000 with block trace, stop if it hits 0x09cb14 or 0x0a2b72 or 0x0a1799
const mem = new Uint8Array(snapMemCopy);
const p = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const ex = createExecutor(BLOCKS, mem, { peripherals: p });
const cpu = ex.cpu;
Object.assign(cpu, snapCpuState);
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu._iy = 0xD00080; cpu.sp = 0xD1A87E - 12;
mem.fill(0xFF, cpu.sp, cpu.sp + 12);
cpu.f = 0x40;

const SENTINEL_VRAM = 0xAAAA;
const vStart = 0xD40000;
for (let i = 0; i < 320 * 240; i++) {
  mem[vStart + i * 2] = 0xAA;
  mem[vStart + i * 2 + 1] = 0xAA;
}

const WATCH = new Set([0x09cb14, 0x0a2b72, 0x0a1799, 0x05e242, 0x05e7d2, 0x05e481]);
const WATCH_NAMES = {
  0x09cb14: '09cb14(Y=attr)',
  0x0a2b72: '0a2b72(scroll)',
  0x0a1799: '0a1799(char)',
  0x05e242: '05e242(char2)',
  0x05e7d2: '05e7d2(attr2)',
  0x05e481: '05e481(attr3)',
};

const firstHits = new Map();
let totalSteps = 0;
let vramWriteCount = 0;

const r = ex.runFrom(0x09c000, 'adl', {
  maxSteps: 200000,
  maxLoopIterations: 1000,
  onBlock: (pc) => {
    totalSteps++;
    if (WATCH.has(pc) && !firstHits.has(pc)) {
      firstHits.set(pc, totalSteps);
    }
  }
});

// Count VRAM writes
let fg = 0, bg = 0;
for (let i = 0; i < 320 * 240; i++) {
  const lo = mem[vStart + i * 2], hi = mem[vStart + i * 2 + 1];
  const px = lo | (hi << 8);
  if (px !== SENTINEL_VRAM) {
    if (px === 0x0000) fg++; else bg++;
  }
}

console.log(`\n0x09c000 probe (200k steps):`);
console.log(`  steps=${r.steps} term=${r.termination} lastPc=0x${(r.lastPc||0).toString(16)}`);
console.log(`  VRAM: fg=${fg} bg=${bg} total=${fg+bg}`);
console.log(`\nFirst hits on watched addresses:`);
for (const [pc, step] of firstHits) {
  console.log(`  ${WATCH_NAMES[pc] || pc.toString(16)}: first at block-call #${step}`);
}
if (firstHits.size === 0) {
  console.log('  (none hit in 200k steps)');
}

// Also try with 0x09c95a as entry (the BCALL-dispatched event handler)
console.log('\n=== Probing 0x09c95a ===');
const mem2 = new Uint8Array(snapMemCopy);
const p2 = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const ex2 = createExecutor(BLOCKS, mem2, { peripherals: p2 });
const cpu2 = ex2.cpu;
Object.assign(cpu2, snapCpuState);
cpu2.halted = false; cpu2.iff1 = 0; cpu2.iff2 = 0;
cpu2._iy = 0xD00080; cpu2.sp = 0xD1A87E - 12;
mem2.fill(0xFF, cpu2.sp, cpu2.sp + 12);
cpu2.f = 0x40;
// Clear VRAM
for (let i = 0; i < 320 * 240; i++) {
  mem2[vStart + i * 2] = 0xAA;
  mem2[vStart + i * 2 + 1] = 0xAA;
}

const firstHits2 = new Map();
let steps2 = 0;
const r2 = ex2.runFrom(0x09c95a, 'adl', {
  maxSteps: 50000,
  maxLoopIterations: 500,
  onBlock: (pc) => {
    steps2++;
    if (WATCH.has(pc) && !firstHits2.has(pc)) firstHits2.set(pc, steps2);
  }
});

let fg2 = 0, bg2 = 0;
for (let i = 0; i < 320 * 240; i++) {
  const lo = mem2[vStart + i * 2], hi = mem2[vStart + i * 2 + 1];
  const px = lo | (hi << 8);
  if (px !== SENTINEL_VRAM) { if (px === 0x0000) fg2++; else bg2++; }
}
console.log(`  steps=${r2.steps} term=${r2.termination} lastPc=0x${(r2.lastPc||0).toString(16)}`);
console.log(`  VRAM: fg=${fg2} bg=${bg2}`);
for (const [pc, step] of firstHits2) {
  console.log(`  ${WATCH_NAMES[pc] || pc.toString(16)}: first at block-call #${step}`);
}
