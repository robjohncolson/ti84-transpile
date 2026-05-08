#!/usr/bin/env node
/**
 * Phase 270 — Dispatch table seeding experiments
 *
 * Tests seeding the OS event loop dispatch table with handler entries.
 * The event loop (5-block polling: 0x082BE2->0x084716->0x08471B->0x084723->0x084711)
 * searches a dispatch table downward from D3FFFF.
 *
 * Experiments:
 *   A: 9-byte entry at D3FFF7, key bytes matching D005F9/FA/FB
 *   B: Same but reversed key byte order
 *   C: Write entry relative to D025A3's current value
 *   D: 6-byte entry (backwards compatibility test)
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
const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xE00000;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const RETURN_SENTINEL = 0x7FFFFE;

const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;
const D007FA = 0xD007FA;
const D0230F = 0xD0230F;

const D005F9 = 0xD005F9;
const D005FA = 0xD005FA;
const D005FB = 0xD005FB;
const D0259D = 0xD0259D;
const D025A3 = 0xD025A3;
const TABLE_TOP = 0xD3FFFF;

// Event loop polling blocks
const POLLING_BLOCKS = new Set([0x082BE2, 0x084716, 0x08471B, 0x084723, 0x084711]);

// Target handler blocks
const HANDLER_TARGETS = [0x058241, 0x0585E9];

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
  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
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

function restorePostBootState(cpu, mem, cpuSnap, ramSnap) {
  mem.set(ramSnap, RAM_SNAPSHOT_START);
  for (const [field, value] of Object.entries(cpuSnap)) {
    cpu[field] = value;
  }
}

function prepareWarmState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = IY_BASE;
  cpu._ix = IX_BASE;
  cpu._bc = (cpu._bc & 0xFF) | (3 << 8); // B=3

  mem[D0230F & MEM_MASK] = 0x3F;
  write24(mem, 0xD007E8, 0x06C546);

  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  write24(mem, cpu.sp, RETURN_SENTINEL);
  write24(mem, D007FA, cpu.sp);
}

function runWithTracking(executor, startPc, startMode, maxSteps, maxLoopIterations) {
  const blockMap = new Map();
  const blockOrder = [];

  const result = executor.runFrom(startPc, startMode, {
    maxSteps,
    maxLoopIterations: maxLoopIterations || 200,
    onBlock(pc, mode, _meta, step) {
      const pcVal = pc >>> 0;
      const modeStr = mode ?? 'adl';
      const key = `${pcVal.toString(16).padStart(6, '0')}:${modeStr}`;
      let record = blockMap.get(key);
      if (!record) {
        record = { pc: pcVal, mode: modeStr, count: 0, firstStep: step + 1 };
        blockMap.set(key, record);
        blockOrder.push(pcVal);
      }
      record.count++;
    },
  });

  return { result, blockMap, blockOrder };
}

function reportExperiment(label, result, blockMap, blockOrder, mem) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${label}`);
  console.log(`${'='.repeat(60)}`);
  console.log(`  steps=${result.steps}  term=${result.termination}  lastPc=${hex(result.lastPc)}  lastMode=${result.lastMode}`);
  console.log(`  loopsForced=${result.loopsForced}  missingBlocks=${result.missingBlocks.length}`);

  const blocks = [...blockMap.values()].sort((a, b) => a.firstStep - b.firstStep);
  console.log(`  Unique blocks: ${blocks.length}`);

  // First 10 blocks in order
  console.log(`  First 10 blocks visited:`);
  for (let i = 0; i < Math.min(10, blockOrder.length); i++) {
    console.log(`    ${i + 1}. ${hex(blockOrder[i])}`);
  }

  // Check for blocks outside polling set
  const outsidePolling = blocks.filter((b) => !POLLING_BLOCKS.has(b.pc));
  console.log(`  Blocks OUTSIDE polling set: ${outsidePolling.length}`);
  for (const b of outsidePolling) {
    console.log(`    ${hex(b.pc)}:${b.mode} visits=${b.count}`);
  }

  // Check handler targets
  for (const target of HANDLER_TARGETS) {
    const key = `${target.toString(16).padStart(6, '0')}:adl`;
    const hit = blockMap.get(key);
    console.log(`  Reached ${hex(target)}: ${hit ? `YES (visits=${hit.count})` : 'no'}`);
  }

  // Check any 0x058xxx blocks
  const in058 = blocks.filter((b) => b.pc >= 0x058000 && b.pc < 0x059000);
  if (in058.length > 0) {
    console.log(`  Blocks in 0x058xxx range:`);
    for (const b of in058) {
      console.log(`    ${hex(b.pc)}:${b.mode} visits=${b.count}`);
    }
  } else {
    console.log(`  No blocks in 0x058xxx range`);
  }

  // Key state
  console.log(`  D005F9=${hex(mem[D005F9 & MEM_MASK], 2)}  D005FA=${hex(mem[D005FA & MEM_MASK], 2)}  D005FB=${hex(mem[D005FB & MEM_MASK], 2)}`);
  console.log(`  D0259D=${hex(read24(mem, D0259D))}  D025A3=${hex(read24(mem, D025A3))}`);

  if (result.missingBlocks.length > 0) {
    console.log(`  Missing blocks:`);
    for (const mb of result.missingBlocks.slice(0, 10)) {
      console.log(`    ${mb}`);
    }
    if (result.missingBlocks.length > 10) {
      console.log(`    ... and ${result.missingBlocks.length - 10} more`);
    }
  }
}

async function main() {
  console.log('=== Phase 270 — Dispatch Table Seeding Experiments ===\n');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // ── Cold boot + snapshot ──
  console.log('Cold boot...');
  const bootResult = coldBoot(executor, cpu, mem);
  console.log(`  boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);

  const ramSnap = new Uint8Array(mem.slice(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END));
  const cpuSnap = snapshotCpu(cpu);

  // ── Helper: boot into event loop, return lastPc/lastMode ──
  function bootToEventLoop() {
    restorePostBootState(cpu, mem, cpuSnap, ramSnap);
    prepareWarmState(cpu, mem);
    const warmup = executor.runFrom(0x062055, 'adl', {
      maxSteps: 200,
      maxLoopIterations: 50,
    });
    return warmup;
  }

  // ════════════════════════════════════════════════════════════════
  //  Experiment A: 9-byte entry at D3FFF7, key = [key2][key1][key0]
  // ════════════════════════════════════════════════════════════════
  {
    const warmup = bootToEventLoop();
    console.log(`\nWarmup A: steps=${warmup.steps} lastPc=${hex(warmup.lastPc)} lastMode=${warmup.lastMode}`);

    const matchF9 = mem[D005F9 & MEM_MASK];
    const matchFA = mem[D005FA & MEM_MASK];
    const matchFB = mem[D005FB & MEM_MASK];
    console.log(`  Match keys: F9=${hex(matchF9, 2)} FA=${hex(matchFA, 2)} FB=${hex(matchFB, 2)}`);
    console.log(`  D0259D=${hex(read24(mem, D0259D))} D025A3=${hex(read24(mem, D025A3))}`);

    // 9-byte entry: [key2][key1][key0][handlerB0][handlerB1][handlerB2][?][?][flag]
    const entry = 0xD3FFF7;
    mem[(entry + 0) & MEM_MASK] = 0x00; // key2 matches D005FB=0x00
    mem[(entry + 1) & MEM_MASK] = 0x00; // key1 matches D005FA=0x00
    mem[(entry + 2) & MEM_MASK] = 0x40; // key0 matches D005F9=0x40
    mem[(entry + 3) & MEM_MASK] = 0x41; // handler low  (0x058241)
    mem[(entry + 4) & MEM_MASK] = 0x82; // handler mid
    mem[(entry + 5) & MEM_MASK] = 0x05; // handler high
    mem[(entry + 6) & MEM_MASK] = 0x00;
    mem[(entry + 7) & MEM_MASK] = 0x00;
    mem[(entry + 8) & MEM_MASK] = 0x01; // flag=active

    write24(mem, D0259D, 0xD3FFF7); // table base = entry address
    write24(mem, D025A3, 0xD3FFFF); // table position = top of table

    const { result, blockMap, blockOrder } = runWithTracking(
      executor, warmup.lastPc, warmup.lastMode ?? 'adl', 5000, 200
    );
    reportExperiment('Experiment A: 9-byte entry [key2,key1,key0,h0,h1,h2,0,0,flag]', result, blockMap, blockOrder, mem);
  }

  // ════════════════════════════════════════════════════════════════
  //  Experiment B: Reversed key byte order [key0][key1][key2]
  // ════════════════════════════════════════════════════════════════
  {
    const warmup = bootToEventLoop();
    console.log(`\nWarmup B: steps=${warmup.steps} lastPc=${hex(warmup.lastPc)} lastMode=${warmup.lastMode}`);

    const entry = 0xD3FFF7;
    mem[(entry + 0) & MEM_MASK] = 0x40; // key0 first
    mem[(entry + 1) & MEM_MASK] = 0x00; // key1
    mem[(entry + 2) & MEM_MASK] = 0x00; // key2
    mem[(entry + 3) & MEM_MASK] = 0x41; // handler low  (0x058241)
    mem[(entry + 4) & MEM_MASK] = 0x82; // handler mid
    mem[(entry + 5) & MEM_MASK] = 0x05; // handler high
    mem[(entry + 6) & MEM_MASK] = 0x00;
    mem[(entry + 7) & MEM_MASK] = 0x00;
    mem[(entry + 8) & MEM_MASK] = 0x01; // flag=active

    write24(mem, D0259D, 0xD3FFF7);
    write24(mem, D025A3, 0xD3FFFF);

    const { result, blockMap, blockOrder } = runWithTracking(
      executor, warmup.lastPc, warmup.lastMode ?? 'adl', 5000, 200
    );
    reportExperiment('Experiment B: Reversed key order [key0,key1,key2,h0,h1,h2,0,0,flag]', result, blockMap, blockOrder, mem);
  }

  // ════════════════════════════════════════════════════════════════
  //  Experiment C: Write entry relative to D025A3's current value
  // ════════════════════════════════════════════════════════════════
  {
    const warmup = bootToEventLoop();
    console.log(`\nWarmup C: steps=${warmup.steps} lastPc=${hex(warmup.lastPc)} lastMode=${warmup.lastMode}`);

    const curPos = read24(mem, D025A3);
    console.log(`  D025A3 current value = ${hex(curPos)}`);

    // Write 9-byte entry at (curPos-8) through curPos
    const entryBase = (curPos - 8) & 0xFFFFFF;
    console.log(`  Writing 9-byte entry at ${hex(entryBase)} through ${hex(curPos)}`);

    mem[(entryBase + 0) & MEM_MASK] = 0x00; // key2
    mem[(entryBase + 1) & MEM_MASK] = 0x00; // key1
    mem[(entryBase + 2) & MEM_MASK] = 0x40; // key0
    mem[(entryBase + 3) & MEM_MASK] = 0x41; // handler low  (0x058241)
    mem[(entryBase + 4) & MEM_MASK] = 0x82; // handler mid
    mem[(entryBase + 5) & MEM_MASK] = 0x05; // handler high
    mem[(entryBase + 6) & MEM_MASK] = 0x00;
    mem[(entryBase + 7) & MEM_MASK] = 0x00;
    mem[(entryBase + 8) & MEM_MASK] = 0x01; // flag=active

    // Don't change D0259D — let the loop use whatever base it already has

    const { result, blockMap, blockOrder } = runWithTracking(
      executor, warmup.lastPc, warmup.lastMode ?? 'adl', 5000, 200
    );
    reportExperiment('Experiment C: Entry relative to D025A3 (no D0259D change)', result, blockMap, blockOrder, mem);
  }

  // ════════════════════════════════════════════════════════════════
  //  Experiment D: 6-byte entry (backwards compatibility test)
  // ════════════════════════════════════════════════════════════════
  {
    const warmup = bootToEventLoop();
    console.log(`\nWarmup D: steps=${warmup.steps} lastPc=${hex(warmup.lastPc)} lastMode=${warmup.lastMode}`);

    // 6-byte entry at D3FFFA: [key2][key1][key0][handler_lo][handler_mid][handler_hi]
    const entry = 0xD3FFFA;
    mem[(entry + 0) & MEM_MASK] = 0x00; // key2
    mem[(entry + 1) & MEM_MASK] = 0x00; // key1
    mem[(entry + 2) & MEM_MASK] = 0x40; // key0
    mem[(entry + 3) & MEM_MASK] = 0x41; // handler low  (0x058241)
    mem[(entry + 4) & MEM_MASK] = 0x82; // handler mid
    mem[(entry + 5) & MEM_MASK] = 0x05; // handler high

    write24(mem, D0259D, 0xD3FFFA);
    write24(mem, D025A3, 0xD3FFFF);

    const { result, blockMap, blockOrder } = runWithTracking(
      executor, warmup.lastPc, warmup.lastMode ?? 'adl', 5000, 200
    );
    reportExperiment('Experiment D: 6-byte entry [key2,key1,key0,h0,h1,h2]', result, blockMap, blockOrder, mem);
  }

  console.log('\n=== Phase 270 Done ===');
}

try {
  await main();
} catch (error) {
  console.error('FATAL:', error.stack || error);
  process.exitCode = 1;
}
