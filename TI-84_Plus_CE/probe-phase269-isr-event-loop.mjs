#!/usr/bin/env node
/**
 * Phase 269 - Timer ISR + event-loop probe.
 *
 * Goal:
 *   1. Boot with timer IRQ generation gated off.
 *   2. Enter the 0x062055 -> event-loop path and confirm the 5-block poll loop.
 *   3. Turn timer IRQ generation on mid-run and trace what changes.
 *   4. Run a second pass that injects D0058E=0x31 (key "2") instead of enabling
 *      the timer so the caller can compare the two escape attempts.
 *
 * Notes:
 *   - The lifted runtime is block-based, not instruction-step based, so this
 *     probe reuses the phase-268 coldBoot -> kernelInit -> postInit path.
 *   - The peripheral bus does not expose a mutable timerInterrupt flag, so the
 *     probe creates the bus with timer support enabled and locally gates the
 *     tick() callback until the event loop is reached.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const RETURN_SENTINEL = 0x7FFFFE;

const DISPATCH_ENTRY = 0x062055;
const HANDLER_ADDR = 0x06C546;
const PRELUDE_STEPS = 200;
const CONTINUATION_STEPS = 5000;
const TRACE_MAX_LOOP_ITERATIONS = 100000;
const TIMER_INTERVAL = 200;
const INJECTED_SCAN_CODE = 0x31; // keyMatrix[3]:bit1 = key "2"

const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;

const D000A5 = 0xD000A5;
const D0058E = 0xD0058E;
const D007D0 = 0xD007D0;
const D007E8 = 0xD007E8;
const D007FA = 0xD007FA;
const D0230F = 0xD0230F;

const POLLING_BLOCKS = [
  0x082BE2,
  0x084716,
  0x08471B,
  0x084723,
  0x084711,
];

const POLLING_SET = new Set(POLLING_BLOCKS);

const WATCHED_ADDRESSES = [
  { addr: 0x000038, label: 'irq vector' },
  { addr: 0x001713, label: 'ISR dispatch call' },
  { addr: 0x0067F8, label: 'ISR body' },
  { addr: 0x001C33, label: 'timer dispatch leaf' },
  { addr: 0x0159C0, label: 'keyboard scan' },
  { addr: 0x06EDFE, label: 'CoorMon' },
  { addr: 0x058241, label: 'cxMain' },
  { addr: 0x082BE2, label: 'poll block 1' },
  { addr: 0x084716, label: 'poll block 2' },
  { addr: 0x08471B, label: 'poll block 3' },
  { addr: 0x084723, label: 'poll block 4' },
  { addr: 0x084711, label: 'poll block 5' },
];

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value, 2);
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function read24(mem, addr) {
  const base = addr & MEM_MASK;
  return mem[base] | (mem[(base + 1) & MEM_MASK] << 8) | (mem[(base + 2) & MEM_MASK] << 16);
}

function shortCpuState(cpu) {
  return {
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    bc: cpu._bc & 0xFFFFFF,
    de: cpu._de & 0xFFFFFF,
    hl: cpu._hl & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    ix: cpu._ix & 0xFFFFFF,
    iy: cpu._iy & 0xFFFFFF,
    i: cpu.i & 0xFF,
    im: cpu.im & 0xFF,
    iff1: cpu.iff1 ? 1 : 0,
    iff2: cpu.iff2 ? 1 : 0,
    madl: cpu.madl ? 1 : 0,
    mbase: cpu.mbase & 0xFF,
  };
}

function formatCpuState(cpuState) {
  return [
    `A=${hexByte(cpuState.a)}`,
    `F=${hexByte(cpuState.f)}`,
    `BC=${hex(cpuState.bc)}`,
    `DE=${hex(cpuState.de)}`,
    `HL=${hex(cpuState.hl)}`,
    `SP=${hex(cpuState.sp)}`,
    `IX=${hex(cpuState.ix)}`,
    `IY=${hex(cpuState.iy)}`,
    `I=${hexByte(cpuState.i)}`,
    `IM=${cpuState.im}`,
    `IFF1=${cpuState.iff1}`,
    `IFF2=${cpuState.iff2}`,
    `MADL=${cpuState.madl}`,
    `MBASE=${hexByte(cpuState.mbase)}`,
  ].join(' ');
}

function formatStage(stage) {
  return `${stage.label}: entry=${hex(stage.entry)}:${stage.mode} steps=${stage.steps} `
    + `term=${stage.termination} last=${hex(stage.lastPc)}:${stage.lastMode}`;
}

function formatBlock(record) {
  return `${hex(record.pc)}:${record.mode} visits=${record.count} firstStep=${record.firstStep}`;
}

function createTimerGatedEnvironment() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({
    pllDelay: 2,
    timerInterrupt: true,
    timerInterval: TIMER_INTERVAL,
    timerMode: 'irq',
  });

  let timerGateEnabled = false;
  let totalTickCalls = 0;
  let enabledTickCalls = 0;

  const baseTick = peripherals.tick.bind(peripherals);
  peripherals.tick = () => {
    totalTickCalls++;
    if (!timerGateEnabled) return;
    enabledTickCalls++;
    baseTick();
  };

  const executor = createExecutor(BLOCKS, mem, { peripherals });

  return {
    mem,
    peripherals,
    executor,
    cpu: executor.cpu,
    enableTimer() {
      timerGateEnabled = true;
    },
    disableTimer() {
      timerGateEnabled = false;
    },
    getTimerStats() {
      return {
        gateEnabled: timerGateEnabled,
        totalTickCalls,
        enabledTickCalls,
        pendingIRQ: peripherals.hasPendingIRQ(),
        pendingNMI: peripherals.hasPendingNMI(),
      };
    },
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
    mode,
    steps: result.steps ?? 0,
    termination: result.termination ?? 'unknown',
    lastPc: result.lastPc ?? null,
    lastMode: result.lastMode ?? mode,
    loopsForced: result.loopsForced ?? 0,
    missingBlocks: result.missingBlocks ?? [],
  };
}

function coldBootPhase268(executor, cpu, mem) {
  const boot = runStage(
    executor,
    'cold_boot',
    BOOT_ENTRY,
    BOOT_MODE,
    BOOT_MAX_STEPS,
    BOOT_MAX_LOOP_ITERATIONS,
  );

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = runStage(
    executor,
    'kernel_init',
    KERNEL_INIT_ENTRY,
    'adl',
    100000,
    10000,
  );

  cpu.mbase = 0xD0;
  cpu._iy = IY_BASE;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = runStage(
    executor,
    'post_init',
    POST_INIT_ENTRY,
    'adl',
    100,
    32,
  );

  return [boot, kernelInit, postInit];
}

function prepare062055State(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = IY_BASE;
  cpu._ix = IX_BASE;
  cpu.b = 3;

  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  write24(mem, cpu.sp, RETURN_SENTINEL);

  mem[D0230F & MEM_MASK] = 0x3F;
  mem[D000A5 & MEM_MASK] = mem[D000A5 & MEM_MASK] & 0xDF;
  write24(mem, D007D0, HANDLER_ADDR);
  write24(mem, D007E8, HANDLER_ADDR);
  write24(mem, D007FA, cpu.sp);
}

function runTrace(executor, cpu, mem, startPc, startMode, maxSteps) {
  const blockMap = new Map();
  const watched = new Map(
    WATCHED_ADDRESSES.map(({ addr, label }) => [
      addr,
      { addr, label, count: 0, firstStep: null, modes: new Set() },
    ]),
  );
  const sequence = [];
  const interrupts = [];
  const missingBlocks = [];

  const result = executor.runFrom(startPc, startMode, {
    maxSteps,
    maxLoopIterations: TRACE_MAX_LOOP_ITERATIONS,
    onBlock(pc, mode, _meta, step) {
      const normalizedPc = pc >>> 0;
      const normalizedMode = mode ?? startMode;
      const key = `${normalizedPc.toString(16).padStart(6, '0')}:${normalizedMode}`;

      let record = blockMap.get(key);
      if (!record) {
        record = {
          pc: normalizedPc,
          mode: normalizedMode,
          count: 0,
          firstStep: step + 1,
        };
        blockMap.set(key, record);
      }
      record.count++;

      sequence.push({ pc: normalizedPc, mode: normalizedMode, step: step + 1 });

      const watchedHit = watched.get(normalizedPc);
      if (watchedHit) {
        watchedHit.count++;
        watchedHit.modes.add(normalizedMode);
        if (watchedHit.firstStep === null) watchedHit.firstStep = step + 1;
      }
    },
    onInterrupt(type, fromPc, vector, step) {
      interrupts.push({
        type,
        fromPc: fromPc >>> 0,
        vector: vector >>> 0,
        step: step + 1,
      });
    },
    onMissingBlock(pc, mode, step) {
      missingBlocks.push({
        pc: pc >>> 0,
        mode,
        step: step + 1,
      });
    },
  });

  const uniqueBlocks = [...blockMap.values()].sort((left, right) => {
    if (left.pc !== right.pc) return left.pc - right.pc;
    return left.mode.localeCompare(right.mode);
  });

  const watchedHits = WATCHED_ADDRESSES.map(({ addr }) => {
    const hit = watched.get(addr);
    return {
      addr: hit.addr,
      label: hit.label,
      count: hit.count,
      firstStep: hit.firstStep,
      modes: [...hit.modes].sort(),
    };
  });

  return {
    startPc,
    startMode,
    maxSteps,
    result,
    uniqueBlocks,
    sequence,
    watchedHits,
    interrupts,
    missingBlocks,
    cpuState: shortCpuState(cpu),
    keyEventByte: mem[D0058E & MEM_MASK],
  };
}

function getWatchedCount(trace, addr) {
  return trace.watchedHits.find((entry) => entry.addr === addr)?.count ?? 0;
}

function getTailBlocks(trace, count) {
  return trace.sequence.slice(-count).map((entry) => `${hex(entry.pc)}:${entry.mode}`);
}

function settledInPollingLoop(trace) {
  const tail = trace.sequence.slice(-20);
  if (tail.length < 20) return false;
  if (!tail.every((entry) => POLLING_SET.has(entry.pc))) return false;
  return POLLING_BLOCKS.every((pc) => tail.some((entry) => entry.pc === pc));
}

function outsidePollingBlocks(trace) {
  return trace.uniqueBlocks.filter((record) => !POLLING_SET.has(record.pc));
}

function didIsrFire(trace) {
  return trace.interrupts.length > 0
    || getWatchedCount(trace, 0x001713) > 0
    || getWatchedCount(trace, 0x0067F8) > 0;
}

function inferBottleneck(trace, timerStats, preState, injectedKeyCode = null) {
  const escaped = outsidePollingBlocks(trace).length > 0;
  const isrFired = didIsrFire(trace);

  if (!isrFired && timerStats.enabledTickCalls >= TIMER_INTERVAL && timerStats.pendingIRQ && preState.iff1 === 0) {
    return 'Timer reached the 200-tick threshold, but IFF1 was 0 before the continuation so the pending IRQ stayed masked.';
  }

  if (!isrFired && timerStats.enabledTickCalls >= TIMER_INTERVAL && !timerStats.pendingIRQ) {
    return 'No ISR path was observed even though the timer ran long enough; inspect interrupt-mode/vector state and controller enable bits.';
  }

  if (!isrFired && injectedKeyCode !== null && !escaped) {
    return `D0058E injection (${hexByte(injectedKeyCode)}) did not create any non-polling blocks; this loop likely needs an upstream producer, not just the key-event byte.`;
  }

  if (isrFired && !escaped) {
    return 'The ISR path executed, but control fell back into the same 5-block poll loop.';
  }

  return 'See watched hits and unique block list.';
}

function printWatchedHits(trace) {
  console.log('Watched hits');
  for (const hit of trace.watchedHits) {
    const modes = hit.modes.length > 0 ? hit.modes.join(',') : '-';
    console.log(
      `  ${hex(hit.addr)} ${hit.label.padEnd(20)} visits=${String(hit.count).padStart(4, ' ')} `
      + `firstStep=${hit.firstStep === null ? 'n/a' : hit.firstStep} modes=${modes}`,
    );
  }
}

function printInterrupts(trace) {
  console.log(`Interrupt events: ${trace.interrupts.length}`);
  if (trace.interrupts.length === 0) return;
  for (const interrupt of trace.interrupts.slice(0, 12)) {
    console.log(
      `  step=${String(interrupt.step).padStart(4, ' ')} type=${interrupt.type} `
      + `from=${hex(interrupt.fromPc)} vector=${hex(interrupt.vector)}`,
    );
  }
  if (trace.interrupts.length > 12) {
    console.log(`  ... ${trace.interrupts.length - 12} more`);
  }
}

function printBlocks(title, blocks) {
  console.log(`${title} (${blocks.length})`);
  if (blocks.length === 0) {
    console.log('  none');
    return;
  }
  for (const block of blocks) {
    console.log(`  ${formatBlock(block)}`);
  }
}

function printMissing(trace) {
  console.log(`Missing blocks: ${trace.missingBlocks.length}`);
  if (trace.missingBlocks.length === 0) return;
  for (const missing of trace.missingBlocks.slice(0, 12)) {
    console.log(`  step=${missing.step} ${hex(missing.pc)}:${missing.mode}`);
  }
  if (trace.missingBlocks.length > 12) {
    console.log(`  ... ${trace.missingBlocks.length - 12} more`);
  }
}

function printPreludeReport(prelude) {
  console.log('\n--- Prelude: 0x062055 -> event loop (timer gated off) ---');
  console.log(`  steps=${prelude.result.steps} termination=${prelude.result.termination} lastPc=${hex(prelude.result.lastPc)}:${prelude.result.lastMode}`);
  console.log(`  entered 0x082BE2 = ${getWatchedCount(prelude, 0x082BE2) > 0}`);
  console.log(`  settled in 5-block polling loop = ${settledInPollingLoop(prelude)}`);
  console.log(`  last 20 blocks = ${getTailBlocks(prelude, 20).join(' -> ')}`);
  printWatchedHits(prelude);
  printBlocks('Unique blocks during prelude', prelude.uniqueBlocks);
  printMissing(prelude);
}

function printContinuationReport(label, trace, timerStats, preState, injectedKeyCode = null) {
  const escapedBlocks = outsidePollingBlocks(trace);
  const isrFired = didIsrFire(trace);

  console.log(`\n--- ${label} ---`);
  console.log(`  start=${hex(trace.startPc)}:${trace.startMode}`);
  console.log(`  steps=${trace.result.steps} termination=${trace.result.termination} lastPc=${hex(trace.result.lastPc)}:${trace.result.lastMode}`);
  console.log(`  timerGateEnabled=${timerStats.gateEnabled} enabledTicks=${timerStats.enabledTickCalls} totalTicksSeen=${timerStats.totalTickCalls}`);
  console.log(`  pendingIRQ=${timerStats.pendingIRQ} pendingNMI=${timerStats.pendingNMI}`);
  console.log(`  pre-run CPU = ${formatCpuState(preState)}`);
  console.log(`  post-run CPU = ${formatCpuState(trace.cpuState)}`);
  console.log(`  D0058E final = ${hexByte(trace.keyEventByte)}`);
  console.log(`  ISR fired = ${isrFired}`);
  console.log(`  escaped 5-block polling set = ${escapedBlocks.length > 0}`);
  console.log(`  reached 0x0159C0 keyboard scan = ${getWatchedCount(trace, 0x0159C0) > 0}`);
  console.log(`  reached 0x06EDFE CoorMon = ${getWatchedCount(trace, 0x06EDFE) > 0}`);
  console.log(`  reached 0x058241 cxMain = ${getWatchedCount(trace, 0x058241) > 0}`);
  console.log(`  bottleneck = ${inferBottleneck(trace, timerStats, preState, injectedKeyCode)}`);
  printInterrupts(trace);
  printWatchedHits(trace);
  printBlocks('Blocks outside the 5-block polling set', escapedBlocks);
  printBlocks('All unique blocks after continuation', trace.uniqueBlocks);
  printMissing(trace);
}

function printBootReport(stages, mem, cpu) {
  console.log('\n--- Boot report ---');
  for (const stage of stages) {
    console.log(`  ${formatStage(stage)}`);
  }
  console.log(`  post-boot CPU = ${formatCpuState(shortCpuState(cpu))}`);
  console.log(`  post-boot D007D0=${hex(read24(mem, D007D0))} D007E8=${hex(read24(mem, D007E8))} D0230F=${hexByte(mem[D0230F & MEM_MASK])}`);
}

function setupBaselineEnvironment() {
  const env = createTimerGatedEnvironment();
  env.disableTimer();

  const bootStages = coldBootPhase268(env.executor, env.cpu, env.mem);
  prepare062055State(env.cpu, env.mem);

  const prelude = runTrace(
    env.executor,
    env.cpu,
    env.mem,
    DISPATCH_ENTRY,
    'adl',
    PRELUDE_STEPS,
  );

  if (prelude.result.lastPc === undefined || prelude.result.lastPc === null) {
    throw new Error(`Prelude did not produce a resumable PC (termination=${prelude.result.termination})`);
  }

  return {
    env,
    bootStages,
    prelude,
    resumePc: prelude.result.lastPc,
    resumeMode: prelude.result.lastMode ?? 'adl',
    preludeCpuState: shortCpuState(env.cpu),
  };
}

async function main() {
  console.log('=== Phase 269: Timer ISR + Event Loop Probe ===');
  console.log('Boot path: phase-268 coldBoot -> kernelInit -> postInit with a locally gated timer tick.');
  console.log(`Timer interval: ${TIMER_INTERVAL} ticks, prelude: ${PRELUDE_STEPS} steps, continuation: ${CONTINUATION_STEPS} steps.`);
  console.log(`Injected key-buffer byte for comparison: D0058E=${hexByte(INJECTED_SCAN_CODE)} (scan code for key "2").`);

  const timerCase = setupBaselineEnvironment();
  printBootReport(timerCase.bootStages, timerCase.env.mem, timerCase.env.cpu);
  console.log(`  pre-dispatch D007D0=${hex(read24(timerCase.env.mem, D007D0))} D007E8=${hex(read24(timerCase.env.mem, D007E8))} D0230F=${hexByte(timerCase.env.mem[D0230F & MEM_MASK])}`);
  printPreludeReport(timerCase.prelude);

  timerCase.env.enableTimer();
  const timerTrace = runTrace(
    timerCase.env.executor,
    timerCase.env.cpu,
    timerCase.env.mem,
    timerCase.resumePc,
    timerCase.resumeMode,
    CONTINUATION_STEPS,
  );
  printContinuationReport(
    'Experiment A: enable timer IRQ generation mid-run',
    timerTrace,
    timerCase.env.getTimerStats(),
    timerCase.preludeCpuState,
  );

  const keyCase = setupBaselineEnvironment();
  keyCase.env.mem[D0058E & MEM_MASK] = INJECTED_SCAN_CODE;
  const keyTrace = runTrace(
    keyCase.env.executor,
    keyCase.env.cpu,
    keyCase.env.mem,
    keyCase.resumePc,
    keyCase.resumeMode,
    CONTINUATION_STEPS,
  );
  printContinuationReport(
    `Experiment B: inject D0058E=${hexByte(INJECTED_SCAN_CODE)} with timer still gated off`,
    keyTrace,
    keyCase.env.getTimerStats(),
    keyCase.preludeCpuState,
    INJECTED_SCAN_CODE,
  );

  console.log('\n--- Final summary ---');
  console.log(`  Timer case: ISR fired = ${didIsrFire(timerTrace)}`);
  console.log(`  Timer case: visited 0x001713 = ${getWatchedCount(timerTrace, 0x001713) > 0}`);
  console.log(`  Timer case: visited 0x0067F8 = ${getWatchedCount(timerTrace, 0x0067F8) > 0}`);
  console.log(`  Timer case: escaped polling set = ${outsidePollingBlocks(timerTrace).length > 0}`);
  console.log(`  Timer case: reached 0x0159C0 = ${getWatchedCount(timerTrace, 0x0159C0) > 0}`);
  console.log(`  Timer case: reached 0x06EDFE = ${getWatchedCount(timerTrace, 0x06EDFE) > 0}`);
  console.log(`  Timer case: reached 0x058241 = ${getWatchedCount(timerTrace, 0x058241) > 0}`);
  console.log(`  Key injection case: escaped polling set = ${outsidePollingBlocks(keyTrace).length > 0}`);
  console.log(`  Key injection case: reached 0x0159C0 = ${getWatchedCount(keyTrace, 0x0159C0) > 0}`);
  console.log(`  Key injection case: reached 0x06EDFE = ${getWatchedCount(keyTrace, 0x06EDFE) > 0}`);
  console.log(`  Key injection case: reached 0x058241 = ${getWatchedCount(keyTrace, 0x058241) > 0}`);
  console.log(`  Key injection case: D0058E final = ${hexByte(keyTrace.keyEventByte)}`);
  console.log('\nDone.');
}

try {
  await main();
} catch (error) {
  console.error('FATAL:', error.stack || error);
  process.exitCode = 1;
}
