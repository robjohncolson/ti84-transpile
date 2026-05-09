#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const BOOT_PC = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_STEPS = 50000;
const BOOT_LOOP_LIMIT = 10000;

const RUN_STEPS = 500;
const RUN_LOOP_LIMIT = 512;

const STACK_TOP = 0xD1A87E;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;
const MBASE = 0xD0;
const RETURN_SENTINEL = 0x7FFFFE;

const RANGE_A = { start: 0x082BD0, end: 0x082C20 };
const RANGE_B = { start: 0x084700, end: 0x084730 };
const RANGE_BACKTRACK = 0x20;

const TARGET_HELPER = 0x082BE2;
const TARGET_LOOP = 0x084711;
const TARGET_LOOKUP = 0x0846EA;
const TARGET_D0259A_LOAD = 0x0846FF;
const TARGET_SUCCESS_CALL = 0x04C885;

const D005F8 = 0xD005F8;
const D005F9 = 0xD005F9;
const D005FA = 0xD005FA;
const D005FB = 0xD005FB;
const D02590 = 0xD02590;
const D0259A = 0xD0259A;
const D0259D = 0xD0259D;
const D3F_START = 0xD3F000;
const D3F_END = 0xD3FFFF;

const EMPTY_PTR = 0xD3FFFF;
const ENTRY_START = 0xD3FFF6;
const ENTRY_END = 0xD3FFFE;
const ENTRY_BYTES = [
  0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99,
];

const WATCH_RANGES = [
  { label: 'D0259A', start: D0259A, end: D0259A + 2 },
  { label: 'D005F8-D005FB', start: D005F8, end: D005FB },
  { label: 'D3Fxxx', start: D3F_START, end: D3F_END },
];

const LOOP_CLUSTER = new Set([
  TARGET_HELPER,
  TARGET_LOOP,
  0x084716,
  0x08471B,
  0x084723,
  0x08472C,
  0x084735,
  0x08473D,
  0x084748,
  0x084751,
]);

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function formatBytes(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
}

function read24(mem, addr) {
  const base = addr & MEM_MASK;
  return (
    (mem[base] ?? 0)
    | ((mem[(base + 1) & MEM_MASK] ?? 0) << 8)
    | ((mem[(base + 2) & MEM_MASK] ?? 0) << 16)
  ) >>> 0;
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null };
  }

  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase276-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) {
    return;
  }
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

async function loadBlocks() {
  const assets = ensureTranspiledModule();
  try {
    const romModule = await import(pathToFileURL(assets.modulePath).href);
    const rawBlocks =
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      romModule;
    const blocks = normalizeBlocks(rawBlocks);
    if (!blocks || typeof blocks !== 'object' || Object.keys(blocks).length === 0) {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS from transpiled ROM module.');
    }
    return { blocks, assets };
  } catch (error) {
    cleanupTranspiledModule(assets);
    throw error;
  }
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_SNAPSHOT_FIELDS) {
    cpu[field] = snapshot[field];
  }
}

function snapshotRuntime(cpu, mem) {
  return {
    cpu: snapshotCpu(cpu),
    memory: new Uint8Array(mem),
  };
}

function restoreRuntime(cpu, mem, snapshot) {
  mem.set(snapshot.memory);
  restoreCpu(cpu, snapshot.cpu);
}

function reg8(name) {
  return name === '(hl)' ? '(HL)' : String(name).toUpperCase();
}

function reg16(name) {
  return String(name).toUpperCase();
}

function indirect(name) {
  return `(${reg16(name)})`;
}

function withModePrefix(inst, text) {
  return inst.modePrefix ? `${inst.modePrefix} ${text}` : text;
}

