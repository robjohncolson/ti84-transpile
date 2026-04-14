#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  PRELIFTED_BLOCKS,
  TRANSPILATION_META,
  decodeEmbeddedRom,
} from './ROM.transpiled.js';
import { createPeripheralBus } from './peripherals.js';
import { createExecutor } from './cpu-runtime.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = path.join(__dirname, 'phase110-report.md');

const COLD_BOOT_ENTRY = 0x000000;
const OS_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const DISPATCH_ENTRY = 0x085e16;
const STACK_TOP = 0xd1a87e;

const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xe00000;
const KEY_EVENT_ADDR = 0xd0058e;
const CUR_ROW_ADDR = 0xd00595;
const CUR_COL_ADDR = 0xd00596;
const VRAM_START = 0xd40000;
const VRAM_END = 0xd52c00;

const INTC_ENABLE_PORTS = [0x5004, 0x5005, 0x5006];
const INTC_ACK_PORTS = [0x5008, 0x5009, 0x500a];
const KEYBOARD_GROUP_SELECT_PORT = 0x0001;
const KBD_MMIO_ADDRS = [0xe00803, 0xe00807, 0xe00808, 0xe0080f];
const LCD_MMIO_ADDRS = [0xe00010, 0xe00011, 0xe00012, 0xe00018];

const TRACE_LIMIT = 50;
const VRAM_WRITER_LIMIT = 20;

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
  { label: 'ENTER', value: 0x10 },
  { label: 'CLEAR', value: 0x16 },
  { label: 'DIGIT_2', value: 0x31 },
  { label: 'DIGIT_0', value: 0x40 },
];

function hex(value, width = 2) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function formatBlock(pc, mode = 'adl') {
  const base = hex(pc, 6);

  if (mode === 'adl') {
    return base;
  }

  return `${base}:${mode}`;
}

