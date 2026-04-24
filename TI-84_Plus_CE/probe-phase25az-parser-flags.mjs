#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const MEM_SIZE = 0x1000000;
const IY_BASE = 0xd00080;
const IY_BLOCK_LEN = 0x50; // 0xD00080 .. 0xD000CF inclusive

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08c331;
const POST_INIT_ENTRY = 0x0802b2;
const MEMINIT_ENTRY = 0x09dee0;
const PARSEINP_ENTRY = 0x099914;

const STACK_RESET_TOP = 0xd1a87e;
const TOKEN_BUFFER_ADDR = 0xd00800;
const OP1_ADDR = 0xd005f8;
const ERR_NO_ADDR = 0xd008df;
const ERR_SP_ADDR = 0xd008e0;
const BEGPC_ADDR = 0xd02317;
const CURPC_ADDR = 0xd0231a;
const ENDPC_ADDR = 0xd0231d;

const MEMINIT_RET = 0x7ffff6;
const FAKE_RET = 0x7ffffe;
const ERR_CATCH_ADDR = 0x7ffffa;

const INPUT_TOKENS = Uint8Array.from([0x32, 0x70, 0x33, 0x3f]); // "2+3" + end token

const BOOT_MAX_STEPS = 50_000_000;
const MEMINIT_BUDGET = 100_000;
const PARSEINP_BUDGET = 1_500_000;
const MAX_LOOP_ITER = 8192;

const WATCHED_BYTES = [
  {
    offset: 0x00,
    labels: ['trigFlags'],
    summary: 'bit 2 = radian mode',
    bits: [
      { bit: 2, label: 'radian mode', expected: 0 },
    ],
  },
  {
    offset: 0x01,
    labels: ['IY+0x01'],
    summary: 'bit 2 = dirty flag',
    bits: [
      { bit: 2, label: 'dirty flag', expected: 0 },
    ],
  },
  {
    offset: 0x05,
    labels: ['IY+0x05'],
    summary: 'bit 7 = scroll flag',
    bits: [
      { bit: 7, label: 'scroll flag', expected: 0 },
    ],
  },
  {
    offset: 0x08,
    labels: ['progExecuting'],
    summary: 'check all bits',
    showAllBits: true,
    expectedByte: 0x00,
  },
  {
    offset: 0x09,
    labels: ['onFlags', 'statFlags'],
    summary: 'bit 3 = parseInput, bit 6 = statsValid',
    bits: [
      { bit: 3, label: 'parseInput', expected: 0 },
      { bit: 6, label: 'statsValid', expected: 0 },
    ],
  },
  {
    offset: 0x0c,
    labels: ['IY+0x0C'],
    summary: 'bits 2, 6, 7 = display flags',
    bits: [
      { bit: 2, label: 'display flag bit 2', expected: 0 },
      { bit: 6, label: 'display flag bit 6', expected: 0 },
      { bit: 7, label: 'display flag bit 7', expected: 0 },
    ],
  },
  {
    offset: 0x12,
    labels: ['IY+0x12'],
    summary: 'bit 2 = checked in JError',
    bits: [
      { bit: 2, label: 'JError checked bit', expected: 0 },
    ],
  },
  {
    offset: 0x24,
    labels: ['IY+0x24'],
    summary: 'bit 4 = checked at 0x0586CC',
    bits: [
      { bit: 4, label: '0x0586CC checked bit', expected: 0 },
    ],
  },
  {
    offset: 0x34,
    labels: ['IY+0x34 (0xB4)'],
    summary: 'bit 4 = checked at 0x0586CC (IY+52)',
    bits: [
      { bit: 4, label: '0x0586CC checked bit', expected: 0 },
    ],
  },
  {
    offset: 0x36,
    labels: ['hookflags4'],
    summary: 'bit 5 = parserHookActive',
    critical: true,
    expectedByte: 0x00,
    bits: [
      { bit: 5, label: 'parserHookActive', expected: 0 },
    ],
  },
  {
    offset: 0x44,
    labels: ['ParsFlag', 'newDispF'],
    summary: 'bit 5 = checked by 0x058212, bit 6 = allowProgTokens',
    critical: true,
    expectedByte: 0x00,
    bits: [
      { bit: 5, label: '0x058212 checked bit', expected: 0 },
      { bit: 6, label: 'allowProgTokens', expected: 0 },
    ],
  },
  {
    offset: 0x45,
    labels: ['ParsFlag2'],
    summary: 'bit 0 = numOP1 ("result in OP1")',
    critical: true,
    expectedByte: 0x00,
    bits: [
      { bit: 0, label: 'numOP1', expected: 0 },
    ],
  },
  {
    offset: 0x47,
    labels: ['IY+0x47'],
    summary: 'bit 7 = checked in JError',
    bits: [
      { bit: 7, label: 'JError checked bit', expected: 0 },
    ],
  },
  {
    offset: 0x49,
    labels: ['graphFlags2', 'IY+0x49'],
    summary: 'bit 4 = splitOverride, bit 1 = checked by 0x049B12',
    bits: [
      { bit: 4, label: 'splitOverride', expected: 0 },
      { bit: 1, label: '0x049B12 checked bit', expected: 0 },
    ],
  },
  {
    offset: 0x4a,
    labels: ['fmtFlags'],
    summary: 'format flags',
    critical: true,
    showAllBits: true,
    expectedByte: 0x00,
  },
  {
    offset: 0x4b,
    labels: ['numMode'],
    summary: '0=normal, 1=sci, 2=eng',
    critical: true,
    modeByte: true,
    expectedByte: 0x00,
  },
  {
    offset: 0x4c,
    labels: ['fmtOverride'],
    summary: 'format override',
    showAllBits: true,
    expectedByte: 0x00,
  },
];

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value, 2);
}

