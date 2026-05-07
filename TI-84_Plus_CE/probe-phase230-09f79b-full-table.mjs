/**
 * probe-phase230-09f79b-full-table.mjs
 *
 * Maps the complete 4-section key-code lookup table at ROM 0x09F79B.
 * Each section has 56 entries (one byte each). The lookup formula is:
 *   offset = scanCode + (alpha ? 0x70 : 0) + (2nd ? 0x38 : 0)
 *
 * Sections:
 *   [0x00-0x37]  no modifier
 *   [0x38-0x6F]  2nd modifier
 *   [0x70-0xA7]  alpha modifier
 *   [0xA8-0xDF]  alpha+2nd modifier
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const romPath = path.join(__dirname, 'ROM.rom');

const rom = fs.readFileSync(romPath);
const TABLE_BASE = 0x09F79B;
const SECTION_SIZE = 56;
const SECTION_COUNT = 4;
const TOTAL = SECTION_SIZE * SECTION_COUNT; // 224

const raw = rom.subarray(TABLE_BASE, TABLE_BASE + TOTAL);

// ---------- human-readable key names ----------

const keyNames = {
  0x00: 'none',
  // Operators / punctuation
  0x80: '+',
  0x81: '-',
  0x82: '*',
  0x83: '/',
  0x84: '^',
  0x85: '(',
  0x86: ')',
  0x87: '.',
  0x88: '(-)',
  0x89: 'EE',
  // Digits 0-9
  0x8E: '0',
  0x8F: '1',
  0x90: '2',
  0x91: '3',
  0x92: '4',
  0x93: '5',
  0x94: '6',
  0x95: '7',
  0x96: '8',
  0x97: '9',
  // Letters A-Z  (0x9A..0xB3)
};
for (let i = 0; i < 26; i++) {
  keyNames[0x9A + i] = String.fromCharCode(65 + i); // A-Z
}

// Some well-known TI-OS key codes beyond the basic set
const extraNames = {
  0x01: 'kRight',
  0x02: 'kLeft',
  0x03: 'kUp',
  0x04: 'kDown',
  0x05: 'kEnter',
  0x06: 'kAlphaEnter',
  0x07: 'kAlphaUp',
  0x08: 'kAlphaDown',
  0x09: 'kClear',
  0x0A: 'kDel',
  0x0B: 'kIns',
  0x0C: 'kRecall',
  0x0D: 'kLastEnt',
  0x0E: 'kBOL',
  0x0F: 'kEOL',
  0x10: 'kSelAll',
  0x11: 'kUnselAll',
  0x12: 'kLtoTI82',
  0x13: 'kBackup',
  0x15: 'kRecvPrgm',
  0x16: 'kSendPrgm',
  0x17: 'kSendMsgOK',
  0x2B: 'kVarx',
  0x30: 'kPi',
  0x31: 'kInv',
  0x32: 'kSin',
  0x33: 'kASin',
  0x34: 'kCos',
  0x35: 'kACos',
  0x36: 'kTan',
  0x37: 'kATan',
  0x38: 'kSquare',
  0x39: 'kSqrt',
  0x3A: 'kLn',
  0x3B: 'kExp',
  0x3C: 'kLog',
  0x3D: 'kALog',
  0x40: 'kMath',
  0x41: 'kMatrix',
  0x42: 'kPrgm',
  0x43: 'kVars',
  0x44: 'kClrHome',
  0x45: 'kClrTable',
  0x46: 'kClrDrw',
  0x47: 'kClrList',
  0x48: 'kClrAll',
  0x4C: 'kApps',
  0x54: 'kGraph',
  0x55: 'kTrace',
  0x56: 'kZoom',
  0x57: 'kWindow',
  0x58: 'kYequ',
  0x59: 'k2nd',
  0x5A: 'kMode',
  0x5B: 'kDel2',
  0x64: 'kStat',
  0x65: 'kTable',
  0x66: 'kTblSet',
  0x67: 'kCalc',
  0x68: 'kFormat',
  0x69: 'kDisp',
  0x6A: 'kListName',
  0x6B: 'kFinance',
  0x6E: 'kComma',
  0x6F: 'kAns',
  0x70: 'kColon',
  0x71: 'kStore',
  0x72: 'kQuote',
  0x73: 'kLBrack',
  0x74: 'kRBrack',
  0x75: 'kLBrace',
  0x76: 'kRBrace',
  0x77: 'kConst',
  0x78: 'kConvert',
  0x7B: 'kAPostrophe',
  0x7C: 'kQuestn',
  0x7E: 'kSpace',
  0x8A: 'kChs',
  0x8B: 'kABel',
  0xE1: 'kCatalog',
  0xE2: 'kInputDone',
  0xE3: 'kQuit',
  0xE4: 'kLinkIO',
  0xE5: 'kMemMgmt',
  0xE6: 'kStatEd',
  0xFC: 'kExtApps',
  0xFD: 'kDraw',
  0xFE: 'kSPlot',
};

function nameFor(code) {
  if (keyNames[code] !== undefined) return keyNames[code];
  if (extraNames[code] !== undefined) return extraNames[code];
  return `0x${code.toString(16).toUpperCase().padStart(2, '0')}`;
}

// ---------- build section data ----------

const sectionLabels = ['noMod', 'second', 'alpha', 'alphaSecond'];
const sectionPretty = ['No Modifier', '2nd Modifier', 'Alpha Modifier', 'Alpha+2nd Modifier'];

const sections = {};
const nonZeroPerSection = [];
let totalNonZero = 0;
const specialPathCodes = new Set();
const verySpecialCodes = new Set();

for (let s = 0; s < SECTION_COUNT; s++) {
  const label = sectionLabels[s];
  const offset = s * SECTION_SIZE;
  const entries = [];
  let nonZero = 0;

  console.log(`\n=== Section ${s}: ${sectionPretty[s]} (offset 0x${offset.toString(16).toUpperCase()}) ===`);
  console.log('Idx  ScanCode  KeyCode  Name');
  console.log('---  --------  -------  ----');

  for (let i = 0; i < SECTION_SIZE; i++) {
    const keyCode = raw[offset + i];
    const hexCode = '0x' + keyCode.toString(16).toUpperCase().padStart(2, '0');
    const name = nameFor(keyCode);
    const scanHex = '0x' + i.toString(16).toUpperCase().padStart(2, '0');

    entries.push({ index: i, keyCode: hexCode, name });

    if (keyCode !== 0) {
      nonZero++;
      totalNonZero++;
    }
    if (keyCode >= 0xE2) specialPathCodes.add(hexCode);
    if (keyCode >= 0xFC) verySpecialCodes.add(hexCode);

    console.log(
      `${String(i).padStart(3)}  ${scanHex}      ${hexCode}     ${name}`
    );
  }

  sections[label] = entries;
  nonZeroPerSection.push(nonZero);
  console.log(`  Non-zero: ${nonZero}/${SECTION_SIZE}`);
}

// ---------- summary ----------

console.log('\n=== Summary ===');
console.log(`Total entries: ${TOTAL}`);
console.log(`Non-zero per section: [${nonZeroPerSection.join(', ')}]`);
console.log(`Total non-zero: ${totalNonZero}`);
console.log(`Special path codes (>=0xE2): ${[...specialPathCodes].sort().join(', ')}`);
console.log(`Very special codes  (>=0xFC): ${[...verySpecialCodes].sort().join(', ')}`);

// ---------- write JSON ----------

const output = {
  tableBase: '0x09F79B',
  sections,
  stats: {
    nonZeroPerSection,
    totalNonZero,
    specialPathCodes: [...specialPathCodes].sort(),
    verySpecialCodes: [...verySpecialCodes].sort(),
  },
};

const jsonPath = path.join(__dirname, 'phase230-09f79b-full-table.json');
fs.writeFileSync(jsonPath, JSON.stringify(output, null, 2));
console.log(`\nJSON written to ${jsonPath}`);
