#!/usr/bin/env node
// Phase 464: Override port 0x0F to return 0x40 (bit 6 set, bit 7 clear)
// so the scheduler at 0x0015F7 takes the event handler path (0x001794)
// instead of the USB path (0x001644).
//
// Port 0x0F currently hardcoded to 0x80 (bit 7) in peripherals.js,
// which means the scheduler ALWAYS routes to USB and never processes keys.
// This probe re-registers port 0x0F to return 0x40 for the first 1000 reads,
// then 0x00, simulating "keyboard event pending".

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

// Boot constants (same as phase 463)
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

// Scheduler addresses
const SCHEDULER_ENTRY = 0x0015F7;
const PORT_0F_READ = 0x0015FB;
const EVENT_HANDLER = 0x001794;
const EVENT_HANDLER_CALL_TARGET = 0x001296;
const SCHEDULER_BODY = 0x001652;
const RENDERER = 0x0059C6;
const KEY_PROCESSOR = 0x03FA09;
const EVENT_CLEANUP_JP = 0x003A0F;
const USB_PATH = 0x001644;

// Memory addresses
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_AVAILABLE_BYTE = 0xD00080;
const KEY_AVAILABLE_MASK = 0x08;
const KEY_BUFFER_ADDR = 0xD141B5;
const KEY_ENABLE_FLAG = 0xD14091;
const DISPLAY_DIRTY_FLAG = 0xD177B7;

const RUN_MAX_STEPS = 500000;
const RUN_MAX_LOOP_ITERATIONS = 10000;

const TRACKED_PCS = [
  [SCHEDULER_ENTRY, 'SCHEDULER_ENTRY_0x0015F7'],
  [PORT_0F_READ, 'PORT_0F_READ_0x0015FB'],
  [EVENT_HANDLER, 'EVENT_HANDLER_0x001794'],
  [EVENT_HANDLER_CALL_TARGET, 'EVT_CALL_0x001296'],
  [SCHEDULER_BODY, 'SCHEDULER_BODY_0x001652'],
  [RENDERER, 'RENDERER_0x0059C6'],
  [KEY_PROCESSOR, 'KEY_PROCESSOR_0x03FA09'],
  [EVENT_CLEANUP_JP, 'EVT_CLEANUP_0x003A0F'],
  [USB_PATH, 'USB_PATH_0x001644'],
];

const WATCHED_BYTES = [
  [KEY_SCAN_CODE_ADDR, 'D00587 scan code'],
  [KEY_AVAILABLE_BYTE, 'D00080 key avail'],
  [KEY_BUFFER_ADDR, 'D141B5 key buffer'],
  [KEY_ENABLE_FLAG, 'D14091 key enable'],
];

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
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

function createTrackedState() {
  const state = new Map();
  for (const [pc, label] of TRACKED_PCS) {
    state.set(pc, { label, count: 0, firstStep: null, lastStep: null, sampleSteps: [] });
  }
  return state;
}

function createWatchedState(mem) {
  const state = new Map();
  for (const [addr, label] of WATCHED_BYTES) {
    state.set(addr, { label, before: mem[addr] & 0xFF, totalChanges: 0, changes: [] });
  }
  return state;
}

function recordWatchedChange(watchedState, addr, before, after, step, pc, kind) {
  const entry = watchedState.get(addr);
  if (!entry || before === after) return;
  entry.totalChanges++;
  if (entry.changes.length < 12) {
    entry.changes.push({ step, pc, kind, before, after });
  }
}

