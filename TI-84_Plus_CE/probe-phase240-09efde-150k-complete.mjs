#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS =
  romModule.PRELIFTED_BLOCKS ??
  romModule.default?.PRELIFTED_BLOCKS ??
  romModule.default ??
  romModule;

if (!BLOCKS || typeof BLOCKS !== 'object') {
  throw new Error('Unable to resolve PRELIFTED_BLOCKS from ROM.transpiled.js.');
}

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const BOOT_ENTRY = 0x000000;
const BOOT_MODE = 'z80';
const BOOT_MAX_STEPS = 20000;
const BOOT_MAX_LOOP_ITERATIONS = 32;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;

const STACK_TOP = 0xD1A87E;
const RETURN_SENTINEL = 0x7FFFFE;
const MBASE = 0xD0;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;

const ENTRY_PC = 0x04EDD0;
const LOOP_PC = 0x09EFDE;
const ACTIVE_RANGE_START = 0x090000;
const ACTIVE_RANGE_END = 0x0B0000;
const FILL_RANGE_START = 0x09E000;
const FILL_RANGE_END = 0x09F000;
const STEP_BUDGET = 150000;
const REG_CHECKPOINT_INTERVAL = 10000;
const COVERAGE_INTERVAL = 10000;
const TRACE_TAIL_LIMIT = 16;
const LOOP_HIT_SAMPLE_LIMIT = 32;

const VRAM_BASE = 0xD40000;
const VRAM_WIDTH = 320;
const VRAM_HEIGHT = 240;
const VRAM_ROW_BYTES = VRAM_WIDTH * 2;
const VRAM_SIZE = VRAM_ROW_BYTES * VRAM_HEIGHT;
const VRAM_LAST = VRAM_BASE + VRAM_SIZE - 1;

const CALL_CHAIN = [
  { pc: 0x04EDD0, label: 'entry' },
  { pc: 0x04ECCE, label: 'downstream 1' },
  { pc: 0x07F984, label: 'downstream 2' },
  { pc: 0x08BF22, label: 'downstream 3' },
  { pc: 0x09EFDE, label: 'fill loop' },
];
const CALL_CHAIN_LABELS = new Map(CALL_CHAIN.map((item) => [item.pc, item.label]));

const ENTRY_SEEDS = [
  { addr: 0xD0058E, value: 0x00 },
  { addr: 0xD0058D, value: 0x00 },
  { addr: 0xD0059F, value: 0x00 },
  { addr: 0xD003E0, value: 0x00 },
  { addr: 0xD00824, value: 0x00 },
  { addr: 0xD003DA, value: 0x00 },
  { addr: 0xD007E0, value: 0x40 },
  { addr: 0xD00000, value: 0x00 },
];

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
}

function formatSignedDelta(value, width = 6) {
  const sign = value >= 0 ? '+' : '-';
  return `${sign}0x${Math.abs(value).toString(16).toUpperCase().padStart(width, '0')}`;
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function push24(cpu, mem, value) {
  cpu.sp = (cpu.sp - 3) & 0xFFFFFF;
  write24(mem, cpu.sp, value & 0xFFFFFF);
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const [field, value] of Object.entries(snapshot)) {
    cpu[field] = value;
  }
}

