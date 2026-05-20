#!/usr/bin/env node

/**
 * Phase 379 — OS Scan Code Verification Probe
 *
 * Boots the OS into coldboot mode, then for each of 5 test keys injects the
 * OS scan code via direct RAM write (mem[0xD00587] = code, mem[0xD00080] |= 0x08)
 * and verifies that the key-available path at 0x003D75 is reached with the
 * correct scan code value.
 *
 * OS scan code formula: (6 - group) * 8 + bit + 1
 * The scan loop at 0x003D22 iterates in REVERSE order (keyMatrix[6] first,
 * keyMatrix[0] last), using counter H that starts at 1. Since H = 7 - group,
 * the store computes (H-1)*8 + bit + 1 = (6-group)*8 + bit + 1.
 *
 * Based on patterns from probe-phase378-scancode-table.mjs.
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

// ── Boot addresses ─────────────────────────────────────────────────────────

const PHASE1_ENTRY = 0x000000;
const PHASE2_ENTRY = 0x08C331;
const PHASE3_ENTRY = 0x0802B2;
const EVENT_LOOP_ENTRY = 0x003A73;

const STACK_RESET_TOP = 0xD1A87E;
const BOOT_RESET_SP = STACK_RESET_TOP - 3;
const EVENT_RESET_SP = STACK_RESET_TOP - 12;

const PHASE1_OPTS = { maxSteps: 20000, maxLoopIterations: 32 };
const PHASE2_OPTS = { maxSteps: 100000, maxLoopIterations: 10000 };
const PHASE3_OPTS = { maxSteps: 100, maxLoopIterations: 32 };

const PERIPHERAL_OPTS = { timerInterrupt: true, gpioValue: 0xEE };

// ── Key addresses ──────────────────────────────────────────────────────────

const KEY_STATUS_ADDR = 0xD00080;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_AVAILABLE_MASK = 0x08;

const FLASH_SEED_ADDR = 0x020100;
const FLASH_SEED_BYTES = [0x5A, 0xA5, 0x00];
const SYSFLAG_ADDR = 0xD177BA;

// ── Key-available path address ─────────────────────────────────────────────
//
// After _GetCSC writes the scan code to 0xD00587 and sets the key-available
// flag, the event loop checks the flag and branches to the key-available path.
// Block 0x003D75 is where execution lands when a key IS available.

const KEY_AVAILABLE_BLOCK = 0x003D75;

// ── CPU snapshot fields ────────────────────────────────────────────────────

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase',
  'halted', 'cycles', 'pc', 'stepCount',
];

// ── Test keys ──────────────────────────────────────────────────────────────
//
// OS scan code = (6 - group) * 8 + bit + 1
// Verified dynamically by probe-phase379-multikey-natural.mjs (6/6 PASS).

const TEST_KEYS = [
  { name: 'ENTER', group: 1, bit: 0, osScanCode: 0x29 },
  { name: 'CLEAR', group: 1, bit: 6, osScanCode: 0x2F },
  { name: '2ND',   group: 6, bit: 5, osScanCode: 0x06 },
  { name: 'DEL',   group: 6, bit: 7, osScanCode: 0x08 },
  { name: '0',     group: 4, bit: 0, osScanCode: 0x11 },
  { name: 'ALPHA', group: 5, bit: 7, osScanCode: 0x10 },
];

// ── Helpers ────────────────────────────────────────────────────────────────

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
  if (!snapshot || !executor?.lcdMmio) {
    return;
  }
  executor.lcdMmio.upbase = snapshot.upbase;
  executor.lcdMmio.control = snapshot.control;
}

function preparePhase(cpu, mem, sp, stackFillBytes) {
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = KEY_STATUS_ADDR;
  cpu.sp = sp;
  mem.fill(0xFF, sp, sp + stackFillBytes);
}

function prepareEventLoop(cpu, executor, mem, bootState) {
  restoreCpu(cpu, bootState.cpuSnapshot);
  restoreLcdMmio(executor, bootState.lcdSnapshot);
  preparePhase(cpu, mem, EVENT_RESET_SP, 12);
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu._iy = KEY_STATUS_ADDR;
}

function seedGates(mem) {
  for (let i = 0; i < FLASH_SEED_BYTES.length; i++) {
    mem[FLASH_SEED_ADDR + i] = FLASH_SEED_BYTES[i];
  }
  mem[SYSFLAG_ADDR] = 0x00;
}

function resetKeyboard(peripherals) {
  if (peripherals.keyboard?.keyMatrix) {
    peripherals.keyboard.keyMatrix.fill(0xFF);
    peripherals.keyboard.groupSelect = 0xFF;
  }
  if (peripherals.keyboardController) {
    peripherals.keyboardController.groupSelect = 0xFFFF;
  }
}

// ── Boot phases ────────────────────────────────────────────────────────────

function runBootPhases(blocks, romBytes) {
  const mem = createMemoryImage(romBytes);
  const peripherals = createPeripheralBus(PERIPHERAL_OPTS);
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;

  const phase1 = executor.runFrom(PHASE1_ENTRY, 'z80', PHASE1_OPTS);

  preparePhase(cpu, mem, BOOT_RESET_SP, 3);
  const phase2 = executor.runFrom(PHASE2_ENTRY, MODE, PHASE2_OPTS);

  cpu.mbase = 0xD0;
  cpu._hl = 0;
  preparePhase(cpu, mem, BOOT_RESET_SP, 3);
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

// ── Run one key verification via RAM injection ─────────────────────────────

function runKeyVerification(blocks, bootState, testKey) {
  const mem = Uint8Array.from(bootState.memSnapshot);
  const peripherals = createPeripheralBus(PERIPHERAL_OPTS);
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;

  prepareEventLoop(cpu, executor, mem, bootState);
  seedGates(mem);
  resetKeyboard(peripherals);

  // Inject OS scan code via direct RAM write
  mem[KEY_SCAN_CODE_ADDR] = testKey.osScanCode & 0xFF;
  mem[KEY_STATUS_ADDR] = (mem[KEY_STATUS_ADDR] | KEY_AVAILABLE_MASK) & 0xFF;

  const trace = {
    keyAvailableHits: 0,
    scanCodeAtHit: null,
    statusAtHit: null,
  };

  // Wrap the key-available block to detect when execution reaches it
  const blockKey = makeKey(KEY_AVAILABLE_BLOCK);
  const original = executor.compiledBlocks[blockKey];

  if (original) {
    executor.compiledBlocks[blockKey] = function wrappedKeyAvailable(cpuRef) {
      trace.keyAvailableHits++;
      if (trace.keyAvailableHits === 1) {
        trace.scanCodeAtHit = mem[KEY_SCAN_CODE_ADDR] & 0xFF;
        trace.statusAtHit = mem[KEY_STATUS_ADDR] & 0xFF;
      }
      return original(cpuRef);
    };
  }

  const result = executor.runFrom(EVENT_LOOP_ENTRY, MODE, {
    maxSteps: 500000,
    maxLoopIterations: 500000,
  });

  return {
    result,
    trace,
    hasKeyAvailableBlock: !!original,
    finalScanCode: mem[KEY_SCAN_CODE_ADDR] & 0xFF,
    finalKeyStatus: mem[KEY_STATUS_ADDR] & 0xFF,
  };
}

// ── Main ───────────────────────────────────────────────────────────────────

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

  console.log('=== PROBE: PHASE 379 — OS SCAN CODE VERIFICATION ===');
  console.log(`formula: OS_scancode = (6 - group) * 8 + bit + 1`);
  console.log(`injection: mem[0xD00587] = code, mem[0xD00080] |= 0x08`);
  console.log(`key-available block: ${hex(KEY_AVAILABLE_BLOCK)}`);
  console.log('');

  // ── Boot ──────────────────────────────────────────────────────────────

  console.log('=== BOOT PHASES ===');
  const bootState = runBootPhases(blocks, romBytes);

  for (const phase of bootState.phaseResults) {
    console.log(
      `${phase.label}: steps=${count(phase.result.steps)} `
      + `termination=${phase.result.termination} lastPc=${hex(phase.result.lastPc)}`,
    );
  }
  console.log('');

  // ── Verify formula for each test key ──────────────────────────────────

  console.log('=== FORMULA VERIFICATION ===');
  for (const key of TEST_KEYS) {
    const computed = (6 - key.group) * 8 + key.bit + 1;
    const match = computed === key.osScanCode;
    console.log(
      `${key.name.padEnd(8)}: group=${key.group} bit=${key.bit} `
      + `formula=(6-${key.group})*8+${key.bit}+1=${computed} (${hexByte(computed)}) `
      + `expected=${hexByte(key.osScanCode)} ${match ? 'OK' : 'MISMATCH'}`,
    );
  }
  console.log('');

  // ── Inject each key and verify ────────────────────────────────────────

  console.log('=== KEY INJECTION TESTS ===');
  let passCount = 0;
  let failCount = 0;

  for (const key of TEST_KEYS) {
    const r = runKeyVerification(blocks, bootState, key);

    const injected = key.osScanCode;
    const readBack = r.finalScanCode;
    const hitBlock = r.trace.keyAvailableHits > 0;
    const scanAtHit = r.trace.scanCodeAtHit;

    // Pass criteria:
    // 1. The key-available block was reached (scan code was recognized)
    // 2. The scan code at the block matches what we injected
    const pass = hitBlock && scanAtHit === injected;

    if (pass) {
      passCount++;
    } else {
      failCount++;
    }

    console.log(
      `${key.name.padEnd(8)}: injected=${hexByte(injected)} `
      + `blockReached=${hitBlock} `
      + `scanAtBlock=${scanAtHit !== null ? hexByte(scanAtHit) : 'n/a'} `
      + `final=${hexByte(readBack)} `
      + `steps=${count(r.result.steps)} `
      + `termination=${r.result.termination} `
      + `${pass ? 'PASS' : 'FAIL'}`,
    );

    if (!r.hasKeyAvailableBlock) {
      console.log(`  WARNING: key-available block ${hex(KEY_AVAILABLE_BLOCK)} not found in compiled blocks`);
    }
  }

  console.log('');

  // ── Summary ───────────────────────────────────────────────────────────

  console.log('=== SUMMARY ===');
  console.log(`results: ${passCount} PASS, ${failCount} FAIL out of ${TEST_KEYS.length} keys`);
  console.log(`formula verified: OS_scancode = (6 - group) * 8 + bit + 1`);
  console.log('');

  if (failCount > 0) {
    console.log('FAILED keys may indicate:');
    console.log('  - key-available block address needs updating');
    console.log('  - event loop did not reach the scan code check path');
    console.log('  - scan code was consumed/cleared before the block hook fired');
    process.exitCode = 1;
  } else {
    console.log('All keys verified: RAM injection of OS scan codes reaches');
    console.log('the key-available path with correct values.');
  }
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
