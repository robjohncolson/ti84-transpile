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

// Boot constants
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

const MODE_BUF_START = 0xD020A6;
const DISPLAY_BUF_START = 0xD006C0;
const MODE_BUF_TEXT = 'Normal Float Radian       ';

const D0009B_ADDR = 0xD0009B;
const D007E0_ADDR = 0xD007E0;
const D00824_ADDR = 0xD00824;
const D0230F_ADDR = 0xD0230F;

// 0x080151 function: AND 0x3F; CP 3; RET Z; CP 0x0B; RET
const GATE_FN_ENTRY = 0x080151;
const GATE_FN_RETURN = 0x7FFFFA;

// 0x062055 trace
const TRACE_062055_ENTRY = 0x062055;
const TRACE_RETURN = 0x7FFFFE;
const TRACE_STEP_LIMIT = 500;
const TRACE_MAX_LOOP_ITERATIONS = 8192;

// Expected Z-returning values for 0x080151 (A & 0x3F == 3 or A & 0x3F == 0x0B)
const EXPECTED_Z_VALUES = new Set([0x03, 0x0B, 0x43, 0x4B, 0x83, 0x8B, 0xC3, 0xCB]);

const CXMAIN_ADDR = 0x058241;

const INTERESTING_TARGETS = [
  { addr: 0x058241, label: '0x058241 cxMain pre-handler' },
  { addr: 0x0585E9, label: '0x0585E9 cxMain' },
  { addr: 0x05E2A0, label: '0x05E2A0 BufInsert' },
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
  return '0x' + (Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0');
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

  console.log('[setup] ' + path.basename(TRANSPILED_PATH) + ' missing, running transpiler first');
  execFileSync(process.execPath, [path.join(REPO_ROOT, 'scripts', 'transpile-ti84-rom.mjs')], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });

  if (!fs.existsSync(TRANSPILED_PATH)) {
    throw new Error('Transpiler finished without creating ' + TRANSPILED_PATH);
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
      'memInit did not return via ' + hex(MEM_INIT_RET) +
      ' (termination=' + memInit.termination + ', lastPc=' + hex(memInit.lastPc) + ')',
    );
  }

  const postMemInitSnapshot = snapshotCpu(cpu);
  const homescreenStages = runHomescreenStages(executor, cpu, mem, postMemInitSnapshot);

  // Seed display buffer
  const displaySeedRuntime = createRuntime(romBytes, blocks, mem);
  resetCpuForOsCall(displaySeedRuntime.cpu, displaySeedRuntime.mem);
  runStage(displaySeedRuntime.executor, 'display_seed', 0x088720, 'adl', 50000, STAGE_MAX_LOOP_ITERATIONS);
  mem.set(displaySeedRuntime.mem);

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

// ===== Part 1: 0x080151 A-sweep =====

function run080151Sweep(romBytes, blocks) {
  console.log('=== Part 1: 0x080151 A-sweep (0x00..0xFF) ===');
  console.log('Static analysis: AND 0x3F; CP 3; RET Z; CP 0x0B; RET');
  console.log('Expected Z values: ' + [...EXPECTED_Z_VALUES].map((v) => hexByte(v)).join(', '));
  console.log('');

  const zValues = [];
  const nzValues = [];

  for (let a = 0; a <= 0xFF; a += 1) {
    const runtime = createRuntime(romBytes, blocks);
    const { executor, cpu, mem } = runtime;

    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu.madl = 1;
    cpu.mbase = MBASE;
    cpu._iy = IY_BASE;
    cpu._ix = IX_BASE;
    cpu.a = a;
    cpu.f = 0;
    cpu.sp = STACK_TOP - 6;
    mem.fill(0xFF, cpu.sp, cpu.sp + 6);
    cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
    write24(mem, cpu.sp, GATE_FN_RETURN);

    runToStopPc(
      executor,
      GATE_FN_ENTRY,
      'adl',
      GATE_FN_RETURN,
      20,
      8,
    );

    const zFlag = (cpu.f & 0x40) !== 0;

    if (zFlag) {
      zValues.push(a);
    } else {
      nzValues.push(a);
    }
  }

  console.log('Z-returning values (' + zValues.length + '): ' + zValues.map((v) => hexByte(v)).join(', '));
  console.log('NZ-returning values: ' + nzValues.length);
  console.log('');

  const dynamicZSet = new Set(zValues);
  const matchesStatic =
    dynamicZSet.size === EXPECTED_Z_VALUES.size &&
    [...EXPECTED_Z_VALUES].every((v) => dynamicZSet.has(v));

  if (matchesStatic) {
    console.log('PASS: Dynamic results match static prediction exactly.');
  } else {
    console.log('FAIL: Dynamic results differ from static prediction!');
    const extraDynamic = zValues.filter((v) => !EXPECTED_Z_VALUES.has(v));
    const missingDynamic = [...EXPECTED_Z_VALUES].filter((v) => !dynamicZSet.has(v));
    if (extraDynamic.length > 0) {
      console.log('  Extra Z values: ' + extraDynamic.map((v) => hexByte(v)).join(', '));
    }
    if (missingDynamic.length > 0) {
      console.log('  Missing Z values: ' + missingDynamic.map((v) => hexByte(v)).join(', '));
    }
  }

  console.log('');
  return { zValues, matchesStatic };
}

