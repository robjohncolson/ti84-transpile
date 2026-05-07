#!/usr/bin/env node
/**
 * probe-phase212-d01508-watchpoint.mjs
 *
 * Full STAT probe with the late-seed fix from phase 211 plus a write
 * watchpoint on the 3-byte list pointer at 0xD01508-0xD0150A.
 *
 * Goal: identify the exact block/step that writes the pointer back to
 * 0x000000 during the STAT pipeline.
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
transpiledUrl.searchParams.set('phase212', `${Date.now()}`);
const romModule = await import(transpiledUrl.href);
const BLOCKS = normalizeBlocks(romModule.PRELIFTED_BLOCKS);

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
const TRACE_STOP = '__PHASE212_TRACE_STOP__';

const SEGMENT_STEP_LIMIT = 2000;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const OS_MAX_LOOP_ITERATIONS = 8192;
const STAT_TOTAL_STEPS = 15000;

const LIST_DATA_ADDR = 0xD01600;
const LIST_DATA_END_ADDR = 0xD0161E;
const LIST_PTR_TABLE = 0xD01508;
const LIST_COUNT_ADDR = 0xD0150B;
const ACTIVE_LIST_ADDR = 0xD0150C;
const VAT_ENTRY_ADDR = 0xD1A800;
const VAT_ENTRY_LEN = 8;
const CONTEXT_INSTALLER_BLOCK = 0x091E13;
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

const WATCH_START = 0xD01508;
const WATCH_END = 0xD0150A;

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

function write24Raw(mem, addr, value) {
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
  write24Raw(mem, cpu.sp, MEM_INIT_RET);
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

function seedListL1(mem) {
  mem.fill(0x00, LIST_DATA_ADDR, LIST_DATA_END_ADDR);

  mem[LIST_DATA_ADDR] = 0x03;
  mem[LIST_DATA_ADDR + 1] = 0x00;
  mem[LIST_DATA_ADDR + 2] = 0x00;

  const e1 = LIST_DATA_ADDR + 3;
  const elem1 = [0x00, 0x81, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  for (let index = 0; index < 9; index += 1) mem[e1 + index] = elem1[index];

  const e2 = e1 + 9;
  const elem2 = [0x00, 0x81, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  for (let index = 0; index < 9; index += 1) mem[e2 + index] = elem2[index];

  const e3 = e2 + 9;
  const elem3 = [0x00, 0x81, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  for (let index = 0; index < 9; index += 1) mem[e3 + index] = elem3[index];

  mem.fill(0x00, VAT_ENTRY_ADDR, VAT_ENTRY_ADDR + VAT_ENTRY_LEN);
  mem[VAT_ENTRY_ADDR] = 0x01;
  mem[VAT_ENTRY_ADDR + 1] = LIST_DATA_ADDR & 0xFF;
  mem[VAT_ENTRY_ADDR + 2] = (LIST_DATA_ADDR >>> 8) & 0xFF;
  mem[VAT_ENTRY_ADDR + 3] = (LIST_DATA_ADDR >>> 16) & 0xFF;
  mem[VAT_ENTRY_ADDR + 4] = 0x5D;
  mem[VAT_ENTRY_ADDR + 5] = 0x00;

  write24Raw(mem, OPBASE_ADDR, VAT_ENTRY_ADDR);
  write24Raw(mem, OPS_ADDR, VAT_ENTRY_ADDR + VAT_ENTRY_LEN);
  mem.fill(0x00, PTEMPCNT_ADDR, PTEMPCNT_ADDR + 4);
  write24Raw(mem, PTEMP_ADDR, ALLOCATOR_SEED_ADDR);
  write24Raw(mem, PROGPTR_ADDR, VAT_ENTRY_ADDR);
  write24Raw(mem, NEWDATA_PTR_ADDR, ALLOCATOR_SEED_ADDR);
  write24Raw(mem, LEGACY_USERMEM_SCRATCH_ADDR, ALLOCATOR_SEED_ADDR);
  write24Raw(mem, USERMEM_ADDR, ALLOCATOR_SEED_ADDR);

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

function installListPtrWriteWatch(cpu, mem) {
  const watchLog = [];
  const state = {
    step: 0,
    pc: STAT_ENTRY,
    mode: 'adl',
    block: blockKey(STAT_ENTRY, 'adl'),
    note: null,
  };

  const origWrite8 = cpu.write8.bind(cpu);
  const origWrite16 = cpu.write16.bind(cpu);
  const origWrite24 = cpu.write24.bind(cpu);

  function overlapsWatch(addr, width) {
    for (let offset = 0; offset < width; offset += 1) {
      const byteAddr = (addr + offset) & MEM_MASK;
      if (byteAddr >= WATCH_START && byteAddr <= WATCH_END) return true;
    }
    return false;
  }

  function pushEvent(byteAddr, oldByte, newByte, source, sourceValue = null) {
    const fullPointerValue = read24(mem, LIST_PTR_TABLE);
    watchLog.push({
      step: state.step,
      pc: hex(state.pc),
      mode: state.mode,
      block: state.block,
      dasm: firstInstructionLabel(state.pc, state.mode),
      source,
      sourceValue,
      note: state.note,
      byteAddr: hex(byteAddr),
      oldByte: hex(oldByte, 2),
      newByte: hex(newByte, 2),
      fullPointer: hex(fullPointerValue),
      fullPointerBytes: bytesToHex(sliceBytes(mem, LIST_PTR_TABLE, 3)),
    });
  }

  cpu.write8 = function(addr, value) {
    const byteAddr = addr & MEM_MASK;
    const oldByte = mem[byteAddr] & 0xFF;
    origWrite8(addr, value);
    if (byteAddr >= WATCH_START && byteAddr <= WATCH_END) {
      pushEvent(byteAddr, oldByte, value & 0xFF, 'write8');
    }
  };

  cpu.write16 = function(addr, value) {
    const baseAddr = addr & 0xFFFFFF;
    if (!overlapsWatch(baseAddr, 2)) return origWrite16(addr, value);

    const touched = [];
    for (let offset = 0; offset < 2; offset += 1) {
      const byteAddr = (baseAddr + offset) & MEM_MASK;
      if (byteAddr >= WATCH_START && byteAddr <= WATCH_END) {
        touched.push({
          byteAddr,
          oldByte: mem[byteAddr] & 0xFF,
          newByte: (value >>> (offset * 8)) & 0xFF,
        });
      }
    }

    origWrite16(addr, value);

    for (const entry of touched) {
      pushEvent(entry.byteAddr, entry.oldByte, entry.newByte, 'write16', hex(value & 0xFFFF, 4));
    }
  };

  cpu.write24 = function(addr, value) {
    const baseAddr = addr & 0xFFFFFF;
    if (!overlapsWatch(baseAddr, 3)) return origWrite24(addr, value);

    const touched = [];
    for (let offset = 0; offset < 3; offset += 1) {
      const byteAddr = (baseAddr + offset) & MEM_MASK;
      if (byteAddr >= WATCH_START && byteAddr <= WATCH_END) {
        touched.push({
          byteAddr,
          oldByte: mem[byteAddr] & 0xFF,
          newByte: (value >>> (offset * 8)) & 0xFF,
        });
      }
    }

    origWrite24(addr, value);

    for (const entry of touched) {
      pushEvent(entry.byteAddr, entry.oldByte, entry.newByte, 'write24', hex(value & 0xFFFFFF));
    }
  };

  return {
    watchLog,
    setContext(step, pc, mode) {
      state.step = step;
      state.pc = pc & 0xFFFFFF;
      state.mode = mode ?? state.mode;
      state.block = blockKey(state.pc, state.mode);
    },
    withNote(note, fn) {
      const previous = state.note;
      state.note = note;
      try {
        return fn();
      } finally {
        state.note = previous;
      }
    },
    restore() {
      cpu.write8 = origWrite8;
      cpu.write16 = origWrite16;
      cpu.write24 = origWrite24;
    },
  };
}

function runStatWithLateSeedWatchpoint(executor, cpu, mem, watchTracker) {
  resetCpuForOsCall(cpu, mem);
  cpu.a = STAT_TOKEN;
  cpu.sp -= 3;
  write24Raw(mem, cpu.sp, RETURN_SENTINEL);

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

  let currentPc = STAT_ENTRY;
  let currentMode = 'adl';

  function maybeApplyLateSeed(pc, mode, globalStep, eventKind) {
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

    watchTracker.withNote('late_seed', () => {
      cpu.write24(LIST_PTR_TABLE, LIST_DATA_ADDR);
    });

    lateSeedApplied = true;
    lateSeedAtStep = globalStep;
    lateSeedPc = pc;
    lateSeedReason = isInsertMemEntry ? 'insertmem_entry' : 'post_context_installer_09xxxx';
    lateSeedEventKind = eventKind;
    lastMode = mode ?? lastMode;
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
          const effectiveMode = dispatchMode ?? lastMode;
          const globalStep = totalSteps + (step ?? 0) + 1;
          segmentSteps = Math.max(segmentSteps, (step ?? 0) + 1);
          lastPc = norm;
          lastMode = effectiveMode;
          watchTracker.setContext(globalStep, norm, effectiveMode);
          maybeApplyLateSeed(norm, effectiveMode, globalStep, 'lifted');

          if (norm === RETURN_SENTINEL) throw makeStop('return_sentinel', norm);
          if (norm === BOOT_ENTRY && globalStep > 1) throw makeStop('boot_crash', norm);
        },
        onMissingBlock(pc, dispatchMode, step) {
          const norm = pc & 0xFFFFFF;
          const effectiveMode = dispatchMode ?? lastMode;
          const globalStep = totalSteps + (step ?? 0) + 1;
          segmentSteps = Math.max(segmentSteps, (step ?? 0) + 1);
          lastPc = norm;
          lastMode = effectiveMode;
          watchTracker.setContext(globalStep, norm, effectiveMode);
          maybeApplyLateSeed(norm, effectiveMode, globalStep, 'missing');

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
    listPointerFinal: {
      address: hex(LIST_PTR_TABLE),
      value: hex(read24(mem, LIST_PTR_TABLE)),
      bytes: bytesToHex(sliceBytes(mem, LIST_PTR_TABLE, 3)),
    },
  };
}

function summarizeWatchLog(watchLog) {
  const runtimeEvents = watchLog.filter((entry) => entry.note !== 'late_seed');
  const clearToZeroEvents = runtimeEvents.filter((entry) => entry.fullPointer === '0x000000');
  const uniqueWriteBlocks = [...new Set(runtimeEvents.map((entry) => entry.block))];
  const uniqueWritePcs = [...new Set(runtimeEvents.map((entry) => entry.pc))];

  return {
    totalEvents: watchLog.length,
    lateSeedEvents: watchLog.filter((entry) => entry.note === 'late_seed').length,
    runtimeEvents: runtimeEvents.length,
    clearToZeroEvents: clearToZeroEvents.length,
    firstClearToZero: clearToZeroEvents[0] ?? null,
    lastClearToZero: clearToZeroEvents.length > 0 ? clearToZeroEvents[clearToZeroEvents.length - 1] : null,
    uniqueWriteBlocks,
    uniqueWritePcs,
    lastEvent: watchLog.length > 0 ? watchLog[watchLog.length - 1] : null,
  };
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

  console.error('Seeding L1={10.0, 20.0, 30.0}...');
  const seedInfo = seedListL1(mem);

  const preStatState = {
    listPtrAt0xD01508: hex(read24(mem, LIST_PTR_TABLE)),
    listPtrBytes: bytesToHex(sliceBytes(mem, LIST_PTR_TABLE, 3)),
  };

  console.error('Installing 0xD01508-0xD0150A write watchpoint...');
  const watchTracker = installListPtrWriteWatch(cpu, mem);

  console.error(`Running STAT from ${hex(STAT_ENTRY)} for ${STAT_TOTAL_STEPS} steps with late-seed fix...`);
  let statTrace;
  try {
    statTrace = runStatWithLateSeedWatchpoint(executor, cpu, mem, watchTracker);
  } finally {
    watchTracker.restore();
  }

  const elapsedMs = Date.now() - startTime;
  const watchSummary = summarizeWatchLog(watchTracker.watchLog);

  const output = {
    probe: 'probe-phase212-d01508-watchpoint',
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
      values: [10.0, 20.0, 30.0],
      countBytes: '03 00 00',
      listBytes: seedInfo.listBytes,
      vatEntryBytes: seedInfo.vatEntryBytes,
      allocatorPointers: seedInfo.allocatorPointers,
    },
    preStatState,
    statTrace: {
      ...statTrace,
      watchSummary,
      watchLog: watchTracker.watchLog,
    },
    summary: {
      totalSteps: statTrace.totalSteps,
      termination: statTrace.termination,
      lateSeedApplied: statTrace.lateSeed.applied,
      lateSeedAtStep: statTrace.lateSeed.atStep,
      listPtrFinal: statTrace.listPointerFinal.value,
      watchEvents: watchSummary.totalEvents,
      clearToZeroEvents: watchSummary.clearToZeroEvents,
      firstClearToZeroBlock: watchSummary.firstClearToZero?.block ?? null,
      firstClearToZeroPc: watchSummary.firstClearToZero?.pc ?? null,
      firstClearToZeroStep: watchSummary.firstClearToZero?.step ?? null,
    },
  };

  console.log(JSON.stringify(output, null, 2));
}

try {
  main();
} catch (error) {
  console.error(error.stack || String(error));
  console.log(JSON.stringify({
    probe: 'probe-phase212-d01508-watchpoint',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
