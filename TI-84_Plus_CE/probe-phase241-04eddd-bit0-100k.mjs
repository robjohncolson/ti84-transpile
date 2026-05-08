#!/usr/bin/env node

/**
 * Phase 241: 0x04EDDD BIT 0 gate with 120K-step traces.
 *
 * Session 240 established that:
 *   - 0x04EDD9 = LD HL,0xD003E0
 *   - 0x04EDDD = BIT 0,(HL)
 *   - BIT 0 clear should route toward 0x04E447
 *   - BIT 0 set   should route toward 0x0850D1
 *
 * The 5K-step traces were too short to get past the long 0x09EFDE VRAM-fill
 * work. This probe repeats the shared 0x04EDD0 handler twice for 120K steps:
 *   - Scenario A: D003E0 = 0x00 (BIT 0 clear)
 *   - Scenario B: D003E0 = 0x01 (BIT 0 set)
 *
 * The probe reports:
 *   - whether 0x04E447 / 0x0850D1 were visited
 *   - when the 0x09EFDE fill loop first exits
 *   - the first blocks after fill completion
 *   - total unique blocks per scenario
 *   - visit counts for 0x04E447, 0x0850D1, 0x09EFDE, and the 0x04EDDD BIT site
 *   - the first divergence between the two scenarios after fill completion
 *
 * Note: 0x04EDDD is an instruction inside lifted block 0x04EDD9 rather than a
 * standalone transpiled block key, so its "visit count" is derived from visits
 * to 0x04EDD9.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

const ENTRY_PC = 0x04EDD0;
const ENTRY_A = 0x44;
const ENTRY_F = 0x40;
const BIT0_SITE_PC = 0x04EDDD;
const BIT0_SITE_BLOCK_PC = 0x04EDD9;
const CLEAR_BRANCH_PC = 0x04E447;
const SET_BRANCH_PC = 0x0850D1;
const FILL_LOOP_PC = 0x09EFDE;
const FILL_RANGE_START = 0x09E000;
const FILL_RANGE_END = 0x09F000;

const STEP_BUDGET = 120000;
const POST_FILL_WINDOW = 32;
const DIVERGENCE_CONTEXT_RADIUS = 6;

const STACK_TOP = 0xD1A87E;
const RETURN_SENTINEL = 0x7FFFFE;
const MBASE = 0xD0;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;

const D00000_ADDR = 0xD00000;
const D003DA_ADDR = 0xD003DA;
const D003E0_ADDR = 0xD003E0;
const D0058D_ADDR = 0xD0058D;
const D0058E_ADDR = 0xD0058E;
const D0059F_ADDR = 0xD0059F;
const D007E0_ADDR = 0xD007E0;
const D00824_ADDR = 0xD00824;

const CPU_SNAPSHOT_FIELDS = [
  'a',
  'f',
  '_bc',
  '_de',
  '_hl',
  '_a2',
  '_f2',
  '_bc2',
  '_de2',
  '_hl2',
  'sp',
  '_ix',
  '_iy',
  'i',
  'im',
  'iff1',
  'iff2',
  'madl',
  'mbase',
  'halted',
  'cycles',
];

const SCENARIOS = [
  {
    label: 'Scenario A',
    description: 'BIT 0 CLEAR',
    d003e0Value: 0x00,
  },
  {
    label: 'Scenario B',
    description: 'BIT 0 SET',
    d003e0Value: 0x01,
  },
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

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return {
      modulePath: TRANSPILED_JS_PATH,
      tempModulePath: null,
      source: 'js',
    };
  }

  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error(
      'Missing both ROM.transpiled.js and ROM.transpiled.js.gz. Run node scripts/transpile-ti84-rom.mjs first.',
    );
  }

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase241-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));

  return {
    modulePath: tempModulePath,
    tempModulePath,
    source: 'gz',
  };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) return;
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }
}

function blockKey(addr, mode) {
  return `${(addr >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function resolveNextMode(executor, key, returnedPc, currentMode) {
  const meta = executor.blockMeta?.[key];
  if (!meta?.exits) {
    return currentMode;
  }

  for (const exit of meta.exits) {
    if (exit.target === returnedPc && exit.targetMode) {
      return exit.targetMode;
    }
  }

  return currentMode;
}

function installStepShim(cpu, executor) {
  if (!executor?.compiledBlocks) {
    throw new Error('Executor compiledBlocks are required for manual stepping.');
  }

  cpu.step = function step() {
    const mode = this.madl ? 'adl' : 'z80';
    const pc = this.pc & 0xFFFFFF;
    const key = blockKey(pc, mode);
    const fn = executor.compiledBlocks[key];

    if (typeof fn !== 'function') {
      throw new Error(`Missing block function for ${hex(pc)} (${key})`);
    }

    this._currentBlockPc = pc;
    const result = fn(this);

    if (typeof result !== 'number') {
      throw new Error(`Unexpected step result from ${hex(pc)}: ${String(result)}`);
    }

    if (result >= 0) {
      const nextMode = resolveNextMode(executor, key, result, mode);
      this.pc = result & 0xFFFFFF;
      this.madl = nextMode === 'adl' ? 1 : 0;
    }

    return result;
  };
}

function createRuntime(romBytes, blocks) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;
  installStepShim(cpu, executor);
  return { mem, peripherals, executor, cpu };
}

function createScenarioRuntime(blocks, bootMemory) {
  const mem = new Uint8Array(bootMemory);
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;
  installStepShim(cpu, executor);
  return { mem, peripherals, executor, cpu };
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernel = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const post = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return { boot, kernel, post };
}

function seedEntryState(cpu, mem, d003e0Value) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.pc = ENTRY_PC;
  cpu.sp = STACK_TOP;
  cpu.ix = IX_BASE;
  cpu.iy = IY_BASE;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = ENTRY_A;
  cpu.f = ENTRY_F;

  for (let offset = 0; offset < 128; offset++) {
    mem[(IY_BASE + offset) & MEM_MASK] = 0x00;
  }

  mem[D00000_ADDR] = 0x00;
  mem[D003DA_ADDR] = 0x00;
  mem[D003E0_ADDR] = d003e0Value & 0xFF;
  mem[D0058D_ADDR] = 0x00;
  mem[D0058E_ADDR] = 0x00;
  mem[D0059F_ADDR] = 0x00;
  mem[D007E0_ADDR] = 0x40;
  mem[D00824_ADDR] = 0x00;

  mem.fill(0xFF, STACK_TOP - 32, STACK_TOP + 3);
  push24(cpu, mem, RETURN_SENTINEL);
}

function inFillRange(pc) {
  return pc >= FILL_RANGE_START && pc < FILL_RANGE_END;
}

function recordVisit(visitCounts, uniqueBlocks, uniqueSet, pc) {
  if (!uniqueSet.has(pc)) {
    uniqueSet.add(pc);
    uniqueBlocks.push(pc);
  }
  visitCounts.set(pc, (visitCounts.get(pc) ?? 0) + 1);
}

function traceScenario(cpu, mem, budget, scenario) {
  const orderedBlocks = [];
  const uniqueBlocks = [];
  const uniqueSet = new Set();
  const visitCounts = new Map();

  let executedSteps = 0;
  let stopReason = 'budget_exhausted';
  let error = null;
  let returnStep = null;
  let fillFirstHit = null;
  let fillExit = null;

  while (executedSteps < budget) {
    const pc = cpu.pc & 0xFFFFFF;
    orderedBlocks.push(pc);
    recordVisit(visitCounts, uniqueBlocks, uniqueSet, pc);

    if (pc === RETURN_SENTINEL) {
      stopReason = 'returned_sentinel';
      returnStep = executedSteps;
      break;
    }

    if (!fillFirstHit && pc === FILL_LOOP_PC) {
      fillFirstHit = {
        step: executedSteps,
        pc,
        traceIndex: orderedBlocks.length - 1,
      };
    }

    let result;
    try {
      result = cpu.step();
    } catch (traceError) {
      stopReason = 'error';
      error = traceError instanceof Error ? traceError.message : String(traceError);
      break;
    }

    executedSteps += 1;
    const afterPc = cpu.pc & 0xFFFFFF;

    if (fillFirstHit && !fillExit && inFillRange(pc) && !inFillRange(afterPc)) {
      fillExit = {
        step: executedSteps,
        fromPc: pc,
        pc: afterPc,
        traceIndex: orderedBlocks.length,
      };
    }

    if (result === -1) {
      stopReason = 'halt';
      break;
    }
    if (result === -2) {
      stopReason = 'sleep';
      break;
    }
    if (afterPc === RETURN_SENTINEL) {
      stopReason = 'returned_sentinel';
      returnStep = executedSteps;
      break;
    }
  }

  const postFillTrace =
    fillExit?.traceIndex !== undefined ? orderedBlocks.slice(fillExit.traceIndex) : [];
  if (fillExit && postFillTrace.length === 0) {
    postFillTrace.push(fillExit.pc);
  }

  return {
    label: scenario.label,
    description: scenario.description,
    d003e0Value: scenario.d003e0Value,
    executedSteps,
    stopReason,
    error,
    returnStep,
    finalPc: cpu.pc & 0xFFFFFF,
    finalA: cpu.a & 0xFF,
    finalF: cpu.f & 0xFF,
    finalHL: cpu.hl & 0xFFFFFF,
    finalDE: cpu.de & 0xFFFFFF,
    finalBC: cpu.bc & 0xFFFFFF,
    finalSP: cpu.sp & 0xFFFFFF,
    fillFirstHit,
    fillExit,
    orderedBlocks,
    uniqueBlocks,
    visitCounts,
    postFillTrace,
    postFillWindow: postFillTrace.slice(0, POST_FILL_WINDOW),
    visitedClearBranch: (visitCounts.get(CLEAR_BRANCH_PC) ?? 0) > 0,
    visitedSetBranch: (visitCounts.get(SET_BRANCH_PC) ?? 0) > 0,
    bit0SiteVisits: visitCounts.get(BIT0_SITE_BLOCK_PC) ?? 0,
  };
}

function runScenario(blocks, bootMemory, bootCpuSnapshot, scenario) {
  const runtime = createScenarioRuntime(blocks, bootMemory);
  restoreCpu(runtime.cpu, bootCpuSnapshot);
  seedEntryState(runtime.cpu, runtime.mem, scenario.d003e0Value);
  return traceScenario(runtime.cpu, runtime.mem, STEP_BUDGET, scenario);
}

function compareAfterFill(traceA, traceB) {
  if (!traceA.fillExit || !traceB.fillExit) {
    return {
      comparable: false,
      reason: 'fill_incomplete',
    };
  }

  const seqA = traceA.postFillTrace;
  const seqB = traceB.postFillTrace;
  const limit = Math.min(seqA.length, seqB.length);

  let divergenceIndex = null;
  for (let index = 0; index < limit; index++) {
    if (seqA[index] !== seqB[index]) {
      divergenceIndex = index;
      break;
    }
  }

  if (divergenceIndex === null && seqA.length !== seqB.length) {
    divergenceIndex = limit;
  }

  const contextStart =
    divergenceIndex === null ? 0 : Math.max(0, divergenceIndex - DIVERGENCE_CONTEXT_RADIUS);
  const contextEnd =
    divergenceIndex === null
      ? Math.min(limit, POST_FILL_WINDOW)
      : divergenceIndex + DIVERGENCE_CONTEXT_RADIUS + 1;

  const uniquePostA = [...new Set(seqA)];
  const uniquePostB = [...new Set(seqB)];
  const setPostA = new Set(uniquePostA);
  const setPostB = new Set(uniquePostB);

  return {
    comparable: true,
    commonPrefixLength:
      divergenceIndex === null ? limit : divergenceIndex,
    divergenceIndex,
    divergenceStepAfterFill:
      divergenceIndex === null ? null : divergenceIndex + 1,
    divergencePcA:
      divergenceIndex === null ? null : seqA[divergenceIndex] ?? null,
    divergencePcB:
      divergenceIndex === null ? null : seqB[divergenceIndex] ?? null,
    contextA: seqA.slice(contextStart, contextEnd),
    contextB: seqB.slice(contextStart, contextEnd),
    contextStart,
    postFillOnlyA: uniquePostA.filter((pc) => !setPostB.has(pc)),
    postFillOnlyB: uniquePostB.filter((pc) => !setPostA.has(pc)),
  };
}

function formatAddressList(addrs) {
  if (!addrs.length) {
    return ['    (none)'];
  }

  const lines = [];
  let current = '    ';
  for (let index = 0; index < addrs.length; index++) {
    const token = hex(addrs[index]);
    const suffix = index === addrs.length - 1 ? '' : ', ';
    if (current.length + token.length + suffix.length > 100) {
      lines.push(current.trimEnd());
      current = '    ';
    }
    current += token + suffix;
  }
  if (current.trim().length > 0) {
    lines.push(current.trimEnd());
  }
  return lines;
}

function printScenario(trace) {
  console.log('------------------------------------------------------------------------');
  console.log(`${trace.label}: ${trace.description}  D003E0=${hexByte(trace.d003e0Value)}`);
  console.log('------------------------------------------------------------------------');
  console.log(`  Steps:        ${trace.executedSteps}/${STEP_BUDGET}`);
  console.log(`  Stop reason:  ${trace.stopReason}`);
  console.log(`  Final PC:     ${hex(trace.finalPc)}`);
  if (trace.error) {
    console.log(`  Error:        ${trace.error}`);
  }
  console.log(
    `  Final regs:   A=${hexByte(trace.finalA)} F=${hexByte(trace.finalF)} ` +
      `HL=${hex(trace.finalHL)} DE=${hex(trace.finalDE)} BC=${hex(trace.finalBC)} SP=${hex(trace.finalSP)}`,
  );
  console.log('');

  console.log(
    `  Visited ${hex(CLEAR_BRANCH_PC)}: ${trace.visitedClearBranch ? 'YES' : 'NO'} ` +
      `(count=${trace.visitCounts.get(CLEAR_BRANCH_PC) ?? 0})`,
  );
  console.log(
    `  Visited ${hex(SET_BRANCH_PC)}:   ${trace.visitedSetBranch ? 'YES' : 'NO'} ` +
      `(count=${trace.visitCounts.get(SET_BRANCH_PC) ?? 0})`,
  );
  console.log(
    `  Visited ${hex(FILL_LOOP_PC)}: ${trace.fillFirstHit ? 'YES' : 'NO'} ` +
      `(count=${trace.visitCounts.get(FILL_LOOP_PC) ?? 0})`,
  );
  console.log(
    `  Visited ${hex(BIT0_SITE_PC)}:   ${trace.bit0SiteVisits > 0 ? 'YES' : 'NO'} ` +
      `(count=${trace.bit0SiteVisits}, via block ${hex(BIT0_SITE_BLOCK_PC)})`,
  );
  console.log('');

  console.log(`  Total unique blocks: ${trace.uniqueBlocks.length}`);
  console.log(
    `  Fill first hit:      ` +
      `${trace.fillFirstHit ? `step ${trace.fillFirstHit.step} at ${hex(trace.fillFirstHit.pc)}` : 'not reached'}`,
  );
  console.log(
    `  Fill exit:           ` +
      `${trace.fillExit ? `step ${trace.fillExit.step} ${hex(trace.fillExit.fromPc)} -> ${hex(trace.fillExit.pc)}` : 'not observed'}`,
  );
  console.log('');

  console.log(`  First ${POST_FILL_WINDOW} blocks after fill completion:`);
  for (const line of formatAddressList(trace.postFillWindow)) {
    console.log(line);
  }
  console.log('');
}

function printComparison(comparison) {
  console.log('========================================================================');
  console.log('POST-FILL COMPARISON');
  console.log('========================================================================');

  if (!comparison.comparable) {
    console.log(`  Comparison unavailable: ${comparison.reason}`);
    console.log('');
    return;
  }

  console.log(`  Common post-fill prefix length: ${comparison.commonPrefixLength}`);
  console.log(
    `  First divergence after fill: ` +
      `${comparison.divergenceStepAfterFill ?? 'none observed within budget'}`,
  );
  console.log(`  Scenario A PC: ${hex(comparison.divergencePcA)}`);
  console.log(`  Scenario B PC: ${hex(comparison.divergencePcB)}`);
  console.log('');

  console.log(`  Scenario A context from post-fill index ${comparison.contextStart}:`);
  for (const line of formatAddressList(comparison.contextA)) {
    console.log(line);
  }
  console.log('');

  console.log(`  Scenario B context from post-fill index ${comparison.contextStart}:`);
  for (const line of formatAddressList(comparison.contextB)) {
    console.log(line);
  }
  console.log('');

  console.log(`  Scenario A-only post-fill unique blocks (${comparison.postFillOnlyA.length}):`);
  for (const line of formatAddressList(comparison.postFillOnlyA)) {
    console.log(line);
  }
  console.log('');

  console.log(`  Scenario B-only post-fill unique blocks (${comparison.postFillOnlyB.length}):`);
  for (const line of formatAddressList(comparison.postFillOnlyB)) {
    console.log(line);
  }
  console.log('');
}

async function main() {
  const romBytes = fs.readFileSync(ROM_PATH);
  const assets = ensureTranspiledModule();

  try {
    const romModule = await import(pathToFileURL(assets.modulePath).href);
    const blocks = normalizeBlocks(
      romModule.PRELIFTED_BLOCKS ??
        romModule.default?.PRELIFTED_BLOCKS ??
        romModule.default ??
        romModule,
    );

    const runtime = createRuntime(romBytes, blocks);
    const bootSummary = coldBoot(runtime.executor, runtime.cpu, runtime.mem);
    const bootMemory = new Uint8Array(runtime.mem);
    const bootCpuSnapshot = snapshotCpu(runtime.cpu);
    const bit0SiteIsLiftedBlock = Boolean(blocks[`${hex(BIT0_SITE_PC).slice(2).toLowerCase()}:adl`]);

    console.log('Phase 241: 0x04EDDD BIT 0 gate with 120K-step traces');
    console.log(`ROM: ${path.basename(ROM_PATH)} (${romBytes.length} bytes)`);
    console.log(
      `Transpiled blocks: ${assets.source === 'js' ? 'ROM.transpiled.js' : 'ROM.transpiled.js.gz'}`,
    );
    console.log('Peripheral seed: pllDelay=2 timerInterrupt=false');
    console.log(
      `Entry seed: PC=${hex(ENTRY_PC)} A=${hexByte(ENTRY_A)} F=${hexByte(ENTRY_F)} ` +
        `SP=${hex(STACK_TOP)} IX=${hex(IX_BASE)} IY=${hex(IY_BASE)} MBASE=${hexByte(MBASE)}`,
    );
    console.log(`Per-scenario budget: ${STEP_BUDGET} block steps`);
    console.log(
      `Fill range: ${hex(FILL_RANGE_START)}..${hex(FILL_RANGE_END - 1)} ` +
        `(loop block ${hex(FILL_LOOP_PC)})`,
    );
    console.log(
      `BIT site accounting: ${hex(BIT0_SITE_PC)} ` +
        `${bit0SiteIsLiftedBlock ? 'is a lifted block' : `is inside lifted block ${hex(BIT0_SITE_BLOCK_PC)}`}`,
    );
    console.log('');

    console.log(
      `Cold boot summary: boot=${bootSummary.boot.steps}/${bootSummary.boot.termination} ` +
        `kernel=${bootSummary.kernel.steps}/${bootSummary.kernel.termination} ` +
        `post=${bootSummary.post.steps}/${bootSummary.post.termination}`,
    );
    console.log('');

    const traces = SCENARIOS.map((scenario) =>
      runScenario(blocks, bootMemory, bootCpuSnapshot, scenario),
    );
    const [traceA, traceB] = traces;
    const comparison = compareAfterFill(traceA, traceB);

    printScenario(traceA);
    printScenario(traceB);
    printComparison(comparison);

    console.log('========================================================================');
    console.log('SUMMARY');
    console.log('========================================================================');
    console.log(
      `  Scenario A (${hexByte(traceA.d003e0Value)}): ` +
        `${traceA.visitedClearBranch ? 'hit 0x04E447' : 'did not hit 0x04E447'}, ` +
        `${traceA.visitedSetBranch ? 'hit 0x0850D1' : 'did not hit 0x0850D1'}`,
    );
    console.log(
      `  Scenario B (${hexByte(traceB.d003e0Value)}): ` +
        `${traceB.visitedClearBranch ? 'hit 0x04E447' : 'did not hit 0x04E447'}, ` +
        `${traceB.visitedSetBranch ? 'hit 0x0850D1' : 'did not hit 0x0850D1'}`,
    );
    console.log(
      `  First post-fill divergence: ` +
        `${comparison.comparable ? comparison.divergenceStepAfterFill ?? 'none observed' : comparison.reason}`,
    );
    if (comparison.comparable && comparison.divergenceStepAfterFill !== null) {
      console.log(
        `    Scenario A -> ${hex(comparison.divergencePcA)}; ` +
          `Scenario B -> ${hex(comparison.divergencePcB)}`,
      );
    }
    console.log('');
  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
