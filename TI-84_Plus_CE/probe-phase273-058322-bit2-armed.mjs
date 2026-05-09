#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_JS_PATH = path.join(__dirname, 'ROM.transpiled.js');
const TRANSPILED_GZ_PATH = path.join(__dirname, 'ROM.transpiled.js.gz');

const MEM_SIZE = 0x1000000;
const MEM_MASK = MEM_SIZE - 1;

const KERNEL_INIT_REQUEST_PC = 0x000280;
const KERNEL_INIT_FALLBACK_PC = 0x020028;
const KERNEL_INIT_STEPS = 5000;
const KERNEL_INIT_LOOP_LIMIT = 10000;

const STACK_TOP = 0xD1A87E;
const IX_BASE = 0xD1A860;
const IY_BASE = 0xD00080;
const IY_WINDOW_SIZE = 0x80;
const IY_BIT2_ADDR = 0xD00095;
const MBASE = 0xD0;
const RETURN_SENTINEL = 0x7FFFFE;

const D007E0 = 0xD007E0;
const D007E8 = 0xD007E8;
const D007FA = 0xD007FA;
const D00824 = 0xD00824;
const D0230F = 0xD0230F;

const DIRECT_GATE_ENTRY = 0x058322;
const EVENT_LOOP_ENTRY = 0x0582BC;

const TARGET_GATE = 0x058322;
const TARGET_ARMED_BLOCK = 0x058328;
const TARGET_CLEAR_BLOCK = 0x058344;
const TARGET_SPLITFLAG = 0x0800A0;
const TARGET_SCREEN_DRAW = 0x09EF20;
const TARGET_HISTORY_CLEAR = 0x0A2854;

const VRAM_BASE = 0xD40000;
const VRAM_END = 0xD52BFF;
const VRAM_SIZE = VRAM_END - VRAM_BASE + 1;

const EXPERIMENT_A_STEPS = 2000;
const EXPERIMENT_B_STEPS = 2000;
const EXPERIMENT_C_STEPS = 5000;
const SAMPLE_LIMIT = 32;

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles', 'pc',
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

function blockKey(pc, mode) {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function read24(mem, addr) {
  const base = addr & MEM_MASK;
  return (
    (mem[base] ?? 0) |
    ((mem[(base + 1) & MEM_MASK] ?? 0) << 8) |
    ((mem[(base + 2) & MEM_MASK] ?? 0) << 16)
  ) >>> 0;
}

function write24(mem, addr, value) {
  const base = addr & MEM_MASK;
  mem[base] = value & 0xFF;
  mem[(base + 1) & MEM_MASK] = (value >>> 8) & 0xFF;
  mem[(base + 2) & MEM_MASK] = (value >>> 16) & 0xFF;
}

function bytesAt(mem, addr, length) {
  const bytes = [];
  for (let index = 0; index < length; index += 1) {
    bytes.push(hexByte(mem[(addr + index) & MEM_MASK]));
  }
  return bytes.join(' ');
}

function normalizeBlocks(rawBlocks) {
  if (Array.isArray(rawBlocks)) {
    return Object.fromEntries(rawBlocks.filter((block) => block?.id).map((block) => [block.id, block]));
  }
  return rawBlocks ?? {};
}

function ensureTranspiledModule() {
  if (fs.existsSync(TRANSPILED_JS_PATH)) {
    return { modulePath: TRANSPILED_JS_PATH, tempModulePath: null, source: 'js' };
  }

  if (!fs.existsSync(TRANSPILED_GZ_PATH)) {
    throw new Error('Missing both ROM.transpiled.js and ROM.transpiled.js.gz.');
  }

  const tempModulePath = path.join(os.tmpdir(), `ti84-phase273-${process.pid}.mjs`);
  fs.writeFileSync(tempModulePath, gunzipSync(fs.readFileSync(TRANSPILED_GZ_PATH)));
  return { modulePath: tempModulePath, tempModulePath, source: 'gz' };
}

function cleanupTranspiledModule(assets) {
  if (!assets?.tempModulePath) {
    return;
  }
  try {
    fs.unlinkSync(assets.tempModulePath);
  } catch {}
}

async function loadBlocks() {
  const assets = ensureTranspiledModule();
  try {
    const romModule = await import(pathToFileURL(assets.modulePath).href);
    const rawBlocks =
      romModule.PRELIFTED_BLOCKS ??
      romModule.default?.PRELIFTED_BLOCKS ??
      romModule.default ??
      romModule;
    const blocks = normalizeBlocks(rawBlocks);
    if (!blocks || typeof blocks !== 'object' || Object.keys(blocks).length === 0) {
      throw new Error('Unable to resolve PRELIFTED_BLOCKS from transpiled ROM module.');
    }
    return { blocks, assets };
  } catch (error) {
    cleanupTranspiledModule(assets);
    throw error;
  }
}

function createMemory(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(romBytes.length, MEM_SIZE)));
  return mem;
}

