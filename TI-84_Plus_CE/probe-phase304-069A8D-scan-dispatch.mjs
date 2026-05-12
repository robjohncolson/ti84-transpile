#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

const MAIN_TARGET = 0x069A8D;
const SUB_TARGETS = [
  { addr: 0x08CA64, label: 'sub-target A', maxInst: 50 },
  { addr: 0x0562DE, label: 'sub-target B', maxInst: 50 },
  { addr: 0x09747C, label: 'sub-target C', maxInst: 50 },
];

const SCAN_CODE_NAMES = {
  0x00: 'DOWN', 0x01: 'LEFT', 0x02: 'RIGHT', 0x03: 'UP',
  0x10: 'ENTER', 0x11: '+', 0x12: '-', 0x13: 'x', 0x14: '/',
  0x15: '^', 0x16: 'CLEAR',
  0x20: '(-)', 0x21: '3', 0x22: '6', 0x23: '9', 0x24: ')',
  0x25: 'TAN', 0x26: 'VARS',
  0x30: '.', 0x31: '2', 0x32: '5', 0x33: '8', 0x34: '(',
  0x35: 'COS', 0x36: 'PRGM', 0x37: 'STAT',
  0x40: '0', 0x41: '1', 0x42: '4', 0x43: '7', 0x44: ',',
  0x45: 'SIN', 0x46: 'APPS', 0x47: 'X,T,0,n',
  0x51: 'STO>', 0x52: 'LN', 0x53: 'LOG', 0x54: 'x^2',
  0x55: 'x^-1', 0x56: 'MATH', 0x57: 'ALPHA',
  0x60: 'GRAPH', 0x61: 'TRACE', 0x62: 'ZOOM', 0x63: 'WINDOW',
  0x64: 'Y=', 0x65: '2ND', 0x66: 'MODE', 0x67: 'DEL',
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
  if (addr < 0 || addr >= rom.length) return null;
  try {
    return decodeInstruction(rom, addr, 'adl');
  } catch {
    return null;
  }
}

