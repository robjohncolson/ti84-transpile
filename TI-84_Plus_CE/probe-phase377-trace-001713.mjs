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
const EVENT_OPTS = { maxSteps: 1000000, maxLoopIterations: 500000 };

const KEY_STATUS_ADDR = 0xD00080;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_AVAILABLE_MASK = 0x08;
const INJECTED_SCAN_CODE = 0x09;

const FLASH_SEED_ADDR = 0x020100;
const FLASH_SEED_BYTES = [0x5A, 0xA5, 0x00];
const SYSFLAG_ADDR = 0xD177BA;
const SYSFLAG_CLEAR_VALUE = 0x00;

const PASS_GPIO_VALUE = 0xEE;
const CONTROL_GPIO_VALUE = 0xEF;

const DISPATCH_ENTRY = 0x003A7D;
const GATE_ENTRY = 0x001713;
const GPIO_CHECK_ENTRY = 0x0067F8;
const ERROR_PATH_ENTRY = 0x001933;
const ERROR_HALT_ENTRY = 0x001937;
const FALLTHROUGH_ENTRY = 0x003A85;
const NORMAL_DISPATCH_ENTRY = 0x003A89;
const NORMAL_HANDLER_ENTRY = 0x001853;
const POST_HANDLER_ENTRY = 0x000721;

const TRACE_BLOCK_LIMIT = 200;

const STATIC_DISASM_REGIONS = [
  {
    start: 0x001713,
    endInclusive: 0x001730,
    label: 'STATIC DISASSEMBLY 0x001713-0x001730',
  },
  {
    start: 0x001853,
    endInclusive: 0x001870,
    label: 'STATIC DISASSEMBLY 0x001853-0x001870',
  },
];

const CHECKPOINTS = [
  [DISPATCH_ENTRY, '0x003A7D dispatch entry'],
  [GATE_ENTRY, '0x001713 gate caller'],
  [GPIO_CHECK_ENTRY, '0x0067F8 gpio check'],
  [ERROR_PATH_ENTRY, '0x001933 error path'],
  [FALLTHROUGH_ENTRY, '0x003A85 fallthrough'],
  [NORMAL_DISPATCH_ENTRY, '0x003A89 normal dispatch'],
  [NORMAL_HANDLER_ENTRY, '0x001853 normal key handler'],
  [POST_HANDLER_ENTRY, '0x000721 post-handler jump'],
  [ERROR_HALT_ENTRY, '0x001937 halt'],
];

const CHECKPOINT_LABELS = new Map(CHECKPOINTS);
const REPORT_ORDER = CHECKPOINTS.map(([addr]) => addr);
const DISPATCH_KEY = makeKey(DISPATCH_ENTRY, MODE);

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

function yesNo(value) {
  return value ? 'yes' : 'no';
}

