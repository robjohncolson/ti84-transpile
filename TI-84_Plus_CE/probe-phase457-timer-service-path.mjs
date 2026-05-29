#!/usr/bin/env node
// Phase 457 probe: confirm that timer service 0x001ACF is gated behind MBASE != 0xD0
//
// Key finding under test:
//   IRQ handler at 0x000708: ED 6E = LD A, MB (loads MBASE into A)
//   0x00070A: CP 0xD0
//   0x00070C: JP NZ, 0x0019B5 — if MBASE != 0xD0, go to bit-testing chain
//   If MBASE == 0xD0 (normal operation), falls through to 0x000710 → _GetCSC → 0x0067F8
//
//   The bit-testing chain at 0x0019B5+ reads interrupt status ports and tests bits:
//   0x0019FB: JP C, 0x001AA3 — bit 4 of port value
//   0x001A01: JP C, 0x001ACF — bit 5 of port value (timer service entry)
//   Only reachable when MBASE != 0xD0, which NEVER happens during normal OS operation.
//
//   Normal timer handling path: 0x0067F8 (called from _GetCSC at 0x001713)
//   Reads port 0x03, ANDs with mask, compares with expected value.
//   Returns HL=1 (timer event) or HL=0 (no timer event).

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

// Tracked addresses and their labels
const TRACKED = [
  [0x000038, 'IRQ_VECTOR'],
  [0x0006F3, 'IRQ_FRONTEND'],
  [0x00070C, 'MBASE_CHECK_JP_NZ'],
  [0x000710, 'D0_MBASE_PATH'],
  [0x0019B5, 'NON_D0_MBASE_PATH'],
  [0x001ACF, 'TIMER_SERVICE'],
  [0x001713, 'GET_CSC'],
  [0x0067F8, 'TIMER_SCHEDULER_CHECK'],
  [0x02010C, 'JP_TABLE_ENTRY'],
  [0x03CF7D, 'EVENT_LOOP_DISPATCH'],
];
const TRACKED_SET = new Set(TRACKED.map(([pc]) => pc));
const TRACKED_LABELS = Object.fromEntries(TRACKED);

const KEY_AVAILABLE_FLAG_ADDR = 0xD00080;
const KEY_AVAILABLE_FLAG_MASK = 0x08;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_BUFFER_ADDR = 0xD141B5;
const KEY_GATE_ADDR = 0xD177BA;
const KEY_PROCESSING_ENABLE_ADDR = 0xD14091;
const DISPLAY_MODE_ADDR = 0xD177B7;

const KEY_ONE_SCAN = 0x12;
const STEP_BUDGET = 2000000;
const MAX_LOOP_ITERATIONS = 50000;