function summarizeRun(run) {
  return {
    steps: run.steps,
    termination: run.termination,
    lastPc: run.lastPc ?? 0,
    lastMode: run.lastMode ?? 'adl',
    loopsForced: run.loopsForced ?? 0,
    missingBlocks: [...(run.missingBlocks ?? [])],
  };
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

function snapshotByteRange(mem, start, end) {
  return new Uint8Array(mem.slice(start, end));
}

function restoreByteRange(mem, start, snapshot) {
  mem.set(snapshot, start);
}

function snapshotMmio(cpu, addresses) {
  return addresses.map((addr) => cpu.read8(addr) & 0xff);
}

function restoreMmio(cpu, addresses, values) {
  for (let index = 0; index < addresses.length; index++) {
    cpu.write8(addresses[index], values[index]);
  }
}

function bootEnvironment() {
  const romBytes = decodeEmbeddedRom();
  const mem = new Uint8Array(0x1000000);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const coldBoot = executor.runFrom(COLD_BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;

  const osInit = executor.runFrom(OS_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xd0;
  cpu._iy = 0xd00080;

  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 50000,
    maxLoopIterations: 500,
  });

  return {
    mem,
    peripherals,
    executor,
    cpu,
    coldBoot,
    osInit,
    postInit,
    baselineCpu: snapshotCpu(cpu),
    baselineRam: snapshotByteRange(mem, RAM_SNAPSHOT_START, RAM_SNAPSHOT_END),
    baselineKeyboardMmio: snapshotMmio(cpu, KBD_MMIO_ADDRS),
    baselineLcdMmio: snapshotMmio(cpu, LCD_MMIO_ADDRS),
    baselineIntcEnable: INTC_ENABLE_PORTS.map((port) => peripherals.read(port) & 0xff),
  };
}

function restoreBaseline(env) {
  restoreByteRange(env.mem, RAM_SNAPSHOT_START, env.baselineRam);
  restoreCpu(env.cpu, env.baselineCpu);

  env.peripherals.keyboard.keyMatrix.fill(0xff);
  env.peripherals.write(KEYBOARD_GROUP_SELECT_PORT, 0xff);

  if (typeof env.peripherals.setKeyboardIRQ === 'function') {
    env.peripherals.setKeyboardIRQ(false);
  }

  for (const port of INTC_ACK_PORTS) {
    env.peripherals.write(port, 0xff);
  }

  if (typeof env.peripherals.acknowledgeIRQ === 'function') {
    env.peripherals.acknowledgeIRQ();
  }

  if (typeof env.peripherals.acknowledgeNMI === 'function') {
    env.peripherals.acknowledgeNMI();
  }

  for (let index = 0; index < INTC_ENABLE_PORTS.length; index++) {
    env.peripherals.write(INTC_ENABLE_PORTS[index], env.baselineIntcEnable[index]);
  }

  restoreMmio(env.cpu, KBD_MMIO_ADDRS, env.baselineKeyboardMmio);
  restoreMmio(env.cpu, LCD_MMIO_ADDRS, env.baselineLcdMmio);
}

function pushUnique(list, seen, value) {
  if (seen.has(value)) {
    return;
  }

  seen.add(value);
  list.push(value);
}

function installTraceHooks(env) {
  const state = {
    currentBlock: formatBlock(DISPATCH_ENTRY, 'adl'),
    currentPc: DISPATCH_ENTRY,
    currentMode: 'adl',
    currentStep: 0,
    blockTrace: [],
    uniqueBlocks: [],
    seenUniqueBlocks: new Set(),
    keyEventReads: [],
    keyEventWrites: [],
    curRowWrites: [],
    curColWrites: [],
    vramWriteCount: 0,
    vramWriterBlocks: [],
    seenVramWriterBlocks: new Set(),
  };

  const originalRead8 = env.cpu.read8.bind(env.cpu);
  const originalWrite8 = env.cpu.write8.bind(env.cpu);

  env.cpu.read8 = (addr) => {
    const value = originalRead8(addr);
    const maskedAddr = addr & 0xffffff;

    if (maskedAddr === KEY_EVENT_ADDR) {
      state.keyEventReads.push({
        value: value & 0xff,
        block: state.currentBlock,
        step: state.currentStep,
      });
    }

    return value;
  };

  env.cpu.write8 = (addr, value) => {
    const maskedAddr = addr & 0xffffff;
    const maskedValue = value & 0xff;
    const entry = {
      addr: maskedAddr,
      value: maskedValue,
      block: state.currentBlock,
      step: state.currentStep,
    };

    if (maskedAddr === KEY_EVENT_ADDR) {
      state.keyEventWrites.push(entry);
    } else if (maskedAddr === CUR_ROW_ADDR) {
      state.curRowWrites.push(entry);
    } else if (maskedAddr === CUR_COL_ADDR) {
      state.curColWrites.push(entry);
    }

    if (maskedAddr >= VRAM_START && maskedAddr < VRAM_END) {
      state.vramWriteCount++;

      if (
        state.vramWriterBlocks.length < VRAM_WRITER_LIMIT
        && !state.seenVramWriterBlocks.has(state.currentBlock)
      ) {
        state.seenVramWriterBlocks.add(state.currentBlock);
        state.vramWriterBlocks.push({
          block: state.currentBlock,
          addr: maskedAddr,
          step: state.currentStep,
        });
      }
    }

    return originalWrite8(addr, value);
  };

  function onBlock(pc, mode) {
    state.currentPc = pc & 0xffffff;
    state.currentMode = mode;
    state.currentBlock = formatBlock(state.currentPc, mode);
    state.currentStep = state.blockTrace.length + 1;
    state.blockTrace.push(state.currentBlock);
    pushUnique(state.uniqueBlocks, state.seenUniqueBlocks, state.currentBlock);
  }

  function uninstall() {
    env.cpu.read8 = originalRead8;
    env.cpu.write8 = originalWrite8;
  }

  return { state, onBlock, uninstall };
}

function runDispatchExperiment(env, scanCode) {
  restoreBaseline(env);
  env.mem[KEY_EVENT_ADDR] = scanCode.value;

  const trap = installTraceHooks(env);
  let run;

  try {
    run = env.executor.runFrom(DISPATCH_ENTRY, 'adl', {
      maxSteps: 200000,
      maxLoopIterations: 500,
      onBlock: trap.onBlock,
    });
  } finally {
    trap.uninstall();
  }

  const summary = summarizeRun(run);

  return {
    scanLabel: scanCode.label,
    scanCode: scanCode.value,
    steps: summary.steps,
    termination: summary.termination,
    lastPc: summary.lastPc,
    lastMode: summary.lastMode,
    loopsForced: summary.loopsForced,
    missingBlocks: summary.missingBlocks,
    blockTrace: trap.state.blockTrace,
    uniqueBlocks: trap.state.uniqueBlocks,
    keyEventReads: trap.state.keyEventReads,
    keyEventWrites: trap.state.keyEventWrites,
    curRowWrites: trap.state.curRowWrites,
    curColWrites: trap.state.curColWrites,
    vramWriteCount: trap.state.vramWriteCount,
    vramWriterBlocks: trap.state.vramWriterBlocks,
    vramBytes: snapshotByteRange(env.mem, VRAM_START, VRAM_END),
  };
}

function formatRunLine(label, run) {
  return `- ${label}: \`steps=${run.steps} termination=${run.termination} lastPc=${formatBlock(run.lastPc, run.lastMode)}\``;
}

function formatAccessEntries(entries, limit = Infinity) {
  if (entries.length === 0) {
    return '-';
  }

  const rendered = entries
    .slice(0, limit)
    .map((entry) => `${hex(entry.value, 2)}@${entry.block}#${entry.step}`)
    .join(', ');

  if (entries.length <= limit) {
    return rendered;
  }

  return `${rendered} ... (+${entries.length - limit} more)`;
}

function formatVramWriterBlocks(entries) {
  if (entries.length === 0) {
    return '-';
  }

  return entries
    .map((entry) => `${entry.block}->${hex(entry.addr, 6)}#${entry.step}`)
    .join(', ');
}

function formatBlockList(blocks, limit = TRACE_LIMIT) {
  if (blocks.length === 0) {
    return '-';
  }

  return blocks.slice(0, limit).join(', ');
}

function buildSummaryRows(results) {
  return results.map((result) => [
    result.scanLabel,
    hex(result.scanCode, 2),
    String(result.steps),
    result.termination,
    formatBlock(result.lastPc, result.lastMode),
    String(result.keyEventReads.length),
    String(result.keyEventWrites.length),
    String(result.curRowWrites.length),
    String(result.curColWrites.length),
    String(result.vramWriteCount),
  ]);
}

function renderMarkdownTable(headers, rows) {
  const headerLine = `| ${headers.join(' | ')} |`;
  const dividerLine = `| ${headers.map(() => '---').join(' | ')} |`;
  const rowLines = rows.map((row) => `| ${row.join(' | ')} |`);

  return [headerLine, dividerLine, ...rowLines];
}

function computeCommonPrefix(lists) {
  let index = 0;

  while (true) {
    const base = lists[0][index];

    if (base === undefined) {
      break;
    }

    let allMatch = true;

    for (let scanIndex = 1; scanIndex < lists.length; scanIndex++) {
      if (lists[scanIndex][index] !== base) {
        allMatch = false;
        break;
      }
    }

    if (!allMatch) {
      break;
    }

    index++;
  }

  const identical = lists.every((list) => list.length === index);

  return {
    commonPrefixLength: index,
    divergenceIndex: identical ? null : index,
    divergentBlocks: lists.map((list) => list[index] ?? 'END'),
  };
}

function findFirstVramDifference(results) {
  const base = results[0].vramBytes;

  for (let offset = 0; offset < base.length; offset++) {
    const firstValue = base[offset];

    for (let index = 1; index < results.length; index++) {
      if (results[index].vramBytes[offset] !== firstValue) {
        return {
          offset,
          address: VRAM_START + offset,
          values: results.map((result) => ({
            scanLabel: result.scanLabel,
            value: result.vramBytes[offset],
          })),
        };
      }
    }
  }

  return null;
}

function arrayEqual(left, right) {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
}

function serializeEntries(entries) {
  return entries.map((entry) => `${hex(entry.addr, 6)}:${hex(entry.value, 2)}:${entry.block}:${entry.step}`);
}

function runsAreEquivalent(base, candidate) {
  if (base.steps !== candidate.steps) {
    return false;
  }

  if (base.termination !== candidate.termination) {
    return false;
  }

  if (base.lastPc !== candidate.lastPc || base.lastMode !== candidate.lastMode) {
    return false;
  }

  if (base.vramWriteCount !== candidate.vramWriteCount) {
    return false;
  }

  if (!arrayEqual(base.blockTrace, candidate.blockTrace)) {
    return false;
  }

  if (!arrayEqual(serializeEntries(base.keyEventWrites), serializeEntries(candidate.keyEventWrites))) {
    return false;
  }

  if (!arrayEqual(serializeEntries(base.curRowWrites), serializeEntries(candidate.curRowWrites))) {
    return false;
  }

  if (!arrayEqual(serializeEntries(base.curColWrites), serializeEntries(candidate.curColWrites))) {
    return false;
  }

  return true;
}

function buildReport(env, results) {
  const lines = [];
  const summaryTable = renderMarkdownTable(
    [
      'scan',
      'code',
      'steps',
      'termination',
      'lastPc',
      'keyReads',
      'keyWrites',
      'curRowWrites',
      'curColWrites',
      'vramWrites',
    ],
    buildSummaryRows(results),
  );

  const blockDiff = computeCommonPrefix(results.map((result) => result.blockTrace));
  const uniqueBlockDiff = computeCommonPrefix(results.map((result) => result.uniqueBlocks));
  const vramDiff = findFirstVramDifference(results);
  const allEquivalent = results.slice(1).every((result) => runsAreEquivalent(results[0], result));
  const verdict = allEquivalent && vramDiff === null
    ? 'ALL_IDENTICAL'
    : 'KEY_DIFFERENTIATION_FOUND';

  lines.push('# Phase 110 - Deep-Dive into 0x085E16 Key Dispatch');
  lines.push('');
  lines.push('Generated by `probe-phase110-dispatch-deep.mjs`.');
  lines.push('');
  lines.push('## Setup');
  lines.push('');
  lines.push(`- Dispatch entry: \`${hex(DISPATCH_ENTRY, 6)}\``);
  lines.push(`- Boot ROM generatedAt: \`${TRANSPILATION_META?.generatedAt ?? 'n/a'}\``);
  lines.push(`- Snapshot RAM window: \`${hex(RAM_SNAPSHOT_START, 6)}-${hex(RAM_SNAPSHOT_END - 1, 6)}\``);
  lines.push(`- VRAM window: \`${hex(VRAM_START, 6)}-${hex(VRAM_END - 1, 6)}\``);
  lines.push(formatRunLine('coldBoot', env.coldBoot));
  lines.push(formatRunLine('osInit', env.osInit));
  lines.push(formatRunLine('postInit', env.postInit));
  lines.push('');
  lines.push('## Per Scan-Code Summary');
  lines.push('');
  lines.push(...summaryTable);
  lines.push('');

  for (const result of results) {
    lines.push(`## ${result.scanLabel} (${hex(result.scanCode, 2)})`);
    lines.push('');
    lines.push(`- Steps: \`${result.steps}\``);
    lines.push(`- Termination: \`${result.termination}\``);
    lines.push(`- Last PC: \`${formatBlock(result.lastPc, result.lastMode)}\``);
    lines.push(`- Loops forced: \`${result.loopsForced}\``);
    lines.push(`- Missing blocks: \`${result.missingBlocks.length === 0 ? '-' : result.missingBlocks.join(',')}\``);
    lines.push(`- Key-event reads from ${hex(KEY_EVENT_ADDR, 6)}: ${formatAccessEntries(result.keyEventReads, 32)}`);
    lines.push(`- Key-event writes to ${hex(KEY_EVENT_ADDR, 6)}: ${formatAccessEntries(result.keyEventWrites)}`);
    lines.push(`- Cursor row writes to ${hex(CUR_ROW_ADDR, 6)}: ${formatAccessEntries(result.curRowWrites)}`);
    lines.push(`- Cursor col writes to ${hex(CUR_COL_ADDR, 6)}: ${formatAccessEntries(result.curColWrites)}`);
    lines.push(`- VRAM write count: \`${result.vramWriteCount}\``);
    lines.push('- First 20 unique VRAM-writer blocks:');
    lines.push('');
    lines.push('```text');
    lines.push(formatVramWriterBlocks(result.vramWriterBlocks));
    lines.push('```');
    lines.push('');
    lines.push('- First 50 unique blocks visited:');
    lines.push('');
    lines.push('```text');
    lines.push(formatBlockList(result.uniqueBlocks, TRACE_LIMIT));
    lines.push('```');
    lines.push('');
  }

  lines.push('## Block-Visit Diff');
  lines.push('');
  lines.push(`- Common block-trace prefix length: \`${blockDiff.commonPrefixLength}\``);
  lines.push(`- Common unique-block prefix length: \`${uniqueBlockDiff.commonPrefixLength}\``);

  if (blockDiff.divergenceIndex === null) {
    lines.push('- First divergent executed block: `IDENTICAL`');
  } else {
    lines.push(`- First divergent executed block index: \`${blockDiff.divergenceIndex}\``);
  }

  lines.push('');
  lines.push(...renderMarkdownTable(
    ['scan', 'first divergent executed block'],
    results.map((result, index) => [
      result.scanLabel,
      blockDiff.divergenceIndex === null ? 'IDENTICAL' : blockDiff.divergentBlocks[index],
    ]),
  ));
  lines.push('');
  lines.push('## VRAM Diff');
  lines.push('');

  if (vramDiff === null) {
    lines.push('- First differing byte offset: `IDENTICAL`');
  } else {
    lines.push(`- First differing byte offset: \`${hex(vramDiff.offset, 4)}\` (VRAM addr \`${hex(vramDiff.address, 6)}\`)`);
    lines.push(`- Byte values: ${vramDiff.values.map((value) => `${value.scanLabel}=${hex(value.value, 2)}`).join(', ')}`);
  }

  lines.push('');
  lines.push('## Verdict');
  lines.push('');
  lines.push(`VERDICT: ${verdict}`);
  lines.push('');

  return lines.join('\n');
}

function buildFailureReport(error) {
  const message = error.stack || String(error);

  return [
    '# Phase 110 - Deep-Dive into 0x085E16 Key Dispatch',
    '',
    'Generated by `probe-phase110-dispatch-deep.mjs`.',
    '',
    '## Failure',
    '',
    '```text',
    message,
    '```',
    '',
  ].join('\n');
}

function main() {
  const env = bootEnvironment();
  const results = SCAN_CODES.map((scanCode) => runDispatchExperiment(env, scanCode));
  const report = buildReport(env, results);

  console.log(report);
  fs.writeFileSync(REPORT_PATH, `${report}\n`, 'utf8');
}

try {
  main();
} catch (error) {
  const failureReport = buildFailureReport(error);
  console.error(error.stack || String(error));
  fs.writeFileSync(REPORT_PATH, failureReport, 'utf8');
  process.exitCode = 1;
}
