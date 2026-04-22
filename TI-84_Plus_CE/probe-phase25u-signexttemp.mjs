#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romBytes = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

function hexByte(b) { return (b & 0xFF).toString(16).padStart(2, '0'); }
function hexBytes(rom, addr, len) {
  const parts = [];
  for (let i = 0; i < len; i++) parts.push(hexByte(rom[addr + i]));
  return parts.join(' ');
}

const REPORT_PATH = path.join(__dirname, 'phase25u-signexttemp-report.md');

const SLOT_NAMES = new Map([
  [0xd02ad7, 'signExtTemp'],
  [0xd02ad9, 'signExtFlag / high byte of signExtTemp'],
  [0xd0259a, 'pTemp'],
  [0xd0259d, 'progPtr'],
  [0xd0244e, 'slot_0xd0244e'],
  [0xd0257b, 'slot_0xd0257b'],
  [0xd0257e, 'slot_0xd0257e'],
  [0xd02581, 'slot_0xd02581'],
  [0xd02584, 'slot_0xd02584'],
  [0xd01fea, 'slot_0xd01fea'],
  [0xd01ff0, 'slot_0xd01ff0'],
  [0xd01ff6, 'slot_0xd01ff6'],
  [0xd02567, 'slot_0xd02567'],
]);

const CALL_NAMES = new Map([
  [0x082823, 'pointer adjuster'],
]);

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function read16(addr) {
  return romBytes[addr] | (romBytes[addr + 1] << 8);
}

function read24(addr) {
  return romBytes[addr] | (romBytes[addr + 1] << 8) | (romBytes[addr + 2] << 16);
}

function decodeOne(pc) {
  const b0 = romBytes[pc];
  const b1 = romBytes[pc + 1];

  if (b0 === 0xf5) return { pc, len: 1, kind: 'push', text: 'push af' };
  if (b0 === 0xf1) return { pc, len: 1, kind: 'pop', text: 'pop af' };
  if (b0 === 0xe5) return { pc, len: 1, kind: 'push', text: 'push hl' };
  if (b0 === 0xe1) return { pc, len: 1, kind: 'pop', text: 'pop hl' };
  if (b0 === 0xc5) return { pc, len: 1, kind: 'push', text: 'push bc' };
  if (b0 === 0xd1) return { pc, len: 1, kind: 'pop', text: 'pop de' };
  if (b0 === 0xb7) return { pc, len: 1, kind: 'alu', text: 'or a' };
  if (b0 === 0xc9) return { pc, len: 1, kind: 'ret', text: 'ret' };
  if (b0 === 0xd0) return { pc, len: 1, kind: 'retcc', text: 'ret nc' };

  if (b0 === 0x21) {
    const imm = read24(pc + 1);
    return {
      pc,
      len: 4,
      kind: 'ld',
      value: imm,
      text: `ld hl, ${hex(imm)}`,
      note: SLOT_NAMES.get(imm) || '',
    };
  }

  if (b0 === 0x22) {
    const imm = read24(pc + 1);
    return {
      pc,
      len: 4,
      kind: 'ld',
      value: imm,
      text: `ld (${hex(imm)}), hl`,
      note: SLOT_NAMES.get(imm) || '',
    };
  }

  if (b0 === 0x2a) {
    const imm = read24(pc + 1);
    return {
      pc,
      len: 4,
      kind: 'ld',
      value: imm,
      text: `ld hl, (${hex(imm)})`,
      note: SLOT_NAMES.get(imm) || '',
    };
  }

  if (b0 === 0x32) {
    const imm = read24(pc + 1);
    return {
      pc,
      len: 4,
      kind: 'ld',
      value: imm,
      text: `ld (${hex(imm)}), a`,
      note: SLOT_NAMES.get(imm) || '',
    };
  }

  if (b0 === 0x3a) {
    const imm = read24(pc + 1);
    return {
      pc,
      len: 4,
      kind: 'ld',
      value: imm,
      text: `ld a, (${hex(imm)})`,
      note: SLOT_NAMES.get(imm) || '',
    };
  }

  if (b0 === 0x40 && b1 === 0x22) {
    const imm = read16(pc + 2);
    return {
      pc,
      len: 4,
      kind: 'ld',
      value: imm,
      text: `sis ld (${hex(imm, 4)}), hl`,
      note: 'short store through MBASE, normally 0xd02ad7 in OS RAM',
    };
  }

  if (b0 === 0xcb && b1 === 0x3f) return { pc, len: 2, kind: 'shift', text: 'srl a' };
  if (b0 === 0xcb && b1 === 0x1c) return { pc, len: 2, kind: 'shift', text: 'rr h' };
  if (b0 === 0xcb && b1 === 0x1d) return { pc, len: 2, kind: 'shift', text: 'rr l' };

  if (b0 === 0xcd) {
    const target = read24(pc + 1);
    return {
      pc,
      len: 4,
      kind: 'call',
      value: target,
      text: `call ${hex(target)}`,
      note: CALL_NAMES.get(target) || '',
    };
  }

  if (b0 === 0xed && b1 === 0x07) return { pc, len: 2, kind: 'ld', text: 'ld bc, (hl)' };
  if (b0 === 0xed && b1 === 0x37) return { pc, len: 2, kind: 'ld', text: 'ld ix, (hl)' };
  if (b0 === 0xed && b1 === 0x3f) return { pc, len: 2, kind: 'ld', text: 'ld (hl), ix' };
  if (b0 === 0xed && b1 === 0x52) return { pc, len: 2, kind: 'math', text: 'sbc hl, de' };
  if (b0 === 0xdd && b1 === 0xe5) return { pc, len: 2, kind: 'push', text: 'push ix' };
  if (b0 === 0xdd && b1 === 0xe1) return { pc, len: 2, kind: 'pop', text: 'pop ix' };
  if (b0 === 0xdd && b1 === 0x09) return { pc, len: 2, kind: 'math', text: 'add ix, bc' };

  if (b0 === 0xed && b1 === 0x4b) {
    const imm = read24(pc + 2);
    return {
      pc,
      len: 5,
      kind: 'ld',
      value: imm,
      text: `ld bc, (${hex(imm)})`,
      note: SLOT_NAMES.get(imm) || '',
    };
  }

  if (b0 === 0xed && b1 === 0x43) {
    const imm = read24(pc + 2);
    return {
      pc,
      len: 5,
      kind: 'ld',
      value: imm,
      text: `ld (${hex(imm)}), bc`,
      note: SLOT_NAMES.get(imm) || '',
    };
  }

  throw new Error(`Unhandled opcode at ${hex(pc)}: ${hexByte(b0)} ${hexByte(b1 ?? 0)}`);
}

