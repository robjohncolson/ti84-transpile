#!/usr/bin/env node
// Overnight survey runner: runs the full OS jump-table prober in a loop,
// varying register inputs each pass, and accumulates results to a growing
// JSONL file. Designed to run unattended for 4-8 hours.
//
// Output file: TI-84_Plus_CE/os-survey.jsonl — one JSON object per pass
// Also writes: TI-84_Plus_CE/os-survey-summary.json — aggregated summary
//
// Stop condition: wall-clock deadline (default 7.5 hours) or SIGINT

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const jsonlPath = path.join(__dirname, 'os-survey.jsonl');
const summaryPath = path.join(__dirname, 'os-survey-summary.json');
const progressPath = path.join(__dirname, 'os-survey-progress.log');

const hex = (v, w = 6) => '0x' + (v >>> 0).toString(16).padStart(w, '0');

// Parse CLI args
const args = process.argv.slice(2);
const getArg = (name, def) => {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1] : def;
};
const hoursLimit = Number(getArg('--hours', '7.5'));
const deadlineMs = Date.now() + hoursLimit * 3600 * 1000;

function logLine(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(progressPath, line + '\n'); } catch {}
}

logLine(`overnight survey started, deadline in ${hoursLimit}h (${new Date(deadlineMs).toISOString()})`);

// Fresh state setup — done once, snapshotted, reused per function call within a pass.
function setupFreshState() {
  const p = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);
  const ex = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals: p });
  const cpu = ex.cpu;

  // Boot
  ex.runFrom(0x000000, 'z80', { maxSteps: 5000, maxLoopIterations: 32 });

  // Run OS init
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = 0xD1A87E;
  cpu.sp -= 3;
  mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;
  ex.runFrom(0x08C331, 'adl', { maxSteps: 100000, maxLoopIterations: 500 });

  return { mem, cpu, ex };
}

// Load jump table entries
const JUMP_TABLE_BASE = 0x020104;
const JUMP_TABLE_ENTRIES = 980;
const jumpTable = [];
for (let i = 0; i < JUMP_TABLE_ENTRIES; i++) {
  const slotAddr = JUMP_TABLE_BASE + i * 4;
  if (romBytes[slotAddr] !== 0xC3) continue;
  const target = romBytes[slotAddr + 1] | (romBytes[slotAddr + 2] << 8) | (romBytes[slotAddr + 3] << 16);
  jumpTable.push({ slot: i, slotAddr, target, source: 'jump-table' });
}
logLine(`loaded ${jumpTable.length} valid JP entries from jump table`);

// Known interesting internal addresses (not in jump table but write VRAM or do useful work)
// Found via grep of "ld hl, 0xd40000" and surrounding function analysis.
const internalAddrs = [
  { slot: -1, target: 0x005b96, source: 'internal-known', name: 'VRAM fill 0xff' },
  { slot: -2, target: 0x0059c6, source: 'internal-known', name: '_PutC-ish char print' },
  { slot: -3, target: 0x005a75, source: 'internal-known', name: 'print inner (post-prologue)' },
  { slot: -4, target: 0x045d26, source: 'internal-known', name: 'VRAM init via 0x046b4c' },
  { slot: -5, target: 0x04cb8d, source: 'internal-known', name: 'pixel position calc' },
  { slot: -6, target: 0x055202, source: 'internal-known', name: 'VRAM fill via IY' },
  { slot: -7, target: 0x0159C0, source: 'internal-known', name: 'keyboard scan' },
  { slot: -8, target: 0x03CF7D, source: 'internal-known', name: '_GetCSC' },
];
const allTargets = [...internalAddrs, ...jumpTable];
logLine(`total probe targets: ${allTargets.length} (${internalAddrs.length} known internal + ${jumpTable.length} jump table)`);

// Pre-generate register variant sets — each pass uses one variant set.
// Variant generation is deterministic from pass index, so we can reproduce.
function generateVariant(passIdx) {
  const a = (passIdx * 7 + 1) & 0xFF;
  const bc = (passIdx * 123 + 0x10) & 0xFFFFFF;
  const de = (passIdx * 41 + 0x80) & 0xFFFFFF;
  const hl = (passIdx * 17 + 0x200) & 0xFFFFFF;
  return { a, bc, de, hl };
}

// Aggregate stats over all passes
const perFuncStats = new Map(); // slot → { totalCalls, vramHits, uniqueTerminations: Set, maxBlocks, maxVramDelta }
function updateStats(key, result) {
  let s = perFuncStats.get(key);
  if (!s) {
    s = { key, target: result.target, totalCalls: 0, vramHits: 0, terminations: new Set(), maxBlocks: 0, maxVramWrites: 0, errors: 0 };
    perFuncStats.set(key, s);
  }
  s.totalCalls++;
  if (result.error) { s.errors++; return; }
  s.terminations.add(result.termination);
  if (result.blocks > s.maxBlocks) s.maxBlocks = result.blocks;
  if ((result.vramWrites ?? 0) > 0) s.vramHits++;
  if ((result.vramWrites ?? 0) > s.maxVramWrites) s.maxVramWrites = result.vramWrites;
}