function fallbackMnemonic(inst) {
  const ignored = new Set([
    'pc', 'length', 'nextPc', 'mode', 'modePrefix', 'terminates', 'fallthrough', 'kind', 'nextMode',
  ]);
  const parts = [];
  for (const [key, value] of Object.entries(inst)) {
    if (ignored.has(key) || value === undefined || value === null || key === 'tag') {
      continue;
    }
    parts.push(typeof value === 'number' ? `${key}=${hex(value)}` : `${key}=${value}`);
  }
  return withModePrefix(inst, parts.length > 0 ? `${inst.tag} ${parts.join(', ')}` : inst.tag);
}

function formatMnemonic(inst) {
  switch (inst.tag) {
    case 'add-pair':
      return withModePrefix(inst, `add ${reg16(inst.dest)}, ${reg16(inst.src)}`);
    case 'alu-imm':
      return withModePrefix(inst, `${String(inst.op).toUpperCase()} ${hexByte(inst.value)}`);
    case 'alu-reg':
      return withModePrefix(inst, `${String(inst.op).toUpperCase()} ${reg8(inst.src)}`);
    case 'call':
      return withModePrefix(inst, `CALL ${hex(inst.target)}`);
    case 'call-conditional':
      return withModePrefix(inst, `CALL ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`);
    case 'dec-pair':
      return withModePrefix(inst, `DEC ${reg16(inst.pair)}`);
    case 'inc-pair':
      return withModePrefix(inst, `INC ${reg16(inst.pair)}`);
    case 'jp':
      return withModePrefix(inst, `JP ${hex(inst.target)}`);
    case 'jp-conditional':
      return withModePrefix(inst, `JP ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`);
    case 'jr':
      return withModePrefix(inst, `JR ${hex(inst.target)}`);
    case 'jr-conditional':
      return withModePrefix(inst, `JR ${String(inst.condition).toUpperCase()}, ${hex(inst.target)}`);
    case 'djnz':
      return withModePrefix(inst, `DJNZ ${hex(inst.target)}`);
    case 'ld-pair-imm':
      return withModePrefix(inst, `LD ${reg16(inst.pair)}, ${hex(inst.value)}`);
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return withModePrefix(inst, `LD (${hex(inst.addr)}), ${reg16(inst.pair)}`);
      }
      return withModePrefix(inst, `LD ${reg16(inst.pair)}, (${hex(inst.addr)})`);
    case 'ld-reg-ind':
      return withModePrefix(inst, `LD ${reg8(inst.dest)}, ${indirect(inst.src)}`);
    case 'ld-reg-mem':
      return withModePrefix(inst, `LD ${reg8(inst.dest)}, (${hex(inst.addr)})`);
    case 'ld-reg-reg':
      return withModePrefix(inst, `LD ${reg8(inst.dest)}, ${reg8(inst.src)}`);
    case 'ld-mem-pair':
      return withModePrefix(inst, `LD (${hex(inst.addr)}), ${reg16(inst.pair)}`);
    case 'ld-mem-reg':
      return withModePrefix(inst, `LD (${hex(inst.addr)}), ${reg8(inst.src)}`);
    case 'pop':
      return withModePrefix(inst, `POP ${reg16(inst.pair)}`);
    case 'push':
      return withModePrefix(inst, `PUSH ${reg16(inst.pair)}`);
    case 'ret':
      return withModePrefix(inst, 'RET');
    case 'ret-conditional':
      return withModePrefix(inst, `RET ${String(inst.condition).toUpperCase()}`);
    case 'sbc-pair':
      return withModePrefix(inst, `SBC HL, ${reg16(inst.src)}`);
    default:
      return fallbackMnemonic(inst);
  }
}

function safeDecode(rom, pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch {
    return null;
  }
}

