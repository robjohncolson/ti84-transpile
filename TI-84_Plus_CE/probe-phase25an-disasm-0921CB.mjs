#!/usr/bin/env node

/**
 * Phase 25AN: Static disassembly of 0x0921CB + ENTER handler continuation.
 *
 * Part A: Disassemble 0x0921CB (at least 150 bytes) — the subroutine called
 *         after DisarmScroll in the ENTER handler at 0x05862B.
 * Part B: Disassemble 0x05862F–0x058680 — the ENTER handler code AFTER
 *         CALL 0x0921CB returns.
 * Part C: Search ROM for all references to 0xD01D0B (numLastEntries) and
 *         cross-reference ti84pceg.inc.
 */

import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync('./TI-84_Plus_CE/ROM.rom');

const ADL_MODE = 'adl';

const SYMBOL_LABELS = new Map([
  [0x099211, 'DisarmScroll'],
  [0x0921CB, 'post-DisarmScroll subroutine'],
  [0x099914, 'ParseInp'],
  [0x0973C8, 'ENTER dual-ParseInp path'],
  [0x0973BA, 'buffer flush helper'],
  [0x061DEF, 'PushErrorHandler'],
  [0x061DD1, 'PopErrorHandler watch'],
  [0x061E20, 'PopErrorHandler (used by 0x0973C8)'],
  [0x05E872, 'CloseEditEqu / tokenize edit buffer'],
  [0x08383D, 'ChkFindSym'],
  [0x08384B, 'ChkFindSym+0xE'],
  [0x0585E9, 'home-screen ENTER handler'],
  [0x09923A, 'MinToEdit'],
  [0x09927F, 'RclVarToEdit'],
  [0x099283, 'RclVarToEditPtr'],
  [0x0992A0, 'RclEntryToEdit'],
  [0x0992C3, 'RclToQueue'],
  [0x0972C3, 'save edit cursor helper'],
  [0x0800EC, 'OS helper'],
  [0x0801D9, 'type check helper'],
  [0x082685, 'OS helper'],
  [0x082C50, 'OS helper'],
  [0x098795, 'edit helper'],
  [0x0987A2, 'post-dispatch helper'],
  [0x0987B7, 'format helper'],
  [0x098B84, 'format helper'],
  [0x0B184C, 'FormToTok'],
  [0x0B1850, 'format helper'],
  [0x05E2C0, 'queue helper'],
  [0x05E2E0, 'queue helper'],
  [0x07F7A4, 'type helper'],
  [0x07F7A8, 'type helper'],
  [0x07F9FB, 'queue helper'],
  [0x07FA07, 'queue helper'],
]);

const WATCHED_ADDRS = [
  [0x099914, 'ParseInp'],
  [0x0973C8, 'ENTER dual-ParseInp path'],
  [0x0973BA, 'buffer flush helper'],
  [0x061DEF, 'PushErrorHandler'],
  [0x061DD1, 'PopErrorHandler watch'],
  [0x061E20, 'PopErrorHandler (used by 0x0973C8)'],
  [0x05E872, 'CloseEditEqu / tokenize edit buffer'],
  [0x08383D, 'ChkFindSym'],
  [0x08384B, 'ChkFindSym+0xE'],
];

