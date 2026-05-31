#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MEM_SIZE = 0x1000000;
const STACK_RESET_TOP = 0xD1A87E;
const VRAM_START = 0xD40000;
const VRAM_END = 0xD65800;

const mem = new Uint8Array(MEM_SIZE);
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
mem.set(rom.subarray(0, MEM_SIZE), 0);

const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;
const peripherals = createPeripheralBus({ timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

function hex(v, w = 2) { return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0'); }

// ─── Snapshot ranges ───
const SNAPSHOT_RANGES = [
  { name: 'osStateVars',   start: 0xD00000, end: 0xD02000 },  // 8192 bytes
  { name: 'ramArea14',     start: 0xD14000, end: 0xD14200 },  // 512 bytes
  { name: 'ramArea177',    start: 0xD17700, end: 0xD17800 },  // 256 bytes
  { name: 'ramArea026',    start: 0xD026AC, end: 0xD026C0 },  // 20 bytes
  { name: 'ramArea005',    start: 0xD00590, end: 0xD005A0 },  // 16 bytes
];

function snapshotRanges() {
  const snapshots = {};
  for (const range of SNAPSHOT_RANGES) {
    const len = range.end - range.start;
    snapshots[range.name] = {
      start: range.start,
      end: range.end,
      data: new Uint8Array(mem.slice(range.start, range.end)),
    };
  }
  return snapshots;
}

function diffSnapshots(before, after) {
  const changes = [];
  for (const name of Object.keys(before)) {
    const b = before[name];
    const a = after[name];
    for (let i = 0; i < b.data.length; i++) {
      if (b.data[i] !== a.data[i]) {
        changes.push({
          address: b.start + i,
          before: b.data[i],
          after: a.data[i],
          range: name,
        });
      }
    }
  }
  return changes;
}

function snapshotVram() {
  return new Uint8Array(mem.slice(VRAM_START, VRAM_END));
}

function countVramChanges(before, after) {
  let count = 0;
  for (let i = 0; i < before.length; i++) {
    if (before[i] !== after[i]) count++;
  }
  return count;
}

// ─── Stage 1: Cold boot ───
console.log('=== Stage 1: Cold boot ===');
const bootResult = executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
console.log(`  Steps: ${bootResult.steps}, terminated: ${bootResult.termination}, lastPc: ${hex(bootResult.lastPc, 6)}`);
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

// ─── Stage 2: Kernel init ───
console.log('=== Stage 2: Kernel init ===');
cpu.mbase = 0xD0; cpu._iy = 0xD00080;
const kernelResult = executor.runFrom(0x08C331, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });
console.log(`  Steps: ${kernelResult.steps}, terminated: ${kernelResult.termination}, lastPc: ${hex(kernelResult.lastPc, 6)}`);
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

// ─── Stage 3: Post-init ───
console.log('=== Stage 3: Post-init ===');
const postInitResult = executor.runFrom(0x0802B2, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });
console.log(`  Steps: ${postInitResult.steps}, terminated: ${postInitResult.termination}, lastPc: ${hex(postInitResult.lastPc, 6)}`);

console.log('=== Boot complete ===');
console.log(`  Total boot steps: ${bootResult.steps + kernelResult.steps + postInitResult.steps}`);

// ─── Prepare for home init ───
cpu.mbase = 0xD0;
cpu._iy = 0xD00080;
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);  // sentinel return

// ─── Snapshot BEFORE ───
const beforeSnap = snapshotRanges();
const beforeVram = snapshotVram();

// ─── PC tracking ───
const pcHits = new Map();       // pc -> { count, firstStep }
let globalStep = 0;
const MAX_UNIQUE_PCS = 500;
let pcCapReached = false;

function onBlock(pc, mode, meta, steps) {
  globalStep += (steps || 1);
  if (pcHits.has(pc)) {
    pcHits.get(pc).count++;
  } else if (pcHits.size < MAX_UNIQUE_PCS) {
    pcHits.set(pc, { count: 1, firstStep: globalStep });
  } else if (!pcCapReached) {
    pcCapReached = true;
  }
}

// ─── Run home init at 0x08BF22 ───
console.log('\n=== Running home init at 0x08BF22 ===');
const homeResult = executor.runFrom(0x08BF22, 'adl', {
  maxSteps: 500000,
  maxLoopIterations: 2000,
  diHaltBypass: true,
  onBlock,
});
console.log(`  Steps: ${homeResult.steps}`);
console.log(`  Termination: ${homeResult.termination}`);
console.log(`  Last PC: ${hex(homeResult.lastPc, 6)}`);

// ─── Snapshot AFTER ───
const afterSnap = snapshotRanges();
const afterVram = snapshotVram();

// ─── Report RAM changes ───
const changes = diffSnapshots(beforeSnap, afterSnap);
console.log(`\n=== RAM changes (${changes.length} bytes changed) ===`);
for (const c of changes) {
  console.log(`  ${hex(c.address, 6)}: ${hex(c.before)} -> ${hex(c.after)}  [${c.range}]`);
}

// ─── Report unique PCs ───
const sortedPCs = [...pcHits.entries()].sort((a, b) => a[1].firstStep - b[1].firstStep);
console.log(`\n=== Unique PCs (${sortedPCs.length}${pcCapReached ? ' — CAP REACHED' : ''}) ===`);
for (const [pc, info] of sortedPCs) {
  console.log(`  ${hex(pc, 6)}: ${info.count}x (first at step ${info.firstStep})`);
}

// ─── Report VRAM ───
const vramChangedBytes = countVramChanges(beforeVram, afterVram);
console.log(`\n=== VRAM ===`);
console.log(`  Bytes changed: ${vramChangedBytes} / ${VRAM_END - VRAM_START}`);

// ─── Key RAM state for quick reference ───
console.log('\n=== Key RAM values after home init ===');
const keyAddrs = [
  0xD0008C, 0xD0008D, 0xD00092, 0xD00095, 0xD0009D,
  0xD000B3, 0xD000B4, 0xD000BE, 0xD000C7,
  0xD0058C, 0xD0058D, 0xD0058E, 0xD00591, 0xD00592, 0xD00593,
  0xD007E0, 0xD00824,
];
for (const addr of keyAddrs) {
  console.log(`  ${hex(addr, 6)}: ${hex(mem[addr])}`);
}

// ─── JSON summary ───
const jsonSummary = {
  homeInit: {
    steps: homeResult.steps,
    termination: homeResult.termination,
    lastPc: hex(homeResult.lastPc, 6),
  },
  ramChanges: changes.map(c => ({
    address: hex(c.address, 6),
    before: hex(c.before),
    after: hex(c.after),
    range: c.range,
  })),
  uniquePCCount: sortedPCs.length,
  pcCapReached,
  vramBytesChanged: vramChangedBytes,
};
console.log('\n=== JSON Summary ===');
console.log(JSON.stringify(jsonSummary, null, 2));
