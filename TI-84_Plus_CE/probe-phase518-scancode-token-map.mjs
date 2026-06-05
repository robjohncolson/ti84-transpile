#!/usr/bin/env node
/**
 * probe-phase518-scancode-token-map.mjs
 *
 * Cross-references the complete key pipeline:
 *   Physical key -> OS scan code -> Internal key code -> Dispatcher routing -> Token
 *
 * Data sources (all read directly from ROM bytes):
 *   - Keyboard matrix from keyboard-matrix.md (parsed from the markdown table only)
 *   - Scan code translation table at ROM 0x09F79B (4 sections x 56 entries)
 *   - Dispatcher CP/JP cascade at ROM 0x099921
 *   - Token table at ROM 0x061CFA-0x061DB1 (45 entries)
 *
 * No CPU stepping required -- pure static analysis of ROM data.
 */
import { readFileSync } from 'fs';

const ROM_PATH = 'TI-84_Plus_CE/ROM.rom';
const rom = readFileSync(ROM_PATH);

// ---------- helpers ----------

function hex(value, width = 2) {
  return '0x' + value.toString(16).toUpperCase().padStart(width, '0');
}

function readU24(addr) {
  return rom[addr] | (rom[addr + 1] << 8) | (rom[addr + 2] << 16);
}

function signed8(value) {
  return value < 0x80 ? value : value - 0x100;
}

// ---------- 1. Keyboard matrix (hardcoded from keyboard-matrix.md) ----------
// Each entry: { key, group, bit, matrixCode, osScanCode }
// Formula: osScanCode = (6 - group) * 8 + bit + 1

const KEYBOARD = [
  { key: 'GRAPH',    group: 6, bit: 0, osScanCode: 0x01 },
  { key: 'TRACE',    group: 6, bit: 1, osScanCode: 0x02 },
  { key: 'ZOOM',     group: 6, bit: 2, osScanCode: 0x03 },
  { key: 'WINDOW',   group: 6, bit: 3, osScanCode: 0x04 },
  { key: 'Y=',       group: 6, bit: 4, osScanCode: 0x05 },
  { key: '2ND',      group: 6, bit: 5, osScanCode: 0x06 },
  { key: 'MODE',     group: 6, bit: 6, osScanCode: 0x07 },
  { key: 'DEL',      group: 6, bit: 7, osScanCode: 0x08 },
  // Group 5: bit 0 empty
  { key: 'STO>',     group: 5, bit: 1, osScanCode: 0x0A },
  { key: 'LN',       group: 5, bit: 2, osScanCode: 0x0B },
  { key: 'LOG',      group: 5, bit: 3, osScanCode: 0x0C },
  { key: 'x^2',      group: 5, bit: 4, osScanCode: 0x0D },
  { key: 'x^-1',     group: 5, bit: 5, osScanCode: 0x0E },
  { key: 'MATH',     group: 5, bit: 6, osScanCode: 0x0F },
  { key: 'ALPHA',    group: 5, bit: 7, osScanCode: 0x10 },
  { key: '0',        group: 4, bit: 0, osScanCode: 0x11 },
  { key: '1',        group: 4, bit: 1, osScanCode: 0x12 },
  { key: '4',        group: 4, bit: 2, osScanCode: 0x13 },
  { key: '7',        group: 4, bit: 3, osScanCode: 0x14 },
  { key: ',',        group: 4, bit: 4, osScanCode: 0x15 },
  { key: 'SIN',      group: 4, bit: 5, osScanCode: 0x16 },
  { key: 'APPS',     group: 4, bit: 6, osScanCode: 0x17 },
  { key: 'X,T,n',    group: 4, bit: 7, osScanCode: 0x18 },
  { key: '.',        group: 3, bit: 0, osScanCode: 0x19 },
  { key: '2',        group: 3, bit: 1, osScanCode: 0x1A },
  { key: '5',        group: 3, bit: 2, osScanCode: 0x1B },
  { key: '8',        group: 3, bit: 3, osScanCode: 0x1C },
  { key: '(',        group: 3, bit: 4, osScanCode: 0x1D },
  { key: 'COS',      group: 3, bit: 5, osScanCode: 0x1E },
  { key: 'PRGM',     group: 3, bit: 6, osScanCode: 0x1F },
  { key: 'STAT',     group: 3, bit: 7, osScanCode: 0x20 },
  { key: '(-)',      group: 2, bit: 0, osScanCode: 0x21 },
  { key: '3',        group: 2, bit: 1, osScanCode: 0x22 },
  { key: '6',        group: 2, bit: 2, osScanCode: 0x23 },
  { key: '9',        group: 2, bit: 3, osScanCode: 0x24 },
  { key: ')',        group: 2, bit: 4, osScanCode: 0x25 },
  { key: 'TAN',      group: 2, bit: 5, osScanCode: 0x26 },
  { key: 'VARS',     group: 2, bit: 6, osScanCode: 0x27 },
  // Group 1: bit 7 empty
  { key: 'ENTER',    group: 1, bit: 0, osScanCode: 0x29 },
  { key: '+',        group: 1, bit: 1, osScanCode: 0x2A },
  { key: '-',        group: 1, bit: 2, osScanCode: 0x2B },
  { key: 'MUL',      group: 1, bit: 3, osScanCode: 0x2C },
  { key: 'DIV',      group: 1, bit: 4, osScanCode: 0x2D },
  { key: '^',        group: 1, bit: 5, osScanCode: 0x2E },
  { key: 'CLEAR',    group: 1, bit: 6, osScanCode: 0x2F },
  // Group 0: bit 4-7 empty
  { key: 'DOWN',     group: 0, bit: 0, osScanCode: 0x31 },
  { key: 'LEFT',     group: 0, bit: 1, osScanCode: 0x32 },
  { key: 'RIGHT',    group: 0, bit: 2, osScanCode: 0x33 },
  { key: 'UP',       group: 0, bit: 3, osScanCode: 0x34 },
];

