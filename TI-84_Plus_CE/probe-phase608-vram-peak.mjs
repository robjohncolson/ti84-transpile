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

function write24(mem, a, v) {
  mem[a] = v & 0xFF;
  mem[a + 1] = (v >> 8) & 0xFF;
  mem[a + 2] = (v >> 16) & 0xFF;
}

function read24(mem, a) {
  return mem[a] | (mem[a + 1] << 8) | (mem[a + 2] << 16);
}

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
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
  mem[0xd00587] = scanCode;
  mem[0xd0009f] = mem[0xd0009f] | 0x20;
  mem[0xd00080] = mem[0xd00080] | 0x08;
}

// Render a text snapshot of VRAM for given row ranges.
// Each row: sample every 2nd column -> 160 chars. '#' = non-white, '.' = white.
function renderVRAM(mem, rowRanges) {
  const base = 0xD40000;
  const lines = [];
  for (const { label, startRow, endRow } of rowRanges) {
    lines.push(`--- ${label} (rows ${startRow}-${endRow}) ---`);
    for (let row = startRow; row <= endRow; row++) {
      let line = '';
      for (let col = 0; col < 320; col += 2) {
        const idx = row * 320 + col;
        const a = base + idx * 2;
        const word = mem[a] | (mem[a + 1] << 8);
        line += (word === 0xFFFF) ? '.' : '#';
      }
      lines.push(`r${String(row).padStart(3, '0')}: ${line}`);
    }
  }
  return lines.join('\n');
}

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

console.log('phase608: VRAM peak capture with fine-grained sampling during key "2" processing');

// ── Phase 0: Cold boot (exact copy from probe-607) ──
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
executor.runFrom(REAL_INIT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });
console.log('phase608: init done');

// ── Phase 2: Paint ──
peripherals.setTimerEnabled(true);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, HALT_IDLE);
executor.runFrom(PAINT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });

const vramAfterPaint = countVRAM(mem);
console.log('phase608: paint done vram=' + vramAfterPaint + 'px');

// ── Phase 3: Press key '2' (scanCode 0x9a) and sample VRAM ──
const KEY2_SCAN = 0x9a;
console.log('\nphase608: pressing key "2" (scan=0x9a), running from OUTER_LOOP with maxSteps=300000');

pressKey(mem, KEY2_SCAN);

cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, HALT_IDLE);
write24(mem, 0xD008E0, cpu.sp);

let blockCount = 0;
let peakPixels = 0;
let peakBlockCount = 0;
let peakSnapshot = null;
const timeline = [];
const SAMPLE_INTERVAL = 200;
const TIMELINE_LOG_INTERVAL = 1000;

const result = executor.runFrom(OUTER_LOOP, 'adl', {
  maxSteps: 300_000,
  maxLoopIterations: 300_000,
  onBlock(pc) {
    blockCount++;

    // Sample every SAMPLE_INTERVAL blocks
    if (blockCount % SAMPLE_INTERVAL === 0) {
      const px = countVRAM(mem);

      // Log to timeline every TIMELINE_LOG_INTERVAL blocks
      if (blockCount % TIMELINE_LOG_INTERVAL === 0) {
        timeline.push({ block: blockCount, pixels: px });
      }

      // Track peak (only above 3000 threshold)
      if (px > 3000 && px > peakPixels) {
        peakPixels = px;
        peakBlockCount = blockCount;

        // Save text snapshot at new peak
        peakSnapshot = renderVRAM(mem, [
          { label: 'status bar', startRow: 0, endRow: 29 },
          { label: 'body', startRow: 35, endRow: 140 },
          { label: 'entry line', startRow: 210, endRow: 239 },
        ]);
      }
    }
  },
});

const finalVram = countVRAM(mem);
const haltPC = result.lastPc & 0xFFFFFF;
const steps = result.steps ?? 'unknown';

// ── Output ──
console.log('\n' + '='.repeat(60));
console.log('phase608: VRAM SAMPLING TIMELINE (every ' + TIMELINE_LOG_INTERVAL + ' blocks)');
console.log('='.repeat(60));
for (const entry of timeline) {
  const bar = '#'.repeat(Math.min(60, Math.floor(entry.pixels / 100)));
  console.log(`  block ${String(entry.block).padStart(7)}: ${String(entry.pixels).padStart(6)} px  ${bar}`);
}

console.log('\n' + '='.repeat(60));
console.log('phase608: PEAK INFO');
console.log('='.repeat(60));
console.log('  peak pixels:     ' + peakPixels);
console.log('  peak at block:   ' + peakBlockCount);
console.log('  final vram:      ' + finalVram + ' px');
console.log('  total blocks:    ' + blockCount);
console.log('  steps:           ' + steps);
console.log('  halt PC:         ' + hex(haltPC));

if (peakSnapshot) {
  console.log('\n' + '='.repeat(60));
  console.log('phase608: VRAM TEXT SNAPSHOT AT PEAK (block ' + peakBlockCount + ', ' + peakPixels + ' px)');
  console.log('='.repeat(60));
  console.log(peakSnapshot);
} else {
  console.log('\nphase608: no peak above 3000 px was observed');
}

console.log('\nphase608: done');
