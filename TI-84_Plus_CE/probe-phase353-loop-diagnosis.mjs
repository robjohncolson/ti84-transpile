#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');
const CPU_RUNTIME_PATH = path.join(__dirname, 'cpu-runtime.js');
const PERIPHERALS_PATH = path.join(__dirname, 'peripherals.js');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');
const TRANSPILER_PATH = path.resolve(__dirname, '..', 'scripts', 'transpile-ti84-rom.mjs');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const MAX_STEPS = 2000;
const STABLE_START_STEP = 600;
const STABLE_END_STEP = 700;
const DISASM_BYTES = 20;
const CYCLE_SCAN_START = 600;
const CYCLE_SCAN_SLACK = 64;
const MAX_CYCLE_PERIOD = 256;

const BRANCH_TAGS = new Set([
  'call',
  'call-conditional',
  'djnz',
  'jp',
  'jp-conditional',
  'jp-indirect',
  'jr',
  'jr-conditional',
  'ret',
  'ret-conditional',
  'reti',
  'retn',
  'rst',
  'slp',
]);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return ((value ?? 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function hexBytes(buffer, start, length) {
  return Array.from(
    buffer.subarray(start, Math.min(buffer.length, start + Math.max(length, 0))),
    (value) => hexByte(value),
  ).join(' ');
}

function formatDisp(value) {
  if (!Number.isFinite(value)) {
    return '+0x00';
  }
  if (value >= 0) {
    return `+0x${value.toString(16).toUpperCase()}`;
  }
  return `-0x${(-value).toString(16).toUpperCase()}`;
}

function blockKey(pc, mode) {
  return (pc >>> 0).toString(16).padStart(6, '0') + ':' + mode;
}

function blockLabel(entry) {
  return `${hex(entry.pc)}:${entry.mode}`;
}

function normalizePort(port) {
  return Number(port) & 0xFFFF;
}

function normalizeValue(value) {
  return Number(value) & 0xFF;
}

function ensureTranspiledRom() {
  if (fs.existsSync(TRANSPILED_PATH)) {
    return false;
  }

  const sourceHint = fs.existsSync(TRANSPILED_GZ_PATH)
    ? `${path.basename(TRANSPILED_GZ_PATH)} is present; `
    : '';

  console.log(`${sourceHint}${path.basename(TRANSPILED_PATH)} is missing. Running transpiler...`);
  execFileSync(process.execPath, [TRANSPILER_PATH], {
    cwd: path.resolve(__dirname, '..'),
    stdio: 'inherit',
  });

  if (!fs.existsSync(TRANSPILED_PATH)) {
    throw new Error(`${path.basename(TRANSPILED_PATH)} is still missing after transpile.`);
  }

  return true;
}

function createMemoryBus(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return mem;
}

function withModePrefix(inst, text) {
  return inst?.modePrefix ? `${inst.modePrefix} ${text}` : text;
}

function fallbackMnemonic(inst) {
  const ignored = new Set([
    'fallthrough',
    'kind',
    'length',
    'mode',
    'modePrefix',
    'nextMode',
    'nextPc',
    'pc',
    'port',
    'target',
    'terminates',
  ]);

  const parts = [];
  for (const [key, value] of Object.entries(inst ?? {})) {
    if (key === 'tag' || ignored.has(key) || value === undefined || value === null) {
      continue;
    }

    if (typeof value === 'number') {
      if (key === 'addr' || key === 'target' || key === 'value') {
        parts.push(`${key}=${hex(value)}`);
      } else if (key === 'displacement') {
        parts.push(`${key}=${formatDisp(value)}`);
      } else if (key === 'port') {
        parts.push(`${key}=${hex(value, 2)}`);
      } else {
        parts.push(`${key}=${value}`);
      }
    } else {
      parts.push(`${key}=${value}`);
    }
  }

  return withModePrefix(inst, parts.length > 0 ? `${inst.tag} ${parts.join(' ')}` : inst.tag);
}

function formatInstruction(inst) {
  switch (inst?.tag) {
    case 'adc-pair':
      return withModePrefix(inst, `adc hl, ${inst.src}`);
    case 'add-pair':
      return withModePrefix(inst, `add ${inst.dest}, ${inst.src}`);
    case 'alu-imm':
      return withModePrefix(inst, `${inst.op} ${hexByte(inst.value)}`);
    case 'alu-reg':
      return withModePrefix(inst, `${inst.op} ${inst.src}`);
    case 'bit-test':
      return withModePrefix(inst, `bit ${inst.bit}, ${inst.reg}`);
    case 'bit-test-ind':
      return withModePrefix(inst, `bit ${inst.bit}, (${inst.indirectRegister})`);
    case 'call':
      return withModePrefix(inst, `call ${hex(inst.target)}`);
    case 'call-conditional':
      return withModePrefix(inst, `call ${inst.condition}, ${hex(inst.target)}`);
    case 'ccf':
    case 'cpi':
    case 'cpd':
    case 'cpir':
    case 'cpdr':
    case 'daa':
    case 'di':
    case 'ei':
    case 'ex-af':
    case 'ex-de-hl':
    case 'ex-sp-hl':
    case 'exx':
    case 'halt':
    case 'ldd':
    case 'lddr':
    case 'ldi':
    case 'ldir':
    case 'ld-mb-a':
    case 'ld-a-mb':
    case 'neg':
    case 'nop':
    case 'rla':
    case 'rlca':
    case 'rra':
    case 'rrca':
    case 'rrd':
    case 'rld':
    case 'scf':
    case 'stmix':
    case 'rsmix':
      return withModePrefix(inst, inst.tag);
    case 'dec-pair':
      return withModePrefix(inst, `dec ${inst.pair}`);
    case 'dec-reg':
      return withModePrefix(inst, `dec ${inst.reg}`);
    case 'djnz':
      return withModePrefix(inst, `djnz ${hex(inst.target)}`);
    case 'im':
      return withModePrefix(inst, `im ${inst.value}`);
    case 'in-imm':
      return withModePrefix(inst, `in a, (${hexByte(inst.port)})`);
    case 'in-reg':
      return withModePrefix(inst, `in ${inst.reg}, (c)`);
    case 'in0':
      return withModePrefix(inst, `in0 ${inst.reg}, (${hexByte(inst.port)})`);
    case 'inc-pair':
      return withModePrefix(inst, `inc ${inst.pair}`);
    case 'inc-reg':
      return withModePrefix(inst, `inc ${inst.reg}`);
    case 'indexed-cb-bit':
      return withModePrefix(
        inst,
        `bit ${inst.bit}, (${inst.indexRegister}${formatDisp(inst.displacement)})`,
      );
    case 'indexed-cb-res':
      return withModePrefix(
        inst,
        `res ${inst.bit}, (${inst.indexRegister}${formatDisp(inst.displacement)})`,
      );
    case 'indexed-cb-rotate':
      return withModePrefix(
        inst,
        `${inst.operation ?? inst.op ?? 'rotate'} (${inst.indexRegister}${formatDisp(inst.displacement)})`,
      );
    case 'indexed-cb-set':
      return withModePrefix(
        inst,
        `set ${inst.bit}, (${inst.indexRegister}${formatDisp(inst.displacement)})`,
      );
    case 'jp':
      return withModePrefix(inst, `jp ${hex(inst.target)}`);
    case 'jp-conditional':
      return withModePrefix(inst, `jp ${inst.condition}, ${hex(inst.target)}`);
    case 'jp-indirect':
      return withModePrefix(inst, `jp (${inst.indirectRegister})`);
    case 'jr':
      return withModePrefix(inst, `jr ${hex(inst.target)}`);
    case 'jr-conditional':
      return withModePrefix(inst, `jr ${inst.condition}, ${hex(inst.target)}`);
    case 'ld-ind-imm':
      return withModePrefix(inst, `ld (hl), ${hexByte(inst.value)}`);
    case 'ld-ind-pair':
      return withModePrefix(inst, `ld (${inst.dest}), ${inst.pair}`);
    case 'ld-ind-reg':
      return withModePrefix(inst, `ld (${inst.dest}), ${inst.src}`);
    case 'ld-indexed-pair':
      return withModePrefix(
        inst,
        `ld (${inst.indexRegister}${formatDisp(inst.displacement)}), ${inst.pair}`,
      );
    case 'ld-mem-pair':
      return withModePrefix(inst, `ld (${hex(inst.addr)}), ${inst.pair}`);
    case 'ld-mem-reg':
      return withModePrefix(inst, `ld (${hex(inst.addr)}), ${inst.src}`);
    case 'ld-pair-imm':
      return withModePrefix(inst, `ld ${inst.pair}, ${hex(inst.value)}`);
    case 'ld-pair-indexed':
      return withModePrefix(
        inst,
        `ld ${inst.pair}, (${inst.indexRegister}${formatDisp(inst.displacement)})`,
      );
    case 'ld-pair-ind':
      return withModePrefix(inst, `ld ${inst.pair}, (${inst.src})`);
    case 'ld-pair-mem':
      return withModePrefix(inst, `ld ${inst.pair}, (${hex(inst.addr)})`);
    case 'ld-reg-imm':
      return withModePrefix(inst, `ld ${inst.dest}, ${hexByte(inst.value)}`);
    case 'ld-reg-ind':
      return withModePrefix(inst, `ld ${inst.dest}, (${inst.src})`);
    case 'ld-reg-ixd':
      return withModePrefix(
        inst,
        `ld ${inst.dest}, (${inst.indexRegister}${formatDisp(inst.displacement)})`,
      );
    case 'ld-reg-mem':
      return withModePrefix(inst, `ld ${inst.dest}, (${hex(inst.addr)})`);
    case 'ld-reg-reg':
      return withModePrefix(inst, `ld ${inst.dest}, ${inst.src}`);
    case 'ld-special':
      return withModePrefix(inst, `ld ${inst.dest}, ${inst.src}`);
    case 'ld-sp-hl':
      return withModePrefix(inst, 'ld sp, hl');
    case 'ld-sp-pair':
      return withModePrefix(inst, `ld sp, ${inst.pair}`);
    case 'lea':
      return withModePrefix(
        inst,
        `lea ${inst.dest}, ${inst.base}${formatDisp(inst.displacement)}`,
      );
    case 'mlt':
      return withModePrefix(inst, `mlt ${inst.reg}`);
    case 'otimr':
      return withModePrefix(inst, 'otimr');
    case 'out-imm':
      return withModePrefix(inst, `out (${hexByte(inst.port)}), a`);
    case 'out-reg':
      return withModePrefix(inst, `out (c), ${inst.reg}`);
    case 'out0':
      return withModePrefix(inst, `out0 (${hexByte(inst.port)}), ${inst.reg}`);
    case 'pea':
      return withModePrefix(inst, `pea ${inst.base}${formatDisp(inst.displacement)}`);
    case 'pop':
      return withModePrefix(inst, `pop ${inst.pair}`);
    case 'push':
      return withModePrefix(inst, `push ${inst.pair}`);
    case 'ret':
      return withModePrefix(inst, 'ret');
    case 'ret-conditional':
      return withModePrefix(inst, `ret ${inst.condition}`);
    case 'reti':
      return withModePrefix(inst, 'reti');
    case 'retn':
      return withModePrefix(inst, 'retn');
    case 'rst':
      return withModePrefix(inst, `rst ${hex(inst.target, 2)}`);
    case 'sbc-pair':
      return withModePrefix(inst, `sbc hl, ${inst.src}`);
    case 'slp':
      return withModePrefix(inst, 'slp');
    case 'tst-ind':
      return withModePrefix(inst, 'tst (hl)');
    case 'tst-imm':
      return withModePrefix(inst, `tst ${hexByte(inst.value)}`);
    case 'tst-reg':
      return withModePrefix(inst, `tst ${inst.reg}`);
    case 'tstio':
      return withModePrefix(inst, `tstio ${hexByte(inst.value)}`);
    default:
      return fallbackMnemonic(inst);
  }
}

function resolveNextMode(meta, returnedPc, currentMode) {
  if (!meta?.exits) {
    return currentMode;
  }

  for (const exit of meta.exits) {
    if (((exit.target ?? -1) & 0xFFFFFF) === (returnedPc & 0xFFFFFF) && exit.targetMode) {
      return exit.targetMode;
    }
  }

  return currentMode;
}

function disassembleBlock(romBytes, decodeInstruction, entry, maxBytes = DISASM_BYTES) {
  const rows = [];
  const limit = Math.min(entry.pc + maxBytes, romBytes.length);
  let cursor = entry.pc;

  while (cursor < limit) {
    let inst = null;
    try {
      inst = decodeInstruction(romBytes, cursor, entry.mode);
    } catch {
      inst = null;
    }

    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
      rows.push({
        pc: cursor,
        length: 1,
        bytes: hexBytes(romBytes, cursor, 1),
        tag: 'db',
        text: `db ${hexByte(romBytes[cursor])}`,
      });
      cursor += 1;
      continue;
    }

    rows.push({
      ...inst,
      bytes: hexBytes(romBytes, cursor, inst.length),
      text: formatInstruction(inst),
    });
    cursor += inst.length;
  }

  const terminator = [...rows].reverse().find((row) => BRANCH_TAGS.has(row.tag) || row.terminates) ?? null;
  return {
    bytes: hexBytes(romBytes, entry.pc, Math.min(maxBytes, romBytes.length - entry.pc)),
    rows,
    terminator,
  };
}

function getStepWindow(sequence, start, end) {
  return sequence.filter((entry) => entry.step >= start && entry.step <= end);
}

function findLoopCycle(sequence, startStep = CYCLE_SCAN_START) {
  if (sequence.length <= startStep + 1) {
    return null;
  }

  const maxStart = Math.min(sequence.length - 2, startStep + CYCLE_SCAN_SLACK);
  const upperPeriod = Math.min(MAX_CYCLE_PERIOD, Math.floor((sequence.length - startStep) / 2));

  for (let offset = startStep; offset <= maxStart; offset++) {
    const tail = sequence.slice(offset);
    const limit = Math.min(upperPeriod, Math.floor(tail.length / 2));

    for (let period = 1; period <= limit; period++) {
      let exact = true;
      for (let index = period; index < tail.length; index++) {
        if (tail[index].key !== tail[index % period].key) {
          exact = false;
          break;
        }
      }
      if (exact) {
        return {
          offset,
          period,
          exact: true,
          cycleEntries: tail.slice(0, period),
          repeatedTailLength: tail.length,
        };
      }
    }
  }

  let best = null;
  for (let offset = startStep; offset <= maxStart; offset++) {
    const tail = sequence.slice(offset);
    const limit = Math.min(upperPeriod, Math.floor(tail.length / 2));

    for (let period = 1; period <= limit; period++) {
      let matches = 0;
      let comparisons = 0;
      for (let index = period; index < tail.length; index++) {
        comparisons++;
        if (tail[index].key === tail[index % period].key) {
          matches++;
        }
      }
      const score = comparisons > 0 ? matches / comparisons : 0;
      if (!best || score > best.score || (score === best.score && period < best.period)) {
        best = {
          offset,
          period,
          score,
          exact: false,
          cycleEntries: tail.slice(0, period),
          repeatedTailLength: tail.length,
        };
      }
    }
  }

  return best && best.score >= 0.9 ? best : null;
}

function dedupeCycleEntries(entries) {
  const seen = new Set();
  const unique = [];
  for (const entry of entries) {
    if (seen.has(entry.key)) {
      continue;
    }
    seen.add(entry.key);
    unique.push(entry);
  }
  return unique;
}

function incrementNestedCount(map, outerKey, innerKey) {
  if (!map.has(outerKey)) {
    map.set(outerKey, new Map());
  }
  const inner = map.get(outerKey);
  inner.set(innerKey, (inner.get(innerKey) ?? 0) + 1);
}

function collectLoopStats(sequence, ioEvents, loop) {
  const statsByKey = new Map();
  const stepsInTail = new Set();
  const start = loop.offset;

  for (let index = start; index < sequence.length; index++) {
    const entry = sequence[index];
    const next = sequence[index + 1] ?? null;
    stepsInTail.add(entry.step);

    if (!statsByKey.has(entry.key)) {
      statsByKey.set(entry.key, {
        visits: 0,
        successors: new Map(),
        inPorts: new Map(),
        outPorts: new Map(),
      });
    }

    const stats = statsByKey.get(entry.key);
    stats.visits++;
    if (next) {
      stats.successors.set(next.key, (stats.successors.get(next.key) ?? 0) + 1);
    }
  }

  for (const event of ioEvents) {
    if (!stepsInTail.has(event.step)) {
      continue;
    }
    const stats = statsByKey.get(event.key);
    if (!stats) {
      continue;
    }
    const targetMap = event.dir === 'IN' ? stats.inPorts : stats.outPorts;
    const port = normalizePort(event.port);
    const value = normalizeValue(event.value);

    if (!targetMap.has(port)) {
      targetMap.set(port, {
        count: 0,
        values: new Map(),
      });
    }

    const portStats = targetMap.get(port);
    portStats.count++;
    portStats.values.set(value, (portStats.values.get(value) ?? 0) + 1);
  }

  return statsByKey;
}

function resolveObservedExit(meta, successorKey) {
  if (!meta?.exits || !successorKey) {
    return null;
  }

  const separator = successorKey.indexOf(':');
  const targetPc = Number.parseInt(successorKey.slice(0, separator), 16) & 0xFFFFFF;
  const targetMode = successorKey.slice(separator + 1);

  return meta.exits.find((exit) => {
    const exitTarget = (exit.target ?? -1) & 0xFFFFFF;
    const exitMode = exit.targetMode ?? meta.mode ?? targetMode;
    return exitTarget === targetPc && exitMode === targetMode;
  }) ?? meta.exits.find((exit) => ((exit.target ?? -1) & 0xFFFFFF) === targetPc) ?? null;
}

function pickMostFrequentPort(portMap) {
  return [...portMap.entries()]
    .sort((left, right) => {
      if (right[1].count !== left[1].count) {
        return right[1].count - left[1].count;
      }
      return left[0] - right[0];
    })[0] ?? null;
}

function formatValueCounts(values) {
  return [...values.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return left[0] - right[0];
    })
    .map(([value, count]) => `${hex(value, 2)} x${count}`)
    .join(', ');
}

