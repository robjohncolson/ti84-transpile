#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

process.emitWarning = () => {};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');
const CPU_RUNTIME_PATH = path.join(__dirname, 'cpu-runtime.js');
const PERIPHERALS_PATH = path.join(__dirname, 'peripherals.js');
const DECODER_PATH = path.join(__dirname, 'ez80-decoder.js');

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const STACK_RESET_TOP = 0xD1A87E;
const IY_BASE = 0xD00080;
const RETURN_SENTINEL = 0xFFFFFF;

const POST_BOOT_CALLBACK_PTR = 0xD02AD7;
const CXMAIN_PTR = 0xD007CA;
const KBD_SCANCODE = 0xD00587;
const KBD_HANDOFF = 0xD0058E;

const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_MAX_STEPS = 100000;
const KERNEL_INIT_MAX_LOOP_ITERATIONS = 10000;
const CANDIDATE_MAX_STEPS = 50000;
const UNIQUE_PC_LOG_LIMIT = 200;

const HALT_SCAN_START = 0x000000;
const HALT_SCAN_END = 0x020000;
const HALT_LOOKBACK = 8;
const HALT_CHAIN_MAX_STEPS = 8;

const CANDIDATES = [
  { label: 'post_boot_callback', addr: 0x015AD9 },
  { label: 'os_event_loop', addr: 0x0019BE },
  { label: 'coormon_event_loop_entry', addr: 0x08BF22 },
  { label: 'coormon_inner_loop', addr: 0x09EFDE },
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }

  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function read24(buffer, addr) {
  const base = addr >>> 0;
  return (
    (buffer[base] ?? 0) |
    ((buffer[base + 1] ?? 0) << 8) |
    ((buffer[base + 2] ?? 0) << 16)
  ) >>> 0;
}

function write24(buffer, addr, value) {
  const base = addr >>> 0;
  const normalized = value >>> 0;
  buffer[base] = normalized & 0xFF;
  buffer[base + 1] = (normalized >>> 8) & 0xFF;
  buffer[base + 2] = (normalized >>> 16) & 0xFF;
}

