#!/usr/bin/env node

/**
 * Phase 25Z: instrument the current 25X ParseInp path to answer whether
 * 0x061d00..0x061e40 is handled by lifted blocks or by the executor's
 * missing-block path.
 *
 * This intentionally reuses the same imports and boot + MEM_INIT pattern as
 * probe-phase25x-meminit-then-parseinp.mjs, but adds per-step ParseInp logging
 * plus focused accounting for the error-handler region.
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
const REGION_START = 0x061d00;
const REGION_END = 0x061e40;

const MEMINIT_BUDGET = 100000;
const PARSEINP_BUDGET = 1500000;
const MAX_LOOP_ITER = 8192;
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
    `errSP=${hex(s.errSP)}`,
    `errNo=${hex(s.errNo, 2)}`,
    `begPC=${hex(s.begPC)}`,
    `curPC=${hex(s.curPC)}`,
    `endPC=${hex(s.endPC)}`,
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
  const log = (line = '') => console.log(line);

  log('=== Phase 25Z: Executor fallback trace for ParseInp ===');
  log(`input bytes: [${hexArray(INPUT_TOKENS)}]`);

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const liftedStatus = [
    0x061db2,
    0x061dd1,
    0x061def,
    0x061e20,
    0x061e27,
  ].map((pc) => `${hex(pc)}=${BLOCKS[pc.toString(16).padStart(6, '0') + ':adl'] ? 'lifted' : 'missing'}`);

  log(`region lift status: ${liftedStatus.join(' ')}`);

  const bootResult = coldBoot(executor, cpu, mem);
  log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc ?? 0)}`);

  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);

  let meminitReturnHit = false;
  let meminitSteps = 0;
  let meminitFinalPc = 0;

  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: MEMINIT_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, mode, meta, step) {
        meminitFinalPc = pc & 0xffffff;
        meminitSteps = Math.max(meminitSteps, (step ?? 0) + 1);
        if (meminitFinalPc === MEMINIT_RET) throw new Error('__MEMINIT_RET__');
      },
      onMissingBlock(pc, mode, step) {
        meminitFinalPc = pc & 0xffffff;
        meminitSteps = Math.max(meminitSteps, (step ?? 0) + 1);
        if (meminitFinalPc === MEMINIT_RET) throw new Error('__MEMINIT_RET__');
      },
    });
  } catch (error) {
    if (error?.message === '__MEMINIT_RET__') {
      meminitReturnHit = true;
    } else {
      throw error;
    }
  }

  if (!meminitReturnHit) {
    throw new Error(`MEM_INIT failed to return; lastPc=${hex(meminitFinalPc)}`);
  }

  log(`MEM_INIT returned after ~${meminitSteps} steps`);
  log(`post-MEM_INIT pointers: ${formatPointerSnapshot(snapshotPointers(mem))}`);

  mem.fill(0x00, TOKEN_BUFFER_ADDR, TOKEN_BUFFER_ADDR + 0x80);
  mem.set(INPUT_TOKENS, TOKEN_BUFFER_ADDR);
  write24(mem, BEGPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, CURPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, ENDPC_ADDR, TOKEN_BUFFER_ADDR + INPUT_TOKENS.length - 1);

  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);

  prepareCallState(cpu, mem);

  write24(mem, cpu.sp, FAKE_RET);
  const errFrameBase = (cpu.sp - 6) & 0xffffff;
  mem.fill(0x00, errFrameBase, errFrameBase + 6);
  write24(mem, errFrameBase + 3, ERR_CATCH_ADDR);
  write24(mem, ERR_SP_ADDR, errFrameBase);
  mem[ERR_NO_ADDR] = 0x00;

  log(`main return frame @ ${hex(cpu.sp)}: [${hexBytes(mem, cpu.sp, 3)}]`);
  log(`minimal err frame @ ${hex(errFrameBase)}: [${hexBytes(mem, errFrameBase, 6)}]`);
  log(`pre-ParseInp pointers: ${formatPointerSnapshot(snapshotPointers(mem))}`);

  const trace = [];
  const regionTrace = [];
  const missingEvents = [];
  const recentPcs = [];
  let stepCount = 0;
  let finalPc = 0;
  let returnHit = false;
  let errCaught = false;
  let termination = 'unknown';

  const notePc = (kind, pc, mode, step) => {
    const norm = pc & 0xffffff;
    const key = norm.toString(16).padStart(6, '0') + ':' + mode;
    const entry = {
      step: step ?? 0,
      kind,
      pc: norm,
      mode,
      lifted: !!BLOCKS[key],
    };

    trace.push(entry);
    stepCount = Math.max(stepCount, (step ?? 0) + 1);
    finalPc = norm;
    recentPcs.push(norm);
    if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();

    const regionMark = norm >= REGION_START && norm <= REGION_END ? ' [region]' : '';
    log(`[${String(entry.step).padStart(4, '0')}] ${kind.toUpperCase().padEnd(7, ' ')} ${hex(norm)}:${mode}${regionMark}`);

    if (norm >= REGION_START && norm <= REGION_END) {
      regionTrace.push(entry);
    }
    if (kind === 'missing') {
      missingEvents.push(entry);
    }

    if (norm === FAKE_RET) throw new Error('__RETURN_HIT__');
    if (norm === ERR_CATCH_ADDR) throw new Error('__ERR_CAUGHT__');
  };

  try {
    const result = executor.runFrom(PARSEINP_ENTRY, 'adl', {
      maxSteps: PARSEINP_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, mode, meta, step) {
        notePc('block', pc, mode, step);
      },
      onMissingBlock(pc, mode, step) {
        notePc('missing', pc, mode, step);
      },
    });

    stepCount = Math.max(stepCount, result.steps ?? 0);
    finalPc = result.lastPc ?? finalPc;
    termination = result.termination ?? termination;
  } catch (error) {
    if (error?.message === '__RETURN_HIT__') {
      returnHit = true;
      termination = 'return_hit';
      finalPc = FAKE_RET;
    } else if (error?.message === '__ERR_CAUGHT__') {
      errCaught = true;
      termination = 'err_caught';
      finalPc = ERR_CATCH_ADDR;
    } else {
      throw error;
    }
  }

  const regionCounts = {};
  for (const entry of regionTrace) {
    const key = `${hex(entry.pc)}:${entry.kind}`;
    regionCounts[key] = (regionCounts[key] || 0) + 1;
  }

  let op1Value = NaN;
  try {
    op1Value = readReal(wrapMem(mem), OP1_ADDR);
  } catch (error) {
    op1Value = `readReal error: ${error?.message ?? error}`;
  }

  log('');
  log('=== Summary ===');
  log(`termination=${termination} returnHit=${returnHit} errCaught=${errCaught}`);
  log(`stepCount=${stepCount} finalPc=${hex(finalPc)}`);
  log(`errNo=${hex(mem[ERR_NO_ADDR] & 0xff, 2)} OP1=${op1Value}`);
  log(`post-ParseInp pointers: ${formatPointerSnapshot(snapshotPointers(mem))}`);
  log(`region steps=${regionTrace.length}`);
  log(`region transpiled steps=${regionTrace.filter((entry) => entry.kind === 'block').length}`);
  log(`region missing steps=${regionTrace.filter((entry) => entry.kind === 'missing').length}`);
  log(`region PCs=${regionTrace.map((entry) => `${hex(entry.pc)}:${entry.kind}`).join(' ') || '(none)'}`);
  log(`region counts=${JSON.stringify(regionCounts)}`);
  log(`all missing events=${missingEvents.map((entry) => `${hex(entry.pc)}@${entry.step}`).join(' ') || '(none)'}`);
  log(`recent PCs=${recentPcs.map((pc) => hex(pc)).join(' ')}`);
}

try {
  await main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
