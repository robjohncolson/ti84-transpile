#!/usr/bin/env node
/**
 * Phase 376 Probe: Natural Keyboard Scan Test
 *
 * Tests whether the keyboard scan routine can detect ENTER naturally
 * (without direct RAM injection) now that keyboard port emulation is fixed.
 *
 * Compares two scenarios:
 *   A: ENTER in keyboard matrix only (natural scan via ports)
 *   B: ENTER in matrix + direct RAM injection
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

process.emitWarning = () => {};
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STACK_RESET_TOP = 0xD1A87E;

const EVENT_LOOP_ENTRY = 0x003A73;
const DISPATCH_BLOCK = 0x003A7D;
const SCAN_CODE_STORE_BLOCK = 0x003D4B;
const SCAN_CODE_ADDR = 0xD00587;
const KEY_AVAILABLE_ADDR = 0xD00080;
const KEY_AVAILABLE_MASK = 0x08;

// ENTER = keyMatrix[1] bit 0, scan code 0x10
const ENTER_GROUP = 1;
const ENTER_BIT = 0;
const ENTER_SCAN_CODE = 0x10;

const MAX_EVENT_STEPS = 500000;

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function createFreshSystem(opts = {}) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  const peripherals = createPeripheralBus({
    timerInterrupt: opts.timerInterrupt ?? true,
  });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  return { executor, cpu, mem, peripherals };
}

function coldBoot(executor, cpu, mem) {
  // Phase 1: z80 boot
  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  // Phase 2: kernel init
  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  // Phase 3: post-init
  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });
}

function setupEventLoop(cpu, mem) {
  // Dispatch gates
  mem[0x020100] = 0x5A;
  mem[0x020101] = 0xA5;
  mem[0x020102] = 0x00;
  mem[0xD177BA] = 0x00;

  // CPU state for event loop
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu.f = 0x40;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._ix = 0xD1A860;
  cpu._iy = 0xD00080;
  cpu.sp = STACK_RESET_TOP - 12;

  // Event loop support RAM
  mem[0xD02AD7] = 0xBE;
  mem[0xD02AD8] = 0x19;
  mem[0xD02AD9] = 0x00;
  mem[0xD0009B] = mem[0xD0009B] | 0x40;
}

function runScenario(label, opts) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Scenario ${label}`);
  console.log(`${'='.repeat(60)}`);

  const { executor, cpu, mem, peripherals } = createFreshSystem({ timerInterrupt: true });

  // Boot
  coldBoot(executor, cpu, mem);
  setupEventLoop(cpu, mem);

  // Set ENTER in keyboard matrix (natural scan)
  if (opts.matrixKey) {
    peripherals.setMatrixKey(ENTER_GROUP, ENTER_BIT, true);
    console.log(`  [setup] ENTER set in keyMatrix[${ENTER_GROUP}] bit ${ENTER_BIT}`);
  }

  // Direct RAM injection (legacy method)
  if (opts.ramInject) {
    mem[SCAN_CODE_ADDR] = ENTER_SCAN_CODE;
    mem[KEY_AVAILABLE_ADDR] = mem[KEY_AVAILABLE_ADDR] | KEY_AVAILABLE_MASK;
    console.log(`  [setup] Direct RAM injection: mem[0xD00587]=0x${ENTER_SCAN_CODE.toString(16)}, mem[0xD00080]|=0x08`);
  }

  // Record initial state
  const initScanCode = mem[SCAN_CODE_ADDR];
  const initKeyFlag = mem[KEY_AVAILABLE_ADDR];
  console.log(`  [pre-run] mem[0xD00587]=${hex(initScanCode, 2)}, mem[0xD00080]=${hex(initKeyFlag, 2)}`);

  // Run event loop
  const result = executor.runFrom(EVENT_LOOP_ENTRY, 'adl', {
    maxSteps: MAX_EVENT_STEPS,
    maxLoopIterations: 50000,
  });

  // Collect results
  const finalScanCode = mem[SCAN_CODE_ADDR];
  const finalKeyFlag = mem[KEY_AVAILABLE_ADDR];
  const reachedDispatch = !!(executor.visitCounts && executor.visitCounts[DISPATCH_BLOCK]);
  const reachedScanStore = !!(executor.visitCounts && executor.visitCounts[SCAN_CODE_STORE_BLOCK]);

  // Also check if visitCounts is exposed differently
  let dispatchVisits = 0;
  let scanStoreVisits = 0;
  if (executor.visitCounts) {
    dispatchVisits = executor.visitCounts[DISPATCH_BLOCK] || 0;
    scanStoreVisits = executor.visitCounts[SCAN_CODE_STORE_BLOCK] || 0;
  }

  console.log(`\n  [results]`);
  console.log(`    Steps executed:         ${result.steps ?? result.totalSteps ?? 'unknown'}`);
  console.log(`    Final PC:               ${hex(cpu.pc ?? result.pc)}`);
  console.log(`    Halted:                 ${cpu.halted}`);
  console.log(`    mem[0xD00587] (scan):   ${hex(finalScanCode, 2)} (was ${hex(initScanCode, 2)})`);
  console.log(`    mem[0xD00080] (flags):  ${hex(finalKeyFlag, 2)} (was ${hex(initKeyFlag, 2)})`);
  console.log(`    Key available bit set:  ${!!(finalKeyFlag & KEY_AVAILABLE_MASK)}`);
  console.log(`    Scan code = ENTER:      ${finalScanCode === ENTER_SCAN_CODE}`);
  console.log(`    Block 0x003A7D reached: ${reachedDispatch} (${dispatchVisits} visits)`);
  console.log(`    Block 0x003D4B reached: ${reachedScanStore} (${scanStoreVisits} visits)`);

  // Count unique blocks visited
  let uniqueBlocks = 0;
  if (executor.visitCounts) {
    for (const addr in executor.visitCounts) {
      if (executor.visitCounts[addr] > 0) uniqueBlocks++;
    }
  }
  console.log(`    Unique blocks visited:  ${uniqueBlocks}`);

  return {
    finalScanCode,
    finalKeyFlag,
    reachedDispatch,
    reachedScanStore,
    dispatchVisits,
    scanStoreVisits,
    steps: result.steps ?? result.totalSteps,
  };
}

// =====================================================
// Main
// =====================================================
console.log('Phase 376: Natural Keyboard Scan Test');
console.log('=====================================');
console.log(`ENTER: keyMatrix[${ENTER_GROUP}] bit ${ENTER_BIT}, scan code ${hex(ENTER_SCAN_CODE, 2)}`);
console.log(`Target: does the OS keyboard scan routine detect ENTER via port reads?`);

const resultA = runScenario('A: Matrix-only (natural scan)', {
  matrixKey: true,
  ramInject: false,
});

const resultB = runScenario('B: Matrix + RAM injection (legacy)', {
  matrixKey: true,
  ramInject: true,
});

// Summary comparison
console.log(`\n${'='.repeat(60)}`);
console.log('COMPARISON SUMMARY');
console.log(`${'='.repeat(60)}`);
console.log(`                          Scenario A (natural)   Scenario B (injected)`);
console.log(`  Scan code stored:       ${hex(resultA.finalScanCode, 2).padEnd(22)}${hex(resultB.finalScanCode, 2)}`);
console.log(`  Key available flag:     ${!!(resultA.finalKeyFlag & KEY_AVAILABLE_MASK)}${' '.repeat(18)}${!!(resultB.finalKeyFlag & KEY_AVAILABLE_MASK)}`);
console.log(`  Dispatch (0x003A7D):    ${String(resultA.reachedDispatch).padEnd(22)}${resultB.reachedDispatch}`);
console.log(`  Scan store (0x003D4B):  ${String(resultA.reachedScanStore).padEnd(22)}${resultB.reachedScanStore}`);

const naturalWorks = resultA.finalScanCode === ENTER_SCAN_CODE && !!(resultA.finalKeyFlag & KEY_AVAILABLE_MASK);
console.log(`\n  NATURAL SCAN WORKS: ${naturalWorks ? 'YES — keyboard port emulation delivers ENTER without RAM injection' : 'NO — scan routine did not populate scan code from matrix'}`);

if (resultA.reachedDispatch && !resultB.reachedDispatch) {
  console.log('  NOTE: Natural scan reached dispatch but injected did not (unexpected)');
} else if (!resultA.reachedDispatch && resultB.reachedDispatch) {
  console.log('  NOTE: Only injected scenario reached dispatch — natural scan may need more steps or additional setup');
}

process.exit(naturalWorks ? 0 : 1);