function decodeAlignedRange(rom, start, end, backtrack = RANGE_BACKTRACK) {
  let best = null;
  const minStart = Math.max(0, start - backtrack);

  for (let candidate = minStart; candidate <= start; candidate += 1) {
    const instructions = [];
    let pc = candidate;
    let valid = true;
    let overlapsStart = false;

    while (pc <= end) {
      const inst = safeDecode(rom, pc);
      if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
        valid = false;
        break;
      }
      instructions.push({
        ...inst,
        bytes: rom.subarray(pc, pc + inst.length),
      });
      if (pc <= start && start < (pc + inst.length)) {
        overlapsStart = true;
      }
      pc += inst.length;
      if (instructions.length > 128) {
        valid = false;
        break;
      }
    }

    if (!valid || !overlapsStart || instructions.length === 0) {
      continue;
    }

    const firstPc = instructions[0].pc;
    const instructionsInRange = instructions.filter((inst) => inst.pc >= start && inst.pc < end).length;
    const overlapPenalty = start - firstPc;
    const score = (instructionsInRange * 1000) - overlapPenalty;

    if (!best || score > best.score) {
      best = { start: candidate, instructions, score };
    }
  }

  return best;
}

function instructionNotes(inst) {
  const notes = [];
  if (inst.addr === D0259A) {
    notes.push('refs D0259A');
  }
  if (inst.value === EMPTY_PTR) {
    notes.push('loads D3FFFF');
  }
  if (inst.tag === 'call' && inst.target === TARGET_LOOKUP) {
    notes.push('calls 0846EA');
  }
  if (inst.tag === 'call' && inst.target === TARGET_HELPER) {
    notes.push('calls 082BE2');
  }
  if ((inst.tag === 'jr' || inst.tag === 'jr-conditional' || inst.tag === 'jp' || inst.tag === 'jp-conditional' || inst.tag === 'djnz')
    && Number.isInteger(inst.target) && inst.target < inst.pc) {
    notes.push('backward loop edge');
  }
  if ((inst.tag === 'alu-imm' || inst.tag === 'alu-reg') && String(inst.op).toLowerCase() === 'cp') {
    notes.push('comparison');
  }
  if (inst.tag === 'ret-conditional') {
    notes.push('conditional exit');
  }
  return notes;
}

function printStaticRange(rom, range) {
  const window = decodeAlignedRange(rom, range.start, range.end);
  console.log(`=== Static Disassembly ${hex(range.start)}..${hex(range.end)} ===`);
  if (!window) {
    console.log('No aligned ADL decode found for this range.');
    console.log('');
    return;
  }

  const firstPc = window.instructions[0].pc;
  console.log(`Aligned decode starts at ${hex(firstPc)} to avoid mid-instruction drift.`);
  for (const inst of window.instructions) {
    const overlaps = inst.pc < range.end && inst.nextPc > range.start;
    if (!overlaps) {
      continue;
    }
    const marker = inst.pc < range.start ? '>' : ' ';
    const notes = instructionNotes(inst);
    const suffix = notes.length > 0 ? `  ; ${notes.join(', ')}` : '';
    console.log(
      `${marker} ${hex(inst.pc)}: ${formatBytes(inst.bytes).padEnd(15)} ${formatMnemonic(inst)}${suffix}`,
    );
  }
  console.log('');
}

function overlapsRange(addr, width, start, end) {
  const normalized = addr & 0xFFFFFF;
  const last = (normalized + width - 1) & 0xFFFFFF;
  if (normalized <= last) {
    return last >= start && normalized <= end;
  }
  return (normalized <= end) || (last >= start);
}

function labelsForRange(addr, width) {
  return WATCH_RANGES.filter((range) => overlapsRange(addr, width, range.start, range.end)).map((range) => range.label);
}

