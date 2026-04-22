#!/usr/bin/env node

/**
 * Phase 25Q: InvOP1S probe.
 *
 * Entry point: 0x07CA06 (InvOP1S)
 * Tests:       OP1=7.0   => classify as negate (-7.0) or abs (7.0)
 *              OP1=-3.5  => expect 3.5 for either negate or abs
 *
 * Addresses (ti84pceg.inc):
 *   OP1 = 0xD005F8
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { writeReal, readReal } from './fp-real.mjs';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25q-invop1s-report.md');

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

const INVOP1S_ENTRY = 0x07CA06;
const DISASM_START = 0x07CA02;
const DISASM_END = 0x07CA12;
const OP1_ADDR = 0xD005F8;

const FAKE_RET = 0x7FFFFE;
const INSN_BUDGET = 200000;
const TOLERANCE = 1e-6;

const TEST_CASES = [
  { label: 'test1', seed: 7.0, negateExpected: -7.0, absExpected: 7.0 },
  { label: 'test2', seed: -3.5, negateExpected: 3.5, absExpected: 3.5 },
];

const CPU_SNAPSHOT_FIELDS = [
  'a',
  'f',
  '_bc',
  '_de',
  '_hl',
  '_a2',
  '_f2',
  '_bc2',
  '_de2',
  '_hl2',
  'sp',
  '_ix',
  '_iy',
  'i',
  'im',
  'iff1',
  'iff2',
  'madl',
  'mbase',
  'halted',
  'cycles',
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

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_SNAPSHOT_FIELDS) cpu[field] = snapshot[field];
}

function matches(actual, expected) {
  return Math.abs(actual - expected) <= TOLERANCE;
}

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'call':
      return `call ${hex(inst.target)}`;
    case 'call-conditional':
      return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp':
      return `jp ${hex(inst.target)}`;
    case 'jp-conditional':
      return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jr':
      return `jr ${hex(inst.target)}`;
    case 'jr-conditional':
      return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'ret':
      return 'ret';
    case 'ret-conditional':
      return `ret ${inst.condition}`;
    case 'alu-imm':
      return `${inst.op} ${hex(inst.value, 2)}`;
    case 'alu-reg':
      return `${inst.op} ${inst.src}`;
    case 'ld-reg-imm':
      return `ld ${inst.dest}, ${hex(inst.value, 2)}`;
    case 'ld-reg-reg':
      return `ld ${inst.dest}, ${inst.src}`;
    default: {
      const fields = Object.entries(inst)
        .filter(([key]) => !['pc', 'length', 'nextPc', 'mode', 'modePrefix', 'terminates', 'kind'].includes(key))
        .map(([key, value]) => `${key}=${value}`);
      return fields.length > 0 ? `${inst.tag} ${fields.join(' ')}` : inst.tag;
    }
  }
}

function disassembleRange(bytes, startPc, endPc) {
  const rows = [];
  let pc = startPc;
  while (pc < endPc) {
    const inst = decodeInstruction(bytes, pc, 'adl');
    const raw = Array.from(bytes.slice(pc, pc + inst.length), (b) => b.toString(16).padStart(2, '0')).join(' ');
    rows.push(`${hex(inst.pc)}: ${raw.padEnd(11, ' ')}  ${formatInstruction(inst)}`);
    pc += inst.length;
  }
  return rows;
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

// ---- main ------------------------------------------------------------------

async function main() {
  console.log('=== Phase 25Q: InvOP1S probe ===');
  console.log(`entry=${hex(INVOP1S_ENTRY)}  OP1=${hex(OP1_ADDR)}  fake_ret=${hex(FAKE_RET)}`);

  console.log('');
  console.log('Static disassembly (0x07CA02..0x07CA12):');
  const disassembly = disassembleRange(romBytes, DISASM_START, DISASM_END);
  for (const row of disassembly) console.log(row);

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const bootResult = coldBoot(executor, cpu, mem);
  console.log('');
  console.log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);

  postInitState(cpu, mem);
  const baselineRam = new Uint8Array(mem.slice(0x400000, 0xE00000));
  const baselineCpu = snapshotCpu(cpu);
  const memWrap = wrapMem(mem);

  const results = [];

  for (const testCase of TEST_CASES) {
    mem.set(baselineRam, 0x400000);
    restoreCpu(cpu, baselineCpu);
    postInitState(cpu, mem);

    writeReal(memWrap, OP1_ADDR, testCase.seed);

    console.log('');
    console.log(`${testCase.label}: OP1 pre-call [${hexBytes(mem, OP1_ADDR, 9)}]  (${testCase.seed})`);

    cpu.push(FAKE_RET);

    let finalPc = null;
    let blockCount = 0;
    let returnHit = false;

    try {
      const result = executor.runFrom(INVOP1S_ENTRY, 'adl', {
        maxSteps: INSN_BUDGET,
        maxLoopIterations: 4096,
        onBlock(pc) {
          const norm = pc & 0xFFFFFF;
          cpu.pc = norm;
          finalPc = norm;
          blockCount++;
          if (norm === FAKE_RET) throw new Error('__RETURN_HIT__');
        },
        onMissingBlock(pc) {
          const norm = pc & 0xFFFFFF;
          cpu.pc = norm;
          finalPc = norm;
          if (norm === FAKE_RET) throw new Error('__RETURN_HIT__');
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

    const op1Bytes = hexBytes(mem, OP1_ADDR, 9);
    const got = readReal(memWrap, OP1_ADDR);
    const negateMatch = matches(got, testCase.negateExpected);
    const absMatch = matches(got, testCase.absExpected);

    console.log(`OP1 post-call [${op1Bytes}]`);
    console.log(
      `got=${got}  negate_expected=${testCase.negateExpected}  abs_expected=${testCase.absExpected}`
    );
    console.log(
      `negate_diff=${Math.abs(got - testCase.negateExpected)}  abs_diff=${Math.abs(got - testCase.absExpected)}`
    );

    results.push({
      ...testCase,
      op1Bytes,
      got,
      returnHit,
      finalPc,
      blockCount,
      negateMatch,
      absMatch,
    });
  }

  const overallBehavior =
    results.every((result) => result.returnHit) &&
    results[0]?.negateMatch &&
    results[1]?.negateMatch
      ? 'negate'
      : results.every((result) => result.returnHit) &&
        results[0]?.absMatch &&
        results[1]?.absMatch
        ? 'absolute_value'
        : 'other';

  const pass = overallBehavior === 'negate' || overallBehavior === 'absolute_value';

  console.log('');
  console.log(`classification=${overallBehavior}`);
  console.log(pass ? 'PASS' : 'FAIL');

  const report = `# Phase 25Q - InvOP1S Probe

**Goal**: Classify InvOP1S at \`0x07CA06\` as either negate-OP1, absolute-value, or something else.

**Setup**: Full OS cold-boot + postInitState (same sequence as probe-phase25i-fpadd). Timer IRQ disabled via \`createPeripheralBus({ timerInterrupt: false })\`. Each test restores the same post-init RAM/CPU baseline, seeds OP1 via \`writeReal(...)\`, pushes fake return address \`${hex(FAKE_RET)}\`, and runs until PC reaches that sentinel or ${INSN_BUDGET} instructions are exhausted.

**Static disassembly** (\`0x07CA02..0x07CA12\`):
\`\`\`
${disassembly.join('\n')}
\`\`\`

**Classification**: ${overallBehavior} - **${pass ? 'PASS' : 'FAIL'}**

## Test Results

| test | seed | observed | negate expected | abs expected | returned | observed OP1 bytes |
|---|---:|---:|---:|---:|:---:|:---|
${results.map((result) => `| ${result.label} | ${result.seed} | ${result.got} | ${result.negateExpected} | ${result.absExpected} | ${result.returnHit ? 'yes' : 'no'} | \`${result.op1Bytes}\` |`).join('\n')}

**Notes**: ${overallBehavior === 'negate'
    ? 'InvOP1S behaves like a sign-flip/negation primitive.'
    : overallBehavior === 'absolute_value'
      ? 'InvOP1S preserves positive inputs and maps negative inputs to positive magnitude, consistent with absolute value.'
      : results.every((result) => result.returnHit)
        ? 'InvOP1S returned cleanly, but the observed values did not match either negate or absolute-value behavior across both probes.'
        : 'At least one test failed to return cleanly to the fake return sentinel.'}
`;

  fs.writeFileSync(REPORT_PATH, report);
  console.log(`report=${REPORT_PATH}`);

  process.exitCode = pass ? 0 : 1;
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error);
  fs.writeFileSync(REPORT_PATH, `# Phase 25Q - InvOP1S FAILED\n\n\`\`\`\n${error.stack || error}\n\`\`\`\n`);
  process.exitCode = 1;
}