function bytesToHex(buffer, start, length) {
  const addr = (Number(start) || 0) & 0xFFFFFF;
  const end = Math.min(buffer.length, addr + Math.max(length, 0));
  return Array.from(
    buffer.subarray(addr, end),
    (byte) => (byte & 0xFF).toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function formatSigned(value) {
  const normalized = Number(value ?? 0);
  const abs = Math.abs(normalized);
  return `${normalized >= 0 ? '+' : '-'}0x${abs.toString(16).toUpperCase()}`;
}

function formatIndexedOperand(indexRegister, displacement) {
  return `(${indexRegister}${formatSigned(displacement)})`;
}

function withPrefix(inst, text) {
  return inst?.modePrefix ? `${inst.modePrefix} ${text}` : text;
}

function fallbackOperands(inst) {
  const ignored = new Set([
    'pc',
    'length',
    'nextPc',
    'mode',
    'modePrefix',
    'terminates',
    'fallthrough',
    'decodeError',
    'tag',
  ]);

  return Object.entries(inst ?? {})
    .filter(([key, value]) => !ignored.has(key) && value !== undefined && value !== null)
    .map(([key, value]) => {
      if (typeof value === 'number') {
        if (key === 'bit') return `${key}=${value}`;
        if (key === 'displacement') return `${key}=${formatSigned(value)}`;
        return `${key}=${hex(value, value > 0xFF ? 6 : 2)}`;
      }
      return `${key}=${String(value)}`;
    })
    .join(' ');
}

function renderInstruction(inst) {
  switch (inst?.tag) {
    case 'db': return { mnemonic: 'db', operands: hexByte(inst.value) };
    case 'nop':
    case 'halt':
    case 'slp':
    case 'di':
    case 'ei':
    case 'ret':
    case 'reti':
    case 'retn':
    case 'rlca':
    case 'rrca':
    case 'rla':
    case 'rra':
    case 'daa':
    case 'cpl':
    case 'scf':
    case 'ccf':
    case 'neg':
    case 'rrd':
    case 'rld':
    case 'ldi':
    case 'ldd':
    case 'ldir':
    case 'lddr':
    case 'cpi':
    case 'cpd':
    case 'cpir':
    case 'cpdr':
    case 'ini':
    case 'ind':
    case 'inir':
    case 'indr':
    case 'outi':
    case 'outd':
    case 'otir':
    case 'otdr':
    case 'otimr':
    case 'stmix':
    case 'rsmix':
    case 'exx':
      return { mnemonic: inst.tag, operands: '' };

    case 'ret-conditional': return { mnemonic: 'ret', operands: inst.condition };
    case 'jr': return { mnemonic: 'jr', operands: hex(inst.target) };
    case 'jr-conditional': return { mnemonic: 'jr', operands: `${inst.condition}, ${hex(inst.target)}` };
    case 'djnz': return { mnemonic: 'djnz', operands: hex(inst.target) };
    case 'jp': return { mnemonic: 'jp', operands: hex(inst.target) };
    case 'jp-conditional': return { mnemonic: 'jp', operands: `${inst.condition}, ${hex(inst.target)}` };
    case 'jp-indirect': return { mnemonic: 'jp', operands: `(${inst.indirectRegister})` };
    case 'call': return { mnemonic: 'call', operands: hex(inst.target) };
    case 'call-conditional': return { mnemonic: 'call', operands: `${inst.condition}, ${hex(inst.target)}` };
    case 'rst': return { mnemonic: 'rst', operands: hexByte(inst.target) };

    case 'push': return { mnemonic: 'push', operands: inst.pair };
    case 'pop': return { mnemonic: 'pop', operands: inst.pair };

    case 'ld-pair-imm': return { mnemonic: 'ld', operands: `${inst.pair}, ${hex(inst.value)}` };
    case 'ld-reg-imm': return { mnemonic: 'ld', operands: `${inst.dest}, ${hexByte(inst.value)}` };
    case 'ld-reg-reg': return { mnemonic: 'ld', operands: `${inst.dest}, ${inst.src}` };
    case 'ld-reg-ind': return { mnemonic: 'ld', operands: `${inst.dest}, (${inst.src})` };
    case 'ld-ind-reg': return { mnemonic: 'ld', operands: `(${inst.dest}), ${inst.src}` };
    case 'ld-ind-imm': return { mnemonic: 'ld', operands: `(hl), ${hexByte(inst.value)}` };
    case 'ld-reg-mem': return { mnemonic: 'ld', operands: `${inst.dest}, (${hex(inst.addr)})` };
    case 'ld-mem-reg': return { mnemonic: 'ld', operands: `(${hex(inst.addr)}), ${inst.src}` };
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return { mnemonic: 'ld', operands: `(${hex(inst.addr)}), ${inst.pair}` };
      }
      return { mnemonic: 'ld', operands: `${inst.pair}, (${hex(inst.addr)})` };
    case 'ld-mem-pair': return { mnemonic: 'ld', operands: `(${hex(inst.addr)}), ${inst.pair}` };
    case 'ld-pair-ind': return { mnemonic: 'ld', operands: `${inst.pair}, (${inst.src})` };
    case 'ld-ind-pair': return { mnemonic: 'ld', operands: `(${inst.dest}), ${inst.pair}` };
    case 'ld-sp-hl': return { mnemonic: 'ld', operands: 'sp, hl' };
    case 'ld-sp-pair': return { mnemonic: 'ld', operands: `sp, ${inst.pair}` };
    case 'ld-pair-indexed':
      return { mnemonic: 'ld', operands: `${inst.pair}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'ld-indexed-pair':
      return { mnemonic: 'ld', operands: `${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${inst.pair}` };
    case 'ld-reg-ixd':
      return { mnemonic: 'ld', operands: `${inst.dest}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'ld-ixd-reg':
      return { mnemonic: 'ld', operands: `${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${inst.src}` };
    case 'ld-ixd-imm':
      return { mnemonic: 'ld', operands: `${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${hexByte(inst.value)}` };
    case 'ld-ixiy-indexed':
      return { mnemonic: 'ld', operands: `${inst.dest}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'ld-indexed-ixiy':
      return { mnemonic: 'ld', operands: `${formatIndexedOperand(inst.indexRegister, inst.displacement)}, ${inst.src}` };
    case 'ld-special': return { mnemonic: 'ld', operands: `${inst.dest}, ${inst.src}` };
    case 'ld-mb-a': return { mnemonic: 'ld', operands: 'mb, a' };
    case 'ld-a-mb': return { mnemonic: 'ld', operands: 'a, mb' };

    case 'inc-pair': return { mnemonic: 'inc', operands: inst.pair };
    case 'dec-pair': return { mnemonic: 'dec', operands: inst.pair };
    case 'inc-reg': return { mnemonic: 'inc', operands: inst.reg };
    case 'dec-reg': return { mnemonic: 'dec', operands: inst.reg };
    case 'inc-ixd': return { mnemonic: 'inc', operands: formatIndexedOperand(inst.indexRegister, inst.displacement) };
    case 'dec-ixd': return { mnemonic: 'dec', operands: formatIndexedOperand(inst.indexRegister, inst.displacement) };

    case 'add-pair': return { mnemonic: 'add', operands: `${inst.dest}, ${inst.src}` };
    case 'adc-pair': return { mnemonic: 'adc', operands: `hl, ${inst.src}` };
    case 'sbc-pair': return { mnemonic: 'sbc', operands: `hl, ${inst.src}` };
    case 'alu-reg': return { mnemonic: inst.op, operands: inst.src };
    case 'alu-imm': return { mnemonic: inst.op, operands: hexByte(inst.value) };
    case 'alu-ixd': return { mnemonic: inst.op, operands: formatIndexedOperand(inst.indexRegister, inst.displacement) };

    case 'bit-test': return { mnemonic: 'bit', operands: `${inst.bit}, ${inst.reg}` };
    case 'bit-test-ind': return { mnemonic: 'bit', operands: `${inst.bit}, (${inst.indirectRegister})` };
    case 'bit-set': return { mnemonic: 'set', operands: `${inst.bit}, ${inst.reg}` };
    case 'bit-set-ind': return { mnemonic: 'set', operands: `${inst.bit}, (${inst.indirectRegister})` };
    case 'bit-res': return { mnemonic: 'res', operands: `${inst.bit}, ${inst.reg}` };
    case 'bit-res-ind': return { mnemonic: 'res', operands: `${inst.bit}, (${inst.indirectRegister})` };
    case 'indexed-cb-bit':
      return { mnemonic: 'bit', operands: `${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'indexed-cb-set':
      return { mnemonic: 'set', operands: `${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'indexed-cb-res':
      return { mnemonic: 'res', operands: `${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}` };
    case 'rotate-reg': return { mnemonic: inst.op, operands: inst.reg };
    case 'rotate-ind': return { mnemonic: inst.op, operands: `(${inst.indirectRegister})` };
    case 'indexed-cb-rotate':
      return {
        mnemonic: inst.operation ?? inst.op ?? 'rotate',
        operands: formatIndexedOperand(inst.indexRegister, inst.displacement),
      };

    case 'in-reg': return { mnemonic: 'in', operands: `${inst.reg}, (c)` };
    case 'out-reg': return { mnemonic: 'out', operands: `(c), ${inst.reg}` };
    case 'in-imm': return { mnemonic: 'in', operands: `a, (${hexByte(inst.port)})` };
    case 'out-imm': return { mnemonic: 'out', operands: `(${hexByte(inst.port)}), a` };
    case 'in0': return { mnemonic: 'in0', operands: `${inst.reg}, (${hexByte(inst.port)})` };
    case 'out0': return { mnemonic: 'out0', operands: `(${hexByte(inst.port)}), ${inst.reg}` };

    case 'ex-af': return { mnemonic: 'ex', operands: "af, af'" };
    case 'ex-de-hl': return { mnemonic: 'ex', operands: 'de, hl' };
    case 'ex-sp-hl': return { mnemonic: 'ex', operands: '(sp), hl' };
    case 'ex-sp-pair': return { mnemonic: 'ex', operands: `(sp), ${inst.pair}` };

    case 'im': return { mnemonic: 'im', operands: String(inst.value) };
    case 'mlt': return { mnemonic: 'mlt', operands: inst.reg };
    case 'tst-reg': return { mnemonic: 'tst', operands: `a, ${inst.reg}` };
    case 'tst-ind': return { mnemonic: 'tst', operands: 'a, (hl)' };
    case 'tst-imm': return { mnemonic: 'tst', operands: `a, ${hexByte(inst.value)}` };
    case 'tstio': return { mnemonic: 'tstio', operands: hexByte(inst.value) };
    case 'lea': return { mnemonic: 'lea', operands: `${inst.dest}, ${formatIndexedOperand(inst.base, inst.displacement)}` };
    case 'pea': return { mnemonic: 'pea', operands: `${inst.base}${formatSigned(inst.displacement)}` };

    default:
      return { mnemonic: inst?.tag ?? 'unknown', operands: fallbackOperands(inst) };
  }
}

function formatInstruction(inst) {
  const rendered = renderInstruction(inst);
  const text = rendered.operands ? `${rendered.mnemonic} ${rendered.operands}` : rendered.mnemonic;
  return withPrefix(inst, text);
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

function safeDecode(memory, pc, mode = MODE) {
  try {
    const decoded = decodeInstruction(memory, pc, mode);
    if (!decoded || !Number.isInteger(decoded.length) || decoded.length <= 0) {
      throw new Error('decoder returned invalid length');
    }
    return decoded;
  } catch (error) {
    return {
      tag: 'db',
      value: memory[pc] ?? 0,
      length: 1,
      decodeError: error instanceof Error ? error.message : String(error),
      mode,
    };
  }
}

function disassembleRange(memory, start, endInclusive, mode = MODE) {
  const rows = [];
  let pc = start;

  while (pc <= endInclusive && pc < memory.length) {
    const inst = safeDecode(memory, pc, mode);
    const length = Math.max(inst.length ?? 1, 1);
    rows.push({
      pc,
      bytes: bytesToHex(memory, pc, length),
      text: formatInstruction(inst),
      decodeError: inst.decodeError ?? null,
    });
    pc += length;
  }

  return rows;
}

function captureRegisters(cpu) {
  return {
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    hl: cpu._hl & 0xFFFFFF,
    bc: cpu._bc & 0xFFFFFF,
    de: cpu._de & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    ix: cpu._ix & 0xFFFFFF,
    iy: cpu._iy & 0xFFFFFF,
  };
}

function formatRegisters(registers) {
  return [
    `A=${hexByte(registers.a)}`,
    `F=${hexByte(registers.f)}`,
    `HL=${hex(registers.hl)}`,
    `BC=${hex(registers.bc)}`,
    `DE=${hex(registers.de)}`,
    `SP=${hex(registers.sp)}`,
    `IX=${hex(registers.ix)}`,
    `IY=${hex(registers.iy)}`,
  ].join(' ');
}

function createTrace() {
  return {
    dispatchReached: false,
    dispatchStep: null,
    uniqueBlocks: new Set(),
    postDispatchEntries: [],
    checkpointHits: [],
    firstHitByPc: new Map(),
  };
}

function buildBlockVisit(memory, pc, mode, step, dispatchStep, registers) {
  const inst = safeDecode(memory, pc, mode);
  const length = Math.max(inst.length ?? 1, 1);
  return {
    step,
    delta: dispatchStep === null ? null : step - dispatchStep,
    pc: pc & 0xFFFFFF,
    mode,
    bytes: bytesToHex(memory, pc, length),
    text: formatInstruction(inst),
    registers,
  };
}

function recordCheckpoint(trace, pc, mode, step, registers) {
  const label = CHECKPOINT_LABELS.get(pc);
  if (!label) {
    return;
  }

  const hit = {
    label,
    pc,
    mode,
    step,
    registers,
  };

  trace.checkpointHits.push(hit);
  if (!trace.firstHitByPc.has(pc)) {
    trace.firstHitByPc.set(pc, hit);
  }
}

function runBootPhases(blocks, romBytes, gpioValue) {
  const mem = createMemoryImage(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false, gpioValue });
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
    gpioValue,
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

function seedFlashSignature(mem) {
  for (let index = 0; index < FLASH_SEED_BYTES.length; index += 1) {
    mem[FLASH_SEED_ADDR + index] = FLASH_SEED_BYTES[index];
  }
}

function seedSystemFlag(mem) {
  mem[SYSFLAG_ADDR] = SYSFLAG_CLEAR_VALUE;
}

function seedKeyInput(mem) {
  mem[KEY_SCAN_CODE_ADDR] = INJECTED_SCAN_CODE;
  mem[KEY_STATUS_ADDR] |= KEY_AVAILABLE_MASK;
}

function runScenario(name, blocks, romBytes, gpioValue) {
  const bootState = runBootPhases(blocks, romBytes, gpioValue);
  const mem = Uint8Array.from(bootState.memSnapshot);
  const peripherals = createPeripheralBus({ timerInterrupt: false, gpioValue });
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;
  const trace = createTrace();

  prepareEventLoop(cpu, executor, mem, bootState);
  seedFlashSignature(mem);
  seedSystemFlag(mem);
  seedKeyInput(mem);

  const result = executor.runFrom(EVENT_LOOP_ENTRY, MODE, {
    ...EVENT_OPTS,
    onBlock(pc, mode, _meta, step) {
      const normalizedPc = pc & 0xFFFFFF;
      const blockKey = makeKey(normalizedPc, mode);
      const registers = captureRegisters(cpu);

      trace.uniqueBlocks.add(blockKey);

      if (blockKey === DISPATCH_KEY && !trace.dispatchReached) {
        trace.dispatchReached = true;
        trace.dispatchStep = step;
      }

      recordCheckpoint(trace, normalizedPc, mode, step, registers);

      if (!trace.dispatchReached) {
        return;
      }

      if (trace.postDispatchEntries.length < TRACE_BLOCK_LIMIT && step - trace.dispatchStep < TRACE_BLOCK_LIMIT) {
        trace.postDispatchEntries.push(
          buildBlockVisit(mem, normalizedPc, mode, step, trace.dispatchStep, registers),
        );
      }
    },
  });

  return {
    name,
    gpioValue,
    bootState,
    mem,
    result,
    trace,
  };
}

function getFirstHitsInOrder(trace) {
  return [...trace.firstHitByPc.values()].sort((left, right) => left.step - right.step || left.pc - right.pc);
}

function getNotReached(trace) {
  return REPORT_ORDER.filter((addr) => !trace.firstHitByPc.has(addr));
}

function formatSequence(trace) {
  const hits = getFirstHitsInOrder(trace);
  if (hits.length === 0) {
    return 'not reached';
  }
  return hits.map((hit) => hex(hit.pc)).join(' -> ');
}

function printDisassembly(title, rows) {
  console.log(`=== ${title} ===`);
  for (const row of rows) {
    const note = row.decodeError ? ` [decode error: ${row.decodeError}]` : '';
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}${note}`);
  }
  console.log('');
}

function printBootSummary(scenario) {
  console.log(`=== ${scenario.name.toUpperCase()} BOOT (${hexByte(scenario.gpioValue)}) ===`);
  for (const phase of scenario.bootState.phaseResults) {
    console.log(
      `${phase.label}: steps=${count(phase.result.steps)} `
      + `termination=${phase.result.termination} lastPc=${hex(phase.result.lastPc)}`,
    );
  }
  console.log('');
}

function printScenarioSummary(scenario) {
  console.log(`=== ${scenario.name.toUpperCase()} EVENT TRACE ===`);
  console.log(
    `gpio=${hexByte(scenario.gpioValue)} steps=${count(scenario.result.steps)} `
    + `termination=${scenario.result.termination} lastPc=${hex(scenario.result.lastPc)} `
    + `loopsForced=${count(scenario.result.loopsForced)}`,
  );
  console.log(
    `dispatch_reached=${yesNo(scenario.trace.dispatchReached)}`
    + (scenario.trace.dispatchStep === null ? '' : ` dispatch_step=${count(scenario.trace.dispatchStep + 1)}`),
  );
  console.log(
    `logged_post_dispatch_blocks=${count(scenario.trace.postDispatchEntries.length)} `
    + `unique_blocks=${count(scenario.trace.uniqueBlocks.size)}`,
  );
  console.log(
    `ram: ${hex(FLASH_SEED_ADDR)}=${FLASH_SEED_BYTES.map((byte) => hexByte(byte)).join(' ')} `
    + `${hex(SYSFLAG_ADDR)}=${hexByte(scenario.mem[SYSFLAG_ADDR])} `
    + `${hex(KEY_STATUS_ADDR)}=${hexByte(scenario.mem[KEY_STATUS_ADDR])} `
    + `${hex(KEY_SCAN_CODE_ADDR)}=${hexByte(scenario.mem[KEY_SCAN_CODE_ADDR])}`,
  );
  console.log(`checkpoint_sequence=${formatSequence(scenario.trace)}`);
  console.log('');
}

function printCheckpointReachability(scenario) {
  console.log(`=== ${scenario.name.toUpperCase()} CHECKPOINTS ===`);
  for (const addr of REPORT_ORDER) {
    const hit = scenario.trace.firstHitByPc.get(addr);
    console.log(
      `${hex(addr)} ${CHECKPOINT_LABELS.get(addr)}: `
      + `${hit ? `step=${count(hit.step + 1)} ${formatRegisters(hit.registers)}` : 'not reached'}`,
    );
  }
  console.log('');
}

function printCheckpointOrder(scenario) {
  const firstHits = getFirstHitsInOrder(scenario.trace);
  const notReached = getNotReached(scenario.trace);

  console.log(`=== ${scenario.name.toUpperCase()} FIRST-HIT ORDER ===`);
  if (firstHits.length === 0) {
    console.log('No checkpoints were reached.');
    console.log('');
    return;
  }

  for (let index = 0; index < firstHits.length; index += 1) {
    const hit = firstHits[index];
    console.log(
      `${String(index + 1).padStart(2, '0')}. `
      + `step=${count(hit.step + 1)} pc=${hex(hit.pc)} ${hit.label} `
      + `${formatRegisters(hit.registers)}`,
    );
  }

  if (notReached.length > 0) {
    console.log(`not_reached: ${notReached.map((addr) => hex(addr)).join(', ')}`);
  }
  console.log('');
}

function printBlockLog(scenario) {
  console.log(`=== ${scenario.name.toUpperCase()} FIRST ${TRACE_BLOCK_LIMIT} BLOCK VISITS AFTER ${hex(DISPATCH_ENTRY)} ===`);
  if (!scenario.trace.dispatchReached) {
    console.log('Dispatch entry was not reached.');
    console.log('');
    return;
  }

  if (scenario.trace.postDispatchEntries.length === 0) {
    console.log('No post-dispatch block visits were recorded.');
    console.log('');
    return;
  }

  for (let index = 0; index < scenario.trace.postDispatchEntries.length; index += 1) {
    const entry = scenario.trace.postDispatchEntries[index];
    console.log(
      `${String(index + 1).padStart(3, '0')}. `
      + `step=${count(entry.step + 1)} delta=${String(entry.delta).padStart(3)} `
      + `pc=${hex(entry.pc)} ${entry.bytes.padEnd(20)} ${entry.text} `
      + `| ${formatRegisters(entry.registers)}`,
    );
  }
  console.log('');
}

function printVerdict(passScenario, controlScenario) {
  const passReached = {
    gate: passScenario.trace.firstHitByPc.has(GATE_ENTRY),
    gpioCheck: passScenario.trace.firstHitByPc.has(GPIO_CHECK_ENTRY),
    fallthrough: passScenario.trace.firstHitByPc.has(FALLTHROUGH_ENTRY),
    normalDispatch: passScenario.trace.firstHitByPc.has(NORMAL_DISPATCH_ENTRY),
    normalHandler: passScenario.trace.firstHitByPc.has(NORMAL_HANDLER_ENTRY),
    postHandler: passScenario.trace.firstHitByPc.has(POST_HANDLER_ENTRY),
    errorPath: passScenario.trace.firstHitByPc.has(ERROR_PATH_ENTRY),
    errorHalt: passScenario.trace.firstHitByPc.has(ERROR_HALT_ENTRY),
  };

  const controlReached = {
    fallthrough: controlScenario.trace.firstHitByPc.has(FALLTHROUGH_ENTRY),
    normalHandler: controlScenario.trace.firstHitByPc.has(NORMAL_HANDLER_ENTRY),
    errorPath: controlScenario.trace.firstHitByPc.has(ERROR_PATH_ENTRY),
    errorHalt: controlScenario.trace.firstHitByPc.has(ERROR_HALT_ENTRY),
  };

  const passSuccess = passReached.gate
    && passReached.gpioCheck
    && passReached.fallthrough
    && passReached.normalDispatch
    && passReached.normalHandler
    && passReached.postHandler
    && !passReached.errorPath
    && !passReached.errorHalt;

  const controlSuccess = controlReached.errorPath
    && controlReached.errorHalt
    && !controlReached.fallthrough
    && !controlReached.normalHandler;

  console.log('=== VERDICT ===');
  console.log(
    `GPIO=${hexByte(passScenario.gpioValue)} success_path: `
    + `${hex(GATE_ENTRY)}=${yesNo(passReached.gate)} `
    + `${hex(GPIO_CHECK_ENTRY)}=${yesNo(passReached.gpioCheck)} `
    + `${hex(FALLTHROUGH_ENTRY)}=${yesNo(passReached.fallthrough)} `
    + `${hex(NORMAL_DISPATCH_ENTRY)}=${yesNo(passReached.normalDispatch)} `
    + `${hex(NORMAL_HANDLER_ENTRY)}=${yesNo(passReached.normalHandler)} `
    + `${hex(POST_HANDLER_ENTRY)}=${yesNo(passReached.postHandler)} `
    + `${hex(ERROR_PATH_ENTRY)}=${yesNo(passReached.errorPath)} `
    + `${hex(ERROR_HALT_ENTRY)}=${yesNo(passReached.errorHalt)}`,
  );
  console.log(
    `GPIO=${hexByte(controlScenario.gpioValue)} control_path: `
    + `${hex(ERROR_PATH_ENTRY)}=${yesNo(controlReached.errorPath)} `
    + `${hex(ERROR_HALT_ENTRY)}=${yesNo(controlReached.errorHalt)} `
    + `${hex(FALLTHROUGH_ENTRY)}=${yesNo(controlReached.fallthrough)} `
    + `${hex(NORMAL_HANDLER_ENTRY)}=${yesNo(controlReached.normalHandler)}`,
  );
  console.log('');
  console.log(`GPIO=${hexByte(passScenario.gpioValue)} observed path: ${formatSequence(passScenario.trace)}`);
  console.log(`GPIO=${hexByte(controlScenario.gpioValue)} observed path: ${formatSequence(controlScenario.trace)}`);
  console.log('');
  console.log(`GPIO=${hexByte(passScenario.gpioValue)} expected fallthrough to ${hex(FALLTHROUGH_ENTRY)} -> ${hex(NORMAL_HANDLER_ENTRY)}: ${yesNo(passSuccess)}`);
  console.log(`GPIO=${hexByte(controlScenario.gpioValue)} expected halt via ${hex(ERROR_PATH_ENTRY)} -> ${hex(ERROR_HALT_ENTRY)}: ${yesNo(controlSuccess)}`);
  console.log('');
}

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

console.log('=== PROBE: PHASE 377 TRACE 0x001713 ===');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Transpiled: ${TRANSPILED_PATH}`);
console.log(`event_loop_entry=${hex(EVENT_LOOP_ENTRY)} maxSteps=${count(EVENT_OPTS.maxSteps)} maxLoopIterations=${count(EVENT_OPTS.maxLoopIterations)}`);
console.log(`key_injection: ${hex(KEY_SCAN_CODE_ADDR)}=${hexByte(INJECTED_SCAN_CODE)} ${hex(KEY_STATUS_ADDR)}|=${hexByte(KEY_AVAILABLE_MASK)}`);
console.log(`flash_seed: ${hex(FLASH_SEED_ADDR)}=${FLASH_SEED_BYTES.map((byte) => hexByte(byte)).join(' ')}`);
console.log(`sysflag_seed: ${hex(SYSFLAG_ADDR)}=${hexByte(SYSFLAG_CLEAR_VALUE)}`);
console.log(`gpio scenarios: pass=${hexByte(PASS_GPIO_VALUE)} control=${hexByte(CONTROL_GPIO_VALUE)}`);
console.log('');

for (const region of STATIC_DISASM_REGIONS) {
  printDisassembly(region.label, disassembleRange(romBytes, region.start, region.endInclusive));
}

const passScenario = runScenario('gpio pass', blocks, romBytes, PASS_GPIO_VALUE);
const controlScenario = runScenario('gpio control', blocks, romBytes, CONTROL_GPIO_VALUE);

printBootSummary(passScenario);
printScenarioSummary(passScenario);
printCheckpointReachability(passScenario);
printCheckpointOrder(passScenario);
printBlockLog(passScenario);

printBootSummary(controlScenario);
printScenarioSummary(controlScenario);
printCheckpointReachability(controlScenario);
printCheckpointOrder(controlScenario);
printBlockLog(controlScenario);

printVerdict(passScenario, controlScenario);
