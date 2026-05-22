#!/usr/bin/env node

/**
 * Phase 404 — Action Code CODEC Lookup Tables
 *
 * Decodes the bidirectional action code CODEC discovered in session 403:
 *   0x07FE2F  external→internal encoder (CPIR-based table lookup)
 *   0x07FE65  internal→external decoder (CPIR-based table lookup)
 *
 * Both functions use CPIR to scan a byte table, then index a parallel
 * output table using the remaining BC count after the match.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.emitWarning = () => {};
const { decodeInstruction } = await import('./ez80-decoder.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const rom = fs.readFileSync(ROM_PATH);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hex(value, width = 6) {
  if (value === undefined || value === null || Number.isNaN(Number(value))) return 'n/a';
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function hexByte(value) {
  return hex((Number(value) || 0) & 0xFF, 2);
}

function bytesToHex(start, length) {
  return Array.from(rom.subarray(start, start + length), v => hexByte(v)).join(' ');
}

function safeDecode(pc) {
  try {
    const inst = decodeInstruction(rom, pc, 'adl');
    if (!inst || !Number.isInteger(inst.length) || inst.length <= 0) {
      throw new Error('decoder returned invalid length');
    }
    return inst;
  } catch (error) {
    return {
      pc,
      length: 1,
      nextPc: pc + 1,
      tag: 'db',
      value: rom[pc] ?? 0,
      decodeError: error?.message ?? String(error),
    };
  }
}

function formatInstruction(inst) {
  if (!inst) return '<null>';
  const tag = inst.tag ?? 'unknown';
  if (tag === 'db') return `db ${hexByte(inst.value)}`;
  switch (tag) {
    case 'nop': case 'halt': case 'di': case 'ei': case 'ret':
    case 'reti': case 'retn': case 'cpir': case 'cpdr':
    case 'ldi': case 'ldir': case 'cpi': case 'cpd':
    case 'exx': case 'neg': case 'daa': case 'cpl': case 'scf': case 'ccf':
      return tag;
    case 'ret-conditional': return `ret ${inst.condition}`;
    case 'jr': return `jr ${hex(inst.target)}`;
    case 'jr-conditional': return `jr ${inst.condition}, ${hex(inst.target)}`;
    case 'jp': return `jp ${hex(inst.target)}`;
    case 'jp-conditional': return `jp ${inst.condition}, ${hex(inst.target)}`;
    case 'jp-indirect': return `jp (${inst.indirectRegister})`;
    case 'call': return `call ${hex(inst.target)}`;
    case 'call-conditional': return `call ${inst.condition}, ${hex(inst.target)}`;
    case 'push': return `push ${inst.pair}`;
    case 'pop': return `pop ${inst.pair}`;
    case 'ld-pair-imm': return `ld ${inst.pair}, ${hex(inst.value)}`;
    case 'ld-reg-imm': return `ld ${inst.dest}, ${hexByte(inst.value)}`;
    case 'ld-reg-reg': return `ld ${inst.dest}, ${inst.src}`;
    case 'ld-reg-ind': return `ld ${inst.dest}, (${inst.src})`;
    case 'ld-ind-reg': return `ld (${inst.dest}), ${inst.src}`;
    case 'ld-reg-mem': return `ld ${inst.dest}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `ld (${hex(inst.addr)}), ${inst.src}`;
    case 'ld-pair-mem': return inst.direction === 'to-mem'
      ? `ld (${hex(inst.addr)}), ${inst.pair}` : `ld ${inst.pair}, (${hex(inst.addr)})`;
    case 'ld-sp-hl': return 'ld sp, hl';
    case 'inc-pair': return `inc ${inst.pair}`;
    case 'dec-pair': return `dec ${inst.pair}`;
    case 'inc-reg': return `inc ${inst.reg}`;
    case 'dec-reg': return `dec ${inst.reg}`;
    case 'add-pair': return `add ${inst.dest}, ${inst.src}`;
    case 'adc-pair': return `adc hl, ${inst.src}`;
    case 'sbc-pair': return `sbc hl, ${inst.src}`;
    case 'alu-reg': return `${inst.op} ${inst.src}`;
    case 'alu-imm': return `${inst.op} ${hexByte(inst.value)}`;
    case 'alu-ind': return `${inst.op} (hl)`;
    case 'bit-reg': return `${inst.op} ${inst.bit}, ${inst.reg}`;
    case 'bit-ind': return `${inst.op} ${inst.bit}, (hl)`;
    case 'ex': return `ex ${inst.left}, ${inst.right}`;
    case 'djnz': return `djnz ${hex(inst.target)}`;
    case 'rst': return `rst ${hexByte(inst.target)}`;
    default: return `${tag} (raw: ${bytesToHex(inst.pc, inst.length)})`;
  }
}

function disassemble(startAddr, endAddr) {
  const lines = [];
  let pc = startAddr;
  while (pc < endAddr) {
    const inst = safeDecode(pc);
    const bytes = bytesToHex(pc, inst.length);
    lines.push({ addr: pc, bytes, text: formatInstruction(inst), inst });
    pc = inst.nextPc ?? (pc + inst.length);
  }
  return lines;
}

// ---------------------------------------------------------------------------
// CODEC addresses (from session 403 + hex analysis)
// ---------------------------------------------------------------------------

const ENCODER_ENTRY    = 0x07FE2F;  // external → internal
const ENCODER_END      = 0x07FE50;
const DECODER_ENTRY    = 0x07FE65;  // internal → external
const DECODER_END      = 0x07FE8A;

// Encoder tables
const ENC_INPUT_TABLE  = 0x07FE8A;  // external codes (scanned by CPIR)
const ENC_INPUT_LEN    = 6;
const ENC_OUTPUT_TABLE = 0x07FE90;  // internal codes (indexed by BC remainder)

// Decoder tables
const DEC_INPUT_TABLE  = 0x07FE91;  // internal codes (scanned by CPIR)
const DEC_INPUT_LEN    = 5;
const DEC_OUTPUT_TABLE = 0x07FE8A;  // external codes (indexed by BC remainder)

// ---------------------------------------------------------------------------
// Section 1: Disassemble Encoder (0x07FE2F)
// ---------------------------------------------------------------------------

console.log('='.repeat(72));
console.log('Phase 404 — Action Code CODEC Lookup Tables');
console.log('='.repeat(72));

console.log('\n--- 1. ENCODER: external → internal (0x07FE2F) ---\n');
console.log('Disassembly:');
for (const line of disassemble(ENCODER_ENTRY, ENCODER_END)) {
  console.log(`  ${hex(line.addr)}:  ${line.bytes.padEnd(20)} ${line.text}`);
}

console.log(`\nInput table (external codes) at ${hex(ENC_INPUT_TABLE)}, length ${ENC_INPUT_LEN}:`);
console.log(`  ${bytesToHex(ENC_INPUT_TABLE, ENC_INPUT_LEN)}`);

console.log(`\nOutput table (internal codes) at ${hex(ENC_OUTPUT_TABLE)}, length ${ENC_INPUT_LEN}:`);
console.log(`  ${bytesToHex(ENC_OUTPUT_TABLE, ENC_INPUT_LEN)}`);

console.log('\nAlgorithm:');
console.log('  1. Mask input: A = A & 0x3F (strip high 2 bits)');
console.log('  2. CPIR scans external table for A; BC starts at 6');
console.log('  3. On match: BC = entries remaining. Output = (0x07FE90 + BC)');
console.log('     No match: default to B = 0x0C');
console.log('  4. Restore original high bits: A = (original & 0xC0) | B');

console.log('\nEncoder mapping (CPIR remainder trick):');
for (let i = 0; i < ENC_INPUT_LEN; i++) {
  const ext = rom[ENC_INPUT_TABLE + i];
  const bcRem = ENC_INPUT_LEN - (i + 1);
  const intCode = rom[ENC_OUTPUT_TABLE + bcRem];
  console.log(`  external ${hexByte(ext)} → internal ${hexByte(intCode)}  (index ${i}, BC_rem=${bcRem})`);
}
console.log(`  (no match)   → internal 0x0C  (default)`);

// ---------------------------------------------------------------------------
// Section 2: Disassemble Decoder (0x07FE65)
// ---------------------------------------------------------------------------

console.log('\n--- 2. DECODER: internal → external (0x07FE65) ---\n');
console.log('Disassembly:');
for (const line of disassemble(DECODER_ENTRY, DECODER_END)) {
  console.log(`  ${hex(line.addr)}:  ${line.bytes.padEnd(20)} ${line.text}`);
}

console.log(`\nInput table (internal codes) at ${hex(DEC_INPUT_TABLE)}, length ${DEC_INPUT_LEN}:`);
console.log(`  ${bytesToHex(DEC_INPUT_TABLE, DEC_INPUT_LEN)}`);

console.log(`\nOutput table (external codes) at ${hex(DEC_OUTPUT_TABLE)}, length ${DEC_INPUT_LEN}:`);
console.log(`  ${bytesToHex(DEC_OUTPUT_TABLE, DEC_INPUT_LEN)}`);

console.log('\nAlgorithm:');
console.log('  1. Save A in D. Mask: A = A & 0x3F');
console.log('  2. CPIR scans internal table for A; BC starts at 5');
console.log('  3. On match: BC = entries remaining. Output = (0x07FE8A + BC)');
console.log('     No match: return original A unchanged');
console.log('  4. Restore original high bits: A = (D & 0xC0) | B');

console.log('\nDecoder mapping (CPIR remainder trick):');
for (let i = 0; i < DEC_INPUT_LEN; i++) {
  const intCode = rom[DEC_INPUT_TABLE + i];
  const bcRem = DEC_INPUT_LEN - (i + 1);
  const extCode = rom[DEC_OUTPUT_TABLE + bcRem];
  console.log(`  internal ${hexByte(intCode)} → external ${hexByte(extCode)}  (index ${i}, BC_rem=${bcRem})`);
}
console.log(`  (no match)   → pass-through (return original A)`);

// ---------------------------------------------------------------------------
// Section 3: Roundtrip verification
// ---------------------------------------------------------------------------

console.log('\n--- 3. ROUNDTRIP VERIFICATION ---\n');

// Build forward map (encoder: ext → int)
const encodeMap = new Map();
for (let i = 0; i < ENC_INPUT_LEN; i++) {
  const ext = rom[ENC_INPUT_TABLE + i];
  const bcRem = ENC_INPUT_LEN - (i + 1);
  const intCode = rom[ENC_OUTPUT_TABLE + bcRem];
  encodeMap.set(ext, intCode);
}

// Build reverse map (decoder: int → ext)
const decodeMap = new Map();
for (let i = 0; i < DEC_INPUT_LEN; i++) {
  const intCode = rom[DEC_INPUT_TABLE + i];
  const bcRem = DEC_INPUT_LEN - (i + 1);
  const extCode = rom[DEC_OUTPUT_TABLE + bcRem];
  decodeMap.set(intCode, extCode);
}

let roundtripOk = true;
for (const [ext, intCode] of encodeMap) {
  const backToExt = decodeMap.get(intCode);
  const status = backToExt === ext ? 'OK' : (backToExt !== undefined ? `MISMATCH (got ${hexByte(backToExt)})` : 'NO REVERSE');
  if (status !== 'OK') roundtripOk = false;
  console.log(`  encode(${hexByte(ext)}) = ${hexByte(intCode)}, decode(${hexByte(intCode)}) = ${backToExt !== undefined ? hexByte(backToExt) : 'N/A'}  ${status}`);
}

// Asymmetry notes
console.log('\nAsymmetry analysis:');
console.log('  Encoder has 6 entries, decoder has 5 entries.');
console.log('  External 0x19 and 0x18 both encode to internal 0x1B (many-to-one).');
console.log('  Decoder maps internal 0x1B → external 0x18 (first match wins).');
console.log('  External 0x19 has no roundtrip: encode(0x19)=0x1B, decode(0x1B)=0x18.');
console.log(`  Roundtrip clean: ${roundtripOk ? 'NO (expected — 0x19 is lossy)' : 'NO (expected — 0x19 is lossy)'}`);

// ---------------------------------------------------------------------------
// Section 4: Cross-reference callers
// ---------------------------------------------------------------------------

console.log('\n--- 4. CROSS-REFERENCE: Callers ---\n');

function findCallers(targetAddr) {
  const lo = targetAddr & 0xFF;
  const mi = (targetAddr >> 8) & 0xFF;
  const hi = (targetAddr >> 16) & 0xFF;
  const results = [];

  // Unconditional CALL (CD)
  for (let i = 0; i < rom.length - 3; i++) {
    if (rom[i] === 0xCD && rom[i + 1] === lo && rom[i + 2] === mi && rom[i + 3] === hi) {
      results.push({ addr: i, type: 'CALL' });
    }
  }

  // Conditional CALLs
  for (const op of [0xC4, 0xCC, 0xD4, 0xDC, 0xE4, 0xEC, 0xF4, 0xFC]) {
    for (let i = 0; i < rom.length - 3; i++) {
      if (rom[i] === op && rom[i + 1] === lo && rom[i + 2] === mi && rom[i + 3] === hi) {
        const conds = { 0xC4: 'NZ', 0xCC: 'Z', 0xD4: 'NC', 0xDC: 'C', 0xE4: 'PO', 0xEC: 'PE', 0xF4: 'P', 0xFC: 'M' };
        results.push({ addr: i, type: `CALL ${conds[op]}` });
      }
    }
  }

  // JP variants
  for (const op of [0xC3, 0xC2, 0xCA, 0xD2, 0xDA, 0xE2, 0xEA, 0xF2, 0xFA]) {
    for (let i = 0; i < rom.length - 3; i++) {
      if (rom[i] === op && rom[i + 1] === lo && rom[i + 2] === mi && rom[i + 3] === hi) {
        const conds = { 0xC3: '', 0xC2: ' NZ', 0xCA: ' Z', 0xD2: ' NC', 0xDA: ' C', 0xE2: ' PO', 0xEA: ' PE', 0xF2: ' P', 0xFA: ' M' };
        results.push({ addr: i, type: `JP${conds[op]}` });
      }
    }
  }

  return results;
}

function analyzeCallerContext(callerAddr) {
  // Look backward up to 30 bytes for LD A,imm (3E nn) or other A-loading patterns
  const findings = [];

  for (let j = callerAddr - 1; j >= Math.max(0, callerAddr - 30); j--) {
    // LD A, imm8 = 3E nn
    if (rom[j] === 0x3E) {
      findings.push(`LD A, ${hexByte(rom[j + 1])} at ${hex(j)}`);
      break;
    }
    // LD A, (HL) = 7E
    if (rom[j] === 0x7E) {
      findings.push(`LD A, (HL) at ${hex(j)}`);
      break;
    }
    // AND imm8 = E6 nn
    if (rom[j] === 0xE6) {
      findings.push(`AND ${hexByte(rom[j + 1])} at ${hex(j)}`);
      // keep looking for the A source
    }
  }

  return findings.length > 0 ? findings.join('; ') : '(no obvious A-load found nearby)';
}

const targets = [
  { addr: ENCODER_ENTRY, name: 'Encoder (ext→int)' },
  { addr: DECODER_ENTRY, name: 'Decoder (int→ext)' },
];

for (const t of targets) {
  const callers = findCallers(t.addr);
  console.log(`${t.name} at ${hex(t.addr)} — ${callers.length} caller(s):`);

  for (const c of callers) {
    const context = analyzeCallerContext(c.addr);
    console.log(`  ${c.type.padEnd(8)} at ${hex(c.addr)}  A-source: ${context}`);

    // Show a few instructions before the call
    const preStart = Math.max(0, c.addr - 12);
    const preDisasm = disassemble(preStart, c.addr + 4);
    for (const line of preDisasm) {
      const marker = line.addr === c.addr ? ' >>>' : '    ';
      console.log(`  ${marker} ${hex(line.addr)}: ${line.text}`);
    }
    console.log();
  }
}

// ---------------------------------------------------------------------------
// Section 5: Complete Action Code Dictionary
// ---------------------------------------------------------------------------

console.log('--- 5. COMPLETE ACTION CODE DICTIONARY ---\n');

console.log('External   Internal   Direction   Notes');
console.log('-'.repeat(60));

// Collect all unique pairs
const allPairs = [];

for (let i = 0; i < ENC_INPUT_LEN; i++) {
  const ext = rom[ENC_INPUT_TABLE + i];
  const bcRem = ENC_INPUT_LEN - (i + 1);
  const intCode = rom[ENC_OUTPUT_TABLE + bcRem];
  const canDecode = decodeMap.has(intCode);
  const decodesTo = canDecode ? decodeMap.get(intCode) : null;
  const roundtrips = decodesTo === ext;
  allPairs.push({ ext, intCode, roundtrips, decodesTo });
}

for (const p of allPairs) {
  const rtNote = p.roundtrips
    ? 'roundtrip OK'
    : (p.decodesTo !== null ? `lossy: decode → ${hexByte(p.decodesTo)}` : 'no decoder entry');
  console.log(`  ${hexByte(p.ext).padEnd(11)}${hexByte(p.intCode).padEnd(11)}ext→int     ${rtNote}`);
}

console.log();
console.log('Default (encoder miss): any unrecognized external code → internal 0x0C');
console.log('Default (decoder miss): unrecognized internal code → pass-through (unchanged)');

// ---------------------------------------------------------------------------
// Section 6: Data tables raw dump
// ---------------------------------------------------------------------------

console.log('\n--- 6. RAW TABLE DATA ---\n');

console.log(`Encoder input  (${hex(ENC_INPUT_TABLE)}, ${ENC_INPUT_LEN} bytes): ${bytesToHex(ENC_INPUT_TABLE, ENC_INPUT_LEN)}`);
console.log(`Encoder output (${hex(ENC_OUTPUT_TABLE)}, ${ENC_INPUT_LEN} bytes): ${bytesToHex(ENC_OUTPUT_TABLE, ENC_INPUT_LEN)}`);
console.log(`Decoder input  (${hex(DEC_INPUT_TABLE)}, ${DEC_INPUT_LEN} bytes): ${bytesToHex(DEC_INPUT_TABLE, DEC_INPUT_LEN)}`);
console.log(`Decoder output (${hex(DEC_OUTPUT_TABLE)}, ${DEC_INPUT_LEN} bytes): ${bytesToHex(DEC_OUTPUT_TABLE, DEC_INPUT_LEN)}`);

console.log('\nNote: tables overlap in ROM — encoder input and decoder output share 0x07FE8A.');
console.log('The CPIR remainder trick indexes the output tables in reverse order,');
console.log('so the physical byte layout appears reversed relative to the logical mapping.');

// ---------------------------------------------------------------------------
// Section 7: Wrapper functions around the CODEC
// ---------------------------------------------------------------------------

console.log('\n--- 7. WRAPPER FUNCTIONS ---\n');

// Disassemble the wrapper at 0x07FE25 (calls encoder, stores back)
console.log('Wrapper at 0x07FE25 (load from D005F8, encode, store back):');
for (const line of disassemble(0x07FE25, 0x07FE2F + 0x21)) {
  console.log(`  ${hex(line.addr)}: ${line.bytes.padEnd(20)} ${line.text}`);
}

console.log('\nWrapper at 0x07FE50 (calls 0x07FE5A, then decodes):');
for (const line of disassemble(0x07FE50, 0x07FE65)) {
  console.log(`  ${hex(line.addr)}: ${line.bytes.padEnd(20)} ${line.text}`);
}

// ---------------------------------------------------------------------------
// Section 8: JP table entry at 0x021ED8
// ---------------------------------------------------------------------------

console.log('\n--- 8. JP TABLE ENTRY ---\n');
console.log('JP at 0x021ED8 (in a jump table region):');
for (const line of disassemble(0x021EC0, 0x021EE4)) {
  console.log(`  ${hex(line.addr)}: ${line.bytes.padEnd(20)} ${line.text}`);
}
console.log('This is likely a trampoline/vector table entry for the decoder.');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('\n' + '='.repeat(72));
console.log('SUMMARY');
console.log('='.repeat(72));
console.log(`
Action Code CODEC at 0x07FE2F / 0x07FE65:
  - 6-entry encoder (ext→int), 5-entry decoder (int→ext)
  - CPIR scans input table; BC remainder indexes output table in reverse
  - Tables overlap in ROM (shared region 0x07FE8A–0x07FE96)
  - Asymmetric: ext 0x19 and 0x18 both map to int 0x1B (lossy)
  - Default encoder output: 0x0C; default decoder: pass-through
  - High bits (0xC0 mask) preserved across both directions
  - 2 encoder callers, 4 decoder callers (incl. 1 JP table entry)

Full mapping:
  ext 0x21 ↔ int 0x1F  (roundtrip OK)
  ext 0x20 ↔ int 0x1E  (roundtrip OK)
  ext 0x1C ↔ int 0x1D  (roundtrip OK)
  ext 0x18 ↔ int 0x1B  (roundtrip OK)
  ext 0x00 ↔ int 0x0C  (roundtrip OK)
  ext 0x19  → int 0x1B  (one-way; decodes back to 0x18)
`);

console.log('Phase 404 probe complete.');
