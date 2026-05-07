#!/usr/bin/env node

/**
 * Phase 225: Trace 0x02F68A key pipeline with extended step counts
 *
 * Context: Session 223 traced 0x02F68A with only 500 steps — not enough for
 * the function to return. 0x02F68A is a 334-byte key processing pipeline
 * (0x02F68A-0x02F7D7), called from 0x04AB91 (_GetKey). The function:
 *   - Creates IX frame via CALL 0x00012C (2 local vars IX-1, IX-2)
 *   - Reads port 0x3082 (USB/keyboard status)
 *   - Calls 0x049E07 TWICE (state-byte reader, returns A from D177B8)
 *   - CP cascade: 0x8E, 0x91, 0xFF, 0x01, 0x9B, 0xFE
 *   - Sub-function 0x02F961 writes to (D0058E)
 *   - 25 sub-calls; 500 steps insufficient due to heavyweight init in 0x048AC4
 *
 * Parts:
 *  A. Extended step trace: 2000, 5000, 10000 steps with D177B8=0x8F
 *  B. Different D177B8 values: 0x8F (digit), 0x76 (LOG), 0x00 (no key)
 *  C. Summary of function behavior across all runs
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZIP_PATH = `${TRANSPILED_PATH}.gz`;

if (!existsSync(ROM_PATH)) {
  throw new Error('ROM.rom is missing.');
}
if (!existsSync(TRANSPILED_PATH)) {
  throw new Error(
    existsSync(TRANSPILED_GZIP_PATH)
      ? 'ROM.transpiled.js is missing. Gunzip ROM.transpiled.js.gz first.'
      : 'ROM.transpiled.js is missing.',
  );
}

const rom = readFileSync(ROM_PATH);
const transpiledModule = await import('./ROM.transpiled.js');
const PRELIFTED_BLOCKS =
  transpiledModule.PRELIFTED_BLOCKS ??
  transpiledModule.default?.PRELIFTED_BLOCKS ??
  transpiledModule.default ??
  transpiledModule;
const BLOCKS = normalizeBlocks(PRELIFTED_BLOCKS);

const ROM_SIZE = rom.length;
const MEM_SIZE = 0x1000000;

// Key addresses
const TARGET_FUNC = 0x02F68A;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;

const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;

// RAM variables to watch
const D177B8 = 0xD177B8; // key code input
const D177B9 = 0xD177B9; // case selector / state byte
const D0058E = 0xD0058E; // GetCSC scan code output
const D00824 = 0xD00824; // key code storage
const D0059F = 0xD0059F; // key flags

// Additional key RAM vars for context
const KBD_RAW_SCAN = 0xD00587;
const KBD_KEY = 0xD0058C;
const KBD_GETKY = 0xD0058D;

/* ── Utility helpers ─────────────────────────────────────────────── */

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
}

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function write24(mem, addr, value) {
  const normalized = addr & 0xFFFFFF;
  mem[normalized] = value & 0xFF;
  mem[normalized + 1] = (value >>> 8) & 0xFF;
  mem[normalized + 2] = (value >>> 16) & 0xFF;
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
}

function stopError(name, detail = null) {
  const error = new Error('__PHASE225_STOP__');
  error.stopName = name;
  error.detail = detail;
  return error;
}

/* ── Boot baseline (same as phase 223/224) ──────────────────────── */

function createMemoryWithRom() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(mem.length, rom.length)));
  return mem;
}

function createRuntime(mem) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { executor, cpu: executor.cpu };
}

function resetCpuState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.ix = IX_ADDR;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP;
  mem.fill(0xFF, Math.max(0, STACK_TOP - 0x80), Math.min(mem.length, STACK_TOP + 0x20));
}

