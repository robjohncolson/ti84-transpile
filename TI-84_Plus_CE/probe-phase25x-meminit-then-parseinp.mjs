#!/usr/bin/env node

/**
 * Phase 25X: Call MEM_INIT (0x09DEE0) to set up heap pointers, then call
 * ParseInp (0x099914) with OPS left at 0xD3FFFF (where MEM_INIT puts it).
 *
 * ROOT CAUSE OF PRIOR FAILURES:
 * All previous ParseInp probes set OPS (0xD02593) = token buffer address.
 * The parser's free-space check at 0x0820b5 computes OPS - FPS. When OPS < FPS,
 * free space = 0 -> ErrMemory (0x8E).
 *
 * THE FIX: Leave OPS at 0xD3FFFF. Put tokens through begPC/curPC/endPC
 * (0xD02317/0xD0231A/0xD0231D) instead.
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
const PARSEINP_ENTRY = 0x099914;
const OP1_ADDR = 0xd005f8;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

const TEMPMEM_ADDR = 0xd02587;
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMP_CNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;
const FLASH_SIZE_ADDR = 0xd025c5;

const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;

const TOKEN_BUFFER_ADDR = 0xd00800;
const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;
const MEMINIT_RET = 0x7ffff6;

const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]); // "2+3" + newline
const EXPECTED = 5.0;
const TOLERANCE = 1e-6;

const MEMINIT_BUDGET = 100000;
const PARSEINP_BUDGET = 1500000;
const MAX_LOOP_ITER = 8192;
const MILESTONE_INTERVAL = 100000;
const RECENT_PC_LIMIT = 64;

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
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

function hexArray(bytes) {
  return Array.from(bytes, (b) => (b & 0xff).toString(16).padStart(2, '0')).join(' ');
}

function wrapMem(mem) {
  return {
    write8(addr, val) { mem[addr] = val & 0xff; },
    read8(addr) { return mem[addr] & 0xff; },
  };
}

function snapshotPointers(mem) {
  return {
    tempMem: read24(mem, TEMPMEM_ADDR),
    fpsBase: read24(mem, FPSBASE_ADDR),
    fps: read24(mem, FPS_ADDR),
    opBase: read24(mem, OPBASE_ADDR),
    ops: read24(mem, OPS_ADDR),
    pTempCnt: read24(mem, PTEMP_CNT_ADDR),
    pTemp: read24(mem, PTEMP_ADDR),
    progPtr: read24(mem, PROGPTR_ADDR),
    newDataPtr: read24(mem, NEWDATA_PTR_ADDR),
    errSP: read24(mem, ERR_SP_ADDR),
    errNo: mem[ERR_NO_ADDR] & 0xff,
    flashSize: read24(mem, FLASH_SIZE_ADDR),
    begPC: read24(mem, BEGPC_ADDR),
    curPC: read24(mem, CURPC_ADDR),
    endPC: read24(mem, ENDPC_ADDR),
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
    `newDataPtr=${hex(s.newDataPtr)}`,
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

async function main() {
  const log = (line) => console.log(line);

  log('=== Phase 25X: MEM_INIT then ParseInp (OPS left at MEM_INIT value) ===');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // ---------- Cold boot ----------
  const bootResult = coldBoot(executor, cpu, mem);
  log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc ?? 0)}`);

  const postBootPointers = snapshotPointers(mem);
  log(`post-boot pointers: ${formatPointerSnapshot(postBootPointers)}`);

  // ---------- PHASE A: Call MEM_INIT ----------
  log('\n=== PHASE A: MEM_INIT (0x09DEE0) ===');

  prepareCallState(cpu, mem);
  // Push MEMINIT_RET as return address
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);

  let meminitSteps = 0;
  let meminitFinalPc = null;
  let meminitReturnHit = false;
  let meminitMissing = false;

  try {
    const result = executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: MEMINIT_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, mode, meta, step) {
        meminitFinalPc = pc & 0xffffff;
        meminitSteps = Math.max(meminitSteps, (step ?? 0) + 1);
        if (meminitFinalPc === MEMINIT_RET) throw new Error('__MEMINIT_RET__');
      },
      onMissingBlock(pc, mode, step) {
        meminitMissing = true;
        meminitFinalPc = pc & 0xffffff;
        meminitSteps = Math.max(meminitSteps, (step ?? 0) + 1);
        if (meminitFinalPc === MEMINIT_RET) throw new Error('__MEMINIT_RET__');
      },
    });
    meminitSteps = Math.max(meminitSteps, result.steps ?? 0);
    meminitFinalPc = result.lastPc ?? meminitFinalPc;
    log(`MEM_INIT done: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc ?? 0)}`);
  } catch (error) {
    if (error?.message === '__MEMINIT_RET__') {
      meminitReturnHit = true;
      log(`MEM_INIT returned to sentinel @ ${hex(MEMINIT_RET)} after ~${meminitSteps} steps`);
    } else {
      throw error;
    }
  }

  const postMeminitPointers = snapshotPointers(mem);
  log(`post-MEM_INIT pointers: ${formatPointerSnapshot(postMeminitPointers)}`);
  log(`  flashSize=${hex(postMeminitPointers.flashSize)}`);
  log(`  pTempCnt=${hex(postMeminitPointers.pTempCnt)}`);

  const iy71 = mem[0xd00080 + 71];
  log(`  IY+71 (0xD000C7): 0x${iy71.toString(16).padStart(2, '0')} (bit 7 = ${(iy71 >> 7) & 1})`);

  if (!meminitReturnHit) {
    log('\nMEM_INIT did not return! Aborting.');
    if (meminitMissing) log(`  (hit missing block at ${hex(meminitFinalPc ?? 0)})`);
    process.exit(1);
  }

  // Verify OPS is at the expected symTable end value
  const opsAfterMeminit = read24(mem, OPS_ADDR);
  const fpsAfterMeminit = read24(mem, FPS_ADDR);
  const freeSpace = opsAfterMeminit - fpsAfterMeminit;
  log(`\nFree space check: OPS=${hex(opsAfterMeminit)} - FPS=${hex(fpsAfterMeminit)} = ${freeSpace} bytes`);
  if (opsAfterMeminit <= fpsAfterMeminit) {
    log('WARNING: OPS <= FPS! Free space will be 0 -> ErrMemory expected!');
  }

  // ---------- PHASE B: ParseInp ----------
  log('\n=== PHASE B: ParseInp (0x099914) ===');

  // Place tokenized "2+3" at scratch area, separate from heap
  mem.fill(0x00, TOKEN_BUFFER_ADDR, TOKEN_BUFFER_ADDR + 0x80);
  mem.set(INPUT_TOKENS, TOKEN_BUFFER_ADDR);

  // CRITICAL: Do NOT touch OPS! It must stay at MEM_INIT's value (0xD3FFFF).
  // Point tokens through begPC/curPC/endPC instead.
  write24(mem, BEGPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, CURPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, ENDPC_ADDR, TOKEN_BUFFER_ADDR + INPUT_TOKENS.length - 1);

  log(`begPC=${hex(read24(mem, BEGPC_ADDR))} curPC=${hex(read24(mem, CURPC_ADDR))} endPC=${hex(read24(mem, ENDPC_ADDR))}`);
  log(`input bytes @ ${hex(TOKEN_BUFFER_ADDR)}: [${hexArray(INPUT_TOKENS)}]`);

  // Set up OP1 with real "A" variable: type=0x00, name="A"
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);

  // Prepare call state for ParseInp
  prepareCallState(cpu, mem);

  // Set up error handler frame
  write24(mem, cpu.sp, FAKE_RET);
  const errFrameBase = (cpu.sp - 6) & 0xffffff;
  mem.fill(0x00, errFrameBase, errFrameBase + 6);
  write24(mem, errFrameBase + 3, ERR_CATCH_ADDR);
  write24(mem, ERR_SP_ADDR, errFrameBase);
  mem[ERR_NO_ADDR] = 0x00;

  log(`SP=${hex(cpu.sp)}, errSP=${hex(read24(mem, ERR_SP_ADDR))}`);
  log(`main return frame @ ${hex(cpu.sp)}: [${hexBytes(mem, cpu.sp, 3)}]`);
  log(`error catch frame @ ${hex(errFrameBase)}: [${hexBytes(mem, errFrameBase, 6)}]`);

  const preParsePointers = snapshotPointers(mem);

  // Execute ParseInp
  let finalPc = null;
  let termination = 'unknown';
  let returnHit = false;
  let errCaught = false;
  let missingBlock = false;
  let stepCount = 0;
  const recentPcs = [];
  const milestones = [];
  let nextMilestone = MILESTONE_INTERVAL;

  const notePc = (pc, step) => {
    const norm = pc & 0xffffff;
    finalPc = norm;
    if (typeof step === 'number') stepCount = Math.max(stepCount, step + 1);

    if (typeof step === 'number' && step >= nextMilestone) {
      const snap = snapshotPointers(mem);
      const milestone = `${step} steps: PC=${hex(norm)} errNo=${hex(snap.errNo, 2)} FPS=${hex(snap.fps)} OPS=${hex(snap.ops)}`;
      milestones.push(milestone);
      console.log(`  [milestone] ${milestone}`);
      nextMilestone += MILESTONE_INTERVAL;
    }

    recentPcs.push(norm);
    if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
    if (norm === FAKE_RET) throw new Error('__RETURN_HIT__');
    if (norm === ERR_CATCH_ADDR) throw new Error('__ERR_CAUGHT__');
  };

  try {
    const result = executor.runFrom(PARSEINP_ENTRY, 'adl', {
      maxSteps: PARSEINP_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, mode, meta, step) {
        notePc(pc, step);
      },
      onMissingBlock(pc, mode, step) {
        missingBlock = true;
        notePc(pc, step);
      },
    });

    finalPc = result.lastPc ?? finalPc;
    termination = result.termination;
    stepCount = Math.max(stepCount, result.steps ?? 0);
    log(`ParseInp done: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc ?? 0)}`);
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

  // ---------- Results ----------
  const errNo = mem[ERR_NO_ADDR] & 0xff;
  const afterPointers = snapshotPointers(mem);
  const op1Bytes = hexBytes(mem, OP1_ADDR, 9);

  log(`\nerrNo after call: ${hex(errNo, 2)}`);
  log(`OP1 post-call @ ${hex(OP1_ADDR)}: [${op1Bytes}]`);

  let got = NaN;
  try {
    got = readReal(wrapMem(mem), OP1_ADDR);
  } catch (error) {
    got = `readReal error: ${error?.message ?? error}`;
  }
  log(`OP1 decoded via readReal: ${got}`);

  log(`\npost-ParseInp pointers: ${formatPointerSnapshot(afterPointers)}`);
  log(`  begPC=${hex(afterPointers.begPC)} curPC=${hex(afterPointers.curPC)} endPC=${hex(afterPointers.endPC)}`);

  if (milestones.length > 0) {
    log(`\nmilestones (${milestones.length}):`);
    milestones.forEach(m => log(`  ${m}`));
  }

  log(`\nlast 20 PCs: ${recentPcs.slice(-20).map(pc => hex(pc)).join(' ')}`);
  log(`stepCount=${stepCount} missingBlock=${missingBlock}`);

  // Verdict
  const diff = typeof got === 'number' && Number.isFinite(got) ? Math.abs(got - EXPECTED) : null;
  const numericMatch = typeof diff === 'number' && diff <= TOLERANCE;
  const pass = returnHit && errNo === 0x00 && numericMatch;
  const partial = !pass && (returnHit || errCaught);

  if (pass) {
    log(`\nPASS: ParseInp returned with no error, OP1=${got} (expected ${EXPECTED})`);
  } else if (partial && errNo === 0x00) {
    log(`\nPARTIAL-OK: ParseInp terminated (${termination}) with errNo=0x00 but OP1=${got}`);
  } else if (partial) {
    log(`\nPARTIAL: ParseInp terminated (${termination}) but errNo=${hex(errNo, 2)}`);
  } else {
    log(`\nFAIL: ParseInp hit max steps or missing block at PC=${hex(finalPc ?? 0)}`);
  }
}

try {
  await main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