function write24(mem, addr, value) {
  mem[addr] = value & 0xff;
  mem[addr + 1] = (value >>> 8) & 0xff;
  mem[addr + 2] = (value >>> 16) & 0xff;
}

function bitString(value) {
  return (value & 0xff).toString(2).padStart(8, '0');
}

function numModeLabel(value) {
  if (value === 0) return 'normal';
  if (value === 1) return 'sci';
  if (value === 2) return 'eng';
  return `other(${hexByte(value)})`;
}

async function createExecutorFromFile() {
  const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));
  const romModule = await import(pathToFileURL(path.join(__dirname, 'ROM.transpiled.js')).href);
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, 0x400000));
  const executor = createExecutor(romModule.PRELIFTED_BLOCKS, mem, {
    peripherals: createPeripheralBus({ timerInterrupt: false }),
  });
  return { mem, executor, cpu: executor.cpu };
}

function coldBoot(executor, cpu, mem) {
  const boot = executor.runFrom(BOOT_ENTRY, 'z80', {
    maxSteps: BOOT_MAX_STEPS,
    maxLoopIterations: 32,
  });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(KERNEL_INIT_ENTRY, 'adl', {
    maxSteps: 100_000,
    maxLoopIterations: 10_000,
  });

  cpu.mbase = 0xd0;
  cpu._iy = IY_BASE;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = STACK_RESET_TOP - 3;
  mem.fill(0xff, cpu.sp, cpu.sp + 3);

  executor.runFrom(POST_INIT_ENTRY, 'adl', {
    maxSteps: 100,
    maxLoopIterations: 32,
  });

  return boot;
}

function prepareCallState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.madl = 1;
  cpu.mbase = 0xd0;
  cpu._iy = IY_BASE;
  cpu.f = 0x40;
  cpu._ix = 0xd1a860;
  cpu.sp = STACK_RESET_TOP - 12;
  mem.fill(0xff, cpu.sp, cpu.sp + 12);
}

function runMemInit(executor, cpu, mem) {
  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, MEMINIT_RET);

  let steps = 0;
  let finalPc = MEMINIT_ENTRY;
  let returnHit = false;

  try {
    executor.runFrom(MEMINIT_ENTRY, 'adl', {
      maxSteps: MEMINIT_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _mode, _meta, step) {
        finalPc = pc & 0xffffff;
        if (typeof step === 'number') steps = Math.max(steps, step + 1);
        if (finalPc === MEMINIT_RET) throw new Error('__MEMINIT_RET__');
      },
      onMissingBlock(pc, _mode, step) {
        finalPc = pc & 0xffffff;
        if (typeof step === 'number') steps = Math.max(steps, step + 1);
        if (finalPc === MEMINIT_RET) throw new Error('__MEMINIT_RET__');
      },
    });
  } catch (error) {
    if (error?.message === '__MEMINIT_RET__') {
      returnHit = true;
    } else {
      throw error;
    }
  }

  return {
    returnHit,
    steps,
    finalPc,
  };
}

