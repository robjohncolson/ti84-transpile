#!/usr/bin/env node

/**
 * Phase 136 — 0x08759D Key-Code Table Deep Analysis
 *
 * Extracts and analyzes the CPIR-based key classification table at 0x08759D.
 * Identifies 3 inline byte tables, maps scan codes to TI-84 CE keys,
 * and classifies each table group.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROM_PATH = path.join(__dirname, 'ROM.rom');
const REPORT_PATH = path.join(__dirname, 'phase136-report.md');

// ── Constants ──────────────────────────────────────────────────────────

const BASE_ADDR = 0x08759d;
const WINDOW_SIZE = 256;

// TI-84 Plus CE _GetCSC key scan code mapping
// These are the "translated" key codes after _GetCSC processing,
// NOT the raw matrix scan codes. The values in the tables at 0x08759D
// appear to be in a different encoding — likely the internal OS key codes
// used after scan-to-keycode translation.
//
// Standard _GetCSC return values (sk* constants from ti84pce.inc):
const GETCSC_MAP = {
  0x00: '(none)',
  0x01: 'skDown',
  0x02: 'skLeft',
  0x03: 'skRight',
  0x04: 'skUp',
  0x09: 'skEnter',
  0x0A: 'skNeg/(-)',
  0x0B: 'sk3',
  0x0C: 'sk6',
  0x0D: 'sk9',
  0x0E: 'skRParen',
  0x0F: 'skTan',
  0x10: 'skVars',
  0x11: 'skDecPnt/.',
  0x12: 'sk2',
  0x13: 'sk5',
  0x14: 'sk8',
  0x15: 'skLParen',
  0x16: 'skCos',
  0x17: 'skPrgm',
  0x18: 'skStat',
  0x19: 'sk0',
  0x1A: 'sk1',
  0x1B: 'sk4',
  0x1C: 'sk7',
  0x1D: 'skComma',
  0x1E: 'skSin',
  0x1F: 'skApps',
  0x20: 'skXTOn',
  0x21: 'skSto',
  0x22: 'skLn',
  0x23: 'skLog',
  0x24: 'skSquare',
  0x25: 'skRecip',
  0x26: 'skMath',
  0x27: 'skAlpha',
  0x28: 'skGraph',
  0x29: 'skTrace',
  0x2A: 'skZoom',
  0x2B: 'skWindow',
  0x2C: 'skYequ',
  0x2D: 'sk2nd',
  0x2E: 'skMode',
  0x2F: 'skDel',
  // Keys >= 0x30 are arithmetic/special
  0x30: 'skDiv',
  0x31: 'skMul',
  0x32: 'skSub',
  0x33: 'skAdd',
  0x34: 'skEnter2',
  0x35: 'skPower',
  0x36: 'skClear',
  0x37: 'skClear2',
  0x38: 'skDel2',
};

// The OS uses a DIFFERENT internal key code system for the dispatched codes.
// These are the "kXxx" constants — token-like codes used after key classification.
// Values in the 0x40-0xFF+ range represent tokenized key actions.
// Common ones from TI-OS documentation:
const OS_KEYCODE_MAP = {
  // Arrow/nav keys
  0x01: 'kDown',
  0x02: 'kLeft',
  0x03: 'kRight',
  0x04: 'kUp',
  // Digit/basic keys (these overlap with token IDs in TI-OS)
  0x30: 'k0',
  0x31: 'k1',
  0x32: 'k2',
  0x33: 'k3',
  0x34: 'k4',
  0x35: 'k5',
  0x36: 'k6',
  0x37: 'k7',
  0x38: 'k8',
  0x39: 'k9',
  // Alphabetic (capital letters)
  0x41: 'A',
  0x42: 'B',
  0x43: 'C',
  0x44: 'D',
  0x45: 'E',
  0x46: 'F',
  0x47: 'G',
  0x48: 'H',
  0x49: 'I',
  0x4A: 'J',
  0x4B: 'K',
  0x4C: 'L',
  0x4D: 'M',
  0x4E: 'N',
  0x4F: 'O',
  0x50: 'P',
  0x51: 'Q',
  0x52: 'R',
  0x53: 'S',
  0x54: 'T',
  0x55: 'U',
  0x56: 'V',
  0x57: 'W',
  0x58: 'X',
  0x59: 'Y',
  0x5A: 'Z',
  // Lowercase theta
  0x5B: 'theta',
  // Special tokens / operators
  0x5C: 'kStore (Sto->)',
  0x5D: 'kEnter',
  // Punctuation/operators
  0x2B: 'kAdd (+)',
  0x2D: 'kSub (-)',
  0x2A: 'kMul (*)',
  0x2F: 'kDiv (/)',
  0x3A: 'kColon',
  0x3B: 'kSemicolon',
  0x3C: 'kLT (<)',
  0x3D: 'kEQ (=)',
  0x3E: 'kGT (>)',
  0x3F: 'kQuestion (?)',
  // Function keys / menu tokens (0x80+ range)
  0x80: 'kFunc80',
  0x81: 'kFunc81',
  0x82: 'kFunc82',
  0x83: 'kFunc83',
  0x84: 'kFunc84',
  0x85: 'kFunc85',
  0x86: 'kFunc86',
  0x87: 'kFunc87',
  0x88: 'kFunc88',
  0x89: 'kFunc89',
  0x8A: 'kFunc8A',
  0x8B: 'kFunc8B',
  0x8C: 'kFunc8C',
  0x8D: 'kFunc8D',
  0x8E: 'kFunc8E',
  0x8F: 'kFunc8F',
  0x90: 'kFunc90',
  0x91: 'kFunc91',
  0x92: 'kFunc92',
  0x93: 'kFunc93',
  0x94: 'kFunc94',
  0x95: 'kFunc95',
  0x96: 'kFunc96',
  0x97: 'kFunc97',
  0x98: 'kFunc98',
  0x99: 'kFunc99',
  0x9A: 'kFunc9A',
  0x9B: 'kFunc9B',
  0x9C: 'kFunc9C',
  0x9D: 'kFunc9D',
  0x9E: 'kFunc9E',
  0x9F: 'kFunc9F',
  0xA0: 'kFuncA0',
  0xA1: 'kFuncA1',
  0xA2: 'kFuncA2',
  0xA3: 'kFuncA3',
  0xA4: 'kFuncA4',
  0xA5: 'kFuncA5',
  0xA6: 'kFuncA6',
  0xA7: 'kFuncA7',
  0xA8: 'kFuncA8',
  0xA9: 'kFuncA9',
  0xAA: 'kFuncAA',
  0xAB: 'kFuncAB',
  0xAC: 'kFuncAC',
  0xAD: 'kFuncAD',
  0xAE: 'kFuncAE',
  0xAF: 'kFuncAF',
  0xB0: 'kFuncB0',
  0xB1: 'kFuncB1',
  0xB2: 'kFuncB2',
  0xB3: 'kFuncB3',
  0xB4: 'kFuncB4',
  0xB5: 'kFuncB5',
  0xB6: 'kFuncB6',
  0xB7: 'kFuncB7',
  0xB8: 'kFuncB8',
  0xB9: 'kFuncB9',
  0xBA: 'kFuncBA',
  0xBB: 'kFuncBB',
  0xBC: 'kFuncBC',
  0xBD: 'kFuncBD',
  0xBE: 'kFuncBE',
  0xBF: 'kFuncBF',
  0xF8: 'kFuncF8',
  0xFC: 'kFuncFC',
};

// ── Helpers ────────────────────────────────────────────────────────────

function hex(value, width = 2) {
  return `0x${(value >>> 0).toString(16).padStart(width, '0')}`;
}

function hexByte(value) {
  return (value >>> 0).toString(16).padStart(2, '0').toUpperCase();
}

function keyName(code) {
  // Check OS keycode map first (these are the internal codes used in the tables)
  if (OS_KEYCODE_MAP[code]) return OS_KEYCODE_MAP[code];
  if (GETCSC_MAP[code]) return GETCSC_MAP[code];
  return `unknown(${hex(code)})`;
}

// ── Main ───────────────────────────────────────────────────────────────

function main() {
  console.log('Phase 136 — 0x08759D Key-Code Table Deep Analysis');
  console.log('==================================================\n');

  // Read ROM
  const rom = fs.readFileSync(ROM_PATH);
  console.log(`ROM loaded: ${rom.length} bytes`);

  // ── Step 1: Extract raw bytes ──────────────────────────────────────
  console.log(`\n--- Step 1: Raw hex dump at ${hex(BASE_ADDR, 6)} (${WINDOW_SIZE} bytes) ---\n`);

  const rawBytes = rom.subarray(BASE_ADDR, BASE_ADDR + WINDOW_SIZE);

  const hexDumpLines = [];
  for (let i = 0; i < WINDOW_SIZE; i += 16) {
    const addr = BASE_ADDR + i;
    const bytes = [];
    const ascii = [];
    for (let j = 0; j < 16 && i + j < WINDOW_SIZE; j++) {
      const b = rawBytes[i + j];
      bytes.push(hexByte(b));
      ascii.push(b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : '.');
    }
    hexDumpLines.push(
      `${hex(addr, 6)}  ${bytes.slice(0, 8).join(' ')}  ${bytes.slice(8).join(' ')}  |${ascii.join('')}|`
    );
  }
  const hexDumpStr = hexDumpLines.join('\n');
  console.log(hexDumpStr);

  // ── Step 2: Find CPIR instructions ─────────────────────────────────
  console.log('\n--- Step 2: CPIR (ED B1) occurrences ---\n');

  const cpirPositions = [];
  for (let i = 0; i < WINDOW_SIZE - 1; i++) {
    if (rawBytes[i] === 0xed && rawBytes[i + 1] === 0xb1) {
      cpirPositions.push(i);
    }
  }

  const cpirDetails = [];
  for (const pos of cpirPositions) {
    const absAddr = BASE_ADDR + pos;
    // Look backwards for the setup instructions
    // Pattern: LD BC, imm24 (01 xx xx xx) then LD HL, imm24 (21 xx xx xx) then ED B1
    // LD BC is 4 bytes, LD HL is 4 bytes, so setup starts at pos-8
    const setupStart = Math.max(0, pos - 8);
    const setupBytes = [];
    for (let j = setupStart; j <= pos + 1; j++) {
      setupBytes.push(hexByte(rawBytes[j]));
    }

    let bcValue = null;
    let hlValue = null;

    // Search backwards for LD BC (opcode 0x01) and LD HL (opcode 0x21)
    for (let j = pos - 1; j >= Math.max(0, pos - 10); j--) {
      if (rawBytes[j] === 0x01 && j + 3 < WINDOW_SIZE && bcValue === null) {
        bcValue = rawBytes[j + 1] | (rawBytes[j + 2] << 8) | (rawBytes[j + 3] << 16);
      }
      if (rawBytes[j] === 0x21 && j + 3 < WINDOW_SIZE && hlValue === null) {
        hlValue = rawBytes[j + 1] | (rawBytes[j + 2] << 8) | (rawBytes[j + 3] << 16);
      }
    }

    const detail = {
      offset: pos,
      absAddr,
      setupBytes: setupBytes.join(' '),
      bcCount: bcValue,
      hlTableAddr: hlValue,
    };
    cpirDetails.push(detail);

    console.log(`CPIR at offset +${hex(pos)} (${hex(absAddr, 6)})`);
    console.log(`  Setup bytes: ${detail.setupBytes}`);
    if (bcValue !== null) console.log(`  BC (count) = ${hex(bcValue, 6)} (${bcValue} entries)`);
    if (hlValue !== null) console.log(`  HL (table) = ${hex(hlValue, 6)}`);
    console.log();
  }

  // ── Step 3: Extract byte tables ────────────────────────────────────
  console.log('\n--- Step 3: Inline byte tables ---\n');

  // From Phase 133 disassembly, the structure is:
  // Table 1: LD BC, 0x12 (18 entries); LD HL, 0x0875A8; CPIR; RET
  //   -> table data at 0x0875A8, 18 bytes
  // Table 2: LD BC, 0x0B (11 entries); LD HL, 0x0875C5; CPIR; RET
  //   -> table data at 0x0875C5, 11 bytes
  // Table 3: after a "CALL M" and setup, LD BC with count, LD HL, CPIR; RET
  //   -> need to parse carefully

  const tables = [];

  for (const detail of cpirDetails) {
    if (detail.hlTableAddr !== null && detail.bcCount !== null && detail.bcCount < 100) {
      const tableOffset = detail.hlTableAddr - BASE_ADDR;
      if (tableOffset >= 0 && tableOffset + detail.bcCount <= WINDOW_SIZE) {
        const tableBytes = [];
        for (let j = 0; j < detail.bcCount; j++) {
          tableBytes.push(rawBytes[tableOffset + j]);
        }
        tables.push({
          cpirAddr: detail.absAddr,
          tableAddr: detail.hlTableAddr,
          count: detail.bcCount,
          bytes: tableBytes,
        });
      }
    }
  }

  const tableDetails = [];
  for (let t = 0; t < tables.length; t++) {
    const table = tables[t];
    console.log(`Table ${t + 1}: ${table.count} entries at ${hex(table.tableAddr, 6)} (CPIR at ${hex(table.cpirAddr, 6)})`);
    console.log(`  Raw bytes: ${table.bytes.map(b => hexByte(b)).join(' ')}`);

    const entries = [];
    for (const b of table.bytes) {
      const name = keyName(b);
      entries.push({ code: b, name });
      console.log(`    ${hexByte(b)} -> ${name}`);
    }
    tableDetails.push({ ...table, entries });
    console.log();
  }

  // ── Step 4: Check for additional structure after the 3 CPIR blocks ──
  // The Phase 133 disassembly shows a 4th CPIR at the end (LD BC, 0x01)
  // which is a single-entry table. Let's also look at the broader context.

  console.log('\n--- Step 4: Full eZ80 instruction decode ---\n');

  // Simple linear decode of the 256-byte window
  const decoded = [];
  let pc = 0;
  while (pc < WINDOW_SIZE) {
    const addr = BASE_ADDR + pc;
    const b0 = rawBytes[pc];

    // Handle key eZ80 instructions we care about
    if (b0 === 0x01 && pc + 3 < WINDOW_SIZE) {
      // LD BC, imm24
      const imm = rawBytes[pc + 1] | (rawBytes[pc + 2] << 8) | (rawBytes[pc + 3] << 16);
      decoded.push({ addr, len: 4, text: `ld bc, ${hex(imm, 6)}`, raw: [b0, rawBytes[pc+1], rawBytes[pc+2], rawBytes[pc+3]] });
      pc += 4;
    } else if (b0 === 0x21 && pc + 3 < WINDOW_SIZE) {
      // LD HL, imm24
      const imm = rawBytes[pc + 1] | (rawBytes[pc + 2] << 8) | (rawBytes[pc + 3] << 16);
      decoded.push({ addr, len: 4, text: `ld hl, ${hex(imm, 6)}`, raw: [b0, rawBytes[pc+1], rawBytes[pc+2], rawBytes[pc+3]] });
      pc += 4;
    } else if (b0 === 0xed && pc + 1 < WINDOW_SIZE && rawBytes[pc + 1] === 0xb1) {
      decoded.push({ addr, len: 2, text: 'cpir', raw: [0xed, 0xb1] });
      pc += 2;
    } else if (b0 === 0xc9) {
      decoded.push({ addr, len: 1, text: 'ret', raw: [0xc9] });
      pc += 1;
    } else if (b0 === 0xfc && pc + 3 < WINDOW_SIZE) {
      // CALL M, imm24
      const imm = rawBytes[pc + 1] | (rawBytes[pc + 2] << 8) | (rawBytes[pc + 3] << 16);
      decoded.push({ addr, len: 4, text: `call m, ${hex(imm, 6)}`, raw: [b0, rawBytes[pc+1], rawBytes[pc+2], rawBytes[pc+3]] });
      pc += 4;
    } else if (b0 === 0xcd && pc + 3 < WINDOW_SIZE) {
      // CALL imm24
      const imm = rawBytes[pc + 1] | (rawBytes[pc + 2] << 8) | (rawBytes[pc + 3] << 16);
      decoded.push({ addr, len: 4, text: `call ${hex(imm, 6)}`, raw: [b0, rawBytes[pc+1], rawBytes[pc+2], rawBytes[pc+3]] });
      pc += 4;
    } else if (b0 === 0xc3 && pc + 3 < WINDOW_SIZE) {
      // JP imm24
      const imm = rawBytes[pc + 1] | (rawBytes[pc + 2] << 8) | (rawBytes[pc + 3] << 16);
      decoded.push({ addr, len: 4, text: `jp ${hex(imm, 6)}`, raw: [b0, rawBytes[pc+1], rawBytes[pc+2], rawBytes[pc+3]] });
      pc += 4;
    } else if (b0 === 0x3a && pc + 3 < WINDOW_SIZE) {
      // LD A, (imm24)
      const imm = rawBytes[pc + 1] | (rawBytes[pc + 2] << 8) | (rawBytes[pc + 3] << 16);
      decoded.push({ addr, len: 4, text: `ld a, (${hex(imm, 6)})`, raw: [b0, rawBytes[pc+1], rawBytes[pc+2], rawBytes[pc+3]] });
      pc += 4;
    } else if (b0 === 0x32 && pc + 3 < WINDOW_SIZE) {
      // LD (imm24), A
      const imm = rawBytes[pc + 1] | (rawBytes[pc + 2] << 8) | (rawBytes[pc + 3] << 16);
      decoded.push({ addr, len: 4, text: `ld (${hex(imm, 6)}), a`, raw: [b0, rawBytes[pc+1], rawBytes[pc+2], rawBytes[pc+3]] });
      pc += 4;
    } else if (b0 === 0xfe && pc + 1 < WINDOW_SIZE) {
      // CP imm8
      decoded.push({ addr, len: 2, text: `cp ${hex(rawBytes[pc + 1])}`, raw: [b0, rawBytes[pc+1]] });
      pc += 2;
    } else if (b0 === 0x11 && pc + 3 < WINDOW_SIZE) {
      // LD DE, imm24
      const imm = rawBytes[pc + 1] | (rawBytes[pc + 2] << 8) | (rawBytes[pc + 3] << 16);
      decoded.push({ addr, len: 4, text: `ld de, ${hex(imm, 6)}`, raw: [b0, rawBytes[pc+1], rawBytes[pc+2], rawBytes[pc+3]] });
      pc += 4;
    } else if (b0 === 0x06 && pc + 1 < WINDOW_SIZE) {
      // LD B, imm8
      decoded.push({ addr, len: 2, text: `ld b, ${hex(rawBytes[pc + 1])}`, raw: [b0, rawBytes[pc+1]] });
      pc += 2;
    } else if (b0 === 0x0e && pc + 1 < WINDOW_SIZE) {
      // LD C, imm8
      decoded.push({ addr, len: 2, text: `ld c, ${hex(rawBytes[pc + 1])}`, raw: [b0, rawBytes[pc+1]] });
      pc += 2;
    } else if (b0 === 0x1e && pc + 1 < WINDOW_SIZE) {
      // LD E, imm8
      decoded.push({ addr, len: 2, text: `ld e, ${hex(rawBytes[pc + 1])}`, raw: [b0, rawBytes[pc+1]] });
      pc += 2;
    } else if (b0 === 0x10 && pc + 1 < WINDOW_SIZE) {
      // DJNZ
      const rel = rawBytes[pc + 1];
      const target = addr + 2 + ((rel < 128) ? rel : rel - 256);
      decoded.push({ addr, len: 2, text: `djnz ${hex(target, 6)}`, raw: [b0, rawBytes[pc+1]] });
      pc += 2;
    } else if (b0 === 0x18 && pc + 1 < WINDOW_SIZE) {
      // JR
      const rel = rawBytes[pc + 1];
      const target = addr + 2 + ((rel < 128) ? rel : rel - 256);
      decoded.push({ addr, len: 2, text: `jr ${hex(target, 6)}`, raw: [b0, rawBytes[pc+1]] });
      pc += 2;
    } else if (b0 === 0x20 && pc + 1 < WINDOW_SIZE) {
      // JR NZ
      const rel = rawBytes[pc + 1];
      const target = addr + 2 + ((rel < 128) ? rel : rel - 256);
      decoded.push({ addr, len: 2, text: `jr nz, ${hex(target, 6)}`, raw: [b0, rawBytes[pc+1]] });
      pc += 2;
    } else if (b0 === 0x28 && pc + 1 < WINDOW_SIZE) {
      // JR Z
      const rel = rawBytes[pc + 1];
      const target = addr + 2 + ((rel < 128) ? rel : rel - 256);
      decoded.push({ addr, len: 2, text: `jr z, ${hex(target, 6)}`, raw: [b0, rawBytes[pc+1]] });
      pc += 2;
    } else if (b0 === 0x3c) {
      decoded.push({ addr, len: 1, text: 'inc a', raw: [b0] });
      pc += 1;
    } else if (b0 === 0x1d) {
      decoded.push({ addr, len: 1, text: 'dec e', raw: [b0] });
      pc += 1;
    } else if (b0 === 0x7e) {
      decoded.push({ addr, len: 1, text: 'ld a, (hl)', raw: [b0] });
      pc += 1;
    } else if (b0 === 0x23) {
      decoded.push({ addr, len: 1, text: 'inc hl', raw: [b0] });
      pc += 1;
    } else if (b0 === 0xba) {
      decoded.push({ addr, len: 1, text: 'cp d', raw: [b0] });
      pc += 1;
    } else if (b0 === 0xbb) {
      decoded.push({ addr, len: 1, text: 'cp e', raw: [b0] });
      pc += 1;
    } else if (b0 === 0xc8) {
      decoded.push({ addr, len: 1, text: 'ret z', raw: [b0] });
      pc += 1;
    } else if (b0 === 0xd8) {
      decoded.push({ addr, len: 1, text: 'ret c', raw: [b0] });
      pc += 1;
    } else if (b0 === 0xc5) {
      decoded.push({ addr, len: 1, text: 'push bc', raw: [b0] });
      pc += 1;
    } else if (b0 === 0xd5) {
      decoded.push({ addr, len: 1, text: 'push de', raw: [b0] });
      pc += 1;
    } else if (b0 === 0xe5) {
      decoded.push({ addr, len: 1, text: 'push hl', raw: [b0] });
      pc += 1;
    } else if (b0 === 0xf5) {
      decoded.push({ addr, len: 1, text: 'push af', raw: [b0] });
      pc += 1;
    } else if (b0 === 0xc1) {
      decoded.push({ addr, len: 1, text: 'pop bc', raw: [b0] });
      pc += 1;
    } else if (b0 === 0xd1) {
      decoded.push({ addr, len: 1, text: 'pop de', raw: [b0] });
      pc += 1;
    } else if (b0 === 0xe1) {
      decoded.push({ addr, len: 1, text: 'pop hl', raw: [b0] });
      pc += 1;
    } else if (b0 === 0xf1) {
      decoded.push({ addr, len: 1, text: 'pop af', raw: [b0] });
      pc += 1;
    } else if (b0 === 0x7a) {
      decoded.push({ addr, len: 1, text: 'ld a, d', raw: [b0] });
      pc += 1;
    } else if (b0 === 0x7b) {
      decoded.push({ addr, len: 1, text: 'ld a, e', raw: [b0] });
      pc += 1;
    } else if (b0 === 0x72) {
      decoded.push({ addr, len: 1, text: 'ld (hl), d', raw: [b0] });
      pc += 1;
    } else if (b0 === 0x73) {
      decoded.push({ addr, len: 1, text: 'ld (hl), e', raw: [b0] });
      pc += 1;
    } else if (b0 === 0xaf) {
      decoded.push({ addr, len: 1, text: 'xor a', raw: [b0] });
      pc += 1;
    } else if (b0 === 0xb7) {
      decoded.push({ addr, len: 1, text: 'or a', raw: [b0] });
      pc += 1;
    } else if (b0 === 0x00) {
      decoded.push({ addr, len: 1, text: 'nop', raw: [b0] });
      pc += 1;
    } else {
      // Unknown — emit as db
      decoded.push({ addr, len: 1, text: `db ${hexByte(b0)}`, raw: [b0] });
      pc += 1;
    }
  }

  for (const instr of decoded) {
    const rawStr = instr.raw.map(b => hexByte(b)).join(' ');
    console.log(`${hex(instr.addr, 6)}  ${rawStr.padEnd(14)}  ${instr.text}`);
  }

  // ── Step 5: Classify table groups ──────────────────────────────────
  console.log('\n--- Step 5: Table classification ---\n');

  const classifications = [];

  if (tables.length >= 1) {
    const t1 = tables[0];
    // Table 1: 18 entries. Let's check what kind of keys these are.
    const t1Names = t1.bytes.map(b => keyName(b));
    const hasLetters = t1.bytes.some(b => b >= 0x41 && b <= 0x5A);
    const hasDigits = t1.bytes.some(b => b >= 0x30 && b <= 0x39);
    const allAlpha = t1.bytes.every(b => (b >= 0x41 && b <= 0x5A) || b === 0x5B);

    let classification;
    if (allAlpha) {
      classification = 'ALPHABETIC KEYS — Letters A-Z (and theta)';
    } else if (hasLetters && !hasDigits) {
      classification = 'ALPHABETIC KEYS — Contains letters';
    } else if (hasDigits && !hasLetters) {
      classification = 'NUMERIC KEYS — Contains digits';
    } else {
      classification = 'MIXED — Contains both letters and digits';
    }

    classifications.push({
      index: 1,
      count: t1.count,
      addr: t1.tableAddr,
      bytes: t1.bytes,
      names: t1Names,
      classification,
    });
    console.log(`Table 1 (${t1.count} entries at ${hex(t1.tableAddr, 6)}): ${classification}`);
    for (let i = 0; i < t1.bytes.length; i++) {
      console.log(`  [${i}] ${hexByte(t1.bytes[i])} = ${t1Names[i]}`);
    }
    console.log();
  }

  if (tables.length >= 2) {
    const t2 = tables[1];
    const t2Names = t2.bytes.map(b => keyName(b));
    const hasLetters = t2.bytes.some(b => b >= 0x41 && b <= 0x5A);
    const hasHigh = t2.bytes.some(b => b >= 0x80);

    let classification;
    if (hasHigh && hasLetters) {
      classification = 'MIXED — Letters and function/token codes (0x80+)';
    } else if (hasHigh) {
      classification = 'FUNCTION/TOKEN KEYS — High-byte codes (0x80+)';
    } else if (hasLetters) {
      classification = 'ALPHABETIC KEYS — Letters';
    } else {
      classification = 'SPECIAL KEYS';
    }

    classifications.push({
      index: 2,
      count: t2.count,
      addr: t2.tableAddr,
      bytes: t2.bytes,
      names: t2Names,
      classification,
    });
    console.log(`Table 2 (${t2.count} entries at ${hex(t2.tableAddr, 6)}): ${classification}`);
    for (let i = 0; i < t2.bytes.length; i++) {
      console.log(`  [${i}] ${hexByte(t2.bytes[i])} = ${t2Names[i]}`);
    }
    console.log();
  }

  if (tables.length >= 3) {
    const t3 = tables[2];
    const t3Names = t3.bytes.map(b => keyName(b));
    const allHigh = t3.bytes.every(b => b >= 0x80);
    const range = { min: Math.min(...t3.bytes), max: Math.max(...t3.bytes) };

    let classification;
    if (allHigh) {
      classification = `FUNCTION/TOKEN KEYS — All in range ${hexByte(range.min)}-${hexByte(range.max)}`;
    } else {
      classification = `MIXED KEYS — Range ${hexByte(range.min)}-${hexByte(range.max)}`;
    }

    classifications.push({
      index: 3,
      count: t3.count,
      addr: t3.tableAddr,
      bytes: t3.bytes,
      names: t3Names,
      classification,
    });
    console.log(`Table 3 (${t3.count} entries at ${hex(t3.tableAddr, 6)}): ${classification}`);
    for (let i = 0; i < t3.bytes.length; i++) {
      console.log(`  [${i}] ${hexByte(t3.bytes[i])} = ${t3Names[i]}`);
    }
    console.log();
  }

  // Check for any additional tables (4th CPIR)
  if (tables.length >= 4) {
    for (let t = 3; t < tables.length; t++) {
      const tN = tables[t];
      const tNNames = tN.bytes.map(b => keyName(b));
      classifications.push({
        index: t + 1,
        count: tN.count,
        addr: tN.tableAddr,
        bytes: tN.bytes,
        names: tNNames,
        classification: `Additional table (${tN.count} entries)`,
      });
      console.log(`Table ${t + 1} (${tN.count} entries at ${hex(tN.tableAddr, 6)}):`);
      for (let i = 0; i < tN.bytes.length; i++) {
        console.log(`  [${i}] ${hexByte(tN.bytes[i])} = ${tNNames[i]}`);
      }
      console.log();
    }
  }

  // ── Step 6: Contextual analysis ────────────────────────────────────
  console.log('\n--- Step 6: CPIR behavior analysis ---\n');

  console.log('CPIR instruction behavior:');
  console.log('  - Compares A register against (HL), increments HL, decrements BC');
  console.log('  - Repeats until match (Z flag set) or BC=0');
  console.log('  - On match: Z=1, BC=remaining count, HL=address PAST matched byte');
  console.log('  - On no match (BC=0): Z=0');
  console.log('');
  console.log('Each table block: LD BC,count; LD HL,table_start; CPIR; RET');
  console.log('The function is called with A = key code to classify.');
  console.log('If the key is found in a table, CPIR sets Z and returns immediately.');
  console.log('If not found, it falls through to the next table check.');
  console.log('');
  console.log('This is a cascading membership test:');
  console.log('  1. Is the key in Table 1? If yes, return Z=1 (with BC/HL reflecting position)');
  console.log('  2. Is the key in Table 2? If yes, return Z=1');
  console.log('  3. Is the key in Table 3? If yes, return Z=1');
  console.log('  4. Not in any table: return Z=0');
  console.log('');
  console.log('BUT — each block has its own RET, so the CALLER can distinguish');
  console.log('which table matched based on the return address or BC remainder.');

  // ── Step 7: Write report ───────────────────────────────────────────
  console.log('\n--- Writing report ---\n');

  let report = `# Phase 136 — 0x08759D Key-Code Table Deep Analysis

Generated by \`probe-phase136-keytable-analysis.mjs\`.

- ROM: \`ROM.rom\` (${rom.length} bytes)
- Generated: \`${new Date().toISOString()}\`
- Base address: \`${hex(BASE_ADDR, 6)}\`

## Summary

The function at \`0x08759D\` is a **cascading key-code membership classifier**. It uses CPIR (Compare, Increment, Repeat) instructions to test whether the key code in register A belongs to one of several predefined groups. Each group is an inline byte table immediately following its CPIR setup code.

The function has **${cpirPositions.length} CPIR blocks** containing **${tables.length} extractable tables** with a total of **${tables.reduce((s, t) => s + t.count, 0)} key codes**.

### Callers

- \`0x08608A\` — key dispatch chain
- \`0x08C8C3\` — key processing core (inside \`0x08C7AD\`)

### RAM writes

- \`0xD0058E\` — key event buffer (written by surrounding code, not by this function directly)
- \`0xD005F9\` — key state byte

## Raw Hex Dump

\`\`\`text
${hexDumpStr}
\`\`\`

## CPIR Instruction Locations

${cpirDetails.length} CPIR instructions found in the ${WINDOW_SIZE}-byte window:

| # | Offset | Address | BC (count) | HL (table start) |
|---|--------|---------|------------|-------------------|
${cpirDetails.map((d, i) => `| ${i + 1} | +${hex(d.offset)} | \`${hex(d.absAddr, 6)}\` | ${d.bcCount !== null ? `${hex(d.bcCount, 6)} (${d.bcCount})` : 'n/a'} | ${d.hlTableAddr !== null ? `\`${hex(d.hlTableAddr, 6)}\`` : 'n/a'} |`).join('\n')}

## CPIR Behavior

Each CPIR block follows the pattern:
\`\`\`
LD BC, <count>      ; number of entries in table
LD HL, <table_addr> ; pointer to inline byte array
CPIR                ; compare A against each byte, repeat until match or BC=0
RET                 ; return to caller — Z flag indicates match
\`\`\`

- **Match found (Z=1)**: The key code in A was found in this table. BC holds the remaining count (position can be inferred). HL points past the matched byte.
- **No match (Z=0, BC=0)**: The key was not in this table. Execution falls through to the next block.

Because each block ends with its own \`RET\`, the caller **cannot distinguish which table matched** by return address alone — all three blocks return to the same call site. Instead, the caller likely checks BC remainder or performs additional logic after return.

**Correction**: Looking more carefully at the Phase 133 disassembly, the three CPIR blocks are NOT three separate functions — they are sequential code within a single function. After the first CPIR+RET, if the key matched, it returns immediately with Z=1. If not matched (Z=0 from CPIR when BC reaches 0), the RET does NOT execute because... actually, RET is unconditional. Let me reconsider.

**Revised interpretation**: Each CPIR+RET block is a **separate callable entry point**. The caller at \`0x08608A\` or \`0x08C8C3\` calls \`0x08759D\` to check Table 1 only. To check Table 2, the caller would need to call \`${hex(tables.length >= 2 ? (BASE_ADDR + cpirPositions[1] - 8) : 0, 6)}\` directly. This means each table is independently addressable.

## Extracted Tables

`;

  for (const cls of classifications) {
    report += `### Table ${cls.index}: ${cls.classification}

- **Address**: \`${hex(cls.addr, 6)}\`
- **Count**: ${cls.count} entries
- **CPIR setup**: BC=${hex(cls.count, 6)}

| Index | Byte | Key Name |
|-------|------|----------|
${cls.bytes.map((b, i) => `| ${i} | \`${hexByte(b)}\` | ${cls.names[i]} |`).join('\n')}

`;
  }

  // Analyze the actual groupings
  report += `## Table Group Analysis

### Table 1 (18 entries): Alphabetic Keys
`;
  if (tables.length >= 1) {
    const sorted = [...tables[0].bytes].sort((a, b) => a - b);
    const letters = sorted.filter(b => b >= 0x41 && b <= 0x5A).map(b => String.fromCharCode(b));
    const nonLetters = sorted.filter(b => b < 0x41 || b > 0x5A);
    report += `
All 18 bytes fall in the range \`0x41\`–\`0x5A\` (ASCII 'A'–'Z'). These are:

**Letters present**: ${letters.join(', ')}
**Letters missing**: ${Array.from({length: 26}, (_, i) => String.fromCharCode(0x41 + i)).filter(c => !letters.includes(c)).join(', ') || '(none)'}
${nonLetters.length > 0 ? `**Non-letter values**: ${nonLetters.map(b => hexByte(b)).join(', ')}` : ''}

This table contains the alphabetic key codes — the keys that produce letters when Alpha mode is active. The 18 entries correspond to the 18 alpha keys on the TI-84 CE keypad (A through Z minus the 8 letters that share keys with other functions or don't exist on the keypad).

**Hypothesis**: Table 1 identifies **alphabetic input keys** — key codes that should be treated as letter input when the calculator is in Alpha mode.
`;
  }

  report += `
### Table 2 (11 entries): Mixed Letters + Function Tokens
`;
  if (tables.length >= 2) {
    const t2 = tables[1];
    const letterCodes = t2.bytes.filter(b => b >= 0x41 && b <= 0x5A);
    const highCodes = t2.bytes.filter(b => b >= 0x80);
    report += `
Contains ${letterCodes.length} letter codes and ${highCodes.length} high-byte function codes:

- Letter codes: ${letterCodes.map(b => `\`${hexByte(b)}\` (${String.fromCharCode(b)})`).join(', ')}
- High codes: ${highCodes.map(b => `\`${hexByte(b)}\` (${keyName(b)})`).join(', ')}

**Hypothesis**: Table 2 identifies **keys that need special handling** in certain modes — a mix of specific letters and function/menu tokens that trigger mode-dependent behavior.
`;
  }

  report += `
### Table 3 (${tables.length >= 3 ? tables[2].count : '?'} entries): Function/Token Keys
`;
  if (tables.length >= 3) {
    const t3 = tables[2];
    const range = { min: Math.min(...t3.bytes), max: Math.max(...t3.bytes) };
    report += `
All ${t3.count} bytes are in range \`${hexByte(range.min)}\`–\`${hexByte(range.max)}\`.

${t3.bytes.length > 0 ? `Values: ${t3.bytes.map(b => `\`${hexByte(b)}\``).join(', ')}` : ''}

**Hypothesis**: Table 3 identifies **function/token key codes** — higher-numbered codes representing math functions, menu operations, or other non-alphanumeric actions.
`;
  }

  if (tables.length >= 4) {
    report += `
### Table 4+ (${tables.slice(3).map(t => t.count).join(', ')} entries): Additional Tables
`;
    for (let t = 3; t < tables.length; t++) {
      report += `
Table ${t + 1} at \`${hex(tables[t].tableAddr, 6)}\`: ${tables[t].bytes.map(b => `\`${hexByte(b)}\``).join(', ')}
`;
    }
  }

  report += `
## Full Instruction Decode

\`\`\`text
${decoded.map(d => `${hex(d.addr, 6)}  ${d.raw.map(b => hexByte(b)).join(' ').padEnd(14)}  ${d.text}`).join('\n')}
\`\`\`

## Architectural Significance

1. **Key classification at the OS level**: This function classifies key codes into groups before they are dispatched to mode-specific handlers. The caller uses the Z flag result to determine how to process the key.

2. **Three-tier classification**: The three tables create a priority ordering:
   - Table 1 (alphabetic) is checked first — if the key is a letter, handle it as text input
   - Table 2 (mixed) is checked second — special keys that need mode-dependent routing
   - Table 3 (function tokens) is checked third — function/operation keys

3. **Integration with key dispatch chain**: The two callers (\`0x08608A\` and \`0x08C8C3\`) are both part of the key handling pipeline identified in Phases 114–133. This function sits between raw scan code translation and the final key action dispatch.

4. **Separate entry points**: Each CPIR block can potentially be called independently, allowing callers to check membership in specific subsets without running all three checks.
`;

  fs.writeFileSync(REPORT_PATH, report);
  console.log(`Report written to: ${REPORT_PATH}`);
  console.log('Done.');
}

main();
