#!/usr/bin/env node

/**
 * Phase 214 Probe: 0x080D08 display-result loop entry conditions
 *
 * Requested runtime experiments:
 *   A. Enter 0x080D08 with only memory state prepared.
 *   B. Same as A, but preset HL = 0xD0060E.
 *   C. Direct-entry equivalent state: preset DE to first token (D=0, E=char)
 *      and HL to the next format-buffer byte before entering 0x080D08.
 *   D. Same direct-entry equivalent state as C, but with a longer string.
 *   E. Inspect the lifted code in ROM.transpiled.js to see what 0x080D08
 *      actually contains.
 *
 * Derived control:
 *   F. Enter the actual lifted loop head at 0x080CFE with HL = 0xD0060E.
 *
 * This script reuses the phase 213 boot + memInit baseline so the experiments
 * run against a stable OS memory image.
 */

import {
  existsSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const transpiledGzipPath = `${transpiledPath}.gz`;
const romPath = path.join(__dirname, 'ROM.rom');

const transpiledAvailability = ensureTranspiledJs();

if (!existsSync(romPath)) {
  throw new Error('ROM.rom is missing.');
}

const { PRELIFTED_BLOCKS } = await import('./ROM.transpiled.js');
const rom = readFileSync(romPath);

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

const BLOCKS = normalizeBlocks(PRELIFTED_BLOCKS);

const FLAG_C = 0x01;
const FLAG_N = 0x02;
const FLAG_PV = 0x04;
const FLAG_H = 0x10;
const FLAG_Z = 0x40;
const FLAG_S = 0x80;

const MEM_SIZE = 0x1000000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const MEM_INIT_RET = 0x7FFFF6;

const FORMAT_BUFFER = 0xD0060E;
const EDIT_BUF_START = 0xD00A00;
const EDIT_BUF_END = 0xD00B00;
const EDIT_TOP = 0xD02437;
const EDIT_CURSOR = 0xD0243A;
const EDIT_TAIL = 0xD0243D;
const EDIT_BTM = 0xD02440;
const IY_ADDR = 0xD00080;
const IY_PLUS_5 = 0xD00085;
const BIT_4_MASK = 0x10;

const DISPLAY_RESULT_ENTRY = 0x080D08;
const ACTUAL_LOOP_ENTRY = 0x080CFE;
const RETURN_FROM_BUF_INSERT = 0x080D0D;
const LOOP_EXIT = 0x080D10;
const NUL_EXIT = 0x080D14;
const BUF_INSERT = 0x05E2A0;

const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IX_ADDR = 0xD1A860;
const RETURN_SENTINEL = 0x7FFFFE;

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const MEM_INIT_MAX_LOOP_ITERATIONS = 8192;
const TRACE_MAX_STEPS = 500;
const TRACE_MAX_LOOP_ITERATIONS = 256;
const FORMAT_BUFFER_CLEAR_LENGTH = 0x20;
const TRACE_EDIT_DUMP_LENGTH = 8;
const FINAL_EDIT_DUMP_LENGTH = 0x20;

const DIRECT_STRING = [0x34, 0x32, 0x2E, 0x35, 0x00]; // "42.5\0"
const LONG_STRING = [0x31, 0x32, 0x33, 0x34, 0x35, 0x00]; // "12345\0"

const EXPERIMENTS = [
  {
    id: 'A',
    kind: 'runtime',
    description: 'Enter 0x080D08 with only memory seeded and standard reset registers.',
    entry: DISPLAY_RESULT_ENTRY,
    formatBytes: DIRECT_STRING,
  },
  {
    id: 'B',
    kind: 'runtime',
    description: 'Enter 0x080D08 with HL preset to the format buffer start.',
    entry: DISPLAY_RESULT_ENTRY,
    formatBytes: DIRECT_STRING,
    setup(cpu) {
      cpu.hl = FORMAT_BUFFER;
    },
  },
  {
    id: 'C',
    kind: 'runtime',
    description: 'Enter 0x080D08 with the direct-entry equivalent state: DE = first char, HL = next char.',
    entry: DISPLAY_RESULT_ENTRY,
    formatBytes: DIRECT_STRING,
    setup(cpu, mem, experiment) {
      cpu.de = experiment.formatBytes[0] & 0xFF;
      cpu.hl = (FORMAT_BUFFER + 1) & 0xFFFFFF;
    },
  },
  {
    id: 'D',
    kind: 'runtime',
    description: 'Repeat the direct-entry equivalent state with a longer string.',
    entry: DISPLAY_RESULT_ENTRY,
    formatBytes: LONG_STRING,
    setup(cpu, mem, experiment) {
      cpu.de = experiment.formatBytes[0] & 0xFF;
      cpu.hl = (FORMAT_BUFFER + 1) & 0xFFFFFF;
    },
  },
  {
    id: 'F',
    kind: 'runtime',
    derived: true,
    description: 'Derived control: enter the actual lifted loop head at 0x080CFE with HL = format buffer.',
    entry: ACTUAL_LOOP_ENTRY,
    formatBytes: DIRECT_STRING,
    setup(cpu) {
      cpu.hl = FORMAT_BUFFER;
    },
  },
];

function ensureTranspiledJs() {
  const actions = [];

  if (existsSync(transpiledPath)) {
    return {
      ready: true,
      source: 'existing',
      actions,
    };
  }

  if (!existsSync(transpiledGzipPath)) {
    throw new Error('ROM.transpiled.js and ROM.transpiled.js.gz are both missing.');
  }

  const gzipAttempt = spawnSync('gzip', ['-dk', path.basename(transpiledGzipPath)], {
    cwd: __dirname,
    encoding: 'utf8',
  });

  actions.push({
    method: 'gzip -dk ROM.transpiled.js.gz',
    status: gzipAttempt.status,
    signal: gzipAttempt.signal,
    stdout: (gzipAttempt.stdout ?? '').trim(),
    stderr: (gzipAttempt.stderr ?? '').trim(),
    error: gzipAttempt.error?.message ?? null,
  });

  if (!existsSync(transpiledPath)) {
    const gzBytes = readFileSync(transpiledGzipPath);
    writeFileSync(transpiledPath, gunzipSync(gzBytes));
    actions.push({
      method: 'node:zlib gunzipSync fallback',
      status: 'ok',
      bytesWritten: readFileSync(transpiledPath).length,
    });
  }

  return {
    ready: existsSync(transpiledPath),
    source: existsSync(transpiledPath) ? 'decompressed' : 'missing',
    actions,
  };
}

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(buffer, start, length) {
  return Array.from(buffer.slice(start, start + length), (byte) =>
    byte.toString(16).toUpperCase().padStart(2, '0')
  ).join(' ');
}

function asciiPreview(buffer, start, length) {
  let value = '';
  for (let index = 0; index < length; index++) {
    const byte = buffer[start + index] & 0xFF;
    if (byte === 0x00) break;
    value += byte >= 0x20 && byte <= 0x7E ? String.fromCharCode(byte) : '.';
  }
  return value;
}

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[a + 1] = (value >>> 8) & 0xFF;
  mem[a + 2] = (value >>> 16) & 0xFF;
}

