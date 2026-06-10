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

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function hexdump(mem, start, length) {
  const bytes = [];
  for (let i = 0; i < length; i++) bytes.push(hexByte(mem[(start + i) & 0xFFFFFF]));
  return bytes.join(' ');
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

function findByteNear(mem, center, target, radius = 0x200) {
  const start = Math.max(0, (center - radius) & 0xFFFFFF);
  const end = Math.min(0xFFFFFF, (center + radius) & 0xFFFFFF);
  for (let a = start; a <= end; a++) {
    if (mem[a] === target) return a;
  }
  return null;
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

console.log('Phase 598 character completion probe');
console.log(`Script: ${pathToFileURL(__filename).href}`);

// Phase 0: Cold boot
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

// Phase 1: Launch-init
peripherals.setTimerEnabled(false);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
const launchSp = 0xD1A87E - 24;
cpu.sp = launchSp;
write24(mem, launchSp, 0x0019be);
write24(mem, 0xD008E0, launchSp);
executor.runFrom(0x09DD62, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });

// Phase 2: Paint (timer needed for repaint)
peripherals.setTimerEnabled(true);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, 0x0019b5);
executor.runFrom(0x058241, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });

const beforeD0231A = read24(mem, 0xD0231A);
const beforeD0243A = read24(mem, 0xD0243A);
const vramBefore = countVramNonWhite(mem);

// Phase 3: Seed key for outer loop
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

// Phase 4: Run outer loop with 2M steps
const maxSteps = 2_000_000;
const allBlocks = new Set();
const result = executor.runFrom(0x08C331, 'adl', {
  maxSteps,
  maxLoopIterations: 2_000_000,
  onBlock(pc) {
    if (allBlocks.size < 10000) allBlocks.add(pc & 0xFFFFFF);
  },
});

const afterD0231A = read24(mem, 0xD0231A);
const afterD0243A = read24(mem, 0xD0243A);
const vramAfter = countVramNonWhite(mem);
const foundAtD0231A = findByteNear(mem, afterD0231A, 0x32);
const foundAtD0243A = findByteNear(mem, afterD0243A, 0x32);

const report = {
  keyState: {
    D0058C: hex(mem[0xD0058C], 2),
    D0058E: hex(mem[0xD0058E], 2),
    D0009F: hex(mem[0xD0009F], 2),
  },
  cxMainVector: {
    D007CA: hex(read24(mem, 0xD007CA)),
  },
  editCursors: {
    D0231A: { before: hex(beforeD0231A), after: hex(afterD0231A), changed: beforeD0231A !== afterD0231A },
    D0243A: { before: hex(beforeD0243A), after: hex(afterD0243A), changed: beforeD0243A !== afterD0243A },
  },
  editBufferSearch: {
    byte: hex(0x32, 2),
    nearD0231A: foundAtD0231A === null ? null : hex(foundAtD0231A),
    nearD0243A: foundAtD0243A === null ? null : hex(foundAtD0243A),
    found: foundAtD0231A !== null || foundAtD0243A !== null,
  },
  hexdumps: {
    D0231A_after_32: { start: hex(afterD0231A), bytes: hexdump(mem, afterD0231A, 32) },
    D0243A_after_32: { start: hex(afterD0243A), bytes: hexdump(mem, afterD0243A, 32) },
    D02434_descriptor_16: { start: hex(0xD02434), bytes: hexdump(mem, 0xD02434, 16) },
  },
  vram: {
    nonWhiteBefore: vramBefore,
    nonWhiteAfter: vramAfter,
    delta: vramAfter - vramBefore,
    increased: vramAfter > vramBefore,
  },
  execution: {
    terminationReason: result.termination,
    steps: result.steps,
    lastPc: hex(result.lastPc),
    hitMaxSteps: result.termination === 'maxSteps',
    uniqueBlocksVisited: allBlocks.size,
  },
};

console.log(JSON.stringify(report, null, 2));
