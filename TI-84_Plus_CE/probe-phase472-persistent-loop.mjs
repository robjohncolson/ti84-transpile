#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MEM_SIZE = 0x1000000;
const STACK_RESET_TOP = 0xD1A87E;
const EVENT_LOOP_HEAD = 0x02FDBE;
const VRAM_START = 0xD40000;
const VRAM_END = 0xD65800;
const ADDRESS_MASK = 0xFFFFFF;

const TRACKED_PCS = new Map([
  [0x02FDBE, 'event loop head'],
  [0x02FE88, 'iteration return'],
  [0x03FA09, 'key processor'],
  [0x02FDD8, 'main handler entry'],
  [0x02FE89, 'key handler chain'],
  [0x030078, 'port/LCD setup'],
  [0x040D11, 'cursor timing'],
  [0x0059C6, 'display output'],
  [0x030300, 'cursor/display prep'],
]);

const mem = new Uint8Array(MEM_SIZE);
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
mem.set(rom.subarray(0, MEM_SIZE), 0);

const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;
const peripherals = createPeripheralBus({ timerInterrupt: true, timerInterval: 500 });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

const hitCounts = new Map();
const firstHits = new Map();
for (const pc of TRACKED_PCS.keys()) {
  hitCounts.set(pc, 0);
  firstHits.set(pc, []);
}

function hex(value, width = 6) {
  if (!Number.isFinite(value)) return 'n/a';
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xFF, 2);
}

function fnv1a(start, end) {
  let hash = 0x811C9DC5;
  for (let addr = start; addr < end; addr += 1) {
    hash ^= mem[addr];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function readA(state) {
  const source = state ?? cpu;
  if (Number.isFinite(source.a)) return source.a & 0xFF;
  if (Number.isFinite(source._a)) return source._a & 0xFF;
  if (Number.isFinite(source.regA)) return source.regA & 0xFF;
  if (Number.isFinite(source.af)) return (source.af >>> 8) & 0xFF;
  if (Number.isFinite(source._af)) return (source._af >>> 8) & 0xFF;
  return undefined;
}

function readPcFrom(value) {
  if (!value || typeof value !== 'object') return undefined;
  for (const key of ['pc', '_pc', 'PC', 'addr', 'address', 'start', 'startPc']) {
    if (Number.isFinite(value[key])) return value[key] & ADDRESS_MASK;
  }
  if (value.block && typeof value.block === 'object') return readPcFrom(value.block);
  return undefined;
}

function extractBlockPc(args) {
  if (Number.isFinite(args[0])) return args[0] & ADDRESS_MASK;
  for (const arg of args) {
    const pc = readPcFrom(arg);
    if (pc !== undefined) return pc;
  }
  return undefined;
}

function extractCpu(args) {
  for (const arg of args) {
    if (arg && typeof arg === 'object') {
      if (arg.cpu && typeof arg.cpu === 'object') return arg.cpu;
      if (arg.state && arg.state.cpu && typeof arg.state.cpu === 'object') return arg.state.cpu;
      if ('_a' in arg || 'a' in arg || 'af' in arg || '_af' in arg) return arg;
    }
  }
  return cpu;
}

function extractStep(args, fallback) {
  for (let index = 1; index < args.length; index += 1) {
    if (Number.isFinite(args[index])) return args[index];
  }
  for (const arg of [...args, cpu, executor]) {
    if (!arg || typeof arg !== 'object') continue;
    for (const key of ['step', 'steps', 'stepCount', 'executedSteps', 'instructionCount', 'instructions']) {
      if (Number.isFinite(arg[key])) return arg[key];
    }
  }
  return fallback;
}

function terminationReason(result) {
  if (result && typeof result === 'object') {
    for (const key of ['reason', 'terminationReason', 'haltReason', 'status', 'stopReason']) {
      if (result[key] !== undefined) return String(result[key]);
    }
  }
  return cpu.halted ? 'halted' : 'unknown';
}

function summarizeRun(result) {
  const summary = {
    reason: terminationReason(result),
  };
  const pc = readPcFrom(result);
  if (pc !== undefined) summary.pc = hex(pc);
  if (result && typeof result === 'object') {
    for (const key of ['steps', 'stepCount', 'executedSteps', 'instructionCount', 'instructions']) {
      if (Number.isFinite(result[key])) {
        summary.steps = result[key];
        break;
      }
    }
  }
  return summary;
}

let observedBlocks = 0;
function onBlock(...args) {
  observedBlocks += 1;
  const pc = extractBlockPc(args);
  if (pc === undefined || !hitCounts.has(pc)) return;

  const nextCount = hitCounts.get(pc) + 1;
  hitCounts.set(pc, nextCount);

  if (pc === 0x02FE88) {
    // Push return address back onto stack for next iteration.
    // The RET will pop 3 bytes, so write the address at current SP.
    mem[cpu.sp] = 0xBE;     // low byte of 0x02FDBE
    mem[cpu.sp + 1] = 0xFD; // mid byte
    mem[cpu.sp + 2] = 0x02; // high byte
    console.log(`[iteration] RET at 0x02FE88, restoring stack. Iteration #${nextCount}`);
  }

  if (nextCount <= 10) {
    const state = extractCpu(args);
    const a = readA(state);
    const step = extractStep(args, observedBlocks);
    const record = {
      hit: nextCount,
      step,
      a: a === undefined ? 'n/a' : hexByte(a),
    };
    firstHits.get(pc).push(record);
    console.log(
      `[hit] ${TRACKED_PCS.get(pc)} ${hex(pc)} #${nextCount} step=${step} A=${record.a}`,
    );
  }
}

function changedVramBytes(before) {
  let changed = 0;
  for (let offset = 0; offset < before.length; offset += 1) {
    if (mem[VRAM_START + offset] !== before[offset]) changed += 1;
  }
  return changed;
}

// 1a. Boot entry
const bootResult = executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
const bootSummary = summarizeRun(bootResult);
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);

// 1b. Kernel init
cpu.mbase = 0xD0; cpu._iy = 0xD00080;
const kernelResult = executor.runFrom(0x08C331, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });
const kernelSummary = summarizeRun(kernelResult);
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);

