#!/usr/bin/env node

/**
 * Phase 308 Probe: Token Classifier at 0x0855B1
 *
 * Called from the complex token descriptor variant at 0x022390 (session 307).
 * The calling sequence is: 0x022390 saves D005F8, calls 0x0855B1 (token
 * classifier), then 0x080D1D (setup), then 0x0846EA (lookup).
 *
 * Session 301 mapped a 28-entry CP cascade in the CoorMon system using
 * 0xD0058E as a secondary token byte. This probe determines whether
 * 0x0855B1 is part of that same cascade or a different classification path.
 *
 * ROM callers of 0x0855B1 (3 total):
 *   0x0223FD — inside token descriptor builder (complex variant at 0x022390)
 *   0x085562 — within the same 0x08xxxx region (sibling classifier?)
 *   0x087654 — another 0x08xxxx caller
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

// ── Known addresses ───────────────────────────────────────────────────

const TOKEN_CLASSIFIER = 0x0855B1;

const KNOWN_ADDRS = {
  0x0855B1: 'tokenClassifier (this function)',
  0x04C979: 'cpHL_DE — compare HL with DE, sets Z/C flags',
  0x042366: 'setClassResult — stores classification result A into D005F9?',
  0x022390: 'complex token descriptor variant (caller)',
  0x0223FD: 'caller in tokenDescriptorBuilder complex path',
  0x085562: 'caller in 0x08xxxx region',
  0x087654: 'caller in 0x08xxxx region',
  0xD0058C: 'key_token (primary token byte)',
  0xD0058E: 'key_token_ext (secondary/2-byte token)',
  0xD00587: 'raw_scan_code',
  0xD00080: 'IY base (OS flags)',
  0xD005F8: 'saved by 0x022390 before calling classifier',
  0xD00595: 'referenced at 0x08565F (past function end)',
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
      return `[${inst.tag}] ${JSON.stringify(inst)}`;
  }
}

function annotateInst(inst, addr) {
  const notes = [];

  const checkAddr = (a) => {
    if (a === 0xD0058C) notes.push('key_token (primary token byte)');
    if (a === 0xD0058E) notes.push('key_token_ext (secondary/2-byte token)');
    if (a === 0xD00587) notes.push('raw_scan_code');
    if (a === 0xD005F8) notes.push('saved by caller 0x022390');
    if (a === 0xD00595) notes.push('OS var at D00595');
    if (a === 0x04C979) notes.push('cpHL_DE — compare HL with DE');
    if (a === 0x042366) notes.push('setClassResult — store classification');
  };

  if (inst.addr !== undefined) checkAddr(inst.addr);
  if (inst.target !== undefined) checkAddr(inst.target);
  if (inst.value !== undefined && inst.value > 0xD00000) checkAddr(inst.value);

  // Annotate comparison values in the range-check cascade
  if (inst.tag === 'ld-pair-imm' && inst.pair === 'hl') {
    const v = inst.value;
    notes.push(`HL = ${v} (0x${v.toString(16).toUpperCase()})`);
  }

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
    const annotation = annotateInst(inst, pc);
    lines.push({ addr: pc, bytes: bytesAt(pc, inst.length), text, annotation, inst });

    if (inst.tag === 'call' || inst.tag === 'call-conditional') {
      callTargets.add(inst.target);
    }

    pc += inst.length;

    if (stopOnRet && inst.tag === 'ret') break;
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
// SECTION 1: Full disassembly of 0x0855B1
// ══════════════════════════════════════════════════════════════════════════

printSection(`SECTION 1: Token Classifier — 0x0855B1 (full disassembly)`);

console.log(`
Context:
  Called from 0x022390 (complex token descriptor variant).
  Session 295 labeled this "class/range classifier".
  3 ROM callers: 0x0223FD, 0x085562, 0x087654.

  Entry state (from caller 0x022390):
    D = primary token byte (from D0058C or D005F8)
    E = secondary token byte (from D0058E)
    Carry flag state = unknown

  Question: Is this the same CP cascade as the CoorMon 28-entry system,
  or a separate classification pathway?
`);

// Disassemble without stopping on first RET — the function has multiple
// exit paths (conditional RETs, JR branches to later RETs)
const { lines: mainLines, callTargets: mainCalls } = disasmLinear(TOKEN_CLASSIFIER, 80, false);

// Trim: stop after the last reachable RET (at 0x08565A or 0x08565D)
const trimmedLines = [];
let lastRetAddr = 0;
for (const line of mainLines) {
  trimmedLines.push(line);
  if (line.inst && line.inst.tag === 'ret') lastRetAddr = line.addr;
  // Stop after 0x08565E (JR to 0x085656) — that's the last reachable code
  if (line.addr >= 0x08565F) break;
}

// Actually find the right end — the function spans 0x0855B1 to 0x08565E
const funcLines = mainLines.filter(l => l.addr < 0x08565F);
printDisasm(funcLines);

const funcSize = funcLines.length > 0
  ? funcLines[funcLines.length - 1].addr + (funcLines[funcLines.length - 1].inst?.length || 1) - TOKEN_CLASSIFIER
  : 0;

console.log(`\n  Function size: ${funcSize} bytes, ${funcLines.length} instructions`);
console.log(`  CALL targets: ${[...mainCalls].filter(t => {
  // Only include calls within function range
  return funcLines.some(l => l.inst?.target === t);
}).map(t => hex(t)).join(', ') || '(none)'}`);

// ══════════════════════════════════════════════════════════════════════════
// SECTION 2: Annotated control flow analysis
// ══════════════════════════════════════════════════════════════════════════

printSection(`SECTION 2: Control Flow Analysis`);

console.log(`
The function is a multi-branch classifier. Input: D = primary token, E = secondary token.

Phase 1: Quick prefix dispatch (0x0855B1–0x0855D9)
─────────────────────────────────────────────────────
  0x0855B1: LD A, D; CP 0xFC        — Is primary token 0xFC?
  0x0855B4: JR NZ, 0x0855C1         — No → try next prefix

  If D == 0xFC:
    0x0855B6: LD A, E; CP 0x41      — Is secondary byte >= 0x41?
    0x0855B9: JR NC, 0x0855D8       — Yes (E >= 0x41) → SCF; RET (carry = "unclassified")
    If E < 0x41:
      0x0855BB: SUB 0x3C            — A = E - 0x3C
      0x0855BD: RET C               — If E < 0x3C → return with carry (out of range)
      0x0855BE: ADD 0x05            — A = (E - 0x3C) + 5 = E - 0x37
      0x0855C0: RET                 — Return A = class index for FC 3C..FC 40

  0x0855C1: CP 0xFE                 — Is primary token 0xFE?
  0x0855C3: LD A, E
  0x0855C4: JR NZ, 0x0855CD         — No → try next prefix

  If D == 0xFE:
    0x0855C6: CP 0x82               — Is secondary byte >= 0x82?
    0x0855C8: JR NC, 0x0855D8       — Yes → SCF; RET (out of range)
    If E < 0x82:
      0x0855CA: SUB 0x7D            — A = E - 0x7D
      0x0855CC: RET                 — Return A = class index for FE 7D..FE 81

  0x0855CD: CP 0x42                 — Is secondary == 0x42?
  0x0855CF: JR NZ, 0x0855D8         — No → SCF; RET

  If E == 0x42 (and D != 0xFC, 0xFE):
    0x0855D1: LD A, D; CP 0x0A      — Is primary token >= 0x0A?
    0x0855D4: JR NC, 0x0855D8       — Yes → SCF; RET
    If D < 0x0A:
      0x0855D6: OR A                — Clear carry, set Z from A (A = D)
      0x0855D7: RET                 — Return A = D (small class index 0x00..0x09)

  0x0855D8: SCF                     — Set carry flag = "not classified by phase 1"
  0x0855D9: RET                     — Return with carry set

Phase 2: Range-table cascade (0x0855DA–0x08565E)
─────────────────────────────────────────────────────
  Only reached if Phase 1 returned carry (D != 0xFC, 0xFE, and E != 0x42 with D<0x0A).
  Wait — this section starts at 0x0855DA but is NOT directly reachable from Phase 1.
  Phase 1 always returns. Phase 2 must be called separately or jumped to from elsewhere.

  Let me re-examine: 0x0855DA starts with LD A, D; CP 0xFF...

  Actually, looking at the callers: 0x0855B1 is the FULL function entry. The code
  at 0x0855DA is reachable only by falling through from a non-taken JR at 0x0855D4
  (JR NC) or from a caller that enters at 0x0855DA directly.

  Correction: 0x0855D8 (SCF; RET) is a terminal exit. 0x0855DA is NOT reachable
  from the top of the function — it must be a SEPARATE entry point or called from
  a different path. But 0x0855D4 JR NC targets 0x0855D8, not 0x0855DA.

  The code at 0x0855DA is therefore a SECOND FUNCTION or a second entry point,
  possibly entered by callers at 0x085562 or 0x087654.

  0x0855DA: LD A, D; CP 0xFF    — Is D == 0xFF?
  0x0855DD: JR NZ, skip (1 byte)
  0x0855DF: DEC D               — If D == 0xFF, set D = 0xFE

  Then begins a cascade of LD HL, <value>; CALL 0x04C979; JR Z, <target>:
    HL = 0x00FBC8 → cpHL_DE → if DE == 0xFBC8, jump to 0x085654 (A=7, call 0x042366)
      Special: if Z, LD A, 8; CALL 0x042366; RET NZ
    HL = 0x00FBC7 → cpHL_DE → if DE == 0xFBC7, jump to 0x085654 (A=7)
    HL = 0x0000C9 → cpHL_DE → if DE == 0x00C9, jump to 0x08565B (A=9)
    HL = 0x000054 → cpHL_DE → if DE == 0x0054, jump to 0x08565B (A=9)
    HL = 0x00FE06 → cpHL_DE → if DE == 0xFE06, jump to 0x085650 (A=3)
    HL = 0x00FE08 → cpHL_DE → if DE == 0xFE08, jump to 0x085650 (A=3)
    HL = 0x00FBF5 → cpHL_DE → if DE == 0xFBF5, jump to 0x085650 (A=3)
    HL = 0x00FC9C → cpHL_DE → if DE == 0xFC9C, jump to 0x085650 (A=3)
    HL = 0x00FC9E → cpHL_DE → if DE == 0xFC9E, jump to 0x085650 (A=3)
    HL = 0x00FA16 → cpHL_DE → if DE == 0xFA16, matched → OR 1; RET (A=1, NZ)
    If none match: XOR A; RET (A=0, Z)

  Exit targets:
    0x085650: LD A, 3; JR → CALL 0x042366; RET   (class 3)
    0x085654: LD A, 7; CALL 0x042366; RET          (class 7)
    0x08565B: LD A, 9; JR → CALL 0x042366; RET    (class 9)
    0x08564B: OR 1; RET                             (class 1, NZ flag)
    0x08564E: XOR A; RET                            (class 0, Z flag)
`);

// ══════════════════════════════════════════════════════════════════════════
// SECTION 3: Subroutine disassembly — 0x04C979 (cpHL_DE)
// ══════════════════════════════════════════════════════════════════════════

printSection(`SECTION 3: Subroutine at 0x04C979 — cpHL_DE (compare HL with DE)`);

const { lines: cpLines } = disasmLinear(0x04C979, 10, true);
printDisasm(cpLines);

console.log(`
  Purpose: Compare HL with DE without destroying either.
  Method:  PUSH HL; OR A (clear carry); SBC HL, DE; POP HL; RET
  Output:  Z flag set if HL == DE, C flag set if HL < DE
  Note:    Uses SIL prefix (0x52 ED 52) — 16-bit SBC in short mode,
           so only compares lower 16 bits of HL and DE.
`);

// ══════════════════════════════════════════════════════════════════════════
// SECTION 4: Subroutine disassembly — 0x042366 (setClassResult)
// ══════════════════════════════════════════════════════════════════════════

printSection(`SECTION 4: Subroutine at 0x042366 — setClassResult`);

const { lines: setLines, callTargets: setCalls } = disasmLinear(0x042366, 30, true);
printDisasm(setLines);

console.log(`\n  CALL targets: ${[...setCalls].map(t => hex(t)).join(', ') || '(none)'}`);

// ══════════════════════════════════════════════════════════════════════════
// SECTION 5: Token value interpretation
// ══════════════════════════════════════════════════════════════════════════

printSection(`SECTION 5: Token Value Interpretation`);

console.log(`
Phase 1 token ranges (prefix-based classification):
────────────────────────────────────────────────────
  D = 0xFC, E = 0x3C..0x40:
    Returns A = (E - 0x3C) + 5 = E - 0x37
    E=0x3C → A=5, E=0x3D → A=6, E=0x3E → A=7, E=0x3F → A=8, E=0x40 → A=9
    These are FC-prefixed two-byte tokens (stat functions? matrix ops?)

  D = 0xFE, E = 0x7D..0x81:
    Returns A = E - 0x7D
    E=0x7D → A=0, E=0x7E → A=1, E=0x7F → A=2, E=0x80 → A=3, E=0x81 → A=4
    These are FE-prefixed two-byte tokens

  E = 0x42, D = 0x00..0x09:
    Returns A = D (direct use of primary byte as class index)
    Small single-byte token values with fixed secondary byte 0x42

Phase 2 exact-match table (DE as 16-bit token code):
────────────────────────────────────────────────────
  DE = 0xFBC8 → class 8 (via CALL 0x042366), then if NZ also class 7
  DE = 0xFBC7 → class 7 (via CALL 0x042366)
  DE = 0x00C9 → class 9 (via CALL 0x042366)
  DE = 0x0054 → class 9 (via CALL 0x042366)
  DE = 0xFE06 → class 3 (via CALL 0x042366)
  DE = 0xFE08 → class 3 (via CALL 0x042366)
  DE = 0xFBF5 → class 3 (via CALL 0x042366)
  DE = 0xFC9C → class 3 (via CALL 0x042366)
  DE = 0xFC9E → class 3 (via CALL 0x042366)
  DE = 0xFA16 → class 1 (OR 1; RET — does NOT call 0x042366)
  No match   → class 0 (XOR A; RET — A=0, Z flag set)

Classification output values:
────────────────────────────────────────────────────
  A = 0  → unclassified / default
  A = 1  → token FA 16 match
  A = 2  → FE 7F
  A = 3  → FE 80, FE 06, FE 08, FBF5, FC9C, FC9E
  A = 4  → FE 81
  A = 5  → FC 3C
  A = 6  → FC 3D
  A = 7  → FC 3E, FBC7, FBC8 (secondary)
  A = 8  → FC 3F, FBC8 (primary)
  A = 9  → FC 40, 00C9, 0054
`);

// ══════════════════════════════════════════════════════════════════════════
// SECTION 6: Caller context disassembly
// ══════════════════════════════════════════════════════════════════════════

printSection(`SECTION 6: Caller Context`);

const callerAddrs = [0x0223FD, 0x085562, 0x087654];

for (const caller of callerAddrs) {
  const contextStart = caller - 12;
  printSubSection(`Caller at ${hex(caller)} (context from ${hex(contextStart)})`);

  const { lines: ctxLines } = disasmLinear(contextStart, 20, false);
  // Show just enough context around the CALL
  const relevant = ctxLines.filter(l => l.addr >= contextStart && l.addr < caller + 20);
  printDisasm(relevant);
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 7: Relationship to CoorMon system
// ══════════════════════════════════════════════════════════════════════════

printSection(`SECTION 7: Relationship to CoorMon System`);

console.log(`
CoorMon (session 301) 28-entry CP cascade:
  - Located in a different code region
  - Uses D0058E as secondary token byte
  - Classifies tokens via sequential CP comparisons on A register

0x0855B1 Token Classifier:
  - Located at 0x0855B1 (0x08xxxx region)
  - Uses D and E registers as input (D = primary, E = secondary)
  - Phase 1: CP cascade on D register (prefix check: 0xFC, 0xFE, then E == 0x42)
  - Phase 2: Exact-match table comparing full DE against known 16-bit token codes
  - Calls 0x04C979 (cpHL_DE) for exact 16-bit comparisons
  - Calls 0x042366 (setClassResult) to store the classification

Key differences from CoorMon cascade:
  1. DIFFERENT mechanism: CoorMon uses sequential CP on A; this uses prefix dispatch
     + exact 16-bit DE matching via cpHL_DE subroutine
  2. DIFFERENT input source: CoorMon reads D0058E directly; this takes D,E as register args
  3. DIFFERENT output: CoorMon routes to handlers; this returns a numeric class (0-9)
  4. This function does NOT reference D0058E or D0058C directly — it operates
     on register values passed by the caller (0x022390 loads D,E from those addresses)
  5. This is a DIFFERENT classification pathway — it's a helper called BY the token
     descriptor builder, not part of CoorMon's own dispatch

Conclusion: 0x0855B1 is a SEPARATE classification system from the CoorMon 28-entry
CP cascade. It classifies tokens into 10 classes (0-9) based on the two-byte token
code. The caller (0x022390) uses this classification to decide how to build the
token descriptor that CoorMon will later read. It's an UPSTREAM classifier — it
runs before CoorMon sees the token.

Does it reference D0058E? NO — not directly. The caller loads D,E from memory
(likely from D0058C/D0058E) before calling this function. This function is
register-based, not memory-based.

Does it use IY+offset modifier checks? NO — no IY-indexed instructions appear
in this function. It's a pure register-based classifier.
`);

// ══════════════════════════════════════════════════════════════════════════
// SECTION 8: Raw bytes dump
// ══════════════════════════════════════════════════════════════════════════

printSection(`SECTION 8: Raw ROM bytes (0x0855B1 — 0x08565F)`);

const dumpStart = 0x0855B1;
const dumpEnd = 0x08565F;
for (let addr = dumpStart; addr < dumpEnd; addr += 16) {
  const len = Math.min(16, dumpEnd - addr);
  const bytes = Array.from(rom.subarray(addr, addr + len))
    .map(b => b.toString(16).toUpperCase().padStart(2, '0'))
    .join(' ');
  const ascii = Array.from(rom.subarray(addr, addr + len))
    .map(b => (b >= 0x20 && b < 0x7f) ? String.fromCharCode(b) : '.')
    .join('');
  console.log(`  ${hex(addr)}  ${bytes.padEnd(48)}  ${ascii}`);
}

console.log(`\n  Total bytes: ${dumpEnd - dumpStart}`);
console.log(`  Phase 1 (prefix dispatch): ${0x0855DA - 0x0855B1} bytes (0x0855B1–0x0855D9)`);
console.log(`  Phase 2 (exact-match table): ${0x08565F - 0x0855DA} bytes (0x0855DA–0x08565E)`);
