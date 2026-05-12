#!/usr/bin/env node

/**
 * Phase 309 Probe: cpHL_DE comparator at 0x04C979
 *
 * Session 308 found the token classifier at 0x0855B1 uses CALL 0x04C979 as a
 * 16-bit compare (HL vs DE). This probe:
 *   1. Disassembles 0x04C979 until RET/JP
 *   2. Finds ALL callers (CALL and JP) in the ROM
 *   3. Categorizes callers by ROM region
 *   4. Disassembles context around up to 10 callers
 *   5. Disassembles the nearby range 0x04C960–0x04C9A0 for sibling utilities
 *   6. Prints summary
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

// ── Known addresses ───────────────────────────────────────────────────

const CPHL_DE = 0x04C979;

const KNOWN_ADDRS = {
  0x04C979: 'cpHL_DE (this function)',
  0x0855B1: 'tokenClassifier',
  0x042366: 'setClassResult',
  0x022346: 'token descriptor builder',
  0xD0058C: 'key_token (primary)',
  0xD0058E: 'key_token_ext (secondary)',
  0xD00587: 'raw_scan_code',
};

// ── Helpers ───────────────────────────────────────────────────────────

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
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
    case 'ld-reg-imm': return `LD ${inst.dest.toUpperCase()}, ${hex(inst.value, 2)}`;
    case 'ld-reg-reg': return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'ld-reg-mem': return `LD ${inst.dest.toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}), ${inst.src.toUpperCase()}`;
    case 'ld-pair-imm': return `LD ${inst.pair.toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-mem-pair': return `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`;
    case 'alu-imm': return `${inst.op.toUpperCase()} ${hex(inst.value, 2)}`;
    case 'alu-reg': return `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`;
    case 'push': return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop': return `POP ${inst.pair.toUpperCase()}`;
    case 'ld-pair-mem': return `LD ${inst.pair.toUpperCase()}, (${hex(inst.addr)})`;
    case 'add-pair': return `ADD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'ld-ind-reg': return `LD (${inst.dest.toUpperCase()}), ${inst.src.toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${inst.dest.toUpperCase()}, (${inst.src.toUpperCase()})`;
    case 'jp-hl': return 'JP (HL)';
    case 'inc-reg': return `INC ${inst.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${inst.reg.toUpperCase()}`;
    case 'inc-pair': return `INC ${inst.pair.toUpperCase()}`;
    case 'dec-pair': return `DEC ${inst.pair.toUpperCase()}`;
    case 'nop': return 'NOP';
    case 'halt': return 'HALT';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'rst': return `RST ${hex(inst.target, 2)}`;
    case 'ex-sp-hl': return 'EX (SP), HL';
    case 'ex-de-hl': return 'EX DE, HL';
    case 'ex-af': return "EX AF, AF'";
    case 'exx': return 'EXX';
    case 'ld-sp-hl': return 'LD SP, HL';
    case 'ccf': return 'CCF';
    case 'scf': return 'SCF';
    case 'cpl': return 'CPL';
    case 'daa': return 'DAA';
    case 'rla': return 'RLA';
    case 'rra': return 'RRA';
    case 'rlca': return 'RLCA';
    case 'rrca': return 'RRCA';
    case 'djnz': return `DJNZ ${hex(inst.target)}`;
    case 'ld-mem-a': return `LD (${hex(inst.addr)}), A`;
    case 'ld-a-mem': return `LD A, (${hex(inst.addr)})`;
    case 'sbc-pair': return `SBC HL, ${(inst.src || '??').toUpperCase()}`;
    default:
      if (inst.tag && inst.tag.startsWith('indexed-cb-')) {
        const op = inst.tag.replace('indexed-cb-', '').toUpperCase();
        return `${op} ${inst.bit ?? ''}, (${(inst.indexReg || 'IY').toUpperCase()}+${inst.displacement || 0})`;
      }
      if (inst.tag === 'ld-reg-indexed')
        return `LD ${(inst.dest || '?').toUpperCase()}, (${(inst.indexReg || 'IY').toUpperCase()}+${inst.displacement || 0})`;
      if (inst.tag === 'ld-indexed-reg')
        return `LD (${(inst.indexReg || 'IY').toUpperCase()}+${inst.displacement || 0}), ${(inst.src || '?').toUpperCase()}`;
      if (inst.tag === 'ld-indexed-imm')
        return `LD (${(inst.indexReg || 'IY').toUpperCase()}+${inst.displacement || 0}), ${hex(inst.value || 0, 2)}`;
      if (inst.tag === 'alu-indexed')
        return `${(inst.op || '?').toUpperCase()} (${(inst.indexReg || 'IY').toUpperCase()}+${inst.displacement || 0})`;
      if (inst.tag === 'bit-test-indexed')
        return `BIT ${inst.bit}, (${(inst.indexReg || 'IY').toUpperCase()}+${inst.displacement || 0})`;
      if (inst.tag === 'bit-set-indexed')
        return `SET ${inst.bit}, (${(inst.indexReg || 'IY').toUpperCase()}+${inst.displacement || 0})`;
      if (inst.tag === 'bit-reset-indexed')
        return `RES ${inst.bit}, (${(inst.indexReg || 'IY').toUpperCase()}+${inst.displacement || 0})`;
      if (inst.tag === 'lea')
        return `LEA ${(inst.dest || '??').toUpperCase()}, ${(inst.base || '??').toUpperCase()}+${inst.displacement || 0}`;
      if (inst.tag === 'neg') return 'NEG';
      if (inst.tag === 'reti') return 'RETI';
      if (inst.tag === 'retn') return 'RETN';
      if (inst.tag === 'ldir') return 'LDIR';
      if (inst.tag === 'lddr') return 'LDDR';
      if (inst.tag === 'mlt') return `MLT ${(inst.pair || inst.reg || '??').toUpperCase()}`;
      if (inst.tag === 'bit-test') return `BIT ${inst.bit}, ${(inst.reg || '?').toUpperCase()}`;
      if (inst.tag === 'bit-set') return `SET ${inst.bit}, ${(inst.reg || '?').toUpperCase()}`;
      if (inst.tag === 'bit-reset') return `RES ${inst.bit}, ${(inst.reg || '?').toUpperCase()}`;
      if (inst.tag === 'rotate-reg') return `${(inst.op || '?').toUpperCase()} ${(inst.reg || '?').toUpperCase()}`;
      if (inst.tag === 'or-a') return 'OR A';
      if (inst.tag === 'and-a') return 'AND A';
      return `[${inst.tag}] ${JSON.stringify(inst)}`;
  }
}

function disasmLinear(start, maxInstructions, stopOnRet = true) {
  const lines = [];
  const callTargets = new Set();
  let pc = start;

  for (let i = 0; i < maxInstructions && pc < rom.length; i++) {
    const inst = disasmAt(pc);
    if (!inst || !inst.length) {
      lines.push({ addr: pc, bytes: bytesAt(pc, 1), text: `DB ${hex(rom[pc], 2)}`, inst: null });
      pc += 1;
      continue;
    }

    const text = formatInst(inst);
    const annotation = annotateAddr(inst);
    lines.push({ addr: pc, bytes: bytesAt(pc, inst.length), text, annotation, inst });

    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      callTargets.add(inst.target);
    }

    pc += inst.length;

    if (stopOnRet && inst.tag === 'ret') break;
  }

  return { lines, callTargets, endPc: pc };
}

function annotateAddr(inst) {
  const notes = [];
  const check = (a) => {
    if (KNOWN_ADDRS[a]) notes.push(KNOWN_ADDRS[a]);
  };
  if (inst.addr !== undefined) check(inst.addr);
  if (inst.target !== undefined) check(inst.target);
  if (inst.value !== undefined && inst.value > 0x010000) check(inst.value);
  return notes.length ? notes.join('; ') : '';
}

function printDisasm(lines, indent = '  ') {
  for (const line of lines) {
    const ann = line.annotation ? `  ; ${line.annotation}` : '';
    console.log(`${indent}${hex(line.addr)}  ${line.bytes.padEnd(20)}  ${line.text.padEnd(38)}${ann}`);
  }
}

function printSection(title) {
  console.log(`\n${'='.repeat(92)}`);
  console.log(title);
  console.log('='.repeat(92));
}

function printSubSection(title) {
  console.log(`\n${'─'.repeat(72)}`);
  console.log(title);
  console.log('─'.repeat(72));
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 1: Disassemble 0x04C979 (cpHL_DE)
// ══════════════════════════════════════════════════════════════════════════

printSection('SECTION 1: Disassembly of cpHL_DE at 0x04C979');

console.log(`
  Purpose: 16-bit compare (HL vs DE), used by the token classifier (0x0855B1).
  Entry: HL = first operand, DE = second operand.
  Exit: flags set as if CP HL, DE (Z if equal, C if HL < DE).
`);

const { lines: cpLines, callTargets: cpCalls } = disasmLinear(CPHL_DE, 30, true);
printDisasm(cpLines);

const cpSize = cpLines.length > 0
  ? cpLines[cpLines.length - 1].addr + (cpLines[cpLines.length - 1].inst?.length || 1) - CPHL_DE
  : 0;
console.log(`\n  Function size: ${cpSize} bytes, ${cpLines.length} instructions`);
console.log(`  Sub-calls: ${[...cpCalls].map(t => hex(t)).join(', ') || '(none)'}`);

// ══════════════════════════════════════════════════════════════════════════
// SECTION 2: Find ALL callers in the ROM
// ══════════════════════════════════════════════════════════════════════════

printSection('SECTION 2: All callers of 0x04C979 in ROM');

// CALL 0x04C979 = 0xCD 0x79 0xC9 0x04
// JP   0x04C979 = 0xC3 0x79 0xC9 0x04
const callCallers = [];
const jpCallers = [];

const targetLo = 0x79;
const targetMid = 0xC9;
const targetHi = 0x04;

for (let i = 0; i < rom.length - 3; i++) {
  if (rom[i + 1] === targetLo && rom[i + 2] === targetMid && rom[i + 3] === targetHi) {
    if (rom[i] === 0xCD) {
      callCallers.push(i);
    } else if (rom[i] === 0xC3) {
      jpCallers.push(i);
    }
  }
}

console.log(`\n  CALL 0x04C979 callers (${callCallers.length} total):`);
for (const addr of callCallers) {
  console.log(`    ${hex(addr)}`);
}

console.log(`\n  JP 0x04C979 callers (${jpCallers.length} total):`);
for (const addr of jpCallers) {
  console.log(`    ${hex(addr)}`);
}

const allCallers = [
  ...callCallers.map(a => ({ addr: a, type: 'CALL' })),
  ...jpCallers.map(a => ({ addr: a, type: 'JP' })),
];

console.log(`\n  Total references: ${allCallers.length}`);

// ══════════════════════════════════════════════════════════════════════════
// SECTION 3: Categorize callers by ROM region
// ══════════════════════════════════════════════════════════════════════════

printSection('SECTION 3: Callers by ROM region');

const regionMap = {};
for (const caller of allCallers) {
  const region = `0x${(caller.addr >> 16).toString(16).toUpperCase().padStart(2, '0')}xxxx`;
  if (!regionMap[region]) regionMap[region] = [];
  regionMap[region].push(caller);
}

for (const [region, callers] of Object.entries(regionMap).sort()) {
  console.log(`\n  ${region}: ${callers.length} callers`);
  for (const c of callers) {
    console.log(`    ${hex(c.addr)} (${c.type})`);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 4: Context around up to 10 callers
// ══════════════════════════════════════════════════════════════════════════

printSection('SECTION 4: Caller context (up to 10 callers, 5 instructions before + after)');

const contextCallers = allCallers.slice(0, 10);

for (const caller of contextCallers) {
  printSubSection(`Caller at ${hex(caller.addr)} (${caller.type} 0x04C979)`);

  // Disassemble backwards: find approximate start 20 bytes before
  // and decode forward to find the 5 instructions before the caller
  const scanStart = Math.max(0, caller.addr - 30);
  const { lines: beforeLines } = disasmLinear(scanStart, 40, false);

  // Find the caller instruction in the decoded stream
  const callerIdx = beforeLines.findIndex(l => l.addr === caller.addr);

  if (callerIdx >= 0) {
    // Show 5 before
    const startIdx = Math.max(0, callerIdx - 5);
    const endIdx = Math.min(beforeLines.length, callerIdx + 6);
    const contextLines = beforeLines.slice(startIdx, endIdx);

    for (const line of contextLines) {
      const marker = line.addr === caller.addr ? '>>>' : '   ';
      const ann = line.annotation ? `  ; ${line.annotation}` : '';
      console.log(`  ${marker} ${hex(line.addr)}  ${line.bytes.padEnd(20)}  ${line.text.padEnd(38)}${ann}`);
    }
  } else {
    // Fallback: just decode from caller - 15 bytes
    const fallStart = Math.max(0, caller.addr - 15);
    const { lines: fallLines } = disasmLinear(fallStart, 12, false);
    for (const line of fallLines) {
      const marker = line.addr === caller.addr ? '>>>' : '   ';
      const ann = line.annotation ? `  ; ${line.annotation}` : '';
      console.log(`  ${marker} ${hex(line.addr)}  ${line.bytes.padEnd(20)}  ${line.text.padEnd(38)}${ann}`);
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 5: Nearby functions (0x04C960 — 0x04C9A0)
// ══════════════════════════════════════════════════════════════════════════

printSection('SECTION 5: Nearby functions — 0x04C960 through 0x04C9A0');

console.log(`
  Checking if cpHL_DE is part of a comparison utility family.
  Disassembling 0x04C960 to 0x04C9A0 linearly:
`);

const { lines: nearbyLines } = disasmLinear(0x04C960, 60, false);
const trimmedNearby = nearbyLines.filter(l => l.addr < 0x04C9A0);

// Mark function boundaries (RETs)
for (const line of trimmedNearby) {
  const isCpHlDe = line.addr === CPHL_DE ? ' <<<< cpHL_DE entry' : '';
  const isRet = line.inst?.tag === 'ret' ? ' ---- function boundary' : '';
  const ann = line.annotation ? `  ; ${line.annotation}` : '';
  console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(20)}  ${line.text.padEnd(38)}${ann}${isCpHlDe}${isRet}`);
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 6: Summary
// ══════════════════════════════════════════════════════════════════════════

printSection('SECTION 6: Summary');

// Analyze the function body
const cpBody = cpLines.map(l => l.text).join(' | ');
const hasSBC = cpLines.some(l => l.inst?.tag === 'sbc-pair');
const hasOrA = cpLines.some(l => l.text.includes('OR A') || (l.inst?.tag === 'alu-reg' && l.inst?.op === 'or' && l.inst?.src === 'a'));
const hasXorA = cpLines.some(l => (l.inst?.tag === 'alu-reg' && l.inst?.op === 'xor' && l.inst?.src === 'a'));

console.log(`
  Function: cpHL_DE at ${hex(CPHL_DE)}
  Size: ${cpSize} bytes, ${cpLines.length} instructions
  Instruction sequence: ${cpBody}

  Total callers: ${allCallers.length} (${callCallers.length} CALL + ${jpCallers.length} JP)

  Regions:`);

for (const [region, callers] of Object.entries(regionMap).sort()) {
  console.log(`    ${region}: ${callers.length}`);
}

console.log(`
  Characteristics:
    Uses SBC HL,DE: ${hasSBC ? 'YES' : 'no'}
    Clears carry (OR A / XOR A) before SBC: ${hasOrA ? 'YES (OR A)' : hasXorA ? 'YES (XOR A)' : 'no'}

  Assessment:
    ${allCallers.length > 10
      ? 'GENERAL-PURPOSE utility — widely used across ROM regions.'
      : allCallers.length > 3
        ? 'Semi-general — used in several ROM areas.'
        : 'SPECIALIZED — limited callers, may be domain-specific.'}
    ${Object.keys(regionMap).length > 3
      ? 'Cross-region usage confirms general-purpose nature.'
      : 'Limited region spread.'}
`);
