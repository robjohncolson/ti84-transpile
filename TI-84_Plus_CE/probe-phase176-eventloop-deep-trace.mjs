#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { PRELIFTED_BLOCKS } from './ROM.transpiled.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');
if (!fs.existsSync(romPath)) throw new Error(`Missing ${romPath}`);
const romBytes = fs.readFileSync(romPath);

const MEM_SIZE = 0x1000000;
const BOOT_ENTRY = 0x000000;
const IRQ_VECTOR = 0x000038;
const CALLBACK_PTR = 0xd02ad7;
const EVENT_LOOP = 0x0019be;
const HALT_ADDR = 0x0019b5;
const HALT_PCS = new Set([0x0019b5, 0x0019b6]);
const STACK_TOP = 0xd1a87e;
const SYS_FLAG_ADDR = 0xd0009b;
const SYS_FLAG_MASK = 0x40;
const ENTER_GROUP = 1;
const ENTER_PRESSED = 0xfe;
const NO_KEYS_PRESSED = 0xff;
const INTC_RAW_STATUS_PORT = 0x5000;
const INTC_ENABLE_MASK_PORT = 0x5004;
const INTC_MASKED_STATUS_PORT = 0x5014;
const INTC_KEYBOARD_ENABLE_PORT = 0x5006;
const INTC_KEYBOARD_MASK = 0x08;
const WARMUP_MAX_STEPS = 100000;
const CYCLE_COUNT = 10;
const CYCLE_MAX_STEPS = 2000;
const MAX_LOOP_ITERATIONS = 200;
const SENTINEL_RETURN = 0xffffff;
const TARGET_BLOCK = 0x00b608;
const VRAM_START = 0xd40000;
const VRAM_END_EXCLUSIVE = 0xd52c00;

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function blockKey(pc, mode = 'adl') {
  return `${(pc >>> 0).toString(16).padStart(6, '0')}:${mode}`;
}

function write24(memory, addr, value) {
  memory[addr] = value & 0xff;
  memory[addr + 1] = (value >> 8) & 0xff;
  memory[addr + 2] = (value >> 16) & 0xff;
}

function read24(memory, addr) {
  return memory[addr] | (memory[addr + 1] << 8) | (memory[addr + 2] << 16);
}

function readPort24(peripherals, basePort) {
  return (
    peripherals.read(basePort)
    | (peripherals.read(basePort + 1) << 8)
    | (peripherals.read(basePort + 2) << 16)
  ) >>> 0;
}

function hasLiftedBlock(pc, mode = 'adl') {
  return Object.prototype.hasOwnProperty.call(PRELIFTED_BLOCKS, blockKey(pc, mode));
}

function resetCpuState(cpu) {
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
}

function prepareIsrFrame(cpu, memory, returnPc) {
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu.madl = 1;
  cpu.sp = STACK_TOP - 3;
  write24(memory, cpu.sp, returnPc >>> 0);
}

function classifyPc(pc) {
  if (pc >= 0x001900 && pc < 0x001a00) return 'event';
  if (pc >= 0x001700 && pc < 0x001800) return 'isr';
  return 'other';
}

function countNonZero(memory, start, endExclusive) {
  let count = 0;
  for (let addr = start; addr < endExclusive; addr++) {
    if (memory[addr] !== 0) count++;
  }
  return count;
}

function diffBytes(before, memory, start, endExclusive) {
  const diffs = [];
  for (let offset = 0; offset < before.length; offset++) {
    const after = memory[start + offset];
    const prior = before[offset];
    if (after !== prior) {
      diffs.push({
        addr: start + offset,
        before: prior,
        after,
      });
    }
  }
  return diffs;
}

function formatTraceEntry(entry) {
  return `    [${String(entry.step).padStart(4, ' ')}] ${hex(entry.pc)}:${entry.mode} ${entry.dasm}`;
}

function formatMissingEntry(entry) {
  return `    [${String(entry.step).padStart(4, ' ')}] ${hex(entry.pc)}:${entry.mode} exactLifted=${entry.exactLifted ? 'yes' : 'no'}`;
}

