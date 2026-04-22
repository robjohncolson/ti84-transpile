#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase25s-subroutine-disasm-report.md');

const ADL_MODE = 'adl';

const TARGETS = [
  {
    id: 'pointer-main',
    title: 'Pointer/slot helper window 0x082BBE',
    start: 0x082bbe,
    maxBytes: 192,
    required: true,
  },
  {
    id: 'heap-main',
    title: 'Heap/VAT move window 0x0821B9',
    start: 0x0821b9,
    maxBytes: 128,
    required: true,
  },
  {
    id: 'pointer-support',
    title: 'Support window 0x0822A4 (inner helper behind 0x082BBE)',
    start: 0x0822a4,
    maxBytes: 0x35,
    required: false,
  },
  {
    id: 'heap-tail',
    title: 'Support window 0x082235 (tail just beyond the 0x0821B9 slice)',
    start: 0x082235,
    maxBytes: 0x14,
    required: false,
  },
];

const SYMBOLS = new Map([
  [0xd005f8, 'OP1'],
  [0xd005f9, 'OP1+1'],
  [0xd02577, 'slot_D02577'],
  [0xd02587, 'tempMem'],
  [0xd0258a, 'FPSbase'],
  [0xd0258d, 'FPS'],
  [0xd02590, 'OPBase'],
  [0xd02593, 'OPS'],
  [0xd02596, 'pTempCnt'],
  [0xd0259a, 'pTemp'],
  [0xd0259d, 'progPtr'],
  [0xd025a0, 'newDataPtr'],
  [0xd025a3, 'pagedGetPtr'],
]);

const KNOWN_TARGETS = new Map([
  [0x04c990, 'record/shift helper'],
  [0x061d1a, 'error handler (0x061D1A)'],
  [0x061d3e, 'error handler (0x061D3E)'],
  [0x07f796, 'carry-test helper'],
  [0x080080, 'slot/length selector'],
  [0x082266, 'post-adjust helper'],
  [0x0822a4, 'length normalizer'],
  [0x0822ba, 'inner pointer helper'],
  [0x0824d6, 'tail helper A'],
  [0x0824fd, 'tail helper B'],
  [0x082739, 'post-move helper'],
]);

const romBytes = fs.readFileSync(ROM_PATH);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xff, 2);
}

function symbolFor(addr) {
  return SYMBOLS.get(addr) || '';
}

function targetNameFor(addr) {
  return KNOWN_TARGETS.get(addr) || '';
}

