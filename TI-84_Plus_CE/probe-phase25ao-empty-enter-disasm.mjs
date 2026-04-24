#!/usr/bin/env node

/**
 * Phase 25AO: Disassembly of 0x058C65 — the "empty ENTER" path.
 *
 * On fresh boot, numLastEntries (0xD01D0B) = 0, so the ENTER handler at
 * 0x05862F takes the Z path: JP 0x058C65.
 *
 * Question: Does 0x058C65 eventually reach the common tail at 0x058693
 * (which calls 0x099910 -> ParseInp)?
 */

import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync('./TI-84_Plus_CE/ROM.rom');

const ADL_MODE = 'adl';

const SYMBOL_LABELS = new Map([
  [0x099211, 'DisarmScroll'],
  [0x0921CB, 'post-DisarmScroll subroutine'],
  [0x099914, 'ParseInp'],
  [0x099910, 'ParseInp entry (pre-wrapper)'],
  [0x0585E9, 'home-screen ENTER handler'],
  [0x058693, 'common tail (-> ParseInp path)'],
  [0x058C65, 'empty ENTER entry'],
  [0x058C83, 'sub_058C83'],
  [0x058C7D, 'sub_058C7D (after 0x058C65 block)'],
  [0x058D19, 'sub_058D19'],
  [0x05E872, 'CloseEditEqu'],
  [0x05E86A, 'JumpToE86A'],
  [0x05E84D, 'ClearHomeSub'],
  [0x061DEF, 'PushErrorHandler'],
  [0x061E20, 'PopErrorHandler'],
  [0x07FF4F, 'OS helper (07FF)'],
  [0x07FF7B, 'OS helper (07FF7B)'],
  [0x08003D, 'OS helper (0800)'],
  [0x0800A8, 'CALL 0x0008A8'],
  [0x08384B, 'ChkFindSym'],
  [0x091B09, 'OS helper (091B)'],
  [0x09384F, 'OS helper (0938)'],
  [0x098D8E, 'OS helper (098D)'],
  [0x0992A0, 'RclEntryToEdit'],
  [0x08D0BB, 'OS helper (08D0BB)'],
]);

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
  const jrTargets = [];

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

    if (
      (row.inst.tag === 'jr' || row.inst.tag === 'jr-conditional') &&
      typeof row.inst.target === 'number'
    ) {
      jrTargets.push({
        from: row.pc,
        target: row.inst.target,
        condition: row.inst.condition ?? null,
      });
    }
  }

  return { callTargets, jpTargets, jrTargets };
}

function collectMemoryRefs(rows) {
  const refs = [];
  for (const row of rows) {
    if (!row.inst) continue;
    if (row.inst.addr !== undefined && row.inst.addr >= 0xD00000) {
      refs.push({ from: row.pc, addr: row.inst.addr, text: row.text });
    }
  }
  return refs;
}

function targetLabel(target) {
  return SYMBOL_LABELS.get(target) || '';
}

function printDisassembly(rows, indent = '') {
  for (const row of rows) {
    const label = row.inst && (
      row.inst.tag === 'call' || row.inst.tag === 'call-conditional' ||
      row.inst.tag === 'jp' || row.inst.tag === 'jp-conditional' ||
      row.inst.tag === 'jr' || row.inst.tag === 'jr-conditional'
    ) ? targetLabel(row.inst.target) : '';
    const labelSuffix = label ? `  ; ${label}` : '';
    console.log(
      `${indent}${hex(row.pc)}  ${row.bytes.padEnd(20)}  ${row.mnemonic.padEnd(8)}  ${row.operands}${labelSuffix}`.trimEnd()
    );
  }
}

// ========== PART A: Disassemble 0x058C65 (the "empty ENTER" path) ==========

const PART_A_START = 0x058C65;
const PART_A_BYTES = 220;

console.log('=== Phase 25AO: Disassembly of 0x058C65 ("empty ENTER" path) ===');
console.log('');
console.log(`ROM bytes: ${rom.length}`);
console.log(`Range: ${hex(PART_A_START)} for ${PART_A_BYTES} bytes in ADL mode`);
console.log('');

const partARows = decodeRange(PART_A_START, PART_A_BYTES);
const partATargets = collectTargets(partARows);
const partAMemRefs = collectMemoryRefs(partARows);

console.log('--- Disassembly of 0x058C65 ---');
console.log('');
printDisassembly(partARows);

console.log('');
console.log('--- CALL targets ---');
for (const item of partATargets.callTargets) {
  const lbl = targetLabel(item.target);
  console.log(`  ${hex(item.from)} -> CALL ${hex(item.target)}${item.condition ? ` (${item.condition})` : ''}${lbl ? `  ; ${lbl}` : ''}`);
}