function writeSummary(passCount) {
  const vramWriters = [];
  const deepExecutors = [];
  for (const [key, s] of perFuncStats) {
    const entry = { ...s, target: hex(s.target), terminations: [...s.terminations] };
    if (s.maxVramWrites > 0) vramWriters.push(entry);
    if (s.maxBlocks > 50) deepExecutors.push(entry);
  }
  vramWriters.sort((a, b) => b.maxVramWrites - a.maxVramWrites);
  deepExecutors.sort((a, b) => b.maxBlocks - a.maxBlocks);

  const summary = {
    generatedAt: new Date().toISOString(),
    passCount,
    vramWriterCount: vramWriters.length,
    deepExecutorCount: deepExecutors.length,
    vramWriters: vramWriters.slice(0, 50),
    deepExecutors: deepExecutors.slice(0, 50),
  };
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
}

let passIdx = 0;

while (Date.now() < deadlineMs) {
  const passStart = Date.now();
  const variant = generateVariant(passIdx);
  logLine(`pass ${passIdx}: A=${hex(variant.a, 2)} BC=${hex(variant.bc)} DE=${hex(variant.de)} HL=${hex(variant.hl)}`);

  // Fresh executor per pass (isolates state between passes)
  let state;
  try {
    state = setupFreshState();
  } catch (err) {
    logLine(`pass ${passIdx}: setup failed: ${err.message}`);
    break;
  }

  const { mem, cpu, ex } = state;
  // Snapshot post-init state
  const snapMem = new Uint8Array(mem);
  const snapRegs = {
    a: cpu.a, f: cpu.f, bc: cpu.bc, de: cpu.de, hl: cpu.hl,
    sp: cpu.sp, ix: cpu._ix, iy: cpu._iy,
    i: cpu.i, r: cpu.r, iff1: cpu.iff1, iff2: cpu.iff2, im: cpu.im, madl: cpu.madl,
  };

  function restore() {
    mem.set(snapMem);
    cpu.a = snapRegs.a;
    cpu.f = snapRegs.f;
    cpu.bc = snapRegs.bc;
    cpu.de = snapRegs.de;
    cpu.hl = snapRegs.hl;
    cpu.sp = snapRegs.sp;
    cpu._ix = snapRegs.ix;
    cpu._iy = snapRegs.iy;
    cpu.i = snapRegs.i;
    cpu.r = snapRegs.r;
    cpu.iff1 = snapRegs.iff1;
    cpu.iff2 = snapRegs.iff2;
    cpu.im = snapRegs.im;
    cpu.madl = snapRegs.madl;
    cpu.halted = false;
  }

  const passResults = [];
  for (const entry of allTargets) {
    if (Date.now() >= deadlineMs) break;

    restore();
    cpu.a = variant.a;
    cpu.bc = variant.bc;
    cpu.de = variant.de;
    cpu.hl = variant.hl;
    cpu.sp -= 3;
    mem[cpu.sp] = 0xFF; mem[cpu.sp + 1] = 0xFF; mem[cpu.sp + 2] = 0xFF;

    // Track VRAM writes via a wrapper rather than full scan — much faster
    let vramWrites = 0;
    const origWrite = cpu.write8.bind(cpu);
    cpu.write8 = function(addr, value) {
      if (addr >= 0xD40000 && addr < 0xD40000 + 320 * 240 * 2) vramWrites++;
      return origWrite(addr, value);
    };

    let blocks = 0;
    const regionSet = new Set();
    let callResult;
    try {
      const r = ex.runFrom(entry.target, 'adl', {
        maxSteps: 2000,
        maxLoopIterations: 200,
        onBlock: (pc) => { blocks++; regionSet.add((pc >> 16) & 0xFF); },
      });
      callResult = {
        slot: entry.slot,
        target: entry.target,
        source: entry.source ?? 'jump-table',
        steps: r.steps,
        termination: r.termination,
        blocks,
        regions: [...regionSet].sort((a, b) => a - b),
        vramWrites,
      };
    } catch (err) {
      callResult = { slot: entry.slot, target: entry.target, error: String(err).slice(0, 200) };
    }
    cpu.write8 = origWrite;
    passResults.push(callResult);
    // Use target as stats key (slot can be negative for internal addrs)
    updateStats(entry.target, callResult);
  }

  const passElapsed = ((Date.now() - passStart) / 1000).toFixed(1);
  const vramHitsThisPass = passResults.filter(r => (r.vramWrites ?? 0) > 0).length;

  // Append compact pass record to JSONL
  const passRecord = {
    passIdx,
    completedAt: new Date().toISOString(),
    elapsedSec: Number(passElapsed),
    variant,
    callCount: passResults.length,
    vramHitsThisPass,
    // Only record interesting results to keep JSONL small
    interesting: passResults.filter(r =>
      (r.vramWrites ?? 0) > 0 ||
      (r.blocks ?? 0) > 50 ||
      r.error
    ).map(r => ({ ...r, target: hex(r.target) })),
  };
  fs.appendFileSync(jsonlPath, JSON.stringify(passRecord) + '\n');

  logLine(`pass ${passIdx} done: ${passElapsed}s, ${passResults.length} calls, ${vramHitsThisPass} VRAM hits`);

  // Update summary every 10 passes
  if ((passIdx + 1) % 10 === 0) {
    writeSummary(passIdx + 1);
    logLine(`summary written at pass ${passIdx + 1}`);
  }

  passIdx++;
}

writeSummary(passIdx);
logLine(`survey finished after ${passIdx} passes`);
