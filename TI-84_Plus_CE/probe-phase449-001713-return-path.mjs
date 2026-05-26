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
const REPORT_PATH = path.join(__dirname, 'phase449-001713-return-path-report.md');

const MODE = 'adl';
const MEM_SIZE = 0x1000000;
const FLAG_Z = 0x40;

const BOOT_ENTRY = 0x000000;
const KERNEL_INIT_ENTRY = 0x08C331;
const POST_INIT_ENTRY = 0x0802B2;
const STAGE_ENTRIES = [0x0A2B72, 0x0A3301, 0x0A29EC, 0x0A2854];
const EVENT_LOOP_ENTRY = 0x003A73;

const STACK_RESET_TOP = 0xD1A87E;
const BOOT_RESET_SP = STACK_RESET_TOP - 3;
const EVENT_RESET_SP = STACK_RESET_TOP - 12;

const BOOT_OPTS = { maxSteps: 20000, maxLoopIterations: 32 };
const KERNEL_OPTS = { maxSteps: 100000, maxLoopIterations: 10000 };
const POST_INIT_OPTS = { maxSteps: 100, maxLoopIterations: 32 };
const STAGE_OPTS = { maxSteps: 50000, maxLoopIterations: 500 };
const TRACE_OPTS = { maxSteps: 50000, maxLoopIterations: 50000, diHaltBypass: true };

const KEY_STATUS_ADDR = 0xD00080;
const KEY_AVAILABLE_MASK = 0x08;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const KEY_PROCESS_ENABLE_ADDR = 0xD14091;
const DISPLAY_MODE_ADDR = 0xD177B7;

const TRACE_ENTRY = 0x001713;
const DISPATCH_TARGET = 0x0008BB;
const OPTIONAL_TARGET = 0x0067F8;
const HALT_PATH = 0x001933;
const CONTINUE_PATH = 0x003A89;

const KEY_CASES = [
  { label: "'1'", scan: 0x41 },
  { label: "'+'", scan: 0x11 },
];

const STATIC_SECTIONS = [
  { title: '0x001713-0x001800', start: 0x001713, endInclusive: 0x001800 },
  { title: '0x003A73-0x003A90', start: 0x003A73, endInclusive: 0x003A90 },
  { title: '0x003A89-0x003AA0', start: 0x003A89, endInclusive: 0x003AA0 },
  { title: '0x003A73-0x003AA0', start: 0x003A73, endInclusive: 0x003AA0 },
  { title: '0x0067F8-0x006817', start: 0x0067F8, endInclusive: 0x006817 },
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
  'pc',
  'stepCount',
];

class StopTrace extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'StopTrace';
    this.reason = reason;
  }
}

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
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

function snapshotLcdMmio(executor) {
  if (!executor?.lcdMmio) {
    return null;
  }
  return {
    upbase: executor.lcdMmio.upbase,
    control: executor.lcdMmio.control,
  };
}

function restoreLcdMmio(executor, snapshot) {
  if (!snapshot || !executor?.lcdMmio) {
    return;
  }
  executor.lcdMmio.upbase = snapshot.upbase;
  executor.lcdMmio.control = snapshot.control;
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
    bc: cpu._bc & 0xFFFFFF,
    de: cpu._de & 0xFFFFFF,
    hl: cpu._hl & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    ix: cpu._ix & 0xFFFFFF,
    iy: cpu._iy & 0xFFFFFF,
  };
}

function formatRegisters(registers) {
  return [
    `A=${hexByte(registers.a)}`,
    `F=${hexByte(registers.f)}`,
    `BC=${hex(registers.bc)}`,
    `DE=${hex(registers.de)}`,
    `HL=${hex(registers.hl)}`,
    `SP=${hex(registers.sp)}`,
    `IX=${hex(registers.ix)}`,
    `IY=${hex(registers.iy)}`,
  ].join(' ');
}

