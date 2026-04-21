#!/usr/bin/env node
// Phase 91b: Memory read trace to find mode token buffer source.
// Problem: 0x0a29ec renders 26 chars all 0xFF. Phase 91a scanned
//          0xD00080-0xD001FF — no byte change affects char output.
// Approach: Wrap cpu.read8 to capture ALL D-bank RAM reads during
//           0x0a29ec execution. Correlate reads with 0x0a1799 calls
//           to find which RAM address supplies each 0xFF char code.
// Also: Two-byte token intercept — track lastWas0xFF to see if
//       the 26 calls are actually 13 token prefix+second-byte pairs.
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const mod = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = mod.PRELIFTED_BLOCKS;

const CPU_FIELDS = ['a','f','_bc','_de','_hl','_a2','_f2','_bc2','_de2','_hl2','sp','_ix','_iy','i','im','iff1','iff2','madl','mbase','halted','cycles'];

// ── Boot snapshot ─────────────────────────────────────────────────────────────
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const mem = new Uint8Array(0x1000000);
mem.set(romBytes);
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = 0xD1A87E - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = 0xD1A87E - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);
executor.runFrom(0x0802b2, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

const cpuSnap = Object.fromEntries(CPU_FIELDS.map(f => [f, cpu[f]]));
const ramSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
console.log('Snapshot ready.');

// Print non-0xFF bytes in D-bank for reference
console.log('\n=== Non-0xFF bytes in D-bank (0xD00000-0xD000FF) ===');
for (let a = 0xD00000; a <= 0xD000FF; a++) {
  if (mem[a] !== 0xFF) {
    console.log(`  0x${a.toString(16)} = 0x${mem[a].toString(16)}`);
  }
}

function clearVram() {
  const VRAM_BASE = 0xD40000;
  for (let i = 0; i < 320 * 240 * 2; i += 2) {
    mem[VRAM_BASE + i] = 0xAA;
    mem[VRAM_BASE + i + 1] = 0xAA;
  }
}

function resetCpu() {
  for (const [f, v] of Object.entries(cpuSnap)) cpu[f] = v;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
  cpu._iy = 0xD00080; cpu.f = 0x40;
  cpu.sp = 0xD1A87E - 12; mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

// ── Phase 91b-1: Memory read trace ───────────────────────────────────────────
// For each 0x0a1799 call, capture: char code, last-N D-bank reads before it.
console.log('\n=== Phase 91b-1: Memory read trace (D-bank reads → 0x0a1799 calls) ===');
mem.set(ramSnap, 0x400000); clearVram(); resetCpu();

// Wrap cpu.read8 to capture D-bank reads (0xD00000-0xDFFFFF, excluding VRAM 0xD40000+)
const origRead8 = cpu.read8.bind(cpu);
const readWindow = []; // circular buffer of last 16 D-bank reads
const MAX_WINDOW = 16;

cpu.read8 = (addr) => {
  const value = origRead8(addr);
  // Capture D-bank RAM reads (exclude ROM reads in 0x000000-0x3FFFFF)
  if (addr >= 0xD00000 && addr <= 0xD3FFFF) {
    if (readWindow.length >= MAX_WINDOW) readWindow.shift();
    readWindow.push({ addr, value });
  }
  return value;
};

const charCaptures = []; // one entry per 0x0a1799 call
let callIdx = 0;

executor.runFrom(0x0a29ec, 'adl', {
  maxSteps: 50000, maxLoopIterations: 500,
  onBlock: (pc) => {
    if (pc === 0x0a1799) {
      charCaptures.push({
        idx: callIdx++,
        charCode: cpu.a,
        col: cpu._de & 0xFFFF,
        hl: cpu._hl,
        bc: cpu._bc,
        iy: cpu._iy,
        readsBeforeCall: readWindow.slice(-6).map(r => ({ ...r })),
      });
    }
  }
});

// Restore cpu.read8
cpu.read8 = origRead8;

console.log(`\nTotal 0x0a1799 calls: ${charCaptures.length}`);
console.log('\nChar captures (idx | charCode | col | hl | last D-bank reads before call):');
for (const cap of charCaptures) {
  const charStr = cap.charCode >= 0x20 && cap.charCode < 0x7f
    ? String.fromCharCode(cap.charCode) : `[${cap.charCode.toString(16)}]`;
  const reads = cap.readsBeforeCall
    .map(r => `0x${r.addr.toString(16)}=${r.value.toString(16)}`)
    .join(' → ');
  console.log(`  [${cap.idx.toString().padStart(2,'0')}] char=0x${cap.charCode.toString(16)}(${charStr}) col=${cap.col} HL=0x${cap._hl?.toString(16) ?? cap.hl?.toString(16)} reads=[${reads}]`);
}

// Identify unique source addresses across all captures
const sourceCandidates = new Map(); // addr → count
for (const cap of charCaptures) {
  for (const r of cap.readsBeforeCall) {
    const key = `0x${r.addr.toString(16)}`;
    sourceCandidates.set(key, (sourceCandidates.get(key) || 0) + 1);
  }
}
console.log('\nFrequent D-bank read addresses during 0x0a1799 calls (top 20):');
const sorted = [...sourceCandidates.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
for (const [addr, count] of sorted) {
  const addrNum = parseInt(addr, 16);
  console.log(`  ${addr} count=${count} snapshot_val=0x${ramSnap[addrNum - 0x400000]?.toString(16)}`);
}

// ── Phase 91b-2: Two-byte token intercept ────────────────────────────────────
// Track lastWas0xFF — if 0xFF is a two-byte token prefix, the NEXT call has second byte.
console.log('\n=== Phase 91b-2: Two-byte token intercept ===');
mem.set(ramSnap, 0x400000); clearVram(); resetCpu();

let lastWas0xFF = false;
const twoByteTokens = [];
const allChars = [];

executor.runFrom(0x0a29ec, 'adl', {
  maxSteps: 50000, maxLoopIterations: 500,
  onBlock: (pc) => {
    if (pc === 0x0a1799) {
      const code = cpu.a;
      allChars.push(code);
      if (lastWas0xFF && code !== 0xFF) {
        twoByteTokens.push({ second: code, idx: allChars.length - 1 });
      }
      lastWas0xFF = (code === 0xFF);
    }
  }
});

console.log(`All chars (${allChars.length}): ${allChars.map(c => `0x${c.toString(16)}`).join(' ')}`);
if (twoByteTokens.length > 0) {
  console.log(`\nTwo-byte token second bytes (0xFF prefix found):`);
  for (const t of twoByteTokens) {
    console.log(`  idx=${t.idx} second=0x${t.second.toString(16)}`);
  }
} else {
  console.log('\nNo two-byte tokens (all 0xFF — no second byte found, or ALL chars are 0xFF prefix).');
}

// Count consecutive 0xFF runs
let run = 0, maxRun = 0;
for (const c of allChars) {
  if (c === 0xFF) { run++; maxRun = Math.max(maxRun, run); } else { run = 0; }
}
console.log(`Max consecutive 0xFF run: ${maxRun} / ${allChars.length} total chars`);

// ── Phase 91b-3: Binary search wider RAM for mode token buffer ────────────────
// Fill large regions with 0x00, run 0x0a29ec, check if any char becomes non-0xFF.
// This finds the region even if the buffer spans multiple addresses.
console.log('\n=== Phase 91b-3: Binary search for mode token buffer ===');

function probeRegion(label, fillStart, fillLen) {
  mem.set(ramSnap, 0x400000); clearVram(); resetCpu();
  // Fill target region with 0x00
  for (let i = 0; i < fillLen; i++) {
    if (fillStart + i < mem.length) mem[fillStart + i] = 0x00;
  }
  const chars = [];
  executor.runFrom(0x0a29ec, 'adl', {
    maxSteps: 50000, maxLoopIterations: 500,
    onBlock: (pc) => { if (pc === 0x0a1799) chars.push(cpu.a); }
  });
  const nonFF = chars.filter(c => c !== 0xFF);
  const allFF = nonFF.length === 0;
  console.log(`  ${label}: chars=${chars.length} allFF=${allFF}${!allFF ? ` nonFF=[${nonFF.map(c => '0x'+c.toString(16)).join(',')}]` : ''}`);
  return { chars, allFF, nonFF };
}

// 4KB blocks across D-bank
const regions = [
  [0xD00200, 0x400, '0xD00200-0xD005FF'],
  [0xD00600, 0x400, '0xD00600-0xD009FF'],
  [0xD00A00, 0x400, '0xD00A00-0xD00DFF'],
  [0xD00E00, 0x400, '0xD00E00-0xD011FF'],
  [0xD01200, 0x400, '0xD01200-0xD015FF'],
  [0xD01600, 0x400, '0xD01600-0xD019FF'],
  [0xD01A00, 0x400, '0xD01A00-0xD01DFF'],
  [0xD01E00, 0x400, '0xD01E00-0xD021FF'],
  [0xD02200, 0x800, '0xD02200-0xD029FF'],
  [0xD02A00, 0x800, '0xD02A00-0xD031FF'],
  [0xD03200, 0x800, '0xD03200-0xD039FF'],
  [0xD03A00, 0x800, '0xD03A00-0xD041FF'],
  [0xD10000, 0x1000, '0xD10000-0xD10FFF'],
  [0xD11000, 0x1000, '0xD11000-0xD11FFF'],
  [0xD18000, 0x2000, '0xD18000-0xD19FFF'],
  [0xD1A000, 0x2000, '0xD1A000-0xD1BFFF'],
];

const hits = [];
for (const [start, len, label] of regions) {
  const result = probeRegion(label, start, len);
  if (!result.allFF) hits.push({ label, start, len });
}

if (hits.length === 0) {
  console.log('\n  No region found — mode token buffer not in searched ranges.');
  console.log('  Next: try 0xD00000-0xD0007F range (zeroed by OS init).');
  // Try the zeroed region with fill=0x4F (mode "Normal" token)
  console.log('\n  Trying 0xD00000-0xD0007F fill with 0x4F (Normal token code):');
  mem.set(ramSnap, 0x400000); clearVram(); resetCpu();
  mem.fill(0x4F, 0xD00000, 0xD00080);
  const chars2 = [];
  executor.runFrom(0x0a29ec, 'adl', {
    maxSteps: 50000, maxLoopIterations: 500,
    onBlock: (pc) => { if (pc === 0x0a1799) chars2.push(cpu.a); }
  });
  const nonFF2 = chars2.filter(c => c !== 0xFF);
  console.log(`  0xD00000-0xD0007F fill=0x4F: chars=${chars2.length} nonFF=${nonFF2.length} nonFF=[${nonFF2.map(c=>'0x'+c.toString(16)).join(',')}]`);
} else {
  console.log(`\n  HIT regions: ${hits.map(h => h.label).join(', ')}`);
  console.log('  Bisecting hit region for exact buffer location...');
  // Bisect the first hit
  const hit = hits[0];
  let lo = hit.start, hi = hit.start + hit.len;
  while (hi - lo > 8) {
    const mid = (lo + hi) >> 1;
    const r = probeRegion(`bisect [0x${lo.toString(16)}, 0x${mid.toString(16)})`, lo, mid - lo);
    if (!r.allFF) { hi = mid; } else { lo = mid; }
  }
  console.log(`  Narrowed to ~0x${lo.toString(16)}-0x${hi.toString(16)}`);
  // Byte-by-byte in narrowed range
  console.log('\n  Byte-by-byte scan of narrowed range:');
  for (let addr = lo; addr < hi; addr++) {
    const origVal = ramSnap[addr - 0x400000];
    const testVal = origVal !== 0x00 ? 0x00 : 0x4F;
    mem.set(ramSnap, 0x400000); clearVram(); resetCpu();
    mem[addr] = testVal;
    const chars = [];
    executor.runFrom(0x0a29ec, 'adl', {
      maxSteps: 50000, maxLoopIterations: 500,
      onBlock: (pc) => { if (pc === 0x0a1799) chars.push(cpu.a); }
    });
    const nonFF = chars.filter(c => c !== 0xFF);
    if (nonFF.length > 0) {
      console.log(`  FOUND: 0x${addr.toString(16)} was=0x${origVal.toString(16)} set=0x${testVal.toString(16)} → nonFF chars: ${nonFF.map(c=>'0x'+c.toString(16)).join(' ')}`);
    }
  }
}

// ── Report ────────────────────────────────────────────────────────────────────
const reportLines = ['# Phase 91b — Memory Read Trace\n\n'];
reportLines.push(`## Char captures (${charCaptures.length} calls to 0x0a1799)\n`);
reportLines.push('| idx | charCode | col | last D-bank reads |\n|-----|----------|-----|---------------------|');
for (const cap of charCaptures) {
  const reads = cap.readsBeforeCall.map(r => `0x${r.addr.toString(16)}=0x${r.value.toString(16)}`).join(', ');
  reportLines.push(`| ${cap.idx} | 0x${cap.charCode.toString(16)} | ${cap.col} | ${reads} |`);
}
reportLines.push('\n## Frequent D-bank read addresses\n');
for (const [addr, count] of sorted) {
  const addrNum = parseInt(addr, 16);
  const snapVal = `0x${ramSnap[addrNum - 0x400000]?.toString(16)}`;
  reportLines.push(`- ${addr} count=${count} snapshot_val=${snapVal}`);
}
reportLines.push('\n## Binary search result\n');
if (hits.length === 0) {
  reportLines.push('No hit found in searched regions. Mode token buffer may be in ROM or computed dynamically.\n');
} else {
  reportLines.push(`Hit regions: ${hits.map(h => h.label).join(', ')}\n`);
}

fs.writeFileSync(path.join(__dirname, 'phase91b-mem-trace-report.md'), reportLines.join('\n'));
console.log('\nReport written to phase91b-mem-trace-report.md');
