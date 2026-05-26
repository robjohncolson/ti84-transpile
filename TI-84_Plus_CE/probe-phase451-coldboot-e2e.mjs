#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MEM_SIZE = 0x1000000;
const VRAM_BASE = 0xD40000;
const VRAM_BYTE_SIZE = 320 * 240 * 2;
const STACK_RESET_TOP = 0xD1A87E;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE_ENTRIES = [0x0A2B72, 0x0A3301, 0x0A29EC, 0x0A2854];
const EVENT_LOOP_ENTRY = 0x003A73;

const RAM_COPY_SOURCE = 0x000EBB;
const RAM_COPY_DEST = 0xD18C22;
const RAM_COPY_LENGTH = 0x5A;

const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_AVAILABLE_FLAG_ADDR = 0xD00080;
const KEY_AVAILABLE_FLAG_MASK = 0x08;
const KEY_PROCESSING_ENABLE_ADDR = 0xD14091;
const DISPLAY_REFRESH_MODE_ADDR = 0xD177B7;
const DISPATCH_GATE_ADDR = 0xD177BA;
const KEY_ONE_SCAN_CODE = 0x12;

const MAX_MISSING_LOGS = 32;

function normalizeBlocks(raw) {
  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.filter((entry) => entry?.id).map((entry) => [entry.id, entry]));
  }
  return raw ?? {};
}

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function hexBytes(bytes) {
  return Array.from(bytes, (value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function count(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function makeBlockKey(pc, mode = 'adl') {
  return `${(pc & 0xFFFFFF).toString(16).padStart(6, '0')}:${mode}`;
}

function vramHash(mem) {
  return createHash('sha256')
    .update(mem.subarray(VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE))
    .digest('hex')
    .slice(0, 12);
}

function createMemoryImage(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, mem.length)));
  return mem;
}

function fillSentinel(mem, addr, size) {
  mem.fill(0xFF, addr, addr + size);
}

function clearInjectedKey(mem) {
  mem[KEY_SCAN_CODE_ADDR] = 0x00;
  mem[KEY_AVAILABLE_FLAG_ADDR] &= ~KEY_AVAILABLE_FLAG_MASK;
}

function injectKeyOne(mem) {
  clearInjectedKey(mem);
  mem[KEY_SCAN_CODE_ADDR] = KEY_ONE_SCAN_CODE;
  mem[KEY_AVAILABLE_FLAG_ADDR] |= KEY_AVAILABLE_FLAG_MASK;
  mem[DISPATCH_GATE_ADDR] = 0x00;
}

function applyOsFlags(mem) {
  mem[KEY_PROCESSING_ENABLE_ADDR] = 0x01;
  mem[DISPLAY_REFRESH_MODE_ADDR] = 0x55;
  mem[DISPATCH_GATE_ADDR] = 0x00;
}

function preCopyRamRoutine(mem, romBytes) {
  mem.set(romBytes.subarray(RAM_COPY_SOURCE, RAM_COPY_SOURCE + RAM_COPY_LENGTH), RAM_COPY_DEST);
}

function prepareKernelInit(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);
}

function preparePostInit(cpu, mem) {
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = KEY_AVAILABLE_FLAG_ADDR;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  fillSentinel(mem, cpu.sp, 3);
}

function prepareStage(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = KEY_AVAILABLE_FLAG_ADDR;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_RESET_TOP - 12;
  fillSentinel(mem, cpu.sp, 12);
}

function seedEventLoopCpu(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.f = 0x40;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._ix = 0xD1A860;
  cpu._iy = KEY_AVAILABLE_FLAG_ADDR;
  cpu.sp = STACK_RESET_TOP - 12;
  fillSentinel(mem, cpu.sp, 12);
}

function createProbeState() {
  return {
    uniqueBlocks: new Set(),
    missingBlocks: new Map(),
    errors: [],
    missingLogs: 0,
  };
}

