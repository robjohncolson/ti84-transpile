#!/usr/bin/env node

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
const FLAG_Z = 0x40;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

const EVENT_LOOP_ENTRY = 0x003A73;
const EVENT_LOOP_BRANCH = 0x003A81;
const GETCSC_ENTRY = 0x003D5A;
const ISR_GUARD = 0x001713;
const PORT03_CHECK = 0x0067F8;
const PORT03_RETURN = 0x001727;
const KEY_PROCESSING_ENTRY = 0x001853;
const SLEEP_ENTRY = 0x001933;
const KEY_PROCESSOR = 0x03FA09;
const DISPLAY_REFRESH = 0x049087;

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
  [EVENT_LOOP_ENTRY, 'EVENT_LOOP'],
  [GETCSC_ENTRY, 'GETCSC_003D5A'],
  [ISR_GUARD, 'ISR_GUARD'],
  [PORT03_CHECK, 'PORT03_CHECK_0067F8'],
  [KEY_PROCESSING_ENTRY, 'KEY_PROCESSING_001853'],
  [SLEEP_ENTRY, 'SLEEP_001933'],
  [KEY_PROCESSOR, 'KEY_PROCESSOR_03FA09'],
  [DISPLAY_REFRESH, 'DISPLAY_REFRESH_049087'],
];

const WATCHED_BYTES = [
  [EVENT_GATE_ADDR, 'D177BA event gate'],
  [KEY_SCAN_CODE_ADDR, 'D00587 scan code'],
  [KEY_AVAILABLE_BYTE, 'D00080 key available'],
  [KEY_BUFFER_ADDR, 'D141B5 key buffer'],
  [DISPLAY_DIRTY_FLAG, 'D177B7 display dirty'],
];

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function formatStep(step) {
  return step === null || step === undefined ? 'n/a' : String(step);
}

function passFail(value) {
  return value ? 'PASS' : 'FAIL';
}

function zState(flags) {
  return (flags & FLAG_Z) !== 0 ? 'SET' : 'CLEAR';
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
      changes: [],
    });
  }
  return state;
}

function recordWatchedChange(watchedState, addr, before, after, step, pc, kind) {
  const entry = watchedState.get(addr);
  if (!entry || before === after) return;
  entry.changes.push({
    step,
    pc,
    kind,
    before,
    after,
  });
}

function installWatchedWrites(cpu, mem, watchedState, context) {
  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  cpu.write8 = (addr, value) => {
    const base = addr & 0xFFFFFF;
    const before = mem[base] & 0xFF;
    originalWrite8(addr, value);
    const after = mem[base] & 0xFF;
    recordWatchedChange(watchedState, base, before, after, context.currentStep, context.currentPc, 'write8');
  };

  cpu.write16 = (addr, value) => {
    const base = addr & 0xFFFFFF;
    const before0 = mem[base] & 0xFF;
    const before1 = mem[(base + 1) & 0xFFFFFF] & 0xFF;
    originalWrite16(addr, value);
    recordWatchedChange(
      watchedState,
      base,
      before0,
      mem[base] & 0xFF,
      context.currentStep,
      context.currentPc,
      'write16',
    );
    recordWatchedChange(
      watchedState,
      (base + 1) & 0xFFFFFF,
      before1,
      mem[(base + 1) & 0xFFFFFF] & 0xFF,
      context.currentStep,
      context.currentPc,
      'write16',
    );
  };

  cpu.write24 = (addr, value) => {
    const base = addr & 0xFFFFFF;
    const before0 = mem[base] & 0xFF;
    const before1 = mem[(base + 1) & 0xFFFFFF] & 0xFF;
    const before2 = mem[(base + 2) & 0xFFFFFF] & 0xFF;
    originalWrite24(addr, value);
    recordWatchedChange(
      watchedState,
      base,
      before0,
      mem[base] & 0xFF,
      context.currentStep,
      context.currentPc,
      'write24',
    );
    recordWatchedChange(
      watchedState,
      (base + 1) & 0xFFFFFF,
      before1,
      mem[(base + 1) & 0xFFFFFF] & 0xFF,
      context.currentStep,
      context.currentPc,
      'write24',
    );
    recordWatchedChange(
      watchedState,
      (base + 2) & 0xFFFFFF,
      before2,
      mem[(base + 2) & 0xFFFFFF] & 0xFF,
      context.currentStep,
      context.currentPc,
      'write24',
    );
  };
}

