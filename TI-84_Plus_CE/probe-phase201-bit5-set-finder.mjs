#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import * as cpuRuntime from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MEM_SIZE = 0x1000000;
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MBASE = 0xD0;
const IY_ADDR = 0xD00080;
const IX_ADDR = 0xD1A860;
const STACK_TOP = 0xD1A87E;
const IY_PLUS_68_ADDR = 0xD000C4;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const MEM_INIT_ENTRY = 0x09DEE0;
const TRACE_ENTRY = 0x08C2AD;

const MEMINIT_RET = 0x7FFFF6;
const TRACE_RET = 0x7FFFF0;

const BOOT_MAX_STEPS = 20000;
const KERNEL_INIT_MAX_STEPS = 100000;
const POST_INIT_MAX_STEPS = 100;
const MEM_INIT_MAX_STEPS = 100000;
const TRACE_MAX_STEPS = 200;
const OS_MAX_LOOP_ITERATIONS = 8192;
const TRACE_STACK_DEPTH = 16;

const RAM_DIFF_START = 0xD00000;
const RAM_DIFF_END = 0xD40000;
const RAM_DIFF_LIMIT = 32;

const ROM_BYTES = fs.readFileSync(ROM_PATH);

if (!fs.existsSync(TRANSPILED_PATH)) {
  throw new Error(
    'Missing TI-84_Plus_CE/ROM.transpiled.js. Run node scripts/transpile-ti84-rom.mjs first.',
  );
}

const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xFF, 2);
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => hexByte(value)).join(' ');
}

function surroundingBytes(buffer, address, matchLength, radius = 8) {
  const start = Math.max(0, address - radius);
  const end = Math.min(buffer.length, address + matchLength + radius);
  return bytesToHex(buffer.subarray(start, end));
}

function matchBytes(buffer, address, pattern) {
  if (address < 0 || address + pattern.length > buffer.length) return false;
  for (let index = 0; index < pattern.length; index += 1) {
    if (buffer[address + index] !== pattern[index]) return false;
  }
  return true;
}

function scanExact(buffer, pattern, makeContext, options = {}) {
  const matches = [];
  for (let address = 0; address <= buffer.length - pattern.length; address += 1) {
    if (!matchBytes(buffer, address, pattern)) continue;
    if (options.skipIfPrefixedByEd && address > 0 && buffer[address - 1] === 0xED) continue;
    matches.push({
      address: hex(address),
      bytes: surroundingBytes(buffer, address, pattern.length),
      context: makeContext(address),
    });
  }
  return matches;
}

function findWindowMatch(buffer, start, end, patterns) {
  let best = null;
  for (let address = start; address <= end; address += 1) {
    for (const pattern of patterns) {
      if (!matchBytes(buffer, address, pattern.bytes)) continue;
      if (pattern.skipIfPrefixedByEd && address > 0 && buffer[address - 1] === 0xED) continue;
      if (!best || pattern.bytes.length > best.pattern.bytes.length) {
        best = { address, pattern };
      }
    }
  }
  return best;
}

function scanOrSites(buffer) {
  const sourcePatterns = [
    { bytes: Uint8Array.from([0xED, 0x3A, 0xC4, 0x00, 0xD0]), label: 'ed ld a, (0xD000C4)' },
    { bytes: Uint8Array.from([0x3A, 0xC4, 0x00, 0xD0]), label: 'ld a, (0xD000C4)', skipIfPrefixedByEd: true },
    { bytes: Uint8Array.from([0xFD, 0x7E, 0x44]), label: 'ld a, (iy+0x44)' },
  ];
  const sinkPatterns = [
    { bytes: Uint8Array.from([0xED, 0x32, 0xC4, 0x00, 0xD0]), label: 'ed ld (0xD000C4), a' },
    { bytes: Uint8Array.from([0x32, 0xC4, 0x00, 0xD0]), label: 'ld (0xD000C4), a', skipIfPrefixedByEd: true },
    { bytes: Uint8Array.from([0xFD, 0x77, 0x44]), label: 'ld (iy+0x44), a' },
  ];
  const hits = [];
  const seen = new Set();
  const searchRadius = 24;

  for (let address = 0; address <= buffer.length - 2; address += 1) {
    if (buffer[address] !== 0xF6) continue;
    const mask = buffer[address + 1];
    if ((mask & 0x20) === 0) continue;

    const source = findWindowMatch(
      buffer,
      Math.max(0, address - searchRadius),
      Math.max(0, address - 1),
      sourcePatterns,
    );
    const sink = findWindowMatch(
      buffer,
      Math.min(buffer.length - 1, address + 2),
      Math.min(buffer.length - 1, address + 2 + searchRadius),
      sinkPatterns,
    );
    if (!source || !sink || source.address >= address || sink.address <= address) continue;

    const key = address;
    if (seen.has(key)) continue;
    seen.add(key);

    hits.push({
      address: hex(address),
      bytes: surroundingBytes(buffer, address, 2),
      context: `or ${hexByte(mask)} between ${source.pattern.label} and ${sink.pattern.label}`,
    });
  }

  return hits;
}

