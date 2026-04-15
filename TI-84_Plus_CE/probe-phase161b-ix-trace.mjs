#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const ROM_LIMIT = 0x400000;
const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xE00000;

const VRAM_BASE = 0xD40000;
const VRAM_BYTE_SIZE = 320 * 240 * 2;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;

const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STACK_RESET_TOP = 0xD1A87E;
const STAGE_MAX_LOOP_ITERATIONS = 500;

const MODE_BUF_START = 0xD020A6;
const MODE_BUF_TEXT = 'Normal Float Radian       ';

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const STAGES = [
  {
    id: 'stage1',
    label: 'Stage 1',
    name: 'status_bar_bg',
    entry: 0x0A2B72,
    maxSteps: 30000,
    expectedOutcome: 'breaks',
  },
  {
    id: 'stage2',
    label: 'Stage 2',
    name: 'status_dots',
    entry: 0x0A3301,
    maxSteps: 30000,
    expectedOutcome: 'works',
  },
  {
    id: 'stage3',
    label: 'Stage 3',
    name: 'home_row_strip',
    entry: 0x0A29EC,
    maxSteps: 50000,
    seedModeBuffer: true,
    expectedOutcome: 'breaks',
  },
];

const ixBlockAnalysisCache = new Map();

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function clearVram(mem) {
  mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);
}

