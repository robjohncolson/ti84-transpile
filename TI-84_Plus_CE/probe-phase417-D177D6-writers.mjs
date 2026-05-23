#!/usr/bin/env node

import { readFileSync } from 'node:fs';

process.emitWarning = () => {};
const { decodeInstruction } = await import('./ez80-decoder.js');

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const D177D6 = 0xD177D6;
const WRITE_PATTERN = [0x32, 0xD6, 0x77, 0xD1];
const READ_PATTERN = [0x3A, 0xD6, 0x77, 0xD1];
const RESET_RANGE_PATTERN = [
  0x01, 0x71, 0x00, 0x00,
  0xC5,
  0x01, 0x00, 0x00, 0x00,
  0xC5,
  0x01, 0xBD, 0x77, 0xD1,
  0xC5,
  0xCD, 0x3A, 0x28, 0x00,
];

const WRITER_NOTES = new Map([
  [0x010284, { action: 'clear bit 1', slot: 'slot 1 (D177C0)', summary: 'clears pending bit1 immediately after slot 1 dispatch' }],
  [0x0102B6, { action: 'clear bit 2', slot: 'slot 2 (D177C3)', summary: 'clears pending bit2 immediately after slot 2 dispatch' }],
  [0x0102DB, { action: 'clear bit 3', slot: 'slot 3 (D177C6)', summary: 'clears pending bit3 immediately after slot 3 dispatch' }],
  [0x010315, { action: 'set bit 1', slot: 'slot 1 (D177C0)', summary: 'arms bit1 when `(IX-1) & 0x02` is set, after `CALL 0x007CD3` and `CALL 0x007CAD(2)`' }],
  [0x01033F, { action: 'set bit 2', slot: 'slot 2 (D177C3)', summary: 'arms bit2 when `(IX-1) & 0x04` is set; may refresh `D177D7` and replay `CALL 0x007CAD(2)` first' }],
  [0x010369, { action: 'set bit 3', slot: 'slot 3 (D177C6)', summary: 'arms bit3 when `(IX-1) & 0x08` is set; shares the `D177D7`/`0x007CAD(2)` gate' }],
]);

