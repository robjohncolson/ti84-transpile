#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as cpuRuntime from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MEM_SIZE = 0x1000000;
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const INC_PATH = path.join(__dirname, 'references', 'ti84pceg.inc');

const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;
const STACK_TOP = 0xD1A87E;
const IY_PLUS_68_ADDR = 0xD000C4;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

const HOME_COPY9_ENTRY = 0x0584A3;
const COPY9_ENTRY = 0x07F9FB;
const AFTER_COPY9_ENTRY = 0x0584A7;
const KEY_CLASSIFIER_ENTRY = 0x07F7BD;
const BIT5_HELPER_CALL_ENTRY = 0x0584C1;
const BIT5_HELPER_ENTRY = 0x0800B8;
const BIT5_BRANCH_ENTRY = 0x0584C5;
const BIT5_BRANCH_Z_TARGET = 0x058514;
const BIT5_BRANCH_FALLTHROUGH = 0x0584C7;
const DIRECT_082C50_AFTER_BRANCH = 0x0584CB;
const CALL_09927F_ENTRY = 0x09927F;
const CALL_082C50_ENTRY = 0x082C50;
const POST_ERROR_BRANCH_ENTRY = 0x058518;
const BUFINSERT_CALLER_ENTRY = 0x05851C;
const BUFINSERT_ENTRY = 0x05E2A0;
const JERROR_DISPATCH_ENTRY = 0x061D42;
const JERROR_RET_BUG_ENTRY = 0x03E1B1;

const TOKEN_STAGING_ADDR = 0xD0230E;
const OP1_ADDR = 0xD005F8;
const TOKEN_LENGTH = 9;
const DIGIT_4_TOKEN_SEED = Uint8Array.from([0x00, 0x34, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);

const MEMINIT_RET = 0x7FFFF6;
const TRACE_RET = 0x7FFFF0;

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const TRACE_MAX_STEPS = 500;
const OS_MAX_LOOP_ITERATIONS = 8192;
const TRACE_STACK_DEPTH = 16;
const HIT_LIMIT = 8;

const MONITORED_BLOCKS = new Map([
  [HOME_COPY9_ENTRY, 'homeCopy9'],
  [COPY9_ENTRY, 'copy9'],
  [AFTER_COPY9_ENTRY, 'afterCopy9'],
  [KEY_CLASSIFIER_ENTRY, 'keyClassifier'],
  [BIT5_HELPER_CALL_ENTRY, 'bit5HelperCall'],
  [BIT5_HELPER_ENTRY, 'bit5Helper'],
  [BIT5_BRANCH_ENTRY, 'bit5Branch'],
  [BIT5_BRANCH_Z_TARGET, 'bit5BranchZTarget'],
  [BIT5_BRANCH_FALLTHROUGH, 'bit5BranchFallthrough'],
  [CALL_09927F_ENTRY, 'call09927f'],
  [CALL_082C50_ENTRY, 'call082c50'],
  [DIRECT_082C50_AFTER_BRANCH, 'afterDirect082c50'],
  [POST_ERROR_BRANCH_ENTRY, 'postErrorBranch'],
  [BUFINSERT_CALLER_ENTRY, 'bufInsertCaller'],
  [BUFINSERT_ENTRY, 'bufInsert'],
  [JERROR_DISPATCH_ENTRY, 'jErrorDispatch'],
  [JERROR_RET_BUG_ENTRY, 'jErrorRetBug'],
  [BOOT_ENTRY, 'bootVector'],
]);

if (!fs.existsSync(TRANSPILED_PATH)) {
  throw new Error(
    'Missing TI-84_Plus_CE/ROM.transpiled.js. Run node scripts/transpile-ti84-rom.mjs first.',
  );
}

const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xFF, 2);
}

function cap(list, value, limit = HIT_LIMIT) {
  if (list.length < limit) list.push(value);
}