function scanPartA(buffer) {
  const set5Sites = scanExact(
    buffer,
    Uint8Array.from([0xFD, 0xCB, 0x44, 0xEE]),
    () => 'SET 5, (IY+0x44) exact opcode',
  );

  const ldSites = [];
  for (let address = 0; address <= buffer.length - 4; address += 1) {
    if (buffer[address] !== 0xFD || buffer[address + 1] !== 0x36 || buffer[address + 2] !== 0x44) {
      continue;
    }
    const immediate = buffer[address + 3];
    if ((immediate & 0x20) === 0) continue;
    ldSites.push({
      address: hex(address),
      bytes: surroundingBytes(buffer, address, 4),
      context: `ld (iy+0x44), ${hexByte(immediate)}`,
    });
  }

  const directWriteSites = [
    ...scanExact(
      buffer,
      Uint8Array.from([0xED, 0x32, 0xC4, 0x00, 0xD0]),
      () => 'ED 32 direct write to 0xD000C4',
    ),
    ...scanExact(
      buffer,
      Uint8Array.from([0x32, 0xC4, 0x00, 0xD0]),
      () => '32 direct write to 0xD000C4',
      { skipIfPrefixedByEd: true },
    ),
  ];

  return {
    set5Sites,
    orSites: scanOrSites(buffer),
    ldSites,
    directWriteSites,
  };
}

function write24(mem, addr, value) {
  const a = addr & 0xFFFFFF;
  mem[a] = value & 0xFF;
  mem[a + 1] = (value >>> 8) & 0xFF;
  mem[a + 2] = (value >>> 16) & 0xFF;
}

function createMemory() {
  return new Uint8Array(MEM_SIZE);
}

function loadROM(mem) {
  mem.set(ROM_BYTES.subarray(0, Math.min(mem.length, ROM_BYTES.length)));
}

function createCPU(mem) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = cpuRuntime.createExecutor(BLOCKS, mem, { peripherals });
  return { cpu: executor.cpu, executor };
}

function makeSentinelError(hit, pc) {
  const error = new Error('__PHASE201_SENTINEL__');
  error.isSentinel = true;
  error.hit = hit;
  error.pc = pc & 0xFFFFFF;
  return error;
}

function runUntilHit(executor, entry, mode, sentinels, maxSteps, maxLoopIterations, handlers = {}) {
  let steps = 0;
  let lastPc = entry & 0xFFFFFF;
  let lastMode = mode;

  try {
    const result = executor.runFrom(entry, mode, {
      maxSteps,
      maxLoopIterations,
      onBlock(pc, blockMode, meta, step) {
        lastPc = pc & 0xFFFFFF;
        lastMode = blockMode ?? lastMode;
        steps = Math.max(steps, (step ?? 0) + 1);
        if (handlers.onBlock) handlers.onBlock(pc, blockMode, meta, step);
        for (const [name, target] of Object.entries(sentinels)) {
          if (lastPc === target) throw makeSentinelError(name, lastPc);
        }
      },
      onMissingBlock(pc, blockMode, step) {
        lastPc = pc & 0xFFFFFF;
        lastMode = blockMode ?? lastMode;
        steps = Math.max(steps, (step ?? 0) + 1);
        if (handlers.onMissingBlock) handlers.onMissingBlock(pc, blockMode, step);
        for (const [name, target] of Object.entries(sentinels)) {
          if (lastPc === target) throw makeSentinelError(name, lastPc);
        }
      },
    });

    return {
      hit: null,
      steps: Math.max(steps, result.steps ?? 0),
      lastPc: (result.lastPc ?? lastPc) & 0xFFFFFF,
      lastMode: result.lastMode ?? lastMode,
      termination: result.termination ?? null,
      errorMessage: result.error ? (result.error.stack || String(result.error)) : null,
    };
  } catch (error) {
    if (error?.isSentinel) {
      return {
        hit: error.hit,
        steps,
        lastPc: error.pc,
        lastMode,
        termination: 'sentinel',
        errorMessage: null,
      };
    }

    return {
      hit: null,
      steps,
      lastPc,
      lastMode,
      termination: 'exception',
      errorMessage: error?.stack || String(error),
    };
  }
}

function resetOsState(cpu, mem, stackTop = STACK_TOP) {
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
  cpu.sp = stackTop;
  mem.fill(0xFF, Math.max(0, stackTop - 0x60), Math.min(mem.length, stackTop + 0x20));
}