function formatInst(inst) {
  if (!inst) return '<decode error>';
  if (inst.dasm) return inst.dasm;

  switch (inst.tag) {
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${inst.condition.toUpperCase()}`;
    case 'push': return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop': return `POP ${inst.pair.toUpperCase()}`;
    case 'ld-reg-imm': return `LD ${inst.dest.toUpperCase()}, ${hex(inst.value, 2)}`;
    case 'ld-reg-reg': return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'ld-reg-mem': return `LD ${inst.dest.toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}), ${inst.src.toUpperCase()}`;
    case 'ld-pair-imm': return `LD ${inst.pair.toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-pair-mem': return `LD ${inst.pair.toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-ind-reg': return `LD (${inst.dest.toUpperCase()}), ${inst.src.toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${inst.dest.toUpperCase()}, (${inst.src.toUpperCase()})`;
    case 'inc-reg': return `INC ${inst.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${inst.reg.toUpperCase()}`;
    case 'inc-pair': return `INC ${inst.pair.toUpperCase()}`;
    case 'dec-pair': return `DEC ${inst.pair.toUpperCase()}`;
    case 'alu-imm': return `${inst.op.toUpperCase()} ${hex(inst.value, 2)}`;
    case 'alu-reg': return `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`;
    case 'indexed-cb-bit': return `BIT ${inst.bit}, (${inst.indexRegister.toUpperCase()}${formatDisp(inst.displacement)})`;
    case 'indexed-cb-res': return `RES ${inst.bit}, (${inst.indexRegister.toUpperCase()}${formatDisp(inst.displacement)})`;
    case 'indexed-cb-set': return `SET ${inst.bit}, (${inst.indexRegister.toUpperCase()}${formatDisp(inst.displacement)})`;
    case 'ex-de-hl': return 'EX DE, HL';
    case 'ldir': return 'LDIR';
    case 'ei': return 'EI';
    case 'di': return 'DI';
    case 'nop': return 'NOP';
    case 'daa': return 'DAA';
    case 'rst': return `RST ${hex(inst.target, 2)}`;
    case 'add-pair': return `ADD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'sbc-pair': return `SBC HL, ${inst.src.toUpperCase()}`;
    case 'adc-pair': return `ADC HL, ${inst.src.toUpperCase()}`;
    case 'djnz': return `DJNZ ${hex(inst.target)}`;
    case 'ex-sp-hl': return 'EX (SP), HL';
    case 'cpir': return 'CPIR';
    case 'cpi': return 'CPI';
    case 'cpd': return 'CPD';
    case 'cpdr': return 'CPDR';
    case 'lddr': return 'LDDR';
    case 'ldi': return 'LDI';
    case 'ldd': return 'LDD';
    case 'rla': return 'RLA';
    case 'rra': return 'RRA';
    case 'rlca': return 'RLCA';
    case 'rrca': return 'RRCA';
    case 'scf': return 'SCF';
    case 'ccf': return 'CCF';
    case 'cpl': return 'CPL';
    case 'halt': return 'HALT';
    case 'neg': return 'NEG';
    case 'reti': return 'RETI';
    case 'retn': return 'RETN';
    case 'im': return `IM ${inst.mode}`;
    case 'out-imm': return `OUT (${hex(inst.port, 2)}), A`;
    case 'in-imm': return `IN A, (${hex(inst.port, 2)})`;
    case 'ld-sp-hl': return 'LD SP, HL';
    case 'jp-hl': return 'JP (HL)';
    case 'ex-af': return "EX AF, AF'";
    case 'exx': return 'EXX';
    default: return `[${inst.tag}]`;
  }
}

function disasmLinear(start, maxInstructions, options = {}) {
  const {
    stopOnUnconditionalReturn = true,
    stopOnUnconditionalJump = true,
    maxBytes = 0x800,
  } = options;

  const lines = [];
  let pc = start;
  const end = start + maxBytes;

  while (pc < end && pc < rom.length && lines.length < maxInstructions) {
    const inst = disasmAt(pc);

    if (!inst || !inst.length) {
      lines.push({ addr: pc, bytes: bytesAt(pc, 1), text: `DB ${hex(rom[pc], 2)}`, inst: null });
      pc += 1;
      continue;
    }

    const line = { addr: pc, bytes: bytesAt(pc, inst.length), text: formatInst(inst), inst };
    lines.push(line);
    pc += inst.length;

    if (stopOnUnconditionalReturn && inst.tag === 'ret') break;
    if (stopOnUnconditionalJump && inst.tag === 'jp') break;
  }

  return lines;
}

function detectTableLoads(lines) {
  return lines
    .filter((line) => line.inst?.tag === 'ld-pair-imm' && line.inst.value >= 0 && line.inst.value < rom.length)
    .map((line) => ({ at: line.addr, pair: line.inst.pair.toUpperCase(), tableAddr: line.inst.value }));
}

function detectCpCascade(lines) {
  return lines
    .filter((line) => line.inst?.tag === 'alu-imm' && line.inst.op === 'cp')
    .map((line) => ({ at: line.addr, value: line.inst.value }));
}

function detectCalls(lines) {
  return lines
    .filter((line) => line.inst?.tag === 'call' || line.inst?.tag === 'call-conditional')
    .map((line) => ({
      at: line.addr,
      target: line.inst.target,
      conditional: line.inst.tag === 'call-conditional',
      condition: line.inst.condition || null,
    }));
}

function detectJumps(lines) {
  return lines
    .filter((line) =>
      line.inst?.tag === 'jp' || line.inst?.tag === 'jp-conditional' ||
      line.inst?.tag === 'jr' || line.inst?.tag === 'jr-conditional'
    )
    .map((line) => ({
      at: line.addr,
      target: line.inst.target,
      type: line.inst.tag,
      condition: line.inst.condition || null,
    }));
}

function writesA(inst) {
  if (!inst) return false;
  switch (inst.tag) {
    case 'ld-reg-imm': case 'ld-reg-reg': case 'ld-reg-mem': case 'ld-reg-ind':
      return inst.dest === 'a';
    case 'inc-reg': case 'dec-reg':
      return inst.reg === 'a';
    case 'alu-reg': case 'alu-imm': case 'alu-ind':
      return inst.op !== 'cp';
    case 'rotate-a': case 'ld-a-i': case 'ld-a-r': case 'in-imm':
    case 'rla': case 'rra': case 'rlca': case 'rrca': case 'cpl': case 'neg': case 'daa':
      return true;
    default:
      return false;
  }
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
      nonZero.push({ scanCode, value, name: SCAN_CODE_NAMES[scanCode] || '???' });
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

// ============================================================
// SECTION 1: Main target 0x069A8D
// ============================================================

const mainBody = disasmLinear(MAIN_TARGET, 200, {
  stopOnUnconditionalReturn: true,
  stopOnUnconditionalJump: true,
  maxBytes: 0x400,
});

printSection('SECTION 1: 0x069A8D — scan-code-to-class dispatch (up to 200 inst or unconditional RET/JP)');
console.log(`Disassembled ${mainBody.length} instructions.\n`);
printDisasm(mainBody, new Map([[MAIN_TARGET, '  <<< ENTRY']]));

const mainTableLoads = detectTableLoads(mainBody);
const mainCpCascade = detectCpCascade(mainBody);
const mainCalls = detectCalls(mainBody);
const mainJumps = detectJumps(mainBody);

console.log(`\n  Table loads (LD pair, imm in ROM range): ${mainTableLoads.length}`);
for (const t of mainTableLoads) console.log(`    ${hex(t.at)}: LD ${t.pair}, ${hex(t.tableAddr)}`);

console.log(`  CP-immediate comparisons: ${mainCpCascade.length}`);
for (const cp of mainCpCascade) console.log(`    ${hex(cp.at)}: CP ${hex(cp.value, 2)}`);

console.log(`  CALL instructions: ${mainCalls.length}`);
for (const c of mainCalls) {
  const cond = c.conditional ? ` ${c.condition.toUpperCase()},` : '';
  console.log(`    ${hex(c.at)}: CALL${cond} ${hex(c.target)}`);
}

console.log(`  JP/JR instructions: ${mainJumps.length}`);
for (const j of mainJumps) {
  const cond = j.condition ? ` ${j.condition.toUpperCase()},` : '';
  console.log(`    ${hex(j.at)}: ${j.type.toUpperCase()}${cond} ${hex(j.target)}`);
}

console.log(`  Writes to A: ${mainBody.some((l) => writesA(l.inst)) ? 'yes' : 'no'}`);

// ============================================================
// SECTION 2: Sub-targets
// ============================================================

for (const sub of SUB_TARGETS) {
  const subBody = disasmLinear(sub.addr, sub.maxInst, {
    stopOnUnconditionalReturn: true,
    stopOnUnconditionalJump: true,
    maxBytes: 0x200,
  });

  printSection(`SECTION 2: ${hex(sub.addr)} — ${sub.label} (up to ${sub.maxInst} inst)`);
  console.log(`Disassembled ${subBody.length} instructions.\n`);
  printDisasm(subBody, new Map([[sub.addr, '  <<< ENTRY']]));

  const subTableLoads = detectTableLoads(subBody);
  const subCpCascade = detectCpCascade(subBody);
  const subCalls = detectCalls(subBody);

  console.log(`\n  Table loads: ${subTableLoads.length}`);
  for (const t of subTableLoads) console.log(`    ${hex(t.at)}: LD ${t.pair}, ${hex(t.tableAddr)}`);

  console.log(`  CP-immediate comparisons: ${subCpCascade.length}`);
  for (const cp of subCpCascade) console.log(`    ${hex(cp.at)}: CP ${hex(cp.value, 2)}`);

  console.log(`  CALL instructions: ${subCalls.length}`);
  for (const c of subCalls) {
    const cond = c.conditional ? ` ${c.condition.toUpperCase()},` : '';
    console.log(`    ${hex(c.at)}: CALL${cond} ${hex(c.target)}`);
  }

  console.log(`  Writes to A: ${subBody.some((l) => writesA(l.inst)) ? 'yes' : 'no'}`);

  if (subTableLoads.length) {
    console.log('\n  Table contents:');
    for (const t of subTableLoads) {
      dumpTable(t.tableAddr, 128);
    }
  }
}

// ============================================================
// SECTION 3: Table dumps from main target
// ============================================================

if (mainTableLoads.length) {
  printSection('SECTION 3: Table dumps from 0x069A8D');
  for (const t of mainTableLoads) {
    console.log(`\nTable at ${hex(t.tableAddr)} loaded by ${hex(t.at)} into ${t.pair}:`);
    dumpTable(t.tableAddr, 128);
  }
}

// ============================================================
// SECTION 4: Callers of 0x069A8D
// ============================================================

const mainCallers = findDirectCalls(MAIN_TARGET);

printSection('SECTION 4: Direct callers of 0x069A8D');
console.log(`Found ${mainCallers.length} direct CALL sites:\n`);
for (const caller of mainCallers) {
  const context = disasmLinear(caller - 8, 6, {
    stopOnUnconditionalReturn: false,
    stopOnUnconditionalJump: false,
    maxBytes: 0x20,
  });
  console.log(`  Caller at ${hex(caller)}:`);
  for (const line of context) {
    const mark = line.addr === caller ? '  <<<' : '';
    console.log(`    ${hex(line.addr)}  ${line.bytes.padEnd(18)}  ${line.text}${mark}`);
  }
  console.log('');
}

// ============================================================
// SECTION 5: Dispatch mechanism analysis
// ============================================================

printSection('SECTION 5: Dispatch mechanism analysis');

const hasComputedJump = mainBody.some((l) => l.inst?.tag === 'jp-hl');
const hasCpir = mainBody.some((l) => l.inst?.tag === 'cpir');
const hasDjnz = mainBody.some((l) => l.inst?.tag === 'djnz');
const hasRst = mainBody.some((l) => l.inst?.tag === 'rst');

console.log('Mechanism detection for 0x069A8D:');
console.log(`  CP-immediate cascade (if/else chain):  ${mainCpCascade.length > 2 ? 'YES' : 'no'} (${mainCpCascade.length} comparisons)`);
console.log(`  Table lookup (LD pair, ROM-range imm):  ${mainTableLoads.length > 0 ? 'YES' : 'no'} (${mainTableLoads.length} loads)`);
console.log(`  Computed jump (JP (HL)):                ${hasComputedJump ? 'YES' : 'no'}`);
console.log(`  CPIR string search:                     ${hasCpir ? 'YES' : 'no'}`);
console.log(`  DJNZ loop:                              ${hasDjnz ? 'YES' : 'no'}`);
console.log(`  RST dispatch:                           ${hasRst ? 'YES' : 'no'}`);

if (mainCpCascade.length > 0) {
  console.log('\n  CP cascade values (potential scan code class boundaries):');
  for (const cp of mainCpCascade) {
    const scanName = SCAN_CODE_NAMES[cp.value] || '';
    console.log(`    ${hex(cp.at)}: CP ${hex(cp.value, 2)}${scanName ? '  (' + scanName + ')' : ''}`);
  }
}

console.log('\n  Dispatch pattern summary:');
if (mainCpCascade.length > 2) {
  console.log('  -> CP cascade detected. The function compares A against immediate values');
  console.log('     and branches to different handlers based on the scan code range.');
} else if (mainTableLoads.length > 0 && hasComputedJump) {
  console.log('  -> Jump table detected. A register-pair is loaded with a table base,');
  console.log('     an offset is added, and JP (HL) dispatches to the handler.');
} else if (mainTableLoads.length > 0) {
  console.log('  -> Lookup table detected. A register-pair is loaded with a table base');
  console.log('     and used for indexed reads (translate scan code to class byte).');
} else {
  console.log('  -> No standard dispatch pattern detected in the linear scan.');
  console.log('     The function may use an indirect mechanism via sub-calls,');
  console.log('     or the dispatch may be split across the three sub-targets.');
}

printSection('END OF PROBE');
