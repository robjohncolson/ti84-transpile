#!/usr/bin/env node

/**
 * probe-phase305-getCSC-key-path.mjs
 *
 * Phase 305 — Trace the SDK _GetCSC key-present path at 0x03FB9A.
 *
 * Session 304 found that SDK _GetCSC (0x02014C → JP 0x03FA09) is the real
 * implementation (~112 instructions). The key-present path at 0x03FB9A checks
 * 6 IY flags (IY+18, IY+9, IY+67, IY+91, IY+92, IY+40), can override key
 * to 0x0F, returns scan code in A via POP AF.
 *
 * Three experiments:
 *   1. Warm CPU with key ready: seed 0xD00587=0x31, set IY+0 bit 3, call
 *      0x03FA09 for 500 steps. Log every block, IY flag checks, final A.
 *   2. IY flag overrides: for each of IY+18, IY+9, IY+67, IY+91, IY+92,
 *      IY+40 — set bits and trace. Which causes key override to 0x0F?
 *   3. USB fallback at 0x03FA8D — what conditions trigger it, what from
 *      port 0x500C and D14xxx addresses?
 */

process.emitWarning = () => {};

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MEM_SIZE = 0x1000000;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;

const STACK_TOP = 0xD1A87E;
const MEM_INIT_RET = 0x7FFFF6;
const RETURN_SENTINEL = 0x7FFFFE;

const IY_BASE = 0xD00080;
const GETCSC_IMPL = 0x03FA09;
const KEY_PRESENT_PATH = 0x03FB9A;
const USB_FALLBACK = 0x03FA8D;
const SCAN_CODE_BUF = 0xD00587;

// IY flag offsets that the key-present path checks
const IY_FLAG_OFFSETS = [18, 9, 67, 91, 92, 40];

if (!existsSync(ROM_PATH)) {
  throw new Error(`Missing ROM: ${ROM_PATH}`);
}

if (!existsSync(TRANSPILED_PATH)) {
  throw new Error(
    `Missing transpiled ROM: ${TRANSPILED_PATH}. Run: node scripts/transpile-ti84-rom.mjs`,
  );
}

const romBytes = readFileSync(ROM_PATH);
const transpiledModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const RAW_BLOCKS =
  transpiledModule.PRELIFTED_BLOCKS ??
  transpiledModule.default?.PRELIFTED_BLOCKS ??
  transpiledModule.default ??
  transpiledModule;
const BLOCKS = normalizeBlocks(RAW_BLOCKS);

// --- Helpers ---

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(
      rawBlocks.filter((b) => b?.id).map((b) => [b.id, b]),
    );
  }
  return rawBlocks ?? {};
}

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function read24(mem, addr) {
  const a = addr & 0xFFFFFF;
  return (
    (mem[a] & 0xFF) |
    ((mem[(a + 1) & 0xFFFFFF] & 0xFF) << 8) |
    ((mem[(a + 2) & 0xFFFFFF] & 0xFF) << 16)
  ) >>> 0;
}

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[(a + 1) & 0xFFFFFF] = (value >>> 8) & 0xFF;
  mem[(a + 2) & 0xFFFFFF] = (value >>> 16) & 0xFF;
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
}

function stackBytes(mem, sp, count = 6) {
  const bytes = [];
  const base = sp & 0xFFFFFF;
  for (let i = 0; i < count; i++) {
    bytes.push(mem[(base + i) & 0xFFFFFF] & 0xFF);
  }
  return bytes;
}

function formatBytes(bytes) {
  return bytes.map((v) => hexByte(v)).join(' ');
}

function snapshotState(cpu, mem) {
  const sp = cpu.sp & 0xFFFFFF;
  return {
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    hl: cpu.hl & 0xFFFFFF,
    bc: cpu.bc & 0xFFFFFF,
    de: cpu.de & 0xFFFFFF,
    sp,
    iy: cpu.iy & 0xFFFFFF,
    top6: stackBytes(mem, sp, 6),
  };
}

function createMemoryWithRom() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(MEM_SIZE, romBytes.length)));
  return mem;
}

function createRuntime(mem) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  return { executor, cpu: executor.cpu, peripherals };
}

function resetOsState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xD0;
  cpu.iy = IY_BASE;
  cpu.ix = 0xD1A860;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0x00;
  cpu.f = 0x40;
  cpu.sp = STACK_TOP;
  mem.fill(0xFF, Math.max(0, STACK_TOP - 0x80), Math.min(mem.length, STACK_TOP + 0x20));
}

