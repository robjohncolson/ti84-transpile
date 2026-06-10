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
const WIPE = 0x0018f8;

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

function captureEditBuf(mem) {
  return {
    D0231A: read24(mem, 0xD0231A),
    D0231D: read24(mem, 0xD0231D),
    D02317: read24(mem, 0xD02317),
    D0243A: read24(mem, 0xD0243A),
    D0243D: read24(mem, 0xD0243D),
    D02440: read24(mem, 0xD02440),
    D000A3: mem[0xD000A3],
    D007CA: read24(mem, 0xD007CA),
    D00081: mem[0xD00081],
    D11146: read24(mem, 0xD11146),
    D11104: read24(mem, 0xD11104),
    editRegion: Array.from({length: 54}, (_, i) => mem[0xD0231A + i]),
    descBlock: Array.from({length: 32}, (_, i) => mem[0xD02430 + i]),
    d111region: Array.from({length: 96}, (_, i) => mem[0xD11100 + i]),
  };
}

function printSnapshot(label, snap) {
  console.log('\n--- ' + label + ' ---');
  console.log('  D0231A=' + hex(snap.D0231A) + '  D0231D=' + hex(snap.D0231D) + '  D02317=' + hex(snap.D02317));
  console.log('  D0243A=' + hex(snap.D0243A) + '  D0243D=' + hex(snap.D0243D) + '  D02440=' + hex(snap.D02440));
  console.log('  D000A3=' + hex(snap.D000A3, 2) + '  D007CA=' + hex(snap.D007CA) + '  D00081=' + hex(snap.D00081, 2));
  console.log('  D11146=' + hex(snap.D11146) + '  D11104=' + hex(snap.D11104));
  console.log('  editRegion: ' + snap.editRegion.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('  descBlock:  ' + snap.descBlock.map(b => b.toString(16).padStart(2, '0')).join(' '));
  console.log('  d111region: ' + snap.d111region.map(b => b.toString(16).padStart(2, '0')).join(' '));
}

function diffSnapshots(labelA, snapA, labelB, snapB) {
  console.log('\n=== DIFF: ' + labelA + ' vs ' + labelB + ' ===');
  const namedFields = ['D0231A', 'D0231D', 'D02317', 'D0243A', 'D0243D', 'D02440', 'D000A3', 'D007CA', 'D00081', 'D11146', 'D11104'];
  let diffs = 0;
  for (const f of namedFields) {
    if (snapA[f] !== snapB[f]) {
      const w = (f === 'D000A3' || f === 'D00081') ? 2 : 6;
      console.log('  CHANGED ' + f + ': ' + hex(snapA[f], w) + ' -> ' + hex(snapB[f], w));
      diffs++;
    }
  }

  for (const arrName of ['editRegion', 'descBlock', 'd111region']) {
    const a = snapA[arrName];
    const b = snapB[arrName];
    const changedIdxs = [];
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) changedIdxs.push(i);
    }
    if (changedIdxs.length > 0) {
      const baseAddr = arrName === 'editRegion' ? 0xD0231A : arrName === 'descBlock' ? 0xD02430 : 0xD11100;
      console.log('  CHANGED ' + arrName + ' (' + changedIdxs.length + ' bytes differ):');
      for (const i of changedIdxs) {
        console.log('    [' + hex(baseAddr + i) + '] ' + a[i].toString(16).padStart(2, '0') + ' -> ' + b[i].toString(16).padStart(2, '0'));
      }
      diffs++;
    }
  }

  if (diffs === 0) {
    console.log('  (no differences)');
  }
}

// Load ROM and lifted blocks
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes.subarray(0, MEM_SIZE));
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

console.log('phase610: edit buffer compare probe');

// ===== Cold boot (exact copy from probe-609) =====
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

// ===== Phase 1: Launch-init =====
peripherals.setTimerEnabled(false);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
const launchSp = 0xD1A87E - 24;
cpu.sp = launchSp;
write24(mem, launchSp, 0x0019be);
write24(mem, 0xD008E0, launchSp);
executor.runFrom(REAL_INIT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });
console.log('phase610: init done');

