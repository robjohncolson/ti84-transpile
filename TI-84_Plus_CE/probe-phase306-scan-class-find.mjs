#!/usr/bin/env node

/**
 * Phase 306 Probe: Find the scan-code-to-class conversion
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FINDINGS (2026-05-12)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * There is NO single "scan-code-to-class" function. The OS uses a TWO-STEP
 * pipeline to convert raw scan codes into behavioral classes:
 *
 * STEP 1: SCAN-CODE-TO-TOKEN TABLE LOOKUP
 *   Location: 0x02FF09–0x02FF16 (inline in the event loop at 0x02FD8F)
 *   Table:    0x09F79B (112 bytes, one byte per SDK scan code)
 *   Code:
 *     0x02FF09  LD D, 0x00
 *     0x02FF0B  PUSH DE
 *     0x02FF0C  LD HL, 0x000000
 *     0x02FF10  LD L, A           ; A = SDK scan code (from GetCSC)
 *     0x02FF11  LD DE, 0x09F79B   ; table base address
 *     0x02FF15  ADD HL, DE        ; HL = &table[scanCode]
 *     0x02FF16  CALL 0x022346     ; read entry, build token descriptor
 *
 *   The table maps SDK scan codes (skDown=0x01, sk2nd=0x36, etc.) to OS
 *   token values. For example:
 *     sk2 (0x1A) → token 0x90      skEnter (0x09) → token 0x05
 *     skAdd (0x0A) → token 0x80    skClear (0x0F) → token 0x09
 *     sk2nd (0x36) → token 0x00    skAlpha (0x30) → token 0x00
 *
 *   Modifier keys (2ND=0x36, ALPHA=0x30) map to token 0x00 and are
 *   intercepted BEFORE the table lookup at 0x02FEDF (CP 0x36) and
 *   0x02FEF3 (CP 0x30) — they set IY modifier flags instead.
 *
 * STEP 2: TOKEN-TO-CLASS CP CASCADE in CoorMon
 *   Location: 0x08C44D (CoorMon main key dispatch)
 *   After CoorMon gets the token in A (via 0x02FCB3 → event loop → table),
 *   it classifies it:
 *     0x08C44D  CP 0x7F       ; < 0x7F → JP C, 0x08C59B (normal token range)
 *     0x08C453  CP 0xFE       ; == 0xFE → special handling
 *     0x08C459  CP 0xFC       ; == 0xFC → special handling
 *     0x08C45F  CP 0xFA       ; == 0xFA → 2-byte token dispatch
 *     ...and at 0x08C59B for tokens < 0x7F:
 *     0x08C5A7  CP 0x27       ; < 0x27 → direct to cxMain handler
 *     0x08C5AD  CP 0x5A       ; 0x27-0x59 → further classification
 *     0x08C5B1  CP 0x75       ; 0x5A-0x74 → function key range
 *
 *   The home-screen cxMain handler at 0x058241 does FURTHER classification
 *   of the token via 0x058B73 (which checks CP 0x07 — tokens < 7 are
 *   navigation/control keys: UP/DOWN/LEFT/RIGHT/ENTER).
 *
 * SUMMARY OF THE FULL KEY PIPELINE:
 *   1. Keyboard ISR writes raw matrix scan code to D00587
 *   2. GetCSC (0x03FA09) converts matrix scan code to SDK scan code
 *   3. Event loop (0x02FD8F) intercepts modifier keys (2ND, ALPHA)
 *   4. Table at 0x09F79B converts SDK scan code → OS token (step at 0x02FF09)
 *   5. Token stored in D0058C (primary) and D0058E (secondary for 2-byte tokens)
 *   6. CoorMon (0x08C331) reads D0058C, classifies via CP cascade at 0x08C44D
 *   7. cxMain handler (e.g. 0x058241 for home screen) further classifies
 *
 * The "key class" concept from prior sessions corresponds to the token value
 * ranges checked by the CoorMon CP cascade, NOT a separate classification
 * number. The token IS the class — the OS uses range checks on the token
 * value to determine behavior.
 *
 * KEY ADDRESSES:
 *   0x09F79B — 112-byte scan-code-to-token table (the core mapping)
 *   0x02FF09 — table lookup code (inline in event loop)
 *   0x022346 — token descriptor builder (reads table entry, calls 0x0236F9)
 *   0x08C44D — CoorMon token classification cascade
 *   0x08C59B — CoorMon normal-token sub-cascade (tokens < 0x7F)
 *   0x058B73 — home-screen key class check (CP 0x07 for nav keys)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

process.emitWarning = () => {};

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeInstruction } from './ez80-decoder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rom = readFileSync(path.join(__dirname, 'ROM.rom'));

// ── Constants ──────────────────────────────────────────────────────────

const TABLE_BASE = 0x09F79B;
const TABLE_SIZE = 112; // 0x70 entries

const SDK_SCAN_CODES = {
  0x00: { name: 'skNone',     key: '(none)' },
  0x01: { name: 'skDown',     key: 'DOWN' },
  0x02: { name: 'skLeft',     key: 'LEFT' },
  0x03: { name: 'skRight',    key: 'RIGHT' },
  0x04: { name: 'skUp',       key: 'UP' },
  0x05: { name: 'sk??05',     key: '??' },
  0x09: { name: 'skEnter',    key: 'ENTER' },
  0x0A: { name: 'skAdd',      key: '+' },
  0x0B: { name: 'skSub',      key: '-' },
  0x0C: { name: 'skMul',      key: '*' },
  0x0D: { name: 'skDiv',      key: '/' },
  0x0E: { name: 'skPower',    key: '^' },
  0x0F: { name: 'skClear',    key: 'CLEAR' },
  0x11: { name: 'skChs',      key: '(-)' },
  0x12: { name: 'sk3',        key: '3' },
  0x13: { name: 'sk6',        key: '6' },
  0x14: { name: 'sk9',        key: '9' },
  0x15: { name: 'skRParen',   key: ')' },
  0x16: { name: 'skTan',      key: 'TAN' },
  0x17: { name: 'skVars',     key: 'VARS' },
  0x19: { name: 'skDecPnt',   key: '.' },
  0x1A: { name: 'sk2',        key: '2' },
  0x1B: { name: 'sk5',        key: '5' },
  0x1C: { name: 'sk8',        key: '8' },
  0x1D: { name: 'skLParen',   key: '(' },
  0x1E: { name: 'skCos',      key: 'COS' },
  0x1F: { name: 'skPrgm',     key: 'PRGM' },
  0x20: { name: 'skStat',     key: 'STAT' },
  0x21: { name: 'sk0',        key: '0' },
  0x22: { name: 'sk1',        key: '1' },
  0x23: { name: 'sk4',        key: '4' },
  0x24: { name: 'sk7',        key: '7' },
  0x25: { name: 'skComma',    key: ',' },
  0x26: { name: 'skSin',      key: 'SIN' },
  0x27: { name: 'skApps',     key: 'APPS' },
  0x28: { name: 'skGraphVar', key: 'X,T,0,n' },
  0x2A: { name: 'skSto',      key: 'STO>' },
  0x2B: { name: 'skLn',       key: 'LN' },
  0x2C: { name: 'skLog',      key: 'LOG' },
  0x2D: { name: 'skSquare',   key: 'x^2' },
  0x2E: { name: 'skRecip',    key: 'x^-1' },
  0x2F: { name: 'skMath',     key: 'MATH' },
  0x30: { name: 'skAlpha',    key: 'ALPHA' },
  0x31: { name: 'skGraph',    key: 'GRAPH' },
  0x32: { name: 'skTrace',    key: 'TRACE' },
  0x33: { name: 'skZoom',     key: 'ZOOM' },
  0x34: { name: 'skWindow',   key: 'WINDOW' },
  0x35: { name: 'skYequ',     key: 'Y=' },
  0x36: { name: 'sk2nd',      key: '2ND' },
  0x37: { name: 'skMode',     key: 'MODE' },
  0x38: { name: 'skDel',      key: 'DEL' },
};

// ── Helpers ────────────────────────────────────────────────────────────

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
    case 'alu-imm': return `${inst.op.toUpperCase()} ${hex(inst.value, 2)}`;
    case 'alu-reg': return `${inst.op.toUpperCase()} ${inst.src.toUpperCase()}`;
    case 'push': return `PUSH ${inst.pair.toUpperCase()}`;
    case 'pop': return `POP ${inst.pair.toUpperCase()}`;
    case 'ld-pair-mem': return `LD ${inst.pair.toUpperCase()}, (${hex(inst.addr)})`;
    case 'add-pair': return `ADD ${inst.dest.toUpperCase()}, ${inst.src.toUpperCase()}`;
    case 'ld-ind-reg': return `LD (${inst.dest.toUpperCase()}), ${inst.src.toUpperCase()}`;
    case 'ld-reg-ind': return `LD ${inst.dest.toUpperCase()}, (${inst.src.toUpperCase()})`;
    case 'jp-hl': return 'JP (HL)';
    default:
      if (inst.tag.startsWith('indexed-cb-')) {
        const op = inst.tag.replace('indexed-cb-', '').toUpperCase();
        return `${op} ${inst.bit}, (IY+${inst.displacement})`;
      }
      if (inst.tag === 'ld-reg-indexed')
        return `LD ${(inst.dest || '?').toUpperCase()}, (IY+${inst.displacement || 0})`;
      if (inst.tag === 'ld-indexed-reg')
        return `LD (IY+${inst.displacement || 0}), ${(inst.src || '?').toUpperCase()}`;
      return `[${inst.tag}]`;
  }
}

function disasmLinear(start, maxInstructions) {
  const lines = [];
  let pc = start;
  for (let i = 0; i < maxInstructions && pc < rom.length; i++) {
    const inst = disasmAt(pc);
    if (!inst || !inst.length) {
      lines.push({ addr: pc, bytes: bytesAt(pc, 1), text: `DB ${hex(rom[pc], 2)}` });
      pc += 1;
      continue;
    }
    lines.push({ addr: pc, bytes: bytesAt(pc, inst.length), text: formatInst(inst), inst });
    pc += inst.length;
    if (inst.tag === 'ret') break;
  }
  return lines;
}

function printDisasm(lines) {
  for (const line of lines) {
    console.log(`  ${hex(line.addr)}  ${line.bytes.padEnd(18)}  ${line.text}`);
  }
}

function printSection(title) {
  console.log(`\n${'='.repeat(88)}`);
  console.log(title);
  console.log('='.repeat(88));
}

// ════════════════════════════════════════════════════════════════════════
// SECTION 1: Dump the scan-code-to-token table at 0x09F79B
// ════════════════════════════════════════════════════════════════════════

printSection('SECTION 1: Scan-code-to-token table at 0x09F79B');

console.log(`\nTable base: ${hex(TABLE_BASE)}, size: ${TABLE_SIZE} bytes\n`);

// Classify tokens into behavioral groups based on CoorMon's CP cascade
function classifyToken(token) {
  if (token === 0x00) return 'MODIFIER/SPECIAL';
  if (token <= 0x04) return 'NAVIGATION';     // UP/DOWN/LEFT/RIGHT
  if (token === 0x05) return 'ENTER';
  if (token <= 0x09) return 'CONTROL';         // includes CLEAR (0x09)
  if (token < 0x27) return 'MENU/FUNCTION';    // MODE, PRGM, DEL, etc.
  if (token < 0x5A) return 'GRAPH/WINDOW';     // GRAPH, ZOOM, WINDOW, Y=, etc.
  if (token < 0x75) return 'EXTENDED-FUNC';    // function key range
  if (token < 0x7F) return 'UPPER-FUNC';       // upper function range
  if (token < 0xFA) return 'TOKEN-DIRECT';     // math operators, digits, etc.
  if (token === 0xFA) return '2BYTE-FA';       // 2-byte token prefix 0xFA
  if (token === 0xFB) return '2BYTE-FB';       // 2-byte token prefix 0xFB
  if (token === 0xFC) return '2BYTE-FC';       // 2-byte token prefix 0xFC
  if (token === 0xFE) return '2BYTE-FE';       // 2-byte token prefix 0xFE
  return 'OTHER';
}

console.log('  SC   SDK Name       Key        Token  Class');
console.log('  ──   ────────       ───        ─────  ─────');

for (let sc = 0; sc < TABLE_SIZE; sc++) {
  const token = rom[TABLE_BASE + sc];
  const info = SDK_SCAN_CODES[sc];
  if (token === 0 && !info) continue; // skip empty entries with no name

  const name = info ? info.name.padEnd(13) : '             ';
  const key = info ? info.key.padEnd(10) : '          ';
  const cls = classifyToken(token);
  console.log(`  ${hex(sc, 2)}   ${name}  ${key} ${hex(token, 2)}   ${cls}`);
}

// ════════════════════════════════════════════════════════════════════════
// SECTION 2: Disassemble the table lookup code at 0x02FF09
// ════════════════════════════════════════════════════════════════════════

printSection('SECTION 2: Table lookup code at 0x02FF09 (inline in event loop)');

console.log('\n  Context: event loop processes scan code returned by GetCSC.');
console.log('  Modifier keys (2ND=0x36, ALPHA=0x30) are intercepted at 0x02FEDF/0x02FEF3');
console.log('  before reaching this code.\n');

const lookupCode = disasmLinear(0x02FEDF, 25);
printDisasm(lookupCode);

// ════════════════════════════════════════════════════════════════════════
// SECTION 3: Disassemble the CoorMon token classification at 0x08C44D
// ════════════════════════════════════════════════════════════════════════

printSection('SECTION 3: CoorMon token classification at 0x08C44D');

console.log('\n  After token is stored in D0058C/D0058E, CoorMon reads it at 0x08C34F');
console.log('  and classifies via CP cascade starting at 0x08C44D:\n');

const coormonClassify = disasmLinear(0x08C44D, 40);
printDisasm(coormonClassify);

// ════════════════════════════════════════════════════════════════════════
// SECTION 4: CoorMon normal-token sub-cascade at 0x08C59B
// ════════════════════════════════════════════════════════════════════════

printSection('SECTION 4: CoorMon normal-token sub-cascade at 0x08C59B (tokens < 0x7F)');

const normalClassify = disasmLinear(0x08C59B, 30);
printDisasm(normalClassify);

// ════════════════════════════════════════════════════════════════════════
// SECTION 5: Home-screen key class check at 0x058B73
// ════════════════════════════════════════════════════════════════════════

printSection('SECTION 5: Home-screen key class check at 0x058B73');

console.log('\n  Called from home-screen cxMain handler (0x058241) to classify');
console.log('  tokens into nav/control (< 0x07) vs content keys:\n');

const homeClassify = disasmLinear(0x058B73, 10);
printDisasm(homeClassify);

// ════════════════════════════════════════════════════════════════════════
// SECTION 6: Verify table integrity — cross-reference known key mappings
// ════════════════════════════════════════════════════════════════════════

printSection('SECTION 6: Cross-reference verification');

const EXPECTED = [
  // [sdkScanCode, expectedToken, keyName]
  [0x09, 0x05, 'ENTER'],
  [0x0A, 0x80, '+'],
  [0x0B, 0x81, '-'],
  [0x0C, 0x82, '*'],
  [0x0D, 0x83, '/'],
  [0x21, 0x8E, '0'],
  [0x22, 0x8F, '1'],
  [0x1A, 0x90, '2'],
  [0x12, 0x91, '3'],
  [0x23, 0x92, '4'],
  [0x1B, 0x93, '5'],
  [0x13, 0x94, '6'],
  [0x24, 0x95, '7'],
  [0x1C, 0x96, '8'],
  [0x14, 0x97, '9'],
  [0x01, 0x04, 'DOWN'],
  [0x02, 0x02, 'LEFT'],
  [0x03, 0x01, 'RIGHT'],
  [0x04, 0x03, 'UP'],
  [0x0F, 0x09, 'CLEAR'],
  [0x36, 0x00, '2ND (modifier — handled before table)'],
  [0x30, 0x00, 'ALPHA (modifier — handled before table)'],
];

let pass = 0;
let fail = 0;

console.log('\n  Verifying known scan-code-to-token mappings:\n');

for (const [sc, expected, name] of EXPECTED) {
  const actual = rom[TABLE_BASE + sc];
  const ok = actual === expected;
  if (ok) pass++;
  else fail++;
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`  ${status}  SC ${hex(sc, 2)} (${name.padEnd(8)}) → expected ${hex(expected, 2)}, got ${hex(actual, 2)}`);
}

console.log(`\n  Results: ${pass}/${pass + fail} PASS`);

// ════════════════════════════════════════════════════════════════════════
// SECTION 7: Summary and class distribution
// ════════════════════════════════════════════════════════════════════════

printSection('SECTION 7: Summary');

const classCounts = {};
for (let sc = 0; sc < TABLE_SIZE; sc++) {
  const token = rom[TABLE_BASE + sc];
  if (token === 0 && !SDK_SCAN_CODES[sc]) continue;
  const cls = classifyToken(token);
  classCounts[cls] = (classCounts[cls] || 0) + 1;
}

console.log('\n  Token class distribution from the table:\n');
for (const [cls, count] of Object.entries(classCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${cls.padEnd(20)} ${count} keys`);
}

console.log('\n  Key pipeline addresses:\n');
console.log('    0x09F79B  Scan-code-to-token table (112 bytes)');
console.log('    0x02FF09  Table lookup (LD L,A / LD DE,0x09F79B / ADD HL,DE / CALL 0x022346)');
console.log('    0x02FEDF  2ND key intercept (CP 0x36)');
console.log('    0x02FEF3  ALPHA key intercept (CP 0x30)');
console.log('    0x022346  Token descriptor builder (reads byte, calls 0x0236F9)');
console.log('    0x08C331  CoorMon entry (reads D0058C)');
console.log('    0x08C44D  CoorMon token classifier (CP cascade: 0x7F/0xFE/0xFC/0xFA)');
console.log('    0x08C59B  CoorMon normal-token dispatch (CP cascade: 0x27/0x5A/0x75)');
console.log('    0x058241  Home-screen cxMain handler (further token classification)');
console.log('    0x058B73  Home key class gate (CP 0x07 — nav keys vs content)');

printSection('END OF PROBE');