function runParseInp(executor, cpu, mem) {
  mem.fill(0x00, TOKEN_BUFFER_ADDR, TOKEN_BUFFER_ADDR + 0x80);
  mem.set(INPUT_TOKENS, TOKEN_BUFFER_ADDR);
  mem.fill(0x00, OP1_ADDR, OP1_ADDR + 9);

  write24(mem, BEGPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, CURPC_ADDR, TOKEN_BUFFER_ADDR);
  write24(mem, ENDPC_ADDR, TOKEN_BUFFER_ADDR + INPUT_TOKENS.length - 1);

  prepareCallState(cpu, mem);
  cpu.sp -= 3;
  write24(mem, cpu.sp, FAKE_RET);

  const errFrameBase = (cpu.sp - 6) & 0xffffff;
  write24(mem, errFrameBase, ERR_CATCH_ADDR);
  write24(mem, errFrameBase + 3, 0);
  write24(mem, ERR_SP_ADDR, errFrameBase);
  mem[ERR_NO_ADDR] = 0x00;

  let steps = 0;
  let finalPc = PARSEINP_ENTRY;
  let termination = 'unknown';
  let returnHit = false;
  let missingBlock = false;
  let errCatchSeen = false;

  try {
    const result = executor.runFrom(PARSEINP_ENTRY, 'adl', {
      maxSteps: PARSEINP_BUDGET,
      maxLoopIterations: MAX_LOOP_ITER,
      onBlock(pc, _mode, _meta, step) {
        finalPc = pc & 0xffffff;
        if (typeof step === 'number') steps = Math.max(steps, step + 1);
        if (finalPc === ERR_CATCH_ADDR) errCatchSeen = true;
        if (finalPc === FAKE_RET) throw new Error('__PARSE_RET__');
      },
      onMissingBlock(pc, _mode, step) {
        missingBlock = true;
        finalPc = pc & 0xffffff;
        if (typeof step === 'number') steps = Math.max(steps, step + 1);
        if (finalPc === ERR_CATCH_ADDR) errCatchSeen = true;
        if (finalPc === FAKE_RET) throw new Error('__PARSE_RET__');
      },
    });
    termination = result.termination ?? termination;
    finalPc = result.lastPc ?? finalPc;
    steps = Math.max(steps, result.steps ?? 0);
  } catch (error) {
    if (error?.message === '__PARSE_RET__') {
      returnHit = true;
      termination = 'return_hit';
      finalPc = FAKE_RET;
    } else {
      throw error;
    }
  }

  return {
    returnHit,
    termination,
    steps,
    finalPc,
    missingBlock,
    errCatchSeen,
    errNo: mem[ERR_NO_ADDR] & 0xff,
    errFrameBase,
  };
}

function snapshotWatched(mem) {
  const snapshot = {};
  for (const spec of WATCHED_BYTES) {
    snapshot[spec.offset] = mem[IY_BASE + spec.offset] & 0xff;
  }
  return snapshot;
}

function dumpIYBlock(mem) {
  const lines = [];
  for (let offset = 0; offset < IY_BLOCK_LEN; offset += 0x10) {
    const addr = IY_BASE + offset;
    const bytes = [];
    for (let i = 0; i < 0x10 && offset + i < IY_BLOCK_LEN; i++) {
      bytes.push(hexByte(mem[addr + i] & 0xff).slice(2));
    }
    lines.push(`${hex(addr)}: ${bytes.join(' ')}`);
  }
  return lines;
}

function printWatchedSnapshot(title, snapshot) {
  console.log(title);
  for (const spec of WATCHED_BYTES) {
    const value = snapshot[spec.offset] & 0xff;
    const address = IY_BASE + spec.offset;
    const baselineOk = spec.expectedByte === undefined ? true : value === spec.expectedByte;
    console.log(`${spec.labels.join(' / ')} @ IY+${hexByte(spec.offset)} (${hex(address)}) = ${hexByte(value)}`);
    console.log(`  note: ${spec.summary}`);

    if (spec.modeByte) {
      console.log(`  mode = ${numModeLabel(value)} [expected baseline normal/0, ${baselineOk ? 'safe' : 'review'}]`);
    } else if (spec.showAllBits) {
      console.log(`  raw bits = ${bitString(value)} [expected baseline ${hexByte(spec.expectedByte ?? 0)}, ${baselineOk ? 'safe' : 'review'}]`);
    } else if (!spec.bits?.length) {
      console.log(`  raw bits = ${bitString(value)} [expected baseline ${hexByte(spec.expectedByte ?? 0)}, ${baselineOk ? 'safe' : 'review'}]`);
    }

    for (const bitSpec of spec.bits ?? []) {
      const bitValue = (value >> bitSpec.bit) & 1;
      const bitOk = bitValue === bitSpec.expected;
      console.log(`  bit ${bitSpec.bit} ${bitSpec.label} = ${bitValue} [expected baseline ${bitSpec.expected}, ${bitOk ? 'safe' : 'review'}]`);
    }
  }
}