function formatInstruction(inst) {
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  const disp = (value) => (value >= 0 ? `+${value}` : `${value}`);

  let text = inst.tag;
  switch (inst.tag) {
    case 'call': text = `call ${hex(inst.target)}`; break;
    case 'call-conditional': text = `call ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp': text = `jp ${hex(inst.target)}`; break;
    case 'jp-conditional': text = `jp ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jr': text = `jr ${hex(inst.target)}`; break;
    case 'jr-conditional': text = `jr ${inst.condition}, ${hex(inst.target)}`; break;
    case 'ret': text = 'ret'; break;
    case 'ret-conditional': text = `ret ${inst.condition}`; break;
    case 'push': text = `push ${inst.pair}`; break;
    case 'pop': text = `pop ${inst.pair}`; break;
    case 'ex-af': text = "ex af, af'"; break;
    case 'ex-de-hl': text = 'ex de, hl'; break;
    case 'ld-pair-imm': text = `ld ${inst.pair}, ${hex(inst.value)}`; break;
    case 'ld-pair-mem':
      text = inst.direction === 'to-mem'
        ? `ld (${hex(inst.addr)}), ${inst.pair}`
        : `ld ${inst.pair}, (${hex(inst.addr)})`;
      break;
    case 'ld-mem-pair': text = `ld (${hex(inst.addr)}), ${inst.pair}`; break;
    case 'ld-reg-imm': text = `ld ${inst.dest}, ${hexByte(inst.value)}`; break;
    case 'ld-reg-mem': text = `ld ${inst.dest}, (${hex(inst.addr)})`; break;
    case 'ld-mem-reg': text = `ld (${hex(inst.addr)}), ${inst.src}`; break;
    case 'ld-reg-ind': text = `ld ${inst.dest}, (${inst.src})`; break;
    case 'ld-ind-reg': text = `ld (${inst.dest}), ${inst.src}`; break;
    case 'ld-reg-reg': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'inc-pair': text = `inc ${inst.pair}`; break;
    case 'dec-pair': text = `dec ${inst.pair}`; break;
    case 'inc-reg': text = `inc ${inst.reg}`; break;
    case 'dec-reg': text = `dec ${inst.reg}`; break;
    case 'add-pair': text = `add ${inst.dest}, ${inst.src}`; break;
    case 'alu-reg': text = `${inst.op} ${inst.src}`; break;
    case 'alu-imm': text = `${inst.op} ${hexByte(inst.value)}`; break;
    case 'sbc-pair': text = `sbc hl, ${inst.src}`; break;
    case 'adc-pair': text = `adc hl, ${inst.src}`; break;
    case 'ldd': text = 'ldd'; break;
    case 'lddr': text = 'lddr'; break;
    case 'ldir': text = 'ldir'; break;
    case 'indexed-cb-res': text = `res ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    default: break;
  }

  return `${prefix}${text}`;
}

function commentFor(inst) {
  const notes = [];

  if (Number.isInteger(inst.addr)) {
    const symbol = symbolFor(inst.addr);
    if (symbol) notes.push(symbol);
  }

  if (Number.isInteger(inst.target)) {
    const label = targetNameFor(inst.target);
    if (label) notes.push(label);
  }

  if (Number.isInteger(inst.value) && inst.tag === 'ld-pair-imm') {
    const symbol = symbolFor(inst.value);
    if (symbol) notes.push(symbol);
  }

  return notes.length > 0 ? ` ; ${notes.join(' / ')}` : '';
}

function disasmRange(startAddr, maxBytes) {
  const rows = [];
  let pc = startAddr;
  const end = startAddr + maxBytes;

  while (pc < end) {
    const inst = decodeInstruction(romBytes, pc, ADL_MODE);
    if (!inst || inst.length <= 0) {
      rows.push({
        pc,
        bytes: '',
        text: 'decode failed',
        comment: '',
      });
      break;
    }

    const bytes = Array.from(
      romBytes.slice(inst.pc, inst.pc + inst.length),
      (value) => value.toString(16).padStart(2, '0'),
    ).join(' ');

    rows.push({
      pc: inst.pc,
      bytes,
      text: formatInstruction(inst),
      comment: commentFor(inst),
    });

    pc += inst.length;
  }

  return rows;
}

function markdownTable(headers, rows) {
  const lines = [];
  lines.push(`| ${headers.join(' | ')} |`);
  lines.push(`| ${headers.map(() => '---').join(' | ')} |`);
  for (const row of rows) {
    lines.push(`| ${row.join(' | ')} |`);
  }
  lines.push('');
  return lines;
}

function renderListing(lines, dump) {
  lines.push(`### ${dump.title}`);
  lines.push('');
  lines.push(`Raw ROM bytes (${dump.maxBytes} bytes from ${hex(dump.start)}):`);
  lines.push('');
  lines.push(`\`${dump.raw}\``);
  lines.push('');
  lines.push('```text');
  for (const row of dump.rows) {
    lines.push(`${hex(row.pc)}: ${row.bytes.padEnd(18)} ${row.text}${row.comment}`);
  }
  lines.push('```');
  lines.push('');
}

function buildReport(dumps) {
  const get = (id) => dumps.find((dump) => dump.id === id);
  const pointerMain = get('pointer-main');
  const heapMain = get('heap-main');
  const pointerSupport = get('pointer-support');
  const heapTail = get('heap-tail');

  const lines = [];

  lines.push('# Phase 25S - Subroutine disassembly');
  lines.push('');
  lines.push('## Scope');
  lines.push('');
  lines.push(`- Main required dump: \`${hex(pointerMain.start)}\` for \`${pointerMain.maxBytes}\` bytes.`);
  lines.push(`- Main required dump: \`${hex(heapMain.start)}\` for \`${heapMain.maxBytes}\` bytes.`);
  lines.push(`- Support dump: \`${hex(pointerSupport.start)}\` for \`${pointerSupport.maxBytes}\` bytes.`);
  lines.push(`- Support dump: \`${hex(heapTail.start)}\` for \`${heapTail.maxBytes}\` bytes.`);
  lines.push('- Decoder: `decodeInstruction(romBytes, pc, "adl")` from `ez80-decoder.js`.');
  lines.push('- Symbol names for `tempMem`, `FPSbase`, `FPS`, `OPBase`, `OPS`, `pTemp`, `progPtr`, `newDataPtr`, and `pagedGetPtr` are taken from the local `ti84pceg.inc` copy.');
  lines.push('');
  lines.push('## Direct answers');
  lines.push('');
  lines.push('### 0x082BBE');
  lines.push('');
  lines.push('- The actual exported entry is only two instructions: `call 0x0822BA` followed by `ret nc`; carry falls through to `jp 0x061D3E`.');
  lines.push('- The real contract lives in the support window at `0x0822A4` / `0x0822BA`. Input `A` is the allocator-derived count byte and input `HL` is the requested object size.');
  lines.push('- `0x0822A4` starts from `C = A + 7`, calls `0x080080`, and if that path does not return early it checks `OP1+1`. Non-`]` names force `C = 9`; `]` names keep the earlier count-derived value.');
  lines.push('- `0x0822BA` pushes the original `HL`, calls `0x0822A4`, adds `BC` to the returned `HL`, calls `0x082266`, then pops `BC`. That is why the allocator sees `BC = original HL` after `call 0x082BBE`.');
  lines.push('- Direct RAM references in the entry contract are minimal: only `OP1+1` is read directly. There are no direct reads or writes of `OPBase`, `pTemp`, or `progPtr` in this contract.');
  lines.push('- The required 192-byte dump spills into adjacent helper routines after `0x082BC4`; those extra helpers touch `FPS`, `pagedGetPtr`, and `OP1`, but they are not part of the `0x082BBE` call contract itself.');
  lines.push('');
  lines.push('### 0x0821B9');
  lines.push('');
  lines.push('- Input contract: `BC = size` and the caller-supplied Z flag selects the short or full path. The normal allocator path forces `Z = 0` with `or 0x01`; the alternate path preserves `cp 0x24`, so `Z = 1` means the name started with `$`.');
  lines.push('- The helper always updates `FPSbase` (`0xD0258A`) and `FPS` (`0xD0258D`) by `size`. It computes `delta = old FPS - old FPSbase`, then uses the repeated `LDD` loop to shift that existing span upward by `size` bytes when `delta != 0`.');
  lines.push('- On the non-Z path it also increments `tempMem` (`0xD02587`) by `size`, compares `newDataPtr` (`0xD025A0`) against the old insertion pointer, and if they differ uses `LDDR` to shift the gap between `newDataPtr` and `FPSbase`. After that it calls `0x04C990`, `0x082739`, `0x0824D6`, and `0x0824FD`.');
  lines.push('- On the Z path it branches to `0x082235`, skips the `tempMem` update and the second `LDDR` move, decrements `DE`, calls `0x04C990`, and then rejoins the common `0x08222B` tail.');
  lines.push('- Return contract: `DE = old FPSbase` (the allocation / insertion pointer), `BC = original size`, and `AF` is restored before the final Z-path split.');
  lines.push('- There are no direct reads or writes of `OPBase` (`0xD02590`), `pTemp` (`0xD0259A`), or `progPtr` (`0xD0259D`) anywhere in the disassembled `0x0821B9` body or the short tail at `0x082235`.');
  lines.push('');
  lines.push('### Implication For The CreateReal Probe');
  lines.push('');
  lines.push('- These two helpers do not directly consume the `OPBase` / `pTemp` / `progPtr` trio. Their immediate pointer state is `tempMem`, `FPSbase`, `FPS`, `newDataPtr`, and `pagedGetPtr`.');
  lines.push('- That means seeding only `OPBase`, `pTemp`, and `progPtr` cannot satisfy the direct contract of `0x0821B9`.');
  lines.push('- From these slices alone, the observed `OPBase = 0xA88100` corruption must happen later in a callee, or as a downstream consequence of bad `FPS*` / `newDataPtr` seeds rather than from a direct write in `0x082BBE` or `0x0821B9`.');
  lines.push('');
  lines.push('## Direct RAM references');
  lines.push('');
  lines.push('### Pointer/slot entry contract');
  lines.push('');
  lines.push(...markdownTable(
    ['Address', 'Symbol', 'Access', 'Site(s)'],
    [
      ['`0xd005f9`', '`OP1+1`', 'read', '`0x0822b0 ld a, (0xd005f9)`'],
    ],
  ));
  lines.push('### Heap/VAT move');
  lines.push('');
  lines.push(...markdownTable(
    ['Address', 'Symbol', 'Access', 'Site(s)'],
    [
      ['`0xd0258a`', '`FPSbase`', 'read+write', '`0x0821ba ld hl, (0xd0258a)`<br>`0x0821c1 ld (0xd0258a), hl`<br>`0x082214 ld de, (0xd0258a)`'],
      ['`0xd0258d`', '`FPS`', 'read+write', '`0x0821c8 ld hl, (0xd0258d)`<br>`0x0821d2 ld (0xd0258d), hl`'],
      ['`0xd02587`', '`tempMem`', 'read+write', '`0x0821fc ld hl, (0xd02587)`<br>`0x082201 ld (0xd02587), hl`'],
      ['`0xd025a0`', '`newDataPtr`', 'read', '`0x082205 ld hl, (0xd025a0)`'],
      ['`0xd02577`', '`slot_D02577`', 'read', '`0x082226 ld bc, (0xd02577)`'],
    ],
  ));
  lines.push('### Adjacent helpers inside the required 0x082BBE dump');
  lines.push('');
  lines.push(...markdownTable(
    ['Address', 'Symbol', 'Access', 'Site(s)'],
    [
      ['`0xd0258d`', '`FPS`', 'read', '`0x082bc4 ld hl, (0xd0258d)`'],
      ['`0xd025a3`', '`pagedGetPtr`', 'read+write', '`0x082be9 ld (0xd025a3), de`<br>`0x082bf0 ld hl, (0xd025a3)`<br>`0x082bf6 ld (0xd025a3), hl`'],
      ['`0xd005f8`', '`OP1`', 'write', '`0x082c65 ld (0xd005f8), a`'],
    ],
  ));
  lines.push('## Reads-before-write');
  lines.push('');
  lines.push('### Pointer/slot entry contract');
  lines.push('');
  lines.push(...markdownTable(
    ['Address', 'Symbol', 'First read'],
    [
      ['`0xd005f9`', '`OP1+1`', '`0x0822b0 ld a, (0xd005f9)`'],
    ],
  ));
  lines.push('### Heap/VAT move');
  lines.push('');
  lines.push(...markdownTable(
    ['Address', 'Symbol', 'First read'],
    [
      ['`0xd0258a`', '`FPSbase`', '`0x0821ba ld hl, (0xd0258a)`'],
      ['`0xd0258d`', '`FPS`', '`0x0821c8 ld hl, (0xd0258d)`'],
      ['`0xd02587`', '`tempMem`', '`0x0821fc ld hl, (0xd02587)`'],
      ['`0xd025a0`', '`newDataPtr`', '`0x082205 ld hl, (0xd025a0)`'],
      ['`0xd02577`', '`slot_D02577`', '`0x082226 ld bc, (0xd02577)`'],
    ],
  ));
  lines.push('## Calls and exits');
  lines.push('');
  lines.push('### Pointer/slot helper path');
  lines.push('');
  lines.push(...markdownTable(
    ['Site', 'Kind', 'Target', 'Meaning'],
    [
      ['`0x082bbe`', 'call', '`0x0822ba`', 'inner pointer helper'],
      ['`0x082bb9`', 'error exit', '`0x061d3e`', 'error handler on carry'],
      ['`0x0822ab`', 'call', '`0x080080`', 'slot/length selector'],
      ['`0x0822c0`', 'call', '`0x082266`', 'post-adjust helper'],
    ],
  ));
  lines.push('### Heap/VAT move path');
  lines.push('');
  lines.push(...markdownTable(
    ['Site', 'Kind', 'Target', 'Meaning'],
    [
      ['`0x08221e`', 'call', '`0x04c990`', 'record/shift helper'],
      ['`0x082222`', 'call', '`0x082739`', 'post-move helper'],
      ['`0x08222b`', 'call', '`0x0824d6`', 'tail helper A'],
      ['`0x08222f`', 'call', '`0x0824fd`', 'tail helper B'],
      ['`0x082237`', 'call', '`0x04c990`', 'short Z-path helper'],
    ],
  ));
  lines.push('## Annotated disassembly');
  lines.push('');
  renderListing(lines, pointerMain);
  renderListing(lines, heapMain);
  renderListing(lines, pointerSupport);
  renderListing(lines, heapTail);

  return lines.join('\n');
}

const dumps = TARGETS.map((target) => ({
  ...target,
  raw: Array.from(
    romBytes.slice(target.start, target.start + target.maxBytes),
    (value) => value.toString(16).padStart(2, '0'),
  ).join(' '),
  rows: disasmRange(target.start, target.maxBytes),
}));

const report = buildReport(dumps);
fs.writeFileSync(REPORT_PATH, report, 'utf8');

console.log(`[phase25s] wrote ${path.relative(__dirname, REPORT_PATH)}`);
