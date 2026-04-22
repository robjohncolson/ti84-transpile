#!/usr/bin/env node

/**
 * Phase 25M: Sto_StatVar store + round-trip probe.
 *
 * Goal:
 *   Clear the tMean stat-var slot, seed OP1 with 42.0, set statsValid,
 *   call Sto_StatVar, verify the tMean slot now contains the encoded real,
 *   then clear OP1 and call Rcl_StatVar to confirm the value round-trips.
 *
 * Static address derivation from ti84pceg.inc + phase25h-a-jump-table.json:
 *   statVarsOffset := 0xD0117F
 *   statVars       := 0xD01191
 *   tMean          := 0x21
 *   statFlags      := IY + 0x09
 *   statsValid     := bit 6
 *   CmpStatPtr     := 0x09A3A5
 *
 * Therefore for A=tMean=0x21:
 *   target slot = 0xD0117F + (9 * 0x21) = 0xD012A8
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { writeReal, readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25m-sto-statvar-report.md');

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITER = 32;
const STACK_RESET_TOP = 0xD1A87E;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

const IMPL_STO_STATVAR = 0x09A3BD;
const IMPL_RCL_STATVAR = 0x08019F;
const CMP_STAT_PTR = 0x09A3A5;

const FLAGS_BASE = 0xD00080;
const STATFLAGS_ADDR = FLAGS_BASE + 0x09;
const STATS_VALID_MASK = 0x40;

const STAT_VARS_OFFSET_ADDR = 0xD0117F;
const STAT_VARS_ADDR = 0xD01191;
const OP1_ADDR = 0xD005F8;
const OP2_ADDR = 0xD00603;
const TEMP_OP2_TO_OP6_ADDR = 0xD02B39;
const TEMP_OP2_TO_OP6_LEN = 55;
const FP_REAL_LEN = 9;

const TMEAN_TOKEN = 0x21;
const TMEAN_SLOT_ADDR = STAT_VARS_OFFSET_ADDR + (TMEAN_TOKEN * FP_REAL_LEN);
const TMEAN_SLOT_FROM_STATVARS = TMEAN_SLOT_ADDR - STAT_VARS_ADDR;

const FAKE_RET = 0x7FFFFE;
const INSN_BUDGET = 200000;

const SEED_VALUE = 42.0;
const TOLERANCE = 1e-9;
const CLEAR_FILL = 0xFF;

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function wrapMem(mem) {
  return {
    write8(addr, val) { mem[addr] = val & 0xFF; },
    read8(addr) { return mem[addr] & 0xFF; },
  };
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
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function pushTranscript(transcript, text) {
  for (const line of String(text).split(/\r?\n/)) transcript.push(line);
}

function makeLogger(transcript) {
  return (...args) => {
    const line = args.join(' ');
    pushTranscript(transcript, line);
    console.log(line);
  };
}

function coldBoot(executor, cpu, mem) {
  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITER,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(CLEAR_FILL, cpu.sp, cpu.sp + 3);

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
  mem.fill(CLEAR_FILL, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return result;
}

function postInitState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(CLEAR_FILL, cpu.sp, cpu.sp + 12);
}

function runPrimitive(executor, cpu, entry) {
  let finalPc = null;
  let blockCount = 0;
  let returnHit = false;
  let steps = null;
  let termination = null;
  const recentPcs = [];

  try {
    const result = executor.runFrom(entry, 'adl', {
      maxSteps: INSN_BUDGET,
      maxLoopIterations: 4096,
      onBlock(pc) {
        const norm = pc & 0xFFFFFF;
        cpu.pc = norm;
        finalPc = norm;
        blockCount++;
        recentPcs.push(norm);
        if (recentPcs.length > 10) recentPcs.shift();
        if (norm === FAKE_RET) throw new Error('__RETURN_HIT__');
      },
      onMissingBlock(pc) {
        const norm = pc & 0xFFFFFF;
        cpu.pc = norm;
        finalPc = norm;
        if (norm === FAKE_RET) throw new Error('__RETURN_HIT__');
      },
    });
    steps = result.steps;
    termination = result.termination;
    finalPc = result.lastPc ?? finalPc;
  } catch (err) {
    if (err?.message === '__RETURN_HIT__') {
      returnHit = true;
      finalPc = FAKE_RET;
    } else {
      throw err;
    }
  }

  return {
    entry,
    finalPc,
    blockCount,
    returnHit,
    steps,
    termination,
    recentPcs,
  };
}

function writeReport(details) {
  const lines = [];
  const fmt = (ok) => (ok ? 'PASS' : 'FAIL');

  lines.push('# Phase 25M - Sto_StatVar store + round-trip probe');
  lines.push('');
  lines.push('Generated by `probe-phase25m-sto-statvar.mjs`.');
  lines.push('');
  lines.push('## Goal');
  lines.push('');
  lines.push('Call `Sto_StatVar` with `OP1=42.0` and `A=tMean (0x21)`, verify the');
  lines.push('derived tMean stat-var slot changes from `0xFF` fill to the encoded');
  lines.push('real bytes, then call `Rcl_StatVar` to confirm OP1 round-trips back');
  lines.push('to `42.0` within `1e-9`.');
  lines.push('');
  lines.push('## Setup');
  lines.push('');
  lines.push(`- \`Sto_StatVar\` impl: \`${hex(IMPL_STO_STATVAR)}\``);
  lines.push(`- \`Rcl_StatVar\` impl: \`${hex(IMPL_RCL_STATVAR)}\``);
  lines.push(`- \`CmpStatPtr\` helper: \`${hex(CMP_STAT_PTR)}\``);
  lines.push(`- \`statVarsOffset = ${hex(STAT_VARS_OFFSET_ADDR)}\``);
  lines.push(`- \`statVars = ${hex(STAT_VARS_ADDR)}\``);
  lines.push(`- Derived tMean slot: \`${hex(TMEAN_SLOT_ADDR)}\` (\`${hex(TMEAN_SLOT_FROM_STATVARS)}\` bytes past \`statVars\`)`);
  lines.push(`- \`statsValid\` byte: \`${hex(details.statFlagsBefore, 2)}\` -> \`${hex(details.statFlagsArmed, 2)}\``);
  lines.push(`- OP1 seeded with ${SEED_VALUE}: \`${details.op1SeedHex}\``);
  lines.push(`- OP2 pre-STO: \`${details.op2BeforeHex}\``);
  lines.push(`- TempOP2ToOP6 pre-STO (first 16 bytes of 55): \`${details.scratchBeforePreviewHex}\``);
  lines.push('');
  lines.push('## Stat-var slot bytes pre-STO');
  lines.push('');
  lines.push(`- Original bytes: \`${details.slotOriginalHex}\``);
  lines.push(`- After explicit 0xFF clear: \`${details.slotPreStoHex}\``);
  lines.push('');
  lines.push('## Post-STO bytes');
  lines.push('');
  lines.push(`- Slot bytes after STO: \`${details.slotPostStoHex}\``);
  lines.push(`- Expected encoded 42.0 bytes: \`${details.expectedSlotHex}\``);
  lines.push(`- Slot decoded value: ${details.slotDecoded}`);
  lines.push(`- Sto returnHit: ${details.stoRun.returnHit}`);
  lines.push(`- Sto final PC: \`${hex(details.stoRun.finalPc)}\``);
  if (details.stoRun.recentPcs.length > 0) {
    lines.push(`- Sto recent PCs: ${details.stoRun.recentPcs.map((pc) => hex(pc)).join(' ')}`);
  }
  lines.push(`- OP2 post-STO: \`${details.op2AfterStoHex}\``);
  lines.push(`- TempOP2ToOP6 post-STO (first 16 bytes of 55): \`${details.scratchAfterPreviewHex}\``);
  lines.push('');
  lines.push('## Round-trip OP1 bytes');
  lines.push('');
  lines.push(`- OP1 pre-RCL clear: \`${details.op1PreRclHex}\``);
  lines.push(`- OP1 post-RCL: \`${details.op1PostRclHex}\``);
  lines.push(`- OP1 decoded value: ${details.roundTripValue}`);
  lines.push(`- Absolute diff vs ${SEED_VALUE}: ${details.roundTripDiff}`);
  lines.push(`- Rcl returnHit: ${details.rclRun.returnHit}`);
  lines.push(`- Rcl final PC: \`${hex(details.rclRun.finalPc)}\``);
  if (details.rclRun.recentPcs.length > 0) {
    lines.push(`- Rcl recent PCs: ${details.rclRun.recentPcs.map((pc) => hex(pc)).join(' ')}`);
  }
  lines.push('');
  lines.push('## Result PASS/FAIL');
  lines.push('');
  lines.push(`- PASS condition #1 (slot now encodes 42.0): **${fmt(details.slotMatchesExpected)}**`);
  lines.push(`- PASS condition #2 (round-trip OP1 == 42.0 within 1e-9): **${fmt(details.roundTripMatches)}**`);
  lines.push(`- Supplemental: Sto returned to fake return: **${fmt(details.stoRun.returnHit)}**`);
  lines.push(`- Supplemental: Rcl returned to fake return: **${fmt(details.rclRun.returnHit)}**`);
  lines.push(`- Overall: **${fmt(details.pass)}**`);
  lines.push('');
  lines.push('## Surprises');
  lines.push('');
  if (details.slotMatchesExpected) {
    lines.push('- No additional guard beyond `statsValid` was needed for this direct primitive call: the store landed with only the Phase 25J-style setup.');
  } else {
    lines.push('- `Sto_StatVar` did not land the expected bytes under statsValid-only setup, so either the primitive needs more state or the calling convention still has a mismatch.');
  }
  lines.push(`- OP2 touched by STO: ${details.op2Touched ? `yes (\`${details.op2BeforeHex}\` -> \`${details.op2AfterStoHex}\`)` : 'no'}`);
  lines.push(`- TempOP2ToOP6 scratch touched by STO: ${details.scratchTouched ? `yes (\`${details.scratchBeforePreviewHex}\` -> \`${details.scratchAfterPreviewHex}\` preview)` : 'no'}`);
  lines.push('');
  lines.push('## Console Output');
  lines.push('');
  lines.push('```text');
  lines.push(...details.transcript);
  lines.push('```');

  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

function writeFailureReport(errorText, transcript) {
  const lines = [
    '# Phase 25M - Sto_StatVar FAILED',
    '',
    '```text',
    ...transcript,
    '```',
    '',
    '## Error',
    '',
    '```text',
    ...String(errorText).split(/\r?\n/),
    '```',
  ];
  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

async function main() {
  const transcript = [];
  const log = makeLogger(transcript);

  log('=== Phase 25M: Sto_StatVar store + round-trip probe ===');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  const memWrap = wrapMem(mem);

  const bootResult = coldBoot(executor, cpu, mem);
  log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);

  postInitState(cpu, mem);

  const slotOriginal = readBlock(mem, TMEAN_SLOT_ADDR, FP_REAL_LEN);
  mem.fill(CLEAR_FILL, TMEAN_SLOT_ADDR, TMEAN_SLOT_ADDR + FP_REAL_LEN);
  const slotPreSto = readBlock(mem, TMEAN_SLOT_ADDR, FP_REAL_LEN);

  writeReal(memWrap, OP1_ADDR, SEED_VALUE);
  const op1Seed = readBlock(mem, OP1_ADDR, FP_REAL_LEN);

  const statFlagsBefore = mem[STATFLAGS_ADDR] & 0xFF;
  mem[STATFLAGS_ADDR] = statFlagsBefore | STATS_VALID_MASK;
  const statFlagsArmed = mem[STATFLAGS_ADDR] & 0xFF;

  const op2BeforeSto = readBlock(mem, OP2_ADDR, FP_REAL_LEN);
  const scratchBeforeSto = readBlock(mem, TEMP_OP2_TO_OP6_ADDR, TEMP_OP2_TO_OP6_LEN);

  cpu.a = TMEAN_TOKEN;
  cpu.push(FAKE_RET);
  const stoRun = runPrimitive(executor, cpu, IMPL_STO_STATVAR);

  const slotPostSto = readBlock(mem, TMEAN_SLOT_ADDR, FP_REAL_LEN);
  const op2AfterSto = readBlock(mem, OP2_ADDR, FP_REAL_LEN);
  const scratchAfterSto = readBlock(mem, TEMP_OP2_TO_OP6_ADDR, TEMP_OP2_TO_OP6_LEN);
  const slotDecoded = readReal(memWrap, TMEAN_SLOT_ADDR);

  postInitState(cpu, mem);
  mem[STATFLAGS_ADDR] = (mem[STATFLAGS_ADDR] | STATS_VALID_MASK) & 0xFF;
  mem.fill(CLEAR_FILL, OP1_ADDR, OP1_ADDR + FP_REAL_LEN);
  const op1PreRcl = readBlock(mem, OP1_ADDR, FP_REAL_LEN);

  cpu.a = TMEAN_TOKEN;
  cpu.push(FAKE_RET);
  const rclRun = runPrimitive(executor, cpu, IMPL_RCL_STATVAR);

  const op1PostRcl = readBlock(mem, OP1_ADDR, FP_REAL_LEN);
  const roundTripValue = readReal(memWrap, OP1_ADDR);
  const roundTripDiff = Math.abs(roundTripValue - SEED_VALUE);

  const slotMatchesExpected = bytesEqual(slotPostSto, op1Seed);
  const roundTripMatches = roundTripDiff <= TOLERANCE;
  const pass = slotMatchesExpected && roundTripMatches;

  log(`slot pre-STO @ ${hex(TMEAN_SLOT_ADDR)} [${hexBytes(slotPreSto)}]`);
  log(`OP1 seeded @ ${hex(OP1_ADDR)} [${hexBytes(op1Seed)}]`);
  log(`Sto_StatVar returnHit=${stoRun.returnHit} finalPc=${hex(stoRun.finalPc)}`);
  log(`slot post-STO @ ${hex(TMEAN_SLOT_ADDR)} [${hexBytes(slotPostSto)}] decoded=${slotDecoded}`);
  log(`OP1 pre-RCL @ ${hex(OP1_ADDR)} [${hexBytes(op1PreRcl)}]`);
  log(`Rcl_StatVar returnHit=${rclRun.returnHit} finalPc=${hex(rclRun.finalPc)}`);
  log(`OP1 post-RCL @ ${hex(OP1_ADDR)} [${hexBytes(op1PostRcl)}] decoded=${roundTripValue}`);
  log(`round-trip diff=${roundTripDiff}`);
  log(pass ? 'PASS' : 'FAIL');

  writeReport({
    transcript,
    statFlagsBefore,
    statFlagsArmed,
    slotOriginalHex: hexBytes(slotOriginal),
    slotPreStoHex: hexBytes(slotPreSto),
    slotPostStoHex: hexBytes(slotPostSto),
    expectedSlotHex: hexBytes(op1Seed),
    slotDecoded,
    op1SeedHex: hexBytes(op1Seed),
    op1PreRclHex: hexBytes(op1PreRcl),
    op1PostRclHex: hexBytes(op1PostRcl),
    op2BeforeHex: hexBytes(op2BeforeSto),
    op2AfterStoHex: hexBytes(op2AfterSto),
    op2Touched: !bytesEqual(op2BeforeSto, op2AfterSto),
    scratchBeforePreviewHex: hexBytes(scratchBeforeSto.slice(0, 16)),
    scratchAfterPreviewHex: hexBytes(scratchAfterSto.slice(0, 16)),
    scratchTouched: !bytesEqual(scratchBeforeSto, scratchAfterSto),
    stoRun,
    rclRun,
    roundTripValue,
    roundTripDiff,
    slotMatchesExpected,
    roundTripMatches,
    pass,
  });

  log(`report=${REPORT_PATH}`);
  process.exitCode = pass ? 0 : 1;
}

try {
  await main();
} catch (error) {
  const message = error.stack || error;
  console.error(message);
  writeFailureReport(message, String(message).split(/\r?\n/));
  process.exitCode = 1;
}