function createCPU(memory, blocks, peripherals) {
  const executor = createExecutor(blocks, memory, { peripherals });
  const cpu = executor.cpu;

  cpu.run = (maxSteps, options = {}) => {
    const mode = options.mode ?? (cpu.madl ? 'adl' : 'z80');
    const result = executor.runFrom(cpu.pc & 0xFFFFFF, mode, {
      maxSteps,
      maxLoopIterations: options.maxLoopIterations ?? KERNEL_INIT_LOOP_LIMIT,
      onBlock: options.onBlock,
      onMissingBlock: options.onMissingBlock,
      onDynamicTarget: options.onDynamicTarget,
    });
    cpu.pc = (result.lastPc ?? cpu.pc) & 0xFFFFFF;
    cpu.madl = result.lastMode === 'adl' ? 1 : 0;
    return result;
  };

  return { cpu, executor, mem: memory };
}

function resolveKernelInitEntry(blocks) {
  const candidates = [
    {
      key: '000280:adl',
      pc: KERNEL_INIT_REQUEST_PC,
      mode: 'adl',
      note: 'direct lifted block for requested PC 0x000280',
    },
    {
      key: '000280:z80',
      pc: KERNEL_INIT_REQUEST_PC,
      mode: 'z80',
      note: 'z80 lifted block for requested PC 0x000280',
    },
    {
      key: '020028:adl',
      pc: KERNEL_INIT_FALLBACK_PC,
      mode: 'adl',
      note: 'fallback lifted entry corresponding to kernelInit in phase272-style probes',
    },
  ];

  for (const candidate of candidates) {
    if (blocks[candidate.key]) {
      return candidate;
    }
  }

  throw new Error('Unable to locate a lifted kernelInit block for 0x000280 or 0x020028.');
}

function snapshotCpu(cpu) {
  return Object.fromEntries(CPU_SNAPSHOT_FIELDS.map((field) => [field, cpu[field]]));
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_SNAPSHOT_FIELDS) {
    cpu[field] = snapshot[field];
  }
}

function snapshotRuntime(cpu, mem) {
  return {
    cpu: snapshotCpu(cpu),
    memory: new Uint8Array(mem),
  };
}

function restoreRuntime(cpu, mem, snapshot) {
  mem.set(snapshot.memory);
  restoreCpu(cpu, snapshot.cpu);
}

function prepareExperimentState(cpu, mem, entryPc) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.im = 0;
  cpu.i = 0;
  cpu.madl = 1;
  cpu.mbase = MBASE;
  cpu._iy = IY_BASE;
  cpu._ix = IX_BASE;
  cpu.f = 0x40;
  cpu.b = 3;

  mem[D0230F & MEM_MASK] = 0x3F;
  mem[D007E0 & MEM_MASK] = 0x49;
  write24(mem, D007E8, 0x06C546);

  cpu.sp = (STACK_TOP - 3) & 0xFFFFFF;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
  write24(mem, cpu.sp, RETURN_SENTINEL);
  write24(mem, D007FA, cpu.sp);

  cpu.pc = entryPc & 0xFFFFFF;
}

