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

const MEM_SIZE = 0x1000000;
const ROM_LIMIT = 0x400000;
const RAM_SNAPSHOT_START = 0x400000;
const RAM_SNAPSHOT_END = 0xE00000;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const STACK_RESET_TOP = 0xD1A87E;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

const VRAM_BASE = 0xD40000;
const VRAM_BYTE_SIZE = 320 * 240 * 2;
const TRACE_TAIL_COUNT = 20;
const STACK_DUMP_BYTES = 12;
const STAGE_MAX_LOOP_ITERATIONS = 500;

const MODE_BUF_START = 0xD020A6;
const MODE_BUF_TEXT = 'Normal Float Radian       ';

const POINTER_SLOTS = [
  { addr: 0xD0231A, label: 'dispatch table head' },
  { addr: 0xD0231D, label: 'dispatch table tail' },
  { addr: 0xD007E0, label: 'menu mode state' },
  { addr: 0xD007EB, label: 'key handler pointer' },
  { addr: 0xD02AD7, label: 'callback pointer' },
];

const STAGES = [
  { number: 1, label: 'status bar', entry: 0x0A2B72, maxSteps: 30000 },
  { number: 2, label: 'status dots', entry: 0x0A3301, maxSteps: 30000 },
  {
    number: 3,
    label: 'home row',
    entry: 0x0A29EC,
    maxSteps: 50000,
    beforeRun(mem) {
      seedModeBuffer(mem);
    },
  },
  { number: 4, label: 'history', entry: 0x0A2854, maxSteps: 50000 },
];

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join(' ');
}

function read24(mem, addr) {
  return mem[addr] | (mem[addr + 1] << 8) | (mem[addr + 2] << 16);
}

function clearVram(mem) {
  mem.fill(0xAA, VRAM_BASE, VRAM_BASE + VRAM_BYTE_SIZE);
}

function seedModeBuffer(mem) {
  for (let index = 0; index < MODE_BUF_TEXT.length; index += 1) {
    mem[MODE_BUF_START + index] = MODE_BUF_TEXT.charCodeAt(index);
  }
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });
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
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function snapshotRegisters(cpu, pc) {
  return {
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    bc: cpu.bc & 0xFFFFFF,
    de: cpu.de & 0xFFFFFF,
    hl: cpu.hl & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    ix: cpu.ix & 0xFFFFFF,
    iy: cpu.iy & 0xFFFFFF,
    pc: pc & 0xFFFFFF,
  };
}

function formatRegisters(registers) {
  return [
    `A=${hex(registers.a, 2)}`,
    `F=${hex(registers.f, 2)}`,
    `BC=${hex(registers.bc)}`,
    `DE=${hex(registers.de)}`,
    `HL=${hex(registers.hl)}`,
    `SP=${hex(registers.sp)}`,
    `IX=${hex(registers.ix)}`,
    `IY=${hex(registers.iy)}`,
    `PC=${hex(registers.pc)}`,
  ].join(' ');
}

function describeTarget(target) {
  if (target >= ROM_LIMIT) {
    return `outside 4MB ROM (limit ${hex(ROM_LIMIT)})`;
  }

  const slice = romBytes.slice(target, Math.min(target + 8, romBytes.length));
  if (slice.length === 0) {
    return 'no ROM bytes available';
  }

  const allFF = slice.every((value) => value === 0xFF);
  return `${allFF ? 'ROM bytes all 0xFF' : 'ROM bytes'}: ${bytesToHex(slice)}`;
}

function formatExit(exit) {
  const modeSuffix = exit.targetMode ? `:${exit.targetMode}` : '';
  return `${exit.type}->${hex(exit.target)}${modeSuffix}`;
}

function formatExitSummary(entry) {
  if (entry.actualTarget !== null) {
    return `dynamic -> ${hex(entry.actualTarget)}`;
  }

  if (!entry.staticExits.length) {
    return 'none';
  }

  return entry.staticExits.map(formatExit).join(', ');
}