function hex(value, width = 6) {
  if (value === undefined || value === null) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function bytesFor(buffer, pc, length) {
  return Array.from(buffer.slice(pc, pc + length), (value) =>
    value.toString(16).toUpperCase().padStart(2, '0')
  ).join(' ');
}

function signedDisplacement(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function splitMnemonicOperands(text) {
  const firstSpace = text.indexOf(' ');
  if (firstSpace === -1) {
    return { mnemonic: text, operands: '' };
  }
  return {
    mnemonic: text.slice(0, firstSpace),
    operands: text.slice(firstSpace + 1),
  };
}

function formatInstruction(inst) {
  const displacement = (value) => signedDisplacement(value);
  const prefix = inst.modePrefix ? `${inst.modePrefix} ` : '';
  let text = inst.tag;

  switch (inst.tag) {
    case 'nop': text = 'nop'; break;
    case 'ei': text = 'ei'; break;
    case 'di': text = 'di'; break;
    case 'halt': text = 'halt'; break;
    case 'ret': text = 'ret'; break;
    case 'ret-conditional': text = `ret ${inst.condition}`; break;
    case 'retn': text = 'retn'; break;
    case 'reti': text = 'reti'; break;
    case 'call': text = `call ${hex(inst.target)}`; break;
    case 'call-conditional': text = `call ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp': text = `jp ${hex(inst.target)}`; break;
    case 'jp-conditional': text = `jp ${inst.condition}, ${hex(inst.target)}`; break;
    case 'jp-indirect': text = `jp (${inst.indirectRegister})`; break;
    case 'jr': text = `jr ${hex(inst.target)}`; break;
    case 'jr-conditional': text = `jr ${inst.condition}, ${hex(inst.target)}`; break;
    case 'djnz': text = `djnz ${hex(inst.target)}`; break;
    case 'rst': text = `rst ${hex(inst.target)}`; break;
    case 'push': text = `push ${inst.pair}`; break;
    case 'pop': text = `pop ${inst.pair}`; break;
    case 'ex-af': text = "ex af, af'"; break;
    case 'ex-de-hl': text = 'ex de, hl'; break;
    case 'ex-sp-pair': text = `ex (sp), ${inst.pair}`; break;
    case 'exx': text = 'exx'; break;
    case 'ld-pair-imm': text = `ld ${inst.pair}, ${hex(inst.value)}`; break;
    case 'ld-pair-mem':
      text = inst.direction === 'to-mem'
        ? `ld (${hex(inst.addr)}), ${inst.pair}`
        : `ld ${inst.pair}, (${hex(inst.addr)})`;
      break;
    case 'ld-mem-pair': text = `ld (${hex(inst.addr)}), ${inst.pair}`; break;
    case 'ld-reg-imm': text = `ld ${inst.dest}, ${hex(inst.value, 2)}`; break;
    case 'ld-reg-mem': text = `ld ${inst.dest}, (${hex(inst.addr)})`; break;
    case 'ld-mem-reg': text = `ld (${hex(inst.addr)}), ${inst.src}`; break;
    case 'ld-reg-ind': text = `ld ${inst.dest}, (${inst.src})`; break;
    case 'ld-ind-reg': text = `ld (${inst.dest}), ${inst.src}`; break;
    case 'ld-reg-reg': text = `ld ${inst.dest}, ${inst.src}`; break;
    case 'ld-reg-ixd': text = `ld ${inst.dest}, (${inst.indexRegister}${displacement(inst.displacement)})`; break;
    case 'ld-ixd-reg': text = `ld (${inst.indexRegister}${displacement(inst.displacement)}), ${inst.src}`; break;
    case 'ld-ixd-imm': text = `ld (${inst.indexRegister}${displacement(inst.displacement)}), ${hex(inst.value, 2)}`; break;
    case 'ld-sp-pair': text = `ld sp, ${inst.src}`; break;
    case 'ld-a-ind-bc': text = 'ld a, (bc)'; break;
    case 'ld-a-ind-de': text = 'ld a, (de)'; break;
    case 'ld-ind-bc-a': text = 'ld (bc), a'; break;
    case 'ld-ind-de-a': text = 'ld (de), a'; break;
    case 'ld-pair-ind': text = `ld ${inst.pair}, (${inst.src})`; break;
    case 'ld-ind-pair': text = `ld (${inst.dest}), ${inst.pair}`; break;
    case 'inc-pair': text = `inc ${inst.pair}`; break;
    case 'dec-pair': text = `dec ${inst.pair}`; break;
    case 'inc-reg': text = `inc ${inst.reg}`; break;
    case 'dec-reg': text = `dec ${inst.reg}`; break;
    case 'inc-ind': text = `inc (${inst.indirectRegister})`; break;
    case 'dec-ind': text = `dec (${inst.indirectRegister})`; break;
    case 'add-pair': text = `add ${inst.dest}, ${inst.src}`; break;
    case 'alu-reg': text = `${inst.op} ${inst.src}`; break;
    case 'alu-imm': text = `${inst.op} ${hex(inst.value, 2)}`; break;
    case 'alu-ind': text = `${inst.op} (${inst.indirectRegister})`; break;
    case 'sbc-pair': text = `sbc hl, ${inst.src}`; break;
    case 'adc-pair': text = `adc hl, ${inst.src}`; break;
    case 'bit-test': text = `bit ${inst.bit}, ${inst.reg}`; break;
    case 'bit-test-ind': text = `bit ${inst.bit}, (${inst.indirectRegister})`; break;
    case 'bit-res': text = `res ${inst.bit}, ${inst.reg}`; break;
    case 'bit-res-ind': text = `res ${inst.bit}, (${inst.indirectRegister})`; break;
    case 'bit-set': text = `set ${inst.bit}, ${inst.reg}`; break;
    case 'bit-set-ind': text = `set ${inst.bit}, (${inst.indirectRegister})`; break;
    case 'indexed-cb-bit': text = `bit ${inst.bit}, (${inst.indexRegister}${displacement(inst.displacement)})`; break;
    case 'indexed-cb-res': text = `res ${inst.bit}, (${inst.indexRegister}${displacement(inst.displacement)})`; break;
    case 'indexed-cb-set': text = `set ${inst.bit}, (${inst.indexRegister}${displacement(inst.displacement)})`; break;
    case 'indexed-cb-rotate': text = `${inst.op} (${inst.indexRegister}${displacement(inst.displacement)})`; break;
    case 'rotate-reg': text = `${inst.op} ${inst.reg}`; break;
    case 'rotate-ind': text = `${inst.op} (${inst.indirectRegister})`; break;
    case 'ldir': text = 'ldir'; break;
    case 'lddr': text = 'lddr'; break;
    case 'ldi': text = 'ldi'; break;
    case 'ldd': text = 'ldd'; break;
    case 'cpir': text = 'cpir'; break;
    case 'cpdr': text = 'cpdr'; break;
    case 'cpi': text = 'cpi'; break;
    case 'cpd': text = 'cpd'; break;
    case 'daa': text = 'daa'; break;
    case 'cpl': text = 'cpl'; break;
    case 'ccf': text = 'ccf'; break;
    case 'scf': text = 'scf'; break;
    case 'neg': text = 'neg'; break;
    case 'rla': text = 'rla'; break;
    case 'rra': text = 'rra'; break;
    case 'rlca': text = 'rlca'; break;
    case 'rrca': text = 'rrca'; break;
    case 'rld': text = 'rld'; break;
    case 'rrd': text = 'rrd'; break;
    case 'lea': text = `lea ${inst.dest}, ${inst.base}${displacement(inst.displacement)}`; break;
    case 'mlt': text = `mlt ${inst.reg}`; break;
    case 'tst-reg': text = `tst a, ${inst.reg}`; break;
    case 'tst-ind': text = `tst a, (${inst.indirectRegister})`; break;
    case 'tst-imm': text = `tst a, ${hex(inst.value, 2)}`; break;
    case 'im': text = `im ${inst.mode_num}`; break;
    case 'in-reg': text = `in ${inst.dest}, (c)`; break;
    case 'out-reg': text = `out (c), ${inst.src}`; break;
    case 'in-a-imm': text = `in a, (${hex(inst.port, 2)})`; break;
    case 'out-imm-a': text = `out (${hex(inst.port, 2)}), a`; break;
    default: {
      const skip = new Set([
        'pc', 'length', 'nextPc', 'tag', 'mode', 'modePrefix',
        'terminates', 'fallthrough',
      ]);
      const parts = Object.entries(inst)
        .filter(([key]) => !skip.has(key))
        .map(([key, value]) => `${key}=${typeof value === 'number' ? hex(value) : value}`);
      text = parts.length ? `${inst.tag} ${parts.join(' ')}` : inst.tag;
    }
  }

  return `${prefix}${text}`;
}

function decodeRange(startAddr, byteCount) {
  const rows = [];
  let pc = startAddr;
  const endAddr = startAddr + byteCount;

  while (pc < endAddr) {
    const inst = decodeInstruction(rom, pc, ADL_MODE);
    if (!inst || !inst.length) {
      rows.push({
        pc,
        bytes: bytesFor(rom, pc, 1),
        mnemonic: 'db',
        operands: hex(rom[pc] ?? 0, 2),
        text: `db ${hex(rom[pc] ?? 0, 2)}`,
        inst: null,
      });
      pc += 1;
      continue;
    }

    const text = formatInstruction(inst);
    const { mnemonic, operands } = splitMnemonicOperands(text);
    rows.push({
      pc: inst.pc,
      bytes: bytesFor(rom, inst.pc, inst.length),
      mnemonic,
      operands,
      text,
      inst,
    });
    pc += inst.length;
  }

  return rows;
}

function collectTargets(rows) {
  const callTargets = [];
  const jpTargets = [];

  for (const row of rows) {
    if (!row.inst) continue;

    if (
      (row.inst.tag === 'call' || row.inst.tag === 'call-conditional') &&
      typeof row.inst.target === 'number'
    ) {
      callTargets.push({
        from: row.pc,
        target: row.inst.target,
        condition: row.inst.condition ?? null,
      });
    }

    if (
      (row.inst.tag === 'jp' || row.inst.tag === 'jp-conditional') &&
      typeof row.inst.target === 'number'
    ) {
      jpTargets.push({
        from: row.pc,
        target: row.inst.target,
        condition: row.inst.condition ?? null,
      });
    }
  }

  return { callTargets, jpTargets };
}

function targetLabel(target) {
  return SYMBOL_LABELS.get(target)
    || (target >= 0x097000 && target <= 0x097FFF ? 'nearby 0x097xxx routine' : '')
    || (target >= 0x099000 && target <= 0x099FFF ? 'nearby 0x099xxx routine' : '');
}

function printDisassembly(rows, indent = '') {
  for (const row of rows) {
    const label = row.inst && (
      row.inst.tag === 'call' || row.inst.tag === 'call-conditional' ||
      row.inst.tag === 'jp' || row.inst.tag === 'jp-conditional'
    ) ? targetLabel(row.inst.target) : '';
    const labelSuffix = label ? `  ; ${label}` : '';
    console.log(
      `${indent}${hex(row.pc)}  ${row.bytes.padEnd(20)}  ${row.mnemonic.padEnd(8)}  ${row.operands}${labelSuffix}`.trimEnd()
    );
  }
}

// Also collect memory references (LD A,(addr) etc.) for RAM address analysis
function collectMemoryRefs(rows) {
  const refs = [];
  for (const row of rows) {
    if (!row.inst) continue;
    // Check for memory-referencing instructions
    if (row.inst.addr !== undefined && row.inst.addr >= 0xD00000) {
      refs.push({ from: row.pc, addr: row.inst.addr, text: row.text });
    }
  }
  return refs;
}

// ========== PART A: Disassemble 0x0921CB (200 bytes) ==========

const PART_A_START = 0x0921CB;
const PART_A_BYTES = 200;

console.log('=== Phase 25AN: Static disassembly of 0x0921CB ===');
console.log('');

const partARows = decodeRange(PART_A_START, PART_A_BYTES);
const partATargets = collectTargets(partARows);
const partAMemRefs = collectMemoryRefs(partARows);

console.log(`ROM bytes: ${rom.length}`);
console.log(`Part A range: ${hex(PART_A_START)} for ${PART_A_BYTES} bytes in ADL mode`);
console.log('');
console.log('--- Part A: Disassembly of 0x0921CB ---');
console.log('');
printDisassembly(partARows);

console.log('');
console.log('--- Part A: CALL targets ---');
for (const item of partATargets.callTargets) {
  const label = targetLabel(item.target);
  const lbl = SYMBOL_LABELS.get(item.target) || '';
  console.log(`  ${hex(item.from)} -> CALL ${hex(item.target)}${item.condition ? ` (${item.condition})` : ''}${lbl ? `  ; ${lbl}` : ''}`);
}

console.log('');
console.log('--- Part A: JP targets ---');
for (const item of partATargets.jpTargets) {
  const lbl = SYMBOL_LABELS.get(item.target) || '';
  console.log(`  ${hex(item.from)} -> JP ${hex(item.target)}${item.condition ? ` (${item.condition})` : ''}${lbl ? `  ; ${lbl}` : ''}`);
}

console.log('');
console.log('--- Part A: RAM references (>= 0xD00000) ---');
for (const ref of partAMemRefs) {
  console.log(`  ${hex(ref.from)}  ${ref.text}  addr=${hex(ref.addr)}`);
}

// ========== PART B: Disassemble 0x05862F-0x058680 ==========

const PART_B_START = 0x05862F;
const PART_B_BYTES = 0x058680 - 0x05862F + 16; // go a bit past 0x058680

console.log('');
console.log('=== Part B: ENTER handler AFTER CALL 0x0921CB (0x05862F-0x058690) ===');
console.log('');

const partBRows = decodeRange(PART_B_START, PART_B_BYTES);
const partBTargets = collectTargets(partBRows);
const partBMemRefs = collectMemoryRefs(partBRows);

printDisassembly(partBRows);

console.log('');
console.log('--- Part B: CALL targets ---');
for (const item of partBTargets.callTargets) {
  const lbl = SYMBOL_LABELS.get(item.target) || '';
  console.log(`  ${hex(item.from)} -> CALL ${hex(item.target)}${item.condition ? ` (${item.condition})` : ''}${lbl ? `  ; ${lbl}` : ''}`);
}

console.log('');
console.log('--- Part B: JP targets ---');
for (const item of partBTargets.jpTargets) {
  const lbl = SYMBOL_LABELS.get(item.target) || '';
  console.log(`  ${hex(item.from)} -> JP ${hex(item.target)}${item.condition ? ` (${item.condition})` : ''}${lbl ? `  ; ${lbl}` : ''}`);
}

console.log('');
console.log('--- Part B: RAM references (>= 0xD00000) ---');
for (const ref of partBMemRefs) {
  console.log(`  ${hex(ref.from)}  ${ref.text}  addr=${hex(ref.addr)}`);
}

// ========== PART C: Search for 0xD01D0B references ==========

console.log('');
console.log('=== Part C: References to 0xD01D0B (numLastEntries) ===');
console.log('');
console.log('ti84pceg.inc identifies 0xD01D0B as: numLastEntries');
console.log('Adjacent RAM:');
console.log('  0xD01D0B = numLastEntries');
console.log('  0xD01D0C = currLastEntry');
console.log('');

// Search ROM for byte pattern 0B 1D D0 (little-endian for 0xD01D0B)
const target0 = 0x0B;
const target1 = 0x1D;
const target2 = 0xD0;
const matches = [];

for (let i = 0; i < rom.length - 2; i++) {
  if (rom[i] === target0 && rom[i + 1] === target1 && rom[i + 2] === target2) {
    matches.push(i);
  }
}

console.log(`Found ${matches.length} occurrences of byte pattern 0B 1D D0 in ROM:`);
console.log('');

for (const offset of matches) {
  // Decode a few instructions around the match to give context
  // The 3-byte address typically appears as an operand, so the instruction
  // starts a few bytes before
  const contextStart = Math.max(0, offset - 6);
  const contextRows = decodeRange(contextStart, 16);

  // Find the row that contains our offset
  const matchRow = contextRows.find(
    (row) => row.pc <= offset && row.pc + (row.inst?.length ?? 1) > offset
  );

  if (matchRow) {
    console.log(`  ${hex(offset)} (in instruction at ${hex(matchRow.pc)}): ${matchRow.text}`);
  } else {
    console.log(`  ${hex(offset)}: [context bytes: ${bytesFor(rom, offset - 2, 8)}]`);
  }
}

// ========== WATCHED ADDRESS CHECKS ==========

console.log('');
console.log('=== Watched address summary (all parts combined) ===');
console.log('');

const allCallTargets = [...partATargets.callTargets, ...partBTargets.callTargets];
const allJpTargets = [...partATargets.jpTargets, ...partBTargets.jpTargets];

for (const [address, label] of WATCHED_ADDRS) {
  const callHits = allCallTargets.filter((item) => item.target === address).map((item) => hex(item.from));
  const jpHits = allJpTargets.filter((item) => item.target === address).map((item) => hex(item.from));
  const status = [];
  if (callHits.length) status.push(`CALL from ${callHits.join(', ')}`);
  if (jpHits.length) status.push(`JP from ${jpHits.join(', ')}`);
  console.log(`  ${hex(address)}  ${label}: ${status.length ? status.join('; ') : 'not referenced'}`);
}

// ========== EXPAND INTERESTING CALL TARGETS ==========

console.log('');
console.log('=== Expanded disassembly of interesting call targets ===');
console.log('');

// Collect unique call targets from both parts that are in ROM range
const interestingTargets = new Set();
for (const item of allCallTargets) {
  // Expand targets that aren't already well-known large routines
  if (item.target >= 0x090000 && item.target <= 0x09FFFF) {
    interestingTargets.add(item.target);
  }
}

for (const target of [...interestingTargets].sort((a, b) => a - b)) {
  const label = SYMBOL_LABELS.get(target) || '';
  console.log(`--- ${hex(target)}${label ? `  (${label})` : ''} ---`);
  const rows = decodeRange(target, 80);
  printDisassembly(rows, '  ');
  console.log('');
}

console.log('=== End of Phase 25AN probe ===');
