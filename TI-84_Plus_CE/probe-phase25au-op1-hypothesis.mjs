#!/usr/bin/env node

/**
 * Phase 25AU: OP1 hypothesis test.
 *
 * Direct ParseInp at 0x099914 succeeds with OP1=zeros. But the trampoline at
 * 0x0586E3 first calls 0x07FF81 which sets OP1[0]=0x05 (List type),
 * OP1[1..3]=0x000023. Hypothesis: ParseInp checks OP1 at entry and when
 * OP1[0]=0x05, it tries to look up the list variable (FindSym → allocator
 * loop) instead of parsing the token stream.
 *
 * Four scenarios, all direct ParseInp at 0x099914 with SP=0xD1A872:
 *   C (control):       OP1 = all zeros            → expect OP1=5.0, errNo=0x8D, ~918 steps
 *   D (List type):     OP1 = [05 23 00 ...]       → if fails, OP1 is root cause
 *   E (type only):     OP1 = [05 00 00 ...]       → does just the type byte trigger it?
 *   F (clear after):   set [05 23 00 ...] then clear to zeros → should match control
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { readReal } from './fp-real.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const MEMINIT_ENTRY = 0x09dee0;
const MEMINIT_RET = 0x7ffff6;
const PARSEINP_ENTRY = 0x099914;

const OP1_ADDR = 0xd005f8;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;
const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;
const TEMPMEM_ADDR = 0xd02587;
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const SCRATCH_TOKEN_BASE = 0xd00800;
const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);
const MEMINIT_BUDGET = 100000;
const CALL_BUDGET = 50000;
const MAX_LOOP_ITER = 8192;
const RECENT_PC_LIMIT = 40;

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0').toUpperCase()}`;
}

function read24(mem, addr) {
  return ((mem[addr] & 0xff) | ((mem[addr + 1] & 0xff) << 8) | ((mem[addr + 2] & 0xff) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

function hexBytes(mem, addr, len) {
  const parts = [];
  for (let i = 0; i < len; i++) parts.push((mem[addr + i] & 0xff).toString(16).padStart(2, '0'));
  return parts.join(' ');
}

function wrapMem(mem) {
  return {
    write8(addr, val) { mem[addr] = val & 0xff; },
    read8(addr) { return mem[addr] & 0xff; },
  };
}

function formatNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}` : String(value);
}

function snapshotPointers(mem) {
  return {
    tempMem: read24(mem, TEMPMEM_ADDR),
    fpsBase: read24(mem, FPSBASE_ADDR),
    fps: read24(mem, FPS_ADDR),
    opBase: read24(mem, OPBASE_ADDR),
    ops: read24(mem, OPS_ADDR),
    pTemp: read24(mem, PTEMP_ADDR),
    progPtr: read24(mem, PROGPTR_ADDR),
    newDataPtr: read24(mem, NEWDATA_PTR_ADDR),
    begPC: read24(mem, BEGPC_ADDR),
    curPC: read24(mem, CURPC_ADDR),
    endPC: read24(mem, ENDPC_ADDR),
    errSP: read24(mem, ERR_SP_ADDR),
    errNo: mem[ERR_NO_ADDR] & 0xff,
  };
}

function formatPointerSnapshot(s) {
  return [
    `tempMem=${hex(s.tempMem)}`,
    `FPSbase=${hex(s.fpsBase)}`,
    `FPS=${hex(s.fps)}`,
    `OPBase=${hex(s.opBase)}`,
    `OPS=${hex(s.ops)}`,
    `pTemp=${hex(s.pTemp)}`,
    `progPtr=${hex(s.progPtr)}`,
    `begPC=${hex(s.begPC)}`,
    `curPC=${hex(s.curPC)}`,
    `endPC=${hex(s.endPC)}`,
    `errSP=${hex(s.errSP)}`,
    `errNo=${hex(s.errNo, 2)}`,
  ].join(' ');
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

function createEnv() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const executor = createExecutor(BLOCKS, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
  });
  return { mem, executor, cpu: executor.cpu };
}

/**
 * Seed scenario using the EXACT validated-scratch pattern from probe-phase25ao.
 * Tokens at 0xD00800, endPC AT the final token byte (0xD00803), NOT past-end.
 */
