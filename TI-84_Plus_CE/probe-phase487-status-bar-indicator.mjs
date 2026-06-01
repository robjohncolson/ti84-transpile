#!/usr/bin/env node
/**
 * probe-phase487-status-bar-indicator.mjs
 *
 * Investigate whether the rendering at row 2, col 289 (by function 0x030173)
 * is a BATTERY/STATUS INDICATOR rather than the text cursor.
 *
 * Four investigations:
 * 1. Trace call chain 0x03013A -> 0x030173 during idle loop
 * 2. Search ROM 0x030000-0x031000 for battery state references (D00086, D00087)
 * 3. Find ALL callers of 0x0A23C0 and 0x0A239E in full ROM
 * 4. Find functions referencing BOTH cursor position AND rendering code
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
const RET_POINTS = new Set([0x02FE21]);

const hex = (v, w = 6) => '0x' + (v >>> 0).toString(16).toUpperCase().padStart(w, '0');

// ========== Load ROM and transpiled blocks ==========
const mem = new Uint8Array(MEM_SIZE);
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
mem.set(rom.subarray(0, MEM_SIZE), 0);

// Keep a clean copy of ROM for scanning
const romBytes = new Uint8Array(rom.length);
romBytes.set(rom.subarray(0, rom.length), 0);

const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const peripherals = createPeripheralBus({ timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

function write24(addr, val) {
  mem[addr & 0xFFFFFF] = val & 0xFF;
  mem[(addr + 1) & 0xFFFFFF] = (val >>> 8) & 0xFF;
  mem[(addr + 2) & 0xFFFFFF] = (val >>> 16) & 0xFF;
}

// ========== BOOT ==========
console.log('Phase 487: Status bar indicator investigation');
console.log('');

console.log('Boot stage 1: PC=0x000000, 50000 steps');
executor.runFrom(0x000000, 'adl', { maxSteps: 50000, maxLoopIterations: 200000 });

console.log('Boot stage 2: PC=0x08BF22, 100000 steps');
executor.runFrom(0x08BF22, 'adl', { maxSteps: 100000, maxLoopIterations: 200000 });

console.log('Boot complete.');
console.log('');

// =====================================================
// INVESTIGATION 1: Trace call chain during idle loop
// =====================================================
console.log('='.repeat(60));
console.log('INVESTIGATION 1: Trace addresses 0x030000-0x031000 during idle loop');
console.log('='.repeat(60));
console.log('');

// Set up idle loop state
mem[0xD00000] = 0x00;
mem[0xD00092] = 0x08;    // thin cursor style
mem[0xD000C6] |= 0x01;
mem[0xD00089] |= 0x10;
mem[0xD00080] = 0x18;
mem[0xD00095] = 0x00;
mem[0xD00595] = 0x00;    // cursor row
mem[0xD00596] = 0x00;    // cursor col
cpu.mbase = 0xD0;
cpu._iy = 0xD00080;
cpu.iff1 = 0;
cpu.iff2 = 0;

const sentinelSp = STACK_RESET_TOP - 3;
cpu.sp = sentinelSp;
write24(sentinelSp, IDLE_ENTRY);

// Track addresses hit in the 0x030000-0x031000 range
const traceHits = [];
let loopCount = 0;
let traceOnlyFirstLoop = true;

executor.runFrom(IDLE_ENTRY, 'adl', {
  maxSteps: MAX_IDLE_STEPS,
  maxLoopIterations: 200000,
  onBlock: (pc) => {
    const masked = pc & 0xFFFFFF;

    // Log addresses in target range during first loop iteration
    if (traceOnlyFirstLoop && loopCount === 0 && masked >= 0x030000 && masked < 0x031000) {
      traceHits.push(masked);
    }

    if (RET_POINTS.has(masked)) {
      loopCount++;
      if (loopCount >= 2) {
        return 'stop';
      }
      traceOnlyFirstLoop = false;
      cpu.sp = sentinelSp;
      write24(sentinelSp, IDLE_ENTRY);
      mem[0xD000C6] |= 0x01;
      mem[0xD00089] |= 0x10;
      mem[0xD00000] = 0x00;
    }

    if (masked === IDLE_ENTRY) {
      mem[0xD000C6] |= 0x01;
      mem[0xD00089] |= 0x10;
      mem[0xD00000] = 0x00;
    }
  },
});

console.log(`Addresses hit in 0x030000-0x031000 during first idle loop iteration:`);
console.log(`Total block entries in range: ${traceHits.length}`);
// Deduplicate preserving order
const seenTrace = new Set();
const uniqueTrace = [];
for (const addr of traceHits) {
  if (!seenTrace.has(addr)) {
    seenTrace.add(addr);
    uniqueTrace.push(addr);
  }
}
console.log(`Unique addresses (in order of first hit):`);
for (const addr of uniqueTrace) {
  console.log(`  ${hex(addr)}`);
}
console.log('');

// =====================================================
// INVESTIGATION 2: Search ROM for battery state refs
// =====================================================
console.log('='.repeat(60));
console.log('INVESTIGATION 2: Battery state references in ROM 0x030000-0x031000');
console.log('='.repeat(60));
console.log('');

// D00086 (charging) — bytes 86 00 D0
// D00087 (battery level) — bytes 87 00 D0
const searchRange = { start: 0x030000, end: 0x031000 };
const patterns = [
  { name: 'D00086 (charging)', bytes: [0x86, 0x00, 0xD0] },
  { name: 'D00087 (battery level)', bytes: [0x87, 0x00, 0xD0] },
  { name: 'D00088', bytes: [0x88, 0x00, 0xD0] },
  { name: 'D00089', bytes: [0x89, 0x00, 0xD0] },
  { name: 'D00092', bytes: [0x92, 0x00, 0xD0] },
  { name: 'D00595 (cursor row)', bytes: [0x95, 0x05, 0xD0] },
  { name: 'D00596 (cursor col)', bytes: [0x96, 0x05, 0xD0] },
];

for (const pat of patterns) {
  const hits = [];
  for (let addr = searchRange.start; addr < searchRange.end - pat.bytes.length; addr++) {
    let match = true;
    for (let i = 0; i < pat.bytes.length; i++) {
      if (romBytes[addr + i] !== pat.bytes[i]) {
        match = false;
        break;
      }
    }
    if (match) hits.push(addr);
  }
  if (hits.length > 0) {
    console.log(`${pat.name}: ${hits.length} hit(s)`);
    for (const h of hits) {
      // Show context: 8 bytes before and after
      const ctxStart = Math.max(searchRange.start, h - 4);
      const ctxEnd = Math.min(searchRange.end, h + pat.bytes.length + 4);
      const ctxBytes = [];
      for (let i = ctxStart; i < ctxEnd; i++) {
        ctxBytes.push(romBytes[i].toString(16).padStart(2, '0'));
      }
      console.log(`  ${hex(h)}  context: ${ctxBytes.join(' ')}`);
    }
  } else {
    console.log(`${pat.name}: no hits`);
  }
}
console.log('');

// =====================================================
// INVESTIGATION 3: Find ALL callers of 0x0A23C0 and 0x0A239E
// =====================================================
console.log('='.repeat(60));
console.log('INVESTIGATION 3: All callers of 0x0A23C0 and 0x0A239E in full ROM');
console.log('='.repeat(60));
console.log('');

// CALL in .LIL mode: CD + 3-byte LE address
const callTargets = [
  { name: '0x0A23C0', bytes: [0xCD, 0xC0, 0x23, 0x0A] },
  { name: '0x0A239E', bytes: [0xCD, 0x9E, 0x23, 0x0A] },
];

for (const target of callTargets) {
  const hits = [];
  const romLen = Math.min(romBytes.length, 0x400000);
  for (let addr = 0; addr < romLen - target.bytes.length; addr++) {
    let match = true;
    for (let i = 0; i < target.bytes.length; i++) {
      if (romBytes[addr + i] !== target.bytes[i]) {
        match = false;
        break;
      }
    }
    if (match) hits.push(addr);
  }
  console.log(`CALL ${target.name}: ${hits.length} caller(s)`);
  for (const h of hits) {
    console.log(`  caller at ${hex(h)}`);
  }
}
console.log('');

// Also check for CALL.IS (0x49 CD) variants — .SIS/.SIL mode
const callTargetsShort = [
  { name: '0x0A23C0 (CALL.IS)', bytes: [0x49, 0xCD, 0xC0, 0x23, 0x0A] },
  { name: '0x0A239E (CALL.IS)', bytes: [0x49, 0xCD, 0x9E, 0x23, 0x0A] },
];

for (const target of callTargetsShort) {
  const hits = [];
  const romLen = Math.min(romBytes.length, 0x400000);
  for (let addr = 0; addr < romLen - target.bytes.length; addr++) {
    let match = true;
    for (let i = 0; i < target.bytes.length; i++) {
      if (romBytes[addr + i] !== target.bytes[i]) {
        match = false;
        break;
      }
    }
    if (match) hits.push(addr);
  }
  if (hits.length > 0) {
    console.log(`${target.name}: ${hits.length} caller(s)`);
    for (const h of hits) {
      console.log(`  caller at ${hex(h)}`);
    }
  }
}
console.log('');

// =====================================================
// INVESTIGATION 4: Functions referencing BOTH D00595/D00596 AND rendering
// =====================================================
console.log('='.repeat(60));
console.log('INVESTIGATION 4: ROM regions with BOTH cursor pos AND rendering refs');
console.log('='.repeat(60));
console.log('');

// Search full ROM in 256-byte windows for co-occurrence of:
//   D00595 pattern: 95 05 D0
//   rendering pattern: C0 23 0A (0x0A23C0) or 9E 23 0A (0x0A239E)

const cursorPatterns = [
  { name: 'D00595', bytes: [0x95, 0x05, 0xD0] },
  { name: 'D00596', bytes: [0x96, 0x05, 0xD0] },
];

const renderPatterns = [
  { name: '0x0A23C0', bytes: [0xC0, 0x23, 0x0A] },
  { name: '0x0A239E', bytes: [0x9E, 0x23, 0x0A] },
];

function findPattern(buf, start, end, pat) {
  const hits = [];
  for (let i = start; i <= end - pat.length; i++) {
    let match = true;
    for (let j = 0; j < pat.length; j++) {
      if (buf[i + j] !== pat[j]) {
        match = false;
        break;
      }
    }
    if (match) hits.push(i);
  }
  return hits;
}

const WINDOW = 256;
const romLen = Math.min(romBytes.length, 0x400000);
const coOccurrences = [];

// Step through ROM in overlapping windows
for (let base = 0; base < romLen - WINDOW; base += 64) {
  const wEnd = Math.min(base + WINDOW, romLen);

  // Check for cursor position references
  let hasCursor = false;
  let cursorHits = [];
  for (const cp of cursorPatterns) {
    const hits = findPattern(romBytes, base, wEnd, cp.bytes);
    if (hits.length > 0) {
      hasCursor = true;
      cursorHits.push(...hits.map(h => ({ name: cp.name, addr: h })));
    }
  }

  if (!hasCursor) continue;

  // Check for rendering references
  let hasRender = false;
  let renderHits = [];
  for (const rp of renderPatterns) {
    const hits = findPattern(romBytes, base, wEnd, rp.bytes);
    if (hits.length > 0) {
      hasRender = true;
      renderHits.push(...hits.map(h => ({ name: rp.name, addr: h })));
    }
  }

  if (!hasRender) continue;

  // Found co-occurrence — record it (deduplicate by base)
  coOccurrences.push({
    base,
    cursorHits,
    renderHits,
  });
}

// Deduplicate overlapping windows — merge by proximity
const merged = [];
for (const co of coOccurrences) {
  if (merged.length === 0 || co.base - merged[merged.length - 1].base > WINDOW) {
    merged.push(co);
  } else {
    // Merge hits
    const last = merged[merged.length - 1];
    for (const ch of co.cursorHits) {
      if (!last.cursorHits.some(h => h.addr === ch.addr)) {
        last.cursorHits.push(ch);
      }
    }
    for (const rh of co.renderHits) {
      if (!last.renderHits.some(h => h.addr === rh.addr)) {
        last.renderHits.push(rh);
      }
    }
  }
}

console.log(`Found ${merged.length} region(s) with both cursor position and rendering references:`);
console.log('');
for (const m of merged) {
  console.log(`Region near ${hex(m.base)}:`);
  console.log(`  Cursor refs:`);
  for (const ch of m.cursorHits) {
    console.log(`    ${ch.name} at ${hex(ch.addr)}`);
  }
  console.log(`  Render refs:`);
  for (const rh of m.renderHits) {
    // Check if preceded by CD (CALL opcode)
    const prevByte = rh.addr > 0 ? romBytes[rh.addr - 1] : 0;
    const isCall = prevByte === 0xCD;
    console.log(`    ${rh.name} at ${hex(rh.addr)}${isCall ? ' (CALL)' : ''}`);
  }
  console.log('');
}

// =====================================================
// BONUS: What does 0x030173 actually do? Disassemble context
// =====================================================
console.log('='.repeat(60));
console.log('BONUS: ROM bytes around 0x03013A and 0x030173');
console.log('='.repeat(60));
console.log('');

for (const region of [
  { name: '0x03013A (call chain start)', addr: 0x03013A, len: 48 },
  { name: '0x030173 (renderer)', addr: 0x030173, len: 48 },
]) {
  const bytes = [];
  for (let i = 0; i < region.len; i++) {
    bytes.push(romBytes[region.addr + i].toString(16).padStart(2, '0'));
  }
  console.log(`${region.name}:`);
  // Print in groups of 16
  for (let i = 0; i < bytes.length; i += 16) {
    const slice = bytes.slice(i, i + 16);
    const addr = region.addr + i;
    console.log(`  ${hex(addr)}: ${slice.join(' ')}`);
  }
  console.log('');
}

console.log('Phase 487 probe complete.');
