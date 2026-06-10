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

// VRAM: 320x240 at 16bpp = 153,600 bytes
const VRAM_START = 0xD40000;
const VRAM_END   = 0xD52C00; // 0xD40000 + 153600

function countVramPixels(mem) {
  let count = 0;
  for (let addr = VRAM_START; addr < VRAM_END; addr += 2) {
    if ((mem[addr] | (mem[addr + 1] << 8)) !== 0) count++;
  }
  return count;
}

// ── Setup ──
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes.subarray(0, MEM_SIZE));
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('Phase 604: VRAM peak-capture probe');
console.log('Tracking non-zero pixel count during key processing to find peak before second wipe');

// ── Phase 0: Cold boot (copied exactly from probe-phase603) ──
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

// ── Phase 4: Track VRAM during outer loop execution ──

const SAMPLE_EVERY_STEPS = 5000;
const samples = [];         // { step, pc, pixelCount }
let stepCounter = 0;
let peakCount = 0;
let peakStep = 0;
let peakPc = 0;
let capturePoint = null;    // last step at peak before decline
let declineDetected = false;

const result = executor.runFrom(0x08C331, 'adl', {
  maxSteps: 500_000,
  maxLoopIterations: 500_000,
  onBlock(pc) {
    const maskedPc = pc & 0xFFFFFF;
    stepCounter++;

    if (stepCounter % SAMPLE_EVERY_STEPS !== 0) return;

    const pixelCount = countVramPixels(mem);
    samples.push({ step: stepCounter, pc: maskedPc, pixelCount });

    // Update peak
    if (pixelCount > peakCount) {
      peakCount = pixelCount;
      peakStep = stepCounter;
      peakPc = maskedPc;
    }

    // Detect decline: pixel count drops by >100 from peak
    if (!declineDetected && peakCount > 0 && (peakCount - pixelCount) > 100) {
      declineDetected = true;
      // capture point is the last step that was at peak
      capturePoint = { step: peakStep, pc: peakPc, pixelCount: peakCount };
    }
  },
});

// ── Output ──

console.log('\n=== VRAM SAMPLES (step, PC, pixel count) ===');
console.log('  Step       PC           Pixels');
for (const s of samples) {
  const marker = s.step === peakStep ? ' <-- PEAK' : '';
  const declMarker = (capturePoint && s.step === capturePoint.step) ? ' <-- CAPTURE POINT' : '';
  console.log(`  ${String(s.step).padStart(7)}  ${hex(s.pc)}  ${String(s.pixelCount).padStart(6)}${marker}${declMarker}`);
}

console.log('\n=== PEAK INFO ===');
console.log(`  Peak step:        ${peakStep}`);
console.log(`  Peak PC:          ${hex(peakPc)}`);
console.log(`  Peak pixel count: ${peakCount}`);
console.log(`  VRAM valid:       ${peakCount > 1000 ? 'YES (>1000 non-zero pixels)' : 'NO (<= 1000 non-zero pixels)'}`);

console.log('\n=== CAPTURE POINT ===');
if (capturePoint) {
  console.log(`  Last step at peak before decline: ${capturePoint.step}`);
  console.log(`  PC at capture point:              ${hex(capturePoint.pc)}`);
  console.log(`  Pixel count at capture:           ${capturePoint.pixelCount}`);
  console.log(`  Decline detected at step:         ${samples.find(s => s.step > capturePoint.step && s.pixelCount < capturePoint.pixelCount - 100)?.step ?? 'unknown'}`);
} else {
  console.log('  No decline detected within 500,000 steps.');
  console.log('  Consider increasing maxSteps or the sample range.');
}

console.log('\n=== EXECUTION SUMMARY ===');
console.log(`  Termination: ${result.termination}`);
console.log(`  Steps run:   ${result.steps}`);
console.log(`  Last PC:     ${hex(result.lastPc)}`);

// ── Write report ──
const reportPath = path.join(__dirname, 'phase604-peak-capture-strategy.md');
const validStr = peakCount > 1000 ? 'YES' : 'NO';
const captureStr = capturePoint
  ? `Step ${capturePoint.step} at PC ${hex(capturePoint.pc)} (${capturePoint.pixelCount} pixels)`
  : 'Not found within 500,000 steps';

const samplesTable = samples.map(s => {
  const tag = s.step === peakStep ? ' ← PEAK' : '';
  return `| ${s.step} | ${hex(s.pc)} | ${s.pixelCount} |${tag}`;
}).join('\n');

const report = `# Phase 604: VRAM Peak-Capture Strategy

## Goal

Find the exact step before the second bulk wipe destroys VRAM, so a future probe
can snapshot the screen state at its peak for analysis or frame-grabbing.

## Configuration

- VRAM region: 0xD40000 – 0xD52C00 (320×240, 16bpp, 153,600 bytes)
- Sample interval: every ${SAMPLE_EVERY_STEPS} steps
- Max steps: 500,000
- Decline threshold: pixel count drops >100 from peak

## Results

### Peak

| Field | Value |
|-------|-------|
| Step | ${peakStep} |
| PC | ${hex(peakPc)} |
| Non-zero pixel count | ${peakCount} |
| VRAM valid (>1000 px) | ${validStr} |

### Capture Point

${captureStr}

## VRAM Sample Table

| Step | PC | Non-zero pixels |
|------|----|----------------|
${samplesTable}

## Execution

- Termination: ${result.termination}
- Steps run: ${result.steps}
- Last PC: ${hex(result.lastPc)}

## Next Steps

${capturePoint
  ? `The capture point is step ${capturePoint.step} (PC ${hex(capturePoint.pc)}).
A follow-up probe should run exactly that many steps from 0x08C331, then snapshot VRAM to a .bin file.`
  : `No decline was detected. Increase maxSteps or check whether the second wipe fires beyond 500,000 steps.`
}
`;

fs.writeFileSync(reportPath, report, 'utf8');
console.log(`\nReport written to: ${reportPath}`);