function describeBranchBehavior(meta, successors) {
  if (!meta?.exits || meta.exits.length <= 1 || successors.size !== 1) {
    return null;
  }

  const observedSuccessor = [...successors.keys()][0];
  const observedExit = resolveObservedExit(meta, observedSuccessor);

  if (!observedExit) {
    return `single observed successor ${observedSuccessor}`;
  }

  if (observedExit.type === 'fallthrough') {
    return `conditional branch always falls through to ${observedSuccessor}`;
  }

  return `conditional branch always takes ${observedExit.type ?? 'branch'} to ${observedSuccessor}`;
}

function analyzeLoopCause(loopEntries, uniqueCycleEntries, blockMeta, blockAnalyses, loopStats) {
  const cycleKeySet = new Set(loopEntries.map((entry) => entry.key));
  const candidates = [];

  for (const entry of uniqueCycleEntries) {
    const meta = blockMeta[entry.key];
    const analysis = blockAnalyses.get(entry.key);
    const stats = loopStats.get(entry.key);
    const branch = analysis?.terminator ?? null;
    const topIn = stats ? pickMostFrequentPort(stats.inPorts) : null;
    const successorKey = stats && stats.successors.size === 1 ? [...stats.successors.keys()][0] : null;
    const observedExit = resolveObservedExit(meta, successorKey);

    const targetKey = branch && Number.isInteger(branch.target)
      ? blockKey(branch.target & 0xFFFFFF, observedExit?.targetMode ?? entry.mode)
      : null;
    const cyclesBack = targetKey ? cycleKeySet.has(targetKey) : false;
    const isConditional = branch?.tag === 'jr-conditional' || branch?.tag === 'jp-conditional' || branch?.tag === 'djnz';
    const isUnconditional = branch?.tag === 'jr' || branch?.tag === 'jp' || branch?.tag === 'rst';

    if (topIn && isConditional) {
      candidates.push({
        kind: 'port polling',
        score: topIn[1].count * 100 + (cyclesBack ? 10 : 0),
        address: branch.pc,
        port: topIn[0],
        values: topIn[1].values,
        entry,
        branch,
        observedExit,
      });
    }

    if (branch && isUnconditional && cyclesBack) {
      candidates.push({
        kind: 'unconditional backward jump',
        score: 50,
        address: branch.pc,
        entry,
        branch,
        observedExit,
      });
    }

    if (branch && isConditional && stats?.successors.size === 1) {
      candidates.push({
        kind: 'fixed conditional branch',
        score: 40,
        address: branch.pc,
        entry,
        branch,
        observedExit,
      });
    }
  }

  if (candidates.length === 0) {
    return null;
  }

  candidates.sort((left, right) => right.score - left.score || left.address - right.address);
  return candidates[0];
}