function createRuntime(blocks, romBytes) {
  const mem = createMemoryImage(romBytes);
  const peripherals = createPeripheralBus({ pllDelay: 2, timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  return { mem, peripherals, executor, cpu: executor.cpu };
}

function captureRuntimeSnapshot(runtime, resumePc = EVENT_LOOP_ENTRY, resumeMode = MODE) {
  return {
    memSnapshot: Buffer.from(runtime.mem),
    cpuSnapshot: snapshotCpu(runtime.cpu),
    lcdSnapshot: snapshotLcdMmio(runtime.executor),
    resumePc,
    resumeMode,
  };
}

function restoreRuntimeSnapshot(runtime, snapshot) {
  runtime.mem.set(snapshot.memSnapshot);
  restoreCpu(runtime.cpu, snapshot.cpuSnapshot);
  restoreLcdMmio(runtime.executor, snapshot.lcdSnapshot);
  return {
    startPc: snapshot.resumePc,
    startMode: snapshot.resumeMode,
  };
}

function bootToHomeScreen(runtime) {
  const { executor, cpu, mem } = runtime;
  const phaseResults = [];

  phaseResults.push({ label: 'boot', result: executor.runFrom(BOOT_ENTRY, 'z80', BOOT_OPTS) });

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = BOOT_RESET_SP;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  phaseResults.push({ label: 'kernel', result: executor.runFrom(KERNEL_INIT_ENTRY, MODE, KERNEL_OPTS) });

  cpu.mbase = 0xD0;
  cpu._iy = KEY_STATUS_ADDR;
  cpu._hl = 0;
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = BOOT_RESET_SP;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);

  phaseResults.push({ label: 'postInit', result: executor.runFrom(POST_INIT_ENTRY, MODE, POST_INIT_OPTS) });

  for (let index = 0; index < STAGE_ENTRIES.length; index += 1) {
    const entry = STAGE_ENTRIES[index];
    cpu.halted = false;
    cpu.iff1 = 0;
    cpu.iff2 = 0;
    cpu._iy = KEY_STATUS_ADDR;
    cpu.f = 0x40;
    cpu._ix = 0xD1A860;
    cpu.sp = EVENT_RESET_SP;
    mem.fill(0xFF, cpu.sp, cpu.sp + 12);
    phaseResults.push({ label: `stage${index + 1}`, result: executor.runFrom(entry, MODE, STAGE_OPTS) });
  }

  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu._iy = KEY_STATUS_ADDR;
  cpu.sp = EVENT_RESET_SP;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);

  return {
    phaseResults,
    resumePc: EVENT_LOOP_ENTRY,
    resumeMode: MODE,
  };
}

function seedHomeState(mem) {
  mem[KEY_PROCESS_ENABLE_ADDR] = 0x01;
  mem[DISPLAY_MODE_ADDR] = 0x55;
}

function clearKeyInjection(mem) {
  mem[KEY_SCAN_CODE_ADDR] = 0x00;
  mem[KEY_STATUS_ADDR] &= ~KEY_AVAILABLE_MASK;
}

function injectScanCode(mem, scanCode) {
  mem[KEY_SCAN_CODE_ADDR] = scanCode & 0xFF;
  mem[KEY_STATUS_ADDR] |= KEY_AVAILABLE_MASK;
}

function read24(memory, addr) {
  const base = addr & 0xFFFFFF;
  return (memory[base] | (memory[base + 1] << 8) | (memory[base + 2] << 16)) & 0xFFFFFF;
}

function isInterestingPc(pc) {
  return pc === DISPATCH_TARGET
    || pc === TRACE_ENTRY
    || pc === OPTIONAL_TARGET
    || (pc >= 0x001700 && pc <= 0x001950)
    || (pc >= 0x003A73 && pc <= 0x003AA0);
}

function simplifyRunResult(result) {
  if (!result) {
    return null;
  }
  return {
    steps: result.steps,
    termination: result.termination,
    lastPc: result.lastPc,
    lastMode: result.lastMode,
    halted: result.halted,
    loopsForced: result.loopsForced,
  };
}

function traceTerminationLabel(trace) {
  if (trace.stopReason) {
    return `stopped:${trace.stopReason}`;
  }
  return trace.runResult?.termination ?? 'unknown';
}

function branchLabel(pc) {
  if (pc === HALT_PATH) return `${hex(HALT_PATH)} (HALT/sleep path)`;
  if (pc === CONTINUE_PATH) return `${hex(CONTINUE_PATH)} (continue path)`;
  return hex(pc);
}

function zFlagLabel(f) {
  return (f & FLAG_Z) ? 'set' : 'clear';
}

function formatTraceRow(row) {
  const note = row.decodeError ? ` [decode error: ${row.decodeError}]` : '';
  return `${String(row.step + 1).padStart(6)}  ${hex(row.pc)}  ${row.bytes.padEnd(20)} ${row.text.padEnd(28)} ${formatRegisters(row.registers)}${note}`;
}

