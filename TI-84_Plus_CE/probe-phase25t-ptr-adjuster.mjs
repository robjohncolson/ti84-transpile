#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase25t-ptr-adjuster-report.md');

const ADL_MODE = 'adl';

// All targets to disassemble
const TARGETS = [
  { id: 'negate-bc', title: 'Negate-BC helper (0x04C990)', start: 0x04c990, maxBytes: 32 },
  { id: 'post-move', title: 'Post-move / VAT pointer walker (0x082739)', start: 0x082739, maxBytes: 192 },
  { id: 'tail-a', title: 'Tail helper A (0x0824D6) — D02317/D0231A/D0231D adjuster', start: 0x0824d6, maxBytes: 64 },
  { id: 'tail-b', title: 'Tail helper B (0x0824FD) — per-pointer updater via 0x0825D1', start: 0x0824fd, maxBytes: 96 },
  { id: 'ptr-update-sub', title: 'Pointer update subroutine (0x0825D1)', start: 0x0825d1, maxBytes: 64 },
  { id: 'post-adjust', title: 'Post-adjust helper (0x082266)', start: 0x082266, maxBytes: 64 },
  { id: 'ptr-adj-082823', title: 'Pointer adjuster (0x082823) — called for pTemp/progPtr', start: 0x082823, maxBytes: 64 },
  { id: 'post-move-tail', title: 'Post-move tail (0x0827C3) — pTemp/progPtr update sequence', start: 0x0827c3, maxBytes: 64 },
];

// Known RAM symbols — the key pointers we need to find
const SYMBOLS = new Map([
  [0xd005f8, 'OP1'],
  [0xd005f9, 'OP1+1'],
  [0xd02317, 'editCursor'],
  [0xd0231a, 'editTail'],
  [0xd0231d, 'editBtm'],
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
  [0xd025c7, 'RAM_D025C7'],
  [0xd0058f, 'RAM_D0058F'],
  [0xd02ad7, 'signExtTemp'],
  [0xd02ad9, 'signExtFlag'],
  // Per-pointer update addresses from tail helper B
  [0xd0066f, 'ptrSlot_066F'],
  [0xd00672, 'ptrSlot_0672'],
  [0xd00675, 'ptrSlot_0675'],
  [0xd00678, 'ptrSlot_0678'],
  [0xd0067b, 'ptrSlot_067B'],
  [0xd0067e, 'ptrSlot_067E'],
  [0xd00681, 'ptrSlot_0681'],
  [0xd00684, 'ptrSlot_0684'],
]);

