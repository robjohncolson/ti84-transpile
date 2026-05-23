#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};
const { decodeInstruction } = await import('./ez80-decoder.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const ENTRY = 0x0151FE;
const MAX_BYTES = 300;
const MAX_INSTRUCTIONS = 128;

const CODE_LABELS = new Map([
  [0x0004DC, 'jump-table JP stub for 0x0151FE'],
  [0x00218A, 'common IX stack-frame prologue helper'],
  [0x015185, 'completion callback installed into D17770'],
  [0x0155BC, 'notification wrapper sibling A'],
  [0x01567C, 'notification wrapper sibling B'],
]);

const CALLER_HINTS = new Map([
  [0x0004DC, 'Jump-table export; likely a standalone vector/syscall entry for this helper.'],
  [0x015611, 'Called from wrapper 0x0155BC after PUSH (IY+0x0A).'],
  [0x0156C8, 'Called from wrapper 0x01567C after PUSH mem[D17792].'],
]);

const RAM_LABELS = new Map([
  [0xD14038, 'global notification/link context source'],
  [0xD17770, 'staged callback pointer slot'],
  [0xD17773, 'staged callback argument slot'],
  [0xD17776, 'staged context mirror slot'],
  [0xD17779, 'notification active/armed flag'],
  [0xD1777A, 'notification completion/state byte'],
]);

function hex(value, width = 6) {
  return '0x' + (Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function raw(pc, length) {
  return Array.from(
    rom.subarray(pc, pc + length),
    byte => byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function formatIndexed(indexRegister, displacement) {
  const sign = displacement < 0 ? '-' : '+';
  return `(${String(indexRegister).toUpperCase()}${sign}${hex(Math.abs(displacement), 2)})`;
}

function safeDecode(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch {
    return {
      pc,
      length: 1,
      nextPc: pc + 1,
      tag: 'db',
      value: rom[pc] ?? 0,
    };
  }
}

function formatInstruction(inst) {
  const u = value => String(value).toUpperCase();

  switch (inst.tag) {
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${u(inst.condition)},${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${u(inst.condition)},${hex(inst.target)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${u(inst.condition)},${hex(inst.target)}`;
    case 'ret':
      return 'RET';
    case 'reti':
      return 'RETI';
    case 'retn':
      return 'RETN';
    case 'push':
      return `PUSH ${u(inst.pair)}`;
    case 'pop':
      return `POP ${u(inst.pair)}`;
    case 'push-idx':
      return `PUSH ${u(inst.indexRegister)}`;
    case 'pop-idx':
      return `POP ${u(inst.indexRegister)}`;
    case 'ld-pair-imm':
      return `LD ${u(inst.pair)},${hex(inst.value)}`;
    case 'ld-pair-mem':
      return `LD ${u(inst.pair)},(${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `LD (${hex(inst.addr)}),${u(inst.pair)}`;
    case 'ld-reg-imm':
      return `LD ${u(inst.dest)},${hex(inst.value, 2)}`;
    case 'ld-reg-mem':
      return `LD ${u(inst.dest)},(${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}),${u(inst.src)}`;
    case 'ld-reg-reg':
      return `LD ${u(inst.dest)},${u(inst.src)}`;
    case 'ld-pair-indexed':
      return `LD ${u(inst.pair)},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixiy-indexed':
      return `LD ${u(inst.dest)},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-reg-ixd':
      return `LD ${u(inst.dest)},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixd-reg':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${u(inst.src)}`;
    case 'ld-ixd-imm':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${hex(inst.value, 2)}`;
    case 'ld-sp-pair':
      return `LD SP,${u(inst.pair)}`;
    case 'inc-pair':
      return `INC ${u(inst.pair)}`;
    case 'dec-pair':
      return `DEC ${u(inst.pair)}`;
    case 'inc-reg':
      return `INC ${u(inst.reg)}`;
    case 'dec-reg':
      return `DEC ${u(inst.reg)}`;
    case 'alu-reg':
      return `${u(inst.op)} ${u(inst.src)}`;
    case 'alu-imm':
      return `${u(inst.op)} ${hex(inst.value, 2)}`;
    case 'add-pair':
      return `ADD HL,${u(inst.src ?? inst.pair)}`;
    case 'sbc-pair':
      return `SBC HL,${u(inst.src)}`;
    case 'lea':
      return `LEA ${u(inst.dest)},${u(inst.base)}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}`;
    case 'di':
      return 'DI';
    case 'ei':
      return 'EI';
    case 'nop':
      return 'NOP';
    case 'xor-a':
      return 'XOR A';
    case 'or-a':
      return 'OR A';
    case 'in0':
      return `IN0 ${u(inst.reg)},(${hex(inst.port, 2)})`;
    case 'out0':
      return `OUT0 (${hex(inst.port, 2)}),${u(inst.reg)}`;
    case 'indexed-cb-test':
      return `BIT ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `RES ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'db':
      return `DB ${hex(inst.value, 2)}`;
    default:
      return `[${inst.tag}]`;
  }
}

function disassembleUntilRet(entry, maxBytes = MAX_BYTES, maxInstructions = MAX_INSTRUCTIONS) {
  const instructions = [];
  let pc = entry;

  while (pc < rom.length && pc < entry + maxBytes && instructions.length < maxInstructions) {
    const inst = safeDecode(pc);
    instructions.push(inst);
    pc = inst.nextPc;
    if (inst.tag === 'ret' || inst.tag === 'reti' || inst.tag === 'retn') {
      break;
    }
  }

  return instructions;
}

function cloneValue(value) {
  return value ? { ...value } : null;
}

function makeState() {
  return {
    a: null,
    bc: null,
    de: null,
    hl: null,
    ix: null,
    iy: null,
  };
}

function indexedSource(state, reg, displacement) {
  const base = state[reg];
  if (base && base.kind === 'imm') {
    return { kind: 'mem', addr: (base.value + displacement) & 0xFFFFFF };
  }
  return { kind: 'indexed', reg, displacement };
}

function getRegisterValue(state, reg) {
  if (reg === 'a') return state.a;
  if (reg === 'bc') return state.bc;
  if (reg === 'de') return state.de;
  if (reg === 'hl') return state.hl;
  if (reg === 'ix') return state.ix;
  if (reg === 'iy') return state.iy;
  return null;
}

function updateState(state, inst) {
  const next = {
    a: cloneValue(state.a),
    bc: cloneValue(state.bc),
    de: cloneValue(state.de),
    hl: cloneValue(state.hl),
    ix: cloneValue(state.ix),
    iy: cloneValue(state.iy),
  };

  switch (inst.tag) {
    case 'ld-pair-imm':
      if (inst.pair in next) next[inst.pair] = { kind: 'imm', value: inst.value };
      break;
    case 'ld-pair-mem':
      if (inst.pair in next) next[inst.pair] = { kind: 'mem', addr: inst.addr };
      break;
    case 'ld-pair-indexed':
      if (inst.pair in next) next[inst.pair] = indexedSource(next, inst.indexRegister, inst.displacement);
      break;
    case 'ld-ixiy-indexed':
      if (inst.dest in next) next[inst.dest] = indexedSource(next, inst.indexRegister, inst.displacement);
      break;
    case 'ld-reg-imm':
      if (inst.dest === 'a') next.a = { kind: 'imm', value: inst.value };
      break;
    case 'ld-reg-mem':
      if (inst.dest === 'a') next.a = { kind: 'mem', addr: inst.addr };
      break;
    case 'ld-reg-reg':
      if (inst.dest === 'a') next.a = getRegisterValue(next, inst.src);
      break;
    case 'alu-reg':
      if (inst.op === 'xor' && inst.src === 'a') {
        next.a = { kind: 'imm', value: 0 };
      } else if (!(inst.op === 'or' && inst.src === 'a')) {
        next.a = null;
      }
      break;
    case 'xor-a':
      next.a = { kind: 'imm', value: 0 };
      break;
    case 'or-a':
      break;
    case 'call':
    case 'call-conditional':
      next.a = null;
      next.bc = null;
      next.de = null;
      next.hl = null;
      break;
    default:
      break;
  }

  return next;
}

function formatSource(value) {
  if (!value) return '?';
  if (value.kind === 'imm') {
    const label = CODE_LABELS.get(value.value);
    return label ? `${hex(value.value)} (${label})` : hex(value.value);
  }
  if (value.kind === 'mem') {
    const label = RAM_LABELS.get(value.addr);
    return label ? `mem[${hex(value.addr)}] (${label})` : `mem[${hex(value.addr)}]`;
  }
  if (value.kind === 'indexed') {
    return formatIndexed(value.reg, value.displacement);
  }
  return JSON.stringify(value);
}

function labelForRam(addr) {
  return RAM_LABELS.get(addr) ?? '';
}

function collectTrace(instructions) {
  const absoluteRamRefs = [];
  const indexedRefs = [];
  const trackedWrites = [];
  const callTargets = [];
  const portIO = [];

  let state = makeState();

  for (const inst of instructions) {
    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      callTargets.push({
        pc: hex(inst.pc),
        target: hex(inst.target),
        label: CODE_LABELS.get(inst.target) ?? '',
      });
    }

    if (inst.tag === 'in0' || inst.tag === 'out0') {
      portIO.push({
        pc: hex(inst.pc),
        type: inst.tag.toUpperCase(),
        port: hex(inst.port, 2),
        register: String(inst.reg).toUpperCase(),
      });
    }

    if (inst.tag === 'ld-pair-indexed' || inst.tag === 'ld-ixiy-indexed' || inst.tag === 'ld-reg-ixd') {
      indexedRefs.push({
        pc: hex(inst.pc),
        type: 'read',
        operand: formatIndexed(inst.indexRegister, inst.displacement),
        via: formatInstruction(inst),
      });
    }

    if (inst.tag === 'ld-ixd-reg' || inst.tag === 'ld-ixd-imm') {
      indexedRefs.push({
        pc: hex(inst.pc),
        type: 'write',
        operand: formatIndexed(inst.indexRegister, inst.displacement),
        via: formatInstruction(inst),
      });
    }

    if (inst.tag === 'ld-pair-mem' && inst.addr >= 0xD00000) {
      absoluteRamRefs.push({
        pc: hex(inst.pc),
        type: 'read',
        addr: hex(inst.addr),
        label: labelForRam(inst.addr),
        via: formatInstruction(inst),
      });
    }

    if (inst.tag === 'ld-reg-mem' && inst.addr >= 0xD00000) {
      absoluteRamRefs.push({
        pc: hex(inst.pc),
        type: 'read',
        addr: hex(inst.addr),
        label: labelForRam(inst.addr),
        via: formatInstruction(inst),
      });
    }

    if (inst.tag === 'ld-mem-pair' && inst.addr >= 0xD00000) {
      absoluteRamRefs.push({
        pc: hex(inst.pc),
        type: 'write',
        addr: hex(inst.addr),
        label: labelForRam(inst.addr),
        via: formatInstruction(inst),
      });
      trackedWrites.push({
        pc: hex(inst.pc),
        addr: hex(inst.addr),
        label: labelForRam(inst.addr),
        source: formatSource(getRegisterValue(state, inst.pair)),
      });
    }

    if (inst.tag === 'ld-mem-reg' && inst.addr >= 0xD00000) {
      absoluteRamRefs.push({
        pc: hex(inst.pc),
        type: 'write',
        addr: hex(inst.addr),
        label: labelForRam(inst.addr),
        via: formatInstruction(inst),
      });
      trackedWrites.push({
        pc: hex(inst.pc),
        addr: hex(inst.addr),
        label: labelForRam(inst.addr),
        source: formatSource(getRegisterValue(state, inst.src)),
      });
    }

    state = updateState(state, inst);
  }

  return { absoluteRamRefs, indexedRefs, trackedWrites, callTargets, portIO };
}

function findBytePattern(bytes) {
  const hits = [];

  for (let i = 0; i <= rom.length - bytes.length; i++) {
    let matched = true;
    for (let j = 0; j < bytes.length; j++) {
      if (rom[i + j] !== bytes[j]) {
        matched = false;
        break;
      }
    }
    if (matched) hits.push(i);
  }

  return hits;
}

function findCallers(target) {
  const b0 = target & 0xFF;
  const b1 = (target >> 8) & 0xFF;
  const b2 = (target >> 16) & 0xFF;

  return [
    ...findBytePattern([0xCD, b0, b1, b2]).map(addr => ({ addr, type: 'CALL' })),
    ...findBytePattern([0xC3, b0, b1, b2]).map(addr => ({ addr, type: 'JP' })),
  ]
    .sort((left, right) => left.addr - right.addr)
    .map(hit => ({
      pc: hex(hit.addr),
      type: hit.type,
      contextBytes: raw(Math.max(0, hit.addr - 8), 20),
      hint: CALLER_HINTS.get(hit.addr) ?? '',
    }));
}

const rom = fs.readFileSync(ROM_PATH);
const instructions = disassembleUntilRet(ENTRY);
const last = instructions.at(-1);
const decodedBytes = last ? last.nextPc - ENTRY : 0;
const trace = collectTrace(instructions);
const callers = findCallers(ENTRY);

const summary = {
  probe: 'phase413-trace-0151FE',
  rom: path.relative(process.cwd(), ROM_PATH).replace(/\\/g, '/'),
  target: hex(ENTRY),
  decodedBytes,
  instructionCount: instructions.length,
  stopReason: last && (last.tag === 'ret' || last.tag === 'reti' || last.tag === 'retn')
    ? `return at ${hex(last.pc)}`
    : `stopped at ${MAX_BYTES} byte cap`,
  absoluteRamRefs: trace.absoluteRamRefs,
  indexedOperandRefs: trace.indexedRefs,
  trackedWrites: trace.trackedWrites,
  callTargets: trace.callTargets,
  portIO: trace.portIO,
  callers,
  stagedCallback: {
    slot: hex(0xD17770),
    target: hex(0x015185),
    note: 'Installed as data, not directly called by 0x0151FE.',
  },
};

console.log('======================================================================');
console.log('Phase 413: Trace 0x0151FE (Pre-Delivery Setup Helper)');
console.log('======================================================================');
console.log(JSON.stringify(summary, null, 2));
console.log('');
console.log(`Disassembly of ${hex(ENTRY)} until RET:`);
for (const inst of instructions) {
  console.log(`${hex(inst.pc)}  ${raw(inst.pc, inst.length).padEnd(18)}  ${formatInstruction(inst)}`);
}
console.log('');
console.log('Interpretation Notes:');
console.log('- 0x0151FE performs no USB/link port I/O; its body is pure call + state staging.');
console.log('- The first explicit argument is loaded from (IX+0x06) after the common 0x00218A prologue helper sets up an IX frame.');
console.log('- D17779 is cleared before the D17770/D17773/D17776 block is populated, then set to 1 last. That ordering suggests an "armed/valid" publication flag.');
console.log('- The helper also clears D1777A before arming the block, which pairs cleanly with the staged callback 0x015185 later setting D1777A to 1.');
