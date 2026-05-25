#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = fs.readFileSync(path.join(__dirname, 'ROM.rom'));

const START = 0x0085E3;
const SEQCASE = 0x00211B;
const RAM_EVENT_CODE = 0xD177B8;
const RAM_SUB_EVENT = 0xD177B9;

function hex(value, width = 6) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return (value & 0xFF).toString(16).toUpperCase().padStart(2, '0');
}

function upper(text) {
  return String(text).toUpperCase();
}

function read16(addr) {
  return rom[addr] | (rom[addr + 1] << 8);
}

function read24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function formatBytes(addr, length) {
  return Array.from(rom.subarray(addr, addr + length), (byte) => hexByte(byte)).join(' ');
}

function withPrefix(inst, text) {
  return inst.modePrefix ? `${upper(inst.modePrefix)} ${text}` : text;
}

function formatInstruction(inst) {
  switch (inst.tag) {
    case 'call':
      return withPrefix(inst, `CALL ${hex(inst.target)}`);
    case 'call-conditional':
      return withPrefix(inst, `CALL ${upper(inst.condition)},${hex(inst.target)}`);
    case 'jp':
      return withPrefix(inst, `JP ${hex(inst.target)}`);
    case 'jp-conditional':
      return withPrefix(inst, `JP ${upper(inst.condition)},${hex(inst.target)}`);
    case 'jr':
      return withPrefix(inst, `JR ${hex(inst.target)}`);
    case 'jr-conditional':
      return withPrefix(inst, `JR ${upper(inst.condition)},${hex(inst.target)}`);
    case 'djnz':
      return withPrefix(inst, `DJNZ ${hex(inst.target)}`);
    case 'ret':
      return withPrefix(inst, 'RET');
    case 'reti':
      return withPrefix(inst, 'RETI');
    case 'retn':
      return withPrefix(inst, 'RETN');
    case 'di':
      return withPrefix(inst, 'DI');
    case 'ei':
      return withPrefix(inst, 'EI');
    case 'push':
      return withPrefix(inst, `PUSH ${upper(inst.pair)}`);
    case 'pop':
      return withPrefix(inst, `POP ${upper(inst.pair)}`);
    case 'ld-pair-imm':
      return withPrefix(inst, `LD ${upper(inst.pair)},${hex(inst.value)}`);
    case 'ld-reg-mem':
      return withPrefix(inst, `LD ${upper(inst.dest)},(${hex(inst.addr)})`);
    case 'ld-mem-reg':
      return withPrefix(inst, `LD (${hex(inst.addr)}),${upper(inst.src)}`);
    case 'ld-reg-imm':
      return withPrefix(inst, `LD ${upper(inst.dest)},${hex(inst.value, 2)}`);
    case 'ld-reg-reg':
      return withPrefix(inst, `LD ${upper(inst.dest)},${upper(inst.src)}`);
    case 'ld-reg-ixd':
      return withPrefix(
        inst,
        `LD ${upper(inst.dest)},(${upper(inst.indexRegister)}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`
      );
    case 'ld-ixd-reg':
      return withPrefix(
        inst,
        `LD (${upper(inst.indexRegister)}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}),${upper(inst.src)}`
      );
    case 'ld-ixd-imm':
      return withPrefix(
        inst,
        `LD (${upper(inst.indexRegister)}${inst.displacement >= 0 ? '+' : ''}${inst.displacement}),${hex(inst.value, 2)}`
      );
    case 'ld-special':
      return withPrefix(inst, `LD ${upper(inst.dest)},${upper(inst.src)}`);
    case 'alu-reg':
      return withPrefix(inst, `${upper(inst.op)} ${upper(inst.src)}`);
    case 'alu-imm':
      return withPrefix(inst, `${upper(inst.op)} ${hex(inst.value, 2)}`);
    case 'alu-ixd':
      return withPrefix(
        inst,
        `${upper(inst.op)} (${upper(inst.indexRegister)}${inst.displacement >= 0 ? '+' : ''}${inst.displacement})`
      );
    case 'sbc-pair':
      return withPrefix(inst, `SBC HL,${upper(inst.src)}`);
    case 'add-pair':
      return withPrefix(inst, `ADD HL,${upper(inst.src)}`);
    case 'inc-pair':
      return withPrefix(inst, `INC ${upper(inst.pair)}`);
    case 'dec-pair':
      return withPrefix(inst, `DEC ${upper(inst.pair)}`);
    case 'inc-reg':
      return withPrefix(inst, `INC ${upper(inst.reg)}`);
    case 'dec-reg':
      return withPrefix(inst, `DEC ${upper(inst.reg)}`);
    case 'nop':
      return withPrefix(inst, 'NOP');
    case 'ld-sp-pair':
      return withPrefix(inst, `LD SP,${upper(inst.pair)}`);
    case 'rst':
      return withPrefix(inst, `RST ${hex(inst.target, 2)}`);
    case 'bit':
      return withPrefix(inst, `BIT ${inst.bit},${upper(inst.reg)}`);
    case 'set':
      return withPrefix(inst, `SET ${inst.bit},${upper(inst.reg)}`);
    case 'res':
      return withPrefix(inst, `RES ${inst.bit},${upper(inst.reg)}`);
    case 'ex':
      return withPrefix(inst, `EX ${upper(inst.left)},${upper(inst.right)}`);
    case 'exx':
      return withPrefix(inst, 'EXX');
    case 'ccf':
      return withPrefix(inst, 'CCF');
    case 'scf':
      return withPrefix(inst, 'SCF');
    case 'cpl':
      return withPrefix(inst, 'CPL');
    case 'neg':
      return withPrefix(inst, 'NEG');
    case 'halt':
      return withPrefix(inst, 'HALT');
    case 'slp':
      return withPrefix(inst, 'SLP');
    case 'im':
      return withPrefix(inst, `IM ${inst.mode}`);
    case 'in':
      return withPrefix(inst, `IN ${upper(inst.dest)},(${upper(inst.port || hex(inst.portImm, 2))})`);
    case 'out':
      return withPrefix(inst, `OUT (${upper(inst.port || hex(inst.portImm, 2))}),${upper(inst.src)}`);
    case 'ldir':
      return withPrefix(inst, 'LDIR');
    case 'lddr':
      return withPrefix(inst, 'LDDR');
    case 'ldi':
      return withPrefix(inst, 'LDI');
    case 'ldd':
      return withPrefix(inst, 'LDD');
    case 'cpir':
      return withPrefix(inst, 'CPIR');
    case 'cpdr':
      return withPrefix(inst, 'CPDR');
    case 'ret-conditional':
      return withPrefix(inst, `RET ${upper(inst.condition)}`);
    case 'ld-mem-pair':
      return withPrefix(inst, `LD (${hex(inst.addr)}),${upper(inst.pair)}`);
    case 'ld-pair-mem':
      return withPrefix(inst, `LD ${upper(inst.pair)},(${hex(inst.addr)})`);
    case 'rotate':
      return withPrefix(inst, `${upper(inst.op)} ${upper(inst.reg)}`);
    case 'jp-indirect':
      return withPrefix(inst, `JP (${upper(inst.reg || 'HL')})`);
    default:
      return `${inst.tag} ${JSON.stringify(inst)}`;
  }
}

