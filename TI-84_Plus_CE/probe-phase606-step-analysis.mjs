import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function write24(mem, a, v) {
  mem[a] = v & 0xFF;
  mem[a + 1] = (v >> 8) & 0xFF;
  mem[a + 2] = (v >> 16) & 0xFF;
}

function read24(mem, a) {
  return mem[a] | (mem[a + 1] << 8) | (mem[a + 2] << 16);
}

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function countVramNonWhite(mem) {
  const base = 0xD40000;
  let count = 0;
  for (let i = 0; i < 320 * 240; i++) {
    const a = base + i * 2;
    const word = mem[a] | (mem[a + 1] << 8);
    if (word !== 0xFFFF) count++;
  }
  return count;
}

// ── Constants ──
const CX_MAIN = 0x0585E9;
const WIPE = 0x0018F8;
const HALT_PC = 0x0019B5;
const OUTER_LOOP = 0x08C331;

// ── Load ROM + transpiled blocks ──
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes.subarray(0, MEM_SIZE));
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('Phase 606: Step analysis — key1 vs key2 block instrumentation');

// ── Phase 0: Cold boot (exact copy from probe-605/603) ──
executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = 0xD1A87E - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = 0xD1A87E - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x0802B2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
cpu.sp = 0xD1A87E - 12; mem.fill(0xFF, cpu.sp, cpu.sp + 12);
executor.runFrom(0x0019be, 'adl', { maxSteps: 1_500_000, maxLoopIterations: 100000 });

// ── Phase 1: Launch-init ──
peripherals.setTimerEnabled(false);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
const launchSp = 0xD1A87E - 24;
cpu.sp = launchSp;
write24(mem, launchSp, 0x0019be);
write24(mem, 0xD008E0, launchSp);
executor.runFrom(0x09DD62, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });

// ── Phase 2: Paint ──
peripherals.setTimerEnabled(true);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, HALT_PC);
executor.runFrom(0x058241, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });

const vramAfterPaint = countVramNonWhite(mem);
console.log(`\nPost-paint VRAM: ${vramAfterPaint}px`);

// ── Save FULL snapshot after paint ──
console.log('\n--- Saving full post-paint snapshot ---');

const snapDescriptor = new Uint8Array(21);
for (let i = 0; i < 21; i++) snapDescriptor[i] = mem[0xD007CA + i];
const snapD007CA = read24(mem, 0xD007CA);
const snapD0008D = mem[0xD0008D];
const snapD0231A = read24(mem, 0xD0231A);
const snapD0243A = read24(mem, 0xD0243A);
const snapD02434 = read24(mem, 0xD02434);
const snapD0009F = mem[0xD0009F];
const snapD0058C = mem[0xD0058C];
const snapD0058E = mem[0xD0058E];
const snapIYFlags = new Uint8Array(128);
for (let i = 0; i < 128; i++) snapIYFlags[i] = mem[0xD00080 + i];

console.log(`  D007CA=${hex(snapD007CA)} D0008D=${hex(snapD0008D, 2)}`);
console.log(`  D0231A=${hex(snapD0231A)} D0243A=${hex(snapD0243A)} D02434=${hex(snapD02434)}`);
console.log(`  D0009F=${hex(snapD0009F, 2)} D0058C=${hex(snapD0058C, 2)} D0058E=${hex(snapD0058E, 2)}`);

// ── Restore helper ──
function restoreSnapshot() {
  for (let i = 0; i < 21; i++) mem[0xD007CA + i] = snapDescriptor[i];
  mem[0xD0008D] = snapD0008D;
  write24(mem, 0xD0231A, snapD0231A);
  write24(mem, 0xD0243A, snapD0243A);
  write24(mem, 0xD02434, snapD02434);
  mem[0xD0009F] = snapD0009F;
  mem[0xD0058C] = snapD0058C;
  mem[0xD0058E] = snapD0058E;
  for (let i = 0; i < 128; i++) mem[0xD00080 + i] = snapIYFlags[i];
}

