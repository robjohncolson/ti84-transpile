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
const TRACE_STEPS = 5000;
const COMPARE_STEPS = 10000;
const LOOP_CAP = 50000;
const TARGET_PORTS = [0xB020, 0xB024];
const TARGET_PORT_SET = new Set(TARGET_PORTS);

const PORT_CONFIGS = [
  {
    port: 0xB020,
    label: '0xB020',
    rawPattern: [0x01, 0x20, 0xB0],
    prefixedPattern: [0x40, 0x01, 0x20, 0xB0],
  },
  {
    port: 0xB024,
    label: '0xB024',
    rawPattern: [0x01, 0x24, 0xB0],
    prefixedPattern: [0x40, 0x01, 0x24, 0xB0],
  },
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function normalizePort(port) {
  return Number(port) & 0xFFFF;
}

function normalizeValue(value) {
  return Number(value) & 0xFF;
}

function blockKey(pc, mode) {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function parseBlockPc(key) {
  return Number.parseInt(String(key).split(':', 1)[0], 16) & 0xFFFFFF;
}

function createMemoryBus(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return mem;
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

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]),
    );
  }

  return rawBlocks ?? {};
}

function scanPattern(buffer, pattern) {
  const hits = [];

  for (let index = 0; index <= buffer.length - pattern.length; index++) {
    let matched = true;
    for (let offset = 0; offset < pattern.length; offset++) {
      if (buffer[index + offset] !== pattern[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      hits.push(index);
    }
  }

  return hits;
}

function buildLoadScanSummary(romBytes) {
  return PORT_CONFIGS.map((config) => {
    const rawMatches = scanPattern(romBytes, config.rawPattern);
    const prefixedMatches = scanPattern(romBytes, config.prefixedPattern);
    const prefixedStartSet = new Set(prefixedMatches);

    const annotatedMatches = rawMatches.map((rawMatch) => {
      const prefixed = rawMatch > 0 && romBytes[rawMatch - 1] === 0x40;
      return {
        rawMatch,
        inferredStart: prefixed ? rawMatch - 1 : rawMatch,
        prefixed,
      };
    });

    const inferredStarts = [...new Set(annotatedMatches.map((entry) => entry.inferredStart))]
      .sort((left, right) => left - right);

    return {
      ...config,
      rawMatches: annotatedMatches,
      prefixedMatches: [...prefixedStartSet].sort((left, right) => left - right),
      inferredStarts,
    };
  });
}

function createTracker() {
  return { b: null, c: null };
}

function setBC(tracker, value) {
  tracker.b = (value >>> 8) & 0xFF;
  tracker.c = value & 0xFF;
}

function invalidateBC(tracker) {
  tracker.b = null;
  tracker.c = null;
}

function updateTracker(tracker, inst) {
  if (!inst || typeof inst !== 'object') {
    return;
  }

  if (inst.tag === 'ld-pair-imm' && inst.pair === 'bc' && typeof inst.value === 'number') {
    setBC(tracker, inst.value & 0xFFFF);
    return;
  }

  if (inst.tag === 'ld-reg-imm') {
    if (inst.dest === 'b') tracker.b = inst.value & 0xFF;
    if (inst.dest === 'c') tracker.c = inst.value & 0xFF;
    return;
  }

  if (inst.tag === 'ld-reg-reg') {
    if (inst.dest === 'b') {
      tracker.b = inst.src === 'b' ? tracker.b : inst.src === 'c' ? tracker.c : null;
    }
    if (inst.dest === 'c') {
      tracker.c = inst.src === 'c' ? tracker.c : inst.src === 'b' ? tracker.b : null;
    }
    return;
  }

  if (inst.tag === 'inc-pair' && inst.pair === 'bc' && tracker.b !== null && tracker.c !== null) {
    setBC(tracker, (((tracker.b << 8) | tracker.c) + 1) & 0xFFFF);
    return;
  }

  if (inst.tag === 'dec-pair' && inst.pair === 'bc' && tracker.b !== null && tracker.c !== null) {
    setBC(tracker, (((tracker.b << 8) | tracker.c) - 1) & 0xFFFF);
    return;
  }

  if (inst.tag === 'inc-reg') {
    if (inst.reg === 'b' && tracker.b !== null) tracker.b = (tracker.b + 1) & 0xFF;
    if (inst.reg === 'c' && tracker.c !== null) tracker.c = (tracker.c + 1) & 0xFF;
    return;
  }

  if (inst.tag === 'dec-reg') {
    if (inst.reg === 'b' && tracker.b !== null) tracker.b = (tracker.b - 1) & 0xFF;
    if (inst.reg === 'c' && tracker.c !== null) tracker.c = (tracker.c - 1) & 0xFF;
    return;
  }

  if (
    (inst.tag === 'pop' && inst.pair === 'bc')
    || (inst.tag === 'ld-pair-mem' && inst.pair === 'bc' && inst.direction !== 'to-mem')
    || (inst.tag === 'ld-pair-ind' && inst.pair === 'bc')
    || (inst.tag === 'ld-pair-indexed' && inst.pair === 'bc')
    || (inst.tag === 'add-pair' && inst.dest === 'bc')
    || (inst.tag === 'lea' && inst.dest === 'bc')
    || (inst.tag === 'mlt' && inst.reg === 'bc')
    || inst.tag === 'exx'
    || (inst.tag === 'in-reg' && (inst.reg === 'b' || inst.reg === 'c'))
    || (inst.tag === 'ld-reg-ind' && (inst.dest === 'b' || inst.dest === 'c'))
    || (inst.tag === 'ld-reg-mem' && (inst.dest === 'b' || inst.dest === 'c'))
    || (inst.tag === 'ld-reg-ixd' && (inst.dest === 'b' || inst.dest === 'c'))
    || (inst.tag === 'ld-special' && (inst.dest === 'b' || inst.dest === 'c' || inst.dest === 'bc'))
  ) {
    invalidateBC(tracker);
  }
}

function inferTrackedPort(inst, tracker) {
  if (!inst || typeof inst !== 'object') {
    return null;
  }

  if ((inst.tag === 'in-reg' || inst.tag === 'out-reg') && tracker.b !== null && tracker.c !== null) {
    return (((tracker.b & 0xFF) << 8) | (tracker.c & 0xFF)) & 0xFFFF;
  }

  return null;
}

function buildTargetPortSiteIndex(blocks) {
  const byBlock = new Map();
  const allSites = [];

  for (const [key, block] of Object.entries(blocks)) {
    const instructions = block?.instructions ?? [];
    const blockMode = block?.mode ?? 'adl';
    const blockPc = typeof block?.pc === 'number' ? block.pc & 0xFFFFFF : parseBlockPc(key);
    const tracker = createTracker();
    const sites = [];

    for (const inst of instructions) {
      const port = inferTrackedPort(inst, tracker);
      if (port !== null && TARGET_PORT_SET.has(port) && (inst.tag === 'in-reg' || inst.tag === 'out-reg')) {
        const site = {
          blockKey: key,
          blockPc,
          blockMode,
          pc: (inst.pc ?? blockPc) & 0xFFFFFF,
          mode: inst.mode ?? blockMode,
          op: inst.tag === 'in-reg' ? 'IN' : 'OUT',
          port,
          dasm: inst.dasm ?? `${inst.tag} ${hex(port, 4)}`,
        };
        sites.push(site);
        allSites.push(site);
      }

      updateTracker(tracker, inst);
    }

    if (sites.length > 0) {
      byBlock.set(key, sites);
    }
  }

  return { byBlock, allSites };
}

function dedupeSites(sites) {
  const seen = new Set();
  const unique = [];

  for (const site of sites) {
    const key = `${site.pc}:${site.mode}:${site.op}:${site.port}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(site);
  }

  unique.sort((left, right) => {
    if (left.pc !== right.pc) return left.pc - right.pc;
    if (left.mode !== right.mode) return left.mode.localeCompare(right.mode);
    if (left.port !== right.port) return left.port - right.port;
    return left.op.localeCompare(right.op);
  });

  return unique;
}

function summarizePortLog(events) {
  const summary = new Map();

  for (const event of events) {
    const key = `${event.op}:${event.port}`;
    if (!summary.has(key)) {
      summary.set(key, {
        op: event.op,
        port: event.port,
        count: 0,
        values: new Set(),
      });
    }

    const entry = summary.get(key);
    entry.count++;
    entry.values.add(event.value);
  }

  return [...summary.values()].sort((left, right) => {
    if (left.port !== right.port) return left.port - right.port;
    return left.op.localeCompare(right.op);
  });
}

function consumeMatchingSite(sites, state, op, port) {
  for (let index = state.index; index < sites.length; index++) {
    const site = sites[index];
    if (site.op === op && site.port === port) {
      state.index = index + 1;
      return site;
    }
  }

  return null;
}

function runScenario({ label, forcedReadValue, maxSteps }, romBytes, blocks, createExecutor, createPeripheralBus, siteIndex) {
  const mem = createMemoryBus(romBytes);
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;

  const portLog = [];
  const uniqueBlocks = new Set();

  let currentStep = 0;
  let currentBlockPc = BOOT_ENTRY;
  let currentMode = BOOT_MODE;
  let currentSites = [];
  const currentSiteState = { index: 0 };

  const originalRead = peripherals.read.bind(peripherals);
  const originalWrite = peripherals.write.bind(peripherals);

  peripherals.read = (port) => {
    const normalizedPort = normalizePort(port);
    const value = TARGET_PORT_SET.has(normalizedPort) && forcedReadValue !== null && forcedReadValue !== undefined
      ? normalizeValue(forcedReadValue)
      : normalizeValue(originalRead(normalizedPort));

    if (TARGET_PORT_SET.has(normalizedPort)) {
      const site = consumeMatchingSite(currentSites, currentSiteState, 'IN', normalizedPort);
      portLog.push({
        step: currentStep,
        blockPc: currentBlockPc,
        blockMode: currentMode,
        pc: site?.pc ?? currentBlockPc,
        mode: site?.mode ?? currentMode,
        op: 'IN',
        port: normalizedPort,
        value,
        siteResolved: Boolean(site),
        dasm: site?.dasm ?? 'in ?, (c)',
      });
    }

    return value;
  };

  peripherals.write = (port, value) => {
    const normalizedPort = normalizePort(port);
    const normalizedValue = normalizeValue(value);

    if (TARGET_PORT_SET.has(normalizedPort)) {
      const site = consumeMatchingSite(currentSites, currentSiteState, 'OUT', normalizedPort);
      portLog.push({
        step: currentStep,
        blockPc: currentBlockPc,
        blockMode: currentMode,
        pc: site?.pc ?? currentBlockPc,
        mode: site?.mode ?? currentMode,
        op: 'OUT',
        port: normalizedPort,
        value: normalizedValue,
        siteResolved: Boolean(site),
        dasm: site?.dasm ?? 'out (c), ?',
      });
    }

    return originalWrite(normalizedPort, normalizedValue);
  };

  const run = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps,
    maxLoopIterations: LOOP_CAP,
    wakeFromHalt: 'nmi',
    onBlock(blockPc, mode, _meta, steps) {
      currentStep = steps;
      currentBlockPc = blockPc & 0xFFFFFF;
      currentMode = mode ?? 'adl';
      uniqueBlocks.add(blockKey(currentBlockPc, currentMode));
      currentSites = siteIndex.get(blockKey(currentBlockPc, currentMode)) ?? [];
      currentSiteState.index = 0;
    },
  });

  return {
    label,
    forcedReadValue,
    run,
    uniqueBlockCount: uniqueBlocks.size,
    portLog,
  };
}

function printLoadScanSummary(summary) {
  console.log('Part 1: ROM byte scan for LD BC, 0xB020 / 0xB024');
  console.log('-----------------------------------------------');

  for (const entry of summary) {
    console.log(`${entry.label}`);
    console.log(`  raw ${entry.rawPattern.map((value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ')} matches: ${entry.rawMatches.length}`);
    if (entry.rawMatches.length === 0) {
      console.log('    none');
    } else {
      for (const match of entry.rawMatches) {
        console.log(
          `    raw=${hex(match.rawMatch)} inferredLdBcStart=${hex(match.inferredStart)} prefixed40=${match.prefixed ? 'yes' : 'no'}`,
        );
      }
    }

    console.log(`  exact ${entry.prefixedPattern.map((value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ')} matches: ${entry.prefixedMatches.length}`);
    if (entry.prefixedMatches.length === 0) {
      console.log('    none');
    } else {
      for (const start of entry.prefixedMatches) {
        console.log(`    ${hex(start)}`);
      }
    }
  }
}

function printStaticSiteSummary(uniqueSites) {
  const readSites = uniqueSites.filter((site) => site.op === 'IN');
  const writeSites = uniqueSites.filter((site) => site.op === 'OUT');

  console.log('');
  console.log('Static lifted-block target-port I/O sites');
  console.log('----------------------------------------');
  console.log(`Unique IN sites:  ${readSites.length}`);
  if (readSites.length === 0) {
    console.log('  none');
  } else {
    for (const site of readSites) {
      console.log(`  ${hex(site.pc)}:${site.mode} port=${hex(site.port, 4)} ${site.dasm}`);
    }
  }

  console.log(`Unique OUT sites: ${writeSites.length}`);
  if (writeSites.length === 0) {
    console.log('  none');
  } else {
    for (const site of writeSites) {
      console.log(`  ${hex(site.pc)}:${site.mode} port=${hex(site.port, 4)} ${site.dasm}`);
    }
  }
}

function printPortTrace(run, maxSteps) {
  console.log('');
  console.log(`Part 2: Boot trace for first ${maxSteps.toLocaleString()} steps`);
  console.log('------------------------------------');
  console.log(`Scenario:          ${run.label}`);
  console.log(`Termination:       ${run.run.termination}`);
  console.log(`Total steps:       ${run.run.steps.toLocaleString()}`);
  console.log(`Unique blocks:     ${run.uniqueBlockCount}`);
  console.log(`Last PC:           ${hex(run.run.lastPc)}:${run.run.lastMode ?? 'adl'}`);
  console.log('');
  console.log('All observed 0xB020 / 0xB024 interactions');
  console.log('-----------------------------------------');
  if (run.portLog.length === 0) {
    console.log('  none');
  } else {
    for (const event of run.portLog) {
      console.log(
        `  step=${String(event.step).padStart(5)}`
        + ` pc=${hex(event.pc)}:${event.mode}`
        + ` ${event.op.padEnd(3)}`
        + ` port=${hex(event.port, 4)}`
        + ` value=${hex(event.value, 2)}`
        + ` block=${hex(event.blockPc)}:${event.blockMode}`
        + ` siteResolved=${event.siteResolved ? 'yes' : 'no'}`,
      );
    }
  }

  console.log('');
  console.log('Interaction summary');
  console.log('-------------------');
  const summary = summarizePortLog(run.portLog);
  if (summary.length === 0) {
    console.log('  none');
  } else {
    for (const entry of summary) {
      const values = [...entry.values].sort((left, right) => left - right).map((value) => hex(value, 2)).join(', ');
      console.log(
        `  port=${hex(entry.port, 4)} op=${entry.op.padEnd(3)} count=${String(entry.count).padStart(3)} values=[${values}]`,
      );
    }
  }
}

function printComparisonRuns(runs, baseline) {
  console.log('');
  console.log(`Part 3: Forced-read comparison (${COMPARE_STEPS.toLocaleString()} steps)`);
  console.log('------------------------------------------');
  console.log('  scenario            readValue  blocks  delta  reads  writes  lastPc          termination');

  for (const run of runs) {
    const readValue = run.forcedReadValue === null || run.forcedReadValue === undefined
      ? 0xFF
      : run.forcedReadValue;
    const delta = run.uniqueBlockCount - baseline.uniqueBlockCount;
    const readCount = run.portLog.filter((event) => event.op === 'IN').length;
    const writeCount = run.portLog.filter((event) => event.op === 'OUT').length;
    console.log(
      `  ${run.label.padEnd(19)} ${hex(readValue, 2).padEnd(9)} ${String(run.uniqueBlockCount).padStart(6)} ${String(delta >= 0 ? `+${delta}` : delta).padStart(6)} ${String(readCount).padStart(6)} ${String(writeCount).padStart(7)} ${`${hex(run.run.lastPc)}:${run.run.lastMode ?? 'adl'}`.padEnd(14)} ${run.run.termination}`,
    );
  }
}

if (!fs.existsSync(ROM_PATH)) {
  throw new Error('ROM.rom is missing.');
}

const regeneratedTranspiledRom = ensureTranspiledRom();
const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));
const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
const transpiledModule = await import(pathToFileURL(TRANSPILED_PATH).href);

const BLOCKS = normalizeBlocks(
  transpiledModule.PRELIFTED_BLOCKS
    ?? transpiledModule.default?.PRELIFTED_BLOCKS
    ?? transpiledModule.default
    ?? transpiledModule,
);

if (Object.keys(BLOCKS).length === 0) {
  throw new Error('Unable to resolve PRELIFTED_BLOCKS from ROM.transpiled.js');
}

const loadScanSummary = buildLoadScanSummary(romBytes);
const targetSiteIndex = buildTargetPortSiteIndex(BLOCKS);
const uniqueTargetSites = dedupeSites(targetSiteIndex.allSites);

console.log('Phase 354: Port 0xB020 / 0xB024 loop-cause analysis');
console.log('===================================================');
console.log(`Boot entry:        ${hex(BOOT_ENTRY)}:${BOOT_MODE}`);
console.log(`Trace steps:       ${TRACE_STEPS.toLocaleString()}`);
console.log(`Compare steps:     ${COMPARE_STEPS.toLocaleString()}`);
console.log(`Loop cap:          ${LOOP_CAP.toLocaleString()}`);
console.log('Peripheral config: pllDelay=2, timerInterrupt=false');
console.log(
  `Transpiled ROM:    ${regeneratedTranspiledRom ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`,
);
console.log('');
console.log('Step counts below are lifted block steps from executor.runFrom().');
console.log('');

printLoadScanSummary(loadScanSummary);
printStaticSiteSummary(uniqueTargetSites);

const baselineTrace = runScenario(
  { label: 'default/unhandled => 0xFF', forcedReadValue: null, maxSteps: TRACE_STEPS },
  romBytes,
  BLOCKS,
  createExecutor,
  createPeripheralBus,
  targetSiteIndex.byBlock,
);

printPortTrace(baselineTrace, TRACE_STEPS);

const observedReads = baselineTrace.portLog.filter((event) => event.op === 'IN');

console.log('');
console.log('Conclusion');
console.log('----------');

if (observedReads.length === 0) {
  console.log(
    `No reads from ${hex(0xB020, 4)} or ${hex(0xB024, 4)} were observed in the first ${TRACE_STEPS.toLocaleString()} steps.`,
  );
  if (uniqueTargetSites.every((site) => site.op !== 'IN')) {
    console.log('Static lifted-block analysis also found no IN sites for either port.');
  } else {
    console.log('Static lifted-block analysis found IN sites, but boot did not reach them in this window.');
  }
  console.log('Alternate read-value tests were skipped because there was no runtime read path to perturb.');
} else {
  const comparisonRuns = [
    runScenario(
      { label: 'default/unhandled', forcedReadValue: null, maxSteps: COMPARE_STEPS },
      romBytes,
      BLOCKS,
      createExecutor,
      createPeripheralBus,
      targetSiteIndex.byBlock,
    ),
    runScenario(
      { label: 'forced 0x00', forcedReadValue: 0x00, maxSteps: COMPARE_STEPS },
      romBytes,
      BLOCKS,
      createExecutor,
      createPeripheralBus,
      targetSiteIndex.byBlock,
    ),
    runScenario(
      { label: 'forced 0x01', forcedReadValue: 0x01, maxSteps: COMPARE_STEPS },
      romBytes,
      BLOCKS,
      createExecutor,
      createPeripheralBus,
      targetSiteIndex.byBlock,
    ),
    runScenario(
      { label: 'forced 0x80', forcedReadValue: 0x80, maxSteps: COMPARE_STEPS },
      romBytes,
      BLOCKS,
      createExecutor,
      createPeripheralBus,
      targetSiteIndex.byBlock,
    ),
  ];

  printComparisonRuns(comparisonRuns, comparisonRuns[0]);

  const betterRuns = comparisonRuns.filter((run, index) => index > 0 && run.uniqueBlockCount > comparisonRuns[0].uniqueBlockCount);
  if (betterRuns.length === 0) {
    console.log('Observed reads exist, but none of the tested return values unlocked additional unique blocks.');
  } else {
    console.log(
      `Observed reads exist, and these values advanced beyond the default baseline: ${betterRuns.map((run) => hex(run.forcedReadValue, 2)).join(', ')}`,
    );
  }
}

console.log('\n--- probe complete ---');
