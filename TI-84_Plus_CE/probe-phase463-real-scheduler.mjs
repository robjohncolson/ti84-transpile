#!/usr/bin/env node
// Phase 463: Real scheduler loop at 0x0015F7 (NOT error handler 0x003A73).
// Session 463 discovered 0x003A73 is the ERROR HANDLER (ROM has "ERROR!" at 0x003A92).
// The real OS scheduler is at 0x0015F7, which calls 0x001652 (scheduler body),
// reads port 0x0F for USB, and runs housekeeping (0x001296, 0x0017CE, 0x01275B).

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

// Real scheduler entry (NOT the error handler)
const SCHEDULER_ENTRY = 0x0015F7;

const SCHEDULER_BODY = 0x001652;
const KBD_CTRL_INIT = 0x003CC2;
const ISR_GUARD = 0x001713;
const SLEEP_WRAPPER = 0x001933;
const KEY_PROCESSOR = 0x03FA09;
const GETK = 0x03FC1C;
const KEY_WAIT_CALLER = 0x03005C;
const DISPLAY_REFRESH = 0x049087;
const OS_RESET = 0x001853;
const ERROR_HANDLER = 0x003A73;

const KEY_ENABLE_FLAG = 0xD14091;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_AVAILABLE_BYTE = 0xD00080;
const KEY_AVAILABLE_MASK = 0x08;
const KEY_BUFFER_ADDR = 0xD141B5;
const DISPLAY_DIRTY_FLAG = 0xD177B7;
const EVENT_GATE_ADDR = 0xD177BA;

const INJECTED_SCAN_CODE = 0x29;
const RUN_MAX_STEPS = 500000;
const RUN_MAX_LOOP_ITERATIONS = 10000;

const TRACKED_PCS = [
  [SCHEDULER_ENTRY, 'SCHEDULER_LOOP_TOP'],
  [SCHEDULER_BODY, 'SCHEDULER_BODY'],
  [KBD_CTRL_INIT, 'KBD_CTRL_INIT'],
  [ISR_GUARD, 'ISR_GUARD'],
  [SLEEP_WRAPPER, 'SLEEP_WRAPPER'],
  [KEY_PROCESSOR, 'KEY_PROCESSOR'],
  [GETK, 'GETK'],
  [KEY_WAIT_CALLER, 'KEY_WAIT_CALLER'],
  [DISPLAY_REFRESH, 'DISPLAY_REFRESH'],
  [OS_RESET, 'OS_RESET_DANGER'],
  [ERROR_HANDLER, 'ERROR_HANDLER_DANGER'],
];

const WATCHED_BYTES = [
  [KEY_SCAN_CODE_ADDR, 'D00587 scan code'],
  [KEY_AVAILABLE_BYTE, 'D00080 key avail'],
  [KEY_BUFFER_ADDR, 'D141B5 key buffer'],
  [DISPLAY_DIRTY_FLAG, 'D177B7 disp dirty'],
  [EVENT_GATE_ADDR, 'D177BA event gate'],
  [KEY_ENABLE_FLAG, 'D14091 key enable'],
];

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function formatStep(step) {
  return step === null || step === undefined ? 'n/a' : String(step);
}

function yesNo(value) {
  return value ? 'YES' : 'NO';
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

  return {
    boot: bootResult,
    kernel: kernelResult,
    postInit: postInitResult,
  };
}

function createTrackedPcState() {
  const state = new Map();
  for (const [pc, label] of TRACKED_PCS) {
    state.set(pc, {
      label,
      count: 0,
      firstStep: null,
      lastStep: null,
      sampleSteps: [],
    });
  }
  return state;
}

