#!/usr/bin/env node
// Phase 332: Trace missing-block terminators in the text rendering / key dispatch path.
//
// After home screen boot, the workflow probe (probe-workflow-arithmetic.mjs) sees
// pressSteps=1 term=missing_block lastPc=0xffffff on the very first step.
//
// Root cause hypothesis: the CPU object has no .pc property — findResumePc returns
// null, so the workflow probe falls back to POST_INIT_ENTRY (0x0802B2). That block
// ends with `ret`, which pops 0xFFFFFF off the stack (filled with 0xFF during boot
// setup), jumping to address 0xFFFFFF — which is past the 4MB ROM and has no block.
//
// This probe:
// 1. Boots to home screen (same as probe-phase99d)
// 2. Reports CPU state BEFORE any key injection
// 3. Identifies the correct resume PC from stage execution
// 4. Injects keypress scan code 0x41 and traces block-by-block
// 5. Reports every missing_block hit with ROM bytes analysis
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
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STACK_RESET_TOP = 0xD1A87E;
const STAGE_ENTRIES = [0x0A2B72, 0x0A3301, 0x0A29EC, 0x0A2854];
const VRAM_BASE = 0xD40000;
const VRAM_BYTE_SIZE = 320 * 240 * 2;

// _GetCSC SDK entry — the OS key-polling function
const GETCSC_ENTRY = 0x03FA09;

// Key '1': idx=4, bit=1, scan=0x41
const KEY_ONE = { idx: 4, bit: 1, label: '1', scan: 0x41 };

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function romBytesAt(addr, count) {
  if (addr >= romBytes.length) return null;
  const end = Math.min(addr + count, romBytes.length);
  return Array.from(romBytes.slice(addr, end)).map(b => b.toString(16).padStart(2, '0')).join(' ');
}

function isLikelyCode(addr) {
  // Address must be in ROM range (0x000000-0x3FFFFF)
  if (addr >= 0x400000) return { likely: false, reason: 'past ROM (RAM/MMIO region)' };
  if (addr >= romBytes.length) return { likely: false, reason: 'past ROM file end' };

  const bytes = romBytes.slice(addr, Math.min(addr + 8, romBytes.length));
  if (bytes.length === 0) return { likely: false, reason: 'no bytes' };

  // Check if all 0xFF (erased flash)
  if (bytes.every(b => b === 0xFF)) return { likely: false, reason: 'erased flash (all 0xFF)' };

  // Check if all 0x00 (zero-filled)
  if (bytes.every(b => b === 0x00)) return { likely: false, reason: 'zero-filled' };

  // Common eZ80 instruction opcodes that suggest code
  const firstByte = bytes[0];
  const codeOpcodes = new Set([
    0xC3, 0xC9, 0xCD, // JP, RET, CALL
    0x21, 0x11, 0x01, // LD pair, imm
    0x3E, 0x06, 0x0E, 0x16, 0x1E, 0x26, 0x2E, // LD reg, imm
    0x7E, 0x46, 0x4E, 0x56, 0x5E, 0x66, 0x6E, // LD reg, (HL)
    0xE5, 0xD5, 0xC5, 0xF5, // PUSH
    0xE1, 0xD1, 0xC1, 0xF1, // POP
    0xFD, 0xDD, 0xED, 0xCB, // Prefix bytes
    0xF3, 0xFB, // DI, EI
    0x18, 0x20, 0x28, 0x30, 0x38, // JR variants
    0xB7, 0xAF, 0xA7, // OR A, XOR A, AND A
    0x3A, 0x32, // LD A,(nn), LD (nn),A
    0x40, // eZ80 .SIS prefix / LD B,B
    0x49, // eZ80 .LIL prefix / LD C,C
    0x52, // eZ80 .SIL prefix
    0x5B, // eZ80 .LIS prefix
  ]);

  if (codeOpcodes.has(firstByte)) {
    return { likely: true, reason: `starts with common opcode 0x${firstByte.toString(16)}` };
  }

  // Check for plausible instruction patterns (not all same byte, not obviously data)
  const uniqueBytes = new Set(bytes);
  if (uniqueBytes.size >= 3) {
    return { likely: true, reason: 'byte diversity suggests code' };
  }

  return { likely: false, reason: `uncertain (first byte 0x${firstByte.toString(16)}, low diversity)` };
}