function bytesToHexArray(mem, start, length) {
  return Array.from(mem.slice(start, start + length), (value) => hexByte(value));
}

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[a + 1] = (value >>> 8) & 0xFF;
  mem[a + 2] = (value >>> 16) & 0xFF;
}

function decodeByte(value) {
  const byte = value & 0xFF;
  return {
    value: hexByte(byte),
    binary: byte.toString(2).padStart(8, '0'),
    bits: {
      bit7: Boolean(byte & 0x80),
      bit6: Boolean(byte & 0x40),
      bit5: Boolean(byte & 0x20),
      bit4: Boolean(byte & 0x10),
      bit3: Boolean(byte & 0x08),
      bit2: Boolean(byte & 0x04),
      bit1: Boolean(byte & 0x02),
      bit0: Boolean(byte & 0x01),
    },
  };
}

function decodeFlags(f) {
  const flags = f & 0xFF;
  return {
    f: hexByte(flags),
    s: Boolean(flags & 0x80),
    z: Boolean(flags & 0x40),
    h: Boolean(flags & 0x10),
    pv: Boolean(flags & 0x04),
    n: Boolean(flags & 0x02),
    c: Boolean(flags & 0x01),
  };
}

function createMemory() {
  return new Uint8Array(MEM_SIZE);
}

function loadROM(mem, romPath = ROM_PATH) {
  const romBytes = fs.readFileSync(romPath);
  mem.set(romBytes.subarray(0, Math.min(mem.length, romBytes.length)));
  return romBytes.length;
}

function makeSentinelError(hit, pc) {
  const error = new Error('__PHASE200_SENTINEL__');
  error.isSentinel = true;
  error.hit = hit;
  error.pc = pc & 0xFFFFFF;
  return error;
}

function runUntilHit(executor, entry, mode, sentinels, maxSteps, maxLoopIterations, handlers = {}) {
  let steps = 0;
  let lastPc = entry & 0xFFFFFF;
  let lastMode = mode;

  try {
    const result = executor.runFrom(entry, mode, {
      maxSteps,
      maxLoopIterations,
      onBlock(pc, blockMode, meta, step) {
        lastPc = pc & 0xFFFFFF;
        lastMode = blockMode ?? lastMode;
        steps = Math.max(steps, (step ?? 0) + 1);
        if (handlers.onBlock) handlers.onBlock(pc, blockMode, meta, step);
        for (const [name, target] of Object.entries(sentinels)) {
          if (lastPc === target) throw makeSentinelError(name, lastPc);
        }
      },
      onMissingBlock(pc, blockMode, step) {
        lastPc = pc & 0xFFFFFF;
        lastMode = blockMode ?? lastMode;
        steps = Math.max(steps, (step ?? 0) + 1);
        if (handlers.onMissingBlock) handlers.onMissingBlock(pc, blockMode, step);
        for (const [name, target] of Object.entries(sentinels)) {
          if (lastPc === target) throw makeSentinelError(name, lastPc);
        }
      },
    });

    return {
      hit: null,
      steps: Math.max(steps, result.steps ?? 0),
      lastPc: (result.lastPc ?? lastPc) & 0xFFFFFF,
      lastMode: result.lastMode ?? lastMode,
      termination: result.termination ?? null,
      errorMessage: result.error ? (result.error.stack || String(result.error)) : null,
    };
  } catch (error) {
    if (error?.isSentinel) {
      return {
        hit: error.hit,
        steps,
        lastPc: error.pc,
        lastMode,
        termination: 'sentinel',
        errorMessage: null,
      };
    }

    return {
      hit: null,
      steps,
      lastPc,
      lastMode,
      termination: 'exception',
      errorMessage: error?.stack || String(error),
    };
  }
}

function resetOsState(cpu, mem, stackTop = STACK_TOP) {
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
  cpu.sp = stackTop;
  mem.fill(0xFF, Math.max(0, stackTop - 0x60), Math.min(mem.length, stackTop + 0x20));
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
    boot: { steps: boot.steps, termination: boot.termination, lastPc: hex(boot.lastPc) },
    kernelInit: {
      steps: kernelInit.steps,
      termination: kernelInit.termination,
      lastPc: hex(kernelInit.lastPc),
    },
    postInit: {
      steps: postInit.steps,
      termination: postInit.termination,
      lastPc: hex(postInit.lastPc),
    },
  };
}

