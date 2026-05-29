#!/usr/bin/env node
// Phase 453 workflow probe: single-key 700k post-consume budget.
//
// This is a phase 451-derived end-to-end probe that focuses on the
// post-consume _GetCSC polling loop. It injects only one key ("1"), then
// keeps advancing long enough to observe whether the no-key delay loop exits,
// whether execution re-enters the event loop, and whether the scheduler
// reaches the DI+HALT barrier afterwards.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const VRAM_BASE = 0xD40000;
const VRAM_BYTE_SIZE = 320 * 240 * 2;
const STACK_RESET_TOP = 0xD1A87E;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE_ENTRIES = [0x0A2B72, 0x0A3301, 0x0A29EC, 0x0A2854];
const EVENT_LOOP_ENTRY = 0x003A73;
const SYSTEM_CHECK_ENTRY = 0x001713;
const CHK_OS_INTERRUPT_ENTRY = 0x0008BB;
const GETCSC_ENTRY = 0x003D5A;
const POLLING_LOOP_PC = 0x003D6B;
const HALT_RANGE_START = 0x001933;
const HALT_RANGE_END = 0x001942;

const KEY_AVAILABLE_FLAG_ADDR = 0xD00080;
const KEY_AVAILABLE_FLAG_MASK = 0x08;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_BUFFER_ADDR = 0xD141B5;
const KEY_GATE_ADDR = 0xD177BA;

const KEY_ONE = { label: '1', scan: 0x12 };

const CONSUME_BURST_STEPS = 500;
const POST_CONSUME_STEPS = 700000;
const PROCESS_CHUNK_STEPS = 2000;
const MAX_LOOPS = 5000;
const EVENT_LOOP_NEAR_DELTA = 0x40;

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function formatStep(step) {
  return step === null || step === undefined ? 'n/a' : String(step);
}