function bootBaseline() {
  const mem = createMemoryWithRom();
  const { executor, cpu } = createRuntime(mem);

  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  resetCpuState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);

  let memInitReturned = false;
  try {
    executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: 8192,
      onBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) {
          throw stopError('mem_init_return');
        }
      },
      onMissingBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) {
          throw stopError('mem_init_return');
        }
      },
    });
  } catch (error) {
    if (error?.message === '__PHASE225_STOP__' && error.stopName === 'mem_init_return') {
      memInitReturned = true;
    } else {
      throw error;
    }
  }

  console.log('  Boot baseline complete.');
  console.log(`    memInit returned via sentinel: ${memInitReturned ? 'yes' : 'no'}`);

  return new Uint8Array(mem);
}

/* ── Core trace function ────────────────────────────────────────── */

function traceFunction(baselineMemory, opts) {
  const { d177b8, d177b9, maxSteps, label } = opts;

  console.log(`\n--- Trace: ${label} (maxSteps=${maxSteps}) ---`);

  const mem = new Uint8Array(baselineMemory);
  const { executor, cpu } = createRuntime(mem);

  resetCpuState(cpu, mem);

  // Pre-seed keyboard state
  mem[D177B8] = d177b8 & 0xFF;
  mem[D177B9] = d177b9 & 0xFF;

  // Also seed lower-level keyboard scratch vars for realism
  mem[KBD_RAW_SCAN] = d177b8 & 0xFF;
  mem[KBD_KEY] = d177b8 & 0xFF;
  mem[KBD_GETKY] = d177b8 & 0xFF;
  mem[D0058E] = 0x00;

  // Record initial values of watched RAM
  const initialD0058E = mem[D0058E];
  const initialD00824 = mem[D00824] | (mem[D00824 + 1] << 8);
  const initialD0059F = mem[D0059F];
  const initialD177B8 = mem[D177B8];
  const initialD177B9 = mem[D177B9];

  // Push return sentinel
  push24(cpu, mem, RETURN_SENTINEL);

  const visited = [];
  const uniqueBlocks = new Set();
  let termination = 'unknown';
  let steps = 0;

  try {
    executor.runFrom(TARGET_FUNC, 'adl', {
      maxSteps,
      maxLoopIterations: maxSteps, // allow loops proportional to steps
      onBlock(pc, _mode, _meta, step) {
        steps = step;
        const pcNorm = pc & 0xFFFFFF;
        uniqueBlocks.add(pcNorm);
        visited.push({
          step,
          pc: pcNorm,
          a: cpu.a & 0xFF,
          f: cpu.f & 0xFF,
          hl: cpu.hl & 0xFFFFFF,
          de: cpu.de & 0xFFFFFF,
          bc: cpu.bc & 0xFFFFFF,
          sp: cpu.sp & 0xFFFFFF,
          missing: false,
        });
        if (pcNorm === RETURN_SENTINEL) {
          throw stopError('return_sentinel');
        }
      },
      onMissingBlock(pc, _mode, step) {
        steps = step;
        const pcNorm = pc & 0xFFFFFF;
        uniqueBlocks.add(pcNorm);
        visited.push({
          step,
          pc: pcNorm,
          a: cpu.a & 0xFF,
          f: cpu.f & 0xFF,
          hl: cpu.hl & 0xFFFFFF,
          de: cpu.de & 0xFFFFFF,
          bc: cpu.bc & 0xFFFFFF,
          sp: cpu.sp & 0xFFFFFF,
          missing: true,
        });
        if (pcNorm === RETURN_SENTINEL) {
          throw stopError('return_sentinel');
        }
      },
    });
    termination = 'max_steps';
  } catch (error) {
    if (error?.message === '__PHASE225_STOP__' && error.stopName === 'return_sentinel') {
      termination = 'RETURNED (sentinel hit)';
    } else {
      console.log(`    ERROR: ${error.message}`);
      termination = `error: ${error.message}`;
    }
  }

  // Final state of watched RAM
  const finalD0058E = mem[D0058E];
  const finalD00824 = mem[D00824] | (mem[D00824 + 1] << 8);
  const finalD0059F = mem[D0059F];
  const finalD177B8 = mem[D177B8];
  const finalD177B9 = mem[D177B9];

  console.log(`  Termination: ${termination}`);
  console.log(`  Steps executed: ${steps}`);
  console.log(`  Total blocks visited: ${visited.length}`);
  console.log(`  Unique blocks visited: ${uniqueBlocks.size}`);
  console.log(`  Function returned: ${termination.includes('RETURNED') ? 'YES' : 'NO'}`);

  console.log(`  Register state at exit:`);
  console.log(`    A  = ${hexByte(cpu.a)}  F  = ${hexByte(cpu.f)}`);
  console.log(`    HL = ${hex(cpu.hl)}  DE = ${hex(cpu.de)}  BC = ${hex(cpu.bc)}`);
  console.log(`    SP = ${hex(cpu.sp)}  IX = ${hex(cpu.ix)}  IY = ${hex(cpu.iy)}`);
  console.log(`    PC = ${hex(cpu.pc)}`);

  console.log(`  Watched RAM (before -> after):`);
  console.log(`    D177B8 (key code):   ${hexByte(initialD177B8)} -> ${hexByte(finalD177B8)}${initialD177B8 !== finalD177B8 ? ' CHANGED' : ''}`);
  console.log(`    D177B9 (case sel):   ${hexByte(initialD177B9)} -> ${hexByte(finalD177B9)}${initialD177B9 !== finalD177B9 ? ' CHANGED' : ''}`);
  console.log(`    D0058E (GetCSC):     ${hexByte(initialD0058E)} -> ${hexByte(finalD0058E)}${initialD0058E !== finalD0058E ? ' CHANGED' : ''}`);
  console.log(`    D00824 (key store):  ${hex(initialD00824, 4)} -> ${hex(finalD00824, 4)}${initialD00824 !== finalD00824 ? ' CHANGED' : ''}`);
  console.log(`    D0059F (key flags):  ${hexByte(initialD0059F)} -> ${hexByte(finalD0059F)}${initialD0059F !== finalD0059F ? ' CHANGED' : ''}`);

  // Print unique block addresses (sorted) for analysis
  const sortedBlocks = [...uniqueBlocks].sort((a, b) => a - b);
  console.log(`  Unique block addresses (${sortedBlocks.length}):`);
  for (const addr of sortedBlocks) {
    const inFunc = (addr >= 0x02F68A && addr <= 0x02F7D7) ? ' [IN FUNC]' : '';
    console.log(`    ${hex(addr)}${inFunc}`);
  }

  // Print first 50 and last 50 block trace entries for long traces
  if (visited.length <= 100) {
    console.log('  Full block trace:');
    for (const v of visited) {
      const tag = v.missing ? 'MISSING' : 'block  ';
      console.log(
        `    step ${String(v.step).padStart(5)} ${tag} ${hex(v.pc)} A=${hexByte(v.a)} F=${hexByte(v.f)} HL=${hex(v.hl)} DE=${hex(v.de)} BC=${hex(v.bc)} SP=${hex(v.sp)}`,
      );
    }
  } else {
    console.log(`  Block trace (first 50 of ${visited.length}):`);
    for (let i = 0; i < 50 && i < visited.length; i++) {
      const v = visited[i];
      const tag = v.missing ? 'MISSING' : 'block  ';
      console.log(
        `    step ${String(v.step).padStart(5)} ${tag} ${hex(v.pc)} A=${hexByte(v.a)} F=${hexByte(v.f)} HL=${hex(v.hl)} DE=${hex(v.de)} BC=${hex(v.bc)} SP=${hex(v.sp)}`,
      );
    }
    console.log(`  Block trace (last 50 of ${visited.length}):`);
    for (let i = Math.max(0, visited.length - 50); i < visited.length; i++) {
      const v = visited[i];
      const tag = v.missing ? 'MISSING' : 'block  ';
      console.log(
        `    step ${String(v.step).padStart(5)} ${tag} ${hex(v.pc)} A=${hexByte(v.a)} F=${hexByte(v.f)} HL=${hex(v.hl)} DE=${hex(v.de)} BC=${hex(v.bc)} SP=${hex(v.sp)}`,
      );
    }
  }

  return {
    termination,
    steps,
    uniqueBlockCount: uniqueBlocks.size,
    totalBlocks: visited.length,
    returned: termination.includes('RETURNED'),
    finalD0058E,
    finalD00824,
    finalD0059F,
    finalD177B8,
    finalD177B9,
    finalA: cpu.a & 0xFF,
    finalPC: cpu.pc & 0xFFFFFF,
    sortedBlocks,
  };
}

