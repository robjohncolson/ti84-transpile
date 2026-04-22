#!/usr/bin/env node

/**
 * Phase 25L: FPSquare probe.
 *
 * Entry point: 0x07C8B3 (FPSquare, OP1 = OP1 * OP1)
 * Test:        OP1=7.0  =>  expect OP1=49.0
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25l-fpsquare-report.md');

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

const FPSQUARE_ENTRY = 0x07C8B3;
const OP1_ADDR = 0xD005F8;

const FAKE_RET = 0x7FFFFE;
const INSN_BUDGET = 200000;

const EXPECTED = 49.0;
const TOLERANCE = 1e-6;

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
  console.log('=== Phase 25L: FPSquare probe (OP1=7.0, expect 49.0) ===');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const bootResult = coldBoot(executor, cpu, mem);
  console.log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);

  postInitState(cpu, mem);

  const memWrap = wrapMem(mem);
  writeReal(memWrap, OP1_ADDR, 7.0);

  console.log(`OP1 pre-call [${hexBytes(mem, OP1_ADDR, 9)}]  (7.0)`);

  cpu.push(FAKE_RET);

  let finalPc = null;
  let blockCount = 0;
  let returnHit = false;

  try {
    const result = executor.runFrom(FPSQUARE_ENTRY, 'adl', {
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
  const pass = returnHit && Math.abs(got - EXPECTED) <= TOLERANCE;

  console.log(`OP1 post-call [${op1Bytes}]`);
  console.log(`got=${got}  expected=${EXPECTED}  diff=${Math.abs(got - EXPECTED)}`);
  console.log(pass ? 'PASS' : 'FAIL');

  const report = `# Phase 25L - FPSquare Probe

**Goal**: Verify that calling FPSquare at \`0x07C8B3\` with OP1=7.0 produces OP1=49.0.

**Setup**: Full OS cold-boot + postInitState (same sequence as probe-phase25i-fpadd). OP1 seeded via \`writeReal(7.0)\`. Fake return address \`${hex(FAKE_RET)}\` pushed on stack; execution stepped until PC equals that sentinel or ${INSN_BUDGET} instructions exhausted. Timer IRQ disabled via \`createPeripheralBus({ timerInterrupt: false })\`.

**Observed OP1 bytes**: \`${op1Bytes}\`

**Result**: got=${got}, expected=${EXPECTED} - **${pass ? 'PASS' : 'FAIL'}**

**Surprises**: ${returnHit ? 'FPSquare returned cleanly to the fake return address using the same minimal post-init state as the other phase25i math-entry probes.' : `FPSquare did NOT return within ${INSN_BUDGET} steps. Final PC=${hex(finalPc ?? 0)}. Blocks dispatched: ${blockCount}.`}
`;

  fs.writeFileSync(REPORT_PATH, report);
  console.log(`report=${REPORT_PATH}`);

  process.exitCode = pass ? 0 : 1;
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error);
  fs.writeFileSync(REPORT_PATH, `# Phase 25L - FPSquare FAILED\n\n\`\`\`\n${error.stack || error}\n\`\`\`\n`);
  process.exitCode = 1;
}
