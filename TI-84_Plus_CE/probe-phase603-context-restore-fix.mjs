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

console.log('Phase 603: Context-restore fix probe');
console.log('Tests whether manually restoring D007CA after bulk wipe enables second keypress dispatch');

// ── Phase 0: Cold boot (exact copy from probe-599) ──
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

// Save post-paint state for later restoration
const paintD0231A = read24(mem, 0xD0231A);
const paintD0243A = read24(mem, 0xD0243A);
const paintD007CA = read24(mem, 0xD007CA);
const vramAfterPaint = countVramNonWhite(mem);

console.log(`\nPost-paint state:`);
console.log(`  D0231A=${hex(paintD0231A)} D0243A=${hex(paintD0243A)} D007CA=${hex(paintD007CA)} VRAM=${vramAfterPaint}px`);

// ── Phase 3: First keypress ──
console.log(`\n--- Phase 3: First keypress (key '2', scan 0x90) ---`);
mem[0xD0058C] = 0x90;
mem[0xD0058E] = 0x90;
mem[0xD0009F] |= 0x20;

cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, 0x0019b5);
write24(mem, 0xD008E0, cpu.sp);

let cxMainHit1 = false;
const result1 = executor.runFrom(0x08C331, 'adl', {
  maxSteps: 500_000,
  maxLoopIterations: 500_000,
  onBlock(pc) {
    if ((pc & 0xFFFFFF) === 0x0585E9) cxMainHit1 = true;
  },
});

const afterKey1_D007CA = read24(mem, 0xD007CA);
const afterKey1_D0231A = read24(mem, 0xD0231A);
const afterKey1_D0243A = read24(mem, 0xD0243A);
const vramAfterKey1 = countVramNonWhite(mem);

console.log(`  cxMain dispatched: ${cxMainHit1}`);
console.log(`  D007CA after first key: ${hex(afterKey1_D007CA)} (expected 0 = wiped)`);
console.log(`  D0231A=${hex(afterKey1_D0231A)} D0243A=${hex(afterKey1_D0243A)}`);
console.log(`  VRAM non-white: ${vramAfterKey1}px`);
console.log(`  Steps: ${result1.steps}, lastPc: ${hex(result1.lastPc)}`);

// ── Phase 4: Restore context ──
console.log(`\n--- Phase 4: Restore context descriptor ---`);

// Copy 21-byte home screen descriptor from ROM into D007CA
for (let i = 0; i < 21; i++) {
  mem[0xD007CA + i] = romBytes[0x0585D3 + i];
}
mem[0xD0008D] = romBytes[0x0585D3 + 21];

// Restore D0231A and D0243A from post-paint values
write24(mem, 0xD0231A, paintD0231A);
write24(mem, 0xD0243A, paintD0243A);

console.log(`  Restored D007CA: ${hex(read24(mem, 0xD007CA))}`);
console.log(`  Restored D0008D: ${hex(mem[0xD0008D], 2)}`);
console.log(`  Restored D0231A: ${hex(paintD0231A)}`);
console.log(`  Restored D0243A: ${hex(paintD0243A)}`);

// ── Phase 5: Second keypress ──
console.log(`\n--- Phase 5: Second keypress (key '3', scan 0x91) ---`);
mem[0xD0058C] = 0x91;
mem[0xD0058E] = 0x91;
mem[0xD0009F] |= 0x20;

// Re-arm SP and longjmp anchor
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, 0x0019b5);
write24(mem, 0xD008E0, cpu.sp);

let cxMainHit2 = false;
const result2 = executor.runFrom(0x08C331, 'adl', {
  maxSteps: 500_000,
  maxLoopIterations: 500_000,
  onBlock(pc) {
    if ((pc & 0xFFFFFF) === 0x0585E9) cxMainHit2 = true;
  },
});

const afterKey2_D007CA = read24(mem, 0xD007CA);
const afterKey2_D0231A = read24(mem, 0xD0231A);
const afterKey2_D0243A = read24(mem, 0xD0243A);
const vramAfterKey2 = countVramNonWhite(mem);

// ── Phase 6: Report ──
console.log(`\n=== Phase 6: Final Report ===`);
console.log(`  cxMain (0x0585E9) dispatched in second run: ${cxMainHit2}`);
console.log(`  D007CA after second run: ${hex(afterKey2_D007CA)}`);
console.log(`  VRAM non-white pixel count: ${vramAfterKey2}`);
console.log(`  D0231A: ${hex(afterKey2_D0231A)}`);
console.log(`  D0243A: ${hex(afterKey2_D0243A)}`);
console.log(`  Total steps (both runs): ${result1.steps + result2.steps}`);
console.log(`  Second run halt PC: ${hex(result2.lastPc)}`);
console.log(`  Second run termination: ${result2.termination}`);

console.log(`\n=== ANSWER ===`);
if (cxMainHit2) {
  console.log(`YES — restoring D007CA after the bulk wipe DOES enable second keypress dispatch to cxMain.`);
} else {
  console.log(`NO — restoring D007CA after the bulk wipe does NOT enable second keypress dispatch.`);
}
if (vramAfterKey2 > vramAfterKey1) {
  console.log(`VRAM increased from ${vramAfterKey1} to ${vramAfterKey2} — second key produced visible output.`);
} else {
  console.log(`VRAM: ${vramAfterKey1} -> ${vramAfterKey2} — no additional visible output from second key.`);
}
