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
