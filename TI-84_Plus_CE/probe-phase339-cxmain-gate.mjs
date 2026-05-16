#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const CPU_RUNTIME_PATH = path.join(__dirname, 'cpu-runtime.js');
const PERIPHERALS_PATH = path.join(__dirname, 'peripherals.js');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const STACK_RESET_TOP = 0xD1A87E;
const IY_BASE = 0xD00080;
const RETURN_SENTINEL = 0xFFFFFF;
const COORMON_ENTRY = 0x08BF22;
const GETCSC_SCAN_ADDR = 0x3B0033;
const CXMAIN_PTR = 0xD007CA;
const HOME_HANDLER = 0x058241;

const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_MAX_STEPS = 100000;
const KERNEL_INIT_MAX_LOOP_ITERATIONS = 10000;
const COORMON_MAX_STEPS = 50000;
const COORMON_MAX_LOOP_ITERATIONS = 50000;

const ENTER_SCAN = 0x09;
const ITERATION_COUNT = 5;

const KEY_HELPER_START = 0x0BD3FE;
const KEY_HELPER_END = 0x0BD430;
const COORMON_KEY_PATH_START = 0x08BF68;
const COORMON_KEY_PATH_END = 0x08BFA0;
const COORMON_DISPATCH_AREA = 0x08BF82;
const GATE_BRANCH_PC = 0x08BF42;
const GATE_SOURCE_BLOCK = 0x08BF3E;

const GATE_OFFSET = 71;
const RET_NZ_OFFSET = 27;
const FLAG_HELPER_OFFSET = 39;
const CONTEXT_BYTE_ADDR = 0xD007E0;

const FLAG_C = 0x01;
const FLAG_PV = 0x04;
const FLAG_Z = 0x40;
const FLAG_S = 0x80;