function installAccessTracer(cpu, mem, state) {
  const events = [];
  const originalRead8 = cpu.read8.bind(cpu);
  const originalRead16 = cpu.read16.bind(cpu);
  const originalRead24 = cpu.read24.bind(cpu);
  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  function recordRead(kind, addr, width, value) {
    const labels = labelsForRange(addr, width);
    if (labels.length === 0) {
      return;
    }
    events.push({
      kind,
      labels,
      step: state.currentStep,
      blockPc: state.currentBlockPc,
      addr: addr & 0xFFFFFF,
      width,
      value: value >>> 0,
    });
  }

  function recordWrite(kind, addr, width, beforeValue, afterValue) {
    const labels = labelsForRange(addr, width);
    if (labels.length === 0) {
      return;
    }
    events.push({
      kind,
      labels,
      step: state.currentStep,
      blockPc: state.currentBlockPc,
      addr: addr & 0xFFFFFF,
      width,
      beforeValue: beforeValue >>> 0,
      afterValue: afterValue >>> 0,
    });
  }

  cpu.read8 = (addr) => {
    const value = originalRead8(addr);
    recordRead('read8', addr, 1, value);
    return value;
  };

  cpu.read16 = (addr) => {
    const value = originalRead16(addr);
    recordRead('read16', addr, 2, value);
    return value;
  };

  cpu.read24 = (addr) => {
    const value = originalRead24(addr);
    recordRead('read24', addr, 3, value);
    return value;
  };

  cpu.write8 = (addr, value) => {
    const a = addr & 0xFFFFFF;
    const before = mem[a & MEM_MASK] ?? 0;
    const result = originalWrite8(addr, value);
    recordWrite('write8', addr, 1, before, value & 0xFF);
    return result;
  };

  cpu.write16 = (addr, value) => {
    const a = addr & 0xFFFFFF;
    const before = (mem[a & MEM_MASK] ?? 0) | ((mem[(a + 1) & MEM_MASK] ?? 0) << 8);
    const result = originalWrite16(addr, value);
    recordWrite('write16', addr, 2, before, value & 0xFFFF);
    return result;
  };

  cpu.write24 = (addr, value) => {
    const a = addr & 0xFFFFFF;
    const before =
      (mem[a & MEM_MASK] ?? 0)
      | ((mem[(a + 1) & MEM_MASK] ?? 0) << 8)
      | ((mem[(a + 2) & MEM_MASK] ?? 0) << 16);
    const result = originalWrite24(addr, value);
    recordWrite('write24', addr, 3, before, value & 0xFFFFFF);
    return result;
  };

  return {
    getEvents() {
      return events.slice();
    },
    restore() {
      cpu.read8 = originalRead8;
      cpu.read16 = originalRead16;
      cpu.read24 = originalRead24;
      cpu.write8 = originalWrite8;
      cpu.write16 = originalWrite16;
      cpu.write24 = originalWrite24;
    },
  };
}

function seedBaseState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._ix = IX_BASE;
  cpu._iy = IY_BASE;
  cpu.a = 0x00;
  cpu.f = 0x00;
  cpu.bc = 0x000000;
  cpu.de = 0x000000;
  cpu.hl = 0x000000;
  cpu.sp = (STACK_TOP - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, RETURN_SENTINEL);
  mem.fill(0x00, D3F_START, D3F_END + 1);
  mem[D005F8 & MEM_MASK] = 0x00;
  mem[D005F9 & MEM_MASK] = ENTRY_BYTES[2];
  mem[D005FA & MEM_MASK] = ENTRY_BYTES[1];
  mem[D005FB & MEM_MASK] = ENTRY_BYTES[0];
}

function prepareExperimentState(cpu, mem, experiment) {
  seedBaseState(cpu, mem);

  write24(mem, D0259A, experiment.tablePtr);
  write24(mem, D02590, experiment.tablePtr);
  write24(mem, D0259D, experiment.tablePtr);

  if (experiment.populateEntry) {
    for (let index = 0; index < ENTRY_BYTES.length; index += 1) {
      mem[(ENTRY_START + index) & MEM_MASK] = ENTRY_BYTES[index];
    }
  }

  cpu.hl = experiment.initialHl;
  cpu.de = experiment.initialDe;
}

function normalizeTermination(result) {
  if (result.termination === 'missing_block' && ((result.lastPc ?? 0) & 0xFFFFFF) === RETURN_SENTINEL) {
    return 'returned-to-sentinel';
  }
  return result.termination;
}

