#!/usr/bin/env node

import { readFileSync } from 'fs';

process.emitWarning = () => {};
const { decodeInstruction } = await import('./ez80-decoder.js');

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const MAX_TRACE_BYTES = 800;

const FUNCTIONS = [
  {
    name: '0x00ED77 handshake slot selector',
    start: 0x00ED77,
  },
  {
    name: '0x00FE10 transfer dispatcher',
    start: 0x00FE10,
  },
];

const RAM_LABELS = new Map([
  [0xD13FE7, 'active descriptor pointer'],
  [0xD13FED, '5-entry descriptor pointer table'],
  [0xD14005, 'display parameter'],
  [0xD14008, 'display base pointer'],
  [0xD1400B, 'cursor/position counter'],
  [0xD1400E, 'secondary position'],
  [0xD14014, 'current protocol/context pointer'],
  [0xD14049, '0x3014 status shadow in parent ISR'],
  [0xD14076, 'service-pending flag'],
  [0xD141E2, 'latched protocol/context pointer'],
  [0xD141EA, 'link RX status latch'],
  [0xD1440E, 'notification lock'],
  [0xD1440F, 'notification delivery status'],
  [0xD176F8, 'protocol FSM byte'],
  [0xD176FB, 'notification/ack flag'],
  [0xD17795, 'protocol substate byte'],
  [0xD177B7, 'USB-initialized sentinel'],
]);

const PORT_LABELS = new Map([
  [0x3030, 'link data/status register'],
]);

