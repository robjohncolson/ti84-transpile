#!/usr/bin/env node

import fs from 'node:fs';

process.emitWarning = () => {};
const { decodeInstruction } = await import(new URL('./ez80-decoder.js', import.meta.url));

const rom = fs.readFileSync('TI-84_Plus_CE/ROM.rom');

const START = 0x00E1CC;
const END = 0x00E2EA;
const TABLE_START = 0x00E1E5;
const TABLE_COUNT = read16(TABLE_START);
const CALL_PATTERN = [0xCD, 0xCC, 0xE1, 0x00];
const RAM_MIN = 0xD00000;
const RAM_MAX = 0xD1FFFF;

const CALL_LABELS = new Map([
  [0x002197, '__frameset'],
  [0x00211B, '_seqcase sparse dispatcher'],
  [0x002330, '24-bit right-shift helper'],
  [0x00238F, '24-bit add-immediate helper'],
  [0x0023AD, '24-bit limit compare helper'],
  [0x00245A, '24-bit scale helper'],
  [0x00276B, 'zero-extend BC -> HL helper'],
]);

const RAM_LABELS = new Map([
  [0xD13FFC, 'USB/link descriptor pointer A'],
  [0xD13FFF, 'USB/link descriptor pointer B'],
  [0xD14002, 'USB/link descriptor pointer C'],
  [0xD14005, 'list terminator / display parameter'],
  [0xD1400B, 'current selector-0 block pointer'],
  [0xD1400E, 'successor pointer/value built by caller'],
  [0xD1401A, 'selector-0 pool base'],
  [0xD1401D, 'selector-0 pool end sentinel'],
  [0xD14020, 'selector-2 pool base'],
  [0xD1405C, 'selector-0 free bitmap (16 entries)'],
  [0xD1406C, 'selector-2 free bitmap (6 entries)'],
]);

const PORT_LABELS = new Map([
  [0x3082, 'USB controller status port'],
]);

const CALLER_LABELS = new Map([
  [0x00CEBA, 'descriptor cleanup path'],
  [0x00CEFA, 'descriptor cleanup failover'],
  [0x00CF0B, 'descriptor cleanup for second pointer'],
  [0x00E8F8, 'list-node recycler'],
  [0x00FFD6, '0x00FE10 transfer dispatcher tail'],
  [0x01100C, 'selector-2 wrapper'],
]);

const CALLER_NOTES = new Map([
  [0x00CEBA, 'pushes *(D13FFC), then selector 0'],
  [0x00CEFA, 'pushes *(D13FFC), then selector 0'],
  [0x00CF0B, 'pushes *(D13FFF), then selector 0'],
  [0x00E8F8, 'pushes *(D1400B), then selector 0'],
  [0x00FFD6, '0x00FE10 pushes *(D1400B), then selector 0 after building D1400E from bytes +0..+2 of the current block'],
  [0x01100C, 'pushes (IX+6), then selector 2; caller is gated by IN A,(0x3082) bit 4'],
]);

const BRANCH_NOTES = new Map([
  [0x00E1FD, 'reject selector-0 pointers below D1401A'],
  [0x00E20C, 'reject selector-0 pointers at/above D1401D'],
  [0x00E232, 'reject selector-0 slot indexes >= 16'],
  [0x00E255, 'carry set means wipe-index is still below 16; continue clearing'],
  [0x00E29F, 'reject selector-2 pointers below D14020'],
  [0x00E2B2, 'reject selector-2 pointers at/above D14020 + 0x1800'],
  [0x00E2D6, 'reject selector-2 slot indexes >= 6'],
]);

const PC_COMMENTS = new Map([
  [0x00E1D4, ['save arg pointer from IX+9 into a local 24-bit slot']],
  [0x00E1DA, ['load selector from IX+6']],
  [0x00E1E1, ['dispatch selector through inline _seqcase table']],
  [0x00E1F2, ['selector 0: read lower bound for the 0x20-byte slab pool']],
  [0x00E201, ['selector 0: read upper sentinel for the 0x20-byte slab pool']],
  [0x00E21D, ['compute slot index = (ptr - D1401A) >> 5']],
  [0x00E242, ['write D1405C[index] = 1 to mark the selector-0 slab free']],
  [0x00E251, ['compare 24-bit wipe index against 16 words']],
  [0x00E273, ['compute byte offset = wipeIndex * 2']],
  [0x00E27B, ['clear the low byte of one 16-bit cell in the 0x20-byte slab']],
  [0x00E27E, ['clear the high byte of the same 16-bit cell']],
  [0x00E288, ['increment the 24-bit wipe index by 1']],
  [0x00E294, ['selector 2: read lower bound for the 0x400-byte slab pool']],
  [0x00E2A1, ['selector 2 span is 0x1800 bytes (6 * 0x400)']],
  [0x00E2C1, ['compute slot index = (ptr - D14020) >> 10']],
  [0x00E2E4, ['write D1406C[index] = 1 to mark the selector-2 slab free']],
  [0x00E2E6, ['common epilogue / default return path']],
]);

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function read16(addr) {
  return rom[addr] | (rom[addr + 1] << 8);
}