function createWatchedState(mem) {
  const state = new Map();
  for (const [addr, label] of WATCHED_BYTES) {
    state.set(addr, {
      label,
      before: mem[addr] & 0xFF,
      totalChanges: 0,
      changes: [],
    });
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
  console.log('=== Phase 463: Real Scheduler Loop at 0x0015F7 ===');
  console.log('(Session 463: 0x003A73 is ERROR HANDLER, not event loop)');
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
  console.log('--- Step 1: Cold boot (timer disabled) ---');
  const bootState = coldBoot(executor, cpu, mem);
  console.log(`boot:     steps=${bootState.boot.steps} term=${bootState.boot.termination} lastPc=${hex(bootState.boot.lastPc)}`);
  console.log(`kernel:   steps=${bootState.kernel.steps} term=${bootState.kernel.termination} lastPc=${hex(bootState.kernel.lastPc)}`);
  console.log(`postInit: steps=${bootState.postInit.steps} term=${bootState.postInit.termination} lastPc=${hex(bootState.postInit.lastPc)}`);
  console.log(`cpu.pc=${hex(cpu.pc)} cpu.mbase=${hex(cpu.mbase, 2)} cpu.iy=${hex(cpu.iy)} cpu.im=${cpu.im}`);
  console.log('');

  // --- Stage 2: Pre-run setup ---
  console.log('--- Step 2: Pre-run state setup ---');
  mem[KEY_ENABLE_FLAG] = 0x01;
  mem[DISPLAY_DIRTY_FLAG] = 0x55;
  mem[KEY_SCAN_CODE_ADDR] = 0x00;
  mem[KEY_AVAILABLE_BYTE] &= ~KEY_AVAILABLE_MASK;
  mem[KEY_BUFFER_ADDR] = 0x00;

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;

  console.log(`D14091 key enable = ${hex(mem[KEY_ENABLE_FLAG], 2)}`);
  console.log(`D177B7 disp dirty = ${hex(mem[DISPLAY_DIRTY_FLAG], 2)}`);
  console.log(`D00587 scan code  = ${hex(mem[KEY_SCAN_CODE_ADDR], 2)}`);
  console.log(`D00080 key avail  = ${hex(mem[KEY_AVAILABLE_BYTE], 2)} (bit3=${(mem[KEY_AVAILABLE_BYTE] >> 3) & 1})`);
  console.log(`cpu.iff1=${cpu.iff1} cpu.iff2=${cpu.iff2} cpu.im=${cpu.im} cpu.halted=${cpu.halted}`);
  console.log('');

  // --- Stage 3: Inject key ---
  console.log('--- Step 3: Inject key ---');
  mem[KEY_SCAN_CODE_ADDR] = INJECTED_SCAN_CODE;
  mem[KEY_AVAILABLE_BYTE] = (mem[KEY_AVAILABLE_BYTE] | KEY_AVAILABLE_MASK) & 0xFF;
  console.log(`mem[0xD00587] = ${hex(mem[KEY_SCAN_CODE_ADDR], 2)} (scan code for key '1')`);
  console.log(`mem[0xD00080] |= 0x08 -> ${hex(mem[KEY_AVAILABLE_BYTE], 2)} (bit3=${(mem[KEY_AVAILABLE_BYTE] >> 3) & 1})`);
  console.log('');

  // --- Tracking state ---
  const watchedState = createWatchedState(mem);
  const trackedPcState = createTrackedPcState();

  const firstUniquePcs = [];
  const firstUniquePcSet = new Set();
  const milestoneLog = [];
  const missingBlocks = [];

  let currentPc = SCHEDULER_ENTRY;
  let currentStep = 0;

  // Hook writes for watched memory
  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  cpu.write8 = (addr, value) => {
    const normalizedAddr = addr & 0xFFFFFF;
    const before = mem[normalizedAddr] & 0xFF;
    origWrite8(addr, value);
    const after = mem[normalizedAddr] & 0xFF;
    recordWatchedChange(watchedState, normalizedAddr, before, after, currentStep, currentPc, 'write8');
  };

  cpu.write16 = (addr, value) => {
    const base = addr & 0xFFFFFF;
    const before0 = mem[base] & 0xFF;
    const before1 = mem[(base + 1) & 0xFFFFFF] & 0xFF;
    origWrite16(addr, value);
    recordWatchedChange(watchedState, base, before0, mem[base] & 0xFF, currentStep, currentPc, 'write16');
    recordWatchedChange(watchedState, (base + 1) & 0xFFFFFF, before1, mem[(base + 1) & 0xFFFFFF] & 0xFF, currentStep, currentPc, 'write16');
  };

  cpu.write24 = (addr, value) => {
    const base = addr & 0xFFFFFF;
    const before0 = mem[base] & 0xFF;
    const before1 = mem[(base + 1) & 0xFFFFFF] & 0xFF;
    const before2 = mem[(base + 2) & 0xFFFFFF] & 0xFF;
    origWrite24(addr, value);
    recordWatchedChange(watchedState, base, before0, mem[base] & 0xFF, currentStep, currentPc, 'write24');
    recordWatchedChange(watchedState, (base + 1) & 0xFFFFFF, before1, mem[(base + 1) & 0xFFFFFF] & 0xFF, currentStep, currentPc, 'write24');
    recordWatchedChange(watchedState, (base + 2) & 0xFFFFFF, before2, mem[(base + 2) & 0xFFFFFF] & 0xFF, currentStep, currentPc, 'write24');
  };

  // --- Stage 4: Run from REAL scheduler at 0x0015F7 ---
  console.log('--- Step 4: Run scheduler at 0x0015F7 (NOT error handler 0x003A73) ---');
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

        // Capture first 30 unique PCs
        if (firstUniquePcs.length < 30 && !firstUniquePcSet.has(normalizedPc)) {
          firstUniquePcSet.add(normalizedPc);
          firstUniquePcs.push({ step: stepIndex, pc: normalizedPc, mode });
        }

        const tracked = trackedPcState.get(normalizedPc);
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
          missingBlocks.push({
            step: steps + 1,
            pc: pc & 0xFFFFFF,
            mode,
          });
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

  console.log(`run: steps=${runResult.steps} term=${runResult.termination} lastPc=${hex(runResult.lastPc)} lastMode=${runResult.lastMode ?? 'n/a'}`);
  if (runResult.error) {
    console.log(`run error: ${runResult.error}`);
  }
  console.log('');

  // --- Results ---
  const finalScanCode = mem[KEY_SCAN_CODE_ADDR] & 0xFF;
  const finalKeyAvail = mem[KEY_AVAILABLE_BYTE] & 0xFF;
  const finalKeyBuffer = mem[KEY_BUFFER_ADDR] & 0xFF;
  const finalDisplayDirty = mem[DISPLAY_DIRTY_FLAG] & 0xFF;
  const finalEventGate = mem[EVENT_GATE_ADDR] & 0xFF;
  const finalKeyEnable = mem[KEY_ENABLE_FLAG] & 0xFF;

  console.log('=== Hit Count Summary ===');
  for (const [pc] of TRACKED_PCS) {
    const tracked = trackedPcState.get(pc);
    const danger = (pc === OS_RESET || pc === ERROR_HANDLER) && tracked.count > 0 ? ' *** DANGER ***' : '';
    console.log(
      `${tracked.label.padEnd(24)} ${hex(pc)}  count=${tracked.count} `
      + `first=${formatStep(tracked.firstStep)} last=${formatStep(tracked.lastStep)} `
      + `samples=${tracked.sampleSteps.length ? tracked.sampleSteps.join(',') : 'none'}`
      + danger,
    );
  }
  console.log('');

  console.log('=== First 30 Unique PCs ===');
  if (firstUniquePcs.length === 0) {
    console.log('none');
  } else {
    for (let i = 0; i < firstUniquePcs.length; i++) {
      const entry = firstUniquePcs[i];
      console.log(`[${String(i + 1).padStart(2, '0')}] step=${entry.step} pc=${hex(entry.pc)} mode=${entry.mode}`);
    }
  }
  console.log('');

  console.log('=== Watched Memory State ===');
  for (const [addr] of WATCHED_BYTES) {
    const entry = watchedState.get(addr);
    const after = mem[addr] & 0xFF;
    console.log(
      `${entry.label.padEnd(20)} ${hex(addr)}  before=${hex(entry.before, 2)} after=${hex(after, 2)} `
      + `changed=${yesNo(entry.before !== after)} totalWrites=${entry.totalChanges}`,
    );
    if (entry.changes.length === 0) {
      console.log('  writes: none observed');
    } else {
      for (const change of entry.changes) {
        console.log(
          `  step=${change.step} pc=${hex(change.pc)} kind=${change.kind} ${hex(change.before, 2)} -> ${hex(change.after, 2)}`,
        );
      }
    }
  }
  console.log('');

  console.log('=== Final State ===');
  console.log(`mem[0xD00587] = ${hex(finalScanCode, 2)} ${finalScanCode === 0 ? '(consumed/cleared)' : '(still pending)'}`);
  console.log(`mem[0xD00080] = ${hex(finalKeyAvail, 2)} (bit3=${(finalKeyAvail >> 3) & 1})`);
  console.log(`mem[0xD141B5] = ${hex(finalKeyBuffer, 2)} ${finalKeyBuffer !== 0 ? '(key code observed)' : '(still zero)'}`);
  console.log(`mem[0xD177B7] = ${hex(finalDisplayDirty, 2)}`);
  console.log(`mem[0xD177BA] = ${hex(finalEventGate, 2)}`);
  console.log(`mem[0xD14091] = ${hex(finalKeyEnable, 2)}`);
  console.log('');

  if (missingBlocks.length > 0) {
    console.log('=== Missing Blocks ===');
    for (const mb of missingBlocks) {
      console.log(`step=${mb.step} pc=${hex(mb.pc)} mode=${mb.mode}`);
    }
    console.log('');
  }

  console.log('=== Milestones ===');
  if (milestoneLog.length === 0) {
    console.log('none');
  } else {
    for (const line of milestoneLog) {
      console.log(line);
    }
  }
  console.log('');

  // --- Verdict ---
  const keyProcessorHits = trackedPcState.get(KEY_PROCESSOR)?.count ?? 0;
  const schedulerHits = trackedPcState.get(SCHEDULER_ENTRY)?.count ?? 0;
  const schedulerBodyHits = trackedPcState.get(SCHEDULER_BODY)?.count ?? 0;
  const osResetHits = trackedPcState.get(OS_RESET)?.count ?? 0;
  const errorHandlerHits = trackedPcState.get(ERROR_HANDLER)?.count ?? 0;

  console.log('=== Verdict ===');
  console.log(`Scheduler 0x0015F7 reached:    ${yesNo(schedulerHits > 0)} (count=${schedulerHits})`);
  console.log(`Scheduler body 0x001652:       ${yesNo(schedulerBodyHits > 0)} (count=${schedulerBodyHits})`);
  console.log(`Key processor 0x03FA09 hit:    ${yesNo(keyProcessorHits > 0)} (count=${keyProcessorHits})`);
  console.log(`OS RESET 0x001853 hit:         ${yesNo(osResetHits > 0)} ${osResetHits > 0 ? '*** BAD ***' : '(good - not hit)'}`);
  console.log(`ERROR HANDLER 0x003A73 hit:    ${yesNo(errorHandlerHits > 0)} ${errorHandlerHits > 0 ? '*** BAD ***' : '(good - not hit)'}`);
  console.log('');

  const keyProcessorPass = keyProcessorHits > 0;
  const noErrorHandler = errorHandlerHits === 0;
  const noOsReset = osResetHits === 0;

  if (keyProcessorPass && noErrorHandler && noOsReset) {
    console.log('PASS: Key processor reached via real scheduler, no error handler or OS reset.');
  } else if (!keyProcessorPass && noErrorHandler && noOsReset) {
    console.log('PARTIAL: Scheduler ran without errors but key processor not reached.');
  } else {
    console.log('FAIL: Hit error handler or OS reset path.');
  }

  process.exitCode = keyProcessorPass ? 0 : 1;
}

try {
  await main();
} catch (error) {
  console.error('Fatal error:', error.stack || error);
  process.exitCode = 1;
}
