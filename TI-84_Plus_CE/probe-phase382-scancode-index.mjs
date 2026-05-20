#!/usr/bin/env node

/**
 * Phase 382 — Scan Code Index Discrepancy Probe
 *
 * Investigates whether the event-loop key path converts the reversed _GetCSC
 * scan code before the translation table at ROM 0x09F79B is indexed.
 *
 * The probe prints:
 *   1. Static disassembly of the _GetCSC store window at 0x003D34-0x003D55.
 *   2. Static disassembly of the translation lookup window around 0x03010D.
 *   3. Direct CALL/JP refs to the relevant entry points in that chain.
 *   4. A natural matrix ENTER trace (group 1, bit 0) with DI+HALT bypass.
 *   5. A forced scan-code control trace via peripherals.setKeyPressed(...,0x29).
 *
 * Notes:
 *   - cpu-runtime.js currently exports createExecutor, not createRuntime.
 *     This probe keeps a tiny local createRuntime() compatibility wrapper so
 *     the rest of the file can follow the older probe style.
 *   - The natural matrix trace is the one that answers the core question:
 *     what value _GetCSC actually stores at 0xD00587 before the later lookup.
 *   - The forced control trace is included to compare downstream behavior when
 *     0x29 is injected directly into RAM.
 */

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

const PHASE1_ENTRY = 0x000000;
const PHASE2_ENTRY = 0x08C331;
const PHASE3_ENTRY = 0x0802B2;
const EVENT_LOOP_ENTRY = 0x003A73;

const PHASE1_OPTS = { maxSteps: 20000, maxLoopIterations: 32 };
const PHASE2_OPTS = { maxSteps: 100000, maxLoopIterations: 10000 };
const PHASE3_OPTS = { maxSteps: 100, maxLoopIterations: 32 };
const EVENT_OPTS = { maxSteps: 1000000, maxLoopIterations: 500000 };

const STACK_RESET_TOP = 0xD1A87E;
const BOOT_RESET_SP = STACK_RESET_TOP - 3;
const EVENT_RESET_SP = STACK_RESET_TOP - 12;

const GPIO_VALUE = 0xEE;

const KEY_STATUS_ADDR = 0xD00080;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_AVAILABLE_MASK = 0x08;

const FLASH_SEED_ADDR = 0x020100;
const FLASH_SEED_BYTES = [0x5A, 0xA5, 0x00];
const SYSFLAG_ADDR = 0xD177BA;

const TABLE_BASE = 0x09F79B;
const TABLE_LENGTH = 0xE0;

const GETCSC_WRAPPER = 0x003D5A;
const GETCSC_STORE_BLOCK = 0x003D4B;
const GETCSC_CONSUME_BLOCK = 0x003D75;
const DISPATCH_GATE = 0x001713;
const NORMAL_HANDLER = 0x001853;

const LOOKUP_ROUTINE_START = 0x0300F1;
const LOOKUP_ALPHA_GATE = 0x03FBF2;
const LOOKUP_WINDOW_TARGET = 0x03010D;
const LOOKUP_NO_2ND_PATH = 0x030074;
const LOOKUP_ADD_38 = 0x030117;
const LOOKUP_TABLE_PTR = 0x03011C;
const LOOKUP_TABLE_PATH = 0x02FF0B;
const LOOKUP_POST_TABLE = 0x02FF1B;

const ENTER_GROUP = 1;
const ENTER_BIT = 0;
const ENTER_OS_SCAN = 0x29;

const STOP_SIGNAL = '__PHASE382_STOP__';

const CPU_SNAPSHOT_FIELDS = [
  'a', 'f', '_bc', '_de', '_hl', '_a2', '_f2', '_bc2', '_de2', '_hl2',
  'sp', '_ix', '_iy', 'i', 'im', 'iff1', 'iff2', 'madl', 'mbase',
  'halted', 'cycles', 'pc', 'stepCount',
];