function runMemInit(executor, cpu, mem) {
  resetOsState(cpu, mem, STACK_TOP);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  return runUntilHit(
    executor,
    MEM_INIT_ENTRY,
    'adl',
    { ret: MEMINIT_RET },
    MEM_INIT_MAX_STEPS,
    OS_MAX_LOOP_ITERATIONS,
  );
}

function createCPU(mem, peripherals) {
  const executor = cpuRuntime.createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  cpu.memInit = () => runMemInit(executor, cpu, mem);
  return { cpu, executor };
}

function createBaseline() {
  const mem = createMemory();
  const romBytesLoaded = loadROM(mem, ROM_PATH);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const { cpu, executor } = createCPU(mem, peripherals);

  cpu.mbase = MBASE;
  const boot = coldBoot(executor, cpu, mem);
  const memInit = cpu.memInit();

  return {
    romBytesLoaded,
    boot,
    memInit: {
      hit: memInit.hit,
      steps: memInit.steps,
      termination: memInit.termination,
      lastPc: hex(memInit.lastPc),
      errorMessage: memInit.errorMessage,
    },
    iyPlus68AfterMemInit: decodeByte(mem[IY_PLUS_68_ADDR]),
    baselineMem: new Uint8Array(mem),
  };
}

function createExperimentEnv(baselineMem) {
  const mem = new Uint8Array(baselineMem);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const { cpu, executor } = createCPU(mem, peripherals);
  return { mem, cpu, executor };
}

function pushSentinelChain(mem, cpu, depth = TRACE_STACK_DEPTH) {
  for (let index = 0; index < depth; index += 1) {
    cpu.sp -= 3;
    write24(mem, cpu.sp, TRACE_RET);
  }
}

function createTraceState() {
  const monitoredHits = {};
  for (const label of MONITORED_BLOCKS.values()) {
    monitoredHits[label] = [];
  }

  return {
    blockSequence: [],
    uniqueBlocks: [],
    uniqueBlockSet: new Set(),
    missingBlocks: [],
    missingBlockSet: new Set(),
    monitoredHits,
  };
}

function noteTrace(state, cpu, mem, pc, step, missing) {
  const normalizedPc = pc & 0xFFFFFF;
  const renderedPc = hex(normalizedPc);

  if (missing) {
    if (!state.missingBlockSet.has(renderedPc)) {
      state.missingBlockSet.add(renderedPc);
      state.missingBlocks.push(renderedPc);
    }
    return;
  }

  state.blockSequence.push(renderedPc);
  if (!state.uniqueBlockSet.has(renderedPc)) {
    state.uniqueBlockSet.add(renderedPc);
    state.uniqueBlocks.push(renderedPc);
  }

  const label = MONITORED_BLOCKS.get(normalizedPc);
  if (!label) return;

  cap(state.monitoredHits[label], {
    step: (step ?? 0) + 1,
    pc: renderedPc,
    a: hexByte(cpu.a),
    hl: hex(cpu.hl),
    de: hex(cpu.de),
    bc: hex(cpu.bc),
    sp: hex(cpu.sp),
    iyPlus68: hexByte(mem[IY_PLUS_68_ADDR]),
    flags: decodeFlags(cpu.f),
  });
}

function nextAfter(sequence, sourcePc) {
  const renderedSource = hex(sourcePc);
  for (let index = 0; index < sequence.length - 1; index += 1) {
    if (sequence[index] === renderedSource) {
      return sequence[index + 1];
    }
  }
  return null;
}

