#!/usr/bin/env node

/**
 * Phase 234: Trace 0x0236F9 descriptor handler
 *
 * 0x0236F9 is the common sink for ALL ordinary key codes after classification.
 * It receives a 6-byte descriptor built by 0x022359.
 *
 * The pipeline:
 *   0x02FE89 → CP 0xFF → SET 0,(IY+29) → gate tests → CP 0x36 → CP 0x30
 *   → 0x02FF11 (09F79B table lookup) → CALL 0x022346 → 0x022359 → 0x0236F9
 *
 * Finding: 0x000578 returns Z in the default state, causing 0x022346 to bail
 * before reaching 0x022359 → 0x0236F9. So the natural pipeline only reaches
 * 0x0236F9 when 0x000578 returns NZ (some OS state prerequisite).
 *
 * This probe:
 *   Part A: Traces the full pipeline to document where it goes instead
 *   Part B: Calls 0x0236F9 directly with register setup matching what
 *           0x022359 would provide, to trace the handler's behavior
 *   Part C: Also traces 0x022359 directly to see the descriptor-building logic
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZIP_PATH = `${TRANSPILED_PATH}.gz`;

if (!existsSync(ROM_PATH)) {
  throw new Error('ROM.rom is missing.');
}
if (!existsSync(TRANSPILED_PATH)) {
  throw new Error(
    existsSync(TRANSPILED_GZIP_PATH)
      ? 'ROM.transpiled.js is missing. Gunzip ROM.transpiled.js.gz first.'
      : 'ROM.transpiled.js is missing.',
  );
}

const rom = readFileSync(ROM_PATH);
const transpiledModule = await import('./ROM.transpiled.js');
const PRELIFTED_BLOCKS =
  transpiledModule.PRELIFTED_BLOCKS ??
  transpiledModule.default?.PRELIFTED_BLOCKS ??
  transpiledModule.default ??
  transpiledModule;
const BLOCKS = normalizeBlocks(PRELIFTED_BLOCKS);

/* ── Constants ───────────────────────────────────────────────────── */

const MEM_SIZE = 0x1000000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;

const STAGE_1_ENTRY = 0x0A2B72;
const STAGE_2_ENTRY = 0x0A3301;
const STAGE_3_ENTRY = 0x0A29EC;
const STAGE_4_ENTRY = 0x0A2854;

const STACK_TOP = 0xD1A87E;
const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;

const PIPELINE_ENTRY = 0x02FE89;
const HELPER_22346 = 0x022346;
const HELPER_22359 = 0x022359;
const HANDLER_236F9 = 0x0236F9;

const KEY_TABLE_ADDR = 0x09F79B;

// IY flag offsets we care about
const IY_OFFSETS_TO_WATCH = [0, 5, 9, 12, 18, 29, 31, 34, 87];
const IY_WATCH_ADDRS = new Set(IY_OFFSETS_TO_WATCH.map((o) => IY_ADDR + o));

// RAM ranges of interest
const RAM_WATCH_RANGES = [
  { label: 'D005xx', start: 0xD00500, end: 0xD005FF },
  { label: 'D007xx', start: 0xD00700, end: 0xD007FF },
  { label: 'D008xx', start: 0xD00800, end: 0xD008FF },
  { label: 'D024xx', start: 0xD02400, end: 0xD024FF },
  { label: 'D00Axx', start: 0xD00A00, end: 0xD00AFF },
];

// Pipeline phase 1 max steps (getting to 0x0236F9)
const PIPELINE_MAX_STEPS = 600;
// Phase 2: tracing inside 0x0236F9
const HANDLER_TRACE_STEPS = 500;
// Direct call trace
const DIRECT_TRACE_STEPS = 300;

// Descriptor builder entry
const BUILDER_22359 = 0x022359;
const BUILDER_TRACE_STEPS = 400;

// RAM scratch for descriptor buffer
const DESCRIPTOR_BUF = 0xD02500; // unused RAM area for our test buffer

/* ── Utility helpers ─────────────────────────────────────────────── */

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]),
    );
  }
  return rawBlocks ?? {};
}

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function write24(mem, addr, value) {
  const normalized = addr & 0xFFFFFF;
  mem[normalized] = value & 0xFF;
  mem[normalized + 1] = (value >>> 8) & 0xFF;
  mem[normalized + 2] = (value >>> 16) & 0xFF;
}

function read24(mem, addr) {
  const normalized = addr & 0xFFFFFF;
  return (
    (mem[normalized] & 0xFF) |
    ((mem[normalized + 1] & 0xFF) << 8) |
    ((mem[normalized + 2] & 0xFF) << 16)
  ) >>> 0;
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
}

function stopError(name, detail = null) {
  const error = new Error('__PHASE234_STOP__');
  error.stopName = name;
  error.detail = detail;
  return error;
}