// ===== Parts 2-4: 0x062055 traces with B values =====

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

function runTrace062055(romBytes, blocks, baseline, label, bValue, preSeedD0230F) {
  const runtime = createRuntime(romBytes, blocks, baseline.mem);
  const { executor, cpu, mem } = runtime;

  // Pre-seed D0230F if requested
  if (preSeedD0230F !== undefined && preSeedD0230F !== null) {
    mem[D0230F_ADDR] = preSeedD0230F & 0xFF;
  }

  // Set up CPU for 0x062055 call
  restoreCpu(cpu, baseline.cpuSnapshot);
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
  cpu._ix = IX_BASE;
  cpu.a = bValue & 0xFF;
  cpu.b = bValue & 0xFF;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, TRACE_RETURN);

  const tracer = installWriteTracer(cpu, mem);

  const STOP_TOKEN = '__PHASE261_TRACE_STOP__';
  const seenBlocks = new Set();
  const uniqueBlocks = [];
  const seenMissingBlocks = new Set();
  const missingBlocks = [];
  const hits = Object.fromEntries(
    INTERESTING_TARGETS.map((target) => [
      target.addr,
      { label: target.label, reached: false, firstStep: null },
    ]),
  );

  let steps = 0;
  let finalPc = TRACE_062055_ENTRY;
  let finalMode = 'adl';
  let termination = 'step_limit';
  let errorMessage = null;

  function noteVisit(pc, mode, step, missing) {
    const normalizedPc = pc & 0xFFFFFF;
    const stepNumber = (step ?? 0) + 1;

    steps = Math.max(steps, stepNumber);
    finalPc = normalizedPc;
    finalMode = mode ?? finalMode;
    tracer.setContext({ step: stepNumber, pc: normalizedPc, mode: finalMode });

    if (!seenBlocks.has(normalizedPc)) {
      seenBlocks.add(normalizedPc);
      uniqueBlocks.push({ step: stepNumber, pc: normalizedPc });
    }

    if (missing && !seenMissingBlocks.has(normalizedPc)) {
      seenMissingBlocks.add(normalizedPc);
      missingBlocks.push({ step: stepNumber, pc: normalizedPc });
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
    const result = executor.runFrom(TRACE_062055_ENTRY, 'adl', {
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
    label,
    bValue,
    preSeedD0230F: preSeedD0230F ?? null,
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
    d007e0Final: mem[D007E0_ADDR] & 0xFF,
    d00824Final: mem[D00824_ADDR] & 0xFF,
    d0230fFinal: mem[D0230F_ADDR] & 0xFF,
    errorMessage,
  };
}

function printBootSummary(baseline) {
  const { bootInfo, memInit, homescreenStages, d007e0, d00824, d0230f } = baseline.summary;

  console.log('=== Phase 261: 0x080151 B-sweep + 0x062055 gate tests ===');
  console.log('Boot: cold boot -> kernelInit -> postInit -> memInit -> stages 1-4 -> display seed');
  console.log('');

  for (const item of [bootInfo.boot, bootInfo.kernelInit, bootInfo.postInit, memInit, ...homescreenStages]) {
    console.log(
      '  ' + item.label + ': entry=' + hex(item.entry) +
      ' steps=' + item.steps + ' term=' + item.termination +
      ' lastPc=' + hex(item.lastPc),
    );
  }

  console.log('');
  console.log('Post-boot baseline: D007E0=' + hexByte(d007e0) + ' D00824=' + hexByte(d00824) + ' D0230F=' + hexByte(d0230f));
  console.log('');
}

function printTraceResult(trace) {
  var d0230fLabel = trace.preSeedD0230F !== null
    ? ' D0230F pre-seeded=' + hexByte(trace.preSeedD0230F)
    : '';

  console.log('--- ' + trace.label + ' (B=' + hexByte(trace.bValue) + d0230fLabel + ') ---');
  console.log(
    'Result: term=' + trace.run.termination + ' steps=' + trace.run.steps +
    ' finalPc=' + hex(trace.run.finalPc) + ' finalMode=' + trace.run.finalMode +
    ' uniqueBlocks=' + trace.run.uniqueBlockCount,
  );

  var cxMainReached = trace.hits[CXMAIN_ADDR]?.reached ?? false;
  console.log('cxMain (0x058241) reached: ' + (cxMainReached ? 'YES at step ' + trace.hits[CXMAIN_ADDR].firstStep : 'NO'));

  console.log('Final memory: D007E0=' + hexByte(trace.d007e0Final) + ' D00824=' + hexByte(trace.d00824Final) + ' D0230F=' + hexByte(trace.d0230fFinal));

  console.log('Reached targets:');
  for (const target of INTERESTING_TARGETS) {
    const hit = trace.hits[target.addr];
    if (hit.reached) {
      console.log('  ' + target.label + ': YES at step ' + hit.firstStep);
    } else {
      console.log('  ' + target.label + ': NO');
    }
  }

  console.log('Watched writes:');
  for (const addr of [D007E0_ADDR, D00824_ADDR, D0230F_ADDR]) {
    const addrWrites = trace.writes.filter((entry) => entry.addr === addr);
    console.log('  ' + hex(addr) + ': ' + addrWrites.length + ' write(s)');
    for (const entry of addrWrites) {
      console.log(
        '    step=' + String(entry.step).padStart(3, ' ') + ' pc=' + hex(entry.pc) +
        ' ' + hexByte(entry.oldValue) + ' -> ' + hexByte(entry.newValue) + ' via ' + entry.kind,
      );
    }
    if (addrWrites.length === 0) {
      console.log('    (none)');
    }
  }

  console.log('Missing blocks (' + trace.missingBlocks.length + '):');
  if (trace.missingBlocks.length === 0) {
    console.log('  (none)');
  } else {
    for (const entry of trace.missingBlocks) {
      console.log('  step=' + String(entry.step).padStart(3, ' ') + ' pc=' + hex(entry.pc));
    }
  }

  var blocksToShow = Math.min(30, trace.uniqueBlocks.length);
  console.log('First ' + blocksToShow + ' unique block PCs (of ' + trace.uniqueBlocks.length + '):');
  for (var i = 0; i < blocksToShow; i += 1) {
    const entry = trace.uniqueBlocks[i];
    console.log(
      '  [' + String(i + 1).padStart(3, '0') + '] step=' + String(entry.step).padStart(3, ' ') +
      ' pc=' + hex(entry.pc),
    );
  }

  if (trace.errorMessage) {
    console.log('Error:');
    console.log(trace.errorMessage);
  }

  console.log('');
}

function printComparison(traces) {
  var headers = ['Label', 'B', 'D0230F-pre', 'Term', 'Steps', 'Unique', 'cxMain', 'D007E0', 'D00824', 'D0230F', 'FinalPc'];
  var rows = traces.map((trace) => [
    trace.label,
    hexByte(trace.bValue),
    trace.preSeedD0230F !== null ? hexByte(trace.preSeedD0230F) : '-',
    trace.run.termination,
    String(trace.run.steps),
    String(trace.run.uniqueBlockCount),
    trace.hits[CXMAIN_ADDR]?.reached ? 'YES' : 'NO',
    hexByte(trace.d007e0Final),
    hexByte(trace.d00824Final),
    hexByte(trace.d0230fFinal),
    hex(trace.run.finalPc),
  ]);

  var widths = headers.map((header) => header.length);
  for (const row of rows) {
    for (var index = 0; index < row.length; index += 1) {
      widths[index] = Math.max(widths[index], row[index].length);
    }
  }

  console.log('=== Comparison Table ===');
  console.log(headers.map((header, index) => header.padEnd(widths[index], ' ')).join('  '));
  console.log(widths.map((width) => ''.padEnd(width, '-')).join('  '));
  for (const row of rows) {
    console.log(row.map((value, index) => value.padEnd(widths[index], ' ')).join('  '));
  }
  console.log('');
}

async function main() {
  var romBytes = fs.readFileSync(ROM_PATH);
  var blocks = await loadBlocks();

  // Part 1: 0x080151 A-sweep
  var sweepResult = run080151Sweep(romBytes, blocks);

  // Build baseline (full boot)
  console.log('Building post-boot baseline...');
  var baseline = buildBaseline(romBytes, blocks);
  printBootSummary(baseline);

  // Part 2: 0x062055 with B=3 after full boot
  var traceB3 = runTrace062055(romBytes, blocks, baseline, 'B=3 (gate code 3)', 0x03);
  printTraceResult(traceB3);

  // Part 3: 0x062055 with B=0x0B after full boot
  var traceB0B = runTrace062055(romBytes, blocks, baseline, 'B=0x0B (gate code 11)', 0x0B);
  printTraceResult(traceB0B);

  // Part 4: 0x062055 with B=3 and D0230F pre-seeded to 0x3F
  var traceB3seeded = runTrace062055(romBytes, blocks, baseline, 'B=3 + D0230F=0x3F', 0x03, 0x3F);
  printTraceResult(traceB3seeded);

  // Summary comparison
  printComparison([traceB3, traceB0B, traceB3seeded]);

  console.log('=== Summary ===');
  console.log('0x080151 sweep: ' + (sweepResult.matchesStatic ? 'PASS' : 'FAIL') + ' (' + sweepResult.zValues.length + ' Z values)');
  console.log('B=3 reaches cxMain: ' + (traceB3.hits[CXMAIN_ADDR]?.reached ? 'YES' : 'NO'));
  console.log('B=0x0B reaches cxMain: ' + (traceB0B.hits[CXMAIN_ADDR]?.reached ? 'YES' : 'NO'));
  console.log('B=3 + D0230F=0x3F reaches cxMain: ' + (traceB3seeded.hits[CXMAIN_ADDR]?.reached ? 'YES' : 'NO'));
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
