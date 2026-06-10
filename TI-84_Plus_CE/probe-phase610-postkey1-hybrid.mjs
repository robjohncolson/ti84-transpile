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

console.log('phase610: post-key1 hybrid probe -- use key1 natural state + re-arm D007CA for keys 2-3');

// ========== Cold boot (exact copy from probe-609) ==========
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
console.log('phase610: init done');

// ========== Paint ==========
peripherals.setTimerEnabled(true);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, HALT_IDLE);
executor.runFrom(PAINT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });

const vramAfterPaint = countVRAM(mem);
console.log('phase610: paint done vram=' + vramAfterPaint + 'px');

// ========== Key 1: '2' / 0x90 -- run normally ==========
console.log('\nphase610: === Key 1/3: key=2 (scan=0x90) ===');
console.log('phase610: strategy -- run key1 normally, then use its natural post-state');

pressKey(mem, 0x90);

cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, HALT_IDLE);
write24(mem, 0xD008E0, cpu.sp);

let key1CxMainHit = false;

const key1Result = executor.runFrom(OUTER_LOOP, 'adl', {
  maxSteps: 350_000,
  maxLoopIterations: 350_000,
  onBlock(pc) {
    if ((pc & 0xFFFFFF) === CX_MAIN) key1CxMainHit = true;
  },
});

const key1Steps = key1Result.steps ?? 'unknown';
const key1HaltPC = key1Result.lastPc & 0xFFFFFF;
const key1Halted = cpu.halted;
const key1Vram = countVRAM(mem);

console.log('phase610: key1 steps=' + key1Steps + ' halted=' + key1Halted + ' lastPC=' + hex(key1HaltPC));
console.log('phase610: key1 cxMain=' + key1CxMainHit + ' vram=' + key1Vram + 'px');

// Capture post-key1 state
const postKey1_D007CA = read24(mem, 0xD007CA);
const postKey1_D0231A = read24(mem, 0xD0231A);
const postKey1_D0243A = read24(mem, 0xD0243A);
const postKey1_D000A3 = mem[0xD000A3];

console.log('phase610: post-key1 state:');
console.log('phase610:   D007CA=' + hex(postKey1_D007CA) + ' (expect 0 after wipe)');
console.log('phase610:   D0231A=' + hex(postKey1_D0231A) + ' (editCursorA)');
console.log('phase610:   D0243A=' + hex(postKey1_D0243A) + ' (editCursorB)');
console.log('phase610:   D000A3=' + hex(postKey1_D000A3, 2) + ' (IY flags)');

// ========== Key 2: '3' / 0x91 -- re-arm D007CA from ROM descriptor ==========
console.log('\nphase610: === Key 2/3: key=3 (scan=0x91) ===');
console.log('phase610: strategy -- use post-key1 state + re-arm D007CA from ROM[0x0585D3]');

// Re-arm D007CA: copy 21 bytes from ROM[0x0585D3] to mem[0xD007CA..+21]
for (let i = 0; i < 21; i++) {
  mem[0xD007CA + i] = romBytes[0x0585D3 + i];
}
// Also set the mode byte
mem[0xD0008D] = romBytes[0x0585D3 + 21];

console.log('phase610: re-armed D007CA=' + hex(read24(mem, 0xD007CA)) + ' D0008D=' + hex(mem[0xD0008D], 2));

// Seed key2
pressKey(mem, 0x91);

// Fix up CPU state
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, HALT_IDLE);
write24(mem, 0xD008E0, cpu.sp);

let key2CxMainHit = false;

const key2Result = executor.runFrom(OUTER_LOOP, 'adl', {
  maxSteps: 350_000,
  maxLoopIterations: 350_000,
  onBlock(pc) {
    if ((pc & 0xFFFFFF) === CX_MAIN) key2CxMainHit = true;
  },
});

const key2Steps = key2Result.steps ?? 'unknown';
const key2HaltPC = key2Result.lastPc & 0xFFFFFF;
const key2Halted = cpu.halted;
const key2Vram = countVRAM(mem);
const key2D007CA = read24(mem, 0xD007CA);

