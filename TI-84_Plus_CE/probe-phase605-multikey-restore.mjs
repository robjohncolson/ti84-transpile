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

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes.subarray(0, MEM_SIZE));
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('Phase 605: Multi-key restore probe');
console.log('Tests 3 sequential keys (2, 3, +) with full state restore before each');

// ── Phase 0: Cold boot (exact copy from probe-603) ──
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
write24(mem, cpu.sp, 0x0019b5);
executor.runFrom(0x058241, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });

const vramAfterPaint = countVramNonWhite(mem);
console.log(`\nPost-paint VRAM: ${vramAfterPaint}px`);

// ── Save FULL snapshot after paint ──
console.log(`\n--- Saving full post-paint snapshot ---`);

// D007CA (3 bytes) + 21-byte descriptor starting at D007CA
const snapDescriptor = new Uint8Array(21);
for (let i = 0; i < 21; i++) snapDescriptor[i] = mem[0xD007CA + i];
const snapD007CA = read24(mem, 0xD007CA);

// D0008D (1 byte)
const snapD0008D = mem[0xD0008D];

// D0231A, D0243A (3 bytes each)
const snapD0231A = read24(mem, 0xD0231A);
const snapD0243A = read24(mem, 0xD0243A);

// D02434 (3 bytes)
const snapD02434 = read24(mem, 0xD02434);

// D0009F (1 byte)
const snapD0009F = mem[0xD0009F];

// D0058C, D0058E (1 byte each)
const snapD0058C = mem[0xD0058C];
const snapD0058E = mem[0xD0058E];

// D00080-D000FF (128 bytes — IY flag area)
const snapIYFlags = new Uint8Array(128);
for (let i = 0; i < 128; i++) snapIYFlags[i] = mem[0xD00080 + i];

console.log(`  D007CA=${hex(snapD007CA)} D0008D=${hex(snapD0008D, 2)}`);
console.log(`  D0231A=${hex(snapD0231A)} D0243A=${hex(snapD0243A)} D02434=${hex(snapD02434)}`);
console.log(`  D0009F=${hex(snapD0009F, 2)} D0058C=${hex(snapD0058C, 2)} D0058E=${hex(snapD0058E, 2)}`);

// ── Process 3 keys sequentially ──
const keys = [
  { name: "'2'", scan: 0x90 },
  { name: "'3'", scan: 0x91 },
  { name: "'+'", scan: 0x70 },
];

const results = [];

for (let k = 0; k < keys.length; k++) {
  const key = keys[k];
  console.log(`\n=== Key ${k + 1}/3: ${key.name} (scan ${hex(key.scan, 2)}) ===`);

  // (a) Restore ALL saved state from snapshot
  for (let i = 0; i < 21; i++) mem[0xD007CA + i] = snapDescriptor[i];
  mem[0xD0008D] = snapD0008D;
  write24(mem, 0xD0231A, snapD0231A);
  write24(mem, 0xD0243A, snapD0243A);
  write24(mem, 0xD02434, snapD02434);
  mem[0xD0009F] = snapD0009F;
  mem[0xD0058C] = snapD0058C;
  mem[0xD0058E] = snapD0058E;
  for (let i = 0; i < 128; i++) mem[0xD00080 + i] = snapIYFlags[i];

  console.log(`  Restored snapshot: D007CA=${hex(read24(mem, 0xD007CA))}`);

  // (b) Seed the key into D0058C/D0058E and set D0009F bit 5
  mem[0xD0058C] = key.scan;
  mem[0xD0058E] = key.scan;
  mem[0xD0009F] |= 0x20;

  // (c) Set up SP and longjmp anchor (from probe-603 Phase 3/5)
  cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
  cpu._iy = 0xD00080; cpu.mbase = 0xD0;
  if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, 0x0019b5);
  write24(mem, 0xD008E0, cpu.sp);

  // (d) Run from 0x08C331, tracking cxMain and wipe
  let cxMainHit = false;
  let wipeHit = false;
  const result = executor.runFrom(0x08C331, 'adl', {
    maxSteps: 500_000,
    maxLoopIterations: 500_000,
    onBlock(pc) {
      const addr = pc & 0xFFFFFF;
      if (addr === 0x0585E9) cxMainHit = true;
      if (addr === 0x0018F8) wipeHit = true;
    },
  });

  const afterD007CA = read24(mem, 0xD007CA);
  const afterVram = countVramNonWhite(mem);

  // (e) Report
  console.log(`  cxMain (0x0585E9) hit: ${cxMainHit}`);
  console.log(`  wipe (0x0018F8) hit: ${wipeHit}`);
  console.log(`  D007CA after: ${hex(afterD007CA)}`);
  console.log(`  VRAM non-white: ${afterVram}px`);
  console.log(`  Steps: ${result.steps}, halt PC: ${hex(result.lastPc)}`);

  results.push({ key: key.name, scan: key.scan, cxMainHit, wipeHit, d007ca: afterD007CA, vram: afterVram, steps: result.steps, lastPc: result.lastPc });
}

// ── Summary ──
console.log(`\n========================================`);
console.log(`=== SUMMARY: 3-key sequential dispatch ===`);
console.log(`========================================`);

const dispatched = results.filter(r => r.cxMainHit).length;
const wiped = results.filter(r => r.wipeHit).length;

console.log(`Keys dispatched through cxMain: ${dispatched}/3`);
console.log(`Wipe triggered: ${wiped}/3 times`);
console.log(``);

for (const r of results) {
  console.log(`  ${r.key} (${hex(r.scan, 2)}): cxMain=${r.cxMainHit}, wipe=${r.wipeHit}, D007CA=${hex(r.d007ca)}, VRAM=${r.vram}px, steps=${r.steps}, haltPC=${hex(r.lastPc)}`);
}

const vramValues = results.map(r => r.vram);
const vramChanged = vramValues.some((v, i) => i > 0 && v !== vramValues[i - 1]);
console.log(`\nVRAM changed between keys: ${vramChanged}`);
if (vramChanged) {
  console.log(`  VRAM progression: ${vramValues.join(' -> ')}px`);
}

console.log(`\n=== ANSWER ===`);
if (dispatched === 3) {
  console.log(`ALL 3 keys dispatched through cxMain with full state restore.`);
} else {
  console.log(`${dispatched}/3 keys dispatched through cxMain. State restore may be incomplete.`);
}
