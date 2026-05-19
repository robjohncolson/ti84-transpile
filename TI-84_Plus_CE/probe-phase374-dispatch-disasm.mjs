#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MODE = 'adl';
const MEM_SIZE = 0x1000000;
const DISASM_INSTRUCTION_LIMIT = 8;
const TRANSITION_PRINT_LIMIT = 100;

const PHASE1_ENTRY = 0x000000;
const PHASE2_ENTRY = 0x08C331;
const PHASE3_ENTRY = 0x0802B2;
const EVENT_LOOP_ENTRY = 0x003A73;

const STACK_RESET_TOP = 0xD1A87E;
const BOOT_RESET_SP = STACK_RESET_TOP - 3;
const EVENT_RESET_SP = STACK_RESET_TOP - 12;

const PHASE1_OPTS = { maxSteps: 20000, maxLoopIterations: 32 };
const PHASE2_OPTS = { maxSteps: 100000, maxLoopIterations: 10000 };
const PHASE3_OPTS = { maxSteps: 100, maxLoopIterations: 32 };
const EVENT_OPTS = { maxSteps: 200000, maxLoopIterations: 100000 };

const KEY_STATUS_ADDR = 0xD00080;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_AVAILABLE_MASK = 0x08;
const INJECTED_SCAN_CODE = 0x09;

const DISPATCH_PATH = 0x003A7D;
const HALT_POINT = 0x001937;
const DISPATCH_TARGETS = [
  0x001713,
  0x001933,
  0x001853,
  0x000721,
];

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
  'pc',
  'stepCount',
];

const DISPATCH_KEY = makeKey(DISPATCH_PATH, MODE);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function count(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function bytesToHex(buffer, start, length) {
  const end = Math.min(buffer.length, start + Math.max(length, 0));
  return Array.from(
    buffer.subarray(start, end),
    (byte) => (byte & 0xFF).toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function formatSigned(value) {
  const normalized = Number(value ?? 0);
  const abs = Math.abs(normalized);
  return `${normalized >= 0 ? '+' : '-'}0x${abs.toString(16).toUpperCase()}`;
}

function formatIndexedOperand(indexRegister, displacement) {
  return `(${indexRegister}${formatSigned(displacement)})`;
}

function withPrefix(inst, text) {
  return inst?.modePrefix ? `${inst.modePrefix} ${text}` : text;
}

function makeKey(addr, mode = MODE) {
  return `${(addr & 0xFFFFFF).toString(16).padStart(6, '0')}:${mode}`;
}

function parseKey(blockKey) {
  const [addrHex, mode] = blockKey.split(':');
  return {
    addr: Number.parseInt(addrHex, 16) & 0xFFFFFF,
    mode,
  };
}

function formatBlockRef(blockKey) {
  const { addr, mode } = parseKey(blockKey);
  return mode === MODE ? hex(addr) : `${hex(addr)}:${mode}`;
}

function normalizeBlocks(raw) {
  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.filter((entry) => entry?.id).map((entry) => [entry.id, entry]));
  }
  return raw ?? {};
}

function createMemoryImage(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(mem.length, romBytes.length)));
  return mem;
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

function restoreLcdMmio(executor, snapshot) {
  if (!snapshot || !executor?.lcdMmio) {
    return;
  }
  executor.lcdMmio.upbase = snapshot.upbase;
  executor.lcdMmio.control = snapshot.control;
}

function preparePhase(cpu, mem, sp, stackFillBytes) {
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = KEY_STATUS_ADDR;
  cpu.sp = sp;
  mem.fill(0xFF, sp, sp + stackFillBytes);
}

function prepareEventLoop(cpu, executor, mem, bootState) {
  restoreCpu(cpu, bootState.cpuSnapshot);
  restoreLcdMmio(executor, bootState.lcdSnapshot);
  preparePhase(cpu, mem, EVENT_RESET_SP, 12);
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu._iy = KEY_STATUS_ADDR;
}

function safeDecode(memory, pc, mode = MODE) {
  try {
    const decoded = decodeInstruction(memory, pc, mode);
    if (!decoded || !Number.isInteger(decoded.length) || decoded.length <= 0) {
      throw new Error('decoder returned invalid length');
    }
    return decoded;
  } catch (error) {
    return {
      tag: 'db',
      value: memory[pc] ?? 0,
      length: 1,
      decodeError: error instanceof Error ? error.message : String(error),
      mode,
    };
  }
}

