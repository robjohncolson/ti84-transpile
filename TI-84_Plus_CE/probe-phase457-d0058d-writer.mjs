#!/usr/bin/env node
// Phase 457 probe: trace writes to D0058D (secondary key scan code register)
// and scan ROM for all references to D0058D to categorize read/write sites.
//
// Known ROM sequence at 0x003D4B:
//   LD (D00587), A   — write scan code
//   SET 3, (IY+0)    — set bit 3 of D00080 (key available)
//   OR A              — test if zero
//   RET Z             — return if no key
//   LD (D0058D), A    — write SAME scan code to D0058D
//   RET

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
const STACK_RESET_TOP = 0xD1A87E;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE_ENTRIES = [0x0A2B72, 0x0A3301, 0x0A29EC, 0x0A2854];
const EVENT_LOOP_ENTRY = 0x003A73;

const KEY_AVAILABLE_FLAG_ADDR = 0xD00080;
const KEY_AVAILABLE_FLAG_MASK = 0x08;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_SECONDARY_ADDR = 0xD0058D;
const KEY_PROCESSING_ENABLE_ADDR = 0xD14091;
const DISPLAY_MODE_ADDR = 0xD177B7;

const KEY_ONE_SCAN = 0x12;
const CHUNK_SIZE = 5000;
const MAX_CHUNKS = 400;

function hex(value, width = 6) {
  if (value === undefined || value === null) return null;
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function bootToHomeScreen(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
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

  for (const entry of STAGE_ENTRIES) {
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu._iy = 0xD00080;
    cpu.f = 0x40;
    cpu._ix = 0xD1A860;
    cpu.sp = STACK_RESET_TOP - 12;
    mem.fill(0xFF, cpu.sp, cpu.sp + 12);
    executor.runFrom(entry, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });
  }

  const FLASH_ROUTINE_ROM_SRC = 0x000EBB;
  const FLASH_ROUTINE_RAM_DST = 0xD18C22;
  const FLASH_ROUTINE_LEN = 0x5A;
  mem.set(
    romBytes.subarray(FLASH_ROUTINE_ROM_SRC, FLASH_ROUTINE_ROM_SRC + FLASH_ROUTINE_LEN),
    FLASH_ROUTINE_RAM_DST,
  );

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu._iy = 0xD00080;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);

  return { lastPc: EVENT_LOOP_ENTRY, lastMode: 'adl' };
}

// Scan ROM for all references to D0058D (byte pattern 8D 05 D0)
// and categorize each by the opcode that precedes the address bytes.
function scanRomReferences() {
  const references = [];
  const romLen = Math.min(romBytes.length, 0x400000);

  for (let i = 1; i < romLen - 2; i++) {
    if (romBytes[i] !== 0x8D || romBytes[i + 1] !== 0x05 || romBytes[i + 2] !== 0xD0) {
      continue;
    }

    const opcode = romBytes[i - 1];
    const instrAddr = i - 1;
    let type = 'unknown';
    let instruction = `?? ${hex(opcode, 2)}`;

    switch (opcode) {
      case 0x32:
        type = 'write';
        instruction = 'LD (D0058D), A';
        break;
      case 0x3A:
        type = 'read';
        instruction = 'LD A, (D0058D)';
        break;
      case 0x22:
        type = 'write';
        instruction = 'LD (D0058D), HL';
        break;
      case 0x2A:
        type = 'read';
        instruction = 'LD HL, (D0058D)';
        break;
      case 0x21:
        type = 'address_load';
        instruction = 'LD HL, D0058D';
        break;
      default:
        // Check for ED-prefixed instructions (opcode at i-2)
        if (i >= 2 && romBytes[i - 2] === 0xED) {
          type = 'ed_prefixed';
          instruction = `ED ${hex(opcode, 2)} with D0058D`;
        }
        break;
    }

    references.push({
      instrAddress: hex(instrAddr),
      patternAddress: hex(i),
      opcode: hex(opcode, 2),
      type,
      instruction,
    });
  }

  return references;
}