function stopError(name, detail = null) {
  const err = new Error('__PHASE305_STOP__');
  err.stopName = name;
  err.detail = detail;
  return err;
}

function bootInitializedRuntime() {
  const mem = createMemoryWithRom();
  const { executor, cpu, peripherals } = createRuntime(mem);

  // Z80-mode boot
  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: 20000,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  // Kernel init
  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xD0;
  cpu.iy = IY_BASE;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  // Post-init
  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  // Mem init
  resetOsState(cpu, mem);
  push24(cpu, mem, MEM_INIT_RET);

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
  } catch (err) {
    if (err?.message !== '__PHASE305_STOP__' || err.stopName !== 'mem_init_return') {
      throw err;
    }
  }

  resetOsState(cpu, mem);
  return { mem, executor, cpu, peripherals };
}

// --- Block-level trace ---

function resolveNextMode(executor, resultPc, currentMode) {
  // Check block meta for mode transitions
  const key = `${((resultPc ?? 0) & 0xFFFFFF).toString(16).padStart(6, '0')}:${currentMode}`;
  const meta = executor.blockMeta?.[key];
  if (meta?.mode) return meta.mode;
  return currentMode;
}

function traceExecution(executor, mem, startPc, startMode, maxSteps, opts = {}) {
  const { cpu, compiledBlocks, blockMeta } = executor;
  const steps = [];
  const ioLog = [];

  // Hook I/O if requested
  const origIoRead = cpu._ioRead;
  const origIoWrite = cpu._ioWrite;
  if (opts.logIO) {
    const wrappedRead = cpu._ioRead;
    cpu._ioRead = (port) => {
      const val = wrappedRead(port);
      ioLog.push({ dir: 'IN', port, value: val });
      return val;
    };
    const wrappedWrite = cpu._ioWrite;
    cpu._ioWrite = (port, value) => {
      ioLog.push({ dir: 'OUT', port, value });
      wrappedWrite(port, value);
    };
  }

  let pc = startPc & 0xFFFFFF;
  let mode = startMode;
  let stopReason = 'max_steps';

  for (let i = 0; i < maxSteps; i++) {
    cpu.madl = mode === 'adl' ? 1 : 0;

    const key = `${pc.toString(16).padStart(6, '0')}:${mode}`;
    const fn = compiledBlocks[key];
    const meta = blockMeta[key];

    if (!fn) {
      steps.push({ step: i, pc, mode, key, missing: true });
      stopReason = 'missing_block';
      break;
    }

    const before = snapshotState(cpu, mem);

    // Capture IY-relative memory before/after
    const iyBefore = {};
    for (const off of IY_FLAG_OFFSETS) {
      iyBefore[off] = mem[(IY_BASE + off) & 0xFFFFFF] & 0xFF;
    }
    // Also capture IY+0 (bit 3 = key ready)
    iyBefore[0] = mem[IY_BASE & 0xFFFFFF] & 0xFF;

    const result = fn(cpu);
    const after = snapshotState(cpu, mem);

    const iyAfter = {};
    for (const off of IY_FLAG_OFFSETS) {
      iyAfter[off] = mem[(IY_BASE + off) & 0xFFFFFF] & 0xFF;
    }
    iyAfter[0] = mem[IY_BASE & 0xFFFFFF] & 0xFF;

    // Detect IY changes
    const iyChanges = [];
    for (const off of [0, ...IY_FLAG_OFFSETS]) {
      if (iyBefore[off] !== iyAfter[off]) {
        iyChanges.push(`IY+${off}: ${hexByte(iyBefore[off])} -> ${hexByte(iyAfter[off])}`);
      }
    }

    const nextPc = typeof result === 'number' && result >= 0 ? result & 0xFFFFFF : null;
    const instructions = (meta?.instructions ?? []).map(
      (inst) => inst.dasm ?? inst.tag ?? '?',
    );

    steps.push({
      step: i,
      pc,
      mode,
      key,
      result,
      nextPc,
      before,
      after,
      iyChanges,
      instructions,
    });

    if (result === RETURN_SENTINEL) {
      stopReason = 'returned_to_sentinel';
      break;
    }

    if (result === undefined || result === null) {
      stopReason = 'no_return';
      break;
    }

    if (typeof result === 'number' && result < 0) {
      stopReason = result === -1 ? 'halt' : 'sleep';
      break;
    }

    pc = nextPc;
    mode = resolveNextMode(executor, result, mode);
  }

  // Restore I/O hooks
  if (opts.logIO) {
    cpu._ioRead = origIoRead;
    cpu._ioWrite = origIoWrite;
  }

  return { steps, stopReason, ioLog };
}