const CONDITIONAL_TAGS = new Set([
  'jp-conditional',
  'jr-conditional',
  'call-conditional',
  'ret-conditional',
]);

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hex8(value) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(value & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`;
}

function read24(buffer, addr) {
  const base = addr >>> 0;
  return (
    (buffer[base] ?? 0) |
    ((buffer[base + 1] ?? 0) << 8) |
    ((buffer[base + 2] ?? 0) << 16)
  ) >>> 0;
}

function write24(buffer, addr, value) {
  const base = addr >>> 0;
  const normalized = value >>> 0;
  buffer[base] = normalized & 0xFF;
  buffer[base + 1] = (normalized >>> 8) & 0xFF;
  buffer[base + 2] = (normalized >>> 16) & 0xFF;
}

function createMemoryBus(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return mem;
}

function resetStack(cpu, mem) {
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, RETURN_SENTINEL);
}

function prepareForCoorMon(cpu, mem) {
  cpu.mbase = 0xD0;
  cpu.iy = IY_BASE;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStack(cpu, mem);
}

function installHomeHandler(mem) {
  write24(mem, CXMAIN_PTR, HOME_HANDLER);
}

function createBootedEnvironment(romBytes, createExecutor, createPeripheralBus, blocks) {
  const mem = createMemoryBus(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const cpu = executor.cpu;

  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStack(cpu, mem);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: KERNEL_INIT_MAX_LOOP_ITERATIONS,
  });

  prepareForCoorMon(cpu, mem);

  return { mem, peripherals, executor, cpu, boot, kernelInit };
}

function formatFlowNote(instruction) {
  if (!instruction) {
    return '';
  }

  const tag = instruction.tag ?? '';
  if (tag === 'jr-conditional' || tag === 'jp-conditional' || tag === 'call-conditional') {
    return ` [cond ${instruction.condition} target=${hex(instruction.target)} fallthrough=${hex(instruction.fallthrough)}]`;
  }
  if (tag === 'ret-conditional') {
    return ` [cond ${instruction.condition} return fallthrough=${hex(instruction.fallthrough)}]`;
  }
  if (tag === 'call') {
    return ` [call ${hex(instruction.target)}]`;
  }
  if (tag === 'jr' || tag === 'jp') {
    return ` [jump ${hex(instruction.target)}]`;
  }
  if (tag === 'ret') {
    return ' [return]';
  }
  return '';
}

function printDisassemblyRange(title, romBytes, decodeInstruction, startPc, endPc, minInstructions = 0) {
  console.log(`\n${title}`);
  let pc = startPc >>> 0;
  let count = 0;
  const maxInstructions = Math.max(minInstructions, 64);

  while (count < maxInstructions && (pc <= (endPc >>> 0) || count < minInstructions)) {
    try {
      const instruction = decodeInstruction(romBytes, pc, 'adl');
      const length = Math.max(1, instruction?.length ?? 1);
      const bytes = Array.from(romBytes.subarray(pc, pc + length), (value) =>
        value.toString(16).toUpperCase().padStart(2, '0'),
      ).join(' ');
      const text = instruction?.dasm ?? instruction?.asm ?? instruction?.tag ?? '<unknown>';
      console.log(`  ${hex(pc)}: ${bytes.padEnd(20)} ${text}${formatFlowNote(instruction)}`);
      pc = (pc + length) >>> 0;
      count++;
    } catch (error) {
      console.log(`  ${hex(pc)}: <decode failed: ${error?.message ?? error}>`);
      pc = (pc + 1) >>> 0;
      count++;
    }
  }
}

function findIncomingTransfers(blocks, targetPc) {
  const target = targetPc >>> 0;
  const dedupe = new Set();
  const incoming = [];

  for (const block of Object.values(blocks)) {
    const instructions = block?.instructions ?? [];
    const lastInstruction = instructions[instructions.length - 1] ?? null;
    for (const exit of block?.exits ?? []) {
      if ((exit.target ?? null) !== target) {
        continue;
      }
      const instructionPc = lastInstruction?.pc ?? block.startPc;
      const dasm = lastInstruction?.dasm ?? lastInstruction?.tag ?? exit.type;
      const key = `${instructionPc}|${dasm}|${exit.type}|${exit.condition ?? ''}`;
      if (dedupe.has(key)) {
        continue;
      }
      dedupe.add(key);
      incoming.push({
        sourceBlockPc: block.startPc,
        instructionPc,
        dasm,
        exitType: exit.type,
        condition: exit.condition ?? lastInstruction?.condition ?? null,
      });
    }
  }

  incoming.sort((left, right) => left.instructionPc - right.instructionPc);
  return incoming;
}

function formatTable(rows) {
  const widths = rows[0].map((_, columnIndex) => (
    Math.max(...rows.map((row) => String(row[columnIndex]).length))
  ));

  const renderRow = (row) => row
    .map((cell, columnIndex) => String(cell).padEnd(widths[columnIndex], ' '))
    .join(' | ');

  const divider = widths.map((width) => '-'.repeat(width)).join('-+-');

  return [
    renderRow(rows[0]),
    divider,
    ...rows.slice(1).map(renderRow),
  ].join('\n');
}

function createFlagSnapshot(f) {
  const normalized = f & 0xFF;
  const z = (normalized & FLAG_Z) !== 0;
  const c = (normalized & FLAG_C) !== 0;
  const pv = (normalized & FLAG_PV) !== 0;
  const s = (normalized & FLAG_S) !== 0;

  return {
    f: normalized,
    z,
    nz: !z,
    c,
    nc: !c,
    pv,
    po: !pv,
    s,
    p: !s,
  };
}

function evaluateCondition(condition, flags) {
  switch (condition) {
    case 'z': return flags.z;
    case 'nz': return flags.nz;
    case 'c': return flags.c;
    case 'nc': return flags.nc;
    case 'pe': return flags.pv;
    case 'po': return flags.po;
    case 'm': return flags.s;
    case 'p': return flags.p;
    default: return null;
  }
}

function parseIYOffsetsFromDasm(dasm) {
  const text = String(dasm ?? '');
  const offsets = [];
  const regex = /\(iy(?:(\+|-)(\d+))?\)/gi;
  let match = regex.exec(text);
  while (match) {
    const sign = match[1] ?? '+';
    const magnitude = Number(match[2] ?? 0);
    offsets.push(sign === '-' ? -magnitude : magnitude);
    match = regex.exec(text);
  }
  return offsets;
}

function collectIYObservations(meta, cpu, mem) {
  const seen = new Set();
  const observations = [];

  for (const instruction of meta?.instructions ?? []) {
    for (const offset of parseIYOffsetsFromDasm(instruction?.dasm)) {
      if (seen.has(offset)) {
        continue;
      }
      seen.add(offset);
      const addr = (cpu.iy + offset) & 0xFFFFFF;
      observations.push({
        offset,
        addr,
        value: mem[addr] & 0xFF,
      });
    }
  }

  observations.sort((left, right) => left.offset - right.offset);
  return observations;
}

function getConditionalTerminal(meta) {
  const instructions = meta?.instructions ?? [];
  const lastInstruction = instructions[instructions.length - 1] ?? null;
  if (!lastInstruction || !CONDITIONAL_TAGS.has(lastInstruction.tag)) {
    return null;
  }
  return lastInstruction;
}

function appendConditionalEvent(events, previous, nextPc, nextMode, step, cpu, mem) {
  const terminal = getConditionalTerminal(previous?.meta);
  if (!terminal) {
    return;
  }

  const normalizedNextPc = nextPc === undefined || nextPc === null ? null : (nextPc >>> 0);
  const flags = createFlagSnapshot(cpu.f);
  const actualCondition = evaluateCondition(terminal.condition, flags);
  let taken = null;

  if (terminal.tag === 'ret-conditional') {
    if (normalizedNextPc !== null && terminal.fallthrough !== undefined) {
      taken = normalizedNextPc !== (terminal.fallthrough >>> 0);
    }
  } else if (terminal.target !== undefined && normalizedNextPc !== null) {
    taken = normalizedNextPc === (terminal.target >>> 0);
  } else if (terminal.fallthrough !== undefined && normalizedNextPc !== null) {
    taken = normalizedNextPc !== (terminal.fallthrough >>> 0);
  }

  events.push({
    step,
    sourceBlockPc: previous.pc >>> 0,
    instructionPc: terminal.pc >>> 0,
    dasm: terminal.dasm ?? terminal.tag ?? '<unknown>',
    tag: terminal.tag ?? '<unknown>',
    condition: terminal.condition ?? null,
    target: terminal.target ?? null,
    fallthrough: terminal.fallthrough ?? null,
    nextPc: normalizedNextPc,
    nextMode: nextMode ?? 'adl',
    taken,
    actualCondition,
    a: cpu.a & 0xFF,
    flags,
    iyObservations: collectIYObservations(previous.meta, cpu, mem),
  });
}

function getNamedState(mem) {
  return {
    cxMain: read24(mem, CXMAIN_PTR),
    context: mem[CONTEXT_BYTE_ADDR] & 0xFF,
    scan: mem[GETCSC_SCAN_ADDR] & 0xFF,
    gateByte: mem[(IY_BASE + GATE_OFFSET) & 0xFFFFFF] & 0xFF,
    retNzByte: mem[(IY_BASE + RET_NZ_OFFSET) & 0xFFFFFF] & 0xFF,
    flagHelperByte: mem[(IY_BASE + FLAG_HELPER_OFFSET) & 0xFFFFFF] & 0xFF,
  };
}

function runIteration(env, index, scanCode) {
  const { mem, executor, cpu } = env;

  mem[GETCSC_SCAN_ADDR] = scanCode & 0xFF;
  prepareForCoorMon(cpu, mem);

  const pre = getNamedState(mem);
  const branchEvents = [];
  const missingBlocks = [];
  let previous = null;
  let hitDispatchStep = null;
  let hitHomeStep = null;

  const result = executor.runFrom(COORMON_ENTRY, 'adl', {
    maxSteps: COORMON_MAX_STEPS,
    maxLoopIterations: COORMON_MAX_LOOP_ITERATIONS,
    onBlock(pc, mode, meta, steps) {
      const blockPc = pc & 0xFFFFFF;
      appendConditionalEvent(branchEvents, previous, blockPc, mode, steps, cpu, mem);

      if (blockPc === COORMON_DISPATCH_AREA && hitDispatchStep === null) {
        hitDispatchStep = steps;
      }
      if (blockPc === HOME_HANDLER && hitHomeStep === null) {
        hitHomeStep = steps;
      }

      previous = {
        pc: blockPc,
        mode: mode ?? 'adl',
        meta,
      };
    },
    onMissingBlock(pc, mode, steps) {
      const blockPc = pc & 0xFFFFFF;
      appendConditionalEvent(branchEvents, previous, blockPc, mode, steps, cpu, mem);
      previous = null;
      missingBlocks.push({
        step: steps,
        pc: blockPc,
        mode: mode ?? 'adl',
      });
    },
  });

  appendConditionalEvent(
    branchEvents,
    previous,
    result.lastPc,
    result.lastMode ?? 'adl',
    result.steps,
    cpu,
    mem,
  );

  const post = getNamedState(mem);
  const gateEvents = branchEvents.filter((event) =>
    event.instructionPc === GATE_BRANCH_PC ||
    event.target === COORMON_DISPATCH_AREA ||
    event.nextPc === COORMON_DISPATCH_AREA
  );

  return {
    index,
    scanCode,
    pre,
    post,
    result,
    branchEvents,
    gateEvents,
    hitDispatchStep,
    hitHomeStep,
    missingBlocks,
  };
}

function formatFlagState(flags) {
  return `Z=${flags.z ? 1 : 0} NZ=${flags.nz ? 1 : 0} C=${flags.c ? 1 : 0} NC=${flags.nc ? 1 : 0}`;
}

function formatIYObservation(observation) {
  const sign = observation.offset >= 0 ? '+' : '';
  return `IY${sign}${observation.offset}@${hex(observation.addr)}=${hex8(observation.value)}`;
}

function formatOutcome(taken) {
  if (taken === true) {
    return 'TAKEN';
  }
  if (taken === false) {
    return 'NOT TAKEN';
  }
  return 'UNKNOWN';
}

function printIterationTable(runs) {
  const rows = [
    [
      'Iter',
      'Pre cxMain',
      'Pre ctx',
      'Pre IY+71',
      'Post IY+71',
      'Hit 08BF82',
      'Hit HOME',
      'Steps',
      'Termination',
      'Last PC',
    ],
    ...runs.map((run) => [
      String(run.index),
      hex(run.pre.cxMain),
      hex8(run.pre.context),
      hex8(run.pre.gateByte),
      hex8(run.post.gateByte),
      run.hitDispatchStep === null ? 'no' : `yes@${run.hitDispatchStep}`,
      run.hitHomeStep === null ? 'no' : `yes@${run.hitHomeStep}`,
      String(run.result.steps),
      run.result.termination,
      hex(run.result.lastPc),
    ]),
  ];

  console.log('\nIteration summary');
  console.log(formatTable(rows));
}

function printBranchTrace(run) {
  console.log(`\nConditional branch trace: iteration ${run.index} (ENTER ${hex8(run.scanCode)})`);
  if (run.branchEvents.length === 0) {
    console.log('  none');
    return;
  }

  for (const event of run.branchEvents) {
    const parts = [
      `next=${hex(event.nextPc)}`,
      `A=${hex8(event.a)}`,
      `F=${hex8(event.flags.f)}`,
      formatFlagState(event.flags),
    ];
    if (event.actualCondition !== null) {
      parts.push(`cond(${event.condition})=${event.actualCondition ? 1 : 0}`);
    }
    if (event.iyObservations.length > 0) {
      parts.push(event.iyObservations.map(formatIYObservation).join(', '));
    }

    const sourceNote = event.sourceBlockPc !== event.instructionPc
      ? ` block=${hex(event.sourceBlockPc)}`
      : '';

    console.log(
      `  [${String(event.step).padStart(5)}] ${hex(event.instructionPc)}${sourceNote} ` +
      `${event.dasm} -> ${formatOutcome(event.taken)} | ${parts.join(' | ')}`,
    );
  }
}

function printGateSummary(incomingGateEdges, runs) {
  console.log(`\nGate analysis for ${hex(COORMON_DISPATCH_AREA)}`);
  console.log(`  Static incoming edges to ${hex(COORMON_DISPATCH_AREA)}:`);
  for (const edge of incomingGateEdges) {
    const source = edge.sourceBlockPc === edge.instructionPc
      ? hex(edge.instructionPc)
      : `${hex(edge.sourceBlockPc)} -> ${hex(edge.instructionPc)}`;
    console.log(
      `    ${source} ${edge.dasm} [${edge.exitType}${edge.condition ? ` ${edge.condition}` : ''}]`,
    );
  }

  console.log(`  Meaning of the gate: ${hex(GATE_BRANCH_PC)} is \`jr z, ${hex(COORMON_DISPATCH_AREA)}\`.`);
  console.log(`  The executed lifted block is normally ${hex(GATE_SOURCE_BLOCK)}, which does:`);
  console.log(`    bit 1, (iy+${GATE_OFFSET})`);
  console.log(`    jr z, ${hex(COORMON_DISPATCH_AREA)}`);
  console.log('  So the dispatch area is reached only when bit 1 of (IY+71) is 0, making Z=1.');

  const gateEvents = runs.flatMap((run) => run.gateEvents.map((event) => ({
    iteration: run.index,
    event,
  })));

  if (gateEvents.length === 0) {
    console.log('  No dynamic gate evaluations were observed.');
    return;
  }

  console.log('  Dynamic gate evaluations:');
  for (const { iteration, event } of gateEvents) {
    const gateByte = event.iyObservations.find((observation) => observation.offset === GATE_OFFSET) ?? null;
    const gateBit = gateByte ? ((gateByte.value >> 1) & 1) : null;
    console.log(
      `    iter ${iteration} step ${event.step}: ${event.dasm} -> ${formatOutcome(event.taken)}; ` +
      `Z=${event.flags.z ? 1 : 0}; ` +
      `${gateByte ? `${formatIYObservation(gateByte)} bit1=${gateBit}` : 'IY+71 unavailable'}`,
    );
  }

  const reachedIterations = runs
    .filter((run) => run.hitDispatchStep !== null)
    .map((run) => String(run.index));
  console.log(
    `  Reached ${hex(COORMON_DISPATCH_AREA)} across five calls: ` +
    `${reachedIterations.length > 0 ? reachedIterations.join(', ') : 'never'}`,
  );
}