function diffWatched(before, after) {
  const changes = [];

  for (const spec of WATCHED_BYTES) {
    const beforeValue = before[spec.offset] & 0xff;
    const afterValue = after[spec.offset] & 0xff;
    if (beforeValue === afterValue) continue;

    const lines = [];
    lines.push(`${spec.labels.join(' / ')} @ IY+${hexByte(spec.offset)} (${hex(IY_BASE + spec.offset)}): ${hexByte(beforeValue)} -> ${hexByte(afterValue)}`);
    lines.push(`  raw bits: ${bitString(beforeValue)} -> ${bitString(afterValue)}`);

    if (spec.modeByte) {
      lines.push(`  mode: ${numModeLabel(beforeValue)} -> ${numModeLabel(afterValue)}`);
    }

    for (const bitSpec of spec.bits ?? []) {
      const beforeBit = (beforeValue >> bitSpec.bit) & 1;
      const afterBit = (afterValue >> bitSpec.bit) & 1;
      if (beforeBit !== afterBit) {
        lines.push(`  bit ${bitSpec.bit} ${bitSpec.label}: ${beforeBit} -> ${afterBit}`);
      }
    }

    changes.push(lines);
  }

  return changes;
}

function criticalSummary(snapshot) {
  const criticalSpecs = WATCHED_BYTES.filter((spec) => spec.critical);
  return criticalSpecs.map((spec) => ({
    name: spec.labels[0],
    offset: spec.offset,
    value: snapshot[spec.offset] & 0xff,
    isZero: (snapshot[spec.offset] & 0xff) === 0,
  }));
}

async function main() {
  console.log('=== Phase 25AZ: Enumerate Parser Flags Against PostInitState ===');
  console.log('Probe bootstrap: cold boot -> kernel init -> post-init -> MEM_INIT -> ParseInp("2+3")');
  console.log('');

  const { mem, executor, cpu } = await createExecutorFromFile();

  const boot = coldBoot(executor, cpu, mem);
  console.log(`boot: steps=${boot.steps ?? 'n/a'} term=${boot.termination ?? 'n/a'} lastPc=${hex(boot.lastPc ?? 0)}`);

  const memInit = runMemInit(executor, cpu, mem);
  console.log(`MEM_INIT: returnHit=${memInit.returnHit} steps~=${memInit.steps} finalPc=${hex(memInit.finalPc ?? 0)}`);
  console.log(`IY after MEM_INIT: ${hex(cpu._iy ?? 0)}`);
  console.log('');

  const beforeSnapshot = snapshotWatched(mem);
  printWatchedSnapshot('-- Post-MEM_INIT watched bytes --', beforeSnapshot);
  console.log('');

  console.log('-- Post-MEM_INIT IY block dump (0xD00080 .. 0xD000CF) --');
  for (const line of dumpIYBlock(mem)) {
    console.log(line);
  }
  console.log('');

  console.log('-- ParseInp("2+3") --');
  console.log(`token buffer @ ${hex(TOKEN_BUFFER_ADDR)}: ${Array.from(INPUT_TOKENS, (b) => hexByte(b).slice(2)).join(' ')}`);
  const parseRun = runParseInp(executor, cpu, mem);
  console.log(`ParseInp: returnHit=${parseRun.returnHit} termination=${parseRun.termination} steps~=${parseRun.steps} finalPc=${hex(parseRun.finalPc ?? 0)}`);
  console.log(`ParseInp: errNo=${hexByte(parseRun.errNo)} errCatchSeen=${parseRun.errCatchSeen} missingBlock=${parseRun.missingBlock} errFrameBase=${hex(parseRun.errFrameBase)}`);
  console.log('');

  const afterSnapshot = snapshotWatched(mem);
  printWatchedSnapshot('-- Post-ParseInp watched bytes --', afterSnapshot);
  console.log('');

  console.log('-- Watched-byte diff during ParseInp --');
  const changes = diffWatched(beforeSnapshot, afterSnapshot);
  if (changes.length === 0) {
    console.log('(none)');
  } else {
    for (const group of changes) {
      for (const line of group) console.log(line);
    }
  }
  console.log('');

  console.log('-- Verdict --');
  const critical = criticalSummary(beforeSnapshot);
  for (const item of critical) {
    console.log(`${item.name} @ IY+${hexByte(item.offset)} = ${hexByte(item.value)} (${item.isZero ? 'zero' : 'non-zero'})`);
  }
  const criticalAllZero = critical.every((item) => item.isZero);
  const pass = criticalAllZero && memInit.returnHit && parseRun.returnHit;
  console.log(pass
    ? 'PASS: critical parser bytes (ParsFlag, ParsFlag2, fmtFlags, numMode, hookflags4) are zero after MEM_INIT.'
    : 'FAIL: one or more critical parser bytes are non-zero after MEM_INIT, or the probe did not return cleanly.');

  process.exitCode = pass ? 0 : 1;
}

try {
  await main();
} catch (error) {
  console.error(error?.stack || String(error));
  process.exitCode = 1;
}