function fallbackOperands(inst) {
  const ignored = new Set([
    'pc',
    'length',
    'nextPc',
    'mode',
    'modePrefix',
    'terminates',
    'fallthrough',
    'decodeError',
    'tag',
  ]);

  return Object.entries(inst ?? {})
    .filter(([key, value]) => !ignored.has(key) && value !== undefined && value !== null)
    .map(([key, value]) => {
      if (typeof value === 'number') {
        if (key === 'bit') return `${key}=${value}`;
        if (key === 'displacement') return `${key}=${formatSigned(value)}`;
        return `${key}=${hex(value, value > 0xFF ? 6 : 2)}`;
      }
      return `${key}=${String(value)}`;
    })
    .join(' ');
}

function renderInstruction(inst) {
  switch (inst?.tag) {
    case 'db':
      return { mnemonic: 'db', operands: hexByte(inst.value) };
    case 'nop':
    case 'halt':
    case 'slp':
    case 'di':
    case 'ei':
    case 'ret':
    case 'reti':
    case 'retn':
    case 'rlca':
    case 'rrca':
    case 'rla':
    case 'rra':
    case 'daa':
    case 'cpl':
    case 'scf':
    case 'ccf':
    case 'neg':
    case 'rrd':
    case 'rld':
    case 'ldi':
    case 'ldd':
    case 'ldir':
    case 'lddr':
    case 'cpi':
    case 'cpd':
    case 'cpir':
    case 'cpdr':
    case 'ini':
    case 'ind':
    case 'inir':
    case 'indr':
    case 'outi':
    case 'outd':
    case 'otir':
    case 'otdr':
    case 'otimr':
    case 'stmix':
    case 'rsmix':
    case 'exx':
      return { mnemonic: inst.tag, operands: '' };

    case 'ret-conditional':
      return { mnemonic: 'ret', operands: inst.condition };
    case 'jr':
      return { mnemonic: 'jr', operands: hex(inst.target) };
    case 'jr-conditional':
      return { mnemonic: 'jr', operands: `${inst.condition}, ${hex(inst.target)}` };
    case 'djnz':
      return { mnemonic: 'djnz', operands: hex(inst.target) };
    case 'jp':
      return { mnemonic: 'jp', operands: hex(inst.target) };
    case 'jp-conditional':
      return { mnemonic: 'jp', operands: `${inst.condition}, ${hex(inst.target)}` };
    case 'jp-indirect':
      return { mnemonic: 'jp', operands: `(${inst.indirectRegister})` };
    case 'call':
      return { mnemonic: 'call', operands: hex(inst.target) };
    case 'call-conditional':
      return { mnemonic: 'call', operands: `${inst.condition}, ${hex(inst.target)}` };
    case 'rst':
      return { mnemonic: 'rst', operands: hexByte(inst.target) };

    case 'push':
      return { mnemonic: 'push', operands: inst.pair };
    case 'pop':
      return { mnemonic: 'pop', operands: inst.pair };

    case 'ld-pair-imm':
      return { mnemonic: 'ld', operands: `${inst.pair}, ${hex(inst.value)}` };
    case 'ld-reg-imm':
      return { mnemonic: 'ld', operands: `${inst.dest}, ${hexByte(inst.value)}` };
    case 'ld-reg-reg':
      return { mnemonic: 'ld', operands: `${inst.dest}, ${inst.src}` };
    case 'ld-reg-ind':
      return { mnemonic: 'ld', operands: `${inst.dest}, (${inst.src})` };
    case 'ld-ind-reg':
      return { mnemonic: 'ld', operands: `(${inst.dest}), ${inst.src}` };
    case 'ld-ind-imm':
      return { mnemonic: 'ld', operands: `(hl), ${hexByte(inst.value)}` };
    case 'ld-reg-mem':
      return { mnemonic: 'ld', operands: `${inst.dest}, (${hex(inst.addr)})` };
    case 'ld-mem-reg':
      return { mnemonic: 'ld', operands: `(${hex(inst.addr)}), ${inst.src}` };
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return { mnemonic: 'ld', operands: `(${hex(inst.addr)}), ${inst.pair}` };
      }
      return { mnemonic: 'ld', operands: `${inst.pair}, (${hex(inst.addr)})` };
    case 'ld-mem-pair':
      return { mnemonic: 'ld', operands: `(${hex(inst.addr)}), ${inst.pair}` };
    case 'ld-pair-ind':
      return { mnemonic: 'ld', operands: `${inst.pair}, (${inst.src})` };
    case 'ld-ind-pair':
      return { mnemonic: 'ld', operands: `(${inst.dest}), ${inst.pair}` };
    case 'ld-sp-hl':
      return { mnemonic: 'ld', operands: 'sp, hl' };
    case 'ld-sp-pair':
      return { mnemonic: 'ld', operands: `sp, ${inst.pair}` };
    case 'ld-pair-indexed':
      return { mnemonic: 'ld', operands: `${inst.pair}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'ld-indexed-pair':
      return { mnemonic: 'ld', operands: `${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${inst.pair}` };
    case 'ld-reg-ixd':
      return { mnemonic: 'ld', operands: `${inst.dest}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'ld-ixd-reg':
      return { mnemonic: 'ld', operands: `${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${inst.src}` };
    case 'ld-ixd-imm':
      return { mnemonic: 'ld', operands: `${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}` };
    case 'ld-ixiy-indexed':
      return { mnemonic: 'ld', operands: `${inst.dest}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'ld-indexed-ixiy':
      return { mnemonic: 'ld', operands: `${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${inst.src}` };
    case 'ld-special':
      return { mnemonic: 'ld', operands: `${inst.dest}, ${inst.src}` };
    case 'ld-mb-a':
      return { mnemonic: 'ld', operands: 'mb, a' };
    case 'ld-a-mb':
      return { mnemonic: 'ld', operands: 'a, mb' };

    case 'inc-pair':
      return { mnemonic: 'inc', operands: inst.pair };
    case 'dec-pair':
      return { mnemonic: 'dec', operands: inst.pair };
    case 'inc-reg':
      return { mnemonic: 'inc', operands: inst.reg };
    case 'dec-reg':
      return { mnemonic: 'dec', operands: inst.reg };
    case 'inc-ixd':
      return { mnemonic: 'inc', operands: formatIndexedOperand(inst.indexRegister, inst.displacement) };
    case 'dec-ixd':
      return { mnemonic: 'dec', operands: formatIndexedOperand(inst.indexRegister, inst.displacement) };

    case 'add-pair':
      return { mnemonic: 'add', operands: `${inst.dest}, ${inst.src}` };
    case 'adc-pair':
      return { mnemonic: 'adc', operands: `hl, ${inst.src}` };
    case 'sbc-pair':
      return { mnemonic: 'sbc', operands: `hl, ${inst.src}` };
    case 'alu-reg':
      return { mnemonic: inst.op, operands: inst.src };
    case 'alu-imm':
      return { mnemonic: inst.op, operands: hexByte(inst.value) };
    case 'alu-ixd':
      return { mnemonic: inst.op, operands: formatIndexedOperand(inst.indexRegister, inst.displacement) };

    case 'bit-test':
      return { mnemonic: 'bit', operands: `${inst.bit}, ${inst.reg}` };
    case 'bit-test-ind':
      return { mnemonic: 'bit', operands: `${inst.bit}, (${inst.indirectRegister})` };
    case 'bit-set':
      return { mnemonic: 'set', operands: `${inst.bit}, ${inst.reg}` };
    case 'bit-set-ind':
      return { mnemonic: 'set', operands: `${inst.bit}, (${inst.indirectRegister})` };
    case 'bit-res':
      return { mnemonic: 'res', operands: `${inst.bit}, ${inst.reg}` };
    case 'bit-res-ind':
      return { mnemonic: 'res', operands: `${inst.bit}, (${inst.indirectRegister})` };
    case 'indexed-cb-bit':
      return { mnemonic: 'bit', operands: `${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'indexed-cb-set':
      return { mnemonic: 'set', operands: `${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'indexed-cb-res':
      return { mnemonic: 'res', operands: `${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'rotate-reg':
      return { mnemonic: inst.op, operands: inst.reg };
    case 'rotate-ind':
      return { mnemonic: inst.op, operands: `(${inst.indirectRegister})` };
    case 'indexed-cb-rotate':
      return {
        mnemonic: inst.operation ?? inst.op ?? 'rotate',
        operands: formatIndexedOperand(inst.indexRegister, inst.displacement),
      };

    case 'in-reg':
      return { mnemonic: 'in', operands: `${inst.reg}, (c)` };
    case 'out-reg':
      return { mnemonic: 'out', operands: `(c), ${inst.reg}` };
    case 'in-imm':
      return { mnemonic: 'in', operands: `a, (${hexByte(inst.port)})` };
    case 'out-imm':
      return { mnemonic: 'out', operands: `(${hexByte(inst.port)}), a` };
    case 'in0':
      return { mnemonic: 'in0', operands: `${inst.reg}, (${hexByte(inst.port)})` };
    case 'out0':
      return { mnemonic: 'out0', operands: `(${hexByte(inst.port)}), ${inst.reg}` };

    case 'ex-af':
      return { mnemonic: 'ex', operands: "af, af'" };
    case 'ex-de-hl':
      return { mnemonic: 'ex', operands: 'de, hl' };
    case 'ex-sp-hl':
      return { mnemonic: 'ex', operands: '(sp), hl' };
    case 'ex-sp-pair':
      return { mnemonic: 'ex', operands: `(sp), ${inst.pair}` };

    case 'im':
      return { mnemonic: 'im', operands: String(inst.value) };
    case 'mlt':
      return { mnemonic: 'mlt', operands: inst.reg };
    case 'tst-reg':
      return { mnemonic: 'tst', operands: `a, ${inst.reg}` };
    case 'tst-ind':
      return { mnemonic: 'tst', operands: 'a, (hl)' };
    case 'tst-imm':
      return { mnemonic: 'tst', operands: `a, ${hexByte(inst.value)}` };
    case 'tstio':
      return { mnemonic: 'tstio', operands: hexByte(inst.value) };
    case 'lea':
      return { mnemonic: 'lea', operands: `${inst.dest}, ${formatIndexedOperand(inst.base, inst.displacement)}` };
    case 'pea':
      return { mnemonic: 'pea', operands: `${inst.base}${formatSigned(inst.displacement)}` };

    default:
      return {
        mnemonic: inst?.tag ?? 'unknown',
        operands: fallbackOperands(inst),
      };
  }
}

function formatInstruction(inst) {
  const rendered = renderInstruction(inst);
  const text = rendered.operands ? `${rendered.mnemonic} ${rendered.operands}` : rendered.mnemonic;
  return withPrefix(inst, text);
}

function createTrace() {
  return {
    dispatchReached: false,
    firstDispatchStep: null,
    uniqueBlocks: new Set(),
    postDispatchBlocks: new Set(),
    postDispatchSeen: new Set(),
    postDispatchUniqueOrder: [],
    postDispatchVisits: [],
    postDispatchTransitions: [],
    callGraph: new Map(),
  };
}

function resolveNextMode(executor, blockKey, returnedPc, currentMode) {
  const meta = executor.blockMeta?.[blockKey];
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

function recordCallGraphEdge(trace, sourceKey, targetLabel) {
  if (!trace.callGraph.has(sourceKey)) {
    trace.callGraph.set(sourceKey, new Set());
  }
  trace.callGraph.get(sourceKey).add(targetLabel);
}

function installTransitionHooks(executor, trace) {
  for (const [blockKey, original] of Object.entries(executor.compiledBlocks)) {
    executor.compiledBlocks[blockKey] = function wrappedBlock(cpu) {
      const result = original(cpu);

      if (!trace.dispatchReached) {
        return result;
      }

      const { mode } = parseKey(blockKey);
      let targetKey = null;
      let terminal = null;

      if (typeof result === 'number' && result >= 0) {
        const nextMode = resolveNextMode(executor, blockKey, result, mode);
        targetKey = makeKey(result, nextMode);
        recordCallGraphEdge(trace, blockKey, targetKey);
      } else if (result === -1) {
        terminal = 'HALT';
        recordCallGraphEdge(trace, blockKey, 'HALT');
      } else if (result === -2) {
        terminal = 'SLEEP';
        recordCallGraphEdge(trace, blockKey, 'SLEEP');
      } else {
        terminal = 'TERMINAL';
        recordCallGraphEdge(trace, blockKey, 'TERMINAL');
      }

      trace.postDispatchTransitions.push({
        step: cpu.stepCount,
        from: blockKey,
        to: targetKey,
        terminal,
      });

      return result;
    };
  }
}

function runBootPhases(blocks, romBytes) {
  const mem = createMemoryImage(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;

  const phase1 = executor.runFrom(PHASE1_ENTRY, 'z80', PHASE1_OPTS);

  preparePhase(cpu, mem, BOOT_RESET_SP, 3);
  const phase2 = executor.runFrom(PHASE2_ENTRY, MODE, PHASE2_OPTS);

  cpu.mbase = 0xD0;
  cpu._hl = 0;
  preparePhase(cpu, mem, BOOT_RESET_SP, 3);
  const phase3 = executor.runFrom(PHASE3_ENTRY, MODE, PHASE3_OPTS);

  return {
    phaseResults: [
      { label: 'Phase 1', result: phase1 },
      { label: 'Phase 2', result: phase2 },
      { label: 'Phase 3', result: phase3 },
    ],
    memSnapshot: Buffer.from(mem),
    cpuSnapshot: snapshotCpu(cpu),
    lcdSnapshot: executor.lcdMmio
      ? { upbase: executor.lcdMmio.upbase, control: executor.lcdMmio.control }
      : null,
  };
}

function runDispatchTrace(blocks, bootState) {
  const mem = Uint8Array.from(bootState.memSnapshot);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;
  const trace = createTrace();

  prepareEventLoop(cpu, executor, mem, bootState);
  mem[KEY_SCAN_CODE_ADDR] = INJECTED_SCAN_CODE;
  mem[KEY_STATUS_ADDR] |= KEY_AVAILABLE_MASK;

  installTransitionHooks(executor, trace);

  const result = executor.runFrom(EVENT_LOOP_ENTRY, MODE, {
    ...EVENT_OPTS,
    onBlock(pc, mode, _meta, step) {
      const blockKey = makeKey(pc, mode);
      trace.uniqueBlocks.add(blockKey);

      if (blockKey === DISPATCH_KEY && !trace.dispatchReached) {
        trace.dispatchReached = true;
        trace.firstDispatchStep = step;
      }

      if (!trace.dispatchReached) {
        return;
      }

      trace.postDispatchBlocks.add(blockKey);
      trace.postDispatchVisits.push(blockKey);
      if (!trace.postDispatchSeen.has(blockKey)) {
        trace.postDispatchSeen.add(blockKey);
        trace.postDispatchUniqueOrder.push(blockKey);
      }
    },
  });

  return { mem, result, trace };
}

function disassembleBlock(memory, blockKey, limit = DISASM_INSTRUCTION_LIMIT) {
  const { addr, mode } = parseKey(blockKey);
  const rows = [];
  let pc = addr;

  for (let index = 0; index < limit && pc < memory.length; index += 1) {
    const inst = safeDecode(memory, pc, mode);
    const length = Math.max(inst.length ?? 1, 1);
    rows.push({
      pc,
      bytes: bytesToHex(memory, pc, length),
      text: formatInstruction(inst),
      decodeError: inst.decodeError ?? null,
    });
    pc += length;
  }

  return rows;
}

function buildPathSequence(transitions) {
  if (!transitions || transitions.length === 0) {
    return [];
  }

  const sequence = [transitions[0].from];
  for (const transition of transitions) {
    if (transition.to) {
      sequence.push(transition.to);
    }
  }
  return sequence;
}

function formatTerminalSuffix(transitions) {
  if (!transitions || transitions.length === 0) {
    return '';
  }
  const last = transitions[transitions.length - 1];
  return last.terminal ? ` (${last.terminal})` : '';
}

function printBootSummary(bootState) {
  console.log('=== BOOT SUMMARY ===');
  for (const phase of bootState.phaseResults) {
    console.log(
      `${phase.label}: steps=${count(phase.result.steps)} `
      + `termination=${phase.result.termination} lastPc=${hex(phase.result.lastPc)}`,
    );
  }
  console.log('');
}

function printDispatchRunSummary(traceRun) {
  const postDispatchTargetKeys = new Set(traceRun.trace.postDispatchBlocks);

  console.log('=== DISPATCH RUN ===');
  console.log(
    `Event loop result: steps=${count(traceRun.result.steps)} `
    + `termination=${traceRun.result.termination} lastPc=${hex(traceRun.result.lastPc)} `
    + `loopsForced=${count(traceRun.result.loopsForced)}`,
  );
  console.log(
    `Dispatch path reached: ${traceRun.trace.dispatchReached ? 'yes' : 'no'}`
    + (traceRun.trace.firstDispatchStep === null ? '' : ` at step ${count(traceRun.trace.firstDispatchStep)}`),
  );
  console.log(`Unique blocks visited overall: ${count(traceRun.trace.uniqueBlocks.size)}`);
  console.log(`Unique post-dispatch blocks: ${count(traceRun.trace.postDispatchBlocks.size)}`);
  console.log(`Post-dispatch executions: ${count(traceRun.trace.postDispatchVisits.length)}`);
  console.log(
    `Known dispatch targets reached: ${DISPATCH_TARGETS
      .map((addr) => `${hex(addr)}=${postDispatchTargetKeys.has(makeKey(addr, MODE)) ? 'yes' : 'no'}`)
      .join(', ')}`,
  );
  console.log('');
}

function printTransitionSequence(trace) {
  const firstTransitions = trace.postDispatchTransitions.slice(0, TRANSITION_PRINT_LIMIT);
  const sequence = buildPathSequence(firstTransitions);
  const summaryParts = sequence.map(formatBlockRef);

  if (firstTransitions.length > 0 && firstTransitions[firstTransitions.length - 1].terminal) {
    summaryParts[summaryParts.length - 1] += ` (${firstTransitions[firstTransitions.length - 1].terminal})`;
  }

  console.log(`=== POST-DISPATCH TRANSITIONS (first ${TRANSITION_PRINT_LIMIT}) ===`);
  if (summaryParts.length > 0) {
    console.log(summaryParts.join(' -> '));
  } else {
    console.log('No post-dispatch transitions recorded.');
  }
  console.log('');

  for (let index = 0; index < firstTransitions.length; index += 1) {
    const transition = firstTransitions[index];
    const target = transition.to ? formatBlockRef(transition.to) : transition.terminal;
    console.log(
      `${String(index + 1).padStart(3, '0')}. `
      + `${formatBlockRef(transition.from)} -> ${target} `
      + `(step ${count(transition.step)})`,
    );
  }
  console.log('');
}

function printBlockDisassemblies(memory, trace) {
  console.log('=== POST-DISPATCH BLOCK DISASSEMBLY ===');

  for (const blockKey of trace.postDispatchUniqueOrder) {
    const rows = disassembleBlock(memory, blockKey);
    const targets = [...(trace.callGraph.get(blockKey) ?? [])]
      .map((target) => (target.includes(':') ? formatBlockRef(target) : target))
      .join(', ');

    console.log(`${formatBlockRef(blockKey)}${targets ? `  ->  ${targets}` : ''}`);
    for (const row of rows) {
      const note = row.decodeError ? ` [decode error: ${row.decodeError}]` : '';
      console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}${note}`);
    }
    console.log('');
  }
}

function printDispatchPathSummary(trace) {
  const sequence = buildPathSequence(trace.postDispatchTransitions);
  const summaryParts = sequence.map(formatBlockRef);
  const terminalSuffix = formatTerminalSuffix(trace.postDispatchTransitions);

  if (summaryParts.length === 0) {
    console.log('dispatch path: not reached');
    return;
  }

  if (terminalSuffix) {
    summaryParts[summaryParts.length - 1] += terminalSuffix;
  }

  console.log(`dispatch path: ${summaryParts.join(' -> ')}`);
}

if (!fs.existsSync(ROM_PATH)) {
  throw new Error(`ROM not found: ${ROM_PATH}`);
}

if (!fs.existsSync(TRANSPILED_PATH)) {
  throw new Error(`Transpiled ROM not found: ${TRANSPILED_PATH}`);
}

const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const blocks = normalizeBlocks(
  romModule.PRELIFTED_BLOCKS
  ?? romModule.default?.PRELIFTED_BLOCKS
  ?? romModule.default
  ?? romModule,
);

if (!blocks || Object.keys(blocks).length === 0) {
  throw new Error('Unable to load PRELIFTED_BLOCKS from ROM.transpiled.js');
}

const bootState = runBootPhases(blocks, romBytes);
const traceRun = runDispatchTrace(blocks, bootState);

printBootSummary(bootState);
printDispatchRunSummary(traceRun);
printTransitionSequence(traceRun.trace);
printBlockDisassemblies(traceRun.mem, traceRun.trace);
printDispatchPathSummary(traceRun.trace);

if (traceRun.result.lastPc !== HALT_POINT) {
  console.log('');
  console.log(`warning: expected HALT at ${hex(HALT_POINT)}, observed ${hex(traceRun.result.lastPc)}`);
}
