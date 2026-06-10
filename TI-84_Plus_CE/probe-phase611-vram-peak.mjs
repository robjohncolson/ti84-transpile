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

function write24(mem, a, v) {
  mem[a] = v & 0xFF;
  mem[a + 1] = (v >> 8) & 0xFF;
  mem[a + 2] = (v >> 16) & 0xFF;
}

function read24(mem, a) {
  return mem[a] | (mem[a + 1] << 8) | (mem[a + 2] << 16);
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

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes.subarray(0, MEM_SIZE));
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('phase611: VRAM peak probe -- sample VRAM during each key dispatch');

// ========== Cold boot (exact copy from probe-610) ==========
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

// ========== Key 1: '2' / 0x90 ==========
console.log('\nphase611: === Key 1/3: key=2 (scan=0x90) ===');

pressKey(mem, 0x90);

cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, HALT_IDLE);
write24(mem, 0xD008E0, cpu.sp);

let key1CxMainHit = false;
let key1SampleCounter = 0;
let key1PeakVram = 0;
let key1PeakStep = 0;

const key1Result = executor.runFrom(OUTER_LOOP, 'adl', {
  maxSteps: 350_000,
  maxLoopIterations: 350_000,
  onBlock(pc) {
    if ((pc & 0xFFFFFF) === CX_MAIN) key1CxMainHit = true;
    key1SampleCounter++;
    if (key1SampleCounter % 5000 === 0) {
      const vram = countVRAM(mem);
      if (vram > key1PeakVram) {
        key1PeakVram = vram;
        key1PeakStep = key1SampleCounter;
      }
    }
  },
});

const key1Steps = key1Result.steps ?? 'unknown';
const key1HaltPC = key1Result.lastPc & 0xFFFFFF;
const key1Halted = cpu.halted;
const key1FinalVram = countVRAM(mem);

console.log('phase611: key1 steps=' + key1Steps + ' halted=' + key1Halted + ' lastPC=' + hex(key1HaltPC));
console.log('phase611: key1 cxMain=' + key1CxMainHit + ' peakVram=' + key1PeakVram + 'px@block' + key1PeakStep + ' finalVram=' + key1FinalVram + 'px');

// ========== Key 2: '3' / 0x91 -- re-arm D007CA ==========
console.log('\nphase611: === Key 2/3: key=3 (scan=0x91) ===');

// Re-arm D007CA: copy 21 bytes from ROM[0x0585D3] to mem[0xD007CA..+21]
for (let i = 0; i < 21; i++) {
  mem[0xD007CA + i] = romBytes[0x0585D3 + i];
}
mem[0xD0008D] = romBytes[0x0585D3 + 21];

pressKey(mem, 0x91);

cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, HALT_IDLE);
write24(mem, 0xD008E0, cpu.sp);

let key2CxMainHit = false;
let key2SampleCounter = 0;
let key2PeakVram = 0;
let key2PeakStep = 0;

const key2Result = executor.runFrom(OUTER_LOOP, 'adl', {
  maxSteps: 350_000,
  maxLoopIterations: 350_000,
  onBlock(pc) {
    if ((pc & 0xFFFFFF) === CX_MAIN) key2CxMainHit = true;
    key2SampleCounter++;
    if (key2SampleCounter % 5000 === 0) {
      const vram = countVRAM(mem);
      if (vram > key2PeakVram) {
        key2PeakVram = vram;
        key2PeakStep = key2SampleCounter;
      }
    }
  },
});

const key2Steps = key2Result.steps ?? 'unknown';
const key2HaltPC = key2Result.lastPc & 0xFFFFFF;
const key2Halted = cpu.halted;
const key2FinalVram = countVRAM(mem);

console.log('phase611: key2 steps=' + key2Steps + ' halted=' + key2Halted + ' lastPC=' + hex(key2HaltPC));
console.log('phase611: key2 cxMain=' + key2CxMainHit + ' peakVram=' + key2PeakVram + 'px@block' + key2PeakStep + ' finalVram=' + key2FinalVram + 'px');

// ========== Key 3: '+' / 0x70 -- re-arm D007CA ==========
console.log('\nphase611: === Key 3/3: key=+ (scan=0x70) ===');

// Re-arm D007CA again
for (let i = 0; i < 21; i++) {
  mem[0xD007CA + i] = romBytes[0x0585D3 + i];
}
mem[0xD0008D] = romBytes[0x0585D3 + 21];

pressKey(mem, 0x70);

cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, HALT_IDLE);
write24(mem, 0xD008E0, cpu.sp);

let key3CxMainHit = false;
let key3SampleCounter = 0;
let key3PeakVram = 0;
let key3PeakStep = 0;

const key3Result = executor.runFrom(OUTER_LOOP, 'adl', {
  maxSteps: 350_000,
  maxLoopIterations: 350_000,
  onBlock(pc) {
    if ((pc & 0xFFFFFF) === CX_MAIN) key3CxMainHit = true;
    key3SampleCounter++;
    if (key3SampleCounter % 5000 === 0) {
      const vram = countVRAM(mem);
      if (vram > key3PeakVram) {
        key3PeakVram = vram;
        key3PeakStep = key3SampleCounter;
      }
    }
  },
});

const key3Steps = key3Result.steps ?? 'unknown';
const key3HaltPC = key3Result.lastPc & 0xFFFFFF;
const key3Halted = cpu.halted;
const key3FinalVram = countVRAM(mem);

console.log('phase611: key3 steps=' + key3Steps + ' halted=' + key3Halted + ' lastPC=' + hex(key3HaltPC));
console.log('phase611: key3 cxMain=' + key3CxMainHit + ' peakVram=' + key3PeakVram + 'px@block' + key3PeakStep + ' finalVram=' + key3FinalVram + 'px');

// ========== Summary ==========
console.log('\n' + '='.repeat(60));
console.log('phase611: VRAM PEAK SUMMARY');
console.log('phase611: key1(2): peak=' + key1PeakVram + 'px@block' + key1PeakStep + ' final=' + key1FinalVram + 'px steps=' + key1Steps + ' halted=' + key1Halted + ' cxMain=' + key1CxMainHit);
console.log('phase611: key2(3): peak=' + key2PeakVram + 'px@block' + key2PeakStep + ' final=' + key2FinalVram + 'px steps=' + key2Steps + ' halted=' + key2Halted + ' cxMain=' + key2CxMainHit);
console.log('phase611: key3(+): peak=' + key3PeakVram + 'px@block' + key3PeakStep + ' final=' + key3FinalVram + 'px steps=' + key3Steps + ' halted=' + key3Halted + ' cxMain=' + key3CxMainHit);

const allPeaksAbove100 = key1PeakVram > 100 && key2PeakVram > 100 && key3PeakVram > 100;
const allCxMain = key1CxMainHit && key2CxMainHit && key3CxMainHit;

if (allPeaksAbove100 && allCxMain) {
  console.log('phase611: PASS -- all 3 keys: peakVram>100px and cxMain dispatched');
} else if (allPeaksAbove100 && !allCxMain) {
  console.log('phase611: PARTIAL -- all peaks>100px but not all cxMain');
} else if (!allPeaksAbove100 && allCxMain) {
  console.log('phase611: PARTIAL -- all cxMain but not all peaks>100px');
} else {
  console.log('phase611: FAIL -- not all peaks>100px and not all cxMain');
}

console.log('phase611: done');
