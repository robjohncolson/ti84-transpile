#!/usr/bin/env node

/**
 * Phase 307 Probe: Token Descriptor Builder at 0x022346
 *
 * In the OS event loop, after looking up the scan-code-to-token table at
 * 0x09F79B, the code at 0x02FF16 calls CALL 0x022346. This function takes
 * the token byte (pointed to by HL) and builds a "token descriptor" that
 * CoorMon later reads from D0058C / D0058E.
 *
 * This probe disassembles 0x022346 linearly, follows all CALL targets,
 * and documents the token descriptor format.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

// ── Known addresses ───────────────────────────────────────────────────

const TOKEN_DESC_BUILDER = 0x022346;
const TOKEN_BUFFER_WRITER = 0x0236F9;
const SCAN_TABLE_BASE = 0x09F79B;

const KNOWN_ADDRS = {
  0x022346: 'tokenDescriptorBuilder (this function)',
  0x0236F9: 'tokenBufferWriter',
  0x02FF16: 'event loop call site',
  0x09F79B: 'scan-code-to-token table',
  0xD0058C: 'token primary byte (key_token)',
  0xD0058E: 'token secondary byte (key_token_ext)',
  0xD00587: 'raw scan code',
  0xD00080: 'IY base (OS flags)',
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
      if (inst.tag === 'add-ix' || inst.tag === 'add-iy')
        return `ADD ${inst.tag === 'add-ix' ? 'IX' : 'IY'}, ${(inst.src || '??').toUpperCase()}`;
      if (inst.tag === 'ld-ix-imm' || inst.tag === 'ld-iy-imm')
        return `LD ${inst.tag.includes('ix') ? 'IX' : 'IY'}, ${hex(inst.value || 0)}`;
      if (inst.tag === 'ld-ix-mem' || inst.tag === 'ld-iy-mem')
        return `LD ${inst.tag.includes('ix') ? 'IX' : 'IY'}, (${hex(inst.addr || 0)})`;
      if (inst.tag === 'ld-mem-ix' || inst.tag === 'ld-mem-iy')
        return `LD (${hex(inst.addr || 0)}), ${inst.tag.includes('ix') ? 'IX' : 'IY'}`;
      if (inst.tag === 'push-ix' || inst.tag === 'push-iy')
        return `PUSH ${inst.tag.includes('ix') ? 'IX' : 'IY'}`;
      if (inst.tag === 'pop-ix' || inst.tag === 'pop-iy')
        return `POP ${inst.tag.includes('ix') ? 'IX' : 'IY'}`;
      if (inst.tag === 'inc-indexed')
        return `INC (${(inst.indexReg || 'IY').toUpperCase()}+${inst.displacement || 0})`;
      if (inst.tag === 'dec-indexed')
        return `DEC (${(inst.indexReg || 'IY').toUpperCase()}+${inst.displacement || 0})`;
      if (inst.tag === 'jp-ix' || inst.tag === 'jp-iy')
        return `JP (${inst.tag.includes('ix') ? 'IX' : 'IY'})`;
      if (inst.tag === 'ld-ixd-reg' || inst.tag === 'ld-iyd-reg')
        return `LD (${(inst.indexRegister || 'IX').toUpperCase()}+${inst.displacement || 0}), ${(inst.src || '?').toUpperCase()}`;
      if (inst.tag === 'ld-reg-ixd' || inst.tag === 'ld-reg-iyd')
        return `LD ${(inst.dest || '?').toUpperCase()}, (${(inst.indexRegister || 'IX').toUpperCase()}+${inst.displacement || 0})`;
      if (inst.tag === 'lea')
        return `LEA ${(inst.dest || '??').toUpperCase()}, ${(inst.base || '??').toUpperCase()}+${inst.displacement || 0}`;
      if (inst.tag === 'ld-sp-pair')
        return `LD SP, ${(inst.pair || '??').toUpperCase()}`;
      if (inst.tag === 'ld-pair-indexed')
        return `LD ${(inst.pair || '??').toUpperCase()}, (${(inst.indexRegister || 'IX').toUpperCase()}+${inst.displacement || 0})`;
      if (inst.tag === 'ld-indexed-pair')
        return `LD (${(inst.indexRegister || 'IX').toUpperCase()}+${inst.displacement || 0}), ${(inst.pair || '??').toUpperCase()}`;
      if (inst.tag === 'ld-pair-ind')
        return `LD ${(inst.pair || '??').toUpperCase()}, (${(inst.src || 'HL').toUpperCase()})`;
      if (inst.tag === 'in-reg')
        return `IN ${(inst.reg || 'A').toUpperCase()}, (C)`;
      if (inst.tag === 'ldir') return 'LDIR';
      if (inst.tag === 'lddr') return 'LDDR';
      if (inst.tag === 'ldi') return 'LDI';
      if (inst.tag === 'ldd') return 'LDD';
      if (inst.tag === 'cpir') return 'CPIR';
      if (inst.tag === 'cpdr') return 'CPDR';
      if (inst.tag === 'cpi') return 'CPI';
      if (inst.tag === 'cpd') return 'CPD';
      if (inst.tag === 'otir') return 'OTIR';
      if (inst.tag === 'inir') return 'INIR';
      if (inst.tag === 'reti') return 'RETI';
      if (inst.tag === 'retn') return 'RETN';
      if (inst.tag === 'in-reg-c') return `IN ${(inst.dest || '?').toUpperCase()}, (C)`;
      if (inst.tag === 'out-c-reg') return `OUT (C), ${(inst.src || '?').toUpperCase()}`;
      if (inst.tag === 'sbc-pair') return `SBC HL, ${(inst.src || '??').toUpperCase()}`;
      if (inst.tag === 'adc-pair') return `ADC HL, ${(inst.src || '??').toUpperCase()}`;
      if (inst.tag === 'neg') return 'NEG';
      if (inst.tag === 'rrd') return 'RRD';
      if (inst.tag === 'rld') return 'RLD';
      if (inst.tag === 'im') return `IM ${inst.mode ?? '?'}`;
      if (inst.tag === 'ld-i-a') return 'LD I, A';
      if (inst.tag === 'ld-a-i') return 'LD A, I';
      if (inst.tag === 'ld-r-a') return 'LD R, A';
      if (inst.tag === 'ld-a-r') return 'LD A, R';
      if (inst.tag === 'ld-mb-a') return 'LD MB, A';
      if (inst.tag === 'ld-a-mb') return 'LD A, MB';
      if (inst.tag === 'stmix') return 'STMIX';
      if (inst.tag === 'rsmix') return 'RSMIX';
      if (inst.tag === 'tst-a-imm') return `TST A, ${hex(inst.value || 0, 2)}`;
      if (inst.tag === 'mlt') return `MLT ${(inst.pair || inst.reg || '??').toUpperCase()}`;
      if (inst.tag === 'bit-test') return `BIT ${inst.bit}, ${(inst.reg || '?').toUpperCase()}`;
      if (inst.tag === 'bit-set') return `SET ${inst.bit}, ${(inst.reg || '?').toUpperCase()}`;
      if (inst.tag === 'bit-reset') return `RES ${inst.bit}, ${(inst.reg || '?').toUpperCase()}`;
      if (inst.tag === 'bit-test-ind') return `BIT ${inst.bit}, (HL)`;
      if (inst.tag === 'bit-set-ind') return `SET ${inst.bit}, (HL)`;
      if (inst.tag === 'bit-reset-ind') return `RES ${inst.bit}, (HL)`;
      if (inst.tag === 'rotate-reg') return `${(inst.op || '?').toUpperCase()} ${(inst.reg || '?').toUpperCase()}`;
      if (inst.tag === 'rotate-ind') return `${(inst.op || '?').toUpperCase()} (HL)`;
      if (inst.tag === 'ex-sp-ix' || inst.tag === 'ex-sp-iy')
        return `EX (SP), ${inst.tag.includes('ix') ? 'IX' : 'IY'}`;
      if (inst.tag === 'ld-sp-ix' || inst.tag === 'ld-sp-iy')
        return `LD SP, ${inst.tag.includes('ix') ? 'IX' : 'IY'}`;
      if (inst.tag === 'inc-ix' || inst.tag === 'inc-iy')
        return `INC ${inst.tag.includes('ix') ? 'IX' : 'IY'}`;
      if (inst.tag === 'dec-ix' || inst.tag === 'dec-iy')
        return `DEC ${inst.tag.includes('ix') ? 'IX' : 'IY'}`;
      return `[${inst.tag}] ${JSON.stringify(inst)}`;
  }
}

// Annotate instruction with context about what it likely does
function annotateInst(inst, addr) {
  const notes = [];

  // Check for known memory addresses in the instruction
  const checkAddr = (a) => {
    if (a === 0xD0058C) notes.push('key_token (primary token byte)');
    if (a === 0xD0058D) notes.push('key_token+1');
    if (a === 0xD0058E) notes.push('key_token_ext (secondary/2-byte token)');
    if (a === 0xD0058F) notes.push('key_token_ext+1');
    if (a === 0xD00587) notes.push('raw_scan_code');
    if (a === 0xD00588) notes.push('key_flags?');
    if (a === 0xD00589) notes.push('key state byte');
    if (a === 0xD0058A) notes.push('key state byte');
    if (a === 0xD0058B) notes.push('key state byte');
    if (a === 0xD00080) notes.push('IY base (OS flags area)');
    if (a >= 0x09F79B && a < 0x09F79B + 112) notes.push('scan-code-to-token table');
    if (a === 0x0236F9) notes.push('tokenBufferWriter');
    if (a === 0x022346) notes.push('tokenDescriptorBuilder (recursive?)');
  };

  if (inst.addr !== undefined) checkAddr(inst.addr);
  if (inst.target !== undefined) checkAddr(inst.target);
  if (inst.value !== undefined && inst.value > 0xD00000) checkAddr(inst.value);

  // Check for IY-relative accesses (IY = 0xD00080)
  if (inst.tag && inst.tag.includes('indexed') && (inst.indexReg === 'iy' || !inst.indexReg)) {
    const offset = inst.displacement || 0;
    const effectiveAddr = 0xD00080 + offset;
    if (effectiveAddr === 0xD0008C) notes.push('(IY+0x0C) = appFlags?');
    if (effectiveAddr >= 0xD00080 && effectiveAddr < 0xD000C0) {
      notes.push(`effective addr: ${hex(effectiveAddr)}`);
    }
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

    // Collect CALL targets
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
// SECTION 1: Main function at 0x022346
// ══════════════════════════════════════════════════════════════════════════

printSection(`SECTION 1: Token Descriptor Builder — 0x022346 (linear disassembly)`);

console.log(`
Context:
  Called from event loop at 0x02FF16 after scan-code-to-token table lookup.
  Entry state:
    HL = pointer into scan-code-to-token table (table base 0x09F79B + scan code)
    Stack has pushed DE (D=0x00, E=scan code)
  Purpose: Read the token byte from (HL), build a "token descriptor",
           store it for CoorMon to read from D0058C / D0058E.
`);

const { lines: mainLines, callTargets: mainCalls } = disasmLinear(TOKEN_DESC_BUILDER, 120, false);
printDisasm(mainLines);

console.log(`\n  Total instructions disassembled: ${mainLines.length}`);
console.log(`  CALL targets found: ${[...mainCalls].map(t => hex(t)).join(', ') || '(none)'}`);

// ══════════════════════════════════════════════════════════════════════════
// SECTION 2: Disassemble each CALL target
// ══════════════════════════════════════════════════════════════════════════

printSection(`SECTION 2: CALL target subroutines`);

const allSubCalls = new Set();

for (const target of [...mainCalls].sort((a, b) => a - b)) {
  if (target >= rom.length || target < 0) {
    console.log(`\n  ${hex(target)}: out of ROM range, skipping`);
    continue;
  }

  const knownName = KNOWN_ADDRS[target] || '';
  printSubSection(`Subroutine at ${hex(target)} ${knownName ? `(${knownName})` : ''}`);

  const { lines: subLines, callTargets: subCalls } = disasmLinear(target, 40, true);
  printDisasm(subLines);

  console.log(`\n  Instructions: ${subLines.length}`);
  if (subCalls.size > 0) {
    console.log(`  Sub-calls: ${[...subCalls].map(t => hex(t)).join(', ')}`);
    for (const sc of subCalls) allSubCalls.add(sc);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 3: Second-level CALL targets (sub-calls of sub-calls)
// ══════════════════════════════════════════════════════════════════════════

// Only disassemble sub-calls that are NOT already covered
const secondLevel = [...allSubCalls].filter(t => !mainCalls.has(t) && t < rom.length && t >= 0);

if (secondLevel.length > 0) {
  printSection(`SECTION 3: Second-level subroutines`);

  for (const target of secondLevel.sort((a, b) => a - b)) {
    const knownName = KNOWN_ADDRS[target] || '';
    printSubSection(`Subroutine at ${hex(target)} ${knownName ? `(${knownName})` : ''}`);

    const { lines: subLines } = disasmLinear(target, 25, true);
    printDisasm(subLines);
    console.log(`\n  Instructions: ${subLines.length}`);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 4: Cross-reference with token buffer writer (0x0236F9)
// ══════════════════════════════════════════════════════════════════════════

printSection(`SECTION 4: Token buffer writer at ${hex(TOKEN_BUFFER_WRITER)} (for cross-reference)`);

console.log(`
  The token buffer writer at 0x0236F9 is the function that ultimately commits
  the token into the OS token buffer. Disassembling it here to show the
  relationship with the token descriptor builder.
`);

const { lines: writerLines, callTargets: writerCalls } = disasmLinear(TOKEN_BUFFER_WRITER, 40, true);
printDisasm(writerLines);

console.log(`\n  Instructions: ${writerLines.length}`);
if (writerCalls.size > 0) {
  console.log(`  CALL targets: ${[...writerCalls].map(t => hex(t)).join(', ')}`);
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 5: Memory map around D0058C-D0058F (token descriptor area)
// ══════════════════════════════════════════════════════════════════════════

printSection(`SECTION 5: Token Descriptor Memory Map`);

console.log(`
  Address    Name                  Purpose
  ─────────  ────────────────────  ─────────────────────────────────────────
  D00587     raw_scan_code         Raw keyboard matrix scan code (from ISR)
  D00588     key_flags_1?          Key state / modifier flags
  D00589     key_flags_2?          Key state / modifier flags
  D0058A     key_flags_3?          Key state / modifier flags
  D0058B     key_flags_4?          Key state / modifier flags
  D0058C     key_token             Primary token byte (read by CoorMon)
  D0058D     key_token_high?       High byte of token (if 16-bit)
  D0058E     key_token_ext         Secondary/extended token byte (for 2-byte tokens)
  D0058F     key_token_ext_high?   High byte of extended token

  Token descriptor format (based on CoorMon's reader at 0x08C44D):
    - Single-byte tokens: D0058C = token, D0058E = 0x00
    - Two-byte tokens (0xFA, 0xFB, 0xFC, 0xFE prefix):
        D0058C = prefix byte (0xFA/0xFB/0xFC/0xFE)
        D0058E = second byte of the token
`);

// ══════════════════════════════════════════════════════════════════════════
// SECTION 6: Scan for references to D0058C / D0058E in the main function
// ══════════════════════════════════════════════════════════════════════════

printSection(`SECTION 6: Memory access analysis in token descriptor builder`);

const memReads = [];
const memWrites = [];
const iyAccesses = [];

for (const line of mainLines) {
  const inst = line.inst;
  if (!inst) continue;

  // Direct memory reads
  if (inst.tag === 'ld-reg-mem' || inst.tag === 'ld-pair-mem' || inst.tag === 'ld-a-mem') {
    memReads.push({ addr: line.addr, target: inst.addr, text: line.text });
  }

  // Direct memory writes
  if (inst.tag === 'ld-mem-reg' || inst.tag === 'ld-mem-pair' || inst.tag === 'ld-mem-a') {
    memWrites.push({ addr: line.addr, target: inst.addr, text: line.text });
  }

  // IY-indexed accesses
  if (inst.tag && inst.tag.includes('indexed') && (inst.indexReg === 'iy' || !inst.indexReg)) {
    const offset = inst.displacement || 0;
    iyAccesses.push({ addr: line.addr, offset, effective: 0xD00080 + offset, text: line.text, tag: inst.tag });
  }

  // LD (HL), reg — indirect writes through HL
  if (inst.tag === 'ld-ind-reg' && (inst.dest === 'hl' || inst.dest === 'de' || inst.dest === 'bc')) {
    memWrites.push({ addr: line.addr, target: `(${inst.dest.toUpperCase()})`, text: line.text });
  }
}

if (memReads.length > 0) {
  console.log('\n  Direct memory READS:');
  for (const r of memReads) {
    const name = typeof r.target === 'number' ? (KNOWN_ADDRS[r.target] || '') : '';
    console.log(`    ${hex(r.addr)}  ${r.text.padEnd(38)}  ${typeof r.target === 'number' ? hex(r.target) : r.target} ${name}`);
  }
}

if (memWrites.length > 0) {
  console.log('\n  Direct memory WRITES:');
  for (const w of memWrites) {
    const name = typeof w.target === 'number' ? (KNOWN_ADDRS[w.target] || '') : '';
    console.log(`    ${hex(w.addr)}  ${w.text.padEnd(38)}  ${typeof w.target === 'number' ? hex(w.target) : w.target} ${name}`);
  }
}

if (iyAccesses.length > 0) {
  console.log('\n  IY-indexed accesses (IY = 0xD00080):');
  for (const a of iyAccesses) {
    console.log(`    ${hex(a.addr)}  ${a.text.padEnd(38)}  IY+${hex(a.offset, 2)} = ${hex(a.effective)} [${a.tag}]`);
  }
}

// ══════════════════════════════════════════════════════════════════════════
// SECTION 7: Summary
// ══════════════════════════════════════════════════════════════════════════

printSection(`SECTION 7: Summary`);

console.log(`
  Token Descriptor Builder at 0x022346:
  ─────────────────────────────────────
  Called from: 0x02FF16 (event loop, after scan-code-to-token table lookup)
  Entry:       HL = pointer to token byte in table at 0x09F79B
               Stack has pushed DE (D=0x00, E=scan code)

  The function reads the token byte from (HL), then builds a "token descriptor"
  that CoorMon reads from D0058C (primary token) and D0058E (extended token).

  Relationship to 0x0236F9 (token buffer writer):
    The token descriptor builder (0x022346) prepares the token descriptor in
    the D0058x memory region. The token buffer writer (0x0236F9) is a separate
    function that writes tokens into the edit-line token buffer for display.
    Both are part of the key-to-token pipeline but serve different purposes:
      - 0x022346: "what key was pressed" → stored for CoorMon to dispatch
      - 0x0236F9: "insert this token into the edit buffer" → for display/editing

  CALL targets in 0x022346:
    ${[...mainCalls].map(t => `${hex(t)} ${KNOWN_ADDRS[t] || ''}`).join('\n    ') || '(none found)'}
`);

console.log('\nDone.');
