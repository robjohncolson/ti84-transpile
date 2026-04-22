#!/usr/bin/env node

/**
 * Phase 25Y: ParseInp probe with a full 18-byte PushErrorHandler frame and
 * token terminator variants.
 *
 * This keeps the 25X cold-boot + MEM_INIT setup, but swaps the minimal 6-byte
 * catch frame for the full ADL frame used by PushErrorHandler:
 *   SP+0  = 0x061E27 (normal-return cleanup stub)
 *   SP+3  = 0x061DD1 (error-restore stub)
 *   SP+6  = OPS - OPBase
 *   SP+9  = FPS - FPSbase
 *   SP+12 = previous errSP
 *   SP+15 = caller HL payload
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
const MEMINIT_RET = 0x7ffff6;
const FAKE_RET = 0x7ffffe;

const PUSH_ERROR_HANDLER_ERR_STUB = 0x061dd1;
const PUSH_ERROR_HANDLER_RET_STUB = 0x061e27;

const OP1_ADDR = 0xd005f8;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;

const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;

const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;

const TOKEN_BUFFER_ADDR = 0xd00800;
const TOKEN_BUFFER_CLEAR_LEN = 0x80;
const OP1_LEN = 9;

const MEMINIT_BUDGET = 100000;
const PARSEINP_BUDGET = 50000;
const MAX_LOOP_ITER = 8192;
const RECENT_PC_LIMIT = 64;

const VARIANTS = [
  {
    id: 'A',
    label: 'newline terminator',
    tokens: Uint8Array.from([0x32, 0x70, 0x33, 0x3f]),
  },
  {
    id: 'B',
    label: 'tEnter/arrow terminator',
    tokens: Uint8Array.from([0x32, 0x70, 0x33, 0x04]),
  },
  {
    id: 'C',
    label: 'null terminator',
    tokens: Uint8Array.from([0x32, 0x70, 0x33, 0x00]),
  },
];

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function hexArray(bytes) {
  return Array.from(bytes, (b) => (b & 0xff).toString(16).padStart(2, '0')).join(' ');
}

function hexBytes(mem, addr, len) {
  const parts = [];
  for (let i = 0; i < len; i++) {
    parts.push((mem[(addr + i) & 0xffffff] & 0xff).toString(16).padStart(2, '0'));
  }
  return parts.join(' ');
}

function read24(mem, addr) {
  return (
    (mem[(addr + 0) & 0xffffff] & 0xff) |
    ((mem[(addr + 1) & 0xffffff] & 0xff) << 8) |
    ((mem[(addr + 2) & 0xffffff] & 0xff) << 16)
  ) >>> 0;
}

function write24(mem, addr, value) {
  mem[(addr + 0) & 0xffffff] = value & 0xff;
  mem[(addr + 1) & 0xffffff] = (value >>> 8) & 0xff;
  mem[(addr + 2) & 0xffffff] = (value >>> 16) & 0xff;
}

function wrapMem(mem) {
  return {
    write8(addr, val) { mem[addr & 0xffffff] = val & 0xff; },
    read8(addr) { return mem[addr & 0xffffff] & 0xff; },
  };
}

function snapshotPointers(mem) {
  return {
    fpsBase: read24(mem, FPSBASE_ADDR),
    fps: read24(mem, FPS_ADDR),
    opBase: read24(mem, OPBASE_ADDR),
    ops: read24(mem, OPS_ADDR),
    pTemp: read24(mem, PTEMP_ADDR),
    progPtr: read24(mem, PROGPTR_ADDR),
    errSP: read24(mem, ERR_SP_ADDR),
    errNo: mem[ERR_NO_ADDR] & 0xff,
    begPC: read24(mem, BEGPC_ADDR),
    curPC: read24(mem, CURPC_ADDR),
    endPC: read24(mem, ENDPC_ADDR),
  };
}

function formatPointerSnapshot(snapshot) {
  return [
    `FPSbase=${hex(snapshot.fpsBase)}`,
    `FPS=${hex(snapshot.fps)}`,
    `OPBase=${hex(snapshot.opBase)}`,
    `OPS=${hex(snapshot.ops)}`,
    `pTemp=${hex(snapshot.pTemp)}`,
    `progPtr=${hex(snapshot.progPtr)}`,
    `errSP=${hex(snapshot.errSP)}`,
    `errNo=${hex(snapshot.errNo, 2)}`,
    `begPC=${hex(snapshot.begPC)}`,
    `curPC=${hex(snapshot.curPC)}`,
    `endPC=${hex(snapshot.endPC)}`,
  ].join(' ');
}

function formatValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return `${value}`;
  return String(value);
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

function runMemInit(executor, cpu, mem) {
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);

  let steps = 0;
  let finalPc = null;
  let termination = 'unknown';
  let returned = false;
  let missingBlock = false;

  try {
    const result = executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: MEMINIT_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _mode, _meta, step) {
        finalPc = pc & 0xffffff;
        steps = Math.max(steps, (step ?? 0) + 1);
        if (finalPc === MEMINIT_RET) throw new Error('__MEMINIT_RETURN__');
      },
      onMissingBlock(pc, _mode, step) {
        missingBlock = true;
        finalPc = pc & 0xffffff;
        steps = Math.max(steps, (step ?? 0) + 1);
        if (finalPc === MEMINIT_RET) throw new Error('__MEMINIT_RETURN__');
      },
    });

    finalPc = result.lastPc ?? finalPc;
    steps = Math.max(steps, result.steps ?? 0);
    termination = result.termination ?? termination;
  } catch (error) {
    if (error?.message === '__MEMINIT_RETURN__') {
      returned = true;
      finalPc = MEMINIT_RET;
      termination = 'return_hit';
    } else {
      throw error;
    }
  }

  return { returned, missingBlock, steps, finalPc, termination };
}

function setupTokens(mem, tokens) {
  mem.fill(0x00, TOKEN_BUFFER_ADDR, TOKEN_BUFFER_ADDR + TOKEN_BUFFER_CLEAR_LEN);
  mem.set(tokens, TOKEN_BUFFER_ADDR);
  write24(mem, BEGPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, CURPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, ENDPC_ADDR, TOKEN_BUFFER_ADDR + tokens.length - 1);
}

function buildFullErrFrame(cpu, mem) {
  const opsVal = read24(mem, OPS_ADDR);
  const opBaseVal = read24(mem, OPBASE_ADDR);
  const fpsVal = read24(mem, FPS_ADDR);
  const fpsBaseVal = read24(mem, FPSBASE_ADDR);

  const opsDelta = (opsVal - opBaseVal) & 0xffffff;
  const fpsDelta = (fpsVal - fpsBaseVal) & 0xffffff;
  const prevErrSP = 0x000000;
  const hlPayload = 0x000000;
  const fakeRetSp = cpu.sp & 0xffffff;

  cpu.sp -= 3;
  write24(mem, cpu.sp, hlPayload);
  cpu.sp -= 3;
  write24(mem, cpu.sp, prevErrSP);
  cpu.sp -= 3;
  write24(mem, cpu.sp, fpsDelta);
  cpu.sp -= 3;
  write24(mem, cpu.sp, opsDelta);
  cpu.sp -= 3;
  write24(mem, cpu.sp, PUSH_ERROR_HANDLER_ERR_STUB);
  cpu.sp -= 3;
  write24(mem, cpu.sp, PUSH_ERROR_HANDLER_RET_STUB);

  write24(mem, ERR_SP_ADDR, cpu.sp);

  return {
    frameBase: cpu.sp & 0xffffff,
    frameBytes: hexBytes(mem, cpu.sp, 18),
    fakeRetSp,
    fakeRetBytes: hexBytes(mem, fakeRetSp, 3),
    opsDelta,
    fpsDelta,
    prevErrSP,
    hlPayload,
  };
}

function runParseInp(executor, cpu, mem) {
  let finalPc = null;
  let steps = 0;
  let termination = 'unknown';
  let returnHit = false;
  let missingBlock = false;
  let cleanupStubHits = 0;
  let errorRestoreHits = 0;
  const recentPcs = [];

  try {
    const result = executor.runFrom(PARSEINP_ENTRY, 'adl', {
      maxSteps: PARSEINP_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _mode, _meta, step) {
        const norm = pc & 0xffffff;
        finalPc = norm;
        steps = Math.max(steps, (step ?? 0) + 1);
        recentPcs.push(norm);
        if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
        if (norm === PUSH_ERROR_HANDLER_RET_STUB) cleanupStubHits++;
        if (norm === PUSH_ERROR_HANDLER_ERR_STUB) errorRestoreHits++;
        if (norm === FAKE_RET) throw new Error('__PARSEINP_RETURN__');
      },
      onMissingBlock(pc, _mode, step) {
        missingBlock = true;
        const norm = pc & 0xffffff;
        finalPc = norm;
        steps = Math.max(steps, (step ?? 0) + 1);
        recentPcs.push(norm);
        if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
        if (norm === PUSH_ERROR_HANDLER_RET_STUB) cleanupStubHits++;
        if (norm === PUSH_ERROR_HANDLER_ERR_STUB) errorRestoreHits++;
        if (norm === FAKE_RET) throw new Error('__PARSEINP_RETURN__');
      },
    });

    finalPc = result.lastPc ?? finalPc;
    steps = Math.max(steps, result.steps ?? 0);
    termination = result.termination ?? termination;
  } catch (error) {
    if (error?.message === '__PARSEINP_RETURN__') {
      returnHit = true;
      finalPc = FAKE_RET;
      termination = 'return_hit';
    } else {
      throw error;
    }
  }

  return {
    finalPc,
    steps,
    termination,
    returnHit,
    missingBlock,
    cleanupStubHits,
    errorRestoreHits,
    recentPcs,
  };
}

function summarizeCurPc(beforeSnapshot, afterSnapshot) {
  const delta = ((afterSnapshot.curPC - beforeSnapshot.curPC) & 0xffffff) >>> 0;
  return {
    delta,
    advanced: afterSnapshot.curPC !== beforeSnapshot.curPC,
    pastEnd: afterSnapshot.curPC > beforeSnapshot.endPC,
  };
}

function printVariantResult(log, variant, result) {
  log(`\n=== Variant ${variant.id}: ${variant.label} ===`);
  log(`tokens: [${hexArray(variant.tokens)}]`);
  log(`MEM_INIT: returned=${result.memInit.returned} steps=${result.memInit.steps} term=${result.memInit.termination} finalPc=${hex(result.memInit.finalPc ?? 0)}`);
  log(`pre-ParseInp: ${formatPointerSnapshot(result.before)}`);
  log(`err frame @ ${hex(result.errFrame.frameBase)}: [${result.errFrame.frameBytes}]`);
  log(`  fakeRet @ ${hex(result.errFrame.fakeRetSp)}: [${result.errFrame.fakeRetBytes}]`);
  log(`  opsDelta=${hex(result.errFrame.opsDelta)} fpsDelta=${hex(result.errFrame.fpsDelta)} prevErrSP=${hex(result.errFrame.prevErrSP)} hlPayload=${hex(result.errFrame.hlPayload)}`);
  log(`ParseInp: steps=${result.parse.steps} term=${result.parse.termination} finalPc=${hex(result.parse.finalPc ?? 0)} returnHit=${result.parse.returnHit} missingBlock=${result.parse.missingBlock}`);
  log(`  cleanupStubHits=${result.parse.cleanupStubHits} errorRestoreHits=${result.parse.errorRestoreHits}`);
  log(`errNo=${hex(result.errNo, 2)} OP1=[${result.op1Bytes}] decoded=${formatValue(result.op1Decoded)}`);
  log(`post-ParseInp: ${formatPointerSnapshot(result.after)}`);
  log(`curPC movement: advanced=${result.curPc.advanced} delta=${hex(result.curPc.delta)} pastEnd=${result.curPc.pastEnd}`);
  log(`recent PCs: ${result.parse.recentPcs.length ? result.parse.recentPcs.map((pc) => hex(pc)).join(' ') : '(none)'}`);
}

function printSummary(log, results) {
  log('\n=== Summary ===');
  log('Variant | Terminator | errNo | OP1 | steps | term | curPC> endPC | cleanupStubHits | errorRestoreHits');
  log('------- | ---------- | ----- | --- | ----- | ---- | ------------ | --------------- | ----------------');

  for (const result of results) {
    log(
      `${result.id} | ${result.terminator} | ${hex(result.errNo, 2)} | ${formatValue(result.op1Decoded)} | ${result.steps} | ${result.termination} | ${result.curPcPastEnd} | ${result.cleanupStubHits} | ${result.errorRestoreHits}`,
    );
  }
}

async function main() {
  const log = (line = '') => console.log(line);

  log('=== Phase 25Y: ParseInp with full PushErrorHandler frame ===');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  const memWrap = wrapMem(mem);

  const bootResult = coldBoot(executor, cpu, mem);
  log(`boot: steps=${bootResult.steps} term=${bootResult.termination} lastPc=${hex(bootResult.lastPc ?? 0)}`);

  const results = [];

  for (const variant of VARIANTS) {
    const memInit = runMemInit(executor, cpu, mem);
    if (!memInit.returned) {
      throw new Error(`MEM_INIT did not return for variant ${variant.id}`);
    }

    setupTokens(mem, variant.tokens);
    mem.fill(0x00, OP1_ADDR, OP1_ADDR + OP1_LEN);

    prepareCallState(cpu, mem);
    cpu.sp -= 3;
    write24(mem, cpu.sp, FAKE_RET);
    const errFrame = buildFullErrFrame(cpu, mem);
    mem[ERR_NO_ADDR] = 0x00;

    const before = snapshotPointers(mem);
    const parse = runParseInp(executor, cpu, mem);
    const after = snapshotPointers(mem);
    const curPc = summarizeCurPc(before, after);

    let op1Decoded = NaN;
    try {
      op1Decoded = readReal(memWrap, OP1_ADDR);
    } catch (error) {
      op1Decoded = `readReal error: ${error?.message ?? error}`;
    }

    const result = {
      variant,
      memInit,
      errFrame,
      before,
      after,
      parse,
      curPc,
      errNo: mem[ERR_NO_ADDR] & 0xff,
      op1Bytes: hexBytes(mem, OP1_ADDR, OP1_LEN),
      op1Decoded,
    };

    printVariantResult(log, variant, result);

    results.push({
      id: variant.id,
      terminator: hex(variant.tokens[variant.tokens.length - 1], 2),
      errNo: result.errNo,
      op1Decoded: result.op1Decoded,
      steps: result.parse.steps,
      termination: result.parse.termination,
      curPcPastEnd: result.curPc.pastEnd,
      cleanupStubHits: result.parse.cleanupStubHits,
      errorRestoreHits: result.parse.errorRestoreHits,
    });
  }

  printSummary(log, results);
}

try {
  await main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
