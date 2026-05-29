#!/usr/bin/env node

import { readFileSync } from 'node:fs';

process.emitWarning = () => {};
const { decodeInstruction } = await import('./ez80-decoder.js');

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const TARGETS = [
  {
    start: 0x009B35,
    title: '0x009B35 byte1/bit5 helper',
    callerContext: 'Reduced ISR dispatcher path 0x001A77 -> 0x001A87 after port 0x5015 bit5 acknowledge.',
    maxBytes: 0x0100,
    purpose:
      'Masks FTINTC enable bit5, samples USB/link status bytes, stores masked results in D14044/D14048, dispatches deeper USB/link work if needed, then re-enables bit5.',
    knownState: [
      'No direct IY/D00080 system-flag traffic in the body.',
      'Primary state block is D14042-D14049 plus D14073 and D177B7.',
      'This is a USB/link service helper, not a keyboard, timer, or display-refresh path.',
    ],
    subsystem:
      'USB/link masked-status service helper. It sits behind the reduced ISR dispatcher but does not look like display refresh or keyboard scanning.',
  },
  {
    start: 0x010220,
    title: '0x010220 display callback dispatcher',
    callerContext: 'Direct CALL from 0x001A9D in the reduced ISR dispatcher, plus vector relay 0x000580 -> JP 0x010220.',
    maxBytes: 0x0400,
    endExclusive: 0x0103A4,
    purpose:
      'Samples display/LCD status through helpers, dispatches five fixed callback slots, consumes queued D177D6 bits for slots 1-3, then re-arms the queue for the next pass.',
    knownState: [
      'Loads IY with 0xD00080 and performs SET 5 on D000BF.',
      'Uses FRAME(IX-1) as the sampled status byte local.',
      'Consumes and re-arms D177D6 queue bits 1-3; also uses D177D7 and D177E1.',
      'This is display/LCD callback machinery, not keyboard or timer work.',
    ],
    subsystem:
      'Display/LCD callback dispatcher. The ISR bit4 path is display-facing and uses queued callback state rather than USB/link or keyboard state.',
  },
];

const RAM_LABELS = new Map([
  [0xD000BF, 'systemFlags+0x3F (D000BF)'],
  [0xD14042, 'mask word A'],
  [0xD14043, 'sample/status byte A'],
  [0xD14044, 'masked sample byte A'],
  [0xD14045, 'alternate sample byte B'],
  [0xD14046, 'mask word B'],
  [0xD14047, 'sample/status byte B'],
  [0xD14048, 'masked sample byte B'],
  [0xD14049, 'alternate sample byte A'],
  [0xD14073, 'enabled flag'],
  [0xD177B7, 'usbInited sentinel'],
  [0xD177BC, 'display master-enable'],
  [0xD177BD, 'slot0 callback pointer'],
  [0xD177C0, 'slot1 callback pointer'],
  [0xD177C3, 'slot2 callback pointer'],
  [0xD177C6, 'slot3 callback pointer'],
  [0xD177C9, 'slot4 callback pointer'],
  [0xD177D6, 'display pending bits'],
  [0xD177D7, 'display latch byte'],
  [0xD177E1, 'slot4 side-effect flag'],
]);

const PORT_LABELS = new Map([
  [0x3014, 'alternate USB/link status A'],
  [0x3015, 'alternate USB/link status B'],
  [0x3084, 'USB/link status A'],
  [0x3085, 'USB/link status B'],
  [0x5005, 'FTINTC enable byte 1'],
  [0x8020, 'display helper port'],
  [0x8034, 'display/LCD status port'],
]);