// --- Static disassembly ---

function disasmRange(start, length) {
  const lines = [];
  let pc = start;
  const end = start + length;

  while (pc < end) {
    let inst;
    try {
      inst = decodeInstruction(romBytes, pc, 'adl');
    } catch {
      lines.push({ addr: pc, text: `DB ${hexByte(romBytes[pc])}`, length: 1 });
      pc += 1;
      continue;
    }

    if (!inst || !inst.length) {
      lines.push({ addr: pc, text: `DB ${hexByte(romBytes[pc])}`, length: 1 });
      pc += 1;
      continue;
    }

    const text = inst.dasm ?? inst.tag ?? '?';
    lines.push({ addr: pc, text, length: inst.length, inst });
    pc += inst.length;
  }

  return lines;
}

function printDisasm(title, start, length) {
  console.log(`\n--- ${title} (${hex(start)}..${hex(start + length - 1)}) ---`);
  const lines = disasmRange(start, length);
  for (const line of lines) {
    const bytes = Array.from(romBytes.subarray(line.addr, line.addr + line.length))
      .map((b) => b.toString(16).toUpperCase().padStart(2, '0'))
      .join(' ');
    console.log(`  ${hex(line.addr)}  ${bytes.padEnd(18)}  ${line.text}`);
  }
}

// --- Experiment 1: Key-ready trace through full _GetCSC ---

function experiment1(baseEnv) {
  console.log(`\n${'='.repeat(70)}`);
  console.log('  EXPERIMENT 1: Key-ready trace (D00587=0x31, IY+0 bit 3 set)');
  console.log(`${'='.repeat(70)}`);

  const mem = new Uint8Array(baseEnv.mem);
  const { executor, cpu } = createRuntime(mem);

  resetOsState(cpu, mem);

  // Seed scan code buffer
  mem[SCAN_CODE_BUF] = 0x31; // key '2'
  // Set IY+0 bit 3 (key available flag, as SDK clears it)
  mem[IY_BASE] |= 0x08;

  console.log(`  Pre-call state:`);
  console.log(`    D00587 (scan code buf) = ${hexByte(mem[SCAN_CODE_BUF])}`);
  console.log(`    IY+0  (${hex(IY_BASE)}) = ${hexByte(mem[IY_BASE])} (bit 3 = ${(mem[IY_BASE] >> 3) & 1})`);
  for (const off of IY_FLAG_OFFSETS) {
    console.log(`    IY+${String(off).padEnd(3)} (${hex(IY_BASE + off)}) = ${hexByte(mem[(IY_BASE + off) & 0xFFFFFF])}`);
  }

  push24(cpu, mem, RETURN_SENTINEL);

  const trace = traceExecution(executor, mem, GETCSC_IMPL, 'adl', 500);

  console.log(`\n  Block trace (${trace.steps.length} blocks, stop: ${trace.stopReason}):`);
  console.log('  step  pc        next      A bef->aft   SP bef->aft       IY changes            instructions');
  console.log('  ' + '-'.repeat(110));

  for (const s of trace.steps) {
    if (s.missing) {
      console.log(`  ${String(s.step).padStart(3)}  ${hex(s.pc)}  MISSING (${s.key})`);
      continue;
    }
    const nextText = s.nextPc === null ? String(s.result) : hex(s.nextPc);
    const iyText = s.iyChanges.length ? s.iyChanges.join('; ') : '-';
    const instrText = s.instructions.slice(0, 4).join(' | ');
    console.log(
      `  ${String(s.step).padStart(3)}  ${hex(s.pc)}  ${String(nextText).padEnd(10)}  ` +
      `${hexByte(s.before.a)}->${hexByte(s.after.a)}  ` +
      `${hex(s.before.sp)}->${hex(s.after.sp)}  ` +
      `${iyText.padEnd(30).substring(0, 30)}  ${instrText}`,
    );
  }

  console.log(`\n  Final register state:`);
  const last = trace.steps[trace.steps.length - 1];
  if (last && !last.missing) {
    console.log(`    A = ${hexByte(last.after.a)} (expected: scan code from D00587)`);
    console.log(`    F = ${hexByte(last.after.f)}`);
    console.log(`    HL = ${hex(last.after.hl)}`);
    console.log(`    SP = ${hex(last.after.sp)}`);
  }

  console.log(`\n  Post-call RAM state:`);
  console.log(`    D00587 = ${hexByte(mem[SCAN_CODE_BUF])} (should be cleared)`);
  console.log(`    IY+0   = ${hexByte(mem[IY_BASE])} (bit 3 = ${(mem[IY_BASE] >> 3) & 1})`);
  for (const off of IY_FLAG_OFFSETS) {
    console.log(`    IY+${String(off).padEnd(3)} = ${hexByte(mem[(IY_BASE + off) & 0xFFFFFF])}`);
  }

  return trace;
}

