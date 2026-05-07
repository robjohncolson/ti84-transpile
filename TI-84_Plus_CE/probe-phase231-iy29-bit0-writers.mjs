#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const transpiledPath = path.join(__dirname, 'ROM.transpiled.js');
const transpiledGzipPath = `${transpiledPath}.gz`;
const romPath = path.join(__dirname, 'ROM.rom');

if (!existsSync(transpiledPath)) {
  throw new Error(
    existsSync(transpiledGzipPath)
      ? 'Gunzip ROM.transpiled.js.gz first so the probe can import ROM.transpiled.js.'
      : 'ROM.transpiled.js is missing.',
  );
}

if (!existsSync(romPath)) {
  throw new Error('ROM.rom is missing.');
}

const transpiledModule = await import('./ROM.transpiled.js');
const PRELIFTED_BLOCKS =
  transpiledModule.PRELIFTED_BLOCKS ??
  transpiledModule.default?.PRELIFTED_BLOCKS ??
  transpiledModule.default ??
  transpiledModule;

const BLOCKS = normalizeBlocks(PRELIFTED_BLOCKS);
const rom = readFileSync(romPath);

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const MEM_INIT_RET = 0x7FFFF6;

const STAGE_1_ENTRY = 0x0A2B72;
const STAGE_2_ENTRY = 0x0A3301;
const STAGE_3_ENTRY = 0x0A29EC;
const STAGE_4_ENTRY = 0x0A2854;

const TARGET_IY_OFFSET = 0x1D;
const IY_ADDR = 0xD00080;
const TARGET_ADDR = 0xD0009D;
const IX_ADDR = 0xD1A860;
const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const OS_MAX_LOOP_ITERATIONS = 8192;
const STAGE_MAX_LOOP_ITERATIONS = 500;
const SEGMENT_STEP_LIMIT = 2000;
const CONTEXT_RADIUS = 16;

const MANUAL_NOTES = new Map([
  [
    0x02FE9D,
    'Special-key mode-change path: sets the gate, then tests BIT 4,(IY+0) before deciding whether to skip the timer re-arm.',
  ],
  [
    0x02FEA7,
    'Special-key mode-change path: clears the gate and immediately calls 0x030300 on the BIT 4,(IY+0) fallthrough path.',
  ],
  [
    0x030300,
    'Helper at 0x030300: BIT 0,(IY+29) is the early-return guard before the timer setup path continues.',
  ],
  [
    0x040276,
    'Init/reset block: unconditional clear of the gate alongside several other IY-based state flags.',
  ],
]);

const PATTERN_SPECS = [
  {
    key: 'set0Iy29',
    label: 'SET 0,(IY+29)',
    scanType: 'exact',
    bytes: [0xFD, 0xCB, TARGET_IY_OFFSET, 0xC6],
    siteType: 'write-set-bit0',
  },
  {
    key: 'res0Iy29',
    label: 'RES 0,(IY+29)',
    scanType: 'exact',
    bytes: [0xFD, 0xCB, TARGET_IY_OFFSET, 0x86],
    siteType: 'write-clear-bit0',
  },
  {
    key: 'bit0Iy29',
    label: 'BIT 0,(IY+29)',
    scanType: 'exact',
    bytes: [0xFD, 0xCB, TARGET_IY_OFFSET, 0x46],
    siteType: 'read-test-bit0',
  },
  {
    key: 'ldIy29Imm8',
    label: 'LD (IY+29),imm8',
    scanType: 'prefix',
    prefix: [0xFD, 0x36, TARGET_IY_OFFSET],
    matchLength: 4,
    siteType: 'write-immediate',
  },
  {
    key: 'ldAbsD0009DA',
    label: 'LD (0xD0009D),A',
    scanType: 'exact',
    bytes: [0x32, 0x9D, 0x00, 0xD0],
    siteType: 'write-direct-a',
  },
  {
    key: 'ldAbsD0009DBC',
    label: 'LD (0xD0009D),BC',
    scanType: 'exact',
    bytes: [0xED, 0x43, 0x9D, 0x00, 0xD0],
    siteType: 'write-direct-bc',
  },
];

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const BLOCK_LIST = Object.values(BLOCKS);
const INCOMING_BY_TARGET = buildIncomingIndex(BLOCK_LIST);

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks
        .filter((block) => block?.id)
        .map((block) => [block.id, block]),
    );
  }

  return rawBlocks ?? {};
}