/* ── PART A: Extended step counts with D177B8=0x8F ──────────────── */

function partA(baselineMemory) {
  console.log('\n' + '#'.repeat(80));
  console.log('# PART A: Extended step counts with D177B8=0x8F (digit key)');
  console.log('#'.repeat(80));

  const results = [];

  for (const maxSteps of [2000, 5000, 10000]) {
    const result = traceFunction(baselineMemory, {
      d177b8: 0x8F,
      d177b9: 0x00,
      maxSteps,
      label: `D177B8=0x8F, D177B9=0x00, steps=${maxSteps}`,
    });
    results.push({ maxSteps, ...result });
  }

  return results;
}

/* ── PART B: Different D177B8 values ────────────────────────────── */

function partB(baselineMemory) {
  console.log('\n' + '#'.repeat(80));
  console.log('# PART B: Different D177B8 values at 10000 steps');
  console.log('#'.repeat(80));

  const testValues = [
    { d177b8: 0x8F, d177b9: 0x00, label: 'D177B8=0x8F (digit key code)' },
    { d177b8: 0x76, d177b9: 0x00, label: 'D177B8=0x76 (LOG key code)' },
    { d177b8: 0x00, d177b9: 0x00, label: 'D177B8=0x00 (no key)' },
    { d177b8: 0x8E, d177b9: 0x00, label: 'D177B8=0x8E (CP cascade value 1)' },
    { d177b8: 0x91, d177b9: 0x00, label: 'D177B8=0x91 (CP cascade value 2)' },
    { d177b8: 0xFF, d177b9: 0x00, label: 'D177B8=0xFF (CP cascade value 3)' },
    { d177b8: 0x01, d177b9: 0x00, label: 'D177B8=0x01 (CP cascade value 4)' },
    { d177b8: 0x9B, d177b9: 0x00, label: 'D177B8=0x9B (CP cascade value 5)' },
    { d177b8: 0xFE, d177b9: 0x00, label: 'D177B8=0xFE (CP cascade value 6)' },
  ];

  const results = [];

  for (const tv of testValues) {
    const result = traceFunction(baselineMemory, {
      ...tv,
      maxSteps: 10000,
      label: `${tv.label}, steps=10000`,
    });
    results.push({ ...tv, ...result });
  }

  return results;
}

