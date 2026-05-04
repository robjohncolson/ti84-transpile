#!/usr/bin/env node

import { readFileSync } from 'fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const ROM_END = 0x400000;

const STACK_TOP = 0xD1A87E;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

const STAGE_1_ENTRY = 0x0A2B72;
const STAGE_2_ENTRY = 0x0A3301;
const STAGE_3_ENTRY = 0x0A29EC;
const STAGE_4_ENTRY = 0x0A2854;

const STAGE_1_MAX_STEPS = 30000;
const STAGE_2_MAX_STEPS = 30000;
const STAGE_3_MAX_STEPS = 50000;
const STAGE_4_MAX_STEPS = 50000;
const STAGE_MAX_LOOP_ITERATIONS = 500;

const MEM_INIT_ENTRY = 0x09DEE0;
const MEM_INIT_RET = 0x7FFFF6;
const CREATE_REAL_ENTRY = 0x08238A;
const PARSEINP_ENTRY = 0x099914;
const BUFINSERT_ENTRY = 0x05E2A0;

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const CREATE_REAL_MAX_STEPS = 50000;
const BUFINSERT_MAX_STEPS = 10000;
const PARSEINP_MAX_STEPS = 200000;

const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_MAX_LOOP_ITERATIONS = 10000;
const POST_INIT_MAX_LOOP_ITERATIONS = 32;
const OS_MAX_LOOP_ITERATIONS = 8192;
const SEGMENT_STEP_LIMIT = 2000;

const BOOT_MBASE_SITE = 0x0013C9;
const LD_MB_A_OPCODE_0 = 0xED;
const LD_MB_A_OPCODE_1 = 0x6D;

const HOME_DUMP_START = 0xD0A870;
const HOME_DUMP_END = 0xD0A890;

const OP1_ADDR = 0xD005F8;
const ERRNO_ADDR = 0xD008DF;
const ERRSP_ADDR = 0xD008E0;
const CUR_ROW_ADDR = 0xD00595;
const CUR_COL_ADDR = 0xD00596;

const BEGPC_ADDR = 0xD02317;
const CURPC_ADDR = 0xD0231A;
const ENDPC_ADDR = 0xD0231D;

const EDIT_TOP = 0xD02437;
const EDIT_CURSOR = 0xD0243A;
const EDIT_TAIL = 0xD0243D;
const EDIT_BTM = 0xD02440;

const FPSBASE_ADDR = 0xD0258A;
const FPS_ADDR = 0xD0258D;
const OPS_ADDR = 0xD02593;

const BUF_START = 0xD00A00;
const BUF_END = 0xD00B00;

const MODE_BUF_START = 0xD020A6;
const DISPLAY_BUF_START = 0xD006C0;
const MODE_BUF_TEXT = 'Normal Float Radian       ';
const MODE_BUF_LEN = 26;

const FAKE_RET = 0x7FFFFE;
const ERR_CATCH = 0x7FFFFA;

const ANS_NAME_OP1 = Uint8Array.from([0x00, 0x72, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
const INSERT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33]);

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

function hex(value, width = 6) {
  if (value === null || value === undefined) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function hexBytes(buffer, start, length) {
  return Array.from(buffer.slice(start, start + length), (value) => hexByte(value)).join(' ');
}

function read16Direct(buffer, addr) {
  const a = addr & 0xFFFFFF;
  return ((buffer[a] & 0xFF) | ((buffer[a + 1] & 0xFF) << 8)) >>> 0;
}

function read24(buffer, addr) {
  const a = addr & 0xFFFFFF;
  return ((buffer[a] & 0xFF) | ((buffer[a + 1] & 0xFF) << 8) | ((buffer[a + 2] & 0xFF) << 16)) >>> 0;
}

function write24(buffer, addr, value) {
  const a = addr & 0xFFFFFF;
  buffer[a] = value & 0xFF;
  buffer[a + 1] = (value >>> 8) & 0xFF;
  buffer[a + 2] = (value >>> 16) & 0xFF;
}

function dumpByteRange(buffer, start, endInclusive, lineWidth = 16) {
  const lines = [];
  const end = Math.min(endInclusive, buffer.length - 1);

  for (let addr = start; addr <= end; addr += lineWidth) {
    const take = Math.min(lineWidth, end - addr + 1);
    lines.push(`${hex(addr)}: ${hexBytes(buffer, addr, take)}`);
  }

  return {
    start: hex(start),
    end: hex(endInclusive),
    lines,
  };
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot, mem) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  return { mem, executor, cpu };
}

