// Phase 5 test harness — validate transpiled ROM executor
// Run: node TI-84_Plus_CE/test-harness.mjs

import { TRANSPILATION_META, ENTRY_POINTS, PRELIFTED_BLOCKS, decodeEmbeddedRom } from './ROM.transpiled.js';
import { CPU, createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

function hex(v, w = 6) {
  return '0x' + v.toString(16).padStart(w, '0');
}

// --- Decode ROM ---
console.log('=== TI-84 Plus CE ROM Executor Test Harness ===\n');
console.log('Transpilation meta:', JSON.stringify(TRANSPILATION_META, null, 2));
console.log(`\nEntry points: ${ENTRY_POINTS.length}`);
console.log(`Total blocks: ${Object.keys(PRELIFTED_BLOCKS).length}\n`);

console.log('Decoding ROM...');
const romBytes = decodeEmbeddedRom();
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
  const result = executor.runFrom(ep.addr, ep.mode, {
    maxSteps: 5000,
    maxLoopIterations: 64,
    onMissingBlock: (pc, mode, step) => {
      epMissing.push({ pc, mode, step });
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

// --- Summary ---
console.log(`\n${'='.repeat(60)}`);
console.log('SUMMARY');
console.log(`${'='.repeat(60)}`);
console.log(`  Test 1 (reset vector):  ${test1.steps} steps, terminated: ${test1.termination}`);
console.log(`  Test 2 (startup):       ${test2.steps} steps, terminated: ${test2.termination}`);
console.log(`  Test 3 (extended):      ${test3.steps} steps, terminated: ${test3.termination}`);
console.log(`  Test 4 (peripheral):   ${test4.steps} steps, terminated: ${test4.termination}, loops forced: ${test4.loopsForced}`);
console.log(`  Test 5 (multi-entry):  ${multiResults.length} entry points tested, ${deepRuns.length} reached >100 steps`);

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

console.log('\nDone.');
process.exit(0);