function makeReachability(sequence) {
  const visited = new Set(sequence);
  return {
    copy9: visited.has(hex(COPY9_ENTRY)),
    keyClassifier: visited.has(hex(KEY_CLASSIFIER_ENTRY)),
    bit5HelperCall: visited.has(hex(BIT5_HELPER_CALL_ENTRY)),
    bit5Helper: visited.has(hex(BIT5_HELPER_ENTRY)),
    zPath058514: visited.has(hex(BIT5_BRANCH_Z_TARGET)),
    direct082c50Path0584c7: visited.has(hex(BIT5_BRANCH_FALLTHROUGH)),
    call09927f: visited.has(hex(CALL_09927F_ENTRY)),
    call082c50: visited.has(hex(CALL_082C50_ENTRY)),
    afterDirect082c50: visited.has(hex(DIRECT_082C50_AFTER_BRANCH)),
    postErrorBranch058518: visited.has(hex(POST_ERROR_BRANCH_ENTRY)),
    bufInsertCaller05851c: visited.has(hex(BUFINSERT_CALLER_ENTRY)),
    bufInsert: visited.has(hex(BUFINSERT_ENTRY)),
    jErrorDispatch: visited.has(hex(JERROR_DISPATCH_ENTRY)),
    jErrorRetBug: visited.has(hex(JERROR_RET_BUG_ENTRY)),
    bootVector: visited.has(hex(BOOT_ENTRY)),
  };
}

function buildBranchSummary(state) {
  const bit5BranchHit = state.monitoredHits.bit5Branch[0] ?? null;
  const postErrorBranchHit = state.monitoredHits.postErrorBranch[0] ?? null;
  const nextFrom0584c5 = nextAfter(state.blockSequence, BIT5_BRANCH_ENTRY);
  const nextFrom058518 = nextAfter(state.blockSequence, POST_ERROR_BRANCH_ENTRY);

  return {
    at0584c5: {
      flagsOnEntry: bit5BranchHit?.flags ?? null,
      nextBlock: nextFrom0584c5,
      jrZTaken: nextFrom0584c5 === hex(BIT5_BRANCH_Z_TARGET),
      fellThroughTo0584c7: nextFrom0584c5 === hex(BIT5_BRANCH_FALLTHROUGH),
    },
    at058518: {
      flagsOnEntry: postErrorBranchHit?.flags ?? null,
      nextBlock: nextFrom058518,
      carryBranchTakenToJError: nextFrom058518 === hex(JERROR_DISPATCH_ENTRY),
      fellThroughToBufInsertCaller: nextFrom058518 === hex(BUFINSERT_CALLER_ENTRY),
    },
  };
}

function prepareTokenDispatch(cpu, mem) {
  resetOsState(cpu, mem, STACK_TOP);
  mem.fill(0x00, TOKEN_STAGING_ADDR, TOKEN_STAGING_ADDR + TOKEN_LENGTH);
  mem.set(DIGIT_4_TOKEN_SEED, TOKEN_STAGING_ADDR);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + TOKEN_LENGTH);
  cpu.hl = TOKEN_STAGING_ADDR;
  cpu.sp = STACK_TOP;
  pushSentinelChain(mem, cpu);
}