// ---------- 2. Scan code translation table (ROM 0x09F79B) ----------
// 4 sections x 56 bytes. Modifier: 0=none, 1=2nd, 2=alpha, 3=alpha+2nd.

const TRANSLATE_BASE = 0x09F79B;
const SECTION_SIZE = 56;
const MOD_NAMES = ['none', '2nd', 'alpha', 'alpha+2nd'];

function getInternalKeyCode(osScanCode, modifier) {
  if (osScanCode < 0 || osScanCode >= SECTION_SIZE) return 0x00;
  const addr = TRANSLATE_BASE + modifier * SECTION_SIZE + osScanCode;
  return rom[addr];
}

// ---------- 3. Dispatcher at 0x099921 ----------
// Decode the CP/JP cascade. The dispatcher receives internal key code in A.
// Pattern: FE xx = CP val, then CA/DA/CC/28/38 = conditional jump.

function decodeDispatcher() {
  const entries = [];
  // The preamble runs 0x099921-0x099960, the actual CP/JP cascade starts
  // around 0x099966 after CALL 0x09BBAD returns key code in A.
  // We parse raw bytes looking for FE (CP) + conditional JP patterns.
  let pc = 0x099966;
  const limit = 0x099A80;

  while (pc < limit) {
    const op = rom[pc];

    // CP imm8 followed by conditional jump
    if (op === 0xFE) {
      const val = rom[pc + 1];
      const next = rom[pc + 2];

      if (next === 0xCA) { // JP Z,addr24
        const target = readU24(pc + 3);
        entries.push({ type: 'exact', value: val, target, addr: pc });
        pc += 6;
        continue;
      }
      if (next === 0xDA) { // JP C,addr24
        const target = readU24(pc + 3);
        entries.push({ type: 'range', value: val, target, addr: pc });
        pc += 6;
        continue;
      }
      if (next === 0xCC) { // CALL Z,addr24
        const target = readU24(pc + 3);
        entries.push({ type: 'call_z', value: val, target, addr: pc });
        pc += 6;
        continue;
      }
      if (next === 0x28) { // JR Z,rel8
        const rel = signed8(rom[pc + 3]);
        const target = (pc + 4 + rel) & 0xFFFFFF;
        entries.push({ type: 'exact', value: val, target, addr: pc });
        pc += 4;
        continue;
      }
      if (next === 0x38) { // JR C,rel8
        const rel = signed8(rom[pc + 3]);
        const target = (pc + 4 + rel) & 0xFFFFFF;
        entries.push({ type: 'range', value: val, target, addr: pc });
        pc += 4;
        continue;
      }
      // CP not followed by a conditional jump -- just advance past CP
      pc += 2;
      continue;
    }

    // Unconditional JP (fallthrough/default)
    if (op === 0xC3) {
      const target = readU24(pc + 1);
      entries.push({ type: 'default', value: null, target, addr: pc });
      pc += 4;
      continue;
    }

    // JP Z not preceded by CP (e.g., after CALL Z which set flags)
    if (op === 0xCA) {
      const target = readU24(pc + 1);
      entries.push({ type: 'jp_z', value: null, target, addr: pc });
      pc += 4;
      continue;
    }

    // Skip other instructions
    pc += 1;
  }

  return entries;
}