function read24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function signedByte(value) {
  return value < 0x80 ? value : value - 0x100;
}

function formatBytes(addr, length) {
  return Array.from(rom.subarray(addr, addr + length), (byte) => hexByte(byte)).join(' ');
}

function upper(value) {
  return value == null ? '' : String(value).toUpperCase();
}

function lower(value) {
  return value == null ? '' : String(value).toLowerCase();
}

function withPrefix(inst, text) {
  return inst.modePrefix ? `${upper(inst.modePrefix)} ${text}` : text;
}

function formatDisp(value) {
  return value >= 0 ? `+${hex(value, 2)}` : `-${hex(-value, 2)}`;
}

function formatIndexed(base, displacement) {
  return `(${upper(base)}${formatDisp(displacement)})`;
}

function isRam(addr) {
  return addr >= RAM_MIN && addr <= RAM_MAX;
}

function labelFor(map, value) {
  return map.get(value) ?? null;
}

function formatAddress(addr, width, map) {
  const label = labelFor(map, addr);
  return `${hex(addr, width)}${label ? ` (${label})` : ''}`;
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

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'call':
      return withPrefix(inst, `CALL ${hex(inst.target)}`);
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
    case 'ld-reg-imm':
      return withPrefix(inst, `LD ${upper(inst.dest)},${hex(inst.value, 2)}`);
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
    case 'ld-pair-indexed':
      return withPrefix(inst, `LD ${upper(inst.pair)},${formatIndexed(inst.indexRegister, inst.displacement)}`);
    case 'ld-indexed-pair':
      return withPrefix(inst, `LD ${formatIndexed(inst.indexRegister, inst.displacement)},${upper(inst.pair)}`);
    case 'ld-sp-pair':
      return withPrefix(inst, `LD SP,${upper(inst.pair)}`);
    case 'inc-pair':
      return withPrefix(inst, `INC ${upper(inst.pair)}`);
    case 'dec-pair':
      return withPrefix(inst, `DEC ${upper(inst.pair)}`);
    case 'inc-reg':
      return withPrefix(inst, `INC ${upper(inst.reg)}`);
    case 'add-pair':
      return withPrefix(inst, `ADD ${upper(inst.dest)},${upper(inst.src)}`);
    case 'sbc-pair':
      return withPrefix(inst, `SBC HL,${upper(inst.src)}`);
    case 'alu-reg':
      return withPrefix(inst, `${upper(inst.op)} ${upper(inst.src)}`);
    case 'alu-imm':
      return withPrefix(inst, `${upper(inst.op)} ${hex(inst.value, 2)}`);
    case 'djnz':
      return withPrefix(inst, `DJNZ ${hex(inst.target)}`);
    case 'lea':
      return withPrefix(inst, `LEA ${upper(inst.dest)},${upper(inst.base)}${signedByte(inst.displacement) >= 0 ? `+${signedByte(inst.displacement)}` : signedByte(inst.displacement)}`);
    case 'rotate-reg':
      return withPrefix(inst, `${upper(inst.op)} ${upper(inst.reg)}`);
    case 'bit-res':
      return withPrefix(inst, `RES ${inst.bit},${upper(inst.reg)}`);
    case 'mlt':
      return withPrefix(inst, `MLT ${upper(inst.reg)}`);
    case 'in-reg':
      return withPrefix(inst, `IN ${upper(inst.reg)},(C)`);
    case 'nop':
      return withPrefix(inst, 'NOP');
    case 'db':
      return withPrefix(inst, `DB ${hex(inst.value, 2)}`);
    default:
      return withPrefix(inst, `[${inst.tag}]`);
  }
}