// Known call targets
const KNOWN_TARGETS = new Map([
  [0x04c876, 'sign-extend A:HL to 24-bit'],
  [0x04c896, 'store-HL-with-sign'],
  [0x04c8b4, 'save-HL-load-sign'],
  [0x04c990, 'negate-BC'],
  [0x061d1a, 'error handler (0x061D1A)'],
  [0x061d3e, 'error handler (0x061D3E)'],
  [0x07f796, 'carry-test helper'],
  [0x080080, 'slot/length selector'],
  [0x080084, 'type classifier'],
  [0x08012d, 'name-type check'],
  [0x0821b2, 'compare helper'],
  [0x0821b9, 'InsertMem'],
  [0x082266, 'post-adjust helper'],
  [0x0822a4, 'length normalizer'],
  [0x0822ba, 'inner pointer helper'],
  [0x0824d6, 'tail helper A'],
  [0x0824fd, 'tail helper B'],
  [0x082739, 'post-move helper'],
  [0x0825d1, 'pointer update sub'],
  [0x082823, 'ptr adjuster for pTemp/progPtr'],
  [0x082be2, 'name-skip helper'],
  [0x082c0b, 'block-move helper'],
  [0x08279e, 'type-check sub'],
  [0x09df12, 'system call 09DF12'],
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
    case 'nop': text = 'nop'; break;
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
    case 'exx': text = 'exx'; break;
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
    case 'ld-ind-imm': text = `ld (hl), ${hexByte(inst.value)}`; break;
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
    case 'bit-test': text = `bit ${inst.bit}, ${inst.reg}`; break;
    case 'bit-test-ind': text = `bit ${inst.bit}, (hl)`; break;
    case 'bit-set': text = `set ${inst.bit}, ${inst.reg}`; break;
    case 'bit-res': text = `res ${inst.bit}, ${inst.reg}`; break;
    case 'rotate-reg': text = `${inst.op} ${inst.reg}`; break;
    case 'rotate-ind': text = `${inst.op} (hl)`; break;
    case 'djnz': text = `djnz ${hex(inst.target)}`; break;
    case 'ldd': text = 'ldd'; break;
    case 'lddr': text = 'lddr'; break;
    case 'ldi': text = 'ldi'; break;
    case 'ldir': text = 'ldir'; break;
    case 'cpi': text = 'cpi'; break;
    case 'cpir': text = 'cpir'; break;
    case 'rst': text = `rst ${hex(inst.target, 2)}`; break;
    case 'di': text = 'di'; break;
    case 'ei': text = 'ei'; break;
    case 'halt': text = 'halt'; break;
    case 'neg': text = 'neg'; break;
    case 'rla': text = 'rla'; break;
    case 'rra': text = 'rra'; break;
    case 'rlca': text = 'rlca'; break;
    case 'rrca': text = 'rrca'; break;
    case 'daa': text = 'daa'; break;
    case 'scf': text = 'scf'; break;
    case 'ccf': text = 'ccf'; break;
    case 'cpl': text = 'cpl'; break;
    case 'reti': text = 'reti'; break;
    case 'retn': text = 'retn'; break;
    case 'im': text = `im ${inst.mode ?? inst.value}`; break;
    case 'jp-indirect': text = `jp (${inst.indirectRegister})`; break;
    case 'ld-sp-hl': text = 'ld sp, hl'; break;
    case 'ex-sp-hl': text = 'ex (sp), hl'; break;
    case 'indexed-cb-bit': text = `bit ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'indexed-cb-res': text = `res ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'indexed-cb-set': text = `set ${inst.bit}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'ld-reg-ixd': text = `ld ${inst.dest}, (${inst.indexRegister}${disp(inst.displacement)})`; break;
    case 'ld-ixd-reg': text = `ld (${inst.indexRegister}${disp(inst.displacement)}), ${inst.src}`; break;
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
    if (symbol) notes.push(`= ${symbol}`);
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
      rows.push({ pc, bytes: '', text: `decode failed (byte: ${hex(romBytes[pc], 2)})`, comment: '', inst: null });
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
      inst,
    });

    pc += inst.length;
  }

  return rows;
}

// Collect RAM references (reads/writes) from disassembly
function collectRAMRefs(rows, label) {
  const refs = [];
  for (const row of rows) {
    if (!row.inst) continue;
    const inst = row.inst;

    // Check addr field
    if (Number.isInteger(inst.addr) && inst.addr >= 0xd00000) {
      const symbol = symbolFor(inst.addr);
      let access = 'unknown';
      if (inst.tag === 'ld-pair-mem') {
        access = inst.direction === 'to-mem' ? 'write' : 'read';
      } else if (inst.tag === 'ld-reg-mem') {
        access = 'read';
      } else if (inst.tag === 'ld-mem-reg' || inst.tag === 'ld-mem-pair') {
        access = 'write';
      }
      refs.push({
        addr: inst.addr,
        symbol: symbol || `RAM_${hex(inst.addr)}`,
        access,
        site: `${hex(row.pc)} ${row.text}`,
        section: label,
      });
    }

    // Check ld-pair-imm pointing to RAM
    if (inst.tag === 'ld-pair-imm' && Number.isInteger(inst.value) && inst.value >= 0xd00000) {
      const symbol = symbolFor(inst.value);
      refs.push({
        addr: inst.value,
        symbol: symbol || `RAM_${hex(inst.value)}`,
        access: 'immediate',
        site: `${hex(row.pc)} ${row.text}`,
        section: label,
      });
    }
  }
  return refs;
}

// ── Main ──

console.log('[phase25t] Disassembling pointer adjuster and related subroutines...');

const allDisasms = TARGETS.map((t) => {
  console.log(`  Disassembling ${t.title}...`);
  return { ...t, rows: disasmRange(t.start, t.maxBytes) };
});

// Collect all RAM references
const allRAMRefs = allDisasms.flatMap((d) => collectRAMRefs(d.rows, d.title));

// Group by symbol
const bySymbol = new Map();
for (const ref of allRAMRefs) {
  if (!bySymbol.has(ref.addr)) bySymbol.set(ref.addr, { symbol: ref.symbol, refs: [] });
  bySymbol.get(ref.addr).refs.push(ref);
}

// Key pointers we care about
const KEY_ADDRS = [
  [0xd02590, 'OPBase'],
  [0xd0259a, 'pTemp'],
  [0xd0259d, 'progPtr'],
  [0xd02593, 'OPS'],
  [0xd02596, 'pTempCnt'],
  [0xd0258a, 'FPSbase'],
  [0xd0258d, 'FPS'],
];

// ── Build report ──

const lines = [];

lines.push('# Phase 25T - Pointer Adjuster Disassembly Report');
lines.push('');
lines.push('## Scope');
lines.push('');
lines.push('Disassembled the 4 subroutines called from InsertMem (0x0821B9) after the memory block move:');
lines.push('');
for (const t of TARGETS) {
  lines.push(`- **${t.title}**: ${t.maxBytes} bytes from \`${hex(t.start)}\``);
}
lines.push('');
lines.push('Plus subroutines called by those (0x0825D1, 0x082266).');
lines.push('');

