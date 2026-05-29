#!/usr/bin/env node
// Phase 462: full key-processing chain verification with real HALT wake via timer IRQ.

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

const EVENT_LOOP_ENTRY = 0x003A73;
const ISR_ENTRY = 0x000038;
const ISR_GUARD = 0x001713;
const REDUCED_HANDLER = 0x0019BE;
const TIMER_SERVICE = 0x001ACF;
const HALT_ADDR = 0x001942;
const GETCSC_ENTRY = 0x021A5C;
const KEY_PROCESSOR = 0x03FA09;

const KEY_ENABLE_FLAG = 0xD14091;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_AVAILABLE_BYTE = 0xD00085;
const KEY_AVAILABLE_MASK = 0x08;
const KEY_BUFFER_ADDR = 0xD141B5;
const DISPLAY_DIRTY_FLAG = 0xD177B7;
const EVENT_GATE_ADDR = 0xD177BA;

const VRAM_START = 0xD40000;
const VRAM_END = 0xD52C00;

const INJECTED_SCAN_CODE = 0x29;
const TIMER_INTERVAL = 10000;
const RUN_MAX_STEPS = 1000000;
const RUN_MAX_LOOP_ITERATIONS = 5000;

const TRACKED_PCS = [
  [ISR_ENTRY, 'ISR_ENTRY'],
  [ISR_GUARD, 'ISR_GUARD'],
  [REDUCED_HANDLER, 'REDUCED_HANDLER'],
  [TIMER_SERVICE, 'TIMER_SERVICE'],
  [HALT_ADDR, 'EVENT_LOOP_HALT'],
  [EVENT_LOOP_ENTRY, 'EVENT_LOOP_ENTRY'],
  [GETCSC_ENTRY, 'GETCSC_021A5C'],
  [KEY_PROCESSOR, 'KEY_PROCESSOR_03FA09'],
];

const WATCHED_BYTES = [
  [KEY_SCAN_CODE_ADDR, 'D00587 scan code'],
  [KEY_AVAILABLE_BYTE, 'D00085 key available'],
  [KEY_BUFFER_ADDR, 'D141B5 key buffer'],
  [DISPLAY_DIRTY_FLAG, 'D177B7 display dirty'],
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
    entry.changes.push({
      step,
      pc,
      kind,
      before,
      after,
    });
  }
}

function countNonZeroBytes(mem, start, end) {
  let total = 0;
  for (let addr = start; addr < end; addr++) {
    if (mem[addr] !== 0) total++;
  }
  return total;
}

function analyzeVram(mem, beforeSnapshot) {
  let nonZeroBefore = 0;
  for (const value of beforeSnapshot) {
    if (value !== 0) nonZeroBefore++;
  }

  let nonZeroAfter = 0;
  let changedBytes = 0;
  const firstDiffs = [];

  for (let offset = 0; offset < beforeSnapshot.length; offset++) {
    const after = mem[VRAM_START + offset] & 0xFF;
    if (after !== 0) nonZeroAfter++;
    if (after !== beforeSnapshot[offset]) {
      changedBytes++;
      if (firstDiffs.length < 16) {
        firstDiffs.push({
          addr: VRAM_START + offset,
          before: beforeSnapshot[offset],
          after,
        });
      }
    }
  }

  return {
    nonZeroBefore,
    nonZeroAfter,
    changedBytes,
    firstDiffs,
  };
}