function bytesHex(buffer, start, length) {
  const from = Math.max(0, start >>> 0);
  const to = Math.min(buffer.length, from + Math.max(0, length | 0));
  return Array.from(buffer.subarray(from, to), (byte) =>
    byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function chunk(items, width) {
  const rows = [];

  for (let index = 0; index < items.length; index += width) {
    rows.push(items.slice(index, index + width));
  }

  return rows;
}

function createMemoryBus(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes);
  return mem;
}

function resetStack(cpu, mem) {
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
}

function prepareDirectEntry(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP;
  cpu.sp -= 3;
  write24(mem, cpu.sp, RETURN_SENTINEL);
}

function setPendingEnter(peripherals, mem) {
  const keyMatrix = peripherals.keyMatrix ?? peripherals.keyboard?.keyMatrix;

  if (!keyMatrix) {
    throw new Error('Peripheral bus did not expose a keyboard matrix.');
  }

  keyMatrix.fill(0xFF);
  keyMatrix[6] = 0x02;

  mem[KBD_HANDOFF] = 0x09;
  mem[KBD_SCANCODE] = 0x09;
}

function summarizeRun(label, result) {
  return `${label}: steps=${result.steps} termination=${result.termination} lastPc=${hex(result.lastPc)} lastMode=${result.lastMode}`;
}

if (!fs.existsSync(ROM_PATH)) {
  throw new Error('ROM.rom is missing.');
}

if (!fs.existsSync(TRANSPILED_PATH)) {
  throw new Error('ROM.transpiled.js is missing.');
}

const romBytes = fs.readFileSync(ROM_PATH);
const { createExecutor } = await import(pathToFileURL(CPU_RUNTIME_PATH).href);
const { createPeripheralBus } = await import(pathToFileURL(PERIPHERALS_PATH).href);
const { decodeInstruction } = await import(pathToFileURL(DECODER_PATH).href);
const { PRELIFTED_BLOCKS } = await import(pathToFileURL(TRANSPILED_PATH).href);

function createBootedEnvironment() {
  const mem = createMemoryBus(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(PRELIFTED_BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;

  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStack(cpu, mem);

  const kernelInit = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: KERNEL_INIT_MAX_LOOP_ITERATIONS,
  });

  cpu.mbase = 0xD0;
  cpu.iy = IY_BASE;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  resetStack(cpu, mem);

  return {
    mem,
    peripherals,
    executor,
    cpu,
    boot,
    kernelInit,
  };
}

function safeDecode(addr, mode) {
  try {
    return decodeInstruction(romBytes, addr >>> 0, mode);
  } catch {
    return null;
  }
}

function findPlausiblePredecessor(addr, mode) {
  const startMin = Math.max(HALT_SCAN_START, (addr - HALT_LOOKBACK) >>> 0);

  for (let start = startMin; start < addr; start += 1) {
    let pc = start;
    let steps = 0;

    while (pc < addr && steps < HALT_CHAIN_MAX_STEPS) {
      const inst = safeDecode(pc, mode);
      const nextPc = inst?.nextPc ?? (inst ? pc + inst.length : pc);

      if (!inst || !inst.length || nextPc <= pc) {
        pc = -1;
        break;
      }

      pc = nextPc >>> 0;
      steps += 1;
    }

    if (pc === addr && steps > 0) {
      return { start, steps };
    }
  }

  return null;
}

function scanHalts() {
  const hits = [];

  for (let addr = HALT_SCAN_START; addr < HALT_SCAN_END; addr += 1) {
    if (romBytes[addr] !== 0x76) {
      continue;
    }

    const acceptedModes = [];

    for (const mode of ['adl', 'z80']) {
      const inst = safeDecode(addr, mode);

      if (inst?.tag !== 'halt') {
        continue;
      }

      const predecessor = findPlausiblePredecessor(addr, mode);

      if (!predecessor) {
        continue;
      }

      acceptedModes.push({
        mode,
        predecessorStart: predecessor.start,
        predecessorSteps: predecessor.steps,
      });
    }

    if (acceptedModes.length === 0) {
      continue;
    }

    hits.push({
      addr,
      modes: acceptedModes,
      contextStart: Math.max(HALT_SCAN_START, addr - 4),
      contextBytes: bytesHex(romBytes, Math.max(HALT_SCAN_START, addr - 4), 9),
    });
  }

  return hits;
}

function runCandidate(candidate) {
  const env = createBootedEnvironment();
  const { mem, peripherals, executor, cpu } = env;

  setPendingEnter(peripherals, mem);
  prepareDirectEntry(cpu, mem);

  const uniquePcs = [];
  const seenPcs = new Set();
  const missingBlocks = [];

  function recordPc(pc, mode, isMissing = false) {
    const normalizedPc = pc & 0xFFFFFF;
    const key = `${normalizedPc.toString(16)}:${mode}`;

    if (!seenPcs.has(key)) {
      seenPcs.add(key);
      uniquePcs.push({
        pc: normalizedPc,
        mode,
        missing: isMissing,
      });
    }

    if (isMissing) {
      missingBlocks.push({
        pc: normalizedPc,
        mode,
      });
    }
  }

  const result = executor.runFrom(candidate.addr, 'adl', {
    maxSteps: CANDIDATE_MAX_STEPS,
    maxLoopIterations: CANDIDATE_MAX_STEPS,
    onBlock(pc, mode) {
      recordPc(pc, mode, false);
    },
    onMissingBlock(pc, mode) {
      recordPc(pc, mode, true);
    },
  });

  return {
    result,
    uniquePcs,
    missingBlocks,
  };
}

function printCandidateReport(candidate, trace) {
  const uniqueToLog = trace.uniquePcs.slice(0, UNIQUE_PC_LOG_LIMIT);

  console.log(`\n=== ${candidate.label} ${hex(candidate.addr)} ===`);
  console.log('Seeded input: keyMatrix[6]=0x02, D0058E=0x09, D00587=0x09');
  console.log(
    `Result: steps=${trace.result.steps} termination=${trace.result.termination} `
      + `lastPc=${hex(trace.result.lastPc)} lastMode=${trace.result.lastMode} `
      + `loopsForced=${trace.result.loopsForced ?? 0}`,
  );

  if (trace.missingBlocks.length > 0) {
    console.log(
      `Missing blocks: ${trace.missingBlocks.map((entry) => `${hex(entry.pc)}:${entry.mode}`).join(', ')}`,
    );
  } else {
    console.log('Missing blocks: none');
  }

  console.log(`Unique block entry PCs: ${trace.uniquePcs.length}`);
  console.log(`First ${uniqueToLog.length} unique block entry PCs:`);

  for (const row of chunk(uniqueToLog, 8)) {
    console.log(
      `  ${row.map((entry) => entry.mode === 'adl' ? hex(entry.pc) : `${hex(entry.pc)}:${entry.mode}`).join(' ')}`,
    );
  }

  if (trace.uniquePcs.length > UNIQUE_PC_LOG_LIMIT) {
    console.log(`  ... truncated after ${UNIQUE_PC_LOG_LIMIT} of ${trace.uniquePcs.length} unique PCs`);
  }
}

console.log('Phase 334: OS event loop probe');

const baseline = createBootedEnvironment();
const postBootCallback = read24(baseline.mem, POST_BOOT_CALLBACK_PTR);
const cxMain = read24(baseline.mem, CXMAIN_PTR);

console.log(summarizeRun('boot', baseline.boot));
console.log(summarizeRun('kernel_init', baseline.kernelInit));
console.log(`Post-boot callback pointer @ ${hex(POST_BOOT_CALLBACK_PTR)} = ${hex(postBootCallback)}`);
console.log(`cxMain pointer            @ ${hex(CXMAIN_PTR)} = ${hex(cxMain)}`);

const haltHits = scanHalts();
console.log(`\nHALT opcodes in ROM ${hex(HALT_SCAN_START)}-${hex(HALT_SCAN_END - 1)} with plausible instruction context: ${haltHits.length}`);

if (haltHits.length === 0) {
  console.log('  none');
} else {
  for (const hit of haltHits) {
    const modeSummary = hit.modes
      .map((entry) => `${entry.mode}@${hex(entry.predecessorStart)}(${entry.predecessorSteps} steps)`)
      .join(', ');
    console.log(`  ${hex(hit.addr)}  modes=${modeSummary}  bytes=${hit.contextBytes}`);
  }
}

for (const candidate of CANDIDATES) {
  printCandidateReport(candidate, runCandidate(candidate));
}