// ── Key pointer coverage ──

lines.push('## Key Pointer Coverage');
lines.push('');
lines.push('| Address | Symbol | Found? | Where |');
lines.push('| --- | --- | --- | --- |');
for (const [addr, name] of KEY_ADDRS) {
  const entry = bySymbol.get(addr);
  if (entry) {
    const sites = entry.refs.map((r) => `${r.access} in ${r.section}`).join('; ');
    lines.push(`| \`${hex(addr)}\` | ${name} | YES | ${sites} |`);
  } else {
    lines.push(`| \`${hex(addr)}\` | ${name} | NO | — |`);
  }
}
lines.push('');

// ── All RAM references table ──

lines.push('## All RAM References');
lines.push('');
lines.push('| Address | Symbol | Access | Site | Section |');
lines.push('| --- | --- | --- | --- | --- |');
for (const ref of allRAMRefs) {
  lines.push(`| \`${hex(ref.addr)}\` | ${ref.symbol} | ${ref.access} | \`${ref.site}\` | ${ref.section} |`);
}
lines.push('');

// ── Annotated disassembly ──

lines.push('## Annotated Disassembly');
lines.push('');

for (const d of allDisasms) {
  lines.push(`### ${d.title}`);
  lines.push('');
  lines.push('```text');
  for (const row of d.rows) {
    lines.push(`${hex(row.pc)}: ${row.bytes.padEnd(20)} ${row.text}${row.comment}`);
  }
  lines.push('```');
  lines.push('');
}

// ── Analysis ──

lines.push('## Analysis');
lines.push('');

lines.push('### 0x04C990 — Negate-BC helper');
lines.push('');
lines.push('This is a trivial 12-byte routine that computes `BC = 0 - BC` (two\'s complement negate).');
lines.push('It does not touch any RAM pointers. InsertMem calls it to convert the positive insertion');
lines.push('size into a negative delta before passing it to the pointer-update helpers.');
lines.push('');

lines.push('### 0x082739 — Post-move / VAT pointer walker');
lines.push('');
lines.push('This is the most complex routine. It:');
lines.push('1. Starts at `HL = 0xD3FFFF` (top of the VAT region) and walks backward through VAT entries');
lines.push('2. For each 3-byte pointer entry, loads the pointer via `ld c,(hl); ld b,(hl); ld a,(hl)` pattern');
lines.push('3. Calls `0x04C876` (sign-extend) and `0x0821B2` (compare)');
lines.push('4. If the pointer falls within the affected range, adjusts it by subtracting the old slot_D02577 value');
lines.push('5. Calls `0x082C0B` (block-move helper) to write back the adjusted pointer');
lines.push('6. **Terminates when `HL` drops below OPBase** — it reads `OPBase` at `0x082791`');
lines.push('7. Then loops back to `0x082745` to process the next entry');
lines.push('');
lines.push('**OPBase is used as the loop termination boundary**, not as a pointer to adjust.');
lines.push('The loop walks backward from 0xD3FFFF down to OPBase, adjusting any VAT pointer entries');
lines.push('that point into the moved region.');
lines.push('');

lines.push('### 0x0824D6 — Tail helper A (editCursor/editTail/editBtm adjuster)');
lines.push('');
lines.push('Adjusts three edit-buffer pointers stored at:');
lines.push('- `0xD02317` (editCursor): reads, compares vs DE (insertion point), if >= DE: subtracts BC');
lines.push('- `0xD0231A` (editTail): unconditionally subtracts BC');
lines.push('- `0xD0231D` (editBtm): unconditionally subtracts BC');
lines.push('');
lines.push('The adjustment formula for each: `pointer = pointer - BC` (where BC = negated insertion size = effectively adding the insertion size).');
lines.push('The first pointer (editCursor) is only adjusted if it was >= the insertion point (DE).');
lines.push('');