function formatDecodedInstruction(decoded) {
  if (!decoded) {
    return 'decode failed';
  }

  switch (decoded.tag) {
    case 'call':
      return `call ${hex(decoded.target)}`;
    case 'call-conditional':
      return `call ${decoded.condition}, ${hex(decoded.target)}`;
    case 'jp':
      return `jp ${hex(decoded.target)}`;
    case 'jp-conditional':
      return `jp ${decoded.condition}, ${hex(decoded.target)}`;
    case 'jp-indirect':
      return `jp (${decoded.indirectRegister})`;
    case 'jr':
      return `jr ${hex(decoded.target)}`;
    case 'jr-conditional':
      return `jr ${decoded.condition}, ${hex(decoded.target)}`;
    case 'ret':
      return 'ret';
    case 'ret-conditional':
      return `ret ${decoded.condition}`;
    case 'rst':
      return `rst ${hex(decoded.target, 2)}`;
    case 'djnz':
      return `djnz ${hex(decoded.target)}`;
    case 'ld-pair-mem':
      if (decoded.direction === 'to-mem') {
        return `ld (${hex(decoded.addr)}), ${decoded.pair}`;
      }
      return `ld ${decoded.pair}, (${hex(decoded.addr)})`;
    case 'ld-reg-imm':
      return `ld ${decoded.dest}, ${hex(decoded.value, 2)}`;
    case 'ld-reg-reg':
      return `ld ${decoded.dest}, ${decoded.src}`;
    case 'push':
      return `push ${decoded.pair}`;
    case 'pop':
      return `pop ${decoded.pair}`;
    default:
      return decoded.tag;
  }
}

function safeDecode(pc) {
  try {
    return decodeInstruction(romBytes, pc, 'adl');
  } catch {
    return null;
  }
}

function createTraceRecorder(cpu) {
  const tail = [];
  const byStep = new Map();
  let missing = null;

  function onBlock(pc, mode, meta, steps) {
    const executionStep = steps + 1;
    const instructions = meta?.instructions ?? [];
    const lastInstruction = instructions.length === 0
      ? null
      : instructions[instructions.length - 1];

    const entry = {
      step: executionStep,
      pc: pc & 0xFFFFFF,
      mode,
      registers: snapshotRegisters(cpu, pc),
      staticExits: (meta?.exits ?? []).map((exit) => ({
        type: exit.type,
        target: exit.target,
        targetMode: exit.targetMode ?? null,
      })),
      lastInstruction: lastInstruction
        ? {
            pc: lastInstruction.pc,
            dasm: lastInstruction.dasm,
            bytes: lastInstruction.bytes,
            tag: lastInstruction.tag,
          }
        : null,
      actualTarget: null,
    };

    byStep.set(executionStep, entry);
    tail.push(entry);

    if (tail.length > TRACE_TAIL_COUNT) {
      tail.shift();
    }
  }

  function onDynamicTarget(target, mode, pc, steps) {
    const entry = byStep.get(steps);
    if (!entry) {
      return;
    }

    entry.actualTarget = target & 0xFFFFFF;
    entry.dynamicSourceMode = mode;
    entry.dynamicSourcePc = pc & 0xFFFFFF;
  }

  function onMissingBlock(pc, mode, steps) {
    missing = {
      pc: pc & 0xFFFFFF,
      mode,
      steps,
    };
  }

  return {
    onBlock,
    onDynamicTarget,
    onMissingBlock,
    getTail() {
      return tail.slice();
    },
    getMissing() {
      return missing;
    },
  };
}

function printPointerDump(mem) {
  console.log('Key RAM pointers:');

  for (const slot of POINTER_SLOTS) {
    const bytes = mem.slice(slot.addr, slot.addr + 3);
    console.log(
      `  ${hex(slot.addr)} ${slot.label}: ${hex(read24(mem, slot.addr))} [${bytesToHex(bytes)}]`,
    );
  }
}