function formatWriteOp(op) {
  return `    cycle=${String(op.cycle ?? 0).padStart(2, ' ')} addr=${hex(op.addr)} width=${op.width} value=${hex(op.value, op.width * 2)}`;
}

function printPcGroup(label, pcs) {
  console.log(`${label}: ${pcs.length}`);
  if (pcs.length === 0) {
    console.log('  none');
    return;
  }
  console.log(`  ${pcs.map((pc) => hex(pc)).join(', ')}`);
}

const peripherals = createPeripheralBus({
  trace: false,
  pllDelay: 2,
  timerInterrupt: false,
});
const memory = new Uint8Array(MEM_SIZE);
memory.set(romBytes);
const executor = createExecutor(PRELIFTED_BLOCKS, memory, { peripherals });
const cpu = executor.cpu;

const vramWriteOps = [];
let currentPhase = 'idle';
let currentCycle = null;

const originalWrite8 = cpu.write8.bind(cpu);
const originalWrite16 = cpu.write16.bind(cpu);
const originalWrite24 = cpu.write24.bind(cpu);

function recordVramWrite(addr, width, value) {
  const start = addr & 0xffffff;
  const end = start + width;
  if (end <= VRAM_START || start >= VRAM_END_EXCLUSIVE) return;
  vramWriteOps.push({
    phase: currentPhase,
    cycle: currentCycle,
    addr: start,
    width,
    value: value >>> 0,
  });
}

cpu.write8 = (addr, value) => {
  recordVramWrite(addr, 1, value);
  return originalWrite8(addr, value);
};
cpu.write16 = (addr, value) => {
  recordVramWrite(addr, 2, value);
  return originalWrite16(addr, value);
};
cpu.write24 = (addr, value) => {
  recordVramWrite(addr, 3, value);
  return originalWrite24(addr, value);
};

function runIsrSegment(label, returnPc, maxSteps, phase, cycleNumber = null) {
  prepareIsrFrame(cpu, memory, returnPc);

  const trace = [];
  const uniqueKeys = new Set();
  const uniquePcs = new Set();
  const missingBlocks = [];
  const writeStartIndex = vramWriteOps.length;

  currentPhase = phase;
  currentCycle = cycleNumber;

  const result = executor.runFrom(IRQ_VECTOR, 'adl', {
    maxSteps,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
    onBlock(pc, mode, meta, step) {
      const normalizedMode = mode ?? 'adl';
      trace.push({
        step: step + 1,
        pc: pc >>> 0,
        mode: normalizedMode,
        dasm: meta?.instructions?.[0]?.dasm ?? '???',
      });
      uniqueKeys.add(blockKey(pc, normalizedMode));
      uniquePcs.add(pc >>> 0);
    },
    onMissingBlock(pc, mode, step) {
      const normalizedMode = mode ?? 'adl';
      missingBlocks.push({
        step: step + 1,
        pc: pc >>> 0,
        mode: normalizedMode,
        exactLifted: hasLiftedBlock(pc, normalizedMode),
      });
    },
  });

  currentPhase = 'idle';
  currentCycle = null;

  return {
    label,
    result,
    trace,
    uniqueKeys: [...uniqueKeys].sort(),
    uniquePcs: [...uniquePcs].sort((left, right) => left - right),
    missingBlocks,
    vramWrites: vramWriteOps.slice(writeStartIndex),
    finalA: cpu.a,
    finalSp: cpu.sp >>> 0,
    callback: read24(memory, CALLBACK_PTR),
    systemFlag: memory[SYS_FLAG_ADDR],
    rawStatus: readPort24(peripherals, INTC_RAW_STATUS_PORT),
    enableMask: readPort24(peripherals, INTC_ENABLE_MASK_PORT),
    maskedStatus: readPort24(peripherals, INTC_MASKED_STATUS_PORT),
  };
}

