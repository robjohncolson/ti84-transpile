#!/usr/bin/env node
// Overnight batch prober: after boot + OS init, iterate through the 980-entry
// OS jump table and call each function with minimal register state, recording
// termination type, VRAM writes, unique blocks visited, and any RAM touched.
//
// Output: TI-84_Plus_CE/os-function-survey.json (incremental, saved every 50 funcs)
//
// Goal: build a catalog of "which OS functions work end-to-end" that guides
// Phase 29's choice of VRAM-rendering routines to call for a real TI-OS display.
//
// Run: node --max-old-space-size=8192 TI-84_Plus_CE/probe-batch-os-functions.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const reportPath = path.join(__dirname, 'os-function-survey.json');

const hex = (v, w = 6) => '0x' + (v >>> 0).toString(16).padStart(w, '0');

// Build and warm one executor — we'll save/restore state snapshots rather than
// reconstructing the executor per call. Running OS init once at startup costs
// ~700 steps + 1M RAM writes; doing it 980 times would be wasteful.
const p = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
const mem = new Uint8Array(0x1000000);
mem.set(romBytes);
const ex = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals: p });
const cpu = ex.cpu;

console.log('[batch] boot...');
const bootResult = ex.runFrom(0x000000, 'z80', { maxSteps: 5000, maxLoopIterations: 32 });
console.log(`[batch] boot: ${bootResult.steps} steps → ${bootResult.termination} at ${hex(bootResult.lastPc)}`);

// Run OS init 0x08C331 once to establish state
console.log('[batch] running OS init handler 0x08C331...');
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = 0xD1A87E;
cpu.sp -= 3;
mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;
const initResult = ex.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });
console.log(`[batch] OS init: ${initResult.steps} steps → ${initResult.termination} at ${hex(initResult.lastPc)}`);
console.log(`[batch] callback=${hex(mem[0xD02AD7] | (mem[0xD02AD8] << 8) | (mem[0xD02AD9] << 16))}`);
console.log(`[batch] initFlag (0xD177BA)=${hex(mem[0xD177BA], 2)}`);

// Snapshot state after OS init — this is the starting point for each function call
const snapMem = new Uint8Array(mem);
const snapCpu = {
  a: cpu.a, f: cpu.f, bc: cpu.bc, de: cpu.de, hl: cpu.hl,
  sp: cpu.sp, ix: cpu._ix, iy: cpu._iy,
  i: cpu.i, r: cpu.r, iff1: cpu.iff1, iff2: cpu.iff2,
  im: cpu.im, madl: cpu.madl,
};

function restoreSnapshot() {
  mem.set(snapMem);
  cpu.a = snapCpu.a;
  cpu.f = snapCpu.f;
  cpu.bc = snapCpu.bc;
  cpu.de = snapCpu.de;
  cpu.hl = snapCpu.hl;
  cpu.sp = snapCpu.sp;
  cpu._ix = snapCpu.ix;
  cpu._iy = snapCpu.iy;
  cpu.i = snapCpu.i;
  cpu.r = snapCpu.r;
  cpu.iff1 = snapCpu.iff1;
  cpu.iff2 = snapCpu.iff2;
  cpu.im = snapCpu.im;
  cpu.madl = snapCpu.madl;
  cpu.halted = false;
}

// Read the OS jump table to get the 980 function addresses.
// Table format: starts at 0x020104, each entry is 4 bytes: C3 xx xx xx (JP imm24)
// The transpiler keeps a complete picture in PRELIFTED_BLOCKS; we can just read ROM.
const JUMP_TABLE_BASE = 0x020104;
const JUMP_TABLE_ENTRIES = 980;
const jumpTable = [];
for (let i = 0; i < JUMP_TABLE_ENTRIES; i++) {
  const slotAddr = JUMP_TABLE_BASE + i * 4;
  const opcode = romBytes[slotAddr];
  if (opcode !== 0xC3) continue; // not a JP — skip
  const target = romBytes[slotAddr + 1] | (romBytes[slotAddr + 2] << 8) | (romBytes[slotAddr + 3] << 16);
  jumpTable.push({ slot: i, slotAddr, target });
}
console.log(`[batch] jump table: ${jumpTable.length} valid JP entries loaded`);

// For each function, call it with a clean state snapshot and record results.
// We try three different entry modes: empty args, small A value, full register setup.
const results = [];
const startTime = Date.now();
let lastSave = startTime;

