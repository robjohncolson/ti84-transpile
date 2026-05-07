#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PHASE230_PATH = path.join(__dirname, 'phase230-09f79b-full-table.json');
const PHASE186_PATH = path.join(__dirname, 'phase186-keytok-tables.json');

const phase230 = JSON.parse(fs.readFileSync(PHASE230_PATH, 'utf8'));
const phase186 = JSON.parse(fs.readFileSync(PHASE186_PATH, 'utf8'));

const PRIMARY_MIN = parseHex(phase186.primaryTable.keyCodeStart ?? '0x5A');
const SPECIAL_MIN = 0xE2;
const SPECIAL_MAX = 0xFB;

const directEnter = phase186.specialCases?.directEnter ?? null;
const directEnterCode = directEnter ? parseHex(directEnter.keyCode) : null;

const primaryMap = new Map(
  (phase186.primaryTable.entries ?? []).map((entry) => [parseHex(entry.keyCode), entry]),
);
const secondMap = buildIndexMap(expectSecondaryTable('0x05C1B0'));
const alphaMap = buildIndexMap(expectSecondaryTable('0x05C3AA'));
const alphaSecondMap = buildIndexMap(expectSecondaryTable('0x05C4A0'));

const sectionSpecs = [
  {
    key: 'noMod',
    label: 'No Modifier',
    tableLabel: 'primary 0x05BF84',
    resolver: resolvePrimaryRow,
  },
  {
    key: 'second',
    label: '2nd',
    tableLabel: '2nd override 0x05C1B0 (+ primary fallback)',
    resolver: resolveSecondRow,
  },
  {
    key: 'alpha',
    label: 'Alpha',
    tableLabel: 'alpha override 0x05C3AA (+ primary fallback)',
    resolver: resolveAlphaRow,
  },
  {
    key: 'alphaSecond',
    label: 'Alpha+2nd',
    tableLabel: 'alpha+2nd override 0x05C4A0 (+ primary fallback)',
    resolver: resolveAlphaSecondRow,
  },
];

function parseHex(value) {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
      return Number.parseInt(trimmed, 16);
    }
    return Number.parseInt(trimmed, 10);
  }

  return 0;
}

function hex(value, width = 2) {
  return `0x${(Number(value) >>> 0).toString(16).toUpperCase().padStart(width, '0')}`;
}

function byteHexNoPrefix(value) {
  return (parseHex(value) & 0xff).toString(16).toUpperCase().padStart(2, '0');
}

function wordHex(bytes) {
  return `0x${bytes.map((byte) => byteHexNoPrefix(byte)).join('')}`;
}