function bootToHomeScreen(executor, cpu, mem) {
  // Phase 1: Cold boot (Z80 mode)
  executor.runFrom(BOOT_ENTRY, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  // Phase 2: Kernel init (ADL mode)
  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  // Phase 3: Post-init
  const postInitResult = executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });
  console.log(`  post-init: steps=${postInitResult.steps} term=${postInitResult.termination} lastPc=${hex(postInitResult.lastPc)}`);

  // Phase 4: Run rendering stages
  const stageResults = [];
  for (const entry of STAGE_ENTRIES) {
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu._iy = 0xD00080;
    cpu.f = 0x40;
    cpu._ix = 0xD1A860;
    cpu.sp = STACK_RESET_TOP - 12;
    mem.fill(0xFF, cpu.sp, cpu.sp + 12);
    const result = executor.runFrom(entry, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });
    stageResults.push({ entry, ...result });
    console.log(`  stage ${hex(entry)}: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}`);
  }

  return stageResults;
}

function pressKey(peripherals, key) {
  peripherals.keyboard.keyMatrix[key.idx] &= ~(1 << key.bit);
  peripherals.setKeyboardIRQ(true);
}

function releaseKey(peripherals, key) {
  peripherals.keyboard.keyMatrix[key.idx] |= (1 << key.bit);
  peripherals.setKeyboardIRQ(false);
}