function formatSignedDelta(value) {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}0x${Math.abs(value).toString(16)}`;
}

function vramHash(mem) {
  return createHash('sha256')
    .update(mem.subarray(VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE))
    .digest('hex')
    .slice(0, 12);
}

function vramDiff(mem, beforeSnapshot, maxDiffs = 20) {
  const diffs = [];
  for (let i = 0; i < VRAM_BYTE_SIZE && diffs.length < maxDiffs; i++) {
    const addr = VRAM_BASE + i;
    if (mem[addr] !== beforeSnapshot[i]) {
      diffs.push({ offset: i, addr, before: beforeSnapshot[i], after: mem[addr] });
    }
  }

  let totalChanged = 0;
  for (let i = 0; i < VRAM_BYTE_SIZE; i++) {
    if (mem[VRAM_BASE + i] !== beforeSnapshot[i]) totalChanged++;
  }

  return { diffs, totalChanged };
}

function isScanCodePending(mem) {
  return (mem[KEY_AVAILABLE_FLAG_ADDR] & KEY_AVAILABLE_FLAG_MASK) !== 0;
}

function isHaltPc(pc) {
  return pc >= HALT_RANGE_START && pc <= HALT_RANGE_END;
}

function computeSpan(startStep, endStep) {
  if (startStep === null || endStep === null) return null;
  if (endStep < startStep) return null;
  return endStep - startStep;
}

function describeEventLoopRelation(pc) {
  const normalizedPc = (pc ?? 0) & 0xFFFFFF;
  const delta = normalizedPc - EVENT_LOOP_ENTRY;
  if (normalizedPc === EVENT_LOOP_ENTRY) {
    return 'exact EVENT_LOOP_ENTRY';
  }
  if (isHaltPc(normalizedPc)) {
    return 'inside HALT barrier';
  }
  if (Math.abs(delta) <= EVENT_LOOP_NEAR_DELTA) {
    return `near EVENT_LOOP_ENTRY (delta=${formatSignedDelta(delta)})`;
  }
  return `elsewhere (delta=${formatSignedDelta(delta)})`;
}

function createBreadcrumb(label) {
  return {
    label,
    visits: 0,
    firstStep: null,
    lastStep: null,
    lastPc: null,
    lastMode: null,
  };
}

function markBreadcrumb(breadcrumb, step, pc, mode) {
  breadcrumb.visits++;
  if (breadcrumb.firstStep === null) {
    breadcrumb.firstStep = step;
  }
  breadcrumb.lastStep = step;
  breadcrumb.lastPc = pc;
  breadcrumb.lastMode = mode;
}

function printBreadcrumb(label, breadcrumb) {
  console.log(
    `      ${label}: visits=${breadcrumb.visits} firstStep=${formatStep(breadcrumb.firstStep)} `
    + `lastStep=${formatStep(breadcrumb.lastStep)} lastPc=${hex(breadcrumb.lastPc)} `
    + `lastMode=${breadcrumb.lastMode ?? 'n/a'}`,
  );
}

function bootToHomeScreen(executor, cpu, mem) {
  const bootResult = executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  console.log(`  boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelResult = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  console.log(`  kernel: steps=${kernelResult.steps} term=${kernelResult.termination} lastPc=${hex(kernelResult.lastPc)}`);
  cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInitResult = executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  console.log(`  postInit: steps=${postInitResult.steps} term=${postInitResult.termination} lastPc=${hex(postInitResult.lastPc)}`);

  let lastResult = postInitResult;
  for (let i = 0; i < STAGE_ENTRIES.length; i++) {
    const entry = STAGE_ENTRIES[i];
    cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
    cpu._iy = 0xD00080; cpu.f = 0x40; cpu._ix = 0xD1A860;
    cpu.sp = STACK_RESET_TOP - 12;
    mem.fill(0xFF, cpu.sp, cpu.sp + 12);
    lastResult = executor.runFrom(entry, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });
    console.log(`  stage${i + 1}: entry=${hex(entry)} steps=${lastResult.steps} term=${lastResult.termination} lastPc=${hex(lastResult.lastPc)}`);
  }

  const FLASH_ROUTINE_ROM_SRC = 0x000EBB;
  const FLASH_ROUTINE_RAM_DST = 0xD18C22;
  const FLASH_ROUTINE_LEN = 0x5A;
  mem.set(
    romBytes.subarray(FLASH_ROUTINE_ROM_SRC, FLASH_ROUTINE_ROM_SRC + FLASH_ROUTINE_LEN),
    FLASH_ROUTINE_RAM_DST,
  );
  console.log(`  pre-copied ${FLASH_ROUTINE_LEN} bytes from ROM ${hex(FLASH_ROUTINE_ROM_SRC)} to RAM ${hex(FLASH_ROUTINE_RAM_DST)}`);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu._iy = 0xD00080;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);

  return { lastPc: EVENT_LOOP_ENTRY, lastMode: 'adl' };
}

function injectScanCode(mem, key) {
  mem[KEY_SCAN_CODE_ADDR] = 0x00;
  mem[KEY_AVAILABLE_FLAG_ADDR] &= ~KEY_AVAILABLE_FLAG_MASK;
  mem[KEY_BUFFER_ADDR] = 0x00;

  mem[KEY_SCAN_CODE_ADDR] = key.scan;
  mem[KEY_AVAILABLE_FLAG_ADDR] |= KEY_AVAILABLE_FLAG_MASK;
}

function createTraceState() {
  return {
    reached001713: false,
    reached0008BB: false,
    haltReached: false,
    step001713: null,
    step0008BB: null,
    haltPc: null,
    haltStep: null,
    haltMode: null,
    scanConsumedObservedStep: null,
    firstGetCscAfterKeyProcessingStep: null,
    firstPollingLoopStep: null,
    firstEventLoopAfterPollingStep: null,
    breadcrumbs: {
      getCscEntry: createBreadcrumb('0x003D5A'),
      pollingLoop: createBreadcrumb('0x003D6B'),
      eventLoop: createBreadcrumb('0x003A73'),
      haltRange: createBreadcrumb('0x001933-0x001942'),
    },
  };
}