function summarizeRunResult(result) {
  return {
    steps: result.steps ?? null,
    termination: result.termination ?? null,
    lastPc: hex(result.lastPc),
    lastMode: result.lastMode ?? null,
  };
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: KERNEL_INIT_MAX_LOOP_ITERATIONS,
  });

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: POST_INIT_MAX_LOOP_ITERATIONS,
  });

  return {
    boot: summarizeRunResult(boot),
    kernelInit: summarizeRunResult(kernelInit),
    postInit: summarizeRunResult(postInit),
    cpuAfterPostInit: {
      mbase: hex(cpu.mbase, 2),
      iy: hex(cpu.iy),
      sp: hex(cpu.sp),
      madl: cpu.madl ? 'adl' : 'z80',
    },
  };
}

function runStage(executor, entry, maxSteps) {
  return executor.runFrom(entry, 'adl', {
    maxSteps,
    maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS,
  });
}

function seedModeBuffer(mem) {
  for (let index = 0; index < MODE_BUF_LEN; index += 1) {
    mem[MODE_BUF_START + index] = MODE_BUF_TEXT.charCodeAt(index);
    mem[DISPLAY_BUF_START + index] = MODE_BUF_TEXT.charCodeAt(index);
  }
}

function runHomeScreenBootDump() {
  const { mem, executor, cpu } = createRuntime();
  const boot = coldBoot(executor, cpu, mem);
  const ramSnap = new Uint8Array(mem.slice(0x400000, 0xE00000));
  const cpuSnap = snapshotCpu(cpu);

  mem.set(ramSnap, 0x400000);
  restoreCpu(cpu, cpuSnap, mem);
  const stage1 = runStage(executor, STAGE_1_ENTRY, STAGE_1_MAX_STEPS);

  restoreCpu(cpu, cpuSnap, mem);
  mem[0xD0009B] &= ~0x40;
  const stage2 = runStage(executor, STAGE_2_ENTRY, STAGE_2_MAX_STEPS);

  seedModeBuffer(mem);
  restoreCpu(cpu, cpuSnap, mem);
  const stage3 = runStage(executor, STAGE_3_ENTRY, STAGE_3_MAX_STEPS);

  restoreCpu(cpu, cpuSnap, mem);
  const stage4 = runStage(executor, STAGE_4_ENTRY, STAGE_4_MAX_STEPS);

  return {
    boot,
    stages: [
      { label: 'stage1', entry: hex(STAGE_1_ENTRY), ...summarizeRunResult(stage1) },
      { label: 'stage2', entry: hex(STAGE_2_ENTRY), ...summarizeRunResult(stage2) },
      { label: 'stage3', entry: hex(STAGE_3_ENTRY), ...summarizeRunResult(stage3) },
      { label: 'stage4', entry: hex(STAGE_4_ENTRY), ...summarizeRunResult(stage4) },
    ],
    dump: dumpByteRange(mem, HOME_DUMP_START, HOME_DUMP_END),
  };
}

function buildInstructionIndex() {
  const byPc = new Map();

  for (const [blockKey, meta] of Object.entries(BLOCKS)) {
    if (!meta?.instructions?.length) continue;
    const [, mode = 'adl'] = blockKey.split(':');
    const blockStart = meta.instructions[0]?.pc ?? null;

    meta.instructions.forEach((instruction, index) => {
      const entry = {
        pc: instruction.pc,
        instruction,
        index,
        blockKey,
        blockStart,
        mode,
        instructions: meta.instructions,
      };

      const arr = byPc.get(instruction.pc) ?? [];
      arr.push(entry);
      byPc.set(instruction.pc, arr);
    });
  }

  return byPc;
}

const instructionIndex = buildInstructionIndex();

function scoreContext(context) {
  return (context.index * 1000) + context.instructions.length;
}

function bestContextsForPc(pc) {
  const all = instructionIndex.get(pc) ?? [];
  const bestByMode = new Map();

  for (const context of all) {
    const current = bestByMode.get(context.mode);
    if (!current || scoreContext(context) > scoreContext(current)) {
      bestByMode.set(context.mode, context);
    }
  }

  return [...bestByMode.values()].sort((a, b) => a.mode.localeCompare(b.mode));
}