function hex(value, width = 6) {
  if (value === undefined || value === null) return null;
  return `0x${(value >>> 0).toString(16).padStart(width, '0').toUpperCase()}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
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

function injectKeyOne(mem) {
  mem[KEY_SCAN_CODE_ADDR] = 0x00;
  mem[KEY_AVAILABLE_FLAG_ADDR] &= ~KEY_AVAILABLE_FLAG_MASK;
  mem[KEY_BUFFER_ADDR] = 0x00;

  mem[KEY_SCAN_CODE_ADDR] = KEY_ONE_SCAN;
  mem[KEY_AVAILABLE_FLAG_ADDR] |= KEY_AVAILABLE_FLAG_MASK;
}

function dumpRomBytes(start, end) {
  const bytes = [];
  for (let addr = start; addr < end; addr++) {
    bytes.push(romBytes[addr].toString(16).toUpperCase().padStart(2, '0'));
  }
  return {
    range: `${hex(start)}-${hex(end)}`,
    bytes: bytes.join(' '),
    length: end - start,
  };
}

function main() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: true });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // Visit counters for all tracked addresses
  const visitCounts = new Map();
  for (const [pc] of TRACKED) {
    visitCounts.set(pc, 0);
  }

  // MBASE values observed at the 0x00070C check point
  const mbaseAtCheck = new Map();
  let inIrqRegion = false;

  // Boot to home screen
  const bootState = bootToHomeScreen(executor, cpu, mem);

  // Set up state for event loop
  mem[KEY_PROCESSING_ENABLE_ADDR] = 1;
  mem[DISPLAY_MODE_ADDR] = 0x55;
  mem[KEY_GATE_ADDR] = 0x00;
  injectKeyOne(mem);

  let runResult;

  try {
    runResult = executor.runFrom(bootState.lastPc, bootState.lastMode ?? 'adl', {
      maxSteps: STEP_BUDGET,
      maxLoopIterations: MAX_LOOP_ITERATIONS,
      diHaltBypass: true,
      onBlock(pc) {
        const npc = pc & 0xFFFFFF;

        // Count visits to tracked addresses
        if (TRACKED_SET.has(npc)) {
          visitCounts.set(npc, visitCounts.get(npc) + 1);
        }

        // Track MBASE at the JP NZ check point
        if (npc === 0x000038) {
          inIrqRegion = true;
        }

        if (inIrqRegion && npc === 0x00070C) {
          const mb = cpu.mbase ?? 0;
          mbaseAtCheck.set(mb, (mbaseAtCheck.get(mb) || 0) + 1);
        }

        // Leave IRQ region once we reach event loop or high addresses
        if (inIrqRegion && npc > 0x010000 && npc < 0xD00000) {
          inIrqRegion = false;
        }
      },
    });
  } catch (err) {
    runResult = {
      steps: cpu.stepCount ?? 0,
      lastPc: cpu.pc ?? bootState.lastPc,
      lastMode: cpu.madl ? 'adl' : 'z80',
      termination: 'throw',
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Build labeled visit count report
  const visitReport = {};
  for (const [pc, label] of TRACKED) {
    visitReport[`${hex(pc)} (${label})`] = visitCounts.get(pc);
  }

  // MBASE values summary
  const mbaseSummary = {};
  for (const [mb, count] of mbaseAtCheck.entries()) {
    mbaseSummary[hex(mb, 2)] = count;
  }

  const allMbaseD0 = mbaseAtCheck.size <= 1 && (mbaseAtCheck.size === 0 || mbaseAtCheck.has(0xD0));
  const timerServiceReached = visitCounts.get(0x001ACF) > 0;
  const timerCheckReached = visitCounts.get(0x0067F8) > 0;
  const nonD0PathReached = visitCounts.get(0x0019B5) > 0;
  const d0PathReached = visitCounts.get(0x000710) > 0;

  // ROM byte dumps at key locations
  const romDumps = {
    mbase_check_and_branch_0x000708_0x000720: dumpRomBytes(0x000708, 0x000720),
    timer_service_jp_c_0x001A00_0x001A08: dumpRomBytes(0x001A00, 0x001A08),
    timer_check_function_0x0067F8_0x006830: dumpRomBytes(0x0067F8, 0x006830),
  };

  // Determine conclusion
  let conclusion;
  if (allMbaseD0 && !timerServiceReached && d0PathReached && !nonD0PathReached) {
    if (timerCheckReached) {
      conclusion = 'CONFIRMED: MBASE is always 0xD0 during IRQ. Timer service 0x001ACF is unreachable. '
        + 'Timer handling goes through 0x0067F8 (via _GetCSC at 0x001713), not 0x001ACF.';
    } else {
      conclusion = 'CONFIRMED: MBASE is always 0xD0, so 0x001ACF is unreachable. '
        + 'However 0x0067F8 was also not reached — check if _GetCSC calls it.';
    }
  } else if (timerServiceReached) {
    conclusion = 'UNEXPECTED: timer service 0x001ACF WAS reached — the MBASE gating hypothesis is wrong.';
  } else if (!allMbaseD0) {
    conclusion = 'UNEXPECTED: non-0xD0 MBASE values seen during IRQ — needs investigation.';
  } else {
    conclusion = 'INCONCLUSIVE: no IRQ vector visits detected — timer interrupt may not be firing.';
  }

  const report = {
    probe: 'phase457-timer-service-path',
    description: 'Confirm timer service 0x001ACF is gated behind MBASE != 0xD0',
    stepBudget: STEP_BUDGET,
    totalSteps: runResult.steps ?? 0,
    finalPc: hex(runResult.lastPc),
    finalMode: runResult.lastMode ?? null,
    termination: runResult.termination ?? 'unknown',
    error: runResult.error ?? null,

    mbaseAnalysis: {
      mbaseValuesAtCheckPoint: mbaseSummary,
      sampleCount: [...mbaseAtCheck.values()].reduce((a, b) => a + b, 0),
      allMbaseD0,
    },

    visitCounts: visitReport,

    pathAnalysis: {
      irqVectorHit: visitCounts.get(0x000038) > 0,
      irqVectorVisits: visitCounts.get(0x000038),
      d0PathUsed: d0PathReached,
      d0PathVisits: visitCounts.get(0x000710),
      nonD0PathUsed: nonD0PathReached,
      nonD0PathVisits: visitCounts.get(0x0019B5),
      timerServiceReached,
      timerServiceVisits: visitCounts.get(0x001ACF),
      timerCheckReached,
      timerCheckVisits: visitCounts.get(0x0067F8),
      getCSCVisits: visitCounts.get(0x001713),
      eventLoopDispatchVisits: visitCounts.get(0x03CF7D),
    },

    romBytes: romDumps,

    summary: {
      hypothesis: 'Timer service 0x001ACF is gated behind MBASE != 0xD0, unreachable during normal operation',
      confirmed: allMbaseD0 && !timerServiceReached && d0PathReached && !nonD0PathReached,
      conclusion,
      details: [
        `MBASE always 0xD0 at check: ${allMbaseD0}`,
        `D0-path (0x000710) visits: ${visitCounts.get(0x000710)}`,
        `Non-D0-path (0x0019B5) visits: ${visitCounts.get(0x0019B5)}`,
        `Timer service (0x001ACF) visits: ${visitCounts.get(0x001ACF)}`,
        `Timer check (0x0067F8) visits: ${visitCounts.get(0x0067F8)}`,
        `_GetCSC (0x001713) visits: ${visitCounts.get(0x001713)}`,
        `IRQ vector (0x000038) visits: ${visitCounts.get(0x000038)}`,
      ],
    },
  };

  console.log('=== Phase 457 Timer Service Path Probe ===');
  console.log(JSON.stringify(report, null, 2));
}

main();
