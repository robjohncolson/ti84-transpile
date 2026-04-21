#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ROM_PATH = path.join(__dirname, 'ROM.rom');
const MATRIX_PATH = path.join(__dirname, 'keyboard-matrix.md');
const REPORT_PATH = path.join(__dirname, 'phase25g-scancode-table-report.md');

const TABLE_ADDR = 0x09F79B;
const TABLE_SIZE = 228;
const SECTION_SIZE = 57;
const SECTION_NAMES = ['no_mod', '2nd', 'alpha', '2nd_alpha'];

function hex(value, width = 2) {
  return `0x${(Number(value) >>> 0).toString(16).padStart(width, '0')}`;
}

function sanitizeLabel(label) {
  return String(label)
    .replace(/\u00D7/g, 'x')
    .replace(/\u00F7/g, '/')
    .replace(/\u03B8/g, 'theta')
    .replace(/\u0398/g, 'THETA')
    .replace(/\u2192/g, '->')
    .replace(/\u00B2/g, '^2')
    .replace(/\u207B\u00B9/g, '^-1');
}

function parseKeyboardMatrix(markdown) {
  const groups = Array.from({ length: 7 }, () => Array(8).fill('(unused)'));
  let currentGroup = null;

  for (const line of markdown.split(/\r?\n/)) {
    const groupMatch = line.match(/^keyMatrix\[(\d+)\]/);

    if (groupMatch) {
      currentGroup = Number(groupMatch[1]);
      continue;
    }

    if (currentGroup === null || currentGroup > 6) {
      continue;
    }

    const bitPattern = /B(\d):\s*(.+?)(?=(?:\s+B\d:|$))/g;
    let bitMatch = bitPattern.exec(line);

    while (bitMatch) {
      groups[currentGroup][Number(bitMatch[1])] = sanitizeLabel(bitMatch[2].trim());
      bitMatch = bitPattern.exec(line);
    }
  }

  return groups;
}

function formatValue(value) {
  const base = hex(value, 2);

  if (value === 0x00) {
    return `${base} --`;
  }

  if (value >= 0x20 && value <= 0x7E) {
    return `${base} '${String.fromCharCode(value)}'`;
  }

  return base;
}

function describeEntry(index, keyMatrix) {
  if (index === 0) {
    return {
      tableIndex: index,
      scanCode: null,
      key: '(no key)',
    };
  }

  const flatIndex = index - 1;
  const groupIndex = flatIndex >> 3;
  const bitIndex = flatIndex & 0x07;

  return {
    tableIndex: index,
    scanCode: (groupIndex << 4) | bitIndex,
    key: keyMatrix[groupIndex]?.[bitIndex] ?? '(unused)',
  };
}

function buildReport(romBytes, keyMatrix) {
  const lines = [];

  lines.push('# Phase 25G Scan Code Translation Table');
  lines.push('');
  lines.push('Source: `ROM.rom` bytes `0x09F79B..0x09F87E` (228 bytes).');
  lines.push('');
  lines.push('- Table layout: 4 modifier sections x 57 entries');
  lines.push('- Entry `0x00` is the no-key slot');
  lines.push('- Entries `0x01..0x38` map to flattened key-matrix positions: `index = group * 8 + bit + 1`, raw scan code = `(group << 4) | bit`');
  lines.push('- Physical key labels come from `keyboard-matrix.md`');
  lines.push('');
  lines.push('| table_idx | scan_code | key | no_mod | 2nd | alpha | 2nd_alpha |');
  lines.push('|---:|---:|:---|:---|:---|:---|:---|');

  for (let index = 0; index < SECTION_SIZE; index += 1) {
    const entry = describeEntry(index, keyMatrix);
    const values = SECTION_NAMES.map((_, sectionIndex) => (
      romBytes[TABLE_ADDR + sectionIndex * SECTION_SIZE + index]
    ));

    lines.push(
      `| ${hex(entry.tableIndex, 2)} | ${entry.scanCode === null ? '--' : hex(entry.scanCode, 2)} | ${entry.key} | ${formatValue(values[0])} | ${formatValue(values[1])} | ${formatValue(values[2])} | ${formatValue(values[3])} |`,
    );
  }

  return lines.join('\n');
}

const romBytes = fs.readFileSync(ROM_PATH);
const keyboardMatrixMarkdown = fs.readFileSync(MATRIX_PATH, 'utf8');

if (romBytes.length < TABLE_ADDR + TABLE_SIZE) {
  throw new Error(`ROM too small for table at ${hex(TABLE_ADDR, 6)} (${romBytes.length} bytes)`);
}

const keyMatrix = parseKeyboardMatrix(keyboardMatrixMarkdown);
const report = buildReport(romBytes, keyMatrix);

fs.writeFileSync(REPORT_PATH, report, 'utf8');

console.log(report);
console.log('');
console.log(`Wrote ${path.basename(REPORT_PATH)}`);
