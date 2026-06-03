#!/usr/bin/env node
/**
 * Phase 506 — Map D01EB1-D01EF9 Token Descriptor Block Contents at Boot
 *
 * Session 505 decoded 0x096C03 (cursor-type-indexed table selector).
 * It returns pointers into RAM based on cursor type from D02575:
 *   Type 0: HL=D01EB1, DE=D01ECC
 *   Type 1: HL=D01EBA, DE=D01ED5
 *   Type >=2: HL=D01EDE, DE=D01EF9
 *
 * The caller at 0x096BD3 reads LD A,(HL); CP 0x0E to decide blink toggle
 * vs alternate path.
 *
 * This probe boots the OS and dumps those RAM regions to see what the
 * descriptor blocks contain after init.
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
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;

const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE_1_ENTRY = 0x0A2B72;
const STAGE_2_ENTRY = 0x0A3301;
const STAGE_3_ENTRY = 0x0A29EC;
const STAGE_4_ENTRY = 0x0A2854;
const STAGE_MAX_LOOP_ITERATIONS = 500;

const CPU_SNAPSHOT_FIELDS = [
  'a','f','_bc','_de','_hl','_a2','_f2','_bc2','_de2','_hl2',
  'sp','_ix','_iy','i','im','iff1','iff2','madl','mbase','halted','cycles',
];

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((f) => [f, cpu[f]]));
}

function restoreCpu(cpu, snapshot, mem) {
  for (const [f, v] of Object.entries(snapshot)) {
    cpu[f] = v;
  }
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function purgeRamBlocks(executor) {
  const blocks = executor.compiledBlocks;
  for (const key of Object.keys(blocks)) {
    const addr = parseInt(key.split(':')[0], 16);
    if (addr >= 0xD00000) {
      delete blocks[key];
    }
  }
}

function runStage(executor, label, entry, maxSteps) {
  purgeRamBlocks(executor);

  class RamHalt extends Error {
    constructor(pc, steps) {
      super('ram_halt');
      this.haltPc = pc;
      this.haltSteps = steps;
    }
  }

  let result;
  try {
    result = executor.runFrom(entry, 'adl', {
      maxSteps,
      maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS,
      onMissingBlock(pc, _mode, steps) {
        if (pc >= 0xD00000) {
          throw new RamHalt(pc, steps);
        }
      },
    });
  } catch (err) {
    if (err instanceof RamHalt) {
      result = { steps: err.haltSteps, termination: 'ram_halt', lastPc: err.haltPc };
    } else {
      throw err;
    }
  }

  console.log(label + ': entry=' + hex(entry, 6) + ' steps=' + result.steps + ' term=' + result.termination + ' lastPc=' + hex(result.lastPc, 6));
  return result;
}

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return '0x' + (value >>> 0).toString(16).padStart(width, '0').toUpperCase();
}

function hexByte(b) {
  return b.toString(16).padStart(2, '0').toUpperCase();
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

function dumpRegion(mem, startAddr, length, label) {
  console.log('');
  console.log('=== ' + label + ' ===');
  console.log('Address    | Hex                                              | ASCII');
  console.log('-----------+--------------------------------------------------+------------------');

  for (let offset = 0; offset < length; offset += 16) {
    const addr = startAddr + offset;
    const count = Math.min(16, length - offset);
    const hexParts = [];
    const asciiParts = [];

    for (let i = 0; i < count; i++) {
      const b = mem[addr + i];
      hexParts.push(hexByte(b));
      asciiParts.push(b >= 0x20 && b <= 0x7E ? String.fromCharCode(b) : '.');
    }

    while (hexParts.length < 16) {
      hexParts.push('  ');
    }

    const hexStr = hexParts.join(' ');
    const asciiStr = asciiParts.join('');
    console.log(hex(addr, 6) + ' | ' + hexStr + ' | ' + asciiStr);
  }
}

function printPointerByte(mem, addr, label) {
  const b = mem[addr];
  const is0E = b === 0x0E;
  console.log('  ' + label + ' @ ' + hex(addr, 6) + ': first byte = ' + hexByte(b) + ' (' + b + ') ' + (is0E ? '=== 0x0E MATCH ===' : ''));
}

async function main() {
  console.log('=== Phase 506 -- Map D01Exx Token Descriptor Blocks ===');
  console.log('');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Cold boot
  const bootResult = coldBoot(executor, cpu, mem);
  console.log('boot: steps=' + bootResult.steps + ' term=' + bootResult.termination + ' lastPc=' + hex(bootResult.lastPc, 6));

  // Snapshot RAM + CPU after cold boot
  const ramSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
  const cpuSnap = snapshotCpu(cpu);

  // Restore and run all 4 stages (same as golden probe)
  mem.set(ramSnap, 0x400000);
  restoreCpu(cpu, cpuSnap, mem);
  runStage(executor, 'stage 1 status bar background', STAGE_1_ENTRY, 30000);

  restoreCpu(cpu, cpuSnap, mem);
  mem[0xd0009b] &= ~0x40;
  runStage(executor, 'stage 2 status dots', STAGE_2_ENTRY, 30000);

  restoreCpu(cpu, cpuSnap, mem);
  runStage(executor, 'stage 3 home row strip', STAGE_3_ENTRY, 50000);

  restoreCpu(cpu, cpuSnap, mem);
  runStage(executor, 'stage 4 history area', STAGE_4_ENTRY, 50000);

  // Check descriptor region after stage 1 only (re-run to isolate)
  console.log('');
  console.log('--- Checking after each stage individually ---');

  // Re-run cold boot for per-stage checks
  mem.fill(0, 0x400000, 0xE00000);
  mem.set(ramSnap, 0x400000);

  // Check after cold boot
  console.log('After cold boot:');
  console.log('  D01EB1[0]=' + hexByte(mem[0xD01EB1]) + ' D01EBA[0]=' + hexByte(mem[0xD01EBA]) + ' D01EDE[0]=' + hexByte(mem[0xD01EDE]));

  // Run each stage and check
  restoreCpu(cpu, cpuSnap, mem);
  runStage(executor, 'check-stage1', STAGE_1_ENTRY, 30000);
  console.log('After stage 1:');
  console.log('  D01EB1[0]=' + hexByte(mem[0xD01EB1]) + ' D01EBA[0]=' + hexByte(mem[0xD01EBA]) + ' D01EDE[0]=' + hexByte(mem[0xD01EDE]));

  restoreCpu(cpu, cpuSnap, mem);
  mem[0xd0009b] &= ~0x40;
  runStage(executor, 'check-stage2', STAGE_2_ENTRY, 30000);
  console.log('After stage 2:');
  console.log('  D01EB1[0]=' + hexByte(mem[0xD01EB1]) + ' D01EBA[0]=' + hexByte(mem[0xD01EBA]) + ' D01EDE[0]=' + hexByte(mem[0xD01EDE]));

  restoreCpu(cpu, cpuSnap, mem);
  runStage(executor, 'check-stage3', STAGE_3_ENTRY, 50000);
  console.log('After stage 3:');
  console.log('  D01EB1[0]=' + hexByte(mem[0xD01EB1]) + ' D01EBA[0]=' + hexByte(mem[0xD01EBA]) + ' D01EDE[0]=' + hexByte(mem[0xD01EDE]));

  restoreCpu(cpu, cpuSnap, mem);
  runStage(executor, 'check-stage4', STAGE_4_ENTRY, 50000);
  console.log('After stage 4:');
  console.log('  D01EB1[0]=' + hexByte(mem[0xD01EB1]) + ' D01EBA[0]=' + hexByte(mem[0xD01EBA]) + ' D01EDE[0]=' + hexByte(mem[0xD01EDE]));

  // Dump the full descriptor region D01EB0 - D01F20 (112 bytes)
  dumpRegion(mem, 0xD01EB0, 112, 'D01EB0-D01F1F: Token Descriptor Region');

  // Dump cursor type
  const cursorType = mem[0xD02575];
  console.log('');
  console.log('=== Cursor Type ===');
  console.log('  D02575 = ' + hexByte(cursorType) + ' (' + cursorType + ')');

  // Dump active cursor descriptor D005F8-D00600
  dumpRegion(mem, 0xD005F8, 9, 'D005F8-D00600: Active Cursor Descriptor');

  // Check each pointer location
  console.log('');
  console.log('=== Pointer First-Byte Analysis ===');
  console.log('HL pointers (source for CP 0x0E check):');
  printPointerByte(mem, 0xD01EB1, 'Type 0 HL');
  printPointerByte(mem, 0xD01EBA, 'Type 1 HL');
  printPointerByte(mem, 0xD01EDE, 'Type >=2 HL');

  console.log('DE pointers:');
  printPointerByte(mem, 0xD01ECC, 'Type 0 DE');
  printPointerByte(mem, 0xD01ED5, 'Type 1 DE');
  printPointerByte(mem, 0xD01EF9, 'Type >=2 DE');

  // Dump individual descriptor blocks with boundaries
  console.log('');
  console.log('=== Individual Descriptor Blocks ===');
  dumpRegion(mem, 0xD01EB1, 0xD01ECC - 0xD01EB1, 'Type 0 HL block: D01EB1-D01ECB (27 bytes)');
  dumpRegion(mem, 0xD01ECC, 0xD01ED5 - 0xD01ECC, 'Type 0 DE block: D01ECC-D01ED4 (9 bytes)');
  dumpRegion(mem, 0xD01EBA, 0xD01ED5 - 0xD01EBA, 'Type 1 HL block: D01EBA-D01ED4 (27 bytes)');
  dumpRegion(mem, 0xD01ED5, 0xD01EDE - 0xD01ED5, 'Type 1 DE block: D01ED5-D01EDD (9 bytes)');
  dumpRegion(mem, 0xD01EDE, 0xD01EF9 - 0xD01EDE, 'Type >=2 HL block: D01EDE-D01EF8 (27 bytes)');
  dumpRegion(mem, 0xD01EF9, 0xD01F14 - 0xD01EF9, 'Type >=2 DE block: D01EF9-D01F13 (27 bytes)');

  // Summary
  console.log('');
  console.log('=== Summary ===');
  const hlAddrs = [0xD01EB1, 0xD01EBA, 0xD01EDE];
  const deAddrs = [0xD01ECC, 0xD01ED5, 0xD01EF9];
  const labels = ['Type 0', 'Type 1', 'Type >=2'];

  for (let i = 0; i < 3; i++) {
    const hlByte = mem[hlAddrs[i]];
    const deByte = mem[deAddrs[i]];
    const hlIs0E = hlByte === 0x0E ? 'YES' : 'no';
    const deIs0E = deByte === 0x0E ? 'YES' : 'no';
    console.log(labels[i] + ': HL[0]=' + hexByte(hlByte) + ' (==0x0E? ' + hlIs0E + '), DE[0]=' + hexByte(deByte) + ' (==0x0E? ' + deIs0E + ')');
  }

  console.log('');
  console.log('Current cursor type at D02575: ' + cursorType);
  const idx = Math.min(cursorType, 2);
  console.log('Active HL pointer for this type: ' + hex(hlAddrs[idx], 6));
  console.log('Active DE pointer for this type: ' + hex(deAddrs[idx], 6));

  // Check if any bytes in the region equal 0x0E
  console.log('');
  console.log('=== All 0x0E occurrences in D01EB0-D01F1F ===');
  let found0E = false;
  for (let addr = 0xD01EB0; addr < 0xD01F20; addr++) {
    if (mem[addr] === 0x0E) {
      console.log('  ' + hex(addr, 6) + ' = 0x0E');
      found0E = true;
    }
  }
  if (!found0E) {
    console.log('  No 0x0E bytes found in this region.');
  }

  process.exitCode = 0;
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}
