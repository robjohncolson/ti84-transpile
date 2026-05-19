#!/usr/bin/env node
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

const PHASE1_ENTRY = 0x000000;
const PHASE2_ENTRY = 0x08C331;
const PHASE3_ENTRY = 0x0802B2;
const PHASE4_ENTRY = 0x003A73;

const PHASE1_MAX_STEPS = 20000;
const PHASE2_MAX_STEPS = 100000;
const PHASE3_MAX_STEPS = 100;
const PHASE4_MAX_STEPS = 200000;

const PHASE1_LOOP_LIMIT = 32;
const PHASE2_LOOP_LIMIT = 10000;
const PHASE3_LOOP_LIMIT = 32;
const PHASE4_LOOP_LIMIT = 10;

const BOOT_RESET_SP = 0xD1A87B;
const EVENT_RESET_SP = 0xD1A872;

const HOT_BLOCK_LIMIT = 30;
const LCD_RANGE_START = 0xD40000;
const LCD_RANGE_END = 0xD53F00;
const LCD_CHANGE_PREVIEW_LIMIT = 16;

const TIMER_ISR_ENTRY = 0x000080;
const WATCH_ADDRESSES = [
  TIMER_ISR_ENTRY,
  0x001713,
  0x001933,
  0x001853,
  0x000721,
];
const HALT_PC = 0x001942;

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase', 'halted', 'cycles',
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function hexByte(value) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return 'n/a';
  }
  return `0x${(Number(value) & 0xFF).toString(16).padStart(2, '0')}`;
}

function count(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function blockKey(pc, mode) {
  return `${(pc & 0xFFFFFF).toString(16).padStart(6, '0')}:${mode ?? 'adl'}`;
}

function snapshotCpu(cpu) {
  const snapshot = {};
  for (const field of CPU_SNAPSHOT_FIELDS) {
    snapshot[field] = cpu[field];
  }
  return snapshot;
}

function restoreCpu(cpu, snapshot) {
  for (const field of CPU_SNAPSHOT_FIELDS) {
    cpu[field] = snapshot[field];
  }
}

function restoreLcdMmio(executor, snapshot) {
  if (!snapshot || !executor.lcdMmio) {
    return;
  }
  executor.lcdMmio.upbase = snapshot.upbase;
  executor.lcdMmio.control = snapshot.control;
}

function sortedBlockEntries(result) {
  return Object.entries(result.blockVisits ?? {}).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0]);
  });
}

function matchingBlockKeys(result, addr) {
  const prefix = `${(addr & 0xFFFFFF).toString(16).padStart(6, '0')}:`;
  return Object.keys(result.blockVisits ?? {})
    .filter((key) => key.startsWith(prefix))
    .sort();
}

function visitCountForAddress(result, addr) {
  let total = 0;
  for (const key of matchingBlockKeys(result, addr)) {
    total += result.blockVisits[key] ?? 0;
  }
  return total;
}

function blockEntriesInRange(result, start, endInclusive) {
  return sortedBlockEntries(result).filter(([key]) => {
    const addr = parseInt(key.slice(0, 6), 16);
    return addr >= start && addr <= endInclusive;
  });
}

function diffByteRange(before, after, startAddr) {
  let changed = 0;
  const preview = [];

  for (let index = 0; index < before.length; index++) {
    if (before[index] === after[index]) {
      continue;
    }
    changed++;
    if (preview.length < LCD_CHANGE_PREVIEW_LIMIT) {
      preview.push({
        addr: startAddr + index,
        before: before[index],
        after: after[index],
      });
    }
  }

  return { changed, preview };
}

function formatInterruptSummary(interruptLog) {
  if (interruptLog.length === 0) {
    return 'none';
  }

  const countsByVector = new Map();
  for (const entry of interruptLog) {
    const key = `${entry.type}@${hex(entry.vector)}`;
    countsByVector.set(key, (countsByVector.get(key) ?? 0) + 1);
  }

  return [...countsByVector.entries()]
    .map(([key, value]) => `${key} x${count(value)}`)
    .join(', ');
}

function trackBlocks(result, label, allBlocks) {
  const before = allBlocks.size;
  for (const key of Object.keys(result.blockVisits ?? {})) {
    allBlocks.add(key);
  }
  const after = allBlocks.size;
  console.log(
    `${label}: steps=${count(result.steps)} term=${result.termination} `
    + `lastPc=${hex(result.lastPc)} blocks=${count(after)} (+${count(after - before)} new)`,
  );
  if ((result.loopsForced ?? 0) > 0) {
    console.log(`  loops forced: ${count(result.loopsForced)}`);
  }
  if ((result.missingBlocks?.length ?? 0) > 0) {
    const preview = result.missingBlocks.slice(0, 8).join(', ');
    const extra = result.missingBlocks.length > 8 ? ` (+${count(result.missingBlocks.length - 8)} more)` : '';
    console.log(`  missing blocks: ${preview}${extra}`);
  }
}