function snapshotRamWatch(mem) {
  return {
    d007e0: mem[D007E0 & MEM_MASK] & 0xFF,
    d007e8: read24(mem, D007E8),
    d007e8Bytes: bytesAt(mem, D007E8, 3),
    d00824: mem[D00824 & MEM_MASK] & 0xFF,
  };
}

function snapshotIyWindow(mem) {
  return new Uint8Array(mem.slice(IY_BASE, IY_BASE + IY_WINDOW_SIZE));
}

function installMemoryWatcher(cpu, mem) {
  const watchedAddrs = new Set([
    D007E0 & MEM_MASK,
    D007E8 & MEM_MASK,
    (D007E8 + 1) & MEM_MASK,
    (D007E8 + 2) & MEM_MASK,
    D00824 & MEM_MASK,
  ]);

  let currentStep = 0;
  let currentPc = 0;
  let currentMode = 'adl';

  let vramByteChanges = 0;
  let vramNonZeroWrites = 0;
  let vramFirstAddr = null;
  let vramLastAddr = null;
  const vramSamples = [];
  const ramWrites = [];

  const originalWrite8 = cpu.write8.bind(cpu);
  const originalWrite16 = cpu.write16.bind(cpu);
  const originalWrite24 = cpu.write24.bind(cpu);

  function recordByte(kind, startAddr, addr, before, after) {
    if (before === after) {
      return;
    }

    const entry = {
      step: currentStep,
      pc: currentPc & 0xFFFFFF,
      mode: currentMode,
      kind,
      startAddr: startAddr & 0xFFFFFF,
      addr: addr & 0xFFFFFF,
      oldValue: before & 0xFF,
      newValue: after & 0xFF,
    };

    if (entry.addr >= VRAM_BASE && entry.addr <= VRAM_END) {
      vramByteChanges += 1;
      if (entry.newValue !== 0) {
        vramNonZeroWrites += 1;
      }
      if (vramFirstAddr === null) {
        vramFirstAddr = entry.addr;
      }
      vramLastAddr = entry.addr;
      if (vramSamples.length < SAMPLE_LIMIT) {
        vramSamples.push(entry);
      }
    }

    if (watchedAddrs.has(entry.addr & MEM_MASK)) {
      ramWrites.push(entry);
    }
  }

  function wrapWrite(kind, width, invoke, addr) {
    const base = addr & 0xFFFFFF;
    const before = [];
    for (let index = 0; index < width; index += 1) {
      before.push(mem[(base + index) & MEM_MASK] & 0xFF);
    }
    invoke();
    for (let index = 0; index < width; index += 1) {
      const byteAddr = (base + index) & 0xFFFFFF;
      const after = mem[byteAddr & MEM_MASK] & 0xFF;
      recordByte(kind, base, byteAddr, before[index], after);
    }
  }

  cpu.write8 = (addr, value) => wrapWrite('write8', 1, () => originalWrite8(addr, value), addr);
  cpu.write16 = (addr, value) => wrapWrite('write16', 2, () => originalWrite16(addr, value), addr);
  cpu.write24 = (addr, value) => wrapWrite('write24', 3, () => originalWrite24(addr, value), addr);

  return {
    ramWrites,
    vramSamples,
    setContext(context) {
      currentStep = context.step;
      currentPc = context.pc;
      currentMode = context.mode;
    },
    getSummary() {
      return {
        vramByteChanges,
        vramNonZeroWrites,
        vramFirstAddr,
        vramLastAddr,
        vramSamples: vramSamples.slice(),
        ramWrites: ramWrites.slice(),
      };
    },
    restore() {
      cpu.write8 = originalWrite8;
      cpu.write16 = originalWrite16;
      cpu.write24 = originalWrite24;
    },
  };
}