/* ── PART C: Summary ────────────────────────────────────────────── */

function partC(partAResults, partBResults) {
  console.log('\n' + '#'.repeat(80));
  console.log('# PART C: Summary of all runs');
  console.log('#'.repeat(80));

  console.log('\n  Part A — Escalating step counts (D177B8=0x8F):');
  console.log('  ' + '-'.repeat(76));
  console.log('  Steps  | Returned | Unique Blocks | Total Blocks | D0058E | D00824 | Final A');
  console.log('  ' + '-'.repeat(76));
  for (const r of partAResults) {
    console.log(
      `  ${String(r.maxSteps).padStart(6)} | ${r.returned ? 'YES     ' : 'NO      '} | ${String(r.uniqueBlockCount).padStart(13)} | ${String(r.totalBlocks).padStart(12)} | ${hexByte(r.finalD0058E).padStart(6)} | ${hex(r.finalD00824, 4).padStart(6)} | ${hexByte(r.finalA)}`,
    );
  }

  console.log('\n  Part B — Different D177B8 values (10000 steps):');
  console.log('  ' + '-'.repeat(90));
  console.log('  D177B8 | D177B9 | Returned | Unique Blk | Total Blk | D0058E | D00824 | D0059F | A');
  console.log('  ' + '-'.repeat(90));
  for (const r of partBResults) {
    console.log(
      `  ${hexByte(r.d177b8).padStart(6)} | ${hexByte(r.d177b9).padStart(6)} | ${r.returned ? 'YES     ' : 'NO      '} | ${String(r.uniqueBlockCount).padStart(10)} | ${String(r.totalBlocks).padStart(9)} | ${hexByte(r.finalD0058E).padStart(6)} | ${hex(r.finalD00824, 4).padStart(6)} | ${hexByte(r.finalD0059F).padStart(6)} | ${hexByte(r.finalA)}`,
    );
  }

  // Check which D177B8 values cause the function to return
  const returningValues = partBResults.filter((r) => r.returned);
  const notReturning = partBResults.filter((r) => !r.returned);

  console.log(`\n  D177B8 values where function RETURNS (${returningValues.length}):`);
  for (const r of returningValues) {
    console.log(`    ${hexByte(r.d177b8)} -> D0058E=${hexByte(r.finalD0058E)}, D00824=${hex(r.finalD00824, 4)}, A=${hexByte(r.finalA)}`);
  }
  console.log(`  D177B8 values where function does NOT return (${notReturning.length}):`);
  for (const r of notReturning) {
    console.log(`    ${hexByte(r.d177b8)} -> stuck at PC=${hex(r.finalPC)}, step=${r.steps}`);
  }

  // Find common blocks across all runs
  if (partBResults.length >= 2) {
    const allBlockSets = partBResults.map((r) => new Set(r.sortedBlocks));
    const commonBlocks = [...allBlockSets[0]].filter((b) =>
      allBlockSets.every((s) => s.has(b)),
    );
    console.log(`\n  Blocks common to ALL runs: ${commonBlocks.length}`);
    for (const b of commonBlocks.sort((a, c) => a - c)) {
      const inFunc = (b >= 0x02F68A && b <= 0x02F7D7) ? ' [IN FUNC]' : '';
      console.log(`    ${hex(b)}${inFunc}`);
    }
  }
}

