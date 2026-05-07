#!/usr/bin/env node

/**
 * Phase 235 — Investigate key code 0x44, BIT 4,(IY+0x4B), and replacement 0x1D (nnn)
 *
 * Session 234 decoded 0x0302EB as a gate that checks for key code 0x44:
 *   LD A,(HL)       — loads key code from table
 *   CP 0x44         — compare with 0x44
 *   non-0x44 → CP A (sets Z=1) → RET (normal processing)
 *   0x44 + BIT 4,(IY+0x4B) SET → LD A,0x1D → RET NZ (special handling)
 *   0x44 + BIT 4 CLEAR → RET Z (treated as normal)
 *
 * Questions:
 *   (1) What key does 0x44 represent?
 *   (2) What does BIT 4,(IY+0x4B) control?
 *   (3) What is 0x1D (the replacement code)?
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { createExecutor } from './cpu-runtime.js';
import { createPeripheralBus } from './peripherals.js';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');

const MEM_SIZE = 0x1000000;
const IY_BASE = 0xD00080;

// ---------- Helpers ----------

function hex(value, width = 6) {
  if (value === null || value === undefined || Number.isNaN(value)) return 'n/a';
  return '0x' + (Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0');
}

function hexByte(value) {
  return hex((value ?? 0) & 0xFF, 2);
}

// ---------- Main ----------

async function main() {
  if (!existsSync(ROM_PATH)) throw new Error('Missing ROM: ' + ROM_PATH);

  var romBytes = readFileSync(ROM_PATH);

  console.log('Phase 235: Investigate key code 0x44, BIT 4,(IY+0x4B), and replacement 0x1D');
  console.log('ROM: ' + path.basename(ROM_PATH) + ' (' + romBytes.length + ' bytes)');
  console.log('');

  // ===== PART A: Identify key code 0x44 in the 09F79B table =====
  console.log('========================================================================');
  console.log('PART A: Identify key code 0x44 in the 09F79B table');
  console.log('========================================================================');
  console.log('');

  var TABLE_BASE = 0x09F79B;
  var ENTRIES_PER_SECTION = 56;
  var TOTAL_ENTRIES = ENTRIES_PER_SECTION * 4; // no-mod, 2nd, alpha, alpha+2nd

  var sectionNames = ['no-mod (offset 0x00)', '2nd (offset 0x38)', 'alpha (offset 0x70)', 'alpha+2nd (offset 0xA8)'];

  console.log('Scanning 09F79B table (' + TOTAL_ENTRIES + ' entries, 4 sections of ' + ENTRIES_PER_SECTION + '):');
  console.log('');

  var found44 = [];
  var found1D = [];

  for (var section = 0; section < 4; section++) {
    var sectionOffset = section * ENTRIES_PER_SECTION;
    for (var i = 0; i < ENTRIES_PER_SECTION; i++) {
      var romAddr = TABLE_BASE + sectionOffset + i;
      var val = romBytes[romAddr];
      var scanCode = i; // within-section offset IS the scan code
      var group = (scanCode >> 4) & 0xF;
      var bit = scanCode & 0xF;

      if (val === 0x44) {
        found44.push({
          section: section,
          sectionName: sectionNames[section],
          offset: sectionOffset + i,
          romAddr: romAddr,
          scanCode: scanCode,
          group: group,
          bit: bit,
          value: val,
        });
      }
      if (val === 0x1D) {
        found1D.push({
          section: section,
          sectionName: sectionNames[section],
          offset: sectionOffset + i,
          romAddr: romAddr,
          scanCode: scanCode,
          group: group,
          bit: bit,
          value: val,
        });
      }
    }
  }

  console.log('  Entries with value 0x44:');
  if (found44.length === 0) {
    console.log('    NONE FOUND');
  } else {
    for (var fi = 0; fi < found44.length; fi++) {
      var f = found44[fi];
      console.log('    ROM ' + hex(f.romAddr) + ': section=' + f.sectionName +
        ' scanCode=' + hexByte(f.scanCode) + ' (group ' + f.group + ' bit ' + f.bit + ')');
    }
  }
  console.log('');

  console.log('  Entries with value 0x1D:');
  if (found1D.length === 0) {
    console.log('    NONE FOUND in 09F79B table');
  } else {
    for (var fi2 = 0; fi2 < found1D.length; fi2++) {
      var f2 = found1D[fi2];
      console.log('    ROM ' + hex(f2.romAddr) + ': section=' + f2.sectionName +
        ' scanCode=' + hexByte(f2.scanCode) + ' (group ' + f2.group + ' bit ' + f2.bit + ')');
    }
  }
  console.log('');

  // Also dump the full no-mod section for context
  console.log('  Full no-mod section (first 56 entries) for reference:');
  for (var ri = 0; ri < ENTRIES_PER_SECTION; ri++) {
    var rv = romBytes[TABLE_BASE + ri];
    var rGroup = (ri >> 4) & 0xF;
    var rBit = ri & 0xF;
    if (rv !== 0x00) {
      console.log('    [' + hexByte(ri) + '] group ' + rGroup + ' bit ' + rBit + ' -> ' + hexByte(rv) +
        (rv === 0x44 ? ' <-- KEY CODE 0x44' : '') +
        (rv === 0x1D ? ' <-- KEY CODE 0x1D' : ''));
    }
  }
  console.log('');

  // Check ConvKeyToTok table at 0x05BF84
  console.log('Scanning ConvKeyToTok table at 0x05BF84 (166 entries):');
  var CONV_TABLE = 0x05BF84;
  var CONV_ENTRIES = 166;
  var conv44 = [];
  var conv1D = [];

  for (var ci = 0; ci < CONV_ENTRIES; ci++) {
    var cv = romBytes[CONV_TABLE + ci];
    if (cv === 0x44) conv44.push({ offset: ci, romAddr: CONV_TABLE + ci });
    if (cv === 0x1D) conv1D.push({ offset: ci, romAddr: CONV_TABLE + ci });
  }

  console.log('  Entries with value 0x44: ' + conv44.length);
  for (var c4i = 0; c4i < conv44.length; c4i++) {
    console.log('    ROM ' + hex(conv44[c4i].romAddr) + ' offset=' + conv44[c4i].offset);
  }
  console.log('  Entries with value 0x1D: ' + conv1D.length);
  for (var c1i = 0; c1i < conv1D.length; c1i++) {
    console.log('    ROM ' + hex(conv1D[c1i].romAddr) + ' offset=' + conv1D[c1i].offset);
  }
  console.log('');

  // ===== PART B: Map BIT 4,(IY+0x4B) =====
  console.log('========================================================================');
  console.log('PART B: Map BIT 4,(IY+0x4B) — sites in ROM');
  console.log('========================================================================');
  console.log('');

  var IY_OFFSET = 0x4B;
  var IY_PLUS_4B = IY_BASE + IY_OFFSET; // 0xD000CB
  console.log('  IY+0x4B = IY base ' + hex(IY_BASE) + ' + 0x4B = ' + hex(IY_PLUS_4B));
  console.log('');

  // Search for BIT 4,(IY+0x4B): FD CB 4B 61
  // Search for SET 4,(IY+0x4B): FD CB 4B E1 (actually E5 for SET 4 — let me recalculate)
  // eZ80 CB prefix bit ops: BIT b,(IY+d) = FD CB dd (01 bbb 110) where bbb=bit
  //   BIT 4 -> 01 100 110 = 0x66... wait, let me be precise.
  // Actually for IY-prefixed CB instructions:
  //   BIT b,(IY+d): FD CB dd <op> where op = 0x46 + 8*b
  //     BIT 0: 0x46, BIT 1: 0x4E, BIT 2: 0x56, BIT 3: 0x5E, BIT 4: 0x66, BIT 5: 0x6E, BIT 6: 0x76, BIT 7: 0x7E
  //   RES b,(IY+d): FD CB dd <op> where op = 0x86 + 8*b
  //     RES 0: 0x86, RES 4: 0xA6
  //   SET b,(IY+d): FD CB dd <op> where op = 0xC6 + 8*b
  //     SET 0: 0xC6, SET 4: 0xE6

  // The task description says:
  //   SET 4,(IY+0x4B): bytes FD CB 4B E1
  //   RES 4,(IY+0x4B): bytes FD CB 4B A1
  //   BIT 4,(IY+0x4B): bytes FD CB 4B 61
  // Let me search for BOTH the task-specified bytes AND the standard encoding.

  // Standard Z80 encoding:
  //   BIT 4,(IY+0x4B): FD CB 4B 66
  //   RES 4,(IY+0x4B): FD CB 4B A6
  //   SET 4,(IY+0x4B): FD CB 4B E6
  // eZ80 might use slightly different encoding — search for both

  var searchPatterns = [
    { name: 'BIT 4,(IY+0x4B)', bytes: [0xFD, 0xCB, 0x4B, 0x66], type: 'tester' },
    { name: 'RES 4,(IY+0x4B)', bytes: [0xFD, 0xCB, 0x4B, 0xA6], type: 'clearer' },
    { name: 'SET 4,(IY+0x4B)', bytes: [0xFD, 0xCB, 0x4B, 0xE6], type: 'armer' },
    // Also try the encodings from the task description
    { name: 'BIT 4,(IY+0x4B) [alt]', bytes: [0xFD, 0xCB, 0x4B, 0x61], type: 'tester' },
    { name: 'RES 4,(IY+0x4B) [alt]', bytes: [0xFD, 0xCB, 0x4B, 0xA1], type: 'clearer' },
    { name: 'SET 4,(IY+0x4B) [alt]', bytes: [0xFD, 0xCB, 0x4B, 0xE1], type: 'armer' },
  ];

  var romSearchLimit = Math.min(romBytes.length, 0x400000);
  var allSites = [];

  for (var pi = 0; pi < searchPatterns.length; pi++) {
    var pat = searchPatterns[pi];
    var sites = [];
    for (var si = 0; si < romSearchLimit - pat.bytes.length; si++) {
      var match = true;
      for (var bi = 0; bi < pat.bytes.length; bi++) {
        if (romBytes[si + bi] !== pat.bytes[bi]) { match = false; break; }
      }
      if (match) {
        sites.push(si);
        allSites.push({ addr: si, name: pat.name, type: pat.type });
      }
    }
    console.log('  ' + pat.name + ' [' + pat.bytes.map(function(b) { return hexByte(b); }).join(' ') + ']: ' + sites.length + ' site(s)');
    for (var ssi = 0; ssi < sites.length; ssi++) {
      console.log('    ' + hex(sites[ssi]) + ' (' + pat.type + ')');
    }
  }
  console.log('');

  // Also search for any FD CB 4B xx (any operation on IY+0x4B)
  console.log('  All FD CB 4B xx patterns (any op on IY+0x4B):');
  var allIY4B = [];
  for (var ai = 0; ai < romSearchLimit - 3; ai++) {
    if (romBytes[ai] === 0xFD && romBytes[ai + 1] === 0xCB && romBytes[ai + 2] === 0x4B) {
      var opByte = romBytes[ai + 3];
      var opType = 'unknown';
      var opBit = -1;
      if (opByte >= 0x40 && opByte < 0x80) { opType = 'BIT'; opBit = (opByte - 0x40) >> 3; }
      else if (opByte >= 0x80 && opByte < 0xC0) { opType = 'RES'; opBit = (opByte - 0x80) >> 3; }
      else if (opByte >= 0xC0) { opType = 'SET'; opBit = (opByte - 0xC0) >> 3; }
      allIY4B.push({ addr: ai, opByte: opByte, opType: opType, opBit: opBit });
      console.log('    ' + hex(ai) + ': FD CB 4B ' + hexByte(opByte) + ' -> ' + opType + ' ' + opBit + ',(IY+0x4B)');
    }
  }
  console.log('  Total: ' + allIY4B.length + ' site(s)');
  console.log('');

  // Also search for direct references to 0xD000CB
  console.log('  Searching for direct LD references to ' + hex(IY_PLUS_4B) + ':');
  // 0xD000CB in little-endian = CB 00 D0
  var directRefs = [];
  for (var di = 0; di < romSearchLimit - 3; di++) {
    if (romBytes[di] === 0xCB && romBytes[di + 1] === 0x00 && romBytes[di + 2] === 0xD0) {
      // Check if preceded by a LD instruction opcode
      var prevByte = di > 0 ? romBytes[di - 1] : 0;
      directRefs.push({ addr: di - 1, prevByte: prevByte, addrOfLiteral: di });
    }
  }
  console.log('  Found ' + directRefs.length + ' occurrences of CB 00 D0 (LE encoding of 0xD000CB):');
  for (var dri = 0; dri < Math.min(directRefs.length, 20); dri++) {
    var dr = directRefs[dri];
    console.log('    ' + hex(dr.addrOfLiteral) + ' (prev byte: ' + hexByte(dr.prevByte) + ')');
  }
  console.log('');

  // ===== PART C: Identify key code 0x1D =====
  console.log('========================================================================');
  console.log('PART C: Identify key code 0x1D');
  console.log('========================================================================');
  console.log('');

  console.log('  0x1D = decimal 29');
  console.log('');

  // Already checked 09F79B and ConvKeyToTok above; summarize
  console.log('  09F79B table occurrences of 0x1D: ' + found1D.length);
  for (var f1i = 0; f1i < found1D.length; f1i++) {
    var f1 = found1D[f1i];
    console.log('    ' + f1.sectionName + ' scanCode=' + hexByte(f1.scanCode) + ' (group ' + f1.group + ' bit ' + f1.bit + ')');
  }
  console.log('');

  console.log('  ConvKeyToTok table occurrences of 0x1D: ' + conv1D.length);
  for (var c1i2 = 0; c1i2 < conv1D.length; c1i2++) {
    console.log('    offset=' + conv1D[c1i2].offset + ' ROM ' + hex(conv1D[c1i2].romAddr));
  }
  console.log('');

  // Search for CP 0x1D (FE 1D)
  console.log('  Searching for CP 0x1D (FE 1D) in ROM:');
  var cp1DSites = [];
  for (var c1s = 0; c1s < romSearchLimit - 1; c1s++) {
    if (romBytes[c1s] === 0xFE && romBytes[c1s + 1] === 0x1D) {
      cp1DSites.push(c1s);
    }
  }
  console.log('  Found ' + cp1DSites.length + ' site(s):');
  for (var c1si = 0; c1si < cp1DSites.length; c1si++) {
    // Show a few bytes of context around the CP instruction
    var addr = cp1DSites[c1si];
    var ctx = [];
    for (var ci2 = Math.max(0, addr - 4); ci2 < Math.min(romSearchLimit, addr + 6); ci2++) {
      ctx.push(romBytes[ci2].toString(16).toUpperCase().padStart(2, '0'));
    }
    console.log('    ' + hex(addr) + ': ' + ctx.join(' '));
  }
  console.log('');

  // Also search for LD A,0x1D (3E 1D)
  console.log('  Searching for LD A,0x1D (3E 1D) in ROM:');
  var ldA1DSites = [];
  for (var la = 0; la < romSearchLimit - 1; la++) {
    if (romBytes[la] === 0x3E && romBytes[la + 1] === 0x1D) {
      ldA1DSites.push(la);
    }
  }
  console.log('  Found ' + ldA1DSites.length + ' site(s):');
  for (var lai = 0; lai < ldA1DSites.length; lai++) {
    console.log('    ' + hex(ldA1DSites[lai]));
  }
  console.log('');

  // ===== PART D: Structured Results =====
  console.log('========================================================================');
  console.log('PART D: Structured Results');
  console.log('========================================================================');
  console.log('');

  // Keyboard matrix lookup for scan code
  var keyNames = {
    0x00: 'DOWN', 0x01: 'LEFT', 0x02: 'RIGHT', 0x03: 'UP',
    0x10: 'ENTER', 0x11: '+', 0x12: '-', 0x13: 'x', 0x14: '/', 0x15: '^', 0x16: 'CLEAR',
    0x20: '(-)', 0x21: '3', 0x22: '6', 0x23: '9', 0x24: ')', 0x25: 'TAN', 0x26: 'VARS',
    0x30: '.', 0x31: '2', 0x32: '5', 0x33: '8', 0x34: '(', 0x35: 'COS', 0x36: 'PRGM', 0x37: 'STAT',
    0x40: '0', 0x41: '1', 0x42: '4', 0x43: '7', 0x44: ',', 0x45: 'SIN', 0x46: 'APPS', 0x47: 'X,T,0,n',
    0x51: 'STO', 0x52: 'LN', 0x53: 'LOG', 0x54: 'x^2', 0x55: 'x^-1', 0x56: 'MATH', 0x57: 'ALPHA',
    0x60: 'GRAPH', 0x61: 'TRACE', 0x62: 'ZOOM', 0x63: 'WINDOW', 0x64: 'Y=', 0x65: '2ND', 0x66: 'MODE', 0x67: 'DEL',
  };

  console.log('  QUESTION 1: What key does scan code 0x44 represent?');
  console.log('    Scan code 0x44 = keyMatrix[4] bit 4 = COMMA (,) key');
  console.log('    This is the physical comma key on the calculator keypad.');
  console.log('');

  console.log('  QUESTION 1b: What does key code 0x44 in the 09F79B table mean?');
  console.log('    The 09F79B table maps scan codes to KEY CODES (not the same thing).');
  console.log('    Key code 0x44 appears at these positions in the table:');
  for (var r44i = 0; r44i < found44.length; r44i++) {
    var r44 = found44[r44i];
    var physKey = keyNames[r44.scanCode] || '???';
    console.log('      Section: ' + r44.sectionName + ', scanCode ' + hexByte(r44.scanCode) +
      ' (physical key: ' + physKey + ') -> key code 0x44');
  }
  if (found44.length === 0) {
    console.log('      Not found in 09F79B table — 0x44 may be generated elsewhere');
  }
  console.log('');

  console.log('  QUESTION 2: What does BIT 4,(IY+0x4B) control?');
  console.log('    IY+0x4B = ' + hex(IY_PLUS_4B) + ' (with IY=' + hex(IY_BASE) + ')');
  console.log('    Bit 4 of this byte is a mode flag.');
  console.log('');
  var bit4Sites = allIY4B.filter(function(s) { return s.opBit === 4; });
  var bit4SET = bit4Sites.filter(function(s) { return s.opType === 'SET'; });
  var bit4RES = bit4Sites.filter(function(s) { return s.opType === 'RES'; });
  var bit4BIT = bit4Sites.filter(function(s) { return s.opType === 'BIT'; });
  console.log('    SET sites (' + bit4SET.length + ' armers):');
  for (var s4i = 0; s4i < bit4SET.length; s4i++) console.log('      ' + hex(bit4SET[s4i].addr));
  console.log('    RES sites (' + bit4RES.length + ' clearers):');
  for (var r4i = 0; r4i < bit4RES.length; r4i++) console.log('      ' + hex(bit4RES[r4i].addr));
  console.log('    BIT sites (' + bit4BIT.length + ' testers):');
  for (var b4i = 0; b4i < bit4BIT.length; b4i++) console.log('      ' + hex(bit4BIT[b4i].addr));
  console.log('');

  // Also show ALL bits used on IY+0x4B
  console.log('    All bits used on IY+0x4B:');
  var bitUsage = {};
  for (var bui = 0; bui < allIY4B.length; bui++) {
    var s = allIY4B[bui];
    var key = s.opType + ' ' + s.opBit;
    if (!bitUsage[key]) bitUsage[key] = [];
    bitUsage[key].push(s.addr);
  }
  var buKeys = Object.keys(bitUsage).sort();
  for (var bk = 0; bk < buKeys.length; bk++) {
    console.log('      ' + buKeys[bk] + ': ' + bitUsage[buKeys[bk]].length + ' site(s) — ' +
      bitUsage[buKeys[bk]].map(function(a) { return hex(a); }).join(', '));
  }
  console.log('');

  console.log('  QUESTION 3: What is 0x1D (the replacement code)?');
  console.log('    0x1D = decimal 29');
  console.log('    In 09F79B table: ' + found1D.length + ' occurrence(s)');
  for (var f1d = 0; f1d < found1D.length; f1d++) {
    var fn = found1D[f1d];
    var physKey2 = keyNames[fn.scanCode] || '???';
    console.log('      Section: ' + fn.sectionName + ', scanCode ' + hexByte(fn.scanCode) +
      ' (physical key: ' + physKey2 + ')');
  }
  console.log('    In ConvKeyToTok table: ' + conv1D.length + ' occurrence(s)');
  console.log('    CP 0x1D sites in ROM: ' + cp1DSites.length);
  console.log('    LD A,0x1D sites in ROM: ' + ldA1DSites.length);
  console.log('');

  console.log('  SUMMARY:');
  console.log('    The 0x0302EB gate intercepts key code 0x44 from the 09F79B table.');
  console.log('    When BIT 4 of IY+0x4B (' + hex(IY_PLUS_4B) + ') is SET, it substitutes');
  console.log('    key code 0x1D and returns NZ, causing the caller to JP to 0x02FFED');
  console.log('    (special dispatch path) instead of normal key processing.');
  console.log('    When BIT 4 is CLEAR, the key passes through as normal.');
  console.log('');
}

await main();
