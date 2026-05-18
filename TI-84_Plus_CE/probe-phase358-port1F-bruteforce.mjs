#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');
const TRANSPILER_PATH = path.resolve(__dirname, '..', 'scripts', 'transpile-ti84-rom.mjs');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const NMI_VECTOR = 0x000066;
const HALT_PC = 0x0019B5;
const GATE_PC = 0x000D82;
const GATE_FALLTHROUGH_PC = 0x000DAE;
const GATE_A_ADDR = 0xD02AD9;

const BOOT_MAX_STEPS = 5000;
const TOTAL_STEP_BUDGET = 50000;
const MAX_LOOP_ITERATIONS = 50000;
const RESUME_SCAN_LIMIT = 64;
const MAX_RESUME_ATTEMPTS = 64;
const MAX_WAKES = 4096;
const BASELINE_VALUE = 0xFF;
const TEST_VALUES = [0x00, 0x01, 0x02, 0x7E, 0x7F, 0x80, 0xFE, 0xFF];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function normalizePort(port) {
  return Number(port) & 0xFFFF;
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
    delay: Math.max(0, Number(pll.delay ?? 2) | 0),
    remainingReads: Math.max(0, Number(pll.remainingReads ?? 0) | 0),
    locked: Boolean(pll.locked),
    lastWrite: Number(pll.lastWrite ?? 0) & 0xFF,
  };
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

function sortBlockEntries(map) {
  return [...map.values()].sort((left, right) =>
    left.firstStep - right.firstStep
    || left.pc - right.pc
    || left.mode.localeCompare(right.mode)
  );
}

function uniqueSortedValues(values) {
  return [...new Set(values)].sort((left, right) => left - right);
}

function formatHexList(values, width = 2) {
  const unique = uniqueSortedValues(values);
  return unique.length > 0 ? unique.map((value) => hex(value, width)).join(', ') : 'n/a';
}

function formatBlockList(entries) {
  if (entries.length === 0) {
    return 'none';
  }

  return entries.map((entry) => `${hex(entry.pc)}:${entry.mode}`).join(', ');
}

function createProbeBus(port1fValue, options = {}) {
  const bus = createPeripheralBus(options);
  const initialState = typeof bus.getState === 'function' ? bus.getState() : {};
  const pllState = snapshotPllState(initialState?.pll ?? {});
  const flashState = {
    lastWrite: Number(initialState?.flash?.lastWrite ?? 0) & 0xFF,
  };

  // Preserve the known-good phase 357 probe behavior while varying only port 0x1F.
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

    write(_port, value) {
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

    write(_port, value) {
      flashState.lastWrite = Number(value) & 0xFF;
    },
  });

  const originalRead = bus.read.bind(bus);
  bus.read = (port) => {
    if (normalizePort(port) === 0x001F) {
      return Number(port1fValue) & 0xFF;
    }

    return originalRead(port);
  };

  return bus;
}

function installGateAWatch(cpu, runtime, gateReads) {
  const originalRead8 = cpu.read8.bind(cpu);

  cpu.read8 = (addr) => {
    const value = originalRead8(addr);
    if (runtime.currentBlockPc === GATE_PC && ((Number(addr) & 0xFFFFFF) === GATE_A_ADDR)) {
      const aValue = Number(value) & 0xFF;
      runtime.lastGateAValue = aValue;
      gateReads.push({
        step: runtime.currentAbsStep,
        wake: runtime.activeWake?.wakeNumber ?? null,
        value: aValue,
      });
    }
    return value;
  };

  return () => {
    cpu.read8 = originalRead8;
  };
}

function makeStopSummary(result) {
  return `${result.stopReason}@${hex(result.finalPc)}:${result.finalMode}`;
}

function buildSignature(result) {
  const blockSignature = [...result.allBlocks.keys()].sort().join('|');
  const gateTargets = uniqueSortedValues(result.gateTransitions.map((event) => event.toPc))
    .map((value) => hex(value))
    .join('|');

  return [
    blockSignature,
    result.stopReason,
    String(result.finalPc),
    result.finalMode,
    String(result.firstEscapeTransition?.toPc ?? -1),
    gateTargets,
  ].join('::');
}

