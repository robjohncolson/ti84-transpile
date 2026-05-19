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
const EVENT_LOOP_ENTRY = 0x003A73;
const PHASE4_MAX_STEPS = 500000;
const PHASE4_LOOP_LIMIT = 10;
const HOT_BLOCK_LIMIT = 20;
const NEW_BLOCK_PREVIEW_LIMIT = 40;
const MISSING_PREVIEW_LIMIT = 20;
const POST_SCAN_TARGETS = [
  0x001713,
  0x001933,
  0x001853,
  0x000721,
];

function hex(v, w = 6) {
  return v == null ? 'n/a' : '0x' + (v >>> 0).toString(16).padStart(w, '0');
}

function sortedBlockEntries(result) {
  return Object.entries(result.blockVisits ?? {}).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
}

function matchingBlockKeys(result, addr) {
  const prefix = addr.toString(16).padStart(6, '0') + ':';
  return Object.keys(result.blockVisits ?? {}).filter((key) => key.startsWith(prefix));
}

function visitCountForAddress(result, addr) {
  let total = 0;
  for (const key of matchingBlockKeys(result, addr)) {
    total += result.blockVisits[key] ?? 0;
  }
  return total;
}

const mem = new Uint8Array(0x1000000);
mem.set(romBytes);

const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const { cpu } = executor;

console.log('=== Phase 369 - Post-Scan Event Loop Probe ===\n');

const allBlocks = new Set();
const runs = [];

function trackBlocks(result, label) {
  const before = allBlocks.size;
  if (result.blockVisits) {
    for (const key of Object.keys(result.blockVisits)) allBlocks.add(key);
  }
  const after = allBlocks.size;
  console.log(`${label}: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)} blocks=${after} (+${after - before} new)`);
  if (result.missingBlocks && result.missingBlocks.length > 0) {
    const preview = result.missingBlocks.slice(0, 10).join(', ');
    const extra = result.missingBlocks.length > 10 ? ` (+${result.missingBlocks.length - 10} more)` : '';
    console.log(`  missing: ${preview}${extra}`);
  }
  if (result.loopsForced > 0) {
    console.log(`  loops forced: ${result.loopsForced}`);
  }
}

// Phase 1: Z80 cold boot
const r1 = executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
runs.push({ label: 'Phase 1 (Z80 cold boot)', result: r1 });
trackBlocks(r1, 'Phase 1 (Z80 cold boot)');

cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

// Phase 2: Kernel init
const r2 = executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
runs.push({ label: 'Phase 2 (Kernel init)', result: r2 });
trackBlocks(r2, 'Phase 2 (Kernel init)');

cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

// Phase 3: Post-init
const r3 = executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
runs.push({ label: 'Phase 3 (Post-init)', result: r3 });
trackBlocks(r3, 'Phase 3 (Post-init)');

const coldBootBlocks = new Set(allBlocks);
console.log(`\nAfter cold boot: ${coldBootBlocks.size} unique blocks total\n`);

// Phase 4: Event loop with a tight loop cap so _GetCSC exits quickly
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.f = 0x40;
cpu._ix = 0xD1A860;
cpu._iy = 0xD00080;
cpu.sp = STACK_RESET_TOP - 12;
mem.fill(0xFF, cpu.sp, cpu.sp + 12);

console.log(`Phase 4 entry: PC=${hex(EVENT_LOOP_ENTRY)} maxSteps=${PHASE4_MAX_STEPS} maxLoopIterations=${PHASE4_LOOP_LIMIT}\n`);

const r4 = executor.runFrom(EVENT_LOOP_ENTRY, 'adl', {
  maxSteps: PHASE4_MAX_STEPS,
  maxLoopIterations: PHASE4_LOOP_LIMIT,
});
runs.push({ label: 'Phase 4 (500K event loop)', result: r4 });
trackBlocks(r4, 'Phase 4 (500K event loop)');

const phase4Entries = sortedBlockEntries(r4);
const phase4Blocks = phase4Entries.map(([key]) => key);
const newInPhase4 = phase4Blocks.filter((key) => !coldBootBlocks.has(key));
const missingTerminations = runs.filter((entry) => entry.result.termination === 'missing_block');

console.log('\n--- Post-Scan Target Coverage ---');
for (const addr of POST_SCAN_TARGETS) {
  const matchingKeys = matchingBlockKeys(r4, addr);
  const visits = visitCountForAddress(r4, addr);
  console.log(`  ${hex(addr)} visited=${visits > 0 ? 'yes' : 'no'} visits=${visits}${matchingKeys.length > 0 ? ` keys=${matchingKeys.join(', ')}` : ''}`);
}

console.log('\n--- Summary ---');
console.log(`Total unique blocks across all phases: ${allBlocks.size}`);
console.log(`Cold-boot unique blocks: ${coldBootBlocks.size}`);
console.log(`Phase 4 unique blocks: ${phase4Blocks.length}`);
console.log(`New blocks not in cold boot: ${newInPhase4.length}`);
if (newInPhase4.length > 0) {
  console.log(`New blocks not in cold boot (first ${Math.min(NEW_BLOCK_PREVIEW_LIMIT, newInPhase4.length)}):`);
  for (const key of newInPhase4.slice(0, NEW_BLOCK_PREVIEW_LIMIT)) {
    console.log(`  ${key}`);
  }
  if (newInPhase4.length > NEW_BLOCK_PREVIEW_LIMIT) {
    console.log(`  ... and ${newInPhase4.length - NEW_BLOCK_PREVIEW_LIMIT} more`);
  }
} else {
  console.log('New blocks not in cold boot: none');
}

console.log('\n--- Missing-Block Terminations ---');
if (missingTerminations.length === 0) {
  console.log('  none');
} else {
  for (const entry of missingTerminations) {
    console.log(`  ${entry.label}: lastPc=${hex(entry.result.lastPc)} missingBlocks=${entry.result.missingBlocks?.length ?? 0}`);
  }
}

console.log('\n--- Phase 4 Missing Blocks ---');
if (r4.missingBlocks && r4.missingBlocks.length > 0) {
  for (const key of r4.missingBlocks.slice(0, MISSING_PREVIEW_LIMIT)) {
    console.log(`  ${key}`);
  }
  if (r4.missingBlocks.length > MISSING_PREVIEW_LIMIT) {
    console.log(`  ... and ${r4.missingBlocks.length - MISSING_PREVIEW_LIMIT} more`);
  }
} else {
  console.log('  none');
}

console.log('\n--- Final CPU State ---');
console.log(`PC=${hex(cpu.pc)} SP=${hex(cpu.sp)} IX=${hex(cpu._ix)} IY=${hex(cpu._iy)}`);
console.log(`BC=${hex(cpu.bc)} DE=${hex(cpu.de)} HL=${hex(cpu.hl)}`);
console.log(`A=${hex(cpu.a, 2)} F=${hex(cpu.f, 2)} MBASE=${hex(cpu.mbase, 2)} halted=${cpu.halted}`);
console.log(`Termination=${r4.termination} lastPc=${hex(r4.lastPc)} lastMode=${r4.lastMode}`);

console.log(`\n--- Top ${Math.min(HOT_BLOCK_LIMIT, phase4Entries.length)} Hottest Blocks ---`);
if (phase4Entries.length === 0) {
  console.log('  none');
} else {
  for (const [key, visits] of phase4Entries.slice(0, HOT_BLOCK_LIMIT)) {
    console.log(`  ${key} : ${visits} visits`);
  }
}
