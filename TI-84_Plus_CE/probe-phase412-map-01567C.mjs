#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};
const { decodeInstruction } = await import('./ez80-decoder.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');

const ENTRY = 0x01567C;
const COMPARE_ENTRY = 0x02B373;
const RAW_DUMP_BYTES = 0x100;
const WATCH_FIELDS = [
  0xD143E7,
  0xD143EA,
  0xD143ED,
  0xD143F6,
  0xD143F9,
  0xD143FC,
  0xD143FF,
  0xD14402,
];
const WATCH_ADDRS = [
  { addr: 0xD143E7, label: 'descriptor +0x00' },
  { addr: 0xD143EA, label: 'descriptor +0x03' },
  { addr: 0xD143ED, label: 'descriptor +0x06' },
  { addr: 0xD143F6, label: 'descriptor +0x0F' },
  { addr: 0xD143F9, label: 'descriptor +0x12' },
  { addr: 0xD143FC, label: 'descriptor +0x15' },
  { addr: 0xD143FF, label: 'descriptor +0x18' },
  { addr: 0xD14402, label: 'descriptor +0x1B' },
  { addr: 0xD177B7, label: 'usbInited sentinel 0x55' },
  { addr: 0xD14073, label: 'enabled flag' },
  { addr: 0xD14084, label: 'busy flag' },
  { addr: 0xD1440E, label: 'lock flag' },
];

const FIELD_LABELS = new Map([
  [0xD143E7, 'callback slot 0'],
  [0xD143EA, 'callback slot 1 / hook'],
  [0xD143ED, 'payload pointer'],
  [0xD143F6, 'length / limit'],
  [0xD143F9, 'reserved 0'],
  [0xD143FC, 'aux field'],
  [0xD143FF, 'type / state byte'],
  [0xD14402, 'tail / reserved'],
]);

const CODE_LABELS = new Map([
  [0x00049C, 'jump-table vector entry 167'],
  [0x0004A0, 'syscall vector for 0x00F5B0'],
  [0x00883C, 'dispatch_key low-ROM dispatcher'],
  [0x00F5B0, 'notification delivery handler'],
  [0x00FB6E, 'vector 169 completion/indirect callback dispatcher'],
  [0x011555, 'mid-ROM caller'],
  [0x0121EF, 'menu/app hook target'],
  [0x01336E, 'USB worker A caller'],
  [0x014E3F, 'notification state installer'],
  [0x0151FE, 'notification state staging helper'],
  [0x015542, 'status-to-callback selector'],
  [0x01567C, 'target wrapper'],
  [0x02B373, 'secondary key-state wrapper'],
]);

const CALL_NOTES = new Map([
  [0x0151FE, 'stages D1777x notification state before delivery'],
  [0x00F5B0, 'direct call to the delivery handler; same target as syscall 0x0004A0'],
  [0x00883C, 'dispatch_key follow-up; called with two hardcoded argument pairs'],
  [0x015542, 'status code is pushed, then this selector/helper is called'],
]);

const CALLER_NOTES = new Map([
  [0x00049C, 'JP stub in the jump table: entry 167 exports 0x01567C'],
  [0x011555, 'mid-ROM caller reached after D176F2 / 0xCCCC / 0xCCCD checks'],
  [0x01336E, 'USB receive worker A calls here immediately after D17795 := 4'],
]);

const rom = fs.readFileSync(ROM_PATH);

