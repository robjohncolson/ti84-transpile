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

const BULK_INIT_PC = 0x0018F8;

console.log('Phase 602: VRAM zero tracker — find where VRAM goes from non-zero to zero');

// ── Phase 0: Cold boot (verbatim from probe-601) ──
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
console.log(`Post-paint VRAM: ${vramAfterPaint} non-white pixels`);

// ── Phase 3: Seed key ──
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

// ── Phase 4: Outer loop — track VRAM pixel count to find zero transition ──
const samples = [];
const bulkInitHits = [];
let peakCount = 0;
let peakStep = 0;
let transition = null;
let blockCounter = 0;
let prevCount = countVramNonWhite(mem);
let recentBulkInit = false;

console.log(`Pre-outer-loop VRAM: ${prevCount} non-white pixels`);

const result = executor.runFrom(0x08C331, 'adl', {
  maxSteps: 500_000,
  maxLoopIterations: 500_000,
  onBlock(pc) {
    blockCounter++;

    // Track 0x0018F8 hits
    if (pc === BULK_INIT_PC) {
      bulkInitHits.push({ block: blockCounter, pc: hex(pc) });
      recentBulkInit = true;
    }

    // Sample every 500 blocks
    if (blockCounter % 500 === 0) {
      const count = countVramNonWhite(mem);

      // Track peak
      if (count > peakCount) {
        peakCount = count;
        peakStep = blockCounter;
      }

      samples.push({
        block: blockCounter,
        pc: hex(pc),
        vramCount: count,
      });

      // Detect transition from non-zero to zero AFTER reaching a peak
      if (!transition && peakCount > 0 && prevCount > 0 && count === 0) {
        transition = {
          block: blockCounter,
          pc: hex(pc),
          cpuPc: hex(cpu.pc),
          peakCount,
          peakStep,
          bulkInitRecent: recentBulkInit,
          bulkInitHitsSoFar: bulkInitHits.length,
          d007ca: hex(read24(mem, 0xD007CA)),
          sp: hex(cpu.sp),
          lastBulkInitBlock: bulkInitHits.length > 0 ? bulkInitHits[bulkInitHits.length - 1].block : null,
        };
        console.log(`*** TRANSITION DETECTED at block ${blockCounter}: VRAM went from ${prevCount} to 0 ***`);
        console.log(`    PC=${hex(pc)}, cpu.pc=${hex(cpu.pc)}`);
        console.log(`    Peak was ${peakCount} at block ${peakStep}`);
        console.log(`    Bulk init (0x0018F8) recent=${recentBulkInit}, total hits=${bulkInitHits.length}`);
        console.log(`    D007CA=${hex(read24(mem, 0xD007CA))}, SP=${hex(cpu.sp)}`);
      }

      prevCount = count;
      recentBulkInit = false;
    }
  },
});

const vramFinal = countVramNonWhite(mem);
console.log(`\nExecution: ${result.steps} steps, termination=${result.termination}, lastPc=${hex(result.lastPc)}`);
console.log(`Final VRAM: ${vramFinal} non-white pixels`);
console.log(`Peak VRAM: ${peakCount} non-white pixels at block ${peakStep}`);
console.log(`Bulk init (0x0018F8) total hits: ${bulkInitHits.length}`);

// Output JSON summary
const output = {
  ok: true,
  vramAfterPaint,
  peakCount,
  peakStep,
  transition,
  bulkInitHits,
  sampleCount: samples.length,
  samples: samples.filter(s => s.vramCount > 0 || (samples.indexOf(s) > 0 && samples[samples.indexOf(s) - 1].vramCount > 0)),
  finalVram: vramFinal,
  executionSteps: result.steps,
  termination: result.termination,
  lastPc: hex(result.lastPc),
};

console.log('\n=== JSON SUMMARY ===');
console.log(JSON.stringify(output, null, 2));

console.log('\nPhase 602 complete.');