function analyzeInstruction(pc, inst, comments, summary) {
  if (inst.tag === 'call') {
    summary.callSites.push({ pc, target: inst.target });
    const label = CALL_LABELS.get(inst.target);
    if (label) {
      comments.push(`call ${hex(inst.target)} (${label})`);
    }
  }

  if (inst.tag === 'jp-conditional' || inst.tag === 'jr-conditional') {
    summary.branches.push({ pc, text: formatInstruction(inst), note: BRANCH_NOTES.get(pc) ?? null });
    if (BRANCH_NOTES.has(pc)) {
      comments.push(BRANCH_NOTES.get(pc));
    }
  }

  if (inst.tag === 'ld-pair-mem' || inst.tag === 'ld-reg-mem') {
    const addr = inst.addr;
    if (typeof addr === 'number' && isRam(addr)) {
      if (inst.tag === 'ld-pair-mem' && inst.direction === 'to-mem') {
        summary.ramWrites.push({ pc, addr, text: formatInstruction(inst) });
        comments.push(`RAM write ${formatAddress(addr, 6, RAM_LABELS)}`);
      } else {
        summary.ramReads.push({ pc, addr, text: formatInstruction(inst) });
        comments.push(`RAM read ${formatAddress(addr, 6, RAM_LABELS)}`);
      }
    }
  }

  if (inst.tag === 'in-reg') {
    summary.portReads.push({ pc, port: null, text: formatInstruction(inst) });
  }

  const extraComments = PC_COMMENTS.get(pc);
  if (extraComments) {
    comments.push(...extraComments);
  }
}

function disassembleRange(start, stopExclusive, rows, summary) {
  for (let pc = start; pc < stopExclusive; ) {
    const inst = safeDecode(pc);
    const comments = [];

    analyzeInstruction(pc, inst, comments, summary);

    rows.push({
      pc,
      length: inst.length,
      bytes: formatBytes(pc, inst.length),
      text: formatInstruction(inst),
      comments,
    });

    pc = inst.nextPc;
  }
}

function decodeSelectorTable(rows) {
  rows.push({
    pc: TABLE_START,
    length: 2,
    bytes: formatBytes(TABLE_START, 2),
    text: `DW ${hex(TABLE_COUNT, 4)}`,
    comments: ['_seqcase entry count'],
  });

  for (let i = 0; i < TABLE_COUNT; i++) {
    const entryPc = TABLE_START + 2 + i * 4;
    const key = rom[entryPc];
    const target = read24(entryPc + 1);
    rows.push({
      pc: entryPc,
      length: 4,
      bytes: formatBytes(entryPc, 4),
      text: `CASE ${hex(key, 2)} -> ${hex(target)}`,
      comments: [key === 0 ? 'selector 0 path' : key === 2 ? 'selector 2 path' : 'selector entry'],
    });
  }

  const defaultPc = TABLE_START + 2 + TABLE_COUNT * 4;
  rows.push({
    pc: defaultPc,
    length: 3,
    bytes: formatBytes(defaultPc, 3),
    text: `DEFAULT ${hex(read24(defaultPc))}`,
    comments: ['unsupported selectors return via the common epilogue'],
  });
}

function scanDirectCallers() {
  const callers = [];

  for (let pc = 0; pc <= rom.length - CALL_PATTERN.length; pc++) {
    let matched = true;
    for (let i = 0; i < CALL_PATTERN.length; i++) {
      if (rom[pc + i] !== CALL_PATTERN[i]) {
        matched = false;
        break;
      }
    }

    if (!matched) {
      continue;
    }

    let selector = null;
    if (pc >= 5 && rom[pc - 5] === 0x01 && rom[pc - 1] === 0xC5) {
      selector = read24(pc - 4);
    }

    let pointerText = 'dynamic pointer argument';
    if (pc >= 11 && rom[pc - 11] === 0xED && rom[pc - 10] === 0x4B && rom[pc - 6] === 0xC5) {
      const addr = read24(pc - 9);
      pointerText = `push ptr from ${formatAddress(addr, 6, RAM_LABELS)}`;
    } else if (pc >= 9 && rom[pc - 9] === 0xDD && rom[pc - 8] === 0x07 && rom[pc - 6] === 0xC5) {
      const disp = signedByte(rom[pc - 7]);
      pointerText = `push ptr from (IX${disp >= 0 ? `+${hex(disp, 2)}` : `-${hex(-disp, 2)}`})`;
    }

    callers.push({
      pc,
      selector,
      pointerText,
      label: CALLER_LABELS.get(pc) ?? null,
      note: CALLER_NOTES.get(pc) ?? null,
    });
  }

  return callers;
}

const rows = [];
const summary = {
  callSites: [],
  ramReads: [],
  ramWrites: [],
  portReads: [],
  branches: [],
};

disassembleRange(START, TABLE_START, rows, summary);
decodeSelectorTable(rows);
disassembleRange(0x00E1F2, END + 1, rows, summary);

const directCallers = scanDirectCallers();
const uniqueCallTargets = [...new Set(summary.callSites.map((site) => site.target))].sort((a, b) => a - b);

