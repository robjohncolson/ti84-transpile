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
const ROM_SIZE = 0x400000;

const PHASE1_ENTRY = 0x000000;
const PHASE2_ENTRY = 0x08C331;
const PHASE3_ENTRY = 0x0802B2;
const EVENT_LOOP_ENTRY = 0x003A73;

const STACK_RESET_TOP = 0xD1A87E;
const BOOT_RESET_SP = STACK_RESET_TOP - 3;
const EVENT_RESET_SP = STACK_RESET_TOP - 12;

const PHASE1_OPTS = { maxSteps: 20000, maxLoopIterations: 32 };
const PHASE2_OPTS = { maxSteps: 100000, maxLoopIterations: 10000 };
const PHASE3_OPTS = { maxSteps: 100, maxLoopIterations: 32 };

const EVENT_TRACE_OPTS = { maxSteps: 500000, maxLoopIterations: 500000 };
const DIRECT_SCAN_OPTS = { maxSteps: 5000, maxLoopIterations: 5000 };

const KEY_STATUS_ADDR = 0xD00080;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_AVAILABLE_MASK = 0x08;
const SYSFLAG_ADDR = 0xD177BA;
const SYSFLAG_CLEAR_VALUE = 0x00;
const FLASH_SEED_ADDR = 0x020100;
const FLASH_SEED_BYTES = [0x5A, 0xA5, 0x00];

const SCAN_ENTRY = 0x003C63;
const STORE_ENTRY = 0x003D4B;
const GETCSC_ENTRY = 0x003D5A;
const SCAN_TRACE_END = 0x003D60;
const PACK_ENTRY = 0x003D36;

const LOCAL_SCAN_START = 0x003C00;
const LOCAL_SCAN_END_EXCLUSIVE = 0x003D90;
const LOCAL_SEARCH_START = 0x003B80;
const LOCAL_SEARCH_END_EXCLUSIVE = 0x003E80;
const TABLE_SIZES = [56, 57, 64];

const KEYBOARD_PORT_MIN = 0xA000;
const KEYBOARD_PORT_MAX = 0xA01E;

const ROM_READ_LIMIT = 64;
const PORT_TRACE_LIMIT = 64;
const STORE_TRACE_LIMIT = 8;
const STATIC_CANDIDATE_LIMIT = 10;

const TASK_ENTER = { group: 1, bit: 0, label: 'ENTER' };

const KEY_LABELS = [
  ['DOWN', 'LEFT', 'RIGHT', 'UP', '', '', '', ''],
  ['ENTER', '+', '-', 'x', '/', '^', 'CLEAR', ''],
  ['(-)', '3', '6', '9', ')', 'TAN', 'VARS', ''],
  ['.', '2', '5', '8', '(', 'COS', 'PRGM', 'STAT'],
  ['0', '1', '4', '7', ',', 'SIN', 'APPS', 'X,T,theta,n'],
  ['', 'STO->', 'LN', 'LOG', 'x^2', 'x^-1', 'MATH', 'ALPHA'],
  ['GRAPH', 'TRACE', 'ZOOM', 'WINDOW', 'Y=', '2ND', 'MODE', 'DEL'],
  ['ON', '', '', '', '', '', '', ''],
];

const REQUESTED_LABELS = ['ENTER', 'CLEAR', '2ND', 'ALPHA', 'Y='];

