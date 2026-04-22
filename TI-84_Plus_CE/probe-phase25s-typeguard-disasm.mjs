#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase25s-typeguard-disasm-report.md');

const SYMBOLS = new Map([
  [0xd005f8, 'OP1[0]'],
  [0xd005f9, 'OP1[1]'],
  [0xd005fa, 'OP1[2]'],
  [0xd005fb, 'OP1[3]'],
  [0xd005fe, 'OP1[6]'],
  [0xd02504, 'typeClassScratch'],
  [0xd02590, 'OPBase'],
  [0xd02593, 'OPS'],
  [0xd0259a, 'pTemp'],
  [0xd0259d, 'progPtr'],
  [0xd02684, 'typeClassTableIndex'],
]);

const TARGETS = [
  {
    key: 'typeGuard',
    title: 'Type guard window',
    entry: 0x080084,
    focusEnd: 0x080098,
    start: 0x080084,
    size: 128,
  },
  {
    key: 'nameLength',
    title: 'Name-length helper window',
    entry: 0x0820cd,
    focusEnd: 0x0820ec,
    start: 0x0820cd,
    size: 96,
  },
];

const TARGET_NOTES = {
  typeGuard: new Map([
    [0x080084, 'Compare incoming A against type 0x15.'],
    [0x080086, 'If equal, return immediately with Z=1.'],
    [0x080087, 'Compare incoming A against type 0x17.'],
    [0x080089, 'If equal, return immediately with Z=1.'],
    [0x08008a, 'Skip the shared 0x080080 pre-normalization call when entered directly at 0x080084.'],
    [0x08008c, 'The 0x080080 entry normalizes A through 0x07F7BD, then falls through to the same compare chain.'],
    [0x080090, 'Compare incoming A against type 0x05.'],
    [0x080092, 'If equal, return with Z=1.'],
    [0x080093, 'Compare incoming A against type 0x16.'],
    [0x080095, 'If equal, return with Z=1.'],
    [0x080096, 'Final compare against type 0x06.'],
    [0x080098, 'Return with flags from cp 0x06. Z=1 only when A==0x06.'],
    [0x0800a0, 'Adjacent helper: tests bit 3 of IY+0x14.'],
    [0x0800a8, 'Adjacent helper: tests bit 7 of IY+0x09.'],
    [0x0800b3, 'Adjacent helper: tests bit 5 of IY+0x45.'],
    [0x0800b8, 'Adjacent helper: tests bit 5 of IY+0x44.'],
    [0x0800bd, 'Adjacent helper: tests bit 0 of IY+0x14.'],
    [0x0800c2, 'Adjacent helper: clears bit 3 of IY+0x14.'],
    [0x0800c7, 'Adjacent helper: points HL at OP1[2].'],
    [0x0800cb, 'Adjacent helper: sets bit 0 in OP1[2].'],
    [0x0800ec, 'Adjacent helper: begins a RAM writer used after the flag tests.'],
    [0x0800f6, 'Writes the derived class byte to 0xD02504.'],
    [0x080103, 'Writes the derived table index byte to 0xD02684.'],
  ]),
  nameLength: new Map([
    [0x0820cd, 'Preserve caller HL.'],
    [0x0820ce, 'Start scanning at OP1[1], not OP1[0].'],
    [0x0820d2, 'Load the first visible name/prefix byte.'],
    [0x0820d3, 'Compute firstByte - 0x5D. D becomes zero only when OP1[1] is ] .'],
    [0x0820d6, 'Limit the scan to eight bytes.'],
    [0x0820da, 'Search key A=0, so CPIR looks for the zero terminator.'],
    [0x0820db, 'Read OP1[1] through OP1[8] until NUL or the eight-byte limit is exhausted.'],
    [0x0820de, 'Default result is A=8 if no NUL is found.'],
    [0x0820e1, 'Convert the remaining count in C into the discovered string length.'],
    [0x0820e3, 'Only the one-byte case falls through for special handling.'],
    [0x0820e6, 'Save the computed length in E.'],
    [0x0820e7, 'Restore the first-byte comparison result from D.'],
    [0x0820ea, 'If the first byte was not ] , return the computed length unchanged.'],
    [0x0820eb, 'If the only byte was ] , bump the result from 1 to 2.'],
    [0x0820ed, 'Adjacent helper: allocator tail starts here.'],
    [0x0820f2, 'Read OPBase.'],
    [0x0820f9, 'Write the updated OPBase.'],
    [0x0820fd, 'Read OP1[6], the allocator-saved count/type slot.'],
    [0x082105, 'Read pTemp.'],
    [0x08210c, 'Write the updated pTemp.'],
    [0x082118, 'Normalize through 0x07F7BD before the broader 0x080080 filter chain.'],
    [0x082122, 'Calls 0x080080, not 0x080084, so this path includes pre-normalization.'],
    [0x082128, 'Read progPtr.'],
    [0x08212f, 'Write the updated progPtr.'],
    [0x082133, 'Read OPS.'],
  ]),
};

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function hexByte(value) {
  return hex(value & 0xff, 2);
}

