#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const TRACE_LIMIT = 1000;
const BRANCH_SUMMARY_LIMIT = 200;
const MAX_BLOCK_STEPS = 12000;
const SKIP_LOOKAHEAD = 16;
const PLL_DIVERGENCE_PC = 0x0006a9;
const PLL_WINDOW_START = 0x00069f;
const PLL_WINDOW_END = 0x000704;

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hex8(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) & 0xff).toString(16).toUpperCase().padStart(2, '0')}`;
}

function formatCount(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function blockKey(pc, mode) {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function createMemoryBus(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(mem.length, romBytes.length)));
  return mem;
}

function parseConditional(dasm) {
  const match = /^(jr|jp|call|ret)\s+(nz|z|nc|c|po|pe|p|m)\b/i.exec(dasm ?? '');
  if (!match) {
    return null;
  }
  return {
    op: match[1].toLowerCase(),
    condition: match[2].toLowerCase(),
  };
}

function getFlagSnapshot(cpu) {
  return {
    f: cpu.f & 0xff,
    z: (cpu.f & 0x40) ? 1 : 0,
    c: (cpu.f & 0x01) ? 1 : 0,
    pv: (cpu.f & 0x04) ? 1 : 0,
    s: (cpu.f & 0x80) ? 1 : 0,
  };
}

function resolveNextMode(meta, result, cpu, currentMode) {
  if (meta?.exits) {
    for (const exit of meta.exits) {
      if (exit.target === result && exit.targetMode) {
        return exit.targetMode;
      }
    }
  }
  return cpu.madl ? 'adl' : currentMode;
}

function peekReturnTarget(cpu) {
  if (cpu.madl) {
    return cpu.read24(cpu.sp & 0xffffff);
  }
  return cpu.read16(((cpu.mbase << 16) | (cpu.sp & 0xffff)) & 0xffffff);
}

function analyzeFlow(inst, actualResult, cpu) {
  if (!inst) {
    return null;
  }

  const dasm = inst.dasm ?? '';
  const fallthrough = inst.fallthrough ?? ((inst.pc + inst.length) & 0xffffff);
  const conditional = parseConditional(dasm);
  const flags = getFlagSnapshot(cpu);
  const condResult = conditional ? cpu.checkCondition(conditional.condition) : null;

  if (inst.tag === 'rst' || /^rst\b/i.test(dasm)) {
    return {
      kind: 'rst',
      conditional: false,
      actualTarget: actualResult >= 0 ? actualResult : (inst.target ?? null),
      target: inst.target ?? null,
      returnAddress: fallthrough,
    };
  }

  if (/^call\b/i.test(dasm)) {
    const taken = conditional ? condResult : true;
    return {
      kind: 'call',
      conditional: Boolean(conditional),
      condition: conditional?.condition ?? null,
      condResult,
      flags,
      taken,
      target: inst.target ?? null,
      fallthrough,
      actualTarget: taken ? (inst.target ?? actualResult) : fallthrough,
      alternativeTarget: conditional ? (taken ? fallthrough : (inst.target ?? null)) : null,
    };
  }

  if (/^(jp|jr)\b/i.test(dasm)) {
    const taken = conditional ? condResult : true;
    return {
      kind: 'branch',
      conditional: Boolean(conditional),
      condition: conditional?.condition ?? null,
      condResult,
      flags,
      taken,
      target: inst.target ?? null,
      fallthrough,
      actualTarget: taken ? (inst.target ?? actualResult) : fallthrough,
      alternativeTarget: conditional ? (taken ? fallthrough : (inst.target ?? null)) : null,
    };
  }

  if (/^ret/i.test(dasm)) {
    const taken = conditional ? condResult : true;
    return {
      kind: 'return',
      conditional: Boolean(conditional),
      condition: conditional?.condition ?? null,
      condResult,
      flags,
      taken,
      fallthrough,
      actualTarget: taken ? actualResult : fallthrough,
      alternativeTarget: conditional ? (taken ? fallthrough : peekReturnTarget(cpu)) : null,
    };
  }

  if (inst.tag === 'halt' || /^halt\b/i.test(dasm)) {
    return {
      kind: 'halt',
      conditional: false,
    };
  }

  return null;
}

function formatConditionState(flow) {
  if (!flow?.conditional) {
    return '';
  }

  switch (flow.condition) {
    case 'z':
    case 'nz':
      return `Z=${flow.flags.z}`;
    case 'c':
    case 'nc':
      return `C=${flow.flags.c}`;
    case 'pe':
    case 'po':
      return `PV=${flow.flags.pv}`;
    case 'm':
    case 'p':
      return `S=${flow.flags.s}`;
    default:
      return `F=${hex8(flow.flags.f)}`;
  }
}

function formatFlow(flow) {
  if (!flow) {
    return '';
  }

  if (flow.kind === 'rst') {
    return ` -> ${hex(flow.actualTarget)} [return ${hex(flow.returnAddress)}]`;
  }

  if (flow.kind === 'halt') {
    return ' -> HALT';
  }

  if (flow.kind === 'call' && !flow.conditional) {
    return ` -> ${hex(flow.target)} [return ${hex(flow.fallthrough)}]`;
  }

  if (flow.kind === 'call' && flow.conditional) {
    return ` -> ${flow.taken ? 'taken' : 'not-taken'} ${hex(flow.actualTarget)} [alt ${hex(flow.alternativeTarget)}, ${formatConditionState(flow)}]`;
  }

  if (flow.kind === 'branch' && !flow.conditional) {
    return ` -> ${hex(flow.actualTarget)}`;
  }

  if (flow.kind === 'branch' && flow.conditional) {
    return ` -> ${flow.taken ? 'taken' : 'not-taken'} ${hex(flow.actualTarget)} [alt ${hex(flow.alternativeTarget)}, ${formatConditionState(flow)}]`;
  }

  if (flow.kind === 'return' && !flow.conditional) {
    return ` -> return ${hex(flow.actualTarget)}`;
  }

  if (flow.kind === 'return' && flow.conditional) {
    return ` -> ${flow.taken ? 'taken' : 'not-taken'} ${hex(flow.actualTarget)} [alt ${hex(flow.alternativeTarget)}, ${formatConditionState(flow)}]`;
  }

  return '';
}

function formatTraceEntry(entry) {
  const marks = [];
  if (entry.pc === PLL_DIVERGENCE_PC) {
    marks.push('PLL');
  } else if (entry.pc >= PLL_WINDOW_START && entry.pc <= PLL_WINDOW_END) {
    marks.push('PLL-near');
  }
  if (entry.flow?.kind === 'rst') {
    marks.push('RST38');
  }
  const suffix = marks.length ? ` [${marks.join(', ')}]` : '';
  return (
    `[${String(entry.index).padStart(4, '0')}] ` +
    `${hex(entry.pc)}:${entry.mode}  ` +
    `${String(entry.bytes ?? '').padEnd(16)} ` +
    `${entry.dasm}${formatFlow(entry.flow)}${suffix}`
  );
}

function summarizeBranch(entry) {
  const flow = entry.flow;
  return (
    `${hex(entry.pc)}:${entry.mode}  ${entry.dasm}  ` +
    `${flow.taken ? 'taken' : 'not taken'}  ` +
    `${formatConditionState(flow)}  ` +
    `actual=${hex(flow.actualTarget)}  alt=${hex(flow.alternativeTarget)}`
  );
}

function traceBoot(executor) {
  const { cpu, compiledBlocks, blockMeta } = executor;

  let pc = BOOT_ENTRY;
  let mode = BOOT_MODE;
  let termination = 'max_steps';
  let error = null;
  let blockSteps = 0;
  let executedInstructions = 0;
  let lastExecutedBlockPc = null;
  let lastExecutedMode = null;

  const traceEntries = [];
  const branchEntries = [];
  const missingEvents = [];
  const rstReturnEvents = [];
  const frameStack = [];

  let pendingRstResume = null;

  while (blockSteps < MAX_BLOCK_STEPS) {
    if (pendingRstResume && pendingRstResume.actualResumePc === null) {
      pendingRstResume.actualResumePc = pc;
      pendingRstResume.actualResumeMode = mode;
      rstReturnEvents.push(pendingRstResume);
      pendingRstResume = null;
    }

    cpu.madl = mode === 'adl' ? 1 : 0;

    const key = blockKey(pc, mode);
    const meta = blockMeta[key];
    const fn = compiledBlocks[key];

    if (!fn) {
      const missingPc = pc;
      let skippedTo = null;

      for (let offset = 1; offset <= SKIP_LOOKAHEAD; offset++) {
        const candidate = (missingPc + offset) & 0xffffff;
        if (compiledBlocks[blockKey(candidate, mode)]) {
          skippedTo = candidate;
          pc = candidate;
          break;
        }
      }

      missingEvents.push({
        pc: missingPc,
        mode,
        skippedTo,
      });

      if (skippedTo === null) {
        termination = 'missing_block';
        break;
      }

      continue;
    }

    lastExecutedBlockPc = pc;
    lastExecutedMode = mode;

    let result;
    try {
      result = fn(cpu);
    } catch (err) {
      error = err;
      termination = 'error';
      break;
    }

    blockSteps++;

    const instructions = meta.instructions ?? [];
    executedInstructions += instructions.length;

    const lastInstruction = instructions.length ? instructions[instructions.length - 1] : null;
    const flow = analyzeFlow(lastInstruction, result, cpu);

    for (let i = 0; i < instructions.length; i++) {
      if (traceEntries.length >= TRACE_LIMIT) {
        break;
      }

      const inst = instructions[i];
      const entry = {
        index: traceEntries.length + 1,
        pc: inst.pc & 0xffffff,
        mode: inst.mode ?? mode,
        bytes: inst.bytes ?? '',
        dasm: inst.dasm ?? '',
        blockPc: meta.startPc & 0xffffff,
        flow: i === instructions.length - 1 ? flow : null,
      };

      traceEntries.push(entry);

      if (entry.index <= BRANCH_SUMMARY_LIMIT && entry.flow?.conditional) {
        branchEntries.push(entry);
      }
    }

    if (flow?.kind === 'rst') {
      frameStack.push({
        kind: 'rst',
        pc: lastInstruction.pc & 0xffffff,
        mode: lastInstruction.mode ?? mode,
        handlerPc: flow.actualTarget,
        returnPc: flow.returnAddress,
      });
    } else if (flow?.kind === 'call' && (!flow.conditional || flow.taken)) {
      frameStack.push({
        kind: 'call',
        pc: lastInstruction.pc & 0xffffff,
        mode: lastInstruction.mode ?? mode,
        returnPc: flow.fallthrough,
      });
    } else if (flow?.kind === 'return' && (!flow.conditional || flow.taken)) {
      const frame = frameStack.pop() ?? null;
      if (frame?.kind === 'rst') {
        pendingRstResume = {
          rstPc: frame.pc,
          rstMode: frame.mode,
          handlerPc: frame.handlerPc,
          expectedReturnPc: frame.returnPc,
          poppedReturnPc: flow.actualTarget,
          actualResumePc: null,
          actualResumeMode: null,
        };
      }
    }

    if (result === undefined || result === null) {
      termination = 'no_return';
      break;
    }

    if (result < 0) {
      termination = result === -1 ? 'halt' : 'sleep';
      break;
    }

    mode = resolveNextMode(meta, result, cpu, mode);
    pc = result & 0xffffff;

    if (traceEntries.length >= TRACE_LIMIT && pendingRstResume === null) {
      termination = 'trace_budget';
      break;
    }
  }

  if (pendingRstResume) {
    rstReturnEvents.push(pendingRstResume);
  }

  const exactPllIndex = traceEntries.findIndex((entry) => entry.pc === PLL_DIVERGENCE_PC);
  const nearbyPllIndex = exactPllIndex >= 0
    ? exactPllIndex
    : traceEntries.findIndex((entry) => entry.pc >= PLL_WINDOW_START && entry.pc <= PLL_WINDOW_END);

  return {
    termination,
    error,
    blockSteps,
    executedInstructions,
    traceEntries,
    branchEntries,
    missingEvents,
    rstReturnEvents,
    exactPllIndex,
    nearbyPllIndex,
    lastExecutedBlockPc,
    lastExecutedMode,
    nextPc: pc,
    nextMode: mode,
    cpu,
  };
}

if (!fs.existsSync(ROM_PATH)) {
  throw new Error('ROM.rom is missing.');
}

const romBytes = fs.readFileSync(ROM_PATH);
const memory = createMemoryBus(romBytes);
const peripherals = createPeripheralBus({ timerInterrupt: false });
const executor = createExecutor(PRELIFTED_BLOCKS, memory, { peripherals });

const result = traceBoot(executor);

console.log('Phase 343: boot branch trace');
console.log('============================');
console.log(`Boot entry:            ${hex(BOOT_ENTRY)}:${BOOT_MODE}`);
console.log(`Trace limit:           ${formatCount(TRACE_LIMIT)} instructions`);
console.log(`Branch summary limit:  ${formatCount(BRANCH_SUMMARY_LIMIT)} instructions`);
console.log(`Timer interrupt:       disabled`);
console.log(`Termination:           ${result.termination}`);
console.log(`Blocks executed:       ${formatCount(result.blockSteps)}`);
console.log(`Instructions executed: ${formatCount(result.executedInstructions)}`);
console.log(`Instructions traced:   ${formatCount(result.traceEntries.length)}`);
console.log(`Last block:            ${hex(result.lastExecutedBlockPc)}:${result.lastExecutedMode}`);
console.log(`Next PC:               ${hex(result.nextPc)}:${result.nextMode}`);
console.log(`Missing skips:         ${formatCount(result.missingEvents.length)}`);
console.log(`Final F:               ${hex8(result.cpu.f)}`);

if (result.error) {
  console.log(`Error:                 ${result.error?.message ?? String(result.error)}`);
}

console.log('\nInstruction trace (first executed instructions)');
console.log('---------------------------------------------');
for (const entry of result.traceEntries) {
  console.log(formatTraceEntry(entry));
}

console.log(`\nConditional branches in first ${BRANCH_SUMMARY_LIMIT} instructions`);
console.log('------------------------------------------------');
if (result.branchEntries.length === 0) {
  console.log('No conditional branches were reached in the first 200 traced instructions.');
} else {
  for (const entry of result.branchEntries) {
    console.log(`- ${summarizeBranch(entry)}`);
  }
}

console.log('\nRST 0x38 returns');
console.log('----------------');
const rst38Events = result.rstReturnEvents.filter((entry) => entry.handlerPc === 0x000038);
if (rst38Events.length === 0) {
  console.log('No completed RST 0x38 return was observed inside the traced boot window.');
} else {
  for (const event of rst38Events) {
    console.log(
      `- rst at ${hex(event.rstPc)}:${event.rstMode} ` +
      `pushed ${hex(event.expectedReturnPc)}, handler returned ${hex(event.poppedReturnPc)}, ` +
      `next lifted block ${hex(event.actualResumePc)}:${event.actualResumeMode}`,
    );
  }
}

console.log('\nPLL divergence window');
console.log('---------------------');
if (result.exactPllIndex >= 0 || result.nearbyPllIndex >= 0) {
  const focusIndex = result.exactPllIndex >= 0 ? result.exactPllIndex : result.nearbyPllIndex;
  const focusEntry = result.traceEntries[focusIndex];
  const windowStart = Math.max(0, focusIndex - 6);
  const windowEnd = Math.min(result.traceEntries.length, focusIndex + 15);

  if (result.exactPllIndex >= 0) {
    console.log(`Exact ${hex(PLL_DIVERGENCE_PC)} reached at instruction #${focusEntry.index}.`);
  } else {
    console.log(
      `Exact ${hex(PLL_DIVERGENCE_PC)} was not traced; nearest lifted instruction is ` +
      `${hex(focusEntry.pc)}:${focusEntry.mode} at instruction #${focusEntry.index}.`,
    );
  }

  for (let i = windowStart; i < windowEnd; i++) {
    console.log(formatTraceEntry(result.traceEntries[i]));
  }
} else {
  console.log(`No instruction in ${hex(PLL_WINDOW_START)}-${hex(PLL_WINDOW_END)} was reached inside the trace window.`);
}

if (result.missingEvents.length) {
  console.log('\nMissing-block skips');
  console.log('-------------------');
  for (const entry of result.missingEvents.slice(0, 16)) {
    console.log(
      `- ${hex(entry.pc)}:${entry.mode} -> ` +
      `${entry.skippedTo === null ? 'stop' : `${hex(entry.skippedTo)}:${entry.mode}`}`,
    );
  }
}
