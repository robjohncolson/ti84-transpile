#!/usr/bin/env node

/**
 * Phase 364: Test two independent fixes for the SP corruption at 0x00BC72.
 *
 * Fix A: Linked-list termination guard — intercept block 00bc47:adl.
 *        Before executing, read what (IX-30) would be. If < 0x400000 (ROM),
 *        skip the block and clear carry so the 0x00BC31 loop exits.
 *
 * Fix B: SP safety clamp — after each block executes, if SP < 0x400000,
 *        restore SP to the last known good value.
 *
 * Run:
 *   node TI-84_Plus_CE/probe-phase364-ix-termination-fix.mjs
 *
 * OUTPUT SUMMARY (2026-05-18):
 *
 * Fix A (IX linked-list guard): 10000 steps, 472 unique blocks, last PC=0x0060B3:adl
 *   Guard triggered 3 times (IX=0xD140B3, (IX-30)@0xD14095=0x010000 = ROM pointer)
 *   Skips to epilogue 0x00BC72 which restores SP from valid IX. SP stays healthy.
 *   4 missing blocks: 0xD18C22 (RAM), 0x006900 (hit 3x)
 *   SP=0xD1A878 at end (healthy RAM)
 *
 * Fix B (SP safety clamp): 10000 steps, 517 unique blocks, last PC=0x006D57:adl
 *   SP clamp triggered 2 times:
 *     step=1 block=0x000000:z80 (benign, SP starts at 0)
 *     step=2684 block=0x00BC72:adl SP=0x014C81 -> restored to 0xD1A842
 *   1 missing block: 0xD18C22 (RAM)
 *   SP=0xD1A822 at end (healthy RAM)
 *
 * WINNER: Fix B — 517 blocks (+41 over 476 baseline), fewer missing blocks,
 *   progresses further into boot. Fix A only reaches 472 blocks because the
 *   guard triggers on the FIRST iteration (the linked-list node at 0xD14095
 *   always holds 0x010000), causing it to miss block 0x006900.
 *   Fix B lets the corruption happen then recovers, allowing the code path
 *   that uses the ROM data to execute before SP is clamped back.
 *
 * NEW FRONTIER: 0x006900 (missing block, hit by Fix A 3x) and 0xD18C22 (RAM)
 */

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

const FLAG_C = 0x01;
const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 10000;
const MAX_LOOP_ITERATIONS = 50000;
const ROM_THRESHOLD = 0x400000;
const RAM_THRESHOLD = 0xD00000;

// The block that follows the linked-list pointer via LD IX,(IX-30)
const IX_FOLLOW_BLOCK = '00bc47:adl';
// The block that does LD SP,IX and crashes
const SP_CRASH_BLOCK = '00bc72:adl';

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function blockKey(pc, mode = 'adl') {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function read24(buffer, addr) {
  const a = addr & 0xFFFFFF;
  return (buffer[a] ?? 0) | ((buffer[(a + 1) & 0xFFFFFF] ?? 0) << 8) | ((buffer[(a + 2) & 0xFFFFFF] ?? 0) << 16);
}

function createMemory(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  return mem;
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((b) => b?.id).map((b) => [b.id, b]));
  }
  return rawBlocks ?? {};
}

function ensureTranspiledRom() {
  if (fs.existsSync(TRANSPILED_PATH)) return false;
  const hint = fs.existsSync(TRANSPILED_GZ_PATH) ? `${path.basename(TRANSPILED_GZ_PATH)} present; ` : '';
  console.log(`${hint}${path.basename(TRANSPILED_PATH)} missing. Running transpiler...`);
  execFileSync(process.execPath, [TRANSPILER_PATH], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
  });
  if (!fs.existsSync(TRANSPILED_PATH)) throw new Error('Transpiled ROM still missing.');
  return true;
}

function createRamTrampoline(blockPc) {
  return function ramTrampoline(cpu) {
    const sp = cpu.sp & 0xFFFFFF;
    const retAddr = read24(cpu.mem, sp);
    cpu.sp = (sp + 3) & 0xFFFFFF;
    return retAddr;
  };
}

// ============================================================
// Fix A: Linked-list termination guard
// ============================================================