const CALL_LABELS = new Map([
  [0x002197, '__frameset'],
  [0x0021C2, 'null-check helper'],
  [0x002288, '_indcall trampoline'],
  [0x00229D, '24-bit merge/normalize helper'],
  [0x0022F9, 'shift-left helper'],
  [0x00276B, '_stoiu zero-extend helper'],
  [0x00E1CC, 'selector-based free helper'],
  [0x00E4E8, 'descriptor-to-position helper'],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function rawBytes(start, length) {
  return Array.from(rom.slice(start, start + length), hexByte).join(' ');
}

function lower(value) {
  return value == null ? '' : String(value).toLowerCase();
}

function upper(value) {
  return value == null ? '' : String(value).toUpperCase();
}

function signedDisp(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function formatIndexed(base, displacement) {
  return `(${upper(base)}${signedDisp(displacement)})`;
}

function withPrefix(inst, text) {
  return inst.modePrefix ? `${upper(inst.modePrefix)} ${text}` : text;
}

function labelFor(map, value) {
  return map.get(value) ?? '';
}

function formatValue(value, width, map) {
  const label = labelFor(map, value);
  return label ? `${hex(value, width)} (${label})` : hex(value, width);
}

function safeDecode(pc) {
  try {
    return decodeInstruction(rom, pc, 'adl');
  } catch (error) {
    return {
      pc,
      length: 1,
      nextPc: pc + 1,
      tag: 'db',
      value: rom[pc] ?? 0,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function isTrackedRam(addr) {
  return typeof addr === 'number' && addr >= 0xD00000 && addr <= 0xD3FFFF;
}

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'call':
      return withPrefix(inst, `CALL ${hex(inst.target)}`);
    case 'call-conditional':
      return withPrefix(inst, `CALL ${upper(inst.condition)},${hex(inst.target)}`);
    case 'jp':
      return withPrefix(inst, `JP ${hex(inst.target)}`);
    case 'jp-conditional':
      return withPrefix(inst, `JP ${upper(inst.condition)},${hex(inst.target)}`);
    case 'jr':
      return withPrefix(inst, `JR ${hex(inst.target)}`);
    case 'jr-conditional':
      return withPrefix(inst, `JR ${upper(inst.condition)},${hex(inst.target)}`);
    case 'ret':
      return withPrefix(inst, 'RET');
    case 'ret-conditional':
      return withPrefix(inst, `RET ${upper(inst.condition)}`);
    case 'rst':
      return withPrefix(inst, `RST ${hex(inst.target, 2)}`);
    case 'push':
      return withPrefix(inst, `PUSH ${upper(inst.pair)}`);
    case 'pop':
      return withPrefix(inst, `POP ${upper(inst.pair)}`);
    case 'ld-pair-imm':
      return withPrefix(inst, `LD ${upper(inst.pair)},${hex(inst.value)}`);
    case 'ld-pair-mem':
      return withPrefix(
        inst,
        inst.direction === 'to-mem'
          ? `LD (${hex(inst.addr)}),${upper(inst.pair)}`
          : `LD ${upper(inst.pair)},(${hex(inst.addr)})`
      );
    case 'ld-mem-pair':
      return withPrefix(inst, `LD (${hex(inst.addr)}),${upper(inst.pair)}`);
    case 'ld-reg-imm':
      return withPrefix(inst, `LD ${upper(inst.dest)},${hex(inst.value, 2)}`);
    case 'ld-reg-mem':
      return withPrefix(inst, `LD ${upper(inst.dest)},(${hex(inst.addr)})`);
    case 'ld-mem-reg':
      return withPrefix(inst, `LD (${hex(inst.addr)}),${upper(inst.src)}`);
    case 'ld-reg-reg':
      return withPrefix(inst, `LD ${upper(inst.dest)},${upper(inst.src)}`);
    case 'ld-reg-ind':
      return withPrefix(inst, `LD ${upper(inst.dest)},(${upper(inst.src)})`);
    case 'ld-ind-reg':
      return withPrefix(inst, `LD (${upper(inst.dest)}),${upper(inst.src)}`);
    case 'ld-ind-imm':
      return withPrefix(inst, `LD (HL),${hex(inst.value, 2)}`);
    case 'ld-reg-ixd':
      return withPrefix(inst, `LD ${upper(inst.dest)},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-ixd-reg':
      return withPrefix(inst, `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${upper(inst.src)}`);
    case 'ld-ixd-imm':
      return withPrefix(inst, `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${hex(inst.value, 2)}`);
    case 'ld-pair-indexed':
      return withPrefix(inst, `LD ${upper(inst.pair)},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-indexed-pair':
      return withPrefix(inst, `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${upper(inst.pair)}`);
    case 'ld-ixiy-indexed':
      return withPrefix(inst, `LD ${upper(inst.dest)},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-pair-ind':
      return withPrefix(inst, `LD ${upper(inst.pair)},(${upper(inst.src)})`);
    case 'ld-sp-pair':
      return withPrefix(inst, `LD SP,${upper(inst.pair)}`);
    case 'ld-sp-hl':
      return withPrefix(inst, 'LD SP,HL');
    case 'inc-pair':
      return withPrefix(inst, `INC ${upper(inst.pair)}`);
    case 'dec-pair':
      return withPrefix(inst, `DEC ${upper(inst.pair)}`);
    case 'inc-reg':
      return withPrefix(inst, `INC ${upper(inst.reg)}`);
    case 'dec-reg':
      return withPrefix(inst, `DEC ${upper(inst.reg)}`);
    case 'inc-ixd':
      return withPrefix(inst, `INC ${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'add-pair':
      return withPrefix(inst, `ADD ${upper(inst.dest)},${upper(inst.src)}`);
    case 'sbc-pair':
      return withPrefix(inst, `SBC HL,${upper(inst.src)}`);
    case 'alu-reg':
      return withPrefix(inst, `${upper(inst.op)} ${upper(inst.src)}`);
    case 'alu-imm':
      return withPrefix(inst, `${upper(inst.op)} ${hex(inst.value, 2)}`);
    case 'bit-set':
      return withPrefix(inst, `SET ${inst.bit},${upper(inst.reg)}`);
    case 'bit-res':
      return withPrefix(inst, `RES ${inst.bit},${upper(inst.reg)}`);
    case 'bit-test':
      return withPrefix(inst, `BIT ${inst.bit},${upper(inst.reg)}`);
    case 'indexed-cb-set':
      return withPrefix(inst, `SET ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-res':
      return withPrefix(inst, `RES ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'indexed-cb-test':
      return withPrefix(inst, `BIT ${inst.bit},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'in-reg':
      return withPrefix(inst, `IN ${upper(inst.reg)},(C)`);
    case 'out-reg':
      return withPrefix(inst, `OUT (C),${upper(inst.reg)}`);
    case 'lea':
      return withPrefix(inst, `LEA ${upper(inst.dest)},${upper(inst.base)}${signedDisp(inst.displacement)}`);
    case 'ld-special':
      return withPrefix(inst, `LD ${upper(inst.dest)},${upper(inst.src)}`);
    case 'di':
      return withPrefix(inst, 'DI');
    case 'ei':
      return withPrefix(inst, 'EI');
    case 'nop':
      return withPrefix(inst, 'NOP');
    case 'db':
      return withPrefix(inst, `DB ${hex(inst.value, 2)}`);
    default:
      return withPrefix(inst, `[${inst.tag}]`);
  }
}

function updateBcContext(inst, currentBc) {
  if (inst.tag === 'ld-pair-imm' && lower(inst.pair) === 'bc') {
    return inst.value >>> 0;
  }

  if (inst.tag === 'ld-pair-mem' && lower(inst.pair) === 'bc' && inst.direction !== 'to-mem') {
    return null;
  }

  if (inst.tag === 'ld-pair-indexed' && lower(inst.pair) === 'bc') {
    return null;
  }

  if (inst.tag === 'ld-pair-ind' && lower(inst.pair) === 'bc') {
    return null;
  }

  if ((inst.tag === 'inc-pair' || inst.tag === 'dec-pair') && lower(inst.pair) === 'bc') {
    if (currentBc == null) {
      return null;
    }
    return inst.tag === 'inc-pair'
      ? (currentBc + 1) & 0xFFFFFF
      : (currentBc - 1) & 0xFFFFFF;
  }

  if (
    (inst.tag === 'ld-reg-imm'
      || inst.tag === 'ld-reg-mem'
      || inst.tag === 'ld-reg-reg'
      || inst.tag === 'ld-reg-ind'
      || inst.tag === 'ld-reg-ixd')
    && (lower(inst.dest) === 'b' || lower(inst.dest) === 'c')
  ) {
    return null;
  }

  if ((inst.tag === 'inc-reg' || inst.tag === 'dec-reg') && (lower(inst.reg) === 'b' || lower(inst.reg) === 'c')) {
    return null;
  }

  if (inst.tag === 'pop' && lower(inst.pair) === 'bc') {
    return null;
  }

  if (inst.tag === 'call' || inst.tag === 'call-conditional' || inst.tag === 'rst') {
    return null;
  }

  return currentBc;
}

function updateHlAlias(inst, currentAlias) {
  if (inst.tag === 'lea' && lower(inst.dest) === 'hl' && (lower(inst.base) === 'ix' || lower(inst.base) === 'iy')) {
    return { base: lower(inst.base), displacement: inst.displacement };
  }

  if (inst.tag === 'ld-pair-indexed' && lower(inst.pair) === 'hl') {
    return { base: lower(inst.indexRegister), displacement: inst.displacement };
  }

  if ((inst.tag === 'inc-pair' || inst.tag === 'dec-pair') && lower(inst.pair) === 'hl' && currentAlias) {
    return {
      base: currentAlias.base,
      displacement: currentAlias.displacement + (inst.tag === 'inc-pair' ? 1 : -1),
    };
  }

  if (
    (inst.tag === 'ld-pair-imm' && lower(inst.pair) === 'hl')
    || (inst.tag === 'ld-pair-mem' && lower(inst.pair) === 'hl' && inst.direction !== 'to-mem')
    || (inst.tag === 'ld-pair-ind' && lower(inst.pair) === 'hl')
    || (inst.tag === 'add-pair' && lower(inst.dest) === 'hl')
    || inst.tag === 'sbc-pair'
    || (inst.tag === 'pop' && lower(inst.pair) === 'hl')
  ) {
    return null;
  }

  if (
    (inst.tag === 'ld-reg-imm' || inst.tag === 'ld-reg-mem' || inst.tag === 'ld-reg-reg' || inst.tag === 'ld-reg-ind' || inst.tag === 'ld-reg-ixd')
    && (lower(inst.dest) === 'h' || lower(inst.dest) === 'l')
  ) {
    return null;
  }

  if ((inst.tag === 'inc-reg' || inst.tag === 'dec-reg') && (lower(inst.reg) === 'h' || lower(inst.reg) === 'l')) {
    return null;
  }

  if (inst.tag === 'call' || inst.tag === 'call-conditional' || inst.tag === 'rst') {
    return null;
  }

  return currentAlias;
}

function indexedKey(base, displacement) {
  return `${upper(base)}${signedDisp(displacement)}`;
}

function addIndexedAccess(target, base, displacement) {
  if (!base || displacement == null) {
    return;
  }
  target.add(indexedKey(base, displacement));
}

function addTrackedRamEffect(target, addr) {
  if (isTrackedRam(addr)) {
    target.add(addr >>> 0);
  }
}

function analyzeInstruction(inst, contexts, summary, row) {
  switch (inst.tag) {
    case 'ld-reg-mem':
      addTrackedRamEffect(summary.ramReads, inst.addr);
      addTrackedRamEffect(row.ramReads, inst.addr);
      break;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        addTrackedRamEffect(summary.ramWrites, inst.addr);
        addTrackedRamEffect(row.ramWrites, inst.addr);
      } else {
        addTrackedRamEffect(summary.ramReads, inst.addr);
        addTrackedRamEffect(row.ramReads, inst.addr);
      }
      break;
    case 'ld-mem-pair':
      addTrackedRamEffect(summary.ramWrites, inst.addr);
      addTrackedRamEffect(row.ramWrites, inst.addr);
      break;
    case 'ld-mem-reg':
      addTrackedRamEffect(summary.ramWrites, inst.addr);
      addTrackedRamEffect(row.ramWrites, inst.addr);
      break;
    case 'ld-reg-ixd':
      addIndexedAccess(summary.indexedReads, inst.indexRegister, inst.displacement);
      addIndexedAccess(row.indexedReads, inst.indexRegister, inst.displacement);
      break;
    case 'ld-ixd-reg':
    case 'ld-ixd-imm':
      addIndexedAccess(summary.indexedWrites, inst.indexRegister, inst.displacement);
      addIndexedAccess(row.indexedWrites, inst.indexRegister, inst.displacement);
      break;
    case 'ld-pair-indexed':
    case 'ld-ixiy-indexed':
      addIndexedAccess(summary.indexedReads, inst.indexRegister, inst.displacement);
      addIndexedAccess(row.indexedReads, inst.indexRegister, inst.displacement);
      break;
    case 'ld-indexed-pair':
      addIndexedAccess(summary.indexedWrites, inst.indexRegister, inst.displacement);
      addIndexedAccess(row.indexedWrites, inst.indexRegister, inst.displacement);
      break;
    case 'indexed-cb-set':
    case 'indexed-cb-res':
      addIndexedAccess(summary.indexedReads, inst.indexRegister, inst.displacement);
      addIndexedAccess(summary.indexedWrites, inst.indexRegister, inst.displacement);
      addIndexedAccess(row.indexedReads, inst.indexRegister, inst.displacement);
      addIndexedAccess(row.indexedWrites, inst.indexRegister, inst.displacement);
      break;
    case 'indexed-cb-test':
      addIndexedAccess(summary.indexedReads, inst.indexRegister, inst.displacement);
      addIndexedAccess(row.indexedReads, inst.indexRegister, inst.displacement);
      break;
    case 'ld-reg-ind':
      if (lower(inst.src) === 'hl' && contexts.hlAlias) {
        addIndexedAccess(summary.indexedReads, contexts.hlAlias.base, contexts.hlAlias.displacement);
        addIndexedAccess(row.indexedReads, contexts.hlAlias.base, contexts.hlAlias.displacement);
      }
      break;
    case 'ld-ind-reg':
    case 'ld-ind-imm':
      if (lower(inst.dest) === 'hl' && contexts.hlAlias) {
        addIndexedAccess(summary.indexedWrites, contexts.hlAlias.base, contexts.hlAlias.displacement);
        addIndexedAccess(row.indexedWrites, contexts.hlAlias.base, contexts.hlAlias.displacement);
      }
      break;
    case 'in-reg':
      if (contexts.bc != null) {
        summary.portReads.add(contexts.bc & 0xFFFF);
        row.portReads.add(contexts.bc & 0xFFFF);
      } else {
        summary.unresolvedPortReads += 1;
      }
      break;
    case 'out-reg':
      if (contexts.bc != null) {
        summary.portWrites.add(contexts.bc & 0xFFFF);
        row.portWrites.add(contexts.bc & 0xFFFF);
      } else {
        summary.unresolvedPortWrites += 1;
      }
      break;
    case 'call':
    case 'call-conditional':
      summary.calls.add(inst.target >>> 0);
      row.callTarget = inst.target >>> 0;
      break;
    case 'jp':
    case 'jp-conditional':
    case 'jr':
    case 'jr-conditional':
    case 'ret-conditional':
      summary.branches.push({ pc: row.pc, inst });
      break;
    default:
      break;
  }
}

function formatIndexedSet(values) {
  if (values.size === 0) {
    return 'none';
  }
  return [...values].sort().join(', ');
}

function formatAddressSet(values, width, map) {
  if (values.size === 0) {
    return 'none';
  }
  return [...values]
    .sort((a, b) => a - b)
    .map((value) => formatValue(value, width, map))
    .join(', ');
}

function describeRow(row) {
  const bits = [];

  if (row.ramReads.size) {
    bits.push(`read ${formatAddressSet(row.ramReads, 6, RAM_LABELS)}`);
  }
  if (row.ramWrites.size) {
    bits.push(`write ${formatAddressSet(row.ramWrites, 6, RAM_LABELS)}`);
  }
  if (row.indexedReads.size) {
    bits.push(`idx-read ${formatIndexedSet(row.indexedReads)}`);
  }
  if (row.indexedWrites.size) {
    bits.push(`idx-write ${formatIndexedSet(row.indexedWrites)}`);
  }
  if (row.portReads.size) {
    bits.push(
      `port-in ${formatAddressSet(row.portReads, 4, PORT_LABELS)}`
    );
  }
  if (row.portWrites.size) {
    bits.push(
      `port-out ${formatAddressSet(row.portWrites, 4, PORT_LABELS)}`
    );
  }
  if (row.callTarget != null) {
    bits.push(`call ${formatValue(row.callTarget, 6, CALL_LABELS)}`);
  }

  return bits.join(' | ');
}

function traceFunction(target) {
  let pc = target.start;
  let tracedBytes = 0;
  let bcContext = null;
  let hlAlias = null;
  let endPc = target.start;
  let termination = 'max-trace';

  const summary = {
    ramReads: new Set(),
    ramWrites: new Set(),
    indexedReads: new Set(),
    indexedWrites: new Set(),
    portReads: new Set(),
    portWrites: new Set(),
    calls: new Set(),
    branches: [],
    unresolvedPortReads: 0,
    unresolvedPortWrites: 0,
  };

  console.log(`=== ${target.name} ===`);
  console.log(`start=${hex(target.start)} maxTraceBytes=${MAX_TRACE_BYTES}`);

  while (pc < rom.length && tracedBytes < MAX_TRACE_BYTES) {
    const inst = safeDecode(pc);
    const nextPc = inst.nextPc > pc ? inst.nextPc : pc + 1;
    const row = {
      pc,
      ramReads: new Set(),
      ramWrites: new Set(),
      indexedReads: new Set(),
      indexedWrites: new Set(),
      portReads: new Set(),
      portWrites: new Set(),
      callTarget: null,
    };

    analyzeInstruction(inst, { bc: bcContext, hlAlias }, summary, row);

    const text = formatInstruction(inst);
    const effects = describeRow(row);
    console.log(
      `${hex(pc)}  ${rawBytes(pc, inst.length).padEnd(23)}  ${text}${effects ? ` ; ${effects}` : ''}`
    );

    endPc = pc + inst.length - 1;
    tracedBytes += inst.length;

    bcContext = updateBcContext(inst, bcContext);
    hlAlias = updateHlAlias(inst, hlAlias);
    pc = nextPc;

    if (inst.tag === 'ret') {
      termination = 'ret';
      break;
    }
  }

  if (termination !== 'ret' && tracedBytes >= MAX_TRACE_BYTES) {
    termination = 'max-trace';
  }

  console.log('');
  console.log('Summary');
  console.log(`  end: ${hex(endPc)} size: ${endPc - target.start + 1} bytes termination: ${termination}`);
  console.log(`  absolute RAM reads: ${formatAddressSet(summary.ramReads, 6, RAM_LABELS)}`);
  console.log(`  absolute RAM writes: ${formatAddressSet(summary.ramWrites, 6, RAM_LABELS)}`);
  console.log(`  indexed reads: ${formatIndexedSet(summary.indexedReads)}`);
  console.log(`  indexed writes: ${formatIndexedSet(summary.indexedWrites)}`);
  console.log(`  port reads: ${formatAddressSet(summary.portReads, 4, PORT_LABELS)}`);
  console.log(`  port writes: ${formatAddressSet(summary.portWrites, 4, PORT_LABELS)}`);
  console.log(`  unresolved port reads: ${summary.unresolvedPortReads}`);
  console.log(`  unresolved port writes: ${summary.unresolvedPortWrites}`);
  console.log(`  calls: ${formatAddressSet(summary.calls, 6, CALL_LABELS)}`);
  console.log('  branches:');
  if (summary.branches.length === 0) {
    console.log('    none');
  } else {
    for (const entry of summary.branches) {
      console.log(`    ${hex(entry.pc)} ${formatInstruction(entry.inst)}`);
    }
  }
  console.log('');
}

for (const target of FUNCTIONS) {
  traceFunction(target);
}
