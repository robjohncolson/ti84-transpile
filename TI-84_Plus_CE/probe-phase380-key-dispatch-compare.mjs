#!/usr/bin/env node

/**
 * Phase 380 — Key Dispatch Comparison
 *
 * Tests whether ENTER, CLEAR, and 2ND produce different dispatch behavior
 * through the OS event loop (0x003A7D → 0x001713 → 0x001853 chain).
 *
 * Session 379 showed all keys take the same Z-return path through 0x0158DE.
 * This probe compares the full set of blocks visited per key to find any
 * divergence in the dispatch chain.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MODE = 'adl';
const MEM_SIZE = 0x1000000;

// Boot and event loop addresses
const PHASE1_ENTRY = 0x000000;
const PHASE2_ENTRY = 0x08C331;
const PHASE3_ENTRY = 0x0802B2;
const EVENT_LOOP_ENTRY = 0x003A73;

// Dispatch chain addresses
const DISPATCH_ENTRY = 0x003A7D;
const NORMAL_KEY_HANDLER = 0x001713;
const KEY_HANDLER_1853 = 0x001853;
const POST_KEY_HANDLER = 0x0158DE;
const HALT_ENTRY = 0x0019B5;

// Stack
const STACK_RESET_TOP = 0xD1A87E;
const BOOT_RESET_SP = STACK_RESET_TOP - 3;
const EVENT_RESET_SP = STACK_RESET_TOP - 12;

// Key memory addresses
const KEY_STATUS_ADDR = 0xD00080;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_AVAILABLE_MASK = 0x08;

// Memory seeds
const FLASH_SEED_ADDR = 0x020100;
const FLASH_SEED_BYTES = [0x5A, 0xA5, 0x00];
const SYSFLAG_ADDR = 0xD177BA;

const GPIO_VALUE = 0xEE;

// Phase options
const PHASE1_OPTS = { maxSteps: 20000, maxLoopIterations: 32 };
const PHASE2_OPTS = { maxSteps: 100000, maxLoopIterations: 10000 };
const PHASE3_OPTS = { maxSteps: 100, maxLoopIterations: 32 };
const EVENT_OPTS = { maxSteps: 500000, maxLoopIterations: 500000 };

// Keys to compare
const KEY_CASES = [
  { name: 'ENTER', scanCode: 0x29 },
  { name: 'CLEAR', scanCode: 0x2F },
  { name: '2ND',   scanCode: 0x06 },
];

// Dispatch chain blocks to watch
const CHAIN_BLOCKS = [
  DISPATCH_ENTRY,
  NORMAL_KEY_HANDLER,
  KEY_HANDLER_1853,
  POST_KEY_HANDLER,
  HALT_ENTRY,
];

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase',
  'halted', 'cycles', 'pc', 'stepCount',
];

// --- Utilities ---

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function count(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function makeKey(addr, mode = MODE) {
  return `${(addr & 0xFFFFFF).toString(16).padStart(6, '0')}:${mode}`;
}

function normalizeBlocks(raw) {
  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.filter((entry) => entry?.id).map((entry) => [entry.id, entry]));
  }
  return raw ?? {};
}

function createMemoryImage(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(mem.length, romBytes.length)));
  return mem;
}

function snapshotCpu(cpu) {
  const snapshot = {};
  for (const field of CPU_SNAPSHOT_FIELDS) {
    snapshot[field] = cpu[field];
  }
  return snapshot;
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_SNAPSHOT_FIELDS) {
    cpu[field] = snapshot[field];
  }
}

function restoreLcdMmio(executor, snapshot) {
  if (!snapshot || !executor?.lcdMmio) return;
  executor.lcdMmio.upbase = snapshot.upbase;
  executor.lcdMmio.control = snapshot.control;
}

// --- Boot ---

function runBootPhases(blocks, romBytes) {
  const mem = createMemoryImage(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false, gpioValue: GPIO_VALUE });
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;

  // Phase 1: z80 mode cold start
  const phase1 = executor.runFrom(PHASE1_ENTRY, 'z80', PHASE1_OPTS);

  // Phase 2: ADL mode init
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = BOOT_RESET_SP;
  mem.fill(0xFF, BOOT_RESET_SP, BOOT_RESET_SP + 3);
  const phase2 = executor.runFrom(PHASE2_ENTRY, MODE, PHASE2_OPTS);

  // Phase 3: OS init
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = KEY_STATUS_ADDR;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = BOOT_RESET_SP;
  mem.fill(0xFF, BOOT_RESET_SP, BOOT_RESET_SP + 3);
  const phase3 = executor.runFrom(PHASE3_ENTRY, MODE, PHASE3_OPTS);

  return {
    phaseResults: [
      { label: 'Phase 1', result: phase1 },
      { label: 'Phase 2', result: phase2 },
      { label: 'Phase 3', result: phase3 },
    ],
    memSnapshot: Buffer.from(mem),
    cpuSnapshot: snapshotCpu(cpu),
    lcdSnapshot: executor.lcdMmio
      ? { upbase: executor.lcdMmio.upbase, control: executor.lcdMmio.control }
      : null,
  };
}

function seedMemory(mem) {
  for (let i = 0; i < FLASH_SEED_BYTES.length; i += 1) {
    mem[FLASH_SEED_ADDR + i] = FLASH_SEED_BYTES[i];
  }
  mem[SYSFLAG_ADDR] = 0x00;
}

function prepareEventLoop(cpu, executor, mem, bootState) {
  restoreCpu(cpu, bootState.cpuSnapshot);
  restoreLcdMmio(executor, bootState.lcdSnapshot);
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu.f = 0x40;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._ix = 0xD1A860;
  cpu._iy = KEY_STATUS_ADDR;
  cpu.sp = EVENT_RESET_SP;
  mem.fill(0xFF, EVENT_RESET_SP, EVENT_RESET_SP + 12);
}

// --- Per-key event loop run ---

function runKeyCase(blocks, romBytes, bootState, keyCase) {
  const mem = Uint8Array.from(bootState.memSnapshot);
  const peripherals = createPeripheralBus({ timerInterrupt: false, gpioValue: GPIO_VALUE });
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;

  prepareEventLoop(cpu, executor, mem, bootState);
  seedMemory(mem);

  // Inject key via peripherals.setKeyPressed
  peripherals.setKeyPressed(mem, keyCase.scanCode);

  // Track all visited blocks and dispatch chain hits
  const uniqueBlocks = new Set();
  const chainHits = new Map();
  let dispatchReached = false;
  let postKeyReached = false;

  const result = executor.runFrom(EVENT_LOOP_ENTRY, MODE, {
    ...EVENT_OPTS,
    diHaltBypass: true,
    diHaltBypassEntry: EVENT_LOOP_ENTRY,
    onBlock(pc, mode) {
      const addr = pc & 0xFFFFFF;
      uniqueBlocks.add(makeKey(addr, mode));

      if (CHAIN_BLOCKS.includes(addr)) {
        chainHits.set(addr, (chainHits.get(addr) ?? 0) + 1);
      }

      if (addr === DISPATCH_ENTRY) {
        dispatchReached = true;
      }
      if (addr === POST_KEY_HANDLER) {
        postKeyReached = true;
      }
    },
  });

  const finalScanCode = mem[KEY_SCAN_CODE_ADDR] & 0xFF;
  const finalKeyStatus = mem[KEY_STATUS_ADDR] & 0xFF;
  const pass = dispatchReached;

  return {
    keyCase,
    result,
    uniqueBlocks,
    chainHits,
    dispatchReached,
    postKeyReached,
    finalScanCode,
    finalKeyStatus,
    pass,
  };
}

// --- Output ---

function printPerKeyResult(run) {
  const { keyCase, result, uniqueBlocks, chainHits } = run;

  console.log(`--- ${keyCase.name} (scanCode=${hexByte(keyCase.scanCode)}) ---`);
  console.log(`  steps=${count(result.steps)} termination=${result.termination} lastPc=${hex(result.lastPc)}`);
  console.log(`  unique blocks: ${count(uniqueBlocks.size)}`);
  console.log(`  dispatch chain hits:`);
  console.log(`    0x003A7D (dispatch entry):    ${count(chainHits.get(DISPATCH_ENTRY) ?? 0)}`);
  console.log(`    0x001713 (normal key handler): ${count(chainHits.get(NORMAL_KEY_HANDLER) ?? 0)}`);
  console.log(`    0x001853 (key handler 1853):   ${count(chainHits.get(KEY_HANDLER_1853) ?? 0)}`);
  console.log(`    0x0158DE (post key / flash):   ${count(chainHits.get(POST_KEY_HANDLER) ?? 0)}`);
  console.log(`    0x0019B5 (halt):               ${count(chainHits.get(HALT_ENTRY) ?? 0)}`);
  console.log(`  finalScanCode=${hexByte(run.finalScanCode)} finalStatus=${hexByte(run.finalKeyStatus)}`);
  console.log(`  dispatch reached: ${run.dispatchReached ? 'yes' : 'no'}`);
  console.log(`  0x0158DE reached: ${run.postKeyReached ? 'yes' : 'no'}`);
  console.log(`  verdict: ${run.pass ? 'PASS' : 'FAIL'}`);
  console.log('');
}

function printComparison(results) {
  console.log('=== BLOCK SET COMPARISON ===');
  console.log('');

  // Collect all block sets
  const blockSets = results.map((r) => r.uniqueBlocks);
  const names = results.map((r) => r.keyCase.name);

  // Find blocks common to ALL keys
  const commonBlocks = new Set([...blockSets[0]].filter(
    (block) => blockSets.every((set) => set.has(block)),
  ));
  console.log(`Blocks common to all ${names.length} keys: ${count(commonBlocks.size)}`);

  // Find blocks unique to each key
  for (let i = 0; i < results.length; i += 1) {
    const others = blockSets.filter((_, j) => j !== i);
    const uniqueToThis = [...blockSets[i]].filter(
      (block) => !others.some((set) => set.has(block)),
    );
    console.log(`Blocks unique to ${names[i]}: ${count(uniqueToThis.length)}`);
    if (uniqueToThis.length > 0) {
      const sample = uniqueToThis.slice(0, 20).map((b) => `  0x${b.split(':')[0].toUpperCase()}`);
      for (const line of sample) {
        console.log(line);
      }
      if (uniqueToThis.length > 20) {
        console.log(`  ... and ${uniqueToThis.length - 20} more`);
      }
    }
  }

  // Pairwise comparison
  console.log('');
  console.log('Pairwise overlap:');
  for (let i = 0; i < results.length; i += 1) {
    for (let j = i + 1; j < results.length; j += 1) {
      const shared = [...blockSets[i]].filter((b) => blockSets[j].has(b)).length;
      const onlyI = [...blockSets[i]].filter((b) => !blockSets[j].has(b)).length;
      const onlyJ = [...blockSets[j]].filter((b) => !blockSets[i].has(b)).length;
      console.log(
        `  ${names[i]} vs ${names[j]}: shared=${count(shared)} `
        + `only-${names[i]}=${count(onlyI)} only-${names[j]}=${count(onlyJ)}`,
      );
    }
  }
  console.log('');

  // Check 0x0158DE path divergence
  const postKeyPaths = results.map((r) => r.postKeyReached);
  const allSamePath = postKeyPaths.every((v) => v === postKeyPaths[0]);
  console.log(`0x0158DE path: ${allSamePath ? 'SAME for all keys' : 'DIFFERS between keys'}`);
  for (const r of results) {
    console.log(`  ${r.keyCase.name}: ${r.postKeyReached ? 'reached' : 'not reached'}`);
  }
  console.log('');
}

function printSummaryTable(results) {
  console.log('=== SUMMARY TABLE ===');
  console.log('Key     Scan  Blocks  Dispatch  1713  1853  158DE  Halt  Stop                    Verdict');
  for (const run of results) {
    const stop = `${run.result.termination}@${hex(run.result.lastPc)}`;
    console.log(
      `${run.keyCase.name.padEnd(7)} `
      + `${hexByte(run.keyCase.scanCode).padEnd(5)} `
      + `${String(run.uniqueBlocks.size).padEnd(7)} `
      + `${(run.dispatchReached ? 'yes' : 'no').padEnd(9)} `
      + `${count(run.chainHits.get(NORMAL_KEY_HANDLER) ?? 0).padEnd(5)} `
      + `${count(run.chainHits.get(KEY_HANDLER_1853) ?? 0).padEnd(5)} `
      + `${count(run.chainHits.get(POST_KEY_HANDLER) ?? 0).padEnd(6)} `
      + `${count(run.chainHits.get(HALT_ENTRY) ?? 0).padEnd(5)} `
      + `${stop.padEnd(23)} `
      + `${run.pass ? 'PASS' : 'FAIL'}`,
    );
  }
  console.log('');
}

// --- Main ---

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

  console.log('=== PROBE: PHASE 380 — KEY DISPATCH COMPARISON ===');
  console.log('Tests whether ENTER, CLEAR, and 2ND produce different dispatch');
  console.log('behavior through the 0x003A7D -> 0x001713 -> 0x001853 chain.');
  console.log(`Event loop entry: ${hex(EVENT_LOOP_ENTRY)}  DI+HALT bypass enabled`);
  console.log('');

  // Boot phases (shared across all key runs)
  console.log('--- Boot Phases ---');
  const bootState = runBootPhases(blocks, romBytes);
  for (const phase of bootState.phaseResults) {
    console.log(
      `  ${phase.label}: steps=${count(phase.result.steps)} `
      + `termination=${phase.result.termination} lastPc=${hex(phase.result.lastPc)}`,
    );
  }
  console.log('');

  // Run each key case
  const results = KEY_CASES.map((keyCase) => runKeyCase(blocks, romBytes, bootState, keyCase));

  // Print per-key results
  for (const run of results) {
    printPerKeyResult(run);
  }

  // Print comparison
  printComparison(results);

  // Print summary table
  printSummaryTable(results);

  // Overall verdict
  const passCount = results.filter((r) => r.pass).length;
  const allPass = passCount === results.length;

  console.log('=== VERDICT ===');
  console.log(`${count(passCount)}/${count(results.length)} keys dispatched successfully.`);

  // Check if any key diverges
  const blockCounts = results.map((r) => r.uniqueBlocks.size);
  const allSameCount = blockCounts.every((c) => c === blockCounts[0]);
  const blockSets = results.map((r) => r.uniqueBlocks);
  const allIdentical = blockSets.every((set) => {
    if (set.size !== blockSets[0].size) return false;
    for (const block of set) {
      if (!blockSets[0].has(block)) return false;
    }
    return true;
  });

  if (allIdentical) {
    console.log('All keys visit IDENTICAL block sets — no dispatch divergence detected.');
  } else if (allSameCount) {
    console.log('Block counts match but sets differ — subtle path divergence detected.');
  } else {
    console.log('Block sets DIFFER between keys — dispatch divergence confirmed.');
  }

  console.log(allPass ? 'Overall result: PASS' : 'Overall result: FAIL');
  console.log('');
  console.log('=== END PROBE ===');

  process.exitCode = allPass ? 0 : 1;
}

main().catch((error) => {
  console.error(`FAIL: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  process.exitCode = 1;
});