function printLastBlockDetails(mem, trace, missingTarget) {
  const lastBlock = trace[trace.length - 1];
  if (!lastBlock) {
    console.log('Last block details: none');
    return;
  }

  const decodedStart = safeDecode(lastBlock.pc);
  const startBytes = romBytes.slice(
    lastBlock.pc,
    Math.min(lastBlock.pc + (decodedStart?.length ?? 1), romBytes.length),
  );

  console.log('Last block details:');
  console.log(`  Entry registers: ${formatRegisters(lastBlock.registers)}`);
  console.log(
    `  Block start instruction: ${formatDecodedInstruction(decodedStart)} bytes=${bytesToHex(startBytes)}`,
  );

  if (lastBlock.lastInstruction) {
    console.log(
      `  Block terminator: ${lastBlock.lastInstruction.dasm} @ ${hex(lastBlock.lastInstruction.pc)} bytes=${lastBlock.lastInstruction.bytes}`,
    );
  } else {
    console.log('  Block terminator: n/a');
  }

  if (lastBlock.actualTarget !== null) {
    console.log(`  Observed target: ${hex(lastBlock.actualTarget)}`);
  } else {
    console.log(`  Inferred target from termination: ${hex(missingTarget)}`);
  }

  const stackBytes = mem.slice(lastBlock.registers.sp, lastBlock.registers.sp + STACK_DUMP_BYTES);
  console.log(`  Stack @ SP: ${bytesToHex(stackBytes)}`);
}

function traceStage(executor, cpu, mem, stage, cpuSnapshot, ramSnapshot) {
  mem.set(ramSnapshot, RAM_SNAPSHOT_START);
  clearVram(mem);
  restoreCpu(cpu, cpuSnapshot, mem);
  stage.beforeRun?.(mem, cpu);

  const trace = createTraceRecorder(cpu);
  const result = executor.runFrom(stage.entry, 'adl', {
    maxSteps: stage.maxSteps,
    maxLoopIterations: STAGE_MAX_LOOP_ITERATIONS,
    onBlock: trace.onBlock,
    onDynamicTarget: trace.onDynamicTarget,
    onMissingBlock: trace.onMissingBlock,
  });

  const tail = trace.getTail();
  const lastEntry = tail[tail.length - 1] ?? null;

  if (result.termination === 'missing_block' && lastEntry && lastEntry.actualTarget === null) {
    lastEntry.actualTarget = result.lastPc & 0xFFFFFF;
  }

  console.log(`=== Stage ${stage.number}: ${stage.label} ===`);
  console.log(`Entry: ${hex(stage.entry)}`);
  console.log(
    `Result: ${result.steps} steps, termination=${result.termination}, lastPc=${hex(result.lastPc)}`,
  );

  if (trace.getMissing()) {
    console.log(
      `Missing block callback: step=${trace.getMissing().steps} mode=${trace.getMissing().mode} pc=${hex(trace.getMissing().pc)}`,
    );
  }

  console.log(`Missing target note: ${describeTarget(result.lastPc)}`);
  console.log('Last 20 blocks before termination:');

  if (tail.length === 0) {
    console.log('  (none)');
  } else {
    for (const entry of tail) {
      const marker = entry === lastEntry && result.termination === 'missing_block'
        ? ` <- THIS BLOCK JUMPED TO missing ${hex(result.lastPc)}`
        : '';
      console.log(
        `  step ${entry.step}: PC=${hex(entry.pc)} last=${entry.lastInstruction?.dasm ?? 'n/a'} exit=${formatExitSummary(entry)}${marker}`,
      );
    }
  }

  printLastBlockDetails(mem, tail, result.lastPc);
  printPointerDump(mem);
  console.log('');
}

async function main() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  clearVram(mem);

  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  console.log('=== Phase 154 - Trace Missing Block Origins ===');
  console.log(`ROM size: ${hex(romBytes.length)}`);
  console.log('');

  coldBoot(executor, cpu, mem);
  const ramSnapshot = new Uint8Array(mem.slice(RAM_SNAPSHOT_START, RAM_SNAPSHOT_END));
  const cpuSnapshot = snapshotCpu(cpu);

  for (const stage of STAGES) {
    traceStage(executor, cpu, mem, stage, cpuSnapshot, ramSnapshot);
  }
}

await main();
