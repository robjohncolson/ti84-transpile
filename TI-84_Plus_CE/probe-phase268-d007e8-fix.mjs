#!/usr/bin/env node
/**
 * Phase 268 - D007E8 fix probe
 *
 * Control experiment:
 *   - Seed D007D0 with 0x06C546
 *   - Leave D007E8 untouched
 *
 * Fix experiment:
 *   - Seed D007D0 with 0x06C546
 *   - Seed D007E8 with 0x06C546 so the 0x0250FA LDIR preserves D007D0
 *
 * Both experiments:
 *   - Cold boot with the same sequence used by phase 267
 *   - Force the 0x062055 -> 0x080151 -> 0x08C69E path
 *   - Trace up to 5000 block visits
 *   - Print D007D0 and D007E8 on every block
 *   - Track whether JP(HL) at 0x08C745 still uses HL=0 or reaches 0x06C546
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const BOOT_ENTRY = 0x000000;
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const RETURN_SENTINEL = 0x7FFFFE;

const TARGET_FUNC = 0x062055;
const TRACE_MAX_STEPS = 5000;
const TRACE_MAX_LOOP_ITERATIONS = 200;

const HANDLER_ADDR = 0x06C546;
const ADDR_RESET = 0x000000;
const ADDR_HANDLER = 0x06C546;
const ADDR_CXMAIN = 0x058241;
const ADDR_CXMAIN_BODY = 0x0585E9;
const ADDR_EVENT_LOOP = 0x082BE2;
const ADDR_08C69E = 0x08C69E;
const ADDR_08C6A3 = 0x08C6A3;
const ADDR_08C745 = 0x08C745;

const D007CA = 0xD007CA;
const D007D0 = 0xD007D0;
const D007E2 = 0xD007E2;
const D007E8 = 0xD007E8;
const D007FA = 0xD007FA;
const D0230F = 0xD0230F;
const D000A5 = 0xD000A5;

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function read24(mem, addr) {
  const base = addr & MEM_MASK;
  return mem[base] | (mem[(base + 1) & MEM_MASK] << 8) | (mem[(base + 2) & MEM_MASK] << 16);
}

function coldBoot(executor, cpu, mem) {
  const result = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  return result;
}

function snapshotCpu(cpu) {
  const fields = [
    'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
    'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
  ];
  return Object.fromEntries(fields.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }
}

function makeMarkerList(pc, hl) {
  const markers = [];
  if (pc === ADDR_08C69E) markers.push('PutAway');
  if (pc === ADDR_08C6A3) markers.push('LD HL,(D007D0)');
  if (pc === ADDR_08C745) markers.push(`JP(HL=${hex(hl)})`);
  if (pc === ADDR_HANDLER) markers.push('handler');
  if (pc === ADDR_CXMAIN) markers.push('cxMain');
  if (pc === ADDR_CXMAIN_BODY) markers.push('cxMain body');
  if (pc === ADDR_EVENT_LOOP) markers.push('event loop');
  if (pc === ADDR_RESET) markers.push('reset');
  return markers;
}

function formatJpObservation(observation) {
  if (!observation) return 'not reached';
  return `step ${observation.step}: HL=${hex(observation.hl)} D007D0=${hex(observation.d007d0)} D007E8=${hex(observation.d007e8)}`;
}

function runExperiment(label, executor, cpu, mem, cpuSnap, ramSnap, options) {
  const { seedD007E8 } = options;

  console.log(`\n${'='.repeat(72)}`);
  console.log(label);
  console.log(`${'='.repeat(72)}`);

  mem.set(ramSnap, 0x400000);
  restoreCpu(cpu, cpuSnap);

  const bootD007D0 = read24(mem, D007D0);
  const bootD007E8 = read24(mem, D007E8);
  const bootD000A5 = mem[D000A5 & MEM_MASK];

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._ix = 0xD1A860;
  cpu.b = 3;

  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  write24(mem, cpu.sp, RETURN_SENTINEL);

  mem[D0230F & MEM_MASK] = 0x3F;
  mem[D000A5 & MEM_MASK] = mem[D000A5 & MEM_MASK] & 0xDF;
  write24(mem, D007D0, HANDLER_ADDR);
  if (seedD007E8) {
    write24(mem, D007E8, HANDLER_ADDR);
  }
  write24(mem, D007FA, cpu.sp);

  console.log(`Boot snapshot: D007D0=${hex(bootD007D0)} D007E8=${hex(bootD007E8)} D000A5=${hex(bootD000A5, 2)}`);
  console.log(`Pre-call: D007D0=${hex(read24(mem, D007D0))} D007E8=${hex(read24(mem, D007E8))} D007CA=${hex(read24(mem, D007CA))} D007E2=${hex(read24(mem, D007E2))}`);
  console.log(`Pre-call: D0230F=${hex(mem[D0230F & MEM_MASK], 2)} B=${hex(cpu.b, 2)} (IY+0x25)=${hex(mem[D000A5 & MEM_MASK], 2)} IX=${hex(cpu._ix)} IY=${hex(cpu._iy)} SP=${hex(cpu.sp)}`);

  let totalBlocks = 0;
  const uniqueBlocks = new Set();
  const missingBlocks = [];
  const jpObservations = [];

  let hitReset = false;
  let hit08C69E = false;
  let hit08C6A3 = false;
  let hit08C745 = false;
  let hitHandler = false;
  let hitCxMain = false;
  let hitCxMainBody = false;
  let hitEventLoop = false;

  const result = executor.runFrom(TARGET_FUNC, 'adl', {
    maxSteps: TRACE_MAX_STEPS,
    maxLoopIterations: TRACE_MAX_LOOP_ITERATIONS,
    onBlock: (pc, mode, meta, step) => {
      const stepNo = step + 1;
      const hl = cpu._hl;
      const d007d0 = read24(mem, D007D0);
      const d007e8 = read24(mem, D007E8);
      const key = `${hex(pc)}:${mode}`;
      const markers = makeMarkerList(pc, hl);

      totalBlocks += 1;
      uniqueBlocks.add(key);

      if (pc === ADDR_RESET) hitReset = true;
      if (pc === ADDR_08C69E) hit08C69E = true;
      if (pc === ADDR_08C6A3) hit08C6A3 = true;
      if (pc === ADDR_08C745) {
        hit08C745 = true;
        jpObservations.push({ step: stepNo, hl, d007d0, d007e8 });
      }
      if (pc === ADDR_HANDLER) hitHandler = true;
      if (pc === ADDR_CXMAIN) hitCxMain = true;
      if (pc === ADDR_CXMAIN_BODY) hitCxMainBody = true;
      if (pc === ADDR_EVENT_LOOP) hitEventLoop = true;

      const markerText = markers.length > 0 ? ` <-- ${markers.join(', ')}` : '';
      console.log(
        `${String(stepNo).padStart(5)} | ${hex(pc)} | ${mode.padEnd(4)} | HL=${hex(hl)} | D007D0=${hex(d007d0)} | D007E8=${hex(d007e8)}${markerText}`
      );
    },
    onMissingBlock: (pc, mode, step) => {
      const stepNo = step + 1;
      missingBlocks.push(`${hex(pc)}:${mode}`);
      console.log(
        `${String(stepNo).padStart(5)} | ${hex(pc)} | ${mode.padEnd(4)} | MISSING BLOCK | D007D0=${hex(read24(mem, D007D0))} | D007E8=${hex(read24(mem, D007E8))}`
      );
    },
  });

  const summary = {
    label,
    seedD007E8,
    bootD007D0,
    bootD007E8,
    bootD000A5,
    result,
    totalBlocks,
    uniqueBlockCount: uniqueBlocks.size,
    missingBlocks,
    jpObservations,
    hitReset,
    hit08C69E,
    hit08C6A3,
    hit08C745,
    hitHandler,
    hitCxMain,
    hitCxMainBody,
    hitEventLoop,
    finalD007D0: read24(mem, D007D0),
    finalD007E8: read24(mem, D007E8),
    finalD000A5: mem[D000A5 & MEM_MASK],
  };

  console.log(`\nResult summary for ${label}:`);
  console.log(`  termination=${result.termination} steps=${result.steps} lastPc=${hex(result.lastPc)} lastMode=${result.lastMode} loopsForced=${result.loopsForced}`);
  console.log(`  reached 0x08C69E=${hit08C69E} 0x08C6A3=${hit08C6A3} 0x08C745=${hit08C745} 0x06C546=${hitHandler}`);
  console.log(`  reached 0x058241=${hitCxMain} 0x0585E9=${hitCxMainBody} 0x082BE2=${hitEventLoop} reset=${hitReset}`);
  console.log(`  unique blocks=${summary.uniqueBlockCount} total blocks=${totalBlocks}`);
  console.log(`  JP(HL) observations: ${jpObservations.length === 0 ? 'none' : ''}`);
  for (const observation of jpObservations) {
    console.log(`    ${formatJpObservation(observation)}`);
  }
  console.log(`  final D007D0=${hex(summary.finalD007D0)} D007E8=${hex(summary.finalD007E8)} D000A5=${hex(summary.finalD000A5, 2)}`);
  if (missingBlocks.length > 0) {
    console.log(`  missing blocks (${missingBlocks.length}): ${missingBlocks.slice(0, 20).join(', ')}`);
  }

  return summary;
}

function printComparison(control, fix) {
  const controlJp = control.jpObservations[0] ?? null;
  const fixJp = fix.jpObservations[0] ?? null;
  const controlZeroJump = control.jpObservations.some((entry) => entry.hl === 0);
  const fixHandlerJump = fix.jpObservations.some((entry) => entry.hl === HANDLER_ADDR);

  console.log(`\n${'#'.repeat(72)}`);
  console.log('FINAL COMPARISON');
  console.log(`${'#'.repeat(72)}`);
  console.log(`Control (seed D007D0 only):`);
  console.log(`  JP(HL): ${formatJpObservation(controlJp)}`);
  console.log(`  reached handler=${control.hitHandler} cxMain=${control.hitCxMain} cxMain body=${control.hitCxMainBody} event loop=${control.hitEventLoop} reset=${control.hitReset}`);
  console.log(`  final D007D0=${hex(control.finalD007D0)} final D007E8=${hex(control.finalD007E8)} unique blocks=${control.uniqueBlockCount}`);

  console.log(`Fix (seed D007D0 and D007E8):`);
  console.log(`  JP(HL): ${formatJpObservation(fixJp)}`);
  console.log(`  reached handler=${fix.hitHandler} cxMain=${fix.hitCxMain} cxMain body=${fix.hitCxMainBody} event loop=${fix.hitEventLoop} reset=${fix.hitReset}`);
  console.log(`  final D007D0=${hex(fix.finalD007D0)} final D007E8=${hex(fix.finalD007E8)} unique blocks=${fix.uniqueBlockCount}`);

  console.log(`Conclusion:`);
  console.log(`  control still shows JP(HL=0): ${controlZeroJump}`);
  console.log(`  fix shows JP(HL=0x06C546): ${fixHandlerJump}`);
  console.log(`  D007E8 seeding changed the dispatch target from zero to the handler: ${controlZeroJump && fixHandlerJump}`);
  console.log(`  fix reached handler 0x06C546: ${fix.hitHandler}`);
  console.log(`  fix reached cxMain 0x058241: ${fix.hitCxMain}`);
  console.log(`  fix reached cxMain body 0x0585E9: ${fix.hitCxMainBody}`);
  console.log(`  fix reached event loop 0x082BE2: ${fix.hitEventLoop}`);
}

async function main() {
  console.log('=== Phase 268 - D007E8 fix probe ===\n');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  console.log('--- Cold boot ---');
  const bootResult = coldBoot(executor, cpu, mem);
  console.log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);
  console.log(`post-boot: madl=${cpu.madl} mbase=${hex(cpu.mbase, 2)} ix=${hex(cpu._ix)} iy=${hex(cpu._iy)}\n`);

  const ramSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
  const cpuSnap = snapshotCpu(cpu);

  const control = runExperiment(
    'Experiment 1 - control (seed D007D0 only, leave D007E8 untouched)',
    executor,
    cpu,
    mem,
    cpuSnap,
    ramSnap,
    { seedD007E8: false }
  );

  const fix = runExperiment(
    'Experiment 2 - fix (seed D007D0 and D007E8 with 0x06C546)',
    executor,
    cpu,
    mem,
    cpuSnap,
    ramSnap,
    { seedD007E8: true }
  );

  printComparison(control, fix);
}

try {
  await main();
} catch (error) {
  console.error('FATAL:', error.stack || error);
  process.exitCode = 1;
}