function printSequence(title, entries) {
  console.log(title);
  if (entries.length === 0) {
    console.log('  (none)');
    return;
  }
  for (const entry of entries) {
    console.log(`  step=${String(entry.step).padStart(4)} ${blockLabel(entry)}`);
  }
}

function printSuccessors(successors) {
  if (!successors || successors.size === 0) {
    console.log('  successors: none');
    return;
  }

  const ordered = [...successors.entries()].sort((left, right) => {
    if (right[1] !== left[1]) {
      return right[1] - left[1];
    }
    return left[0].localeCompare(right[0]);
  });
  console.log(`  successors: ${ordered.map(([key, count]) => `${key} x${count}`).join(', ')}`);
}

function printPortSummary(label, ports) {
  if (!ports || ports.size === 0) {
    console.log(`  ${label}: none`);
    return;
  }

  const parts = [...ports.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([port, stats]) => `${hex(port, 4)} [${formatValueCounts(stats.values)}] x${stats.count}`);
  console.log(`  ${label}: ${parts.join('; ')}`);
}

if (!fs.existsSync(ROM_PATH)) {
  throw new Error('ROM.rom is missing.');
}

const regeneratedTranspiledRom = ensureTranspiledRom();
const romBytes = fs.readFileSync(ROM_PATH);

