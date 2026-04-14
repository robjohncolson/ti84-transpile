#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { scanCodeToKeyCode } from './scancode-translate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const SHELL_PATH = path.join(__dirname, 'browser-shell.html');

const TABLE_ADDR = 0x09f79b;
const SECTION_SIZE = 57;
const SECTION_COUNT = 4;
const TOTAL_ENTRIES = SECTION_SIZE * SECTION_COUNT;

const KNOWN_MAPPINGS = [
  { scanCode: 0x31, modifier: 0, expected: 0x44, label: 'GRAPH -> D' },
  { scanCode: 0x09, modifier: 0, expected: 0x05, label: 'ENTER' },
  { scanCode: 0x15, modifier: 0, expected: 0xbb, label: 'TAN -> 0xBB' },
];

const REQUIRED_BROWSER_CODES = [
  { code: 'Digit0', expected: 0x21, label: '0' },
  { code: 'Digit1', expected: 0x22, label: '1' },
  { code: 'Digit2', expected: 0x1a, label: '2' },
  { code: 'Digit3', expected: 0x12, label: '3' },
  { code: 'Digit4', expected: 0x23, label: '4' },
  { code: 'Digit5', expected: 0x1b, label: '5' },
  { code: 'Digit6', expected: 0x13, label: '6' },
  { code: 'Digit7', expected: 0x24, label: '7' },
  { code: 'Digit8', expected: 0x1c, label: '8' },
  { code: 'Digit9', expected: 0x14, label: '9' },
  { code: 'ArrowDown', expected: 0x01, label: 'DOWN' },
  { code: 'ArrowLeft', expected: 0x02, label: 'LEFT' },
  { code: 'ArrowRight', expected: 0x03, label: 'RIGHT' },
  { code: 'ArrowUp', expected: 0x04, label: 'UP' },
  { code: 'Enter', expected: 0x09, label: 'ENTER' },
  { code: 'Escape', expected: 0x0f, label: 'CLEAR' },
];

function hex8(value) {
  return `0x${(value & 0xff).toString(16).padStart(2, '0')}`;
}

function formatMaybeByte(value) {
  if (value == null) {
    return '<missing>';
  }

  return hex8(value);
}

function validateTranslationTable() {
  if (!Array.isArray(scanCodeToKeyCode)) {
    throw new Error('scanCodeToKeyCode is not an array');
  }

  if (scanCodeToKeyCode.length !== SECTION_COUNT) {
    throw new Error(`scanCodeToKeyCode has ${scanCodeToKeyCode.length} sections, expected ${SECTION_COUNT}`);
  }

  for (let modifier = 0; modifier < SECTION_COUNT; modifier++) {
    const section = scanCodeToKeyCode[modifier];

    if (!Array.isArray(section)) {
      throw new Error(`scanCodeToKeyCode[${modifier}] is not an array`);
    }

    if (section.length !== SECTION_SIZE) {
      throw new Error(`scanCodeToKeyCode[${modifier}] has ${section.length} entries, expected ${SECTION_SIZE}`);
    }
  }
}

function loadRom() {
  const rom = readFileSync(ROM_PATH);
  const minLength = TABLE_ADDR + TOTAL_ENTRIES;

  if (rom.length < minLength) {
    throw new Error(`ROM.rom is too small for table read: need at least ${minLength} bytes, got ${rom.length}`);
  }

  return rom;
}

function compareRomTable(rom) {
  const mismatches = [];
  let matches = 0;

  for (let modifier = 0; modifier < SECTION_COUNT; modifier++) {
    for (let scanCode = 0; scanCode < SECTION_SIZE; scanCode++) {
      const romByte = rom[TABLE_ADDR + modifier * SECTION_SIZE + scanCode];
      const jsByte = scanCodeToKeyCode[modifier][scanCode];

      if (romByte === jsByte) {
        matches++;
        continue;
      }

      mismatches.push({ modifier, scanCode, romByte, jsByte });
    }
  }

  return { matches, mismatches };
}