function disassemble(start, options = {}) {
  const rows = [];
  let pc = start;
  while (true) {
    if (options.endExclusive != null && pc >= options.endExclusive) break;
    const row = decodeOne(pc);
    row.bytes = hexBytes(romBytes, pc, row.len);
    rows.push(row);
    pc += row.len;
    if (options.stopOnRet && row.kind === 'ret') break;
  }
  return rows;
}

function renderRows(rows) {
  return rows.map((row) => {
    const note = row.note ? ` ; ${row.note}` : '';
    return `${hex(row.pc)}: ${row.bytes.padEnd(17)} ${row.text}${note}`;
  }).join('\n');
}

function callerSlots(rows) {
  const slots = [];
  for (const row of rows) {
    if (row.text.startsWith('ld hl, 0x')) {
      const addr = row.value;
      slots.push(`- \`${hex(addr)}\` (${SLOT_NAMES.get(addr) || 'slot'})`);
    }
  }
  slots.push('- `0x082823` fallthrough uses the last loaded `HL` (`0xd02567`) as the final slot');
  return slots;
}

const dis04c9a8 = disassemble(0x04c9a8, { stopOnRet: true });
const dis082823 = disassemble(0x082823, { stopOnRet: true });
const dis0827ca = disassemble(0x0827ca, { endExclusive: 0x082823 });