function updateTraceState(trace, mem, normalizedPc, mode, absoluteStep) {
  if (trace.scanConsumedObservedStep === null && !isScanCodePending(mem) && mem[KEY_SCAN_CODE_ADDR] === 0x00) {
    trace.scanConsumedObservedStep = absoluteStep;
  }

  if (normalizedPc === SYSTEM_CHECK_ENTRY && trace.step001713 === null) {
    trace.reached001713 = true;
    trace.step001713 = absoluteStep;
  }

  if (normalizedPc === CHK_OS_INTERRUPT_ENTRY && trace.step0008BB === null) {
    trace.reached0008BB = true;
    trace.step0008BB = absoluteStep;
  }

  if (normalizedPc === GETCSC_ENTRY) {
    markBreadcrumb(trace.breadcrumbs.getCscEntry, absoluteStep, normalizedPc, mode);
    if (
      trace.step0008BB !== null
      && absoluteStep > trace.step0008BB
      && trace.firstGetCscAfterKeyProcessingStep === null
    ) {
      trace.firstGetCscAfterKeyProcessingStep = absoluteStep;
    }
  }

  if (normalizedPc === POLLING_LOOP_PC) {
    markBreadcrumb(trace.breadcrumbs.pollingLoop, absoluteStep, normalizedPc, mode);
    if (trace.firstPollingLoopStep === null) {
      trace.firstPollingLoopStep = absoluteStep;
    }
  }

  if (normalizedPc === EVENT_LOOP_ENTRY) {
    markBreadcrumb(trace.breadcrumbs.eventLoop, absoluteStep, normalizedPc, mode);
    if (
      trace.firstPollingLoopStep !== null
      && absoluteStep > trace.firstPollingLoopStep
      && trace.firstEventLoopAfterPollingStep === null
    ) {
      trace.firstEventLoopAfterPollingStep = absoluteStep;
    }
  }

  if (isHaltPc(normalizedPc)) {
    markBreadcrumb(trace.breadcrumbs.haltRange, absoluteStep, normalizedPc, mode);
    if (!trace.haltReached) {
      trace.haltReached = true;
      trace.haltPc = normalizedPc;
      trace.haltStep = absoluteStep;
      trace.haltMode = mode;
    }
  }
}

function runTracked(executor, mem, startPc, startMode, maxSteps, stepOffset, trace) {
  try {
    return executor.runFrom(startPc, startMode, {
      maxSteps,
      maxLoopIterations: MAX_LOOPS,
      diHaltBypass: true,
      onBlock: (pc, mode, _meta, steps) => {
        const normalizedPc = pc & 0xFFFFFF;
        const absoluteStep = stepOffset + steps;
        updateTraceState(trace, mem, normalizedPc, mode ?? startMode, absoluteStep);
      },
    });
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : String(err),
      steps: 0,
      termination: 'throw',
      lastPc: startPc,
      lastMode: startMode,
    };
  }
}

function buildTimingBreakdown(trace, burstSteps, totalSteps) {
  const firstPollingLoopStep = trace.firstPollingLoopStep;
  const lastPollingLoopStep = trace.breadcrumbs.pollingLoop.lastStep;
  const firstEventLoopAfterPollingStep = trace.firstEventLoopAfterPollingStep;
  const keyProcessingEndStep = trace.firstGetCscAfterKeyProcessingStep ?? firstPollingLoopStep;
  const pollingLoopExitProxyStep = firstEventLoopAfterPollingStep ?? trace.haltStep;

  return {
    burstConsumeWindowSteps: burstSteps,
    scanConsumedObservedStep: trace.scanConsumedObservedStep,
    keyProcessingStartStep: trace.step001713,
    chkOsInterruptStep: trace.step0008BB,
    firstGetCscAfterKeyProcessingStep: trace.firstGetCscAfterKeyProcessingStep,
    keyProcessingSteps: computeSpan(trace.step001713, keyProcessingEndStep),
    firstPollingLoopStep,
    lastPollingLoopStep,
    pollingLoopExitProxy: firstEventLoopAfterPollingStep !== null
      ? 'event-loop re-entry'
      : (trace.haltStep !== null ? 'halt reached before explicit event-loop breadcrumb' : 'budget exhausted'),
    pollingLoopExitProxyStep,
    pollingLoopSteps: firstPollingLoopStep !== null
      ? (pollingLoopExitProxyStep !== null
        ? pollingLoopExitProxyStep - firstPollingLoopStep
        : totalSteps - firstPollingLoopStep)
      : null,
    firstEventLoopAfterPollingStep,
    haltStep: trace.haltStep,
    afterPollingLoopExitSteps: firstEventLoopAfterPollingStep !== null
      ? totalSteps - firstEventLoopAfterPollingStep
      : null,
  };
}