function printSegment(segment) {
  console.log('');
  console.log(segment.label);
  console.log('-'.repeat(segment.label.length));
  console.log(
    `termination=${segment.result.termination}`
    + ` steps=${segment.result.steps}`
    + ` finalPc=${hex(segment.result.lastPc)}:${segment.result.lastMode ?? 'adl'}`
    + ` A=${hex(segment.finalA, 2)}`
    + ` SP=${hex(segment.finalSp)}`
  );
  console.log(`uniqueBlocks=${segment.uniqueKeys.length}`);
  console.log(`callback=${hex(segment.callback)} sysFlag=${hex(segment.systemFlag, 2)}`);
  console.log(
    `intcRaw=${hex(segment.rawStatus)}`
    + ` intcEnable=${hex(segment.enableMask)}`
    + ` intcMasked=${hex(segment.maskedStatus)}`
  );
  console.log(`haltReached=${segment.result.termination === 'halt' && HALT_PCS.has(segment.result.lastPc) ? 'yes' : 'no'}`);
  console.log(`missingBlockTermination=${segment.result.termination === 'missing_block' ? 'yes' : 'no'}`);
  console.log(`maxStepsTermination=${segment.result.termination === 'max_steps' ? 'yes' : 'no'}`);

  if (segment.missingBlocks.length === 0) {
    console.log('missingBlocks: none');
  } else {
    console.log(`missingBlocks (${segment.missingBlocks.length}):`);
    for (const entry of segment.missingBlocks) {
      console.log(formatMissingEntry(entry));
    }
  }

  if (segment.vramWrites.length === 0) {
    console.log('vramWritesInRequestedRange: none');
  } else {
    console.log(`vramWritesInRequestedRange (${segment.vramWrites.length}):`);
    for (const entry of segment.vramWrites.slice(0, 20)) {
      console.log(formatWriteOp(entry));
    }
    if (segment.vramWrites.length > 20) {
      console.log(`    ... and ${segment.vramWrites.length - 20} more`);
    }
  }

  console.log('trace:');
  for (const entry of segment.trace) {
    console.log(formatTraceEntry(entry));
  }
}

console.log('Phase 176 Event Loop Deep Trace');
console.log('===============================');
console.log(`target callback=${hex(EVENT_LOOP)} haltAddr=${hex(HALT_ADDR)} exactLifted(${hex(TARGET_BLOCK)})=${hasLiftedBlock(TARGET_BLOCK) ? 'yes' : 'no'}`);
console.log(`vramCheckRange=${hex(VRAM_START)}-${hex(VRAM_END_EXCLUSIVE - 1)}`);

resetCpuState(cpu);
const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
  maxSteps: 5000,
  maxLoopIterations: 32,
});

console.log('');
console.log(`Boot: steps=${boot.steps} termination=${boot.termination} finalPc=${hex(boot.lastPc)}:${boot.lastMode ?? 'z80'}`);

write24(memory, CALLBACK_PTR, EVENT_LOOP);
memory[SYS_FLAG_ADDR] |= SYS_FLAG_MASK;
peripherals.keyboard.keyMatrix.fill(NO_KEYS_PRESSED);
peripherals.keyboard.keyMatrix[ENTER_GROUP] = ENTER_PRESSED;
peripherals.setKeyboardIRQ(true);
peripherals.write(INTC_KEYBOARD_ENABLE_PORT, INTC_KEYBOARD_MASK);

console.log(`Callback initialized to ${hex(read24(memory, CALLBACK_PTR))}`);
console.log(`System flag initialized to ${hex(memory[SYS_FLAG_ADDR], 2)}`);
console.log(`Keyboard initialized: ENTER pressed on keyMatrix[${ENTER_GROUP}]`);
console.log(`INTC raw=${hex(readPort24(peripherals, INTC_RAW_STATUS_PORT))} enable=${hex(readPort24(peripherals, INTC_ENABLE_MASK_PORT))} masked=${hex(readPort24(peripherals, INTC_MASKED_STATUS_PORT))}`);

const warmup = runIsrSegment(
  'Warmup ISR (Test 23 Step C)',
  (boot.lastPc + 1) & 0xffffff,
  WARMUP_MAX_STEPS,
  'warmup',
);
printSegment(warmup);