function isWatchedRamAddr(addr) {
  for (const range of RAM_WATCH_RANGES) {
    if (addr >= range.start && addr <= range.end) return true;
  }
  return false;
}

function ramRangeLabel(addr) {
  for (const range of RAM_WATCH_RANGES) {
    if (addr >= range.start && addr <= range.end) return range.label;
  }
  return hex(addr);
}

function iyOffsetLabel(addr) {
  const offset = addr - IY_ADDR;
  return `IY+${offset}`;
}

/* ── Boot helpers ────────────────────────────────────────────────── */

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

function resetCpuState(cpu, mem) {
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
  cpu.sp = STACK_TOP;
  mem.fill(0xFF, Math.max(0, STACK_TOP - 0x80), Math.min(mem.length, STACK_TOP + 0x20));
}

function snapshotCpu(cpu) {
  const fields = [
    'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
    'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
  ];
  return Object.fromEntries(fields.map((f) => [f, cpu[f]]));
}

function restoreCpuForHomescreen(cpu, snapshot, mem) {
  for (const [f, v] of Object.entries(snapshot)) {
    cpu[f] = v;
  }
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = IY_ADDR;
  cpu.f = 0x40;
  cpu._ix = IX_ADDR;
  cpu.sp = STACK_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

/**
 * Full boot: z80 boot → kernelInit → postInit → memInit → homescreen stages
 * Returns a snapshot of fully-initialized memory.
 */
function bootFull() {
  const mem = createMemoryWithRom();
  const { executor, cpu } = createRuntime(mem);

  // z80 boot
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  // kernelInit
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  // postInit
  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  // memInit
  resetCpuState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEM_INIT_RET);

  let memInitReturned = false;
  try {
    executor.runFrom(MEM_INIT_ENTRY, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: 8192,
      onBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) {
          throw stopError('mem_init_return');
        }
      },
      onMissingBlock(pc) {
        if ((pc & 0xFFFFFF) === MEM_INIT_RET) {
          throw stopError('mem_init_return');
        }
      },
    });
  } catch (error) {
    if (error?.message === '__PHASE234_STOP__' && error.stopName === 'mem_init_return') {
      memInitReturned = true;
    } else {
      throw error;
    }
  }

  // Homescreen stages 1-4
  const cpuSnap = snapshotCpu(cpu);

  restoreCpuForHomescreen(cpu, cpuSnap, mem);
  executor.runFrom(STAGE_1_ENTRY, 'adl', { maxSteps: 30000, maxLoopIterations: 500 });

  restoreCpuForHomescreen(cpu, cpuSnap, mem);
  mem[0xD0009B] &= ~0x40;
  executor.runFrom(STAGE_2_ENTRY, 'adl', { maxSteps: 30000, maxLoopIterations: 500 });

  restoreCpuForHomescreen(cpu, cpuSnap, mem);
  executor.runFrom(STAGE_3_ENTRY, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });

  restoreCpuForHomescreen(cpu, cpuSnap, mem);
  executor.runFrom(STAGE_4_ENTRY, 'adl', { maxSteps: 50000, maxLoopIterations: 500 });

  console.log(`  Boot complete. memInit returned: ${memInitReturned}`);

  return new Uint8Array(mem);
}

/* ── Disassembly helpers ─────────────────────────────────────────── */

function decodeFrom(startPc, maxInstructions = 64) {
  const rows = [];
  let pc = startPc & 0xFFFFFF;
  for (let i = 0; i < maxInstructions; i++) {
    try {
      const inst = decodeInstruction(rom, pc, 'adl');
      const bytes = Array.from(
        rom.slice(inst.pc, inst.pc + inst.length),
        (b) => b.toString(16).toUpperCase().padStart(2, '0'),
      ).join(' ');
      rows.push({ pc: inst.pc >>> 0, bytes, tag: inst.tag, length: inst.length, inst });
      pc = inst.nextPc & 0xFFFFFF;
      if (inst.tag === 'ret') break;
    } catch (err) {
      rows.push({ pc, bytes: '??', tag: 'decode-error', length: 1, inst: null });
      pc = (pc + 1) & 0xFFFFFF;
    }
  }
  return rows;
}

/* ── Trace scenarios ─────────────────────────────────────────────── */

/**
 * Part A: Trace the full pipeline to see where it actually goes
 * (0x000578 returns Z, so the path to 0x0236F9 is blocked)
 */
