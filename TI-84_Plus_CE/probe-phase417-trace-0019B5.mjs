#!/usr/bin/env node

import { readFileSync } from 'node:fs';

process.emitWarning = () => {};
const { decodeInstruction } = await import('./ez80-decoder.js');

const rom = readFileSync(new URL('./ROM.rom', import.meta.url));

const ENTRY_START = 0x0019B5;
const PRIMARY_END = 0x001A19;
const HANDLER_RANGES = [
  [0x001A32, 0x001A4A, 'common exit'],
  [0x001A4B, 0x001A5D, 'byte1 bit6 service'],
  [0x001A5D, 0x001A77, 'byte2 bit3 service'],
  [0x001A77, 0x001A8D, 'byte1 bit5 service'],
  [0x001A8D, 0x001AA3, 'byte1 bit4 service'],
  [0x001AA3, 0x001ABB, 'byte0 bit3 service'],
  [0x001ABB, 0x001ACF, 'byte1 bit2 service'],
  [0x001ACF, 0x001AF7, 'byte0 bit4 service'],
];

const CALLER_NOTES = new Map([
  [0x0003AC, 'low-ROM vector relay'],
  [0x000873, 'early boot terminal jump'],
  [0x001420, 'init/dispatch terminal jump'],
  [0x001BA8, 'setup/boot terminal jump'],
  [0x0094F7, 'runtime service block'],
  [0x0099A3, 'runtime service block'],
  [0x0099B8, 'runtime service block guarded by D1772D'],
  [0x00F3FB, 'service block guarded by D177BA bit7'],
  [0x01401A, '0x006EDA continuation'],
  [0x0141B3, 'port-0x03/error continuation'],
  [0x0149D2, '0x006EDA continuation'],
  [0x0149ED, '0x006EDA continuation'],
  [0x015110, '0x0150C2 channel-3 path'],
]);

const SERVICE_MAP = [
  { statusPort: 0x5015, bit: 6, ackPort: 0x5009, target: 0x001A4B, effect: 'ack 0x40 and return' },
  { statusPort: 0x5015, bit: 5, ackPort: 0x5009, target: 0x001A77, effect: 'ack 0x20 and CALL 0x009B35' },
  { statusPort: 0x5015, bit: 4, ackPort: 0x5009, target: 0x001A8D, effect: 'ack 0x10 and CALL 0x010220' },
  { statusPort: 0x5015, bit: 2, ackPort: 0x5009, target: 0x001ABB, effect: 'ack 0x04 and return' },
  { statusPort: 0x5014, bit: 3, ackPort: 0x5008, target: 0x001AA3, effect: 'ack 0x08 and CALL 0x014DAB' },
  { statusPort: 0x5014, bit: 4, ackPort: 0x5008, target: 0x001ACF, effect: 'ack 0x10 and decrement D02658/D02651' },
  { statusPort: 0x5016, bit: 3, ackPort: 0x500A, target: 0x001A5D, effect: 'ack 0x08 and clear enable bit3 in 0x5006' },
];

