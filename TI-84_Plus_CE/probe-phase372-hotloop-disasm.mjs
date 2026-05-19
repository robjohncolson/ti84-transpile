#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const TRANSPILED_PATH = path.join(__dirname, 'ROM.transpiled.js');

const MODE = 'adl';
const MEM_SIZE = 0x1000000;
const WINDOW_MIN_BYTES = 20;

const PHASE1_ENTRY = 0x000000;
const PHASE2_ENTRY = 0x08C331;
const PHASE3_ENTRY = 0x0802B2;
const EVENT_LOOP_ENTRY = 0x003A73;

const STACK_RESET_TOP = 0xD1A87E;
const BOOT_RESET_SP = STACK_RESET_TOP - 3;
const EVENT_RESET_SP = STACK_RESET_TOP - 12;

const PHASE1_MAX_STEPS = 20000;
const PHASE2_MAX_STEPS = 100000;
const PHASE3_MAX_STEPS = 100;
const EVENT_MAX_STEPS = 100000;

const PHASE1_LOOP_LIMIT = 32;
const PHASE2_LOOP_LIMIT = 10000;
const PHASE3_LOOP_LIMIT = 32;
const EVENT_LOOP_LIMIT = 100000;

const HOT_REGION_START = 0x003D00;
const HOT_REGION_END = 0x003DFF;
const WATCHED_MEMORY = [
  0xD00080,
  0xD00587,
  0xD0058D,
];

const ANCHOR_ADDRESSES = [
  0x003D28,
  0x003D2E,
  0x003D5A,
  0x003D5C,
  0x003D62,
  0x003D67,
  0x003D6B,
  0x003D70,
  0x003D73,
];

