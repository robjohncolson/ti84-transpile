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

// ── Load ROM + transpiled blocks ──

const mem = new Uint8Array(MEM_SIZE);
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
mem.set(rom.subarray(0, MEM_SIZE), 0);

const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;
const peripherals = createPeripheralBus({ timerInterrupt: true, timerInterval: 500 });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

function hex(v, w = 2) {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

// ── 3-stage boot ──

console.log('=== Stage 1: Cold boot ===');
const bootResult = executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
console.log(`  steps=${bootResult.steps} term=${bootResult.termination}`);
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

console.log('=== Stage 2: Kernel init ===');
cpu.mbase = 0xD0;
cpu._iy = 0xD00080;
const kernelResult = executor.runFrom(0x08C331, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });
console.log(`  steps=${kernelResult.steps} term=${kernelResult.termination}`);
cpu.mbase = 0xD0;
cpu._iy = 0xD00080;
cpu._hl = 0;
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

console.log('=== Stage 3: Post-init ===');
const postInitResult = executor.runFrom(0x0802B2, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });
console.log(`  steps=${postInitResult.steps} term=${postInitResult.termination}`);

// ── State setup ──

console.log('\n=== Setting state variables ===');

// Key injection
mem[0xD00587] = 0x09;       // ENTER key scan code
mem[0xD00080] |= 0x08;      // bit 3 = key available

// Mode variables
mem[0xD14091] = 1;           // key processing enable gate
mem[0xD00824] = 0x48;        // mode = 'H' (home screen)
mem[0xD007E0] = 0x48;        // companion mode = 'H'

// Display state
mem[0xD000B4] |= 0x01;      // bit 0 enables display path at 0x02FDD8
mem[0xD000C6] |= 0x01;      // bit 0 enables CALL NZ 0x030078

// OS state
mem[0xD177BA] = 0x7F;
mem[0xD177B7] = 0x00;
mem[0xD00088] |= 0x08;      // bit 3

// CPU state
cpu.mbase = 0xD0;
cpu._iy = 0xD00080;
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;

// Stack with return address pointing back to event loop top
cpu.sp = STACK_RESET_TOP - 3;
mem[cpu.sp]     = 0xBE;      // low byte of 0x02FDBE
mem[cpu.sp + 1] = 0xFD;      // mid byte
mem[cpu.sp + 2] = 0x02;      // high byte

console.log(`  D00587=${hex(mem[0xD00587])} D00080=${hex(mem[0xD00080])} D00824=${hex(mem[0xD00824])}`);
console.log(`  D007E0=${hex(mem[0xD007E0])} D14091=${hex(mem[0xD14091])}`);

// ── Tracking ──

const TRACKED_PCS = [
  0x02FDBE, 0x02FE88, 0x02FDE5, 0x02FE22,
  0x03FA09, 0x02FDD8, 0x02FE89, 0x02FFAE,
  0x02FFED, 0x030078, 0x030300, 0x040D11,
  0x0059C6,
];

const hitCounts = new Map();
const firstHits = new Map();   // PC -> array of { step, hitNum } (first 10)
for (const pc of TRACKED_PCS) {
  hitCounts.set(pc, 0);
  firstHits.set(pc, []);
}

// RET-point stack restoration addresses
const RET_POINTS = new Set([0x02FE88, 0x02FDE5, 0x02FE22]);

let secondKeyInjected = false;

function onBlock(pc, mode, meta, steps) {
  const addr = pc & 0xFFFFFF;

  if (!hitCounts.has(addr)) return;

  const count = hitCounts.get(addr) + 1;
  hitCounts.set(addr, count);

  // Log first 10 hits
  const log = firstHits.get(addr);
  if (log.length < 10) {
    log.push({ step: steps, hitNum: count });
  }

  // Restore return address at all three RET points
  if (RET_POINTS.has(addr)) {
    mem[cpu.sp]     = 0xBE;
    mem[cpu.sp + 1] = 0xFD;
    mem[cpu.sp + 2] = 0x02;
  }

  // Key processor: inject second key on hit #2+
  if (addr === 0x03FA09 && count >= 2 && !secondKeyInjected && mem[0xD00587] === 0x00) {
    secondKeyInjected = true;
    mem[0xD00587] = 0x31;    // key "1" scan code
    mem[0xD00080] |= 0x08;   // key available flag
    console.log(`  [step ${steps}] Injected second key (0x31) at 0x03FA09 hit #${count}`);
  }
}

// ── Run event loop ──

console.log('\n=== Running event loop at 0x02FDBE ===');
const vramBefore = mem.slice(VRAM_START, VRAM_END);

const result = executor.runFrom(0x02FDBE, 'adl', {
  maxSteps: 500000,
  maxLoopIterations: 50000,
  diHaltBypass: true,
  onBlock,
});

console.log(`  steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc, 6)}`);

// ── VRAM diff ──

function countChangedBytes(before, start, end) {
  let changed = 0;
  for (let i = 0; i < end - start; i++) {
    if (before[i] !== mem[start + i]) changed++;
  }
  return changed;
}

const vramChanged = countChangedBytes(vramBefore, VRAM_START, VRAM_END);

// ── Report ──

console.log('\n=== Hit counts ===');
for (const pc of TRACKED_PCS) {
  const count = hitCounts.get(pc);
  const label = hex(pc, 6);
  console.log(`  ${label}: ${count}`);
  const log = firstHits.get(pc);
  if (log.length > 0) {
    for (const entry of log) {
      console.log(`    hit #${entry.hitNum} at step ${entry.step}`);
    }
  }
}

console.log(`\nVRAM bytes changed: ${vramChanged}`);

// Final state JSON
const hitCountsObj = {};
for (const pc of TRACKED_PCS) {
  hitCountsObj[hex(pc, 6)] = hitCounts.get(pc);
}

console.log('\n=== JSON Report ===');
console.log(JSON.stringify({
  hitCounts: hitCountsObj,
  finalState: {
    D00587: hex(mem[0xD00587]),
    D00080: hex(mem[0xD00080]),
    D141B5: hex(mem[0xD141B5]),
    D00824: hex(mem[0xD00824]),
    D007E0: hex(mem[0xD007E0]),
    D14091: hex(mem[0xD14091]),
  },
  vramBytesChanged: vramChanged,
  terminationReason: result?.reason || result?.termination || (cpu.halted ? 'halted' : 'unknown'),
}, null, 2));
