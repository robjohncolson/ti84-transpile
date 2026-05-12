#!/usr/bin/env node

/**
 * Phase 309 Probe: setClassResult at 0x042366
 *
 * Session 308 decoded the token classifier at 0x0855B1. It calls 0x042366 to
 * store the classification result (register A = class index 0–9) at RAM address
 * D005F9. This probe traces what 0x042366 actually does, who else calls it,
 * and how D005F9 feeds into downstream token processing.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

// ── Known addresses ───────────────────────────────────────────────────

const SET_CLASS_RESULT = 0x042366;

const KNOWN_ADDRS = {
  0x0855B1: 'tokenClassifier',
  0x04C979: 'cpHL_DE — compare HL with DE',
  0x042366: 'setClassResult (this function)',
  0x022346: 'token descriptor builder',
  0x022390: 'complex token descriptor variant',
  0xD0058C: 'key_token (primary token byte)',
  0xD0058E: 'key_token_ext (secondary/2-byte token)',
  0xD00587: 'raw_scan_code',
  0xD00080: 'IY base (OS flags)',
  0xD005F8: 'saved by 0x022390 before calling classifier',
  0xD005F9: 'token class result byte',
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
      if (inst.tag === 'out-port-a') return `OUT (${hex(inst.port, 2)}), A`;
      if (inst.tag === 'in-a-port') return `IN A, (${hex(inst.port, 2)})`;
      return `[${inst.tag}] ${JSON.stringify(inst)}`;
  }
}

function annotate(inst) {
  const notes = [];
  const check = (a) => {
    if (KNOWN_ADDRS[a]) notes.push(KNOWN_ADDRS[a]);
  };
  if (inst.addr !== undefined) check(inst.addr);
  if (inst.target !== undefined) check(inst.target);
  if (inst.value !== undefined && inst.value > 0xD00000) check(inst.value);
  return notes.length ? notes.join('; ') : '';
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
    const ann = annotate(inst);
    lines.push({ addr: pc, bytes: bytesAt(pc, inst.length), text, annotation: ann, inst });

    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      callTargets.add(inst.target);
    }

    pc += inst.length;

    if (stopOnRet && (inst.tag === 'ret' || inst.tag === 'reti' || inst.tag === 'retn')) break;
  }

  return { lines, callTargets, endPc: pc };
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
// SECTION 1: Full disassembly of 0x042366 (setClassResult)
// ══════════════════════════════════════════════════════════════════════════

printSection('SECTION 1: Disassembly of setClassResult — 0x042366');

console.log(`
Context:
  Called from the token classifier (0x0855B1) and possibly others.
  Session 308 says it stores A (class index 0–9) to RAM D005F9.
  This probe determines what else the function does.
`);

// Disassemble a generous window — function may be short
const { lines: funcLines, callTargets: funcCalls } = disasmLinear(SET_CLASS_RESULT, 40, true);
printDisasm(funcLines);

const funcSize = funcLines.length > 0
  ? funcLines[funcLines.length - 1].addr + (funcLines[funcLines.length - 1].inst?.length || 1) - SET_CLASS_RESULT
  : 0;

console.log(`\n  Function size: ${funcSize} bytes, ${funcLines.length} instructions`);
console.log(`  CALL targets: ${[...funcCalls].map(t => hex(t)).join(', ') || '(none)'}`);

// Also disassemble past the first RET in case the function has multiple paths
printSubSection('Extended disassembly (past first RET, up to 60 instructions)');
const { lines: extLines } = disasmLinear(SET_CLASS_RESULT, 60, false);
// Show only instructions beyond the first RET
let pastFirstRet = false;
const extraLines = [];
for (const line of extLines) {
  if (pastFirstRet) {
    extraLines.push(line);
  }
  if (!pastFirstRet && line.inst && line.inst.tag === 'ret') {
    pastFirstRet = true;
  }
}
if (extraLines.length > 0) {
  console.log('  (Instructions after first RET — may be additional entry points or separate functions)');
  printDisasm(extraLines.slice(0, 30));
} else {
  console.log('  (No additional code after RET)');
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 2: Find ALL callers of 0x042366
// ══════════════════════════════════════════════════════════════════════════

printSection('SECTION 2: All ROM callers of CALL 0x042366');

console.log(`
Scanning entire ROM for byte pattern CD 66 23 04 (CALL 0x042366).
For each hit: 5 instructions before and 5 after the CALL.
`);

// CALL 0x042366 in eZ80 ADL mode = CD 66 23 04
const callPattern = [0xCD, 0x66, 0x23, 0x04];
const callers = [];

for (let i = 0; i < rom.length - callPattern.length; i++) {
  if (rom[i] === callPattern[0] &&
      rom[i + 1] === callPattern[1] &&
      rom[i + 2] === callPattern[2] &&
      rom[i + 3] === callPattern[3]) {
    callers.push(i);
  }
}

console.log(`  Found ${callers.length} caller(s): ${callers.map(a => hex(a)).join(', ')}`);

for (const callerAddr of callers) {
  printSubSection(`Caller at ${hex(callerAddr)}`);

  // Disassemble backward: find ~5 instructions before
  // Heuristic: start ~20 bytes before and decode forward
  const contextStart = Math.max(0, callerAddr - 20);
  const { lines: contextLines } = disasmLinear(contextStart, 30, false);

  // Find the caller instruction and show 5 before + 5 after
  const callerIdx = contextLines.findIndex(l => l.addr === callerAddr);
  if (callerIdx >= 0) {
    const startIdx = Math.max(0, callerIdx - 5);
    const endIdx = Math.min(contextLines.length, callerIdx + 6);
    const slice = contextLines.slice(startIdx, endIdx);
    printDisasm(slice);

    // Mark the caller line
    console.log(`  >>> CALL at ${hex(callerAddr)} (index ${callerIdx - startIdx} in listing)`);
  } else {
    // Fallback: just decode from the caller
    console.log('  (Could not align backward context — showing from CALL onward)');
    const { lines: fwdLines } = disasmLinear(callerAddr, 10, false);
    printDisasm(fwdLines);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 3: Trace D005F9 usage across the ROM
// ══════════════════════════════════════════════════════════════════════════

printSection('SECTION 3: All ROM references to D005F9');

console.log(`
Scanning for:
  LD A, (0xD005F9) = 3A F9 05 D0
  LD (0xD005F9), A = 32 F9 05 D0

Also scanning for the 3-byte address pattern F9 05 D0 to catch other
addressing modes (LD pair, etc.).
`);

// Pattern: LD A, (D005F9) = 3A F9 05 D0
const ldAFromD005F9 = [0x3A, 0xF9, 0x05, 0xD0];
// Pattern: LD (D005F9), A = 32 F9 05 D0
const ldD005F9FromA = [0x32, 0xF9, 0x05, 0xD0];
// Generic 3-byte address pattern
const addrPattern = [0xF9, 0x05, 0xD0];

const refsReadA = [];   // LD A, (D005F9)
const refsWriteA = [];  // LD (D005F9), A
const refsOther = [];   // other references

for (let i = 0; i < rom.length - 4; i++) {
  // Check LD A, (D005F9)
  if (rom[i] === ldAFromD005F9[0] &&
      rom[i + 1] === ldAFromD005F9[1] &&
      rom[i + 2] === ldAFromD005F9[2] &&
      rom[i + 3] === ldAFromD005F9[3]) {
    refsReadA.push(i);
    continue;
  }
  // Check LD (D005F9), A
  if (rom[i] === ldD005F9FromA[0] &&
      rom[i + 1] === ldD005F9FromA[1] &&
      rom[i + 2] === ldD005F9FromA[2] &&
      rom[i + 3] === ldD005F9FromA[3]) {
    refsWriteA.push(i);
    continue;
  }
  // Check generic address bytes (but not if already matched above)
  if (rom[i] === addrPattern[0] &&
      rom[i + 1] === addrPattern[1] &&
      rom[i + 2] === addrPattern[2]) {
    // Skip if the byte before is 0x3A or 0x32 (already caught)
    if (i > 0 && (rom[i - 1] === 0x3A || rom[i - 1] === 0x32)) continue;
    refsOther.push(i);
  }
}

console.log(`  LD A, (D005F9) reads:  ${refsReadA.length} — at ${refsReadA.map(a => hex(a)).join(', ') || '(none)'}`);
console.log(`  LD (D005F9), A writes: ${refsWriteA.length} — at ${refsWriteA.map(a => hex(a)).join(', ') || '(none)'}`);
console.log(`  Other D005F9 refs:     ${refsOther.length}`);

// Show context for each LD A, (D005F9) — READERS
for (const refAddr of refsReadA) {
  printSubSection(`READ: LD A, (D005F9) at ${hex(refAddr)}`);
  const contextStart = Math.max(0, refAddr - 20);
  const { lines } = disasmLinear(contextStart, 20, false);
  const refIdx = lines.findIndex(l => l.addr === refAddr);
  if (refIdx >= 0) {
    const startIdx = Math.max(0, refIdx - 5);
    const endIdx = Math.min(lines.length, refIdx + 6);
    printDisasm(lines.slice(startIdx, endIdx));
  } else {
    const { lines: fwd } = disasmLinear(refAddr, 10, false);
    printDisasm(fwd);
  }
}

// Show context for each LD (D005F9), A — WRITERS
for (const refAddr of refsWriteA) {
  printSubSection(`WRITE: LD (D005F9), A at ${hex(refAddr)}`);
  const contextStart = Math.max(0, refAddr - 20);
  const { lines } = disasmLinear(contextStart, 20, false);
  const refIdx = lines.findIndex(l => l.addr === refAddr);
  if (refIdx >= 0) {
    const startIdx = Math.max(0, refIdx - 5);
    const endIdx = Math.min(lines.length, refIdx + 6);
    printDisasm(lines.slice(startIdx, endIdx));
  } else {
    const { lines: fwd } = disasmLinear(refAddr, 10, false);
    printDisasm(fwd);
  }
}

// Show a sample of other refs (limit to first 15 to avoid noise)
if (refsOther.length > 0) {
  printSubSection(`OTHER references to D005F9 address bytes (showing up to 15)`);
  const showRefs = refsOther.slice(0, 15);
  for (const refAddr of showRefs) {
    // The address pattern starts at refAddr, but the instruction starts 1+ bytes before
    const instStart = Math.max(0, refAddr - 4);
    const { lines } = disasmLinear(instStart, 5, false);
    // Find the instruction that contains the address
    const relevant = lines.filter(l => l.addr <= refAddr && l.addr + (l.inst?.length || 1) > refAddr);
    if (relevant.length > 0) {
      printDisasm(relevant);
    } else {
      console.log(`    ${hex(refAddr - 1)}: ${bytesAt(refAddr - 1, 6)}`);
    }
  }
  if (refsOther.length > 15) {
    console.log(`  ... and ${refsOther.length - 15} more`);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 4: D005F9 data flow map
// ══════════════════════════════════════════════════════════════════════════

printSection('SECTION 4: D005F9 Data Flow Summary');

console.log(`
WRITERS (store to D005F9):
`);
for (const addr of refsWriteA) {
  // Get a bit of context around the write
  const contextStart = Math.max(0, addr - 15);
  const { lines } = disasmLinear(contextStart, 15, false);
  const writeIdx = lines.findIndex(l => l.addr === addr);
  // Try to find what function this is in (look for a nearby CALL target pattern or known address)
  let funcGuess = '(unknown function)';
  if (addr >= 0x042366 && addr < 0x042366 + 50) funcGuess = 'setClassResult (0x042366)';
  else if (addr >= 0x0855B1 && addr < 0x085700) funcGuess = 'tokenClassifier region';
  else if (addr >= 0x022346 && addr < 0x022400) funcGuess = 'tokenDescriptorBuilder region';

  console.log(`  ${hex(addr)} in ${funcGuess}`);
  if (writeIdx >= 0 && writeIdx > 0) {
    // Show the instruction right before the write to see what A was loaded with
    const prevInst = lines[writeIdx - 1];
    if (prevInst) {
      console.log(`    preceding: ${formatInst(prevInst.inst)}`);
    }
  }
}

console.log(`
READERS (load from D005F9):
`);
for (const addr of refsReadA) {
  const contextStart = Math.max(0, addr - 5);
  const { lines } = disasmLinear(addr, 8, false);
  // Show what happens right after the read
  let funcGuess = '(unknown function)';
  if (addr >= 0x042366 && addr < 0x042366 + 50) funcGuess = 'setClassResult (0x042366)';
  else if (addr >= 0x0855B1 && addr < 0x085700) funcGuess = 'tokenClassifier region';
  else if (addr >= 0x022346 && addr < 0x022400) funcGuess = 'tokenDescriptorBuilder region';
  else if (addr >= 0x080000 && addr < 0x090000) funcGuess = '0x08xxxx region (token/keyboard)';

  console.log(`  ${hex(addr)} in ${funcGuess}`);
  if (lines.length > 1) {
    const nextInst = lines[1];
    if (nextInst) {
      console.log(`    following: ${formatInst(nextInst.inst)}`);
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 5: Also scan for D005F8 (the byte right before D005F9)
// ══════════════════════════════════════════════════════════════════════════

printSection('SECTION 5: D005F8 references (companion byte)');

console.log(`
D005F8 is saved by the caller at 0x022390 before invoking the classifier.
It may be part of a two-byte classification result struct alongside D005F9.
`);

const ldAFromD005F8 = [0x3A, 0xF8, 0x05, 0xD0];
const ldD005F8FromA = [0x32, 0xF8, 0x05, 0xD0];

const refsF8Read = [];
const refsF8Write = [];

for (let i = 0; i < rom.length - 4; i++) {
  if (rom[i] === ldAFromD005F8[0] && rom[i + 1] === ldAFromD005F8[1] &&
      rom[i + 2] === ldAFromD005F8[2] && rom[i + 3] === ldAFromD005F8[3]) {
    refsF8Read.push(i);
  }
  if (rom[i] === ldD005F8FromA[0] && rom[i + 1] === ldD005F8FromA[1] &&
      rom[i + 2] === ldD005F8FromA[2] && rom[i + 3] === ldD005F8FromA[3]) {
    refsF8Write.push(i);
  }
}

console.log(`  LD A, (D005F8) reads:  ${refsF8Read.length} — at ${refsF8Read.map(a => hex(a)).join(', ') || '(none)'}`);
console.log(`  LD (D005F8), A writes: ${refsF8Write.length} — at ${refsF8Write.map(a => hex(a)).join(', ') || '(none)'}`);

// Show brief context for each D005F8 reference
for (const addr of [...refsF8Write, ...refsF8Read]) {
  const isWrite = refsF8Write.includes(addr);
  const contextStart = Math.max(0, addr - 15);
  const { lines } = disasmLinear(contextStart, 15, false);
  const refIdx = lines.findIndex(l => l.addr === addr);
  if (refIdx >= 0) {
    const startIdx = Math.max(0, refIdx - 3);
    const endIdx = Math.min(lines.length, refIdx + 4);
    printSubSection(`${isWrite ? 'WRITE' : 'READ'}: D005F8 at ${hex(addr)}`);
    printDisasm(lines.slice(startIdx, endIdx));
  }
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 6: Connection summary
// ══════════════════════════════════════════════════════════════════════════

printSection('SECTION 6: Token Classifier → setClassResult → Downstream Summary');

console.log(`
Data flow chain:

  1. Token classifier (0x0855B1)
     - Input: D = primary token byte, E = secondary token byte
     - Classifies token into class index 0–9
     - Stores result: CALL 0x042366 (setClassResult)

  2. setClassResult (0x042366)
     - ${funcLines.length} instructions, ${funcSize} bytes
     - CALL targets: ${[...funcCalls].map(t => hex(t)).join(', ') || '(none)'}
     - Writes to D005F9: ${refsWriteA.filter(a => a >= SET_CLASS_RESULT && a < SET_CLASS_RESULT + funcSize).length > 0 ? 'YES (confirmed inside function)' : 'check extended code'}

  3. D005F9 is READ at ${refsReadA.length} location(s): ${refsReadA.map(a => hex(a)).join(', ')}
     D005F9 is WRITTEN at ${refsWriteA.length} location(s): ${refsWriteA.map(a => hex(a)).join(', ')}

  4. D005F8 (companion byte) is READ at ${refsF8Read.length} location(s)
     D005F8 (companion byte) is WRITTEN at ${refsF8Write.length} location(s)

  5. Callers of setClassResult: ${callers.length} total — ${callers.map(a => hex(a)).join(', ')}

Key questions answered:
  - What ELSE does 0x042366 do besides storing A to D005F9?
    → See Section 1 disassembly above.
  - How does D005F9 feed into downstream processing?
    → See Section 3/4 — readers listed with their next instruction.
  - Is D005F8 + D005F9 a struct?
    → See Section 5 — D005F8 write/read patterns.
`);

console.log('Probe complete.');
