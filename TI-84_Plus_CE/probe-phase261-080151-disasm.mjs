#!/usr/bin/env node

/**
 * Phase 261: 0x080151 gate function disassembly + dynamic verification
 *
 * 0x080151 is an 8-byte function:
 *   080151: E6 3F      AND 0x3F       ; A = A & 0x3F
 *   080153: FE 03      CP 0x03        ; compare with 3
 *   080155: C8         RET Z          ; return if match
 *   080156: FE 0B      CP 0x0B        ; compare with 11
 *   080158: C9         RET            ; return (Z if A&0x3F == 0x0B)
 *
 * B values that return Z: 0x03, 0x0B, 0x43, 0x4B, 0x83, 0x8B, 0xC3, 0xCB
 *
 * 0x062055 does `LD A,B` then `CALL 0x080151` then `JR NZ,alternate`.
 * With B=0 (session 260), it took the NZ path and crashed.
 * With B=3, it should pass the gate and reach cxMain.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MEM_SIZE = 0x1000000;

// Boot constants (same as phase 260)
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;

const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const MEM_INIT_RET = 0x7FFFF6;

const STAGE_1_ENTRY = 0x0A2B72;
const STAGE_2_ENTRY = 0x0A3301;
const STAGE_3_ENTRY = 0x0A29EC;
const STAGE_4_ENTRY = 0x0A2854;
const STAGE_MAX_LOOP_ITERATIONS = 500;

const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;

const GATE_ENTRY = 0x080151;
const GATE_RETURN = 0x7FFFFA;

const TRACE_ENTRY = 0x062055;
const TRACE_RETURN = 0x7FFFFE;
const TRACE_STEP_LIMIT = 500;
const TRACE_MAX_LOOP_ITERATIONS = 8192;

const MODE_BUF_START = 0xD020A6;
const DISPLAY_BUF_START = 0xD006C0;
const MODE_BUF_TEXT = 'Normal Float Radian       ';

const D0009B_ADDR = 0xD0009B;
const D0009D_ADDR = 0xD0009D;
const D0052C_ADDR = 0xD0052C;
const D0052D_ADDR = 0xD0052D;
const D00587_ADDR = 0xD00587;
const D0058C_ADDR = 0xD0058C;
const D0058D_ADDR = 0xD0058D;
const D0058E_ADDR = 0xD0058E;
const D007E0_ADDR = 0xD007E0;
const D00824_ADDR = 0xD00824;
const D0230F_ADDR = 0xD0230F;

const DIGIT_ONE_SCAN_CODE = 0x22;
const DIGIT_ONE_KEY_CODE = 0x8F;
const DIGIT_ONE_MATRIX_INDEX = 4;
const DIGIT_ONE_MATRIX_BIT = 1;

const INTERESTING_TARGETS = [
  { addr: 0x080151, label: '0x080151 gate function' },
  { addr: 0x058241, label: '0x058241 cxMain pre-handler' },
  { addr: 0x0585E9, label: '0x0585E9 cxMain' },
  { addr: 0x05FE15, label: '0x05FE15 graph' },
];

const WATCHED_ADDRS = new Set([D007E0_ADDR, D00824_ADDR, D0230F_ADDR]);

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xFF;
  mem[addr + 1] = (value >>> 8) & 0xFF;
  mem[addr + 2] = (value >>> 16) & 0xFF;
}

function seedAscii(mem, start, text) {
  for (let index = 0; index < text.length; index += 1) {
    mem[start + index] = text.charCodeAt(index);
  }
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_PATH)) {
    return;
  }

  console.log(`[setup] ${path.basename(TRANSPILED_PATH)} missing, running transpiler first`);
  execFileSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'transpile-ti84-rom.mjs')], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });

  if (!fs.existsSync(TRANSPILED_PATH)) {
    throw new Error(`Transpiler finished without creating ${TRANSPILED_PATH}`);
  }
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
}

async function loadBlocks() {
  ensureTranspiledModule();
  const moduleUrl = pathToFileURL(TRANSPILED_PATH).href;
  const romModule = await import(moduleUrl);
  const blocks = normalizeBlocks(
    romModule.PRELIFTED_BLOCKS ??
    romModule.default?.PRELIFTED_BLOCKS ??
    romModule.default ??
    romModule,
  );

  if (!blocks || !Object.keys(blocks).length) {
    throw new Error('Unable to resolve PRELIFTED_BLOCKS from ROM.transpiled.js');
  }

  return blocks;
}

function createRuntime(romBytes, blocks, seededMem = null) {
  const mem = new Uint8Array(MEM_SIZE);
  if (seededMem) {
    mem.set(seededMem.subarray(0, Math.min(seededMem.length, MEM_SIZE)));
  } else {
    mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  }

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  return {
    mem,
    peripherals,
    executor,
    cpu: executor.cpu,
  };
}

function runStage(executor, label, entry, mode, maxSteps, maxLoopIterations) {
  const result = executor.runFrom(entry, mode, {
    maxSteps,
    maxLoopIterations,
  });

  return {
    label,
    entry,
    steps: result.steps ?? 0,
    termination: result.termination ?? 'unknown',
    lastPc: result.lastPc ?? entry,
    lastMode: result.lastMode ?? mode,
  };
}

function runToStopPc(executor, entry, mode, stopPc, maxSteps, maxLoopIterations) {
  const STOP_TOKEN = '__PHASE261_STOP_PC__';
  let steps = 0;
  let lastPc = entry & 0xFFFFFF;
  let lastMode = mode;
  let termination = 'step_limit';
  let hitStop = false;

  try {
    const result = executor.runFrom(entry, mode, {
      maxSteps,
      maxLoopIterations,
      onBlock(pc, blockMode, _meta, step) {
        steps = Math.max(steps, (step ?? 0) + 1);
        lastPc = pc & 0xFFFFFF;
        lastMode = blockMode ?? lastMode;
        if (lastPc === stopPc) {
          throw new Error(STOP_TOKEN);
        }
      },
      onMissingBlock(pc, blockMode, step) {
        steps = Math.max(steps, (step ?? 0) + 1);
        lastPc = pc & 0xFFFFFF;
        lastMode = blockMode ?? lastMode;
        if (lastPc === stopPc) {
          throw new Error(STOP_TOKEN);
        }
      },
    });

    steps = Math.max(steps, result.steps ?? 0);
    lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
    lastMode = result.lastMode ?? lastMode;
    termination = result.termination ?? termination;
  } catch (error) {
    if (error?.message === STOP_TOKEN) {
      hitStop = true;
      termination = 'stop_pc';
    } else {
      throw error;
    }
  }

  return {
    steps,
    lastPc,
    lastMode,
    termination,
    hitStop,
  };
}

// ── Part 1: Static decode ──────────────────────────────────────────────

function printStaticDecode() {
  console.log('=== Part 1: Static decode of 0x080151 (8 bytes) ===');
  console.log('');
  console.log('  080151: E6 3F      AND 0x3F       ; A = A & 0x3F (mask off upper 2 bits)');
  console.log('  080153: FE 03      CP 0x03        ; compare with 3');
  console.log('  080155: C8         RET Z          ; return if A&0x3F == 0x03 (Z set)');
  console.log('  080156: FE 0B      CP 0x0B        ; compare with 11');
  console.log('  080158: C9         RET            ; return (Z set iff A&0x3F == 0x0B)');
  console.log('');
  console.log('  Returns Z for input values where (A & 0x3F) == 0x03 or (A & 0x3F) == 0x0B');
  console.log('  Full set of Z-returning A values: 0x03, 0x0B, 0x43, 0x4B, 0x83, 0x8B, 0xC3, 0xCB');
  console.log('');
}

// ── Part 2: Dynamic gate verification ──────────────────────────────────

function verifyGate(romBytes, blocks) {
  console.log('=== Part 2: Dynamic verification of 0x080151 ===');
  console.log('');

  const testCases = [
    { a: 0x03, expectZ: true,  label: 'A=0x03 (0x03 & 0x3F = 0x03, matches first CP)' },
    { a: 0x0B, expectZ: true,  label: 'A=0x0B (0x0B & 0x3F = 0x0B, matches second CP)' },
    { a: 0x00, expectZ: false, label: 'A=0x00 (0x00 & 0x3F = 0x00, no match)' },
    { a: 0x01, expectZ: false, label: 'A=0x01 (0x01 & 0x3F = 0x01, no match)' },
    { a: 0x43, expectZ: true,  label: 'A=0x43 (0x43 & 0x3F = 0x03, matches first CP)' },
    { a: 0x4B, expectZ: true,  label: 'A=0x4B (0x4B & 0x3F = 0x0B, matches second CP)' },
    { a: 0x40, expectZ: false, label: 'A=0x40 (0x40 & 0x3F = 0x00, no match)' },
  ];

  let allPass = true;

  for (const tc of testCases) {
    const runtime = createRuntime(romBytes, blocks);
    const { executor, cpu, mem } = runtime;

    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu.madl = 1;
    cpu.mbase = MBASE;
    cpu.a = tc.a & 0xFF;
    cpu.f = 0x00;
    cpu.sp = STACK_TOP - 3;
    mem.fill(0xFF, cpu.sp, cpu.sp + 3);
    cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
    write24(mem, cpu.sp, GATE_RETURN);

    let termination = 'step_limit';
    let hitReturn = false;

    try {
      const result = executor.runFrom(GATE_ENTRY, 'adl', {
        maxSteps: 20,
        maxLoopIterations: 8,
        onBlock(pc, mode, _meta, step) {
          if ((pc & 0xFFFFFF) === GATE_RETURN) {
            const stop = new Error('__GATE_STOP__');
            stop.reason = 'return';
            throw stop;
          }
        },
        onMissingBlock(pc, mode, step) {
          if ((pc & 0xFFFFFF) === GATE_RETURN) {
            const stop = new Error('__GATE_STOP__');
            stop.reason = 'return';
            throw stop;
          }
        },
      });
      termination = result.termination ?? termination;
    } catch (error) {
      if (error?.message === '__GATE_STOP__') {
        hitReturn = true;
        termination = 'return';
      } else {
        termination = 'exception';
        console.log(`  ERROR for ${tc.label}: ${error?.message ?? error}`);
        allPass = false;
        continue;
      }
    }

    const zFlag = (cpu.f & 0x40) !== 0;
    const gotZ = zFlag;
    const pass = gotZ === tc.expectZ;
    if (!pass) {
      allPass = false;
    }

    console.log(
      `  ${pass ? 'PASS' : 'FAIL'} ${tc.label}` +
      ` -> Z=${gotZ ? '1' : '0'} (expected ${tc.expectZ ? 'Z' : 'NZ'})` +
      ` term=${termination} A_out=${hexByte(cpu.a)} F=${hexByte(cpu.f)}`,
    );
  }

  console.log('');
  console.log(`  Gate verification: ${allPass ? 'ALL PASS' : 'SOME FAILED'}`);
  console.log('');
  return allPass;
}

// ── Boot infrastructure (same as phase 260) ────────────────────────────

function coldBoot(executor, cpu, mem) {
  const boot = runStage(executor, 'cold_boot', BOOT_ENTRY, BOOT_MODE, BOOT_MAX_STEPS, BOOT_MAX_LOOP_ITERATIONS);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = runStage(executor, 'kernel_init', KERNEL_INIT_ENTRY, 'adl', 100000, 10000);

  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = runStage(executor, 'post_init', POST_INIT_ENTRY, 'adl', 100, 32);

  return { boot, kernelInit, postInit };
}

function resetCpuForOsCall(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
  cpu._ix = IX_BASE;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function runMemInit(executor, cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, MEM_INIT_RET);

  return runToStopPc(
    executor,
    MEM_INIT_ENTRY,
    'adl',
    MEM_INIT_RET,
    100000,
    TRACE_MAX_LOOP_ITERATIONS,
  );
}

function restoreCpuForHomescreen(cpu, snapshot, mem) {
  restoreCpu(cpu, snapshot);
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = IY_BASE;
  cpu._ix = IX_BASE;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function runHomescreenStages(executor, cpu, mem, postMemInitSnapshot) {
  const stages = [];

  restoreCpuForHomescreen(cpu, postMemInitSnapshot, mem);
  stages.push(runStage(executor, 'stage1_statusbar', STAGE_1_ENTRY, 'adl', 30000, STAGE_MAX_LOOP_ITERATIONS));

  restoreCpuForHomescreen(cpu, postMemInitSnapshot, mem);
  mem[D0009B_ADDR] &= ~0x40;
  stages.push(runStage(executor, 'stage2_statusdots', STAGE_2_ENTRY, 'adl', 30000, STAGE_MAX_LOOP_ITERATIONS));

  seedAscii(mem, MODE_BUF_START, MODE_BUF_TEXT);
  seedAscii(mem, DISPLAY_BUF_START, MODE_BUF_TEXT);
  restoreCpuForHomescreen(cpu, postMemInitSnapshot, mem);
  stages.push(runStage(executor, 'stage3_homerow', STAGE_3_ENTRY, 'adl', 50000, STAGE_MAX_LOOP_ITERATIONS));

  restoreCpuForHomescreen(cpu, postMemInitSnapshot, mem);
  stages.push(runStage(executor, 'stage4_history', STAGE_4_ENTRY, 'adl', 50000, STAGE_MAX_LOOP_ITERATIONS));

  return stages;
}

function buildBaseline(romBytes, blocks) {
  const runtime = createRuntime(romBytes, blocks);
  const { executor, cpu, mem } = runtime;

  const bootInfo = coldBoot(executor, cpu, mem);
  const memInit = runMemInit(executor, cpu, mem);
  if (!memInit.hitStop) {
    throw new Error(
      `memInit did not return via ${hex(MEM_INIT_RET)} (termination=${memInit.termination}, lastPc=${hex(memInit.lastPc)})`,
    );
  }

  const postMemInitSnapshot = snapshotCpu(cpu);
  const homescreenStages = runHomescreenStages(executor, cpu, mem, postMemInitSnapshot);

  return {
    mem: new Uint8Array(mem),
    cpuSnapshot: snapshotCpu(cpu),
    summary: {
      bootInfo,
      memInit,
      homescreenStages,
      d007e0: mem[D007E0_ADDR] & 0xFF,
      d00824: mem[D00824_ADDR] & 0xFF,
      d0230f: mem[D0230F_ADDR] & 0xFF,
    },
  };
}

// ── Write tracer ───────────────────────────────────────────────────────

function installWriteTracer(cpu, mem) {
  const writes = [];
  const context = {
    step: 0,
    pc: null,
    mode: 'adl',
  };

  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  function recordByte(addr, value, kind, startAddr) {
    const normalizedAddr = addr & 0xFFFFFF;
    if (!WATCHED_ADDRS.has(normalizedAddr)) {
      return;
    }

    writes.push({
      step: context.step,
      pc: context.pc ?? (cpu._currentBlockPc ?? null),
      mode: context.mode,
      kind,
      startAddr: startAddr & 0xFFFFFF,
      addr: normalizedAddr,
      oldValue: mem[normalizedAddr] & 0xFF,
      newValue: value & 0xFF,
    });
  }

  cpu.write8 = (addr, value) => {
    recordByte(addr, value, 'write8', addr);
    return origWrite8(addr, value);
  };

  cpu.write16 = (addr, value) => {
    recordByte(addr, value, 'write16', addr);
    recordByte(addr + 1, value >>> 8, 'write16', addr);
    return origWrite16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    recordByte(addr, value, 'write24', addr);
    recordByte(addr + 1, value >>> 8, 'write24', addr);
    recordByte(addr + 2, value >>> 16, 'write24', addr);
    return origWrite24(addr, value);
  };

  return {
    writes,
    setContext(nextContext) {
      Object.assign(context, nextContext);
    },
    restore() {
      cpu.write8 = origWrite8;
      cpu.write16 = origWrite16;
      cpu.write24 = origWrite24;
    },
  };
}

// ── Key seeding (same as phase 260) ────────────────────────────────────

function seedDigitOne(runtime) {
  const { mem, peripherals } = runtime;

  mem[D0052C_ADDR] = DIGIT_ONE_KEY_CODE;
  mem[D0052D_ADDR] = DIGIT_ONE_KEY_CODE;
  mem[D00587_ADDR] = DIGIT_ONE_SCAN_CODE;
  mem[D0058C_ADDR] = DIGIT_ONE_SCAN_CODE;
  mem[D0058D_ADDR] = DIGIT_ONE_KEY_CODE;
  mem[D0058E_ADDR] = DIGIT_ONE_KEY_CODE;
  mem[D0009D_ADDR] |= 0x01;

  let keyMatrixValue = null;
  if (peripherals?.keyboard?.keyMatrix) {
    peripherals.keyboard.keyMatrix.fill(0xFF);
    peripherals.keyboard.keyMatrix[DIGIT_ONE_MATRIX_INDEX] &= ~(1 << DIGIT_ONE_MATRIX_BIT);
    keyMatrixValue = peripherals.keyboard.keyMatrix[DIGIT_ONE_MATRIX_INDEX] & 0xFF;
    if (typeof peripherals.setKeyboardIRQ === 'function') {
      peripherals.setKeyboardIRQ(true);
    }
  }

  return {
    d0052c: mem[D0052C_ADDR] & 0xFF,
    d0052d: mem[D0052D_ADDR] & 0xFF,
    d00587: mem[D00587_ADDR] & 0xFF,
    d0058c: mem[D0058C_ADDR] & 0xFF,
    d0058d: mem[D0058D_ADDR] & 0xFF,
    d0058e: mem[D0058E_ADDR] & 0xFF,
    d0009d: mem[D0009D_ADDR] & 0xFF,
    keyMatrixIndex: DIGIT_ONE_MATRIX_INDEX,
    keyMatrixValue,
  };
}

// ── Part 3 & 4: Trace 0x062055 with B=3 and B=0x0B ────────────────────

function prepareTraceState(runtime, baselineCpuSnapshot, bValue) {
  const { cpu, mem } = runtime;

  restoreCpu(cpu, baselineCpuSnapshot);
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.iy = IY_BASE;
  cpu.ix = IX_BASE;
  // 0x062055 does LD A,B first, so we set B to the desired value
  cpu.a = bValue & 0xFF;
  cpu.b = bValue & 0xFF;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, TRACE_RETURN);
  cpu.pc = TRACE_ENTRY;

  return {
    bSeed: cpu.b & 0xFF,
    aSeed: cpu.a & 0xFF,
    ix: cpu.ix & 0xFFFFFF,
    iy: cpu.iy & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    keySeed: seedDigitOne(runtime),
  };
}

function runTraceCase(romBytes, blocks, baseline, bValue, label) {
  const runtime = createRuntime(romBytes, blocks, baseline.mem);
  const { executor, cpu, mem } = runtime;
  const setup = prepareTraceState(runtime, baseline.cpuSnapshot, bValue);
  const tracer = installWriteTracer(cpu, mem);

  const STOP_TOKEN = '__PHASE261_TRACE_STOP__';
  const seenBlocks = new Set();
  const uniqueBlocks = [];
  const seenMissingBlocks = new Set();
  const missingBlocks = [];
  const hits = Object.fromEntries(
    INTERESTING_TARGETS.map((target) => [
      target.addr,
      {
        label: target.label,
        reached: false,
        firstStep: null,
      },
    ]),
  );

  // Track whether 0x080151 returned Z
  let gateReturnedZ = null;

  let steps = 0;
  let finalPc = TRACE_ENTRY;
  let finalMode = 'adl';
  let termination = 'step_limit';
  let errorMessage = null;

  function noteVisit(pc, mode, step, missing) {
    const normalizedPc = pc & 0xFFFFFF;
    const stepNumber = (step ?? 0) + 1;

    steps = Math.max(steps, stepNumber);
    finalPc = normalizedPc;
    finalMode = mode ?? finalMode;
    tracer.setContext({
      step: stepNumber,
      pc: normalizedPc,
      mode: finalMode,
    });

    if (!seenBlocks.has(normalizedPc)) {
      seenBlocks.add(normalizedPc);
      uniqueBlocks.push({
        step: stepNumber,
        pc: normalizedPc,
      });
    }

    if (missing && !seenMissingBlocks.has(normalizedPc)) {
      seenMissingBlocks.add(normalizedPc);
      missingBlocks.push({
        step: stepNumber,
        pc: normalizedPc,
      });
    }

    if (Object.hasOwn(hits, normalizedPc) && hits[normalizedPc].firstStep === null) {
      hits[normalizedPc].reached = true;
      hits[normalizedPc].firstStep = stepNumber;
    }

    if (normalizedPc === TRACE_RETURN) {
      const stop = new Error(STOP_TOKEN);
      stop.reason = 'return';
      throw stop;
    }
  }

  try {
    const result = executor.runFrom(TRACE_ENTRY, 'adl', {
      maxSteps: TRACE_STEP_LIMIT,
      maxLoopIterations: TRACE_MAX_LOOP_ITERATIONS,
      onBlock(pc, mode, _meta, step) {
        noteVisit(pc, mode, step, false);
      },
      onMissingBlock(pc, mode, step) {
        noteVisit(pc, mode, step, true);
      },
    });

    steps = Math.max(steps, result.steps ?? 0);
    finalPc = (result.lastPc ?? finalPc) & 0xFFFFFF;
    finalMode = result.lastMode ?? finalMode;
    termination = result.termination ?? termination;
  } catch (error) {
    if (error?.message === STOP_TOKEN) {
      termination = error.reason ?? 'return';
    } else {
      termination = 'exception';
      errorMessage = error?.stack ?? String(error);
    }
  } finally {
    tracer.restore();
  }

  // Check Z flag to see if gate returned Z
  gateReturnedZ = (cpu.f & 0x40) !== 0;

  return {
    label,
    bValue,
    setup,
    run: {
      termination,
      steps,
      finalPc,
      finalMode,
      uniqueBlockCount: uniqueBlocks.length,
      missingBlockCount: missingBlocks.length,
    },
    gateReturnedZ,
    hits,
    writes: tracer.writes,
    uniqueBlocks,
    missingBlocks,
    errorMessage,
    finalState: {
      d007e0: mem[D007E0_ADDR] & 0xFF,
      d00824: mem[D00824_ADDR] & 0xFF,
      d0230f: mem[D0230F_ADDR] & 0xFF,
      a: cpu.a & 0xFF,
      f: cpu.f & 0xFF,
      b: (cpu._bc >>> 8) & 0xFF,
    },
  };
}

// ── Printing ───────────────────────────────────────────────────────────

function printBootSummary(baseline) {
  const { bootInfo, memInit, homescreenStages, d007e0, d00824, d0230f } = baseline.summary;

  console.log('=== Phase 261: 0x080151 disasm + 0x062055 with B=3/0x0B ===');
  console.log('Boot sequence: cold boot -> kernelInit -> postInit -> memInit -> homescreen stages 1-4');
  console.log('');

  for (const item of [bootInfo.boot, bootInfo.kernelInit, bootInfo.postInit, memInit, ...homescreenStages]) {
    console.log(
      `  ${item.label}: entry=${hex(item.entry)} steps=${item.steps} term=${item.termination} lastPc=${hex(item.lastPc)}`,
    );
  }

  console.log('');
  console.log(`Post-boot baseline: D007E0=${hexByte(d007e0)} D00824=${hexByte(d00824)} D0230F=${hexByte(d0230f)}`);
  console.log('');
}

function printTraceCase(trace) {
  console.log(`=== Part ${trace.bValue === 3 ? '3' : '4'}: Trace 0x062055 with B=${hexByte(trace.bValue)} (${trace.label}) ===`);
  console.log('');
  console.log(
    `Seed: A=${hexByte(trace.setup.aSeed)} B=${hexByte(trace.setup.bSeed)} ` +
    `IX=${hex(trace.setup.ix)} IY=${hex(trace.setup.iy)} SP=${hex(trace.setup.sp)}`,
  );
  console.log(
    `Result: term=${trace.run.termination} steps=${trace.run.steps} finalPc=${hex(trace.run.finalPc)} ` +
    `finalMode=${trace.run.finalMode} uniqueBlocks=${trace.run.uniqueBlockCount}`,
  );
  console.log('');

  console.log('Gate result (0x080151):');
  console.log(`  Returned Z: ${trace.gateReturnedZ ? 'YES' : 'NO'} (F=${hexByte(trace.finalState.f)})`);
  console.log('');

  console.log('Reached targets:');
  for (const target of INTERESTING_TARGETS) {
    const hit = trace.hits[target.addr];
    if (hit.reached) {
      console.log(`  ${target.label}: YES at step ${hit.firstStep}`);
    } else {
      console.log(`  ${target.label}: NO`);
    }
  }
  console.log('');

  console.log('Post-call memory:');
  console.log(`  D007E0 = ${hexByte(trace.finalState.d007e0)}`);
  console.log(`  D00824 = ${hexByte(trace.finalState.d00824)}`);
  console.log(`  D0230F = ${hexByte(trace.finalState.d0230f)}`);
  console.log('');

  console.log('Watched writes:');
  for (const addr of [D007E0_ADDR, D00824_ADDR, D0230F_ADDR]) {
    const addrWrites = trace.writes.filter((entry) => entry.addr === addr);
    console.log(`  ${hex(addr)}: ${addrWrites.length} write(s)`);
    for (const entry of addrWrites) {
      console.log(
        `    step=${String(entry.step).padStart(3, ' ')} pc=${hex(entry.pc)} ` +
        `${hexByte(entry.oldValue)} -> ${hexByte(entry.newValue)} via ${entry.kind}`,
      );
    }
    if (addrWrites.length === 0) {
      console.log('    (none)');
    }
  }
  console.log('');

  console.log('Missing blocks:');
  if (trace.missingBlocks.length === 0) {
    console.log('  (none)');
  } else {
    for (const entry of trace.missingBlocks) {
      console.log(`  step=${String(entry.step).padStart(3, ' ')} pc=${hex(entry.pc)}`);
    }
  }
  console.log('');

  const blockLimit = Math.min(trace.uniqueBlocks.length, 30);
  console.log(`Block path (first ${blockLimit} of ${trace.uniqueBlocks.length}):`);
  for (let i = 0; i < blockLimit; i++) {
    const entry = trace.uniqueBlocks[i];
    console.log(
      `  [${String(i + 1).padStart(3, '0')}] step=${String(entry.step).padStart(3, ' ')} pc=${hex(entry.pc)}`,
    );
  }
  console.log('');

  if (trace.errorMessage) {
    console.log('Error:');
    console.log(trace.errorMessage);
    console.log('');
  }
}

// ── Main ───────────────────────────────────────────────────────────────

async function main() {
  const romBytes = fs.readFileSync(ROM_PATH);
  const blocks = await loadBlocks();

  // Part 1: Static decode
  printStaticDecode();

  // Part 2: Dynamic gate verification
  verifyGate(romBytes, blocks);

  // Part 3 & 4: Full boot + trace 0x062055
  console.log('Building baseline (full boot sequence)...');
  const baseline = buildBaseline(romBytes, blocks);
  printBootSummary(baseline);

  // Part 3: B=3
  const traceB3 = runTraceCase(romBytes, blocks, baseline, 0x03, 'B=0x03 should pass gate');
  printTraceCase(traceB3);

  // Part 4: B=0x0B
  const traceB0B = runTraceCase(romBytes, blocks, baseline, 0x0B, 'B=0x0B should pass gate');
  printTraceCase(traceB0B);

  // Summary comparison
  console.log('=== Summary Comparison ===');
  console.log('');
  console.log(
    `B=0x03: gate_Z=${traceB3.gateReturnedZ ? 'Y' : 'N'} ` +
    `cxMain_pre=${traceB3.hits[0x058241].reached ? 'Y' : 'N'} ` +
    `cxMain=${traceB3.hits[0x0585E9].reached ? 'Y' : 'N'} ` +
    `graph=${traceB3.hits[0x05FE15].reached ? 'Y' : 'N'} ` +
    `term=${traceB3.run.termination} steps=${traceB3.run.steps} finalPc=${hex(traceB3.run.finalPc)}`,
  );
  console.log(
    `B=0x0B: gate_Z=${traceB0B.gateReturnedZ ? 'Y' : 'N'} ` +
    `cxMain_pre=${traceB0B.hits[0x058241].reached ? 'Y' : 'N'} ` +
    `cxMain=${traceB0B.hits[0x0585E9].reached ? 'Y' : 'N'} ` +
    `graph=${traceB0B.hits[0x05FE15].reached ? 'Y' : 'N'} ` +
    `term=${traceB0B.run.termination} steps=${traceB0B.run.steps} finalPc=${hex(traceB0B.run.finalPc)}`,
  );
  console.log('');
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