async function main() {
  console.log('=== Phase 464: Port 0x0F Override — Force Event Handler Path ===');
  console.log('Override port 0x0F: 0x40 (bit 6) for first 1000 reads, then 0x00');
  console.log('Expected: scheduler routes to EVENT_HANDLER 0x001794 instead of USB 0x001644');
  console.log('');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({
    pllDelay: 2,
    timerInterrupt: false,
  });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // --- Stage 1: Cold boot ---
  console.log('--- Stage 1: Cold boot ---');
  const bootState = coldBoot(executor, cpu, mem);
  console.log(`boot:     steps=${bootState.boot.steps} term=${bootState.boot.termination}`);
  console.log(`kernel:   steps=${bootState.kernel.steps} term=${bootState.kernel.termination}`);
  console.log(`postInit: steps=${bootState.postInit.steps} term=${bootState.postInit.termination}`);
  console.log('');

  // --- Stage 2: Pre-run setup ---
  console.log('--- Stage 2: Pre-run state setup ---');
  mem[KEY_SCAN_CODE_ADDR] = 0x92;       // key "1" scan code
  mem[KEY_AVAILABLE_BYTE] |= KEY_AVAILABLE_MASK; // bit 3 = key available
  mem[KEY_ENABLE_FLAG] = 0x01;           // key processing enable gate
  mem[DISPLAY_DIRTY_FLAG] = 0x00;        // avoid 0x55 HALT trap

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;

  console.log(`D00587 scan code  = ${hex(mem[KEY_SCAN_CODE_ADDR], 2)}`);
  console.log(`D00080 key avail  = ${hex(mem[KEY_AVAILABLE_BYTE], 2)} (bit3=${(mem[KEY_AVAILABLE_BYTE] >> 3) & 1})`);
  console.log(`D14091 key enable = ${hex(mem[KEY_ENABLE_FLAG], 2)}`);
  console.log(`D177B7 disp dirty = ${hex(mem[DISPLAY_DIRTY_FLAG], 2)}`);
  console.log('');

  // --- Stage 3: Override port 0x0F ---
  console.log('--- Stage 3: Override port 0x0F ---');
  let port0fReads = 0;
  peripherals.register(0x0F, {
    read() {
      port0fReads++;
      if (port0fReads <= 1000) {
        return 0x40; // bit 6 set, bit 7 clear → event handler path
      }
      return 0x00; // nothing pending
    },
    write() {},
  });
  console.log('Port 0x0F re-registered: 0x40 for first 1000 reads, then 0x00');
  console.log('');

  // --- Tracking state ---
  const trackedState = createTrackedState();
  const watchedState = createWatchedState(mem);
  const firstUniquePcs = [];
  const firstUniquePcSet = new Set();
  const missingBlocks = [];
  const milestoneLog = [];

  let currentPc = SCHEDULER_ENTRY;
  let currentStep = 0;

  // Hook writes for watched memory
  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  cpu.write8 = (addr, value) => {
    const a = addr & 0xFFFFFF;
    const before = mem[a] & 0xFF;
    origWrite8(addr, value);
    recordWatchedChange(watchedState, a, before, mem[a] & 0xFF, currentStep, currentPc, 'write8');
  };

  cpu.write16 = (addr, value) => {
    const base = addr & 0xFFFFFF;
    const b0 = mem[base] & 0xFF;
    const b1 = mem[(base + 1) & 0xFFFFFF] & 0xFF;
    origWrite16(addr, value);
    recordWatchedChange(watchedState, base, b0, mem[base] & 0xFF, currentStep, currentPc, 'write16');
    recordWatchedChange(watchedState, (base + 1) & 0xFFFFFF, b1, mem[(base + 1) & 0xFFFFFF] & 0xFF, currentStep, currentPc, 'write16');
  };

  cpu.write24 = (addr, value) => {
    const base = addr & 0xFFFFFF;
    const b0 = mem[base] & 0xFF;
    const b1 = mem[(base + 1) & 0xFFFFFF] & 0xFF;
    const b2 = mem[(base + 2) & 0xFFFFFF] & 0xFF;
    origWrite24(addr, value);
    recordWatchedChange(watchedState, base, b0, mem[base] & 0xFF, currentStep, currentPc, 'write24');
    recordWatchedChange(watchedState, (base + 1) & 0xFFFFFF, b1, mem[(base + 1) & 0xFFFFFF] & 0xFF, currentStep, currentPc, 'write24');
    recordWatchedChange(watchedState, (base + 2) & 0xFFFFFF, b2, mem[(base + 2) & 0xFFFFFF] & 0xFF, currentStep, currentPc, 'write24');
  };

  // --- Stage 4: Run scheduler ---
  console.log('--- Stage 4: Run scheduler at 0x0015F7 with port 0x0F override ---');
  let runResult;
  try {
    runResult = executor.runFrom(SCHEDULER_ENTRY, 'adl', {
      maxSteps: RUN_MAX_STEPS,
      maxLoopIterations: RUN_MAX_LOOP_ITERATIONS,
      diHaltBypass: true,

      onBlock(pc, mode, _meta, steps) {
        const normalizedPc = pc & 0xFFFFFF;
        const stepIndex = steps + 1;
        currentPc = normalizedPc;
        currentStep = stepIndex;

        if (firstUniquePcs.length < 40 && !firstUniquePcSet.has(normalizedPc)) {
          firstUniquePcSet.add(normalizedPc);
          firstUniquePcs.push({ step: stepIndex, pc: normalizedPc, mode });
        }

        const tracked = trackedState.get(normalizedPc);
        if (tracked) {
          tracked.count++;
          if (tracked.firstStep === null) {
            tracked.firstStep = stepIndex;
            if (milestoneLog.length < 50) {
              milestoneLog.push(`step=${stepIndex} first-hit ${tracked.label} @ ${hex(normalizedPc)}`);
            }
          }
          tracked.lastStep = stepIndex;
          if (tracked.sampleSteps.length < 8) {
            tracked.sampleSteps.push(stepIndex);
          }
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

  // --- Results: Hit counts ---
  console.log('=== Hit Count Summary ===');
  for (const [pc] of TRACKED_PCS) {
    const t = trackedState.get(pc);
    const flag = pc === USB_PATH && t.count > 0 ? ' *** SHOULD NOT BE HIT ***' : '';
    console.log(
      `${t.label.padEnd(28)} ${hex(pc)}  count=${t.count} `
      + `first=${t.firstStep ?? 'n/a'} last=${t.lastStep ?? 'n/a'}`
      + flag,
    );
  }
  console.log('');

  // --- Results: First unique PCs ---
  console.log('=== First 40 Unique PCs ===');
  for (let i = 0; i < firstUniquePcs.length; i++) {
    const e = firstUniquePcs[i];
    console.log(`[${String(i + 1).padStart(2, '0')}] step=${e.step} pc=${hex(e.pc)} mode=${e.mode}`);
  }
  console.log('');

  // --- Results: Watched memory ---
  console.log('=== Watched Memory ===');
  for (const [addr] of WATCHED_BYTES) {
    const entry = watchedState.get(addr);
    const after = mem[addr] & 0xFF;
    console.log(
      `${entry.label.padEnd(20)} ${hex(addr)}  before=${hex(entry.before, 2)} after=${hex(after, 2)} `
      + `writes=${entry.totalChanges}`,
    );
    for (const c of entry.changes) {
      console.log(`  step=${c.step} pc=${hex(c.pc)} ${hex(c.before, 2)}->${hex(c.after, 2)}`);
    }
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

  // --- Results: Milestones ---
  if (milestoneLog.length > 0) {
    console.log('=== Milestones ===');
    for (const line of milestoneLog) console.log(line);
    console.log('');
  }

  // --- Verdict ---
  const eventHandlerHits = trackedState.get(EVENT_HANDLER)?.count ?? 0;
  const usbPathHits = trackedState.get(USB_PATH)?.count ?? 0;
  const keyProcessorHits = trackedState.get(KEY_PROCESSOR)?.count ?? 0;
  const schedulerHits = trackedState.get(SCHEDULER_ENTRY)?.count ?? 0;

  console.log('=== Verdict ===');
  console.log(`Scheduler entered:       ${schedulerHits > 0 ? 'YES' : 'NO'} (count=${schedulerHits})`);
  console.log(`Event handler 0x001794:  ${eventHandlerHits > 0 ? 'YES <<<' : 'NO'} (count=${eventHandlerHits})`);
  console.log(`USB path 0x001644:       ${usbPathHits > 0 ? 'YES (bad)' : 'NO (good)'} (count=${usbPathHits})`);
  console.log(`Key processor 0x03FA09:  ${keyProcessorHits > 0 ? 'YES <<<' : 'NO'} (count=${keyProcessorHits})`);
  console.log(`Port 0x0F reads:         ${port0fReads}`);
  console.log('');

  if (eventHandlerHits > 0 && usbPathHits === 0) {
    console.log('PASS: Event handler reached, USB path avoided. Port 0x0F override works.');
  } else if (eventHandlerHits > 0) {
    console.log('PARTIAL: Event handler reached but USB path also taken.');
  } else {
    console.log('FAIL: Event handler not reached despite port 0x0F override.');
  }

  process.exitCode = eventHandlerHits > 0 ? 0 : 1;
}

try {
  await main();
} catch (error) {
  console.error('Fatal error:', error.stack || error);
  process.exitCode = 1;
}