const RAM_SUMMARY = [
  '0xD02AD7: updated in the common exit from POP HL before RETI',
  '0xD0009B: bit 6 cleared in the common exit via RES 6,(IY+0x1B)',
  '0xD02658: 24-bit counter decremented on the byte0/bit4 path',
  '0xD02651: 8-bit counter decremented on the byte0/bit4 path',
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
    case 'ld-reg-ind':
      return `LD ${u(inst.dest)},(${u(inst.src)})`;
    case 'ld-ind-reg':
      return `LD (${u(inst.dest)}),${u(inst.src)}`;
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
    case 'indexed-cb-res':
      return `RES ${inst.bit},(IY${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'bit-set':
      return `SET ${inst.bit},${u(inst.reg)}`;
    case 'indexed-cb-set':
      return `SET ${inst.bit},(IY${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`;
    case 'di':
      return 'DI';
    case 'ei':
      return 'EI';
    case 'nop':
      return 'NOP';
    case 'halt':
      return 'HALT';
    case 'out0':
      return `OUT0 (${hex(inst.port, 2)}),${u(inst.reg)}`;
    case 'out-reg':
      return `OUT (C),${u(inst.reg)}`;
    case 'in0':
      return `IN0 ${u(inst.reg)},(${hex(inst.port, 2)})`;
    case 'in-reg':
      return `IN ${u(inst.reg)},(C)`;
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
    case 'db':
      return `DB ${hex(inst.value, 2)}`;
    default:
      return `[${inst.tag}]`;
  }
}

function decodeRange(start, end) {
  const rows = [];
  let pc = start;

  while (pc < end) {
    const inst = safeDecode(pc);
    rows.push({ pc, inst });
    if (!inst || inst.nextPc <= pc) {
      break;
    }
    pc = inst.nextPc;
  }

  return rows;
}

function renderRows(rows) {
  return rows.map(({ pc, inst }) => {
    const bytes = rawBytes(pc, inst.length).padEnd(18, ' ');
    return `${hex(pc)}  ${bytes}  ${formatInstruction(inst)}`;
  }).join('\n');
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

function collectContextRows(hit, beforeCount = 6, afterCount = 4) {
  const prefix = selectBestSequence(hit, 96);
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

const callSites = patternHits([0xCD, 0xB5, 0x19, 0x00]).map(pc => ({ pc, kind: 'CALL' }));
const jpSites = patternHits([0xC3, 0xB5, 0x19, 0x00]).map(pc => ({ pc, kind: 'JP' }));
const directCallers = [...jpSites, ...callSites].sort((a, b) => a.pc - b.pc);

const lines = [];
lines.push('# Phase 417 Probe: Trace 0x0019B5', '');
lines.push('## Direct callers', '');

for (const site of directCallers) {
  lines.push(`${hex(site.pc)}  ${site.kind.padEnd(4)}  ${CALLER_NOTES.get(site.pc) ?? 'unlabeled caller'}`);
}

lines.push('', '## Entry window 0x0019B5-0x001A18', '', '```text');
lines.push(renderRows(decodeRange(ENTRY_START, PRIMARY_END)));
lines.push('```', '');
lines.push('## Service map', '');

for (const entry of SERVICE_MAP) {
  lines.push(
    `${hex(entry.statusPort, 4)} bit${entry.bit}`
      + ` -> ack ${hex(entry.ackPort, 4)}`
      + ` -> ${hex(entry.target)}`
      + ` -> ${entry.effect}`,
  );
}

lines.push('', '## Common RAM side effects', '');
for (const row of RAM_SUMMARY) {
  lines.push(`- ${row}`);
}

lines.push('', '## Inference', '');
lines.push('- The entry sequence is `DI; LD A,0x10; OUT0 (0x00),A; NOP; NOP; HALT`. In this repo, port `0x0000` is the CPU control register.');
lines.push('- After HALT, the routine polls the FTINTC010 masked-status bytes at `0x5015`, `0x5014`, and `0x5016`, then acknowledges via `0x5009`, `0x5008`, and `0x500A`.');
lines.push('- The byte1/bit4 service path (`0x001A8D`) calls `0x010220`, the display callback dispatcher. The byte0/bit3 path calls `0x014DAB`. The byte1/bit5 path calls `0x009B35`.');
lines.push('- Best label: post-HALT masked-IRQ dispatcher / service entry, not a small cleanup stub.', '');

lines.push('## Handler ranges', '');
for (const [start, end, label] of HANDLER_RANGES) {
  lines.push(`### ${hex(start)}-${hex(end - 1)} ${label}`, '', '```text');
  lines.push(renderRows(decodeRange(start, end)));
  lines.push('```', '');
}

lines.push('## Caller windows', '');
for (const site of directCallers) {
  lines.push(`### ${hex(site.pc)} ${site.kind} ${hex(ENTRY_START)}  ${CALLER_NOTES.get(site.pc) ?? ''}`, '', '```text');
  lines.push(renderRows(collectContextRows(site.pc)));
  lines.push('```', '');
}

console.log(lines.join('\n'));