function runDispatchExperiment(id, baselineMem, forceBit5Set) {
  const { mem, cpu, executor } = createExperimentEnv(baselineMem);
  const state = createTraceState();

  prepareTokenDispatch(cpu, mem);

  const iyPlus68BeforeSetup = mem[IY_PLUS_68_ADDR] & 0xFF;
  if (forceBit5Set) {
    mem[IY_PLUS_68_ADDR] = iyPlus68BeforeSetup | 0x20;
  }
  const iyPlus68AfterSetup = mem[IY_PLUS_68_ADDR] & 0xFF;

  const trace = runUntilHit(
    executor,
    HOME_COPY9_ENTRY,
    'adl',
    { ret: TRACE_RET },
    TRACE_MAX_STEPS,
    OS_MAX_LOOP_ITERATIONS,
    {
      onBlock(pc, _mode, _meta, step) {
        noteTrace(state, cpu, mem, pc, step, false);
      },
      onMissingBlock(pc, _mode, step) {
        noteTrace(state, cpu, mem, pc, step, true);
      },
    },
  );

  return {
    id,
    entry: hex(HOME_COPY9_ENTRY),
    stepLimit: TRACE_MAX_STEPS,
    iyPlus68: {
      address: hex(IY_PLUS_68_ADDR),
      beforeSetup: decodeByte(iyPlus68BeforeSetup),
      afterSetup: decodeByte(iyPlus68AfterSetup),
      afterRun: decodeByte(mem[IY_PLUS_68_ADDR]),
      forcedBit5Set: forceBit5Set,
    },
    tokenStaging: {
      address: hex(TOKEN_STAGING_ADDR),
      bytes: bytesToHexArray(mem, TOKEN_STAGING_ADDR, TOKEN_LENGTH),
    },
    op1: {
      address: hex(OP1_ADDR),
      bytes: bytesToHexArray(mem, OP1_ADDR, TOKEN_LENGTH),
    },
    trace: {
      steps: trace.steps,
      termination: trace.hit === 'ret' ? 'sentinel_return' : (trace.termination ?? 'unknown'),
      finalPc: hex(trace.lastPc),
      finalMode: trace.lastMode,
      blocksVisited: state.blockSequence,
      uniqueBlocks: state.uniqueBlocks,
      missingBlocks: state.missingBlocks,
    },
    decisions: buildBranchSummary(state),
    reached: makeReachability(state.blockSequence),
    monitoredHits: state.monitoredHits,
    errorMessage: trace.errorMessage,
  };
}

function runDirectHelperExperiment(baselineMem) {
  const { mem, cpu, executor } = createExperimentEnv(baselineMem);
  const state = createTraceState();

  resetOsState(cpu, mem, STACK_TOP);
  const iyPlus68BeforeSetup = mem[IY_PLUS_68_ADDR] & 0xFF;
  mem[IY_PLUS_68_ADDR] = iyPlus68BeforeSetup | 0x20;
  cpu.sp = STACK_TOP;
  pushSentinelChain(mem, cpu, 4);

  const trace = runUntilHit(
    executor,
    BIT5_HELPER_ENTRY,
    'adl',
    { ret: TRACE_RET },
    TRACE_MAX_STEPS,
    OS_MAX_LOOP_ITERATIONS,
    {
      onBlock(pc, _mode, _meta, step) {
        noteTrace(state, cpu, mem, pc, step, false);
      },
      onMissingBlock(pc, _mode, step) {
        noteTrace(state, cpu, mem, pc, step, true);
      },
    },
  );

  return {
    id: 'C',
    entry: hex(BIT5_HELPER_ENTRY),
    stepLimit: TRACE_MAX_STEPS,
    iyPlus68: {
      address: hex(IY_PLUS_68_ADDR),
      beforeSetup: decodeByte(iyPlus68BeforeSetup),
      afterSetup: decodeByte(mem[IY_PLUS_68_ADDR]),
      afterRun: decodeByte(mem[IY_PLUS_68_ADDR]),
    },
    trace: {
      steps: trace.steps,
      termination: trace.hit === 'ret' ? 'sentinel_return' : (trace.termination ?? 'unknown'),
      finalPc: hex(trace.lastPc),
      finalMode: trace.lastMode,
      blocksVisited: state.blockSequence,
      uniqueBlocks: state.uniqueBlocks,
      missingBlocks: state.missingBlocks,
    },
    reached: makeReachability(state.blockSequence),
    monitoredHits: state.monitoredHits,
    flagsAfterRun: decodeFlags(cpu.f),
    errorMessage: trace.errorMessage,
  };
}

function lookupIncSymbol() {
  try {
    const line = fs.readFileSync(INC_PATH, 'utf8')
      .split(/\r?\n/)
      .find((text) => /0D000C4h/i.test(text));
    return line ? line.trim() : null;
  } catch {
    return null;
  }
}