const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
const { decodeInstruction } = await import(pathToFileURL(DECODER_PATH).href);
const { PRELIFTED_BLOCKS } = await import(pathToFileURL(TRANSPILED_PATH).href);

const blocks = PRELIFTED_BLOCKS;
const mem = createMemoryBus(romBytes);
const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(blocks, mem, { peripherals });
const { cpu, compiledBlocks, blockMeta } = executor;

const sequence = [];
const ioEvents = [];
const missingBlocks = [];
let currentStep = -1;
let currentKey = null;
let currentPc = BOOT_ENTRY;
let currentMode = BOOT_MODE;

cpu.onIoRead = (port, value) => {
  ioEvents.push({
    step: currentStep,
    key: currentKey,
    pc: currentPc,
    mode: currentMode,
    dir: 'IN',
    port: normalizePort(port),
    value: normalizeValue(value),
  });
};

cpu.onIoWrite = (port, value) => {
  ioEvents.push({
    step: currentStep,
    key: currentKey,
    pc: currentPc,
    mode: currentMode,
    dir: 'OUT',
    port: normalizePort(port),
    value: normalizeValue(value),
  });
};

let pc = BOOT_ENTRY;
let mode = BOOT_MODE;
let wakeFromHalt = 'nmi';
let termination = 'max_steps';
let error = null;