function tracePipeline(baselineMemory, keyCode, label) {
  console.log(`\n--- Pipeline trace: ${label} (A=${hexByte(keyCode)}) ---`);

  const mem = new Uint8Array(baselineMemory);
  const { executor, cpu } = createRuntime(mem);

  resetCpuState(cpu, mem);
  cpu.a = keyCode & 0xFF;
  cpu.f = 0x40;
  cpu.iy = IY_ADDR;
  cpu.ix = IX_ADDR;

  // Clear IY flags that gate the cascade
  mem[IY_ADDR + 18] = 0x00;
  mem[IY_ADDR + 29] = 0x00;
  mem[IY_ADDR + 31] = 0x00;
  mem[IY_ADDR + 87] = 0x00;

  push24(cpu, mem, RETURN_SENTINEL);

  const visited = [];
  let termination = 'unknown';
  let reached236F9 = false;
  let reached22359 = false;

  try {
    executor.runFrom(PIPELINE_ENTRY, 'adl', {
      maxSteps: PIPELINE_MAX_STEPS,
      maxLoopIterations: 256,
      onBlock(pc) {
        const normalized = pc & 0xFFFFFF;
        if (visited.length < 200) visited.push(normalized);
        if (normalized === HANDLER_236F9) reached236F9 = true;
        if (normalized === HELPER_22359) reached22359 = true;
        if (normalized === RETURN_SENTINEL) throw stopError('sentinel');
      },
      onMissingBlock(pc) {
        if ((pc & 0xFFFFFF) === RETURN_SENTINEL) throw stopError('sentinel');
      },
    });
    termination = 'step_limit';
  } catch (error) {
    if (error?.message === '__PHASE234_STOP__') {
      termination = error.stopName;
    } else {
      throw error;
    }
  }

  console.log(`  Termination: ${termination}, blocks: ${visited.length}`);
  console.log(`  Reached 0x022359: ${reached22359}, reached 0x0236F9: ${reached236F9}`);
  console.log(`  Path: ${visited.map((pc) => hex(pc)).join(' -> ')}`);

  return { label, keyCode, reached236F9, reached22359, termination };
}

/**
 * Part B: Call 0x0236F9 directly with proper register setup.
 * From static disassembly, 0x0236F9 expects:
 *   - A = the descriptor byte (key-derived value from 0x022359)
 *   - HL = pointer to 3-byte output buffer
 * It writes 3 bytes: [A, D007E0, conditionally D0058E or 0x00]
 * Then reads port 0xDCA0 and returns.
 */
function traceHandlerDirect(baselineMemory, keyCode, label) {
  console.log(`\n--- Direct 0x0236F9 trace: ${label} (A=${hexByte(keyCode)}) ---`);

  const mem = new Uint8Array(baselineMemory);
  const { executor, cpu } = createRuntime(mem);

  resetCpuState(cpu, mem);

  // Set up the descriptor byte in A (what 0x022359 would pass)
  cpu.a = keyCode & 0xFF;
  cpu.f = 0x40;
  cpu.iy = IY_ADDR;
  cpu.ix = IX_ADDR;

  // Set HL to point to our test buffer
  cpu.hl = DESCRIPTOR_BUF;

  // Clear the buffer area
  mem.fill(0x00, DESCRIPTOR_BUF, DESCRIPTOR_BUF + 8);

  // Seed watched RAM with known values
  const d007e0_val = mem[0xD007E0];
  const d0058e_val = mem[0xD0058E];

  push24(cpu, mem, RETURN_SENTINEL);

  console.log(`  Pre-call state:`);
  console.log(`    A=${hexByte(cpu.a)} HL=${hex(cpu.hl)}`);
  console.log(`    D007E0=${hexByte(d007e0_val)} D0058E=${hexByte(d0058e_val)}`);

  const visited = [];
  const ramWrites = [];
  let termination = 'unknown';
  let steps = 0;

  // Hook writes
  const originalWrite8 = cpu.write8.bind(cpu);
  cpu.write8 = (addr, value) => {
    const normalized = addr & 0xFFFFFF;
    const before = mem[normalized] ?? 0;
    originalWrite8(addr, value);
    const after = mem[normalized] ?? 0;
    if (before !== after) {
      ramWrites.push({
        step: steps,
        pc: cpu._currentBlockPc ?? 0,
        addr: normalized,
        before,
        after,
      });
    }
  };

  try {
    executor.runFrom(HANDLER_236F9, 'adl', {
      maxSteps: DIRECT_TRACE_STEPS,
      maxLoopIterations: 64,
      onBlock(pc, mode, meta, step) {
        steps = step;
        const normalized = pc & 0xFFFFFF;
        if (visited.length < 200) visited.push(normalized);
        if (normalized === RETURN_SENTINEL) throw stopError('handler_returned');
      },
      onMissingBlock(pc) {
        if ((pc & 0xFFFFFF) === RETURN_SENTINEL) throw stopError('handler_returned');
      },
    });
    termination = 'step_limit';
  } catch (error) {
    if (error?.message === '__PHASE234_STOP__') {
      termination = error.stopName;
    } else {
      throw error;
    }
  }

  // Read the output buffer
  const outputBytes = Array.from(mem.slice(DESCRIPTOR_BUF, DESCRIPTOR_BUF + 8), (b) => b & 0xFF);

  console.log(`  Steps: ${steps}, termination: ${termination}`);
  console.log(`  Blocks: ${visited.map((pc) => hex(pc)).join(' -> ')}`);
  console.log(`  Output buffer: [${outputBytes.map((b) => hexByte(b)).join(' ')}]`);
  console.log(`  Final A=${hexByte(cpu.a)} HL=${hex(cpu.hl)} BC=${hex(cpu.bc)}`);

  if (ramWrites.length > 0) {
    console.log(`  RAM writes (${ramWrites.length}):`);
    for (const w of ramWrites) {
      console.log(`    step=${w.step} @${hex(w.pc)} addr=${hex(w.addr)}: ${hexByte(w.before)} -> ${hexByte(w.after)}`);
    }
  }

  // Verify expected behavior from static analysis
  const byte0 = outputBytes[0]; // should be input A
  const byte1 = outputBytes[1]; // should be D007E0
  const byte2 = outputBytes[2]; // should be 0x00 or D0058E depending on D007E0 == 0x4E

  const byte0Match = byte0 === (keyCode & 0xFF);
  const byte1Match = byte1 === d007e0_val;
  const byte2Expected = d007e0_val === 0x4E ? d0058e_val : 0x00;
  const byte2Match = byte2 === byte2Expected;

  console.log(`  Verification:`);
  console.log(`    byte[0] = A? ${byte0Match ? 'YES' : 'NO'} (${hexByte(byte0)} vs ${hexByte(keyCode)})`);
  console.log(`    byte[1] = D007E0? ${byte1Match ? 'YES' : 'NO'} (${hexByte(byte1)} vs ${hexByte(d007e0_val)})`);
  console.log(`    byte[2] = ${d007e0_val === 0x4E ? 'D0058E' : '0x00'}? ${byte2Match ? 'YES' : 'NO'} (${hexByte(byte2)} vs ${hexByte(byte2Expected)})`);

  const pass = termination === 'handler_returned' && byte0Match && byte1Match && byte2Match;
  console.log(`  Result: ${pass ? 'PASS' : 'FAIL'}`);

  return { label, keyCode, pass, termination, outputBytes, steps };
}

