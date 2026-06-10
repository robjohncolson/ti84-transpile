import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HALT_IDLE = 0x0019b5;
const REAL_INIT = 0x09dd62;
const PAINT = 0x058241;
const OUTER_LOOP = 0x08c331;
const CX_MAIN = 0x0585e9;
const BULK_WIPE = 0x0018f8;

function write24(mem, a, v) {
  mem[a] = v & 0xFF;
  mem[a + 1] = (v >> 8) & 0xFF;
  mem[a + 2] = (v >> 16) & 0xFF;
}

function hex(value, width = 6) {
  return '0x' + (value >>> 0).toString(16).padStart(width, '0');
}

function countVRAM(mem) {
  const base = 0xD40000;
  let count = 0;
  for (let i = 0; i < 320 * 240; i++) {
    const a = base + i * 2;
    const word = mem[a] | (mem[a + 1] << 8);
    if (word !== 0xFFFF) count++;
  }
  return count;
}

function pressKey(mem, scanCode) {
  mem[0xd0058c] = scanCode;
  mem[0xd0058e] = scanCode;
  mem[0xd0009f] = mem[0xd0009f] | 0x20;
  mem[0xd00080] = mem[0xd00080] | 0x08;
}

// ========== Load ROM + transpiled blocks ==========
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes.subarray(0, MEM_SIZE));
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('phase611: VRAM clear trace during key1 processing');

// ========== Cold boot (copied from probe-610) ==========
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

// ========== Init ==========
peripherals.setTimerEnabled(false);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
const launchSp = 0xD1A87E - 24;
cpu.sp = launchSp;
write24(mem, launchSp, 0x0019be);
write24(mem, 0xD008E0, launchSp);
executor.runFrom(REAL_INIT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });
console.log('phase611: init done');

// ========== Paint ==========
peripherals.setTimerEnabled(true);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, HALT_IDLE);
executor.runFrom(PAINT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });

const vramAfterPaint = countVRAM(mem);
console.log('phase611: paint done vram=' + vramAfterPaint + 'px');

// ========== Key 1: '2' / 0x90 with VRAM monitoring ==========
console.log('\nphase611: === Key 1: key=2 (scan=0x90) with VRAM tracing ===');

pressKey(mem, 0x90);

cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, HALT_IDLE);
write24(mem, 0xD008E0, cpu.sp);

// Tracking state
let blockCount = 0;
let vramPeak = 0;
let vramPeakStep = 0;
const bulkWipeHits = [];
const vramSamples = [];
let prevSampleCount = -1;
let lastNonZeroStep = -1;
let firstZeroStep = -1;

const key1Result = executor.runFrom(OUTER_LOOP, 'adl', {
  maxSteps: 350_000,
  maxLoopIterations: 350_000,
  onBlock(pc) {
    blockCount++;
    const maskedPC = pc & 0xFFFFFF;

    // Track bulk wipe entry
    if (maskedPC === BULK_WIPE) {
      bulkWipeHits.push(blockCount);
    }

    // Sample VRAM every 1000 blocks
    if (blockCount % 1000 === 0) {
      const count = countVRAM(mem);

      // Track peak
      if (count > vramPeak) {
        vramPeak = count;
        vramPeakStep = blockCount;
      }

      // Track zero transition
      if (count > 0) {
        lastNonZeroStep = blockCount;
      }
      if (count === 0 && firstZeroStep === -1 && lastNonZeroStep > 0) {
        firstZeroStep = blockCount;
      }

      // Only record samples where count changed significantly
      const delta = prevSampleCount === -1 ? count : Math.abs(count - prevSampleCount);
      if (delta > 10 || prevSampleCount === -1) {
        vramSamples.push({ step: blockCount, count, pc: maskedPC });
      }
      prevSampleCount = count;
    }
  },
});

// Final VRAM check
const finalVram = countVRAM(mem);
const key1Steps = key1Result.steps ?? 'unknown';
const key1HaltPC = key1Result.lastPc & 0xFFFFFF;

// ========== Timeline ==========
console.log('\nphase611: VRAM timeline (samples where count changed by >10):');
for (const s of vramSamples) {
  console.log('  step ~' + s.step + ': ' + s.count + 'px (PC=' + hex(s.pc) + ')');
}

console.log('\nphase611: final vram=' + finalVram + 'px at step ' + key1Steps + ' lastPC=' + hex(key1HaltPC));

// ========== Summary ==========
console.log('\n' + '='.repeat(60));
console.log('phase611: VRAM peak=' + vramPeak + 'px at step ~' + vramPeakStep);
if (firstZeroStep > 0) {
  console.log('phase611: VRAM zeroed between steps ~' + lastNonZeroStep + ' and ~' + firstZeroStep);
} else if (finalVram === 0) {
  console.log('phase611: VRAM zeroed but transition not captured in samples (was already 0 at first sample or dropped between samples)');
} else {
  console.log('phase611: VRAM never fully zeroed (final=' + finalVram + 'px)');
}
console.log('phase611: 0x0018F8 hits: [' + bulkWipeHits.join(', ') + ']');
console.log('phase611: done');
