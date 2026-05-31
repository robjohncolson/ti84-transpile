#!/usr/bin/env node
/**
 * probe-phase482-direct-005A75.mjs
 *
 * Directly calls 0x005A75 (pixel renderer) and 0x0059C6 (character output wrapper)
 * to test character rendering after 3-stage boot.
 *
 * Experiment 1: Call 0x005A75 directly with A='H'
 * Experiment 2: Call 0x0059C6 five times to render "HELLO"
 * Experiment 3: Call 0x0059C6 with 200K step budget (screen fill test)
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

const mem = new Uint8Array(MEM_SIZE);
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
mem.set(rom.subarray(0, MEM_SIZE), 0);

const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const peripherals = createPeripheralBus({ timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

function hex(v, w = 6) {
  return '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
}

function read24(addr) {
  return mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16);
}

function snapshotVram() {
  return mem.slice(VRAM_START, VRAM_END);
}

function diffVram(before) {
  let count = 0;
  const firstChanges = [];
  let minAddr = Infinity;
  let maxAddr = 0;

  for (let offset = 0; offset < before.length; offset++) {
    const after = mem[VRAM_START + offset];
    if (before[offset] !== after) {
      count++;
      const addr = VRAM_START + offset;
      if (addr < minAddr) minAddr = addr;
      if (addr > maxAddr) maxAddr = addr;
      if (firstChanges.length < 32) {
        firstChanges.push({ address: addr, before: before[offset], after });
      }
    }
  }

  return { count, firstChanges, minAddr: count > 0 ? minAddr : null, maxAddr: count > 0 ? maxAddr : null };
}

function displayState() {
  return {
    d0059c: read24(0xD0059C),
    d005a0: mem[0xD005A0],
    d00595: mem[0xD00595],
    d00596: mem[0xD00596],
    d0058b: mem[0xD0058B],
  };
}

function setupDisplayState() {
  // D0059C = 0xD45C84 (VRAM address for row 0, col 0)
  mem[0xD0059C] = 0x84;
  mem[0xD0059D] = 0x5C;
  mem[0xD0059E] = 0xD4;

  // D005A0 = 37 (pixel row for text row 0)
  mem[0xD005A0] = 37;

  // D00595 = 0 (row 0)
  mem[0xD00595] = 0x00;

  // D00596 = 0 (col 0)
  mem[0xD00596] = 0x00;

  // D0058B = 0x70
  mem[0xD0058B] = 0x70;

  // MBASE and IY
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
}

function primeDirectCall(charCode) {
  cpu._a = (charCode & 0xFF) << 24;
  cpu.sp = STACK_RESET_TOP - 3;
  mem[cpu.sp] = 0xFF;
  mem[cpu.sp + 1] = 0xFF;
  mem[cpu.sp + 2] = 0xFF;
  cpu.halted = false;
}

function printDisplayState(label) {
  const state = displayState();
  console.log(`${label}:`);
  console.log(`  D0059C (VRAM addr): ${hex(state.d0059c)}`);
  console.log(`  D005A0 (pixel row): ${state.d005a0}`);
  console.log(`  D00595 (row):       ${hex(state.d00595, 2)}`);
  console.log(`  D00596 (col):       ${hex(state.d00596, 2)}`);
  console.log(`  D0058B:             ${hex(state.d0058b, 2)}`);
}

function printDiff(diff, maxShow = 16) {
  console.log(`  VRAM bytes changed: ${diff.count}`);
  if (diff.minAddr !== null) {
    console.log(`  VRAM change range:  ${hex(diff.minAddr)} - ${hex(diff.maxAddr)}`);
  }
  if (diff.firstChanges.length > 0) {
    console.log(`  First ${Math.min(maxShow, diff.firstChanges.length)} changes:`);
    for (let i = 0; i < Math.min(maxShow, diff.firstChanges.length); i++) {
      const c = diff.firstChanges[i];
      console.log(`    ${hex(c.address)}: ${hex(c.before, 2)} -> ${hex(c.after, 2)}`);
    }
  }
}

// =====================================================================
// BOOT
// =====================================================================
console.log('Phase 482: Direct 0x005A75 character renderer probe');
console.log('='.repeat(60));

console.log('\n--- 3-STAGE BOOT ---');

console.log('Stage 1: runFrom(0x0802B2, maxSteps=700000)');
executor.runFrom(0x0802B2, 'adl', {
  maxSteps: 700000,
  maxLoopIterations: 5000,
  onBlock(pc) {
    if ((pc & 0xFFFFFF) === 0x08C331) return 'stop';
  },
});

console.log('Stage 2: runFrom(0x08C331, maxSteps=300000)');
executor.runFrom(0x08C331, 'adl', {
  maxSteps: 300000,
  maxLoopIterations: 5000,
  onBlock(pc) {
    if ((pc & 0xFFFFFF) === 0x08BF22) return 'stop';
  },
});

console.log('Stage 3: runFrom(0x08BF22, maxSteps=500000)');
executor.runFrom(0x08BF22, 'adl', {
  maxSteps: 500000,
  maxLoopIterations: 5000,
});

console.log('Boot complete.');

// =====================================================================
// SETUP DISPLAY STATE
// =====================================================================
setupDisplayState();
console.log('');
printDisplayState('Display state after setup');

// =====================================================================
// EXPERIMENT 1: Direct call to 0x005A75 with A='H' (0x48)
// =====================================================================
console.log('\n' + '='.repeat(60));
console.log('EXPERIMENT 1: Direct call to 0x005A75 with A=0x48 (\'H\')');
console.log('='.repeat(60));

const snap1 = snapshotVram();
primeDirectCall(0x48);

console.log(`  cpu._a = ${hex(cpu._a)}`);
console.log(`  cpu.sp = ${hex(cpu.sp)}`);

const result1 = executor.runFrom(0x005A75, 'adl', { maxSteps: 5000, maxLoopIterations: 200 });
const diff1 = diffVram(snap1);

console.log(`  Steps executed: ${result1.steps ?? 'N/A'}`);
printDiff(diff1);
printDisplayState('State after experiment 1');

// =====================================================================
// EXPERIMENT 2: Call 0x0059C6 five times to render "HELLO"
// =====================================================================
console.log('\n' + '='.repeat(60));
console.log('EXPERIMENT 2: Call 0x0059C6 five times to render "HELLO"');
console.log('='.repeat(60));

// Reset display state for clean experiment
setupDisplayState();

const helloChars = [
  { code: 0x48, name: 'H' },
  { code: 0x45, name: 'E' },
  { code: 0x4C, name: 'L' },
  { code: 0x4C, name: 'L' },
  { code: 0x4F, name: 'O' },
];

const snap2 = snapshotVram();
let totalVramChanged = 0;

for (const ch of helloChars) {
  const charSnap = snapshotVram();
  primeDirectCall(ch.code);

  executor.runFrom(0x0059C6, 'adl', { maxSteps: 5000, maxLoopIterations: 200 });
  const charDiff = diffVram(charSnap);
  totalVramChanged += charDiff.count;

  const state = displayState();
  console.log(`  '${ch.name}' (${hex(ch.code, 2)}): ${charDiff.count} VRAM bytes changed, D00596=${hex(state.d00596, 2)}, D0059C=${hex(state.d0059c)}`);
}

const totalDiff = diffVram(snap2);
console.log(`\n  Total VRAM bytes changed (cumulative per-char): ${totalVramChanged}`);
console.log(`  Total VRAM bytes changed (snap2 vs final):     ${totalDiff.count}`);
printDisplayState('State after "HELLO"');

// =====================================================================
// EXPERIMENT 3: Call 0x0059C6 with 200K step budget (screen fill test)
// =====================================================================
console.log('\n' + '='.repeat(60));
console.log('EXPERIMENT 3: Call 0x0059C6 with A=0x48, 200K steps (screen fill test)');
console.log('='.repeat(60));

// Reset display state for clean experiment
setupDisplayState();

const snap3 = snapshotVram();
primeDirectCall(0x48);

console.log('  Running 0x0059C6 with maxSteps=200000...');
const result3 = executor.runFrom(0x0059C6, 'adl', { maxSteps: 200000, maxLoopIterations: 50000 });
const diff3 = diffVram(snap3);

console.log(`  Steps executed: ${result3.steps ?? 'N/A'}`);
console.log(`  Total VRAM bytes changed: ${diff3.count}`);
console.log(`  Total VRAM size: ${VRAM_SIZE} (320*240*2)`);
if (diff3.count > 0) {
  console.log(`  VRAM change range: ${hex(diff3.minAddr)} - ${hex(diff3.maxAddr)}`);
  console.log(`  Coverage: ${(diff3.count / VRAM_SIZE * 100).toFixed(2)}% of VRAM`);
}
printDisplayState('Final state after experiment 3');

console.log('\n' + '='.repeat(60));
console.log('PROBE COMPLETE');
console.log('='.repeat(60));
