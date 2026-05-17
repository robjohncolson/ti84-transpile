#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');
const CPU_RUNTIME_PATH = path.join(__dirname, 'cpu-runtime.js');
const PERIPHERALS_PATH = path.join(__dirname, 'peripherals.js');
const TRANSPILER_PATH = path.resolve(__dirname, '..', 'scripts', 'transpile-ti84-rom.mjs');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const HALT_PC = 0x0019B5;
const NMI_VECTOR = 0x000066;

const BOOT_MAX_STEPS = 5000;
const WAKE_STEP_BUDGET = 2000;
const NORMAL_WAKE_COUNT = 2;
const POST_PATCH_STEPS = 10000;
const MAX_LOOP_ITERATIONS = 50000;
const RESUME_SCAN_LIMIT = 64;
const MAX_RESUME_ATTEMPTS = 32;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function blockKey(pc, mode = 'adl') {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function ensureTranspiledRom() {
  if (fs.existsSync(TRANSPILED_PATH)) {
    return false;
  }

  const sourceHint = fs.existsSync(TRANSPILED_GZ_PATH)
    ? `${path.basename(TRANSPILED_GZ_PATH)} is present; `
    : '';

  console.log(`${sourceHint}${path.basename(TRANSPILED_PATH)} is missing. Running transpiler...`);
  execFileSync(process.execPath, [TRANSPILER_PATH], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
  });

  if (!fs.existsSync(TRANSPILED_PATH)) {
    throw new Error(`${path.basename(TRANSPILED_PATH)} is still missing after transpile.`);
  }

  return true;
}

function createMemory(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return mem;
}

function snapshotPllState(pll = {}) {
  return {
    configured: Boolean(pll.configured),
    delay: Math.max(0, Number(pll.delay ?? 0) | 0),
    remainingReads: Math.max(0, Number(pll.remainingReads ?? 0) | 0),
    locked: Boolean(pll.locked),
    lastWrite: Number(pll.lastWrite ?? 0) & 0xFF,
  };
}

function formatPllState(pll) {
  return [
    `configured=${pll.configured}`,
    `delay=${pll.delay}`,
    `remainingReads=${pll.remainingReads}`,
    `locked=${pll.locked}`,
    `lastWrite=${hex(pll.lastWrite, 2)}`,
  ].join(' ');
}

function syncCpuState(cpu, result) {
  const mode = result.lastMode ?? (cpu.madl ? 'adl' : 'z80');
  cpu.pc = (result.lastPc ?? cpu.pc ?? 0) & 0xFFFFFF;
  cpu.madl = mode === 'adl' ? 1 : 0;
  cpu.adl = cpu.madl === 1;
  return mode;
}

function buildBlockIndex(compiledBlocks) {
  const index = {
    adl: [],
    z80: [],
  };

  for (const key of Object.keys(compiledBlocks ?? {})) {
    const [pcText, mode = 'adl'] = key.split(':');
    const pc = Number.parseInt(pcText, 16);
    if (!Number.isInteger(pc) || !index[mode]) {
      continue;
    }
    index[mode].push(pc & 0xFFFFFF);
  }

  index.adl.sort((left, right) => left - right);
  index.z80.sort((left, right) => left - right);
  return index;
}

function findResumeTarget(compiledBlocks, blockIndex, pc, mode) {
  const normalizedPc = pc & 0xFFFFFF;
  const normalizedMode = mode ?? 'adl';

  for (let offset = 1; offset <= RESUME_SCAN_LIMIT; offset += 1) {
    const candidatePc = (normalizedPc + offset) & 0xFFFFFF;
    if (compiledBlocks[blockKey(candidatePc, normalizedMode)]) {
      return {
        pc: candidatePc,
        mode: normalizedMode,
      };
    }
  }

  for (const candidatePc of blockIndex[normalizedMode] ?? []) {
    if (candidatePc > normalizedPc) {
      return {
        pc: candidatePc,
        mode: normalizedMode,
      };
    }
  }

  return null;
}