function processInjectedKey(executor, mem, key, startPc, startMode) {
  const trace = createTraceState();
  const beforeHash = vramHash(mem);
  const vramBefore = mem.slice(VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);
  let totalSteps = 0;
  let postProcessSteps = 0;
  let currentPc = startPc;
  let currentMode = startMode;

  injectScanCode(mem, key);

  const burstResult = runTracked(
    executor,
    mem,
    currentPc,
    currentMode,
    CONSUME_BURST_STEPS,
    totalSteps,
    trace,
  );
  totalSteps += burstResult.steps ?? 0;
  currentPc = burstResult.lastPc ?? currentPc;
  currentMode = burstResult.lastMode ?? currentMode;

  const bit3Cleared = !isScanCodePending(mem);
  const scanAfterBurst = mem[KEY_SCAN_CODE_ADDR];
  const consumed = bit3Cleared && scanAfterBurst === 0x00;

  let lastResult = burstResult;
  let remainingProcessSteps = POST_CONSUME_STEPS;

  while (consumed && !trace.haltReached && remainingProcessSteps > 0) {
    const chunkSteps = Math.min(PROCESS_CHUNK_STEPS, remainingProcessSteps);
    const chunkResult = runTracked(
      executor,
      mem,
      currentPc,
      currentMode,
      chunkSteps,
      totalSteps,
      trace,
    );

    lastResult = chunkResult;
    totalSteps += chunkResult.steps ?? 0;
    postProcessSteps += chunkResult.steps ?? 0;
    currentPc = chunkResult.lastPc ?? currentPc;
    currentMode = chunkResult.lastMode ?? currentMode;
    remainingProcessSteps -= chunkSteps;

    if (trace.haltReached || chunkResult.error || (chunkResult.steps ?? 0) === 0 || chunkResult.termination !== 'max_steps') {
      break;
    }
  }

  const afterHash = vramHash(mem);
  const diff = vramDiff(mem, vramBefore);
  const error = burstResult.error ?? lastResult.error ?? null;
  const timing = buildTimingBreakdown(trace, burstResult.steps ?? 0, totalSteps);

  return {
    key: key.label,
    scan: key.scan,
    consumed,
    bit3Cleared,
    scanAfterBurst,
    burstSteps: burstResult.steps ?? 0,
    burstTermination: burstResult.termination,
    burstLastPc: burstResult.lastPc,
    postProcessSteps,
    finalSteps: totalSteps,
    finalTermination: lastResult.termination,
    naturalTermination: !error && lastResult.termination !== 'max_steps',
    finalPc: currentPc,
    finalMode: currentMode,
    finalPcRelation: describeEventLoopRelation(currentPc),
    reached001713: trace.reached001713,
    step001713: trace.step001713,
    reached0008BB: trace.reached0008BB,
    step0008BB: trace.step0008BB,
    haltReached: trace.haltReached,
    haltPc: trace.haltPc,
    haltStep: trace.haltStep,
    haltMode: trace.haltMode,
    firstEventLoopAfterPollingStep: trace.firstEventLoopAfterPollingStep,
    d141b5: mem[KEY_BUFFER_ADDR],
    d177ba: mem[KEY_GATE_ADDR],
    vramBefore: beforeHash,
    vramAfter: afterHash,
    vramChanged: beforeHash !== afterHash,
    vramDiffTotal: diff.totalChanged,
    vramDiffs: diff.diffs,
    timing,
    breadcrumbs: trace.breadcrumbs,
    error,
  };
}