function seedScenario(mem, cpu) {
  // Clear scratch area and write tokens
  mem.fill(0x00, SCRATCH_TOKEN_BASE, SCRATCH_TOKEN_BASE + 0x80);
  mem.set(INPUT_TOKENS, SCRATCH_TOKEN_BASE);

  // Set begPC/curPC/endPC — endPC points AT the last token byte (0x3F)
  write24(mem, BEGPC_ADDR, SCRATCH_TOKEN_BASE);
  write24(mem, CURPC_ADDR, SCRATCH_TOKEN_BASE);
  write24(mem, ENDPC_ADDR, SCRATCH_TOKEN_BASE + INPUT_TOKENS.length - 1); // 0xD00803

  // Clear OP1
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);

  // Set up return address on stack
  write24(mem, cpu.sp, FAKE_RET);

  // Error frame: errSP at sp-6, with ERR_CATCH_ADDR as handler
  const errFrameBase = (cpu.sp - 6) & 0xffffff;
  mem.fill(0x00, errFrameBase, errFrameBase + 6);
  write24(mem, errFrameBase + 3, ERR_CATCH_ADDR);
  write24(mem, ERR_SP_ADDR, errFrameBase);
  mem[ERR_NO_ADDR] = 0x00;

  return {
    mainSp: cpu.sp & 0xffffff,
    errFrameBase,
    mainReturnBytes: hexBytes(mem, cpu.sp, 3),
    errFrameBytes: hexBytes(mem, errFrameBase, 6),
  };
}

function runCall(executor, cpu, mem, { entry, returnPc, budget }) {
  let finalPc = null;
  let termination = 'unknown';
  let returnHit = false;
  let errCaught = false;
  let missingBlock = false;
  let stepCount = 0;
  const recentPcs = [];
  const milestones = [];

  const notePc = (pc, step) => {
    const norm = pc & 0xffffff;
    finalPc = norm;
    if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);

    if (norm === PARSEINP_ENTRY) {
      milestones.push({ pc: norm, step: stepCount, label: 'ParseInp' });
    }

    recentPcs.push(norm);
    if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
    if (norm === returnPc) throw new Error('__RETURN_HIT__');
    if (norm === ERR_CATCH_ADDR) throw new Error('__ERR_CAUGHT__');
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
      termination = 'return_hit';
      finalPc = returnPc;
    } else if (error?.message === '__ERR_CAUGHT__') {
      errCaught = true;
      termination = 'err_caught';
      finalPc = ERR_CATCH_ADDR;
    } else {
      throw error;
    }
  }

  let op1Decoded;
  try {
    op1Decoded = readReal(wrapMem(mem), OP1_ADDR);
  } catch (error) {
    op1Decoded = `readReal error: ${error?.message ?? error}`;
  }

  return {
    entry,
    returnHit,
    errCaught,
    missingBlock,
    termination,
    finalPc,
    stepCount,
    errNo: mem[ERR_NO_ADDR] & 0xff,
    op1Bytes: hexBytes(mem, OP1_ADDR, 9),
    op1Decoded,
    milestones,
    recentPcs: recentPcs.map((pc) => hex(pc)),
    after: snapshotPointers(mem),
  };
}

function runMemInit(executor, cpu, mem) {
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);

  const result = runCall(executor, cpu, mem, {
    entry: MEMINIT_ENTRY,
    returnPc: MEMINIT_RET,
    budget: MEMINIT_BUDGET,
  });

  if (!result.returnHit) {
    throw new Error(`MEM_INIT failed: termination=${result.termination} finalPc=${hex(result.finalPc ?? 0)}`);
  }

  return result;
}

