#!/usr/bin/env node
/**
 * probe-phase213-stat-50k-fp-dump.mjs
 *
 * 50,000-step STAT trace with the phase-211 late-seed fix plus:
 *   - OP1/OP2 dumps for the first 200 visits in the 0x070000-0x08FFFF range
 *   - BufInsert reach detection
 *   - STAT-structure snapshots at steps 10000 / 25000 / 50000
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILE_SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'transpile-ti84-rom.mjs');

ensureTranspiled();

const romBytes = fs.readFileSync(ROM_PATH);
const transpiledUrl = pathToFileURL(TRANSPILED_PATH);
transpiledUrl.searchParams.set('phase213', `${Date.now()}`);
const romModule = await import(transpiledUrl.href);
const BLOCKS = normalizeBlocks(romModule.PRELIFTED_BLOCKS);

const PROBE_NAME = 'probe-phase213-stat-50k-fp-dump';

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const STAT_ENTRY = 0x058BA9;

const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;
const TRACE_STOP = '__PHASE213_TRACE_STOP__';

const SEGMENT_STEP_LIMIT = 2000;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const MEM_INIT_MAX_LOOP_ITERATIONS = 8192;
const TRACE_MAX_STEPS = 50000;
const TRACE_MAX_LOOP_ITERATIONS = 65536;

const OP1_ADDR = 0xD005F8;
const OP2_ADDR = 0xD00603;
const STAT_STRUCT = 0xD008E6;
const LIST_PTR_TABLE = 0xD01508;
const BUF_INSERT = 0x05E2A0;
const EVENT_LOOP = 0x082BE2;
const INSERT_MEM_BLOCK = 0x092226;

const LIST_DATA_ADDR = 0xD01600;
const LIST_DATA_END_ADDR = 0xD0161E;
const LIST_COUNT_ADDR = 0xD0150B;
const ACTIVE_LIST_ADDR = 0xD0150C;
const VAT_ENTRY_ADDR = 0xD1A800;
const VAT_ENTRY_LEN = 8;
const VAT_END_LOW_ADDR = 0xD1A882;

const CURRENT_LIST_ADDR = 0xD02458;
const CURR_LIST_HIGHLIGHT_ADDR = 0xD0244B;
const LEGACY_USERMEM_SCRATCH_ADDR = 0xD0247C;
const OPBASE_ADDR = 0xD02590;
const OPS_ADDR = 0xD02593;
const PTEMPCNT_ADDR = 0xD02596;
const PTEMP_ADDR = 0xD0259A;
const PROGPTR_ADDR = 0xD0259D;
const NEWDATA_PTR_ADDR = 0xD025A0;
const STATFLAGS_ADDR = 0xD00089;
const STATFLAGS2_ADDR = 0xD0009A;
const ALLOCATOR_SEED_ADDR = 0xD01700;
const STAT_TOKEN = 0x31;

const FP_RANGE_START = 0x070000;
const FP_RANGE_END = 0x08FFFF;
const FP_SAMPLE_LIMIT = 200;
const FP_TABLE_LIMIT = 50;
const SNAPSHOT_STEPS = [10000, 25000, 50000];

function ensureTranspiled() {
  if (fs.existsSync(TRANSPILED_PATH)) return;
  const result = spawnSync(process.execPath, [TRANSPILE_SCRIPT_PATH], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`Transpile failed with status ${result.status ?? 'unknown'}`);
  }
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function blockKey(pc, mode = 'adl') {
  return `${(pc & 0xFFFFFF).toString(16).padStart(6, '0')}:${mode}`;
}

function firstInstructionLabel(pc, mode = 'adl') {
  const block = BLOCKS[blockKey(pc, mode)];
  return block?.instructions?.[0]?.dasm ?? null;
}

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function write24(mem, addr, value) {
  mem[addr & MEM_MASK] = value & 0xFF;
  mem[(addr + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(addr + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function read24(mem, addr) {
  return (
    (mem[addr & MEM_MASK]) |
    (mem[(addr + 1) & MEM_MASK] << 8) |
    (mem[(addr + 2) & MEM_MASK] << 16)
  ) >>> 0;
}

function sliceBytes(mem, addr, len) {
  const out = new Uint8Array(len);
  for (let index = 0; index < len; index += 1) {
    out[index] = mem[(addr + index) & MEM_MASK] & 0xFF;
  }
  return out;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function makeStop(name, pc) {
  const error = new Error(TRACE_STOP);
  error.stopName = name;
  error.stopPc = pc & 0xFFFFFF;
  return error;
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

function resetCpuForOsCall(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._iy = IY_ADDR;
  cpu.f = 0x40;
  cpu._ix = IX_ADDR;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function coldBoot(executor, cpu, mem) {
  const boot = runStageInSegments(executor, BOOT_ENTRY, 'z80', BOOT_MAX_STEPS, 32);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = runStageInSegments(executor, KERNEL_INIT_ENTRY, 'adl', KERNEL_INIT_MAX_STEPS, 10000);

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
    kernelInit: { steps: kernelInit.steps, lastPc: hex(kernelInit.lastPc), termination: kernelInit.termination },
    postInit: { steps: postInit.steps, lastPc: hex(postInit.lastPc), termination: postInit.termination },
  };
}

function runMemInit(executor, cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);
  mem[0xD008DF] = 0x00;

  let currentPc = MEM_INIT_ENTRY;
  let currentMode = 'adl';
  let totalSteps = 0;
  let returned = false;

  while (totalSteps < MEM_INIT_MAX_STEPS && !returned) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, MEM_INIT_MAX_STEPS - totalSteps);
    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations: MEM_INIT_MAX_LOOP_ITERATIONS,
        onBlock(pc) {
          const norm = pc & 0xFFFFFF;
          if (norm === MEM_INIT_RET) throw makeStop('mem_init_return', norm);
        },
        onMissingBlock(pc) {
          const norm = pc & 0xFFFFFF;
          if (norm === MEM_INIT_RET) throw makeStop('mem_init_return', norm);
        },
      });
      totalSteps += result.steps ?? 0;
      currentPc = (result.lastPc ?? currentPc) & 0xFFFFFF;
      currentMode = result.lastMode ?? currentMode;
      if (result.termination !== 'max_steps') break;
    } catch (error) {
      if (error?.message === TRACE_STOP) {
        returned = true;
        break;
      }
      throw error;
    }
  }

  return { returned, steps: totalSteps };
}

function seedListL1(mem) {
  mem.fill(0x00, LIST_DATA_ADDR, LIST_DATA_END_ADDR);

  mem[LIST_DATA_ADDR] = 0x03;
  mem[LIST_DATA_ADDR + 1] = 0x00;
  mem[LIST_DATA_ADDR + 2] = 0x00;

  const elements = [
    [0x00, 0x80, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    [0x00, 0x80, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
    [0x00, 0x80, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
  ];

  let cursor = LIST_DATA_ADDR + 3;
  for (const element of elements) {
    for (let index = 0; index < element.length; index += 1) {
      mem[cursor + index] = element[index];
    }
    cursor += element.length;
  }

  mem.fill(0x00, VAT_ENTRY_ADDR, VAT_ENTRY_ADDR + VAT_ENTRY_LEN);
  mem[VAT_ENTRY_ADDR] = 0x01;
  mem[VAT_ENTRY_ADDR + 1] = LIST_DATA_ADDR & 0xFF;
  mem[VAT_ENTRY_ADDR + 2] = (LIST_DATA_ADDR >>> 8) & 0xFF;
  mem[VAT_ENTRY_ADDR + 3] = (LIST_DATA_ADDR >>> 16) & 0xFF;
  mem[VAT_ENTRY_ADDR + 4] = 0x06;
  mem[VAT_ENTRY_ADDR + 5] = 0x00;

  write24(mem, OPBASE_ADDR, VAT_ENTRY_ADDR);
  write24(mem, OPS_ADDR, VAT_ENTRY_ADDR + VAT_ENTRY_LEN);
  mem.fill(0x00, PTEMPCNT_ADDR, PTEMPCNT_ADDR + 4);
  write24(mem, PTEMP_ADDR, ALLOCATOR_SEED_ADDR);
  write24(mem, PROGPTR_ADDR, VAT_ENTRY_ADDR);
  write24(mem, NEWDATA_PTR_ADDR, ALLOCATOR_SEED_ADDR);
  write24(mem, LEGACY_USERMEM_SCRATCH_ADDR, ALLOCATOR_SEED_ADDR);

  mem[VAT_END_LOW_ADDR] = 0x00;
  mem[LIST_COUNT_ADDR] = 0x01;
  mem[ACTIVE_LIST_ADDR] = 0x01;
  mem[CURRENT_LIST_ADDR] = 0x01;
  mem[CURR_LIST_HIGHLIGHT_ADDR] = 0x00;
  mem[CURR_LIST_HIGHLIGHT_ADDR + 1] = 0x00;

  mem[STATFLAGS_ADDR] |= 0x40;
  mem[STATFLAGS2_ADDR] |= 0x04;

  return {
    listBytes: bytesToHex(sliceBytes(mem, LIST_DATA_ADDR, LIST_DATA_END_ADDR - LIST_DATA_ADDR)),
    vatEntryBytes: bytesToHex(sliceBytes(mem, VAT_ENTRY_ADDR, VAT_ENTRY_LEN)),
    vatEndLowByte: hex(mem[VAT_END_LOW_ADDR], 2),
    allocatorPointers: {
      opBase: hex(read24(mem, OPBASE_ADDR)),
      ops: hex(read24(mem, OPS_ADDR)),
      pTemp: hex(read24(mem, PTEMP_ADDR)),
      progPtr: hex(read24(mem, PROGPTR_ADDR)),
      newDataPtr: hex(read24(mem, NEWDATA_PTR_ADDR)),
      legacyScratchAtD0247C: hex(read24(mem, LEGACY_USERMEM_SCRATCH_ADDR)),
    },
  };
}

function trimTrailingZeros(text) {
  if (!text.includes('.')) return text;
  return text.replace(/\.?0+$/, '');
}

function formatNumber(value) {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1e9 || abs < 1e-6) {
    const [mantissa, exponent] = value.toExponential(12).split('e');
    return `${trimTrailingZeros(mantissa)}e${Number(exponent)}`;
  }
  return trimTrailingZeros(value.toPrecision(14));
}

function decodeBcdReal(bytes) {
  const rawHex = bytesToHex(bytes);
  if (!(bytes instanceof Uint8Array) || bytes.length !== 9) {
    return {
      valid: false,
      rawHex,
      error: 'wrong_length',
      display: 'invalid',
    };
  }

  const signByte = bytes[0] & 0xFF;
  const exponentByte = bytes[1] & 0xFF;
  let digits = '';

  for (let index = 2; index < 9; index += 1) {
    const hi = (bytes[index] >>> 4) & 0x0F;
    const lo = bytes[index] & 0x0F;
    if (hi > 9 || lo > 9) {
      return {
        valid: false,
        rawHex,
        signByte: hex(signByte, 2),
        exponentByte: hex(exponentByte, 2),
        error: `non_bcd_digit_at_${index}`,
        display: 'invalid',
      };
    }
    digits += `${hi}${lo}`;
  }

  const negative = (signByte & 0x80) !== 0;
  const exponent = exponentByte - 0x80;
  const mantissaInt = Number.parseInt(digits, 10);
  const numericValue = (negative ? -1 : 1) * mantissaInt * (10 ** (exponent - 13));
  const trimmedFraction = digits.slice(1).replace(/0+$/, '');
  const scientific = `${negative ? '-' : ''}${digits[0]}${trimmedFraction ? `.${trimmedFraction}` : ''}e${exponent}`;

  return {
    valid: true,
    rawHex,
    signByte: hex(signByte, 2),
    sign: negative ? '-' : '+',
    exponentByte: hex(exponentByte, 2),
    exponent,
    digits,
    mantissaInt,
    scientific,
    numericValue,
    display: Number.isFinite(numericValue) ? formatNumber(numericValue) : scientific,
  };
}

function captureOpPair(mem) {
  const op1Bytes = sliceBytes(mem, OP1_ADDR, 9);
  const op2Bytes = sliceBytes(mem, OP2_ADDR, 9);
  return {
    op1: decodeBcdReal(op1Bytes),
    op2: decodeBcdReal(op2Bytes),
  };
}

function captureStatSnapshot(mem, step, note = null) {
  return {
    step,
    address: hex(STAT_STRUCT),
    hex: bytesToHex(sliceBytes(mem, STAT_STRUCT, 32)),
    note,
  };
}

function captureRegisters(cpu) {
  return {
    a: hex(cpu.a, 2),
    f: hex(cpu.f, 2),
    bc: hex(cpu.bc),
    de: hex(cpu.de),
    hl: hex(cpu.hl),
    sp: hex(cpu.sp),
    ix: hex(cpu.ix),
    iy: hex(cpu.iy),
    madl: cpu.madl,
    mbase: hex(cpu.mbase, 2),
    halted: Boolean(cpu.halted),
  };
}

function runStatTrace(executor, cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  cpu.a = STAT_TOKEN;
  cpu.sp -= 3;
  write24(mem, cpu.sp, RETURN_SENTINEL);

  const visitedSet = new Set();
  const blockFreq = new Map();
  const visitKinds = new Map();
  const fpUniqueBlocks = new Set();
  const fpVisits = [];
  const statSnapshots = Object.fromEntries(SNAPSHOT_STEPS.map((step) => [step, null]));

  let totalSteps = 0;
  let termination = 'unknown';
  let hitSentinel = null;
  let errorMessage = null;
  let lastPc = STAT_ENTRY;
  let lastMode = 'adl';
  let currentPc = STAT_ENTRY;
  let currentMode = 'adl';

  let lateSeedApplied = false;
  let lateSeedStep = null;
  let lateSeedEventKind = null;

  const bufInsert = {
    reached: false,
    step: null,
    de: null,
    deHex: null,
    eventKind: null,
    visits: 0,
  };

  function noteVisit(pc, kind) {
    blockFreq.set(pc, (blockFreq.get(pc) || 0) + 1);
    visitedSet.add(pc);
    if (!visitKinds.has(pc)) visitKinds.set(pc, new Set());
    visitKinds.get(pc).add(kind);
  }

  function maybeCaptureStatSnapshot(step) {
    if (!Object.hasOwn(statSnapshots, step) || statSnapshots[step]) return;
    statSnapshots[step] = captureStatSnapshot(mem, step);
  }

  function maybeCaptureFpVisit(pc, step, kind, mode) {
    if (pc < FP_RANGE_START || pc > FP_RANGE_END) return;

    fpUniqueBlocks.add(pc);
    if (fpVisits.length >= FP_SAMPLE_LIMIT) return;

    const { op1, op2 } = captureOpPair(mem);
    fpVisits.push({
      index: fpVisits.length + 1,
      step,
      block: hex(pc),
      kind,
      mode,
      dasm: firstInstructionLabel(pc, mode),
      op1,
      op2,
    });
  }

  function maybeCaptureBufInsert(pc, step, kind) {
    if (pc !== BUF_INSERT) return;
    bufInsert.visits += 1;
    if (bufInsert.reached) return;
    bufInsert.reached = true;
    bufInsert.step = step;
    bufInsert.de = cpu.de >>> 0;
    bufInsert.deHex = hex(cpu.de);
    bufInsert.eventKind = kind;
  }

  function maybeApplyLateSeed(pc, step, kind) {
    if (lateSeedApplied || pc !== INSERT_MEM_BLOCK) return;
    write24(mem, LIST_PTR_TABLE, LIST_DATA_ADDR);
    lateSeedApplied = true;
    lateSeedStep = step;
    lateSeedEventKind = kind;
  }

  while (totalSteps < TRACE_MAX_STEPS) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, TRACE_MAX_STEPS - totalSteps);
    let segmentSteps = 0;

    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations: TRACE_MAX_LOOP_ITERATIONS,
        onBlock(pc, dispatchMode, _meta, step) {
          const norm = pc & 0xFFFFFF;
          const mode = dispatchMode ?? lastMode;
          const globalStep = totalSteps + (step ?? 0) + 1;
          segmentSteps = Math.max(segmentSteps, (step ?? 0) + 1);
          lastPc = norm;
          lastMode = mode;

          noteVisit(norm, 'lifted');
          maybeApplyLateSeed(norm, globalStep, 'lifted');
          maybeCaptureBufInsert(norm, globalStep, 'lifted');
          maybeCaptureFpVisit(norm, globalStep, 'lifted', mode);
          maybeCaptureStatSnapshot(globalStep);

          if (norm === RETURN_SENTINEL) throw makeStop('return_sentinel', norm);
          if (norm === BOOT_ENTRY && globalStep > 1) throw makeStop('boot_crash', norm);
        },
        onMissingBlock(pc, dispatchMode, step) {
          const norm = pc & 0xFFFFFF;
          const mode = dispatchMode ?? lastMode;
          const globalStep = totalSteps + (step ?? 0) + 1;
          segmentSteps = Math.max(segmentSteps, (step ?? 0) + 1);
          lastPc = norm;
          lastMode = mode;

          noteVisit(norm, 'missing');
          maybeApplyLateSeed(norm, globalStep, 'missing');
          maybeCaptureBufInsert(norm, globalStep, 'missing');
          maybeCaptureFpVisit(norm, globalStep, 'missing', mode);
          maybeCaptureStatSnapshot(globalStep);

          if (norm === RETURN_SENTINEL) throw makeStop('return_sentinel', norm);
        },
      });

      totalSteps += result.steps ?? segmentSteps;
      currentPc = (result.lastPc ?? currentPc) & 0xFFFFFF;
      currentMode = result.lastMode ?? currentMode;
      lastPc = currentPc;
      lastMode = currentMode;
      termination = result.termination ?? null;

      if (termination !== 'max_steps') break;
    } catch (error) {
      totalSteps += segmentSteps;
      if (error?.message === TRACE_STOP) {
        hitSentinel = { name: error.stopName, pc: hex(error.stopPc) };
        termination = 'sentinel';
        break;
      }
      errorMessage = error?.stack ?? String(error);
      termination = 'exception';
      break;
    }
  }

  if (termination === 'max_steps' && totalSteps >= TRACE_MAX_STEPS) {
    termination = 'step_limit';
  }

  for (const step of SNAPSHOT_STEPS) {
    if (!statSnapshots[step]) {
      statSnapshots[step] = captureStatSnapshot(mem, step, `captured at end of run (actual step ${totalSteps})`);
    }
  }

  const topVisitedBlocks = [...blockFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([pc, count], index) => ({
      rank: index + 1,
      block: hex(pc),
      count,
      kind: [...(visitKinds.get(pc) ?? [])].sort().join('+') || null,
      dasm: firstInstructionLabel(pc),
    }));

  return {
    totalSteps,
    uniqueBlockCount: visitedSet.size,
    termination,
    hitSentinel,
    errorMessage: errorMessage ? errorMessage.split('\n')[0] : null,
    lastPc: hex(lastPc),
    lastMode,
    lateSeed: {
      applied: lateSeedApplied,
      step: lateSeedStep,
      eventKind: lateSeedEventKind,
      targetBlock: hex(INSERT_MEM_BLOCK),
      pointerValue: hex(LIST_DATA_ADDR),
    },
    eventLoopVisits: blockFreq.get(EVENT_LOOP) || 0,
    bufInsert,
    topVisitedBlocks,
    fpRange: {
      start: hex(FP_RANGE_START),
      end: hex(FP_RANGE_END),
      totalVisits: [...blockFreq.entries()]
        .filter(([pc]) => pc >= FP_RANGE_START && pc <= FP_RANGE_END)
        .reduce((sum, [, count]) => sum + count, 0),
      uniqueBlocks: fpUniqueBlocks.size,
      capturedVisits: fpVisits.length,
      first200Visits: fpVisits,
    },
    statSnapshots,
    listPointerFinal: {
      address: hex(LIST_PTR_TABLE),
      value: hex(read24(mem, LIST_PTR_TABLE)),
      bytes: bytesToHex(sliceBytes(mem, LIST_PTR_TABLE, 3)),
    },
    registers: captureRegisters(cpu),
  };
}

function formatTable(rows) {
  if (rows.length === 0) return '(none)';
  const widths = rows[0].map((_, columnIndex) =>
    Math.max(...rows.map((row) => String(row[columnIndex]).length))
  );
  return rows
    .map((row) => row.map((cell, columnIndex) => String(cell).padEnd(widths[columnIndex], ' ')).join(' | '))
    .join('\n');
}

function formatTopBlocksTable(blocks) {
  const rows = [
    ['#', 'Block', 'Visits', 'Kind', 'DASM'],
    ...blocks.map((block) => [
      block.rank,
      block.block,
      block.count,
      block.kind ?? '-',
      block.dasm ?? '-',
    ]),
  ];
  return formatTable(rows);
}

function formatFpValueForTable(decoded) {
  if (!decoded) return '-';
  return decoded.valid ? decoded.display : 'invalid';
}

function formatFpVisitsTable(visits) {
  const rows = [
    ['#', 'Step', 'Block', 'OP1', 'OP2', 'OP1 Raw', 'OP2 Raw'],
    ...visits.map((visit) => [
      visit.index,
      visit.step,
      visit.block,
      formatFpValueForTable(visit.op1),
      formatFpValueForTable(visit.op2),
      visit.op1?.rawHex ?? '-',
      visit.op2?.rawHex ?? '-',
    ]),
  ];
  return formatTable(rows);
}

function printReport(output) {
  const trace = output.trace;
  const fpPreview = trace.fpRange.first200Visits.slice(0, FP_TABLE_LIMIT);
  const terminationSuffix = trace.hitSentinel ? ` (${trace.hitSentinel.name} @ ${trace.hitSentinel.pc})` : '';
  const bufInsertSummary = trace.bufInsert.reached
    ? `YES at step ${trace.bufInsert.step} with DE=${trace.bufInsert.deHex}`
    : 'NO';

  console.log('Phase 213: STAT 50000-step trace + FP OP1/OP2 dump');
  console.log('');
  console.log(`Total steps: ${trace.totalSteps}`);
  console.log(`Total unique blocks: ${trace.uniqueBlockCount}`);
  console.log(`Termination: ${trace.termination}${terminationSuffix}`);
  console.log(`Late-seed at ${trace.lateSeed.targetBlock}: ${trace.lateSeed.applied ? `applied at step ${trace.lateSeed.step}` : 'not applied'}`);
  console.log(`Event loop ${hex(EVENT_LOOP)} visits: ${trace.eventLoopVisits}`);
  console.log(`BufInsert ${hex(BUF_INSERT)} reached: ${bufInsertSummary}`);
  console.log(`FP range ${trace.fpRange.start}-${trace.fpRange.end}: ${trace.fpRange.totalVisits} visits across ${trace.fpRange.uniqueBlocks} unique blocks (${trace.fpRange.capturedVisits} captured)`);
  console.log(`List pointer ${trace.listPointerFinal.address} at end: ${trace.listPointerFinal.value} [${trace.listPointerFinal.bytes}]`);
  console.log('');
  console.log('Top 20 Most-Visited Blocks');
  console.log(formatTopBlocksTable(trace.topVisitedBlocks));
  console.log('');
  console.log(`First ${fpPreview.length} FP-Range Visits`);
  console.log(formatFpVisitsTable(fpPreview));
  console.log('');
  console.log('STAT Struct Snapshots');
  for (const step of SNAPSHOT_STEPS) {
    const snapshot = trace.statSnapshots[step];
    const note = snapshot.note ? ` (${snapshot.note})` : '';
    console.log(`Step ${step}: ${snapshot.hex}${note}`);
  }
  console.log('');
  console.log(JSON.stringify(output, null, 2));
}

function main() {
  const startTime = Date.now();

  console.error('Creating runtime...');
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  console.error('Running cold boot...');
  const bootInfo = coldBoot(executor, cpu, mem);

  console.error('Running memInit...');
  const memInit = runMemInit(executor, cpu, mem);

  console.error('Seeding L1={1.0, 2.0, 3.0}...');
  const seedInfo = seedListL1(mem);

  console.error(`Running STAT from ${hex(STAT_ENTRY)} for ${TRACE_MAX_STEPS} steps...`);
  const trace = runStatTrace(executor, cpu, mem);

  const output = {
    probe: PROBE_NAME,
    generatedAt: new Date().toISOString(),
    elapsedMs: Date.now() - startTime,
    runtime: {
      timerInterrupt: false,
      statEntry: hex(STAT_ENTRY),
      bufInsert: hex(BUF_INSERT),
      eventLoop: hex(EVENT_LOOP),
      insertMemBlock: hex(INSERT_MEM_BLOCK),
      op1Addr: hex(OP1_ADDR),
      op2Addr: hex(OP2_ADDR),
      statStruct: hex(STAT_STRUCT),
      listPtrTable: hex(LIST_PTR_TABLE),
      stackTop: hex(STACK_TOP),
      mbase: hex(MBASE, 2),
      iy: hex(IY_ADDR),
      ix: hex(IX_ADDR),
      maxSteps: TRACE_MAX_STEPS,
      maxLoopIterations: TRACE_MAX_LOOP_ITERATIONS,
    },
    boot: bootInfo,
    memInit,
    listSeed: {
      dataAddr: hex(LIST_DATA_ADDR),
      dataEndAddr: hex(LIST_DATA_END_ADDR),
      vatEntryAddr: hex(VAT_ENTRY_ADDR),
      vatEndLowAddr: hex(VAT_END_LOW_ADDR),
      listBytes: seedInfo.listBytes,
      vatEntryBytes: seedInfo.vatEntryBytes,
      vatEndLowByte: seedInfo.vatEndLowByte,
      allocatorPointers: seedInfo.allocatorPointers,
    },
    trace,
    summary: {
      totalSteps: trace.totalSteps,
      uniqueBlocks: trace.uniqueBlockCount,
      termination: trace.termination,
      eventLoopVisits: trace.eventLoopVisits,
      bufInsertReached: trace.bufInsert.reached,
      bufInsertStep: trace.bufInsert.step,
      bufInsertDe: trace.bufInsert.deHex,
      fpVisits: trace.fpRange.totalVisits,
      fpUniqueBlocks: trace.fpRange.uniqueBlocks,
      lateSeedApplied: trace.lateSeed.applied,
      lateSeedStep: trace.lateSeed.step,
      listPointerFinal: trace.listPointerFinal.value,
    },
  };

  printReport(output);
}

try {
  main();
} catch (error) {
  console.error(error.stack || String(error));
  console.log(JSON.stringify({
    probe: PROBE_NAME,
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