function buildIncomingIndex(blocks) {
  const index = new Map();

  for (const block of blocks) {
    for (const exit of block.exits ?? []) {
      if (typeof exit.target !== 'number') continue;
      const target = exit.target & 0xFFFFFF;
      const entries = index.get(target) ?? [];
      entries.push({ block, exit });
      index.set(target, entries);
    }
  }

  return index;
}

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
}

function write24(mem, addr, value) {
  const a = addr & MEM_MASK;
  mem[a] = value & 0xFF;
  mem[(a + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(a + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
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

function makeStop(name, pc) {
  const error = new Error('__PHASE231_STOP__');
  error.stopName = name;
  error.stopPc = pc & 0xFFFFFF;
  return error;
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpuForHomescreen(cpu, snapshot, mem) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = IY_ADDR;
  cpu._ix = IX_ADDR;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function resetCpuForOsCall(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._iy = IY_ADDR;
  cpu._ix = IX_ADDR;
  cpu._hl = 0;
  cpu._de = 0;
  cpu._bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function runStageInSegments(executor, entry, mode, totalMaxSteps, maxLoopIterations) {
  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastResult = { lastPc: currentPc, lastMode: currentMode, termination: null };

  while (totalSteps < totalMaxSteps) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, totalMaxSteps - totalSteps);
    const result = executor.runFrom(currentPc, currentMode, {
      maxSteps: segmentBudget,
      maxLoopIterations,
    });

    totalSteps += result.steps ?? 0;
    lastResult = result;
    currentPc = (result.lastPc ?? currentPc) & 0xFFFFFF;
    currentMode = result.lastMode ?? currentMode;

    if (result.termination !== 'max_steps') break;
  }

  return {
    steps: totalSteps,
    lastPc: lastResult.lastPc ?? currentPc,
    lastMode: lastResult.lastMode ?? currentMode,
    termination: lastResult.termination ?? null,
  };
}

function coldBoot(executor, cpu, mem) {
  const boot = runStageInSegments(executor, BOOT_ENTRY, 'z80', BOOT_MAX_STEPS, 32);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = runStageInSegments(
    executor,
    KERNEL_INIT_ENTRY,
    'adl',
    KERNEL_INIT_MAX_STEPS,
    10000,
  );

  cpu.mbase = MBASE;
  cpu._iy = IY_ADDR;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = runStageInSegments(executor, POST_INIT_ENTRY, 'adl', POST_INIT_MAX_STEPS, 32);

  return {
    boot: { steps: boot.steps, lastPc: hex(boot.lastPc), termination: boot.termination },
    kernelInit: {
      steps: kernelInit.steps,
      lastPc: hex(kernelInit.lastPc),
      termination: kernelInit.termination,
    },
    postInit: { steps: postInit.steps, lastPc: hex(postInit.lastPc), termination: postInit.termination },
  };
}

function runTraceSegmented(executor, entry, mode, options = {}) {
  const sentinels = options.sentinels ?? new Map();
  const totalMaxSteps = options.totalMaxSteps ?? MEM_INIT_MAX_STEPS;
  const maxLoopIterations = options.maxLoopIterations ?? OS_MAX_LOOP_ITERATIONS;

  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastPc = currentPc;
  let lastMode = currentMode;
  let termination = null;
  let hitSentinel = null;
  let errorMessage = null;

  while (totalSteps < totalMaxSteps && !hitSentinel) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, totalMaxSteps - totalSteps);
    let segmentObservedSteps = 0;

    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations,
        onBlock(pc, dispatchMode, meta, step) {
          const normalized = pc & 0xFFFFFF;
          segmentObservedSteps = Math.max(segmentObservedSteps, (step ?? 0) + 1);
          lastPc = normalized;
          lastMode = dispatchMode ?? lastMode;
          if (sentinels.has(normalized)) throw makeStop(sentinels.get(normalized), normalized);
        },
        onMissingBlock(pc, dispatchMode, step) {
          const normalized = pc & 0xFFFFFF;
          segmentObservedSteps = Math.max(segmentObservedSteps, (step ?? 0) + 1);
          lastPc = normalized;
          lastMode = dispatchMode ?? lastMode;
          if (sentinels.has(normalized)) throw makeStop(sentinels.get(normalized), normalized);
        },
      });

      totalSteps += result.steps ?? segmentObservedSteps;
      lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
      lastMode = result.lastMode ?? lastMode;
      currentPc = lastPc;
      currentMode = lastMode;
      termination = result.termination ?? null;

      if (termination !== 'max_steps') break;
    } catch (error) {
      totalSteps += segmentObservedSteps;

      if (error?.message === '__PHASE231_STOP__') {
        hitSentinel = { name: error.stopName, pc: hex(error.stopPc) };
        termination = 'sentinel';
        break;
      }

      errorMessage = error?.stack ?? String(error);
      termination = 'exception';
      break;
    }
  }

  if (!hitSentinel && termination === 'max_steps' && totalSteps >= totalMaxSteps) {
    termination = 'step_limit';
  }

  return {
    steps: totalSteps,
    lastPc,
    lastMode,
    termination,
    hitSentinel,
    errorMessage: errorMessage ? errorMessage.split('\n')[0] : null,
  };
}