function formatEvent(event) {
  const head =
    `step=${String(event.step).padStart(3, ' ')} block=${hex(event.blockPc)} `
    + `${event.kind} ${hex(event.addr)} [${event.labels.join(', ')}]`;
  if (event.kind.startsWith('read')) {
    return `${head} => ${hex(event.value, Math.max(2, event.width * 2))}`;
  }
  return `${head} ${hex(event.beforeValue, Math.max(2, event.width * 2))} -> ${hex(event.afterValue, Math.max(2, event.width * 2))}`;
}

function inferExitCondition(experiment, summary) {
  if (experiment.startPc === TARGET_HELPER) {
    return 'RET at 0x082BE8 after six DEC HL operations. This is a helper, not a polling loop.';
  }

  if (summary.loopEscape && summary.loopEscape.pc === TARGET_SUCCESS_CALL) {
    return 'Loop broke on the success path: the three key compares matched and control left the polling cluster via CALL 0x04C885.';
  }

  if (summary.termination === 'returned-to-sentinel') {
    if (summary.loopBlocks.includes(0x084748)) {
      return 'Loop matched and returned through the 0x084748..0x084750 tail.';
    }
    return 'Loop broke on the lower-bound test at 0x084716..0x08471A (`AND 0x3F`, `SBC HL, DE`, `RET C`).';
  }

  if (summary.startVisits > 1) {
    return 'Loop followed the mismatch/retry path (`LD BC,3` + `OR A` + `SBC HL,BC` + `JR 0x084711`) before leaving the step budget or another path.';
  }

  return 'No explicit break was inferred; inspect the block trace.';
}

function summarizeHypothesis(experiments) {
  const helperEmpty = experiments.find((entry) => entry.name === '082BE2 empty-table');
  const helperOne = experiments.find((entry) => entry.name === '082BE2 one-entry');
  const loopEmpty = experiments.find((entry) => entry.name === '084711 empty-table');
  const loopOne = experiments.find((entry) => entry.name === '084711 one-entry');

  console.log('=== Conclusion ===');
  console.log(`- ${helperEmpty.name}: ${helperEmpty.exitCondition}`);
  console.log(`- ${helperOne.name}: ${helperOne.exitCondition}`);
  console.log(`- ${loopEmpty.name}: ${loopEmpty.exitCondition}`);
  console.log(`- ${loopOne.name}: ${loopOne.exitCondition}`);
  console.log('- Static decode shows no `CP D3FFFF` or direct `D0259A != D3FFFF` test inside 0x084711 itself.');
  console.log(`- The only nearby direct D0259A load is ${hex(TARGET_D0259A_LOAD)}: \`LD HL, (0xD0259A)\`, which feeds the loop from outside the requested start PC.`);
  console.log(`- The actual polling-loop break is the lower-bound carry exit at ${hex(0x08471A)} when \`HL\` has been rewound far enough that \`SBC HL, DE\` sets carry.`);
  console.log(`- In other words: D0259A influences the initial scan position, but the loop is not checking \`D0259A != D3FFFF\` with a direct compare. It exits on the derived pointer-range test.`);
  console.log('');
}

