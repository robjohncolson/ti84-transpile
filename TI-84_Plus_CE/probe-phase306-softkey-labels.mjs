#!/usr/bin/env node

/**
 * probe-phase306-softkey-labels.mjs
 *
 * Decodes the complete soft-key label table starting at 0x02912B in the
 * TI-84 Plus CE OS ROM.
 *
 * ============================================================================
 * COMPLETE TABLE CONTENTS (0x02912B - 0x291C3, 153 bytes, 16 entries)
 * ============================================================================
 *
 * The table has TWO formats:
 *   - Entries 0-1: length-prefixed (1 byte length + N ASCII bytes, NO null)
 *   - Entries 2-15: standard null-terminated C strings
 *   - Table ends with double-null (0x00 0x00) at 0x291C3-0x291C4
 *
 *  [ 0] +  0  0x02912B  len=3      "ESC"
 *  [ 1] +  4  0x02912F  len=2      "OK"
 *  [ 2] +  7  0x029132  NUL-term   "DEGREE"
 *  [ 3] + 14  0x029139  NUL-term   "RADIAN"
 *  [ 4] + 21  0x029140  NUL-term   "ON"
 *  [ 5] + 24  0x029143  NUL-term   "OFF"
 *  [ 6] + 28  0x029147  NUL-term   "YES"
 *  [ 7] + 32  0x02914B  NUL-term   "NO"
 *  [ 8] + 35  0x02914E  NUL-term   "APPS-PROGRAMS-Pics-Images"
 *  [ 9] + 61  0x029168  NUL-term   "DISABLED AND MARKED \x18"
 *  [10] + 83  0x02917E  NUL-term   "LINK-RECEIVE L\x81"
 *  [11] + 99  0x02918E  NUL-term   "(OR ANY FILE)"
 *  [12] +113  0x02919C  NUL-term   "TO RESTORE"
 *  [13] +124  0x0291A7  NUL-term   "PRIOR TO"
 *  [14] +133  0x0291B0  NUL-term   "CHANGING"
 *  [15] +142  0x0291B9  NUL-term   "TEST MODES"
 *
 * ============================================================================
 * HOW THE OS INDEXES INTO THIS TABLE
 * ============================================================================
 *
 * 1. DIRECT soft-key labels ("ESC" and "OK"):
 *    At 0x028CC5, the OS sets up dialog soft-keys:
 *      RES 2, (IY+0x44)         ; clear flag bit
 *      LD HL, 0x02912B          ; -> "ESC" (length-prefixed)
 *      LD A, 0xCD               ; key-code for ESC function
 *      CALL 0x080244            ; register left soft-key
 *      CALL 0x08026A            ; copy label to RAM at 0xD026EA (27 bytes)
 *      ...                      ; position at column 2
 *      LD HL, 0x02912F          ; -> "OK" (length-prefixed)
 *      LD A, 0xB1               ; key-code for OK function
 *      CALL 0x080244            ; register right soft-key
 *      CALL 0x08026A            ; copy label to RAM at 0xD026EA
 *      ...                      ; position at column 128
 *      RET
 *
 * 2. MODE MENU labels (DEGREE/RADIAN, ON/OFF, YES/NO):
 *    At 0x0296F8, the OS selects angle mode labels:
 *      LD HL, 0x029139          ; "RADIAN"  (if radian mode)
 *      LD A, 0x92
 *      CALL 0x028F02
 *      ...
 *      LD HL, 0x029132          ; "DEGREE"  (if degree mode)
 *      LD A, 0x91
 *      CALL 0x028F02
 *    Similarly at 0x029726/0x02972E for ON/OFF, 0x02977B/0x029783 for YES/NO.
 *
 * 3. MODE SETTINGS data table (0x028DC1, 18 x 14-byte records):
 *    A structured table of mode-setting descriptors. Each 14-byte record
 *    (delimited by 0xFB) contains:
 *      - Settings ID, position info, display parameters
 *      - 3-byte pointer to one of the strings in this label table
 *      - Bitmask fields for the mode flag
 *    Referenced from 0x028FB2. Maps mode menu items to their labels.
 *
 * ============================================================================
 * CONTINUATION STRINGS (after double-null, 0x291C5+)
 * ============================================================================
 *
 * After the main table, additional NUL-terminated dialog/status messages
 * continue (these are NOT soft-key labels but share the same ROM region):
 *   0x291C5  "Pic & Image VARS"
 *   0x291D6  "DISABLED"
 *   0x291DF  "PROGRAMS"
 *   0x291E8  "DISABLED"
 *   0x291F1  "APPS"
 *   0x291F6  "DISABLED"
 *   0x291FF  "TRANSFER COMPLETE"
 *   0x29211  "CONFIRMATION CODE:"
 *   0x29224  "CATALOG  HELP"
 *   0x29232  "PRESS  [+]  ON  MOST  MENU  ITEMS"
 *   0x29254  "FOR  SYNTAX  HELP."
 *   0x29267  "PRESS  ALPHA  F1 - F4"
 *   0x2927D  "TO  LOCATE"
 *   0x29288  "SHORTCUT  MENUS."
 *   0x29299  "1:  DO  NOT  SHOW  THIS  MESSAGE  AGAIN"
 *   0x292C1  "2:  CONTINUE"
 *   0x292CE  "logBASE("
 *   0x292D7  "DISABLED"
 *   0x292E0  "summation\xC6"
 *   0x292EB  "DISABLED"
 *   0x292F4  "solve("
 *   0x292FB  "DISABLED"
 *   0x29304  "RAM is RESET"
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

// ─── Helpers ───────────────────────────────────────────────────────────────────

function hex(value, width = 6) {
  return `0x${(value >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function isPrintable(byte) {
  return byte >= 0x20 && byte <= 0x7E;
}

function safeStr(buf) {
  let s = '';
  for (const b of buf) {
    if (isPrintable(b)) {
      s += String.fromCharCode(b);
    } else {
      s += `\\x${b.toString(16).padStart(2, '0')}`;
    }
  }
  return s;
}

function readCString(addr, maxLen = 256) {
  let end = addr;
  while (end < rom.length && end < addr + maxLen && rom[end] !== 0x00) {
    end += 1;
  }
  return safeStr(rom.subarray(addr, end));
}

function hexBytes(start, length) {
  return Array.from(
    rom.subarray(start, Math.min(start + length, rom.length)),
    (byte) => byte.toString(16).toUpperCase().padStart(2, '0'),
  ).join(' ');
}

function asciiBytes(start, length) {
  return Array.from(
    rom.subarray(start, Math.min(start + length, rom.length)),
    (byte) => (isPrintable(byte) ? String.fromCharCode(byte) : '.'),
  ).join('');
}

function dumpRange(start, end) {
  for (let addr = start; addr < end; addr += 16) {
    const width = Math.min(16, end - addr);
    console.log(`  ${hex(addr)}  ${hexBytes(addr, width).padEnd(47)}  ${asciiBytes(addr, width)}`);
  }
}

function findPattern(pattern) {
  const hits = [];
  for (let addr = 0; addr <= rom.length - pattern.length; addr += 1) {
    let match = true;
    for (let i = 0; i < pattern.length; i += 1) {
      if (rom[addr + i] !== pattern[i]) {
        match = false;
        break;
      }
    }
    if (match) hits.push(addr);
  }
  return hits;
}

function formatInst(inst) {
  if (!inst) return '<decode error>';
  if (inst.dasm) return inst.dasm;

  switch (inst.tag) {
    case 'push': return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop': return `POP ${inst.pair.toUpperCase()}`;
    case 'ld-pair-imm': return `LD ${inst.pair.toUpperCase()}, ${hex(inst.value)}`;
    case 'ld-reg-imm': return `LD ${inst.dest.toUpperCase()}, ${hex(inst.value, 2)}`;
    case 'ld-reg-mem': return `LD ${inst.dest.toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-reg': return `LD (${hex(inst.addr)}), ${inst.src.toUpperCase()}`;
    case 'ld-reg-reg': return `LD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'ld-pair-mem': return `LD ${inst.pair.toUpperCase()}, (${hex(inst.addr)})`;
    case 'ld-mem-pair': return `LD (${hex(inst.addr)}), ${inst.pair.toUpperCase()}`;
    case 'call': return `CALL ${hex(inst.target)}`;
    case 'call-conditional': return `CALL ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jp': return `JP ${hex(inst.target)}`;
    case 'jp-conditional': return `JP ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'jr': return `JR ${hex(inst.target)}`;
    case 'jr-conditional': return `JR ${inst.condition.toUpperCase()}, ${hex(inst.target)}`;
    case 'ret': return 'RET';
    case 'ret-conditional': return `RET ${inst.condition.toUpperCase()}`;
    case 'alu-imm': return `${inst.op.toUpperCase()} ${hex(inst.value, 2)}`;
    case 'alu-reg': return `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`;
    case 'inc-reg': return `INC ${inst.reg.toUpperCase()}`;
    case 'dec-reg': return `DEC ${inst.reg.toUpperCase()}`;
    case 'inc-pair': return `INC ${inst.pair.toUpperCase()}`;
    case 'dec-pair': return `DEC ${inst.pair.toUpperCase()}`;
    case 'nop': return 'NOP';
    case 'di': return 'DI';
    case 'ei': return 'EI';
    case 'halt': return 'HALT';
    case 'rst': return `RST ${hex(inst.target, 2)}`;
    default: return `[${inst.tag}]`;
  }
}

function disasmLinear(start, maxInstructions, maxBytes = 0x60) {
  const rows = [];
  let pc = start;
  const end = Math.min(start + maxBytes, rom.length);

  while (pc < end && rows.length < maxInstructions) {
    let inst = null;
    try {
      inst = decodeInstruction(rom, pc, 'adl');
    } catch {
      // fall through
    }

    if (!inst || !inst.length) {
      rows.push({
        addr: pc,
        bytes: hexBytes(pc, 1),
        text: `DB ${hex(rom[pc], 2)}`,
      });
      pc += 1;
      continue;
    }

    rows.push({
      addr: pc,
      bytes: hexBytes(pc, inst.length),
      text: formatInst(inst),
      inst,
    });
    pc += inst.length;
  }

  return rows;
}

function printRows(rows, markAddr = null) {
  for (const row of rows) {
    const mark = row.addr === markAddr ? '  <<<' : '';
    console.log(`  ${hex(row.addr)}  ${row.bytes.padEnd(18)}  ${row.text}${mark}`);
  }
}

function printSection(title) {
  console.log(`\n${'='.repeat(88)}`);
  console.log(title);
  console.log('='.repeat(88));
}

// ─── Main ──────────────────────────────────────────────────────────────────────

function main() {
  const TABLE_START = 0x02912B;
  const entries = [];

  // ── Section 1: Parse the label table ──────────────────────────────────────

  printSection('SECTION 1: Length-prefixed entries (soft-key button labels)');

  let offset = TABLE_START;

  // Entry 0: length-prefixed "ESC"
  {
    const len = rom[offset];
    const text = safeStr(rom.subarray(offset + 1, offset + 1 + len));
    entries.push({ index: 0, addr: offset, format: `len=${len}`, text, size: 1 + len });
    offset += 1 + len;
  }

  // Entry 1: length-prefixed "OK"
  {
    const len = rom[offset];
    const text = safeStr(rom.subarray(offset + 1, offset + 1 + len));
    entries.push({ index: 1, addr: offset, format: `len=${len}`, text, size: 1 + len });
    offset += 1 + len;
  }

  for (const e of entries) {
    console.log(`  [${e.index}] offset +${(e.addr - TABLE_START).toString().padStart(3)}  ${hex(e.addr)}  ${e.format.padEnd(10)}  "${e.text}"`);
  }
  console.log(`\n  These two are the dialog soft-key labels (ESC = left, OK = right).`);
  console.log(`  Format: 1-byte length prefix, then ASCII chars, NO null terminator.`);

  // ── Section 2: Null-terminated entries ────────────────────────────────────

  printSection('SECTION 2: Null-terminated entries (mode/status labels)');

  let entryIndex = 2;
  while (offset < TABLE_START + 600) {
    if (rom[offset] === 0x00) {
      console.log(`\n  Double-null terminator at ${hex(offset)}`);
      break;
    }

    let end = offset;
    while (end < rom.length && rom[end] !== 0x00) {
      end += 1;
    }

    const text = safeStr(rom.subarray(offset, end));
    entries.push({ index: entryIndex, addr: offset, format: 'NUL-term', text, size: end - offset + 1 });
    console.log(`  [${entryIndex.toString().padStart(2)}] offset +${(offset - TABLE_START).toString().padStart(3)}  ${hex(offset)}  NUL-term    "${text}"`);
    offset = end + 1;
    entryIndex += 1;
  }

  const tableEnd = offset;
  const tableSize = tableEnd - TABLE_START;

  // ── Section 3: Table summary ──────────────────────────────────────────────

  printSection('SECTION 3: Table summary');
  console.log(`  Table start:  ${hex(TABLE_START)}`);
  console.log(`  Table end:    ${hex(tableEnd)} (double-null at ${hex(tableEnd - 1)}..${hex(tableEnd)})`);
  console.log(`  Total size:   ${tableSize} bytes`);
  console.log(`  Entry count:  ${entries.length}`);
  console.log(`  Format:       Mixed — 2 length-prefixed, then ${entries.length - 2} null-terminated`);

  // ── Section 4: Raw hex dump ───────────────────────────────────────────────

  printSection('SECTION 4: Raw hex dump of table');
  dumpRange(TABLE_START, tableEnd + 1);

  // ── Section 5: ROM references to table base ───────────────────────────────

  printSection('SECTION 5: ROM references to table base address');

  const baseRefs = findPattern([TABLE_START & 0xFF, (TABLE_START >> 8) & 0xFF, (TABLE_START >> 16) & 0xFF]);
  console.log(`\n  References to ${hex(TABLE_START)} (table base): ${baseRefs.length} hit(s)`);
  for (const hit of baseRefs) {
    console.log(`    at ${hex(hit)}`);
    printRows(disasmLinear(Math.max(0, hit - 4), 8));
    console.log('');
  }

  // ── Section 6: ROM references to individual entries ───────────────────────

  printSection('SECTION 6: ROM references to individual string entries');

  for (const entry of entries) {
    if (entry.addr === TABLE_START) continue; // already covered in section 5
    const pattern = [entry.addr & 0xFF, (entry.addr >> 8) & 0xFF, (entry.addr >> 16) & 0xFF];
    const refs = findPattern(pattern);
    if (refs.length === 0) {
      console.log(`\n  ${hex(entry.addr)} "${entry.text}": no direct references (reached by offset/fall-through)`);
      continue;
    }
    console.log(`\n  ${hex(entry.addr)} "${entry.text}": ${refs.length} reference(s)`);
    for (const hit of refs) {
      console.log(`    at ${hex(hit)}`);
    }
  }

  // ── Section 7: Soft-key setup code disassembly ────────────────────────────

  printSection('SECTION 7: Soft-key setup code at 0x028CC5');
  console.log('\n  This function loads "ESC" and "OK" as dialog soft-key labels:\n');
  printRows(disasmLinear(0x028CC5, 16));

  console.log('\n  Flow:');
  console.log('    1. RES 2,(IY+0x44)     — clear a dialog state flag');
  console.log('    2. LD HL, 0x02912B     — point to "ESC" label (3 bytes, length-prefixed)');
  console.log('    3. LD A, 0xCD          — key-code identifier for ESC action');
  console.log('    4. CALL 0x080244       — register the soft-key (checks flag, calls 0x02398E)');
  console.log('    5. CALL 0x08026A       — LDIR copy 27 bytes from HL to RAM at 0xD026EA');
  console.log('    6. Position at column 2 via CALL 0x0878B1');
  console.log('    7. Repeat for "OK" at 0x02912F, key-code 0xB1, column 128');

  // ── Section 8: Mode label selection code ──────────────────────────────────

  printSection('SECTION 8: Mode label selection code at 0x0296F8');
  console.log('\n  DEGREE/RADIAN angle mode selection:\n');
  printRows(disasmLinear(0x0296F0, 16));

  console.log('\n  ON/OFF toggle selection:\n');
  printRows(disasmLinear(0x029720, 10));

  console.log('\n  YES/NO confirmation selection:\n');
  printRows(disasmLinear(0x029774, 12));

  // ── Section 9: Mode settings data table ───────────────────────────────────

  printSection('SECTION 9: Mode settings data table at 0x028DC1');
  console.log('\n  18 fixed-size records (14 bytes each), delimited by 0xFB.');
  console.log('  Each record maps a mode-menu item to a string from the label table.');
  console.log('  Referenced from code at 0x028FB2.\n');

  const DATA_TABLE = 0x028DC1;
  const FB_POSITIONS = [];
  for (let addr = DATA_TABLE; addr < DATA_TABLE + 260; addr++) {
    if (rom[addr] === 0xFB) FB_POSITIONS.push(addr);
  }

  // First record (before first FB, 12 bytes)
  {
    const bytes = hexBytes(DATA_TABLE, 12);
    // Find pointer in this record
    let ptrStr = '(no match)';
    for (let j = DATA_TABLE; j < DATA_TABLE + 10; j++) {
      const ptr = rom[j] | (rom[j + 1] << 8) | (rom[j + 2] << 16);
      if (ptr >= 0x029130 && ptr <= 0x029320) {
        ptrStr = `${hex(ptr)} "${readCString(ptr)}"`;
        break;
      }
    }
    console.log(`  Pre-FB:  ${hex(DATA_TABLE)}  ${bytes}  -> ${ptrStr}`);
  }

  // FB-delimited records
  for (let i = 0; i < FB_POSITIONS.length; i++) {
    const fb = FB_POSITIONS[i];
    const len = 14;
    const bytes = hexBytes(fb, Math.min(len, rom.length - fb));
    let ptrStr = '(no match)';
    for (let j = fb; j < fb + 12; j++) {
      const ptr = rom[j] | (rom[j + 1] << 8) | (rom[j + 2] << 16);
      if (ptr >= 0x029130 && ptr <= 0x029320) {
        ptrStr = `${hex(ptr)} "${readCString(ptr)}"`;
        break;
      }
    }
    const id = rom[fb + 1];
    console.log(`  Rec ${i.toString().padStart(2)}:  ${hex(fb)}  ${bytes}  id=0x${id.toString(16).toUpperCase().padStart(2, '0')} -> ${ptrStr}`);
  }

  // ── Section 10: Continuation strings ──────────────────────────────────────

  printSection('SECTION 10: Continuation strings after table (0x291C5+)');
  console.log('  These are dialog/status messages sharing the ROM region, NOT soft-key labels.\n');

  let contOffset = tableEnd + 1;
  let contCount = 0;
  while (contOffset < 0x029320 && contCount < 25) {
    if (rom[contOffset] === 0x00) {
      contOffset += 1;
      continue;
    }
    let end = contOffset;
    while (end < rom.length && rom[end] !== 0x00) {
      end += 1;
    }
    if (end - contOffset >= 2) {
      const text = safeStr(rom.subarray(contOffset, end));
      // Only show if it looks like real text (majority printable)
      let printableCount = 0;
      for (let i = contOffset; i < end; i++) {
        if (isPrintable(rom[i])) printableCount++;
      }
      if (printableCount > (end - contOffset) * 0.6) {
        console.log(`  ${hex(contOffset)}  "${text}"`);
        contCount += 1;
      } else {
        break; // Hit non-text data, stop
      }
    }
    contOffset = end + 1;
  }

  // ── Section 11: Structural conclusions ────────────────────────────────────

  printSection('SECTION 11: Structural conclusions');
  console.log(`
  1. The soft-key label table at ${hex(TABLE_START)} is a MIXED-FORMAT string bank:
     - First 2 entries use length-prefix format (used by the dialog ESC/OK setup)
     - Remaining 14 entries use standard null-terminated format (used by mode menus)

  2. The length-prefix format (entries 0-1) is used specifically for the dialog
     soft-key rendering pipeline: LD HL -> CALL 0x080244 -> CALL 0x08026A (LDIR
     copy 27 bytes to RAM at 0xD026EA). The length byte tells the copier how many
     chars to render for the button label.

  3. The null-terminated entries (2-15) are referenced in two ways:
     a. DIRECT LD HL, <addr> in mode-menu code (0x0296F8+) for conditional
        label selection (e.g., RADIAN vs DEGREE based on angle mode flag)
     b. INDIRECT via the mode-settings data table at 0x028DC1 (18 records x 14
        bytes), which maps mode-menu positions to string pointers

  4. The table terminates with double-null at 0x291C3-0x291C4. After that,
     additional dialog/status strings continue (DISABLED, TRANSFER COMPLETE,
     CATALOG HELP, etc.) but these are separate from the soft-key system.

  5. Entries 8-15 (APPS-PROGRAMS-Pics-Images through TEST MODES) are longer
     dialog messages used in the test-mode/exam-mode lockdown flow, not
     traditional soft-key labels. Only entries 0-7 are true soft-key/mode labels.
`);

  console.log('Done.');
}

main();
