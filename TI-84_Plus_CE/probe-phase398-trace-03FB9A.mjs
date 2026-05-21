#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const MODE = 'adl';
const EXPECTED_ROM_SIZE = 0x400000;
const OS_IY_BASE = 0xD00080;
const RAM_START = 0xD00000;
const RAM_END = 0xE00000;
const LOCAL_BRANCH_RADIUS = 0x400;
const MAX_VISITED_INSTRUCTIONS = 512;

const FUNCTION_SPECS = [
  { entry: 0x03FB9A, minBytes: 0x100, name: '0x03FB9A key-accepted path (post-GetCSC)' },
];

const SYMBOL_NAMES = new Map([
  [0x003A73, 'event loop entry'],
  [0x003D5A, '_GetCSC wrapper'],
  [0x030300, 'event consumption'],
  [0x02FE73, 'key dispatcher entry'],
  [0x02FECF, 'mode flag decision tree'],
  [0x03FA09, 'result fetch / _GetCSC path'],
  [0x03FB9A, 'key-accepted path'],
  [0x040D40, 'wait-loop helper'],
  [0xD00080, 'IY base / key-status flag byte'],
  [0xD00587, 'kbdGetKy result'],
  [0xD0058C, 'kbdKey'],
  [0xD0058E, 'kbdToken'],
  [0xD007E0, 'mode byte'],
]);

const CALL_JP_OPCODE_NAMES = new Map([
  [0xC3, 'JP'],
  [0xC2, 'JP NZ'],
  [0xCA, 'JP Z'],
  [0xD2, 'JP NC'],
  [0xDA, 'JP C'],
  [0xE2, 'JP PO'],
  [0xEA, 'JP PE'],
  [0xF2, 'JP P'],
  [0xFA, 'JP M'],
  [0xCD, 'CALL'],
  [0xC4, 'CALL NZ'],
  [0xCC, 'CALL Z'],
  [0xD4, 'CALL NC'],
  [0xDC, 'CALL C'],
  [0xE4, 'CALL PO'],
  [0xEC, 'CALL PE'],
  [0xF4, 'CALL P'],
  [0xFC, 'CALL M'],
]);

const SIMPLE_MNEMONICS = {
  nop: 'NOP',
  halt: 'HALT',
  di: 'DI',
  ei: 'EI',
  ret: 'RET',
  reti: 'RETI',
  retn: 'RETN',
  exx: 'EXX',
  'ex-af': "EX AF,AF'",
  'ex-de-hl': 'EX DE,HL',
  'ex-sp-hl': 'EX (SP),HL',
  cpl: 'CPL',
  neg: 'NEG',
  ccf: 'CCF',
  scf: 'SCF',
  daa: 'DAA',
  rla: 'RLA',
  rlca: 'RLCA',
  rra: 'RRA',
  rrca: 'RRCA',
  rrd: 'RRD',
  rld: 'RLD',
  ldi: 'LDI',
  ldir: 'LDIR',
  ldd: 'LDD',
  lddr: 'LDDR',
  cpi: 'CPI',
  cpir: 'CPIR',
  cpd: 'CPD',
  cpdr: 'CPDR',
  ini: 'INI',
  inir: 'INIR',
  ind: 'IND',
  indr: 'INDR',
  outi: 'OUTI',
  otir: 'OTIR',
  outd: 'OUTD',
  otdr: 'OTDR',
  slp: 'SLP',
};

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) {
    return 'n/a';
  }
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function count(value) {
  return Number(value ?? 0).toLocaleString('en-US');
}

function widthForValue(value, modePrefix = null) {
  if (modePrefix === 'sis' || modePrefix === 'lis') return 4;
  if (modePrefix === 'sil' || modePrefix === 'lil') return 6;
  if (value <= 0xFF) return 2;
  if (value <= 0xFFFF) return 4;
  return 6;
}

function formatValue(value, modePrefix = null) {
  return hex(value, widthForValue(value, modePrefix));
}

function formatBytes(buffer, pc, length) {
  const bytes = [];
  for (let index = 0; index < length; index += 1) {
    bytes.push((buffer[pc + index] & 0xFF).toString(16).toUpperCase().padStart(2, '0'));
  }
  return bytes.join(' ');
}

function formatDisplacement(displacement) {
  const abs = Math.abs(displacement);
  const sign = displacement < 0 ? '-' : '+';
  return `${sign}${hex(abs, abs <= 0xFF ? 2 : 4)}`;
}

function formatIndexed(indexRegister, displacement) {
  return `(${String(indexRegister).toUpperCase()}${formatDisplacement(displacement)})`;
}

function formatAlu(op, operand) {
  const upper = String(op ?? '?').toUpperCase();
  if (upper === 'ADD' || upper === 'ADC' || upper === 'SBC') {
    return `${upper} A,${operand}`;
  }
  return `${upper} ${operand}`;
}