function runExperiment(executor, cpu, mem, bootSnapshot, experiment) {
  restoreRuntime(cpu, mem, bootSnapshot);
  prepareExperimentState(cpu, mem, experiment);

  const state = {
    currentStep: 0,
    currentBlockPc: experiment.startPc,
  };
  const tracer = installAccessTracer(cpu, mem, state);

  const blockTrace = [];
  const uniqueBlocks = [];
  const seenBlocks = new Set();
  let startVisits = 0;
  let helperCalls = 0;
  let calls0846EA = 0;
  let loopEscape = null;

  const result = executor.runFrom(experiment.startPc, 'adl', {
    maxSteps: RUN_STEPS,
    maxLoopIterations: RUN_LOOP_LIMIT,
    onBlock(pc, mode, _meta, step) {
      const normalizedPc = pc & 0xFFFFFF;
      state.currentStep = step;
      state.currentBlockPc = normalizedPc;
      blockTrace.push({ step, pc: normalizedPc, mode });
      const key = `${hex(normalizedPc)}:${mode}`;
      if (!seenBlocks.has(key)) {
        seenBlocks.add(key);
        uniqueBlocks.push(key);
      }
      if (normalizedPc === experiment.startPc) {
        startVisits += 1;
      }
      if (normalizedPc === TARGET_HELPER) {
        helperCalls += 1;
      }
      if (normalizedPc === TARGET_LOOKUP) {
        calls0846EA += 1;
      }
      if (!loopEscape && startVisits > 0 && !LOOP_CLUSTER.has(normalizedPc)) {
        loopEscape = { step, pc: normalizedPc, mode };
      }
    },
  });

  const events = tracer.getEvents();
  tracer.restore();

  const termination = normalizeTermination(result);
  const loopBlocks = blockTrace.map((entry) => entry.pc);
  const exitCondition = inferExitCondition(experiment, {
    termination,
    startVisits,
    loopBlocks,
    loopEscape,
  });

  return {
    ...experiment,
    termination,
    rawTermination: result.termination,
    result,
    blockTrace,
    uniqueBlocks,
    startVisits,
    helperCalls,
    calls0846EA,
    loopEscape,
    exitCondition,
    finalRegisters: {
      a: cpu.a & 0xFF,
      f: cpu.f & 0xFF,
      bc: cpu.bc & 0xFFFFFF,
      de: cpu.de & 0xFFFFFF,
      hl: cpu.hl & 0xFFFFFF,
      sp: cpu.sp & 0xFFFFFF,
    },
    finalMemory: {
      d0259a: read24(mem, D0259A),
      d005f8: mem[D005F8 & MEM_MASK] & 0xFF,
      d005f9: mem[D005F9 & MEM_MASK] & 0xFF,
      d005fa: mem[D005FA & MEM_MASK] & 0xFF,
      d005fb: mem[D005FB & MEM_MASK] & 0xFF,
    },
    events,
  };
}

function printExperiment(summary) {
  console.log(`=== ${summary.name} ===`);
  console.log(`assumption: ${summary.assumption}`);
  console.log(
    `start=${hex(summary.startPc)} tablePtr=${hex(summary.tablePtr)} `
    + `HL=${hex(summary.initialHl)} DE=${hex(summary.initialDe)} populateEntry=${summary.populateEntry ? 'yes' : 'no'}`,
  );
  console.log(
    `termination=${summary.termination} rawTermination=${summary.rawTermination} `
    + `steps=${summary.result.steps} lastPc=${hex(summary.result.lastPc)}:${summary.result.lastMode}`,
  );
  console.log(
    `loopIterations=${summary.startVisits} helperCalls=${summary.helperCalls} calls0846EA=${summary.calls0846EA}`,
  );
  console.log(`exitCondition=${summary.exitCondition}`);
  if (summary.loopEscape) {
    console.log(`firstLoopEscape=${hex(summary.loopEscape.pc)}:${summary.loopEscape.mode} at step ${summary.loopEscape.step}`);
  } else {
    console.log('firstLoopEscape=none');
  }
  console.log(
    `finalRegisters A=${hexByte(summary.finalRegisters.a)} F=${hexByte(summary.finalRegisters.f)} `
    + `BC=${hex(summary.finalRegisters.bc)} DE=${hex(summary.finalRegisters.de)} `
    + `HL=${hex(summary.finalRegisters.hl)} SP=${hex(summary.finalRegisters.sp)}`,
  );
  console.log(
    `finalMemory D0259A=${hex(summary.finalMemory.d0259a)} `
    + `D005F8=${hexByte(summary.finalMemory.d005f8)} `
    + `D005F9=${hexByte(summary.finalMemory.d005f9)} `
    + `D005FA=${hexByte(summary.finalMemory.d005fa)} `
    + `D005FB=${hexByte(summary.finalMemory.d005fb)}`,
  );
  console.log(`uniqueBlocks=${summary.uniqueBlocks.join(' -> ') || '(none)'}`);
  console.log('watchedAccesses:');
  if (summary.events.length === 0) {
    console.log('  (none)');
  } else {
    for (const event of summary.events.slice(0, 40)) {
      console.log(`  ${formatEvent(event)}`);
    }
    if (summary.events.length > 40) {
      console.log(`  ... ${summary.events.length - 40} more`);
    }
  }
  console.log('');
}

