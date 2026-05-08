#!/usr/bin/env node

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

const DIGIT_ONE_SCAN_CODE = 0x22;
const DIGIT_ONE_KEY_CODE = 0x8F;
const DIGIT_ONE_MATRIX_INDEX = 4;
const DIGIT_ONE_MATRIX_BIT = 1;

const TRACE_CASES = [
  { label: 'A=0x40 candidate', modeValue: 0x40 },
  { label: 'A=0x49 candidate', modeValue: 0x49 },
];

const INTERESTING_TARGETS = [
  { addr: 0x058241, label: '0x058241 cxMain pre-handler' },
  { addr: 0x0585E9, label: '0x0585E9 cxMain' },
  { addr: 0x05E2A0, label: '0x05E2A0 BufInsert' },
];

const WATCHED_ADDRS = new Set([D007E0_ADDR, D00824_ADDR]);

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
  const STOP_TOKEN = '__PHASE260_STOP_PC__';
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
    },
  };
}

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

function prepareTraceState(runtime, baselineCpuSnapshot, modeValue) {
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
  cpu.a = modeValue & 0xFF;
  cpu.b = modeValue & 0xFF;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, TRACE_RETURN);
  cpu.pc = TRACE_ENTRY;

  return {
    aSeed: cpu.a & 0xFF,
    bSeed: cpu.b & 0xFF,
    ix: cpu.ix & 0xFFFFFF,
    iy: cpu.iy & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    keySeed: seedDigitOne(runtime),
  };
}

function runTraceCase(romBytes, blocks, baseline, spec) {
  const runtime = createRuntime(romBytes, blocks, baseline.mem);
  const { executor, cpu, mem } = runtime;
  const setup = prepareTraceState(runtime, baseline.cpuSnapshot, spec.modeValue);
  const tracer = installWriteTracer(cpu, mem);

  const STOP_TOKEN = '__PHASE260_TRACE_STOP__';
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

  return {
    spec,
    setup,
    run: {
      termination,
      steps,
      finalPc,
      finalMode,
      uniqueBlockCount: uniqueBlocks.length,
      missingBlockCount: missingBlocks.length,
    },
    hits,
    writes: tracer.writes,
    uniqueBlocks,
    missingBlocks,
    errorMessage,
  };
}

function printBootSummary(baseline) {
  const { bootInfo, memInit, homescreenStages, d007e0, d00824 } = baseline.summary;

  console.log('=== Phase 260: Dynamic 0x062055 probe ===');
  console.log('Boot sequence: cold boot -> kernelInit -> postInit -> memInit -> homescreen stages 1-4');
  console.log(
    `Resolved entries: kernelInit=${hex(KERNEL_INIT_ENTRY)} memInit=${hex(MEM_INIT_ENTRY)} ` +
    `stage1=${hex(STAGE_1_ENTRY)} stage2=${hex(STAGE_2_ENTRY)} stage3=${hex(STAGE_3_ENTRY)} stage4=${hex(STAGE_4_ENTRY)}`,
  );
  console.log('');

  for (const item of [bootInfo.boot, bootInfo.kernelInit, bootInfo.postInit, memInit, ...homescreenStages]) {
    console.log(
      `  ${item.label}: entry=${hex(item.entry)} steps=${item.steps} term=${item.termination} lastPc=${hex(item.lastPc)}`,
    );
  }

  console.log('');
  console.log(`Post-boot baseline: D007E0=${hexByte(d007e0)} D00824=${hexByte(d00824)}`);
  console.log('');
  console.log(
    `Trace entry ${hex(TRACE_ENTRY)} starts with "ld a,b", so each requested A seed is mirrored into B ` +
    'before the direct call.',
  );
  console.log(
    `Digit-1 key seeding uses both raw scan ${hexByte(DIGIT_ONE_SCAN_CODE)} and translated key code ${hexByte(DIGIT_ONE_KEY_CODE)} ` +
    'because prior probes distinguished those buffers.',
  );
  console.log('');
}

function printHitSummary(trace) {
  console.log('Reached targets:');
  for (const target of INTERESTING_TARGETS) {
    const hit = trace.hits[target.addr];
    if (hit.reached) {
      console.log(`  ${target.label}: YES at step ${hit.firstStep}`);
    } else {
      console.log(`  ${target.label}: NO`);
    }
  }
}

function printWritesFor(trace, addr) {
  const writes = trace.writes.filter((entry) => entry.addr === addr);
  console.log(`  ${hex(addr)}: ${writes.length} write(s)`);
  if (writes.length === 0) {
    console.log('    (none)');
    return;
  }

  for (const entry of writes) {
    console.log(
      `    step=${String(entry.step).padStart(3, ' ')} pc=${hex(entry.pc)} ` +
      `${hexByte(entry.oldValue)} -> ${hexByte(entry.newValue)} via ${entry.kind}`,
    );
  }
}

function printUniqueBlocks(trace) {
  console.log(`Unique blocks, first visit only (${trace.uniqueBlocks.length}):`);
  for (const [index, entry] of trace.uniqueBlocks.entries()) {
    console.log(
      `  [${String(index + 1).padStart(3, '0')}] step=${String(entry.step).padStart(3, ' ')} pc=${hex(entry.pc)}`,
    );
  }
}