const vramBeforeCycles = memory.slice(VRAM_START, VRAM_END_EXCLUSIVE);
const cycles = [];
for (let cycle = 1; cycle <= CYCLE_COUNT; cycle++) {
  const segment = runIsrSegment(
    `Cycle ${cycle}`,
    SENTINEL_RETURN,
    CYCLE_MAX_STEPS,
    'cycle',
    cycle,
  );
  cycles.push(segment);
  printSegment(segment);
}

const allUniquePcs = [...new Set(cycles.flatMap((segment) => segment.uniquePcs))].sort((left, right) => left - right);
const eventLoopPcs = allUniquePcs.filter((pc) => classifyPc(pc) === 'event');
const isrPcs = allUniquePcs.filter((pc) => classifyPc(pc) === 'isr');
const otherPcs = allUniquePcs.filter((pc) => classifyPc(pc) === 'other');

const allMissing = [];
const allMissingKeys = new Set();
for (const segment of cycles) {
  for (const entry of segment.missingBlocks) {
    const key = blockKey(entry.pc, entry.mode);
    if (allMissingKeys.has(key)) continue;
    allMissingKeys.add(key);
    allMissing.push(entry);
  }
}
allMissing.sort((left, right) => left.pc - right.pc);

const cycleVramOps = cycles.flatMap((segment) => segment.vramWrites);
const vramDiffs = diffBytes(vramBeforeCycles, memory, VRAM_START, VRAM_END_EXCLUSIVE);
const vramNonZeroAfterCycles = countNonZero(memory, VRAM_START, VRAM_END_EXCLUSIVE);

console.log('');
console.log('Cycle Summary');
console.log('-------------');
console.log(`Warmup post-state: callback=${hex(warmup.callback)} sysFlag=${hex(warmup.systemFlag, 2)} intcEnable=${hex(warmup.enableMask)}`);
console.log(`Total unique PCs across ${CYCLE_COUNT} cycles: ${allUniquePcs.length}`);
printPcGroup('Event-loop range (0x0019xx)', eventLoopPcs);
printPcGroup('ISR range (0x0017xx)', isrPcs);
printPcGroup('Other PCs', otherPcs);

if (allMissing.length === 0) {
  console.log('Missing blocks that blocked progress: none');
} else {
  console.log(`Missing blocks that blocked progress (${allMissing.length} unique):`);
  for (const entry of allMissing) {
    console.log(`  ${hex(entry.pc)}:${entry.mode} exactLifted=${entry.exactLifted ? 'yes' : 'no'}`);
  }
}

const haltedCycles = cycles.filter((segment) => segment.result.termination === 'halt' && HALT_PCS.has(segment.result.lastPc)).length;
const missingCycles = cycles.filter((segment) => segment.result.termination === 'missing_block').length;
const maxStepCycles = cycles.filter((segment) => segment.result.termination === 'max_steps').length;
console.log(`Cycle outcomes: halt=${haltedCycles} missing_block=${missingCycles} max_steps=${maxStepCycles}`);

console.log(`VRAM writes detected in requested range: ${cycleVramOps.length > 0 || vramDiffs.length > 0 ? 'yes' : 'no'}`);
console.log(`  writeOpsLogged=${cycleVramOps.length}`);
console.log(`  changedBytesVsPreCycleSnapshot=${vramDiffs.length}`);
console.log(`  nonZeroBytesAfterCycles=${vramNonZeroAfterCycles}`);

if (cycleVramOps.length > 0) {
  console.log('  first write ops:');
  for (const entry of cycleVramOps.slice(0, 20)) {
    console.log(formatWriteOp(entry));
  }
  if (cycleVramOps.length > 20) {
    console.log(`    ... and ${cycleVramOps.length - 20} more`);
  }
}

if (vramDiffs.length > 0) {
  console.log('  first changed bytes:');
  for (const entry of vramDiffs.slice(0, 20)) {
    console.log(`    addr=${hex(entry.addr)} before=${hex(entry.before, 2)} after=${hex(entry.after, 2)}`);
  }
  if (vramDiffs.length > 20) {
    console.log(`    ... and ${vramDiffs.length - 20} more`);
  }
}