function traceKeyReturnPath(runtime, keyCase, startPc, startMode, romBytes) {
  const { executor, cpu, mem } = runtime;
  seedHomeState(mem);
  clearKeyInjection(mem);
  injectScanCode(mem, keyCase.scan);

  const trace = {
    key: keyCase.label,
    scan: keyCase.scan,
    startPc,
    startMode,
    entry001713: null,
    entry0008BB: null,
    entry0067F8: null,
    returnSite: null,
    branchTaken: null,
    reenteredEventLoop: null,
    sequence: [],
    runResult: null,
    stopReason: null,
    resumeSnapshot: null,
    postState: null,
  };

  try {
    const result = executor.runFrom(startPc, startMode, {
      ...TRACE_OPTS,
      onBlock(pc, mode, _meta, step) {
        const normalizedPc = pc & 0xFFFFFF;
        const registers = captureRegisters(cpu);

        if (trace.sequence.length < 96 && isInterestingPc(normalizedPc)) {
          const inst = safeDecode(romBytes, normalizedPc, mode);
          trace.sequence.push({
            step,
            pc: normalizedPc,
            mode,
            bytes: bytesToHex(romBytes, normalizedPc, Math.max(inst.length ?? 1, 1)),
            text: formatInstruction(inst),
            decodeError: inst.decodeError ?? null,
            registers,
          });
        }

        if (!trace.entry001713 && normalizedPc === TRACE_ENTRY) {
          trace.entry001713 = {
            step,
            pc: normalizedPc,
            returnAddress: read24(mem, cpu.sp),
            registers,
          };
        }

        if (!trace.entry0008BB && normalizedPc === DISPATCH_TARGET) {
          trace.entry0008BB = { step, pc: normalizedPc, registers };
        }

        if (!trace.entry0067F8 && normalizedPc === OPTIONAL_TARGET) {
          trace.entry0067F8 = { step, pc: normalizedPc, registers };
        }

        if (trace.entry001713 && !trace.returnSite && normalizedPc === trace.entry001713.returnAddress) {
          trace.returnSite = {
            step,
            pc: normalizedPc,
            z: (cpu.f & FLAG_Z) !== 0,
            registers,
          };
        }

        if (trace.returnSite && !trace.branchTaken && (normalizedPc === HALT_PATH || normalizedPc === CONTINUE_PATH)) {
          trace.branchTaken = {
            step,
            pc: normalizedPc,
            registers,
          };
        }

        if (trace.branchTaken && !trace.reenteredEventLoop && normalizedPc === EVENT_LOOP_ENTRY && step > trace.branchTaken.step) {
          trace.reenteredEventLoop = {
            step,
            pc: normalizedPc,
            registers,
          };
          throw new StopTrace('event-loop-reentry');
        }
      },
    });
    trace.runResult = simplifyRunResult(result);
  } catch (error) {
    if (error instanceof StopTrace) {
      trace.stopReason = error.reason;
      trace.resumeSnapshot = captureRuntimeSnapshot(runtime, EVENT_LOOP_ENTRY, MODE);
    } else {
      throw error;
    }
  }

  trace.postState = {
    keyStatus: mem[KEY_STATUS_ADDR],
    scanCode: mem[KEY_SCAN_CODE_ADDR],
    d14091: mem[KEY_PROCESS_ENABLE_ADDR],
    d177b7: mem[DISPLAY_MODE_ADDR],
  };

  return trace;
}

function formatDisassemblyRows(rows) {
  return rows.map((row) => {
    const note = row.decodeError ? ` [decode error: ${row.decodeError}]` : '';
    return `${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}${note}`;
  }).join('\n');
}

function formatTraceSequence(trace) {
  if (trace.sequence.length === 0) {
    return 'no interesting blocks were recorded';
  }
  return trace.sequence.map(formatTraceRow).join('\n');
}

function comparePattern(traceA, traceB) {
  if (!traceA.returnSite || !traceB.returnSite || !traceA.branchTaken || !traceB.branchTaken) {
    return 'insufficient data';
  }

  const sameReturn = traceA.entry001713?.returnAddress === traceB.entry001713?.returnAddress;
  const sameZ = traceA.returnSite.z === traceB.returnSite.z;
  const sameBranch = traceA.branchTaken.pc === traceB.branchTaken.pc;

  if (sameReturn && sameZ && sameBranch) {
    return 'yes';
  }
  return 'no';
}

