#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

const TARGET = 0x0800A8;
const TARGET_CONTEXT_START = 0x0800A0;
const TARGET_SCAN_LIMIT = 0x080900;
const TARGET_HELPER = 0x080259;
const KEY_CLASS_ENTRY = 0x058D54;
const KEY_CLASS_MAX_INSTRUCTIONS = 30;

const SCAN_CODE_NAMES = {
  0x00: 'DOWN',
  0x01: 'LEFT',
  0x02: 'RIGHT',
  0x03: 'UP',
  0x10: 'ENTER',
  0x11: '+',
  0x12: '-',
  0x13: 'x',
  0x14: '/',
  0x15: '^',
  0x16: 'CLEAR',
  0x20: '(-)',
  0x21: '3',
  0x22: '6',
  0x23: '9',
  0x24: ')',
  0x25: 'TAN',
  0x26: 'VARS',
  0x30: '.',
  0x31: '2',
  0x32: '5',
  0x33: '8',
  0x34: '(',
  0x35: 'COS',
  0x36: 'PRGM',
  0x37: 'STAT',
  0x40: '0',
  0x41: '1',
  0x42: '4',
  0x43: '7',
  0x44: ',',
  0x45: 'SIN',
  0x46: 'APPS',
  0x47: 'X,T,0,n',
  0x51: 'STO>',
  0x52: 'LN',
  0x53: 'LOG',
  0x54: 'x^2',
  0x55: 'x^-1',
  0x56: 'MATH',
  0x57: 'ALPHA',
  0x60: 'GRAPH',
  0x61: 'TRACE',
  0x62: 'ZOOM',
  0x63: 'WINDOW',
  0x64: 'Y=',
  0x65: '2ND',
  0x66: 'MODE',
  0x67: 'DEL',
};

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function formatDisp(value) {
  return value >= 0 ? `+${value}` : `${value}`;
}

function bytesAt(addr, length) {
  return Array.from(rom.subarray(addr, Math.min(addr + length, rom.length)))
    .map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
}

function disasmAt(addr) {
  if (addr < 0 || addr >= rom.length) {
    return null;
  }

  try {
    return decodeInstruction(rom, addr, 'adl');
  } catch {
    return null;
  }
}