// ── Process a key with full block instrumentation ──
function processKey(label, scanCode) {
  restoreSnapshot();

  // Seed the key
  mem[0xD0058C] = scanCode;
  mem[0xD0058E] = scanCode;
  mem[0xD0009F] |= 0x20;

  // Set up SP and return anchor
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, HALT_PC);
  write24(mem, 0xD008E0, cpu.sp);

  // Block instrumentation
  const blocks = new Set();
  const trace = [];
  const milestones = { cxMain: null, wipe1: null, wipe2: null, halt: null };
  const wipeEvents = [];
  let blockCount = 0;

  const result = executor.runFrom(OUTER_LOOP, 'adl', {
    maxSteps: 500_000,
    maxLoopIterations: 500_000,
    onBlock(pc) {
      const addr = pc & 0xFFFFFF;
      const key = hex(addr);
      blocks.add(key);
      blockCount++;

      // Keep trace manageable — first 250K entries
      if (trace.length < 250000) trace.push(key);

      // Track milestones
      if (addr === CX_MAIN && milestones.cxMain == null) milestones.cxMain = blockCount;
      if (addr === WIPE) {
        wipeEvents.push(blockCount);
        if (milestones.wipe1 == null) milestones.wipe1 = blockCount;
        else if (milestones.wipe2 == null) milestones.wipe2 = blockCount;
      }
      if (addr === HALT_PC && milestones.halt == null) milestones.halt = blockCount;
    },
  });

  const afterVram = countVramNonWhite(mem);
  const afterD007CA = read24(mem, 0xD007CA);

  return {
    label,
    scanCode,
    blocks,
    trace,
    milestones,
    wipeEvents,
    blockCount,
    steps: result.steps,
    lastPc: result.lastPc,
    vram: afterVram,
    d007ca: afterD007CA,
  };
}

// ── Run key1: '2' (0x90) ──
console.log('\n=== Processing key1: \'2\' (0x90) ===');
const key1 = processKey("key1 '2'", 0x90);
console.log(`  cxMain hit: ${key1.milestones.cxMain != null} (block ${key1.milestones.cxMain})`);
console.log(`  wipe1 hit: ${key1.milestones.wipe1 != null} (block ${key1.milestones.wipe1})`);
console.log(`  wipe2 hit: ${key1.milestones.wipe2 != null} (block ${key1.milestones.wipe2})`);
console.log(`  halt hit: ${key1.milestones.halt != null} (block ${key1.milestones.halt})`);
console.log(`  D007CA after: ${hex(key1.d007ca)}`);
console.log(`  VRAM non-white: ${key1.vram}px`);
console.log(`  Steps: ${key1.steps}, blocks visited: ${key1.blockCount}, unique: ${key1.blocks.size}`);

// ── Run key2: '3' (0x91) ──
console.log('\n=== Processing key2: \'3\' (0x91) ===');
const key2 = processKey("key2 '3'", 0x91);
console.log(`  cxMain hit: ${key2.milestones.cxMain != null} (block ${key2.milestones.cxMain})`);
console.log(`  wipe1 hit: ${key2.milestones.wipe1 != null} (block ${key2.milestones.wipe1})`);
console.log(`  wipe2 hit: ${key2.milestones.wipe2 != null} (block ${key2.milestones.wipe2})`);
console.log(`  halt hit: ${key2.milestones.halt != null} (block ${key2.milestones.halt})`);
console.log(`  D007CA after: ${hex(key2.d007ca)}`);
console.log(`  VRAM non-white: ${key2.vram}px`);
console.log(`  Steps: ${key2.steps}, blocks visited: ${key2.blockCount}, unique: ${key2.blocks.size}`);

// ── Comparison ──
console.log('\n========================================');
console.log('=== COMPARISON: key1 vs key2 ===');
console.log('========================================');

const key1Only = new Set([...key1.blocks].filter(b => !key2.blocks.has(b)));
const key2Only = new Set([...key2.blocks].filter(b => !key1.blocks.has(b)));