/**
 * Part C: Call 0x022359 directly to see the full descriptor builder + handler.
 * 0x022359 builds a 6-byte descriptor, then calls 0x0236F9.
 */
function traceDescriptorBuilder(baselineMemory, keyCode, label) {
  console.log(`\n--- 0x022359 descriptor builder trace: ${label} (A=${hexByte(keyCode)}) ---`);

  const mem = new Uint8Array(baselineMemory);
  const { executor, cpu } = createRuntime(mem);

  resetCpuState(cpu, mem);

  // 0x022359 expects:
  // A = key descriptor byte
  // HL = key ID (from table or computed)
  cpu.a = keyCode & 0xFF;
  cpu.hl = keyCode & 0xFFFFFF; // simple key code as ID
  cpu.f = 0x40;
  cpu.iy = IY_ADDR;
  cpu.ix = IX_ADDR;

  push24(cpu, mem, RETURN_SENTINEL);

  const visited = [];
  const ramWrites = [];
  let termination = 'unknown';
  let steps = 0;
  let entered236F9 = false;
  let state236F9 = null;

  const originalWrite8 = cpu.write8.bind(cpu);
  cpu.write8 = (addr, value) => {
    const normalized = addr & 0xFFFFFF;
    const before = mem[normalized] ?? 0;
    originalWrite8(addr, value);
    const after = mem[normalized] ?? 0;
    if (before !== after && ramWrites.length < 200) {
      ramWrites.push({
        step: steps,
        pc: cpu._currentBlockPc ?? 0,
        addr: normalized,
        before,
        after,
      });
    }
  };

  try {
    executor.runFrom(BUILDER_22359, 'adl', {
      maxSteps: BUILDER_TRACE_STEPS,
      maxLoopIterations: 128,
      onBlock(pc, mode, meta, step) {
        steps = step;
        const normalized = pc & 0xFFFFFF;
        if (visited.length < 200) visited.push(normalized);

        if (normalized === HANDLER_236F9 && !entered236F9) {
          entered236F9 = true;
          const hlAddr = cpu.hl & 0xFFFFFF;
          state236F9 = {
            a: cpu.a & 0xFF,
            hl: hlAddr,
            sp: cpu.sp & 0xFFFFFF,
            descriptorBytes: Array.from(mem.slice(hlAddr, hlAddr + 8), (b) => b & 0xFF),
          };
        }

        if (normalized === RETURN_SENTINEL) throw stopError('returned');
      },
      onMissingBlock(pc) {
        if ((pc & 0xFFFFFF) === RETURN_SENTINEL) throw stopError('returned');
      },
    });
    termination = 'step_limit';
  } catch (error) {
    if (error?.message === '__PHASE234_STOP__') {
      termination = error.stopName;
    } else {
      throw error;
    }
  }

  console.log(`  Steps: ${steps}, termination: ${termination}`);
  console.log(`  Blocks: ${visited.map((pc) => hex(pc)).join(' -> ')}`);
  console.log(`  Entered 0x0236F9: ${entered236F9}`);

  if (state236F9) {
    console.log(`  State at 0x0236F9 entry:`);
    console.log(`    A=${hexByte(state236F9.a)} HL=${hex(state236F9.hl)} SP=${hex(state236F9.sp)}`);
    console.log(`    Descriptor @HL: [${state236F9.descriptorBytes.map((b) => hexByte(b)).join(' ')}]`);
  }

  if (ramWrites.length > 0) {
    console.log(`  RAM writes (${ramWrites.length}):`);
    for (const w of ramWrites.slice(0, 30)) {
      console.log(`    step=${w.step} @${hex(w.pc)} addr=${hex(w.addr)}: ${hexByte(w.before)} -> ${hexByte(w.after)}`);
    }
    if (ramWrites.length > 30) {
      console.log(`    ... (${ramWrites.length - 30} more)`);
    }
  }

  const pass = entered236F9;
  console.log(`  Result: ${pass ? 'PASS' : 'FAIL'}`);

  return { label, keyCode, pass, entered236F9, termination, steps };
}

