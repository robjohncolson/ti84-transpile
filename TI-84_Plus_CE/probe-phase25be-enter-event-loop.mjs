#!/usr/bin/env node

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
const COMMON_TAIL_ENTRY = 0x0586ce;
const COMMON_TAIL_CALLSITE = 0x0586e3;
const COMMON_TAIL_POST_PARSE = 0x0586f3;
const PARSEINP_TRAMPOLINE = 0x099910;
const PARSEINP_PREFUNC = 0x07ff81;
const PARSEINP_ENTRY = 0x099914;
const POST_PARSE_CALL_05822A = 0x05822a;
const POST_PARSE_CALL_083623 = 0x083623;
const POST_PARSE_CALL_083764 = 0x083764;

const USERMEM_ADDR = 0xd1a881;
const TOKEN_BUFFER_ADDR = 0xd00800;
const EMPTY_VAT_ADDR = 0xd3ffff;
const OP1_ADDR = 0xd005f8;
const ERR_NO_ADDR = 0xd008df;
// PushErrorHandler stores errSP here in the ROM and in the existing probes.
const ERR_SP_ADDR = 0xd008e0;
const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;
const FPSBASE_ADDR = 0xd0258a;
const FPS_ADDR = 0xd0258d;
const OPBASE_ADDR = 0xd02590;
const OPS_ADDR = 0xd02593;
const PTEMPCNT_ADDR = 0xd02596;
const PTEMP_ADDR = 0xd0259a;
const PROGPTR_ADDR = 0xd0259d;
const NEWDATA_PTR_ADDR = 0xd025a0;

const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]);
const EXPECTED = 5.0;
const MEMINIT_BUDGET = 100000;
const MAX_LOOP_ITER = 8192;
const RECENT_PC_LIMIT = 48;
const TOLERANCE = 1e-6;

const SCENARIOS = [
  {
    id: 'A',
    label: 'Common-tail bypass',
    entry: COMMON_TAIL_ENTRY,
    budget: 2000000,
  },
  {
    id: 'B',
    label: 'Direct ParseInp control',
    entry: PARSEINP_ENTRY,
    budget: 2000000,
  },
];

const HIT_POINTS = new Map([
  [COMMON_TAIL_ENTRY, '0x0586CE'],
  [COMMON_TAIL_CALLSITE, '0x0586E3'],
  [COMMON_TAIL_POST_PARSE, '0x0586F3'],
  [PARSEINP_TRAMPOLINE, '0x099910'],
  [PARSEINP_PREFUNC, '0x07FF81'],
  [PARSEINP_ENTRY, '0x099914'],
  [POST_PARSE_CALL_05822A, '0x05822A'],
  [POST_PARSE_CALL_083623, '0x083623'],
  [POST_PARSE_CALL_083764, '0x083764'],
  [FAKE_RET, '0x7FFFFE'],
  [ERR_CATCH_ADDR, '0x7FFFFA'],
]);

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
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
  const bytes = [];
  for (let i = 0; i < len; i += 1) {
    bytes.push((mem[(addr + i) & 0xffffff] & 0xff).toString(16).toUpperCase().padStart(2, '0'));
  }
  return bytes.join(' ');
}

function memWrap(mem) {
  return {
    write8(addr, value) { mem[addr & 0xffffff] = value & 0xff; },
    read8(addr) { return mem[addr & 0xffffff] & 0xff; },
  };
}

function safeReadReal(mem, addr) {
  try {
    return readReal(memWrap(mem), addr);
  } catch (error) {
    return `readReal error: ${error?.message ?? error}`;
  }
}

function approxEqual(a, b) {
  return typeof a === 'number' && Number.isFinite(a) && Math.abs(a - b) <= TOLERANCE;
}

function formatValue(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(6).replace(/\.?0+$/, '')
    : String(value);
}

function createRuntime() {
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
  cpu._ix = 0xd1a860;
  cpu._hl = 0;
  cpu.bc = 0;
  cpu.de = 0;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xff, cpu.sp - 0x40, cpu.sp + 0x20);
}

function seedErrFrame(cpu, mem, ret, errRet = ERR_CATCH_ADDR, prev = 0) {
  cpu.sp -= 3;
  write24(mem, cpu.sp, ret);
  const base = (cpu.sp - 6) & 0xffffff;
  write24(mem, base, errRet);
  write24(mem, base + 3, prev);
  write24(mem, ERR_SP_ADDR, base);
  mem[ERR_NO_ADDR] = 0x00;
  return {
    mainReturnSp: cpu.sp & 0xffffff,
    mainReturnBytes: hexBytes(mem, cpu.sp, 3),
    errFrameBase: base,
    errFrameBytes: hexBytes(mem, base, 6),
  };
}