function symbolFor(addr) {
  if (!SYMBOLS.has(addr)) return '';
  return SYMBOLS.get(addr);
}

function signedByte(value) {
  return value < 0x80 ? value : value - 0x100;
}

function formatIndexedOperand(indexRegister, displacement) {
  const disp = signedByte(displacement);
  return `(${indexRegister}${disp >= 0 ? `+${disp}` : `${disp}`})`;
}

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'call':
      return `call ${hex(inst.target)}`;
    case 'call-conditional':
      return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'jp':
      return `jp ${hex(inst.target)}`;
    case 'jp-conditional':
      return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jr':
      return `jr ${hex(inst.target)}`;
    case 'jr-conditional':
      return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'ret':
      return 'ret';
    case 'ret-conditional':
      return `ret ${inst.condition}`;
    case 'push':
      return `push ${inst.pair}`;
    case 'pop':
      return `pop ${inst.pair}`;
    case 'ld-pair-imm':
      return `ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-reg-imm':
      return `ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-reg-mem':
      return `ld ${inst.dest}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? `ld (${hex(inst.addr)}), ${inst.pair}`
        : `ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-reg-ind':
      return `ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg':
      return `ld (${inst.dest}), ${inst.src}`;
    case 'alu-imm':
      return `${inst.op} ${hexByte(inst.value)}`;
    case 'alu-reg':
      return `${inst.op} ${inst.src}`;
    case 'inc-reg':
      return `inc ${inst.reg}`;
    case 'inc-pair':
      return `inc ${inst.pair}`;
    case 'bit-test':
      return `bit ${inst.bit}, ${inst.reg}`;
    case 'bit-test-ind':
      return `bit ${inst.bit}, (hl)`;
    case 'bit-set-ind':
      return `set ${inst.bit}, (hl)`;
    case 'bit-res-ind':
      return `res ${inst.bit}, (hl)`;
    case 'indexed-cb-bit':
      return `bit ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'indexed-cb-res':
      return `res ${inst.bit}, ${formatIndexedOperand(inst.indexRegister, inst.displacement)}`;
    case 'cpir':
      return 'cpir';
    case 'sbc-pair':
      return `sbc hl, ${inst.src}`;
    case 'add-pair':
      return `add ${inst.dest}, ${inst.src}`;
    case 'ex-de-hl':
      return 'ex de, hl';
    default:
      return JSON.stringify(inst);
  }
}

function extraComments(inst) {
  const comments = [];

  if (inst.tag === 'ld-reg-mem' || inst.tag === 'ld-mem-reg' || inst.tag === 'ld-pair-mem') {
    const label = symbolFor(inst.addr);
    if (label) comments.push(label);
  }

  if (inst.tag === 'indexed-cb-bit' || inst.tag === 'indexed-cb-res') {
    comments.push(`${inst.indexRegister}+${hexByte(inst.displacement)}`);
  }

  return comments;
}

function readWindow(start, size) {
  return romBytes.subarray(start, start + size);
}

function renderRawBytes(start, size) {
  const bytes = readWindow(start, size);
  const lines = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const slice = bytes.subarray(i, i + 16);
    const body = Array.from(slice, (byte) => byte.toString(16).padStart(2, '0')).join(' ');
    lines.push(`${hex(start + i)}: ${body}`);
  }
  return lines.join('\n');
}