function describeTrace(trace, continuePathRows) {
  const lines = [];
  lines.push(`- Injected scan code: ${hexByte(trace.scan)} for key ${trace.key}`);
  lines.push(`- Start PC/mode: ${hex(trace.startPc)} / ${trace.startMode}`);
  lines.push(`- Termination: ${traceTerminationLabel(trace)}${trace.runResult ? ` after ${trace.runResult.steps} steps` : ''}`);

  if (trace.entry001713) {
    lines.push(`- 0x001713 entry: step ${trace.entry001713.step + 1}, return address on stack = ${hex(trace.entry001713.returnAddress)}, ${formatRegisters(trace.entry001713.registers)}`);
  } else {
    lines.push('- 0x001713 entry: not observed');
  }

  if (trace.entry0008BB) {
    lines.push(`- 0x0008BB reached: yes at step ${trace.entry0008BB.step + 1}, ${formatRegisters(trace.entry0008BB.registers)}`);
  } else {
    lines.push('- 0x0008BB reached: not observed');
  }

  if (trace.entry0067F8) {
    lines.push(`- 0x0067F8 reached: yes at step ${trace.entry0067F8.step + 1}, ${formatRegisters(trace.entry0067F8.registers)}`);
  } else {
    lines.push('- 0x0067F8 reached: no');
  }

  if (trace.returnSite) {
    lines.push(`- Return site after 0x001713: ${hex(trace.returnSite.pc)} with Z ${trace.returnSite.z ? 'set' : 'clear'} (F=${hexByte(trace.returnSite.registers.f)})`);
  } else if (trace.entry001713) {
    lines.push(`- Return site after 0x001713: expected ${hex(trace.entry001713.returnAddress)} from the stack, but no matching block entry was observed`);
  } else {
    lines.push('- Return site after 0x001713: not observed');
  }

  if (trace.branchTaken) {
    lines.push(`- Branch taken after return: ${branchLabel(trace.branchTaken.pc)} at step ${trace.branchTaken.step + 1}`);
  } else {
    lines.push('- Branch taken after return: not observed');
  }

  if (trace.reenteredEventLoop) {
    lines.push(`- Event loop re-entry: yes, ${hex(EVENT_LOOP_ENTRY)} was reached again at step ${trace.reenteredEventLoop.step + 1}`);
  } else {
    lines.push('- Event loop re-entry: not observed during this trace window');
  }

  if (continuePathRows.length > 0) {
    lines.push(`- 0x003A89 head: ${continuePathRows[0].text}`);
  }

  lines.push(`- Post-run RAM: D00080=${hexByte(trace.postState.keyStatus)} D00587=${hexByte(trace.postState.scanCode)} D14091=${hexByte(trace.postState.d14091)} D177B7=${hexByte(trace.postState.d177b7)}`);

  return lines.join('\n');
}

function buildAnalysis(traceOne, traceTwo, continuePathRows, dispatchRows) {
  const lines = [];
  const pattern = comparePattern(traceOne, traceTwo);
  const continueHead = continuePathRows[0]?.text ?? 'n/a';
  const dispatchLine = dispatchRows.find((row) => row.pc === EVENT_LOOP_ENTRY)?.text ?? 'n/a';

  if (traceOne.returnSite) {
    lines.push(`- For key ${traceOne.key}, 0x001713 returned with Z ${traceOne.returnSite.z ? 'set' : 'clear'} (F=${hexByte(traceOne.returnSite.registers.f)}).`);
  } else {
    lines.push(`- For key ${traceOne.key}, the probe reached 0x001713 but did not capture a matching post-return block entry.`);
  }

  if (traceOne.branchTaken?.pc === HALT_PATH) {
    lines.push(`- The event loop took ${hex(HALT_PATH)} after the return, which matches the HALT/sleep side of the dispatch. When the trace observed ${hex(EVENT_LOOP_ENTRY)} again, re-entry was via the executor's DI-HALT bypass back to the event loop.`);
  } else if (traceOne.branchTaken?.pc === CONTINUE_PATH) {
    lines.push(`- The event loop took the continue path at ${hex(CONTINUE_PATH)}. The first instruction there is \`${continueHead}\`, so the loop continues through the normal post-dispatch path instead of sleeping immediately.`);
  } else {
    lines.push(`- The branch immediately after 0x001713 was not resolved inside this trace window. The dispatch block still starts at ${hex(EVENT_LOOP_ENTRY)} with \`${dispatchLine}\`.`);
  }

  lines.push(`- For the second key (${traceTwo.key}), the return/branch pattern repeated: ${pattern}.`);

  if (traceTwo.resumeSnapshot) {
    lines.push(`- The second trace was launched from the first observed re-entry to ${hex(EVENT_LOOP_ENTRY)}, so it re-used the post-first-key home-screen state.`);
  } else {
    lines.push(`- The second trace fell back to the post-boot baseline because the first trace did not expose a clean event-loop re-entry checkpoint within the capture window.`);
  }

  if (traceOne.entry0067F8 || traceTwo.entry0067F8) {
    lines.push(`- 0x0067F8 is on the observed hot path for at least one key. Its first 32 bytes are included below so the caller can inspect its role directly.`);
  } else {
    lines.push(`- 0x0067F8 was not entered during either trace, so its role here is inferred only from the static disassembly below.`);
  }

  return lines.join('\n');
}

