#!/usr/bin/env node

/**
 * Phase 25AM: Static disassembly of 0x099211.
 *
 * Session 97 traced the home-screen ENTER handler at 0x058626 to a CALL of
 * 0x099211. This probe disassembles 300 bytes at that address, records CALL
 * and JP targets, checks for ParseInp-adjacent references, and expands local
 * 0x099xxx call targets to show the nearby call graph.
 */

import { readFileSync } from 'fs';
import { decodeInstruction } from './ez80-decoder.js';

const rom = readFileSync('./TI-84_Plus_CE/ROM.rom');

const ADL_MODE = 'adl';
const MAIN_START = 0x099211;
const MAIN_BYTE_COUNT = 300;
const LOCAL_CALL_BYTE_COUNT = 100;

const SYMBOL_LABELS = new Map([
  [0x099211, 'DisarmScroll'],
  [0x09923A, 'MinToEdit'],
  [0x09927F, 'RclVarToEdit'],
  [0x099283, 'RclVarToEditPtr'],
  [0x0992A0, 'RclEntryToEdit'],
  [0x0992C3, 'RclToQueue'],
  [0x099914, 'ParseInp'],
  [0x0972C3, 'save edit cursor helper'],
  [0x0973BA, 'buffer flush helper'],
  [0x0973C8, 'ENTER dual-ParseInp path'],
  [0x061DEF, 'PushErrorHandler'],
  [0x061DD1, 'requested PopErrorHandler watch'],
  [0x061E20, 'actual PopErrorHandler used by 0x0973C8'],
  [0x05E872, 'CloseEditEqu / tokenize edit buffer'],
  [0x08383D, 'ChkFindSym'],
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
  [0x061DD1, 'requested PopErrorHandler watch'],
  [0x061E20, 'actual PopErrorHandler used by 0x0973C8'],
  [0x05E872, 'CloseEditEqu / tokenize edit buffer'],
  [0x08383D, 'ChkFindSym'],
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
    || (target >= 0x099000 && target <= 0x099FFF ? 'nearby 0x099xxx routine' : '');
}

function printDisassembly(rows, indent = '') {
  for (const row of rows) {
    console.log(
      `${indent}${hex(row.pc)}  ${row.bytes.padEnd(20)}  ${row.mnemonic.padEnd(8)}  ${row.operands}`.trimEnd()
    );
  }
}

const mainRows = decodeRange(MAIN_START, MAIN_BYTE_COUNT);
const { callTargets, jpTargets } = collectTargets(mainRows);

const groupedCalls = new Map();
for (const item of callTargets) {
  const list = groupedCalls.get(item.target) ?? [];
  list.push(`${hex(item.from)}${item.condition ? ` (${item.condition})` : ''}`);
  groupedCalls.set(item.target, list);
}

const groupedJps = new Map();
for (const item of jpTargets) {
  const list = groupedJps.get(item.target) ?? [];
  list.push(`${hex(item.from)}${item.condition ? ` (${item.condition})` : ''}`);
  groupedJps.set(item.target, list);
}

const localCallTargets = [...new Set(
  callTargets
    .map((item) => item.target)
    .filter((target) => target >= 0x099000 && target <= 0x099FFF)
)].sort((a, b) => a - b);

console.log('=== Phase 25AM: Static disassembly of 0x099211 ===');
console.log('');
console.log(`ROM bytes: ${rom.length}`);
console.log(`Main range: ${hex(MAIN_START)} for ${MAIN_BYTE_COUNT} bytes in ${ADL_MODE.toUpperCase()} mode`);
console.log('');
console.log('--- Main disassembly ---');
console.log('');
printDisassembly(mainRows);

console.log('');
console.log('--- CALL targets ---');
console.log('');
for (const [target, callers] of [...groupedCalls.entries()].sort((a, b) => a[0] - b[0])) {
  const label = targetLabel(target);
  console.log(`${hex(target)}${label ? `  ${label}` : ''}`);
  console.log(`  called from: ${callers.join(', ')}`);
}

console.log('');
console.log('--- JP targets ---');
console.log('');
for (const [target, callers] of [...groupedJps.entries()].sort((a, b) => a[0] - b[0])) {
  const label = targetLabel(target);
  console.log(`${hex(target)}${label ? `  ${label}` : ''}`);
  console.log(`  jumped from: ${callers.join(', ')}`);
}

console.log('');
console.log('--- Watched address checks ---');
console.log('');
for (const [address, label] of WATCHED_ADDRS) {
  const callHits = callTargets.filter((item) => item.target === address).map((item) => hex(item.from));
  const jpHits = jpTargets.filter((item) => item.target === address).map((item) => hex(item.from));
  const status = [];
  if (callHits.length) status.push(`CALL from ${callHits.join(', ')}`);
  if (jpHits.length) status.push(`JP from ${jpHits.join(', ')}`);
  console.log(`${hex(address)}  ${label}: ${status.length ? status.join('; ') : 'not referenced'}`);
}

console.log('');
console.log('--- Local 0x099xxx CALL target disassembly (100 bytes each) ---');
console.log('');
if (!localCallTargets.length) {
  console.log('No local 0x099xxx CALL targets found.');
} else {
  for (const target of localCallTargets) {
    const label = targetLabel(target);
    console.log(`${hex(target)}${label ? `  ${label}` : ''}`);
    printDisassembly(decodeRange(target, LOCAL_CALL_BYTE_COUNT), '  ');
    console.log('');
  }
}

console.log('--- Static conclusion ---');
console.log('');
console.log('0x099211 itself is DisarmScroll: flag cleanup plus an optional helper call, ending at 0x099239.');
console.log('Within the inspected 300-byte range there is no direct CALL/JP to ParseInp (0x099914),');
console.log('no reference to 0x0973C8, and no PushErrorHandler/PopErrorHandler setup.');
console.log('The local 0x099xxx call graph stays in MinToEdit/RclVarToEdit/RclToQueue helpers.');
