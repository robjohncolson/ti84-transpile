#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS ?? romModule.default?.PRELIFTED_BLOCKS ?? romModule.default ?? romModule;

const MEM_SIZE = 0x1000000;
const STACK_RESET_TOP = 0xD1A87E;
const PHASE2_TARGETS = {
  bc31: '00bc31',
  bc47: '00bc47',
  bc72: '00bc72',
};

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hex8(value) {
  return hex(value, 2);
}

function formatCount(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function countUniqueBlocks(result) {
  return Object.keys(result.blockVisits ?? {}).length;
}

function reg24(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return Number(value) & 0xFFFFFF;
    }
  }
  return null;
}

function reg8(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null) {
      return Number(value) & 0xFF;
    }
  }
  return null;
}

function snapshotCpu(cpu) {
  return {
    sp: reg24(cpu.sp),
    ix: reg24(cpu._ix, cpu.ix),
    iy: reg24(cpu._iy, cpu.iy),
    hl: reg24(cpu._hl, cpu.hl),
    bc: reg24(cpu._bc, cpu.bc),
    de: reg24(cpu._de, cpu.de),
    a: reg8(cpu.a),
    f: reg8(cpu.f),
    mbase: reg8(cpu.mbase),
    madl: Number(cpu.madl ?? 0),
    halted: Boolean(cpu.halted),
    iff1: Number(cpu.iff1 ?? 0),
    iff2: Number(cpu.iff2 ?? 0),
  };
}

function formatCpuState(state) {
  return [
    `SP=${hex(state.sp)}`,
    `IX=${hex(state.ix)}`,
    `IY=${hex(state.iy)}`,
    `HL=${hex(state.hl)}`,
    `BC=${hex(state.bc)}`,
    `DE=${hex(state.de)}`,
    `A=${hex8(state.a)}`,
    `F=${hex8(state.f)}`,
    `MBASE=${hex8(state.mbase)}`,
    `MADL=${state.madl}`,
    `HALT=${state.halted ? 1 : 0}`,
    `IFF1=${state.iff1}`,
    `IFF2=${state.iff2}`,
  ].join(' ');
}

function formatMissingBlocks(result) {
  const missing = result.missingBlocks ?? [];
  return missing.length === 0 ? 'none' : missing.join(', ');
}

function resetForPhase2(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
}

function resetForPhase3(cpu, mem) {
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
}

function createTargetTrace(label) {
  return {
    label,
    hits: 0,
    firstStep: null,
    firstMode: null,
    firstEntry: null,
    precedingBlocks: [],
  };
}

function createPhase2Trace() {
  return {
    recentBlocks: [],
    bc31: createTargetTrace('0x00BC31'),
    bc47: createTargetTrace('0x00BC47'),
    bc72: createTargetTrace('0x00BC72'),
  };
}

function recordTarget(trace, target, entry, mode, step, precedingBlocks) {
  target.hits++;
  if (target.firstStep !== null) {
    return null;
  }

  target.firstStep = step;
  target.firstMode = mode;
  target.firstEntry = entry;
  target.precedingBlocks = precedingBlocks.slice(-10);
  return target;
}

function recordPhase2Block(trace, pc, mode, step) {
  const normalizedPc = pc & 0xFFFFFF;
  const normalizedMode = mode ?? 'adl';
  const key = normalizedPc.toString(16).padStart(6, '0');
  const entry = `${key}:${normalizedMode}`;
  const precedingBlocks = [...trace.recentBlocks];
  let firstHit = null;

  if (key === PHASE2_TARGETS.bc31) {
    firstHit = recordTarget(trace, trace.bc31, entry, normalizedMode, step, precedingBlocks);
  } else if (key === PHASE2_TARGETS.bc47) {
    firstHit = recordTarget(trace, trace.bc47, entry, normalizedMode, step, precedingBlocks);
  } else if (key === PHASE2_TARGETS.bc72) {
    firstHit = recordTarget(trace, trace.bc72, entry, normalizedMode, step, precedingBlocks);
  }

  trace.recentBlocks.push(entry);
  if (trace.recentBlocks.length > 10) {
    trace.recentBlocks.shift();
  }

  return firstHit;
}