/**
 * LEGACY: Full pipeline trace (kept for completeness, but 0x000578 blocks the path)
 */
function traceKeyCode(baselineMemory, keyCode, label) {
  console.log(`\n=== Trace: ${label} (A=${hexByte(keyCode)}) ===`);

  const mem = new Uint8Array(baselineMemory);
  const { executor, cpu } = createRuntime(mem);

  // Set up CPU state for pipeline entry at 0x02FE89
  resetCpuState(cpu, mem);

  // The function at 0x02FE89 expects A = key code
  cpu.a = keyCode & 0xFF;
  cpu.f = 0x40; // Z flag set (no prior comparison)
  cpu.iy = IY_ADDR;
  cpu.ix = IX_ADDR;
  cpu.mbase = MBASE;
  cpu.madl = 1;

  // Clear IY flags that gate the cascade
  mem[IY_ADDR + 18] = 0x00;
  mem[IY_ADDR + 29] = 0x00;
  mem[IY_ADDR + 31] = 0x00;
  mem[IY_ADDR + 87] = 0x00;

  // Push return sentinel
  push24(cpu, mem, RETURN_SENTINEL);

  // Phase 1: Run through the pipeline until we reach 0x0236F9
  const pipelineVisited = [];
  let reached236F9 = false;
  let entryState236F9 = null;

  // Snapshot IY flags before
  const iyBefore = {};
  for (const offset of IY_OFFSETS_TO_WATCH) {
    iyBefore[offset] = mem[IY_ADDR + offset];
  }

  try {
    executor.runFrom(PIPELINE_ENTRY, 'adl', {
      maxSteps: PIPELINE_MAX_STEPS,
      maxLoopIterations: 256,
      onBlock(pc) {
        const normalized = pc & 0xFFFFFF;
        if (pipelineVisited.length < 200) pipelineVisited.push(normalized);

        if (normalized === HANDLER_236F9 && !reached236F9) {
          reached236F9 = true;
          const hlAddr = cpu.hl & 0xFFFFFF;
          entryState236F9 = {
            a: cpu.a & 0xFF,
            f: cpu.f & 0xFF,
            bc: cpu.bc & 0xFFFFFF,
            de: cpu.de & 0xFFFFFF,
            hl: hlAddr,
            sp: cpu.sp & 0xFFFFFF,
            ix: (cpu._ix ?? cpu.ix) & 0xFFFFFF,
            descriptorBytes: Array.from(mem.slice(hlAddr, hlAddr + 8), (b) => b & 0xFF),
            stackTop6: Array.from(mem.slice(cpu.sp & 0xFFFFFF, (cpu.sp & 0xFFFFFF) + 6), (b) => b & 0xFF),
          };
          throw stopError('reached_236f9');
        }
      },
      onMissingBlock(pc) {
        const normalized = pc & 0xFFFFFF;
        if (normalized === RETURN_SENTINEL) {
          throw stopError('hit_sentinel_before_236f9');
        }
      },
    });
  } catch (error) {
    if (error?.message !== '__PHASE234_STOP__') throw error;
    if (error.stopName === 'hit_sentinel_before_236f9') {
      console.log('  FAIL: Hit return sentinel before reaching 0x0236F9');
      console.log(`  Pipeline blocks: ${pipelineVisited.map((pc) => hex(pc)).join(' -> ')}`);
      return { label, keyCode, reached236F9: false, pass: false };
    }
  }

  if (!reached236F9) {
    console.log('  FAIL: Did not reach 0x0236F9 within pipeline budget');
    console.log(`  Pipeline blocks (${pipelineVisited.length}): ${pipelineVisited.map((pc) => hex(pc)).join(' -> ')}`);
    return { label, keyCode, reached236F9: false, pass: false };
  }

  // Print pipeline path
  console.log(`  Pipeline to 0x0236F9: ${pipelineVisited.length} blocks`);
  console.log(`  Path: ${pipelineVisited.map((pc) => hex(pc)).join(' -> ')}`);

  // Print entry state
  console.log(`  Entry state at 0x0236F9:`);
  console.log(`    A=${hexByte(entryState236F9.a)} F=${hexByte(entryState236F9.f)} BC=${hex(entryState236F9.bc)} DE=${hex(entryState236F9.de)}`);
  console.log(`    HL=${hex(entryState236F9.hl)} SP=${hex(entryState236F9.sp)} IX=${hex(entryState236F9.ix)}`);
  console.log(`    Descriptor bytes @HL: [${entryState236F9.descriptorBytes.map((b) => hexByte(b)).join(' ')}]`);
  console.log(`    Stack top 6 bytes: [${entryState236F9.stackTop6.map((b) => hexByte(b)).join(' ')}]`);

  // Phase 2: Now trace INSIDE 0x0236F9 for 300+ steps
  // We resume from exactly where we stopped — same memory, same CPU state
  // (the stopError interrupted before the block ran, so we re-run from 0x0236F9)

  const handlerVisited = [];
  const callTargets = [];
  const jpTargets = [];
  const iyWrites = [];
  const ramWrites = [];
  const ramReads = [];
  let handlerTermination = 'unknown';
  let handlerSteps = 0;

  // Snapshot IY flags at handler entry
  const iyAtEntry = {};
  for (const offset of IY_OFFSETS_TO_WATCH) {
    iyAtEntry[offset] = mem[IY_ADDR + offset];
  }

  // Hook write8 to capture RAM writes
  const originalWrite8 = cpu.write8.bind(cpu);
  cpu.write8 = (addr, value) => {
    const normalized = addr & 0xFFFFFF;
    const before = mem[normalized] ?? 0;
    originalWrite8(addr, value);
    const after = mem[normalized] ?? 0;

    if (before !== after) {
      if (IY_WATCH_ADDRS.has(normalized)) {
        iyWrites.push({
          step: handlerSteps,
          pc: cpu._currentBlockPc ?? 0,
          offset: normalized - IY_ADDR,
          before,
          after,
        });
      }
      if (isWatchedRamAddr(normalized)) {
        if (ramWrites.length < 200) {
          ramWrites.push({
            step: handlerSteps,
            pc: cpu._currentBlockPc ?? 0,
            addr: normalized,
            before,
            after,
          });
        }
      }
    }
  };

  try {
    executor.runFrom(HANDLER_236F9, 'adl', {
      maxSteps: HANDLER_TRACE_STEPS,
      maxLoopIterations: 256,
      onBlock(pc, mode, meta, step) {
        handlerSteps = step;
        const normalized = pc & 0xFFFFFF;
        if (handlerVisited.length < 500) handlerVisited.push(normalized);

        // Decode instruction at this block to detect CALL/JP
        try {
          const inst = decodeInstruction(rom, normalized, 'adl');
          if (inst.tag === 'call' || inst.tag === 'call-conditional') {
            callTargets.push({ step, from: normalized, target: inst.target & 0xFFFFFF });
          }
          if (inst.tag === 'jp' || inst.tag === 'jp-conditional') {
            jpTargets.push({ step, from: normalized, target: inst.target & 0xFFFFFF });
          }
        } catch {}

        if (normalized === RETURN_SENTINEL) {
          throw stopError('handler_returned');
        }
      },
      onMissingBlock(pc) {
        const normalized = pc & 0xFFFFFF;
        if (normalized === RETURN_SENTINEL) {
          throw stopError('handler_returned');
        }
      },
    });
    handlerTermination = 'step_limit';
  } catch (error) {
    if (error?.message === '__PHASE234_STOP__') {
      handlerTermination = error.stopName;
    } else {
      throw error;
    }
  }

  // Print handler trace results
  console.log(`\n  Handler trace (${handlerSteps} steps, termination=${handlerTermination}):`);

  // Unique blocks visited
  const uniqueBlocks = [...new Set(handlerVisited)];
  console.log(`  Unique blocks visited (${uniqueBlocks.length}): ${uniqueBlocks.map((pc) => hex(pc)).join(' ')}`);

  // Full block sequence (truncated)
  const seqStr = handlerVisited.slice(0, 60).map((pc) => hex(pc)).join(' -> ');
  console.log(`  Block sequence (first ${Math.min(60, handlerVisited.length)}): ${seqStr}`);
  if (handlerVisited.length > 60) {
    console.log(`    ... (${handlerVisited.length - 60} more)`);
  }

  // CALL targets
  if (callTargets.length > 0) {
    console.log(`  CALL targets (${callTargets.length}):`);
    for (const ct of callTargets) {
      console.log(`    step=${ct.step} from=${hex(ct.from)} target=${hex(ct.target)}`);
    }
  } else {
    console.log('  CALL targets: none');
  }

  // JP targets
  if (jpTargets.length > 0) {
    console.log(`  JP targets (${jpTargets.length}):`);
    for (const jt of jpTargets) {
      console.log(`    step=${jt.step} from=${hex(jt.from)} target=${hex(jt.target)}`);
    }
  } else {
    console.log('  JP targets: none');
  }

  // IY flag changes
  if (iyWrites.length > 0) {
    console.log(`  IY flag changes (${iyWrites.length}):`);
    for (const w of iyWrites) {
      console.log(`    step=${w.step} @${hex(w.pc)} IY+${w.offset}: ${hexByte(w.before)} -> ${hexByte(w.after)}`);
    }
  } else {
    console.log('  IY flag changes: none');
  }

  // RAM writes in watched ranges
  if (ramWrites.length > 0) {
    console.log(`  RAM writes in watched ranges (${ramWrites.length}):`);
    for (const w of ramWrites) {
      console.log(`    step=${w.step} @${hex(w.pc)} ${hex(w.addr)} [${ramRangeLabel(w.addr)}]: ${hexByte(w.before)} -> ${hexByte(w.after)}`);
    }
  } else {
    console.log('  RAM writes in watched ranges: none');
  }

  // Final IY state comparison
  console.log('  IY flags after handler:');
  for (const offset of IY_OFFSETS_TO_WATCH) {
    const before = iyAtEntry[offset];
    const after = mem[IY_ADDR + offset];
    if (before !== after) {
      console.log(`    IY+${offset}: ${hexByte(before)} -> ${hexByte(after)} (CHANGED)`);
    }
  }

  // Final CPU state
  console.log(`  Final CPU: A=${hexByte(cpu.a)} F=${hexByte(cpu.f)} HL=${hex(cpu.hl)} DE=${hex(cpu.de)} BC=${hex(cpu.bc)} SP=${hex(cpu.sp)}`);

  return {
    label,
    keyCode,
    reached236F9: true,
    entryState236F9,
    handlerSteps,
    handlerTermination,
    uniqueBlocks: uniqueBlocks.length,
    callTargets: callTargets.length,
    jpTargets: jpTargets.length,
    iyChanges: iyWrites.length,
    ramWrites: ramWrites.length,
    pass: true,
  };
}