function decodeMetaInstruction(pc, mode) {
  try {
    return decodeInstruction(romBytes, pc, mode);
  } catch {
    return null;
  }
}

function inferAValueForContext(context) {
  for (let index = context.index - 1; index >= 0; index -= 1) {
    const inst = context.instructions[index];
    const decoded = decodeMetaInstruction(inst.pc, context.mode);
    const source = inst.dasm ?? decoded?.tag ?? 'unknown';

    if (!decoded) {
      continue;
    }

    if (decoded.tag === 'ld-reg-imm' && decoded.dest === 'a') {
      return {
        status: 'known',
        value: hex(decoded.value, 2),
        sourcePc: hex(inst.pc),
        source,
      };
    }

    if (decoded.tag === 'alu-reg' && decoded.op === 'xor' && decoded.src === 'a') {
      return {
        status: 'known',
        value: hex(0x00, 2),
        sourcePc: hex(inst.pc),
        source,
      };
    }

    if (
      (decoded.tag === 'ld-reg-reg' && decoded.dest === 'a') ||
      (decoded.tag === 'ld-reg-mem' && decoded.dest === 'a') ||
      (decoded.tag === 'ld-reg-ind' && decoded.dest === 'a') ||
      decoded.tag === 'ld-a-mb' ||
      (decoded.tag === 'inc-reg' && decoded.reg === 'a') ||
      (decoded.tag === 'dec-reg' && decoded.reg === 'a') ||
      decoded.tag === 'in0' ||
      decoded.tag === 'in' ||
      decoded.tag === 'in-reg' ||
      decoded.tag === 'in-imm' ||
      decoded.tag === 'ld-a-i' ||
      decoded.tag === 'ld-a-r' ||
      decoded.tag === 'ex-af' ||
      (decoded.tag === 'pop' && decoded.pair === 'af') ||
      decoded.tag === 'neg' ||
      decoded.tag === 'rla' ||
      decoded.tag === 'rra' ||
      decoded.tag === 'rlca' ||
      decoded.tag === 'rrca' ||
      decoded.tag === 'daa' ||
      decoded.tag === 'cpl' ||
      decoded.tag === 'ld-special' ||
      (decoded.tag === 'alu-reg' && decoded.op !== 'cp') ||
      decoded.tag === 'alu-imm'
    ) {
      return {
        status: 'unknown',
        value: null,
        sourcePc: hex(inst.pc),
        source,
      };
    }
  }

  return {
    status: 'not-found-in-block',
    value: null,
    sourcePc: null,
    source: null,
  };
}

function renderInstructionWindow(context, before = 4, after = 4) {
  const start = Math.max(0, context.index - before);
  const end = Math.min(context.instructions.length, context.index + after + 1);

  return context.instructions.slice(start, end).map((instruction) => ({
    marker: instruction.pc === context.pc ? 'target' : 'context',
    pc: hex(instruction.pc),
    dasm: instruction.dasm ?? 'unknown',
  }));
}

function scanLdMbASites() {
  const hits = [];

  for (let pc = 0; pc < ROM_END - 1; pc += 1) {
    if (romBytes[pc] === LD_MB_A_OPCODE_0 && romBytes[pc + 1] === LD_MB_A_OPCODE_1) {
      hits.push(pc);
    }
  }

  return hits.map((pc) => ({
    address: hex(pc),
    rawContext: dumpByteRange(romBytes, Math.max(0, pc - 8), Math.min(ROM_END - 1, pc + 9)),
    contexts: bestContextsForPc(pc).map((context) => ({
      mode: context.mode,
      blockKey: context.blockKey,
      blockStart: hex(context.blockStart),
      inferredA: inferAValueForContext(context),
      window: renderInstructionWindow(context),
    })),
  }));
}

function analyzeBootMbaseSite(ldMbSites) {
  const site = ldMbSites.find((entry) => entry.address === hex(BOOT_MBASE_SITE));
  const preferred = site?.contexts?.find((context) => context.mode === 'adl') ?? site?.contexts?.[0] ?? null;

  return {
    site: hex(BOOT_MBASE_SITE),
    inferredA: preferred?.inferredA ?? null,
    context: preferred?.window ?? [],
  };
}

