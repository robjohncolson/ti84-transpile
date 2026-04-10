// Phase 5 test harness — validate transpiled ROM executor
// Run: node TI-84_Plus_CE/test-harness.mjs

import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { TRANSPILATION_META, ENTRY_POINTS, PRELIFTED_BLOCKS, decodeEmbeddedRom } from './ROM.transpiled.js';
import { CPU, createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

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

  console.log(`  Seeds from Test 11: ${test11Seeds.size}`);
  console.log(`  Seeds from Test 12: ${test12Seeds.size}`);
  console.log(`  Seeds from Test 13: ${test13Seeds.size}`);
  console.log(`  Seeds from Test 14: ${test14Seeds.size}`);
  console.log(`  Seeds from Test 15: ${test15Seeds.size}`);
  console.log(`  Seeds from Test 16: ${test16Seeds.size}`);
  console.log(`  Seeds from Test 17: ${test17Seeds.size}`);
  console.log(`  Total unique Phase 24B seeds: ${phase24BSeeds.length}`);
  console.log(`  Total unique Phase 24C seeds: ${phase24CSeeds.length}`);

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

console.log('\nDone.');
process.exit(0);