function runMemInit(executor, cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);
  mem[0xD008DF] = 0x00;

  return runTraceSegmented(executor, MEM_INIT_ENTRY, 'adl', {
    totalMaxSteps: MEM_INIT_MAX_STEPS,
    maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
    sentinels: new Map([[MEM_INIT_RET, 'mem_init_return']]),
  });
}

function runHomescreenStages(executor, cpu, mem, cpuSnapshot) {
  const stages = [];

  restoreCpuForHomescreen(cpu, cpuSnapshot, mem);
  const stage1 = runStageInSegments(executor, STAGE_1_ENTRY, 'adl', 30000, STAGE_MAX_LOOP_ITERATIONS);
  stages.push({
    label: 'stage1_statusbar',
    entry: hex(STAGE_1_ENTRY),
    steps: stage1.steps,
    lastPc: hex(stage1.lastPc),
    termination: stage1.termination,
  });

  restoreCpuForHomescreen(cpu, cpuSnapshot, mem);
  mem[0xD0009B] &= ~0x40;
  const stage2 = runStageInSegments(executor, STAGE_2_ENTRY, 'adl', 30000, STAGE_MAX_LOOP_ITERATIONS);
  stages.push({
    label: 'stage2_statusdots',
    entry: hex(STAGE_2_ENTRY),
    steps: stage2.steps,
    lastPc: hex(stage2.lastPc),
    termination: stage2.termination,
  });

  restoreCpuForHomescreen(cpu, cpuSnapshot, mem);
  const stage3 = runStageInSegments(executor, STAGE_3_ENTRY, 'adl', 50000, STAGE_MAX_LOOP_ITERATIONS);
  stages.push({
    label: 'stage3_homerow',
    entry: hex(STAGE_3_ENTRY),
    steps: stage3.steps,
    lastPc: hex(stage3.lastPc),
    termination: stage3.termination,
  });

  restoreCpuForHomescreen(cpu, cpuSnapshot, mem);
  const stage4 = runStageInSegments(executor, STAGE_4_ENTRY, 'adl', 50000, STAGE_MAX_LOOP_ITERATIONS);
  stages.push({
    label: 'stage4_history',
    entry: hex(STAGE_4_ENTRY),
    steps: stage4.steps,
    lastPc: hex(stage4.lastPc),
    termination: stage4.termination,
  });

  return stages;
}

function runBootValueCheck() {
  const mem = createMemoryWithRom();
  const { executor, cpu } = createRuntime(mem);

  const boot = coldBoot(executor, cpu, mem);
  const memInit = runMemInit(executor, cpu, mem);
  const cpuSnapshot = snapshotCpu(cpu);
  const homescreenStages = runHomescreenStages(executor, cpu, mem, cpuSnapshot);

  const value = mem[TARGET_ADDR] & 0xFF;

  return {
    boot,
    memInit: {
      steps: memInit.steps,
      lastPc: hex(memInit.lastPc),
      lastMode: memInit.lastMode,
      termination: memInit.termination,
      hitSentinel: memInit.hitSentinel,
      errorMessage: memInit.errorMessage,
    },
    homescreenStages,
    targetByte: {
      address: hex(TARGET_ADDR),
      value: hexByte(value),
      bit0: Boolean(value & 0x01),
      binary: value.toString(2).padStart(8, '0'),
    },
  };
}