function resetCpuForOsCall(cpu, mem, mbase = 0xD0) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = mbase & 0xFF;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function requireHit(label, result, expectedHit) {
  if (result.errorMessage) {
    throw new Error(`${label} threw ${result.errorMessage}`);
  }

  if (result.hit !== expectedHit) {
    throw new Error(
      `${label} expected ${expectedHit}, saw ${result.hit ?? 'none'} (termination=${result.termination ?? 'n/a'} lastPc=${hex(result.lastPc)})`,
    );
  }
}

function runStageInSegments(executor, entry, mode, totalMaxSteps, maxLoopIterations) {
  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastResult = {
    lastPc: currentPc,
    lastMode: currentMode,
    termination: null,
    error: null,
  };

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

    if (result.termination !== 'max_steps') {
      break;
    }
  }

  return {
    steps: totalSteps,
    lastPc: lastResult.lastPc ?? currentPc,
    lastMode: lastResult.lastMode ?? currentMode,
    termination: lastResult.termination ?? null,
    error: lastResult.error ?? null,
  };
}

function runUntilHitSegmented(executor, entry, mode, sentinels, totalMaxSteps, maxLoopIterations) {
  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastPc = currentPc;
  let lastMode = currentMode;
  let termination = null;
  let hit = null;
  let errorMessage = null;

  const notePc = (pc) => {
    const normalizedPc = pc & 0xFFFFFF;
    lastPc = normalizedPc;

    for (const [name, target] of Object.entries(sentinels)) {
      if (normalizedPc === target) {
        hit = name;
        throw new Error('__PH184_SENTINEL_STOP__');
      }
    }
  };

  while (totalSteps < totalMaxSteps && !hit) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, totalMaxSteps - totalSteps);

    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations,
        onBlock(pc) {
          notePc(pc);
        },
        onMissingBlock(pc) {
          notePc(pc);
        },
      });

      totalSteps += result.steps ?? 0;
      lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
      lastMode = result.lastMode ?? lastMode;
      currentPc = lastPc;
      currentMode = lastMode;
      termination = result.termination ?? null;

      if (termination !== 'max_steps') {
        if (result.error) {
          errorMessage = result.error?.stack ?? String(result.error);
        }
        break;
      }
    } catch (error) {
      if (error?.message === '__PH184_SENTINEL_STOP__') {
        termination = 'sentinel';
        break;
      }
      errorMessage = error?.stack ?? String(error);
      termination = 'exception';
      break;
    }
  }

  return {
    hit,
    steps: totalSteps,
    lastPc,
    lastMode,
    termination,
    errorMessage,
  };
}

function bootRuntime(executor, cpu, mem) {
  const boot = runStageInSegments(
    executor,
    BOOT_ENTRY,
    'z80',
    BOOT_MAX_STEPS,
    BOOT_MAX_LOOP_ITERATIONS,
  );

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
    KERNEL_INIT_MAX_LOOP_ITERATIONS,
  );

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInit = runStageInSegments(
    executor,
    POST_INIT_ENTRY,
    'adl',
    POST_INIT_MAX_STEPS,
    POST_INIT_MAX_LOOP_ITERATIONS,
  );

  return {
    boot: summarizeRunResult(boot),
    kernelInit: summarizeRunResult(kernelInit),
    postInit: summarizeRunResult(postInit),
  };
}

function runMemInit(executor, cpu, mem) {
  resetCpuForOsCall(cpu, mem, 0xD0);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);
  mem[ERRNO_ADDR] = 0x00;

  return runUntilHitSegmented(
    executor,
    MEM_INIT_ENTRY,
    'adl',
    { ret: MEM_INIT_RET },
    MEM_INIT_MAX_STEPS,
    OS_MAX_LOOP_ITERATIONS,
  );
}

function runCreateRealAns(executor, cpu, mem) {
  mem.set(ANS_NAME_OP1, OP1_ADDR);
  resetCpuForOsCall(cpu, mem, 0xD0);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);
  const errBase = (cpu.sp - 6) & 0xFFFFFF;
  write24(mem, errBase, ERR_CATCH);
  write24(mem, errBase + 3, 0);
  write24(mem, ERRSP_ADDR, errBase);
  mem[ERRNO_ADDR] = 0x00;
  cpu.a = 0x00;
  cpu._hl = 0x000009;

  return {
    errBase: hex(errBase),
    ...runUntilHitSegmented(
      executor,
      CREATE_REAL_ENTRY,
      'adl',
      { ret: FAKE_RET, err: ERR_CATCH },
      CREATE_REAL_MAX_STEPS,
      OS_MAX_LOOP_ITERATIONS,
    ),
  };
}

