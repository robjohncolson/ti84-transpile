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

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes.subarray(0, MEM_SIZE));
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('Phase 603 call-chain-to-wipe probe');
console.log('Tracing the call stack from outer loop to bulk wipe at 0x0018F8');

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

// ── Phase 4: Outer loop with call-chain tracking ──

// Call stack tracking
const callStack = [];
let lastSp = cpu.sp;
let lastPc = 0x08C331;

// Recent blocks ring buffer (last 20 unique)
const recentBlocks = [];
const RECENT_MAX = 20;

// Path from cxMain to wipe
let cxMainHit = false;
let cxMainStep = null;
const pathCxMainToWipe = [];
const pathSeen = new Set();

// Tracked block addresses
const TRACKED = {
  0x0585E9: 'cxMain',
  0x05877A: 'key handler',
  0x0587E9: 'convergence',
  0x058B73: '058B73',
  0x05899D: '05899D',
  0x058DCD: '058DCD',
  0x055B8F: '055B8F',
  0x08C782: '08C782',
  0x09DD62: '09DD62',
  0x09DEE0: '09DEE0',
};
const trackedHits = new Map();

let stepCounter = 0;
let wipeHit = false;

const result = executor.runFrom(0x08C331, 'adl', {
  maxSteps: 500_000,
  maxLoopIterations: 500_000,
  onBlock(pc) {
    const maskedPc = pc & 0xFFFFFF;
    stepCounter++;

    // SP-based call stack approximation
    const currentSp = cpu.sp;
    if (typeof lastSp === 'number' && typeof currentSp === 'number') {
      const delta = currentSp - lastSp;
      if (delta === -3) {
        // SP decreased by 3 => CALL pushed return address
        callStack.push(lastPc);
      } else if (delta === 3 && callStack.length > 0) {
        // SP increased by 3 => RET popped return address
        callStack.pop();
      }
    }
    lastSp = currentSp;

    // Recent blocks ring buffer
    if (recentBlocks.length === 0 || recentBlocks[recentBlocks.length - 1] !== maskedPc) {
      if (recentBlocks.length >= RECENT_MAX) recentBlocks.shift();
      recentBlocks.push(maskedPc);
    }

    // Track specific blocks
    if (maskedPc in TRACKED && !trackedHits.has(maskedPc)) {
      trackedHits.set(maskedPc, stepCounter);
    }

    // cxMain path tracking
    if (maskedPc === 0x0585E9 && !cxMainHit) {
      cxMainHit = true;
      cxMainStep = stepCounter;
    }
    if (cxMainHit && !wipeHit && !pathSeen.has(maskedPc)) {
      pathSeen.add(maskedPc);
      if (pathCxMainToWipe.length < 50) {
        pathCxMainToWipe.push(maskedPc);
      }
    }

    // Wipe detection (first time only)
    if (maskedPc === 0x0018F8 && !wipeHit) {
      wipeHit = true;

      console.log('\n=== CALL CHAIN TO 0x0018F8 ===');
      console.log(`Hit at step ${stepCounter}`);
      console.log(`cxMain first hit at step: ${cxMainStep ?? 'NOT HIT'}`);
      console.log(`Call stack depth: ${callStack.length}`);
      for (let i = 0; i < callStack.length; i++) {
        console.log(`  ${String(i).padStart(3, '0')}: ${hex(callStack[i])}`);
      }
      console.log(`  ${String(callStack.length).padStart(3, '0')}: ${hex(maskedPc)} <-- WIPE`);

      console.log('\n=== TRACKED BLOCKS ===');
      for (const [addr, label] of Object.entries(TRACKED)) {
        const a = Number(addr);
        const hitStep = trackedHits.get(a);
        console.log(`  ${hex(a)} (${label}): ${hitStep !== undefined ? `HIT at step ${hitStep}` : 'NOT HIT'}`);
      }

      console.log('\n=== PATH cxMain → 0x0018F8 ===');
      console.log(`(first ${pathCxMainToWipe.length} unique blocks after cxMain entry)`);
      for (let i = 0; i < pathCxMainToWipe.length; i++) {
        const addr = pathCxMainToWipe[i];
        const label = TRACKED[addr] ? ` (${TRACKED[addr]})` : '';
        console.log(`  ${String(i).padStart(2, '0')}: ${hex(addr)}${label}`);
      }

      console.log('\n=== RECENT 20 BLOCKS BEFORE WIPE ===');
      for (let i = 0; i < recentBlocks.length; i++) {
        console.log(`  ${String(i).padStart(2, '0')}: ${hex(recentBlocks[i])}`);
      }
    }

    lastPc = maskedPc;
  },
});

if (!wipeHit) {
  console.log('\n=== 0x0018F8 NOT REACHED ===');
  console.log(`Ran ${stepCounter} steps`);
  console.log(`cxMain hit: ${cxMainHit ? `yes, at step ${cxMainStep}` : 'no'}`);
  console.log(`Tracked blocks hit: ${trackedHits.size}/${Object.keys(TRACKED).length}`);
  for (const [addr, label] of Object.entries(TRACKED)) {
    const a = Number(addr);
    const hitStep = trackedHits.get(a);
    console.log(`  ${hex(a)} (${label}): ${hitStep !== undefined ? `HIT at step ${hitStep}` : 'NOT HIT'}`);
  }
}

console.log('\n=== EXECUTION SUMMARY ===');
console.log(`Termination: ${result.termination}`);
console.log(`Steps: ${result.steps}`);
console.log(`Last PC: ${hex(result.lastPc)}`);
console.log(`Wipe 0x0018F8 reached: ${wipeHit}`);