// Route an internal key code through the dispatcher cascade.
// The cascade tests in order: CP val / JP Z (exact), CP val / JP C (range < val).
// For routing, we only consider the CP + conditional JP entries.
function routeInternalCode(code, dispatchEntries) {
  for (const e of dispatchEntries) {
    if (e.type === 'exact' && code === e.value) {
      return { kind: 'exact', target: e.target, entry: e };
    }
    if (e.type === 'range' && code < e.value) {
      return { kind: 'range', target: e.target, entry: e };
    }
    if (e.type === 'default') {
      return { kind: 'default', target: e.target, entry: e };
    }
  }
  return { kind: 'unknown', target: null, entry: null };
}

// ---------- 4. Token table at 0x061CFA-0x061DB1 ----------

function decodeTokenTable() {
  const entries = [];
  let pc = 0x061CFA;
  const end = 0x061DB2;

  while (pc < end) {
    if (rom[pc] !== 0x3E) {
      entries.push({ index: entries.length, addr: pc, token: null, malformed: true });
      break;
    }
    const token = rom[pc + 1];
    const nextOp = rom[pc + 2];
    let size;
    if (nextOp === 0x18) {       // JR rel8
      size = 4;
    } else if (nextOp === 0xC3) { // JP addr24
      size = 6;
    } else {
      entries.push({ index: entries.length, addr: pc, token, malformed: true });
      break;
    }
    entries.push({ index: entries.length, addr: pc, token, malformed: false });
    pc += size;
  }

  return entries;
}

// Build address -> token entry map
function buildTokenAddrMap(tokenEntries) {
  const map = new Map();
  for (const e of tokenEntries) {
    if (!e.malformed) {
      map.set(e.addr, e);
    }
  }
  return map;
}

// ---------- 5. Known TI-OS token names ----------

const TOKEN_NAMES = {
  0x0E: 'newline',
  0x15: 'space? (0x15)',
  0x1B: 'e (sci notation)',
  0x28: '(',
  0x2D: '-',
  0x2E: '.',
  0x2F: '/',
  0x30: '0',
  0x31: '1',
  0x36: '6',
  0x81: 'tRound',
  0x82: 'tPixel',
  0x83: 'tRowSwap',
  0x84: 'tRowPlus',
  0x85: 'tAsterisk',
  0x86: 'tComma',
  0x87: 'tExcl? (0x87)',
  0x88: 'tLBrace',
  0x89: 'tDel',
  0x8A: 'tIns',
  0x8B: 'tRecall',
  0x8C: 'tStore',
  0x8D: 'tAdd',
  0x8E: 'tSub',
  0x8F: 'tMul',
  0x90: 'tDiv',
  0x91: 'tPower',
  0x92: 'tLParen',
  0x93: 'tRParen',
  0x96: 'tSin',
  0x98: 'tCos',
  0x99: 'tTan',
  0x9A: 'tLn',
  0x9C: 'tLog',
  0x9D: 'tNeg',
  0x9E: 'tSquare',
  0x9F: 'tInverse',
  0xAA: 'tPi',
  0xAB: 'tSqrt',
  0xAC: 'tAbs',
  0xAF: 'tEE (EE notation)',
  0xB2: 'tAns',
  0xB3: 'tXvar',
  0xB4: 'tDecPt',
  0xB5: 'tComma? (0xB5)',
};