function runBufInsertToken(executor, cpu, mem, token) {
  resetCpuForOsCall(cpu, mem, 0xD0);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);
  cpu._de = token & 0xFF;

  return runUntilHitSegmented(
    executor,
    BUFINSERT_ENTRY,
    'adl',
    { ret: FAKE_RET },
    BUFINSERT_MAX_STEPS,
    OS_MAX_LOOP_ITERATIONS,
  );
}

function prepareParseInpScenario(executor, cpu, mem) {
  const boot = bootRuntime(executor, cpu, mem);
  const memInit = runMemInit(executor, cpu, mem);
  requireHit('MEM_INIT', memInit, 'ret');

  const createReal = runCreateRealAns(executor, cpu, mem);
  if (createReal.hit === 'err') {
    throw new Error(`CreateReal(Ans) hit ERR_CATCH with errNo=${hex(mem[ERRNO_ADDR], 2)}`);
  }
  requireHit('CreateReal(Ans)', createReal, 'ret');

  const postCreatePointers = {
    ops: read24(mem, OPS_ADDR),
    fps: read24(mem, FPS_ADDR),
    fpsBase: read24(mem, FPSBASE_ADDR),
  };

  write24(mem, EDIT_TOP, BUF_START);
  write24(mem, EDIT_CURSOR, BUF_START);
  write24(mem, EDIT_TAIL, BUF_END);
  write24(mem, EDIT_BTM, BUF_END);
  mem.fill(0x00, BUF_START, BUF_END);

  const bufInsertRuns = [];
  for (const token of INSERT_TOKENS) {
    const result = runBufInsertToken(executor, cpu, mem, token);
    requireHit(`BufInsert(${hex(token, 2)})`, result, 'ret');
    bufInsertRuns.push({
      token: hex(token, 2),
      ...summarizeRunResult(result),
    });
  }

  const cursor = read24(mem, EDIT_CURSOR);
  const preGapLen = cursor - BUF_START;

  write24(mem, BEGPC_ADDR, BUF_START);
  write24(mem, CURPC_ADDR, BUF_START);
  write24(mem, ENDPC_ADDR, BUF_START + preGapLen - 1);

  write24(mem, OPS_ADDR, postCreatePointers.ops);
  write24(mem, FPS_ADDR, postCreatePointers.fps);
  write24(mem, FPSBASE_ADDR, postCreatePointers.fpsBase);

  return {
    boot,
    memInit: summarizeRunResult(memInit),
    createReal: {
      ...summarizeRunResult(createReal),
      errBase: createReal.errBase,
    },
    bufInsertRuns,
    editBuffer: {
      start: hex(BUF_START),
      cursor: hex(cursor),
      preGapLength: preGapLen,
      bytes: hexBytes(mem, BUF_START, Math.max(0, cursor - BUF_START)),
    },
    parserPointers: {
      begPC: hex(read24(mem, BEGPC_ADDR)),
      curPC: hex(read24(mem, CURPC_ADDR)),
      endPC: hex(read24(mem, ENDPC_ADDR)),
      curRow: hex(mem[CUR_ROW_ADDR], 2),
      curCol: hex(mem[CUR_COL_ADDR], 2),
    },
  };
}

function summarizeTraceBlock(meta) {
  if (!meta?.instructions?.length) return [];
  return meta.instructions.slice(0, 6).map((instruction) => instruction.dasm ?? 'unknown');
}

function installStackEventTrace(cpu, mem, onEvent) {
  const logs = [];
  const origPop = cpu.pop.bind(cpu);
  const origPopReturn = cpu.popReturn.bind(cpu);
  let pendingKind = null;

  cpu.pop = function tracedPop() {
    const kind = pendingKind ?? 'pop';
    pendingKind = null;
    const sourcePc = cpu._currentBlockPc ?? 0;
    const interesting = sourcePc >= 0x03E180 && sourcePc <= 0x03E1D0;
    const mode = cpu.madl ? 'adl' : 'z80';
    const spBefore = cpu.sp & 0xFFFFFF;
    const addr = cpu.madl
      ? spBefore
      : (((cpu.mbase & 0xFF) << 16) | (cpu.sp & 0xFFFF)) >>> 0;
    const valueBefore = cpu.madl
      ? read24(mem, addr)
      : read16Direct(mem, addr);

    const result = origPop();

    if (interesting) {
      const event = {
        kind,
        pc: hex(sourcePc),
        mode,
        mbase: hex(cpu.mbase, 2),
        spBefore: hex(spBefore),
        addr: hex(addr),
        value: hex(valueBefore, cpu.madl ? 6 : 4),
        valueNumeric: valueBefore >>> 0,
        stackPreview: dumpByteRange(
          mem,
          Math.max(0, addr - 4),
          Math.min(mem.length - 1, addr + 5),
          10,
        ).lines,
      };

      logs.push(event);
      onEvent?.(event);
    }

    return result;
  };

  cpu.popReturn = function tracedPopReturn() {
    pendingKind = 'ret-pop';
    return origPopReturn();
  };

  return {
    logs,
    restore() {
      cpu.pop = origPop;
      cpu.popReturn = origPopReturn;
    },
  };
}

