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

const mem = new Uint8Array(MEM_SIZE);
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
mem.set(rom.subarray(0, MEM_SIZE), 0);

const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;
const peripherals = createPeripheralBus({ timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

const PROBE_ADDR = 0x05C76C;
const PROBE_DUMP_END = 0x05C7CC;
const KEY_RAM_START = 0xD00080;
const KEY_RAM_END = 0xD00100;
const IDLE_ADDR = 0x02FD99;
const IDLE_RETURN_ADDR = 0x02FDBE;

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function snapshotRange(start, end) {
  return Array.from(mem.subarray(start, end));
}

function formatSnapshot(bytes) {
  return bytes.map(hexByte).join(' ');
}

function diffSnapshots(start, before, after) {
  const diffs = [];
  for (let i = 0; i < before.length; i++) {
    if (before[i] !== after[i]) {
      diffs.push({
        addr: hex(start + i),
        before: hex(before[i], 2),
        after: hex(after[i], 2),
      });
    }
  }
  return diffs;
}

function createPcTracker() {
  const seen = new Map();
  let totalBlocks = 0;
  return {
    hit(pc, mode, steps) {
      const normalizedPc = pc & 0xFFFFFF;
      totalBlocks++;
      let record = seen.get(normalizedPc);
      if (!record) {
        record = {
          pc: normalizedPc,
          modes: new Set(),
          count: 0,
          firstStep: steps,
          lastStep: steps,
        };
        seen.set(normalizedPc, record);
      }
      record.modes.add(mode);
      record.count++;
      record.lastStep = steps;
    },
    summary(limit = 200) {
      return Array.from(seen.values()).slice(0, limit).map((record) => ({
        pc: hex(record.pc),
        modes: Array.from(record.modes),
        count: record.count,
        firstStep: record.firstStep,
        lastStep: record.lastStep,
      }));
    },
    totalBlocks() {
      return totalBlocks;
    },
    uniqueCount() {
      return seen.size;
    },
  };
}

function summarizeRunResult(result, lastPc) {
  const summary = {
    steps: result?.steps ?? result?.stepCount ?? null,
    termination: result?.termination ?? result?.reason ?? result?.status ?? null,
    lastPc: result?.lastPc !== undefined ? hex(result.lastPc) : lastPc !== undefined ? hex(lastPc) : null,
  };

  if (result && typeof result === 'object') {
    for (const key of ['halted', 'loopIterations', 'maxStepsExceeded', 'error']) {
      if (Object.hasOwn(result, key)) {
        summary[key] = result[key];
      }
    }
  }

  return summary;
}

function writeAdlReturn(addr) {
  mem[cpu.sp] = addr & 0xFF;
  mem[cpu.sp + 1] = (addr >>> 8) & 0xFF;
  mem[cpu.sp + 2] = (addr >>> 16) & 0xFF;
}

function resetProbeCpuState() {
  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
}

const bootResult = executor.runFrom(0x000000, 'z80', { maxSteps: 20000, maxLoopIterations: 32 });
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

cpu.mbase = 0xD0; cpu._iy = 0xD00080;
const kernelResult = executor.runFrom(0x08C331, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });
cpu.mbase = 0xD0; cpu._iy = 0xD00080; cpu._hl = 0;
cpu.halted = false; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.sp = STACK_RESET_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

const postInitResult = executor.runFrom(0x0802B2, 'adl', { maxSteps: 200000, maxLoopIterations: 500 });

const bootedMemory = mem.slice();

mem.set(bootedMemory);
resetProbeCpuState();

const romBytes = [];
for (let i = PROBE_ADDR; i < PROBE_DUMP_END; i++) {
  romBytes.push(mem[i].toString(16).padStart(2, '0'));
}
console.log('ROM 0x05C76C-0x05C7CB:', romBytes.join(' '));

const directBefore = snapshotRange(KEY_RAM_START, KEY_RAM_END);
const directTracker = createPcTracker();
let directLastPc;
function onDirectBlock(pc, mode, meta, steps) {
  directLastPc = pc;
  directTracker.hit(pc, mode, steps);
}

let directResult;
let directError = null;
try {
  directResult = executor.runFrom(PROBE_ADDR, 'adl', {
    maxSteps: 10000,
    maxLoopIterations: 200,
    diHaltBypass: true,
    onBlock: onDirectBlock,
  });
} catch (error) {
  directError = {
    name: error?.name ?? 'Error',
    message: error?.message ?? String(error),
  };
}
const directAfter = snapshotRange(KEY_RAM_START, KEY_RAM_END);
const directDiffs = diffSnapshots(KEY_RAM_START, directBefore, directAfter);

const directPcSummary = directTracker.summary(200);
console.log('Direct 0x05C76C unique PCs first 200:');
for (const record of directPcSummary) {
  console.log(`${record.pc} modes=${record.modes.join(',')} count=${record.count} firstStep=${record.firstStep} lastStep=${record.lastStep}`);
}
console.log('Direct 0x05C76C run:', JSON.stringify(summarizeRunResult(directResult, directLastPc), null, 2));
if (directError) {
  console.log('Direct 0x05C76C error:', JSON.stringify(directError, null, 2));
}
console.log('Direct D00080-D000FF before:', formatSnapshot(directBefore));
console.log('Direct D00080-D000FF after:', formatSnapshot(directAfter));
console.log('Direct D00080-D000FF diffs:', JSON.stringify(directDiffs, null, 2));

mem.set(bootedMemory);
resetProbeCpuState();
mem[0xD00587] = 0x00;
mem[0xD00080] = 0x00;
mem[0xD177BA] = 0x7F;
mem[0xD177B7] = 0x00;
mem[0xD00088] |= 0x08;
writeAdlReturn(IDLE_RETURN_ADDR);

const idleBefore = snapshotRange(KEY_RAM_START, KEY_RAM_END);
const idleTracker = createPcTracker();
const idleProbeTracker = createPcTracker();
const idleProbeTrace = [];
let idleLastPc;
let idleProbeHitCount = 0;
let tracingAfterProbe = false;
function onIdleBlock(pc, mode, meta, steps) {
  idleLastPc = pc;
  idleTracker.hit(pc, mode, steps);
  if ((pc & 0xFFFFFF) === PROBE_ADDR) {
    idleProbeHitCount++;
    tracingAfterProbe = true;
  }
  if (tracingAfterProbe && idleProbeTrace.length < 120) {
    idleProbeTrace.push({
      pc: hex(pc & 0xFFFFFF),
      mode,
      step: steps,
    });
    idleProbeTracker.hit(pc, mode, steps);
  }
}

let idleResult;
let idleError = null;
try {
  idleResult = executor.runFrom(IDLE_ADDR, 'adl', {
    maxSteps: 10000,
    maxLoopIterations: 200,
    diHaltBypass: true,
    onBlock: onIdleBlock,
  });
} catch (error) {
  idleError = {
    name: error?.name ?? 'Error',
    message: error?.message ?? String(error),
  };
}
const idleAfter = snapshotRange(KEY_RAM_START, KEY_RAM_END);
const idleDiffs = diffSnapshots(KEY_RAM_START, idleBefore, idleAfter);

console.log('Idle loop reached 0x05C76C:', idleProbeHitCount > 0);
console.log('Idle loop 0x05C76C hit count:', idleProbeHitCount);
console.log('Idle loop unique PCs first 200:');
for (const record of idleTracker.summary(200)) {
  console.log(`${record.pc} modes=${record.modes.join(',')} count=${record.count} firstStep=${record.firstStep} lastStep=${record.lastStep}`);
}
console.log('Idle loop post-0x05C76C trace first 120 blocks:', JSON.stringify(idleProbeTrace, null, 2));
console.log('Idle loop post-0x05C76C unique PCs first 200:', JSON.stringify(idleProbeTracker.summary(200), null, 2));
console.log('Idle loop run:', JSON.stringify(summarizeRunResult(idleResult, idleLastPc), null, 2));
if (idleError) {
  console.log('Idle loop error:', JSON.stringify(idleError, null, 2));
}
console.log('Idle D00080-D000FF before:', formatSnapshot(idleBefore));
console.log('Idle D00080-D000FF after:', formatSnapshot(idleAfter));
console.log('Idle D00080-D000FF diffs:', JSON.stringify(idleDiffs, null, 2));

const summary = {
  boot: {
    reset: summarizeRunResult(bootResult),
    kernel: summarizeRunResult(kernelResult),
    postInit: summarizeRunResult(postInitResult),
  },
  romDump: {
    start: hex(PROBE_ADDR),
    endInclusive: hex(PROBE_DUMP_END - 1),
    bytes: romBytes.join(' '),
  },
  direct05C76C: {
    run: summarizeRunResult(directResult, directLastPc),
    error: directError,
    totalBlocks: directTracker.totalBlocks(),
    uniquePcCount: directTracker.uniqueCount(),
    uniquePcsFirst200: directPcSummary,
    keyRamBefore: formatSnapshot(directBefore),
    keyRamAfter: formatSnapshot(directAfter),
    keyRamDiffs: directDiffs,
  },
  idleLoopContext: {
    run: summarizeRunResult(idleResult, idleLastPc),
    error: idleError,
    reached05C76C: idleProbeHitCount > 0,
    hitCount05C76C: idleProbeHitCount,
    totalBlocks: idleTracker.totalBlocks(),
    uniquePcCount: idleTracker.uniqueCount(),
    uniquePcsFirst200: idleTracker.summary(200),
    post05C76CTraceFirst120: idleProbeTrace,
    post05C76CUniquePcsFirst200: idleProbeTracker.summary(200),
    keyRamBefore: formatSnapshot(idleBefore),
    keyRamAfter: formatSnapshot(idleAfter),
    keyRamDiffs: idleDiffs,
  },
};

console.log('JSON summary:');
console.log(JSON.stringify(summary, null, 2));