// OP1 overrides for each scenario
const OP1_SCENARIOS = {
  'C (control)': {
    description: 'OP1 = all zeros (baseline)',
    op1Override: null, // no override — seedScenario already clears OP1
  },
  'D (List type)': {
    description: 'OP1 = [05 23 00 ...] (what 0x07FF81 sets)',
    op1Override: [0x05, 0x23, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  },
  'E (type only)': {
    description: 'OP1 = [05 00 00 ...] (type byte only, no variable name)',
    op1Override: [0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  },
  'F (clear after)': {
    description: 'Set [05 23 00 ...] then clear to zeros before ParseInp',
    op1Override: 'set-then-clear',
  },
};

function runScenario(label) {
  const scenario = OP1_SCENARIOS[label];
  const { mem, executor, cpu } = createEnv();
  coldBoot(executor, cpu, mem);
  runMemInit(executor, cpu, mem);
  const postMemInit = snapshotPointers(mem);

  prepareCallState(cpu, mem);
  const frame = seedScenario(mem, cpu);

  // Apply OP1 override
  if (scenario.op1Override === 'set-then-clear') {
    // First set the List-type OP1 (simulating what 0x07FF81 does)
    const listOp1 = [0x05, 0x23, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    for (let i = 0; i < 9; i++) mem[OP1_ADDR + i] = listOp1[i];
    // Then clear it back to zeros (the proposed fix)
    mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
  } else if (scenario.op1Override) {
    for (let i = 0; i < 9; i++) mem[OP1_ADDR + i] = scenario.op1Override[i];
  }

  const op1AtEntry = hexBytes(mem, OP1_ADDR, 9);
  const seeded = snapshotPointers(mem);

  const call = runCall(executor, cpu, mem, {
    entry: PARSEINP_ENTRY,
    returnPc: FAKE_RET,
    budget: CALL_BUDGET,
  });

  return { label, description: scenario.description, postMemInit, frame, seeded, op1AtEntry, call };
}

async function main() {
  const log = (line = '') => console.log(line);

  log('=== Phase 25AU: OP1 hypothesis test ===');
  log('Hypothesis: ParseInp checks OP1 at entry. OP1[0]=0x05 (List type) triggers');
  log('variable recall instead of token parsing, causing the trampoline failure.');
  log();
  log(`All scenarios: direct ParseInp at ${hex(PARSEINP_ENTRY)}, SP=0xD1A872`);
  log(`Seeding: tokens at ${hex(SCRATCH_TOKEN_BASE)}, endPC=${hex(SCRATCH_TOKEN_BASE + INPUT_TOKENS.length - 1)}`);
  log(`Tokens: [${Array.from(INPUT_TOKENS, b => b.toString(16).padStart(2, '0')).join(' ')}]`);
  log(`FAKE_RET=${hex(FAKE_RET)} ERR_CATCH=${hex(ERR_CATCH_ADDR)} budget=${CALL_BUDGET}`);
  log();

  const labels = Object.keys(OP1_SCENARIOS);
  const results = [];

  for (const label of labels) {
    log(`--- Scenario ${label} ---`);
    log(`  ${OP1_SCENARIOS[label].description}`);
    const r = runScenario(label);
    results.push(r);

    log(`  Cold boot + MEM_INIT complete.`);
    log(`  post-MEM_INIT: ${formatPointerSnapshot(r.postMemInit)}`);
    log(`  seeded:        ${formatPointerSnapshot(r.seeded)}`);
    log(`  frame: mainSP=${hex(r.frame.mainSp)} [${r.frame.mainReturnBytes}] errFrame=${hex(r.frame.errFrameBase)} [${r.frame.errFrameBytes}]`);
    log(`  OP1 at ParseInp entry: [${r.op1AtEntry}]`);

    if (r.call.milestones.length > 0) {
      for (const m of r.call.milestones) {
        log(`  MILESTONE: hit ${hex(m.pc)} (${m.label}) at step ${m.step}`);
      }
    }

    log(`  Result: termination=${r.call.termination} steps=${r.call.stepCount}`);
    log(`  finalPc=${hex(r.call.finalPc ?? 0)} returnHit=${r.call.returnHit} errCaught=${r.call.errCaught} missingBlock=${r.call.missingBlock}`);
    log(`  errNo=${hex(r.call.errNo, 2)} OP1=[${r.call.op1Bytes}] decoded=${formatNumber(r.call.op1Decoded)}`);
    log(`  After: ${formatPointerSnapshot(r.call.after)}`);
    log(`  Recent PCs: ${r.call.recentPcs.slice(-20).join(' ')}`);
    log();
  }

  log('=== SUMMARY TABLE ===');
  log('Scenario                | Termination  | Steps | errNo | OP1 decoded | OP1 at entry');
  log('------------------------|--------------|-------|-------|-------------|-------------');
  for (const r of results) {
    const lbl = r.label.padEnd(23);
    const term = r.call.termination.padEnd(12);
    const steps = String(r.call.stepCount).padEnd(5);
    const err = hex(r.call.errNo, 2).padEnd(5);
    const decoded = formatNumber(r.call.op1Decoded).padEnd(11);
    log(`${lbl} | ${term} | ${steps} | ${err} | ${decoded} | [${r.op1AtEntry}]`);
  }
  log();

  // Evaluate hypothesis
  const control = results[0]; // C
  const listType = results[1]; // D
  const typeOnly = results[2]; // E
  const clearAfter = results[3]; // F

  log('=== HYPOTHESIS EVALUATION ===');

  // Check control
  if (control.call.op1Decoded === 5 && control.call.errNo === 0x8d) {
    log('CONTROL OK: Scenario C matches expected (OP1=5.0, errNo=0x8D).');
  } else {
    log(`CONTROL MISMATCH: Scenario C returned OP1=${formatNumber(control.call.op1Decoded)} errNo=${hex(control.call.errNo, 2)} (expected 5.0, 0x8D).`);
  }

  // D vs C: does List-type OP1 cause failure?
  const dMatchesC = listType.call.op1Decoded === control.call.op1Decoded &&
                    listType.call.errNo === control.call.errNo &&
                    Math.abs(listType.call.stepCount - control.call.stepCount) < 50;
  if (dMatchesC) {
    log('D matches C: List-type OP1 does NOT affect ParseInp. Hypothesis REJECTED.');
  } else {
    log(`D differs from C: OP1=${formatNumber(listType.call.op1Decoded)} errNo=${hex(listType.call.errNo, 2)} steps=${listType.call.stepCount}`);
    log('  → List-type OP1 DOES affect ParseInp behavior!');
  }

  // E vs C: does just the type byte trigger it?
  const eMatchesC = typeOnly.call.op1Decoded === control.call.op1Decoded &&
                    typeOnly.call.errNo === control.call.errNo &&
                    Math.abs(typeOnly.call.stepCount - control.call.stepCount) < 50;
  if (eMatchesC) {
    log('E matches C: Type byte alone does NOT trigger alternate path.');
  } else {
    log(`E differs from C: OP1=${formatNumber(typeOnly.call.op1Decoded)} errNo=${hex(typeOnly.call.errNo, 2)} steps=${typeOnly.call.stepCount}`);
    log('  → Just the type byte triggers the alternate path!');
  }

  // F vs C: does clearing OP1 after pre-set fix it?
  const fMatchesC = clearAfter.call.op1Decoded === control.call.op1Decoded &&
                    clearAfter.call.errNo === control.call.errNo &&
                    Math.abs(clearAfter.call.stepCount - control.call.stepCount) < 50;
  if (fMatchesC) {
    log('F matches C: Clearing OP1 after pre-set restores correct behavior.');
  } else {
    log(`F differs from C: OP1=${formatNumber(clearAfter.call.op1Decoded)} errNo=${hex(clearAfter.call.errNo, 2)} steps=${clearAfter.call.stepCount}`);
    log('  → Clearing OP1 does NOT restore correct behavior (unexpected!)');
  }

  // Final verdict
  log();
  if (!dMatchesC && fMatchesC) {
    log('VERDICT: OP1 pre-set by 0x07FF81 IS the root cause of the trampoline failure.');
    log('FIX: Clear OP1 to zeros after 0x07FF81 and before ParseInp, or bypass 0x07FF81');
    log('entirely by entering at 0x099914 directly from the common tail.');
  } else if (dMatchesC) {
    log('VERDICT: OP1 content does NOT affect ParseInp. Root cause is elsewhere.');
  } else if (!dMatchesC && !fMatchesC) {
    log('VERDICT: OP1 affects ParseInp but clearing alone does not fix it.');
    log('The pre-set may have side effects beyond OP1 content.');
  }
}

try {
  await main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