function seedScenario(cpu, mem) {
  mem.fill(0x00, TOKEN_BUFFER_ADDR, TOKEN_BUFFER_ADDR + 0x80);
  mem.set(INPUT_TOKENS, TOKEN_BUFFER_ADDR);

  write24(mem, BEGPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, CURPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, ENDPC_ADDR, TOKEN_BUFFER_ADDR + INPUT_TOKENS.length);

  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);

  write24(mem, OPBASE_ADDR, EMPTY_VAT_ADDR);
  write24(mem, OPS_ADDR, EMPTY_VAT_ADDR);
  mem.fill(0x00, PTEMPCNT_ADDR, PTEMPCNT_ADDR + 4);
  write24(mem, PTEMP_ADDR, EMPTY_VAT_ADDR);
  write24(mem, PROGPTR_ADDR, EMPTY_VAT_ADDR);
  write24(mem, FPSBASE_ADDR, USERMEM_ADDR);
  write24(mem, FPS_ADDR, USERMEM_ADDR);
  write24(mem, NEWDATA_PTR_ADDR, USERMEM_ADDR);

  const errFrame = seedErrFrame(cpu, mem, FAKE_RET, ERR_CATCH_ADDR, 0);

  return errFrame;
}

function createHitMap() {
  const hits = new Map();
  for (const [pc, label] of HIT_POINTS) {
    hits.set(pc, { pc, label, count: 0, firstStep: null });
  }
  return hits;
}

function recordHit(hits, pc, stepNumber) {
  const hit = hits.get(pc);
  if (!hit) return;
  hit.count += 1;
  if (hit.firstStep === null) hit.firstStep = stepNumber;
}

function summarizeHits(hits) {
  return [...hits.values()]
    .filter((hit) => hit.count > 0)
    .sort((a, b) => (a.firstStep ?? Number.MAX_SAFE_INTEGER) - (b.firstStep ?? Number.MAX_SAFE_INTEGER));
}

function formatHits(hits) {
  const summary = summarizeHits(hits);
  if (summary.length === 0) return '(none)';
  return summary.map((hit) => `${hit.label}@${hit.firstStep}${hit.count > 1 ? `x${hit.count}` : ''}`).join(' ');
}

function runWithSentinel(executor, cpu, mem, { entry, budget, returnPc, hits = null }) {
  let finalPc = entry & 0xffffff;
  let termination = 'unknown';
  let returnHit = false;
  let errCaught = false;
  let missingBlock = false;
  let loopsForced = 0;
  let stepCount = 0;
  const recentPcs = [];

  const notePc = (pc, step) => {
    const norm = pc & 0xffffff;
    const stepNumber = (step ?? 0) + 1;
    finalPc = norm;
    stepCount = Math.max(stepCount, stepNumber);
    if (hits) recordHit(hits, norm, stepNumber);
    recentPcs.push(norm);
    if (recentPcs.length > RECENT_PC_LIMIT) recentPcs.shift();
    if (norm === returnPc) throw new Error('__RET__');
    if (norm === ERR_CATCH_ADDR) throw new Error('__ERR__');
  };

  try {
    const result = executor.runFrom(entry, 'adl', {
      maxSteps: budget,
      maxLoopIterations: MAX_LOOP_ITER,
      onLoopBreak() {
        loopsForced += 1;
      },
      onBlock(pc, _mode, _meta, step) {
        notePc(pc, step);
      },
      onMissingBlock(pc, _mode, step) {
        missingBlock = true;
        notePc(pc, step);
      },
    });

    finalPc = (result.lastPc ?? finalPc) & 0xffffff;
    termination = result.termination ?? termination;
    stepCount = Math.max(stepCount, result.steps ?? 0);
    loopsForced = Math.max(loopsForced, result.loopsForced ?? 0);
    if ((result.missingBlocks?.length ?? 0) > 0 || termination === 'missing_block') {
      missingBlock = true;
    }
  } catch (error) {
    if (error?.message === '__RET__') {
      returnHit = true;
      termination = 'return_hit';
      finalPc = returnPc;
    } else if (error?.message === '__ERR__') {
      errCaught = true;
      termination = 'err_caught';
      finalPc = ERR_CATCH_ADDR;
    } else {
      throw error;
    }
  }

  return {
    termination,
    finalPc,
    stepCount,
    returnHit,
    errCaught,
    missingBlock,
    loopsForced,
    recentPcs: recentPcs.map((pc) => hex(pc)),
    errNo: mem[ERR_NO_ADDR] & 0xff,
    op1Bytes: hexBytes(mem, OP1_ADDR, 9),
    op1Decoded: safeReadReal(mem, OP1_ADDR),
  };
}