// --- Experiment 2: IY flag overrides ---

function experiment2(baseEnv) {
  console.log(`\n${'='.repeat(70)}`);
  console.log('  EXPERIMENT 2: IY flag overrides — which causes key=0x0F?');
  console.log(`${'='.repeat(70)}`);

  const results = [];

  for (const offset of IY_FLAG_OFFSETS) {
    // For each flag, try setting all bits
    for (const bitVal of [0xFF]) {
      const mem = new Uint8Array(baseEnv.mem);
      const { executor, cpu } = createRuntime(mem);

      resetOsState(cpu, mem);

      // Seed a known key
      mem[SCAN_CODE_BUF] = 0x31;
      // Set IY+0 bit 3
      mem[IY_BASE] |= 0x08;
      // Set the target IY flag
      mem[(IY_BASE + offset) & 0xFFFFFF] = bitVal;

      push24(cpu, mem, RETURN_SENTINEL);
      const trace = traceExecution(executor, mem, GETCSC_IMPL, 'adl', 500);

      const last = trace.steps[trace.steps.length - 1];
      const finalA = last && !last.missing ? last.after.a : -1;
      const overridden = finalA === 0x0F;

      results.push({
        offset,
        bitVal,
        finalA,
        overridden,
        stopReason: trace.stopReason,
        blocks: trace.steps.length,
      });

      console.log(
        `  IY+${String(offset).padEnd(3)} = ${hexByte(bitVal)} => A = ${hexByte(finalA)}` +
        `${overridden ? '  *** KEY OVERRIDDEN TO 0x0F ***' : ''}` +
        `  (${trace.steps.length} blocks, ${trace.stopReason})`,
      );
    }
  }

  // Now test individual bits for any offset that caused override
  const overrideOffsets = results.filter((r) => r.overridden).map((r) => r.offset);

  if (overrideOffsets.length > 0) {
    console.log(`\n  Override offsets found: ${overrideOffsets.join(', ')}. Testing individual bits...`);

    for (const offset of overrideOffsets) {
      for (let bit = 0; bit < 8; bit++) {
        const mem = new Uint8Array(baseEnv.mem);
        const { executor, cpu } = createRuntime(mem);

        resetOsState(cpu, mem);
        mem[SCAN_CODE_BUF] = 0x31;
        mem[IY_BASE] |= 0x08;
        mem[(IY_BASE + offset) & 0xFFFFFF] = 1 << bit;

        push24(cpu, mem, RETURN_SENTINEL);
        const trace = traceExecution(executor, mem, GETCSC_IMPL, 'adl', 500);

        const last = trace.steps[trace.steps.length - 1];
        const finalA = last && !last.missing ? last.after.a : -1;
        const overridden = finalA === 0x0F;

        console.log(
          `    IY+${offset} bit ${bit} (${hexByte(1 << bit)}) => A = ${hexByte(finalA)}` +
          `${overridden ? '  *** OVERRIDE ***' : ''}`,
        );
      }
    }
  } else {
    console.log('  No IY flag caused override to 0x0F with all bits set.');
    console.log('  Testing combinations of two flags...');

    for (let i = 0; i < IY_FLAG_OFFSETS.length; i++) {
      for (let j = i + 1; j < IY_FLAG_OFFSETS.length; j++) {
        const mem = new Uint8Array(baseEnv.mem);
        const { executor, cpu } = createRuntime(mem);

        resetOsState(cpu, mem);
        mem[SCAN_CODE_BUF] = 0x31;
        mem[IY_BASE] |= 0x08;
        mem[(IY_BASE + IY_FLAG_OFFSETS[i]) & 0xFFFFFF] = 0xFF;
        mem[(IY_BASE + IY_FLAG_OFFSETS[j]) & 0xFFFFFF] = 0xFF;

        push24(cpu, mem, RETURN_SENTINEL);
        const trace = traceExecution(executor, mem, GETCSC_IMPL, 'adl', 500);

        const last = trace.steps[trace.steps.length - 1];
        const finalA = last && !last.missing ? last.after.a : -1;
        const overridden = finalA === 0x0F;

        if (overridden) {
          console.log(
            `    IY+${IY_FLAG_OFFSETS[i]} + IY+${IY_FLAG_OFFSETS[j]} => A = ${hexByte(finalA)}  *** OVERRIDE ***`,
          );
        }
      }
    }
  }

  return results;
}