lines.push('### 0x0824FD — Tail helper B (per-pointer updater via 0x0825D1)');
lines.push('');
lines.push('Calls `0x0825D1` with HL pointing to each of 8 consecutive 3-byte pointer slots:');
lines.push('`0xD0066F`, `0xD00672`, `0xD00675`, `0xD00678`, `0xD0067B`, `0xD0067E`, `0xD00681`, `0xD00684`.');
lines.push('');
lines.push('These are likely the 8 OS pointer slots (including OPBase at one of these? or FP stack pointers).');
lines.push('The actual adjustment logic is in 0x0825D1.');
lines.push('');

lines.push('### 0x0825D1 — Pointer update subroutine');
lines.push('');
const subRows = allDisasms.find((d) => d.id === 'ptr-update-sub')?.rows || [];
if (subRows.length > 0) {
  lines.push('This routine takes HL = pointer to a 3-byte RAM address. It:');
  lines.push('1. Reads the 24-bit value at (HL)');
  lines.push('2. Compares it against DE (the insertion point)');
  lines.push('3. If the value >= DE, adjusts it by subtracting BC (= adding the insertion size)');
  lines.push('4. Writes the adjusted value back');
  lines.push('');
  lines.push('This is the generic "if this pointer is above the insertion point, bump it up" logic.');
} else {
  lines.push('(Disassembly not available — see listing above)');
}
lines.push('');

lines.push('### 0x082266 — Post-adjust helper');
lines.push('');
lines.push('(See disassembly listing above for details.)');
lines.push('');

lines.push('### OPBase Corruption Analysis');
lines.push('');
lines.push('**Known corruption**: OPBase changes from `0xD1A881` to `0xA88100` during CreateReal.');
lines.push('');
lines.push('**Key finding**: OPBase (`0xD02590`) is only READ in the post-move helper (0x082739) at');
lines.push('address `0x082791`. It is used as the loop termination bound, not as a value to adjust.');
lines.push('');
lines.push('**0x04C990 does NOT directly adjust OPBase** — it is just a BC-negate helper.');
lines.push('');
lines.push('**0x0824FD (tail helper B)** calls `0x0825D1` for 8 pointer slots starting at `0xD0066F`.');
lines.push('None of these addresses match `0xD02590` (OPBase), `0xD0259A` (pTemp), or `0xD0259D` (progPtr).');
lines.push('');
lines.push('**0x0824D6 (tail helper A)** only adjusts the edit-buffer pointers at `0xD02317/1A/1D`.');
lines.push('');
lines.push('**Conclusion**: The four subroutines called from InsertMem do NOT directly write to');
lines.push('OPBase, pTemp, or progPtr. The corruption must come from:');
lines.push('1. A different code path that adjusts these pointers (possibly in the allocator entry');
lines.push('   before InsertMem is called, or in the CreateReal wrapper)');
lines.push('2. A memory block move (LDIR/LDDR in InsertMem itself) that overwrites the RAM locations');
lines.push('   where OPBase is stored, if the FPS/heap region overlaps with the system pointer area');
lines.push('3. A bug in our runtime\'s memory seeding that places OPBase at a value that the block');
lines.push('   move happens to overwrite');
lines.push('');
lines.push('**Byte-level corruption pattern**: `0xD1A881` -> `0xA88100` is a left-shift by one byte');
lines.push('(the high byte `0xD1` is lost, and `0x00` is appended as the low byte). This is');
lines.push('characteristic of a 24-bit pointer being read/written with a 1-byte offset error,');
lines.push('or the LDIR/LDDR block move physically overwriting the OPBase storage location.');
lines.push('');

const report = lines.join('\n');
fs.writeFileSync(REPORT_PATH, report, 'utf8');

console.log(`[phase25t] Wrote report to ${path.relative(__dirname, REPORT_PATH)}`);
console.log('');
console.log('=== SUMMARY ===');
for (const d of allDisasms) {
  console.log(`  ${d.title}: ${d.rows.length} instructions`);
}
console.log(`  Total RAM references: ${allRAMRefs.length}`);
console.log('');
console.log('Key pointer hits:');
for (const [addr, name] of KEY_ADDRS) {
  const entry = bySymbol.get(addr);
  if (entry) {
    const sites = entry.refs.map((r) => `${r.access}@${r.section}`);
    console.log(`  ${name} (${hex(addr)}): ${sites.join(', ')}`);
  } else {
    console.log(`  ${name} (${hex(addr)}): NOT FOUND`);
  }
}