const CONTROL_OPS = new Map([
  [0xCD, { kind: 'call', cond: '' }],
  [0xC4, { kind: 'call', cond: 'nz' }],
  [0xCC, { kind: 'call', cond: 'z' }],
  [0xD4, { kind: 'call', cond: 'nc' }],
  [0xDC, { kind: 'call', cond: 'c' }],
  [0xE4, { kind: 'call', cond: 'po' }],
  [0xEC, { kind: 'call', cond: 'pe' }],
  [0xF4, { kind: 'call', cond: 'p' }],
  [0xFC, { kind: 'call', cond: 'm' }],
  [0xC3, { kind: 'jp', cond: '' }],
  [0xC2, { kind: 'jp', cond: 'nz' }],
  [0xCA, { kind: 'jp', cond: 'z' }],
  [0xD2, { kind: 'jp', cond: 'nc' }],
  [0xDA, { kind: 'jp', cond: 'c' }],
  [0xE2, { kind: 'jp', cond: 'po' }],
  [0xEA, { kind: 'jp', cond: 'pe' }],
  [0xF2, { kind: 'jp', cond: 'p' }],
  [0xFA, { kind: 'jp', cond: 'm' }],
]);

const INTERESTING_BLOCKS = new Set([
  EVENT_LOOP_ENTRY,
  GETCSC_WRAPPER,
  GETCSC_STORE_BLOCK,
  GETCSC_CONSUME_BLOCK,
  0x003A7D,
  DISPATCH_GATE,
  NORMAL_HANDLER,
  LOOKUP_ALPHA_GATE,
  LOOKUP_ROUTINE_START,
  LOOKUP_WINDOW_TARGET,
  LOOKUP_NO_2ND_PATH,
  LOOKUP_ADD_38,
  LOOKUP_TABLE_PTR,
  LOOKUP_TABLE_PATH,
  LOOKUP_POST_TABLE,
  0x022346,
]);

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

