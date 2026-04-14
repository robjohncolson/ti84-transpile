#!/usr/bin/env node
// Phase 54.1 - trace CALC pointer/string memory reads to identify the menu renderer.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const transpiledGzPath = path.join(__dirname, 'ROM.transpiled.js.gz');

const BOOT_ENTRY = 0x000000;
const OS_INIT_ENTRY = 0x08C331;
const SET_TEXT_FG_ENTRY = 0x0802B2;
const CALC_ZERO_ENTRY = 0x055E8B;

const CALC_TRACE_START = 0x055D00;
const CALC_TRACE_END = 0x055FFF;

const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xE00000;
const SCREEN_STACK_TOP = 0xD1A87E;
const HELPER_STACK_BYTES = 3;
const PROBE_STACK_BYTES = 12;
const PROBE_IY = 0xD00080;

const BOOT_SETUP_MAX_STEPS = 20000;
const BOOT_SETUP_MAX_LOOPS = 32;
const OS_INIT_MAX_STEPS = 100000;
const OS_INIT_MAX_LOOPS = 500;
const SET_TEXT_MAX_STEPS = 100;
const SET_TEXT_MAX_LOOPS = 32;

const TRACE_MAX_STEPS = 200000;
const TRACE_MAX_LOOPS = 5000;
const BOOT_TRACE_STEPS = 8804;
const BOOT_TRACE_LOOPS = 5000;
const FIRST_READS_LIMIT = 10;

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

const CANDIDATE_PROBES = [
  { label: 'Y=/STAT PLOT editor', entry: 0x078419, mode: 'adl' },
  { label: 'STAT/MATRIX editor', entry: 0x081670, mode: 'adl' },
  { label: 'MODE screen', entry: 0x0296DD, mode: 'adl' },
  { label: 'CATALOG', entry: 0x04E135, mode: 'adl' },
  { label: 'CATALOG entry', entry: 0x04E1D0, mode: 'adl' },
  { label: 'ABOUT', entry: 0x09EBF6, mode: 'adl' },
  { label: 'Transformation Graphing', entry: 0x0B9C64, mode: 'adl' },
  { label: 'Inequality Graphing', entry: 0x074817, mode: 'adl' },
  { label: 'TEST MODE', entry: 0x028944, mode: 'adl' },
];

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function hex2(value) {
  return `0x${(value & 0xFF).toString(16).padStart(2, '0')}`;
}

function formatAddress(value) {
  if (value === null || value === undefined) {
    return 'none';
  }

  return hex(value);
}

function formatAddressList(values) {
  if (!values || values.length === 0) {
    return 'none';
  }

  return values.map((value) => hex(value)).join(', ');
}

function formatRun(run) {
  const parts = [
    `term=${run.termination}`,
    `steps=${run.steps}`,
    `lastPc=${formatAddress(run.lastPc)}`,
    `lastMode=${run.lastMode ?? 'none'}`,
  ];

  if (run.error instanceof Error) {
    parts.push(`error=${run.error.message}`);
  }

  return parts.join(' ');
}

function formatRead(read) {
  return [
    `addr=${hex(read.addr)}`,
    `value=${hex2(read.value)}`,
    `blockPc=${hex(read.blockPc)}`,
    `step=${read.step}`,
  ].join(' ');
}

async function loadBlocks() {
  if (fs.existsSync(transpiledPath)) {
    const mod = await import(pathToFileURL(transpiledPath).href);
    return mod.PRELIFTED_BLOCKS;
  }

  if (!fs.existsSync(transpiledGzPath)) {
    throw new Error(
      `Missing ${transpiledPath} and ${transpiledGzPath}; this script will not re-transpile the ROM.`,
    );
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ti84-phase54-'));
  const tempModulePath = path.join(tempDir, 'ROM.transpiled.mjs');

  try {
    const transpiledSource = gunzipSync(fs.readFileSync(transpiledGzPath));
    fs.writeFileSync(tempModulePath, transpiledSource);

    const mod = await import(`${pathToFileURL(tempModulePath).href}?t=${Date.now()}`);
    return mod.PRELIFTED_BLOCKS;
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore temp cleanup failures.
    }
  }
}

function fillSentinel(mem, start, bytes) {
  mem.fill(0xFF, start, start + bytes);
}

function snapshotCpu(cpu) {
  const snapshot = {};

  for (const field of CPU_SNAPSHOT_FIELDS) {
    snapshot[field] = cpu[field];
  }

  return snapshot;
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_SNAPSHOT_FIELDS) {
    cpu[field] = snapshot[field];
  }
}