function recordMissingBlock(state, label, pc, mode, step) {
  const addr = pc & 0xFFFFFF;
  const normalizedMode = mode ?? 'adl';
  const key = makeBlockKey(addr, normalizedMode);
  let entry = state.missingBlocks.get(key);

  if (!entry) {
    entry = {
      pc: addr,
      mode: normalizedMode,
      count: 0,
      firstLabel: label,
      firstStep: step + 1,
    };
    state.missingBlocks.set(key, entry);
  }

  entry.count += 1;

  if (state.missingLogs < MAX_MISSING_LOGS) {
    console.log(`[missing] ${label} step=${step + 1} pc=${hex(addr)} mode=${normalizedMode}`);
    state.missingLogs += 1;
  }
}

function runSegment(executor, probeState, label, entry, mode, options = {}) {
  const localUniqueBlocks = new Set();
  const localMissingBlocks = new Set();

  try {
    const result = executor.runFrom(entry, mode, {
      ...options,
      onBlock(pc, blockMode, meta, step) {
        const addr = pc & 0xFFFFFF;
        const normalizedMode = blockMode ?? mode;
        const key = makeBlockKey(addr, normalizedMode);
        probeState.uniqueBlocks.add(key);
        localUniqueBlocks.add(key);
        if (typeof options.onBlock === 'function') {
          options.onBlock(pc, blockMode, meta, step);
        }
      },
      onMissingBlock(pc, blockMode, step) {
        const addr = pc & 0xFFFFFF;
        const normalizedMode = blockMode ?? mode;
        localMissingBlocks.add(makeBlockKey(addr, normalizedMode));
        recordMissingBlock(probeState, label, addr, normalizedMode, step);
        if (typeof options.onMissingBlock === 'function') {
          options.onMissingBlock(pc, blockMode, step);
        }
      },
    });

    return {
      label,
      entry,
      mode,
      ok: true,
      steps: result.steps ?? 0,
      termination: result.termination ?? 'unknown',
      lastPc: result.lastPc ?? entry,
      lastMode: result.lastMode ?? mode,
      uniqueBlocks: localUniqueBlocks.size,
      missingBlocks: localMissingBlocks.size,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? (error.stack || error.message) : String(error);
    probeState.errors.push({ label, error: message });
    return {
      label,
      entry,
      mode,
      ok: false,
      steps: 0,
      termination: 'throw',
      lastPc: entry,
      lastMode: mode,
      uniqueBlocks: localUniqueBlocks.size,
      missingBlocks: localMissingBlocks.size,
      error: message,
    };
  }
}

function bootToHomeScreen(executor, cpu, mem, probeState) {
  const stages = [];

  const boot = runSegment(executor, probeState, 'boot', BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });
  stages.push(boot);
  if (!boot.ok) {
    return { ok: false, stages };
  }

  prepareKernelInit(cpu, mem);
  const kernel = runSegment(executor, probeState, 'kernelInit', KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });
  stages.push(kernel);
  if (!kernel.ok) {
    return { ok: false, stages };
  }

  preparePostInit(cpu, mem);
  const postInit = runSegment(executor, probeState, 'postInit', POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });
  stages.push(postInit);
  if (!postInit.ok) {
    return { ok: false, stages };
  }

  for (let index = 0; index < STAGE_ENTRIES.length; index += 1) {
    const stageEntry = STAGE_ENTRIES[index];
    prepareStage(cpu, mem);
    const stage = runSegment(executor, probeState, `stage${index + 1}`, stageEntry, 'adl', {
      maxSteps: 50000,
      maxLoopIterations: 500,
    });
    stages.push(stage);
    if (!stage.ok) {
      return { ok: false, stages };
    }
  }

  seedEventLoopCpu(cpu, mem);

  return {
    ok: true,
    stages,
    resumePc: EVENT_LOOP_ENTRY,
    resumeMode: 'adl',
  };
}

function printStageSummary(stage) {
  console.log(
    `  ${stage.label.padEnd(10)} status=${stage.ok ? 'completed' : 'threw'} `
    + `steps=${count(stage.steps)} term=${stage.termination} lastPc=${hex(stage.lastPc)} `
    + `mode=${stage.lastMode} uniqueBlocks=${count(stage.uniqueBlocks)} missing=${count(stage.missingBlocks)}`,
  );
  if (stage.error) {
    console.log(`    error=${stage.error.split(/\r?\n/u, 1)[0]}`);
  }
}

