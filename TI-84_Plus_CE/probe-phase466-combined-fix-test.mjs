#!/usr/bin/env node
// Phase 466: Combined EI+HALT + port 0x0F probe
// Tests that:
//   1. Port 0x0F override routes scheduler to event handler (0x001794) not USB (0x001644)
//   2. EI+HALT countdown barrier (0x001783) is reached
//   3. Timer service (0x001ACF) fires (requires timerInterrupt: true)
//   4. Key processor (0x03FA09) is reached

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

// Boot constants
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

// Scheduler / probe addresses
const SCHEDULER_ENTRY = 0x0015F7;
const SCHEDULER_MAX_STEPS = 2000000;
const SCHEDULER_MAX_LOOP_ITERATIONS = 50000;

// Memory addresses
const KEY_PROCESSING_ENABLE = 0xD14091;
const DISPLAY_DIRTY_FLAG = 0xD177B7;
const ISR_GUARD = 0xD177BA;
const KEY_SCAN_CODE = 0xD00587;
const KEY_EVENT_FLAGS = 0xD00080;

const TRACKED_PCS = [
  [0x0015F7, 'scheduler entry'],
  [0x0015FB, 'port 0x0F read'],
  [0x001794, 'event handler'],
  [0x001783, 'EI+HALT countdown barrier'],
  [0x0017CE, 'rotating display refresh'],
  [0x001296, 'interrupt status check'],
  [0x03FA09, 'key processor'],
  [0x001644, 'USB path'],
  [0x003A0F, 'event loop re-entry'],
  [0x001ACF, 'timer service'],
];

const WATCHED_ADDRS = [
  0xD00587,
  0xD00080,
  0xD141B5,
  0xD02658,
  0xD177B7,
];

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(Number(value) & 0xFF, 2);
}

function coldBoot(executor, cpu, mem) {
  const bootResult = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelResult = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInitResult = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return { boot: bootResult, kernel: kernelResult, postInit: postInitResult };
}

function snapshotMemory(mem) {
  return new Map(WATCHED_ADDRS.map((addr) => [addr, mem[addr]]));
}