function main() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // --- Step 1: Boot to home screen ---
  console.log('Booting to home screen...');
  const bootState = bootToHomeScreen(executor, cpu, mem);
  console.log('Boot complete.');

  // --- Step 2: Set up key injection ---
  mem[KEY_PROCESSING_ENABLE_ADDR] = 1;
  mem[DISPLAY_MODE_ADDR] = 0x55;
  mem[KEY_SCAN_CODE_ADDR] = KEY_ONE_SCAN;
  mem[KEY_AVAILABLE_FLAG_ADDR] |= KEY_AVAILABLE_FLAG_MASK;
  mem[KEY_SECONDARY_ADDR] = 0x00;

  console.log('Key injected:',
    'D00587=' + hex(mem[KEY_SCAN_CODE_ADDR], 2),
    'D00080=' + hex(mem[KEY_AVAILABLE_FLAG_ADDR], 2),
    'D0058D=' + hex(mem[KEY_SECONDARY_ADDR], 2));

  // --- Step 3: Run event loop in chunks, watch D0058D ---
  const writeDetections = [];
  let totalSteps = 0;
  let currentPc = bootState.lastPc;
  let currentMode = bootState.lastMode ?? 'adl';

  for (let chunk = 0; chunk < MAX_CHUNKS; chunk++) {
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;

    let runResult;
    try {
      runResult = executor.runFrom(currentPc, currentMode, {
        maxSteps: CHUNK_SIZE,
        maxLoopIterations: 5000,
        diHaltBypass: true,
      });
    } catch (err) {
      runResult = {
        steps: cpu.stepCount ?? 0,
        lastPc: cpu.pc ?? currentPc,
        lastMode: cpu.madl ? 'adl' : 'z80',
        termination: 'throw',
        error: err instanceof Error ? err.message : String(err),
      };
    }

    totalSteps += runResult.steps ?? 0;
    currentPc = runResult.lastPc ?? currentPc;
    currentMode = runResult.lastMode ?? currentMode;

    const d0058dVal = mem[KEY_SECONDARY_ADDR];
    if (d0058dVal !== 0x00) {
      writeDetections.push({
        chunk,
        approxStep: totalSteps,
        d0058dValue: hex(d0058dVal, 2),
        currentPc: hex(currentPc),
        d00587Value: hex(mem[KEY_SCAN_CODE_ADDR], 2),
        d00080Value: hex(mem[KEY_AVAILABLE_FLAG_ADDR], 2),
        termination: runResult.termination ?? 'normal',
      });

      console.log(`D0058D changed! chunk=${chunk} steps=${totalSteps}`,
        `val=${hex(d0058dVal, 2)} PC=${hex(currentPc)}`,
        `D00587=${hex(mem[KEY_SCAN_CODE_ADDR], 2)}`);

      // Stop after first detection
      break;
    }

    if (runResult.termination === 'throw' || runResult.error) {
      console.log(`Error at chunk ${chunk}: ${runResult.error}`);
      break;
    }
  }

  if (writeDetections.length === 0) {
    console.log(`D0058D never changed after ${totalSteps} steps (${MAX_CHUNKS} chunks of ${CHUNK_SIZE})`);
  }

  // --- Step 4: Scan ROM for all D0058D references ---
  console.log('\nScanning ROM for D0058D references...');
  const romReferences = scanRomReferences();

  const categorized = {
    write: romReferences.filter((r) => r.type === 'write'),
    read: romReferences.filter((r) => r.type === 'read'),
    address_load: romReferences.filter((r) => r.type === 'address_load'),
    ed_prefixed: romReferences.filter((r) => r.type === 'ed_prefixed'),
    unknown: romReferences.filter((r) => r.type === 'unknown'),
  };

  console.log(`Found ${romReferences.length} references:`,
    `${categorized.write.length} write,`,
    `${categorized.read.length} read,`,
    `${categorized.address_load.length} address_load,`,
    `${categorized.ed_prefixed.length} ed_prefixed,`,
    `${categorized.unknown.length} unknown`);

  // --- Step 5: JSON summary ---
  const report = {
    probe: 'phase457-d0058d-writer',
    knownSequence: {
      note: 'D0058D is a secondary key scan code register, written in same routine as D00587',
      rom_003D4B: 'LD (D00587), A — write scan code',
      rom_003D4F: 'SET 3, (IY+0) — set bit 3 of D00080 (key available)',
      rom_003D53: 'OR A — test if scan code is zero',
      rom_003D54: 'RET Z — return if no key pressed',
      rom_003D55: 'LD (D0058D), A — write SAME scan code to D0058D',
      rom_003D58: 'RET',
    },
    eventLoopTrace: {
      totalSteps,
      chunksRun: writeDetections.length > 0 ? writeDetections[0].chunk + 1 : MAX_CHUNKS,
      chunkSize: CHUNK_SIZE,
      maxChunks: MAX_CHUNKS,
      finalPc: hex(currentPc),
      finalMode: currentMode,
      d0058dChanged: writeDetections.length > 0,
      writeDetections,
      finalMemState: {
        d0058d: hex(mem[KEY_SECONDARY_ADDR], 2),
        d00587: hex(mem[KEY_SCAN_CODE_ADDR], 2),
        d00080: hex(mem[KEY_AVAILABLE_FLAG_ADDR], 2),
      },
    },
    romScan: {
      totalReferences: romReferences.length,
      byType: {
        write: categorized.write.length,
        read: categorized.read.length,
        address_load: categorized.address_load.length,
        ed_prefixed: categorized.ed_prefixed.length,
        unknown: categorized.unknown.length,
      },
      writeSites: categorized.write,
      readSites: categorized.read,
      addressLoadSites: categorized.address_load,
      edPrefixedSites: categorized.ed_prefixed,
      unknownSites: categorized.unknown,
    },
  };

  console.log('\n=== Phase 457 D0058D Writer Probe ===');
  console.log(JSON.stringify(report, null, 2));
}

main();