async function main() {
  console.log('=== Phase 462: Full Key Processing Chain Verification ===');
  console.log('');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({
    pllDelay: 2,
    timerInterrupt: false,
    timerInterval: TIMER_INTERVAL,
  });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  console.log('--- Step 1: Cold boot (timer disabled) ---');
  const bootState = coldBoot(executor, cpu, mem);
  console.log(`boot:     steps=${bootState.boot.steps} term=${bootState.boot.termination} lastPc=${hex(bootState.boot.lastPc)}`);
  console.log(`kernel:   steps=${bootState.kernel.steps} term=${bootState.kernel.termination} lastPc=${hex(bootState.kernel.lastPc)}`);
  console.log(`postInit: steps=${bootState.postInit.steps} term=${bootState.postInit.termination} lastPc=${hex(bootState.postInit.lastPc)}`);
  console.log(`cpu.pc=${hex(cpu.pc)} cpu.mbase=${hex(cpu.mbase, 2)} cpu.iy=${hex(cpu.iy)} cpu.im=${cpu.im}`);
  console.log('');

  console.log('--- Step 2: Pre-run state ---');
  mem[KEY_ENABLE_FLAG] = 0x01;
  mem[KEY_BUFFER_ADDR] = 0x00;
  mem[KEY_SCAN_CODE_ADDR] = 0x00;
  mem[KEY_AVAILABLE_BYTE] &= ~KEY_AVAILABLE_MASK;

  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  peripherals.setTimerEnabled(true);

  console.log(`timerEnabled=true via peripherals.setTimerEnabled(true)`);
  console.log(`timerInterval=${TIMER_INTERVAL} blocks`);
  console.log(`D14091=${hex(mem[KEY_ENABLE_FLAG], 2)} D177B7=${hex(mem[DISPLAY_DIRTY_FLAG], 2)} D177BA=${hex(mem[EVENT_GATE_ADDR], 2)} D141B5=${hex(mem[KEY_BUFFER_ADDR], 2)}`);
  console.log(`cpu.iff1=${cpu.iff1} cpu.iff2=${cpu.iff2} cpu.im=${cpu.im} cpu.halted=${cpu.halted}`);
  console.log('');

  console.log('--- Step 3: Inject key ---');
  mem[KEY_SCAN_CODE_ADDR] = INJECTED_SCAN_CODE;
  mem[KEY_AVAILABLE_BYTE] = (mem[KEY_AVAILABLE_BYTE] | KEY_AVAILABLE_MASK) & 0xFF;
  console.log(`mem[0xD00587] = ${hex(mem[KEY_SCAN_CODE_ADDR], 2)} (scan code for key '1')`);
  console.log(`mem[0xD00085] |= 0x08 -> ${hex(mem[KEY_AVAILABLE_BYTE], 2)} (bit3=${(mem[KEY_AVAILABLE_BYTE] >> 3) & 1})`);
  console.log('');

  const watchedState = createWatchedState(mem);
  const trackedPcState = createTrackedPcState();
  const vramBefore = mem.slice(VRAM_START, VRAM_END);

  const firstUniquePcs = [];
  const firstUniquePcSet = new Set();
  const interruptEvents = [];
  const milestoneLog = [];
  const missingBlocks = [];

  let currentPc = EVENT_LOOP_ENTRY;
  let currentStep = 0;
  let lastWasHalt = false;
  let haltWakeCount = 0;

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
    recordWatchedChange(
      watchedState,
      (base + 1) & 0xFFFFFF,
      before1,
      mem[(base + 1) & 0xFFFFFF] & 0xFF,
      currentStep,
      currentPc,
      'write16',
    );
  };

  cpu.write24 = (addr, value) => {
    const base = addr & 0xFFFFFF;
    const before0 = mem[base] & 0xFF;
    const before1 = mem[(base + 1) & 0xFFFFFF] & 0xFF;
    const before2 = mem[(base + 2) & 0xFFFFFF] & 0xFF;
    origWrite24(addr, value);
    recordWatchedChange(watchedState, base, before0, mem[base] & 0xFF, currentStep, currentPc, 'write24');
    recordWatchedChange(
      watchedState,
      (base + 1) & 0xFFFFFF,
      before1,
      mem[(base + 1) & 0xFFFFFF] & 0xFF,
      currentStep,
      currentPc,
      'write24',
    );
    recordWatchedChange(
      watchedState,
      (base + 2) & 0xFFFFFF,
      before2,
      mem[(base + 2) & 0xFFFFFF] & 0xFF,
      currentStep,
      currentPc,
      'write24',
    );
  };

  console.log('--- Step 4: Run event loop with real HALT/IRQ wake ---');
  let runResult;
  try {
    runResult = executor.runFrom(EVENT_LOOP_ENTRY, 'adl', {
      maxSteps: RUN_MAX_STEPS,
      maxLoopIterations: RUN_MAX_LOOP_ITERATIONS,
      diHaltBypass: false,

      onBlock(pc, mode, _meta, steps) {
        const normalizedPc = pc & 0xFFFFFF;
        const stepIndex = steps + 1;
        currentPc = normalizedPc;
        currentStep = stepIndex;

        if (firstUniquePcs.length < 20 && !firstUniquePcSet.has(normalizedPc)) {
          firstUniquePcSet.add(normalizedPc);
          firstUniquePcs.push({ step: stepIndex, pc: normalizedPc, mode });
        }

        const tracked = trackedPcState.get(normalizedPc);
        if (tracked) {
          tracked.count++;
          if (tracked.firstStep === null) {
            tracked.firstStep = stepIndex;
            if (milestoneLog.length < 40) {
              milestoneLog.push(`step=${stepIndex} first-hit ${tracked.label} @ ${hex(normalizedPc)}`);
            }
          }
          tracked.lastStep = stepIndex;
          if (tracked.sampleSteps.length < 8) {
            tracked.sampleSteps.push(stepIndex);
          }
        }

        if (normalizedPc === HALT_ADDR) {
          lastWasHalt = true;
        } else if (lastWasHalt) {
          haltWakeCount++;
          lastWasHalt = false;
          if (milestoneLog.length < 40) {
            milestoneLog.push(`step=${stepIndex} resumed-after-halt @ ${hex(normalizedPc)}`);
          }
        }
      },

      onInterrupt(type, returnPc, vector, steps) {
        const stepIndex = steps + 1;
        if (interruptEvents.length < 24) {
          interruptEvents.push({
            step: stepIndex,
            type,
            returnPc: returnPc & 0xFFFFFF,
            vector: vector & 0xFFFFFF,
          });
        }
        if (milestoneLog.length < 40) {
          milestoneLog.push(
            `step=${stepIndex} ${type.toUpperCase()} return=${hex(returnPc)} vector=${hex(vector)}`,
          );
        }
      },

      onMissingBlock(pc, mode, steps) {
        if (missingBlocks.length < 20) {
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
      lastPc: cpu.pc ?? EVENT_LOOP_ENTRY,
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

  const finalScanCode = mem[KEY_SCAN_CODE_ADDR] & 0xFF;
  const finalKeyAvail = mem[KEY_AVAILABLE_BYTE] & 0xFF;
  const finalKeyBuffer = mem[KEY_BUFFER_ADDR] & 0xFF;
  const finalDisplayDirty = mem[DISPLAY_DIRTY_FLAG] & 0xFF;
  const finalEventGate = mem[EVENT_GATE_ADDR] & 0xFF;
  const finalKeyEnable = mem[KEY_ENABLE_FLAG] & 0xFF;

  const vramAnalysis = analyzeVram(mem, vramBefore);

  console.log('=== Hit Count Summary ===');
  for (const [pc] of TRACKED_PCS) {
    const tracked = trackedPcState.get(pc);
    console.log(
      `${tracked.label.padEnd(22)} ${hex(pc)}  count=${tracked.count} `
      + `first=${formatStep(tracked.firstStep)} last=${formatStep(tracked.lastStep)} `
      + `samples=${tracked.sampleSteps.length ? tracked.sampleSteps.join(',') : 'none'}`,
    );
  }
  console.log(`HALT -> wake cycles        ${haltWakeCount}`);
  console.log(`interrupt events captured  ${interruptEvents.length}`);
  console.log(`missing blocks captured    ${missingBlocks.length}`);
  console.log('');

  console.log('=== First 20 Unique PCs ===');
  if (firstUniquePcs.length === 0) {
    console.log('none');
  } else {
    for (const entry of firstUniquePcs) {
      console.log(`[${String(firstUniquePcs.indexOf(entry) + 1).padStart(2, '0')}] step=${entry.step} pc=${hex(entry.pc)} mode=${entry.mode}`);
    }
  }
  console.log('');

  console.log('=== Interrupt Trace ===');
  if (interruptEvents.length === 0) {
    console.log('none');
  } else {
    for (const event of interruptEvents) {
      console.log(
        `step=${event.step} type=${event.type} return=${hex(event.returnPc)} vector=${hex(event.vector)}`,
      );
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

  console.log('=== Requested End State ===');
  console.log(`mem[0xD141B5] = ${hex(finalKeyBuffer, 2)} ${finalKeyBuffer !== 0 ? '(nonzero key code observed)' : '(still zero)'}`);
  console.log(`mem[0xD00587] = ${hex(finalScanCode, 2)} ${finalScanCode === 0 ? '(consumed/cleared)' : '(still pending)'}`);
  console.log(`mem[0xD00085] = ${hex(finalKeyAvail, 2)} (bit3=${(finalKeyAvail >> 3) & 1})`);
  console.log(`mem[0xD177B7] = ${hex(finalDisplayDirty, 2)}`);
  console.log(`mem[0xD177BA] = ${hex(finalEventGate, 2)}`);
  console.log(`mem[0xD14091] = ${hex(finalKeyEnable, 2)}`);
  console.log('');

  console.log('=== VRAM Region 0xD40000-0xD52C00 ===');
  console.log(`nonzero before: ${vramAnalysis.nonZeroBefore}`);
  console.log(`nonzero after:  ${vramAnalysis.nonZeroAfter}`);
  console.log(`changed bytes:  ${vramAnalysis.changedBytes}`);
  if (vramAnalysis.firstDiffs.length === 0) {
    console.log('first diffs: none');
  } else {
    for (const diff of vramAnalysis.firstDiffs) {
      console.log(`diff ${hex(diff.addr)} ${hex(diff.before, 2)} -> ${hex(diff.after, 2)}`);
    }
  }
  console.log('');

  const keyProcessorHits = trackedPcState.get(KEY_PROCESSOR)?.count ?? 0;
  const getCscHits = trackedPcState.get(GETCSC_ENTRY)?.count ?? 0;
  const keyBufferChanged = watchedState.get(KEY_BUFFER_ADDR)?.before !== finalKeyBuffer;
  const scanCodeConsumed = watchedState.get(KEY_SCAN_CODE_ADDR)?.before !== 0 && finalScanCode === 0;
  const vramChanged = vramAnalysis.changedBytes > 0;

  console.log('=== Verdict ===');
  console.log(`HALT observed:                 ${yesNo((trackedPcState.get(HALT_ADDR)?.count ?? 0) > 0)}`);
  console.log(`IRQ vector reached:            ${yesNo((trackedPcState.get(ISR_ENTRY)?.count ?? 0) > 0)}`);
  console.log(`ISR guard reached:             ${yesNo((trackedPcState.get(ISR_GUARD)?.count ?? 0) > 0)}`);
  console.log(`Reduced handler reached:       ${yesNo((trackedPcState.get(REDUCED_HANDLER)?.count ?? 0) > 0)}`);
  console.log(`Timer service reached:         ${yesNo((trackedPcState.get(TIMER_SERVICE)?.count ?? 0) > 0)}`);
  console.log(`Resume after HALT observed:    ${yesNo(haltWakeCount > 0)}`);
  console.log(`_GetCSC 0x021A5C reached:      ${yesNo(getCscHits > 0)}`);
  console.log(`Key processor 0x03FA09 hit:    ${yesNo(keyProcessorHits > 0)}`);
  console.log(`D141B5 changed from 0x00:      ${yesNo(keyBufferChanged)}`);
  console.log(`D00587 consumed to 0x00:       ${yesNo(scanCodeConsumed)}`);
  console.log(`VRAM region changed:           ${yesNo(vramChanged)}`);
  console.log('');

  console.log('=== Milestones ===');
  if (milestoneLog.length === 0) {
    console.log('none');
  } else {
    for (const line of milestoneLog) {
      console.log(line);
    }
  }

  process.exitCode = keyProcessorHits > 0 ? 0 : 1;
}

try {
  await main();
} catch (error) {
  console.error('Fatal error:', error.stack || error);
  process.exitCode = 1;
}
