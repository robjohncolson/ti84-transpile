#!/usr/bin/env node
/**
 * probe-phase482-d00596-jump.mjs
 *
 * Investigate why D00596 (column counter) jumps to 0x13 (19)
 * when calling 0x0059C6 with D0059C=0 vs D0059C=0xD40000.
 *
 * Hypothesis: with D0059C=0, the function enters the screen fill
 * path through 0x005A20 (padding) which iterates, rendering many
 * characters and incrementing D00596 each time.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MEM_SIZE = 0x1000000;
const STACK_RESET_TOP = 0xD1A87E;
const VRAM_START = 0xD40000;
const VRAM_END = 0xD65800;
const VRAM_SIZE = VRAM_END - VRAM_START;

const TRACKED_PCS = [0x0059C6, 0x005A75, 0x005A20, 0x005A02];

const mem = new Uint8Array(MEM_SIZE);
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
mem.set(rom.subarray(0, MEM_SIZE), 0);

const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

function hex(v, w = 2) {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

function keyLooksLikePc(key, pc) {
  if (typeof key === 'number') {
    return key === pc;
  }

  if (typeof key !== 'string') {
    return false;
  }

  const upper = key.toUpperCase();
  const padded = pc.toString(16).toUpperCase().padStart(6, '0');

  if (upper === padded || upper === ('0X' + padded) || upper.includes(padded)) {
    return true;
  }

  const decimal = Number(upper);
  if (Number.isInteger(decimal) && decimal === pc) {
    return true;
  }

  for (const token of upper.match(/[0-9A-F]+/g) ?? []) {
    if (token.length > 0 && /[A-F]/.test(token) && parseInt(token, 16) === pc) {
      return true;
    }
  }

  return false;
}

function installPcHitCounters(blocks, trackedPcs) {
  const hits = new Map(trackedPcs.map((pc) => [pc, 0]));
  const installs = new Map(trackedPcs.map((pc) => [pc, 0]));
  const seen = new WeakSet();

  function pcForPath(pathParts) {
    return trackedPcs.find((pc) => pathParts.some((part) => keyLooksLikePc(part, pc)));
  }

  function wrapBlock(fn, pc) {
    return function trackedBlock(...args) {
      hits.set(pc, (hits.get(pc) ?? 0) + 1);
      return fn.apply(this, args);
    };
  }

  function visit(container, pathParts = []) {
    if (!container || (typeof container !== 'object' && typeof container !== 'function')) {
      return;
    }
    if (seen.has(container)) {
      return;
    }
    seen.add(container);

    if (container instanceof Map) {
      for (const [key, value] of container.entries()) {
        const nextPath = [...pathParts, key];
        const pc = pcForPath(nextPath);
        if (pc !== undefined && typeof value === 'function') {
          container.set(key, wrapBlock(value, pc));
          installs.set(pc, (installs.get(pc) ?? 0) + 1);
        } else {
          visit(value, nextPath);
        }
      }
      return;
    }

    for (const key of Reflect.ownKeys(container)) {
      const value = container[key];
      const nextPath = [...pathParts, key];
      const pc = pcForPath(nextPath);
      if (pc !== undefined && typeof value === 'function') {
        container[key] = wrapBlock(value, pc);
        installs.set(pc, (installs.get(pc) ?? 0) + 1);
      } else {
        visit(value, nextPath);
      }
    }
  }

  visit(blocks);
  return { hits, installs };
}

const pcTracker = installPcHitCounters(BLOCKS, TRACKED_PCS);
const peripherals = createPeripheralBus({ timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

function read24(addr) {
  return mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16);
}

function snapshotVram() {
  return mem.slice(VRAM_START, VRAM_END);
}

function diffVram(before) {
  let count = 0;
  const firstChanges = [];

  for (let offset = 0; offset < before.length; offset++) {
    const after = mem[VRAM_START + offset];
    if (before[offset] !== after) {
      count++;
      if (firstChanges.length < 64) {
        firstChanges.push({
          address: VRAM_START + offset,
          before: before[offset],
          after,
        });
      }
    }
  }

  return { count, firstChanges };
}

function displayState() {
  return {
    d0059c: read24(0xD0059C),
    d00595: mem[0xD00595],
    d00596: mem[0xD00596],
    d0058b: mem[0xD0058B],
    d0058c: mem[0xD0058C],
    d0058e: mem[0xD0058E],
  };
}

function resetPcHits() {
  for (const pc of TRACKED_PCS) {
    pcTracker.hits.set(pc, 0);
  }
}

function pcHitSummary() {
  return Object.fromEntries(
    TRACKED_PCS.map((pc) => [
      hex(pc, 6),
      {
        hits: pcTracker.hits.get(pc) ?? 0,
        wrappersInstalled: pcTracker.installs.get(pc) ?? 0,
      },
    ]),
  );
}

function primeDirectCall(charCode) {
  cpu._a = (charCode & 0xFF) << 24;
  cpu.sp = STACK_RESET_TOP - 3;
  mem[cpu.sp] = 0xFF;
  mem[cpu.sp + 1] = 0xFF;
  mem[cpu.sp + 2] = 0xFF;
  cpu.halted = false;
}

function setupDisplayState(d0059cValue) {
  // Set D0059C (VRAM pointer)
  mem[0xD0059C] = d0059cValue & 0xFF;
  mem[0xD0059D] = (d0059cValue >>> 8) & 0xFF;
  mem[0xD0059E] = (d0059cValue >>> 16) & 0xFF;

  mem[0xD00595] = 0x00; // Row 0
  mem[0xD00596] = 0x00; // Col 0
  mem[0xD0058B] = 0x70;
  mem[0xD0058C] = 0x00;
  mem[0xD0058E] = 0x00;

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
}

// ========== MAIN ==========

console.log('Phase 482: D00596 jump investigation');
console.log('VRAM range: ' + hex(VRAM_START, 6) + '-' + hex(VRAM_END - 1, 6));
console.log('Tracked PCs:');
for (const [pcText, info] of Object.entries(pcHitSummary())) {
  console.log('  ' + pcText + ': wrappers installed=' + info.wrappersInstalled);
}

// ========== 3-STAGE BOOT ==========
console.log('');
console.log('=== 3-STAGE BOOT ===');

console.log('Boot stage 1: runFrom 0x0802B2, intercept at 0x08C331');
executor.runFrom(0x0802B2, 'adl', {
  maxSteps: 700000,
  maxLoopIterations: 200000,
  onBlock: (pc) => {
    if ((pc & 0xFFFFFF) === 0x08C331) return 'stop';
  },
});

console.log('Boot stage 2: runFrom 0x08C331, intercept at 0x08BF22');
executor.runFrom(0x08C331, 'adl', {
  maxSteps: 300000,
  maxLoopIterations: 200000,
  onBlock: (pc) => {
    if ((pc & 0xFFFFFF) === 0x08BF22) return 'stop';
  },
});

console.log('Boot stage 3: runFrom 0x08BF22, intercept at display functions');
executor.runFrom(0x08BF22, 'adl', {
  maxSteps: 500000,
  maxLoopIterations: 200000,
  onBlock: (pc) => {
    const masked = pc & 0xFFFFFF;
    if (masked === 0x0059C6 || masked === 0x005A75 || masked === 0x005A20 || masked === 0x005A02) {
      return 'stop';
    }
  },
});

console.log('Boot complete.');

// ========== READ MODE TEXT BUFFER ==========
console.log('');
console.log('=== MODE TEXT BUFFER (D020A6-D020C0) ===');
const modeTextBytes = [];
const modeTextChars = [];
for (let addr = 0xD020A6; addr <= 0xD020C0; addr++) {
  const b = mem[addr];
  modeTextBytes.push(hex(b));
  modeTextChars.push(b >= 0x20 && b <= 0x7E ? String.fromCharCode(b) : '.');
}
console.log('  Bytes: ' + modeTextBytes.join(' '));
console.log('  ASCII: ' + modeTextChars.join(''));

// Also read D00595-D0059F for full display context
console.log('');
console.log('=== DISPLAY STATE AFTER BOOT ===');
console.log('  D00595 (row): ' + hex(mem[0xD00595]));
console.log('  D00596 (col): ' + hex(mem[0xD00596]));
console.log('  D0059C (VRAM ptr): ' + hex(read24(0xD0059C), 6));
console.log('  D0058B: ' + hex(mem[0xD0058B]));

// ========== EXPERIMENT 1: D0059C=0xD40000 (normal) ==========
console.log('');
console.log('========================================');
console.log('EXPERIMENT 1: A=0x48, D0059C=0xD40000');
console.log('  (Normal VRAM pointer - expect single-char render)');
console.log('========================================');

setupDisplayState(0xD40000);
resetPcHits();

const vram1Before = snapshotVram();
primeDirectCall(0x48); // 'H'

const res1 = executor.runFrom(0x0059C6, 'adl', { maxSteps: 5000, maxLoopIterations: 1000 });

const diff1 = diffVram(vram1Before);
const state1 = displayState();
const hits1 = pcHitSummary();

console.log('  Steps used: ' + (res1.steps ?? 'unknown'));
console.log('  VRAM bytes changed: ' + diff1.count);
console.log('  D00596 (col) after: ' + hex(state1.d00596));
console.log('  D00595 (row) after: ' + hex(state1.d00595));
console.log('  D0059C after: ' + hex(state1.d0059c, 6));
console.log('  PC hits:');
for (const [pcText, info] of Object.entries(hits1)) {
  console.log('    ' + pcText + ': ' + info.hits);
}
if (diff1.firstChanges.length > 0) {
  console.log('  First 10 VRAM changes:');
  for (const change of diff1.firstChanges.slice(0, 10)) {
    console.log('    ' + hex(change.address, 6) + ': ' + hex(change.before) + ' -> ' + hex(change.after));
  }
}

// ========== EXPERIMENT 2: D0059C=0x000000 (zero) ==========
console.log('');
console.log('========================================');
console.log('EXPERIMENT 2: A=0x48, D0059C=0x000000');
console.log('  (Zero VRAM pointer - expect D00596 jump)');
console.log('========================================');

setupDisplayState(0x000000);
resetPcHits();

const vram2Before = snapshotVram();
primeDirectCall(0x48); // 'H'

const res2 = executor.runFrom(0x0059C6, 'adl', { maxSteps: 5000, maxLoopIterations: 1000 });

const diff2 = diffVram(vram2Before);
const state2 = displayState();
const hits2 = pcHitSummary();

console.log('  Steps used: ' + (res2.steps ?? 'unknown'));
console.log('  VRAM bytes changed: ' + diff2.count);
console.log('  D00596 (col) after: ' + hex(state2.d00596));
console.log('  D00595 (row) after: ' + hex(state2.d00595));
console.log('  D0059C after: ' + hex(state2.d0059c, 6));
console.log('  PC hits:');
for (const [pcText, info] of Object.entries(hits2)) {
  console.log('    ' + pcText + ': ' + info.hits);
}
if (diff2.firstChanges.length > 0) {
  console.log('  First 10 VRAM changes:');
  for (const change of diff2.firstChanges.slice(0, 10)) {
    console.log('    ' + hex(change.address, 6) + ': ' + hex(change.before) + ' -> ' + hex(change.after));
  }
}

// ========== EXPERIMENT 3: D0059C=0, large budget, track D00596 ==========
console.log('');
console.log('========================================');
console.log('EXPERIMENT 3: A=0x48, D0059C=0x000000, maxSteps=200000');
console.log('  (Large budget - does it return? What is final D00596?)');
console.log('========================================');

setupDisplayState(0x000000);
resetPcHits();

const vram3Before = snapshotVram();
primeDirectCall(0x48); // 'H'

// Track D00596 at key addresses
const d00596Log = [];
let stepCounter3 = 0;

const res3 = executor.runFrom(0x0059C6, 'adl', {
  maxSteps: 200000,
  maxLoopIterations: 200000,
  onBlock: (pc) => {
    const masked = pc & 0xFFFFFF;
    stepCounter3++;

    // Log D00596 every time we hit 0x0059C6 (char output entry)
    if (masked === 0x0059C6) {
      d00596Log.push({
        col: mem[0xD00596],
        row: mem[0xD00595],
        d0059c: read24(0xD0059C),
        stepApprox: stepCounter3,
      });
    }

    // Stop at sentinel return
    if (masked === 0xFEDCBA || masked === 0xFFFFFF) {
      return 'stop';
    }
  },
});

const diff3 = diffVram(vram3Before);
const state3 = displayState();
const hits3 = pcHitSummary();

console.log('  Steps used: ' + (res3.steps ?? 'unknown'));
console.log('  VRAM bytes changed: ' + diff3.count);
console.log('  D00596 (col) after: ' + hex(state3.d00596));
console.log('  D00595 (row) after: ' + hex(state3.d00595));
console.log('  D0059C after: ' + hex(state3.d0059c, 6));
console.log('  Function returned: ' + ((res3.pc & 0xFFFFFF) === 0xFFFFFF || (res3.pc & 0xFFFFFF) === 0xFEDCBA ? 'YES' : 'NO (ran out of steps)'));
console.log('  Final PC: ' + hex(res3.pc ?? 0, 6));
console.log('  SP after: ' + hex(cpu.sp, 6));
console.log('  PC hits:');
for (const [pcText, info] of Object.entries(hits3)) {
  console.log('    ' + pcText + ': ' + info.hits);
}

console.log('  D00596 log (' + d00596Log.length + ' entries):');
if (d00596Log.length <= 40) {
  for (const entry of d00596Log) {
    console.log('    step~' + entry.stepApprox + ': col=' + hex(entry.col) + ' row=' + hex(entry.row) + ' D0059C=' + hex(entry.d0059c, 6));
  }
} else {
  // Show first 20 and last 10
  console.log('    (first 20):');
  for (const entry of d00596Log.slice(0, 20)) {
    console.log('    step~' + entry.stepApprox + ': col=' + hex(entry.col) + ' row=' + hex(entry.row) + ' D0059C=' + hex(entry.d0059c, 6));
  }
  console.log('    ... (' + (d00596Log.length - 30) + ' entries omitted) ...');
  console.log('    (last 10):');
  for (const entry of d00596Log.slice(-10)) {
    console.log('    step~' + entry.stepApprox + ': col=' + hex(entry.col) + ' row=' + hex(entry.row) + ' D0059C=' + hex(entry.d0059c, 6));
  }
}

// ========== SUMMARY ==========
console.log('');
console.log('========================================');
console.log('SUMMARY');
console.log('========================================');
console.log('');
console.log('Experiment 1 (D0059C=0xD40000):');
console.log('  D00596 after: ' + hex(state1.d00596) + ' (expected: 0x01)');
console.log('  VRAM changed: ' + diff1.count);
console.log('  0x005A20 hits: ' + hits1['0x005A20'].hits);
console.log('  0x005A75 hits: ' + hits1['0x005A75'].hits);
console.log('');
console.log('Experiment 2 (D0059C=0x000000, 5K steps):');
console.log('  D00596 after: ' + hex(state2.d00596) + ' (session 481 saw 0x13)');
console.log('  VRAM changed: ' + diff2.count);
console.log('  0x005A20 hits: ' + hits2['0x005A20'].hits);
console.log('  0x005A75 hits: ' + hits2['0x005A75'].hits);
console.log('');
console.log('Experiment 3 (D0059C=0x000000, 200K steps):');
console.log('  D00596 after: ' + hex(state3.d00596));
console.log('  D00595 after: ' + hex(state3.d00595));
console.log('  VRAM changed: ' + diff3.count);
console.log('  0x0059C6 re-entries: ' + d00596Log.length);
console.log('  0x005A20 hits: ' + hits3['0x005A20'].hits);
console.log('  0x005A75 hits: ' + hits3['0x005A75'].hits);
console.log('  0x005A02 hits: ' + hits3['0x005A02'].hits);
console.log('  Function returned: ' + ((res3.pc & 0xFFFFFF) === 0xFFFFFF || (res3.pc & 0xFFFFFF) === 0xFEDCBA ? 'YES' : 'NO'));

console.log('');
console.log('Summary JSON:');
console.log(JSON.stringify({
  experiment1: { d00596: state1.d00596, vramChanged: diff1.count, hits: hits1 },
  experiment2: { d00596: state2.d00596, vramChanged: diff2.count, hits: hits2 },
  experiment3: {
    d00596: state3.d00596,
    d00595: state3.d00595,
    vramChanged: diff3.count,
    returned: (res3.pc & 0xFFFFFF) === 0xFFFFFF || (res3.pc & 0xFFFFFF) === 0xFEDCBA,
    reEntries: d00596Log.length,
    hits: hits3,
  },
  modeTextBuffer: modeTextChars.join(''),
}, null, 2));
