#!/usr/bin/env node
/**
 * Phase 270 — IFF1 enable + ISR test during OS event loop
 *
 * Tests what happens when interrupts are enabled (IFF1=1) during the OS
 * event loop. The event loop's no-key HALT path does EI+HALT at 0x040D40.
 * Timer IRQ is generated but MASKED because IFF1=0 after boot. The ISR
 * chain delivers key events via 0x02F68A.
 *
 * Experiment 1: EI before event loop, timer enabled
 * Experiment 2: EI + key injection, timer disabled
 * Experiment 3: Timer disabled, IFF1=1, watch for HALT stall
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
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const RETURN_SENTINEL = 0x7FFFFE;

const HOME_BODY_BYPASS = 0x0582BC;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;

const D000A5 = 0xD000A5;
const D0058C = 0xD0058C;
const D0058E = 0xD0058E;
const D007D0 = 0xD007D0;
const D007E8 = 0xD007E8;
const D007FA = 0xD007FA;
const D0230F = 0xD0230F;

const HANDLER_ADDR = 0x06C546;

// Key blocks to watch
const KEY_BLOCKS = [
  { addr: 0x082BE2, label: 'event loop' },
  { addr: 0x040D40, label: 'HALT (EI+HALT)' },
  { addr: 0x003D55, label: 'ISR keyboard' },
  { addr: 0x02F68A, label: 'key pipeline' },
  { addr: 0x02FE89, label: 'key handler' },
  { addr: 0x0582BC, label: 'home body' },
  { addr: 0x000038, label: 'IRQ vector' },
  { addr: 0x001713, label: 'ISR dispatch' },
  { addr: 0x0067F8, label: 'ISR body' },
  { addr: 0x001C33, label: 'timer dispatch' },
  { addr: 0x0159C0, label: 'keyboard scan' },
  { addr: 0x02FD8F, label: 'key read call' },
  { addr: 0x03013A, label: 'key read target' },
  { addr: 0x000000, label: 'CRASH (PC=0)' },
];

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
  executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xD0;
  cpu._iy = IY_BASE;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });
}

function prepareEventLoopEntry(cpu, mem) {
  cpu.halted = false;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = IY_BASE;
  cpu._ix = IX_BASE;

  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  write24(mem, cpu.sp, RETURN_SENTINEL);

  mem[D0230F & MEM_MASK] = 0x3F;
  mem[D000A5 & MEM_MASK] = mem[D000A5 & MEM_MASK] & 0xDF;
  write24(mem, D007D0, HANDLER_ADDR);
  write24(mem, D007E8, HANDLER_ADDR);
  write24(mem, D007FA, cpu.sp);
}

function runExperiment(executor, cpu, mem, label, maxSteps) {
  const blockMap = new Map();
  const interrupts = [];
  const missingBlocks = [];
  let crashDetected = false;

  const result = executor.runFrom(HOME_BODY_BYPASS, 'adl', {
    maxSteps,
    maxLoopIterations: 100000,
    onBlock(pc, mode, _meta, step) {
      const normalizedPc = pc >>> 0;
      const key = `${normalizedPc.toString(16).padStart(6, '0')}:${mode ?? 'adl'}`;
      let record = blockMap.get(key);
      if (!record) {
        record = { pc: normalizedPc, mode: mode ?? 'adl', count: 0, firstStep: step + 1 };
        blockMap.set(key, record);
      }
      record.count++;
      if (normalizedPc === 0x000000) crashDetected = true;
    },
    onInterrupt(type, fromPc, vector, step) {
      interrupts.push({ type, fromPc: fromPc >>> 0, vector: vector >>> 0, step: step + 1 });
    },
    onMissingBlock(pc, mode, step) {
      missingBlocks.push({ pc: pc >>> 0, mode, step: step + 1 });
    },
  });

  // Report
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  ${label}`);
  console.log(`${'='.repeat(70)}`);

  console.log(`\n  Total steps:    ${result.steps}`);
  console.log(`  Termination:    ${result.termination}`);
  console.log(`  Last PC:        ${hex(result.lastPc)}:${result.lastMode ?? 'adl'}`);
  console.log(`  Loops forced:   ${result.loopsForced ?? 0}`);
  console.log(`  Unique blocks:  ${blockMap.size}`);
  console.log(`  Crash (PC=0):   ${crashDetected}`);

  // Key block visits
  console.log(`\n  Key block visits:`);
  for (const { addr, label: blockLabel } of KEY_BLOCKS) {
    const key = `${addr.toString(16).padStart(6, '0')}:adl`;
    const record = blockMap.get(key);
    const count = record ? record.count : 0;
    const firstStep = record ? record.firstStep : '-';
    console.log(`    ${hex(addr)} ${blockLabel.padEnd(20)} visits=${String(count).padStart(5)} firstStep=${firstStep}`);
  }

  // CPU state at end
  console.log(`\n  CPU state at end:`);
  console.log(`    IFF1=${cpu.iff1}  IFF2=${cpu.iff2}  halted=${cpu.halted}`);
  console.log(`    MADL=${cpu.madl}  MBASE=${hex(cpu.mbase, 2)}`);
  console.log(`    SP=${hex(cpu.sp)}  PC(last)=${hex(result.lastPc)}`);

  // Memory state at end
  console.log(`\n  Memory at end:`);
  console.log(`    D0058E (key scan code) = ${hex(mem[D0058E & MEM_MASK], 2)}`);
  console.log(`    D0058C (pending flag)  = ${hex(mem[D0058C & MEM_MASK], 2)}`);

  // Interrupts
  console.log(`\n  Interrupt events: ${interrupts.length}`);
  for (const irq of interrupts.slice(0, 20)) {
    console.log(`    step=${String(irq.step).padStart(5)} type=${irq.type} from=${hex(irq.fromPc)} vector=${hex(irq.vector)}`);
  }
  if (interrupts.length > 20) {
    console.log(`    ... ${interrupts.length - 20} more`);
  }

  // Missing blocks
  if (missingBlocks.length > 0) {
    console.log(`\n  Missing blocks: ${missingBlocks.length}`);
    for (const mb of missingBlocks.slice(0, 10)) {
      console.log(`    step=${mb.step} ${hex(mb.pc)}:${mb.mode}`);
    }
    if (missingBlocks.length > 10) {
      console.log(`    ... ${missingBlocks.length - 10} more`);
    }
  }

  // All unique blocks sorted by first step
  const allBlocks = [...blockMap.values()].sort((a, b) => a.firstStep - b.firstStep);
  console.log(`\n  All unique blocks (${allBlocks.length}, sorted by first visit):`);
  for (const block of allBlocks.slice(0, 60)) {
    console.log(`    ${hex(block.pc)}:${block.mode} visits=${block.count} firstStep=${block.firstStep}`);
  }
  if (allBlocks.length > 60) {
    console.log(`    ... ${allBlocks.length - 60} more`);
  }

  return { result, blockMap, interrupts, missingBlocks, crashDetected };
}

async function main() {
  console.log('=== Phase 270 — IFF1 Enable + ISR Test During OS Event Loop ===\n');

  // ─────────────────────────────────────────────────────────────────────
  // Experiment 1: EI before event loop, timer enabled
  // ─────────────────────────────────────────────────────────────────────
  {
    console.log('\nSetting up Experiment 1: EI before event loop, timer ENABLED');

    const mem = new Uint8Array(MEM_SIZE);
    mem.set(romBytes);
    const peripherals = createPeripheralBus({ timerInterrupt: true });
    const executor = createExecutor(BLOCKS, mem, { peripherals });
    const cpu = executor.cpu;

    coldBoot(executor, cpu, mem);
    prepareEventLoopEntry(cpu, mem);

    // Enable interrupts
    cpu.iff1 = 1;
    cpu.iff2 = 1;
    console.log('  IFF1=1, IFF2=1 set. Timer interrupt enabled.');

    runExperiment(executor, cpu, mem, 'Experiment 1: EI + timer enabled, 10000 steps', 10000);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Experiment 2: EI + key injection, timer disabled
  // ─────────────────────────────────────────────────────────────────────
  {
    console.log('\n\nSetting up Experiment 2: EI + key injection, timer DISABLED');

    const mem = new Uint8Array(MEM_SIZE);
    mem.set(romBytes);
    const peripherals = createPeripheralBus({ timerInterrupt: false });
    const executor = createExecutor(BLOCKS, mem, { peripherals });
    const cpu = executor.cpu;

    coldBoot(executor, cpu, mem);
    prepareEventLoopEntry(cpu, mem);

    // Enable interrupts
    cpu.iff1 = 1;
    cpu.iff2 = 1;

    // Inject key: digit "1" (0x8F) with pending flag
    mem[D0058E & MEM_MASK] = 0x8F;
    mem[D0058C & MEM_MASK] = 0x01;
    console.log('  IFF1=1, IFF2=1 set. Key injected: D0058E=0x8F, D0058C=0x01. Timer disabled.');

    runExperiment(executor, cpu, mem, 'Experiment 2: EI + key injection (digit 1), timer disabled, 10000 steps', 10000);
  }

  // ─────────────────────────────────────────────────────────────────────
  // Experiment 3: Timer disabled, IFF1=1, watch for HALT stall
  // ─────────────────────────────────────────────────────────────────────
  {
    console.log('\n\nSetting up Experiment 3: Timer disabled, IFF1=1, watch for HALT stall');

    const mem = new Uint8Array(MEM_SIZE);
    mem.set(romBytes);
    const peripherals = createPeripheralBus({ timerInterrupt: false });
    const executor = createExecutor(BLOCKS, mem, { peripherals });
    const cpu = executor.cpu;

    coldBoot(executor, cpu, mem);
    prepareEventLoopEntry(cpu, mem);

    // Enable interrupts
    cpu.iff1 = 1;
    cpu.iff2 = 1;
    console.log('  IFF1=1, IFF2=1 set. Timer disabled. No key injection.');

    runExperiment(executor, cpu, mem, 'Experiment 3: EI only, timer disabled, 5000 steps', 5000);
  }

  console.log('\n\n=== Phase 270 complete ===');
}

try {
  await main();
} catch (error) {
  console.error('FATAL:', error.stack || error);
  process.exitCode = 1;
}