function createTraceEnv(blocks, romBytes) {
  const peripherals = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;

  const calcReads = [];
  let currentBlockPc = 0;
  let stepCount = 0;

  const origRead8 = cpu.read8.bind(cpu);
  cpu.read8 = (addr) => {
    const value = origRead8(addr);

    if (addr >= CALC_TRACE_START && addr <= CALC_TRACE_END) {
      calcReads.push({ addr, value, blockPc: currentBlockPc, step: stepCount });
    }

    return value;
  };

  function resetTrace() {
    calcReads.length = 0;
    currentBlockPc = 0;
    stepCount = 0;
  }

  function trackBlock(pc) {
    currentBlockPc = pc;
    stepCount += 1;
  }

  function captureBaseState() {
    return {
      ramSnapshot: new Uint8Array(mem.subarray(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END)),
      cpuSnapshot: snapshotCpu(cpu),
      lcdSnapshot: executor.lcdMmio
        ? { upbase: executor.lcdMmio.upbase, control: executor.lcdMmio.control }
        : null,
    };
  }

  function restoreBaseState(baseState) {
    mem.set(baseState.ramSnapshot, RAM_SNAPSHOT_START);
    restoreCpu(cpu, baseState.cpuSnapshot);

    if (executor.lcdMmio && baseState.lcdSnapshot) {
      executor.lcdMmio.upbase = baseState.lcdSnapshot.upbase;
      executor.lcdMmio.control = baseState.lcdSnapshot.control;
    }

    resetTrace();
  }

  return {
    mem,
    cpu,
    executor,
    calcReads,
    resetTrace,
    trackBlock,
    captureBaseState,
    restoreBaseState,
  };
}

function callExplicitOsInit(env) {
  const { executor, cpu, mem } = env;

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = SCREEN_STACK_TOP - HELPER_STACK_BYTES;
  fillSentinel(mem, cpu.sp, HELPER_STACK_BYTES);

  return executor.runFrom(OS_INIT_ENTRY, 'adl', {
    maxSteps: OS_INIT_MAX_STEPS,
    maxLoopIterations: OS_INIT_MAX_LOOPS,
  });
}

function callSetTextFgColor(env) {
  const { executor, cpu, mem } = env;

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.hl = 0;
  cpu.sp = SCREEN_STACK_TOP - HELPER_STACK_BYTES;
  fillSentinel(mem, cpu.sp, HELPER_STACK_BYTES);

  return executor.runFrom(SET_TEXT_FG_ENTRY, 'adl', {
    maxSteps: SET_TEXT_MAX_STEPS,
    maxLoopIterations: SET_TEXT_MAX_LOOPS,
  });
}

function prepareProbe(env) {
  const { cpu, mem } = env;

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = PROBE_IY;
  cpu.f = 0x40;
  cpu.sp = SCREEN_STACK_TOP - PROBE_STACK_BYTES;
  fillSentinel(mem, cpu.sp, PROBE_STACK_BYTES);
}

function buildProbeResult(spec, run, calcReads) {
  const firstRead = calcReads[0] ?? null;
  const uniqueBlockPcs = [...new Set(calcReads.map((read) => read.blockPc))].sort((a, b) => a - b);

  return {
    ...spec,
    run,
    calcReads,
    firstRead,
    uniqueBlockPcs,
  };
}

function runTrace(env, spec) {
  env.resetTrace();

  const run = env.executor.runFrom(spec.entry, spec.mode, {
    maxSteps: spec.maxSteps,
    maxLoopIterations: spec.maxLoopIterations,
    onBlock: (pc, mode) => {
      env.trackBlock(pc, mode);
    },
  });

  return buildProbeResult(spec, run, env.calcReads.slice());
}

function printProbeReport(report) {
  console.log(`=== ${report.label} (${hex(report.entry)}:${report.mode}) ===`);
  console.log(formatRun(report.run));
  console.log(`calc_reads=${report.calcReads.length}`);

  if (report.calcReads.length === 0) {
    console.log('first10_reads=none');
    console.log('unique_blockPcs=none');
    console.log('');
    return;
  }

  console.log('first10_reads:');
  for (const read of report.calcReads.slice(0, FIRST_READS_LIMIT)) {
    console.log(`  ${formatRead(read)}`);
  }

  console.log(`unique_blockPcs=${formatAddressList(report.uniqueBlockPcs)}`);

  if (report.isCandidate) {
    console.log(`CANDIDATE RENDERER=${formatAddressList(report.uniqueBlockPcs)}`);
  }

  console.log('');
}

