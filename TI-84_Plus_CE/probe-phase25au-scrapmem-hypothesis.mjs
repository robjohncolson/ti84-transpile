#!/usr/bin/env node

/**
 * Phase 25AU: scrapMem hypothesis test.
 *
 * The trampoline at 0x0586E3 calls 0x07FF81 which writes 0x23 to scrapMem
 * (0xD02AD7) via helper 0x04C940. In direct ParseInp, scrapMem stays 0x00.
 * This probe tests whether scrapMem is the root cause of the trampoline failure.
 *
 * Four scenarios, all DIRECT ParseInp at 0x099914 with baseline SP=0xD1A872:
 *   C:  control — OP1=zeros, scrapMem=0x00 (expect 918 steps, OP1=5.0, errNo=0x8D)
 *   S1: scrapMem only — OP1=zeros, scrapMem[0xD02AD7]=0x23
 *   S2: OP1 + scrapMem — OP1=[05 23 00...], scrapMem=0x23
 *   S3: full trampoline state — S2 + 0xD005F9=0x23 (belt-and-suspenders)
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

const SCRAPMEM_ADDR = 0xd02ad7;
const CHKFINDSYM = 0x08383d;
const ERROR_REGION_START = 0x061d3a;
const ERROR_REGION_END = 0x061d3f;

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

function seedScenario(mem, cpu) {
  // Clear scratch area and write tokens
  mem.fill(0x00, SCRATCH_TOKEN_BASE, SCRATCH_TOKEN_BASE + 0x80);
  mem.set(INPUT_TOKENS, SCRATCH_TOKEN_BASE);

  // Set begPC/curPC/endPC — endPC points AT the last token byte (0x3F)
  write24(mem, BEGPC_ADDR, SCRATCH_TOKEN_BASE);
  write24(mem, CURPC_ADDR, SCRATCH_TOKEN_BASE);
  write24(mem, ENDPC_ADDR, SCRATCH_TOKEN_BASE + INPUT_TOKENS.length - 1);

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
  let hitChkFindSym = false;
  let hitErrorRegion = false;
  const recentPcs = [];

  const notePc = (pc, step) => {
    const norm = pc & 0xffffff;
    finalPc = norm;
    if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);

    if (norm === CHKFINDSYM && !hitChkFindSym) hitChkFindSym = true;
    if (norm >= ERROR_REGION_START && norm <= ERROR_REGION_END && !hitErrorRegion) hitErrorRegion = true;

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
    hitChkFindSym,
    hitErrorRegion,
    scrapMemAfter: hexBytes(mem, SCRAPMEM_ADDR, 3),
    recentPcs: recentPcs.map((pc) => hex(pc)),
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

function runScenario(label, setupFn) {
  const { mem, executor, cpu } = createEnv();
  coldBoot(executor, cpu, mem);
  runMemInit(executor, cpu, mem);

  prepareCallState(cpu, mem);
  const frame = seedScenario(mem, cpu);

  // Apply scenario-specific overrides
  setupFn(mem);

  const op1Before = hexBytes(mem, OP1_ADDR, 9);
  const scrapBefore = hexBytes(mem, SCRAPMEM_ADDR, 3);

  const call = runCall(executor, cpu, mem, {
    entry: PARSEINP_ENTRY,
    returnPc: FAKE_RET,
    budget: CALL_BUDGET,
  });

  return { label, frame, op1Before, scrapBefore, call };
}

async function main() {
  const log = (line = '') => console.log(line);

  log('=== Phase 25AU: scrapMem hypothesis test ===');
  log(`All scenarios: DIRECT ParseInp at ${hex(PARSEINP_ENTRY)}, budget=${CALL_BUDGET}`);
  log(`Tokens: [${Array.from(INPUT_TOKENS, b => b.toString(16).padStart(2, '0')).join(' ')}] at ${hex(SCRATCH_TOKEN_BASE)}`);
  log(`SCRAPMEM_ADDR=${hex(SCRAPMEM_ADDR)} CHKFINDSYM=${hex(CHKFINDSYM)} ERROR_REGION=${hex(ERROR_REGION_START)}-${hex(ERROR_REGION_END)}`);
  log();

  const scenarios = [
    {
      label: 'C (control: OP1=zeros, scrapMem=0x00)',
      setup(mem) {
        // Default: OP1 already zeroed, scrapMem untouched (0x00 from seedScenario)
      },
    },
    {
      label: 'S1 (scrapMem only: scrapMem=0x23)',
      setup(mem) {
        // OP1 stays zeros; set scrapMem
        mem[SCRAPMEM_ADDR] = 0x23;
        mem[SCRAPMEM_ADDR + 1] = 0x00;
        mem[SCRAPMEM_ADDR + 2] = 0x00;
      },
    },
    {
      label: 'S2 (OP1 + scrapMem)',
      setup(mem) {
        // OP1 = [05 23 00 00 00 00 00 00 00] — matches what 0x07FF81 sets
        mem[OP1_ADDR] = 0x05;
        mem[OP1_ADDR + 1] = 0x23;
        mem[OP1_ADDR + 2] = 0x00;
        mem[OP1_ADDR + 3] = 0x00;
        mem[OP1_ADDR + 4] = 0x00;
        mem[OP1_ADDR + 5] = 0x00;
        mem[OP1_ADDR + 6] = 0x00;
        mem[OP1_ADDR + 7] = 0x00;
        mem[OP1_ADDR + 8] = 0x00;
        // scrapMem
        mem[SCRAPMEM_ADDR] = 0x23;
        mem[SCRAPMEM_ADDR + 1] = 0x00;
        mem[SCRAPMEM_ADDR + 2] = 0x00;
      },
    },
    {
      label: 'S3 (full trampoline state: S2 + HL@0xD005F9)',
      setup(mem) {
        // Same as S2
        mem[OP1_ADDR] = 0x05;
        mem[OP1_ADDR + 1] = 0x23;
        mem[OP1_ADDR + 2] = 0x00;
        mem[OP1_ADDR + 3] = 0x00;
        mem[OP1_ADDR + 4] = 0x00;
        mem[OP1_ADDR + 5] = 0x00;
        mem[OP1_ADDR + 6] = 0x00;
        mem[OP1_ADDR + 7] = 0x00;
        mem[OP1_ADDR + 8] = 0x00;
        // scrapMem
        mem[SCRAPMEM_ADDR] = 0x23;
        mem[SCRAPMEM_ADDR + 1] = 0x00;
        mem[SCRAPMEM_ADDR + 2] = 0x00;
        // HL value at 0xD005F9 (OP1+1) — already set above as OP1[1]=0x23, OP1[2]=0x00
        // This is belt-and-suspenders: 0xD005F9 = OP1_ADDR+1 which is already 0x23
      },
    },
  ];

  const results = [];

  for (const { label, setup } of scenarios) {
    log(`--- ${label} ---`);
    const r = runScenario(label, setup);
    results.push(r);

    log(`  Before: OP1=[${r.op1Before}] scrapMem=[${r.scrapBefore}]`);
    log(`  Result: termination=${r.call.termination} steps=${r.call.stepCount}`);
    log(`  errNo=${hex(r.call.errNo, 2)} OP1=[${r.call.op1Bytes}] decoded=${formatNumber(r.call.op1Decoded)}`);
    log(`  ChkFindSym=${r.call.hitChkFindSym ? 'YES' : 'no'} ErrorRegion=${r.call.hitErrorRegion ? 'YES' : 'no'}`);
    log(`  scrapMem after=[${r.call.scrapMemAfter}]`);
    log(`  finalPc=${hex(r.call.finalPc ?? 0)} returnHit=${r.call.returnHit} errCaught=${r.call.errCaught}`);
    log(`  Recent PCs: ${r.call.recentPcs.slice(-15).join(' ')}`);
    log();
  }

  // Summary
  log('=== SUMMARY ===');
  const control = results[0];
  const controlPass = control.call.op1Decoded === 5 && control.call.errNo === 0x8d;

  for (const r of results) {
    const match = r.call.op1Decoded === 5 && r.call.errNo === 0x8d;
    const tag = match ? 'PASS' : 'FAIL';
    log(`Scenario ${r.label.split(' ')[0]}: steps=${r.call.stepCount} errNo=${hex(r.call.errNo, 2)} OP1=${formatNumber(r.call.op1Decoded)} ChkFindSym=${r.call.hitChkFindSym ? 'yes' : 'no'} Error=${r.call.hitErrorRegion ? 'yes' : 'no'} → ${tag}`);
  }
  log();

  if (!controlPass) {
    log('CONTROL FAILED — cannot draw conclusions. Control expected OP1=5.0, errNo=0x8D.');
    return;
  }

  log('CONTROL OK: C matches expected (OP1=5.0, errNo=0x8D).');

  // Check if any S scenario fails
  const s1 = results[1];
  const s2 = results[2];
  const s3 = results[3];
  const s1Pass = s1.call.op1Decoded === 5 && s1.call.errNo === 0x8d;
  const s2Pass = s2.call.op1Decoded === 5 && s2.call.errNo === 0x8d;
  const s3Pass = s3.call.op1Decoded === 5 && s3.call.errNo === 0x8d;

  if (!s1Pass || !s2Pass || !s3Pass) {
    log('CONCLUSION: scrapMem IS the root cause (or contributes to it).');
    if (!s1Pass) log('  S1 failed: scrapMem ALONE triggers the error.');
    if (s1Pass && !s2Pass) log('  S2 failed: scrapMem + OP1 together trigger the error.');
    if (s1Pass && s2Pass && !s3Pass) log('  S3 failed: full trampoline RAM state triggers the error.');
  } else {
    log('CONCLUSION: scrapMem is NOT the root cause. All scenarios pass.');
    log('  The error must come from something else in the trampoline path (register state, stack contents, etc.).');
  }
}

try {
  await main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