function classifyIy44Instruction(dasm) {
  const lower = dasm.toLowerCase();
  if (lower.startsWith('bit ')) return 'read';
  if (lower.startsWith('ld (iy+68),')) return 'write';
  if (lower.startsWith('res ') || lower.startsWith('set ')) return 'readwrite';
  return 'other';
}

function findLocalIyBaseHint(block, instructionPc) {
  let hint = null;
  for (const instruction of block.instructions ?? []) {
    const currentPc = instruction.pc & 0xFFFFFF;
    if (currentPc >= (instructionPc & 0xFFFFFF)) break;

    if (instruction.tag === 'ld-pair-imm' && instruction.pair === 'iy' && typeof instruction.value === 'number') {
      hint = {
        base: instruction.value & 0xFFFFFF,
        setAt: currentPc,
      };
      continue;
    }

    const match = String(instruction.dasm ?? '').match(/^ld iy, 0x([0-9a-f]+)$/i);
    if (match) {
      hint = {
        base: parseInt(match[1], 16) & 0xFFFFFF,
        setAt: currentPc,
      };
    }
  }
  return hint;
}

function sortHexStrings(values) {
  return [...values].sort((left, right) => parseInt(left.slice(2), 16) - parseInt(right.slice(2), 16));
}

function collectIy44StaticSites() {
  const byInstruction = new Map();

  for (const block of Object.values(BLOCKS)) {
    if (!Array.isArray(block.instructions)) continue;

    for (const instruction of block.instructions) {
      const dasm = String(instruction.dasm ?? '');
      const lower = dasm.toLowerCase();
      if (!lower.includes('(iy+68)') && !lower.includes('0xd000c4')) continue;

      const instructionPc = instruction.pc & 0xFFFFFF;
      const key = `${instructionPc}:${instruction.mode ?? block.mode ?? 'adl'}`;
      if (!byInstruction.has(key)) {
        byInstruction.set(key, {
          pcValue: instructionPc,
          instructionPc: hex(instructionPc),
          mode: instruction.mode ?? block.mode ?? 'adl',
          dasm,
          tag: instruction.tag ?? null,
          kind: classifyIy44Instruction(dasm),
          containingBlocks: new Set(),
          localIyBaseHints: [],
          experimentDirectTarget: instructionPc === BIT5_HELPER_ENTRY,
        });
      }

      const site = byInstruction.get(key);
      site.containingBlocks.add(hex(block.startPc));

      const hint = findLocalIyBaseHint(block, instructionPc);
      if (hint) {
        const renderedHint = {
          base: hex(hint.base),
          setAt: hex(hint.setAt),
          absoluteIy44: hex((hint.base + 68) & 0xFFFFFF),
        };
        const serialized = JSON.stringify(renderedHint);
        if (!site.localIyBaseHints.some((existing) => JSON.stringify(existing) === serialized)) {
          site.localIyBaseHints.push(renderedHint);
        }
      }
    }
  }

  const allSites = [...byInstruction.values()]
    .sort((left, right) => left.pcValue - right.pcValue)
    .map((site) => ({
      instructionPc: site.instructionPc,
      mode: site.mode,
      dasm: site.dasm,
      tag: site.tag,
      kind: site.kind,
      experimentDirectTarget: site.experimentDirectTarget,
      containingBlocks: sortHexStrings(site.containingBlocks),
      localIyBaseHints: site.localIyBaseHints,
      defaultIyAbsoluteIy44: hex(IY_PLUS_68_ADDR),
    }));

  const countsByKind = {};
  for (const site of allSites) {
    countsByKind[site.kind] = (countsByKind[site.kind] ?? 0) + 1;
  }

  return {
    source: 'PRELIFTED_BLOCKS instruction metadata from ROM.transpiled.js',
    totalUniqueInstructionSites: allSites.length,
    countsByKind,
    directHelperSite: allSites.find((site) => site.instructionPc === hex(BIT5_HELPER_ENTRY)) ?? null,
    bit5SpecificSites: allSites.filter((site) => /^(bit 5|set 5|res 5)\b/i.test(site.dasm)),
    otherSites: allSites.filter((site) => site.instructionPc !== hex(BIT5_HELPER_ENTRY)),
    allSites,
  };
}

