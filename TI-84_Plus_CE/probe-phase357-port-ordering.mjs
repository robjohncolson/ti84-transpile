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
const EXPECTED_HALT_PC = 0x0019B5;
const NMI_VECTOR = 0x000066;
const BOOT_MAX_STEPS = 5000;
const NMI_MAX_STEPS = 500;
const MAX_LOOP_ITERATIONS = 50000;
const NMI_WAKE_COUNT = 3;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function formatPort(port) {
  const normalized = Number(port) & 0xFFFF;
  const width = normalized > 0xFF ? 4 : 2;
  return hex(normalized, width);
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
  const memory = new Uint8Array(MEM_SIZE);
  memory.set(romBytes.subarray(0, Math.min(memory.length, romBytes.length)));
  return memory;
}

function clonePllState(bus) {
  const pll = bus.getState()?.pll ?? {};
  return {
    configured: pll.configured === true,
    locked: pll.locked === true,
    remainingReads: Number.isFinite(pll.remainingReads) ? pll.remainingReads : 0,
    lastWrite: Number.isFinite(pll.lastWrite) ? (pll.lastWrite & 0xFF) : 0,
  };
}

function boolText(value) {
  return value ? 'true' : 'false';
}

function pad(text, width) {
  return String(text).padEnd(width, ' ');
}

function summarizePort28Ops(ops) {
  const port28Ops = ops.filter((entry) => entry.port === 0x28);
  if (port28Ops.length === 0) {
    return 'none';
  }

  return port28Ops
    .map((entry) => `${entry.op}@${entry.step}(${hex(entry.value, 2)})`)
    .join(' -> ');
}

async function loadBlocks() {
  ensureTranspiledRom();
  const transpiledMod = await import(pathToFileURL(TRANSPILED_PATH).href);
  const rawBlocks =
    transpiledMod.PRELIFTED_BLOCKS ??
    transpiledMod.default?.PRELIFTED_BLOCKS ??
    transpiledMod.default ??
    transpiledMod;

  const blocks = normalizeBlocks(rawBlocks);
  if (Object.keys(blocks).length === 0) {
    throw new Error('Unable to locate PRELIFTED_BLOCKS in ROM.transpiled.js');
  }

  return blocks;
}

function installPortProbe(cpu, bus, state) {
  const originalRead = bus.read.bind(bus);
  const originalWrite = bus.write.bind(bus);

  const record = (op, port, value, before, after) => {
    const wake = state.currentWake;
    if (!wake?.active) {
      return;
    }

    wake.ops.push({
      step: wake.ops.length + 1,
      block: (cpu._currentBlockPc ?? cpu.pc ?? 0) & 0xFFFFFF,
      op,
      port: Number(port) & 0xFFFF,
      value: Number(value) & 0xFF,
      before,
      after,
    });
  };

  bus.read = function patchedRead(port) {
    const before = clonePllState(bus);
    const value = originalRead(port);
    const after = clonePllState(bus);
    record('READ', port, value, before, after);
    return value;
  };

  bus.write = function patchedWrite(port, value) {
    const before = clonePllState(bus);
    originalWrite(port, value);
    const after = clonePllState(bus);
    record('WRITE', port, value, before, after);
  };
}

function printWake(wake) {
  console.log(`NMI #${wake.index}:`);
  console.log(`  Triggered from HALT at ${hex(wake.haltPc)}; return PC ${hex(wake.returnPc)}; termination=${wake.termination} lastPc=${hex(wake.lastPc)}`);
  console.log('  Step  Block     Op     Port    Value  Before.locked  Before.rem  Before.lastW  After.locked  After.rem  After.lastW');

  if (wake.ops.length === 0) {
    console.log('  (no port operations captured)');
  } else {
    for (const entry of wake.ops) {
      console.log(
        `  ${pad(entry.step, 4)}  ${pad(hex(entry.block), 8)}  ${pad(entry.op, 5)}  ${pad(formatPort(entry.port), 6)}  ${pad(hex(entry.value, 2), 5)}  `
        + `${pad(boolText(entry.before.locked), 13)}  ${pad(entry.before.remainingReads, 10)}  ${pad(hex(entry.before.lastWrite, 2), 12)}  `
        + `${pad(boolText(entry.after.locked), 12)}  ${pad(entry.after.remainingReads, 9)}  ${hex(entry.after.lastWrite, 2)}`,
      );
    }
  }

  console.log(`  Port 0x28 ordering: ${summarizePort28Ops(wake.ops)}`);
  console.log('');
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error('ROM.rom is missing.');
  }

  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));
  const blocks = await loadBlocks();
  const memory = createMemory(romBytes);
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(blocks, memory, { peripherals });
  const cpu = executor.cpu;

  cpu.mem = memory;
  cpu.io = peripherals;
  cpu.pc = BOOT_ENTRY;
  cpu.madl = 0;
  cpu.adl = false;

  const probeState = { currentWake: null };
  installPortProbe(cpu, peripherals, probeState);

  console.log('Phase 357: NMI Port Ordering Trace');
  console.log('==================================');
  console.log(`Boot config: entry=${hex(BOOT_ENTRY)}:${BOOT_MODE} maxSteps=${BOOT_MAX_STEPS} pllDelay=2 timerInterrupt=false`);

  const bootResult = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
  });

  const bootHaltPc = (bootResult.lastPc ?? 0) & 0xFFFFFF;
  if (bootResult.termination !== 'halt' || bootHaltPc !== EXPECTED_HALT_PC) {
    throw new Error(
      `Expected initial HALT at ${hex(EXPECTED_HALT_PC)}, got termination=${bootResult.termination} lastPc=${hex(bootHaltPc)}`,
    );
  }

  console.log(`Boot result: termination=${bootResult.termination} steps=${bootResult.steps} haltPc=${hex(bootHaltPc)}:${bootResult.lastMode ?? 'adl'}`);
  console.log(`PLL at HALT: locked=${boolText(clonePllState(peripherals).locked)} remainingReads=${clonePllState(peripherals).remainingReads} lastWrite=${hex(clonePllState(peripherals).lastWrite, 2)}`);
  console.log('');

  let currentPc = bootHaltPc;
  let currentMode = bootResult.lastMode ?? (cpu.madl ? 'adl' : 'z80');

  for (let index = 1; index <= NMI_WAKE_COUNT; index += 1) {
    const wake = {
      index,
      haltPc: currentPc,
      returnPc: ((currentPc + 1) & 0xFFFFFF),
      lastPc: currentPc,
      termination: 'not-run',
      ops: [],
      active: false,
    };

    probeState.currentWake = wake;
    peripherals.triggerNMI();

    const runResult = executor.runFrom(currentPc, currentMode, {
      maxSteps: NMI_MAX_STEPS,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      onInterrupt(kind, returnPc, vector) {
        if (kind === 'nmi' && vector === NMI_VECTOR && probeState.currentWake === wake) {
          wake.active = true;
          wake.returnPc = returnPc & 0xFFFFFF;
        }
      },
    });

    wake.active = false;
    wake.termination = runResult.termination;
    wake.lastPc = (runResult.lastPc ?? currentPc) & 0xFFFFFF;
    probeState.currentWake = null;

    printWake(wake);

    currentPc = wake.lastPc;
    currentMode = runResult.lastMode ?? currentMode;

    if (runResult.termination !== 'halt') {
      console.log(`Stopping after NMI #${index} because termination was ${runResult.termination}.`);
      break;
    }
  }
}

main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