function assessParseTraceOutcome(result) {
  const ret = result.firstZ80Ret;
  if (!ret) {
    return 'No z80-mode RET pop was captured in the error helper.';
  }

  if (result.postRetLocation?.kind === 'block') {
    return `RET popped ${ret.value} from ${ret.addr} and execution continued into lifted block ${result.postRetLocation.pc} (${result.postRetLocation.mode}).`;
  }

  if (result.postRetLocation?.kind === 'missing_block') {
    return `RET popped ${ret.value} from ${ret.addr}, but the executor had no lifted block at ${result.postRetLocation.pc} (${result.postRetLocation.mode}).`;
  }

  return `RET popped ${ret.value} from ${ret.addr}, but no post-return block transition was captured before termination (${result.termination}).`;
}

function runParseErrorDispatchTrace(executor, cpu, mem, mbase) {
  resetCpuForOsCall(cpu, mem, mbase);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);

  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);
  const errBase = (cpu.sp - 6) & 0xFFFFFF;
  write24(mem, errBase, ERR_CATCH);
  write24(mem, errBase + 3, 0);
  write24(mem, ERRSP_ADDR, errBase);
  mem[ERRNO_ADDR] = 0x00;

  const traceBlocks = [];
  let firstZ80Ret = null;
  let postRetLocation = null;
  let firstErrNo8DBlock = null;
  let termination = null;
  let errorMessage = null;
  let totalSteps = 0;
  let lastPc = PARSEINP_ENTRY;
  let lastMode = 'adl';

  const stackTrace = installStackEventTrace(cpu, mem, (event) => {
    if (
      !firstZ80Ret &&
      event.kind === 'ret-pop' &&
      event.mode === 'z80' &&
      (event.pc === hex(0x03E1B1) || event.pc === hex(0x03E1B2) || event.pc === hex(0x03E1B3))
    ) {
      firstZ80Ret = event;
    }
  });

  try {
    let currentPc = PARSEINP_ENTRY;
    let currentMode = 'adl';

    while (totalSteps < PARSEINP_MAX_STEPS && !postRetLocation) {
      const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, PARSEINP_MAX_STEPS - totalSteps);

      try {
        const result = executor.runFrom(currentPc, currentMode, {
          maxSteps: segmentBudget,
          maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
          onBlock(pc, mode, meta) {
            if ((mem[ERRNO_ADDR] & 0xFF) === 0x8D && !firstErrNo8DBlock) {
              firstErrNo8DBlock = hex(pc);
            }

            const interestingPc =
              (pc >= 0x061DB2 && pc <= 0x061DCA) ||
              (pc >= 0x03E180 && pc <= 0x03E1D8) ||
              pc === 0x000000 ||
              pc === 0x000066;

            if (interestingPc && traceBlocks.length < 40) {
              const last = traceBlocks[traceBlocks.length - 1];
              if (!last || last.pc !== hex(pc) || last.mode !== mode) {
                traceBlocks.push({
                  pc: hex(pc),
                  mode,
                  a: hex(cpu.a, 2),
                  sp: hex(cpu.sp),
                  mbase: hex(cpu.mbase, 2),
                  block: summarizeTraceBlock(meta),
                });
              }
            }

            if (firstZ80Ret && !postRetLocation && (pc & 0xFFFFFF) === (firstZ80Ret.valueNumeric & 0xFFFFFF)) {
              postRetLocation = {
                kind: 'block',
                pc: hex(pc),
                mode,
              };
              throw new Error('__PH184_POST_RET_STOP__');
            }
          },
          onMissingBlock(pc, mode) {
            if (firstZ80Ret && !postRetLocation && (pc & 0xFFFFFF) === (firstZ80Ret.valueNumeric & 0xFFFFFF)) {
              postRetLocation = {
                kind: 'missing_block',
                pc: hex(pc),
                mode,
              };
              throw new Error('__PH184_POST_RET_STOP__');
            }
          },
        });

        totalSteps += result.steps ?? 0;
        lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
        lastMode = result.lastMode ?? lastMode;
        currentPc = lastPc;
        currentMode = lastMode;

        if (result.termination !== 'max_steps') {
          termination = result.termination ?? null;
          if (result.error) {
            errorMessage = result.error?.stack ?? String(result.error);
          }
          break;
        }
      } catch (error) {
        if (error?.message === '__PH184_POST_RET_STOP__') {
          termination = postRetLocation?.kind ?? 'post_ret_stop';
          break;
        }

        termination = 'exception';
        errorMessage = error?.stack ?? String(error);
        break;
      }
    }
  } finally {
    stackTrace.restore();
  }

  return {
    parseMbase: hex(mbase, 2),
    totalSteps,
    termination,
    errorMessage,
    lastPc: hex(lastPc),
    lastMode,
    errNo: hex(mem[ERRNO_ADDR] & 0xFF, 2),
    errSP: hex(read24(mem, ERRSP_ADDR)),
    errFrameBase: hex(errBase),
    firstErrNo8DBlock,
    firstZ80Ret,
    postRetLocation,
    stackEvents: stackTrace.logs,
    traceBlocks,
    assessment: assessParseTraceOutcome({
      firstZ80Ret,
      postRetLocation,
      termination,
    }),
  };
}