function analyzeResult(result, baselineSet) {
  const newBlockEntries = sortBlockEntries(new Map(
    [...result.allBlocks.entries()].filter(([key]) => !baselineSet.has(key)),
  ));
  const furthestNewBlock = newBlockEntries.reduce((best, entry) => {
    if (!best || entry.pc > best.pc || (entry.pc === best.pc && entry.mode > best.mode)) {
      return entry;
    }
    return best;
  }, null);

  return {
    ...result,
    escapedPastGate: Boolean(result.firstEscapeTransition),
    gateAValues: uniqueSortedValues(result.gateReads.map((entry) => entry.value)),
    newBlockEntries,
    newBlockCount: newBlockEntries.length,
    furthestNewBlock,
    signature: buildSignature(result),
  };
}

function runPortValue(portValue, blocks, romBytes) {
  const mem = createMemory(romBytes);
  const peripherals = createProbeBus(portValue, { timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;
  const blockIndex = buildBlockIndex(executor.compiledBlocks ?? {});

  cpu.mem = mem;
  cpu.io = peripherals;
  cpu.pc = BOOT_ENTRY;
  cpu.madl = 0;
  cpu.adl = false;

  const runtime = {
    totalSteps: 0,
    currentBlockPc: null,
    currentBlockMode: null,
    currentAbsStep: 0,
    activeWake: null,
    previousBlockPc: null,
    previousBlockMode: null,
    lastGateAValue: null,
  };

  const allBlocks = new Map();
  const gateEntries = [];
  const gateReads = [];
  const gateTransitions = [];
  const wakeHistory = [];
  const missingBlocks = [];

  let firstEscapeTransition = null;

  const restoreRead8 = installGateAWatch(cpu, runtime, gateReads);

  function recordGlobalBlock(pc, mode, absoluteStep, phase, wakeNumber) {
    const key = blockKey(pc, mode);

    if (runtime.previousBlockPc === GATE_PC) {
      const transition = {
        step: absoluteStep,
        wake: wakeNumber ?? null,
        fromPc: runtime.previousBlockPc,
        fromMode: runtime.previousBlockMode,
        toPc: pc,
        toMode: mode,
        toKey: key,
        aValue: runtime.lastGateAValue,
      };
      gateTransitions.push(transition);
      if (!firstEscapeTransition && pc !== HALT_PC) {
        firstEscapeTransition = transition;
      }
    }

    runtime.currentBlockPc = pc;
    runtime.currentBlockMode = mode;
    runtime.currentAbsStep = absoluteStep;

    if (pc === GATE_PC) {
      const gateAValue = mem[GATE_A_ADDR] & 0xFF;
      runtime.lastGateAValue = gateAValue;
      gateEntries.push({
        step: absoluteStep,
        wake: wakeNumber ?? null,
        mode,
        value: gateAValue,
      });
    }

    if (!allBlocks.has(key)) {
      const meta = blocks[key];
      allBlocks.set(key, {
        key,
        pc,
        mode,
        firstStep: absoluteStep,
        phase,
        wake: wakeNumber ?? null,
        firstInstruction: meta?.instructions?.[0]?.dasm ?? null,
      });
    }

    runtime.previousBlockPc = pc;
    runtime.previousBlockMode = mode;
  }

  function runWake(wakeNumber, stepBudget) {
    const wake = {
      wakeNumber,
      stepsUsed: 0,
      termination: 'not_run',
      loopsForced: 0,
      started: false,
      lastPc: cpu.pc & 0xFFFFFF,
      lastMode: cpu.madl ? 'adl' : 'z80',
      missingBlocks: [],
      resumedFromMissing: [],
    };

    peripherals.triggerNMI();

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
        onInterrupt(type) {
          if (type === 'nmi') {
            wake.started = true;
          }
        },
        onBlock(pcValue, mode, _meta, step) {
          const normalizedPc = pcValue & 0xFFFFFF;
          const normalizedMode = mode ?? (cpu.madl ? 'adl' : 'z80');
          const absoluteStep = segmentBase + step + 1;
          recordGlobalBlock(normalizedPc, normalizedMode, absoluteStep, `wake${wakeNumber}`, wakeNumber);
        },
        onMissingBlock(pcValue, mode, step) {
          const normalizedPc = pcValue & 0xFFFFFF;
          const normalizedMode = mode ?? (cpu.madl ? 'adl' : 'z80');
          const miss = {
            step: segmentBase + step + 1,
            key: blockKey(normalizedPc, normalizedMode),
            pc: normalizedPc,
            mode: normalizedMode,
            wake: wakeNumber,
          };
          wake.missingBlocks.push(miss);
          missingBlocks.push(miss);
        },
      });

      runtime.activeWake = null;
      lastResult = result;

      const used = Math.max(0, Number(result.steps ?? 0));
      runtime.totalSteps += used;
      wake.stepsUsed += used;
      wake.loopsForced += Math.max(0, Number(result.loopsForced ?? 0));
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
    wakeHistory.push(wake);
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
    onMissingBlock(pcValue, mode, step) {
      const normalizedPc = pcValue & 0xFFFFFF;
      const normalizedMode = mode ?? BOOT_MODE;
      missingBlocks.push({
        step: runtime.totalSteps + step + 1,
        key: blockKey(normalizedPc, normalizedMode),
        pc: normalizedPc,
        mode: normalizedMode,
        wake: null,
      });
    },
  });

  runtime.totalSteps += Math.max(0, Number(bootResult.steps ?? 0));
  syncCpuState(cpu, bootResult);

  let stopReason = bootResult.termination;

  if (bootResult.termination === 'halt') {
    let wakeNumber = 1;
    while (runtime.totalSteps < TOTAL_STEP_BUDGET && wakeNumber <= MAX_WAKES) {
      const wake = runWake(wakeNumber, TOTAL_STEP_BUDGET - runtime.totalSteps);
      stopReason = wake.termination;
      if (wake.termination !== 'halt') {
        break;
      }
      wakeNumber += 1;
    }

    if (runtime.totalSteps >= TOTAL_STEP_BUDGET && stopReason === 'halt') {
      stopReason = 'step_budget_exhausted';
    }
  }

  restoreRead8();

  return {
    portValue,
    totalSteps: runtime.totalSteps,
    stopReason,
    finalPc: cpu.pc & 0xFFFFFF,
    finalMode: cpu.madl ? 'adl' : 'z80',
    bootResult: {
      termination: bootResult.termination,
      steps: Math.max(0, Number(bootResult.steps ?? 0)),
      lastPc: (bootResult.lastPc ?? cpu.pc ?? 0) & 0xFFFFFF,
      lastMode: bootResult.lastMode ?? (cpu.madl ? 'adl' : 'z80'),
    },
    allBlocks,
    gateEntries,
    gateReads: gateReads.length > 0 ? gateReads : gateEntries,
    gateTransitions,
    firstEscapeTransition,
    wakeHistory,
    missingBlocks,
  };
}