function printMissingSummary(probeState) {
  console.log('Missing blocks:');
  if (probeState.missingBlocks.size === 0) {
    console.log('  none');
    return;
  }

  const entries = [...probeState.missingBlocks.values()].sort((left, right) => right.count - left.count);
  for (const entry of entries.slice(0, 8)) {
    console.log(
      `  ${hex(entry.pc)}:${entry.mode} count=${count(entry.count)} `
      + `first=${entry.firstLabel}@step${count(entry.firstStep)}`,
    );
  }
  if (entries.length > 8) {
    console.log(`  ... ${count(entries.length - 8)} more`);
  }
}

function printErrorSummary(probeState) {
  console.log('Errors/crashes:');
  if (probeState.errors.length === 0) {
    console.log('  none');
    return;
  }

  for (const [index, entry] of probeState.errors.entries()) {
    console.log(`  ${index + 1}. ${entry.label}: ${entry.error.split(/\r?\n/u, 1)[0]}`);
  }
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error(`ROM not found: ${ROM_PATH}`);
  }

  if (!fs.existsSync(TRANSPILED_PATH)) {
    throw new Error(`Transpiled ROM not found: ${TRANSPILED_PATH}`);
  }

  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));
  const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
  const blocks = normalizeBlocks(
    romModule.PRELIFTED_BLOCKS
    ?? romModule.default?.PRELIFTED_BLOCKS
    ?? romModule.default
    ?? romModule,
  );

  if (!blocks || Object.keys(blocks).length === 0) {
    throw new Error('Unable to load PRELIFTED_BLOCKS from ROM.transpiled.js');
  }

  const mem = createMemoryImage(romBytes);
  mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;
  const probeState = createProbeState();

  console.log('=== PHASE 451 COLDBOOT E2E ===');
  console.log(`ROM: ${path.basename(ROM_PATH)}`);
  console.log(`Transpiled blocks: ${count(Object.keys(blocks).length)}`);
  console.log('');

  const boot = bootToHomeScreen(executor, cpu, mem, probeState);

  console.log('Boot stages:');
  for (const stage of boot.stages) {
    printStageSummary(stage);
  }
  console.log('');

  let baseline = { skipped: true };
  let keyRun = { skipped: true };

  if (boot.ok) {
    preCopyRamRoutine(mem, romBytes);
    applyOsFlags(mem);
    clearInjectedKey(mem);
    seedEventLoopCpu(cpu, mem);

    const baselineBefore = vramHash(mem);
    const baselineRun = runSegment(executor, probeState, 'baselineEventLoop', EVENT_LOOP_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: 10000,
      diHaltBypass: true,
      diHaltBypassEntry: EVENT_LOOP_ENTRY,
    });

    baseline = {
      ...baselineRun,
      skipped: false,
      beforeHash: baselineBefore,
      afterHash: vramHash(mem),
    };

    applyOsFlags(mem);
    clearInjectedKey(mem);
    seedEventLoopCpu(cpu, mem);

    const keyBefore = vramHash(mem);
    injectKeyOne(mem);
    const keyRunSegment = runSegment(executor, probeState, 'injectKey1', EVENT_LOOP_ENTRY, 'adl', {
      maxSteps: 500000,
      maxLoopIterations: 10000,
      diHaltBypass: true,
      diHaltBypassEntry: EVENT_LOOP_ENTRY,
    });

    const finalScanCode = mem[KEY_SCAN_CODE_ADDR] & 0xFF;
    const finalKeyFlag = mem[KEY_AVAILABLE_FLAG_ADDR] & KEY_AVAILABLE_FLAG_MASK;

    keyRun = {
      ...keyRunSegment,
      skipped: false,
      beforeHash: keyBefore,
      afterHash: vramHash(mem),
      finalScanCode,
      finalKeyFlag,
      keyConsumed: finalScanCode === 0x00 && finalKeyFlag === 0x00,
      finalDispatchGate: mem[DISPATCH_GATE_ADDR] & 0xFF,
    };
  }

  console.log('Runtime seeds:');
  console.log(
    `  RAM copy ${hex(RAM_COPY_SOURCE)} -> ${hex(RAM_COPY_DEST)} `
    + `bytes=${count(RAM_COPY_LENGTH)} preview=${hexBytes(mem.subarray(RAM_COPY_DEST, RAM_COPY_DEST + 8))}`,
  );
  console.log(
    `  Flags D14091=${hexByte(mem[KEY_PROCESSING_ENABLE_ADDR])} `
    + `D177B7=${hexByte(mem[DISPLAY_REFRESH_MODE_ADDR])} `
    + `D177BA=${hexByte(mem[DISPATCH_GATE_ADDR])}`,
  );
  console.log('');

  console.log('Baseline event loop:');
  if (baseline.skipped) {
    console.log('  skipped because boot did not complete cleanly');
  } else {
    console.log(
      `  steps=${count(baseline.steps)} term=${baseline.termination} `
      + `lastPc=${hex(baseline.lastPc)} mode=${baseline.lastMode}`,
    );
    console.log(
      `  vramHash ${baseline.beforeHash} -> ${baseline.afterHash} `
      + `changed=${yesNo(baseline.beforeHash !== baseline.afterHash)}`,
    );
  }
  console.log('');

  console.log('Key injection:');
  if (keyRun.skipped) {
    console.log('  skipped because boot did not complete cleanly');
  } else {
    console.log(
      `  injected scan=${hexByte(KEY_ONE_SCAN_CODE)} `
      + `D00587=${hexByte(KEY_ONE_SCAN_CODE)} IY.bit3=1 D177BA=${hexByte(0x00)}`,
    );
    console.log(
      `  steps=${count(keyRun.steps)} term=${keyRun.termination} `
      + `lastPc=${hex(keyRun.lastPc)} mode=${keyRun.lastMode}`,
    );
    console.log(
      `  consumed=${yesNo(keyRun.keyConsumed)} `
      + `final D00587=${hexByte(keyRun.finalScanCode)} `
      + `final IY.bit3=${keyRun.finalKeyFlag ? 1 : 0} `
      + `final D177BA=${hexByte(keyRun.finalDispatchGate)}`,
    );
    console.log(
      `  vramHash ${keyRun.beforeHash} -> ${keyRun.afterHash} `
      + `changed=${yesNo(keyRun.beforeHash !== keyRun.afterHash)}`,
    );
  }
  console.log('');

  console.log(`Total unique blocks executed: ${count(probeState.uniqueBlocks.size)}`);
  console.log('');

  printMissingSummary(probeState);
  console.log('');
  printErrorSummary(probeState);
  console.log('');

  const assertions = [
    {
      label: 'Boot completes without throw',
      pass: boot.ok,
    },
    {
      label: 'Event loop runs >1000 steps',
      pass: !baseline.skipped && baseline.ok && baseline.steps > 1000,
    },
    {
      label: 'Key "1" is consumed',
      pass: !keyRun.skipped && keyRun.ok && keyRun.keyConsumed,
    },
    {
      label: 'VRAM changes after key injection',
      pass: !keyRun.skipped && keyRun.beforeHash !== keyRun.afterHash,
    },
    {
      label: 'No unhandled errors',
      pass: probeState.errors.length === 0,
    },
  ];

  console.log('Assertions:');
  for (const assertion of assertions) {
    console.log(`  [${assertion.pass ? 'PASS' : 'FAIL'}] ${assertion.label}`);
  }

  const overallPass = assertions.every((assertion) => assertion.pass);
  console.log('');
  console.log(
    `Final status: ${overallPass ? 'PASS' : 'FAIL'} `
    + `finalPc=${hex(keyRun.lastPc ?? baseline.lastPc)} `
    + `termination=${keyRun.termination ?? baseline.termination ?? 'n/a'}`,
  );

  process.exitCode = overallPass ? 0 : 1;
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
