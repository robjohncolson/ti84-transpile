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
const NMI_VECTOR = 0x000066;
const MAX_STEPS = 100000;
const MAX_HALTS = 50;
const MAX_LOOP_ITERATIONS = 100000;
const ESCAPE_WINDOW_STEPS = 500;
const RESUME_SCAN_LIMIT = 64;
const MISSING_PRINT_LIMIT = 40;

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

function createHarness(blocks, romBytes, createExecutor, createPeripheralBus) {
  const mem = createMemory(romBytes);
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;

  cpu.mem = mem;
  cpu.io = peripherals;
  cpu.pc = BOOT_ENTRY;
  cpu.madl = 0;
  cpu.adl = false;

  return { mem, peripherals, executor, cpu };
}

function snapshotRegisters(cpu) {
  return {
    a: cpu.a & 0xFF,
    bc: cpu.bc & 0xFFFFFF,
    de: cpu.de & 0xFFFFFF,
    hl: cpu.hl & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
  };
}

function formatRegisters(registers) {
  return [
    `A=${hex(registers.a, 2)}`,
    `BC=${hex(registers.bc)}`,
    `DE=${hex(registers.de)}`,
    `HL=${hex(registers.hl)}`,
    `SP=${hex(registers.sp)}`,
  ].join(' ');
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

function recordMissingBlock(summary, events, dedupe, cycle, step, pc, mode, source) {
  const normalizedPc = pc & 0xFFFFFF;
  const normalizedMode = mode ?? 'adl';
  const eventKey = `${cycle}:${step}:${blockKey(normalizedPc, normalizedMode)}:${source}`;
  if (dedupe.has(eventKey)) {
    return;
  }

  dedupe.add(eventKey);
  events.push({
    cycle,
    step,
    pc: normalizedPc,
    mode: normalizedMode,
    source,
  });

  const summaryKey = blockKey(normalizedPc, normalizedMode);
  if (!summary.has(summaryKey)) {
    summary.set(summaryKey, {
      pc: normalizedPc,
      mode: normalizedMode,
      count: 0,
      firstCycle: cycle,
      firstStep: step,
      sources: new Set(),
    });
  }

  const entry = summary.get(summaryKey);
  entry.count += 1;
  entry.sources.add(source);
}

function printHaltTable(haltRows) {
  console.log('HALT Table');
  console.log('----------');
  console.log('HALT#  step     blocks_total  blocks_new_this_cycle  PC_at_halt');

  if (haltRows.length === 0) {
    console.log('none');
    return;
  }

  for (const row of haltRows) {
    console.log(
      `${String(row.halt).padStart(5)}  `
      + `${String(row.step).padStart(7)}  `
      + `${String(row.blocksTotal).padStart(12)}  `
      + `${String(row.blocksNewThisCycle).padStart(21)}  `
      + `${`${hex(row.pc)}:${row.mode}`}`,
    );
  }
}

function printHaltRegisters(haltRows) {
  console.log('\nHALT Registers');
  console.log('--------------');

  if (haltRows.length === 0) {
    console.log('none');
    return;
  }

  for (const row of haltRows) {
    console.log(`  #${row.halt} step=${row.step} ${formatRegisters(row.registers)}`);
  }
}

function printMissingBlocks(missingSummary) {
  console.log('\nMissing blocks');
  console.log('--------------');

  if (missingSummary.size === 0) {
    console.log('none');
    return;
  }

  const rows = [...missingSummary.values()].sort((left, right) => left.firstStep - right.firstStep);
  for (const row of rows.slice(0, MISSING_PRINT_LIMIT)) {
    const sources = [...row.sources].sort().join(',');
    console.log(
      `  step=${String(row.firstStep).padStart(7)} cycle=${String(row.firstCycle).padStart(2)} `
      + `pc=${hex(row.pc)}:${row.mode} hits=${row.count} sources=${sources}`,
    );
  }

  if (rows.length > MISSING_PRINT_LIMIT) {
    console.log(`  ... ${rows.length - MISSING_PRINT_LIMIT} more unique missing-block addresses`);
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
    transpiledModule.PRELIFTED_BLOCKS ??
    transpiledModule.default?.PRELIFTED_BLOCKS ??
    transpiledModule.default ??
    transpiledModule,
  );

  if (Object.keys(PRELIFTED_BLOCKS).length === 0) {
    throw new Error('Unable to locate PRELIFTED_BLOCKS in ROM.transpiled.js');
  }

  const { executor, cpu } = createHarness(
    PRELIFTED_BLOCKS,
    romBytes,
    createExecutor,
    createPeripheralBus,
  );

  const compiledBlocks = executor.compiledBlocks ?? {};
  const blockIndex = buildBlockIndex(compiledBlocks);

  const uniqueBlocks = new Map();
  const haltRows = [];
  const cycleHistory = [];
  const missingSummary = new Map();
  const missingEvents = [];
  const missingDedupe = new Set();

  let totalSteps = 0;
  let haltCount = 0;
  let cycleNumber = 0;
  let maxUniqueBlocks = 0;
  let longestPostWakeRun = 0;
  let escapedHaltLoop = false;
  let stopReason = null;

  cpu.pc = BOOT_ENTRY;
  cpu.madl = 0;
  cpu.adl = false;

  while (totalSteps < MAX_STEPS && haltCount < MAX_HALTS) {
    cycleNumber += 1;

    const cycleStartStep = totalSteps;
    const cycleStartPc = cpu.pc & 0xFFFFFF;
    const cycleStartMode = cpu.madl ? 'adl' : 'z80';
    const cycleNewBlocks = new Set();

    const run = executor.runFrom(cycleStartPc, cycleStartMode, {
      maxSteps: MAX_STEPS - totalSteps,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onBlock(pcValue, mode, _meta, step) {
        const normalizedPc = pcValue & 0xFFFFFF;
        const normalizedMode = mode ?? cycleStartMode;
        const key = blockKey(normalizedPc, normalizedMode);

        cpu.pc = normalizedPc;
        cpu.madl = normalizedMode === 'adl' ? 1 : 0;
        cpu.adl = cpu.madl === 1;

        if (!uniqueBlocks.has(key)) {
          uniqueBlocks.set(key, {
            pc: normalizedPc,
            mode: normalizedMode,
            firstStep: cycleStartStep + step + 1,
          });
          cycleNewBlocks.add(key);
          maxUniqueBlocks = Math.max(maxUniqueBlocks, uniqueBlocks.size);
        }
      },
      onMissingBlock(pcValue, mode, step) {
        recordMissingBlock(
          missingSummary,
          missingEvents,
          missingDedupe,
          cycleNumber,
          cycleStartStep + step + 1,
          pcValue,
          mode ?? cycleStartMode,
          'callback',
        );
      },
    });

    const segmentSteps = Math.max(0, Number(run.steps ?? 0));
    totalSteps += segmentSteps;

    const lastPc = (run.lastPc ?? cpu.pc ?? cycleStartPc) & 0xFFFFFF;
    const lastMode = run.lastMode ?? (cpu.madl ? 'adl' : cycleStartMode);

    cpu.pc = lastPc;
    cpu.madl = lastMode === 'adl' ? 1 : 0;
    cpu.adl = cpu.madl === 1;

    if (cycleNumber > 1) {
      longestPostWakeRun = Math.max(longestPostWakeRun, segmentSteps);
      if (segmentSteps > ESCAPE_WINDOW_STEPS) {
        escapedHaltLoop = true;
      }
    }

    maxUniqueBlocks = Math.max(maxUniqueBlocks, uniqueBlocks.size);

    cycleHistory.push({
      cycle: cycleNumber,
      entryPc: cycleStartPc,
      entryMode: cycleStartMode,
      termination: run.termination ?? 'unknown',
      steps: segmentSteps,
      lastPc,
      lastMode,
      blocksTotal: uniqueBlocks.size,
      blocksNewThisCycle: cycleNewBlocks.size,
    });

    if (run.termination === 'halt') {
      haltCount += 1;
      haltRows.push({
        halt: haltCount,
        cycle: cycleNumber,
        step: totalSteps,
        blocksTotal: uniqueBlocks.size,
        blocksNewThisCycle: cycleNewBlocks.size,
        pc: lastPc,
        mode: lastMode,
        registers: snapshotRegisters(cpu),
      });

      cpu.halted = false;
      cpu.pc = NMI_VECTOR;
      cpu.madl = 1;
      cpu.adl = true;
      continue;
    }

    if (run.termination === 'missing_block') {
      recordMissingBlock(
        missingSummary,
        missingEvents,
        missingDedupe,
        cycleNumber,
        totalSteps,
        lastPc,
        lastMode,
        'termination',
      );

      const resume = findResumeTarget(compiledBlocks, blockIndex, lastPc, lastMode);
      if (!resume) {
        stopReason = 'missing_block';
        break;
      }

      cpu.halted = false;
      cpu.pc = resume.pc;
      cpu.madl = resume.mode === 'adl' ? 1 : 0;
      cpu.adl = cpu.madl === 1;
      continue;
    }

    stopReason = run.termination ?? 'unknown';
    break;
  }

  if (!stopReason) {
    if (totalSteps >= MAX_STEPS) {
      stopReason = 'step_budget_exhausted';
    } else if (haltCount >= MAX_HALTS) {
      stopReason = 'halt_limit';
    } else {
      stopReason = 'completed';
    }
  }

  if (haltCount === 0 && totalSteps > ESCAPE_WINDOW_STEPS) {
    escapedHaltLoop = true;
  }

  const lastSegment = cycleHistory[cycleHistory.length - 1] ?? null;
  const finalRegisters = snapshotRegisters(cpu);
  const finalMode = cpu.madl ? 'adl' : 'z80';

  console.log('Phase 356: repeated NMI wake boot probe');
  console.log('========================================');
  console.log(`Boot entry:          ${hex(BOOT_ENTRY)}:${BOOT_MODE}`);
  console.log(`NMI wake vector:     ${hex(NMI_VECTOR)}:adl`);
  console.log(`Step budget:         ${MAX_STEPS.toLocaleString()} block steps`);
  console.log(`HALT budget:         ${MAX_HALTS}`);
  console.log(`Loop cap:            ${MAX_LOOP_ITERATIONS.toLocaleString()}`);
  console.log(`Peripheral config:   pllDelay=2, timerInterrupt=false`);
  console.log(`Transpiled ROM:      ${regeneratedTranspiledRom ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`);
  console.log('');

  printHaltTable(haltRows);
  printHaltRegisters(haltRows);
  printMissingBlocks(missingSummary);

  console.log('\nSummary');
  console.log('-------');
  console.log(`Cycles executed:     ${cycleHistory.length}`);
  console.log(`Total steps:         ${totalSteps.toLocaleString()}`);
  console.log(`Total HALTs:         ${haltCount}`);
  console.log(`Max unique blocks:   ${maxUniqueBlocks}`);
  console.log(
    `Escaped HALT loop:   ${escapedHaltLoop ? 'YES' : 'NO'}`
    + ` (longest post-wake run ${longestPostWakeRun} steps)`,
  );
  console.log(`Last segment term:   ${lastSegment?.termination ?? 'n/a'}`);
  console.log(`Stop reason:         ${stopReason}`);
  console.log(`Missing addresses:   ${missingSummary.size}`);
  console.log(`Final PC/mode:       ${hex(cpu.pc)}:${finalMode}`);
  console.log(`Final registers:     ${formatRegisters(finalRegisters)}`);
  console.log('\n--- probe complete ---');
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
}
