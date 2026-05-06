#!/usr/bin/env node
/**
 * probe-phase198-stat-rom-read.mjs
 *
 * Reads the raw ROM bytes at 0x0008E6, classifies the low-ROM region around
 * that address, and traces the STAT history/helper path that later executes
 * the LDDR at 0x092263.
 *
 * Key goals:
 *   1. Prove what lives at ROM 0x0008E6.
 *   2. Show how `sis ld de,(0x0008E6)` is interpreted by the lifted runtime.
 *   3. Trace BC/HL/DE at LDDR entry with seeded list sizes.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const INC_PATH = path.join(__dirname, 'references', 'ti84pceg.inc');

const romBytes = fs.readFileSync(ROM_PATH);
const includeText = fs.readFileSync(INC_PATH, 'utf8');
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = normalizeBlocks(romModule.PRELIFTED_BLOCKS);
const LABELS_BY_ADDR = buildIncludeLabelMap(includeText);

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;
const SHORT_MBASE = 0xD0;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

const ENTRY_ADDR = 0x058BA9;
const SCRATCH_UPDATE_BLOCK = 0x092210;
const LOAD_BLOCK = 0x092226;
const READY_BLOCK = 0x09224B;
const LDDR_BLOCK = 0x092263;

const SHORT_ADDR = 0x0008E6;
const SHORT_ADDR_EFFECTIVE = effectiveShortAddress(SHORT_ADDR);
const ROM_CONTEXT_START = 0x0008E0;
const RESET_VECTOR_START = 0x000000;
const JUMP_TABLE_WINDOW_START = 0x020000;
const JUMP_TABLE_ENTRY_BASE = 0x020104;
const JUMP_TABLE_ENTRY_COUNT = 980;
const JUMP_TABLE_ENTRY_SIZE = 4;
const JUMP_TABLE_ENTRY_END = JUMP_TABLE_ENTRY_BASE + (JUMP_TABLE_ENTRY_COUNT * JUMP_TABLE_ENTRY_SIZE) - 1;

const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;
const TRACE_STOP = '__PHASE198_TRACE_STOP__';

const SEGMENT_STEP_LIMIT = 2000;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const STAT_TRACE_MAX_STEPS = 5000;
const OS_MAX_LOOP_ITERATIONS = 8192;

const LIST_DATA_ADDR = 0xD10000;
const VAT_ENTRY_ADDR = 0xD1A800;
const LIST_PTR_TABLE_ADDR = 0xD01508;
const LIST_COUNT_ADDR = 0xD0150B;
const ACTIVE_LIST_ADDR = 0xD0150C;
const CURR_LIST_HIGHLIGHT_ADDR = 0xD0244B;
const LIST_NAME1_ADDR = 0xD02459;
const LIST_NAME_STRIDE = 5;
const LIST_NAME_SLOTS = 20;
const STATFLAGS_ADDR = 0xD00089;
const STATFLAGS2_ADDR = 0xD0009A;
const FPSBASE_ADDR = 0xD0258A;
const FPS_ADDR = 0xD0258D;
const OPBASE_ADDR = 0xD02590;
const OPS_ADDR = 0xD02593;
const PTEMPCNT_ADDR = 0xD02596;
const PTEMP_ADDR = 0xD0259A;
const PROGPTR_ADDR = 0xD0259D;
const NEWDATA_PTR_ADDR = 0xD025A0;

const VAT_ENTRY_BYTES = Uint8Array.from([
  0x01,
  LIST_DATA_ADDR & 0xFF,
  (LIST_DATA_ADDR >>> 8) & 0xFF,
  (LIST_DATA_ADDR >>> 16) & 0xFF,
  0x00,
  0x00,
  0x01,
  0x00,
]);

const SCENARIO_ELEMENT_COUNTS = [1, 2, 3, 4];

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function buildIncludeLabelMap(text) {
  const map = new Map();
  const re = /^\?([A-Za-z_][A-Za-z0-9_]*)\s*:=\s*0([0-9A-Fa-f]+)h/gm;
  let match;
  while ((match = re.exec(text)) !== null) {
    const name = match[1];
    const addr = parseInt(match[2], 16);
    const list = map.get(addr) ?? [];
    list.push(name);
    map.set(addr, list);
  }
  return map;
}

function labelsFor(addr) {
  return (LABELS_BY_ADDR.get(addr) ?? []).map((name) => `?${name}`);
}

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function byteAt(buffer, addr) {
  const index = ((addr % buffer.length) + buffer.length) % buffer.length;
  return buffer[index] ?? 0;
}

function hexByteArray(buffer, addr, len) {
  const bytes = [];
  for (let index = 0; index < len; index += 1) {
    bytes.push(byteAt(buffer, addr + index).toString(16).toUpperCase().padStart(2, '0'));
  }
  return bytes;
}

function hexBytes(buffer, addr, len) {
  return hexByteArray(buffer, addr, len).join(' ');
}

function read16Raw(buffer, addr) {
  return byteAt(buffer, addr) | (byteAt(buffer, addr + 1) << 8);
}

function read24Raw(buffer, addr) {
  return byteAt(buffer, addr) | (byteAt(buffer, addr + 1) << 8) | (byteAt(buffer, addr + 2) << 16);
}

function write16(mem, addr, value) {
  const mask = mem.length - 1;
  const a = addr & 0xFFFFFF;
  mem[a & mask] = value & 0xFF;
  mem[(a + 1) & mask] = (value >>> 8) & 0xFF;
}

function write24(mem, addr, value) {
  const mask = mem.length - 1;
  const a = addr & 0xFFFFFF;
  mem[a & mask] = value & 0xFF;
  mem[(a + 1) & mask] = (value >>> 8) & 0xFF;
  mem[(a + 2) & mask] = (value >>> 16) & 0xFF;
}

function writeBytes(mem, addr, bytes) {
  const mask = mem.length - 1;
  const a = addr & 0xFFFFFF;
  for (let index = 0; index < bytes.length; index += 1) {
    mem[(a + index) & mask] = bytes[index] & 0xFF;
  }
}

function blockKey(pc, mode = 'adl') {
  return `${(pc & 0xFFFFFF).toString(16).padStart(6, '0')}:${mode}`;
}

function effectiveShortAddress(addr, mbase = SHORT_MBASE) {
  return (((mbase & 0xFF) << 16) | (addr & 0xFFFF)) & 0xFFFFFF;
}

function formatShortAddr(addr, modePrefix) {
  if (modePrefix === 'sis' || modePrefix === 'lis') {
    return `${hex(addr)} => ${hex(effectiveShortAddress(addr))}`;
  }
  return hex(addr);
}

function fmtIndex(indexRegister, displacement) {
  return `(${indexRegister}${displacement >= 0 ? '+' : ''}${displacement})`;
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  switch (inst.tag) {
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') return `${prefix}ld (${formatShortAddr(inst.addr, inst.modePrefix)}), ${inst.pair}`;
      return `${prefix}ld ${inst.pair}, (${formatShortAddr(inst.addr, inst.modePrefix)})`;
    case 'ld-pair-imm':
      return `${prefix}ld ${inst.pair}, ${hex(inst.value)}`;
    case 'add-pair':
      return `${prefix}add ${inst.dest}, ${inst.src}`;
    case 'sbc-pair':
      return `${prefix}sbc hl, ${inst.src}`;
    case 'push':
      return `${prefix}push ${inst.pair}`;
    case 'pop':
      return `${prefix}pop ${inst.pair}`;
    case 'inc-pair':
      return `${prefix}inc ${inst.pair}`;
    case 'dec-pair':
      return `${prefix}dec ${inst.pair}`;
    case 'ld-ixd-imm':
      return `${prefix}ld ${fmtIndex(inst.indexRegister, inst.displacement)}, ${hex(inst.value, 2)}`;
    case 'ld-reg-imm':
      return `${prefix}ld ${inst.dest}, ${hex(inst.value, 2)}`;
    case 'ld-reg-mem':
      return `${prefix}ld ${inst.dest}, (${formatShortAddr(inst.addr, inst.modePrefix)})`;
    case 'ld-mem-reg':
      return `${prefix}ld (${formatShortAddr(inst.addr, inst.modePrefix)}), ${inst.src}`;
    case 'call':
      return `${prefix}call ${hex(inst.target)}`;
    case 'jr':
      return `${prefix}jr ${hex(inst.target)}`;
    case 'jr-conditional':
      return `${prefix}jr ${inst.condition}, ${hex(inst.target)}`;
    case 'ret':
      return `${prefix}ret`;
    case 'ldir':
      return `${prefix}ldir`;
    case 'lddr':
      return `${prefix}lddr`;
    case 'alu-reg':
      return `${prefix}${inst.op} ${inst.src}`;
    case 'ex-de-hl':
      return `${prefix}ex de, hl`;
    case 'or-a':
      return `${prefix}or a`;
    default:
      return `${prefix}${inst.tag}`;
  }
}

function decodeSpan(startAddr, maxInstructions, mode = 'adl') {
  const rows = [];
  let pc = startAddr;
  for (let index = 0; index < maxInstructions; index += 1) {
    if (pc >= romBytes.length) break;
    try {
      const inst = decodeInstruction(romBytes, pc, mode);
      const bytes = hexBytes(romBytes, pc, inst.length || 1);
      rows.push({
        pc: hex(pc),
        bytes,
        tag: inst.tag,
        mnemonic: formatInstruction(inst),
      });
      pc = inst.nextPc ?? (pc + Math.max(inst.length ?? 1, 1));
      if (inst.tag === 'ret' || inst.tag === 'jp' || inst.tag === 'halt' || inst.tag === 'reti' || inst.tag === 'retn') {
        break;
      }
    } catch (error) {
      rows.push({
        pc: hex(pc),
        bytes: hexBytes(romBytes, pc, 1),
        error: error.message,
      });
      pc += 1;
    }
  }
  return rows;
}

function describeBlockSourceLine(pc, needle) {
  const source = BLOCKS[blockKey(pc)]?.source ?? '';
  return source.split('\n').map((line) => line.trim()).find((line) => line.includes(needle)) ?? null;
}

function classifyRomAddress(addr) {
  const result = {
    addr: hex(addr),
    jumpTableWindowStart: hex(JUMP_TABLE_WINDOW_START),
    jumpTableEntryBase: hex(JUMP_TABLE_ENTRY_BASE),
    jumpTableEntryEnd: hex(JUMP_TABLE_ENTRY_END),
  };

  if (addr < 0x20) {
    return {
      ...result,
      kind: 'reset_vector_region',
      note: 'Low reset/interrupt vector region at the start of ROM.',
    };
  }

  if (addr >= JUMP_TABLE_ENTRY_BASE && addr <= JUMP_TABLE_ENTRY_END) {
    return {
      ...result,
      kind: 'os_jump_table_entries',
      note: 'Inside the CE JP-format OS jump table entry range.',
    };
  }

  if (addr < JUMP_TABLE_WINDOW_START) {
    return {
      ...result,
      kind: 'low_rom_executable_code',
      note: 'Executable low-ROM helper code below the jump-table window.',
    };
  }

  if (addr < JUMP_TABLE_ENTRY_BASE) {
    return {
      ...result,
      kind: 'pre_jump_table_window',
      note: 'Inside the 0x020000 window but before the JP entry base at 0x020104.',
    };
  }

  return {
    ...result,
    kind: 'main_os_rom',
    note: 'Regular ROM code/data outside the low-vector and jump-table windows.',
  };
}

function serializeExit(exit) {
  return {
    type: exit.type,
    condition: exit.condition ?? null,
    target: exit.target === undefined ? null : hex(exit.target),
    targetMode: exit.targetMode ?? null,
  };
}

function blockInstructionLabel(block) {
  return block?.instructions?.[0]?.dasm ?? 'missing';
}

function findInboundPredecessors(targetPc, targetMode = 'adl', limit = 12) {
  const matches = [];
  for (const block of Object.values(BLOCKS)) {
    const exits = (block?.exits ?? []).filter((exit) => exit?.target === targetPc && (exit?.targetMode ?? null) === targetMode);
    if (!exits.length) continue;
    matches.push({
      predecessorBlock: block.id,
      firstInstruction: blockInstructionLabel(block),
      matchingExits: exits.map(serializeExit),
    });
  }
  matches.sort((left, right) => left.predecessorBlock.localeCompare(right.predecessorBlock));
  return matches.slice(0, limit);
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

function runTraceSegmented(executor, entry, mode, options = {}) {
  const sentinels = options.sentinels ?? new Map();
  const totalMaxSteps = options.totalMaxSteps ?? STAT_TRACE_MAX_STEPS;
  const maxLoopIterations = options.maxLoopIterations ?? OS_MAX_LOOP_ITERATIONS;
  const onBlock = options.onBlock ?? null;
  const onMissingBlock = options.onMissingBlock ?? null;

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
          const norm = pc & 0xFFFFFF;
          const localStep = (step ?? 0) + 1;
          const globalStep = totalSteps + localStep;
          segmentObservedSteps = Math.max(segmentObservedSteps, localStep);
          lastPc = norm;
          lastMode = dispatchMode ?? lastMode;
          if (onBlock) {
            onBlock({
              pc: norm,
              mode: dispatchMode ?? lastMode,
              meta,
              step: globalStep,
            });
          }
          if (sentinels.has(norm)) throw makeStop(sentinels.get(norm), norm);
        },
        onMissingBlock(pc, dispatchMode, step) {
          const norm = pc & 0xFFFFFF;
          const localStep = (step ?? 0) + 1;
          const globalStep = totalSteps + localStep;
          segmentObservedSteps = Math.max(segmentObservedSteps, localStep);
          lastPc = norm;
          lastMode = dispatchMode ?? lastMode;
          if (onMissingBlock) {
            onMissingBlock({
              pc: norm,
              mode: dispatchMode ?? lastMode,
              step: globalStep,
            });
          }
          if (sentinels.has(norm)) throw makeStop(sentinels.get(norm), norm);
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
      if (error?.message === TRACE_STOP) {
        hitSentinel = {
          name: error.stopName,
          pc: hex(error.stopPc),
        };
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

function resetCpuForOsCall(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = SHORT_MBASE;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function resetCpuForStatEntry(cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  cpu.a = 0x31;
  cpu.sp -= 3;
  write24(mem, cpu.sp, RETURN_SENTINEL);
}

function snapshotRegisters(cpu) {
  return {
    pc: hex(cpu._currentBlockPc ?? 0),
    a: hex(cpu.a, 2),
    f: hex(cpu.f, 2),
    bc: hex(cpu._bc),
    de: hex(cpu._de),
    hl: hex(cpu._hl),
    sp: hex(cpu.sp),
    ix: hex(cpu._ix),
    iy: hex(cpu._iy),
    madl: cpu.madl,
    mbase: hex(cpu.mbase, 2),
  };
}

function bootRuntime(executor, cpu, mem) {
  const bootResult = runStageInSegments(executor, BOOT_ENTRY, 'z80', BOOT_MAX_STEPS, 32);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInitResult = runStageInSegments(executor, KERNEL_INIT_ENTRY, 'adl', KERNEL_INIT_MAX_STEPS, 10000);

  cpu.mbase = SHORT_MBASE;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const postInitResult = runStageInSegments(executor, POST_INIT_ENTRY, 'adl', POST_INIT_MAX_STEPS, 32);

  return {
    boot: { steps: bootResult.steps, lastPc: hex(bootResult.lastPc), termination: bootResult.termination },
    kernelInit: { steps: kernelInitResult.steps, lastPc: hex(kernelInitResult.lastPc), termination: kernelInitResult.termination },
    postInit: { steps: postInitResult.steps, lastPc: hex(postInitResult.lastPc), termination: postInitResult.termination },
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

function createRuntimeFromMemory(memImage) {
  const mem = memImage.slice();
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { mem, peripherals, executor, cpu: executor.cpu };
}

function createFreshRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));
  return createRuntimeFromMemory(mem);
}

function buildPreparedBaseMemory() {
  const runtime = createFreshRuntime();
  const boot = bootRuntime(runtime.executor, runtime.cpu, runtime.mem);
  const memInit = runMemInit(runtime.executor, runtime.cpu, runtime.mem);
  return {
    boot,
    memInit: {
      steps: memInit.steps,
      termination: memInit.termination,
      hitSentinel: memInit.hitSentinel,
      finalPc: hex(memInit.lastPc),
      finalMode: memInit.lastMode,
      errorMessage: memInit.errorMessage,
    },
    baseMemory: runtime.mem.slice(),
  };
}

function makeListElements(elementCount) {
  const elements = [];
  for (let index = 0; index < elementCount; index += 1) {
    const nibble = ((index % 9) + 1) << 4;
    elements.push(Uint8Array.from([0x00, 0x80, nibble & 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]));
  }
  return elements;
}

function seedStatLists(mem, elementCount) {
  const elements = makeListElements(elementCount);
  const listDataLen = 2 + (elements.length * 9);
  const listDataEnd = LIST_DATA_ADDR + listDataLen;

  mem.fill(0x00, LIST_DATA_ADDR, LIST_DATA_ADDR + 0x200);
  mem.fill(0x00, VAT_ENTRY_ADDR, VAT_ENTRY_ADDR + 0x20);
  write16(mem, LIST_DATA_ADDR, elements.length);
  for (let index = 0; index < elements.length; index += 1) {
    writeBytes(mem, LIST_DATA_ADDR + 2 + (index * 9), elements[index]);
  }

  writeBytes(mem, VAT_ENTRY_ADDR, VAT_ENTRY_BYTES);

  write24(mem, OPBASE_ADDR, VAT_ENTRY_ADDR);
  write24(mem, OPS_ADDR, VAT_ENTRY_ADDR + VAT_ENTRY_BYTES.length);
  mem.fill(0x00, PTEMPCNT_ADDR, PTEMPCNT_ADDR + 4);
  write24(mem, PTEMP_ADDR, VAT_ENTRY_ADDR + VAT_ENTRY_BYTES.length);
  write24(mem, PROGPTR_ADDR, VAT_ENTRY_ADDR);
  write24(mem, NEWDATA_PTR_ADDR, listDataEnd);

  write24(mem, LIST_PTR_TABLE_ADDR, LIST_DATA_ADDR);
  mem[LIST_COUNT_ADDR] = 0x01;
  mem[ACTIVE_LIST_ADDR] = 0x01;

  mem[STATFLAGS_ADDR] |= 0x40;
  mem[STATFLAGS2_ADDR] |= 0x04;

  mem[CURR_LIST_HIGHLIGHT_ADDR] = 0x00;
  mem[CURR_LIST_HIGHLIGHT_ADDR + 1] = 0x00;
  mem.fill(0x00, LIST_NAME1_ADDR, LIST_NAME1_ADDR + (LIST_NAME_SLOTS * LIST_NAME_STRIDE));
  writeBytes(mem, LIST_NAME1_ADDR, Uint8Array.from([0xDC, 0x00, 0x00, 0x00, 0x00]));

  return {
    elementCount,
    listDataAddr: hex(LIST_DATA_ADDR),
    listDataLen,
    listDataBytes: hexBytes(mem, LIST_DATA_ADDR, Math.min(listDataLen, 64)),
    listPayloadStart: hex(LIST_DATA_ADDR + 2),
    listPayloadEnd: hex(listDataEnd - 1),
    expectedElementPayloadBytes: elementCount * 9,
    expectedHeaderExcludedCount: Math.max((elementCount * 9) - 2, 0),
    pointerTable: {
      pointer0: hex(read24Raw(mem, LIST_PTR_TABLE_ADDR)),
      countByte: hex(mem[LIST_COUNT_ADDR], 2),
      activeListByte: hex(mem[ACTIVE_LIST_ADDR], 2),
    },
  };
}

function recordVisit(sequence, step, pc, mode, kind, block) {
  sequence.push({
    step,
    blockId: blockKey(pc, mode),
    pc: hex(pc),
    mode,
    kind,
    instruction: blockInstructionLabel(block),
  });
}

function analyzeLddrRange(hl, de, bc, elementCount) {
  const payloadStart = LIST_DATA_ADDR + 2;
  const payloadEnd = payloadStart + (elementCount * 9) - 1;
  const sourceStart = bc > 0 ? ((hl - bc + 1) & 0xFFFFFF) : null;
  const destStart = bc > 0 ? ((de - bc + 1) & 0xFFFFFF) : null;

  const sourceStartsAtPayload = sourceStart === payloadStart;
  const sourceEndsAtPayloadEnd = hl === payloadEnd;

  return {
    byteCountDecimal: bc,
    byteCountHex: hex(bc),
    sourceStart: sourceStart === null ? null : hex(sourceStart),
    sourceEnd: hex(hl),
    destStart: destStart === null ? null : hex(destStart),
    destEnd: hex(de),
    payloadStart: hex(payloadStart),
    payloadEnd: elementCount > 0 ? hex(payloadEnd) : null,
    sourceStartMinusPayloadStart: sourceStart === null ? null : sourceStart - payloadStart,
    sourceEndMinusPayloadEnd: elementCount > 0 ? hl - payloadEnd : null,
    sourceStartsAtPayload,
    sourceEndsAtPayloadEnd,
    payloadBytes: elementCount * 9,
    payloadBytesMinusTwo: Math.max((elementCount * 9) - 2, 0),
    bcMatchesPayloadBytesMinusTwo: bc === Math.max((elementCount * 9) - 2, 0),
    rangeMatchesHeaderExcludedHypothesis: sourceStartsAtPayload && bc === Math.max((elementCount * 9) - 2, 0),
  };
}

function captureLoadWatch(cpu, mem, elementCount, step) {
  const raw16 = read16Raw(mem, SHORT_ADDR_EFFECTIVE);
  const raw24 = read24Raw(mem, SHORT_ADDR_EFFECTIVE);
  return {
    step,
    entryRegisters: snapshotRegisters(cpu),
    instruction: formatInstruction(decodeInstruction(romBytes, LOAD_BLOCK, 'adl')),
    shortAddress: hex(SHORT_ADDR),
    effectiveAddress: hex(SHORT_ADDR_EFFECTIVE),
    effectiveAddressLabels: labelsFor(SHORT_ADDR_EFFECTIVE),
    readWidthBits: 16,
    sourceBytesAtEffectiveAddress: hexBytes(mem, SHORT_ADDR_EFFECTIVE, 3),
    loadedWord16: hex(raw16, 4),
    loadedWord24Preview: hex(raw24),
    deAfterTwoInc: hex((raw16 + 2) & 0xFFFFFF),
    seededFormulaPayloadMinusTwo: hex(Math.max((elementCount * 9) - 2, 0)),
  };
}

function captureReadyWatch(cpu, mem, step) {
  return {
    step,
    entryRegisters: snapshotRegisters(cpu),
    scratchBytesAtEffectiveAddress: hexBytes(mem, SHORT_ADDR_EFFECTIVE, 3),
    scratchWord16: hex(read16Raw(mem, SHORT_ADDR_EFFECTIVE), 4),
  };
}

function captureLddrEntry(cpu, mem, elementCount, step) {
  const bc = cpu._bc & 0xFFFFFF;
  const de = cpu._de & 0xFFFFFF;
  const hl = cpu._hl & 0xFFFFFF;
  return {
    step,
    entryRegisters: snapshotRegisters(cpu),
    rangeAnalysis: analyzeLddrRange(hl, de, bc, elementCount),
    effectiveScratchBytes: hexBytes(mem, SHORT_ADDR_EFFECTIVE, 3),
    effectiveScratchWord16: hex(read16Raw(mem, SHORT_ADDR_EFFECTIVE), 4),
  };
}

function traceScenario(preparedBase, elementCount) {
  const runtime = createRuntimeFromMemory(preparedBase.baseMemory);
  const seed = seedStatLists(runtime.mem, elementCount);
  const { executor, cpu, mem } = runtime;

  resetCpuForStatEntry(cpu, mem);

  const visits = [];
  let loadWatch = null;
  let readyWatch = null;
  let lddrEntry = null;

  const trace = runTraceSegmented(executor, ENTRY_ADDR, 'adl', {
    totalMaxSteps: STAT_TRACE_MAX_STEPS,
    maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
    sentinels: new Map([
      [LDDR_BLOCK, 'lddr_entry'],
      [BOOT_ENTRY, 'boot_crash'],
      [RETURN_SENTINEL, 'return_hit'],
    ]),
    onBlock(event) {
      recordVisit(visits, event.step, event.pc, event.mode, 'block', event.meta);
      if (event.pc === LOAD_BLOCK && !loadWatch) {
        loadWatch = captureLoadWatch(cpu, mem, elementCount, event.step);
      }
      if (event.pc === READY_BLOCK && !readyWatch) {
        readyWatch = captureReadyWatch(cpu, mem, event.step);
      }
      if (event.pc === LDDR_BLOCK && !lddrEntry) {
        lddrEntry = captureLddrEntry(cpu, mem, elementCount, event.step);
      }
    },
    onMissingBlock(event) {
      recordVisit(visits, event.step, event.pc, event.mode, 'missing', null);
    },
  });

  return {
    elementCount,
    seed,
    trace: {
      steps: trace.steps,
      termination: trace.termination,
      hitSentinel: trace.hitSentinel,
      finalPc: hex(trace.lastPc),
      finalMode: trace.lastMode,
      errorMessage: trace.errorMessage,
      reachedLoadBlock: !!loadWatch,
      reachedReadyBlock: !!readyWatch,
      reachedLddr: !!lddrEntry,
      watch092226: loadWatch,
      watch09224B: readyWatch,
      lddrEntry,
      lastVisits: visits.slice(-18),
    },
  };
}

function summarizeScenarios(scenarios) {
  const rows = scenarios.map((scenario) => {
    const bc = scenario.trace.lddrEntry?.rangeAnalysis?.byteCountDecimal ?? null;
    const expectedMinusTwo = scenario.seed.expectedHeaderExcludedCount;
    return {
      elementCount: scenario.elementCount,
      reachedLddr: scenario.trace.reachedLddr,
      observedLddrBc: bc,
      observedLddrBcHex: bc === null ? null : hex(bc),
      expectedPayloadMinusTwo: expectedMinusTwo,
      expectedPayloadMinusTwoHex: hex(expectedMinusTwo),
      bcMatchesPayloadMinusTwo: bc === expectedMinusTwo,
      sourceStartsAtPayload: scenario.trace.lddrEntry?.rangeAnalysis?.sourceStartsAtPayload ?? null,
      sourceEndsAtPayloadEnd: scenario.trace.lddrEntry?.rangeAnalysis?.sourceEndsAtPayloadEnd ?? null,
      effectiveScratchWord16: scenario.trace.watch092226?.loadedWord16 ?? null,
    };
  });

  const observedCounts = rows.filter((row) => row.observedLddrBc !== null).map((row) => row.observedLddrBc);
  const uniqueCounts = [...new Set(observedCounts)];

  return {
    scenarioRows: rows,
    allReachedLddr: rows.every((row) => row.reachedLddr),
    lddrCountChangesWithListSize: uniqueCounts.length > 1,
    uniqueObservedLddrCounts: uniqueCounts.map((value) => hex(value)),
    allObservedCountsMatchPayloadMinusTwo: rows.filter((row) => row.observedLddrBc !== null).every((row) => row.bcMatchesPayloadMinusTwo),
    anyRangeMatchesHeaderExcludedHypothesis: rows.some((row) => row.sourceStartsAtPayload && row.bcMatchesPayloadMinusTwo),
  };
}

function inspectRomLowAddress() {
  const instAtShortAddr = decodeInstruction(romBytes, SHORT_ADDR, 'adl');
  return {
    romAddress: hex(SHORT_ADDR),
    rawBytes3: hexBytes(romBytes, SHORT_ADDR, 3),
    littleEndian24Interpretation: hex(read24Raw(romBytes, SHORT_ADDR)),
    context16From0008E0: hexBytes(romBytes, ROM_CONTEXT_START, 16),
    decodedAt0008E6: {
      mnemonic: formatInstruction(instAtShortAddr),
      bytes: hexBytes(romBytes, SHORT_ADDR, instAtShortAddr.length),
      tag: instAtShortAddr.tag,
    },
    regionClassification: classifyRomAddress(SHORT_ADDR),
    lowRomRoutine0008C8: {
      disassembly: decodeSpan(0x0008C8, 8, 'adl'),
      inboundPredecessors: findInboundPredecessors(0x0008C8),
    },
    lowRomRoutine0008D9: {
      disassembly: decodeSpan(0x0008D9, 12, 'adl'),
    },
  };
}

function inspectStatScratchSemantics() {
  return {
    shortAddressLoad: {
      instructionPc: hex(LOAD_BLOCK),
      instruction: formatInstruction(decodeInstruction(romBytes, LOAD_BLOCK, 'adl')),
      effectiveAddressWithMbaseD0: hex(SHORT_ADDR_EFFECTIVE),
      effectiveAddressLabels: labelsFor(SHORT_ADDR_EFFECTIVE),
      transpiledReadLine: describeBlockSourceLine(LOAD_BLOCK, 'cpu.de ='),
      readWidthBits: 16,
      note: 'The lifted block reads read16((mbase << 16) | 0x08E6), so this is a short-addressed RAM read, not a 24-bit ROM literal fetch.',
    },
    shortAddressUpdate: {
      instructionPc: hex(SCRATCH_UPDATE_BLOCK),
      disassembly: decodeSpan(SCRATCH_UPDATE_BLOCK, 8, 'adl'),
      transpiledStoreLine: describeBlockSourceLine(SCRATCH_UPDATE_BLOCK, 'cpu.write16'),
    },
    lddrFollowup: {
      instructionPc: hex(LDDR_BLOCK),
      disassembly: decodeSpan(LDDR_BLOCK, 12, 'adl'),
      ldirScratchSourceLine: describeBlockSourceLine(LDDR_BLOCK, 'cpu.hl = 0xd008e6'),
    },
  };
}

function main() {
  const preparedBase = buildPreparedBaseMemory();
  const scenarios = SCENARIO_ELEMENT_COUNTS.map((elementCount) => traceScenario(preparedBase, elementCount));

  const output = {
    probe: 'probe-phase198-stat-rom-read.mjs',
    constraints: {
      timerInterrupt: false,
      stackTop: hex(STACK_TOP),
      shortMbase: hex(SHORT_MBASE, 2),
      statEntry: hex(ENTRY_ADDR),
      lddrBlock: hex(LDDR_BLOCK),
      scenarioElementCounts: SCENARIO_ELEMENT_COUNTS,
    },
    romReads: {
      resetVectorBytes000000_00001F: hexBytes(romBytes, RESET_VECTOR_START, 0x20),
      shortAddressInspection: inspectRomLowAddress(),
    },
    memoryMap: {
      resetVectorRegion: classifyRomAddress(RESET_VECTOR_START),
      lowRomRegion000800_000900: {
        start: hex(0x000800),
        end: hex(0x0008FF),
        classification: classifyRomAddress(0x0008E6),
        note: 'This window sits in executable low ROM below the 0x020000 jump-table window.',
      },
      jumpTable: {
        windowStart: hex(JUMP_TABLE_WINDOW_START),
        entryBase: hex(JUMP_TABLE_ENTRY_BASE),
        entryEnd: hex(JUMP_TABLE_ENTRY_END),
        entryCount: JUMP_TABLE_ENTRY_COUNT,
        entrySize: JUMP_TABLE_ENTRY_SIZE,
      },
    },
    shortAddressSemantics: inspectStatScratchSemantics(),
    preparedBase,
    scenarios,
    scenarioSummary: summarizeScenarios(scenarios),
    conclusionsToCheck: {
      rom0008E6IsLiteral19: false,
      rom0008E6DecodedAsExecutableCode: true,
      shortAddressTargetsRamNotRom: true,
      ramTargetLabels: labelsFor(SHORT_ADDR_EFFECTIVE),
    },
  };

  console.log(JSON.stringify(output, null, 2));
}

main();
