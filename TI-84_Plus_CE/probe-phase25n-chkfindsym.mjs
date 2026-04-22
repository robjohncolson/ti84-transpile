#!/usr/bin/env node

/**
 * Phase 25N: ChkFindSym probe.
 *
 * Goal:
 *   Create a real variable via CreateReal, then verify that ChkFindSym
 *   locates the same VAT entry and returns a RAM-backed data pointer.
 *
 * Entry points (phase25h-a-jump-table.json):
 *   CreateReal = 0x08238A
 *   ChkFindSym = 0x08383D
 *
 * OP1 format under test:
 *   OP1[0] = RealObj = 0x00
 *   OP1[1] = 'A'     = 0x41
 *   OP1[2..8] = 0x00
 *
 * Static note from lifted block 0x0820CD:
 *   TI-OS scans OP1+1..OP1+8 for a zero terminator, so the zero-padded
 *   single-char name format is consistent with the ROM's own validation path.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25n-chkfindsym-report.md');

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

const CREATE_REAL_ENTRY = 0x08238A;
const CHK_FIND_SYM_ENTRY = 0x08383D;
const OP1_ADDR = 0xD005F8;
const OP1_LEN = 9;
const FAKE_RET = 0x7FFFFE;
const INSN_BUDGET = 200000;

const RAM_LO = 0xD00000;
const RAM_HI = 0xE00000;

const ATTEMPTS = [
  {
    label: "RealObj + 'A' + zero pad",
    op1Bytes: Uint8Array.from([0x00, 0x41, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    note: 'Chosen because CreateReal forces OP1[0]=RealObj and the lifted 0x0820CD helper scans OP1+1..+8 for a NUL terminator.',
  },
];

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).padStart(2, '0');
}

function hexBytes(bytes) {
  return Array.from(bytes, (byte) => hexByte(byte)).join(' ');
}

function readBlock(mem, addr, len) {
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = mem[addr + i] & 0xFF;
  return out;
}

function writeBlock(mem, addr, bytes) {
  for (let i = 0; i < bytes.length; i++) mem[addr + i] = bytes[i] & 0xFF;
}

function readWord24(mem, addr) {
  return (mem[addr] & 0xFF) | ((mem[addr + 1] & 0xFF) << 8) | ((mem[addr + 2] & 0xFF) << 16);
}

function formatFlags(flags) {
  const carry = (flags & 0x01) !== 0;
  const zero = (flags & 0x40) !== 0;
  const sign = (flags & 0x80) !== 0;
  return `${hex(flags, 2)} (C=${carry} Z=${zero} S=${sign})`;
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
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function runCall(executor, cpu, entry) {
  cpu.madl = 1;
  cpu.push(FAKE_RET);

  let finalPc = null;
  let returnHit = false;
  let resultSummary = null;
  let thrownError = null;
  const recentPcs = [];

  try {
    resultSummary = executor.runFrom(entry, 'adl', {
      maxSteps: INSN_BUDGET,
      maxLoopIterations: 4096,
      onBlock(pc) {
        const norm = pc & 0xFFFFFF;
        cpu.pc = norm;
        finalPc = norm;
        recentPcs.push(norm);
        if (recentPcs.length > 12) recentPcs.shift();
        if (norm === FAKE_RET) throw new Error('__RETURN_HIT__');
      },
      onMissingBlock(pc) {
        const norm = pc & 0xFFFFFF;
        cpu.pc = norm;
        finalPc = norm;
        if (norm === FAKE_RET) throw new Error('__RETURN_HIT__');
      },
    });
    finalPc = resultSummary.lastPc ?? finalPc;
  } catch (error) {
    if (error?.message === '__RETURN_HIT__') {
      returnHit = true;
      finalPc = FAKE_RET;
    } else {
      thrownError = error;
    }
  }

  if (thrownError) throw thrownError;

  return {
    entry,
    returnHit,
    finalPc,
    steps: resultSummary?.steps ?? 0,
    termination: resultSummary?.termination ?? (returnHit ? 'fake_ret' : 'threw'),
    dynamicTargets: resultSummary?.dynamicTargets ?? [],
    missingBlocks: resultSummary?.missingBlocks ?? [],
    recentPcs,
    a: cpu.a & 0xFF,
    b: cpu.b & 0xFF,
    c: cpu.c & 0xFF,
    d: cpu.d & 0xFF,
    e: cpu.e & 0xFF,
    f: cpu.f & 0xFF,
    bc: cpu.bc & 0xFFFFFF,
    de: cpu.de & 0xFFFFFF,
    hl: cpu.hl & 0xFFFFFF,
    ix: cpu.ix & 0xFFFFFF,
    iy: cpu.iy & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    carry: (cpu.f & 0x01) !== 0,
  };
}

function captureAttemptLog(state) {
  return [
    `attempt: ${state.label}`,
    `boot: steps=${state.bootResult.steps} term=${state.bootResult.termination} lastPc=${hex(state.bootResult.lastPc)}`,
    `OP1 pre-CreateReal [${state.op1PreCreateHex}]`,
    state.create.returnHit
      ? `CreateReal returned to FAKE_RET @ ${hex(FAKE_RET)}`
      : `CreateReal did not return to FAKE_RET; finalPc=${hex(state.create.finalPc)} term=${state.create.termination} steps=${state.create.steps}`,
    `CreateReal exit: pc=${hex(state.create.finalPc)} F=${formatFlags(state.create.f)} HL=${hex(state.create.hl)} DE=${hex(state.create.de)} B=${hex(state.create.b, 2)} OP1-post=[${state.op1PostCreateHex}]`,
    `CreateReal recent PCs: ${state.create.recentPcs.map((pc) => hex(pc)).join(' ') || '(none)'}`,
    `CreateReal dynamic targets: ${state.create.dynamicTargets.map((pc) => hex(pc)).join(' ') || '(none)'}`,
    `CreateReal missing blocks: ${state.create.missingBlocks.join(', ') || '(none)'}`,
    `OP1 pre-ChkFindSym [${state.op1PreFindHex}]`,
    state.find.returnHit
      ? `ChkFindSym returned to FAKE_RET @ ${hex(FAKE_RET)}`
      : `ChkFindSym did not return to FAKE_RET; finalPc=${hex(state.find.finalPc)} term=${state.find.termination} steps=${state.find.steps}`,
    `ChkFindSym exit: pc=${hex(state.find.finalPc)} F=${formatFlags(state.find.f)} HL=${hex(state.find.hl)} DE=${hex(state.find.de)} B=${hex(state.find.b, 2)} VAT.page=${hex(state.find.b, 2)} HL.inRAM=${state.hlInRam}`,
    `ChkFindSym recent PCs: ${state.find.recentPcs.map((pc) => hex(pc)).join(' ') || '(none)'}`,
    `ChkFindSym dynamic targets: ${state.find.dynamicTargets.map((pc) => hex(pc)).join(' ') || '(none)'}`,
    `ChkFindSym missing blocks: ${state.find.missingBlocks.join(', ') || '(none)'}`,
    state.pass ? 'PASS' : 'FAIL',
  ];
}

function writeReport(summary) {
  const selected = summary.selectedAttempt;
  const lines = [];

  lines.push('# Phase 25N - ChkFindSym probe');
  lines.push('');
  lines.push('## Goal');
  lines.push('');
  lines.push('Verify the VAT walker by creating a real variable with `CreateReal` and then locating it with `ChkFindSym`.');
  lines.push('');
  lines.push('## Setup');
  lines.push('');
  lines.push('- Cold-boot + post-init sequence copied from `probe-phase25i-fpadd.mjs`.');
  lines.push(`- Kernel init entry: \`${hex(KERNEL_INIT_ENTRY)}\``);
  lines.push(`- Post-init entry: \`${hex(POST_INIT_ENTRY)}\``);
  lines.push('- CPU state before calls: `madl=1`, `mbase=0xD0`, `IY=0xD00080`, `IX=0xD1A860`, timer IRQ disabled.');
  lines.push(`- OP1 address: \`${hex(OP1_ADDR)}\``);
  lines.push(`- CreateReal impl: \`${hex(CREATE_REAL_ENTRY)}\``);
  lines.push(`- ChkFindSym impl: \`${hex(CHK_FIND_SYM_ENTRY)}\``);
  lines.push(`- Fake return sentinel: \`${hex(FAKE_RET)}\``);
  lines.push('');
  lines.push('## OP1 bytes pre-CreateReal');
  lines.push('');
  lines.push(`- Attempt used: ${selected.label}`);
  lines.push(`- Bytes: \`${selected.op1PreCreateHex}\``);
  lines.push('');
  lines.push('## CreateReal exit state');
  lines.push('');
  lines.push(`- PC: \`${hex(selected.create.finalPc)}\``);
  lines.push(`- Returned to fake return: ${selected.create.returnHit}`);
  lines.push(`- Termination: \`${selected.create.termination}\``);
  lines.push(`- Flags: \`${formatFlags(selected.create.f)}\``);
  lines.push(`- HL: \`${hex(selected.create.hl)}\``);
  lines.push(`- DE: \`${hex(selected.create.de)}\``);
  lines.push(`- B: \`${hex(selected.create.b, 2)}\``);
  lines.push(`- OP1 after CreateReal: \`${selected.op1PostCreateHex}\``);
  lines.push('');
  lines.push('## OP1 bytes pre-ChkFindSym');
  lines.push('');
  lines.push(`- Bytes: \`${selected.op1PreFindHex}\``);
  lines.push('');
  lines.push('## ChkFindSym exit state');
  lines.push('');
  lines.push(`- PC: \`${hex(selected.find.finalPc)}\``);
  lines.push(`- Returned to fake return: ${selected.find.returnHit}`);
  lines.push(`- Termination: \`${selected.find.termination}\``);
  lines.push(`- Flags: \`${formatFlags(selected.find.f)}\``);
  lines.push(`- Carry clear (found): ${!selected.find.carry}`);
  lines.push(`- HL: \`${hex(selected.find.hl)}\``);
  lines.push(`- DE: \`${hex(selected.find.de)}\``);
  lines.push(`- B: \`${hex(selected.find.b, 2)}\``);
  lines.push(`- HL points into RAM: ${selected.hlInRam}`);
  if (selected.hlInRam) {
    lines.push(`- 9 bytes @ HL: \`${selected.findDataHex}\``);
  }
  lines.push(`- VAT scratch @ 0xD0259A: \`${hex(selected.vatEntryScratch)}\``);
  lines.push(`- VAT scratch @ 0xD0259D: \`${hex(selected.dataPtrScratch)}\``);
  lines.push('');
  lines.push('## PASS/FAIL');
  lines.push('');
  lines.push(`- Result: **${summary.pass ? 'PASS' : 'FAIL'}**`);
  lines.push('- PASS requires both calls to return to the fake sentinel, plus `ChkFindSym` carry clear and `HL` in RAM.');
  lines.push(`- Evaluated as: CreateReal.returnHit=${selected.create.returnHit}, ChkFindSym.returnHit=${selected.find.returnHit}, carryClear=${!selected.find.carry}, hlInRam=${selected.hlInRam}`);
  lines.push('');
  lines.push('## Surprises');
  lines.push('');
  lines.push(`- ${ATTEMPTS[0].note}`);
  if (summary.attempts.length === 1) {
    lines.push("- The first OP1 layout already matched the ROM's expectations, so no alternate name encoding was needed.");
  } else {
    for (const attempt of summary.attempts) {
      lines.push(`- Attempt '${attempt.label}': ${attempt.pass ? 'worked' : 'failed'}.`);
    }
  }
  lines.push(`- CreateReal clobbered OP1 to: \`${selected.op1PostCreateHex}\`, so the probe re-seeded OP1 before ChkFindSym as requested.`);
  lines.push(`- CreateReal carry=${selected.create.carry} and ChkFindSym carry=${selected.find.carry}; only the latter participates in PASS/FAIL per the task contract.`);
  lines.push('');
  lines.push('## Console Output');
  lines.push('');
  lines.push('```text');
  for (const line of summary.transcript) lines.push(line);
  lines.push('```');
  lines.push('');

  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`);
}

async function runAttempt(attempt, log) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const bootResult = coldBoot(executor, cpu, mem);
  postInitState(cpu, mem);

  writeBlock(mem, OP1_ADDR, attempt.op1Bytes);
  const op1PreCreate = readBlock(mem, OP1_ADDR, OP1_LEN);

  const create = runCall(executor, cpu, CREATE_REAL_ENTRY);
  const op1PostCreate = readBlock(mem, OP1_ADDR, OP1_LEN);

  writeBlock(mem, OP1_ADDR, attempt.op1Bytes);
  const op1PreFind = readBlock(mem, OP1_ADDR, OP1_LEN);

  const find = runCall(executor, cpu, CHK_FIND_SYM_ENTRY);
  const hlInRam = find.hl >= RAM_LO && find.hl < RAM_HI;
  const findDataBytes = hlInRam ? readBlock(mem, find.hl, OP1_LEN) : new Uint8Array(0);
  const vatEntryScratch = readWord24(mem, 0xD0259A);
  const dataPtrScratch = readWord24(mem, 0xD0259D);

  const state = {
    label: attempt.label,
    bootResult,
    op1PreCreateHex: hexBytes(op1PreCreate),
    op1PostCreateHex: hexBytes(op1PostCreate),
    op1PreFindHex: hexBytes(op1PreFind),
    create,
    find,
    hlInRam,
    findDataHex: hexBytes(findDataBytes),
    vatEntryScratch,
    dataPtrScratch,
    pass: create.returnHit && find.returnHit && !find.carry && hlInRam,
  };

  for (const line of captureAttemptLog(state)) log(line);
  return state;
}

async function main() {
  const transcript = [];
  const log = (line = '') => {
    transcript.push(String(line));
    console.log(line);
  };

  log('=== Phase 25N: ChkFindSym probe ===');

  const attempts = [];
  for (const attempt of ATTEMPTS) {
    const state = await runAttempt(attempt, log);
    attempts.push(state);
    if (state.pass) break;
    log('');
  }

  const selectedAttempt = attempts.find((attempt) => attempt.pass) ?? attempts[attempts.length - 1];
  const pass = selectedAttempt.pass;

  writeReport({
    attempts,
    selectedAttempt,
    pass,
    transcript,
  });

  log(`report=${REPORT_PATH}`);
  process.exit(pass ? 0 : 1);
}

try {
  await main();
} catch (error) {
  const message = error.stack || String(error);
  console.error(message);
  fs.writeFileSync(
    REPORT_PATH,
    `# Phase 25N - FAILED\n\n\`\`\`\n${message}\n\`\`\`\n`,
  );
  process.exit(1);
}
