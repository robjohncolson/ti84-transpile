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
const HALT_PC = 0x0019B5;
const NMI_VECTOR = 0x000066;
const GATE_PC = 0x000D82;
const GATE_MEM_ADDR = 0xD02AD9;

const BOOT_MAX_STEPS = 5000;
const TOTAL_STEP_BUDGET = 50000;
const MAX_LOOP_ITERATIONS = 50000;
const MAX_RESUME_ATTEMPTS = 64;
const RESUME_SCAN_LIMIT = 64;
const MAX_WAKES = 4096;
const BASELINE_VALUE = 0xFF;
const PORT_VALUES = [0x00, 0x01, 0x02, 0x7F, 0x80, 0xFE, 0xFF];
const NEW_BLOCK_TRACE_LIMIT = 20;

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
  return unique.length > 0 ? unique.map((value) => hex(value, width)).join(', ') : '(none)';
}

function createPhase358Bus(port1fValue, options = {}) {
  const bus = createPeripheralBus(options);
  const initialState = typeof bus.getState === 'function' ? bus.getState() : {};
  const pllState = snapshotPllState(initialState?.pll ?? {});
  const flashState = {
    lastWrite: Number(initialState?.flash?.lastWrite ?? 0) & 0xFF,
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

  bus.register(0x1F, {
    read() {
      return port1fValue;
    },

    write() {},
  });

  return bus;
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
    result.finalMode,
    String(result.finalPc),
    String(result.firstEscapeTransition?.toPc ?? -1),
    gateTargets,
  ].join('::');
}

function describeStopAfterEscape(result) {
  if (!result.firstEscapeTransition) {
    return 'did not escape 0x000D82';
  }

  for (const wake of result.wakeHistory) {
    if (wake.endStep < result.firstEscapeTransition.step) {
      continue;
    }

    if (wake.termination === 'halt') {
      return `halt at ${hex(wake.lastPc)}:${wake.lastMode} on wake #${wake.wakeNumber}`;
    }

    if (wake.loopsForced > 0) {
      return `loop pressure on wake #${wake.wakeNumber} (forced=${wake.loopsForced}, term=${wake.termination}, last=${hex(wake.lastPc)}:${wake.lastMode})`;
    }
  }

  if (result.stopReason === 'step_budget_exhausted') {
    return `no halt within ${TOTAL_STEP_BUDGET.toLocaleString()} steps`;
  }

  return `${result.stopReason} at ${hex(result.finalPc)}:${result.finalMode}`;
}

function findFirstWakeAfterEscape(result) {
  if (!result.firstEscapeTransition) {
    return null;
  }
  return result.wakeHistory.find((wake) => wake.endStep >= result.firstEscapeTransition.step) ?? null;
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
    newBlockEntries,
    newBlockCount: newBlockEntries.length,
    furthestNewBlock,
    signature: buildSignature(result),
  };
}

