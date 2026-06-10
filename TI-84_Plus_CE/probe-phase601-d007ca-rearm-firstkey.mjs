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

console.log('Phase 601 D007CA re-arm tracking during FIRST keypress (276K-step path)');
console.log('Tracking all 19 known D007CA writer addresses and value transitions');

// ── Phase 0: Cold boot (verbatim from probe-599) ──
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

const beforeD007CA = read24(mem, 0xD007CA);
const beforeD0231A = read24(mem, 0xD0231A);
const beforeD0243A = read24(mem, 0xD0243A);
const vramBefore = countVramNonWhite(mem);

console.log(`Pre-key state: D007CA=${hex(beforeD007CA)} D0231A=${hex(beforeD0231A)} D0243A=${hex(beforeD0243A)} VRAM=${vramBefore}px`);

// ── Phase 3: Seed FIRST key for outer loop ──
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

// ── Phase 4: Outer loop — track D007CA writers and transitions ──

// 19 known D007CA writer addresses
const D007CA_WRITERS = [
  0x05CC31, 0x0601B4, 0x06B432, 0x080EB7, 0x081018, 0x081100, 0x0813E0,
  0x09D327, 0x09D33D, 0x09D353, 0x0AB767, 0x0AB8E7, 0x0ABA7D, 0x0ABB09,
  0x0ABE84, 0x0ACC8A, 0x0B1D4D, 0x0B48EC, 0x0B6170,
];

const writerHits = {};
for (const addr of D007CA_WRITERS) {
  writerHits[addr] = { count: 0, firstStep: null, lastStep: null };
}

let stepCounter = 0;
let prevD007CA = beforeD007CA;
const d007caTransitions = [];

const result = executor.runFrom(0x08C331, 'adl', {
  maxSteps: 500_000,
  maxLoopIterations: 500_000,
  onBlock(pc) {
    const maskedPc = pc & 0xFFFFFF;
    stepCounter++;

    // Track D007CA writer hits
    const entry = writerHits[maskedPc];
    if (entry) {
      entry.count++;
      if (entry.firstStep === null) entry.firstStep = stepCounter;
      entry.lastStep = stepCounter;
    }

    // Track D007CA value transitions
    const curD007CA = read24(mem, 0xD007CA);
    if (curD007CA !== prevD007CA) {
      const kind = (prevD007CA === 0 && curD007CA !== 0) ? 'RE-ARM (0->non-zero)'
        : (prevD007CA !== 0 && curD007CA === 0) ? 'WIPE (non-zero->0)'
        : 'CHANGE';
      d007caTransitions.push({
        step: stepCounter,
        pc: hex(maskedPc),
        from: hex(prevD007CA),
        to: hex(curD007CA),
        kind,
      });
      prevD007CA = curD007CA;
    }
  },
});

// ── Report ──
const afterD007CA = read24(mem, 0xD007CA);
const afterD0231A = read24(mem, 0xD0231A);
const afterD0243A = read24(mem, 0xD0243A);
const vramAfter = countVramNonWhite(mem);

// Format writer hits (only show those that were hit, plus a summary of misses)
const hitWriters = {};
const missedWriters = [];
for (const addr of D007CA_WRITERS) {
  const e = writerHits[addr];
  if (e.count > 0) {
    hitWriters[hex(addr)] = e;
  } else {
    missedWriters.push(hex(addr));
  }
}

const report = {
  preKeyState: {
    D007CA: hex(beforeD007CA),
    D0231A: hex(beforeD0231A),
    D0243A: hex(beforeD0243A),
    vramNonWhite: vramBefore,
  },
  postKeyState: {
    D007CA: hex(afterD007CA),
    D0231A: hex(afterD0231A),
    D0243A: hex(afterD0243A),
    vramNonWhite: vramAfter,
  },
  d007caTransitions,
  d007caWriterHits: hitWriters,
  d007caWriterMisses: missedWriters,
  execution: {
    terminationReason: result.termination,
    steps: result.steps,
    blocksInstrumented: stepCounter,
    lastPc: hex(result.lastPc),
  },
};

console.log(JSON.stringify(report, null, 2));