function isTerminator(inst) {
  return inst.tag === 'ret'
    || inst.tag === 'reti'
    || inst.tag === 'retn'
    || inst.tag === 'halt'
    || inst.tag === 'slp';
}

function parseSeqcaseTable(tableStart) {
  const count = read16(tableStart);
  let cursor = tableStart + 2;
  const entries = [];

  for (let i = 0; i < count; i += 1) {
    entries.push({
      key: rom[cursor],
      target: read24(cursor + 1),
    });
    cursor += 4;
  }

  const defaultTarget = read24(cursor);
  const endExclusive = cursor + 3;

  return {
    tableStart,
    count,
    entries,
    defaultTarget,
    endExclusive,
    size: endExclusive - tableStart,
  };
}

function analyzeFunction(start) {
  const visited = new Map();
  const worklist = [start];
  const callTargets = [];
  const jumpTargets = [];
  const seqcaseTables = [];

  while (worklist.length > 0) {
    let pc = worklist.pop();

    while (typeof pc === 'number' && !visited.has(pc)) {
      const inst = decodeInstruction(rom, pc, 'adl');
      visited.set(pc, inst);

      if ((inst.tag === 'call' || inst.tag === 'call-conditional') && typeof inst.target === 'number') {
        callTargets.push({ source: inst.pc, tag: inst.tag, target: inst.target });
      }

      if (
        (inst.tag === 'jp' || inst.tag === 'jp-conditional' || inst.tag === 'jr' || inst.tag === 'jr-conditional' || inst.tag === 'djnz')
        && typeof inst.target === 'number'
      ) {
        jumpTargets.push({ source: inst.pc, tag: inst.tag, target: inst.target });
      }

      if (inst.tag === 'call' && inst.target === SEQCASE) {
        const table = parseSeqcaseTable(inst.nextPc);
        seqcaseTables.push({ callPc: inst.pc, ...table });
        for (const entry of table.entries) {
          worklist.push(entry.target);
        }
        worklist.push(table.defaultTarget);
        break;
      }

      if (inst.tag === 'call-conditional' && typeof inst.target === 'number') {
        worklist.push(inst.target);
        pc = inst.fallthrough;
        continue;
      }

      if ((inst.tag === 'jp' || inst.tag === 'jr') && typeof inst.target === 'number') {
        worklist.push(inst.target);
        break;
      }

      if ((inst.tag === 'jp-conditional' || inst.tag === 'jr-conditional' || inst.tag === 'djnz') && typeof inst.target === 'number') {
        worklist.push(inst.target);
        pc = inst.fallthrough;
        continue;
      }

      if (isTerminator(inst) || inst.tag === 'jp-indirect') {
        break;
      }

      pc = inst.nextPc;
    }
  }

  const instructions = [...visited.values()].sort((a, b) => a.pc - b.pc);
  const codeBytes = instructions.reduce((sum, inst) => sum + inst.length, 0);
  let endExclusive = start;

  for (const inst of instructions) {
    endExclusive = Math.max(endExclusive, inst.nextPc);
  }
  for (const table of seqcaseTables) {
    endExclusive = Math.max(endExclusive, table.endExclusive);
  }

  return {
    instructions,
    callTargets,
    jumpTargets,
    seqcaseTables,
    codeBytes,
    endExclusive,
    totalBytes: endExclusive - start,
  };
}

