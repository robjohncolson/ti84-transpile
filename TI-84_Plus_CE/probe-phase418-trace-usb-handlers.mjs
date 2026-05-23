#!/usr/bin/env node

import { readFileSync } from 'node:fs';

process.emitWarning = () => {};
const { decodeInstruction } = await import('./ez80-decoder.js');

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const HANDLERS = [
  {
    name: 'byte1/bit5 USB ISR helper',
    start: 0x009B35,
    maxSpan: 0x0200,
    callBytes: [0xCD, 0x35, 0x9B, 0x00],
    jpBytes: [0xC3, 0x35, 0x9B, 0x00],
  },
  {
    name: 'byte0/bit3 USB ISR worker',
    start: 0x014DAB,
    maxSpan: 0x0200,
    callBytes: [0xCD, 0xAB, 0x4D, 0x01],
    jpBytes: [0xC3, 0xAB, 0x4D, 0x01],
  },
];

const RAM_LABELS = new Map([
  [0xD177B7, 'usbInited sentinel'],
  [0xD177B8, 'notification payload/state byte'],
  [0xD14038, 'rolling IRQ counter'],
  [0xD14042, 'mask word A'],
  [0xD14043, 'sample/status byte A'],
  [0xD14044, 'masked sample byte A'],
  [0xD14045, 'alternate sample byte B'],
  [0xD14046, 'mask word B'],
  [0xD14047, 'sample/status byte B'],
  [0xD14048, 'masked sample byte B'],
  [0xD14049, 'alternate sample byte A'],
  [0xD14073, 'enabled flag'],
  [0xD1407B, 'gate byte A'],
  [0xD1407C, 'gate byte B'],
  [0xD14081, 'gate byte C'],
  [0xD1408D, 'gate byte D'],
]);