for (let step = 0; step < MAX_STEPS; step++) {
  cpu.madl = mode === 'adl' ? 1 : 0;
  cpu._currentBlockPc = pc;
  cpu.pc = pc;

  const key = blockKey(pc, mode);
  const fn = compiledBlocks[key];

  currentStep = step;
  currentKey = key;
  currentPc = pc & 0xFFFFFF;
  currentMode = mode;

  if (!fn) {
    missingBlocks.push({ step, pc: pc & 0xFFFFFF, mode, key });
    termination = 'missing_block';
    break;
  }

  const entry = {
    step,
    pc: pc & 0xFFFFFF,
    mode,
    key,
  };
  sequence.push(entry);

  let result;
  try {
    result = fn(cpu);
  } catch (err) {
    termination = 'error';
    error = err;
    break;
  }

  if (result === undefined || result === null) {
    termination = 'no_return';
    break;
  }

  if (result < 0) {
    if (result === -1 && wakeFromHalt) {
      const haltReturnPc = (pc + 1) & 0xFFFFFF;
      cpu.halted = false;

      if (wakeFromHalt === 'nmi') {
        cpu.push(haltReturnPc);
        pc = 0x000066;
        mode = 'adl';
      } else {
        cpu.push(haltReturnPc);
        pc = 0x000038;
        mode = 'adl';
      }

      wakeFromHalt = null;
      continue;
    }

    if (result === -1 && typeof peripherals.tick === 'function') {
      peripherals.tick();

      if (typeof peripherals.hasPendingNMI === 'function' && peripherals.hasPendingNMI()) {
        cpu.halted = false;
        const haltReturnPc = (pc + 1) & 0xFFFFFF;
        cpu.push(haltReturnPc);
        cpu.iff2 = cpu.iff1;
        cpu.iff1 = 0;
        pc = 0x000066;
        mode = 'adl';
        if (typeof peripherals.acknowledgeNMI === 'function') {
          peripherals.acknowledgeNMI();
        }
        continue;
      }

      if (
        typeof peripherals.hasPendingIRQ === 'function' &&
        peripherals.hasPendingIRQ() &&
        cpu.iff1
      ) {
        cpu.halted = false;
        const haltReturnPc = (pc + 1) & 0xFFFFFF;
        cpu.push(haltReturnPc);
        cpu.iff1 = 0;
        cpu.iff2 = 0;
        pc = cpu.im === 2 ? cpu.read16((cpu.i << 8) | 0xFF) : 0x000038;
        mode = 'adl';
        if (typeof peripherals.acknowledgeIRQ === 'function') {
          peripherals.acknowledgeIRQ();
        }
        continue;
      }
    }

    termination = result === -1 ? 'halt' : 'sleep';
    break;
  }

  if (typeof peripherals.tick === 'function') {
    peripherals.tick();

    if (typeof peripherals.hasPendingNMI === 'function' && peripherals.hasPendingNMI()) {
      cpu.push(result);
      cpu.iff2 = cpu.iff1;
      cpu.iff1 = 0;
      pc = 0x000066;
      mode = 'adl';
      if (typeof peripherals.acknowledgeNMI === 'function') {
        peripherals.acknowledgeNMI();
      }
      continue;
    }

    if (
      typeof peripherals.hasPendingIRQ === 'function' &&
      peripherals.hasPendingIRQ() &&
      cpu.iff1
    ) {
      cpu.push(result);
      cpu.iff1 = 0;
      cpu.iff2 = 0;
      pc = cpu.im === 2 ? cpu.read16((cpu.i << 8) | 0xFF) : 0x000038;
      mode = 'adl';
      if (typeof peripherals.acknowledgeIRQ === 'function') {
        peripherals.acknowledgeIRQ();
      }
      continue;
    }
  }

  mode = resolveNextMode(blockMeta[key], result, mode);
  pc = result & 0xFFFFFF;
}