const lines = [];
lines.push('# Phase 25U - signExtTemp negate/store/adjust pipeline');
lines.push('');
lines.push('Generated by `probe-phase25u-signexttemp.mjs` from direct `ROM.rom` byte reads.');
lines.push('');
lines.push('## Raw ROM windows');
lines.push('');
lines.push('```text');
lines.push(`0x04c9a8 (+48): ${hexBytes(romBytes, 0x04c9a8, 48)}`);
lines.push(`0x082823 (+48): ${hexBytes(romBytes, 0x082823, 48)}`);
lines.push(`0x0827ca (+48): ${hexBytes(romBytes, 0x0827ca, 48)}`);
lines.push('```');
lines.push('');
lines.push('## 0x04C9A8 - signExtTemp scratch helper');
lines.push('');
lines.push('```text');
lines.push(renderRows(dis04c9a8));
lines.push('```');
lines.push('');
lines.push('- Stores the incoming 24-bit `HL` value to `0xd02ad7..0xd02ad9`.');
lines.push('- Reads `0xd02ad9` into `A`, shifts it right, writes it back, then rotates `H` and `L` right through carry.');
lines.push('- The `sis ld (0x2ad7), hl` at `0x04c9bb` rewrites the low 16 bits through the current `MBASE`; in OS RAM that normally aliases `0xd02ad7`.');
lines.push('- Reloads `HL` from `signExtTemp` and returns, so the helper is "store + 24-bit right shift + reload", not just "store and return".');
lines.push('');
lines.push('## 0x082823 - per-pointer adjuster');
lines.push('');
lines.push('```text');
lines.push(renderRows(dis082823));
lines.push('```');
lines.push('');
lines.push('- Entry contract: `HL` points at a 3-byte pointer slot, `DE` is the compare threshold, and `signExtTemp` already holds the delta.');
lines.push('- The literal compare is `ptr - DE`. `ret nc` skips the update when the subtraction does not borrow.');
lines.push('- On the carry path the routine loads `BC` from `signExtTemp`, loads `IX` from the slot, adds the delta, and writes the updated 24-bit value back to `(HL)`.');
lines.push('');
lines.push('## 0x0827CA - caller / slot iterator');
lines.push('');
lines.push('```text');
lines.push(renderRows(dis0827ca));
lines.push('```');
lines.push('');
lines.push('Slots visited by the iterator:');
lines.push(...callerSlots(dis0827ca));
lines.push('');
lines.push('Note: the first 48 raw bytes only cover the first six call sites. The listing above continues to the fallthrough boundary at `0x082823` so the full iterator is visible.');
lines.push('');
lines.push('## Pipeline summary');
lines.push('');
lines.push('Generic signExtTemp helper family:');
lines.push('');
lines.push('```text');
lines.push('HL -> 0x04C9A8 -> signExtTemp/signExtFlag scratch');
lines.push('```');
lines.push('');
lines.push('Concrete InsertMem / AdjSymPtrs path:');
lines.push('');
lines.push('```text');
lines.push('InsertMem(BC bytes)');
lines.push('  -> 0x04C990   BC = -BC');
lines.push('  -> 0x0827CA   ld (0xD02AD7), BC');
lines.push('  -> 0x082823   for each pointer slot: compare against DE, then add signExtTemp on the carry path');
lines.push('```');
lines.push('');
lines.push('## Exact contract');
lines.push('');
lines.push('| item | contract |');
lines.push('| --- | --- |');
lines.push('| `signExtTemp` (`0xD02AD7..0xD02AD9`) | 24-bit scratch/delta storage. `0x04C9A8` stores `HL` there and shifts the full 24-bit value right by one. `0x0827CA` stores `BC` there directly. `0x082823` reads it back as the adjustment delta. |');
lines.push('| `signExtFlag` (`0xD02AD9`) | In these routines it behaves as the high/extension byte of the same 24-bit scratch, not as a standalone branch flag. `0x04C9A8` uses it as the byte shifted by `srl a`, feeding carry into `rr h` and `rr l`. |');
lines.push('| `0x082823` predicate | The literal unsigned test is `ptr - DE`. `ret nc` skips the update when `ptr >= DE`; the delta is applied only on the borrow/carry path (`ptr < DE`). Because the InsertMem flow stores a negative delta, the add behaves like subtracting the insertion size. |');
lines.push('');
lines.push('## Conclusion');
lines.push('');
lines.push('`0x04C9A8` documents how the OS stores and bit-shifts the `signExtTemp` scratch pair, while the concrete InsertMem pointer-adjust path uses `0x0827CA` to copy the already-negated `BC` into `signExtTemp` and `0x082823` to add that negative delta to each slot.');
lines.push('');

const report = lines.join('\n');
fs.writeFileSync(REPORT_PATH, report);
console.log(report);
console.log(`Wrote ${pathToFileURL(REPORT_PATH).href}`);
