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

console.log('Phase 605: IY+0x42 bit 7 bypass probe');
console.log('Tests whether pre-setting bit 7 of IY+0x42 (0xD000C2) prevents the bulk wipe');

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

// ── Save post-paint state ──
const paintD007CA = read24(mem, 0xD007CA);
const paintD0231A = read24(mem, 0xD0231A);
const paintD0243A = read24(mem, 0xD0243A);
const vramAfterPaint = countVramNonWhite(mem);

console.log(`\nPost-paint state:`);
console.log(`  D007CA=${hex(paintD007CA)} D0231A=${hex(paintD0231A)} D0243A=${hex(paintD0243A)} VRAM=${vramAfterPaint}px`);

// ── Phase 3: Set IY+0x42 bit 7 bypass ──
console.log(`\n--- Phase 3: Set IY+0x42 bit 7 and seed keypress ---`);
const iy42Before = mem[0xD000C2];
mem[0xD000C2] |= 0x80;
console.log(`  IY+0x42 (0xD000C2): ${hex(iy42Before, 2)} -> ${hex(mem[0xD000C2], 2)}`);

// Seed keypress: key '2', scan 0x90
mem[0xD0058C] = 0x90;
mem[0xD0058E] = 0x90;
mem[0xD0009F] |= 0x20;
console.log(`  Key seeded: scan=0x90, D0009F bit 5 set`);

// ── Phase 4: Run from cxMain outer loop ──
console.log(`\n--- Phase 4: Run from 0x08C331 with bypass active ---`);

// Set up SP and longjmp anchor (same as probe-603 Phase 3/5)
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, 0x0019b5);
write24(mem, 0xD008E0, cpu.sp);

let cxMainHit = false;
let guardHit = 0;
let wipeHit = 0;
let portGuardHit = 0;

const result = executor.runFrom(0x08C331, 'adl', {
  maxSteps: 500_000,
  maxLoopIterations: 500_000,
  onBlock(pc) {
    const addr = pc & 0xFFFFFF;
    if (addr === 0x0585E9) cxMainHit = true;
    if (addr === 0x0158E0) guardHit++;
    if (addr === 0x0018F8) wipeHit++;
    if (addr === 0x001872) portGuardHit++;
  },
});

const afterD007CA = read24(mem, 0xD007CA);
const afterD0231A = read24(mem, 0xD0231A);
const afterD0243A = read24(mem, 0xD0243A);
const vramAfter = countVramNonWhite(mem);

// ── Phase 5: Report ──
console.log(`\n=== Phase 5: Results ===`);
console.log(`  cxMain (0x0585E9) dispatched: ${cxMainHit}`);
console.log(`  Guard (0x0158E0) hit count: ${guardHit}`);
console.log(`  Bulk wipe (0x0018F8) hit count: ${wipeHit}`);
console.log(`  Port guard (0x001872) hit count: ${portGuardHit}`);
console.log(`  D007CA: ${hex(paintD007CA)} -> ${hex(afterD007CA)}`);
console.log(`  D0231A: ${hex(paintD0231A)} -> ${hex(afterD0231A)}`);
console.log(`  D0243A: ${hex(paintD0243A)} -> ${hex(afterD0243A)}`);
console.log(`  VRAM: ${vramAfterPaint}px -> ${vramAfter}px`);
console.log(`  Steps: ${result.steps}`);
console.log(`  Halt PC: ${hex(result.lastPc)}`);

console.log('');
if (wipeHit === 0) {
  console.log('BYPASS RESULT: WIPE PREVENTED');
} else {
  console.log('BYPASS RESULT: WIPE STILL OCCURRED');
}