function buildReport(bootSummary, staticResults, traceOne, traceTwo) {
  const continuePathRows = staticResults['0x003A89-0x003AA0'] ?? [];
  const dispatchRows = staticResults['0x003A73-0x003A90'] ?? [];
  const lines = [];

  lines.push('# Phase 449: 0x001713 -> 0x0008BB Return Path');
  lines.push('');
  lines.push('## Boot Summary');
  for (const phase of bootSummary.phaseResults) {
    lines.push(`- ${phase.label}: steps=${phase.result.steps} termination=${phase.result.termination} lastPc=${hex(phase.result.lastPc)}`);
  }
  lines.push('');
  lines.push('## Static Disassembly');
  for (const section of STATIC_SECTIONS) {
    lines.push(`### ${section.title}`);
    lines.push('');
    lines.push('```text');
    lines.push(formatDisassemblyRows(staticResults[section.title]));
    lines.push('```');
    lines.push('');
  }

  lines.push('## Dynamic Trace: key 1');
  lines.push(describeTrace(traceOne, continuePathRows));
  lines.push('');
  lines.push('```text');
  lines.push(formatTraceSequence(traceOne));
  lines.push('```');
  lines.push('');

  lines.push('## Dynamic Trace: key +');
  lines.push(describeTrace(traceTwo, continuePathRows));
  lines.push('');
  lines.push('```text');
  lines.push(formatTraceSequence(traceTwo));
  lines.push('```');
  lines.push('');

  lines.push('## Analysis');
  lines.push(buildAnalysis(traceOne, traceTwo, continuePathRows, dispatchRows));
  lines.push('');

  return `${lines.join('\n')}\n`;
}

async function main() {
  const romBytes = fs.readFileSync(ROM_PATH);
  const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
  const blocks = normalizeBlocks(romModule.PRELIFTED_BLOCKS);

  const staticResults = Object.fromEntries(
    STATIC_SECTIONS.map((section) => [
      section.title,
      disassembleRange(romBytes, section.start, section.endInclusive, MODE),
    ]),
  );

  const runtime = createRuntime(blocks, romBytes);
  const bootSummary = bootToHomeScreen(runtime);
  seedHomeState(runtime.mem);
  const baselineSnapshot = captureRuntimeSnapshot(runtime, bootSummary.resumePc, bootSummary.resumeMode);

  const firstRestore = restoreRuntimeSnapshot(runtime, baselineSnapshot);
  const traceOne = traceKeyReturnPath(runtime, KEY_CASES[0], firstRestore.startPc, firstRestore.startMode, romBytes);

  let secondStartPc = bootSummary.resumePc;
  let secondStartMode = bootSummary.resumeMode;
  if (traceOne.resumeSnapshot) {
    const restored = restoreRuntimeSnapshot(runtime, traceOne.resumeSnapshot);
    secondStartPc = restored.startPc;
    secondStartMode = restored.startMode;
  } else {
    const restored = restoreRuntimeSnapshot(runtime, baselineSnapshot);
    secondStartPc = restored.startPc;
    secondStartMode = restored.startMode;
  }

  const traceTwo = traceKeyReturnPath(runtime, KEY_CASES[1], secondStartPc, secondStartMode, romBytes);

  const report = buildReport(bootSummary, staticResults, traceOne, traceTwo);
  fs.writeFileSync(REPORT_PATH, report);
  console.log(`wrote ${REPORT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