function uniqueTargets(records) {
  return [...new Set(records.map((record) => record.target))].sort((a, b) => a - b);
}

function groupSourcesByTarget(records) {
  const grouped = new Map();

  for (const record of records) {
    if (!grouped.has(record.target)) {
      grouped.set(record.target, []);
    }
    grouped.get(record.target).push(record.source);
  }

  return [...grouped.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([target, sources]) => ({
      target,
      sources: sources.sort((a, b) => a - b),
    }));
}

// --- Cross-reference scan: find all CALL 0x0085E3 in the ROM ---
function findCallers(targetAddr) {
  const callers = [];
  const lo = targetAddr & 0xFF;
  const mid = (targetAddr >> 8) & 0xFF;
  const hi = (targetAddr >> 16) & 0xFF;

  for (let i = 0; i < rom.length - 3; i++) {
    if (rom[i] === 0xCD && rom[i + 1] === lo && rom[i + 2] === mid && rom[i + 3] === hi) {
      callers.push(i);
    }
  }
  return callers;
}

// --- Identify RAM addresses referenced in the function ---
function findRAMReferences(instructions) {
  const refs = [];
  for (const inst of instructions) {
    if (inst.tag === 'ld-reg-mem' || inst.tag === 'ld-mem-reg') {
      const addr = inst.addr;
      if (addr >= 0xD00000) {
        refs.push({ pc: inst.pc, addr, tag: inst.tag, detail: formatInstruction(inst) });
      }
    }
    if (inst.tag === 'ld-pair-mem' || inst.tag === 'ld-mem-pair') {
      const addr = inst.addr;
      if (addr >= 0xD00000) {
        refs.push({ pc: inst.pc, addr, tag: inst.tag, detail: formatInstruction(inst) });
      }
    }
    if (inst.tag === 'ld-pair-imm') {
      const val = inst.value;
      if (val >= 0xD00000 && val < 0xE00000) {
        refs.push({ pc: inst.pc, addr: val, tag: 'ld-pair-imm (potential pointer)', detail: formatInstruction(inst) });
      }
    }
  }
  return refs;
}

// --- Annotate instructions with semantic meaning ---
function annotate(inst, ramRefs) {
  const notes = [];

  // Known RAM addresses
  if ((inst.tag === 'ld-reg-mem' || inst.tag === 'ld-mem-reg') && inst.addr === RAM_EVENT_CODE) {
    notes.push(inst.tag === 'ld-reg-mem' ? 'read current USB event code' : 'write USB event code');
  }
  if ((inst.tag === 'ld-reg-mem' || inst.tag === 'ld-mem-reg') && inst.addr === RAM_SUB_EVENT) {
    notes.push(inst.tag === 'ld-reg-mem' ? 'read current USB sub_event' : 'write USB sub_event');
  }

  // Return value patterns
  if (inst.tag === 'alu-reg' && inst.op === 'xor' && inst.src === 'a') {
    notes.push('A = 0 (return FAIL)');
  }
  if (inst.tag === 'alu-reg' && inst.op === 'or' && inst.src === 'a') {
    notes.push('test A == 0 (sets Z flag)');
  }
  if (inst.tag === 'ld-reg-imm' && inst.dest === 'a' && inst.value === 1) {
    notes.push('A = 1 (return PASS)');
  }
  if (inst.tag === 'ld-reg-imm' && inst.dest === 'a' && inst.value === 0) {
    notes.push('A = 0 (return FAIL)');
  }

  // CP instructions
  if (inst.tag === 'alu-imm' && inst.op === 'cp') {
    notes.push(`compare A with ${hex(inst.value, 2)}`);
  }

  return notes.length > 0 ? notes.join('; ') : '';
}