async function main() {
  const romBytes = fs.readFileSync(romPath);
  const blocks = await loadBlocks();

  const candidateEnv = createTraceEnv(blocks, romBytes);
  const bootSetup = candidateEnv.executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_SETUP_MAX_STEPS,
    maxLoopIterations: BOOT_SETUP_MAX_LOOPS,
  });
  const osInit = callExplicitOsInit(candidateEnv);
  const setText = callSetTextFgColor(candidateEnv);
  const baseState = candidateEnv.captureBaseState();
  candidateEnv.resetTrace();

  console.log('=== Phase 54.1: CALC memory-access trace ===');
  console.log(
    `trace_window=${hex(CALC_TRACE_START)}-${hex(CALC_TRACE_END)} setup boot=${formatRun(bootSetup)} osInit=${formatRun(osInit)} setText=${formatRun(setText)}`,
  );
  console.log('');

  const candidateReports = [];

  for (const probe of CANDIDATE_PROBES) {
    candidateEnv.restoreBaseState(baseState);
    prepareProbe(candidateEnv);

    const report = runTrace(candidateEnv, {
      ...probe,
      maxSteps: TRACE_MAX_STEPS,
      maxLoopIterations: TRACE_MAX_LOOPS,
      isCandidate: true,
      summaryLabel: `${hex(probe.entry)} ${probe.label}`,
    });

    candidateReports.push(report);
    printProbeReport(report);
  }

  candidateEnv.restoreBaseState(baseState);
  prepareProbe(candidateEnv);
  const calcZeroReport = runTrace(candidateEnv, {
    label: 'CALC ZERO string as code',
    entry: CALC_ZERO_ENTRY,
    mode: 'adl',
    maxSteps: TRACE_MAX_STEPS,
    maxLoopIterations: TRACE_MAX_LOOPS,
    isCandidate: false,
    summaryLabel: `${hex(CALC_ZERO_ENTRY)} CALC ZERO string`,
  });
  printProbeReport(calcZeroReport);

  const firstSuccessfulCandidate = candidateReports.find((report) => report.calcReads.length > 0) ?? null;
  let rerunReport = null;

  if (firstSuccessfulCandidate) {
    const rerunBlockPc = firstSuccessfulCandidate.firstRead.blockPc;

    candidateEnv.restoreBaseState(baseState);
    prepareProbe(candidateEnv);

    rerunReport = runTrace(candidateEnv, {
      label: `Renderer block rerun from ${firstSuccessfulCandidate.label}`,
      entry: rerunBlockPc,
      mode: 'adl',
      maxSteps: TRACE_MAX_STEPS,
      maxLoopIterations: TRACE_MAX_LOOPS,
      isCandidate: false,
      summaryLabel: `${hex(rerunBlockPc)} renderer block rerun`,
    });
    printProbeReport(rerunReport);
  } else {
    console.log('=== Renderer block rerun ===');
    console.log('skipped: no prior candidate CALC-area reads');
    console.log('');
  }

  const bootEnv = createTraceEnv(blocks, romBytes);
  const bootReport = runTrace(bootEnv, {
    label: 'Boot trace',
    entry: BOOT_ENTRY,
    mode: 'z80',
    maxSteps: BOOT_TRACE_STEPS,
    maxLoopIterations: BOOT_TRACE_LOOPS,
    isCandidate: false,
    summaryLabel: `${hex(BOOT_ENTRY)} boot`,
  });
  printProbeReport(bootReport);

  const rendererSources = new Map();
  for (const report of candidateReports) {
    for (const blockPc of report.uniqueBlockPcs) {
      if (!rendererSources.has(blockPc)) {
        rendererSources.set(blockPc, new Set());
      }

      rendererSources.get(blockPc).add(report.label);
    }
  }

  const candidateRendererPcs = [...rendererSources.keys()].sort((a, b) => a - b);
  const allReports = [bootReport, ...candidateReports, calcZeroReport];

  if (rerunReport) {
    allReports.push(rerunReport);
  }

  console.log('=== Final Summary ===');
  console.log('Entry point | CALC reads count | First read addr | First block PC at read');

  for (const report of allReports) {
    console.log(
      [
        report.summaryLabel,
        String(report.calcReads.length),
        formatAddress(report.firstRead?.addr),
        formatAddress(report.firstRead?.blockPc),
      ].join(' | '),
    );
  }

  console.log('');
  console.log('Candidate renderer blockPc addresses');

  if (candidateRendererPcs.length === 0) {
    console.log('none');
  } else {
    for (const blockPc of candidateRendererPcs) {
      const sources = [...rendererSources.get(blockPc)].sort().join(', ');
      console.log(`${hex(blockPc)} <= ${sources}`);
    }
  }

  console.log('');

  if (candidateRendererPcs.length === 0) {
    const nonCandidateHit =
      bootReport.calcReads.length > 0 ||
      calcZeroReport.calcReads.length > 0 ||
      (rerunReport && rerunReport.calcReads.length > 0);

    if (nonCandidateHit) {
      console.log('Verdict: No candidate entry produced CALC reads, but a non-candidate probe did touch the CALC region.');
      return;
    }

    console.log('Verdict: No. None of the requested candidate entry points read the CALC pointer table or strings.');
    return;
  }

  const primaryRenderer = firstSuccessfulCandidate.firstRead.blockPc;
  console.log(
    `Verdict: Yes. First CALC-area read came from ${hex(primaryRenderer)} via ${firstSuccessfulCandidate.label}; renderer path blocks=${formatAddressList(candidateRendererPcs)}.`,
  );
}

await main();
