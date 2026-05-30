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
const VRAM_START = 0xD40000;
const VRAM_END = 0xD65800;
const ADDRESS_MASK = 0xFFFFFF;

// Tracked PCs for hit counting
const TRACKED_PCS = new Map([
  [0x08BF22, 'home screen init entry'],
  [0x030078, 'port/LCD setup'],
  [0x03FA09, 'key processor'],
  [0x040D11, 'cursor timing'],
  [0x0059C6, 'display output'],
  [0x030300, 'cursor/display prep'],
  [0x02FDBE, 'event loop head'],
  [0x02FDD8, 'main handler'],
  [0x030052, 'key wait loop'],
  [0x08772C, 'D00824=0x48 writer function'],
  [0x08773F, 'called from key dispatch'],
]);

// RAM addresses to watch for changes
const WATCHED = {
  D000B4: 0xD000B4,
  D000C6: 0xD000C6,
  D000D7: 0xD000D7,
  D00824: 0xD00824,
  D0058F: 0xD0058F,
  D14091: 0xD14091,
  D177B7: 0xD177B7,
  D00080: 0xD00080,
  D00085: 0xD00085,
  D00088: 0xD00088,
  D0009D: 0xD0009D,
  D000A8: 0xD000A8,
  D00082: 0xD00082,
  D007E0: 0xD007E0,
};

const mem = new Uint8Array(MEM_SIZE);
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
mem.set(rom.subarray(0, MEM_SIZE), 0);

const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;
const peripherals = createPeripheralBus({ timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

// --- Utility helpers ---

function hex(value, width = 6) {
  if (!Number.isFinite(value)) return 'n/a';
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xFF, 2);
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

function terminationReason(result) {
  if (result && typeof result === 'object') {
    for (const key of ['reason', 'terminationReason', 'haltReason', 'status', 'stopReason']) {
      if (result[key] !== undefined) return String(result[key]);
    }
  }
  return cpu.halted ? 'halted' : 'unknown';
}

function summarizeRun(result) {
  const summary = { reason: terminationReason(result) };
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

// --- Stage 1a: Boot entry ---
const bootResult = executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
const bootSummary = summarizeRun(bootResult);
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);

// --- Stage 1b: Kernel init ---
cpu.mbase = 0xD0; cpu._iy = 0xD00080;
const kernelResult = executor.runFrom(0x08C331, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });
const kernelSummary = summarizeRun(kernelResult);
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3; mem.fill(0xFF, cpu.sp, cpu.sp + 3);

// --- Stage 1c: Post-init ---
const postInitResult = executor.runFrom(0x0802B2, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });
const postInitSummary = summarizeRun(postInitResult);

// --- Set up for 0x08BF22 entry ---
cpu.mbase = 0xD0;
cpu._iy = 0xD00080;
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem[cpu.sp] = 0xFF;
mem[cpu.sp + 1] = 0xFF;
mem[cpu.sp + 2] = 0xFF; // sentinel

// --- Record BEFORE values of all watched addresses ---
const beforeValues = {};
for (const [label, addr] of Object.entries(WATCHED)) {
  beforeValues[label] = mem[addr];
}

// Snapshot state for change detection (per-100-block polling)
let prevSnapshot = { ...beforeValues };

// --- Hit counting state ---
const hitCounts = new Map();
for (const pc of TRACKED_PCS.keys()) {
  hitCounts.set(pc, 0);
}

// Detected RAM changes
const ramChanges = [];
let observedBlocks = 0;

// Snapshot VRAM before the main run
const vramBefore = mem.slice(VRAM_START, VRAM_END);

// --- onBlock callback ---
function onBlock(...args) {
  observedBlocks += 1;

  const pc = extractBlockPc(args);

  // Hit counting for tracked PCs
  if (pc !== undefined && hitCounts.has(pc)) {
    hitCounts.set(pc, hitCounts.get(pc) + 1);
    const count = hitCounts.get(pc);
    if (count <= 5) {
      console.log(`[hit] ${TRACKED_PCS.get(pc)} ${hex(pc)} #${count} block=${observedBlocks}`);
    }
  }

  // Every 100 blocks, snapshot watched addresses and detect changes
  if (observedBlocks % 100 !== 0) return;

  const currentPc = pc ?? (cpu._pc !== undefined ? cpu._pc & ADDRESS_MASK : undefined);

  for (const [label, addr] of Object.entries(WATCHED)) {
    const current = mem[addr];
    const previous = prevSnapshot[label];
    if (current !== previous) {
      const change = {
        address: label,
        hexAddr: hex(addr),
        oldValue: hexByte(previous),
        newValue: hexByte(current),
        block: observedBlocks,
        pc: currentPc !== undefined ? hex(currentPc) : 'n/a',
      };
      ramChanges.push(change);
      console.log(
        '[write] ' + label + ' changed ' + hexByte(previous) + ' => ' + hexByte(current) +
        ' at block ' + observedBlocks + ' (pc=' + change.pc + ')',
      );
      prevSnapshot[label] = current;
    }
  }
}

// --- Main run: home screen init ---
const mainResult = executor.runFrom(0x08BF22, 'adl', {
  maxSteps: 500000,
  maxLoopIterations: 5000,
  diHaltBypass: true,
  onBlock,
});
const mainSummary = summarizeRun(mainResult);

// Count VRAM changes
let vramChangedBytes = 0;
for (let offset = 0; offset < vramBefore.length; offset += 1) {
  if (mem[VRAM_START + offset] !== vramBefore[offset]) vramChangedBytes += 1;
}

// Final values of all watched addresses
const finalWatched = {};
for (const [label, addr] of Object.entries(WATCHED)) {
  finalWatched[label] = hexByte(mem[addr]);
}

// Hit count summary
const hitSummary = {};
for (const [pc, label] of TRACKED_PCS.entries()) {
  hitSummary[hex(pc)] = { label, count: hitCounts.get(pc) ?? 0 };
}

const summary = {
  boot: bootSummary,
  kernelInit: kernelSummary,
  postInit: postInitSummary,
  ramChanges,
  finalWatchedAddresses: finalWatched,
  hitCounts: hitSummary,
  vramChangedBytes,
  terminationReason: terminationReason(mainResult),
  finalPc: readPcFrom(mainResult) !== undefined ? hex(readPcFrom(mainResult)) : 'n/a',
  mainRun: mainSummary,
};

console.log('\n[summary]');
console.log(JSON.stringify(summary, null, 2));