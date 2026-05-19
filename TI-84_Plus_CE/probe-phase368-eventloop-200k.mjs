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
const PHASE4_MAX_STEPS = 200000;
const PHASE4_LOOP_LIMIT = 2000;
const MILESTONE_SIZE = 50000;
const HOT_BLOCK_LIMIT = 20;
const NEW_BLOCK_PREVIEW_LIMIT = 60;
const LCD_BUFFER_START = 0xD40000;
const LCD_BUFFER_SIZE = 320 * 240 * 2;
const LCD_SAMPLE_SIZE = 64;
const LCD_CHANGE_PREVIEW_LIMIT = 16;

function hex(v, w = 6) { return v == null ? 'n/a' : '0x' + (v >>> 0).toString(16).padStart(w, '0'); }

function hexByte(v) {
  return '0x' + ((v ?? 0) & 0xFF).toString(16).padStart(2, '0');
}

function formatHexDump(bytes, baseAddr, rowWidth = 16) {
  const lines = [];
  for (let offset = 0; offset < bytes.length; offset += rowWidth) {
    const chunk = bytes.subarray(offset, offset + rowWidth);
    const body = Array.from(chunk, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
    lines.push(`  ${hex(baseAddr + offset)}: ${body}`);
  }
  return lines;
}

function bucketLabel(bucketIndex) {
  const start = bucketIndex * MILESTONE_SIZE;
  const end = start + MILESTONE_SIZE - 1;
  return `${start.toLocaleString()}-${end.toLocaleString()}`;
}

const mem = new Uint8Array(0x1000000);
mem.set(romBytes);
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const { cpu } = executor;

console.log('=== Phase 368 - 200K Extended Event Loop ===\n');

const allBlocks = new Set();

function trackBlocks(result, label) {
  const before = allBlocks.size;
  if (result.blockVisits) {
    for (const key of Object.keys(result.blockVisits)) allBlocks.add(key);
  }
  const after = allBlocks.size;
  console.log(`${label}: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)} blocks=${after} (+${after - before} new)`);
  if (result.missingBlocks && result.missingBlocks.length > 0) {
    console.log(`  missing: ${result.missingBlocks.slice(0, 10).join(', ')}`);
  }
  if (result.loopsForced > 0) console.log(`  loops forced: ${result.loopsForced}`);
}

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

const lcdBefore = mem.slice(LCD_BUFFER_START, LCD_BUFFER_START + LCD_BUFFER_SIZE);

// Phase 4: 200K extended event loop
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.f = 0x40;
cpu._ix = 0xD1A860;
cpu._iy = 0xD00080;
cpu.sp = STACK_RESET_TOP - 12;
mem.fill(0xFF, cpu.sp, cpu.sp + 12);

let blockCounter = 0;
const firstSeen = new Map();

console.log(`Phase 4 entry: PC=${hex(EVENT_LOOP_ENTRY)}\n`);

const r4 = executor.runFrom(0x003A73, 'adl', {
  maxSteps: 200000,
  maxLoopIterations: 2000,
  onBlock: (pc, mode) => {
    const key = `${pc.toString(16).padStart(6, '0')}:${mode}`;
    if (!firstSeen.has(key)) firstSeen.set(key, blockCounter);
    blockCounter++;
  },
});
trackBlocks(r4, 'Phase 4 (200K event loop)');

const phase4BlockEntries = Object.entries(r4.blockVisits ?? {}).sort((a, b) => {
  if (b[1] !== a[1]) return b[1] - a[1];
  return a[0].localeCompare(b[0]);
});
const phase4Blocks = phase4BlockEntries.map(([key]) => key);
const newInPhase4VsColdBoot = phase4Blocks.filter((key) => !coldBootBlocks.has(key));
const newAfter50k = phase4Blocks.filter((key) => (firstSeen.get(key) ?? Infinity) >= MILESTONE_SIZE);
const newVsColdBootAfter50k = newInPhase4VsColdBoot.filter((key) => (firstSeen.get(key) ?? Infinity) >= MILESTONE_SIZE);

const milestoneBuckets = new Map();
for (const [key, first] of firstSeen.entries()) {
  const bucket = Math.floor(first / MILESTONE_SIZE);
  if (!milestoneBuckets.has(bucket)) milestoneBuckets.set(bucket, []);
  milestoneBuckets.get(bucket).push({ key, first, coldBootNew: !coldBootBlocks.has(key) });
}

const lcdAfter = mem.subarray(LCD_BUFFER_START, LCD_BUFFER_START + LCD_BUFFER_SIZE);
let lcdChangedBytes = 0;
let lcdNonZeroBefore = 0;
let lcdNonZeroAfter = 0;
const lcdChangedPreview = [];
for (let offset = 0; offset < LCD_BUFFER_SIZE; offset++) {
  const before = lcdBefore[offset];
  const after = lcdAfter[offset];
  if (before !== 0) lcdNonZeroBefore++;
  if (after !== 0) lcdNonZeroAfter++;
  if (before !== after) {
    lcdChangedBytes++;
    if (lcdChangedPreview.length < LCD_CHANGE_PREVIEW_LIMIT) {
      lcdChangedPreview.push({ offset, before, after });
    }
  }
}

const peripheralState = peripherals.getState();
const timerWriteCount = Object.keys(peripheralState.timers?.writes ?? {}).length;
const flashWriteCount = Object.keys(peripheralState.flashController?.writes ?? {}).length;

console.log('\n--- Block Summary ---');
console.log(`Total unique blocks across all phases: ${allBlocks.size}`);
console.log(`Cold-boot unique blocks: ${coldBootBlocks.size}`);
console.log(`Phase 4 unique blocks: ${phase4Blocks.length}`);
console.log(`Phase 4 blocks not seen in cold boot: ${newInPhase4VsColdBoot.length}`);
console.log(`Phase 4 blocks first seen after 50K: ${newAfter50k.length}`);
console.log(`Cold-boot-new Phase 4 blocks first seen after 50K: ${newVsColdBootAfter50k.length}`);
if (newInPhase4VsColdBoot.length > 0) {
  console.log(`New blocks not in cold boot (first ${Math.min(NEW_BLOCK_PREVIEW_LIMIT, newInPhase4VsColdBoot.length)}):`);
  for (const key of newInPhase4VsColdBoot.slice(0, NEW_BLOCK_PREVIEW_LIMIT)) {
    console.log(`  ${key} firstSeen=${firstSeen.get(key)}`);
  }
  if (newInPhase4VsColdBoot.length > NEW_BLOCK_PREVIEW_LIMIT) {
    console.log(`  ... and ${newInPhase4VsColdBoot.length - NEW_BLOCK_PREVIEW_LIMIT} more`);
  }
} else {
  console.log('New blocks not in cold boot: none');
}

console.log(`\n--- Top ${Math.min(HOT_BLOCK_LIMIT, phase4BlockEntries.length)} Hottest Blocks ---`);
if (phase4BlockEntries.length === 0) {
  console.log('  none');
} else {
  for (const [key, visits] of phase4BlockEntries.slice(0, HOT_BLOCK_LIMIT)) {
    const first = firstSeen.get(key);
    const coldBootNew = coldBootBlocks.has(key) ? 'no' : 'yes';
    console.log(`  ${key} visits=${visits} firstSeen=${first} coldBootNew=${coldBootNew}`);
  }
}

console.log('\n--- First-Seen Milestones (50K ranges) ---');
for (const bucket of [...milestoneBuckets.keys()].sort((a, b) => a - b)) {
  const items = milestoneBuckets.get(bucket).sort((a, b) => {
    if (a.first !== b.first) return a.first - b.first;
    return a.key.localeCompare(b.key);
  });
  const coldBootNewCount = items.filter((item) => item.coldBootNew).length;
  console.log(`  ${bucketLabel(bucket)}: ${items.length} block(s), ${coldBootNewCount} not in cold boot`);
  const preview = items.slice(0, 12).map((item) => `${item.key}@${item.first}${item.coldBootNew ? '*' : ''}`);
  console.log(`    ${preview.join(', ')}`);
  if (items.length > 12) console.log(`    ... and ${items.length - 12} more`);
}

console.log('\n--- Peripheral State After 200K Run ---');
console.log(`Keyboard groupSelect: ${hex(peripheralState.keyboardController?.groupSelect ?? 0, 4)}`);
console.log(`PLL: configured=${peripheralState.pll?.configured} locked=${peripheralState.pll?.locked} remainingReads=${peripheralState.pll?.remainingReads} lastWrite=${hex(peripheralState.pll?.lastWrite ?? 0, 2)}`);
console.log(`GPIO: readValue=${hex(peripheralState.gpio?.readValue ?? 0, 2)} lastWrite=${hex(peripheralState.gpio?.lastWrite ?? 0, 2)}`);
console.log(`Flash controller writes: ${flashWriteCount}`);
console.log(`Timer register writes: ${timerWriteCount}`);
console.log(JSON.stringify(peripheralState, null, 2));

console.log('\n--- Missing Blocks ---');
if (r4.missingBlocks && r4.missingBlocks.length > 0) {
  for (const key of r4.missingBlocks) {
    console.log(`  ${key}`);
  }
} else {
  console.log('  none');
}

console.log('\n--- Final CPU State ---');
console.log(`PC=${hex(cpu._pc)} SP=${hex(cpu.sp)} IX=${hex(cpu._ix)} IY=${hex(cpu._iy)}`);
console.log(`A=${hex(cpu.a, 2)} F=${hex(cpu.f, 2)} MBASE=${hex(cpu.mbase, 2)}`);
console.log(`Termination=${r4.termination} lastPc=${hex(r4.lastPc)} lastMode=${r4.lastMode}`);

console.log('\n--- LCD Buffer Check ---');
console.log(`LCD buffer range: ${hex(LCD_BUFFER_START)}-${hex(LCD_BUFFER_START + LCD_BUFFER_SIZE - 1)}`);
console.log(`Changed bytes during Phase 4: ${lcdChangedBytes}`);
console.log(`Non-zero bytes before Phase 4: ${lcdNonZeroBefore}`);
console.log(`Non-zero bytes after Phase 4: ${lcdNonZeroAfter}`);
if (lcdChangedPreview.length > 0) {
  console.log(`First ${lcdChangedPreview.length} changed byte(s):`);
  for (const change of lcdChangedPreview) {
    console.log(`  +${hex(change.offset)} @ ${hex(LCD_BUFFER_START + change.offset)}: ${hexByte(change.before)} -> ${hexByte(change.after)}`);
  }
} else {
  console.log('No LCD buffer byte changes detected across the sampled 153600-byte frame buffer.');
}

console.log(`\nLCD sample before Phase 4 (${LCD_SAMPLE_SIZE} bytes):`);
for (const line of formatHexDump(lcdBefore.subarray(0, LCD_SAMPLE_SIZE), LCD_BUFFER_START)) {
  console.log(line);
}

console.log(`\nLCD sample after Phase 4 (${LCD_SAMPLE_SIZE} bytes):`);
for (const line of formatHexDump(lcdAfter.subarray(0, LCD_SAMPLE_SIZE), LCD_BUFFER_START)) {
  console.log(line);
}