function runPortValue(portValue, blocks, romBytes) {
  const mem = createMemory(romBytes);
  const peripherals = createPhase358Bus(portValue, { timerInterrupt: false });
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
    currentBlockKey: null,
    currentAbsStep: 0,
    activeWake: null,
    previousBlockKey: null,
    lastGateMemValue: null,
  };

  const allBlocks = new Map();
  const gateHits = [];
  const gateTransitions = [];
  const portEvents = [];
  const wakeHistory = [];
  const missingBlocks = [];

  let firstEscapeTransition = null;

  function recordGlobalBlock(pc, mode, absoluteStep, phase, wakeNumber) {
    const key = blockKey(pc, mode);

    if (runtime.previousBlockKey) {
      const previous = allBlocks.get(runtime.previousBlockKey);
      if (previous?.pc === GATE_PC) {
        const transition = {
          step: absoluteStep,
          wake: wakeNumber ?? null,
          from: runtime.previousBlockKey,
          to: key,
          toPc: pc,
          toMode: mode,
          d02ad9: runtime.lastGateMemValue,
        };
        gateTransitions.push(transition);
        if (!firstEscapeTransition && pc !== HALT_PC && key !== runtime.previousBlockKey) {
          firstEscapeTransition = transition;
        }
      }
    }

    runtime.currentBlockKey = key;
    runtime.currentAbsStep = absoluteStep;

    if (pc === GATE_PC) {
      runtime.lastGateMemValue = mem[GATE_MEM_ADDR] & 0xFF;
      gateHits.push({
        step: absoluteStep,
        wake: wakeNumber ?? null,
        mode,
        d02ad9: runtime.lastGateMemValue,
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

    runtime.previousBlockKey = key;
  }

  function recordPortEvent(direction, port, value) {
    portEvents.push({
      wake: runtime.activeWake?.wakeNumber ?? null,
      step: runtime.currentAbsStep,
      block: runtime.currentBlockKey,
      direction,
      port: Number(port) & 0xFFFF,
      value: Number(value) & 0xFF,
    });
  }

  cpu.onIoRead = (port, value) => recordPortEvent('read', port, value);
  cpu.onIoWrite = (port, value) => recordPortEvent('write', port, value);

  function runWake(wakeNumber, stepBudget) {
    const wake = {
      wakeNumber,
      startStep: runtime.totalSteps + 1,
      endStep: runtime.totalSteps,
      stepsUsed: 0,
      started: false,
      trace: [],
      uniqueBlocks: new Set(),
      termination: 'not_run',
      loopsForced: 0,
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
        onInterrupt(type, _returnPc, _vector, _steps) {
          if (type === 'nmi') {
            wake.started = true;
          }
        },
        onBlock(pcValue, mode, _meta, step) {
          const normalizedPc = pcValue & 0xFFFFFF;
          const normalizedMode = mode ?? (cpu.madl ? 'adl' : 'z80');
          const absoluteStep = segmentBase + step + 1;

          recordGlobalBlock(normalizedPc, normalizedMode, absoluteStep, `wake${wakeNumber}`, wakeNumber);

          if (!wake.started) {
            return;
          }

          const key = blockKey(normalizedPc, normalizedMode);
          wake.trace.push({
            step: absoluteStep,
            key,
            pc: normalizedPc,
            mode: normalizedMode,
          });
          wake.uniqueBlocks.add(key);
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
      wake.endStep = runtime.totalSteps;
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

  const firstWakeAfterEscape = findFirstWakeAfterEscape({
    firstEscapeTransition,
    wakeHistory,
  });

  return {
    portValue,
    bootResult: {
      termination: bootResult.termination,
      steps: Math.max(0, Number(bootResult.steps ?? 0)),
      lastPc: (bootResult.lastPc ?? cpu.pc ?? 0) & 0xFFFFFF,
      lastMode: bootResult.lastMode ?? (cpu.madl ? 'adl' : 'z80'),
    },
    totalSteps: runtime.totalSteps,
    allBlocks,
    gateHits,
    gateTransitions,
    firstEscapeTransition,
    firstWakeAfterEscape,
    portEvents,
    wakeHistory,
    missingBlocks,
    stopReason,
    finalPc: cpu.pc & 0xFFFFFF,
    finalMode: cpu.madl ? 'adl' : 'z80',
    gateMemValues: uniqueSortedValues(gateHits.map((hit) => hit.d02ad9)),
  };
}

function printResultTable(results) {
  console.log('Results Table');
  console.log('-------------');
  console.log('port   blocks  new  escaped  furthest_new       stop');
  for (const result of results) {
    const furthest = result.furthestNewBlock ? `${hex(result.furthestNewBlock.pc)}:${result.furthestNewBlock.mode}` : 'n/a';
    console.log(
      `${hex(result.portValue, 2).padEnd(6)} `
      + `${String(result.allBlocks.size).padStart(6)} `
      + `${String(result.newBlockCount).padStart(4)} `
      + `${(result.firstEscapeTransition ? 'YES' : 'NO ').padEnd(8)} `
      + `${furthest.padEnd(18)} `
      + `${makeStopSummary(result)}`,
    );
  }
  console.log('');
}

function printGateObservations(results) {
  console.log('Gate Observations');
  console.log('-----------------');
  for (const result of results) {
    const targets = uniqueSortedValues(result.gateTransitions.map((event) => event.toPc));
    console.log(
      `${hex(result.portValue, 2)} `
      + `D02AD9=[${formatHexList(result.gateMemValues, 2)}] `
      + `hits=${result.gateHits.length} `
      + `targets=[${targets.length > 0 ? targets.map((value) => hex(value)).join(', ') : '(none)'}]`,
    );
  }
  console.log('');
}

function printIdenticalGroups(results) {
  const groups = new Map();

  for (const result of results) {
    if (!groups.has(result.signature)) {
      groups.set(result.signature, []);
    }
    groups.get(result.signature).push(result);
  }

  console.log('Equivalent Outcomes');
  console.log('-------------------');
  for (const group of groups.values()) {
    const label = group.map((result) => hex(result.portValue, 2)).join(', ');
    const sample = group[0];
    console.log(
      `${label} -> blocks=${sample.allBlocks.size} escaped=${sample.firstEscapeTransition ? 'YES' : 'NO'} stop=${makeStopSummary(sample)}`,
    );
  }
  console.log('');

  return groups;
}

function printBestTrace(bestResult, baselineSet, tiedBestValues) {
  const newTerritoryPortEvents = bestResult.portEvents.filter((event) => event.block && !baselineSet.has(event.block));
  const firstNewBlocks = bestResult.newBlockEntries.slice(0, NEW_BLOCK_TRACE_LIMIT);
  const stopAfterEscape = describeStopAfterEscape(bestResult);

  console.log('Best Value Trace');
  console.log('----------------');
  console.log(`Best value:            ${hex(bestResult.portValue, 2)}`);
  console.log(`Tied best values:      ${tiedBestValues.map((value) => hex(value, 2)).join(', ')}`);
  console.log(`Unique blocks:         ${bestResult.allBlocks.size}`);
  console.log(`New vs 0xFF baseline:  ${bestResult.newBlockCount}`);
  console.log(`Escaped 0x000D82:      ${bestResult.firstEscapeTransition ? 'YES' : 'NO'}`);
  console.log(`Gate D02AD9 values:    ${formatHexList(bestResult.gateMemValues, 2)}`);
  console.log(`Next stop after gate:  ${stopAfterEscape}`);
  if (bestResult.firstEscapeTransition) {
    console.log(
      `First escape target:   step=${bestResult.firstEscapeTransition.step} `
      + `wake=${bestResult.firstEscapeTransition.wake ?? 'n/a'} `
      + `to=${bestResult.firstEscapeTransition.to} `
      + `D02AD9=${hex(bestResult.firstEscapeTransition.d02ad9, 2)}`,
    );
  }
  console.log('');

  console.log(`First ${NEW_BLOCK_TRACE_LIMIT} new blocks vs 0xFF`);
  console.log('--------------------------------');
  if (firstNewBlocks.length === 0) {
    console.log('none');
  } else {
    for (const entry of firstNewBlocks) {
      console.log(
        `  step=${String(entry.firstStep).padStart(6)} `
        + `${entry.key} `
        + `${entry.firstInstruction ?? ''}`.trimEnd(),
      );
    }
  }
  console.log('');

  console.log('Port I/O in new territory');
  console.log('-------------------------');
  if (newTerritoryPortEvents.length === 0) {
    console.log('none');
  } else {
    for (const event of newTerritoryPortEvents) {
      console.log(
        `  wake=${String(event.wake ?? 0).padStart(3)} `
        + `step=${String(event.step).padStart(6)} `
        + `block=${event.block} `
        + `${event.direction === 'read' ? 'IN ' : 'OUT'} `
        + `${hex(event.port, 4)} `
        + `${event.direction === 'read' ? '->' : '<-'} `
        + `${hex(event.value, 2)}`,
      );
    }
  }
  console.log('');
}

function printRecommendation(results, baselineResult, bestResults) {
  const nonBaselineResults = results.filter((result) => result.portValue !== BASELINE_VALUE);
  const nonBaselineSame = new Set(nonBaselineResults.map((result) => result.signature)).size === 1;
  const bestValues = bestResults.map((result) => result.portValue);
  const baselineBlocks = baselineResult.allBlocks.size;
  const bestBlocks = bestResults[0].allBlocks.size;

  console.log('Recommendation');
  console.log('--------------');

  if (
    nonBaselineResults.length > 0
    && nonBaselineSame
    && bestValues.length === nonBaselineResults.length
    && baselineResult.firstEscapeTransition === null
    && nonBaselineResults.every((result) => result.firstEscapeTransition !== null)
    && nonBaselineResults.every((result) => result.gateMemValues.length === 1 && result.gateMemValues[0] === 0x00)
  ) {
    console.log(
      `Return ${hex(0x00, 2)} on port 0x1F. All non-${hex(BASELINE_VALUE, 2)} test values produced the same escaped execution shape `
      + `(${bestBlocks} blocks vs ${baselineBlocks} for ${hex(BASELINE_VALUE, 2)}), and D02AD9 stayed at ${hex(0x00, 2)} at the gate.`,
    );
    console.log(`0x00 is the simplest safe stub because INC -> ${hex(0x01, 2)} forces carry without depending on wraparound edge cases.`);
    console.log('');
    return;
  }

  if (bestValues.length === 1) {
    console.log(
      `Return ${hex(bestValues[0], 2)} on port 0x1F. It produced the strongest result (${bestBlocks} blocks) `
      + `while ${hex(BASELINE_VALUE, 2)} stayed on the non-escape path.`,
    );
    console.log('');
    return;
  }

  console.log(
    `Best-performing values were ${bestValues.map((value) => hex(value, 2)).join(', ')} `
    + `with ${bestBlocks} blocks, versus ${baselineBlocks} for ${hex(BASELINE_VALUE, 2)}.`,
  );
  console.log(`If a single placeholder is needed in peripherals.js, prefer ${hex(0x00, 2)} as the lowest stable non-wraparound value.`);
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
  for (const portValue of PORT_VALUES) {
    if (!rawResults.has(portValue)) {
      rawResults.set(portValue, runPortValue(portValue, PRELIFTED_BLOCKS, romBytes));
    }
  }

  const baselineResult = rawResults.get(BASELINE_VALUE);
  const baselineSet = new Set(baselineResult.allBlocks.keys());
  const analyzedResults = PORT_VALUES.map((portValue) => analyzeResult(rawResults.get(portValue), baselineSet));
  const bestBlockCount = Math.max(...analyzedResults.map((result) => result.allBlocks.size));
  const bestResults = analyzedResults.filter((result) => result.allBlocks.size === bestBlockCount);
  const bestResult = bestResults[0];
  const tiedBestValues = bestResults.map((result) => result.portValue);

  console.log('Phase 358: port 0x1F escape extension probe');
  console.log('===========================================');
  console.log(`ROM:                 ${ROM_PATH}`);
  console.log(`Transpiled ROM:      ${regeneratedTranspiledRom ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`);
  console.log(`Boot config:         ${hex(BOOT_ENTRY)}:${BOOT_MODE} bootSteps=${BOOT_MAX_STEPS}`);
  console.log(`Wake config:         NMI@${hex(NMI_VECTOR)} totalBudget=${TOTAL_STEP_BUDGET.toLocaleString()} loopCap=${MAX_LOOP_ITERATIONS.toLocaleString()}`);
  console.log(`Phase357 bus shim:   yes (port 0x28 / 0x06 behavior preserved)`);
  console.log(`Port 0x1F tests:     ${PORT_VALUES.map((value) => hex(value, 2)).join(', ')}`);
  console.log('');

  printResultTable(analyzedResults);
  printGateObservations(analyzedResults);
  printIdenticalGroups(analyzedResults);
  printBestTrace(bestResult, baselineSet, tiedBestValues);
  printRecommendation(analyzedResults, analyzeResult(baselineResult, baselineSet), bestResults);

  console.log('--- probe complete ---');
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
}
