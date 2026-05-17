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
const MAX_STEPS = 5000;
const MAX_LOOP_ITERATIONS = 50000;

const SEED_AUDIT_TARGETS = [
  { pc: 0x00001A, label: 'Phase 341 kernel init return address' },
  { pc: 0x000800, label: 'Phase 345 boot path seed' },
  { pc: 0x009006, label: 'Phase 342 kernel init seed' },
  { pc: 0x00D7BE, label: 'Phase 352 boot loop coverage seed' },
  { pc: 0x00CA00, label: 'Phase 173 error handler reset seed' },
  { pc: 0x000008, label: 'Phase 173 RST 08h vector seed' },
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function blockKey(pc, mode = 'adl') {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function sortNumeric(values) {
  return [...values].sort((left, right) => left - right);
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
  cpu.adl = false;

  return { mem, peripherals, executor, cpu };
}

function addModeHit(modeMap, pc, mode) {
  const addr = pc & 0xFFFFFF;
  const normalizedMode = mode ?? 'adl';
  let modes = modeMap.get(addr);

  if (!modes) {
    modes = new Set();
    modeMap.set(addr, modes);
  }

  modes.add(normalizedMode);
}

function formatModeSet(modeSet) {
  if (!modeSet || modeSet.size === 0) {
    return 'none';
  }

  return [...modeSet].sort().join(', ');
}

function runAudit(blocks, romBytes, createExecutor, createPeripheralBus) {
  const { executor, cpu } = createHarness(blocks, romBytes, createExecutor, createPeripheralBus);

  const executedKeys = new Set();
  const executedModesByPc = new Map();
  const traceModesByPc = new Map();
  const z80Keys = new Set();
  const z80Addrs = new Set();
  const missingBlocks = [];

  let highestPc = cpu.pc & 0xFFFFFF;
  let highestMode = cpu.adl ? 'adl' : 'z80';

  const run = executor.runFrom(cpu.pc, cpu.adl ? 'adl' : 'z80', {
    maxSteps: MAX_STEPS,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
    onBlock(pc, mode) {
      const addr = pc & 0xFFFFFF;
      const normalizedMode = mode ?? 'adl';
      const key = blockKey(addr, normalizedMode);

      executedKeys.add(key);
      addModeHit(executedModesByPc, addr, normalizedMode);
      addModeHit(traceModesByPc, addr, normalizedMode);

      if (normalizedMode === 'z80') {
        z80Keys.add(key);
        z80Addrs.add(addr);
      }

      if (addr > highestPc) {
        highestPc = addr;
        highestMode = normalizedMode;
      }
    },
    onMissingBlock(pc, mode, step) {
      const addr = pc & 0xFFFFFF;
      const normalizedMode = mode ?? 'adl';

      addModeHit(traceModesByPc, addr, normalizedMode);

      if (addr > highestPc) {
        highestPc = addr;
        highestMode = normalizedMode;
      }

      missingBlocks.push({
        step,
        pc: addr,
        mode: normalizedMode,
      });
    },
  });

  return {
    steps: run.steps,
    termination: run.termination,
    lastPc: (run.lastPc ?? highestPc) & 0xFFFFFF,
    lastMode: run.lastMode ?? highestMode,
    highestPc,
    highestMode,
    executedCount: executedKeys.size,
    executedKeys: [...executedKeys].sort(),
    executedModesByPc,
    traceModesByPc,
    z80Keys: [...z80Keys].sort(),
    z80Addrs: sortNumeric(z80Addrs),
    missingBlocks,
    errorText: run.error ? String(run.error.stack ?? run.error) : null,
  };
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

  const audit = runAudit(
    PRELIFTED_BLOCKS,
    romBytes,
    createExecutor,
    createPeripheralBus,
  );

  const postEntryZ80Addrs = audit.z80Addrs.filter((addr) => addr !== BOOT_ENTRY);

  console.log('Phase 356: z80 seed audit');
  console.log('=========================');
  console.log(`Boot entry:            ${hex(BOOT_ENTRY)}:${BOOT_MODE}`);
  console.log(`Step budget:           ${MAX_STEPS.toLocaleString()} block steps`);
  console.log(`Loop cap:              ${MAX_LOOP_ITERATIONS.toLocaleString()}`);
  console.log('Peripheral config:     pllDelay=2, timerInterrupt=false');
  console.log('Runtime surface:       createExecutor(...).runFrom(...)');
  console.log(
    `Transpiled ROM:        ${regeneratedTranspiledRom ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`,
  );
  console.log('');
  console.log(`Termination:           ${audit.termination}`);
  console.log(`Total steps:           ${audit.steps.toLocaleString()}`);
  console.log(`Executed blocks:       ${audit.executedCount}`);
  console.log(`Highest PC:            ${hex(audit.highestPc)}:${audit.highestMode}`);
  console.log(`Last PC:               ${hex(audit.lastPc)}:${audit.lastMode}`);
  console.log(`Missing-block hits:    ${audit.missingBlocks.length}`);
  console.log(`Z80-mode block keys:   ${audit.z80Keys.length}`);
  console.log(
    `Z80-mode addresses:    ${audit.z80Addrs.length > 0 ? audit.z80Addrs.map((addr) => hex(addr)).join(', ') : 'none'}`,
  );
  console.log(`Post-entry z80 blocks: ${postEntryZ80Addrs.length}`);
  console.log(
    `Post-entry z80 addrs:  ${postEntryZ80Addrs.length > 0 ? postEntryZ80Addrs.map((addr) => hex(addr)).join(', ') : 'none'}`,
  );

  if (audit.errorText) {
    console.log(`Error:                 ${audit.errorText.split('\n')[0]}`);
  }

  console.log('');
  console.log('Seed Trace');
  console.log('----------');

  for (const seed of SEED_AUDIT_TARGETS) {
    const tracedModes = audit.traceModesByPc.get(seed.pc);
    const executedModes = audit.executedModesByPc.get(seed.pc);
    const executedAsZ80 = executedModes?.has('z80') ?? false;

    console.log(
      `${hex(seed.pc)}  trace=${formatModeSet(tracedModes).padEnd(7)}  executed=${formatModeSet(executedModes).padEnd(7)}  z80-executed=${executedAsZ80 ? 'yes' : 'no '}  ${seed.label}`,
    );
  }

  if (audit.missingBlocks.length > 0) {
    console.log('');
    console.log('Missing Blocks');
    console.log('--------------');
    for (const miss of audit.missingBlocks.slice(0, 16)) {
      console.log(
        `step=${String(miss.step).padStart(5)}  pc=${hex(miss.pc)}:${miss.mode}`,
      );
    }
    if (audit.missingBlocks.length > 16) {
      console.log(`... ${audit.missingBlocks.length - 16} more`);
    }
  }

  console.log('\n--- probe complete ---');
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
}
