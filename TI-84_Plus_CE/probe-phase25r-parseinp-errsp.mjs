#!/usr/bin/env node

/**
 * Phase 25R: ParseInp with errSP seeded.
 *
 * Entry point: 0x099914 (ParseInp)
 * Test:        tokenized "2+3" via ?OPS with errSP catch frame
 *
 * Goal:
 *   - Return normally to FAKE_RET and decode OP1 as 5.0, or
 *   - Catch the longjmp-style error unwind at 0x061DB2 via errSP and report errNo.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { writeReal, readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25r-parseinp-errsp-report.md');

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

const PARSEINP_ENTRY = 0x099914;
const OP1_ADDR = 0xD005F8;
const ASM_RAM_ADDR = 0xD00687;
const ERRNO_ADDR = 0xD008DF;
const ERRSP_ADDR = 0xD008E0;
const OPBASE_ADDR = 0xD02590;
const OPS_ADDR = 0xD02593;
const PTEMP_ADDR = 0xD0259A;
const PROGPTR_ADDR = 0xD0259D;
const TOKEN_BUFFER_ADDR = 0xD1A881;

const ERR_CATCH_ADDR = 0x7FFFFA;
const FAKE_RET = 0x7FFFFE;
const INSN_BUDGET = 500000;
const MAX_LOOP_ITER = 8192;
const RECENT_PC_LIMIT = 50;

const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3F]);
const EXPECTED = 5.0;
const TOLERANCE = 1e-6;
const KNOWN_ERROR_CODES = new Set([0x8F, 0x28, 0x2E, 0xAB, 0xAC, 0xAF, 0x2F, 0x30, 0x31, 0xB4, 0x9F, 0xB5, 0x36]);
const KNOWN_ERROR_CODE_TEXT = '8f 28 2e ab ac af 2f 30 31 b4 9f b5 36';

// Keep the import explicit per probe task constraints.
void writeReal;

// ---- helpers ---------------------------------------------------------------

function hex(v, w = 6) { return `0x${(v >>> 0).toString(16).padStart(w, '0')}`; }

function hexBytes(mem, addr, len) {
  const parts = [];
  for (let i = 0; i < len; i++) parts.push((mem[addr + i] & 0xFF).toString(16).padStart(2, '0'));
  return parts.join(' ');
}

function hexArray(bytes) {
  return Array.from(bytes, (b) => (b & 0xFF).toString(16).padStart(2, '0')).join(' ');
}

function wrapMem(mem) {
  return {
    write8(addr, val) { mem[addr] = val & 0xFF; },
    read8(addr) { return mem[addr] & 0xFF; },
  };
}

function write24(mem, addr, value) {
  mem[addr + 0] = value & 0xFF;
  mem[addr + 1] = (value >>> 8) & 0xFF;
  mem[addr + 2] = (value >>> 16) & 0xFF;
}

function read24(mem, addr) {
  return (
    (mem[addr + 0] & 0xFF) |
    ((mem[addr + 1] & 0xFF) << 8) |
    ((mem[addr + 2] & 0xFF) << 16)
  ) >>> 0;
}

function formatValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}`;
  return String(value);
}

function quote(text) {
  return text.replaceAll('`', '\\`');
}

function recentPcText(pcs) {
  return pcs.length ? pcs.map((pc) => hex(pc)).join(' ') : '(none)';
}

function snapshotPointers(mem) {
  return {
    opBase: read24(mem, OPBASE_ADDR),
    ops: read24(mem, OPS_ADDR),
    pTemp: read24(mem, PTEMP_ADDR),
    progPtr: read24(mem, PROGPTR_ADDR),
    errSP: read24(mem, ERRSP_ADDR),
    errNo: mem[ERRNO_ADDR] & 0xFF,
  };
}

function formatPointerSnapshot(snapshot) {
  return `OPBase=${hex(snapshot.opBase)} OPS=${hex(snapshot.ops)} pTemp=${hex(snapshot.pTemp)} progPtr=${hex(snapshot.progPtr)} errSP=${hex(snapshot.errSP)} errNo=${hex(snapshot.errNo, 2)}`;
}

function describeErrCode(errNo) {
  if (KNOWN_ERROR_CODES.has(errNo)) return 'matches a known 0x061D1A dispatch-table code';
  return 'not in the current 0x061D1A dispatch-table code list';
}

function statusLabel(pass, errCaught) {
  if (pass) return 'PASS';
  if (errCaught) return 'INFORMATIVE FAIL (error caught)';
  return 'FAIL';
}

function buildFailureReport(message) {
  return `# Phase 25R - ParseInp errSP Probe FAILED

\`\`\`text
${message}
\`\`\`
`;
}

// ---- OS init (same pattern as phase25o-fpmult / phase25p-parseinp-ops) ----

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
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function primeProbeState(mem) {
  mem.fill(0x00, TOKEN_BUFFER_ADDR, TOKEN_BUFFER_ADDR + 64);
  mem.set(INPUT_TOKENS, TOKEN_BUFFER_ADDR);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
  mem[ASM_RAM_ADDR] = 0x00;
  mem[ERRNO_ADDR] = 0x00;
  write24(mem, OPS_ADDR, TOKEN_BUFFER_ADDR);
}

function seedErrFrame(cpu, mem) {
  const errFrameBase = (cpu.sp - 6) & 0xFFFFFF;

  mem.fill(0x00, errFrameBase, errFrameBase + 6);
  mem[errFrameBase + 0] = 0x00; // F
  mem[errFrameBase + 1] = 0x00; // A
  mem[errFrameBase + 2] = 0x00; // ADL pop-af padding
  mem[errFrameBase + 3] = ERR_CATCH_ADDR & 0xFF;
  mem[errFrameBase + 4] = (ERR_CATCH_ADDR >>> 8) & 0xFF;
  mem[errFrameBase + 5] = (ERR_CATCH_ADDR >>> 16) & 0xFF;
  write24(mem, ERRSP_ADDR, errFrameBase);

  return {
    errFrameBase,
    frameBytes: hexBytes(mem, errFrameBase, 6),
  };
}

function writeReport(details) {
  const diffText = typeof details.diff === 'number' && Number.isFinite(details.diff)
    ? `${details.diff}`
    : 'n/a';
  const status = statusLabel(details.pass, details.errCaught);
  const errNoText = details.errCaught
    ? `${hex(details.errNo, 2)} (${details.errNoDescription})`
    : 'n/a';

  const report = `# Phase 25R - ParseInp errSP Probe

## Goal

Call \`ParseInp\` at \`${hex(PARSEINP_ENTRY)}\` after a cold boot, seed \`?OPS\` with tokenized \`2+3\`, seed \`?errSP\` with a fake recovery frame, and distinguish a normal return from the longjmp-style error unwind through \`0x061DB2\`.

## Setup

- Cold-boot and post-init sequence copied from the existing Phase 25 probes
- Token buffer @ \`${hex(TOKEN_BUFFER_ADDR)}\`: \`${details.inputBytes}\`
- \`?OPS\` @ \`${hex(OPS_ADDR)}\` -> \`${hex(details.beforePointers.ops)}\`
- \`?errSP\` @ \`${hex(ERRSP_ADDR)}\` -> \`${hex(details.beforePointers.errSP)}\`
- Error catch sentinel @ \`${hex(ERR_CATCH_ADDR)}\`; normal return sentinel @ \`${hex(FAKE_RET)}\`
- Fake err frame @ \`${hex(details.errFrameBase)}\`: \`${details.errFrameBytes}\`
- VAT-related pointers before call: \`${details.beforePointerSummary}\`
- Timer IRQ disabled; call budget = ${INSN_BUDGET} steps; loop cap = ${MAX_LOOP_ITER}

## Observed

\`\`\`text
${details.observedOutput}
\`\`\`

## Result

- **${status}**
- returnHit=${details.returnHit}
- errCaught=${details.errCaught}
- termination=${details.termination}
- finalPc=${hex(details.finalPc ?? 0)}
- blockCount=${details.blockCount}
- errNo=${errNoText}
- got=${formatValue(details.got)}
- expected=${EXPECTED}
- diff=${diffText}

## State After Call

- OP1 bytes: \`${details.op1Bytes}\`
- Pointers before: \`${details.beforePointerSummary}\`
- Pointers after: \`${details.afterPointerSummary}\`
- Recent PCs: \`${details.recentPcs}\`
- Known dispatch-table codes tracked: \`${KNOWN_ERROR_CODE_TEXT}\`
`;

  fs.writeFileSync(REPORT_PATH, report);
}

// ---- main ------------------------------------------------------------------

async function main() {
  const observed = [];
  const log = (line) => {
    console.log(line);
    observed.push(line);
  };

  log('=== Phase 25R: ParseInp with errSP catch frame (tokenized 2+3) ===');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const bootResult = coldBoot(executor, cpu, mem);
  log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);

  postInitState(cpu, mem);
  primeProbeState(mem);

  cpu.push(FAKE_RET);
  const errFrame = seedErrFrame(cpu, mem);
  const beforePointers = snapshotPointers(mem);

  const memWrap = wrapMem(mem);
  log(`input bytes @ ${hex(TOKEN_BUFFER_ADDR)}: [${hexArray(INPUT_TOKENS)}]`);
  log(`OP1 pre-call [${hexBytes(mem, OP1_ADDR, 9)}]`);
  log(`OPS/progPtr/pTemp/OPBase before: ${formatPointerSnapshot(beforePointers)}`);
  log(`err frame @ ${hex(errFrame.errFrameBase)}: [${errFrame.frameBytes}]`);
  log(`IY before call: ${hex(cpu._iy)}`);

  let finalPc = null;
  let blockCount = 0;
  let returnHit = false;
  let errCaught = false;
  let termination = 'unknown';
  const recentPcs = [];

  const notePc = (pc, countBlock) => {
    const norm = pc & 0xFFFFFF;
    cpu.pc = norm;
    finalPc = norm;
    if (countBlock) blockCount++;
    recentPcs.push(norm);
    if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
    if (norm === FAKE_RET) throw new Error('__RETURN_HIT__');
    if (norm === ERR_CATCH_ADDR) throw new Error('__ERR_CAUGHT__');
  };

  try {
    const result = executor.runFrom(PARSEINP_ENTRY, 'adl', {
      maxSteps: INSN_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        notePc(pc, true);
      },
      onMissingBlock(pc) {
        notePc(pc, false);
      },
    });
    finalPc = result.lastPc ?? finalPc;
    termination = result.termination;
    log(`call done: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc)}`);
  } catch (err) {
    if (err?.message === '__RETURN_HIT__') {
      returnHit = true;
      termination = 'return_hit';
      finalPc = FAKE_RET;
      log(`call returned to FAKE_RET @ ${hex(FAKE_RET)}`);
    } else if (err?.message === '__ERR_CAUGHT__') {
      errCaught = true;
      termination = 'err_caught';
      finalPc = ERR_CATCH_ADDR;
      log(`error unwind hit ERR_CATCH_ADDR @ ${hex(ERR_CATCH_ADDR)}`);
    } else {
      throw err;
    }
  }

  const afterPointers = snapshotPointers(mem);
  const errNo = mem[ERRNO_ADDR] & 0xFF;
  const errNoDescription = describeErrCode(errNo);
  const op1Bytes = hexBytes(mem, OP1_ADDR, 9);

  let got = NaN;
  try {
    got = readReal(memWrap, OP1_ADDR);
  } catch (err) {
    got = `readReal error: ${err?.message ?? err}`;
  }

  const diff = typeof got === 'number' && Number.isFinite(got) ? Math.abs(got - EXPECTED) : null;
  const pass = returnHit && typeof diff === 'number' && diff <= TOLERANCE;
  const status = statusLabel(pass, errCaught);

  log(`OP1 post-call [${op1Bytes}]`);
  log(`OPS/progPtr/pTemp/OPBase after: ${formatPointerSnapshot(afterPointers)}`);
  if (errCaught) log(`errNo @ ${hex(ERRNO_ADDR)}: ${hex(errNo, 2)} (${errNoDescription})`);
  log(`got=${formatValue(got)}  expected=${EXPECTED}  diff=${diff === null ? 'n/a' : diff}`);
  log(`finalPc=${hex(finalPc ?? 0)}  blocks=${blockCount}  recent=${recentPcText(recentPcs)}`);
  log(status);

  writeReport({
    pass,
    errCaught,
    returnHit,
    termination,
    finalPc,
    blockCount,
    errNo,
    errNoDescription,
    got,
    diff,
    inputBytes: hexArray(INPUT_TOKENS),
    errFrameBase: errFrame.errFrameBase,
    errFrameBytes: errFrame.frameBytes,
    beforePointers,
    beforePointerSummary: formatPointerSnapshot(beforePointers),
    afterPointers,
    afterPointerSummary: formatPointerSnapshot(afterPointers),
    op1Bytes,
    recentPcs: recentPcText(recentPcs),
    observedOutput: quote(observed.join('\n')),
  });

  log(`report=${REPORT_PATH}`);
  process.exitCode = pass || errCaught ? 0 : 1;
}

try {
  await main();
} catch (error) {
  const message = error?.stack || String(error);
  fs.writeFileSync(REPORT_PATH, buildFailureReport(message));
  console.error(message);
  process.exitCode = 1;
}
