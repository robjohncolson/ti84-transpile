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

const PHASE1_MAX_STEPS = 20000;
const PHASE2_MAX_STEPS = 100000;
const PHASE3_MAX_STEPS = 100;
const EVENT_LOOP_MAX_STEPS = 50000;

const PHASE1_LOOP_LIMIT = 32;
const PHASE2_LOOP_LIMIT = 10000;
const PHASE3_LOOP_LIMIT = 32;
const EVENT_LOOP_LOOP_LIMIT = 100000;

const DISASM_RANGE_START = 0x003A73;
const DISASM_RANGE_END = 0x003D80;
const VISIT_RANGE_START = 0x003A00;
const VISIT_RANGE_END_EXCLUSIVE = 0x003E00;
const MIN_DISASM_BYTES = 30;

const ENTER_KEY = {
  index: 1,
  bit: 0,
  scanCode: 0x10,
};

const KNOWN_ENTRY_POINTS = [
  0x003A73,
  0x003A7B,
  0x003A80,
  0x003A90,
  0x003B00,
  0x003B50,
  0x003C00,
  0x003C50,
  0x003C60,
  0x003D00,
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
  if (value == null || Number.isNaN(Number(value))) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return ((value ?? 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function hexWord(value) {
  return ((value ?? 0) & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

function count(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function hexBytes(buffer, start, length) {
  return Array.from(
    buffer.subarray(start, Math.min(buffer.length, start + Math.max(length, 0))),
    (value) => hexByte(value),
  ).join(' ');
}

function formatDisp(value) {
  return value >= 0
    ? `+0x${value.toString(16).toUpperCase()}`
    : `-0x${(-value).toString(16).toUpperCase()}`;
}

function withPrefix(inst, text) {
  return inst?.modePrefix ? `${inst.modePrefix} ${text}` : text;
}

function usesShortAddressing(inst) {
  return inst?.modePrefix === 'sis' || inst?.modePrefix === 'lis';
}

function formatDirectAddress(addr, shortAddress) {
  return shortAddress ? `0x${hexWord(addr)} [short/MBASE]` : hex(addr);
}

function formatIndexed(indexRegister, displacement) {
  return `(${indexRegister}${formatDisp(displacement)})`;
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
  if (!snapshot || !executor?.lcdMmio) return;
  executor.lcdMmio.upbase = snapshot.upbase;
  executor.lcdMmio.control = snapshot.control;
}

function resetBootStack(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.sp = BOOT_RESET_SP;
  mem.fill(0xFF, cpu.sp, cpu.sp + 3);
}

function resetEventLoopState(cpu, mem) {
  cpu.halted = false;
  cpu.iff1 = 0;
  cpu.iff2 = 0;
  cpu.f = 0x40;
  cpu._ix = 0xD1A860;
  cpu._iy = 0xD00080;
  cpu.sp = EVENT_RESET_SP;
  mem.fill(0xFF, cpu.sp, cpu.sp + 12);
}

function getKeyboardState(peripherals) {
  const keyboardState = peripherals.keyboardState ?? peripherals.keyboard;
  if (!keyboardState?.keyMatrix) {
    throw new Error('Peripheral bus did not expose a keyboard matrix.');
  }
  if (!peripherals.keyboardState) {
    peripherals.keyboardState = keyboardState;
  }
  return keyboardState;
}

function resetKeyboard(peripherals, keyboardState) {
  keyboardState.keyMatrix.fill(0xFF);
  keyboardState.groupSelect = 0xFF;
  if (peripherals.keyboardController) {
    peripherals.keyboardController.groupSelect = 0xFFFF;
  }
}

function injectEnterKey(keyboardState) {
  keyboardState.keyMatrix[ENTER_KEY.index] &= ~(1 << ENTER_KEY.bit);
}

function formatInstruction(inst) {
  if (!inst) return 'db ??';

  switch (inst.tag) {
    case 'nop': return withPrefix(inst, 'nop');
    case 'halt': return withPrefix(inst, 'halt');
    case 'slp': return withPrefix(inst, 'slp');
    case 'di': return withPrefix(inst, 'di');
    case 'ei': return withPrefix(inst, 'ei');
    case 'ret': return withPrefix(inst, 'ret');
    case 'reti': return withPrefix(inst, 'reti');
    case 'retn': return withPrefix(inst, 'retn');
    case 'ret-conditional': return withPrefix(inst, `ret ${inst.condition}`);
    case 'jp': return withPrefix(inst, `jp ${hex(inst.target)}`);
    case 'jp-conditional': return withPrefix(inst, `jp ${inst.condition}, ${hex(inst.target)}`);
    case 'jp-indirect': return withPrefix(inst, `jp (${inst.indirectRegister})`);
    case 'jr': return withPrefix(inst, `jr ${hex(inst.target)}`);
    case 'jr-conditional': return withPrefix(inst, `jr ${inst.condition}, ${hex(inst.target)}`);
    case 'djnz': return withPrefix(inst, `djnz ${hex(inst.target)}`);
    case 'call': return withPrefix(inst, `call ${hex(inst.target)}`);
    case 'call-conditional': return withPrefix(inst, `call ${inst.condition}, ${hex(inst.target)}`);
    case 'rst': return withPrefix(inst, `rst 0x${hexByte(inst.target)}`);
    case 'push': return withPrefix(inst, `push ${inst.pair}`);
    case 'pop': return withPrefix(inst, `pop ${inst.pair}`);
    case 'inc-pair': return withPrefix(inst, `inc ${inst.pair}`);
    case 'dec-pair': return withPrefix(inst, `dec ${inst.pair}`);
    case 'inc-reg': return withPrefix(inst, `inc ${inst.reg}`);
    case 'dec-reg': return withPrefix(inst, `dec ${inst.reg}`);
    case 'inc-ixd': return withPrefix(inst, `inc ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'dec-ixd': return withPrefix(inst, `dec ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'add-pair': return withPrefix(inst, `add ${inst.dest}, ${inst.src}`);
    case 'adc-pair': return withPrefix(inst, `adc hl, ${inst.src}`);
    case 'sbc-pair': return withPrefix(inst, `sbc hl, ${inst.src}`);
    case 'ld-pair-imm': return withPrefix(inst, `ld ${inst.pair}, ${hex(inst.value)}`);
    case 'ld-pair-mem':
      return withPrefix(inst, `ld ${inst.pair}, (${formatDirectAddress(inst.addr, usesShortAddressing(inst))})`);
    case 'ld-mem-pair':
      return withPrefix(inst, `ld (${formatDirectAddress(inst.addr, usesShortAddressing(inst))}), ${inst.pair}`);
    case 'ld-pair-indexed':
      return withPrefix(inst, `ld ${inst.pair}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-indexed-pair':
      return withPrefix(inst, `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.pair}`);
    case 'ld-pair-ind':
      return withPrefix(inst, `ld ${inst.pair}, (${inst.src})`);
    case 'ld-ind-pair':
      return withPrefix(inst, `ld (${inst.dest}), ${inst.pair}`);
    case 'ld-reg-imm': return withPrefix(inst, `ld ${inst.dest}, 0x${hexByte(inst.value)}`);
    case 'ld-reg-reg': return withPrefix(inst, `ld ${inst.dest}, ${inst.src}`);
    case 'ld-reg-ind': return withPrefix(inst, `ld ${inst.dest}, (${inst.src})`);
    case 'ld-ind-reg': return withPrefix(inst, `ld (${inst.dest}), ${inst.src}`);
    case 'ld-ind-imm': return withPrefix(inst, `ld (hl), 0x${hexByte(inst.value)}`);
    case 'ld-reg-mem':
      return withPrefix(inst, `ld ${inst.dest}, (${formatDirectAddress(inst.addr, usesShortAddressing(inst))})`);
    case 'ld-mem-reg':
      return withPrefix(inst, `ld (${formatDirectAddress(inst.addr, usesShortAddressing(inst))}), ${inst.src}`);
    case 'ld-reg-ixd':
      return withPrefix(inst, `ld ${inst.dest}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-ixd-reg':
      return withPrefix(inst, `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.src}`);
    case 'ld-ixd-imm':
      return withPrefix(inst, `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, 0x${hexByte(inst.value)}`);
    case 'ld-ixiy-indexed':
      return withPrefix(inst, `ld ${inst.dest}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-indexed-ixiy':
      return withPrefix(inst, `ld ${formatIndexed(inst.indexRegister, inst.displacement)}, ${inst.src}`);
    case 'ld-sp-hl': return withPrefix(inst, 'ld sp, hl');
    case 'ld-sp-pair': return withPrefix(inst, `ld sp, ${inst.pair}`);
    case 'ld-special': return withPrefix(inst, `ld ${inst.dest}, ${inst.src}`);
    case 'ld-mb-a': return withPrefix(inst, 'ld mb, a');
    case 'ld-a-mb': return withPrefix(inst, 'ld a, mb');
    case 'alu-imm': return withPrefix(inst, `${inst.op} 0x${hexByte(inst.value)}`);
    case 'alu-reg': return withPrefix(inst, `${inst.op} ${inst.src}`);
    case 'alu-ixd': return withPrefix(inst, `${inst.op} ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'bit-test': return withPrefix(inst, `bit ${inst.bit}, ${inst.reg}`);
    case 'bit-test-ind': return withPrefix(inst, `bit ${inst.bit}, (${inst.indirectRegister})`);
    case 'bit-res': return withPrefix(inst, `res ${inst.bit}, ${inst.reg}`);
    case 'bit-res-ind': return withPrefix(inst, `res ${inst.bit}, (${inst.indirectRegister})`);
    case 'bit-set': return withPrefix(inst, `set ${inst.bit}, ${inst.reg}`);
    case 'bit-set-ind': return withPrefix(inst, `set ${inst.bit}, (${inst.indirectRegister})`);
    case 'indexed-cb-bit':
      return withPrefix(inst, `bit ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-res':
      return withPrefix(inst, `res ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-set':
      return withPrefix(inst, `set ${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-rotate':
      return withPrefix(inst, `${inst.operation ?? inst.op ?? 'rotate'} ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'rotate-reg': return withPrefix(inst, `${inst.op} ${inst.reg}`);
    case 'rotate-ind': return withPrefix(inst, `${inst.op} (${inst.indirectRegister})`);
    case 'out-imm': return withPrefix(inst, `out (0x${hexByte(inst.port)}), a`);
    case 'in-imm': return withPrefix(inst, `in a, (0x${hexByte(inst.port)})`);
    case 'out-reg': return withPrefix(inst, `out (c), ${inst.reg}`);
    case 'in-reg': return withPrefix(inst, `in ${inst.reg}, (c)`);
    case 'out0': return withPrefix(inst, `out0 (0x${hexByte(inst.port)}), ${inst.reg}`);
    case 'in0': return withPrefix(inst, `in0 ${inst.reg}, (0x${hexByte(inst.port)})`);
    case 'tst-reg': return withPrefix(inst, `tst a, ${inst.reg}`);
    case 'tst-ind': return withPrefix(inst, 'tst a, (hl)');
    case 'tst-imm': return withPrefix(inst, `tst a, 0x${hexByte(inst.value)}`);
    case 'tstio': return withPrefix(inst, `tstio 0x${hexByte(inst.value)}`);
    case 'lea': return withPrefix(inst, `lea ${inst.dest}, ${inst.base}${formatDisp(inst.displacement)}`);
    case 'pea': return withPrefix(inst, `pea (${inst.base}${formatDisp(inst.displacement)})`);
    case 'neg': return withPrefix(inst, 'neg');
    case 'ex-af': return withPrefix(inst, "ex af, af'");
    case 'exx': return withPrefix(inst, 'exx');
    case 'ex-de-hl': return withPrefix(inst, 'ex de, hl');
    case 'ex-sp-hl': return withPrefix(inst, 'ex (sp), hl');
    case 'rlca': return withPrefix(inst, 'rlca');
    case 'rrca': return withPrefix(inst, 'rrca');
    case 'rla': return withPrefix(inst, 'rla');
    case 'rra': return withPrefix(inst, 'rra');
    case 'daa': return withPrefix(inst, 'daa');
    case 'cpl': return withPrefix(inst, 'cpl');
    case 'scf': return withPrefix(inst, 'scf');
    case 'ccf': return withPrefix(inst, 'ccf');
    case 'im': return withPrefix(inst, `im ${inst.value}`);
    case 'ldi': return withPrefix(inst, 'ldi');
    case 'ldd': return withPrefix(inst, 'ldd');
    case 'ldir': return withPrefix(inst, 'ldir');
    case 'lddr': return withPrefix(inst, 'lddr');
    case 'cpi': return withPrefix(inst, 'cpi');
    case 'cpd': return withPrefix(inst, 'cpd');
    case 'cpir': return withPrefix(inst, 'cpir');
    case 'cpdr': return withPrefix(inst, 'cpdr');
    case 'ini': return withPrefix(inst, 'ini');
    case 'ind': return withPrefix(inst, 'ind');
    case 'inir': return withPrefix(inst, 'inir');
    case 'indr': return withPrefix(inst, 'indr');
    case 'outi': return withPrefix(inst, 'outi');
    case 'outd': return withPrefix(inst, 'outd');
    case 'otir': return withPrefix(inst, 'otir');
    case 'otdr': return withPrefix(inst, 'otdr');
    case 'otimr': return withPrefix(inst, 'otimr');
    case 'stmix': return withPrefix(inst, 'stmix');
    case 'rsmix': return withPrefix(inst, 'rsmix');
    case 'mlt': return withPrefix(inst, `mlt ${inst.reg}`);
    case 'db': return withPrefix(inst, `db 0x${hexByte(inst.value ?? 0)}`);
    default: {
      const parts = [];
      for (const [key, value] of Object.entries(inst)) {
        if ([
          'tag',
          'length',
          'pc',
          'nextPc',
          'mode',
          'modePrefix',
          'nextMode',
          'terminates',
          'fallthrough',
          'kind',
          'decodeError',
        ].includes(key)) {
          continue;
        }
        if (value === undefined || value === null) continue;
        parts.push(typeof value === 'number' ? `${key}=${hex(value)}` : `${key}=${value}`);
      }
      return withPrefix(inst, parts.length > 0 ? `${inst.tag} ${parts.join(' ')}` : (inst.tag ?? 'unknown'));
    }
  }
}

function decodeAt(romBytes, pc, mode = MODE) {
  try {
    const inst = decodeInstruction(romBytes, pc, mode);
    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
      throw new Error('decoder returned invalid length');
    }
    return inst;
  } catch (error) {
    return {
      tag: 'db',
      value: romBytes[pc] ?? 0,
      length: 1,
      pc,
      nextPc: pc + 1,
      mode,
      decodeError: error instanceof Error ? error.message : String(error),
    };
  }
}

function extractControlFlow(inst, pc) {
  switch (inst?.tag) {
    case 'call':
      return { pc, kind: 'call', target: inst.target, text: `call -> ${hex(inst.target)}` };
    case 'call-conditional':
      return { pc, kind: `call ${inst.condition}`, target: inst.target, text: `call ${inst.condition} -> ${hex(inst.target)}` };
    case 'jp':
      return { pc, kind: 'jp', target: inst.target, text: `jp -> ${hex(inst.target)}` };
    case 'jp-conditional':
      return { pc, kind: `jp ${inst.condition}`, target: inst.target, text: `jp ${inst.condition} -> ${hex(inst.target)}` };
    case 'jr':
      return { pc, kind: 'jr', target: inst.target, text: `jr -> ${hex(inst.target)}` };
    case 'jr-conditional':
      return { pc, kind: `jr ${inst.condition}`, target: inst.target, text: `jr ${inst.condition} -> ${hex(inst.target)}` };
    case 'djnz':
      return { pc, kind: 'djnz', target: inst.target, text: `djnz -> ${hex(inst.target)}` };
    default:
      return null;
  }
}

function decodeWindow(romBytes, start, minBytes = MIN_DISASM_BYTES, mode = MODE) {
  const rows = [];
  const controlFlow = [];
  const minEnd = Math.min(romBytes.length, start + Math.max(minBytes, 1));
  let pc = start >>> 0;

  while (pc < romBytes.length && (pc < minEnd || rows.length === 0)) {
    const inst = decodeAt(romBytes, pc, mode);
    const fullLength = Math.max(inst.length ?? 1, 1);
    const shownLength = Math.max(1, Math.min(fullLength, romBytes.length - pc));
    rows.push({
      pc,
      bytes: hexBytes(romBytes, pc, shownLength),
      text: formatInstruction(inst),
      decodeError: inst.decodeError ?? null,
    });

    const flow = extractControlFlow(inst, pc);
    if (flow) controlFlow.push(flow);

    pc += fullLength;
  }

  return { rows, controlFlow };
}

function collectLiftedEntries(blocks, start, endInclusive, mode = MODE) {
  return Object.keys(blocks)
    .map((key) => {
      const [addrHex, blockMode] = key.split(':');
      return { addr: parseInt(addrHex, 16), mode: blockMode };
    })
    .filter((entry) => (
      entry.mode === mode &&
      Number.isInteger(entry.addr) &&
      entry.addr >= start &&
      entry.addr <= endInclusive
    ))
    .map((entry) => entry.addr)
    .sort((a, b) => a - b);
}

function discoverDisassembly(romBytes, blocks) {
  const entrySources = new Map();
  const listings = new Map();
  const controlFlowMap = new Map();
  const queue = [];

  function enqueue(addr, source) {
    if (!Number.isInteger(addr) || addr < DISASM_RANGE_START || addr > DISASM_RANGE_END) {
      return;
    }
    let sources = entrySources.get(addr);
    if (!sources) {
      sources = new Set();
      entrySources.set(addr, sources);
      queue.push(addr);
    }
    sources.add(source);
  }

  for (const addr of KNOWN_ENTRY_POINTS) enqueue(addr, 'known');
  for (const addr of collectLiftedEntries(blocks, DISASM_RANGE_START, DISASM_RANGE_END, MODE)) {
    enqueue(addr, 'lifted');
  }

  while (queue.length > 0) {
    const addr = queue.shift();
    const listing = decodeWindow(romBytes, addr, MIN_DISASM_BYTES, MODE);
    listings.set(addr, listing);

    for (const flow of listing.controlFlow) {
      if (flow.pc < DISASM_RANGE_START || flow.pc > DISASM_RANGE_END) continue;
      const key = `${flow.pc}:${flow.kind}:${flow.target}`;
      if (!controlFlowMap.has(key)) {
        controlFlowMap.set(key, flow);
      }
      if (Number.isInteger(flow.target) && flow.target >= DISASM_RANGE_START && flow.target <= DISASM_RANGE_END) {
        enqueue(flow.target, 'branch');
      }
    }
  }

  return {
    entrySources,
    listings,
    controlFlow: [...controlFlowMap.values()].sort((a, b) => {
      if (a.pc !== b.pc) return a.pc - b.pc;
      if ((a.target ?? -1) !== (b.target ?? -1)) return (a.target ?? -1) - (b.target ?? -1);
      return a.kind.localeCompare(b.kind);
    }),
  };
}

function sourceLabel(sourceSet) {
  return [...(sourceSet ?? new Set())].sort().join(', ');
}

function collectRangeVisits(result, start, endExclusive) {
  const totals = new Map();
  for (const [key, visits] of Object.entries(result.blockVisits ?? {})) {
    const [addrHex] = key.split(':');
    const addr = parseInt(addrHex, 16);
    if (!Number.isInteger(addr) || addr < start || addr >= endExclusive) continue;
    totals.set(addr, (totals.get(addr) ?? 0) + Number(visits ?? 0));
  }
  return [...totals.entries()].sort((a, b) => a[0] - b[0]);
}

function diffVisits(leftEntries, rightEntries) {
  const left = new Map(leftEntries);
  const right = new Map(rightEntries);
  const addrs = [...new Set([...left.keys(), ...right.keys()])].sort((a, b) => a - b);
  return addrs
    .map((addr) => ({
      addr,
      left: left.get(addr) ?? 0,
      right: right.get(addr) ?? 0,
    }))
    .filter((entry) => entry.left !== entry.right);
}

function runBootPhases(blocks, romBytes) {
  const mem = createMemoryImage(romBytes);
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;

  executor.runFrom(PHASE1_ENTRY, 'z80', {
    maxSteps: PHASE1_MAX_STEPS,
    maxLoopIterations: PHASE1_LOOP_LIMIT,
  });

  resetBootStack(cpu, mem);

  executor.runFrom(PHASE2_ENTRY, MODE, {
    maxSteps: PHASE2_MAX_STEPS,
    maxLoopIterations: PHASE2_LOOP_LIMIT,
  });

  cpu.mbase = 0xD0;
  cpu._iy = 0xD00080;
  cpu._hl = 0;
  resetBootStack(cpu, mem);

  executor.runFrom(PHASE3_ENTRY, MODE, {
    maxSteps: PHASE3_MAX_STEPS,
    maxLoopIterations: PHASE3_LOOP_LIMIT,
  });

  return {
    mem,
    cpuSnapshot: snapshotCpu(cpu),
    lcdSnapshot: executor.lcdMmio
      ? { upbase: executor.lcdMmio.upbase, control: executor.lcdMmio.control }
      : null,
  };
}

function runEventLoop(blocks, bootState, injectEnter = false) {
  const mem = bootState.mem.slice();
  const peripherals = createPeripheralBus({ timerInterrupt: false });
  const keyboardState = getKeyboardState(peripherals);
  const executor = createExecutor(blocks, mem, { peripherals });
  const { cpu } = executor;

  restoreCpu(cpu, bootState.cpuSnapshot);
  restoreLcdMmio(executor, bootState.lcdSnapshot);
  resetEventLoopState(cpu, mem);
  resetKeyboard(peripherals, keyboardState);

  if (injectEnter) {
    injectEnterKey(keyboardState);
  }

  const result = executor.runFrom(EVENT_LOOP_ENTRY, MODE, {
    maxSteps: EVENT_LOOP_MAX_STEPS,
    maxLoopIterations: EVENT_LOOP_LOOP_LIMIT,
  });

  return {
    result,
    visits: collectRangeVisits(result, VISIT_RANGE_START, VISIT_RANGE_END_EXCLUSIVE),
  };
}

function printVisitTable(entries) {
  if (entries.length === 0) {
    console.log('  none');
    return;
  }
  for (const [addr, visits] of entries) {
    console.log(`  ${hex(addr)}: ${count(visits)}`);
  }
}

function printVisitDiff(entries) {
  if (entries.length === 0) {
    console.log('  none');
    return;
  }
  for (const entry of entries) {
    const delta = entry.left - entry.right;
    const deltaText = delta >= 0 ? `+${count(delta)}` : `-${count(Math.abs(delta))}`;
    console.log(
      `  ${hex(entry.addr)}: enter=${count(entry.left)} noKey=${count(entry.right)} delta=${deltaText}`,
    );
  }
}

if (!fs.existsSync(ROM_PATH)) {
  throw new Error(`ROM not found: ${ROM_PATH}`);
}

if (!fs.existsSync(TRANSPILED_PATH)) {
  throw new Error(`Transpiled ROM not found: ${TRANSPILED_PATH}`);
}

const romBytes = new Uint8Array(fs.readFileSync(ROM_PATH));
const romModule = await import(pathToFileURL(TRANSPILED_PATH).href);
const BLOCKS = normalizeBlocks(
  romModule.PRELIFTED_BLOCKS
  ?? romModule.default?.PRELIFTED_BLOCKS
  ?? romModule.default,
);

if (!BLOCKS || Object.keys(BLOCKS).length === 0) {
  throw new Error('Unable to load PRELIFTED_BLOCKS from ROM.transpiled.js');
}

const disassembly = discoverDisassembly(romBytes, BLOCKS);
const bootState = runBootPhases(BLOCKS, romBytes);
const withEnter = runEventLoop(BLOCKS, bootState, true);
const noKey = runEventLoop(BLOCKS, bootState, false);
const visitDiff = diffVisits(withEnter.visits, noKey.visits);

console.log('=== DISASSEMBLY 0x003A73 - 0x003D80 ===');
console.log(`ENTER key injection: keyMatrix[${ENTER_KEY.index}] bit ${ENTER_KEY.bit} (scan code 0x${hexByte(ENTER_KEY.scanCode)})`);
console.log('Per-entry windows extend past 0x003D80 only when needed to satisfy the 30-byte minimum.\n');

for (const addr of [...disassembly.entrySources.keys()].sort((a, b) => a - b)) {
  const listing = disassembly.listings.get(addr);
  const labels = sourceLabel(disassembly.entrySources.get(addr));
  console.log(`-- entry ${hex(addr)} [${labels}] --`);
  for (const row of listing.rows) {
    const suffix = row.decodeError ? `  ; decode fallback: ${row.decodeError}` : '';
    console.log(`  ${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}${suffix}`);
  }
  console.log('');
}

console.log('=== BLOCK VISITS (WITH ENTER KEY) ===');
printVisitTable(withEnter.visits);
console.log('');

console.log('=== BLOCK VISITS (NO KEY) ===');
printVisitTable(noKey.visits);
console.log('');

console.log('=== DIFF: ENTER vs NO-KEY ===');
printVisitDiff(visitDiff);
console.log('');

console.log('=== CONTROL FLOW MAP ===');
if (disassembly.controlFlow.length === 0) {
  console.log('  none');
} else {
  for (const flow of disassembly.controlFlow) {
    const scope = (
      Number.isInteger(flow.target) &&
      flow.target >= DISASM_RANGE_START &&
      flow.target <= DISASM_RANGE_END
    ) ? 'in-range' : 'external';
    console.log(`  ${hex(flow.pc)}  ${flow.text}  [${scope}]`);
  }
}
