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
const MAX_WAKES = 200;
const MAX_LOOP_ITERATIONS = 50000;
const RESUME_SCAN_LIMIT = 64;
const MAX_RESUME_ATTEMPTS = 32;

// Key address: if NMI path visits blocks beyond this, report them
const ESCAPE_MARKER = 0x000D82;

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

function syncCpuState(cpu, result) {
  const mode = result.lastMode ?? (cpu.madl ? 'adl' : 'z80');
  cpu.pc = (result.lastPc ?? cpu.pc ?? 0) & 0xFFFFFF;
  cpu.madl = mode === 'adl' ? 1 : 0;
  cpu.adl = cpu.madl === 1;
  return mode;
}

function buildBlockIndex(compiledBlocks) {
  const index = { adl: [], z80: [] };

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
      return { pc: candidatePc, mode: normalizedMode };
    }
  }

  for (const candidatePc of blockIndex[normalizedMode] ?? []) {
    if (candidatePc > normalizedPc) {
      return { pc: candidatePc, mode: normalizedMode };
    }
  }

  return null;
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error('ROM.rom is missing.');
  }

  const regenerated = ensureTranspiledRom();
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

  // Use peripherals.js as-is — NO custom port handlers
  const peripherals = createPeripheralBus({ timerInterrupt: false });

  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  const blockIndex = buildBlockIndex(executor.compiledBlocks ?? {});

  cpu.mem = mem;
  cpu.io = peripherals;
  cpu.pc = BOOT_ENTRY;
  cpu.madl = 0;
  cpu.adl = false;
  cpu.triggerNMI = () => peripherals.triggerNMI();

  // Tracking state
  let totalSteps = 0;
  let currentBlockKey = null;
  let currentAbsStep = 0;

  const allBlocks = new Map();       // key -> { key, pc, mode, firstStep, phase }
  const preHaltBlocks = new Set();   // blocks seen before first HALT
  const postHaltBlocks = new Map();  // blocks first seen after first HALT
  const beyondEscapeBlocks = [];     // blocks beyond ESCAPE_MARKER
  const portIO = [];                 // port I/O during first 10 NMI wakes

  let activeWake = null;
  let trackingPortIO = true;

  function recordBlock(pc, mode, absStep, phase) {
    const key = blockKey(pc, mode);
    currentBlockKey = key;
    currentAbsStep = absStep;

    if (!allBlocks.has(key)) {
      allBlocks.set(key, { key, pc, mode, firstStep: absStep, phase });
    }
  }

  cpu.onIoRead = (port, value) => {
    if (!trackingPortIO || !activeWake) return;
    portIO.push({
      wake: activeWake,
      step: currentAbsStep,
      block: currentBlockKey,
      direction: 'read',
      port: Number(port) & 0xFFFF,
      value: Number(value) & 0xFF,
    });
  };

  cpu.onIoWrite = (port, value) => {
    if (!trackingPortIO || !activeWake) return;
    portIO.push({
      wake: activeWake,
      step: currentAbsStep,
      block: currentBlockKey,
      direction: 'write',
      port: Number(port) & 0xFFFF,
      value: Number(value) & 0xFF,
    });
  };

  // ── Phase 1: Boot to first HALT ──
  console.log('Phase 358: boot extension probe (port 0x1F fix)');
  console.log('================================================');
  console.log(`Using committed peripherals.js as-is (no custom port handlers)`);
  console.log(`Boot entry:       ${hex(BOOT_ENTRY)}:${BOOT_MODE}`);
  console.log(`Expected HALT:    ${hex(HALT_PC)}`);
  console.log(`Escape marker:    ${hex(ESCAPE_MARKER)}`);
  console.log(`Boot budget:      ${BOOT_MAX_STEPS} steps`);
  console.log(`Wake budget:      ${WAKE_STEP_BUDGET} steps each, up to ${MAX_WAKES} wakes`);
  console.log(`Transpiled ROM:   ${regenerated ? 'regenerated this run' : 'existing'}`);
  console.log('');

  const bootResult = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
    onBlock(pcValue, mode, _meta, step) {
      const pc = pcValue & 0xFFFFFF;
      const m = mode ?? BOOT_MODE;
      const absStep = totalSteps + step + 1;
      recordBlock(pc, m, absStep, 'boot');
      preHaltBlocks.add(blockKey(pc, m));
    },
  });

  totalSteps += Math.max(0, Number(bootResult.steps ?? 0));
  syncCpuState(cpu, bootResult);

  console.log('Boot phase');
  console.log('----------');
  console.log(`Termination: ${bootResult.termination}`);
  console.log(`Steps:       ${bootResult.steps}`);
  console.log(`Last PC:     ${hex(bootResult.lastPc)}:${bootResult.lastMode ?? BOOT_MODE}`);
  console.log(`Pre-HALT unique blocks: ${preHaltBlocks.size}`);

  if (bootResult.termination !== 'halt') {
    console.log(`\nBoot did not reach HALT — cannot inject NMI.`);
    console.log('--- probe complete ---');
    return;
  }

  if ((bootResult.lastPc & 0xFFFFFF) !== HALT_PC) {
    console.log(`\nWARNING: HALT at ${hex(bootResult.lastPc)}, expected ${hex(HALT_PC)}`);
  }

  // ── Phase 2: NMI wakes ──
  console.log('\nNMI wake phase');
  console.log('--------------');

  let lastHaltPc = null;
  let lastTermination = null;
  let wakeCount = 0;

  for (let w = 1; w <= MAX_WAKES; w++) {
    activeWake = w;
    if (w > 10) trackingPortIO = false;

    cpu.triggerNMI();
    cpu.halted = false;

    let remaining = WAKE_STEP_BUDGET;
    let resumeAttempts = 0;
    let wakeTermination = null;
    const wakeNewBlocks = [];

    while (remaining > 0) {
      const segmentBase = totalSteps;

      const result = executor.runFrom(cpu.pc & 0xFFFFFF, cpu.madl ? 'adl' : 'z80', {
        maxSteps: remaining,
        maxLoopIterations: MAX_LOOP_ITERATIONS,
        onBlock(pcValue, mode, _meta, step) {
          const pc = pcValue & 0xFFFFFF;
          const m = mode ?? (cpu.madl ? 'adl' : 'z80');
          const absStep = segmentBase + step + 1;
          const key = blockKey(pc, m);

          recordBlock(pc, m, absStep, `wake${w}`);

          // Track blocks first seen after first HALT
          if (!preHaltBlocks.has(key) && !postHaltBlocks.has(key)) {
            const entry = { key, pc, mode: m, firstStep: absStep, wake: w };
            postHaltBlocks.set(key, entry);
            wakeNewBlocks.push(entry);

            if (pc > ESCAPE_MARKER) {
              beyondEscapeBlocks.push(entry);
            }
          }
        },
        onMissingBlock(pcValue, mode, step) {
          // handled by resume logic
        },
      });

      const used = Math.max(0, Number(result.steps ?? 0));
      totalSteps += used;
      remaining = Math.max(0, remaining - used);
      syncCpuState(cpu, result);

      if (result.termination !== 'missing_block') {
        wakeTermination = remaining === 0 && result.termination === 'max_steps'
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
        wakeTermination = 'missing_block';
        break;
      }

      cpu.halted = false;
      cpu.pc = resume.pc;
      cpu.madl = resume.mode === 'adl' ? 1 : 0;
      cpu.adl = cpu.madl === 1;
      resumeAttempts += 1;
    }

    wakeCount = w;
    lastHaltPc = cpu.pc & 0xFFFFFF;
    lastTermination = wakeTermination;

    // Log every 10th wake, first 5 wakes, and any wake that discovers new blocks
    if (w <= 5 || w % 10 === 0 || wakeNewBlocks.length > 0) {
      console.log(
        `  Wake #${String(w).padStart(3)}: `
        + `term=${(wakeTermination ?? '?').padEnd(22)} `
        + `pc=${hex(cpu.pc & 0xFFFFFF)} `
        + `newBlocks=${wakeNewBlocks.length} `
        + `totalNew=${postHaltBlocks.size}`
      );
    }

    // Stop if boot escapes HALT entirely (non-halt termination)
    if (wakeTermination !== 'halt') {
      console.log(`  Boot escaped HALT loop at wake #${w} (termination: ${wakeTermination})`);
      break;
    }
  }

  // ── Results ──
  console.log('\nResults');
  console.log('-------');
  console.log(`Total wakes:              ${wakeCount}`);
  console.log(`Total steps:              ${totalSteps}`);
  console.log(`All unique blocks:        ${allBlocks.size}`);
  console.log(`Pre-HALT blocks:          ${preHaltBlocks.size}`);
  console.log(`Post-HALT new blocks:     ${postHaltBlocks.size}`);
  console.log(`Blocks beyond ${hex(ESCAPE_MARKER)}: ${beyondEscapeBlocks.length}`);
  console.log(`Final PC:                 ${hex(lastHaltPc)}`);
  console.log(`Final termination:        ${lastTermination}`);

  // First 30 post-HALT blocks
  const postHaltList = [...postHaltBlocks.values()]
    .sort((a, b) => a.firstStep - b.firstStep)
    .slice(0, 30);

  console.log(`\nFirst ${Math.min(30, postHaltList.length)} post-HALT blocks discovered`);
  console.log('-------------------------------------------');
  for (const entry of postHaltList) {
    console.log(
      `  wake=${String(entry.wake).padStart(3)} `
      + `step=${String(entry.firstStep).padStart(8)} `
      + `${entry.key}`
    );
  }

  // Blocks beyond escape marker
  if (beyondEscapeBlocks.length > 0) {
    console.log(`\nNEW blocks beyond escape marker ${hex(ESCAPE_MARKER)}`);
    console.log('------------------------------------------------');
    for (const entry of beyondEscapeBlocks) {
      console.log(
        `  wake=${String(entry.wake).padStart(3)} `
        + `step=${String(entry.firstStep).padStart(8)} `
        + `${entry.key}`
      );
    }
  } else {
    console.log(`\nNo blocks discovered beyond ${hex(ESCAPE_MARKER)}`);
  }

  // Port I/O during first 10 wakes
  if (portIO.length > 0) {
    console.log(`\nPort I/O during first 10 NMI wakes (${portIO.length} events)`);
    console.log('-----------------------------------------------------');
    for (const ev of portIO) {
      const verb = ev.direction === 'read' ? 'IN ' : 'OUT';
      const arrow = ev.direction === 'read' ? '->' : '<-';
      console.log(
        `  wake=${String(ev.wake).padStart(3)} `
        + `step=${String(ev.step).padStart(8)} `
        + `block=${ev.block} `
        + `${verb} ${hex(ev.port, 4)} ${arrow} ${hex(ev.value, 2)}`
      );
    }
  } else {
    console.log('\nNo port I/O recorded during first 10 wakes');
  }

  console.log('\n--- probe complete ---');
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
}