function runSpotChecks() {
  const results = KNOWN_MAPPINGS.map(({ scanCode, modifier, expected, label }) => {
    const actual = scanCodeToKeyCode[modifier][scanCode];

    return {
      label,
      scanCode,
      modifier,
      expected,
      actual,
      ok: actual === expected,
    };
  });

  const passCount = results.filter((result) => result.ok).length;
  return {
    results,
    passCount,
    failCount: results.length - passCount,
  };
}

function parseBrowserScanCodeMap(source) {
  const match = source.match(/const\s+GETCSC_SCAN_CODE_BY_PC_CODE\s*=\s*Object\.freeze\(\{([\s\S]*?)\}\);/);

  if (!match) {
    throw new Error('Could not locate GETCSC_SCAN_CODE_BY_PC_CODE in browser-shell.html');
  }

  const entries = new Map();
  const body = match[1];
  const entryPattern = /^\s*([A-Za-z0-9]+):\s*(0x[0-9a-fA-F]+|\d+),?\s*$/gm;

  for (const entry of body.matchAll(entryPattern)) {
    entries.set(entry[1], Number(entry[2]));
  }

  if (entries.size === 0) {
    throw new Error('GETCSC_SCAN_CODE_BY_PC_CODE was found but no entries were parsed');
  }

  return entries;
}

function checkBrowserCoverage(entries) {
  const results = REQUIRED_BROWSER_CODES.map(({ code, expected, label }) => {
    const actual = entries.get(code);

    return {
      code,
      label,
      expected,
      actual,
      ok: actual === expected,
    };
  });

  const passCount = results.filter((result) => result.ok).length;
  return {
    mappedCount: entries.size,
    results,
    passCount,
    failCount: results.length - passCount,
  };
}

function printTableComparison(result) {
  console.log('Table comparison:');

  if (result.mismatches.length === 0) {
    console.log(`  PASS: ${result.matches}/${TOTAL_ENTRIES} entries match ROM bytes at 0x09F79B`);
    return;
  }

  console.log(`  FAIL: ${result.mismatches.length} mismatches out of ${TOTAL_ENTRIES} entries`);

  for (const mismatch of result.mismatches) {
    console.log(
      `  MISMATCH: mod=${mismatch.modifier} sc=${hex8(mismatch.scanCode)} ` +
      `ROM=${hex8(mismatch.romByte)} JS=${hex8(mismatch.jsByte)}`,
    );
  }
}

function printSpotChecks(result) {
  console.log('Spot checks:');

  for (const check of result.results) {
    console.log(
      `  ${check.ok ? 'PASS' : 'FAIL'}: ${check.label} ` +
      `(mod=${check.modifier}, sc=${hex8(check.scanCode)}) ` +
      `expected ${hex8(check.expected)}, got ${hex8(check.actual)}`,
    );
  }

  console.log(`  Summary: ${result.passCount}/${result.results.length} PASS`);
}

function printBrowserCoverage(result) {
  console.log('Browser-shell coverage:');
  console.log(`  GETCSC_SCAN_CODE_BY_PC_CODE entries: ${result.mappedCount}`);

  for (const check of result.results) {
    console.log(
      `  ${check.ok ? 'PASS' : 'FAIL'}: ${check.code} (${check.label}) ` +
      `expected ${hex8(check.expected)}, got ${formatMaybeByte(check.actual)}`,
    );
  }

  console.log(`  Main keys: ${result.passCount}/${result.results.length} present and correct`);
}

function main() {
  validateTranslationTable();

  const rom = loadRom();
  const shellSource = readFileSync(SHELL_PATH, 'utf8');

  const tableResult = compareRomTable(rom);
  const spotResult = runSpotChecks();
  const browserResult = checkBrowserCoverage(parseBrowserScanCodeMap(shellSource));

  console.log('Phase 148 - Scan-Code Translation End-to-End Probe');
  console.log('');

  printTableComparison(tableResult);
  console.log('');

  printSpotChecks(spotResult);
  console.log('');

  printBrowserCoverage(browserResult);
  console.log('');

  const passed =
    tableResult.mismatches.length === 0 &&
    spotResult.failCount === 0 &&
    browserResult.failCount === 0;

  console.log(`Overall: ${passed ? 'PASS' : 'FAIL'}`);
  process.exit(passed ? 0 : 1);
}

try {
  main();
} catch (error) {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
}