console.log('');
console.log('--- JP targets ---');
for (const item of partATargets.jpTargets) {
  const lbl = targetLabel(item.target);
  console.log(`  ${hex(item.from)} -> JP ${hex(item.target)}${item.condition ? ` (${item.condition})` : ''}${lbl ? `  ; ${lbl}` : ''}`);
}

console.log('');
console.log('--- JR targets ---');
for (const item of partATargets.jrTargets) {
  const lbl = targetLabel(item.target);
  console.log(`  ${hex(item.from)} -> JR ${hex(item.target)}${item.condition ? ` (${item.condition})` : ''}${lbl ? `  ; ${lbl}` : ''}`);
}

console.log('');
console.log('--- RAM references (>= 0xD00000) ---');
for (const ref of partAMemRefs) {
  console.log(`  ${hex(ref.from)}  ${ref.text}  addr=${hex(ref.addr)}`);
}

// ========== PART B: Common tail at 0x058693 for reference ==========

const PART_B_START = 0x058690;
const PART_B_BYTES = 48;

console.log('');
console.log('=== Reference: Common tail at 0x058693 ===');
console.log('');

const partBRows = decodeRange(PART_B_START, PART_B_BYTES);
printDisassembly(partBRows);

// ========== PART C: Subroutines called from 0x058C65 block ==========

console.log('');
console.log('=== Expanded subroutines called from the 0x058C65 block ===');
console.log('');

// Collect unique call targets in ROM range for expansion
const subroutinesToExpand = new Set();
for (const item of partATargets.callTargets) {
  if (item.target >= 0x058000 && item.target <= 0x059FFF) {
    subroutinesToExpand.add(item.target);
  }
}

for (const target of [...subroutinesToExpand].sort((a, b) => a - b)) {
  const label = targetLabel(target);
  console.log(`--- ${hex(target)}${label ? `  (${label})` : ''} ---`);
  const rows = decodeRange(target, 80);
  printDisassembly(rows, '  ');
  const targets = collectTargets(rows);
  if (targets.callTargets.length) {
    console.log('  Sub-calls:');
    for (const item of targets.callTargets) {
      const lbl = targetLabel(item.target);
      console.log(`    ${hex(item.from)} -> CALL ${hex(item.target)}${lbl ? `  ; ${lbl}` : ''}`);
    }
  }
  if (targets.jpTargets.length) {
    console.log('  JP targets:');
    for (const item of targets.jpTargets) {
      const lbl = targetLabel(item.target);
      console.log(`    ${hex(item.from)} -> JP ${hex(item.target)}${lbl ? `  ; ${lbl}` : ''}`);
    }
  }
  console.log('');
}

// ========== PART D: Control flow analysis ==========

console.log('');
console.log('=== Control flow analysis: Does 0x058C65 reach 0x058693? ===');
console.log('');

// Check if any JP/JR in the 0x058C65 block targets 0x058693
const TARGET_COMMON_TAIL = 0x058693;
let reachesCommonTail = false;

for (const item of [...partATargets.jpTargets, ...partATargets.jrTargets]) {
  if (item.target === TARGET_COMMON_TAIL) {
    console.log(`  YES: ${hex(item.from)} branches to ${hex(TARGET_COMMON_TAIL)} (common tail)`);
    reachesCommonTail = true;
  }
}

if (!reachesCommonTail) {
  console.log(`  No direct JP/JR to ${hex(TARGET_COMMON_TAIL)} found in the 0x058C65 block.`);
  console.log('');
  console.log('  Checking for fall-through or indirect paths...');

  // Check if any instruction in the block is a RET
  const rets = partARows.filter((row) =>
    row.inst && (row.inst.tag === 'ret' || row.inst.tag === 'ret-conditional')
  );
  console.log(`  RET instructions in block: ${rets.length}`);
  for (const row of rets) {
    console.log(`    ${hex(row.pc)}  ${row.text}`);
  }

  // Check all branch targets to see if any land near 0x058693
  console.log('');
  console.log('  All branch targets from 0x058C65 block:');
  for (const item of [...partATargets.jpTargets, ...partATargets.jrTargets]) {
    const delta = item.target - TARGET_COMMON_TAIL;
    const lbl = targetLabel(item.target);
    console.log(`    ${hex(item.from)} -> ${hex(item.target)} (delta from 0x058693: ${delta >= 0 ? '+' : ''}${delta})${lbl ? `  ; ${lbl}` : ''}`);
  }
}

console.log('');
console.log('=== End of Phase 25AO probe ===');