function printPhaseSummary(label, result, cpuState) {
  console.log(label);
  console.log(
    `  steps=${formatCount(result.steps)} termination=${result.termination} ` +
    `lastPc=${hex(result.lastPc)} lastMode=${result.lastMode ?? 'adl'}`,
  );
  console.log(
    `  uniqueBlocks=${formatCount(countUniqueBlocks(result))} loopsForced=${formatCount(result.loopsForced)}`,
  );
  console.log(`  missingBlocks=${formatMissingBlocks(result)}`);
  console.log(`  cpu=${formatCpuState(cpuState)}`);
}

function printTargetSummary(target) {
  if (target.firstStep === null) {
    console.log(`  ${target.label}: not reached`);
    return;
  }

  console.log(
    `  ${target.label}: reached at step ${formatCount(target.firstStep)} ` +
    `via ${target.firstEntry} hits=${formatCount(target.hits)}`,
  );
}

const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes);

const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const { cpu } = executor;

console.log('=== Phase 369: BC31 Extended Boot Probe ===\n');
console.log('Boot plan:');
console.log('  Phase 1: 0x000000:z80, 20K steps');
console.log('  Phase 2: 0x08C331:adl, 500K steps, traced');
console.log('  Phase 3: 0x0802B2:adl, 100 steps\n');

const phase1 = executor.runFrom(0x000000, 'z80', {
  maxSteps: 20000,
  maxLoopIterations: 32,
});
const phase1State = snapshotCpu(cpu);

resetForPhase2(cpu, mem);

const phase2Trace = createPhase2Trace();
const phase2 = executor.runFrom(0x08C331, 'adl', {
  maxSteps: 500000,
  maxLoopIterations: 10000,
  onBlock: (pc, mode, _meta, step) => {
    const hit = recordPhase2Block(phase2Trace, pc, mode, step);
    if (!hit) {
      return;
    }

    console.log(`First ${hit.label} at step ${formatCount(hit.firstStep)} via ${hit.firstEntry}`);
    if (hit.label === '0x00BC31') {
      if (hit.precedingBlocks.length === 0) {
        console.log('  prior 10 blocks: none');
      } else {
        console.log('  prior 10 blocks:');
        for (const block of hit.precedingBlocks) {
          console.log(`    ${block}`);
        }
      }
    }
  },
});
const phase2State = snapshotCpu(cpu);

resetForPhase3(cpu, mem);

const phase3 = executor.runFrom(0x0802B2, 'adl', {
  maxSteps: 100,
  maxLoopIterations: 32,
});
const phase3State = snapshotCpu(cpu);

console.log('\n--- Phase Summary ---');
printPhaseSummary('Phase 1 (Z80 cold boot)', phase1, phase1State);
printPhaseSummary('Phase 2 (Extended kernel init)', phase2, phase2State);
printPhaseSummary('Phase 3 (Post-init)', phase3, phase3State);

console.log('\n--- Phase 2 Watched Blocks ---');
printTargetSummary(phase2Trace.bc31);
printTargetSummary(phase2Trace.bc47);
printTargetSummary(phase2Trace.bc72);

console.log('\n--- Requested Answer ---');
console.log(
  `Unique blocks per phase: ` +
  `P1=${formatCount(countUniqueBlocks(phase1))}, ` +
  `P2=${formatCount(countUniqueBlocks(phase2))}, ` +
  `P3=${formatCount(countUniqueBlocks(phase3))}`,
);
console.log(`Phase 2 termination: ${phase2.termination}`);
console.log(`Phase 2 missing blocks: ${formatMissingBlocks(phase2)}`);
console.log(`Phase 2 CPU at termination: ${formatCpuState(phase2State)}`);

if (phase2Trace.bc31.firstStep === null) {
  console.log('0x00BC31 was not reached during Phase 2.');
} else {
  console.log(`0x00BC31 was reached during Phase 2 at step ${formatCount(phase2Trace.bc31.firstStep)}.`);
  console.log('The 10 blocks immediately before 0x00BC31 were:');
  if (phase2Trace.bc31.precedingBlocks.length === 0) {
    console.log('  none');
  } else {
    for (const block of phase2Trace.bc31.precedingBlocks) {
      console.log(`  ${block}`);
    }
  }
}

console.log('\nDone.');