function runMemInit(executor, cpu, mem) {
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  return runWithSentinel(executor, cpu, mem, {
    entry: MEMINIT_ENTRY,
    budget: MEMINIT_BUDGET,
    returnPc: MEMINIT_RET,
  });
}

function runScenario(scenario) {
  const { mem, executor, cpu } = createRuntime();
  coldBoot(executor, cpu, mem);

  const memInit = runMemInit(executor, cpu, mem);
  if (!memInit.returnHit) {
    throw new Error(`MEM_INIT failed for scenario ${scenario.id}: ${memInit.termination} @ ${hex(memInit.finalPc)}`);
  }

  prepareCallState(cpu, mem);
  const seeded = seedScenario(cpu, mem);  // seedErrFrame called inside, after prepareCallState
  const hits = createHitMap();
  const run = runWithSentinel(executor, cpu, mem, {
    entry: scenario.entry,
    budget: scenario.budget,
    returnPc: FAKE_RET,
    hits,
  });

  const parseHit = summarizeHits(hits).some((hit) => hit.pc === PARSEINP_ENTRY);
  const op1Is5 = approxEqual(run.op1Decoded, EXPECTED);
  const pass = scenario.id === 'B'
    ? run.returnHit && parseHit && op1Is5 && run.errNo === 0x8d
    : run.returnHit && parseHit && op1Is5;

  return {
    ...scenario,
    memInit,
    seeded,
    run,
    parseHit,
    pass,
    hits,
  };
}

function printScenario(result) {
  const verdict = result.pass ? 'PASS' : 'FAIL';
  console.log(
    `${verdict} Scenario ${result.id} (${result.label}): steps=${result.run.stepCount} term=${result.run.termination} parseHit=${result.parseHit} returnHit=${result.run.returnHit} errNo=${hex(result.run.errNo, 2)} OP1=${formatValue(result.run.op1Decoded)}`,
  );
  console.log(`  hits: ${formatHits(result.hits)}`);
  console.log(`  OP1 bytes: [${result.run.op1Bytes}]`);
  if (!result.pass) {
    console.log(`  stuck: finalPc=${hex(result.run.finalPc)} missingBlock=${result.run.missingBlock} loopsForced=${result.run.loopsForced}`);
    console.log(`  recent: ${result.run.recentPcs.join(' ')}`);
  }
}

async function main() {
  console.log('=== Phase 25BE: ENTER Keypress Through Common-Tail / ParseInp Probe ===');
  console.log(`Setup: tokens=[${Array.from(INPUT_TOKENS, (b) => b.toString(16).toUpperCase().padStart(2, '0')).join(' ')}] @ ${hex(TOKEN_BUFFER_ADDR)} begPC=${hex(TOKEN_BUFFER_ADDR)} curPC=${hex(TOKEN_BUFFER_ADDR)} endPC=${hex(TOKEN_BUFFER_ADDR + INPUT_TOKENS.length)} timerInterrupt=false`);
  console.log(`Allocator seed: FPSbase/FPS=${hex(USERMEM_ADDR)} OPBase/OPS/pTemp/progPtr=${hex(EMPTY_VAT_ADDR)} FAKE_RET=${hex(FAKE_RET)}`);
  console.log('');

  const results = SCENARIOS.map((scenario) => runScenario(scenario));
  for (const result of results) {
    printScenario(result);
    console.log('');
  }

  const scenarioA = results.find((result) => result.id === 'A');
  const scenarioB = results.find((result) => result.id === 'B');

  console.log('Summary:');
  console.log(`  Scenario A reached ParseInp=${scenarioA?.parseHit} reached FAKE_RET=${scenarioA?.run.returnHit} OP1=${formatValue(scenarioA?.run.op1Decoded)}`);
  console.log(`  Scenario B baseline reached ParseInp=${scenarioB?.parseHit} reached FAKE_RET=${scenarioB?.run.returnHit} errNo=${hex(scenarioB?.run.errNo ?? 0, 2)} OP1=${formatValue(scenarioB?.run.op1Decoded)}`);

  process.exitCode = scenarioB?.pass ? 0 : 1;
}

try {
  await main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
