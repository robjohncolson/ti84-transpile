#!/usr/bin/env node

import { readFileSync } from 'fs';

process.emitWarning = () => {};
const { decodeInstruction } = await import('./ez80-decoder.js');

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const START = 0x0098D2;
const END_EXCLUSIVE = 0x009B35;

const RAM_LABELS = new Map([
  [0xD14044, 'masked status byte A from 0x009B35'],
  [0xD14046, 'mask/status byte B'],
  [0xD14048, 'masked status byte B from 0x009B35'],
  [0xD14072, 'service flag byte 0'],
  [0xD14073, 'notification enabled flag'],
  [0xD14075, 'follow-up gate byte'],
  [0xD14076, 'service-pending flag'],
  [0xD14080, 'service latch A'],
  [0xD14082, 'service latch B'],
  [0xD14083, 'service latch C'],
  [0xD14084, 'notification busy flag'],
  [0xD14085, 'service latch D'],
  [0xD14086, 'service latch E'],
  [0xD14087, 'init latch'],
  [0xD14088, 'link-path latch'],
  [0xD176F8, 'protocol type state'],
  [0xD1772D, 'secondary gate byte'],
  [0xD177BB, 'transfer-in-progress latch'],
]);

const PORT_LABELS = new Map([
  [0x3010, 'USB/FIFO control'],
  [0x3031, 'USB/link control'],
  [0x3040, 'USB/link control'],
  [0x3080, 'USB/link control'],
  [0x3082, 'live USB/link status gate'],
  [0x313D, 'USB/link control'],
  [0x314C, 'USB/link control'],
]);

const CALL_LABELS = new Map([
  [0x0019B5, 'FTINTC post-HALT IRQ dispatcher'],
  [0x00322D, 'counted delay/wait helper'],
  [0x006F31, 'low-level port 0x0C/0x09 handshake helper'],
  [0x006F9A, 'low-level port 0x03/0x0C/0x0A handshake helper'],
  [0x006FAF, 'low-level port 0x03/0x0C/0x0A handshake helper'],
  [0x00883C, 'low-ROM dispatch_key(key,state)'],
  [0x00C9A0, 'large hardware/state reset helper'],
  [0x0123AD, '0x3010/installer helper'],
  [0x012456, '0x3080/0x3010 control helper'],
  [0x012D13, 'payload/FIFO control helper'],
  [0x012E4D, 'follow-up sampler/reset helper'],
]);

const FLOW_NOTES = [
  'Priority gate: D14044 bit 1 controls the large initialization/recovery path at 0x0098D2.',
  'If that bit-1 path sees live port 0x3082 bit 5 set, it calls 0x012456, dispatch_key(0x01,0x00), raises D14072, and may run a transfer-recovery sequence gated by D177BB.',
  'The D177BB path clears D177BB and D176F8, clears bits 5/4/0 on port 0x3010, writes 0x01 to port 0x314C, calls 0x00C9A0, re-enters 0x0019B5, waits, optionally re-enters 0x0019B5 again via D1772D, then calls 0x012E4D.',
  'If the bit-1 path does not take the 0x3082 bit-5 branch, it instead runs 0x006F9A and 0x006F31, clears port 0x3040 bit 6 and port 0x3080 bit 2, clears D14076/D14072, waits, and calls 0x012E4D.',
  'If D14044 bit 1 is absent, the routine jumps directly to the second dispatch phase at 0x009A12.',
  'Second dispatch phase: D14044 bit 0 plus live 0x3082 bit 4 selects between calling 0x012D13 after setting D14073, or directly clearing port 0x3010 bit 0 / setting port 0x3031 bit 0 while raising D14088.',
  'Second dispatch phase also fans out D14048 bit 5, D14044 bit 2, D14048 bit 4, D14048 bit 0, D14048 bit 6, D14044 bit 3, and D14044 bit 4 into helper calls or software latch writes D14082/D14083/D14084/D14085/D14086.',
  'When D14084 is raised on the late paths, the routine also clears bit 6 in D14046, which changes the mask byte that 0x009B35 uses to build D14048 on the next interrupt sample.',
];

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
    case 'ret-conditional':
      return `RET ${upper(inst.condition)}`;
    case 'reti':
      return 'RETI';
    case 'rst':
      return `RST ${hex(inst.target, 2)}`;
    case 'push':
      return `PUSH ${upper(inst.pair)}`;
    case 'pop':
      return `POP ${upper(inst.pair)}`;
    case 'ld-pair-imm':
      return `LD ${upper(inst.pair)},${hex(inst.value)}`;
    case 'ld-reg-imm':
      return `LD ${upper(inst.dest)},${hex(inst.value, 2)}`;
    case 'ld-reg-mem':
      return `LD ${upper(inst.dest)},(${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}),${upper(inst.src)}`;
    case 'ld-reg-reg':
      return `LD ${upper(inst.dest)},${upper(inst.src)}`;
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
    case 'in-reg':
      return `IN ${upper(inst.reg)},(C)`;
    case 'out-reg':
      return `OUT (C),${upper(inst.reg)}`;
    case 'di':
      return 'DI';
    case 'ei':
      return 'EI';
    case 'nop':
      return 'NOP';
    case 'halt':
      return 'HALT';
    case 'rla':
      return 'RLA';
    case 'rra':
      return 'RRA';
    case 'rlca':
      return 'RLCA';
    case 'rrca':
      return 'RRCA';
    case 'db':
      return `DB ${hex(inst.value, 2)}`;
    default:
      return `[${inst.tag}]`;
  }
}

