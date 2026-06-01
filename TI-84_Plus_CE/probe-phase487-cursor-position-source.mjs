#!/usr/bin/env node
/**
 * probe-phase487-cursor-position-source.mjs
 *
 * Investigate the REAL source of cursor blink position. Session 486 showed
 * that 0x030173 renders at a FIXED position (row=2, col=289 = VRAM 0xD40742)
 * regardless of D0059C, D00595, or D00596. The function hardcodes LCD window
 * registers D008D2 and D008D5.
 *
 * This probe:
 *   1. Captures LCD window register values (D008D2, D008D5) during cursor
 *      blink by intercepting 0x030173 entry/exit.
 *   2. Scans the ROM for all byte patterns referencing D008D2 and D008D5.
 *   3. Tests whether running the display path (D00000=0x01) first changes
 *      what D008D2/D008D5 contain at the next cursor blink.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MEM_SIZE = 0x1000000;
const VRAM_START = 0xD40000;
const VRAM_END = 0xD65800;
const IDLE_ENTRY = 0x02FDBE;
const STACK_RESET_TOP = 0xD1A87E;
const MAX_IDLE_STEPS = 200000;
const MAX_IDLE_LOOPS = 5;
const RET_POINTS = new Set([0x02FE21]);

const LCD_WIN_D008D2 = 0xD008D2;
const LCD_WIN_D008D5 = 0xD008D5;
const CURSOR_BLINK_ENTRY = 0x030173;

const hex = (v, w = 6) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');
const hex2 = (v) => hex(v & 0xFF, 2);

// ========== Load ROM and transpiled blocks ==========
const mem = new Uint8Array(MEM_SIZE);
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
mem.set(rom.subarray(0, MEM_SIZE), 0);

const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const peripherals = createPeripheralBus({ timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

function read16(addr) {
  return mem[addr & 0xFFFFFF] | (mem[(addr + 1) & 0xFFFFFF] << 8);
}

function read24(addr) {
  return mem[addr & 0xFFFFFF]
    | (mem[(addr + 1) & 0xFFFFFF] << 8)
    | (mem[(addr + 2) & 0xFFFFFF] << 16);
}

function write24(addr, val) {
  mem[addr & 0xFFFFFF] = val & 0xFF;
  mem[(addr + 1) & 0xFFFFFF] = (val >>> 8) & 0xFF;
  mem[(addr + 2) & 0xFFFFFF] = (val >>> 16) & 0xFF;
}

function refreshIdleFlags() {
  mem[0xD00000] = 0x00;
  mem[0xD00092] = 0x16;
  mem[0xD000C6] |= 0x01;
  mem[0xD00089] |= 0x10;
}

function resetIdleStack() {
  const sentinelSp = (STACK_RESET_TOP - 3) & 0xFFFFFF;
  cpu.sp = sentinelSp;
  write24(sentinelSp, IDLE_ENTRY);
}

function resetCpuForIdle() {
  cpu.pc = IDLE_ENTRY;
  cpu.sp = STACK_RESET_TOP;
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetIdleStack();
}

function captureRegisters() {
  return {
    d008d2: read16(LCD_WIN_D008D2),
    d008d5: read16(LCD_WIN_D008D5),
    d00595: mem[0xD00595],
    d00596: mem[0xD00596],
    d0059c: read24(0xD0059C),
  };
}

// ========== BOOT ==========
console.log('Phase 487: Cursor position source probe');
console.log('');

console.log('Boot stage 1: PC=0x000000, 50000 steps');
executor.runFrom(0x000000, 'adl', { maxSteps: 50000, maxLoopIterations: 200000 });

console.log('Boot stage 2: PC=0x08BF22, 100000 steps');
executor.runFrom(0x08BF22, 'adl', { maxSteps: 100000, maxLoopIterations: 200000 });

console.log('Boot complete.');
console.log('');

// ======================================================================
// PART 1: Capture LCD window register values during cursor blink
// ======================================================================
console.log('='.repeat(60));
console.log('PART 1: LCD window registers during cursor blink (cold boot idle)');
console.log('='.repeat(60));

// Set up idle state
mem.fill(0xFF, VRAM_START, VRAM_END);
mem[0xD00000] = 0x00;
mem[0xD00092] = 0x16;
mem[0xD000C6] |= 0x01;
mem[0xD00089] |= 0x10;
mem[0xD00080] = 0x18;
mem[0xD00095] = 0x00;
mem[0xD00595] = 0x00;
mem[0xD00596] = 0x00;
resetCpuForIdle();

const captures = [];
let loopCount = 0;
let hitCount030173 = 0;
let insideCursorBlink = false;
let beforeSnap = null;
let blocksSinceBlink = 0;

// Track which PCs we see after 0x030173 entry
const exitPcs = [];
// Capture at multiple points after entry to track register changes
const midCaptures = [];

executor.runFrom(IDLE_ENTRY, 'adl', {
  maxSteps: MAX_IDLE_STEPS,
  maxLoopIterations: 200000,
  onBlock: (pc) => {
    const masked = pc & 0xFFFFFF;

    // Capture on entry to cursor blink function
    if (masked === CURSOR_BLINK_ENTRY) {
      hitCount030173++;
      beforeSnap = captureRegisters();
      insideCursorBlink = true;
      blocksSinceBlink = 0;
      exitPcs.length = 0;
      midCaptures.length = 0;
    }

    // If inside cursor blink, track PCs visited and capture at each block
    if (insideCursorBlink && masked !== CURSOR_BLINK_ENTRY) {
      blocksSinceBlink++;
      exitPcs.push(masked);
      // Capture at first few blocks after entry
      if (blocksSinceBlink <= 5) {
        midCaptures.push({ pc: masked, regs: captureRegisters() });
      }

      // After 30 blocks, consider cursor blink finished and record
      if (blocksSinceBlink === 30) {
        const afterSnap = captureRegisters();
        captures.push({
          hit: hitCount030173,
          before: beforeSnap,
          after: afterSnap,
          midCaptures: [...midCaptures],
          blocksVisited: [...exitPcs],
        });
        insideCursorBlink = false;
      }
    }

    if (RET_POINTS.has(masked)) {
      // If we were inside cursor blink, record the final state
      if (insideCursorBlink) {
        const afterSnap = captureRegisters();
        captures.push({
          hit: hitCount030173,
          before: beforeSnap,
          after: afterSnap,
          midCaptures: [...midCaptures],
          blocksVisited: [...exitPcs],
        });
        insideCursorBlink = false;
      }

      loopCount++;
      if (loopCount >= MAX_IDLE_LOOPS) {
        return 'stop';
      }
      resetIdleStack();
      refreshIdleFlags();
    }

    if (masked === IDLE_ENTRY) {
      if (insideCursorBlink) {
        const afterSnap = captureRegisters();
        captures.push({
          hit: hitCount030173,
          before: beforeSnap,
          after: afterSnap,
          midCaptures: [...midCaptures],
          blocksVisited: [...exitPcs],
        });
        insideCursorBlink = false;
      }
      refreshIdleFlags();
    }
  },
});

// If execution ended while still inside cursor blink, capture final state
if (insideCursorBlink) {
  const afterSnap = captureRegisters();
  captures.push({
    hit: hitCount030173,
    before: beforeSnap,
    after: afterSnap,
    midCaptures: [...midCaptures],
    blocksVisited: [...exitPcs],
    note: 'execution ended while inside cursor blink',
  });
}

console.log(`Idle loops completed: ${loopCount}`);
console.log(`0x030173 hits: ${hitCount030173}`);
console.log('');

for (const cap of captures) {
  console.log(`--- Cursor blink hit #${cap.hit} ---`);
  if (cap.note) console.log(`  NOTE: ${cap.note}`);
  console.log(`  BEFORE: D008D2=${hex(cap.before.d008d2, 4)} D008D5=${hex(cap.before.d008d5, 4)} D00595=${hex2(cap.before.d00595)} D00596=${hex2(cap.before.d00596)} D0059C=${hex(cap.before.d0059c)}`);
  for (const mc of (cap.midCaptures || [])) {
    console.log(`  MID @${hex(mc.pc)}: D008D2=${hex(mc.regs.d008d2, 4)} D008D5=${hex(mc.regs.d008d5, 4)} D00595=${hex2(mc.regs.d00595)} D00596=${hex2(mc.regs.d00596)} D0059C=${hex(mc.regs.d0059c)}`);
  }
  console.log(`  AFTER:  D008D2=${hex(cap.after.d008d2, 4)} D008D5=${hex(cap.after.d008d5, 4)} D00595=${hex2(cap.after.d00595)} D00596=${hex2(cap.after.d00596)} D0059C=${hex(cap.after.d0059c)}`);
  const blockCount = cap.blocksVisited.length;
  if (blockCount <= 30) {
    console.log(`  Blocks visited after entry (${blockCount}): ${cap.blocksVisited.map(p => hex(p)).join(', ')}`);
  } else {
    console.log(`  Blocks visited after entry: ${blockCount} total`);
    console.log(`    First 15: ${cap.blocksVisited.slice(0, 15).map(p => hex(p)).join(', ')}`);
    console.log(`    Last 5: ${cap.blocksVisited.slice(-5).map(p => hex(p)).join(', ')}`);
  }
}

console.log('');

// ======================================================================
// PART 2: Scan ROM for byte patterns referencing D008D2 and D008D5
// ======================================================================
console.log('='.repeat(60));
console.log('PART 2: ROM scan for D008D2 and D008D5 address references');
console.log('='.repeat(60));

const ROM_END = 0x400000;
const targets = [
  { name: 'D008D2', low: 0xD2, mid: 0x08, high: 0xD0 },
  { name: 'D008D5', low: 0xD5, mid: 0x08, high: 0xD0 },
];

for (const target of targets) {
  const locations = [];
  for (let addr = 0; addr < ROM_END - 2; addr++) {
    if (mem[addr] === target.low && mem[addr + 1] === target.mid && mem[addr + 2] === target.high) {
      locations.push(addr);
    }
  }
  console.log(`${target.name} (byte pattern ${hex2(target.low)} ${hex2(target.mid)} ${hex2(target.high)}):`);
  console.log(`  Found ${locations.length} occurrences in ROM:`);
  for (const loc of locations) {
    // Show surrounding bytes for context (-3..+5)
    const contextStart = Math.max(0, loc - 3);
    const contextEnd = Math.min(ROM_END, loc + 6);
    const contextBytes = [];
    for (let i = contextStart; i < contextEnd; i++) {
      contextBytes.push(mem[i].toString(16).padStart(2, '0').toUpperCase());
    }
    console.log(`    ${hex(loc)} (context: ${contextBytes.join(' ')})`);
  }
  console.log('');
}

// Also scan for 16-bit references (in case of LD (addr16), val patterns in Z80 mode
// where MBASE supplies the upper byte 0xD0)
const targets16 = [
  { name: 'D008D2 (16-bit: 08D2)', low: 0xD2, high: 0x08 },
  { name: 'D008D5 (16-bit: 08D5)', low: 0xD5, high: 0x08 },
];

for (const target of targets16) {
  const locations = [];
  for (let addr = 0; addr < ROM_END - 1; addr++) {
    if (mem[addr] === target.low && mem[addr + 1] === target.high) {
      // Filter: the byte after should NOT be 0xD0 (that's the 24-bit match already counted)
      if (addr + 2 < ROM_END && mem[addr + 2] === 0xD0) continue;
      locations.push(addr);
    }
  }
  console.log(`${target.name} — 16-bit pattern (MBASE=0xD0 supplies high byte):`);
  console.log(`  Found ${locations.length} occurrences in ROM:`);
  const displayLimit = Math.min(locations.length, 30);
  for (let i = 0; i < displayLimit; i++) {
    const loc = locations[i];
    const contextStart = Math.max(0, loc - 3);
    const contextEnd = Math.min(ROM_END, loc + 5);
    const contextBytes = [];
    for (let j = contextStart; j < contextEnd; j++) {
      contextBytes.push(mem[j].toString(16).padStart(2, '0').toUpperCase());
    }
    console.log(`    ${hex(loc)} (context: ${contextBytes.join(' ')})`);
  }
  if (locations.length > displayLimit) {
    console.log(`    ... and ${locations.length - displayLimit} more`);
  }
  console.log('');
}

// ======================================================================
// PART 3: Display path pre-conditioning test
// ======================================================================
console.log('='.repeat(60));
console.log('PART 3: Display path pre-conditioning (D00000=0x01 then idle)');
console.log('='.repeat(60));

// Record baseline D008D2/D008D5 from Part 1
const baselineD008D2 = captures.length > 0 ? captures[0].after.d008d2 : null;
const baselineD008D5 = captures.length > 0 ? captures[0].after.d008d5 : null;
console.log(`Baseline from Part 1: D008D2=${baselineD008D2 !== null ? hex(baselineD008D2, 4) : 'N/A'} D008D5=${baselineD008D5 !== null ? hex(baselineD008D5, 4) : 'N/A'}`);
console.log('');

// Reset state
mem.fill(0xFF, VRAM_START, VRAM_END);
mem[0xD00092] = 0x16;
mem[0xD000C6] |= 0x01;
mem[0xD00089] |= 0x10;
mem[0xD00080] = 0x18;
mem[0xD00095] = 0x00;
mem[0xD00595] = 0x00;
mem[0xD00596] = 0x00;
resetCpuForIdle();

// Phase A: Run display path (D00000=0x01) for 500 idle iterations
console.log('Phase A: Running D00000=0x01 (display path) for 500 iterations...');
mem[0xD00000] = 0x01;

let displayLoops = 0;
const displayMaxLoops = 500;

executor.runFrom(IDLE_ENTRY, 'adl', {
  maxSteps: 2000000,
  maxLoopIterations: 500000,
  onBlock: (pc) => {
    const masked = pc & 0xFFFFFF;

    if (RET_POINTS.has(masked)) {
      displayLoops++;
      if (displayLoops >= displayMaxLoops) {
        return 'stop';
      }
      resetIdleStack();
      // Keep display path active
      mem[0xD00000] = 0x01;
      mem[0xD000C6] |= 0x01;
      mem[0xD00089] |= 0x10;
    }

    if (masked === IDLE_ENTRY) {
      mem[0xD00000] = 0x01;
      mem[0xD000C6] |= 0x01;
      mem[0xD00089] |= 0x10;
    }
  },
});

console.log(`Display path loops completed: ${displayLoops}`);
const afterDisplayRegs = captureRegisters();
console.log(`After display path: D008D2=${hex(afterDisplayRegs.d008d2, 4)} D008D5=${hex(afterDisplayRegs.d008d5, 4)}`);
console.log('');

// Phase B: Switch to idle (D00000=0x00) and capture D008D2/D008D5 at next 0x030173
console.log('Phase B: Switching to D00000=0x00 (idle) — capturing at next 0x030173...');
mem.fill(0xFF, VRAM_START, VRAM_END);
resetCpuForIdle();
refreshIdleFlags();
mem[0xD00080] = 0x18;
mem[0xD00095] = 0x00;
mem[0xD00595] = 0x00;
mem[0xD00596] = 0x00;

const conditionedCaptures = [];
let condLoops = 0;
let condHits = 0;
let condInsideBlink = false;
let condBefore = null;
let condBlocksSinceBlink = 0;
const condMidCaptures = [];

executor.runFrom(IDLE_ENTRY, 'adl', {
  maxSteps: MAX_IDLE_STEPS,
  maxLoopIterations: 200000,
  onBlock: (pc) => {
    const masked = pc & 0xFFFFFF;

    if (masked === CURSOR_BLINK_ENTRY) {
      condHits++;
      condBefore = captureRegisters();
      condInsideBlink = true;
      condBlocksSinceBlink = 0;
      condMidCaptures.length = 0;
    }

    if (condInsideBlink && masked !== CURSOR_BLINK_ENTRY) {
      condBlocksSinceBlink++;
      if (condBlocksSinceBlink <= 5) {
        condMidCaptures.push({ pc: masked, regs: captureRegisters() });
      }
      if (condBlocksSinceBlink === 30) {
        const after = captureRegisters();
        conditionedCaptures.push({ hit: condHits, before: condBefore, after, midCaptures: [...condMidCaptures] });
        condInsideBlink = false;
      }
    }

    if (RET_POINTS.has(masked)) {
      if (condInsideBlink) {
        const after = captureRegisters();
        conditionedCaptures.push({ hit: condHits, before: condBefore, after, midCaptures: [...condMidCaptures] });
        condInsideBlink = false;
      }
      condLoops++;
      if (condLoops >= MAX_IDLE_LOOPS) {
        return 'stop';
      }
      resetIdleStack();
      refreshIdleFlags();
    }

    if (masked === IDLE_ENTRY) {
      if (condInsideBlink) {
        const after = captureRegisters();
        conditionedCaptures.push({ hit: condHits, before: condBefore, after, midCaptures: [...condMidCaptures] });
        condInsideBlink = false;
      }
      refreshIdleFlags();
    }
  },
});

// Capture if execution ended while still inside blink
if (condInsideBlink) {
  const after = captureRegisters();
  conditionedCaptures.push({ hit: condHits, before: condBefore, after, midCaptures: [...condMidCaptures], note: 'execution ended while inside cursor blink' });
}

console.log(`Idle loops after display conditioning: ${condLoops}`);
console.log(`0x030173 hits: ${condHits}`);
console.log('');

for (const cap of conditionedCaptures) {
  console.log(`--- Conditioned cursor blink hit #${cap.hit} ---`);
  if (cap.note) console.log(`  NOTE: ${cap.note}`);
  console.log(`  BEFORE: D008D2=${hex(cap.before.d008d2, 4)} D008D5=${hex(cap.before.d008d5, 4)} D00595=${hex2(cap.before.d00595)} D00596=${hex2(cap.before.d00596)} D0059C=${hex(cap.before.d0059c)}`);
  for (const mc of (cap.midCaptures || [])) {
    console.log(`  MID @${hex(mc.pc)}: D008D2=${hex(mc.regs.d008d2, 4)} D008D5=${hex(mc.regs.d008d5, 4)}`);
  }
  console.log(`  AFTER:  D008D2=${hex(cap.after.d008d2, 4)} D008D5=${hex(cap.after.d008d5, 4)} D00595=${hex2(cap.after.d00595)} D00596=${hex2(cap.after.d00596)} D0059C=${hex(cap.after.d0059c)}`);
}

console.log('');

// ======================================================================
// SUMMARY
// ======================================================================
console.log('='.repeat(60));
console.log('SUMMARY');
console.log('='.repeat(60));
console.log('');

if (captures.length > 0) {
  const c = captures[0];
  console.log('Cold boot idle (Part 1):');
  console.log(`  D008D2 before cursor blink: ${hex(c.before.d008d2, 4)}`);
  console.log(`  D008D2 after cursor blink:  ${hex(c.after.d008d2, 4)}`);
  console.log(`  D008D5 before cursor blink: ${hex(c.before.d008d5, 4)}`);
  console.log(`  D008D5 after cursor blink:  ${hex(c.after.d008d5, 4)}`);
  const d2Changed = c.before.d008d2 !== c.after.d008d2;
  const d5Changed = c.before.d008d5 !== c.after.d008d5;
  console.log(`  D008D2 changed by blink: ${d2Changed}`);
  console.log(`  D008D5 changed by blink: ${d5Changed}`);
}

if (conditionedCaptures.length > 0) {
  const cc = conditionedCaptures[0];
  console.log('');
  console.log('After display path pre-conditioning (Part 3):');
  console.log(`  D008D2 before cursor blink: ${hex(cc.before.d008d2, 4)}`);
  console.log(`  D008D2 after cursor blink:  ${hex(cc.after.d008d2, 4)}`);
  console.log(`  D008D5 before cursor blink: ${hex(cc.before.d008d5, 4)}`);
  console.log(`  D008D5 after cursor blink:  ${hex(cc.after.d008d5, 4)}`);

  if (captures.length > 0) {
    const base = captures[0];
    const d2Same = base.after.d008d2 === cc.after.d008d2;
    const d5Same = base.after.d008d5 === cc.after.d008d5;
    console.log('');
    console.log('Comparison:');
    console.log(`  D008D2 same as cold boot: ${d2Same}`);
    console.log(`  D008D5 same as cold boot: ${d5Same}`);
    if (d2Same && d5Same) {
      console.log('  => LCD window registers are hardcoded by 0x030173 — display path pre-conditioning has NO effect.');
    } else {
      console.log('  => LCD window registers DIFFER after display path — the display path sets up position state that cursor blink reads.');
      console.log(`     Cold boot: D008D2=${hex(base.after.d008d2, 4)}, D008D5=${hex(base.after.d008d5, 4)}`);
      console.log(`     Conditioned: D008D2=${hex(cc.after.d008d2, 4)}, D008D5=${hex(cc.after.d008d5, 4)}`);
    }
  }
}

console.log('');
console.log('Phase 487 probe complete.');
