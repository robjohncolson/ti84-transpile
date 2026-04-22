#!/usr/bin/env node

/**
 * Phase 25H-b: Verify the negative-path contract of Rcl_StatVar.
 *
 * Contract-under-test (TI-OS):
 *   If statFlags.statsValid (bit 6 of byte at flags+9 == 0xD00089) is clear,
 *   Rcl_StatVar must not deliver a valid statistic into OP1 and should set
 *   carry (or dispatch DispErrorScreen) to signal ERR:STAT.
 *
 * From TI-84_Plus_CE/references/ti84pceg.inc:
 *   ?Rcl_StatVar   := 00204F0h            (jump-table slot; line 277)
 *   ?flags         := 0D00080h            (line 2529; OS flags base)
 *   ?statFlags     := 9h                  (line 6887; offset from flags)
 *   ?statsValid    := 6                   (line 6889; bit index -- treated
 *                                          here as the "allStats" / fresh-OS
 *                                          sentinel bit described in the
 *                                          task. No separate "allStats"
 *                                          equate exists in ti84pceg.inc.)
 *   ?tMean         := IMUN+15 ;21h        (line 5758)
 *   ?IMUN          := 12h                 (line 5741)    -> tMean = 0x21
 *   ?OP1           := 0D005F8h            (line 2598)
 *
 * Impl mapping (from phase25h-a-jump-table.json):
 *   JT slot 0x0204F0  -> impl 0x08019F
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25h-b-report.md');

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

// Addresses from ti84pceg.inc
const JT_RCL_STATVAR      = 0x0204F0;
const IMPL_RCL_STATVAR    = 0x08019F;
const FLAGS_BASE          = 0xD00080;
const STATFLAGS_ADDR      = FLAGS_BASE + 0x09; // 0xD00089
const STATS_VALID_BIT     = 0x40;              // bit 6
const OP1_ADDR            = 0xD005F8;
const OP1_LEN             = 9;                 // per task spec
const SENTINEL_BYTE       = 0xCC;
const TMEAN_TOKEN         = 0x21;              // IMUN (0x12) + 15

const ERROR_SELECTOR_ADDR = 0xD008DF;          // per prior phase reports
const VRAM_BASE           = 0xD40000;
const VRAM_SAMPLE_LEN     = 16;

const DISP_ERROR_SCREEN   = 0x062160;

const FAKE_RET = 0x7FFFFE; // arbitrary sentinel PC; not a valid lifted block
const INSN_BUDGET = 200000;

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function readBlock(mem, addr, len) {
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = mem[addr + i];
  return out;
}

function hexBytes(bytes) {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join(' ');
}

function bytesEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

// ---- OS init (verbatim from probe-phase99d-home-verify.mjs) ------------

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

function postInitState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

// ---- Main --------------------------------------------------------------

async function main() {
  console.log('=== Phase 25H-b: Rcl_StatVar negative-path probe ===');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const bootResult = coldBoot(executor, cpu, mem);
  console.log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);

  postInitState(cpu, mem);

  // -- Assertion 1: statsValid CLEAR on fresh OS ---------------------------
  const statFlagsByteBefore = mem[STATFLAGS_ADDR] & 0xFF;
  const statsValidClear = (statFlagsByteBefore & STATS_VALID_BIT) === 0;
  console.log(`statFlags @ ${hex(STATFLAGS_ADDR)} = ${hex(statFlagsByteBefore, 2)}  statsValid(bit6) clear? ${statsValidClear}`);

  // -- Set up registers & OP1 sentinel ------------------------------------
  cpu.a = TMEAN_TOKEN; // see comment at top: tMean = 0x21
  for (let i = 0; i < OP1_LEN; i++) mem[OP1_ADDR + i] = SENTINEL_BYTE;

  // Snapshot error selector + VRAM sample
  const errorSelBefore = mem[ERROR_SELECTOR_ADDR] & 0xFF;
  const vramBefore = readBlock(mem, VRAM_BASE, VRAM_SAMPLE_LEN);

  // Pre-call snapshot
  const aBefore = cpu.a & 0xFF;
  const fBefore = cpu.f & 0xFF;
  const op1Before = readBlock(mem, OP1_ADDR, OP1_LEN);

  // -- CALL 0x0204F0 ------------------------------------------------------
  // Push FAKE_RET as a 24-bit (ADL) return, run until PC == FAKE_RET.
  cpu.push(FAKE_RET);

  let stepsExecuted = 0;
  let blockCount = 0;
  const recentPcs = [];
  let dispErrorHit = false;
  let finalPc = null;

  try {
    const result = executor.runFrom(JT_RCL_STATVAR, 'adl', {
      maxSteps: INSN_BUDGET,
      maxLoopIterations: 4096,
      onBlock(pc) {
        const norm = pc & 0xFFFFFF;
        cpu.pc = norm;
        finalPc = norm;
        blockCount++;
        if (norm === DISP_ERROR_SCREEN) dispErrorHit = true;
        recentPcs.push(norm);
        if (recentPcs.length > 10) recentPcs.shift();
        if (norm === FAKE_RET) {
          // Short-circuit by throwing a sentinel
          throw new Error('__RETURN_HIT__');
        }
      },
      onMissingBlock(pc) {
        const norm = pc & 0xFFFFFF;
        cpu.pc = norm;
        finalPc = norm;
        if (norm === FAKE_RET) {
          throw new Error('__RETURN_HIT__');
        }
      },
    });
    stepsExecuted = result.steps;
    finalPc = result.lastPc ?? finalPc;
    console.log(`call completed: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}`);
  } catch (err) {
    if (err?.message === '__RETURN_HIT__') {
      console.log(`call returned to FAKE_RET @ ${hex(FAKE_RET)}`);
    } else {
      throw err;
    }
  }

  // Post-call snapshot
  const aAfter = cpu.a & 0xFF;
  const fAfter = cpu.f & 0xFF;
  const op1After = readBlock(mem, OP1_ADDR, OP1_LEN);
  const statFlagsByteAfter = mem[STATFLAGS_ADDR] & 0xFF;
  const errorSelAfter = mem[ERROR_SELECTOR_ADDR] & 0xFF;
  const vramAfter = readBlock(mem, VRAM_BASE, VRAM_SAMPLE_LEN);

  const carryAfter = (fAfter & 0x01) !== 0;
  const op1Unchanged = bytesEqual(op1Before, op1After);
  const errorSelChanged = errorSelBefore !== errorSelAfter;
  const vramChanged = !bytesEqual(vramBefore, vramAfter);

  // PC hit FAKE_RET?
  const reachedReturn = finalPc === FAKE_RET;

  // -- Assertions --
  const a1_pass = statsValidClear;
  const a2_pass = carryAfter || dispErrorHit; // carry set OR DispErrorScreen dispatched
  const a3_pass = op1Unchanged;               // OP1 should NOT carry a fabricated result
  const a4_pass = errorSelChanged || vramChanged || dispErrorHit;

  const fmt = (b) => b ? 'PASS' : 'FAIL';

  console.log('');
  console.log(`Assertion 1 (statsValid clear pre-call):   ${fmt(a1_pass)}`);
  console.log(`Assertion 2 (carry set or DispErrorHit):   ${fmt(a2_pass)}  carry=${carryAfter} dispErr=${dispErrorHit}`);
  console.log(`Assertion 3 (OP1 unchanged vs sentinel):   ${fmt(a3_pass)}`);
  console.log(`Assertion 4 (error path signal observed):  ${fmt(a4_pass)}  errSel ${hex(errorSelBefore,2)}->${hex(errorSelAfter,2)} vramChanged=${vramChanged}`);
  console.log(`Instructions executed: ${stepsExecuted}`);
  console.log(`Final PC: ${hex(finalPc)} reachedReturn=${reachedReturn}`);

  // ---- Report -----------------------------------------------------------
  const lines = [];
  lines.push('# Phase 25H-b — Rcl_StatVar Negative-Path Contract Probe');
  lines.push('');
  lines.push('Generated by `probe-phase25h-b-rcl-statvar.mjs`.');
  lines.push('');
  lines.push('## What Was Tested');
  lines.push('');
  lines.push('Calls `Rcl_StatVar` via its jump-table slot immediately after fresh');
  lines.push('OS init (statsValid clear) with A = tMean, and verifies that the');
  lines.push('routine refuses to produce a valid OP1 and signals ERR:STAT via');
  lines.push('carry flag and/or DispErrorScreen dispatch.');
  lines.push('');
  lines.push('## Authoritative Equates (ti84pceg.inc)');
  lines.push('');
  lines.push('```');
  lines.push('?Rcl_StatVar               := 00204F0h      ; line 277');
  lines.push('?flags      := 0D00080h                     ; line 2529');
  lines.push('?statFlags  := 9h          ;statistics flags ; line 6887');
  lines.push('?statsValid := 6           ;1=stats are valid ; line 6889');
  lines.push('?IMUN       := 12h                          ; line 5741');
  lines.push('?tMean      := IMUN+15 ;21h                 ; line 5758  -> 0x21');
  lines.push('?OP1        := 0D005F8h                     ; line 2598');
  lines.push('```');
  lines.push('');
  lines.push('Note: ti84pceg.inc has no `allStats` equate; the task spec uses that');
  lines.push('name to refer to `statsValid` (bit 6 of statFlags). The fresh-OS');
  lines.push('"no stat command has been run" sentinel is `statsValid == 0`.');
  lines.push('');
  lines.push('## JT Slot → Impl Mapping');
  lines.push('');
  lines.push(`- JT slot: \`${hex(JT_RCL_STATVAR)}\``);
  lines.push(`- Impl:    \`${hex(IMPL_RCL_STATVAR)}\` (from phase25h-a-jump-table.json)`);
  lines.push('');
  lines.push('## Pre-Call State');
  lines.push('');
  lines.push(`- A = \`${hex(aBefore, 2)}\` (tMean)`);
  lines.push(`- F = \`${hex(fBefore, 2)}\` (carry bit = ${(fBefore & 1) !== 0})`);
  lines.push(`- statFlags @ \`${hex(STATFLAGS_ADDR)}\` = \`${hex(statFlagsByteBefore, 2)}\` (statsValid bit6 ${statsValidClear ? 'CLEAR' : 'SET'})`);
  lines.push(`- OP1 sentinel @ \`${hex(OP1_ADDR)}\` [${OP1_LEN}B]: \`${hexBytes(op1Before)}\``);
  lines.push(`- Error selector @ \`${hex(ERROR_SELECTOR_ADDR)}\`: \`${hex(errorSelBefore, 2)}\``);
  lines.push(`- VRAM sample @ \`${hex(VRAM_BASE)}\` [${VRAM_SAMPLE_LEN}B]: \`${hexBytes(vramBefore)}\``);
  lines.push('');
  lines.push('## Call');
  lines.push('');
  lines.push(`- Entry:           \`${hex(JT_RCL_STATVAR)}\``);
  lines.push(`- Fake return PC:  \`${hex(FAKE_RET)}\``);
  lines.push(`- Budget:          ${INSN_BUDGET} instructions`);
  lines.push(`- Instructions executed: ${stepsExecuted} (0 when the executor exited via the onBlock throw short-circuit; see block count below)`);
  lines.push(`- Blocks dispatched: ${blockCount}`);
  lines.push(`- Final PC:        \`${hex(finalPc)}\``);
  lines.push(`- Reached fake return: ${reachedReturn}`);
  lines.push(`- Recent PCs (last ${recentPcs.length}): ${recentPcs.map((p) => hex(p)).join(' ')}`);
  lines.push(`- DispErrorScreen (${hex(DISP_ERROR_SCREEN)}) hit: ${dispErrorHit}`);
  lines.push('');
  lines.push('## Post-Call State');
  lines.push('');
  lines.push(`- A = \`${hex(aAfter, 2)}\``);
  lines.push(`- F = \`${hex(fAfter, 2)}\` (carry bit = ${carryAfter})`);
  lines.push(`- statFlags @ \`${hex(STATFLAGS_ADDR)}\` = \`${hex(statFlagsByteAfter, 2)}\``);
  lines.push(`- OP1 @ \`${hex(OP1_ADDR)}\` [${OP1_LEN}B]: \`${hexBytes(op1After)}\``);
  lines.push(`- Error selector @ \`${hex(ERROR_SELECTOR_ADDR)}\`: \`${hex(errorSelAfter, 2)}\``);
  lines.push(`- VRAM sample @ \`${hex(VRAM_BASE)}\` [${VRAM_SAMPLE_LEN}B]: \`${hexBytes(vramAfter)}\``);
  lines.push('');
  lines.push('## Assertions');
  lines.push('');
  lines.push(`- **A1** — statsValid clear pre-call: **${fmt(a1_pass)}**`);
  lines.push(`- **A2** — Carry set OR DispErrorScreen dispatched post-call: **${fmt(a2_pass)}** (carry=${carryAfter}, dispErr=${dispErrorHit})`);
  lines.push(`- **A3** — OP1 unchanged vs 0xCC sentinel: **${fmt(a3_pass)}**`);
  lines.push(`- **A4** — Error-banner signal observed (error selector changed OR VRAM @ \`${hex(VRAM_BASE)}\` changed OR DispErrorScreen dispatched): **${fmt(a4_pass)}**`);
  lines.push('');
  lines.push('## Interpretation');
  lines.push('');
  if (!reachedReturn) {
    lines.push(`- Routine did NOT return normally within ${INSN_BUDGET} instructions.`);
    lines.push(`- Final PC: \`${hex(finalPc)}\`. This is expected if Rcl_StatVar bailed through`);
    lines.push('  the error path (the TI-OS error trap does not return to the caller; it');
    lines.push('  longjmps back to the event loop).');
  } else {
    lines.push('- Routine returned normally to the fake return address.');
    lines.push('- A ret-with-carry is the documented lightweight error signal.');
  }
  lines.push('');
  const match = a1_pass && a2_pass && a3_pass && a4_pass;
  lines.push(match
    ? '- Overall: observed behavior **matches** the ERR:STAT contract.'
    : '- Overall: observed behavior **does not fully match** the ERR:STAT contract.'
  );
  if (dispErrorHit) {
    lines.push('- DispErrorScreen dispatch is strong positive evidence the contract holds.');
  }
  if (!a3_pass) {
    lines.push('- WARNING: OP1 was mutated. Diff:');
    lines.push(`  - before: \`${hexBytes(op1Before)}\``);
    lines.push(`  - after:  \`${hexBytes(op1After)}\``);
  }

  fs.writeFileSync(REPORT_PATH, lines.join('\n') + '\n');
  console.log(`report=${REPORT_PATH}`);

  process.exitCode = (a1_pass && a2_pass && a3_pass && a4_pass) ? 0 : 1;
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error);
  fs.writeFileSync(REPORT_PATH, `# Phase 25H-b — FAILED\n\n\`\`\`\n${error.stack || error}\n\`\`\`\n`);
  process.exitCode = 1;
}
