#!/usr/bin/env node

/**
 * Phase 25AP: Check 0xFFF909 validity + trace history manager with numLastEntries=1
 *
 * Part A: Verify 0xFFF909 is outside ROM (ROM is 0x000000-0x3FFFFF)
 * Part B: Trace 0x0921CB step-by-step with numLastEntries=1 to find where
 *         the corrupted jump target comes from
 * Part C: Dump the history buffer at 0xD0150B after MEM_INIT
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const rom = readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_ENTRY = 0x09dee0;
const MEMINIT_RET = 0xfffff6;

const IY_ADDR = 0xd00080;
const IX_ADDR = 0xd1a860;

const NUM_LAST_ENTRIES_ADDR = 0xd01d0b;
const CURR_LAST_ENTRY_ADDR = 0xd01d0c;
const HISTORY_BUFFER_ADDR = 0xd0150b;

const HISTORY_MANAGER_ENTRY = 0x0921cb;
const SUSPECT_ADDR = 0xfff909;
const ROM_END = 0x400000;

const DEFAULT_MAX_LOOP_ITER = 8192;
const FAKE_RET = 0xfffffe;

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function read24(mem, addr) {
  return ((mem[addr] & 0xff) | ((mem[addr + 1] & 0xff) << 8) | ((mem[addr + 2] & 0xff) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

function hexBytes(mem, addr, len) {
  const parts = [];
  for (let i = 0; i < len; i += 1) {
    parts.push((mem[addr + i] & 0xff).toString(16).toUpperCase().padStart(2, '0'));
  }
  return parts.join(' ');
}

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, 0x400000));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  return { mem, peripherals, executor, cpu };
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xd0;
  cpu._iy = IY_ADDR;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });
}

function prepareCallState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xd0;
  cpu._iy = IY_ADDR;
  cpu._ix = IX_ADDR;
  cpu._hl = 0;
  cpu.bc = 0;
  cpu.de = 0;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
}

function runMemInit(runtime) {
  const { mem, cpu, executor } = runtime;
  prepareCallState(cpu, mem);
  cpu.a = 0x00;
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);

  const sentinels = new Map([
    [MEMINIT_RET, 'return_hit'],
    [0xffffff, 'missing_block_terminal'],
  ]);

  let steps = 0;
  let termination = 'unknown';
  let finalPc = MEMINIT_ENTRY;

  try {
    const result = executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: 10000,
      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        steps = Math.max(steps, (step ?? 0) + 1);
        finalPc = norm;
        if (sentinels.has(norm)) {
          const err = new Error('__SENTINEL__');
          err.isSentinel = true;
          err.termination = sentinels.get(norm);
          throw err;
        }
      },
      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        steps = Math.max(steps, (step ?? 0) + 1);
        finalPc = norm;
        if (sentinels.has(norm)) {
          const err = new Error('__SENTINEL__');
          err.isSentinel = true;
          err.termination = sentinels.get(norm);
          throw err;
        }
      },
    });
    steps = Math.max(steps, result.steps ?? 0);
    finalPc = (result.lastPc ?? finalPc) & 0xffffff;
    termination = result.termination ?? 'unknown';
  } catch (err) {
    if (err?.isSentinel) {
      termination = err.termination;
    } else {
      throw err;
    }
  }

  return { steps, termination, finalPc };
}

async function main() {
  const log = (line = '') => console.log(line);

  log('=== Phase 25AP: 0xFFF909 validity check + history manager trace ===');
  log();

  // ========== PART A: Verify 0xFFF909 is outside ROM ==========
  log('--- Part A: Is 0xFFF909 a valid ROM address? ---');
  log();
  log(`ROM size:       ${rom.length} bytes (${hex(rom.length)})`);
  log(`ROM range:      0x000000 - ${hex(rom.length - 1)}`);
  log(`Suspect addr:   ${hex(SUSPECT_ADDR)}`);
  log(`In ROM range?   ${SUSPECT_ADDR < ROM_END ? 'YES' : 'NO (outside ROM)'}`);

  if (SUSPECT_ADDR < ROM_END) {
    log(`ROM bytes at ${hex(SUSPECT_ADDR)}: ${hexBytes(rom, SUSPECT_ADDR, 8)}`);
  } else {
    log(`0xFFF909 > 0x3FFFFF — this is NOT a valid ROM code address.`);
    log(`It falls in the RAM region (0xD00000-0xFFFFFF on eZ80).`);
    log(`Specifically 0xFFF909 is in unmapped/unused RAM space.`);
  }

  // Check if BLOCKS has an entry for 0xFFF909
  const hasBlock = BLOCKS.has ? BLOCKS.has(SUSPECT_ADDR) :
    (typeof BLOCKS === 'object' && SUSPECT_ADDR in BLOCKS);
  log(`Transpiled block at ${hex(SUSPECT_ADDR)}? ${hasBlock ? 'YES' : 'NO'}`);
  log();

  // ========== PART B: Boot and run MEM_INIT ==========
  log('--- Part B: Boot + MEM_INIT ---');

  const runtime = createRuntime();
  const { mem, cpu, executor } = runtime;

  coldBoot(executor, cpu, mem);
  log('Cold boot complete.');

  const memInit = runMemInit(runtime);
  log(`MEM_INIT: term=${memInit.termination} steps=${memInit.steps} finalPc=${hex(memInit.finalPc)}`);
  log();

  // ========== PART C: Dump history buffer after MEM_INIT ==========
  log('--- Part C: History buffer state after MEM_INIT ---');
  log();

  const numLastEntries = mem[NUM_LAST_ENTRIES_ADDR] & 0xff;
  const currLastEntry = mem[CURR_LAST_ENTRY_ADDR] & 0xff;
  log(`numLastEntries (0xD01D0B): ${hex(numLastEntries, 2)} (${numLastEntries})`);
  log(`currLastEntry  (0xD01D0C): ${hex(currLastEntry, 2)} (${currLastEntry})`);
  log();

  // Dump the history buffer area — it's a circular buffer of entry pointers
  // Each entry is 3 bytes (24-bit pointer). Dump 32 entries = 96 bytes
  log(`History buffer at ${hex(HISTORY_BUFFER_ADDR)}:`);
  for (let i = 0; i < 32; i++) {
    const entryAddr = HISTORY_BUFFER_ADDR + i * 3;
    const ptr = read24(mem, entryAddr);
    const isZero = ptr === 0;
    log(`  entry[${i.toString().padStart(2)}] @ ${hex(entryAddr)}: ${hex(ptr)}${isZero ? ' (zero/uninitialized)' : ''}`);
  }
  log();

  // Also dump raw bytes around the history buffer
  log(`Raw bytes at history buffer (${hex(HISTORY_BUFFER_ADDR)}, 96 bytes):`);
  for (let row = 0; row < 6; row++) {
    const addr = HISTORY_BUFFER_ADDR + row * 16;
    log(`  ${hex(addr)}: ${hexBytes(mem, addr, 16)}`);
  }
  log();

  // ========== PART D: Force numLastEntries=1 and trace history manager ==========
  log('--- Part D: Trace 0x0921CB with numLastEntries=1 ---');
  log();

  // Set up clean call state
  prepareCallState(cpu, mem);

  // Force numLastEntries = 1
  mem[NUM_LAST_ENTRIES_ADDR] = 1;
  log(`Forced numLastEntries = ${mem[NUM_LAST_ENTRIES_ADDR] & 0xff}`);
  log(`currLastEntry = ${mem[CURR_LAST_ENTRY_ADDR] & 0xff}`);

  // Push return address
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);
  log(`Return address: ${hex(FAKE_RET)} pushed at SP=${hex(cpu.sp)}`);
  log(`Initial regs: A=${hex(cpu.a, 2)} F=${hex(cpu.f, 2)} HL=${hex(cpu._hl)} BC=${hex(cpu._bc)} DE=${hex(cpu._de)} SP=${hex(cpu.sp)} IY=${hex(cpu._iy)}`);
  log();

  // Trace every step
  const pcTrace = [];
  const missingBlocks = [];
  const ramReads = [];
  let lastStep = 0;

  const sentinels = new Map([
    [FAKE_RET, 'return_hit'],
    [0xffffff, 'missing_block_terminal'],
  ]);

  let termination = 'unknown';
  let finalPc = HISTORY_MANAGER_ENTRY;

  try {
    const result = executor.runFrom(HISTORY_MANAGER_ENTRY, 'adl', {
      maxSteps: 300,
      maxLoopIterations: DEFAULT_MAX_LOOP_ITER,
      onBlock(pc, mode, meta, step) {
        const norm = pc & 0xffffff;
        const stepNum = (step ?? 0) + 1;
        lastStep = stepNum;
        finalPc = norm;

        pcTrace.push({
          step: stepNum,
          pc: norm,
          type: 'block',
          regs: {
            a: cpu.a & 0xff,
            f: cpu.f & 0xff,
            hl: cpu._hl & 0xffffff,
            bc: cpu._bc & 0xffffff,
            de: cpu._de & 0xffffff,
            sp: cpu.sp & 0xffffff,
          },
        });

        if (sentinels.has(norm)) {
          const err = new Error('__SENTINEL__');
          err.isSentinel = true;
          err.termination = sentinels.get(norm);
          throw err;
        }
      },
      onMissingBlock(pc, mode, step) {
        const norm = pc & 0xffffff;
        const stepNum = (step ?? 0) + 1;
        lastStep = stepNum;
        finalPc = norm;

        missingBlocks.push({ step: stepNum, pc: norm });
        pcTrace.push({
          step: stepNum,
          pc: norm,
          type: 'MISSING',
          regs: {
            a: cpu.a & 0xff,
            f: cpu.f & 0xff,
            hl: cpu._hl & 0xffffff,
            bc: cpu._bc & 0xffffff,
            de: cpu._de & 0xffffff,
            sp: cpu.sp & 0xffffff,
          },
        });

        if (sentinels.has(norm)) {
          const err = new Error('__SENTINEL__');
          err.isSentinel = true;
          err.termination = sentinels.get(norm);
          throw err;
        }
      },
      onDynamicTarget(target, mode, fromPc, step) {
        const norm = target & 0xffffff;
        const stepNum = (step ?? 0) + 1;
        pcTrace.push({
          step: stepNum,
          pc: norm,
          type: 'dynamic-target',
          from: fromPc & 0xffffff,
        });
      },
    });

    lastStep = Math.max(lastStep, result.steps ?? 0);
    finalPc = (result.lastPc ?? finalPc) & 0xffffff;
    termination = result.termination ?? 'unknown';
  } catch (err) {
    if (err?.isSentinel) {
      termination = err.termination;
    } else {
      throw err;
    }
  }

  log(`Termination: ${termination}`);
  log(`Steps: ${lastStep}`);
  log(`Final PC: ${hex(finalPc)}`);
  log(`Missing blocks: ${missingBlocks.length}`);
  log();

  // Print full PC trace
  log('Full PC trace:');
  for (const entry of pcTrace) {
    if (entry.type === 'dynamic-target') {
      log(`  step ${String(entry.step).padStart(4)}: DYNAMIC -> ${hex(entry.pc)} from ${hex(entry.from)}`);
    } else {
      const regs = entry.regs;
      const regStr = `A=${hex(regs.a, 2)} F=${hex(regs.f, 2)} HL=${hex(regs.hl)} BC=${hex(regs.bc)} DE=${hex(regs.de)} SP=${hex(regs.sp)}`;
      const marker = entry.type === 'MISSING' ? ' *** MISSING BLOCK ***' : '';
      log(`  step ${String(entry.step).padStart(4)}: ${hex(entry.pc)} ${regStr}${marker}`);
    }
  }
  log();

  // Print missing blocks
  if (missingBlocks.length > 0) {
    log('Missing blocks encountered:');
    for (const mb of missingBlocks) {
      log(`  step ${mb.step}: ${hex(mb.pc)} — ${mb.pc < ROM_END ? 'IN ROM (could be seeded)' : 'OUTSIDE ROM (corrupted address)'}`);
    }
    log();
  }

  // ========== PART E: Analyze where the corrupted address comes from ==========
  log('--- Part E: Analysis ---');
  log();

  // Check what the last few PCs before the missing block were
  const lastMissing = missingBlocks[missingBlocks.length - 1];
  if (lastMissing) {
    log(`Last missing block: ${hex(lastMissing.pc)} at step ${lastMissing.step}`);

    // Look at the trace entries just before the missing block
    const idx = pcTrace.findIndex(e => e.step === lastMissing.step && e.type === 'MISSING');
    if (idx > 0) {
      const preceding = pcTrace.slice(Math.max(0, idx - 10), idx);
      log('Preceding 10 trace entries:');
      for (const entry of preceding) {
        const regs = entry.regs;
        if (regs) {
          log(`  step ${String(entry.step).padStart(4)}: ${hex(entry.pc)} A=${hex(regs.a, 2)} HL=${hex(regs.hl)} SP=${hex(regs.sp)}`);
        }
      }
    }
    log();

    // If the missing address is outside ROM, check what's on the stack
    if (lastMissing.pc >= ROM_END) {
      log(`The missing address ${hex(lastMissing.pc)} is OUTSIDE ROM.`);
      log(`This is a corrupted/uninitialized pointer, NOT valid code.`);
      log();

      // Check if it matches data in the history buffer
      log('Checking if this address appears in the history buffer:');
      for (let i = 0; i < 32; i++) {
        const entryAddr = HISTORY_BUFFER_ADDR + i * 3;
        const ptr = read24(mem, entryAddr);
        if (ptr === lastMissing.pc) {
          log(`  MATCH at entry[${i}] @ ${hex(entryAddr)}: ${hex(ptr)}`);
        }
      }
      log();

      // Also check stack at the point of the missing block
      const traceEntry = pcTrace[idx];
      if (traceEntry?.regs) {
        const sp = traceEntry.regs.sp;
        log(`Stack at time of missing block (SP=${hex(sp)}):`);
        for (let i = 0; i < 8; i++) {
          const stackAddr = sp + i * 3;
          const val = read24(mem, stackAddr);
          log(`  SP+${(i * 3).toString().padStart(2)}: ${hex(stackAddr)} = ${hex(val)}`);
        }
      }
    }
  }

  // Dump current state of numLastEntries area
  log();
  log('Final state of history-related RAM:');
  log(`  numLastEntries (0xD01D0B): ${hex(mem[NUM_LAST_ENTRIES_ADDR] & 0xff, 2)}`);
  log(`  currLastEntry  (0xD01D0C): ${hex(mem[CURR_LAST_ENTRY_ADDR] & 0xff, 2)}`);
  log(`  History buffer first 8 entries after run:`);
  for (let i = 0; i < 8; i++) {
    const entryAddr = HISTORY_BUFFER_ADDR + i * 3;
    const ptr = read24(mem, entryAddr);
    log(`    entry[${i}] @ ${hex(entryAddr)}: ${hex(ptr)}`);
  }

  log();
  log('=== End of Phase 25AP probe ===');
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