function formatInst(inst) {
  if (!inst) {
    return '<decode error>';
  }

  if (inst.dasm) {
    return inst.dasm;
  }

  switch (inst.tag) {
    case 'call':
      return `CALL ${hex(inst.target)}`;
    case 'call-conditional':
      return `CALL ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jp':
      return `JP ${hex(inst.target)}`;
    case 'jp-conditional':
      return `JP ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jr':
      return `JR ${hex(inst.target)}`;
    case 'jr-conditional':
      return `JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'ret':
      return 'RET';
    case 'ret-conditional':
      return `RET ${inst.condition.toUpperCase()}`;
    case 'push':
      return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop':
      return `POP ${inst.pair.toUpperCase()}`;
    case 'ld-reg-imm':
      return `LD ${inst.dest.toUpperCase()}, ${hex(inst.value, 2)}`;
    case 'ld-reg-reg':
      return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'ld-reg-mem':
      return `LD ${inst.dest.toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg':
      return `LD (${hex(inst.addr)}), ${inst.src.toUpperCase()}`;
    case 'ld-pair-imm':
      return `LD ${inst.pair.toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-mem':
      return `LD ${inst.pair.toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-ind-reg':
      return `LD (${inst.dest.toUpperCase()}), ${inst.src.toUpperCase()}`;
    case 'ld-reg-ind':
      return `LD ${inst.dest.toUpperCase()}, (${inst.src.toUpperCase()})`;
    case 'inc-reg':
      return `INC ${inst.reg.toUpperCase()}`;
    case 'dec-reg':
      return `DEC ${inst.reg.toUpperCase()}`;
    case 'inc-pair':
      return `INC ${inst.pair.toUpperCase()}`;
    case 'dec-pair':
      return `DEC ${inst.pair.toUpperCase()}`;
    case 'alu-imm':
      return `${inst.op.toUpperCase()} ${hex(inst.value, 2)}`;
    case 'alu-reg':
      return `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`;
    case 'indexed-cb-bit':
      return `BIT ${inst.bit}, (${inst.indexRegister.toUpperCase()}${formatDisp(inst.displacement)})`;
    case 'indexed-cb-res':
      return `RES ${inst.bit}, (${inst.indexRegister.toUpperCase()}${formatDisp(inst.displacement)})`;
    case 'indexed-cb-set':
      return `SET ${inst.bit}, (${inst.indexRegister.toUpperCase()}${formatDisp(inst.displacement)})`;
    case 'ex-de-hl':
      return 'EX DE, HL';
    case 'ldir':
      return 'LDIR';
    case 'ei':
      return 'EI';
    case 'di':
      return 'DI';
    case 'nop':
      return 'NOP';
    case 'daa':
      return 'DAA';
    default:
      return `[${inst.tag}]`;
  }
}

function disasmLinear(start, end, options = {}) {
  const {
    maxInstructions = 256,
    stopOnUnconditionalReturn = false,
    stopOnUnconditionalJump = false,
  } = options;

  const lines = [];
  let pc = start;

  while (pc < end && pc < rom.length && lines.length < maxInstructions) {
    const inst = disasmAt(pc);

    if (!inst || !inst.length) {
      lines.push({
        addr: pc,
        bytes: bytesAt(pc, 1),
        text: `DB ${hex(rom[pc], 2)}`,
        inst: null,
      });
      pc += 1;
      continue;
    }

    const line = {
      addr: pc,
      bytes: bytesAt(pc, inst.length),
      text: formatInst(inst),
      inst,
    };

    lines.push(line);
    pc += inst.length;

    if (stopOnUnconditionalReturn && inst.tag === 'ret') {
      break;
    }

    if (stopOnUnconditionalJump && inst.tag === 'jp') {
      break;
    }
  }

  return lines;
}

function findDirectCalls(target) {
  const lo = target & 0xFF;
  const mid = (target >>> 8) & 0xFF;
  const hi = (target >>> 16) & 0xFF;
  const hits = [];

  for (let addr = 0; addr <= rom.length - 4; addr++) {
    if (rom[addr] === 0xCD && rom[addr + 1] === lo && rom[addr + 2] === mid && rom[addr + 3] === hi) {
      hits.push(addr);
    }
  }

  return hits;
}

function detectTableLoads(lines) {
  return lines
    .filter((line) => line.inst?.tag === 'ld-pair-imm' && line.inst.value >= 0 && line.inst.value < rom.length)
    .map((line) => ({
      at: line.addr,
      pair: line.inst.pair.toUpperCase(),
      tableAddr: line.inst.value,
    }));
}

function detectCpCascade(lines) {
  return lines
    .filter((line) => line.inst?.tag === 'alu-imm' && line.inst.op === 'cp')
    .map((line) => ({ at: line.addr, value: line.inst.value }));
}

function writesA(inst) {
  if (!inst) {
    return false;
  }

  switch (inst.tag) {
    case 'ld-reg-imm':
    case 'ld-reg-reg':
    case 'ld-reg-mem':
    case 'ld-reg-ind':
      return inst.dest === 'a';
    case 'inc-reg':
    case 'dec-reg':
      return inst.reg === 'a';
    case 'alu-reg':
    case 'alu-imm':
    case 'alu-ind':
      return inst.op !== 'cp';
    case 'rotate-a':
    case 'ld-a-i':
    case 'ld-a-r':
    case 'in-imm':
      return true;
    default:
      return false;
  }
}

function dumpTable(tableAddr, length = 256) {
  console.log(`  Dumping ${Math.min(length, rom.length - tableAddr)} bytes from ${hex(tableAddr)}:`);
  for (let row = 0; row < length && tableAddr + row < rom.length; row += 16) {
    const addr = tableAddr + row;
    const width = Math.min(16, length - row, rom.length - addr);
    console.log(`    ${hex(addr)}  ${bytesAt(addr, width)}`);
  }

  const nonZero = [];
  for (let scanCode = 0; scanCode < length && tableAddr + scanCode < rom.length; scanCode++) {
    const value = rom[tableAddr + scanCode];
    if (value !== 0) {
      nonZero.push({
        scanCode,
        value,
        name: SCAN_CODE_NAMES[scanCode] || '???',
      });
    }
  }

  if (!nonZero.length) {
    console.log('  All scanned entries are zero.');
    return;
  }

  console.log('  Non-zero scan-code -> value entries:');
  for (const entry of nonZero) {
    console.log(`    ${hex(entry.scanCode, 2)} -> ${hex(entry.value, 2)}  [${entry.name}]`);
  }
}

function printSection(title) {
  const line = '='.repeat(88);
  console.log(`\n${line}`);
  console.log(title);
  console.log(line);
}

function printDisasm(lines, markers = new Map()) {
  for (const line of lines) {
    const marker = markers.get(line.addr) || '';
    console.log(`${hex(line.addr)}  ${line.bytes.padEnd(18)}  ${line.text}${marker}`);
  }
}

const targetBody = disasmLinear(TARGET, TARGET_SCAN_LIMIT, {
  maxInstructions: 64,
  stopOnUnconditionalReturn: true,
});

const targetContextEnd = targetBody.length
  ? targetBody[targetBody.length - 1].addr + (targetBody[targetBody.length - 1].inst?.length || 1)
  : TARGET + 1;

const targetContext = disasmLinear(TARGET_CONTEXT_START, targetContextEnd, {
  maxInstructions: 64,
});

const helperBody = disasmLinear(TARGET_HELPER, TARGET_HELPER + 0x20, {
  maxInstructions: 16,
  stopOnUnconditionalReturn: true,
});

const targetTableLoads = detectTableLoads(targetBody);
const targetCpCascade = detectCpCascade(targetBody);
const helperTableLoads = detectTableLoads(helperBody);
const helperCpCascade = detectCpCascade(helperBody);
const targetCallers = findDirectCalls(TARGET);
const keyClassLines = disasmLinear(KEY_CLASS_ENTRY, KEY_CLASS_ENTRY + 0x90, {
  maxInstructions: KEY_CLASS_MAX_INSTRUCTIONS,
  stopOnUnconditionalReturn: true,
});
const keyClassCallers = findDirectCalls(KEY_CLASS_ENTRY);

const targetWritesA = targetBody.some((line) => writesA(line.inst));
const helperWritesA = helperBody.some((line) => writesA(line.inst));
const bitOpsInTarget = targetBody.filter((line) => line.inst?.tag?.startsWith('indexed-cb-'));

printSection('SECTION 1: 0x0800A8 disassembly');
console.log('Entry point plus nearby context. The backward branch from 0x0800AC lands at 0x0800A6,');
console.log('so the local context starts slightly before the entry.');
printDisasm(
  targetContext,
  new Map([
    [TARGET, '  <<< entry'],
    [0x0800A6, '  <<< backward-branch target'],
    [0x0800B8, '  <<< trailing helper entry'],
  ]),
);

printSection('SECTION 2: 0x080259 subhelper');
printDisasm(helperBody, new Map([[TARGET_HELPER, '  <<< helper entry']]));

printSection('SECTION 3: Algorithm identification');
console.log(`Direct table loads in 0x0800A8: ${targetTableLoads.length}`);
console.log(`Direct CP-immediate comparisons in 0x0800A8: ${targetCpCascade.length}`);
console.log(`Direct table loads in 0x080259: ${helperTableLoads.length}`);
console.log(`Direct CP-immediate comparisons in 0x080259: ${helperCpCascade.length}`);
console.log(`Indexed BIT/RES/SET operations in 0x0800A8: ${bitOpsInTarget.length}`);
console.log(`Writes to register A in 0x0800A8: ${targetWritesA ? 'yes' : 'no'}`);
console.log(`Writes to register A in 0x080259: ${helperWritesA ? 'yes' : 'no'}`);

if (targetTableLoads.length || helperTableLoads.length) {
  console.log('\nPotential tables were found:');
  for (const table of [...targetTableLoads, ...helperTableLoads]) {
    console.log(`- ${hex(table.at)} loads ${table.pair} with ${hex(table.tableAddr)}`);
    dumpTable(table.tableAddr);
  }
} else {
  console.log('\nNo lookup-table base loads were found in either routine.');
}

if (targetCpCascade.length || helperCpCascade.length) {
  console.log('\nCP-immediate cascade entries were found:');
  for (const cp of [...targetCpCascade, ...helperCpCascade]) {
    console.log(`- ${hex(cp.at)} compares against ${hex(cp.value, 2)}`);
  }
} else {
  console.log('No CP-immediate cascade was found.');
}

console.log('\nObserved control pattern:');
console.log('- 0x0800A8 begins with `BIT 7, (IY+9)` and a backward branch to `0x0800A6`.');
console.log('- `0x0800A6` is `CP A ; RET`, so that branch returns immediately without changing A.');
console.log('- If the branch is not taken, 0x0800A8 calls 0x080259.');
console.log('- 0x080259 is only `BIT 3, (IY+1) ; RET`.');
console.log('- Back in 0x0800A8, `RET Z` / `BIT 5, (IY+69)` / `RET Z` / `BIT 5, (IY+68)` / `RET`');
console.log('  forms a flag predicate chain. The routine returns status in flags, not a translated byte in A.');
console.log('\nAlgorithm verdict: flag gate / condition filter.');
console.log('This is not a lookup table, not a CP cascade, not a computed jump table, and not a CPIR search.');

printSection('SECTION 4: All direct callers of 0x0800A8');
console.log(`Found ${targetCallers.length} direct CALL sites for ${hex(TARGET)}:\n`);
for (const caller of targetCallers) {
  const nextInst = disasmAt(caller + 4);
  const nextText = nextInst ? formatInst(nextInst) : '<decode error>';
  console.log(`- ${hex(caller)}  CALL ${hex(TARGET)}  | next: ${nextText}`);
}

console.log('\nCaller usage note: every call site immediately branches, returns, or conditionally calls based on Z/NZ.');
console.log('That matches a shared gate helper and does not match a scan-code translation routine.');

printSection('SECTION 5: 0x058D54 from the beginning');
printDisasm(
  keyClassLines,
  new Map([
    [KEY_CLASS_ENTRY, '  <<< entry'],
    [0x058D58, '  <<< immediately after 0x058EC6'],
    [0x058D5C, '  <<< call 0x0800A8'],
    [0x058D60, '  <<< branches on Z from 0x0800A8'],
  ]),
);

printSection('SECTION 6: Summary');
console.log(`- 0x0800A8 is not the real scan-code -> class converter.`);
console.log(`- It does not load any candidate table, does not compare A against class constants, and does not modify A.`);
console.log(`- Its only direct subcall, 0x080259, is also a one-bit flag test that preserves A.`);
console.log(`- The 0x058D54 sequence after 0x058EC6 is: RES 7,(IY+69) -> CALL 0x0800A8 -> JR Z, 0x058D89.`);
console.log(`- When 0x058D54 continues past that gate, it pushes AF before side-effect calls and later pops AF.`);
console.log(`  That means 0x058D54 is also preserving the incoming A value rather than converting it.`);
console.log(`- Conclusion: the scan-code/class value is already present in A before 0x058D54 runs, or is produced`);
console.log(`  somewhere upstream of 0x058D54. The translation is not happening inside 0x058EC6, 0x0800A8, or 0x080259.`);
console.log(`- Next candidate: trace the producers of A before direct callers of 0x058D54, not later callees in this chain.`);
console.log(`  Direct CALL sites to 0x058D54 in this ROM: ${keyClassCallers.map((addr) => hex(addr)).join(', ')}`);
console.log(`  In practice, the most useful upstream data-flow points are the caller at 0x058608 and the caller at 0x0922B7.`);
console.log(`  One passes A in from a register path, and the other loads A from RAM before calling 0x058D54.`);