function main() {
  console.log('=== Phase 332: Missing Block Terminators in Key Dispatch ===');
  console.log('');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // --- Step 1: Boot to home screen ---
  console.log('--- Step 1: Boot to home screen ---');
  const stageResults = bootToHomeScreen(executor, cpu, mem);

  // --- Step 2: Analyze CPU state BEFORE key injection ---
  console.log('');
  console.log('--- Step 2: CPU state after boot (BEFORE key injection) ---');

  // The CPU class has no .pc property — it's a local var in runFrom().
  // The workflow probe's findResumePc() returns null because cpu.pc is undefined.
  console.log(`  cpu.pc = ${cpu.pc} (typeof: ${typeof cpu.pc})`);
  console.log(`  cpu._pc = ${cpu._pc} (typeof: ${typeof cpu._pc})`);
  console.log(`  cpu.sp = ${hex(cpu.sp)}`);
  console.log(`  cpu.halted = ${cpu.halted}`);
  console.log(`  cpu.madl = ${cpu.madl}`);
  console.log(`  cpu.mbase = 0x${cpu.mbase.toString(16)}`);

  // Stack contents at current SP — this is what `ret` will pop
  const sp = cpu.sp;
  const stackByte0 = mem[sp];
  const stackByte1 = mem[sp + 1];
  const stackByte2 = mem[sp + 2];
  const stackReturn24 = stackByte0 | (stackByte1 << 8) | (stackByte2 << 16);
  console.log(`  stack at SP: [${hex(stackByte0, 2)}, ${hex(stackByte1, 2)}, ${hex(stackByte2, 2)}] → ret addr = ${hex(stackReturn24)}`);

  // Check if the workflow probe's fallback (POST_INIT_ENTRY) has a block
  const postInitKey = '0802b2:adl';
  const hasPostInit = !!executor.compiledBlocks[postInitKey];
  console.log(`  POST_INIT_ENTRY (0x0802B2) block exists: ${hasPostInit}`);

  // Check what the last stage returned
  const lastStage = stageResults[stageResults.length - 1];
  console.log(`  last stage lastPc: ${hex(lastStage.lastPc)} (this is where execution stopped)`);

  // --- Step 3: Reproduce the workflow probe's bug ---
  console.log('');
  console.log('--- Step 3: Reproduce workflow probe bug ---');
  console.log('  The workflow probe does: executor.runFrom(cpu.pc ?? POST_INIT_ENTRY, "adl", ...)');
  console.log('  Since cpu.pc is undefined, it uses POST_INIT_ENTRY = 0x0802B2');
  console.log('  Block 0x0802B2 ends with `ret` which pops from stack filled with 0xFF');
  console.log(`  → ret pops ${hex(stackReturn24)} → no block exists there → missing_block after 1 step`);

  // Verify by actually running it
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  const bugResult = executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 10, maxLoopIterations: 5 });
  console.log(`  VERIFIED: steps=${bugResult.steps} term=${bugResult.termination} lastPc=${hex(bugResult.lastPc)}`);

  // --- Step 4: Correct approach — use _GetCSC for key polling ---
  console.log('');
  console.log('--- Step 4: Trace key injection via _GetCSC ---');

  // Reset CPU state for clean key test
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);

  // First, call _GetCSC WITHOUT pressing a key to see normal return
  console.log('  4a: _GetCSC with no key pressed');
  const missingBlocks_noKey = [];
  const blockTrace_noKey = [];
  const noKeyResult = executor.runFrom(GETCSC_ENTRY, 'adl', {
    maxSteps: 500,
    maxLoopIterations: 50,
    onBlock: (pc, mode, meta, steps) => {
      if (blockTrace_noKey.length < 50) {
        blockTrace_noKey.push({ pc, mode, steps });
      }
    },
    onMissingBlock: (pc, mode, steps) => {
      missingBlocks_noKey.push({ pc, mode, steps });
    },
  });
  console.log(`    steps=${noKeyResult.steps} term=${noKeyResult.termination} lastPc=${hex(noKeyResult.lastPc)}`);
  console.log(`    missingBlocks=${missingBlocks_noKey.length}`);
  for (const mb of missingBlocks_noKey) {
    console.log(`      missing: ${hex(mb.pc)} mode=${mb.mode} step=${mb.steps}`);
  }
  console.log(`    block trace (first 20):`);
  for (const bt of blockTrace_noKey.slice(0, 20)) {
    console.log(`      step=${bt.steps} pc=${hex(bt.pc)} mode=${bt.mode}`);
  }

  // Reset CPU state again
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);

  // Now press key '1' and call _GetCSC
  console.log('');
  console.log('  4b: _GetCSC with key 1 pressed (scan=0x41)');

  // Store scan code in the keypad buffer location the OS uses
  // _GetCSC reads from (0xD00587) — store the scan code there
  mem[0xD00587] = KEY_ONE.scan;
  pressKey(peripherals, KEY_ONE);

  const missingBlocks_key = [];
  const blockTrace_key = [];
  const keyResult = executor.runFrom(GETCSC_ENTRY, 'adl', {
    maxSteps: 2000,
    maxLoopIterations: 50,
    onBlock: (pc, mode, meta, steps) => {
      if (blockTrace_key.length < 100) {
        blockTrace_key.push({ pc, mode, steps });
      }
    },
    onMissingBlock: (pc, mode, steps) => {
      missingBlocks_key.push({ pc, mode, steps });
    },
  });
  releaseKey(peripherals, KEY_ONE);

  console.log(`    steps=${keyResult.steps} term=${keyResult.termination} lastPc=${hex(keyResult.lastPc)}`);
  console.log(`    missingBlocks=${missingBlocks_key.length}`);
  for (const mb of missingBlocks_key) {
    const romHex = romBytesAt(mb.pc, 16);
    const codeAnalysis = isLikelyCode(mb.pc);
    console.log(`      missing: ${hex(mb.pc)} mode=${mb.mode} step=${mb.steps}`);
    console.log(`        rom_bytes: ${romHex ?? 'N/A (outside ROM)'}`);
    console.log(`        likely_code: ${codeAnalysis.likely} (${codeAnalysis.reason})`);
  }
  console.log(`    block trace (first 30):`);
  for (const bt of blockTrace_key.slice(0, 30)) {
    console.log(`      step=${bt.steps} pc=${hex(bt.pc)} mode=${bt.mode}`);
  }

  // --- Step 5: Try running from several plausible OS event loop entries ---
  console.log('');
  console.log('--- Step 5: Scan for OS event loop / main loop candidates ---');

  // The OS main loop likely involves:
  // - _GetCSC (0x03FA09) — polls keyboard
  // - Home screen redraw routines
  // - Some top-level dispatch loop

  // Check what blocks exist near common OS loop addresses
  const loopCandidates = [
    0x0A29EC, // Stage 3 entry (home row strip)
    0x0A2854, // Stage 4 entry (history area)
    0x0A2B72, // Stage 1 entry (status bar)
    0x0A3301, // Stage 2 entry (status dots)
    0x03FA09, // _GetCSC
    0x0802B2, // POST_INIT_ENTRY
  ];

  for (const addr of loopCandidates) {
    const key = addr.toString(16).padStart(6, '0') + ':adl';
    const exists = !!executor.compiledBlocks[key];
    console.log(`  ${hex(addr)}: block=${exists}`);
  }

  // --- Step 6: Comprehensive missing block analysis ---
  console.log('');
  console.log('--- Step 6: All missing blocks from both traces ---');

  const allMissing = new Map();
  for (const mb of [...missingBlocks_noKey, ...missingBlocks_key]) {
    const addr = mb.pc;
    if (!allMissing.has(addr)) {
      const romHex = romBytesAt(addr, 16);
      const codeAnalysis = isLikelyCode(addr);
      allMissing.set(addr, {
        address: addr,
        mode: mb.mode,
        romBytes: romHex,
        likelyCode: codeAnalysis.likely,
        reason: codeAnalysis.reason,
        suggestedSeed: codeAnalysis.likely ? `{ pc: ${hex(addr)}, mode: '${mb.mode}' }` : null,
      });
    }
  }

  // Also check for missing blocks in the _GetCSC continuation chain
  // Follow the full chain: 0x03FA09 → 0x03FA1C → 0x03FA23 → 0x03FA93 → ...
  const getCSCChain = [
    0x03FA09, 0x03FA1C, 0x03FA23, 0x03FA93,
    0x03FB9A, 0x03FBC0, 0x03FBA2,
  ];
  console.log('  _GetCSC chain block availability:');
  for (const addr of getCSCChain) {
    const key = addr.toString(16).padStart(6, '0') + ':adl';
    const exists = !!executor.compiledBlocks[key];
    if (!exists) {
      const romHex = romBytesAt(addr, 16);
      const codeAnalysis = isLikelyCode(addr);
      console.log(`    ${hex(addr)}: MISSING rom=[${romHex}] code=${codeAnalysis.likely} (${codeAnalysis.reason})`);
      if (codeAnalysis.likely) {
        allMissing.set(addr, {
          address: addr,
          mode: 'adl',
          romBytes: romHex,
          likelyCode: true,
          reason: codeAnalysis.reason,
          suggestedSeed: `{ pc: ${hex(addr)}, mode: 'adl' }`,
        });
      }
    } else {
      console.log(`    ${hex(addr)}: OK`);
    }
  }

  // --- Step 7: Summary ---
  console.log('');
  console.log('--- Step 7: Summary ---');
  console.log('');
  console.log('ROOT CAUSE of workflow probe failure:');
  console.log('  The CPU class has no .pc property. After bootToHomeScreen(), cpu.pc is undefined.');
  console.log('  The workflow probe falls back to POST_INIT_ENTRY (0x0802B2) which is a short');
  console.log('  init block ending in `ret`. The stack is filled with 0xFF, so ret pops 0xFFFFFF.');
  console.log('  No block exists at 0xFFFFFF → missing_block after 1 step.');
  console.log('');
  console.log('FIX NEEDED:');
  console.log('  1. The workflow probe should NOT re-enter at POST_INIT_ENTRY.');
  console.log('     Instead, it should call _GetCSC (0x03FA09) directly to poll for keys,');
  console.log('     or enter the OS event loop at the correct dispatch address.');
  console.log('  2. The CPU class could expose .pc as a property, set by runFrom() on exit,');
  console.log('     but this alone would not help because each stage resets the CPU state.');
  console.log('');

  // Report suggested seeds
  const seeds = [...allMissing.values()].filter(m => m.suggestedSeed);
  if (seeds.length > 0) {
    console.log('SUGGESTED SEEDS for transpiler:');
    for (const s of seeds) {
      console.log(`  ${s.suggestedSeed},  // ${s.reason} — rom: ${s.romBytes}`);
    }
  } else {
    console.log('No new seeds needed — all missing blocks are outside ROM or non-code.');
  }

  console.log('');
  console.log('ALL MISSING BLOCKS:');
  for (const [addr, info] of allMissing) {
    console.log(`  ${hex(addr)} mode=${info.mode} code=${info.likelyCode} reason="${info.reason}" rom=[${info.romBytes ?? 'N/A'}]`);
  }

  // --- Step 8: Correct approach — push a sentinel return address, call _GetCSC ---
  console.log('');
  console.log('--- Step 8: _GetCSC with proper return-address sentinel ---');
  console.log('  Using FAKE_RET=0x7FFFFE as return sentinel (no block there → clean termination)');

  const FAKE_RET = 0x7FFFFE;

  // Reset CPU state
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_RESET_TOP - 3;
  // Push fake return address onto stack (24-bit ADL ret)
  cpu.sp = (cpu.sp - 3) & 0xffffff;
  mem[cpu.sp] = FAKE_RET & 0xFF;
  mem[cpu.sp + 1] = (FAKE_RET >> 8) & 0xFF;
  mem[cpu.sp + 2] = (FAKE_RET >> 16) & 0xFF;

  // Store scan code and press key
  mem[0xD00587] = KEY_ONE.scan;
  pressKey(peripherals, KEY_ONE);

  const sentinelTrace = [];
  const sentinelResult = executor.runFrom(GETCSC_ENTRY, 'adl', {
    maxSteps: 2000,
    maxLoopIterations: 50,
    onBlock: (pc, mode, meta, steps) => {
      if (sentinelTrace.length < 50) {
        sentinelTrace.push({ pc, mode, steps });
      }
    },
  });
  releaseKey(peripherals, KEY_ONE);

  console.log(`  steps=${sentinelResult.steps} term=${sentinelResult.termination} lastPc=${hex(sentinelResult.lastPc)}`);
  console.log(`  _GetCSC returned to sentinel: ${sentinelResult.lastPc === FAKE_RET ? 'YES' : 'NO'}`);
  console.log(`  A register (scan code result): ${hex(cpu.a, 2)}`);
  console.log(`  block trace:`);
  for (const bt of sentinelTrace) {
    console.log(`    step=${bt.steps} pc=${hex(bt.pc)} mode=${bt.mode}`);
  }

  // --- Step 9: Full PutC pipeline test ---
  console.log('');
  console.log('--- Step 9: Test PutC_draw_advance (0x0540D0) directly ---');

  // Reset CPU for PutC test
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu.sp = STACK_RESET_TOP - 3;
  cpu.sp = (cpu.sp - 3) & 0xffffff;
  mem[cpu.sp] = FAKE_RET & 0xFF;
  mem[cpu.sp + 1] = (FAKE_RET >> 8) & 0xFF;
  mem[cpu.sp + 2] = (FAKE_RET >> 16) & 0xFF;

  // Set A = '1' character (TI char code for '1' is 0x31)
  cpu.a = 0x31;

  const putcTrace = [];
  const putcMissing = [];
  const putcResult = executor.runFrom(0x0540D0, 'adl', {
    maxSteps: 5000,
    maxLoopIterations: 100,
    onBlock: (pc, mode, meta, steps) => {
      if (putcTrace.length < 80) {
        putcTrace.push({ pc, mode, steps });
      }
    },
    onMissingBlock: (pc, mode, steps) => {
      putcMissing.push({ pc, mode, steps });
    },
  });

  console.log(`  steps=${putcResult.steps} term=${putcResult.termination} lastPc=${hex(putcResult.lastPc)}`);
  console.log(`  returned to sentinel: ${putcResult.lastPc === FAKE_RET ? 'YES' : 'NO'}`);
  console.log(`  missing blocks: ${putcMissing.length}`);
  for (const mb of putcMissing) {
    const romHex = romBytesAt(mb.pc, 16);
    const codeAnalysis = isLikelyCode(mb.pc);
    console.log(`    ${hex(mb.pc)} mode=${mb.mode} rom=[${romHex ?? 'N/A'}] code=${codeAnalysis.likely} (${codeAnalysis.reason})`);
    if (codeAnalysis.likely && !allMissing.has(mb.pc)) {
      allMissing.set(mb.pc, {
        address: mb.pc,
        mode: mb.mode,
        romBytes: romHex,
        likelyCode: true,
        reason: codeAnalysis.reason,
        suggestedSeed: `{ pc: ${hex(mb.pc)}, mode: '${mb.mode}' }`,
      });
    }
  }
  console.log(`  block trace (first 30):`);
  for (const bt of putcTrace.slice(0, 30)) {
    console.log(`    step=${bt.steps} pc=${hex(bt.pc)} mode=${bt.mode}`);
  }

  // Final seed recommendations
  const finalSeeds = [...allMissing.values()].filter(m => m.suggestedSeed);
  if (finalSeeds.length > 0) {
    console.log('');
    console.log('=== FINAL SEED RECOMMENDATIONS ===');
    for (const s of finalSeeds) {
      console.log(`  ${s.suggestedSeed},  // ${s.reason} — rom: ${s.romBytes}`);
    }
  }
}

try {
  main();
} catch (error) {
  console.error('PROBE FAILED:', error.stack || error);
  process.exitCode = 1;
}
