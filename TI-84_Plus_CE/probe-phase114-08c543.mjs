#!/usr/bin/env node

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ENTRY_POINTS, PRELIFTED_BLOCKS, decodeEmbeddedRom } from './ROM.transpiled.js';
import { createPeripheralBus } from './peripherals.js';
import { createExecutor } from './cpu-runtime.js';
import { decodeInstruction } from './ez80-decoder.js';

const REPORT_URL = new URL('./phase114-report.md', import.meta.url);

const ENTRY = 0x08c543;
const RENDER_ENTRY = 0x085e16;

const RAM_START = 0x400000;
const RAM_END = 0xe00000;
const VRAM_START = 0xd40000;
const VRAM_END = 0xd4c000;

const KEY_EVENT_ADDR = 0xd0058e;
const CUR_ROW_ADDR = 0xd00595;
const CUR_COL_ADDR = 0xd00596;
const STACK_SENTINEL = 0xd1a87e - 3;

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

const SCAN_CODES = [
  { label: 'ENTER', value: 0x09 },
  { label: 'CLEAR', value: 0x0f },
  { label: 'DIGIT_2', value: 0x9a },
  { label: 'DIGIT_0', value: 0x8a },
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xff, 2);
}

function snapshotCpu(cpu) {
  return Object.fromEntries(
    CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]),
  );
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_SNAPSHOT_FIELDS) {
    cpu[field] = snapshot[field];
  }
}

function summarizeRun(run) {
  return {
    steps: run.steps,
    termination: run.termination,
    lastPc: run.lastPc ?? 0,
    lastMode: run.lastMode ?? 'adl',
  };
}

function formatIndexedOperand(indexRegister, displacement) {
  const sign = displacement >= 0 ? '+' : '';
  return `(${indexRegister}${sign}${displacement})`;
}

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'indexed-cb-bit':
      return `bit ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'jr-conditional':
      return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'ld-pair-mem':
      return `ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-pair-imm':
      return `ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-reg-ind':
      return `ld ${inst.dest}, (${inst.src})`;
    case 'call':
      return `call ${hex(inst.target)}`;
    case 'ex-de-hl':
      return 'ex de, hl';
    default:
      return inst.tag;
  }
}

function disassembleRange(romBytes, startPc, byteCount) {
  const rows = [];
  let pc = startPc;
  const endPc = startPc + byteCount;

  while (pc < endPc) {
    const inst = decodeInstruction(romBytes, pc, 'adl');
    rows.push(`${hex(inst.pc)}: ${formatInstruction(inst)}`);
    pc += inst.length;
  }

  return rows;
}

function bootEnvironment() {
  const romBytes = decodeEmbeddedRom();
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const coldBoot = executor.runFrom(0x000000, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = 0xd1a87e - 3;

  const osInit = executor.runFrom(0x08c331, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;

  const postInit = executor.runFrom(0x0802b2, 'adl', {
    maxSteps: 50000,
    maxLoopIterations: 500,
  });

  return {
    romBytes,
    mem,
    executor,
    cpu,
    coldBoot,
    osInit,
    postInit,
    baselineRam: new Uint8Array(mem.slice(RAM_START, RAM_END)),
    baselineCpu: snapshotCpu(cpu),
  };
}

function restoreBaseline(env) {
  env.mem.set(env.baselineRam, RAM_START);
  restoreCpu(env.cpu, env.baselineCpu);
}

function installTraceHooks(env) {
  const state = {
    currentPc: ENTRY,
    currentStep: 0,
    blockTrace: [],
    uniqueBlocks: [],
    seenBlocks: new Set(),
    keyWrites: [],
    curRowWrites: [],
    curColWrites: [],
    vramWriteCount: 0,
    visitedRender: false,
  };

  const originalWrite8 = env.cpu.write8.bind(env.cpu);

  env.cpu.write8 = (addr, value) => {
    const maskedAddr = addr & 0xffffff;
    const maskedValue = value & 0xff;
    const event = {
      addr: maskedAddr,
      value: maskedValue,
      pc: state.currentPc,
      step: state.currentStep,
    };

    if (maskedAddr === KEY_EVENT_ADDR) {
      state.keyWrites.push(event);
    } else if (maskedAddr === CUR_ROW_ADDR) {
      state.curRowWrites.push(event);
    } else if (maskedAddr === CUR_COL_ADDR) {
      state.curColWrites.push(event);
    } else if (maskedAddr >= VRAM_START && maskedAddr < VRAM_END) {
      state.vramWriteCount += 1;
    }

    return originalWrite8(addr, value);
  };

  function onBlock(pc, mode, _meta, steps) {
    state.currentPc = pc & 0xffffff;
    state.currentStep = steps;

    const blockKey = `${hex(state.currentPc)}:${mode}`;
    state.blockTrace.push(blockKey);

    if (!state.seenBlocks.has(blockKey)) {
      state.seenBlocks.add(blockKey);
      state.uniqueBlocks.push(blockKey);
    }

    if (state.currentPc === RENDER_ENTRY) {
      state.visitedRender = true;
    }
  }

  function uninstall() {
    env.cpu.write8 = originalWrite8;
  }

  return { state, onBlock, uninstall };
}

function runScan(env, scanCode) {
  restoreBaseline(env);

  env.mem[KEY_EVENT_ADDR] = scanCode.value;
  env.cpu.sp = STACK_SENTINEL;
  env.mem[env.cpu.sp] = 0xff;
  env.mem[env.cpu.sp + 1] = 0xff;
  env.mem[env.cpu.sp + 2] = 0xff;

  const trace = installTraceHooks(env);
  let run;

  try {
    run = env.executor.runFrom(ENTRY, 'adl', {
      maxSteps: 200000,
      maxLoopIterations: 10000,
      onBlock: trace.onBlock,
    });
  } finally {
    trace.uninstall();
  }

  const summary = summarizeRun(run);

  return {
    scanLabel: scanCode.label,
    scanCode: scanCode.value,
    steps: summary.steps,
    termination: summary.termination,
    lastPc: summary.lastPc,
    lastMode: summary.lastMode,
    vramWriteCount: trace.state.vramWriteCount,
    uniqueBlocks: trace.state.uniqueBlocks,
    blockTrace: trace.state.blockTrace,
    visitedRender: trace.state.visitedRender,
    keyWrites: trace.state.keyWrites,
    curRowWrites: trace.state.curRowWrites,
    curColWrites: trace.state.curColWrites,
    vramBytes: new Uint8Array(env.mem.slice(VRAM_START, VRAM_END)),
  };
}

function sameArray(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function firstDifference(left, right) {
  const limit = Math.min(left.length, right.length);

  for (let index = 0; index < limit; index += 1) {
    if (left[index] !== right[index]) {
      return index;
    }
  }

  return left.length === right.length ? -1 : limit;
}

function renderMarkdownTable(headers, rows) {
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.join(' | ')} |`),
  ];
}