function resolveNextMode(meta, returnedPc, currentMode) {
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

function runTrace(executor, cpu, options) {
  const entry = options.entry & 0xFFFFFF;
  const maxSteps = options.maxSteps;
  const stopPc = options.stopPc ?? null;
  const watcher = options.watcher ?? null;

  let pc = entry;
  let mode = options.mode ?? 'adl';
  let steps = 0;
  let termination = 'max_steps';
  let lastPc = pc;
  let lastMode = mode;
  let error = null;

  const missingBlocks = [];
  const visitedSequence = [];
  const blockVisits = new Map();

  while (steps < maxSteps) {
    cpu.madl = mode === 'adl' ? 1 : 0;
    cpu.pc = pc;
    cpu._currentBlockPc = pc;

    const key = blockKey(pc, mode);
    const fn = executor.compiledBlocks[key];
    const meta = executor.blockMeta[key];

    if (!fn) {
      termination = 'missing_block';
      missingBlocks.push({ step: steps + 1, pc, mode });
      lastPc = pc;
      lastMode = mode;
      break;
    }

    visitedSequence.push({ step: steps + 1, pc, mode });
    blockVisits.set(key, (blockVisits.get(key) ?? 0) + 1);
    watcher?.setContext({ step: steps + 1, pc, mode });

    let result;
    try {
      result = fn(cpu);
    } catch (caught) {
      termination = 'error';
      error = caught;
      lastPc = pc;
      lastMode = mode;
      break;
    }

    steps += 1;

    if (result === undefined || result === null) {
      termination = 'no_return';
      lastPc = pc;
      lastMode = mode;
      break;
    }

    if (typeof result !== 'number') {
      termination = 'non_numeric_return';
      lastPc = pc;
      lastMode = mode;
      break;
    }

    if (result < 0) {
      termination = result === -1 ? 'halt' : 'sleep';
      lastPc = pc;
      lastMode = mode;
      break;
    }

    const nextPc = result & 0xFFFFFF;
    const nextMode = resolveNextMode(meta, result, mode);
    lastPc = nextPc;
    lastMode = nextMode;

    if (stopPc !== null && nextPc === (stopPc & 0xFFFFFF)) {
      termination = 'returned_sentinel';
      break;
    }

    pc = nextPc;
    mode = nextMode;
  }

  cpu.pc = lastPc & 0xFFFFFF;
  cpu.madl = lastMode === 'adl' ? 1 : 0;

  return {
    steps,
    termination,
    lastPc,
    lastMode,
    error,
    missingBlocks,
    visitedSequence,
    uniqueBlockCount: blockVisits.size,
  };
}

function firstHitStep(sequence, pc) {
  const hit = sequence.find((entry) => entry.pc === pc);
  return hit ? hit.step : null;
}

function analyzeGatePath(visitedSequence) {
  const gateIndex = visitedSequence.findIndex((entry) => entry.pc === TARGET_GATE);
  if (gateIndex === -1) {
    return {
      gateReached: false,
      gateStep: null,
      path: 'gate_not_reached',
      hits: {
        armedBlock: null,
        clearBlock: null,
        splitFlag: null,
        screenDraw: null,
        historyClear: null,
      },
    };
  }

  const afterGate = visitedSequence.slice(gateIndex);
  const hits = {
    armedBlock: firstHitStep(afterGate, TARGET_ARMED_BLOCK),
    clearBlock: firstHitStep(afterGate, TARGET_CLEAR_BLOCK),
    splitFlag: firstHitStep(afterGate, TARGET_SPLITFLAG),
    screenDraw: firstHitStep(afterGate, TARGET_SCREEN_DRAW),
    historyClear: firstHitStep(afterGate, TARGET_HISTORY_CLEAR),
  };

  let path = 'unknown';
  if (hits.historyClear !== null && (hits.screenDraw === null || hits.historyClear < hits.screenDraw)) {
    path = 'clear/history path via 0x0A2854';
  } else if (hits.screenDraw !== null && (hits.historyClear === null || hits.screenDraw < hits.historyClear)) {
    path = 'screen-draw path via 0x09EF20';
  }

  return {
    gateReached: true,
    gateStep: visitedSequence[gateIndex].step,
    path,
    hits,
  };
}

function summarizeVram(before, mem) {
  let changedBytes = 0;
  let changedToNonZero = 0;
  let firstChangedAddr = null;
  let lastChangedAddr = null;
  let postNonZeroBytes = 0;
  let firstPostNonZeroAddr = null;
  let lastPostNonZeroAddr = null;
  const samples = [];

  for (let offset = 0; offset < VRAM_SIZE; offset += 1) {
    const addr = VRAM_BASE + offset;
    const after = mem[addr & MEM_MASK] & 0xFF;
    const beforeValue = before[offset] & 0xFF;

    if (after !== 0) {
      postNonZeroBytes += 1;
      if (firstPostNonZeroAddr === null) {
        firstPostNonZeroAddr = addr;
      }
      lastPostNonZeroAddr = addr;
    }

    if (beforeValue === after) {
      continue;
    }

    changedBytes += 1;
    if (after !== 0) {
      changedToNonZero += 1;
    }
    if (firstChangedAddr === null) {
      firstChangedAddr = addr;
    }
    lastChangedAddr = addr;
    if (samples.length < SAMPLE_LIMIT) {
      samples.push({
        addr,
        before: beforeValue,
        after,
      });
    }
  }

  return {
    changedBytes,
    changedToNonZero,
    firstChangedAddr,
    lastChangedAddr,
    postNonZeroBytes,
    firstPostNonZeroAddr,
    lastPostNonZeroAddr,
    samples,
  };
}

function diffIyWindow(before, mem) {
  const changes = [];
  for (let offset = 0; offset < IY_WINDOW_SIZE; offset += 1) {
    const addr = (IY_BASE + offset) & MEM_MASK;
    const after = mem[addr] & 0xFF;
    const beforeValue = before[offset] & 0xFF;
    if (beforeValue !== after) {
      changes.push({
        offset,
        addr: IY_BASE + offset,
        before: beforeValue,
        after,
      });
    }
  }
  return changes;
}

function runExperiment(runtime, kernelSnapshot, config) {
  const { cpu, mem, executor } = runtime;
  restoreRuntime(cpu, mem, kernelSnapshot);
  prepareExperimentState(cpu, mem, config.entry);

  if (config.armBit2) {
    mem[IY_BIT2_ADDR & MEM_MASK] |= 0x04;
  } else {
    mem[IY_BIT2_ADDR & MEM_MASK] &= ~0x04;
  }

  const seededBit2 = mem[IY_BIT2_ADDR & MEM_MASK] & 0xFF;
  const vramBefore = new Uint8Array(mem.slice(VRAM_BASE, VRAM_END + 1));
  const iyBefore = snapshotIyWindow(mem);
  const ramBefore = snapshotRamWatch(mem);

  const watcher = installMemoryWatcher(cpu, mem);
  let trace;
  try {
    trace = runTrace(executor, cpu, {
      entry: config.entry,
      mode: 'adl',
      maxSteps: config.maxSteps,
      stopPc: RETURN_SENTINEL,
      watcher,
    });
  } finally {
    watcher.restore();
  }

  return {
    ...config,
    seededBit2,
    trace,
    gate: analyzeGatePath(trace.visitedSequence),
    ramBefore,
    ramAfter: snapshotRamWatch(mem),
    iyChanges: diffIyWindow(iyBefore, mem),
    iyBit2After: mem[IY_BIT2_ADDR & MEM_MASK] & 0xFF,
    vram: summarizeVram(vramBefore, mem),
    writes: watcher.getSummary(),
  };
}

function printRamWatch(before, after, writes) {
  console.log('RAM watches:');
  console.log(`  D007E0: before=${hexByte(before.d007e0)} after=${hexByte(after.d007e0)}`);
  console.log(`  D007E8: before=${hex(before.d007e8)} [${before.d007e8Bytes}] after=${hex(after.d007e8)} [${after.d007e8Bytes}]`);
  console.log(`  D00824: before=${hexByte(before.d00824)} after=${hexByte(after.d00824)}`);
  console.log(`  watched writes (${writes.length}):`);
  if (writes.length === 0) {
    console.log('    none');
  } else {
    for (const entry of writes) {
      console.log(
        `    step=${String(entry.step).padStart(4, '0')} pc=${hex(entry.pc)}:${entry.mode} ` +
        `${entry.kind} addr=${hex(entry.addr)} old=${hexByte(entry.oldValue)} new=${hexByte(entry.newValue)}`
      );
    }
  }
}

function printIyChanges(changes, seededBit2, finalBit2) {
  console.log('IY flag window:');
  console.log(`  IY base=${hex(IY_BASE)} watched=${IY_WINDOW_SIZE} bytes`);
  console.log(`  IY+0x15 seed=${hexByte(seededBit2)} final=${hexByte(finalBit2)}`);
  console.log(`  changed bytes (${changes.length}):`);
  if (changes.length === 0) {
    console.log('    none');
  } else {
    for (const change of changes) {
      console.log(
        `    IY+${hex(change.offset, 2)} @ ${hex(change.addr)} ${hexByte(change.before)} -> ${hexByte(change.after)}`
      );
    }
  }
}

function printVramSummary(vram, writes) {
  console.log('VRAM changes:');
  console.log(`  region=${hex(VRAM_BASE)}..${hex(VRAM_END)} (${VRAM_SIZE} bytes)`);
  console.log(`  changed bytes=${vram.changedBytes}`);
  console.log(`  changed to non-zero=${vram.changedToNonZero}`);
  console.log(`  post-run non-zero bytes=${vram.postNonZeroBytes}`);
  console.log(`  first changed=${hex(vram.firstChangedAddr)} last changed=${hex(vram.lastChangedAddr)}`);
  console.log(`  first post non-zero=${hex(vram.firstPostNonZeroAddr)} last post non-zero=${hex(vram.lastPostNonZeroAddr)}`);
  console.log(`  write-captured byte changes=${writes.vramByteChanges}`);
  console.log(`  write-captured non-zero writes=${writes.vramNonZeroWrites}`);
  console.log(`  first write-captured addr=${hex(writes.vramFirstAddr)} last write-captured addr=${hex(writes.vramLastAddr)}`);
  console.log(`  diff samples (${vram.samples.length}):`);
  if (vram.samples.length === 0) {
    console.log('    none');
  } else {
    for (const sample of vram.samples) {
      console.log(`    ${hex(sample.addr)} ${hexByte(sample.before)} -> ${hexByte(sample.after)}`);
    }
  }
  console.log(`  write samples (${writes.vramSamples.length}):`);
  if (writes.vramSamples.length === 0) {
    console.log('    none');
  } else {
    for (const sample of writes.vramSamples) {
      console.log(
        `    step=${String(sample.step).padStart(4, '0')} pc=${hex(sample.pc)}:${sample.mode} ` +
        `${sample.kind} addr=${hex(sample.addr)} old=${hexByte(sample.oldValue)} new=${hexByte(sample.newValue)}`
      );
    }
  }
}

function printBlockTrace(trace) {
  console.log(`Block trace (${trace.visitedSequence.length} blocks):`);
  if (trace.visitedSequence.length === 0) {
    console.log('  none');
    return;
  }
  for (const visit of trace.visitedSequence) {
    console.log(`  [${String(visit.step).padStart(4, '0')}] ${hex(visit.pc)}:${visit.mode}`);
  }
}

function printExperiment(result) {
  console.log(`=== ${result.label} ===`);
  console.log(
    `entry=${hex(result.entry)} maxSteps=${result.maxSteps} bit2=${result.armBit2 ? 'SET' : 'CLEAR'} ` +
    `IY+0x15=${hexByte(result.seededBit2)}`
  );
  console.log(
    `termination=${result.trace.termination} steps=${result.trace.steps} ` +
    `lastPc=${hex(result.trace.lastPc)}:${result.trace.lastMode}`
  );
  console.log(`uniqueBlocks=${result.trace.uniqueBlockCount}`);
  if (result.trace.error) {
    console.log(`error=${result.trace.error?.stack ?? String(result.trace.error)}`);
  }
  console.log(`reached 0x058322=${result.gate.gateReached}${result.gate.gateStep ? ` at step ${result.gate.gateStep}` : ''}`);
  console.log(`path=${result.gate.path}`);
  console.log('relevant hits after first 0x058322:');
  console.log(`  0x058328=${result.gate.hits.armedBlock ?? 'none'}`);
  console.log(`  0x058344=${result.gate.hits.clearBlock ?? 'none'}`);
  console.log(`  0x0800A0=${result.gate.hits.splitFlag ?? 'none'}`);
  console.log(`  0x09EF20=${result.gate.hits.screenDraw ?? 'none'}`);
  console.log(`  0x0A2854=${result.gate.hits.historyClear ?? 'none'}`);
  if (result.trace.missingBlocks.length > 0) {
    console.log(`missingBlocks=${result.trace.missingBlocks.length}`);
    for (const missing of result.trace.missingBlocks) {
      console.log(`  step=${missing.step} pc=${hex(missing.pc)}:${missing.mode}`);
    }
  }
  printRamWatch(result.ramBefore, result.ramAfter, result.writes.ramWrites);
  printIyChanges(result.iyChanges, result.seededBit2, result.iyBit2After);
  printVramSummary(result.vram, result.writes);
  printBlockTrace(result.trace);
  console.log('');
}

async function main() {
  console.log('Phase 273 probe: 0x058322 with BIT 2,(IY+21) armed');
  console.log('');

  const romBytes = fs.readFileSync(ROM_PATH);
  const { blocks, assets } = await loadBlocks();

  try {
    const kernelInitEntry = resolveKernelInitEntry(blocks);
    const memory = createMemory(romBytes);
    const peripherals = createPeripheralBus({ timerInterrupt: false });
    const runtime = createCPU(memory, blocks, peripherals);
    const { cpu } = runtime;

    cpu.pc = kernelInitEntry.pc & 0xFFFFFF;
    cpu.sp = STACK_TOP;
    cpu.ix = IX_BASE;
    cpu.iy = IY_BASE;
    cpu.mbase = MBASE;
    cpu.madl = kernelInitEntry.mode === 'adl' ? 1 : 0;
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu.im = 0;
    cpu.i = 0;
    cpu.f = 0x40;

    const kernelInit = cpu.run(KERNEL_INIT_STEPS, {
      mode: kernelInitEntry.mode,
      maxLoopIterations: KERNEL_INIT_LOOP_LIMIT,
    });

    const kernelSnapshot = snapshotRuntime(cpu, memory);

    console.log(`ROM bytes=${romBytes.length}`);
    console.log(`Transpiled source=${assets.source}`);
    console.log(`Block count=${Object.keys(blocks).length}`);
    console.log(
      `kernelInit requested=${hex(KERNEL_INIT_REQUEST_PC)} used=${hex(kernelInitEntry.pc)}:${kernelInitEntry.mode} ` +
      `note="${kernelInitEntry.note}"`
    );
    console.log(
      `kernelInit result: steps=${kernelInit.steps} termination=${kernelInit.termination} ` +
      `lastPc=${hex(kernelInit.lastPc)}:${kernelInit.lastMode}`
    );
    console.log('');

    const experiments = [
      {
        label: 'Experiment A: direct 0x058322 with BIT 2 clear',
        entry: DIRECT_GATE_ENTRY,
        maxSteps: EXPERIMENT_A_STEPS,
        armBit2: false,
      },
      {
        label: 'Experiment B: direct 0x058322 with BIT 2 set',
        entry: DIRECT_GATE_ENTRY,
        maxSteps: EXPERIMENT_B_STEPS,
        armBit2: true,
      },
      {
        label: 'Experiment C: 0x0582BC event-loop entry with BIT 2 set',
        entry: EVENT_LOOP_ENTRY,
        maxSteps: EXPERIMENT_C_STEPS,
        armBit2: true,
      },
    ];

    for (const experiment of experiments) {
      printExperiment(runExperiment(runtime, kernelSnapshot, experiment));
    }
  } finally {
    cleanupTranspiledModule(assets);
  }
}

main().catch((error) => {
  console.error(error?.stack ?? String(error));
  process.exitCode = 1;
});