const DIRECT_LOAD_PATTERNS = [
  { label: 'LD BC,D177D6', bytes: [0x01, 0xD6, 0x77, 0xD1] },
  { label: 'LD DE,D177D6', bytes: [0x11, 0xD6, 0x77, 0xD1] },
  { label: 'LD HL,D177D6', bytes: [0x21, 0xD6, 0x77, 0xD1] },
  { label: 'LD IX,D177D6', bytes: [0xDD, 0x21, 0xD6, 0x77, 0xD1] },
  { label: 'LD IY,D177D6', bytes: [0xFD, 0x21, 0xD6, 0x77, 0xD1] },
  { label: 'LD HL,(D177D6)', bytes: [0x2A, 0xD6, 0x77, 0xD1] },
  { label: 'LD BC,(D177D6)', bytes: [0xED, 0x4B, 0xD6, 0x77, 0xD1] },
  { label: 'LD (D177D6),HL', bytes: [0x22, 0xD6, 0x77, 0xD1] },
  { label: 'LD (D177D6),BC', bytes: [0xED, 0x43, 0xD6, 0x77, 0xD1] },
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

function formatInstruction(inst) {
  const u = value => String(value).toUpperCase();

  switch (inst.tag) {
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${u(inst.condition)},${hex(inst.target)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${u(inst.condition)},${hex(inst.target)}`;
    case 'push':
      return `PUSH ${u(inst.pair)}`;
    case 'pop':
      return `POP ${u(inst.pair)}`;
    case 'ld-pair-imm':
      return `LD ${u(inst.pair)},${hex(inst.value)}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `LD (${hex(inst.addr)}),${u(inst.pair)}`
        : `LD ${u(inst.pair)},(${hex(inst.addr)})`;
    case 'ld-reg-imm':
      return `LD ${u(inst.dest)},${hex(inst.value, 2)}`;
    case 'ld-reg-mem':
      return `LD ${u(inst.dest)},(${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}),${u(inst.src)}`;
    case 'ld-reg-reg':
      return `LD ${u(inst.dest)},${u(inst.src)}`;
    case 'ld-reg-ixd':
      return `LD ${u(inst.dest)},(IX${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'ld-ixd-reg':
      return `LD (IX${inst.displacement >= 0 ? '+' : ''}${inst.displacement}),${u(inst.src)}`;
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
    case 'bit-res':
      return `RES ${inst.bit},${u(inst.reg)}`;
    case 'bit-set':
      return `SET ${inst.bit},${u(inst.reg)}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit},(IY${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'out-reg':
      return `OUT (C),${u(inst.reg)}`;
    case 'in-reg':
      return `IN ${u(inst.reg)},(C)`;
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

function selectBestSequence(hit, maxBack = 96) {
  const sequences = [];
  const searchStart = Math.max(0, hit - maxBack);

  for (let start = searchStart; start <= hit; start++) {
    let pc = start;
    const rows = [];
    let valid = true;

    while (pc < hit) {
      const inst = safeDecode(pc);
      if (!inst || inst.nextPc <= pc || inst.nextPc > hit) {
        valid = false;
        break;
      }
      rows.push({ pc, inst });
      pc = inst.nextPc;
    }

    if (valid && pc === hit) {
      sequences.push(rows);
    }
  }

  if (sequences.length === 0) {
    return [];
  }

  return sequences.sort((a, b) => {
    if (b.length !== a.length) {
      return b.length - a.length;
    }
    return (a[0]?.pc ?? hit) - (b[0]?.pc ?? hit);
  })[0];
}

function collectContextRows(hit, beforeCount = 8, afterCount = 4) {
  const prefix = selectBestSequence(hit, 128);
  const rows = prefix.slice(-beforeCount);
  let pc = hit;
  let remaining = afterCount + 1;

  while (remaining > 0 && pc < rom.length) {
    const inst = safeDecode(pc);
    rows.push({ pc, inst });
    if (!inst || inst.nextPc <= pc) {
      break;
    }
    pc = inst.nextPc;
    remaining--;
  }

  return rows;
}

function renderRows(rows) {
  return rows.map(({ pc, inst }) => {
    const bytes = rawBytes(pc, inst.length).padEnd(18, ' ');
    return `${hex(pc)}  ${bytes}  ${formatInstruction(inst)}`;
  }).join('\n');
}

const directWrites = patternHits(WRITE_PATTERN);
const directReads = patternHits(READ_PATTERN);
const otherDirectLoads = DIRECT_LOAD_PATTERNS
  .map(pattern => ({ ...pattern, hits: patternHits(pattern.bytes) }))
  .filter(pattern => pattern.hits.length > 0);
const resetRangeHits = patternHits(RESET_RANGE_PATTERN);

const lines = [];
lines.push('# Phase 417 Probe: D177D6 Writers', '');
lines.push(`Target byte: ${hex(D177D6)}  (D177BD + 0x19)`, '');
lines.push('## Direct D177D6 reads', '');

for (const pc of directReads) {
  lines.push(`${hex(pc)}  LD A,(${hex(D177D6)})`);
}

lines.push('', '## Direct D177D6 writes', '');
for (const pc of directWrites) {
  const meta = WRITER_NOTES.get(pc);
  lines.push(
    `${hex(pc)}  ${meta?.action ?? 'write'}`
      + `  ${meta?.slot ?? ''}`
      + `  ${meta?.summary ?? ''}`,
  );
}

lines.push('', '## Interpretation', '');
lines.push('- Slot 0 has no dedicated bit. `0x01026D` tests `D177D6` with `OR A`; any non-zero value lets slot 0 run first.');
lines.push('- Direct decode shows only bits 1, 2, and 3 are written in `D177D6`.');
lines.push('- Slot 4 is not driven by `D177D6`: `0x01036D` gates it on `(IX-1) & 0x10` and sets `D177E1 = 1` instead.', '');

lines.push('## No other direct-address forms found', '');
if (otherDirectLoads.length === 0) {
  lines.push('- No `LD BC/DE/HL/IX/IY,D177D6`, `LD HL,(D177D6)`, or `LD (D177D6),HL/BC` forms were found.');
} else {
  for (const pattern of otherDirectLoads) {
    lines.push(`- ${pattern.label}: ${pattern.hits.map(hit => hex(hit)).join(', ')}`);
  }
}

lines.push('', '## Indirect range clear covering D177D6', '');
if (resetRangeHits.length === 0) {
  lines.push('- No exact reset memset signature found.');
} else {
  for (const hit of resetRangeHits) {
    lines.push(`- ${hex(hit)}: pushes len=0x71, fill=0, base=0xD177BD, then CALL 0x00283A. This zero-fills 0xD177BD..0xD1782D and therefore clears D177D6 indirectly.`);
  }
}

lines.push('', '## Write contexts', '');
for (const pc of directWrites) {
  const meta = WRITER_NOTES.get(pc);
  lines.push(`### ${hex(pc)}  ${meta?.action ?? 'write'}  ${meta?.slot ?? ''}`, '', '```text');
  lines.push(renderRows(collectContextRows(pc)));
  lines.push('```', '');
}

console.log(lines.join('\n'));