const CALL_INFO = new Map([
  [0x002197, { note: '__frameset helper; reserves 1 local byte at (IX-1).' }],
  [0x0021C2, { note: 'Null-check helper for callback pointers.' }],
  [0x002288, { note: 'Indirect callback trampoline (JP (IY)).' }],
  [
    0x00745D,
    {
      note: 'Writes the sampled byte back to port 0x3085.',
      indirectPortWrites: [0x3085],
    },
  ],
  [
    0x00747D,
    {
      note: 'Writes the sampled byte back to port 0x3084.',
      indirectPortWrites: [0x3084],
    },
  ],
  [
    0x007CAD,
    {
      note: 'Display helper that masks/writes port 0x8020.',
      indirectPortWrites: [0x8020],
    },
  ],
  [
    0x007CD3,
    {
      note: 'Display helper that reads port 0x8020.',
      indirectPortReads: [0x8020],
    },
  ],
  [
    0x007CF1,
    {
      note: 'Display helper that writes the latched D177D7 byte to port 0x8020.',
      indirectPortWrites: [0x8020],
    },
  ],
  [
    0x007DC7,
    {
      note: 'Display helper that samples port 0x8034.',
      indirectPortReads: [0x8034],
    },
  ],
  [
    0x007DDB,
    {
      note: 'Display helper that commits the final sample back through port 0x8034 handling.',
      indirectPortWrites: [0x8034],
    },
  ],
  [0x0094C0, { note: 'Legacy/alternate link-status handler when D14073 == 0.' }],
  [0x0096CB, { note: 'Alternate USB/link handler when D14073 != 0.' }],
  [0x0098D2, { note: 'Masked USB/link service dispatcher that consumes D14044/D14048.' }],
  [0x010090, { note: 'Slot-3 pre-dispatch helper; earlier tracing showed it reads D177DB/D177D8.' }],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function upper(value) {
  return String(value ?? '').toUpperCase();
}

function lower(value) {
  return String(value ?? '').toLowerCase();
}

function formatDisp(value) {
  return `${value >= 0 ? '+' : ''}${value}`;
}

function rawBytes(start, length) {
  return Array.from(rom.slice(start, start + Math.max(length, 0)), hexByte).join(' ');
}

function safeDecode(pc) {
  try {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
      throw new Error('invalid decode');
    }
    return inst;
  } catch (error) {
    return {
      pc,
      length: 1,
      nextPc: pc + 1,
      tag: 'db',
      value: rom[pc] ?? 0,
      decodeError: error instanceof Error ? error.message : String(error),
    };
  }
}

function instructionFields(inst) {
  const skip = new Set([
    'pc',
    'nextPc',
    'length',
    'tag',
    'mode',
    'modePrefix',
    'decodeError',
    'fallthrough',
    'terminates',
  ]);

  return Object.entries(inst ?? {})
    .filter(([key, value]) => !skip.has(key) && value !== undefined && value !== null)
    .map(([key, value]) => (typeof value === 'number' ? `${key}=${hex(value, value > 0xFF ? 6 : 2)}` : `${key}=${String(value)}`))
    .join(' ');
}

function formatInstruction(inst) {
  const addr = inst.addr ?? inst.address;

  switch (inst.tag) {
    case 'db':
      return `DB ${hex(inst.value, 2)}`;
    case 'ret':
    case 'reti':
    case 'retn':
    case 'di':
    case 'ei':
    case 'halt':
    case 'nop':
    case 'rla':
    case 'rra':
    case 'rlca':
    case 'rrca':
    case 'cpl':
      return upper(inst.tag);
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${upper(inst.condition)},${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${upper(inst.condition)},${hex(inst.target)}`;
    case 'jp-indirect':
      return `JP (${upper(inst.indirectRegister)})`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${upper(inst.condition)},${hex(inst.target)}`;
    case 'djnz':
      return `DJNZ ${hex(inst.target)}`;
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
    case 'inc-pair':
      return `INC ${upper(inst.pair)}`;
    case 'dec-pair':
      return `DEC ${upper(inst.pair)}`;
    case 'inc-reg':
      return `INC ${upper(inst.reg)}`;
    case 'dec-reg':
      return `DEC ${upper(inst.reg)}`;
    case 'ld-pair-imm':
      return `LD ${upper(inst.pair)},${hex(inst.value)}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `LD (${hex(addr)}),${upper(inst.pair)}`
        : `LD ${upper(inst.pair)},(${hex(addr)})`;
    case 'ld-mem-pair':
      return `LD (${hex(addr)}),${upper(inst.pair)}`;
    case 'ld-reg-imm':
      return `LD ${upper(inst.dest)},${hex(inst.value, 2)}`;
    case 'ld-reg-reg':
      return `LD ${upper(inst.dest)},${upper(inst.src)}`;
    case 'ld-reg-mem':
      return `LD ${upper(inst.dest)},(${hex(addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(addr)}),${upper(inst.src)}`;
    case 'ld-reg-ind':
      return `LD ${upper(inst.dest)},(${upper(inst.src)})`;
    case 'ld-ind-reg':
      return `LD (${upper(inst.dest)}),${upper(inst.src)}`;
    case 'ld-reg-ixd':
      return `LD ${upper(inst.dest)},(IX${formatDisp(inst.displacement)})`;
    case 'ld-ixd-reg':
      return `LD (IX${formatDisp(inst.displacement)}),${upper(inst.src)}`;
    case 'ld-reg-iyd':
      return `LD ${upper(inst.dest)},(IY${formatDisp(inst.displacement)})`;
    case 'ld-iyd-reg':
      return `LD (IY${formatDisp(inst.displacement)}),${upper(inst.src)}`;
    case 'ld-sp-pair':
      return `LD SP,${upper(inst.pair)}`;
    case 'alu-reg':
      return `${upper(inst.op)} ${upper(inst.src)}`;
    case 'alu-imm':
      return `${upper(inst.op)} ${hex(inst.value, 2)}`;
    case 'in0':
      return `IN0 ${upper(inst.reg)},(${hex(inst.port, 2)})`;
    case 'out0':
      return `OUT0 (${hex(inst.port, 2)}),${upper(inst.reg)}`;
    case 'in-reg':
      return `IN ${upper(inst.reg)},(C)`;
    case 'out-reg':
      return `OUT (C),${upper(inst.reg)}`;
    case 'bit-test':
      return `BIT ${inst.bit},${upper(inst.reg)}`;
    case 'bit-set':
      return `SET ${inst.bit},${upper(inst.reg)}`;
    case 'bit-res':
      return `RES ${inst.bit},${upper(inst.reg)}`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit},(${upper(inst.indexRegister)}${formatDisp(inst.displacement)})`;
    case 'indexed-cb-set':
      return `SET ${inst.bit},(${upper(inst.indexRegister)}${formatDisp(inst.displacement)})`;
    case 'indexed-cb-res':
      return `RES ${inst.bit},(${upper(inst.indexRegister)}${formatDisp(inst.displacement)})`;
    case 'rst':
      return `RST ${hex(inst.target ?? 0, 2)}`;
    default: {
      const tail = instructionFields(inst);
      return tail ? `${upper(inst.tag)} ${tail}` : upper(inst.tag);
    }
  }
}

function isUnconditionalBranch(tag) {
  return tag === 'jp' || tag === 'jr' || tag === 'jp-indirect' || tag === 'rst';
}

function isConditionalBranch(tag) {
  return tag === 'jp-conditional' || tag === 'jr-conditional' || tag === 'djnz';
}

function isTerminal(tag) {
  return tag === 'ret' || tag === 'reti' || tag === 'retn';
}

function makeRow(pc, inst) {
  return {
    pc,
    inst,
    bcValues: new Set(),
    iyValues: new Set(),
    portReads: new Set(),
    portWrites: new Set(),
    ramReads: new Set(),
    ramWrites: new Set(),
    callNotes: new Set(),
    stateNotes: new Set(),
  };
}

function addAccess(groups, key, label, width, kind, pc) {
  if (!groups.has(key)) {
    groups.set(key, {
      key,
      label,
      width,
      reads: [],
      writes: [],
    });
  }
  groups.get(key)[kind].push(pc);
}

function formatRamKey(key, label, width) {
  if (typeof key === 'number') {
    return `${hex(key, width)}${label ? ` (${label})` : ''}`;
  }
  return label;
}

function addRamAccess(summary, row, key, label, width, kind, pc) {
  addAccess(summary.ramGroups, key, label, width, kind, pc);
  row[kind === 'reads' ? 'ramReads' : 'ramWrites'].add(formatRamKey(key, label, width));
}

function addPortAccess(summary, row, kind, port, direct = true) {
  const target = direct
    ? (kind === 'reads' ? summary.directPortReads : summary.directPortWrites)
    : (kind === 'reads' ? summary.indirectPortReads : summary.indirectPortWrites);
  target.add(port & 0xFFFF);
  if (direct) {
    row[kind === 'reads' ? 'portReads' : 'portWrites'].add(port & 0xFFFF);
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
    return currentBc;
  }

  return currentBc;
}

function updateIyContext(inst, currentIy) {
  if (inst.tag === 'ld-pair-imm' && lower(inst.pair) === 'iy') {
    return inst.value >>> 0;
  }

  if (inst.tag === 'ld-pair-mem' && lower(inst.pair) === 'iy' && inst.direction !== 'to-mem') {
    return null;
  }

  if (inst.tag === 'pop' && lower(inst.pair) === 'iy') {
    return null;
  }

  if (inst.tag === 'pop-idx' && lower(inst.indexRegister) === 'iy') {
    return null;
  }

  return currentIy;
}

function recordIndexedAccess(summary, row, indexRegister, displacement, kind, iyValue) {
  if (indexRegister === 'ix') {
    const frameLabel = `FRAME(IX${formatDisp(displacement)})`;
    addRamAccess(summary, row, `ix:${displacement}`, frameLabel, 0, kind, row.pc);
    return;
  }

  if (indexRegister === 'iy' && iyValue !== null) {
    const addr = (iyValue + displacement) >>> 0;
    if (addr >= 0xD00000 && addr <= 0xD1FFFF) {
      addRamAccess(summary, row, addr, RAM_LABELS.get(addr) ?? hex(addr), 6, kind, row.pc);
    }
  }
}

function analyzeInstructionEffects(summary, row, inst, context) {
  const addr = inst.addr ?? inst.address;

  if (inst.tag === 'ld-pair-imm' && lower(inst.pair) === 'iy') {
    summary.iyBases.add(inst.value >>> 0);
    if ((inst.value >>> 0) === 0xD00080) {
      row.stateNotes.add('IY = 0xD00080 system flags base');
    }
  }

  switch (inst.tag) {
    case 'ld-reg-mem':
      if (typeof addr === 'number' && addr >= 0xD00000 && addr <= 0xD1FFFF) {
        addRamAccess(summary, row, addr, RAM_LABELS.get(addr) ?? hex(addr), 6, 'reads', row.pc);
      }
      break;
    case 'ld-pair-mem':
      if (typeof addr === 'number' && addr >= 0xD00000 && addr <= 0xD1FFFF) {
        addRamAccess(
          summary,
          row,
          addr,
          RAM_LABELS.get(addr) ?? hex(addr),
          6,
          inst.direction === 'to-mem' ? 'writes' : 'reads',
          row.pc,
        );
      }
      break;
    case 'ld-mem-pair':
      if (typeof addr === 'number' && addr >= 0xD00000 && addr <= 0xD1FFFF) {
        addRamAccess(summary, row, addr, RAM_LABELS.get(addr) ?? hex(addr), 6, 'writes', row.pc);
      }
      break;
    case 'ld-mem-reg':
      if (typeof addr === 'number' && addr >= 0xD00000 && addr <= 0xD1FFFF) {
        addRamAccess(summary, row, addr, RAM_LABELS.get(addr) ?? hex(addr), 6, 'writes', row.pc);
      }
      break;
    case 'ld-reg-ixd':
      recordIndexedAccess(summary, row, 'ix', inst.displacement, 'reads', context.iy);
      break;
    case 'ld-ixd-reg':
      recordIndexedAccess(summary, row, 'ix', inst.displacement, 'writes', context.iy);
      break;
    case 'ld-reg-iyd':
      recordIndexedAccess(summary, row, 'iy', inst.displacement, 'reads', context.iy);
      break;
    case 'ld-iyd-reg':
      recordIndexedAccess(summary, row, 'iy', inst.displacement, 'writes', context.iy);
      break;
    case 'indexed-cb-bit':
      recordIndexedAccess(summary, row, lower(inst.indexRegister), inst.displacement, 'reads', context.iy);
      break;
    case 'indexed-cb-set':
    case 'indexed-cb-res':
      recordIndexedAccess(summary, row, lower(inst.indexRegister), inst.displacement, 'reads', context.iy);
      recordIndexedAccess(summary, row, lower(inst.indexRegister), inst.displacement, 'writes', context.iy);
      break;
    case 'in0':
      addPortAccess(summary, row, 'reads', inst.port, true);
      break;
    case 'out0':
      addPortAccess(summary, row, 'writes', inst.port, true);
      break;
    case 'in-reg':
      if (context.bc != null) {
        addPortAccess(summary, row, 'reads', context.bc & 0xFFFF, true);
      } else {
        summary.unresolvedPortReads += 1;
      }
      break;
    case 'out-reg':
      if (context.bc != null) {
        addPortAccess(summary, row, 'writes', context.bc & 0xFFFF, true);
      } else {
        summary.unresolvedPortWrites += 1;
      }
      break;
    case 'call':
    case 'call-conditional': {
      summary.calls.add(inst.target >>> 0);
      const info = CALL_INFO.get(inst.target >>> 0);
      if (info) {
        if (info.indirectPortReads) {
          for (const port of info.indirectPortReads) {
            addPortAccess(summary, row, 'reads', port, false);
          }
        }
        if (info.indirectPortWrites) {
          for (const port of info.indirectPortWrites) {
            addPortAccess(summary, row, 'writes', port, false);
          }
        }
        row.callNotes.add(info.note);
      }
      break;
    }
    default:
      break;
  }
}

function decodeContiguous(spec) {
  const rows = [];
  const hardEnd = spec.endExclusive ?? (spec.start + spec.maxBytes);
  let pc = spec.start;

  while (pc < rom.length && pc < hardEnd && (pc - spec.start) < spec.maxBytes) {
    const inst = safeDecode(pc);
    rows.push({ pc, inst });
    const nextPc = inst.nextPc > pc ? inst.nextPc : pc + 1;
    if (isTerminal(inst.tag)) {
      break;
    }
    pc = nextPc;
  }

  return rows;
}

function analyzeRoutine(spec, endExclusive) {
  const queue = [{ pc: spec.start, bc: null, iy: null }];
  const seenStates = new Set();
  const rowsByPc = new Map();
  const summary = {
    ramGroups: new Map(),
    directPortReads: new Set(),
    directPortWrites: new Set(),
    indirectPortReads: new Set(),
    indirectPortWrites: new Set(),
    calls: new Set(),
    iyBases: new Set(),
    unresolvedPortReads: 0,
    unresolvedPortWrites: 0,
  };

  while (queue.length > 0) {
    const state = queue.shift();
    let pc = state.pc >>> 0;
    let context = { bc: state.bc, iy: state.iy };

    while (pc >= spec.start && pc < endExclusive && pc < rom.length) {
      const stateKey = `${pc}:${context.bc == null ? '?' : context.bc.toString(16)}:${context.iy == null ? '?' : context.iy.toString(16)}`;
      if (seenStates.has(stateKey)) {
        break;
      }
      seenStates.add(stateKey);

      const inst = safeDecode(pc);
      const nextPc = inst.nextPc > pc ? inst.nextPc : pc + 1;

      let row = rowsByPc.get(pc);
      if (!row) {
        row = makeRow(pc, inst);
        rowsByPc.set(pc, row);
      }

      if (context.bc != null) {
        row.bcValues.add(context.bc & 0xFFFFFF);
      }
      if (context.iy != null) {
        row.iyValues.add(context.iy & 0xFFFFFF);
      }

      analyzeInstructionEffects(summary, row, inst, context);

      const nextContext = {
        bc: updateBcContext(inst, context.bc),
        iy: updateIyContext(inst, context.iy),
      };

      if (isUnconditionalBranch(inst.tag)) {
        if (typeof inst.target === 'number' && inst.target >= spec.start && inst.target < endExclusive) {
          queue.push({ pc: inst.target, ...nextContext });
        }
        break;
      }

      if (isConditionalBranch(inst.tag)) {
        if (typeof inst.target === 'number' && inst.target >= spec.start && inst.target < endExclusive) {
          queue.push({ pc: inst.target, ...nextContext });
        }
        pc = nextPc;
        context = nextContext;
        continue;
      }

      if (isTerminal(inst.tag)) {
        break;
      }

      if (inst.tag === 'ret-conditional') {
        pc = nextPc;
        context = nextContext;
        continue;
      }

      pc = nextPc;
      context = nextContext;
    }
  }

  return {
    rowsByPc,
    summary,
  };
}

function transferTag(inst) {
  if (inst.tag === 'call') return 'CALL';
  if (inst.tag === 'call-conditional') return `CALL ${upper(inst.condition)}`;
  if (inst.tag === 'jp') return 'JP';
  if (inst.tag === 'jp-conditional') return `JP ${upper(inst.condition)}`;
  if (inst.tag === 'jr') return 'JR';
  if (inst.tag === 'jr-conditional') return `JR ${upper(inst.condition)}`;
  if (inst.tag === 'djnz') return 'DJNZ';
  return upper(inst.tag);
}

function findRefsTo(target) {
  const refs = [];
  const b0 = target & 0xFF;
  const b1 = (target >> 8) & 0xFF;
  const b2 = (target >> 16) & 0xFF;
  const seen = new Set();

  for (let pc = 0; pc <= rom.length - 4; pc += 1) {
    if (rom[pc + 1] !== b0 || rom[pc + 2] !== b1 || rom[pc + 3] !== b2) {
      continue;
    }
    const inst = safeDecode(pc);
    if (
      !(
        inst.tag === 'call'
        || inst.tag === 'call-conditional'
        || inst.tag === 'jp'
        || inst.tag === 'jp-conditional'
      )
    ) {
      continue;
    }
    if (typeof inst.target !== 'number' || (inst.target & 0xFFFFFF) !== target) {
      continue;
    }
    if (seen.has(pc)) {
      continue;
    }
    seen.add(pc);
    refs.push({ pc, kind: transferTag(inst) });
  }

  return refs.sort((a, b) => a.pc - b.pc);
}

function formatPortList(values) {
  if (!values.length) {
    return 'none';
  }
  return values
    .map((value) => `${hex(value, 4)}${PORT_LABELS.has(value) ? ` (${PORT_LABELS.get(value)})` : ''}`)
    .join(', ');
}

function formatHexList(values) {
  if (!values.length) {
    return 'none';
  }
  return values.map((value) => hex(value)).join(', ');
}

function renderAccessSites(sites) {
  if (!sites.length) {
    return '-';
  }
  return [...new Set(sites)].sort((a, b) => a - b).map((pc) => hex(pc)).join(', ');
}

function renderRamSummary(ramGroups) {
  const entries = [...ramGroups.values()].sort((a, b) => {
    const keyA = typeof a.key === 'number' ? a.key : 0xFFFFFF + parseInt(String(a.key).split(':')[1] ?? '0', 10);
    const keyB = typeof b.key === 'number' ? b.key : 0xFFFFFF + parseInt(String(b.key).split(':')[1] ?? '0', 10);
    return keyA - keyB;
  });

  if (!entries.length) {
    return ['- none'];
  }

  return entries.map((entry) => `- ${formatRamKey(entry.key, entry.label, entry.width)}: read ${renderAccessSites(entry.reads)} ; write ${renderAccessSites(entry.writes)}`);
}

function renderSubcalls(calls) {
  const values = [...calls].sort((a, b) => a - b);
  if (!values.length) {
    return ['- none'];
  }

  return values.map((target) => {
    const info = CALL_INFO.get(target);
    return `- ${hex(target)}${info ? `: ${info.note}` : ''}`;
  });
}

function renderDisassembly(disasmRows, analysis) {
  const lines = [];

  for (const { pc, inst } of disasmRows) {
    const row = analysis.rowsByPc.get(pc) ?? makeRow(pc, inst);
    const notes = [];

    if (row.portReads.size) {
      notes.push(`port rd ${formatPortList([...row.portReads].sort((a, b) => a - b))}`);
    }
    if (row.portWrites.size) {
      notes.push(`port wr ${formatPortList([...row.portWrites].sort((a, b) => a - b))}`);
    }
    if (row.ramReads.size) {
      notes.push(`ram rd ${[...row.ramReads].sort().join(', ')}`);
    }
    if (row.ramWrites.size) {
      notes.push(`ram wr ${[...row.ramWrites].sort().join(', ')}`);
    }
    if (row.stateNotes.size) {
      notes.push(...[...row.stateNotes]);
    }
    if (row.callNotes.size) {
      notes.push(...[...row.callNotes]);
    }

    lines.push(
      `${hex(pc)}  ${rawBytes(pc, inst.length).padEnd(18, ' ')}  ${formatInstruction(inst)}${notes.length ? `  ; ${notes.join(' | ')}` : ''}`,
    );
  }

  return lines;
}

function renderTarget(spec) {
  const disasmRows = decodeContiguous(spec);
  const lastRow = disasmRows.at(-1);
  const endExclusive = spec.endExclusive ?? (lastRow ? lastRow.pc + lastRow.inst.length : spec.start);
  const analysis = analyzeRoutine(spec, endExclusive);
  const callers = findRefsTo(spec.start);
  const directPortReads = [...analysis.summary.directPortReads].sort((a, b) => a - b);
  const directPortWrites = [...analysis.summary.directPortWrites].sort((a, b) => a - b);
  const indirectPortReads = [...analysis.summary.indirectPortReads].sort((a, b) => a - b);
  const indirectPortWrites = [...analysis.summary.indirectPortWrites].sort((a, b) => a - b);
  const iyBases = [...analysis.summary.iyBases].sort((a, b) => a - b);
  const bytesCovered = lastRow ? (lastRow.pc + lastRow.inst.length - spec.start) : 0;

  const lines = [];
  lines.push(`## ${spec.title}`, '');
  lines.push(`Caller context: ${spec.callerContext}`);
  lines.push(`Decoded span: ${hex(spec.start)}..${lastRow ? hex(lastRow.pc + lastRow.inst.length - 1) : hex(spec.start)} (${hex(bytesCovered)} bytes, ${disasmRows.length} linear instructions)`);
  lines.push(`ROM references: ${callers.length ? callers.map((entry) => `${hex(entry.pc)} ${entry.kind}`).join(', ') : 'none'}`);
  lines.push(`Purpose: ${spec.purpose}`, '');

  lines.push('Ports', '');
  lines.push(`- Direct reads: ${formatPortList(directPortReads)}${analysis.summary.unresolvedPortReads ? ` (+${analysis.summary.unresolvedPortReads} unresolved BC-based reads)` : ''}`);
  lines.push(`- Direct writes: ${formatPortList(directPortWrites)}${analysis.summary.unresolvedPortWrites ? ` (+${analysis.summary.unresolvedPortWrites} unresolved BC-based writes)` : ''}`);
  lines.push(`- Via known callees (reads): ${formatPortList(indirectPortReads)}`);
  lines.push(`- Via known callees (writes): ${formatPortList(indirectPortWrites)}`, '');

  lines.push('RAM Accesses', '');
  lines.push(...renderRamSummary(analysis.summary.ramGroups));
  lines.push('');

  lines.push('Sub-calls', '');
  lines.push(...renderSubcalls(analysis.summary.calls));
  lines.push('');

  lines.push('Known State / Subsystem Fit', '');
  for (const note of spec.knownState) {
    lines.push(`- ${note}`);
  }
  if (iyBases.length) {
    lines.push(`- IY bases loaded directly: ${formatHexList(iyBases)}`);
  }
  lines.push(`- Subsystem summary: ${spec.subsystem}`, '');

  lines.push('Disassembly', '', '```text');
  lines.push(...renderDisassembly(disasmRows, analysis));
  lines.push('```', '');

  return lines;
}

const out = [];
out.push('# Phase 460 Probe: Trace 0x009B35 and 0x010220', '');
out.push(`ROM: ${new URL('./ROM.rom', import.meta.url).pathname}`);
out.push(`Generated: ${new Date().toISOString()}`, '');

for (const spec of TARGETS) {
  out.push(...renderTarget(spec));
}

console.log(out.join('\n'));