// 1c. Post-init
const postInitResult = executor.runFrom(0x0802B2, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });
const postInitSummary = summarizeRun(postInitResult);

mem[0xD00587] = 0x09;
mem[0xD00080] |= 0x08;
mem[0xD00088] |= 0x08;
mem[0xD177BA] = 0x7F;
mem[0xD177B7] = 0x00;
mem[0xD000B4] |= 0x01;  // bit 0 enables display path at 0x02FDD8
mem[0xD000C6] |= 0x01;  // bit 0 enables CALL NZ 0x030078 (port/LCD setup)

cpu.mbase = 0xD0;
cpu._iy = 0xD00080;
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem[cpu.sp] = 0xBE;     // low byte
mem[cpu.sp + 1] = 0xFD; // mid byte
mem[cpu.sp + 2] = 0x02; // high byte

const vramBeforeChecksum = fnv1a(VRAM_START, VRAM_END);
const vramBefore = mem.slice(VRAM_START, VRAM_END);

const loopResult = executor.runFrom(EVENT_LOOP_HEAD, 'adl', {
  maxSteps: 1000000,
  maxLoopIterations: 50000,
  diHaltBypass: true,
  onBlock,
});
const loopSummary = summarizeRun(loopResult);

const vramAfterChecksum = fnv1a(VRAM_START, VRAM_END);
const finalPc = readPcFrom(loopResult) ?? readPcFrom(cpu);
const eventLoopHits = hitCounts.get(EVENT_LOOP_HEAD) ?? 0;
const returnedToEventLoopHead = Math.max(0, eventLoopHits - 1);

const hitSummary = {};
for (const [pc, label] of TRACKED_PCS.entries()) {
  hitSummary[hex(pc)] = {
    label,
    count: hitCounts.get(pc) ?? 0,
    firstHits: firstHits.get(pc) ?? [],
  };
}

const summary = {
  boot: bootSummary,
  kernelInit: kernelSummary,
  postInit: postInitSummary,
  trackedHits: hitSummary,
  finalMemory: {
    D00587: hexByte(mem[0xD00587]),
    D00080: hexByte(mem[0xD00080]),
    D141B5: hexByte(mem[0xD141B5]),
    D000B4: hexByte(mem[0xD000B4]),
    D000C6: hexByte(mem[0xD000C6]),
    D000D7: hexByte(mem[0xD000D7]),
    D00824: hexByte(mem[0xD00824]),
    D0058F: hexByte(mem[0xD0058F]),
  },
  vram: {
    range: `${hex(VRAM_START)}-${hex(VRAM_END)}`,
    fnv1aBefore: hex(vramBeforeChecksum, 8),
    fnv1aAfter: hex(vramAfterChecksum, 8),
    bytesChanged: changedVramBytes(vramBefore),
  },
  finalPc: finalPc === undefined ? 'n/a' : hex(finalPc),
  terminationReason: terminationReason(loopResult),
  eventLoopHeadHits: eventLoopHits,
  returnedToEventLoopHead,
  iterations: hitCounts.get(0x02FE88) ?? 0,
  loopRun: loopSummary,
};

console.log('\n[summary]');
console.log(JSON.stringify(summary, null, 2));
