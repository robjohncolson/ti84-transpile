#!/usr/bin/env node
// Phase 463 probe: trace keyboard scanning mechanism.
// Goal: find WHAT CODE writes to D00587 (scan code) and sets D00080 bit 3 (key available flag).
// Also intercepts all I/O to keyboard controller ports (0x01, 0xA000-0xA01E).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
const BLOCKS = romModule.PRELIFTED_BLOCKS;

const MEM_SIZE = 0x1000000;
const STACK_TOP = 0xD1A87E;

// Target memory addresses
const SCAN_CODE_ADDR = 0xD00587;
const KEY_FLAGS_ADDR = 0xD00080;
const KEY_AVAILABLE_BIT = 3; // bit 3 of D00080

// Boot stages
const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const SCHEDULER_ENTRY = 0x0015F7;
const EVENT_LOOP_ENTRY = 0x003A73;

// Limits
const MAX_IO_EVENTS = 50;
const MAX_MEM_EVENTS = 50;
const SCHEDULER_MAX_STEPS = 500000;
const MAX_LOOP_ITERATIONS = 5000;

function hex(value, width = 6) {
  if (value === undefined || value === null || value < 0) {
    return 'n/a';
  }
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

// ─── Boot ───────────────────────────────────────────────────────────────────────

console.log('=== Phase 463: Keyboard Scan Trace ===\n');

const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes);

const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const executor = createExecutor(BLOCKS, mem, { peripherals });
const cpu = executor.cpu;

// Boot stage 1: cold boot (z80 mode)
console.log('--- Boot stage 1: cold boot ---');
const boot1 = executor.runFrom(BOOT_ENTRY, 'z80', {
  maxSteps: 20000,
  maxLoopIterations: 32,
});
console.log(`  steps=${boot1.steps}, termination=${boot1.termination}, lastPc=${hex(boot1.lastPc)}`);
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = STACK_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

// Boot stage 2: kernel init (ADL mode)
console.log('--- Boot stage 2: kernel init ---');
const boot2 = executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
  maxSteps: 100000,
  maxLoopIterations: 10000,
});
console.log(`  steps=${boot2.steps}, termination=${boot2.termination}, lastPc=${hex(boot2.lastPc)}`);
cpu.mbase = 0xD0;
cpu._iy = 0xD00080;
cpu._hl = 0;
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = STACK_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

// Boot stage 3: post-init
console.log('--- Boot stage 3: post-init ---');
const boot3 = executor.runFrom(POST_INIT_ENTRY, 'adl', {
  maxSteps: 100,
  maxLoopIterations: 32,
});
console.log(`  steps=${boot3.steps}, termination=${boot3.termination}, lastPc=${hex(boot3.lastPc)}`);

// Snapshot pre-scheduler state
const preD00587 = mem[SCAN_CODE_ADDR];
const preD00080 = mem[KEY_FLAGS_ADDR];
console.log(`\nPre-scheduler: D00587=${hex(preD00587, 2)}  D00080=${hex(preD00080, 2)} (bit3=${(preD00080 >> KEY_AVAILABLE_BIT) & 1})\n`);

// ─── Install intercepts ─────────────────────────────────────────────────────────

// Memory write intercepts
const d00587Writes = [];
const d00080Writes = [];
let memEventCount = 0;

const origWrite8 = cpu.write8.bind(cpu);
cpu.write8 = (addr, value) => {
  if (addr === SCAN_CODE_ADDR && memEventCount < MAX_MEM_EVENTS) {
    memEventCount++;
    const pc = currentPc;
    d00587Writes.push({ step: currentStep, pc, value, prevValue: mem[SCAN_CODE_ADDR] });
    console.log(`MEM WRITE D00587: value=${hex(value, 2)} prevValue=${hex(mem[SCAN_CODE_ADDR], 2)} pc=${hex(pc)} step=${currentStep}`);
  }
  if (addr === KEY_FLAGS_ADDR && memEventCount < MAX_MEM_EVENTS) {
    const oldVal = mem[KEY_FLAGS_ADDR];
    const oldBit3 = (oldVal >> KEY_AVAILABLE_BIT) & 1;
    const newBit3 = (value >> KEY_AVAILABLE_BIT) & 1;
    if (newBit3 !== oldBit3) {
      memEventCount++;
      const pc = currentPc;
      d00080Writes.push({ step: currentStep, pc, value, oldVal, bit3Change: `${oldBit3}->${newBit3}` });
      console.log(`MEM WRITE D00080: value=${hex(value, 2)} old=${hex(oldVal, 2)} bit3: ${oldBit3}->${newBit3} pc=${hex(pc)} step=${currentStep}`);
    }
  }
  origWrite8(addr, value);
};

