#!/usr/bin/env node
// Phase 464: bypass 0x0066FF so the scheduler falls through to the key path.
//
// This keeps the phase 463 cold-boot harness, injects one raw scan code, then
// overrides the lifted 0x0066FF block to return NZ with HL=1 immediately.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const FLAG_Z = 0x40;

const MEM_SIZE = 0x1000000;
const VRAM_BASE = 0xD40000;
const VRAM_BYTE_SIZE = 320 * 240 * 2;
const VRAM_END = VRAM_BASE + VRAM_BYTE_SIZE;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

const SCHEDULER_ENTRY = 0x0015F7;
const SCHEDULER_BRANCH_BLOCK = 0x0015DE;
const SCHEDULER_KEY_BLOCK = 0x0015E1;
const PROCESS_KEY_ENTRY = 0x0059C6;
const KEY_PROCESSOR_ENTRY = 0x03FA09;
const BYPASS_ENTRY = 0x0066FF;

const KEY_ENABLE_FLAG = 0xD14091;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_AVAILABLE_BYTE = 0xD00080;
const KEY_AVAILABLE_MASK = 0x08;
const KEY_BUFFER_ADDR = 0xD141B5;
const DISPLAY_DIRTY_FLAG = 0xD177B7;
const EVENT_GATE_ADDR = 0xD177BA;

const INJECTED_SCAN_CODE = 0x92;
const TIMER_INTERVAL = 500;
const RUN_MAX_STEPS = 500000;
const RUN_MAX_LOOP_ITERATIONS = 10000;

const TRACKED_PCS = [
  [SCHEDULER_ENTRY, 'SCHEDULER_ENTRY'],
  [SCHEDULER_BRANCH_BLOCK, 'SCHEDULER_JR_Z'],
  [SCHEDULER_KEY_BLOCK, 'SCHEDULER_KEY_BLOCK'],
  [PROCESS_KEY_ENTRY, 'PROCESS_KEY'],
  [KEY_PROCESSOR_ENTRY, 'KEY_PROCESSOR'],
  [BYPASS_ENTRY, 'BYPASS_0066FF'],
];