const CPU_SNAPSHOT_FIELDS = [
  'a',
  'f',
  '_bc',
  '_de',
  '_hl',
  '_a2',
  '_f2',
  '_bc2',
  '_de2',
  '_hl2',
  'sp',
  '_ix',
  '_iy',
  'i',
  'im',
  'iff1',
  'iff2',
  'madl',
  'mbase',
  'halted',
  'cycles',
];

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return ((Number(value) || 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function count(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function formatDisp(value) {
  return value >= 0
    ? `+0x${value.toString(16).toUpperCase()}`
    : `-0x${(-value).toString(16).toUpperCase()}`;
}

function hexBytes(buffer, start, length) {
  return Array.from(
    buffer.subarray(start, Math.min(buffer.length, start + Math.max(length, 0))),
    (value) => hexByte(value),
  ).join(' ');
}

function makeKey(addr, mode = MODE) {
  return `${addr.toString(16).padStart(6, '0')}:${mode}`;
}

function normalizeBlocks(raw) {
  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.filter((entry) => entry?.id).map((entry) => [entry.id, entry]));
  }
  return raw ?? {};
}

function createMemoryImage(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  romBytes.copy(mem, 0, 0, romBytes.length);
  return mem;
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

function decodeAt(memory, addr, mode = MODE) {
  try {
    const inst = decodeInstruction(memory, addr, mode);
    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
      throw new Error('decoder returned invalid length');
    }
    return inst;
  } catch (error) {
    return {
      tag: 'db',
      value: memory[addr] ?? 0,
      length: 1,
      decodeError: error instanceof Error ? error.message : String(error),
    };
  }
}

function formatInstruction(inst) {
  switch (inst?.tag) {
    case 'ld-reg-imm': return `ld ${inst.dest}, 0x${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-mem': return `ld ${inst.dest}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-pair-imm': return `ld ${inst.pair}, ${hex(inst.value)}`;
    case 'push': return `push ${inst.pair}`;
    case 'pop': return `pop ${inst.pair}`;
    case 'call': return `call ${hex(inst.target)}`;
    case 'ret': return 'ret';
    case 'ret-conditional': return `ret ${inst.condition}`;
    case 'inc-reg': return `inc ${inst.reg}`;
    case 'dec-reg': return `dec ${inst.reg}`;
    case 'inc-pair': return `inc ${inst.pair}`;
    case 'dec-pair': return `dec ${inst.pair}`;
    case 'add-pair': return `add ${inst.dest}, ${inst.src}`;
    case 'jr': return `jr ${hex(inst.target)}`;
    case 'jr-conditional': return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'djnz': return `djnz ${hex(inst.target)}`;
    case 'alu-reg': return `${inst.op} ${inst.src}`;
    case 'indexed-cb-bit': return `bit ${inst.bit}, (${inst.indexRegister}${formatDisp(inst.displacement)})`;
    case 'indexed-cb-set': return `set ${inst.bit}, (${inst.indexRegister}${formatDisp(inst.displacement)})`;
    case 'indexed-cb-res': return `res ${inst.bit}, (${inst.indexRegister}${formatDisp(inst.displacement)})`;
    case 'in-reg': return `in ${inst.reg}, (c)`;
    case 'rla': return 'rla';
    case 'rotate-reg': return `${inst.op} ${inst.reg}`;
    case 'scf': return 'scf';
    case 'ccf': return 'ccf';
    case 'db': return `db 0x${hexByte(inst.value)}`;
    default: return inst?.tag ?? 'unknown';
  }
}

function formatExit(exit) {
  if (!exit) return 'unknown';
  if (exit.type === 'return') return 'return';
  if (typeof exit.target !== 'number') return exit.type;
  if (exit.type === 'branch') return `branch ${exit.condition} -> ${hex(exit.target)}`;
  if (exit.type === 'call') return `call -> ${hex(exit.target)}`;
  if (exit.type === 'call-return') return `call-return -> ${hex(exit.target)}`;
  if (exit.type === 'fallthrough') return `fallthrough -> ${hex(exit.target)}`;
  return `${exit.type} -> ${hex(exit.target)}`;
}

function decodeWindow(memory, start, minBytes = WINDOW_MIN_BYTES, mode = MODE) {
  const rows = [];
  let pc = start >>> 0;
  let consumed = 0;

  while (consumed < minBytes && rows.length < 24) {
    const inst = decodeAt(memory, pc, mode);
    const length = Math.max(inst.length ?? 1, 1);
    rows.push({
      pc,
      bytes: hexBytes(memory, pc, length),
      text: formatInstruction(inst),
      decodeError: inst.decodeError ?? null,
    });
    pc += length;
    consumed += length;
  }

  return rows;
}

function decodeBlock(memory, start, mode = MODE) {
  const rows = [];
  let pc = start >>> 0;

  while (rows.length < 32) {
    const inst = decodeAt(memory, pc, mode);
    const length = Math.max(inst.length ?? 1, 1);
    rows.push({
      pc,
      bytes: hexBytes(memory, pc, length),
      text: formatInstruction(inst),
      decodeError: inst.decodeError ?? null,
    });
    pc += length;
    if (inst.terminates) {
      break;
    }
  }

  return rows;
}

function printRows(rows) {
  for (const row of rows) {
    const suffix = row.decodeError ? `  ; decode fallback: ${row.decodeError}` : '';
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(14)} ${row.text}${suffix}`);
  }
}

function collectReachableLocalBlocks(blocks, startAddresses) {
  const queue = [...new Set(startAddresses)];
  const seen = new Set();

  while (queue.length > 0) {
    const addr = queue.shift();
    const key = makeKey(addr);
    if (seen.has(key) || !blocks[key]) {
      continue;
    }

    seen.add(key);

    for (const exit of blocks[key].exits ?? []) {
      if (typeof exit.target !== 'number') {
        continue;
      }
      if (exit.target < HOT_REGION_START || exit.target > HOT_REGION_END) {
        continue;
      }
      queue.push(exit.target);
    }
  }

  return [...seen]
    .map((key) => parseInt(key.slice(0, 6), 16))
    .sort((a, b) => a - b);
}

function collectDirectExternalTargets(blocks, localBlockStarts) {
  const targets = [];

  for (const addr of localBlockStarts) {
    const key = makeKey(addr);
    for (const exit of blocks[key]?.exits ?? []) {
      if (typeof exit.target !== 'number') {
        continue;
      }
      if (exit.target >= HOT_REGION_START && exit.target <= HOT_REGION_END) {
        continue;
      }
      targets.push({
        from: addr,
        type: exit.type,
        target: exit.target,
      });
    }
  }

  const deduped = new Map();
  for (const entry of targets) {
    const key = `${entry.type}:${entry.target}`;
    if (!deduped.has(key)) {
      deduped.set(key, entry);
    }
  }
  return [...deduped.values()].sort((a, b) => a.target - b.target);
}

function summarizePhase(label, result) {
  return `${label}: steps=${count(result.steps)} termination=${result.termination} lastPc=${hex(result.lastPc)}`;
}

function runBootPhases(blocks, romBytes) {
  const mem = createMemoryImage(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;

  const phase1 = executor.runFrom(PHASE1_ENTRY, 'z80', {
    maxSteps: PHASE1_MAX_STEPS,
    maxLoopIterations: PHASE1_LOOP_LIMIT,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = BOOT_RESET_SP;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const phase2 = executor.runFrom(PHASE2_ENTRY, MODE, {
    maxSteps: PHASE2_MAX_STEPS,
    maxLoopIterations: PHASE2_LOOP_LIMIT,
  });

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = BOOT_RESET_SP;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  const phase3 = executor.runFrom(PHASE3_ENTRY, MODE, {
    maxSteps: PHASE3_MAX_STEPS,
    maxLoopIterations: PHASE3_LOOP_LIMIT,
  });

  return {
    mem,
    phaseResults: [
      { label: 'Phase 1 (cold boot)', result: phase1 },
      { label: 'Phase 2 (OS init)', result: phase2 },
      { label: 'Phase 3 (home screen)', result: phase3 },
    ],
    cpuSnapshot: snapshotCpu(cpu),
    lcdSnapshot: executor.lcdMmio
      ? { upbase: executor.lcdMmio.upbase, control: executor.lcdMmio.control }
      : null,
  };
}

function runHotLoopTrace(blocks, bootState) {
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, bootState.mem, { peripherals });
  const { cpu } = executor;

  restoreCpu(cpu, bootState.cpuSnapshot);
  if (bootState.lcdSnapshot && executor.lcdMmio) {
    executor.lcdMmio.upbase = bootState.lcdSnapshot.upbase;
    executor.lcdMmio.control = bootState.lcdSnapshot.control;
  }

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = EVENT_RESET_SP;
  bootState.mem.fill(0xFF, cpu.sp, cpu.sp + 12);

  const blockVisitCounts = new Map();
  const traceRuns = [];
  const samples = [];

  const result = executor.runFrom(EVENT_LOOP_ENTRY, MODE, {
    maxSteps: EVENT_MAX_STEPS,
    maxLoopIterations: EVENT_LOOP_LIMIT,
    onBlock(pc, mode, _meta, step) {
      const addr = pc & 0xFFFFFF;
      if (addr < HOT_REGION_START || addr > HOT_REGION_END) {
        return;
      }

      blockVisitCounts.set(addr, (blockVisitCounts.get(addr) ?? 0) + 1);

      const lastRun = traceRuns[traceRuns.length - 1];
      if (lastRun && lastRun.addr === addr) {
        lastRun.count++;
      } else {
        traceRuns.push({ step, addr, count: 1 });
      }

      if (samples.length < 16) {
        samples.push({
          step,
          addr,
          a: cpu.a & 0xFF,
          f: cpu.f & 0xFF,
          bc: cpu.bc & 0xFFFFFF,
          b: cpu.b & 0xFF,
          c: cpu.c & 0xFF,
          iy: cpu.iy & 0xFFFFFF,
          iy0: cpu.readIndexed8('iy', 0) & 0xFF,
        });
      }
    },
  });

  const memorySnapshot = Object.fromEntries(
    WATCHED_MEMORY.map((addr) => [hex(addr), cpu.read8(addr) & 0xFF]),
  );

  return {
    result,
    blockVisitCounts,
    traceRuns,
    samples,
    finalIY: cpu.iy & 0xFFFFFF,
    finalIY0: cpu.readIndexed8('iy', 0) & 0xFF,
    memorySnapshot,
  };
}

if (!fs.existsSync(ROM_PATH)) {
  throw new Error(`ROM not found: ${ROM_PATH}`);
}

const romBytes = fs.readFileSync(ROM_PATH);
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const blocks = normalizeBlocks(
  romModule.PRELIFTED_BLOCKS
  ?? romModule.default?.PRELIFTED_BLOCKS
  ?? romModule.default,
);

if (!blocks || Object.keys(blocks).length === 0) {
  throw new Error('Unable to load PRELIFTED_BLOCKS from ROM.transpiled.js');
}

const localBlockStarts = collectReachableLocalBlocks(blocks, ANCHOR_ADDRESSES);
const externalTargets = collectDirectExternalTargets(blocks, localBlockStarts);
const bootState = runBootPhases(blocks, romBytes);
const trace = runHotLoopTrace(blocks, bootState);

console.log('=== DISASSEMBLY OF 0x003D6B REGION ===');
console.log('');
console.log(`Anchors: ${ANCHOR_ADDRESSES.map((addr) => hex(addr)).join(', ')}`);
console.log(`Local reachable block starts: ${localBlockStarts.map((addr) => hex(addr)).join(', ')}`);
console.log('');
console.log('--- Per-anchor decode windows (>= 20 bytes each) ---');
for (const addr of ANCHOR_ADDRESSES) {
  console.log(`\n[window from ${hex(addr)}]`);
  printRows(decodeWindow(romBytes, addr));
}

console.log('\n--- Reachable local block listings ---');
for (const addr of localBlockStarts) {
  const key = makeKey(addr);
  const exits = (blocks[key]?.exits ?? []).map(formatExit);
  console.log(`\n[block ${hex(addr)}]`);
  if (exits.length === 0) {
    console.log('  exits: none');
  } else {
    console.log(`  exits: ${exits.join(' | ')}`);
  }
  printRows(decodeBlock(romBytes, addr));
}

if (externalTargets.length > 0) {
  console.log('\n--- Direct external targets reached from local blocks ---');
  for (const target of externalTargets) {
    console.log(`\n[target ${hex(target.target)} from ${hex(target.from)} via ${target.type}]`);
    printRows(decodeWindow(romBytes, target.target));
  }
}

console.log('\n=== DYNAMIC TRACE ===');
console.log('');
for (const phase of bootState.phaseResults) {
  console.log(summarizePhase(phase.label, phase.result));
}
console.log(
  `event loop: steps=${count(trace.result.steps)} termination=${trace.result.termination} `
  + `lastPc=${hex(trace.result.lastPc)} loopsForced=${count(trace.result.loopsForced)}`,
);
console.log('');
console.log('Block visit counts in the 0x003D** region:');
for (const addr of localBlockStarts) {
  console.log(`  ${hex(addr)} -> ${count(trace.blockVisitCounts.get(addr) ?? 0)}`);
}

console.log('\nFirst trace runs through the hot region:');
for (const run of trace.traceRuns.slice(0, 20)) {
  console.log(`  step ${count(run.step).padStart(6)}  ${hex(run.addr)} x${count(run.count)}`);
}
if (trace.traceRuns.length > 20) {
  console.log(`  ... ${count(trace.traceRuns.length - 20)} more runs omitted`);
}

console.log('\nRegister/memory samples from early hot-region visits:');
for (const sample of trace.samples) {
  console.log(
    `  step ${count(sample.step).padStart(6)}  pc=${hex(sample.addr)} `
    + `A=0x${hexByte(sample.a)} F=0x${hexByte(sample.f)} `
    + `BC=${hex(sample.bc)} B=0x${hexByte(sample.b)} C=0x${hexByte(sample.c)} `
    + `IY=${hex(sample.iy)} (IY+0)=0x${hexByte(sample.iy0)}`,
  );
}

console.log('\nWatched memory after the trace:');
for (const [addr, value] of Object.entries(trace.memorySnapshot)) {
  console.log(`  ${addr} = 0x${hexByte(value)}`);
}

console.log('\n=== LOOP EXIT ANALYSIS ===');
console.log('');
console.log('Inner countdown loop:');
console.log(`  ${hex(0x003D67)} loads BC with ${hex(0x000800)}.`);
console.log(`  ${hex(0x003D6E)} is \`jr nz, ${hex(0x003D6B)}\`.`);
console.log('  The loop body is `dec bc ; ld a, c ; or b`, so it keeps spinning until BC reaches 0.');
console.log('  In other words: the tight 0x003D6B loop exits only when `or b` sets Z=1 because B|C == 0.');
console.log('');
console.log('Outer poll loop:');
console.log(`  ${hex(0x003D5C)} does \`bit 3, (iy+0)\` and ${hex(0x003D60)} does \`jr nz, ${hex(0x003D75)}\`.`);
console.log(`  During this run, IY=${hex(trace.finalIY)} and (IY+0)=0x${hexByte(trace.finalIY0)}, so bit 3 stays clear.`);
console.log('  That leaves Z=1 after the BIT instruction, so the branch to 0x003D75 is never taken.');
console.log(`  ${hex(0x003D71)} then \`djnz ${hex(0x003D5C)}\`, so the code keeps re-entering the bit test after each 0x800-count delay.`);
console.log('');
console.log('What must change to break out in the keypress-relevant path:');
console.log('  Something must set bit 3 in the byte at [IY+0] before the next visit to 0x003D5C.');
console.log('  When that bit becomes 1, the BIT instruction clears Z, `jr nz, 0x003D75` is taken, and the routine exits the idle wait path.');
console.log(`  The handler at ${hex(0x003D75)} then clears the latch again with \`res 3, (iy+0)\` at ${hex(0x003D80)}.`);
