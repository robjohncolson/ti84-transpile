#!/usr/bin/env node
/**
 * Phase 269 — Event loop dispatch table investigation
 *
 * Investigates the TI-84 CE OS event loop dispatch table at 0x082BE2.
 * The loop walks a handler table backward from D3FFFF to D0259D, 6 bytes
 * per entry (3 key bytes + 3 handler address bytes). After boot the table
 * is empty, so the loop polls forever.
 *
 * Steps:
 *   1. Cold-boot + snapshot
 *   2. Read dispatch-table pointers and table contents after boot
 *   3. Seed D007E8, enter home-screen body at 0x062055 for 200 steps
 *   4. Read the same addresses again after reaching event loop
 *   5. Manually seed a handler entry and see if the loop exits
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

// Dispatch table addresses
const D005F9 = 0xD005F9;
const D005FA = 0xD005FA;
const D005FB = 0xD005FB;
const D0259D = 0xD0259D; // table base pointer (24-bit)
const D025A3 = 0xD025A3; // current table position pointer (24-bit)
const D0259A = 0xD0259A; // alternative table pointer (24-bit)
const TABLE_TOP = 0xD3FFFF;

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

function dumpBytes(mem, startAddr, count, direction) {
  const bytes = [];
  for (let i = 0; i < count; i++) {
    const addr = direction === 'down'
      ? (startAddr - i) & MEM_MASK
      : (startAddr + i) & MEM_MASK;
    bytes.push(mem[addr]);
  }
  return bytes;
}

function formatBytes(bytes) {
  return bytes.map((b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function reportTableState(label, mem) {
  console.log(`\n--- ${label} ---`);

  const f9 = mem[D005F9 & MEM_MASK];
  const fa = mem[D005FA & MEM_MASK];
  const fb = mem[D005FB & MEM_MASK];
  console.log(`  D005F9=${hex(f9, 2)}  D005FA=${hex(fa, 2)}  D005FB=${hex(fb, 2)}`);

  const tableBase = read24(mem, D0259D);
  const tablePos = read24(mem, D025A3);
  const altTable = read24(mem, D0259A);
  console.log(`  D0259D (table base)     = ${hex(tableBase)}`);
  console.log(`  D025A3 (table position) = ${hex(tablePos)}`);
  console.log(`  D0259A (alt table)      = ${hex(altTable)}`);

  // Dump 30 bytes downward from TABLE_TOP
  const topBytes = dumpBytes(mem, TABLE_TOP, 30, 'down');
  console.log(`  Table area (D3FFFF downward, 30 bytes):`);
  console.log(`    ${formatBytes(topBytes)}`);

  // Dump 30 bytes forward from tableBase
  if (tableBase >= 0x400000 && tableBase < 0xE00000) {
    const baseBytes = dumpBytes(mem, tableBase, 30, 'up');
    console.log(`  Table base content (${hex(tableBase)} forward, 30 bytes):`);
    console.log(`    ${formatBytes(baseBytes)}`);
  } else {
    console.log(`  Table base ${hex(tableBase)} outside RAM range — skipping dump`);
  }

  // Also check D02590 (sometimes referenced as alt table base)
  const alt2 = read24(mem, 0xD02590);
  console.log(`  D02590 (alt table base2) = ${hex(alt2)}`);

  return { f9, fa, fb, tableBase, tablePos, altTable };
}

async function main() {
  console.log('=== Phase 269 — Event Loop Dispatch Table Investigation ===\n');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // ── Step 1: Cold boot ──
  console.log('Step 1: Cold boot');
  const bootResult = coldBoot(executor, cpu, mem);
  console.log(`  boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);
  console.log(`  post-boot madl=${cpu.madl} mbase=${hex(cpu.mbase, 2)} sp=${hex(cpu.sp)}`);

  const ramSnap = new Uint8Array(mem.slice(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END));
  const cpuSnap = snapshotCpu(cpu);

  // ── Step 2: Read table state after boot ──
  console.log('\nStep 2: Table state after boot');
  const postBoot = reportTableState('Post-boot table state', mem);

  // ── Step 3: Enter home-screen body via 0x062055 ──
  console.log('\n\nStep 3: Seed D007E8=0x06C546, call 0x062055 for 200 steps');

  // Restore clean state
  restorePostBootState(cpu, mem, cpuSnap, ramSnap);

  // Prepare warm state
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

  const blockMap1 = new Map();
  const result1 = executor.runFrom(0x062055, 'adl', {
    maxSteps: 200,
    maxLoopIterations: 50,
    onBlock(pc, mode, _meta, step) {
      const key = `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode ?? 'adl'}`;
      let record = blockMap1.get(key);
      if (!record) {
        record = { pc: pc >>> 0, mode: mode ?? 'adl', count: 0, firstStep: step + 1 };
        blockMap1.set(key, record);
      }
      record.count++;
    },
  });

  console.log(`  result: steps=${result1.steps} term=${result1.termination} lastPc=${hex(result1.lastPc)} lastMode=${result1.lastMode}`);
  console.log(`  loopsForced=${result1.loopsForced} missingBlocks=${result1.missingBlocks.length}`);

  const blocks1 = [...blockMap1.values()].sort((a, b) => a.firstStep - b.firstStep);
  console.log(`  Blocks visited (${blocks1.length}):`);
  for (const block of blocks1) {
    console.log(`    ${hex(block.pc)}:${block.mode} visits=${block.count} firstStep=${block.firstStep}`);
  }

  if (result1.missingBlocks.length > 0) {
    console.log(`  Missing blocks:`);
    for (const mb of result1.missingBlocks) {
      console.log(`    ${mb}`);
    }
  }

  // ── Step 4: Read table state after reaching event loop ──
  console.log('\n\nStep 4: Table state after event loop entry');
  const postLoop = reportTableState('Post-event-loop table state', mem);

  // Check: did D005F9/FA/FB change?
  console.log(`\n  D005F9 changed: ${postBoot.f9 !== postLoop.f9} (${hex(postBoot.f9, 2)} -> ${hex(postLoop.f9, 2)})`);
  console.log(`  D005FA changed: ${postBoot.fa !== postLoop.fa} (${hex(postBoot.fa, 2)} -> ${hex(postLoop.fa, 2)})`);
  console.log(`  D005FB changed: ${postBoot.fb !== postLoop.fb} (${hex(postBoot.fb, 2)} -> ${hex(postLoop.fb, 2)})`);
  console.log(`  Table base changed: ${postBoot.tableBase !== postLoop.tableBase} (${hex(postBoot.tableBase)} -> ${hex(postLoop.tableBase)})`);
  console.log(`  Table pos changed: ${postBoot.tablePos !== postLoop.tablePos} (${hex(postBoot.tablePos)} -> ${hex(postLoop.tablePos)})`);

  // ── Step 5: Seed a handler entry and re-run ──
  console.log('\n\nStep 5: Manually seed a handler entry');

  // Restore clean state again
  restorePostBootState(cpu, mem, cpuSnap, ramSnap);

  // Prepare warm state again
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = IY_BASE;
  cpu._ix = IX_BASE;
  cpu._bc = (cpu._bc & 0xFF) | (3 << 8);

  mem[D0230F & MEM_MASK] = 0x3F;
  write24(mem, 0xD007E8, 0x06C546);

  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  write24(mem, cpu.sp, RETURN_SENTINEL);
  write24(mem, D007FA, cpu.sp);

  // First run 200 steps to reach event loop state
  executor.runFrom(0x062055, 'adl', {
    maxSteps: 200,
    maxLoopIterations: 50,
  });

  // Read the current key match values
  const matchF9 = mem[D005F9 & MEM_MASK];
  const matchFA = mem[D005FA & MEM_MASK];
  const matchFB = mem[D005FB & MEM_MASK];
  console.log(`  Current match keys: D005F9=${hex(matchF9, 2)} D005FA=${hex(matchFA, 2)} D005FB=${hex(matchFB, 2)}`);

  // Read current table base
  const curBase = read24(mem, D0259D);
  const curPos = read24(mem, D025A3);
  console.log(`  Current table base=${hex(curBase)} pos=${hex(curPos)}`);

  // Write a 6-byte handler entry at D3FFFA (just below D3FFFF)
  // Format: [key0, key1, key2, handler_lo, handler_mid, handler_hi]
  const entryAddr = 0xD3FFFA;
  const handlerAddr = 0x100000; // dummy handler address
  mem[(entryAddr + 0) & MEM_MASK] = matchF9;
  mem[(entryAddr + 1) & MEM_MASK] = matchFA;
  mem[(entryAddr + 2) & MEM_MASK] = matchFB;
  mem[(entryAddr + 3) & MEM_MASK] = handlerAddr & 0xFF;
  mem[(entryAddr + 4) & MEM_MASK] = (handlerAddr >>> 8) & 0xFF;
  mem[(entryAddr + 5) & MEM_MASK] = (handlerAddr >>> 16) & 0xFF;
  console.log(`  Wrote 6-byte entry at ${hex(entryAddr)}: [${hex(matchF9, 2)}, ${hex(matchFA, 2)}, ${hex(matchFB, 2)}, handler=${hex(handlerAddr)}]`);

  // Update D025A3 to point to entry
  write24(mem, D025A3, entryAddr);
  console.log(`  Updated D025A3 -> ${hex(entryAddr)}`);

  // Verify written data
  const verifyBytes = dumpBytes(mem, entryAddr, 6, 'up');
  console.log(`  Verify entry bytes: ${formatBytes(verifyBytes)}`);
  console.log(`  Verify D025A3: ${hex(read24(mem, D025A3))}`);

  // Now run 100 more steps and watch what happens
  const blockMap2 = new Map();
  const result2 = executor.runFrom(result1.lastPc, result1.lastMode ?? 'adl', {
    maxSteps: 100,
    maxLoopIterations: 50,
    onBlock(pc, mode, _meta, step) {
      const key = `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode ?? 'adl'}`;
      let record = blockMap2.get(key);
      if (!record) {
        record = { pc: pc >>> 0, mode: mode ?? 'adl', count: 0, firstStep: step + 1 };
        blockMap2.set(key, record);
      }
      record.count++;
    },
  });

  console.log(`\n  After seeded handler — result: steps=${result2.steps} term=${result2.termination} lastPc=${hex(result2.lastPc)} lastMode=${result2.lastMode}`);
  console.log(`  loopsForced=${result2.loopsForced} missingBlocks=${result2.missingBlocks.length}`);

  const blocks2 = [...blockMap2.values()].sort((a, b) => a.firstStep - b.firstStep);
  console.log(`  Blocks visited (${blocks2.length}):`);
  for (const block of blocks2) {
    console.log(`    ${hex(block.pc)}:${block.mode} visits=${block.count} firstStep=${block.firstStep}`);
  }

  if (result2.missingBlocks.length > 0) {
    console.log(`  Missing blocks:`);
    for (const mb of result2.missingBlocks) {
      console.log(`    ${mb}`);
    }
  }

  // Check if we exited the polling loop (i.e., reached the handler or 0x04C885)
  const reachedHandler = blocks2.has?.(`${handlerAddr.toString(16).padStart(6, '0')}:adl`);
  const reached04C885 = blockMap2.has('04c885:adl');
  const reached082BE2 = blockMap2.has('082be2:adl');
  console.log(`\n  Reached handler dispatch (0x04C885): ${reached04C885}`);
  console.log(`  Reached handler address (${hex(handlerAddr)}): ${!!blockMap2.get(`${handlerAddr.toString(16).padStart(6, '0')}:adl`)}`);
  console.log(`  Still in event loop (0x082BE2): ${reached082BE2}`);

  // Final table state
  reportTableState('Final table state after seeded run', mem);

  console.log('\n=== Done ===');
}

try {
  await main();
} catch (error) {
  console.error('FATAL:', error.stack || error);
  process.exitCode = 1;
}
