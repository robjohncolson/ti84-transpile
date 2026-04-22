#!/usr/bin/env node

/**
 * Phase 25K: ParseInp probe.
 *
 * Entry point: 0x099914 (ParseInp)
 * Test:        tokenized "2+3" => expect OP1=5.0
 *
 * Address notes (ti84pceg.inc + ROM.transpiled.js):
 *   ParseInp   = 0x099914
 *   OP1        = 0xD005F8
 *   tempMem    = 0xD02587   (pointer cell, not the token bytes)
 *   FPSbase    = 0xD0258A
 *   FPS        = 0xD0258D
 *   newDataPtr = 0xD025A0
 *   userMem    = 0xD1A881   (actual RAM buffer seeded by 0x09DEE0)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { writeReal, readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25k-parseinp-report.md');

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

const TEMP_MEM_PTR_ADDR = 0xD02587;
const FPSBASE_ADDR = 0xD0258A;
const FPS_ADDR = 0xD0258D;
const NEW_DATA_PTR_ADDR = 0xD025A0;
const USER_MEM_ADDR = 0xD1A881;

const PARSE_SCAN_BASE_ADDR = 0xD02317;
const PARSE_SCAN_CUR_ADDR = 0xD0231A;
const PARSE_SCAN_END_ADDR = 0xD0231D;
const SAVED_HL_ADDR = 0xD007FA;
const SAVED_SP_ADDR = 0xD008E0;

const FAKE_RET = 0x7FFFFE;
const INSN_BUDGET = 200000;

const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3F]);
const OP1_SENTINEL = -1.0;
const EXPECTED = 5.0;
const TOLERANCE = 1e-6;

const PARSEINP_HEAD_BYTES =
  'af 32 be 22 d0 cd 81 9b 09 fd cb 1f 9e cd 81 9b 09 cd 18 9b 09 c1 cd ed be 09 01 8a 9a 09 cd ed';

const CALL_CONVENTION_FINDING =
  'The first 32 bytes of ParseInp do not read HL/DE/BC for an input pointer. ' +
  'They zero 0xD022BE and call internal helpers, so the probe seeds the global parser pointer slots. ' +
  'HL is primed to userMem defensively, but the observed contract is pointer-driven.';

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
  cpu.madl = 1;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function primeParseState(mem) {
  mem.fill(0x00, USER_MEM_ADDR, USER_MEM_ADDR + 64);
  mem.set(INPUT_TOKENS, USER_MEM_ADDR);

  write24(mem, TEMP_MEM_PTR_ADDR, USER_MEM_ADDR);
  write24(mem, FPSBASE_ADDR, USER_MEM_ADDR);
  write24(mem, FPS_ADDR, USER_MEM_ADDR);
  write24(mem, NEW_DATA_PTR_ADDR, USER_MEM_ADDR);

  write24(mem, PARSE_SCAN_BASE_ADDR, USER_MEM_ADDR);
  write24(mem, PARSE_SCAN_CUR_ADDR, USER_MEM_ADDR);
  write24(mem, PARSE_SCAN_END_ADDR, USER_MEM_ADDR + INPUT_TOKENS.length - 1);
  write24(mem, SAVED_HL_ADDR, USER_MEM_ADDR);
  write24(mem, SAVED_SP_ADDR, USER_MEM_ADDR);
}

function writeReport(details) {
  const diffText = typeof details.diff === 'number' && Number.isFinite(details.diff)
    ? `${details.diff}`
    : 'n/a';

  const surprises = details.pass
    ? 'ParseInp returned to the fake return address and OP1 decoded as 5.0.'
    : (
      'ParseInp did not return cleanly to the fake return address under this minimal setup. ' +
      `Termination=${details.termination}, finalPc=${hex(details.finalPc ?? 0)}, ` +
      `blocks=${details.blockCount}. The head disassembly suggests a fixed-global parser contract, ` +
      `and 0xD02587 is a pointer cell (` + '`tempMem`' + `), not the token buffer itself.`
    );

  const report = `# Phase 25K - ParseInp Probe

## Goal

Attempt to call \`ParseInp\` at \`${hex(PARSEINP_ENTRY)}\` after cold-boot OS init, feed it tokenized \`2+3\`, and verify whether OP1 becomes \`5.0\`.

## Setup

- Cold-boot + \`postInitState\` copied from \`probe-phase25i-fpadd.mjs\`.
- Calling-convention finding: ${CALL_CONVENTION_FINDING}
- First 32 ROM bytes at \`${hex(PARSEINP_ENTRY)}\`: \`${PARSEINP_HEAD_BYTES}\`
- \`?tempMem\` in \`ti84pceg.inc\` is \`${hex(TEMP_MEM_PTR_ADDR)}\`, but that address is used as a 24-bit pointer slot. The actual seeded token buffer is \`?userMem = ${hex(USER_MEM_ADDR)}\`.
- HL was primed to \`${hex(details.hlBeforeCall)}\` defensively, but the observed setup is driven by the global pointer slots listed below.

## Input Bytes Seeded

- Buffer @ \`${hex(USER_MEM_ADDR)}\`: \`${details.inputBytes}\`
- \`tempMem\` / \`FPSbase\` / \`FPS\` / \`newDataPtr\`: \`${hex(details.tempMemPtr)}\` / \`${hex(details.fpsBasePtr)}\` / \`${hex(details.fpsPtr)}\` / \`${hex(details.newDataPtr)}\`
- Parser scan pointers \`0xD02317 / 0xD0231A / 0xD0231D\`: \`${hex(details.scanBasePtr)}\` / \`${hex(details.scanCurPtr)}\` / \`${hex(details.scanEndPtr)}\`
- Saved slots \`0xD007FA / 0xD008E0\`: \`${hex(details.savedHlPtr)}\` / \`${hex(details.savedSpPtr)}\`

## Observed

\`\`\`text
${details.observedOutput}
\`\`\`

## Observed OP1 Bytes

\`${details.op1Bytes}\`

## Result

- **${details.pass ? 'PASS' : 'FAIL'}**
- returnHit=${details.returnHit}
- got=${formatValue(details.got)}
- expected=${EXPECTED}
- diff=${diffText}
- termination=${details.termination}
- finalPc=${hex(details.finalPc ?? 0)}

## Surprises

${surprises}
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

  log('=== Phase 25K: ParseInp probe (tokenized 2+3, expect OP1=5.0) ===');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const bootResult = coldBoot(executor, cpu, mem);
  log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);

  postInitState(cpu, mem);
  primeParseState(mem);

  const memWrap = wrapMem(mem);
  writeReal(memWrap, OP1_ADDR, OP1_SENTINEL);

  cpu.hl = USER_MEM_ADDR;

  log(`finding: ${CALL_CONVENTION_FINDING}`);
  log(`head bytes @ ${hex(PARSEINP_ENTRY)}: ${PARSEINP_HEAD_BYTES}`);
  log(`input bytes @ ${hex(USER_MEM_ADDR)}: [${hexArray(INPUT_TOKENS)}]`);
  log(
    `pointers: temp=${hex(read24(mem, TEMP_MEM_PTR_ADDR))} fpsbase=${hex(read24(mem, FPSBASE_ADDR))} ` +
    `fps=${hex(read24(mem, FPS_ADDR))} new=${hex(read24(mem, NEW_DATA_PTR_ADDR))}`,
  );
  log(
    `scan ptrs: base=${hex(read24(mem, PARSE_SCAN_BASE_ADDR))} cur=${hex(read24(mem, PARSE_SCAN_CUR_ADDR))} ` +
    `end=${hex(read24(mem, PARSE_SCAN_END_ADDR))} savedHL=${hex(read24(mem, SAVED_HL_ADDR))} ` +
    `savedSP=${hex(read24(mem, SAVED_SP_ADDR))}`,
  );
  log(`OP1 pre-call [${hexBytes(mem, OP1_ADDR, 9)}]  (sentinel ${OP1_SENTINEL})`);
  log(`HL before call: ${hex(cpu.hl)}`);

  cpu.push(FAKE_RET);

  let finalPc = null;
  let blockCount = 0;
  let returnHit = false;
  let termination = 'unknown';
  const recentPcs = [];

  try {
    const result = executor.runFrom(PARSEINP_ENTRY, 'adl', {
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
        recentPcs.push(norm);
        if (recentPcs.length > 10) recentPcs.shift();
        if (norm === FAKE_RET) throw new Error('__RETURN_HIT__');
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
    } else {
      throw err;
    }
  }

  const op1Bytes = hexBytes(mem, OP1_ADDR, 9);
  let got = NaN;
  try {
    got = readReal(memWrap, OP1_ADDR);
  } catch (err) {
    got = `readReal error: ${err?.message ?? err}`;
  }

  const diff = typeof got === 'number' && Number.isFinite(got) ? Math.abs(got - EXPECTED) : null;
  const pass = returnHit && typeof diff === 'number' && diff <= TOLERANCE;

  log(`OP1 post-call [${op1Bytes}]`);
  log(`got=${formatValue(got)}  expected=${EXPECTED}  diff=${diff === null ? 'n/a' : diff}`);
  if (!returnHit) {
    log(`finalPc=${hex(finalPc ?? 0)}  blocks=${blockCount}  recent=${recentPcs.map((pc) => hex(pc)).join(' ')}`);
  }
  log(pass ? 'PASS' : 'FAIL');

  writeReport({
    pass,
    returnHit,
    got,
    diff,
    termination,
    finalPc,
    blockCount,
    hlBeforeCall: USER_MEM_ADDR,
    inputBytes: hexArray(INPUT_TOKENS),
    tempMemPtr: read24(mem, TEMP_MEM_PTR_ADDR),
    fpsBasePtr: read24(mem, FPSBASE_ADDR),
    fpsPtr: read24(mem, FPS_ADDR),
    newDataPtr: read24(mem, NEW_DATA_PTR_ADDR),
    scanBasePtr: read24(mem, PARSE_SCAN_BASE_ADDR),
    scanCurPtr: read24(mem, PARSE_SCAN_CUR_ADDR),
    scanEndPtr: read24(mem, PARSE_SCAN_END_ADDR),
    savedHlPtr: read24(mem, SAVED_HL_ADDR),
    savedSpPtr: read24(mem, SAVED_SP_ADDR),
    op1Bytes,
    observedOutput: quote(observed.join('\n')),
  });

  log(`report=${REPORT_PATH}`);
  process.exitCode = pass ? 0 : 1;
}

try {
  await main();
} catch (error) {
  const message = error?.stack || String(error);
  fs.writeFileSync(
    REPORT_PATH,
    `# Phase 25K - ParseInp FAILED\n\n\`\`\`text\n${message}\n\`\`\`\n`,
  );
  console.error(message);
  process.exitCode = 1;
}