/* ── Static disassembly of 0x0236F9 ─────────────────────────────── */

function printStaticDisassembly() {
  console.log('=== Part 1: Static disassembly of 0x0236F9 ===\n');

  const rows = decodeFrom(HANDLER_236F9, 80);
  for (const row of rows) {
    const tagStr = row.inst
      ? formatInstructionSimple(row.inst)
      : row.tag;
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(18)}  ${tagStr}`);
  }
  console.log('');
}

function formatInstructionSimple(inst) {
  switch (inst.tag) {
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${inst.condition?.toUpperCase() ?? '?'}`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${inst.condition?.toUpperCase() ?? '?'}, ${hex(inst.target)}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${inst.condition?.toUpperCase() ?? '?'}, ${hex(inst.target)}`;
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${inst.condition?.toUpperCase() ?? '?'}, ${hex(inst.target)}`;
    case 'push': return `PUSH ${inst.pair?.toUpperCase() ?? '?'}`;
    case 'pop': return `POP ${inst.pair?.toUpperCase() ?? '?'}`;
    case 'ld-reg-imm': return `LD ${inst.dest?.toUpperCase() ?? '?'}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `LD ${inst.dest?.toUpperCase() ?? '?'}, ${inst.src?.toUpperCase() ?? '?'}`;
    case 'ld-reg-ind': return `LD ${inst.dest?.toUpperCase() ?? '?'}, (${inst.src?.toUpperCase() ?? '?'})`;
    case 'ld-reg-ixd': return `LD ${inst.dest?.toUpperCase() ?? '?'}, (${inst.indexRegister?.toUpperCase() ?? '?'}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'ld-ixd-reg': return `LD (${inst.indexRegister?.toUpperCase() ?? '?'}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}), ${inst.src?.toUpperCase() ?? '?'}`;
    case 'ld-pair-imm': return `LD ${inst.pair?.toUpperCase() ?? '?'}, ${hex(inst.value)}`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}), ${inst.src?.toUpperCase() ?? '?'}`;
    case 'ld-sp-pair': return `LD SP, ${inst.pair?.toUpperCase() ?? '?'}`;
    case 'add-pair': return `ADD ${inst.dest?.toUpperCase() ?? '?'}, ${inst.src?.toUpperCase() ?? '?'}`;
    case 'lea': return `LEA ${inst.dest?.toUpperCase() ?? '?'}, ${inst.base?.toUpperCase() ?? '?'}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`;
    case 'indexed-cb-bit': return `BIT ${inst.bit}, (${inst.indexRegister?.toUpperCase() ?? '?'}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'indexed-cb-set': return `SET ${inst.bit}, (${inst.indexRegister?.toUpperCase() ?? '?'}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'indexed-cb-res': return `RES ${inst.bit}, (${inst.indexRegister?.toUpperCase() ?? '?'}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'alu-imm': return `${inst.op?.toUpperCase() ?? '?'} ${hexByte(inst.value)}`;
    case 'alu-reg': return `${inst.op?.toUpperCase() ?? '?'} ${inst.src === '(hl)' ? '(HL)' : inst.src?.toUpperCase() ?? '?'}`;
    case 'rotate-reg': return `${inst.op?.toUpperCase() ?? '?'} ${inst.reg?.toUpperCase() ?? '?'}`;
    case 'ld-ind-pair': return `LD (${inst.dest?.toUpperCase() ?? '?'}), ${inst.value !== undefined ? hex(inst.value) : inst.src?.toUpperCase() ?? '?'}`;
    default: return inst.tag;
  }
}

