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

console.log('Phase 599 wipe-tracker probe');
console.log('Tracking when D0231A, D0243A, D007CA transition to zero during character keypress');

// ── Phase 0: Cold boot (exact copy from probe-598) ──
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

const beforeD0231A = read24(mem, 0xD0231A);
const beforeD0243A = read24(mem, 0xD0243A);
const beforeD007CA = read24(mem, 0xD007CA);
const vramBefore = countVramNonWhite(mem);

console.log(`Pre-key state: D0231A=${hex(beforeD0231A)} D0243A=${hex(beforeD0243A)} D007CA=${hex(beforeD007CA)} VRAM=${vramBefore}px`);

// ── Phase 3: Seed key for outer loop ──
mem[0xD0058C] = 0x90;
mem[0xD0058E] = 0x90;
mem[0xD0009F] |= 0x20;

// Re-arm longjmp anchor
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, 0x0019b5);
write24(mem, 0xD008E0, cpu.sp);

// ── Phase 4: Outer loop with wipe tracking ──
const maxSteps = 500_000;

// Wipe transition tracking
let stepCounter = 0;
let prevD0231A = beforeD0231A;
let prevD0243A = beforeD0243A;
let prevD007CA = beforeD007CA;
const wipePoints = [];

// VRAM sampling (every 50,000 steps)
const vramSamples = [];
let nextVramSample = 50_000;

// Key block hit counts
const KEY_BLOCK_LABELS = {
  0x0585E9: 'cxMain',
  0x08C33D: 'outerLoop_body',
  0x062055: 'unknown_062055',
  0x058241: 'paint',
  0x0019b5: 'halt_0019b5',
  0x0019be: 'wipe_0019be',
};
const keyBlockHits = {};
for (const addr of Object.keys(KEY_BLOCK_LABELS)) {
  keyBlockHits[Number(addr)] = { label: KEY_BLOCK_LABELS[Number(addr)], count: 0, firstStep: null, lastStep: null };
}

const result = executor.runFrom(0x08C331, 'adl', {
  maxSteps,
  maxLoopIterations: 500_000,
  onBlock(pc) {
    const maskedPc = pc & 0xFFFFFF;
    stepCounter++;

    // Track key block hits
    const entry = keyBlockHits[maskedPc];
    if (entry) {
      entry.count++;
      if (entry.firstStep === null) entry.firstStep = stepCounter;
      entry.lastStep = stepCounter;
    }

    // Check for wipe transitions (non-zero -> zero)
    const curD0231A = read24(mem, 0xD0231A);
    const curD0243A = read24(mem, 0xD0243A);
    const curD007CA = read24(mem, 0xD007CA);

    if (prevD0231A !== 0 && curD0231A === 0) {
      wipePoints.push({
        field: 'D0231A',
        step: stepCounter,
        pc: hex(maskedPc),
        prevValue: hex(prevD0231A),
      });
    }
    if (prevD0243A !== 0 && curD0243A === 0) {
      wipePoints.push({
        field: 'D0243A',
        step: stepCounter,
        pc: hex(maskedPc),
        prevValue: hex(prevD0243A),
      });
    }
    if (prevD007CA !== 0 && curD007CA === 0) {
      wipePoints.push({
        field: 'D007CA',
        step: stepCounter,
        pc: hex(maskedPc),
        prevValue: hex(prevD007CA),
      });
    }

    prevD0231A = curD0231A;
    prevD0243A = curD0243A;
    prevD007CA = curD007CA;

    // VRAM sampling every 50,000 steps
    if (stepCounter >= nextVramSample) {
      vramSamples.push({
        step: stepCounter,
        nonWhitePixels: countVramNonWhite(mem),
        D0231A: hex(curD0231A),
        D0243A: hex(curD0243A),
        D007CA: hex(curD007CA),
      });
      nextVramSample += 50_000;
    }
  },
});

const afterD0231A = read24(mem, 0xD0231A);
const afterD0243A = read24(mem, 0xD0243A);
const afterD007CA = read24(mem, 0xD007CA);
const vramAfter = countVramNonWhite(mem);

// Format key block hits for output
const formattedKeyBlockHits = {};
for (const [addr, entry] of Object.entries(keyBlockHits)) {
  formattedKeyBlockHits[hex(Number(addr))] = entry;
}

const report = {
  preKeyState: {
    D0231A: hex(beforeD0231A),
    D0243A: hex(beforeD0243A),
    D007CA: hex(beforeD007CA),
    vramNonWhite: vramBefore,
  },
  postKeyState: {
    D0231A: hex(afterD0231A),
    D0243A: hex(afterD0243A),
    D007CA: hex(afterD007CA),
    vramNonWhite: vramAfter,
  },
  wipePoints,
  vramSamples,
  keyBlockHits: formattedKeyBlockHits,
  execution: {
    terminationReason: result.termination,
    steps: result.steps,
    blocksInstrumented: stepCounter,
    lastPc: hex(result.lastPc),
    hitMaxSteps: result.termination === 'maxSteps',
  },
};

console.log(JSON.stringify(report, null, 2));