if (!fs.existsSync(ROM_PATH)) {
  throw new Error('ROM.rom is missing.');
}
if (!fs.existsSync(TRANSPILED_PATH)) {
  throw new Error('ROM.transpiled.js is missing.');
}

const romBytes = fs.readFileSync(ROM_PATH);
const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
const { decodeInstruction } = await import(pathToFileURL(DECODER_PATH).href);
const { PRELIFTED_BLOCKS } = await import(pathToFileURL(TRANSPILED_PATH).href);

const incomingGateEdges = findIncomingTransfers(PRELIFTED_BLOCKS, COORMON_DISPATCH_AREA);
const env = createBootedEnvironment(romBytes, createExecutor, createPeripheralBus, PRELIFTED_BLOCKS);
installHomeHandler(env.mem);

console.log('Phase 339: cxMain gate probe');
console.log('='.repeat(72));
console.log(`Boot:           steps=${env.boot.steps} termination=${env.boot.termination} lastPc=${hex(env.boot.lastPc)}`);
console.log(`Kernel init:    steps=${env.kernelInit.steps} termination=${env.kernelInit.termination} lastPc=${hex(env.kernelInit.lastPc)}`);
console.log(`CoorMon entry:  ${hex(COORMON_ENTRY)}`);
console.log(`GetCSC byte:    ${hex(GETCSC_SCAN_ADDR)} (seeded with ${hex8(ENTER_SCAN)} each iteration)`);
console.log(`cxMain ptr:     ${hex(CXMAIN_PTR)} -> ${hex(read24(env.mem, CXMAIN_PTR))}`);
console.log(`Home handler:   ${hex(HOME_HANDLER)}`);
console.log(`IY base:        ${hex(IY_BASE)}`);
console.log(`IY+71 address:  ${hex(IY_BASE + GATE_OFFSET)} (gate byte)`);
console.log(`IY+27 address:  ${hex(IY_BASE + RET_NZ_OFFSET)} (0x08BFA6 ret nz helper)`);
console.log(`IY+39 address:  ${hex(IY_BASE + FLAG_HELPER_OFFSET)} (0x055B8F ret nz helper)`);

printDisassemblyRange(
  `Disassembly: ${hex(KEY_HELPER_START)} through ${hex(KEY_HELPER_END)} (minimum 30 instructions)`,
  romBytes,
  decodeInstruction,
  KEY_HELPER_START,
  KEY_HELPER_END,
  30,
);

printDisassemblyRange(
  `Disassembly: ${hex(COORMON_KEY_PATH_START)} through ${hex(COORMON_KEY_PATH_END)}`,
  romBytes,
  decodeInstruction,
  COORMON_KEY_PATH_START,
  COORMON_KEY_PATH_END,
);

const runs = [];
for (let index = 1; index <= ITERATION_COUNT; index++) {
  runs.push(runIteration(env, index, ENTER_SCAN));
}

printIterationTable(runs);
for (const run of runs) {
  printBranchTrace(run);
}
printGateSummary(incomingGateEdges, runs);