const lines = [];
lines.push('# Phase 422 Probe: Static Trace of 0x00E1CC', '');
lines.push(`Function span: ${hex(START)}..${hex(END)} (${END - START + 1} bytes, includes a 13-byte inline _seqcase table)`);
lines.push('Selector table format after CALL 0x00211B: [u16 count][count x {u8 key, u24 target}][u24 default].');
lines.push('');
lines.push('Disassembly:');
for (const row of rows) {
  lines.push(
    `${hex(row.pc)}  ${row.bytes.padEnd(17, ' ')} ${row.text.padEnd(30, ' ')}${row.comments.length ? ` ; ${row.comments.join(' | ')}` : ''}`
  );
}
lines.push('');
lines.push('Port accesses inside 0x00E1CC:');
if (!summary.portReads.length) {
  lines.push('- none');
} else {
  for (const access of summary.portReads) {
    lines.push(`- ${hex(access.pc)} ${access.text}`);
  }
}
lines.push('');
lines.push('Absolute RAM reads inside 0x00E1CC:');
if (!summary.ramReads.length) {
  lines.push('- none');
} else {
  for (const entry of summary.ramReads) {
    lines.push(`- ${hex(entry.pc)} ${formatAddress(entry.addr, 6, RAM_LABELS)}`);
  }
}
lines.push('');
lines.push('Derived RAM writes inside 0x00E1CC:');
lines.push(`- ${hex(0x00E242)} -> ${formatAddress(0xD1405C, 6, RAM_LABELS)} + slotIndex`);
lines.push(`- ${hex(0x00E27B)} and ${hex(0x00E27E)} -> clear 16 two-byte cells starting at arg ptr (selector-0 slab)`);
lines.push(`- ${hex(0x00E2E4)} -> ${formatAddress(0xD1406C, 6, RAM_LABELS)} + slotIndex`);
lines.push('');
lines.push('CALL targets:');
for (const target of uniqueCallTargets) {
  const sites = summary.callSites.filter((site) => site.target === target).map((site) => hex(site.pc)).join(', ');
  lines.push(`- ${hex(target)}${CALL_LABELS.has(target) ? ` (${CALL_LABELS.get(target)})` : ''} <- ${sites}`);
}
lines.push('');
lines.push('Conditional branches:');
for (const branch of summary.branches) {
  lines.push(`- ${hex(branch.pc)} ${branch.text}${branch.note ? ` - ${branch.note}` : ''}`);
}
lines.push('');
lines.push('Direct caller sites to 0x00E1CC:');
for (const caller of directCallers) {
  const selectorText = caller.selector == null ? 'dynamic selector' : `selector ${hex(caller.selector, caller.selector <= 0xFF ? 2 : 6)}`;
  lines.push(`- ${hex(caller.pc)} ${selectorText} | ${caller.pointerText}${caller.label ? ` | ${caller.label}` : ''}${caller.note ? ` | ${caller.note}` : ''}`);
}
lines.push('');
lines.push('0x00FE10 calling convention cross-reference:');
lines.push(`- ${hex(0x00FFCB)} loads BC from ${formatAddress(0xD1400B, 6, RAM_LABELS)} and pushes it as arg1.`);
lines.push(`- ${hex(0x00FFD1)} loads BC = 0 and pushes it as arg0 (selector 0).`);
lines.push(`- ${hex(0x00FFC7)} has already stored a successor value into ${formatAddress(0xD1400E, 6, RAM_LABELS)} after decoding bytes +0..+2 of the current selector-0 block.`);
lines.push(`- After ${hex(0x00FFD6)}, ${hex(0x00FFDC)} moves ${formatAddress(0xD1400E, 6, RAM_LABELS)} back into ${formatAddress(0xD1400B, 6, RAM_LABELS)} and the caller continues the walk until ${formatAddress(0xD1400B, 6, RAM_LABELS)} reaches ${formatAddress(0xD14005, 6, RAM_LABELS)} or null.`);
lines.push('');
lines.push('Assessment:');
lines.push('- 0x00E1CC is a selector-driven slab free helper, not a TI-Link port-transfer loop.');
lines.push('- Selector 0 frees a 0x20-byte slab and wipes all 32 bytes as 16 two-byte cells.');
lines.push('- Selector 2 frees a 0x400-byte slab and only updates the free bitmap; it does not wipe the payload.');
lines.push('- No port I/O occurs inside the function. The only port tied to a direct caller is 0x3082 in the selector-2 wrapper at 0x01100C.');

console.log(lines.join('\n'));
