#!/usr/bin/env node

/**
 * Phase 25P: ParseInp retry with OPS seeded.
 *
 * Entry point: 0x099914 (ParseInp)
 * Test:        tokenized "2+3" via ?OPS => expect OP1=5.0
 *
 * Addresses (ti84pceg.inc + phase25o helper notes):
 *   OP1      = 0xD005F8
 *   asm_ram  = 0xD00687
 *   OPS      = 0xD02593
 *   userMem  = 0xD1A881
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { writeReal, readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25p-parseinp-ops-report.md');

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
const OPS_ADDR = 0xD02593;
const TOKEN_BUFFER_ADDR = 0xD1A881;

const FAKE_RET = 0x7FFFFE;
const INSN_BUDGET = 500000;
const MAX_LOOP_ITER = 8192;
const RECENT_PC_LIMIT = 50;

const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3F]);
const EXPECTED = 5.0;
const TOLERANCE = 1e-6;

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

// ---- OS init (same pattern as phase25o-fpmult) -----------------------------

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
  write24(mem, OPS_ADDR, TOKEN_BUFFER_ADDR);
}

function writeReport(details) {
  const diffText = typeof details.diff === 'number' && Number.isFinite(details.diff)
    ? `${details.diff}`
    : 'n/a';

  const report = `# Phase 25P - ParseInp OPS Probe

## Goal

Call \`ParseInp\` at \`${hex(PARSEINP_ENTRY)}\` after a cold boot, seed \`?OPS\` with a token buffer for \`2+3\`, and check whether \`OP1\` decodes to \`5.0\`.

## Setup

- Cold-boot and post-init sequence copied from \`probe-phase25o-fpmult.mjs\`
- Token buffer @ \`${hex(TOKEN_BUFFER_ADDR)}\`: \`${details.inputBytes}\`
- \`?OPS\` @ \`${hex(OPS_ADDR)}\` -> \`${hex(details.opsPtr)}\`
- \`?asm_ram\` @ \`${hex(ASM_RAM_ADDR)}\` -> \`${hex(details.asmRam, 2)}\`
- \`OP1\` @ \`${hex(OP1_ADDR)}\` pre-cleared to zero bytes
- \`IY\` set to \`${hex(details.iyBeforeCall)}\`
- Timer IRQ disabled; call budget = ${INSN_BUDGET} steps; loop cap = ${MAX_LOOP_ITER}

## Observed

\`\`\`text
${details.observedOutput}
\`\`\`

## Result

- **${details.pass ? 'PASS' : 'FAIL'}**
- returnHit=${details.returnHit}
- got=${formatValue(details.got)}
- expected=${EXPECTED}
- diff=${diffText}
- termination=${details.termination}
- finalPc=${hex(details.finalPc ?? 0)}

## State After Call

- OP1 bytes: \`${details.op1Bytes}\`
- OPS pointer: \`${hex(details.opsPtr)}\`
- asm_ram byte: \`${hex(details.asmRam, 2)}\`
- Last ${RECENT_PC_LIMIT} PCs: \`${details.recentPcs}\`
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

  log('=== Phase 25P: ParseInp retry with OPS seeded (tokenized 2+3) ===');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const bootResult = coldBoot(executor, cpu, mem);
  log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);

  postInitState(cpu, mem);
  primeProbeState(mem);

  const memWrap = wrapMem(mem);
  log(`input bytes @ ${hex(TOKEN_BUFFER_ADDR)}: [${hexArray(INPUT_TOKENS)}]`);
  log(`OPS pointer @ ${hex(OPS_ADDR)}: ${hex(read24(mem, OPS_ADDR))}`);
  log(`asm_ram @ ${hex(ASM_RAM_ADDR)}: ${hex(mem[ASM_RAM_ADDR] & 0xFF, 2)}`);
  log(`OP1 pre-call [${hexBytes(mem, OP1_ADDR, 9)}]`);
  log(`IY before call: ${hex(cpu._iy)}`);

  cpu.push(FAKE_RET);

  let finalPc = null;
  let blockCount = 0;
  let returnHit = false;
  let termination = 'unknown';
  const recentPcs = [];

  try {
    const result = executor.runFrom(PARSEINP_ENTRY, 'adl', {
      maxSteps: INSN_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        const norm = pc & 0xFFFFFF;
        cpu.pc = norm;
        finalPc = norm;
        blockCount++;
        recentPcs.push(norm);
        if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
        if (norm === FAKE_RET) throw new Error('__RETURN_HIT__');
      },
      onMissingBlock(pc) {
        const norm = pc & 0xFFFFFF;
        cpu.pc = norm;
        finalPc = norm;
        recentPcs.push(norm);
        if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
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
    log(`finalPc=${hex(finalPc ?? 0)}  blocks=${blockCount}  recent=${recentPcText(recentPcs)}`);
  }
  log(pass ? 'PASS' : 'FAIL');

  writeReport({
    pass,
    returnHit,
    got,
    diff,
    termination,
    finalPc,
    inputBytes: hexArray(INPUT_TOKENS),
    opsPtr: read24(mem, OPS_ADDR),
    asmRam: mem[ASM_RAM_ADDR] & 0xFF,
    iyBeforeCall: cpu._iy & 0xFFFFFF,
    op1Bytes,
    recentPcs: recentPcText(recentPcs),
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
    `# Phase 25P - ParseInp OPS Probe FAILED\n\n\`\`\`text\n${message}\n\`\`\`\n`,
  );
  console.error(message);
  process.exitCode = 1;
}
