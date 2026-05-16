#!/usr/bin/env node

import { readFileSync } from 'fs';
import process from 'process';

import { decodeInstruction } from './ez80-decoder.js';

process.emitWarning = () => {};

const ROM_PATH = new URL('./ROM.rom', import.meta.url);
const rom = new Uint8Array(readFileSync(ROM_PATH));

// --- Scan code labels (SDK sequential codes used by the OS) ---
const SDK_SCAN_LABELS = new Map([
  [0x00, 'NONE/DOWN*'],
  [0x01, 'DOWN'],
  [0x02, 'LEFT'],
  [0x03, 'RIGHT'],
  [0x04, 'UP'],
  [0x09, 'ENTER'],
  [0x0A, '+'],
  [0x0B, '-'],
  [0x0C, '*'],
  [0x0D, '/'],
  [0x0E, '^'],
  [0x0F, 'CLEAR'],
  [0x10, 'ENTER(matrix)'],
  [0x11, '(-)'],
  [0x12, '3'],
  [0x13, '6'],
  [0x14, '9'],
  [0x15, ')'],
  [0x16, 'TAN'],
  [0x17, 'VARS'],
  [0x19, '.'],
  [0x1A, '2'],
  [0x1B, '5'],
  [0x1C, '8'],
  [0x1D, '('],
  [0x1E, 'COS'],
  [0x1F, 'PRGM'],
  [0x20, 'STAT'],
  [0x21, '0'],
  [0x22, '1'],
  [0x23, '4'],
  [0x24, '7'],
  [0x25, ','],
  [0x26, 'SIN'],
  [0x27, 'APPS'],
  [0x28, 'X,T,theta,n'],
  [0x2A, 'STO>'],
  [0x2B, 'LN'],
  [0x2C, 'LOG'],
  [0x2D, 'x^2'],
  [0x2E, 'x^-1'],
  [0x2F, 'MATH'],
  [0x30, 'ALPHA'],
  [0x31, 'GRAPH'],
  [0x32, 'TRACE'],
  [0x33, 'ZOOM'],
  [0x34, 'WINDOW'],
  [0x35, 'Y='],
  [0x36, '2ND'],
  [0x37, 'MODE'],
  [0x38, 'DEL'],
  [0x40, '0(matrix)'],
  [0x41, '1(matrix)'],
  [0x42, '4(matrix)'],
  [0x43, '7(matrix)'],
  [0x45, 'MODE(matrix)'],
  [0x46, 'MATH(matrix)'],
  [0x47, 'APPS(matrix)'],
  [0x48, 'PRGM(matrix)'],
  [0x50, 'VARS(matrix)'],
  [0x55, 'TRACE(matrix)'],
  [0x56, 'ZOOM(matrix)'],
  [0x57, 'WINDOW(matrix)'],
  [0x58, 'Y=(matrix)'],
  [0x80, 'FLAG_80'],
]);

// Raw keyboard matrix nibble codes
const KEY_MATRIX_ROWS = [
  ['DOWN', 'LEFT', 'RIGHT', 'UP'],
  ['ENTER', '+', '-', '*', '/', '^', 'CLEAR'],
  ['(-)', '3', '6', '9', ')', 'TAN', 'VARS'],
  ['.', '2', '5', '8', '(', 'COS', 'PRGM', 'STAT'],
  ['0', '1', '4', '7', ',', 'SIN', 'APPS', 'X,T,theta,n'],
  [null, 'STO>', 'LN', 'LOG', 'x^2', 'x^-1', 'MATH', 'ALPHA'],
  ['GRAPH', 'TRACE', 'ZOOM', 'WINDOW', 'Y=', '2ND', 'MODE', 'DEL'],
];

const RAW_MATRIX_LABELS = new Map();
for (let row = 0; row < KEY_MATRIX_ROWS.length; row++) {
  for (let bit = 0; bit < KEY_MATRIX_ROWS[row].length; bit++) {
    const label = KEY_MATRIX_ROWS[row][bit];
    if (label) RAW_MATRIX_LABELS.set((row << 4) | bit, label);
  }
}

// --- Constants ---
const SHORT_PREFIXES = new Set(['sis', 'lis']);
const RAM_MBASE = 0xD0;

// Primary targets
const PRIMARY_HANDLERS = [
  { index: 14, address: 0x0454A4, bytes: 300, label: 'Handler[14] — arrow/nav dispatch' },
  { index: 22, address: 0x0ADB41, bytes: 300, label: 'Handler[22] — 0x22/0x23/0x80 dispatch' },
];