// SNAPSHOT 1: After init
const snap1_afterInit = captureEditBuf(mem);
printSnapshot('SNAPSHOT 1: After Init (post-0x09DD62)', snap1_afterInit);

// ===== Phase 2: Paint =====
peripherals.setTimerEnabled(true);
cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, HALT_IDLE);
executor.runFrom(PAINT, 'adl', { maxSteps: 300000, maxLoopIterations: 30000 });
console.log('phase610: paint done');

// SNAPSHOT 2: After paint
const snap2_afterPaint = captureEditBuf(mem);
printSnapshot('SNAPSHOT 2: After Paint (post-0x058241)', snap2_afterPaint);

// ===== Phase 3: Key 1 with wipe capture =====
console.log('\nphase610: === Key 1 processing (scan=0x90) ===');

// Seed key1
mem[0xD0058C] = 0x90;
mem[0xD0058E] = 0x90;
mem[0xD0009F] = mem[0xD0009F] | 0x20;
mem[0xD00080] = mem[0xD00080] | 0x08;

cpu.halted = false; cpu.iff1 = 1; cpu.iff2 = 1;
cpu._iy = 0xD00080; cpu.mbase = 0xD0;
if ((cpu.sp & 0xFFFFFF) < 0x400000) cpu.sp = 0xD1A87E - 24;
cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
write24(mem, cpu.sp, HALT_IDLE);
write24(mem, 0xD008E0, cpu.sp);

let wipeCount = 0;
let snap3_postWipe = null;
let capturedPostWipe = false;
let stepsSinceWipe = 0;
let wipeJustHit = false;

const key1Result = executor.runFrom(OUTER_LOOP, 'adl', {
  maxSteps: 350_000,
  maxLoopIterations: 350_000,
  onBlock(pc) {
    const addr = pc & 0xFFFFFF;
    if (addr === WIPE) {
      wipeCount++;
      if (wipeCount === 1) {
        wipeJustHit = true;
        stepsSinceWipe = 0;
      }
    }
    // Capture ~100 blocks after first wipe hit
    if (wipeJustHit && !capturedPostWipe) {
      stepsSinceWipe++;
      if (stepsSinceWipe >= 100) {
        snap3_postWipe = captureEditBuf(mem);
        capturedPostWipe = true;
        wipeJustHit = false;
      }
    }
  },
});

// If wipe happened but <100 blocks followed, capture now
if (wipeCount > 0 && !capturedPostWipe) {
  snap3_postWipe = captureEditBuf(mem);
  capturedPostWipe = true;
  console.log('phase610: post-wipe snapshot captured at end (wipe was near end of run)');
}

const key1Steps = key1Result.steps ?? 'unknown';
const key1HaltPC = key1Result.lastPc & 0xFFFFFF;
console.log('phase610: key1 done: steps=' + key1Steps + ' wipes=' + wipeCount + ' haltPC=' + hex(key1HaltPC));

// SNAPSHOT 3: Post first wipe
if (snap3_postWipe) {
  printSnapshot('SNAPSHOT 3: Post-First-Wipe (~100 blocks after 0x0018F8)', snap3_postWipe);
} else {
  console.log('\nphase610: WARNING -- wipe address 0x0018F8 was never hit during key1');
}

// SNAPSHOT 4: After key1 completes
const snap4_afterKey1 = captureEditBuf(mem);
printSnapshot('SNAPSHOT 4: After Key1 Halt', snap4_afterKey1);

// ===== DIFFS =====
console.log('\n' + '='.repeat(70));
diffSnapshots('post-paint', snap2_afterPaint, 'post-key1-halt', snap4_afterKey1);

if (snap3_postWipe) {
  diffSnapshots('post-paint', snap2_afterPaint, 'post-first-wipe', snap3_postWipe);
  diffSnapshots('post-first-wipe', snap3_postWipe, 'post-key1-halt', snap4_afterKey1);
}

// Also diff init vs paint for completeness
diffSnapshots('post-init', snap1_afterInit, 'post-paint', snap2_afterPaint);

console.log('\nphase610: done');
