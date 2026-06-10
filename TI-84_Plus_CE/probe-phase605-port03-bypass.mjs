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

console.log('Phase 605: Port 0x03 bypass probe');
console.log('Tests whether forcing port 0x03 bit 4 (0x10) prevents the bulk wipe at 0x0018F8');
console.log('The guard at 0x001872 does IN0 A,(port 0x03) and tests bit 4');

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

// Save post-paint state
const paintD007CA = read24(mem, 0xD007CA);
const paintD0231A = read24(mem, 0xD0231A);
const paintD0243A = read24(mem, 0xD0243A);
const vramAfterPaint = countVramNonWhite(mem);

console.log(`\nPost-paint state:`);
console.log(`  D0231A=${hex(paintD0231A)} D0243A=${hex(paintD0243A)} D007CA=${hex(paintD007CA)} VRAM=${vramAfterPaint}px`);

// ── Phase 3: Intercept port 0x03 reads ──
// The default GPIO read value is 0xEE (bit 4 = 0). Force bit 4 set so
// the guard at 0x001872 sees it and skips the wipe path.
// peripherals.register() replaces the handler for a port, so re-registering
// port 0x03 after boot overrides createGpioHandler.
let port03ReadCount = 0;
const PORT03_FORCED_VALUE = 0xFE; // 0xEE | 0x10 — bit 4 forced set
peripherals.register(0x03, {
  read() {
    port03ReadCount++;
    return PORT03_FORCED_VALUE;
  },
  write(port, value) {
    // preserve write behavior (no-op in practice)
  },
});

console.log(`\nPort 0x03 handler overridden: reads now return ${hex(PORT03_FORCED_VALUE, 2)} (bit 4 forced set)`);

// ── Phase 4: Seed keypress + SP/longjmp ──
console.log(`\n--- Phase 4: First keypress with port 0x03 bypass (key '2', scan 0x90) ---`);
mem[0xD0058C] = 0x90;
mem[0xD0058E] = 0x90;
mem[0xD0009F] |= 0x20;

cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, 0x0019b5);
write24(mem, 0xD008E0, cpu.sp);

// ── Phase 5: Run from 0x08C331, tracking key addresses ──
let cxMainHit = false;
let hit001872 = 0;
let hit0018F8 = 0;
let hit0158E0 = 0;
let hit0585E9 = 0;

const result = executor.runFrom(0x08C331, 'adl', {
  maxSteps: 500_000,
  maxLoopIterations: 500_000,
  onBlock(pc) {
    const addr = pc & 0xFFFFFF;
    if (addr === 0x0585E9) { cxMainHit = true; hit0585E9++; }
    if (addr === 0x001872) hit001872++;
    if (addr === 0x0018F8) hit0018F8++;
    if (addr === 0x0158E0) hit0158E0++;
  },
});

const afterD007CA = read24(mem, 0xD007CA);
const afterD0231A = read24(mem, 0xD0231A);
const afterD0243A = read24(mem, 0xD0243A);
const vramAfter = countVramNonWhite(mem);

// ── Phase 6: Report ──
console.log(`\n=== Phase 6: Results ===`);
console.log(`  cxMain (0x0585E9) dispatched: ${cxMainHit} (${hit0585E9} hits)`);
console.log(`  0x001872 (port 0x03 guard): ${hit001872} hits`);
console.log(`  0x0018F8 (bulk wipe entry): ${hit0018F8} hits`);
console.log(`  0x0158E0 (IY+0x42 guard):   ${hit0158E0} hits`);
console.log(`  Port 0x03 reads intercepted: ${port03ReadCount}`);
console.log(`  D007CA: paint=${hex(paintD007CA)} after=${hex(afterD007CA)} (${afterD007CA === paintD007CA ? 'PRESERVED' : 'CHANGED'})`);
console.log(`  D0231A: paint=${hex(paintD0231A)} after=${hex(afterD0231A)}`);
console.log(`  D0243A: paint=${hex(paintD0243A)} after=${hex(afterD0243A)}`);
console.log(`  VRAM: paint=${vramAfterPaint}px after=${vramAfter}px`);
console.log(`  Steps: ${result.steps}, lastPc: ${hex(result.lastPc)}`);
console.log(`  Termination: ${result.termination}`);

console.log(`\n=== ANSWER ===`);
if (hit0018F8 === 0) {
  console.log(`BYPASS RESULT: PORT 0x03 WIPE PREVENTED`);
  console.log(`The port 0x03 bit 4 guard at 0x001872 successfully blocked entry to the bulk wipe at 0x0018F8.`);
} else {
  console.log(`BYPASS RESULT: PORT 0x03 WIPE STILL OCCURRED`);
  console.log(`The bulk wipe at 0x0018F8 fired ${hit0018F8} time(s) despite port 0x03 bit 4 being forced set.`);
  if (hit001872 === 0) {
    console.log(`Note: 0x001872 was never reached — the wipe may enter through a different path.`);
  }
}
if (vramAfter > vramAfterPaint * 0.5) {
  console.log(`VRAM substantially preserved (${vramAfter}px vs paint ${vramAfterPaint}px).`);
} else {
  console.log(`VRAM degraded significantly (${vramAfter}px vs paint ${vramAfterPaint}px).`);
}