function blockKey(addr, mode) {
  return `${(addr >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function resolveNextMode(executor, key, returnedPc, currentMode) {
  const meta = executor.blockMeta?.[key];
  if (!meta?.exits) {
    return currentMode;
  }

  for (const exit of meta.exits) {
    if (exit.target === returnedPc && exit.targetMode) {
      return exit.targetMode;
    }
  }

  return currentMode;
}

function installStepShim(cpu, executor) {
  if (!executor?.compiledBlocks) {
    throw new Error('Executor compiledBlocks are required for manual stepping.');
  }

  cpu.step = function step() {
    const mode = this.madl ? 'adl' : 'z80';
    const pc = this.pc & 0xFFFFFF;
    const key = blockKey(pc, mode);
    const fn = executor.compiledBlocks[key];

    if (typeof fn !== 'function') {
      throw new Error(`Missing block function for ${hex(pc)} (${key})`);
    }

    this._currentBlockPc = pc;
    const result = fn(this);

    if (typeof result !== 'number') {
      throw new Error(`Unexpected step result from ${hex(pc)}: ${String(result)}`);
    }

    if (result >= 0) {
      const nextMode = resolveNextMode(executor, key, result, mode);
      this.pc = result & 0xFFFFFF;
      this.madl = nextMode === 'adl' ? 1 : 0;
    }

    return result;
  };
}

function createRuntime() {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(BLOCKS, mem, { peripherals });
  const cpu = executor.cpu;
  installStepShim(cpu, executor);
  return { mem, peripherals, executor, cpu };
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, BOOT_MODE, {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: BOOT_MAX_LOOP_ITERATIONS,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const kernel = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 10000,
  });

  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const post = executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return { boot, kernel, post };
}

function seedEntryState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu.pc = ENTRY_PC;
  cpu.sp = STACK_TOP;
  cpu.iy = IY_BASE;
  cpu.ix = IX_BASE;
  cpu.hl = 0;
  cpu.de = 0;
  cpu.bc = 0;
  cpu.a = 0x1D;
  cpu.f = 0x00;

  for (let offset = 0; offset < 128; offset++) {
    mem[(IY_BASE + offset) & MEM_MASK] = 0x00;
  }

  for (const seed of ENTRY_SEEDS) {
    mem[seed.addr & MEM_MASK] = seed.value & 0xFF;
  }

  push24(cpu, mem, RETURN_SENTINEL);
}

function recordVisit(visitCounts, order, pc) {
  if (!visitCounts.has(pc)) {
    order.push(pc);
  }
  visitCounts.set(pc, (visitCounts.get(pc) ?? 0) + 1);
}

function inActiveRange(pc) {
  return pc >= ACTIVE_RANGE_START && pc < ACTIVE_RANGE_END;
}

function inFillRange(pc) {
  return pc >= FILL_RANGE_START && pc < FILL_RANGE_END;
}

function rangeOverlaps(startA, lengthA, startB, lengthB) {
  const endA = startA + lengthA;
  const endB = startB + lengthB;
  return startA < endB && startB < endA;
}

function readBytes(mem, addr, width) {
  const bytes = new Uint8Array(width);
  for (let index = 0; index < width; index++) {
    bytes[index] = mem[(addr + index) & MEM_MASK];
  }
  return bytes;
}

function installVramWriteTrace(cpu, stepRef) {
  const mem = cpu.memory;
  const vram = {
    events: 0,
    bytes: 0,
    firstAddr: null,
    lastAddr: null,
    samples: [],
  };

  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  function captureWrite(addr, width, before, after) {
    let changed = false;
    for (let index = 0; index < before.length; index++) {
      if (before[index] !== after[index]) {
        changed = true;
        break;
      }
    }
    if (!changed) {
      return;
    }

    if (!rangeOverlaps(addr, width, VRAM_BASE, VRAM_SIZE)) {
      return;
    }

    vram.events += 1;
    vram.bytes += width;
    if (vram.firstAddr === null) {
      vram.firstAddr = addr;
    }
    vram.lastAddr = addr + width - 1;

    if (vram.samples.length < 32) {
      vram.samples.push({
        step: stepRef.current,
        pc: cpu._currentBlockPc & 0xFFFFFF,
        addr,
        width,
        before: bytesToHex(before),
        after: bytesToHex(after),
      });
    }
  }

  cpu.write8 = (addr, value) => {
    const base = addr & MEM_MASK;
    const before = readBytes(mem, base, 1);
    originalWrite8(base, value);
    const after = readBytes(mem, base, 1);
    captureWrite(base, 1, before, after);
  };

  cpu.write16 = (addr, value) => {
    const base = addr & MEM_MASK;
    const before = readBytes(mem, base, 2);
    originalWrite16(base, value);
    const after = readBytes(mem, base, 2);
    captureWrite(base, 2, before, after);
  };

  cpu.write24 = (addr, value) => {
    const base = addr & MEM_MASK;
    const before = readBytes(mem, base, 3);
    originalWrite24(base, value);
    const after = readBytes(mem, base, 3);
    captureWrite(base, 3, before, after);
  };

  return () => {
    cpu.write8 = originalWrite8;
    cpu.write16 = originalWrite16;
    cpu.write24 = originalWrite24;
    return vram;
  };
}

function scanVram(mem, includeSamples = false) {
  let nonZeroBytes = 0;
  let firstAddr = null;
  let lastAddr = null;
  let firstZeroAddr = null;
  let fullRows = 0;
  let partialRows = 0;

  for (let row = 0; row < VRAM_HEIGHT; row++) {
    let rowNonZero = 0;
    const rowStart = VRAM_BASE + (row * VRAM_ROW_BYTES);

    for (let column = 0; column < VRAM_ROW_BYTES; column++) {
      const addr = rowStart + column;
      const value = mem[addr];
      if (value !== 0) {
        nonZeroBytes += 1;
        rowNonZero += 1;
        if (firstAddr === null) {
          firstAddr = addr;
        }
        lastAddr = addr;
      } else if (firstZeroAddr === null) {
        firstZeroAddr = addr;
      }
    }

    if (rowNonZero === VRAM_ROW_BYTES) {
      fullRows += 1;
    } else if (rowNonZero > 0) {
      partialRows += 1;
    }
  }

  return {
    nonZeroBytes,
    fullRows,
    partialRows,
    firstAddr,
    lastAddr,
    firstZeroAddr,
    head32: includeSamples ? bytesToHex(mem.subarray(VRAM_BASE, VRAM_BASE + 32)) : null,
    tail32: includeSamples ? bytesToHex(mem.subarray(VRAM_LAST - 31, VRAM_LAST + 1)) : null,
  };
}

function sampleVramCoverage(step, mem, note = '') {
  const summary = scanVram(mem, false);
  return {
    step,
    note,
    nonZeroBytes: summary.nonZeroBytes,
    fullRows: summary.fullRows,
    partialRows: summary.partialRows,
  };
}

function summarizeVramContent(mem) {
  return scanVram(mem, true);
}

function traceNote(firstLoopHit, activeExit, pc) {
  if (!firstLoopHit) {
    return 'pre-fill';
  }
  if (activeExit) {
    return 'post-exit';
  }
  if (inActiveRange(pc)) {
    return 'inside-09/0A';
  }
  return 'post-fill';
}

function snapshotRegs(step, cpu, note = '') {
  return {
    step,
    note,
    pc: cpu.pc & 0xFFFFFF,
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    hl: cpu.hl & 0xFFFFFF,
    de: cpu.de & 0xFFFFFF,
    bc: cpu.bc & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    ix: cpu.ix & 0xFFFFFF,
    iy: cpu.iy & 0xFFFFFF,
  };
}

function traceRun(cpu, mem, budget) {
  const visitCounts = new Map();
  const order = [];
  const tail = [];
  const checkpoints = [snapshotRegs(0, cpu, 'entry')];
  const coverageSamples = [sampleVramCoverage(0, mem, 'entry')];
  const callChainHits = new Map();
  const loopPcSpCounts = new Map();
  const loopHitSamples = [];
  const activeUniqueSet = new Set();
  const stepRef = { current: 0 };
  const uninstall = installVramWriteTrace(cpu, stepRef);

  const initialSp = cpu.sp & 0xFFFFFF;
  let minSp = initialSp;
  let maxSp = initialSp;
  let executedSteps = 0;
  let stopReason = 'budget_exhausted';
  let error = null;
  let firstActiveHit = null;
  let firstLoopHit = null;
  let activeExit = null;
  let returnStep = null;
  let activeVisitCount = 0;
  let fillRangeVisits = 0;
  let vramWrites = null;

  try {
    while (executedSteps < budget) {
      const pc = cpu.pc & 0xFFFFFF;
      const sp = cpu.sp & 0xFFFFFF;
      minSp = Math.min(minSp, sp);
      maxSp = Math.max(maxSp, sp);

      recordVisit(visitCounts, order, pc);
      tail.push(pc);
      if (tail.length > TRACE_TAIL_LIMIT) {
        tail.shift();
      }

      const chainLabel = CALL_CHAIN_LABELS.get(pc);
      if (chainLabel && !callChainHits.has(pc)) {
        callChainHits.set(pc, {
          step: executedSteps,
          pc,
          sp,
          label: chainLabel,
        });
      }

      if (inActiveRange(pc)) {
        activeVisitCount += 1;
        activeUniqueSet.add(pc);
        if (!firstActiveHit) {
          firstActiveHit = {
            step: executedSteps,
            pc,
            sp,
          };
        }
        if (inFillRange(pc)) {
          fillRangeVisits += 1;
        }
      }

      if (!firstLoopHit && pc === LOOP_PC) {
        firstLoopHit = {
          step: executedSteps,
          pc,
          sp,
        };
      }

      if (pc === LOOP_PC) {
        loopPcSpCounts.set(sp, (loopPcSpCounts.get(sp) ?? 0) + 1);
        if (loopHitSamples.length < LOOP_HIT_SAMPLE_LIMIT) {
          loopHitSamples.push({
            step: executedSteps,
            sp,
            a: cpu.a & 0xFF,
            hl: cpu.hl & 0xFFFFFF,
            de: cpu.de & 0xFFFFFF,
            bc: cpu.bc & 0xFFFFFF,
          });
        }
      }

      if (pc === RETURN_SENTINEL) {
        stopReason = 'returned_sentinel';
        returnStep = executedSteps;
        break;
      }

      stepRef.current = executedSteps + 1;
      let result;
      try {
        result = cpu.step();
      } catch (traceError) {
        stopReason = 'error';
        error = traceError instanceof Error ? traceError.message : String(traceError);
        break;
      }

      executedSteps += 1;
      const afterPc = cpu.pc & 0xFFFFFF;
      const afterSp = cpu.sp & 0xFFFFFF;
      minSp = Math.min(minSp, afterSp);
      maxSp = Math.max(maxSp, afterSp);

      if (executedSteps % REG_CHECKPOINT_INTERVAL === 0) {
        checkpoints.push(snapshotRegs(executedSteps, cpu, traceNote(firstLoopHit, activeExit, afterPc)));
      }

      if (executedSteps % COVERAGE_INTERVAL === 0) {
        coverageSamples.push(sampleVramCoverage(executedSteps, mem, traceNote(firstLoopHit, activeExit, afterPc)));
      }

      if (inActiveRange(pc) && !inActiveRange(afterPc)) {
        activeExit = {
          step: executedSteps,
          fromPc: pc,
          pc: afterPc,
          spBefore: sp,
          spAfter: afterSp,
        };
        if (afterPc === RETURN_SENTINEL) {
          stopReason = 'returned_sentinel';
          returnStep = executedSteps;
        } else {
          stopReason = 'left_active_range';
        }
        break;
      }

      if (result === -1) {
        stopReason = 'halt';
        break;
      }
      if (result === -2) {
        stopReason = 'sleep';
        break;
      }
      if (afterPc === RETURN_SENTINEL) {
        stopReason = 'returned_sentinel';
        returnStep = executedSteps;
        break;
      }
    }
  } finally {
    vramWrites = uninstall();
  }

  if (checkpoints[checkpoints.length - 1].step !== executedSteps) {
    checkpoints.push(snapshotRegs(executedSteps, cpu, 'final'));
  }
  if (coverageSamples[coverageSamples.length - 1].step !== executedSteps) {
    coverageSamples.push(sampleVramCoverage(executedSteps, mem, activeExit ? 'exit/final' : 'final'));
  }

  return {
    executedSteps,
    stopReason,
    error,
    initialSp,
    finalPc: cpu.pc & 0xFFFFFF,
    finalSp: cpu.sp & 0xFFFFFF,
    minSp,
    maxSp,
    firstActiveHit,
    firstLoopHit,
    activeExit,
    returnStep,
    fillCompleted: Boolean(firstLoopHit && activeExit),
    totalUniqueBlocks: order.length,
    activeUniqueBlocks: activeUniqueSet.size,
    activeVisitCount,
    fillRangeVisits,
    loopPcVisits: visitCounts.get(LOOP_PC) ?? 0,
    callChainHits,
    loopPcSpCounts,
    loopHitSamples,
    visitCounts,
    order,
    tail,
    checkpoints,
    coverageSamples,
    vramWrites,
    vramContent: summarizeVramContent(mem),
  };
}

function topVisits(visitCounts, predicate = () => true, limit = 12) {
  return [...visitCounts.entries()]
    .filter(([pc]) => predicate(pc))
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return left[0] - right[0];
    })
    .slice(0, limit);
}

function topSpCounts(spCounts, limit = 12) {
  return [...spCounts.entries()]
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return left[0] - right[0];
    })
    .slice(0, limit);
}

function printCallChain(result) {
  console.log('Call chain first hits:');
  for (const item of CALL_CHAIN) {
    const hit = result.callChainHits.get(item.pc);
    if (!hit) {
      console.log(`  ${hex(item.pc)} (${item.label}): not hit`);
      continue;
    }
    console.log(`  ${hex(item.pc)} (${item.label}): step=${hit.step} SP=${hex(hit.sp)}`);
  }
  console.log('');
}

function printStackSummary(result) {
  const delta = result.finalSp - result.initialSp;
  console.log('Stack summary:');
  console.log(`  initialSP=${hex(result.initialSp)} finalSP=${hex(result.finalSp)} delta=${formatSignedDelta(delta)}`);
  console.log(`  minSP=${hex(result.minSp)} maxSP=${hex(result.maxSp)}`);
  console.log(`  recoveredToOrPastEntry=${result.finalSp >= result.initialSp ? 'yes' : 'no'}`);
  if (result.firstLoopHit) {
    console.log(`  first0x09EFDESP=${hex(result.firstLoopHit.sp)}`);
  }
  if (result.activeExit) {
    console.log(`  exitSP before=${hex(result.activeExit.spBefore)} after=${hex(result.activeExit.spAfter)}`);
  }
  console.log('');
}

function printCoverageSamples(result) {
  console.log('VRAM coverage checkpoints:');
  for (const sample of result.coverageSamples) {
    const percent = ((sample.nonZeroBytes / VRAM_SIZE) * 100).toFixed(2);
    const note = sample.note ? ` (${sample.note})` : '';
    console.log(
      `  step ${String(sample.step).padStart(6, ' ')}: ` +
      `nonZero=${sample.nonZeroBytes}/${VRAM_SIZE} (${percent}%) ` +
      `fullRows=${sample.fullRows}/${VRAM_HEIGHT} partialRows=${sample.partialRows}${note}`,
    );
  }
  console.log('');
}

function printLoopReentryPattern(result) {
  console.log('0x09EFDE re-entry pattern:');
  console.log(`  visits=${result.loopPcVisits} distinctSPs=${result.loopPcSpCounts.size}`);
  const spLeaders = topSpCounts(result.loopPcSpCounts);
  if (spLeaders.length === 0) {
    console.log('  SP counts: (none)');
  } else {
    console.log('  SP counts:');
    for (const [sp, visits] of spLeaders) {
      console.log(`    ${hex(sp)} x${visits}`);
    }
  }
  if (result.loopHitSamples.length === 0) {
    console.log('  early samples: (none)');
  } else {
    console.log('  early samples:');
    for (const sample of result.loopHitSamples) {
      console.log(
        `    step ${String(sample.step).padStart(6, ' ')} ` +
        `SP=${hex(sample.sp)} A=${hexByte(sample.a)} HL=${hex(sample.hl)} ` +
        `DE=${hex(sample.de)} BC=${hex(sample.bc)}`,
      );
    }
  }
  console.log('');
}

function printTopActiveBlocks(result) {
  console.log('Top active-range blocks:');
  const activeTop = topVisits(result.visitCounts, inActiveRange);
  if (activeTop.length === 0) {
    console.log('  (none)');
  } else {
    for (const [pc, visits] of activeTop) {
      console.log(`  ${hex(pc)}: visits=${visits}`);
    }
  }
  console.log('');
}

function printCheckpoints(result) {
  console.log('Register checkpoints:');
  for (const checkpoint of result.checkpoints) {
    const note = checkpoint.note ? ` (${checkpoint.note})` : '';
    console.log(
      `  step ${String(checkpoint.step).padStart(6, ' ')}: ` +
      `PC=${hex(checkpoint.pc)} A=${hexByte(checkpoint.a)} F=${hexByte(checkpoint.f)} ` +
      `HL=${hex(checkpoint.hl)} DE=${hex(checkpoint.de)} BC=${hex(checkpoint.bc)} ` +
      `SP=${hex(checkpoint.sp)} IX=${hex(checkpoint.ix)} IY=${hex(checkpoint.iy)}${note}`,
    );
  }
  console.log('');
}

function printVramSummary(result) {
  const { vramContent, vramWrites } = result;
  console.log('Final VRAM summary:');
  console.log(`  region=${hex(VRAM_BASE)}..${hex(VRAM_LAST)} (${VRAM_SIZE} bytes)`);
  console.log(`  nonZeroBytes=${vramContent.nonZeroBytes}/${VRAM_SIZE}`);
  console.log(`  fullRows=${vramContent.fullRows}/${VRAM_HEIGHT} partialRows=${vramContent.partialRows}`);
  console.log(`  firstNonZero=${hex(vramContent.firstAddr)} lastNonZero=${hex(vramContent.lastAddr)}`);
  console.log(`  firstZero=${hex(vramContent.firstZeroAddr)}`);
  console.log(`  head32=${vramContent.head32}`);
  console.log(`  tail32=${vramContent.tail32}`);
  console.log('');

  console.log('VRAM write trace summary:');
  console.log(`  events=${vramWrites.events} bytes=${vramWrites.bytes}`);
  console.log(`  firstAddr=${hex(vramWrites.firstAddr)} lastAddr=${hex(vramWrites.lastAddr)}`);
  if (vramWrites.samples.length === 0) {
    console.log('  samples: (none)');
  } else {
    console.log('  samples:');
    for (const sample of vramWrites.samples) {
      console.log(
        `    step ${String(sample.step).padStart(6, ' ')} ${hex(sample.pc)} ` +
        `${hex(sample.addr)} width=${sample.width} ${sample.before} -> ${sample.after}`,
      );
    }
  }
  console.log('');
}

function printTail(result) {
  console.log('Tail PCs:');
  console.log(`  ${result.tail.length ? result.tail.map((pc) => hex(pc)).join(' -> ') : '(none)'}`);
  console.log('');
}

function printTraceSummary(result) {
  console.log('========================================================================');
  console.log('Trace Summary');
  console.log('========================================================================');
  console.log(`Executed steps: ${result.executedSteps}/${STEP_BUDGET}`);
  console.log(`Stop reason:    ${result.stopReason}`);
  console.log(`Final PC:       ${hex(result.finalPc)}`);
  if (result.error) {
    console.log(`Error:          ${result.error}`);
  }
  console.log('');

  console.log(
    `First active-range hit: ` +
    `${result.firstActiveHit ? `step ${result.firstActiveHit.step} at ${hex(result.firstActiveHit.pc)} SP=${hex(result.firstActiveHit.sp)}` : 'no'}`,
  );
  console.log(
    `First ${hex(LOOP_PC)} hit: ` +
    `${result.firstLoopHit ? `step ${result.firstLoopHit.step} SP=${hex(result.firstLoopHit.sp)}` : 'no'}`,
  );
  console.log(
    `Exited ${hex(ACTIVE_RANGE_START)}..${hex(ACTIVE_RANGE_END - 1)}: ` +
    `${result.activeExit ? `yes at step ${result.activeExit.step} -> ${hex(result.activeExit.pc)} (from ${hex(result.activeExit.fromPc)})` : 'no'}`,
  );
  console.log(
    `Returned via sentinel ${hex(RETURN_SENTINEL)}: ` +
    `${result.returnStep !== null ? `yes at step ${result.returnStep}` : 'no'}`,
  );
  console.log(`Fill completed: ${result.fillCompleted ? 'yes' : 'no'}`);
  console.log(`Immediate block after exit: ${hex(result.activeExit?.pc)}`);
  console.log(
    `Unique blocks: total=${result.totalUniqueBlocks} active=${result.activeUniqueBlocks} ` +
    `activeVisits=${result.activeVisitCount} fillRangeVisits=${result.fillRangeVisits}`,
  );
  console.log('');

  printCallChain(result);
  printStackSummary(result);
  printCoverageSamples(result);
  printLoopReentryPattern(result);
  printTopActiveBlocks(result);
  printCheckpoints(result);
  printVramSummary(result);
  printTail(result);
}

function runScenario(runtime, bootMemory, bootCpuSnapshot) {
  runtime.mem.set(bootMemory);
  restoreCpu(runtime.cpu, bootCpuSnapshot);
  seedEntryState(runtime.cpu, runtime.mem);
  return traceRun(runtime.cpu, runtime.mem, STEP_BUDGET);
}

async function main() {
  const runtime = createRuntime();
  const bootSummary = coldBoot(runtime.executor, runtime.cpu, runtime.mem);
  const bootMemory = new Uint8Array(runtime.mem);
  const bootCpuSnapshot = snapshotCpu(runtime.cpu);

  console.log('Phase 240: 0x09EFDE 150K completion probe');
  console.log(`ROM: ${path.basename(ROM_PATH)} (${romBytes.length} bytes)`);
  console.log(`Transpiled blocks: ${path.basename(TRANSPILED_PATH)}`);
  console.log('Peripheral seed: pllDelay=2 timerInterrupt=false');
  console.log(
    `Entry seed: PC=${hex(ENTRY_PC)} A=${hexByte(0x1D)} IX=${hex(IX_BASE)} ` +
    `IY=${hex(IY_BASE)} MBASE=${hexByte(MBASE)}`,
  );
  console.log(`Budget: ${STEP_BUDGET} block steps from ${hex(ENTRY_PC)}`);
  console.log(`Active completion range: ${hex(ACTIVE_RANGE_START)}..${hex(ACTIVE_RANGE_END - 1)}`);
  console.log(`VRAM region: ${hex(VRAM_BASE)}..${hex(VRAM_LAST)} (${VRAM_SIZE} bytes)`);
  console.log('');

  console.log(
    `Cold boot summary: boot=${bootSummary.boot.steps}/${bootSummary.boot.termination} ` +
    `kernel=${bootSummary.kernel.steps}/${bootSummary.kernel.termination} ` +
    `post=${bootSummary.post.steps}/${bootSummary.post.termination}`,
  );
  console.log('');

  const result = runScenario(runtime, bootMemory, bootCpuSnapshot);
  printTraceSummary(result);
}

main().catch((error) => {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
});