function read24(mem, addr) {
  const a = addr & 0xFFFFFF;
  return ((mem[a] & 0xFF) | ((mem[a + 1] & 0xFF) << 8) | ((mem[a + 2] & 0xFF) << 16)) >>> 0;
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
}

function flagsObject(f) {
  const z = (f & FLAG_Z) !== 0;
  const c = (f & FLAG_C) !== 0;
  return {
    raw: hexByte(f),
    z,
    nz: !z,
    c,
    nc: !c,
    n: (f & FLAG_N) !== 0,
    pv: (f & FLAG_PV) !== 0,
    h: (f & FLAG_H) !== 0,
    s: (f & FLAG_S) !== 0,
  };
}

function createMemoryWithRom() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(rom.subarray(0, Math.min(mem.length, rom.length)));
  return mem;
}

function createRuntime(mem) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { executor, cpu: executor.cpu };
}

function resetOsState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.ix = IX_ADDR;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP;
  mem.fill(0xFF, Math.max(0, STACK_TOP - 0x80), Math.min(mem.length, STACK_TOP + 0x20));
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: 10000,
  });

  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: 32,
  });

  return {
    boot: { steps: boot.steps, termination: boot.termination, lastPc: hex(boot.lastPc ?? 0) },
    kernelInit: { steps: kernelInit.steps, termination: kernelInit.termination, lastPc: hex(kernelInit.lastPc ?? 0) },
    postInit: { steps: postInit.steps, termination: postInit.termination, lastPc: hex(postInit.lastPc ?? 0) },
  };
}