console.log('phase610: key2 steps=' + key2Steps + ' halted=' + key2Halted + ' lastPC=' + hex(key2HaltPC));
console.log('phase610: key2 cxMain=' + key2CxMainHit + ' vram=' + key2Vram + 'px D007CA=' + hex(key2D007CA));

// ========== Key 3: '+' / 0x70 -- re-arm D007CA again ==========
console.log('\nphase610: === Key 3/3: key=+ (scan=0x70) ===');
console.log('phase610: strategy -- use post-key2 state + re-arm D007CA from ROM[0x0585D3]');

// Re-arm D007CA again
for (let i = 0; i < 21; i++) {
  mem[0xD007CA + i] = romBytes[0x0585D3 + i];
}
mem[0xD0008D] = romBytes[0x0585D3 + 21];

console.log('phase610: re-armed D007CA=' + hex(read24(mem, 0xD007CA)) + ' D0008D=' + hex(mem[0xD0008D], 2));

// Seed key3
pressKey(mem, 0x70);

// Fix up CPU state
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, HALT_IDLE);
write24(mem, 0xD008E0, cpu.sp);

let key3CxMainHit = false;

const key3Result = executor.runFrom(OUTER_LOOP, 'adl', {
  maxSteps: 350_000,
  maxLoopIterations: 350_000,
  onBlock(pc) {
    if ((pc & 0xFFFFFF) === CX_MAIN) key3CxMainHit = true;
  },
});

const key3Steps = key3Result.steps ?? 'unknown';
const key3HaltPC = key3Result.lastPc & 0xFFFFFF;
const key3Halted = cpu.halted;
const key3Vram = countVRAM(mem);
const key3D007CA = read24(mem, 0xD007CA);

console.log('phase610: key3 steps=' + key3Steps + ' halted=' + key3Halted + ' lastPC=' + hex(key3HaltPC));
console.log('phase610: key3 cxMain=' + key3CxMainHit + ' vram=' + key3Vram + 'px D007CA=' + hex(key3D007CA));

// ========== Summary ==========
console.log('\n' + '='.repeat(60));
console.log('phase610: SUMMARY');
console.log('phase610: key1(2): steps=' + key1Steps + ' halted=' + key1Halted + ' cxMain=' + key1CxMainHit + ' lastPC=' + hex(key1HaltPC) + ' vram=' + key1Vram + 'px');
console.log('phase610: key2(3): steps=' + key2Steps + ' halted=' + key2Halted + ' cxMain=' + key2CxMainHit + ' lastPC=' + hex(key2HaltPC) + ' vram=' + key2Vram + 'px');
console.log('phase610: key3(+): steps=' + key3Steps + ' halted=' + key3Halted + ' cxMain=' + key3CxMainHit + ' lastPC=' + hex(key3HaltPC) + ' vram=' + key3Vram + 'px');

const allHalt = (key1HaltPC === HALT_IDLE) && (key2HaltPC === HALT_IDLE) && (key3HaltPC === HALT_IDLE);
const allCxMain = key1CxMainHit && key2CxMainHit && key3CxMainHit;
const allUnderBudget = (typeof key1Steps === 'number' && key1Steps < 350_000)
  && (typeof key2Steps === 'number' && key2Steps < 350_000)
  && (typeof key3Steps === 'number' && key3Steps < 350_000);

if (allHalt && allCxMain && allUnderBudget) {
  console.log('phase610: PASS -- all 3 keys: halt at HALT_IDLE, cxMain dispatched, under budget');
} else if (allCxMain && !allHalt) {
  console.log('phase610: PARTIAL -- all cxMain but not all halt correctly');
} else if (allHalt && !allCxMain) {
  console.log('phase610: PARTIAL -- all halt but not all cxMain');
} else {
  console.log('phase610: FAIL -- hybrid approach did not fully resolve keys 2-3');
}

console.log('phase610: done');
