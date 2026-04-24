#!/usr/bin/env node

/**
 * Phase 25AW: memory-state divergence probe at 0x099B18.
 *
 * Compares direct ParseInp runs that differ only in OP1 contents and whether
 * an error-catch frame is pre-installed in errSP.
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
const CHKFINDSYM_ENTRY = 0x099b18;
const CHKFINDSYM_BREAK_PC = 0x099b1c;
const ERROR_DISPATCH_PC = 0x061d3a;
const JERROR_PC = 0x061db2;
const ERROR_RESUME_PC = 0x099929;

const OP1_ADDR = 0xd005f8;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;
const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;

const SCRATCH_TOKEN_BASE = 0xd00800;
const SCRATCH_TOKEN_CLEAR_LEN = 0x80;
const FAKE_RET = 0x7ffffe;

const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);
const OP1_ZERO = Uint8Array.from([0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const OP1_LIST = Uint8Array.from([0x05, 0x00, 0x23, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const MEMINIT_BUDGET = 100000;
const DIRECT_PARSE_BUDGET = 2000;
const ERROR_PATH_BUDGET = 50000;
const MAX_LOOP_ITER = 8192;

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0').toUpperCase()}`;
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

function readBytes(mem, addr, len) {
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) out[i] = mem[(addr + i) & 0xffffff] & 0xff;
  return out;
}

function formatBytes(bytes) {
  return `[${Array.from(bytes, (b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ')}]`;
}

function wrapMem(mem) {
  return {
    write8(addr, val) { mem[addr & 0xffffff] = val & 0xff; },
    read8(addr) { return mem[addr & 0xffffff] & 0xff; },
  };
}

function formatValue(value) {
  return typeof value === 'number' && Number.isFinite(value) ? `${value}` : String(value);
}

function createEnv() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const executor = createExecutor(BLOCKS, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
  });
  return { mem, executor, cpu: executor.cpu };
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', {
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

  let returned = false;
  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: MEMINIT_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc) {
        if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__MEMINIT_RETURN__');
      },
      onMissingBlock(pc) {
        if ((pc & 0xffffff) === MEMINIT_RET) throw new Error('__MEMINIT_RETURN__');
      },
    });
  } catch (error) {
    if (error?.message === '__MEMINIT_RETURN__') {
      returned = true;
    } else {
      throw error;
    }
  }

  if (!returned) throw new Error('MEM_INIT did not return');
}

function seedParseInput(mem) {
  mem.fill(0x00, SCRATCH_TOKEN_BASE, SCRATCH_TOKEN_BASE + SCRATCH_TOKEN_CLEAR_LEN);
  mem.set(INPUT_TOKENS, SCRATCH_TOKEN_BASE);
  write24(mem, BEGPC_ADDR, SCRATCH_TOKEN_BASE);
  write24(mem, CURPC_ADDR, SCRATCH_TOKEN_BASE);
  write24(mem, ENDPC_ADDR, SCRATCH_TOKEN_BASE + INPUT_TOKENS.length - 1);
}

function seedMainReturn(mem, cpu) {
  write24(mem, cpu.sp, FAKE_RET);
}

function clearErrorState(mem) {
  write24(mem, ERR_SP_ADDR, 0x000000);
  mem[ERR_NO_ADDR] = 0x00;
}

function seedOp1(mem, bytes) {
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);
  mem.set(bytes, OP1_ADDR);
}

function installSyntheticErrorFrame(mem, cpu, catchAddr) {
  const errFrameBase = (cpu.sp - 6) & 0xffffff;
  mem.fill(0x00, errFrameBase, errFrameBase + 6);
  write24(mem, errFrameBase + 3, catchAddr);
  write24(mem, ERR_SP_ADDR, errFrameBase);
  mem[ERR_NO_ADDR] = 0x00;
  return errFrameBase;
}

function decodeOp1(mem) {
  const bytes = readBytes(mem, OP1_ADDR, 9);
  let decoded;
  try {
    decoded = readReal(wrapMem(mem), OP1_ADDR);
  } catch (error) {
    decoded = `readReal error: ${error?.message ?? error}`;
  }
  return { bytes, decoded };
}

function captureBreak(cpu, mem, stepNumber) {
  return {
    step: stepNumber,
    carry: cpu.f & 0x01,
    f: cpu.f & 0xff,
    a: cpu.a & 0xff,
    bc: cpu._bc & 0xffffff,
    de: cpu._de & 0xffffff,
    hl: cpu._hl & 0xffffff,
    op1: readBytes(mem, OP1_ADDR, 9),
  };
}

function formatTermination(result) {
  let text;
  switch (result.termination) {
    case 'return_hit':
      text = 'return_hit';
      break;
    case 'jp_c_error_dispatch':
      text = `jp c -> ${hex(ERROR_DISPATCH_PC)}`;
      break;
    case 'budget_exhausted':
      text = `budget_exhausted @ ${hex(result.finalPc)}`;
      break;
    case 'missing_block':
      text = `missing_block @ ${hex(result.finalPc)}`;
      break;
    default:
      text = `${result.termination} @ ${hex(result.finalPc)}`;
      break;
  }

  if (result.resumeAfterError) text += `, resumed @ ${hex(ERROR_RESUME_PC)}`;
  return text;
}

function runParseInp(executor, cpu, mem, { budget, stopOnErrorDispatch }) {
  let breakCapture = null;
  let steps = 0;
  let finalPc = PARSEINP_ENTRY;
  let termination = 'unknown';
  let missingBlock = false;
  let errorDispatchHit = false;
  let jerrorHit = false;
  let resumeAfterError = false;

  const visit = (pc, step) => {
    const norm = pc & 0xffffff;
    const stepNumber = (step ?? 0) + 1;
    steps = Math.max(steps, stepNumber);
    finalPc = norm;

    if (norm === CHKFINDSYM_BREAK_PC && breakCapture === null) {
      breakCapture = captureBreak(cpu, mem, stepNumber);
    }

    if (norm === ERROR_DISPATCH_PC) {
      errorDispatchHit = true;
      if (stopOnErrorDispatch) throw new Error('__ERROR_DISPATCH__');
    }

    if (norm === JERROR_PC) jerrorHit = true;
    if (norm === ERROR_RESUME_PC && errorDispatchHit) resumeAfterError = true;
    if (norm === FAKE_RET) throw new Error('__RETURN_HIT__');
  };

  try {
    const result = executor.runFrom(PARSEINP_ENTRY, 'adl', {
      maxSteps: budget,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _mode, _meta, step) {
        visit(pc, step);
      },
      onMissingBlock(pc, _mode, step) {
        missingBlock = true;
        visit(pc, step);
      },
    });

    steps = Math.max(steps, result.steps ?? 0);
    finalPc = (result.lastPc ?? finalPc) & 0xffffff;
    termination = result.termination ?? (missingBlock ? 'missing_block' : 'budget_exhausted');
  } catch (error) {
    if (error?.message === '__RETURN_HIT__') {
      termination = 'return_hit';
      finalPc = FAKE_RET;
    } else if (error?.message === '__ERROR_DISPATCH__') {
      termination = 'jp_c_error_dispatch';
      finalPc = ERROR_DISPATCH_PC;
    } else {
      throw error;
    }
  }

  return {
    breakCapture,
    steps,
    finalPc,
    termination,
    missingBlock,
    errorDispatchHit,
    jerrorHit,
    resumeAfterError,
    errNo: mem[ERR_NO_ADDR] & 0xff,
    finalOp1: decodeOp1(mem),
  };
}

function runScenario({ op1Bytes, budget, installCatch }) {
  const { mem, executor, cpu } = createEnv();

  coldBoot(executor, cpu, mem);
  runMemInit(executor, cpu, mem);
  prepareCallState(cpu, mem);
  seedParseInput(mem);
  seedMainReturn(mem, cpu);
  clearErrorState(mem);
  seedOp1(mem, op1Bytes);

  let errFrameBase = null;
  if (installCatch) {
    errFrameBase = installSyntheticErrorFrame(mem, cpu, ERROR_RESUME_PC);
  }

  const result = runParseInp(executor, cpu, mem, {
    budget,
    stopOnErrorDispatch: !installCatch,
  });

  if (!result.breakCapture) {
    throw new Error(`Failed to capture ${hex(CHKFINDSYM_BREAK_PC)} after ${hex(CHKFINDSYM_ENTRY)}.`);
  }

  return {
    ...result,
    errFrameBase,
  };
}

function printScenario(log, title, result) {
  const br = result.breakCapture;
  log(`=== ${title} ===`);
  log(`  At ${hex(CHKFINDSYM_BREAK_PC)}: carry=${br.carry}, F=${hex(br.f, 2)}, A=${hex(br.a, 2)}, HL=${hex(br.hl)}, DE=${hex(br.de)}, BC=${hex(br.bc)}`);
  log(`  OP1 at break: ${formatBytes(br.op1)}`);
  log(`  Final result: OP1=${formatValue(result.finalOp1.decoded)} bytes=${formatBytes(result.finalOp1.bytes)}, steps=${result.steps}, termination=${formatTermination(result)}`);
  if (result.errFrameBase !== null) {
    log(`  Synthetic errSP frame: base=${hex(result.errFrameBase)} catch=${hex(ERROR_RESUME_PC)} resumeAfterError=${result.resumeAfterError ? 'yes' : 'no'}`);
  }
  log();
}

async function main() {
  const log = (line = '') => console.log(line);

  const scenarioA = runScenario({
    op1Bytes: OP1_ZERO,
    budget: DIRECT_PARSE_BUDGET,
    installCatch: false,
  });

  const scenarioB = runScenario({
    op1Bytes: OP1_LIST,
    budget: DIRECT_PARSE_BUDGET,
    installCatch: false,
  });

  const scenarioC = runScenario({
    op1Bytes: OP1_LIST,
    budget: ERROR_PATH_BUDGET,
    installCatch: true,
  });

  printScenario(log, 'Scenario A: OP1=zeros (control)', scenarioA);
  printScenario(log, 'Scenario B: OP1=List pre-seed', scenarioB);
  printScenario(log, 'Scenario C: OP1=List + PushErrorHandler(0x099929)', scenarioC);

  const carryDivergence = scenarioA.breakCapture.carry !== scenarioB.breakCapture.carry;

  let rootCause;
  if (scenarioA.breakCapture.carry === 0 && scenarioB.breakCapture.carry === 1) {
    rootCause = 'OP1 content gates ChkFindSym. Zero OP1 does not take the not-found branch here, while List-preseed OP1 [05 00 23 ...] makes ChkFindSym search the post-MEM_INIT VAT for that symbol, miss, and set carry so 0x099B1C jumps to JError.';
    if (scenarioC.breakCapture.carry === 1 && scenarioC.resumeAfterError) {
      rootCause += ' Installing an errSP catch frame only changes post-error recovery; it does not change the carry outcome.';
    }
  } else {
    rootCause = `No expected carry split was observed at ${hex(CHKFINDSYM_BREAK_PC)}.`;
  }

  log('=== VERDICT ===');
  log(`  ChkFindSym carry divergence: ${carryDivergence ? 'yes' : 'no'}`);
  log(`  Root cause: ${rootCause}`);
}

await main();