async function main() {
  const rom = fs.readFileSync(ROM_PATH);

  console.log('=== Phase 276 Polling Loop Probe ===');
  console.log(`ROM=${ROM_PATH}`);
  console.log(`Boot=${hex(BOOT_PC)}:${BOOT_MODE} steps=${BOOT_STEPS}`);
  console.log(`Requested entry payload=${hex(ENTRY_START)}..${hex(ENTRY_END)} (${ENTRY_BYTES.map(hexByte).join(' ')})`);
  console.log('');

  printStaticRange(rom, RANGE_A);
  printStaticRange(rom, RANGE_B);

  const { blocks, assets } = await loadBlocks();
  try {
    const mem = new Uint8Array(MEM_SIZE);
    mem.set(rom.subarray(0, Math.min(rom.length, MEM_SIZE)));

    const executor = createExecutor(blocks, mem, {
      peripherals: createPeripheralBus({ timerInterrupt: false }),
    });
    const cpu = executor.cpu;

    const bootResult = executor.runFrom(BOOT_PC, BOOT_MODE, {
      maxSteps: BOOT_STEPS,
      maxLoopIterations: BOOT_LOOP_LIMIT,
    });
    const bootSnapshot = snapshotRuntime(cpu, mem);

    console.log('=== Boot Snapshot ===');
    console.log(
      `termination=${bootResult.termination} steps=${bootResult.steps} `
      + `lastPc=${hex(bootResult.lastPc)}:${bootResult.lastMode} halted=${bootResult.halted ? 'yes' : 'no'}`,
    );
    console.log('');

    const experiments = [
      {
        name: '082BE2 empty-table',
        startPc: TARGET_HELPER,
        tablePtr: EMPTY_PTR,
        populateEntry: false,
        initialHl: EMPTY_PTR,
        initialDe: (EMPTY_PTR + 1) & 0xFFFFFF,
        assumption: 'Seed HL with the empty-table sentinel tail. This shows whether 0x082BE2 itself polls anything.',
      },
      {
        name: '082BE2 one-entry',
        startPc: TARGET_HELPER,
        tablePtr: ENTRY_START,
        populateEntry: true,
        initialHl: ENTRY_END,
        initialDe: (ENTRY_START + 1) & 0xFFFFFF,
        assumption: 'Seed HL with the requested 9-byte payload tail at 0xD3FFFE so the helper runs exactly where the loop would call it.',
      },
      {
        name: '084711 empty-table',
        startPc: TARGET_LOOP,
        tablePtr: EMPTY_PTR,
        populateEntry: false,
        initialHl: EMPTY_PTR,
        initialDe: (EMPTY_PTR + 1) & 0xFFFFFF,
        assumption: 'Direct start inside the loop: HL uses the empty sentinel tail and DE uses sentinel+1, so the carry exit should fire immediately if this is the empty-table break.',
      },
      {
        name: '084711 one-entry',
        startPc: TARGET_LOOP,
        tablePtr: ENTRY_START,
        populateEntry: true,
        initialHl: ENTRY_END,
        initialDe: (ENTRY_START + 1) & 0xFFFFFF,
        assumption: 'Direct start inside the loop: HL is forced to 0xD3FFFE so the requested 0xD3FFF6..0xD3FFFE payload becomes the live compare window.',
      },
    ];

    const summaries = experiments.map((experiment) => runExperiment(executor, cpu, mem, bootSnapshot, experiment));

    for (const summary of summaries) {
      printExperiment(summary);
    }

    summarizeHypothesis(summaries);
  } finally {
    cleanupTranspiledModule(assets);
  }
}

await main();