function hex(value, width = 6) {
  return '0x' + (Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function raw(pc, length) {
  return Array.from(rom.subarray(pc, pc + length), byte => byte.toString(16).toUpperCase().padStart(2, '0')).join(' ');
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

function formatIndexed(reg, displacement) {
  const sign = displacement < 0 ? '-' : '+';
  return `(${String(reg).toUpperCase()}${sign}${hex(Math.abs(displacement), 2)})`;
}

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${String(inst.condition).toUpperCase()},${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${String(inst.condition).toUpperCase()},${hex(inst.target)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${String(inst.condition).toUpperCase()},${hex(inst.target)}`;
    case 'ret':
      return 'RET';
    case 'reti':
      return 'RETI';
    case 'retn':
      return 'RETN';
    case 'push':
      return `PUSH ${String(inst.pair).toUpperCase()}`;
    case 'pop':
      return `POP ${String(inst.pair).toUpperCase()}`;
    case 'ld-pair-imm':
      return `LD ${String(inst.pair).toUpperCase()},${hex(inst.value)}`;
    case 'ld-pair-mem':
      return `LD ${String(inst.pair).toUpperCase()},(${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `LD (${hex(inst.addr)}),${String(inst.pair).toUpperCase()}`;
    case 'ld-reg-imm':
      return `LD ${String(inst.dest).toUpperCase()},${hex(inst.value, 2)}`;
    case 'ld-reg-mem':
      return `LD ${String(inst.dest).toUpperCase()},(${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}),${String(inst.src).toUpperCase()}`;
    case 'ld-reg-reg':
      return `LD ${String(inst.dest).toUpperCase()},${String(inst.src).toUpperCase()}`;
    case 'ld-pair-indexed':
      return `LD ${String(inst.pair).toUpperCase()},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-indexed-pair':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${String(inst.pair).toUpperCase()}`;
    case 'ld-ixd-imm':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${hex(inst.value, 2)}`;
    case 'ld-ixd-reg':
      return `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${String(inst.src).toUpperCase()}`;
    case 'ld-reg-ixd':
      return `LD ${String(inst.dest).toUpperCase()},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-ixiy-indexed':
      return `LD ${String(inst.dest).toUpperCase()},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'ld-sp-pair':
      return `LD SP,${String(inst.pair).toUpperCase()}`;
    case 'inc-pair':
      return `INC ${String(inst.pair).toUpperCase()}`;
    case 'dec-pair':
      return `DEC ${String(inst.pair).toUpperCase()}`;
    case 'alu-reg':
      return `${String(inst.op).toUpperCase()} ${String(inst.src).toUpperCase()}`;
    case 'alu-imm':
      return `${String(inst.op).toUpperCase()} ${hex(inst.value, 2)}`;
    case 'sbc-pair':
      return `SBC HL,${String(inst.src).toUpperCase()}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `RES ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-test':
      return `BIT ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`;
    case 'di':
      return 'DI';
    case 'ei':
      return 'EI';
    case 'nop':
      return 'NOP';
    case 'db':
      return `DB ${hex(inst.value, 2)}`;
    default:
      return inst.tag;
  }
}

function disassembleUntilRet(entry, maxBytes = 0x400, maxInstructions = 256) {
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

function cloneValue(value) {
  return value ? { ...value } : null;
}

function bumpValue(value, delta) {
  if (!value || value.kind !== 'imm') return null;
  return { kind: 'imm', value: (value.value + delta) & 0xFFFFFF };
}

function indexedSource(state, reg, displacement) {
  const base = state[reg];
  if (base && base.kind === 'imm') {
    return { kind: 'mem', addr: (base.value + displacement) & 0xFFFFFF };
  }
  return { kind: 'indexed', reg, displacement };
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
    case 'alu-reg':
      if (inst.op === 'xor' && inst.src === 'a') next.a = { kind: 'imm', value: 0 };
      else if (!(inst.op === 'or' && inst.src === 'a')) next.a = null;
      break;
    case 'inc-pair':
      if (inst.pair in next) next[inst.pair] = bumpValue(next[inst.pair], 1);
      break;
    case 'dec-pair':
      if (inst.pair in next) next[inst.pair] = bumpValue(next[inst.pair], -1);
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

function collectRamRefs(instructions) {
  const refs = [];
  let state = makeState();

  for (const inst of instructions) {
    if (inst.tag === 'ld-pair-mem' && inst.addr >= 0xD00000) {
      refs.push({ pc: inst.pc, kind: 'read', addr: inst.addr, text: formatInstruction(inst) });
    }
    if (inst.tag === 'ld-reg-mem' && inst.addr >= 0xD00000) {
      refs.push({ pc: inst.pc, kind: 'read', addr: inst.addr, text: formatInstruction(inst) });
    }
    if (inst.tag === 'ld-mem-pair' && inst.addr >= 0xD00000) {
      refs.push({ pc: inst.pc, kind: 'write', addr: inst.addr, text: formatInstruction(inst) });
    }
    if (inst.tag === 'ld-mem-reg' && inst.addr >= 0xD00000) {
      refs.push({ pc: inst.pc, kind: 'write', addr: inst.addr, text: formatInstruction(inst) });
    }
    if ((inst.tag === 'indexed-cb-set' || inst.tag === 'indexed-cb-res' || inst.tag === 'indexed-cb-test')) {
      const base = state[inst.indexRegister];
      if (base && base.kind === 'imm') {
        const addr = (base.value + inst.displacement) & 0xFFFFFF;
        if (addr >= 0xD00000) {
          const kind = inst.tag === 'indexed-cb-test' ? 'read' : 'write';
          refs.push({ pc: inst.pc, kind, addr, text: formatInstruction(inst) });
        }
      }
    }
    state = updateState(state, inst);
  }

  return refs;
}

function resolveFieldWrites(entry) {
  const instructions = disassembleUntilRet(entry);
  const fields = new Map();
  let state = { a: null, bc: null };

  for (const inst of instructions) {
    if (inst.tag === 'ld-pair-imm' && inst.pair === 'bc') {
      state.bc = { kind: 'imm', value: inst.value };
    } else if (inst.tag === 'ld-pair-mem' && inst.pair === 'bc') {
      state.bc = { kind: 'mem', addr: inst.addr };
    } else if (inst.tag === 'ld-reg-imm' && inst.dest === 'a') {
      state.a = { kind: 'imm', value: inst.value };
    } else if (inst.tag === 'ld-reg-mem' && inst.dest === 'a') {
      state.a = { kind: 'mem', addr: inst.addr };
    } else if (inst.tag === 'alu-reg' && inst.op === 'xor' && inst.src === 'a') {
      state.a = { kind: 'imm', value: 0 };
    }

    if (inst.tag === 'ld-mem-pair' && inst.pair === 'bc' && WATCH_FIELDS.includes(inst.addr)) {
      fields.set(inst.addr, cloneValue(state.bc));
    }
    if (inst.tag === 'ld-mem-reg' && inst.src === 'a' && WATCH_FIELDS.includes(inst.addr)) {
      fields.set(inst.addr, cloneValue(state.a));
    }
  }

  return fields;
}

function formatSource(value) {
  if (!value) return '?';
  if (value.kind === 'imm') {
    const suffix = CODE_LABELS.has(value.value) ? ` (${CODE_LABELS.get(value.value)})` : '';
    return `${hex(value.value)}${suffix}`;
  }
  if (value.kind === 'mem') {
    return `mem[${hex(value.addr)}]`;
  }
  if (value.kind === 'indexed') {
    return `${String(value.reg).toUpperCase()}${value.displacement >= 0 ? '+' : ''}${value.displacement}`;
  }
  return JSON.stringify(value);
}

function findBytePattern(bytes) {
  const hits = [];
  for (let i = 0; i <= rom.length - bytes.length; i++) {
    let ok = true;
    for (let j = 0; j < bytes.length; j++) {
      if (rom[i + j] !== bytes[j]) {
        ok = false;
        break;
      }
    }
    if (ok) hits.push(i);
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
  ].sort((a, b) => a.addr - b.addr);
}

function describeAddr(addr) {
  return CODE_LABELS.has(addr) ? `${hex(addr)} (${CODE_LABELS.get(addr)})` : hex(addr);
}

const body = disassembleUntilRet(ENTRY);
const bodySize = body.length ? (body.at(-1).nextPc - ENTRY) : 0;
const ramRefs = collectRamRefs(body);
const callers = findCallers(ENTRY);
const wrapperFields = resolveFieldWrites(ENTRY);
const compareFields = resolveFieldWrites(COMPARE_ENTRY);
const callSites = body.filter(inst => inst.tag === 'call' || inst.tag === 'call-conditional');

console.log('======================================================================');
console.log('Phase 412: Map 0x01567C (Notification Delivery Wrapper)');
console.log('======================================================================');
console.log(`ROM: ${ROM_PATH}`);
console.log(`Target: ${hex(ENTRY)}  size=${hex(bodySize, 4)} (${bodySize} bytes)  instructions=${body.length}`);
console.log(`Compare target: ${hex(COMPARE_ENTRY)}`);
console.log('');

console.log(`Raw bytes from ${hex(ENTRY)} (first ${RAW_DUMP_BYTES} bytes):`);
for (let offset = 0; offset < RAW_DUMP_BYTES; offset += 16) {
  const pc = ENTRY + offset;
  console.log(`${hex(pc)}: ${raw(pc, 16)}`);
}
console.log('');

console.log(`Disassembly of ${hex(ENTRY)} until RET:`);
for (const inst of body) {
  console.log(`${hex(inst.pc)}  ${raw(inst.pc, inst.length).padEnd(18)}  ${formatInstruction(inst)}`);
}
console.log('');

console.log('Direct subroutine calls inside 0x01567C:');
for (const inst of callSites) {
  const note = CALL_NOTES.get(inst.target);
  const extra = note ? ` -- ${note}` : '';
  console.log(`  ${hex(inst.pc)}  ${formatInstruction(inst)}${extra}`);
}
console.log(`  Direct CALL 0x0004A0 present: ${callSites.some(inst => inst.target === 0x0004A0) ? 'yes' : 'no'}`);
console.log(`  Direct CALL 0x014E3F present: ${callSites.some(inst => inst.target === 0x014E3F) ? 'yes' : 'no'}`);
console.log(`  Direct CALL 0x02B373 present: ${callSites.some(inst => inst.target === 0x02B373) ? 'yes' : 'no'}`);
console.log('');

console.log('Direct RAM accesses inside 0x01567C:');
for (const ref of ramRefs) {
  const field = FIELD_LABELS.get(ref.addr);
  const extra = field ? ` (${field})` : '';
  console.log(`  ${hex(ref.pc)}  ${ref.kind.padEnd(5)} ${hex(ref.addr)}${extra} via ${ref.text}`);
}
console.log('');

console.log('Watch-address summary:');
for (const watch of WATCH_ADDRS) {
  const hits = ramRefs.filter(ref => ref.addr === watch.addr);
  if (hits.length === 0) {
    console.log(`  ${hex(watch.addr)}  ${watch.label}: no direct access in 0x01567C`);
  } else {
    const kinds = [...new Set(hits.map(hit => hit.kind))].join('/');
    const sites = hits.map(hit => hex(hit.pc)).join(', ');
    console.log(`  ${hex(watch.addr)}  ${watch.label}: ${kinds} at ${sites}`);
  }
}
console.log('');

console.log('Descriptor-field comparison vs 0x02B373:');
for (const addr of WATCH_FIELDS) {
  const label = FIELD_LABELS.get(addr) ?? '';
  const current = formatSource(wrapperFields.get(addr));
  const prior = formatSource(compareFields.get(addr));
  console.log(`  ${hex(addr)}  ${label.padEnd(22)}  0x01567C=${current.padEnd(34)}  0x02B373=${prior}`);
}
console.log('');

console.log(`Callers of ${hex(ENTRY)}:`);
for (const caller of callers) {
  const note = CALLER_NOTES.get(caller.addr);
  const ctxStart = Math.max(0, caller.addr - 8);
  const ctx = raw(ctxStart, 20);
  console.log(`  ${hex(caller.addr)}  ${caller.type.padEnd(4)}  bytes=${ctx}`);
  if (note) {
    console.log(`           ${note}`);
  }
}
console.log('');

console.log('Interpretation:');
console.log('- 0x01567C reuses the same 28-byte block at D143E7..D14402 as 0x02B373, but it fills callback slots with 0x00FB6E and 0x0121EF and sources payload metadata from D1776A / D1777B instead of D141B3.');
console.log('- It does not call the 0x0004A0 syscall gate. The wrapper performs a direct CALL 0x00F5B0 at 0x0156D2.');
console.log('- 0x014E3F, D14084, D1440E, and D177B7 are not touched directly in 0x01567C; they remain downstream behavior inside 0x00F5B0 and its installer path.');
console.log('- Extra setup before delivery: CALL 0x0151FE with a value loaded from D17792. Extra teardown/follow-up after delivery: optional D17779/D177BB/D14032 bookkeeping, a bit-set at D000C1, one dispatch_key call, then CALL 0x015542 with the return/status byte from D17725.');