const PORT_LABELS = new Map([
  [0x5005, 'FTINTC enable byte 1'],
  [0x3014, 'alternate USB/link status A'],
  [0x3015, 'alternate USB/link status B'],
  [0x3084, 'USB/link status A'],
  [0x3085, 'USB/link status B'],
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

function lower(value) {
  return value == null ? '' : String(value).toLowerCase();
}

function upper(value) {
  return value == null ? '' : String(value).toUpperCase();
}

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${upper(inst.condition)},${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${upper(inst.condition)},${hex(inst.target)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${upper(inst.condition)},${hex(inst.target)}`;
    case 'ret':
      return 'RET';
    case 'reti':
      return 'RETI';
    case 'ret-conditional':
      return `RET ${upper(inst.condition)}`;
    case 'push':
      return `PUSH ${upper(inst.pair)}`;
    case 'pop':
      return `POP ${upper(inst.pair)}`;
    case 'push-idx':
      return `PUSH ${upper(inst.indexRegister)}`;
    case 'pop-idx':
      return `POP ${upper(inst.indexRegister)}`;
    case 'ld-pair-imm':
      return `LD ${upper(inst.pair)},${hex(inst.value)}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `LD (${hex(inst.addr)}),${upper(inst.pair)}`
        : `LD ${upper(inst.pair)},(${hex(inst.addr)})`;
    case 'ld-mem-pair':
      return `LD (${hex(inst.addr)}),${upper(inst.pair)}`;
    case 'ld-reg-imm':
      return `LD ${upper(inst.dest)},${hex(inst.value, 2)}`;
    case 'ld-reg-mem':
      return `LD ${upper(inst.dest)},(${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}),${upper(inst.src)}`;
    case 'ld-reg-reg':
      return `LD ${upper(inst.dest)},${upper(inst.src)}`;
    case 'ld-reg-ind':
      return `LD ${upper(inst.dest)},(${upper(inst.src)})`;
    case 'ld-ind-reg':
      return `LD (${upper(inst.dest)}),${upper(inst.src)}`;
    case 'inc-pair':
      return `INC ${upper(inst.pair)}`;
    case 'dec-pair':
      return `DEC ${upper(inst.pair)}`;
    case 'inc-reg':
      return `INC ${upper(inst.reg)}`;
    case 'dec-reg':
      return `DEC ${upper(inst.reg)}`;
    case 'alu-reg':
      return `${upper(inst.op)} ${upper(inst.src)}`;
    case 'alu-imm':
      return `${upper(inst.op)} ${hex(inst.value, 2)}`;
    case 'bit-set':
      return `SET ${inst.bit},${upper(inst.reg)}`;
    case 'bit-res':
      return `RES ${inst.bit},${upper(inst.reg)}`;
    case 'bit-test':
      return `BIT ${inst.bit},${upper(inst.reg)}`;
    case 'di':
      return 'DI';
    case 'ei':
      return 'EI';
    case 'nop':
      return 'NOP';
    case 'halt':
      return 'HALT';
    case 'out0':
      return `OUT0 (${hex(inst.port, 2)}),${upper(inst.reg)}`;
    case 'out-reg':
      return `OUT (C),${upper(inst.reg)}`;
    case 'in0':
      return `IN0 ${upper(inst.reg)},(${hex(inst.port, 2)})`;
    case 'in-reg':
      return `IN ${upper(inst.reg)},(C)`;
    case 'rla':
      return 'RLA';
    case 'rra':
      return 'RRA';
    case 'rlca':
      return 'RLCA';
    case 'rrca':
      return 'RRCA';
    case 'exx':
      return 'EXX';
    case 'ex-af':
      return 'EX AF,AF\'';
    case 'rst':
      return `RST ${hex(inst.target, 2)}`;
    case 'cpl':
      return 'CPL';
    case 'sbc-pair':
    case 'sbc-hl-pair':
      return `SBC HL,${upper(inst.pair)}`;
    case 'db':
      return `DB ${hex(inst.value, 2)}`;
    default:
      return `[${inst.tag}]`;
  }
}

function patternHits(bytes) {
  const hits = [];

  for (let pc = 0; pc <= rom.length - bytes.length; pc++) {
    let matched = true;
    for (let i = 0; i < bytes.length; i++) {
      if (rom[pc + i] !== bytes[i]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      hits.push(pc);
    }
  }

  return hits;
}

function addToSet(target, value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    target.add(value >>> 0);
  }
}

function updateBcContext(inst, currentBc) {
  if (inst.tag === 'ld-pair-imm' && lower(inst.pair) === 'bc') {
    return inst.value >>> 0;
  }

  if (inst.tag === 'ld-pair-mem' && lower(inst.pair) === 'bc' && inst.direction !== 'to-mem') {
    return null;
  }

  if (inst.tag === 'ld-mem-pair' && lower(inst.pair) === 'bc') {
    return currentBc;
  }

  if ((inst.tag === 'inc-pair' || inst.tag === 'dec-pair') && lower(inst.pair) === 'bc') {
    if (currentBc == null) {
      return null;
    }
    return inst.tag === 'inc-pair'
      ? (currentBc + 1) & 0xFFFFFF
      : (currentBc - 1) & 0xFFFFFF;
  }

  if (inst.tag === 'pop' && lower(inst.pair) === 'bc') {
    return null;
  }

  if (
    (inst.tag === 'ld-reg-imm' || inst.tag === 'ld-reg-mem' || inst.tag === 'ld-reg-reg' || inst.tag === 'ld-reg-ind')
    && (lower(inst.dest) === 'b' || lower(inst.dest) === 'c')
  ) {
    return null;
  }

  if ((inst.tag === 'inc-reg' || inst.tag === 'dec-reg') && (lower(inst.reg) === 'b' || lower(inst.reg) === 'c')) {
    return null;
  }

  if ((inst.tag === 'bit-set' || inst.tag === 'bit-res' || inst.tag === 'bit-test') && (lower(inst.reg) === 'b' || lower(inst.reg) === 'c')) {
    return null;
  }

  if (inst.tag === 'call' || inst.tag === 'call-conditional' || inst.tag === 'rst') {
    return null;
  }

  return currentBc;
}

function analyzeInstructionEffects(row, summary, inst, bcValue) {
  switch (inst.tag) {
    case 'ld-reg-mem':
      addToSet(row.ramReads, inst.addr);
      addToSet(summary.ramReads, inst.addr);
      break;
    case 'ld-pair-mem':
      if (inst.direction === 'to-mem') {
        addToSet(row.ramWrites, inst.addr);
        addToSet(summary.ramWrites, inst.addr);
      } else {
        addToSet(row.ramReads, inst.addr);
        addToSet(summary.ramReads, inst.addr);
      }
      break;
    case 'ld-mem-pair':
      addToSet(row.ramWrites, inst.addr);
      addToSet(summary.ramWrites, inst.addr);
      break;
    case 'ld-mem-reg':
      addToSet(row.ramWrites, inst.addr);
      addToSet(summary.ramWrites, inst.addr);
      break;
    case 'in0':
      addToSet(row.portReads, inst.port);
      addToSet(summary.portReads, inst.port);
      break;
    case 'out0':
      addToSet(row.portWrites, inst.port);
      addToSet(summary.portWrites, inst.port);
      break;
    case 'in-reg':
      if (bcValue != null) {
        addToSet(row.portReads, bcValue & 0xFFFF);
        addToSet(summary.portReads, bcValue & 0xFFFF);
      } else {
        summary.unresolvedPortReads++;
      }
      break;
    case 'out-reg':
      if (bcValue != null) {
        addToSet(row.portWrites, bcValue & 0xFFFF);
        addToSet(summary.portWrites, bcValue & 0xFFFF);
      } else {
        summary.unresolvedPortWrites++;
      }
      break;
    case 'call':
    case 'call-conditional':
      addToSet(summary.calls, inst.target);
      break;
    default:
      break;
  }
}

function analyzeRoutine(handler) {
  const start = handler.start;
  const maxPc = start + handler.maxSpan;
  const queue = [{ pc: start, bc: null }];
  const seenStates = new Set();
  const rowsByPc = new Map();
  const summary = {
    ramReads: new Set(),
    ramWrites: new Set(),
    portReads: new Set(),
    portWrites: new Set(),
    calls: new Set(),
    unresolvedPortReads: 0,
    unresolvedPortWrites: 0,
  };

  while (queue.length > 0) {
    const state = queue.shift();
    let pc = state.pc;
    let bcValue = state.bc;

    while (pc >= start && pc < maxPc) {
      const stateKey = `${pc}:${bcValue == null ? '?' : bcValue.toString(16)}`;
      if (seenStates.has(stateKey)) {
        break;
      }
      seenStates.add(stateKey);

      const inst = safeDecode(pc);
      const nextPc = inst.nextPc > pc ? inst.nextPc : pc + 1;
      let row = rowsByPc.get(pc);
      if (!row) {
        row = {
          pc,
          inst,
          bcValues: new Set(),
          ramReads: new Set(),
          ramWrites: new Set(),
          portReads: new Set(),
          portWrites: new Set(),
        };
        rowsByPc.set(pc, row);
      }

      if (bcValue != null) {
        row.bcValues.add(bcValue & 0xFFFFFF);
      }

      analyzeInstructionEffects(row, summary, inst, bcValue);
      const nextBcValue = updateBcContext(inst, bcValue);

      if (inst.tag === 'jp' || inst.tag === 'jr') {
        if (typeof inst.target === 'number' && inst.target >= start && inst.target < maxPc) {
          queue.push({ pc: inst.target, bc: nextBcValue });
        }
        break;
      }

      if (inst.tag === 'jp-conditional' || inst.tag === 'jr-conditional') {
        if (typeof inst.target === 'number' && inst.target >= start && inst.target < maxPc) {
          queue.push({ pc: inst.target, bc: nextBcValue });
        }
        pc = nextPc;
        bcValue = nextBcValue;
        continue;
      }

      if (inst.tag === 'ret' || inst.tag === 'reti' || inst.tag === 'ret-conditional' || inst.tag === 'rst') {
        break;
      }

      pc = nextPc;
      bcValue = nextBcValue;
    }
  }

  const rows = [...rowsByPc.values()].sort((a, b) => a.pc - b.pc);
  const callers = patternHits(handler.callBytes).map(pc => ({ pc, kind: 'CALL' }));
  const jumps = patternHits(handler.jpBytes).map(pc => ({ pc, kind: 'JP' }));

  return {
    ...summary,
    rows,
    callers: [...callers, ...jumps].sort((a, b) => a.pc - b.pc),
  };
}

function labelFor(map, value) {
  return map.get(value) ?? '';
}

function formatValueList(values, width, labelMap) {
  if (values.length === 0) {
    return 'none';
  }

  return values.map(value => {
    const label = labelFor(labelMap, value);
    return label ? `${hex(value, width)} (${label})` : hex(value, width);
  }).join(', ');
}

function describeEffects(row) {
  const bits = [];

  if (row.portReads.size > 0) {
    bits.push(`port rd ${formatValueList([...row.portReads].sort((a, b) => a - b), 4, PORT_LABELS)}`);
  }
  if (row.portWrites.size > 0) {
    bits.push(`port wr ${formatValueList([...row.portWrites].sort((a, b) => a - b), 4, PORT_LABELS)}`);
  }
  if (row.ramReads.size > 0) {
    bits.push(`ram rd ${formatValueList([...row.ramReads].sort((a, b) => a - b), 6, RAM_LABELS)}`);
  }
  if (row.ramWrites.size > 0) {
    bits.push(`ram wr ${formatValueList([...row.ramWrites].sort((a, b) => a - b), 6, RAM_LABELS)}`);
  }

  return bits.join(' | ');
}

function renderRows(rows) {
  return rows.map(row => {
    const inst = row.inst;
    const bytes = rawBytes(row.pc, inst.length).padEnd(18, ' ');
    const comment = describeEffects(row);
    return `${hex(row.pc)}  ${bytes}  ${formatInstruction(inst)}${comment ? `  ; ${comment}` : ''}`;
  }).join('\n');
}

const lines = [];
lines.push('# Phase 418 Probe: Trace 0x009B35 and 0x014DAB', '');
lines.push(`ROM size: ${rom.length} bytes`);
lines.push(`Generated: ${new Date().toISOString()}`, '');

for (const handler of HANDLERS) {
  const analysis = analyzeRoutine(handler);
  const ramReads = [...analysis.ramReads].sort((a, b) => a - b);
  const ramWrites = [...analysis.ramWrites].sort((a, b) => a - b);
  const portReads = [...analysis.portReads].sort((a, b) => a - b);
  const portWrites = [...analysis.portWrites].sort((a, b) => a - b);
  const calls = [...analysis.calls].sort((a, b) => a - b);
  const lastPc = analysis.rows.length > 0 ? analysis.rows.at(-1).pc : handler.start;
  const lastInst = analysis.rows.length > 0 ? analysis.rows.at(-1).inst : null;
  const endPc = lastInst ? lastPc + lastInst.length - 1 : lastPc;

  lines.push(`## ${handler.name} ${hex(handler.start)}`, '');
  lines.push(`Reachable span: ${hex(handler.start)}..${hex(endPc)} (${analysis.rows.length} reachable instructions)`);
  lines.push(`Callers: ${analysis.callers.length ? analysis.callers.map(site => `${hex(site.pc)} ${site.kind}`).join(', ') : 'none'}`);
  lines.push(`RAM reads: ${formatValueList(ramReads, 6, RAM_LABELS)}`);
  lines.push(`RAM writes: ${formatValueList(ramWrites, 6, RAM_LABELS)}`);
  lines.push(`Port reads: ${formatValueList(portReads, 4, PORT_LABELS)}${analysis.unresolvedPortReads ? ` (+${analysis.unresolvedPortReads} unresolved)` : ''}`);
  lines.push(`Port writes: ${formatValueList(portWrites, 4, PORT_LABELS)}${analysis.unresolvedPortWrites ? ` (+${analysis.unresolvedPortWrites} unresolved)` : ''}`);
  lines.push(`Subroutine calls: ${formatValueList(calls, 6, new Map())}`, '');
  lines.push('```text');
  lines.push(renderRows(analysis.rows));
  lines.push('```', '');
}

console.log(lines.join('\n'));