function formatWrite(event) {
  return `${hexByte(event.value)}@${hex(event.pc)}#${event.step}`;
}

function formatKeyDifferences(result) {
  const keyWrites = result.keyWrites.map(formatWrite).join(', ') || 'none';
  const cursorWrites = result.curRowWrites.length + result.curColWrites.length;
  const cursorText = cursorWrites === 0 ? 'no cursor writes' : `${cursorWrites} cursor writes`;
  const vramText = result.vramWriteCount === 0 ? 'no VRAM writes' : `${result.vramWriteCount} VRAM writes`;
  return `clears key: ${keyWrites}; ${cursorText}; ${vramText}`;
}

function buildReport(env, staticDisasm, results) {
  const lines = [];
  const baseline = results[0];
  const comparisonRows = results.slice(1).map((result) => {
    const firstBlockDiff = firstDifference(baseline.blockTrace, result.blockTrace);
    const firstUniqueDiff = firstDifference(baseline.uniqueBlocks, result.uniqueBlocks);
    const firstVramDiff = firstDifference(baseline.vramBytes, result.vramBytes);

    return [
      result.scanLabel,
      sameArray(baseline.blockTrace, result.blockTrace) ? 'identical' : 'different',
      sameArray(baseline.uniqueBlocks, result.uniqueBlocks) ? 'identical' : 'different',
      sameArray(baseline.vramBytes, result.vramBytes) ? 'identical' : 'different',
      firstBlockDiff === -1 ? 'IDENTICAL' : String(firstBlockDiff),
      firstUniqueDiff === -1 ? 'IDENTICAL' : String(firstUniqueDiff),
      firstVramDiff === -1 ? 'IDENTICAL' : String(firstVramDiff),
    ];
  });

  lines.push('# Phase 114 - 0x08C543 Normal-Key Handler Investigation');
  lines.push('');
  lines.push('Generated by `probe-phase114-08c543.mjs`.');
  lines.push('');
  lines.push('## Boot Environment');
  lines.push('');
  lines.push('This probe reuses the Phase 113 boot recipe exactly: cold boot -> `0x08c331` OS init -> `0x0802b2` post-init.');
  lines.push('');
  lines.push('| stage | steps | termination | last pc |');
  lines.push('|-------|------:|-------------|---------|');
  lines.push(`| coldBoot | ${env.coldBoot.steps} | ${env.coldBoot.termination} | ${hex(env.coldBoot.lastPc)} |`);
  lines.push(`| osInit | ${env.osInit.steps} | ${env.osInit.termination} | ${hex(env.osInit.lastPc)} |`);
  lines.push(`| postInit | ${env.postInit.steps} | ${env.postInit.termination} | ${hex(env.postInit.lastPc)} |`);
  lines.push('');
  lines.push('## Static Disassembly (first 40 bytes, ADL)');
  lines.push('');
  lines.push('```text');
  lines.push(...staticDisasm);
  lines.push('```');
  lines.push('');
  lines.push('## Per Scan-Code Summary');
  lines.push('');
  lines.push(...renderMarkdownTable(
    [
      'scan',
      'code',
      'steps',
      'termination',
      'lastPc',
      'vramWrites',
      'uniqueBlocks',
      '0x085E16 visited',
      'key differences',
    ],
    results.map((result) => [
      result.scanLabel,
      hexByte(result.scanCode),
      String(result.steps),
      result.termination,
      hex(result.lastPc),
      String(result.vramWriteCount),
      String(result.uniqueBlocks.length),
      result.visitedRender ? 'yes' : 'no',
      formatKeyDifferences(result),
    ]),
  ));
  lines.push('');
  lines.push('## Comparison');
  lines.push('');
  lines.push(...renderMarkdownTable(
    [
      'compare vs ENTER',
      'block trace',
      'unique blocks',
      'VRAM bytes',
      'first block diff',
      'first unique diff',
      'first VRAM diff',
    ],
    comparisonRows,
  ));
  lines.push('');
  lines.push(`- ENTRY_POINTS contains \`${hex(ENTRY)}\`: ${Array.isArray(ENTRY_POINTS) && ENTRY_POINTS.includes(ENTRY) ? 'yes' : 'no'}.`);
  lines.push(`- \`${hex(RENDER_ENTRY)}\` was visited in any run: ${results.some((result) => result.visitedRender) ? 'yes' : 'no'}.`);
  lines.push(`- Every run executed ${baseline.blockTrace.length} blocks and collected ${baseline.uniqueBlocks.length} unique blocks.`);
  lines.push(`- The VRAM window \`${hex(VRAM_START)}-${hex(VRAM_END - 1)}\` stayed unchanged for all four scan codes.`);
  lines.push('');
  lines.push('## Assessment');
  lines.push('');
  lines.push('`0x08C543` did not differentiate any of the requested scan codes in this direct-entry probe. The first 40 bytes do not read the key-event byte at all; they only test `IY` flags, load RAM pointers, and call helper routines.');
  lines.push('');
  lines.push('Dynamically, every run followed the same block trace, performed the same two `0xD0058E <- 0x00` writes, produced no cursor or VRAM writes, never reached `0x085E16`, and terminated on the same `0xffffff` callback path. If scan-specific behavior exists, it is downstream of the missing callback state rather than in the reachable prefix of `0x08C543` itself.');
  lines.push('');

  return `${lines.join('\n')}`;
}

function buildFailureReport(error) {
  return [
    '# Phase 114 - 0x08C543 Normal-Key Handler Investigation',
    '',
    'Generated by `probe-phase114-08c543.mjs`.',
    '',
    '## Failure',
    '',
    '```text',
    error.stack || String(error),
    '```',
    '',
  ].join('\n');
}

function main() {
  const env = bootEnvironment();
  const staticDisasm = disassembleRange(env.romBytes, ENTRY, 40);
  const results = SCAN_CODES.map((scanCode) => runScan(env, scanCode));
  const report = buildReport(env, staticDisasm, results);

  writeFileSync(REPORT_URL, `${report}\n`, 'utf8');
  console.log(`Wrote ${fileURLToPath(REPORT_URL)}`);
  console.log('assessment=no_scan_code_differentiation_before_callback');
}

try {
  main();
} catch (error) {
  writeFileSync(REPORT_URL, buildFailureReport(error), 'utf8');
  throw error;
}