const mem = new Uint8Array(MEM_SIZE);
mem.set(romBytes);

const bootPeripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
const bootExecutor = createExecutor(BLOCKS, mem, { peripherals: bootPeripherals });
const bootCpu = bootExecutor.cpu;

console.log('=== Phase 370 - Timer Interrupt Event Loop Probe ===\n');

const allBlocks = new Set();

const r1 = bootExecutor.runFrom(PHASE1_ENTRY, 'z80', {
  maxSteps: PHASE1_MAX_STEPS,
  maxLoopIterations: PHASE1_LOOP_LIMIT,
});
trackBlocks(r1, 'Phase 1 (Z80 cold boot)', allBlocks);

bootCpu.halted = false;
bootCpu.iff1 = 0;
bootCpu.iff2 = 0;
bootCpu.sp = BOOT_RESET_SP;
mem.fill(0xFF, bootCpu.sp, bootCpu.sp + 3);

const r2 = bootExecutor.runFrom(PHASE2_ENTRY, 'adl', {
  maxSteps: PHASE2_MAX_STEPS,
  maxLoopIterations: PHASE2_LOOP_LIMIT,
});
trackBlocks(r2, 'Phase 2 (ADL kernel init)', allBlocks);

bootCpu.mbase = 0xD0;
bootCpu._iy = 0xD00080;
bootCpu._hl = 0;
bootCpu.halted = false;
bootCpu.iff1 = 0;
bootCpu.iff2 = 0;
bootCpu.sp = BOOT_RESET_SP;
mem.fill(0xFF, bootCpu.sp, bootCpu.sp + 3);

const r3 = bootExecutor.runFrom(PHASE3_ENTRY, 'adl', {
  maxSteps: PHASE3_MAX_STEPS,
  maxLoopIterations: PHASE3_LOOP_LIMIT,
});
trackBlocks(r3, 'Phase 3 (ADL post-init)', allBlocks);

const coldBootBlocks = new Set(allBlocks);
const bootCpuSnapshot = snapshotCpu(bootCpu);
const bootLcdSnapshot = bootExecutor.lcdMmio
  ? { upbase: bootExecutor.lcdMmio.upbase, control: bootExecutor.lcdMmio.control }
  : null;

console.log(`\nAfter cold boot: ${count(coldBootBlocks.size)} unique blocks total\n`);

const lcdBefore = mem.slice(LCD_RANGE_START, LCD_RANGE_END + 1);

const eventPeripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: true });
const eventExecutor = createExecutor(BLOCKS, mem, { peripherals: eventPeripherals });
const eventCpu = eventExecutor.cpu;

// Preserve post-boot register/MMIO context while swapping in a timer-enabled bus.
restoreCpu(eventCpu, bootCpuSnapshot);
restoreLcdMmio(eventExecutor, bootLcdSnapshot);

eventCpu.halted = false;
eventCpu.iff1 = 1;
eventCpu.iff2 = 1;
eventCpu.f = 0x40;
eventCpu._ix = 0xD1A860;
eventCpu._iy = 0xD00080;
eventCpu.sp = EVENT_RESET_SP;
mem.fill(0xFF, eventCpu.sp, eventCpu.sp + 12);

const preEventUpbase = eventExecutor.lcdMmio?.upbase ?? null;
let haltFirstStep = null;
let continuedPastHalt = false;
const interruptLog = [];

console.log(
  `Phase 4 entry: PC=${hex(PHASE4_ENTRY)} maxSteps=${count(PHASE4_MAX_STEPS)} `
  + `maxLoopIterations=${count(PHASE4_LOOP_LIMIT)} IM=${eventCpu.im} I=${hex(eventCpu.i, 2)}\n`,
);

const r4 = eventExecutor.runFrom(PHASE4_ENTRY, 'adl', {
  maxSteps: PHASE4_MAX_STEPS,
  maxLoopIterations: PHASE4_LOOP_LIMIT,
  onBlock(pc, mode, _meta, step) {
    const normalizedPc = pc & 0xFFFFFF;
    if (normalizedPc === HALT_PC && haltFirstStep === null) {
      haltFirstStep = step;
      return;
    }
    if (haltFirstStep !== null && step > haltFirstStep) {
      continuedPastHalt = true;
    }
  },
  onInterrupt(type, returnPc, vector, step) {
    interruptLog.push({
      type,
      returnPc: returnPc & 0xFFFFFF,
      vector: vector & 0xFFFFFF,
      step,
    });
    if (haltFirstStep !== null && step >= haltFirstStep) {
      continuedPastHalt = true;
    }
  },
});
trackBlocks(r4, 'Phase 4 (event loop + timer interrupt)', allBlocks);

