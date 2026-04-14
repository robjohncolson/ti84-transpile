#!/usr/bin/env node

/**
 * Phase 141 — Scan Code -> Internal Code Translation Layer
 *
 * Finds and extracts the OS translation table at 0x09F79B that converts
 * _GetCSC sequential scan codes (0x01-0x38) into internal OS key codes
 * (e.g. 0x41='A', 0x80='+' token, etc.).
 *
 * The table has 4 sections of 0x39 bytes each, indexed by modifier state:
 *   Section 0 (offset 0x00): Unmodified (no 2nd, no alpha)
 *   Section 1 (offset 0x38): 2nd-shifted
 *   Section 2 (offset 0x70): Alpha-shifted
 *   Section 3 (offset 0xA8): Alpha+2nd combined
 *
 * The lookup code lives at 0x03010D-0x030121:
 *   BIT 4,(IY+0x12) -> CALL Z,0x0301F6 (alpha processing)
 *   ADD A,0x70       (alpha offset)
 *   BIT 5,(IY+0x12) -> JP Z,0x030074 (if not 2nd, use alpha table)
 *   ADD A,0x38       (2nd offset, cumulative with alpha)
 *   LD L,A / LD H,0 / LD DE,0x09F79B / ADD HL,DE / LD A,(HL)
 *
 * Pure static ROM analysis.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase141-report.md');

const romBytes = fs.readFileSync(ROM_PATH);

// ── Helpers ──────────────────────────────────────────────────────────

function hex(v, w = 6) {
  return `0x${(v >>> 0).toString(16).padStart(w, '0')}`;
}

function hex2(v) {
  return `0x${(v & 0xff).toString(16).padStart(2, '0').toUpperCase()}`;
}

function bytesToHex(bytes) {
  return Array.from(bytes, v => v.toString(16).padStart(2, '0')).join(' ');
}

function read24(buf, off) {
  return buf[off] | (buf[off + 1] << 8) | (buf[off + 2] << 16);
}

// ── Known _GetCSC scan codes (sequential 1-based) ────────────────────

const GETCSC_NAMES = {
  0x00: '(none)',
  0x01: 'skDown', 0x02: 'skLeft', 0x03: 'skRight', 0x04: 'skUp',
  0x09: 'skEnter', 0x0A: 'skAdd', 0x0B: 'skSub', 0x0C: 'skMul',
  0x0D: 'skDiv', 0x0E: 'skPower', 0x0F: 'skClear',
  0x11: 'skChs', 0x12: 'sk3', 0x13: 'sk6', 0x14: 'sk9',
  0x15: 'skRParen', 0x16: 'skTan', 0x17: 'skVars',
  0x19: 'skDecPnt', 0x1A: 'sk2', 0x1B: 'sk5', 0x1C: 'sk8',
  0x1D: 'skLParen', 0x1E: 'skCos', 0x1F: 'skPrgm', 0x20: 'skStat',
  0x21: 'sk0', 0x22: 'sk1', 0x23: 'sk4', 0x24: 'sk7',
  0x25: 'skComma', 0x26: 'skSin', 0x27: 'skApps', 0x28: 'skX',
  0x2A: 'skSto', 0x2B: 'skLn', 0x2C: 'skLog',
  0x2D: 'skSquare', 0x2E: 'skRecip', 0x2F: 'skMath', 0x30: 'skAlpha',
  0x31: 'skGraph', 0x32: 'skTrace', 0x33: 'skZoom', 0x34: 'skWindow',
  0x35: 'skYequ', 0x36: 'sk2nd', 0x37: 'skMode', 0x38: 'skDel',
};

// Physical key labels
const KEY_LABELS = {
  0x01: 'DOWN', 0x02: 'LEFT', 0x03: 'RIGHT', 0x04: 'UP',
  0x09: 'ENTER', 0x0A: '+', 0x0B: '-', 0x0C: '\\u00D7', 0x0D: '\\u00F7', 0x0E: '^', 0x0F: 'CLEAR',
  0x11: '(-)', 0x12: '3', 0x13: '6', 0x14: '9', 0x15: ')', 0x16: 'TAN', 0x17: 'VARS',
  0x19: '.', 0x1A: '2', 0x1B: '5', 0x1C: '8', 0x1D: '(', 0x1E: 'COS', 0x1F: 'PRGM', 0x20: 'STAT',
  0x21: '0', 0x22: '1', 0x23: '4', 0x24: '7', 0x25: ',', 0x26: 'SIN', 0x27: 'APPS', 0x28: 'X,T,\\u03B8,n',
  0x2A: 'STO\\u2192', 0x2B: 'LN', 0x2C: 'LOG', 0x2D: 'x\\u00B2', 0x2E: 'x\\u207B\\u00B9', 0x2F: 'MATH', 0x30: 'ALPHA',
  0x31: 'GRAPH', 0x32: 'TRACE', 0x33: 'ZOOM', 0x34: 'WINDOW', 0x35: 'Y=', 0x36: '2ND', 0x37: 'MODE', 0x38: 'DEL',
};

// Alpha labels physically printed on keys (well-known from TI-84 documentation)
const ALPHA_PRINT = {
  0x2F: 'A', 0x27: 'B', 0x1F: 'C', 0x2E: 'D', 0x2D: 'E',
  0x26: 'F', 0x1E: 'G', 0x16: 'H', 0x2C: 'I', 0x2B: 'J',
  0x25: 'K', 0x1D: 'L', 0x28: 'M', 0x2A: 'N', 0x15: 'O',
  0x14: 'P', 0x13: 'Q', 0x12: 'R', 0x0B: 'S', 0x0A: 'T',
  0x1C: 'U', 0x1B: 'V', 0x0C: 'W', 0x1A: 'X', 0x0D: 'Y',
  0x0E: 'Z', 0x11: 'THETA', 0x17: 'u', 0x20: '!',
};

// ── Table extraction ─────────────────────────────────────────────────

const TABLE_ADDR = 0x09F79B;
const SECTION_SIZE = 0x39; // 57 entries per section (scan codes 0x00-0x38)

const SECTIONS = [
  { name: 'Unmodified', offset: 0x00, desc: 'Normal key press (no modifier)' },
  { name: '2nd-shifted', offset: 0x38, desc: '2nd key active' },
  { name: 'Alpha', offset: 0x70, desc: 'Alpha key active' },
  { name: 'Alpha+2nd', offset: 0xA8, desc: 'Both Alpha and 2nd active' },
];

function classifyInternal(ic) {
  if (ic >= 0x41 && ic <= 0x5A) return String.fromCharCode(ic);
  if (ic >= 0x30 && ic <= 0x39) return `'${String.fromCharCode(ic)}'`;
  if (ic === 0x00) return '(none)';
  if (ic >= 0x01 && ic <= 0x0F) return `ctrl_${hex2(ic)}`;
  if (ic >= 0x20 && ic <= 0x7E) return `'${String.fromCharCode(ic)}'`;
  return `tok_${hex2(ic)}`;
}

function extractSection(sectionOffset) {
  const entries = [];
  for (let sc = 0; sc <= 0x38; sc++) {
    const ic = romBytes[TABLE_ADDR + sectionOffset + sc];
    entries.push({
      scanCode: sc,
      internalCode: ic,
      keyLabel: KEY_LABELS[sc] || '',
      getCSCName: GETCSC_NAMES[sc] || '',
      classification: classifyInternal(ic),
      isLetter: ic >= 0x41 && ic <= 0x5A,
      isEmpty: ic === 0x00,
    });
  }
  return entries;
}

// ── Disassemble the lookup code ──────────────────────────────────────

function simpleDisasm(startAddr, length) {
  const lines = [];
  let pc = startAddr;
  const end = startAddr + length;

  while (pc < end) {
    const b0 = romBytes[pc];
    let instruction = '';
    let size = 1;

    switch (b0) {
      case 0x00: instruction = 'NOP'; break;
      case 0x06: instruction = `LD B,${hex2(romBytes[pc + 1])}`; size = 2; break;
      case 0x0E: instruction = `LD C,${hex2(romBytes[pc + 1])}`; size = 2; break;
      case 0x11: instruction = `LD DE,${hex(read24(romBytes, pc + 1))}`; size = 4; break;
      case 0x16: instruction = `LD D,${hex2(romBytes[pc + 1])}`; size = 2; break;
      case 0x18: instruction = `JR ${hex(pc + 2 + ((romBytes[pc + 1] << 24) >> 24))}`; size = 2; break;
      case 0x19: instruction = 'ADD HL,DE'; break;
      case 0x1E: instruction = `LD E,${hex2(romBytes[pc + 1])}`; size = 2; break;
      case 0x20: instruction = `JR NZ,${hex(pc + 2 + ((romBytes[pc + 1] << 24) >> 24))}`; size = 2; break;
      case 0x21: instruction = `LD HL,${hex(read24(romBytes, pc + 1))}`; size = 4; break;
      case 0x26: instruction = `LD H,${hex2(romBytes[pc + 1])}`; size = 2; break;
      case 0x28: instruction = `JR Z,${hex(pc + 2 + ((romBytes[pc + 1] << 24) >> 24))}`; size = 2; break;
      case 0x32: instruction = `LD (${hex(read24(romBytes, pc + 1))}),A`; size = 4; break;
      case 0x3A: instruction = `LD A,(${hex(read24(romBytes, pc + 1))})`; size = 4; break;
      case 0x3E: instruction = `LD A,${hex2(romBytes[pc + 1])}`; size = 2; break;
      case 0x6F: instruction = 'LD L,A'; break;
      case 0x7E: instruction = 'LD A,(HL)'; break;
      case 0xC3: instruction = `JP ${hex(read24(romBytes, pc + 1))}`; size = 4; break;
      case 0xC6: instruction = `ADD A,${hex2(romBytes[pc + 1])}`; size = 2; break;
      case 0xC9: instruction = 'RET'; break;
      case 0xCA: instruction = `JP Z,${hex(read24(romBytes, pc + 1))}`; size = 4; break;
      case 0xCC: instruction = `CALL Z,${hex(read24(romBytes, pc + 1))}`; size = 4; break;
      case 0xCD: instruction = `CALL ${hex(read24(romBytes, pc + 1))}`; size = 4; break;
      case 0xD6: instruction = `SUB ${hex2(romBytes[pc + 1])}`; size = 2; break;
      case 0xF2: instruction = `JP P,${hex(read24(romBytes, pc + 1))}`; size = 4; break;
      case 0xFE: instruction = `CP ${hex2(romBytes[pc + 1])}`; size = 2; break;
      case 0xFD: {
        const b1 = romBytes[pc + 1];
        if (b1 === 0xCB) {
          const offset = romBytes[pc + 2];
          const op = romBytes[pc + 3];
          const bitNum = (op >> 3) & 7;
          const baseOp = op & 0xC7;
          if (baseOp === 0x46) instruction = `BIT ${bitNum},(IY+${hex2(offset)})`;
          else if (baseOp === 0xC6) instruction = `SET ${bitNum},(IY+${hex2(offset)})`;
          else if (baseOp === 0x86) instruction = `RES ${bitNum},(IY+${hex2(offset)})`;
          else instruction = `FD CB ${hex2(offset)} ${hex2(op)}`;
          size = 4;
        } else {
          instruction = `db FD,${hex2(b1)}`;
          size = 2;
        }
        break;
      }
      default:
        instruction = `db ${hex2(b0)}`;
        break;
    }

    const rawBytes = bytesToHex(romBytes.slice(pc, pc + size));
    lines.push(`${hex(pc)}  ${rawBytes.padEnd(16)}  ${instruction}`);
    pc += size;
  }

  return lines;
}

// ── Build report ─────────────────────────────────────────────────────

const lines = [];

lines.push('# Phase 141 -- Scan Code -> Internal Code Translation Layer');
lines.push('');
lines.push('Generated by `probe-phase141-scancode-translate.mjs`.');
lines.push('');
lines.push(`- ROM size: ${romBytes.length} bytes`);
lines.push(`- Translation table address: \`${hex(TABLE_ADDR)}\``);
lines.push(`- Section size: ${SECTION_SIZE} bytes (scan codes 0x00-0x38)`);
lines.push(`- Total table size: ${SECTION_SIZE * 4} bytes (4 sections)`);
lines.push('');

// ── Summary ──────────────────────────────────────────────────────────

lines.push('## Summary');
lines.push('');
lines.push('The TI-84 Plus CE OS uses a **4-section lookup table** at `0x09F79B` to convert');
lines.push('`_GetCSC` sequential scan codes (0x01-0x38) into internal OS key codes. The');
lines.push('section is selected by the current modifier state stored in `(IY+0x12)`:');
lines.push('');
lines.push('| Section | Offset | Condition | Description |');
lines.push('|---------|--------|-----------|-------------|');
lines.push('| 0 | +0x00 | No modifier | Unshifted key codes |');
lines.push('| 1 | +0x38 | 2nd active | 2nd-shifted key codes |');
lines.push('| 2 | +0x70 | Alpha active | Alpha-shifted key codes |');
lines.push('| 3 | +0xA8 | Alpha+2nd | Combined modifier codes |');
lines.push('');
lines.push('The lookup code at `0x03010D` adds the section offset to the scan code, then');
lines.push('indexes into the table: `A = table[scanCode + sectionOffset]`.');
lines.push('');
lines.push('**Key finding**: The internal codes at `0x08759D` (the classifier from Phase 136)');
lines.push('use values from Section 0 of this table. Letter codes 0x41-0x5A appear in the');
lines.push('unmodified section for the function key row (GRAPH=D, TRACE=Z, WINDOW=H, Y\\==I,');
lines.push('MODE=E) -- these are the alpha labels printed on those keys.');
lines.push('');

// ── Lookup code disassembly ──────────────────────────────────────────

lines.push('## Lookup Code Disassembly (0x030100-0x030134)');
lines.push('');
lines.push('```text');
lines.push(...simpleDisasm(0x030100, 0x35));
lines.push('```');
lines.push('');
lines.push('**Flow**:');
lines.push('1. `BIT 4,(IY+0x12)` tests alpha mode flag');
lines.push('2. If alpha is off (Z=1): `CALL Z,0x0301F6` (alpha key remapping)');
lines.push('3. `ADD A,0x70` (alpha section offset)');
lines.push('4. `BIT 5,(IY+0x12)` tests 2nd mode flag');
lines.push('5. If 2nd is off (Z=1): `JP Z,0x030074` (use alpha offset only)');
lines.push('6. If 2nd is on: `ADD A,0x38` (add 2nd offset = total 0xA8)');
lines.push('7. `LD L,A; LD H,0; LD DE,0x09F79B; ADD HL,DE; LD A,(HL)` -- table lookup');
lines.push('8. Result in A is compared against 0xE2 and 0xFC for special handling');
lines.push('9. If in range, stored directly to `0xD0058E` (key event buffer)');
lines.push('');

// ── Full translation tables ──────────────────────────────────────────

for (const section of SECTIONS) {
  const entries = extractSection(section.offset);
  const activeEntries = entries.filter(e => !e.isEmpty);
  const letterEntries = entries.filter(e => e.isLetter);

  lines.push(`## ${section.name} Table (offset +0x${section.offset.toString(16).padStart(2, '0')})`);
  lines.push('');
  lines.push(`${section.desc}. ${activeEntries.length} active entries, ${letterEntries.length} letter codes.`);
  lines.push('');
  lines.push('| GetCSC | Key Label | Internal | Classification |');
  lines.push('|--------|-----------|----------|---------------|');

  for (const e of activeEntries) {
    const scHex = `0x${e.scanCode.toString(16).padStart(2, '0')}`;
    const icHex = `0x${e.internalCode.toString(16).padStart(2, '0')}`;
    const label = e.keyLabel || '?';
    lines.push(`| \`${scHex}\` | ${label} | \`${icHex}\` | ${e.classification} |`);
  }

  lines.push('');

  if (letterEntries.length > 0) {
    lines.push(`**Letter entries**: ${letterEntries.map(e => `${e.keyLabel}=${e.classification}`).join(', ')}`);
    lines.push('');
  }
}

// ── Alpha key mapping cross-reference ────────────────────────────────

lines.push('## Alpha Key Mapping Cross-Reference');
lines.push('');
lines.push('The unmodified (Section 0) table maps function keys to their alpha letter');
lines.push('labels. This matches the physical keyboard layout of the TI-84 Plus CE:');
lines.push('');
lines.push('| Physical Key | GetCSC | Unmodified Internal | Alpha Label | 2nd Internal |');
lines.push('|-------------|--------|---------------------|-------------|-------------|');

const sec0 = extractSection(0x00);
const sec1 = extractSection(0x38);

for (let sc = 0; sc <= 0x38; sc++) {
  const e0 = sec0[sc];
  const e1 = sec1[sc];
  if (e0.isEmpty) continue;

  const scHex = `0x${sc.toString(16).padStart(2, '0')}`;
  const ic0Hex = `0x${e0.internalCode.toString(16).padStart(2, '0')}`;
  const ic1Hex = `0x${e1.internalCode.toString(16).padStart(2, '0')}`;
  const alphaLabel = ALPHA_PRINT[sc] || '';

  lines.push(`| ${(e0.keyLabel || '?').padEnd(12)} | \`${scHex}\` | \`${ic0Hex}\` (${e0.classification.padEnd(12)}) | ${alphaLabel.padEnd(6)} | \`${ic1Hex}\` (${e1.classification}) |`);
}

lines.push('');

// ── Phase 136 classifier cross-reference ─────────────────────────────

lines.push('## Phase 136 Classifier Cross-Reference');
lines.push('');
lines.push('The classifier at `0x08759D` uses CPIR to check if a key code belongs to');
lines.push('specific groups. Here is how the classifier tables map to the translation');
lines.push('table entries:');
lines.push('');

// Table 1 from Phase 136: letters in the classifier
const table1Letters = [0x5A, 0x59, 0x41, 0x42, 0x45, 0x46, 0x47, 0x4B, 0x4C, 0x4D, 0x4E, 0x4F, 0x52, 0x53, 0x55, 0x57, 0x54, 0x56];

lines.push('### Classifier Table 1 (Alphabetic Keys)');
lines.push('');
lines.push('| Letter | Internal Code | Source in Section 0 |');
lines.push('|--------|--------------|---------------------|');

for (const code of table1Letters) {
  const letter = String.fromCharCode(code);
  // Find which scan code maps to this in Section 0
  let sourceKey = '(not found)';
  for (let sc = 0; sc <= 0x38; sc++) {
    if (romBytes[TABLE_ADDR + sc] === code) {
      sourceKey = `${KEY_LABELS[sc] || '?'} (GetCSC 0x${sc.toString(16).padStart(2, '0')})`;
      break;
    }
  }
  lines.push(`| ${letter} | \`0x${code.toString(16).padStart(2, '0')}\` | ${sourceKey} |`);
}

lines.push('');
lines.push('**Missing from Table 1**: C, D, H, I, J, P, Q, X -- these letters appear in');
lines.push('Table 1 missing list from Phase 136. Cross-checking:');
lines.push('');

const missingLetters = ['C', 'D', 'H', 'I', 'J', 'P', 'Q', 'X'];
for (const letter of missingLetters) {
  const code = letter.charCodeAt(0);
  let found = [];
  for (let sec = 0; sec < 4; sec++) {
    const offset = SECTIONS[sec].offset;
    for (let sc = 0; sc <= 0x38; sc++) {
      if (romBytes[TABLE_ADDR + offset + sc] === code) {
        found.push(`Section ${sec} (${SECTIONS[sec].name}): ${KEY_LABELS[sc] || '?'} (0x${sc.toString(16).padStart(2, '0')})`);
      }
    }
  }
  lines.push(`- **${letter}** (0x${code.toString(16).padStart(2, '0')}): ${found.length > 0 ? found.join('; ') : 'not found in any section'}`);
}

lines.push('');

// ── Raw hex dump ─────────────────────────────────────────────────────

lines.push('## Raw Hex Dump');
lines.push('');
lines.push('```text');
for (let i = 0; i < SECTION_SIZE * 4; i += 16) {
  const addr = TABLE_ADDR + i;
  const slice = romBytes.slice(addr, Math.min(addr + 16, TABLE_ADDR + SECTION_SIZE * 4));
  const hexStr = bytesToHex(slice);
  const asciiStr = Array.from(slice).map(b => b >= 0x20 && b <= 0x7E ? String.fromCharCode(b) : '.').join('');
  lines.push(`${hex(addr)}  ${hexStr.padEnd(48)}  ${asciiStr}`);
}
lines.push('```');
lines.push('');

// ── Architectural significance ───────────────────────────────────────

lines.push('## Architectural Significance');
lines.push('');
lines.push('1. **Two-stage key processing**: The OS converts raw keyboard matrix scans');
lines.push('   to `_GetCSC` sequential codes (0x01-0x38) in the ISR, then the main');
lines.push('   loop uses this table at `0x09F79B` to convert to internal codes.');
lines.push('');
lines.push('2. **Modifier-aware lookup**: The 4-section table handles all modifier');
lines.push('   combinations (none/2nd/alpha/alpha+2nd) in a single indexed lookup,');
lines.push('   controlled by flags at `(IY+0x12)` bits 4 and 5.');
lines.push('');
lines.push('3. **Internal code semantics**:');
lines.push('   - `0x01-0x0F`: Control codes (arrows, enter, clear, del)');
lines.push('   - `0x30-0x3E`: Digit/punctuation characters');
lines.push('   - `0x40-0x5A`: Letter codes (ASCII-based, used by Phase 136 classifier)');
lines.push('   - `0x80-0xFF`: Function/token codes (math ops, trig, parentheses, etc.)');
lines.push('');
lines.push('4. **Function key alpha labels**: In the unmodified table, keys GRAPH through');
lines.push('   MODE produce ASCII letter codes (D, Z, H, I, E) -- these correspond to');
lines.push('   the alpha labels physically printed on those keys. This is why the');
lines.push('   Phase 136 classifier checks for these letters even in non-alpha mode.');
lines.push('');
lines.push('5. **Key event buffer**: The converted internal code is stored at `0xD0058E`,');
lines.push('   which is read by the main key handler at `0x08C4A3` and dispatched');
lines.push('   through the key processing chain identified in Phases 113-136.');
lines.push('');
lines.push('---');
lines.push('*Generated by probe-phase141-scancode-translate.mjs*');

// Write report
const report = lines.join('\n') + '\n';
fs.writeFileSync(REPORT_PATH, report, 'utf8');

console.log(`Wrote ${path.basename(REPORT_PATH)} (${lines.length} lines)`);
console.log(`Table address: ${hex(TABLE_ADDR)}`);
console.log(`Sections: ${SECTIONS.length} x ${SECTION_SIZE} bytes = ${SECTION_SIZE * 4} bytes total`);

// Summary stats
for (const section of SECTIONS) {
  const entries = extractSection(section.offset);
  const active = entries.filter(e => !e.isEmpty).length;
  const letters = entries.filter(e => e.isLetter).length;
  console.log(`  ${section.name}: ${active} active, ${letters} letter codes`);
}
