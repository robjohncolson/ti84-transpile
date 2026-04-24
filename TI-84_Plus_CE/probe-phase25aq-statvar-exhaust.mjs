#!/usr/bin/env node

/**
 * Phase 25AQ: exhaustive Rcl_StatVar coverage for the remaining 1-var stat tokens.
 *
 * Goal:
 *   Cold boot, run MEM_INIT, set statsValid, seed a broad stat-var table range
 *   with raw 42.0 BCD bytes, then call the Rcl_StatVar impl directly at
 *   0x08019F for every remaining token from 0x29 through 0x34.
 *
 * Tokens under test:
 *   tMinY    0x29
 *   tMaxY    0x2A
 *   tSigmaY  0x2B
 *   tSigmaXY 0x2C
 *   tr       0x2D
 *   te       0x2E
 *   ta       0x2F
 *   tb       0x30
 *   tc       0x31
 *   td       0x32
 *   tSSX     0x33
 *   tSSY     0x34
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25aq-statvar-exhaust-report.md');

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

const MEMINIT_ENTRY = 0x09DEE0;
const MEMINIT_RET = 0xFFFFF6;
const MEMINIT_BUDGET = 100000;

const JT_RCL_STATVAR = 0x0204F0;
const IMPL_RCL_STATVAR = 0x08019F;
const FAKE_RET = 0x7FFFFE;
const CALL_BUDGET = 200000;
const MAX_LOOP_ITER = 4096;

const FLAGS_BASE = 0xD00080;
const STATFLAGS_ADDR = FLAGS_BASE + 0x09;
const STATS_VALID_MASK = 0x40;

const STAT_BASE = 0xD0117F;
const STAT_SLOT_LEN = 9;
const SEED_SLOT_COUNT = 64;
const SEEDED_LAST_SLOT_ADDR = STAT_BASE + ((SEED_SLOT_COUNT - 1) * STAT_SLOT_LEN);
const SEEDED_LAST_BYTE_ADDR = SEEDED_LAST_SLOT_ADDR + STAT_SLOT_LEN - 1;

const OP1_ADDR = 0xD005F8;
const OP1_LEN = 9;
const OP1_SENTINEL = 0xCC;

const EXPECTED_VALUE = 42.0;
const EXPECTED_BYTES = Uint8Array.from([0x00, 0x81, 0x42, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const TOLERANCE = 1e-6;
const CLEAR_FILL = 0xFF;

const TOKENS = [
  { name: 'tMinY', token: 0x29, description: 'minimum Y' },
  { name: 'tMaxY', token: 0x2A, description: 'maximum Y' },
  { name: 'tSigmaY', token: 0x2B, description: 'sigma Y' },
  { name: 'tSigmaXY', token: 0x2C, description: 'sigma XY' },
  { name: 'tr', token: 0x2D, description: 'correlation r' },
  { name: 'te', token: 0x2E, description: 'regression e' },
  { name: 'ta', token: 0x2F, description: 'regression a' },
  { name: 'tb', token: 0x30, description: 'regression b' },
  { name: 'tc', token: 0x31, description: 'regression c' },
  { name: 'td', token: 0x32, description: 'regression d' },
  { name: 'tSSX', token: 0x33, description: 'sum of squares X' },
  { name: 'tSSY', token: 0x34, description: 'sum of squares Y' },
];

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
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function wrapMem(mem) {
  return {
    write8(addr, val) { mem[addr] = val & 0xFF; },
    read8(addr) { return mem[addr] & 0xFF; },
  };
}

function readRealSafe(memWrap, addr) {
  try {
    const value = readReal(memWrap, addr);
    return {
      ok: Number.isFinite(value),
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

function shortError(error) {
  return String(error?.stack || error).split(/\r?\n/)[0];
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
  cpu._iy = FLAGS_BASE;
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

function prepareCallState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._ix = 0xD1A860;
  cpu._hl = 0;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(CLEAR_FILL, cpu.sp, cpu.sp + 12);
}

function runCall(executor, cpu, { entry, returnPc, budget }) {
  let finalPc = null;
  let returnHit = false;
  let termination = 'unknown';
  let stepCount = 0;
  let missingBlock = false;
  const recentPcs = [];

  const notePc = (pc, step) => {
    const norm = pc & 0xFFFFFF;
    finalPc = norm;
    if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
    recentPcs.push(norm);
    if (recentPcs.length > 12) recentPcs.shift();
    if (norm === returnPc) throw new Error('__RETURN_HIT__');
  };

  try {
    const result = executor.runFrom(entry, 'adl', {
      maxSteps: budget,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _mode, _meta, step) {
        notePc(pc, step);
      },
      onMissingBlock(pc, _mode, step) {
        missingBlock = true;
        notePc(pc, step);
      },
    });

    finalPc = result.lastPc ?? finalPc;
    termination = result.termination ?? termination;
    stepCount = Math.max(stepCount, result.steps ?? 0);
  } catch (error) {
    if (error?.message === '__RETURN_HIT__') {
      returnHit = true;
      finalPc = returnPc;
      termination = 'return_hit';
    } else {
      throw error;
    }
  }

  return {
    entry,
    returnPc,
    budget,
    returnHit,
    finalPc,
    termination,
    stepCount,
    missingBlock,
    recentPcs,
  };
}

function runMemInit(executor, cpu, mem) {
  prepareCallState(cpu, mem);
  cpu.push(MEMINIT_RET);
  return runCall(executor, cpu, {
    entry: MEMINIT_ENTRY,
    returnPc: MEMINIT_RET,
    budget: MEMINIT_BUDGET,
  });
}

function seedStatTable(mem) {
  for (let i = 0; i < SEED_SLOT_COUNT; i++) {
    mem.set(EXPECTED_BYTES, STAT_BASE + (i * STAT_SLOT_LEN));
  }
}

function runTokenCase(executor, cpu, mem, memWrap, testCase, log) {
  prepareCallState(cpu, mem);
  seedStatTable(mem);

  const statFlagsBefore = mem[STATFLAGS_ADDR] & 0xFF;
  mem[STATFLAGS_ADDR] = statFlagsBefore | STATS_VALID_MASK;
  const statFlagsArmed = mem[STATFLAGS_ADDR] & 0xFF;
  const statsValidSet = (statFlagsArmed & STATS_VALID_MASK) !== 0;

  mem.fill(OP1_SENTINEL, OP1_ADDR, OP1_ADDR + OP1_LEN);
  const op1Before = readBlock(mem, OP1_ADDR, OP1_LEN);

  cpu.a = testCase.token;
  cpu.push(FAKE_RET);
  const run = runCall(executor, cpu, {
    entry: IMPL_RCL_STATVAR,
    returnPc: FAKE_RET,
    budget: CALL_BUDGET,
  });

  const op1After = readBlock(mem, OP1_ADDR, OP1_LEN);
  const decoded = readRealSafe(memWrap, OP1_ADDR);
  const diff = decoded.ok ? Math.abs(decoded.value - EXPECTED_VALUE) : Number.POSITIVE_INFINITY;
  const rawMatch = bytesEqual(op1After, EXPECTED_BYTES);
  const valueMatch = decoded.ok && diff <= TOLERANCE;
  const pass = statsValidSet && run.returnHit && rawMatch && valueMatch;

  log(
    `[${testCase.name}] token=${hex(testCase.token, 2)} returnHit=${run.returnHit} finalPc=${hex(run.finalPc)} `
    + `op1=[${hexBytes(op1After)}] decoded=${decoded.display} result=${pass ? 'PASS' : 'FAIL'}`,
  );

  return {
    ...testCase,
    statFlagsBefore,
    statFlagsArmed,
    statsValidSet,
    op1BeforeHex: hexBytes(op1Before),
    op1AfterHex: hexBytes(op1After),
    decodedDisplay: decoded.display,
    decodedValue: decoded.value,
    decodeError: decoded.error,
    diff,
    rawMatch,
    valueMatch,
    run,
    pass,
  };
}

function writeReport(details) {
  const lines = [];
  const fmt = (ok) => (ok ? 'PASS' : 'FAIL');
  const overallPass = details.memInitRun.returnHit && details.results.every((entry) => entry.pass);

  lines.push('# Phase 25AQ - Stat-var exhaustive recall coverage');
  lines.push('');
  lines.push('Generated by `probe-phase25aq-statvar-exhaust.mjs`.');
  lines.push('');
  lines.push('## Goal');
  lines.push('');
  lines.push('Run `MEM_INIT`, seed the stat-var table with raw `42.0` bytes, and then');
  lines.push('exercise the `Rcl_StatVar` jump-table slot for the remaining 1-var stat');
  lines.push('tokens `0x29..0x34`. Each token passes only if the jump-table call returns');
  lines.push('and OP1 matches the seeded `42.0` encoding.');
  lines.push('');
  lines.push('## Setup');
  lines.push('');
  lines.push(`- MEM_INIT entry: \`${hex(MEMINIT_ENTRY)}\``);
  lines.push(`- MEM_INIT return sentinel: \`${hex(MEMINIT_RET)}\``);
  lines.push(`- Rcl_StatVar JT slot: \`${hex(JT_RCL_STATVAR)}\``);
  lines.push(`- Rcl_StatVar impl: \`${hex(IMPL_RCL_STATVAR)}\``);
  lines.push(`- statsValid byte: \`${hex(STATFLAGS_ADDR)}\` (bit mask \`${hex(STATS_VALID_MASK, 2)}\`)`);
  lines.push(`- stat-var base: \`${hex(STAT_BASE)}\``);
  lines.push(`- slot length: ${STAT_SLOT_LEN} bytes`);
  lines.push(`- seeded slots per case: ${SEED_SLOT_COUNT} (\`${hex(STAT_BASE)}\`..\`${hex(SEEDED_LAST_BYTE_ADDR)}\`)`);
  lines.push(`- expected OP1 bytes: \`${hexBytes(EXPECTED_BYTES)}\``);
  lines.push(`- expected decoded value: ${EXPECTED_VALUE}`);
  lines.push(`- tolerance: ${TOLERANCE}`);
  lines.push('');
  lines.push('## Boot / MEM_INIT');
  lines.push('');
  lines.push(`- Boot: steps=${details.bootResult.steps} term=${details.bootResult.termination} lastPc=\`${hex(details.bootResult.lastPc)}\``);
  lines.push(`- MEM_INIT returned to sentinel: **${fmt(details.memInitRun.returnHit)}**`);
  lines.push(`- MEM_INIT: steps=${details.memInitRun.stepCount} term=${details.memInitRun.termination} finalPc=\`${hex(details.memInitRun.finalPc)}\``);
  if (details.memInitRun.recentPcs.length > 0) {
    lines.push(`- MEM_INIT recent PCs: ${details.memInitRun.recentPcs.map((pc) => hex(pc)).join(' ')}`);
  }
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Token | Returned | OP1 bytes | OP1 decoded | Bytes == 42.0 | Value == 42.0 | Result |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- |');

  for (const entry of details.results) {
    if (entry.error) {
      lines.push(`| \`${entry.name} (${hex(entry.token, 2)})\` | ERROR | ERROR | \`${shortError(entry.error)}\` | ERROR | ERROR | FAIL |`);
      continue;
    }

    lines.push(
      `| \`${entry.name} (${hex(entry.token, 2)})\` | ${fmt(entry.run.returnHit)} | `
      + `\`${entry.op1AfterHex}\` | ${entry.decodedDisplay} | ${fmt(entry.rawMatch)} | `
      + `${fmt(entry.valueMatch)} | ${fmt(entry.pass)} |`,
    );
  }

  for (const entry of details.results) {
    lines.push('');
    lines.push(`## ${entry.name} (${hex(entry.token, 2)})`);
    lines.push('');
    lines.push(`- Meaning: ${entry.description}`);

    if (entry.error) {
      lines.push(`- Error: \`${shortError(entry.error)}\``);
      lines.push(`- Overall: **FAIL**`);
      continue;
    }

    lines.push(`- statsValid: \`${hex(entry.statFlagsBefore, 2)}\` -> \`${hex(entry.statFlagsArmed, 2)}\``);
    lines.push(`- OP1 pre-call: \`${entry.op1BeforeHex}\``);
    lines.push(`- OP1 post-call: \`${entry.op1AfterHex}\``);
    lines.push(`- Decoded OP1: ${entry.decodedDisplay}`);
    lines.push(`- Absolute diff vs ${EXPECTED_VALUE}: ${entry.diff}`);
    lines.push(`- Returned to fake return: **${fmt(entry.run.returnHit)}**`);
    lines.push(`- Final PC: \`${hex(entry.run.finalPc)}\``);
    lines.push(`- Missing block on exit: ${entry.run.missingBlock}`);
    if (entry.run.recentPcs.length > 0) {
      lines.push(`- Recent PCs: ${entry.run.recentPcs.map((pc) => hex(pc)).join(' ')}`);
    }
    lines.push(`- Bytes match seeded 42.0: **${fmt(entry.rawMatch)}**`);
    lines.push(`- Value matches 42.0 within tolerance: **${fmt(entry.valueMatch)}**`);
    lines.push(`- Overall: **${fmt(entry.pass)}**`);
  }

  lines.push('');
  lines.push('## Overall');
  lines.push('');
  lines.push(`- Suite result: **${fmt(overallPass)}**`);
  lines.push('');
  lines.push('## Console Output');
  lines.push('');
  lines.push('```text');
  lines.push(...details.transcript);
  lines.push('```');

  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

function writeFailureReport(errorText, transcript = []) {
  const lines = [
    '# Phase 25AQ - Stat-var exhaustive recall coverage FAILED',
    '',
    '## Console Output',
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

  log('=== Phase 25AQ: Stat-var exhaustive recall coverage ===');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  const memWrap = wrapMem(mem);

  const bootResult = coldBoot(executor, cpu, mem);
  log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);

  const memInitRun = runMemInit(executor, cpu, mem);
  log(`MEM_INIT: returnHit=${memInitRun.returnHit} steps=${memInitRun.stepCount} term=${memInitRun.termination} finalPc=${hex(memInitRun.finalPc)}`);

  const results = [];
  if (memInitRun.returnHit) {
    for (const testCase of TOKENS) {
      try {
        results.push(runTokenCase(executor, cpu, mem, memWrap, testCase, log));
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
  } else {
    for (const testCase of TOKENS) {
      results.push({
        ...testCase,
        pass: false,
        error: `MEM_INIT did not return to ${hex(MEMINIT_RET)}`,
      });
    }
  }

  writeReport({ bootResult, memInitRun, results, transcript });

  const overallPass = memInitRun.returnHit && results.every((entry) => entry.pass);
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
