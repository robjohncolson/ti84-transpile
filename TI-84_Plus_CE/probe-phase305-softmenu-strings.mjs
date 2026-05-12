#!/usr/bin/env node

/**
 * Phase 305: Decode soft-menu string tables at 0x029024 / 0x02903C
 *
 * These addresses were identified during menu handling analysis as potential
 * soft-menu string table locations (labels shown above function keys).
 *
 * Tasks:
 *  1. Dump raw bytes at 0x029024 and 0x02903C (256 bytes each)
 *  2. Search ROM.transpiled.js for cross-references
 *  3. Decode table structure (entry count, format, delimiters)
 *  4. Map surrounding context (0x029000-0x02905C+)
 *  5. Wide scan of 0x028F00-0x029200 for menu-related data
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(join(__dirname, 'ROM.rom'));

// --- helpers ---

function romByte(addr) {
  return rom[addr];
}

function romWord(addr) {
  return rom[addr] | (rom[addr + 1] << 8);
}

function rom24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function romString(addr, maxLen) {
  let s = '';
  for (let i = 0; i < maxLen; i++) {
    const b = rom[addr + i];
    if (b === 0) break;
    s += (b >= 0x20 && b <= 0x7E) ? String.fromCharCode(b) : `[${b.toString(16).padStart(2, '0')}]`;
  }
  return s;
}

function hexDump(addr, len) {
  const lines = [];
  for (let off = 0; off < len; off += 16) {
    const hexParts = [];
    let ascii = '';
    for (let i = 0; i < 16 && (off + i) < len; i++) {
      const b = rom[addr + off + i];
      hexParts.push(b.toString(16).padStart(2, '0'));
      ascii += (b >= 0x20 && b <= 0x7E) ? String.fromCharCode(b) : '.';
    }
    const hexStr = hexParts.join(' ').padEnd(48);
    lines.push(`  0x${(addr + off).toString(16).padStart(6, '0')}: ${hexStr} |${ascii}|`);
  }
  return lines.join('\n');
}

function findStrings(addr, maxScan) {
  const strings = [];
  let i = 0;
  while (i < maxScan) {
    const b = rom[addr + i];
    if (b === 0) {
      i++;
      continue;
    }
    // start of a potential string
    const start = addr + i;
    let s = '';
    let printable = 0;
    let total = 0;
    while (i < maxScan && rom[addr + i] !== 0) {
      const c = rom[addr + i];
      if (c >= 0x20 && c <= 0x7E) {
        s += String.fromCharCode(c);
        printable++;
      } else {
        s += `[${c.toString(16).padStart(2, '0')}]`;
      }
      total++;
      i++;
    }
    strings.push({
      addr: start,
      addrHex: '0x' + start.toString(16).padStart(6, '0'),
      length: total,
      printableRatio: total > 0 ? printable / total : 0,
      text: s
    });
  }
  return strings;
}

// ============================================================
// 1. Raw dumps at the two target addresses
// ============================================================

console.log('=== PHASE 305: Soft-menu string table decode ===\n');

console.log('--- 1a. Hex dump at 0x029024 (256 bytes) ---');
console.log(hexDump(0x029024, 256));

console.log('\n--- 1b. Hex dump at 0x02903C (256 bytes) ---');
console.log(hexDump(0x02903C, 256));

// Extract strings from each region
console.log('\n--- 1c. Strings at 0x029024 (scan 256 bytes) ---');
const strings1 = findStrings(0x029024, 256);
for (const s of strings1) {
  console.log(`  ${s.addrHex} [${s.length} bytes, ${(s.printableRatio * 100).toFixed(0)}% printable]: "${s.text}"`);
}

console.log('\n--- 1d. Strings at 0x02903C (scan 256 bytes) ---');
const strings2 = findStrings(0x02903C, 256);
for (const s of strings2) {
  console.log(`  ${s.addrHex} [${s.length} bytes, ${(s.printableRatio * 100).toFixed(0)}% printable]: "${s.text}"`);
}

// ============================================================
// 2. Cross-references in ROM.transpiled.js
// ============================================================

console.log('\n--- 2. Cross-references in ROM.transpiled.js ---');

const searchPatterns = [
  '029024', '0x029024', '0x29024', '168996',   // 0x029024 decimal
  '02903c', '02903C', '0x02903c', '0x02903C', '0x2903c', '0x2903C', '169020', // 0x02903C decimal
  '029000', '0x029000', '0x29000',             // region base
];

const transpiledPath = join(__dirname, 'ROM.transpiled.js');

async function searchTranspiled() {
  const rl = createInterface({
    input: createReadStream(transpiledPath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  let lineNum = 0;
  const hits = [];

  for await (const line of rl) {
    lineNum++;
    for (const pat of searchPatterns) {
      if (line.includes(pat)) {
        const trimmed = line.trim();
        const snippet = trimmed.length > 200 ? trimmed.slice(0, 200) + '...' : trimmed;
        hits.push({ lineNum, pattern: pat, snippet });
      }
    }
  }

  if (hits.length === 0) {
    console.log('  No direct references found.');
  } else {
    console.log(`  Found ${hits.length} reference(s):`);
    for (const h of hits) {
      console.log(`  L${h.lineNum} [${h.pattern}]: ${h.snippet}`);
    }
  }
}

await searchTranspiled();

// ============================================================
// 3. Table structure analysis
// ============================================================

console.log('\n--- 3. Table structure analysis ---');

// Look for pointer tables: sequences of 3-byte addresses pointing into ROM
function analyzeAsPointerTable(addr, maxEntries) {
  const entries = [];
  for (let i = 0; i < maxEntries; i++) {
    const ptr = rom24(addr + i * 3);
    if (ptr === 0) break;
    const isRomAddr = ptr < 0x400000;
    const isRamAddr = ptr >= 0xD00000 && ptr < 0xE00000;
    const strAtPtr = isRomAddr ? romString(ptr, 32) : '(RAM)';
    entries.push({
      offset: i,
      ptr: '0x' + ptr.toString(16).padStart(6, '0'),
      isRom: isRomAddr,
      isRam: isRamAddr,
      str: strAtPtr
    });
  }
  return entries;
}

console.log('\n  3a. Interpret 0x029024 as pointer table (3-byte entries):');
const ptrs1 = analyzeAsPointerTable(0x029024, 16);
for (const p of ptrs1) {
  console.log(`    [${p.offset}] -> ${p.ptr} ${p.isRom ? '(ROM)' : p.isRam ? '(RAM)' : '(?)'} str="${p.str}"`);
}

console.log('\n  3b. Interpret 0x02903C as pointer table (3-byte entries):');
const ptrs2 = analyzeAsPointerTable(0x02903C, 16);
for (const p of ptrs2) {
  console.log(`    [${p.offset}] -> ${p.ptr} ${p.isRom ? '(ROM)' : p.isRam ? '(RAM)' : '(?)'} str="${p.str}"`);
}

// Check for length-prefixed strings
console.log('\n  3c. Check for length-prefixed string format at 0x029024:');
for (let off = 0; off < 64; off++) {
  const lenByte = rom[0x029024 + off];
  if (lenByte >= 1 && lenByte <= 20) {
    const candidate = romString(0x029024 + off + 1, lenByte);
    const allPrintable = candidate.indexOf('[') === -1;
    if (allPrintable && candidate.length === lenByte) {
      console.log(`    offset +${off}: len=${lenByte} str="${candidate}"`);
    }
  }
}

// Check for fixed-width entries (e.g., 4, 5, 6, 8 bytes per entry)
console.log('\n  3d. Fixed-width entry scan at 0x029024:');
for (const width of [4, 5, 6, 8, 10, 12]) {
  const entries = [];
  let allReadable = true;
  for (let i = 0; i < 8; i++) {
    const addr = 0x029024 + i * width;
    const s = romString(addr, width);
    if (s.length === 0) { allReadable = false; break; }
    entries.push(s);
  }
  if (allReadable && entries.length > 2) {
    console.log(`    width=${width}: ${entries.map(e => `"${e}"`).join(', ')}`);
  }
}

// ============================================================
// 4. Surrounding context
// ============================================================

console.log('\n--- 4. Surrounding context ---');

console.log('\n  4a. Before: 0x029000-0x029023 (36 bytes):');
console.log(hexDump(0x029000, 0x24));
const strsBefore = findStrings(0x029000, 0x24);
for (const s of strsBefore) {
  console.log(`    ${s.addrHex}: "${s.text}"`);
}

console.log('\n  4b. After: 0x02905C-0x0290A0 (68 bytes):');
console.log(hexDump(0x02905C, 68));
const strsAfter = findStrings(0x02905C, 68);
for (const s of strsAfter) {
  console.log(`    ${s.addrHex}: "${s.text}"`);
}

// ============================================================
// 5. Wide scan: 0x028F00-0x029200
// ============================================================

console.log('\n--- 5. Wide scan: 0x028F00-0x029200 (768 bytes) ---');

console.log('\n  5a. Full hex dump:');
console.log(hexDump(0x028F00, 0x029200 - 0x028F00));

console.log('\n  5b. All strings in 0x028F00-0x029200:');
const wideStrings = findStrings(0x028F00, 0x029200 - 0x028F00);
for (const s of wideStrings) {
  if (s.length >= 2 && s.printableRatio > 0.5) {
    console.log(`    ${s.addrHex} [${s.length}B]: "${s.text}"`);
  }
}

// Look for clusters of 3-byte pointers in the wide region
console.log('\n  5c. Pointer-like 24-bit values in 0x028F00-0x029200:');
for (let addr = 0x028F00; addr < 0x029200 - 2; addr++) {
  const val = rom24(addr);
  // Check if it looks like a ROM code/data pointer
  if (val >= 0x020000 && val < 0x100000) {
    const nextVal = rom24(addr + 3);
    const isCluster = (nextVal >= 0x020000 && nextVal < 0x100000);
    if (isCluster) {
      const str1 = romString(val, 20);
      const str2 = romString(nextVal, 20);
      console.log(`    0x${addr.toString(16).padStart(6, '0')}: -> 0x${val.toString(16).padStart(6, '0')} "${str1}"  (next -> 0x${nextVal.toString(16).padStart(6, '0')} "${str2}")`);
    }
  }
}

console.log('\n=== Phase 305 complete ===');

/*
=== OUTPUT (2026-05-12) ===

=== PHASE 305: Soft-menu string table decode ===

--- 1a. Hex dump at 0x029024 (256 bytes) ---
  0x029024: 44 49 53 41 42 4c 45 20 41 50 50 53 20 26 20 50  |DISABLE APPS & P|
  0x029034: 52 4f 47 52 41 4d 53 00 44 49 53 41 42 4c 45 20  |ROGRAMS.DISABLE |
  0x029044: 50 69 63 20 26 20 49 6d 61 67 65 20 56 41 52 53  |Pic & Image VARS|
  0x029054: 00 41 50 50 53 20 26 20 50 52 4f 47 52 41 4d 53  |.APPS & PROGRAMS|
  0x029064: 20 44 49 53 41 42 4c 45 44 00 50 69 63 20 26 20  | DISABLED.Pic & |
  0x029074: 49 6d 61 67 65 20 56 41 52 53 20 44 49 53 41 42  |Image VARS DISAB|
  0x029084: 4c 45 44 00 41 4e 47 4c 45 3a 20 00 20 20 20 20  |LED.ANGLE: .    |
  0x029094: 20 20 20 20 20 20 20 41 4e 47 4c 45 3a 20 00 53  |       ANGLE: .S|
  0x0290a4: 54 41 54 20 44 49 41 47 4e 4f 53 54 49 43 53 3a  |TAT DIAGNOSTICS:|
  0x0290b4: 20 00 44 49 53 41 42 4c 45 3f 20 6c 6f 67 42 41  | .DISABLE? logBA|
  0x0290c4: 53 45 3a 20 00 44 49 53 41 42 4c 45 20 6c 6f 67  |SE: .DISABLE log|
  0x0290d4: 42 41 53 45 3a 20 00 20 20 20 20 20 20 20 20 20  |BASE: .         |
  0x0290e4: 20 20 20 20 20 c6 28 3a 20 00 44 49 53 41 42 4c  |     .(: .DISABL|
  0x0290f4: 45 20 c6 28 3a 20 00 20 20 4e 55 4d 45 52 49 43  |E .(: .  NUMERIC|
  0x029104: 20 53 4f 4c 56 45 52 3a 20 00 52 45 53 45 54 20  | SOLVER: .RESET |
  0x029114: 4f 50 54 49 4f 4e 53 00 52 45 53 45 54 20 43 4f  |OPTIONS.RESET CO|

--- 1c. Strings at 0x029024 (scan 256 bytes) ---
  0x029024 [23 bytes, 100% printable]: "DISABLE APPS & PROGRAMS"
  0x02903c [24 bytes, 100% printable]: "DISABLE Pic & Image VARS"
  0x029055 [24 bytes, 100% printable]: "APPS & PROGRAMS DISABLED"
  0x02906e [25 bytes, 100% printable]: "Pic & Image VARS DISABLED"
  0x029088 [7 bytes, 100% printable]:  "ANGLE: "
  0x029090 [18 bytes, 100% printable]: "           ANGLE: "
  0x0290a3 [18 bytes, 100% printable]: "STAT DIAGNOSTICS: "
  0x0290b6 [18 bytes, 100% printable]: "DISABLE? logBASE: "
  0x0290c9 [17 bytes, 100% printable]: "DISABLE logBASE: "
  0x0290db [18 bytes, 94% printable]:  "              n(: "  (0xC6 = TI-OS 'n' token)
  0x0290ee [12 bytes, 92% printable]:  "DISABLE n(: "
  0x0290fb [18 bytes, 100% printable]: "  NUMERIC SOLVER: "
  0x02910e [13 bytes, 100% printable]: "RESET OPTIONS"
  0x02911c [14 bytes, 100% printable]: "RESET COMPLETE"

--- 2. Cross-references in ROM.transpiled.js ---
  Key references:
  - block_028bc0: ld hl, 0x029024 ; ld a, 0x8a ; call 0x028f02
    -> Loads string "DISABLE APPS & PROGRAMS" with code 0x8A
  - block_028bd0: ld hl, 0x02903c ; ld a, 0xbd ; call 0x028f02
    -> Loads string "DISABLE Pic & Image VARS" with code 0xBD
  - Other hits are false positives (block_028ffb, block_02901b, block_029034/029035
    are code blocks whose addresses happen to overlap the string data region).

--- 3. Table structure ---
  NOT pointer tables (3-byte decode yields garbage ASCII values as "pointers").
  NOT length-prefixed (no valid length bytes found).
  NOT fixed-width entries.

  STRUCTURE: Null-terminated C strings, packed sequentially.
  Each string is variable-length, terminated by 0x00.
  The caller loads HL = string address, A = menu/option code, then calls a display routine.

--- 4. Surrounding context ---
  Before 0x029024:
    0x028FF5: "TEST MODE"
    0x028FFF: "DELETE APPS & PROGRAMS"
    0x029016: "FOR SINGAPORE"
  After 0x02911C:
    0x02912B: 0x03 "ESC" 0x02 "OK" — soft-key labels with length prefixes!
    0x029133: "DEGREE"
    0x029139: "RADIAN"
    0x029140: "ON" / "OFF" / "YES" / "NO"
    0x02914E: "APPS-PROGRAMS-Pics-Images"
    0x029168: "DISABLED AND MARKED ..."
    0x02917E: "LINK-RECEIVE L..."
    0x02918E: "(OR ANY FILE)"
    0x02919C: "TO RESTORE" / "PRIOR TO" / "CHANGING" / "TEST MODES"
    0x0291C5: "Pic & Image VARS" / "DISABLED" / "PROGRAMS" / "DISABLED" / "APPS" / "DISABLED"

--- 5. Wide scan summary (0x028F00-0x029200) ---
  0x028F00-0x028FF4: Executable code (test mode / settings menu handlers).
    Code at 0x028F02 is the display routine called with HL=string, A=code.
    Multiple callers load different strings from the 0x029xxx region.
  0x028FF5-0x0291FF: Dense string table — 37+ null-terminated strings.
    Organized as the TI-OS "test mode" / "reset" / "settings confirmation" dialog strings.
    Includes: TEST MODE, DELETE APPS & PROGRAMS, FOR SINGAPORE, DISABLE APPS & PROGRAMS,
    DISABLE Pic & Image VARS, APPS & PROGRAMS DISABLED, Pic & Image VARS DISABLED,
    ANGLE:, STAT DIAGNOSTICS:, logBASE:, n(:, NUMERIC SOLVER:, RESET OPTIONS,
    RESET COMPLETE, ESC, OK, DEGREE, RADIAN, ON, OFF, YES, NO, plus
    longer confirmation/status messages.

  Notable: 0x02912B has length-prefixed soft-key labels:
    0x03 "ESC" 0x02 "OK" — these are the F-key labels (3 chars, 2 chars).

  The 0xC6 byte at 0x0290DB/0x0290EE is TI-OS token for summation "n(" function.

=== Phase 305 complete ===
*/