function printResultTable(results) {
  console.log('Results Table');
  console.log('-------------');
  console.log('value  blocks  new  escape  A@gate           furthest_new       stop');
  for (const result of results) {
    const furthest = result.furthestNewBlock
      ? `${hex(result.furthestNewBlock.pc)}:${result.furthestNewBlock.mode}`
      : 'n/a';
    console.log(
      `${hex(result.portValue, 2).padEnd(6)} `
      + `${String(result.allBlocks.size).padStart(6)} `
      + `${String(result.newBlockCount).padStart(4)} `
      + `${(result.escapedPastGate ? 'YES' : 'NO ').padEnd(7)} `
      + `${formatHexList(result.gateAValues, 2).padEnd(16)} `
      + `${furthest.padEnd(18)} `
      + `${makeStopSummary(result)}`,
    );
  }
  console.log('');
}

function printEscapeReport(results) {
  const escaping = results.filter((result) => result.escapedPastGate);

  console.log('Escaping Values');
  console.log('---------------');

  if (escaping.length === 0) {
    console.log('none');
    console.log('');
    return;
  }

  for (const result of escaping) {
    const firstTarget = result.firstEscapeTransition
      ? `${hex(result.firstEscapeTransition.toPc)}:${result.firstEscapeTransition.toMode}`
      : 'n/a';
    const furthest = result.furthestNewBlock
      ? `${hex(result.furthestNewBlock.pc)}:${result.furthestNewBlock.mode}`
      : 'n/a';

    console.log(
      `${hex(result.portValue, 2)} escaped via ${firstTarget}`
      + ` at step ${result.firstEscapeTransition?.step ?? 'n/a'}`
      + ` with A=${formatHexList(result.gateAValues, 2)}`
      + ` and ${result.newBlockCount} new block(s) vs ${hex(BASELINE_VALUE, 2)}.`,
    );
    console.log(`  Furthest new block: ${furthest}`);
    console.log(`  New blocks: ${formatBlockList(result.newBlockEntries)}`);
  }
  console.log('');
}

