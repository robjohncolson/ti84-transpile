#!/usr/bin/env node
// Phase 452 flag dump probe: investigate why only key "1" renders VRAM changes.
//
// Dumps OS flag values BEFORE and AFTER each key injection to find which flags
// are consumed by key processing and never re-armed. Between keys, only D177BA
// and the scan code injection are re-armed. D177B7 and D14091 are left alone
// to observe whether the OS consumes them.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const VRAM_BASE = 0xD40000;
const VRAM_BYTE_SIZE = 320 * 240 * 2;
const STACK_RESET_TOP = 0xD1A87E;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE_ENTRIES = [0x0A2B72, 0x0A3301, 0x0A29EC, 0x0A2854];
const EVENT_LOOP_ENTRY = 0x003A73;
const HALT_RANGE_START = 0x001933;
const HALT_RANGE_END = 0x001942;

const KEY_AVAILABLE_FLAG_ADDR = 0xD00080;
const KEY_AVAILABLE_FLAG_MASK = 0x08;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_BUFFER_ADDR = 0xD141B5;
const KEY_GATE_ADDR = 0xD177BA;

const SEQUENCE = [
  { label: '1', scan: 0x12 },
  { label: '+', scan: 0x2A },
  { label: '1', scan: 0x12 },
  { label: 'ENTER', scan: 0x29 },
];

// Addresses to dump before/after each key
const FLAG_ADDRS = [
  { name: 'D177B7', addr: 0xD177B7, desc: 'display refresh mode (0x55=needs refresh, 0xAA=clean)' },
  { name: 'D177BA', addr: 0xD177BA, desc: 'key gate' },
  { name: 'D008A8', addr: 0xD008A8, desc: 'OS flag controlling D14091' },
  { name: 'D14091', addr: 0xD14091, desc: 'key-processing enable' },
  { name: 'D00595', addr: 0xD00595, desc: 'curRow' },
  { name: 'D00596', addr: 0xD00596, desc: 'curCol' },
  { name: 'D141B5', addr: 0xD141B5, desc: 'key buffer' },
  { name: 'D00587', addr: 0xD00587, desc: 'scan code register' },
  { name: 'D177B8', addr: 0xD177B8, desc: 'USB/state byte 1' },
  { name: 'D177B9', addr: 0xD177B9, desc: 'USB/state byte 2' },
  { name: 'D177BB', addr: 0xD177BB, desc: 'USB/state byte 3' },
  { name: 'D00080', addr: 0xD00080, desc: 'IY flags (bit 3 = key available)' },
];

const EVENT_LOOP_STEPS = 500000;
const MAX_LOOPS = 5000;

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return '0x' + (value >>> 0).toString(16).padStart(width, '0');
}

function vramHash(mem) {
  return createHash('sha256')
    .update(mem.subarray(VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE))
    .digest('hex')
    .slice(0, 12);
}

function vramDiffCount(mem, snapshot) {
  let total = 0;
  for (let i = 0; i < VRAM_BYTE_SIZE; i++) {
    if (mem[VRAM_BASE + i] !== snapshot[i]) total++;
  }
  return total;
}

function dumpFlags(mem) {
  const snapshot = {};
  for (const f of FLAG_ADDRS) {
    snapshot[f.name] = mem[f.addr];
  }
  return snapshot;
}

function printFlagSnapshot(label, snapshot) {
  console.log('    ' + label + ':');
  for (const f of FLAG_ADDRS) {
    console.log('      ' + f.name + ' = ' + hex(snapshot[f.name], 2) + '  (' + f.desc + ')');
  }
}

function printFlagComparison(before, after) {
  console.log('    CHANGES:');
  let anyChanged = false;
  for (const f of FLAG_ADDRS) {
    const b = before[f.name];
    const a = after[f.name];
    if (b !== a) {
      console.log('      ' + f.name + ': ' + hex(b, 2) + ' -> ' + hex(a, 2) + '  *** CHANGED ***  (' + f.desc + ')');
      anyChanged = true;
    }
  }
  if (!anyChanged) {
    console.log('      (no flags changed)');
  }
}