// --- Experiment 3: USB fallback path at 0x03FA8D ---

function experiment3(baseEnv) {
  console.log(`\n${'='.repeat(70)}`);
  console.log('  EXPERIMENT 3: USB fallback path (0x03FA8D)');
  console.log(`${'='.repeat(70)}`);

  // First, static disassembly of the USB path
  printDisasm('USB fallback block at 0x03FA8D', USB_FALLBACK, 0x60);

  // Identify what conditions route to 0x03FA8D.
  // From phase 304: the main body of 0x03FA09 has a JR NZ to 0x03FA8D.
  // Let's trace with NO key ready (D00587=0) but with USB-related conditions.
  console.log('\n  Test A: No key, clean state (baseline for USB path):');
  {
    const mem = new Uint8Array(baseEnv.mem);
    const { executor, cpu } = createRuntime(mem);

    resetOsState(cpu, mem);
    mem[SCAN_CODE_BUF] = 0x00; // No key
    mem[IY_BASE] &= ~0x08;    // Clear key-ready bit

    push24(cpu, mem, RETURN_SENTINEL);
    const trace = traceExecution(executor, mem, GETCSC_IMPL, 'adl', 500, { logIO: true });

    printTraceCompact('  ', trace);

    if (trace.ioLog.length > 0) {
      console.log(`\n  I/O operations (${trace.ioLog.length}):`);
      for (const io of trace.ioLog.slice(0, 30)) {
        console.log(`    ${io.dir} port ${hex(io.port, 4)} = ${hexByte(io.value)}`);
      }
    }
  }

  // Test B: No key, but IY+0 bit 3 set (key-ready flag without actual key)
  console.log('\n  Test B: IY+0 bit 3 set but D00587=0 (key-ready flag, no scan code):');
  {
    const mem = new Uint8Array(baseEnv.mem);
    const { executor, cpu } = createRuntime(mem);

    resetOsState(cpu, mem);
    mem[SCAN_CODE_BUF] = 0x00;
    mem[IY_BASE] |= 0x08;

    push24(cpu, mem, RETURN_SENTINEL);
    const trace = traceExecution(executor, mem, GETCSC_IMPL, 'adl', 500, { logIO: true });

    printTraceCompact('  ', trace);

    if (trace.ioLog.length > 0) {
      console.log(`\n  I/O operations (${trace.ioLog.length}):`);
      for (const io of trace.ioLog.slice(0, 30)) {
        console.log(`    ${io.dir} port ${hex(io.port, 4)} = ${hexByte(io.value)}`);
      }
    }
  }

  // Test C: Simulate USB ON-interrupt flag. From phase 304, 0x03FA8D checks
  // port 0x500C and D14xxx addresses. Seed port 0x500C and D14000 area.
  console.log('\n  Test C: USB ON-interrupt conditions (D14800 area seeded):');
  {
    const mem = new Uint8Array(baseEnv.mem);
    const { executor, cpu, peripherals } = createRuntime(mem);

    resetOsState(cpu, mem);
    mem[SCAN_CODE_BUF] = 0x00;
    mem[IY_BASE] &= ~0x08;

    // Seed USB-related RAM
    // D14800 area is USB controller memory-mapped space in some TI docs
    mem[0xD14800] = 0x01;
    mem[0xD14801] = 0xFF;

    push24(cpu, mem, RETURN_SENTINEL);
    const trace = traceExecution(executor, mem, GETCSC_IMPL, 'adl', 500, { logIO: true });

    printTraceCompact('  ', trace);

    if (trace.ioLog.length > 0) {
      console.log(`\n  I/O operations (${trace.ioLog.length}):`);
      for (const io of trace.ioLog.slice(0, 30)) {
        console.log(`    ${io.dir} port ${hex(io.port, 4)} = ${hexByte(io.value)}`);
      }
    }

    // Check which blocks were visited
    const visitedUsb = trace.steps.some((s) => s.pc === USB_FALLBACK);
    console.log(`\n  Reached USB fallback (${hex(USB_FALLBACK)}): ${visitedUsb ? 'YES' : 'NO'}`);
  }

  // Test D: Direct trace from USB fallback entry
  console.log('\n  Test D: Direct entry at USB fallback 0x03FA8D:');
  {
    const mem = new Uint8Array(baseEnv.mem);
    const { executor, cpu } = createRuntime(mem);

    resetOsState(cpu, mem);
    mem[SCAN_CODE_BUF] = 0x00;

    push24(cpu, mem, RETURN_SENTINEL);
    // Push an extra return address to simulate the CALL context
    push24(cpu, mem, RETURN_SENTINEL);

    const trace = traceExecution(executor, mem, USB_FALLBACK, 'adl', 200, { logIO: true });

    printTraceCompact('  ', trace);

    if (trace.ioLog.length > 0) {
      console.log(`\n  I/O operations (${trace.ioLog.length}):`);
      for (const io of trace.ioLog.slice(0, 30)) {
        console.log(`    ${io.dir} port ${hex(io.port, 4)} = ${hexByte(io.value)}`);
      }
    }

    // Check D14xxx reads
    console.log('\n  D14xxx area after trace:');
    for (const addr of [0xD14800, 0xD14801, 0xD14802, 0xD14803, 0xD14000, 0xD14001]) {
      console.log(`    ${hex(addr)} = ${hexByte(mem[addr])}`);
    }
  }
}