function coldBoot(executor, cpu, mem) {
  executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: KERNEL_INIT_MAX_STEPS,
    maxLoopIterations: 10000,
  });

  cpu.mbase = MBASE;
  cpu.iy = IY_ADDR;
  cpu.hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: POST_INIT_MAX_STEPS,
    maxLoopIterations: 32,
  });
}

function runMemInit(executor, cpu, mem) {
  resetOsState(cpu, mem, STACK_TOP);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);
  return runUntilHit(
    executor,
    MEM_INIT_ENTRY,
    'adl',
    { ret: MEMINIT_RET },
    MEM_INIT_MAX_STEPS,
    OS_MAX_LOOP_ITERATIONS,
  );
}

function snapshotCpu(cpu) {
  return {
    a: cpu.a,
    f: cpu.f,
    bc: cpu.bc,
    de: cpu.de,
    hl: cpu.hl,
    ix: cpu.ix,
    iy: cpu.iy,
    sp: cpu.sp,
    i: cpu.i,
    im: cpu.im,
    iff1: cpu.iff1,
    iff2: cpu.iff2,
    madl: cpu.madl,
    mbase: cpu.mbase,
    halted: cpu.halted,
    a2: cpu._a2,
    f2: cpu._f2,
    bc2: cpu._bc2,
    de2: cpu._de2,
    hl2: cpu._hl2,
  };
}

function restoreCpu(cpu, snapshot) {
  cpu.a = snapshot.a;
  cpu.f = snapshot.f;
  cpu.bc = snapshot.bc;
  cpu.de = snapshot.de;
  cpu.hl = snapshot.hl;
  cpu.ix = snapshot.ix;
  cpu.iy = snapshot.iy;
  cpu.sp = snapshot.sp;
  cpu.i = snapshot.i;
  cpu.im = snapshot.im;
  cpu.iff1 = snapshot.iff1;
  cpu.iff2 = snapshot.iff2;
  cpu.madl = snapshot.madl;
  cpu.mbase = snapshot.mbase;
  cpu.halted = snapshot.halted;
  cpu._a2 = snapshot.a2;
  cpu._f2 = snapshot.f2;
  cpu._bc2 = snapshot.bc2;
  cpu._de2 = snapshot.de2;
  cpu._hl2 = snapshot.hl2;
}

function createBaseline() {
  const mem = createMemory();
  loadROM(mem);
  const { cpu, executor } = createCPU(mem);
  coldBoot(executor, cpu, mem);
  const memInit = runMemInit(executor, cpu, mem);
  if (memInit.hit !== 'ret') {
    throw new Error(`memInit did not return cleanly: ${memInit.termination}`);
  }
  return {
    baselineMem: new Uint8Array(mem),
    cpuSnapshot: snapshotCpu(cpu),
  };
}

function pushSentinelChain(mem, cpu, depth = TRACE_STACK_DEPTH) {
  for (let index = 0; index < depth; index += 1) {
    cpu.sp -= 3;
    write24(mem, cpu.sp, TRACE_RET);
  }
}

function decodeFlags(f) {
  const value = f & 0xFF;
  return {
    f: hexByte(value),
    s: Boolean(value & 0x80),
    z: Boolean(value & 0x40),
    h: Boolean(value & 0x10),
    pv: Boolean(value & 0x04),
    n: Boolean(value & 0x02),
    c: Boolean(value & 0x01),
  };
}

function captureRegisters(cpu) {
  return {
    a: hexByte(cpu.a),
    f: hexByte(cpu.f),
    flags: decodeFlags(cpu.f),
    bc: hex(cpu.bc),
    de: hex(cpu.de),
    hl: hex(cpu.hl),
    ix: hex(cpu.ix),
    iy: hex(cpu.iy),
    sp: hex(cpu.sp),
    mbase: hexByte(cpu.mbase),
    madl: cpu.madl,
  };
}

function diffMemory(before, after, start = RAM_DIFF_START, end = RAM_DIFF_END, limit = RAM_DIFF_LIMIT) {
  let totalChangedBytes = 0;
  const changes = [];
  for (let address = start; address < end; address += 1) {
    if (before[address] === after[address]) continue;
    totalChangedBytes += 1;
    if (changes.length < limit) {
      changes.push({
        address: hex(address),
        before: hexByte(before[address]),
        after: hexByte(after[address]),
      });
    }
  }
  return {
    range: `${hex(start)}-${hex(end - 1)}`,
    totalChangedBytes,
    changes,
  };
}

