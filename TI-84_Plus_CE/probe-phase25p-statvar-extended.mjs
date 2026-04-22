#!/usr/bin/env node

/**
 * Phase 25P: Stat-var expansion probe with additional tokens and edge cases.
 *
 * Goal:
 *   Extend the Phase 25O Sto/Rcl round-trip probe to cover:
 *   - tMaxX (0x09)  => 999.0
 *   - tCorr (0x12)  => 0.95
 *   - tQ1   (0x14)  => 0.0
 *   - tQ3   (0x15)  => -100.5
 *
 * Static address derivation from ti84pceg.inc + phase25m/phase25o findings:
 *   statVarsOffset := 0xD0117F
 *   slot size      := 9 bytes
 *   slot address   := statVarsOffset + (9 * A)
 *   statsValid     := bit 6 of (IY + 0x09) => 0xD00089
 *   Sto_StatVar    := 0x09A3BD
 *   Rcl_StatVar    := 0x08019F
 *   CmpStatPtr     := 0x09A3A5
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { writeReal, readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25p-statvar-extended-report.md');

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
const FAKE_RET = 0x7FFFFE;
const INSN_BUDGET = 200000;
const FP_REAL_LEN = 9;

const TOLERANCE = 1e-6;
const CLEAR_FILL = 0xFF;

const TEST_CASES = [
  {
    name: 'tMaxX',
    description: 'max X',
    token: 0x09,
    value: 999.0,
    displayValue: '999.0',
    edgeCase: 'large value',
  },
  {
    name: 'tCorr',
    description: 'correlation coefficient',
    token: 0x12,
    value: 0.95,
    displayValue: '0.95',
    edgeCase: 'fractional value',
  },
  {
    name: 'tQ1',
    description: 'first quartile',
    token: 0x14,
    value: 0.0,
    displayValue: '0.0',
    edgeCase: 'zero value',
  },
  {
    name: 'tQ3',
    description: 'third quartile',
    token: 0x15,
    value: -100.5,
    displayValue: '-100.5',
    edgeCase: 'negative fractional value',
  },
];

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

function shortError(error) {
  return String(error?.stack || error).split(/\r?\n/)[0];
}

function readRealSafe(memWrap, addr) {
  try {
    const value = readReal(memWrap, addr);
    return {
      ok: true,
      value,
      display: String(value),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      value: Number.NaN,
      display: `ERROR: ${shortError(error)}`,
      error: String(error?.stack || error),
    };
  }
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

function createHarness() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  const memWrap = wrapMem(mem);

  return { mem, executor, cpu, memWrap };
}

function runCase(testCase, log) {
  const { mem, executor, cpu, memWrap } = createHarness();
  const slotAddr = STAT_VARS_OFFSET_ADDR + (testCase.token * FP_REAL_LEN);
  const slotOffsetFromStatVars = slotAddr - STAT_VARS_ADDR;

  const bootResult = coldBoot(executor, cpu, mem);
  log(`[${testCase.name}] boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);

  postInitState(cpu, mem);

  const slotOriginal = readBlock(mem, slotAddr, FP_REAL_LEN);
  mem.fill(CLEAR_FILL, slotAddr, slotAddr + FP_REAL_LEN);
  const slotPreSto = readBlock(mem, slotAddr, FP_REAL_LEN);

  writeReal(memWrap, OP1_ADDR, testCase.value);
  const op1Seed = readBlock(mem, OP1_ADDR, FP_REAL_LEN);

  const statFlagsBeforeSto = mem[STATFLAGS_ADDR] & 0xFF;
  mem[STATFLAGS_ADDR] = statFlagsBeforeSto | STATS_VALID_MASK;
  const statFlagsArmedSto = mem[STATFLAGS_ADDR] & 0xFF;

  cpu.a = testCase.token;
  cpu.push(FAKE_RET);
  const stoRun = runPrimitive(executor, cpu, IMPL_STO_STATVAR);

  const slotPostSto = readBlock(mem, slotAddr, FP_REAL_LEN);
  const slotDecoded = readRealSafe(memWrap, slotAddr);

  postInitState(cpu, mem);

  const statFlagsBeforeRcl = mem[STATFLAGS_ADDR] & 0xFF;
  mem[STATFLAGS_ADDR] = statFlagsBeforeRcl | STATS_VALID_MASK;
  const statFlagsArmedRcl = mem[STATFLAGS_ADDR] & 0xFF;

  mem.fill(CLEAR_FILL, OP1_ADDR, OP1_ADDR + FP_REAL_LEN);
  const op1PreRcl = readBlock(mem, OP1_ADDR, FP_REAL_LEN);

  cpu.a = testCase.token;
  cpu.push(FAKE_RET);
  const rclRun = runPrimitive(executor, cpu, IMPL_RCL_STATVAR);

  const op1PostRcl = readBlock(mem, OP1_ADDR, FP_REAL_LEN);
  const roundTrip = readRealSafe(memWrap, OP1_ADDR);
  const roundTripDiff = roundTrip.ok ? Math.abs(roundTrip.value - testCase.value) : Number.POSITIVE_INFINITY;

  const slotMatchesExpected = bytesEqual(slotPostSto, op1Seed);
  const roundTripMatches = roundTrip.ok && roundTripDiff <= TOLERANCE;
  const pass = stoRun.returnHit && rclRun.returnHit && slotMatchesExpected && roundTripMatches;

  log(`[${testCase.name}] slot pre-STO @ ${hex(slotAddr)} [${hexBytes(slotPreSto)}]`);
  log(`[${testCase.name}] OP1 seeded @ ${hex(OP1_ADDR)} [${hexBytes(op1Seed)}] value=${testCase.displayValue}`);
  log(`[${testCase.name}] Sto_StatVar returnHit=${stoRun.returnHit} finalPc=${hex(stoRun.finalPc)}`);
  log(`[${testCase.name}] slot post-STO @ ${hex(slotAddr)} [${hexBytes(slotPostSto)}] decoded=${slotDecoded.display}`);
  log(`[${testCase.name}] OP1 pre-RCL @ ${hex(OP1_ADDR)} [${hexBytes(op1PreRcl)}]`);
  log(`[${testCase.name}] Rcl_StatVar returnHit=${rclRun.returnHit} finalPc=${hex(rclRun.finalPc)}`);
  log(`[${testCase.name}] OP1 post-RCL @ ${hex(OP1_ADDR)} [${hexBytes(op1PostRcl)}] decoded=${roundTrip.display}`);
  log(`[${testCase.name}] round-trip diff=${roundTripDiff}`);
  log(`[${testCase.name}] ${pass ? 'PASS' : 'FAIL'}`);

  return {
    ...testCase,
    bootResult,
    slotAddr,
    slotOffsetFromStatVars,
    slotOriginalHex: hexBytes(slotOriginal),
    slotPreStoHex: hexBytes(slotPreSto),
    slotPostStoHex: hexBytes(slotPostSto),
    expectedSlotHex: hexBytes(op1Seed),
    slotDecodedDisplay: slotDecoded.display,
    slotDecodeError: slotDecoded.error,
    statFlagsBeforeSto,
    statFlagsArmedSto,
    statFlagsBeforeRcl,
    statFlagsArmedRcl,
    op1SeedHex: hexBytes(op1Seed),
    op1PreRclHex: hexBytes(op1PreRcl),
    op1PostRclHex: hexBytes(op1PostRcl),
    stoRun,
    rclRun,
    roundTripValueDisplay: roundTrip.display,
    roundTripValue: roundTrip.value,
    roundTripError: roundTrip.error,
    roundTripDiff,
    slotMatchesExpected,
    roundTripMatches,
    pass,
  };
}

function writeReport(details) {
  const lines = [];
  const fmt = (ok) => (ok ? 'PASS' : 'FAIL');
  const tableStatus = (value) => (value ? 'PASS' : 'FAIL');
  const overallPass = details.results.every((entry) => entry.pass);

  lines.push('# Phase 25P - Stat-var extended coverage');
  lines.push('');
  lines.push('Generated by `probe-phase25p-statvar-extended.mjs`.');
  lines.push('');
  lines.push('## Goal');
  lines.push('');
  lines.push('Cold-boot the ROM for each target token, seed OP1 with a distinct real,');
  lines.push('set `statsValid`, call `Sto_StatVar`, verify the derived stat-var slot');
  lines.push('matches the expected 9-byte encoding, then clear OP1 and call');
  lines.push('`Rcl_StatVar` to confirm the value round-trips within `1e-6`.');
  lines.push('This phase adds large, fractional, zero, and negative-fractional cases.');
  lines.push('');
  lines.push('## Setup');
  lines.push('');
  lines.push(`- \`Sto_StatVar\` impl: \`${hex(IMPL_STO_STATVAR)}\``);
  lines.push(`- \`Rcl_StatVar\` impl: \`${hex(IMPL_RCL_STATVAR)}\``);
  lines.push(`- \`CmpStatPtr\` helper: \`${hex(CMP_STAT_PTR)}\``);
  lines.push(`- \`statVarsOffset = ${hex(STAT_VARS_OFFSET_ADDR)}\``);
  lines.push(`- \`statVars = ${hex(STAT_VARS_ADDR)}\``);
  lines.push(`- \`statsValid\` byte: \`${hex(STATFLAGS_ADDR)}\``);
  lines.push(`- Fake return: \`${hex(FAKE_RET)}\``);
  lines.push(`- Instruction budget: ${INSN_BUDGET}`);
  lines.push(`- Tolerance: ${TOLERANCE}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Token | Value | Sto returned | Slot bytes match | Rcl returned | Rcl round-trip matches | Overall |');
  lines.push('| --- | ---: | --- | --- | --- | --- | --- |');

  for (const entry of details.results) {
    if (entry.error) {
      lines.push(`| \`${entry.name} (${hex(entry.token, 2)})\` | \`${entry.displayValue}\` | ERROR | ERROR | ERROR | ERROR | FAIL |`);
    } else {
      lines.push(`| \`${entry.name} (${hex(entry.token, 2)})\` | \`${entry.displayValue}\` | ${tableStatus(entry.stoRun.returnHit)} | ${tableStatus(entry.slotMatchesExpected)} | ${tableStatus(entry.rclRun.returnHit)} | ${tableStatus(entry.roundTripMatches)} | ${tableStatus(entry.pass)} |`);
    }
  }

  lines.push('');
  lines.push(`- Overall suite result: **${fmt(overallPass)}**`);

  for (const entry of details.results) {
    lines.push('');
    lines.push(`## ${entry.name} (${hex(entry.token, 2)})`);
    lines.push('');
    lines.push(`- Meaning: ${entry.description}`);
    lines.push(`- Test value: ${entry.displayValue}`);
    lines.push(`- Edge case class: ${entry.edgeCase}`);

    if (entry.error) {
      lines.push(`- Error: \`${shortError(entry.error)}\``);
      lines.push(`- Overall: **FAIL**`);
      continue;
    }

    lines.push(`- Derived slot: \`${hex(entry.slotAddr)}\` (\`${hex(entry.slotOffsetFromStatVars)}\` bytes past \`statVars\`)`);
    lines.push(`- Boot: steps=${entry.bootResult.steps} term=${entry.bootResult.termination} lastPc=\`${hex(entry.bootResult.lastPc)}\``);
    lines.push(`- statsValid before STO: \`${hex(entry.statFlagsBeforeSto, 2)}\` -> \`${hex(entry.statFlagsArmedSto, 2)}\``);
    lines.push(`- statsValid before RCL: \`${hex(entry.statFlagsBeforeRcl, 2)}\` -> \`${hex(entry.statFlagsArmedRcl, 2)}\``);
    lines.push(`- Slot original bytes: \`${entry.slotOriginalHex}\``);
    lines.push(`- Slot after explicit 0xFF clear: \`${entry.slotPreStoHex}\``);
    lines.push(`- Expected encoded bytes: \`${entry.expectedSlotHex}\``);
    lines.push(`- Slot after STO: \`${entry.slotPostStoHex}\``);
    lines.push(`- Slot decoded value: ${entry.slotDecodedDisplay}`);
    lines.push(`- Sto returned to fake return: **${fmt(entry.stoRun.returnHit)}**`);
    lines.push(`- Sto final PC: \`${hex(entry.stoRun.finalPc)}\``);
    if (entry.stoRun.recentPcs.length > 0) {
      lines.push(`- Sto recent PCs: ${entry.stoRun.recentPcs.map((pc) => hex(pc)).join(' ')}`);
    }
    lines.push(`- OP1 pre-RCL clear: \`${entry.op1PreRclHex}\``);
    lines.push(`- OP1 post-RCL: \`${entry.op1PostRclHex}\``);
    lines.push(`- Rcl returned to fake return: **${fmt(entry.rclRun.returnHit)}**`);
    lines.push(`- Rcl final PC: \`${hex(entry.rclRun.finalPc)}\``);
    if (entry.rclRun.recentPcs.length > 0) {
      lines.push(`- Rcl recent PCs: ${entry.rclRun.recentPcs.map((pc) => hex(pc)).join(' ')}`);
    }
    lines.push(`- Round-trip value: ${entry.roundTripValueDisplay}`);
    lines.push(`- Absolute diff vs ${entry.displayValue}: ${entry.roundTripDiff}`);
    lines.push(`- Slot bytes match expected encoding: **${fmt(entry.slotMatchesExpected)}**`);
    lines.push(`- Rcl round-trip matches within 1e-6: **${fmt(entry.roundTripMatches)}**`);
    if (!entry.pass) {
      lines.push(`- Failure bytes snapshot: slot=\`${entry.slotPostStoHex}\` expected=\`${entry.expectedSlotHex}\` OP1=\`${entry.op1PostRclHex}\``);
    }
    lines.push(`- Overall: **${fmt(entry.pass)}**`);
  }

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
    '# Phase 25P - Stat-var extended coverage FAILED',
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
  const results = [];

  log('=== Phase 25P: Stat-var extended coverage probe ===');

  for (const testCase of TEST_CASES) {
    try {
      results.push(runCase(testCase, log));
    } catch (error) {
      const errorText = String(error?.stack || error);
      log(`[${testCase.name}] ERROR ${shortError(errorText)}`);
      results.push({
        ...testCase,
        pass: false,
        error: errorText,
      });
    }
  }

  writeReport({ results, transcript });

  const overallPass = results.every((entry) => entry.pass);
  log(overallPass ? 'PASS' : 'FAIL');
  log(`report=${REPORT_PATH}`);
  process.exitCode = overallPass ? 0 : 1;
}

try {
  await main();
} catch (error) {
  const message = error.stack || error;
  console.error(message);
  writeFailureReport(message, String(message).split(/\r?\n/));
  process.exitCode = 1;
}
