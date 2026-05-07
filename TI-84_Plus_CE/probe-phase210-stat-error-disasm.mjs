#!/usr/bin/env node
/**
 * probe-phase210-stat-error-disasm.mjs
 *
 * Deep reverse-engineering of the STAT error condition at 0x058BA9.
 *
 * Part 1: Static disassembly of ROM bytes from 0x058BA9 through the first
 *         few levels of CALL/JP targets, to find the instruction that
 *         checks for error state and branches to the error path.
 *
 * Part 2: Step-by-step execution trace (first 150 blocks) logging PC,
 *         key registers, and conditional branch outcomes at each step.
 *
 * Part 3: Analysis — identify the exact divergence point and the RAM
 *         location / flag being checked.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILE_SCRIPT_PATH = path.join(REPO_ROOT, 'scripts', 'transpile-ti84-rom.mjs');

ensureTranspiled();

const romBytes = fs.readFileSync(ROM_PATH);
const transpiledUrl = pathToFileURL(TRANSPILED_PATH);
transpiledUrl.searchParams.set('phase210', `${Date.now()}`);
const romModule = await import(transpiledUrl.href);
const BLOCKS = normalizeBlocks(romModule.PRELIFTED_BLOCKS);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;
const STACK_TOP = 0xD1A87E;
const SHORT_MBASE = 0xD0;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const STAT_ENTRY = 0x058BA9;

const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;
const TRACE_STOP = '__PHASE210_TRACE_STOP__';

const SEGMENT_STEP_LIMIT = 2000;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const OS_MAX_LOOP_ITERATIONS = 8192;

const NEAR_LIST_DATA_ADDR = 0xD01600;
const VAT_ENTRY_ADDR = 0xD1A800;
const OP1_ADDR = 0xD005F8;
const STAT_STRUCT_START = 0xD008E6;

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
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function read16Raw(mem, addr) {
  const a = addr & MEM_MASK;
  return mem[a] | (mem[(a + 1) & MEM_MASK] << 8);
}

function read24Raw(mem, addr) {
  const a = addr & MEM_MASK;
  return mem[a] | (mem[(a + 1) & MEM_MASK] << 8) | (mem[(a + 2) & MEM_MASK] << 16);
}

function write16Raw(mem, addr, value) {
  const a = addr & MEM_MASK;
  mem[a] = value & 0xFF;
  mem[(a + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
}

function write24Raw(mem, addr, value) {
  const a = addr & MEM_MASK;
  mem[a] = value & 0xFF;
  mem[(a + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(a + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function writeBytes(mem, addr, bytes) {
  const a = addr & MEM_MASK;
  for (let index = 0; index < bytes.length; index += 1) {
    mem[(a + index) & MEM_MASK] = bytes[index] & 0xFF;
  }
}

function sliceBytes(mem, addr, len) {
  const out = new Uint8Array(len);
  for (let index = 0; index < len; index += 1) {
    out[index] = mem[(addr + index) & MEM_MASK] & 0xFF;
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

function flagsString(f) {
  const parts = [];
  if (f & 0x80) parts.push('S');
  if (f & 0x40) parts.push('Z');
  if (f & 0x10) parts.push('H');
  if (f & 0x04) parts.push('PV');
  if (f & 0x02) parts.push('N');
  if (f & 0x01) parts.push('C');
  return parts.join('|') || 'none';
}

// ---------------------------------------------------------------------------
// Part 1: Static disassembly
// ---------------------------------------------------------------------------

function disassembleRange(startAddr, endAddr, mode) {
  const instructions = [];
  let pc = startAddr;

  while (pc < endAddr && pc < romBytes.length) {
    try {
      const instr = decodeInstruction(romBytes, pc, mode);
      const rawLen = instr.length || (instr.nextPc - instr.pc) || 1;
      const rawBytes = Array.from(romBytes.slice(pc, pc + rawLen))
        .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
        .join(' ');

      const entry = {
        addr: hex(pc),
        bytes: rawBytes,
        tag: instr.tag,
        length: rawLen,
      };

      // Extract useful fields depending on instruction type
      if (instr.target !== undefined) entry.target = hex(instr.target);
      if (instr.condition !== undefined) entry.condition = instr.condition;
      if (instr.op !== undefined) entry.op = instr.op;
      if (instr.reg !== undefined) entry.reg = instr.reg;
      if (instr.dst !== undefined) entry.dst = instr.dst;
      if (instr.src !== undefined) entry.src = instr.src;
      if (instr.immediate !== undefined) entry.immediate = hex(instr.immediate);
      if (instr.offset !== undefined) entry.offset = instr.offset;
      if (instr.bit !== undefined) entry.bit = instr.bit;
      if (instr.indexReg !== undefined) entry.indexReg = instr.indexReg;
      if (instr.indirectRegister !== undefined) entry.indirectRegister = instr.indirectRegister;
      if (instr.address !== undefined) entry.address = hex(instr.address);

      instructions.push(entry);
      pc = instr.nextPc ?? (pc + 1);
    } catch {
      instructions.push({
        addr: hex(pc),
        bytes: hex(romBytes[pc], 2),
        tag: 'decode-error',
        length: 1,
      });
      pc += 1;
    }
  }

  return instructions;
}

function findCallAndJpTargets(instructions) {
  const targets = new Set();
  for (const instr of instructions) {
    if (instr.target !== undefined) {
      const tag = instr.tag || '';
      if (tag.includes('call') || tag.includes('jp') || tag === 'rst') {
        const addr = parseInt(instr.target.replace('0x', ''), 16);
        if (addr > 0 && addr < 0x400000) {
          targets.add(addr);
        }
      }
    }
  }
  return [...targets].sort((a, b) => a - b);
}

function deepDisassemble() {
  const results = {};

  // Level 0: 0x058BA9 to 0x058C50 (entry region + some extra)
  const level0 = disassembleRange(0x058BA9, 0x058C50, 'adl');
  results.level0_entry = {
    range: '0x058BA9 - 0x058C50',
    instructions: level0,
  };

  // Find CALL/JP targets from level 0
  const level1Targets = findCallAndJpTargets(level0);
  results.level1_targets = level1Targets.map(hex);

  // Level 1: disassemble each target (64 bytes each)
  const level1Disasm = {};
  const level2Targets = new Set();

  for (const target of level1Targets) {
    const endAddr = Math.min(target + 0x60, 0x400000);
    const instrs = disassembleRange(target, endAddr, 'adl');
    level1Disasm[hex(target)] = instrs;

    // Collect level 2 targets
    for (const t of findCallAndJpTargets(instrs)) {
      if (!level1Targets.includes(t) && t !== 0x058BA9) {
        level2Targets.add(t);
      }
    }
  }

  results.level1_disasm = level1Disasm;

  // Level 2: disassemble each target (48 bytes each)
  const level2Array = [...level2Targets].sort((a, b) => a - b).slice(0, 20); // limit to 20
  results.level2_targets = level2Array.map(hex);

  const level2Disasm = {};
  for (const target of level2Array) {
    const endAddr = Math.min(target + 0x40, 0x400000);
    level2Disasm[hex(target)] = disassembleRange(target, endAddr, 'adl');
  }

  results.level2_disasm = level2Disasm;

  return results;
}

// ---------------------------------------------------------------------------
// Runtime helpers (same pattern as probe-phase206)
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
  cpu.mbase = SHORT_MBASE;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function bootRuntime(executor, cpu, mem) {
  const boot = runStageInSegments(executor, BOOT_ENTRY, 'z80', BOOT_MAX_STEPS, 32);

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  const kernelInit = runStageInSegments(executor, KERNEL_INIT_ENTRY, 'adl', KERNEL_INIT_MAX_STEPS, 10000);

  cpu.mbase = SHORT_MBASE;
  cpu._iy = 0xD00080;
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

  const sentinels = new Map([[MEM_INIT_RET, 'mem_init_return']]);

  while (totalSteps < MEM_INIT_MAX_STEPS && !returned) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, MEM_INIT_MAX_STEPS - totalSteps);
    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
        onBlock(pc) {
          const norm = pc & 0xFFFFFF;
          if (sentinels.has(norm)) throw makeStop(sentinels.get(norm), norm);
        },
        onMissingBlock(pc) {
          const norm = pc & 0xFFFFFF;
          if (sentinels.has(norm)) throw makeStop(sentinels.get(norm), norm);
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

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { mem, peripherals, executor, cpu: executor.cpu };
}

function seedNearList(mem) {
  const LIST_ELEMENTS = [
    Uint8Array.from([0x00, 0x80, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    Uint8Array.from([0x00, 0x80, 0x20, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
    Uint8Array.from([0x00, 0x80, 0x30, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]),
  ];

  write16Raw(mem, NEAR_LIST_DATA_ADDR, LIST_ELEMENTS.length);
  for (let index = 0; index < LIST_ELEMENTS.length; index += 1) {
    writeBytes(mem, NEAR_LIST_DATA_ADDR + 2 + (index * 9), LIST_ELEMENTS[index]);
  }

  const vatEntryBytes = Uint8Array.from([
    0x01,
    NEAR_LIST_DATA_ADDR & 0xFF,
    (NEAR_LIST_DATA_ADDR >>> 8) & 0xFF,
    (NEAR_LIST_DATA_ADDR >>> 16) & 0xFF,
    0x00, 0x00, 0x01, 0x00,
  ]);
  writeBytes(mem, VAT_ENTRY_ADDR, vatEntryBytes);
}

// ---------------------------------------------------------------------------
// Part 2: Execution trace with detailed register logging
// ---------------------------------------------------------------------------

function runDetailedTrace(baselineMem) {
  const runtime = createRuntime();
  runtime.mem.set(baselineMem);
  seedNearList(runtime.mem);

  // Set up CPU for STAT entry
  resetCpuForOsCall(runtime.cpu, runtime.mem);
  runtime.cpu.a = 0x31;
  runtime.cpu.sp -= 3;
  write24Raw(runtime.mem, runtime.cpu.sp, RETURN_SENTINEL);

  const { cpu, mem, executor } = runtime;

  // Capture pre-entry state
  const preState = {
    a: hex(cpu.a, 2),
    f: hex(cpu.f, 2),
    flags: flagsString(cpu.f),
    bc: hex(cpu._bc),
    de: hex(cpu._de),
    hl: hex(cpu._hl),
    ix: hex(cpu._ix),
    iy: hex(cpu._iy),
    sp: hex(cpu.sp),
    mbase: hex(cpu.mbase, 2),
    madl: cpu.madl,
  };

  // Snapshot key RAM before entry
  const preRam = {
    op1: bytesToHex(sliceBytes(mem, OP1_ADDR, 11)),
    statStruct_first16: bytesToHex(sliceBytes(mem, STAT_STRUCT_START, 16)),
    iy_plus_0: hex(mem[0xD00080], 2),
    iy_plus_9: hex(mem[0xD00089], 2),
    iy_plus_12: hex(mem[0xD0008C], 2),
    iy_plus_26: hex(mem[0xD0009A], 2),
    d008df: hex(mem[0xD008DF], 2),
    d008e0_region: bytesToHex(sliceBytes(mem, 0xD008E0, 16)),
  };

  // Step-by-step trace
  const traceLog = [];
  const MAX_TRACE_STEPS = 150;
  let totalSteps = 0;
  let termination = 'unknown';
  let hitSentinel = null;
  let currentPc = STAT_ENTRY;
  let currentMode = 'adl';

  // We run one block at a time so we can capture register state between blocks
  while (totalSteps < MAX_TRACE_STEPS) {
    cpu.madl = currentMode === 'adl' ? 1 : 0;
    const key = currentPc.toString(16).padStart(6, '0') + ':' + currentMode;

    // Check sentinels
    const norm = currentPc & 0xFFFFFF;
    if (norm === RETURN_SENTINEL) {
      hitSentinel = { name: 'return_sentinel', pc: hex(norm) };
      termination = 'sentinel';
      break;
    }
    if (norm === BOOT_ENTRY && totalSteps > 0) {
      hitSentinel = { name: 'boot_crash', pc: hex(norm) };
      termination = 'sentinel';
      break;
    }

    // Capture register state BEFORE this block executes
    const regsBefore = {
      a: hex(cpu.a, 2),
      f: hex(cpu.f, 2),
      flags: flagsString(cpu.f),
      bc: hex(cpu._bc),
      de: hex(cpu._de),
      hl: hex(cpu._hl),
      ix: hex(cpu._ix),
      iy: hex(cpu._iy),
      sp: hex(cpu.sp),
    };

    // Decode what instruction(s) are at this PC for annotation
    let instrAnnotation = null;
    if (norm < 0x400000) {
      try {
        const instr = decodeInstruction(romBytes, norm, currentMode);
        instrAnnotation = {
          tag: instr.tag,
          target: instr.target !== undefined ? hex(instr.target) : undefined,
          condition: instr.condition,
          op: instr.op,
          reg: instr.reg,
          dst: instr.dst,
          src: instr.src,
          immediate: instr.immediate !== undefined ? hex(instr.immediate) : undefined,
          address: instr.address !== undefined ? hex(instr.address) : undefined,
          bit: instr.bit,
          indexReg: instr.indexReg,
          offset: instr.offset,
          bytes: bytesToHex(romBytes.slice(norm, norm + (instr.length || 1))),
        };
        // Remove undefined fields
        for (const k of Object.keys(instrAnnotation)) {
          if (instrAnnotation[k] === undefined) delete instrAnnotation[k];
        }
      } catch {
        instrAnnotation = { tag: 'decode-error' };
      }
    }

    // Execute one block
    let nextPc = null;
    let nextMode = currentMode;
    let blockError = null;

    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: 1,
        maxLoopIterations: 1,
      });
      nextPc = (result.lastPc ?? currentPc) & 0xFFFFFF;
      nextMode = result.lastMode ?? currentMode;
      if (result.termination === 'missing_block') {
        termination = 'missing_block';
      }
    } catch (error) {
      blockError = error?.message ?? String(error);
      termination = 'exception';
    }

    // Capture register state AFTER this block executes
    const regsAfter = {
      a: hex(cpu.a, 2),
      f: hex(cpu.f, 2),
      flags: flagsString(cpu.f),
      bc: hex(cpu._bc),
      de: hex(cpu._de),
      hl: hex(cpu._hl),
      ix: hex(cpu._ix),
      iy: hex(cpu._iy),
      sp: hex(cpu.sp),
    };

    // Check what changed
    const changes = {};
    for (const k of Object.keys(regsBefore)) {
      if (regsBefore[k] !== regsAfter[k]) {
        changes[k] = { from: regsBefore[k], to: regsAfter[k] };
      }
    }

    // Snapshot key memory at interesting points
    let memSnapshot = null;
    if (totalSteps < 10 || totalSteps % 10 === 0 || blockError) {
      memSnapshot = {
        op1_type: hex(mem[OP1_ADDR], 2),
        op1_first3: bytesToHex(sliceBytes(mem, OP1_ADDR, 3)),
        statStruct_byte14: hex(mem[STAT_STRUCT_START + 14], 2),
        statStruct_ascii_14_20: bytesToAscii(sliceBytes(mem, STAT_STRUCT_START + 14, 6)),
      };
    }

    const entry = {
      step: totalSteps,
      pc: hex(norm),
      blockKey: key,
      instr: instrAnnotation,
      regsBefore,
      regsAfter,
      changes: Object.keys(changes).length > 0 ? changes : undefined,
      nextPc: nextPc !== null ? hex(nextPc) : null,
      memSnapshot,
    };

    if (blockError) entry.error = blockError;

    traceLog.push(entry);

    if (blockError || termination === 'missing_block') break;

    totalSteps += 1;
    currentPc = nextPc;
    currentMode = nextMode;
  }

  if (totalSteps >= MAX_TRACE_STEPS) {
    termination = 'step_limit';
  }

  return {
    preState,
    preRam,
    traceSteps: totalSteps,
    termination,
    hitSentinel,
    traceLog,
  };
}

// ---------------------------------------------------------------------------
// Part 3: Focused analysis - check specific RAM/IY flag hypotheses
// ---------------------------------------------------------------------------

function runFocusedAnalysis(baselineMem) {
  const runtime = createRuntime();
  runtime.mem.set(baselineMem);
  seedNearList(runtime.mem);

  const { mem } = runtime;

  // Dump IY-relative flags that might be checked early in STAT
  // IY = 0xD00080, so IY+offset = 0xD00080+offset
  const iyBase = 0xD00080;
  const iyFlags = {};
  for (let offset = 0; offset <= 0x30; offset++) {
    const addr = iyBase + offset;
    const val = mem[addr];
    if (val !== 0x00) {
      iyFlags[`IY+${offset} (${hex(addr)})`] = hex(val, 2);
    }
  }

  // Check known error-related addresses
  const errorState = {
    op1_type_byte: hex(mem[OP1_ADDR], 2),
    op1_full: bytesToHex(sliceBytes(mem, OP1_ADDR, 11)),
    d008df_curContext: hex(mem[0xD008DF], 2),
    d008e0_region: bytesToHex(sliceBytes(mem, 0xD008E0, 32)),
    d008e6_statStruct: bytesToHex(sliceBytes(mem, STAT_STRUCT_START, 32)),
    d00089_statFlags: hex(mem[0xD00089], 2),
    d0009a_statFlags2: hex(mem[0xD0009A], 2),
    d02504_menuMode: hex(mem[0xD02504], 2),
    d0008c_iy12: hex(mem[0xD0008C], 2),
  };

  // Also check the bytes that get loaded into A early in the STAT path
  // From the disassembly, look for LD A,(addr) patterns
  const suspectAddresses = [
    0xD008DF, 0xD008E0, 0xD008E1, 0xD008E2, 0xD008E3, 0xD008E4,
    0xD008E5, 0xD008E6, 0xD008E7, 0xD008E8, 0xD008E9, 0xD008EA,
    0xD0008C, 0xD00089, 0xD0009A,
    0xD02504, 0xD02505,
  ];

  const suspectValues = {};
  for (const addr of suspectAddresses) {
    suspectValues[hex(addr)] = hex(mem[addr], 2);
  }

  return {
    iyFlags,
    errorState,
    suspectValues,
  };
}

// ---------------------------------------------------------------------------
// Part 4: Comparative trace — run with different IY flag / RAM setups
// ---------------------------------------------------------------------------

function runComparativeExperiment(baselineMem, label, preSetup) {
  const runtime = createRuntime();
  runtime.mem.set(baselineMem);
  seedNearList(runtime.mem);

  // Apply pre-setup modifications
  if (preSetup) preSetup(runtime.mem, runtime.cpu);

  resetCpuForOsCall(runtime.cpu, runtime.mem);
  runtime.cpu.a = 0x31;
  runtime.cpu.sp -= 3;
  write24Raw(runtime.mem, runtime.cpu.sp, RETURN_SENTINEL);

  const { cpu, mem, executor } = runtime;

  // Track first 30 blocks visited
  const firstBlocks = [];
  let steps = 0;
  let termination = 'max_steps';
  let lastPc = STAT_ENTRY;
  let errorStringAtEnd = false;

  try {
    const result = executor.runFrom(STAT_ENTRY, 'adl', {
      maxSteps: 500,
      maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
      onBlock(pc, _mode, _meta, step) {
        const norm = pc & 0xFFFFFF;
        steps = Math.max(steps, (step ?? 0) + 1);
        lastPc = norm;
        if (firstBlocks.length < 30) {
          firstBlocks.push(hex(norm));
        }
        if (norm === RETURN_SENTINEL) throw makeStop('return', norm);
        if (norm === BOOT_ENTRY && step > 0) throw makeStop('boot', norm);
      },
      onMissingBlock(pc, _mode, step) {
        const norm = pc & 0xFFFFFF;
        steps = Math.max(steps, (step ?? 0) + 1);
        lastPc = norm;
        if (firstBlocks.length < 30) {
          firstBlocks.push(`MISSING:${hex(norm)}`);
        }
        if (norm === RETURN_SENTINEL) throw makeStop('return', norm);
      },
    });
    termination = result.termination ?? termination;
  } catch (error) {
    if (error?.message === TRACE_STOP) {
      termination = `sentinel:${error.stopName}`;
    } else {
      termination = `exception:${error?.message}`;
    }
  }

  // Check for error string in STAT struct
  const structAscii = bytesToAscii(sliceBytes(mem, STAT_STRUCT_START, 32));
  errorStringAtEnd = structAscii.includes('Error') || structAscii.includes('error');

  return {
    label,
    steps,
    termination,
    lastPc: hex(lastPc),
    firstBlocks,
    errorStringAtEnd,
    op1_after: bytesToHex(sliceBytes(mem, OP1_ADDR, 3)),
    a_after: hex(cpu.a, 2),
    f_after: hex(cpu.f, 2),
    flags_after: flagsString(cpu.f),
  };
}

// ---------------------------------------------------------------------------
// Part 6: Trace writes to 0xD01508 during STAT execution
// ---------------------------------------------------------------------------

function traceListPtrWrites(baselineMem) {
  const runtime = createRuntime();
  runtime.mem.set(baselineMem);
  seedNearList(runtime.mem);

  const { cpu, mem, executor } = runtime;

  // Verify seed value
  const seedValue = read24Raw(mem, 0xD01508);

  // Intercept writes to 0xD01508 region
  const origWrite8 = cpu.write8.bind(cpu);
  const writeLog = [];
  cpu.write8 = (addr, value) => {
    if (addr >= 0xD01508 && addr <= 0xD0150A) {
      writeLog.push({
        addr: hex(addr),
        value: hex(value, 2),
        pc: hex(cpu._currentBlockPc),
        sp: hex(cpu.sp),
      });
    }
    origWrite8(addr, value);
  };

  // Reset and run
  resetCpuForOsCall(cpu, mem);
  cpu.a = 0x31;
  cpu.sp -= 3;
  write24Raw(mem, cpu.sp, RETURN_SENTINEL);

  // Snapshot before
  const valueBefore = read24Raw(mem, 0xD01508);

  // Run 100 steps
  const blocks = [];
  let steps = 0;
  try {
    executor.runFrom(STAT_ENTRY, 'adl', {
      maxSteps: 100,
      maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
      onBlock(pc, _mode, _meta, step) {
        const norm = pc & 0xFFFFFF;
        steps = Math.max(steps, (step ?? 0) + 1);
        if (blocks.length < 30) blocks.push(hex(norm));
        // Snapshot 0xD01508 at key points
        if (step === 10 || step === 20 || step === 50 || step === 80) {
          writeLog.push({
            type: 'snapshot',
            step,
            pc: hex(norm),
            d01508_value: hex(read24Raw(mem, 0xD01508)),
          });
        }
        if (norm === RETURN_SENTINEL) throw makeStop('return', norm);
        if (norm === BOOT_ENTRY && step > 0) throw makeStop('boot', norm);
      },
      onMissingBlock(pc) {
        const norm = pc & 0xFFFFFF;
        if (norm === RETURN_SENTINEL) throw makeStop('return', norm);
      },
    });
  } catch (error) {
    if (error?.message !== TRACE_STOP) throw error;
  }

  return {
    seededValue: hex(seedValue),
    valueBeforeEntry: hex(valueBefore),
    valueAfterRun: hex(read24Raw(mem, 0xD01508)),
    writeLog,
    stepsRun: steps,
  };
}

// ---------------------------------------------------------------------------
// Part 7: Late-seed experiment — seed 0xD01508 AFTER context installer
// ---------------------------------------------------------------------------

function runLateSeedExperiment(baselineMem) {
  // Run the first ~80 blocks (up to just before 0x092226), then seed
  // 0xD01508 and continue
  const runtime = createRuntime();
  runtime.mem.set(baselineMem);
  seedNearList(runtime.mem);

  const { cpu, mem, executor } = runtime;

  resetCpuForOsCall(cpu, mem);
  cpu.a = 0x31;
  cpu.sp -= 3;
  write24Raw(mem, cpu.sp, RETURN_SENTINEL);

  // Phase 1: Run until we hit block 0x092226
  let hitInsertMem = false;
  let phase1Steps = 0;
  const phase1Blocks = [];

  try {
    executor.runFrom(STAT_ENTRY, 'adl', {
      maxSteps: 200,
      maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
      onBlock(pc, _mode, _meta, step) {
        const norm = pc & 0xFFFFFF;
        phase1Steps = Math.max(phase1Steps, (step ?? 0) + 1);
        if (phase1Blocks.length < 100) phase1Blocks.push(hex(norm));
        if (norm === 0x092226) {
          hitInsertMem = true;
          // Now seed 0xD01508 right before InsertMem executes
          write24Raw(mem, 0xD01508, 0xD01600);
          // Also make sure the list data and count at D01D0B are sane
          mem[0xD01D0B] = 0x00; // list count = 0 initially
          throw makeStop('pre_insertmem_seed', norm);
        }
        if (norm === RETURN_SENTINEL) throw makeStop('return', norm);
        if (norm === BOOT_ENTRY && step > 0) throw makeStop('boot', norm);
      },
      onMissingBlock(pc) {
        const norm = pc & 0xFFFFFF;
        if (norm === RETURN_SENTINEL) throw makeStop('return', norm);
      },
    });
  } catch (error) {
    if (error?.message !== TRACE_STOP) throw error;
  }

  if (!hitInsertMem) {
    return {
      result: 'InsertMem (0x092226) was never reached',
      phase1Steps,
      phase1Blocks,
    };
  }

  // Phase 2: Continue from 0x092226 with seeded value
  const d01508_after_seed = hex(read24Raw(mem, 0xD01508));
  const phase2Blocks = [];
  let phase2Steps = 0;
  let phase2Term = 'max_steps';
  let errorString = false;

  try {
    const result = executor.runFrom(0x092226, 'adl', {
      maxSteps: 500,
      maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
      onBlock(pc, _mode, _meta, step) {
        const norm = pc & 0xFFFFFF;
        phase2Steps = Math.max(phase2Steps, (step ?? 0) + 1);
        if (phase2Blocks.length < 50) phase2Blocks.push(hex(norm));
        if (norm === RETURN_SENTINEL) throw makeStop('return', norm);
        if (norm === BOOT_ENTRY && step > 0) throw makeStop('boot', norm);
      },
      onMissingBlock(pc) {
        const norm = pc & 0xFFFFFF;
        if (phase2Blocks.length < 50) phase2Blocks.push(`MISSING:${hex(norm)}`);
        if (norm === RETURN_SENTINEL) throw makeStop('return', norm);
      },
    });
    phase2Term = result.termination ?? phase2Term;
  } catch (error) {
    if (error?.message === TRACE_STOP) {
      phase2Term = `sentinel:${error.stopName}`;
    } else {
      phase2Term = `exception:${error?.message}`;
    }
  }

  const structAscii = bytesToAscii(sliceBytes(mem, STAT_STRUCT_START, 32));
  errorString = structAscii.includes('Error') || structAscii.includes('error');

  return {
    hitInsertMem,
    d01508_after_seed,
    phase1Steps,
    phase2: {
      steps: phase2Steps,
      termination: phase2Term,
      lastPc: hex(cpu._currentBlockPc ?? 0),
      firstBlocks: phase2Blocks.slice(0, 30),
      errorStringAtEnd: errorString,
      a: hex(cpu.a, 2),
      f: hex(cpu.f, 2),
      sp: hex(cpu.sp),
      d01508_final: hex(read24Raw(mem, 0xD01508)),
      d01D0B_final: hex(mem[0xD01D0B], 2),
    },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const startTime = Date.now();

  // ── Part 1: Static disassembly ──
  console.error('Part 1: Static disassembly...');
  const disasm = deepDisassemble();

  // ── Boot baseline ──
  console.error('Booting baseline...');
  const runtime = createRuntime();
  bootRuntime(runtime.executor, runtime.cpu, runtime.mem);
  const memInit = runMemInit(runtime.executor, runtime.cpu, runtime.mem);
  const baselineMem = new Uint8Array(runtime.mem);

  // ── Part 2: Detailed execution trace ──
  console.error('Part 2: Detailed execution trace (150 steps)...');
  const detailedTrace = runDetailedTrace(baselineMem);

  // ── Part 3: Focused analysis ──
  console.error('Part 3: Focused analysis of RAM state...');
  const focusedAnalysis = runFocusedAnalysis(baselineMem);

  // ── Part 4: Comparative experiments ──
  console.error('Part 4: Comparative experiments...');

  const expBaseline = runComparativeExperiment(baselineMem, 'baseline', null);

  const expClearOp1 = runComparativeExperiment(baselineMem, 'clear_op1_error_type', (mem) => {
    // OP1 type byte: 0x03 = error. Clear it.
    mem[OP1_ADDR] = 0x00;
  });

  const expSetIy12Bit7 = runComparativeExperiment(baselineMem, 'set_iy12_bit7', (mem) => {
    // Set bit 7 of IY+12 (0xD0008C) — editor active flag
    mem[0xD0008C] |= 0x80;
  });

  const expMenuMode = runComparativeExperiment(baselineMem, 'set_menumode_0x40', (mem) => {
    mem[0xD02504] = 0x40;
  });

  const expClearD008DF = runComparativeExperiment(baselineMem, 'clear_d008df', (mem) => {
    mem[0xD008DF] = 0x00;
  });

  const expClearD008E0Region = runComparativeExperiment(baselineMem, 'clear_d008e0_region', (mem) => {
    mem.fill(0x00, 0xD008E0, 0xD008F0);
  });

  const expSetStatFlags = runComparativeExperiment(baselineMem, 'set_statflags', (mem) => {
    mem[0xD00089] |= 0x40;
    mem[0xD0009A] |= 0x04;
  });

  const expKitchenSink = runComparativeExperiment(baselineMem, 'kitchen_sink', (mem) => {
    mem[OP1_ADDR] = 0x00;
    mem[0xD0008C] |= 0x80;
    mem[0xD02504] = 0x40;
    mem[0xD008DF] = 0x00;
    mem[0xD00089] |= 0x40;
    mem[0xD0009A] |= 0x04;
  });

  const elapsedMs = Date.now() - startTime;

  // ── Analyze the trace to find divergence ──
  console.error('Analyzing trace for divergence point...');

  // Look for the first block where A, flags, or a branch changed in a way
  // that indicates error detection
  let divergenceAnalysis = null;
  const trace = detailedTrace.traceLog;
  for (let i = 0; i < trace.length; i++) {
    const entry = trace[i];
    const instr = entry.instr;
    if (!instr) continue;

    // Look for conditional jumps/calls that were taken or not taken
    if (instr.condition && instr.target) {
      const nextEntry = trace[i + 1];
      const jumpTarget = instr.target;
      const jumpTaken = nextEntry && nextEntry.pc === jumpTarget;

      if (!divergenceAnalysis) {
        divergenceAnalysis = {
          firstConditionalBranch: {
            step: entry.step,
            pc: entry.pc,
            instruction: instr,
            jumpTaken,
            nextPc: nextEntry?.pc,
            regsBeforeBranch: entry.regsBefore,
          },
          allConditionalBranches: [],
        };
      }

      divergenceAnalysis.allConditionalBranches.push({
        step: entry.step,
        pc: entry.pc,
        tag: instr.tag,
        condition: instr.condition,
        target: instr.target,
        jumped: jumpTaken,
        nextPc: nextEntry?.pc,
        a_before: entry.regsBefore.a,
        f_before: entry.regsBefore.f,
        flags_before: entry.regsBefore.flags,
      });
    }

    // Look for CP (compare) instructions — these set flags before branches
    if (instr.tag === 'alu-imm' && instr.op === 'cp') {
      if (!divergenceAnalysis) {
        divergenceAnalysis = { allConditionalBranches: [] };
      }
      if (!divergenceAnalysis.compareInstructions) {
        divergenceAnalysis.compareInstructions = [];
      }
      divergenceAnalysis.compareInstructions.push({
        step: entry.step,
        pc: entry.pc,
        immediate: instr.immediate,
        a_before: entry.regsBefore.a,
        a_after: entry.regsAfter.a,
        f_after: entry.regsAfter.f,
        flags_after: entry.regsAfter.flags,
      });
    }

    // Look for BIT test instructions
    if (instr.tag && instr.tag.startsWith('bit-test')) {
      if (!divergenceAnalysis) {
        divergenceAnalysis = { allConditionalBranches: [] };
      }
      if (!divergenceAnalysis.bitTests) {
        divergenceAnalysis.bitTests = [];
      }
      divergenceAnalysis.bitTests.push({
        step: entry.step,
        pc: entry.pc,
        bit: instr.bit,
        reg: instr.reg || instr.indexReg,
        f_after: entry.regsAfter.f,
        flags_after: entry.regsAfter.flags,
      });
    }

    // Look for LD A,(addr) — loading from RAM before a check
    if (instr.tag === 'ld-a-ind' || (instr.tag === 'ld-reg-mem' && instr.dst === 'a')) {
      if (!divergenceAnalysis) {
        divergenceAnalysis = { allConditionalBranches: [] };
      }
      if (!divergenceAnalysis.memoryLoads) {
        divergenceAnalysis.memoryLoads = [];
      }
      divergenceAnalysis.memoryLoads.push({
        step: entry.step,
        pc: entry.pc,
        tag: instr.tag,
        address: instr.address,
        a_after: entry.regsAfter.a,
      });
    }
  }

  // ── Part 6: Verify the root cause — trace 0xD01508 writes ──
  console.error('Part 6: Tracing writes to 0xD01508 (list pointer table)...');
  const writeTrace = traceListPtrWrites(baselineMem);

  // ── Part 7: Test fix — seed 0xD01508 AFTER context install ──
  console.error('Part 7: Testing late-seed fix...');
  const lateSeedResult = runLateSeedExperiment(baselineMem);

  const output = {
    probe: 'probe-phase210-stat-error-disasm',
    statEntry: hex(STAT_ENTRY),
    elapsedMs,
    part1_disassembly: disasm,
    part2_detailedTrace: detailedTrace,
    part3_focusedAnalysis: focusedAnalysis,
    part4_comparativeExperiments: {
      baseline: expBaseline,
      clearOp1: expClearOp1,
      setIy12Bit7: expSetIy12Bit7,
      menuMode: expMenuMode,
      clearD008DF: expClearD008DF,
      clearD008E0Region: expClearD008E0Region,
      setStatFlags: expSetStatFlags,
      kitchenSink: expKitchenSink,
    },
    part5_divergenceAnalysis: divergenceAnalysis,
    part6_listPtrWriteTrace: writeTrace,
    part7_lateSeedFix: lateSeedResult,
    FINDINGS: {
      summary: [
        'The STAT error is NOT a flag/RAM check that rejects entry.',
        'The STAT entry (0x058BA9) calls context installer 0x091E13,',
        'which calls InsertMem (0x092226). InsertMem reads BC from',
        '(0xD01508) — the list pointer table base. When BC=0x000000,',
        'the block-copy size calculation wraps negative (0xD01D0B - 0 = huge),',
        'causing LDDR with BC=0x2FEAF5 to overwrite all of RAM including',
        'the stack, crash to PC=0x000000 (reset vector).',
      ].join(' '),
      rootCause: {
        instruction: 'LD BC, (0xD01508) at 0x092231',
        readAddress: '0xD01508',
        expectedValue: 'valid pointer to start of list data area (e.g. 0xD01600)',
        actualValue: '0x000000 (uninitialized / overwritten by context installer)',
        consequence: 'InsertMem LDDR at 0x092263 copies 0x2FEAF5 bytes, corrupts all RAM',
      },
      fix: {
        description: 'Ensure (0xD01508) contains a valid list area pointer before STAT entry.',
        note: 'Simple seeding via seedNearList is overwritten by the context installer.',
        approach: 'Either (a) seed 0xD01508 AFTER the context installer returns, or (b) run the OS list allocation routines (e.g. CreateRList) to properly initialize the allocator state.',
      },
    },
  };

  console.log(JSON.stringify(output, null, 2));
}

try {
  main();
} catch (error) {
  console.log(JSON.stringify({
    probe: 'probe-phase210-stat-error-disasm',
    error: {
      message: error?.message ?? String(error),
      stack: error?.stack ?? String(error),
    },
  }, null, 2));
  process.exitCode = 1;
}