function coldBoot(executor, cpu, mem) {
  const result = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return result;
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreStageState(cpu, snapshot, mem, ramSnapshot) {
  mem.set(ramSnapshot, RAM_SNAPSHOT_START);
  clearVram(mem);

  for (const field of CPU_SNAPSHOT_FIELDS) {
    cpu[field] = snapshot[field];
  }

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu.sp = STACK_RESET_TOP - 12;
  cpu._ix = cpu.sp;
  mem.fill(0xFF, cpu.sp, 12);
}

function seedModeBuffer(mem) {
  for (let index = 0; index < MODE_BUF_TEXT.length; index += 1) {
    mem[MODE_BUF_START + index] = MODE_BUF_TEXT.charCodeAt(index);
  }
}

function safeDecode(pc, mode) {
  try {
    return decodeInstruction(romBytes, pc, mode);
  } catch {
    return null;
  }
}

function isIxRegister(value) {
  return value === 'ix' || value === 'ixh' || value === 'ixl';
}

function mentionsIxText(text) {
  if (!text) {
    return false;
  }

  return /\bix\b|\bixh\b|\bixl\b|\(ix(?:[+-]\d+)?\)/i.test(text);
}

function looksLikeIxWriteText(text) {
  if (!text) {
    return false;
  }

  return /^(ld\s+ix[hl]?,|pop\s+ix\b|lea\s+ix,|inc\s+ix[hl]?\b|dec\s+ix[hl]?\b|add\s+ix,|adc\s+ix,|sbc\s+ix,|ex\s+\(sp\),\s*ix\b)/i.test(text);
}

function analyzeIxInstruction(decoded, fallbackInstruction) {
  const fallbackDasm = fallbackInstruction?.dasm ?? 'n/a';
  const instructionPc = fallbackInstruction?.pc ?? decoded?.pc ?? null;
  let reads = false;
  let writes = false;

  if (decoded) {
    switch (decoded.tag) {
      case 'ld-pair-imm':
        writes = decoded.pair === 'ix';
        break;
      case 'ld-mem-pair':
        reads = decoded.pair === 'ix';
        break;
      case 'inc-pair':
      case 'dec-pair':
        reads = decoded.pair === 'ix';
        writes = decoded.pair === 'ix';
        break;
      case 'ld-pair-mem':
        writes = decoded.pair === 'ix';
        break;
      case 'add-pair':
        reads = decoded.dest === 'ix' || decoded.src === 'ix';
        writes = decoded.dest === 'ix';
        break;
      case 'ld-ixd-imm':
        reads = decoded.indexRegister === 'ix';
        break;
      case 'ld-reg-ixd':
        reads = decoded.indexRegister === 'ix';
        writes = isIxRegister(decoded.dest);
        break;
      case 'ld-ixd-reg':
        reads = decoded.indexRegister === 'ix' || isIxRegister(decoded.src);
        break;
      case 'alu-ixd':
        reads = decoded.indexRegister === 'ix';
        break;
      case 'pop':
        writes = decoded.pair === 'ix';
        break;
      case 'push':
        reads = decoded.pair === 'ix';
        break;
      case 'jp-indirect':
        reads = decoded.indirectRegister === 'ix';
        break;
      case 'ld-sp-pair':
        reads = decoded.pair === 'ix';
        break;
      case 'ex-sp-pair':
        reads = decoded.pair === 'ix';
        writes = decoded.pair === 'ix';
        break;
      case 'ld-reg-reg':
        reads = isIxRegister(decoded.src);
        writes = isIxRegister(decoded.dest);
        break;
      case 'alu-reg':
        reads = isIxRegister(decoded.src);
        break;
      case 'inc-reg':
      case 'dec-reg':
        reads = isIxRegister(decoded.reg);
        writes = isIxRegister(decoded.reg);
        break;
      case 'ld-reg-imm':
        writes = isIxRegister(decoded.dest);
        break;
      case 'ld-pair-indexed':
        reads = decoded.indexRegister === 'ix';
        writes = decoded.pair === 'ix';
        break;
      case 'ld-indexed-pair':
        reads = decoded.indexRegister === 'ix' || decoded.pair === 'ix';
        break;
      case 'ld-ixiy-indexed':
        reads = decoded.indexRegister === 'ix';
        writes = decoded.dest === 'ix';
        break;
      case 'ld-indexed-ixiy':
        reads = decoded.indexRegister === 'ix' || decoded.src === 'ix';
        break;
      case 'lea':
        reads = decoded.base === 'ix';
        writes = decoded.dest === 'ix';
        break;
      case 'ld-pair-ind':
        reads = decoded.src === 'ix';
        writes = decoded.pair === 'ix';
        break;
      case 'ld-ind-pair':
        reads = decoded.pair === 'ix';
        writes = decoded.dest === 'ix';
        break;
      case 'rotate-reg':
      case 'bit-test':
        reads = isIxRegister(decoded.reg);
        break;
      case 'bit-res':
      case 'bit-set':
        reads = isIxRegister(decoded.reg);
        writes = isIxRegister(decoded.reg);
        break;
      case 'indexed-cb-rotate':
      case 'indexed-cb-bit':
      case 'indexed-cb-res':
      case 'indexed-cb-set':
        reads = decoded.indexRegister === 'ix';
        break;
      default:
        break;
    }
  }

  if (!reads && !writes && mentionsIxText(fallbackDasm)) {
    reads = true;
    writes = looksLikeIxWriteText(fallbackDasm);
  }

  if (!reads && !writes) {
    return null;
  }

  return {
    pc: instructionPc,
    dasm: fallbackDasm,
    tag: decoded?.tag ?? fallbackInstruction?.tag ?? null,
    reads,
    writes,
  };
}

function analyzeBlockIx(meta, mode) {
  const cacheKey = `${meta?.startPc ?? 'n/a'}:${mode}`;
  const cached = ixBlockAnalysisCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const instructions = meta?.instructions ?? [];
  const ixInstructions = [];

  for (const instruction of instructions) {
    const decoded = safeDecode(instruction.pc, instruction.mode ?? mode);
    const access = analyzeIxInstruction(decoded, instruction);
    if (!access) {
      continue;
    }

    ixInstructions.push({
      pc: access.pc ?? instruction.pc,
      dasm: access.dasm,
      tag: access.tag,
      reads: access.reads,
      writes: access.writes,
    });
  }

  const analysis = {
    readsIx: ixInstructions.some((instruction) => instruction.reads),
    writesIx: ixInstructions.some((instruction) => instruction.writes),
    ixInstructions,
    lastWriter: null,
  };

  for (let index = ixInstructions.length - 1; index >= 0; index -= 1) {
    if (ixInstructions[index].writes) {
      analysis.lastWriter = ixInstructions[index];
      break;
    }
  }

  ixBlockAnalysisCache.set(cacheKey, analysis);
  return analysis;
}

function createIxTraceRecorder(cpu) {
  const rows = [];

  return {
    onBlock(pc, mode, meta, steps) {
      const analysis = analyzeBlockIx(meta, mode);

      rows.push({
        step: steps + 1,
        pc: pc & 0xFFFFFF,
        mode,
        ix: cpu._ix & 0xFFFFFF,
        readsIx: analysis.readsIx,
        writesIx: analysis.writesIx,
        ixInstructions: analysis.ixInstructions,
        lastWriter: analysis.lastWriter,
      });
    },

    getRows() {
      return rows.slice();
    },
  };
}

function formatInstruction(instruction) {
  if (!instruction) {
    return 'unknown instruction';
  }

  const tagText = instruction.tag ? ` [tag=${instruction.tag}]` : '';
  return `${instruction.dasm} @ ${hex(instruction.pc)}${tagText}`;
}

function buildTouchSummary(rows) {
  const byBlock = new Map();

  for (const row of rows) {
    if (!row.readsIx && !row.writesIx) {
      continue;
    }

    const key = `${row.pc}:${row.mode}`;
    let entry = byBlock.get(key);

    if (!entry) {
      entry = {
        pc: row.pc,
        mode: row.mode,
        visits: 0,
        firstStep: row.step,
        lastStep: row.step,
        readsIx: false,
        writesIx: false,
        instructionTexts: new Set(),
      };
      byBlock.set(key, entry);
    }

    entry.visits += 1;
    entry.firstStep = Math.min(entry.firstStep, row.step);
    entry.lastStep = Math.max(entry.lastStep, row.step);
    entry.readsIx = entry.readsIx || row.readsIx;
    entry.writesIx = entry.writesIx || row.writesIx;

    for (const instruction of row.ixInstructions) {
      entry.instructionTexts.add(formatInstruction(instruction));
    }
  }

  return [...byBlock.values()]
    .sort((left, right) => left.firstStep - right.firstStep || left.pc - right.pc)
    .map((entry) => ({
      ...entry,
      instructionTexts: [...entry.instructionTexts],
    }));
}

function buildTransitions(rows) {
  const transitions = [];

  for (let index = 1; index < rows.length; index += 1) {
    const previous = rows[index - 1];
    const current = rows[index];

    if (current.ix === previous.ix) {
      continue;
    }

    transitions.push({
      step: current.step,
      pc: current.pc,
      ix: current.ix,
      previousIx: previous.ix,
      changeBlockPc: previous.pc,
      changeBlockStep: previous.step,
      changeInstruction: previous.lastWriter,
    });
  }

  return transitions;
}

function findFirstRomIx(rows, transitions) {
  const romRow = rows.find((row) => row.ix < ROM_LIMIT);
  if (!romRow) {
    return null;
  }

  const transition = transitions.find((candidate) => candidate.step === romRow.step) ?? null;

  return {
    step: romRow.step,
    pc: romRow.pc,
    ix: romRow.ix,
    previousIx: transition?.previousIx ?? null,
    changeBlockPc: transition?.changeBlockPc ?? null,
    changeBlockStep: transition?.changeBlockStep ?? null,
    changeInstruction: transition?.changeInstruction ?? null,
  };
}

function accessKind(readsIx, writesIx) {
  if (readsIx && writesIx) {
    return 'read/write';
  }

  if (writesIx) {
    return 'write';
  }

  return 'read';
}

function printTouchSummary(summary) {
  console.log('IX-touch blocks:');

  if (summary.length === 0) {
    console.log('  none');
    return;
  }

  for (const block of summary) {
    const stepText = block.firstStep === block.lastStep
      ? `${block.firstStep}`
      : `${block.firstStep}-${block.lastStep}`;

    console.log(
      `  ${hex(block.pc)} [${accessKind(block.readsIx, block.writesIx)}, visits=${block.visits}, steps=${stepText}] ${block.instructionTexts.join(' | ')}`,
    );
  }
}

function printTransitions(transitions) {
  console.log('IX transitions:');

  if (transitions.length === 0) {
    console.log('  none');
    return;
  }

  const stepWidth = String(transitions[transitions.length - 1].step).length;

  for (const transition of transitions) {
    const viaText = transition.changeInstruction
      ? ` via ${formatInstruction(transition.changeInstruction)}`
      : '';

    console.log(
      `  Step ${String(transition.step).padStart(stepWidth)}: PC=${hex(transition.pc)} IX=${hex(transition.ix)} (changed from ${hex(transition.previousIx)} at block ${hex(transition.changeBlockPc)}${viaText})`,
    );
  }
}

function printCorruption(firstRomIx) {
  if (!firstRomIx) {
    console.log('IX corruption point: none; IX stayed in RAM space.');
    return;
  }

  const viaText = firstRomIx.changeInstruction
    ? ` via ${formatInstruction(firstRomIx.changeInstruction)}`
    : '';

  console.log(
    `IX corruption point: block ${hex(firstRomIx.changeBlockPc)} at step ${firstRomIx.changeBlockStep} set IX from ${hex(firstRomIx.previousIx)} to ${hex(firstRomIx.ix)}${viaText}`,
  );
}

function describeComparison(stageReport) {
  if (!stageReport.firstRomIx) {
    return `${stageReport.stage.label} (${stageReport.stage.expectedOutcome}): IX stays valid through step ${stageReport.result.steps}, first ROM-space IX: never`;
  }

  const instructionText = stageReport.firstRomIx.changeInstruction
    ? ` (${stageReport.firstRomIx.changeInstruction.dasm})`
    : '';

  return `${stageReport.stage.label} (${stageReport.stage.expectedOutcome}): IX enters ROM space at step ${stageReport.firstRomIx.step} via block ${hex(stageReport.firstRomIx.changeBlockPc)}${instructionText}`;
}

function pickDivergenceBlock(stage1Report, stage2Report, stage3Report) {
  const stage2Writers = new Set(
    stage2Report.touchSummary
      .filter((block) => block.writesIx)
      .map((block) => block.pc),
  );

  const stage1Writers = new Map(
    stage1Report.touchSummary
      .filter((block) => block.writesIx)
      .map((block) => [block.pc, block]),
  );

  const stage3Writers = new Map(
    stage3Report.touchSummary
      .filter((block) => block.writesIx)
      .map((block) => [block.pc, block]),
  );

  const candidates = [];

  for (const [pc, stage1Block] of stage1Writers.entries()) {
    const stage3Block = stage3Writers.get(pc);
    if (!stage3Block || stage2Writers.has(pc)) {
      continue;
    }

    candidates.push({
      pc,
      firstStep: Math.min(stage1Block.firstStep, stage3Block.firstStep),
      instructionText: stage1Block.instructionTexts[0] ?? stage3Block.instructionTexts[0] ?? 'unknown instruction',
    });
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => left.firstStep - right.firstStep || left.pc - right.pc);
  return candidates[0];
}

function runStage(executor, cpu, stage, cpuSnapshot, mem, ramSnapshot) {
  restoreStageState(cpu, cpuSnapshot, mem, ramSnapshot);

  if (stage.seedModeBuffer) {
    seedModeBuffer(mem);
  }

  const ixAtEntry = cpu._ix & 0xFFFFFF;
  const trace = createIxTraceRecorder(cpu);
  const result = executor.runFrom(stage.entry, 'adl', {
    maxSteps: stage.maxSteps,
    maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS,
    onBlock: trace.onBlock,
  });

  const rows = trace.getRows();
  const touchSummary = buildTouchSummary(rows);
  const transitions = buildTransitions(rows);
  const firstRomIx = findFirstRomIx(rows, transitions);

  return {
    stage,
    result,
    ixAtEntry,
    finalIx: cpu._ix & 0xFFFFFF,
    rows,
    touchSummary,
    transitions,
    firstRomIx,
  };
}

function printStageReport(stageReport) {
  console.log(`=== Stage: ${stageReport.stage.name} (entry: ${hex(stageReport.stage.entry)}) ===`);
  console.log(`IX at entry: ${hex(stageReport.ixAtEntry)}`);
  printTouchSummary(stageReport.touchSummary);
  printTransitions(stageReport.transitions);
  console.log(
    `Final IX: ${hex(stageReport.finalIx)}, Steps: ${stageReport.result.steps}, Termination: ${stageReport.result.termination}, Last PC: ${hex(stageReport.result.lastPc)}`,
  );
  printCorruption(stageReport.firstRomIx);
  console.log('');
}

async function main() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  clearVram(mem);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const bootResult = coldBoot(executor, cpu, mem);
  const ramSnapshot = new Uint8Array(mem.slice(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END));
  const cpuSnapshot = snapshotCpu(cpu);

  console.log('=== Phase 161b - IX Trace ===');
  console.log(`Boot: steps=${bootResult.steps}, termination=${bootResult.termination}, lastPc=${hex(bootResult.lastPc)}`);
  console.log('');

  const reports = STAGES.map((stage) => runStage(executor, cpu, stage, cpuSnapshot, mem, ramSnapshot));

  for (const report of reports) {
    printStageReport(report);
  }

  const stage1Report = reports.find((report) => report.stage.id === 'stage1');
  const stage2Report = reports.find((report) => report.stage.id === 'stage2');
  const stage3Report = reports.find((report) => report.stage.id === 'stage3');
  const divergence = pickDivergenceBlock(stage1Report, stage2Report, stage3Report);

  console.log('=== COMPARISON ===');
  console.log(describeComparison(stage2Report));
  console.log(describeComparison(stage1Report));
  console.log(describeComparison(stage3Report));

  if (divergence) {
    console.log(
      `Divergence block: ${hex(divergence.pc)} (${divergence.instructionText})`,
    );
  } else {
    console.log('Divergence block: none identified from bad-stage-exclusive IX-writer blocks.');
  }
}

try {
  await main();
} catch (error) {
  console.error('Phase 161b IX trace failed.');
  console.error(error?.stack ?? error?.message ?? String(error));
  process.exitCode = 1;
}