function matchBytes(buffer, address, pattern) {
  if (address < 0 || address + pattern.length > buffer.length) return false;

  for (let index = 0; index < pattern.length; index += 1) {
    if (buffer[address + index] !== pattern[index]) return false;
  }

  return true;
}

function surroundingBytes(address, matchLength, radius = CONTEXT_RADIUS) {
  const start = Math.max(0, address - radius);
  const end = Math.min(rom.length, address + matchLength + radius);
  return {
    start: hex(start),
    end: hex(end - 1),
    bytes: bytesToHex(rom.subarray(start, end)),
  };
}

function findContainingBlocks(targetPc) {
  const matches = [];

  for (const block of BLOCK_LIST) {
    const instructions = block.instructions ?? [];
    const instructionIndex = instructions.findIndex(
      (instruction) => ((instruction.pc ?? -1) & 0xFFFFFF) === targetPc,
    );

    if (instructionIndex === -1) continue;

    matches.push({
      block,
      instructionIndex,
      contextScore:
        Math.min(4, instructionIndex) +
        1 +
        Math.min(4, Math.max(0, instructions.length - instructionIndex - 1)),
    });
  }

  matches.sort((left, right) => {
    if (right.contextScore !== left.contextScore) return right.contextScore - left.contextScore;
    return (left.block.startPc & 0xFFFFFF) - (right.block.startPc & 0xFFFFFF);
  });

  return matches;
}

function renderInstructionWindow(match, radius = 4) {
  const instructions = match.block.instructions ?? [];
  const start = Math.max(0, match.instructionIndex - radius);
  const end = Math.min(instructions.length, match.instructionIndex + radius + 1);

  return instructions.slice(start, end).map((instruction, index) => ({
    pc: hex(instruction.pc),
    dasm: String(instruction.dasm ?? ''),
    current: start + index === match.instructionIndex,
  }));
}

function renderExitSummary(exits = []) {
  return exits.map((exit) => {
    if (exit.type === 'fallthrough') {
      return `fallthrough -> ${hex(exit.target)}`;
    }

    if (exit.type === 'branch') {
      return `branch ${String(exit.condition).toUpperCase()} -> ${hex(exit.target)}`;
    }

    if (exit.type === 'return-conditional') {
      return `ret ${String(exit.condition).toUpperCase()}`;
    }

    if (exit.type === 'call') {
      return `call -> ${hex(exit.target)}`;
    }

    if (exit.type === 'call-return') {
      return `call-return -> ${hex(exit.target)}`;
    }

    if (typeof exit.target === 'number') {
      return `${exit.type} -> ${hex(exit.target)}`;
    }

    return String(exit.type);
  });
}

function conditionMet(condition) {
  switch (condition) {
    case 'z': return 'Z=1';
    case 'nz': return 'Z=0';
    case 'c': return 'C=1';
    case 'nc': return 'C=0';
    case 'm': return 'S=1';
    case 'p': return 'S=0';
    case 'pe': return 'PV=1';
    case 'po': return 'PV=0';
    default: return String(condition).toUpperCase();
  }
}

function conditionNotMet(condition) {
  switch (condition) {
    case 'z': return 'Z=0';
    case 'nz': return 'Z=1';
    case 'c': return 'C=0';
    case 'nc': return 'C=1';
    case 'm': return 'S=0';
    case 'p': return 'S=1';
    case 'pe': return 'PV=0';
    case 'po': return 'PV=1';
    default: return `not ${String(condition).toUpperCase()}`;
  }
}