function runMemInit(executor, cpu, mem) {
  resetOsState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);
  let returned = false;
  let result = null;

  try {
    result = executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: MEM_INIT_MAX_STEPS,
      maxLoopIterations: MEM_INIT_MAX_LOOP_ITERATIONS,
      onBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__MEMINIT_RET__');
      },
      onMissingBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) throw new Error('__MEMINIT_RET__');
      },
    });
  } catch (error) {
    if (error?.message === '__MEMINIT_RET__') {
      returned = true;
    } else {
      throw error;
    }
  }

  return {
    returned,
    steps: result?.steps ?? null,
    termination: returned ? 'sentinel' : (result?.termination ?? null),
  };
}

function createBaseline() {
  const mem = createMemoryWithRom();
  const { executor, cpu } = createRuntime(mem);
  const boot = coldBoot(executor, cpu, mem);
  const memInit = runMemInit(executor, cpu, mem);
  return {
    boot,
    memInit,
    memory: new Uint8Array(mem),
  };
}

function seedEditBuffer(mem) {
  write24(mem, EDIT_TOP, EDIT_BUF_START);
  write24(mem, EDIT_CURSOR, EDIT_BUF_START);
  write24(mem, EDIT_TAIL, EDIT_BUF_START);
  write24(mem, EDIT_BTM, EDIT_BUF_END);
  mem.fill(0x00, EDIT_BUF_START, EDIT_BUF_END);
}

function seedFormatBuffer(mem, formatBytes) {
  mem.fill(0x00, FORMAT_BUFFER, FORMAT_BUFFER + FORMAT_BUFFER_CLEAR_LENGTH);
  mem.set(formatBytes, FORMAT_BUFFER);
}

function snapshotState(step, pc, mode, cpu, mem) {
  return {
    step,
    pc: hex(pc),
    mode,
    a: hexByte(cpu.a),
    hl: hex(cpu.hl),
    de: hex(cpu.de),
    d: hexByte(cpu.d),
    e: hexByte(cpu.e),
    f: hexByte(cpu.f),
    flags: flagsObject(cpu.f),
    editBuffer8Hex: bytesToHex(mem, EDIT_BUF_START, TRACE_EDIT_DUMP_LENGTH),
    editBuffer8Ascii: asciiPreview(mem, EDIT_BUF_START, TRACE_EDIT_DUMP_LENGTH),
    cursor: hex(read24(mem, EDIT_CURSOR)),
  };
}

function makeStop(name, detail = null) {
  const error = new Error('__PHASE214_STOP__');
  error.stopName = name;
  error.detail = detail;
  return error;
}

function analyzeHlIncrement(logs) {
  const pairs = [];

  for (let index = 0; index < logs.length; index++) {
    const current = logs[index];
    if (current.pc !== hex(ACTUAL_LOOP_ENTRY)) continue;

    const nextStub = logs.slice(index + 1).find((log) => log.pc === hex(DISPLAY_RESULT_ENTRY));
    if (!nextStub) continue;

    const currentHlValue = Number.parseInt(current.hl.slice(2), 16);
    const nextStubHlValue = Number.parseInt(nextStub.hl.slice(2), 16);
    const expected = (currentHlValue + 1) & 0xFFFFFF;

    pairs.push({
      fromStep: current.step,
      toStep: nextStub.step,
      hlAt080cfe: current.hl,
      expectedAt080d08: hex(expected),
      observedAt080d08: nextStub.hl,
      matches: nextStubHlValue === expected,
    });
  }

  return pairs;
}

