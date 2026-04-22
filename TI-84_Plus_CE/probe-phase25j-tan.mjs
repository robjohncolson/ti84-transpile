#!/usr/bin/env node

/**
 * Phase 25J: Tan probe.
 *
 * Entry point: 0x07E5D8 (Tan, OP1 = tan(OP1) in radians)
 * Test:        OP1=pi/4  =>  expect OP1=1.0
 *
 * Non-identity input actually exercises the transcendental engine
 * (tan(0)=0 is a false-positive trap; the probe would PASS even if
 * _Tan were a no-op). PASS also requires returnHit.
 *
 * Addresses (ti84pceg.inc):
 *   OP1 = 0xD005F8
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor }    from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { writeReal, readReal } from './fp-real.mjs';

const __dirname   = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase25j-tan-report.md');

const romBytes  = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS    = romModule.PRELIFTED_BLOCKS;

// ---- constants -------------------------------------------------------------

const MEM_SIZE           = 0x1000000;
const BOOT_ENTRY         = 0x000000;
const BOOT_MODE          = 'z80';
const BOOT_MAX_STEPS     = 20000;
const BOOT_MAX_LOOP_ITER = 32;
const STACK_RESET_TOP    = 0xD1A87E;
const KERNEL_INIT_ENTRY  = 0x08C331;
const POST_INIT_ENTRY    = 0x0802B2;

const TAN_ENTRY    = 0x07E5D8;
const OP1_ADDR     = 0xD005F8;

const FAKE_RET     = 0x7FFFFE;
const INSN_BUDGET  = 200000;

// tan(pi/4) = 1.0, tolerance 1e-6. Non-identity input — real trig exercise.
const INPUT     = Math.PI / 4;
const EXPECTED  = 1.0;
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
    read8(addr)       { return mem[addr] & 0xFF; },
  };
}

// ---- OS init ---------------------------------------------------------------

function coldBoot(executor, cpu, mem) {
  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITER,
  });

  cpu.halted = false;
  cpu.iff1   = 0;
  cpu.iff2   = 0;
  cpu.sp     = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', { maxSteps: 100000, maxLoopIterations: 10000 });

  cpu.mbase  = 0xD0;
  cpu._iy    = 0xD00080;
  cpu._hl    = 0;
  cpu.halted = false;
  cpu.iff1   = 0;
  cpu.iff2   = 0;
  cpu.sp     = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', { maxSteps: 100, maxLoopIterations: 32 });

  return result;
}

function postInitState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1   = 0;
  cpu.iff2   = 0;
  cpu.madl   = 1;              // force 24-bit ADL so cpu.push writes 3 bytes
  cpu._iy    = 0xD00080;
  cpu.f      = 0x40;
  cpu._ix    = 0xD1A860;
  cpu.sp     = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

// ---- main ------------------------------------------------------------------

async function main() {
  console.log('=== Phase 25J: Tan probe (OP1=pi/4, expect 1.0) ===');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor    = createExecutor(BLOCKS, mem, { peripherals });
  const cpu         = executor.cpu;

  const bootResult = coldBoot(executor, cpu, mem);
  console.log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc)}`);

  postInitState(cpu, mem);

  const memWrap = wrapMem(mem);
  writeReal(memWrap, OP1_ADDR, INPUT);

  console.log(`OP1 pre-call [${hexBytes(mem, OP1_ADDR, 9)}]  (pi/4 = ${INPUT})`);

  cpu.push(FAKE_RET);

  let finalPc    = null;
  let blockCount = 0;
  let returnHit  = false;

  try {
    const result = executor.runFrom(TAN_ENTRY, 'adl', {
      maxSteps:          INSN_BUDGET,
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
  const got      = readReal(memWrap, OP1_ADDR);
  const pass     = returnHit && Math.abs(got - EXPECTED) <= TOLERANCE;

  console.log(`OP1 post-call [${op1Bytes}]`);
  console.log(`got=${got}  expected=${EXPECTED}  diff=${Math.abs(got - EXPECTED)}`);
  console.log(pass ? 'PASS' : 'FAIL');

  // ---- report ---------------------------------------------------------------
  const report = `# Phase 25J — Tan Probe

**Goal**: Verify that calling Tan at \`0x07E5D8\` with OP1=pi/4 produces OP1=1.0. Non-identity input — genuinely exercises the transcendental engine.

**Setup**: Full OS cold-boot + postInitState (same sequence as probe-phase25h-b). \`cpu.madl=1\` forced before \`cpu.push(FAKE_RET)\`. OP1 seeded via \`writeReal(Math.PI/4)\`. Execution stepped until PC equals FAKE_RET \`${hex(FAKE_RET)}\` or ${INSN_BUDGET} instructions exhausted. Timer IRQ disabled via \`createPeripheralBus({ timerInterrupt: false })\`. **PASS requires both** returnHit AND value within tolerance — fixes prior false-positive.

**Observed OP1 bytes**: \`${op1Bytes}\`

**Result**: got=${got}, expected=${EXPECTED}, returnHit=${returnHit} — **${pass ? 'PASS' : 'FAIL'}**

**Surprises**: ${returnHit ? `Tan returned cleanly after ${blockCount} blocks. Cold-boot OS state was sufficient; angle mode defaults to radians without explicit flag setup.` : `Tan did NOT return within ${INSN_BUDGET} steps. Final PC=${hex(finalPc ?? 0)}. Blocks dispatched: ${blockCount}. This may indicate the angle-mode flag needs explicit setup, or Tan dispatches through additional OS machinery not anticipated.`}
`;

  fs.writeFileSync(REPORT_PATH, report);
  console.log(`report=${REPORT_PATH}`);

  process.exitCode = pass ? 0 : 1;
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error);
  fs.writeFileSync(REPORT_PATH, `# Phase 25J — Tan FAILED\n\n\`\`\`\n${error.stack || error}\n\`\`\`\n`);
  process.exitCode = 1;
}