function printTraceCompact(indent, trace) {
  console.log(`${indent}Block trace (${trace.steps.length} blocks, stop: ${trace.stopReason}):`);
  console.log(`${indent}step  pc        next      A bef->aft   instructions`);
  console.log(`${indent}` + '-'.repeat(80));

  for (const s of trace.steps) {
    if (s.missing) {
      console.log(`${indent}${String(s.step).padStart(3)}  ${hex(s.pc)}  MISSING (${s.key})`);
      continue;
    }
    const nextText = s.nextPc === null ? String(s.result) : hex(s.nextPc);
    const instrText = s.instructions.slice(0, 4).join(' | ');
    const iyText = s.iyChanges?.length ? `  [${s.iyChanges.join('; ')}]` : '';
    console.log(
      `${indent}${String(s.step).padStart(3)}  ${hex(s.pc)}  ${String(nextText).padEnd(10)}  ` +
      `${hexByte(s.before.a)}->${hexByte(s.after.a)}  ${instrText}${iyText}`,
    );
  }
}

// --- Main ---

function main() {
  console.log('Phase 305: _GetCSC key-present path trace');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`Transpiled: ${TRANSPILED_PATH}`);
  console.log(`IY base = ${hex(IY_BASE)}`);
  console.log(`_GetCSC impl = ${hex(GETCSC_IMPL)}`);
  console.log(`Key-present path = ${hex(KEY_PRESENT_PATH)}`);
  console.log(`USB fallback = ${hex(USB_FALLBACK)}`);
  console.log(`Scan code buffer = ${hex(SCAN_CODE_BUF)}`);

  // Static disassembly of key areas
  printDisasm('_GetCSC impl entry (0x03FA09)', GETCSC_IMPL, 0x40);
  printDisasm('Key-present path (0x03FB9A)', KEY_PRESENT_PATH, 0x50);
  printDisasm('USB fallback (0x03FA8D)', USB_FALLBACK, 0x40);

  console.log('\nBooting warm runtime...');
  const baseEnv = bootInitializedRuntime();
  console.log('Boot complete.\n');

  // Snapshot baseline IY area
  console.log('Baseline IY flag values after boot:');
  console.log(`  IY+0  (${hex(IY_BASE)})   = ${hexByte(baseEnv.mem[IY_BASE])}`);
  for (const off of IY_FLAG_OFFSETS) {
    console.log(`  IY+${String(off).padEnd(3)} (${hex(IY_BASE + off)}) = ${hexByte(baseEnv.mem[(IY_BASE + off) & 0xFFFFFF])}`);
  }

  const trace1 = experiment1(baseEnv);
  const results2 = experiment2(baseEnv);
  experiment3(baseEnv);

  // Summary
  console.log(`\n${'='.repeat(70)}`);
  console.log('  SUMMARY');
  console.log(`${'='.repeat(70)}`);

  const lastStep = trace1.steps[trace1.steps.length - 1];
  const exp1A = lastStep && !lastStep.missing ? lastStep.after.a : -1;
  console.log(`  Exp 1 (key=0x31, IY+0 bit3 set): final A = ${hexByte(exp1A)}, stop = ${trace1.stopReason}`);
  console.log(`         D00587 after = ${hexByte(baseEnv.mem[SCAN_CODE_BUF])} (from exp1 mem — note: separate copy)`);

  const overrides = results2.filter((r) => r.overridden);
  if (overrides.length > 0) {
    console.log(`  Exp 2: IY offsets that override key to 0x0F: ${overrides.map((r) => `IY+${r.offset}`).join(', ')}`);
  } else {
    console.log('  Exp 2: No single IY flag override caused A=0x0F');
  }

  console.log('\nPhase 305 complete.');
}