function analyzeHlRestore(logs) {
  const pairs = [];

  for (let index = 0; index < logs.length; index++) {
    const current = logs[index];
    if (current.pc !== hex(DISPLAY_RESULT_ENTRY)) continue;

    const nextRelevant = logs.slice(index + 1).find((log) =>
      log.pc === hex(ACTUAL_LOOP_ENTRY) ||
      log.pc === hex(LOOP_EXIT) ||
      log.pc === hex(NUL_EXIT)
    );

    if (!nextRelevant) continue;

    pairs.push({
      fromStep: current.step,
      toStep: nextRelevant.step,
      savedHlAt080d08: current.hl,
      nextPc: nextRelevant.pc,
      nextHl: nextRelevant.hl,
      restoredForLoop: nextRelevant.pc === hex(ACTUAL_LOOP_ENTRY),
      matches: nextRelevant.pc === hex(ACTUAL_LOOP_ENTRY) ? nextRelevant.hl === current.hl : null,
    });
  }

  return pairs;
}

function buildObservations(experiment, logs, summary) {
  const observations = [];

  if (experiment.entry === DISPLAY_RESULT_ENTRY) {
    observations.push(
      'Direct entry at 0x080D08 bypasses the lifted setup block at 0x080CFE, so memory at 0xD0060E is not read unless DE/HL were already primed upstream.'
    );
  }

  if (summary.bufInsertCalls === 0) {
    observations.push('BufInsert was never reached.');
  } else {
    observations.push(`BufInsert was entered ${summary.bufInsertCalls} time(s).`);
  }

  if (summary.bufInsertReturnStates.length > 0) {
    const nzCount = summary.bufInsertReturnStates.filter((state) => state.flags.nz).length;
    const zCount = summary.bufInsertReturnStates.length - nzCount;
    observations.push(`BufInsert returned NZ ${nzCount} time(s) and Z ${zCount} time(s) at 0x080D0D.`);
  } else {
    observations.push('No return to 0x080D0D was observed in the trace window.');
  }

  if (summary.loopHeadVisits > 0) {
    observations.push(`The lifted loop head 0x080CFE was visited ${summary.loopHeadVisits} time(s).`);
  }

  if (summary.hlIncrementChecks.length > 0) {
    const matched = summary.hlIncrementChecks.filter((pair) => pair.matches).length;
    observations.push(`HL increment before 0x080D08 matched ${matched}/${summary.hlIncrementChecks.length} observed pair(s).`);
  }

  if (summary.hlRestoreChecks.length > 0) {
    const loopMatches = summary.hlRestoreChecks.filter((pair) => pair.restoredForLoop && pair.matches).length;
    const loopPairs = summary.hlRestoreChecks.filter((pair) => pair.restoredForLoop).length;
    observations.push(`HL restore after BufInsert matched ${loopMatches}/${loopPairs} loop-back pair(s).`);
  }

  if (summary.finalEditAscii.length > 0) {
    observations.push(`Final edit buffer ASCII preview: "${summary.finalEditAscii}".`);
  } else {
    observations.push('Final edit buffer remained empty in the first 32 bytes.');
  }

  return observations;
}

function buildRuntimeSummary(experiment, logs, mem, termination, stopDetail, missingBlocks) {
  const bufInsertReturnStates = logs
    .filter((log) => log.pc === hex(RETURN_FROM_BUF_INSERT))
    .map((log) => ({
      step: log.step,
      f: log.f,
      flags: log.flags,
      hl: log.hl,
      de: log.de,
      editBuffer8Hex: log.editBuffer8Hex,
      editBuffer8Ascii: log.editBuffer8Ascii,
      cursor: log.cursor,
    }));

  const summary = {
    entry: hex(experiment.entry),
    stepsTaken: logs.length,
    termination,
    stopDetail,
    bufInsertCalls: logs.filter((log) => log.pc === hex(BUF_INSERT)).length,
    bufInsertReturnStates,
    loopHeadVisits: logs.filter((log) => log.pc === hex(ACTUAL_LOOP_ENTRY)).length,
    callStubVisits: logs.filter((log) => log.pc === hex(DISPLAY_RESULT_ENTRY)).length,
    loopExitVisits: logs.filter((log) => log.pc === hex(LOOP_EXIT)).length,
    nulExitVisits: logs.filter((log) => log.pc === hex(NUL_EXIT)).length,
    hlIncrementChecks: analyzeHlIncrement(logs),
    hlRestoreChecks: analyzeHlRestore(logs),
    finalCursor: hex(read24(mem, EDIT_CURSOR)),
    finalEditBuffer32Hex: bytesToHex(mem, EDIT_BUF_START, FINAL_EDIT_DUMP_LENGTH),
    finalEditAscii: asciiPreview(mem, EDIT_BUF_START, FINAL_EDIT_DUMP_LENGTH),
    missingBlocks,
  };

  summary.observations = buildObservations(experiment, logs, summary);
  return summary;
}

