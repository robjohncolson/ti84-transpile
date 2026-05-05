#!/usr/bin/env node
/**
 * probe-phase190-stat-context-entries.mjs
 *
 * Part A: Try each of the 6 STAT context table entries with A=0x31 (STAT key).
 * Part B: Disassemble 0x0800A0-0x0800F0 and 0x0800EC-0x080120 for table/dispatch patterns.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;

const SEGMENT_STEP_LIMIT = 2000;
const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const CONTEXT_ENTRY_MAX_STEPS = 500;
const OS_MAX_LOOP_ITERATIONS = 8192;

const RAM_WATCH_START = 0xD00000;
const RAM_WATCH_END = 0xD01000;

const STAT_CONTEXT_ENTRIES = [
  0x0585E9,
  0x058B19,
  0x058B7E,
  0x0582BC,
  0x058BA9,
  0x058C01,
];

const TRACE_STOP = '__PHASE190_TRACE_STOP__';

function hex(value, width = 6) {
  if (value === null || value === undefined) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function hexBytes(buffer, start, length) {
  const out = [];
  for (let i = 0; i < length; i++) {
    out.push(hexByte(buffer[(start + i) & 0xFFFFFF] ?? 0));
  }
  return out.join(' ');
}

function read24(mem, addr) {
  const a = addr & 0xFFFFFF;
  return ((mem[a] & 0xFF) | ((mem[a + 1] & 0xFF) << 8) | ((mem[a + 2] & 0xFF) << 16)) >>> 0;
}

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[a + 1] = (value >>> 8) & 0xFF;
  mem[a + 2] = (value >>> 16) & 0xFF;
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

function runUntilHitSegmented(executor, entry, mode, sentinels, totalMaxSteps, maxLoopIterations) {
  let currentPc = entry & 0xFFFFFF;
  let currentMode = mode;
  let totalSteps = 0;
  let lastPc = currentPc;
  let lastMode = currentMode;
  let hit = null;
  let termination = null;
  let errorMessage = null;

  while (totalSteps < totalMaxSteps && !hit) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, totalMaxSteps - totalSteps);
    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations,
        onBlock(pc) {
          const norm = pc & 0xFFFFFF;
          lastPc = norm;
          for (const [name, target] of Object.entries(sentinels)) {
            if (norm === target) {
              hit = name;
              throw new Error(TRACE_STOP);
            }
          }
        },
        onMissingBlock(pc) {
          const norm = pc & 0xFFFFFF;
          lastPc = norm;
          for (const [name, target] of Object.entries(sentinels)) {
            if (norm === target) {
              hit = name;
              throw new Error(TRACE_STOP);
            }
          }
        },
      });
      totalSteps += result.steps ?? 0;
      lastPc = (result.lastPc ?? lastPc) & 0xFFFFFF;
      lastMode = result.lastMode ?? lastMode;
      currentPc = lastPc;
      currentMode = lastMode;
      termination = result.termination ?? null;
      if (termination !== 'max_steps') {
        if (result.error) errorMessage = result.error?.stack ?? String(result.error);
        break;
      }
    } catch (error) {
      if (error?.message === TRACE_STOP) {
        termination = 'sentinel';
        break;
      }
      errorMessage = error?.stack ?? String(error);
      termination = 'exception';
      break;
    }
  }

  return { hit, steps: totalSteps, lastPc, lastMode, termination, errorMessage };
}

function resetCpuForOsCall(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function snapshotCpu(cpu) {
  return {
    pc: hex(cpu._currentBlockPc ?? 0),
    sp: hex(cpu.sp),
    a: hex(cpu.a, 2),
    f: hex(cpu.f, 2),
    hl: hex(cpu._hl),
    de: hex(cpu._de),
    bc: hex(cpu._bc),
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

  cpu.mbase = 0xD0;
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
  mem[0xD008DF] = 0x00; // ROM_ERRNO
  return runUntilHitSegmented(executor, MEM_INIT_ENTRY, 'adl', { ret: MEM_INIT_RET }, MEM_INIT_MAX_STEPS, OS_MAX_LOOP_ITERATIONS);
}

// ---------- Part A: run each STAT context entry ----------

function runContextEntry(executor, cpu, mem, entryAddr, contextIndex) {
  resetCpuForOsCall(cpu, mem);

  // Set A=0x31 (STAT key code), IY=0xD00080, IX=0xD1A860
  cpu.a = 0x31;
  cpu._iy = 0xD00080;
  cpu._ix = 0xD1A860;

  // Push return sentinel
  cpu.sp -= 3;
  write24(mem, cpu.sp, RETURN_SENTINEL);

  // Capture RAM watch region before
  const ramBefore = new Uint8Array(RAM_WATCH_END - RAM_WATCH_START);
  ramBefore.set(mem.subarray(RAM_WATCH_START, RAM_WATCH_END));

  // Track block PCs
  const blockPcs = [];
  let totalSteps = 0;
  let currentPc = entryAddr & 0xFFFFFF;
  let currentMode = 'adl';
  let hit = null;
  let termination = null;
  let errorMessage = null;

  while (totalSteps < CONTEXT_ENTRY_MAX_STEPS && !hit) {
    const segmentBudget = Math.min(SEGMENT_STEP_LIMIT, CONTEXT_ENTRY_MAX_STEPS - totalSteps);
    try {
      const result = executor.runFrom(currentPc, currentMode, {
        maxSteps: segmentBudget,
        maxLoopIterations: OS_MAX_LOOP_ITERATIONS,
        onBlock(pc) {
          const norm = pc & 0xFFFFFF;
          if (blockPcs.length < 50) blockPcs.push(hex(norm));
          if (norm === RETURN_SENTINEL) {
            hit = 'sentinel';
            throw new Error(TRACE_STOP);
          }
        },
        onMissingBlock(pc) {
          const norm = pc & 0xFFFFFF;
          if (blockPcs.length < 50) blockPcs.push(`MISSING:${hex(norm)}`);
          if (norm === RETURN_SENTINEL) {
            hit = 'sentinel';
            throw new Error(TRACE_STOP);
          }
        },
      });
      totalSteps += result.steps ?? 0;
      currentPc = (result.lastPc ?? currentPc) & 0xFFFFFF;
      currentMode = result.lastMode ?? currentMode;
      termination = result.termination ?? null;
      if (termination !== 'max_steps') {
        if (result.error) errorMessage = result.error?.stack ?? String(result.error);
        break;
      }
    } catch (error) {
      if (error?.message === TRACE_STOP) {
        termination = 'sentinel';
        break;
      }
      errorMessage = error?.stack ?? String(error);
      termination = 'exception';
      break;
    }
  }

  if (totalSteps >= CONTEXT_ENTRY_MAX_STEPS && !hit) {
    termination = 'step_limit';
  }

  // Find RAM writes in watch region
  const ramWrites = [];
  for (let addr = RAM_WATCH_START; addr < RAM_WATCH_END; addr++) {
    const before = ramBefore[addr - RAM_WATCH_START];
    const after = mem[addr];
    if (before !== after) {
      ramWrites.push({
        addr: hex(addr),
        before: hex(before, 2),
        after: hex(after, 2),
      });
    }
  }

  return {
    contextIndex,
    entryAddr: hex(entryAddr),
    hit,
    steps: totalSteps,
    termination,
    errorMessage: errorMessage ? errorMessage.split('\n')[0] : null,
    blockPcs,
    cpuAtExit: snapshotCpu(cpu),
    ramWrites: ramWrites.slice(0, 30),
    ramWriteCount: ramWrites.length,
  };
}

// ---------- Part B: disassemble ROM regions ----------

function disassembleRange(startAddr, endAddr) {
  const rows = [];
  let pc = startAddr;

  while (pc < endAddr) {
    try {
      const inst = decodeInstruction(romBytes, pc, 'adl');
      const byteLen = inst.length || 1;
      const rawHex = hexBytes(romBytes, pc, byteLen);

      const row = {
        addr: hex(pc),
        hex: rawHex,
        tag: inst.tag,
        length: byteLen,
      };

      // Capture interesting fields
      if (inst.target !== undefined) row.target = hex(inst.target);
      if (inst.value !== undefined) row.value = hex(inst.value);
      if (inst.addr !== undefined) row.memAddr = hex(inst.addr);
      if (inst.condition !== undefined) row.condition = inst.condition;
      if (inst.pair !== undefined) row.pair = inst.pair;
      if (inst.dest !== undefined) row.dest = inst.dest;
      if (inst.src !== undefined) row.src = inst.src;
      if (inst.displacement !== undefined) row.displacement = inst.displacement;
      if (inst.indexRegister !== undefined) row.indexRegister = inst.indexRegister;
      if (inst.bit !== undefined) row.bit = inst.bit;
      if (inst.reg !== undefined) row.reg = inst.reg;
      if (inst.port !== undefined) row.port = inst.port;

      rows.push(row);
      pc += byteLen;
    } catch (err) {
      rows.push({
        addr: hex(pc),
        hex: hexByte(romBytes[pc]),
        tag: 'DECODE_ERROR',
        error: err.message,
      });
      pc += 1;
    }
  }

  return rows;
}

// ---------- Main ----------

function main() {
  const output = {};

  console.log('=== Phase 190: STAT context entries + 0x0800xx disassembly ===\n');

  // --- Setup ---
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));

  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  console.log('[BOOT] Booting runtime...');
  const bootInfo = bootRuntime(executor, cpu, mem);
  console.log('  Boot:', JSON.stringify(bootInfo.boot));
  console.log('  KernelInit:', JSON.stringify(bootInfo.kernelInit));
  console.log('  PostInit:', JSON.stringify(bootInfo.postInit));
  output.boot = bootInfo;

  console.log('\n[MEMINIT] Running MemInit...');
  const memInit = runMemInit(executor, cpu, mem);
  const memInitSummary = {
    hit: memInit.hit,
    steps: memInit.steps,
    termination: memInit.termination,
  };
  console.log('  MemInit:', JSON.stringify(memInitSummary));
  output.memInit = memInitSummary;

  if (memInit.hit !== 'ret') {
    console.log('  MemInit FAILED — aborting.');
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // --- Part A: context entries ---
  console.log('\n=== PART A: STAT context entry execution ===\n');
  output.contextEntries = [];

  for (let i = 0; i < STAT_CONTEXT_ENTRIES.length; i++) {
    const entry = STAT_CONTEXT_ENTRIES[i];
    console.log(`[CONTEXT ${i}] Entry ${hex(entry)}...`);

    // Fresh boot+memInit for each entry to avoid state contamination
    const entryMem = new Uint8Array(MEM_SIZE);
    entryMem.set(romBytes.subarray(0, Math.min(romBytes.length, 0x400000)));

    const entryPeripherals = createPeripheralBus({ timerInterrupt: false });
    const entryExecutor = createExecutor(BLOCKS, entryMem, { peripherals: entryPeripherals });
    const entryCpu = entryExecutor.cpu;

    bootRuntime(entryExecutor, entryCpu, entryMem);
    const entryMemInit = runMemInit(entryExecutor, entryCpu, entryMem);
    if (entryMemInit.hit !== 'ret') {
      console.log(`  MemInit failed for context ${i}, skipping.`);
      output.contextEntries.push({ contextIndex: i, entryAddr: hex(entry), error: 'memInit failed' });
      continue;
    }

    const result = runContextEntry(entryExecutor, entryCpu, entryMem, entry, i);
    console.log(`  Steps: ${result.steps}, Term: ${result.termination}, Hit: ${result.hit}`);
    console.log(`  Blocks (first 10): ${result.blockPcs.slice(0, 10).join(', ')}`);
    if (result.ramWriteCount > 0) {
      console.log(`  RAM writes (${result.ramWriteCount}): ${JSON.stringify(result.ramWrites.slice(0, 10))}`);
    }
    if (result.errorMessage) {
      console.log(`  Error: ${result.errorMessage}`);
    }

    output.contextEntries.push(result);
  }

  // --- Part B: disassembly ---
  console.log('\n=== PART B: Disassembly of 0x0800A0-0x0800F0 ===\n');

  const disasmRange1 = disassembleRange(0x0800A0, 0x0800F0);
  output.disasm_0800A0_0800F0 = disasmRange1;
  for (const row of disasmRange1) {
    console.log(`  ${row.addr}: ${row.hex.padEnd(20)} ${row.tag}${row.target ? ' -> ' + row.target : ''}${row.value !== undefined ? ' = ' + row.value : ''}${row.condition ? ' [' + row.condition + ']' : ''}${row.pair ? ' ' + row.pair : ''}${row.dest ? ' ' + row.dest : ''}${row.src ? ' ' + row.src : ''}`);
  }

  console.log('\n=== PART B: Disassembly of 0x0800EC-0x080120 ===\n');

  const disasmRange2 = disassembleRange(0x0800EC, 0x080120);
  output.disasm_0800EC_080120 = disasmRange2;
  for (const row of disasmRange2) {
    console.log(`  ${row.addr}: ${row.hex.padEnd(20)} ${row.tag}${row.target ? ' -> ' + row.target : ''}${row.value !== undefined ? ' = ' + row.value : ''}${row.condition ? ' [' + row.condition + ']' : ''}${row.pair ? ' ' + row.pair : ''}${row.dest ? ' ' + row.dest : ''}${row.src ? ' ' + row.src : ''}`);
  }

  // --- Final JSON dump ---
  console.log('\n=== FULL OUTPUT JSON ===\n');
  console.log(JSON.stringify(output, null, 2));
}

main();