function bootToHomeScreen(executor, cpu, mem) {
  const bootResult = executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  console.log('  boot: steps=' + bootResult.steps + ' term=' + bootResult.termination + ' lastPc=' + hex(bootResult.lastPc));
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelResult = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  console.log('  kernel: steps=' + kernelResult.steps + ' term=' + kernelResult.termination + ' lastPc=' + hex(kernelResult.lastPc));
  cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
  cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0; cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInitResult = executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  console.log('  postInit: steps=' + postInitResult.steps + ' term=' + postInitResult.termination + ' lastPc=' + hex(postInitResult.lastPc));

  for (let i = 0; i < STAGE_ENTRIES.length; i++) {
    const entry = STAGE_ENTRIES[i];
    cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
    cpu._iy = 0xD00080; cpu.f = 0x40; cpu._ix = 0xD1A860;
    cpu.sp = STACK_RESET_TOP - 12;
    mem.fill(0xFF, cpu.sp, cpu.sp + 12);
    const stageResult = executor.runFrom(entry, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });
    console.log('  stage' + (i + 1) + ': entry=' + hex(entry) + ' steps=' + stageResult.steps + ' term=' + stageResult.termination + ' lastPc=' + hex(stageResult.lastPc));
  }

  // Pre-copy flash self-test routine from ROM to RAM
  const FLASH_ROUTINE_ROM_SRC = 0x000EBB;
  const FLASH_ROUTINE_RAM_DST = 0xD18C22;
  const FLASH_ROUTINE_LEN = 0x5A;
  mem.set(
    romBytes.subarray(FLASH_ROUTINE_ROM_SRC, FLASH_ROUTINE_ROM_SRC + FLASH_ROUTINE_LEN),
    FLASH_ROUTINE_RAM_DST,
  );
  console.log('  pre-copied ' + FLASH_ROUTINE_LEN + ' bytes from ROM ' + hex(FLASH_ROUTINE_ROM_SRC) + ' to RAM ' + hex(FLASH_ROUTINE_RAM_DST));

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

