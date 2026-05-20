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
const TRACE_OPTS = { maxSteps: 10000, maxLoopIterations: 500000 };

const FLASH_SEED_ADDR = 0x020100;
const FLASH_SEED_BYTES = [0x5A, 0xA5, 0x00];
const SYSFLAG_ADDR = 0xD177BA;
const KEY_STATUS_ADDR = 0xD00080;
const KEY_STATUS_MASK = 0x08;
const KEY_SCAN_CODE_ADDR = 0xD00587;
const ENTER_SCAN_CODE = 0x09;

const DISPATCH_ENTRY = 0x0067F8;
const DISPATCH_REGION_LEN = 0x58;
const TABLE_SCAN_ENTRY = 0x001C4F;
const TABLE_SCAN_REGION_LEN = 0x96;
const TOKEN_PARSE_ENTRY = 0x001CA6;
const TOKEN_PARSE_REGION_LEN = 0x2A;

const SCAN_WALK_ENTRY = 0x001C33;
const SCAN_WALK_REGION_LEN = TABLE_SCAN_ENTRY - SCAN_WALK_ENTRY;
const CALLER_ENTRY = 0x00171E;
const CALLER_REGION_LEN = 0x0C;

const TRACE_RANGES = [
  { start: 0x006700, endExclusive: 0x006900, label: '0x006700-0x0068FF' },
  { start: 0x001C00, endExclusive: 0x001D00, label: '0x001C00-0x001CFF' },
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

function disassembleRegion(memory, startAddr, length, mode = MODE) {
  const rows = [];
  const endExclusive = startAddr + length;
  let pc = startAddr;

  while (pc < endExclusive && pc < memory.length) {
    const inst = safeDecode(memory, pc, mode);
    const size = Math.max(inst.length ?? 1, 1);
    rows.push({
      pc,
      bytes: bytesToHex(memory, pc, size),
      text: formatInstruction(inst),
      decodeError: inst.decodeError ?? null,
      inst,
    });
    pc += size;
  }

  return rows;
}

function readTraceBytes(memory, addr, length = 8) {
  const normalized = (Number(addr) || 0) & 0xFFFFFF;
  return bytesToHex(memory, normalized, length);
}

function captureTraceEntry(memory, cpu, pc, step) {
  const hl = cpu._hl & 0xFFFFFF;
  const bc = cpu._bc & 0xFFFFFF;
  return {
    step,
    pc: pc & 0xFFFFFF,
    a: cpu.a & 0xFF,
    f: cpu.f & 0xFF,
    bc,
    de: cpu._de & 0xFFFFFF,
    hl,
    ix: cpu._ix & 0xFFFFFF,
    iy: cpu._iy & 0xFFFFFF,
    sp: cpu.sp & 0xFFFFFF,
    hlBytes: readTraceBytes(memory, hl, 8),
    bcBytes: readTraceBytes(memory, bc, 8),
  };
}

function inTraceRange(pc) {
  return TRACE_RANGES.some((range) => pc >= range.start && pc < range.endExclusive);
}

function runBootPhases(blocks, romBytes) {
  const mem = createMemoryImage(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
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

function seedScenario(mem) {
  for (let index = 0; index < FLASH_SEED_BYTES.length; index += 1) {
    mem[FLASH_SEED_ADDR + index] = FLASH_SEED_BYTES[index];
  }
  mem[SYSFLAG_ADDR] = 0x00;
  mem[KEY_SCAN_CODE_ADDR] = ENTER_SCAN_CODE;
  mem[KEY_STATUS_ADDR] = (mem[KEY_STATUS_ADDR] | KEY_STATUS_MASK) & 0xFF;
}

function runDynamicTrace(blocks, bootState) {
  const mem = Uint8Array.from(bootState.memSnapshot);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;
  const logs = [];
  const visitedBlocks = new Set();

  prepareEventLoop(cpu, executor, mem, bootState);
  seedScenario(mem);

  const result = executor.runFrom(EVENT_LOOP_ENTRY, MODE, {
    ...TRACE_OPTS,
    onBlock(pc, mode, _meta, step) {
      const blockKey = `${(pc & 0xFFFFFF).toString(16).padStart(6, '0')}:${mode}`;
      visitedBlocks.add(blockKey);
      if (inTraceRange(pc & 0xFFFFFF)) {
        logs.push(captureTraceEntry(mem, cpu, pc, step));
      }
    },
  });

  return {
    result,
    mem,
    logs,
    visitedBlocks,
  };
}

function printBootSummary(bootState) {
  console.log('=== BOOT PHASES ===');
  for (const phase of bootState.phaseResults) {
    console.log(
      `${phase.label}: steps=${count(phase.result.steps)} `
      + `termination=${phase.result.termination} lastPc=${hex(phase.result.lastPc)}`,
    );
  }
  console.log('');
}

function printRegion(title, rows) {
  console.log(`=== ${title} ===`);
  for (const row of rows) {
    const note = row.decodeError ? ` [decode error: ${row.decodeError}]` : '';
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}${note}`);
  }
  console.log('');
}

function printTraceSummary(traceRun) {
  console.log('=== DYNAMIC TRACE SUMMARY ===');
  console.log(
    `result: steps=${count(traceRun.result.steps)} termination=${traceRun.result.termination} `
    + `lastPc=${hex(traceRun.result.lastPc)} loopsForced=${count(traceRun.result.loopsForced)}`,
  );
  console.log(
    `seeds: ${hex(FLASH_SEED_ADDR)}=${FLASH_SEED_BYTES.map((byte) => hexByte(byte)).join(' ')} `
    + `${hex(SYSFLAG_ADDR)}=${hexByte(traceRun.mem[SYSFLAG_ADDR])} `
    + `${hex(KEY_SCAN_CODE_ADDR)}=${hexByte(traceRun.mem[KEY_SCAN_CODE_ADDR])} `
    + `${hex(KEY_STATUS_ADDR)}=${hexByte(traceRun.mem[KEY_STATUS_ADDR])}`,
  );
  console.log(`logged block entries: ${count(traceRun.logs.length)}`);
  console.log('');
}

function printTraceLogs(traceRun) {
  console.log('=== BLOCK ENTRY TRACE (0x006700-0x006900 and 0x001C00-0x001D00) ===');
  if (traceRun.logs.length === 0) {
    console.log('  no matching blocks were reached');
    console.log('');
    return;
  }

  for (const entry of traceRun.logs) {
    console.log(
      `  step=${String(entry.step).padStart(4)} pc=${hex(entry.pc)} `
      + `A=${hexByte(entry.a)} F=${hexByte(entry.f)} `
      + `BC=${hex(entry.bc)} DE=${hex(entry.de)} HL=${hex(entry.hl)} `
      + `IX=${hex(entry.ix)} IY=${hex(entry.iy)} SP=${hex(entry.sp)} `
      + `HL[8]=${entry.hlBytes} BC[8]=${entry.bcBytes}`,
    );
  }
  console.log('');
}

function getFirstLog(logs, pc) {
  return logs.find((entry) => entry.pc === pc) ?? null;
}

function getNthLog(logs, pc, index) {
  return logs.filter((entry) => entry.pc === pc)[index] ?? null;
}

function isVisited(traceRun, pc) {
  return traceRun.visitedBlocks.has(`${pc.toString(16).padStart(6, '0')}:${MODE}`);
}

function formatMatchBytes(memory, addr, length = 8) {
  if (!Number.isInteger(addr)) {
    return 'n/a';
  }
  return bytesToHex(memory, addr, length);
}

function buildAnalysis(traceRun, callerRows) {
  const entry67F8 = getFirstLog(traceRun.logs, 0x0067F8);
  const first1C4F = getFirstLog(traceRun.logs, 0x001C4F);
  const first006808 = getFirstLog(traceRun.logs, 0x006808);
  const first1C33 = getFirstLog(traceRun.logs, 0x001C33);
  const matchReturn = getFirstLog(traceRun.logs, 0x006810);
  const second1C4F = getNthLog(traceRun.logs, 0x001C4F, 1);
  const successCheck = getFirstLog(traceRun.logs, 0x006816);
  const failureReturn = getFirstLog(traceRun.logs, 0x006824);

  const matchedRecordAddr = matchReturn?.hl;
  const matchedRecordBytes = formatMatchBytes(traceRun.mem, matchedRecordAddr, 8);
  const payloadAddr = successCheck?.hl;
  const payloadBytes = formatMatchBytes(traceRun.mem, payloadAddr, 8);
  const callerText = callerRows.map((row) => `${hex(row.pc)} ${row.text}`).join(' | ');

  const analysisLines = [];

  if (entry67F8 && first1C4F) {
    analysisLines.push(
      `- Carrier into ${hex(DISPATCH_ENTRY)}: traced A=${hexByte(entry67F8.a)} at entry, so this run is not keyed by A. `
      + `The real input is the stack-passed pointer loaded by ${callerText}; at ${hex(DISPATCH_ENTRY)} that becomes HL=${hex(first1C4F.hl)} via \`ld hl,(ix+6)\`.`,
    );
  }

  if (first1C4F && first006808) {
    analysisLines.push(
      `- ${hex(TABLE_SCAN_ENTRY)} is not the scanner. It advances HL by one byte and delegates to ${hex(TOKEN_PARSE_ENTRY)}. `
      + `On the first call it parses the envelope at ${hex(first1C4F.hl)} and returns with HL=${hex(first006808.hl)} and BC=${hex(first006808.bc)}.`,
    );
  }

  if (first1C33 && matchReturn) {
    analysisLines.push(
      `- Actual table lookup happens at ${hex(SCAN_WALK_ENTRY)}. ${hex(0x006808)} loads DE=${hex(first1C33.de)}; `
      + `${hex(SCAN_WALK_ENTRY)} compares byte0 against D and the high nibble of byte1 against E, looping through `
      + `${hex(0x001C44)} -> ${hex(0x001C7D)} -> ${hex(0x001C82)} until it finds a match or the 0xFF sentinel.`,
    );
    analysisLines.push(
      `- Matched entry: HL returned from ${hex(SCAN_WALK_ENTRY)} as ${hex(matchedRecordAddr)} with bytes ${matchedRecordBytes}. `
      + `That is type 0x80C0 with byte1=0xC2, so the low nibble encodes an inline payload length of 2 bytes.`,
    );
  }

  analysisLines.push(
    `- Table-entry format from ${hex(TOKEN_PARSE_ENTRY)}: byte0 is the high 8 bits of the type; `
    + `the high nibble of byte1 is the low 4 bits of the type; the low nibble of byte1 is the payload-length encoding. `
    + `0x0D means "next byte is the length", 0x0E means "next two bytes", 0x0F means "next three bytes", otherwise 0x00-0x0C is an inline length.`,
  );

  if (successCheck && failureReturn) {
    analysisLines.push(
      `- Successful-match action: after the match, ${hex(0x006812)} calls ${hex(TABLE_SCAN_ENTRY)} again and returns to ${hex(0x006816)} with HL=${hex(payloadAddr)} `
      + `pointing at payload bytes ${payloadBytes}. The code then executes \`in0 a,(0x03)\`, \`and (hl)\`, \`inc hl\`, \`cp (hl)\`. `
      + `Equality falls through to ${hex(0x00681E)} which loads HL=1 and returns; inequality takes ${hex(0x006824)} which loads HL=0 and returns.`,
    );
  }

  if (failureReturn) {
    analysisLines.push(
      `- Observed ENTER trace: it reached ${hex(0x006824)} with A=${hexByte(failureReturn.a)} after the compare, so the check failed. `
      + `The caller then executed ${isVisited(traceRun, 0x001727) ? hex(0x001727) : 'the post-call block'} and later `
      + `${isVisited(traceRun, 0x001933) ? hex(0x001933) : 'the failure path'}, which means this injected ENTER path does not satisfy the 0x80C0 payload predicate.`,
    );
  }

  return analysisLines;
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

const callerRows = disassembleRegion(romBytes, CALLER_ENTRY, CALLER_REGION_LEN);
const dispatchRows = disassembleRegion(romBytes, DISPATCH_ENTRY, DISPATCH_REGION_LEN);
const scanWalkRows = disassembleRegion(romBytes, SCAN_WALK_ENTRY, SCAN_WALK_REGION_LEN);
const tableScanRows = disassembleRegion(romBytes, TABLE_SCAN_ENTRY, TABLE_SCAN_REGION_LEN);
const tokenParseRows = disassembleRegion(romBytes, TOKEN_PARSE_ENTRY, TOKEN_PARSE_REGION_LEN);

const bootState = runBootPhases(blocks, romBytes);
const traceRun = runDynamicTrace(blocks, bootState);
const analysisLines = buildAnalysis(traceRun, callerRows);

console.log('Phase 376: 0x0067F8 dispatch entry disassembly and trace');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Transpiled: ${TRANSPILED_PATH}`);
console.log('');

printBootSummary(bootState);
printRegion('STATIC DISASSEMBLY 0x0067F8-0x006850 (88 bytes)', dispatchRows);
printRegion('STATIC DISASSEMBLY 0x001C4F-0x001CE5 (150 bytes)', tableScanRows);
printRegion('STATIC DISASSEMBLY 0x001CA6-0x001CD0 (42 bytes)', tokenParseRows);
printTraceSummary(traceRun);
printTraceLogs(traceRun);

console.log('=== ANALYSIS ===');
console.log(`  Caller setup (${hex(CALLER_ENTRY)}): ${callerRows.map((row) => `${hex(row.pc)} ${row.text}`).join(' | ')}`);
console.log(`  Internal scan helper (${hex(SCAN_WALK_ENTRY)}): ${scanWalkRows.map((row) => `${hex(row.pc)} ${row.text}`).join(' | ')}`);
for (const line of analysisLines) {
  console.log(`  ${line}`);
}
console.log('');
