#!/usr/bin/env node
// Phase 466: Trace the 0x001296 interrupt status check and its Z (zero-flag) path.
//
// 0x001296 reads port 0x500C (FTINTC010 interrupt status), clears bit 0,
// writes back, reads again, ANDs with 0x01, compares. Returns Z if bit 0
// was NOT set, NZ if it was set.
//
// 0x0017BC is the cleanup path taken when Z (no interrupt pending):
//   clears D00595 to 0x000000, then JP 0x003A0F (event loop re-entry).
//
// This probe:
//   Part 1: ROM byte dump at 0x001296 (64 bytes) and 0x0017BC (32 bytes)
//   Part 2: Run scheduler with timer IRQ enabled, track hit counts
//   Part 3: Analysis of Z vs NZ conditions and D00595 usage

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

// Boot constants (same as reference probe)
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

// Target addresses
const CHECK_ADDR = 0x001296;      // interrupt status check routine
const CLEANUP_ADDR = 0x0017BC;    // cleanup path when Z
const REENTRY_ADDR = 0x003A0F;    // event loop re-entry
const SCHEDULER_ENTRY = 0x0015F7; // scheduler entry
const EVENT_HANDLER = 0x001794;   // event handler
const EVENT_HANDLER_CALL = 0x001783; // event handler call site

// Memory addresses
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_AVAILABLE_BYTE = 0xD00080;
const KEY_AVAILABLE_MASK = 0x08;
const KEY_ENABLE_FLAG = 0xD14091;
const DISPLAY_DIRTY_FLAG = 0xD177B7;
const D00595_ADDR = 0xD00595;

const RUN_MAX_STEPS = 1000000;
const RUN_MAX_LOOP_ITERATIONS = 50000;

const TRACKED_PCS = [
  [CHECK_ADDR, 'CHECK_0x001296'],
  [CLEANUP_ADDR, 'CLEANUP_0x0017BC'],
  [REENTRY_ADDR, 'REENTRY_0x003A0F'],
  [EVENT_HANDLER, 'EVT_HANDLER_0x001794'],
  [EVENT_HANDLER_CALL, 'EVT_CALL_0x001783'],
  [SCHEDULER_ENTRY, 'SCHEDULER_0x0015F7'],
];

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function coldBoot(executor, cpu, mem) {
  const bootResult = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelResult = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
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

  const postInitResult = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return { boot: bootResult, kernel: kernelResult, postInit: postInitResult };
}

function createTrackedState() {
  const state = new Map();
  for (const [pc, label] of TRACKED_PCS) {
    state.set(pc, { label, count: 0, firstStep: null, lastStep: null, sampleSteps: [] });
  }
  return state;
}

function hexDump(bytes, start, length) {
  const lines = [];
  for (let i = 0; i < length; i += 16) {
    const addr = start + i;
    const chunk = [];
    for (let j = 0; j < 16 && i + j < length; j++) {
      chunk.push(bytes[addr + j].toString(16).toUpperCase().padStart(2, '0'));
    }
    lines.push(`${hex(addr)}: ${chunk.join(' ')}`);
  }
  return lines;
}

