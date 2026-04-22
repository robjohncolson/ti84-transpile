#!/usr/bin/env node

/**
 * Phase 25W: ParseInp with CORRECT initial pointer values.
 *
 * Key changes from 25V:
 *   - OPBase/pTemp/progPtr/newDataPtr start at 0xD3FFFF (symTable end).
 *   - Token buffer remains at 0xD00800, separate from allocator pointers.
 *   - OPS points at the token buffer so ParseInp reads the seeded tokens.
 *   - FPSbase/FPS remain at 0xD00A00.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25w-parseinp-correct-init-report.md');

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const PARSEINP_ENTRY = 0x099914;
const OP1_ADDR = 0xd005f8;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const SYMTABLE_END = 0xd3ffff;
const TOKEN_BUFFER_ADDR = 0xd00800;
const FP_STACK_BASE = 0xd00a00;

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;
const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);
const EXPECTED_OP1 = Uint8Array.from([0x00, 0x80, 0x50, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const INSN_BUDGET = 1000000;
const MAX_LOOP_ITER = 8192;
const RECENT_PC_LIMIT = 64;
const EXPECTED = 5.0;
const TOLERANCE = 1e-6;

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function read24(mem, addr) {
  return (
    (mem[addr] & 0xff) |
    ((mem[addr + 1] & 0xff) << 8) |
    ((mem[addr + 2] & 0xff) << 16)
  ) >>> 0;
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

function hexBytes(mem, addr, len) {
  const parts = [];
  for (let i = 0; i < len; i++) {
    parts.push((mem[addr + i] & 0xff).toString(16).padStart(2, '0'));
  }
  return parts.join(' ');
}

function hexArray(bytes) {
  return Array.from(bytes, (b) => (b & 0xff).toString(16).padStart(2, '0')).join(' ');
}

function wrapMem(mem) {
  return {
    write8(addr, val) { mem[addr] = val & 0xff; },
    read8(addr) { return mem[addr] & 0xff; },
  };
}

function quote(text) {
  return text.replaceAll('`', '\\`');
}

function formatValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}`;
  return String(value);
}

function snapshotPointers(mem) {
  return {
    opBase: read24(mem, OPBASE_ADDR),
    ops: read24(mem, OPS_ADDR),
    pTemp: read24(mem, PTEMP_ADDR),
    progPtr: read24(mem, PROGPTR_ADDR),
    fpsBase: read24(mem, FPSBASE_ADDR),
    fps: read24(mem, FPS_ADDR),
    newDataPtr: read24(mem, NEWDATA_PTR_ADDR),
    errSP: read24(mem, ERR_SP_ADDR),
    errNo: mem[ERR_NO_ADDR] & 0xff,
  };
}

function formatPointerSnapshot(snapshot) {
  return (
    `OPBase=${hex(snapshot.opBase)} ` +
    `OPS=${hex(snapshot.ops)} ` +
    `pTemp=${hex(snapshot.pTemp)} ` +
    `progPtr=${hex(snapshot.progPtr)} ` +
    `FPSbase=${hex(snapshot.fpsBase)} ` +
    `FPS=${hex(snapshot.fps)} ` +
    `newDataPtr=${hex(snapshot.newDataPtr)} ` +
    `errSP=${hex(snapshot.errSP)} ` +
    `errNo=${hex(snapshot.errNo, 2)}`
  );
}

function pointerDeltaText(before, after) {
  const labels = [
    ['opBase', 'OPBase'],
    ['ops', 'OPS'],
    ['pTemp', 'pTemp'],
    ['progPtr', 'progPtr'],
    ['fpsBase', 'FPSbase'],
    ['fps', 'FPS'],
    ['newDataPtr', 'newDataPtr'],
    ['errSP', 'errSP'],
    ['errNo', 'errNo'],
  ];
  const changes = labels
    .filter(([key]) => before[key] !== after[key])
    .map(([key, label]) => `${label}: ${hex(before[key], key === 'errNo' ? 2 : 6)} -> ${hex(after[key], key === 'errNo' ? 2 : 6)}`);
  return changes.length === 0 ? '(none)' : changes.join(', ');
}

function recentPcText(pcs, count = 20) {
  if (pcs.length === 0) return '(none)';
  return pcs.slice(-count).map((pc) => hex(pc)).join(' ');
}

function coldBoot(executor, cpu, mem) {
  const bootResult = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return bootResult;
}

function prepareCallState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;
  cpu.f = 0x40;
  cpu._ix = 0xd1a860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
}

function seedCorrectState(mem) {
  mem.fill(0x00, TOKEN_BUFFER_ADDR, TOKEN_BUFFER_ADDR + 0x80);
  mem.fill(0x00, FP_STACK_BASE, FP_STACK_BASE + 0x100);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);

  mem.set(INPUT_TOKENS, TOKEN_BUFFER_ADDR);

  write24(mem, OPBASE_ADDR, SYMTABLE_END);
  write24(mem, PTEMP_ADDR, SYMTABLE_END);
  write24(mem, PROGPTR_ADDR, SYMTABLE_END);
  write24(mem, NEWDATA_PTR_ADDR, SYMTABLE_END);

  write24(mem, FPSBASE_ADDR, FP_STACK_BASE);
  write24(mem, FPS_ADDR, FP_STACK_BASE);

  // Session 81 showed ParseInp works best with a separate token buffer.
  write24(mem, OPS_ADDR, TOKEN_BUFFER_ADDR);

  mem[ERR_NO_ADDR] = 0x00;
}

function seedErrFrame(cpu, mem) {
  write24(mem, cpu.sp, FAKE_RET);

  const errFrameBase = (cpu.sp - 6) & 0xffffff;
  mem.fill(0x00, errFrameBase, errFrameBase + 6);
  write24(mem, errFrameBase + 3, ERR_CATCH_ADDR);
  write24(mem, ERR_SP_ADDR, errFrameBase);
  mem[ERR_NO_ADDR] = 0x00;
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);

  return {
    errFrameBase,
    mainReturnBytes: hexBytes(mem, cpu.sp, 3),
    errFrameBytes: hexBytes(mem, errFrameBase, 6),
  };
}

function verdictLabel(pass, partial) {
  if (pass) return 'PASS';
  if (partial) return 'PARTIAL';
  return 'FAIL';
}

function buildReport(details) {
  const diffText = typeof details.diff === 'number' && Number.isFinite(details.diff)
    ? `${details.diff}`
    : 'n/a';

  return `# Phase 25W - ParseInp with CORRECT initial pointer values

## Goal

Call \`ParseInp\` at \`${hex(PARSEINP_ENTRY)}\` with corrected allocator-family pointer seeds:

- \`OPBase/pTemp/progPtr/newDataPtr = ${hex(SYMTABLE_END)}\`
- \`OPS = ${hex(TOKEN_BUFFER_ADDR)}\`
- \`FPSbase/FPS = ${hex(FP_STACK_BASE)}\`
- tokenized \`2+3\` at \`${hex(TOKEN_BUFFER_ADDR)}\`

## Post-Boot Pointer Dump

- Post-boot pointers before seeding: \`${details.postBootPointerSummary}\`
- Seeded pointers before call: \`${details.seededPointerSummary}\`
- Token buffer @ \`${hex(TOKEN_BUFFER_ADDR)}\`: \`${details.inputBytes}\`
- Main return frame @ \`${hex(details.mainReturnAddr)}\`: \`${details.mainReturnBytes}\`
- Error catch frame @ \`${hex(details.errFrameBase)}\`: \`${details.errFrameBytes}\`

## Outcome

- Disposition: \`${details.disposition}\`
- returnHit=${details.returnHit}
- errCaught=${details.errCaught}
- missingBlock=${details.missingBlock}
- termination=${details.termination}
- finalPc=${hex(details.finalPc ?? 0)}
- errNo=${hex(details.errNo, 2)}
- stepCount=${details.stepCount}

## State After Call

- Expected OP1 bytes: \`${details.expectedOp1Bytes}\`
- OP1 bytes: \`${details.op1Bytes}\`
- OP1 exact-byte match=${details.op1ByteMatch}
- OP1 decoded via readReal: \`${formatValue(details.got)}\`
- Expected numeric value: \`${EXPECTED}\`
- Diff: \`${diffText}\`
- Pointers before call: \`${details.seededPointerSummary}\`
- Pointers after call: \`${details.afterPointerSummary}\`
- Pointer changes: \`${details.pointerChanges}\`
- Last 20 PCs: \`${details.last20Pcs}\`

## Verdict

- **${details.verdict}**

## Console Output

\`\`\`text
${details.observedOutput}
\`\`\`
`;
}

function buildFailureReport(message) {
  return `# Phase 25W - ParseInp with CORRECT initial pointer values FAILED

\`\`\`text
${message}
\`\`\`
`;
}

async function main() {
  const observed = [];
  const log = (line) => {
    console.log(line);
    observed.push(line);
  };

  log('=== Phase 25W: ParseInp with CORRECT initial pointer values ===');
  log(`allocator pointers @ ${hex(SYMTABLE_END)}; token buffer @ ${hex(TOKEN_BUFFER_ADDR)}; FPS @ ${hex(FP_STACK_BASE)}`);

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const bootResult = coldBoot(executor, cpu, mem);
  log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc ?? 0)}`);

  const postBootPointers = snapshotPointers(mem);
  log(`post-boot pointers: ${formatPointerSnapshot(postBootPointers)}`);

  prepareCallState(cpu, mem);
  seedCorrectState(mem);
  const seededPointers = snapshotPointers(mem);
  const errFrame = seedErrFrame(cpu, mem);

  log(`seeded pointers: ${formatPointerSnapshot(seededPointers)}`);
  log(`input bytes @ ${hex(TOKEN_BUFFER_ADDR)}: [${hexArray(INPUT_TOKENS)}]`);
  log(`expected OP1 @ ${hex(OP1_ADDR)}: [${hexArray(EXPECTED_OP1)}]`);
  log(`main return frame @ ${hex(cpu.sp)}: [${errFrame.mainReturnBytes}]`);
  log(`error catch frame @ ${hex(errFrame.errFrameBase)}: [${errFrame.errFrameBytes}]`);
  log(`OP1 pre-call @ ${hex(OP1_ADDR)}: [${hexBytes(mem, OP1_ADDR, 9)}]`);

  let finalPc = null;
  let termination = 'unknown';
  let returnHit = false;
  let errCaught = false;
  let missingBlock = false;
  let stepCount = 0;
  let blockCount = 0;
  const recentPcs = [];

  const notePc = (pc, step, countBlock) => {
    const norm = pc & 0xffffff;
    finalPc = norm;
    if (countBlock) blockCount++;
    if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);
    recentPcs.push(norm);
    if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
    if (norm === FAKE_RET) throw new Error('__RETURN_HIT__');
    if (norm === ERR_CATCH_ADDR) throw new Error('__ERR_CAUGHT__');
  };

  try {
    const result = executor.runFrom(PARSEINP_ENTRY, 'adl', {
      maxSteps: INSN_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, mode, meta, step) {
        void mode;
        void meta;
        notePc(pc, step, true);
      },
      onMissingBlock(pc, mode, step) {
        void mode;
        missingBlock = true;
        notePc(pc, step, false);
      },
    });

    finalPc = result.lastPc ?? finalPc;
    termination = result.termination;
    stepCount = Math.max(stepCount, result.steps ?? 0);
    log(`call done: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc ?? 0)}`);
  } catch (error) {
    if (error?.message === '__RETURN_HIT__') {
      returnHit = true;
      termination = 'return_hit';
      finalPc = FAKE_RET;
      log(`ParseInp returned to FAKE_RET @ ${hex(FAKE_RET)}`);
    } else if (error?.message === '__ERR_CAUGHT__') {
      errCaught = true;
      termination = 'err_caught';
      finalPc = ERR_CATCH_ADDR;
      log(`ParseInp hit ERR_CATCH_ADDR @ ${hex(ERR_CATCH_ADDR)}`);
    } else {
      throw error;
    }
  }

  const afterPointers = snapshotPointers(mem);
  const pointerChanges = pointerDeltaText(seededPointers, afterPointers);
  const errNo = mem[ERR_NO_ADDR] & 0xff;
  const op1Bytes = hexBytes(mem, OP1_ADDR, 9);
  const expectedOp1Bytes = hexArray(EXPECTED_OP1);
  const op1ByteMatch = op1Bytes === expectedOp1Bytes;

  let got = NaN;
  try {
    got = readReal(wrapMem(mem), OP1_ADDR);
  } catch (error) {
    got = `readReal error: ${error?.message ?? error}`;
  }

  const diff = typeof got === 'number' && Number.isFinite(got) ? Math.abs(got - EXPECTED) : null;
  const numericMatch = typeof diff === 'number' && diff <= TOLERANCE;
  const pass = returnHit && errNo === 0x00 && op1ByteMatch && numericMatch;
  const partial = !pass && (returnHit || errCaught || missingBlock || termination === 'max_steps');
  const verdict = verdictLabel(pass, partial);
  const disposition = returnHit
    ? 'FAKE_RET'
    : errCaught
      ? 'ERR_CATCH'
      : missingBlock || termination === 'missing_block'
        ? 'MISSING_BLOCK'
        : termination;

  log(`errNo after call: ${hex(errNo, 2)}`);
  log(`OP1 post-call @ ${hex(OP1_ADDR)}: [${op1Bytes}]`);
  log(`OP1 exact-byte match: ${op1ByteMatch}`);
  log(`OP1 decoded via readReal: ${formatValue(got)}`);
  log(`pointers after call: ${formatPointerSnapshot(afterPointers)}`);
  log(`pointer changes: ${pointerChanges}`);
  log(`last 20 PCs: ${recentPcText(recentPcs, 20)}`);
  log(`verdict=${verdict}`);

  const report = buildReport({
    postBootPointerSummary: formatPointerSnapshot(postBootPointers),
    seededPointerSummary: formatPointerSnapshot(seededPointers),
    afterPointerSummary: formatPointerSnapshot(afterPointers),
    pointerChanges,
    inputBytes: hexArray(INPUT_TOKENS),
    expectedOp1Bytes,
    mainReturnAddr: cpu.sp,
    mainReturnBytes: errFrame.mainReturnBytes,
    errFrameBase: errFrame.errFrameBase,
    errFrameBytes: errFrame.errFrameBytes,
    disposition,
    returnHit,
    errCaught,
    missingBlock,
    termination,
    finalPc,
    errNo,
    stepCount: Math.max(stepCount, blockCount),
    op1Bytes,
    op1ByteMatch,
    got,
    diff,
    last20Pcs: recentPcText(recentPcs, 20),
    verdict,
    observedOutput: quote(observed.join('\n')),
  });

  fs.writeFileSync(REPORT_PATH, report, 'utf8');
  log(`report=${REPORT_PATH}`);
}

try {
  await main();
} catch (error) {
  const message = error?.stack || String(error);
  fs.writeFileSync(REPORT_PATH, buildFailureReport(message), 'utf8');
  console.error(message);
  process.exitCode = 1;
}