const WATCHED_BYTES = [
  [KEY_SCAN_CODE_ADDR, 'D00587 scan code'],
  [KEY_AVAILABLE_BYTE, 'D00080 key avail'],
  [KEY_BUFFER_ADDR, 'D141B5 key buffer'],
  [KEY_ENABLE_FLAG, 'D14091 key enable'],
  [DISPLAY_DIRTY_FLAG, 'D177B7 display dirty'],
  [EVENT_GATE_ADDR, 'D177BA event gate'],
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

function createVramState() {
  return {
    totalOps: 0,
    changedOps: 0,
    changedBytes: 0,
    uniqueChangedAddrs: new Set(),
    samples: [],
  };
}

function recordVramOperation(vramState, base, beforeBytes, afterBytes, step, pc, kind) {
  let touched = false;
  const changes = [];

  for (let i = 0; i < beforeBytes.length; i++) {
    const addr = (base + i) & 0xFFFFFF;
    if (addr < VRAM_BASE || addr >= VRAM_END) continue;
    touched = true;
    if (beforeBytes[i] !== afterBytes[i]) {
      changes.push({
        addr,
        before: beforeBytes[i],
        after: afterBytes[i],
      });
    }
  }

  if (!touched) return;

  vramState.totalOps++;
  if (changes.length === 0) return;

  vramState.changedOps++;
  vramState.changedBytes += changes.length;
  for (const change of changes) {
    vramState.uniqueChangedAddrs.add(change.addr);
  }

  if (vramState.samples.length < 16) {
    vramState.samples.push({
      step,
      pc,
      kind,
      changes,
    });
  }
}

function summarizeFinalVramDiff(vramBefore, mem) {
  let changedBytes = 0;
  const samples = [];

  for (let offset = 0; offset < vramBefore.length; offset++) {
    const before = vramBefore[offset] & 0xFF;
    const after = mem[VRAM_BASE + offset] & 0xFF;
    if (before === after) continue;
    changedBytes++;
    if (samples.length < 16) {
      samples.push({
        addr: VRAM_BASE + offset,
        before,
        after,
      });
    }
  }

  return { changedBytes, samples };
}

function installWriteHooks(cpu, mem, watchedState, vramState, context) {
  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  cpu.write8 = (addr, value) => {
    const base = addr & 0xFFFFFF;
    const before = mem[base] & 0xFF;
    origWrite8(addr, value);
    const after = mem[base] & 0xFF;
    recordWatchedChange(watchedState, base, before, after, context.currentStep, context.currentPc, 'write8');
    recordVramOperation(vramState, base, [before], [after], context.currentStep, context.currentPc, 'write8');
  };

  cpu.write16 = (addr, value) => {
    const base = addr & 0xFFFFFF;
    const beforeBytes = [
      mem[base] & 0xFF,
      mem[(base + 1) & 0xFFFFFF] & 0xFF,
    ];

    origWrite16(addr, value);

    const afterBytes = [
      mem[base] & 0xFF,
      mem[(base + 1) & 0xFFFFFF] & 0xFF,
    ];

    recordWatchedChange(watchedState, base, beforeBytes[0], afterBytes[0], context.currentStep, context.currentPc, 'write16');
    recordWatchedChange(
      watchedState,
      (base + 1) & 0xFFFFFF,
      beforeBytes[1],
      afterBytes[1],
      context.currentStep,
      context.currentPc,
      'write16',
    );
    recordVramOperation(vramState, base, beforeBytes, afterBytes, context.currentStep, context.currentPc, 'write16');
  };

  cpu.write24 = (addr, value) => {
    const base = addr & 0xFFFFFF;
    const beforeBytes = [
      mem[base] & 0xFF,
      mem[(base + 1) & 0xFFFFFF] & 0xFF,
      mem[(base + 2) & 0xFFFFFF] & 0xFF,
    ];

    origWrite24(addr, value);

    const afterBytes = [
      mem[base] & 0xFF,
      mem[(base + 1) & 0xFFFFFF] & 0xFF,
      mem[(base + 2) & 0xFFFFFF] & 0xFF,
    ];

    recordWatchedChange(watchedState, base, beforeBytes[0], afterBytes[0], context.currentStep, context.currentPc, 'write24');
    recordWatchedChange(
      watchedState,
      (base + 1) & 0xFFFFFF,
      beforeBytes[1],
      afterBytes[1],
      context.currentStep,
      context.currentPc,
      'write24',
    );
    recordWatchedChange(
      watchedState,
      (base + 2) & 0xFFFFFF,
      beforeBytes[2],
      afterBytes[2],
      context.currentStep,
      context.currentPc,
      'write24',
    );
    recordVramOperation(vramState, base, beforeBytes, afterBytes, context.currentStep, context.currentPc, 'write24');
  };
}

function install0066ffBypass(executor, context, bypassState) {
  const patchedKeys = [];

  for (const key of ['0066ff:adl', '0066ff:z80']) {
    if (!executor.compiledBlocks[key]) continue;
    patchedKeys.push(key);
    executor.compiledBlocks[key] = function patched0066ff(cpu) {
      bypassState.hits++;
      if (bypassState.firstStep === null) {
        bypassState.firstStep = context.currentStep;
      }

      cpu.hl = 0x000001;
      cpu.f &= ~FLAG_Z;

      const retAddr = cpu.pop();
      if (bypassState.samples.length < 8) {
        bypassState.samples.push({
          step: context.currentStep,
          pc: context.currentPc,
          key,
          retAddr,
          sp: cpu.sp & 0xFFFFFF,
          hl: cpu.hl & 0xFFFFFF,
          f: cpu.f & 0xFF,
        });
      }
      return retAddr;
    };
  }

  if (patchedKeys.length === 0) {
    throw new Error('Unable to locate lifted 0x0066FF block in executor.compiledBlocks');
  }

  return patchedKeys;
}

async function main() {
  console.log('=== Phase 464: Bypass 0x0066FF in Scheduler ===');
  console.log('Patch 0x0066FF to return NZ/HL=1, then start at scheduler 0x0015F7.');
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

  console.log('--- Step 1: Cold boot ---');
  const bootState = coldBoot(executor, cpu, mem);
  console.log(`boot:     steps=${bootState.boot.steps} term=${bootState.boot.termination} lastPc=${hex(bootState.boot.lastPc)}`);
  console.log(`kernel:   steps=${bootState.kernel.steps} term=${bootState.kernel.termination} lastPc=${hex(bootState.kernel.lastPc)}`);
  console.log(`postInit: steps=${bootState.postInit.steps} term=${bootState.postInit.termination} lastPc=${hex(bootState.postInit.lastPc)}`);
  console.log(`cpu.pc=${hex(cpu.pc)} cpu.mbase=${hex(cpu.mbase, 2)} cpu.iy=${hex(cpu.iy)} cpu.im=${cpu.im}`);
  console.log('');

  console.log('--- Step 2: Seed key state ---');
  mem[KEY_ENABLE_FLAG] = 0x01;
  mem[DISPLAY_DIRTY_FLAG] = 0x00;
  mem[EVENT_GATE_ADDR] = 0x00;
  mem[KEY_BUFFER_ADDR] = 0x00;
  mem[KEY_SCAN_CODE_ADDR] = INJECTED_SCAN_CODE;
  mem[KEY_AVAILABLE_BYTE] = (mem[KEY_AVAILABLE_BYTE] | KEY_AVAILABLE_MASK) & 0xFF;

  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  peripherals.setTimerEnabled(true);

  console.log(`timerEnabled=true timerInterval=${TIMER_INTERVAL}`);
  console.log(`D14091=${hex(mem[KEY_ENABLE_FLAG], 2)} D177B7=${hex(mem[DISPLAY_DIRTY_FLAG], 2)} D177BA=${hex(mem[EVENT_GATE_ADDR], 2)}`);
  console.log(`D00587=${hex(mem[KEY_SCAN_CODE_ADDR], 2)} D00080=${hex(mem[KEY_AVAILABLE_BYTE], 2)} D141B5=${hex(mem[KEY_BUFFER_ADDR], 2)}`);
  console.log(`cpu.iff1=${cpu.iff1} cpu.iff2=${cpu.iff2} cpu.im=${cpu.im} cpu.halted=${cpu.halted}`);
  console.log('');

  console.log('--- Step 3: Patch lifted 0x0066FF ---');
  const context = {
    currentPc: SCHEDULER_ENTRY,
    currentStep: 0,
  };
  const bypassState = {
    hits: 0,
    firstStep: null,
    samples: [],
  };
  const patchedKeys = install0066ffBypass(executor, context, bypassState);
  console.log(`patchedKeys=${patchedKeys.join(', ')}`);
  console.log('');

  const watchedState = createWatchedState(mem);
  const trackedPcState = createTrackedPcState();
  const vramState = createVramState();
  const vramBefore = mem.slice(VRAM_BASE, VRAM_END);
  const firstUniquePcs = [];
  const firstUniquePcSet = new Set();
  const interruptEvents = [];
  const missingBlocks = [];

  installWriteHooks(cpu, mem, watchedState, vramState, context);

  console.log('--- Step 4: Run scheduler at 0x0015F7 ---');
  let runResult;
  try {
    runResult = executor.runFrom(SCHEDULER_ENTRY, 'adl', {
      maxSteps: RUN_MAX_STEPS,
      maxLoopIterations: RUN_MAX_LOOP_ITERATIONS,
      diHaltBypass: false,

      onBlock(pc, mode, _meta, steps) {
        const normalizedPc = pc & 0xFFFFFF;
        const stepIndex = steps + 1;
        context.currentPc = normalizedPc;
        context.currentStep = stepIndex;

        if (firstUniquePcs.length < 40 && !firstUniquePcSet.has(normalizedPc)) {
          firstUniquePcSet.add(normalizedPc);
          firstUniquePcs.push({ step: stepIndex, pc: normalizedPc, mode });
        }

        const tracked = trackedPcState.get(normalizedPc);
        if (!tracked) return;
        tracked.count++;
        if (tracked.firstStep === null) {
          tracked.firstStep = stepIndex;
        }
        tracked.lastStep = stepIndex;
        if (tracked.sampleSteps.length < 8) {
          tracked.sampleSteps.push(stepIndex);
        }
      },

      onInterrupt(type, returnPc, vector, steps) {
        if (interruptEvents.length < 24) {
          interruptEvents.push({
            step: steps + 1,
            type,
            returnPc: returnPc & 0xFFFFFF,
            vector: vector & 0xFFFFFF,
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

  const finalScanCode = mem[KEY_SCAN_CODE_ADDR] & 0xFF;
  const finalKeyAvail = mem[KEY_AVAILABLE_BYTE] & 0xFF;
  const finalKeyBuffer = mem[KEY_BUFFER_ADDR] & 0xFF;
  const finalKeyEnable = mem[KEY_ENABLE_FLAG] & 0xFF;
  const finalDisplayDirty = mem[DISPLAY_DIRTY_FLAG] & 0xFF;
  const finalEventGate = mem[EVENT_GATE_ADDR] & 0xFF;
  const finalVramDiff = summarizeFinalVramDiff(vramBefore, mem);
  const keyBufferEntry = watchedState.get(KEY_BUFFER_ADDR);

  console.log('=== Hit Count Summary ===');
  for (const [pc] of TRACKED_PCS) {
    const tracked = trackedPcState.get(pc);
    console.log(
      `${tracked.label.padEnd(22)} ${hex(pc)} count=${tracked.count} `
      + `first=${formatStep(tracked.firstStep)} last=${formatStep(tracked.lastStep)} `
      + `samples=${tracked.sampleSteps.length ? tracked.sampleSteps.join(',') : 'none'}`,
    );
  }
  console.log(`interrupt events captured ${interruptEvents.length}`);
  console.log(`missing blocks captured   ${missingBlocks.length}`);
  console.log('');

  console.log('=== 0x0066FF Patch Activity ===');
  console.log(`patched keys: ${patchedKeys.join(', ')}`);
  console.log(`bypass hits:  ${bypassState.hits}`);
  console.log(`first hit:    ${formatStep(bypassState.firstStep)}`);
  if (bypassState.samples.length === 0) {
    console.log('samples: none');
  } else {
    for (const sample of bypassState.samples) {
      console.log(
        `step=${sample.step} pc=${hex(sample.pc)} key=${sample.key} `
        + `ret=${hex(sample.retAddr)} sp=${hex(sample.sp)} hl=${hex(sample.hl)} f=${hex(sample.f, 2)}`,
      );
    }
  }
  console.log('');

  console.log('=== First 40 Unique PCs ===');
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
      `${entry.label.padEnd(20)} ${hex(addr)} before=${hex(entry.before, 2)} after=${hex(after, 2)} `
      + `changed=${yesNo(entry.before !== after)} totalWrites=${entry.totalChanges}`,
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

  console.log('=== VRAM Activity ===');
  console.log(`vram ops touching range: ${vramState.totalOps}`);
  console.log(`vram ops changing bytes: ${vramState.changedOps}`);
  console.log(`vram changed bytes via hooks: ${vramState.changedBytes}`);
  console.log(`vram unique changed addrs: ${vramState.uniqueChangedAddrs.size}`);
  console.log(`vram final diff bytes: ${finalVramDiff.changedBytes}`);
  if (vramState.samples.length === 0) {
    console.log('hook samples: none');
  } else {
    for (const sample of vramState.samples) {
      const renderedChanges = sample.changes
        .map((change) => `${hex(change.addr)}:${hex(change.before, 2)}->${hex(change.after, 2)}`)
        .join(', ');
      console.log(`step=${sample.step} pc=${hex(sample.pc)} kind=${sample.kind} ${renderedChanges}`);
    }
  }
  if (finalVramDiff.samples.length === 0) {
    console.log('final diff samples: none');
  } else {
    for (const sample of finalVramDiff.samples) {
      console.log(`${hex(sample.addr)} ${hex(sample.before, 2)} -> ${hex(sample.after, 2)}`);
    }
  }
  console.log('');

  if (interruptEvents.length > 0) {
    console.log('=== Interrupt Trace ===');
    for (const event of interruptEvents) {
      console.log(
        `step=${event.step} type=${event.type} return=${hex(event.returnPc)} vector=${hex(event.vector)}`,
      );
    }
    console.log('');
  }

  if (missingBlocks.length > 0) {
    console.log('=== Missing Blocks ===');
    for (const entry of missingBlocks) {
      console.log(`step=${entry.step} pc=${hex(entry.pc)} mode=${entry.mode}`);
    }
    console.log('');
  }

  console.log('=== Final State ===');
  console.log(`mem[0xD00587] = ${hex(finalScanCode, 2)}`);
  console.log(`mem[0xD00080] = ${hex(finalKeyAvail, 2)} (bit3=${(finalKeyAvail >> 3) & 1})`);
  console.log(`mem[0xD141B5] = ${hex(finalKeyBuffer, 2)}`);
  console.log(`mem[0xD14091] = ${hex(finalKeyEnable, 2)}`);
  console.log(`mem[0xD177B7] = ${hex(finalDisplayDirty, 2)}`);
  console.log(`mem[0xD177BA] = ${hex(finalEventGate, 2)}`);
  console.log('');

  const reached0015e1 = (trackedPcState.get(SCHEDULER_KEY_BLOCK)?.count ?? 0) > 0;
  const reached0059c6 = (trackedPcState.get(PROCESS_KEY_ENTRY)?.count ?? 0) > 0;
  const reached03fa09 = (trackedPcState.get(KEY_PROCESSOR_ENTRY)?.count ?? 0) > 0;
  const d141b5SawNonZero = finalKeyBuffer !== 0
    || (keyBufferEntry?.changes ?? []).some((change) => change.after !== 0);
  const anyVramChanges = finalVramDiff.changedBytes > 0;

  console.log('=== Verdict ===');
  console.log(`0x0066FF bypass executed: ${yesNo(bypassState.hits > 0)} (hits=${bypassState.hits})`);
  console.log(`0x0015E1 reached:         ${yesNo(reached0015e1)} (count=${trackedPcState.get(SCHEDULER_KEY_BLOCK)?.count ?? 0})`);
  console.log(`0x0059C6 called:          ${yesNo(reached0059c6)} (count=${trackedPcState.get(PROCESS_KEY_ENTRY)?.count ?? 0})`);
  console.log(`0x03FA09 called:          ${yesNo(reached03fa09)} (count=${trackedPcState.get(KEY_PROCESSOR_ENTRY)?.count ?? 0})`);
  console.log(`D141B5 got key code:      ${yesNo(d141b5SawNonZero)} (final=${hex(finalKeyBuffer, 2)})`);
  console.log(`Any VRAM changes:         ${yesNo(anyVramChanges)} (changedBytes=${finalVramDiff.changedBytes})`);
  console.log('');

  if (reached0015e1) {
    console.log('PASS: Clearing Z at 0x0066FF lets the scheduler reach the key-handling block.');
  } else {
    console.log('PARTIAL: 0x0066FF was bypassed, but the scheduler still did not reach 0x0015E1.');
  }

  process.exitCode = reached0015e1 ? 0 : 1;
}

try {
  await main();
} catch (error) {
  console.error('Fatal error:', error.stack || error);
  process.exitCode = 1;
}