function callFunction(target, regs = {}) {
  restoreSnapshot();
  cpu.a = regs.a ?? 0x00;
  if (regs.bc !== undefined) cpu.bc = regs.bc;
  if (regs.de !== undefined) cpu.de = regs.de;
  if (regs.hl !== undefined) cpu.hl = regs.hl;
  // Push sentinel return address
  cpu.sp -= 3;
  mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;

  // Snapshot VRAM before call
  let vramBefore = 0;
  for (let i = 0xD40000; i < 0xD40000 + 320 * 240 * 2; i++) if (mem[i] !== 0) vramBefore++;

  // Run with tight bounds — we don't want any single call to eat all our budget
  let blocks = 0;
  const regionHits = new Set();
  const result = ex.runFrom(target, 'adl', {
    maxSteps: 5000,
    maxLoopIterations: 200,
    onBlock: (pc) => {
      blocks++;
      regionHits.add((pc >> 16) & 0xFF);
    },
  });

  // Snapshot VRAM after
  let vramAfter = 0;
  for (let i = 0xD40000; i < 0xD40000 + 320 * 240 * 2; i++) if (mem[i] !== 0) vramAfter++;

  return {
    steps: result.steps,
    termination: result.termination,
    lastPc: result.lastPc,
    blocks,
    regions: [...regionHits].sort((a, b) => a - b),
    vramBefore,
    vramAfter,
    vramDelta: vramAfter - vramBefore,
    missingCount: result.missingBlocks?.length ?? 0,
  };
}

function saveReport() {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const payload = {
    generatedAt: new Date().toISOString(),
    elapsedSeconds: Number(elapsed),
    tableEntriesTotal: jumpTable.length,
    resultsTotal: results.length,
    results,
  };
  fs.writeFileSync(reportPath, JSON.stringify(payload, null, 2));
}

console.log(`[batch] starting batch call loop over ${jumpTable.length} jump table entries...`);
console.log(`[batch] each entry tested with 3 register-state variants`);
console.log(`[batch] report will be saved to ${path.relative(__dirname, reportPath)}`);
console.log();

const variants = [
  { name: 'zero',   regs: { a: 0x00 } },
  { name: 'char',   regs: { a: 0x48 } }, // 'H'
  { name: 'medium', regs: { a: 0x80, bc: 0x000010, de: 0x000020, hl: 0x000030 } },
];

for (let i = 0; i < jumpTable.length; i++) {
  const entry = jumpTable[i];
  const slotHex = hex(entry.slotAddr);
  const targetHex = hex(entry.target);

  const entryResults = {};
  for (const variant of variants) {
    try {
      entryResults[variant.name] = callFunction(entry.target, variant.regs);
    } catch (err) {
      entryResults[variant.name] = { error: String(err).slice(0, 200) };
    }
  }

  results.push({
    slot: entry.slot,
    slotAddr: slotHex,
    target: targetHex,
    variants: entryResults,
  });

  // Log progress (every 10) and incremental save (every 50)
  if ((i + 1) % 10 === 0 || i === jumpTable.length - 1) {
    const anyVram = Math.max(
      entryResults.zero?.vramDelta ?? 0,
      entryResults.char?.vramDelta ?? 0,
      entryResults.medium?.vramDelta ?? 0,
    );
    const tag = anyVram > 0 ? ` VRAM+${anyVram}` : '';
    console.log(`[${i + 1}/${jumpTable.length}] slot=${entry.slot} target=${targetHex}${tag}`);
  }
  if ((i + 1) % 50 === 0) {
    saveReport();
    lastSave = Date.now();
  }
}

saveReport();
const elapsedTotal = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\n[batch] done: ${results.length} entries tested in ${elapsedTotal}s`);

// Summary: group by interesting behavior
const vramWriters = results.filter(r =>
  (r.variants.zero?.vramDelta ?? 0) > 0 ||
  (r.variants.char?.vramDelta ?? 0) > 0 ||
  (r.variants.medium?.vramDelta ?? 0) > 0
);
const cleanReturns = results.filter(r =>
  Object.values(r.variants).every(v => v && v.termination === 'missing_block')
);
const crashers = results.filter(r =>
  Object.values(r.variants).some(v => v && v.error)
);

console.log(`[batch] VRAM writers: ${vramWriters.length}`);
console.log(`[batch] clean returners: ${cleanReturns.length}`);
console.log(`[batch] throwing calls: ${crashers.length}`);

if (vramWriters.length > 0) {
  console.log(`\nTop VRAM writers (by max delta across variants):`);
  const ranked = vramWriters
    .map(r => ({
      target: r.target,
      slot: r.slot,
      maxDelta: Math.max(
        r.variants.zero?.vramDelta ?? 0,
        r.variants.char?.vramDelta ?? 0,
        r.variants.medium?.vramDelta ?? 0,
      ),
    }))
    .sort((a, b) => b.maxDelta - a.maxDelta)
    .slice(0, 20);
  for (const r of ranked) {
    console.log(`  slot ${r.slot} (${r.target}): +${r.maxDelta} VRAM bytes`);
  }
}
