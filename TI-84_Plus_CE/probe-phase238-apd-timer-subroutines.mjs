#!/usr/bin/env node

/**
 * Phase 238: APD Timer Threshold Subroutines Investigation
 *
 * Session 237 decoded 0x03030E as an APD (Auto Power Down) timer check.
 * It compares HL against thresholds 0xFFFF/0xFFFE/0xFFFD for idle timeout
 * stages, calling subroutines at each stage.
 *
 * Part 1: Trace each subroutine individually:
 *   - 0x07F9FB — suspected display refresh
 *   - 0x08383D — suspected display refresh
 *   - 0x03E141 — suspected APD warning
 *   - 0x063051 — suspected editor refresh
 *   - 0x061DEF — suspected editor refresh
 *
 * Part 2: Trace 0x03030E with different HL values (0xFFFF, 0xFFFE, 0xFFFD, 0x0000)
 *   to see which subroutines are called at each threshold.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;
const RETURN_SENTINEL = 0x7FFFFE;
const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IY_BASE = 0xD00080;
const IX_BASE = 0xD1A860;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

// --- Helpers ---

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function blockKey(addr, mode = 'adl') {
  return `${(addr >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function blockMethodName(addr, mode = 'adl') {
  return `block_${(addr >>> 0).toString(16).padStart(6, '0')}_${mode === 'adl' ? 1 : 0}`;
}

function write24(mem, addr, value) {
  const a = addr & MEM_MASK;
  mem[a] = value & 0xFF;
  mem[(a + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(a + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function read24(mem, addr) {
  const a = addr & MEM_MASK;
  return mem[a] | (mem[(a + 1) & MEM_MASK] << 8) | (mem[(a + 2) & MEM_MASK] << 16);
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
}

// --- Cold boot (from probe-phase99d) ---

function coldBoot(executor, cpu, mem) {
  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  return result;
}

// --- Step shim ---

function installStepShim(cpu, executor) {
  if (!executor?.compiledBlocks) {
    throw new Error('Executor compiledBlocks are required for cpu.step() tracing.');
  }

  cpu.step = function step() {
    const mode = this.madl ? 'adl' : 'z80';
    const pc = this.pc & 0xFFFFFF;
    const key = blockKey(pc, mode);
    const method = blockMethodName(pc, mode);

    if (typeof this[method] !== 'function') {
      const fn = executor.compiledBlocks[key];
      if (typeof fn === 'function') {
        this[method] = fn;
      }
    }

    const fn = this[method];
    if (typeof fn !== 'function') {
      throw new Error(`Missing block function for ${hex(pc)} (${key})`);
    }

    const result = fn(this);
    if (typeof result !== 'number') {
      throw new Error(`Unexpected step result from ${hex(pc)}: ${String(result)}`);
    }

    if (result >= 0) {
      this.pc = result & 0xFFFFFF;
    }

    return result;
  };
}

// --- Snapshot helpers ---

function snapshotVram(mem, start, end) {
  return new Uint8Array(mem.slice(start, end));
}

function diffVram(before, after) {
  let changed = 0;
  for (let i = 0; i < before.length; i++) {
    if (before[i] !== after[i]) changed++;
  }
  return changed;
}

function snapshotIyRange(mem, iyBase, count) {
  const snap = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    snap[i] = mem[(iyBase + i) & MEM_MASK];
  }
  return snap;
}

function diffIyRange(before, after) {
  const changes = [];
  for (let i = 0; i < before.length; i++) {
    if (before[i] !== after[i]) {
      changes.push({ offset: i, before: before[i], after: after[i] });
    }
  }
  return changes;
}

function snapshotDisplayRam(mem) {
  // D005xx, D006xx, D00Axx
  const regions = [
    { name: 'D005xx', start: 0xD00500, end: 0xD00600 },
    { name: 'D006xx', start: 0xD00600, end: 0xD00700 },
    { name: 'D00Axx', start: 0xD00A00, end: 0xD00B00 },
  ];
  const snap = {};
  for (const r of regions) {
    snap[r.name] = new Uint8Array(mem.slice(r.start, r.end));
  }
  return snap;
}

function diffDisplayRam(before, after) {
  const changes = {};
  for (const name of Object.keys(before)) {
    let count = 0;
    for (let i = 0; i < before[name].length; i++) {
      if (before[name][i] !== after[name][i]) count++;
    }
    if (count > 0) changes[name] = count;
  }
  return changes;
}

// --- Subroutine targets ---

const SUBROUTINES = [
  { addr: 0x07F9FB, label: 'suspected display refresh (1)' },
  { addr: 0x08383D, label: 'suspected display refresh (2)' },
  { addr: 0x03E141, label: 'suspected APD warning' },
  { addr: 0x063051, label: 'suspected editor refresh (1)' },
  { addr: 0x061DEF, label: 'suspected editor refresh (2)' },
];

const APD_ENTRY = 0x03030E;
const APD_THRESHOLDS = [
  { hl: 0xFFFF, label: 'HL=0xFFFF (first threshold)' },
  { hl: 0xFFFE, label: 'HL=0xFFFE (second threshold)' },
  { hl: 0xFFFD, label: 'HL=0xFFFD (third threshold)' },
  { hl: 0x0000, label: 'HL=0x0000 (control — no match)' },
];

// Known subroutine addresses for classification
const KNOWN_SUBS = new Set([0x07F9FB, 0x08383D, 0x03E141, 0x063051, 0x061DEF]);

// --- Part 1: Trace each subroutine ---

function traceSubroutine(entryAddr, label, baseMem, baseExecutor, baseCpu) {
  console.log(`========================================================================`);
  console.log(`SUBROUTINE TRACE: ${hex(entryAddr)} — ${label}`);
  console.log(`========================================================================`);

  // Create fresh runtime for isolation
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(baseMem);

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  installStepShim(cpu, executor);

  // Set up CPU with home-screen state
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.pc = entryAddr;
  cpu.sp = STACK_TOP;
  cpu.iy = IY_BASE;
  cpu.ix = IX_BASE;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40; // Z flag set

  // Push return sentinel
  push24(cpu, mem, RETURN_SENTINEL);

  // Snapshots before
  const vramBefore = snapshotVram(mem, 0xD40000, 0xD40100);
  const iyBefore = snapshotIyRange(mem, IY_BASE, 101);
  const dispBefore = snapshotDisplayRam(mem);

  const MAX_STEPS = 500;
  const visited = new Map(); // addr -> count
  const blockChain = [];
  let steps = 0;
  let stopReason = 'max_steps';
  let retStep = -1;

  try {
    for (let i = 0; i < MAX_STEPS; i++) {
      const pc = cpu.pc & 0xFFFFFF;
      visited.set(pc, (visited.get(pc) || 0) + 1);
      blockChain.push(pc);
      steps = i + 1;

      if (pc === RETURN_SENTINEL) {
        stopReason = 'return_sentinel (RET)';
        retStep = i;
        break;
      }
      if (cpu.halted) {
        stopReason = 'HALT';
        break;
      }

      cpu.step();
    }
  } catch (err) {
    stopReason = `error: ${err?.message ?? String(err)}`;
  }

  // Snapshots after
  const vramAfter = snapshotVram(mem, 0xD40000, 0xD40100);
  const iyAfter = snapshotIyRange(mem, IY_BASE, 101);
  const dispAfter = snapshotDisplayRam(mem);

  const vramChanged = diffVram(vramBefore, vramAfter);
  const iyChanges = diffIyRange(iyBefore, iyAfter);
  const dispChanges = diffDisplayRam(dispBefore, dispAfter);

  // Also check broader VRAM region
  let broadVramWrites = 0;
  for (let i = 0xD40000; i < 0xD52C00; i++) {
    if (mem[i] !== baseMem[i]) broadVramWrites++;
  }

  // Print results
  console.log(`Stop reason:    ${stopReason}`);
  console.log(`Steps to RET:   ${retStep >= 0 ? retStep : 'did not return'}`);
  console.log(`Total steps:    ${steps}`);
  console.log(`Unique blocks:  ${visited.size}`);
  console.log(`Final regs: A=${hexByte(cpu.a)} F=${hexByte(cpu.f)} BC=${hex(cpu.bc)} DE=${hex(cpu.de)} HL=${hex(cpu.hl)}`);
  console.log(`            SP=${hex(cpu.sp)} IY=${hex(cpu.iy)} IX=${hex(cpu.ix)}`);

  // Block chain (abbreviated)
  if (blockChain.length <= 30) {
    console.log(`Block chain: ${blockChain.map(pc => hex(pc)).join(' -> ')}`);
  } else {
    const first15 = blockChain.slice(0, 15).map(pc => hex(pc)).join(' -> ');
    const last10 = blockChain.slice(-10).map(pc => hex(pc)).join(' -> ');
    console.log(`Block chain (first 15): ${first15}`);
    console.log(`Block chain (last 10):  ${last10}`);
  }

  // Unique blocks with counts
  console.log(`\nUnique blocks visited (${visited.size}):`);
  const sortedBlocks = [...visited.entries()].sort((a, b) => a[0] - b[0]);
  for (const [addr, count] of sortedBlocks) {
    if (addr === RETURN_SENTINEL) continue;
    const marker = KNOWN_SUBS.has(addr) ? ' <-- APD SUBROUTINE' : '';
    console.log(`  ${hex(addr)}: ${count}x${marker}`);
  }

  // VRAM changes
  console.log(`\nVRAM D40000-D400FF: ${vramChanged} bytes changed`);
  console.log(`VRAM D40000-D52BFF (full LCD): ${broadVramWrites} bytes changed`);

  // IY flag changes
  if (iyChanges.length > 0) {
    console.log(`IY flag changes (${iyChanges.length}):`);
    for (const c of iyChanges) {
      console.log(`  IY+${c.offset}: ${hexByte(c.before)} -> ${hexByte(c.after)}`);
    }
  } else {
    console.log('IY flag changes: none');
  }

  // Display RAM changes
  const dispKeys = Object.keys(dispChanges);
  if (dispKeys.length > 0) {
    console.log('Display RAM changes:');
    for (const name of dispKeys) {
      console.log(`  ${name}: ${dispChanges[name]} bytes changed`);
    }
  } else {
    console.log('Display RAM changes: none');
  }

  // Classification
  const classification = classifySubroutine({
    vramChanged,
    broadVramWrites,
    iyChanges,
    dispChanges,
    visited,
    stopReason,
    retStep,
    steps,
  });
  console.log(`\nCLASSIFICATION: ${classification}`);
  console.log('');

  return {
    addr: entryAddr,
    label,
    stopReason,
    retStep,
    steps,
    uniqueBlocks: visited.size,
    vramChanged,
    broadVramWrites,
    iyChanges: iyChanges.length,
    dispChanges: dispKeys.length > 0 ? dispChanges : null,
    classification,
  };
}

function classifySubroutine({ vramChanged, broadVramWrites, iyChanges, dispChanges, visited, stopReason, retStep, steps }) {
  const clues = [];

  if (broadVramWrites > 100) {
    clues.push('display refresh (heavy VRAM writes)');
  } else if (broadVramWrites > 0 || vramChanged > 0) {
    clues.push('display update (some VRAM writes)');
  }

  const dispKeys = Object.keys(dispChanges);
  if (dispKeys.length > 0) {
    clues.push(`display RAM update (${dispKeys.join(', ')})`);
  }

  if (iyChanges.length > 0) {
    const offsets = iyChanges.map(c => c.offset);
    clues.push(`IY flag modification (offsets: ${offsets.join(', ')})`);
  }

  if (stopReason.includes('HALT')) {
    clues.push('APD shutdown (reaches HALT)');
  }

  if (retStep >= 0 && retStep <= 5) {
    clues.push('quick return (early bail)');
  }

  // Check for known cursor-blink related addresses
  if (visited.has(0xD007E0) || visited.has(0xD007E2)) {
    clues.push('cursor-related');
  }

  if (visited.size > 20) {
    clues.push(`complex (${visited.size} unique blocks)`);
  } else if (visited.size <= 5) {
    clues.push(`simple (${visited.size} blocks)`);
  }

  return clues.length > 0 ? clues.join('; ') : 'unknown purpose';
}

// --- Part 2: Trace 0x03030E with different HL values ---

function traceApdEntry(hlValue, label, baseMem) {
  console.log(`------------------------------------------------------------------------`);
  console.log(`APD ENTRY ${hex(APD_ENTRY)} with ${label}`);
  console.log(`------------------------------------------------------------------------`);

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(baseMem);

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  installStepShim(cpu, executor);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.pc = APD_ENTRY;
  cpu.sp = STACK_TOP;
  cpu.iy = IY_BASE;
  cpu.ix = IX_BASE;
  cpu.hl = hlValue;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40;

  push24(cpu, mem, RETURN_SENTINEL);

  const MAX_STEPS = 100;
  const blockChain = [];
  const subsHit = [];
  let steps = 0;
  let stopReason = 'max_steps';

  try {
    for (let i = 0; i < MAX_STEPS; i++) {
      const pc = cpu.pc & 0xFFFFFF;
      blockChain.push(pc);
      steps = i + 1;

      if (pc === RETURN_SENTINEL) {
        stopReason = 'return_sentinel (RET)';
        break;
      }
      if (cpu.halted) {
        stopReason = 'HALT';
        break;
      }

      // Track if we hit any known subroutines
      if (KNOWN_SUBS.has(pc)) {
        subsHit.push(pc);
      }

      cpu.step();
    }
  } catch (err) {
    stopReason = `error: ${err?.message ?? String(err)}`;
  }

  // Show path
  const chainStr = blockChain.length <= 40
    ? blockChain.map(pc => hex(pc)).join(' -> ')
    : blockChain.slice(0, 20).map(pc => hex(pc)).join(' -> ') + ' ... ' +
      blockChain.slice(-10).map(pc => hex(pc)).join(' -> ');

  console.log(`Stop: ${stopReason} after ${steps} steps`);
  console.log(`Path: ${chainStr}`);

  if (subsHit.length > 0) {
    console.log(`Subroutines called: ${subsHit.map(a => hex(a)).join(', ')}`);
  } else {
    console.log('Subroutines called: none of the 5 targets');
  }
  console.log('');

  return {
    hl: hlValue,
    label,
    stopReason,
    steps,
    subsHit,
    path: blockChain,
  };
}

// --- Main ---

async function main() {
  console.log('Phase 238: APD Timer Threshold Subroutines Investigation');
  console.log(`ROM: ${path.basename(ROM_PATH)} (${romBytes.length} bytes)`);
  console.log('Timer interrupt: disabled');
  console.log('');

  // Boot the machine
  console.log('--- Booting machine ---');
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const bootResult = coldBoot(executor, cpu, mem);
  console.log(`Boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);
  console.log('');

  // Save booted state for reuse
  const bootedMem = new Uint8Array(mem);

  // =====================================================================
  // Part 1: Trace each subroutine individually
  // =====================================================================
  console.log('========================================================================');
  console.log('PART 1: Individual Subroutine Traces');
  console.log('========================================================================');
  console.log('');

  const subResults = [];
  for (const sub of SUBROUTINES) {
    const result = traceSubroutine(sub.addr, sub.label, bootedMem, executor, cpu);
    subResults.push(result);
  }

  // =====================================================================
  // Part 2: Trace 0x03030E with different HL values
  // =====================================================================
  console.log('========================================================================');
  console.log('PART 2: APD Entry (0x03030E) with Different HL Values');
  console.log('========================================================================');
  console.log('');

  const apdResults = [];
  for (const threshold of APD_THRESHOLDS) {
    const result = traceApdEntry(threshold.hl, threshold.label, bootedMem);
    apdResults.push(result);
  }

  // =====================================================================
  // Summary Table
  // =====================================================================
  console.log('========================================================================');
  console.log('SUMMARY');
  console.log('========================================================================');
  console.log('');

  console.log('--- Part 1: Subroutine Classification ---');
  console.log('');
  console.log('Address    | Steps | RET? | VRAM  | IY chg | Disp RAM | Classification');
  console.log('-----------|-------|------|-------|--------|----------|-------------------------------------------');
  for (const r of subResults) {
    const retStr = r.retStep >= 0 ? `${r.retStep}` : 'no';
    const dispStr = r.dispChanges ? Object.entries(r.dispChanges).map(([k,v]) => `${k}:${v}`).join(',') : '-';
    console.log(
      `${hex(r.addr)} | ${String(r.steps).padStart(5)} | ${retStr.padStart(4)} | ${String(r.broadVramWrites).padStart(5)} | ${String(r.iyChanges).padStart(6)} | ${dispStr.padEnd(8)} | ${r.classification}`
    );
  }

  console.log('');
  console.log('--- Part 2: Threshold -> Subroutine Mapping ---');
  console.log('');
  console.log('HL Value | Steps | Stop Reason                | Subroutines Hit');
  console.log('---------|-------|----------------------------|--------------------------------------------');
  for (const r of apdResults) {
    const subsStr = r.subsHit.length > 0
      ? r.subsHit.map(a => hex(a)).join(', ')
      : '(none)';
    console.log(
      `${hex(r.hl, 4)}   | ${String(r.steps).padStart(5)} | ${r.stopReason.padEnd(26)} | ${subsStr}`
    );
  }

  console.log('');
  console.log('DONE');
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