function cleanLabel(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function compactNames(names) {
  return (names ?? []).filter(Boolean).map(cleanLabel).join('+');
}

function expectSecondaryTable(address) {
  const table = (phase186.secondaryTables ?? []).find((entry) => entry.address === address);
  if (!table) {
    throw new Error(`Missing secondary table ${address} in ${path.basename(PHASE186_PATH)}.`);
  }
  return table;
}

function buildIndexMap(table) {
  return new Map((table.entries ?? []).map((entry) => [parseHex(entry.index), entry]));
}

function isSpecialPath(keyCode) {
  return keyCode >= SPECIAL_MIN && keyCode <= SPECIAL_MAX;
}

function pairIsNonZero(entry) {
  return !!entry && (entry.bytes ?? []).some((byte) => parseHex(byte) !== 0);
}

function primaryIsNonZero(entry) {
  return !!entry && parseHex(entry.tokenByte) !== 0;
}

function formatPrimaryToken(entry) {
  const token = cleanLabel(entry.tokenByte);
  const name = cleanLabel(entry.tokenName);
  return name ? `${token} ${name}` : token;
}

function formatDirectEnterToken(entry) {
  const token = cleanLabel(entry.tokenByte);
  const name = cleanLabel(entry.tokenName);
  return name ? `${token} ${name}` : token;
}

function formatPairToken(entry) {
  if (!entry) {
    return '0x0000';
  }

  const token = wordHex(entry.bytes ?? ['0x00', '0x00']);
  const names = compactNames(entry.byteNames);
  return names ? `${token} ${names}` : token;
}

function joinNotes(...parts) {
  return parts.filter(Boolean).join('; ');
}

function missingOrZeroNote(prefix, entry) {
  return entry
    ? `${prefix} entry is 0x0000`
    : `${prefix} index missing from dumped table`;
}

function makeBaseRow(sectionLabel, sourceEntry) {
  const keyCode = parseHex(sourceEntry.keyCode);
  return {
    section: sectionLabel,
    scanIndex: sourceEntry.index,
    scan: hex(sourceEntry.index),
    keyCode,
    keyCodeHex: hex(keyCode),
    keyName: cleanLabel(sourceEntry.name),
    lookup: '--',
    token: '--',
    status: '',
    notes: '',
    isValid: false,
    isSpecial: false,
    isMismatch: false,
  };
}

function resolvePrimaryRow(row) {
  const belowRange = row.keyCode < PRIMARY_MIN;

  if (directEnterCode !== null && row.keyCode === directEnterCode) {
    row.lookup = 'enter-special';
    row.token = formatDirectEnterToken(directEnter);
    row.status = 'ok-direct-enter';
    row.notes = joinNotes(`keyCode < ${hex(PRIMARY_MIN)}`, 'direct Enter special-case');
    row.isValid = true;
    return row;
  }

  row.lookup = 'primary';

  if (belowRange) {
    row.status = 'outside-range';
    row.notes = `keyCode < ${hex(PRIMARY_MIN)}`;
    return row;
  }

  const primaryEntry = primaryMap.get(row.keyCode);
  if (primaryIsNonZero(primaryEntry)) {
    row.token = formatPrimaryToken(primaryEntry);
    row.status = 'ok-primary';
    row.isValid = true;
    return row;
  }

  row.token = primaryEntry ? cleanLabel(primaryEntry.tokenByte) : '--';
  row.status = 'unmapped';
  row.notes = primaryEntry ? 'primary token is 0x00' : 'primary entry missing';
  row.isMismatch = true;
  return row;
}

function resolveSecondRow(row) {
  const belowRange = row.keyCode < PRIMARY_MIN;
  const secondEntry = secondMap.get(row.keyCode) ?? null;
  const primaryEntry = primaryMap.get(row.keyCode);

  row.lookup = `2nd[${hex(row.keyCode)}]`;

  if (pairIsNonZero(secondEntry)) {
    row.token = formatPairToken(secondEntry);
    row.status = 'ok-2nd';
    row.notes = belowRange ? `keyCode < ${hex(PRIMARY_MIN)}` : '';
    row.isValid = true;
    return row;
  }

  if (primaryIsNonZero(primaryEntry)) {
    row.lookup += '->primary';
    row.token = formatPrimaryToken(primaryEntry);
    row.status = 'fallback-primary';
    row.notes = joinNotes(
      missingOrZeroNote('2nd', secondEntry),
      belowRange ? `keyCode < ${hex(PRIMARY_MIN)}` : '',
    );
    row.isValid = true;
    return row;
  }

  if (belowRange) {
    row.status = 'outside-range';
    row.notes = joinNotes(
      missingOrZeroNote('2nd', secondEntry),
      `keyCode < ${hex(PRIMARY_MIN)}`,
    );
    return row;
  }

  row.token = secondEntry ? formatPairToken(secondEntry) : '--';
  row.status = 'unmapped';
  row.notes = joinNotes(
    missingOrZeroNote('2nd', secondEntry),
    primaryEntry ? 'primary token is 0x00' : 'primary entry missing',
  );
  row.isMismatch = true;
  return row;
}

function resolveAlphaRow(row) {
  const belowRange = row.keyCode < PRIMARY_MIN;
  const alphaIndex = row.keyCode >= 0x8C ? row.keyCode - 0x7F : row.keyCode;
  const alphaEntry = alphaMap.get(alphaIndex) ?? null;
  const primaryEntry = primaryMap.get(row.keyCode);
  const adjustNote =
    row.keyCode >= 0x8C ? `adjusted index ${hex(alphaIndex)} (= keyCode - 0x7F)` : '';

  row.lookup = `alpha[${hex(alphaIndex)}]`;

  if (pairIsNonZero(alphaEntry)) {
    row.token = formatPairToken(alphaEntry);
    row.status = 'ok-alpha';
    row.notes = joinNotes(adjustNote, belowRange ? `keyCode < ${hex(PRIMARY_MIN)}` : '');
    row.isValid = true;
    return row;
  }

  if (primaryIsNonZero(primaryEntry)) {
    row.lookup += '->primary';
    row.token = formatPrimaryToken(primaryEntry);
    row.status = 'fallback-primary';
    row.notes = joinNotes(
      missingOrZeroNote('alpha', alphaEntry),
      adjustNote,
      belowRange ? `keyCode < ${hex(PRIMARY_MIN)}` : '',
    );
    row.isValid = true;
    return row;
  }

  if (belowRange) {
    row.status = 'outside-range';
    row.notes = joinNotes(
      missingOrZeroNote('alpha', alphaEntry),
      adjustNote,
      `keyCode < ${hex(PRIMARY_MIN)}`,
    );
    return row;
  }

  row.token = alphaEntry ? formatPairToken(alphaEntry) : '--';
  row.status = 'unmapped';
  row.notes = joinNotes(
    missingOrZeroNote('alpha', alphaEntry),
    adjustNote,
    primaryEntry ? 'primary token is 0x00' : 'primary entry missing',
  );
  row.isMismatch = true;
  return row;
}

function resolveAlphaSecondRow(row) {
  const belowRange = row.keyCode < PRIMARY_MIN;
  const alphaSecondAllowed = row.keyCode < 0x44;
  const alphaSecondEntry = alphaSecondAllowed ? alphaSecondMap.get(row.keyCode) ?? null : null;
  const primaryEntry = primaryMap.get(row.keyCode);
  const alphaSecondNote = alphaSecondAllowed
    ? missingOrZeroNote('alpha+2nd', alphaSecondEntry)
    : '0xFA branch requires keyCode < 0x44';

  row.lookup = alphaSecondAllowed ? `alpha+2nd[${hex(row.keyCode)}]` : 'alpha+2nd[n/a]';

  if (pairIsNonZero(alphaSecondEntry)) {
    row.token = formatPairToken(alphaSecondEntry);
    row.status = 'ok-alpha+2nd';
    row.notes = belowRange ? `keyCode < ${hex(PRIMARY_MIN)}` : '';
    row.isValid = true;
    return row;
  }

  if (primaryIsNonZero(primaryEntry)) {
    row.lookup += '->primary';
    row.token = formatPrimaryToken(primaryEntry);
    row.status = 'fallback-primary';
    row.notes = joinNotes(alphaSecondNote, belowRange ? `keyCode < ${hex(PRIMARY_MIN)}` : '');
    row.isValid = true;
    return row;
  }

  if (belowRange) {
    row.status = 'outside-range';
    row.notes = joinNotes(alphaSecondNote, `keyCode < ${hex(PRIMARY_MIN)}`);
    return row;
  }

  row.token = alphaSecondEntry ? formatPairToken(alphaSecondEntry) : '--';
  row.status = 'unmapped';
  row.notes = joinNotes(
    alphaSecondNote,
    primaryEntry ? 'primary token is 0x00' : 'primary entry missing',
  );
  row.isMismatch = true;
  return row;
}

function analyzeSection(spec) {
  const sourceRows = phase230.sections?.[spec.key];
  if (!Array.isArray(sourceRows)) {
    throw new Error(`Missing 09F79B section "${spec.key}" in ${path.basename(PHASE230_PATH)}.`);
  }

  const rows = [];

  for (const sourceEntry of sourceRows) {
    const keyCode = parseHex(sourceEntry.keyCode);
    if (keyCode === 0) {
      continue;
    }

    const row = makeBaseRow(spec.label, sourceEntry);
    if (isSpecialPath(keyCode)) {
      row.status = 'special-path';
      row.notes = 'event-loop handled, not tokenized here';
      row.isSpecial = true;
      rows.push(row);
      continue;
    }

    rows.push(spec.resolver(row));
  }

  return {
    key: spec.key,
    label: spec.label,
    tableLabel: spec.tableLabel,
    rows,
  };
}

function sortHexStrings(values) {
  return [...values].sort((left, right) => parseHex(left) - parseHex(right));
}

function renderTable(rows, columns) {
  if (rows.length === 0) {
    console.log('(none)');
    return;
  }

  const prepared = rows.map((row) =>
    columns.map((column) => {
      const value = column.value(row);
      return value === '' ? '-' : String(value);
    }),
  );

  const widths = columns.map((column, columnIndex) =>
    Math.max(
      column.title.length,
      ...prepared.map((values) => values[columnIndex].length),
    ),
  );

  const header = columns
    .map((column, columnIndex) => column.title.padEnd(widths[columnIndex]))
    .join('  ');
  const divider = widths.map((width) => '-'.repeat(width)).join('  ');

  console.log(header);
  console.log(divider);

  for (const values of prepared) {
    console.log(values.map((value, columnIndex) => value.padEnd(widths[columnIndex])).join('  '));
  }
}

function printSection(report) {
  console.log(`\n=== ${report.label} (${report.tableLabel}) ===`);
  renderTable(report.rows, [
    { title: 'Scan', value: (row) => row.scan },
    { title: 'KeyCode', value: (row) => row.keyCodeHex },
    { title: 'Name', value: (row) => row.keyName },
    { title: 'Lookup', value: (row) => row.lookup },
    { title: 'Token', value: (row) => row.token },
    { title: 'Status', value: (row) => row.status },
    { title: 'Notes', value: (row) => row.notes },
  ]);
}

const sectionReports = sectionSpecs.map(analyzeSection);
const allRows = sectionReports.flatMap((report) => report.rows);

const checkedCount = allRows.length;
const validCount = allRows.filter((row) => row.isValid).length;
const specialRows = allRows.filter((row) => row.isSpecial);
const mismatchRows = allRows.filter((row) => row.isMismatch);
const outsideRangeRows = allRows.filter((row) => row.keyCode < PRIMARY_MIN);

const expectedChecked = phase230.stats?.totalNonZero ?? checkedCount;
const uniqueSpecialCodes = sortHexStrings(new Set(specialRows.map((row) => row.keyCodeHex)));
const uniqueOutsideRangeCodes = sortHexStrings(new Set(outsideRangeRows.map((row) => row.keyCodeHex)));

const sectionSummaryRows = sectionReports.map((report) => ({
  section: report.label,
  checked: report.rows.length,
  valid: report.rows.filter((row) => row.isValid).length,
  special: report.rows.filter((row) => row.isSpecial).length,
  unmapped: report.rows.filter((row) => row.isMismatch).length,
  belowRange: report.rows.filter((row) => row.keyCode < PRIMARY_MIN).length,
}));

console.log('Phase 231: 09F79B x ConvKeyToTok table cross-reference');
console.log('');
console.log(`Sources: ${path.basename(PHASE230_PATH)} and ${path.basename(PHASE186_PATH)}`);
console.log('Scope: pure JSON cross-reference, no ROM reads or CPU execution.');
console.log(
  'Coverage note: includes the 4th 09F79B section (Alpha+2nd) against 0x05C4A0 so all 188 non-zero entries are accounted for.',
);
console.log(
  'Assumption note: if a secondary-table index is absent from the phase186 JSON dump, it is treated as 0x0000 / no override.',
);
console.log(
  'Special-path note: 0xE2-0xFB entries are listed separately and excluded from mismatch counts per the phase231 brief.',
);

console.log('\n=== Overall Summary ===');
console.log(`Checked non-zero entries: ${checkedCount} (phase230 stats say ${expectedChecked})`);
console.log(`Valid token mappings:    ${validCount}`);
console.log(`Special-path entries:   ${specialRows.length} (${uniqueSpecialCodes.length} unique codes)`);
console.log(`Unmapped in-range rows: ${mismatchRows.length}`);
console.log(
  `Key codes below ${hex(PRIMARY_MIN)}: ${outsideRangeRows.length} (${uniqueOutsideRangeCodes.length} unique codes)`,
);

console.log('\n=== Per-Section Counts ===');
renderTable(sectionSummaryRows, [
  { title: 'Section', value: (row) => row.section },
  { title: 'Checked', value: (row) => row.checked },
  { title: 'Valid', value: (row) => row.valid },
  { title: 'Special', value: (row) => row.special },
  { title: 'Unmapped', value: (row) => row.unmapped },
  { title: '<0x5A', value: (row) => row.belowRange },
]);

console.log('\n=== Unmapped In-Range Rows ===');
renderTable(
  mismatchRows.map((row) => ({
    section: row.section,
    scan: row.scan,
    keyCode: row.keyCodeHex,
    name: row.keyName,
    lookup: row.lookup,
    token: row.token,
    notes: row.notes,
  })),
  [
    { title: 'Section', value: (row) => row.section },
    { title: 'Scan', value: (row) => row.scan },
    { title: 'KeyCode', value: (row) => row.keyCode },
    { title: 'Name', value: (row) => row.name },
    { title: 'Lookup', value: (row) => row.lookup },
    { title: 'Token', value: (row) => row.token },
    { title: 'Notes', value: (row) => row.notes },
  ],
);

console.log('\n=== Special-Path Entries (0xE2-0xFB) ===');
renderTable(
  specialRows.map((row) => ({
    section: row.section,
    scan: row.scan,
    keyCode: row.keyCodeHex,
    name: row.keyName,
  })),
  [
    { title: 'Section', value: (row) => row.section },
    { title: 'Scan', value: (row) => row.scan },
    { title: 'KeyCode', value: (row) => row.keyCode },
    { title: 'Name', value: (row) => row.name },
  ],
);

console.log('\n=== Outside Primary Range (<0x5A) ===');
console.log(uniqueOutsideRangeCodes.join(', '));

for (const report of sectionReports) {
  printSection(report);
}