function createPhase357Bus(createPeripheralBus, options = {}) {
  const bus = createPeripheralBus(options);
  const beforeA = typeof bus.getState === 'function' ? bus.getState() : null;
  const beforeB = typeof bus.getState === 'function' ? bus.getState() : null;
  const originalPllRefStable = Boolean(beforeA?.pll && beforeB?.pll && beforeA.pll === beforeB.pll);

  const pllState = snapshotPllState(beforeA?.pll ?? { delay: options.pllDelay ?? 2 });
  const flashState = {
    lastWrite: Number(beforeA?.flash?.lastWrite ?? 0) & 0xFF,
  };

  bus.register(0x28, {
    read() {
      if (!pllState.configured) {
        return 0x00;
      }

      if (pllState.remainingReads > 0) {
        pllState.remainingReads--;
        pllState.locked = false;
        return 0x00;
      }

      pllState.locked = true;
      return 0x04;
    },

    write(port, value) {
      const normalizedValue = Number(value) & 0xFF;
      pllState.configured = true;
      if (normalizedValue !== pllState.lastWrite) {
        pllState.remainingReads = pllState.delay;
        pllState.locked = false;
      }
      pllState.lastWrite = normalizedValue;
    },
  });

  bus.register(0x06, {
    read() {
      return pllState.locked ? 0xD4 : 0xD0;
    },

    write(port, value) {
      flashState.lastWrite = Number(value) & 0xFF;
    },
  });

  const originalGetState = typeof bus.getState === 'function' ? bus.getState.bind(bus) : null;
  bus.getState = function getState() {
    const snapshot = originalGetState ? originalGetState() : {};
    snapshot.flash = {
      ...(snapshot.flash ?? {}),
      lastWrite: flashState.lastWrite,
    };
    snapshot.pll = pllState;
    return snapshot;
  };

  bus.getMutablePllState = () => pllState;
  bus.__phase357OriginalPllRefStable = originalPllRefStable;
  return bus;
}

function uniqueHexList(events) {
  const values = [...new Set(events.map((event) => event.value & 0xFF))];
  return values.length > 0 ? values.map((value) => hex(value, 2)).join(', ') : '(none)';
}

function diffSets(left, right) {
  const onlyLeft = [];
  const onlyRight = [];

  for (const item of left) {
    if (!right.has(item)) {
      onlyLeft.push(item);
    }
  }

  for (const item of right) {
    if (!left.has(item)) {
      onlyRight.push(item);
    }
  }

  return { onlyLeft, onlyRight };
}

function sortBlockEntries(map) {
  return [...map.values()].sort((left, right) =>
    left.firstStep - right.firstStep
    || left.pc - right.pc
    || left.mode.localeCompare(right.mode)
  );
}

function printWakeSummary(wake, baselineBlocks) {
  console.log(`Wake #${wake.wakeNumber}${wake.patched ? ' (patched)' : ' (normal)'}`);
  console.log(`  termination: ${wake.termination}`);
  console.log(`  steps:       ${wake.stepsUsed}`);
  console.log(`  last pc:     ${hex(wake.lastPc)}:${wake.lastMode}`);
  console.log(`  trace count: ${wake.trace.length}`);
  console.log(`  unique:      ${wake.uniqueBlocks.size}`);
  console.log(
    `  port 0x28:   writes=${wake.port28Writes.length} [${uniqueHexList(wake.port28Writes)}] `
    + `reads=${wake.port28Reads.length} [${uniqueHexList(wake.port28Reads)}]`
  );

  if (baselineBlocks) {
    const delta = diffSets(wake.uniqueBlocks, baselineBlocks);
    console.log(`  delta vs wake #1 baseline: +${delta.onlyLeft.length} / -${delta.onlyRight.length}`);
  }

  if (wake.resumedFromMissing.length > 0) {
    console.log(`  missing-block resumes: ${wake.resumedFromMissing.length}`);
  }

  if (wake.missingBlocks.length > 0) {
    console.log(`  missing blocks seen: ${wake.missingBlocks.length}`);
  }
}

function printBlockList(title, entries) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));

  if (entries.length === 0) {
    console.log('none');
    return;
  }

  for (const entry of entries) {
    console.log(
      `  step=${String(entry.firstStep).padStart(6)} `
      + `${entry.key} firstSeen=${entry.phase}${entry.wake === null ? '' : ` wake=${entry.wake}`}`
    );
  }
}

function printTrace(title, trace) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));

  if (trace.length === 0) {
    console.log('none');
    return;
  }

  for (const item of trace) {
    console.log(
      `  ${String(item.index).padStart(4)} `
      + `step=${String(item.step).padStart(6)} `
      + `${item.key}${item.isNewVsBaseline ? '  NEW' : ''}`
    );
  }
}

