// Deep execution profiler — runs from 0x021000 with interrupt model
// Run: node TI-84_Plus_CE/deep-profile.mjs

import { PRELIFTED_BLOCKS, decodeEmbeddedRom } from './ROM.transpiled.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

function hex(v, w = 6) {
  return '0x' + v.toString(16).padStart(w, '0');
}

const romBytes = decodeEmbeddedRom();
const peripherals = createPeripheralBus({
  pllDelay: 2,
  timerInterrupt: true,
  timerInterval: 200,
  timerMode: 'nmi',
});

const executor = createExecutor(PRELIFTED_BLOCKS, romBytes, { peripherals });
const { cpu } = executor;

cpu.a = 0; cpu.f = 0; cpu.b = 0; cpu.c = 0;
cpu.d = 0; cpu.e = 0; cpu.h = 0; cpu.l = 0;
cpu.sp = 0; cpu._ix = 0; cpu._iy = 0;
cpu.i = 0; cpu.im = 0; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.madl = 1; cpu.halted = false;

const interrupts = [];
const dynamicTargets = [];
const missingBlocks = [];

console.log('=== Deep Execution Profile: 0x021000 (100K steps) ===\n');

const result = executor.runFrom(0x021000, 'adl', {
  maxSteps: 100000,
  maxLoopIterations: 200,
  onInterrupt: (type, fromPc, vector, step) => {
    interrupts.push({ type, fromPc, vector, step });
  },
  onDynamicTarget: (targetPc, mode, fromPc, step) => {
    dynamicTargets.push({ targetPc, mode, fromPc, step });
  },
  onMissingBlock: (pc, mode, step) => {
    missingBlocks.push({ pc, mode, step });
  },
});

console.log(`Steps: ${result.steps}, termination: ${result.termination}`);
console.log(`Last PC: ${hex(result.lastPc)}:${result.lastMode}`);
console.log(`Loops forced: ${result.loopsForced}`);
console.log(`Interrupts: ${interrupts.length}`);
console.log(`Dynamic targets: ${dynamicTargets.length}`);
console.log(`Missing blocks: ${missingBlocks.length}`);

// Hot blocks
const visits = Object.entries(result.blockVisits).sort((a, b) => b[1] - a[1]);
console.log(`\n--- Top 30 Hot Blocks ---`);
for (const [key, count] of visits.slice(0, 30)) {
  const block = PRELIFTED_BLOCKS[key];
  const dasm = block?.instructions?.[0]?.dasm ?? '???';
  console.log(`  ${key}: ${count} visits  ${dasm}`);
}

// Address regions (4KB buckets)
const regions = new Map();
for (const key of Object.keys(result.blockVisits)) {
  const pc = parseInt(key.split(':')[0], 16);
  const region = (pc >> 12) << 12;
  regions.set(region, (regions.get(region) || 0) + 1);
}
const sortedRegions = [...regions.entries()].sort((a, b) => a[0] - b[0]);
console.log(`\n--- Active 4KB Regions (${sortedRegions.length} regions) ---`);
for (const [addr, count] of sortedRegions) {
  console.log(`  ${hex(addr)}: ${count} blocks visited`);
}

// Dynamic targets
if (dynamicTargets.length > 0) {
  const unique = new Set(dynamicTargets.map(d => hex(d.targetPc)));
  console.log(`\n--- Unique Dynamic Targets (${unique.size}) ---`);
  for (const t of [...unique].sort().slice(0, 30)) {
    console.log(`  ${t}`);
  }
  if (unique.size > 30) console.log(`  ... and ${unique.size - 30} more`);
}

// Missing blocks
if (missingBlocks.length > 0) {
  const unique = new Set(missingBlocks.map(m => `${hex(m.pc)}:${m.mode}`));
  console.log(`\n--- Missing Blocks (${unique.size}) ---`);
  for (const m of [...unique].sort()) {
    console.log(`  ${m}`);
  }
}

console.log('\nDone.');