function main() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, {
    peripherals,
    onWake: function(haltPc, newPc, newMode) {
      console.log('    HALT-wake: haltPc=' + hex(haltPc) + ' -> newPc=' + hex(newPc) + ' mode=' + newMode);
    },
  });
  const cpu = executor.cpu;

  console.log('=== Phase 452 flag dump probe ===');
  console.log('Goal: find which OS flags are consumed by key "1" and not re-armed');
  console.log('');

  // Boot
  console.log('phase 1: boot to home screen');
  const bootState = bootToHomeScreen(executor, cpu, mem);

  // Set initial flags -- these are the ONLY time we set D14091 and D177B7
  mem[0xD14091] = 1;
  mem[0xD177B7] = 0x55;
  mem[KEY_GATE_ADDR] = 0;
  console.log('  initial flags: D14091=0x01, D177B7=0x55, D177BA=0x00');
  console.log('  vramHash=' + vramHash(mem));
  console.log('');

  // Track all flag snapshots for summary table
  const allSnapshots = [];

  console.log('phase 2: inject keys with flag dumps');
  console.log('');

  for (let ki = 0; ki < SEQUENCE.length; ki++) {
    const key = SEQUENCE[ki];
    console.log('--- KEY ' + (ki + 1) + ': "' + key.label + '" (scan=' + hex(key.scan, 2) + ') ---');

    // BEFORE injection: dump flags
    const beforeFlags = dumpFlags(mem);
    printFlagSnapshot('BEFORE injection', beforeFlags);

    // Take VRAM snapshot
    const vramBefore = mem.slice(VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);

    // Inject the key: set scan code, set bit 3 of D00080, clear D177BA
    mem[KEY_SCAN_CODE_ADDR] = key.scan;
    mem[KEY_AVAILABLE_FLAG_ADDR] |= KEY_AVAILABLE_FLAG_MASK;
    mem[KEY_GATE_ADDR] = 0;
    console.log('    injected: D00587=' + hex(key.scan, 2) + ', D00080 bit3=SET, D177BA=0x00');

    // Reset CPU state for event loop
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu.f = 0x40;
    cpu._ix = 0xD1A860;
    cpu._iy = 0xD00080;
    cpu.sp = STACK_RESET_TOP - 12;
    mem.fill(0xFF, cpu.sp, cpu.sp + 12);

    // Run event loop
    var result;
    try {
      result = executor.runFrom(EVENT_LOOP_ENTRY, 'adl', {
        maxSteps: EVENT_LOOP_STEPS,
        maxLoopIterations: MAX_LOOPS,
        diHaltBypass: true,
      });
    } catch (err) {
      result = {
        error: err instanceof Error ? err.message : String(err),
        steps: 0,
        termination: 'throw',
        lastPc: EVENT_LOOP_ENTRY,
        lastMode: 'adl',
      };
    }

    console.log('    run: steps=' + result.steps + ' term=' + result.termination + ' lastPc=' + hex(result.lastPc));
    if (result.error) {
      console.log('    ERROR: ' + result.error);
    }

    // AFTER processing: dump flags
    const afterFlags = dumpFlags(mem);
    printFlagSnapshot('AFTER processing', afterFlags);

    // Compare
    printFlagComparison(beforeFlags, afterFlags);

    // VRAM diff
    const vramChangedBytes = vramDiffCount(mem, vramBefore);
    console.log('    VRAM: ' + vramChangedBytes + ' bytes changed (hash: ' + vramHash(mem) + ')');

    // Store for summary
    allSnapshots.push({
      key: key.label,
      scan: key.scan,
      before: beforeFlags,
      after: afterFlags,
      vramChangedBytes: vramChangedBytes,
      steps: result.steps,
      termination: result.termination,
      lastPc: result.lastPc,
      error: result.error || null,
    });

    // Between keys: re-arm ONLY D177BA and the scan code injection
    // Do NOT re-arm D177B7 or D14091 -- we want to observe if they get consumed
    console.log('');
  }

  // Summary table
  console.log('=== SUMMARY TABLE ===');
  console.log('');

  var flagNames = FLAG_ADDRS.map(function(f) { return f.name; });
  console.log('Flag values BEFORE each key:');
  console.log('Key'.padEnd(8) + ' ' + flagNames.map(function(n) { return n.padEnd(10); }).join(' '));
  console.log('-'.repeat(8 + flagNames.length * 11));
  for (const s of allSnapshots) {
    var vals = flagNames.map(function(n) { return hex(s.before[n], 2).padEnd(10); });
    console.log(s.key.padEnd(8) + ' ' + vals.join(' '));
  }

  console.log('');
  console.log('Flag values AFTER each key:');
  console.log('Key'.padEnd(8) + ' ' + flagNames.map(function(n) { return n.padEnd(10); }).join(' '));
  console.log('-'.repeat(8 + flagNames.length * 11));
  for (const s of allSnapshots) {
    var vals = flagNames.map(function(n) { return hex(s.after[n], 2).padEnd(10); });
    console.log(s.key.padEnd(8) + ' ' + vals.join(' '));
  }

  console.log('');
  console.log('VRAM changes per key:');
  console.log('Key'.padEnd(8) + ' ' + 'Bytes'.padEnd(10) + ' ' + 'Steps'.padEnd(10) + ' ' + 'Term'.padEnd(15) + ' ' + 'LastPc'.padEnd(12));
  console.log('-'.repeat(55));
  for (const s of allSnapshots) {
    console.log(
      s.key.padEnd(8) + ' ' + String(s.vramChangedBytes).padEnd(10) + ' ' + String(s.steps).padEnd(10) + ' ' +
      s.termination.padEnd(15) + ' ' + hex(s.lastPc)
    );
  }

  console.log('');
  console.log('=== FLAGS THAT CHANGED (consumed) after key "1" and were NOT re-armed ===');
  if (allSnapshots.length >= 2) {
    var firstBefore = allSnapshots[0].before;
    var firstAfter = allSnapshots[0].after;
    var secondBefore = allSnapshots[1].before;
    for (const f of FLAG_ADDRS) {
      var orig = firstBefore[f.name];
      var afterFirst = firstAfter[f.name];
      if (afterFirst !== orig) {
        var reArmed = secondBefore[f.name] !== afterFirst ? 'RE-ARMED' : 'NOT re-armed';
        console.log(
          '  ' + f.name + ': was ' + hex(orig, 2) + ', ' +
          'after key "1" = ' + hex(afterFirst, 2) + ', ' +
          'before key "+" = ' + hex(secondBefore[f.name], 2) + ' => ' + reArmed
        );
      }
    }
  }

  console.log('');
  console.log('=== done ===');
}

main();