function compareExperiments(experimentA, experimentB, experimentC) {
  const notes = [];

  if (experimentA.iyPlus68.afterSetup.bits.bit5) {
    notes.push('Experiment A inherited bit 5 already set after memInit; the default-clear assumption did not hold.');
  } else {
    notes.push('Experiment A preserved the post-memInit default byte without forcing bit 5.');
  }

  if (experimentB.decisions.at0584c5.jrZTaken) {
    notes.push('Experiment B still took JR Z at 0x0584C5 even after forcing bit 5, which would be unexpected.');
  } else if (experimentB.decisions.at0584c5.fellThroughTo0584c7) {
    notes.push('Experiment B fell through from 0x0584C5 to 0x0584C7, so bit 5 set did change the immediate branch outcome.');
  } else {
    notes.push('Experiment B did not reach a clear 0x0584C5 successor within the 500-step trace.');
  }

  if (experimentC.flagsAfterRun.z) {
    notes.push('Direct helper experiment reported Z=1 after forcing bit 5, which would contradict the expected BIT behavior.');
  } else {
    notes.push('Direct helper experiment reported Z=0 after forcing bit 5, which matches BIT 5,(IY+68).');
  }

  return {
    bit5SetChangesImmediateDispatch: experimentA.decisions.at0584c5.nextBlock !== experimentB.decisions.at0584c5.nextBlock,
    experimentAPathAfter0584c5: experimentA.decisions.at0584c5.nextBlock,
    experimentBPathAfter0584c5: experimentB.decisions.at0584c5.nextBlock,
    bit5SetAvoided09927f: Boolean(experimentA.reached.call09927f) && !experimentB.reached.call09927f,
    bit5SetAvoidedJError: (experimentA.reached.jErrorDispatch || experimentA.reached.jErrorRetBug)
      && !experimentB.reached.jErrorDispatch
      && !experimentB.reached.jErrorRetBug,
    bit5SetReachedBufInsert: experimentB.reached.bufInsertCaller05851c || experimentB.reached.bufInsert,
    direct0800b8WithBit5SetClearsZ: !experimentC.flagsAfterRun.z,
    notes,
  };
}

function main() {
  const baseline = createBaseline();
  const experimentA = runDispatchExperiment('A', baseline.baselineMem, false);
  const experimentB = runDispatchExperiment('B', baseline.baselineMem, true);
  const experimentC = runDirectHelperExperiment(baseline.baselineMem);
  const staticAnalysis = collectIy44StaticSites();

  console.log(JSON.stringify({
    probe: 'phase200-bit5-iy68',
    generatedAt: new Date().toISOString(),
    romPath: ROM_PATH,
    transpiledPath: TRANSPILED_PATH,
    referenceIncLine: lookupIncSymbol(),
    setup: {
      mbase: hex(MBASE, 2),
      iy: hex(IY_ADDR),
      ix: hex(IX_ADDR),
      initialStackTop: hex(STACK_TOP),
      tokenStagingAddr: hex(TOKEN_STAGING_ADDR),
      tokenSeed: Array.from(DIGIT_4_TOKEN_SEED, (value) => hexByte(value)),
      stepLimit: TRACE_MAX_STEPS,
      timerInterrupt: false,
    },
    baseline: {
      romBytesLoaded: baseline.romBytesLoaded,
      boot: baseline.boot,
      memInit: baseline.memInit,
      iyPlus68: {
        label: 'IY+0x44 / 0xD000C4',
        address: hex(IY_PLUS_68_ADDR),
        afterMemInit: baseline.iyPlus68AfterMemInit,
      },
    },
    experiments: {
      A: experimentA,
      B: experimentB,
      C: experimentC,
    },
    comparison: compareExperiments(experimentA, experimentB, experimentC),
    staticAnalysis,
  }, null, 2));
}

main();