// ============ Main ============

const analysis = analyzeFunction(START);
const callers = findCallers(START);
const ramRefs = findRAMReferences(analysis.instructions);
const groupedCalls = groupSourcesByTarget(analysis.callTargets);
const groupedJumps = groupSourcesByTarget(analysis.jumpTargets);

const lines = [];
lines.push('Phase 436 - Decode of 0x0085E3 (USB State Validator)');
lines.push('=====================================================');
lines.push('');
lines.push(`ROM: TI-84_Plus_CE/ROM.rom`);
lines.push(`Function range: ${hex(START)}-${hex(analysis.endExclusive - 1)} (${analysis.totalBytes} bytes, 0x${analysis.totalBytes.toString(16).toUpperCase()})`);
lines.push(`Executable bytes: ${analysis.codeBytes}`);
lines.push(`Inline data bytes: ${analysis.totalBytes - analysis.codeBytes}`);
lines.push(`Reachable instructions: ${analysis.instructions.length}`);
lines.push('');

lines.push('Cross-references (callers)');
lines.push(`Found ${callers.length} CALL ${hex(START)} site(s) in ROM:`);
for (const caller of callers) {
  lines.push(`  - ${hex(caller)}`);
}
lines.push('');

lines.push('RAM references');
for (const ref of ramRefs) {
  const knownName =
    ref.addr === RAM_EVENT_CODE ? ' (USB event code)' :
    ref.addr === RAM_SUB_EVENT ? ' (USB sub_event)' :
    '';
  lines.push(`  - ${hex(ref.pc)}: ${ref.detail}  [${hex(ref.addr)}${knownName}]`);
}
lines.push('');

lines.push('Direct CALL targets inside function');
for (const record of groupedCalls) {
  lines.push(`  - ${hex(record.target)} from ${record.sources.map((addr) => hex(addr)).join(', ')}`);
}
if (groupedCalls.length === 0) {
  lines.push('  (none)');
}
lines.push('');

lines.push('Direct JP/JR targets inside function');
for (const record of groupedJumps) {
  lines.push(`  - ${hex(record.target)} from ${record.sources.map((addr) => hex(addr)).join(', ')}`);
}
lines.push('');

if (analysis.seqcaseTables.length > 0) {
  lines.push('Inline case tables');
  for (const table of analysis.seqcaseTables) {
    lines.push(`  CALL ${hex(SEQCASE)} at ${hex(table.callPc)}, ${table.count} entries:`);
    for (const entry of table.entries) {
      lines.push(`    case ${hex(entry.key, 2)} -> ${hex(entry.target)}`);
    }
    lines.push(`    default -> ${hex(table.defaultTarget)}`);
  }
  lines.push('');
}

lines.push('Annotated disassembly');
for (const inst of analysis.instructions) {
  const annotation = annotate(inst, ramRefs);
  const suffix = annotation ? `  ; ${annotation}` : '';
  lines.push(`${hex(inst.pc)}  ${formatBytes(inst.pc, inst.length).padEnd(18)}  ${formatInstruction(inst)}${suffix}`);
}
lines.push('');

// --- Summary analysis ---
lines.push('Analysis');
lines.push('--------');

// Identify return-value patterns
const retFail = analysis.instructions.filter(
  (i) => (i.tag === 'alu-reg' && i.op === 'xor' && i.src === 'a') ||
         (i.tag === 'ld-reg-imm' && i.dest === 'a' && i.value === 0)
);
const retPass = analysis.instructions.filter(
  (i) => i.tag === 'ld-reg-imm' && i.dest === 'a' && i.value === 1
);
lines.push(`Return-fail sites (A=0): ${retFail.length} at ${retFail.map((i) => hex(i.pc)).join(', ') || '(none)'}`);
lines.push(`Return-pass sites (A=1): ${retPass.length} at ${retPass.map((i) => hex(i.pc)).join(', ') || '(none)'}`);

// Identify CP comparisons
const compares = analysis.instructions.filter(
  (i) => i.tag === 'alu-imm' && i.op === 'cp'
);
lines.push(`CP comparisons: ${compares.length}`);
for (const cmp of compares) {
  lines.push(`  - ${hex(cmp.pc)}: CP ${hex(cmp.value, 2)}`);
}

lines.push('');
lines.push(`Conclusion: 0x0085E3 is a ${analysis.totalBytes}-byte function called from ${callers.length} site(s).`);
lines.push('See annotated disassembly above for full control flow.');

console.log(lines.join('\n'));