console.log(`\nKey1-only blocks (${key1Only.size}):`);
console.log([...key1Only].sort().join(', ') || '(none)');

console.log(`\nKey2-only blocks (${key2Only.size}):`);
console.log([...key2Only].sort().join(', ') || '(none)');

// First divergence in trace
function firstDivergence(a, b) {
  const limit = Math.min(a.length, b.length);
  for (let i = 0; i < limit; i++) {
    if (a[i] !== b[i]) return { step: i, key1: a[i], key2: b[i] };
  }
  if (a.length !== b.length) return { step: limit, key1: a[limit] ?? null, key2: b[limit] ?? null };
  return null;
}

const divergence = firstDivergence(key1.trace, key2.trace);
console.log('\nFirst divergence:');
if (divergence) {
  console.log(`  At block ${divergence.step}: key1=${divergence.key1}, key2=${divergence.key2}`);
} else {
  console.log('  No divergence in captured trace');
}

// Milestone timing side-by-side
console.log('\nMilestone timing (block count):');
console.log(`  ${'Milestone'.padEnd(12)} ${'Key1'.padStart(10)} ${'Key2'.padStart(10)} ${'Delta'.padStart(10)}`);
for (const m of ['cxMain', 'wipe1', 'wipe2', 'halt']) {
  const v1 = key1.milestones[m];
  const v2 = key2.milestones[m];
  const s1 = v1 == null ? '-' : String(v1);
  const s2 = v2 == null ? '-' : String(v2);
  const delta = (v1 != null && v2 != null) ? String(v1 - v2) : '-';
  console.log(`  ${m.padEnd(12)} ${s1.padStart(10)} ${s2.padStart(10)} ${delta.padStart(10)}`);
}

console.log(`\nWipe events: key1=${key1.wipeEvents.length}, key2=${key2.wipeEvents.length}`);
if (key1.wipeEvents.length > 0) console.log(`  key1 wipe blocks: ${key1.wipeEvents.join(', ')}`);
if (key2.wipeEvents.length > 0) console.log(`  key2 wipe blocks: ${key2.wipeEvents.join(', ')}`);

// ── Conclusion ──
console.log('\n=== CONCLUSION ===');
if (key1.wipeEvents.length > key2.wipeEvents.length) {
  console.log('Key1 performs more wipe events than key2 — extra display rebuild/render pass.');
} else if (key1Only.size > 0) {
  console.log(`Key1 visits ${key1Only.size} blocks not seen by key2 — inspect key1-only blocks above.`);
} else if (key1.blockCount > key2.blockCount) {
  console.log('Key1 visits more blocks through mostly shared paths — longer iteration in same render/update loop.');
} else {
  console.log('No significant extra key1 path detected by this probe.');
}

// ── Machine-readable report ──
const report = {
  key1: {
    label: key1.label, scan: hex(key1.scanCode, 2), steps: key1.steps,
    blockCount: key1.blockCount, uniqueBlocks: key1.blocks.size,
    milestones: key1.milestones, wipeEvents: key1.wipeEvents,
    vram: key1.vram, d007ca: hex(key1.d007ca), lastPc: hex(key1.lastPc),
  },
  key2: {
    label: key2.label, scan: hex(key2.scanCode, 2), steps: key2.steps,
    blockCount: key2.blockCount, uniqueBlocks: key2.blocks.size,
    milestones: key2.milestones, wipeEvents: key2.wipeEvents,
    vram: key2.vram, d007ca: hex(key2.d007ca), lastPc: hex(key2.lastPc),
  },
  comparison: {
    key1OnlyCount: key1Only.size,
    key2OnlyCount: key2Only.size,
    key1Only: [...key1Only].sort(),
    key2Only: [...key2Only].sort(),
    firstDivergence: divergence,
    wipeTimingMatch: key1.milestones.wipe1 === key2.milestones.wipe1,
  },
};
console.log('\nMachine-readable report:');
console.log(JSON.stringify(report, null, 2));