function runFixA(PRELIFTED_BLOCKS, romBytes, createExecutor, createPeripheralBus) {
  console.log('');
  console.log('========================================');
  console.log('FIX A: Linked-list termination guard');
  console.log('========================================');
  console.log('Strategy: Before block 00bc47:adl executes, read (IX-30).');
  console.log('          If value < 0x400000 (ROM), skip block + clear carry.');
  console.log('');

  const mem = createMemory(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  cpu.mem = mem;
  cpu.io = peripherals;
  cpu.pc = BOOT_ENTRY;
  cpu.madl = 0;
  cpu.adl = false;
  cpu.halted = false;

  const compiledBlocks = executor.compiledBlocks;
  const blockMeta = executor.blockMeta;

  // Grab the original block function for 00bc47
  const origFn = compiledBlocks[IX_FOLLOW_BLOCK];
  let guardTriggered = 0;
  let guardDetails = [];

  // Also intercept the crash block 00bc72:adl (LD SP,IX; POP IX; RET).
  // When the guard fires, IX still holds the valid RAM frame pointer.
  // The epilogue needs to restore SP from IX, but since we skipped the
  // linked-list follow, IX is still the valid frame. We let it run normally.
  // The problem is that 0x00BC31 loops back to 0x00BC47 forever because
  // the carry flag condition doesn't change. Instead, when the guard fires,
  // we skip directly to the epilogue block 0x00BC72 so SP,IX runs with
  // the VALID IX (not the corrupted ROM pointer).

  if (origFn) {
    compiledBlocks[IX_FOLLOW_BLOCK] = function guardedIxFollow(cpu) {
      const ixVal = cpu.ix & 0xFFFFFF;
      const ptrAddr = (ixVal - 30) & 0xFFFFFF;
      const linkedValue = read24(mem, ptrAddr);

      if (linkedValue < ROM_THRESHOLD) {
        guardTriggered++;
        if (guardTriggered <= 5) {
          guardDetails.push({
            ix: ixVal,
            ptrAddr,
            linkedValue,
            sp: cpu.sp & 0xFFFFFF,
          });
          console.log(`  [GUARD A] IX=${hex(ixVal)} (IX-30)@${hex(ptrAddr)}=${hex(linkedValue)} < ROM -> skip to epilogue 0x00BC72`);
        }
        // Skip directly to the epilogue. IX is still a valid RAM frame pointer,
        // so LD SP,IX at 0x00BC72 will restore SP correctly and RET will
        // return to the caller.
        return 0x00BC72;
      }

      return origFn(cpu);
    };
  } else {
    console.log('  WARNING: Block 00bc47:adl not found in compiled blocks!');
  }

  // Run the dispatch loop
  const result = runDispatchLoop(cpu, compiledBlocks, blockMeta, peripherals, mem, BOOT_MAX_STEPS, null);

  console.log('');
  console.log('--- Fix A Results ---');
  console.log(`Termination: ${result.termination}`);
  console.log(`Steps: ${result.steps}`);
  console.log(`Blocks reached: ${result.uniqueBlocks}`);
  console.log(`Last PC: ${hex(result.lastPc)}:${result.lastMode}`);
  console.log(`Last SP: ${hex(cpu.sp & 0xFFFFFF)}`);
  console.log(`Guard triggered: ${guardTriggered} times`);
  console.log(`Loops forced: ${result.loopsForced}`);

  if (guardDetails.length > 0) {
    console.log('Guard trigger details:');
    for (const d of guardDetails) {
      console.log(`  IX=${hex(d.ix)} ptrAddr=${hex(d.ptrAddr)} value=${hex(d.linkedValue)} SP=${hex(d.sp)}`);
    }
  }

  if (result.missingBlocks.length > 0) {
    console.log(`Missing blocks (${result.missingBlocks.length}):`);
    for (const mb of result.missingBlocks.slice(0, 20)) {
      console.log(`  step=${mb.step} pc=${hex(mb.pc)}:${mb.mode} sp=${hex(mb.sp)}`);
    }
    if (result.missingBlocks.length > 20) {
      console.log(`  ... and ${result.missingBlocks.length - 20} more`);
    }
  }

  return result;
}

// ============================================================
// Fix B: SP safety clamp
// ============================================================

function runFixB(PRELIFTED_BLOCKS, romBytes, createExecutor, createPeripheralBus) {
  console.log('');
  console.log('========================================');
  console.log('FIX B: SP safety clamp');
  console.log('========================================');
  console.log('Strategy: After each block, if SP < 0x400000, restore last good SP.');
  console.log('');

  const mem = createMemory(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  cpu.mem = mem;
  cpu.io = peripherals;
  cpu.pc = BOOT_ENTRY;
  cpu.madl = 0;
  cpu.adl = false;
  cpu.halted = false;

  const compiledBlocks = executor.compiledBlocks;
  const blockMeta = executor.blockMeta;

  let spClampCount = 0;
  let spClampDetails = [];

  // SP clamp callback: called after each block
  function spClampCheck(stepNum, blockPc, mode) {
    const sp = cpu.sp & 0xFFFFFF;
    if (sp < ROM_THRESHOLD) {
      spClampCount++;
      const detail = {
        step: stepNum,
        blockPc,
        mode,
        badSp: sp,
        restoredSp: lastGoodSp,
      };
      spClampDetails.push(detail);
      console.log(`  [CLAMP B] step=${stepNum} block=${hex(blockPc)}:${mode} SP=${hex(sp)} -> restored to ${hex(lastGoodSp)}`);
      cpu.sp = lastGoodSp;
    }
  }

  let lastGoodSp = cpu.sp & 0xFFFFFF;

  const result = runDispatchLoop(cpu, compiledBlocks, blockMeta, peripherals, mem, BOOT_MAX_STEPS, function afterBlock(stepNum, blockPc, mode) {
    // Update last good SP before checking
    const sp = cpu.sp & 0xFFFFFF;
    if (sp >= ROM_THRESHOLD) {
      lastGoodSp = sp;
    }
    spClampCheck(stepNum, blockPc, mode);
  });

  console.log('');
  console.log('--- Fix B Results ---');
  console.log(`Termination: ${result.termination}`);
  console.log(`Steps: ${result.steps}`);
  console.log(`Blocks reached: ${result.uniqueBlocks}`);
  console.log(`Last PC: ${hex(result.lastPc)}:${result.lastMode}`);
  console.log(`Last SP: ${hex(cpu.sp & 0xFFFFFF)}`);
  console.log(`SP clamp triggered: ${spClampCount} times`);
  console.log(`Loops forced: ${result.loopsForced}`);

  if (spClampDetails.length > 0) {
    console.log('SP clamp details:');
    for (const d of spClampDetails.slice(0, 20)) {
      console.log(`  step=${d.step} block=${hex(d.blockPc)}:${d.mode} badSP=${hex(d.badSp)} restored=${hex(d.restoredSp)}`);
    }
    if (spClampDetails.length > 20) {
      console.log(`  ... and ${spClampDetails.length - 20} more`);
    }
  }

  if (result.missingBlocks.length > 0) {
    console.log(`Missing blocks (${result.missingBlocks.length}):`);
    for (const mb of result.missingBlocks.slice(0, 20)) {
      console.log(`  step=${mb.step} pc=${hex(mb.pc)}:${mb.mode} sp=${hex(mb.sp)}`);
    }
    if (result.missingBlocks.length > 20) {
      console.log(`  ... and ${result.missingBlocks.length - 20} more`);
    }
  }

  return result;
}

// ============================================================
// Shared dispatch loop (simplified from phase 363)
// ============================================================

function runDispatchLoop(cpu, compiledBlocks, blockMeta, peripherals, mem, maxSteps, afterBlockCb) {
  let pc = BOOT_ENTRY;
  let mode = BOOT_MODE;
  let steps = 0;
  let termination = 'max_steps';
  let loopsForced = 0;

  const blockVisits = new Map();
  const missingBlocksList = [];
  const missingBlocksSet = new Set();
  const recentKeys = [];
  const recentMax = 4;
  let loopHitCount = 0;

  while (steps < maxSteps) {
    cpu.madl = mode === 'adl' ? 1 : 0;
    cpu.pc = pc & 0xFFFFFF;

    const key = blockKey(pc, mode);

    // Tight-loop detection
    if (recentKeys.includes(key)) {
      loopHitCount++;
    } else {
      loopHitCount = 0;
    }
    recentKeys.push(key);
    if (recentKeys.length > recentMax) recentKeys.shift();

    if (loopHitCount > MAX_LOOP_ITERATIONS) {
      const meta = blockMeta[key];
      const fallthrough = meta?.exits?.find((e) => e.type === 'fallthrough');
      if (fallthrough) {
        mode = fallthrough.targetMode ?? mode;
        pc = fallthrough.target;
        loopHitCount = 0;
        recentKeys.length = 0;
        loopsForced++;
        continue;
      }
      cpu.f |= FLAG_C;
      loopHitCount = 0;
      recentKeys.length = 0;
      loopsForced++;
    }

    let fn = compiledBlocks[key];
    if (!fn) {
      missingBlocksSet.add(key);
      missingBlocksList.push({
        step: steps + 1,
        pc: pc & 0xFFFFFF,
        mode,
        sp: cpu.sp & 0xFFFFFF,
      });

      if (pc >= RAM_THRESHOLD) {
        fn = createRamTrampoline(pc);
        compiledBlocks[key] = fn;
        continue;
      }

      // Try skip forward
      let skipped = false;
      for (let offset = 1; offset <= 16; offset++) {
        const tryPc = (pc + offset) & 0xFFFFFF;
        const tryKey = blockKey(tryPc, mode);
        if (compiledBlocks[tryKey]) {
          pc = tryPc;
          skipped = true;
          break;
        }
      }

      if (!skipped) {
        termination = 'missing_block';
        break;
      }
      steps++;
      continue;
    }

    cpu._currentBlockPc = pc & 0xFFFFFF;

    let result;
    try {
      result = fn(cpu);
    } catch (error) {
      console.log(`  ERROR at block ${key}: ${error.message}`);
      termination = 'error';
      break;
    }

    steps++;
    blockVisits.set(key, (blockVisits.get(key) || 0) + 1);

    // After-block callback (for Fix B's SP clamp)
    if (afterBlockCb) {
      afterBlockCb(steps, pc & 0xFFFFFF, mode);
    }

    if (result === undefined || result === null) {
      termination = 'no_return';
      break;
    }

    if (result < 0) {
      if (result === -1 && peripherals?.tick) {
        peripherals.tick();
        if (peripherals.hasPendingNMI()) {
          cpu.halted = false;
          cpu.push((pc + 1) & 0xFFFFFF);
          cpu.iff2 = cpu.iff1;
          cpu.iff1 = 0;
          pc = 0x000066;
          mode = 'adl';
          peripherals.acknowledgeNMI();
          steps++;
          continue;
        }
        if (peripherals.hasPendingIRQ() && cpu.iff1) {
          cpu.halted = false;
          cpu.push((pc + 1) & 0xFFFFFF);
          cpu.iff1 = 0;
          cpu.iff2 = 0;
          pc = cpu.im === 2 ? cpu.read16((cpu.i << 8) | 0xFF) : 0x000038;
          mode = 'adl';
          peripherals.acknowledgeIRQ();
          steps++;
          continue;
        }
      }
      termination = result === -1 ? 'halt' : 'sleep';
      break;
    }

    if (peripherals?.tick) {
      peripherals.tick();
      if (peripherals.hasPendingNMI()) {
        cpu.push(result);
        cpu.iff2 = cpu.iff1;
        cpu.iff1 = 0;
        pc = 0x000066;
        mode = 'adl';
        peripherals.acknowledgeNMI();
        steps++;
        continue;
      }
      if (peripherals.hasPendingIRQ() && cpu.iff1) {
        cpu.push(result);
        cpu.iff1 = 0;
        cpu.iff2 = 0;
        pc = cpu.im === 2 ? cpu.read16((cpu.i << 8) | 0xFF) : 0x000038;
        mode = 'adl';
        peripherals.acknowledgeIRQ();
        steps++;
        continue;
      }
    }

    // Resolve next mode
    const meta = blockMeta[key];
    if (meta?.exits) {
      for (const exit of meta.exits) {
        if (exit.target === result && exit.targetMode) {
          mode = exit.targetMode;
          break;
        }
      }
    }

    pc = result & 0xFFFFFF;
  }

  return {
    steps,
    lastPc: pc,
    lastMode: mode,
    termination,
    loopsForced,
    uniqueBlocks: blockVisits.size,
    blockVisits: Object.fromEntries(blockVisits),
    missingBlocks: missingBlocksList,
  };
}

// ============================================================
// Main
// ============================================================

async function main() {
  if (!fs.existsSync(ROM_PATH)) throw new Error('ROM.rom is missing.');

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
    throw new Error('Unable to locate PRELIFTED_BLOCKS.');
  }

  console.log('Phase 364: IX Linked-List Termination Fix');
  console.log('==========================================');
  console.log(`ROM:            ${ROM_PATH}`);
  console.log(`Transpiled ROM: ${regenerated ? 'regenerated' : path.basename(TRANSPILED_PATH)}`);
  console.log(`Boot config:    entry=${hex(BOOT_ENTRY)} mode=${BOOT_MODE} maxSteps=${BOOT_MAX_STEPS} timerInterrupt=false`);

  // --- Fix A ---
  const resultA = runFixA(PRELIFTED_BLOCKS, romBytes, createExecutor, createPeripheralBus);

  // --- Fix B ---
  const resultB = runFixB(PRELIFTED_BLOCKS, romBytes, createExecutor, createPeripheralBus);

  // --- Comparison ---
  console.log('');
  console.log('========================================');
  console.log('COMPARISON');
  console.log('========================================');
  console.log(`                     Fix A (IX guard)    Fix B (SP clamp)`);
  console.log(`Termination:         ${resultA.termination.padEnd(20)} ${resultB.termination}`);
  console.log(`Steps:               ${String(resultA.steps).padEnd(20)} ${resultB.steps}`);
  console.log(`Unique blocks:       ${String(resultA.uniqueBlocks).padEnd(20)} ${resultB.uniqueBlocks}`);
  console.log(`Last PC:             ${hex(resultA.lastPc).padEnd(20)} ${hex(resultB.lastPc)}`);
  console.log(`Missing blocks:      ${String(resultA.missingBlocks.length).padEnd(20)} ${resultB.missingBlocks.length}`);
  console.log(`Loops forced:        ${String(resultA.loopsForced).padEnd(20)} ${resultB.loopsForced}`);
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
}