function decodeWindow(target) {
  const rows = [];
  const noteMap = TARGET_NOTES[target.key] || new Map();
  const end = target.start + target.size;
  let pc = target.start;

  while (pc < end) {
    const inst = decodeInstruction(romBytes, pc, 'adl');
    const bytes = Array.from(romBytes.subarray(pc, pc + inst.length), (byte) => byte.toString(16).padStart(2, '0')).join(' ');
    const comments = extraComments(inst);
    const note = noteMap.get(pc);
    if (note) comments.push(note);

    rows.push({
      pc,
      bytes,
      text: formatInstruction(inst),
      comments,
    });

    pc += inst.length;
  }

  return rows;
}

function renderDisasm(rows) {
  return rows
    .map((row) => {
      const comment = row.comments.length ? `  ; ${row.comments.join(' | ')}` : '';
      return `${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}${comment}`;
    })
    .join('\n');
}

function buildReport(results) {
  const typeRows = results.get('typeGuard');
  const nameRows = results.get('nameLength');
  const lines = [];

  lines.push('# Phase 25S - Type guard and name-length helper disassembly');
  lines.push('');
  lines.push('## Scope');
  lines.push('- ROM: `TI-84_Plus_CE/ROM.rom`');
  lines.push('- Decoder: `decodeInstruction(romBytes, pc, "adl")` from `ez80-decoder.js`');
  lines.push('- Requested windows: `0x080084` for 128 bytes and `0x0820CD` for 96 bytes');
  lines.push('- Important surrounding caller: shared Create allocator at `0x0822D9`');
  lines.push('');
  lines.push('## Direct answers');
  lines.push('');
  lines.push('### Type guard 0x080084');
  lines.push('- The actual type-guard subroutine is only `0x080084` through `0x080098`.');
  lines.push('- It checks `A` against exactly five values: `0x15`, `0x17`, `0x05`, `0x16`, and `0x06`.');
  lines.push('- It returns with `Z=1` only for those five values. All other inputs return with `Z=0`.');
  lines.push('- The shared allocator uses `jr z, 0x0822f8`, so only those five type bytes take the helper-count path immediately.');
  lines.push('- `CreateReal` enters with `A=0x00`, so `0x080084` returns `Z=0` there. That means `CreateReal` is supposed to take the non-`Z` path, not the special-type path.');
  lines.push('- `0x080084` itself does not read or write OP1 or any other absolute RAM address.');
  lines.push('');
  lines.push('### Name-length helper 0x0820CD');
  lines.push('- The actual helper is `0x0820CD` through `0x0820EC`; the remaining bytes in the 96-byte window belong to the adjacent allocator tail.');
  lines.push('- It starts at `OP1[1]` (`0xD005F9`), not `OP1[0]`.');
  lines.push('- With `A=0` and `BC=8`, `cpir` scans `OP1[1]` through `OP1[8]` for the zero terminator.');
  lines.push('- If no zero terminator is found in that range, it returns `A=8` with `NZ=1`.');
  lines.push('- Otherwise it returns the discovered byte length. The only special case is a one-byte string that consists of just `]` (`0x5D`): that case returns `2` instead of `1`.');
  lines.push('- The `A>=7` rejection is not inside `0x0820CD` itself. The caller at `0x0822EF` does `cp 0x07`, and `0x0822F1` follows with `jp nc, 0x061d1a`.');
  lines.push('');
  lines.push('### What CreateReal actually expects in OP1');
  lines.push('- `CreateReal` enters at `0x08238A` with `xor a`, so the type byte is `A=0x00`.');
  lines.push('- `0x0822D9` immediately stores that byte to `OP1[0]` at `0xD005F8`.');
  lines.push('- The visible name bytes begin at `OP1[1]`, which is why `0x0820CD` scans from `0xD005F9` onward.');
  lines.push('- A plain real named `A` therefore wants `OP1 = [0x00, 0x41, 0x00, ...]`, not a type byte in `OP1[1]`.');
  lines.push('- The later checks for `]`, `$`, `:`, and `r` at `0x0822E7` / `0x08239C` are prefix-byte checks on `OP1[1]` for alternate Create paths; they are not the type guard that `CreateReal` uses.');
  lines.push('');
  lines.push('## Accepted / rejected type bytes');
  lines.push('');
  lines.push('| Input A | 0x080084 result | Allocator meaning at 0x0822E1 |');
  lines.push('|---|---|---|');
  lines.push('| `0x05` | `Z=1` | take `jr z, 0x0822f8` |');
  lines.push('| `0x06` | `Z=1` | take `jr z, 0x0822f8` |');
  lines.push('| `0x15` | `Z=1` | take `jr z, 0x0822f8` |');
  lines.push('| `0x16` | `Z=1` | take `jr z, 0x0822f8` |');
  lines.push('| `0x17` | `Z=1` | take `jr z, 0x0822f8` |');
  lines.push('| anything else, including `0x00` | `Z=0` | stay on the non-`Z` path at `0x0822e3` |');
  lines.push('');
  lines.push('## Type guard window 0x080084');
  lines.push('');
  lines.push('Requested raw bytes (`128` bytes from `0x080084`):');
  lines.push('');
  lines.push('```text');
  lines.push(renderRawBytes(0x080084, 128));
  lines.push('```');
  lines.push('');
  lines.push('Annotated disassembly:');
  lines.push('');
  lines.push('```text');
  lines.push(renderDisasm(typeRows));
  lines.push('```');
  lines.push('');
  lines.push('Notes:');
  lines.push('- `0x080084` through `0x080098` is the real type guard.');
  lines.push('- `0x080080` is a sibling entry that first calls `0x07F7BD`, then falls through into the same compare chain at `0x080084`.');
  lines.push('- The rest of this 128-byte dump is nearby helper code; that is where the IY-relative flag tests and the `OP1[2]` write appear.');
  lines.push('');
  lines.push('## Name-length helper window 0x0820CD');
  lines.push('');
  lines.push('Requested raw bytes (`96` bytes from `0x0820CD`):');
  lines.push('');
  lines.push('```text');
  lines.push(renderRawBytes(0x0820cd, 96));
  lines.push('```');
  lines.push('');
  lines.push('Annotated disassembly:');
  lines.push('');
  lines.push('```text');
  lines.push(renderDisasm(nameRows));
  lines.push('```');
  lines.push('');
  lines.push('Notes:');
  lines.push('- `0x0820CD` through `0x0820EC` is the actual name-length helper.');
  lines.push('- `0x0820ED` onward is the allocator tail used after the helper result is pushed back into `OP1[6]`.');
  lines.push('- Because the scan starts at `OP1[1]`, the helper never treats `OP1[0]` as part of the visible name.');
  lines.push('');
  lines.push('## OP1 layout conclusion');
  lines.push('');
  lines.push('- `OP1[0]` at `0xD005F8` is the variable type byte supplied in `A` by the Create entry point.');
  lines.push('- `OP1[1]..` is the zero-terminated name or prefix-plus-name string consumed by `0x0820CD` and by the later `]/$/:/r` prefix checks.');
  lines.push('- `CreateReal` specifically uses `A=0x00`, so the correct setup for a simple one-letter name is `OP1[0]=0x00`, `OP1[1]=0x41`, `OP1[2]=0x00`.');
  lines.push('- The reason `0x08239C` seems to compare `OP1+1` against type-looking bytes is that it belongs to a different Create-family path after `CreateTemp` setup; it is not redefining the `CreateReal` type byte.');
  lines.push('');
  lines.push('## Caller-side rejection point');
  lines.push('');
  lines.push('The helper itself only computes a small length/count. The hard rejection happens one level up in the allocator:');
  lines.push('');
  lines.push('```text');
  lines.push('0x0822eb: cd cd 20 08        call 0x0820cd');
  lines.push('0x0822ef: fe 07              cp 0x07');
  lines.push('0x0822f1: d2 1a 1d 06        jp nc, 0x061d1a');
  lines.push('0x0822f5: 3c                 inc a');
  lines.push('```');
  lines.push('');
  lines.push('That is the exact `A >= 7` test: `cp 0x07` followed by `jp nc`.');

  return `${lines.join('\n')}\n`;
}

const romBytes = fs.readFileSync(ROM_PATH);
const results = new Map();

for (const target of TARGETS) {
  results.set(target.key, decodeWindow(target));
}

const report = buildReport(results);
fs.writeFileSync(REPORT_PATH, report);
console.log(report);