function findIncomingPaths(targetPc) {
  const entries = INCOMING_BY_TARGET.get(targetPc) ?? [];
  const rendered = [];
  const seen = new Set();

  for (const entry of entries) {
    const key = `${entry.block.id}:${entry.exit.type}:${entry.exit.condition ?? ''}:${entry.exit.target ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const lastInstructions = (entry.block.instructions ?? [])
      .slice(-3)
      .map((instruction) => `${hex(instruction.pc)} ${String(instruction.dasm ?? '')}`);

    let pathSummary = `${entry.exit.type} from ${hex(entry.block.startPc)}`;
    if (entry.exit.type === 'branch') {
      pathSummary = `branch taken when ${conditionMet(entry.exit.condition)} from ${hex(entry.block.startPc)}`;
    } else if (entry.exit.type === 'fallthrough') {
      const branchExit = (entry.block.exits ?? []).find((exit) => exit.type === 'branch' && typeof exit.condition === 'string');
      if (branchExit) {
        pathSummary = `fallthrough when ${conditionNotMet(branchExit.condition)} from ${hex(entry.block.startPc)}`;
      } else {
        pathSummary = `fallthrough from ${hex(entry.block.startPc)}`;
      }
    } else if (entry.exit.type === 'call-return') {
      pathSummary = `returns to ${hex(entry.exit.target)} after call from ${hex(entry.block.startPc)}`;
    }

    rendered.push({
      blockStart: hex(entry.block.startPc),
      blockId: entry.block.id,
      exitType: entry.exit.type,
      condition: entry.exit.condition ?? null,
      target: typeof entry.exit.target === 'number' ? hex(entry.exit.target) : null,
      pathSummary,
      lastInstructions,
    });
  }

  rendered.sort((left, right) => parseInt(left.blockStart.slice(2), 16) - parseInt(right.blockStart.slice(2), 16));
  return rendered;
}

function guessRoutineAnchor(targetPc) {
  const pending = [targetPc];
  const seenTargets = new Set();
  let best = targetPc;

  while (pending.length > 0) {
    const currentTarget = pending.shift();
    if (seenTargets.has(currentTarget)) continue;
    seenTargets.add(currentTarget);

    for (const incoming of findIncomingPaths(currentTarget)) {
      const blockStart = parseInt(incoming.blockStart.slice(2), 16);
      const delta = currentTarget - blockStart;
      if (delta < 0 || delta > 0x40) continue;
      if (blockStart < best) best = blockStart;
      pending.push(blockStart);
    }
  }

  for (const match of findContainingBlocks(targetPc)) {
    const blockStart = match.block.startPc & 0xFFFFFF;
    const delta = targetPc - blockStart;
    if (delta >= 0 && delta <= 0x40 && blockStart < best) {
      best = blockStart;
    }
  }

  return best;
}

function summarizeSite(siteType, address, primaryMatch, incomingPaths) {
  const parts = [];
  const routineAnchor = guessRoutineAnchor(address);
  parts.push(`routine near ${hex(routineAnchor)}`);

  if (MANUAL_NOTES.has(address)) {
    parts.push(MANUAL_NOTES.get(address));
  }

  const localWindow = renderInstructionWindow(primaryMatch);
  const currentIndex = localWindow.findIndex((entry) => entry.current);
  const following = localWindow
    .slice(currentIndex + 1, currentIndex + 3)
    .map((entry) => entry.dasm);

  if (siteType === 'write-set-bit0') {
    parts.push('sets bit 0 of the gate byte');
  } else if (siteType === 'write-clear-bit0') {
    parts.push('clears bit 0 of the gate byte');
  } else if (siteType === 'read-test-bit0') {
    parts.push('tests bit 0 of the gate byte');
  } else if (siteType === 'write-immediate') {
    parts.push('writes an immediate byte to the gate byte');
  } else if (siteType === 'write-direct-a') {
    parts.push('writes A directly to 0xD0009D');
  } else if (siteType === 'write-direct-bc') {
    parts.push('writes BC directly to 0xD0009D');
  }

  if (following.length > 0) {
    parts.push(`local flow: ${following.join(' -> ')}`);
  }

  if (incomingPaths.length > 0) {
    parts.push(`incoming: ${incomingPaths[0].pathSummary}`);
  }

  return parts.join('; ');
}

function classifyMatch(spec, address, matchLength, extra = {}) {
  const containingMatches = findContainingBlocks(address);
  const primaryMatch = containingMatches[0] ?? null;
  const incomingPaths = findIncomingPaths(address);
  const routineAnchor = guessRoutineAnchor(address);

  const site = {
    romAddress: hex(address),
    type: spec.siteType,
    instruction: extra.instruction ?? spec.label,
    opcodeBytes: bytesToHex(rom.subarray(address, address + matchLength)),
    routineAnchorGuess: hex(routineAnchor),
    primaryBlockStart: primaryMatch ? hex(primaryMatch.block.startPc) : null,
    containingBlockStarts: containingMatches.map((match) => hex(match.block.startPc)),
    localDisassembly: primaryMatch ? renderInstructionWindow(primaryMatch) : [],
    exitSummary: primaryMatch ? renderExitSummary(primaryMatch.block.exits ?? []) : [],
    incomingPaths,
    rawContext: surroundingBytes(address, matchLength, CONTEXT_RADIUS),
  };

  if (extra.immediate !== undefined) {
    site.immediate = hexByte(extra.immediate);
  }

  site.summary = primaryMatch
    ? summarizeSite(spec.siteType, address, primaryMatch, incomingPaths)
    : `no PRELIFTED_BLOCKS instruction metadata found near ${hex(address)}`;

  return site;
}

function scanExact(spec) {
  const pattern = spec.bytes;
  const matches = [];

  for (let address = 0; address <= rom.length - pattern.length; address += 1) {
    if (!matchBytes(rom, address, pattern)) continue;
    matches.push(classifyMatch(spec, address, pattern.length));
  }

  return matches;
}

function scanPrefix(spec) {
  const matches = [];

  for (let address = 0; address <= rom.length - spec.matchLength; address += 1) {
    if (!matchBytes(rom, address, spec.prefix)) continue;
    const immediate = rom[address + spec.matchLength - 1];
    matches.push(
      classifyMatch(spec, address, spec.matchLength, {
        immediate,
        instruction: `LD (IY+29),${hexByte(immediate)}`,
      }),
    );
  }

  return matches;
}

function runStaticScan() {
  const sites = {};

  for (const spec of PATTERN_SPECS) {
    sites[spec.key] = spec.scanType === 'prefix' ? scanPrefix(spec) : scanExact(spec);
  }

  const writeSites = [
    ...sites.set0Iy29,
    ...sites.res0Iy29,
    ...sites.ldIy29Imm8,
    ...sites.ldAbsD0009DA,
    ...sites.ldAbsD0009DBC,
  ].sort((left, right) => parseInt(left.romAddress.slice(2), 16) - parseInt(right.romAddress.slice(2), 16));

  const readSites = [...sites.bit0Iy29]
    .sort((left, right) => parseInt(left.romAddress.slice(2), 16) - parseInt(right.romAddress.slice(2), 16));

  return {
    counts: {
      set0Iy29: sites.set0Iy29.length,
      res0Iy29: sites.res0Iy29.length,
      bit0Iy29: sites.bit0Iy29.length,
      ldIy29Imm8: sites.ldIy29Imm8.length,
      directLdD0009DA: sites.ldAbsD0009DA.length,
      directLdD0009DBC: sites.ldAbsD0009DBC.length,
      totalWriteSites: writeSites.length,
      totalReadSites: readSites.length,
    },
    siteAddresses: {
      set0Iy29: sites.set0Iy29.map((site) => site.romAddress),
      res0Iy29: sites.res0Iy29.map((site) => site.romAddress),
      bit0Iy29: sites.bit0Iy29.map((site) => site.romAddress),
      ldIy29Imm8: sites.ldIy29Imm8.map((site) => site.romAddress),
      directLdD0009DA: sites.ldAbsD0009DA.map((site) => site.romAddress),
      directLdD0009DBC: sites.ldAbsD0009DBC.map((site) => site.romAddress),
    },
    writeSites,
    readSites,
  };
}

function main() {
  const staticScan = runStaticScan();
  const bootCheck = runBootValueCheck();

  console.log(JSON.stringify({
    probe: 'probe-phase231-iy29-bit0-writers.mjs',
    generatedAt: new Date().toISOString(),
    target: {
      iyBase: hex(IY_ADDR),
      offset: hex(TARGET_IY_OFFSET, 2),
      address: hex(TARGET_ADDR),
    },
    staticScan,
    bootCheck,
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.log(JSON.stringify({
    probe: 'probe-phase231-iy29-bit0-writers.mjs',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
