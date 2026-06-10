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

console.log('Phase 603 double-wipe probe');
console.log('Capturing call chain at BOTH hits of 0x0018F8 during key processing');

// ── Phase 0: Cold boot (exact copy from probe-599) ──
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

// ── Phase 4: Outer loop with call-chain tracking at 0x0018F8 ──
const maxSteps = 500_000;

let stepCounter = 0;

// Ring buffer: last 20 unique block PCs
const RING_SIZE = 20;
const ringBuf = new Uint32Array(RING_SIZE);
let ringIdx = 0;
let lastRingPc = 0;

// Approximate call stack via SP tracking
let prevSp = cpu.sp & 0xFFFFFF;
let prevBlockPc = 0;
const callStack = [];  // array of PCs that were "callers"
const MAX_CALL_DEPTH = 40;

// Wipe event records
const wipeEvents = [];

const result = executor.runFrom(0x08C331, 'adl', {
  maxSteps,
  maxLoopIterations: 500_000,
  onBlock(pc) {
    const maskedPc = pc & 0xFFFFFF;
    stepCounter++;

    // Update ring buffer (only unique consecutive PCs)
    if (maskedPc !== lastRingPc) {
      ringBuf[ringIdx % RING_SIZE] = maskedPc;
      ringIdx++;
      lastRingPc = maskedPc;
    }

    // Approximate call stack via SP changes
    const curSp = cpu.sp & 0xFFFFFF;
    const spDelta = prevSp - curSp;  // positive = SP decreased (push/call)

    if (spDelta >= 3 && spDelta <= 6) {
      // SP decreased by 3-6: likely a CALL — push the caller PC
      if (callStack.length < MAX_CALL_DEPTH) {
        callStack.push(prevBlockPc);
      }
    } else if (spDelta <= -3 && spDelta >= -6) {
      // SP increased by 3-6: likely a RET — pop
      if (callStack.length > 0) {
        callStack.pop();
      }
    }

    prevSp = curSp;
    prevBlockPc = maskedPc;

    // Check for 0x0018F8 hit
    if (maskedPc === 0x0018F8) {
      // Snapshot the ring buffer in order (oldest to newest)
      const recentBlocks = [];
      const count = Math.min(ringIdx, RING_SIZE);
      const startIdx = ringIdx >= RING_SIZE ? ringIdx : 0;
      for (let i = 0; i < count; i++) {
        recentBlocks.push(hex(ringBuf[(startIdx + i) % RING_SIZE]));
      }

      // Snapshot call stack
      const stackSnapshot = callStack.map(pc => hex(pc));

      wipeEvents.push({
        hitNumber: wipeEvents.length + 1,
        step: stepCounter,
        sp: hex(curSp),
        D007CA: hex(read24(mem, 0xD007CA)),
        D0231A: hex(read24(mem, 0xD0231A)),
        D0243A: hex(read24(mem, 0xD0243A)),
        vramNonWhite: countVramNonWhite(mem),
        callStack: stackSnapshot,
        recentBlocks,
      });

      console.log(`  *** 0x0018F8 HIT #${wipeEvents.length} at step ${stepCounter}, SP=${hex(curSp)}, call depth=${stackSnapshot.length}`);
    }
  },
});

// ── Report ──
console.log('\n' + '='.repeat(80));
console.log('DOUBLE WIPE ANALYSIS');
console.log('='.repeat(80));

console.log(`\nTotal steps: ${result.steps}, termination: ${result.termination}, lastPc: ${hex(result.lastPc)}`);
console.log(`Total 0x0018F8 hits: ${wipeEvents.length}`);

for (const evt of wipeEvents) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`HIT #${evt.hitNumber} at step ${evt.step}`);
  console.log(`  SP:          ${evt.sp}`);
  console.log(`  D007CA:      ${evt.D007CA}`);
  console.log(`  D0231A:      ${evt.D0231A}`);
  console.log(`  D0243A:      ${evt.D0243A}`);
  console.log(`  VRAM non-wh: ${evt.vramNonWhite} px`);
  console.log(`  Call stack (${evt.callStack.length} frames):`);
  for (let i = 0; i < evt.callStack.length; i++) {
    console.log(`    [${i}] ${evt.callStack[i]}`);
  }
  console.log(`  Last ${evt.recentBlocks.length} unique blocks before arrival:`);
  for (let i = 0; i < evt.recentBlocks.length; i++) {
    console.log(`    ${i}: ${evt.recentBlocks[i]}`);
  }
}

// Side-by-side comparison
if (wipeEvents.length >= 2) {
  console.log(`\n${'='.repeat(60)}`);
  console.log('SIDE-BY-SIDE COMPARISON');
  console.log(`${'='.repeat(60)}`);

  const e1 = wipeEvents[0];
  const e2 = wipeEvents[1];

  console.log(`\n${'Field'.padEnd(20)} ${'Hit #1'.padEnd(25)} Hit #2`);
  console.log(`${'─'.repeat(20)} ${'─'.repeat(25)} ${'─'.repeat(25)}`);
  console.log(`${'Step'.padEnd(20)} ${String(e1.step).padEnd(25)} ${e2.step}`);
  console.log(`${'SP'.padEnd(20)} ${e1.sp.padEnd(25)} ${e2.sp}`);
  console.log(`${'D007CA'.padEnd(20)} ${e1.D007CA.padEnd(25)} ${e2.D007CA}`);
  console.log(`${'D0231A'.padEnd(20)} ${e1.D0231A.padEnd(25)} ${e2.D0231A}`);
  console.log(`${'D0243A'.padEnd(20)} ${e1.D0243A.padEnd(25)} ${e2.D0243A}`);
  console.log(`${'VRAM non-white'.padEnd(20)} ${String(e1.vramNonWhite).padEnd(25)} ${e2.vramNonWhite}`);
  console.log(`${'Call depth'.padEnd(20)} ${String(e1.callStack.length).padEnd(25)} ${e2.callStack.length}`);

  // Compare call stacks
  const maxDepth = Math.max(e1.callStack.length, e2.callStack.length);
  if (maxDepth > 0) {
    console.log(`\nCall stack comparison:`);
    console.log(`${'Frame'.padEnd(8)} ${'Hit #1'.padEnd(15)} ${'Hit #2'.padEnd(15)} Match?`);
    console.log(`${'─'.repeat(8)} ${'─'.repeat(15)} ${'─'.repeat(15)} ${'─'.repeat(6)}`);
    for (let i = 0; i < maxDepth; i++) {
      const f1 = i < e1.callStack.length ? e1.callStack[i] : '(none)';
      const f2 = i < e2.callStack.length ? e2.callStack[i] : '(none)';
      const match = f1 === f2 ? 'YES' : 'NO';
      console.log(`[${String(i).padEnd(5)}] ${f1.padEnd(15)} ${f2.padEnd(15)} ${match}`);
    }
  }

  // Check if same path
  const sameCallPath = e1.callStack.length === e2.callStack.length &&
    e1.callStack.every((frame, i) => frame === e2.callStack[i]);
  console.log(`\nSame call path: ${sameCallPath ? 'YES' : 'NO'}`);
} else if (wipeEvents.length === 1) {
  console.log('\nWARNING: Only 1 hit of 0x0018F8 detected (expected 2)');
} else {
  console.log('\nWARNING: No hits of 0x0018F8 detected');
}

console.log('\nProbe complete.');