const phase4Entries = sortedBlockEntries(r4);
const phase4Keys = phase4Entries.map(([key]) => key);
const newPhase4Entries = phase4Entries.filter(([key]) => !coldBootBlocks.has(key));

const haltVisits = visitCountForAddress(r4, HALT_PC);
const haltReached = haltVisits > 0 || ((r4.lastPc ?? -1) & 0xFFFFFF) === HALT_PC;
const haltContinued = haltReached && (continuedPastHalt || r4.termination !== 'halt');

const lcdAfter = mem.subarray(LCD_RANGE_START, LCD_RANGE_END + 1);
const lcdDiff = diffByteRange(lcdBefore, lcdAfter, LCD_RANGE_START);
const lcdBlocks = blockEntriesInRange(r4, LCD_RANGE_START, LCD_RANGE_END);
const lcdF80Stats = eventCpu.getLcdF80Stats ? eventCpu.getLcdF80Stats() : { writes: 0, log: [] };
const postEventUpbase = eventExecutor.lcdMmio?.upbase ?? null;

console.log('\n--- Phase 4 Summary ---');
console.log(`steps=${count(r4.steps)} termination=${r4.termination} lastPc=${hex(r4.lastPc)} lastMode=${r4.lastMode}`);
console.log(`interrupt callbacks=${count(interruptLog.length)} (${formatInterruptSummary(interruptLog)})`);
console.log(`Total unique blocks (cold boot + phase 4): ${count(allBlocks.size)}`);
console.log(`Phase 4 unique blocks: ${count(phase4Keys.length)}`);
console.log(`New Phase 4 blocks not in cold boot: ${count(newPhase4Entries.length)}`);

console.log('\n--- Phase 4 New Blocks ---');
if (newPhase4Entries.length === 0) {
  console.log('  none');
} else {
  for (const [key, visits] of newPhase4Entries) {
    console.log(`  ${key} visits=${count(visits)}`);
  }
}

console.log(`\n--- Top ${Math.min(HOT_BLOCK_LIMIT, phase4Entries.length)} Hottest Phase 4 Blocks ---`);
if (phase4Entries.length === 0) {
  console.log('  none');
} else {
  for (const [key, visits] of phase4Entries.slice(0, HOT_BLOCK_LIMIT)) {
    console.log(`  ${key} visits=${count(visits)}`);
  }
}

console.log('\n--- Target Coverage ---');
for (const addr of WATCH_ADDRESSES) {
  const keys = matchingBlockKeys(r4, addr);
  const visits = visitCountForAddress(r4, addr);
  console.log(
    `  ${hex(addr)} visited=${visits > 0 ? 'yes' : 'no'} visits=${count(visits)}`
    + (keys.length > 0 ? ` keys=${keys.join(', ')}` : ''),
  );
}

console.log('\n--- HALT Status ---');
console.log(`  ${hex(HALT_PC)} reached=${haltReached ? 'yes' : 'no'} visits=${count(haltVisits)}`);
console.log(`  execution continued past ${hex(HALT_PC)}=${haltContinued ? 'yes' : 'no'}`);
console.log(`  phase 4 termination=${r4.termination} lastPc=${hex(r4.lastPc)}`);

console.log('\n--- LCD Activity ---');
console.log(`  requested range=${hex(LCD_RANGE_START)}-${hex(LCD_RANGE_END)}`);
console.log(`  executed blocks in LCD range=${count(lcdBlocks.length)}`);
if (lcdBlocks.length > 0) {
  for (const [key, visits] of lcdBlocks) {
    console.log(`    ${key} visits=${count(visits)}`);
  }
} else {
  console.log('    none');
}
console.log(`  changed bytes in LCD range=${count(lcdDiff.changed)}`);
console.log(`  lcd upbase=${hex(preEventUpbase)} -> ${hex(postEventUpbase)}`);
console.log(`  F800 register writes=${count(lcdF80Stats.writes)}`);
if (lcdDiff.preview.length > 0) {
  console.log(`  first ${count(lcdDiff.preview.length)} changed byte(s):`);
  for (const change of lcdDiff.preview) {
    console.log(`    ${hex(change.addr)} ${hexByte(change.before)} -> ${hexByte(change.after)}`);
  }
} else {
  console.log('  first changed byte(s): none');
}

console.log('\n--- Final CPU State ---');
console.log(`  PC=${hex(eventCpu.pc)} SP=${hex(eventCpu.sp)} IX=${hex(eventCpu._ix)} IY=${hex(eventCpu._iy)}`);
console.log(`  A=${hex(eventCpu.a, 2)} F=${hex(eventCpu.f, 2)} IM=${eventCpu.im} I=${hex(eventCpu.i, 2)}`);
console.log(`  IFF1=${eventCpu.iff1} IFF2=${eventCpu.iff2} MBASE=${hex(eventCpu.mbase, 2)} halted=${eventCpu.halted}`);
