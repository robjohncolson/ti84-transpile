#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const RAW_BLOCKS = romModule.PRELIFTED_BLOCKS;
const BLOCKS = Array.isArray(RAW_BLOCKS)
  ? Object.fromEntries(RAW_BLOCKS.filter((block) => block?.id).map((block) => [block.id, block]))
  : RAW_BLOCKS;

const MEM_SIZE = 0x1000000;
const ROM_LIMIT = romBytes.length;
const ROM_MASK = 0x3fffff;
const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xe00000;
const VRAM_BASE = 0xd40000;
const VRAM_BYTE_SIZE = 320 * 240 * 2;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const STACK_RESET_TOP = 0xd1a87e;

const STAGE_2_ENTRY = 0x0a3301;
const STAGE_2_MODE = 'adl';
const STAGE_MAX_LOOP_ITERATIONS = 500;
const TRACE_MAX_STEPS = 500;

const FIXED_IX = 0xd1a860;
const FIXED_IY = 0xd00080;
const FIXED_SP = STACK_RESET_TOP - 12;
const FIXED_MBASE = 0xd0;
const HANDOFF_EXPECTED_MISSING = 0x58c35b;

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function blockKey(pc, mode) {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function lastOf(items) {
  return items.length === 0 ? null : items[items.length - 1];
}

function clearVram(mem) {
  mem.fill(0xaa, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function read24(mem, addr) {
  return mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16);
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  const kernel = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = FIXED_MBASE;
  cpu._iy = FIXED_IY;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  const post = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return { boot, kernel, post };
}

function restoreStageState(cpu, snapshot, mem) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu._iy = FIXED_IY;
  cpu.f = 0x40;
  cpu._ix = FIXED_IX;
  cpu.sp = FIXED_SP;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
  cpu.mbase = FIXED_MBASE;
  cpu.madl = 1;
}

function classifyAddress(pc, mode, executor) {
  const key = blockKey(pc, mode);
  return {
    key,
    pc: pc & 0xffffff,
    mode,
    inRom: pc >= 0 && pc < ROM_LIMIT,
    lifted: !!executor.compiledBlocks[key],
  };
}

function safeDecode(pc, mode) {
  if (pc < 0 || pc >= ROM_LIMIT) {
    return null;
  }

  try {
    return decodeInstruction(romBytes, pc, mode);
  } catch {
    return null;
  }
}

function decodeLabel(pc, mode) {
  const decoded = safeDecode(pc, mode);
  if (!decoded) {
    return 'decode failed';
  }

  return decoded.dasm ?? decoded.tag ?? 'decode failed';
}

function callReturnTarget(meta) {
  const exits = meta?.exits ?? [];
  const callReturn = exits.find((exit) => exit.type === 'call-return');
  if (callReturn) {
    return callReturn.target & 0xffffff;
  }

  const lastInstruction = lastOf(meta?.instructions ?? []);
  if (typeof lastInstruction?.fallthrough === 'number') {
    return lastInstruction.fallthrough & 0xffffff;
  }

  return null;
}

function fallthroughTarget(meta) {
  const exits = meta?.exits ?? [];
  const fallthrough = exits.find((exit) => exit.type === 'fallthrough');
  if (fallthrough) {
    return fallthrough.target & 0xffffff;
  }

  const lastInstruction = lastOf(meta?.instructions ?? []);
  if (typeof lastInstruction?.fallthrough === 'number') {
    return lastInstruction.fallthrough & 0xffffff;
  }

  return null;
}

function analyzeTransfer(meta, nextPc, callStack) {
  const lastInstruction = lastOf(meta?.instructions ?? []);
  const fallthrough = fallthroughTarget(meta);
  const base = {
    kind: 'fallthrough',
    interesting: false,
    expectedReturn: null,
    text: `fallthrough -> ${hex(nextPc)}`,
  };

  if (!lastInstruction) {
    return base;
  }

  if (lastInstruction.tag === 'call' || lastInstruction.tag === 'call-conditional' || lastInstruction.tag === 'rst') {
    const returnTarget = callReturnTarget(meta);
    const callTarget = typeof lastInstruction.target === 'number'
      ? (lastInstruction.target & 0xffffff)
      : nextPc;

    if (nextPc === callTarget && returnTarget !== null) {
      callStack.push(returnTarget);
      return {
        kind: 'call',
        interesting: true,
        expectedReturn: returnTarget,
        text: `${lastInstruction.dasm} -> ${hex(nextPc)} ret=${hex(returnTarget)}`,
      };
    }

    return {
      kind: 'call-fallthrough',
      interesting: true,
      expectedReturn: null,
      text: `${lastInstruction.dasm} not taken -> ${hex(nextPc)}`,
    };
  }

  if (
    lastInstruction.tag === 'ret'
    || lastInstruction.tag === 'ret-conditional'
    || lastInstruction.tag === 'reti'
    || lastInstruction.tag === 'retn'
  ) {
    if (fallthrough !== null && nextPc === fallthrough) {
      return {
        kind: 'return-fallthrough',
        interesting: true,
        expectedReturn: null,
        text: `${lastInstruction.dasm} not taken -> ${hex(nextPc)}`,
      };
    }

    const expectedReturn = callStack.length > 0 ? callStack.pop() : null;
    return {
      kind: 'return',
      interesting: true,
      expectedReturn,
      text: `${lastInstruction.dasm} -> ${hex(nextPc)} expected=${expectedReturn === null ? 'n/a' : hex(expectedReturn)}`,
    };
  }

  if (
    lastInstruction.tag === 'jp'
    || lastInstruction.tag === 'jp-conditional'
    || lastInstruction.tag === 'jp-indirect'
    || lastInstruction.tag === 'jr'
    || lastInstruction.tag === 'jr-conditional'
    || lastInstruction.tag === 'djnz'
  ) {
    const taken = fallthrough === null || nextPc !== fallthrough;
    return {
      kind: 'branch',
      interesting: true,
      expectedReturn: null,
      text: taken
        ? `${lastInstruction.dasm} -> ${hex(nextPc)}`
        : `${lastInstruction.dasm} fallthrough -> ${hex(nextPc)}`,
    };
  }

  return base;
}

function formatNextTarget(entry) {
  const bits = [`${entry.next.lifted ? 'lifted' : 'missing'}/${entry.next.inRom ? 'rom' : 'out-of-rom'}`];

  if (entry.masked && entry.next.pc !== entry.masked.pc) {
    bits.push(`masked=${hex(entry.masked.pc)} ${entry.masked.lifted ? 'lifted' : 'missing'}/${entry.masked.inRom ? 'rom' : 'out-of-rom'}`);
  }

  return bits.join(' ');
}

function uniqueVisited(trace) {
  const seen = new Set();
  const ordered = [];

  for (const entry of trace) {
    if (seen.has(entry.pc)) {
      continue;
    }

    seen.add(entry.pc);
    ordered.push(entry.pc);
  }

  return ordered;
}

function suggestSeeds(trace) {
  const lastEntry = lastOf(trace);

  if (!lastEntry) {
    return [];
  }

  if (lastEntry.transfer.kind === 'return' && lastEntry.transfer.expectedReturn === null) {
    return [];
  }

  const suggestions = [];
  const seen = new Set();

  function maybeAdd(address, mode, reason) {
    const normalized = address & 0xffffff;
    if (normalized < 0 || normalized >= ROM_LIMIT) {
      return;
    }

    const key = blockKey(normalized, mode);
    if (seen.has(key) || lastEntry.executor.compiledBlocks[key]) {
      return;
    }

    seen.add(key);
    suggestions.push({ address: normalized, mode, reason });
  }

  if (lastEntry.next.inRom && !lastEntry.next.lifted) {
    maybeAdd(lastEntry.next.pc, lastEntry.next.mode, 'direct missing target');
  }

  if (lastEntry.masked && !lastEntry.masked.lifted) {
    maybeAdd(lastEntry.masked.pc, lastEntry.masked.mode, `masked in-ROM alias of ${hex(lastEntry.next.pc)}`);
  }

  return suggestions;
}

function traceStage2(executor, cpu, mem, cpuSnapshot, ramSnapshot) {
  mem.set(ramSnapshot, RAM_SNAPSHOT_START);
  clearVram(mem);
  restoreStageState(cpu, cpuSnapshot, mem);

  const stackSentinel = read24(mem, FIXED_SP);
  const trace = [];
  const callStack = [];
  let pc = STAGE_2_ENTRY;
  let mode = STAGE_2_MODE;
  let finalResult = null;
  let missing = null;

  for (let step = 1; step <= TRACE_MAX_STEPS; step += 1) {
    const key = blockKey(pc, mode);
    const meta = executor.blockMeta[key] ?? null;
    const result = executor.runFrom(pc, mode, {
      maxSteps: 1,
      maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS,
    });

    if (result.steps === 0) {
      missing = {
        step,
        pc: pc & 0xffffff,
        mode,
        key,
        termination: result.termination,
      };
      finalResult = result;
      break;
    }

    const lastInstruction = lastOf(meta?.instructions ?? []);
    const nextPc = result.lastPc & 0xffffff;
    const nextMode = result.lastMode ?? mode;
    const transfer = analyzeTransfer(meta, nextPc, callStack);
    const next = classifyAddress(nextPc, nextMode, executor);
    const maskedPc = nextPc & ROM_MASK;
    const masked = nextPc === maskedPc
      ? null
      : classifyAddress(maskedPc, nextMode, executor);

    trace.push({
      step,
      pc: pc & 0xffffff,
      mode,
      firstInstruction: meta?.instructions?.[0]?.dasm ?? decodeLabel(pc, mode),
      lastInstruction: lastInstruction?.dasm ?? 'n/a',
      next,
      masked,
      transfer,
      executor,
    });

    pc = nextPc;
    mode = nextMode;
    finalResult = result;

    if (result.termination !== 'max_steps') {
      break;
    }
  }

  return {
    trace,
    missing,
    finalResult,
    stackSentinel,
  };
}

function printTrace(traceReport) {
  const trace = traceReport.trace;

  console.log('Trace:');
  for (const entry of trace) {
    console.log(
      `  ${String(entry.step).padStart(3)} ${hex(entry.pc)} ${entry.firstInstruction} | ${entry.lastInstruction} | ${entry.transfer.text} | next=${hex(entry.next.pc)} ${formatNextTarget(entry)}`,
    );
  }

  if (traceReport.missing) {
    console.log(
      `  ${String(traceReport.missing.step).padStart(3)} ${hex(traceReport.missing.pc)} missing block confirmed (${traceReport.missing.key}, ${traceReport.missing.termination})`,
    );
  }
}

function printSummary(traceReport) {
  const trace = traceReport.trace;
  const lastEntry = lastOf(trace);
  const observedTarget = lastEntry ? lastEntry.next.pc : null;
  const uniqueBlocks = uniqueVisited(trace);
  const seedSuggestions = suggestSeeds(trace);

  console.log('');
  console.log('Summary:');
  console.log(`  steps executed: ${trace.length}`);
  console.log(`  top-level stack sentinel @ ${hex(FIXED_SP)} = ${hex(traceReport.stackSentinel)}`);
  console.log(`  unique visited blocks (${uniqueBlocks.length}): ${uniqueBlocks.map((pc) => hex(pc)).join(', ')}`);

  if (observedTarget !== null) {
    console.log(`  observed failure target: ${hex(observedTarget)}`);
    console.log(`  handoff target ${hex(HANDOFF_EXPECTED_MISSING)} reproduced: ${observedTarget === HANDOFF_EXPECTED_MISSING ? 'yes' : 'no'}`);
  }

  if (lastEntry) {
    console.log(`  last executed block: ${hex(lastEntry.pc)} -> ${hex(lastEntry.next.pc)} via ${lastEntry.lastInstruction}`);
  }

  if (lastEntry && lastEntry.transfer.kind === 'return' && lastEntry.transfer.expectedReturn === null) {
    console.log('  conclusion: stage 2 unwinds through a top-level return into the stack sentinel, so this path is not blocked by a missing lifted ROM block.');
  } else if (lastEntry && !lastEntry.next.lifted && lastEntry.next.inRom) {
    console.log('  conclusion: stage 2 reaches an untranslated in-ROM target.');
  } else if (lastEntry && !lastEntry.next.lifted) {
    console.log('  conclusion: stage 2 leaves the ROM window before the executor can find a translated block.');
  }

  console.log('');
  console.log('Taken transfers:');
  for (const entry of trace) {
    if (!entry.transfer.interesting) {
      continue;
    }

    console.log(`  step ${String(entry.step).padStart(3)} ${hex(entry.pc)} ${entry.transfer.text}`);
  }

  console.log('');
  console.log('Reachability:');
  for (const entry of trace) {
    const parts = [`${hex(entry.next.pc)} => ${entry.next.lifted ? 'lifted' : 'missing'} (${entry.next.inRom ? 'ROM' : 'out-of-ROM'})`];

    if (entry.masked) {
      parts.push(`${hex(entry.masked.pc)} => ${entry.masked.lifted ? 'lifted' : 'missing'} (${entry.masked.inRom ? 'ROM' : 'out-of-ROM'})`);
      parts.push(`raw=${decodeLabel(entry.masked.pc, entry.masked.mode)}`);
    } else if (entry.next.inRom && !entry.next.lifted) {
      parts.push(`raw=${decodeLabel(entry.next.pc, entry.next.mode)}`);
    }

    console.log(`  step ${String(entry.step).padStart(3)} ${parts.join(' | ')}`);
  }

  console.log('');
  console.log('Seed candidates:');
  if (seedSuggestions.length === 0) {
    console.log('  none');
    console.log('  reason: the final transfer is a top-level return into the 0xFFFFFF sentinel, so adding ROM seeds will not extend this exact Phase 99D stage-2 path.');
  } else {
    for (const suggestion of seedSuggestions) {
      console.log(`  ${hex(suggestion.address)}:${suggestion.mode}  ${suggestion.reason}`);
    }
  }
}

async function main() {
  console.log('=== Phase 189 - Status Dots Branch Trace ===');
  console.log(`ROM size: ${hex(ROM_LIMIT)}`);
  console.log(`Entry: ${hex(STAGE_2_ENTRY)}:${STAGE_2_MODE}`);
  console.log(`Expected handoff missing target: ${hex(HANDOFF_EXPECTED_MISSING)}`);
  console.log(`Stage state: IX=${hex(FIXED_IX)} IY=${hex(FIXED_IY)} SP=${hex(FIXED_SP)} MBASE=${hex(FIXED_MBASE, 2)} MADL=1`);
  console.log('');

  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, ROM_LIMIT)));

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const boot = coldBoot(executor, cpu, mem);
  console.log(
    `Boot: boot=${boot.boot.steps}/${boot.boot.termination} kernel=${boot.kernel.steps}/${boot.kernel.termination} post=${boot.post.steps}/${boot.post.termination}`,
  );

  const ramSnapshot = new Uint8Array(mem.slice(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END));
  const cpuSnapshot = snapshotCpu(cpu);
  const traceReport = traceStage2(executor, cpu, mem, cpuSnapshot, ramSnapshot);

  console.log('');
  printTrace(traceReport);
  printSummary(traceReport);
}

try {
  await main();
} catch (error) {
  console.error(error?.stack ?? error?.message ?? String(error));
  process.exitCode = 1;
}