// Cross-reference handlers (first 50 bytes)
const XREF_HANDLERS = [
  { index: 13, address: 0x05CBDC, bytes: 50, label: 'Handler[13]' },
  { index: 15, address: 0x045647, bytes: 50, label: 'Handler[15]' },
  { index: 21, address: 0x0B193A, bytes: 50, label: 'Handler[21]' },
  { index: 23, address: 0x08AA67, bytes: 50, label: 'Handler[23]' },
];

// --- Helpers ---

function hex6(value) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(6, '0')}`;
}

function hexByte(value) {
  return `0x${((value ?? 0) & 0xFF).toString(16).toUpperCase().padStart(2, '0')}`;
}

function pad(value, width) {
  return String(value).padEnd(width);
}

function read24LE(buffer, offset) {
  return (
    (buffer[offset] ?? 0) |
    ((buffer[offset + 1] ?? 0) << 8) |
    ((buffer[offset + 2] ?? 0) << 16)
  ) >>> 0;
}

function bytesToHex(bytes) {
  return Array.from(bytes, (v) => v.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

function signedDisp(value) {
  const byte = (value ?? 0) & 0xFF;
  const signed = byte < 0x80 ? byte : byte - 0x100;
  return signed < 0 ? `-${hexByte(-signed)}` : `+${hexByte(signed)}`;
}

function withPrefix(inst, text) {
  return inst?.modePrefix ? `${inst.modePrefix} ${text}` : text;
}

function effectiveAddress(inst) {
  if (!Number.isInteger(inst?.addr)) return null;
  if (SHORT_PREFIXES.has(inst.modePrefix)) {
    return (((RAM_MBASE << 16) | (inst.addr & 0xFFFF)) >>> 0) & 0xFFFFFF;
  }
  return (inst.addr >>> 0) & 0xFFFFFF;
}

function formatAddress(inst) {
  const value = effectiveAddress(inst);
  return value === null ? '???' : hex6(value);
}

function formatIndexed(inst) {
  return `(${(inst.indexRegister ?? '').toUpperCase()}${signedDisp(inst.displacement)})`;
}

function safeDecode(pc) {
  try {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (inst && Number.isInteger(inst.length) && inst.length > 0) return inst;
  } catch { /* fall through */ }
  return { pc, length: 1, tag: 'db', value: rom[pc] ?? 0, modePrefix: null };
}

function formatInstruction(inst) {
  const upper = (s) => String(s ?? '').toUpperCase();
  switch (inst?.tag) {
    case 'call': return withPrefix(inst, `CALL ${hex6(inst.target)}`);
    case 'call-conditional': return withPrefix(inst, `CALL ${upper(inst.condition)}, ${hex6(inst.target)}`);
    case 'jp': return withPrefix(inst, `JP ${hex6(inst.target)}`);
    case 'jp-conditional': return withPrefix(inst, `JP ${upper(inst.condition)}, ${hex6(inst.target)}`);
    case 'jp-indirect': return withPrefix(inst, `JP (${upper(inst.indirectRegister ?? 'hl')})`);
    case 'jr': return withPrefix(inst, `JR ${hex6(inst.target)}`);
    case 'jr-conditional': return withPrefix(inst, `JR ${upper(inst.condition)}, ${hex6(inst.target)}`);
    case 'ret': return withPrefix(inst, 'RET');
    case 'ret-conditional': return withPrefix(inst, `RET ${upper(inst.condition)}`);
    case 'reti': return withPrefix(inst, 'RETI');
    case 'retn': return withPrefix(inst, 'RETN');
    case 'push': return withPrefix(inst, `PUSH ${upper(inst.pair)}`);
    case 'pop': return withPrefix(inst, `POP ${upper(inst.pair)}`);
    case 'ld-pair-imm': return withPrefix(inst, `LD ${upper(inst.pair)}, ${hex6(inst.value)}`);
    case 'ld-pair-mem':
      return inst.direction === 'to-mem'
        ? withPrefix(inst, `LD (${formatAddress(inst)}), ${upper(inst.pair)}`)
        : withPrefix(inst, `LD ${upper(inst.pair)}, (${formatAddress(inst)})`);
    case 'ld-mem-pair': return withPrefix(inst, `LD (${formatAddress(inst)}), ${upper(inst.pair)}`);
    case 'ld-reg-imm': return withPrefix(inst, `LD ${upper(inst.dest)}, ${hexByte(inst.value)}`);
    case 'ld-reg-reg': return withPrefix(inst, `LD ${upper(inst.dest)}, ${upper(inst.src)}`);
    case 'ld-reg-mem': return withPrefix(inst, `LD ${upper(inst.dest)}, (${formatAddress(inst)})`);
    case 'ld-mem-reg': return withPrefix(inst, `LD (${formatAddress(inst)}), ${upper(inst.src)}`);
    case 'ld-reg-ind': return withPrefix(inst, `LD ${upper(inst.dest)}, (${upper(inst.src ?? inst.pair)})`);
    case 'ld-ind-reg': return withPrefix(inst, `LD (${upper(inst.dest ?? inst.pair)}), ${upper(inst.src)}`);
    case 'ld-ind-imm': return withPrefix(inst, `LD (HL), ${hexByte(inst.value)}`);
    case 'ld-reg-ixd': return withPrefix(inst, `LD ${upper(inst.dest)}, ${formatIndexed(inst)}`);
    case 'ld-ixd-reg': return withPrefix(inst, `LD ${formatIndexed(inst)}, ${upper(inst.src)}`);
    case 'ld-ixd-imm': return withPrefix(inst, `LD ${formatIndexed(inst)}, ${hexByte(inst.value)}`);
    case 'ld-sp-hl': return withPrefix(inst, 'LD SP, HL');
    case 'ld-sp-pair': return withPrefix(inst, `LD SP, ${upper(inst.pair)}`);
    case 'ld-special': return withPrefix(inst, `LD ${upper(inst.dest)}, ${upper(inst.src)}`);
    case 'inc-reg': return withPrefix(inst, `INC ${upper(inst.reg)}`);
    case 'dec-reg': return withPrefix(inst, `DEC ${upper(inst.reg)}`);
    case 'inc-pair': return withPrefix(inst, `INC ${upper(inst.pair)}`);
    case 'dec-pair': return withPrefix(inst, `DEC ${upper(inst.pair)}`);
    case 'inc-ixd': return withPrefix(inst, `INC ${formatIndexed(inst)}`);
    case 'dec-ixd': return withPrefix(inst, `DEC ${formatIndexed(inst)}`);
    case 'add-pair': return withPrefix(inst, `ADD ${upper(inst.dest)}, ${upper(inst.src)}`);
    case 'adc-pair': return withPrefix(inst, `ADC HL, ${upper(inst.src)}`);
    case 'sbc-pair': return withPrefix(inst, `SBC HL, ${upper(inst.src)}`);
    case 'alu-imm': return withPrefix(inst, `${upper(inst.op)} ${hexByte(inst.value)}`);
    case 'alu-reg': return withPrefix(inst, `${upper(inst.op)} ${upper(inst.src)}`);
    case 'alu-ixd': return withPrefix(inst, `${upper(inst.op)} ${formatIndexed(inst)}`);
    case 'bit-test': return withPrefix(inst, `BIT ${inst.bit}, ${upper(inst.reg)}`);
    case 'bit-test-ind': return withPrefix(inst, `BIT ${inst.bit}, (HL)`);
    case 'bit-set': return withPrefix(inst, `SET ${inst.bit}, ${upper(inst.reg)}`);
    case 'bit-set-ind': return withPrefix(inst, `SET ${inst.bit}, (HL)`);
    case 'bit-res': return withPrefix(inst, `RES ${inst.bit}, ${upper(inst.reg)}`);
    case 'bit-res-ind': return withPrefix(inst, `RES ${inst.bit}, (HL)`);
    case 'indexed-cb-bit': return withPrefix(inst, `BIT ${inst.bit}, ${formatIndexed(inst)}`);
    case 'indexed-cb-set': return withPrefix(inst, `SET ${inst.bit}, ${formatIndexed(inst)}`);
    case 'indexed-cb-res': return withPrefix(inst, `RES ${inst.bit}, ${formatIndexed(inst)}`);
    case 'rotate-reg': return withPrefix(inst, `${upper(inst.operation ?? inst.op)} ${upper(inst.reg)}`);
    case 'rotate-ind': return withPrefix(inst, `${upper(inst.operation ?? inst.op)} (HL)`);
    case 'indexed-cb-rotate': return withPrefix(inst, `${upper(inst.operation ?? inst.op ?? 'ROT')} ${formatIndexed(inst)}`);
    case 'rst': return withPrefix(inst, `RST ${hexByte(inst.target ?? inst.vector)}`);
    case 'di': return withPrefix(inst, 'DI');
    case 'ei': return withPrefix(inst, 'EI');
    case 'nop': return withPrefix(inst, 'NOP');
    case 'halt': return withPrefix(inst, 'HALT');
    case 'ex-af': return withPrefix(inst, "EX AF, AF'");
    case 'exx': return withPrefix(inst, 'EXX');
    case 'ex-de-hl': return withPrefix(inst, 'EX DE, HL');
    case 'ex-sp-hl': return withPrefix(inst, 'EX (SP), HL');
    case 'scf': return withPrefix(inst, 'SCF');
    case 'ccf': return withPrefix(inst, 'CCF');
    case 'cpl': return withPrefix(inst, 'CPL');
    case 'daa': return withPrefix(inst, 'DAA');
    case 'rlca': return withPrefix(inst, 'RLCA');
    case 'rrca': return withPrefix(inst, 'RRCA');
    case 'rla': return withPrefix(inst, 'RLA');
    case 'rra': return withPrefix(inst, 'RRA');
    case 'djnz': return withPrefix(inst, `DJNZ ${hex6(inst.target)}`);
    case 'db': return withPrefix(inst, `DB ${hexByte(inst.value)}`);
    default: return withPrefix(inst, inst?.tag ?? 'UNKNOWN');
  }
}

function describeScanCode(value) {
  if (SDK_SCAN_LABELS.has(value)) return SDK_SCAN_LABELS.get(value);
  if (RAW_MATRIX_LABELS.has(value)) return `matrix:${RAW_MATRIX_LABELS.get(value)}`;
  return `unknown(${hexByte(value)})`;
}

// --- Disassembly engine ---

function disassemble(address, maxBytes) {
  const rows = [];
  let pc = address;
  const end = address + maxBytes;

  while (pc < end && pc < rom.length) {
    const inst = safeDecode(pc);
    const length = Math.max(1, inst.length || 1);
    const bytes = bytesToHex(rom.subarray(pc, Math.min(rom.length, pc + length)));
    const text = formatInstruction(inst);

    rows.push({ pc, bytes, length, text, inst });
    pc += length;
  }

  return rows;
}

// --- Analysis: find CP cascades and branch targets ---

function analyzeCPCascade(rows) {
  const results = [];

  for (let i = 0; i < rows.length; i++) {
    const { inst, pc } = rows[i];

    // Detect CP immediate
    if (inst.tag === 'alu-imm' && inst.op === 'cp') {
      const cpValue = inst.value & 0xFF;
      const keyName = describeScanCode(cpValue);

      // Look at the next instruction for the branch target
      let branchTarget = null;
      let branchType = null;
      if (i + 1 < rows.length) {
        const next = rows[i + 1].inst;
        if (next.tag === 'jp-conditional' || next.tag === 'jp') {
          branchTarget = next.target;
          branchType = next.tag === 'jp-conditional' ? `JP ${(next.condition ?? '').toUpperCase()}` : 'JP';
        } else if (next.tag === 'jr-conditional' || next.tag === 'jr') {
          branchTarget = next.target;
          branchType = next.tag === 'jr-conditional' ? `JR ${(next.condition ?? '').toUpperCase()}` : 'JR';
        } else if (next.tag === 'call-conditional' || next.tag === 'call') {
          branchTarget = next.target;
          branchType = next.tag === 'call-conditional' ? `CALL ${(next.condition ?? '').toUpperCase()}` : 'CALL';
        } else if (next.tag === 'ret-conditional') {
          branchTarget = null;
          branchType = `RET ${(next.condition ?? '').toUpperCase()}`;
        }
      }

      results.push({
        cpAddr: pc,
        cpValue,
        keyName,
        branchTarget,
        branchType,
      });
    }
  }

  return results;
}

// --- Analysis: find LD A,(nn) instructions (memory reads) ---

function findMemoryReads(rows) {
  const reads = [];

  for (const { inst, pc } of rows) {
    // LD A,(nn) — tag is 'ld-reg-mem' with dest='a'
    if (inst.tag === 'ld-reg-mem' && (inst.dest ?? '').toLowerCase() === 'a') {
      const addr = effectiveAddress(inst);
      reads.push({ pc, address: addr });
    }
    // Also check ld-pair-mem for loading from interesting addresses
    if (inst.tag === 'ld-pair-mem' && inst.direction !== 'to-mem') {
      const addr = effectiveAddress(inst);
      reads.push({ pc, address: addr, pair: inst.pair });
    }
  }

  return reads;
}

// --- Main ---

function printSection(title) {
  console.log('');
  console.log('='.repeat(80));
  console.log(`  ${title}`);
  console.log('='.repeat(80));
  console.log('');
}

function printDisassembly(rows) {
  for (const row of rows) {
    console.log(`  ${hex6(row.pc)}  ${pad(row.bytes, 24)} ${row.text}`);
  }
}

function printCPTable(cpResults) {
  if (cpResults.length === 0) {
    console.log('  (no CP immediate instructions found)');
    return;
  }

  console.log(`  ${pad('Scan Code', 12)}${pad('Key Name', 20)}${pad('Branch', 10)}${pad('Target', 12)}CP Address`);
  console.log(`  ${'-'.repeat(70)}`);

  for (const r of cpResults) {
    const target = r.branchTarget !== null ? hex6(r.branchTarget) : '(none)';
    const branch = r.branchType ?? '(none)';
    console.log(`  ${pad(hexByte(r.cpValue), 12)}${pad(r.keyName, 20)}${pad(branch, 10)}${pad(target, 12)}${hex6(r.cpAddr)}`);
  }
}

function main() {
  console.log('Phase 344: Handler Dispatch — CP Cascade Analysis');
  console.log(`ROM: TI-84_Plus_CE/ROM.rom (${rom.length} bytes)`);
  console.log('Static disassembly of OS context handlers with scan code CP cascades.');

  // --- Primary handlers (300 bytes each) ---

  for (const handler of PRIMARY_HANDLERS) {
    printSection(`${handler.label} @ ${hex6(handler.address)}`);

    const rows = disassemble(handler.address, handler.bytes);

    console.log('--- Full Disassembly (300 bytes) ---');
    console.log('');
    printDisassembly(rows);

    console.log('');
    console.log('--- CP Cascade Summary ---');
    console.log('');
    const cpResults = analyzeCPCascade(rows);
    printCPTable(cpResults);

    console.log('');
    console.log('--- Memory Reads (LD A/pair,(nn)) ---');
    console.log('');
    const memReads = findMemoryReads(rows);
    if (memReads.length === 0) {
      console.log('  (none found)');
    } else {
      for (const r of memReads) {
        const addrStr = r.address !== null ? hex6(r.address) : '???';
        const note = [];
        if (r.address === 0xD0058E) note.push('<-- D0058E (scan code buffer)');
        if (r.address === 0xD0058C) note.push('<-- D0058C (alt scan code buffer)');
        const pairStr = r.pair ? ` [${r.pair.toUpperCase()}]` : '';
        console.log(`  ${hex6(r.pc)}: reads from ${addrStr}${pairStr} ${note.join(' ')}`);
      }
    }
  }

  // --- Handler[14] specific check for D0058E vs D0058C ---

  printSection('Handler[14] — D0058E / D0058C Analysis');

  const h14rows = disassemble(0x0454A4, 300);
  const h14reads = findMemoryReads(h14rows);
  const interesting = h14reads.filter(
    (r) => r.address === 0xD0058E || r.address === 0xD0058C
  );

  if (interesting.length > 0) {
    console.log('  Handler[14] reads from:');
    for (const r of interesting) {
      console.log(`    ${hex6(r.pc)}: LD A, (${hex6(r.address)}) ${r.address === 0xD0058E ? '= D0058E' : '= D0058C'}`);
    }
  } else {
    console.log('  Handler[14] does NOT directly read from D0058E or D0058C in first 300 bytes.');
    console.log('  All memory reads found:');
    for (const r of h14reads) {
      const addrStr = r.address !== null ? hex6(r.address) : '???';
      const pairStr = r.pair ? ` [${r.pair.toUpperCase()}]` : '';
      console.log(`    ${hex6(r.pc)}: ${addrStr}${pairStr}`);
    }
  }

  // --- Cross-reference handlers (50 bytes each) ---

  printSection('Cross-Reference Handlers (first 50 bytes)');

  for (const handler of XREF_HANDLERS) {
    console.log(`--- ${handler.label} @ ${hex6(handler.address)} ---`);
    console.log('');

    const rows = disassemble(handler.address, handler.bytes);
    printDisassembly(rows);

    const cpResults = analyzeCPCascade(rows);
    if (cpResults.length > 0) {
      console.log('');
      console.log('  CP values found:');
      for (const r of cpResults) {
        const target = r.branchTarget !== null ? hex6(r.branchTarget) : '(none)';
        console.log(`    ${hexByte(r.cpValue)} = ${r.keyName} -> ${r.branchType ?? ''} ${target}`);
      }
    }

    const memReads = findMemoryReads(rows);
    if (memReads.length > 0) {
      console.log('');
      console.log('  Memory reads:');
      for (const r of memReads) {
        const addrStr = r.address !== null ? hex6(r.address) : '???';
        console.log(`    ${hex6(r.pc)}: ${addrStr}`);
      }
    }

    console.log('');
  }

  console.log('='.repeat(80));
  console.log('  Phase 344 complete.');
  console.log('='.repeat(80));
}

main();