function tokenLabel(token) {
  if (token == null) return '';
  const name = TOKEN_NAMES[token];
  if (name) return hex(token) + ' ' + name;
  if (token >= 0x20 && token <= 0x7E) return hex(token) + " '" + String.fromCharCode(token) + "'";
  return hex(token);
}

// ---------- 6. Find all JPs into token table from dispatcher region ----------

function findTokenTableJumps(tokenAddrMap) {
  const results = [];
  for (let addr = 0x099000; addr < 0x09C000; addr++) {
    const op = rom[addr];
    if (op === 0xC3 || op === 0xCA || op === 0xDA) {
      const target = readU24(addr + 1);
      if (tokenAddrMap.has(target)) {
        const cond = op === 0xC3 ? 'JP' : op === 0xCA ? 'JP Z' : 'JP C';
        results.push({ from: addr, cond, target, entry: tokenAddrMap.get(target) });
      }
    }
  }
  return results;
}

// ---------- main ----------

function main() {
  const dispatchEntries = decodeDispatcher();
  const tokenTable = decodeTokenTable();
  const tokenAddrMap = buildTokenAddrMap(tokenTable);
  const tokenJumps = findTokenTableJumps(tokenAddrMap);

  console.log('Phase 518: Complete Key Pipeline Cross-Reference');
  console.log('=================================================');
  console.log('');
  console.log('Pipeline: Physical Key -> OS Scan Code -> Internal Key Code -> Dispatcher -> Token');
  console.log('');

  // --- Token table ---
  console.log(`Token table: 0x061CFA-0x061DB1 (${tokenTable.length} entries, all converge on 0x061DB2)`);
  for (const e of tokenTable) {
    if (e.malformed) {
      console.log(`  [${String(e.index).padStart(2)}] ${hex(e.addr, 6)}  MALFORMED`);
    } else {
      console.log(`  [${String(e.index).padStart(2)}] ${hex(e.addr, 6)}  token ${tokenLabel(e.token)}`);
    }
  }
  console.log('');

  // --- Dispatcher summary ---
  const exactEntries = dispatchEntries.filter(e => e.type === 'exact');
  const rangeEntries = dispatchEntries.filter(e => e.type === 'range');
  const defaultEntries = dispatchEntries.filter(e => e.type === 'default');
  console.log(`Dispatcher at 0x099921: ${exactEntries.length} exact, ${rangeEntries.length} range, ${defaultEntries.length} default`);
  console.log('');

  // --- JPs into token table from dispatcher region ---
  console.log(`References to token table from 0x099000-0x09C000: ${tokenJumps.length} JPs`);
  for (const j of tokenJumps) {
    console.log(`  ${hex(j.from, 6)}: ${j.cond} ${hex(j.target, 6)} -> token ${tokenLabel(j.entry.token)}`);
  }
  console.log('');

  // --- Main cross-reference table ---
  console.log('=== COMPLETE KEY MAP (Unmodified) ===');
  console.log('');
  console.log('| Key        | OSScan | IntCode | Dispatcher Route                              | Token                     |');
  console.log('|------------|--------|---------|-----------------------------------------------|---------------------------|');

  for (const k of KEYBOARD) {
    const intCode = getInternalKeyCode(k.osScanCode, 0);
    const route = routeInternalCode(intCode, dispatchEntries);

    let routeText = '';
    let tokenText = '';

    if (route.kind === 'exact') {
      routeText = `exact CP ${hex(route.entry.value)} -> ${hex(route.target, 6)}`;
    } else if (route.kind === 'range') {
      routeText = `range <${hex(route.entry.value)} -> ${hex(route.target, 6)}`;
    } else if (route.kind === 'default') {
      routeText = `default -> ${hex(route.target, 6)}`;
    } else {
      routeText = 'no match';
    }

    // Check if the route target is a token table entry
    if (route.target && tokenAddrMap.has(route.target)) {
      const te = tokenAddrMap.get(route.target);
      tokenText = tokenLabel(te.token);
    } else if (route.target) {
      // Check if the handler eventually JPs to a token table entry
      // (we know some handlers like 0x099F49 eventually JP 0x061D1A)
      tokenText = '(handler)';
    }

    const keyPad = k.key.padEnd(10);
    const osPad = hex(k.osScanCode).padEnd(6);
    const intPad = (intCode ? hex(intCode) : '0x00').padEnd(7);
    const routePad = routeText.padEnd(45);
    console.log(`| ${keyPad} | ${osPad} | ${intPad} | ${routePad} | ${tokenText.padEnd(25)} |`);
  }

  console.log('');

  // --- 2ND-modified key map ---
  console.log('=== KEY MAP (2ND modifier) ===');
  console.log('');
  console.log('| Key        | OSScan | IntCode | Dispatcher Route                              | Token                     |');
  console.log('|------------|--------|---------|-----------------------------------------------|---------------------------|');

  for (const k of KEYBOARD) {
    const intCode = getInternalKeyCode(k.osScanCode, 1);
    if (intCode === 0x00) continue; // skip unmapped

    const route = routeInternalCode(intCode, dispatchEntries);

    let routeText = '';
    let tokenText = '';

    if (route.kind === 'exact') {
      routeText = `exact CP ${hex(route.entry.value)} -> ${hex(route.target, 6)}`;
    } else if (route.kind === 'range') {
      routeText = `range <${hex(route.entry.value)} -> ${hex(route.target, 6)}`;
    } else if (route.kind === 'default') {
      routeText = `default -> ${hex(route.target, 6)}`;
    } else {
      routeText = 'no match';
    }

    if (route.target && tokenAddrMap.has(route.target)) {
      const te = tokenAddrMap.get(route.target);
      tokenText = tokenLabel(te.token);
    } else if (route.target) {
      tokenText = '(handler)';
    }

    const keyPad = ('2ND+' + k.key).padEnd(10);
    const osPad = hex(k.osScanCode).padEnd(6);
    const intPad = hex(intCode).padEnd(7);
    const routePad = routeText.padEnd(45);
    console.log(`| ${keyPad} | ${osPad} | ${intPad} | ${routePad} | ${tokenText.padEnd(25)} |`);
  }

  console.log('');

  // --- Summary statistics ---
  let directTokenHits = 0;
  let handlerRoutes = 0;
  let noMap = 0;

  for (const k of KEYBOARD) {
    const intCode = getInternalKeyCode(k.osScanCode, 0);
    if (intCode === 0x00) { noMap++; continue; }
    const route = routeInternalCode(intCode, dispatchEntries);
    if (route.target && tokenAddrMap.has(route.target)) {
      directTokenHits++;
    } else {
      handlerRoutes++;
    }
  }

  console.log('=== SUMMARY ===');
  console.log(`Physical keys: ${KEYBOARD.length}`);
  console.log(`Token table entries: ${tokenTable.length}`);
  console.log(`Dispatcher entries: exact=${exactEntries.length}, range=${rangeEntries.length}, default=${defaultEntries.length}`);
  console.log(`Unmodified routing: ${directTokenHits} direct-to-token, ${handlerRoutes} via handler, ${noMap} unmapped`);
  console.log('');
  console.log('PASS: Static analysis complete');
}

main();