function runRuntimeExperiment(baselineMem, experiment) {
  const mem = new Uint8Array(baselineMem);
  const { executor, cpu } = createRuntime(mem);

  resetOsState(cpu, mem);
  seedFormatBuffer(mem, experiment.formatBytes);
  seedEditBuffer(mem);
  mem[IY_PLUS_5] = (mem[IY_PLUS_5] | BIT_4_MASK) & 0xFF;

  if (typeof experiment.setup === 'function') {
    experiment.setup(cpu, mem, experiment);
  }

  push24(cpu, mem, RETURN_SENTINEL);

  const initialState = snapshotState(0, experiment.entry, 'adl', cpu, mem);
  const logs = [];
  const missingBlocks = [];
  let termination = 'max_steps';
  let stopDetail = null;

  try {
    const result = executor.runFrom(experiment.entry, 'adl', {
      maxSteps: TRACE_MAX_STEPS,
      maxLoopIterations: TRACE_MAX_LOOP_ITERATIONS,
      onBlock(pc, mode) {
        const addr = pc & 0xFFFFFF;
        logs.push(snapshotState(logs.length + 1, addr, mode, cpu, mem));

        if (addr === RETURN_SENTINEL) {
          throw makeStop('sentinel', hex(addr));
        }
      },
      onMissingBlock(pc, mode) {
        const addr = pc & 0xFFFFFF;
        missingBlocks.push({ pc: hex(addr), mode });
        throw makeStop('missing_block', hex(addr));
      },
    });

    termination = result.termination ?? termination;
  } catch (error) {
    if (error?.message === '__PHASE214_STOP__') {
      termination = error.stopName;
      stopDetail = error.detail ?? null;
    } else {
      throw error;
    }
  }

  return {
    id: experiment.id,
    kind: experiment.kind,
    derived: experiment.derived === true,
    description: experiment.description,
    formatBytesHex: experiment.formatBytes.map((byte) => hexByte(byte)),
    formatAscii: asciiPreview(Uint8Array.from(experiment.formatBytes), 0, experiment.formatBytes.length),
    initialState,
    trace: logs,
    summary: buildRuntimeSummary(experiment, logs, mem, termination, stopDetail, missingBlocks),
  };
}

function summarizeBlock(key) {
  const block = BLOCKS[key];
  if (!block) {
    return {
      key,
      found: false,
    };
  }

  return {
    key,
    found: true,
    exits: block.exits ?? [],
    source: String(block.source ?? '').split('\n').slice(0, 20).join('\n'),
  };
}

function inspectTranspiledSnippet() {
  const attempts = [];

  const requestedPattern = spawnSync('rg', ['-n', '-A', '30', '-m', '1', 'rom_080[dD]08', 'ROM.transpiled.js'], {
    cwd: __dirname,
    encoding: 'utf8',
  });

  attempts.push({
    label: 'requested-rom_080[dD]08',
    status: requestedPattern.status,
    signal: requestedPattern.signal,
    stdout: (requestedPattern.stdout ?? '').trim(),
    stderr: (requestedPattern.stderr ?? '').trim(),
    error: requestedPattern.error?.message ?? null,
  });

  const fallbackPattern = spawnSync(
    'rg',
    ['-n', '-A', '30', '-B', '6', '-m', '1', 'block_080d08_adl|080d08:adl|block_080cfe_adl|block_080d0d_adl', 'ROM.transpiled.js'],
    {
      cwd: __dirname,
      encoding: 'utf8',
    }
  );

  attempts.push({
    label: 'fallback-block_080d08_adl',
    status: fallbackPattern.status,
    signal: fallbackPattern.signal,
    stdout: (fallbackPattern.stdout ?? '').trim(),
    stderr: (fallbackPattern.stderr ?? '').trim(),
    error: fallbackPattern.error?.message ?? null,
  });

  const chosen = attempts.find((attempt) => attempt.stdout.length > 0) ?? attempts[attempts.length - 1];

  return {
    commandNote: 'The requested rom_080[dD]08 grep is attempted first. The fallback searches the actual lifted identifiers present in this transpiled file.',
    attempts,
    chosen,
  };
}