function printPortEvents(title, events) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));

  if (events.length === 0) {
    console.log('none');
    return;
  }

  for (const event of events) {
    const verb = event.direction === 'read' ? 'IN ' : 'OUT';
    const arrow = event.direction === 'read' ? '->' : '<-';
    console.log(
      `  wake=${event.wake} step=${String(event.step).padStart(6)} `
      + `block=${event.block} ${verb} ${hex(event.port, 4)} ${arrow} ${hex(event.value, 2)}`
    );
  }
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error('ROM.rom is missing.');
  }

  const regeneratedTranspiledRom = ensureTranspiledRom();
  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));

  const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
  const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
  const transpiledModule = await import(pathToFileURL(TRANSPILED_PATH).href);

  const PRELIFTED_BLOCKS = normalizeBlocks(
    transpiledModule.PRELIFTED_BLOCKS
    ?? transpiledModule.default?.PRELIFTED_BLOCKS
    ?? transpiledModule.default
    ?? transpiledModule,
  );

  if (Object.keys(PRELIFTED_BLOCKS).length === 0) {
    throw new Error('Unable to locate PRELIFTED_BLOCKS in ROM.transpiled.js');
  }

  const mem = createMemory(romBytes);
  const peripherals = createPhase357Bus(createPeripheralBus, { timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  const blockIndex = buildBlockIndex(executor.compiledBlocks ?? {});

  cpu.mem = mem;
  cpu.io = peripherals;
  cpu.pc = BOOT_ENTRY;
  cpu.madl = 0;
  cpu.adl = false;
  cpu.triggerNMI = () => peripherals.triggerNMI();

  const runtime = {
    totalSteps: 0,
    currentBlockKey: null,
    currentMode: BOOT_MODE,
    currentAbsStep: 0,
    activeWake: null,
  };

  const allBlocks = new Map();
  const baselineBlocks = new Set();
  const newBlocksAfterPatch = new Map();
  const newTerritoryPortEvents = [];

  function recordGlobalBlock(pc, mode, absoluteStep, phase, wakeNumber) {
    const key = blockKey(pc, mode);
    runtime.currentBlockKey = key;
    runtime.currentMode = mode;
    runtime.currentAbsStep = absoluteStep;

    if (!allBlocks.has(key)) {
      allBlocks.set(key, {
        key,
        pc,
        mode,
        firstStep: absoluteStep,
        phase,
        wake: wakeNumber ?? null,
      });
    }
  }

  function recordPortEvent(direction, port, value) {
    const wake = runtime.activeWake;
    if (!wake || !wake.started) {
      return;
    }

    const event = {
      wake: wake.wakeNumber,
      step: runtime.currentAbsStep,
      block: runtime.currentBlockKey,
      direction,
      port: Number(port) & 0xFFFF,
      value: Number(value) & 0xFF,
    };

    wake.accessEvents.push(event);

    if (wake.patched && baselineBlocks.size > 0 && !baselineBlocks.has(runtime.currentBlockKey)) {
      newTerritoryPortEvents.push(event);
    }
  }

  cpu.onIoRead = (port, value) => recordPortEvent('read', port, value);
  cpu.onIoWrite = (port, value) => recordPortEvent('write', port, value);

  function runWake(wakeNumber, stepBudget, { patched = false } = {}) {
    const wake = {
      wakeNumber,
      patched,
      started: false,
      trace: [],
      uniqueBlocks: new Set(),
      accessEvents: [],
      missingBlocks: [],
      resumedFromMissing: [],
      stepsUsed: 0,
      termination: 'not_run',
      lastPc: cpu.pc & 0xFFFFFF,
      lastMode: cpu.madl ? 'adl' : 'z80',
      returnPc: null,
      vector: null,
      interruptStep: null,
    };

    cpu.triggerNMI();

    let remaining = stepBudget;
    let resumeAttempts = 0;
    let lastResult = null;

    while (remaining > 0) {
      const segmentBase = runtime.totalSteps;
      runtime.activeWake = wake;
      cpu.halted = false;

      const result = executor.runFrom(cpu.pc & 0xFFFFFF, cpu.madl ? 'adl' : 'z80', {
        maxSteps: remaining,
        maxLoopIterations: MAX_LOOP_ITERATIONS,
        onInterrupt(type, returnPc, vector, steps) {
          if (type === 'nmi' && !wake.started) {
            wake.started = true;
            wake.returnPc = returnPc & 0xFFFFFF;
            wake.vector = vector & 0xFFFFFF;
            wake.interruptStep = segmentBase + steps + 1;
          }
        },
        onBlock(pcValue, mode, _meta, step) {
          const normalizedPc = pcValue & 0xFFFFFF;
          const normalizedMode = mode ?? (cpu.madl ? 'adl' : 'z80');
          const absoluteStep = segmentBase + step + 1;
          const phase = patched ? `wake${wakeNumber}-patched` : `wake${wakeNumber}-normal`;
          recordGlobalBlock(normalizedPc, normalizedMode, absoluteStep, phase, wakeNumber);

          if (!wake.started) {
            return;
          }

          const key = blockKey(normalizedPc, normalizedMode);
          const isNewVsBaseline = patched && baselineBlocks.size > 0 && !baselineBlocks.has(key);

          wake.trace.push({
            index: wake.trace.length + 1,
            step: absoluteStep,
            key,
            pc: normalizedPc,
            mode: normalizedMode,
            isNewVsBaseline,
          });

          wake.uniqueBlocks.add(key);

          if (isNewVsBaseline && !newBlocksAfterPatch.has(key)) {
            newBlocksAfterPatch.set(key, {
              key,
              pc: normalizedPc,
              mode: normalizedMode,
              firstStep: absoluteStep,
              phase,
              wake: wakeNumber,
            });
          }
        },
        onMissingBlock(pcValue, mode, step) {
          const normalizedPc = pcValue & 0xFFFFFF;
          const normalizedMode = mode ?? (cpu.madl ? 'adl' : 'z80');
          wake.missingBlocks.push({
            key: blockKey(normalizedPc, normalizedMode),
            pc: normalizedPc,
            mode: normalizedMode,
            step: segmentBase + step + 1,
          });
        },
      });

      runtime.activeWake = null;
      lastResult = result;

      const used = Math.max(0, Number(result.steps ?? 0));
      runtime.totalSteps += used;
      wake.stepsUsed += used;
      remaining = Math.max(0, remaining - used);
      syncCpuState(cpu, result);

      if (result.termination !== 'missing_block') {
        wake.termination = remaining === 0 && result.termination === 'max_steps'
          ? 'step_budget_exhausted'
          : result.termination;
        break;
      }

      const resume = findResumeTarget(
        executor.compiledBlocks ?? {},
        blockIndex,
        cpu.pc,
        cpu.madl ? 'adl' : 'z80',
      );

      if (!resume || resumeAttempts >= MAX_RESUME_ATTEMPTS) {
        wake.termination = 'missing_block';
        break;
      }

      wake.resumedFromMissing.push({
        from: blockKey(cpu.pc, cpu.madl ? 'adl' : 'z80'),
        to: blockKey(resume.pc, resume.mode),
      });

      cpu.halted = false;
      cpu.pc = resume.pc;
      cpu.madl = resume.mode === 'adl' ? 1 : 0;
      cpu.adl = cpu.madl === 1;
      resumeAttempts += 1;
    }

    if (!lastResult) {
      wake.termination = 'not_run';
    }

    wake.lastPc = cpu.pc & 0xFFFFFF;
    wake.lastMode = cpu.madl ? 'adl' : 'z80';
    wake.port28Reads = wake.accessEvents.filter((event) => event.port === 0x28 && event.direction === 'read');
    wake.port28Writes = wake.accessEvents.filter((event) => event.port === 0x28 && event.direction === 'write');
    return wake;
  }

  const bootResult = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
    onBlock(pcValue, mode, _meta, step) {
      const normalizedPc = pcValue & 0xFFFFFF;
      const normalizedMode = mode ?? BOOT_MODE;
      recordGlobalBlock(normalizedPc, normalizedMode, runtime.totalSteps + step + 1, 'boot', null);
    },
  });

  runtime.totalSteps += Math.max(0, Number(bootResult.steps ?? 0));
  syncCpuState(cpu, bootResult);

  if (bootResult.termination !== 'halt') {
    throw new Error(
      `Boot did not reach HALT within ${BOOT_MAX_STEPS} steps `
      + `(termination=${bootResult.termination}, lastPc=${hex(bootResult.lastPc)}:${bootResult.lastMode ?? BOOT_MODE})`
    );
  }

  const normalWakes = [];
  for (let wakeNumber = 1; wakeNumber <= NORMAL_WAKE_COUNT; wakeNumber += 1) {
    const wake = runWake(wakeNumber, WAKE_STEP_BUDGET, { patched: false });
    normalWakes.push(wake);
    if (wakeNumber === 1) {
      for (const key of wake.uniqueBlocks) {
        baselineBlocks.add(key);
      }
    }
    if (wake.termination !== 'halt') {
      break;
    }
  }

  const wake2Delta = normalWakes[1]
    ? diffSets(normalWakes[1].uniqueBlocks, baselineBlocks)
    : { onlyLeft: [], onlyRight: [] };

  const originalGetStateWasLive = peripherals.__phase357OriginalPllRefStable;
  const livePll = peripherals.getState().pll;
  const probeGetStateIsLive = livePll === peripherals.getState().pll;
  const prePatchState = snapshotPllState(livePll);

  livePll.configured = true;
  livePll.locked = false;
  livePll.remainingReads = 999;

  const postPatchState = snapshotPllState(livePll);

  const postPatchWakes = [];
  let remainingPostPatchSteps = POST_PATCH_STEPS;
  let wakeNumber = 3;

  while (remainingPostPatchSteps > 0) {
    const wake = runWake(wakeNumber, remainingPostPatchSteps, { patched: true });
    postPatchWakes.push(wake);
    remainingPostPatchSteps = Math.max(0, remainingPostPatchSteps - wake.stepsUsed);

    if (wake.termination !== 'halt') {
      break;
    }

    wakeNumber += 1;
  }

  const firstPatchedWake = postPatchWakes[0] ?? null;
  const firstPatchedWakePortEvents = firstPatchedWake
    ? firstPatchedWake.accessEvents.filter((event) => !baselineBlocks.has(event.block))
    : [];

  const allVisitedEntries = sortBlockEntries(allBlocks);
  const newBlockEntries = sortBlockEntries(newBlocksAfterPatch);

  console.log('Phase 357: port 0x28 escape probe');
  console.log('=================================');
  console.log(`Boot entry:                ${hex(BOOT_ENTRY)}:${BOOT_MODE}`);
  console.log(`Expected HALT PC:          ${hex(HALT_PC)}:${BOOT_MODE}`);
  console.log(`NMI vector:                ${hex(NMI_VECTOR)}:adl`);
  console.log(`Boot step budget:          ${BOOT_MAX_STEPS}`);
  console.log(`Normal wake step budget:   ${WAKE_STEP_BUDGET}`);
  console.log(`Post-patch step budget:    ${POST_PATCH_STEPS}`);
  console.log(`Peripheral config:         timerInterrupt=false`);
  console.log(`Transpiled ROM:            ${regeneratedTranspiledRom ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`);
  console.log('');
  console.log(`Original bus.getState().pll live ref: ${originalGetStateWasLive ? 'YES' : 'NO (snapshot copy)'}`);
  console.log(`Probe bus.getState().pll live ref:    ${probeGetStateIsLive ? 'YES' : 'NO'}`);

  console.log('\nBoot');
  console.log('----');
  console.log(`Termination: ${bootResult.termination}`);
  console.log(`Steps:       ${bootResult.steps}`);
  console.log(`HALT PC:     ${hex(bootResult.lastPc)}:${bootResult.lastMode ?? BOOT_MODE}`);

  console.log('\nNormal wakes');
  console.log('------------');
  for (const wake of normalWakes) {
    printWakeSummary(wake, wake.wakeNumber === 1 ? null : baselineBlocks);
  }
  console.log(`Wake #1 baseline block count: ${baselineBlocks.size} (session 356 expected 286)`);
  if (normalWakes[1]) {
    console.log(
      `Wake #2 delta vs wake #1 baseline: +${wake2Delta.onlyLeft.length} / -${wake2Delta.onlyRight.length}`
    );
  }

  console.log('\nPatch');
  console.log('-----');
  console.log(`Applied before wake #3`);
  console.log(`PLL before patch: ${formatPllState(prePatchState)}`);
  console.log(`PLL after patch:  ${formatPllState(postPatchState)}`);

  console.log('\nPost-patch wakes');
  console.log('----------------');
  for (const wake of postPatchWakes) {
    printWakeSummary(wake, baselineBlocks);
  }
  console.log(`Remaining post-patch budget: ${remainingPostPatchSteps}`);
  console.log(`All unique blocks visited:   ${allVisitedEntries.length}`);
  console.log(`New blocks vs baseline:      ${newBlockEntries.length}`);

  printBlockList('All unique blocks visited', allVisitedEntries);
  printBlockList('New blocks not in the wake #1 / session-356 baseline', newBlockEntries);
  printTrace(
    'First NMI wake after patch: full block sequence',
    firstPatchedWake ? firstPatchedWake.trace : [],
  );
  printPortEvents(
    'First NMI wake after patch: port reads/writes in new territory',
    firstPatchedWakePortEvents,
  );
  printPortEvents(
    'All post-patch port reads/writes in new territory',
    newTerritoryPortEvents,
  );

  console.log('\n--- probe complete ---');
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
}