async function main() {
  console.log('=== Phase 466: Combined EI+HALT + Port 0x0F Probe ===');
  console.log('Tests: event handler path, EI+HALT barrier, timer service, key processor');
  console.log('');

  // --- Create runtime (direct style, matching probe-phase464) ---
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({
    pllDelay: 2,
    timerInterrupt: true,  // EI+HALT fix requires timer interrupts
  });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Set keyboard matrix: key "1" = group 4, bit 1 → port 0x0F returns 0x40
  peripherals.setMatrixKey(4, 1, true);

  console.log(`ROM bytes: ${romBytes.length}`);
  console.log('');

  // --- Stage 1: Cold boot ---
  console.log('--- Stage 1: Cold boot ---');
  const bootState = coldBoot(executor, cpu, mem);
  console.log(`boot:     steps=${bootState.boot.steps} term=${bootState.boot.termination}`);
  console.log(`kernel:   steps=${bootState.kernel.steps} term=${bootState.kernel.termination}`);
  console.log(`postInit: steps=${bootState.postInit.steps} term=${bootState.postInit.termination}`);
  console.log('');

  // --- Stage 2: Pre-run state setup ---
  console.log('--- Stage 2: Pre-run state setup ---');
  mem[KEY_PROCESSING_ENABLE] = 0x01;
  mem[DISPLAY_DIRTY_FLAG] = 0x55;
  mem[ISR_GUARD] = 0x7F;
  mem[KEY_SCAN_CODE] = 0x92;
  mem[KEY_EVENT_FLAGS] = (mem[KEY_EVENT_FLAGS] | 0x08) & 0xFF;

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;

  console.log(`D00587 scan code  = ${hexByte(mem[KEY_SCAN_CODE])}`);
  console.log(`D00080 key flags  = ${hexByte(mem[KEY_EVENT_FLAGS])} (bit3=${(mem[KEY_EVENT_FLAGS] >> 3) & 1})`);
  console.log(`D14091 key enable = ${hexByte(mem[KEY_PROCESSING_ENABLE])}`);
  console.log(`D177B7 disp dirty = ${hexByte(mem[DISPLAY_DIRTY_FLAG])}`);
  console.log('');

  // --- Stage 3: Override port 0x0F ---
  console.log('--- Stage 3: Override port 0x0F ---');
  let port0fReads = 0;
  peripherals.register(0x0F, {
    read() {
      port0fReads++;
      if (port0fReads <= 1000) {
        return 0x40; // bit 6 set, bit 7 clear -> event handler path
      }
      return 0x00;
    },
    write() {},
  });
  console.log('Port 0x0F re-registered: 0x40 for first 1000 reads, then 0x00');
  console.log('');

  // --- Tracking state ---
  const trackedState = new Map();
  for (const [pc, label] of TRACKED_PCS) {
    trackedState.set(pc, { label, count: 0, firstStep: null, lastStep: null });
  }

  const before = snapshotMemory(mem);
  const missingBlocks = [];

  // --- Stage 4: Run scheduler ---
  console.log('--- Stage 4: Run scheduler at 0x0015F7 ---');
  let runResult;
  try {
    runResult = executor.runFrom(SCHEDULER_ENTRY, 'adl', {
      maxSteps: SCHEDULER_MAX_STEPS,
      maxLoopIterations: SCHEDULER_MAX_LOOP_ITERATIONS,
      diHaltBypass: true,

      onBlock(pc, mode, _meta, steps) {
        const normalizedPc = pc & 0xFFFFFF;
        const stepIndex = steps + 1;

        const tracked = trackedState.get(normalizedPc);
        if (tracked) {
          tracked.count++;
          if (tracked.firstStep === null) {
            tracked.firstStep = stepIndex;
          }
          tracked.lastStep = stepIndex;
        }
      },

      onMissingBlock(pc, mode, steps) {
        if (missingBlocks.length < 30) {
          missingBlocks.push({ step: steps + 1, pc: pc & 0xFFFFFF, mode });
        }
      },
    });
  } catch (error) {
    runResult = {
      steps: cpu.stepCount ?? 0,
      lastPc: cpu.pc ?? SCHEDULER_ENTRY,
      lastMode: cpu.madl ? 'adl' : 'z80',
      termination: 'throw',
      error: error instanceof Error ? error.message : String(error),
    };
  }

  console.log(`run: steps=${runResult.steps} term=${runResult.termination} lastPc=${hex(runResult.lastPc)}`);
  if (runResult.error) console.log(`run error: ${runResult.error}`);
  console.log(`port 0x0F total reads: ${port0fReads}`);
  console.log('');

  const after = snapshotMemory(mem);

  // --- Results: Hit counts ---
  console.log('=== Hit Count Summary ===');
  for (const [pc] of TRACKED_PCS) {
    const t = trackedState.get(pc);
    const flag = pc === 0x001644 && t.count > 0 ? ' *** SHOULD NOT BE HIT ***' : '';
    console.log(
      `${t.label.padEnd(30)} ${hex(pc)}  count=${t.count} `
      + `first=${t.firstStep ?? 'n/a'} last=${t.lastStep ?? 'n/a'}`
      + flag,
    );
  }
  console.log('');

  // --- Results: Watched memory ---
  console.log('=== Watched Memory ===');
  for (const addr of WATCHED_ADDRS) {
    const oldVal = before.get(addr);
    const newVal = after.get(addr);
    const changed = oldVal !== newVal ? 'changed' : 'same';
    console.log(`${hex(addr)}: before=${hexByte(oldVal)} after=${hexByte(newVal)} ${changed}`);
  }
  console.log('');

  // --- Results: Missing blocks ---
  if (missingBlocks.length > 0) {
    console.log('=== Missing Blocks ===');
    for (const mb of missingBlocks) {
      console.log(`step=${mb.step} pc=${hex(mb.pc)} mode=${mb.mode}`);
    }
    console.log('');
  }

  // --- VRAM ---
  const vram = mem.slice(0xD40000, 0xD40000 + (320 * 240 * 2));
  let nonZeroVramBytes = 0;
  for (const byte of vram) {
    if (byte !== 0) nonZeroVramBytes++;
  }
  console.log(`VRAM non-zero bytes: ${nonZeroVramBytes}`);
  console.log('');

  // --- Checks ---
  const checks = [
    ['Event handler 0x001794 reached', (trackedState.get(0x001794)?.count ?? 0) > 0],
    ['USB path 0x001644 NOT taken', (trackedState.get(0x001644)?.count ?? 0) === 0],
    ['EI+HALT barrier 0x001783 reached', (trackedState.get(0x001783)?.count ?? 0) > 0],
    ['Timer service 0x001ACF reached', (trackedState.get(0x001ACF)?.count ?? 0) > 0],
    ['D02658 countdown changed', before.get(0xD02658) !== after.get(0xD02658)],
    ['Key processor 0x03FA09 reached', (trackedState.get(0x03FA09)?.count ?? 0) > 0],
  ];

  console.log('=== Checks ===');
  for (const [label, passed] of checks) {
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${label}`);
  }

  const allPassed = checks.every(([, passed]) => passed);
  console.log('');
  console.log(allPassed ? 'PASS: All checks passed.' : 'FAIL: Some checks failed.');

  process.exitCode = allPassed ? 0 : 1;
}

try {
  await main();
} catch (error) {
  console.error('Fatal error:', error.stack || error);
  process.exitCode = 1;
}