const PERIPHERAL_OPTS = { timerInterrupt: false, gpioValue: 0xEE };

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
  'pc',
  'stepCount',
];

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function count(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function bytesToHex(buffer, start, length) {
  const normalizedStart = Math.max(0, Number(start) | 0);
  const normalizedLength = Math.max(0, Number(length) | 0);
  const end = Math.min(buffer.length, normalizedStart + normalizedLength);
  return Array.from(
    buffer.subarray(normalizedStart, end),
    (byte) => (byte & 0xFF).toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function makeKey(addr, mode = MODE) {
  return `${(addr & 0xFFFFFF).toString(16).padStart(6, '0')}:${mode}`;
}

function normalizeBlocks(raw) {
  if (Array.isArray(raw)) {
    return Object.fromEntries(raw.filter((entry) => entry?.id).map((entry) => [entry.id, entry]));
  }
  return raw ?? {};
}

function createMemoryImage(romBytes) {
  const mem = new Uint8Array(MEM_SIZE);
  mem.set(romBytes.subarray(0, Math.min(mem.length, romBytes.length)));
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

function restoreLcdMmio(executor, snapshot) {
  if (!snapshot || !executor?.lcdMmio) {
    return;
  }
  executor.lcdMmio.upbase = snapshot.upbase;
  executor.lcdMmio.control = snapshot.control;
}

function preparePhase(cpu, mem, sp, stackFillBytes) {
  cpu.halted = false;
  cpu.iff1 = 1;
  cpu.iff2 = 1;
  cpu._iy = KEY_STATUS_ADDR;
  cpu.sp = sp;
  mem.fill(0xFF, sp, sp + stackFillBytes);
}

function prepareEventLoop(cpu, executor, mem, bootState) {
  restoreCpu(cpu, bootState.cpuSnapshot);
  restoreLcdMmio(executor, bootState.lcdSnapshot);
  preparePhase(cpu, mem, EVENT_RESET_SP, 12);
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu._iy = KEY_STATUS_ADDR;
}

function seedFlashSignature(mem) {
  for (let index = 0; index < FLASH_SEED_BYTES.length; index += 1) {
    mem[FLASH_SEED_ADDR + index] = FLASH_SEED_BYTES[index];
  }
}

function seedSystemFlag(mem) {
  mem[SYSFLAG_ADDR] = SYSFLAG_CLEAR_VALUE;
}

function clearKeyState(mem, peripherals) {
  if (peripherals.keyboard?.keyMatrix) {
    peripherals.keyboard.keyMatrix.fill(0xFF);
    peripherals.keyboard.groupSelect = 0xFF;
  }
  if (peripherals.keyboardController) {
    peripherals.keyboardController.groupSelect = 0xFFFF;
  }
  if (typeof peripherals.clearKeyPressed === 'function') {
    peripherals.clearKeyPressed(mem);
  } else {
    mem[KEY_SCAN_CODE_ADDR] = 0x00;
    mem[KEY_STATUS_ADDR] &= ~KEY_AVAILABLE_MASK;
  }
  mem[KEY_SCAN_CODE_ADDR] = 0x00;
  mem[KEY_STATUS_ADDR] &= ~KEY_AVAILABLE_MASK;
}

function pressSingleKey(peripherals, group, bit) {
  peripherals.keyboard.keyMatrix.fill(0xFF);
  peripherals.setMatrixKey(group, bit, true);
}

function labelFor(group, bit) {
  return KEY_LABELS[group]?.[bit] || '';
}

function sdkGroupFor(group) {
  return 7 - group;
}

function summarizeKey(group, bit) {
  const label = labelFor(group, bit) || '(unused)';
  return `keyMatrix[${group}]:bit${bit} sdkGroup=${sdkGroupFor(group)} ${label}`;
}

function bootSystem(blocks, romBytes) {
  const mem = createMemoryImage(romBytes);
  const peripherals = createPeripheralBus(PERIPHERAL_OPTS);
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;

  const phase1 = executor.runFrom(PHASE1_ENTRY, 'z80', PHASE1_OPTS);

  preparePhase(cpu, mem, BOOT_RESET_SP, 3);
  const phase2 = executor.runFrom(PHASE2_ENTRY, MODE, PHASE2_OPTS);

  cpu.mbase = 0xD0;
  cpu._hl = 0;
  preparePhase(cpu, mem, BOOT_RESET_SP, 3);
  const phase3 = executor.runFrom(PHASE3_ENTRY, MODE, PHASE3_OPTS);

  return {
    phaseResults: [
      { label: 'Phase 1', result: phase1 },
      { label: 'Phase 2', result: phase2 },
      { label: 'Phase 3', result: phase3 },
    ],
    memSnapshot: Buffer.from(mem),
    cpuSnapshot: snapshotCpu(cpu),
    lcdSnapshot: executor.lcdMmio
      ? { upbase: executor.lcdMmio.upbase, control: executor.lcdMmio.control }
      : null,
  };
}

function wrapBlock(executor, blockKey, factory) {
  const original = executor.compiledBlocks[blockKey];
  if (!original) {
    return false;
  }
  executor.compiledBlocks[blockKey] = factory(original);
  return true;
}

function safeDecode(memory, pc, mode = MODE) {
  try {
    const decoded = decodeInstruction(memory, pc, mode);
    if (!decoded || !Number.isInteger(decoded.length) || decoded.length <= 0) {
      throw new Error('invalid decode length');
    }
    return decoded;
  } catch (error) {
    return {
      tag: 'db',
      value: memory[pc] ?? 0,
      length: 1,
      decodeError: error instanceof Error ? error.message : String(error),
    };
  }
}

function effectiveAddress(inst) {
  if (!Number.isInteger(inst?.addr)) {
    return null;
  }
  return inst.addr & 0xFFFFFF;
}

function formatInstruction(inst) {
  switch (inst?.tag) {
    case 'ld-pair-imm': return `ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-reg-imm': return `ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-mem': return `ld ${inst.dest}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `ld (${hex(inst.addr)}), ${inst.pair}`
        : `ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-mem-pair': return `ld (${hex(inst.addr)}), ${inst.pair}`;
    case 'call': return `call ${hex(inst.target)}`;
    case 'call-conditional': return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp': return `jp ${hex(inst.target)}`;
    case 'jp-conditional': return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jr': return `jr ${hex(inst.target)}`;
    case 'jr-conditional': return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'ret': return 'ret';
    case 'ret-conditional': return `ret ${inst.condition}`;
    case 'push': return `push ${inst.pair}`;
    case 'pop': return `pop ${inst.pair}`;
    case 'inc-pair': return `inc ${inst.pair}`;
    case 'dec-pair': return `dec ${inst.pair}`;
    case 'inc-reg': return `inc ${inst.reg}`;
    case 'dec-reg': return `dec ${inst.reg}`;
    case 'alu-imm': return `${inst.op} ${hexByte(inst.value)}`;
    case 'alu-reg': return `${inst.op} ${inst.src}`;
    case 'bit-test': return `bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind': return `bit ${inst.bit}, (${inst.indirectRegister})`;
    case 'indexed-cb-bit': return `bit ${inst.bit}, (${inst.indexRegister}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'indexed-cb-set': return `set ${inst.bit}, (${inst.indexRegister}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'indexed-cb-res': return `res ${inst.bit}, (${inst.indexRegister}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'ld-reg-ixd': return `ld ${inst.dest}, (${inst.indexRegister}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'ld-ixd-reg': return `ld (${inst.indexRegister}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}), ${inst.src}`;
    case 'out-reg': return `out (c), ${inst.reg}`;
    case 'in-reg': return `in ${inst.reg}, (c)`;
    case 'scf': return 'scf';
    case 'ccf': return 'ccf';
    case 'nop': return 'nop';
    case 'db': return `db ${hexByte(inst.value)}`;
    default: return inst?.dasm ?? inst?.tag ?? 'unknown';
  }
}

function disassembleRange(memory, start, endExclusive) {
  const rows = [];
  let pc = start;
  while (pc < endExclusive) {
    const inst = safeDecode(memory, pc, MODE);
    const length = Math.max(inst.length ?? 1, 1);
    rows.push({
      pc,
      bytes: bytesToHex(memory, pc, length).padEnd(18, ' '),
      text: formatInstruction(inst),
    });
    pc += length;
  }
  return rows;
}

function collectScanLoads(memory, start, endExclusive) {
  const loads = [];
  let pc = start;
  while (pc < endExclusive) {
    const inst = safeDecode(memory, pc, MODE);
    const length = Math.max(inst.length ?? 1, 1);
    if (inst.tag === 'ld-pair-imm' && Number.isInteger(inst.value) && inst.value >= 0 && inst.value < ROM_SIZE) {
      loads.push({
        pc,
        kind: `ld ${inst.pair}, imm`,
        value: inst.value & 0xFFFFFF,
      });
    }
    const addr = effectiveAddress(inst);
    if (
      addr !== null
      && addr >= 0
      && addr < ROM_SIZE
      && ['ld-reg-mem', 'ld-mem-reg', 'ld-pair-mem', 'ld-mem-pair'].includes(inst.tag)
    ) {
      loads.push({
        pc,
        kind: inst.tag,
        value: addr,
      });
    }
    pc += length;
  }
  return loads;
}

function scoreWindow(memory, start, size) {
  let compactCount = 0;
  let zeroCount = 0;
  const uniqueCompact = new Set();
  for (let index = 0; index < size; index += 1) {
    const value = memory[start + index] & 0xFF;
    if (value === 0x00) {
      zeroCount += 1;
    }
    if (value >= 0x01 && value <= 0x38) {
      compactCount += 1;
      uniqueCompact.add(value);
    }
  }
  return {
    start,
    size,
    compactCount,
    zeroCount,
    uniqueCompact: uniqueCompact.size,
    score: compactCount * 3 + uniqueCompact.size - Math.abs(size - 56),
  };
}

function findStaticCandidates(memory, start, endExclusive) {
  const raw = [];
  for (const size of TABLE_SIZES) {
    for (let addr = start; addr + size <= endExclusive; addr += 1) {
      const candidate = scoreWindow(memory, addr, size);
      if (candidate.compactCount < Math.max(16, Math.floor(size * 0.45))) {
        continue;
      }
      if (candidate.uniqueCompact < 12) {
        continue;
      }
      raw.push(candidate);
    }
  }

  raw.sort((left, right) => (
    right.score - left.score
    || right.uniqueCompact - left.uniqueCompact
    || right.compactCount - left.compactCount
    || left.start - right.start
  ));

  const deduped = [];
  for (const candidate of raw) {
    if (deduped.some((existing) => Math.abs(existing.start - candidate.start) < 8 && existing.size === candidate.size)) {
      continue;
    }
    deduped.push({
      ...candidate,
      preview: bytesToHex(memory, candidate.start, Math.min(candidate.size, 16)),
    });
    if (deduped.length >= STATIC_CANDIDATE_LIMIT) {
      break;
    }
  }

  return deduped;
}

function createTraceState() {
  return {
    currentBlockPc: null,
    currentMode: MODE,
    scanCalls: 0,
    blockHits: new Map(),
    romReads: [],
    portIo: [],
    storeSamples: [],
    packSamples: [],
  };
}

function installRomReadTrace(cpu, trace) {
  const originalRead8 = cpu.read8.bind(cpu);
  const originalRead16 = cpu.read16.bind(cpu);
  const originalRead24 = cpu.read24.bind(cpu);

  function shouldTrace() {
    return trace.currentBlockPc !== null && trace.currentBlockPc >= SCAN_ENTRY && trace.currentBlockPc <= SCAN_TRACE_END;
  }

  function record(kind, addr, value, width) {
    if (!shouldTrace()) {
      return;
    }
    const normalizedAddr = Number(addr) & 0xFFFFFF;
    if (normalizedAddr < 0 || normalizedAddr >= ROM_SIZE) {
      return;
    }
    if (trace.romReads.length >= ROM_READ_LIMIT) {
      return;
    }
    trace.romReads.push({
      kind,
      step: cpu.stepCount,
      blockPc: trace.currentBlockPc,
      addr: normalizedAddr,
      value,
      width,
    });
  }

  cpu.read8 = (addr) => {
    const value = originalRead8(addr) & 0xFF;
    record('read8', addr, value, 1);
    return value;
  };

  cpu.read16 = (addr) => {
    const value = originalRead16(addr) & 0xFFFF;
    record('read16', addr, value, 2);
    return value;
  };

  cpu.read24 = (addr) => {
    const value = originalRead24(addr) & 0xFFFFFF;
    record('read24', addr, value, 3);
    return value;
  };
}

function installKeyboardPortTrace(peripherals, cpu, trace) {
  const originalRead = peripherals.read.bind(peripherals);
  const originalWrite = peripherals.write.bind(peripherals);

  function shouldTrace() {
    return trace.currentBlockPc !== null && trace.currentBlockPc >= SCAN_ENTRY && trace.currentBlockPc <= SCAN_TRACE_END;
  }

  peripherals.read = (port) => {
    const normalizedPort = Number(port) & 0xFFFF;
    const value = originalRead(normalizedPort) & 0xFF;
    if (
      shouldTrace()
      && normalizedPort >= KEYBOARD_PORT_MIN
      && normalizedPort <= KEYBOARD_PORT_MAX
      && trace.portIo.length < PORT_TRACE_LIMIT
    ) {
      trace.portIo.push({
        kind: 'IN',
        step: cpu.stepCount,
        blockPc: trace.currentBlockPc,
        port: normalizedPort,
        value,
      });
    }
    return value;
  };

  peripherals.write = (port, value) => {
    const normalizedPort = Number(port) & 0xFFFF;
    const normalizedValue = Number(value) & 0xFF;
    originalWrite(normalizedPort, normalizedValue);
    if (
      shouldTrace()
      && normalizedPort >= KEYBOARD_PORT_MIN
      && normalizedPort <= KEYBOARD_PORT_MAX
      && trace.portIo.length < PORT_TRACE_LIMIT
    ) {
      trace.portIo.push({
        kind: 'OUT',
        step: cpu.stepCount,
        blockPc: trace.currentBlockPc,
        port: normalizedPort,
        value: normalizedValue,
      });
    }
  };
}

function installStoreTrace(executor, mem, trace) {
  wrapBlock(executor, makeKey(STORE_ENTRY), (original) => function wrappedStore(cpu) {
    const sample = {
      step: cpu.stepCount,
      aBefore: cpu.a & 0xFF,
      hBefore: cpu.h & 0xFF,
      lBefore: cpu.l & 0xFF,
      dBefore: cpu.d & 0xFF,
      eBefore: cpu.e & 0xFF,
      codeBefore: mem[KEY_SCAN_CODE_ADDR] & 0xFF,
      statusBefore: mem[KEY_STATUS_ADDR] & 0xFF,
    };
    const result = original(cpu);
    sample.codeAfter = mem[KEY_SCAN_CODE_ADDR] & 0xFF;
    sample.statusAfter = mem[KEY_STATUS_ADDR] & 0xFF;
    if (trace.storeSamples.length < STORE_TRACE_LIMIT) {
      trace.storeSamples.push(sample);
    }
    return result;
  });

  wrapBlock(executor, makeKey(PACK_ENTRY), (original) => function wrappedPack(cpu) {
    if (trace.packSamples.length < STORE_TRACE_LIMIT) {
      trace.packSamples.push({
        step: cpu.stepCount,
        aBefore: cpu.a & 0xFF,
        hBefore: cpu.h & 0xFF,
        lBefore: cpu.l & 0xFF,
        dBefore: cpu.d & 0xFF,
        eBefore: cpu.e & 0xFF,
      });
    }
    return original(cpu);
  });
}

function runDetailedEventLoopTrace(blocks, bootState, group, bit) {
  const mem = Uint8Array.from(bootState.memSnapshot);
  const peripherals = createPeripheralBus(PERIPHERAL_OPTS);
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;
  const trace = createTraceState();

  prepareEventLoop(cpu, executor, mem, bootState);
  seedFlashSignature(mem);
  seedSystemFlag(mem);
  clearKeyState(mem, peripherals);
  pressSingleKey(peripherals, group, bit);

  installRomReadTrace(cpu, trace);
  installKeyboardPortTrace(peripherals, cpu, trace);
  installStoreTrace(executor, mem, trace);

  const result = executor.runFrom(EVENT_LOOP_ENTRY, MODE, {
    ...EVENT_TRACE_OPTS,
    onBlock(pc, mode) {
      const normalizedPc = pc & 0xFFFFFF;
      trace.currentBlockPc = normalizedPc;
      trace.currentMode = mode ?? MODE;
      trace.blockHits.set(normalizedPc, (trace.blockHits.get(normalizedPc) ?? 0) + 1);
      if (normalizedPc === SCAN_ENTRY) {
        trace.scanCalls += 1;
      }
    },
  });

  return {
    result,
    mem,
    peripherals,
    trace,
  };
}

function runDirectScan(blocks, bootState, group, bit) {
  const mem = Uint8Array.from(bootState.memSnapshot);
  const peripherals = createPeripheralBus(PERIPHERAL_OPTS);
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;

  prepareEventLoop(cpu, executor, mem, bootState);
  seedFlashSignature(mem);
  seedSystemFlag(mem);
  clearKeyState(mem, peripherals);
  pressSingleKey(peripherals, group, bit);

  let storeHit = false;
  wrapBlock(executor, makeKey(STORE_ENTRY), (original) => function wrappedStore(cpuRef) {
    storeHit = true;
    return original(cpuRef);
  });

  cpu.push(0xFFFFFF);

  const result = executor.runFrom(SCAN_ENTRY, MODE, DIRECT_SCAN_OPTS);
  return {
    storeHit,
    code: mem[KEY_SCAN_CODE_ADDR] & 0xFF,
    available: (mem[KEY_STATUS_ADDR] & KEY_AVAILABLE_MASK) !== 0,
    result,
  };
}

function sweepMatrix(blocks, bootState) {
  const entries = [];
  for (let group = 0; group < 8; group += 1) {
    for (let bit = 0; bit < 8; bit += 1) {
      const run = runDirectScan(blocks, bootState, group, bit);
      entries.push({
        group,
        bit,
        sdkGroup: sdkGroupFor(group),
        label: labelFor(group, bit) || '(unused)',
        code: run.code,
        storeHit: run.storeHit,
        available: run.available,
        termination: run.result.termination,
      });
    }
  }
  return entries;
}

function inferArithmetic(rows) {
  const observed = [];
  for (let group = 0; group < 8; group += 1) {
    const groupRows = rows.filter((row) => row.group === group && row.storeHit);
    if (groupRows.length === 0) {
      continue;
    }
    const sorted = [...groupRows].sort((left, right) => left.bit - right.bit);
    const base = sorted[0].code;
    const contiguous = sorted.every((row, index) => row.code === ((base + index) & 0xFF));
    observed.push({
      group,
      base,
      contiguous,
      count: sorted.length,
    });
  }

  const deltas = [];
  for (let index = 1; index < observed.length; index += 1) {
    deltas.push((observed[index].base - observed[index - 1].base) & 0xFF);
  }

  const constantDelta = deltas.length > 0 && deltas.every((delta) => delta === deltas[0]);

  return {
    observed,
    constantDelta,
    delta: constantDelta ? deltas[0] : null,
  };
}

function findByLabel(entries, label) {
  return entries.find((entry) => entry.label === label) ?? null;
}

function printBootSummary(bootState) {
  console.log('=== BOOT SUMMARY ===');
  for (const phase of bootState.phaseResults) {
    console.log(
      `${phase.label}: steps=${count(phase.result.steps)} termination=${phase.result.termination} lastPc=${hex(phase.result.lastPc)}`,
    );
  }
  console.log('');
}

function printStaticAnalysis(romBytes) {
  console.log('=== STATIC SCAN OF 0x003C63..0x003D60 ===');
  for (const row of disassembleRange(romBytes, LOCAL_SCAN_START, LOCAL_SCAN_END_EXCLUSIVE)) {
    console.log(`${hex(row.pc)}  ${row.bytes} ${row.text}`);
  }
  console.log('');

  const loads = collectScanLoads(romBytes, SCAN_ENTRY, SCAN_TRACE_END + 1);
  console.log('Immediate ROM/data references inside the scan path:');
  if (loads.length === 0) {
    console.log('  none');
  } else {
    for (const load of loads) {
      console.log(`  ${hex(load.pc)}  ${load.kind.padEnd(12)} -> ${hex(load.value)}`);
    }
  }
  console.log('');

  console.log(`Heuristic table candidates near ${hex(SCAN_ENTRY)} (${hex(LOCAL_SEARCH_START)}..${hex(LOCAL_SEARCH_END_EXCLUSIVE - 1)}):`);
  const localCandidates = findStaticCandidates(romBytes, LOCAL_SEARCH_START, LOCAL_SEARCH_END_EXCLUSIVE);
  if (localCandidates.length === 0) {
    console.log('  none');
  } else {
    for (const candidate of localCandidates) {
      console.log(
        `  ${hex(candidate.start)} size=${candidate.size} compact=${candidate.compactCount} unique=${candidate.uniqueCompact} zeros=${candidate.zeroCount} score=${candidate.score} bytes=${candidate.preview}`,
      );
    }
  }
  console.log('');

  console.log('Known downstream translation table (for comparison only, not proven to be used here):');
  console.log(`  0x09F79B  ${bytesToHex(romBytes, 0x09F79B, 16)}`);
  console.log('');
}

function printDetailedTrace(traceResult) {
  const { result, mem, trace } = traceResult;
  console.log('=== DYNAMIC EVENT-LOOP TRACE ===');
  console.log(`Scenario key: ${summarizeKey(TASK_ENTER.group, TASK_ENTER.bit)}`);
  console.log(
    `event loop result: steps=${count(result.steps)} termination=${result.termination} lastPc=${hex(result.lastPc)} loopsForced=${count(result.loopsForced)}`,
  );
  console.log(`scan calls to ${hex(SCAN_ENTRY)}: ${count(trace.scanCalls)}`);
  console.log(`final ${hex(KEY_SCAN_CODE_ADDR)}=${hexByte(mem[KEY_SCAN_CODE_ADDR])} ${hex(KEY_STATUS_ADDR)}=${hexByte(mem[KEY_STATUS_ADDR])}`);
  console.log('');

  console.log('First store samples at 0x003D4B:');
  if (trace.storeSamples.length === 0) {
    console.log('  none');
  } else {
    for (const sample of trace.storeSamples) {
      console.log(
        `  step=${count(sample.step)} A=${hexByte(sample.aBefore)} H=${hexByte(sample.hBefore)} L=${hexByte(sample.lBefore)} D=${hexByte(sample.dBefore)} E=${hexByte(sample.eBefore)} code ${hexByte(sample.codeBefore)} -> ${hexByte(sample.codeAfter)} status ${hexByte(sample.statusBefore)} -> ${hexByte(sample.statusAfter)}`,
      );
    }
  }
  console.log('');

  console.log(`ROM data reads while current block was in ${hex(SCAN_ENTRY)}..${hex(SCAN_TRACE_END)}:`);
  if (trace.romReads.length === 0) {
    console.log('  none');
  } else {
    for (const read of trace.romReads) {
      console.log(
        `  step=${count(read.step)} block=${hex(read.blockPc)} ${read.kind} ${hex(read.addr)} => ${hex(read.value, read.width * 2)}`,
      );
    }
  }
  console.log('');

  console.log('Keyboard port I/O while inside the scan path:');
  if (trace.portIo.length === 0) {
    console.log('  none');
  } else {
    for (const io of trace.portIo) {
      console.log(
        `  step=${count(io.step)} block=${hex(io.blockPc)} ${io.kind} ${hex(io.port, 4)} ${io.kind === 'OUT' ? '<=' : '=>'} ${hexByte(io.value)}`,
      );
    }
  }
  console.log('');
}

function printSweep(entries) {
  console.log('=== FULL MATRIX SWEEP VIA DIRECT 0x003C63 CALL ===');
  for (let group = 0; group < 8; group += 1) {
    console.log(`keyMatrix group ${group} (sdkGroup ${sdkGroupFor(group)}):`);
    const groupEntries = entries.filter((entry) => entry.group === group).sort((left, right) => left.bit - right.bit);
    for (const entry of groupEntries) {
      console.log(
        `  bit${entry.bit} ${entry.label.padEnd(12)} -> ${entry.storeHit ? hexByte(entry.code) : '--'} ${entry.storeHit ? '' : `(${entry.termination})`}`.trimEnd(),
      );
    }
  }
  console.log('');

  console.log('Requested labels:');
  for (const label of REQUESTED_LABELS) {
    const entry = findByLabel(entries, label);
    if (!entry) {
      console.log(`  ${label}: not present in keyMatrix map`);
      continue;
    }
    console.log(
      `  ${label.padEnd(5)} keyMatrix[${entry.group}]:bit${entry.bit} sdkGroup=${entry.sdkGroup} -> ${entry.storeHit ? hexByte(entry.code) : '--'}`,
    );
  }
  console.log('');

  const arithmetic = inferArithmetic(entries);
  console.log('Arithmetic pattern check:');
  for (const row of arithmetic.observed) {
    console.log(
      `  group ${row.group}: base=${hexByte(row.base)} count=${row.count} contiguous=${row.contiguous ? 'yes' : 'no'}`,
    );
  }
  if (arithmetic.constantDelta) {
    console.log(`  group-to-group delta is constant: ${hexByte(arithmetic.delta)}`);
  } else {
    console.log('  group-to-group delta is not constant');
  }
  console.log('');
}

function printConclusion(traceResult, entries) {
  const enterEntry = findByLabel(entries, 'ENTER');
  const clearEntry = findByLabel(entries, 'CLEAR');
  const secondEntry = findByLabel(entries, '2ND');
  const alphaEntry = findByLabel(entries, 'ALPHA');
  const yEntry = findByLabel(entries, 'Y=');
  const packSeen = traceResult.trace.packSamples.length > 0;

  console.log('=== CONCLUSION ===');
  if (traceResult.trace.romReads.length === 0) {
    console.log(`No ROM data table was read while executing ${hex(SCAN_ENTRY)}..${hex(SCAN_TRACE_END)} for the ENTER scenario.`);
    console.log(`The scan code appears to be produced inline by the arithmetic tail at ${hex(PACK_ENTRY)}..${hex(0x003D45)}, then stored at ${hex(STORE_ENTRY)}.`);
  } else {
    const uniqueAddrs = [...new Set(traceResult.trace.romReads.map((read) => read.addr))];
    console.log(`ROM data reads were observed during scan: ${uniqueAddrs.map((addr) => hex(addr)).join(', ')}`);
    console.log('Treat those addresses as candidate table reads.');
  }

  console.log(`Detailed ENTER event-loop trace finished with ${hex(KEY_SCAN_CODE_ADDR)}=${hexByte(traceResult.mem[KEY_SCAN_CODE_ADDR])}.`);
  console.log(`Direct-scan sweep says ENTER is ${enterEntry ? `keyMatrix[${enterEntry.group}]:bit${enterEntry.bit} -> ${hexByte(enterEntry.code)}` : 'not found'}.`);
  console.log(`Requested summary: CLEAR=${clearEntry ? hexByte(clearEntry.code) : 'n/a'} 2ND=${secondEntry ? hexByte(secondEntry.code) : 'n/a'} ALPHA=${alphaEntry ? hexByte(alphaEntry.code) : 'n/a'} Y==${yEntry ? hexByte(yEntry.code) : 'n/a'}`);
  if (packSeen) {
    const first = traceResult.trace.packSamples[0];
    console.log(`First arithmetic pack sample before ${hex(PACK_ENTRY)}: A=${hexByte(first.aBefore)} H=${hexByte(first.hBefore)} L=${hexByte(first.lBefore)} D=${hexByte(first.dBefore)} E=${hexByte(first.eBefore)}`);
  }
  console.log('');
}

async function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error(`ROM not found: ${ROM_PATH}`);
  }
  if (!fs.existsSync(TRANSPILED_PATH)) {
    throw new Error(`Transpiled ROM not found: ${TRANSPILED_PATH}`);
  }

  const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));
  const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
  const blocks = normalizeBlocks(
    romModule.PRELIFTED_BLOCKS
    ?? romModule.default?.PRELIFTED_BLOCKS
    ?? romModule.default
    ?? romModule,
  );

  if (!blocks || Object.keys(blocks).length === 0) {
    throw new Error('Unable to load PRELIFTED_BLOCKS from ROM.transpiled.js');
  }

  console.log('=== PROBE: PHASE 378 SCANCODE TABLE HUNT ===');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`Transpiled blocks: ${count(Object.keys(blocks).length)}`);
  console.log(`Task scenario: ${summarizeKey(TASK_ENTER.group, TASK_ENTER.bit)}`);
  console.log('');

  const bootState = bootSystem(blocks, romBytes);
  printBootSummary(bootState);
  printStaticAnalysis(romBytes);

  const traceResult = runDetailedEventLoopTrace(blocks, bootState, TASK_ENTER.group, TASK_ENTER.bit);
  printDetailedTrace(traceResult);

  const entries = sweepMatrix(blocks, bootState);
  printSweep(entries);
  printConclusion(traceResult, entries);
}

main().catch((error) => {
  console.error(error.stack || String(error));
  process.exitCode = 1;
});