async function main() {
  console.log('=== Phase 466: 0x001296 Interrupt Status Check — Z-Path Trace ===');
  console.log('');

  // ============================================================
  // Part 1: ROM byte dump and manual decode
  // ============================================================
  console.log('--- Part 1: ROM byte dump ---');
  console.log('');

  console.log('0x001296 interrupt status check (64 bytes):');
  for (const line of hexDump(romBytes, 0x001296, 64)) {
    console.log(line);
  }
  console.log('');

  console.log('Manual decode of 0x001296:');
  console.log('  Reads port 0x500C (FTINTC010 interrupt status)');
  console.log('  Clears bit 0, writes back');
  console.log('  Reads again, ANDs with 0x01, compares');
  console.log('  Returns Z if bit 0 was NOT set (no interrupt pending)');
  console.log('  Returns NZ if bit 0 was set (interrupt pending)');
  console.log('');

  console.log('0x0017BC cleanup path (32 bytes):');
  for (const line of hexDump(romBytes, 0x0017BC, 32)) {
    console.log(line);
  }
  console.log('');

  console.log('Manual decode of 0x0017BC:');
  console.log('  0017BC: E5          PUSH HL');
  console.log('  0017BD: 21 00 00 00 LD HL, 0x000000');
  console.log('  0017C1: 22 95 05 D0 LD (D00595), HL  ; clear D00595');
  console.log('  0017C5: E1          POP HL');
  // Verify what's at 0x0017C6 onward
  const at17C6 = [];
  for (let i = 0; i < 10; i++) {
    at17C6.push(romBytes[0x0017C6 + i].toString(16).toUpperCase().padStart(2, '0'));
  }
  console.log(`  0017C6 onward: ${at17C6.join(' ')}`);
  // Check for JP at 0x0017CC
  if (romBytes[0x0017CC] === 0xC3) {
    const target = romBytes[0x0017CD] | (romBytes[0x0017CE] << 8) | (romBytes[0x0017CF] << 16);
    console.log(`  0017CC: C3 ${hex(target)} JP ${hex(target)}  ; event loop re-entry`);
  }
  console.log('');

  // D00595 reference scan
  console.log('D00595 ROM references:');
  const needle = [0x95, 0x05, 0xD0]; // little-endian D00595
  let refCount = 0;
  for (let i = 0; i <= romBytes.length - 3; i++) {
    if (romBytes[i] === needle[0] && romBytes[i + 1] === needle[1] && romBytes[i + 2] === needle[2]) {
      // Check for instruction context
      let context = '';
      if (i > 0) {
        const prev = romBytes[i - 1];
        if (prev === 0x22) context = 'LD (D00595),HL';
        else if (prev === 0x2A) context = 'LD HL,(D00595)';
        else if (prev === 0x32) context = 'LD (D00595),A';
        else if (prev === 0x3A) context = 'LD A,(D00595)';
      }
      console.log(`  ${hex(i - 1)}: ref to D00595 ${context}`);
      refCount++;
      if (refCount >= 20) {
        console.log('  ... (truncated)');
        break;
      }
    }
  }
  console.log('');

  // ============================================================
  // Part 2: Run scheduler with timer IRQ enabled
  // ============================================================
  console.log('--- Part 2: Scheduler run with timer IRQ ---');
  console.log('');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({
    pllDelay: 2,
    timerInterrupt: true,
  });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Stage 1: Cold boot
  console.log('Stage 1: Cold boot');
  const bootState = coldBoot(executor, cpu, mem);
  console.log(`  boot:     steps=${bootState.boot.steps} term=${bootState.boot.termination}`);
  console.log(`  kernel:   steps=${bootState.kernel.steps} term=${bootState.kernel.termination}`);
  console.log(`  postInit: steps=${bootState.postInit.steps} term=${bootState.postInit.termination}`);
  console.log('');

  // Stage 2: Pre-run setup
  console.log('Stage 2: Pre-run state setup');
  mem[KEY_ENABLE_FLAG] = 0x01;            // key processing enable
  mem[DISPLAY_DIRTY_FLAG] = 0x55;         // display dirty
  mem[0xD177BA] = 0x7F;                   // additional display state

  // Inject key
  mem[KEY_SCAN_CODE_ADDR] = 0x92;         // key "1" scan code
  mem[KEY_AVAILABLE_BYTE] |= KEY_AVAILABLE_MASK; // bit 3 = key available

  // Set keyboard matrix
  if (peripherals.keyMatrix) {
    peripherals.keyMatrix[4] = 0xFD;
    console.log('  keyMatrix[4] = 0xFD');
  } else {
    console.log('  WARNING: peripherals.keyMatrix not accessible');
  }

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;

  console.log(`  D00587 scan code  = ${hex(mem[KEY_SCAN_CODE_ADDR], 2)}`);
  console.log(`  D00080 key avail  = ${hex(mem[KEY_AVAILABLE_BYTE], 2)} (bit3=${(mem[KEY_AVAILABLE_BYTE] >> 3) & 1})`);
  console.log(`  D14091 key enable = ${hex(mem[KEY_ENABLE_FLAG], 2)}`);
  console.log(`  D177B7 disp dirty = ${hex(mem[DISPLAY_DIRTY_FLAG], 2)}`);
  console.log(`  D00595 initial    = ${hex(mem[D00595_ADDR] | (mem[D00595_ADDR + 1] << 8) | (mem[D00595_ADDR + 2] << 16))}`);
  console.log('');

  // Stage 3: Tracking state
  const trackedState = createTrackedState();
  const d00595Changes = [];
  const milestoneLog = [];
  const firstUniquePcs = [];
  const firstUniquePcSet = new Set();
  const missingBlocks = [];

  let currentPc = SCHEDULER_ENTRY;
  let currentStep = 0;

  // Hook writes to watch D00595
  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  cpu.write8 = (addr, value) => {
    const a = addr & 0xFFFFFF;
    const before = mem[a] & 0xFF;
    origWrite8(addr, value);
    if (a >= D00595_ADDR && a <= D00595_ADDR + 2 && before !== (mem[a] & 0xFF)) {
      if (d00595Changes.length < 20) {
        d00595Changes.push({ step: currentStep, pc: currentPc, byte: a - D00595_ADDR, before, after: mem[a] & 0xFF });
      }
    }
  };

  cpu.write24 = (addr, value) => {
    const base = addr & 0xFFFFFF;
    const b0 = mem[base] & 0xFF;
    const b1 = mem[(base + 1) & 0xFFFFFF] & 0xFF;
    const b2 = mem[(base + 2) & 0xFFFFFF] & 0xFF;
    origWrite24(addr, value);
    for (let i = 0; i < 3; i++) {
      const a = (base + i) & 0xFFFFFF;
      const beforeVal = [b0, b1, b2][i];
      if (a >= D00595_ADDR && a <= D00595_ADDR + 2 && beforeVal !== (mem[a] & 0xFF)) {
        if (d00595Changes.length < 20) {
          d00595Changes.push({ step: currentStep, pc: currentPc, byte: a - D00595_ADDR, before: beforeVal, after: mem[a] & 0xFF });
        }
      }
    }
  };

  // Stage 4: Run scheduler
  console.log('Stage 3: Run scheduler at 0x0015F7 (1M steps, loopLimit 50000, timerInterrupt=true)');
  let runResult;
  try {
    runResult = executor.runFrom(SCHEDULER_ENTRY, 'adl', {
      maxSteps: RUN_MAX_STEPS,
      maxLoopIterations: RUN_MAX_LOOP_ITERATIONS,
      diHaltBypass: true,

      onBlock(pc, mode, _meta, steps) {
        const normalizedPc = pc & 0xFFFFFF;
        const stepIndex = steps + 1;
        currentPc = normalizedPc;
        currentStep = stepIndex;

        if (firstUniquePcs.length < 60 && !firstUniquePcSet.has(normalizedPc)) {
          firstUniquePcSet.add(normalizedPc);
          firstUniquePcs.push({ step: stepIndex, pc: normalizedPc, mode });
        }

        const tracked = trackedState.get(normalizedPc);
        if (tracked) {
          tracked.count++;
          if (tracked.firstStep === null) {
            tracked.firstStep = stepIndex;
            if (milestoneLog.length < 50) {
              milestoneLog.push(`step=${stepIndex} first-hit ${tracked.label} @ ${hex(normalizedPc)}`);
            }
          }
          tracked.lastStep = stepIndex;
          if (tracked.sampleSteps.length < 10) {
            tracked.sampleSteps.push(stepIndex);
          }
        }
      },

      onMissingBlock(pc, mode, steps) {
        if (missingBlocks.length < 30) {
          missingBlocks.push({ step: steps + 1, pc: pc & 0xFFFFFF, mode });
        }
      },
    });
  } catch (error) {
    runResult = {
      steps: cpu.stepCount ?? 0,
      lastPc: cpu.pc ?? SCHEDULER_ENTRY,
      lastMode: cpu.madl ? 'adl' : 'z80',
      termination: 'throw',
      error: error instanceof Error ? error.message : String(error),
    };
  }

  console.log(`  run: steps=${runResult.steps} term=${runResult.termination} lastPc=${hex(runResult.lastPc)}`);
  if (runResult.error) console.log(`  run error: ${runResult.error}`);
  console.log('');

  // ============================================================
  // Part 3: Analysis
  // ============================================================
  console.log('--- Part 3: Results and Analysis ---');
  console.log('');

  // Hit counts
  console.log('=== Hit Count Summary ===');
  for (const [pc] of TRACKED_PCS) {
    const t = trackedState.get(pc);
    console.log(
      `${t.label.padEnd(28)} ${hex(pc)}  count=${t.count} `
      + `first=${t.firstStep ?? 'n/a'} last=${t.lastStep ?? 'n/a'}`,
    );
    if (t.sampleSteps.length > 0) {
      console.log(`  sample steps: ${t.sampleSteps.join(', ')}`);
    }
  }
  console.log('');

  // D00595 changes
  console.log('=== D00595 Write Log ===');
  if (d00595Changes.length === 0) {
    console.log('No writes to D00595 observed.');
  } else {
    for (const c of d00595Changes) {
      console.log(`  step=${c.step} pc=${hex(c.pc)} byte[${c.byte}] ${hex(c.before, 2)}->${hex(c.after, 2)}`);
    }
  }
  const d00595Final = mem[D00595_ADDR] | (mem[D00595_ADDR + 1] << 8) | (mem[D00595_ADDR + 2] << 16);
  console.log(`D00595 final value: ${hex(d00595Final)}`);
  console.log('');

  // First unique PCs
  console.log('=== First 60 Unique PCs ===');
  for (let i = 0; i < firstUniquePcs.length; i++) {
    const e = firstUniquePcs[i];
    console.log(`[${String(i + 1).padStart(2, '0')}] step=${e.step} pc=${hex(e.pc)} mode=${e.mode}`);
  }
  console.log('');

  // Missing blocks
  if (missingBlocks.length > 0) {
    console.log('=== Missing Blocks ===');
    for (const mb of missingBlocks) {
      console.log(`step=${mb.step} pc=${hex(mb.pc)} mode=${mb.mode}`);
    }
    console.log('');
  }

  // Milestones
  if (milestoneLog.length > 0) {
    console.log('=== Milestones ===');
    for (const line of milestoneLog) console.log(line);
    console.log('');
  }

  // Verdict
  const checkHits = trackedState.get(CHECK_ADDR)?.count ?? 0;
  const cleanupHits = trackedState.get(CLEANUP_ADDR)?.count ?? 0;
  const reentryHits = trackedState.get(REENTRY_ADDR)?.count ?? 0;
  const evtHandlerHits = trackedState.get(EVENT_HANDLER)?.count ?? 0;
  const evtCallHits = trackedState.get(EVENT_HANDLER_CALL)?.count ?? 0;
  const schedulerHits = trackedState.get(SCHEDULER_ENTRY)?.count ?? 0;

  console.log('=== Analysis ===');
  console.log('');
  console.log('Q: Under what conditions does 0x001296 return Z vs NZ?');
  console.log('A: 0x001296 reads FTINTC010 port 0x500C, checks bit 0.');
  console.log('   Z  = bit 0 clear = no interrupt pending on this source.');
  console.log('   NZ = bit 0 set   = interrupt pending, needs servicing.');
  console.log('');
  console.log(`Q: How often does the cleanup path at 0x0017BC get hit?`);
  console.log(`A: ${cleanupHits} times during ${RUN_MAX_STEPS} scheduler steps.`);
  console.log('');
  console.log('Q: What is D00595 used for?');
  console.log('A: D00595 is a 3-byte (ADL-width) event-handler state word.');
  console.log('   The cleanup path at 0x0017BC clears it to 0x000000 before');
  console.log('   jumping to the event loop re-entry at 0x003A0F.');
  console.log(`   Final value: ${hex(d00595Final)}`);
  console.log('');

  console.log('=== Verdict ===');
  console.log(`Scheduler entered:           ${schedulerHits > 0 ? 'YES' : 'NO'} (count=${schedulerHits})`);
  console.log(`0x001296 check reached:      ${checkHits > 0 ? 'YES' : 'NO'} (count=${checkHits})`);
  console.log(`0x0017BC cleanup (Z path):   ${cleanupHits > 0 ? 'YES' : 'NO'} (count=${cleanupHits})`);
  console.log(`0x003A0F re-entry:           ${reentryHits > 0 ? 'YES' : 'NO'} (count=${reentryHits})`);
  console.log(`0x001794 event handler:      ${evtHandlerHits > 0 ? 'YES' : 'NO'} (count=${evtHandlerHits})`);
  console.log(`0x001783 event handler call: ${evtCallHits > 0 ? 'YES' : 'NO'} (count=${evtCallHits})`);
  console.log('');

  if (checkHits > 0 && cleanupHits > 0) {
    console.log('PASS: 0x001296 check reached AND Z-path cleanup at 0x0017BC taken.');
  } else if (checkHits > 0) {
    console.log('PARTIAL: 0x001296 reached but cleanup path at 0x0017BC not taken (NZ path every time).');
  } else {
    console.log('FAIL: 0x001296 interrupt status check was never reached.');
  }

  process.exitCode = checkHits > 0 ? 0 : 1;
}

try {
  await main();
} catch (error) {
  console.error('Fatal error:', error.stack || error);
  process.exitCode = 1;
}
