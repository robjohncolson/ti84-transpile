#!/usr/bin/env node

/**
 * Phase 25L: CpOP1OP2 probe.
 *
 * Entry point: 0x07F831 (CpOP1OP2, compare OP1 vs OP2 and set flags)
 *
 * Cases:
 *   a) OP1=3.0, OP2=5.0
 *   b) OP1=5.0, OP2=5.0
 *   c) OP1=7.0, OP2=2.0
 *
 * Addresses (ti84pceg.inc):
 *   OP1 = 0xD005F8
 *   OP2 = 0xD00603
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { writeReal, readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25l-cpop1op2-report.md');

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

// ---- constants -------------------------------------------------------------

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITER = 32;
const STACK_RESET_TOP = 0xD1A87E;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

const CPOP1OP2_ENTRY = 0x07F831;
const OP1_ADDR = 0xD005F8;
const OP2_ADDR = 0xD00603;

const FAKE_RET = 0x7FFFFE;
const INSN_BUDGET = 200000;

const FLAG_C = 0x01;
const FLAG_Z = 0x40;

const CASES = [
  { name: 'lt', label: 'OP1=3, OP2=5', op1: 3.0, op2: 5.0 },
  { name: 'eq', label: 'OP1=5, OP2=5', op1: 5.0, op2: 5.0 },
  { name: 'gt', label: 'OP1=7, OP2=2', op1: 7.0, op2: 2.0 },
];

// ---- helpers ---------------------------------------------------------------

function hex(v, w = 6) { return `0x${(v >>> 0).toString(16).padStart(w, '0')}`; }

function hexBytes(mem, addr, len) {
  const parts = [];
  for (let i = 0; i < len; i++) parts.push((mem[addr + i] & 0xFF).toString(16).padStart(2, '0'));
  return parts.join(' ');
}

function wrapMem(mem) {
  return {
    write8(addr, val) { mem[addr] = val & 0xFF; },
    read8(addr) { return mem[addr] & 0xFF; },
  };
}

function decodeFlags(flagByte) {
  return {
    carry: (flagByte & FLAG_C) !== 0,
    zero: (flagByte & FLAG_Z) !== 0,
  };
}

// ---- OS init (identical to probe-phase25i-fpadd.mjs) -----------------------

function coldBoot(executor, cpu, mem) {
  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITER,
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
  cpu.madl = 1;              // force 24-bit ADL so cpu.push writes 3 bytes
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function createCaseEnvironment() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const bootResult = coldBoot(executor, cpu, mem);
  postInitState(cpu, mem);

  return { mem, executor, cpu, bootResult };
}

async function runCase(testCase) {
  const { mem, executor, cpu, bootResult } = createCaseEnvironment();
  const memWrap = wrapMem(mem);

  writeReal(memWrap, OP1_ADDR, testCase.op1);
  writeReal(memWrap, OP2_ADDR, testCase.op2);

  const seededOp1 = readReal(memWrap, OP1_ADDR);
  const seededOp2 = readReal(memWrap, OP2_ADDR);
  const op1PreBytes = hexBytes(mem, OP1_ADDR, 9);
  const op2PreBytes = hexBytes(mem, OP2_ADDR, 9);

  console.log(`-- ${testCase.name}: ${testCase.label} --`);
  console.log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);
  console.log(`OP1 pre-call [${op1PreBytes}]  (${seededOp1})`);
  console.log(`OP2 pre-call [${op2PreBytes}]  (${seededOp2})`);

  cpu.push(FAKE_RET);

  let finalPc = null;
  let blockCount = 0;
  let returnHit = false;
  let flagByte = null;

  try {
    const result = executor.runFrom(CPOP1OP2_ENTRY, 'adl', {
      maxSteps: INSN_BUDGET,
      maxLoopIterations: 4096,
      onBlock(pc) {
        const norm = pc & 0xFFFFFF;
        cpu.pc = norm;
        finalPc = norm;
        blockCount++;
        if (norm === FAKE_RET) {
          flagByte = cpu.f & 0xFF;
          throw new Error('__RETURN_HIT__');
        }
      },
      onMissingBlock(pc) {
        const norm = pc & 0xFFFFFF;
        cpu.pc = norm;
        finalPc = norm;
        if (norm === FAKE_RET) {
          flagByte = cpu.f & 0xFF;
          throw new Error('__RETURN_HIT__');
        }
      },
    });
    finalPc = result.lastPc ?? finalPc;
    console.log(`call done: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}`);
  } catch (err) {
    if (err?.message === '__RETURN_HIT__') {
      returnHit = true;
      console.log(`call returned to FAKE_RET @ ${hex(FAKE_RET)}`);
    } else {
      throw err;
    }
  }

  const finalFlags = flagByte ?? (cpu.f & 0xFF);
  const decoded = decodeFlags(finalFlags);

  console.log(`flags=${hex(finalFlags, 2)} carry=${decoded.carry} zero=${decoded.zero}`);

  return {
    ...testCase,
    returnHit,
    blockCount,
    finalPc,
    flagByte: finalFlags,
    carry: decoded.carry,
    zero: decoded.zero,
    op1PreBytes,
    op2PreBytes,
  };
}

// ---- main ------------------------------------------------------------------

async function main() {
  console.log('=== Phase 25L: CpOP1OP2 probe (3 compare cases) ===');

  const results = [];
  for (const testCase of CASES) {
    results.push(await runCase(testCase));
  }

  const lt = results.find((result) => result.name === 'lt');
  const eq = results.find((result) => result.name === 'eq');
  const gt = results.find((result) => result.name === 'gt');

  const allReturned = results.every((result) => result.returnHit);
  const equalZero = eq.zero;
  const differentExtremes = lt.flagByte !== gt.flagByte;
  const distinctAllThree = new Set(results.map((result) => result.flagByte)).size === 3;
  const pass = allReturned && equalZero && differentExtremes;

  console.log('');
  for (const result of results) {
    console.log(`${result.name}: F=${hex(result.flagByte, 2)} carry=${result.carry} zero=${result.zero} returnHit=${result.returnHit}`);
  }
  console.log(`equalZero=${equalZero} differentExtremes=${differentExtremes} distinctAllThree=${distinctAllThree}`);
  console.log(pass ? 'PASS' : 'FAIL');

  const observed = results
    .map((result) => `- ${result.name} (${result.label}): F=${hex(result.flagByte, 2)}, carry=${result.carry}, zero=${result.zero}, returnHit=${result.returnHit}`)
    .join('\n');

  const surprises = results.every((result) => result.returnHit)
    ? (distinctAllThree
        ? 'All three cases returned to FAKE_RET and produced three distinct flag bytes.'
        : 'All three cases returned to FAKE_RET, but at least two cases shared the same full flag byte.')
    : `At least one case did not return within ${INSN_BUDGET} steps: ${results.filter((result) => !result.returnHit).map((result) => `${result.name}@${hex(result.finalPc ?? 0)}`).join(', ')}.`;

  const report = `# Phase 25L - CpOP1OP2 Probe

**Goal**: Verify that calling CpOP1OP2 at \`0x07F831\` distinguishes OP1<OP2, OP1=OP2, and OP1>OP2 by setting flags.

**Setup**: Each sub-case uses the same full OS cold-boot + postInitState sequence as probe-phase25i-fpadd. \`cpu.madl=1\` is forced before \`cpu.push(FAKE_RET)\`; \`cpu._iy=0xD00080\`, \`cpu._ix=0xD1A860\`, \`cpu.mbase=0xD0\`, and timer IRQs remain disabled. OP1 and OP2 are seeded with \`writeReal\`, then execution CALLs \`0x07F831\` and captures \`cpu.f\` at the FAKE_RET trap before any other operation.

**Observed flag state**:
${observed}

**Result**: equalZero=${equalZero}, differentExtremes=${differentExtremes}, allReturned=${allReturned} - **${pass ? 'PASS' : 'FAIL'}**

**Surprises**: ${surprises}
`;

  fs.writeFileSync(REPORT_PATH, report);
  console.log(`report=${REPORT_PATH}`);

  process.exitCode = pass ? 0 : 1;
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error);
  fs.writeFileSync(REPORT_PATH, `# Phase 25L - CpOP1OP2 FAILED\n\n\`\`\`\n${error.stack || error}\n\`\`\`\n`);
  process.exitCode = 1;
}