const stableWindow = getStepWindow(sequence, STABLE_START_STEP, STABLE_END_STEP);
const loop = findLoopCycle(sequence, CYCLE_SCAN_START);
const uniqueCycleEntries = loop ? dedupeCycleEntries(loop.cycleEntries) : [];
const blockAnalyses = new Map();
for (const entry of uniqueCycleEntries) {
  blockAnalyses.set(entry.key, disassembleBlock(romBytes, decodeInstruction, entry, DISASM_BYTES));
}
const loopStats = loop ? collectLoopStats(sequence, ioEvents, loop) : new Map();
const cause = loop ? analyzeLoopCause(loop.cycleEntries, uniqueCycleEntries, blockMeta, blockAnalyses, loopStats) : null;

console.log('Phase 353: Boot loop steady-state diagnosis');
console.log('===========================================');
console.log(`Boot entry:           ${hex(BOOT_ENTRY)}:${BOOT_MODE}`);
console.log(`Max block steps:      ${MAX_STEPS}`);
console.log(`Timer interrupt:      false`);
console.log(`PLL delay:            2`);
console.log(`Transpiled ROM:       ${regeneratedTranspiledRom ? 'regenerated this run' : path.basename(TRANSPILED_PATH)}`);
console.log(`Captured blocks:      ${sequence.length}`);
console.log(`Termination:          ${termination}`);
console.log(`Last PC/mode:         ${hex(pc)}:${mode}`);
console.log(`Unique blocks:        ${new Set(sequence.map((entry) => entry.key)).size}`);
console.log(`I/O events captured:  ${ioEvents.length}`);
console.log(`Missing blocks:       ${missingBlocks.length}`);
if (error) {
  console.log(`Error:                ${error?.stack ?? error}`);
}