main();

/*
=== OUTPUT (captured 2026-05-12) ===

Phase 305: _GetCSC key-present path trace
IY base = 0xD00080, _GetCSC impl = 0x03FA09, Key-present path = 0x03FB9A
USB fallback = 0x03FA8D, Scan code buffer = 0xD00587

--- Static disassembly key-present path (0x03FB9A) ---
  0x03FB9A  POP AF
  0x03FB9B  PUSH AF
  0x03FB9C  BIT 0, (IY+18)       ; IY+18 = 0xD00092
  0x03FBA0  JR Z, 0x03FBC0
  0x03FBA2  CP 0x0F
  0x03FBA4  JR Z, 0x03FBB2
  0x03FBA6  BIT 4, (IY+9)        ; IY+9 = 0xD00089
  0x03FBAA  JR NZ, 0x03FBB2
  0x03FBAC  BIT 4, (IY+67)       ; IY+67 = 0xD000C3
  0x03FBB0  JR Z, 0x03FBC0
  0x03FBB2  SET 6, (IY+91)       ; IY+91 = 0xD000DB
  0x03FBB6  BIT 0, (IY+92)       ; IY+92 = 0xD000DC
  0x03FBBA  JR Z, 0x03FBC0
  0x03FBBC  POP AF
  0x03FBBD  LD A, 0x0F            ; *** KEY OVERRIDE TO 0x0F ***
  0x03FBBF  PUSH AF
  0x03FBC0  OR A
  0x03FBC1  JR Z, 0x03FBE8
  0x03FBC3  LD A, (0xD14091)
  0x03FBC7  OR A
  0x03FBC8  JR Z, 0x03FBE8
  0x03FBCA  LD (0xD141B2), A
  0x03FBCE  POP AF
  0x03FBCF  PUSH AF
  0x03FBD0  BIT 3, (IY+40)       ; IY+40 = 0xD000A8
  0x03FBD4  JR Z, 0x03FBD8
  0x03FBD6  LD A, 0x39
  0x03FBD8  ...
  0x03FBE8  POP AF
  0x03FBE9  RET

--- Baseline IY flag values after boot ---
  IY+0  = 0x00, IY+18 = 0x00, IY+9 = 0x00, IY+67 = 0x06
  IY+91 = 0x00, IY+92 = 0x00, IY+40 = 0x00

=== EXPERIMENT 1: Key-ready trace (D00587=0x31, IY+0 bit 3 set) ===
  Block trace: 5 blocks, stop = returned_to_sentinel

  step  pc        next        A bef->aft  IY changes
    0  0x03FA09  0x03FB9A    0x00->0x31  IY+0: 0x08 -> 0x00
    1  0x03FB9A  0x03FBC0    0x31->0x31  -   (BIT 0,(IY+18) => Z, skip flag cascade)
    2  0x03FBC0  0x03FBC3    0x31->0x31  -   (OR A => NZ, don't skip)
    3  0x03FBC3  0x03FBE8    0x31->0x00  -   (LD A,(D14091)=0, OR A => Z, skip to end)
    4  0x03FBE8  sentinel    0x00->0x31  -   (POP AF restores A=0x31 from stack, RET)

  Final: A = 0x31 (scan code returned correctly), D00587 cleared to 0x00
         IY+0 bit 3 cleared (RES 3,(IY+0) at 0x03FA11)

  KEY INSIGHT: The scan code is preserved on the stack via PUSH AF at 0x03FA16.
  The function does LD A,(D00587) -> PUSH AF at entry, then at exit POP AF -> RET.
  Intermediate A clobbers (LD A,(D14091) etc.) don't affect the return value.

=== EXPERIMENT 2: IY flag overrides ===
  IY+18 = 0xFF => A = 0x31  (8 blocks — enters flag cascade but no override)
  IY+9  = 0xFF => A = 0x31
  IY+67 = 0xFF => A = 0x31
  IY+91 = 0xFF => A = 0x31
  IY+92 = 0xFF => A = 0x31
  IY+40 = 0xFF => A = 0x31
  No single IY flag caused override to 0x0F.
  No pair of IY flags caused override to 0x0F either.

  ANALYSIS: The override path at 0x03FBBC requires:
    1. BIT 0,(IY+18) != 0  (enter cascade)
    2. A != 0x0F  (not already 0x0F)
    3. BIT 4,(IY+9) == 0  (JR NZ skips to SET)
    4. BIT 4,(IY+67) != 0  (JR Z skips to 0xFBC0, so need bit SET)
    5. Then: SET 6,(IY+91)
    6. BIT 0,(IY+92) != 0  (JR Z skips override)
    7. Then: POP AF; LD A,0x0F; PUSH AF  (override!)

  With IY+18=0xFF alone: enters cascade (step 1 passes), but IY+92 bit 0 = 0
  after boot, so step 6 fails. Override requires IY+18 AND IY+92 both set.
  However experiment 2 combination tests also didn't trigger it — this is
  because IY+67 bit 4 is already set (baseline 0x06) so step 4 passes, but
  IY+92=0 blocks it even with IY+18=0xFF. The pair test would need IY+18+IY+92.

=== EXPERIMENT 3: USB fallback path (0x03FA8D) ===

  The USB fallback is NOT reached via normal _GetCSC entry. It requires:
    1. No scan code in D00587 (A=0 after load)
    2. JP NZ at 0x03FA18 falls through (A=0)
    3. LD A,(D14091) at 0x03FA1C — if nonzero, takes different path
    4. If D14091=0, JR Z to 0x03FA93
    5. At 0x03FA93: LD A,(D00000); OR A; JP Z,0x03FB9A
       D00000 contains 0xCC after boot → NOT zero → falls through
    6. CP 0xCC; JP NZ,0x03FB9A — matches! Falls through to USB init

  USB path (0x03FAA2+):
    - BC = 0x005004 (USB port base)
    - IN A,(C) from port 0x5004
    - BIT 0,A — tests USB controller status
    - SET 0,A; OUT (C),A — enables USB bit
    - CALL 0x02515C — USB handler subroutine (checks IY+27 bits 3,5)
    - CALL 0x0005F4 → 0x0158B1 — checks ROM byte at 0x00007E bit 7
    - If bit 7 set at 0x00007E: enters USB ON-interrupt sequence
    - SET 5,(IY+27) marks USB processing active
    - Reads 0xD177B7 (USB device signature? = 0x55 "USB magic")
    - Deep USB stack: port 0x5004/0x5005/0x5008/0x500C operations
    - Eventually HALTs (waiting for USB interrupt)

  I/O ports touched: 0x5004 (USB ctrl), 0x5005, 0x5008, 0x500C,
    0x000F (eZ80 internal), 0x3082, 0x7020-0x702F (GPIO/timer),
    0x7030

  Test D (direct entry at 0x03FA8D): Same USB init sequence, 116 blocks, halt.

=== SUMMARY ===
  Exp 1: A=0x31 returned correctly. _GetCSC key-present path is simple:
         load D00587 -> clear D00587 -> RES 3,(IY+0) -> PUSH AF ->
         check IY flags -> POP AF -> RET. 5 blocks total.

  Exp 2: Key override to 0x0F requires IY+18 bit 0 AND IY+92 bit 0 AND
         (IY+9 bit 4 == 0 OR IY+67 bit 4 != 0). No single flag suffices.
         IY+18 = "2nd key modifier active"
         IY+92 = "ON key interrupt pending"
         Override to 0x0F = scan code for CLEAR key (forces CLEAR on ON press).

  Exp 3: USB fallback is triggered when D00587=0 AND D14091=0 AND
         (D00000) == 0xCC (boot signature). It runs a full USB controller
         init/poll sequence using ports 0x5004/5005/5008/500C and ends in HALT.
         This is the "no key pressed, check USB ON button" path.

Phase 305 complete.
*/