async function main() {
  console.log('=== Phase 463: D177BA-cleared key dispatch probe ===');
  console.log('');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({
    pllDelay: 2,
    timerInterrupt: false,
  });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  console.log('--- Step 1: Cold boot ---');
  const bootState = coldBoot(executor, cpu, mem);
  console.log(`boot:     steps=${bootState.boot.steps} term=${bootState.boot.termination} lastPc=${hex(bootState.boot.lastPc)}`);
  console.log(`kernel:   steps=${bootState.kernel.steps} term=${bootState.kernel.termination} lastPc=${hex(bootState.kernel.lastPc)}`);
  console.log(`postInit: steps=${bootState.postInit.steps} term=${bootState.postInit.termination} lastPc=${hex(bootState.postInit.lastPc)}`);
  console.log(`cpu.pc=${hex(cpu.pc)} cpu.mbase=${hex(cpu.mbase, 2)} cpu.iy=${hex(cpu.iy)} cpu.im=${cpu.im}`);
  console.log('');

  console.log('--- Step 2: Seed event-loop state ---');
  mem[EVENT_GATE_ADDR] = 0x00;
  mem[KEY_ENABLE_FLAG] = 0x01;
  mem[KEY_SCAN_CODE_ADDR] = INJECTED_SCAN_CODE;
  mem[KEY_AVAILABLE_BYTE] = (mem[KEY_AVAILABLE_BYTE] | KEY_AVAILABLE_MASK) & 0xFF;

  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;

  console.log(`mem[0xD177BA] = ${hex(mem[EVENT_GATE_ADDR], 2)} (clear event gate)`);
  console.log(`mem[0xD14091] = ${hex(mem[KEY_ENABLE_FLAG], 2)} (key processing enable)`);
  console.log(`mem[0xD00587] = ${hex(mem[KEY_SCAN_CODE_ADDR], 2)} (key '1')`);
  console.log(`mem[0xD00080] = ${hex(mem[KEY_AVAILABLE_BYTE], 2)} (bit3=${(mem[KEY_AVAILABLE_BYTE] >> 3) & 1})`);
  console.log(`mem[0xD141B5] = ${hex(mem[KEY_BUFFER_ADDR], 2)}`);
  console.log(`mem[0xD177B7] = ${hex(mem[DISPLAY_DIRTY_FLAG], 2)}`);
  console.log('');

  const watchedState = createWatchedState(mem);
  const trackedPcState = createTrackedPcState();
  const firstUniquePcs = [];
  const firstUniquePcSet = new Set();
  const postPortReturnSamples = [];
  const guardResultSamples = [];
  const missingBlocks = [];
  const context = {
    currentPc: EVENT_LOOP_ENTRY,
    currentStep: 0,
  };

  installWatchedWrites(cpu, mem, watchedState, context);

  console.log('--- Step 3: Run event loop ---');
  let runResult;
  try {
    runResult = executor.runFrom(EVENT_LOOP_ENTRY, 'adl', {
      maxSteps: RUN_MAX_STEPS,
      maxLoopIterations: RUN_MAX_LOOP_ITERATIONS,
      diHaltBypass: true,

      onBlock(pc, mode, _meta, steps) {
        const normalizedPc = pc & 0xFFFFFF;
        const stepIndex = steps + 1;

        context.currentPc = normalizedPc;
        context.currentStep = stepIndex;

        if (firstUniquePcs.length < 20 && !firstUniquePcSet.has(normalizedPc)) {
          firstUniquePcSet.add(normalizedPc);
          firstUniquePcs.push({ step: stepIndex, pc: normalizedPc, mode });
        }

        const tracked = trackedPcState.get(normalizedPc);
        if (tracked) {
          tracked.count += 1;
          if (tracked.firstStep === null) {
            tracked.firstStep = stepIndex;
          }
          tracked.lastStep = stepIndex;
          if (tracked.sampleSteps.length < 8) {
            tracked.sampleSteps.push(stepIndex);
          }
        }

        if (normalizedPc === PORT03_RETURN && postPortReturnSamples.length < 16) {
          postPortReturnSamples.push({
            step: stepIndex,
            f: cpu.f & 0xFF,
            z: (cpu.f & FLAG_Z) !== 0,
            a: cpu.a & 0xFF,
            l: cpu.l & 0xFF,
          });
        }

        if (normalizedPc === EVENT_LOOP_BRANCH && guardResultSamples.length < 16) {
          guardResultSamples.push({
            step: stepIndex,
            f: cpu.f & 0xFF,
            z: (cpu.f & FLAG_Z) !== 0,
            a: cpu.a & 0xFF,
            l: cpu.l & 0xFF,
          });
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

  const keyProcessingReached = (trackedPcState.get(KEY_PROCESSING_ENTRY)?.count ?? 0) > 0;
  const sleepReached = (trackedPcState.get(SLEEP_ENTRY)?.count ?? 0) > 0;
  const portCheckReached = (trackedPcState.get(PORT03_CHECK)?.count ?? 0) > 0;
  const firstPortReturn = postPortReturnSamples[0] ?? null;
  const firstGuardResult = guardResultSamples[0] ?? null;

  console.log('=== Requested Verdicts ===');
  console.log(`${passFail(keyProcessingReached)} 0x001853 KEY_PROCESSING_PATH reached`);
  console.log(`${passFail(!sleepReached)} 0x001933 SLEEP_PATH not reached`);
  console.log(`${passFail(portCheckReached)} 0x0067F8 PORT03_CHECK reached`);
  if (firstPortReturn) {
    console.log(
      `INFO first 0x001727 after 0x0067F8: step=${firstPortReturn.step} `
      + `F=${hex(firstPortReturn.f, 2)} Z=${firstPortReturn.z ? 'SET' : 'CLEAR'} `
      + `A=${hex(firstPortReturn.a, 2)} L=${hex(firstPortReturn.l, 2)}`,
    );
  } else {
    console.log('INFO first 0x001727 after 0x0067F8: not observed');
  }
  if (firstGuardResult) {
    console.log(
      `INFO first 0x003A81 branch check: step=${firstGuardResult.step} `
      + `F=${hex(firstGuardResult.f, 2)} Z=${firstGuardResult.z ? 'SET' : 'CLEAR'} `
      + `A=${hex(firstGuardResult.a, 2)} L=${hex(firstGuardResult.l, 2)}`,
    );
  } else {
    console.log('INFO first 0x003A81 branch check: not observed');
  }
  console.log('');

  console.log('=== Tracked PC Verdicts ===');
  for (const [pc] of TRACKED_PCS) {
    const tracked = trackedPcState.get(pc);
    const hit = tracked.count > 0;
    console.log(
      `${passFail(hit).padEnd(4)} ${hex(pc)} ${tracked.label.padEnd(24)} `
      + `hits=${tracked.count} first=${formatStep(tracked.firstStep)} last=${formatStep(tracked.lastStep)} `
      + `samples=${tracked.sampleSteps.length ? tracked.sampleSteps.join(',') : 'none'}`,
    );
  }
  console.log('');

  console.log('=== First 20 Unique PCs ===');
  if (firstUniquePcs.length === 0) {
    console.log('none');
  } else {
    for (let index = 0; index < firstUniquePcs.length; index += 1) {
      const entry = firstUniquePcs[index];
      console.log(`[${String(index + 1).padStart(2, '0')}] step=${entry.step} pc=${hex(entry.pc)} mode=${entry.mode}`);
    }
  }
  console.log('');

  console.log('=== Port Check Return Samples ===');
  if (postPortReturnSamples.length === 0) {
    console.log('none');
  } else {
    for (const sample of postPortReturnSamples) {
      console.log(
        `step=${sample.step} pc=${hex(PORT03_RETURN)} F=${hex(sample.f, 2)} `
        + `Z=${zState(sample.f)} A=${hex(sample.a, 2)} L=${hex(sample.l, 2)}`,
      );
    }
  }
  console.log('');

  console.log('=== Guard Branch Samples ===');
  if (guardResultSamples.length === 0) {
    console.log('none');
  } else {
    for (const sample of guardResultSamples) {
      console.log(
        `step=${sample.step} pc=${hex(EVENT_LOOP_BRANCH)} F=${hex(sample.f, 2)} `
        + `Z=${zState(sample.f)} A=${hex(sample.a, 2)} L=${hex(sample.l, 2)}`,
      );
    }
  }
  console.log('');

  console.log('=== Watched Memory Changes ===');
  for (const [addr] of WATCHED_BYTES) {
    const entry = watchedState.get(addr);
    const after = mem[addr] & 0xFF;
    console.log(
      `${entry.label.padEnd(20)} ${hex(addr)} before=${hex(entry.before, 2)} after=${hex(after, 2)} `
      + `writes=${entry.changes.length}`,
    );
    if (entry.changes.length === 0) {
      console.log('  writes: none observed');
    } else {
      for (const change of entry.changes) {
        console.log(
          `  step=${change.step} pc=${hex(change.pc)} kind=${change.kind} `
          + `${hex(change.before, 2)} -> ${hex(change.after, 2)}`,
        );
      }
    }
  }
  console.log('');

  console.log('=== Final State ===');
  console.log(`mem[0xD177BA] = ${hex(mem[EVENT_GATE_ADDR], 2)}`);
  console.log(`mem[0xD14091] = ${hex(mem[KEY_ENABLE_FLAG], 2)}`);
  console.log(`mem[0xD00587] = ${hex(mem[KEY_SCAN_CODE_ADDR], 2)}`);
  console.log(`mem[0xD00080] = ${hex(mem[KEY_AVAILABLE_BYTE], 2)} (bit3=${(mem[KEY_AVAILABLE_BYTE] >> 3) & 1})`);
  console.log(`mem[0xD141B5] = ${hex(mem[KEY_BUFFER_ADDR], 2)}`);
  console.log(`mem[0xD177B7] = ${hex(mem[DISPLAY_DIRTY_FLAG], 2)}`);
  console.log('');

  console.log('=== Missing Blocks ===');
  if (missingBlocks.length === 0) {
    console.log('none');
  } else {
    for (const block of missingBlocks) {
      console.log(`step=${block.step} pc=${hex(block.pc)} mode=${block.mode}`);
    }
  }
}

try {
  await main();
} catch (error) {
  console.error('Fatal error:', error.stack || error);
  process.exitCode = 1;
}