// Also hook write16 and write24 in case wider writes touch these addresses
const origWrite16 = cpu.write16.bind(cpu);
cpu.write16 = (addr, value) => {
  if ((addr === SCAN_CODE_ADDR || addr === SCAN_CODE_ADDR - 1) && memEventCount < MAX_MEM_EVENTS) {
    memEventCount++;
    const pc = currentPc;
    console.log(`MEM WRITE16 addr=${hex(addr)} value=${hex(value, 4)} pc=${hex(pc)} step=${currentStep} (may touch D00587)`);
  }
  if ((addr === KEY_FLAGS_ADDR || addr === KEY_FLAGS_ADDR - 1) && memEventCount < MAX_MEM_EVENTS) {
    memEventCount++;
    const pc = currentPc;
    console.log(`MEM WRITE16 addr=${hex(addr)} value=${hex(value, 4)} pc=${hex(pc)} step=${currentStep} (may touch D00080)`);
  }
  origWrite16(addr, value);
};

const origWrite24 = cpu.write24.bind(cpu);
cpu.write24 = (addr, value) => {
  if (addr >= SCAN_CODE_ADDR - 2 && addr <= SCAN_CODE_ADDR && memEventCount < MAX_MEM_EVENTS) {
    memEventCount++;
    const pc = currentPc;
    console.log(`MEM WRITE24 addr=${hex(addr)} value=${hex(value, 6)} pc=${hex(pc)} step=${currentStep} (may touch D00587)`);
  }
  if (addr >= KEY_FLAGS_ADDR - 2 && addr <= KEY_FLAGS_ADDR && memEventCount < MAX_MEM_EVENTS) {
    memEventCount++;
    const pc = currentPc;
    console.log(`MEM WRITE24 addr=${hex(addr)} value=${hex(value, 6)} pc=${hex(pc)} step=${currentStep} (may touch D00080)`);
  }
  origWrite24(addr, value);
};

// I/O intercepts
const ioEvents = [];
let ioEventCount = 0;

const origIoRead = cpu._ioRead;
const origIoWrite = cpu._ioWrite;

cpu._ioRead = (port) => {
  const value = origIoRead(port);
  if ((port === 0x01 || (port >= 0xA000 && port <= 0xA01E)) && ioEventCount < MAX_IO_EVENTS) {
    ioEventCount++;
    const pc = currentPc;
    ioEvents.push({ type: 'READ', port, value, step: currentStep, pc });
    console.log(`IO READ  port=${hex(port, 4)} value=${hex(value, 2)} step=${currentStep} pc=${hex(pc)}`);
  }
  return value;
};

cpu._ioWrite = (port, value) => {
  if ((port === 0x01 || (port >= 0xA000 && port <= 0xA01E)) && ioEventCount < MAX_IO_EVENTS) {
    ioEventCount++;
    const pc = currentPc;
    ioEvents.push({ type: 'WRITE', port, value, step: currentStep, pc });
    console.log(`IO WRITE port=${hex(port, 4)} value=${hex(value, 2)} step=${currentStep} pc=${hex(pc)}`);
  }
  origIoWrite(port, value);
};

// Track unique PCs and current step via onBlock callback
const uniquePCs = new Set();
let currentStep = 0;
let currentPc = 0;

const onBlock = (pc, mode, meta, steps) => {
  currentStep = steps;
  currentPc = pc;
  if (uniquePCs.size < 30) {
    uniquePCs.add(pc);
  }
};

// ─── Run scheduler ──────────────────────────────────────────────────────────────

// Track missing blocks
const missingBlockAddrs = new Set();
let missingBlockCount = 0;

const onMissingBlock = (pc, mode, steps) => {
  missingBlockCount++;
  missingBlockAddrs.add(pc);
  if (missingBlockCount <= 10) {
    console.log(`  [missing_block] PC=${hex(pc)} mode=${mode} step=${steps}`);
  }
};

// Try scheduler entry first
console.log(`--- Attempt 1: scheduler from ${hex(SCHEDULER_ENTRY)} ---`);
cpu.halted = false;
cpu.iff1 = 0;
cpu.iff2 = 0;
cpu.sp = STACK_TOP - 3;
mem.fill(0xFF, cpu.sp, cpu.sp + 3);

const schedulerResult = executor.runFrom(SCHEDULER_ENTRY, 'adl', {
  maxSteps: SCHEDULER_MAX_STEPS,
  maxLoopIterations: MAX_LOOP_ITERATIONS,
  diHaltBypass: true,
  diHaltBypassEntry: SCHEDULER_ENTRY,
  onBlock,
  onMissingBlock,
});
console.log(`  result: steps=${schedulerResult.steps}, termination=${schedulerResult.termination}, lastPc=${hex(schedulerResult.lastPc)}`);

