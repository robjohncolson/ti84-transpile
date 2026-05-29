#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MEM_SIZE = 0x1000000;
const TARGET_ADDR = 0xD177BA;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;

const KERNEL_INIT_ENTRY = 0x08C331;
const KERNEL_INIT_MAX_STEPS = 100000;
const KERNEL_INIT_MAX_LOOP_ITERATIONS = 10000;

const POST_INIT_ENTRY = 0x0802B2;
const POST_INIT_MAX_STEPS = 100;
const POST_INIT_MAX_LOOP_ITERATIONS = 32;

const REDUCED_HANDLER_ENTRY = 0x0019BE;
const REDUCED_HANDLER_MAX_STEPS = 500000;
const REDUCED_HANDLER_MAX_LOOP_ITERATIONS = 20000;

const STACK_RESET_TOP = 0xD1A87E;
const PROGRESS_INTERVAL = 100000;

function hex(value, width = 2) {
  if (value === undefined || value === null || value < 0) {
    return 'n/a';
  }

  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function resetStack(cpu, mem, size = 3) {
  cpu.sp = STACK_RESET_TOP - size;
  mem.fill(0xFF, cpu.sp, cpu.sp + size);
}

function clearPendingInterrupts(peripherals) {
  peripherals.acknowledgeIRQ?.();
  peripherals.acknowledgeNMI?.();
}

function installTargetWriteHook(cpu, mem) {
  const writes = [];
  let currentPhase = 'idle';
  let currentStep = 0;
  let currentPc = null;

  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  function recordByte(kind, baseAddr, byteOffset, value) {
    const addr = ((baseAddr & 0xFFFFFF) + byteOffset) & 0xFFFFFF;
    if (addr !== TARGET_ADDR) {
      return;
    }

    const oldValue = mem[TARGET_ADDR] ?? 0x00;
    const newValue = (value >>> (byteOffset * 8)) & 0xFF;
    const entry = {
      phase: currentPhase,
      step: currentStep,
      pc: currentPc,
      kind,
      baseAddr: baseAddr & 0xFFFFFF,
      byteOffset,
      oldValue,
      newValue,
    };

    writes.push(entry);

    console.log(
      `  write[${writes.length}] step=${entry.step} phase=${entry.phase} pc=${hex(entry.pc, 6)} old=${hex(entry.oldValue, 2)} new=${hex(entry.newValue, 2)} via=${entry.kind} base=${hex(entry.baseAddr, 6)}+${entry.byteOffset}`,
    );
  }

  cpu.write8 = (addr, value) => {
    recordByte('write8', addr, 0, value);
    return origWrite8(addr, value);
  };

  // Wide writes bypass write8 in this runtime, so mirror overlapping bytes here.
  cpu.write16 = (addr, value) => {
    recordByte('write16', addr, 0, value);
    recordByte('write16', addr, 1, value);
    return origWrite16(addr, value);
  };

  cpu.write24 = (addr, value) => {
    recordByte('write24', addr, 0, value);
    recordByte('write24', addr, 1, value);
    recordByte('write24', addr, 2, value);
    return origWrite24(addr, value);
  };

  return {
    writes,
    setContext(phase, step, pc) {
      currentPhase = phase;
      currentStep = step;
      currentPc = pc;
    },
    restore() {
      cpu.write8 = origWrite8;
      cpu.write16 = origWrite16;
      cpu.write24 = origWrite24;
    },
  };
}

function runStage(executor, hook, {
  label,
  entry,
  mode,
  maxSteps,
  maxLoopIterations,
  stepBase,
  progressEvery = 0,
}) {
  let nextProgress = progressEvery > 0
    ? stepBase + progressEvery
    : Number.POSITIVE_INFINITY;

  hook.setContext(label, stepBase, entry);
  console.log(`run ${label}: entry=${hex(entry, 6)} mode=${mode} maxSteps=${maxSteps}`);

  const result = executor.runFrom(entry, mode, {
    maxSteps,
    maxLoopIterations,
    onBlock(pc, _mode, _meta, steps) {
      const absoluteStep = stepBase + steps + 1;
      hook.setContext(label, absoluteStep, pc);

      if (absoluteStep < nextProgress) {
        return;
      }

      console.log(`  progress ${label}: step=${absoluteStep} pc=${hex(pc, 6)}`);
      nextProgress += progressEvery;
    },
  });

  console.log(
    `result ${label}: steps=${result.steps} term=${result.termination} lastPc=${hex(result.lastPc, 6)} lastMode=${result.lastMode ?? 'n/a'}`,
  );

  return {
    label,
    entry,
    mode,
    result,
    stepBase,
    stepEnd: stepBase + result.steps,
  };
}

function summarizeWritesByPc(writes) {
  const byPc = new Map();

  for (const write of writes) {
    const key = `${write.phase}:${write.pc ?? 'n/a'}`;
    let summary = byPc.get(key);

    if (!summary) {
      summary = {
        phase: write.phase,
        pc: write.pc,
        count: 0,
        firstStep: write.step,
        lastStep: write.step,
        kinds: new Set(),
        values: new Set(),
      };
      byPc.set(key, summary);
    }

    summary.count++;
    summary.firstStep = Math.min(summary.firstStep, write.step);
    summary.lastStep = Math.max(summary.lastStep, write.step);
    summary.kinds.add(write.kind);
    summary.values.add(write.newValue);
  }

  return [...byPc.values()]
    .map((summary) => ({
      phase: summary.phase,
      pc: summary.pc,
      count: summary.count,
      firstStep: summary.firstStep,
      lastStep: summary.lastStep,
      kinds: [...summary.kinds].sort(),
      values: [...summary.values].sort((left, right) => left - right),
    }))
    .sort(
      (left, right) =>
        left.firstStep - right.firstStep ||
        ((left.pc ?? -1) - (right.pc ?? -1)),
    );
}

function formatValues(values) {
  if (values.length === 0) {
    return '(none)';
  }

  return values.map((value) => hex(value, 2)).join(', ');
}

function scanD177baBlocks(blocks) {
  const hits = [];

  for (const [key, block] of Object.entries(blocks)) {
    const source = block?.source ?? '';
    const lower = source.toLowerCase();

    if (!lower.includes('0xd177ba')) {
      continue;
    }

    const functionName = source.match(/function\s+([^(]+)/)?.[1] ?? `block_${key.replace(':', '_')}`;
    const ops = [];

    if (/cpu\.read(?:8|16|24)\(0xd177ba\)/i.test(source)) {
      ops.push('read');
    }

    if (/cpu\.write(?:8|16|24)\(0xd177ba\b/i.test(source)) {
      ops.push('write');
    }

    hits.push({
      key,
      functionName,
      pc: Number.parseInt(key.split(':')[0], 16),
      mode: key.split(':')[1] ?? 'adl',
      ops,
    });
  }

  return hits.sort((left, right) => left.pc - right.pc || left.mode.localeCompare(right.mode));
}

async function main() {
  const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
  const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
  const blocks = romModule.PRELIFTED_BLOCKS;

  const sourceHits = scanD177baBlocks(blocks);
  const readHits = sourceHits.filter((hit) => hit.ops.includes('read'));
  const writeHits = sourceHits.filter((hit) => hit.ops.includes('write'));

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;

  const hook = installTargetWriteHook(cpu, mem);
  const stages = [];

  console.log('=== Phase 461 - D177BA Write Map ===');
  console.log(`watch=${hex(TARGET_ADDR, 6)}`);
  console.log('timerInterrupt=false (mirrors probe-phase99d-home-verify.mjs)');
  console.log(
    `source-scan: ${sourceHits.length} direct block hits (${writeHits.length} write, ${readHits.length} read)`,
  );

  if (sourceHits.length === 0) {
    console.log('  no direct transpiled source references found');
  } else {
    for (const hit of sourceHits) {
      const ops = hit.ops.length > 0 ? hit.ops.join(',') : 'reference';
      console.log(`  ${hit.functionName} [${hit.key}] ops=${ops}`);
    }
  }

  let stepBase = 0;

  try {
    stages.push(runStage(executor, hook, {
      label: 'boot_rom',
      entry: BOOT_ENTRY,
      mode: BOOT_MODE,
      maxSteps: BOOT_MAX_STEPS,
      maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
      stepBase,
    }));
    stepBase = stages[stages.length - 1].stepEnd;

    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    resetStack(cpu, mem, 3);

    stages.push(runStage(executor, hook, {
      label: 'kernel_init',
      entry: KERNEL_INIT_ENTRY,
      mode: 'adl',
      maxSteps: KERNEL_INIT_MAX_STEPS,
      maxLoopIterations: KERNEL_INIT_MAX_LOOP_ITERATIONS,
      stepBase,
      progressEvery: PROGRESS_INTERVAL,
    }));
    stepBase = stages[stages.length - 1].stepEnd;

    cpu.mbase = 0xD0;
    cpu._iy = 0xD00080;
    cpu._hl = 0;
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    resetStack(cpu, mem, 3);

    stages.push(runStage(executor, hook, {
      label: 'post_init',
      entry: POST_INIT_ENTRY,
      mode: 'adl',
      maxSteps: POST_INIT_MAX_STEPS,
      maxLoopIterations: POST_INIT_MAX_LOOP_ITERATIONS,
      stepBase,
    }));
    stepBase = stages[stages.length - 1].stepEnd;

    clearPendingInterrupts(peripherals);
    cpu.halted = false;
    cpu.iff1 = 1;
    cpu.iff2 = 1;
    cpu.f = 0x40;
    cpu.madl = 1;
    cpu.mbase = 0xD0;
    cpu._ix = 0xD1A860;
    cpu._iy = 0xD00080;
    resetStack(cpu, mem, 12);

    stages.push(runStage(executor, hook, {
      label: 'reduced_handler_0019be',
      entry: REDUCED_HANDLER_ENTRY,
      mode: 'adl',
      maxSteps: REDUCED_HANDLER_MAX_STEPS,
      maxLoopIterations: REDUCED_HANDLER_MAX_LOOP_ITERATIONS,
      stepBase,
      progressEvery: PROGRESS_INTERVAL,
    }));
  } finally {
    hook.restore();
  }

  const writes = hook.writes;
  const changes = writes.filter((write) => write.oldValue !== write.newValue);
  const writerSummary = summarizeWritesByPc(writes);
  const finalValue = mem[TARGET_ADDR] ?? 0x00;

  console.log('');
  console.log('stage summary:');
  for (const stage of stages) {
    console.log(
      `  ${stage.label}: entry=${hex(stage.entry, 6)} steps=${stage.result.steps} term=${stage.result.termination} lastPc=${hex(stage.result.lastPc, 6)}`,
    );
  }

  console.log('');
  console.log(`total writes to ${hex(TARGET_ADDR, 6)}: ${writes.length}`);
  console.log(`final ${hex(TARGET_ADDR, 6)} value: ${hex(finalValue, 2)}`);

  console.log('');
  console.log('writer summary by PC:');
  if (writerSummary.length === 0) {
    console.log('  none');
  } else {
    for (const entry of writerSummary) {
      console.log(
        `  pc=${hex(entry.pc, 6)} phase=${entry.phase} count=${entry.count} steps=${entry.firstStep}-${entry.lastStep} kinds=${entry.kinds.join(',')} values=${formatValues(entry.values)}`,
      );
    }
  }

  console.log('');
  console.log('timeline of all value changes:');
  if (changes.length === 0) {
    console.log('  none');
  } else {
    for (const [index, change] of changes.entries()) {
      console.log(
        `  [${index + 1}] step=${change.step} phase=${change.phase} pc=${hex(change.pc, 6)} ${hex(change.oldValue, 2)} -> ${hex(change.newValue, 2)} via=${change.kind} base=${hex(change.baseAddr, 6)}+${change.byteOffset}`,
      );
    }
  }
}

try {
  await main();
} catch (error) {
  console.error(error.stack || error);
  process.exitCode = 1;
}