function bytesHex(buffer, start, length) {
  const end = Math.min(buffer.length, start + length);
  return Array.from(
    buffer.subarray(start, end),
    (byte) => (byte & 0xFF).toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
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

function seedGates(mem) {
  for (let i = 0; i < FLASH_SEED_BYTES.length; i += 1) {
    mem[FLASH_SEED_ADDR + i] = FLASH_SEED_BYTES[i];
  }
  mem[SYSFLAG_ADDR] = 0x00;
}

function resetKeyboard(peripherals) {
  if (peripherals.keyboard?.keyMatrix) {
    peripherals.keyboard.keyMatrix.fill(0xFF);
    peripherals.keyboard.groupSelect = 0xFF;
  }
  if (peripherals.keyboardController) {
    peripherals.keyboardController.groupSelect = 0xFFFF;
  }
}

function createRuntime(blocks, memory, peripherals) {
  return createExecutor(blocks, memory, { peripherals });
}

function stopError(kind) {
  const error = new Error(STOP_SIGNAL);
  error.phase382Stop = { kind };
  return error;
}

function currentIYByte(cpu, displacement) {
  const addr = ((cpu._iy ?? cpu.iy ?? 0) + displacement) & 0xFFFFFF;
  return cpu.memory?.[addr] ?? 0;
}

function cloneHistoryEntry(entry) {
  return {
    step: entry.step,
    pc: entry.pc,
    mode: entry.mode,
    a: entry.a,
    f: entry.f,
    bc: entry.bc,
    de: entry.de,
    hl: entry.hl,
    sp: entry.sp,
  };
}

function ringPush(history, entry, max = 24) {
  history.push(entry);
  if (history.length > max) {
    history.shift();
  }
}

function formatInstruction(inst) {
  if (!inst) {
    return 'db ??';
  }

  const idx = (displacement, register) => `(${String(register).toUpperCase()}${displacement >= 0 ? '+' : ''}${displacement})`;

  switch (inst.tag) {
    case 'nop': return 'nop';
    case 'halt': return 'halt';
    case 'di': return 'di';
    case 'ei': return 'ei';
    case 'ret': return 'ret';
    case 'ret-conditional': return `ret ${inst.condition}`;
    case 'reti': return 'reti';
    case 'retn': return 'retn';
    case 'jr': return `jr ${hex(inst.target)}`;
    case 'jr-conditional': return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'jp': return `jp ${hex(inst.target)}`;
    case 'jp-conditional': return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect': return `jp (${String(inst.indirectRegister).toUpperCase()})`;
    case 'call': return `call ${hex(inst.target)}`;
    case 'call-conditional': return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'push': return `push ${String(inst.pair).toUpperCase()}`;
    case 'pop': return `pop ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-imm': return `ld ${String(inst.pair).toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-imm': return `ld ${String(inst.dest).toUpperCase()}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `ld ${String(inst.dest).toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-mem': return `ld ${String(inst.dest).toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `ld (${hex(inst.addr)}), ${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind': return `ld ${String(inst.dest).toUpperCase()}, (${String(inst.src).toUpperCase()})`;
    case 'ld-ind-reg': return `ld (${String(inst.dest).toUpperCase()}), ${String(inst.src).toUpperCase()}`;
    case 'alu-reg':
      return inst.op === 'xor' && String(inst.src).toLowerCase() === 'a'
        ? 'xor a'
        : `${inst.op} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm': return `${inst.op} ${hexByte(inst.value)}`;
    case 'inc-reg': return `inc ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg': return `dec ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair': return `inc ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair': return `dec ${String(inst.pair).toUpperCase()}`;
    case 'add-pair': return `add ${String(inst.dest ?? 'HL').toUpperCase()}, ${String(inst.src).toUpperCase()}`;
    case 'in0': return `in0 ${String(inst.reg ?? 'a').toUpperCase()}, (${hexByte(inst.port)})`;
    case 'out0': return `out0 (${hexByte(inst.port)}), ${String(inst.reg ?? 'a').toUpperCase()}`;
    case 'in-reg': return `in ${String(inst.reg ?? 'a').toUpperCase()}, (c)`;
    case 'out-reg': return `out (c), ${String(inst.reg ?? 'a').toUpperCase()}`;
    case 'djnz': return `djnz ${hex(inst.target)}`;
    case 'rla': return 'rla';
    case 'rrca': return 'rrca';
    case 'rlca': return 'rlca';
    case 'ccf': return 'ccf';
    case 'scf': return 'scf';
    case 'cpl': return 'cpl';
    case 'ldir': return 'ldir';
    case 'indexed-cb-bit': return `bit ${inst.bit}, ${idx(inst.displacement, inst.indexRegister)}`;
    case 'indexed-cb-set': return `set ${inst.bit}, ${idx(inst.displacement, inst.indexRegister)}`;
    case 'indexed-cb-res': return `res ${inst.bit}, ${idx(inst.displacement, inst.indexRegister)}`;
    default: return inst.tag;
  }
}

function disasmRows(romBytes, start, endExclusive) {
  const rows = [];
  let pc = start;

  while (pc < endExclusive && pc < romBytes.length) {
    let inst = null;
    try {
      inst = decodeInstruction(romBytes, pc, MODE);
    } catch {
      inst = null;
    }

    const length = Math.max(1, inst?.length ?? 1);
    rows.push({
      pc,
      bytes: bytesHex(romBytes, pc, length),
      text: formatInstruction(inst),
    });
    pc += length;
  }

  return rows;
}

function printDisasmSection(title, start, endExclusive, rows, markers = new Map()) {
  console.log(`\n=== ${title} ===`);
  console.log(`Range: ${hex(start)} - ${hex(endExclusive - 1)}`);
  for (const row of rows) {
    const marker = markers.get(row.pc) ? `  <== ${markers.get(row.pc)}` : '';
    console.log(`  ${hex(row.pc)}  ${row.bytes.padEnd(15)}  ${row.text}${marker}`);
  }
}

function read24LE(bytes, offset) {
  return (
    (bytes[offset] ?? 0) |
    ((bytes[offset + 1] ?? 0) << 8) |
    ((bytes[offset + 2] ?? 0) << 16)
  ) >>> 0;
}

function findControlRefs(romBytes, target) {
  const refs = [];
  for (let pc = 0; pc < romBytes.length - 3; pc += 1) {
    const meta = CONTROL_OPS.get(romBytes[pc]);
    if (!meta) {
      continue;
    }
    if (read24LE(romBytes, pc + 1) !== (target >>> 0)) {
      continue;
    }
    refs.push({
      pc,
      kind: meta.kind,
      cond: meta.cond,
      bytes: bytesHex(romBytes, pc, 4),
    });
  }
  return refs;
}

function printControlRefs(label, target, refs) {
  console.log(`\n=== Direct Refs: ${label} (${hex(target)}) ===`);
  if (refs.length === 0) {
    console.log('  none');
    return;
  }
  for (const ref of refs) {
    const suffix = ref.cond ? ` ${ref.cond}` : '';
    console.log(`  ${hex(ref.pc)}  ${ref.bytes.padEnd(11)}  ${ref.kind}${suffix}`);
  }
}

async function loadRomAndBlocks() {
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
  return { romBytes, blocks };
}

function runBootPhases(blocks, romBytes) {
  const mem = createMemoryImage(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false, gpioValue: GPIO_VALUE });
  const executor = createRuntime(blocks, mem, peripherals);
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

function interestingHit(cpu, pc, mode, step) {
  return {
    step,
    pc: pc & 0xFFFFFF,
    mode,
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    bc: cpu.bc & 0xFFFFFF,
    de: cpu.de & 0xFFFFFF,
    hl: cpu.hl & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
  };
}

function installTraceHooks(executor, history, trace) {
  const { cpu } = executor;
  const originalRead8 = cpu.read8.bind(cpu);
  const originalWrite8 = cpu.write8.bind(cpu);

  cpu.read8 = (addr) => {
    const value = originalRead8(addr);
    const normalizedAddr = addr & 0xFFFFFF;

    if (normalizedAddr >= TABLE_BASE && normalizedAddr < TABLE_BASE + TABLE_LENGTH && trace.tableReads.length < 16) {
      trace.tableReads.push({
        step: cpu.stepCount ?? 0,
        pc: cpu._currentBlockPc ?? cpu.pc ?? 0,
        addr: normalizedAddr,
        index: normalizedAddr - TABLE_BASE,
        value: value & 0xFF,
        a: cpu.a & 0xFF,
        f: cpu.f & 0xFF,
        hl: cpu.hl & 0xFFFFFF,
        de: cpu.de & 0xFFFFFF,
        iy12: currentIYByte(cpu, 0x12),
        history: history.map(cloneHistoryEntry),
      });
      if (trace.stopAfterStep === null) {
        trace.stopAfterStep = (cpu.stepCount ?? 0) + 32;
      }
    }

    return value;
  };

  cpu.write8 = (addr, value) => {
    const normalizedAddr = addr & 0xFFFFFF;
    const normalizedValue = value & 0xFF;

    if (normalizedAddr === KEY_SCAN_CODE_ADDR && trace.d00587Writes.length < 16) {
      trace.d00587Writes.push({
        step: cpu.stepCount ?? 0,
        pc: cpu._currentBlockPc ?? cpu.pc ?? 0,
        addr: normalizedAddr,
        value: normalizedValue,
        a: cpu.a & 0xFF,
        f: cpu.f & 0xFF,
        hl: cpu.hl & 0xFFFFFF,
        de: cpu.de & 0xFFFFFF,
        history: history.map(cloneHistoryEntry),
      });
    }

    if (normalizedAddr === KEY_STATUS_ADDR && trace.keyStatusWrites.length < 16) {
      trace.keyStatusWrites.push({
        step: cpu.stepCount ?? 0,
        pc: cpu._currentBlockPc ?? cpu.pc ?? 0,
        addr: normalizedAddr,
        value: normalizedValue,
        a: cpu.a & 0xFF,
        f: cpu.f & 0xFF,
      });
    }

    return originalWrite8(addr, value);
  };
}

function runTraceScenario(blocks, bootState, label, inject) {
  const mem = Uint8Array.from(bootState.memSnapshot);
  const peripherals = createPeripheralBus({ timerInterrupt: false, gpioValue: GPIO_VALUE });
  const executor = createRuntime(blocks, mem, peripherals);
  const { cpu } = executor;

  prepareEventLoop(cpu, executor, mem, bootState);
  seedGates(mem);
  resetKeyboard(peripherals);

  const history = [];
  const trace = {
    label,
    interestingHits: [],
    d00587Writes: [],
    keyStatusWrites: [],
    tableReads: [],
    stopAfterStep: null,
  };

  installTraceHooks(executor, history, trace);
  inject({ cpu, mem, peripherals });

  let result = null;
  let stoppedBySignal = false;

  try {
    result = executor.runFrom(EVENT_LOOP_ENTRY, MODE, {
      ...EVENT_OPTS,
      diHaltBypass: true,
      diHaltBypassEntry: EVENT_LOOP_ENTRY,
      onBlock(pc, mode, _meta, step) {
        const hit = interestingHit(cpu, pc, mode, step);
        ringPush(history, hit);

        if (INTERESTING_BLOCKS.has(hit.pc)) {
          trace.interestingHits.push(hit);
        }

        if (trace.stopAfterStep !== null && step >= trace.stopAfterStep) {
          throw stopError('table-read-captured');
        }
      },
    });
  } catch (error) {
    if (error?.message === STOP_SIGNAL) {
      stoppedBySignal = true;
      result = {
        steps: cpu.stepCount ?? 0,
        lastPc: cpu.pc ?? 0,
        termination: error.phase382Stop?.kind ?? 'signal',
      };
    } else {
      throw error;
    }
  }

  return {
    label,
    stoppedBySignal,
    result,
    finalScanCode: mem[KEY_SCAN_CODE_ADDR] & 0xFF,
    finalKeyStatus: mem[KEY_STATUS_ADDR] & 0xFF,
    tableReads: trace.tableReads,
    d00587Writes: trace.d00587Writes,
    keyStatusWrites: trace.keyStatusWrites,
    interestingHits: trace.interestingHits,
  };
}

function printBootSummary(bootState) {
  console.log('\n=== Boot Baseline ===');
  for (const phase of bootState.phaseResults) {
    console.log(
      `  ${phase.label}: steps=${count(phase.result?.steps)} termination=${phase.result?.termination ?? 'n/a'} lastPc=${hex(phase.result?.lastPc ?? 0)}`,
    );
  }
}

function printInterestingHits(run) {
  console.log(`\nInteresting block hits (${run.label}):`);
  if (run.interestingHits.length === 0) {
    console.log('  none');
    return;
  }

  for (const hit of run.interestingHits) {
    console.log(
      `  step=${count(hit.step).padStart(8)} pc=${hex(hit.pc)} a=${hexByte(hit.a)} f=${hexByte(hit.f)} hl=${hex(hit.hl)} de=${hex(hit.de)} sp=${hex(hit.sp)}`,
    );
  }
}

function printWriteEvents(run) {
  console.log(`\nD00587 writes (${run.label}):`);
  if (run.d00587Writes.length === 0) {
    console.log('  none');
  } else {
    for (const event of run.d00587Writes) {
      console.log(
        `  step=${count(event.step).padStart(8)} pc=${hex(event.pc)} value=${hexByte(event.value)} a=${hexByte(event.a)} hl=${hex(event.hl)} de=${hex(event.de)}`,
      );
    }
  }

  console.log(`\nD00080 writes (${run.label}):`);
  if (run.keyStatusWrites.length === 0) {
    console.log('  none');
  } else {
    for (const event of run.keyStatusWrites) {
      console.log(
        `  step=${count(event.step).padStart(8)} pc=${hex(event.pc)} value=${hexByte(event.value)} a=${hexByte(event.a)} f=${hexByte(event.f)}`,
      );
    }
  }
}

function printHistory(prefix, history) {
  if (!history || history.length === 0) {
    console.log(`  ${prefix}: none`);
    return;
  }

  console.log(`  ${prefix}:`);
  for (const hit of history) {
    console.log(
      `    step=${count(hit.step).padStart(8)} pc=${hex(hit.pc)} a=${hexByte(hit.a)} f=${hexByte(hit.f)} hl=${hex(hit.hl)} de=${hex(hit.de)}`,
    );
  }
}

function printTableReads(run) {
  console.log(`\n09F79B table reads (${run.label}):`);
  if (run.tableReads.length === 0) {
    console.log('  none');
    return;
  }

  for (const event of run.tableReads) {
    console.log(
      `  step=${count(event.step).padStart(8)} pc=${hex(event.pc)} addr=${hex(event.addr)} index=${hexByte(event.index)} value=${hexByte(event.value)} a=${hexByte(event.a)} hl=${hex(event.hl)} de=${hex(event.de)} iy+12=${hexByte(event.iy12)}`,
    );
  }

  const first = run.tableReads[0];
  if (first) {
    printHistory('history before first table read', first.history);
  }
}

function printRunSummary(run) {
  console.log(`\n=== Dynamic Trace: ${run.label} ===`);
  console.log(
    `  termination=${run.result?.termination ?? 'n/a'} steps=${count(run.result?.steps)} lastPc=${hex(run.result?.lastPc ?? 0)} stoppedBySignal=${run.stoppedBySignal}`,
  );
  console.log(`  final D00587=${hexByte(run.finalScanCode)} final D00080=${hexByte(run.finalKeyStatus)}`);

  const firstStore = run.d00587Writes[0] ?? null;
  const firstTableRead = run.tableReads[0] ?? null;

  console.log(
    `  first D00587 write=${firstStore ? `${hexByte(firstStore.value)} at ${hex(firstStore.pc)}` : 'none'}`,
  );
  console.log(
    `  first table read=${firstTableRead ? `${hex(firstTableRead.addr)} (index ${hexByte(firstTableRead.index)}) value ${hexByte(firstTableRead.value)} at ${hex(firstTableRead.pc)}` : 'none'}`,
  );

  if (firstStore) {
    printHistory('history before first D00587 write', firstStore.history);
  }

  printWriteEvents(run);
  printTableReads(run);
  printInterestingHits(run);
}

function printStaticSections(romBytes) {
  const getCscStart = 0x003D34;
  const getCscEnd = 0x003D55;
  const getCscRows = disasmRows(romBytes, getCscStart, getCscEnd);
  printDisasmSection(
    '_GetCSC Scan-Code Store Window',
    getCscStart,
    getCscEnd,
    getCscRows,
    new Map([
      [0x003D36, 'A <- H'],
      [0x003D3D, 'shift (H-1) by 3'],
      [0x003D40, 'increment while scanning bit'],
      [0x003D4B, 'store A to D00587'],
    ]),
  );

  const lookupStart = LOOKUP_ROUTINE_START;
  const lookupEnd = 0x030140;
  const lookupRows = disasmRows(romBytes, lookupStart, lookupEnd);
  printDisasmSection(
    'Lookup Routine Around 0x03010D',
    lookupStart,
    lookupEnd,
    lookupRows,
    new Map([
      [0x0300FF, 'CALL 03FBF2'],
      [0x03010D, 'ADD A,0x70'],
      [0x030113, 'JP Z,030074'],
      [0x030117, 'ADD A,0x38'],
      [0x03011C, 'DE <- 09F79B'],
      [0x030074, 'JP 02FF0B'],
    ]),
  );

  printControlRefs('_GetCSC wrapper', GETCSC_WRAPPER, findControlRefs(romBytes, GETCSC_WRAPPER));
  printControlRefs('dispatch gate', DISPATCH_GATE, findControlRefs(romBytes, DISPATCH_GATE));
  printControlRefs('lookup mid-block 0x03010D', LOOKUP_WINDOW_TARGET, findControlRefs(romBytes, LOOKUP_WINDOW_TARGET));
  printControlRefs('lookup flag gate 0x03FBF2', LOOKUP_ALPHA_GATE, findControlRefs(romBytes, LOOKUP_ALPHA_GATE));
  printControlRefs('lookup no-2nd path 0x030074', LOOKUP_NO_2ND_PATH, findControlRefs(romBytes, LOOKUP_NO_2ND_PATH));
  printControlRefs('lookup table path 0x02FF0B', LOOKUP_TABLE_PATH, findControlRefs(romBytes, LOOKUP_TABLE_PATH));
  printControlRefs('lookup post-table path 0x02FF1B', LOOKUP_POST_TABLE, findControlRefs(romBytes, LOOKUP_POST_TABLE));

  console.log('\n=== Static Notes ===');
  console.log(`  0x003D4B stores A directly to ${hex(KEY_SCAN_CODE_ADDR)} after the 0x003D36..0x003D43 computation.`);
  console.log(`  There are no direct CALL/JP refs to 0x03010D because it is a mid-routine block, not an entry point.`);
  console.log(`  The nearby split is 0x030113 -> 0x030074 -> 0x02FF0B versus 0x030117 -> 0x03011C.`);
}

function printFinalSummary(naturalRun, forcedRun) {
  const naturalStore = naturalRun.d00587Writes[0] ?? null;
  const naturalRead = naturalRun.tableReads[0] ?? null;
  const forcedRead = forcedRun.tableReads[0] ?? null;

  console.log('\n=== Summary ===');
  console.log(
    `  Natural matrix ENTER first stored ${naturalStore ? hexByte(naturalStore.value) : 'none'} to ${hex(KEY_SCAN_CODE_ADDR)}.`,
  );
  console.log(
    `  Natural matrix ENTER first table index was ${naturalRead ? hexByte(naturalRead.index) : 'none'} (read at ${naturalRead ? hex(naturalRead.addr) : 'n/a'}).`,
  );
  console.log(
    `  Forced RAM ENTER first table index was ${forcedRead ? hexByte(forcedRead.index) : 'none'} (read at ${forcedRead ? hex(forcedRead.addr) : 'n/a'}).`,
  );

  if (naturalRead && forcedRead) {
    const same = naturalRead.index === forcedRead.index;
    console.log(`  Natural-vs-forced table index match: ${same ? 'yes' : 'no'}.`);
  }
}

async function main() {
  const { romBytes, blocks } = await loadRomAndBlocks();

  console.log('=== Phase 382 Scan-Code Index Probe ===');
  console.log(`ROM: ${ROM_PATH}`);
  console.log(`Transpiled blocks: ${count(Object.keys(blocks).length)}`);
  console.log(`Table base: ${hex(TABLE_BASE)}`);

  printStaticSections(romBytes);

  const bootState = runBootPhases(blocks, romBytes);
  printBootSummary(bootState);

  const naturalRun = runTraceScenario(blocks, bootState, 'natural matrix ENTER', ({ peripherals }) => {
    if (typeof peripherals.setMatrixKey === 'function') {
      peripherals.setMatrixKey(ENTER_GROUP, ENTER_BIT, true);
    } else if (peripherals.keyboard?.keyMatrix) {
      peripherals.keyboard.keyMatrix[ENTER_GROUP] &= ~(1 << ENTER_BIT);
    } else {
      throw new Error('Peripheral bus did not expose keyboard matrix injection');
    }
  });

  const forcedRun = runTraceScenario(blocks, bootState, 'forced setKeyPressed ENTER (0x29)', ({ cpu, peripherals }) => {
    peripherals.setKeyPressed(cpu.memory, ENTER_OS_SCAN);
  });

  printRunSummary(naturalRun);
  printRunSummary(forcedRun);
  printFinalSummary(naturalRun, forcedRun);
}

await main();