// If scheduler terminated too early, also try event loop entry
let eventLoopResult = null;
if (schedulerResult.steps < 1000) {
  console.log(`\n--- Attempt 2: event loop from ${hex(EVENT_LOOP_ENTRY)} (scheduler terminated early) ---`);
  // Reset state
  ioEventCount = 0;
  memEventCount = 0;
  ioEvents.length = 0;
  d00587Writes.length = 0;
  d00080Writes.length = 0;
  uniquePCs.clear();
  missingBlockAddrs.clear();
  missingBlockCount = 0;
  currentStep = 0;
  currentPc = 0;

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_TOP - 3;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  eventLoopResult = executor.runFrom(EVENT_LOOP_ENTRY, 'adl', {
    maxSteps: SCHEDULER_MAX_STEPS,
    maxLoopIterations: MAX_LOOP_ITERATIONS,
    // diHaltBypass defaults to true when startAddress=0x003A73
    onBlock,
    onMissingBlock,
  });
  console.log(`  result: steps=${eventLoopResult.steps}, termination=${eventLoopResult.termination}, lastPc=${hex(eventLoopResult.lastPc)}`);
}

const finalResult = eventLoopResult ?? schedulerResult;
console.log(`\nFinal run: steps=${finalResult.steps}, termination=${finalResult.termination}, lastPc=${hex(finalResult.lastPc)}`);

// ─── Summary ────────────────────────────────────────────────────────────────────

console.log('\n========================================');
console.log('=== SUMMARY ===');
console.log('========================================\n');

// D00587 writes
console.log(`--- D00587 (scan code) writes: ${d00587Writes.length} ---`);
if (d00587Writes.length === 0) {
  console.log('  NONE - no code wrote to D00587 during scheduler run');
} else {
  for (const w of d00587Writes) {
    console.log(`  step=${w.step} pc=${hex(w.pc)} value=${hex(w.value, 2)} prev=${hex(w.prevValue, 2)}`);
  }
}

// D00080 bit 3 changes
console.log(`\n--- D00080 (key flags) bit 3 changes: ${d00080Writes.length} ---`);
if (d00080Writes.length === 0) {
  console.log('  NONE - bit 3 of D00080 was not toggled during scheduler run');
} else {
  for (const w of d00080Writes) {
    console.log(`  step=${w.step} pc=${hex(w.pc)} value=${hex(w.value, 2)} old=${hex(w.oldVal, 2)} bit3: ${w.bit3Change}`);
  }
}

// I/O events
console.log(`\n--- Keyboard I/O events: ${ioEvents.length} ---`);
if (ioEvents.length === 0) {
  console.log('  NONE - no keyboard port I/O during scheduler run');
} else {
  // Group by unique PC
  const byPC = new Map();
  for (const ev of ioEvents) {
    const key = `${ev.type}:${hex(ev.port, 4)}:${hex(ev.pc)}`;
    if (!byPC.has(key)) {
      byPC.set(key, { ...ev, count: 0 });
    }
    byPC.get(key).count++;
  }
  console.log('  Unique PC/port/type combinations:');
  for (const [key, ev] of byPC) {
    console.log(`    ${ev.type} port=${hex(ev.port, 4)} pc=${hex(ev.pc)} count=${ev.count} sampleValue=${hex(ev.value, 2)}`);
  }
}

// Unique PCs (first 30)
console.log(`\n--- First 30 unique block PCs ---`);
const pcList = [...uniquePCs].sort((a, b) => a - b);
for (const pc of pcList.slice(0, 30)) {
  console.log(`  ${hex(pc)}`);
}

// Post-scheduler state
const postD00587 = mem[SCAN_CODE_ADDR];
const postD00080 = mem[KEY_FLAGS_ADDR];
console.log(`\nPost-scheduler: D00587=${hex(postD00587, 2)}  D00080=${hex(postD00080, 2)} (bit3=${(postD00080 >> KEY_AVAILABLE_BIT) & 1})`);

// Missing blocks (from onMissingBlock callback + result)
const allMissing = new Set([...missingBlockAddrs]);
if (finalResult.missingBlocks) {
  for (const key of finalResult.missingBlocks) {
    // keys are like "008997:adl" — extract PC
    const pcStr = key.split(':')[0];
    allMissing.add(parseInt(pcStr, 16));
  }
}
if (allMissing.size > 0) {
  console.log(`\n--- Missing blocks: ${allMissing.size} unique ---`);
  const sorted = [...allMissing].sort((a, b) => a - b);
  for (const addr of sorted.slice(0, 20)) {
    console.log(`  ${hex(addr)}`);
  }
  if (sorted.length > 20) {
    console.log(`  ... and ${sorted.length - 20} more`);
  }
} else {
  console.log('\n--- Missing blocks: none ---');
}

console.log('\n=== Done ===');
