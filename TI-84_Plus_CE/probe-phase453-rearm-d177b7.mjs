#!/usr/bin/env node
// Phase 453 workflow probe: re-arm D177B7 between injected keys.
//
// The phase 449 workflow probe injects each key on a separate event-loop
// iteration. This version additionally pre-copies the flash self-test RAM
// routine, re-arms the D177B7 display-dirty flag and D177BA gate between
// keys, clears D141B5 before each injected key, and prints per-key VRAM
// diffs while giving each key a much larger post-consume processing budget.
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
const HALT_RANGE_START = 0x001933;
const HALT_RANGE_END = 0x001942;

const KEY_AVAILABLE_FLAG_ADDR = 0xD00080;
const KEY_AVAILABLE_FLAG_MASK = 0x08;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_BUFFER_ADDR = 0xD141B5;
const KEY_GATE_ADDR = 0xD177BA;

const KEY_ONE = { label: '1', scan: 0x12 };
const KEY_PLUS = { label: '+', scan: 0x2A };
const KEY_ENTER = { label: 'ENTER', scan: 0x29 };
const SEQUENCE = [KEY_ONE, KEY_PLUS, KEY_ONE, KEY_ENTER];

const CONSUME_BURST_STEPS = 500;
const POST_CONSUME_STEPS = 500000;
const PROCESS_CHUNK_STEPS = 2000;
const MAX_LOOPS = 5000;

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function yesNo(value) {
  return value ? 'yes' : 'no';
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

  // Pre-copy flash self-test routine from ROM to RAM.
  // The OS normally copies 90 bytes from ROM 0x000EBB to RAM 0xD18C22 via
  // routine 0x000E94->0x000D7E. Our boot never runs that copy routine.
  // Without this, JP (IX) to 0xD18C22 hits the RAM trampoline instead of real code.
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
  };
}

