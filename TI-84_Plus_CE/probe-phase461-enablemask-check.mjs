#!/usr/bin/env node
/**
 * Phase 461 - Enable Mask Diagnostic Probe
 *
 * Boots the OS (timer disabled) and then reads the FTINTC enable mask
 * ports (0x5004-0x5006) to see whether the OS enables the timer interrupt
 * (bit 4) during boot.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;

const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

function hex(value, width = 6) {
  if (value === undefined || value === null) {
    return 'n/a';
  }
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function coldBoot(executor, cpu, mem) {
  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  return result;
}

async function main() {
  console.log('=== Phase 461 - Enable Mask Diagnostic Probe ===');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const bootResult = coldBoot(executor, cpu, mem);
  console.log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc, 6)}`);

  // Read FTINTC enable mask ports after boot
  const enableLow = peripherals.read(0x5004);
  const enableMid = peripherals.read(0x5005);
  const enableHigh = peripherals.read(0x5006);
  const enableMask24 = enableLow | (enableMid << 8) | (enableHigh << 16);

  console.log(`\nFTINTC Enable Mask after boot:`);
  console.log(`  port 0x5004 (low byte):  ${hex(enableLow, 2)} = 0b${enableLow.toString(2).padStart(8, '0')}`);
  console.log(`  port 0x5005 (mid byte):  ${hex(enableMid, 2)} = 0b${enableMid.toString(2).padStart(8, '0')}`);
  console.log(`  port 0x5006 (high byte): ${hex(enableHigh, 2)} = 0b${enableHigh.toString(2).padStart(8, '0')}`);
  console.log(`  full 24-bit mask:        ${hex(enableMask24, 6)} = 0b${enableMask24.toString(2).padStart(24, '0')}`);

  const timerBitSet = (enableLow & (1 << 4)) !== 0;
  console.log(`\nTimer interrupt (bit 4) enabled by OS: ${timerBitSet ? 'YES' : 'NO'}`);

  if (!timerBitSet) {
    console.log('  -> OS does NOT enable timer interrupt during boot.');
    console.log('  -> Probes must manually set enableMask bit 4 via peripherals.write(0x5004, ...)');
  } else {
    console.log('  -> OS enables timer interrupt during boot. triggerIRQ() fix should be sufficient.');
  }

  // Also read raw status to see current state
  const rawLow = peripherals.read(0x5000);
  const rawMid = peripherals.read(0x5001);
  const rawHigh = peripherals.read(0x5002);
  const rawStatus24 = rawLow | (rawMid << 8) | (rawHigh << 16);

  console.log(`\nFTINTC Raw Status after boot:`);
  console.log(`  port 0x5000 (low byte):  ${hex(rawLow, 2)} = 0b${rawLow.toString(2).padStart(8, '0')}`);
  console.log(`  port 0x5001 (mid byte):  ${hex(rawMid, 2)} = 0b${rawMid.toString(2).padStart(8, '0')}`);
  console.log(`  port 0x5002 (high byte): ${hex(rawHigh, 2)} = 0b${rawHigh.toString(2).padStart(8, '0')}`);
  console.log(`  full 24-bit raw status:  ${hex(rawStatus24, 6)} = 0b${rawStatus24.toString(2).padStart(24, '0')}`);

  // Check masked status (what ISR handler reads at 0x5014)
  const maskedLow = peripherals.read(0x5014);
  const maskedMid = peripherals.read(0x5015);
  const maskedHigh = peripherals.read(0x5016);
  const maskedStatus24 = maskedLow | (maskedMid << 8) | (maskedHigh << 16);

  console.log(`\nFTINTC Masked Status (rawStatus & enableMask) after boot:`);
  console.log(`  port 0x5014 (low byte):  ${hex(maskedLow, 2)} = 0b${maskedLow.toString(2).padStart(8, '0')}`);
  console.log(`  port 0x5015 (mid byte):  ${hex(maskedMid, 2)} = 0b${maskedMid.toString(2).padStart(8, '0')}`);
  console.log(`  port 0x5016 (high byte): ${hex(maskedHigh, 2)} = 0b${maskedHigh.toString(2).padStart(8, '0')}`);
  console.log(`  full 24-bit masked:      ${hex(maskedStatus24, 6)} = 0b${maskedStatus24.toString(2).padStart(24, '0')}`);

  console.log('\n=== Phase 461 Complete ===');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
