#!/usr/bin/env node
/**
 * probe-phase211-stat-late-seed.mjs
 *
 * Full STAT probe with the late-seed 0xD01508 fix discovered in session 210.
 *
 * Root cause: address 0xD01508 (list pointer table base) reads as 0x000000
 * because it's uninitialized after the context installer at 0x091E13 runs.
 * This causes InsertMem's LDDR at 0x092263 to copy ~3 million bytes,
 * corrupting all RAM.
 *
 * Fix: seed 0xD01508 = 0xD01600 AFTER the context installer runs (when
 * block 0x092226 is first visited).
 *
 * This probe traces 10000 steps and reports block coverage, FP math
 * reachability, STAT struct evolution, and top-visited blocks.
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
transpiledUrl.searchParams.set('phase211', `${Date.now()}`);
const romModule = await import(transpiledUrl.href);
const BLOCKS = normalizeBlocks(romModule.PRELIFTED_BLOCKS);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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
const TRACE_STOP = '__PHASE211_TRACE_STOP__';

const SEGMENT_STEP_LIMIT = 2000;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const OS_MAX_LOOP_ITERATIONS = 8192;

const STAT_TOTAL_STEPS = 10000;

// Key addresses
const OP1_ADDR = 0xD005F8;
const STAT_STRUCT_START = 0xD008E6;
const LIST_DATA_ADDR = 0xD01600;
const LIST_DATA_END_ADDR = 0xD0161E;
const LIST_PTR_TABLE = 0xD01508;
const LIST_COUNT_ADDR = 0xD0150B;
const ACTIVE_LIST_ADDR = 0xD0150C;
const VAT_ENTRY_ADDR = 0xD1A800;
const VAT_ENTRY_LEN = 8;
const CONTEXT_INSTALLER_BLOCK = 0x091E13;
const EVENT_LOOP_BLOCK = 0x082BE2;
const BUFINSERT_BLOCK = 0x05E2A0;
const INSERTMEM_BLOCK = 0x092226;
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
const USERMEM_ADDR = 0xD1A881;
const ALLOCATOR_SEED_ADDR = 0xD01700;
const STAT_TOKEN = 0x31;

// ---------------------------------------------------------------------------
// Utility functions
// ---------------------------------------------------------------------------

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
    return Object.fromEntries(rawBlocks.filter((b) => b?.id).map((b) => [b.id, b]));
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
  for (let i = 0; i < len; i++) {
    out[i] = mem[(addr + i) & MEM_MASK] & 0xFF;
  }
  return out;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (v) => v.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function bytesToAscii(bytes) {
  return Array.from(bytes, (v) => (v >= 0x20 && v <= 0x7E) ? String.fromCharCode(v) : '.').join('');
}

function makeStop(name, pc) {
  const error = new Error(TRACE_STOP);
  error.stopName = name;
  error.stopPc = pc & 0xFFFFFF;
  return error;
}

// ---------------------------------------------------------------------------
// Boot sequence
// ---------------------------------------------------------------------------

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
        maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
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

// ---------------------------------------------------------------------------
// List seeding
// ---------------------------------------------------------------------------

function seedListL1(mem) {
  // Count: 3 (little-endian, 3 bytes per task spec: 03 00 00)
  mem[LIST_DATA_ADDR] = 0x03;
  mem[LIST_DATA_ADDR + 1] = 0x00;
  mem[LIST_DATA_ADDR + 2] = 0x00;

  // Element 1: 1.0 in TI BCD (9 bytes) at 0xD01603
  const e1 = LIST_DATA_ADDR + 3;
  const elem1 = [0x00, 0x80, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  for (let i = 0; i < 9; i++) mem[e1 + i] = elem1[i];

  // Element 2: 2.0 at 0xD0160C
  const e2 = e1 + 9;
  const elem2 = [0x00, 0x80, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  for (let i = 0; i < 9; i++) mem[e2 + i] = elem2[i];

  // Element 3: 3.0 at 0xD01615
  const e3 = e2 + 9;
  const elem3 = [0x00, 0x80, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  for (let i = 0; i < 9; i++) mem[e3 + i] = elem3[i];

  // VAT entry at 0xD1A800: type=0x01, pointer=0xD01600 (LE), name=0x5D 0x00
  mem.fill(0x00, VAT_ENTRY_ADDR, VAT_ENTRY_ADDR + VAT_ENTRY_LEN);
  mem[VAT_ENTRY_ADDR] = 0x01;
  mem[VAT_ENTRY_ADDR + 1] = LIST_DATA_ADDR & 0xFF;          // 0x00
  mem[VAT_ENTRY_ADDR + 2] = (LIST_DATA_ADDR >>> 8) & 0xFF;  // 0x16
  mem[VAT_ENTRY_ADDR + 3] = (LIST_DATA_ADDR >>> 16) & 0xFF; // 0xD0
  mem[VAT_ENTRY_ADDR + 4] = 0x5D; // L
  mem[VAT_ENTRY_ADDR + 5] = 0x00; // subscript 0 = L1

  // Carry over the allocator/list-editor scaffolding used by the earlier STAT probes.
  write24(mem, OPBASE_ADDR, VAT_ENTRY_ADDR);
  write24(mem, OPS_ADDR, VAT_ENTRY_ADDR + VAT_ENTRY_LEN);
  mem.fill(0x00, PTEMPCNT_ADDR, PTEMPCNT_ADDR + 4);
  write24(mem, PTEMP_ADDR, ALLOCATOR_SEED_ADDR);
  write24(mem, PROGPTR_ADDR, VAT_ENTRY_ADDR);
  write24(mem, NEWDATA_PTR_ADDR, ALLOCATOR_SEED_ADDR);
  write24(mem, LEGACY_USERMEM_SCRATCH_ADDR, ALLOCATOR_SEED_ADDR);
  write24(mem, USERMEM_ADDR, ALLOCATOR_SEED_ADDR);

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
    allocatorPointers: {
      opBase: hex(read24(mem, OPBASE_ADDR)),
      ops: hex(read24(mem, OPS_ADDR)),
      pTemp: hex(read24(mem, PTEMP_ADDR)),
      progPtr: hex(read24(mem, PROGPTR_ADDR)),
      newDataPtr: hex(read24(mem, NEWDATA_PTR_ADDR)),
      legacyScratchAtD0247C: hex(read24(mem, LEGACY_USERMEM_SCRATCH_ADDR)),
      userMem: hex(read24(mem, USERMEM_ADDR)),
    },
  };
}

// ---------------------------------------------------------------------------
// Main STAT trace with late-seed fix
// ---------------------------------------------------------------------------

function runStatWithLateSeed(executor, cpu, mem) {
  resetCpuForOsCall(cpu, mem);
  cpu.a = STAT_TOKEN;
  cpu.sp -= 3;
  write24(mem, cpu.sp, RETURN_SENTINEL);

  // Tracking state
  const blockFreq = new Map();
  const visitedSet = new Set();
  const visitedOrder = [];
  const visitKinds = new Map();
  let totalSteps = 0;
  let lateSeedApplied = false;
  let lateSeedAtStep = -1;
  let lateSeedPc = null;
  let lateSeedReason = null;
  let lateSeedEventKind = null;
  let contextInstallerSeenAtStep = -1;
  let insertMemSeenAtStep = -1;
  let termination = 'unknown';
  let hitSentinel = null;
  let errorMessage = null;
  let lastPc = STAT_ENTRY;
  let lastMode = 'adl';

  // Snapshots of STAT struct at specific steps
  const statSnapshots = {};
  const SNAPSHOT_STEPS = [1000, 5000, 10000];

  // Per-block step tracking
  let currentPc = STAT_ENTRY;
  let currentMode = 'adl';

  function noteVisit(pc, kind) {
    blockFreq.set(pc, (blockFreq.get(pc) || 0) + 1);
    if (!visitedSet.has(pc)) {
      visitedSet.add(pc);
      visitedOrder.push(pc);
    }
    if (!visitKinds.has(pc)) visitKinds.set(pc, new Set());
    visitKinds.get(pc).add(kind);
  }

  function maybeApplyLateSeed(pc, globalStep, eventKind) {
    if (pc === CONTEXT_INSTALLER_BLOCK && contextInstallerSeenAtStep < 0) {
      contextInstallerSeenAtStep = globalStep;
    }
    if (pc === INSERTMEM_BLOCK && insertMemSeenAtStep < 0) {
      insertMemSeenAtStep = globalStep;
    }

    if (lateSeedApplied) return;

    const isInsertMemEntry = pc === INSERTMEM_BLOCK;
    const isPostContext09Range =
      contextInstallerSeenAtStep >= 0 &&
      pc > INSERTMEM_BLOCK &&
      pc < 0x093000;

    if (!isInsertMemEntry && !isPostContext09Range) return;

    write24(mem, LIST_PTR_TABLE, LIST_DATA_ADDR);
    lateSeedApplied = true;
    lateSeedAtStep = globalStep;
    lateSeedPc = pc;
    lateSeedReason = isInsertMemEntry ? 'insertmem_entry' : 'post_context_installer_09xxxx';
    lateSeedEventKind = eventKind;
  }

  function describeBlock(pc) {
    const kinds = [...(visitKinds.get(pc) ?? [])].sort();
    return {
      pc: hex(pc),
      count: blockFreq.get(pc) || 0,
      kind: kinds.length === 0 ? null : kinds.join('+'),
      dasm: firstInstructionLabel(pc),
    };
  }

  while (totalSteps < STAT_TOTAL_STEPS) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, STAT_TOTAL_STEPS - totalSteps);
    let segmentSteps = 0;

    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
        onBlock(pc, dispatchMode, _meta, step) {
          const norm = pc & 0xFFFFFF;
          const globalStep = totalSteps + (step ?? 0) + 1;
          segmentSteps = Math.max(segmentSteps, (step ?? 0) + 1);
          lastPc = norm;
          lastMode = dispatchMode ?? lastMode;

          noteVisit(norm, 'lifted');
          maybeApplyLateSeed(norm, globalStep, 'lifted');

          // Capture STAT struct snapshots at milestone steps
          for (const ms of SNAPSHOT_STEPS) {
            if (globalStep === ms && !statSnapshots[ms]) {
              const structBytes = sliceBytes(mem, STAT_STRUCT_START, 32);
              statSnapshots[ms] = {
                hex: bytesToHex(structBytes),
                ascii: bytesToAscii(structBytes),
                hasError: bytesToAscii(structBytes).includes('Error'),
              };
            }
          }

          // Sentinels
          if (norm === RETURN_SENTINEL) throw makeStop('return_sentinel', norm);
          if (norm === BOOT_ENTRY && globalStep > 1) throw makeStop('boot_crash', norm);
        },
        onMissingBlock(pc, dispatchMode, step) {
          const norm = pc & 0xFFFFFF;
          const globalStep = totalSteps + (step ?? 0) + 1;
          segmentSteps = Math.max(segmentSteps, (step ?? 0) + 1);
          lastPc = norm;
          lastMode = dispatchMode ?? lastMode;

          noteVisit(norm, 'missing');
          maybeApplyLateSeed(norm, globalStep, 'missing');

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

  if (termination === 'max_steps' && totalSteps >= STAT_TOTAL_STEPS) {
    termination = 'step_limit';
  }

  // Capture any remaining milestone snapshots that weren't hit during execution
  for (const ms of SNAPSHOT_STEPS) {
    if (!statSnapshots[ms]) {
      const structBytes = sliceBytes(mem, STAT_STRUCT_START, 32);
      statSnapshots[ms] = {
        hex: bytesToHex(structBytes),
        ascii: bytesToAscii(structBytes),
        hasError: bytesToAscii(structBytes).includes('Error'),
        note: `captured at end (step ${totalSteps}), not at step ${ms}`,
      };
    }
  }

  // --- Build report ---

  // Total unique blocks
  const uniqueBlockCount = visitedSet.size;

  // BufInsert reached?
  const bufInsertReached = visitedSet.has(BUFINSERT_BLOCK);
  const bufInsertVisits = blockFreq.get(BUFINSERT_BLOCK) || 0;

  // FP math blocks (0x07xxxx range)
  const fpBlocks = [];
  for (const pc of visitedSet) {
    if (pc >= 0x070000 && pc <= 0x07FFFF) {
      fpBlocks.push(pc);
    }
  }
  fpBlocks.sort((a, b) => a - b);

  // STAT struct final (first 32 bytes)
  const statStructFinal = sliceBytes(mem, STAT_STRUCT_START, 32);

  // OP1 final (9 bytes)
  const op1Final = sliceBytes(mem, OP1_ADDR, 9);

  // Event loop visit count
  const eventLoopVisits = blockFreq.get(EVENT_LOOP_BLOCK) || 0;

  // List pointer at 0xD01508
  const listPtrFinal = read24(mem, LIST_PTR_TABLE);

  // Top 20 most-visited blocks
  const top20 = [...blockFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([pc]) => describeBlock(pc));

  // All blocks in 0x09xxxx range (STAT computation blocks)
  const statCompBlocks = [];
  for (const pc of visitedSet) {
    if (pc >= 0x090000 && pc <= 0x09FFFF) {
      statCompBlocks.push(describeBlock(pc));
    }
  }
  statCompBlocks.sort((a, b) => {
    const aAddr = parseInt(a.pc.replace('0x', ''), 16);
    const bAddr = parseInt(b.pc.replace('0x', ''), 16);
    return aAddr - bAddr;
  });

  // Error string evolution check
  const errorEvolution = {};
  for (const ms of SNAPSHOT_STEPS) {
    errorEvolution[`step_${ms}`] = statSnapshots[ms];
  }

  return {
    totalSteps,
    termination,
    hitSentinel,
    errorMessage: errorMessage ? errorMessage.split('\n')[0] : null,
    lastPc: hex(lastPc),
    lastMode,
    lateSeed: {
      applied: lateSeedApplied,
      atStep: lateSeedAtStep,
      pc: lateSeedPc === null ? null : hex(lateSeedPc),
      reason: lateSeedReason,
      eventKind: lateSeedEventKind,
      contextInstallerSeenAtStep,
      insertMemSeenAtStep,
      address: hex(LIST_PTR_TABLE),
      value: hex(LIST_DATA_ADDR),
    },
    uniqueBlockCount,
    bufInsert: {
      reached: bufInsertReached,
      visits: bufInsertVisits,
    },
    fpMath: {
      reached: fpBlocks.length > 0,
      blockCount: fpBlocks.length,
      blocks: fpBlocks.map((pc) => describeBlock(pc)),
    },
    statStruct: {
      hex: bytesToHex(statStructFinal),
      ascii: bytesToAscii(statStructFinal),
    },
    op1: {
      hex: bytesToHex(op1Final),
    },
    eventLoop: {
      block: hex(EVENT_LOOP_BLOCK),
      visits: eventLoopVisits,
    },
    listPointerFinal: {
      address: hex(LIST_PTR_TABLE),
      value: hex(listPtrFinal),
      bytes: bytesToHex(sliceBytes(mem, LIST_PTR_TABLE, 3)),
    },
    top20Blocks: top20,
    statComputationBlocks: statCompBlocks,
    errorEvolution,
    firstBlocks: visitedOrder.slice(0, 40).map((pc) => hex(pc)),
    lastBlocks: visitedOrder.slice(-20).map((pc) => hex(pc)),
    registers: {
      a: hex(cpu.a, 2),
      f: hex(cpu.f, 2),
      bc: hex(cpu._bc),
      de: hex(cpu._de),
      hl: hex(cpu._hl),
      sp: hex(cpu.sp),
      ix: hex(cpu._ix),
      iy: hex(cpu._iy),
    },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const startTime = Date.now();

  // 1. Create runtime
  console.error('Creating runtime...');
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  // 2. Cold boot (z80 boot -> kernelInit -> postInit)
  console.error('Running cold boot...');
  const bootInfo = coldBoot(executor, cpu, mem);

  // 3. memInit
  console.error('Running memInit...');
  const memInit = runMemInit(executor, cpu, mem);

  // 4. Seed L1 = {1.0, 2.0, 3.0}
  console.error('Seeding L1={1.0, 2.0, 3.0}...');
  const seedInfo = seedListL1(mem);

  // 5. Pre-STAT snapshots
  const preStatOp1 = bytesToHex(sliceBytes(mem, OP1_ADDR, 9));
  const preStatStruct = bytesToHex(sliceBytes(mem, STAT_STRUCT_START, 32));
  const preListPtr = hex(read24(mem, LIST_PTR_TABLE));

  // 6. Run STAT with late-seed fix for 10000 steps
  console.error(`Running STAT from ${hex(STAT_ENTRY)} for ${STAT_TOTAL_STEPS} steps with late-seed fix...`);
  const statResult = runStatWithLateSeed(executor, cpu, mem);

  const elapsedMs = Date.now() - startTime;

  // 7. Build output
  const output = {
    probe: 'probe-phase211-stat-late-seed',
    generatedAt: new Date().toISOString(),
    elapsedMs,
    runtime: { timerInterrupt: false },
    boot: bootInfo,
    memInit: {
      returned: memInit.returned,
      steps: memInit.steps,
    },
    listSeed: {
      address: hex(LIST_DATA_ADDR),
      endAddress: hex(LIST_DATA_END_ADDR),
      vatEntryAddr: hex(VAT_ENTRY_ADDR),
      elements: 3,
      values: [1.0, 2.0, 3.0],
      countBytes: '03 00 00',
      listBytes: seedInfo.listBytes,
      vatEntryBytes: seedInfo.vatEntryBytes,
      allocatorPointers: seedInfo.allocatorPointers,
    },
    preStatState: {
      op1: preStatOp1,
      statStruct: preStatStruct,
      listPtrAt0xD01508: preListPtr,
    },
    statTrace: statResult,
    summary: {
      totalSteps: statResult.totalSteps,
      termination: statResult.termination,
      uniqueBlocks: statResult.uniqueBlockCount,
      lateSeedApplied: statResult.lateSeed.applied,
      lateSeedAtStep: statResult.lateSeed.atStep,
      bufInsertReached: statResult.bufInsert.reached,
      fpMathReached: statResult.fpMath.reached,
      fpMathBlockCount: statResult.fpMath.blockCount,
      eventLoopVisits: statResult.eventLoop.visits,
      listPtrFinal: statResult.listPointerFinal.value,
      statComputationBlockCount: statResult.statComputationBlocks.length,
      errorAtStep1000: statResult.errorEvolution.step_1000?.hasError ?? null,
      errorAtStep5000: statResult.errorEvolution.step_5000?.hasError ?? null,
      errorAtStep10000: statResult.errorEvolution.step_10000?.hasError ?? null,
    },
  };

  console.log(JSON.stringify(output, null, 2));
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

try {
  main();
} catch (error) {
  console.error(error.stack || String(error));
  console.log(JSON.stringify({
    probe: 'probe-phase211-stat-late-seed',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