function runTracked(executor, startPc, startMode, maxSteps, stepOffset, trace) {
  try {
    return executor.runFrom(startPc, startMode, {
      maxSteps,
      maxLoopIterations: MAX_LOOPS,
      diHaltBypass: true,
      onBlock: (pc, mode, _meta, steps) => {
        const normalizedPc = pc & 0xFFFFFF;
        const absoluteStep = stepOffset + steps;

        if (normalizedPc === SYSTEM_CHECK_ENTRY && trace.step001713 === null) {
          trace.reached001713 = true;
          trace.step001713 = absoluteStep;
        }

        if (normalizedPc === CHK_OS_INTERRUPT_ENTRY && trace.step0008BB === null) {
          trace.reached0008BB = true;
          trace.step0008BB = absoluteStep;
        }

        if (isHaltPc(normalizedPc) && trace.haltStep === null) {
          trace.haltReached = true;
          trace.haltPc = normalizedPc;
          trace.haltStep = absoluteStep;
          trace.haltMode = mode ?? startMode;
        }
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

  // After _GetCSC consumes the scan code, keep advancing in small chunks so we
  // can stop as soon as the scheduler re-enters the DI+HALT barrier.
  while (consumed && !trace.haltReached && remainingProcessSteps > 0) {
    const chunkSteps = Math.min(PROCESS_CHUNK_STEPS, remainingProcessSteps);
    const chunkResult = runTracked(
      executor,
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
    reached001713: trace.reached001713,
    step001713: trace.step001713,
    reached0008BB: trace.reached0008BB,
    step0008BB: trace.step0008BB,
    haltReached: trace.haltReached,
    haltPc: trace.haltPc,
    haltStep: trace.haltStep,
    haltMode: trace.haltMode,
    d141b5: mem[KEY_BUFFER_ADDR],
    d177b7: mem[0xD177B7],
    d177ba: mem[KEY_GATE_ADDR],
    vramBefore: beforeHash,
    vramAfter: afterHash,
    vramChanged: beforeHash !== afterHash,
    vramDiffTotal: diff.totalChanged,
    vramDiffs: diff.diffs,
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

  console.log('--- phase 453 workflow probe: re-arm D177B7 between keys ---');
  console.log('phase 1: boot to home screen');
  const bootState = bootToHomeScreen(executor, cpu, mem);
  mem[0xD14091] = 1;
  mem[0xD177B7] = 0x55;
  mem[KEY_GATE_ADDR] = 0;
  console.log(`  D14091=${hex(mem[0xD14091], 2)} (key processing enabled)`);
  console.log(`  D177B7=${hex(mem[0xD177B7], 2)} (display refresh mode)`);
  console.log(`  D177BA=${hex(mem[KEY_GATE_ADDR], 2)} (key dispatch gate reset)`);
  console.log(`  D141B5=${hex(mem[0xD141B5], 2)} (key buffer, should be 0x00)`);

  const baselineHash = vramHash(mem);
  console.log(`  vramHash=${baselineHash} resumePc=${hex(bootState.lastPc)} resumeMode=${bootState.lastMode}`);

  console.log('phase 2: inject one key per event-loop iteration');
  const results = [];
  let currentPc = bootState.lastPc;
  let currentMode = bootState.lastMode ?? 'adl';

  for (const key of SEQUENCE) {
    // The OS consumes D177B7 and sets D177BA=0x7F after each key event.
    // Re-arm D177B7, clear the single-entry key buffer, and reset D177BA so
    // the next key can render and reach 0x0067F8 through the D177BA gate.
    mem[0xD177B7] = 0x55;
    mem[KEY_BUFFER_ADDR] = 0x00;
    mem[KEY_GATE_ADDR] = 0;
    const d177b7Before = mem[0xD177B7];
    const d177baBefore = mem[KEY_GATE_ADDR];

    const entry = processInjectedKey(executor, mem, key, currentPc, currentMode);
    entry.d177b7Before = d177b7Before;
    entry.d177baBefore = d177baBefore;
    results.push(entry);

    console.log(
      `  key ${key.label.padEnd(5)} scan=${hex(key.scan, 2)} `
      + `D177B7(before)=${hex(entry.d177b7Before, 2)} `
      + `D177BA(before)=${hex(entry.d177baBefore, 2)}`,
    );
    console.log(
      `    consumed=${yesNo(entry.consumed)} bit3Cleared=${yesNo(entry.bit3Cleared)} `
      + `D00587=${hex(entry.scanAfterBurst, 2)} `
      + `D177B7(after)=${hex(entry.d177b7, 2)} `
      + `D177BA(after)=${hex(entry.d177ba, 2)} `
      + `burstSteps=${entry.burstSteps} burstTerm=${entry.burstTermination}`,
    );
    console.log(
      `    D141B5=${hex(entry.d141b5, 2)} reached001713=${yesNo(entry.reached001713)} `
      + `reached0008BB=${yesNo(entry.reached0008BB)}`,
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
      + `naturalTerm=${yesNo(entry.naturalTermination)}`,
    );

    if (entry.reached001713) {
      console.log(`    0x001713 first reached at step=${entry.step001713}`);
    }

    if (entry.reached0008BB) {
      console.log(`    0x0008BB first reached at step=${entry.step0008BB}`);
    }

    if (entry.haltReached) {
      console.log(`    HALT reached at pc=${hex(entry.haltPc)} mode=${entry.haltMode} step=${entry.haltStep}`);
    } else {
      console.log(`    HALT reached=no within ${entry.finalSteps} steps`);
    }

    if (entry.error) {
      console.log(`    error=${entry.error}`);
    }

    currentPc = EVENT_LOOP_ENTRY;
    currentMode = 'adl';
  }

  const finalHash = vramHash(mem);
  console.log('phase 3: summary');
  for (const entry of results) {
    console.log(
      `  ${entry.key.padEnd(5)} consumed=${yesNo(entry.consumed)} `
      + `vramChanged=${yesNo(entry.vramChanged)} diffBytes=${entry.vramDiffTotal} `
      + `D177B7=${hex(entry.d177b7Before, 2)} -> ${hex(entry.d177b7, 2)} `
      + `D177BA=${hex(entry.d177baBefore, 2)} -> ${hex(entry.d177ba, 2)} `
      + `D141B5=${hex(entry.d141b5, 2)} steps=${entry.finalSteps}`,
    );
  }
  console.log(`  baselineVramHash=${baselineHash} finalVramHash=${finalHash} anyChange=${yesNo(baselineHash !== finalHash)}`);
}

main();