/* ── Main ────────────────────────────────────────────────────────── */

async function main() {
  console.log('Phase 234: 0x0236F9 descriptor handler trace');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`Transpiled: ROM.transpiled.js`);
  console.log('');

  // Part 1: Static disassembly
  printStaticDisassembly();

  // Part 2: Full boot
  console.log('=== Part 2: Full boot ===');
  const baselineMemory = bootFull();
  console.log('');

  const keyCodes = [
    { keyCode: 0x8F, label: "Digit '1'" },
    { keyCode: 0x80, label: "'+' operator" },
    { keyCode: 0x9A, label: "Letter 'A'" },
  ];

  // Part 3: Pipeline traces (expected to NOT reach 0x0236F9 due to 0x000578 Z gate)
  console.log('\n=== Part 3: Pipeline traces (0x02FE89 entry) ===');
  console.log('  Note: 0x000578 returns Z, which causes 0x022346 to bail before 0x022359/0x0236F9.');
  const pipelineResults = [];
  for (const scenario of keyCodes) {
    pipelineResults.push(tracePipeline(baselineMemory, scenario.keyCode, scenario.label));
  }

  // Part 4: Direct 0x0236F9 calls with synthetic register setup
  console.log('\n\n=== Part 4: Direct 0x0236F9 handler traces ===');
  const directResults = [];
  for (const scenario of keyCodes) {
    directResults.push(traceHandlerDirect(baselineMemory, scenario.keyCode, scenario.label));
  }

  // Part 5: 0x022359 descriptor builder traces
  console.log('\n\n=== Part 5: 0x022359 descriptor builder traces ===');
  const builderResults = [];
  for (const scenario of keyCodes) {
    builderResults.push(traceDescriptorBuilder(baselineMemory, scenario.keyCode, scenario.label));
  }

  // Part 6: Summary report
  console.log('\n\n=== Part 6: Summary Report ===\n');

  let passCount = 0;
  let failCount = 0;
  const allResults = [...directResults, ...builderResults];

  for (const r of directResults) {
    const status = r.pass ? 'PASS' : 'FAIL';
    if (r.pass) passCount++;
    else failCount++;
    console.log(`  [${status}] Direct 0x0236F9: ${r.label} (A=${hexByte(r.keyCode)})`);
    if (r.pass) {
      console.log(`    Output: [${r.outputBytes.map((b) => hexByte(b)).join(' ')}]`);
    }
  }

  for (const r of builderResults) {
    const status = r.pass ? 'PASS' : 'FAIL';
    if (r.pass) passCount++;
    else failCount++;
    console.log(`  [${status}] 0x022359 builder: ${r.label} (A=${hexByte(r.keyCode)}) entered236F9=${r.entered236F9}`);
  }

  console.log(`\n  Total: ${passCount} PASS, ${failCount} FAIL out of ${allResults.length}`);

  // Interpretation
  console.log('\n  Interpretation:');
  console.log('    0x0236F9 is a small descriptor-writing stub (17 bytes, 0x0236F9-0x023716).');
  console.log('    Given A (key descriptor) and HL (output buffer pointer), it writes:');
  console.log('      byte[0] = A (the key descriptor value)');
  console.log('      byte[1] = contents of D007E0 (OS app/context state byte)');
  console.log('      byte[2] = 0x00 normally, OR contents of D0058E if D007E0 == 0x4E');
  console.log('    Then reads port 0xDCA0 (IN A,(C) with BC=0x00DCA0) and returns.');
  console.log('    The port read likely captures a hardware state snapshot alongside the descriptor.');
  console.log('');
  console.log('    The natural pipeline path (0x02FE89 -> 0x022346 -> 0x000578) typically');
  console.log('    bails with Z flag at 0x000578, suggesting 0x0236F9 is only reached when');
  console.log('    a specific OS state prerequisite (checked by 0x000578) is satisfied.');
  console.log('    When that gate is open, 0x022359 stack-packs a descriptor and calls 0x0236F9.');
  console.log('');
}

await main();
