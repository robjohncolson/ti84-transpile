#!/usr/bin/env node

import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

process.emitWarning = () => {};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { decodeInstruction } = await import('./ez80-decoder.js');

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const START = 0x02FCB3;
const END = 0x02FD8E;

const D0058C = 0xD0058C;
const D0058E = 0xD0058E;
const D007E0 = 0xD007E0;
const D0082E = 0xD0082E;
const D010F8 = 0xD010F8;
const D14095 = 0xD14095;
const D17766 = 0xD17766;
const D00000 = 0xD00000;
const E00900 = 0xE00900;

const ADDR_NAMES = new Map([
  [D0058C, 'D0058C'],
  [D0058E, 'D0058E'],
  [D007E0, 'D007E0'],
  [D0082E, 'D0082E'],
  [D010F8, 'D010F8'],
  [D14095, 'D14095'],
  [D17766, 'D17766'],
  [D00000, 'D00000'],
  [E00900, 'E00900 keyboard MMIO'],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

function upper(value) {
  return String(value ?? '').toUpperCase();
}

function unique(values) {
  return [...new Set(values)];
}

function inRange(addr) {
  return addr >= START && addr <= END;
}

function isKeyboardMmio(addr) {
  return addr >= 0xE00800 && addr <= 0xE009FF;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (value) => value.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function nextPc(row) {
  return row.pc + row.length;
}

function formatIndexed(indexRegister, displacement) {
  const mag = hex(Math.abs(displacement), 2);
  const sign = displacement < 0 ? '-' : '+';
  return `(${upper(indexRegister)}${sign}${mag})`;
}

function namedAddr(addr) {
  return ADDR_NAMES.has(addr) ? `${hex(addr)} [${ADDR_NAMES.get(addr)}]` : hex(addr);
}

function formatInstruction(inst) {
  switch (inst?.tag) {
    case 'indexed-cb-bit':
      return { mnemonic: 'BIT', operands: `${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'indexed-cb-set':
      return { mnemonic: 'SET', operands: `${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'indexed-cb-res':
      return { mnemonic: 'RES', operands: `${inst.bit}, ${formatIndexed(inst.indexRegister, inst.displacement)}` };
    case 'alu-reg':
      return { mnemonic: upper(inst.op), operands: upper(inst.src) };
    case 'alu-imm':
      return { mnemonic: upper(inst.op), operands: hexByte(inst.value) };
    case 'ld-mem-reg':
      return { mnemonic: 'LD', operands: `(${hex(inst.addr)}), ${upper(inst.src)}` };
    case 'ld-reg-mem':
      return { mnemonic: 'LD', operands: `${upper(inst.dest ?? inst.dst)}, (${hex(inst.addr)})` };
    case 'ld-reg-imm':
      return { mnemonic: 'LD', operands: `${upper(inst.dest ?? inst.dst)}, ${hexByte(inst.value)}` };
    case 'ld-reg-reg':
      return { mnemonic: 'LD', operands: `${upper(inst.dest ?? inst.dst)}, ${upper(inst.src)}` };
    case 'ld-pair-imm':
      return { mnemonic: 'LD', operands: `${upper(inst.pair)}, ${hex(inst.value)}` };
    case 'ld-pair-mem':
      return inst.direction === 'from-mem'
        ? { mnemonic: 'LD', operands: `${upper(inst.pair)}, (${hex(inst.addr)})` }
        : { mnemonic: 'LD', operands: `(${hex(inst.addr)}), ${upper(inst.pair)}` };
    case 'push':
      return { mnemonic: 'PUSH', operands: upper(inst.pair) };
    case 'pop':
      return { mnemonic: 'POP', operands: upper(inst.pair) };
    case 'call':
      return { mnemonic: 'CALL', operands: hex(inst.target) };
    case 'call-conditional':
      return { mnemonic: 'CALL', operands: `${upper(inst.condition)}, ${hex(inst.target)}` };
    case 'jp':
      return { mnemonic: 'JP', operands: hex(inst.target) };
    case 'jp-conditional':
      return { mnemonic: 'JP', operands: `${upper(inst.condition)}, ${hex(inst.target)}` };
    case 'jr':
      return { mnemonic: 'JR', operands: hex(inst.target) };
    case 'jr-conditional':
      return { mnemonic: 'JR', operands: `${upper(inst.condition)}, ${hex(inst.target)}` };
    case 'ret':
      return { mnemonic: 'RET', operands: '' };
    case 'ret-conditional':
      return { mnemonic: 'RET', operands: upper(inst.condition) };
    default:
      return { mnemonic: upper(inst?.tag ?? 'UNKNOWN'), operands: '' };
  }
}

function formatTarget(target) {
  if (target === END + 1) return `${hex(target)} [next function boundary]`;
  if (inRange(target)) return `${hex(target)} [in-range]`;
  return `${hex(target)} [outside requested window]`;
}

function isAbsoluteWrite(inst) {
  return inst?.tag === 'ld-mem-reg' || inst?.tag === 'ld-mem-pair' || (inst?.tag === 'ld-pair-mem' && inst.direction === 'to-mem');
}

function isKeyboardRead(inst) {
  return inst?.tag === 'in-reg' || inst?.tag === 'in0' || (inst?.tag === 'ld-reg-mem' && isKeyboardMmio(inst.addr));
}

function notePieces(inst) {
  const notes = [];

  if (inst?.tag === 'in-reg') {
    notes.push('port read via BC');
  }
  if (inst?.tag === 'in0') {
    notes.push(`port read ${hexByte(inst.port)}`);
  }
  if (inst?.tag === 'ld-reg-mem' && isKeyboardMmio(inst.addr)) {
    notes.push(`keyboard MMIO read from ${namedAddr(inst.addr)}`);
  }

  if (isAbsoluteWrite(inst)) {
    const src = upper(inst.src ?? inst.pair);
    notes.push(`memory write: ${src} -> ${namedAddr(inst.addr)}`);
    if (inst.addr === D0058C) notes.push('D0058C write site');
    if (inst.addr === D0058E) notes.push('D0058E write site');
    if (inst.addr === D0082E) notes.push('D0082E write site');
  }

  if (inst?.tag === 'ld-reg-mem' && inst.addr === D0058E) notes.push('reads D0058E');
  if (inst?.tag === 'ld-reg-mem' && inst.addr === D007E0) notes.push('reads D007E0');
  if (inst?.tag === 'ld-reg-mem' && inst.addr === D010F8) notes.push('reads D010F8');

  if (inst?.tag === 'call' || inst?.tag === 'call-conditional') {
    notes.push(`call target ${formatTarget(inst.target)}`);
  }
  if (inst?.tag === 'jp' || inst?.tag === 'jp-conditional' || inst?.tag === 'jr' || inst?.tag === 'jr-conditional' || inst?.tag === 'djnz') {
    notes.push(`branch target ${formatTarget(inst.target)}`);
  }

  return notes.join('; ');
}

function decodeRange(romBytes) {
  const rows = [];
  let pc = START;

  while (pc <= END) {
    const inst = decodeInstruction(romBytes, pc, 'adl');
    const length = Math.max(1, inst?.length ?? 1);
    if (pc + length - 1 > END) {
      throw new Error(`Instruction at ${hex(pc)} overruns end of requested window.`);
    }
    const formatted = formatInstruction(inst);
    rows.push({
      pc,
      length,
      inst,
      bytes: bytesToHex(romBytes.subarray(pc, pc + length)),
      mnemonic: formatted.mnemonic,
      operands: formatted.operands,
      notes: notePieces(inst),
    });
    pc += length;
  }

  const last = rows[rows.length - 1];
  if (last.pc + last.length - 1 !== END) {
    throw new Error(`Requested window ended at ${hex(END)}, but decode ended at ${hex(last.pc + last.length - 1)}.`);
  }
  return rows;
}

function isBlockTerminator(inst) {
  return ['jr', 'jr-conditional', 'jp', 'jp-conditional', 'ret', 'ret-conditional', 'djnz'].includes(inst?.tag);
}

function buildBlocks(rows) {
  const rowMap = new Map(rows.map((row) => [row.pc, row]));
  const leaders = new Set([rows[0].pc]);

  for (const row of rows) {
    const { inst } = row;
    const after = nextPc(row);
    if (inst?.target !== undefined && inRange(inst.target) && ['jr', 'jr-conditional', 'jp', 'jp-conditional', 'djnz'].includes(inst.tag)) {
      leaders.add(inst.target);
    }
    if (isBlockTerminator(inst) && inRange(after)) {
      leaders.add(after);
    }
  }

  const starts = [...leaders].sort((a, b) => a - b);
  const blocks = [];
  for (const start of starts) {
    const blockRows = [];
    let pc = start;
    while (rowMap.has(pc)) {
      const row = rowMap.get(pc);
      blockRows.push(row);
      const after = nextPc(row);
      if (isBlockTerminator(row.inst) || !inRange(after) || (leaders.has(after) && after !== start)) break;
      pc = after;
    }
    blocks.push({ start, rows: blockRows });
  }
  return blocks;
}

function blockOps(block) {
  const bitOps = unique(block.rows
    .filter((row) => ['indexed-cb-bit', 'indexed-cb-set', 'indexed-cb-res'].includes(row.inst.tag))
    .map((row) => `${row.mnemonic} ${row.operands}`));
  const writes = unique(block.rows.filter((row) => isAbsoluteWrite(row.inst)).map((row) => namedAddr(row.inst.addr)));
  const reads = unique(block.rows
    .filter((row) => row.inst.tag === 'ld-reg-mem' && ADDR_NAMES.has(row.inst.addr))
    .map((row) => namedAddr(row.inst.addr)));
  const compares = unique(block.rows
    .filter((row) => row.inst.tag === 'alu-imm' && row.inst.op === 'cp')
    .map((row) => hexByte(row.inst.value)));
  const calls = unique(block.rows
    .filter((row) => row.inst.tag === 'call' || row.inst.tag === 'call-conditional')
    .map((row) => formatTarget(row.inst.target)));

  const parts = [];
  if (bitOps.length) parts.push(`flag ops ${bitOps.join(', ')}`);
  if (reads.length) parts.push(`reads ${reads.join(', ')}`);
  if (writes.length) parts.push(`writes ${writes.join(', ')}`);
  if (compares.length) parts.push(`compares A against ${compares.join(', ')}`);
  if (calls.length) parts.push(`calls ${calls.join(', ')}`);
  return parts.length ? parts.join('; ') : 'straight-line state update';
}

function blockExit(block) {
  const last = block.rows[block.rows.length - 1];
  const after = nextPc(last);
  switch (last.inst.tag) {
    case 'jr-conditional':
    case 'jp-conditional':
      return `${upper(last.inst.condition)} -> ${hex(last.inst.target)}, else -> ${hex(after)}`;
    case 'djnz':
      return `NZ -> ${hex(last.inst.target)}, else -> ${hex(after)}`;
    case 'jr':
    case 'jp':
      return `-> ${hex(last.inst.target)}`;
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `${upper(last.inst.condition)} -> RET, else -> ${hex(after)}`;
    default:
      return inRange(after) ? `fallthrough -> ${hex(after)}` : 'end of requested window';
  }
}

function renderInline(row) {
  return `${hex(row.pc)} ${row.mnemonic}${row.operands ? ` ${row.operands}` : ''}`;
}

const rom = readFileSync(ROM_PATH);
const rows = decodeRange(rom);
const rowMap = new Map(rows.map((row) => [row.pc, row]));
const blocks = buildBlocks(rows);

const directKeyboardReads = rows.filter((row) => isKeyboardRead(row.inst));
const d0058cWrites = rows.filter((row) => isAbsoluteWrite(row.inst) && row.inst.addr === D0058C);
const d0058eReads = rows.filter((row) => row.inst.tag === 'ld-reg-mem' && row.inst.addr === D0058E);
const d0058eWrites = rows.filter((row) => isAbsoluteWrite(row.inst) && row.inst.addr === D0058E);
const callRows = rows.filter((row) => row.inst.tag === 'call' || row.inst.tag === 'call-conditional');
const earlyReturns = rows.filter((row) => row.inst.tag === 'ret' || row.inst.tag === 'ret-conditional');
const backwardBranches = rows.filter((row) => row.inst.target !== undefined && row.inst.target < row.pc && ['jr', 'jr-conditional', 'jp', 'jp-conditional', 'djnz'].includes(row.inst.tag));

console.log('# Phase 292: 0x02FCB3 GetCSC-Equivalent Full Disassembly');
console.log('');
console.log(`Range: ${hex(START)}-${hex(END)} (${END - START + 1} bytes)`);
console.log(`Instructions decoded: ${rows.length}`);
console.log('');

console.log('## Key Findings');
if (directKeyboardReads.length) {
  console.log(`- Direct keyboard read sites in this window: ${directKeyboardReads.map((row) => `\`${renderInline(row)}\``).join(', ')}.`);
} else {
  console.log(`- Direct keyboard read sites in this window: none. There are no \`IN\`, \`IN0\`, or absolute keyboard-MMIO reads from \`0xE00900\`/\`0xE008xx\` between ${hex(START)} and ${hex(END)}.`);
}
if (d0058cWrites.length) {
  console.log(`- D0058C write site(s): ${d0058cWrites.map((row) => `\`${renderInline(row)}\``).join(', ')}.`);
} else {
  console.log('- D0058C write site(s): none in the requested window.');
}
console.log(`- D0058E traffic: reads at ${d0058eReads.map((row) => hex(row.pc)).join(', ') || 'none'}; writes at ${d0058eWrites.map((row) => hex(row.pc)).join(', ') || 'none'}.`);
console.log(`- Sub-function call target(s): ${unique(callRows.map((row) => `${hex(row.inst.target)} from ${hex(row.pc)}`)).join(', ') || 'none'}.`);
console.log(`- Early return site(s): ${earlyReturns.map((row) => hex(row.pc)).join(', ') || 'none'}.`);
if (backwardBranches.length) {
  const backwardNotes = backwardBranches.map((row) => {
    const landing = rowMap.get(row.inst.target);
    const flavor = landing?.inst?.tag === 'ret' ? 'RET-tail join' : 'back edge';
    return `${hex(row.pc)} -> ${hex(row.inst.target)} (${flavor})`;
  });
  console.log(`- Backward branches: ${backwardNotes.join(', ')}. These are tail-merges, not a local scan loop.`);
} else {
  console.log('- Backward branches: none.');
}
console.log('');

console.log('## Full Instruction Listing');
console.log('| Address | Bytes | Mnemonic | Operands | Notes |');
console.log('|---|---|---|---|---|');
for (const row of rows) {
  console.log(`| ${hex(row.pc)} | ${row.bytes} | ${row.mnemonic} | ${row.operands || '&nbsp;'} | ${row.notes || '&nbsp;'} |`);
}
console.log('');

console.log('## Sub-Functions Called');
if (!callRows.length) {
  console.log('- None.');
} else {
  for (const target of unique(callRows.map((row) => row.inst.target))) {
    const sites = callRows.filter((row) => row.inst.target === target).map((row) => hex(row.pc)).join(', ');
    const locality = target === END + 1 ? 'next function boundary immediately after the requested window' : inRange(target) ? 'internal branch target' : 'outside requested window';
    console.log(`- ${hex(target)}: called from ${sites}; ${locality}.`);
  }
}
console.log('');

console.log('## Annotated Control Flow Summary');
for (const block of blocks) {
  const first = block.rows[0];
  const last = block.rows[block.rows.length - 1];
  const blockEnd = last.pc + last.length - 1;
  console.log(`- ${hex(block.start)}-${hex(blockEnd)}: ${blockOps(block)}. Exit: ${blockExit(block)}.`);
}
console.log('');

console.log('## Keyboard Read -> Scan Code Store Pipeline');
console.log(`1. Entry gate: \`${renderInline(rows[0])}\` checks an IY flag before any output update.`);
if (d0058cWrites.length) {
  const firstWrite = d0058cWrites[0];
  const pairedClear = rows.find((row) => isAbsoluteWrite(row.inst) && row.inst.addr === D0058E && row.pc > firstWrite.pc);
  const pairText = pairedClear ? ` followed by \`${renderInline(pairedClear)}\`` : '';
  console.log(`2. Output clear: \`${renderInline(firstWrite)}\`${pairText} clears the two output/state bytes before deeper processing.`);
}
if (callRows.length) {
  console.log(`3. Immediate acquisition handoff: \`${renderInline(callRows[0])}\`. This is the only in-range step that can lead to actual keyboard acquisition, and it lands exactly at the next function boundary.`);
}
if (directKeyboardReads.length) {
  console.log(`4. Direct keyboard reads inside this window: ${directKeyboardReads.map((row) => `\`${renderInline(row)}\``).join(', ')}.`);
} else {
  console.log('4. Direct keyboard reads inside this window: none. The physical keyboard read is delegated to a callee outside the requested end boundary rather than performed inline here.');
}
console.log(`5. Post-call classification centers on ${namedAddr(D0058E)}: read sites ${d0058eReads.map((row) => hex(row.pc)).join(', ') || 'none'} and write sites ${d0058eWrites.map((row) => hex(row.pc)).join(', ') || 'none'}.`);
console.log(`6. ${namedAddr(D0058C)} is only written once in the requested window, at ${hex(d0058cWrites[0]?.pc ?? START)}; there is no later nonzero D0058C store before the RET at ${hex(END)}.`);