function buildStaticConclusions() {
  return {
    preferredLoopEntry: hex(ACTUAL_LOOP_ENTRY),
    directCallStub: hex(DISPLAY_RESULT_ENTRY),
    bufInsertReturnBlock: hex(RETURN_FROM_BUF_INSERT),
    conclusions: [
      '0x080CFE is the lifted loop head that reads (HL), clears D, copies A into E, increments HL, tests for NUL, and then falls through to 0x080D08.',
      '0x080D08 is only PUSH HL followed by CALL 0x05E2A0. It does not load HL from 0xD0060E and it does not fetch a byte into E.',
      '0x080D0D decides whether the loop repeats. BufInsert must return NZ there to branch back to 0x080CFE.',
      'If you jump directly into 0x080D08, the correct manual state is the post-0x080CFE state: DE already contains the token (D=0, E=char) and HL already points at the next format-buffer byte.',
    ],
  };
}

function runExperimentE() {
  return {
    id: 'E',
    kind: 'static',
    description: 'Inspect ROM.transpiled.js to see what the lifted 0x080D08 path actually contains.',
    transpiledAvailability,
    snippetSearch: inspectTranspiledSnippet(),
    blocks: [
      summarizeBlock('080cfe:adl'),
      summarizeBlock('080d08:adl'),
      summarizeBlock('080d0d:adl'),
      summarizeBlock('080d10:adl'),
      summarizeBlock('080d14:adl'),
    ],
    inferredEntryConditions: buildStaticConclusions(),
  };
}

function main() {
  const baseline = createBaseline();
  const runtimeResults = EXPERIMENTS.map((experiment) => runRuntimeExperiment(baseline.memory, experiment));
  const staticResult = runExperimentE();

  const report = {
    probe: 'probe-phase214-display-result-loop.mjs',
    generatedAt: new Date().toISOString(),
    bootBaseline: {
      bootSequence: `${hex(BOOT_ENTRY)} -> ${hex(KERNEL_INIT_ENTRY)} -> ${hex(POST_INIT_ENTRY)} -> ${hex(MEM_INIT_ENTRY)}`,
      boot: baseline.boot,
      memInit: baseline.memInit,
    },
    runtimeConfig: {
      formatBuffer: hex(FORMAT_BUFFER),
      editBufferStart: hex(EDIT_BUF_START),
      editBufferEnd: hex(EDIT_BUF_END),
      editTop: hex(EDIT_TOP),
      editCursor: hex(EDIT_CURSOR),
      editTail: hex(EDIT_TAIL),
      editBottom: hex(EDIT_BTM),
      iy: hex(IY_ADDR),
      iyPlus5: hex(IY_PLUS_5),
      bit4Mask: hexByte(BIT_4_MASK),
      bufInsert: hex(BUF_INSERT),
      traceMaxSteps: TRACE_MAX_STEPS,
      traceMaxLoopIterations: TRACE_MAX_LOOP_ITERATIONS,
      returnSentinel: hex(RETURN_SENTINEL),
      stackTop: hex(STACK_TOP),
      mbase: hexByte(MBASE),
      timerInterrupt: false,
    },
    experiments: [...runtimeResults, staticResult],
    topLevelFindings: buildStaticConclusions(),
  };

  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (error) {
  console.log(JSON.stringify({
    probe: 'probe-phase214-display-result-loop.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