function traceGate(baselineMem, cpuSnapshot, forceBit5Set) {
  const mem = new Uint8Array(baselineMem);
  const { cpu, executor } = createCPU(mem);
  restoreCpu(cpu, cpuSnapshot);
  cpu.halted = false;
  cpu.sp = STACK_TOP;

  const initialByte = mem[IY_PLUS_68_ADDR] & 0xFF;
  mem[IY_PLUS_68_ADDR] = forceBit5Set ? (initialByte | 0x20) : (initialByte & ~0x20);
  const afterSetupByte = mem[IY_PLUS_68_ADDR] & 0xFF;

  pushSentinelChain(mem, cpu);
  const traceStartMem = new Uint8Array(mem);

  const blockList = [];
  const seenBlocks = new Set();
  const missingBlocks = [];
  const seenMissing = new Set();

  const trace = runUntilHit(
    executor,
    TRACE_ENTRY,
    'adl',
    { ret: TRACE_RET },
    TRACE_MAX_STEPS,
    OS_MAX_LOOP_ITERATIONS,
    {
      onBlock(pc) {
        const rendered = hex(pc & 0xFFFFFF);
        if (!seenBlocks.has(rendered)) {
          seenBlocks.add(rendered);
          blockList.push(rendered);
        }
      },
      onMissingBlock(pc) {
        const rendered = hex(pc & 0xFFFFFF);
        if (!seenMissing.has(rendered)) {
          seenMissing.add(rendered);
          missingBlocks.push(rendered);
        }
      },
    },
  );

  return {
    steps: trace.steps,
    uniqueBlocks: blockList.length,
    blockList,
    termination: trace.hit === 'ret' ? 'sentinel_return' : (trace.termination ?? 'unknown'),
    finalPc: hex(trace.lastPc),
    finalMode: trace.lastMode,
    iyPlus68: {
      address: hex(IY_PLUS_68_ADDR),
      beforeSetup: hexByte(initialByte),
      afterSetup: hexByte(afterSetupByte),
      afterRun: hexByte(mem[IY_PLUS_68_ADDR]),
    },
    finalRegisters: captureRegisters(cpu),
    keyRamChanges: diffMemory(traceStartMem, mem),
    missingBlocks,
    errorMessage: trace.errorMessage,
  };
}

function diffRegisters(clearRegs, setRegs) {
  const fields = ['a', 'f', 'bc', 'de', 'hl', 'ix', 'iy', 'sp', 'mbase', 'madl'];
  const diffs = [];
  for (const field of fields) {
    if (String(clearRegs[field]) === String(setRegs[field])) continue;
    diffs.push(`${field} ${clearRegs[field]} -> ${setRegs[field]}`);
  }
  return diffs;
}

function summarizePartB(bit5Clear, bit5Set) {
  const clearSet = new Set(bit5Clear.blockList);
  const setSet = new Set(bit5Set.blockList);
  const onlyClear = bit5Clear.blockList.filter((pc) => !setSet.has(pc));
  const onlySet = bit5Set.blockList.filter((pc) => !clearSet.has(pc));
  const regDiffs = diffRegisters(bit5Clear.finalRegisters, bit5Set.finalRegisters);
  const clearWrites = bit5Clear.keyRamChanges.totalChangedBytes;
  const setWrites = bit5Set.keyRamChanges.totalChangedBytes;
  const setWritePreview = bit5Set.keyRamChanges.changes.slice(0, 5)
    .map((change) => `${change.address}:${change.before}->${change.after}`)
    .join(', ');

  const parts = [
    `bit 5 clear visited ${bit5Clear.uniqueBlocks} block(s) and ended with ${bit5Clear.termination}`,
    `bit 5 set visited ${bit5Set.uniqueBlocks} block(s) and ended with ${bit5Set.termination}`,
  ];

  if (onlySet.length > 0) {
    parts.push(`set-only blocks: ${onlySet.join(', ')}`);
  }
  if (onlyClear.length > 0) {
    parts.push(`clear-only blocks: ${onlyClear.join(', ')}`);
  }
  if (regDiffs.length > 0) {
    parts.push(`final register differences: ${regDiffs.join('; ')}`);
  }
  parts.push(`RAM changed bytes in ${bit5Clear.keyRamChanges.range}: clear=${clearWrites}, set=${setWrites}`);
  if (setWritePreview) {
    parts.push(`first set-case RAM changes: ${setWritePreview}`);
  }

  return `${parts.join('. ')}.`;
}

function main() {
  const partA = scanPartA(ROM_BYTES);
  const baseline = createBaseline();
  const bit5Clear = traceGate(baseline.baselineMem, baseline.cpuSnapshot, false);
  const bit5Set = traceGate(baseline.baselineMem, baseline.cpuSnapshot, true);

  console.log(JSON.stringify({
    partA,
    partB: {
      bit5Clear,
      bit5Set,
      comparison: summarizePartB(bit5Clear, bit5Set),
    },
  }, null, 2));
}

main();
