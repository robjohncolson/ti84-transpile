// Phase 5 test harness — validate transpiled ROM executor
// Run: node TI-84_Plus_CE/test-harness.mjs

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { TRANSPILATION_META, ENTRY_POINTS, PRELIFTED_BLOCKS, decodeEmbeddedRom } from './ROM.transpiled.js';
import { CPU, createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { createKeyboardManager } from './ti84-keyboard.js';

const ROM_LIMIT = 0x400000;
const PHASE24B_CALLBACK_PTR = 0xd02ad7;
const PHASE24B_CALLBACK_TARGET = 0x0019be;
const PHASE24B_EVENT_LOOP = 0x0019be;
const PHASE24B_STACK = 0xd40000;
const PHASE24B_KNOWN_SEEDS = [0x0019b6, 0x0032d1];
const PHASE24B_SEEDS_URL = new URL('./phase24b-seeds.txt', import.meta.url);
const PHASE24B_SEEDS_PATH = fileURLToPath(PHASE24B_SEEDS_URL);
const COVERAGE_ANALYZER_PATH = fileURLToPath(new URL('./coverage-analyzer.mjs', import.meta.url));

function hex(v, w = 6) {
  return '0x' + v.toString(16).padStart(w, '0');
}

function resetCpuState(targetCpu) {
  targetCpu.a = 0; targetCpu.f = 0;
  targetCpu.b = 0; targetCpu.c = 0;
  targetCpu.d = 0; targetCpu.e = 0;
  targetCpu.h = 0; targetCpu.l = 0;
  targetCpu.sp = 0; targetCpu._ix = 0; targetCpu._iy = 0;
  targetCpu.i = 0; targetCpu.im = 0;
  targetCpu.iff1 = 0; targetCpu.iff2 = 0;
  targetCpu.madl = 1;
  targetCpu.halted = false;
  targetCpu._callDepth = 0;
}

function formatBlockKey(pc, mode) {
  return `${hex(pc)}:${mode}`;
}

function formatSeedAddress(value) {
  return `0x${value.toString(16).padStart(6, '0')}`;
}

function printList(label, values, limit = 30, indent = '  ') {
  console.log(`${indent}${label}: ${values.length}`);

  if (values.length === 0) {
    return;
  }

  for (const value of values.slice(0, limit)) {
    console.log(`${indent}  ${value}`);
  }

  if (values.length > limit) {
    console.log(`${indent}  ... and ${values.length - limit} more`);
  }
}

function buildRegionCounts(blocksVisited) {
  const regions = new Map();

  for (const entry of blocksVisited) {
    const regionStart = Math.floor(entry.pc / 0x10000) * 0x10000;

    if (!regions.has(regionStart)) {
      regions.set(regionStart, new Set());
    }

    regions.get(regionStart).add(formatBlockKey(entry.pc, entry.mode));
  }

  return [...regions.entries()]
    .sort((left, right) => left[0] - right[0])
    .map(([regionStart, keys]) => ({
      regionStart,
      count: keys.size,
    }));
}

function printRegionCounts(regionCounts, indent = '  ') {
  if (regionCounts.length === 0) {
    console.log(`${indent}(none)`);
    return;
  }

  for (const entry of regionCounts) {
    console.log(
      `${indent}${hex(entry.regionStart)}-${hex(entry.regionStart + 0xffff)}: ${entry.count} blocks`
    );
  }
}

function printIoSample(ioOps, mmioOps, limit = 30) {
  const combined = [
    ...ioOps.map((entry) => ({ ...entry, bus: 'port' })),
    ...mmioOps.map((entry) => ({ ...entry, bus: 'mmio' })),
  ].sort((left, right) => {
    if (left.step !== right.step) {
      return left.step - right.step;
    }

    if (left.bus !== right.bus) {
      return left.bus.localeCompare(right.bus);
    }

    return left.target - right.target;
  });

  console.log(`  I/O operations: ${combined.length}`);

  if (combined.length === 0) {
    console.log('    (none)');
    return;
  }

  for (const entry of combined.slice(0, limit)) {
    const direction = entry.op === 'write' ? '<=' : '=>';
    const targetLabel = entry.bus === 'mmio'
      ? `MMIO ${hex(entry.target)}`
      : `PORT ${hex(entry.target, 4)}`;
    console.log(
      `    [${String(entry.step).padStart(4)}] ${targetLabel} ${direction} ${hex(entry.value, 2)}`
    );
  }

  if (combined.length > limit) {
    console.log(`    ... and ${combined.length - limit} more`);
  }
}

function collectSeedAddresses(...sources) {
  const addresses = new Set();

  for (const source of sources) {
    if (!source) {
      continue;
    }

    for (const entry of source) {
      const address = typeof entry === 'number'
        ? entry
        : Number.parseInt(String(entry).split(':')[0], 16);

      if (!Number.isInteger(address) || address <= 0 || address >= ROM_LIMIT) {
        continue;
      }

      addresses.add(address);
    }
  }

  return [...addresses].sort((left, right) => left - right);
}

function runCoverageAnalyzerSnapshot() {
  try {
    const output = execFileSync(process.execPath, [COVERAGE_ANALYZER_PATH], {
      encoding: 'utf8',
    }).trimEnd();
    const match = output.match(/Coverage:\s+([0-9,]+)\s+\/\s+([0-9,]+)\s+bytes\s+\(([\d.]+)%\)/);

    return {
      ok: true,
      output,
      coveredBytes: match?.[1] ?? null,
      totalBytes: match?.[2] ?? null,
      percent: match ? Number(match[3]) : null,
    };
  } catch (error) {
    const stdout = typeof error.stdout === 'string' ? error.stdout.trimEnd() : '';
    const stderr = typeof error.stderr === 'string' ? error.stderr.trimEnd() : '';

    return {
      ok: false,
      output: [stdout, stderr].filter(Boolean).join('\n'),
      error: error.message,
    };
  }
}

function formatCoverageSummary(snapshot) {
  if (!snapshot?.ok || snapshot.percent === null) {
    return 'unavailable';
  }

  return `${snapshot.percent.toFixed(2)}% (${snapshot.coveredBytes} / ${snapshot.totalBytes} bytes)`;
}

function createFreshHarness(options = {}) {
  const memory = new Uint8Array(pristineMemory);
  const peripherals = createPeripheralBus({
    trace: false,
    pllDelay: 2,
    ...(options.peripheralsOptions ?? {}),
  });
  const executor = createExecutor(PRELIFTED_BLOCKS, memory, {
    peripherals,
    trackMemoryMapped: options.trackMemoryMapped === true,
  });

  return {
    memory,
    peripherals,
    executor,
    cpu: executor.cpu,
  };
}

function runExploration(executor, targetCpu, startAddr, startMode, options = {}) {
  const blocksVisited = [];
  const missingBlocksFound = [];
  const dynamicTargets = [];
  const ioOps = [];
  const mmioOps = [];
  const interrupts = [];
  let currentStep = -1;

  targetCpu.onIoRead = (port, value) => {
    ioOps.push({ op: 'read', target: port, value, step: currentStep });
  };

  targetCpu.onIoWrite = (port, value) => {
    ioOps.push({ op: 'write', target: port, value, step: currentStep });
  };

  targetCpu.onMmioRead = (addr, value) => {
    mmioOps.push({ op: 'read', target: addr, value, step: currentStep });
  };

  targetCpu.onMmioWrite = (addr, value) => {
    mmioOps.push({ op: 'write', target: addr, value, step: currentStep });
  };

  const result = executor.runFrom(startAddr, startMode, {
    maxSteps: options.maxSteps ?? 100000,
    maxLoopIterations: options.maxLoopIterations ?? 200,
    wakeFromHalt: options.wakeFromHalt,
    onWake: options.onWake,
    onLoopBreak: options.onLoopBreak,
    onBlock: (pc, mode, meta, step) => {
      currentStep = step;
      blocksVisited.push({ pc, mode, step });

      if (options.onBlock) {
        options.onBlock(pc, mode, meta, step);
      }
    },
    onMissingBlock: (pc, mode, step) => {
      missingBlocksFound.push({ pc, mode, step });

      if (options.onMissingBlock) {
        options.onMissingBlock(pc, mode, step);
      }
    },
    onDynamicTarget: (targetPc, mode, fromPc, step) => {
      dynamicTargets.push({ targetPc, mode, fromPc, step });

      if (options.onDynamicTarget) {
        options.onDynamicTarget(targetPc, mode, fromPc, step);
      }
    },
    onInterrupt: (type, fromPc, vector, step) => {
      interrupts.push({ type, fromPc, vector, step });

      if (options.onInterrupt) {
        options.onInterrupt(type, fromPc, vector, step);
      }
    },
  });

  return {
    result,
    blocksVisited,
    uniqueBlocks: [...new Set(blocksVisited.map((entry) => formatBlockKey(entry.pc, entry.mode)))],
    missingBlocksFound,
    missingKeys: [...new Set(missingBlocksFound.map((entry) => formatBlockKey(entry.pc, entry.mode)))],
    dynamicTargets,
    dynamicKeys: [...new Set(dynamicTargets.map((entry) => formatBlockKey(entry.targetPc, entry.mode)))],
    ioOps,
    mmioOps,
    interrupts,
    regionCounts: buildRegionCounts(blocksVisited),
  };
}

function createFullMemoryHarness(options = {}) {
  const memory = new Uint8Array(options.memorySize ?? 0x1000000);
  memory.set(romBytes);

  const peripherals = createPeripheralBus({
    trace: false,
    pllDelay: 2,
    timerInterrupt: false,
    ...(options.peripheralsOptions ?? {}),
  });
  const executor = createExecutor(PRELIFTED_BLOCKS, memory, {
    peripherals,
    trackMemoryMapped: options.trackMemoryMapped === true,
  });

  return {
    memory,
    peripherals,
    executor,
    cpu: executor.cpu,
  };
}

function configureOsLikeState(targetCpu, options = {}) {
  resetCpuState(targetCpu);
  targetCpu._iy = options.iy ?? 0xd00080;
  targetCpu.sp = options.sp ?? PHASE24B_STACK;
  targetCpu.im = options.im ?? 1;
  targetCpu.madl = options.madl ?? 1;
  targetCpu.iff1 = options.iff1 ?? 0;
  targetCpu.iff2 = options.iff2 ?? targetCpu.iff1;
}

function addSeeds(targetSet, ...sources) {
  for (const value of collectSeedAddresses(...sources)) {
    targetSet.add(value);
  }
}

function read24Value(memory, addr) {
  const a = addr & 0xffffff;
  return memory[a] | (memory[(a + 1) & 0xffffff] << 8) | (memory[(a + 2) & 0xffffff] << 16);
}

function collectNonZeroBytes(memory, start, end) {
  const result = [];

  for (let addr = start; addr < end; addr++) {
    const value = memory[addr & 0xffffff];
    if (value !== 0) {
      result.push({ addr, value });
    }
  }

  return result;
}

function printByteDump(label, entries, indent = '  ') {
  console.log(`${indent}${label}: ${entries.length}`);

  if (entries.length === 0) {
    console.log(`${indent}  (none)`);
    return;
  }

  for (const entry of entries) {
    console.log(`${indent}  ${hex(entry.addr)} = ${hex(entry.value, 2)}`);
  }
}

function printWriteSample(label, count, entries, limit = 20, indent = '  ') {
  console.log(`${indent}${label}: ${count}`);

  if (count === 0) {
    console.log(`${indent}  (none)`);
    return;
  }

  for (const entry of entries.slice(0, limit)) {
    const stepLabel = entry.step >= 0 ? String(entry.step).padStart(6) : 'manual';
    console.log(`${indent}  [${stepLabel}] ${hex(entry.addr)} <= ${hex(entry.value, 2)}`);
  }

  if (count > limit) {
    console.log(`${indent}  ... and ${count - limit} more`);
  }
}

function collectUniqueIoOps(ioOps) {
  const result = [];
  const seen = new Set();

  for (const entry of ioOps) {
    const key = `${entry.op}:${entry.target}:${entry.value}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(entry);
  }

  return result;
}

function printUniqueIoOps(ioOps, limit = 20) {
  const uniqueOps = collectUniqueIoOps(ioOps);
  console.log(`  I/O operations: ${ioOps.length}`);

  if (uniqueOps.length === 0) {
    console.log('    (none)');
    return;
  }

  for (const entry of uniqueOps.slice(0, limit)) {
    const direction = entry.op === 'write' ? '<=' : '=>';
    console.log(`    PORT ${hex(entry.target, 4)} ${direction} ${hex(entry.value, 2)}`);
  }

  if (uniqueOps.length > limit) {
    console.log(`    ... and ${uniqueOps.length - limit} more unique accesses`);
  }
}

function createSystemRamWriteTracker(targetCpu, options = {}) {
  const captureAll = options.captureAll === true;
  const sampleLimit = options.sampleLimit ?? 20;
  const tracker = {
    step: -1,
    totalWrites: 0,
    writes: [],
    callbackWriteCount: 0,
    callbackWrites: [],
    tableWriteCount: 0,
    tableWrites: [],
    iyWriteCount: 0,
    iyWrites: [],
    fpWriteCount: 0,
    fpWrites: [],
    setStep(step) {
      this.step = step;
    },
    restore() {},
  };

  function pushSample(list, entry) {
    if (list.length < sampleLimit) {
      list.push(entry);
    }
  }

  function recordWrite(addr, value) {
    const normalizedAddr = addr & targetCpu._memMask;
    if (normalizedAddr < 0xd00000 || normalizedAddr >= 0xd40000) {
      return;
    }

    const entry = {
      step: tracker.step,
      addr: normalizedAddr,
      value: value & 0xff,
    };

    tracker.totalWrites++;
    if (captureAll) {
      tracker.writes.push(entry);
    }

    if (normalizedAddr >= PHASE24B_CALLBACK_PTR && normalizedAddr < PHASE24B_CALLBACK_PTR + 3) {
      tracker.callbackWriteCount++;
      pushSample(tracker.callbackWrites, entry);
    }

    if (normalizedAddr >= 0xd02000 && normalizedAddr < 0xd03000) {
      tracker.tableWriteCount++;
      pushSample(tracker.tableWrites, entry);
    }

    if (normalizedAddr >= 0xd00080 && normalizedAddr < 0xd00100) {
      tracker.iyWriteCount++;
      pushSample(tracker.iyWrites, entry);
    }

    if (normalizedAddr >= 0xd005f8 && normalizedAddr < 0xd00640) {
      tracker.fpWriteCount++;
      pushSample(tracker.fpWrites, entry);
    }
  }

  const origWrite8 = targetCpu.write8.bind(targetCpu);
  const origWrite16 = targetCpu.write16.bind(targetCpu);
  const origWrite24 = targetCpu.write24.bind(targetCpu);

  targetCpu.write8 = (addr, value) => {
    origWrite8(addr, value);
    recordWrite(addr, value);
  };

  targetCpu.write16 = (addr, value) => {
    origWrite16(addr, value);
    recordWrite(addr, value);
    recordWrite(addr + 1, value >> 8);
  };

  targetCpu.write24 = (addr, value) => {
    origWrite24(addr, value);
    recordWrite(addr, value);
    recordWrite(addr + 1, value >> 8);
    recordWrite(addr + 2, value >> 16);
  };

  tracker.restore = () => {
    targetCpu.write8 = origWrite8;
    targetCpu.write16 = origWrite16;
    targetCpu.write24 = origWrite24;
  };

  return tracker;
}

// --- Decode ROM ---
console.log('=== TI-84 Plus CE ROM Executor Test Harness ===\n');
console.log('Transpilation meta:', JSON.stringify(TRANSPILATION_META, null, 2));
console.log(`\nEntry points: ${ENTRY_POINTS.length}`);
console.log(`Total blocks: ${Object.keys(PRELIFTED_BLOCKS).length}\n`);

console.log('Decoding ROM...');
const romBytes = decodeEmbeddedRom();
const pristineMemory = new Uint8Array(romBytes);
console.log(`ROM decoded: ${romBytes.length} bytes (${(romBytes.length / 1024 / 1024).toFixed(1)} MB)\n`);

// --- Create executor ---
const peripherals = createPeripheralBus({ trace: false, pllDelay: 2 });
const executor = createExecutor(PRELIFTED_BLOCKS, romBytes, { peripherals });
const { cpu } = executor;

// --- I/O tracing ---
const ioLog = [];

cpu.onIoRead = (port, value) => {
  ioLog.push({ op: 'read', port, value });
};

cpu.onIoWrite = (port, value) => {
  ioLog.push({ op: 'write', port, value });
};

// --- Block tracing ---
function traceCallback(pc, mode, meta, step) {
  const firstDasm = meta?.instructions?.[0]?.dasm ?? '???';
  const instrCount = meta?.instructionCount ?? 0;
  console.log(
    `  [${String(step).padStart(4)}] ${hex(pc)}:${mode.padEnd(3)} ` +
    `(${instrCount} instr) ${firstDasm}`
  );
}

function printRegisters(cpu) {
  console.log('  Registers:');
  console.log(`    A=${hex(cpu.a, 2)} F=${hex(cpu.f, 2)} BC=${hex(cpu.bc, 4)} DE=${hex(cpu.de, 4)} HL=${hex(cpu.hl, 4)}`);
  console.log(`    SP=${hex(cpu.sp)} IX=${hex(cpu.ix)} IY=${hex(cpu.iy)}`);
  console.log(`    MADL=${cpu.madl} IM=${cpu.im} IFF1=${cpu.iff1} IFF2=${cpu.iff2}`);
  console.log(`    Call depth: ${cpu._callDepth || 0}`);
}

function printIoLog(log) {
  if (log.length === 0) {
    console.log('  (no I/O operations)');
    return;
  }
  for (const entry of log) {
    const dir = entry.op === 'write' ? 'OUT' : 'IN ';
    console.log(`    ${dir} port ${hex(entry.port, 4)} = ${hex(entry.value, 2)}`);
  }
}

function runTest(label, startAddr, startMode, maxSteps) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`TEST: ${label}`);
  console.log(`  Start: ${hex(startAddr)}:${startMode}, max ${maxSteps} steps`);
  console.log(`${'='.repeat(60)}\n`);

  // Reset CPU state
  cpu.a = 0; cpu.f = 0;
  cpu.b = 0; cpu.c = 0;
  cpu.d = 0; cpu.e = 0;
  cpu.h = 0; cpu.l = 0;
  cpu.sp = 0; cpu._ix = 0; cpu._iy = 0;
  cpu.i = 0; cpu.im = 0;
  cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.madl = 1; // ADL mode default for eZ80
  cpu.halted = false;
  cpu._callDepth = 0;
  ioLog.length = 0;

  console.log('Block trace:');
  const missingBlocksFound = [];
  const result = executor.runFrom(startAddr, startMode, {
    maxSteps,
    maxLoopIterations: 32,
    onBlock: traceCallback,
    onMissingBlock: (pc, mode, step) => {
      missingBlocksFound.push({ pc, mode, step });
    },
    onLoopBreak: (pc, mode, count, target) => {
      const dest = target ? hex(target) : '(carry forced)';
      console.log(`  ** LOOP BREAK at ${hex(pc)}:${mode} after ${count} iterations → ${dest}`);
    },
  });

  console.log(`\nResult:`);
  console.log(`  Steps: ${result.steps}`);
  console.log(`  Last PC: ${hex(result.lastPc)}:${result.lastMode}`);
  console.log(`  Termination: ${result.termination}`);
  if (result.loopsForced) {
    console.log(`  Loops force-broken: ${result.loopsForced}`);
  }
  if (result.termination === 'missing_block') {
    console.log(`  Missing block key: ${result.lastPc.toString(16).padStart(6, '0')}:${result.lastMode}`);
  }
  if (result.error) {
    console.log(`  Error: ${result.error.message}`);
  }

  console.log('\nFinal CPU state:');
  printRegisters(cpu);

  console.log(`\nI/O log (${ioLog.length} operations):`);
  printIoLog(ioLog);

  if (missingBlocksFound.length > 0) {
    console.log(`\nMissing blocks encountered: ${missingBlocksFound.length}`);
    const unique = [...new Set(missingBlocksFound.map(m => '0x' + m.pc.toString(16).padStart(6, '0') + ':' + m.mode))];
    console.log(`  Unique missing: ${unique.length}`);
    for (const key of unique.slice(0, 10)) {
      console.log(`    ${key}`);
    }
    if (unique.length > 10) {
      console.log(`    ... and ${unique.length - 10} more`);
    }
  }

  return {
    ...result,
    missingBlocksFound,
  };
}

// --- Test 1: Reset vector (z80 mode) ---
const test1 = runTest(
  'Reset vector (0x000000:z80)',
  0x000000, 'z80', 500
);

// --- Test 2: Startup block (adl mode) ---
const test2 = runTest(
  'Startup block (0x000658:adl)',
  0x000658, 'adl', 1000
);

// --- Test 3: Extended run from reset ---
const test3 = runTest(
  'Extended reset (0x000000:z80, 5000 steps)',
  0x000000, 'z80', 5000
);

// --- Test 4: Reset with peripherals - PLL should resolve naturally ---
console.log('\n--- Peripheral Validation ---');
const peripherals2 = createPeripheralBus({ trace: true, pllDelay: 2 });
const executor2 = createExecutor(PRELIFTED_BLOCKS, romBytes, { peripherals: peripherals2 });

// Set up I/O tracing on executor2
const ioLog2 = [];
executor2.cpu.onIoRead = (port, value) => { ioLog2.push({ op: 'read', port, value }); };
executor2.cpu.onIoWrite = (port, value) => { ioLog2.push({ op: 'write', port, value }); };

const test4 = executor2.runFrom(0x000000, 'z80', {
  maxSteps: 5000,
  maxLoopIterations: 200,
  onLoopBreak: (pc, mode, count, target) => {
    console.log(`  ** UNEXPECTED LOOP BREAK at 0x${pc.toString(16).padStart(6, '0')}:${mode}`);
  },
});

// Check PLL-specific I/O
const pllReads = ioLog2.filter(e => e.op === 'read' && e.port === 0x28);
const pllWrites = ioLog2.filter(e => e.op === 'write' && e.port === 0x28);
console.log(`  PLL writes: ${pllWrites.length}, PLL reads: ${pllReads.length}`);
console.log(`  PLL read values: ${pllReads.map(e => '0x' + e.value.toString(16).padStart(2, '0')).join(', ')}`);
console.log(`  Test 4 steps: ${test4.steps}, termination: ${test4.termination}`);
console.log(`  Loops forced: ${test4.loopsForced}`);
if (test4.loopsForced === 0) {
  console.log('  SUCCESS: PLL loop resolved naturally (0 forced breaks)');
} else {
  console.log('  PARTIAL: PLL loop still needed force-break');
}

// --- Test 5: Multi-entry-point exploration ---
console.log('\n--- Multi-Entry-Point Exploration ---');

const entryPoints = [
  { addr: 0x000008, mode: 'adl', label: 'RST 0x08' },
  { addr: 0x000010, mode: 'adl', label: 'RST 0x10' },
  { addr: 0x000018, mode: 'adl', label: 'RST 0x18' },
  { addr: 0x000020, mode: 'adl', label: 'RST 0x20' },
  { addr: 0x000028, mode: 'adl', label: 'RST 0x28' },
  { addr: 0x000030, mode: 'adl', label: 'RST 0x30' },
  { addr: 0x000038, mode: 'adl', label: 'RST 0x38 (NMI)' },
  { addr: 0x020110, mode: 'adl', label: 'OS entry' },
  { addr: 0x004000, mode: 'adl', label: 'Mid-ROM 0x4000' },
  { addr: 0x021000, mode: 'adl', label: 'Mid-ROM 0x21000' },
  { addr: 0x000100, mode: 'adl', label: 'Post-vector 0x100' },
  { addr: 0x000658, mode: 'adl', label: 'ADL startup 0x658' },
  { addr: 0x000800, mode: 'adl', label: 'Region 0x800' },
  { addr: 0x001afa, mode: 'adl', label: 'Region 0x1afa' },
];

const multiResults = [];

for (const ep of entryPoints) {
  cpu.a = 0; cpu.f = 0;
  cpu.b = 0; cpu.c = 0;
  cpu.d = 0; cpu.e = 0;
  cpu.h = 0; cpu.l = 0;
  cpu.sp = 0; cpu._ix = 0; cpu._iy = 0;
  cpu.i = 0; cpu.im = 0;
  cpu.iff1 = 0; cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.halted = false;
  cpu._callDepth = 0;
  ioLog.length = 0;

  const epMissing = [];
  const epDynamic = [];
  const result = executor.runFrom(ep.addr, ep.mode, {
    maxSteps: 5000,
    maxLoopIterations: 64,
    onMissingBlock: (pc, mode, step) => {
      epMissing.push({ pc, mode, step });
    },
    onDynamicTarget: (targetPc, mode, fromPc, step) => {
      epDynamic.push({ targetPc, mode, fromPc, step });
    },
  });

  multiResults.push({
    label: ep.label,
    addr: ep.addr,
    steps: result.steps,
    termination: result.termination,
    lastPc: result.lastPc,
    lastMode: result.lastMode,
    loopsForced: result.loopsForced || 0,
    ioOps: ioLog.length,
    missingBlocksFound: epMissing,
    dynamicTargets: epDynamic,
  });
}

console.log('\n  Entry Point Results:');
console.log('  ' + '-'.repeat(95));
console.log('  ' + 'Label'.padEnd(22) + 'Address'.padEnd(12) + 'Steps'.padEnd(8) + 'Termination'.padEnd(18) + 'Last PC'.padEnd(12) + 'I/O Ops'.padEnd(10) + 'Loops');
console.log('  ' + '-'.repeat(95));
for (const r of multiResults) {
  console.log(
    '  ' +
    r.label.padEnd(22) +
    hex(r.addr).padEnd(12) +
    String(r.steps).padEnd(8) +
    r.termination.padEnd(18) +
    hex(r.lastPc).padEnd(12) +
    String(r.ioOps).padEnd(10) +
    String(r.loopsForced)
  );
}
console.log('  ' + '-'.repeat(95));

const deepRuns = multiResults.filter((r) => r.steps > 100);
const haltRuns = multiResults.filter((r) => r.termination === 'halt');
const missingRuns = multiResults.filter((r) => r.termination === 'missing_block');
console.log(`\n  Entries reaching >100 steps: ${deepRuns.length}/${multiResults.length}`);
console.log(`  Entries reaching HALT: ${haltRuns.length}`);
console.log(`  Entries hitting missing blocks: ${missingRuns.length}`);

// --- Test 6: Post-boot wake from HALT via NMI ---
console.log('\n--- Post-Boot Wake Tests ---');

// Reuse the shared executor — Tests 1-3 already ran the boot to HALT in 60 steps.
// The CPU/peripheral state reflects a completed boot (hardware configured, SP set, IM 1).
console.log(`  Using shared executor post-boot state:`);
console.log(`  Post-boot SP: 0x${cpu.sp.toString(16).padStart(6, '0')}`);
console.log(`  Post-boot IM: ${cpu.im}, IFF1: ${cpu.iff1}`);

// NMI pushes the return address (PC after HALT = 0x0019b6) and jumps to 0x0066.
cpu.halted = false;
cpu.push(0x0019b6);
ioLog.length = 0;

const nmiDynamic = [];
const test6 = executor.runFrom(0x000066, 'adl', {
  maxSteps: 50000,
  maxLoopIterations: 200,
  onMissingBlock: (pc, mode, step) => {},
  onDynamicTarget: (targetPc, mode, fromPc, step) => {
    nmiDynamic.push({ targetPc, mode, fromPc });
  },
  onLoopBreak: (pc, mode, count, target) => {
    console.log(`  [NMI] Loop break at 0x${pc.toString(16).padStart(6, '0')}:${mode}`);
  },
});

console.log(`\n  Test 6 (NMI wake from 0x0066):`);
console.log(`    Steps: ${test6.steps}, termination: ${test6.termination}`);
console.log(`    Last PC: 0x${test6.lastPc.toString(16).padStart(6, '0')}:${test6.lastMode}`);
console.log(`    I/O ops: ${ioLog.length}, loops forced: ${test6.loopsForced}`);
console.log(`    Dynamic targets: ${nmiDynamic.length}`);
if (test6.missingBlocks && test6.missingBlocks.length > 0) {
  console.log(`    Missing blocks: ${test6.missingBlocks.length}`);
  for (const key of test6.missingBlocks.slice(0, 10)) {
    console.log(`      ${key}`);
  }
}

// --- Test 7: Post-boot wake via IM 1 interrupt (simulate EI + IRQ) ---
// Re-run boot on shared executor to get clean post-boot state for IM1 test
cpu.a = 0; cpu.f = 0; cpu.b = 0; cpu.c = 0; cpu.d = 0; cpu.e = 0;
cpu.h = 0; cpu.l = 0; cpu.sp = 0; cpu._ix = 0; cpu._iy = 0;
cpu.i = 0; cpu.im = 0; cpu.iff1 = 0; cpu.iff2 = 0;
cpu.madl = 1; cpu.halted = false;

executor.runFrom(0x000000, 'z80', { maxSteps: 5000, maxLoopIterations: 32 });

// Simulate: EI then IM 1 interrupt fires.
cpu.halted = false;
cpu.iff1 = 1;
cpu.iff2 = 1;
cpu.push(0x0019b6);
ioLog.length = 0;

const im1Dynamic = [];
const test7 = executor.runFrom(0x000038, 'adl', {
  maxSteps: 50000,
  maxLoopIterations: 200,
  onMissingBlock: (pc, mode, step) => {},
  onDynamicTarget: (targetPc, mode, fromPc, step) => {
    im1Dynamic.push({ targetPc, mode, fromPc });
  },
  onLoopBreak: (pc, mode, count, target) => {
    console.log(`  [IM1] Loop break at 0x${pc.toString(16).padStart(6, '0')}:${mode}`);
  },
});

console.log(`\n  Test 7 (IM1 wake from 0x0038):`);
console.log(`    Steps: ${test7.steps}, termination: ${test7.termination}`);
console.log(`    Last PC: 0x${test7.lastPc.toString(16).padStart(6, '0')}:${test7.lastMode}`);
console.log(`    I/O ops: ${ioLog.length}, loops forced: ${test7.loopsForced}`);
console.log(`    Dynamic targets: ${im1Dynamic.length}`);
if (test7.missingBlocks && test7.missingBlocks.length > 0) {
  console.log(`    Missing blocks: ${test7.missingBlocks.length}`);
  for (const key of test7.missingBlocks.slice(0, 10)) {
    console.log(`      ${key}`);
  }
}

// --- Test 8: Timer-interrupt-driven NMI execution from reset ---
// Create a new executor with NMI timer interrupts to test the interrupt dispatch model.
console.log('\n--- Test 8: Timer Interrupt Dispatch ---');

const intPeripherals = createPeripheralBus({
  trace: false,
  pllDelay: 2,
  timerInterrupt: true,
  timerInterval: 100,  // fire NMI every 100 blocks
  timerMode: 'nmi',
});
const intExecutor = createExecutor(PRELIFTED_BLOCKS, romBytes, { peripherals: intPeripherals });
const intCpu = intExecutor.cpu;

intCpu.a = 0; intCpu.f = 0; intCpu.b = 0; intCpu.c = 0;
intCpu.d = 0; intCpu.e = 0; intCpu.h = 0; intCpu.l = 0;
intCpu.sp = 0; intCpu._ix = 0; intCpu._iy = 0;
intCpu.i = 0; intCpu.im = 0; intCpu.iff1 = 0; intCpu.iff2 = 0;
intCpu.madl = 1; intCpu.halted = false;

const intInterrupts = [];
const intDynamic = [];
const test8 = intExecutor.runFrom(0x000000, 'z80', {
  maxSteps: 10000,
  maxLoopIterations: 200,
  onInterrupt: (type, fromPc, vector, step) => {
    intInterrupts.push({ type, fromPc, vector, step });
  },
  onDynamicTarget: (targetPc, mode, fromPc, step) => {
    intDynamic.push({ targetPc, mode, fromPc, step });
  },
  onLoopBreak: (pc, mode, count, target) => {
    console.log(`  [INT] Loop break at 0x${pc.toString(16).padStart(6, '0')}:${mode} (${count} iterations)`);
  },
});

console.log(`\n  Test 8 (timer NMI from reset):`);
console.log(`    Steps: ${test8.steps}, termination: ${test8.termination}`);
console.log(`    Last PC: 0x${test8.lastPc.toString(16).padStart(6, '0')}:${test8.lastMode}`);
console.log(`    Loops forced: ${test8.loopsForced}, dynamic targets: ${intDynamic.length}`);
console.log(`    Interrupts fired: ${intInterrupts.length}`);
for (const intr of intInterrupts.slice(0, 10)) {
  console.log(`      ${intr.type} at step ${intr.step}: 0x${intr.fromPc.toString(16).padStart(6, '0')} -> 0x${intr.vector.toString(16).padStart(6, '0')}`);
}
if (intInterrupts.length > 10) {
  console.log(`      ... and ${intInterrupts.length - 10} more`);
}

// --- Test 9: Trace boot I/O writes to port 0x06 (Phase 24A diagnostic) ---
console.log('\n--- Test 9: Flash Port 0x06 Boot Trace ---');
{
  const p9 = createPeripheralBus({ trace: false, pllDelay: 2 });
  const ex9 = createExecutor(PRELIFTED_BLOCKS, romBytes, { peripherals: p9 });
  const cpu9 = ex9.cpu;

  cpu9.a = 0; cpu9.f = 0; cpu9.b = 0; cpu9.c = 0;
  cpu9.d = 0; cpu9.e = 0; cpu9.h = 0; cpu9.l = 0;
  cpu9.sp = 0; cpu9._ix = 0; cpu9._iy = 0;
  cpu9.i = 0; cpu9.im = 0; cpu9.iff1 = 0; cpu9.iff2 = 0;
  cpu9.madl = 1; cpu9.halted = false;

  const port06Writes = [];
  const port06Reads = [];
  let stepCounter = 0;

  cpu9.onIoWrite = (port, value) => {
    if ((port & 0xFF) === 0x06) {
      port06Writes.push({ step: stepCounter, port, value });
    }
  };
  cpu9.onIoRead = (port, value) => {
    if ((port & 0xFF) === 0x06) {
      port06Reads.push({ step: stepCounter, port, value });
    }
  };

  const test9 = ex9.runFrom(0x000000, 'z80', {
    maxSteps: 5000,
    maxLoopIterations: 32,
    onBlock: (pc, mode, meta, step) => { stepCounter = step; },
  });

  console.log(`  Boot: ${test9.steps} steps, termination: ${test9.termination}`);
  console.log(`  Last PC: ${hex(test9.lastPc)}:${test9.lastMode}`);
  console.log(`  Flash port state after boot: lastWrite = ${hex(p9.getState().flash.lastWrite, 2)}`);
  console.log(`\n  Port 0x06 WRITES during boot (${port06Writes.length}):`);
  for (const w of port06Writes) {
    console.log(`    step ${w.step}: OUT ${hex(w.port, 4)} = ${hex(w.value, 2)}`);
  }
  console.log(`\n  Port 0x06 READS during boot (${port06Reads.length}):`);
  for (const r of port06Reads) {
    console.log(`    step ${r.step}: IN  ${hex(r.port, 4)} = ${hex(r.value, 2)}`);
  }

  const wrote0xD0 = port06Writes.some(w => w.value === 0xD0);
  console.log(`\n  Hypothesis check: boot writes 0xD0 to port 0x06? ${wrote0xD0 ? 'YES ✓' : 'NO ✗'}`);
  if (!wrote0xD0 && port06Writes.length > 0) {
    console.log(`  Values written: ${port06Writes.map(w => hex(w.value, 2)).join(', ')}`);
  }
}

// --- Test 10: ISR dispatch — does execution reach 0x000710? ---
console.log('\n--- Test 10: ISR Dispatch Gate (Phase 24A) ---');
{
  const p10 = createPeripheralBus({ trace: false, pllDelay: 2 });
  const ex10 = createExecutor(PRELIFTED_BLOCKS, romBytes, { peripherals: p10 });
  const cpu10 = ex10.cpu;

  // Step A: Boot to HALT
  cpu10.a = 0; cpu10.f = 0; cpu10.b = 0; cpu10.c = 0;
  cpu10.d = 0; cpu10.e = 0; cpu10.h = 0; cpu10.l = 0;
  cpu10.sp = 0; cpu10._ix = 0; cpu10._iy = 0;
  cpu10.i = 0; cpu10.im = 0; cpu10.iff1 = 0; cpu10.iff2 = 0;
  cpu10.madl = 1; cpu10.halted = false;

  const bootResult = ex10.runFrom(0x000000, 'z80', {
    maxSteps: 5000,
    maxLoopIterations: 32,
  });

  console.log(`  Boot: ${bootResult.steps} steps → ${bootResult.termination} at ${hex(bootResult.lastPc)}`);
  console.log(`  Flash lastWrite after boot: ${hex(p10.getState().flash.lastWrite, 2)}`);
  console.log(`  CPU state: IM=${cpu10.im} IFF1=${cpu10.iff1} SP=${hex(cpu10.sp)}`);

  // Step B: Simulate IM1 IRQ wake
  cpu10.halted = false;
  cpu10.iff1 = 1;
  cpu10.iff2 = 1;
  const haltPc = bootResult.lastPc;
  cpu10.push(haltPc + 1);  // return address after HALT

  const blocksVisited = [];
  const isrMissing = [];
  let reached0x710 = false;
  let aAtCp = null;

  const isrResult = ex10.runFrom(0x000038, 'adl', {
    maxSteps: 50000,
    maxLoopIterations: 200,
    onBlock: (pc, mode, meta, step) => {
      blocksVisited.push({ pc, mode, step });
      if (pc === 0x000710) reached0x710 = true;
      // Capture A register when entering the CP gate block
      if (pc === 0x000704) aAtCp = cpu10.a;
    },
    onMissingBlock: (pc, mode, step) => {
      isrMissing.push({ pc, mode, step });
    },
    onLoopBreak: (pc, mode, count) => {
      console.log(`  [ISR] Loop break at ${hex(pc)}:${mode} (${count} iterations)`);
    },
  });

  console.log(`\n  ISR dispatch: ${isrResult.steps} steps → ${isrResult.termination} at ${hex(isrResult.lastPc)}:${isrResult.lastMode}`);
  console.log(`  A at CP 0xD0 gate (block 0x000704): ${aAtCp !== null ? hex(aAtCp, 2) : 'block not reached'}`);
  console.log(`  Reached 0x000710 (callback dispatch): ${reached0x710 ? 'YES ✓ — GATE UNLOCKED!' : 'NO ✗ — still blocked'}`);

  console.log(`\n  Block trace (first 30):`);
  for (const b of blocksVisited.slice(0, 30)) {
    console.log(`    [${String(b.step).padStart(4)}] ${hex(b.pc)}:${b.mode}`);
  }
  if (blocksVisited.length > 30) {
    console.log(`    ... and ${blocksVisited.length - 30} more blocks`);
  }

  if (isrMissing.length > 0) {
    const uniqueMissing = [...new Set(isrMissing.map(m => `${hex(m.pc)}:${m.mode}`))];
    console.log(`\n  Missing blocks hit: ${uniqueMissing.length}`);
    for (const key of uniqueMissing.slice(0, 15)) {
      console.log(`    ${key}`);
    }
  }

  // Step C: If gate unlocked, explore post-dispatch
  if (reached0x710) {
    console.log('\n  --- Post-Dispatch Exploration ---');

    // Collect address ranges
    const regions = new Map();
    for (const b of blocksVisited) {
      const region = Math.floor(b.pc / 0x10000) * 0x10000;
      regions.set(region, (regions.get(region) || 0) + 1);
    }
    console.log(`  Code regions visited:`);
    for (const [region, count] of [...regions.entries()].sort((a, b) => a[0] - b[0])) {
      console.log(`    ${hex(region)}-${hex(region + 0xFFFF)}: ${count} blocks`);
    }
    console.log(`  Total unique blocks visited: ${new Set(blocksVisited.map(b => `${hex(b.pc)}:${b.mode}`)).size}`);
  }
}

// --- Test 11: Deep ISR exploration with callback table initialization ---
console.log('\n--- Test 11: Deep ISR Exploration (Phase 24B) ---');
const test11Seeds = new Set();
{
  // Create 16MB memory with ROM loaded (needed for D-space RAM access)
  const mem11 = new Uint8Array(0x1000000);
  mem11.set(romBytes);
  const p11 = createPeripheralBus({ trace: false, pllDelay: 2 });
  const ex11 = createExecutor(PRELIFTED_BLOCKS, mem11, { peripherals: p11 });
  const cpu11 = ex11.cpu;

  // Boot to HALT
  resetCpuState(cpu11);
  const boot11 = ex11.runFrom(0x000000, 'z80', { maxSteps: 5000, maxLoopIterations: 32 });
  console.log(`  Boot: ${boot11.steps} steps → ${boot11.termination} at ${hex(boot11.lastPc)}`);

  // Initialize callback table: write OS event loop address to 0xD02AD7
  const cbTarget = PHASE24B_CALLBACK_TARGET;
  mem11[0xD02AD7] = cbTarget & 0xFF;
  mem11[0xD02AD8] = (cbTarget >> 8) & 0xFF;
  mem11[0xD02AD9] = (cbTarget >> 16) & 0xFF;
  console.log(`  Callback table: 0xD02AD7 = ${hex(cbTarget)}`);

  // Wake with IM1 IRQ
  cpu11.halted = false;
  cpu11.iff1 = 1;
  cpu11.iff2 = 1;
  cpu11.push(boot11.lastPc + 1);

  const blocks11 = [];
  const missing11 = [];
  const dynamic11 = [];

  const isr11 = ex11.runFrom(0x000038, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 200,
    onBlock: (pc, mode) => { blocks11.push({ pc, mode }); },
    onMissingBlock: (pc, mode) => { missing11.push({ pc, mode }); },
    onDynamicTarget: (targetPc, mode) => { dynamic11.push({ targetPc, mode }); },
    onLoopBreak: (pc, mode, count) => {
      console.log(`  [T11] Loop break at ${hex(pc)}:${mode} (${count} iterations)`);
    },
  });

  const uniqueBlocks11 = new Set(blocks11.map(b => `${hex(b.pc)}:${b.mode}`));
  const uniqueMissing11 = [...new Set(missing11.map(m => `${hex(m.pc)}:${m.mode}`))];
  const uniqueDynamic11 = [...new Set(dynamic11.map(d => `${hex(d.targetPc)}:${d.mode}`))];

  console.log(`\n  ISR dispatch: ${isr11.steps} steps → ${isr11.termination} at ${hex(isr11.lastPc)}:${isr11.lastMode}`);
  console.log(`  Unique blocks visited: ${uniqueBlocks11.size}`);

  // Code region distribution
  const regions11 = new Map();
  for (const b of blocks11) {
    const region = Math.floor(b.pc / 0x10000) * 0x10000;
    regions11.set(region, (regions11.get(region) || 0) + 1);
  }
  console.log(`  Code regions:`);
  for (const [region, count] of [...regions11.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`    ${hex(region)}-${hex(region + 0xFFFF)}: ${count} blocks`);
  }

  console.log(`\n  Missing blocks: ${uniqueMissing11.length}`);
  for (const key of uniqueMissing11.slice(0, 30)) {
    console.log(`    ${key}`);
    const addr = parseInt(key.split(':')[0], 16);
    if (addr > 0 && addr < ROM_LIMIT) test11Seeds.add(addr);
  }

  console.log(`\n  Dynamic targets: ${uniqueDynamic11.length}`);
  for (const key of uniqueDynamic11.slice(0, 30)) {
    console.log(`    ${key}`);
    const addr = parseInt(key.split(':')[0], 16);
    if (addr > 0 && addr < ROM_LIMIT) test11Seeds.add(addr);
  }
}

// --- Test 12: OS event loop exploration ---
console.log('\n--- Test 12: OS Event Loop (0x0019BE) ---');
const test12Seeds = new Set();
{
  const mem12 = new Uint8Array(0x1000000);
  mem12.set(romBytes);
  const p12 = createPeripheralBus({ trace: false, pllDelay: 2 });
  const ex12 = createExecutor(PRELIFTED_BLOCKS, mem12, { peripherals: p12 });
  const cpu12 = ex12.cpu;

  // Set up OS-like state without full boot
  resetCpuState(cpu12);
  cpu12._iy = 0xD00080;   // system vars base
  cpu12.sp = 0xD40000;     // reasonable stack
  cpu12.im = 1;
  cpu12.iff1 = 0;
  cpu12.madl = 1;          // ADL mode

  // Set (IY+27) = 0x40 (bit 6 set, as SET 6,(IY+27) does in ISR)
  mem12[0xD0009B] = 0x40;

  const blocks12 = [];
  const missing12 = [];
  const dynamic12 = [];

  const loop12 = ex12.runFrom(PHASE24B_EVENT_LOOP, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 200,
    onBlock: (pc, mode) => { blocks12.push({ pc, mode }); },
    onMissingBlock: (pc, mode) => { missing12.push({ pc, mode }); },
    onDynamicTarget: (targetPc, mode) => { dynamic12.push({ targetPc, mode }); },
    onLoopBreak: (pc, mode, count) => {
      console.log(`  [T12] Loop break at ${hex(pc)}:${mode} (${count} iterations)`);
    },
  });

  const uniqueBlocks12 = new Set(blocks12.map(b => `${hex(b.pc)}:${b.mode}`));
  const uniqueMissing12 = [...new Set(missing12.map(m => `${hex(m.pc)}:${m.mode}`))];
  const uniqueDynamic12 = [...new Set(dynamic12.map(d => `${hex(d.targetPc)}:${d.mode}`))];

  console.log(`  Event loop: ${loop12.steps} steps → ${loop12.termination} at ${hex(loop12.lastPc)}:${loop12.lastMode}`);
  console.log(`  Unique blocks visited: ${uniqueBlocks12.size}`);

  const regions12 = new Map();
  for (const b of blocks12) {
    const region = Math.floor(b.pc / 0x10000) * 0x10000;
    regions12.set(region, (regions12.get(region) || 0) + 1);
  }
  console.log(`  Code regions:`);
  for (const [region, count] of [...regions12.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`    ${hex(region)}-${hex(region + 0xFFFF)}: ${count} blocks`);
  }

  console.log(`\n  Missing blocks: ${uniqueMissing12.length}`);
  for (const key of uniqueMissing12.slice(0, 30)) {
    console.log(`    ${key}`);
    const addr = parseInt(key.split(':')[0], 16);
    if (addr > 0 && addr < ROM_LIMIT) test12Seeds.add(addr);
  }

  console.log(`\n  Dynamic targets: ${uniqueDynamic12.length}`);
  for (const key of uniqueDynamic12.slice(0, 30)) {
    console.log(`    ${key}`);
    const addr = parseInt(key.split(':')[0], 16);
    if (addr > 0 && addr < ROM_LIMIT) test12Seeds.add(addr);
  }
}

// --- Test 13: ROM ISR handler table scan ---
console.log('\n--- Test 13: ROM ISR Handler Table Scan ---');
const test13Seeds = new Set();
{
  // Scan known TI-84 CE dispatch/handler table areas for 24-bit pointers
  const tableRanges = [
    { start: 0x000700, end: 0x000800, label: 'ISR handler area' },
    { start: 0x020100, end: 0x020200, label: 'OS dispatch table' },
    { start: 0x000038, end: 0x000070, label: 'RST vector area' },
  ];

  const validAddresses = [];
  const newSeeds = [];

  for (const range of tableRanges) {
    console.log(`\n  Scanning ${range.label} (${hex(range.start)}-${hex(range.end)}):`);
    for (let addr = range.start; addr < range.end; addr += 3) {
      const ptr = romBytes[addr] | (romBytes[addr + 1] << 8) | (romBytes[addr + 2] << 16);
      if (ptr === 0 || ptr >= ROM_LIMIT) continue;

      const key = `${ptr.toString(16).padStart(6, '0')}:adl`;
      const hasBlock = PRELIFTED_BLOCKS[key] !== undefined;

      if (hasBlock) {
        validAddresses.push({ addr, ptr, key });
      } else {
        newSeeds.push({ addr, ptr, key });
        test13Seeds.add(ptr);
      }
    }
    console.log(`    Valid blocks: ${validAddresses.length}, New seeds: ${newSeeds.length}`);
  }

  // Try running from each valid handler address (quick probe)
  console.log(`\n  Probing ${Math.min(validAddresses.length, 20)} valid handler addresses:`);
  const p13 = createPeripheralBus({ trace: false, pllDelay: 2 });
  const ex13 = createExecutor(PRELIFTED_BLOCKS, romBytes, { peripherals: p13 });
  const cpu13 = ex13.cpu;

  for (const entry of validAddresses.slice(0, 20)) {
    resetCpuState(cpu13);
    cpu13._iy = 0xD00080;
    cpu13.sp = 0xD40000;
    cpu13.im = 1;
    cpu13.madl = 1;

    const probeMissing = [];
    const probe = ex13.runFrom(entry.ptr, 'adl', {
      maxSteps: 1000,
      maxLoopIterations: 32,
      onMissingBlock: (pc, mode) => {
        probeMissing.push(pc);
        if (pc > 0 && pc < ROM_LIMIT) test13Seeds.add(pc);
      },
    });
    console.log(`    ${hex(entry.ptr)}: ${probe.steps} steps → ${probe.termination} at ${hex(probe.lastPc)}, missing: ${probeMissing.length}`);
  }
}

// --- Write seeds file ---
console.log('\n--- Test 14: Deep Handler 0x08C331 ---');
const test14Seeds = new Set();
let test14Result = null;
{
  const { memory, executor: ex14, cpu: cpu14 } = createFullMemoryHarness();
  configureOsLikeState(cpu14);

  const ramTracker = createSystemRamWriteTracker(cpu14);
  const deep14 = runExploration(ex14, cpu14, 0x08c331, 'adl', {
    maxSteps: 500000,
    maxLoopIterations: 200,
    onBlock: (pc, mode, meta, step) => {
      ramTracker.setStep(step);
    },
  });
  ramTracker.restore();

  addSeeds(test14Seeds, deep14.missingKeys, deep14.dynamicKeys);

  console.log('Test 14: Deep Handler 0x08C331');
  console.log('================================');
  console.log(`Steps: ${deep14.result.steps}`);
  console.log(`Termination: ${deep14.result.termination} at ${hex(deep14.result.lastPc)}:${deep14.result.lastMode}`);
  console.log(`Unique blocks visited: ${deep14.uniqueBlocks.length}`);
  console.log('Code regions:');
  printRegionCounts(deep14.regionCounts, '  ');
  printList('Missing blocks', deep14.missingKeys, 30, '  ');
  printList('Dynamic targets', deep14.dynamicKeys, 30, '  ');
  printUniqueIoOps(deep14.ioOps, 20);
  console.log(`Memory writes to system RAM (0xD00000-0xD40000): ${ramTracker.totalWrites}`);
  printWriteSample('Writes to 0xD02AD7 (callback ptr)', ramTracker.callbackWriteCount, ramTracker.callbackWrites, 20, '  ');
  printWriteSample('Writes to 0xD02000-0xD03000 range', ramTracker.tableWriteCount, ramTracker.tableWrites, 20, '  ');
  printWriteSample('Writes to 0xD00080-0xD00100 range', ramTracker.iyWriteCount, ramTracker.iyWrites, 20, '  ');
  console.log(`  Callback pointer after run: ${hex(read24Value(memory, PHASE24B_CALLBACK_PTR))}`);

  test14Result = {
    result: deep14.result,
    uniqueBlocks: deep14.uniqueBlocks,
    missingKeys: deep14.missingKeys,
    dynamicKeys: deep14.dynamicKeys,
    ramTracker,
  };
}

console.log('\n--- Test 15: Promising Handler Probe Table ---');
const test15Seeds = new Set();
const test15Results = [];
{
  const handlers = [
    { addr: 0x061db6, label: 'OS subsystem (109→0x586A)' },
    { addr: 0x07c897, label: 'Math deep (270 steps)' },
    { addr: 0x04c952, label: 'OS handler (33 steps)' },
    { addr: 0x08c509, label: 'OS handler area' },
    { addr: 0x08c67c, label: 'OS handler area' },
    { addr: 0x06acb2, label: 'Reached by 0x08C331' },
    { addr: 0x00586a, label: 'Reached by 0x061DB6' },
    { addr: 0x0019b6, label: 'Missing block from ISR' },
    { addr: 0x0032d1, label: 'Missing block from ISR' },
  ];

  for (const handler of handlers) {
    const { executor: ex15, cpu: cpu15 } = createFullMemoryHarness();
    configureOsLikeState(cpu15);

    const probe15 = runExploration(ex15, cpu15, handler.addr, 'adl', {
      maxSteps: 10000,
      maxLoopIterations: 200,
    });

    addSeeds(test15Seeds, probe15.missingKeys, probe15.dynamicKeys);
    test15Results.push({
      ...handler,
      steps: probe15.result.steps,
      termination: probe15.result.termination,
      lastPc: probe15.result.lastPc,
      lastMode: probe15.result.lastMode,
      blocks: probe15.uniqueBlocks.length,
      missing: probe15.missingKeys.length,
      dynamic: probe15.dynamicKeys.length,
      missingKeys: probe15.missingKeys,
      dynamicKeys: probe15.dynamicKeys,
    });
  }

  console.log('  ' + '-'.repeat(130));
  console.log('  ' + 'Address'.padEnd(12) + 'Label'.padEnd(30) + 'Steps'.padEnd(8) + 'Termination'.padEnd(16) + 'Last PC'.padEnd(12) + 'Blocks'.padEnd(8) + 'Missing'.padEnd(9) + 'Dynamic');
  console.log('  ' + '-'.repeat(130));
  for (const entry of test15Results) {
    console.log(
      '  ' +
      hex(entry.addr).padEnd(12) +
      entry.label.padEnd(30) +
      String(entry.steps).padEnd(8) +
      entry.termination.padEnd(16) +
      hex(entry.lastPc).padEnd(12) +
      String(entry.blocks).padEnd(8) +
      String(entry.missing).padEnd(9) +
      String(entry.dynamic)
    );
  }
  console.log('  ' + '-'.repeat(130));
}

console.log('\n--- Test 16: Boot Memory Trace ---');
const test16Seeds = new Set();
let test16Result = null;
{
  const { memory, executor: ex16, cpu: cpu16 } = createFullMemoryHarness();
  resetCpuState(cpu16);

  const ramTracker = createSystemRamWriteTracker(cpu16, { captureAll: true });
  const boot16 = runExploration(ex16, cpu16, 0x000000, 'z80', {
    maxSteps: 5000,
    maxLoopIterations: 32,
    onBlock: (pc, mode, meta, step) => {
      ramTracker.setStep(step);
    },
  });
  ramTracker.restore();

  addSeeds(test16Seeds, boot16.missingKeys, boot16.dynamicKeys);

  console.log('Test 16: Boot Memory Trace');
  console.log('==========================');
  console.log(`Boot: ${boot16.result.steps} steps`);
  console.log(`Termination: ${boot16.result.termination} at ${hex(boot16.result.lastPc)}:${boot16.result.lastMode}`);
  console.log(`System RAM writes (0xD00000-0xD40000): ${ramTracker.totalWrites}`);
  printByteDump('All non-zero bytes in 0xD00080-0xD00100', collectNonZeroBytes(memory, 0xd00080, 0xd00100), '  ');
  printByteDump('All non-zero bytes in 0xD02000-0xD03000', collectNonZeroBytes(memory, 0xd02000, 0xd03000), '  ');
  console.log(`  Value at 0xD02AD7 (callback pointer): ${hex(read24Value(memory, PHASE24B_CALLBACK_PTR))}`);
  printWriteSample('Writes to 0xD005F8-0xD00640 (FP operand area)', ramTracker.fpWriteCount, ramTracker.fpWrites, 40, '  ');

  test16Result = {
    result: boot16.result,
    uniqueBlocks: boot16.uniqueBlocks,
    missingKeys: boot16.missingKeys,
    dynamicKeys: boot16.dynamicKeys,
    ramTracker,
  };
}

console.log('\n--- Test 17: Extended Boot with ISR Cycling (10 wake cycles) ---');
const test17Seeds = new Set();
let test17Result = null;
{
  const { memory, executor: ex17, cpu: cpu17 } = createFullMemoryHarness();
  const cycleRows = [];
  const totalBlocks17 = new Set();
  const totalMissing17 = new Set();
  const totalDynamic17 = new Set();
  const totalRegions17 = new Set();
  const baselineRegions17 = new Set([0x000000, 0x020000, 0x040000]);

  function absorbCycle(exploration) {
    const newBlocks = exploration.uniqueBlocks.filter((key) => !totalBlocks17.has(key));

    for (const key of newBlocks) {
      totalBlocks17.add(key);
    }

    for (const key of exploration.missingKeys) {
      totalMissing17.add(key);
    }

    for (const key of exploration.dynamicKeys) {
      totalDynamic17.add(key);
    }

    for (const entry of exploration.regionCounts) {
      totalRegions17.add(entry.regionStart);
    }

    addSeeds(test17Seeds, exploration.missingKeys, exploration.dynamicKeys);
    return newBlocks.length;
  }

  resetCpuState(cpu17);

  const boot17 = runExploration(ex17, cpu17, 0x000000, 'z80', {
    maxSteps: 5000,
    maxLoopIterations: 32,
  });
  cycleRows.push({
    cycle: 0,
    steps: boot17.result.steps,
    termination: boot17.result.termination,
    lastPc: boot17.result.lastPc,
    newBlocks: absorbCycle(boot17),
    callback: read24Value(memory, PHASE24B_CALLBACK_PTR),
  });

  let lastPc17 = boot17.result.lastPc;
  let lastTermination17 = boot17.result.termination;

  for (let cycle = 1; cycle <= 10; cycle++) {
    if (lastTermination17 !== 'halt') {
      cycleRows.push({
        cycle,
        steps: 0,
        termination: `stopped_after_${lastTermination17}`,
        lastPc: lastPc17,
        newBlocks: 0,
        callback: read24Value(memory, PHASE24B_CALLBACK_PTR),
      });
      break;
    }

    cpu17.halted = false;
    cpu17.im = 1;
    cpu17.iff1 = 1;
    cpu17.iff2 = 1;
    cpu17.push(lastPc17 + 1);

    const wake17 = runExploration(ex17, cpu17, 0x000038, 'adl', {
      maxSteps: 50000,
      maxLoopIterations: 200,
    });
    cycleRows.push({
      cycle,
      steps: wake17.result.steps,
      termination: wake17.result.termination,
      lastPc: wake17.result.lastPc,
      newBlocks: absorbCycle(wake17),
      callback: read24Value(memory, PHASE24B_CALLBACK_PTR),
    });

    lastPc17 = wake17.result.lastPc;
    lastTermination17 = wake17.result.termination;
  }

  const discoveredRegions17 = [...totalRegions17]
    .sort((left, right) => left - right)
    .filter((region) => !baselineRegions17.has(region));

  console.log('Test 17: Extended Boot with ISR Cycling (10 wake cycles)');
  console.log('=========================================================');
  console.log('Cycle  Steps  Termination           Last PC   New Blocks  Callback (0xD02AD7)');
  for (const row of cycleRows) {
    console.log(
      `${String(row.cycle).padStart(5)}  ` +
      `${String(row.steps).padEnd(5)}  ` +
      `${String(row.termination).padEnd(20)} ` +
      `${hex(row.lastPc).padEnd(8)}  ` +
      `${String(row.newBlocks).padEnd(10)} ` +
      `${hex(row.callback)}`
    );
  }
  console.log(`Total unique blocks: ${totalBlocks17.size}`);
  console.log(`Total missing blocks: ${totalMissing17.size}`);
  console.log(`Total dynamic targets: ${totalDynamic17.size}`);
  console.log(
    `New code regions discovered: ${discoveredRegions17.length > 0
      ? discoveredRegions17.map((region) => hex(region)).join(', ')
      : '(none beyond 0x00xxxx, 0x02xxxx, 0x04xxxx)'}`
  );

  test17Result = {
    cycleRows,
    uniqueBlocks: [...totalBlocks17],
    missingKeys: [...totalMissing17],
    dynamicKeys: [...totalDynamic17],
  };
}

// --- Test 18: Pre-initialized callback table via OS init ---
console.log('\n--- Test 18: Pre-initialized Callback Table ---');
const test18Seeds = new Set();
{
  const mem18 = new Uint8Array(0x1000000);
  mem18.set(romBytes);
  const p18 = createPeripheralBus({ trace: false, pllDelay: 2 });
  const ex18 = createExecutor(PRELIFTED_BLOCKS, mem18, { peripherals: p18 });
  const cpu18 = ex18.cpu;

  // Step A: Run OS init (0x08C331) to populate system RAM
  resetCpuState(cpu18);
  cpu18._iy = 0xD00080;
  cpu18.sp = 0xD40000;
  cpu18.im = 1;
  cpu18.madl = 1;

  const init18 = ex18.runFrom(0x08C331, 'adl', { maxSteps: 5000, maxLoopIterations: 200 });
  const cbAfterInit = mem18[0xD02AD7] | (mem18[0xD02AD8] << 8) | (mem18[0xD02AD9] << 16);
  console.log(`  OS init (0x08C331): ${init18.steps} steps → ${init18.termination}`);
  console.log(`  Callback after init: 0xD02AD7 = ${hex(cbAfterInit)}`);

  // Step B: Boot from reset (keep RAM state!)
  resetCpuState(cpu18);
  const boot18 = ex18.runFrom(0x000000, 'z80', { maxSteps: 5000, maxLoopIterations: 32 });
  const cbAfterBoot = mem18[0xD02AD7] | (mem18[0xD02AD8] << 8) | (mem18[0xD02AD9] << 16);
  console.log(`  Boot: ${boot18.steps} steps → ${boot18.termination} at ${hex(boot18.lastPc)}`);
  console.log(`  Callback after boot: 0xD02AD7 = ${hex(cbAfterBoot)}`);

  // Step C: ISR cycling (up to 20 cycles)
  const allBlocks18 = new Set();
  const allMissing18 = new Set();
  const allDynamic18 = new Set();

  console.log(`\n  Cycle  Steps  Termination           Last PC   Callback     New Blocks`);
  for (let cycle = 0; cycle < 20; cycle++) {
    if (cycle === 0) {
      // Boot already ran, count those blocks
      allBlocks18.add(`${hex(boot18.lastPc)}:adl`);
    }

    cpu18.halted = false;
    cpu18.iff1 = 1;
    cpu18.iff2 = 1;
    const retAddr = cpu18.halted ? boot18.lastPc + 1 : boot18.lastPc + 1;
    cpu18.push(retAddr);

    const prevSize = allBlocks18.size;
    const cycleMissing = [];

    const cycleResult = ex18.runFrom(0x000038, 'adl', {
      maxSteps: 100000,
      maxLoopIterations: 200,
      onBlock: (pc, mode) => { allBlocks18.add(`${hex(pc)}:${mode}`); },
      onMissingBlock: (pc, mode) => {
        cycleMissing.push(pc);
        allMissing18.add(`${hex(pc)}:${mode}`);
        if (pc > 0 && pc < ROM_LIMIT) test18Seeds.add(pc);
      },
      onDynamicTarget: (targetPc, mode) => {
        allDynamic18.add(`${hex(targetPc)}:${mode}`);
        if (targetPc > 0 && targetPc < ROM_LIMIT) test18Seeds.add(targetPc);
      },
      onLoopBreak: () => {},
    });

    const cb = mem18[0xD02AD7] | (mem18[0xD02AD8] << 8) | (mem18[0xD02AD9] << 16);
    const newBlocks = allBlocks18.size - prevSize;
    console.log(`  ${String(cycle).padStart(5)}  ${String(cycleResult.steps).padStart(5)}  ${cycleResult.termination.padEnd(20)} ${hex(cycleResult.lastPc)}  ${hex(cb)}  ${newBlocks}`);

    // Stop if stuck at missing block
    if (cycleResult.termination === 'missing_block' && cycleMissing.length > 0) {
      // Try one more cycle
      if (cycle > 0 && cycleResult.steps <= 1) break;
    }
  }

  // Region breakdown
  const regions18 = new Map();
  for (const key of allBlocks18) {
    const pc = parseInt(key.split(':')[0], 16);
    const region = Math.floor(pc / 0x10000) * 0x10000;
    regions18.set(region, (regions18.get(region) || 0) + 1);
  }
  console.log(`\n  Cumulative unique blocks: ${allBlocks18.size}`);
  console.log(`  Code regions:`);
  for (const [region, count] of [...regions18.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`    ${hex(region)}-${hex(region + 0xFFFF)}: ${count} blocks`);
  }
  console.log(`  Missing blocks: ${allMissing18.size}`);
  for (const key of [...allMissing18].slice(0, 20)) console.log(`    ${key}`);
  console.log(`  Dynamic targets: ${allDynamic18.size}`);
  for (const key of [...allDynamic18].slice(0, 20)) console.log(`    ${key}`);
}

// --- Test 19: Keyboard interrupt simulation ---
console.log('\n--- Test 19: Keyboard Interrupt Simulation ---');
const test19Seeds = new Set();
{
  const mem19 = new Uint8Array(0x1000000);
  mem19.set(romBytes);
  const p19 = createPeripheralBus({ trace: false, pllDelay: 2 });
  const ex19 = createExecutor(PRELIFTED_BLOCKS, mem19, { peripherals: p19 });
  const cpu19 = ex19.cpu;

  // OS init
  resetCpuState(cpu19);
  cpu19._iy = 0xD00080; cpu19.sp = 0xD40000; cpu19.im = 1; cpu19.madl = 1;
  ex19.runFrom(0x08C331, 'adl', { maxSteps: 5000, maxLoopIterations: 200 });

  // Boot
  resetCpuState(cpu19);
  const boot19 = ex19.runFrom(0x000000, 'z80', { maxSteps: 5000, maxLoopIterations: 32 });
  console.log(`  Boot: ${boot19.steps} steps → ${boot19.termination}`);

  // ISR with NO key press (baseline)
  cpu19.halted = false; cpu19.iff1 = 1; cpu19.iff2 = 1;
  cpu19.push(boot19.lastPc + 1);

  const noKeyIo = [];
  const noKeyBlocks = new Set();
  const noKey = ex19.runFrom(0x000038, 'adl', {
    maxSteps: 100000, maxLoopIterations: 200,
    onBlock: (pc, mode) => { noKeyBlocks.add(`${hex(pc)}:${mode}`); },
    onMissingBlock: (pc, mode) => { if (pc > 0 && pc < ROM_LIMIT) test19Seeds.add(pc); },
    onDynamicTarget: (tp, mode) => { if (tp > 0 && tp < ROM_LIMIT) test19Seeds.add(tp); },
    onLoopBreak: () => {},
  });
  cpu19.onIoRead = (port, value) => { if ((port & 0xFF) === 0x01) noKeyIo.push({ op: 'read', port, value }); };
  // (I/O hooks set after run won't capture — let's set before the key-press run)

  console.log(`  No key: ${noKey.steps} steps, ${noKeyBlocks.size} blocks`);

  // ISR with ENTER key pressed
  p19.keyboard.keyMatrix[0] = 0xFE; // bit 0 = ENTER, active low
  p19.triggerIRQ();

  cpu19.halted = false; cpu19.iff1 = 1; cpu19.iff2 = 1;
  cpu19.push(boot19.lastPc + 1);

  const keyIo = [];
  const keyBlocks = new Set();
  cpu19.onIoRead = (port, value) => { if ((port & 0xFF) === 0x01) keyIo.push({ op: 'read', port, value }); };
  cpu19.onIoWrite = (port, value) => { if ((port & 0xFF) === 0x01) keyIo.push({ op: 'write', port, value }); };

  const withKey = ex19.runFrom(0x000038, 'adl', {
    maxSteps: 100000, maxLoopIterations: 200,
    onBlock: (pc, mode) => { keyBlocks.add(`${hex(pc)}:${mode}`); },
    onMissingBlock: (pc, mode) => { if (pc > 0 && pc < ROM_LIMIT) test19Seeds.add(pc); },
    onDynamicTarget: (tp, mode) => { if (tp > 0 && tp < ROM_LIMIT) test19Seeds.add(tp); },
    onLoopBreak: () => {},
  });

  console.log(`  ENTER key: ${withKey.steps} steps, ${keyBlocks.size} blocks`);
  console.log(`  Port 0x01 accesses during key-press ISR: ${keyIo.length}`);
  for (const io of keyIo.slice(0, 10)) {
    const dir = io.op === 'write' ? 'OUT' : 'IN ';
    console.log(`    ${dir} port ${hex(io.port, 4)} = ${hex(io.value, 2)}`);
  }
  if (keyIo.length > 10) console.log(`    ... and ${keyIo.length - 10} more`);

  // Diff
  const onlyInKey = [...keyBlocks].filter(b => !noKeyBlocks.has(b));
  const onlyInNoKey = [...noKeyBlocks].filter(b => !keyBlocks.has(b));
  console.log(`  Blocks unique to key-press: ${onlyInKey.length}`);
  for (const b of onlyInKey.slice(0, 10)) console.log(`    ${b}`);
  console.log(`  Blocks unique to no-key: ${onlyInNoKey.length}`);

  // Release key
  p19.keyboard.keyMatrix[0] = 0xFF;
}

// --- Test 20: Handler 0x0040B2 deep dive ---
console.log('\n--- Test 20: Handler 0x0040B2 Deep Dive ---');
const test20Seeds = new Set();
{
  const mem20 = new Uint8Array(0x1000000);
  mem20.set(romBytes);
  const p20 = createPeripheralBus({ trace: false, pllDelay: 2 });
  const ex20 = createExecutor(PRELIFTED_BLOCKS, mem20, { peripherals: p20 });
  const cpu20 = ex20.cpu;

  // OS init first
  resetCpuState(cpu20);
  cpu20._iy = 0xD00080; cpu20.sp = 0xD40000; cpu20.im = 1; cpu20.madl = 1;
  ex20.runFrom(0x08C331, 'adl', { maxSteps: 5000, maxLoopIterations: 200 });

  // Run handler directly
  resetCpuState(cpu20);
  cpu20._iy = 0xD00080; cpu20.sp = 0xD40000; cpu20.im = 1; cpu20.madl = 1;

  const blocks20 = [];
  const missing20 = [];
  const dynamic20 = [];
  const io20 = [];

  cpu20.onIoRead = (port, value) => { io20.push({ op: 'read', port, value }); };
  cpu20.onIoWrite = (port, value) => { io20.push({ op: 'write', port, value }); };

  const run20 = ex20.runFrom(0x0040B2, 'adl', {
    maxSteps: 100000, maxLoopIterations: 200,
    onBlock: (pc, mode) => { blocks20.push({ pc, mode }); },
    onMissingBlock: (pc, mode) => {
      missing20.push({ pc, mode });
      if (pc > 0 && pc < ROM_LIMIT) test20Seeds.add(pc);
    },
    onDynamicTarget: (tp, mode) => {
      dynamic20.push({ tp, mode });
      if (tp > 0 && tp < ROM_LIMIT) test20Seeds.add(tp);
    },
    onLoopBreak: () => {},
  });

  const uniqueBlocks20 = new Set(blocks20.map(b => `${hex(b.pc)}:${b.mode}`));
  const uniqueMissing20 = [...new Set(missing20.map(m => `${hex(m.pc)}:${m.mode}`))];
  const uniqueDynamic20 = [...new Set(dynamic20.map(d => `${hex(d.tp)}:${d.mode}`))];

  console.log(`  Steps: ${run20.steps}, termination: ${run20.termination} at ${hex(run20.lastPc)}`);
  console.log(`  Unique blocks: ${uniqueBlocks20.size}`);

  const regions20 = new Map();
  for (const b of blocks20) {
    const region = Math.floor(b.pc / 0x10000) * 0x10000;
    regions20.set(region, (regions20.get(region) || 0) + 1);
  }
  console.log(`  Code regions:`);
  for (const [region, count] of [...regions20.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`    ${hex(region)}-${hex(region + 0xFFFF)}: ${count} blocks`);
  }

  // Port 0x01 accesses
  const port01 = io20.filter(io => (io.port & 0xFF) === 0x01);
  console.log(`  Port 0x01 accesses: ${port01.length}`);
  for (const io of port01.slice(0, 10)) {
    const dir = io.op === 'write' ? 'OUT' : 'IN ';
    console.log(`    ${dir} ${hex(io.port, 4)} = ${hex(io.value, 2)}`);
  }

  // Unique I/O ports
  const uniquePorts = [...new Set(io20.map(io => io.port))].sort((a, b) => a - b);
  console.log(`  Unique I/O ports: ${uniquePorts.length}`);
  for (const port of uniquePorts.slice(0, 20)) console.log(`    ${hex(port, 4)}`);

  console.log(`  Missing blocks: ${uniqueMissing20.length}`);
  for (const key of uniqueMissing20.slice(0, 20)) console.log(`    ${key}`);
  console.log(`  Dynamic targets: ${uniqueDynamic20.length}`);
  for (const key of uniqueDynamic20.slice(0, 20)) console.log(`    ${key}`);
}

console.log('\n--- Phase 24 Seed Collection ---');
{
  const phase24BSeeds = collectSeedAddresses(
    [...test11Seeds],
    [...test12Seeds],
    [...test13Seeds],
    PHASE24B_KNOWN_SEEDS,
  );
  const phase24CSeeds = collectSeedAddresses(
    [...test14Seeds],
    [...test15Seeds],
    [...test16Seeds],
    [...test17Seeds],
  );
  const phase24DSeeds = collectSeedAddresses(
    [...test18Seeds],
    [...test19Seeds],
    [...test20Seeds],
  );

  console.log(`  Seeds from Test 11: ${test11Seeds.size}`);
  console.log(`  Seeds from Test 12: ${test12Seeds.size}`);
  console.log(`  Seeds from Test 13: ${test13Seeds.size}`);
  console.log(`  Seeds from Test 14: ${test14Seeds.size}`);
  console.log(`  Seeds from Test 15: ${test15Seeds.size}`);
  console.log(`  Seeds from Test 16: ${test16Seeds.size}`);
  console.log(`  Seeds from Test 17: ${test17Seeds.size}`);
  console.log(`  Seeds from Test 18: ${test18Seeds.size}`);
  console.log(`  Seeds from Test 19: ${test19Seeds.size}`);
  console.log(`  Seeds from Test 20: ${test20Seeds.size}`);
  console.log(`  Total unique Phase 24B seeds: ${phase24BSeeds.length}`);
  console.log(`  Total unique Phase 24C seeds: ${phase24CSeeds.length}`);
  console.log(`  Total unique Phase 24D seeds: ${phase24DSeeds.length}`);

  let existingContents = '';
  try {
    existingContents = readFileSync(PHASE24B_SEEDS_PATH, 'utf8');
  } catch {
    existingContents = '';
  }

  if (existingContents.trim().length === 0 && phase24BSeeds.length > 0) {
    const lines = [
      '# Phase 24B seeds — ISR dispatch exploration',
      '# Generated by test-harness.mjs Tests 11-13',
      ...phase24BSeeds.map(formatSeedAddress),
    ];
    writeFileSync(PHASE24B_SEEDS_PATH, lines.join('\n') + '\n');
    existingContents = readFileSync(PHASE24B_SEEDS_PATH, 'utf8');
    console.log(`  Wrote baseline Phase 24B seeds: ${PHASE24B_SEEDS_PATH}`);
  }

  const existingSeeds = new Set(
    existingContents
      .split(/\r?\n/)
      .filter((line) => /^0x[0-9a-f]{6}$/i.test(line))
      .map((line) => Number.parseInt(line, 16))
  );
  const newPhase24CSeeds = phase24CSeeds.filter((value) => !existingSeeds.has(value));

  if (newPhase24CSeeds.length > 0) {
    const prefix = existingContents.trim().length > 0 ? '\n' : '';
    const lines = [
      '# Phase 24C seeds - deep handler exploration + boot trace',
      '# Generated by test-harness.mjs Tests 14-17',
      ...newPhase24CSeeds.map(formatSeedAddress),
    ];
    appendFileSync(PHASE24B_SEEDS_PATH, `${prefix}${lines.join('\n')}\n`);
    console.log(`  Appended ${newPhase24CSeeds.length} Phase 24C seeds to: ${PHASE24B_SEEDS_PATH}`);
  } else {
    console.log('  No new Phase 24C seeds to append.');
  }

  // Append Phase 24D seeds
  const updated24Contents = readFileSync(PHASE24B_SEEDS_PATH, 'utf8');
  const updated24Existing = new Set(
    updated24Contents.split(/\r?\n/)
      .filter((line) => /^0x[0-9a-f]{6}$/i.test(line))
      .map((line) => Number.parseInt(line, 16))
  );
  const newPhase24DSeeds = phase24DSeeds.filter((value) => !updated24Existing.has(value));
  if (newPhase24DSeeds.length > 0) {
    const lines = [
      '# Phase 24D seeds — pre-initialized callback + keyboard chain',
      '# Generated by test-harness.mjs Tests 18-20',
      ...newPhase24DSeeds.map(formatSeedAddress),
    ];
    appendFileSync(PHASE24B_SEEDS_PATH, `\n${lines.join('\n')}\n`);
    console.log(`  Appended ${newPhase24DSeeds.length} Phase 24D seeds to: ${PHASE24B_SEEDS_PATH}`);
  } else {
    console.log('  No new Phase 24D seeds to append.');
  }
}

// --- Summary ---
console.log(`\n${'='.repeat(60)}`);
console.log('SUMMARY');
console.log(`${'='.repeat(60)}`);
console.log(`  Test 1 (reset vector):  ${test1.steps} steps, terminated: ${test1.termination}`);
console.log(`  Test 2 (startup):       ${test2.steps} steps, terminated: ${test2.termination}`);
console.log(`  Test 3 (extended):      ${test3.steps} steps, terminated: ${test3.termination}`);
console.log(`  Test 4 (peripheral):   ${test4.steps} steps, terminated: ${test4.termination}, loops forced: ${test4.loopsForced}`);
console.log(`  Test 5 (multi-entry):  ${multiResults.length} entry points tested, ${deepRuns.length} reached >100 steps`);
console.log(`  Test 6 (NMI wake):     ${test6.steps} steps, terminated: ${test6.termination}, dynamic: ${nmiDynamic.length}`);
console.log(`  Test 7 (IM1 wake):     ${test7.steps} steps, terminated: ${test7.termination}, dynamic: ${im1Dynamic.length}`);
console.log(`  Test 8 (timer NMI):    ${test8.steps} steps, terminated: ${test8.termination}, interrupts: ${intInterrupts.length}`);
console.log(`  Test 14 (deep OS):     ${test14Result.result.steps} steps, terminated: ${test14Result.result.termination}, blocks: ${test14Result.uniqueBlocks.length}`);
console.log(`  Test 15 (probes):      ${test15Results.length} handlers tested, seeds: ${test15Seeds.size}`);
console.log(`  Test 16 (boot trace):  ${test16Result.result.steps} steps, terminated: ${test16Result.result.termination}, RAM writes: ${test16Result.ramTracker.totalWrites}`);
console.log(`  Test 17 (ISR cycles):  ${test17Result.cycleRows.length - 1} wake cycles, blocks: ${test17Result.uniqueBlocks.length}, missing: ${test17Result.missingKeys.length}`);

// --- Compilation stats ---
const totalBlocks = Object.keys(PRELIFTED_BLOCKS).length;
const compiledBlocks = Object.keys(executor.compiledBlocks).length;
const failedBlocks = totalBlocks - compiledBlocks;
console.log(`\n  Blocks: ${compiledBlocks} compiled / ${totalBlocks} total (${failedBlocks} failed)`);

if (failedBlocks > 0) {
  console.log('  Failed block keys (first 10):');
  const allKeys = Object.keys(PRELIFTED_BLOCKS);
  const compiledKeys = new Set(Object.keys(executor.compiledBlocks));
  let count = 0;
  for (const key of allKeys) {
    if (!compiledKeys.has(key)) {
      console.log(`    - ${key}`);
      if (++count >= 10) break;
    }
  }
}

// --- Discovery Summary ---
console.log(`\n${'='.repeat(60)}`);
console.log('DISCOVERY SUMMARY â€” Potential New Seeds');
console.log(`${'='.repeat(60)}`);

const allMissing = new Set();
// Gather from test4's result
if (test4.missingBlocks) {
  for (const key of test4.missingBlocks) allMissing.add(key);
}
// Gather from multi-entry results
for (const r of multiResults) {
  if (r.missingBlocksFound) {
    for (const m of r.missingBlocksFound) {
      allMissing.add('0x' + m.pc.toString(16).padStart(6, '0') + ':' + m.mode);
    }
  }
}

console.log(`  Total unique missing block addresses: ${allMissing.size}`);
const sorted = [...allMissing].sort();
for (const key of sorted.slice(0, 20)) {
  console.log(`    ${key}`);
}
if (sorted.length > 20) {
  console.log(`    ... and ${sorted.length - 20} more`);
}

const allDynamic = new Set();
for (const r of multiResults) {
  if (r.dynamicTargets) {
    for (const d of r.dynamicTargets) {
      allDynamic.add('0x' + d.targetPc.toString(16).padStart(6, '0') + ':' + d.mode);
    }
  }
}
for (const d of nmiDynamic) {
  allDynamic.add('0x' + d.targetPc.toString(16).padStart(6, '0') + ':' + d.mode);
}
for (const d of im1Dynamic) {
  allDynamic.add('0x' + d.targetPc.toString(16).padStart(6, '0') + ':' + d.mode);
}
if (test6.missingBlocks) {
  for (const key of test6.missingBlocks) allMissing.add(key);
}
if (test7.missingBlocks) {
  for (const key of test7.missingBlocks) allMissing.add(key);
}
if (test14Result) {
  for (const key of test14Result.missingKeys) allMissing.add(key);
  for (const key of test14Result.dynamicKeys) allDynamic.add(key);
}
for (const entry of test15Results) {
  for (const key of entry.missingKeys) allMissing.add(key);
  for (const key of entry.dynamicKeys) allDynamic.add(key);
}
if (test16Result) {
  for (const key of test16Result.missingKeys) allMissing.add(key);
  for (const key of test16Result.dynamicKeys) allDynamic.add(key);
}
if (test17Result) {
  for (const key of test17Result.missingKeys) allMissing.add(key);
  for (const key of test17Result.dynamicKeys) allDynamic.add(key);
}

if (allDynamic.size > 0) {
  console.log(`\n  Dynamic jump targets discovered: ${allDynamic.size}`);
  const sortedDynamic = [...allDynamic].sort();
  for (const key of sortedDynamic.slice(0, 30)) {
    console.log(`    ${key}`);
  }
  if (sortedDynamic.length > 30) {
    console.log(`    ... and ${sortedDynamic.length - 30} more`);
  }
}

if (test4.blockVisits) {
  const visits = Object.entries(test4.blockVisits)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  console.log(`\n  Hot blocks (Test 4, top 15 by visit count):`);
  for (const [key, count] of visits) {
    console.log(`    ${key}: ${count} visits`);
  }
}

console.log('\n--- Test 21: Keyboard -> _GetCSC -> Scan Code ---');
{
  const p21 = createPeripheralBus({ trace: false, pllDelay: 2 });
  const keyboard21 = createKeyboardManager(p21);
  const mem21 = new Uint8Array(0x1000000);
  mem21.set(romBytes);
  const ex21 = createExecutor(PRELIFTED_BLOCKS, mem21, { peripherals: p21 });
  const cpu21 = ex21.cpu;
  const enterEvent = { code: 'Enter', preventDefault() {} };

  function prepareGetCscCall() {
    cpu21.sp = 0xD1A87E;
    cpu21._iy = 0xD00080;
    cpu21.halted = false;
    cpu21.iff1 = 1;
    cpu21.iff2 = 1;
    cpu21.madl = 1;

    cpu21.sp -= 3;
    mem21[cpu21.sp] = 0xFF;
    mem21[cpu21.sp + 1] = 0xFF;
    mem21[cpu21.sp + 2] = 0xFF;
  }

  ex21.runFrom(0x000000, 'z80', { maxSteps: 200, maxLoopIterations: 32 });

  // Phase 24F verified: Enter = group 6, bit 0 -> scan code 0x60.
  keyboard21.handleKeyDown(enterEvent);
  p21.write(0x5006, 0x08);
  prepareGetCscCall();

  const result21 = ex21.runFrom(0x03CF7D, 'adl', {
    maxSteps: 500,
    maxLoopIterations: 64,
  });

  const scanCode21 = cpu21.a;
  console.log(`  _GetCSC returned A=0x${scanCode21.toString(16).padStart(2, '0')}`);
  console.log(`  Steps: ${result21.steps}, Termination: ${result21.termination}`);
  console.log('  Expected scan code for ENTER: 0x60 (group 6, bit 0)');
  console.log(`  Result: ${scanCode21 === 0x60 ? 'PASS' : scanCode21 !== 0 ? 'PARTIAL (got scan code but wrong value)' : 'FAIL (no scan code)'}`);

  keyboard21.handleKeyUp(enterEvent);
  prepareGetCscCall();

  const result21b = ex21.runFrom(0x03CF7D, 'adl', {
    maxSteps: 500,
    maxLoopIterations: 64,
  });

  console.log(`  No-key: A=0x${cpu21.a.toString(16).padStart(2, '0')} (expected 0x00)`);
  console.log(`  No-key steps: ${result21b.steps}, Termination: ${result21b.termination}`);
  console.log(`  No-key result: ${cpu21.a === 0 ? 'PASS' : 'FAIL'}`);
}

console.log('\n--- Test 22: VRAM Write -> Read Verification ---');
{
  const mem22 = new Uint8Array(0x1000000);
  const VRAM_BASE = 0xD40000;
  const VRAM_SIZE = 320 * 240 * 2;

  mem22[VRAM_BASE + 0] = 0x00;
  mem22[VRAM_BASE + 1] = 0xF8;

  mem22[VRAM_BASE + 2] = 0xE0;
  mem22[VRAM_BASE + 3] = 0x07;

  mem22[VRAM_BASE + 4] = 0x1F;
  mem22[VRAM_BASE + 5] = 0x00;

  mem22[VRAM_BASE + 6] = 0xFF;
  mem22[VRAM_BASE + 7] = 0xFF;

  function readPixel(offset) {
    const lo = mem22[VRAM_BASE + offset];
    const hi = mem22[VRAM_BASE + offset + 1];
    const pixel = lo | (hi << 8);
    const r5 = (pixel >> 11) & 0x1F;
    const g6 = (pixel >> 5) & 0x3F;
    const b5 = pixel & 0x1F;
    return { raw: pixel, r5, g6, b5 };
  }

  const px0 = readPixel(0);
  const px1 = readPixel(2);
  const px2 = readPixel(4);
  const px3 = readPixel(6);

  console.log(`  Pixel 0 (Red):   raw=0x${px0.raw.toString(16).padStart(4, '0')} R=${px0.r5} G=${px0.g6} B=${px0.b5} -> ${px0.r5 === 31 && px0.g6 === 0 && px0.b5 === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`  Pixel 1 (Green): raw=0x${px1.raw.toString(16).padStart(4, '0')} R=${px1.r5} G=${px1.g6} B=${px1.b5} -> ${px1.r5 === 0 && px1.g6 === 63 && px1.b5 === 0 ? 'PASS' : 'FAIL'}`);
  console.log(`  Pixel 2 (Blue):  raw=0x${px2.raw.toString(16).padStart(4, '0')} R=${px2.r5} G=${px2.g6} B=${px2.b5} -> ${px2.r5 === 0 && px2.g6 === 0 && px2.b5 === 31 ? 'PASS' : 'FAIL'}`);
  console.log(`  Pixel 3 (White): raw=0x${px3.raw.toString(16).padStart(4, '0')} R=${px3.r5} G=${px3.g6} B=${px3.b5} -> ${px3.r5 === 31 && px3.g6 === 63 && px3.b5 === 31 ? 'PASS' : 'FAIL'}`);
  console.log(`  VRAM size: ${VRAM_SIZE} bytes (0x${VRAM_SIZE.toString(16)}) at 0x${VRAM_BASE.toString(16)}-0x${(VRAM_BASE + VRAM_SIZE - 1).toString(16)}`);
  console.log(`  ${VRAM_BASE + VRAM_SIZE <= 0x1000000 ? 'PASS' : 'FAIL'}: VRAM fits in 16MB address space`);
}

// ---------------------------------------------------------------------------
// Test 23: OS Event Loop — Pre-initialized callback + system flags
// Goal: Does the ISR reach deeper OS code (keyboard scan, LCD write) when
//       we set up the callback table and system flags before triggering?
// ---------------------------------------------------------------------------
console.log('\n--- Test 23: OS Event Loop — Pre-initialized Callback ---');
{
  const p23 = createPeripheralBus({ trace: false, pllDelay: 2 });
  const mem23 = new Uint8Array(0x1000000);
  mem23.set(romBytes);
  const ex23 = createExecutor(PRELIFTED_BLOCKS, mem23, { peripherals: p23 });
  const cpu23 = ex23.cpu;

  // Step A: Boot to HALT
  resetCpuState(cpu23);
  const boot23 = ex23.runFrom(0x000000, 'z80', { maxSteps: 5000, maxLoopIterations: 32 });
  console.log(`  Boot: ${boot23.steps} steps → ${boot23.termination} at ${hex(boot23.lastPc)}`);

  // Step B: Initialize callback table → OS event loop
  const cbTarget = PHASE24B_CALLBACK_TARGET; // 0x0019BE
  mem23[0xD02AD7] = cbTarget & 0xFF;
  mem23[0xD02AD8] = (cbTarget >> 8) & 0xFF;
  mem23[0xD02AD9] = (cbTarget >> 16) & 0xFF;

  // Set system flags: (IY+27) bit 6 = ISR dispatch ready
  // IY = 0xD00080 (set during boot at step 77), so IY+27 = 0xD0009B
  mem23[0xD0009B] |= 0x40;

  // Set keyboard IRQ: press ENTER (group 6, bit 0 — Phase 24F verified)
  p23.keyboard.keyMatrix[6] = 0xFE;
  p23.setKeyboardIRQ(true);
  // Enable keyboard in interrupt controller
  p23.write(0x5006, 0x08); // enable mask byte 2, bit 3 = bit 19

  console.log(`  Callback: 0xD02AD7 = ${hex(cbTarget)}`);
  console.log(`  System flag (IY+27): 0x${hex(mem23[0xD0009B], 2)}`);
  console.log(`  Keyboard: ENTER pressed, IRQ bit 19 set`);

  // Step C: Wake CPU and run ISR
  cpu23.halted = false;
  cpu23.iff1 = 1;
  cpu23.iff2 = 1;
  cpu23.sp = 0xD1A87E;
  cpu23.push(boot23.lastPc + 1);

  const blocks23 = new Set();
  const regions23 = new Map(); // region → block count
  const ioAccesses23 = [];
  const missing23 = new Set();
  const vramWrites23 = [];

  const isr23 = ex23.runFrom(0x000038, 'adl', {
    maxSteps: 100000,
    maxLoopIterations: 200,
    onBlock: (pc, mode) => {
      blocks23.add(`${hex(pc)}:${mode}`);
      const region = (pc >> 16) & 0xFF;
      regions23.set(region, (regions23.get(region) || 0) + 1);
    },
    onMissingBlock: (pc, mode) => { if (pc > 0 && pc < 0x100000) missing23.add(hex(pc)); },
  });

  // Check VRAM for any pixel writes
  let vramNonZero = 0;
  for (let i = 0xD40000; i < 0xD40000 + 320 * 240 * 2; i++) {
    if (mem23[i] !== 0) vramNonZero++;
  }

  // Check if callback pointer changed
  const cbAfter = read24Value(mem23, PHASE24B_CALLBACK_PTR);

  console.log(`\n  ISR: ${isr23.steps} steps → ${isr23.termination} at ${hex(isr23.lastPc)}`);
  console.log(`  Unique blocks: ${blocks23.size}`);
  console.log(`  Code regions:`);
  for (const [region, count] of [...regions23.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    0x${hex(region, 2)}xxxx: ${count} blocks`);
  }
  console.log(`  Missing blocks: ${missing23.size}${missing23.size > 0 ? ' → ' + [...missing23].slice(0, 10).join(', ') : ''}`);
  console.log(`  Callback after: ${hex(cbAfter)}${cbAfter !== cbTarget ? ' (CHANGED!)' : ''}`);
  console.log(`  VRAM non-zero bytes: ${vramNonZero}${vramNonZero > 0 ? ' ← LCD ACTIVITY!' : ''}`);
  console.log(`  A=${hex(cpu23.a, 2)} F=${hex(cpu23.f, 2)} PC=${hex(isr23.lastPc)}`);

  // Step D: Run multiple ISR cycles to let the event loop evolve
  console.log(`\n  --- ISR Cycling (5 rounds) ---`);
  for (let cycle = 0; cycle < 5; cycle++) {
    cpu23.halted = false;
    cpu23.iff1 = 1;
    cpu23.iff2 = 1;
    cpu23.sp = 0xD1A87E;
    cpu23.sp -= 3;
    mem23[cpu23.sp] = 0xFF; mem23[cpu23.sp + 1] = 0xFF; mem23[cpu23.sp + 2] = 0xFF;

    const cycleMissing = [];
    const cycleResult = ex23.runFrom(0x000038, 'adl', {
      maxSteps: 50000,
      maxLoopIterations: 200,
      onMissingBlock: (pc, mode) => { cycleMissing.push(hex(pc)); },
    });

    const cb = read24Value(mem23, PHASE24B_CALLBACK_PTR);
    let vramNow = 0;
    for (let i = 0xD40000; i < 0xD40000 + 64; i++) { if (mem23[i] !== 0) vramNow++; }

    const missInfo = cycleMissing.length > 0 ? ` missing=[${[...new Set(cycleMissing)].join(',')}]` : '';
    console.log(`  Cycle ${cycle}: ${cycleResult.steps} steps → ${cycleResult.termination} | cb=${hex(cb)} | vram=${vramNow > 0 ? vramNow + ' non-zero' : 'empty'}${missInfo}`);
  }
}

// ---------------------------------------------------------------------------
// Test 24: _GetCSC Scan Code Mapping — Trace execution + multi-key test
// Goal: Build the _GetCSC scan code table by testing multiple keys and
//       tracing the handler's execution path block-by-block.
// ---------------------------------------------------------------------------
console.log('\n--- Test 24: _GetCSC Scan Code Mapping ---');
{
  // Timer disabled — _GetCSC must run without IRQ interference
  const p24 = createPeripheralBus({ trace: false, pllDelay: 2, timerInterrupt: false });
  const mem24 = new Uint8Array(0x1000000);
  mem24.set(romBytes);
  const ex24 = createExecutor(PRELIFTED_BLOCKS, mem24, { peripherals: p24 });
  const cpu24 = ex24.cpu;

  // Boot (timer off = no interrupt wake, just run to HALT)
  ex24.runFrom(0x000000, 'z80', { maxSteps: 5000, maxLoopIterations: 32 });

  // Enable keyboard in interrupt controller
  p24.write(0x5006, 0x08);

  function callGetCSC() {
    cpu24.sp = 0xD1A87E;
    cpu24._iy = 0xD00080;
    cpu24.halted = false;
    cpu24.iff1 = 0;  // Disable IRQs — _GetCSC polls the intc register directly
    cpu24.iff2 = 0;
    cpu24.madl = 1;
    cpu24.sp -= 3;
    mem24[cpu24.sp] = 0xFF; mem24[cpu24.sp + 1] = 0xFF; mem24[cpu24.sp + 2] = 0xFF;

    // Re-set interrupt controller right before call (boot may have cleared it)
    p24.write(0x5006, 0x08); // enable mask byte 2, bit 3 = keyboard IRQ bit 19

    return ex24.runFrom(0x03CF7D, 'adl', {
      maxSteps: 500,
      maxLoopIterations: 64,
    });
  }

  // Diagnostic: verify port 0x5016 returns expected value
  p24.setKeyboardIRQ(true);
  p24.write(0x5006, 0x08);
  const port5016 = p24.read(0x5016);
  console.log(`  Port 0x5016 diagnostic: 0x${hex(port5016, 2)} (expect 0x08 if keyboard IRQ set)`);
  p24.setKeyboardIRQ(false);

  // Phase 24F verified keys: group, bit, expected raw MMIO code
  const testKeys = [
    { name: 'ENTER',  group: 6, bit: 0, rawMmio: 0x60 },
    { name: 'CLEAR',  group: 6, bit: 1, rawMmio: 0x61 },
    { name: '2ND',    group: 6, bit: 5, rawMmio: 0x65 },
    { name: 'RIGHT',  group: 0, bit: 2, rawMmio: 0x02 },
    { name: 'Y=',     group: 5, bit: 4, rawMmio: 0x54 },
    { name: 'GRAPH',  group: 4, bit: 0, rawMmio: 0x40 },
    { name: '+',      group: 1, bit: 1, rawMmio: 0x11 },
    { name: '0',      group: 3, bit: 0, rawMmio: 0x30 },
    { name: 'no key', group: -1, bit: -1, rawMmio: 0x00 },
  ];

  console.log('  Key          Group  Bit  Raw(MMIO)  _GetCSC(A)  Steps  Term');
  console.log('  ' + '-'.repeat(70));

  const scanCodeMap = [];

  for (const key of testKeys) {
    // Reset keyboard
    p24.keyboard.keyMatrix.fill(0xFF);

    if (key.group >= 0) {
      p24.keyboard.keyMatrix[key.group] &= ~(1 << key.bit);
      p24.setKeyboardIRQ(true);
    } else {
      p24.setKeyboardIRQ(false);
    }

    const result = callGetCSC();
    const getCscCode = cpu24.a;

    scanCodeMap.push({ ...key, getCscCode });

    const rawStr = `0x${hex(key.rawMmio, 2)}`;
    const getCscStr = `0x${hex(getCscCode, 2)}`;
    console.log(`  ${key.name.padEnd(12)} ${key.group >= 0 ? key.group : '-'}      ${key.bit >= 0 ? key.bit : '-'}    ${rawStr.padEnd(10)} ${getCscStr.padEnd(11)} ${result.steps.toString().padEnd(6)} ${result.termination}`);
  }

  // Detailed trace of ENTER key through _GetCSC
  console.log('\n  --- Detailed Trace: ENTER key through _GetCSC ---');
  p24.keyboard.keyMatrix.fill(0xFF);
  p24.keyboard.keyMatrix[6] = 0xFE; // ENTER
  p24.setKeyboardIRQ(true);

  cpu24.sp = 0xD1A87E;
  cpu24._iy = 0xD00080;
  cpu24.halted = false;
  cpu24.iff1 = 0;
  cpu24.iff2 = 0;
  cpu24.madl = 1;
  cpu24.sp -= 3;
  mem24[cpu24.sp] = 0xFF; mem24[cpu24.sp + 1] = 0xFF; mem24[cpu24.sp + 2] = 0xFF;

  const traceBlocks = [];
  const traceResult = ex24.runFrom(0x03CF7D, 'adl', {
    maxSteps: 500,
    maxLoopIterations: 64,
    onBlock: (pc, mode, meta, step) => {
      const dasm = meta?.instructions?.[0]?.dasm ?? '???';
      traceBlocks.push({ step, pc: hex(pc), mode, dasm, a: cpu24.a });
    },
  });

  for (const b of traceBlocks) {
    console.log(`    [${b.step}] ${b.pc}:${b.mode} A=${hex(b.a, 2)} ${b.dasm}`);
  }
  console.log(`  Final: A=0x${hex(cpu24.a, 2)} (${traceResult.steps} steps, ${traceResult.termination})`);

  // Summary: does _GetCSC use a different encoding than raw MMIO?
  const mismatches = scanCodeMap.filter(k => k.group >= 0 && k.getCscCode !== k.rawMmio && k.getCscCode !== 0);
  if (mismatches.length > 0) {
    console.log(`\n  _GetCSC uses DIFFERENT encoding than raw MMIO for ${mismatches.length} key(s):`);
    for (const m of mismatches) {
      console.log(`    ${m.name}: MMIO=0x${hex(m.rawMmio, 2)} vs _GetCSC=0x${hex(m.getCscCode, 2)}`);
    }
  } else {
    console.log('\n  _GetCSC encoding matches raw MMIO for all tested keys.');
  }
}

console.log('\nDone.');
process.exit(0);