/* ── Main ────────────────────────────────────────────────────────── */

function main() {
  console.log('Phase 225: Trace 0x02F68A key pipeline with extended step counts');
  console.log(`ROM loaded: ${rom.length} bytes (${(rom.length / 1024 / 1024).toFixed(1)} MB)`);

  // Boot baseline
  console.log('\n' + '#'.repeat(80));
  console.log('# Booting baseline for dynamic traces...');
  console.log('#'.repeat(80));

  const baselineMemory = bootBaseline();

  // Show baseline values of watched RAM
  console.log(`\n  Baseline RAM after boot:`);
  console.log(`    D177B8 = ${hexByte(baselineMemory[D177B8])}`);
  console.log(`    D177B9 = ${hexByte(baselineMemory[D177B9])}`);
  console.log(`    D0058E = ${hexByte(baselineMemory[D0058E])}`);
  console.log(`    D00824 = ${hex(baselineMemory[D00824] | (baselineMemory[D00824 + 1] << 8), 4)}`);
  console.log(`    D0059F = ${hexByte(baselineMemory[D0059F])}`);

  // Part A: Extended step counts
  const partAResults = partA(baselineMemory);

  // Part B: Different D177B8 values
  const partBResults = partB(baselineMemory);

  // Part C: Summary
  partC(partAResults, partBResults);

  console.log('\nDone.');
}

main();
