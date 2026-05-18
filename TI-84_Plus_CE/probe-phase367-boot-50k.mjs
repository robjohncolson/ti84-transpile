#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const STACK_RESET_TOP = 0xD1A87E;

function hex(v, w = 6) {
  return v == null ? 'n/a' : '0x' + (v >>> 0).toString(16).padStart(w, '0');
}

const mem = new Uint8Array(0x1000000);
mem.set(romBytes);

const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const { cpu } = executor;

console.log('=== Phase 367 — 50K Extended Boot Probe ===\n');

// Track all visited blocks across phases
const allBlocks = new Set();

function trackBlocks(result, label) {
  const before = allBlocks.size;
  if (result.blockVisits) {
    for (const key of Object.keys(result.blockVisits)) allBlocks.add(key);
  }
  const after = allBlocks.size;
  const newCount = after - before;
  console.log(`${label}: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)} blocks=${after} (+${newCount} new)`);
  if (result.missingBlocks && result.missingBlocks.length > 0) {
    console.log(`  missing: ${result.missingBlocks.slice(0, 10).join(', ')}${result.missingBlocks.length > 10 ? ` (+${result.missingBlocks.length - 10} more)` : ''}`);
  }
  if (result.loopsForced > 0) {
    console.log(`  loops forced: ${result.loopsForced}`);
  }
}

// ---- Cold boot (same pattern as golden probe) ----

// Phase 1: Z80 cold boot
const r1 = executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
trackBlocks(r1, 'Phase 1 (Z80 cold boot)');

cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

// Phase 2: Kernel init
const r2 = executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
trackBlocks(r2, 'Phase 2 (Kernel init)');

cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

// Phase 3: Post-init
const r3 = executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
trackBlocks(r3, 'Phase 3 (Post-init)');

const coldBootBlocks = new Set(allBlocks);
console.log(`\nAfter coldBoot: ${coldBootBlocks.size} unique blocks total\n`);

// ---- Phase 4: 50K extended event loop ----
// Reset CPU for the extension run
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.f = 0x40;
cpu._ix = 0xD1A860;
cpu._iy = 0xD00080;
cpu.sp = STACK_RESET_TOP - 12;
mem.fill(0xFF, cpu.sp, cpu.sp + 12);

// Use the OS event loop entry point (0x003A73 is a known event loop address)
const entryPc = 0x003A73;
console.log(`Phase 4 entry: PC=${hex(entryPc)}\n`);

const r4 = executor.runFrom(entryPc, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });
trackBlocks(r4, 'Phase 4 (50K event loop)');

// ---- Report ----
console.log('\n--- Summary ---');
console.log(`Total unique blocks across all phases: ${allBlocks.size}`);
console.log(`Blocks after coldBoot: ${coldBootBlocks.size}`);
const newInExtend = [...allBlocks].filter(b => !coldBootBlocks.has(b));
console.log(`New blocks in 50K extension: ${newInExtend.length}`);
if (newInExtend.length > 0) {
  console.log(`New block addresses (first 30):`);
  for (const key of newInExtend.slice(0, 30)) {
    console.log(`  ${key}`);
  }
  if (newInExtend.length > 30) {
    console.log(`  ... and ${newInExtend.length - 30} more`);
  }
}

// Top visited blocks in Phase 4
if (r4.blockVisits) {
  const sorted = Object.entries(r4.blockVisits).sort((a, b) => b[1] - a[1]);
  console.log(`\nTop 15 hottest blocks in Phase 4:`);
  for (const [key, count] of sorted.slice(0, 15)) {
    console.log(`  ${key} : ${count} visits`);
  }
  console.log(`\nTotal unique blocks in Phase 4: ${Object.keys(r4.blockVisits).length}`);
}

console.log(`\nFinal state:`);
console.log(`  PC=${hex(cpu._pc)} SP=${hex(cpu.sp)} IX=${hex(cpu._ix)} IY=${hex(cpu._iy)}`);
console.log(`  A=0x${cpu.a.toString(16).padStart(2, '0')} F=0x${cpu.f.toString(16).padStart(2, '0')} MBASE=0x${cpu.mbase.toString(16).padStart(2, '0')}`);
console.log(`  Termination: ${r4.termination} at ${hex(r4.lastPc)}`);

// Check keyboard scan state
const scanCode = mem[0xD0058E];
const kbFlags = mem[0xD00587];
console.log(`\nKeyboard state: scanCode=0x${scanCode.toString(16).padStart(2, '0')} flags=0x${kbFlags.toString(16).padStart(2, '0')}`);

// Dynamic targets discovered
if (r4.dynamicTargets && r4.dynamicTargets.length > 0) {
  console.log(`\nDynamic targets in Phase 4 (${r4.dynamicTargets.length}):`);
  for (const t of r4.dynamicTargets.slice(0, 20)) {
    console.log(`  ${hex(t)}`);
  }
  if (r4.dynamicTargets.length > 20) {
    console.log(`  ... and ${r4.dynamicTargets.length - 20} more`);
  }
}

console.log('\nDone.');