function main() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, {
    peripherals,
    onWake: (haltPc, newPc, newMode) => {
      console.log(`    HALT-wake: haltPc=${hex(haltPc)} -> newPc=${hex(newPc)} mode=${newMode}`);
    },
  });
  const cpu = executor.cpu;

  console.log('--- phase 453 workflow probe: 700k single-key polling-loop budget ---');
  console.log('phase 1: boot to home screen');
  const bootState = bootToHomeScreen(executor, cpu, mem);
  mem[0xD14091] = 1;
  mem[0xD177B7] = 0x55;
  mem[KEY_GATE_ADDR] = 0;
  console.log(`  D14091=${hex(mem[0xD14091], 2)} (key processing enabled)`);
  console.log(`  D177B7=${hex(mem[0xD177B7], 2)} (display refresh mode)`);
  console.log(`  D177BA=${hex(mem[KEY_GATE_ADDR], 2)} (key dispatch gate reset)`);
  console.log(`  D141B5=${hex(mem[KEY_BUFFER_ADDR], 2)} (key buffer, should be 0x00)`);

  const baselineHash = vramHash(mem);
  console.log(`  vramHash=${baselineHash} resumePc=${hex(bootState.lastPc)} resumeMode=${bootState.lastMode}`);

  console.log('phase 2: inject one key and follow the post-consume path');
  mem[KEY_GATE_ADDR] = 0;
  const d177baBefore = mem[KEY_GATE_ADDR];
  const entry = processInjectedKey(executor, mem, KEY_ONE, bootState.lastPc, bootState.lastMode ?? 'adl');

  console.log(`  key ${KEY_ONE.label.padEnd(5)} scan=${hex(KEY_ONE.scan, 2)} D177BA(before)=${hex(d177baBefore, 2)}`);
  console.log(
    `    consumed=${yesNo(entry.consumed)} bit3Cleared=${yesNo(entry.bit3Cleared)} `
    + `scanConsumedObservedStep=${formatStep(entry.timing.scanConsumedObservedStep)} `
    + `D00587=${hex(entry.scanAfterBurst, 2)} D177BA(after)=${hex(entry.d177ba, 2)} `
    + `burstSteps=${entry.burstSteps} burstTerm=${entry.burstTermination}`,
  );
  console.log(
    `    D141B5=${hex(entry.d141b5, 2)} reached001713=${yesNo(entry.reached001713)} `
    + `step001713=${formatStep(entry.step001713)} reached0008BB=${yesNo(entry.reached0008BB)} `
    + `step0008BB=${formatStep(entry.step0008BB)}`,
  );
  console.log(
    `    vramHash=${entry.vramBefore} -> ${entry.vramAfter} changed=${yesNo(entry.vramChanged)} `
    + `diffBytes=${entry.vramDiffTotal}`,
  );
  if (entry.vramDiffTotal === 0) {
    console.log('      VRAM diffs: none');
  } else {
    console.log('      VRAM diffs (first 10):');
    for (const diffEntry of entry.vramDiffs.slice(0, 10)) {
      console.log(
        `        addr=${hex(diffEntry.addr)} offset=${hex(diffEntry.offset, 5)} `
        + `${hex(diffEntry.before, 2)} -> ${hex(diffEntry.after, 2)}`,
      );
    }
    if (entry.vramDiffTotal > 10) {
      console.log(`        ... ${entry.vramDiffTotal - 10} more changed bytes not shown`);
    }
  }
  console.log(
    `    finalPc=${hex(entry.finalPc)} finalMode=${entry.finalMode} `
    + `finalSteps=${entry.finalSteps} finalTerm=${entry.finalTermination} `
    + `naturalTerm=${yesNo(entry.naturalTermination)} relationToEventLoop=${entry.finalPcRelation}`,
  );
  console.log(
    `    eventLoopReenteredAfterPolling=${yesNo(entry.firstEventLoopAfterPollingStep !== null)} `
    + `step=${formatStep(entry.firstEventLoopAfterPollingStep)}`,
  );
  if (entry.haltReached) {
    console.log(`    HALT reached at pc=${hex(entry.haltPc)} mode=${entry.haltMode} step=${entry.haltStep}`);
  } else {
    console.log(`    HALT reached=no within ${entry.finalSteps} steps`);
  }
  if (entry.error) {
    console.log(`    error=${entry.error}`);
  }

  console.log('    timing breakdown:');
  console.log(
    `      burst consume window: steps=${entry.timing.burstConsumeWindowSteps} `
    + `scanConsumedObservedStep=${formatStep(entry.timing.scanConsumedObservedStep)}`,
  );
  console.log(
    `      key processing: start001713=${formatStep(entry.timing.keyProcessingStartStep)} `
    + `first0008BB=${formatStep(entry.timing.chkOsInterruptStep)} `
    + `firstGetCSCReentry=${formatStep(entry.timing.firstGetCscAfterKeyProcessingStep)} `
    + `steps=${formatStep(entry.timing.keyProcessingSteps)}`,
  );
  console.log(
    `      _GetCSC polling loop: first003D6B=${formatStep(entry.timing.firstPollingLoopStep)} `
    + `last003D6B=${formatStep(entry.timing.lastPollingLoopStep)} `
    + `exitProxy=${entry.timing.pollingLoopExitProxy} `
    + `exitStep=${formatStep(entry.timing.pollingLoopExitProxyStep)} `
    + `steps=${formatStep(entry.timing.pollingLoopSteps)}`,
  );
  console.log(
    `      after polling-loop exit: eventLoopReentry=${formatStep(entry.timing.firstEventLoopAfterPollingStep)} `
    + `haltStep=${formatStep(entry.timing.haltStep)} `
    + `steps=${formatStep(entry.timing.afterPollingLoopExitSteps)}`,
  );

  console.log('    breadcrumbs (last visits requested for phase 453):');
  printBreadcrumb('0x003D5A _GetCSC entry', entry.breadcrumbs.getCscEntry);
  printBreadcrumb('0x003D6B polling loop', entry.breadcrumbs.pollingLoop);
  printBreadcrumb('0x003A73 event loop', entry.breadcrumbs.eventLoop);
  printBreadcrumb('0x001933-0x001942 HALT range', entry.breadcrumbs.haltRange);

  const finalHash = vramHash(mem);
  console.log('phase 3: summary');
  console.log(
    `  ${entry.key.padEnd(5)} consumed=${yesNo(entry.consumed)} `
    + `vramChanged=${yesNo(entry.vramChanged)} diffBytes=${entry.vramDiffTotal} `
    + `eventLoopReentered=${yesNo(entry.firstEventLoopAfterPollingStep !== null)} `
    + `halt=${yesNo(entry.haltReached)} finalPc=${hex(entry.finalPc)} `
    + `relationToEventLoop=${entry.finalPcRelation} steps=${entry.finalSteps}`,
  );
  console.log(
    `  last visits: 0x003D5A=${formatStep(entry.breadcrumbs.getCscEntry.lastStep)} `
    + `0x003D6B=${formatStep(entry.breadcrumbs.pollingLoop.lastStep)} `
    + `0x003A73=${formatStep(entry.breadcrumbs.eventLoop.lastStep)} `
    + `HALT=${formatStep(entry.breadcrumbs.haltRange.lastStep)}`,
  );
  console.log(`  baselineVramHash=${baselineHash} finalVramHash=${finalHash} anyChange=${yesNo(baselineHash !== finalHash)}`);
}

main();