function printMissingBlocks(trace) {
  console.log(`Missing blocks (${trace.missingBlocks.length}):`);
  if (trace.missingBlocks.length === 0) {
    console.log('  (none)');
    return;
  }

  for (const entry of trace.missingBlocks) {
    console.log(`  step=${String(entry.step).padStart(3, ' ')} pc=${hex(entry.pc)}`);
  }
}

function printTraceCase(trace) {
  console.log(`=== Trace ${trace.spec.label} ===`);
  console.log(
    `Seed: A=${hexByte(trace.setup.aSeed)} B=${hexByte(trace.setup.bSeed)} ` +
    `IX=${hex(trace.setup.ix)} IY=${hex(trace.setup.iy)} SP=${hex(trace.setup.sp)}`,
  );
  console.log(
    `Key seed: D00587=${hexByte(trace.setup.keySeed.d00587)} D0058C=${hexByte(trace.setup.keySeed.d0058c)} ` +
    `D0058D=${hexByte(trace.setup.keySeed.d0058d)} D0058E=${hexByte(trace.setup.keySeed.d0058e)} ` +
    `D0052C=${hexByte(trace.setup.keySeed.d0052c)} D0052D=${hexByte(trace.setup.keySeed.d0052d)} ` +
    `D0009D=${hexByte(trace.setup.keySeed.d0009d)} keyMatrix[${trace.setup.keySeed.keyMatrixIndex}]=${hexByte(trace.setup.keySeed.keyMatrixValue)}`,
  );
  console.log(
    `Result: term=${trace.run.termination} steps=${trace.run.steps} finalPc=${hex(trace.run.finalPc)} ` +
    `finalMode=${trace.run.finalMode} uniqueBlocks=${trace.run.uniqueBlockCount}`,
  );
  printHitSummary(trace);
  console.log('Watched writes:');
  printWritesFor(trace, D007E0_ADDR);
  printWritesFor(trace, D00824_ADDR);
  printMissingBlocks(trace);
  printUniqueBlocks(trace);
  if (trace.errorMessage) {
    console.log('Error:');
    console.log(trace.errorMessage);
  }
  console.log('');
}

function printComparison(traces) {
  const headers = ['Seed', 'Term', 'Steps', 'Unique', '058241', '0585E9', '05E2A0', 'D007E0', 'D00824', 'FinalPc'];
  const rows = traces.map((trace) => [
    hexByte(trace.spec.modeValue),
    trace.run.termination,
    String(trace.run.steps),
    String(trace.run.uniqueBlockCount),
    trace.hits[0x058241].reached ? 'YES' : 'NO',
    trace.hits[0x0585E9].reached ? 'YES' : 'NO',
    trace.hits[0x05E2A0].reached ? 'YES' : 'NO',
    String(trace.writes.filter((entry) => entry.addr === D007E0_ADDR).length),
    String(trace.writes.filter((entry) => entry.addr === D00824_ADDR).length),
    hex(trace.run.finalPc),
  ]);

  const widths = headers.map((header) => header.length);
  for (const row of rows) {
    for (let index = 0; index < row.length; index += 1) {
      widths[index] = Math.max(widths[index], row[index].length);
    }
  }

  console.log('=== Comparison ===');
  console.log(headers.map((header, index) => header.padEnd(widths[index], ' ')).join('  '));
  console.log(widths.map((width) => ''.padEnd(width, '-')).join('  '));
  for (const row of rows) {
    console.log(row.map((value, index) => value.padEnd(widths[index], ' ')).join('  '));
  }
  console.log('');

  for (const trace of traces) {
    const d007e0Writes = trace.writes
      .filter((entry) => entry.addr === D007E0_ADDR)
      .map((entry) => `${hexByte(entry.newValue)}@${hex(entry.pc)}`);
    const d00824Writes = trace.writes
      .filter((entry) => entry.addr === D00824_ADDR)
      .map((entry) => `${hexByte(entry.newValue)}@${hex(entry.pc)}`);

    console.log(`${hexByte(trace.spec.modeValue)} D007E0 writes: ${d007e0Writes.join(', ') || '(none)'}`);
    console.log(`${hexByte(trace.spec.modeValue)} D00824 writes: ${d00824Writes.join(', ') || '(none)'}`);
  }
  console.log('');

  if (traces.length === 2) {
    const left = traces[0];
    const right = traces[1];
    const leftSet = new Set(left.uniqueBlocks.map((entry) => entry.pc));
    const rightSet = new Set(right.uniqueBlocks.map((entry) => entry.pc));
    const leftOnly = left.uniqueBlocks.map((entry) => entry.pc).filter((pc) => !rightSet.has(pc));
    const rightOnly = right.uniqueBlocks.map((entry) => entry.pc).filter((pc) => !leftSet.has(pc));

    console.log(`${hexByte(left.spec.modeValue)}-only unique blocks (${leftOnly.length}): ${leftOnly.map((pc) => hex(pc)).join(', ') || '(none)'}`);
    console.log(`${hexByte(right.spec.modeValue)}-only unique blocks (${rightOnly.length}): ${rightOnly.map((pc) => hex(pc)).join(', ') || '(none)'}`);
    console.log('');
  }
}

async function main() {
  const romBytes = fs.readFileSync(ROM_PATH);
  const blocks = await loadBlocks();
  const baseline = buildBaseline(romBytes, blocks);

  printBootSummary(baseline);

  const traces = TRACE_CASES.map((spec) => runTraceCase(romBytes, blocks, baseline, spec));
  for (const trace of traces) {
    printTraceCase(trace);
  }
  printComparison(traces);
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