function formatInstruction(inst) {
  if (!inst?.tag) return '???';

  if (SIMPLE_MNEMONICS[inst.tag]) {
    return SIMPLE_MNEMONICS[inst.tag];
  }

  switch (inst.tag) {
    case 'ld-reg-reg':
      return `LD ${String(inst.dest).toUpperCase()},${String(inst.src).toUpperCase()}`;
    case 'ld-reg-imm':
      return `LD ${String(inst.dest).toUpperCase()},${hex(inst.value, 2)}`;
    case 'ld-pair-imm':
      return `LD ${String(inst.pair).toUpperCase()},${formatValue(inst.value, inst.modePrefix)}`;
    case 'ld-ind-imm':
      return `LD (HL),${hex(inst.value, 2)}`;
    case 'ld-ind-reg':
      return `LD (${String(inst.dest).toUpperCase()}),${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ind':
      return `LD ${String(inst.dest).toUpperCase()},(${String(inst.src).toUpperCase()})`;
    case 'ld-reg-mem':
    case 'ld-a-mem':
      return `LD ${String(inst.dest ?? 'a').toUpperCase()},(${hex(inst.addr ?? inst.address)})`;
    case 'ld-mem-reg':
    case 'ld-mem-a':
      return `LD (${hex(inst.addr ?? inst.address)}),${String(inst.src ?? 'a').toUpperCase()}`;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        return `LD (${hex(inst.addr, widthForValue(inst.addr, inst.modePrefix))}),${String(inst.pair).toUpperCase()}`;
      }
      return `LD ${String(inst.pair).toUpperCase()},(${hex(inst.addr, widthForValue(inst.addr, inst.modePrefix))})`;
    case 'ld-mem-pair':
      return `LD (${hex(inst.addr, widthForValue(inst.addr, inst.modePrefix))}),${String(inst.pair).toUpperCase()}`;
    case 'ld-sp-hl':
      return 'LD SP,HL';
    case 'ld-sp-pair':
      return `LD SP,${String(inst.pair).toUpperCase()}`;
    case 'ld-reg-ixd':
      return `LD ${String(inst.dest).toUpperCase()},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${String(inst.src).toUpperCase()}`;
    case 'ld-ixd-imm':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${hex(inst.value, 2)}`;
    case 'ld-pair-indexed':
      return `LD ${String(inst.pair).toUpperCase()},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${String(inst.pair).toUpperCase()}`;
    case 'ld-ixiy-indexed':
      return `LD ${String(inst.dest).toUpperCase()},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-ixiy':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${String(inst.src).toUpperCase()}`;
    case 'push':
      return `PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop':
      return `POP ${String(inst.pair).toUpperCase()}`;
    case 'alu-reg':
      return formatAlu(inst.op, String(inst.src).toUpperCase());
    case 'alu-imm':
      return formatAlu(inst.op, hex(inst.value, 2));
    case 'alu-ind':
      return formatAlu(inst.op, '(HL)');
    case 'alu-ixd':
      return formatAlu(inst.op, formatIndexed(inst.indexRegister, inst.displacement));
    case 'inc-reg':
      return `INC ${String(inst.reg).toUpperCase()}`;
    case 'dec-reg':
      return `DEC ${String(inst.reg).toUpperCase()}`;
    case 'inc-pair':
      return `INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair':
      return `DEC ${String(inst.pair).toUpperCase()}`;
    case 'add-pair':
      return `ADD ${String(inst.dest ?? 'hl').toUpperCase()},${String(inst.src).toUpperCase()}`;
    case 'adc-pair':
      return `ADC ${String(inst.dest ?? 'hl').toUpperCase()},${String(inst.src).toUpperCase()}`;
    case 'sbc-pair':
      return `SBC ${String(inst.dest ?? 'hl').toUpperCase()},${String(inst.src).toUpperCase()}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
    case 'jp-cond':
      return `JP ${String(inst.condition).toUpperCase()},${hex(inst.target)}`;
    case 'jp-indirect':
      return `JP (${String(inst.indirectRegister ?? inst.reg ?? 'hl').toUpperCase()})`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
    case 'jr-cond':
      return `JR ${String(inst.condition).toUpperCase()},${hex(inst.target)}`;
    case 'djnz':
      return `DJNZ ${hex(inst.target)}`;
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
    case 'call-cond':
      return `CALL ${String(inst.condition).toUpperCase()},${hex(inst.target)}`;
    case 'ret-conditional':
    case 'ret-cond':
      return `RET ${String(inst.condition).toUpperCase()}`;
    case 'rst':
      return `RST ${hex(inst.target ?? inst.vector, 2)}`;
    case 'in-reg':
      return `IN ${String(inst.reg ?? inst.dest).toUpperCase()},(C)`;
    case 'out-reg':
      return `OUT (C),${String(inst.reg ?? inst.src).toUpperCase()}`;
    case 'in-imm':
      return `IN A,(${hex(inst.port, 2)})`;
    case 'out-imm':
      return `OUT (${hex(inst.port, 2)}),A`;
    case 'in0':
      return `IN0 ${String(inst.reg).toUpperCase()},(${hex(inst.port, 2)})`;
    case 'out0':
      return `OUT0 (${hex(inst.port, 2)}),${String(inst.reg).toUpperCase()}`;
    case 'bit-test':
      return `BIT ${inst.bit},${String(inst.reg).toUpperCase()}`;
    case 'bit-test-ind':
      return `BIT ${inst.bit},(${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-set':
      return `SET ${inst.bit},${String(inst.reg).toUpperCase()}`;
    case 'bit-set-ind':
      return `SET ${inst.bit},(${String(inst.indirectRegister).toUpperCase()})`;
    case 'bit-res':
      return `RES ${inst.bit},${String(inst.reg).toUpperCase()}`;
    case 'bit-res-ind':
      return `RES ${inst.bit},(${String(inst.indirectRegister).toUpperCase()})`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `RES ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-rotate':
      return `${String(inst.operation).toUpperCase()} ${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'im':
      return `IM ${inst.value ?? inst.mode ?? inst.interruptMode}`;
    case 'ld-special':
      return `LD ${String(inst.dest).toUpperCase()},${String(inst.src).toUpperCase()}`;
    case 'ld-a-mb':
      return 'LD A,MB';
    default:
      return `${String(inst.tag).toUpperCase()} [raw]`;
  }
}

function splitInstruction(text) {
  const firstSpace = text.indexOf(' ');
  if (firstSpace === -1) {
    return { mnemonic: text, operands: '' };
  }
  return {
    mnemonic: text.slice(0, firstSpace),
    operands: text.slice(firstSpace + 1),
  };
}

function symbolLabel(addr) {
  return SYMBOL_NAMES.get(addr) ?? '';
}

function isCallLike(inst) {
  return inst?.tag === 'call' || inst?.tag === 'call-conditional' || inst?.tag === 'call-cond';
}

function isJumpLike(inst) {
  return inst?.tag === 'jp' || inst?.tag === 'jp-conditional' || inst?.tag === 'jp-cond' ||
    inst?.tag === 'jr' || inst?.tag === 'jr-conditional' || inst?.tag === 'jr-cond' ||
    inst?.tag === 'djnz';
}

function isConditionalFlow(inst) {
  return inst?.tag === 'jp-conditional' || inst?.tag === 'jp-cond' ||
    inst?.tag === 'jr-conditional' || inst?.tag === 'jr-cond' ||
    inst?.tag === 'djnz' || inst?.tag === 'call-conditional' || inst?.tag === 'call-cond';
}

function isReturnLike(inst) {
  return inst?.tag === 'ret' || inst?.tag === 'reti' || inst?.tag === 'retn' ||
    inst?.tag === 'ret-conditional' || inst?.tag === 'ret-cond';
}

function isTerminal(inst) {
  return isReturnLike(inst) || inst?.tag === 'halt' || inst?.tag === 'slp' || inst?.tag === 'jp-indirect';
}

function getControlTarget(inst) {
  return inst?.target ?? undefined;
}

function pairKeyForHalfRegister(reg) {
  switch (String(reg ?? '').toLowerCase()) {
    case 'b':
    case 'c':
      return 'bc';
    case 'd':
    case 'e':
      return 'de';
    case 'h':
    case 'l':
      return 'hl';
    case 'ixh':
    case 'ixl':
      return 'ix';
    case 'iyh':
    case 'iyl':
      return 'iy';
    default:
      return null;
  }
}

function cloneState(state) {
  return { ...state };
}

function createInitialState() {
  return {
    a: null,
    bc: null,
    de: null,
    hl: null,
    ix: null,
    iy: OS_IY_BASE,
    sp: null,
  };
}

function setPair(state, key, value) {
  if (Object.prototype.hasOwnProperty.call(state, key)) {
    state[key] = value === null || value === undefined ? null : (value & 0xFFFFFF);
  }
}

function invalidatePairFromReg(state, reg) {
  const key = pairKeyForHalfRegister(reg);
  if (key) {
    state[key] = null;
  }
  if (String(reg ?? '').toLowerCase() === 'a') {
    state.a = null;
  }
}

function afterCallState(state) {
  return {
    ...state,
    a: null,
    bc: null,
    de: null,
    hl: null,
    ix: null,
  };
}

function applyInstructionState(inputState, inst) {
  const state = cloneState(inputState);

  switch (inst?.tag) {
    case 'ld-pair-imm':
      setPair(state, String(inst.pair).toLowerCase(), inst.value);
      break;
    case 'ld-pair-mem':
      setPair(state, String(inst.pair).toLowerCase(), null);
      break;
    case 'ld-pair-indexed':
      setPair(state, String(inst.pair).toLowerCase(), null);
      break;
    case 'ld-ixiy-indexed':
      setPair(state, String(inst.dest).toLowerCase(), null);
      break;
    case 'ld-reg-imm':
    case 'ld-reg-reg':
    case 'ld-reg-ind':
    case 'ld-reg-mem':
    case 'in-reg':
    case 'in0':
      invalidatePairFromReg(state, inst.reg ?? inst.dest);
      break;
    case 'inc-reg':
    case 'dec-reg':
      invalidatePairFromReg(state, inst.reg);
      break;
    case 'ld-sp-hl':
      state.sp = state.hl;
      break;
    case 'ld-sp-pair':
      state.sp = state[String(inst.pair).toLowerCase()] ?? null;
      break;
    case 'inc-pair': {
      const key = String(inst.pair).toLowerCase();
      if (state[key] !== null && state[key] !== undefined) {
        state[key] = (state[key] + 1) & 0xFFFFFF;
      }
      break;
    }
    case 'dec-pair': {
      const key = String(inst.pair).toLowerCase();
      if (state[key] !== null && state[key] !== undefined) {
        state[key] = (state[key] - 1) & 0xFFFFFF;
      }
      break;
    }
    case 'pop':
      setPair(state, String(inst.pair).toLowerCase(), null);
      break;
    case 'ex-de-hl': {
      const hl = state.hl;
      state.hl = state.de;
      state.de = hl;
      break;
    }
    case 'ex-sp-hl':
      state.hl = null;
      break;
    case 'ld-pair-ind':
      setPair(state, String(inst.pair).toLowerCase(), null);
      break;
    case 'ld-special':
      if (String(inst.dest).toLowerCase() === 'a') {
        state.a = null;
      }
      break;
    case 'ld-a-mb':
      state.a = null;
      break;
    default:
      break;
  }

  return state;
}

function addressInRam(addr) {
  return addr >= RAM_START && addr < RAM_END;
}

function resolvePairAddress(state, pairName) {
  const key = String(pairName ?? '').toLowerCase();
  const value = state[key];
  return value === null || value === undefined ? null : (value & 0xFFFFFF);
}

function pushResolvedRef(list, pc, direction, address, via, text) {
  if (address === null || address === undefined) return;
  list.push({
    pc,
    direction,
    address: address & 0xFFFFFF,
    via,
    text,
  });
}

function resolveMemoryRefs(pc, inst, state, text) {
  const refs = [];
  const directAddr = inst?.addr ?? inst?.address;

  if (directAddr !== undefined) {
    switch (inst.tag) {
      case 'ld-reg-mem':
      case 'ld-a-mem':
        pushResolvedRef(refs, pc, 'read', directAddr, 'absolute', text);
        break;
      case 'ld-mem-reg':
      case 'ld-mem-a':
      case 'ld-mem-pair':
        pushResolvedRef(refs, pc, 'write', directAddr, 'absolute', text);
        break;
      case 'ld-pair-mem':
        pushResolvedRef(refs, pc, inst.direction === 'to-mem' ? 'write' : 'read', directAddr, 'absolute', text);
        break;
      default:
        break;
    }
  }

  const hlAddr = resolvePairAddress(state, 'hl');
  const bcAddr = resolvePairAddress(state, 'bc');
  const deAddr = resolvePairAddress(state, 'de');

  switch (inst?.tag) {
    case 'ld-reg-ind':
      if (inst.src === 'hl') pushResolvedRef(refs, pc, 'read', hlAddr, 'HL', text);
      if (inst.src === 'bc') pushResolvedRef(refs, pc, 'read', bcAddr, 'BC', text);
      if (inst.src === 'de') pushResolvedRef(refs, pc, 'read', deAddr, 'DE', text);
      break;
    case 'ld-ind-reg':
      if (inst.dest === 'hl') pushResolvedRef(refs, pc, 'write', hlAddr, 'HL', text);
      if (inst.dest === 'bc') pushResolvedRef(refs, pc, 'write', bcAddr, 'BC', text);
      if (inst.dest === 'de') pushResolvedRef(refs, pc, 'write', deAddr, 'DE', text);
      break;
    case 'ld-ind-imm':
      pushResolvedRef(refs, pc, 'write', hlAddr, 'HL', text);
      break;
    case 'bit-test-ind':
      pushResolvedRef(refs, pc, 'read', hlAddr, 'HL', text);
      break;
    case 'bit-set-ind':
    case 'bit-res-ind':
      pushResolvedRef(refs, pc, 'read/write', hlAddr, 'HL', text);
      break;
    case 'ld-reg-ixd':
      pushResolvedRef(refs, pc, 'read', resolvePairAddress(state, inst.indexRegister) + inst.displacement, String(inst.indexRegister).toUpperCase(), text);
      break;
    case 'ld-ixd-reg':
    case 'ld-ixd-imm':
      pushResolvedRef(refs, pc, 'write', resolvePairAddress(state, inst.indexRegister) + inst.displacement, String(inst.indexRegister).toUpperCase(), text);
      break;
    case 'alu-ixd':
    case 'indexed-cb-bit':
      pushResolvedRef(refs, pc, 'read', resolvePairAddress(state, inst.indexRegister) + inst.displacement, String(inst.indexRegister).toUpperCase(), text);
      break;
    case 'indexed-cb-res':
    case 'indexed-cb-set':
    case 'indexed-cb-rotate':
      pushResolvedRef(refs, pc, 'read/write', resolvePairAddress(state, inst.indexRegister) + inst.displacement, String(inst.indexRegister).toUpperCase(), text);
      break;
    default:
      break;
  }

  return refs.filter((ref) => Number.isFinite(ref.address) && addressInRam(ref.address));
}

function resolvePortOps(pc, inst, state, text) {
  const ports = [];
  if (!inst) return ports;

  switch (inst.tag) {
    case 'in-imm':
      ports.push({ pc, direction: 'in', port: inst.port & 0xFF, via: 'immediate', text });
      break;
    case 'out-imm':
      ports.push({ pc, direction: 'out', port: inst.port & 0xFF, via: 'immediate', text });
      break;
    case 'in0':
      ports.push({ pc, direction: 'in', port: inst.port & 0xFF, via: 'in0', text });
      break;
    case 'out0':
      ports.push({ pc, direction: 'out', port: inst.port & 0xFF, via: 'out0', text });
      break;
    case 'in-reg':
    case 'out-reg': {
      const bc = resolvePairAddress(state, 'bc');
      ports.push({
        pc,
        direction: inst.tag === 'in-reg' ? 'in' : 'out',
        port: bc === null ? null : (bc & 0xFFFF),
        via: bc === null ? '(C) unresolved' : `BC=${hex(bc, 6)}`,
        text,
      });
      break;
    }
    default:
      break;
  }

  return ports;
}

function shouldFollowTarget(entry, target) {
  if (target === undefined || target === null) return false;
  if (target < 0 || target >= EXPECTED_ROM_SIZE) return false;
  return Math.abs(target - entry) <= LOCAL_BRANCH_RADIUS;
}

function safeDecode(rom, pc) {
  try {
    return decodeInstruction(rom, pc, MODE);
  } catch {
    return null;
  }
}

function createRow(pc, inst, bytes, text) {
  return {
    pc,
    inst,
    length: Math.max(1, inst?.length ?? 1),
    bytes,
    text,
    notes: new Set(),
    refs: new Map(),
    ports: new Map(),
    xfers: new Map(),
  };
}

function addRefToRow(row, ref) {
  const key = `${ref.direction}:${ref.address.toString(16)}:${ref.via}`;
  if (!row.refs.has(key)) {
    row.refs.set(key, ref);
  }
}

function addPortToRow(row, portOp) {
  const key = `${portOp.direction}:${portOp.port === null ? 'unknown' : portOp.port.toString(16)}:${portOp.via}`;
  if (!row.ports.has(key)) {
    row.ports.set(key, portOp);
  }
}

function addTransferToRow(row, kind, target) {
  const key = `${kind}:${target.toString(16)}`;
  if (!row.xfers.has(key)) {
    row.xfers.set(key, { kind, target });
  }
}

function analyzeFunction(rom, spec) {
  const visited = new Set();
  const queue = [{ pc: spec.entry, state: createInitialState(), linearExtension: false }];
  const rows = new Map();
  const ramRefs = [];
  const portOps = [];
  const controlTargets = [];
  const edges = [];
  let discoveredBytes = 0;

  while (queue.length && visited.size < MAX_VISITED_INSTRUCTIONS) {
    let { pc, state, linearExtension } = queue.shift();
    let currentState = cloneState(state);

    while (pc >= 0 && pc < rom.length && !visited.has(pc) && visited.size < MAX_VISITED_INSTRUCTIONS) {
      const inst = safeDecode(rom, pc);
      const length = Math.max(1, inst?.length ?? 1);
      const bytes = formatBytes(rom, pc, length);
      const text = inst ? formatInstruction(inst) : `DB ${hex(rom[pc], 2)}`;
      const row = createRow(pc, inst, bytes, text);
      if (linearExtension) {
        row.notes.add('linear-extension');
      }

      const target = getControlTarget(inst);
      if (target !== undefined) {
        const kind = isCallLike(inst) ? 'CALL' : isJumpLike(inst) ? 'JUMP' : 'FLOW';
        controlTargets.push({ pc, kind, target, text });
        addTransferToRow(row, kind, target);
      }

      const refs = resolveMemoryRefs(pc, inst, currentState, text);
      for (const ref of refs) {
        ramRefs.push(ref);
        addRefToRow(row, ref);
      }

      const ports = resolvePortOps(pc, inst, currentState, text);
      for (const portOp of ports) {
        portOps.push(portOp);
        addPortToRow(row, portOp);
      }

      rows.set(pc, row);
      visited.add(pc);
      discoveredBytes += length;

      const nextStateBase = inst ? applyInstructionState(currentState, inst) : cloneState(currentState);
      const fallthrough = inst?.fallthrough ?? inst?.nextPc ?? (pc + length);

      if (!inst) {
        currentState = nextStateBase;
        pc += length;
        continue;
      }

      if (isConditionalFlow(inst)) {
        if (target !== undefined) {
          edges.push({ from: pc, to: target, kind: 'conditional' });
          if (shouldFollowTarget(spec.entry, target) && !visited.has(target)) {
            queue.push({ pc: target, state: cloneState(nextStateBase), linearExtension: false });
          }
        }

        if (isCallLike(inst)) {
          const postCallState = afterCallState(nextStateBase);
          if (!visited.has(fallthrough)) {
            currentState = postCallState;
            pc = fallthrough;
            continue;
          }
          break;
        }

        edges.push({ from: pc, to: fallthrough, kind: 'fallthrough' });
        if (!visited.has(fallthrough)) {
          currentState = nextStateBase;
          pc = fallthrough;
          continue;
        }
        break;
      }

      if (isCallLike(inst)) {
        const postCallState = afterCallState(nextStateBase);
        edges.push({ from: pc, to: fallthrough, kind: 'fallthrough' });
        if (!visited.has(fallthrough)) {
          currentState = postCallState;
          pc = fallthrough;
          continue;
        }
        break;
      }

      if (inst.tag === 'jp' || inst.tag === 'jr') {
        if (target !== undefined) {
          edges.push({ from: pc, to: target, kind: 'jump' });
          if (shouldFollowTarget(spec.entry, target) && !visited.has(target)) {
            currentState = nextStateBase;
            pc = target;
            continue;
          }
        }
        break;
      }

      if (isTerminal(inst)) {
        break;
      }

      if (!visited.has(fallthrough)) {
        edges.push({ from: pc, to: fallthrough, kind: 'fallthrough' });
        currentState = nextStateBase;
        pc = fallthrough;
        continue;
      }
      break;
    }
  }

  if (discoveredBytes < spec.minBytes && rows.size) {
    const sorted = [...rows.values()].sort((left, right) => left.pc - right.pc);
    let pc = sorted[sorted.length - 1].pc + sorted[sorted.length - 1].length;
    let state = createInitialState();
    while (pc < rom.length && discoveredBytes < spec.minBytes && rows.size < MAX_VISITED_INSTRUCTIONS) {
      if (rows.has(pc)) {
        const existing = rows.get(pc);
        pc += existing.length;
        continue;
      }
      const inst = safeDecode(rom, pc);
      const length = Math.max(1, inst?.length ?? 1);
      const bytes = formatBytes(rom, pc, length);
      const text = inst ? formatInstruction(inst) : `DB ${hex(rom[pc], 2)}`;
      const row = createRow(pc, inst, bytes, text);
      row.notes.add('linear-extension');

      const refs = resolveMemoryRefs(pc, inst, state, text);
      for (const ref of refs) {
        ramRefs.push(ref);
        addRefToRow(row, ref);
      }

      const ports = resolvePortOps(pc, inst, state, text);
      for (const portOp of ports) {
        portOps.push(portOp);
        addPortToRow(row, portOp);
      }

      rows.set(pc, row);
      discoveredBytes += length;
      state = inst ? applyInstructionState(state, inst) : state;
      pc += length;
    }
  }

  return {
    ...spec,
    discoveredBytes,
    rows: [...rows.values()].sort((left, right) => left.pc - right.pc),
    ramRefs,
    portOps,
    controlTargets,
    edges,
  };
}

function summarizeRamRefs(refs) {
  const unique = new Map();
  for (const ref of refs) {
    const key = `${ref.pc.toString(16)}:${ref.direction}:${ref.address.toString(16)}:${ref.via}`;
    if (!unique.has(key)) {
      unique.set(key, ref);
    }
  }
  return [...unique.values()].sort((left, right) => {
    if (left.address !== right.address) return left.address - right.address;
    if (left.pc !== right.pc) return left.pc - right.pc;
    return left.direction.localeCompare(right.direction);
  });
}

function summarizePortOps(ops) {
  const unique = new Map();
  for (const op of ops) {
    const key = `${op.pc.toString(16)}:${op.direction}:${op.port === null ? 'unknown' : op.port.toString(16)}:${op.via}`;
    if (!unique.has(key)) {
      unique.set(key, op);
    }
  }
  return [...unique.values()].sort((left, right) => left.pc - right.pc);
}

function summarizeControlTargets(targets) {
  const unique = new Map();
  for (const target of targets) {
    const key = `${target.kind}:${target.target.toString(16)}:${target.pc.toString(16)}`;
    if (!unique.has(key)) {
      unique.set(key, target);
    }
  }
  return [...unique.values()].sort((left, right) => {
    if (left.target !== right.target) return left.target - right.target;
    return left.pc - right.pc;
  });
}

function summarizeLoops(edges) {
  const loops = new Map();
  for (const edge of edges) {
    if (edge.to <= edge.from) {
      const key = `${edge.from.toString(16)}:${edge.to.toString(16)}:${edge.kind}`;
      if (!loops.has(key)) {
        loops.set(key, edge);
      }
    }
  }
  return [...loops.values()].sort((left, right) => {
    if (left.to !== right.to) return left.to - right.to;
    return left.from - right.from;
  });
}

function findReferencesInReport(report, target) {
  const hits = [];
  for (const row of report.rows) {
    const inst = row.inst;
    if (!inst) continue;
    if (inst.tag === 'ld-pair-imm' && String(inst.pair).toLowerCase() === 'iy' && inst.value === target) {
      hits.push({ pc: row.pc, kind: 'load-iy', text: row.text });
    }
    if (getControlTarget(inst) === target) {
      hits.push({ pc: row.pc, kind: isCallLike(inst) ? 'control-call' : 'control-jump', text: row.text });
    }
    for (const ref of row.refs.values()) {
      if (ref.address === target) {
        hits.push({ pc: row.pc, kind: ref.direction, text: row.text });
      }
    }
  }
  return hits.sort((left, right) => left.pc - right.pc);
}

function scanControlRefs(rom, target) {
  const refs = [];
  const b0 = target & 0xFF;
  const b1 = (target >>> 8) & 0xFF;
  const b2 = (target >>> 16) & 0xFF;

  for (let pc = 0; pc <= rom.length - 4; pc += 1) {
    const opcode = rom[pc] & 0xFF;
    if (!CALL_JP_OPCODE_NAMES.has(opcode)) continue;
    if (rom[pc + 1] !== b0 || rom[pc + 2] !== b1 || rom[pc + 3] !== b2) continue;

    const inst = safeDecode(rom, pc);
    if (!inst || inst.target !== target) continue;
    if (!isCallLike(inst) && !(inst.tag === 'jp' || inst.tag === 'jp-conditional' || inst.tag === 'jp-cond')) continue;

    refs.push({
      pc,
      kind: CALL_JP_OPCODE_NAMES.get(opcode),
      text: formatInstruction(inst),
    });
  }

  return refs;
}

function printInstructionListing(report) {
  console.log(`Instruction listing (${count(report.rows.length)} instructions, ${count(report.discoveredBytes)} bytes covered):`);
  for (const row of report.rows) {
    const { mnemonic, operands } = splitInstruction(row.text);
    const notes = [];

    for (const xfer of row.xfers.values()) {
      const label = symbolLabel(xfer.target);
      notes.push(`${xfer.kind} ${hex(xfer.target)}${label ? ` (${label})` : ''}`);
    }
    for (const ref of row.refs.values()) {
      const label = symbolLabel(ref.address);
      notes.push(`${ref.direction} ${hex(ref.address)}${label ? ` (${label})` : ''}${ref.via ? ` via ${ref.via}` : ''}`);
    }
    for (const port of row.ports.values()) {
      const portText = port.port === null ? 'unresolved' : hex(port.port, port.port <= 0xFF ? 2 : 4);
      notes.push(`${port.direction} port ${portText}${port.via ? ` [${port.via}]` : ''}`);
    }
    for (const note of row.notes) {
      notes.push(note);
    }

    console.log(
      `  ${hex(row.pc)}  ${row.bytes.padEnd(18)}  ${mnemonic.padEnd(8)} ${operands.padEnd(30)}${notes.length ? ` ; ${notes.join(' | ')}` : ''}`,
    );
  }
  console.log('');
}

function printRamSummary(report) {
  const refs = summarizeRamRefs(report.ramRefs);
  console.log('RAM addresses read/written:');
  if (!refs.length) {
    console.log('  (none)');
    console.log('');
    return;
  }

  for (const ref of refs) {
    const label = symbolLabel(ref.address);
    console.log(`  ${hex(ref.pc)}  ${ref.direction.padEnd(10)} ${hex(ref.address)}${label ? ` (${label})` : ''}  ${ref.text}`);
  }
  console.log('');
}

function printControlSummary(report) {
  const targets = summarizeControlTargets(report.controlTargets);
  console.log('CALL/JP targets observed inside the walked region:');
  if (!targets.length) {
    console.log('  (none)');
    console.log('');
    return;
  }

  for (const item of targets) {
    const label = symbolLabel(item.target);
    console.log(`  ${hex(item.pc)}  ${item.kind.padEnd(5)} ${hex(item.target)}${label ? ` (${label})` : ''}  ${item.text}`);
  }
  console.log('');
}

function printPortSummary(report) {
  const ops = summarizePortOps(report.portOps);
  console.log('Port I/O operations:');
  if (!ops.length) {
    console.log('  (none)');
    console.log('');
    return;
  }

  for (const op of ops) {
    const portText = op.port === null ? 'unresolved' : hex(op.port, op.port <= 0xFF ? 2 : 4);
    console.log(`  ${hex(op.pc)}  ${op.direction.toUpperCase().padEnd(3)} ${portText.padEnd(8)} ${op.text}${op.via ? `  [${op.via}]` : ''}`);
  }
  console.log('');
}

function printLoopSummary(report) {
  const loops = summarizeLoops(report.edges);
  console.log('Loop structures detected:');
  if (!loops.length) {
    console.log('  (none)');
    console.log('');
    return;
  }

  for (const loop of loops) {
    console.log(`  ${hex(loop.from)} -> ${hex(loop.to)}  ${loop.kind}`);
  }
  console.log('');
}

function printFunctionReport(report) {
  console.log('='.repeat(110));
  console.log(`${report.name}`);
  console.log(`Entry: ${hex(report.entry)}  Mode: ${MODE.toUpperCase()}  Minimum requested bytes: ${count(report.minBytes)}`);
  console.log('='.repeat(110));
  printInstructionListing(report);
  printRamSummary(report);
  printControlSummary(report);
  printPortSummary(report);
  printLoopSummary(report);
}

function printKeyAcceptedAnnotations(report) {
  console.log('='.repeat(110));
  console.log('Key-accepted path annotations (known RAM addresses referenced)');
  console.log('='.repeat(110));

  const knownAddrs = [0xD00587, 0xD0058C, 0xD0058E, 0xD007E0, 0xD00080];
  for (const addr of knownAddrs) {
    const hits = findReferencesInReport(report, addr);
    const label = symbolLabel(addr);
    console.log(`${hex(addr)}${label ? ` (${label})` : ''}: ${hits.length ? `${hits.length} reference(s)` : 'no direct reference found'}`);
    if (hits.length) {
      for (const hit of hits) {
        console.log(`  ${hex(hit.pc)}  ${hit.kind.padEnd(12)} ${hit.text}`);
      }
    }
  }

  console.log('');

  const knownTargets = [0x030300, 0x02FE73, 0x02FECF, 0x03FA09, 0x040D40];
  console.log('Known code targets referenced:');
  for (const addr of knownTargets) {
    const hits = findReferencesInReport(report, addr);
    const label = symbolLabel(addr);
    console.log(`${hex(addr)}${label ? ` (${label})` : ''}: ${hits.length ? `${hits.length} reference(s)` : 'no direct reference found'}`);
    if (hits.length) {
      for (const hit of hits) {
        console.log(`  ${hex(hit.pc)}  ${hit.kind.padEnd(12)} ${hit.text}`);
      }
    }
  }
  console.log('');
}

function printRomWideXrefs(rom, target) {
  const refs = scanControlRefs(rom, target);
  const label = symbolLabel(target);
  console.log('='.repeat(110));
  console.log(`ROM-wide CALL/JP references to ${hex(target)}${label ? ` (${label})` : ''}`);
  console.log('='.repeat(110));
  console.log(`Count: ${count(refs.length)}`);
  if (!refs.length) {
    console.log('  (none)');
    console.log('');
    return;
  }

  for (const ref of refs) {
    console.log(`  ${hex(ref.pc)}  ${ref.kind.padEnd(8)} ${ref.text}`);
  }
  console.log('');
}

function printSummary(report) {
  console.log('='.repeat(110));
  console.log('SUMMARY: What happens to the accepted key at 0x03FB9A');
  console.log('='.repeat(110));

  const callTargets = report.controlTargets.filter((t) => t.kind === 'CALL');
  const jumpTargets = report.controlTargets.filter((t) => t.kind === 'JUMP');

  console.log(`Total instructions disassembled: ${count(report.rows.length)}`);
  console.log(`Total bytes covered: ${count(report.discoveredBytes)}`);
  console.log(`CALL targets: ${callTargets.length}`);
  for (const t of callTargets) {
    const label = symbolLabel(t.target);
    console.log(`  ${hex(t.pc)} -> CALL ${hex(t.target)}${label ? ` (${label})` : ''}`);
  }
  console.log(`JUMP targets: ${jumpTargets.length}`);
  for (const t of jumpTargets) {
    const label = symbolLabel(t.target);
    console.log(`  ${hex(t.pc)} -> JP ${hex(t.target)}${label ? ` (${label})` : ''}`);
  }

  const ramAddrs = new Set(report.ramRefs.map((r) => r.address));
  console.log(`Unique RAM addresses touched: ${ramAddrs.size}`);
  for (const addr of [...ramAddrs].sort((a, b) => a - b)) {
    const label = symbolLabel(addr);
    console.log(`  ${hex(addr)}${label ? ` (${label})` : ''}`);
  }

  const loops = summarizeLoops(report.edges);
  if (loops.length) {
    console.log(`Loop structures: ${loops.length}`);
    for (const loop of loops) {
      console.log(`  ${hex(loop.from)} -> ${hex(loop.to)}  ${loop.kind}`);
    }
  } else {
    console.log('Loop structures: none');
  }

  console.log('');
}

function main() {
  if (!fs.existsSync(ROM_PATH)) {
    throw new Error(`Missing ROM at ${ROM_PATH}`);
  }

  const rom = fs.readFileSync(ROM_PATH);
  if (rom.length !== EXPECTED_ROM_SIZE) {
    throw new Error(`Expected ROM size ${EXPECTED_ROM_SIZE}, got ${rom.length}`);
  }

  console.log('Phase 398 - Trace 0x03FB9A Key-Accepted Path');
  console.log(`ROM path: ${ROM_PATH}`);
  console.log(`ROM size: ${count(rom.length)} bytes (${hex(rom.length, 8)})`);
  console.log(`Assumed OS IY base: ${hex(OS_IY_BASE)}`);
  console.log('');

  const reports = FUNCTION_SPECS.map((spec) => analyzeFunction(rom, spec));

  for (const report of reports) {
    printFunctionReport(report);
  }

  const keyAcceptedReport = reports.find((report) => report.entry === 0x03FB9A);
  if (keyAcceptedReport) {
    printKeyAcceptedAnnotations(keyAcceptedReport);
  }

  printRomWideXrefs(rom, 0x03FB9A);

  if (keyAcceptedReport) {
    printSummary(keyAcceptedReport);
  }
}

main();