function printEquivalentOutcomeGroups(results) {
  const groups = new Map();

  for (const result of results) {
    if (!groups.has(result.signature)) {
      groups.set(result.signature, []);
    }
    groups.get(result.signature).push(result.portValue);
  }

  console.log('Equivalent Outcomes');
  console.log('-------------------');
  for (const [signature, values] of groups.entries()) {
    const sample = results.find((result) => result.signature === signature);
    console.log(
      `${values.map((value) => hex(value, 2)).join(', ')}`
      + ` -> blocks=${sample?.allBlocks.size ?? 'n/a'}`
      + ` escape=${sample?.escapedPastGate ? 'YES' : 'NO'}`
      + ` stop=${sample ? makeStopSummary(sample) : 'n/a'}`,
    );
  }
  console.log('');
}

function printConclusion(results, baselineResult) {
  const escaping = results.filter((result) => result.escapedPastGate);

  console.log('Conclusion');
  console.log('----------');
  console.log(
    `${hex(BASELINE_VALUE, 2)} stays on the HALT path from ${hex(GATE_PC)}`
    + ` to ${hex(HALT_PC)} and reaches ${baselineResult.allBlocks.size} unique blocks.`,
  );

  if (escaping.length === 0) {
    console.log(`No tested port 0x1F override escaped past ${hex(GATE_PC)}.`);
    console.log('');
    return;
  }

  console.log(
    `Values that escape past ${hex(GATE_PC)}: ${escaping.map((result) => hex(result.portValue, 2)).join(', ')}.`
  );

  const bestBlockCount = Math.max(...results.map((result) => result.allBlocks.size));
  const bestResults = results.filter((result) => result.allBlocks.size === bestBlockCount);
  console.log(
    `Best block count: ${bestBlockCount}`
    + ` via ${bestResults.map((result) => hex(result.portValue, 2)).join(', ')}.`
  );
  console.log('');
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error('ROM.rom is missing.');
  }

  const regeneratedTranspiledRom = ensureTranspiledRom();
  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));
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

  const rawResults = new Map();
  rawResults.set(BASELINE_VALUE, runPortValue(BASELINE_VALUE, PRELIFTED_BLOCKS, romBytes));
  for (const portValue of TEST_VALUES) {
    if (!rawResults.has(portValue)) {
      rawResults.set(portValue, runPortValue(portValue, PRELIFTED_BLOCKS, romBytes));
    }
  }

  const baselineResult = rawResults.get(BASELINE_VALUE);
  const baselineSet = new Set(baselineResult.allBlocks.keys());
  const results = TEST_VALUES.map((portValue) => analyzeResult(rawResults.get(portValue), baselineSet));

  console.log('Phase 358: port 0x1F brute-force sweep');
  console.log('======================================');
  console.log(`ROM:                 ${ROM_PATH}`);
  console.log(`Transpiled ROM:      ${regeneratedTranspiledRom ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`);
  console.log(`Boot config:         ${hex(BOOT_ENTRY)}:${BOOT_MODE} bootSteps=${BOOT_MAX_STEPS}`);
  console.log(`Wake config:         NMI@${hex(NMI_VECTOR)} totalBudget=${TOTAL_STEP_BUDGET.toLocaleString()} loopCap=${MAX_LOOP_ITERATIONS.toLocaleString()}`);
  console.log(`Probe override:      wrap bus.read() for port 0x1F only`);
  console.log(`Gate block:          ${hex(GATE_PC)} -> ${hex(GATE_FALLTHROUGH_PC)} on carry, ${hex(HALT_PC)} on JP NC`);
  console.log(`A source at gate:    ${hex(GATE_A_ADDR)}`);
  console.log(`Test values:         ${TEST_VALUES.map((value) => hex(value, 2)).join(', ')}`);
  console.log('');

  printResultTable(results);
  printEscapeReport(results);
  printEquivalentOutcomeGroups(results);
  printConclusion(results, analyzeResult(baselineResult, baselineSet));

  console.log('--- probe complete ---');
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
}