function runParseTraceScenario(parseMbase) {
  const { mem, executor, cpu } = createRuntime();
  const preparation = prepareParseInpScenario(executor, cpu, mem);
  const trace = runParseErrorDispatchTrace(executor, cpu, mem, parseMbase);

  return {
    preparation,
    trace,
  };
}

function buildSummary(ldMbSites, bootMbase, homeDump, parseD0, parseD1) {
  return {
    ldMbASiteCount: ldMbSites.length,
    bootLdMbA: {
      site: bootMbase.site,
      inferredA: bootMbase.inferredA?.value ?? null,
      sourcePc: bootMbase.inferredA?.sourcePc ?? null,
      source: bootMbase.inferredA?.source ?? null,
    },
    coldBootCpuMbaseAfterPostInit: homeDump.boot.cpuAfterPostInit.mbase,
    d0Ret: parseD0.trace.firstZ80Ret
      ? {
          addr: parseD0.trace.firstZ80Ret.addr,
          value: parseD0.trace.firstZ80Ret.value,
          postRet: parseD0.trace.postRetLocation ?? null,
        }
      : null,
    d1Ret: parseD1.trace.firstZ80Ret
      ? {
          addr: parseD1.trace.firstZ80Ret.addr,
          value: parseD1.trace.firstZ80Ret.value,
          postRet: parseD1.trace.postRetLocation ?? null,
        }
      : null,
    d1LooksMorePlausible: Boolean(
      parseD1.trace.firstZ80Ret &&
      parseD1.trace.firstZ80Ret.addr.startsWith('0xD1') &&
      parseD1.trace.firstZ80Ret.value !== hex(0x0000, 4),
    ),
  };
}

function main() {
  const ldMbSites = scanLdMbASites();
  const bootMbase = analyzeBootMbaseSite(ldMbSites);
  const homeDump = runHomeScreenBootDump();
  const parseD0 = runParseTraceScenario(0xD0);
  const parseD1 = runParseTraceScenario(0xD1);

  const report = {
    probe: 'phase184-mbase-investigation',
    generatedAt: new Date().toISOString(),
    ldMbASites: ldMbSites,
    bootSequenceMbase: bootMbase,
    homeScreenBootDump: homeDump,
    parseInpErrorDispatch: {
      mbaseD0: parseD0,
      mbaseD1: parseD1,
    },
    summary: buildSummary(ldMbSites, bootMbase, homeDump, parseD0, parseD1),
  };

  console.log(JSON.stringify(report, null, 2));
}

try {
  main();
} catch (error) {
  console.log(JSON.stringify({
    probe: 'phase184-mbase-investigation',
    generatedAt: new Date().toISOString(),
    error: error?.stack ?? String(error),
  }, null, 2));
  process.exitCode = 1;
}