console.log('');
printSequence(`Full block sequence (${sequence.length} steps)`, sequence);

console.log('');
printSequence(
  `Stable window step ${STABLE_START_STEP}..${Math.min(STABLE_END_STEP, sequence.length - 1)}`,
  stableWindow,
);

console.log('');
console.log('Loop cycle');
console.log('----------');
if (!loop) {
  console.log('No repeating cycle was detected after step 600.');
} else {
  console.log(`Cycle detection start: step ${loop.offset}`);
  console.log(`Cycle period:          ${loop.period} block steps${loop.exact ? '' : ' (best match)'}`);
  console.log(`Tail coverage:         ${loop.repeatedTailLength} steps`);
  console.log(`Distinct blocks:       ${uniqueCycleEntries.length}`);
  console.log(`One cycle:             ${loop.cycleEntries.map((entry) => blockLabel(entry)).join(' -> ')}`);
  console.log(`Distinct list:         ${uniqueCycleEntries.map((entry) => blockLabel(entry)).join(', ')}`);
}

if (loop) {
  console.log('');
  console.log('Per-block diagnostics');
  console.log('---------------------');
  for (const entry of uniqueCycleEntries) {
    const stats = loopStats.get(entry.key);
    const analysis = blockAnalyses.get(entry.key);
    const meta = blockMeta[entry.key];
    const branchBehavior = describeBranchBehavior(meta, stats?.successors ?? new Map());

    console.log(blockLabel(entry));
    console.log(`  visits after cycle start: ${stats?.visits ?? 0}`);
    printSuccessors(stats?.successors ?? new Map());
    if (branchBehavior) {
      console.log(`  branch behavior: ${branchBehavior}`);
    }
    printPortSummary('I/O reads', stats?.inPorts ?? new Map());
    printPortSummary('I/O writes', stats?.outPorts ?? new Map());
    console.log(`  raw first ${DISASM_BYTES} bytes: ${analysis?.bytes ?? '(none)'}`);
    if (!analysis || analysis.rows.length === 0) {
      console.log('  disassembly: none');
    } else {
      console.log('  disassembly:');
      for (const row of analysis.rows) {
        const branchNote = Number.isInteger(row.target) && row.target < row.pc ? '  [backward edge]' : '';
        const ioNote = row.tag === 'in-reg' || row.tag === 'in-imm' || row.tag === 'in0'
          ? '  [port read]'
          : '';
        console.log(`    ${hex(row.pc)}  ${row.bytes.padEnd(18)}  ${row.text}${branchNote}${ioNote}`);
      }
    }
  }
}

console.log('');
console.log('Conclusion');
console.log('----------');
if (!loop) {
  console.log('The probe did not find an exact repeating loop cycle after step 600.');
} else {
  const blockList = uniqueCycleEntries.map((entry) => blockLabel(entry)).join(', ');
  console.log(`The boot loop consists of ${uniqueCycleEntries.length} blocks repeating every ${loop.period} steps.`);
  console.log(`The blocks are: [${blockList}].`);

  if (cause?.kind === 'port polling') {
    const valueText = cause.values ? `[${formatValueCounts(cause.values)}]` : 'n/a';
    console.log(
      `The loop is caused by port polling on ${hex(cause.port, 4)} with a repeating branch at ${hex(cause.address)}. Observed values: ${valueText}.`,
    );
  } else if (cause?.kind === 'unconditional backward jump') {
    console.log(`The loop is caused by an unconditional backward jump at ${hex(cause.address)}.`);
  } else if (cause?.kind === 'fixed conditional branch') {
    console.log(`The loop is caused by a conditional branch that always resolves the same way at ${hex(cause.address)}.`);
  } else {
    console.log('The loop cause could not be classified beyond the repeating block cycle.');
  }
}