function updateBcContext(inst, currentBc) {
  if (inst.tag === 'ld-pair-imm' && lower(inst.pair) === 'bc') {
    return inst.value >>> 0;
  }

  if (inst.tag === 'ld-pair-mem' && lower(inst.pair) === 'bc' && inst.direction !== 'to-mem') {
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

  if (inst.tag === 'pop' && lower(inst.pair) === 'bc') {
    return null;
  }

  if (
    (inst.tag === 'ld-reg-imm' || inst.tag === 'ld-reg-mem' || inst.tag === 'ld-reg-reg')
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

function analyzeRoutine() {
  const queue = [{ pc: START, bc: null }];
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
    branches: [],
  };

  while (queue.length > 0) {
    const state = queue.shift();
    let pc = state.pc;
    let bcValue = state.bc;

    while (pc >= START && pc < END_EXCLUSIVE) {
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
          ramReads: new Set(),
          ramWrites: new Set(),
          portReads: new Set(),
          portWrites: new Set(),
        };
        rowsByPc.set(pc, row);
      }

      analyzeInstructionEffects(row, summary, inst, bcValue);
      const nextBcValue = updateBcContext(inst, bcValue);

      if (inst.tag === 'jp' || inst.tag === 'jr') {
        summary.branches.push({ pc, type: inst.tag, target: inst.target });
        if (typeof inst.target === 'number' && inst.target >= START && inst.target < END_EXCLUSIVE) {
          queue.push({ pc: inst.target, bc: nextBcValue });
        }
        break;
      }

      if (inst.tag === 'jp-conditional' || inst.tag === 'jr-conditional') {
        summary.branches.push({ pc, type: inst.tag, condition: inst.condition, target: inst.target, fallthrough: nextPc });
        if (typeof inst.target === 'number' && inst.target >= START && inst.target < END_EXCLUSIVE) {
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
  const lastRow = rows.at(-1);

  return {
    ...summary,
    rows,
    endPc: lastRow ? (lastRow.pc + lastRow.inst.length - 1) : START,
    callers: patternHits([0xCD, 0xD2, 0x98, 0x00]),
    jumpers: patternHits([0xC3, 0xD2, 0x98, 0x00]),
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

  if (row.inst.tag === 'call' || row.inst.tag === 'call-conditional') {
    const label = CALL_LABELS.get(row.inst.target);
    if (label) {
      bits.push(label);
    }
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

const analysis = analyzeRoutine();
const ramReads = [...analysis.ramReads].sort((a, b) => a - b);
const ramWrites = [...analysis.ramWrites].sort((a, b) => a - b);
const portReads = [...analysis.portReads].sort((a, b) => a - b);
const portWrites = [...analysis.portWrites].sort((a, b) => a - b);
const calls = [...analysis.calls].sort((a, b) => a - b);

const lines = [];
lines.push('# Phase 419 Probe: Trace 0x0098D2', '');
lines.push(`ROM size: ${rom.length} bytes`);
lines.push(`Function span: ${hex(START)}..${hex(analysis.endPc)} (${analysis.rows.length} reachable instructions, ${analysis.endPc - START + 1} bytes)`);
lines.push(`Stops before caller helper at ${hex(END_EXCLUSIVE)} by explicit boundary.`, '');
lines.push(`Direct CALL sites: ${analysis.callers.length ? analysis.callers.map(pc => hex(pc)).join(', ') : 'none'}`);
lines.push(`Direct JP sites: ${analysis.jumpers.length ? analysis.jumpers.map(pc => hex(pc)).join(', ') : 'none'}`, '');
lines.push(`RAM reads: ${formatValueList(ramReads, 6, RAM_LABELS)}`);
lines.push(`RAM writes: ${formatValueList(ramWrites, 6, RAM_LABELS)}`);
lines.push(`Port reads: ${formatValueList(portReads, 4, PORT_LABELS)}${analysis.unresolvedPortReads ? ` (+${analysis.unresolvedPortReads} unresolved)` : ''}`);
lines.push(`Port writes: ${formatValueList(portWrites, 4, PORT_LABELS)}${analysis.unresolvedPortWrites ? ` (+${analysis.unresolvedPortWrites} unresolved)` : ''}`);
lines.push(`Direct call targets: ${calls.map(value => {
  const label = CALL_LABELS.get(value);
  return label ? `${hex(value)} (${label})` : hex(value);
}).join(', ')}`, '');
lines.push('## Conditional Branches', '');
for (const branch of analysis.branches) {
  const text = branch.condition
    ? `${hex(branch.pc)}  ${branch.type.toUpperCase()} ${upper(branch.condition)},${hex(branch.target)}  fallthrough ${hex(branch.fallthrough)}`
    : `${hex(branch.pc)}  ${branch.type.toUpperCase()} ${hex(branch.target)}`;
  lines.push(`- ${text}`);
}
lines.push('', '## Derived Flow Notes', '');
for (const note of FLOW_NOTES) {
  lines.push(`- ${note}`);
}
lines.push('', '## Disassembly', '', '```text');
lines.push(renderRows(analysis.rows));
lines.push('```');

console.log(lines.join('\n'));
